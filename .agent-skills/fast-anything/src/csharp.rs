//! C# / .NET backend: apps run as  dotnet run  (an SDK-style project). fast-anything builds the
//! project once and runs the built app itself, profiled with the runtime's own EventPipe sampler
//! (no tools to install), reads the sources with Roslyn, and calls the port through the C bridge
//! with NativeLibrary. A small helper (src/csharp/Program.cs) is built once per machine.

use crate::backend::{self, Profile, Recording};
use crate::hotspot::{Hotspot, Param};
use crate::native::{self, Flavor, Patches};
use crate::python::DISABLE_ENV;
use crate::state::{Ctx, Port, Verify};
use crate::util::{self, combined, output, tail};
use anyhow::{Context, Result, bail, ensure};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

const TOOLS_PROJECT: &str = include_str!("csharp/Tools.csproj");
const TOOLS_PROGRAM: &str = include_str!("csharp/Program.cs");
const REC: &str = include_str!("csharp/Rec.cs");
const BRIDGE: &str = include_str!("csharp/Bridge.cs");
const JSON: &str = include_str!("csharp/Json.cs");

pub fn is_csharp(program: &str) -> bool {
    util::program_stem(program) == "dotnet"
}

pub fn resolve(program: &str, root: &Path) -> Result<String> {
    let out = output(Command::new(program).arg("--version").current_dir(root).stdin(Stdio::null()), "dotnet")?;
    ensure!(out.status.success(), "dotnet didn't run: install the .NET SDK (8 or newer) from https://dot.net");
    let text = String::from_utf8_lossy(&out.stdout);
    let major: u32 = text.trim().split('.').next().and_then(|v| v.parse().ok()).unwrap_or(0);
    ensure!(major >= 8, "the .NET SDK 8 or newer is needed (found {})", text.trim());
    Ok(program.to_string())
}

/// dotnet run [build options] [-- app args]
#[derive(Debug, Default, PartialEq)]
struct DotnetRun {
    project: Option<String>,
    build: Vec<String>,
    args: Vec<String>,
}

impl DotnetRun {
    fn parse(args: &[String]) -> Result<DotnetRun> {
        let usage =
            "run the app as a project:  fast-anything scan -- dotnet run -c Release  (or --project path/App.csproj)";
        ensure!(args.first().map(String::as_str) == Some("run"), "{usage}");
        let mut run = DotnetRun::default();
        let mut i = 1;
        while i < args.len() {
            let a = args[i].as_str();
            match a {
                "--" => {
                    run.args.extend(args[i + 1..].iter().cloned());
                    break;
                }
                "--project" => {
                    run.project = Some(args.get(i + 1).context("--project needs a path")?.clone());
                    i += 1;
                }
                "-c" | "--configuration" | "-f" | "--framework" | "-r" | "--runtime" | "-a" | "--arch" => {
                    run.build.push(a.to_string());
                    run.build.push(args.get(i + 1).with_context(|| format!("{a} needs a value"))?.clone());
                    i += 1;
                }
                "-v" | "--verbosity" | "--launch-profile" => i += 1,
                "--no-build" | "--no-restore" | "--no-launch-profile" => {}
                _ if a.starts_with("-p:") || a.starts_with("--property:") || a.starts_with("/p:") => {
                    run.build.push(a.to_string())
                }
                _ if a.ends_with(".cs") && run.project.is_none() && run.args.is_empty() => {
                    bail!("file-based apps (dotnet run {a}) aren't supported yet: give the code a .csproj.\n{usage}")
                }
                _ => run.args.push(a.to_string()),
            }
            i += 1;
        }
        Ok(run)
    }

    /// The project file.
    fn csproj(&self, root: &Path) -> Result<PathBuf> {
        let base = self.project.as_deref().map(|p| root.join(p)).unwrap_or_else(|| root.to_path_buf());
        if base.is_file() {
            return Ok(base);
        }
        let found: Vec<PathBuf> = fs::read_dir(&base)
            .with_context(|| format!("reading {}", base.display()))?
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|x| x == "csproj"))
            .collect();
        match found.as_slice() {
            [one] => Ok(one.clone()),
            [] => bail!("no .csproj in {} (pass --project path/App.csproj)", base.display()),
            _ => bail!("several .csproj files in {}: pass --project path/App.csproj", base.display()),
        }
    }
}

/// Build the app and return the assembly  dotnet  runs.
fn build(ctx: &Ctx, dotnet: &str, run: &DotnetRun) -> Result<PathBuf> {
    let proj = run.csproj(&ctx.root)?;
    let dotnet_cmd = |verb: &str, extra: &[&str]| {
        let mut cmd = Command::new(dotnet);
        cmd.arg(verb)
            .arg(&proj)
            .args(&run.build)
            .args(["-nologo", "-v", "q"])
            .args(extra)
            .current_dir(&ctx.root)
            .env("DOTNET_CLI_UI_LANGUAGE", "en")
            .stdin(Stdio::null());
        output(&mut cmd, "dotnet")
    };
    let built = dotnet_cmd("build", &[])?;
    ensure!(built.status.success(), "dotnet build failed:\n{}", tail(&combined(&built), 30));
    // -getProperty only evaluates the project; it doesn't build
    let out = dotnet_cmd("build", &["-getProperty:TargetPath"])?;
    ensure!(out.status.success(), "dotnet build failed:\n{}", tail(&combined(&out), 30));
    let text = String::from_utf8_lossy(&out.stdout);
    let target = text.lines().map(str::trim).rfind(|l| !l.is_empty()).context("dotnet build printed no TargetPath")?;
    let target = PathBuf::from(target);
    ensure!(target.exists(), "dotnet build said it built {}, but it isn't there", target.display());
    Ok(target)
}

fn app_command(dotnet: &str, dll: &Path, args: &[String]) -> Command {
    let mut cmd = Command::new(dotnet);
    cmd.arg(dll).args(args);
    cmd
}

pub fn bench_command(ctx: &Ctx, dotnet: &str) -> Result<(String, Vec<String>)> {
    let run = DotnetRun::parse(&ctx.state.command[1..])?;
    let dll = build(ctx, dotnet, &run)?;
    let mut args = vec![dll.to_string_lossy().into_owned()];
    args.extend(run.args);
    Ok((dotnet.to_string(), args))
}

// ------------------------------------------------------------------ the helper (Roslyn + TraceEvent)

fn cache_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .or_else(|| std::env::var_os("XDG_CACHE_HOME"))
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".cache")))
        .unwrap_or_else(std::env::temp_dir);
    base.join("fast-anything")
}

/// The helper, built on first use (it needs NuGet once, for Roslyn and TraceEvent).
fn tools(dotnet: &str) -> Result<PathBuf> {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    (TOOLS_PROJECT, TOOLS_PROGRAM).hash(&mut h);
    let dir = cache_dir().join(format!("cs-tools-{:016x}", h.finish()));
    let dll = dir.join("out").join("FastAnythingTools.dll");
    if dll.exists() {
        return Ok(dll);
    }
    fs::create_dir_all(&dir)?;
    fs::write(dir.join("Tools.csproj"), TOOLS_PROJECT)?;
    fs::write(dir.join("Program.cs"), TOOLS_PROGRAM)?;
    crate::ui::line("  building the C# helper (once per machine)…");
    let out = output(
        Command::new(dotnet)
            .args(["build", "-c", "Release", "-nologo", "-v", "q", "-o", "out"])
            .current_dir(&dir)
            .stdin(Stdio::null()),
        "dotnet",
    )?;
    ensure!(out.status.success(), "building the C# helper failed:\n{}", tail(&combined(&out), 30));
    Ok(dll)
}

fn helper(ctx: &Ctx, dotnet: &str, mode: &str, input: &Path, out: &Path) -> Result<()> {
    let run = output(
        Command::new(dotnet)
            .arg(tools(dotnet)?)
            .arg(mode)
            .arg(input)
            .arg(out)
            .current_dir(&ctx.root)
            .stdin(Stdio::null()),
        "dotnet",
    )?;
    ensure!(run.status.success(), "the C# helper failed ({mode}):\n{}", tail(&combined(&run), 20));
    Ok(())
}

// ------------------------------------------------------------------ scan

fn source_files(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(entries) = fs::read_dir(&d) else { continue };
        for e in entries.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if p.is_dir() {
                if !name.starts_with('.') && !["bin", "obj", "node_modules", "target"].contains(&name.as_str()) {
                    stack.push(p);
                }
            } else if name.ends_with(".cs") && !name.starts_with("FastAnything") {
                out.push(p);
            }
        }
    }
    out.sort();
    out
}

#[derive(Deserialize, Clone)]
struct Method {
    class: String,
    owner: String,
    name: String,
    path: PathBuf,
    line: u32,
    end_line: u32,
    params: Vec<Param>,
    returns: String,
    blockers: Vec<String>,
    warnings: Vec<String>,
    calls: Vec<String>,
    source: String,
}

#[derive(Deserialize)]
struct Stack {
    thread: i64,
    frames: Vec<String>,
    count: u64,
}

fn describe(ctx: &Ctx, dotnet: &str, dir: &Path) -> Result<Vec<Method>> {
    let list = ctx.fast.join("cs-files.txt");
    let files = source_files(dir);
    ensure!(!files.is_empty(), "no .cs files in {}", dir.display());
    fs::write(&list, files.iter().map(|f| f.to_string_lossy().into_owned()).collect::<Vec<_>>().join("\n"))?;
    let out = ctx.fast.join("cs-methods.json");
    helper(ctx, dotnet, "describe", &list, &out)?;
    serde_json::from_str(&fs::read_to_string(&out)?).context("reading the method list")
}

/// "Ns.Outer+Inner.Method(int32,class System.String)" -> ("Ns.Outer+Inner", "Method")
fn split_frame(frame: &str) -> Option<(&str, &str)> {
    let head = frame.split('(').next()?;
    head.rsplit_once('.')
}

fn rel(ctx: &Ctx, p: &Path) -> String {
    util::forward_slashes(p.strip_prefix(&ctx.root).unwrap_or(p))
}

pub fn profile(ctx: &Ctx, dotnet: &str, args: &[String]) -> Result<Profile> {
    let run = DotnetRun::parse(args)?;
    let dll = build(ctx, dotnet, &run)?;
    let trace_dir = ctx.fast.join("nettrace");
    let _ = fs::remove_dir_all(&trace_dir);
    fs::create_dir_all(&trace_dir)?;
    let started = Instant::now();
    let out = output(
        app_command(dotnet, &dll, &run.args)
            .current_dir(&ctx.root)
            .env("DOTNET_EnableEventPipe", "1")
            .env("DOTNET_EventPipeOutputPath", trace_dir.join("app-{pid}.nettrace"))
            .env(
                "DOTNET_EventPipeConfig",
                "Microsoft-DotNETCore-SampleProfiler:0:5,Microsoft-Windows-DotNETRuntime:0x4c14fccbd:5",
            )
            .env(DISABLE_ENV, "1")
            .stdin(Stdio::null()),
        dotnet,
    )?;
    let wall = started.elapsed().as_secs_f64();
    ensure!(out.status.success(), "the app failed ({}):\n{}", out.status, tail(&combined(&out), 30));
    let stacks_path = ctx.fast.join("cs-stacks.json");
    helper(ctx, dotnet, "trace", &trace_dir, &stacks_path)?;
    let stacks: Vec<Stack> = serde_json::from_str(&fs::read_to_string(&stacks_path)?).context("reading the samples")?;
    let _ = fs::remove_dir_all(&trace_dir);

    let proj = run.csproj(&ctx.root)?;
    let methods = describe(ctx, dotnet, proj.parent().unwrap_or(&ctx.root))?;
    let mut by_name: HashMap<(&str, &str), usize> = HashMap::new();
    for (i, m) in methods.iter().enumerate() {
        by_name.entry((m.class.as_str(), m.name.as_str())).or_insert(i);
    }
    let resolve = |f: &str| split_frame(f).and_then(|k| by_name.get(&k).copied());
    // threads that ran the app's own code; the runtime's idle threads don't count
    let app_threads: HashSet<i64> =
        stacks.iter().filter(|s| s.frames.iter().any(|f| resolve(f).is_some())).map(|s| s.thread).collect();
    let (mut total, mut own, mut incl) = (0u64, HashMap::<usize, u64>::new(), HashMap::<usize, u64>::new());
    for s in stacks.iter().filter(|s| app_threads.contains(&s.thread)) {
        total += s.count;
        let mut seen = HashSet::new();
        for (depth, f) in s.frames.iter().enumerate() {
            let Some(i) = resolve(f) else { continue };
            if depth == 0 {
                *own.entry(i).or_default() += s.count;
            }
            if seen.insert(i) {
                *incl.entry(i).or_default() += s.count;
            }
        }
    }
    ensure!(total > 0, "no samples landed in the app's code: does it run long enough (a second or more)?");
    let mut keep: Vec<usize> = incl.keys().copied().collect();
    let helpers: Vec<usize> = keep
        .iter()
        .flat_map(|&i| {
            let m = &methods[i];
            methods
                .iter()
                .enumerate()
                .filter(move |(_, h)| h.class == m.class && m.calls.contains(&h.name))
                .map(|(j, _)| j)
        })
        .collect();
    keep.extend(helpers);
    keep.sort_unstable();
    keep.dedup();
    let functions = keep
        .into_iter()
        .map(|i| {
            let m = &methods[i];
            let (o, n) = (own.get(&i).copied().unwrap_or(0), incl.get(&i).copied().unwrap_or(0));
            Hotspot {
                file: rel(ctx, &m.path),
                line: m.line,
                end_line: m.end_line,
                name: m.name.clone(),
                qualname: m.name.clone(),
                module: Some(m.class.replace('+', ".")),
                kind: "function".into(),
                tottime: o as f64 / total as f64 * wall,
                cumtime: n as f64 / total as f64 * wall,
                portability: if m.blockers.is_empty() { 0.9 } else { 0.0 },
                blockers: m.blockers.clone(),
                warnings: m.warnings.clone(),
                params: m.params.clone(),
                returns: Some(m.returns.clone()),
                source: m.source.clone(),
                calls: m.calls.clone(),
                owner: Some(m.owner.clone()),
                ..Hotspot::default()
            }
        })
        .collect();
    Ok(Profile { wall, base: ".".into(), functions })
}

// ------------------------------------------------------------------ editing the source

/// A type as typeof() and casts accept it: no ? on reference types (string?, int[]?, List<T>?).
fn plain_type(t: &str) -> String {
    const VALUES: &[&str] = &[
        "int", "long", "double", "float", "bool", "short", "byte", "sbyte", "uint", "ulong", "ushort", "char",
        "decimal", "Int32", "Int64", "Double", "Single", "Boolean", "Int16", "Byte", "SByte", "UInt32", "UInt64",
        "UInt16", "Char",
    ];
    let mut out = String::new();
    for c in t.chars() {
        if c == '?' {
            let word: String = out
                .chars()
                .rev()
                .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '.')
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect();
            let last = word.rsplit('.').next().unwrap_or("");
            if VALUES.contains(&last) {
                out.push(c);
            }
            continue;
        }
        out.push(c);
    }
    out
}

fn ret(hs: &Hotspot) -> String {
    plain_type(hs.returns.as_deref().unwrap_or("object"))
}

fn args_array(hs: &Hotspot) -> String {
    format!("new object[] {{ {} }}", hs.params.iter().map(|p| p.name.as_str()).collect::<Vec<_>>().join(", "))
}

fn find_body(name: &str, hint: u32) -> impl Fn(&str) -> Option<usize> {
    let call = format!("{name}(");
    let spaced = format!("{name} (");
    move |text: &str| {
        native::body_line(text, hint, |l| {
            l.contains("static") && (l.contains(&call) || l.contains(&spaced)) && !l.trim_start().starts_with("//")
        })
    }
}

fn record_prologue(hs: &Hotspot) -> String {
    let ty = |p: &Param| plain_type(p.annotation.as_deref().unwrap_or("object"));
    let types: Vec<String> = hs.params.iter().map(|p| format!("typeof({})", ty(p))).collect();
    let casts: Vec<String> = hs.params.iter().enumerate().map(|(i, p)| format!("({}) __faA[{i}]", ty(p))).collect();
    format!(
        "#nullable disable\nif (!global::FastAnythingRec.Inside)\n{{\n    return ({ret}) global::FastAnythingRec.Record({args}, new global::System.Type[] {{ {types} }}, __faA => {name}({casts}));\n}}\n#nullable restore",
        ret = ret(hs),
        args = args_array(hs),
        types = types.join(", "),
        name = hs.name,
        casts = casts.join(", "),
    )
}

pub fn record(ctx: &Ctx, dotnet: &str, args: &[String], hs: &Hotspot, out: &Path, limit: usize) -> Result<Recording> {
    let run = DotnetRun::parse(args)?;
    let file = ctx.root.join(&hs.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", hs.file))?;
    let rec = REC.replace("/*ID*/", &hs.id).replace("/*JSON*/", JSON);
    let patched = native::insert_in_body(
        &text,
        "//",
        &format!("recording {}", hs.id),
        &record_prologue(hs),
        find_body(&hs.name, hs.line),
    )?;
    let meta = out.with_extension("meta.json");
    let mut patches = Patches::new(ctx)?;
    patches.write(&native::sibling(&file, "FastAnythingRec.cs")?, &rec)?;
    patches.write(&file, &patched)?;
    let result = build(ctx, dotnet, &run).and_then(|dll| {
        output(
            app_command(dotnet, &dll, &run.args)
                .current_dir(&ctx.root)
                .env("FAST_ANYTHING_RECORD_OUT", out)
                .env("FAST_ANYTHING_RECORD_META", &meta)
                .env("FAST_ANYTHING_RECORD_LIMIT", limit.to_string())
                .env(DISABLE_ENV, "1")
                .stdin(Stdio::null()),
            dotnet,
        )
    });
    patches.restore()?;
    let ran = result?;
    ensure!(ran.status.success(), "the app failed while recording ({}):\n{}", ran.status, tail(&combined(&ran), 30));
    serde_json::from_str(&fs::read_to_string(&meta).context("the recorder wrote nothing")?)
        .context("reading the recording summary")
}

// ------------------------------------------------------------------ the crate

/// Rust type for a C# type.
pub fn rust_type(t: &str) -> Option<String> {
    let t = t.replace(' ', "").replace("System.Collections.Generic.", "").replace("System.", "");
    if let Some(inner) = t.strip_suffix('?') {
        return rust_type(inner).map(|r| format!("Option<{r}>"));
    }
    Some(match t.as_str() {
        "int" | "Int32" => "i32".into(),
        "long" | "Int64" => "i64".into(),
        "short" | "Int16" => "i16".into(),
        "sbyte" | "SByte" => "i8".into(),
        "uint" | "UInt32" => "u32".into(),
        "ulong" | "UInt64" => "u64".into(),
        "ushort" | "UInt16" => "u16".into(),
        "byte" | "Byte" => "u8".into(),
        "double" | "Double" => "f64".into(),
        "float" | "Single" => "f32".into(),
        "bool" | "Boolean" => "bool".into(),
        "char" | "Char" => "char".into(),
        "string" | "String" => "String".into(),
        _ if t.ends_with("[]") => format!("Vec<{}>", rust_type(&t[..t.len() - 2])?),
        _ => {
            let (raw, inner) = t.strip_suffix('>')?.split_once('<')?;
            match raw {
                "List" | "IList" | "IReadOnlyList" | "ICollection" | "IReadOnlyCollection" | "IEnumerable" => {
                    format!("Vec<{}>", rust_type(inner)?)
                }
                "Dictionary" | "IDictionary" | "IReadOnlyDictionary" | "SortedDictionary" => {
                    let value = inner.strip_prefix("string,").or_else(|| inner.strip_prefix("String,"))?;
                    format!("std::collections::HashMap<String, {}>", rust_type(value)?)
                }
                _ => return None,
            }
        }
    })
}

pub const FLAVOR: Flavor = Flavor {
    lang: backend::Lang::CSharp,
    fence: "csharp",
    rust_type,
    default_json: |_| None,
    rules: &[
        "C# `int` is `i32` and wraps on overflow (unchecked by default): use `wrapping_*` where the original can overflow. `long` is `i64`, `byte` is `u8`.",
        "C# strings are UTF-16: `Length` and `s[i]` count UTF-16 units. If the code indexes strings, work on `encode_utf16()` (or take a fast path when `is_ascii()`). A `char` arrives as a one-character string.",
        "`Math.Round` rounds half to even by default: use `round_ties_even()`. `/` and `%` on integers truncate toward zero, as in Rust.",
        "`ToLowerInvariant` maps one UTF-16 unit at a time; Rust's `to_lowercase` can differ on a few characters (İ, final sigma). `Split((char[]?)null)` splits on Unicode whitespace, like `split_whitespace`.",
        "Arrays and lists arrive as JSON arrays, dictionaries as objects with string keys.",
    ],
};

pub fn scaffold(ctx: &Ctx, hs: &Hotspot, helpers: &[Hotspot], port: &Port) -> Result<String> {
    native::scaffold(ctx, hs, helpers, port, &FLAVOR)
}

pub fn verify(ctx: &Ctx, port: &Port) -> Result<Verify> {
    native::verify(ctx, port, false)
}

// ------------------------------------------------------------------ the bridge

fn bridge_class(port: &Port) -> String {
    format!("FastAnything_{}", util::slug(&port.id))
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
    let class = bridge_class(port);
    let (_, lib) = port.lang.artifact(&port.ext);
    let lib = util::forward_slashes(&ctx.lib_dir().join(lib));
    let bridge = BRIDGE
        .replace("/*CLASS*/", &class)
        .replace("/*LIB*/", &serde_json::to_string(&lib)?)
        .replace("/*ID*/", &port.id)
        .replace("/*JSON*/", JSON);
    let prologue = format!(
        "#nullable disable\nif (global::{class}.On)\n{{\n    return ({ret}) global::{class}.Call({args}, typeof({ret}));\n}}\n#nullable restore",
        ret = ret(hs),
        args = args_array(hs),
    );
    let patched = native::insert_in_body(&text, "//", &port.id, &prologue, find_body(&port.func, hs.line))?;
    fs::write(native::sibling(&file, &format!("{class}.cs"))?, bridge)?;
    fs::write(&file, patched).with_context(|| format!("writing {}", port.file))
}

pub fn disable(ctx: &Ctx, port: &Port) -> Result<()> {
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    fs::write(&file, native::strip_in_body(&text, "//", &port.id)).with_context(|| format!("writing {}", port.file))?;
    let bridge = native::sibling(&file, &format!("{}.cs", bridge_class(port)))?;
    if bridge.exists() {
        fs::remove_file(bridge)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csharp_bits() {
        assert_eq!(rust_type("int[][]").as_deref(), Some("Vec<Vec<i32>>"));
        assert_eq!(rust_type("List<string>").as_deref(), Some("Vec<String>"));
        assert_eq!(rust_type("string?").as_deref(), Some("Option<String>"));
        assert_eq!(
            rust_type("Dictionary<string, List<double>>").as_deref(),
            Some("std::collections::HashMap<String, Vec<f64>>")
        );
        assert_eq!(rust_type("Point"), None);
        assert_eq!(plain_type("string?"), "string");
        assert_eq!(plain_type("int?"), "int?");
        assert_eq!(plain_type("List<string?>?"), "List<string>");
        assert_eq!(plain_type("System.Int32?[]?"), "System.Int32?[]");
        assert_eq!(split_frame("Ns.Outer+Inner.Run(int32,class System.String)"), Some(("Ns.Outer+Inner", "Run")));
        let s = |v: &[&str]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();
        let r = DotnetRun::parse(&s(&["run", "-c", "Release", "--project", "app", "--", "x", "-y"])).unwrap();
        assert_eq!(r.project.as_deref(), Some("app"));
        assert_eq!(r.build, s(&["-c", "Release"]));
        assert_eq!(r.args, s(&["x", "-y"]));
        assert!(DotnetRun::parse(&s(&["run", "app.cs"])).is_err());
        assert!(DotnetRun::parse(&s(&["app.dll"])).is_err());
        assert!(is_csharp("C:\\Program Files\\dotnet\\dotnet.exe") && !is_csharp("dotnet-trace"));
    }
}
