//! fast-anything doctor: is everything a port needs installed?

use crate::ui::{self, bold, dim, green, red, yellow};
use anyhow::{Result, ensure};
use std::process::Command;

fn version(program: &str, args: &[&str]) -> Option<String> {
    let run = |p: &str| Command::new(p).args(args).output().ok().filter(|o| o.status.success());
    let out = run(program).or_else(|| if cfg!(windows) { run(&format!("{program}.cmd")) } else { None })?;
    let text = String::from_utf8_lossy(if out.stdout.is_empty() { &out.stderr } else { &out.stdout }).into_owned();
    Some(text.lines().next().unwrap_or("").trim().to_string())
}

/// The oldest version fast-anything works with, as each backend checks it when it starts.
fn minimum(name: &str) -> &'static [u32] {
    match name {
        "cargo" => &[1, 85], // ports use edition 2024
        "python" => &[3, 10],
        "node" => &[22],
        "ruby" => &[3, 3],
        "java" => &[22],
        "go" => &[1, 22],
        "php" => &[8, 1],
        "dotnet" => &[8],
        _ => &[],
    }
}

/// The first number in a version line: "ruby 3.1.7p261 (...)" gives [3, 1, 7], "go1.22.3" [1, 22, 3].
fn parse_version(line: &str) -> Vec<u32> {
    let Some(start) = line.find(|c: char| c.is_ascii_digit()) else { return vec![] };
    let digits: String = line[start..].chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    digits.split('.').map_while(|p| p.parse().ok()).collect()
}

/// Why a runtime that's installed can't be used yet, if it can't.
fn problem(name: &str, found: &str) -> Option<String> {
    let min = minimum(name);
    let version = parse_version(found);
    if !min.is_empty() && !version.is_empty() && version.as_slice() < min {
        let min: Vec<String> = min.iter().map(u32::to_string).collect();
        return Some(format!("too old, {} or newer is needed", min.join(".")));
    }
    if name == "php" {
        let modules = Command::new("php").arg("-m").output().ok()?;
        if !String::from_utf8_lossy(&modules.stdout).lines().any(|l| l.trim() == "FFI") {
            return Some("the FFI extension is off: add extension=ffi to php.ini".into());
        }
    }
    None
}

struct Check {
    name: &'static str,
    found: Option<String>,
    need: &'static str,
    hint: &'static str,
}

pub fn run() -> Result<()> {
    let python = version("python", &["--version"]).or_else(|| version("python3", &["--version"]));
    let checks = [
        Check { name: "cargo", found: version("cargo", &["--version"]), need: "required", hint: "https://rustup.rs" },
        Check { name: "python", found: python, need: "for Python apps (3.10+)", hint: "https://python.org" },
        Check {
            name: "node",
            found: version("node", &["--version"]),
            need: "for JS/TS apps (22+)",
            hint: "https://nodejs.org",
        },
        Check {
            name: "ruby",
            found: version("ruby", &["--version"]),
            need: "for Ruby apps (3.3+)",
            hint: "https://ruby-lang.org",
        },
        Check {
            name: "java",
            found: version("java", &["--version"]),
            need: "for Java apps (22+)",
            hint: "https://adoptium.net",
        },
        Check {
            name: "go",
            found: version("go", &["version"]),
            need: "for Go apps (1.22+)",
            hint: "https://go.dev/dl",
        },
        Check {
            name: "php",
            found: version("php", &["--version"]),
            need: "for PHP apps (8.1+, extension=ffi)",
            hint: "https://php.net",
        },
        Check {
            name: "clang",
            found: version("clang", &["--version"])
                .or_else(|| version("gcc", &["--version"]))
                .or_else(|| version("icpx", &["--version"])),
            need: "for C/C++ apps (or gcc, icpx)",
            hint: "https://llvm.org",
        },
        Check {
            name: "dotnet",
            found: version("dotnet", &["--version"]),
            need: "for C# apps (.NET SDK 8+)",
            hint: "https://dot.net",
        },
        Check {
            name: "claude",
            found: version("claude", &["--version"]),
            need: "--agent claude",
            hint: "https://claude.com/claude-code",
        },
        Check {
            name: "codex",
            found: version("codex", &["--version"]),
            need: "--agent codex",
            hint: "npm i -g @openai/codex",
        },
    ];
    let usable = |c: &Check| c.found.as_deref().is_some_and(|v| problem(c.name, v).is_none());
    for c in &checks {
        match &c.found {
            Some(v) => match problem(c.name, v) {
                None => ui::line(format!("  {} {:<8} {}", green("✓"), bold(c.name), dim(v))),
                Some(why) => ui::line(format!("  {} {:<8} {} {}", red("✗"), bold(c.name), dim(v), why)),
            },
            None if c.need == "required" => {
                ui::line(format!("  {} {:<8} missing, {}: {}", red("✗"), bold(c.name), c.need, c.hint))
            }
            None => ui::line(format!(
                "  {} {:<8} {}",
                yellow("·"),
                c.name,
                dim(format!("not found ({}): {}", c.need, c.hint))
            )),
        }
    }
    ensure!(usable(&checks[0]), "Rust 1.85 or newer is needed to build ports");
    ensure!(checks[1..9].iter().any(usable), "install Python, Node.js, Ruby, Java, Go, PHP, .NET or a C compiler");
    ui::ok("ready");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_and_minimums() {
        assert_eq!(parse_version("ruby 3.1.7p261 (2025-03-26 revision 0a3704f218) [aarch64-linux-gnu]"), [3, 1, 7]);
        assert_eq!(parse_version("go version go1.22.3 linux/amd64"), [1, 22, 3]);
        assert_eq!(parse_version("v24.22.3"), [24, 22, 3]);
        assert_eq!(parse_version("openjdk 25 2025-09-16"), [25]);
        assert_eq!(parse_version("no digits"), Vec::<u32>::new());
        assert!(problem("ruby", "ruby 3.1.7p261").is_some_and(|p| p.contains("3.3 or newer")));
        assert_eq!(problem("ruby", "ruby 3.4.1"), None);
        assert_eq!(problem("node", "v22.0.0"), None);
        assert!(problem("python", "Python 3.9.18").is_some());
        assert_eq!(problem("clang", "Debian clang version 14.0.6"), None, "no minimum");
    }
}
