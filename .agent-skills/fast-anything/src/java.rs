//! Java backend: apps run as  java App.java  (source-file mode, multi-file since Java 22).
//! Profiled with Java Flight Recorder, read with javac's own parser, and bridged to the port with
//! the Foreign Function & Memory API: nothing to install beyond a JDK 22+.

use crate::backend::{self, Profile, Recording};
use crate::hotspot::{Hotspot, Param};
use crate::native::{self, Flavor, Patches};
use crate::python::DISABLE_ENV;
use crate::state::{Ctx, Port, Verify};
use crate::util::{self, combined, output, tail};
use anyhow::{Context, Result, bail, ensure};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

const DESCRIBE: &str = include_str!("java/Describe.java");
const JSON: &str = include_str!("java/Json.java");
const REC: &str = include_str!("java/Rec.java");
const BRIDGE: &str = include_str!("java/Bridge.java");
/// java options that take the next argument as their value.
const VALUE_OPTS: &[&str] =
    &["-cp", "-classpath", "--class-path", "-p", "--module-path", "--add-modules", "--source", "--limit-modules"];

/// How the app is started: a source file, or a Maven or Gradle build.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Runner {
    Source,
    Maven,
    Gradle,
}

fn runner(program: &str) -> Option<Runner> {
    match util::program_stem(program).trim_end_matches(".cmd").trim_end_matches(".bat") {
        "java" => Some(Runner::Source),
        "mvn" | "mvnw" | "mvnd" => Some(Runner::Maven),
        "gradle" | "gradlew" => Some(Runner::Gradle),
        _ => None,
    }
}

pub fn is_java(program: &str) -> bool {
    runner(program).is_some()
}

/// The program as given, or its .cmd / .bat twin on Windows (mvn, gradlew).
fn build_tool(program: &str, root: &Path) -> Result<String> {
    let base = if program.contains(['/', '\\']) { root.join(program) } else { PathBuf::from(program) };
    let mut candidates = vec![base.clone()];
    if cfg!(windows) && base.extension().is_none() {
        candidates.insert(0, base.with_extension("cmd"));
        candidates.insert(1, base.with_extension("bat"));
    }
    for c in candidates {
        if let Ok(out) = Command::new(&c).arg("--version").current_dir(root).stdin(Stdio::null()).output()
            && out.status.success()
        {
            return Ok(c.to_string_lossy().into_owned());
        }
    }
    bail!("{program} didn't run: is it installed (or is the wrapper script in the project)?")
}

/// The JDK that runs the build: JAVA_HOME, else java on the PATH.
fn build_java(root: &Path) -> Result<String> {
    match std::env::var_os("JAVA_HOME").filter(|h| !h.is_empty()) {
        Some(home) => {
            let java = Path::new(&home).join("bin").join(if cfg!(windows) { "java.exe" } else { "java" });
            resolve_java(&java.to_string_lossy(), root)
        }
        None => resolve_java("java", root),
    }
}

pub fn resolve(program: &str, root: &Path) -> Result<String> {
    match runner(program) {
        Some(Runner::Maven | Runner::Gradle) => {
            build_java(root)?;
            build_tool(program, root)
        }
        _ => resolve_java(program, root),
    }
}

fn resolve_java(program: &str, root: &Path) -> Result<String> {
    let prog = if program.contains(['/', '\\']) { root.join(program) } else { PathBuf::from(program) };
    let out = output(Command::new(&prog).args(["-XshowSettings:properties", "-version"]).current_dir(root), "java")?;
    let text = combined(&out);
    let prop = |key: &str| {
        text.lines().find_map(|l| {
            l.trim().strip_prefix(key).and_then(|r| r.trim().strip_prefix('=')).map(|v| v.trim().to_string())
        })
    };
    let home = prop("java.home").context("couldn't read java.home from java -XshowSettings")?;
    let version: u32 = prop("java.specification.version").and_then(|v| v.parse().ok()).unwrap_or(0);
    ensure!(
        version >= 22,
        "Java 22 or newer is needed (found {version}): it runs multi-file source programs and has the FFM API"
    );
    let exe = Path::new(&home).join("bin").join(if cfg!(windows) { "java.exe" } else { "java" });
    Ok(exe.to_string_lossy().into_owned())
}

fn tool(java: &str, name: &str) -> PathBuf {
    Path::new(java).with_file_name(if cfg!(windows) { format!("{name}.exe") } else { name.to_string() })
}

/// The source file in  java [options] App.java [args].
fn entry(args: &[String]) -> Result<&str> {
    let mut i = 0;
    while i < args.len() && args[i].starts_with('-') {
        i += if VALUE_OPTS.contains(&args[i].as_str()) { 2 } else { 1 };
    }
    match args.get(i) {
        Some(f) if f.ends_with(".java") => Ok(f),
        _ => bail!(
            "run the app as a source file:  fast-anything scan -- java App.java  (jar and classpath apps aren't supported yet)"
        ),
    }
}

/// The app's sources: the folder of the source file, or every src/main/java of a build.
fn sources(root: &Path, program: &str, args: &[String]) -> Result<Vec<PathBuf>> {
    if runner(program) == Some(Runner::Source) {
        let entry = entry(args)?;
        return Ok(source_files(root.join(entry).parent().unwrap_or(root)));
    }
    let mut dirs = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let main = dir.join("src").join("main").join("java");
        if main.is_dir() {
            dirs.push(main);
        }
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if e.path().is_dir()
                && !name.starts_with('.')
                && !["target", "build", "out", "node_modules", "src"].contains(&name.as_str())
            {
                stack.push(e.path());
            }
        }
    }
    ensure!(!dirs.is_empty(), "no src/main/java folder in this project");
    Ok(dirs.iter().flat_map(|d| source_files(d)).collect())
}

fn source_files(start: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![start.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if p.is_dir() {
                if !name.starts_with('.') && !["target", "build", "out", "node_modules"].contains(&name.as_str()) {
                    stack.push(p);
                }
            } else if name.ends_with(".java") && !name.starts_with("FastAnything") {
                out.push(p);
            }
        }
    }
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

fn describe(ctx: &Ctx, java: &str, files: &[PathBuf]) -> Result<Vec<Method>> {
    let script = ctx.fast.join("Describe.java");
    fs::write(&script, DESCRIBE)?;
    let list = ctx.fast.join("java-files.txt");
    fs::write(&list, files.iter().map(|f| f.to_string_lossy().into_owned()).collect::<Vec<_>>().join("\n"))?;
    let out = ctx.fast.join("java-methods.json");
    let run = output(
        Command::new(java).arg(&script).arg(&list).arg(&out).current_dir(&ctx.root).stdin(Stdio::null()),
        "java",
    )?;
    ensure!(run.status.success(), "reading the Java sources failed:\n{}", tail(&combined(&run), 20));
    serde_json::from_str(&fs::read_to_string(&out)?).context("reading the method list")
}

fn rel(ctx: &Ctx, p: &Path) -> String {
    util::forward_slashes(p.strip_prefix(&ctx.root).unwrap_or(p))
}

fn hotspot(ctx: &Ctx, m: &Method, total: f64, wall: f64, own: u64, incl: u64) -> Hotspot {
    Hotspot {
        file: rel(ctx, &m.path),
        line: m.line,
        end_line: m.end_line,
        name: m.name.clone(),
        qualname: m.name.clone(),
        module: Some(m.class.replace('$', ".")),
        kind: "function".into(),
        tottime: own as f64 / total * wall,
        cumtime: incl as f64 / total * wall,
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
}

/// What bench times: Gradle runs without its daemon, which would otherwise outlive the run and
/// hold its output pipe open.
pub fn bench_command(ctx: &Ctx, program: &str) -> Result<(String, Vec<String>)> {
    let mut args = ctx.state.command[1..].to_vec();
    if runner(program) == Some(Runner::Gradle) && !args.iter().any(|a| a == "--no-daemon") {
        args.insert(0, "--no-daemon".into());
    }
    Ok((program.to_string(), args))
}

/// The app's command, ready to run: for Gradle without a lingering daemon.
fn app_command(program: &str, args: &[String]) -> Command {
    let mut cmd = Command::new(program);
    if runner(program) == Some(Runner::Gradle) {
        cmd.arg("--no-daemon");
    }
    cmd.args(args);
    cmd
}

pub fn profile(ctx: &Ctx, program: &str, args: &[String]) -> Result<Profile> {
    let build = runner(program) != Some(Runner::Source);
    let java = if build { build_java(&ctx.root)? } else { program.to_string() };
    let jfr_dir = ctx.fast.join("jfr");
    let _ = fs::remove_dir_all(&jfr_dir);
    fs::create_dir_all(&jfr_dir)?;
    let flags = format!(
        "-XX:StartFlightRecording:filename={}/%p.jfr,settings=profile -Xlog:jfr+startup=error",
        util::forward_slashes(&jfr_dir)
    );
    let mut cmd = if build { app_command(program, args) } else { Command::new(program) };
    if build {
        // every JVM the build starts (Maven's own, Gradle's forked app) records itself
        let existing = std::env::var("JAVA_TOOL_OPTIONS").unwrap_or_default();
        cmd.env("JAVA_TOOL_OPTIONS", format!("{existing} {flags}").trim());
    } else {
        cmd.args(flags.split(' ')).args(args);
    }
    let started = Instant::now();
    let run = output(cmd.current_dir(&ctx.root).env(DISABLE_ENV, "1").stdin(Stdio::null()), program)?;
    let wall = started.elapsed().as_secs_f64();
    ensure!(run.status.success(), "the app failed ({}):\n{}", run.status, tail(&combined(&run), 30));
    let mut events = Vec::new();
    for f in fs::read_dir(&jfr_dir)?.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "jfr")) {
        let printed = output(
            Command::new(tool(&java, "jfr")).args(["print", "--events", "jdk.ExecutionSample", "--json"]).arg(&f),
            "jfr",
        )?;
        ensure!(printed.status.success(), "reading the flight recording failed:\n{}", tail(&combined(&printed), 10));
        let recording: Value = serde_json::from_slice(&printed.stdout).context("parsing the flight recording")?;
        if let Some(list) = recording["recording"]["events"].as_array() {
            events.extend(list.iter().cloned());
        }
    }
    ensure!(!events.is_empty(), "no flight recording was written: did a JVM run the app?");
    let recording = serde_json::json!({ "recording": { "events": events } });

    let methods = describe(ctx, &java, &sources(&ctx.root, program, args)?)?;
    let mut by_name: HashMap<(String, String), Vec<usize>> = HashMap::new();
    for (i, m) in methods.iter().enumerate() {
        by_name.entry((m.class.clone(), m.name.clone())).or_default().push(i);
    }
    let (mut total, mut own, mut incl) = (0u64, HashMap::<usize, u64>::new(), HashMap::<usize, u64>::new());
    for ev in recording["recording"]["events"].as_array().map(Vec::as_slice).unwrap_or_default() {
        let Some(frames) = ev["values"]["stackTrace"]["frames"].as_array() else { continue };
        if frames.is_empty() {
            continue;
        }
        total += 1;
        let mut seen = HashSet::new();
        for (depth, f) in frames.iter().enumerate() {
            let class = f["method"]["type"]["name"].as_str().unwrap_or_default().replace('/', ".");
            let name = f["method"]["name"].as_str().unwrap_or_default().to_string();
            let Some(cands) = by_name.get(&(class, name)) else { continue };
            let line = f["lineNumber"].as_i64().unwrap_or(0) as u32;
            let i =
                *cands.iter().find(|&&i| methods[i].line <= line && line <= methods[i].end_line).unwrap_or(&cands[0]);
            if depth == 0 {
                *own.entry(i).or_default() += 1;
            }
            if seen.insert(i) {
                *incl.entry(i).or_default() += 1;
            }
        }
    }
    ensure!(total > 0, "the flight recording has no samples: does the app run long enough (a second or more)?");
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
            hotspot(
                ctx,
                &methods[i],
                total as f64,
                wall,
                own.get(&i).copied().unwrap_or(0),
                incl.get(&i).copied().unwrap_or(0),
            )
        })
        .collect();
    Ok(Profile { wall, base: ".".into(), functions })
}

// ------------------------------------------------------------------ editing the source

fn find_body(name: &str, hint: u32) -> impl Fn(&str) -> Option<usize> {
    let call = format!("{name}(");
    let spaced = format!("{name} (");
    move |text: &str| {
        native::body_line(text, hint, |l| {
            l.contains("static") && (l.contains(&call) || l.contains(&spaced)) && !l.trim_start().starts_with("//")
        })
    }
}

fn package_line(text: &str) -> String {
    text.lines().find(|l| l.trim_start().starts_with("package ")).map(|l| l.trim().to_string()).unwrap_or_default()
}

fn args_array(hs: &Hotspot) -> String {
    format!("new Object[]{{{}}}", hs.params.iter().map(|p| p.name.as_str()).collect::<Vec<_>>().join(", "))
}

fn ret(hs: &Hotspot) -> String {
    hs.returns.clone().unwrap_or_else(|| "Object".into())
}

fn record_prologue(hs: &Hotspot) -> String {
    let casts: Vec<String> = hs
        .params
        .iter()
        .enumerate()
        .map(|(i, p)| format!("({}) __faA[{i}]", p.annotation.as_deref().unwrap_or("Object")))
        .collect();
    format!(
        "if (!FastAnythingRec.inside) {{\n    @SuppressWarnings(\"unchecked\") {ret} __faR = ({ret}) FastAnythingRec.record({args}, __faA -> {name}({casts}));\n    return __faR;\n}}",
        ret = ret(hs),
        args = args_array(hs),
        name = hs.name,
        casts = casts.join(", "),
    )
}

pub fn record(ctx: &Ctx, program: &str, args: &[String], hs: &Hotspot, out: &Path, limit: usize) -> Result<Recording> {
    let file = ctx.root.join(&hs.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", hs.file))?;
    let rec = REC.replace("/*PACKAGE*/", &package_line(&text)).replace("/*ID*/", &hs.id).replace("/*JSON*/", JSON);
    let patched = native::insert_in_body(
        &text,
        "//",
        &format!("recording {}", hs.id),
        &record_prologue(hs),
        find_body(&hs.name, hs.line),
    )?;
    let meta = out.with_extension("meta.json");
    let mut patches = Patches::new(ctx)?;
    patches.write(&native::sibling(&file, "FastAnythingRec.java")?, &rec)?;
    patches.write(&file, &patched)?;
    let run = output(
        app_command(program, args)
            .current_dir(&ctx.root)
            .env("FAST_ANYTHING_RECORD_OUT", out)
            .env("FAST_ANYTHING_RECORD_META", &meta)
            .env("FAST_ANYTHING_RECORD_LIMIT", limit.to_string())
            .env(DISABLE_ENV, "1")
            .stdin(Stdio::null()),
        program,
    );
    patches.restore()?;
    let run = run?;
    ensure!(run.status.success(), "the app failed while recording ({}):\n{}", run.status, tail(&combined(&run), 30));
    serde_json::from_str(&fs::read_to_string(&meta).context("the recorder wrote nothing")?)
        .context("reading the recording summary")
}

// ------------------------------------------------------------------ the crate

/// Rust type for a Java type.
pub fn rust_type(t: &str) -> Option<String> {
    let t = t.replace(' ', "").replace("java.util.", "").replace("java.lang.", "");
    Some(match t.as_str() {
        "int" | "Integer" => "i32".into(),
        "long" | "Long" => "i64".into(),
        "double" | "Double" => "f64".into(),
        "float" | "Float" => "f32".into(),
        "short" | "Short" => "i16".into(),
        "byte" | "Byte" => "i8".into(),
        "boolean" | "Boolean" => "bool".into(),
        "String" => "String".into(),
        _ if t.ends_with("[]") => format!("Vec<{}>", rust_type(&t[..t.len() - 2])?),
        _ => {
            let (raw, inner) = t.strip_suffix('>')?.split_once('<')?;
            match raw {
                "List" | "ArrayList" | "Collection" | "LinkedList" => format!("Vec<{}>", rust_type(inner)?),
                "Map" | "HashMap" | "LinkedHashMap" | "TreeMap" => {
                    format!("std::collections::HashMap<String, {}>", rust_type(inner.strip_prefix("String,")?)?)
                }
                _ => return None,
            }
        }
    })
}

pub const FLAVOR: Flavor = Flavor {
    lang: backend::Lang::Java,
    fence: "java",
    rust_type,
    default_json: |_| None,
    rules: &[
        "Java `int` is `i32` and wraps on overflow: use `wrapping_*` where the original can overflow. `long` is `i64`.",
        "Java Strings are UTF-16: `length()` and `charAt()` count UTF-16 units. If the code indexes strings, work on `encode_utf16()` (or take a fast path when `is_ascii()`).",
        "`/` and `%` on integers truncate toward zero, as in Rust. `Math.round` rounds half up: `(x + 0.5).floor()`.",
        "Arrays and Lists arrive as JSON arrays, Maps as objects with String keys.",
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

/// The Java release a Maven or Gradle build compiles for, when it says.
fn declared_release(root: &Path) -> Option<u32> {
    let num = |s: &str| -> Option<u32> {
        let digits: String =
            s.trim_start_matches(|c: char| !c.is_ascii_digit()).chars().take_while(char::is_ascii_digit).collect();
        digits.parse().ok().map(|n: u32| if n == 1 { 8 } else { n })
    };
    let mut found = Vec::new();
    for name in ["pom.xml", "build.gradle", "build.gradle.kts"] {
        let Ok(text) = fs::read_to_string(root.join(name)) else { continue };
        for key in [
            "<maven.compiler.release>",
            "<release>",
            "<maven.compiler.source>",
            "<source>",
            "JavaLanguageVersion.of(",
            "VERSION_",
            "release =",
            "release.set(",
        ] {
            for (i, _) in text.match_indices(key) {
                if let Some(n) = num(&text[i + key.len()..(i + key.len() + 12).min(text.len())]) {
                    found.push(n);
                }
            }
        }
    }
    found.into_iter().min()
}

pub fn enable(ctx: &Ctx, port: &Port) -> Result<()> {
    if let Some(release) = declared_release(&ctx.root).filter(|r| *r < 22) {
        bail!(
            "the build compiles for Java {release}; the Rust bridge uses the FFM API from Java 22. Raise the release to 22+ (or run the app as  java App.java)"
        );
    }
    let hs = hotspot_of(ctx, port)?;
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    let class = bridge_class(port);
    let (_, lib) = port.lang.artifact(&port.ext);
    let lib = util::forward_slashes(&ctx.lib_dir().join(lib));
    let imports: Vec<&str> =
        text.lines().map(str::trim).filter(|l| l.starts_with("import ") && !l.starts_with("import static ")).collect();
    let bridge = BRIDGE
        .replace("/*PACKAGE*/", &package_line(&text))
        .replace("/*IMPORTS*/", &imports.join("\n"))
        .replace("/*CLASS*/", &class)
        .replace("/*RET*/", &ret(hs))
        .replace("/*LIB*/", &serde_json::to_string(&lib)?)
        .replace("/*ID*/", &port.id)
        .replace("/*JSON*/", JSON);
    let prologue = format!(
        "if ({class}.ON) {{\n    @SuppressWarnings(\"unchecked\") {ret} __faR = ({ret}) {class}.call({args});\n    return __faR;\n}}",
        ret = ret(hs),
        args = args_array(hs),
    );
    let patched = native::insert_in_body(&text, "//", &port.id, &prologue, find_body(&port.func, hs.line))?;
    fs::write(native::sibling(&file, &format!("{class}.java"))?, bridge)?;
    fs::write(&file, patched).with_context(|| format!("writing {}", port.file))
}

pub fn disable(ctx: &Ctx, port: &Port) -> Result<()> {
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    fs::write(&file, native::strip_in_body(&text, "//", &port.id)).with_context(|| format!("writing {}", port.file))?;
    let bridge = native::sibling(&file, &format!("{}.java", bridge_class(port)))?;
    if bridge.exists() {
        fs::remove_file(bridge)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn java_types_map_to_rust() {
        assert_eq!(rust_type("int[][]").as_deref(), Some("Vec<Vec<i32>>"));
        assert_eq!(rust_type("List<String>").as_deref(), Some("Vec<String>"));
        assert_eq!(
            rust_type("Map<String, List<Double>>").as_deref(),
            Some("std::collections::HashMap<String, Vec<f64>>")
        );
        assert_eq!(rust_type("Point"), None);
        assert_eq!(
            entry(&["-Xmx1g".into(), "-cp".into(), "x".into(), "App.java".into(), "a".into()]).unwrap(),
            "App.java"
        );
        assert!(entry(&["-jar".into(), "app.jar".into()]).is_err());
        assert!(is_java("C:\\jdk\\bin\\java.exe") && !is_java("javac"));
        assert_eq!(runner("mvn"), Some(Runner::Maven));
        assert_eq!(runner("./gradlew"), Some(Runner::Gradle));
        assert_eq!(runner("gradlew.bat"), Some(Runner::Gradle));
        let dir = std::env::temp_dir().join("fa-release-test");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("pom.xml"),
            "<properties><maven.compiler.release>17</maven.compiler.release></properties>",
        )
        .unwrap();
        assert_eq!(declared_release(&dir), Some(17));
        std::fs::write(dir.join("pom.xml"), "<project/>").unwrap();
        std::fs::write(dir.join("build.gradle.kts"), "tasks.withType<JavaCompile> { options.release = 25 }").unwrap();
        assert_eq!(declared_release(&dir), Some(25));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
