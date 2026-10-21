"""Local, privacy-preserving skill invocation usage collection.

The collectors intentionally record only invocation/load evidence: Skill tool calls,
slash-command markers, SKILL.md reads, and Jev injected names.  Free-form prompt or
assistant text is never written to state.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import sys
import tempfile
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator

try:
    import fcntl
except ImportError:  # non-POSIX: scans are not serialized
    fcntl = None  # type: ignore[assignment]

sys.dont_write_bytecode = True

STATE_DIR_ENV = "JEO_SKILL_STATE_DIR"
NOW_ENV = "JEO_SKILL_NOW"
ROUTER_SKILL = "jeo-skill"
PROTECTED_BUNDLES = ("starter", "cli-core", "infrastructure-core")
DEFAULT_GRACE_DAYS = 30
MAX_LINE_BYTES = 8 * 1024 * 1024
MAX_FILES = 100_000  # per store root; reaching it marks the source incomplete (an error)


# ----------------------------- state helpers -----------------------------


def state_dir(create: bool = False) -> Path:
    """Return the state directory, creating it with private permissions if asked."""
    configured = os.environ.get(STATE_DIR_ENV)
    if configured:
        path = Path(configured).expanduser()
    else:
        path = Path(os.environ.get("XDG_STATE_HOME", "~/.local/state")).expanduser() / "jeo-skill"
    if create:
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            os.chmod(path, 0o700)
        except OSError:
            pass
    return path


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        result = value
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        # Milliseconds are used by Claude; seconds are used by several JSONL stores.
        number = float(value)
        if number > 10_000_000_000:
            number /= 1000.0
        try:
            result = datetime.fromtimestamp(number, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            result = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            try:
                return _parse_datetime(float(text))
            except ValueError:
                return None
    else:
        return None
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    return result.astimezone(timezone.utc)


def now() -> datetime:
    """Return an aware UTC clock, honoring the test override when valid."""
    override = os.environ.get(NOW_ENV)
    if override:
        parsed = _parse_datetime(override)
        if parsed is not None:
            return parsed
    return datetime.now(timezone.utc)


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    parsed = _parse_datetime(value)
    return parsed.isoformat().replace("+00:00", "Z") if parsed else None


def read_state(name: str, default: Any) -> Any:
    try:
        path = state_dir(False) / name
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return default


def write_state(name: str, data: Any) -> Path:
    directory = state_dir(True)
    target = directory / name
    fd, temporary = tempfile.mkstemp(prefix=f".{target.name}.", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, target)
        try:
            os.chmod(target, 0o600)
        except OSError:
            pass
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
    return target


def load_policy() -> dict:
    value = read_state("policy.json", {})
    if not isinstance(value, dict):
        value = {}
    keep = value.get("keep", [])
    if not isinstance(keep, list):
        keep = []
    keep = sorted({str(item) for item in keep if isinstance(item, str) and item})
    try:
        grace = int(value.get("grace_days", DEFAULT_GRACE_DAYS))
    except (TypeError, ValueError):
        grace = DEFAULT_GRACE_DAYS
    return {"version": 1, "keep": keep, "grace_days": max(0, grace)}


def set_keep(names: list[str], keep: bool) -> dict:
    policy = load_policy()
    current = set(policy["keep"])
    if keep:
        current.update(name for name in names if isinstance(name, str) and name)
    else:
        current.difference_update(name for name in names if isinstance(name, str))
    policy["keep"] = sorted(current)
    write_state("policy.json", policy)
    return policy


# ----------------------------- catalog helpers -----------------------------


def _catalog_names(catalog: dict) -> set[str]:
    skills = catalog.get("skills", []) if isinstance(catalog, dict) else []
    if isinstance(skills, dict):
        values = skills.keys()
    else:
        values = (item.get("name") for item in skills if isinstance(item, dict))
    return {str(name) for name in values if isinstance(name, str) and name}


def protected_names(catalog: dict) -> dict[str, str]:
    names = _catalog_names(catalog)
    protected: dict[str, str] = {}
    if ROUTER_SKILL in names:
        protected[ROUTER_SKILL] = "router"
    bundles = catalog.get("bundles", {}) if isinstance(catalog, dict) else {}
    if isinstance(bundles, dict):
        for bundle in PROTECTED_BUNDLES:
            members = bundles.get(bundle, [])
            if isinstance(members, dict):
                members = members.keys()
            for name in members if isinstance(members, (list, tuple, set)) else []:
                if name in names:
                    protected.setdefault(name, f"bundle:{bundle}")
    policy = load_policy()
    for name in policy["keep"]:
        if name in names:
            protected.setdefault(name, "keep")
    relevance = read_state("relevance.json", {})
    entries = relevance.get("protect", {}) if isinstance(relevance, dict) else {}
    if isinstance(entries, dict):
        for name, value in entries.items():
            if name in names and isinstance(value, dict):
                repo = value.get("repo")
                protected.setdefault(name, f"relevance:{repo}" if repo else "relevance:")
    return protected


# ----------------------------- event extraction -----------------------------


def _name_from_value(value: Any, names: set[str]) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip().strip("'\"`")
    if text.endswith("/SKILL.md") or text.endswith("\\SKILL.md"):
        text = text.replace("\\", "/").rsplit("/", 2)[-2]
    text = text.lstrip("/")
    if text.startswith("ns:"):
        text = text[3:]
    if text in names:
        return text
    # Some command fields contain a path plus shell punctuation.
    match = re.search(r"(?:^|[/\\])([^/\\\s'\"`]+)[/\\]SKILL\.md(?:$|[\s'\"`])", value)
    if match and match.group(1) in names:
        return match.group(1)
    return None


def _path_skill(value: Any, names: set[str]) -> str | None:
    """Skill named by a SKILL.md load path; catalog-source reads are maintenance, not use.

    `<checkout>/.agent-skills/<name>/SKILL.md` is the jeo-skills catalog source layout: agents
    read it to edit or validate the catalog, so it never counts as an operational load.
    """
    if not isinstance(value, str) or "SKILL.md" not in value:
        return None
    normalized = value.replace("\\", "/")
    match = re.search(r"(?:^|[/\s'\"`])([^/\s'\"`]+)/SKILL\.md(?:$|[\s'\"`])", normalized)
    if not match or match.group(1) not in names:
        return None
    prefix = normalized[:match.start(1)]
    if prefix.endswith(".agent-skills/") and (len(prefix) == len(".agent-skills/")
                                              or prefix[-len(".agent-skills/") - 1] in "/ \t'\"`"):
        return None
    return match.group(1)


def _iter_dicts(value: Any, limit: int = 1000) -> Iterable[dict[str, Any]]:
    seen = 0
    stack = [value]
    while stack and seen < limit:
        current = stack.pop()
        if isinstance(current, dict):
            seen += 1
            yield current
            stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current[:limit])


def _event_time(value: Any, fallback: datetime | None = None) -> datetime | None:
    if isinstance(value, dict):
        for key in ("timestamp", "time", "at", "createdAt", "created_at", "time_created", "timeCreated", "lastUsedAt"):
            parsed = _parse_datetime(value.get(key))
            if parsed:
                return parsed
    return fallback


def _add_event(events: dict[str, dict[str, Any]], name: str, when: datetime | None) -> None:
    if name not in events:
        events[name] = {"count": 0, "first": when, "last": when}
    item = events[name]
    item["count"] += 1
    if when and (item["first"] is None or when < item["first"]):
        item["first"] = when
    if when and (item["last"] is None or when > item["last"]):
        item["last"] = when


def _merge_highwater(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    if not left:
        return {"count": int(right.get("count", 0)), "first": right.get("first"), "last": right.get("last")}
    firsts = [x for x in (left.get("first"), right.get("first")) if x]
    lasts = [x for x in (left.get("last"), right.get("last")) if x]
    return {
        "count": max(int(left.get("count", 0)), int(right.get("count", 0))),
        "first": min(firsts) if firsts else None,
        "last": max(lasts) if lasts else None,
    }


def _serialise_contrib(contrib: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {name: {"count": int(item.get("count", 0)), "first": iso(item.get("first")), "last": iso(item.get("last"))}
            for name, item in contrib.items() if int(item.get("count", 0)) > 0}


def _deserialise_contrib(value: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(value, dict):
        return {}
    output: dict[str, dict[str, Any]] = {}
    for name, item in value.items():
        if not isinstance(item, dict):
            continue
        try:
            count = int(item.get("count", 0))
        except (TypeError, ValueError):
            continue
        if count > 0:
            output[name] = {"count": count, "first": _parse_datetime(item.get("first")), "last": _parse_datetime(item.get("last"))}
    return output


def _head_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        digest.update(handle.read(4096))
    return digest.hexdigest()


def _files_under(root: Path, predicate: Callable[[str], bool]) -> list[Path]:
    if not root.is_dir() or root.is_symlink():
        return []
    found: list[Path] = []
    for base, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = [name for name in dirs if name != "__pycache__"]
        for name in files:
            if predicate(name):
                found.append(Path(base) / name)
                if len(found) >= MAX_FILES:
                    return sorted(found)
    return sorted(found)


def _iter_strings(value: Any, limit: int = 1000) -> Iterable[str]:
    seen = 0
    stack = [value]
    while stack and seen < limit:
        current = stack.pop()
        if isinstance(current, str):
            seen += 1
            yield current
        elif isinstance(current, dict):
            stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current[:limit])


def _parser_codex(value: Any, when: datetime | None, events: dict[str, dict[str, Any]]) -> int:
    """Codex records each command once as a completed `CommandExecution` item whose
    `parsed_cmd` classifies it; only successful `read` entries of a SKILL.md path are loads
    (search/list/unknown shell commands that merely mention a SKILL.md path are not)."""
    count = 0
    for item in _iter_dicts(value):
        commands = item.get("parsed_cmd")
        if not isinstance(commands, list) or item.get("status") == "failed":
            continue
        if isinstance(item.get("exit_code"), int) and item["exit_code"] != 0:
            continue
        for command in commands:
            if not isinstance(command, dict) or command.get("type") != "read":
                continue
            name = _path_skill(command.get("path"), _parser_codex.names)
            if name:
                _add_event(events, name, when)
                count += 1
    return count


# Mutable function attribute avoids passing names through every parser callback.
_parser_codex.names = set()  # type: ignore[attr-defined]


def _parser_claude_projects(value: Any, when: datetime | None, events: dict[str, dict[str, Any]]) -> int:
    count = 0
    for item in _iter_dicts(value):
        if item.get("name") == "Skill" and isinstance(item.get("input"), dict):
            name = _name_from_value(item["input"].get("skill"), _parser_claude_projects.names)
            if name:
                _add_event(events, name, when)
                count += 1
    for text in _iter_strings(value):
        match = re.fullmatch(r"<command-name>\s*/([^<\s]+)</command-name>", text.strip())
        if match:
            name = _name_from_value(match.group(1), _parser_claude_projects.names)
            if name:
                _add_event(events, name, when)
                count += 1
    return count


_parser_claude_projects.names = set()  # type: ignore[attr-defined]


# ----------------------------- incremental JSONL cursors -----------------------------


READ_CHUNK = 4 * 1024 * 1024


def _prefilter_tokens(parser: Callable[..., int]) -> tuple[bytes, ...]:
    """Byte tokens a line must contain to be decoded; empty means every line is decoded."""
    return tuple(token.encode("utf-8") for token in getattr(parser, "prefilter", ()))


def _json_line(line: bytes) -> Any:
    if len(line) > MAX_LINE_BYTES:
        return None
    try:
        return json.loads(line)
    except UnicodeDecodeError:
        try:
            return json.loads(line.decode("utf-8", errors="replace"))
        except ValueError:
            return None
    except ValueError:
        return None


def _parse_jsonl(path: Path, parser: Callable[[Any, datetime | None, dict[str, dict[str, Any]]], int],
                 prefilter: tuple[bytes, ...], start: int = 0,
                 prefix_digest: str | None = None) -> tuple[dict[str, dict[str, Any]], int, int, str] | None:
    """Parse complete lines; returns events, records, the offset after the last consumed
    line, and the SHA-256 of bytes [0, offset).

    The file is read in large blocks: hashing and the byte prefilter run in C over each
    block, and only lines containing a prefilter match are sliced out and decoded. With
    `start` > 0, bytes [0, start) are only hashed and must equal `prefix_digest`, else None
    is returned and the caller re-parses in full (any earlier rewrite invalidates the
    offset). A trailing line without a newline is consumed only when it is complete JSON,
    so a line caught mid-write is re-read next scan. Lines longer than MAX_LINE_BYTES are
    skipped without being held in memory whole.
    """
    events: dict[str, dict[str, Any]] = {}
    fallback = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    digest = hashlib.sha256()

    def scan_block(block: bytes) -> int:
        count = 0
        if not prefilter:
            for line in block.split(b"\n"):
                if (value := _json_line(line)) is not None:
                    count += parser(value, _event_time(value, fallback), events)
            return count
        # One bytes.find per token, each advancing monotonically (a regex alternation is
        # several times slower), and one parse per matching line: the scan resumes after
        # the line just parsed, so a line repeating a token is not visited match by match.
        nexts = [block.find(token) for token in prefilter]
        while (hit := min((n for n in nexts if n >= 0), default=-1)) >= 0:
            begin = block.rfind(b"\n", 0, hit) + 1
            position = block.find(b"\n", hit) + 1  # blocks always end with a newline
            if (value := _json_line(block[begin:position - 1])) is not None:
                count += parser(value, _event_time(value, fallback), events)
            nexts = [n if n < 0 or n >= position else block.find(token, position)
                     for token, n in zip(prefilter, nexts)]
        return count

    records = 0
    offset = start
    with path.open("rb") as handle:
        remaining = start
        while remaining and (chunk := handle.read(min(READ_CHUNK, remaining))):
            digest.update(chunk)
            remaining -= len(chunk)
        if start and (remaining or digest.hexdigest() != prefix_digest):
            return None
        carry = b""
        skipping = False  # inside a line longer than MAX_LINE_BYTES
        while chunk := handle.read(READ_CHUNK):
            if skipping:
                newline = chunk.find(b"\n")
                cut = len(chunk) if newline < 0 else newline + 1
                digest.update(chunk[:cut])
                offset += cut
                chunk, skipping = chunk[cut:], newline < 0
            data = carry + chunk if carry else chunk
            last = data.rfind(b"\n")
            if last < 0:
                carry = data
            else:
                block, carry = data[:last + 1], data[last + 1:]
                digest.update(block)
                offset += len(block)
                records += scan_block(block)
            if len(carry) > MAX_LINE_BYTES:
                digest.update(carry)
                offset += len(carry)
                carry, skipping = b"", True
        if carry and (not prefilter or any(token in carry for token in prefilter)) and (value := _json_line(carry)) is not None:
            digest.update(carry)  # complete final line without a newline
            offset += len(carry)
            records += parser(value, _event_time(value, fallback), events)
    return events, records, offset, digest.hexdigest()


def _file_contributions(source: str, files: list[Path], parser: Callable[..., int], names: set[str], cursor: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], int, str | None]:
    """Per-file contributions with an incremental cursor.

    Unchanged files (same inode, size, mtime) are not opened. A changed file whose bytes
    before the saved offset still hash to the saved digest has only its new tail parsed.
    Anything else is re-parsed in full and merged high-water with its history (same inode
    live last scan, or same path whose old inode is gone). Vanished files keep their
    contribution.
    """
    all_entries = cursor.setdefault("files", {})
    for key in [key for key, entry in all_entries.items() if entry.get("superseded")]:
        del all_entries[key]  # legacy flag: merged into a successor, carries nothing
    if hasattr(parser, "names"):
        parser.names = names  # type: ignore[attr-defined]
    prefilter = _prefilter_tokens(parser)
    live_by_inode: dict[tuple[int, int], str] = {}
    by_path: dict[str, str] = {}
    for key, entry in all_entries.items():
        if entry.get("source") != source:
            continue
        if not entry.get("retired") and entry.get("ino"):
            live_by_inode[(entry.get("dev"), entry.get("ino"))] = key
        by_path[entry.get("path")] = key
    current_keys: set[str] = set()
    source_error: str | None = None
    observed: list[tuple[Path, os.stat_result]] = []
    for path in files:
        try:
            observed.append((path, path.stat()))
        except OSError as error:
            source_error = str(error)
    live_inodes = {(int(info.st_dev), int(info.st_ino)) for _path, info in observed if info.st_ino}
    for path, info in observed:
        dev, ino = int(info.st_dev), int(info.st_ino)
        size, mtime_ns = int(info.st_size), int(info.st_mtime_ns)
        previous_key = live_by_inode.get((dev, ino)) if ino else None
        if previous_key is None:
            candidate = by_path.get(str(path))
            old = all_entries.get(candidate) if candidate else None
            if old and (old.get("dev"), old.get("ino")) not in live_inodes:
                previous_key = candidate
        existing = all_entries.get(previous_key) if previous_key else None
        if existing is None:
            previous_key = None  # e.g. a hard link whose entry another path already replaced
        if (existing and (existing.get("dev"), existing.get("ino")) == (dev, ino)
                and existing.get("size") == size and existing.get("mtime_ns") == mtime_ns):
            existing["path"] = str(path)
            existing["retired"] = False
            current_keys.add(previous_key)
            continue
        try:
            head = _head_hash(path)
            offset = existing.get("offset") if existing else None
            parsed = None
            if isinstance(offset, int) and 0 < offset <= size and existing.get("digest"):
                # Only the bytes after the saved offset are parsed, and only if every byte
                # before it still hashes to the saved digest.
                parsed = _parse_jsonl(path, parser, prefilter, offset, existing["digest"])
            if parsed is not None:
                events, records, end, digest = parsed
                contribution = _deserialise_contrib(existing.get("contribution"))
                for name, item in events.items():
                    old = contribution.get(name, {"count": 0, "first": None, "last": None})
                    contribution[name] = {"count": old["count"] + item["count"],
                                          "first": min([x for x in (old["first"], item["first"]) if x], default=None),
                                          "last": max([x for x in (old["last"], item["last"]) if x], default=None)}
                records += int(existing.get("records", 0))
            else:
                contribution, records, end, digest = _parse_jsonl(path, parser, prefilter)
                if existing:
                    for name, item in _deserialise_contrib(existing.get("contribution")).items():
                        contribution[name] = _merge_highwater(item, contribution.get(name, {}))
        except (OSError, UnicodeError, ValueError, TypeError) as error:
            source_error = str(error)
            continue
        key = f"{source}|{dev}|{ino}|{head}" if ino else f"{source}|{path}|{head}"
        if previous_key and previous_key != key:
            del all_entries[previous_key]  # merged into this entry
        all_entries[key] = {
            "source": source, "path": str(path), "dev": dev, "ino": ino, "head": head,
            "digest": digest, "offset": end, "size": size, "mtime_ns": mtime_ns,
            "records": int(records), "contribution": _serialise_contrib(contribution), "retired": False,
        }
        current_keys.add(key)
    for key, entry in all_entries.items():
        if entry.get("source") == source and key not in current_keys:
            entry["retired"] = True
    # Distinct files are summed; only byte-identical copies (same whole-file digest and size)
    # are counted once. Inode numbers are not an identity across scans because they get reused.
    selected: list[dict[str, Any]] = []
    seen_copies: set[tuple[Any, ...]] = set()
    for entry in all_entries.values():
        if entry.get("source") != source:
            continue
        digest, size = entry.get("digest"), entry.get("size")
        # The digest covers bytes [0, offset): it proves a copy only when the whole file was
        # consumed. Entries without an offset predate incremental parsing and hashed it all.
        if digest and entry.get("offset", size) == size:
            if (digest, size) in seen_copies:
                continue
            seen_copies.add((digest, size))
        selected.append(entry)
    combined: dict[str, dict[str, Any]] = {}
    records_total = 0
    for entry in selected:
        records_total += int(entry.get("records", 0))
        for name, item in _deserialise_contrib(entry.get("contribution")).items():
            combined[name] = {
                "count": int(combined.get(name, {}).get("count", 0)) + int(item.get("count", 0)),
                "first": min([x for x in (combined.get(name, {}).get("first"), item.get("first")) if x], default=None),
                "last": max([x for x in (combined.get(name, {}).get("last"), item.get("last")) if x], default=None),
            }
    return combined, records_total, source_error


def _file_source(source: str, files: list[Path], parser: Callable[..., int], names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    if not files:
        historical, records, _ = _file_contributions(source, files, parser, names, cursor)
        return {"available": False, "records": records, "window": _window(historical), "error": "store not found", "counts": historical}
    counts, records, error = _file_contributions(source, files, parser, names, cursor)
    if len(files) >= MAX_FILES:
        # A truncated listing could hide later loads; the error makes `--apply` refuse.
        limit = f"file limit {MAX_FILES} reached; later files were not scanned"
        error = f"{error}; {limit}" if error else limit
    return {"available": True, "records": records, "window": _window(counts), "error": error, "counts": counts}


def _window(counts: dict[str, dict[str, Any]]) -> list[str | None]:
    values = [item.get("first") for item in counts.values() if item.get("first")] + [item.get("last") for item in counts.values() if item.get("last")]
    return [iso(min(values)) if values else None, iso(max(values)) if values else None]


# ----------------------------- source collectors -----------------------------


CLAUDE_DIRS_ENV = "JEO_SKILL_CLAUDE_CONFIG_DIRS"


def _claude_config_dirs(cursor: dict[str, Any]) -> list[Path]:
    """CLAUDE_CONFIG_DIR profile roots: the active one, `JEO_SKILL_CLAUDE_CONFIG_DIRS`
    (os.pathsep-separated), and every profile a previous scan saw. Remembering them lets a
    scheduled scan without the variable still read profile-only Claude records."""
    remembered = cursor.get("claude_config_dirs")
    candidates = [item for item in remembered if isinstance(item, str)] if isinstance(remembered, list) else []
    configured = [os.environ.get("CLAUDE_CONFIG_DIR", "")] + os.environ.get(CLAUDE_DIRS_ENV, "").split(os.pathsep)
    for raw in configured:
        raw = raw.strip()
        if raw:
            resolved = os.path.realpath(os.path.expanduser(raw))
            if resolved not in candidates:
                candidates.append(resolved)
    kept = [item for item in candidates if os.path.isdir(item)]
    cursor["claude_config_dirs"] = kept
    return [Path(item) for item in kept]


def _distinct(paths: Iterable[Path]) -> list[Path]:
    """Existing paths resolved through links, each physical store once."""
    seen: set[str] = set()
    result: list[Path] = []
    for path in paths:
        resolved = os.path.realpath(path)
        if resolved not in seen and os.path.exists(resolved):
            seen.add(resolved)
            result.append(Path(resolved))
    return result


def _read_skillusage(path: Path, names: set[str]) -> dict[str, dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    usage = data.get("skillUsage", {})
    if not isinstance(usage, dict):
        raise ValueError(f"skillUsage is not an object in {path}")
    counts: dict[str, dict[str, Any]] = {}
    for raw_name, info in usage.items():
        if not isinstance(info, dict):
            continue
        name = _name_from_value(raw_name, names)
        if not name:
            continue
        try:
            count = max(0, int(info.get("usageCount", 0)))
        except (TypeError, ValueError):
            continue
        if count > 0:
            when = _parse_datetime(info.get("lastUsedAt"))
            counts[name] = _merge_highwater(counts.get(name, {}), {"count": count, "first": when, "last": when})
    return counts


def _collect_claude_skillusage(home: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    """Claude's cumulative `skillUsage` counters from the default `~/.claude.json` and each
    profile's `<CLAUDE_CONFIG_DIR>/.claude.json`. Profiles may be seeded from the default
    file, so stores merge by per-skill maximum (never summed); evidence is high-water."""
    cumulative = cursor.setdefault("cumulative", {}).setdefault("claude_skillusage", {})
    stores = _distinct([home / ".claude.json"] + [root / ".claude.json" for root in _claude_config_dirs(cursor)])
    counts = _deserialise_contrib(cumulative)
    errors: list[str] = []
    read = 0
    for path in stores:
        try:
            for name, item in _read_skillusage(path, names).items():
                counts[name] = _merge_highwater(counts.get(name, {}), item)
            read += 1
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
            errors.append(str(error))
    cursor["cumulative"]["claude_skillusage"] = _serialise_contrib(counts)
    error = "; ".join(errors) if errors else (None if stores else "store not found")
    return {"available": read > 0, "records": sum(x["count"] for x in counts.values()),
            "window": _window(counts), "error": error, "counts": counts}


def _collect_claude_projects(home: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    _parser_claude_projects.names = names  # type: ignore[attr-defined]
    _parser_claude_projects.prefilter = ('"Skill"', '<command-name>')  # type: ignore[attr-defined]
    roots = _distinct([home / ".claude" / "projects"] + [root / "projects" for root in _claude_config_dirs(cursor)])
    files = [path for root in roots for path in _files_under(root, lambda n: n.endswith(".jsonl"))]
    return _file_source("claude_projects", files, _parser_claude_projects, names, cursor)


def _collect_codex(home: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    root = home / ".codex" / "sessions"
    _parser_codex.names = names  # type: ignore[attr-defined]
    _parser_codex.prefilter = ('SKILL.md',)  # type: ignore[attr-defined]
    files = _files_under(root, lambda n: n.startswith("rollout-") and n.endswith(".jsonl"))
    return _file_source("codex", files, _parser_codex, names, cursor)


def _is_read_tool(name: Any) -> bool:
    return isinstance(name, str) and name.lower().replace("-", "_").lstrip("_") in {
        "read", "read_file", "file_read", "view", "view_file", "viewfile", "cat", "fs_read", "readfile"
    }


def _tool_path_skill(item: dict[str, Any], names: set[str]) -> str | None:
    if not _is_read_tool(item.get("name") or item.get("tool") or item.get("action")):
        return None
    def find(value: Any) -> str | None:
        if not isinstance(value, dict):
            return None
        for path_key in ("path", "file", "filename", "filePath", "file_path", "absolutePath", "AbsolutePath"):
            skill = _path_skill(value.get(path_key), names)
            if skill:
                return skill
        for nested_key in ("input", "arguments", "args", "parameters", "state"):
            skill = find(value.get(nested_key))
            if skill:
                return skill
        return None
    return find(item)

def _collect_opencode(home: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    candidates = [home / ".local" / "share" / "opencode" / "opencode.db", home / ".opencode" / "opencode.db", home / ".config" / "opencode" / "opencode.db"]
    path = next((candidate for candidate in candidates if candidate.is_file()), None)
    if path is None:
        return {"available": False, "records": 0, "window": [None, None], "error": "store not found", "counts": {}}
    counts: dict[str, dict[str, Any]] = {}
    records = 0
    try:
        db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            # Filter inside SQLite and stream rows: the table holds every tool output, so
            # materializing it (fetchall) costs as much memory as the database itself.
            rows = db.execute("SELECT data, time_created FROM session_message WHERE instr(data, 'SKILL.md') > 0")
            for raw, created in rows:
                if not isinstance(raw, str):
                    continue
                try:
                    value = json.loads(raw)
                except (ValueError, TypeError):
                    continue
                for item in _iter_dicts(value):
                    if item.get("type") != "tool":
                        continue
                    skill = _tool_path_skill(item, names)
                    if skill:
                        _add_event(counts, skill, _parse_datetime(created))
                        records += 1
        finally:
            db.close()
    except (OSError, sqlite3.Error, ValueError, TypeError) as error:
        return {"available": False, "records": 0, "window": [None, None], "error": str(error), "counts": {}}
    return {"available": True, "records": records, "window": _window(counts), "error": None, "counts": counts}


GEMINI_READ_TOOLS = {"view_file", "view_file_outline", "view_code_item", "read_file"}
GEMINI_PATH_KEYS = ("AbsolutePath", "absolutePath", "path", "file", "filePath", "file_path")


def _collect_gemini(home: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    # Antigravity CLI/IDE brains keep one canonical `logs/transcript.jsonl` per conversation;
    # `logs/chunks/transcript*` repeat the same steps, so only the canonical file is read.
    files: list[Path] = []
    for product in ("antigravity-cli", "antigravity", "antigravity-ide"):
        brain = home / ".gemini" / product / "brain"
        if not brain.is_dir() or brain.is_symlink():
            continue
        for conversation in sorted(brain.iterdir()):
            transcript = conversation / ".system_generated" / "logs" / "transcript.jsonl"
            if transcript.is_file() and not transcript.is_symlink():
                files.append(transcript)
    def parser(value: Any, when: datetime | None, events: dict[str, dict[str, Any]]) -> int:
        count = 0
        calls = value.get("tool_calls") if isinstance(value, dict) else None
        if not isinstance(calls, list):
            return 0
        for call in calls:
            if not isinstance(call, dict) or call.get("name") not in GEMINI_READ_TOOLS:
                continue
            args = call.get("args")
            if not isinstance(args, dict):
                continue
            skill = next((found for key in GEMINI_PATH_KEYS
                          if (found := _path_skill(args.get(key), names))), None)
            if skill:
                _add_event(events, skill, when)
                count += 1
        return count
    parser.prefilter = ("SKILL.md",)  # type: ignore[attr-defined]
    return _file_source("gemini", files, parser, names, cursor)


def _collect_aside(home: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    # Aside records a skill load as a successful `read_file` toolResult carrying details.skillName.
    root = home / ".aside" / "u"
    files: list[Path] = []
    if root.is_dir() and not root.is_symlink():
        for account in sorted(root.iterdir()):
            files.extend(_files_under(account / "sessions", lambda n: n.endswith(".jsonl")))
    def parser(value: Any, when: datetime | None, events: dict[str, dict[str, Any]]) -> int:
        if not isinstance(value, dict) or value.get("role") != "toolResult" or value.get("isError"):
            return 0
        details = value.get("details")
        if not _is_read_tool(value.get("toolName")) or not isinstance(details, dict):
            return 0
        name = _name_from_value(details.get("skillName"), names)
        if not name:
            return 0
        _add_event(events, name, _event_time(value, when))
        return 1
    parser.prefilter = ('"skillName"',)  # type: ignore[attr-defined]
    return _file_source("aside", files, parser, names, cursor)


def _skill_uri(value: Any, names: set[str]) -> str | None:
    if isinstance(value, str) and value.startswith("skill://"):
        name = value[len("skill://"):].split("/", 1)[0].split(":", 1)[0]
        return name if name in names else None
    return None


def _pi_family_parser() -> Callable[[Any, datetime | None, dict[str, dict[str, Any]]], int]:
    """Session JSONL shared by jeopi, GJC, OMP and Pi.

    Load events: a `custom_message` with customType `skill-prompt` (details.name), and an
    assistant `toolCall` of a read tool whose path is `<dir>/<name>/SKILL.md` or
    `skill://<name>`. User/assistant text, session_init skill listings, writes, edits,
    greps and shell commands are never counted.
    """
    def parser(value: Any, when: datetime | None, events: dict[str, dict[str, Any]]) -> int:
        if not isinstance(value, dict):
            return 0
        when = _event_time(value, when)
        if value.get("type") == "custom_message" and value.get("customType") == "skill-prompt":
            details = value.get("details")
            name = _name_from_value(details.get("name"), parser.names) if isinstance(details, dict) else None
            if name:
                _add_event(events, name, when)
                return 1
            return 0
        message = value.get("message")
        if not isinstance(message, dict) or message.get("role") != "assistant":
            return 0
        count = 0
        content = message.get("content")
        for item in content if isinstance(content, list) else []:
            if not isinstance(item, dict) or item.get("type") != "toolCall" or not _is_read_tool(item.get("name")):
                continue
            arguments = item.get("arguments")
            path = arguments.get("path") if isinstance(arguments, dict) else None
            name = _path_skill(path, parser.names) or _skill_uri(path, parser.names)
            if name:
                _add_event(events, name, when)
                count += 1
        return count
    parser.names = set()  # type: ignore[attr-defined]
    parser.prefilter = ("skill-prompt", "SKILL.md", "skill://")  # type: ignore[attr-defined]
    return parser


def _collect_pi_family(source: str, sessions: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    parser = _pi_family_parser()
    parser.names = names  # type: ignore[attr-defined]
    files = _files_under(sessions, lambda n: n.endswith(".jsonl"))
    return _file_source(source, files, parser, names, cursor)


def _collect_jeopi(home: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    return _collect_pi_family("jeopi", home / ".jeopi" / "agent" / "sessions", names, cursor)


def _collect_gjc(home: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    return _collect_pi_family("gjc", home / ".gjc" / "agent" / "sessions", names, cursor)


def _collect_omp(home: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    return _collect_pi_family("omp", home / ".omp" / "agent" / "sessions", names, cursor)


def _collect_pi(home: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    return _collect_pi_family("pi", home / ".pi" / "agent" / "sessions", names, cursor)


def _collect_jeo(home: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    files = _files_under(home / ".jeo" / "sessions", lambda n: n.endswith(".jsonl") or n.endswith(".json"))
    def jeo_parser(value: Any, when: datetime | None, events: dict[str, dict[str, Any]]) -> int:
        count = 0
        for envelope in _iter_dicts(value):
            results = envelope.get("toolResults")
            if isinstance(results, dict):
                results = [results]
            if not isinstance(results, list):
                continue
            for result in results:
                if not isinstance(result, dict) or not isinstance(result.get("output"), str):
                    continue
                # jeo's read tool emits a path-only line in toolResults; never inspect
                # user/assistant message text because it may merely mention a skill.
                for line in result["output"].splitlines():
                    path = line.strip()
                    if not path or " " in path or not path.endswith("/SKILL.md"):
                        continue
                    name = _path_skill(path, names)
                    if name:
                        _add_event(events, name, when)
                        count += 1
        return count
    jeo_parser.prefilter = ("SKILL.md",)  # type: ignore[attr-defined]
    return _file_source("jeo", files, jeo_parser, names, cursor)


def _collect_jev(names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    # The Jev plugin rotates the live ledger to unique `jev-usage.<stamp>-<pid>-<rand>.jsonl`
    # names; renames keep the inode, so the cursor never double counts a rotated segment and
    # deleted segments keep their recorded contribution.
    directory = state_dir(False)
    files: list[Path] = []
    if directory.is_dir() and not directory.is_symlink():
        files = sorted(path for path in directory.iterdir()
                       if path.is_file() and not path.is_symlink()
                       and path.name.startswith("jev-usage.")
                       and (path.name.endswith(".jsonl") or path.name == "jev-usage.jsonl.1"))
    def jev_parser(value: Any, when: datetime | None, events: dict[str, dict[str, Any]]) -> int:
        if not isinstance(value, dict) or not isinstance(value.get("injected"), list):
            return 0
        count = 0
        timestamp = _parse_datetime(value.get("at")) or when
        for raw in value["injected"]:
            name = _name_from_value(raw, names)
            if name:
                _add_event(events, name, timestamp); count += 1
        return count
    return _file_source("jev", files, jev_parser, names, cursor)


# ----------------------------- scan and report -----------------------------


def _collector_call(collector: Callable[..., dict[str, Any]], *args: Any) -> dict[str, Any]:
    try:
        return collector(*args)
    except Exception as error:  # every optional store is failure-isolated
        return {"available": False, "records": 0, "window": [None, None], "error": str(error), "counts": {}}


class ScanBusy(RuntimeError):
    """Another process holds the scan lock; scheduled scans skip instead of waiting."""


@contextmanager
def _scan_lock(wait: bool) -> Iterator[None]:
    """Single-flight scans across processes via an OS-held advisory lock.

    The lock file is never unlinked; the kernel releases the lock when the holder exits,
    so a crashed scan cannot leave a stale lock. Without fcntl (non-POSIX) scans are not
    serialized.
    """
    descriptor = os.open(state_dir(True) / "scan.lock",
                         os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        if fcntl is not None:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | (0 if wait else fcntl.LOCK_NB))
            except BlockingIOError as error:
                raise ScanBusy("another usage scan is running") from error
        yield
    finally:
        os.close(descriptor)


def scan(catalog: dict, roots: Iterable[Path], *, home: Path | None = None, wait: bool = True) -> dict:
    """Aggregate usage evidence; `wait=False` raises ScanBusy instead of queueing."""
    with _scan_lock(wait):
        return _scan_locked(catalog, roots, home=home)


def _scan_locked(catalog: dict, roots: Iterable[Path], *, home: Path | None) -> dict:
    home = Path(home or Path.home()).expanduser()
    names = _catalog_names(catalog)
    started_value = read_state("usage.json", {}).get("tracking_started_at")
    started = _parse_datetime(started_value) or now()
    cursor = read_state("usage-cursor.json", {})
    if not isinstance(cursor, dict):
        cursor = {}
    # Cached per-file contributions only hold names known to the catalog that parsed them.
    # When the catalog changes (remote vs checkout, new skills), re-parse every live file;
    # the high-water merge keeps prior counts, and vanished files keep their contribution.
    names_digest = hashlib.sha256("\n".join(sorted(names)).encode("utf-8")).hexdigest()
    if cursor.get("names_sha256") != names_digest:
        for entry in cursor.get("files", {}).values():
            if isinstance(entry, dict) and not entry.get("retired"):
                entry["mtime_ns"] = -1
                entry.pop("offset", None)  # old bytes must be re-read for the new names
        cursor["names_sha256"] = names_digest
    source_data: dict[str, dict[str, Any]] = {}
    collectors: list[tuple[str, Callable[..., dict[str, Any]]]] = [
        ("claude_skillusage", _collect_claude_skillusage),
        ("claude_projects", _collect_claude_projects),
        ("codex", _collect_codex),
        ("opencode", _collect_opencode),
        ("gemini", _collect_gemini),
        ("aside", _collect_aside),
        ("jeopi", _collect_jeopi),
        ("gjc", _collect_gjc),
        ("omp", _collect_omp),
        ("pi", _collect_pi),
        ("jeo", _collect_jeo),
    ]
    for source, collector in collectors:
        result = _collector_call(collector, home, names, cursor)
        source_data[source] = result
    source_data["jev"] = _collector_call(_collect_jev, names, cursor)

    previous = read_state("usage.json", {})
    previous_skills = previous.get("skills", {}) if isinstance(previous, dict) else {}
    if not isinstance(previous_skills, dict):
        previous_skills = {}
    runtime_groups = {"claude_skillusage": "claude", "claude_projects": "claude"}
    skills: dict[str, dict[str, Any]] = {}
    for name in sorted(names):
        old = previous_skills.get(name, {}) if isinstance(previous_skills.get(name), dict) else {}
        old_by_source = old.get("by_source", {}) if isinstance(old.get("by_source"), dict) else {}
        by_source = {str(src): max(0, int(value)) for src, value in old_by_source.items() if isinstance(value, (int, float))}
        current_by_source: dict[str, int] = {}
        current_times: list[datetime] = []
        for source, result in source_data.items():
            item = result.get("counts", {}).get(name, {})
            current = int(item.get("count", 0)) if isinstance(item, dict) else 0
            current_by_source[source] = current
            by_source[source] = max(by_source.get(source, 0), current)
            if isinstance(item, dict):
                for key in ("first", "last"):
                    when = item.get(key)
                    if when:
                        current_times.append(when)
        grouped: dict[str, int] = {}
        for source, count in current_by_source.items():
            group = runtime_groups.get(source, source)
            grouped[group] = max(grouped.get(group, 0), count)
        current_total = sum(grouped.values())
        old_count = int(old.get("count", 0)) if isinstance(old.get("count"), (int, float)) else 0
        old_first = _parse_datetime(old.get("first_used_at"))
        old_last = _parse_datetime(old.get("last_used_at"))
        firsts = [when for when in ([old_first] + current_times) if when]
        lasts = [when for when in ([old_last] + current_times) if when]
        installed = _parse_datetime(old.get("first_seen_installed_at"))
        skills[name] = {
            "count": max(old_count, current_total),
            "first_used_at": iso(min(firsts)) if firsts else None,
            "last_used_at": iso(max(lasts)) if lasts else None,
            "by_source": {key: by_source[key] for key in sorted(by_source) if by_source[key] > 0},
            "first_seen_installed_at": iso(installed),
        }
    # A scan against a smaller catalog (e.g. an older remote one) must not erase evidence for
    # skills it does not list; reports only read rows for their own catalog's names.
    for name, item in previous_skills.items():
        if name not in skills and isinstance(item, dict):
            skills[name] = item
    scan_time = now()
    for raw_root in roots:
        root = Path(raw_root).expanduser()
        for name, item in skills.items():
            if item["first_seen_installed_at"]:
                continue
            try:
                if (root / name / "SKILL.md").is_file():
                    item["first_seen_installed_at"] = iso(scan_time)
            except OSError:
                continue
    output = {
        "version": 1,
        "tracking_started_at": iso(started),
        "scanned_at": iso(scan_time),
        "sources": {
            source: {key: value for key, value in result.items() if key != "counts"}
            for source, result in source_data.items()
        },
        "skills": skills,
    }
    write_state("usage-cursor.json", cursor)
    write_state("usage.json", output)
    return output


def build_report(catalog: dict, usage: dict | None = None) -> dict:
    usage = usage if isinstance(usage, dict) else read_state("usage.json", {})
    policy = load_policy()
    protected = protected_names(catalog)
    tracking = _parse_datetime(usage.get("tracking_started_at")) if isinstance(usage, dict) else None
    generated = now()
    skills_usage = usage.get("skills", {}) if isinstance(usage, dict) and isinstance(usage.get("skills"), dict) else {}
    report_skills: list[dict[str, Any]] = []
    in_grace = candidate = used = 0
    names = _catalog_names(catalog)
    for name in sorted(names):
        item = skills_usage.get(name, {}) if isinstance(skills_usage.get(name), dict) else {}
        count = int(item.get("count", 0)) if isinstance(item.get("count"), (int, float)) else 0
        installed = _parse_datetime(item.get("first_seen_installed_at"))
        grace_start = max(x for x in (tracking, installed) if x) if (tracking or installed) else None
        grace_end = grace_start + timedelta(days=policy["grace_days"]) if grace_start else None
        if count > 0:
            status = "used"; used += 1
        elif name in protected:
            status = "protected"
        elif tracking is None or grace_end is None or generated < grace_end:
            status = "in-grace"; in_grace += 1
        else:
            status = "candidate"; candidate += 1
        report_skills.append({
            "name": name, "status": status, "count": count,
            "last_used_at": item.get("last_used_at"),
            "by_source": item.get("by_source", {}),
            "grace_ends_at": iso(grace_end),
            "protected_reason": protected.get(name),
        })
    return {
        "version": 1,
        "generated_at": iso(generated),
        "tracking_started_at": iso(tracking),
        "grace_days": policy["grace_days"],
        "sources": usage.get("sources", {}) if isinstance(usage, dict) else {},
        "summary": {"catalog": len(names), "used": used, "protected": sum(1 for x in report_skills if x["status"] == "protected"), "in_grace": in_grace, "candidate": candidate},
        "skills": report_skills,
    }


def candidate_names(report: dict) -> list[str]:
    skills = report.get("skills", []) if isinstance(report, dict) else []
    return sorted(item["name"] for item in skills if isinstance(item, dict) and item.get("status") == "candidate" and isinstance(item.get("name"), str))
