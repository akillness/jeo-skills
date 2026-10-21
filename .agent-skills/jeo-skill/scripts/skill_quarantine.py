"""Safe, reversible quarantine for unused catalog skill installations."""

from __future__ import annotations

import hashlib
import json
import stat
import os
import secrets
import shutil
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterable

sys.dont_write_bytecode = True

from install_support import (  # type: ignore[import-not-found]
    MAX_FINGERPRINT_BYTES,
    _retired_reason,
    require_safe_path,
)
from skill_usage import _parse_datetime, iso, now, state_dir  # type: ignore[import-not-found]


CATALOG_SOURCE = "akillness/jeo-skills"
_PLAN_HEADINGS: dict[tuple[str, str], str] = {}


def _absolute(path: Path | str) -> Path:
    return Path(os.path.abspath(os.path.expanduser(str(path))))


def _boundary_for(root: Path) -> Path:
    """Choose the same lexical boundary used by the router's root sweeps."""
    root = _absolute(root)
    home_path = _absolute(Path.home())
    cwd = _absolute(Path.cwd())
    if root == home_path or home_path in root.parents:
        return home_path
    if root == cwd or cwd in root.parents:
        return cwd
    return home_path


def _first_h1(path: Path) -> str | None:
    try:
        info = os.lstat(path)
    except OSError:
        return None
    if path.is_symlink() or not path.is_file() or info.st_size > MAX_FINGERPRINT_BYTES:
        return None
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    parts = text.split("---", 2) if text.startswith("---") else []
    body = parts[2] if len(parts) == 3 else text
    return next((line.rstrip() for line in body.splitlines() if line.startswith("# ")), None)


def reference_headings(
    catalog_source: str,
    names: Iterable[str],
    *,
    home: Path | None = None,
) -> dict[str, str | None]:
    """Return provable catalog H1 fingerprints for each requested skill."""
    home_path = _absolute(home or Path.home())
    source_path = _absolute(catalog_source) if not str(catalog_source).startswith(("http://", "https://")) else None
    local_root: Path | None = None
    if source_path is not None and source_path.is_file():
        local_root = source_path.parent

    lock: dict[str, Any] = {}
    if local_root is None:
        lock_path = home_path / ".agents" / ".skill-lock.json"
        try:
            payload = json.loads(lock_path.read_text(encoding="utf-8"))
            if isinstance(payload, dict) and isinstance(payload.get("skills"), dict):
                lock = payload["skills"]
        except (OSError, json.JSONDecodeError):
            lock = {}

    result: dict[str, str | None] = {}
    for name in dict.fromkeys(map(str, names)):
        skill_path: Path | None
        if local_root is not None:
            skill_path = local_root / name / "SKILL.md"
        else:
            entry = lock.get(name)
            if not isinstance(entry, dict) or entry.get("source") != CATALOG_SOURCE:
                result[name] = None
                continue
            skill_path = home_path / ".agents" / "skills" / name / "SKILL.md"
        result[name] = _first_h1(skill_path)
    return result


def _root_issue(root: Path, boundary: Path) -> str | None:
    if root != boundary and boundary not in root.parents:
        return f"root is outside boundary {boundary}"
    try:
        require_safe_path(root, boundary)
    except (OSError, ValueError) as error:
        return str(error)
    return None


def _candidate_name_safe(name: str) -> bool:
    return bool(name) and name not in {".", ".."} and Path(name).name == name and "/" not in name and "\\" not in name


def plan_quarantine(
    names: Iterable[str],
    roots: Iterable[Path],
    headings: dict[str, str | None],
) -> list[dict]:
    """Plan safe quarantine candidates without touching the filesystem."""
    unique_names = list(dict.fromkeys(map(str, names)))
    unique_roots = list(dict.fromkeys(map(_absolute, roots)))

    plan: list[dict] = []
    for root in unique_roots:
        boundary = _boundary_for(root)
        issue = _root_issue(root, boundary)
        if issue is not None:
            plan.append({"skill": "<root>", "path": str(root), "action": "kept", "reason": issue})
            continue
        for name in unique_names:
            if not _candidate_name_safe(name):
                plan.append({"skill": name, "path": str(root / name), "action": "kept", "reason": "unsafe skill name"})
                continue
            candidate = root / name
            if not os.path.lexists(candidate):
                continue
            heading = headings.get(name)
            if heading is None:
                plan.append({
                    "skill": name,
                    "path": str(candidate),
                    "action": "kept",
                    "reason": "unprovable catalog identity",
                })
                continue
            try:
                reason = _retired_reason(candidate, name, heading)
            except (OSError, ValueError) as error:
                reason = str(error)
            if reason is None:
                _PLAN_HEADINGS[(str(candidate), name)] = heading
                plan.append({
                    "skill": name,
                    "path": str(candidate),
                    "action": "would-quarantine",
                    "reason": "provable catalog copy",
                })
            else:
                plan.append({"skill": name, "path": str(candidate), "action": "kept", "reason": reason})
    return plan


def _tree_hash(root: Path) -> str:
    """Hash sorted relative POSIX entries (directories, including empty ones, and file
    bytes); reject links and special files so a hash proves a complete faithful copy."""
    root = _absolute(root)
    try:
        root_info = os.lstat(root)
    except OSError as error:
        raise ValueError(f"unsafe skill tree: {root}") from error
    if stat.S_ISLNK(root_info.st_mode) or not stat.S_ISDIR(root_info.st_mode):
        raise ValueError(f"unsafe skill tree: {root}")
    entries: list[tuple[str, Path | None]] = []
    for path in root.rglob("*"):
        try:
            info = os.lstat(path)
        except OSError as error:
            raise ValueError(f"unsupported tree entry: {path}") from error
        mode = info.st_mode
        if stat.S_ISLNK(mode):
            raise ValueError(f"symlink in skill tree: {path}")
        relative = path.relative_to(root).as_posix()
        if stat.S_ISREG(mode):
            entries.append((relative, path))
        elif stat.S_ISDIR(mode):
            entries.append((relative + "/", None))
        else:
            raise ValueError(f"unsupported tree entry: {path}")
    digest = hashlib.sha256()
    for relative, path in sorted(entries, key=lambda entry: entry[0]):
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        if path is not None:
            with path.open("rb") as stream:
                while chunk := stream.read(1024 * 1024):
                    digest.update(chunk)
        digest.update(b"\0")
    return digest.hexdigest()


def _copy_tree_exact(source: Path, destination: Path) -> None:
    """Full-fidelity copy into an existing empty directory: every file (runtime artifacts
    such as .DS_Store/__pycache__ included) and every empty directory; links rejected."""
    for base, directories, files in os.walk(source, followlinks=False):
        relative = Path(base).relative_to(source)
        target = destination / relative
        for name in directories:
            entry = Path(base) / name
            if entry.is_symlink():
                raise ValueError(f"symlink in skill tree: {entry}")
            (target / name).mkdir(mode=0o700)
            shutil.copystat(entry, target / name)
        for name in files:
            entry = Path(base) / name
            if entry.is_symlink() or not entry.is_file():
                raise ValueError(f"unsupported tree entry: {entry}")
            shutil.copy2(entry, target / name, follow_symlinks=False)


def _atomic_json(path: Path, data: dict) -> None:
    path = _absolute(path)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    temp = Path(temp_name)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        try:
            temp.unlink()
        except FileNotFoundError:
            pass


def _batch_id(created_at: datetime) -> str:
    return created_at.strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(3)


def _safe_label(skill: str) -> str:
    label = "".join(char if char.isalnum() or char in "._-" else "_" for char in skill)
    return label or "skill"


def _reject_linked_ancestors(path: Path) -> None:
    # macOS commonly exposes /var as a system symlink; reject only the configured
    # state component itself and the quarantine component, not OS mount aliases.
    absolute = _absolute(path)
    if absolute.is_symlink():
        raise ValueError(f"Refusing symlink state path: {absolute}")


def _quarantine_root(create: bool) -> Path:
    state = _absolute(state_dir(create=False))
    _reject_linked_ancestors(state)
    if create:
        state = _absolute(state_dir(create=True))
        _reject_linked_ancestors(state)
    root = state / "quarantine"
    _reject_linked_ancestors(root)
    if create:
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(root, 0o700)
    return root


class _SourceCleanupIncomplete(RuntimeError):
    """A verified destination exists, but deleting the source was incomplete."""

def _move_tree_exclusive(source: Path, destination: Path, expected: str) -> None:
    """Move/copy a whole tree without replacing an existing destination."""
    same_device = os.stat(source.parent).st_dev == os.stat(destination.parent).st_dev
    os.mkdir(destination, 0o700)
    if same_device:
        # The destination directory itself is the exclusive claim; rename replaces only
        # that empty directory, never an unclaimed path.
        if any(destination.iterdir()):
            raise FileExistsError(f"destination claim was populated: {destination}")
        try:
            os.rename(source, destination)
        except Exception:
            try:
                if destination.is_dir() and not destination.is_symlink() and not any(destination.iterdir()):
                    destination.rmdir()
            except OSError:
                pass
            raise
        if _tree_hash(destination) != expected:
            raise ValueError("tree hash verification failed")
        return

    # Cross-device copies are built in a private staging sibling, then published
    # into the reserved empty claim. Never recursively delete a public destination.
    stage = destination.parent / f".{destination.name}.staging-{secrets.token_hex(6)}"
    os.mkdir(stage, 0o700)
    try:
        _copy_tree_exact(source, stage)
        if _tree_hash(stage) != expected or _tree_hash(source) != expected:
            raise ValueError("copy verification failed")
        if any(destination.iterdir()):
            raise FileExistsError(f"destination claim was populated: {destination}")
        os.rename(stage, destination)
    except Exception:
        if stage.is_dir() and not stage.is_symlink():
            try:
                shutil.rmtree(stage)
            except OSError:
                pass
        raise
    try:
        shutil.rmtree(source)
    except Exception as error:
        raise _SourceCleanupIncomplete(str(error)) from error




def quarantine(plan: list[dict], *, review: dict, apply: bool, reason: str) -> dict:
    """Preview or apply a write-ahead, reversible quarantine plan."""
    selected = [item for item in plan if item.get("action") == "would-quarantine"]
    timestamp = now()
    created_at = iso(timestamp)
    if not apply:
        return {
            "version": 1,
            "batch": None,
            "created_at": created_at,
            "review": review,
            "reason": reason,
            "apply": False,
            "items": [dict(item) for item in selected],
            "kept": [dict(item) for item in plan if item.get("action") != "would-quarantine"],
        }

    batch = _batch_id(timestamp)
    quarantine_root = _quarantine_root(create=True)
    batch_root = quarantine_root / batch
    batch_root.mkdir(mode=0o700)
    items_root = batch_root / "items"
    items_root.mkdir(mode=0o700)
    manifest_items: list[dict] = []
    prepared: list[tuple[dict, Path, Path, str, str]] = []
    errors: list[dict[str, str]] = []

    # Preflight every item before the write-ahead manifest or any move.
    for index, raw_item in enumerate(selected):
        name = str(raw_item.get("skill", ""))
        source = _absolute(str(raw_item.get("path", "")))
        stored_rel = f"items/{index:04d}-{_safe_label(name)}-{secrets.token_hex(4)}"
        destination = batch_root / stored_rel
        item = {
            "skill": name,
            "original": str(source),
            "stored": stored_rel,
            "sha256": "",
            "reason": reason,
            "state": "pending",
        }
        manifest_items.append(item)
        heading = _PLAN_HEADINGS.get((str(source), name))
        try:
            if not isinstance(heading, str) or not heading:
                raise ValueError("missing catalog heading for TOCTOU check")
            boundary = _boundary_for(source.parent)
            issue = _root_issue(source.parent, boundary)
            if issue is not None:
                raise ValueError(issue)
            if _retired_reason(source, name, heading) is not None:
                raise ValueError("fingerprint changed before move")
            tree_hash = _tree_hash(source)
            item["sha256"] = tree_hash
            prepared.append((item, source, destination, heading, tree_hash))
        except Exception as error:
            errors.append({"skill": name, "path": str(source), "error": str(error)})

    manifest = {
        "version": 1,
        "batch": batch,
        "created_at": created_at or "",
        "review": dict(review),
        "items": manifest_items,
    }
    manifest["reason"] = reason
    if errors:
        manifest["errors"] = errors
    try:
        _atomic_json(batch_root / "manifest.json", manifest)
    except Exception as error:
        # No destructive operation occurs before this succeeds.
        try:
            shutil.rmtree(batch_root)
        except OSError:
            pass
        manifest["error"] = f"initial manifest write failed: {error}"
        return manifest
    if errors:
        return manifest

    for item, source, destination, heading, tree_hash in prepared:
        try:
            # TOCTOU checks happen immediately before the destructive move.
            if os.stat(source.parent).st_dev != os.stat(destination.parent).st_dev:
                item["state"] = "quarantine-cleanup-pending"
                _atomic_json(batch_root / "manifest.json", manifest)
            if _retired_reason(source, item["skill"], heading) is not None:
                raise ValueError("fingerprint changed before move")
            if _tree_hash(source) != tree_hash:
                raise ValueError("source tree changed before move")
            _move_tree_exclusive(source, destination, tree_hash)
            item["state"] = "quarantined"
            _atomic_json(batch_root / "manifest.json", manifest)
        except Exception as error:
            if isinstance(error, _SourceCleanupIncomplete):
                item["state"] = "quarantined-source-cleanup-incomplete"
            errors.append({"skill": item["skill"], "path": item["original"], "error": str(error)})
            manifest["errors"] = errors
            try:
                _atomic_json(batch_root / "manifest.json", manifest)
            except Exception:
                pass
            break
    return manifest


def _read_manifest(batch_root: Path) -> dict | None:
    path = batch_root / "manifest.json"
    try:
        if path.is_symlink() or not path.is_file():
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    return payload


def _normalize_pending(batch_root: Path, manifest: dict) -> None:
    for item in manifest.get("items", []):
        if not isinstance(item, dict) or item.get("state") != "pending":
            continue
        stored = _absolute(batch_root / str(item.get("stored", "")))
        original = _absolute(str(item.get("original", "")))
        if not os.path.lexists(stored) and os.path.lexists(original):
            item["state"] = "not-moved"


def _batches(root: Path) -> Iterable[tuple[Path, dict]]:
    if not root.is_dir() or root.is_symlink():
        return
    for batch_root in sorted(root.iterdir(), key=lambda path: path.name):
        if not batch_root.is_dir() or batch_root.is_symlink():
            continue
        manifest = _read_manifest(batch_root)
        if manifest is not None:
            yield batch_root, manifest


def list_batches() -> list[dict]:
    root = _quarantine_root(create=False)
    batches: list[dict] = []
    for batch_root, manifest in _batches(root):
        _normalize_pending(batch_root, manifest)
        batches.append(manifest)
    return batches


def _restore_item(batch_root: Path, manifest: dict, item: dict, apply: bool) -> dict:
    batch = str(manifest.get("batch", batch_root.name))
    name = str(item.get("skill", ""))
    original = _absolute(str(item.get("original", "")))
    stored_rel = str(item.get("stored", ""))
    stored = _absolute(batch_root / stored_rel)
    result = {"batch": batch, "skill": name, "path": str(original)}
    if item.get("restored") or item.get("state") == "restored":
        result.update({"action": "kept", "reason": "already restored"})
        return result
    if item.get("state") == "not-moved":
        result.update({"action": "kept", "reason": "not-moved"})
        return result
    if item.get("state") in {"restored-source-cleanup-incomplete", "restore-cleanup-pending"}:
        result.update({"action": "kept", "reason": "partial original remains; manual review required"})
        return result
    if not os.path.lexists(stored) and os.path.lexists(original) and item.get("state") == "pending":
        item["state"] = "not-moved"
        result.update({"action": "kept", "reason": "not-moved"})
        return result
    if os.path.lexists(original):
        result.update({"action": "kept", "reason": "original path exists"})
        return result
    try:
        if not stored.is_relative_to(batch_root) or stored == batch_root:
            raise ValueError("stored path escapes batch")
        require_safe_path(stored, batch_root)
        boundary = _boundary_for(original.parent)
        if _root_issue(original.parent, boundary) is not None:
            raise ValueError("original path is outside its safety boundary")
        if not stored.is_dir() or stored.is_symlink():
            raise ValueError("stored tree is missing or unsafe")
        expected = str(item.get("sha256", ""))
        before = _tree_hash(stored)
        if before != expected:
            raise ValueError("stored tree hash mismatch")
        result["action"] = "would-restore"
        if not apply:
            return result
        if os.stat(stored.parent).st_dev != os.stat(original.parent).st_dev:
            item["state"] = "restore-cleanup-pending"
            _atomic_json(batch_root / "manifest.json", manifest)
        require_safe_path(original.parent, boundary)
        original.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        # This claims original with mkdir and therefore cannot replace a concurrent install.
        _move_tree_exclusive(stored, original, expected)
        item["state"] = "restored"
        item["restored_at"] = iso(now())
        result["action"] = "restored"
        return result
    except _SourceCleanupIncomplete:
        item["state"] = "restored-source-cleanup-incomplete"
        result.update({"action": "kept", "reason": "partial original remains; manual review required"})
        return result
    except Exception as error:
        # _move_tree_exclusive only removes destinations it successfully claimed.
        result.update({"action": "kept", "reason": str(error)})
        return result


def restore(*, batch: str | None = None, skill: str | None = None, apply: bool) -> list[dict]:
    """Restore one batch or all matching skill items, refusing overwrite."""
    root = _quarantine_root(create=False)
    selected: list[tuple[Path, dict]] = []
    for batch_root, manifest in _batches(root):
        _normalize_pending(batch_root, manifest)
        if batch and batch_root.name != batch:
            continue
        if any(
            isinstance(item, dict) and (skill is None or item.get("skill") == skill)
            for item in manifest.get("items", [])
        ):
            selected.append((batch_root, manifest))
    results: list[dict] = []
    changed: set[Path] = set()
    for batch_root, manifest in selected:
        for item in manifest.get("items", []):
            if not isinstance(item, dict) or (skill is not None and item.get("skill") != skill):
                continue
            before_state = item.get("state")
            result = _restore_item(batch_root, manifest, item, apply)
            results.append(result)
            if apply and (result.get("action") == "restored" or item.get("state") != before_state):
                changed.add(batch_root)
        if apply and batch_root in changed:
            try:
                _atomic_json(batch_root / "manifest.json", manifest)
            except Exception:
                pass
    return results




def purge(*, older_than_days: int, apply: bool) -> list[dict]:
    """Preview or permanently remove quarantine batches older than a threshold."""
    if older_than_days < 0:
        raise ValueError("older_than_days must be non-negative")
    cutoff = now() - timedelta(days=older_than_days)
    root = _quarantine_root(create=False)
    candidates: list[tuple[Path, dict]] = []
    for batch_root, manifest in _batches(root):
        created = _parse_datetime(manifest.get("created_at"))
        if created is not None and created < cutoff:
            candidates.append((batch_root, manifest))
    results: list[dict] = []
    for batch_root, manifest in candidates:
        item = {
            "batch": str(manifest.get("batch", batch_root.name)),
            "created_at": manifest.get("created_at"),
            "action": "would-purge" if not apply else "purged",
        }
        if apply:
            try:
                require_safe_path(batch_root, root)
                shutil.rmtree(batch_root)
            except Exception as error:
                item["action"] = "kept"
                item["reason"] = str(error)
        results.append(item)
    return results


__all__ = [
    "reference_headings",
    "plan_quarantine",
    "quarantine",
    "list_batches",
    "restore",
    "purge",
]
