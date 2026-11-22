//! A report worth sharing: markdown for the PR, an SVG card for the README / socials.

use crate::bench::BenchResult;
use crate::state::{Ctx, Port};
use crate::util::{nanos, secs, times};
use anyhow::{Context, Result};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct ReportOut {
    pub markdown: PathBuf,
    pub svg: PathBuf,
    pub text: String,
}

fn xml(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn port_line(p: &Port) -> String {
    let v = p.verify.clone().unwrap_or_default();
    match v.micro {
        Some(m) => format!("{} → Rust · {} per call · {}/{} calls verified", p.id, times(m.speedup), v.passed, v.total),
        None => format!("{} → Rust · {}/{} calls verified", p.id, v.passed, v.total),
    }
}

pub fn svg(project: &str, b: &BenchResult, ports: &[&Port]) -> String {
    let headline = times(b.speedup);
    let after_w = (300.0 * b.after.median / b.before.median.max(1e-12)).clamp(4.0, 300.0);
    let detail = ports.iter().take(2).map(|p| port_line(p)).collect::<Vec<_>>().join("   ");
    let sans = "system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif";
    let mono = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="760" height="220" viewBox="0 0 760 220" role="img" aria-label="{project}: {headline} faster">
  <rect width="760" height="220" rx="16" fill="#0d1117"/>
  <rect x="0.5" y="0.5" width="759" height="219" rx="15.5" fill="none" stroke="#30363d"/>
  <text x="32" y="44" font-family="{mono}" font-size="14" fill="#f74c00">⚡ fast-anything</text>
  <text x="32" y="78" font-family="{sans}" font-size="20" fill="#e6edf3">{project}</text>
  <text x="32" y="148" font-family="{sans}" font-size="64" font-weight="800" fill="#f74c00">{headline}<tspan dx="12" font-size="28" font-weight="600" fill="#e6edf3">faster</tspan></text>
  <text x="420" y="92" font-family="{sans}" font-size="13" fill="#8b949e">{original}</text>
  <text x="720" y="92" font-family="{mono}" font-size="13" fill="#e6edf3" text-anchor="end">{before}</text>
  <rect x="420" y="100" width="300" height="16" rx="4" fill="#30363d"/>
  <text x="420" y="146" font-family="{sans}" font-size="13" fill="#8b949e">Rust</text>
  <text x="720" y="146" font-family="{mono}" font-size="13" fill="#e6edf3" text-anchor="end">{after}</text>
  <rect x="420" y="154" width="{after_w:.1}" height="16" rx="4" fill="#f74c00"/>
  <text x="32" y="196" font-family="{sans}" font-size="13" fill="#8b949e">{detail}</text>
</svg>
"##,
        project = xml(project),
        original = b.lang.label(),
        before = secs(b.before.median),
        after = secs(b.after.median),
        detail = xml(&detail),
    )
}

pub fn markdown(project: &str, b: &BenchResult, ports: &[&Port]) -> String {
    let mut md = format!(
        "# ⚡ {project}: {} faster\n\n`{}` went from **{}** to **{}** (median of {} runs each, original and Rust interleaved).\n\n![fast-anything report](report.svg)\n\n| function | per call | checked against |\n|---|---|---|\n",
        times(b.speedup),
        b.command.join(" "),
        secs(b.before.median),
        secs(b.after.median),
        b.runs
    );
    for p in ports {
        let v = p.verify.clone().unwrap_or_default();
        let per_call = v
            .micro
            .map(|m| format!("**{}** ({} → {})", times(m.speedup), nanos(m.original_ns), nanos(m.rust_ns)))
            .unwrap_or_else(|| "n/a".into());
        md.push_str(&format!("| `{}` | {per_call} | {}/{} recorded real calls |\n", p.id, v.passed, v.total));
    }
    md.push_str("\nThe original code stays in place: set `FAST_ANYTHING_DISABLE=1` to run it, or `fast-anything disable <id>` to remove the switch.\n\n<sub>Made with [fast-anything](https://github.com/EL4CTEO/fast-anything)</sub>\n");
    md
}

pub fn write(ctx: &Ctx) -> Result<ReportOut> {
    let b = ctx.state.bench.as_ref().context("no benchmark yet: run  fast-anything bench")?;
    let project = ctx.root.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "your app".into());
    let ports: Vec<&Port> = ctx.state.ports.values().filter(|p| p.enabled).collect();
    let text = markdown(&project, b, &ports);
    let (md_path, svg_path) = (ctx.fast.join("report.md"), ctx.fast.join("report.svg"));
    fs::write(&md_path, &text)?;
    fs::write(&svg_path, svg(&project, b, &ports))?;
    Ok(ReportOut { markdown: md_path, svg: svg_path, text })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bench::Stats;

    #[test]
    fn svg_is_escaped_and_scaled() {
        let b = BenchResult {
            before: Stats { median: 4.0, ..Stats::default() },
            after: Stats { median: 0.5, ..Stats::default() },
            speedup: 8.0,
            ..BenchResult::default()
        };
        let card = svg("a<b>&c", &b, &[]);
        assert!(card.contains("a&lt;b&gt;&amp;c"));
        assert!(card.contains("8.0×"));
        assert!(card.contains(r#"width="37.5""#));
    }
}
