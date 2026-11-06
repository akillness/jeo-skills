#!/usr/bin/env python3
"""Activate the jeo workflow stack for one project so queries alone drive it.

Run once after the skills are installed (and again to refresh). Every step is
idempotent, bounded by a timeout, reports ok / pending / skipped / failed, and
never overwrites foreign content: rules live in marker blocks, an existing
second-brain vault that this adapter does not own is an error, and no existing
skill, vault or settings file is removed.

Steps (in order): mex, zvec, second-brain, open-ontologies, openspace,
rtk-semble, jev, refresh, rules, harness2.

Opt-outs: --no-activate (rules + harness2 manifest only), --skip STEP,
JEO_SKILLS_APPROVE_KNOWLEDGE_HOOKS=false / JEO_SKILLS_APPROVE_KNOWLEDGE_DATA=false
(veto second-brain), JEO_SKILLS_APPROVE_OPENSPACE=false,
JEO_SKILLS_APPROVE_SKILL_ROUTING_HOOKS=false and
JEO_SKILLS_APPROVE_ALL_HOOKS_MCP=false (veto the matching hook/MCP writes).

Rules are written as always-applied harness rules: YAML frontmatter with
``alwaysApply: true`` above the marker block, because jeopi skips a rule file
that has neither ``alwaysApply`` nor a description. ``--verify`` re-checks the
written rules and pointers read-only and exits 1 when one would not be applied.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

START = "<!-- JEO-WORKFLOWS:START -->"
END = "<!-- JEO-WORKFLOWS:END -->"
HOOK_START = "# JEO-WORKFLOWS:START zvec refresh"
HOOK_END = "# JEO-WORKFLOWS:END"
RULE_NAME = "jeo-workflows.md"
STEPS = ("mex", "zvec", "second-brain", "open-ontologies", "openspace",
         "rtk-semble", "jev", "refresh", "rules", "harness2")
ALWAYS_STEPS = ("jev", "rules", "harness2")
ZVEC_EMBEDDING = "local/potion-code-16m-v2"
HOST_CLIS = ("jeopi", "omp", "jeo", "codex", "claude", "pi", "gjc")
BRAIN_TOOLS = ("crontab", "graphify", "mex-agent", "zg")
BRAIN_DEFAULTS = {
    "version": 1, "host": "auto", "model": "auto",
    "max_run_usd": 0.5, "daily_budget_usd": 5.0,
    "timeout_seconds": 300, "max_input_bytes": 262144,
    "consent": {"data": True, "model": True, "hooks": True,
                "schedule": True, "postcompact": True, "download": True},
    "integrations": {"ctx": True, "graphify": True, "mex": True, "zvec": True},
    "schedules": {"scan": "* * * * *", "morning": "0 8 * * *",
                  "nightly": "0 22 * * *", "weekly": "0 18 * * 5",
                  "health": "0 21 * * 0"},
}

RULE_TEMPLATE = """\
# Workflow Rules (openspace → rtk → semble → jev, then project memory)

Applies automatically to every prompt in every project. The user never has to
name these tools or run setup. Written and refreshed by `scripts/setup-workspace.py`;
re-running the installer updates this block in place.

## Per-prompt order

Run in this order. If a tool is missing, say so in one line and continue.

1. **openspace** — skill routing. If the host hook already appended an OpenSpace
   route note, load the named skill's `SKILL.md` before acting. Otherwise, for any
   task that could match an installed skill, run
   `~/.agents/venvs/openspace/bin/python ~/.agents/skills/openspace/scripts/route_prompt.py --explain "<prompt>"`
   (the system `python3` lacks the `openspace` module) and load the top match.
2. **rtk** — every shell command goes through the rtk hook; where the hook is not
   active, prefix the command with `rtk`.
3. **semble** — discovery before reading: `semble search "<query>" <path>`, then
   `semble find-related <file> <line> <path>`. No grep-and-read of whole files.
4. **jev** — only after steps 2 and 3 both ran for this prompt, and only when a Jev
   profile is enabled (`node ~/.agents/jev/jev-harness.mjs --profile "$JEV_PROFILE" status`).
   Then `route-skills --top-k 3 "<task>"` (advisory) and, before a risky action,
   `review`. Never run jev before rtk and semble; skip silently when no profile is
   enabled. Details: `jev-control-plane.md`.
5. **Route by query type** (below).

## Route by query type

- **Knowledge, past decisions, notes** → second-brain vault `{vault}`. Read its
  index and `wiki/` pages first; file durable findings under `wiki/`. `raw/**` is
  immutable. If the vault is not initialised, say "second-brain pending" and fall
  back to normal search.
- **Code structure, callers, impact, project conventions** → mex. Read
  `.mex/ROUTER.md` first when it exists (an empty `.mex/` means mex has not run:
  say so and use semble), then `mex-agent graph query ...` and
  `mex-agent impact <symbol|file>` before editing. Use `mex-agent`, never bare
  `mex` (TeX Live ships a `mex`).
- **Meaning-based search when the exact name is unknown** → `zg query "<q>" --limit 8`,
  then confirm with `rg` or a file read. Exact identifiers go to `rg`, not `zg`.
  If `zg status --check-ready` fails, run `zg index` (incremental), then query.
- **RDF / OWL / SHACL / ontology work** → the `open-ontologies` skill, via its CLI
  `batch -` mode. Start no network listener and register no MCP server on your own.
- **Improving this agent harness (rules, prompts, skills, hooks)** → harness2 method
  mode. `.harness2/workspace.json` maps the eight harness components to real files.

## Staying current

- After meaningful work: `mex-agent log "<note>"`, `mex-agent check`, `zg index`.
- Git post-commit hooks (`mex-agent watch` and the `zg index` block) and the
  second-brain cron schedules refresh memory without a command from the user.
- Re-running the installer refreshes rules, `.mex/`, the zvec index and the
  `.harness2/` manifest.
"""

POINTER_TEMPLATE = """\
## Workflow rules
Every prompt: openspace route → rtk shell → semble search → jev (only after rtk and
semble, if a profile is enabled) → then by query: knowledge → second-brain vault,
code/memory → `.mex/`, semantic search → `zg query`, ontology → open-ontologies,
harness changes → `.harness2/`. Full rules: `.agents/rules/{rule}` (global copy
`~/.agents/rules/{rule}`).
"""


class Ctx:
    def __init__(self, args: argparse.Namespace) -> None:
        self.home = Path(args.home).expanduser().resolve()
        self.project = Path(args.project).expanduser().resolve()
        self.skills_root = Path(args.skills_root).expanduser().resolve() if args.skills_root \
            else Path(os.environ.get("SKILLS_ROOT") or self.home / ".agents/skills")
        self.dry = args.dry_run
        self.env = dict(os.environ, HOME=str(self.home))
        extra = [self.home / d for d in (".local/bin", ".cargo/bin", ".bun/bin")]
        self.env["PATH"] = os.pathsep.join([str(p) for p in extra] + [self.env.get("PATH", "")])
        self.vault = Path(args.vault).expanduser() if args.vault else self.home / "vaults/jeo-second-brain"
        self.inbox = Path(args.inbox).expanduser() if args.inbox else self.home / "vaults/jeo-second-brain-inbox"
        self.results: dict[str, dict] = {}

    def veto(self, name: str) -> bool:
        return self.env.get(name, "").strip().lower() == "false"

    def which(self, name: str) -> str | None:
        return shutil.which(name, path=self.env["PATH"])

    def run(self, cmd: list[str], timeout: int, cwd: Path | None = None) -> tuple[int, str]:
        if self.dry:
            return 0, "[dry-run] " + " ".join(cmd)
        try:
            proc = subprocess.run(cmd, cwd=cwd, env=self.env, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return 124, f"timed out after {timeout}s"
        except OSError as exc:
            return 127, str(exc)
        return proc.returncode, (proc.stdout + proc.stderr).strip()

    def skill_script(self, skill: str, script: str) -> Path | None:
        path = self.skills_root / skill / "scripts" / script
        return path if path.is_file() else None


def result(status: str, detail: str) -> dict:
    return {"status": status, "detail": detail}


def tail(text: str, lines: int = 4) -> str:
    return " | ".join(text.strip().splitlines()[-lines:])


def atomic_write(path: Path, text: str, mode: int | None = None) -> None:
    target = path.resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=".jeo-wf-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        if mode is not None:
            os.chmod(tmp, mode)
        elif target.exists():
            os.chmod(tmp, target.stat().st_mode & 0o7777)
        os.replace(tmp, target)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def merge_block(existing: str | None, body: str, start: str, end: str, where: str) -> tuple[str, str]:
    """Return (new_text, status) after inserting or replacing one marker block."""
    block = f"{start}\n{body.rstrip()}\n{end}\n"
    if existing is None:
        return block, "created"
    if start in existing:
        head, _, rest = existing.partition(start)
        if end not in rest:
            raise ValueError(f"{where}: start marker without end marker; refusing to edit")
        tail_text = rest.partition(end)[2].lstrip("\n")
        new = head + block + (("\n" + tail_text) if tail_text else "")
        return new, "unchanged" if new == existing else "updated"
    return existing.rstrip("\n") + "\n\n" + block, "updated"


def upsert_block(ctx: Ctx, path: Path, body: str, start: str = START, end: str = END,
                 comment: bool = False) -> str:
    """Insert or replace one marker block; text outside the markers is never touched."""
    real = path.resolve()
    existing = real.read_text(encoding="utf-8") if real.is_file() else None
    new, status = merge_block(existing, body, start, end, str(path))
    if status != "unchanged" and not ctx.dry:
        atomic_write(path, new)
    return status


RULE_DESCRIPTION = "Per-prompt workflow order - openspace, rtk, semble, jev, then project memory"


def frontmatter_key(line: str) -> str | None:
    """Top-level YAML key of one frontmatter line (None for nested or non-key lines)."""
    if not line or line.startswith((" ", "\t", "#", "-")) or ":" not in line:
        return None
    return line.split(":", 1)[0].strip()


def split_frontmatter(text: str) -> tuple[list[str] | None, str]:
    """Split a leading ``---`` YAML block off ``text``; (None, text) when there is none."""
    lines = text.split("\n")
    if lines and lines[0].rstrip() == "---":
        for i in range(1, len(lines)):
            if lines[i].rstrip() == "---":
                return lines[1:i], "\n".join(lines[i + 1:])
    return None, text


def with_always_apply(fm: list[str] | None) -> list[str]:
    """Force ``alwaysApply: true`` and keep every other key, so the harness injects the rule."""
    out: list[str] = []
    seen = False
    for line in fm or []:
        if frontmatter_key(line) == "alwaysApply":
            if not seen:
                out.append("alwaysApply: true")
            seen = True
        else:
            out.append(line)
    if not seen:
        out.append("alwaysApply: true")
    if not any(frontmatter_key(line) == "description" for line in out):
        out.insert(0, f"description: {RULE_DESCRIPTION}")
    return out


def upsert_rule_file(ctx: Ctx, path: Path, body: str) -> str:
    """Write the rule as an always-applied harness rule: frontmatter first, marker block below."""
    real = path.resolve()
    existing = real.read_text(encoding="utf-8") if real.is_file() else None
    fm, rest = split_frontmatter(existing) if existing is not None else (None, "")
    new_body, status = merge_block(None if existing is None else rest.lstrip("\n"),
                                   body, START, END, str(path))
    new = "---\n" + "\n".join(with_always_apply(fm)) + "\n---\n" + new_body
    if existing is not None:
        status = "unchanged" if new == existing else "updated"
    if status != "unchanged" and not ctx.dry:
        atomic_write(path, new)
    return status


def rule_text(ctx: Ctx) -> str:
    return RULE_TEMPLATE.replace("{vault}", str(brain_vault(ctx)))


def brain_config_path(ctx: Ctx) -> Path:
    env = ctx.env.get("JEO_SECOND_BRAIN_CONFIG")
    return Path(env) if env else ctx.home / ".jeo/second-brain-config.json"


def brain_vault(ctx: Ctx) -> Path:
    try:
        data = json.loads(brain_config_path(ctx).read_text(encoding="utf-8"))
        if isinstance(data.get("vault"), str) and os.path.isabs(data["vault"]):
            return Path(data["vault"])
    except (OSError, ValueError):
        pass
    return ctx.vault


def step_mex(ctx: Ctx) -> dict:
    installer = ctx.skill_script("mex", "install.sh")
    if not installer:
        return result("pending", "mex skill not installed under the skills root")
    code, out = ctx.run(["bash", str(installer), str(ctx.project), "--skip-skill"], 900)
    if code != 0:
        return result("failed", f"mex install.sh exit {code}: {tail(out)}")
    return result("ok", ".mex/ scaffold, code graph and drift check ready")


def step_zvec(ctx: Ctx) -> dict:
    if not ctx.which("zg"):
        return result("pending", "zg not installed (npm install -g @zvec/zvec-grep@0.2.2)")
    cmd = ["zg", "index"]
    if not (ctx.project / ".zvec-grep").exists():
        cmd += ["--embedding", ZVEC_EMBEDDING]
    code, out = ctx.run(cmd, 1800, ctx.project)
    if code != 0:
        return result("failed", f"zg index exit {code}: {tail(out)}")
    code, out = ctx.run(["zg", "status", "--check-ready"], 120, ctx.project)
    if code != 0:
        return result("failed", f"zg index finished but not ready: {tail(out)}")
    return result("ok", "workspace index ready (incremental on re-run)")


def step_second_brain(ctx: Ctx) -> dict:
    if ctx.veto("JEO_SKILLS_APPROVE_KNOWLEDGE_HOOKS") or ctx.veto("JEO_SKILLS_APPROVE_KNOWLEDGE_DATA"):
        return result("skipped", "vetoed by JEO_SKILLS_APPROVE_KNOWLEDGE_HOOKS/DATA=false")
    setup = ctx.skill_script("obsidian-second-brain", "setup.py")
    if not setup:
        return result("pending", "obsidian-second-brain skill not installed under the skills root")
    missing = [t for t in BRAIN_TOOLS if not ctx.which(t)]
    if not any(ctx.which(h) for h in HOST_CLIS):
        missing.append("a host CLI (" + "/".join(HOST_CLIS) + ")")
    if missing:
        return result("pending", "missing prerequisites: " + ", ".join(missing))
    config = brain_config_path(ctx)
    if not config.exists():
        data = dict(BRAIN_DEFAULTS, vault=str(ctx.vault), inbox=str(ctx.inbox))
        if not ctx.dry:
            config.parent.mkdir(parents=True, exist_ok=True)
            ctx.vault.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(config, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(data, handle, indent=2)
                handle.write("\n")
    cmd = [sys.executable, str(setup), "--config", str(config)]
    if ctx.env.get("JEO_SECOND_BRAIN_SOURCE"):
        cmd += ["--source", ctx.env["JEO_SECOND_BRAIN_SOURCE"]]
    code, out = ctx.run(cmd, 900)
    if code != 0:
        return result("failed", f"second-brain setup exit {code}: {tail(out)}")
    return result("ok", f"vault {brain_vault(ctx)} (budget ${BRAIN_DEFAULTS['max_run_usd']}/run, "
                        f"${BRAIN_DEFAULTS['daily_budget_usd']}/day)")


def step_ontologies(ctx: Ctx) -> dict:
    smoke = ctx.skill_script("open-ontologies", "smoke.py")
    binary = ctx.which("open-ontologies")
    if not binary:
        installer = ctx.skill_script("open-ontologies", "install.sh")
        if not installer:
            return result("pending", "open-ontologies skill not installed under the skills root")
        if not ctx.which("cargo"):
            return result("pending", "Rust toolchain (cargo) missing; needed to build open-ontologies")
        code, out = ctx.run(["bash", str(installer)], 3600)
        if code != 0:
            return result("failed", f"open-ontologies install.sh exit {code}: {tail(out)}")
        binary = ctx.which("open-ontologies")
        if not binary and not ctx.dry:
            return result("failed", "install.sh finished but open-ontologies is not on PATH")
        return result("ok", f"built and smoke-tested {binary or 'binary'}")
    if not smoke:
        return result("ok", f"binary {binary} present (smoke helper unavailable)")
    code, out = ctx.run([sys.executable, str(smoke), "--binary", binary, "--json"], 300)
    if code != 0:
        return result("failed", f"smoke test exit {code}: {tail(out)}")
    return result("ok", f"binary {binary} passes the offline smoke test")


def step_openspace(ctx: Ctx) -> dict:
    notes = []
    if ctx.veto("JEO_SKILLS_APPROVE_OPENSPACE"):
        notes.append("install vetoed")
    else:
        installer = ctx.skill_script("openspace", "install-openspace.sh")
        if not installer:
            return result("pending", "openspace skill not installed under the skills root")
        if (ctx.home / ".agents/venvs/openspace/bin/openspace-mcp").exists():
            notes.append("runtime already installed")
        else:
            code, out = ctx.run(["bash", str(installer)], 900)
            if code != 0:
                return result("failed", f"install-openspace.sh exit {code}: {tail(out)}")
            notes.append("runtime installed")
    if ctx.veto("JEO_SKILLS_APPROVE_SKILL_ROUTING_HOOKS") or ctx.veto("JEO_SKILLS_APPROVE_ALL_HOOKS_MCP"):
        notes.append("routing hooks vetoed")
        return result("skipped", ", ".join(notes))
    hooks = ctx.skill_script("openspace", "route-hooks.py")
    if not hooks:
        return result("pending", ", ".join(notes + ["route-hooks.py missing"]))
    code, out = ctx.run([sys.executable, str(hooks), "install"], 120)
    if code != 0:
        return result("failed", f"route-hooks.py install exit {code}: {tail(out)}")
    notes.append("prompt-time routing hooks installed")
    return result("ok", ", ".join(notes))


def step_rtk_semble(ctx: Ctx) -> dict:
    missing = [t for t in ("rtk", "semble") if not ctx.which(t)]
    if missing:
        return result("pending", "not installed: " + ", ".join(missing) + " (run the full-tools helper)")
    if ctx.veto("JEO_SKILLS_APPROVE_ALL_HOOKS_MCP"):
        return result("skipped", "rtk hook registration vetoed; semble CLI present")
    if not (ctx.which("claude") or (ctx.home / ".claude").is_dir()):
        return result("ok", "rtk and semble present; no Claude Code settings to patch")
    code, out = ctx.run(["rtk", "init", "-g", "--auto-patch"], 120)
    if code != 0:
        return result("failed", f"rtk init exit {code}: {tail(out)}")
    return result("ok", "rtk hook registered (idempotent); semble CLI present")


def step_jev(ctx: Ctx) -> dict:
    agents = ctx.home / ".agents/jev/agents.json"
    if not agents.is_file():
        return result("skipped", "Jev not installed; the jev step stays inert (rules order unchanged)")
    try:
        profiles = json.loads(agents.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return result("failed", f"unreadable {agents}: {exc}")
    return result("ok", f"{len(profiles)} host profile(s) bound; runs after rtk and semble when enabled")


def step_refresh(ctx: Ctx) -> dict:
    git_dir = ctx.project / ".git"
    if not git_dir.is_dir():
        return result("skipped", "not a git repository; schedules and installer re-run still refresh")
    notes = []
    if (ctx.project / ".mex").is_dir() and ctx.which("mex-agent"):
        code, out = ctx.run(["mex-agent", "watch"], 60, ctx.project)
        if code != 0:
            return result("failed", f"mex-agent watch exit {code}: {tail(out)}")
        notes.append("mex post-commit hook")
    if ctx.which("zg"):
        hook = git_dir / "hooks/post-commit"
        existing = hook.read_text(encoding="utf-8") if hook.is_file() else ""
        first = existing.splitlines()[0] if existing else "#!/bin/sh"
        if first.startswith("#!") and not any(s in first for s in ("sh", "bash")):
            notes.append("zg hook skipped (post-commit is not a shell script)")
        else:
            block = ("(command -v zg >/dev/null 2>&1 && [ -d .zvec-grep ] "
                     "&& zg index >/dev/null 2>&1 &)")
            if HOOK_START in existing:
                head, _, rest = existing.partition(HOOK_START)
                body = rest.partition(HOOK_END)[2].lstrip("\n")
                new = head + f"{HOOK_START}\n{block}\n{HOOK_END}\n" + body
            elif existing:
                lines = existing.splitlines(keepends=True)
                new = (lines[0] if first.startswith("#!") else "#!/bin/sh\n") \
                    + f"{HOOK_START}\n{block}\n{HOOK_END}\n" \
                    + "".join(lines[1:] if first.startswith("#!") else lines)
            else:
                new = f"#!/bin/sh\n{HOOK_START}\n{block}\n{HOOK_END}\n"
            if new != existing and not ctx.dry:
                atomic_write(hook, new, 0o755)
            notes.append("zg post-commit refresh")
    return result("ok", ", ".join(notes) if notes else "nothing to hook (mex/zg absent)")


def step_rules(ctx: Ctx) -> dict:
    text = rule_text(ctx)
    pointer = POINTER_TEMPLATE.replace("{rule}", RULE_NAME)
    changed = []
    for path in (ctx.home / ".agents/rules" / RULE_NAME, ctx.project / ".agents/rules" / RULE_NAME):
        changed.append(f"{path}: {upsert_rule_file(ctx, path, text)}")
    anchors = [ctx.project / n for n in ("AGENTS.md", "CLAUDE.md") if (ctx.project / n).is_file()]
    for anchor in anchors or [ctx.project / "AGENTS.md"]:
        changed.append(f"{anchor.name}: {upsert_block(ctx, anchor, pointer)}")
    # Antigravity CLI (agy) auto-reads global rules from ~/.gemini/GEMINI.md, not ~/.agents/rules.
    gemini_dir = ctx.home / ".gemini"
    if gemini_dir.is_dir() or ctx.which("agy"):
        changed.append(f"agy ~/.gemini/GEMINI.md: {upsert_block(ctx, gemini_dir / 'GEMINI.md', pointer)}")
    return result("ok", "; ".join(changed))


COMPONENTS = {
    "c1_system_prompt": ("AGENTS.md", "CLAUDE.md"),
    "c2_guardrails": (".agents/rules",),
    "c3_memory": (".mex",),
    "c4_tool_guidance": (".agents/rules/" + RULE_NAME,),
    "c5_subagents": (".claude/agents",),
    "c6_skills": (".agents/skills", ".claude/skills"),
    "c7_scripts": ("scripts",),
    "c8_plugins_hooks": (".claude/settings.json", ".git/hooks/post-commit"),
}


def step_harness2(ctx: Ctx) -> dict:
    preflight = ctx.skill_script("harness2", "preflight.py")
    pre = "unavailable"
    if preflight:
        code, out = ctx.run([sys.executable, str(preflight), "--bench", "method", "--json"], 60)
        pre = "ok" if code == 0 else f"exit {code}"
    manifest = {
        "version": 1, "mode": "method", "project": str(ctx.project),
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "preflight_method": pre,
        "components": {k: [p for p in paths if (ctx.project / p).exists()] for k, paths in COMPONENTS.items()},
        "workflow_status": {k: v["status"] for k, v in ctx.results.items()},
        "benchmarks": "on demand: need Vertex credentials, Docker and explicit approval",
    }
    path = ctx.project / ".harness2/workspace.json"
    text = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    if not ctx.dry:
        atomic_write(path, text)
    return result("ok", f"{path} (method-mode component map, preflight {pre})")


# Hosts whose rule loading was read from the installed harness source, not assumed.
RULE_LOADERS = (
    ("jeopi", "frontmatter rules from .agents/rules (project walk-up and ~/.agents/rules); "
              "injected into the system prompt only when alwaysApply is true"),
    ("jeo", "raw guidance files from .agents/rules and ~/.agents/rules (frontmatter shown as text)"),
    ("other hosts", "the pointer block in the project's AGENTS.md / CLAUDE.md (not exercised here)"),
)


def check_rule_file(path: Path, expected: str, label: str) -> dict:
    """Read-only: would a harness that honours frontmatter inject this rule file?"""
    entry = {"target": label, "path": str(path)}
    if not path.is_file():
        return {**entry, "state": "missing", "detail": "run setup-workspace.py to create it"}
    fm, rest = split_frontmatter(path.resolve().read_text(encoding="utf-8"))
    keys = {frontmatter_key(line): line.split(":", 1)[1].strip() for line in fm or [] if frontmatter_key(line)}
    if fm is None or keys.get("alwaysApply", "").lower() != "true":
        return {**entry, "state": "inert",
                "detail": "no `alwaysApply: true` frontmatter; jeopi skips it. Re-run setup-workspace.py"}
    if START not in rest or END not in rest:
        return {**entry, "state": "inert", "detail": "marker block missing; re-run setup-workspace.py"}
    if rest.partition(START)[2].partition(END)[0].strip() != expected.strip():
        return {**entry, "state": "stale", "detail": "rule text differs from this installer's; re-run to refresh"}
    return {**entry, "state": "ok", "detail": "alwaysApply true, marker block current"}


def check_pointer(project: Path) -> dict:
    entry = {"target": "project pointer", "path": str(project)}
    for name in ("AGENTS.md", "CLAUDE.md"):
        path = project / name
        if path.is_file() and START in path.resolve().read_text(encoding="utf-8"):
            return {**entry, "path": str(path), "state": "ok", "detail": f"{name} carries the workflow pointer"}
    return {**entry, "state": "missing", "detail": "no AGENTS.md / CLAUDE.md pointer block; run setup-workspace.py"}


def run_verify(ctx: Ctx, as_json: bool) -> int:
    expected = rule_text(ctx)
    checks = [
        check_rule_file(ctx.home / ".agents/rules" / RULE_NAME, expected, "global rule"),
        check_rule_file(ctx.project / ".agents/rules" / RULE_NAME, expected, "project rule"),
        check_pointer(ctx.project),
    ]
    bad = [c for c in checks if c["state"] != "ok"]
    if as_json:
        print(json.dumps({"project": str(ctx.project), "checks": checks,
                          "loaders": dict(RULE_LOADERS), "ok": not bad}, indent=2))
    else:
        for c in checks:
            print(f"{c['target']:16} {c['state']:8} {c['path']} - {c['detail']}")
        for host, how in RULE_LOADERS:
            print(f"loader {host:12} {how}")
    return 1 if bad else 0


STEP_FUNCS = {
    "mex": step_mex, "zvec": step_zvec, "second-brain": step_second_brain,
    "open-ontologies": step_ontologies, "openspace": step_openspace,
    "rtk-semble": step_rtk_semble, "jev": step_jev, "refresh": step_refresh,
    "rules": step_rules, "harness2": step_harness2,
}


def parse(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--project", default=os.getcwd(), help="project directory (default: cwd)")
    p.add_argument("--home", default=str(Path.home()))
    p.add_argument("--skills-root", help="installed skills root (default: $SKILLS_ROOT or ~/.agents/skills)")
    p.add_argument("--vault", help="new second-brain vault (default: ~/vaults/jeo-second-brain)")
    p.add_argument("--inbox", help="second-brain inbox (default: ~/vaults/jeo-second-brain-inbox)")
    p.add_argument("--skip", action="append", choices=STEPS, default=[], help="skip a step (repeatable)")
    p.add_argument("--no-activate", action="store_true",
                   help="write only the rules and the .harness2 manifest; run no tool")
    p.add_argument("--dry-run", action="store_true", help="report the plan; run and write nothing")
    p.add_argument("--json", action="store_true", help="machine-readable report")
    p.add_argument("--verify", action="store_true",
                   help="read-only: check the written rules would be applied; exit 1 if not")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse(sys.argv[1:] if argv is None else argv)
    ctx = Ctx(args)
    if not ctx.project.is_dir():
        print(f"error: project is not a directory: {ctx.project}", file=sys.stderr)
        return 2
    if ctx.project in (ctx.home, Path(ctx.project.anchor)):
        print("error: refusing to activate the home directory or filesystem root as a workspace", file=sys.stderr)
        return 2
    if args.verify:
        return run_verify(ctx, args.json)
    for name in STEPS:
        if name in args.skip:
            ctx.results[name] = result("skipped", "--skip")
        elif args.no_activate and name not in ALWAYS_STEPS:
            ctx.results[name] = result("skipped", "--no-activate")
        else:
            try:
                ctx.results[name] = STEP_FUNCS[name](ctx)
            except Exception as exc:  # one step must never abort the rest
                ctx.results[name] = result("failed", f"{type(exc).__name__}: {exc}")
    if ctx.dry:  # nothing ran: "ok" would claim a verified state
        for res in ctx.results.values():
            if res["status"] == "ok":
                res["status"] = "planned"
    failed = [k for k, v in ctx.results.items() if v["status"] == "failed"]
    if args.json:
        print(json.dumps({"project": str(ctx.project), "dry_run": ctx.dry, "steps": ctx.results,
                          "failed": failed}, indent=2))
    else:
        for name, res in ctx.results.items():
            print(f"{name:16} {res['status']:8} {res['detail']}")
        pending = [k for k, v in ctx.results.items() if v["status"] == "pending"]
        if pending:
            print("pending (not failures): " + ", ".join(pending), file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
