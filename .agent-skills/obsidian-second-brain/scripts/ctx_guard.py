#!/usr/bin/env python3
"""Portable, NEW-vault-only ctx roles; never import or install a private ctx package.

CLI argv follow the inspected ctx layer contracts: mex-agent graph refresh/rebuild
--root ROOT --json; zg status ROOT --check-ready / index ROOT; graphify update ROOT
--force --no-cluster then cluster-only ROOT --no-viz. Only checkpoint rebuilds.
External indexer executables are trusted dependencies, not sandboxed processes.
No GC, archive, purge or raw move is performed. Retention is inventoried before
and after every invocation; preflight never invokes an indexer or provider.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import stat
import subprocess
import tempfile


SCOPES = ("all", "mex", "zvec", "vault", "graphify")
BINARIES = {"mex": ("mex_bin", "mex-agent"), "zvec": ("zvec_bin", "zg"),
            "graphify": ("graphify_bin", "graphify")}


def _within(path: Path, root: Path) -> bool:
    return path == root or root in path.parents


def _protected(path: Path) -> bool:
    return "raw" in path.parts or "Clippings" in path.parts


def _walk(root: Path):
    if not root.exists():
        return
    def fail(error):
        raise error
    yield from os.walk(root, followlinks=False, onerror=fail)


def raw_inventory(vault: Path) -> dict:
    """Hash ALL raw bytes, including stale/video and archived-root sources.

    Directory aliases are refused rather than silently omitted from the proof.
    File symlinks are inventoried with their target bytes and link identity.
    """
    vault = Path(vault).resolve()
    entries = []
    for directory, dirs, files in _walk(vault):
        for name in sorted(dirs + files):
            path = Path(directory) / name
            relative = path.relative_to(vault)
            if path.is_symlink() and path.is_dir():
                raise PermissionError("directory symlink prevents complete raw inventory: " + str(path))
            resolved = path.resolve()
            protected = _protected(relative)
            if _within(resolved, vault):
                protected = protected or _protected(resolved.relative_to(vault))
            if not protected or path.is_dir():
                continue
            if not _within(resolved, vault):
                raise PermissionError("raw symlink escapes NEW vault: " + str(path))
            info = path.stat()
            if not stat.S_ISREG(info.st_mode):
                raise PermissionError("non-regular raw source cannot be inventoried: " + str(path))
            digest = hashlib.sha256()
            with path.open("rb") as handle:
                for block in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(block)
            entry = {"path": relative.as_posix(), "size": info.st_size,
                     "sha256": digest.hexdigest()}
            if path.is_symlink():
                entry["link"] = os.readlink(path)
            entries.append(entry)
    entries.sort(key=lambda entry: entry["path"])
    encoded = json.dumps(entries, sort_keys=True, separators=(",", ":")).encode()
    return {"vault": str(vault), "count": len(entries),
            "sha256": hashlib.sha256(encoded).hexdigest(), "entries": entries}


class RawGuard:
    """Reject raw/ancestor mutations, resolved aliases, and raw hardlink aliases."""

    def __init__(self, vault: Path):
        self.vault = Path(vault).resolve()
        self.protected_paths = {self.vault / "raw", self.vault / "Clippings"}
        self.protected_inodes = set()
        for directory, dirs, files in _walk(self.vault):
            for name in dirs + files:
                path = Path(directory) / name
                if _protected(path.relative_to(self.vault)):
                    self.protected_paths.add(path.resolve())
                    if path.is_file():
                        info = path.stat()
                        self.protected_inodes.add((info.st_dev, info.st_ino))

    def check_path(self, path, operation: str = "delete", *, ancestors: bool = True) -> None:
        absolute = Path(path).absolute()
        resolved = absolute.resolve()
        if not _within(absolute, self.vault) or not _within(resolved, self.vault):
            raise PermissionError(operation + " outside NEW vault refused: " + str(absolute))
        if _protected(absolute.relative_to(self.vault)) or _protected(resolved.relative_to(self.vault)):
            raise PermissionError(operation + " raw-exempt path refused: " + str(absolute))
        if ancestors and any(_within(protected, resolved) for protected in self.protected_paths):
            raise PermissionError(operation + " ancestor containing raw refused: " + str(absolute))
        if resolved.is_file():
            info = resolved.stat()
            if (info.st_dev, info.st_ino) in self.protected_inodes:
                raise PermissionError(operation + " raw hardlink alias refused: " + str(absolute))
        if ancestors and resolved.is_dir():
            for directory, dirs, files in _walk(resolved):
                for name in dirs + files:
                    child = Path(directory) / name
                    if child.is_symlink():
                        raise PermissionError(operation + " aliased mutation tree refused: " + str(child))
                    if _protected(child.relative_to(self.vault)):
                        raise PermissionError(operation + " ancestor containing raw refused: " + str(absolute))


def check_config(config: dict, *, require_vault: bool = True) -> dict:
    """Read-only dependency/configuration preflight; supports an uncreated vault."""
    value = config.get("vault")
    if not isinstance(value, str):
        raise ValueError("explicit NEW vault path required")
    vault = Path(value).expanduser()
    if not vault.is_absolute() or vault != vault.resolve():
        raise ValueError("NEW vault must be an absolute, resolved, non-symlink path")
    if config.get("version") != 1 or config.get("consent", {}).get("data") is not True:
        raise PermissionError("ctx requires version 1 configuration and explicit data consent")
    integrations = config.get("integrations", {})
    if integrations.get("ctx") is not True:
        raise PermissionError("ctx integration is not enabled")
    if require_vault:
        marker = vault / ".second-brain" / "config.json"
        if marker.resolve() != marker or not marker.is_file():
            raise PermissionError("NEW vault configuration marker required, without symlinks")
        persisted = json.loads(marker.read_text(encoding="utf-8"))
        if persisted != config:
            raise PermissionError("persisted NEW vault configuration is authoritative; mismatch refused")
    binaries = {}
    for name, (key, executable) in BINARIES.items():
        if integrations.get(name) is not True:
            continue
        configured = config.get(key)
        found = configured or shutil.which(executable)
        if not found or not Path(found).is_absolute():
            raise RuntimeError("ctx prerequisite unavailable: " + executable + " executable required")
        path = Path(found).resolve()
        if not path.is_file() or not os.access(path, os.X_OK):
            raise RuntimeError("ctx prerequisite unavailable: executable " + str(path))
        binaries[name] = str(path)
    return {"vault": str(vault), "binaries": binaries,
            "gc": "disabled_raw_retention", "private_ctx_required": False}


def _run(argv: list[str], vault: Path, timeout: float, *, ready_probe: bool = False) -> dict:
    environment = dict(os.environ)
    environment.pop("GRAPHIFY_OUT", None)
    environment.update(LLM_WIKI_VAULT=str(vault), CTX_VAULT=str(vault),
                       GRAPHIFY_NO_BACKUP="1", GRAPHIFY_NO_TIPS="1")
    process = subprocess.Popen(argv, cwd=vault, env=environment, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except BaseException:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate()
        raise
    if process.returncode not in ((0, 1) if ready_probe else (0,)):
        raise RuntimeError("ctx command failed: " + json.dumps(
            {"argv": argv, "returncode": process.returncode, "stderr": stderr[-2000:]}))
    return {"argv": argv, "returncode": process.returncode,
            "stdout": stdout, "stderr": stderr}


def _write_json(path: Path, value: dict, guard: RawGuard) -> None:
    guard.check_path(path, "write")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".ctx-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, sort_keys=True, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        guard.check_path(path, "replace")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _prune_graph(vault: Path, guard: RawGuard) -> dict:
    path = vault / "graphify-out" / "graph.json"
    guard.check_path(path, "reconcile")
    graph = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(graph, dict) or not isinstance(graph.get("nodes"), list):
        raise ValueError("Graphify graph.json must contain a nodes array")
    protected = set()
    for entry in sorted((path.parent / "cache/semantic").glob("*.json")):
        cached = json.loads(entry.read_text(encoding="utf-8"))
        if not isinstance(cached, dict) or not isinstance(cached.get("nodes", []), list):
            raise ValueError("invalid Graphify semantic cache; reconciliation refused")
        for node in cached.get("nodes", []):
            if not isinstance(node, dict) or "id" not in node:
                raise ValueError("invalid Graphify semantic cache node; reconciliation refused")
            protected.add(str(node["id"]))
    dead = set()
    for node in graph["nodes"]:
        source = node.get("source_file")
        if not source or node.get("file_type") in ("semantic", "rationale", "community") or str(node["id"]) in protected:
            continue
        candidate = Path(source)
        if not candidate.is_absolute():
            candidate = vault / candidate
        if not candidate.exists():
            dead.add(str(node["id"]))
    graph["nodes"] = [node for node in graph["nodes"] if str(node["id"]) not in dead]
    for key in ("links", "edges"):
        if key in graph:
            graph[key] = [edge for edge in graph[key]
                          if str(edge["source"]) not in dead and str(edge["target"]) not in dead]
    if "hyperedges" in graph:
        graph["hyperedges"] = [edge for edge in graph["hyperedges"]
                               if not any(str(node) in dead for node in edge.get("nodes", []))]
    _write_json(path, graph, guard)
    return {"evicted_dead_sources": len(dead), "nodes_retained": len(graph["nodes"])}


def _execute(config: dict, command: str, scope: str) -> dict:
    verified = check_config(config)
    vault = Path(verified["vault"])
    layers = ["vault"] + list(verified["binaries"]) if scope == "all" else [scope]
    if any(layer != "vault" and layer not in verified["binaries"] for layer in layers):
        raise PermissionError("requested scope is not enabled in persisted configuration")
    before = raw_inventory(vault)
    guard = RawGuard(vault)
    commands, pending, errors = [], [], []
    timeout = config.get("timeout_seconds", 120)
    executed = False
    try:
        for layer in layers:
            if layer == "vault":
                executed = True
                _write_json(vault / ".second-brain/ctx/raw-manifest.json", before, guard)
                continue
            binary = verified["binaries"][layer]
            if layer in ("mex", "zvec"):
                index = vault / (".mex" if layer == "mex" else ".zvec-grep")
                if not index.is_dir():
                    pending.append({"layer": layer, "state": "pending_initialization",
                                    "reason": "index creation requires separate approval"})
                    continue
                guard.check_path(index, "index update")
            if layer == "mex":
                executed = True
                try:
                    result = _run([binary, "graph", "rebuild" if command == "checkpoint" else "refresh",
                                   "--root", str(vault), "--json"], vault, timeout)
                    data = json.loads(result["stdout"])
                except (RuntimeError, json.JSONDecodeError):
                    result = _run([binary, "graph"], vault, timeout)
                    data = {"state": "succeeded"}
                if data.get("state") not in (None, "succeeded") or data.get("error"):
                    raise RuntimeError("mex graph operation failed: " + result["stdout"])
                commands.append(result)
            elif layer == "zvec":
                executed = True
                if command == "checkpoint":
                    commands.append(_run([binary, "index", str(vault)], vault, timeout))
                result = _run([binary, "status", str(vault), "--check-ready"], vault, timeout, ready_probe=True)
                commands.append(result)
                if result["returncode"] == 1:
                    pending.append({"layer": layer, "state": "pending_refresh", "reason": "index not ready"})
            elif command == "checkpoint":
                provider = config.get("graphify_provider", {})
                if (config.get("consent", {}).get("graphify_provider") is not True
                        or not isinstance(provider, dict)
                        or any(not isinstance(provider.get(key), str) or not provider[key].strip()
                               for key in ("backend", "model"))
                        or provider.get("accept_unbounded_cost") is not True):
                    pending.append({"layer": "graphify", "state": "pending_consent",
                                    "reason": "separate backend/model and unbounded-cost approval required"})
                    raise PermissionError("Graphify provider approval is separate from the Claude model/budget")
                guard.check_path(vault / "graphify-out", "Graphify checkpoint")
                executed = True
                commands.append(_run([binary, "update", str(vault), "--force", "--no-cluster"], vault, timeout))
                reconciliation = _prune_graph(vault, guard)
                commands.append(_run([binary, "cluster-only", str(vault), "--no-viz",
                                      "--backend=" + provider["backend"],
                                      "--model=" + provider["model"]], vault, timeout))
                commands.append({"reconciliation": reconciliation})
            else:
                pending.append({"layer": "graphify", "state": "checkpoint_only",
                                "reason": "refresh never rebuilds Graphify"})
    except Exception as exc:
        # Provider/schema failures must still produce the after-retention proof.
        errors.append(str(exc))
    try:
        after = raw_inventory(vault)
        retained = before == after
    except (OSError, ValueError) as exc:
        after, retained = None, False
        errors.append("after-inventory failed: " + str(exc))
    if not retained:
        errors.append("RAW RETENTION BREACH: before/after raw inventories differ")
    return {"returncode": 1 if errors else 0, "executed": executed, "command": command,
            "scope": scope, "raw_before": before, "raw_after": after, "retained": retained,
            "pending": pending, "commands": commands, "errors": errors,
            "gc": "disabled_raw_retention", "state": "failed" if errors else "pending" if pending else "refreshed"}


def refresh(config: dict) -> dict:
    return _invoke(config, "refresh")


def checkpoint(config: dict) -> dict:
    return _invoke(config, "checkpoint")


def _invoke(config: dict, command: str) -> dict:
    # Persisted configuration owns layer selection, never arbitrary in-memory flags.
    check_config(config)
    result = _execute(config, command, "all")
    if result["returncode"]:
        raise RuntimeError("ctx integration failed: " + json.dumps(result, sort_keys=True))
    return result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--scope", choices=SCOPES, default="all")
    parser.add_argument("--command", choices=("refresh", "checkpoint"), default="refresh")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    try:
        config = json.loads(args.config.read_text(encoding="utf-8"))
        if args.check:
            result = dict(check_config(config, require_vault=False), returncode=0,
                          executed=False, raw_before=raw_inventory(Path(config["vault"])))
        else:
            result = _execute(config, args.command, args.scope)
    except (OSError, ValueError, RuntimeError) as exc:
        result = {"returncode": 1, "executed": False, "error": str(exc)}
    print(json.dumps(result, sort_keys=True))
    return result["returncode"]


if __name__ == "__main__":
    raise SystemExit(main())
