#!/usr/bin/env python3
"""Capture every user prompt (and turn-end output when delegated) into the llm-wiki vault.

Used as the UserPromptSubmit (Claude) / BeforeAgent (Gemini/Antigravity) /
UserPromptSubmit (Codex) hook by setup-all-skills-prompt.md Step 6, as the
Claude PostCompact hook (captures `compact_summary`), and as the turn-end
(Stop / AfterAgent / post-turn) router to `ingest-output.py` when output or
transcript data is present.

Vault resolution:
  1. $LLM_WIKI_VAULT                        — explicit wiki root (canonical:
                                              ~/vaults/llm-wiki)
  2. $OBSIDIAN_MIND_VAULT/llm-wiki          — explicit obsidian-mind vault
  3. <git toplevel of cwd>/llm-wiki         — the working repo root
  4. ~/vaults/obsidian-mind/llm-wiki        — fallback outside any git repo

Behavior:
  1. Read prompt payload from stdin (JSON or raw text).
  2. Write raw capture + source summary + query stub under the vault.
  3. Under the shared `vault` layer lock (ctx.lock.layer_lock), insert the
     index.md bullets and append the log.md entry. If the lock is busy for
     longer than the wait window the index/log update is deferred (recorded in
     .state/deferred-index.jsonl); the raw capture is never lost.

Turn-end events (Stop / AfterAgent / post-turn) delegate to `ingest-output.py`
when an assistant output or transcript is present, and otherwise exit 0 without
creating a vault skeleton. The knowledge graph is regenerated only by
`ctx checkpoint` (graphify-out/ is the single graphify root; this script never
writes `.graphify/`).

All errors are swallowed (exit 0) so the host agent's prompt is never blocked.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

for _hook_dir in (Path(__file__).resolve().parent, Path.home() / ".agents" / "hooks"):
    if str(_hook_dir) not in sys.path:
        sys.path.insert(0, str(_hook_dir))
try:
    from ctx.lock import Locked, layer_lock  # type: ignore
except Exception:
    class Locked(Exception):  # type: ignore[no-redef]
        def __init__(self, name: str, holder: dict[str, Any] | None = None):
            self.name = name
            self.holder = holder or {}
            super().__init__(f"layer {name!r} is locked")

    @contextmanager
    def layer_lock(name: str, wait_seconds: float = 0) -> Iterator[Path]:  # type: ignore[no-redef]
        path = Path.home() / ".agents" / "hooks" / "ctx" / "locks" / f"{name}.lock"
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(str(path), os.O_RDWR | os.O_CREAT, 0o644)
        deadline = time.monotonic() + max(0.0, float(wait_seconds))
        try:
            while True:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except (BlockingIOError, OSError):
                    if time.monotonic() >= deadline:
                        raise Locked(name)
                    time.sleep(0.1)
            try:
                yield path
            finally:
                try:
                    fcntl.flock(fd, fcntl.LOCK_UN)
                except OSError:
                    pass
        finally:
            os.close(fd)

HOME = Path.home()


def _env_path(name: str) -> Path | None:
    """Read an env var as a path; blank/whitespace values are treated as unset."""
    raw = (os.environ.get(name) or "").strip()
    return Path(raw).expanduser() if raw else None


def git_toplevel() -> Path | None:
    """Repo root of the current working directory, or None outside a git repo."""
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
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


def resolve_obsidian_mind_vault() -> Path:
    """obsidian-mind vault: explicit override → working repo root → home fallback."""
    explicit = _env_path("OBSIDIAN_MIND_VAULT")
    if explicit:
        return explicit
    top = git_toplevel()
    if top:
        return top
    return HOME / "vaults" / "obsidian-mind"


def resolve_vault_root() -> Path:
    """llm-wiki root: $LLM_WIKI_VAULT → <obsidian-mind vault>/llm-wiki."""
    explicit = _env_path("LLM_WIKI_VAULT")
    if explicit:
        return explicit
    return resolve_obsidian_mind_vault() / "llm-wiki"


VAULT_ROOT = resolve_vault_root()
STATE_FILE = VAULT_ROOT / ".state" / "ingest-prompt.json"
MAX_PROMPT_SNIPPET = 80
VAULT_LOCK_WAIT = float(os.environ.get("CTX_VAULT_LOCK_WAIT", "1.0"))
AUTO_END = "<!-- ctx:auto:END -->"

# Vault dirs that are never wiki pages (shared with the ctx vault layer lint).
IGNORE_DIRS = {".obsidian", ".trash", ".git", ".graphify", "graphify-out", ".state", ".venv", ".jeo", ".survey"}


def now_utc() -> datetime:
    frozen = os.environ.get("JEO_INGEST_FROZEN_UTC", "").strip()
    if frozen:
        return datetime.fromisoformat(frozen)
    return datetime.now(timezone.utc)


def read_payload() -> dict[str, Any]:
    raw = ""
    if len(sys.argv) > 1:
        raw = sys.argv[1]
    elif not sys.stdin.isatty():
        raw = sys.stdin.read()
    raw = raw.strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}


def load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(state: dict[str, Any]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def ensure_vault() -> None:
    required = [
        VAULT_ROOT / "index.md",
        VAULT_ROOT / "log.md",
        VAULT_ROOT / "raw" / "sources",
        VAULT_ROOT / "wiki" / "queries",
        VAULT_ROOT / "wiki" / "sources",
    ]
    for path in required:
        if path.suffix == ".md":
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                path.write_text(f"# {path.stem.title()}\n", encoding="utf-8")
        else:
            path.mkdir(parents=True, exist_ok=True)


def flatten_strings(value: Any) -> list[str]:
    out: list[str] = []
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            out.append(stripped)
        return out
    if isinstance(value, list):
        for item in value:
            out.extend(flatten_strings(item))
        return out
    if isinstance(value, dict):
        # "raw" is what read_payload() uses when stdin is plain text rather than
        # JSON (manual runs, agents that pipe the bare prompt), so it must be
        # extractable too — otherwise those prompts are silently dropped.
        for key in ("text", "prompt", "input_text", "message", "content", "query", "user_input", "raw"):
            if key in value:
                out.extend(flatten_strings(value[key]))
        if "items" in value:
            out.extend(flatten_strings(value["items"]))
        if "submission" in value:
            out.extend(flatten_strings(value["submission"]))
    return out


def extract_session_id(payload: dict[str, Any]) -> str:
    for key in ("session_id", "resourceId", "resource_id", "thread_id"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def extract_prompt_text(payload: dict[str, Any]) -> str:
    candidates = flatten_strings(payload)
    filtered = [
        item
        for item in candidates
        if item not in {"UserPromptSubmit", "BeforeAgent", "Start", "Stop", "PermissionRequest"}
        and len(item) > 1
    ]
    return filtered[0] if filtered else ""


def slugify(text: str, max_len: int = 48) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return (slug or "prompt")[:max_len].strip("-") or "prompt"


def prompt_title(prompt_text: str) -> str:
    lines = [line.strip() for line in prompt_text.splitlines() if line.strip()]
    if not lines:
        return "Prompt Capture"
    title = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", lines[0])
    title = re.sub(r"\s+", " ", title).strip()
    if len(title) > MAX_PROMPT_SNIPPET:
        title = title[: MAX_PROMPT_SNIPPET - 1].rstrip() + "…"
    return title


def fenced_block(text: str, info: str = "text") -> str:
    longest = max((len(m.group(0)) for m in re.finditer(r"`+", text)), default=0)
    delim = "`" * max(3, longest + 1)
    return f"{delim}{info}\n{text}\n{delim}"


def insert_marker_line(file_path: Path, marker: str, line: str) -> None:
    """Insert `line` before `<!-- MARKER:END -->`; else before the ctx:auto END
    marker (so auto bullets stay inside the ctx-managed block instead of growing
    the file tail forever); else append at EOF. Rewrites via temp+rename."""
    anchor = f"<!-- {marker}:END -->"
    text = file_path.read_text(encoding="utf-8") if file_path.exists() else ""
    if line in text:
        return
    if anchor in text:
        text = text.replace(anchor, line + "\n" + anchor, 1)
    elif AUTO_END in text:
        text = text.replace(AUTO_END, line + "\n" + AUTO_END, 1)
    else:
        text = text.rstrip() + "\n\n" + line + "\n"
    atomic_write(file_path, text)


def atomic_write(file_path: Path, text: str) -> None:
    tmp = file_path.with_name(f".{file_path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, file_path)


def append_log(title: str, body_lines: list[str]) -> None:
    stamp = now_utc()
    heading = f"## [{stamp.date().isoformat()} {stamp.strftime('%H:%M:%S')}] query | {title}"
    log_path = VAULT_ROOT / "log.md"
    existing = log_path.read_text(encoding="utf-8") if log_path.exists() else ""
    if heading in existing:
        return
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write("\n" + heading + "\n")
        for line in body_lines:
            handle.write(line + "\n")


def defer_index_update(reason: str, title: str, **paths: str) -> None:
    """The vault lock was busy: raw/source/query are already on disk; record the
    deferred index/log bullets so the next ingest or `ctx refresh` reconciles."""
    try:
        note = VAULT_ROOT / ".state" / "deferred-index.jsonl"
        note.parent.mkdir(parents=True, exist_ok=True)
        entry = {"at": now_utc().isoformat(), "script": "ingest-prompt", "title": title, "reason": reason, **paths}
        with note.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass
    sys.stderr.write(f"ingest-prompt: index/log update deferred ({reason})\n")


def reconcile_deferred_index() -> None:
    note = VAULT_ROOT / ".state" / "deferred-index.jsonl"
    if not note.is_file():
        return
    try:
        lines = [line.strip() for line in note.read_text(encoding="utf-8").splitlines() if line.strip()]
        note.unlink(missing_ok=True)
        for line in lines:
            item = json.loads(line)
            title = item.get("title", "Deferred Capture")
            if item.get("source"):
                insert_marker_line(VAULT_ROOT / "index.md", "SOURCES", f"- [[{item['source']}]] - {title}")
            if item.get("query"):
                insert_marker_line(VAULT_ROOT / "index.md", "QUERIES", f"- [[{item['query']}]] - {title}")
            if item.get("report"):
                insert_marker_line(VAULT_ROOT / "index.md", "REPORTS", f"- [[{item['report']}]] - {title}")
    except Exception:
        pass


def _write_exclusive(path: Path, content: str, *, encoding: str = "utf-8") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding=encoding) as handle:
        handle.write(content)


def write_prompt_files(prompt_text: str, session_id: str) -> dict[str, Path]:
    stamp = now_utc()
    date_slug = stamp.strftime("%Y-%m-%d")
    time_slug = stamp.strftime("%H%M%S")
    session_short = slugify(session_id or "session", max_len=12)
    title = prompt_title(prompt_text)
    prompt_slug = slugify(title)
    base_id = hashlib.sha256(f"{session_id}\n{prompt_text}".encode("utf-8")).hexdigest()[:8]

    raw_dir = VAULT_ROOT / "raw" / "sources" / "prompts" / stamp.strftime("%Y") / stamp.strftime("%m") / stamp.strftime("%d")
    raw_dir.mkdir(parents=True, exist_ok=True)
    for attempt in range(100):
        capture_id = base_id if attempt == 0 else f"{base_id}-{attempt}"
        raw_path = raw_dir / f"{time_slug}-{session_short}-{capture_id}-{prompt_slug}.md"
        source_rel = Path("wiki") / "sources" / f"{date_slug}-{time_slug}-{capture_id}-{prompt_slug}.md"
        source_path = VAULT_ROOT / source_rel
        query_rel = Path("wiki") / "queries" / f"{date_slug}-{time_slug}-{capture_id}-{prompt_slug}.md"
        query_path = VAULT_ROOT / query_rel
        if not raw_path.exists() and not source_path.exists() and not query_path.exists():
            break

    _write_exclusive(
        raw_path,
        "\n".join(
            [
                "---",
                'type: "prompt"',
                f'session_id: "{session_id}"',
                f'captured_at: "{stamp.isoformat()}"',
                f'query_note: "[[{query_rel.with_suffix("").as_posix()}]]"',
                "---",
                "",
                f"# {title}",
                "",
                "## Prompt",
                "",
                fenced_block(prompt_text),
                "",
            ]
        ),
        encoding="utf-8",
    )

    _write_exclusive(
        source_path,
        "\n".join(
            [
                "---",
                'type: "source-summary"',
                f'captured_at: "{stamp.isoformat()}"',
                f'raw_path: "{raw_path.relative_to(VAULT_ROOT).as_posix()}"',
                f'session_id: "{session_id}"',
                "---",
                "",
                f"# {title}",
                "",
                f"- Raw capture: [[{raw_path.relative_to(VAULT_ROOT).with_suffix('').as_posix()}]]",
                f"- Filed query: [[{query_rel.with_suffix('').as_posix()}]]",
                "",
                "## Prompt Excerpt",
                "",
                fenced_block(prompt_text[:2000]),
                "",
            ]
        ),
        encoding="utf-8",
    )

    _write_exclusive(
        query_path,
        "\n".join(
            [
                "---",
                f'title: "{title}"',
                f'created_at: "{stamp.isoformat()}"',
                'section: "queries"',
                'status: "submitted"',
                f'session_id: "{session_id}"',
                f'raw_prompt: "[[{raw_path.relative_to(VAULT_ROOT).with_suffix("").as_posix()}]]"',
                f'source_summary: "[[{source_rel.with_suffix("").as_posix()}]]"',
                "---",
                "",
                f"# {title}",
                "",
                "## Question",
                "",
                prompt_text,
                "",
                "## Answer",
                "",
                "- [ ] Fill this after the answer becomes worth keeping",
                "",
                "## Evidence and Citations",
                "",
                f"- [[{source_rel.with_suffix('').as_posix()}]]",
                f"- [[{raw_path.relative_to(VAULT_ROOT).with_suffix('').as_posix()}]]",
                "",
            ]
        ),
        encoding="utf-8",
    )

    try:
        with layer_lock("vault", wait_seconds=VAULT_LOCK_WAIT):
            reconcile_deferred_index()
            insert_marker_line(VAULT_ROOT / "index.md", "SOURCES", f"- [[{source_rel.with_suffix('').as_posix()}]] - {title}")
            insert_marker_line(VAULT_ROOT / "index.md", "QUERIES", f"- [[{query_rel.with_suffix('').as_posix()}]] - {title}")
            append_log(
                title,
                [
                    f"- Raw capture: [[{raw_path.relative_to(VAULT_ROOT).with_suffix('').as_posix()}]]",
                    f"- Source note: [[{source_rel.with_suffix('').as_posix()}]]",
                    f"- Query note: [[{query_rel.with_suffix('').as_posix()}]]",
                ],
            )
    except Locked as exc:
        defer_index_update(
            str(exc),
            title,
            raw=raw_path.relative_to(VAULT_ROOT).with_suffix("").as_posix(),
            source=source_rel.with_suffix("").as_posix(),
            query=query_rel.with_suffix("").as_posix(),
        )
    return {"raw": raw_path, "source": source_path, "query": query_path}


def is_duplicate(session_id: str, prompt_text: str) -> bool:
    digest = hashlib.sha256(f"{session_id}\n{prompt_text}".encode("utf-8")).hexdigest()
    key = session_id or "default"
    state = load_state()
    sessions = state.get("sessions") if isinstance(state.get("sessions"), dict) else {}
    return sessions.get(key) == digest


def record_dedupe(session_id: str, prompt_text: str) -> None:
    digest = hashlib.sha256(f"{session_id}\n{prompt_text}".encode("utf-8")).hexdigest()
    key = session_id or "default"
    state = load_state()
    sessions = state.get("sessions") if isinstance(state.get("sessions"), dict) else {}
    sessions[key] = digest
    save_state({"last_digest": digest, "updated_at": now_utc().isoformat(), "session_id": session_id, "sessions": sessions})


def extract_compact_summary(payload: dict[str, Any]) -> str:
    """Claude PostCompact payload: `compact_summary` (doc field) or a fallback key."""
    for key in ("compact_summary", "summary", "compaction_summary"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _delegate_turn_end_output(payload: dict[str, Any]) -> int:
    has_output = any(
        isinstance(payload.get(key), str) and payload.get(key, "").strip()
        for key in ("assistant_output", "output", "response", "text", "raw",
                    "transcript_path", "transcriptPath", "conversation_path", "conversationPath")
    )
    if not has_output:
        return 0
    for candidate in (
        Path(__file__).resolve().parent / "ingest-output.py",
        HOME / ".agents" / "hooks" / "ingest-output.py",
        VAULT_ROOT / "scripts" / "ingest-output.py",
    ):
        if candidate.is_file():
            env = os.environ.copy()
            env.setdefault("LLM_WIKI_VAULT", str(VAULT_ROOT))
            env.setdefault("CTX_VAULT_LOCK_WAIT", "1.0")
            subprocess.run(
                [sys.executable, str(candidate)],
                input=json.dumps(payload, ensure_ascii=False),
                text=True,
                capture_output=True,
                timeout=30,
                env=env,
            )
            return 0
    return 0


def main() -> int:
    try:
        payload = read_payload()
        event_name = payload.get("hook_event_name") or payload.get("type") or "UserPromptSubmit"
        if event_name in {"Stop", "AfterAgent", "post-turn"}:
            return _delegate_turn_end_output(payload)
        if event_name == "PostCompact":
            prompt_text = extract_compact_summary(payload)
            if not prompt_text:
                return 0
            prompt_text = "Compact summary (PostCompact)\n\n" + prompt_text
        elif event_name in {"UserPromptSubmit", "BeforeAgent", "manual"}:
            prompt_text = extract_prompt_text(payload)
        else:
            return 0
        if not prompt_text:
            return 0
        session_id = extract_session_id(payload)
        ensure_vault()
        if is_duplicate(session_id, prompt_text):
            return 0
        write_prompt_files(prompt_text, session_id)
        record_dedupe(session_id, prompt_text)
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
