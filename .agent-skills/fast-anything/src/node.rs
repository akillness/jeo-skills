//! Node.js backend (JavaScript and TypeScript): V8 CPU profile, call recording through a temporary
//! block appended to the module, a napi-rs crate, and a reversible shim that rebinds the function.

use crate::backend::{self, Profile, Recording};
use crate::hotspot::Hotspot;
use crate::python::DISABLE_ENV;
use crate::state::{Ctx, Port, Verify};
use crate::util::{combined, forward_slashes, output, relative, slug, tail};
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

const RUNNER: &str = include_str!("node/runner.mjs");
const RECORDER: &str = include_str!("node/recorder.cjs");

pub fn is_node(program: &str) -> bool {
    let stem = crate::util::program_stem(program);
    stem == "node" || stem == "nodejs"
}

pub fn resolve(program: &str, root: &Path) -> Result<String> {
    let prog = if program.contains(['/', '\\']) { root.join(program) } else { PathBuf::from(program) };
    let out = output(
        Command::new(&prog).args(["-p", "process.execPath + '\\n' + process.versions.node"]).current_dir(root),
        "node",
    )?;
    ensure!(out.status.success(), "{program} failed:\n{}", tail(&combined(&out), 5));
    let text = String::from_utf8_lossy(&out.stdout).into_owned();
    let mut lines = text.lines();
    let exe = lines.next().unwrap_or_default().trim().to_string();
    let major: u32 = lines.next().unwrap_or_default().split('.').next().and_then(|m| m.parse().ok()).unwrap_or(0);
    ensure!(major >= 22, "Node.js 22 or newer is needed (found {major})");
    Ok(exe)
}

/// The script in "node [flags] script.js args".
fn entry(args: &[String]) -> Option<&String> {
    let mut it = args.iter();
    while let Some(a) = it.next() {
        if matches!(
            a.as_str(),
            "-r" | "--require" | "--import" | "--loader" | "--experimental-loader" | "-C" | "--conditions"
        ) {
            it.next();
        } else if !a.starts_with('-') {
            return Some(a);
        }
    }
    None
}

fn runner(ctx: &Ctx, node: &str, mode: &str, job: Value) -> Result<Output> {
    let script = ctx.fast.join("runner.mjs");
    fs::write(&script, RUNNER)?;
    let job_path = ctx.fast.join(format!("job-{mode}.json"));
    fs::write(&job_path, serde_json::to_vec_pretty(&job)?)?;
    let out = output(
        Command::new(node).arg(&script).arg(mode).arg(&job_path).current_dir(&ctx.root).stdin(Stdio::null()),
        "node",
    )?;
    if !out.status.success() {
        bail!("the node {mode} step failed ({}):\n{}", out.status, tail(&combined(&out), 30));
    }
    Ok(out)
}

pub fn profile(ctx: &Ctx, node: &str, args: &[String]) -> Result<Profile> {
    let script = entry(args).context("name the script to run, e.g.  fast-anything scan -- node app.js")?;
    let dir = ctx.fast.join("cpuprof");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir)?;
    let out = output(
        Command::new(node)
            .args(["--cpu-prof", "--cpu-prof-interval", "250", "--cpu-prof-dir"])
            .arg(&dir)
            .args(args)
            .current_dir(&ctx.root)
            .stdin(Stdio::null()),
        "node",
    )?;
    ensure!(out.status.success(), "the app failed ({}):\n{}", out.status, tail(&combined(&out), 30));
    let result = ctx.fast.join("profile.json");
    let job = json!({ "root": ctx.root, "dir": dir, "entry": ctx.root.join(script), "out": result });
    runner(ctx, node, "profile", job)?;
    serde_json::from_str(&fs::read_to_string(&result)?).context("reading the profile")
}

/// The entry script's main block, if its main code sits under one.
const MAIN_GUARD: &[&str] = &["if(import.meta.main)", "if(require.main===module)", "if(module===require.main)"];

/// Add a marked block to a module: at the end, or in the entry script just before its main block,
/// so the app's main code already sees it. Function declarations are hoisted, so they exist there.
fn add_marked(text: &str, id: &str, body: &str, entry: bool) -> String {
    if entry {
        backend::insert_marked(text, "//", id, body, |t| backend::line_starting(t, MAIN_GUARD))
    } else {
        backend::append_marked(text, "//", id, body)
    }
}

/// Re-run the app with a recorder wrapped around the function. The module gets a temporary
/// block appended (a copy waits in .fast/backup) and is restored byte for byte afterwards.
pub fn record(ctx: &Ctx, node: &str, args: &[String], hs: &Hotspot, out: &Path, limit: usize) -> Result<Recording> {
    let file = ctx.root.join(&hs.file);
    let original = fs::read_to_string(&file).with_context(|| format!("reading {}", hs.file))?;
    let backup_dir = ctx.fast.join("backup");
    fs::create_dir_all(&backup_dir)?;
    let backup = backup_dir.join(slug(&hs.file));
    fs::write(&backup, &original)?;

    let f = &hs.name;
    let wrap = format!("{f} = globalThis.__fastAnythingWrap ? globalThis.__fastAnythingWrap({f}) : {f};");
    let entry = hs.module.as_deref() == Some("__main__");
    let reassignable = redeclare(&original, "const", "let", f).unwrap_or_else(|| original.clone());
    fs::write(&file, add_marked(&reassignable, &format!("recording {}", hs.id), &wrap, entry))?;
    let recorder = ctx.fast.join("recorder.cjs");
    fs::write(&recorder, RECORDER)?;
    let meta = out.with_extension("meta.json");
    let run = output(
        Command::new(node)
            .arg("--require")
            .arg(&recorder)
            .args(args)
            .current_dir(&ctx.root)
            .env("FAST_ANYTHING_RECORD_OUT", out)
            .env("FAST_ANYTHING_RECORD_META", &meta)
            .env("FAST_ANYTHING_RECORD_LIMIT", limit.to_string())
            .env(DISABLE_ENV, "1")
            .stdin(Stdio::null()),
        "node",
    );
    fs::write(&file, &original)
        .with_context(|| format!("restoring {} (a copy is in {})", hs.file, backup.display()))?;
    let _ = fs::remove_file(&backup);
    let run = run?;
    ensure!(run.status.success(), "the app failed while recording ({}):\n{}", run.status, tail(&combined(&run), 30));
    serde_json::from_str(&fs::read_to_string(&meta)?).context("reading the recording summary")
}

// ------------------------------------------------------------------ the napi-rs crate

fn split_union(s: &str) -> Vec<String> {
    let (mut depth, mut cur, mut out) = (0i32, String::new(), vec![]);
    for c in s.chars() {
        match c {
            '<' | '[' | '(' | '{' => depth += 1,
            '>' | ']' | ')' | '}' => depth -= 1,
            '|' if depth == 0 => {
                out.push(cur.trim().to_string());
                cur.clear();
                continue;
            }
            _ => {}
        }
        cur.push(c);
    }
    out.push(cur.trim().to_string());
    out.into_iter().filter(|p| !p.is_empty()).collect()
}

const TYPED_ARRAYS: &[&str] = &[
    "Float64Array",
    "Float32Array",
    "Int32Array",
    "Uint32Array",
    "Int16Array",
    "Uint16Array",
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
];

/// Rust type for a TypeScript annotation, if there's an obvious one.
pub fn rust_type(annotation: &str) -> Option<String> {
    let a = annotation.split_whitespace().collect::<Vec<_>>().join(" ");
    let parts = split_union(&a);
    let solid: Vec<&String> = parts.iter().filter(|p| *p != "null" && *p != "undefined").collect();
    if solid.len() < parts.len() {
        return match solid.as_slice() {
            [one] => rust_type(one).map(|t| format!("Option<{t}>")),
            _ => None,
        };
    }
    if parts.len() != 1 {
        return None;
    }
    let a = a.trim();
    Some(match a {
        "number" => "f64".into(),
        "string" => "String".into(),
        "boolean" => "bool".into(),
        "void" | "undefined" => "()".into(),
        "Buffer" => "Buffer".into(),
        t if TYPED_ARRAYS.contains(&t) => t.into(),
        _ => {
            let inner = a
                .strip_suffix("[]")
                .map(|x| x.trim_start_matches("readonly ").to_string())
                .or_else(|| a.strip_prefix("Array<").and_then(|x| x.strip_suffix('>')).map(String::from))
                .or_else(|| a.strip_prefix("ReadonlyArray<").and_then(|x| x.strip_suffix('>')).map(String::from));
            let set_inner = a.strip_prefix("Set<").and_then(|x| x.strip_suffix('>'));
            let tuple = a
                .strip_prefix('[')
                .and_then(|x| x.strip_suffix(']'))
                .map(|x| x.split(',').map(|p| rust_type(p.trim())).collect::<Option<Vec<String>>>());
            if let Some(Some(parts)) = tuple {
                // A JS tuple is an array; a same-typed one maps to a Vec.
                if parts.is_empty() || parts.iter().any(|p| p != &parts[0]) {
                    return None;
                }
                format!("Vec<{}>", parts[0])
            } else if let Some(inner) = inner {
                format!("Vec<{}>", rust_type(&inner)?)
            } else if let Some(inner) = set_inner {
                // napi converts a JS Set into a HashSet, whose items must hash: strings yes, f64 no
                let inner = rust_type(inner.trim()).filter(|t| t == "String")?;
                format!("std::collections::HashSet<{inner}>")
            } else {
                // a JS Map would arrive empty (napi's HashMap reads a plain object's own keys), so
                // only Record<string, T> maps to one
                let v = a.strip_prefix("Record<string,").and_then(|x| x.strip_suffix('>'))?;
                format!("std::collections::HashMap<String, {}>", rust_type(v.trim())?)
            }
        }
    })
}

fn snake(name: &str) -> String {
    let mut s = String::new();
    for (i, c) in name.chars().enumerate() {
        if c.is_ascii_uppercase() {
            if i > 0 {
                s.push('_');
            }
            s.push(c.to_ascii_lowercase());
        } else if c == '$' {
            s.push('_');
        } else {
            s.push(c);
        }
    }
    match s.as_str() {
        "type" | "match" | "fn" | "ref" | "move" | "loop" | "mod" | "use" | "impl" | "trait" | "struct" | "enum"
        | "where" | "mut" | "self" | "super" | "crate" | "box" | "gen" | "dyn" | "unsafe" | "extern" | "pub" | "as"
        | "in" => {
            format!("r#{s}")
        }
        _ => s,
    }
}

pub fn lib_rs(hs: &Hotspot, port: &Port) -> String {
    let params: Vec<String> = hs
        .params
        .iter()
        .map(|p| {
            let ty = p.annotation.as_deref().and_then(rust_type).unwrap_or_else(|| "serde_json::Value".into());
            format!("{}: {ty}", snake(&p.name))
        })
        .collect();
    let ret = hs.returns.as_deref().and_then(rust_type).unwrap_or_else(|| "serde_json::Value".into());
    format!(
        "//! Rust port of {id} ({file}:{line}), generated by fast-anything.\n\
         //! Replace the todo!() with a faithful, fast port. TASK.md has the original and real calls.\n\
         //! Check it with:  fast-anything verify {id}\n\n\
         use napi::bindgen_prelude::*;\n\
         use napi_derive::napi;\n\n\
         #[napi(js_name = \"{js}\", catch_unwind)]\n\
         #[allow(unused_variables)]\n\
         pub fn {rust}({params}) -> Result<{ret}> {{\n    todo!(\"port {id}\")\n}}\n",
        id = port.id,
        file = hs.file,
        line = hs.line,
        js = hs.name,
        rust = snake(&hs.name),
        params = params.join(", "),
    )
}

fn cargo_toml(port: &Port) -> String {
    format!(
        "# Rust port of {id}, generated by fast-anything.\n\
         [package]\nname = \"{ext}\"\nversion = \"0.1.0\"\nedition = \"2024\"\npublish = false\n\n\
         [lib]\nname = \"{ext}\"\ncrate-type = [\"cdylib\"]\n\n\
         [dependencies]\nnapi = {{ version = \"3\", features = [\"serde-json\"] }}\nnapi-derive = \"3\"\nserde_json = \"1\"\n\n\
         [build-dependencies]\nnapi-build = \"2\"\n\n{profile}",
        id = port.id,
        ext = port.ext,
        profile = backend::RELEASE_PROFILE,
    )
}

/// A recorded value the way JavaScript would print it.
fn js_value(v: &Value) -> String {
    match v {
        Value::Array(items) => format!("[{}]", items.iter().map(js_value).collect::<Vec<_>>().join(", ")),
        Value::Object(map) => match map.iter().next() {
            Some((tag, Value::Array(pairs))) if tag == "$object" => {
                let inner: Vec<String> = pairs
                    .iter()
                    .filter_map(|p| p.as_array())
                    .filter(|p| p.len() == 2)
                    .map(|p| format!("{}: {}", p[0].as_str().unwrap_or("?"), js_value(&p[1])))
                    .collect();
                format!("{{ {} }}", inner.join(", "))
            }
            Some((tag, x)) if tag == "$typed" => format!("{}{}", x[0].as_str().unwrap_or("TypedArray"), x[1]),
            Some((tag, x)) if tag == "$bigint" => format!("{}n", x.as_str().unwrap_or("0")),
            Some((tag, _)) if tag == "$undefined" => "undefined".into(),
            Some((tag, x)) if tag == "$float" => x.as_str().unwrap_or("NaN").to_string(),
            Some((tag, Value::Array(items))) if tag == "$set" => {
                format!("Set {{{}}}", items.iter().map(js_value).collect::<Vec<_>>().join(", "))
            }
            Some((tag, Value::Array(pairs))) if tag == "$map" => {
                let inner: Vec<String> = pairs
                    .iter()
                    .filter_map(|p| p.as_array())
                    .filter(|p| p.len() == 2)
                    .map(|p| format!("{} => {}", js_value(&p[0]), js_value(&p[1])))
                    .collect();
                format!("Map {{ {} }}", inner.join(", "))
            }
            _ => v.to_string(),
        },
        _ => v.to_string(),
    }
}

fn clip(s: &str, n: usize) -> String {
    if s.chars().count() <= n { s.to_string() } else { format!("{}…", s.chars().take(n - 1).collect::<String>()) }
}

fn sample_calls(path: &Path, func: &str, n: usize) -> Vec<String> {
    let Ok(text) = fs::read_to_string(path) else { return vec![] };
    text.lines()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .take(n)
        .map(|case| {
            let args: Vec<String> =
                case["args"].as_array().map(|a| a.iter().map(js_value).collect()).unwrap_or_default();
            let outcome = match case.get("raises") {
                Some(e) => format!("throws {}", e.as_str().unwrap_or("an error")),
                None => js_value(&case["result"]),
            };
            format!("{}  ->  {}", clip(&format!("{func}({})", args.join(", ")), 110), clip(&outcome, 60))
        })
        .collect()
}

pub fn task_md(hs: &Hotspot, helpers: &[Hotspot], port: &Port, crate_dir: &Path) -> String {
    let fence = "```";
    let lang =
        if hs.file.ends_with(".ts") || hs.file.ends_with(".mts") || hs.file.ends_with(".cts") { "ts" } else { "js" };
    let samples = sample_calls(&crate_dir.join("recordings.jsonl"), &hs.name, 8).join("\n");
    let notes: String = hs.warnings.iter().map(|w| format!("- Note: {w}.\n")).collect();
    format!(
        "# Port `{id}` to Rust\n\n\
You're in a Rust crate (napi-rs) fast-anything generated for this: `{dir}`.\n\
Write `{func}` in `src/lib.rs` so it behaves **exactly** like the JavaScript below, and runs fast.\n\
Only edit files in this folder. Don't touch the JavaScript project.\n\n\
## The original ({file}:{line})\n\n{fence}{lang}\n{source}\n{fence}\n\n\
{helpers}## Real calls\n\n\
fast-anything recorded {recorded} real calls (out of {seen} while the app ran). A few:\n\n{fence}\n{samples}\n{fence}\n\n\
## Rules\n\n\
- Same result for every input, edge cases included: empty input, zero, negatives, NaN and infinity, non-ASCII text, very long input. verify tests these too.\n\
- JavaScript strings are UTF-16: `.length`, indexing and `charCodeAt` count UTF-16 code units. \
Use `s.encode_utf16()` for anything index- or length-based (bytes are fine after checking `is_ascii()`).\n\
- JavaScript numbers are f64. Integer math is exact only up to 2^53; use `f64` unless the values are clearly small integers.\n\
- Results are compared with a relative tolerance of 1e-9. Keep the same order of float operations.\n\
- Where JavaScript throws, return `Err(Error::from_reason(...))`.\n\
- Each call crosses from JavaScript into Rust: keep conversions cheap, don't clone big inputs.\n\
- Make it fast: no needless allocation, borrow, `with_capacity`, fast paths for common cases.\n\
- Keep `#[napi(js_name = \"{func}\", catch_unwind)]` as it is.\n\
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

pub fn scaffold(ctx: &Ctx, hs: &Hotspot, helpers: &[Hotspot], port: &Port) -> Result<String> {
    let dir = ctx.crate_dir(port);
    fs::create_dir_all(dir.join("src"))?;
    fs::create_dir_all(dir.join(".cargo"))?;
    fs::write(dir.join("Cargo.toml"), cargo_toml(port))?;
    fs::write(dir.join("build.rs"), "fn main() {\n    napi_build::setup();\n}\n")?;
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
    let mut out = "## Helpers it calls\n\nPort these as private Rust functions in the same crate (they stay in JavaScript for everyone else).\n\n".to_string();
    for name in &hs.calls {
        match helpers.iter().find(|h| &h.name == name) {
            Some(h) => out.push_str(&format!("```js\n{}\n```\n\n", h.source)),
            None => out.push_str(&format!("- `{name}`: read it in {}\n", hs.file)),
        }
    }
    out
}

pub fn verify(ctx: &Ctx, port: &Port) -> Result<Verify> {
    let node = ctx.runtime()?;
    let dir = ctx.crate_dir(port);
    let out = dir.join("verify.json");
    let job = json!({
        "addon": ctx.lib_dir().join(format!("{}.node", port.ext)), "js_name": port.func, "func": port.func,
        "module_file": ctx.root.join(&port.file), "cases": dir.join("recordings.jsonl"), "out": out, "budget": 0.5,
    });
    // The original may not be exported: a block appended for this run hands it to the runner from
    // inside the module, then the file goes back byte for byte.
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    let hand_over = format!("if (globalThis.__fastAnythingOriginal) globalThis.__fastAnythingOriginal({});", port.func);
    let mut patches = crate::native::Patches::new(ctx)?;
    patches.write(&file, &backend::append_marked(&text, "//", &format!("verifying {}", port.id), &hand_over))?;
    let run = runner(ctx, node, "verify", job);
    patches.restore()?;
    run?;
    let mut v: Verify = serde_json::from_str(&fs::read_to_string(&out)?).context("reading verify results")?;
    v.built = true;
    Ok(v)
}

// ------------------------------------------------------------------ the shim

/// ES module or CommonJS, the way Node decides it.
fn is_esm(root: &Path, file: &Path) -> bool {
    match file.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "mjs" | "mts" => return true,
        "cjs" | "cts" => return false,
        _ => {}
    }
    let mut dir = file.parent();
    while let Some(d) = dir {
        if let Ok(text) = fs::read_to_string(d.join("package.json")) {
            return serde_json::from_str::<Value>(&text)
                .ok()
                .and_then(|v| v["type"].as_str().map(|t| t == "module"))
                .unwrap_or(false);
        }
        if d == root {
            break;
        }
        dir = d.parent();
    }
    false
}

pub fn shim(port: &Port, addon_rel: &str, esm: bool) -> String {
    let load = if esm {
        format!("process.getBuiltinModule(\"node:module\").createRequire(import.meta.url)(\"{addon_rel}\")")
    } else {
        format!("require(\"{addon_rel}\")")
    };
    [
        "// Uses the verified Rust port. FAST_ANYTHING_DISABLE=1 runs the JavaScript above instead.".to_string(),
        format!("// Undo with:  fast-anything disable {}", port.id),
        "if (!process.env.FAST_ANYTHING_DISABLE) {".to_string(),
        "  try {".to_string(),
        format!("    {f} = {load}.{f};", f = port.func),
        "  } catch {}".to_string(),
        "}".to_string(),
    ]
    .join("\n")
}

pub fn enable(ctx: &Ctx, port: &Port) -> Result<()> {
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    let from = file.parent().context("module has no folder")?;
    let mut rel = forward_slashes(&relative(from, &ctx.lib_dir().join(format!("{}.node", port.ext))));
    if !rel.starts_with("../") {
        rel = format!("./{rel}");
    }
    let block = shim(port, &rel, is_esm(&ctx.root, &file));
    fs::write(&file, with_shim(&text, port, &block)).with_context(|| format!("writing {}", port.file))
}

pub fn disable(ctx: &Ctx, port: &Port) -> Result<()> {
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    fs::write(&file, without_shim(&text, port)).with_context(|| format!("writing {}", port.file))
}

/// Byte offset of the keyword in the top-level `[export] <keyword> <name>` declaration, if any.
/// A module can declare a name only once at the top level, so there's at most one.
fn declaration(text: &str, keyword: &str, name: &str) -> Option<usize> {
    let ident = |c: char| c.is_alphanumeric() || c == '_' || c == '$';
    let mut offset = 0;
    for line in text.split_inclusive('\n') {
        let mut rest = line;
        if let Some(r) = rest.strip_prefix("export").filter(|r| r.starts_with([' ', '\t'])) {
            rest = r.trim_start();
        }
        let at = offset + line.len() - rest.len();
        if let Some(r) = rest.strip_prefix(keyword).filter(|r| r.starts_with([' ', '\t']))
            && r.trim_start().strip_prefix(name).is_some_and(|r| !r.starts_with(ident))
        {
            return Some(at);
        }
        offset += line.len();
    }
    None
}

/// The text with the declaration of name switched from one keyword to another (const <-> let).
fn redeclare(text: &str, from: &str, to: &str, name: &str) -> Option<String> {
    let at = declaration(text, from, name)?;
    Some(format!("{}{to}{}", &text[..at], &text[at + from.len()..]))
}

/// A const can't be reassigned, so a function declared with const is declared with let while
/// fast-anything swaps it; this note in the block tells disable to put the const back.
fn let_note(name: &str) -> String {
    format!("// fast-anything declared {name} with let instead of const above; disable puts the const back.")
}

fn with_shim(text: &str, port: &Port, block: &str) -> String {
    let note = let_note(&port.func);
    let (text, swapped) = match redeclare(text, "const", "let", &port.func) {
        Some(t) => (t, true),
        None => (text.to_string(), text.contains(&note)), // already swapped by an earlier enable
    };
    let block = if swapped { format!("{block}\n{note}") } else { block.to_string() };
    add_marked(&text, &port.id, &block, port.module == "__main__")
}

fn without_shim(text: &str, port: &Port) -> String {
    let swapped = text.contains(&let_note(&port.func));
    let text = backend::strip_marked(text, "//", &port.id);
    if swapped { redeclare(&text, "let", "const", &port.func).unwrap_or(text) } else { text }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn worker_threads_are_recorded() {
        if !Command::new("node").arg("--version").output().is_ok_and(|o| o.status.success()) {
            eprintln!("no node on PATH, skipping");
            return;
        }
        let dir = std::env::temp_dir().join(format!("fa-node-workers-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("recorder.cjs"), RECORDER).unwrap();
        fs::write(
            dir.join("lib.cjs"),
            "function sq(x) {\n  return x * x;\n}\nsq = globalThis.__fastAnythingWrap ? globalThis.__fastAnythingWrap(sq) : sq;\nmodule.exports = { sq };\n",
        )
        .unwrap();
        fs::write(
            dir.join("app.cjs"),
            "const { Worker, isMainThread, parentPort } = require(\"node:worker_threads\");\n\
             const { sq } = require(\"./lib.cjs\");\n\
             if (isMainThread) {\n\
             \x20 sq(1);\n\
             \x20 for (let i = 0; i < 2; i++) new Worker(__filename).on(\"message\", (m) => console.log(m));\n\
             } else {\n\
             \x20 let t = 0;\n\
             \x20 for (let i = 0; i < 5; i++) t += sq(i);\n\
             \x20 parentPort.postMessage(t);\n\
             }\n",
        )
        .unwrap();
        let out = Command::new("node")
            .args(["--require", "./recorder.cjs", "app.cjs"])
            .current_dir(&dir)
            .env("FAST_ANYTHING_RECORD_OUT", dir.join("rec.jsonl"))
            .env("FAST_ANYTHING_RECORD_META", dir.join("rec.meta.json"))
            .env("FAST_ANYTHING_RECORD_LIMIT", "500")
            .output()
            .unwrap();
        let meta = fs::read_to_string(dir.join("rec.meta.json")).unwrap_or_default();
        let lines = fs::read_to_string(dir.join("rec.jsonl")).unwrap_or_default().lines().count();
        let leftovers = fs::read_dir(&dir)
            .unwrap()
            .filter(|e| e.as_ref().unwrap().file_name().to_string_lossy().contains(".t"))
            .count();
        let _ = fs::remove_dir_all(&dir);
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
        let meta: Value = serde_json::from_str(&meta).unwrap();
        assert_eq!((meta["calls"].clone(), lines), (json!(11), 11), "1 call in the main thread, 5 in each worker");
        assert_eq!(leftovers, 0, "worker files are absorbed and removed");
    }

    #[test]
    fn maps_typescript() {
        assert_eq!(rust_type("number").as_deref(), Some("f64"));
        assert_eq!(rust_type("string[]").as_deref(), Some("Vec<String>"));
        assert_eq!(rust_type("Array<number>").as_deref(), Some("Vec<f64>"));
        assert_eq!(rust_type("readonly number[]").as_deref(), Some("Vec<f64>"));
        assert_eq!(rust_type("number | undefined").as_deref(), Some("Option<f64>"));
        assert_eq!(rust_type("string | null").as_deref(), Some("Option<String>"));
        assert_eq!(rust_type("Float64Array").as_deref(), Some("Float64Array"));
        assert_eq!(rust_type("Uint8ClampedArray").as_deref(), Some("Uint8ClampedArray"));
        assert_eq!(rust_type("BigInt64Array"), None);
        assert_eq!(rust_type("Buffer").as_deref(), Some("Buffer"));
        assert_eq!(rust_type("Set<string>").as_deref(), Some("std::collections::HashSet<String>"));
        assert_eq!(rust_type("Set<number>"), None);
        assert_eq!(rust_type("Map<string, number>"), None);
        assert_eq!(rust_type("Record<string, number>").as_deref(), Some("std::collections::HashMap<String, f64>"));
        assert_eq!(rust_type("string | number"), None);
        assert_eq!(rust_type("[number, number][]").as_deref(), Some("Vec<Vec<f64>>"));
        assert_eq!(rust_type("[number, string]"), None);
        assert_eq!(rust_type("Point"), None);
    }

    #[test]
    fn finds_the_script() {
        let args: Vec<String> =
            ["--require", "x.cjs", "--no-warnings", "app.mjs", "data.txt"].map(String::from).to_vec();
        assert_eq!(entry(&args).map(String::as_str), Some("app.mjs"));
        assert!(is_node("node") && is_node("/usr/bin/node") && is_node("C:\\nodejs\\node.exe") && !is_node("python"));
        assert_eq!(snake("editDistance"), "edit_distance");
        assert_eq!(snake("type"), "r#type");
    }

    #[test]
    fn entry_script_blocks_go_before_the_main_block() {
        let app = "function f(x) {\n  return x;\n}\n\nif (import.meta.main) {\n  console.log(f(1));\n}\n";
        let on = add_marked(app, "app.mjs:f", "f = g;", true);
        let (block, main) = (on.find("f = g;").unwrap(), on.find("if (import.meta.main)").unwrap());
        assert!(block < main, "{on}");
        assert_eq!(backend::strip_marked(&on, "//", "app.mjs:f"), app);
        let cjs = "function f(x) {\n  return x;\n}\nif (require.main === module) main();\n";
        let on = add_marked(cjs, "app.js:f", "f = g;", true);
        assert!(on.find("f = g;").unwrap() < on.find("if (require.main").unwrap(), "{on}");
        assert!(add_marked(app, "m.f", "f = g;", false).trim_end().ends_with("// <<< fast-anything: m.f <<<"));
    }

    #[test]
    fn const_functions_switch_to_let_and_back() {
        let port = Port {
            id: "lib.pairs".into(),
            file: "lib.ts".into(),
            module: "lib".into(),
            func: "pairs".into(),
            ext: "fa_lib_pairs".into(),
            crate_dir: ".fast/ports/lib.pairs".into(),
            recorded: 1,
            calls_seen: 1,
            verify: None,
            enabled: false,
            lang: backend::Lang::Node,
            owner: None,
            line: 1,
            sources: vec![],
        };
        for original in [
            "export const pairs = (names: string[]): number => {\n  return 0;\n};\n",
            "const pairs = function (names) {\n  return 0;\n};\nmodule.exports = { pairs };\n",
            "const pairsCount = 1;\nexport  const\tpairs = (n) => n;\r\n",
        ] {
            let on = with_shim(original, &port, "pairs = rust.pairs;");
            assert!(declaration(&on, "let", "pairs").is_some() && declaration(&on, "const", "pairs").is_none(), "{on}");
            assert_eq!(on.contains("const pairsCount"), original.contains("const pairsCount"), "{on}");
            assert_eq!(with_shim(&on, &port, "pairs = rust.pairs;"), on, "enabling twice changes nothing");
            assert_eq!(without_shim(&on, &port), original);
        }
        // a function that was declared with let stays let
        let original = "let pairs = (n) => n;\n";
        let on = with_shim(original, &port, "pairs = rust.pairs;");
        assert!(!on.contains("puts the const back"));
        assert_eq!(without_shim(&on, &port), original);
    }

    #[test]
    fn shim_loads_the_addon() {
        let port = Port {
            id: "fuzzy.levenshtein".into(),
            file: "fuzzy.mjs".into(),
            module: "fuzzy".into(),
            func: "levenshtein".into(),
            ext: "fa_fuzzy_levenshtein".into(),
            crate_dir: ".fast/ports/fuzzy.levenshtein".into(),
            recorded: 1,
            calls_seen: 1,
            verify: None,
            enabled: false,
            lang: backend::Lang::Node,
            owner: None,
            line: 1,
            sources: vec![],
        };
        let esm = shim(&port, "./.fast/lib/fa_fuzzy_levenshtein.node", true);
        assert!(esm.contains("createRequire(import.meta.url)(\"./.fast/lib/fa_fuzzy_levenshtein.node\").levenshtein"));
        assert!(shim(&port, "./x.node", false).contains("levenshtein = require(\"./x.node\").levenshtein;"));
        let original = "export function levenshtein(a, b) {\n  return 0;\n}\n";
        let on = backend::append_marked(original, "//", &port.id, &esm);
        assert_eq!(backend::strip_marked(&on, "//", &port.id), original);
    }
}
