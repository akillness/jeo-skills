//! How results look in the terminal.

use crate::bench::BenchResult;
use crate::pipeline::{PortOut, ScanOut};
use crate::report::ReportOut;
use crate::state::{Ctx, Verify};
use crate::ui::{self, bold, dim, green, red, rust, yellow};
use crate::util::{nanos, secs, thousands, times};

fn bar(share: f64, width: usize) -> String {
    const PARTS: [char; 8] = ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
    let eighths = (share.clamp(0.0, 1.0) * (width * 8) as f64).round() as usize;
    let mut s = "█".repeat(eighths / 8);
    if !eighths.is_multiple_of(8) {
        s.push(PARTS[eighths % 8 - 1]);
    }
    format!("{s:<width$}")
}

fn pad(s: &str, n: usize) -> String {
    let len = s.chars().count();
    if len >= n {
        format!("{}…", s.chars().take(n - 1).collect::<String>())
    } else {
        format!("{s}{}", " ".repeat(n - len))
    }
}

pub fn next(cmd: &str) {
    ui::line(format!("  {} {}", dim("→"), bold(cmd)));
}

pub fn scan(s: &ScanOut) {
    ui::ok(format!("{} ran in {}", bold(s.command.join(" ")), secs(s.wall)));
    ui::line("");
    if s.hotspots.is_empty() {
        ui::line("  No functions from your own code showed up. Is the app doing its work in a library?");
        return;
    }
    ui::line(dim(format!("   #  {}  {:<16}{:>11}  verdict", pad("function", 30), "time", "calls")));
    for (i, h) in s.hotspots.iter().take(10).enumerate() {
        let verdict = if let Some(by) = &h.covered_by {
            dim(format!("↳ ported inside {}", by.rsplit(['.', ':']).next().unwrap_or(by)))
        } else if h.worth_it() {
            green("✓ port it")
        } else if h.portable() {
            dim("· too small to matter")
        } else {
            dim(format!("✗ {}", h.blockers[0]))
        };
        let row = format!(
            "  {:>2}  {}  {} {:>5.1}%{:>11}  {verdict}",
            i + 1,
            pad(&h.id, 30),
            rust(bar(h.share, 9)),
            h.share * 100.0,
            if h.ncalls == 0 { "-".to_string() } else { thousands(h.ncalls) }
        );
        ui::line(if h.worth_it() { row } else { dim(row) });
        if h.worth_it() {
            for w in &h.warnings {
                ui::line(format!("{}{}", " ".repeat(36), yellow(format!("! {w}"))));
            }
        }
    }
    ui::line("");
    match s.hotspots.iter().find(|h| h.worth_it()) {
        Some(h) => next(&format!("fast-anything port {}", h.id)),
        None => {
            ui::line("  Nothing portable takes a real share of the run yet. The ✗ reasons above say what's in the way.")
        }
    }
}

pub fn port(p: &PortOut, show_next: bool) {
    ui::ok(format!(
        "recorded {} real call{} to {} (of {} made){}",
        thousands(p.recorded as u64),
        if p.recorded == 1 { "" } else { "s" },
        bold(&p.id),
        thousands(p.calls_seen),
        if p.skipped > 0 { format!(", skipped {} with non-plain data", p.skipped) } else { String::new() }
    ));
    ui::ok(format!("Rust crate ready: {}", p.crate_dir.display()));
    if show_next {
        let file = p.lib_rs.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default();
        ui::line(format!(
            "  Have your coding agent follow {} and write {}, then:",
            bold("TASK.md"),
            bold(format!("src/{file}"))
        ));
        next(&format!("fast-anything verify {}", p.id));
    }
}

pub fn verify(id: &str, v: &Verify) {
    if let Some(log) = &v.build_log {
        ui::error(format!("{} doesn't compile yet:", bold(id)));
        for line in log.lines().take(25) {
            ui::line(format!("    {}", dim(line)));
        }
        return;
    }
    if v.ok() {
        if v.derived > 0 {
            ui::ok(format!(
                "{}/{} calls give the same result {}",
                v.passed,
                v.total,
                dim(if v.edges > 0 {
                    format!(
                        "({} recorded + {} edge cases + {} derived)",
                        v.total - v.derived,
                        v.edges,
                        v.derived - v.edges
                    )
                } else {
                    format!("({} recorded + {} derived)", v.total - v.derived, v.derived)
                })
            ));
        } else {
            ui::ok(format!("{}/{} recorded calls give the same result", v.passed, v.total));
        }
        if let Some(m) = v.micro {
            ui::ok(format!(
                "{} per call: {} in {}, {} in Rust: {}",
                bold(id),
                nanos(m.original_ns),
                v.lang.label(),
                nanos(m.rust_ns),
                if v.slower() {
                    red(bold(format!("{} slower", times(1.0 / m.speedup))))
                } else {
                    rust(bold(format!("{} faster", times(m.speedup))))
                }
            ));
            if v.slower() {
                ui::warn(crate::pipeline::slower_hint());
            }
        }
        return;
    }
    ui::error(format!("{}/{} calls don't match", v.failed, v.total));
    for f in v.failures.iter().take(5) {
        ui::line(format!("    {}", f.call));
        ui::line(format!("      expected {}", green(&f.expected)));
        ui::line(format!("      got      {}", red(&f.got)));
    }
}

pub fn bench(b: &BenchResult) {
    let cmd = b.command.join(" ");
    ui::line("");
    ui::line(format!("  {}  {} {}", pad(b.lang.label(), 11), dim(bar(1.0, 24)), secs(b.before.median)));
    ui::line(format!(
        "  {}  {} {}",
        pad("Rust", 11),
        rust(bar(b.after.median / b.before.median.max(1e-12), 24)),
        secs(b.after.median)
    ));
    ui::line("");
    ui::ok(format!(
        "{} is {} end to end {}",
        bold(cmd),
        rust(bold(format!("{} faster", times(b.speedup)))),
        dim(format!("(median of {}, ±{})", b.runs, secs(b.after.stddev.max(b.before.stddev))))
    ));
    if let Some(diff) = &b.output_diff {
        ui::warn(format!(
            "the app printed something else with the Rust ports ({diff}). Fine if its output varies from run to run; otherwise a port behaves differently from the original"
        ));
    }
}

pub fn report(r: &ReportOut) {
    ui::ok(format!("report: {}", r.markdown.display()));
    ui::ok(format!("share card: {}", r.svg.display()));
}

pub fn status(ctx: &Ctx) {
    let s = &ctx.state;
    if s.command.is_empty() {
        ui::line("  No scan yet.");
        next("fast-anything scan -- python your_app.py");
        return;
    }
    ui::line(format!("  app: {}   profiled run: {}", bold(s.command.join(" ")), secs(s.wall)));
    if s.ports.is_empty() {
        ui::line("  Nothing ported yet.");
        if let Some(h) = s.hotspots.iter().find(|h| h.worth_it()) {
            next(&format!("fast-anything port {}", h.id));
        }
        return;
    }
    ui::line("");
    for p in s.ports.values() {
        let (label, paint): (&str, fn(String) -> String) = match (&p.verify, p.enabled) {
            (_, true) => ("● on (Rust)", |s| green(s)),
            (Some(v), false) if v.ok() => ("○ verified, off", |s| yellow(s)),
            (Some(v), false) if !v.built => ("✗ doesn't compile", |s| red(s)),
            (Some(_), false) => ("✗ mismatches", |s| red(s)),
            (None, false) => ("○ waiting for the Rust", |s| dim(s)),
        };
        let state = paint(pad(label, 26));
        let speed = p
            .verify
            .as_ref()
            .and_then(|v| v.micro)
            .map(|m| format!("{} per call", times(m.speedup)))
            .unwrap_or_default();
        ui::line(format!("  {}  {}  {}", pad(&p.id, 32), state, dim(speed)));
        if ctx.stale(p) {
            ui::line(format!("  {}  {}", pad("", 32), red(format!("! {} changed since it was recorded", p.file))));
        }
    }
    if let Some(b) = &s.bench {
        ui::line("");
        ui::line(format!(
            "  last bench: {} → {} ({})",
            secs(b.before.median),
            secs(b.after.median),
            rust(bold(times(b.speedup)))
        ));
    }
}
