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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

sys.dont_write_bytecode = True

STATE_DIR_ENV = "JEO_SKILL_STATE_DIR"
NOW_ENV = "JEO_SKILL_NOW"
ROUTER_SKILL = "jeo-skill"
PROTECTED_BUNDLES = ("starter", "cli-core", "infrastructure-core")
DEFAULT_GRACE_DAYS = 30
MAX_LINE_BYTES = 8 * 1024 * 1024
MAX_FILES = 10000


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


def _parse_jsonl(path: Path, parser: Callable[[Any, datetime | None, dict[str, dict[str, Any]]], int], names: set[str]) -> tuple[dict[str, dict[str, Any]], int]:
    events: dict[str, dict[str, Any]] = {}
    records = 0
    fallback = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        prefilter = getattr(parser, "prefilter", ())
        for raw in handle:
            if prefilter and not any(token in raw for token in prefilter):
                continue
            if len(raw.encode("utf-8", errors="ignore")) > MAX_LINE_BYTES:
                continue
            try:
                value = json.loads(raw)
            except (ValueError, TypeError):
                continue
            records += parser(value, _event_time(value, fallback), events)
    return events, records


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


def _file_contributions(source: str, files: list[Path], parser: Callable[..., int], names: set[str], cursor: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], int, str | None]:
    all_entries = cursor.setdefault("files", {})
    current_keys: set[str] = set()
    source_error: str | None = None
    for path in files:
        try:
            info = path.stat()
            head = _head_hash(path)
            dev, ino = int(info.st_dev), int(info.st_ino)
        except OSError as error:
            source_error = str(error)
            continue
        key = f"{source}|{dev}|{ino}|{head}" if ino else f"{source}|{path}|{head}"
        existing = all_entries.get(key)
        previous_key: str | None = None
        if existing is None:
            # A rewrite or copied rotation may retain the path or exact prefix/size.
            for candidate_key, candidate in all_entries.items():
                if candidate.get("source") != source or candidate.get("superseded"):
                    continue
                if candidate.get("path") == str(path) or (
                    candidate.get("head") == head and int(candidate.get("size", -1)) == int(info.st_size)
                ):
                    existing = candidate
                    previous_key = candidate_key
                    break
        unchanged = bool(existing and existing.get("size") == info.st_size and existing.get("mtime_ns") == info.st_mtime_ns
                         and existing.get("head") == head and not existing.get("retired"))
        try:
            if unchanged:
                contribution = _deserialise_contrib(existing.get("contribution"))
                records = int(existing.get("records", 0))
            else:
                # Recompute the changed file; high-water merge preserves evidence on truncation.
                for fn in ("names",):
                    if hasattr(parser, fn):
                        setattr(parser, fn, names)
                contribution, records = _parse_jsonl(path, parser, names)
                if existing:
                    old = _deserialise_contrib(existing.get("contribution"))
                    for name, item in old.items():
                        contribution[name] = _merge_highwater(item, contribution.get(name, {}))
        except (OSError, UnicodeError, ValueError, TypeError) as error:
            source_error = str(error)
            continue
        entry = {
            "source": source, "path": str(path), "dev": dev, "ino": ino, "head": head,
            "size": int(info.st_size), "mtime_ns": int(info.st_mtime_ns),
            "records": int(records), "contribution": _serialise_contrib(contribution), "retired": False,
        }
        if previous_key and previous_key != key:
            all_entries[previous_key]["superseded"] = True
        all_entries[key] = entry
        current_keys.add(key)
    for key, entry in all_entries.items():
        if entry.get("source") == source and key not in current_keys and not entry.get("superseded"):
            entry["retired"] = True
    selected: list[dict[str, Any]] = []
    seen_identity: set[tuple[Any, ...]] = set()
    for entry in all_entries.values():
        if entry.get("source") != source or entry.get("superseded"):
            continue
        identity = (entry.get("dev"), entry.get("ino")) if entry.get("ino") else (entry.get("head"), entry.get("size"))
        copy_identity = (entry.get("head"), entry.get("size"))
        if identity in seen_identity or copy_identity in seen_identity:
            continue
        seen_identity.add(identity)
        seen_identity.add(copy_identity)
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
    return {"available": True, "records": records, "window": _window(counts), "error": error, "counts": counts}


def _window(counts: dict[str, dict[str, Any]]) -> list[str | None]:
    values = [item.get("first") for item in counts.values() if item.get("first")] + [item.get("last") for item in counts.values() if item.get("last")]
    return [iso(min(values)) if values else None, iso(max(values)) if values else None]


# ----------------------------- source collectors -----------------------------


def _collect_claude_skillusage(home: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    path = home / ".claude.json"
    cumulative = cursor.setdefault("cumulative", {}).setdefault("claude_skillusage", {})
    if not path.is_file():
        counts = _deserialise_contrib(cumulative)
        return {"available": False, "records": sum(x["count"] for x in counts.values()), "window": _window(counts), "error": "store not found", "counts": counts}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        usage = data.get("skillUsage", {})
        if not isinstance(usage, dict):
            raise ValueError("skillUsage is not an object")
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
            if count <= 0:
                continue
            when = _parse_datetime(info.get("lastUsedAt"))
            current = {"count": count, "first": when, "last": when}
            previous = _deserialise_contrib({name: cumulative.get(name, {})}).get(name)
            counts[name] = _merge_highwater(previous or {}, current)
        for name, item in _deserialise_contrib(cumulative).items():
            counts[name] = _merge_highwater(item, counts.get(name, {}))
        cursor["cumulative"]["claude_skillusage"] = _serialise_contrib(counts)
        return {"available": True, "records": sum(x["count"] for x in counts.values()), "window": _window(counts), "error": None, "counts": counts}
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        counts = _deserialise_contrib(cumulative)
        return {"available": False, "records": sum(x["count"] for x in counts.values()), "window": _window(counts), "error": str(error), "counts": counts}


def _collect_claude_projects(home: Path, names: set[str], cursor: dict[str, Any]) -> dict[str, Any]:
    root = home / ".claude" / "projects"
    _parser_claude_projects.names = names  # type: ignore[attr-defined]
    _parser_claude_projects.prefilter = ('"Skill"', '<command-name>')  # type: ignore[attr-defined]
    files = _files_under(root, lambda n: n.endswith(".jsonl"))
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
            rows = db.execute("SELECT data, time_created FROM session_message").fetchall()
            for raw, created in rows:
                if not isinstance(raw, str) or "SKILL.md" not in raw:
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


def scan(catalog: dict, roots: Iterable[Path], *, home: Path | None = None) -> dict:
    home = Path(home or Path.home()).expanduser()
    names = _catalog_names(catalog)
    started_value = read_state("usage.json", {}).get("tracking_started_at")
    started = _parse_datetime(started_value) or now()
    cursor = read_state("usage-cursor.json", {})
    if not isinstance(cursor, dict):
        cursor = {}
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
