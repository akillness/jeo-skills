//! Everything fast-anything knows about a project, kept in <project>/.fast/state.json.

use crate::backend::Lang;
use crate::bench::BenchResult;
use crate::hotspot::Hotspot;
use crate::util;
use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const GITIGNORE: &str = "# fast-anything: commit ports/*/src and Cargo.toml (your Rust ports); skip the rest\n\
target/\nlib/\nbin/\nbackup/\nrunner.*\nrecorder.*\nDescribe.java\n*.txt\njob-*.json\nprofile.*\n*.pprof\nverify.json\n*.jsonl\n*.meta.json\n*.log\n";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct State {
    pub version: u32,
    /// How the app is run, e.g. ["python", "app.py"].
    pub command: Vec<String>,
    pub lang: Lang,
    /// Absolute path of the interpreter (python, node).
    #[serde(alias = "python")]
    pub runtime: Option<String>,
    /// Folder Python imports the app's modules from, relative to the project.
    pub base: String,
    pub wall: f64,
    pub hotspots: Vec<Hotspot>,
    pub ports: BTreeMap<String, Port>,
    pub bench: Option<BenchResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Port {
    pub id: String,
    pub file: String,
    pub module: String,
    pub func: String,
    /// Name of the compiled extension module.
    pub ext: String,
    pub crate_dir: String,
    pub recorded: usize,
    pub calls_seen: u64,
    pub verify: Option<Verify>,
    pub enabled: bool,
    #[serde(default)]
    pub lang: Lang,
    #[serde(default)]
    pub owner: Option<String>,
    /// Where the function started when it was ported (to find it again among overloads).
    #[serde(default)]
    pub line: u32,
    /// Source of the function and the helpers ported with it, as recorded (only text found verbatim
    /// in the file). When one of them is gone, the original changed and the port may be stale.
    #[serde(default)]
    pub sources: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Verify {
    pub built: bool,
    pub build_log: Option<String>,
    pub total: usize,
    /// Of total: extra cases made by shrinking recorded inputs, answered by the original.
    pub derived: usize,
    /// Of derived: edge cases (special numbers, non-ASCII text, empty and much bigger inputs).
    pub edges: usize,
    pub passed: usize,
    pub failed: usize,
    pub failures: Vec<Failure>,
    pub micro: Option<Micro>,
    pub lang: Lang,
    /// Hash of the crate's sources this result is for (see backend::source_hash).
    pub source_hash: Option<String>,
}

/// The forms a source may take in the file: as recorded, or with const and let swapped (a Node
/// port switches its function's const to let while enabled).
fn forms(source: &str) -> [String; 3] {
    let source = source.replace("\r\n", "\n");
    [source.replacen("const ", "let ", 1), source.replacen("let ", "const ", 1), source]
}

/// The source appears in the file as whole lines.
fn found(text: &str, source: &str) -> bool {
    let text = format!("\n{}\n", text.replace("\r\n", "\n"));
    forms(source).iter().any(|s| text.contains(&format!("\n{}\n", s.trim_end_matches('\n'))))
}

/// The sources that start a line in the file, each extended to the end of its last line so that
/// found() can match it as whole lines (see Port::sources).
pub fn verbatim(text: &str, sources: &[&str]) -> Vec<String> {
    let text = format!("\n{}\n", text.replace("\r\n", "\n"));
    sources
        .iter()
        .filter(|s| !s.trim().is_empty())
        .filter_map(|s| {
            forms(s).iter().find_map(|form| {
                let at = text.find(&format!("\n{form}"))? + 1;
                let end = at + form.len() + text[at + form.len()..].find('\n')?;
                Some(text[at..end].to_string())
            })
        })
        .collect()
}

impl Verify {
    pub fn ok(&self) -> bool {
        self.built && self.total > 0 && self.failed == 0
    }

    /// Right, but slower per call than the original: the cost of crossing into Rust outweighs the work.
    pub fn slower(&self) -> bool {
        self.micro.is_some_and(|m| m.speedup > 0.0 && m.speedup < 1.0)
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Failure {
    pub case: usize,
    pub call: String,
    pub expected: String,
    pub got: String,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Micro {
    /// Per call in the original language.
    #[serde(alias = "python_ns")]
    pub original_ns: f64,
    pub rust_ns: f64,
    pub speedup: f64,
}

pub struct Ctx {
    pub root: PathBuf,
    pub fast: PathBuf,
    pub state: State,
}

impl Ctx {
    /// The original changed since the port recorded it: its recorded calls and its Rust may be out of date.
    pub fn stale(&self, port: &Port) -> bool {
        let Ok(text) = fs::read_to_string(self.root.join(&port.file)) else { return false };
        port.sources.iter().any(|s| !found(&text, s))
    }

    pub fn open(root: &Path) -> Result<Ctx> {
        let root = util::absolute(root);
        ensure!(root.is_dir(), "{} isn't a folder", root.display());
        let fast = root.join(".fast");
        fs::create_dir_all(&fast).context("creating .fast/")?;
        let gitignore = fast.join(".gitignore");
        if !gitignore.exists() {
            fs::write(&gitignore, GITIGNORE)?;
        }
        let path = fast.join("state.json");
        let state = if path.exists() {
            serde_json::from_str(&fs::read_to_string(&path)?).context("reading .fast/state.json")?
        } else {
            State { version: 1, ..State::default() }
        };
        Ok(Ctx { root, fast, state })
    }

    pub fn save(&self) -> Result<()> {
        let tmp = self.fast.join("state.json.tmp");
        fs::write(&tmp, serde_json::to_string_pretty(&self.state)?)?;
        fs::rename(&tmp, self.fast.join("state.json")).context("saving .fast/state.json")
    }

    pub fn runtime(&self) -> Result<&str> {
        self.state.runtime.as_deref().context("no scan yet: run  fast-anything scan -- python your_app.py  (or node)")
    }

    pub fn lib_dir(&self) -> PathBuf {
        self.fast.join("lib")
    }

    pub fn crate_dir(&self, port: &Port) -> PathBuf {
        self.root.join(port.crate_dir.replace('/', std::path::MAIN_SEPARATOR_STR))
    }

    pub fn base_dir(&self) -> PathBuf {
        self.root.join(if self.state.base.is_empty() { "." } else { &self.state.base })
    }

    /// Accepts a full id, a bare function name, or nothing when there's exactly one port.
    pub fn resolve_port(&self, id: Option<&str>) -> Result<String> {
        let ports = &self.state.ports;
        let names = || ports.keys().cloned().collect::<Vec<_>>().join(", ");
        match id {
            None => match ports.len() {
                0 => bail!("nothing ported yet: run  fast-anything port"),
                1 => Ok(ports.keys().next().cloned().unwrap_or_default()),
                _ => bail!("which one? {}", names()),
            },
            Some(id) if ports.contains_key(id) => Ok(id.to_string()),
            Some(id) => {
                let suffix = format!(".{id}");
                let hits: Vec<&String> =
                    ports.values().filter(|p| p.func == id || p.id.ends_with(&suffix)).map(|p| &p.id).collect();
                match hits.as_slice() {
                    [one] => Ok((*one).clone()),
                    [] if ports.is_empty() => bail!("nothing ported yet: run  fast-anything port {id}"),
                    [] => bail!("no port called {id} (have: {})", names()),
                    _ => bail!("{id} is ambiguous: {}", names()),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slower_only_when_measured_below_one() {
        let v =
            |speedup| Verify { micro: Some(Micro { original_ns: 1.0, rust_ns: 1.0, speedup }), ..Verify::default() };
        assert!(v(0.5).slower());
        assert!(!v(1.4).slower());
        assert!(!v(0.0).slower(), "no measurement isn't slower");
        assert!(!Verify::default().slower());
    }

    #[test]
    fn sources_are_found_verbatim() {
        let file = "def f(x):\r\n    return x\r\n\r\nexport let g = (n) => n;\n";
        let kept = verbatim(file, &["def f(x):\n    return x", "export const g = (n) => n", "def h(): pass", "  "]);
        assert_eq!(kept, ["def f(x):\n    return x", "export let g = (n) => n;"], "extended to the end of the line");
        assert!(found(&file.replace("export let", "export const"), &kept[1]), "const or let");
        let edited = file.replace("return x", "return x + 1");
        assert!(!found(&edited, &kept[0]), "an edited function is no longer found");
        assert!(found(&format!("x = 1\n{}", kept[0]), &kept[0]), "at the end of a file without a final newline");
    }
}
