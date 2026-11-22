//! PHP backend: apps run as  php app.php. Profiled by a one-line timer put into every function
//! for one run, read with PHP's own tokenizer, and bridged with PHP's FFI extension.

use crate::backend::{self, Profile, Recording};
use crate::hotspot::{Hotspot, Param};
use crate::native::{self, Flavor, Patches};
use crate::python::DISABLE_ENV;
use crate::state::{Ctx, Port, Verify};
use crate::util::{self, combined, output, tail};
use anyhow::{Context, Result, bail, ensure};
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const DESCRIBE: &str = include_str!("php/describe.php");
const PROF: &str = include_str!("php/prof.php");
const REC: &str = include_str!("php/rec.php");
const BRIDGE: &str = include_str!("php/bridge.php");
/// php options that take the next argument as their value.
const VALUE_OPTS: &[&str] = &["-d", "-c", "-z"];

pub fn is_php(program: &str) -> bool {
    let stem = util::program_stem(program);
    stem == "php" || (stem.starts_with("php") && stem[3..].chars().all(|c| c.is_ascii_digit() || c == '.'))
}

pub fn resolve(program: &str, root: &Path) -> Result<String> {
    let prog = if program.contains(['/', '\\']) { root.join(program) } else { PathBuf::from(program) };
    let out =
        output(Command::new(&prog).args(["-r", "echo PHP_BINARY, PHP_EOL, PHP_VERSION;"]).current_dir(root), "php")?;
    ensure!(out.status.success(), "{program} failed:\n{}", tail(&combined(&out), 5));
    let text = String::from_utf8_lossy(&out.stdout).into_owned();
    let mut lines = text.lines();
    let exe = lines.next().unwrap_or_default().trim().to_string();
    let version: Vec<u32> = lines.next().unwrap_or_default().split('.').filter_map(|s| s.parse().ok()).collect();
    ensure!(version.as_slice() >= &[8, 1][..], "PHP 8.1 or newer is needed (found {version:?})");
    Ok(exe)
}

/// The script in  php [options] app.php [args].
fn entry(args: &[String]) -> Result<&str> {
    let mut i = 0;
    while i < args.len() && args[i].starts_with('-') {
        if args[i] == "-f" {
            return args.get(i + 1).map(String::as_str).context("-f needs a file");
        }
        i += if VALUE_OPTS.contains(&args[i].as_str()) { 2 } else { 1 };
    }
    args.get(i).map(String::as_str).filter(|f| f.ends_with(".php")).context("run the app as  php app.php")
}

fn source_files(root: &Path, entry: &str) -> Vec<PathBuf> {
    let start = root.join(entry).parent().map(Path::to_path_buf).unwrap_or_else(|| root.to_path_buf());
    let mut out = Vec::new();
    let mut stack = vec![start];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if p.is_dir() {
                if !name.starts_with('.') && !["vendor", "node_modules", "cache", "var"].contains(&name.as_str()) {
                    stack.push(p);
                }
            } else if name.ends_with(".php") {
                out.push(p);
            }
        }
    }
    out
}

#[derive(Deserialize, Clone)]
struct Func {
    path: PathBuf,
    name: String,
    class: Option<String>,
    qualname: String,
    line: u32,
    end_line: u32,
    body_offset: usize,
    params: Vec<Param>,
    returns: Option<String>,
    blockers: Vec<String>,
    warnings: Vec<String>,
    calls: Vec<String>,
    source: String,
}

fn describe(ctx: &Ctx, php: &str, files: &[PathBuf]) -> Result<Vec<Func>> {
    let script = ctx.fast.join("describe.php");
    fs::write(&script, DESCRIBE)?;
    let list = ctx.fast.join("php-files.txt");
    fs::write(&list, files.iter().map(|f| f.to_string_lossy().into_owned()).collect::<Vec<_>>().join("\n"))?;
    let out = ctx.fast.join("php-funcs.json");
    let run =
        output(Command::new(php).arg(&script).arg(&list).arg(&out).current_dir(&ctx.root).stdin(Stdio::null()), "php")?;
    ensure!(run.status.success(), "reading the PHP sources failed:\n{}", tail(&combined(&run), 20));
    serde_json::from_str(&fs::read_to_string(&out)?).context("reading the function list")
}

fn rel(ctx: &Ctx, p: &Path) -> String {
    util::forward_slashes(p.strip_prefix(&ctx.root).unwrap_or(p))
}

fn hotspot(ctx: &Ctx, f: &Func, calls: u64, own: f64, cum: f64) -> Hotspot {
    let file = rel(ctx, &f.path);
    Hotspot {
        module: Some(file.trim_end_matches(".php").replace('/', ".")),
        file,
        line: f.line,
        end_line: f.end_line,
        name: f.name.clone(),
        qualname: f.qualname.clone(),
        kind: "function".into(),
        ncalls: calls,
        tottime: own,
        cumtime: cum,
        portability: if f.blockers.is_empty() { 0.9 } else { 0.0 },
        blockers: f.blockers.clone(),
        warnings: f.warnings.clone(),
        params: f.params.clone(),
        returns: f.returns.clone(),
        source: f.source.clone(),
        calls: f.calls.clone(),
        owner: f.class.clone(),
        ..Hotspot::default()
    }
}

/// Insert text right after the { of each function (same line: no line numbers move).
fn insert_at(text: &str, mut at: Vec<(usize, String)>) -> String {
    at.sort_by_key(|a| std::cmp::Reverse(a.0));
    let mut out = text.to_string();
    for (offset, piece) in at {
        out.insert_str(offset, &piece);
    }
    out
}

fn run_php(
    ctx: &Ctx,
    php: &str,
    prepend: &Path,
    args: &[String],
    env: &[(&str, &Path)],
) -> Result<std::process::Output> {
    let mut cmd = Command::new(php);
    cmd.arg("-d")
        .arg(format!("auto_prepend_file={}", prepend.display()))
        .args(args)
        .current_dir(&ctx.root)
        .env(DISABLE_ENV, "1")
        .stdin(Stdio::null());
    for (k, v) in env {
        cmd.env(k, v);
    }
    output(&mut cmd, "php")
}

pub fn profile(ctx: &Ctx, php: &str, args: &[String]) -> Result<Profile> {
    let funcs = describe(ctx, php, &source_files(&ctx.root, entry(args)?))?;
    let mut by_file: BTreeMap<&Path, Vec<(usize, String)>> = BTreeMap::new();
    for (i, f) in funcs.iter().enumerate() {
        if !f.blockers.iter().any(|b| b.contains("generator")) {
            by_file
                .entry(&f.path)
                .or_default()
                .push((f.body_offset, format!(" $__faP = new \\FastAnythingProf({i});")));
        }
    }
    let prof = ctx.fast.join("prof.php");
    fs::write(&prof, PROF)?;
    let out = ctx.fast.join("profile.json");
    let _ = fs::remove_file(&out);
    let mut patches = Patches::new(ctx)?;
    for (path, at) in by_file {
        let text = fs::read_to_string(path)?;
        patches.write(path, &insert_at(&text, at))?;
    }
    let run = run_php(ctx, php, &prof, args, &[("FAST_ANYTHING_PROF_OUT", &out)]);
    patches.restore()?;
    let run = run?;
    ensure!(run.status.success(), "the app failed ({}):\n{}", run.status, tail(&combined(&run), 30));
    let result: Value = serde_json::from_str(&fs::read_to_string(&out).context("the profiler wrote nothing")?)?;
    let wall = result["wall"].as_f64().unwrap_or(0.0);
    let stats = result["stats"].as_object().cloned().unwrap_or_default();
    let stat = |i: usize| stats.get(&i.to_string()).and_then(Value::as_array).cloned();
    let mut functions = Vec::new();
    for (i, f) in funcs.iter().enumerate() {
        let helper =
            funcs.iter().enumerate().any(|(j, g)| stat(j).is_some() && g.path == f.path && g.calls.contains(&f.name));
        match stat(i) {
            Some(s) => functions.push(hotspot(
                ctx,
                f,
                s[0].as_u64().unwrap_or(0),
                s[1].as_f64().unwrap_or(0.0),
                s[2].as_f64().unwrap_or(0.0),
            )),
            None if helper => functions.push(hotspot(ctx, f, 0, 0.0, 0.0)),
            None => {}
        }
    }
    Ok(Profile { wall, base: ".".into(), functions })
}

fn name_const(hs: &Hotspot) -> &'static str {
    if hs.owner.is_some() { "__METHOD__" } else { "__FUNCTION__" }
}

pub fn record(ctx: &Ctx, php: &str, args: &[String], hs: &Hotspot, out: &Path, limit: usize) -> Result<Recording> {
    let file = ctx.root.join(&hs.file);
    let funcs = describe(ctx, php, std::slice::from_ref(&file))?;
    let f = funcs
        .iter()
        .filter(|f| f.qualname == hs.qualname)
        .min_by_key(|f| (f.line as i64 - hs.line as i64).abs())
        .with_context(|| format!("{} isn't in {} any more: scan again", hs.qualname, hs.file))?;
    let call = if hs.owner.is_some() { format!("self::{}", hs.name) } else { hs.name.clone() };
    let line = format!(
        " if (!\\FastAnythingRec::$inside) return \\FastAnythingRec::record({}, func_get_args(), static fn(...$__faA) => {call}(...$__faA));",
        name_const(hs)
    );
    let text = fs::read_to_string(&file)?;
    let rec = ctx.fast.join("rec.php");
    fs::write(&rec, REC)?;
    let meta = out.with_extension("meta.json");
    let _ = fs::remove_file(&meta);
    let mut patches = Patches::new(ctx)?;
    patches.write(&file, &insert_at(&text, vec![(f.body_offset, line)]))?;
    let run = run_php(ctx, php, &rec, args, &[("FAST_ANYTHING_RECORD_OUT", out), ("FAST_ANYTHING_RECORD_META", &meta)]);
    patches.restore()?;
    let run = run?;
    ensure!(run.status.success(), "the app failed while recording ({}):\n{}", run.status, tail(&combined(&run), 30));
    let mut rec: Recording = serde_json::from_str(&fs::read_to_string(&meta).context("the recorder wrote nothing")?)?;
    rec.kept = rec.kept.min(limit.max(rec.kept));
    Ok(rec)
}

// ------------------------------------------------------------------ the crate

/// Rust type for a PHP type declaration (arrays stay serde_json::Value: their shape is in the recordings).
pub fn rust_type(t: &str) -> Option<String> {
    let t = t.trim().to_ascii_lowercase();
    if let Some(inner) = t.strip_prefix('?') {
        return Some(format!("Option<{}>", rust_type(inner)?));
    }
    Some(match t.as_str() {
        "int" => "i64".into(),
        "float" => "f64".into(),
        "string" => "String".into(),
        "bool" => "bool".into(),
        _ => return None,
    })
}

/// A PHP default value as JSON, if it's a simple literal.
pub fn default_json(value: &str) -> Option<String> {
    let v = value.trim();
    let lower = v.to_ascii_lowercase();
    Some(match lower.as_str() {
        "null" | "true" | "false" => lower,
        "[]" | "array()" => "[]".into(),
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

pub const FLAVOR: Flavor = Flavor {
    lang: backend::Lang::Php,
    fence: "php",
    rust_type,
    default_json,
    rules: &[
        "PHP strings are bytes: `strlen`, `substr` and `$s[$i]` work on bytes, `mb_*` functions on characters. Match what the original uses.",
        "Lists arrive as JSON arrays, string-keyed arrays as JSON objects (keys in order). An empty array is `[]` either way.",
        "PHP ints are `i64` and turn into floats on overflow; `/` gives a float unless the division is exact, `intdiv` truncates.",
        "Untyped parameters arrive as `serde_json::Value`: pick concrete types from the recorded calls.",
    ],
};

pub fn scaffold(ctx: &Ctx, hs: &Hotspot, helpers: &[Hotspot], port: &Port) -> Result<String> {
    native::scaffold(ctx, hs, helpers, port, &FLAVOR)
}

pub fn verify(ctx: &Ctx, port: &Port) -> Result<Verify> {
    native::verify(ctx, port, true)
}

// ------------------------------------------------------------------ the bridge

fn bridge_class(port: &Port) -> String {
    format!("FastAnything_{}", util::slug(&port.id))
}

fn find_body(name: &str, hint: u32) -> impl Fn(&str) -> Option<usize> {
    let header = format!("function {name}(");
    let spaced = format!("function {name} (");
    move |text: &str| native::body_line(text, hint, |l| l.contains(&header) || l.contains(&spaced))
}

pub fn enable(ctx: &Ctx, port: &Port) -> Result<()> {
    let hs = ctx
        .state
        .hotspots
        .iter()
        .find(|h| h.id == port.id)
        .with_context(|| format!("{} isn't in the last scan", port.id))?;
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    ensure!(
        !text.trim_end().ends_with("?>"),
        "{} ends with ?>: remove the closing tag so code can follow it",
        port.file
    );
    if text.contains("namespace ")
        && text.lines().any(|l| l.trim_start().starts_with("namespace ") && l.trim_end().ends_with('{'))
    {
        bail!("{} uses braced namespaces, which fast-anything can't add code to yet", port.file);
    }
    let class = bridge_class(port);
    let from = file.parent().context("file has no folder")?;
    let (_, lib) = port.lang.artifact(&port.ext);
    let lib_rel = util::forward_slashes(&util::relative(from, &ctx.lib_dir().join(lib)));
    let lib_lit = format!("'{}'", lib_rel.replace('\\', "\\\\").replace('\'', "\\'"));
    let bridge = BRIDGE.replace("/*CLASS*/", &class).replace("/*ID*/", &port.id).replace("/*LIB*/", &lib_lit);
    let prologue =
        format!("if ({class}::$on ?? {class}::load()) return {class}::call({}, func_get_args());", name_const(hs));
    let patched =
        native::insert_in_body(&text, "//", &port.id, &prologue, find_body(&port.func, port.line.max(hs.line)))?;
    let patched = backend::append_marked(&patched, "//", &format!("{} bridge", port.id), &bridge);
    fs::write(&file, patched).with_context(|| format!("writing {}", port.file))
}

pub fn disable(ctx: &Ctx, port: &Port) -> Result<()> {
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    let text = native::strip_in_body(&text, "//", &port.id);
    let text = backend::strip_marked(&text, "//", &format!("{} bridge", port.id));
    fs::write(&file, text).with_context(|| format!("writing {}", port.file))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn php_bits() {
        assert!(is_php("php") && is_php("php8.3") && is_php("C:\\php\\php.exe") && !is_php("phpunit"));
        let s = |v: &[&str]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();
        assert_eq!(entry(&s(&["-d", "memory_limit=1G", "app.php", "x"])).unwrap(), "app.php");
        assert_eq!(default_json("0.85").as_deref(), Some("0.85"));
        assert_eq!(default_json("NULL").as_deref(), Some("null"));
        assert_eq!(default_json("array()").as_deref(), Some("[]"));
        assert_eq!(rust_type("?int").as_deref(), Some("Option<i64>"));
        assert_eq!(insert_at("function f() {\n}", vec![(14, " X;".into())]), "function f() { X;\n}");
    }
}
