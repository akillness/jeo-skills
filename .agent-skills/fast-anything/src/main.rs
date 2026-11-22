//! fast-anything: find the slow 5% of your app, rewrite just that in Rust, prove it behaves the same.

mod agent;
mod backend;
mod bench;
mod cfamily;
mod csharp;
mod doctor;
mod golang;
mod hotspot;
mod java;
mod mcp;
mod native;
mod node;
mod php;
mod pipeline;
mod python;
mod report;
mod ruby;
mod show;
mod state;
mod ui;
mod util;

use anyhow::{Result, bail};
use clap::{Parser, Subcommand};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

#[derive(Parser)]
#[command(name = "fast-anything", version, about, arg_required_else_help = true)]
#[command(
    after_help = "One command:\n  fast-anything go --agent claude -- python app.py\n\nStep by step:\n  fast-anything scan -- python app.py\n  fast-anything port\n  fast-anything verify\n  fast-anything enable <id>\n  fast-anything bench"
)]
struct Cli {
    /// Project folder (default: the current folder)
    #[arg(short = 'C', long = "dir", global = true, default_value = ".")]
    dir: PathBuf,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Everything in one go: scan, port the hottest functions with your agent, verify, switch on, benchmark
    Go {
        /// Coding agent that writes the Rust: claude, codex, or any command that reads a prompt on stdin
        #[arg(long)]
        agent: Option<String>,
        /// How many hot functions to port
        #[arg(long, default_value_t = 1)]
        top: usize,
        /// Agent attempts per function before giving up
        #[arg(long, default_value_t = 3)]
        attempts: usize,
        /// Benchmark runs
        #[arg(long, default_value_t = 5)]
        runs: usize,
        /// Real calls to record per function
        #[arg(long, default_value_t = 500)]
        samples: usize,
        /// How you run your app, after --
        #[arg(last = true, required = true)]
        command: Vec<String>,
    },
    /// Run your app under a profiler and rank what's worth porting
    Scan {
        /// How you run your app, after --
        #[arg(last = true, required = true)]
        command: Vec<String>,
    },
    /// Record a function's real calls and set up its Rust crate (default: the top candidate)
    Port {
        id: Option<String>,
        /// Have this coding agent write the port right away
        #[arg(long)]
        agent: Option<String>,
        #[arg(long, default_value_t = 3)]
        attempts: usize,
        #[arg(long, default_value_t = 500)]
        samples: usize,
    },
    /// Build the Rust port and replay every recorded call against it
    Verify {
        id: Option<String>,
        /// Verify every port (after a toolchain or dependency upgrade, or changes to the app)
        #[arg(long, conflicts_with = "id")]
        all: bool,
    },
    /// Switch your app over to the verified Rust port
    Enable {
        id: Option<String>,
        /// Enable even if it hasn't passed verify
        #[arg(long)]
        force: bool,
    },
    /// Switch back to the original code
    Disable {
        id: Option<String>,
        /// Switch every enabled port back
        #[arg(long, conflicts_with = "id")]
        all: bool,
    },
    /// Rebuild every port (after cloning, or a toolchain upgrade)
    Build,
    /// Time your app with the originals vs the Rust ports
    Bench {
        #[arg(long, default_value_t = 5)]
        runs: usize,
    },
    /// Write a shareable report (markdown + SVG card)
    Report,
    /// Show the last scan and every port
    Status,
    /// Check that Rust, Python/Node and your agents are installed
    Doctor,
    /// Run as an MCP server on stdio (for Claude Code, Codex, Cursor, ...)
    Mcp,
    /// Replays recorded calls against a C-bridge port (used by verify, in its own process)
    #[command(name = "__replay", hide = true)]
    Replay { job: PathBuf },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let root = util::absolute(&cli.dir);
    match run(cli.cmd, &root) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            ui::error(format!("{e:#}"));
            ExitCode::FAILURE
        }
    }
}

fn run(cmd: Cmd, root: &Path) -> Result<()> {
    match cmd {
        Cmd::Mcp => return mcp::serve(),
        Cmd::Replay { job } => return native::replay(&job),
        _ => {}
    }
    ui::banner();
    match cmd {
        Cmd::Go { agent, top, attempts, runs, samples, command } => {
            pipeline::go(root, command, agent.as_deref(), top, attempts, runs, samples)
        }
        Cmd::Scan { command } => {
            show::scan(&pipeline::scan(root, command)?);
            Ok(())
        }
        Cmd::Port { id, agent, attempts, samples } => {
            let out = pipeline::port(root, id.as_deref(), samples)?;
            show::port(&out, agent.is_none());
            if let Some(agent) = agent {
                let v = pipeline::agent_port(root, &out.id, &agent, attempts)?;
                if !v.ok() {
                    bail!("{agent} couldn't get {} right in {attempts} attempts", out.id);
                }
                if !v.slower() {
                    show::next(&format!("fast-anything enable {}", out.id));
                }
            }
            Ok(())
        }
        Cmd::Verify { all: true, .. } => pipeline::verify_all(root),
        Cmd::Verify { id, .. } => {
            let (id, v) = pipeline::verify(root, id.as_deref())?;
            show::verify(&id, &v);
            if !v.ok() {
                bail!("{id} doesn't match the original yet");
            }
            if !v.slower() {
                show::next(&format!("fast-anything enable {id}"));
            }
            Ok(())
        }
        Cmd::Enable { id, force } => {
            let id = pipeline::enable(root, id.as_deref(), force)?;
            ui::ok(format!("{} now runs in Rust", ui::bold(&id)));
            show::next("fast-anything bench");
            Ok(())
        }
        Cmd::Disable { all: true, .. } => {
            let ids = pipeline::disable_all(root)?;
            if ids.is_empty() {
                ui::ok("no port was switched on");
            }
            for id in ids {
                ui::ok(format!("{} is back to the original code", ui::bold(&id)));
            }
            Ok(())
        }
        Cmd::Disable { id, .. } => {
            let id = pipeline::disable(root, id.as_deref())?;
            ui::ok(format!("{} is back to the original code", ui::bold(&id)));
            Ok(())
        }
        Cmd::Build => pipeline::build_all(root),
        Cmd::Bench { runs } => {
            show::bench(&pipeline::bench(root, runs)?);
            show::next("fast-anything report");
            Ok(())
        }
        Cmd::Report => {
            show::report(&pipeline::report(root)?);
            Ok(())
        }
        Cmd::Status => {
            show::status(&state::Ctx::open(root)?);
            Ok(())
        }
        Cmd::Doctor => doctor::run(),
        Cmd::Mcp | Cmd::Replay { .. } => unreachable!(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disable_all_parses() {
        assert!(matches!(
            Cli::try_parse_from(["fast-anything", "disable", "--all"]).unwrap().cmd,
            Cmd::Disable { all: true, id: None }
        ));
        assert!(Cli::try_parse_from(["fast-anything", "disable", "fuzzy.lev", "--all"]).is_err());
    }

    #[test]
    fn verify_all_parses() {
        let cli = Cli::try_parse_from(["fast-anything", "verify", "--all"]).unwrap();
        assert!(matches!(cli.cmd, Cmd::Verify { all: true, id: None }));
        assert!(Cli::try_parse_from(["fast-anything", "verify", "fuzzy.lev", "--all"]).is_err(), "an id or --all");
        assert!(matches!(
            Cli::try_parse_from(["fast-anything", "verify"]).unwrap().cmd,
            Cmd::Verify { all: false, .. }
        ));
    }
}
