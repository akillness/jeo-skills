#!/usr/bin/env python3
"""Install the pinned operating files into a consented, new wiki vault.

Preview performs filesystem reads only. No upstream Python/shell code is executed:
core note templates are extracted as literals from the verified bootstrap source.
"""
from __future__ import annotations

import sys

# Preview disables bytecode before stdlib/sibling imports to remain write-free.
# ruff: noqa: E402
sys.dont_write_bytecode = True

import argparse
import ast
from datetime import date
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tempfile
import unicodedata
import urllib.request
import zipfile

try:
    import tomllib
except ModuleNotFoundError:  # Python 3.10 fallback
    tomllib = None  # type: ignore[assignment]

UPSTREAM = "https://github.com/akillness/obsidian-second-brain"
REF = "c8b1d8c1c5b41d4f1845f7188200d354837be96f"
DEFAULT_SCHEDULES = {
    "scan": "* * * * *", "morning": "0 8 * * *", "nightly": "0 22 * * *",
    "weekly": "0 18 * * 5", "health": "0 21 * * 0",
}
COMMANDS = ("ingest", "daily", "reconcile", "synthesize", "recap", "health", "save")
HOSTS = ("claude", "codex", "jeo", "jeopi", "omp", "pi", "gjc")
HOST_DETECTION_ORDER = ("jeopi", "omp", "jeo", "codex", "claude", "pi", "gjc")
NON_CLAUDE_HOSTS = ("codex", "jeopi", "jeo", "omp", "pi", "gjc")
PROVIDER_QUALIFIED_HOSTS = ("jeo", "jeopi", "omp", "pi", "gjc")
MODEL_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/@+-]*")
BASES = {
    "projects": ("Projects", "PROJECTS_FOLDER", "wiki/projects"),
    "people": ("People", "PEOPLE_FOLDER", "wiki/entities"),
    "tasks": ("Tasks", "TASKS_FOLDER", "wiki/tasks"),
    "daily": ("Daily", "DAILY_FOLDER", "wiki/daily"),
}


def within_alias(path: Path, root: Path) -> bool:
    """Conservative containment on case-sensitive and case-insensitive hosts."""
    parts = tuple(unicodedata.normalize("NFC", part).casefold() for part in path.parts)
    parent = tuple(unicodedata.normalize("NFC", part).casefold() for part in root.parts)
    return parts[:len(parent)] == parent


def no_symlinks(path: Path) -> None:
    for part in (path, *path.parents):
        if part.is_symlink():
            raise ValueError(f"symlink is not allowed: {part}")


def absolute_path(value: object, label: str) -> Path:
    if not isinstance(value, str) or not value or any(ord(c) < 32 for c in value):
        raise ValueError(f"{label} must be an absolute, control-free path")
    path = Path(value)
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError(f"{label} must be absolute without traversal")
    no_symlinks(path)
    return path.resolve()


def executable(value: object, name: str) -> str:
    found = value if value is not None else shutil.which(name)
    if not isinstance(found, str) or not Path(found).is_absolute() or any(ord(c) < 32 for c in found):
        raise ValueError(f"{name} must resolve to an absolute executable")
    path = Path(found).resolve(strict=True)
    if not path.is_file() or not os.access(path, os.X_OK):
        raise ValueError(f"{name} executable is unavailable: {path}")
    return str(path)


def optional_executable(value: object, name: str, fallback_dir: Path | None = None) -> str | None:
    candidates = []
    if isinstance(value, str) and value.strip():
        candidates.append(value.strip())
    if fallback_dir is not None:
        candidates.append(str(fallback_dir / name))
    which_hit = shutil.which(name)
    if which_hit:
        candidates.append(which_hit)
    for raw in candidates:
        try:
            return executable(raw, name)
        except ValueError:
            continue
    return None


def user_home() -> Path:
    raw = os.environ.get("USER_HOME") or os.environ.get("HOME")
    return Path(raw).expanduser().resolve() if raw else Path.home().resolve()


def is_claude_compatible_model(model: str) -> bool:
    lowered = model.strip().lower()
    if not lowered or lowered == "auto":
        return False
    non_claude_prefixes = (
        "gpt-", "o1", "o3", "o4", "chatgpt-", "codex-",
        "openai/", "openai-codex/", "google/", "gemini",
        "openrouter/", "xai/", "grok-", "deepseek", "qwen",
    )
    if lowered.startswith(non_claude_prefixes) or "-terra" in lowered:
        return False
    return True


def host_config_paths(host: str, home: Path | None = None) -> list[Path]:
    base = home or user_home()
    paths: list[Path] = []
    if host == "claude":
        cfg_dir = os.environ.get("CLAUDE_CONFIG_DIR", "").strip()
        if cfg_dir:
            paths.append(Path(cfg_dir).expanduser() / "settings.json")
        paths.append(base / ".claude/settings.json")
    elif host == "codex":
        codex_dir = os.environ.get("CODEX_HOME", "").strip()
        if codex_dir:
            paths.extend([Path(codex_dir).expanduser() / "config.toml",
                          Path(codex_dir).expanduser() / "config.json"])
        paths.extend([base / ".codex/config.toml", base / ".codex/config.json"])
    elif host == "jeo":
        jeo_cfg = os.environ.get("JEO_CONFIG", "").strip()
        if jeo_cfg:
            paths.append(Path(jeo_cfg).expanduser())
        paths.extend([base / ".jeo/config.json", base / ".config/jeo/config.json"])
    elif host in ("jeopi", "omp", "pi", "gjc"):
        env_key = f"{host.upper()}_HOME"
        custom = os.environ.get(env_key, "").strip()
        if custom:
            root = Path(custom).expanduser()
            paths.extend([root / "agent/settings.json", root / "settings.json",
                          root / "config.json", root / "agent/config.json"])
        root = base / f".{host}"
        paths.extend([root / "agent/settings.json", root / "settings.json",
                      root / "config.json", root / "agent/config.json"])
    return paths


def _parse_toml_model(text: str) -> tuple[str | None, str | None]:
    if tomllib is not None:
        try:
            data = tomllib.loads(text)
            if isinstance(data, dict):
                model = data.get("model") or data.get("default_model") or data.get("defaultModel")
                provider = data.get("model_provider") or data.get("provider")
                return (
                    model.strip() if isinstance(model, str) and model.strip() else None,
                    provider.strip() if isinstance(provider, str) and provider.strip() else None,
                )
        except Exception:
            pass
    model_val = None
    provider_val = None
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("["):
            break
        m_match = re.match(r'^model\s*=\s*["\']([^"\']+)["\']', stripped)
        if m_match:
            model_val = m_match.group(1).strip()
        p_match = re.match(r'^model_provider\s*=\s*["\']([^"\']+)["\']', stripped)
        if p_match:
            provider_val = p_match.group(1).strip()
    return model_val, provider_val


def read_host_model_config(host: str, home: Path | None = None) -> str | None:
    env_lookup = {
        "claude": ("SECOND_BRAIN_MODEL", "JEO_SECOND_BRAIN_MODEL", "CLAUDE_MODEL", "ANTHROPIC_MODEL"),
        "codex": ("SECOND_BRAIN_MODEL", "JEO_SECOND_BRAIN_MODEL", "CODEX_MODEL", "OPENAI_MODEL"),
        "jeo": ("SECOND_BRAIN_MODEL", "JEO_SECOND_BRAIN_MODEL", "JEO_MODEL"),
        "jeopi": ("SECOND_BRAIN_MODEL", "JEO_SECOND_BRAIN_MODEL", "JEOPI_MODEL"),
        "omp": ("SECOND_BRAIN_MODEL", "JEO_SECOND_BRAIN_MODEL", "OMP_MODEL"),
        "pi": ("SECOND_BRAIN_MODEL", "JEO_SECOND_BRAIN_MODEL", "PI_MODEL"),
        "gjc": ("SECOND_BRAIN_MODEL", "JEO_SECOND_BRAIN_MODEL", "GJC_MODEL"),
    }
    for env_name in env_lookup.get(host, ("SECOND_BRAIN_MODEL", "JEO_SECOND_BRAIN_MODEL")):
        val = os.environ.get(env_name, "").strip()
        if val and val.lower() != "auto" and MODEL_RE.fullmatch(val):
            return val
    for candidate in host_config_paths(host, home):
        try:
            no_symlinks(candidate)
            if not candidate.is_file():
                continue
            raw_text = candidate.read_text(encoding="utf-8")
        except Exception:
            continue
        if candidate.suffix == ".toml":
            model, provider = _parse_toml_model(raw_text)
            if model and MODEL_RE.fullmatch(model):
                if host in PROVIDER_QUALIFIED_HOSTS and provider and "/" not in model:
                    combined = f"{provider}/{model}"
                    if MODEL_RE.fullmatch(combined):
                        return combined
                return model
        else:
            try:
                data = json.loads(raw_text)
            except Exception:
                continue
            if not isinstance(data, dict):
                continue
            model = None
            for key in ("model", "defaultModel", "default_model"):
                val = data.get(key)
                if isinstance(val, str) and val.strip() and val.strip().lower() != "auto":
                    model = val.strip()
                    break
                if isinstance(val, dict):
                    nested = val.get("id") or val.get("model") or val.get("name")
                    if isinstance(nested, str) and nested.strip():
                        model = nested.strip()
                        break
            if not model and isinstance(data.get("env"), dict):
                for env_key in ("ANTHROPIC_MODEL", "OPENAI_MODEL", "MODEL"):
                    val = data["env"].get(env_key)
                    if isinstance(val, str) and val.strip():
                        model = val.strip()
                        break
            if model and MODEL_RE.fullmatch(model):
                provider = data.get("defaultProvider") or data.get("provider") or data.get("modelProvider")
                if host in PROVIDER_QUALIFIED_HOSTS and isinstance(provider, str) and provider.strip() and "/" not in model:
                    combined = f"{provider.strip()}/{model}"
                    if MODEL_RE.fullmatch(combined):
                        return combined
                return model
    return None


def detect_host_from_env() -> str | None:
    for var in ("SECOND_BRAIN_HOST", "JEO_SECOND_BRAIN_HOST", "JEV_AGENT"):
        val = os.environ.get(var, "").strip().lower()
        if val in HOSTS:
            return val
    env_markers = (
        ("jeopi", ("JEOPI_HOME", "JEOPI_AGENT_DIR", "JEOPI_MODEL")),
        ("omp", ("OMP_HOME", "OMP_AGENT_DIR", "OMP_MODEL")),
        ("jeo", ("JEO_CONFIG", "JEO_HOME", "JEO_MODEL")),
        ("codex", ("CODEX_HOME", "CODEX_THREAD_ID", "CODEX_SANDBOX", "CODEX_MODEL")),
        ("claude", ("CLAUDE_CONFIG_DIR", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_MODEL", "ANTHROPIC_MODEL")),
        ("pi", ("PI_CODING_AGENT_DIR", "PI_MODEL")),
        ("gjc", ("GJC_HOME", "GJC_MODEL")),
    )
    for host, keys in env_markers:
        if any(os.environ.get(k, "").strip() for k in keys):
            return host
    return None


def resolve_host_and_model(config: dict, home: Path) -> tuple[str, str, str, bool]:
    """Return (host, model, host_bin, include_host_fields)."""
    raw_host = config.get("host")
    raw_model = config.get("model")
    if raw_host is not None and (not isinstance(raw_host, str) or not raw_host.strip()):
        raise ValueError("host must be a non-empty string when provided")
    explicit_host = raw_host.strip().lower() if isinstance(raw_host, str) else None
    if explicit_host and explicit_host != "auto" and explicit_host not in HOSTS:
        raise ValueError(f"unsupported host: {explicit_host}")

    if raw_model is not None and not isinstance(raw_model, str):
        raise ValueError("explicit model identifier is required")
    if isinstance(raw_model, str) and not raw_model.strip():
        raise ValueError("explicit model identifier is required")
    explicit_model = raw_model.strip() if isinstance(raw_model, str) and raw_model.strip().lower() != "auto" else None
    if explicit_model and not MODEL_RE.fullmatch(explicit_model):
        raise ValueError("explicit model identifier is required")

    fallback_bin_dir = Path(config["claude_bin"]).parent if isinstance(config.get("claude_bin"), str) and Path(config["claude_bin"]).is_absolute() else None

    host = explicit_host if explicit_host and explicit_host != "auto" else None
    if host is None:
        env_host = detect_host_from_env()
        if env_host:
            host = env_host

    if host is None:
        if explicit_model and not is_claude_compatible_model(explicit_model):
            bare_target = explicit_model.split("/", 1)[-1]
            for candidate in NON_CLAUDE_HOSTS:
                cfg_model = read_host_model_config(candidate, home)
                if cfg_model and (cfg_model == explicit_model or cfg_model.split("/", 1)[-1] == bare_target):
                    if optional_executable(config.get(f"{candidate}_bin"), candidate, fallback_bin_dir):
                        host = candidate
                        break
            if host is None:
                for candidate in NON_CLAUDE_HOSTS:
                    if any(p.is_file() for p in host_config_paths(candidate, home)) and optional_executable(config.get(f"{candidate}_bin"), candidate, fallback_bin_dir):
                        host = candidate
                        break
            if host is None:
                for candidate in NON_CLAUDE_HOSTS:
                    if optional_executable(config.get(f"{candidate}_bin"), candidate, fallback_bin_dir):
                        host = candidate
                        break
        elif explicit_model and explicit_host is None and config.get("claude_bin"):
            host = "claude"

    if host is None:
        for candidate in HOST_DETECTION_ORDER:
            if any(p.is_file() for p in host_config_paths(candidate, home)):
                if explicit_model or read_host_model_config(candidate, home):
                    if optional_executable(config.get(f"{candidate}_bin") or (config.get("claude_bin") if candidate == "claude" else None), candidate, fallback_bin_dir):
                        host = candidate
                        break
        if host is None:
            for candidate in HOST_DETECTION_ORDER:
                if any(p.is_file() for p in host_config_paths(candidate, home)):
                    host = candidate
                    break
        if host is None:
            host = "claude"

    model = explicit_model
    if not model:
        model = read_host_model_config(host, home)
        if not model and (explicit_host is None or explicit_host == "auto"):
            for candidate in HOST_DETECTION_ORDER:
                cand_model = read_host_model_config(candidate, home)
                if cand_model:
                    if optional_executable(config.get(f"{candidate}_bin") or (config.get("claude_bin") if candidate == "claude" else None), candidate, fallback_bin_dir):
                        host = candidate
                    model = cand_model
                    break

    if not model or not MODEL_RE.fullmatch(model):
        raise ValueError("explicit model identifier is required")

    if host == "claude" and not is_claude_compatible_model(model):
        for candidate in NON_CLAUDE_HOSTS:
            if optional_executable(config.get(f"{candidate}_bin"), candidate, fallback_bin_dir):
                host = candidate
                break
        else:
            claude_fallback = read_host_model_config("claude", home)
            if claude_fallback and is_claude_compatible_model(claude_fallback):
                model = claude_fallback

    raw_bin = config.get(f"{host}_bin") or (config.get("host_bin") if explicit_host == host else None)
    if host == "claude" and raw_bin is None:
        raw_bin = config.get("claude_bin")
    resolved_bin = optional_executable(raw_bin, host, fallback_bin_dir)
    if resolved_bin is None:
        resolved_bin = executable(raw_bin, host)

    include_host_fields = bool(explicit_host is not None or raw_model == "auto" or raw_model is None or host != "claude" or "host_bin" in config or f"{host}_bin" in config and host != "claude")
    return host, model, resolved_bin, include_host_fields


def cron_expression(value: object) -> str:
    if not isinstance(value, str) or len(value.split()) != 5:
        raise ValueError("cron schedule must contain exactly five numeric fields")
    for field, (low, high) in zip(value.split(), ((0, 59), (0, 23), (1, 31), (1, 12), (0, 7))):
        for item in field.split(","):
            match = re.fullmatch(r"(\*|\d+(?:-\d+)?)(?:/(\d+))?", item)
            if not match:
                raise ValueError(f"invalid cron field: {field}")
            span, step = match.groups()
            if step and not 1 <= int(step) <= high - low + 1:
                raise ValueError(f"invalid cron step: {field}")
            if span != "*":
                bounds = [int(v) for v in span.split("-")]
                if not all(low <= number <= high for number in bounds) or bounds[0] > bounds[-1]:
                    raise ValueError(f"cron field out of range: {field}")
    return " ".join(value.split())


def validate_config(config: object, source: Path | None) -> dict:
    for key in ("JEO_SKILLS_APPROVE_KNOWLEDGE_HOOKS", "JEO_SKILLS_APPROVE_KNOWLEDGE_DATA"):
        if os.environ.get(key, "").strip().lower() in ("0", "false", "no", "off"):
            raise ValueError(f"explicit installer veto: {key}")
    if not isinstance(config, dict) or type(config.get("version")) is not int or config["version"] != 1:
        raise ValueError("configuration version must be 1")
    result = dict(config)
    consent = config.get("consent")
    needed = ["data", "model", "hooks", "schedule", "postcompact"]
    if source is None:
        needed.append("download")
    if not isinstance(consent, dict) or any(consent.get(key) is not True for key in needed):
        raise ValueError("explicit consent required for: " + ", ".join(needed))
    vault = absolute_path(config.get("vault"), "vault")
    inbox = absolute_path(config.get("inbox"), "inbox")
    home = user_home()
    protected = (home / "vaults/llm-wiki", home / ".claude", home / ".agents")
    for target in (vault, inbox):
        if within_alias(Path.cwd().resolve(), target):
            raise ValueError(f"target contains current working data: {target}")
        if within_alias(home, target) or target == Path(target.anchor) or any(
            within_alias(target, root) or within_alias(root, target) for root in protected
        ):
            raise ValueError(f"target overlaps existing HOME/current data: {target}")
    if within_alias(vault, inbox):
        raise ValueError("inbox cannot equal or contain vault")
    if within_alias(inbox, vault) and vault not in inbox.parents:
        raise ValueError("inbox uses an ambiguous case alias of the vault path")
    if vault in inbox.parents:
        reserved = ("wiki", "raw", ".second-brain", ".claude", ".obsidian", "Templates", "Bases", "Logs")
        if inbox.relative_to(vault).parts[0].casefold() in {name.casefold() for name in reserved}:
            raise ValueError("inbox overlaps a managed or immutable vault directory")
    for target in (vault, inbox):
        if target == inbox and vault in inbox.parents:
            continue
        if not target.parent.is_dir():
            raise ValueError(f"target parent must already exist: {target.parent}")
    marker = vault / ".second-brain/install.json"
    if vault.exists():
        if not vault.is_dir() or not marker.is_file():
            raise ValueError("existing non-owned vault is forbidden")
        scan_regular_tree(vault)
        owned = json.loads(marker.read_text(encoding="utf-8"))
        if owned.get("vault") != str(vault) or owned.get("upstream_ref") != REF or owned.get("owner") != "jeo-second-brain-v1":
            raise ValueError("existing vault ownership does not match")
    if inbox.exists():
        inbox_marker = inbox / ".second-brain-inbox.json"
        if not inbox.is_dir() or not inbox_marker.is_file():
            raise ValueError("existing non-owned inbox is forbidden")
        if json.loads(inbox_marker.read_text(encoding="utf-8")).get("vault") != str(vault):
            raise ValueError("existing inbox belongs to another vault")
        scan_regular_tree(inbox)
    host, model, host_bin, include_host_fields = resolve_host_and_model(config, home)
    for key in ("max_run_usd", "daily_budget_usd"):
        number = config.get(key)
        try:
            valid = type(number) in (int, float) and math.isfinite(number) and number > 0
        except OverflowError:
            valid = False
        if not valid:
            raise ValueError(f"{key} must be positive and finite")
    if config["daily_budget_usd"] < config["max_run_usd"]:
        raise ValueError("daily_budget_usd must cover one max_run_usd allowance")
    for key in ("timeout_seconds", "max_input_bytes"):
        if type(config.get(key)) is not int or config[key] <= 0:
            raise ValueError(f"{key} must be a positive integer")
    integrations = config.get("integrations")
    if not isinstance(integrations, dict) or any(integrations.get(key) is not True for key in ("ctx", "graphify", "mex", "zvec")):
        raise ValueError("ctx, graphify, mex and zvec integrations must be enabled explicitly")
    provider = config.get("graphify_provider")
    if provider is not None or consent.get("graphify_provider") is True:
        if consent.get("graphify_provider") is not True or not isinstance(provider, dict):
            raise ValueError("Graphify provider requires separate explicit consent and configuration")
        if provider.get("accept_unbounded_cost") is not True:
            raise ValueError("Graphify provider cost is not bounded by the Claude run allowance")
        for key in ("backend", "model"):
            value = provider.get(key)
            if not isinstance(value, str) or not MODEL_RE.fullmatch(value):
                raise ValueError(f"explicit Graphify provider {key} identifier is required")
    schedules = config.get("schedules")
    if not isinstance(schedules, dict) or set(schedules) != set(DEFAULT_SCHEDULES):
        raise ValueError("schedules must specify scan, morning, nightly, weekly and health only")
    result.update(vault=str(vault), inbox=str(inbox), model=model,
                  schedules={key: cron_expression(value) for key, value in schedules.items()})
    claude_resolved = optional_executable(config.get("claude_bin"), "claude", Path(host_bin).parent)
    result["claude_bin"] = claude_resolved if claude_resolved is not None else host_bin
    if include_host_fields:
        result["host"] = host
        result["host_bin"] = host_bin
        result[f"{host}_bin"] = host_bin
    result["python_bin"] = executable(str(Path(sys.executable).resolve()), "python3")
    result["crontab_bin"] = executable(config.get("crontab_bin"), "crontab")
    for key, binary in (("graphify_bin", "graphify"), ("mex_bin", "mex-agent"), ("zvec_bin", "zg")):
        result[key] = executable(config.get(key), binary)
    if any("\\" in result[key] for key in ("vault", "python_bin")):
        raise ValueError("scheduled executable/vault paths cannot contain backslashes")
    result["upstream"] = {"url": UPSTREAM, "ref": REF}
    result["preset"] = "general-wiki"
    if vault.exists():
        previous = json.loads((vault / ".second-brain/config.json").read_text(encoding="utf-8"))
        for immutable in ("vault", "inbox", "upstream", "preset"):
            if previous.get(immutable) != result.get(immutable):
                raise ValueError(f"owned vault cannot change {immutable}; target migration requires a separate reviewed operation")
    return result


def scan_regular_tree(root: Path) -> list[Path]:
    no_symlinks(root)
    files = []
    def fail(error):
        raise error
    for current, dirs, names in os.walk(root, followlinks=False, onerror=fail):
        for name in dirs + names:
            path = Path(current) / name
            if path.is_symlink() or not (path.is_file() or path.is_dir()):
                raise ValueError(f"source/target tree contains a symlink or special file: {path}")
            if path.is_file():
                files.append(path)
    return files


def checkout_ref(source: Path) -> None:
    gitdir = source / ".git"
    # Worktree gitdir indirection is intentionally unsupported: the source must
    # be a self-contained checkout, not a route into another working tree.
    if not gitdir.is_dir() or gitdir.is_symlink():
        raise ValueError("--source must be a self-contained pinned git checkout")
    head_path = gitdir / "HEAD"
    no_symlinks(head_path)
    head = head_path.read_text(encoding="ascii").strip()
    if head.startswith("ref: "):
        ref = head[5:]
        if not re.fullmatch(r"refs/[A-Za-z0-9._/-]+", ref) or ".." in ref.split("/"):
            raise ValueError("invalid source git reference")
        ref_path = gitdir / ref
        no_symlinks(ref_path)
        if ref_path.is_file():
            head = ref_path.read_text(encoding="ascii").strip()
        else:
            packed = gitdir / "packed-refs"
            no_symlinks(packed)
            matches = [row.split()[0] for row in packed.read_text(encoding="ascii").splitlines()
                       if not row.startswith(("#", "^")) and row.endswith(" " + ref)]
            head = matches[0] if len(matches) == 1 else ""
    if head != REF:
        raise ValueError(f"upstream checkout must be exactly {REF}")


def source_assets(source: Path) -> dict[str, bytes]:
    no_symlinks(source)
    assets = {}
    for name in ("commands", "references", "scripts"):
        root = source / name
        if not root.is_dir():
            raise ValueError(f"missing upstream directory: {name}")
        for path in scan_regular_tree(root):
            assets[path.relative_to(source).as_posix()] = path.read_bytes()
    for name in ("SKILL.md", "LICENSE", "scripts/bootstrap_vault.py"):
        path = source / name
        no_symlinks(path)
        assets[name] = path.read_bytes()
    required = [f"commands/obsidian-{name}.md" for name in COMMANDS]
    required += ["references/ai-first-rules.md", "references/claude-md-template.md"]
    required += [f"references/bases/{name}.base.template" for name in BASES]
    for name in required:
        if not assets.get(name):
            raise ValueError(f"missing upstream operating asset: {name}")
    return assets


def verified_local_assets(source: Path, *, preview: bool) -> dict[str, bytes]:
    checkout_ref(source)
    assets = source_assets(source)
    if not preview:
        git = executable(None, "git")
        git_env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        git_env.update(GIT_NO_REPLACE_OBJECTS="1", GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)
        proc = subprocess.run([git, "-C", str(source), "ls-tree", "-r", "-z", REF], env=git_env, capture_output=True, check=True, timeout=30)
        blobs = {}
        for row in proc.stdout.split(b"\0"):
            if row:
                info, name = row.split(b"\t", 1)
                mode, kind, digest = info.decode("ascii").split()
                if kind == "blob" and mode in ("100644", "100755"):
                    blobs[name.decode("utf-8")] = digest
        for name, content in assets.items():
            actual = hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()
            if blobs.get(name) != actual:
                raise ValueError(f"upstream file differs from pinned git tree: {name}")
    return assets


def downloaded_assets(staging: Path) -> dict[str, bytes]:
    archive = staging / "upstream.zip"
    url = f"https://codeload.github.com/akillness/obsidian-second-brain/zip/{REF}"
    with urllib.request.urlopen(url, timeout=60) as response, archive.open("xb") as output:
        remaining = 32 * 1024 * 1024
        while chunk := response.read(min(65536, remaining + 1)):
            remaining -= len(chunk)
            if remaining < 0:
                raise ValueError("upstream archive exceeds 32 MiB")
            output.write(chunk)
    root = staging / "source"
    root.mkdir()
    prefix = f"obsidian-second-brain-{REF}/"
    with zipfile.ZipFile(archive) as bundle:
        members = bundle.infolist()
        if sum(item.file_size for item in members) > 64 * 1024 * 1024:
            raise ValueError("expanded upstream archive exceeds 64 MiB")
        for item in members:
            relative = item.filename.removeprefix(prefix)
            if not item.filename.startswith(prefix) or relative.startswith("/") or ".." in Path(relative).parts or "\\" in relative:
                raise ValueError("invalid upstream archive path")
            mode = item.external_attr >> 16
            if mode and (mode & 0o170000) not in (0, 0o100000, 0o040000):
                raise ValueError("upstream archive contains a link or special file")
            if item.is_dir():
                continue
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(bundle.read(item))
    return source_assets(root)


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def atomic_write_bytes(path: Path, data: bytes) -> None:
    no_symlinks(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    no_symlinks(path.parent)
    fd, name = tempfile.mkstemp(prefix=".setup-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(name, 0o600)
        no_symlinks(path)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def core_templates(script: bytes) -> dict[str, bytes]:
    tree = ast.parse(script.decode("utf-8"))
    function = next((node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "write_core_templates"), None)
    if function is None:
        raise ValueError("pinned bootstrap lacks write_core_templates")
    templates = {}
    for node in ast.walk(function):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name) or node.func.id != "write" or len(node.args) != 2:
            continue
        target, text = node.args
        if not (isinstance(target, ast.BinOp) and isinstance(target.op, ast.Div)
                and isinstance(target.left, ast.Name) and target.left.id == "vault"
                and isinstance(target.right, ast.Constant) and isinstance(target.right.value, str)
                and isinstance(text, ast.Constant) and isinstance(text.value, str)):
            raise ValueError("unsupported upstream core template expression")
        name = target.right.value
        if not name.startswith("Templates/") or ".." in Path(name).parts or Path(name).is_absolute():
            raise ValueError("unsafe upstream template path")
        content = text.value.strip() + "\n"
        for old, new in (("Tasks", "wiki/tasks"), ("Daily", "wiki/daily"), ("Projects", "wiki/projects"), ("People", "wiki/entities")):
            content = content.replace(f'FROM "{old}"', f'FROM "{new}"')
        templates[name] = content.encode("utf-8")
    if not templates:
        raise ValueError("upstream core note templates are missing")
    return templates


def installed_files(config: dict, assets: dict[str, bytes]) -> dict[str, bytes]:
    files = {f".second-brain/upstream/{name}": content for name, content in assets.items()}
    for name, content in assets.items():
        operating = content
        if name.endswith(".md"):
            operating = content.replace(b"~/.claude/skills/obsidian-second-brain", b".claude/skills/obsidian-second-brain")
        files[f".claude/skills/obsidian-second-brain/{name}"] = operating
        if name.startswith("commands/"):
            files[f".claude/{name}"] = operating
    files.update(core_templates(assets["scripts/bootstrap_vault.py"]))
    for name, (title, placeholder, folder) in BASES.items():
        text = assets[f"references/bases/{name}.base.template"].decode("utf-8")
        files[f"Bases/{title}.base"] = text.replace("{{" + placeholder + "}}", folder).encode("utf-8")
    package = Path(__file__).resolve().parent
    for name in ("runtime.py", "ctx_guard.py"):
        source = package / name
        no_symlinks(source)
        files[f".second-brain/scripts/{name}"] = source.read_bytes()
    today = date.today().isoformat()
    files[".second-brain/config.json"] = json_bytes(config)
    files[".second-brain/install.json"] = json_bytes({
        "owner": "jeo-second-brain-v1", "vault": config["vault"], "upstream_ref": REF,
        "assets": {name: hashlib.sha256(value).hexdigest() for name, value in assets.items()},
    })
    files["CLAUDE.md"] = b"@_CLAUDE.md\n@.claude/skills/obsidian-second-brain/SKILL.md\n"
    files["_CLAUDE.md"] = (
        "# General wiki operating map\n\n## For future Claude\n\n"
        "Read index.md before retrieval. Preserve raw/** byte-for-byte, including raw/videos and archived-root raw. "
        "Rewrite synthesized knowledge only under wiki/, with sources, temporal changes and contradictions recorded. "
        "Use installed commands and references in .claude/skills/obsidian-second-brain; .second-brain/upstream is pristine provenance only. Do not run upstream setup.sh or background agents.\n\n"
        "| Kind | Folder |\n|---|---|\n| Concepts | wiki/concepts |\n| People | wiki/entities |\n"
        "| Sources | wiki/sources |\n| Projects | wiki/projects |\n| Tasks | wiki/tasks |\n"
        "| Daily | wiki/daily |\n| Syntheses | wiki/syntheses |\n| Templates | Templates |\n\n"
        "All automatic work uses .second-brain/scripts/runtime.py and the consented .second-brain/config.json. "
        "The model proposes updates without tools; deterministic host code applies validated wiki changes.\n"
    ).encode()
    files["index.md"] = (f"---\ntype: index\ndate: {today}\ntags: [index]\nai-first: true\n---\n\n"
        "# Knowledge index\n\n## For future Claude\n\nStart here to retrieve maintained wiki pages. "
        "This is a new general-purpose wiki; no source claims have been added yet.\n").encode()
    files["log.md"] = (f"---\ntype: log\ndate: {today}\ntags: [operations]\nai-first: true\n---\n\n"
        "# Operations log\n\n## For future Claude\n\nRecords verified knowledge maintenance and changes of belief.\n\n"
        f"- {today}: Initialized new general wiki from upstream {REF}; no model was invoked.\n").encode()
    files[".obsidian/app.json"] = b"{}\n"
    files[".claude/settings.json"] = json_bytes(hook_settings({}, config))
    marker = json.loads(files[".second-brain/install.json"])
    marker["managed_files"] = sorted(name for name in files if name != ".second-brain/install.json")
    files[".second-brain/install.json"] = json_bytes(marker)
    return files


def runtime_command(config: dict, event: str, *, scheduled: bool = False) -> str:
    root = Path(config["vault"])
    argv = [config["python_bin"], str(root / ".second-brain/scripts/runtime.py"), "--config", str(root / ".second-brain/config.json"), "--event", event]
    if scheduled:
        argv.append("--scheduled")
    return shlex.join(argv)


def hook_settings(settings: dict, config: dict, *, update_existing: bool = False) -> dict:
    settings = json.loads(json.dumps(settings))
    hooks = settings.setdefault("hooks", {})
    if not isinstance(hooks, dict) or not isinstance(hooks.get("PostCompact", []), list):
        raise ValueError("local hook settings have an invalid shape")
    command = runtime_command(config, "postcompact")
    timeout = config["timeout_seconds"] + 30
    entries = hooks.setdefault("PostCompact", [])
    if any(not isinstance(entry, dict) or not isinstance(entry.get("hooks"), list)
           or any(not isinstance(hook, dict) for hook in entry["hooks"]) for entry in entries):
        raise ValueError("PostCompact hook entries must contain hook lists")
    if update_existing:
        updated_any = False
        for entry in entries:
            for hook in entry["hooks"]:
                if hook.get("command") == command:
                    hook["timeout"] = timeout
                    updated_any = True
        if not updated_any:
            entries.append({"hooks": [{"type": "command", "command": command, "timeout": timeout}]})
        return settings
    matching = [entry for entry in entries if any(hook.get("command") == command for hook in entry["hooks"])]
    if not matching:
        entries.append({"hooks": [{"type": "command", "command": command, "timeout": timeout}]})
    return settings


def read_crontab(binary: str) -> tuple[str, bool]:
    process = subprocess.run([binary, "-l"], text=True, capture_output=True, timeout=15)
    if process.returncode == 0:
        return process.stdout, True
    if process.returncode == 1 and "no crontab" in process.stderr.lower() and not process.stdout:
        return "", False
    raise RuntimeError("could not read existing crontab: " + process.stderr.strip())


def managed_crontab(existing: str, config: dict) -> str:
    token = hashlib.sha256(config["vault"].encode()).hexdigest()[:16]
    start, end = f"# BEGIN jeo-second-brain {token}", f"# END jeo-second-brain {token}"
    lines = existing.splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.rstrip("\r\n") == start]
    ends = [i for i, line in enumerate(lines) if line.rstrip("\r\n") == end]
    if bool(starts) != bool(ends) or len(starts) > 1 or len(ends) > 1 or (starts and starts[0] >= ends[0]):
        raise ValueError("malformed managed crontab block")
    block = start + "\n"
    for event, schedule in config["schedules"].items():
        # Cron interprets percent before the shell even inside quoted argv.
        command = runtime_command(config, event, scheduled=True).replace("%", "\\%")
        log = shlex.quote(str(Path(config["vault"]) / ".second-brain/schedule.log")).replace("%", "\\%")
        block += f"{schedule} {command} >> {log} 2>&1\n"
    block += end + "\n"
    if starts:
        return "".join(lines[:starts[0]]) + block + "".join(lines[ends[0] + 1:])
    return existing + ("\n" if existing and not existing.endswith("\n") else "") + block


def ctx_preflight(config: dict) -> dict:
    source = Path(__file__).resolve().with_name("ctx_guard.py")
    if not source.is_file():
        raise ValueError("packaged ctx_guard.py is missing")
    spec = importlib.util.spec_from_file_location("second_brain_setup_ctx_guard", source)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    previous_bytecode = sys.dont_write_bytecode
    try:
        sys.dont_write_bytecode = True
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous_bytecode
    status = module.check_config(config, require_vault=False)
    vault = Path(config["vault"])
    status["pending"] = [name for name, directory in (("mex", ".mex"), ("zvec", ".zvec-grep"), ("graphify", "graphify-out"))
                         if not (vault / directory).is_dir()]
    status["state"] = "pending_initialization" if status["pending"] else "prerequisites_verified"
    return status


def rollback_tree(root: Path, owned_files: dict[str, bytes]) -> list[str]:
    """Remove only unmodified installer output, never post-publication notes."""
    for name, expected in owned_files.items():
        target = root / name
        try:
            no_symlinks(target)
            if target.is_file() and target.read_bytes() == expected:
                target.unlink()
        except OSError:
            continue
        except ValueError:
            continue
    if root.is_dir() and not root.is_symlink():
        for current, dirs, _ in os.walk(root, topdown=False, followlinks=False):
            for name in dirs:
                path = Path(current) / name
                if not path.is_symlink():
                    try:
                        path.rmdir()
                    except OSError:
                        pass
        try:
            root.rmdir()
        except OSError:
            return [f"preserved new or modified content during rollback: {root}"]
    return []


def install(config: dict, source: Path | None, dry_run: bool) -> dict:
    vault, inbox = Path(config["vault"]), Path(config["inbox"])
    assets = verified_local_assets(source, preview=dry_run) if source else None
    integration_status = ctx_preflight(config)
    actions = ["verify pinned upstream assets", "install commands, templates and standalone runtime", "initialize immutable raw and general wiki", "register vault-local PostCompact hook", "merge consented managed crontab block"]
    if dry_run:
        return {"status": "dry-run", "vault": str(vault), "host": config.get("host", "claude"),
                "model": config["model"], "actions": actions,
                "integrations": integration_status,
                "deferred": ["git blob verification", "crontab read/registration"]}
    old_cron, had_cron = read_crontab(config["crontab_bin"])
    new_cron = managed_crontab(old_cron, config)
    if vault.exists():
        marker = json.loads((vault / ".second-brain/install.json").read_text(encoding="utf-8"))
        expected_assets = marker.get("assets")
        if not isinstance(expected_assets, dict) or not expected_assets or not inbox.is_dir():
            raise ValueError("owned installation lacks asset inventory or inbox")
        managed_files = marker.get("managed_files")
        if not isinstance(managed_files, list) or not managed_files:
            raise ValueError("owned installation lacks a complete managed-file inventory")
        for name in managed_files:
            if not isinstance(name, str) or Path(name).is_absolute() or ".." in Path(name).parts or not (vault / name).is_file():
                raise ValueError("owned installation has a missing or invalid managed file")
        for name in expected_assets:
            if not isinstance(name, str) or Path(name).is_absolute() or ".." in Path(name).parts:
                raise ValueError("invalid owned asset inventory")
            if not (vault / ".second-brain/upstream" / name).is_file() or not (vault / ".claude/skills/obsidian-second-brain" / name).is_file():
                raise ValueError(f"owned installation is missing an operating asset: {name}")
            digest = expected_assets[name]
            if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
                raise ValueError("invalid owned source fingerprint")
            if hashlib.sha256((vault / ".second-brain/upstream" / name).read_bytes()).hexdigest() != digest:
                raise ValueError(f"owned pristine upstream asset changed: {name}")
            if assets is not None and (name not in assets or hashlib.sha256(assets[name]).hexdigest() != digest):
                raise ValueError(f"owned provenance differs from verified source: {name}")
            if name.startswith("commands/") and not (vault / ".claude" / name).is_file():
                raise ValueError(f"owned installation is missing a command: {name}")
        for name in ("index.md", "log.md", "CLAUDE.md", "_CLAUDE.md", "Templates", "Bases", "raw/sources", "raw/videos", "wiki"):
            if not (vault / name).exists():
                raise ValueError(f"owned installation is incomplete: {name}")
        for name in ("runtime.py", "ctx_guard.py"):
            if not (vault / ".second-brain/scripts" / name).is_file():
                raise ValueError("owned installation is incomplete; refusing destructive repair")
        config_file = vault / ".second-brain/config.json"
        previous_config = json.loads(config_file.read_text(encoding="utf-8"))
        settings_path = vault / ".claude/settings.json"
        original_settings = json.loads(settings_path.read_text(encoding="utf-8"))
        package = Path(__file__).resolve().parent
        updated_actions: list[str] = []

        if previous_config == config:
            settings = hook_settings(original_settings, config)
            if settings != original_settings:
                raise ValueError("owned hook settings changed; repair requires an explicit reviewed operation")
            if old_cron != new_cron:
                raise ValueError("owned schedule changed; repair requires an explicit reviewed operation")
            for name in ("runtime.py", "ctx_guard.py"):
                src_bytes = (package / name).read_bytes()
                dst_path = vault / ".second-brain/scripts" / name
                if dst_path.read_bytes() != src_bytes:
                    atomic_write_bytes(dst_path, src_bytes)
                    updated_actions.append(f"sync {name}")
            if not updated_actions:
                return {"status": "unchanged", "vault": str(vault), "actions": [], "integrations": integration_status}
            return {"status": "updated", "vault": str(vault), "host": config.get("host", "claude"),
                    "model": config["model"], "actions": updated_actions, "integrations": integration_status, "model_invoked": False}

        # Owned vault configuration update (e.g., host/model/schedules/timeout/allowances)
        for name in ("runtime.py", "ctx_guard.py"):
            src_bytes = (package / name).read_bytes()
            dst_path = vault / ".second-brain/scripts" / name
            if dst_path.read_bytes() != src_bytes:
                atomic_write_bytes(dst_path, src_bytes)
                updated_actions.append(f"update {name}")
        atomic_write_bytes(config_file, json_bytes(config))
        updated_actions.append("update .second-brain/config.json")
        new_settings = hook_settings(original_settings, config, update_existing=True)
        if new_settings != original_settings:
            atomic_write_bytes(settings_path, json_bytes(new_settings))
            updated_actions.append("update .claude/settings.json")
        if old_cron != new_cron:
            subprocess.run([config["crontab_bin"], "-"], input=new_cron, text=True, capture_output=True, check=True, timeout=15)
            updated_actions.append("update managed crontab block")
        return {"status": "updated", "vault": str(vault), "host": config.get("host", "claude"),
                "model": config["model"], "actions": updated_actions, "integrations": integration_status, "model_invoked": False}
    with tempfile.TemporaryDirectory(prefix=".second-brain-stage-", dir=vault.parent) as temporary:
        staging = Path(temporary)
        assets = assets if assets is not None else downloaded_assets(staging)
        files = installed_files(config, assets)
        prepared = staging / "vault"
        prepared.mkdir(mode=0o700)
        for folder in ("raw/sources", "raw/videos", "wiki/entities", "wiki/concepts", "wiki/sources", "wiki/syntheses", "wiki/projects", "wiki/tasks", "wiki/daily", "wiki/reports", "wiki/queries", "wiki/archive", "Logs"):
            (prepared / folder).mkdir(parents=True, exist_ok=True)
        for name, content in files.items():
            target = prepared / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            target.chmod(0o600)
        inbox_payload = json_bytes({"owner": "jeo-second-brain-v1", "vault": str(vault)})
        if vault in inbox.parents:
            relative_inbox = prepared / inbox.relative_to(vault)
            relative_inbox.mkdir(parents=True)
            (relative_inbox / ".second-brain-inbox.json").write_bytes(inbox_payload)
        created_vault = created_inbox = cron_attempted = False
        try:
            # Recheck all path boundaries after staging, then reserve the final
            # directory exclusively so another install cannot be overwritten.
            no_symlinks(vault)
            no_symlinks(inbox)
            if read_crontab(config["crontab_bin"]) != (old_cron, had_cron):
                raise RuntimeError("crontab changed during staging; retry installation")
            vault.mkdir(mode=0o700)
            created_vault = True
            for child in prepared.iterdir():
                child.rename(vault / child.name)
            if vault not in inbox.parents:
                inbox.mkdir(mode=0o700)
                created_inbox = True
                (inbox / ".second-brain-inbox.json").write_bytes(inbox_payload)
            cron_attempted = True
            subprocess.run([config["crontab_bin"], "-"], input=new_cron, text=True, capture_output=True, check=True, timeout=15)
        except BaseException as failure:
            rollback_errors = []
            if cron_attempted:
                try:
                    current, present = read_crontab(config["crontab_bin"])
                    if (current, present) != (old_cron, had_cron):
                        if current != new_cron:
                            raise RuntimeError("crontab concurrently changed; not overwriting unrelated entries")
                        args = [config["crontab_bin"], "-"] if had_cron else [config["crontab_bin"], "-r"]
                        subprocess.run(args, input=old_cron if had_cron else None, text=True, capture_output=True, check=True, timeout=15)
                except Exception as error:
                    rollback_errors.append(str(error))
            if not rollback_errors:
                if created_inbox:
                    rollback_errors.extend(rollback_tree(inbox, {".second-brain-inbox.json": inbox_payload}))
                if created_vault:
                    owned_files = dict(files)
                    if vault in inbox.parents:
                        owned_files[(inbox.relative_to(vault) / ".second-brain-inbox.json").as_posix()] = inbox_payload
                    rollback_errors.extend(rollback_tree(vault, owned_files))
            if rollback_errors:
                raise RuntimeError(f"installation failed: {failure}; rollback incomplete: {'; '.join(rollback_errors)}") from failure
            raise
    return {"status": "installed", "vault": str(vault), " actions" if False else "actions": actions, "integrations": integration_status, "model_invoked": False}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--source", help="self-contained checkout at the pinned upstream revision")
    parser.add_argument("--dry-run", action="store_true", help="read-only preview; no subprocess, download or writes")
    args = parser.parse_args(argv)
    try:
        source = absolute_path(args.source, "source") if args.source else None
        config_path = absolute_path(args.config, "config")
        config = validate_config(json.loads(config_path.read_text(encoding="utf-8")), source)
        print(json.dumps(install(config, source, args.dry_run), ensure_ascii=False))
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, zipfile.BadZipFile, SyntaxError, AttributeError) as error:
        print(json.dumps({"status": "error", "error": str(error)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
