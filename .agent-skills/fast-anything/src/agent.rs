//! Hands TASK.md to a coding agent CLI and lets it edit the crate.

use anyhow::{Context, Result, ensure};
use std::fs::{self, File};
use std::io::{ErrorKind, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};

/// Presets for agents we know; anything else is run as given, with the prompt on stdin.
pub fn argv(spec: &str) -> Vec<String> {
    let preset: &[&str] = match spec {
        "claude" => &[
            "claude",
            "-p",
            "--permission-mode",
            "acceptEdits",
            "--allowedTools",
            "Read Edit Write Glob Grep Bash(cargo check:*) Bash(cargo build:*) Bash(cargo test:*) Bash(cargo fmt:*)",
        ],
        "codex" => &["codex", "exec", "--full-auto", "-"],
        _ => &[],
    };
    if preset.is_empty() {
        spec.split_whitespace().map(String::from).collect()
    } else {
        preset.iter().map(|s| s.to_string()).collect()
    }
}

fn spawn(argv: &[String], dir: &Path, log: &File) -> std::io::Result<Child> {
    Command::new(&argv[0])
        .args(&argv[1..])
        .current_dir(dir)
        .env_remove("CLAUDECODE")
        .stdin(Stdio::piped())
        .stdout(log.try_clone()?)
        .stderr(log.try_clone()?)
        .spawn()
}

pub fn run(spec: &str, dir: &Path, prompt: &str, log_path: &Path) -> Result<()> {
    let argv = argv(spec);
    ensure!(!argv.is_empty(), "empty --agent");
    let log = File::create(log_path)?;
    let mut child = match spawn(&argv, dir, &log) {
        // npm-installed agents are .cmd shims on Windows; let cmd.exe find them.
        Err(e) if e.kind() == ErrorKind::NotFound && cfg!(windows) => {
            let mut wrapped = vec!["cmd".to_string(), "/C".to_string()];
            wrapped.extend(argv.iter().cloned());
            spawn(&wrapped, dir, &log)
        }
        other => other,
    }
    .with_context(|| format!("couldn't start the agent ({}); is it installed and on PATH?", argv[0]))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(prompt.as_bytes())?;
    }
    let status = child.wait()?;
    let text = fs::read_to_string(log_path).unwrap_or_default();
    ensure!(
        status.success(),
        "the agent exited with {status}. Log: {}\n{}",
        log_path.display(),
        crate::util::tail(&text, 15)
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn presets_and_custom() {
        assert_eq!(super::argv("claude")[0], "claude");
        assert_eq!(super::argv("codex"), ["codex", "exec", "--full-auto", "-"]);
        assert_eq!(super::argv("aider --yes"), ["aider", "--yes"]);
    }
}
