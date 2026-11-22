#!/usr/bin/env python3
"""Shared context & vault resolution for jeo-skills hooks and ctx."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any, Callable


def _env_path(name: str) -> Path | None:
    raw = (os.environ.get(name) or "").strip()
    return Path(raw).expanduser() if raw else None


def _read_json_dict(path: Path) -> dict[str, Any]:
    try:
        if path.is_symlink() or not path.is_file():
            return {}
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def context_config_path(home: Path | None = None) -> Path:
    explicit = _env_path("JEO_CONTEXT_CONFIG")
    if explicit is not None:
        return explicit
    root = home or Path.home()
    return root / ".agents" / "context-config.json"


def load_context_config(home: Path | None = None) -> dict[str, Any]:
    return _read_json_dict(context_config_path(home))


def resolve_second_brain_config_path(home: Path | None = None) -> Path:
    explicit = _env_path("JEO_SECOND_BRAIN_CONFIG")
    if explicit is not None:
        return explicit
    root = home or Path.home()
    cfg = load_context_config(root)
    raw = cfg.get("secondBrainConfig")
    if isinstance(raw, str) and raw.strip():
        return Path(raw.strip()).expanduser()
    return root / ".jeo" / "second-brain-config.json"


def resolve_second_brain_vault(home: Path | None = None) -> Path | None:
    root = home or Path.home()
    sb_cfg = _read_json_dict(resolve_second_brain_config_path(root))
    raw = sb_cfg.get("vault")
    if isinstance(raw, str) and raw.strip():
        return Path(raw.strip()).expanduser()
    cfg = load_context_config(root)
    raw_cfg = cfg.get("secondBrainVault")
    if isinstance(raw_cfg, str) and raw_cfg.strip():
        return Path(raw_cfg.strip()).expanduser()
    default_vault = root / "vaults" / "jeo-second-brain"
    return default_vault if default_vault.is_dir() else None


def git_toplevel(cwd: Path | None = None) -> Path | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return None
    if out.returncode != 0:
        return None
    top = out.stdout.strip()
    return Path(top) if top else None


def resolve_wiki_vault(
    *,
    home: Path | None = None,
    cwd: Path | None = None,
    prefer_ctx_env: bool = False,
    git_toplevel_fn: Callable[[], Path | None] | None = None,
) -> Path:
    root = home or Path.home()
    if prefer_ctx_env:
        ctx_explicit = _env_path("CTX_VAULT")
        if ctx_explicit is not None:
            return ctx_explicit

    explicit = _env_path("LLM_WIKI_VAULT")
    if explicit is not None:
        return explicit

    om_explicit = _env_path("OBSIDIAN_MIND_VAULT")
    if om_explicit is not None:
        return om_explicit / "llm-wiki"

    cfg = load_context_config(root)
    cfg_vault = cfg.get("wikiVault")
    if isinstance(cfg_vault, str) and cfg_vault.strip():
        return Path(cfg_vault.strip()).expanduser()

    jeo_cfg = _read_json_dict(root / ".jeo" / "config.json")
    jeo_wiki = jeo_cfg.get("wikiRoot")
    if isinstance(jeo_wiki, str) and jeo_wiki.strip():
        return Path(jeo_wiki.strip()).expanduser()

    canonical = root / "vaults" / "llm-wiki"
    if prefer_ctx_env or canonical.is_dir():
        return canonical

    top_fn = git_toplevel_fn if git_toplevel_fn is not None else (lambda: git_toplevel(cwd))
    top = top_fn()
    if top is not None:
        return top / "llm-wiki"

    legacy_obsidian = root / "vaults" / "obsidian-mind"
    if legacy_obsidian.is_dir():
        return legacy_obsidian / "llm-wiki"
    return canonical
