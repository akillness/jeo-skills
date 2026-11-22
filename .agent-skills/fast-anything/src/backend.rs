//! What every language backend does, and the parts they share: building the crate and
//! the marked blocks appended to source files.

use crate::hotspot::Hotspot;
use crate::state::{Ctx, Port, Verify};
use crate::util::{output, tail};
use crate::{cfamily, csharp, golang, java, node, php, python, ruby};
use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    #[default]
    Python,
    Node,
    Ruby,
    Java,
    Go,
    Php,
    C,
    Cpp,
    #[serde(rename = "csharp")]
    CSharp,
}

#[derive(Deserialize)]
pub struct Profile {
    pub wall: f64,
    pub base: String,
    pub functions: Vec<Hotspot>,
}

#[derive(Deserialize)]
pub struct Recording {
    pub calls: u64,
    pub kept: usize,
    pub skipped: usize,
    pub unsupported: Vec<String>,
    /// The function changed an argument in place during a recorded call.
    #[serde(default)]
    pub mutates: bool,
}

/// Launchers that can't be unwrapped the way uv run or poetry run are (see python::unwrap_env_runner).
fn wrapper_hint(program: &str) -> Option<&'static str> {
    Some(match crate::util::program_stem(program).as_str() {
        "tsx" | "ts-node" | "npx" => {
            "Node.js 22.6+ runs TypeScript itself, and fast-anything needs node to start the app:\n    fast-anything scan -- node app.ts"
        }
        "bundle" => {
            "bundle exec sets up gems for its own process only. Scan with ruby directly, and if the app needs Bundler, put  require \"bundler/setup\"  at the top of its script:\n    fast-anything scan -- ruby app.rb"
        }
        _ => return None,
    })
}

impl Lang {
    pub fn detect(program: &str) -> Result<Lang> {
        if python::is_python(program) {
            Ok(Lang::Python)
        } else if node::is_node(program) {
            Ok(Lang::Node)
        } else if ruby::is_ruby(program) {
            Ok(Lang::Ruby)
        } else if java::is_java(program) {
            Ok(Lang::Java)
        } else if golang::is_go(program) {
            Ok(Lang::Go)
        } else if php::is_php(program) {
            Ok(Lang::Php)
        } else if csharp::is_csharp(program) {
            Ok(Lang::CSharp)
        } else if let Some(lang) = cfamily::detect(program) {
            Ok(lang)
        } else if let Some(hint) = wrapper_hint(program) {
            bail!("{hint}")
        } else {
            bail!(
                "fast-anything speaks Python, Node.js (JavaScript/TypeScript), Ruby, Java, Go, PHP, C, C++ and C#. Start the command with one of them:\n    fast-anything scan -- python app.py\n    fast-anything scan -- node app.js\n    fast-anything scan -- ruby app.rb\n    fast-anything scan -- java App.java\n    fast-anything scan -- go run .\n    fast-anything scan -- php app.php\n    fast-anything scan -- clang -O2 main.c  (or gcc, g++, clang++, icpx)\n    fast-anything scan -- dotnet run -c Release"
            )
        }
    }

    /// Ports called through the C entry point, with the port in src/port.rs.
    pub fn c_bridge(self) -> bool {
        matches!(self, Lang::Ruby | Lang::Java | Lang::Go | Lang::Php | Lang::C | Lang::Cpp | Lang::CSharp)
    }

    pub fn label(self) -> &'static str {
        match self {
            Lang::Python => "Python",
            Lang::Node => "JavaScript",
            Lang::Ruby => "Ruby",
            Lang::Java => "Java",
            Lang::Go => "Go",
            Lang::Php => "PHP",
            Lang::C => "C",
            Lang::Cpp => "C++",
            Lang::CSharp => "C#",
        }
    }

    pub fn resolve(self, program: &str, root: &Path) -> Result<String> {
        match self {
            Lang::Python => python::resolve(program, root),
            Lang::Node => node::resolve(program, root),
            Lang::Ruby => ruby::resolve(program, root),
            Lang::Java => java::resolve(program, root),
            Lang::Go => golang::resolve(program, root),
            Lang::Php => php::resolve(program, root),
            Lang::C | Lang::Cpp => cfamily::resolve(program, root),
            Lang::CSharp => csharp::resolve(program, root),
        }
    }

    pub fn profile(self, ctx: &Ctx, exe: &str, args: &[String]) -> Result<Profile> {
        match self {
            Lang::Python => python::profile(ctx, exe, args),
            Lang::Node => node::profile(ctx, exe, args),
            Lang::Ruby => ruby::profile(ctx, exe, args),
            Lang::Java => java::profile(ctx, exe, args),
            Lang::Go => golang::profile(ctx, exe, args),
            Lang::Php => php::profile(ctx, exe, args),
            Lang::C | Lang::Cpp => cfamily::profile(ctx, exe, args, self),
            Lang::CSharp => csharp::profile(ctx, exe, args),
        }
    }

    pub fn record(
        self,
        ctx: &Ctx,
        exe: &str,
        args: &[String],
        hs: &Hotspot,
        out: &Path,
        limit: usize,
    ) -> Result<Recording> {
        match self {
            Lang::Python => python::record(ctx, exe, args, hs, out, limit),
            Lang::Node => node::record(ctx, exe, args, hs, out, limit),
            Lang::Ruby => ruby::record(ctx, exe, args, hs, out, limit),
            Lang::Java => java::record(ctx, exe, args, hs, out, limit),
            Lang::Go => golang::record(ctx, exe, args, hs, out, limit),
            Lang::Php => php::record(ctx, exe, args, hs, out, limit),
            Lang::C | Lang::Cpp => cfamily::record(ctx, exe, args, hs, out, self),
            Lang::CSharp => csharp::record(ctx, exe, args, hs, out, limit),
        }
    }

    pub fn scaffold(self, ctx: &Ctx, hs: &Hotspot, helpers: &[Hotspot], port: &Port) -> Result<String> {
        match self {
            Lang::Python => python::scaffold(ctx, hs, helpers, port),
            Lang::Node => node::scaffold(ctx, hs, helpers, port),
            Lang::Ruby => ruby::scaffold(ctx, hs, helpers, port),
            Lang::Java => java::scaffold(ctx, hs, helpers, port),
            Lang::Go => golang::scaffold(ctx, hs, helpers, port),
            Lang::Php => php::scaffold(ctx, hs, helpers, port),
            Lang::C | Lang::Cpp => cfamily::scaffold(ctx, hs, helpers, port),
            Lang::CSharp => csharp::scaffold(ctx, hs, helpers, port),
        }
    }

    pub fn verify(self, ctx: &Ctx, port: &Port) -> Result<Verify> {
        match self {
            Lang::Python => python::verify(ctx, port),
            Lang::Node => node::verify(ctx, port),
            Lang::Ruby => ruby::verify(ctx, port),
            Lang::Java => java::verify(ctx, port),
            Lang::Go => golang::verify(ctx, port),
            Lang::Php => php::verify(ctx, port),
            Lang::C | Lang::Cpp => cfamily::verify(ctx, port),
            Lang::CSharp => csharp::verify(ctx, port),
        }
    }

    pub fn enable(self, ctx: &Ctx, port: &Port) -> Result<()> {
        match self {
            Lang::Python => python::enable(ctx, port),
            Lang::Node => node::enable(ctx, port),
            Lang::Ruby => ruby::enable(ctx, port),
            Lang::Java => java::enable(ctx, port),
            Lang::Go => golang::enable(ctx, port),
            Lang::Php => php::enable(ctx, port),
            Lang::C | Lang::Cpp => cfamily::enable(ctx, port),
            Lang::CSharp => csharp::enable(ctx, port),
        }
    }

    pub fn disable(self, ctx: &Ctx, port: &Port) -> Result<()> {
        match self {
            Lang::Python => python::disable(ctx, port),
            Lang::Node => node::disable(ctx, port),
            Lang::Ruby => ruby::disable(ctx, port),
            Lang::Java => java::disable(ctx, port),
            Lang::Go => golang::disable(ctx, port),
            Lang::Php => php::disable(ctx, port),
            Lang::C | Lang::Cpp => cfamily::disable(ctx, port),
            Lang::CSharp => csharp::disable(ctx, port),
        }
    }

    /// What bench runs: (program, args). Go apps are built once, so the compiler isn't timed.
    pub fn bench_command(self, ctx: &Ctx) -> Result<(String, Vec<String>)> {
        let exe = ctx.runtime()?;
        match self {
            Lang::Go => golang::bench_command(ctx, exe),
            Lang::Java => java::bench_command(ctx, exe),
            Lang::C | Lang::Cpp => cfamily::bench_command(ctx, exe),
            Lang::CSharp => csharp::bench_command(ctx, exe),
            _ => Ok((exe.to_string(), ctx.state.command[1..].to_vec())),
        }
    }

    /// (file cargo builds, name it gets in .fast/lib)
    pub fn artifact(self, ext: &str) -> (String, String) {
        let built = if cfg!(windows) {
            format!("{ext}.dll")
        } else if cfg!(target_os = "macos") {
            format!("lib{ext}.dylib")
        } else {
            format!("lib{ext}.so")
        };
        let dest = match self {
            Lang::Python if cfg!(windows) => format!("{ext}.pyd"),
            Lang::Python => format!("{ext}.abi3.so"),
            Lang::Node => format!("{ext}.node"),
            // loaded through a C FFI (Fiddle, FFM, ...): the platform's own library name
            Lang::Ruby | Lang::Java | Lang::Go | Lang::Php | Lang::C | Lang::Cpp | Lang::CSharp => built.clone(),
        };
        (built, dest)
    }
}

/// Settings shared by every generated crate: tuned for the machine that builds it
/// (.fast/lib is rebuilt per machine, never shipped), plus macOS extension linking.
pub const CARGO_CONFIG: &str = "# Built for the machine that runs it: .fast/lib is rebuilt per machine, never shipped.\n\
[build]\nrustflags = [\"-C\", \"target-cpu=native\"]\n\n\
# Extensions on macOS resolve the host's symbols at load time.\n\
[target.aarch64-apple-darwin]\nrustflags = [\"-C\", \"target-cpu=native\", \"-C\", \"link-arg=-undefined\", \"-C\", \"link-arg=dynamic_lookup\"]\n\n\
[target.x86_64-apple-darwin]\nrustflags = [\"-C\", \"target-cpu=native\", \"-C\", \"link-arg=-undefined\", \"-C\", \"link-arg=dynamic_lookup\"]\n";

/// No LTO and the default codegen units: a port lives in one crate, so cross-crate inlining buys
/// nothing measurable, while rebuilds after each edit get about 4x faster (4.1s to 1.1s).
pub const RELEASE_PROFILE: &str = "[profile.release]\nopt-level = 3\nlto = false\n\n\
# A crate of its own, even inside another Cargo workspace.\n[workspace]\n";

fn compiler_errors(log: &str) -> String {
    let noise =
        ["Compiling", "Finished", "Updating", "Locking", "Downloading", "Downloaded", "Blocking", "Adding", "Checking"];
    let kept: Vec<&str> = log.lines().filter(|l| !noise.iter().any(|n| l.trim_start().starts_with(n))).collect();
    tail(&kept.join("\n"), 60)
}

/// Release-build a port into .fast/lib. Ok(Err(log)) when it doesn't compile.
/// Every port shares one target dir, so dependencies compile once per project.
pub fn build(ctx: &Ctx, port: &Port) -> Result<std::result::Result<PathBuf, String>> {
    let exe = ctx.runtime()?;
    let dir = ctx.crate_dir(port);
    ensure!(dir.join("Cargo.toml").exists(), "{} has no crate yet: run  fast-anything port {}", port.id, port.id);
    let target = ctx.fast.join("target");
    let mut cmd = Command::new("cargo");
    cmd.args(["build", "--release", "--message-format=short"]).current_dir(&dir).env("CARGO_TARGET_DIR", &target);
    if port.lang == Lang::Python {
        cmd.env("PYO3_PYTHON", exe);
    }
    let out = output(&mut cmd, "cargo (install Rust from https://rustup.rs)")?;
    if !out.status.success() {
        return Ok(Err(compiler_errors(&String::from_utf8_lossy(&out.stderr))));
    }
    let (built, name) = port.lang.artifact(&port.ext);
    let lib_dir = ctx.lib_dir();
    fs::create_dir_all(&lib_dir)?;
    let dest = lib_dir.join(name);
    fs::copy(target.join("release").join(&built), &dest)
        .with_context(|| format!("copying {built} into .fast/lib (is the app still running?)"))?;
    Ok(Ok(dest))
}

/// FNV-1a over the crate's Cargo.toml and everything under src/, so build can tell whether the
/// sources are still the ones verify checked. Stable across Rust versions, unlike DefaultHasher.
pub fn source_hash(dir: &Path) -> Result<String> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
        for entry in fs::read_dir(dir).with_context(|| format!("reading {}", dir.display()))? {
            let path = entry?.path();
            if path.is_dir() { walk(&path, out)? } else { out.push(path) }
        }
        Ok(())
    }
    let mut files = vec![dir.join("Cargo.toml")];
    if dir.join("src").is_dir() {
        walk(&dir.join("src"), &mut files)?;
    }
    files.sort();
    let mut h: u64 = 0xcbf29ce484222325;
    for file in &files {
        let rel = file.strip_prefix(dir).unwrap_or(file).to_string_lossy().replace('\\', "/");
        let bytes = fs::read(file).with_context(|| format!("reading {}", file.display()))?;
        for b in rel.bytes().chain([0]).chain(bytes).chain([0]) {
            h = (h ^ b as u64).wrapping_mul(0x100000001b3);
        }
    }
    Ok(format!("{h:016x}"))
}

// ------------------------------------------------------------------ marked blocks

pub fn markers(comment: &str, id: &str) -> (String, String) {
    (format!("{comment} >>> fast-anything: {id} >>>"), format!("{comment} <<< fast-anything: {id} <<<"))
}

fn newline(text: &str) -> &'static str {
    if text.contains("\r\n") { "\r\n" } else { "\n" }
}

/// Remove the block for id; the rest of the file comes back byte for byte.
pub fn strip_marked(text: &str, comment: &str, id: &str) -> String {
    let (begin, end) = markers(comment, id);
    let Some(start) = text.find(&begin) else { return text.to_string() };
    let Some(len) = text[start..].find(&end) else { return text.to_string() };
    let nl = newline(text);
    let rest = &text[start + len + end.len()..];
    let rest = rest.strip_prefix(nl).unwrap_or(rest);
    if rest.is_empty() {
        // appended at the end, after one blank line
        let before = &text[..start];
        before.strip_suffix(nl).unwrap_or(before).to_string()
    } else {
        // inserted before other code, followed by one blank line
        format!("{}{}", &text[..start], rest.strip_prefix(nl).unwrap_or(rest))
    }
}

fn block(text: &str, comment: &str, id: &str, body: &str) -> String {
    let (begin, end) = markers(comment, id);
    format!("{begin}\n{body}\n{end}").replace('\n', newline(text))
}

/// Append (or replace) the block for id at the end of the file, after one blank line.
pub fn append_marked(text: &str, comment: &str, id: &str, body: &str) -> String {
    let text = strip_marked(text, comment, id);
    let nl = newline(&text);
    let gap = if text.ends_with('\n') { nl.to_string() } else { format!("{nl}{nl}") };
    format!("{text}{gap}{}{nl}", block(&text, comment, id, body))
}

/// Insert (or replace) the block for id right before the line at byte offset at.
pub fn insert_marked(text: &str, comment: &str, id: &str, body: &str, at: impl Fn(&str) -> Option<usize>) -> String {
    let text = strip_marked(text, comment, id);
    let Some(at) = at(&text) else { return append_marked(&text, comment, id, body) };
    let nl = newline(&text);
    format!("{}{}{nl}{nl}{}", &text[..at], block(&text, comment, id, body), &text[at..])
}

/// Byte offset of the first top-level line that starts with one of the prefixes.
pub fn line_starting(text: &str, prefixes: &[&str]) -> Option<usize> {
    let mut offset = 0;
    for line in text.split_inclusive('\n') {
        let squashed: String = line.chars().filter(|c| !c.is_whitespace()).collect();
        let top_level = !line.starts_with([' ', '\t']);
        if top_level && prefixes.iter().any(|p| squashed.starts_with(p)) {
            return Some(offset);
        }
        offset += line.len();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_hash_follows_the_sources() {
        let dir = std::env::temp_dir().join(format!("fa-hash-test-{}", std::process::id()));
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::write(dir.join("Cargo.toml"), "[package]\n").unwrap();
        fs::write(dir.join("src/lib.rs"), "fn f() {}\n").unwrap();
        let first = source_hash(&dir).unwrap();
        assert_eq!(source_hash(&dir).unwrap(), first);
        fs::write(dir.join("TASK.md"), "not a source").unwrap();
        assert_eq!(source_hash(&dir).unwrap(), first, "only Cargo.toml and src/ count");
        fs::write(dir.join("src/lib.rs"), "fn f() { }\n").unwrap();
        assert_ne!(source_hash(&dir).unwrap(), first);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn launchers_get_a_hint() {
        assert!(Lang::detect("npx").unwrap_err().to_string().contains("node app.ts"));
        assert!(Lang::detect("tsx").unwrap_err().to_string().contains("node app.ts"));
        assert!(Lang::detect("bundle").unwrap_err().to_string().contains("bundler/setup"));
        assert!(Lang::detect("cobol").unwrap_err().to_string().starts_with("fast-anything speaks"));
    }

    #[test]
    fn blocks_come_out_byte_for_byte() {
        let guard = |t: &str| line_starting(t, &["if__name__==\"__main__\":", "if__name__=='__main__':"]);
        for original in ["a = 1\n", "a = 1\r\n", "a = 1\n\n\nif __name__ == \"__main__\":\n    main()\n", "x"] {
            let appended = append_marked(original, "#", "m.f", "f = g");
            assert!(appended.contains("# >>> fast-anything: m.f >>>"));
            assert_eq!(
                strip_marked(&appended, "#", "m.f"),
                original.to_string() + if original == "x" { "\n" } else { "" }
            );
            let inserted = insert_marked(original, "#", "m.f", "f = g", guard);
            assert_eq!(insert_marked(&inserted, "#", "m.f", "f = g", guard), inserted, "idempotent");
            let back = strip_marked(&inserted, "#", "m.f");
            assert_eq!(back.trim_end(), original.trim_end());
            if original.contains("__main__") {
                assert_eq!(back, original);
                assert!(inserted.find(">>>").unwrap() < inserted.find("if __name__").unwrap());
            }
        }
        let two = append_marked(&append_marked("a\n", "#", "one", "1"), "#", "two", "2");
        assert_eq!(strip_marked(&strip_marked(&two, "#", "one"), "#", "two"), "a\n");
    }
}
