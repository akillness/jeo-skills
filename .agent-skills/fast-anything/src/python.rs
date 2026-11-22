//! Python backend: profile with cProfile, record real calls, scaffold a PyO3 crate, build it,
//! replay the recordings against it, and swap it in with a small reversible shim.

use crate::backend::{self, Profile, Recording};
use crate::hotspot::Hotspot;
use crate::state::{Ctx, Port, Verify};
use crate::util::{combined, forward_slashes, output, relative, tail};
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

const RUNNER: &str = include_str!("python/runner.py");
const PYO3: &str = "0.30";
pub const DISABLE_ENV: &str = "FAST_ANYTHING_DISABLE";

pub fn is_python(program: &str) -> bool {
    let stem = crate::util::program_stem(program);
    stem == "py" || stem.starts_with("python") || stem.starts_with("pypy")
}

/// Tools that run a command inside a project's virtualenv: `uv run app.py`, `poetry run python app.py`.
const ENV_RUNNERS: &[&str] = &["uv", "poetry", "pipenv", "pdm", "hatch", "rye"];

/// `uv run [python] app.py ...` (and the other ENV_RUNNERS) as `<the env's python> app.py ...`, so
/// every later run uses the same interpreter and packages. `query` runs the runner's own python
/// and returns what it prints. None when the command doesn't start with a runner.
pub fn unwrap_env_runner(command: &[String], query: impl Fn(&[&str]) -> Result<String>) -> Result<Option<Vec<String>>> {
    let runner = crate::util::program_stem(command.first().map(String::as_str).unwrap_or_default());
    if !ENV_RUNNERS.contains(&runner.as_str()) || command.get(1).map(String::as_str) != Some("run") {
        return Ok(None);
    }
    let mut rest = &command[2..];
    if rest.first().is_some_and(|a| is_python(a)) {
        rest = &rest[1..];
    }
    let shown = command[..2].join(" ");
    match rest.first().map(String::as_str) {
        None => bail!("name the script after {shown}, e.g.  fast-anything scan -- {shown} app.py"),
        Some(a) if a.starts_with('-') && a != "-m" => bail!(
            "fast-anything can't pass options to {shown}. Get its interpreter with  {shown} python -c \"import sys; print(sys.executable)\"  and scan with that: fast-anything scan -- <that python> app.py"
        ),
        Some(a) if a != "-m" && !a.ends_with(".py") => bail!(
            "{a} isn't a .py script. Run the code it starts as  {shown} python -m <module>  or  {shown} python <script>.py"
        ),
        _ => {}
    }
    let mut ask = command[..2].iter().map(String::as_str).collect::<Vec<_>>();
    ask.extend(["python", "-c", "import sys; print(sys.executable)"]);
    let exe = query(&ask)?.trim().to_string();
    ensure!(!exe.is_empty(), "{shown} didn't say which python it uses");
    Ok(Some(std::iter::once(exe).chain(rest.iter().cloned()).collect()))
}

/// The absolute interpreter path behind python, python3, py, .venv/bin/python, ...
pub fn resolve(program: &str, root: &Path) -> Result<String> {
    if !is_python(program) {
        bail!(
            "fast-anything v0.1 speaks Python. Start the command with python, e.g.\n    fast-anything scan -- python app.py\n  (Node/TypeScript is next on the roadmap)"
        );
    }
    let prog = if program.contains(['/', '\\']) { root.join(program) } else { PathBuf::from(program) };
    let out = output(
        Command::new(&prog)
            .args(["-c", "import sys; print(sys.executable); print(*sys.version_info[:2])"])
            .current_dir(root),
        "python",
    )?;
    ensure!(out.status.success(), "{program} failed:\n{}", tail(&combined(&out), 5));
    let text = String::from_utf8_lossy(&out.stdout).into_owned();
    let mut lines = text.lines();
    let exe = lines.next().unwrap_or_default().trim().to_string();
    let version: Vec<u32> =
        lines.next().unwrap_or_default().split_whitespace().filter_map(|s| s.parse().ok()).collect();
    ensure!(!exe.is_empty(), "couldn't find the interpreter behind {program}");
    ensure!(version.as_slice() >= &[3, 10][..], "Python 3.10 or newer is needed (found {version:?})");
    Ok(exe)
}

fn helper(ctx: &Ctx, python: &str, mode: &str, job: Value, app_args: &[String]) -> Result<Output> {
    let runner = ctx.fast.join("runner.py");
    fs::write(&runner, RUNNER)?;
    let job_path = ctx.fast.join(format!("job-{mode}.json"));
    fs::write(&job_path, serde_json::to_vec_pretty(&job)?)?;
    let out = output(
        Command::new(python)
            .arg(&runner)
            .arg(mode)
            .arg(&job_path)
            .arg("--")
            .args(app_args)
            .current_dir(&ctx.root)
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUTF8", "1")
            .stdin(Stdio::null()),
        "python",
    )?;
    if !out.status.success() {
        bail!("the python {mode} run failed ({}):\n{}", out.status, tail(&combined(&out), 30));
    }
    Ok(out)
}

pub fn profile(ctx: &Ctx, python: &str, app_args: &[String]) -> Result<Profile> {
    let out = ctx.fast.join("profile.json");
    helper(ctx, python, "profile", json!({ "root": ctx.root, "out": out, "max": 40 }), app_args)?;
    serde_json::from_str(&fs::read_to_string(&out)?).context("reading the profile")
}

const MAIN_GUARD: &[&str] =
    &["if__name__==\"__main__\":", "if__name__=='__main__':", "if\"__main__\"==__name__:", "if'__main__'==__name__:"];

fn main_guard(text: &str) -> Option<usize> {
    backend::line_starting(text, MAIN_GUARD)
}

pub fn record(
    ctx: &Ctx,
    python: &str,
    app_args: &[String],
    hs: &Hotspot,
    out: &Path,
    limit: usize,
) -> Result<Recording> {
    let module = hs.module.as_deref().context("this function can't be imported")?;
    let meta = out.with_extension("meta.json");
    let job = json!({ "module": module, "func": hs.name, "owner": hs.owner, "out": out, "meta": meta, "limit": limit });
    if module != "__main__" {
        helper(ctx, python, "record", job, app_args)?;
    } else {
        // The entry script can't be patched from outside: insert a wrapping line before its
        // if __name__ == "__main__" block for this run, then put the file back byte for byte.
        let file = ctx.root.join(&hs.file);
        let original = fs::read_to_string(&file).with_context(|| format!("reading {}", hs.file))?;
        let backup_dir = ctx.fast.join("backup");
        fs::create_dir_all(&backup_dir)?;
        let backup = backup_dir.join(crate::util::slug(&hs.file));
        fs::write(&backup, &original)?;
        let wrap = match hs.owner.as_deref() {
            Some(cls) => format!(
                "try:\n    {cls}.{f} = staticmethod(__fast_anything_wrap__({cls}.{f}))\nexcept NameError:\n    pass",
                f = hs.name
            ),
            None => format!("try:\n    {f} = __fast_anything_wrap__({f})\nexcept NameError:\n    pass", f = hs.name),
        };
        fs::write(&file, backend::insert_marked(&original, "#", &format!("recording {}", hs.id), &wrap, main_guard))?;
        let run = helper(ctx, python, "record", job, app_args);
        fs::write(&file, &original)
            .with_context(|| format!("restoring {} (a copy is in {})", hs.file, backup.display()))?;
        let _ = fs::remove_file(&backup);
        run?;
    }
    serde_json::from_str(&fs::read_to_string(&meta)?).context("reading the recording summary")
}

// ------------------------------------------------------------------ the Rust crate

/// Rust type for a Python annotation, if there's an obvious one.
pub fn rust_type(annotation: &str, owned: bool) -> Option<String> {
    let a: String = annotation.chars().filter(|c| !c.is_whitespace()).collect();
    let a = a.trim_start_matches("typing.");
    let inner = |prefix: &[&str]| {
        prefix
            .iter()
            .find_map(|p| a.strip_prefix(p).and_then(|r| r.strip_prefix('[')).and_then(|r| r.strip_suffix(']')))
    };
    if let Some(x) = a.strip_suffix("|None").or_else(|| a.strip_prefix("None|")).or_else(|| inner(&["Optional"])) {
        return rust_type(x, owned).map(|t| format!("Option<{t}>"));
    }
    Some(match a {
        "int" => "i64".into(),
        "float" => "f64".into(),
        "bool" => "bool".into(),
        "str" if owned => "String".into(),
        "str" => "&str".into(),
        "bytes" if owned => "Vec<u8>".into(),
        "bytes" => "&[u8]".into(),
        "bytearray" if owned => "Vec<u8>".into(),
        "bytearray" => "&[u8]".into(),
        "None" if owned => "()".into(),
        _ => {
            if let Some(x) = inner(&["list", "List", "Sequence"]) {
                format!("Vec<{}>", rust_type(x, true)?)
            } else if let Some(x) = inner(&["tuple", "Tuple"]) {
                let raw_parts = split_top(x);
                if raw_parts.len() == 2 && raw_parts[1].trim() == "..." {
                    format!("Vec<{}>", rust_type(&raw_parts[0], true)?)
                } else {
                    let parts: Option<Vec<String>> = raw_parts.iter().map(|p| rust_type(p, true)).collect();
                    let parts = parts?;
                    if parts.iter().any(|p| p == "...") {
                        return None;
                    }
                    if parts.len() == 1 { format!("({},)", parts[0]) } else { format!("({})", parts.join(", ")) }
                }
            } else if let Some(x) = inner(&["dict", "Dict", "Mapping"]) {
                let kv = split_top(x);
                if kv.len() != 2 {
                    return None;
                }
                format!("std::collections::HashMap<{}, {}>", rust_type(&kv[0], true)?, rust_type(&kv[1], true)?)
            } else {
                let x = inner(&["set", "Set", "frozenset"])?;
                format!("std::collections::HashSet<{}>", rust_type(x, true)?)
            }
        }
    })
}

/// Split "a,b[c,d],e" on top-level commas.
fn split_top(s: &str) -> Vec<String> {
    let (mut depth, mut cur, mut out) = (0, String::new(), vec![]);
    for c in s.chars() {
        match c {
            '[' => depth += 1,
            ']' => depth -= 1,
            ',' if depth == 0 => {
                out.push(std::mem::take(&mut cur));
                continue;
            }
            _ => {}
        }
        cur.push(c);
    }
    out.push(cur);
    out
}

const RUST_KEYWORDS: &[&str] = &[
    "as", "async", "await", "box", "break", "const", "continue", "crate", "do", "dyn", "else", "enum", "extern",
    "false", "final", "fn", "for", "gen", "if", "impl", "in", "let", "loop", "macro", "match", "mod", "move", "mut",
    "override", "priv", "pub", "ref", "return", "static", "struct", "trait", "true", "try", "type", "typeof", "unsafe",
    "unsized", "use", "virtual", "where", "while", "yield",
];

fn ident(name: &str) -> String {
    if RUST_KEYWORDS.contains(&name) { format!("r#{name}") } else { name.to_string() }
}

/// A Python default value as a PyO3 signature default, if it's a simple literal.
fn rust_default(value: &str) -> Option<String> {
    let v = value.trim();
    Some(match v {
        "None" => "None".into(),
        "True" => "true".into(),
        "False" => "false".into(),
        _ if v.parse::<i64>().is_ok() || v.parse::<f64>().is_ok() => v.into(),
        _ if (v.starts_with('"') && v.ends_with('"')) || (v.starts_with('\'') && v.ends_with('\'')) => {
            format!("{:?}", &v[1..v.len() - 1])
        }
        _ => return None,
    })
}

/// The PyO3 signature default for a parameter: its literal, or None when the Python default
/// isn't a simple literal (the port then gets None and applies the default itself).
fn signature_default(p: &crate::hotspot::Param) -> Option<String> {
    p.default.as_deref().map(|d| rust_default(d).unwrap_or_else(|| "None".into()))
}

pub fn lib_rs(hs: &Hotspot, port: &Port) -> String {
    let params: Vec<String> = hs
        .params
        .iter()
        .map(|p| {
            let ty =
                p.annotation.as_deref().and_then(|a| rust_type(a, false)).unwrap_or_else(|| "&Bound<'_, PyAny>".into());
            let ty = if signature_default(p).as_deref() == Some("None") && !ty.starts_with("Option<") {
                format!("Option<{ty}>")
            } else {
                ty
            };
            format!("{}: {ty}", ident(&p.name))
        })
        .collect();
    let signature = if hs.params.iter().any(|p| p.default.is_some() || p.kwonly) {
        let mut parts = vec![];
        for (i, p) in hs.params.iter().enumerate() {
            if p.kwonly && (i == 0 || !hs.params[i - 1].kwonly) {
                parts.push("*".to_string());
            }
            parts.push(match signature_default(p) {
                Some(d) => format!("{} = {d}", ident(&p.name)),
                None => ident(&p.name),
            });
        }
        format!("#[pyo3(signature = ({}))]\n", parts.join(", "))
    } else {
        String::new()
    };
    let ret = hs.returns.as_deref().and_then(|a| rust_type(a, true)).unwrap_or_else(|| "Py<PyAny>".into());
    format!(
        "//! Rust port of {id} ({file}:{line}), generated by fast-anything.\n\
         //! Replace the todo!() with a faithful, fast port. TASK.md has the original and real calls.\n\
         //! Check it with:  fast-anything verify {id}\n\n\
         use pyo3::prelude::*;\n\n\
         #[pyfunction]\n\
         {signature}\
         #[allow(unused_variables)]\n\
         fn {func}({params}) -> PyResult<{ret}> {{\n    todo!(\"port {id}\")\n}}\n\n\
         #[pymodule]\n\
         fn {ext}(m: &Bound<'_, PyModule>) -> PyResult<()> {{\n    m.add_function(wrap_pyfunction!({func}, m)?)?;\n    Ok(())\n}}\n",
        id = port.id,
        file = hs.file,
        line = hs.line,
        func = ident(&hs.name),
        params = params.join(", "),
        ext = port.ext,
    )
}

fn cargo_toml(port: &Port) -> String {
    format!(
        "# Rust port of {id}, generated by fast-anything.\n\
         [package]\nname = \"{ext}\"\nversion = \"0.1.0\"\nedition = \"2024\"\npublish = false\n\n\
         [lib]\nname = \"{ext}\"\ncrate-type = [\"cdylib\"]\n\n\
         [dependencies]\npyo3 = {{ version = \"{PYO3}\", features = [\"extension-module\", \"abi3-py310\"] }}\n\n\
         [profile.release]\nopt-level = 3\nlto = \"fat\"\ncodegen-units = 1\n\n\
         # A crate of its own, even inside another Cargo workspace.\n[workspace]\n",
        id = port.id,
        ext = port.ext,
    )
}

/// Render a recorded JSON value the way Python would print it.
fn py_value(v: &Value) -> String {
    match v {
        Value::Null => "None".into(),
        Value::Bool(b) => {
            if *b {
                "True".into()
            } else {
                "False".into()
            }
        }
        Value::Number(n) => n.to_string(),
        Value::String(s) => serde_json::to_string(s).unwrap_or_default(),
        Value::Array(items) => format!("[{}]", items.iter().map(py_value).collect::<Vec<_>>().join(", ")),
        Value::Object(map) => match map.iter().next() {
            Some((tag, Value::Array(items))) if tag == "$tuple" => {
                let inner: Vec<String> = items.iter().map(py_value).collect();
                if inner.len() == 1 { format!("({},)", inner[0]) } else { format!("({})", inner.join(", ")) }
            }
            Some((tag, Value::Array(items))) if tag == "$set" && items.is_empty() => "set()".into(),
            Some((tag, Value::Array(items))) if tag == "$set" => {
                format!("{{{}}}", items.iter().map(py_value).collect::<Vec<_>>().join(", "))
            }
            Some((tag, Value::Array(pairs))) if tag == "$dict" => {
                let inner: Vec<String> = pairs
                    .iter()
                    .filter_map(|p| p.as_array())
                    .filter(|p| p.len() == 2)
                    .map(|p| format!("{}: {}", py_value(&p[0]), py_value(&p[1])))
                    .collect();
                format!("{{{}}}", inner.join(", "))
            }
            Some((tag, Value::String(s))) if tag == "$bytes" => {
                format!("__import__('base64').b64decode({s:?})")
            }
            Some((tag, Value::String(s))) if tag == "$float" => format!("float({s:?})"),
            _ => v.to_string(),
        },
    }
}

fn clip(s: &str, n: usize) -> String {
    if s.chars().count() <= n { s.to_string() } else { format!("{}…", s.chars().take(n - 1).collect::<String>()) }
}

pub fn sample_calls(path: &Path, func: &str, n: usize) -> Vec<String> {
    let Ok(text) = fs::read_to_string(path) else { return vec![] };
    text.lines()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .take(n)
        .map(|case| {
            let mut args: Vec<String> =
                case["args"].as_array().map(|a| a.iter().map(py_value).collect()).unwrap_or_default();
            if let Some(kw) = case["kwargs"].as_object() {
                args.extend(kw.iter().map(|(k, v)| format!("{k}={}", py_value(v))));
            }
            let outcome = match case.get("raises") {
                Some(e) => format!("raises {}", e.as_str().unwrap_or("an exception")),
                None => py_value(&case["result"]),
            };
            format!("{}  ->  {}", clip(&format!("{func}({})", args.join(", ")), 110), clip(&outcome, 60))
        })
        .collect()
}

pub fn task_md(hs: &Hotspot, helpers: &[Hotspot], port: &Port, crate_dir: &Path) -> String {
    let fence = "```";
    let samples = sample_calls(&crate_dir.join("recordings.jsonl"), &hs.name, 8).join("\n");
    let mut notes = String::new();
    for w in &hs.warnings {
        notes.push_str(&format!("- Note: {w}.\n"));
    }
    for p in &hs.params {
        if let Some(d) = p.default.as_deref().filter(|d| rust_default(d).is_none()) {
            notes.push_str(&format!(
                "- Note: `{}` defaults to `{d}` in Python; the Rust signature takes `None` for it, use that default then.\n",
                p.name
            ));
        }
    }
    format!(
        "# Port `{id}` to Rust\n\n\
You're in a Rust crate fast-anything generated for this: `{dir}`.\n\
Write `{func}` in `src/lib.rs` so it behaves **exactly** like the Python below, and runs fast.\n\
Only edit files in this folder. Don't touch the Python project.\n\n\
## The original ({file}:{line})\n\n{fence}python\n{source}\n{fence}\n\n\
{helpers}## Real calls\n\n\
fast-anything recorded {recorded} real calls (out of {seen} while the app ran). A few:\n\n{fence}\n{samples}\n{fence}\n\n\
## Rules\n\n\
- Same result for every input, edge cases included: empty input, zero, negatives, NaN and infinity, non-ASCII text, very long input. verify tests these too.\n\
- Python `str` indexes by Unicode code point: use `.chars()` (or bytes only after checking `is_ascii()`).\n\
- Python ints don't overflow. `i64` is fine unless the recorded values are bigger.\n\
- Float results are compared with a relative tolerance of 1e-9. Keep the same order of operations.\n\
- Where Python raises, raise too (`PyValueError::new_err(...)`, `PyKeyError`, ...).\n\
- Make it fast: no needless allocation or cloning, borrow inputs, `with_capacity`, fast paths for common cases.\n\
- std only, unless a crate clearly pays off. Keep the function and module names as they are.\n\
{notes}\n\
## Check\n\n\
Run `cargo check` here. Then fast-anything builds the crate in release mode and replays all {recorded} recorded calls against it\n\
(`fast-anything verify {id}`).\n",
        id = port.id,
        dir = crate_dir.display(),
        func = hs.name,
        file = hs.file,
        line = hs.line,
        source = hs.source,
        recorded = port.recorded,
        seen = crate::util::thousands(port.calls_seen),
        helpers = helpers_md(hs, helpers),
    )
}

/// Create the crate (never overwriting a src/lib.rs that's already there) and its TASK.md.
pub fn scaffold(ctx: &Ctx, hs: &Hotspot, helpers: &[Hotspot], port: &Port) -> Result<String> {
    let dir = ctx.crate_dir(port);
    fs::create_dir_all(dir.join("src"))?;
    fs::create_dir_all(dir.join(".cargo"))?;
    fs::write(dir.join("Cargo.toml"), cargo_toml(port))?;
    fs::write(dir.join(".cargo/config.toml"), backend::CARGO_CONFIG)?;
    let lib = dir.join("src/lib.rs");
    if !lib.exists() {
        fs::write(&lib, lib_rs(hs, port))?;
    }
    let task = task_md(hs, helpers, port, &dir);
    fs::write(dir.join("TASK.md"), &task)?;
    Ok(task)
}

/// TASK.md section listing the same-file functions the target calls, to port alongside it.
pub fn helpers_md(hs: &Hotspot, helpers: &[Hotspot]) -> String {
    if hs.calls.is_empty() {
        return String::new();
    }
    let mut out = "## Helpers it calls\n\nPort these as private Rust functions in the same crate (they stay in Python for everyone else).\n\n".to_string();
    for name in &hs.calls {
        match helpers.iter().find(|h| &h.name == name) {
            Some(h) => out.push_str(&format!("```python\n{}\n```\n\n", h.source)),
            None => out.push_str(&format!("- `{name}`: read it in {}\n", hs.file)),
        }
    }
    out
}

// ------------------------------------------------------------------ verify

pub fn verify(ctx: &Ctx, port: &Port) -> Result<Verify> {
    let python = ctx.runtime()?;
    let dir = ctx.crate_dir(port);
    let out = dir.join("verify.json");
    let job = json!({
        "base": ctx.base_dir(), "libdir": ctx.lib_dir(), "ext": port.ext, "module": port.module,
        "module_file": ctx.root.join(&port.file),
        "func": port.func, "owner": port.owner, "cases": dir.join("recordings.jsonl"), "out": out, "budget": 0.5,
    });
    helper(ctx, python, "verify", job, &[])?;
    let mut v: Verify = serde_json::from_str(&fs::read_to_string(&out)?).context("reading verify results")?;
    v.built = true;
    Ok(v)
}

// ------------------------------------------------------------------ the shim

/// Lines appended to the module (between markers) that swap in the Rust function.
pub fn shim(port: &Port, lib_rel: &str) -> String {
    let f = &port.func;
    [
        "# Uses the verified Rust port. FAST_ANYTHING_DISABLE=1 runs the Python above instead.",
        &format!("# Undo with:  fast-anything disable {}", port.id),
        "def _fast_anything_load():",
        "    import os, sys",
        "    if os.environ.get(\"FAST_ANYTHING_DISABLE\"):",
        "        return None",
        &format!("    lib = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), \"{lib_rel}\"))"),
        "    if lib not in sys.path:",
        "        sys.path.append(lib)",
        "    try:",
        &format!("        from {} import {f}", port.ext),
        "    except ImportError:",
        "        return None",
        &format!("    return {f}"),
        &match port.owner.as_deref() {
            Some(cls) => format!("{cls}.{f} = staticmethod(_fast_anything_load() or {cls}.{f})"),
            None => format!("{f} = _fast_anything_load() or {f}"),
        },
        "del _fast_anything_load",
    ]
    .join("\n")
}

pub fn strip_shim(text: &str, id: &str) -> String {
    backend::strip_marked(text, "#", id)
}

pub fn add_shim(text: &str, port: &Port, lib_rel: &str) -> String {
    if port.module == "__main__" {
        // before the if __name__ == "__main__" block, so the app's main code sees the Rust version
        backend::insert_marked(text, "#", &port.id, &shim(port, lib_rel), main_guard)
    } else {
        backend::append_marked(text, "#", &port.id, &shim(port, lib_rel))
    }
}

pub fn enable(ctx: &Ctx, port: &Port) -> Result<()> {
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    let from = file.parent().context("module has no folder")?;
    let lib_rel = forward_slashes(&relative(from, &ctx.lib_dir()));
    fs::write(&file, add_shim(&text, port, &lib_rel)).with_context(|| format!("writing {}", port.file))
}

pub fn disable(ctx: &Ctx, port: &Port) -> Result<()> {
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    fs::write(&file, strip_shim(&text, &port.id)).with_context(|| format!("writing {}", port.file))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn port() -> Port {
        Port {
            id: "fuzzy.levenshtein".into(),
            file: "fuzzy.py".into(),
            module: "fuzzy".into(),
            func: "levenshtein".into(),
            ext: "fa_fuzzy_levenshtein".into(),
            crate_dir: ".fast/ports/fuzzy.levenshtein".into(),
            recorded: 3,
            calls_seen: 10,
            verify: None,
            enabled: false,
            lang: crate::backend::Lang::Python,
            owner: None,
            line: 1,
            sources: vec![],
        }
    }

    #[test]
    fn shim_round_trips() {
        for original in ["def f():\n    return 1\n", "def f():\r\n    return 1\r\n", "x = 1"] {
            let on = add_shim(original, &port(), ".fast/lib");
            assert!(on.contains("from fa_fuzzy_levenshtein import levenshtein"));
            assert_eq!(add_shim(&on, &port(), ".fast/lib"), on, "enabling twice changes nothing");
            let off = strip_shim(&on, "fuzzy.levenshtein");
            assert_eq!(off.trim_end(), original.trim_end());
            if original.ends_with('\n') {
                assert_eq!(off, original);
            }
        }
    }

    #[test]
    fn shim_for_a_static_method() {
        let port = Port { owner: Some("Text".into()), ..port() };
        let on = add_shim("class Text:\n    pass\n", &port, ".fast/lib");
        assert!(on.contains("Text.levenshtein = staticmethod(_fast_anything_load() or Text.levenshtein)"), "{on}");
        assert_eq!(strip_shim(&on, "fuzzy.levenshtein"), "class Text:\n    pass\n");
    }

    #[test]
    fn static_methods_are_portable() {
        let Some(python) = ["python3", "python"]
            .into_iter()
            .find(|p| Command::new(p).arg("--version").output().is_ok_and(|o| o.status.success()))
        else {
            eprintln!("no python on PATH, skipping");
            return;
        };
        let dir = std::env::temp_dir().join(format!("fa-static-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("runner.py"), RUNNER).unwrap();
        fs::write(
            dir.join("text.py"),
            "class Text:\n    @staticmethod\n    def lev(a: str, b: str) -> int:\n        return 0\n\n    def size(self) -> int:\n        return 0\n",
        )
        .unwrap();
        let check = "import runpy, sys, os\n\
                     d = sys.argv[1]\n\
                     describe = runpy.run_path(os.path.join(d, 'runner.py'))['describe']\n\
                     f = os.path.join(d, 'text.py')\n\
                     info = describe(f, 3, 'lev', None, d)\n\
                     assert info['owner'] == 'Text' and info['blockers'] == [], info\n\
                     info = describe(f, 6, 'size', None, d)\n\
                     assert info['owner'] is None and info['blockers'], info\n";
        let out = Command::new(python).args(["-I", "-c", check]).arg(&dir).output().unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    }

    #[test]
    fn maps_annotations() {
        assert_eq!(rust_type("str", false).as_deref(), Some("&str"));
        assert_eq!(rust_type("str", true).as_deref(), Some("String"));
        assert_eq!(rust_type("bytes", false).as_deref(), Some("&[u8]"));
        assert_eq!(rust_type("bytes", true).as_deref(), Some("Vec<u8>"));
        assert_eq!(rust_type("bytearray", false).as_deref(), Some("&[u8]"));
        assert_eq!(rust_type("bytearray", true).as_deref(), Some("Vec<u8>"));
        assert_eq!(rust_type("list[int]", false).as_deref(), Some("Vec<i64>"));
        assert_eq!(rust_type("List[str]", false).as_deref(), Some("Vec<String>"));
        assert_eq!(rust_type("list[bytes]", false).as_deref(), Some("Vec<Vec<u8>>"));
        assert_eq!(rust_type("tuple[int, float]", true).as_deref(), Some("(i64, f64)"));
        assert_eq!(rust_type("tuple[int]", true).as_deref(), Some("(i64,)"));
        assert_eq!(
            rust_type("dict[str, list[float]]", true).as_deref(),
            Some("std::collections::HashMap<String, Vec<f64>>")
        );
        assert_eq!(rust_type("float | None", false).as_deref(), Some("Option<f64>"));
        assert_eq!(rust_type("Optional[int]", false).as_deref(), Some("Option<i64>"));
        assert_eq!(rust_type("MyClass", false), None);
        assert_eq!(rust_type("tuple[int, ...]", true).as_deref(), Some("Vec<i64>"));
        assert_eq!(rust_type("tuple[str, ...]", true).as_deref(), Some("Vec<String>"));
    }

    #[test]
    fn renders_python_values() {
        let v: Value = serde_json::from_str(
            r#"[null, true, "a", {"$bytes": "aGVsbG8="}, {"$tuple": [1, 2]}, {"$dict": [["k", 1.5]]}]"#,
        )
        .unwrap();
        assert_eq!(
            py_value(&v),
            r#"[None, True, "a", __import__('base64').b64decode("aGVsbG8="), (1, 2), {"k": 1.5}]"#
        );
        let sets: Value = serde_json::from_str(r#"[{"$set": []}, {"$set": [1]}, {"$dict": []}]"#).unwrap();
        assert_eq!(py_value(&sets), "[set(), {1}, {}]");
    }

    #[test]
    fn signature_keeps_required_params_before_optional() {
        use crate::hotspot::Param;
        let param = |name: &str, annotation: &str, default: Option<&str>, kwonly: bool| Param {
            name: name.into(),
            annotation: Some(annotation.into()),
            default: default.map(Into::into),
            kwonly,
        };
        let mut hs = Hotspot {
            name: "join_words".into(),
            params: vec![
                param("words", "list[str]", None, false),
                param("n", "int", Some("3"), false),
                param("sep", "str", Some("SEP"), false),
            ],
            ..Hotspot::default()
        };
        let lib = lib_rs(&hs, &port());
        assert!(lib.contains("#[pyo3(signature = (words, n = 3, sep = None))]"), "{lib}");
        assert!(lib.contains("fn join_words(words: Vec<String>, n: i64, sep: Option<&str>)"), "{lib}");

        hs.params = vec![param("a", "int", Some("1"), false), param("b", "int", None, true)];
        let lib = lib_rs(&hs, &port());
        assert!(lib.contains("#[pyo3(signature = (a = 1, *, b))]"), "{lib}");
        assert!(lib.contains("fn join_words(a: i64, b: i64)"), "{lib}");
    }

    #[test]
    fn verify_tells_ints_from_floats() {
        let Some(python) = ["python3", "python"]
            .into_iter()
            .find(|p| Command::new(p).arg("--version").output().is_ok_and(|o| o.status.success()))
        else {
            eprintln!("no python on PATH, skipping");
            return;
        };
        let runner = std::env::temp_dir().join(format!("fa-runner-test-{}.py", std::process::id()));
        fs::write(&runner, RUNNER).unwrap();
        let check = "import runpy, sys\n\
                     same = runpy.run_path(sys.argv[1])['same']\n\
                     assert not same(3.0, 3) and not same(3, 3.0)\n\
                     assert not same([1.5, 2.0], [1.5, 2])\n\
                     assert not same({'k': 2.0}, {'k': 2})\n\
                     assert same(3.0, 3.0 + 1e-12) and same(3, 3) and same((1.0, 2), [1.0, 2])\n\
                     assert same(float('nan'), float('nan')) and not same(True, 1)\n";
        let out = Command::new(python).args(["-I", "-c", check]).arg(&runner).output().unwrap();
        let _ = fs::remove_file(&runner);
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    }

    #[test]
    fn verify_wants_the_same_exception_not_a_panic() {
        let Some(python) = ["python3", "python"]
            .into_iter()
            .find(|p| Command::new(p).arg("--version").output().is_ok_and(|o| o.status.success()))
        else {
            eprintln!("no python on PATH, skipping");
            return;
        };
        let runner = std::env::temp_dir().join(format!("fa-runner-raises-{}.py", std::process::id()));
        fs::write(&runner, RUNNER).unwrap();
        let check = "import runpy, sys\n\
                     ns = runpy.run_path(sys.argv[1])\n\
                     raises_like, best_pass = ns['raises_like'], ns['best_pass']\n\
                     class PanicException(BaseException): pass\n\
                     assert raises_like(ValueError('x'), 'ValueError')\n\
                     assert not raises_like(KeyError('x'), 'ValueError')\n\
                     assert not raises_like(PanicException('index out of bounds'), 'ValueError')\n\
                     assert not raises_like(None, 'ValueError')\n\
                     def panics(*a):\n    raise PanicException('boom')\n\
                     assert best_pass(panics, [((), {})], 0.0) >= 0\n";
        let out = Command::new(python).args(["-I", "-c", check]).arg(&runner).output().unwrap();
        let _ = fs::remove_file(&runner);
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    }

    #[test]
    fn env_runners_resolve_to_their_python() {
        let cmd = |s: &str| s.split_whitespace().map(String::from).collect::<Vec<_>>();
        let query = |argv: &[&str]| -> Result<String> {
            assert_eq!(&argv[1..], ["run", "python", "-c", "import sys; print(sys.executable)"]);
            Ok(format!("/proj/.venv-{}/bin/python\n", argv[0]))
        };
        let got = |s: &str| unwrap_env_runner(&cmd(s), query);
        assert_eq!(got("uv run app.py data.txt").unwrap().unwrap(), cmd("/proj/.venv-uv/bin/python app.py data.txt"));
        assert_eq!(got("poetry run python app.py").unwrap().unwrap(), cmd("/proj/.venv-poetry/bin/python app.py"));
        assert_eq!(got("pdm run python3 -m pkg").unwrap().unwrap(), cmd("/proj/.venv-pdm/bin/python -m pkg"));
        assert!(got("python app.py").unwrap().is_none());
        assert!(got("uv pip list").unwrap().is_none());
        assert!(got("uv run --with numpy app.py").unwrap_err().to_string().contains("can't pass options"));
        assert!(got("uv run pytest").unwrap_err().to_string().contains("isn't a .py script"));
        assert!(got("uv run").is_err());
    }

    #[test]
    fn spots_python() {
        assert!(is_python("python"));
        assert!(is_python("python3.12"));
        assert!(is_python(".venv/bin/python"));
        assert!(is_python("C:\\Python313\\python.exe"));
        assert!(is_python("py"));
        assert!(!is_python("node"));
    }
}
