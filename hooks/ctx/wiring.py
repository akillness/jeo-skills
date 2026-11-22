"""Read-only wiring audit (`ctx status --check-wiring`).

Returns [(check, ok, detail)]. Never prints or copies ~/.claude/settings.json
or ~/.jeo/config.json wholesale — only the specific keys it asserts on.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import List, Optional, Tuple

from ctx.core import Context, resolve_canonical_vault, resolve_tool_bin, run, version_tuple

Check = Tuple[str, bool, str]

DEAD_HOOKS = ("load_vault_context.py", "obsidian-bg-agent.sh")
MIN_MEX = (0, 8, 3)
_PATH_RE = re.compile(r'(?:"\$HOME"|\$HOME|\$\{HOME\}|~|/(?:Users|home)/[^/\s"\']+)(/[^\s"\'`;&|)]+)')


def _load_json(path: Path) -> Optional[dict]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _hook_commands(settings: dict) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    hooks = settings.get("hooks") or {}
    if not isinstance(hooks, dict):
        return out
    for event, groups in hooks.items():
        if not isinstance(groups, list):
            continue
        for g in groups:
            for hk in (g.get("hooks") or []) if isinstance(g, dict) else []:
                if isinstance(hk, dict) and isinstance(hk.get("command"), str):
                    out.append((event, hk["command"]))
    return out


def _referenced_paths(command: str) -> List[Path]:
    """Script paths a hook command references under $HOME (hooks/, .agents/, vaults/, .local/bin)."""
    home = str(Path.home())
    paths: List[Path] = []
    for m in _PATH_RE.finditer(command):
        rel = m.group(1)
        p = Path(home + rel)
        if any(seg in p.parts for seg in (".claude", ".agents", "vaults", ".local", ".codex", ".jeo")):
            paths.append(p)
    return paths


def _code_lines(path: Path) -> List[str]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return []
    return [ln for ln in text.splitlines() if ln.strip() and not ln.lstrip().startswith("#")]


def audit(ctx: Optional[Context] = None) -> List[Check]:
    checks: List[Check] = []
    home = Path.home()
    repo = ctx.repo if ctx is not None else None
    canonical_vault = resolve_canonical_vault()
    vault = str(ctx.vault if ctx is not None else canonical_vault)

    settings_path = home / ".claude" / "settings.json"
    jeo_config_path = home / ".jeo" / "config.json"
    context_config_path = home / ".agents" / "context-config.json"
    knowledge_pipeline = home / ".claude" / "hooks" / "knowledge-pipeline.sh"
    ingest_prompt = home / ".agents" / "hooks" / "ingest-prompt.py"
    codex_hooks = home / ".codex" / "hooks.json"
    mex_agent = resolve_tool_bin("mex-agent", "CTX_MEX_BIN")

    # ---- ~/.claude/settings.json ------------------------------------------------
    cmds: List[Tuple[str, str]] = []
    if not (home / ".claude").exists():
        checks.append(("claude host", True, "not detected (skipped)"))
    else:
        settings = _load_json(settings_path)
        if settings is None:
            checks.append(("settings.json readable", False, str(settings_path)))
        else:
            cmds = _hook_commands(settings)
            missing = []
            for event, cmd in cmds:
                for p in _referenced_paths(cmd):
                    if p.suffix in (".py", ".sh", ".mjs", ".js") and not p.exists():
                        missing.append("%s -> %s" % (event, p))
            checks.append(("hook script targets exist", not missing, "; ".join(missing) if missing else "%d hook commands checked" % len(cmds)))
            for event in ("SessionStart", "PostCompact"):
                ev_cmds = [c for (e, c) in cmds if e == event]
                bad = [str(p) for c in ev_cmds for p in _referenced_paths(c) if p.suffix in (".py", ".sh") and not p.exists()]
                checks.append(("%s hook targets exist" % event, not bad, "; ".join(bad) if bad else "%d command(s)" % len(ev_cmds)))
            dead = [name for (_, c) in cmds for name in DEAD_HOOKS if name in c and not any(p.exists() for p in _referenced_paths(c) if p.name == name)]
            checks.append(("dead hooks removed (%s)" % ", ".join(DEAD_HOOKS), not dead, "; ".join(sorted(set(dead))) if dead else "none referenced"))
            tc = " ".join(c for (e, c) in cmds if e == "TaskCompleted")
            se = " ".join(c for (e, c) in cmds if e == "SessionEnd")
            tc_ok = bool(re.search(r'ctx["\']?\s+refresh', tc))
            se_ok = bool(re.search(r'ctx["\']?\s+refresh', se)) and "nohup" in se
            checks.append(("TaskCompleted runs `ctx refresh` inline", tc_ok, "present" if tc_ok else "missing"))
            checks.append(("SessionEnd spawns detached `ctx refresh` (nohup)", se_ok, "present" if se_ok else "missing ctx refresh/nohup"))
            env_vault = (settings.get("env") or {}).get("LLM_WIKI_VAULT") if isinstance(settings.get("env"), dict) else None
            env_ok = bool(env_vault) and Path(env_vault).expanduser() == canonical_vault
            checks.append(("env.LLM_WIKI_VAULT == canonical vault", env_ok, "%s" % (env_vault or "unset")))

    # ---- knowledge-pipeline.sh ---------------------------------------------------
    if knowledge_pipeline.exists():
        lines = _code_lines(knowledge_pipeline)
        bad = [ln.strip() for ln in lines if "graphify update" in ln]
        checks.append(("knowledge-pipeline.sh has no per-turn `graphify update`", not bad, bad[0][:120] if bad else "clean"))
    else:
        referenced = any("knowledge-pipeline.sh" in c for (_, c) in cmds)
        checks.append(("knowledge-pipeline.sh", not referenced, "absent and unreferenced" if not referenced else "referenced but missing"))

    # ---- ingest-prompt.py ---------------------------------------------------------
    try:
        text = ingest_prompt.read_text(encoding="utf-8")
    except OSError:
        text = ""
        checks.append(("ingest-prompt.py readable", False, str(ingest_prompt)))
    if text:
        m = re.search(r"IGNORE_DIRS\s*=\s*[\[{(]([^\]})]*)[\]})]", text, re.S)
        has_venv = bool(m and ".venv" in m.group(1))
        checks.append(("ingest-prompt.py IGNORE_DIRS contains .venv", has_venv, (m.group(0)[:100] if m else "IGNORE_DIRS not found")))
        checks.append(("ingest-prompt.py has no '.graphify' write", "'.graphify'" not in text, "no single-quoted '.graphify' literal" if "'.graphify'" not in text else "found '.graphify'"))
        checks.append(("ingest-prompt.py takes the vault lock", "layer_lock" in text, "layer_lock referenced" if "layer_lock" in text else "no layer_lock"))

    # ---- repo-scoped --------------------------------------------------------------
    if repo is not None:
        sync_md = repo / ".mex" / "SYNC.md"
        if sync_md.exists():
            bad = [ln for ln in _code_lines(sync_md) if "sync.sh" in ln]
            checks.append((".mex/SYNC.md has no sync.sh reference", not bad, bad[0].strip()[:100] if bad else "clean"))
        else:
            checks.append((".mex/SYNC.md", True, "absent"))
        post_commit = repo / ".git" / "hooks" / "post-commit"
        if post_commit.exists():
            bad = [ln for ln in _code_lines(post_commit) if "npx mex" in ln]
            checks.append((".git/hooks/post-commit has no `npx mex`", not bad, bad[0].strip()[:100] if bad else "clean"))
        else:
            checks.append((".git/hooks/post-commit", True, "absent"))
        pre_push = repo / ".git" / "hooks" / "pre-push"
        try:
            pp = pre_push.read_text(encoding="utf-8")
        except OSError:
            pp = ""
        ok = "ctx checkpoint" in pp and "git lfs pre-push" in pp
        checks.append((".git/hooks/pre-push chains ctx checkpoint + git lfs", ok, "ok" if ok else ("missing: " + ", ".join(t for t in ("ctx checkpoint", "git lfs pre-push") if t not in pp))))
        mex_gi = repo / ".mex" / ".gitignore"
        try:
            gi = mex_gi.read_text(encoding="utf-8")
        except OSError:
            gi = ""
        checks.append((".mex/.gitignore ignores graph.db*", "graph.db*" in gi, "ok" if "graph.db*" in gi else "missing"))

    # ---- context-config.json / ~/.jeo/config.json --------------------------------
    ctx_cfg = _load_json(context_config_path)
    jeo = _load_json(jeo_config_path)
    if ctx_cfg and isinstance(ctx_cfg.get("wikiVault"), str):
        wv = Path(ctx_cfg["wikiVault"]).expanduser()
        checks.append(("context-config.json wikiVault matches canonical vault", wv == canonical_vault, str(wv)))
    elif jeo is not None:
        wr = jeo.get("wikiRoot")
        ok = isinstance(wr, str) and Path(wr).is_absolute() and Path(wr) == canonical_vault
        checks.append(("~/.jeo/config.json wikiRoot is the absolute canonical vault", ok, str(wr)))
    else:
        checks.append(("context-config.json readable", False, str(context_config_path)))

    # ---- mex-agent version ----------------------------------------------------------
    ver = None
    if mex_agent.exists():
        cp = run([str(mex_agent), "--version"], timeout=30)
        ver = cp.stdout.strip().splitlines()[-1].strip() if cp.returncode == 0 and cp.stdout.strip() else None
    checks.append(("mex-agent >= 0.8.3", bool(ver) and version_tuple(ver) >= MIN_MEX, ver or "not found"))

    # ---- Detected hosts (informational) -------------------------------------------
    if codex_hooks.exists():
        codex = _load_json(codex_hooks) or {}
        text = json.dumps(codex)
        checks.append(("codex hooks.json (info)", True, "present; ingest referenced=%s" % ("ingest-prompt" in text or "llm-wiki-ingest" in text)))

    for label, marker in (
        ("jeo hooks.json", home / ".jeo" / "hooks.json"),
        ("jeopi ext", home / ".jeopi" / "agent" / "extensions" / "llm-wiki-ingest.ts"),
        ("gjc ext", home / ".gjc" / "agent" / "extensions" / "llm-wiki-ingest.ts"),
        ("opencode plugin", home / ".config" / "opencode" / "plugins" / "jeo-context-ingest.js"),
        ("gemini settings.json", home / ".gemini" / "settings.json"),
        ("antigravity hooks.json", home / ".gemini" / "config" / "hooks.json"),
        ("antigravity-cli settings.json", home / ".gemini" / "antigravity-cli" / "settings.json"),
    ):
        if marker.parent.exists():
            checks.append((f"{label} (info)", True, "present" if marker.exists() else "missing"))

    # ---- vault present ---------------------------------------------------------------
    checks.append(("canonical vault exists", Path(vault).is_dir(), vault))
    return checks