//! Go backend: apps run as  go run .  (or a package path, or a list of files). fast-anything builds
//! the binary itself, so timing never includes the compiler. Profiled with runtime/pprof, read with
//! go/parser, and bridged with the Windows loader or dlopen through cgo elsewhere.

use crate::backend::{self, Profile, Recording};
use crate::hotspot::{Hotspot, Param};
use crate::native::{self, Flavor, Patches};
use crate::python::DISABLE_ENV;
use crate::state::{Ctx, Port, Verify};
use crate::util::{self, combined, output, tail};
use anyhow::{Context, Result, bail, ensure};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

const DESCRIBE: &str = include_str!("golang/describe.go");
const REC: &str = include_str!("golang/rec.go");
const HOOKS: &str = include_str!("golang/hooks.go");
const BRIDGE: &str = include_str!("golang/bridge.go");
const BRIDGE_WINDOWS: &str = include_str!("golang/bridge_windows.go");
const BRIDGE_UNIX: &str = include_str!("golang/bridge_unix.go");
const BRIDGE_NOCGO: &str = include_str!("golang/bridge_nocgo.go");
/// go build flags that take the next argument as their value.
const VALUE_FLAGS: &[&str] = &[
    "-C",
    "-p",
    "-tags",
    "-ldflags",
    "-gcflags",
    "-asmflags",
    "-mod",
    "-modfile",
    "-pgo",
    "-exec",
    "-overlay",
    "-toolexec",
];

pub fn is_go(program: &str) -> bool {
    util::program_stem(program) == "go"
}

pub fn resolve(program: &str, root: &Path) -> Result<String> {
    let prog = if program.contains(['/', '\\']) { root.join(program) } else { PathBuf::from(program) };
    let out = output(Command::new(&prog).args(["env", "GOROOT", "GOVERSION"]).current_dir(root), "go")?;
    ensure!(out.status.success(), "{program} failed:\n{}", tail(&combined(&out), 5));
    let text = String::from_utf8_lossy(&out.stdout).into_owned();
    let mut lines = text.lines();
    let goroot = lines.next().unwrap_or_default().trim().to_string();
    let version: Vec<u32> = lines
        .next()
        .unwrap_or_default()
        .trim()
        .trim_start_matches("go")
        .split('.')
        .filter_map(|s| s.parse().ok())
        .collect();
    ensure!(version.as_slice() >= &[1, 22][..], "Go 1.22 or newer is needed (found {version:?})");
    let exe = Path::new(&goroot).join("bin").join(if cfg!(windows) { "go.exe" } else { "go" });
    Ok(exe.to_string_lossy().into_owned())
}

/// go run [build flags] <package | files...> [app args]
struct GoRun {
    flags: Vec<String>,
    targets: Vec<String>,
    args: Vec<String>,
}

impl GoRun {
    fn parse(args: &[String]) -> Result<GoRun> {
        ensure!(
            args.first().map(String::as_str) == Some("run"),
            "start the command with  go run  (e.g.  fast-anything scan -- go run .)"
        );
        let mut i = 1;
        let mut flags = Vec::new();
        while i < args.len() && args[i].starts_with('-') {
            flags.push(args[i].clone());
            if VALUE_FLAGS.contains(&args[i].as_str()) && i + 1 < args.len() {
                flags.push(args[i + 1].clone());
                i += 1;
            }
            i += 1;
        }
        let mut targets = Vec::new();
        while i < args.len() && args[i].ends_with(".go") {
            targets.push(args[i].clone());
            i += 1;
        }
        if targets.is_empty() {
            let pkg = args.get(i).context("go run needs a package:  go run .")?;
            ensure!(
                pkg.starts_with('.') || Path::new(pkg).is_absolute(),
                "use a local package path like  go run .  or  go run ./cmd/app"
            );
            targets.push(pkg.clone());
            i += 1;
        }
        Ok(GoRun { flags, targets, args: args[i..].to_vec() })
    }

    fn files_mode(&self) -> bool {
        self.targets[0].ends_with(".go")
    }

    /// Folder of the main package.
    fn main_dir(&self, root: &Path) -> PathBuf {
        let t = Path::new(&self.targets[0]);
        let dir = if self.files_mode() { t.parent().unwrap_or(Path::new(".")) } else { t };
        util::absolute(&root.join(dir))
    }
}

fn binary(ctx: &Ctx) -> PathBuf {
    ctx.fast.join("bin").join(if cfg!(windows) { "app.exe" } else { "app" })
}

/// go build the app into .fast/bin, with extra generated files in the main package.
fn build(ctx: &Ctx, go: &str, run: &GoRun, extra: &[PathBuf]) -> Result<PathBuf> {
    let bin = binary(ctx);
    fs::create_dir_all(bin.parent().context("bin")?)?;
    let mut targets = run.targets.clone();
    if run.files_mode() {
        targets.extend(extra.iter().map(|p| p.to_string_lossy().into_owned()));
    }
    let out = output(
        Command::new(go).arg("build").args(&run.flags).arg("-o").arg(&bin).args(&targets).current_dir(&ctx.root),
        "go",
    )?;
    ensure!(out.status.success(), "go build failed:\n{}", tail(&combined(&out), 30));
    Ok(bin)
}

/// The command bench times: the binary, built once.
pub fn bench_command(ctx: &Ctx, go: &str) -> Result<(String, Vec<String>)> {
    let run = GoRun::parse(&ctx.state.command[1..])?;
    let bin = build(ctx, go, &run, &[])?;
    Ok((bin.to_string_lossy().into_owned(), run.args))
}

#[derive(Deserialize, Clone)]
struct Func {
    symbol: String,
    package: String,
    pkg_name: String,
    path: PathBuf,
    name: String,
    line: u32,
    end_line: u32,
    params: Vec<Param>,
    returns: Option<String>,
    blockers: Vec<String>,
    warnings: Vec<String>,
    calls: Vec<String>,
    source: String,
}

fn describe(ctx: &Ctx, go: &str) -> Result<Vec<Func>> {
    let dir = ctx.fast.join("describe");
    fs::create_dir_all(&dir)?;
    fs::write(dir.join("describe.go"), DESCRIBE)?;
    let out = ctx.fast.join("go-funcs.json");
    let run = output(
        Command::new(go)
            .args(["run", "describe.go"])
            .arg(&ctx.root)
            .arg(&out)
            .current_dir(&dir)
            .env("GO111MODULE", "off")
            .stdin(Stdio::null()),
        "go",
    )?;
    ensure!(run.status.success(), "reading the Go sources failed:\n{}", tail(&combined(&run), 20));
    serde_json::from_str(&fs::read_to_string(&out)?).context("reading the function list")
}

fn module_of(ctx: &Ctx, f: &Func) -> String {
    if f.package == "main" {
        return "main".into();
    }
    let dir = f.path.parent().unwrap_or(&ctx.root);
    let rel = util::forward_slashes(dir.strip_prefix(&ctx.root).unwrap_or(dir));
    if rel.is_empty() { f.pkg_name.clone() } else { rel.replace('/', ".") }
}

fn hotspot(ctx: &Ctx, f: &Func, flat: f64, cum: f64) -> Hotspot {
    Hotspot {
        file: util::forward_slashes(f.path.strip_prefix(&ctx.root).unwrap_or(&f.path)),
        line: f.line,
        end_line: f.end_line,
        name: f.name.clone(),
        qualname: f.name.clone(),
        module: Some(module_of(ctx, f)),
        kind: "function".into(),
        tottime: flat,
        cumtime: cum,
        portability: if f.blockers.is_empty() { 0.9 } else { 0.0 },
        blockers: f.blockers.clone(),
        warnings: f.warnings.clone(),
        params: f.params.clone(),
        returns: f.returns.clone(),
        source: f.source.clone(),
        calls: f.calls.clone(),
        owner: Some(f.symbol.clone()),
        ..Hotspot::default()
    }
}

fn find_body(name: &str, hint: u32) -> impl Fn(&str) -> Option<usize> {
    let header = format!("func {name}(");
    let generic = format!("func {name}[");
    move |text: &str| native::body_line(text, hint, |l| l.starts_with(&header) || l.starts_with(&generic))
}

/// Generated files and a deferred hook in main, for one build. Undone by the returned Patches.
fn instrument(
    ctx: &Ctx,
    funcs: &[Func],
    run: &GoRun,
    extra: Vec<(PathBuf, String)>,
) -> Result<(Patches, Vec<PathBuf>)> {
    let main_dir = run.main_dir(&ctx.root);
    let main = funcs
        .iter()
        .find(|f| {
            f.package == "main" && f.name == "main" && f.path.parent().map(util::absolute) == Some(main_dir.clone())
        })
        .context("no func main() in the main package")?;
    let mut patches = Patches::new(ctx)?;
    let text = fs::read_to_string(&main.path)?;
    let hooked =
        native::insert_in_body(&text, "//", "hooks", "defer fastAnythingDone()", find_body("main", main.line))?;
    let hooks = main_dir.join("fast_anything_hooks.go");
    patches.write(&hooks, HOOKS)?;
    patches.write(&main.path, &hooked)?;
    let mut created = vec![hooks];
    for (path, text) in extra {
        if path.extension().is_some_and(|e| e == "go")
            && !fs::read_to_string(&path).is_ok_and(|t| t.contains(">>> fast-anything"))
        {
            created.push(path.clone());
        }
        patches.write(&path, &text)?;
    }
    created.retain(|p| p.parent() == Some(main_dir.as_path()));
    Ok((patches, created))
}

fn parse_duration(s: &str) -> Option<f64> {
    let s = s.trim();
    if s == "0" {
        return Some(0.0);
    }
    let split = s.find(|c: char| c.is_ascii_alphabetic() || c == 'µ')?;
    let (num, unit) = s.split_at(split);
    let n: f64 = num.parse().ok()?;
    Some(match unit {
        "ns" => n * 1e-9,
        "us" | "µs" => n * 1e-6,
        "ms" => n * 1e-3,
        "s" => n,
        "mins" | "min" => n * 60.0,
        "hrs" | "h" => n * 3600.0,
        _ => return None,
    })
}

/// (flat, cum) seconds per symbol from  go tool pprof -top.
fn parse_top(text: &str) -> HashMap<String, (f64, f64)> {
    let mut out = HashMap::new();
    let mut rows = false;
    for line in text.lines() {
        if line.trim_start().starts_with("flat") {
            rows = true;
            continue;
        }
        if !rows {
            continue;
        }
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 6 {
            continue;
        }
        let (Some(flat), Some(cum)) = (parse_duration(cols[0]), parse_duration(cols[3])) else { continue };
        let name = cols[5..].join(" ");
        let name = name.trim_end_matches(" (inline)").to_string();
        let e = out.entry(name).or_insert((0.0, 0.0));
        e.0 += flat;
        e.1 = f64::max(e.1, cum);
    }
    out
}

pub fn profile(ctx: &Ctx, go: &str, args: &[String]) -> Result<Profile> {
    let run = GoRun::parse(args)?;
    let funcs = describe(ctx, go)?;
    let (mut patches, extra) = instrument(ctx, &funcs, &run, vec![])?;
    let bin = build(ctx, go, &run, &extra);
    patches.restore()?;
    let bin = bin?;
    let pprof = ctx.fast.join("cpu.pprof");
    let _ = fs::remove_file(&pprof);
    let started = Instant::now();
    let out = output(
        Command::new(&bin)
            .args(&run.args)
            .current_dir(&ctx.root)
            .env("FAST_ANYTHING_PPROF", &pprof)
            .env(DISABLE_ENV, "1")
            .stdin(Stdio::null()),
        "the app",
    )?;
    let wall = started.elapsed().as_secs_f64();
    ensure!(out.status.success(), "the app failed ({}):\n{}", out.status, tail(&combined(&out), 30));
    ensure!(pprof.exists(), "no profile was written: does main return normally (no os.Exit)?");
    let top = output(
        Command::new(go).args(["tool", "pprof", "-top", "-cum", "-nodecount=1000"]).arg(&bin).arg(&pprof),
        "go tool pprof",
    )?;
    ensure!(top.status.success(), "reading the profile failed:\n{}", tail(&combined(&top), 10));
    let times = parse_top(&String::from_utf8_lossy(&top.stdout));
    let mut functions: Vec<Hotspot> = Vec::new();
    for f in &funcs {
        let sampled = times.get(&f.symbol).copied();
        let helper = funcs
            .iter()
            .any(|g| times.contains_key(&g.symbol) && g.path.parent() == f.path.parent() && g.calls.contains(&f.name));
        if sampled.is_some() || helper {
            let (flat, cum) = sampled.unwrap_or_default();
            functions.push(hotspot(ctx, f, flat, cum));
        }
    }
    Ok(Profile { wall, base: ".".into(), functions })
}

fn pkg_name(ctx: &Ctx, hs: &Hotspot) -> Result<String> {
    let text = fs::read_to_string(ctx.root.join(&hs.file))?;
    text.lines()
        .find_map(|l| l.trim().strip_prefix("package ").map(|p| p.trim().to_string()))
        .context("no package clause")
}

fn arg_list(hs: &Hotspot) -> String {
    hs.params.iter().map(|p| p.name.as_str()).collect::<Vec<_>>().join(", ")
}

fn ret(hs: &Hotspot) -> String {
    hs.returns.clone().unwrap_or_default()
}

pub fn record(ctx: &Ctx, go: &str, args: &[String], hs: &Hotspot, out: &Path, limit: usize) -> Result<Recording> {
    let run = GoRun::parse(args)?;
    let funcs = describe(ctx, go)?;
    let file = ctx.root.join(&hs.file);
    let text = fs::read_to_string(&file)?;
    let casts: Vec<String> = hs
        .params
        .iter()
        .enumerate()
        .map(|(i, p)| format!("a[{i}].({})", p.annotation.as_deref().unwrap_or("any")))
        .collect();
    let prologue = format!(
        "if !fastAnythingRecInside {{\n\treturn fastAnythingRec([]any{{{args}}}, func(a []any) any {{ return {name}({casts}) }}).({ret})\n}}",
        args = arg_list(hs),
        name = hs.name,
        casts = casts.join(", "),
        ret = ret(hs),
    );
    let patched =
        native::insert_in_body(&text, "//", &format!("recording {}", hs.id), &prologue, find_body(&hs.name, hs.line))?;
    let rec = REC.replace("/*PKG*/", &pkg_name(ctx, hs)?).replace("/*ID*/", &hs.id);
    let rec_path = native::sibling(&file, "fast_anything_rec.go")?;
    let (mut patches, extra) = instrument(ctx, &funcs, &run, vec![(rec_path, rec), (file.clone(), patched)])?;
    let bin = build(ctx, go, &run, &extra);
    patches.restore()?;
    let bin = bin?;
    let meta = out.with_extension("meta.json");
    let _ = fs::remove_file(&meta);
    let app = output(
        Command::new(&bin)
            .args(&run.args)
            .current_dir(&ctx.root)
            .env("FAST_ANYTHING_RECORD_OUT", out)
            .env("FAST_ANYTHING_RECORD_META", &meta)
            .env("FAST_ANYTHING_RECORD_LIMIT", limit.to_string())
            .env(DISABLE_ENV, "1")
            .stdin(Stdio::null()),
        "the app",
    )?;
    ensure!(app.status.success(), "the app failed while recording ({}):\n{}", app.status, tail(&combined(&app), 30));
    serde_json::from_str(
        &fs::read_to_string(&meta).context("nothing was recorded: does main return normally (no os.Exit)?")?,
    )
    .context("reading the recording summary")
}

// ------------------------------------------------------------------ the crate

/// Rust type for a Go type.
pub fn rust_type(t: &str) -> Option<String> {
    let t = t.trim();
    Some(match t {
        "int" | "int64" => "i64".into(),
        "int32" | "rune" => "i32".into(),
        "int16" => "i16".into(),
        "int8" => "i8".into(),
        "uint" | "uint64" => "u64".into(),
        "uint32" => "u32".into(),
        "uint16" => "u16".into(),
        "uint8" | "byte" => "u8".into(),
        "float64" => "f64".into(),
        "float32" => "f32".into(),
        "string" => "String".into(),
        "bool" => "bool".into(),
        _ if t.starts_with("[]") => format!("Vec<{}>", rust_type(&t[2..])?),
        _ if t.starts_with("map[string]") => format!("std::collections::HashMap<String, {}>", rust_type(&t[11..])?),
        _ if t.starts_with('[') => {
            let (n, inner) = t[1..].split_once(']')?;
            format!("[{}; {}]", rust_type(inner)?, n.parse::<usize>().ok()?)
        }
        _ => return None,
    })
}

pub const FLAVOR: Flavor = Flavor {
    lang: backend::Lang::Go,
    fence: "go",
    rust_type,
    default_json: |_| None,
    rules: &[
        "Go `int` is `i64` and wraps on overflow: use `wrapping_*` where the original can overflow.",
        "Go strings are UTF-8 bytes: `len(s)` and `s[i]` are bytes, `for _, r := range s` and `[]rune(s)` are characters. Do the same in Rust.",
        "A nil slice or map arrives (and may be returned) as an empty Vec or HashMap: fast-anything treats them as equal.",
        "Map iteration order is random in Go: return results in the order the original does when it's deterministic.",
    ],
};

pub fn scaffold(ctx: &Ctx, hs: &Hotspot, helpers: &[Hotspot], port: &Port) -> Result<String> {
    native::scaffold(ctx, hs, helpers, port, &FLAVOR)
}

pub fn verify(ctx: &Ctx, port: &Port) -> Result<Verify> {
    native::verify(ctx, port, true)
}

// ------------------------------------------------------------------ the bridge

fn suffix(port: &Port) -> String {
    util::slug(&port.id)
}

fn bridge_files(file: &Path, port: &Port) -> Result<[PathBuf; 4]> {
    let s = suffix(port);
    Ok([
        native::sibling(file, &format!("fast_anything_{s}.go"))?,
        native::sibling(file, &format!("fast_anything_{s}_windows.go"))?,
        native::sibling(file, &format!("fast_anything_{s}_unix.go"))?,
        native::sibling(file, &format!("fast_anything_{s}_nocgo.go"))?,
    ])
}

fn hotspot_of<'a>(ctx: &'a Ctx, port: &Port) -> Result<&'a Hotspot> {
    ctx.state
        .hotspots
        .iter()
        .find(|h| h.id == port.id)
        .with_context(|| format!("{} isn't in the last scan: scan again", port.id))
}

pub fn enable(ctx: &Ctx, port: &Port) -> Result<()> {
    let hs = hotspot_of(ctx, port)?;
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    if GoRun::parse(&ctx.state.command[1..]).is_ok_and(|r| r.files_mode()) {
        bail!("the app runs as  go run <files>: run it as  go run .  so Go picks up the bridge files, then scan again");
    }
    let s = suffix(port);
    let (_, lib) = port.lang.artifact(&port.ext);
    let lib = serde_json::to_string(&util::forward_slashes(&ctx.lib_dir().join(lib)))?;
    let params: Vec<String> =
        hs.params.iter().map(|p| format!("{} {}", p.name, p.annotation.as_deref().unwrap_or("any"))).collect();
    let fill = |t: &str| {
        t.replace("/*PKG*/", &pkg_name(ctx, hs).unwrap_or_else(|_| "main".into()))
            .replace("/*ID*/", &port.id)
            .replace("/*S*/", &s)
            .replace("/*PARAMS*/", &params.join(", "))
            .replace("/*ARGS*/", &arg_list(hs))
            .replace("/*RET*/", &ret(hs))
            .replace("/*LIB*/", &lib)
    };
    let prologue = format!("if faR, faOK := faFast_{s}({}); faOK {{\n\treturn faR\n}}", arg_list(hs));
    let patched = native::insert_in_body(&text, "//", &port.id, &prologue, find_body(&port.func, hs.line))?;
    for (path, template) in bridge_files(&file, port)?.iter().zip([BRIDGE, BRIDGE_WINDOWS, BRIDGE_UNIX, BRIDGE_NOCGO]) {
        fs::write(path, fill(template))?;
    }
    fs::write(&file, patched).with_context(|| format!("writing {}", port.file))
}

pub fn disable(ctx: &Ctx, port: &Port) -> Result<()> {
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    fs::write(&file, native::strip_in_body(&text, "//", &port.id)).with_context(|| format!("writing {}", port.file))?;
    for path in bridge_files(&file, port)? {
        if path.exists() {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn go_commands_and_profiles() {
        let s = |v: &[&str]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();
        let r = GoRun::parse(&s(&["run", "-tags", "x", ".", "--n", "3"])).unwrap();
        assert_eq!((r.flags.len(), r.targets[0].as_str(), r.args.len()), (2, ".", 2));
        let r = GoRun::parse(&s(&["run", "main.go", "fuzzy.go", "a"])).unwrap();
        assert!(r.files_mode() && r.targets.len() == 2 && r.args == ["a"]);
        assert!(GoRun::parse(&s(&["build", "."])).is_err());
        let top = "      flat  flat%   sum%        cum   cum%\n     210ms 14.38% 14.38%     1.42s 97.26%  main.main\n    1210ms 82.88% 97.26%     1210ms 82.88%  main.work (inline)\n";
        let t = parse_top(top);
        assert!((t["main.main"].1 - 1.42).abs() < 1e-9 && (t["main.work"].0 - 1.21).abs() < 1e-9);
        assert_eq!(rust_type("[][2]int").as_deref(), Some("Vec<[i64; 2]>"));
        assert_eq!(rust_type("map[string][]float64").as_deref(), Some("std::collections::HashMap<String, Vec<f64>>"));
        assert!(is_go("go") && is_go("C:\\Go\\bin\\go.exe") && !is_go("gofmt"));
    }
}
