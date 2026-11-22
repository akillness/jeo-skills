//! Small helpers: paths, processes, number formatting.

use anyhow::{Context, Result};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Output};

pub fn absolute(p: &Path) -> PathBuf {
    std::path::absolute(p).unwrap_or_else(|_| p.to_path_buf())
}

/// Path from directory from to to, both absolute.
pub fn relative(from: &Path, to: &Path) -> PathBuf {
    let a: Vec<Component> = from.components().collect();
    let b: Vec<Component> = to.components().collect();
    let common = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    let mut out = PathBuf::new();
    for _ in common..a.len() {
        out.push("..");
    }
    for c in &b[common..] {
        out.push(c);
    }
    out
}

/// "python3" from "python3", "/usr/bin/python3" or "C:\\Python\\python.exe", on any OS.
pub fn program_stem(program: &str) -> String {
    let name = program.rsplit(['/', '\\']).next().unwrap_or(program).to_ascii_lowercase();
    name.strip_suffix(".exe").unwrap_or(&name).to_string()
}

pub fn forward_slashes(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

/// A name safe for Rust crates and Python modules.
pub fn slug(id: &str) -> String {
    id.chars().map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '_' }).collect()
}

pub fn output(cmd: &mut Command, what: &str) -> Result<Output> {
    cmd.output().with_context(|| format!("couldn't start {what} ({})", cmd.get_program().to_string_lossy()))
}

pub fn combined(out: &Output) -> String {
    format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr))
}

pub fn tail(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.trim_end().lines().collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

pub fn secs(s: f64) -> String {
    if s >= 1.0 {
        format!("{s:.2}s")
    } else if s >= 1e-3 {
        format!("{:.0}ms", s * 1e3)
    } else {
        format!("{:.0}µs", s * 1e6)
    }
}

pub fn nanos(ns: f64) -> String {
    if ns < 1e3 {
        format!("{ns:.0}ns")
    } else if ns < 1e6 {
        format!("{:.1}µs", ns / 1e3)
    } else {
        format!("{:.1}ms", ns / 1e6)
    }
}

pub fn times(x: f64) -> String {
    if x >= 10.0 { format!("{x:.0}×") } else { format!("{x:.1}×") }
}

pub fn thousands(n: u64) -> String {
    let s = n.to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_paths() {
        let r = relative(Path::new("/a/b/c"), Path::new("/a/.fast/lib"));
        assert_eq!(forward_slashes(&r), "../../.fast/lib");
        assert_eq!(forward_slashes(&relative(Path::new("/a"), Path::new("/a/x"))), "x");
    }

    #[test]
    fn formatting() {
        assert_eq!(thousands(1234567), "1,234,567");
        assert_eq!(thousands(12), "12");
        assert_eq!(times(87.4), "87×");
        assert_eq!(times(3.21), "3.2×");
        assert_eq!(slug("text.utils.Lev-1"), "text_utils_lev_1");
        assert_eq!(nanos(350.0), "350ns");
        assert_eq!(secs(0.25), "250ms");
    }
}
