#!/usr/bin/env python3
"""Capture every user prompt into the llm-wiki vault and refresh graphify.

Used as the UserPromptSubmit (Claude) / BeforeAgent (Gemini/Antigravity) /
UserPromptSubmit (Codex) hook by setup-all-skills-prompt.md Step 6.

Default vault: ~/vaults/llm-wiki/  (override via LLM_WIKI_VAULT env var)

Behavior:
  1. Read prompt payload from stdin (JSON or raw text).
  2. Write raw capture + source summary + query stub under the vault.
  3. Touch index.md / log.md.
  4. If graphifyy is importable, rebuild the structural graph under
     <vault>/graphify-out/. If not, skip the graph step silently.

All errors are swallowed (exit 0) so the host agent's prompt is never blocked.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME = Path.home()
VAULT_ROOT = Path(os.environ.get("LLM_WIKI_VAULT", str(HOME / "vaults" / "llm-wiki")))
GRAPH_OUT = VAULT_ROOT / "graphify-out"
STATE_FILE = VAULT_ROOT / ".state" / "ingest-prompt.json"
MAX_PROMPT_SNIPPET = 80

TITLE_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]")
IGNORE_DIRS = {".obsidian", ".trash", ".git", "graphify-out", ".state"}


def now_utc() -> datetime:
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
        for key in ("text", "prompt", "input_text", "message", "content", "query", "user_input"):
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


def fence(text: str) -> str:
    return text.replace("```", "'''")


def insert_marker_line(file_path: Path, marker: str, line: str) -> None:
    anchor = f"<!-- {marker}:END -->"
    text = file_path.read_text(encoding="utf-8") if file_path.exists() else ""
    if line in text:
        return
    if anchor not in text:
        text = text.rstrip() + "\n\n" + line + "\n"
    else:
        text = text.replace(anchor, line + "\n" + anchor)
    file_path.write_text(text, encoding="utf-8")


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


def write_prompt_files(prompt_text: str, session_id: str) -> dict[str, Path]:
    stamp = now_utc()
    date_slug = stamp.strftime("%Y-%m-%d")
    time_slug = stamp.strftime("%H%M%S")
    session_short = (session_id or "session")[:12]
    title = prompt_title(prompt_text)
    prompt_slug = slugify(title)

    raw_dir = VAULT_ROOT / "raw" / "sources" / "prompts" / stamp.strftime("%Y") / stamp.strftime("%m") / stamp.strftime("%d")
    raw_dir.mkdir(parents=True, exist_ok=True)
    raw_path = raw_dir / f"{time_slug}-{session_short}-{prompt_slug}.md"

    source_rel = Path("wiki") / "sources" / f"{date_slug}-{time_slug}-{prompt_slug}.md"
    source_path = VAULT_ROOT / source_rel
    source_path.parent.mkdir(parents=True, exist_ok=True)

    query_rel = Path("wiki") / "queries" / f"{date_slug}-{time_slug}-{prompt_slug}.md"
    query_path = VAULT_ROOT / query_rel
    query_path.parent.mkdir(parents=True, exist_ok=True)

    raw_path.write_text(
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
                "```text",
                fence(prompt_text),
                "```",
                "",
            ]
        ),
        encoding="utf-8",
    )

    source_path.write_text(
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
                "```text",
                fence(prompt_text[:2000]),
                "```",
                "",
            ]
        ),
        encoding="utf-8",
    )

    query_path.write_text(
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
    return {"raw": raw_path, "source": source_path, "query": query_path}


def maybe_refresh_graph() -> dict[str, Any] | None:
    """Best-effort graphify refresh. Returns None if graphify is unavailable."""
    try:
        import networkx as nx  # type: ignore
        from graphify.analyze import god_nodes, suggest_questions, surprising_connections  # type: ignore
        from graphify.cluster import cluster, score_all  # type: ignore
        from graphify.export import to_html, to_json, to_obsidian  # type: ignore
        from graphify.report import generate  # type: ignore
    except Exception:
        return None

    GRAPH_OUT.mkdir(parents=True, exist_ok=True)
    pages: dict[str, dict[str, Any]] = {}
    for path in VAULT_ROOT.rglob("*.md"):
        rel = path.relative_to(VAULT_ROOT)
        if any(part in IGNORE_DIRS for part in rel.parts):
            continue
        if rel.name in {"AGENTS.md", "CLAUDE.md", "GEMINI.md"}:
            continue
        text = path.read_text(encoding="utf-8")
        page_id = rel.with_suffix("").as_posix()
        match = TITLE_RE.search(text)
        label = match.group(1).strip() if match else path.stem
        pages[page_id] = {"path": path, "rel": rel, "label": label, "text": text}

    graph = nx.Graph()
    for page_id, page in pages.items():
        graph.add_node(page_id, label=page["label"], source_file=page["rel"].as_posix())
    page_ids = set(pages)
    for page_id, page in pages.items():
        for target in WIKILINK_RE.findall(page["text"]):
            normalized = target.strip().strip("/").removesuffix(".md")
            if normalized in page_ids:
                graph.add_edge(page_id, normalized, relation="links_to", weight=1.0, confidence="EXTRACTED", confidence_score=1.0, source_file=page["rel"].as_posix())

    communities = cluster(graph)
    cohesion = score_all(graph, communities)
    labels = {cid: f"Community {cid}" for cid in communities}
    detection_result = {"total_files": len(pages), "total_words": sum(len(p["text"].split()) for p in pages.values())}
    gods = god_nodes(graph)
    surprises = surprising_connections(graph, communities)
    questions = suggest_questions(graph, communities, labels)
    report = generate(
        graph, communities, cohesion, labels, gods, surprises, detection_result,
        {"input": 0, "output": 0}, str(VAULT_ROOT), suggested_questions=questions,
    )
    (GRAPH_OUT / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
    to_json(graph, communities, str(GRAPH_OUT / "graph.json"))
    try:
        to_html(graph, communities, str(GRAPH_OUT / "graph.html"), community_labels=labels)
    except Exception as exc:
        (GRAPH_OUT / "graph.html.error.txt").write_text(str(exc), encoding="utf-8")
    try:
        to_obsidian(graph, communities, str(GRAPH_OUT / "obsidian"), community_labels=labels, cohesion=cohesion)
    except Exception:
        pass
    return {"nodes": graph.number_of_nodes(), "edges": graph.number_of_edges(), "communities": len(communities)}


def dedupe_guard(session_id: str, prompt_text: str) -> bool:
    digest = hashlib.sha256(f"{session_id}\n{prompt_text}".encode("utf-8")).hexdigest()
    state = load_state()
    if state.get("last_digest") == digest:
        return False
    save_state({"last_digest": digest, "updated_at": now_utc().isoformat(), "session_id": session_id})
    return True


def main() -> int:
    try:
        ensure_vault()
        payload = read_payload()
        event_name = payload.get("hook_event_name") or payload.get("type") or "UserPromptSubmit"
        if event_name not in {"UserPromptSubmit", "BeforeAgent", "manual"}:
            return 0
        session_id = extract_session_id(payload)
        prompt_text = extract_prompt_text(payload)
        if not prompt_text:
            return 0
        if not dedupe_guard(session_id, prompt_text):
            return 0
        write_prompt_files(prompt_text, session_id)
        maybe_refresh_graph()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
