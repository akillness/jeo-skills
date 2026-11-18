#!/usr/bin/env python3
"""Provision, repair, and verify MCP servers (including Context7) across installed coding-agent hosts.

Hosts managed:
  - claude          (~/.claude.json -> mcpServers)
  - codex           (~/.codex/config.toml -> [mcp_servers.<name>])
  - gemini          (~/.gemini/settings.json -> mcpServers, strict: no toolTimeout)
  - antigravity-cli (~/.gemini/config/mcp_config.json -> mcpServers)
  - antigravity-ide (~/.gemini/antigravity/mcp_config.json; preserves symlink if linked to agy-cli)
  - cursor          (~/.cursor/mcp.json -> mcpServers)
  - opencode        (~/.config/opencode/opencode.json -> mcp.servers or mcp)
  - pi              (~/.pi/agent/mcp.json -> mcpServers, exposure: direct for context7/jeox)
  - gjc             (~/.gjc/agent/mcp.json -> mcpServers)
  - jeopi           (~/.jeopi/agent/mcp.json -> mcpServers)
  - aside           (~/.aside/u/*/settings.json -> read-only audit, never mutated)
"""
from __future__ import annotations

import argparse
import json
import os
import queue
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

try:
    import tomllib  # Python 3.11+
except ModuleNotFoundError:  # pragma: no cover
    tomllib = None  # type: ignore[assignment]


BARE_BIN_NAMES = ("zg", "aside", "uvx", "spec-kit-mcp", "headroom", "scrapling", "openspace-mcp", "jeox")
DIRECT_EXPOSURE_SERVERS = {"context7", "jeox"}


def _search_path(home: Path) -> str:
    py_bins = [str(p) for p in sorted(home.glob("Library/Python/*/bin"), reverse=True) if p.is_dir()]
    extra = [
        str(home / ".local/bin"),
        *py_bins,
        str(home / ".bun/bin"),
        str(home / ".cargo/bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
    ]
    base = os.environ.get("PATH", "")
    parts = [p for p in extra + base.split(os.pathsep) if p]
    deduped: list[str] = []
    for p in parts:
        if p not in deduped:
            deduped.append(p)
    return os.pathsep.join(deduped)


def resolve_stable_node(home: Path) -> str | None:
    """Resolve Node.js binary, preferring Homebrew stable symlink over Cellar version paths."""
    found = shutil.which("node", path=_search_path(home))
    if not found:
        return None
    if re.search(r"/Cellar/node[^/]*/[^/]+/bin/node$", found):
        real_found = os.path.realpath(found)
        for alias in ("/opt/homebrew/bin/node", "/usr/local/bin/node"):
            if Path(alias).exists() and os.path.realpath(alias) == real_found:
                return alias
    return found


def resolve_bin(name: str, home: Path) -> str | None:
    return shutil.which(name, path=_search_path(home))


def find_context7_entrypoint(home: Path) -> Path | None:
    prefix = home / ".local/share/jeo-skill/context7-mcp"
    pkg_dir = prefix / "node_modules/@upstash/context7-mcp"
    pkg_json = pkg_dir / "package.json"
    if pkg_json.is_file():
        try:
            meta = json.loads(pkg_json.read_text(encoding="utf-8"))
            bin_field = meta.get("bin")
            rel = None
            if isinstance(bin_field, str):
                rel = bin_field
            elif isinstance(bin_field, dict) and bin_field:
                rel = bin_field.get("context7-mcp") or next(iter(bin_field.values()))
            if isinstance(rel, str) and rel.strip():
                cand = (pkg_dir / rel).resolve()
                if cand.is_file():
                    return cand
        except (OSError, ValueError):
            pass
    default_js = pkg_dir / "dist/index.js"
    return default_js if default_js.is_file() else None


def provision_context7(home: Path, dry_run: bool = False, force: bool = False) -> dict[str, Any]:
    prefix = home / ".local/share/jeo-skill/context7-mcp"
    existing = find_context7_entrypoint(home)
    if existing and not force:
        return {"status": "already-installed", "entrypoint": str(existing), "prefix": str(prefix)}
    if dry_run:
        return {"status": "would-install", "prefix": str(prefix), "package": "@upstash/context7-mcp"}
    npm = resolve_bin("npm", home)
    if not npm:
        return {"status": "failed", "detail": "npm not found on PATH; cannot install @upstash/context7-mcp"}
    prefix.mkdir(parents=True, exist_ok=True)
    cmd = [
        npm, "install", "--prefix", str(prefix),
        "--no-save", "--ignore-scripts", "--no-audit", "--no-fund",
        "@upstash/context7-mcp",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"status": "failed", "detail": str(exc)}
    if proc.returncode != 0:
        return {"status": "failed", "detail": (proc.stderr or proc.stdout).strip()[-400:]}
    ep = find_context7_entrypoint(home)
    if not ep:
        return {"status": "failed", "detail": f"installed under {prefix} cleanly but entrypoint missing"}
    return {"status": "installed", "entrypoint": str(ep), "prefix": str(prefix)}


def resolve_jeox_cmd(home: Path, project: Path | None) -> tuple[str, list[str]] | None:
    """Resolve jeo-code's jeo-mem MCP command; .jeo/db/jeo.db is managed exclusively by ../jeo-code."""
    override = os.environ.get("JEO_CODE_ROOT")
    candidates: list[Path] = []
    if override is not None:
        raw = override.strip()
        if not raw or raw.lower() in {"none", "off", "skip"}:
            return None
        candidates.append(Path(raw).expanduser().resolve())
    else:
        if project is not None:
            candidates.append((project.resolve().parent / "jeo-code").resolve())
        candidates.append((Path(__file__).resolve().parents[2] / "jeo-code").resolve())
        candidates.append((home / ".jeo/global/node_modules/jeo-code").resolve())

    bun_bin = resolve_bin("bun", home)
    if bun_bin:
        for cand in candidates:
            mem_cli = cand / "packages/jeo-mem/src/cli.ts"
            if mem_cli.is_file():
                return bun_bin, [str(mem_cli.resolve()), "mcp"]
            jeo_entry = cand / "src/cli.ts"
            if (cand / "src/commands/jeox.ts").is_file() and jeo_entry.is_file():
                return bun_bin, [str(jeo_entry.resolve()), "jeox", "mcp"]

    if override is None:
        jeo_bin = resolve_bin("jeo", home)
        if jeo_bin:
            try:
                pkg_root = Path(jeo_bin).resolve().parent.parent
                if (pkg_root / "src/commands/jeox.ts").is_file():
                    return jeo_bin, ["jeox", "mcp"]
                if bun_bin and (pkg_root / "packages/jeo-mem/src/cli.ts").is_file():
                    return bun_bin, [str((pkg_root / "packages/jeo-mem/src/cli.ts").resolve()), "mcp"]
            except OSError:
                pass
    return None


def build_managed_specs(home: Path, project: Path | None) -> dict[str, dict[str, Any]]:
    specs: dict[str, dict[str, Any]] = {}

    node_bin = resolve_stable_node(home)
    ctx7_ep = find_context7_entrypoint(home)
    if node_bin and ctx7_ep:
        ctx_spec: dict[str, Any] = {"command": node_bin, "args": [str(ctx7_ep)]}
        api_key = os.environ.get("CONTEXT7_API_KEY", "").strip()
        if api_key:
            ctx_spec["env"] = {"CONTEXT7_API_KEY": api_key}
        specs["context7"] = ctx_spec

    os_bin = home / ".agents/venvs/openspace/bin/openspace-mcp"
    if not os_bin.is_file():
        resolved_os = resolve_bin("openspace-mcp", home)
        os_bin = Path(resolved_os) if resolved_os else os_bin
    if os_bin.is_file():
        skills_dir = str(Path(os.environ.get("SKILLS_ROOT") or (home / ".agents/skills")))
        os_ws = str(home / ".openspace/OpenSpace")
        specs["openspace"] = {
            "command": str(os_bin),
            "args": [],
            "env": {
                "OPENSPACE_HOST_SKILL_DIRS": skills_dir,
                "OPENSPACE_WORKSPACE": os_ws,
                "OPENSPACE_CLOUD_MODE": os.environ.get("OPENSPACE_CLOUD_MODE", "local"),
            },
        }

    jeox_cmd = resolve_jeox_cmd(home, project)
    if jeox_cmd:
        specs["jeox"] = {"command": jeox_cmd[0], "args": jeox_cmd[1]}

    zg_bin = resolve_bin("zg", home)
    if zg_bin:
        specs["zvec_grep"] = {"command": zg_bin, "args": ["server", "--stdio"]}

    aside_bin = resolve_bin("aside", home)
    if aside_bin:
        specs["aside"] = {"command": aside_bin, "args": ["mcp"]}

    uvx_bin = resolve_bin("uvx", home)
    if uvx_bin and resolve_bin("semble", home):
        specs["semble"] = {"command": uvx_bin, "args": ["--from", "semble[mcp]", "semble"]}

    hr_bin = resolve_bin("headroom", home)
    if hr_bin:
        specs["headroom"] = {"command": hr_bin, "args": ["mcp", "serve"]}

    return specs


def _atomic_write(path: Path, text: str, mode: int, validate) -> None:
    validate(text)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.tmp.", dir=path.parent)
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, mode)
        validate(tmp.read_text(encoding="utf-8"))
        if path.exists() or path.is_symlink():
            st = os.lstat(path)
            if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
                raise RuntimeError(f"refusing non-regular file target: {path}")
        os.replace(tmp, path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def _load_regular_text(path: Path) -> tuple[str | None, int]:
    if path.exists() or path.is_symlink():
        st = os.lstat(path)
        if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
            raise RuntimeError(f"refusing symlink or non-regular config: {path}")
        return path.read_text(encoding="utf-8"), stat.S_IMODE(st.st_mode)
    return None, 0o600


def _sanitize_env(env_obj: Any) -> dict[str, str]:
    if not isinstance(env_obj, dict):
        return {}
    return {str(k): str(v) for k, v in env_obj.items() if v is not None}


def _repair_entry(name: str, entry: dict[str, Any], home: Path, strip_timeout: bool = False) -> tuple[dict[str, Any], bool]:
    changed = False
    out = dict(entry)
    cmd = out.get("command")
    args = out.get("args")
    if isinstance(cmd, str):
        # Repair broken legacy /Users/.../.local/bin/ouroboros -> uvx isolated MCP runner
        if name in ("ouroboros", "ooo") and (cmd.endswith("/ouroboros") or cmd == "ouroboros") and not Path(cmd).exists():
            uvx = resolve_bin("uvx", home)
            if uvx:
                out["command"] = uvx
                out["args"] = ["--isolated", "--from", "ouroboros-ai[mcp]", "ouroboros", "mcp", "serve"]
                changed = True
        elif "/" not in cmd and cmd in BARE_BIN_NAMES:
            resolved = resolve_bin(cmd, home)
            if resolved:
                out["command"] = resolved
                changed = True
        elif "/" in cmd and not Path(cmd).exists():
            base = Path(cmd).name
            if base not in ("python", "python3", "node", "bash", "sh"):
                resolved = resolve_bin(base, home)
                if resolved:
                    out["command"] = resolved
                    changed = True
    elif isinstance(cmd, list) and cmd:
        first = str(cmd[0])
        if name in ("ouroboros", "ooo") and (first.endswith("/ouroboros") or first == "ouroboros") and not Path(first).exists():
            uvx = resolve_bin("uvx", home)
            if uvx:
                out["command"] = [uvx, "--isolated", "--from", "ouroboros-ai[mcp]", "ouroboros", "mcp", "serve"]
                changed = True
        elif "/" not in first and first in BARE_BIN_NAMES:
            resolved = resolve_bin(first, home)
            if resolved:
                out["command"] = [resolved, *cmd[1:]]
                changed = True
    if strip_timeout and "toolTimeout" in out:
        out.pop("toolTimeout", None)
        changed = True
    return out, changed


def _format_host_entry(host_kind: str, name: str, spec: dict[str, Any], existing: Any) -> dict[str, Any]:
    cmd = spec["command"]
    args = list(spec.get("args") or [])
    env = _sanitize_env(spec.get("env"))
    # Preserve existing non-empty user env vars (e.g. CONTEXT7_API_KEY already configured)
    if isinstance(existing, dict):
        old_env = _sanitize_env(existing.get("environment" if host_kind == "opencode" else "env"))
        for k, v in old_env.items():
            if k not in env and v:
                env[k] = v

    if host_kind == "opencode":
        out: dict[str, Any] = {"type": "local", "command": [cmd, *args]}
        if env:
            out["environment"] = env
        return out

    out = {"command": cmd, "args": args}
    if host_kind == "claude":
        out["type"] = "stdio"
    if env:
        out["env"] = env
    if host_kind == "pi" and name in DIRECT_EXPOSURE_SERVERS:
        out["exposure"] = "direct"
    return out


def _apply_json_host(
    home: Path,
    label: str,
    path: Path,
    gate: Path,
    host_kind: str,
    specs: dict[str, dict[str, Any]],
    repair: bool,
    apply: bool,
    shared_target: Path | None = None,
) -> dict[str, Any]:
    if shared_target is not None and path.is_symlink():
        if os.path.realpath(path) == os.path.realpath(shared_target):
            return {"host": label, "path": str(path), "status": "synced-via-symlink", "target": str(shared_target)}
        return {"host": label, "path": str(path), "status": "error", "detail": f"symlink points outside managed target: {path}"}

    if not (path.exists() or path.is_symlink()) and not gate.is_dir():
        return {"host": label, "path": str(path), "status": "skipped", "detail": "host directory not present"}

    raw_text, mode = _load_regular_text(path)
    data = json.loads(raw_text) if raw_text and raw_text.strip() else {}
    if not isinstance(data, dict):
        raise RuntimeError(f"unexpected root JSON object in {path}")

    repaired: list[str] = []
    updated: list[str] = []

    if host_kind == "opencode":
        mcp_obj = data.setdefault("mcp", {})
        if not isinstance(mcp_obj, dict):
            raise RuntimeError(f"unexpected 'mcp' object in {path}")
        v2_mode = isinstance(mcp_obj.get("servers"), dict)
        container = mcp_obj["servers"] if v2_mode else mcp_obj
        if repair:
            for k, val in list(container.items()):
                if isinstance(val, dict):
                    fixed, did = _repair_entry(k, val, home)
                    if did:
                        container[k] = fixed
                        repaired.append(k)
        for name, spec in specs.items():
            cur = container.get(name)
            entry = _format_host_entry("opencode", name, spec, cur)
            if not v2_mode:
                entry["enabled"] = True
            if cur != entry:
                container[name] = entry
                updated.append(name)
    else:
        servers = data.setdefault("mcpServers", {})
        if not isinstance(servers, dict):
            raise RuntimeError(f"unexpected 'mcpServers' object in {path}")
        strip_timeout = host_kind == "gemini"
        if repair:
            for k, val in list(servers.items()):
                if isinstance(val, dict):
                    fixed, did = _repair_entry(k, val, home, strip_timeout=strip_timeout)
                    if did:
                        servers[k] = fixed
                        repaired.append(k)
        for name, spec in specs.items():
            cur = servers.get(name)
            entry = _format_host_entry(host_kind, name, spec, cur)
            if cur != entry:
                servers[name] = entry
                updated.append(name)

    if not updated and not repaired:
        return {"host": label, "path": str(path), "status": "unchanged", "repaired": [], "updated": []}
    if apply:
        _atomic_write(path, json.dumps(data, indent=2) + "\n", mode, json.loads)
        return {"host": label, "path": str(path), "status": "applied", "repaired": repaired, "updated": updated}
    return {"host": label, "path": str(path), "status": "would-apply", "repaired": repaired, "updated": updated}


def _strip_toml_table(text: str, name: str) -> str:
    head = re.compile(r"^\s*\[\s*([^\]]+?)\s*\]\s*$")
    kept, skipping = [], False
    for line in text.splitlines(keepends=True):
        m = head.match(line)
        if m:
            key = m.group(1)
            skipping = key == name or key.startswith(name + ".")
        if not skipping:
            kept.append(line)
    return "".join(kept)


def _format_toml_table(name: str, spec: dict[str, Any]) -> str:
    lines = [
        f"[mcp_servers.{name}]",
        f"command = {json.dumps(spec['command'])}",
        f"args = {json.dumps(list(spec.get('args') or []))}",
    ]
    if name == "context7":
        lines.append("startup_timeout_sec = 20")
    elif name == "openspace":
        lines.append("startup_timeout_sec = 60")
        lines.append("tool_timeout_sec = 600")
    env = _sanitize_env(spec.get("env"))
    if env:
        pairs = ", ".join(f"{json.dumps(k)} = {json.dumps(v)}" for k, v in env.items())
        lines.append(f"env = {{ {pairs} }}")
    return "\n".join(lines) + "\n"


def _apply_codex(
    home: Path,
    specs: dict[str, dict[str, Any]],
    repair: bool,
    apply: bool,
    label: str = "codex",
    target_path: Path | None = None,
    gate_dir: Path | None = None,
) -> dict[str, Any]:
    path = target_path or (home / ".codex/config.toml")
    gate = gate_dir or path.parent
    if not (path.exists() or path.is_symlink()) and not gate.is_dir():
        return {"host": label, "path": str(path), "status": "skipped", "detail": "host directory not present"}
    if tomllib is None:
        return {"host": label, "path": str(path), "status": "error", "detail": "Python 3.11+ tomllib required"}

    text, mode = _load_regular_text(path)
    text = text or ""
    parsed = tomllib.loads(text) if text.strip() else {}
    existing_mcp = parsed.get("mcp_servers") if isinstance(parsed.get("mcp_servers"), dict) else {}

    updated: list[str] = []
    repaired: list[str] = []
    new_text = text

    if repair:
        for k, cur in list(existing_mcp.items()):
            if not isinstance(cur, dict):
                continue
            cmd = cur.get("command")
            if isinstance(cmd, str) and "/" not in cmd and cmd in BARE_BIN_NAMES and k not in specs:
                resolved = resolve_bin(cmd, home)
                if resolved:
                    fixed_spec = {"command": resolved, "args": list(cur.get("args") or []), "env": cur.get("env")}
                    new_text = _strip_toml_table(new_text, f"mcp_servers.{k}")
                    new_text = (new_text.rstrip("\n") + "\n\n" if new_text.strip() else "") + _format_toml_table(k, fixed_spec)
                    repaired.append(k)

    for name, spec in specs.items():
        cur = existing_mcp.get(name) if isinstance(existing_mcp.get(name), dict) else None
        merged = dict(spec)
        if cur and isinstance(cur.get("env"), dict):
            old_env = _sanitize_env(cur.get("env"))
            env_now = _sanitize_env(merged.get("env"))
            for k, v in old_env.items():
                if k not in env_now and v:
                    env_now[k] = v
            if env_now:
                merged["env"] = env_now
        cur_matches = (
            isinstance(cur, dict)
            and cur.get("command") == merged["command"]
            and list(cur.get("args") or []) == list(merged.get("args") or [])
            and _sanitize_env(cur.get("env")) == _sanitize_env(merged.get("env"))
        )
        if not cur_matches:
            new_text = _strip_toml_table(new_text, f"mcp_servers.{name}")
            new_text = (new_text.rstrip("\n") + "\n\n" if new_text.strip() else "") + _format_toml_table(name, merged)
            updated.append(name)

    if not updated and not repaired:
        return {"host": label, "path": str(path), "status": "unchanged", "repaired": [], "updated": []}
    tomllib.loads(new_text)
    if apply:
        _atomic_write(path, new_text, mode, tomllib.loads)
        return {"host": label, "path": str(path), "status": "applied", "repaired": repaired, "updated": updated}
    return {"host": label, "path": str(path), "status": "would-apply", "repaired": repaired, "updated": updated}


def probe_stdio_mcp(
    name: str,
    command: str,
    args: list[str],
    env: dict[str, str] | None = None,
    probe_context7: bool = False,
    timeout: float = 12.0,
) -> dict[str, Any]:
    """Perform a live JSON-RPC 2.0 stdio handshake and tools/list against an MCP server."""
    full_env = {**os.environ, **(env or {})}
    try:
        proc = subprocess.Popen(
            [command, *args],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=full_env,
        )
    except OSError as exc:
        return {"server": name, "ok": False, "error": str(exc), "tools": []}

    q: queue.Queue[str | None] = queue.Queue()

    def _reader() -> None:
        assert proc.stdout is not None
        try:
            for line in proc.stdout:
                q.put(line)
        finally:
            q.put(None)

    t = threading.Thread(target=_reader, daemon=True)
    t.start()

    def _send(obj: dict[str, Any]) -> None:
        assert proc.stdin is not None
        proc.stdin.write(json.dumps(obj) + "\n")
        proc.stdin.flush()

    def _recv_id(expected_id: int, deadline: float) -> dict[str, Any] | None:
        while time.monotonic() < deadline:
            rem = max(0.05, deadline - time.monotonic())
            try:
                line = q.get(timeout=min(0.5, rem))
            except queue.Empty:
                if proc.poll() is not None and q.empty():
                    return None
                continue
            if line is None:
                return None
            line = line.strip()
            if not line or not line.startswith("{"):
                continue
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            if msg.get("id") == expected_id:
                return msg
        return None

    out: dict[str, Any] = {"server": name, "command": command, "args": args, "ok": False, "tools": []}
    try:
        deadline = time.monotonic() + timeout
        _send({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "jeo-mcp-verifier", "version": "1.0.0"},
            },
        })
        init_resp = _recv_id(1, deadline)
        if not init_resp or "error" in init_resp:
            stderr_tail = proc.stderr.read()[:300] if proc.stderr and proc.poll() is not None else ""
            out["error"] = (init_resp or {}).get("error") or f"initialize timeout/EOF {stderr_tail}".strip()
            return out

        _send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        _send({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        tools_resp = _recv_id(2, time.monotonic() + max(5.0, timeout / 2))
        if not tools_resp or "error" in tools_resp:
            out["error"] = (tools_resp or {}).get("error") or "tools/list timeout/EOF"
            return out

        tools = [t_obj.get("name") for t_obj in tools_resp.get("result", {}).get("tools", []) if isinstance(t_obj, dict)]
        out["tools"] = tools
        out["ok"] = len(tools) > 0

        if probe_context7 and name == "context7" and "resolve-library-id" in tools:
            _send({
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "resolve-library-id",
                    "arguments": {"libraryName": "Next.js", "query": "middleware routing"},
                },
            })
            c7_resp = _recv_id(3, time.monotonic() + 12.0)
            query_probe = None
            if "query-docs" in tools:
                _send({
                    "jsonrpc": "2.0",
                    "id": 4,
                    "method": "tools/call",
                    "params": {
                        "name": "query-docs",
                        "arguments": {"libraryId": "/vercel/next.js", "query": "proxy middleware"},
                    },
                })
                q_resp = _recv_id(4, time.monotonic() + 12.0)
                query_probe = {
                    "called": "query-docs",
                    "responded": q_resp is not None,
                    "isError": bool(q_resp and q_resp.get("result", {}).get("isError")),
                    "preview": (
                        json.dumps(q_resp.get("result", {}).get("content", [])[:1], ensure_ascii=False)[:220]
                        if q_resp else None
                    ),
                }
            out["context7_probe"] = {
                "called": "resolve-library-id",
                "responded": c7_resp is not None,
                "isError": bool(c7_resp and c7_resp.get("result", {}).get("isError")),
                "preview": (
                    json.dumps(c7_resp.get("result", {}).get("content", [])[:1], ensure_ascii=False)[:220]
                    if c7_resp else None
                ),
                "query_docs": query_probe,
            }
        return out
    finally:
        for pipe in (proc.stdin, proc.stdout, proc.stderr):
            if pipe:
                try:
                    pipe.close()
                except OSError:
                    pass
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()


def _audit_aside_readonly(home: Path) -> list[dict[str, Any]]:
    reports = []
    for p in sorted(home.glob(".aside/u/*/settings.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            servers = (data.get("mcp") or {}).get("servers") or {}
            reports.append({
                "host": f"aside ({p.parent.name})",
                "path": str(p),
                "status": "read-only",
                "servers": sorted(servers.keys()) if isinstance(servers, dict) else [],
            })
        except (OSError, ValueError) as exc:
            reports.append({"host": f"aside ({p.parent.name})", "path": str(p), "status": "error", "detail": str(exc)})
    return reports


def _discover_claude_and_codex_targets(home: Path) -> tuple[list[tuple[str, Path, Path]], list[tuple[str, Path, Path]]]:
    """Return (claude_targets, codex_targets) including Orca profile homes inside `home`."""
    home_real = os.path.realpath(home)

    def _within_home(cand: Path) -> bool:
        try:
            r = os.path.realpath(cand)
            return r == home_real or r.startswith(home_real + os.sep)
        except OSError:
            return False

    claude_gate = home if (home / ".claude").is_dir() or resolve_bin("claude", home) else (home / ".claude")
    claude_list: list[tuple[str, Path, Path]] = [("claude", home / ".claude.json", claude_gate)]
    seen_c = {str((home / ".claude.json").resolve())}

    for p in sorted(home.glob("Library/Application Support/orca/claude-profiles/*/home/.claude.json")):
        key = str(p.resolve())
        if key not in seen_c:
            seen_c.add(key)
            tag = p.parent.parent.name[:8]
            claude_list.append((f"claude@orca-{tag}", p, p.parent))
    env_claude = os.environ.get("CLAUDE_CONFIG_DIR", "").strip()
    if env_claude:
        ep = Path(env_claude).expanduser() / ".claude.json"
        if ep.parent.is_dir() and _within_home(ep.parent) and str(ep.resolve()) not in seen_c:
            seen_c.add(str(ep.resolve()))
            claude_list.append(("claude@env", ep, ep.parent))

    codex_list: list[tuple[str, Path, Path]] = [("codex", home / ".codex/config.toml", home / ".codex")]
    seen_x = {str((home / ".codex/config.toml").resolve())}
    rt = home / ".codex-runtime/config.toml"
    if rt.exists() and str(rt.resolve()) not in seen_x:
        seen_x.add(str(rt.resolve()))
        codex_list.append(("codex-runtime", rt, rt.parent))
    for p in sorted(home.glob("Library/Application Support/orca/codex-accounts/*/home/config.toml")):
        key = str(p.resolve())
        if key not in seen_x:
            seen_x.add(key)
            tag = p.parent.parent.name[:8]
            codex_list.append((f"codex@orca-{tag}", p, p.parent))
    env_codex = os.environ.get("CODEX_HOME", "").strip()
    if env_codex:
        ep = Path(env_codex).expanduser() / "config.toml"
        if ep.parent.is_dir() and _within_home(ep.parent) and str(ep.resolve()) not in seen_x:
            seen_x.add(str(ep.resolve()))
            codex_list.append(("codex@env", ep, ep.parent))

    return claude_list, codex_list


def verify_hosts(home: Path, project: Path | None, specs: dict[str, dict[str, Any]], probe_context7: bool) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    xdg_config = Path(os.environ.get("XDG_CONFIG_HOME") or (home / ".config"))
    claude_targets, codex_targets = _discover_claude_and_codex_targets(home)
    host_files: list[tuple[str, Path, str, bool]] = []
    for label, p, gate in claude_targets:
        host_files.append((label, p, "json_mcpservers", gate.is_dir() or bool(resolve_bin("claude", home))))
    for label, p, gate in codex_targets:
        host_files.append((label, p, "toml_mcp", gate.is_dir()))
    host_files.extend([
        ("gemini", home / ".gemini/settings.json", "json_gemini", (home / ".gemini").is_dir()),
        ("antigravity-cli", home / ".gemini/config/mcp_config.json", "json_mcpservers", (home / ".gemini/config").is_dir()),
        ("antigravity-ide", home / ".gemini/antigravity/mcp_config.json", "json_mcpservers", (home / ".gemini/antigravity").is_dir()),
        ("cursor", home / ".cursor/mcp.json", "json_mcpservers", (home / ".cursor").is_dir()),
        ("opencode", xdg_config / "opencode/opencode.json", "json_opencode", (xdg_config / "opencode").is_dir()),
        ("pi", home / ".pi/agent/mcp.json", "json_mcpservers", (home / ".pi/agent").is_dir()),
        ("gjc", home / ".gjc/agent/mcp.json", "json_mcpservers", (home / ".gjc/agent").is_dir()),
        ("jeopi", home / ".jeopi/agent/mcp.json", "json_mcpservers", (home / ".jeopi/agent").is_dir()),
    ])
    for label, path, fmt, present in host_files:
        if not (path.exists() or path.is_symlink()) and not present:
            checks.append({"host": label, "path": str(path), "ok": True, "state": "not-installed"})
            continue
        if path.is_symlink() and not path.exists():
            checks.append({"host": label, "path": str(path), "ok": False, "state": "dangling-symlink"})
            continue
        if not path.exists():
            checks.append({"host": label, "path": str(path), "ok": False, "state": "missing-config"})
            continue
        try:
            text = path.resolve().read_text(encoding="utf-8") if label == "antigravity-ide" and path.is_symlink() else path.read_text(encoding="utf-8")
            if fmt == "toml_mcp":
                assert tomllib is not None
                servers = tomllib.loads(text).get("mcp_servers") or {}
            elif fmt == "json_opencode":
                mcp_obj = json.loads(text).get("mcp") or {}
                servers = mcp_obj.get("servers") if isinstance(mcp_obj.get("servers"), dict) else mcp_obj
            else:
                servers = json.loads(text).get("mcpServers") or {}
            missing = [s for s in ("context7", "openspace", "jeox") if s in specs and s not in servers]
            bad_bins = []
            third_party_warnings = []
            strict_errors = []
            for sname, cfg in servers.items():
                if not isinstance(cfg, dict):
                    continue
                if label == "gemini" and "toolTimeout" in cfg:
                    strict_errors.append(f"{sname}: unsupported toolTimeout in Gemini settings")
                cmd = cfg.get("command")
                bin_token = cmd[0] if isinstance(cmd, list) and cmd else cmd
                if isinstance(bin_token, str) and "/" in bin_token and not Path(bin_token).exists():
                    msg = f"{sname}: {bin_token} not found"
                    if sname in specs or sname in ("ouroboros", "ooo"):
                        bad_bins.append(msg)
                    else:
                        third_party_warnings.append(msg)
            ok = not missing and not bad_bins and not strict_errors
            checks.append({
                "host": label,
                "path": str(path),
                "ok": ok,
                "state": "ok" if ok else "issues",
                "configured_count": len(servers),
                "has_context7": "context7" in servers,
                "missing_core": missing,
                "missing_binaries": bad_bins,
                "third_party_warnings": third_party_warnings,
                "strict_errors": strict_errors,
            })
        except Exception as exc:  # noqa: BLE001
            checks.append({"host": label, "path": str(path), "ok": False, "state": "parse-error", "detail": str(exc)})

    probes = []
    for name, spec in specs.items():
        env = dict(spec.get("env") or {})
        if name == "jeox" and project:
            env.setdefault("JEOX_REPO", str(project))
        probes.append(probe_stdio_mcp(
            name,
            spec["command"],
            list(spec.get("args") or []),
            env=env,
            probe_context7=probe_context7,
        ))

    aside_reports = _audit_aside_readonly(home)
    hosts_ok = all(c["ok"] for c in checks)
    probes_ok = all(p["ok"] for p in probes)
    return {
        "ok": hosts_ok and probes_ok,
        "hosts": checks,
        "probes": probes,
        "aside_readonly": aside_reports,
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--home", default=str(Path.home()))
    p.add_argument("--project", help="optional checkout path (for ../jeo-code jeo-mem resolution)")
    p.add_argument("--provision-context7", action="store_true", help="install @upstash/context7-mcp locally (npm --ignore-scripts)")
    p.add_argument("--force-provision", action="store_true", help="reinstall @upstash/context7-mcp even if already installed")
    p.add_argument("--repair", action="store_true", help="repair broken ouroboros paths, bare binaries, and Gemini toolTimeout")
    p.add_argument("--apply", action="store_true", help="write host MCP configs (default is preview/dry-run)")
    p.add_argument("--dry-run", action="store_true", help="preview changes without mutating host configs")
    p.add_argument("--verify", action="store_true", help="verify host configs and run live stdio JSON-RPC probes")
    p.add_argument("--probe-context7", action="store_true", help="during --verify, also call Context7 resolve-library-id")
    p.add_argument("--json", action="store_true", help="emit JSON summary")
    args = p.parse_args(argv)

    home = Path(args.home).expanduser().resolve()
    project = Path(args.project).expanduser().resolve() if args.project else None
    apply = bool(args.apply and not args.dry_run)

    prov = None
    if args.provision_context7:
        prov = provision_context7(home, dry_run=not apply, force=args.force_provision)

    specs = build_managed_specs(home, project)
    xdg_config = Path(os.environ.get("XDG_CONFIG_HOME") or (home / ".config"))
    agi_cli = home / ".gemini/config/mcp_config.json"

    host_results: list[dict[str, Any]] = []
    if not args.verify or apply or args.repair:
        claude_targets, codex_targets = _discover_claude_and_codex_targets(home)
        json_targets: list[tuple[str, Path, Path, str, Path | None]] = [
            (label, path, gate, "claude", None) for (label, path, gate) in claude_targets
        ]
        json_targets.extend([
            ("gemini", home / ".gemini/settings.json", home / ".gemini", "gemini", None),
            ("antigravity-cli", agi_cli, home / ".gemini/config", "antigravity", None),
            ("antigravity-ide", home / ".gemini/antigravity/mcp_config.json", home / ".gemini/antigravity", "antigravity", agi_cli),
            ("cursor", home / ".cursor/mcp.json", home / ".cursor", "cursor", None),
            ("opencode", xdg_config / "opencode/opencode.json", xdg_config / "opencode", "opencode", None),
            ("pi", home / ".pi/agent/mcp.json", home / ".pi/agent", "pi", None),
            ("gjc", home / ".gjc/agent/mcp.json", home / ".gjc/agent", "gjc", None),
            ("jeopi", home / ".jeopi/agent/mcp.json", home / ".jeopi/agent", "jeopi", None),
        ])
        for label, path, gate, kind, shared in json_targets:
            try:
                host_results.append(_apply_json_host(home, label, path, gate, kind, specs, args.repair, apply, shared))
            except Exception as exc:  # noqa: BLE001
                host_results.append({"host": label, "path": str(path), "status": "error", "detail": str(exc)})
        for label, path, gate in codex_targets:
            try:
                host_results.append(_apply_codex(home, specs, args.repair, apply, label=label, target_path=path, gate_dir=gate))
            except Exception as exc:  # noqa: BLE001
                host_results.append({"host": label, "path": str(path), "status": "error", "detail": str(exc)})
        host_results.extend(_audit_aside_readonly(home))

    verify_out = verify_hosts(home, project, specs, args.probe_context7) if args.verify else None

    summary: dict[str, Any] = {
        "apply": apply,
        "context7_provision": prov,
        "managed_servers": {k: {"command": v["command"], "args": v.get("args", [])} for k, v in specs.items()},
        "host_updates": host_results,
        "verification": verify_out,
    }
    had_error = any(r.get("status") == "error" for r in host_results)
    if prov and prov.get("status") == "failed":
        had_error = True
    if verify_out and not verify_out.get("ok"):
        had_error = True

    if apply or args.verify:
        try:
            sdir = Path(os.environ.get("JEO_SKILL_STATE_DIR") or (home / ".local/state/jeo-skill"))
            sdir.mkdir(parents=True, exist_ok=True)
            os.chmod(sdir, 0o700)
            lpath = sdir / "workflow-events.jsonl"
            if not lpath.is_symlink():
                from datetime import datetime, timezone
                stage_name = "mcp-verify" if args.verify else "setup-mcp-hosts"
                entry = {
                    "v": 1,
                    "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "stage": stage_name,
                    "outcome": "failed" if had_error else "ok",
                    "flow_mode": "global",
                    "workflow_order": ["openspace", "rtk", "semble", "jev", "memory"],
                    "project": str(project) if project else None,
                    "host": "cli",
                    "servers": sorted(specs.keys()),
                    "hosts_verified": len((verify_out or {}).get("hosts") or host_results),
                }
                fd = os.open(str(lpath), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
                try:
                    os.write(fd, (json.dumps(entry, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8"))
                    os.fchmod(fd, 0o600)
                finally:
                    os.close(fd)
        except OSError:
            pass

    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        if prov:
            print(f"context7        {prov['status']:16} {prov.get('entrypoint') or prov.get('detail', '')}")
        for r in host_results:
            extra = f"updated={r.get('updated', [])} repaired={r.get('repaired', [])}" if "updated" in r else r.get("detail") or r.get("target") or str(r.get("servers", ""))
            print(f"{r['host']:16} {r['status']:18} {r['path']} {extra}")
        if verify_out:
            print("--- Host Verification ---")
            for c in verify_out["hosts"]:
                print(f"{c['host']:16} {c['state']:15} ctx7={c.get('has_context7')} {c.get('missing_binaries', []) or c.get('strict_errors', []) or ''}")
            print("--- Live Stdio MCP Probes ---")
            for pr in verify_out["probes"]:
                tools_str = ", ".join(pr["tools"][:6]) + ("..." if len(pr["tools"]) > 6 else "")
                print(f"{pr['server']:16} {'OK' if pr['ok'] else 'FAIL':5} tools={len(pr['tools'])} [{tools_str}] {pr.get('error', '')}")
                if "context7_probe" in pr:
                    print(f"  context7 probe: {json.dumps(pr['context7_probe'], ensure_ascii=False)}")
    return 1 if had_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
