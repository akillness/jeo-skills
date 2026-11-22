//! Ruby backend. No Ruby headers or libclang needed: the port is a plain Rust library with a
//! C entry point that takes and returns JSON, called through Ruby's built-in Fiddle.
//! The same bridge works for any language that can call C.

use crate::backend::{self, Profile, Recording};
use crate::hotspot::Hotspot;
use crate::native::{cargo_toml, snake};
use crate::python::DISABLE_ENV;
use crate::state::{Ctx, Port, Verify};
use crate::util::{combined, forward_slashes, output, relative, slug, tail};
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

const RUNNER: &str = include_str!("ruby/runner.rb");
const RECORDER: &str = include_str!("ruby/recorder.rb");
const GUARDS: &[&str] = &["if__FILE__==$0", "if$0==__FILE__", "if__FILE__==$PROGRAM_NAME", "if$PROGRAM_NAME==__FILE__"];

pub fn is_ruby(program: &str) -> bool {
    let stem = crate::util::program_stem(program);
    stem == "ruby"
}

pub fn resolve(program: &str, root: &Path) -> Result<String> {
    let prog = if program.contains(['/', '\\']) { root.join(program) } else { PathBuf::from(program) };
    let out = output(Command::new(&prog).args(["-e", "puts RbConfig.ruby, RUBY_VERSION"]).current_dir(root), "ruby")?;
    ensure!(out.status.success(), "{program} failed:\n{}", tail(&combined(&out), 5));
    let text = String::from_utf8_lossy(&out.stdout).into_owned();
    let mut lines = text.lines();
    let exe = lines.next().unwrap_or_default().trim().to_string();
    let version: Vec<u32> = lines.next().unwrap_or_default().split('.').filter_map(|s| s.parse().ok()).collect();
    ensure!(version.as_slice() >= &[3, 3][..], "Ruby 3.3 or newer is needed (found {version:?})");
    Ok(exe)
}

fn main_guard(text: &str) -> Option<usize> {
    backend::line_starting(text, GUARDS)
}

fn runner(ctx: &Ctx, ruby: &str, mode: &str, job: Value, app_args: &[String]) -> Result<Output> {
    let script = ctx.fast.join("runner.rb");
    fs::write(&script, RUNNER)?;
    fs::write(ctx.fast.join("recorder.rb"), RECORDER)?;
    let job_path = ctx.fast.join(format!("job-{mode}.json"));
    fs::write(&job_path, serde_json::to_vec_pretty(&job)?)?;
    let out = output(
        Command::new(ruby)
            .arg(&script)
            .arg(mode)
            .arg(&job_path)
            .arg("--")
            .args(app_args)
            .current_dir(&ctx.root)
            .stdin(Stdio::null()),
        "ruby",
    )?;
    if !out.status.success() {
        bail!("the ruby {mode} step failed ({}):\n{}", out.status, tail(&combined(&out), 30));
    }
    Ok(out)
}

pub fn profile(ctx: &Ctx, ruby: &str, args: &[String]) -> Result<Profile> {
    let result = ctx.fast.join("profile.json");
    runner(ctx, ruby, "profile", json!({ "root": ctx.root, "out": result }), args)?;
    serde_json::from_str(&fs::read_to_string(&result)?).context("reading the profile")
}

fn owner(hs_owner: Option<&str>) -> &str {
    hs_owner.unwrap_or("Object")
}

/// Wrap the method for one run: a line appended to its file (or put before the entry script's
/// "if __FILE__ == $0" block) hands it to the preloaded recorder. The file is restored afterwards.
pub fn record(ctx: &Ctx, ruby: &str, args: &[String], hs: &Hotspot, out: &Path, limit: usize) -> Result<Recording> {
    let file = ctx.root.join(&hs.file);
    let original = fs::read_to_string(&file).with_context(|| format!("reading {}", hs.file))?;
    let backup_dir = ctx.fast.join("backup");
    fs::create_dir_all(&backup_dir)?;
    let backup = backup_dir.join(slug(&hs.file));
    fs::write(&backup, &original)?;
    let line = format!("$__fast_anything_wrap&.call({}, :{})", owner(hs.owner.as_deref()), hs.name);
    let id = format!("recording {}", hs.id);
    let patched = if hs.module.as_deref() == Some("__main__") {
        backend::insert_marked(&original, "#", &id, &line, main_guard)
    } else {
        backend::append_marked(&original, "#", &id, &line)
    };
    fs::write(&file, patched)?;
    let recorder = ctx.fast.join("recorder.rb");
    fs::write(&recorder, RECORDER)?;
    let meta = out.with_extension("meta.json");
    let run = output(
        Command::new(ruby)
            .arg(format!("-r{}", recorder.display()))
            .args(args)
            .current_dir(&ctx.root)
            .env("FAST_ANYTHING_RECORD_OUT", out)
            .env("FAST_ANYTHING_RECORD_META", &meta)
            .env("FAST_ANYTHING_RECORD_LIMIT", limit.to_string())
            .env(DISABLE_ENV, "1")
            .stdin(Stdio::null()),
        "ruby",
    );
    fs::write(&file, &original)
        .with_context(|| format!("restoring {} (a copy is in {})", hs.file, backup.display()))?;
    let _ = fs::remove_file(&backup);
    let run = run?;
    ensure!(run.status.success(), "the app failed while recording ({}):\n{}", run.status, tail(&combined(&run), 30));
    serde_json::from_str(&fs::read_to_string(&meta)?).context("reading the recording summary")
}

// ------------------------------------------------------------------ the crate (C ABI, JSON in/out)

/// A Ruby default value as JSON, if it's a simple literal.
pub fn default_json(value: &str) -> Option<String> {
    let v = value.trim();
    Some(match v {
        "nil" => "null".into(),
        "true" | "false" | "[]" | "{}" => v.into(),
        _ if v.replace('_', "").parse::<i64>().is_ok() => v.replace('_', ""),
        _ if v.parse::<f64>().is_ok() => v.into(),
        _ if v.len() >= 2
            && ((v.starts_with('"') && v.ends_with('"')) || (v.starts_with('\'') && v.ends_with('\''))) =>
        {
            serde_json::to_string(&v[1..v.len() - 1]).ok()?
        }
        _ => return None,
    })
}

pub fn port_rs(hs: &Hotspot, port: &Port) -> String {
    let params: Vec<String> = hs.params.iter().map(|p| format!("{}: serde_json::Value", snake(&p.name))).collect();
    format!(
        "//! Rust port of {id} ({file}:{line}), generated by fast-anything.\n\
         //! Replace the todo!() with a faithful, fast port, and the serde_json::Value types with real ones:\n\
         //! Integer -> i64, Float -> f64, String -> String, Array -> Vec<_>, Hash -> HashMap<String, _>, nil -> Option<_>.\n\
         //! Return Err(message) where Ruby would raise. Check it with:  fast-anything verify {id}\n\n\
         #[allow(unused_variables)]\n\
         pub fn {func}({params}) -> Result<serde_json::Value, String> {{\n    todo!(\"port {id}\")\n}}\n",
        id = port.id,
        file = hs.file,
        line = hs.line,
        func = snake(&hs.name),
        params = params.join(", "),
    )
}

fn sample_calls(path: &Path, func: &str, n: usize) -> Vec<String> {
    let Ok(text) = fs::read_to_string(path) else { return vec![] };
    let clip = |s: String, n: usize| {
        if s.chars().count() <= n { s } else { format!("{}…", s.chars().take(n - 1).collect::<String>()) }
    };
    text.lines()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .take(n)
        .map(|case| {
            let args: Vec<String> =
                case["args"].as_array().map(|a| a.iter().map(|v| v.to_string()).collect()).unwrap_or_default();
            let outcome = match case.get("raises") {
                Some(e) => format!("raises {}", e.as_str().unwrap_or("an error")),
                None => case["result"].to_string(),
            };
            format!("{}  ->  {}", clip(format!("{func}({})", args.join(", ")), 110), clip(outcome, 60))
        })
        .collect()
}

pub fn task_md(hs: &Hotspot, helpers: &[Hotspot], port: &Port, crate_dir: &Path) -> String {
    let fence = "```";
    let samples = sample_calls(&crate_dir.join("recordings.jsonl"), &hs.name, 8).join("\n");
    let mut helper_md = String::new();
    if !hs.calls.is_empty() {
        helper_md.push_str("## Helpers it calls\n\nPort these as private Rust functions in src/port.rs (they stay in Ruby for everyone else).\n\n");
        for name in &hs.calls {
            match helpers.iter().find(|h| &h.name == name) {
                Some(h) => helper_md.push_str(&format!("{fence}ruby\n{}\n{fence}\n\n", h.source)),
                None => helper_md.push_str(&format!("- `{name}`: read it in {}\n", hs.file)),
            }
        }
    }
    format!(
        "# Port `{id}` to Rust\n\n\
You're in a Rust crate fast-anything generated for this: `{dir}`.\n\
Write `{func}` in `src/port.rs` so it behaves **exactly** like the Ruby below, and runs fast.\n\
`src/lib.rs` is generated glue (JSON in, JSON out through a C entry point): don't edit it.\n\
Only edit files in this folder. Don't touch the Ruby project.\n\n\
## The original ({file}:{line})\n\n{fence}ruby\n{source}\n{fence}\n\n\
{helper_md}\
## Real calls\n\n\
fast-anything recorded {recorded} real calls (out of {seen} while the app ran). Arguments arrive as JSON. A few:\n\n{fence}\n{samples}\n{fence}\n\n\
## Rules\n\n\
- Same result for every input, edge cases included: empty input, zero, negatives, NaN and infinity, non-ASCII text, very long input. verify tests these too.\n\
- Change the `serde_json::Value` parameter and return types to concrete ones: they're deserialized for you.\n\
- Ruby strings index by character: use `.chars()` (or bytes only after checking `is_ascii()`).\n\
- Ruby Integers don't overflow. `i64` is fine unless the recorded values are bigger. Keep Integer vs Float as Ruby has it.\n\
- Hash keys arrive as strings; return `Err(message)` where Ruby would raise.\n\
- Make it fast: no needless allocation, borrow, `with_capacity`, fast paths for common cases.\n\
- Keep the function name.\n\n\
## Check\n\n\
Run `cargo check` here. Then fast-anything builds the crate in release mode and replays all recorded calls against it\n\
(`fast-anything verify {id}`).\n",
        id = port.id,
        dir = crate_dir.display(),
        func = hs.name,
        file = hs.file,
        line = hs.line,
        source = hs.source,
        recorded = port.recorded,
        seen = crate::util::thousands(port.calls_seen),
    )
}

pub fn scaffold(ctx: &Ctx, hs: &Hotspot, helpers: &[Hotspot], port: &Port) -> Result<String> {
    let dir = ctx.crate_dir(port);
    fs::create_dir_all(dir.join("src"))?;
    fs::create_dir_all(dir.join(".cargo"))?;
    fs::write(dir.join("Cargo.toml"), cargo_toml(port))?;
    fs::write(dir.join(".cargo/config.toml"), backend::CARGO_CONFIG)?;
    fs::write(dir.join("src/lib.rs"), crate::native::glue_rs(hs, port, default_json))?;
    let body = dir.join("src/port.rs");
    if !body.exists() {
        fs::write(&body, port_rs(hs, port))?;
    }
    let task = task_md(hs, helpers, port, &dir);
    fs::write(dir.join("TASK.md"), &task)?;
    Ok(task)
}

pub fn verify(ctx: &Ctx, port: &Port) -> Result<Verify> {
    let ruby = ctx.runtime()?;
    let dir = ctx.crate_dir(port);
    let out = dir.join("verify.json");
    let (_, lib) = backend::Lang::Ruby.artifact(&port.ext);
    let job = json!({
        "lib": ctx.lib_dir().join(lib), "func": port.func, "owner": owner(port.owner.as_deref()),
        "module_file": ctx.root.join(&port.file), "cases": dir.join("recordings.jsonl"), "out": out, "budget": 0.5,
    });
    runner(ctx, ruby, "verify", job, &[])?;
    let mut v: Verify = serde_json::from_str(&fs::read_to_string(&out)?).context("reading verify results")?;
    v.built = true;
    Ok(v)
}

// ------------------------------------------------------------------ the shim

pub fn shim(port: &Port, lib_rel: &str) -> String {
    let owner = owner(port.owner.as_deref());
    let name = &port.func;
    let mut lines = vec![
        "# Uses the verified Rust port. FAST_ANYTHING_DISABLE=1 runs the Ruby above instead.".to_string(),
        format!("# Undo with:  fast-anything disable {}", port.id),
        "unless ENV[\"FAST_ANYTHING_DISABLE\"]".to_string(),
        "  begin".to_string(),
        "    require \"fiddle\"".to_string(),
        "    require \"json\"".to_string(),
        format!("    -> {{\n      lib = Fiddle.dlopen(File.expand_path(\"{lib_rel}\", __dir__))"),
        "      call = Fiddle::Function.new(lib[\"fa_call\"], [Fiddle::TYPE_VOIDP, Fiddle::TYPE_SIZE_T, Fiddle::TYPE_VOIDP], Fiddle::TYPE_VOIDP)".to_string(),
        "      free = Fiddle::Function.new(lib[\"fa_free\"], [Fiddle::TYPE_VOIDP, Fiddle::TYPE_SIZE_T], Fiddle::TYPE_VOID)".to_string(),
        format!("      {owner}.send(:define_method, :{name}) do |*args|"),
        "        input = JSON.generate(args)".to_string(),
        "        size = Fiddle::Pointer.malloc(Fiddle::SIZEOF_SIZE_T, Fiddle::RUBY_FREE)".to_string(),
        "        out = call.call(input, input.bytesize, size)".to_string(),
        "        len = size[0, Fiddle::SIZEOF_SIZE_T].unpack1(\"J\")".to_string(),
        "        reply = JSON.parse(out[0, len].force_encoding(Encoding::UTF_8))".to_string(),
        "        free.call(out, len)".to_string(),
        "        raise reply[\"error\"] if reply.key?(\"error\")".to_string(),
        "        reply[\"ok\"]".to_string(),
        "      end".to_string(),
    ];
    if owner == "Object" {
        lines.push(format!("      Object.send(:private, :{name})"));
    }
    lines.extend([
        "    }.call".to_string(),
        "  rescue LoadError, Fiddle::DLError".to_string(),
        "  end".to_string(),
        "end".to_string(),
    ]);
    lines.join("\n")
}

pub fn enable(ctx: &Ctx, port: &Port) -> Result<()> {
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    let from = file.parent().context("file has no folder")?;
    let (_, lib) = backend::Lang::Ruby.artifact(&port.ext);
    let rel = forward_slashes(&relative(from, &ctx.lib_dir().join(lib)));
    let block = shim(port, &rel);
    let patched = if port.module == "__main__" {
        backend::insert_marked(&text, "#", &port.id, &block, main_guard)
    } else {
        backend::append_marked(&text, "#", &port.id, &block)
    };
    fs::write(&file, patched).with_context(|| format!("writing {}", port.file))
}

pub fn disable(ctx: &Ctx, port: &Port) -> Result<()> {
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    fs::write(&file, backend::strip_marked(&text, "#", &port.id)).with_context(|| format!("writing {}", port.file))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ruby_defaults_become_json() {
        assert_eq!(default_json("2").as_deref(), Some("2"));
        assert_eq!(default_json("1_000").as_deref(), Some("1000"));
        assert_eq!(default_json("nil").as_deref(), Some("null"));
        assert_eq!(default_json("'a'").as_deref(), Some("\"a\""));
        assert_eq!(default_json("[]").as_deref(), Some("[]"));
        assert_eq!(default_json("SOME_CONST"), None);
        assert!(is_ruby("ruby") && is_ruby("C:\\Ruby40-x64\\bin\\ruby.exe") && !is_ruby("rubocop"));
    }
}
