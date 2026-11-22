//! Terminal output. Silent in MCP mode, where stdout belongs to the protocol.

use std::fmt::Display;
use std::io::IsTerminal;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

static QUIET: AtomicBool = AtomicBool::new(false);
static COLOR: OnceLock<bool> = OnceLock::new();

type Progress = Box<dyn FnMut(&str) + Send>;
static PROGRESS: Mutex<Option<Progress>> = Mutex::new(None);

/// While set, every step() line is passed here too, even when quiet (MCP progress notifications).
pub fn set_progress(progress: Option<Progress>) {
    *PROGRESS.lock().unwrap_or_else(|e| e.into_inner()) = progress;
}

pub fn set_quiet(quiet: bool) {
    QUIET.store(quiet, Ordering::Relaxed);
}

pub fn quiet() -> bool {
    QUIET.load(Ordering::Relaxed)
}

fn color() -> bool {
    *COLOR.get_or_init(|| std::env::var_os("NO_COLOR").is_none() && std::io::stdout().is_terminal())
}

fn paint(code: &str, s: impl Display) -> String {
    if color() { format!("\x1b[{code}m{s}\x1b[0m") } else { s.to_string() }
}

pub fn bold(s: impl Display) -> String {
    paint("1", s)
}
pub fn dim(s: impl Display) -> String {
    paint("2", s)
}
pub fn green(s: impl Display) -> String {
    paint("32", s)
}
pub fn red(s: impl Display) -> String {
    paint("31", s)
}
pub fn yellow(s: impl Display) -> String {
    paint("33", s)
}
pub fn rust(s: impl Display) -> String {
    paint("38;5;208", s)
}

pub fn line(s: impl Display) {
    if !quiet() {
        println!("{s}");
    }
}

pub fn step(s: impl Display) {
    let text = s.to_string();
    if let Some(progress) = PROGRESS.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
        progress(&text);
    }
    line(format!("{} {text}", rust("▸")));
}

pub fn ok(s: impl Display) {
    line(format!("{} {s}", green("✓")));
}

pub fn warn(s: impl Display) {
    if !quiet() {
        eprintln!("{} {s}", yellow("!"));
    }
}

pub fn error(s: impl Display) {
    eprintln!("{} {s}", red("✗"));
}

pub fn banner() {
    line(format!("{} {}", rust(bold("⚡ fast-anything")), dim(concat!("v", env!("CARGO_PKG_VERSION")))));
}
