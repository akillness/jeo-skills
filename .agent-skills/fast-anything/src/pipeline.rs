//! The steps (scan, port, verify, enable, bench, report) shared by the CLI and the MCP server.

use crate::backend::{self, Lang};
use crate::bench::{self, BenchResult};
use crate::hotspot::{self, Hotspot};
use crate::report::{self, ReportOut};
use crate::state::{Ctx, Port, Verify};
use crate::{agent, show, ui, util};
use anyhow::{Context, Result, bail, ensure};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct ScanOut {
    pub command: Vec<String>,
    pub wall: f64,
    pub hotspots: Vec<Hotspot>,
}

pub fn scan(root: &Path, command: Vec<String>) -> Result<ScanOut> {
    ensure!(
        !command.is_empty(),
        "put the command that runs your app after --, e.g.  fast-anything scan -- python app.py"
    );
    let mut ctx = Ctx::open(root)?;
    let command = match crate::python::unwrap_env_runner(&command, |argv| env_runner_output(&ctx.root, argv))? {
        Some(unwrapped) => {
            ui::step(format!("{} runs {}", ui::bold(command[..2].join(" ")), ui::bold(&unwrapped[0])));
            unwrapped
        }
        None => command,
    };
    let lang = crate::cfamily::refine(Lang::detect(&command[0])?, &command[1..]);
    let exe = lang.resolve(&command[0], &ctx.root)?;
    ui::step(format!("profiling {}", ui::bold(command.join(" "))));
    let profile = lang.profile(&ctx, &exe, &command[1..])?;
    let hotspots = hotspot::rank(profile.functions, profile.wall);
    ctx.state.command = command.clone();
    ctx.state.lang = lang;
    ctx.state.runtime = Some(exe);
    ctx.state.base = profile.base;
    ctx.state.wall = profile.wall;
    ctx.state.hotspots = hotspots.clone();
    ctx.save()?;
    Ok(ScanOut { command, wall: profile.wall, hotspots })
}

/// What an env runner (uv, poetry, ...) prints for a command run in the project.
fn env_runner_output(root: &Path, argv: &[&str]) -> Result<String> {
    let out = util::output(std::process::Command::new(argv[0]).args(&argv[1..]).current_dir(root), argv[0])?;
    ensure!(out.status.success(), "{} failed:\n{}", argv.join(" "), util::tail(&util::combined(&out), 10));
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn pick<'a>(hotspots: &'a [Hotspot], id: Option<&str>) -> Result<&'a Hotspot> {
    let Some(id) = id else {
        return hotspots
            .iter()
            .find(|h| h.worth_it())
            .context("no function worth porting in the last scan (see  fast-anything status  for why)");
    };
    if let Some(h) = hotspots.iter().find(|h| h.id == id) {
        return Ok(h);
    }
    let hits: Vec<&Hotspot> = hotspots.iter().filter(|h| h.name == id || h.qualname == id).collect();
    match hits.as_slice() {
        [one] => Ok(one),
        [] => bail!("{id} wasn't in the last scan; run  fast-anything scan -- ...  again, or check the name"),
        many => bail!("{id} is ambiguous: {}", many.iter().map(|h| h.id.as_str()).collect::<Vec<_>>().join(", ")),
    }
}

#[derive(Serialize)]
pub struct PortOut {
    pub id: String,
    pub crate_dir: PathBuf,
    pub lib_rs: PathBuf,
    pub task_md: PathBuf,
    pub recorded: usize,
    pub calls_seen: u64,
    pub skipped: usize,
    pub task: String,
}

pub fn port(root: &Path, id: Option<&str>, samples: usize) -> Result<PortOut> {
    let mut ctx = Ctx::open(root)?;
    let exe = ctx.runtime()?.to_string();
    let lang = ctx.state.lang;
    let hs = pick(&ctx.state.hotspots, id)?.clone();
    if !hs.portable() {
        bail!("{} can't be ported yet: {}", hs.id, hs.blockers.join("; "));
    }
    let module = hs.module.clone().unwrap_or_default();
    let crate_rel = format!(".fast/ports/{}", hs.id.replace([':', '/', '\\'], "."));
    let dir = ctx.root.join(&crate_rel);
    fs::create_dir_all(&dir)?;

    ui::step(format!("running the app again to record real calls to {}", ui::bold(&hs.id)));
    let app_args = ctx.state.command[1..].to_vec();
    let rec = lang.record(&ctx, &exe, &app_args, &hs, &dir.join("recordings.jsonl"), samples.max(1))?;
    if rec.mutates {
        bail!(
            "{} changes its arguments in place (seen while recording). A Rust port can only return a value, so it would drop those changes. Have the function return the new value instead, then scan again.",
            hs.id
        );
    }
    if rec.kept == 0 {
        let types =
            if rec.unsupported.is_empty() { String::new() } else { format!(" (got: {})", rec.unsupported.join(", ")) };
        bail!(
            "recorded no usable calls to {} out of {}. Arguments and results must be plain data: numbers, strings, bytes, lists, tuples, dicts, sets{types}",
            hs.id,
            rec.calls
        );
    }
    let enabled = ctx.state.ports.get(&hs.id).is_some_and(|p| p.enabled);
    let helpers: Vec<Hotspot> = hs
        .calls
        .iter()
        .filter_map(|name| ctx.state.hotspots.iter().find(|h| h.file == hs.file && &h.name == name))
        .cloned()
        .collect();
    let text = fs::read_to_string(ctx.root.join(&hs.file)).unwrap_or_default();
    let sources: Vec<&str> = std::iter::once(&hs).chain(&helpers).map(|h| h.source.as_str()).collect();
    let port = Port {
        id: hs.id.clone(),
        file: hs.file.clone(),
        module,
        func: hs.name.clone(),
        ext: format!("fa_{}", util::slug(&hs.id)),
        crate_dir: crate_rel,
        recorded: rec.kept,
        calls_seen: rec.calls,
        verify: None,
        enabled,
        lang,
        owner: hs.owner.clone(),
        line: hs.line,
        sources: crate::state::verbatim(&text, &sources),
    };
    let task = lang.scaffold(&ctx, &hs, &helpers, &port)?;
    ctx.state.ports.insert(port.id.clone(), port);
    ctx.save()?;
    Ok(PortOut {
        id: hs.id,
        lib_rs: dir.join("src").join(if lang.c_bridge() { "port.rs" } else { "lib.rs" }),
        task_md: dir.join("TASK.md"),
        crate_dir: dir,
        recorded: rec.kept,
        calls_seen: rec.calls,
        skipped: rec.skipped,
        task,
    })
}

pub fn verify(root: &Path, id: Option<&str>) -> Result<(String, Verify)> {
    let mut ctx = Ctx::open(root)?;
    let id = ctx.resolve_port(id)?;
    let port = ctx.state.ports[&id].clone();
    let source_hash = backend::source_hash(&ctx.crate_dir(&port))?;
    if ctx.stale(&port) {
        ui::warn(format!("{} changed since {id} was recorded: {}", port.file, stale_hint(&id)));
    }
    ui::step(format!("building {} (release)", ui::bold(&port.ext)));
    let v = match backend::build(&ctx, &port)? {
        Err(log) => Verify { built: false, build_log: Some(log), ..Verify::default() },
        Ok(_) => {
            ui::step(format!(
                "replaying {} recorded call{} against the Rust port",
                port.recorded,
                if port.recorded == 1 { "" } else { "s" }
            ));
            port.lang.verify(&ctx, &port)?
        }
    };
    let mut v = v;
    v.lang = port.lang;
    v.source_hash = Some(source_hash);
    if !v.ok() && port.enabled {
        port.lang.disable(&ctx, &port)?;
        if let Some(p) = ctx.state.ports.get_mut(&id) {
            p.enabled = false;
        }
        ui::warn(format!("{id} was enabled; switched it back to {} until it passes again", port.lang.label()));
    }
    if let Some(p) = ctx.state.ports.get_mut(&id) {
        p.verify = Some(v.clone());
    }
    ctx.save()?;
    Ok((id, v))
}

/// Verify every port; an enabled one that fails is switched back, as with a single verify.
pub fn verify_all(root: &Path) -> Result<()> {
    let ids: Vec<String> = Ctx::open(root)?.state.ports.keys().cloned().collect();
    ensure!(!ids.is_empty(), "nothing ported yet: run  fast-anything port");
    let mut failed = vec![];
    for id in &ids {
        let (id, v) = verify(root, Some(id))?;
        show::verify(&id, &v);
        if !v.ok() {
            failed.push(id);
        }
    }
    ensure!(failed.is_empty(), "{} of {} ports don't match: {}", failed.len(), ids.len(), failed.join(", "));
    ui::ok(format!("all {} ports match the original", ids.len()));
    Ok(())
}

/// What to do about a port whose original changed after it was recorded.
pub fn stale_hint(id: &str) -> String {
    format!(
        "its recorded calls and Rust may be out of date. Run  fast-anything port {id}  to record again, update the Rust, then verify (or --force)"
    )
}

/// What to do about a port that's right but slower than the original.
pub fn slower_hint() -> &'static str {
    "calling into Rust costs more than this function's work, so it won't be switched on. Port its caller instead (fewer, bigger calls), or  enable --force"
}

pub fn enable(root: &Path, id: Option<&str>, force: bool) -> Result<String> {
    let mut ctx = Ctx::open(root)?;
    let id = ctx.resolve_port(id)?;
    let port = ctx.state.ports[&id].clone();
    if ctx.stale(&port) && !force {
        bail!("{} changed since {id} was recorded: {}", port.file, stale_hint(&id));
    }
    let verified = port.verify.as_ref().is_some_and(Verify::ok);
    if !verified && !force {
        bail!("{id} hasn't passed verify yet: run  fast-anything verify {id}  (or --force)");
    }
    if let Some(m) = port.verify.as_ref().filter(|v| v.slower() && !force).and_then(|v| v.micro) {
        bail!("{id} is {} slower per call in Rust: {}", util::times(1.0 / m.speedup), slower_hint());
    }
    port.lang.enable(&ctx, &port)?;
    if let Some(p) = ctx.state.ports.get_mut(&id) {
        p.enabled = true;
    }
    ctx.save()?;
    Ok(id)
}

pub fn disable(root: &Path, id: Option<&str>) -> Result<String> {
    let mut ctx = Ctx::open(root)?;
    let id = ctx.resolve_port(id)?;
    let port = &ctx.state.ports[&id];
    port.lang.disable(&ctx, port)?;
    if let Some(p) = ctx.state.ports.get_mut(&id) {
        p.enabled = false;
    }
    ctx.save()?;
    Ok(id)
}

/// Switch every enabled port back to the original code; returns their ids.
pub fn disable_all(root: &Path) -> Result<Vec<String>> {
    let ids: Vec<String> = Ctx::open(root)?.state.ports.values().filter(|p| p.enabled).map(|p| p.id.clone()).collect();
    for id in &ids {
        disable(root, Some(id))?;
    }
    Ok(ids)
}

pub fn build_all(root: &Path) -> Result<()> {
    let ctx = Ctx::open(root)?;
    ensure!(!ctx.state.ports.is_empty(), "nothing ported yet");
    let mut failed = 0;
    for port in ctx.state.ports.values() {
        // An enabled port loads whatever lands in .fast/lib: only rebuild what verify checked.
        let verified = port.verify.as_ref().and_then(|v| v.source_hash.as_deref());
        if port.enabled
            && verified.is_some_and(|h| backend::source_hash(&ctx.crate_dir(port)).ok().as_deref() != Some(h))
        {
            failed += 1;
            ui::error(format!(
                "{} is switched on and its Rust changed since it passed verify; run  fast-anything verify {}",
                port.id, port.id
            ));
            continue;
        }
        ui::step(format!("building {}", ui::bold(&port.id)));
        match backend::build(&ctx, port)? {
            Ok(path) => ui::ok(format!("{}", path.display())),
            Err(log) => {
                failed += 1;
                ui::error(format!("{} doesn't compile:\n{log}", port.id));
            }
        }
    }
    ensure!(failed == 0, "{failed} port(s) didn't build");
    Ok(())
}

pub fn bench(root: &Path, runs: usize) -> Result<BenchResult> {
    let mut ctx = Ctx::open(root)?;
    for p in ctx.state.ports.values().filter(|p| p.enabled && ctx.stale(p)) {
        ui::warn(format!("{} changed since {} was recorded: {}", p.file, p.id, stale_hint(&p.id)));
    }
    let result = bench::run(&ctx, runs.max(1))?;
    ctx.state.bench = Some(result.clone());
    ctx.save()?;
    Ok(result)
}

pub fn report(root: &Path) -> Result<ReportOut> {
    report::write(&Ctx::open(root)?)
}

/// What the agent gets told after a failed attempt, or a right one that's slower than the original.
pub fn feedback(v: &Verify) -> String {
    if v.ok()
        && let Some(m) = v.micro.filter(|_| v.slower())
    {
        return format!(
            "\n\n## Your last attempt is right but slow\n\n\
             All {} cases match, but a call takes {} in Rust against {} in the original ({} slower).\n\
             Make it faster without changing any result: borrow inputs instead of converting them, \
             no allocation or cloning per call, `with_capacity`, fast paths for common cases.\n{}",
            v.total,
            util::nanos(m.rust_ns),
            util::nanos(m.original_ns),
            util::times(1.0 / m.speedup),
            if v.lang.c_bridge() { "\nFix src/port.rs.\n" } else { "\nFix src/lib.rs.\n" }
        );
    }
    let mut out = String::from("\n\n## Your last attempt failed\n\n");
    if let Some(log) = &v.build_log {
        out.push_str("It doesn't compile:\n\n```\n");
        out.push_str(log);
        out.push_str("\n```\n");
    } else {
        out.push_str(&format!("{} of {} recorded calls came out different:\n\n", v.failed, v.total));
        for f in &v.failures {
            out.push_str(&format!("- `{}` should give `{}`, the port gave `{}`\n", f.call, f.expected, f.got));
        }
    }
    out.push_str(if v.lang.c_bridge() { "\nFix src/port.rs.\n" } else { "\nFix src/lib.rs.\n" });
    out
}

pub fn agent_port(root: &Path, id: &str, agent_spec: &str, attempts: usize) -> Result<Verify> {
    let attempts = attempts.max(1);
    let mut last: Option<Verify> = None;
    // A port that's right but slower goes back to the agent to speed up; if no later attempt is both
    // right and faster, its sources are put back.
    let mut right: Option<(Verify, Snapshot)> = None;
    for attempt in 1..=attempts {
        let ctx = Ctx::open(root)?;
        let port = ctx.state.ports.get(id).with_context(|| format!("{id} isn't ported"))?.clone();
        let dir = ctx.crate_dir(&port);
        let mut prompt = fs::read_to_string(dir.join("TASK.md")).context("reading TASK.md")?;
        if let Some(v) = &last {
            prompt.push_str(&feedback(v));
        }
        ui::step(format!("{} is writing the Rust port (attempt {attempt}/{attempts})", ui::bold(agent_spec)));
        agent::run(agent_spec, &dir, &prompt, &dir.join("agent.log"))?;
        let (_, v) = verify(root, Some(id))?;
        show::verify(id, &v);
        if v.ok() && !v.slower() {
            return Ok(v);
        }
        if v.ok() && right.as_ref().is_none_or(|(best, _)| speedup(&v) > speedup(best)) {
            right = Some((v.clone(), snapshot(&dir.join("src"))?));
        }
        last = Some(v);
    }
    if let Some((best, files)) = right
        && last.as_ref().is_none_or(|v| !v.ok() || speedup(v) < speedup(&best))
    {
        ui::step(format!("putting back the right attempt of {id} ({} per call)", util::times(speedup(&best))));
        for (path, bytes) in &files {
            fs::write(path, bytes)?;
        }
        let (_, v) = verify(root, Some(id))?;
        return Ok(v);
    }
    Ok(last.unwrap_or_default())
}

fn speedup(v: &Verify) -> f64 {
    v.micro.map(|m| m.speedup).unwrap_or(0.0)
}

/// Files and their bytes, to put back later.
type Snapshot = Vec<(PathBuf, Vec<u8>)>;

/// Every file under dir.
fn snapshot(dir: &Path) -> Result<Snapshot> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).with_context(|| format!("reading {}", dir.display()))? {
        let path = entry?.path();
        if path.is_dir() {
            out.extend(snapshot(&path)?);
        } else {
            out.push((path.clone(), fs::read(&path)?));
        }
    }
    Ok(out)
}

pub fn go(
    root: &Path,
    command: Vec<String>,
    agent_spec: Option<&str>,
    top: usize,
    attempts: usize,
    runs: usize,
    samples: usize,
) -> Result<()> {
    let scanned = scan(root, command)?;
    show::scan(&scanned);
    let picks: Vec<String> =
        scanned.hotspots.iter().filter(|h| h.worth_it()).take(top.max(1)).map(|h| h.id.clone()).collect();
    ensure!(
        !picks.is_empty(),
        "nothing worth porting: no portable function takes {}% or more of the run",
        hotspot::WORTH_IT * 100.0
    );

    let Some(agent_spec) = agent_spec else {
        for id in &picks {
            show::port(&port(root, Some(id), samples)?, false);
        }
        ui::line("");
        ui::line(format!(
            "  Now write the Rust: hand each TASK.md to your coding agent (or pass {}), then:",
            ui::bold("--agent claude")
        ));
        for id in &picks {
            show::next(&format!("fast-anything verify {id} && fast-anything enable {id}"));
        }
        show::next("fast-anything bench");
        return Ok(());
    };

    let mut enabled = 0;
    for id in &picks {
        show::port(&port(root, Some(id), samples)?, false);
        let v = agent_port(root, id, agent_spec, attempts)?;
        if v.ok() && v.slower() {
            ui::warn(format!("{id}: right, but slower in Rust per call; {}", slower_hint()));
        } else if v.ok() {
            enable(root, Some(id), false)?;
            ui::ok(format!("{} now runs in Rust", ui::bold(id)));
            enabled += 1;
        } else {
            ui::warn(format!(
                "{id}: not right after {attempts} attempts; fix src/lib.rs by hand (see TASK.md), then  fast-anything verify {id}"
            ));
        }
    }
    ensure!(enabled > 0, "no port both passed verification and ran faster");
    show::bench(&bench(root, runs)?);
    show::report(&report(root)?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::Micro;

    #[test]
    fn slow_but_right_gets_asked_for_speed() {
        let v = Verify {
            built: true,
            total: 10,
            passed: 10,
            micro: Some(Micro { original_ns: 1000.0, rust_ns: 4000.0, speedup: 0.25 }),
            ..Verify::default()
        };
        let text = feedback(&v);
        assert!(
            text.contains("right but slow") && text.contains("All 10 cases match") && text.contains("4.0× slower"),
            "{text}"
        );
        let wrong = Verify { failed: 1, ..v };
        assert!(feedback(&wrong).contains("failed"));
    }
}
