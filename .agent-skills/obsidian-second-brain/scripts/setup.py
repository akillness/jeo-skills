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

UPSTREAM = "https://github.com/akillness/obsidian-second-brain"
REF = "c8b1d8c1c5b41d4f1845f7188200d354837be96f"
DEFAULT_SCHEDULES = {
    "scan": "* * * * *", "morning": "0 8 * * *", "nightly": "0 22 * * *",
    "weekly": "0 18 * * 5", "health": "0 21 * * 0",
}
COMMANDS = ("ingest", "daily", "reconcile", "synthesize", "recap", "health", "save")
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
    home = Path.home().resolve()
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
    model = config.get("model")
    if not isinstance(model, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]*", model):
        raise ValueError("explicit model identifier is required")
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
            if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]*", value):
                raise ValueError(f"explicit Graphify provider {key} identifier is required")
    schedules = config.get("schedules")
    if not isinstance(schedules, dict) or set(schedules) != set(DEFAULT_SCHEDULES):
        raise ValueError("schedules must specify scan, morning, nightly, weekly and health only")
    result.update(vault=str(vault), inbox=str(inbox), schedules={key: cron_expression(value) for key, value in schedules.items()})
    result["claude_bin"] = executable(config.get("claude_bin"), "claude")
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
        if previous != result:
            raise ValueError("owned rerun requires identical config; changing processing consent/targets needs a separate reviewed migration")
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


def hook_settings(settings: dict, config: dict) -> dict:
    settings = json.loads(json.dumps(settings))
    hooks = settings.setdefault("hooks", {})
    if not isinstance(hooks, dict) or not isinstance(hooks.get("PostCompact", []), list):
        raise ValueError("local hook settings have an invalid shape")
    command = runtime_command(config, "postcompact")
    entries = hooks.setdefault("PostCompact", [])
    if any(not isinstance(entry, dict) or not isinstance(entry.get("hooks"), list)
           or any(not isinstance(hook, dict) for hook in entry["hooks"]) for entry in entries):
        raise ValueError("PostCompact hook entries must contain hook lists")
    matching = [entry for entry in entries if any(hook.get("command") == command for hook in entry["hooks"])]
    if not matching:
        entries.append({"hooks": [{"type": "command", "command": command, "timeout": config["timeout_seconds"] + 30}]})
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
        return {"status": "dry-run", "vault": str(vault), "actions": actions,
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
        settings_path = vault / ".claude/settings.json"
        original = settings_path.read_bytes()
        settings = hook_settings(json.loads(original), config)
        if settings != json.loads(original):
            raise ValueError("owned hook settings changed; repair requires an explicit reviewed operation")
        if old_cron != new_cron:
            raise ValueError("owned schedule changed; repair requires an explicit reviewed operation")
        return {"status": "unchanged", "vault": str(vault), "actions": [], "integrations": integration_status}
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
    return {"status": "installed", "vault": str(vault), "actions": actions, "integrations": integration_status, "model_invoked": False}


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
