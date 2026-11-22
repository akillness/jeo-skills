#!/usr/bin/env python3
"""Project shared jeo-skills context assets into detected coding-agent host directories."""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python < 3.11
    tomllib = None  # type: ignore[assignment]


WORKFLOW_START = "<!-- JEO-WORKFLOWS:START -->"
WORKFLOW_END = "<!-- JEO-WORKFLOWS:END -->"
CONTEXT_START = "<!-- JEO-CONTEXT:START -->"
CONTEXT_END = "<!-- JEO-CONTEXT:END -->"
TOOL_FLOW_START = "<!-- JEO-TOOL-FLOW:START -->"
TOOL_FLOW_END = "<!-- JEO-TOOL-FLOW:END -->"
SECOND_BRAIN_START = "<!-- JEO-SECOND-BRAIN:START -->"
SECOND_BRAIN_END = "<!-- JEO-SECOND-BRAIN:END -->"
KIMI_START = "# jeo-skills-managed: jeo-context:START"
KIMI_END = "# jeo-skills-managed: jeo-context:END"
MANAGED_MARKER = "jeo-skills-managed:"

LEGACY_INGEST_MARKERS = (
    "ingest-prompt.py",
    "ingest-output.py",
    "llm-wiki-ingest",
    "ctx-hook.sh",
    "ctx refresh",
    "/vaults/llm-wiki/scripts/ingest-output.py",
)

RULE_NAMES = (
    "jeo-workflows.md",
    "jeo-tool-flow.md",
    "jeo-second-brain.md",
    "jev-control-plane.md",
)

MANAGED_CONTEXT_FILES = (
    "ingest-prompt.py",
    "ingest-output.py",
    "context_config.py",
    "llm-wiki-ingest.sh",
    "ctx-hook.sh",
)


def _is_truthy(val: str | None) -> bool:
    return (val or "").strip().lower() in {"1", "true", "yes", "on"}


def _is_falsey(val: str | None) -> bool:
    return (val or "").strip().lower() in {"0", "false", "no", "off", "skip"}


def context_veto_reason(env: dict[str, str] | None = None) -> str | None:
    e = env if env is not None else os.environ
    if (e.get("JEO_SKILLS_SECOND_BRAIN") or "").strip().lower() == "skip":
        return "JEO_SKILLS_SECOND_BRAIN=skip"
    if _is_falsey(e.get("JEO_SKILLS_APPROVE_KNOWLEDGE_HOOKS")):
        return "JEO_SKILLS_APPROVE_KNOWLEDGE_HOOKS=false"
    if _is_falsey(e.get("JEO_SKILLS_APPROVE_KNOWLEDGE_DATA")):
        return "JEO_SKILLS_APPROVE_KNOWLEDGE_DATA=false"
    if _is_falsey(e.get("JEO_SKILLS_APPROVE_ALL_HOOKS_MCP")):
        return "JEO_SKILLS_APPROVE_ALL_HOOKS_MCP=false"
    return None


def _has_symlink_ancestor(path: Path, stop_at: Path) -> bool:
    try:
        rel = path.relative_to(stop_at)
    except ValueError:
        return False
    cur = stop_at
    for part in rel.parts:
        cur = cur / part
        if cur.is_symlink():
            return True
    return False


def _read_json_dict(path: Path) -> tuple[dict[str, Any] | None, str | None]:
    if not path.exists():
        return {}, None
    if path.is_symlink():
        return None, f"{path} is a symlink; refusing automatic JSON edit"
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        return None, f"unreadable {path}: {exc}"
    if not raw.strip():
        return {}, None
    try:
        data = json.loads(raw)
    except ValueError as exc:
        return None, f"invalid JSON in {path}: {exc}"
    if not isinstance(data, dict):
        return None, f"expected JSON object in {path}"
    return data, None


def _atomic_write_text(path: Path, content: str, *, mode: int = 0o644, dry_run: bool = False) -> bool:
    if path.is_symlink():
        return False
    try:
        if path.exists() and path.read_text(encoding="utf-8") == content:
            return False
    except OSError:
        pass
    if dry_run:
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(content)
        os.chmod(tmp_path, mode)
        os.replace(tmp_path, path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise
    return True


def _write_json_if_changed(path: Path, data: dict[str, Any], *, dry_run: bool = False) -> bool:
    rendered = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    return _atomic_write_text(path, rendered, mode=0o644, dry_run=dry_run)


def _strip_jsonc(raw: str) -> str:
    """Strip // line comments, /* block comments */, and trailing commas while preserving strings."""
    out: list[str] = []
    i = 0
    n = len(raw)
    in_str = False
    escaped = False
    while i < n:
        ch = raw[i]
        if in_str:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
            i += 1
            continue
        if ch == '"':
            in_str = True
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < n:
            nxt = raw[i + 1]
            if nxt == "/":
                i += 2
                while i < n and raw[i] != "\n":
                    i += 1
                continue
            if nxt == "*":
                i += 2
                while i + 1 < n and not (raw[i] == "*" and raw[i + 1] == "/"):
                    if raw[i] == "\n":
                        out.append("\n")
                    i += 1
                i += 2 if i + 1 < n else 1
                continue
        out.append(ch)
        i += 1
    no_comments = "".join(out)

    # Remove trailing commas before } or ] outside strings
    cleaned: list[str] = []
    in_str = False
    escaped = False
    m = len(no_comments)
    i = 0
    while i < m:
        ch = no_comments[i]
        if in_str:
            cleaned.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
            i += 1
            continue
        if ch == '"':
            in_str = True
            cleaned.append(ch)
            i += 1
            continue
        if ch == ",":
            j = i + 1
            while j < m and no_comments[j] in " \t\r\n":
                j += 1
            if j < m and no_comments[j] in "}]":
                i += 1
                continue
        cleaned.append(ch)
        i += 1
    return "".join(cleaned)


def _read_jsonc_dict(path: Path) -> tuple[dict[str, Any] | None, str, str | None]:
    if not path.exists():
        return {}, "", None
    if path.is_symlink():
        return None, "", f"{path} is a symlink; refusing automatic JSONC edit"
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        return None, "", f"unreadable {path}: {exc}"
    if not raw.strip():
        return {}, raw, None
    try:
        data = json.loads(_strip_jsonc(raw))
    except ValueError as exc:
        return None, raw, f"invalid JSONC in {path}: {exc}"
    if not isinstance(data, dict):
        return None, raw, f"expected JSONC object in {path}"
    return data, raw, None


def _find_top_level_jsonc_key_span(raw: str, key: str) -> tuple[int, int, int, int] | None:
    """Return (obj_open_idx, key_start_idx, arr_open_idx, arr_close_idx) for a top-level array key."""
    n = len(raw)
    i = 0
    depth = 0
    obj_open = -1
    in_str = False
    escaped = False

    def _skip_ws_and_comments(pos: int) -> int:
        while pos < n:
            if raw[pos] in " \t\r\n":
                pos += 1
            elif raw[pos] == "/" and pos + 1 < n and raw[pos + 1] == "/":
                pos += 2
                while pos < n and raw[pos] != "\n":
                    pos += 1
            elif raw[pos] == "/" and pos + 1 < n and raw[pos + 1] == "*":
                pos += 2
                while pos + 1 < n and not (raw[pos] == "*" and raw[pos + 1] == "/"):
                    pos += 1
                pos += 2 if pos + 1 < n else 1
            else:
                break
        return pos

    while i < n:
        ch = raw[i]
        if in_str:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
            i += 1
            continue
        if ch == "/" and i + 1 < n and raw[i + 1] in "/*":
            i = _skip_ws_and_comments(i)
            continue
        if ch == '"':
            str_start = i
            i += 1
            buf: list[str] = []
            esc = False
            while i < n:
                c2 = raw[i]
                if esc:
                    buf.append(c2)
                    esc = False
                elif c2 == "\\":
                    buf.append(c2)
                    esc = True
                elif c2 == '"':
                    break
                else:
                    buf.append(c2)
                i += 1
            str_end = i + 1
            i = str_end
            if depth == 1:
                try:
                    parsed_key = json.loads(raw[str_start:str_end])
                except ValueError:
                    parsed_key = "".join(buf)
                after_key = _skip_ws_and_comments(i)
                if parsed_key == key and after_key < n and raw[after_key] == ":":
                    val_start = _skip_ws_and_comments(after_key + 1)
                    if val_start >= n or raw[val_start] != "[":
                        return None
                    arr_depth = 0
                    k = val_start
                    arr_in_str = False
                    arr_esc = False
                    while k < n:
                        ck = raw[k]
                        if arr_in_str:
                            if arr_esc:
                                arr_esc = False
                            elif ck == "\\":
                                arr_esc = True
                            elif ck == '"':
                                arr_in_str = False
                            k += 1
                            continue
                        if ck == "/" and k + 1 < n and raw[k + 1] in "/*":
                            k = _skip_ws_and_comments(k)
                            continue
                        if ck == '"':
                            arr_in_str = True
                        elif ck == "[":
                            arr_depth += 1
                        elif ck == "]":
                            arr_depth -= 1
                            if arr_depth == 0:
                                return obj_open, str_start, val_start, k
                        k += 1
                    return None
            continue
        if ch == "{":
            if depth == 0:
                obj_open = i
            depth += 1
        elif ch == "}":
            depth -= 1
        i += 1
    return None


def _upsert_opencode_jsonc_instructions(
    raw: str, data: dict[str, Any], desired: list[str]
) -> tuple[str | None, str | None]:
    if not raw.strip():
        rendered = json.dumps({"instructions": desired}, indent=2, ensure_ascii=False) + "\n"
        return rendered, None

    existing = data.get("instructions")
    if existing is None:
        missing = list(desired)
        if not missing:
            return raw, None
        # Find top-level '{' outside comments
        n = len(raw)
        i = 0
        while i < n:
            if raw[i] in " \t\r\n":
                i += 1
            elif raw[i] == "/" and i + 1 < n and raw[i + 1] == "/":
                i += 2
                while i < n and raw[i] != "\n":
                    i += 1
            elif raw[i] == "/" and i + 1 < n and raw[i + 1] == "*":
                i += 2
                while i + 1 < n and not (raw[i] == "*" and raw[i + 1] == "/"):
                    i += 1
                i += 2 if i + 1 < n else 1
            else:
                break
        if i >= n or raw[i] != "{":
            return None, "cannot locate top-level JSONC object"
        inner_after = raw[i + 1 :]
        has_other_keys = bool(data)
        items_block = ",\n".join(f"    {json.dumps(item, ensure_ascii=False)}" for item in missing)
        comma = "," if has_other_keys else ""
        if inner_after.startswith("\n"):
            insert = f'\n  "instructions": [\n{items_block}\n  ]{comma}'
        else:
            insert = f'\n  "instructions": [\n{items_block}\n  ]{comma}\n'
        updated = raw[: i + 1] + insert + raw[i + 1 :]
        try:
            json.loads(_strip_jsonc(updated))
        except ValueError as exc:
            return None, f"JSONC insert validation failed: {exc}"
        return (updated if updated.endswith("\n") else updated + "\n"), None

    if not isinstance(existing, list):
        return None, "opencode instructions field is not an array; left untouched"

    existing_strs = {item for item in existing if isinstance(item, str)}
    missing = [item for item in desired if item not in existing_strs]
    if not missing:
        return raw, None

    span = _find_top_level_jsonc_key_span(raw, "instructions")
    if span is None:
        return None, "could not locate instructions array span in JSONC"
    _obj_open, _key_start, arr_open, arr_close = span
    inner = raw[arr_open + 1 : arr_close]
    inner_stripped = _strip_jsonc(inner).strip()
    close_line_start = raw.rfind("\n", arr_open, arr_close)
    close_indent = ""
    if close_line_start != -1:
        ws = raw[close_line_start + 1 : arr_close]
        if ws.strip() == "":
            close_indent = ws
    item_indent = close_indent + "  " if close_indent or "\n" in inner else "  "
    formatted = [f"{item_indent}{json.dumps(item, ensure_ascii=False)}" for item in missing]

    # Insert before trailing whitespace/comments at the end of inner, or right before ]
    # Check whether the last non-comment token before ] is already a comma
    no_c = _strip_jsonc(inner).rstrip()
    needs_comma = bool(inner_stripped) and not no_c.endswith(",")
    insertion_prefix = "," if needs_comma else ""
    if "\n" in inner or not inner_stripped:
        trailing_ws = ""
        if close_line_start != -1 and raw[close_line_start + 1 : arr_close].strip() == "":
            split_at = close_line_start
            before_close = raw[:split_at]
            after_close = raw[split_at:]
        else:
            before_close = raw[:arr_close]
            after_close = "\n" + close_indent + raw[arr_close:]
        if not inner_stripped:
            # Empty array [] or [ \n ]
            updated = raw[: arr_open + 1] + "\n" + ",\n".join(formatted) + "\n" + close_indent + raw[arr_close:]
        else:
            # Place comma right after last non-comment token if needed, then append items before after_close
            if needs_comma:
                # Find last non-whitespace char outside comments in before_close
                pos = len(before_close) - 1
                while pos > arr_open and before_close[pos] in " \t\r\n":
                    pos -= 1
                # If trailing line comment sits at end of line, insert comma after the JSON value before comment
                last_nl = before_close.rfind("\n", arr_open)
                line_tail = before_close[last_nl + 1 :] if last_nl != -1 else before_close[arr_open + 1 :]
                stripped_tail = _strip_jsonc(line_tail).rstrip()
                if stripped_tail:
                    # find end of stripped_tail content in line_tail
                    # fallback: place comma cleanly on preceding code end
                    code_pos = len(_strip_jsonc(before_close))
                    # safer: scan backwards skipping // line comments on lines
                    idx = len(before_close)
                    lines = before_close.splitlines(keepends=True)
                    new_lines = list(lines)
                    for li in range(len(lines) - 1, -1, -1):
                        code_only = _strip_jsonc(lines[li]).rstrip("\r\n ")
                        if code_only:
                            # find index of last non-ws char before any // or /* comment
                            ltxt = lines[li]
                            in_s = False
                            esc_s = False
                            last_code = -1
                            j = 0
                            while j < len(ltxt):
                                c = ltxt[j]
                                if in_s:
                                    last_code = j
                                    if esc_s:
                                        esc_s = False
                                    elif c == "\\":
                                        esc_s = True
                                    elif c == '"':
                                        in_s = False
                                    j += 1
                                    continue
                                if c == '"':
                                    in_s = True
                                    last_code = j
                                elif c == "/" and j + 1 < len(ltxt) and ltxt[j + 1] == "/":
                                    break
                                elif c == "/" and j + 1 < len(ltxt) and ltxt[j + 1] == "*":
                                    k = ltxt.find("*/", j + 2)
                                    j = k + 2 if k != -1 else len(ltxt)
                                    continue
                                elif c not in " \t\r\n":
                                    last_code = j
                                j += 1
                            if last_code >= 0:
                                new_lines[li] = ltxt[: last_code + 1] + "," + ltxt[last_code + 1 :]
                                break
                    before_close = "".join(new_lines)
                else:
                    before_close = before_close.rstrip() + ","
            updated = before_close + "\n" + ",\n".join(formatted) + after_close
    else:
        join_prefix = (insertion_prefix + " ") if inner_stripped else ""
        updated = raw[:arr_close] + join_prefix + ", ".join(json.dumps(item, ensure_ascii=False) for item in missing) + raw[arr_close:]

    try:
        json.loads(_strip_jsonc(updated))
    except ValueError as exc:
        return None, f"JSONC merge validation failed: {exc}"
    return (updated if updated.endswith("\n") else updated + "\n"), None

def _upsert_marker_block(existing: str, start: str, end: str, block: str) -> str:
    wrapped = f"{start}\n{block.strip()}\n{end}"
    if start in existing and end in existing:
        pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.DOTALL)
        updated = pattern.sub(lambda _m: wrapped, existing, count=1)
        return updated if updated.endswith("\n") else updated + "\n"
    stripped = existing.rstrip()
    if not stripped:
        return wrapped + "\n"
    return stripped + "\n\n" + wrapped + "\n"


def _strip_frontmatter(text: str) -> str:
    if not text.startswith("---\n"):
        return text
    parts = text.split("\n---\n", 1)
    if len(parts) == 2:
        return parts[1].lstrip("\n")
    return text


def _ensure_rule_link(
    src_rule: Path,
    dst_rule: Path,
    *,
    home: Path,
    dry_run: bool = False,
    transform_cursor_mdc: bool = False,
) -> tuple[bool, str | None]:
    if not src_rule.is_file():
        return False, None
    if _has_symlink_ancestor(dst_rule.parent, home):
        return False, f"skipped {dst_rule} (symlinked ancestor)"

    if transform_cursor_mdc:
        src_text = src_rule.read_text(encoding="utf-8")
        if src_text.startswith("---\n"):
            rendered = src_text
        else:
            rendered = (
                "---\n"
                f"description: Global JEO rule projected from {src_rule.name}\n"
                "alwaysApply: true\n"
                "---\n\n" + src_text
            )
        if dst_rule.is_symlink():
            if not dry_run:
                dst_rule.unlink()
        return _atomic_write_text(dst_rule, rendered, mode=0o644, dry_run=dry_run), None

    resolved_src = src_rule.resolve()
    if dst_rule.is_symlink():
        try:
            if dst_rule.resolve() == resolved_src:
                return False, None
        except OSError:
            pass
        if not dry_run:
            dst_rule.unlink()
    elif dst_rule.exists():
        try:
            text = dst_rule.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return False, f"skipped unreadable {dst_rule}"
        if (
            MANAGED_MARKER not in text
            and TOOL_FLOW_START not in text
            and SECOND_BRAIN_START not in text
            and WORKFLOW_START not in text
        ):
            return False, f"preserved user rule {dst_rule}"
        if not dry_run:
            dst_rule.unlink()

    if dry_run:
        return True, None
    dst_rule.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.symlink(str(src_rule), str(dst_rule))
        return True, None
    except OSError:
        return _atomic_write_text(dst_rule, src_rule.read_text(encoding="utf-8"), dry_run=False), None


def _resolve_repo_root(repo_root: Path | None) -> Path | None:
    if repo_root and (repo_root / "hooks").is_dir():
        return repo_root
    here = Path(__file__).resolve()
    for candidate in (
        here.parents[1],  # <repo>/scripts/setup-host-context.py
        here.parents[3],  # <repo>/.agent-skills/jeo-skill/scripts/setup-host-context.py
    ):
        if (candidate / "hooks" / "ingest-prompt.py").is_file():
            return candidate
    return None


def resolve_context_paths(
    home: Path,
    *,
    wiki_vault: str | None = None,
    second_brain_config: str | None = None,
    second_brain_vault: str | None = None,
    env: dict[str, str] | None = None,
) -> dict[str, Path]:
    e = env if env is not None else os.environ
    ctx_cfg_path = Path(
        (e.get("JEO_CONTEXT_CONFIG") or "").strip()
        or str(home / ".agents" / "context-config.json")
    ).expanduser()
    existing_ctx, _ = _read_json_dict(ctx_cfg_path)
    existing_ctx = existing_ctx or {}

    jeo_cfg, _ = _read_json_dict(home / ".jeo" / "config.json")
    jeo_wiki = jeo_cfg.get("wikiRoot") if isinstance(jeo_cfg, dict) else None

    if wiki_vault and wiki_vault.strip():
        resolved_wiki = Path(wiki_vault.strip()).expanduser()
    elif (e.get("LLM_WIKI_VAULT") or "").strip():
        resolved_wiki = Path(e["LLM_WIKI_VAULT"].strip()).expanduser()
    elif isinstance(existing_ctx.get("wikiVault"), str) and existing_ctx["wikiVault"].strip():
        resolved_wiki = Path(existing_ctx["wikiVault"].strip()).expanduser()
    elif isinstance(jeo_wiki, str) and jeo_wiki.strip():
        resolved_wiki = Path(jeo_wiki.strip()).expanduser()
    else:
        resolved_wiki = home / "vaults" / "llm-wiki"

    if second_brain_config and second_brain_config.strip():
        resolved_sb_cfg = Path(second_brain_config.strip()).expanduser()
    elif (e.get("JEO_SECOND_BRAIN_CONFIG") or "").strip():
        resolved_sb_cfg = Path(e["JEO_SECOND_BRAIN_CONFIG"].strip()).expanduser()
    elif isinstance(existing_ctx.get("secondBrainConfig"), str) and existing_ctx["secondBrainConfig"].strip():
        resolved_sb_cfg = Path(existing_ctx["secondBrainConfig"].strip()).expanduser()
    else:
        resolved_sb_cfg = home / ".jeo" / "second-brain-config.json"
    sb_cfg_data, _ = _read_json_dict(resolved_sb_cfg)
    sb_cfg_vault = sb_cfg_data.get("vault") if isinstance(sb_cfg_data, dict) else None

    if second_brain_vault and second_brain_vault.strip():
        resolved_sb_vault = Path(second_brain_vault.strip()).expanduser()
    elif isinstance(sb_cfg_vault, str) and sb_cfg_vault.strip():
        resolved_sb_vault = Path(sb_cfg_vault.strip()).expanduser()
    elif isinstance(existing_ctx.get("secondBrainVault"), str) and existing_ctx["secondBrainVault"].strip():
        resolved_sb_vault = Path(existing_ctx["secondBrainVault"].strip()).expanduser()
    else:
        resolved_sb_vault = home / "vaults" / "jeo-second-brain"

    return {
        "context_config": ctx_cfg_path,
        "wiki_vault": resolved_wiki,
        "second_brain_config": resolved_sb_cfg,
        "second_brain_vault": resolved_sb_vault,
        "hooks_dir": home / ".agents" / "hooks",
        "rules_dir": home / ".agents" / "rules",
        "ctx_shim": home / ".local" / "bin" / "ctx",
    }


def _render_tool_flow_rule(paths: dict[str, Path]) -> str:
    wiki_vault = paths["wiki_vault"]
    return (
        "---\n"
        "description: Tool flow for search and shell output (semble, rtk), graphify, llm-wiki and obsidian; read before code discovery or vault work\n"
        "alwaysApply: true\n"
        "---\n"
        f"{TOOL_FLOW_START}\n"
        "# Tool Flow (semble · rtk · graphify · llm-wiki · obsidian)\n\n"
        "Global always-applied rule for coding-agent runtimes.\n\n"
        "## Code Search & Shell Output (rtk × semble)\n"
        '- Discovery: `semble search "<query>" <path>` FIRST; expand with `semble find-related <file> <line> <path>`. No grep+read of whole files for discovery.\n'
        "- Exact match / all other shell: normal commands; the rtk shell hook compresses output (`rtk git status`, `rtk grep`, `rtk read`, `rtk test`, `rtk lint`).\n\n"
        "## Durable Structure (graphify)\n"
        "- Read `graphify-out/GRAPH_REPORT.md` (then `graph.html`, `graph.json`) BEFORE rebuilding; refresh via `ctx refresh` or `graphify update .`.\n\n"
        "## Knowledge Pipeline (llm-wiki — Config-Driven Global Vault)\n"
        f"- Context config SSOT: `{paths['context_config']}` (canonical wiki vault: `{wiki_vault}`, override via `$LLM_WIKI_VAULT` / `$CTX_VAULT`).\n"
        "- On follow-up or knowledge queries, read `<wikiVault>/index.md` FIRST, then `<wikiVault>/wiki/` pages; file durable findings into `<wikiVault>/wiki/queries/` or `<wikiVault>/wiki/reports/`. `<wikiVault>/raw/` is immutable source-of-truth.\n"
        f"- Lifecycle tool: `{paths['ctx_shim']}` (`ctx status`, `ctx refresh`, `ctx doctor`).\n\n"
        "## Desktop Persistence (obsidian)\n"
        '- Persist/hand off via the official obsidian CLI/URI (`obsidian vault="<Vault>" read path="..."`), deterministic `vault=` + `path=`.\n'
        f"{TOOL_FLOW_END}\n"
    )


def _render_second_brain_rule(paths: dict[str, Path]) -> str:
    return (
        "---\n"
        "description: Global Second Brain & shared context vault rules across coding-agent hosts\n"
        "alwaysApply: true\n"
        "---\n"
        f"{SECOND_BRAIN_START}\n"
        "# Second Brain & Global Context Rules\n\n"
        "- **Global SSOT**: Do NOT duplicate vault indexes, `.zvec-grep`, or `ctx/logs` inside per-host directories.\n"
        f"- **Shared context config**: `{paths['context_config']}`\n"
        f"- **Turn-ingest / Wiki vault**: `{paths['wiki_vault']}` (`$LLM_WIKI_VAULT` / `wikiVault`)\n"
        f"- **Second Brain vault**: `{paths['second_brain_vault']}` via `{paths['second_brain_config']}` (`$JEO_SECOND_BRAIN_CONFIG`)\n"
        "- **Immutability**: Treat `raw/**` as immutable user sources; summarize/connect notes inside structured markdown layers.\n"
        "- **Runtime CLI**: Use `second-brain` (`~/.local/bin/second-brain`) for vault queries/ingest and `ctx` (`~/.local/bin/ctx`) for cross-layer refresh (`mex` + `zvec` + `vault` + `graphify`).\n"
        f"{SECOND_BRAIN_END}\n"
    )


def _render_workflow_pointer(home: Path) -> str:
    return (
        "## Workflow rules\n"
        "Every prompt: openspace route → rtk shell → semble search → jev (only after rtk and\n"
        "semble, if a profile is enabled) → then by query: knowledge → second-brain vault,\n"
        "code/memory → `.mex/`, semantic search → `zg query`, ontology → open-ontologies,\n"
        "harness changes → `.harness2/`. Code graph/DB fallback: `jeox` (`.jeo/db/jeo.db`,\n"
        "managed exclusively by `../jeo-code` — `jeo jeox who-calls|what-calls|where-defined|impact|query`,\n"
        f"MCP `tools.jeox.*`). Full rules: `.agents/rules/jeo-workflows.md` (global copy `{home / '.agents/rules/jeo-workflows.md'}`)."
    )


def _render_context_pointer(paths: dict[str, Path]) -> str:
    return (
        "## Global Context & Vault Pointers (SSOT)\n"
        f"- Shared context config: `{paths['context_config']}`\n"
        f"- Rules SSOT: `{paths['rules_dir']}` (`jeo-workflows.md`, `jeo-tool-flow.md`, `jeo-second-brain.md`)\n"
        f"- Hooks SSOT: `{paths['hooks_dir']}` (`ingest-prompt.py`, `ingest-output.py`, `ctx/`)\n"
        f"- Turn-ingest / Wiki vault (`wikiVault`): `{paths['wiki_vault']}`\n"
        f"- Second Brain vault (`secondBrainVault`): `{paths['second_brain_vault']}` (config: `{paths['second_brain_config']}`)"
    )


def _render_host_pointer_json(paths: dict[str, Path], host: str) -> dict[str, Any]:
    return {
        "version": 1,
        "managedBy": "jeo-skills",
        "host": host,
        "contextConfig": str(paths["context_config"]),
        "wikiVault": str(paths["wiki_vault"]),
        "secondBrainConfig": str(paths["second_brain_config"]),
        "secondBrainVault": str(paths["second_brain_vault"]),
        "hooksDir": str(paths["hooks_dir"]),
        "rulesDir": str(paths["rules_dir"]),
        "ctxBin": str(paths["ctx_shim"]),
    }


def _sync_global_hooks(
    repo_root: Path | None,
    hooks_dir: Path,
    *,
    dry_run: bool = False,
) -> list[str]:
    changed: list[str] = []
    if repo_root is None:
        return changed
    src_hooks = repo_root / "hooks"
    if not src_hooks.is_dir():
        return changed
    if hooks_dir.is_symlink():
        return changed

    if not dry_run:
        hooks_dir.mkdir(parents=True, exist_ok=True)

    for fname in MANAGED_CONTEXT_FILES:
        src_file = src_hooks / fname
        if not src_file.is_file():
            continue
        dst_file = hooks_dir / fname
        if dst_file.is_symlink():
            continue
        content = src_file.read_text(encoding="utf-8")
        mode = 0o755 if fname.endswith((".py", ".sh")) else 0o644
        if _atomic_write_text(dst_file, content, mode=mode, dry_run=dry_run):
            changed.append(str(dst_file))

    src_ctx = src_hooks / "ctx"
    dst_ctx = hooks_dir / "ctx"
    if src_ctx.is_dir() and not dst_ctx.is_symlink():
        for src_py in sorted(src_ctx.rglob("*.py")):
            if "__pycache__" in src_py.parts:
                continue
            rel = src_py.relative_to(src_ctx)
            dst_py = dst_ctx / rel
            if dst_py.is_symlink():
                continue
            content = src_py.read_text(encoding="utf-8")
            if _atomic_write_text(dst_py, content, mode=0o644, dry_run=dry_run):
                changed.append(str(dst_py))
    return changed


def _ensure_ctx_shim(shim_path: Path, *, dry_run: bool = False) -> bool:
    if shim_path.is_symlink():
        return False
    if shim_path.exists():
        try:
            existing = shim_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return False
        if "ctx — context-lifecycle tool" not in existing and MANAGED_MARKER not in existing:
            return False
    shim_content = (
        "#!/bin/sh\n"
        "# ctx — context-lifecycle tool (jeo-skills-managed: ctx-shim)\n"
        'PYTHONPATH="${HOME}/.agents/hooks${PYTHONPATH:+:$PYTHONPATH}" exec python3 -m ctx "$@"\n'
    )
    return _atomic_write_text(shim_path, shim_content, mode=0o755, dry_run=dry_run)


def _sync_global_ssot(
    home: Path,
    paths: dict[str, Path],
    repo_root: Path | None,
    *,
    dry_run: bool = False,
    include_hooks: bool = True,
) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    notes: list[str] = []

    cfg_path = paths["context_config"]
    existing_cfg, cfg_err = _read_json_dict(cfg_path)
    if cfg_err:
        notes.append(cfg_err)
    else:
        merged_cfg = dict(existing_cfg or {})
        merged_cfg["version"] = 1
        merged_cfg.setdefault("wikiVault", str(paths["wiki_vault"]))
        merged_cfg.setdefault("secondBrainConfig", str(paths["second_brain_config"]))
        merged_cfg.setdefault("secondBrainVault", str(paths["second_brain_vault"]))
        # Keep config pointers consistent if CLI overrides were supplied explicitly,
        # while always keeping hooksDir / rulesDir pointing at global SSOT.
        merged_cfg["wikiVault"] = str(paths["wiki_vault"])
        merged_cfg["secondBrainConfig"] = str(paths["second_brain_config"])
        merged_cfg["secondBrainVault"] = str(paths["second_brain_vault"])
        merged_cfg["hooksDir"] = str(paths["hooks_dir"])
        merged_cfg["rulesDir"] = str(paths["rules_dir"])
        if _write_json_if_changed(cfg_path, merged_cfg, dry_run=dry_run):
            changed.append(str(cfg_path))

    rules_dir = paths["rules_dir"]
    if not rules_dir.is_symlink():
        tool_flow_path = rules_dir / "jeo-tool-flow.md"
        existing_tf = ""
        if tool_flow_path.is_file() and not tool_flow_path.is_symlink():
            existing_tf = tool_flow_path.read_text(encoding="utf-8", errors="replace")
        # Preserve any user-authored tail (e.g. ## Local Custom Rules) outside markers.
        new_tf_body = _render_tool_flow_rule(paths)
        if TOOL_FLOW_START in existing_tf and TOOL_FLOW_END in existing_tf:
            marker_chunk = (
                TOOL_FLOW_START
                + new_tf_body.split(TOOL_FLOW_START, 1)[1].rsplit(TOOL_FLOW_END, 1)[0]
                + TOOL_FLOW_END
            )
            pattern = re.compile(re.escape(TOOL_FLOW_START) + r".*?" + re.escape(TOOL_FLOW_END), re.DOTALL)
            updated_tf = pattern.sub(lambda _m: marker_chunk, existing_tf, count=1)
            if not updated_tf.startswith("---\n"):
                front = new_tf_body.split(TOOL_FLOW_START, 1)[0]
                updated_tf = front + updated_tf.lstrip("\n")
            if not updated_tf.endswith("\n"):
                updated_tf += "\n"
        else:
            updated_tf = new_tf_body
        if _atomic_write_text(tool_flow_path, updated_tf, mode=0o644, dry_run=dry_run):
            changed.append(str(tool_flow_path))

        sb_rule_path = rules_dir / "jeo-second-brain.md"
        if _atomic_write_text(sb_rule_path, _render_second_brain_rule(paths), mode=0o644, dry_run=dry_run):
            changed.append(str(sb_rule_path))

    if include_hooks:
        changed.extend(_sync_global_hooks(repo_root, paths["hooks_dir"], dry_run=dry_run))
        if _ensure_ctx_shim(paths["ctx_shim"], dry_run=dry_run):
            changed.append(str(paths["ctx_shim"]))

    return changed, notes


def _is_legacy_or_managed_command(cmd: str) -> bool:
    return any(tok in cmd for tok in LEGACY_INGEST_MARKERS)


def _merge_claude_hook_list(
    existing_entries: Any,
    desired_cmds: list[tuple[str, str, int]],
) -> list[dict[str, Any]]:
    """Preserve external hooks, replace legacy/managed ingest hooks cleanly."""
    cleaned: list[dict[str, Any]] = []
    if isinstance(existing_entries, list):
        for group in existing_entries:
            if not isinstance(group, dict):
                continue
            hooks = group.get("hooks")
            if not isinstance(hooks, list):
                cleaned.append(group)
                continue
            kept_hooks = [
                h for h in hooks
                if not (isinstance(h, dict) and isinstance(h.get("command"), str) and _is_legacy_or_managed_command(h["command"]))
            ]
            if kept_hooks:
                new_group = dict(group)
                new_group["hooks"] = kept_hooks
                cleaned.append(new_group)
    for _label, cmd, timeout_s in desired_cmds:
        # Avoid adding duplicate PostCompact if user already has direct runtime.py postcompact.
        if "second-brain-compact" in cmd and any(
            "runtime.py" in str(h.get("command", "")) and "postcompact" in str(h.get("command", "")).lower()
            for g in cleaned
            for h in (g.get("hooks") or [])
            if isinstance(h, dict)
        ):
            continue
        hook_obj: dict[str, Any] = {"type": "command", "command": cmd}
        if timeout_s:
            hook_obj["timeout"] = timeout_s
        cleaned.append({"hooks": [hook_obj]})
    return cleaned


def _merge_gemini_hook_list(
    existing_entries: Any,
    desired_cmds: list[tuple[str, str, int]],
) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    if isinstance(existing_entries, list):
        for group in existing_entries:
            if not isinstance(group, dict):
                continue
            hooks = group.get("hooks")
            if not isinstance(hooks, list):
                cleaned.append(group)
                continue
            kept_hooks = [
                h for h in hooks
                if not (
                    isinstance(h, dict)
                    and (
                        (isinstance(h.get("command"), str) and _is_legacy_or_managed_command(h["command"]))
                        or str(h.get("name") or "").startswith(("llm-wiki-ingest", "jeo-context"))
                    )
                )
            ]
            if kept_hooks:
                new_group = dict(group)
                new_group["hooks"] = kept_hooks
                cleaned.append(new_group)
    for name, cmd, timeout_ms in desired_cmds:
        cleaned.append(
            {
                "matcher": "",
                "hooks": [
                    {
                        "name": name,
                        "type": "command",
                        "command": cmd,
                        "timeout": timeout_ms,
                    }
                ],
            }
        )
    return cleaned


def _sync_instruction_file(
    path: Path,
    home: Path,
    paths: dict[str, Path],
    *,
    dry_run: bool = False,
) -> tuple[bool, str | None]:
    if path.is_symlink() or _has_symlink_ancestor(path.parent, home):
        return False, f"skipped symlinked instruction {path}"
    existing = ""
    if path.exists():
        try:
            existing = path.read_text(encoding="utf-8")
        except OSError as exc:
            return False, f"unreadable {path}: {exc}"
    updated = existing
    if WORKFLOW_START not in updated or WORKFLOW_END not in updated:
        updated = _upsert_marker_block(updated, WORKFLOW_START, WORKFLOW_END, _render_workflow_pointer(home))
    updated = _upsert_marker_block(updated, CONTEXT_START, CONTEXT_END, _render_context_pointer(paths))
    return _atomic_write_text(path, updated, mode=0o644, dry_run=dry_run), None


def _sync_rules_dir(
    rules_target_dir: Path,
    paths: dict[str, Path],
    *,
    home: Path,
    dry_run: bool = False,
    cursor_mdc: bool = False,
) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    notes: list[str] = []
    if _has_symlink_ancestor(rules_target_dir, home):
        return changed, [f"skipped symlinked rules dir {rules_target_dir}"]
    for rule_name in RULE_NAMES:
        src = paths["rules_dir"] / rule_name
        if not src.is_file():
            continue
        dst_name = Path(rule_name).with_suffix(".mdc").name if cursor_mdc else rule_name
        did_change, note = _ensure_rule_link(
            src,
            rules_target_dir / dst_name,
            home=home,
            dry_run=dry_run,
            transform_cursor_mdc=cursor_mdc,
        )
        if did_change:
            changed.append(str(rules_target_dir / dst_name))
        if note:
            notes.append(note)
    return changed, notes


def _render_pi_extension() -> str:
    return """// jeo-skills-managed: llm-wiki-ingest
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type ExtensionContext = {
  cwd?: string;
  sessionManager?: { getSessionId?: () => string };
};

type BeforeAgentStartEvent = { prompt?: string };
type AgentEndEvent = {
  message?: { content?: unknown };
  messages?: Array<{ role?: string; content?: unknown }>;
};

type ExtensionHost = {
  on: (event: string, handler: (...args: any[]) => void) => void;
};

function resolveVault(): string {
  if (process.env.LLM_WIKI_VAULT) return process.env.LLM_WIKI_VAULT;
  const cfgPath = process.env.JEO_CONTEXT_CONFIG || join(homedir(), ".agents", "context-config.json");
  try {
    if (existsSync(cfgPath)) {
      const parsed = JSON.parse(readFileSync(cfgPath, "utf-8"));
      if (parsed && typeof parsed.wikiVault === "string" && parsed.wikiVault.trim()) {
        return parsed.wikiVault.replace(/^~(?=\\/|$)/, homedir());
      }
    }
  } catch {
    // ignore malformed config
  }
  return join(homedir(), "vaults", "llm-wiki");
}

function pipeToPython(scriptPath: string, payload: Record<string, unknown>, extraEnv?: Record<string, string>): void {
  if (!existsSync(scriptPath)) return;
  try {
    const child = spawn("python3", [scriptPath], {
      stdio: ["pipe", "ignore", "ignore"],
      detached: true,
      env: { ...process.env, LLM_WIKI_VAULT: resolveVault(), ...(extraEnv || {}) },
    });
    child.unref();
    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();
  } catch {
    // non-fatal
  }
}

function runCtxHook(action: string): void {
  const ctxHook = join(homedir(), ".agents", "hooks", "ctx-hook.sh");
  if (!existsSync(ctxHook)) return;
  try {
    const child = spawn("/bin/sh", [ctxHook, action], {
      stdio: "ignore",
      detached: true,
      env: { ...process.env, LLM_WIKI_VAULT: resolveVault() },
    });
    child.unref();
  } catch {
    // non-fatal
  }
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const rec = item as Record<string, unknown>;
          if (typeof rec.text === "string") return rec.text;
          if (typeof rec.content === "string") return rec.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\\n");
  }
  return "";
}

export default function registerJeoContextIngest(pi: ExtensionHost): void {
  const hooksDir = join(homedir(), ".agents", "hooks");
  const promptIngest = join(hooksDir, "ingest-prompt.py");

  pi.on("before_agent_start", (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    const prompt = typeof event?.prompt === "string" ? event.prompt.trim() : "";
    if (!prompt) return;
    const sessionId = ctx?.sessionManager?.getSessionId?.() || undefined;
    pipeToPython(promptIngest, {
      hook_event_name: "before_agent_start",
      prompt,
      session_id: sessionId,
      cwd: ctx?.cwd || process.cwd(),
    });
  });

  pi.on("agent_end", (event: AgentEndEvent, ctx: ExtensionContext) => {
    const message = event?.message;
    const lastMsg = message || (Array.isArray(event?.messages) ? event.messages[event.messages.length - 1] : undefined);
    const text = extractText(lastMsg?.content);
    if (!text.trim()) return;
    const sessionId = ctx?.sessionManager?.getSessionId?.() || undefined;
    pipeToPython(
      promptIngest,
      {
        hook_event_name: "Stop",
        assistant_output: text,
        session_id: sessionId,
        cwd: ctx?.cwd || process.cwd(),
      },
      { JEO_HOOK_EVENT: "Stop" }
    );
  });

  pi.on("session_shutdown", () => {
    runCtxHook("refresh-bg");
  });
}
"""


def _opencode_major() -> int:
    try:
        out = subprocess.run(["opencode", "--version"], capture_output=True, text=True, timeout=10).stdout
        match = re.search(r"(\d+)\.\d+", out)
        return int(match.group(1)) if match else 2
    except (OSError, subprocess.SubprocessError):
        return 2


def _render_opencode_plugin(use_v2: bool) -> str:
    common = """// jeo-skills-managed: jeo-context-ingest
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function resolveVault() {
  if (process.env.LLM_WIKI_VAULT) return process.env.LLM_WIKI_VAULT;
  const cfgPath = process.env.JEO_CONTEXT_CONFIG || join(homedir(), ".agents", "context-config.json");
  try {
    if (existsSync(cfgPath)) {
      const parsed = JSON.parse(readFileSync(cfgPath, "utf-8"));
      if (parsed && typeof parsed.wikiVault === "string" && parsed.wikiVault.trim()) {
        return parsed.wikiVault.replace(/^~(?=\\/|$)/, homedir());
      }
    }
  } catch {
    // ignore malformed config
  }
  return join(homedir(), "vaults", "llm-wiki");
}

function pipeIngest(payload, extraEnv) {
  const scriptPath = join(homedir(), ".agents", "hooks", "ingest-prompt.py");
  if (!existsSync(scriptPath)) return;
  try {
    const child = spawn("python3", [scriptPath], {
      stdio: ["pipe", "ignore", "ignore"],
      detached: true,
      env: { ...process.env, LLM_WIKI_VAULT: resolveVault(), ...(extraEnv || {}) },
    });
    child.unref();
    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();
  } catch {
    // non-fatal
  }
}

function runCtxHook(action) {
  const ctxHook = join(homedir(), ".agents", "hooks", "ctx-hook.sh");
  if (!existsSync(ctxHook)) return;
  try {
    const child = spawn("/bin/sh", [ctxHook, action, "opencode"], {
      stdio: "ignore",
      detached: true,
      env: { ...process.env, LLM_WIKI_VAULT: resolveVault() },
    });
    child.unref();
  } catch {
    // non-fatal
  }
}

const textByAssistantMsg = new Map();

function createServerHooks() {
  return {
    "chat.message": async (input, output) => {
      const parts = Array.isArray(output?.parts) ? output.parts : [];
      const prompt = parts
        .filter((part) => part?.type === "text" && !part.synthetic && typeof part.text === "string")
        .map((part) => part.text)
        .join("\\n")
        .trim();
      if (!prompt) return;
      pipeIngest({
        hook_event_name: "chat.message",
        prompt,
        session_id: input?.sessionID,
        cwd: process.cwd(),
      });
    },
    event: async ({ event }) => {
      if (!event?.type) return;
      const sessionID = event.properties?.sessionID;
      if (event.type === "session.next.prompt.admitted") {
        const prompt = event.properties?.prompt?.text;
        if (typeof prompt === "string" && prompt.trim()) {
          pipeIngest({
            hook_event_name: "chat.message",
            prompt: prompt.trim(),
            session_id: sessionID,
            cwd: process.cwd(),
          });
        }
        return;
      }
      if (event.type === "session.next.text.delta") {
        const id = event.properties?.assistantMessageID;
        const delta = event.properties?.delta;
        if (typeof id === "string" && typeof delta === "string") {
          const prev = textByAssistantMsg.get(id) || "";
          if (textByAssistantMsg.size >= 64) textByAssistantMsg.delete(textByAssistantMsg.keys().next().value);
          textByAssistantMsg.set(id, prev + delta);
        }
        return;
      }
      if (event.type === "session.next.text.ended") {
        const id = event.properties?.assistantMessageID;
        const text = typeof event.properties?.text === "string"
          ? event.properties.text
          : (typeof id === "string" ? textByAssistantMsg.get(id) : "");
        if (typeof id === "string") textByAssistantMsg.delete(id);
        if (typeof text === "string" && text.trim()) {
          pipeIngest(
            {
              hook_event_name: "Stop",
              assistant_output: text,
              session_id: sessionID,
              cwd: process.cwd(),
            },
            { JEO_HOOK_EVENT: "Stop" }
          );
        }
        return;
      }
      if (event.type === "session.idle") {
        runCtxHook("refresh-bg");
      }
    },
  };
}
"""
    if not use_v2:
        return common + "\nexport const JeoContextIngest = async () => createServerHooks();\n"
    return (
        common
        + """
export default {
  id: "jeo-context-ingest",
  server: async () => createServerHooks(),
  setup: async (ctx) => {
    if (!ctx || typeof ctx.session?.hook !== "function") return;
    await ctx.session.hook("prompt", async (input) => {
      const text = input?.prompt?.text;
      if (typeof text !== "string" || !text.trim()) return;
      pipeIngest({
        hook_event_name: "chat.message",
        prompt: text.trim(),
        session_id: input?.sessionID,
        cwd: process.cwd(),
      });
    });
  },
};
"""
    )


def _sync_claude(
    target_dir: Path,
    home: Path,
    paths: dict[str, Path],
    *,
    dry_run: bool,
    include_hooks: bool,
) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    notes: list[str] = []

    did_md, note = _sync_instruction_file(target_dir / "CLAUDE.md", home, paths, dry_run=dry_run)
    if did_md:
        changed.append(str(target_dir / "CLAUDE.md"))
    if note:
        notes.append(note)

    r_changed, r_notes = _sync_rules_dir(target_dir / "rules", paths, home=home, dry_run=dry_run)
    changed.extend(r_changed)
    notes.extend(r_notes)

    ptr_path = target_dir / "jeo-context.json"
    if _write_json_if_changed(ptr_path, _render_host_pointer_json(paths, "claude"), dry_run=dry_run):
        changed.append(str(ptr_path))

    if include_hooks:
        settings_path = target_dir / "settings.json"
        data, err = _read_json_dict(settings_path)
        if err:
            notes.append(err)
        else:
            settings = dict(data or {})
            hooks = settings.get("hooks")
            if not isinstance(hooks, dict):
                hooks = {}
            hooks = dict(hooks)
            ingest_cmd = f'python3 {shlex.quote(str(paths["hooks_dir"] / "ingest-prompt.py"))}'
            ctx_shim_q = shlex.quote(str(paths["ctx_shim"]))
            ctx_refresh_cmd = f'{ctx_shim_q} refresh --scope all || true'
            ctx_refresh_bg = f'nohup {ctx_shim_q} refresh --scope all >/dev/null 2>&1 &'
            sb_compact_cmd = f'/bin/sh {shlex.quote(str(paths["hooks_dir"] / "ctx-hook.sh"))} second-brain-compact'

            hooks["UserPromptSubmit"] = _merge_claude_hook_list(
                hooks.get("UserPromptSubmit"), [("ingest-prompt", ingest_cmd, 10)]
            )
            hooks["Stop"] = _merge_claude_hook_list(
                hooks.get("Stop"), [("ingest-output", ingest_cmd, 15)]
            )
            hooks["TaskCompleted"] = _merge_claude_hook_list(
                hooks.get("TaskCompleted"), [("ctx-refresh", ctx_refresh_cmd, 30)]
            )
            hooks["SessionEnd"] = _merge_claude_hook_list(
                hooks.get("SessionEnd"), [("ctx-refresh-bg", ctx_refresh_bg, 5)]
            )
            hooks["PostCompact"] = _merge_claude_hook_list(
                hooks.get("PostCompact"), [("second-brain-compact", sb_compact_cmd, 30)]
            )
            settings["hooks"] = hooks

            env = settings.get("env")
            if not isinstance(env, dict):
                env = {}
            env = dict(env)
            env["JEO_CONTEXT_CONFIG"] = str(paths["context_config"])
            env["LLM_WIKI_VAULT"] = str(paths["wiki_vault"])
            settings["env"] = env

            if _write_json_if_changed(settings_path, settings, dry_run=dry_run):
                changed.append(str(settings_path))

    return changed, notes


def _sync_codex(
    target_dir: Path,
    home: Path,
    paths: dict[str, Path],
    *,
    dry_run: bool,
    include_hooks: bool,
) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    notes: list[str] = []

    did_md, note = _sync_instruction_file(target_dir / "AGENTS.md", home, paths, dry_run=dry_run)
    if did_md:
        changed.append(str(target_dir / "AGENTS.md"))
    if note:
        notes.append(note)

    r_changed, r_notes = _sync_rules_dir(target_dir / "rules", paths, home=home, dry_run=dry_run)
    changed.extend(r_changed)
    notes.extend(r_notes)

    ptr_path = target_dir / "jeo-context.json"
    if _write_json_if_changed(ptr_path, _render_host_pointer_json(paths, "codex"), dry_run=dry_run):
        changed.append(str(ptr_path))

    if include_hooks:
        hooks_path = target_dir / "hooks.json"
        data, err = _read_json_dict(hooks_path)
        if err:
            notes.append(err)
        else:
            root = dict(data or {})
            hooks = root.get("hooks")
            if not isinstance(hooks, dict):
                hooks = {}
            hooks = dict(hooks)
            wrapper = str(paths["hooks_dir"] / "llm-wiki-ingest.sh")
            ctx_hook = str(paths["hooks_dir"] / "ctx-hook.sh")
            hooks["UserPromptSubmit"] = _merge_claude_hook_list(
                hooks.get("UserPromptSubmit"), [("codex-prompt", f'/bin/sh "{wrapper}" codex', 10)]
            )
            hooks["Stop"] = _merge_claude_hook_list(
                hooks.get("Stop"), [("codex-stop", f'/bin/sh "{wrapper}" codex-stop', 15)]
            )
            hooks["SessionEnd"] = _merge_claude_hook_list(
                hooks.get("SessionEnd"), [("codex-ctx", f'/bin/sh "{ctx_hook}" refresh-bg codex', 5)]
            )
            root["hooks"] = hooks
            if _write_json_if_changed(hooks_path, root, dry_run=dry_run):
                changed.append(str(hooks_path))

    return changed, notes


def _sync_jeo(
    target_dir: Path,
    home: Path,
    paths: dict[str, Path],
    *,
    dry_run: bool,
    include_hooks: bool,
) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    notes: list[str] = []

    did_agent_md, note = _sync_instruction_file(target_dir / "agent" / "AGENTS.md", home, paths, dry_run=dry_run)
    if did_agent_md:
        changed.append(str(target_dir / "agent" / "AGENTS.md"))
    if note:
        notes.append(note)

    if (target_dir / "AGENTS.md").exists():
        did_top_md, note2 = _sync_instruction_file(target_dir / "AGENTS.md", home, paths, dry_run=dry_run)
        if did_top_md:
            changed.append(str(target_dir / "AGENTS.md"))
        if note2:
            notes.append(note2)

    r_changed, r_notes = _sync_rules_dir(target_dir / "rules", paths, home=home, dry_run=dry_run)
    changed.extend(r_changed)
    notes.extend(r_notes)

    ptr_path = target_dir / "jeo-context.json"
    if _write_json_if_changed(ptr_path, _render_host_pointer_json(paths, "jeo"), dry_run=dry_run):
        changed.append(str(ptr_path))

    if include_hooks:
        hooks_path = target_dir / "hooks.json"
        data, err = _read_json_dict(hooks_path)
        if err:
            notes.append(err)
        else:
            root = dict(data or {})
            entries = root.get("hooks")
            kept: list[dict[str, Any]] = []
            if isinstance(entries, list):
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    run_cmd = str(entry.get("run") or "")
                    if _is_legacy_or_managed_command(run_cmd):
                        continue
                    kept.append(entry)
            ingest_py = str(paths["hooks_dir"] / "ingest-prompt.py")
            ctx_hook = str(paths["hooks_dir"] / "ctx-hook.sh")
            kept.extend(
                [
                    {"event": "pre-prompt", "run": f'python3 "{ingest_py}"', "timeoutMs": 10000},
                    {"event": "turn-end", "run": f'env JEO_HOOK_EVENT=Stop python3 "{ingest_py}"', "timeoutMs": 10000},
                    {"event": "post-implementation", "run": f'/bin/sh "{ctx_hook}" refresh-bg', "timeoutMs": 5000},
                ]
            )
            root["hooks"] = kept
            if _write_json_if_changed(hooks_path, root, dry_run=dry_run):
                changed.append(str(hooks_path))

    return changed, notes


def _sync_agent_extension_host(
    host: str,
    agent_dir: Path,
    home: Path,
    paths: dict[str, Path],
    *,
    dry_run: bool,
    include_hooks: bool,
) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    notes: list[str] = []

    did_md, note = _sync_instruction_file(agent_dir / "AGENTS.md", home, paths, dry_run=dry_run)
    if did_md:
        changed.append(str(agent_dir / "AGENTS.md"))
    if note:
        notes.append(note)

    r_changed, r_notes = _sync_rules_dir(agent_dir / "rules", paths, home=home, dry_run=dry_run)
    changed.extend(r_changed)
    notes.extend(r_notes)

    ptr_path = agent_dir / "jeo-context.json"
    if _write_json_if_changed(ptr_path, _render_host_pointer_json(paths, host), dry_run=dry_run):
        changed.append(str(ptr_path))

    if include_hooks:
        ext_path = agent_dir / "extensions" / "llm-wiki-ingest.ts"
        can_write = True
        if ext_path.is_symlink():
            can_write = False
            notes.append(f"skipped symlinked extension {ext_path}")
        elif ext_path.exists():
            try:
                old = ext_path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                can_write = False
            else:
                is_legacy = (
                    ("ingest-prompt.py" in old or "ingest-output.py" in old)
                    and ("vaults/llm-wiki" in old or "llm-wiki" in old)
                )
                if MANAGED_MARKER not in old and not is_legacy:
                    can_write = False
                    notes.append(f"preserved custom extension {ext_path}")
        if can_write:
            if _atomic_write_text(ext_path, _render_pi_extension(), mode=0o644, dry_run=dry_run):
                changed.append(str(ext_path))

    return changed, notes


def _sync_opencode(
    target_dir: Path,
    home: Path,
    paths: dict[str, Path],
    *,
    dry_run: bool,
    include_hooks: bool,
) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    notes: list[str] = []

    did_md, note = _sync_instruction_file(target_dir / "AGENTS.md", home, paths, dry_run=dry_run)
    if did_md:
        changed.append(str(target_dir / "AGENTS.md"))
    if note:
        notes.append(note)

    r_changed, r_notes = _sync_rules_dir(target_dir / "rules", paths, home=home, dry_run=dry_run)
    changed.extend(r_changed)
    notes.extend(r_notes)

    ptr_path = target_dir / "jeo-context.json"
    if _write_json_if_changed(ptr_path, _render_host_pointer_json(paths, "opencode"), dry_run=dry_run):
        changed.append(str(ptr_path))

    # Additive JSONC-preserving merge of global SSOT rules into opencode.jsonc / opencode.json
    desired_instructions = [
        str(paths["rules_dir"] / fname)
        for fname in ("jeo-workflows.md", "jeo-tool-flow.md", "jeo-second-brain.md")
        if (paths["rules_dir"] / fname).is_file() or dry_run
    ]
    if desired_instructions:
        cfg_candidates = [target_dir / "opencode.jsonc", target_dir / "opencode.json"]
        cfg_path = next((p for p in cfg_candidates if p.exists() or p.is_symlink()), None)
        if cfg_path is not None:
            data, raw, err = _read_jsonc_dict(cfg_path)
            if err:
                notes.append(err)
            elif data is not None:
                updated_raw, merge_err = _upsert_opencode_jsonc_instructions(raw, data, desired_instructions)
                if merge_err:
                    notes.append(f"{cfg_path}: {merge_err}")
                elif updated_raw is not None and updated_raw != raw:
                    if _atomic_write_text(cfg_path, updated_raw, mode=0o644, dry_run=dry_run):
                        changed.append(str(cfg_path))
        else:
            default_cfg = target_dir / "opencode.json"
            if _write_json_if_changed(default_cfg, {"instructions": desired_instructions}, dry_run=dry_run):
                changed.append(str(default_cfg))

    if include_hooks:
        plugin_path = target_dir / "plugins" / "jeo-context-ingest.js"
        if plugin_path.is_symlink():
            notes.append(f"skipped symlinked plugin {plugin_path}")
        else:
            use_v2 = _opencode_major() >= 2
            if _atomic_write_text(plugin_path, _render_opencode_plugin(use_v2), mode=0o644, dry_run=dry_run):
                changed.append(str(plugin_path))

    return changed, notes


def _sync_gemini_cli_root(
    host: str,
    target_dir: Path,
    home: Path,
    paths: dict[str, Path],
    *,
    dry_run: bool,
    include_hooks: bool,
) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    notes: list[str] = []

    did_md, note = _sync_instruction_file(target_dir / "GEMINI.md", home, paths, dry_run=dry_run)
    if did_md:
        changed.append(str(target_dir / "GEMINI.md"))
    if note:
        notes.append(note)

    r_changed, r_notes = _sync_rules_dir(target_dir / "rules", paths, home=home, dry_run=dry_run)
    changed.extend(r_changed)
    notes.extend(r_notes)

    ptr_path = target_dir / "jeo-context.json"
    if _write_json_if_changed(ptr_path, _render_host_pointer_json(paths, host), dry_run=dry_run):
        changed.append(str(ptr_path))

    if include_hooks:
        local_hook = target_dir / "hooks" / "llm-wiki-ingest.sh"
        if not local_hook.is_symlink() and (local_hook.exists() or host == "gemini"):
            wrapper_src = paths["hooks_dir"] / "llm-wiki-ingest.sh"
            hook_shim = (
                "#!/bin/sh\n"
                "# jeo-skills-managed: llm-wiki-ingest-delegate\n"
                f'exec /bin/sh "{wrapper_src}" "${{1:-gemini}}"\n'
            )
            if _atomic_write_text(local_hook, hook_shim, mode=0o755, dry_run=dry_run):
                changed.append(str(local_hook))

        settings_path = target_dir / "settings.json"
        data, err = _read_json_dict(settings_path)
        if err:
            notes.append(err)
        else:
            settings = dict(data or {})
            hooks = settings.get("hooks")
            if not isinstance(hooks, dict):
                hooks = {}
            hooks = dict(hooks)
            wrapper = str(paths["hooks_dir"] / "llm-wiki-ingest.sh")
            ctx_hook = str(paths["hooks_dir"] / "ctx-hook.sh")
            hooks["BeforeAgent"] = _merge_gemini_hook_list(
                hooks.get("BeforeAgent"), [("jeo-context-ingest-prompt", f'/bin/sh "{wrapper}" gemini', 10000)]
            )
            hooks["AfterAgent"] = _merge_gemini_hook_list(
                hooks.get("AfterAgent"), [("jeo-context-ingest-stop", f'/bin/sh "{wrapper}" gemini-stop', 10000)]
            )
            hooks["SessionEnd"] = _merge_gemini_hook_list(
                hooks.get("SessionEnd"), [("jeo-context-ctx-refresh", f'/bin/sh "{ctx_hook}" refresh-bg gemini', 5000)]
            )
            settings["hooks"] = hooks
            if _write_json_if_changed(settings_path, settings, dry_run=dry_run):
                changed.append(str(settings_path))

    return changed, notes


def _sync_antigravity_cli(
    target_dir: Path,
    home: Path,
    paths: dict[str, Path],
    *,
    dry_run: bool,
    include_hooks: bool,
) -> tuple[list[str], list[str]]:
    """Sync AGY CLI dir (~/.gemini/antigravity-cli); AGY hooks belong in ~/.gemini/config/hooks.json."""
    changed: list[str] = []
    notes: list[str] = []

    did_md, note = _sync_instruction_file(target_dir / "GEMINI.md", home, paths, dry_run=dry_run)
    if did_md:
        changed.append(str(target_dir / "GEMINI.md"))
    if note:
        notes.append(note)

    r_changed, r_notes = _sync_rules_dir(target_dir / "rules", paths, home=home, dry_run=dry_run)
    changed.extend(r_changed)
    notes.extend(r_notes)

    ptr_path = target_dir / "jeo-context.json"
    if _write_json_if_changed(ptr_path, _render_host_pointer_json(paths, "antigravity-cli"), dry_run=dry_run):
        changed.append(str(ptr_path))

    if include_hooks:
        local_hook = target_dir / "hooks" / "llm-wiki-ingest.sh"
        if not local_hook.is_symlink() and local_hook.exists():
            wrapper_src = paths["hooks_dir"] / "llm-wiki-ingest.sh"
            hook_shim = (
                "#!/bin/sh\n"
                "# jeo-skills-managed: llm-wiki-ingest-delegate\n"
                f'exec /bin/sh "{wrapper_src}" "${{1:-agy}}"\n'
            )
            if _atomic_write_text(local_hook, hook_shim, mode=0o755, dry_run=dry_run):
                changed.append(str(local_hook))

    return changed, notes


def _sync_agy_config(
    target_dir: Path,
    home: Path,
    paths: dict[str, Path],
    *,
    dry_run: bool,
    include_hooks: bool,
) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    notes: list[str] = []

    r_changed, r_notes = _sync_rules_dir(target_dir / "rules", paths, home=home, dry_run=dry_run)
    changed.extend(r_changed)
    notes.extend(r_notes)

    ptr_path = target_dir / "jeo-context.json"
    if _write_json_if_changed(ptr_path, _render_host_pointer_json(paths, "antigravity-config"), dry_run=dry_run):
        changed.append(str(ptr_path))

    if include_hooks:
        hooks_path = target_dir / "hooks.json"
        data, err = _read_json_dict(hooks_path)
        if err:
            notes.append(err)
        else:
            root = dict(data or {})
            wrapper = str(paths["hooks_dir"] / "llm-wiki-ingest.sh")
            ctx_hook = str(paths["hooks_dir"] / "ctx-hook.sh")
            root["jeo-context"] = {
                "PreInvocation": [
                    {"type": "command", "command": f'/bin/sh "{wrapper}" agy', "timeout": 10}
                ],
                "Stop": [
                    {"type": "command", "command": f'/bin/sh "{wrapper}" agy-stop', "timeout": 10},
                    {"type": "command", "command": f'/bin/sh "{ctx_hook}" refresh-bg agy', "timeout": 5},
                ],
            }
            if _write_json_if_changed(hooks_path, root, dry_run=dry_run):
                changed.append(str(hooks_path))

    return changed, notes


def _sync_antigravity_ide(
    target_dir: Path,
    home: Path,
    paths: dict[str, Path],
    *,
    dry_run: bool,
) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    notes: list[str] = []

    did_md, note = _sync_instruction_file(target_dir / "GEMINI.md", home, paths, dry_run=dry_run)
    if did_md:
        changed.append(str(target_dir / "GEMINI.md"))
    if note:
        notes.append(note)

    r_changed, r_notes = _sync_rules_dir(target_dir / "rules", paths, home=home, dry_run=dry_run)
    changed.extend(r_changed)
    notes.extend(r_notes)

    ptr_path = target_dir / "jeo-context.json"
    if _write_json_if_changed(ptr_path, _render_host_pointer_json(paths, "antigravity-ide"), dry_run=dry_run):
        changed.append(str(ptr_path))

    wf_path = target_dir / "global_workflows" / "jeo-context.md"
    wf_content = (
        "---\n"
        "description: JEO global context, shared rules, wiki vault, and Second Brain workflow\n"
        "---\n"
        f"{CONTEXT_START}\n"
        f"{_render_context_pointer(paths)}\n\n"
        "## Workflow\n"
        f"1. Inspect `{paths['rules_dir']}` (`jeo-workflows.md`, `jeo-tool-flow.md`, `jeo-second-brain.md`).\n"
        f"2. Read `{paths['wiki_vault']}/index.md` for wiki context or use `second-brain` (`{paths['second_brain_config']}`) for Second Brain notes.\n"
        f"3. Refresh shared context indexes via `{paths['ctx_shim']} refresh --scope all`.\n"
        f"{CONTEXT_END}\n"
    )
    if _atomic_write_text(wf_path, wf_content, mode=0o644, dry_run=dry_run):
        changed.append(str(wf_path))

    return changed, notes


def _sync_cursor(
    target_dir: Path,
    home: Path,
    paths: dict[str, Path],
    *,
    dry_run: bool,
    include_hooks: bool,
) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    notes: list[str] = []

    r_changed, r_notes = _sync_rules_dir(
        target_dir / "rules", paths, home=home, dry_run=dry_run, cursor_mdc=True
    )
    changed.extend(r_changed)
    notes.extend(r_notes)

    ptr_path = target_dir / "jeo-context.json"
    if _write_json_if_changed(ptr_path, _render_host_pointer_json(paths, "cursor"), dry_run=dry_run):
        changed.append(str(ptr_path))

    if include_hooks:
        hooks_path = target_dir / "hooks.json"
        data, err = _read_json_dict(hooks_path)
        if err:
            notes.append(err)
        else:
            root = dict(data or {})
            root.setdefault("version", 1)
            hooks = root.get("hooks")
            if not isinstance(hooks, dict):
                hooks = {}
            hooks = dict(hooks)
            wrapper = str(paths["hooks_dir"] / "llm-wiki-ingest.sh")
            ctx_hook = str(paths["hooks_dir"] / "ctx-hook.sh")

            def _merge_cursor(entries: Any, cmd: str) -> list[dict[str, Any]]:
                kept: list[dict[str, Any]] = []
                if isinstance(entries, list):
                    for item in entries:
                        if not isinstance(item, dict):
                            continue
                        if _is_legacy_or_managed_command(str(item.get("command") or "")):
                            continue
                        kept.append(item)
                kept.append({"command": cmd})
                return kept

            hooks["beforeSubmitPrompt"] = _merge_cursor(
                hooks.get("beforeSubmitPrompt"), f'/bin/sh "{wrapper}" cursor-prompt'
            )
            hooks["stop"] = _merge_cursor(
                hooks.get("stop"), f'/bin/sh "{wrapper}" cursor-stop'
            )
            hooks["sessionEnd"] = _merge_cursor(
                hooks.get("sessionEnd"), f'/bin/sh "{ctx_hook}" refresh-bg cursor'
            )
            root["hooks"] = hooks
            if _write_json_if_changed(hooks_path, root, dry_run=dry_run):
                changed.append(str(hooks_path))

    return changed, notes


def _sync_kimi(
    target_dir: Path,
    home: Path,
    paths: dict[str, Path],
    *,
    dry_run: bool,
    include_hooks: bool,
) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    notes: list[str] = []

    did_md, note = _sync_instruction_file(target_dir / "AGENTS.md", home, paths, dry_run=dry_run)
    if did_md:
        changed.append(str(target_dir / "AGENTS.md"))
    if note:
        notes.append(note)

    r_changed, r_notes = _sync_rules_dir(target_dir / "rules", paths, home=home, dry_run=dry_run)
    changed.extend(r_changed)
    notes.extend(r_notes)

    ptr_path = target_dir / "jeo-context.json"
    if _write_json_if_changed(ptr_path, _render_host_pointer_json(paths, "kimi"), dry_run=dry_run):
        changed.append(str(ptr_path))

    if include_hooks:
        cfg_path = target_dir / "config.toml"
        if cfg_path.is_symlink():
            notes.append(f"skipped symlinked {cfg_path}")
        else:
            existing = cfg_path.read_text(encoding="utf-8") if cfg_path.exists() else ""
            wrapper = str(paths["hooks_dir"] / "llm-wiki-ingest.sh").replace('"', '\\"')
            ctx_hook = str(paths["hooks_dir"] / "ctx-hook.sh").replace('"', '\\"')
            block = (
                f"{KIMI_START}\n"
                "[[hooks]]\n"
                'event = "UserPromptSubmit"\n'
                f'command = "/bin/sh \\"{wrapper}\\" kimi"\n'
                "timeout = 10\n\n"
                "[[hooks]]\n"
                'event = "Stop"\n'
                f'command = "/bin/sh \\"{wrapper}\\" kimi-stop"\n'
                "timeout = 15\n\n"
                "[[hooks]]\n"
                'event = "SessionEnd"\n'
                f'command = "/bin/sh \\"{ctx_hook}\\" refresh-bg kimi"\n'
                "timeout = 5\n"
                f"{KIMI_END}"
            )
            if KIMI_START in existing and KIMI_END in existing:
                pattern = re.compile(re.escape(KIMI_START) + r".*?" + re.escape(KIMI_END), re.DOTALL)
                updated = pattern.sub(lambda _m: block, existing, count=1)
                if not updated.endswith("\n"):
                    updated += "\n"
            else:
                updated = (existing.rstrip() + "\n\n" if existing.strip() else "") + block + "\n"

            valid = True
            if tomllib is not None:
                try:
                    tomllib.loads(updated)
                except Exception as exc:
                    valid = False
                    notes.append(f"skipped invalid TOML merge in {cfg_path}: {exc}")
            if valid and _atomic_write_text(cfg_path, updated, mode=0o644, dry_run=dry_run):
                changed.append(str(cfg_path))

    return changed, notes


def _orca_data_dir(home: Path, env: dict[str, str]) -> Path:
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / "orca"
    xdg = Path((env.get("XDG_CONFIG_HOME") or "").strip() or str(home / ".config")).expanduser()
    return xdg / "orca"


def detect_host_targets(home: Path, env: dict[str, str] | None = None) -> list[tuple[str, Path]]:
    e = env if env is not None else os.environ
    targets: list[tuple[str, Path]] = []
    orca = _orca_data_dir(home, e)

    claude_dirs: list[Path] = []
    claude_seen: set[Path] = set()

    def _add_claude(candidate: Path) -> None:
        if not candidate.is_dir():
            return
        key = candidate.resolve()
        if key in claude_seen:
            return
        claude_seen.add(key)
        claude_dirs.append(candidate)

    _add_claude(home / ".claude")
    for profile in sorted((orca / "claude-profiles").glob("*/home")):
        _add_claude(profile)
    claude_env = (e.get("CLAUDE_CONFIG_DIR") or "").strip()
    if claude_env:
        _add_claude(Path(claude_env).expanduser())
    for d in claude_dirs:
        targets.append(("claude", d))

    codex_dirs: list[Path] = []
    codex_seen: set[Path] = set()

    def _add_codex(candidate: Path) -> None:
        if not candidate.is_dir():
            return
        key = candidate.resolve()
        if key in codex_seen:
            return
        codex_seen.add(key)
        codex_dirs.append(candidate)

    _add_codex(home / ".codex")
    _add_codex(orca / "codex-runtime-home" / "home")
    for account in sorted((orca / "codex-accounts").glob("*/home")):
        _add_codex(account)
    codex_env = (e.get("CODEX_HOME") or "").strip()
    if codex_env:
        _add_codex(Path(codex_env).expanduser())
    for d in codex_dirs:
        targets.append(("codex", d))

    xdg_cfg = (e.get("XDG_CONFIG_HOME") or "").strip()
    opencode_candidates = [
        Path(xdg_cfg).expanduser() / "opencode" if xdg_cfg else None,
        home / ".config" / "opencode",
    ]
    opencode_seen: set[Path] = set()
    for candidate in opencode_candidates:
        if candidate is None or not candidate.is_dir():
            continue
        key = candidate.resolve()
        if key in opencode_seen:
            continue
        opencode_seen.add(key)
        targets.append(("opencode", candidate))

    static_map = (
        ("jeo", home / ".jeo"),
        ("jeopi", home / ".jeopi" / "agent"),
        ("gjc", home / ".gjc" / "agent"),
        ("pi", home / ".pi" / "agent"),
        ("omp", home / ".omp" / "agent"),
        ("gemini", home / ".gemini"),
        ("antigravity-config", home / ".gemini" / "config"),
        ("antigravity-cli", home / ".gemini" / "antigravity-cli"),
        ("antigravity-ide", home / ".gemini" / "antigravity"),
        ("cursor", home / ".cursor"),
        ("kimi", home / ".kimi-code"),
    )
    for name, path in static_map:
        if path.is_dir():
            targets.append((name, path))
    return targets


def sync_host_context(
    home: Path,
    *,
    repo_root: Path | None = None,
    wiki_vault: str | None = None,
    second_brain_config: str | None = None,
    second_brain_vault: str | None = None,
    dry_run: bool = False,
    include_hooks: bool = True,
    respect_veto: bool = True,
    env: dict[str, str] | None = None,
) -> dict[str, Any]:
    if respect_veto:
        veto = context_veto_reason(env)
        if veto:
            return {
                "ok": True,
                "skipped": True,
                "reason": veto,
                "changed": [],
                "hosts": [],
                "notes": [],
            }

    resolved_repo = _resolve_repo_root(repo_root)
    paths = resolve_context_paths(
        home,
        wiki_vault=wiki_vault,
        second_brain_config=second_brain_config,
        second_brain_vault=second_brain_vault,
        env=env,
    )

    all_changed: list[str] = []
    all_notes: list[str] = []
    host_reports: list[dict[str, Any]] = []

    ssot_changed, ssot_notes = _sync_global_ssot(
        home, paths, resolved_repo, dry_run=dry_run, include_hooks=include_hooks
    )
    all_changed.extend(ssot_changed)
    all_notes.extend(ssot_notes)

    for host, target_dir in detect_host_targets(home, env=env):
        if host == "claude":
            c, n = _sync_claude(target_dir, home, paths, dry_run=dry_run, include_hooks=include_hooks)
        elif host == "codex":
            c, n = _sync_codex(target_dir, home, paths, dry_run=dry_run, include_hooks=include_hooks)
        elif host == "jeo":
            c, n = _sync_jeo(target_dir, home, paths, dry_run=dry_run, include_hooks=include_hooks)
        elif host in {"jeopi", "gjc", "pi", "omp"}:
            c, n = _sync_agent_extension_host(
                host, target_dir, home, paths, dry_run=dry_run, include_hooks=include_hooks
            )
        elif host == "opencode":
            c, n = _sync_opencode(target_dir, home, paths, dry_run=dry_run, include_hooks=include_hooks)
        elif host == "gemini":
            c, n = _sync_gemini_cli_root(
                host, target_dir, home, paths, dry_run=dry_run, include_hooks=include_hooks
            )
        elif host == "antigravity-cli":
            c, n = _sync_antigravity_cli(
                target_dir, home, paths, dry_run=dry_run, include_hooks=include_hooks
            )
        elif host == "antigravity-config":
            c, n = _sync_agy_config(target_dir, home, paths, dry_run=dry_run, include_hooks=include_hooks)
        elif host == "antigravity-ide":
            c, n = _sync_antigravity_ide(target_dir, home, paths, dry_run=dry_run)
        elif host == "cursor":
            c, n = _sync_cursor(target_dir, home, paths, dry_run=dry_run, include_hooks=include_hooks)
        elif host == "kimi":
            c, n = _sync_kimi(target_dir, home, paths, dry_run=dry_run, include_hooks=include_hooks)
        else:  # pragma: no cover
            c, n = [], []

        all_changed.extend(c)
        all_notes.extend(n)
        host_reports.append(
            {
                "host": host,
                "path": str(target_dir),
                "changed": c,
                "notes": n,
            }
        )

    return {
        "ok": True,
        "skipped": False,
        "dryRun": dry_run,
        "paths": {k: str(v) for k, v in paths.items()},
        "changed": all_changed,
        "hosts": host_reports,
        "notes": all_notes,
    }


def verify_host_context(
    home: Path,
    *,
    wiki_vault: str | None = None,
    second_brain_config: str | None = None,
    second_brain_vault: str | None = None,
    include_hooks: bool = True,
    env: dict[str, str] | None = None,
) -> tuple[bool, list[dict[str, Any]]]:
    paths = resolve_context_paths(
        home,
        wiki_vault=wiki_vault,
        second_brain_config=second_brain_config,
        second_brain_vault=second_brain_vault,
        env=env,
    )
    checks: list[dict[str, Any]] = []

    def add(name: str, ok: bool, detail: str) -> None:
        checks.append({"check": name, "ok": ok, "detail": detail})

    cfg_data, cfg_err = _read_json_dict(paths["context_config"])
    add("global:context-config.json", cfg_err is None and bool(cfg_data), cfg_err or str(paths["context_config"]))
    add("global:rules/jeo-tool-flow.md", (paths["rules_dir"] / "jeo-tool-flow.md").is_file(), str(paths["rules_dir"] / "jeo-tool-flow.md"))
    add("global:rules/jeo-second-brain.md", (paths["rules_dir"] / "jeo-second-brain.md").is_file(), str(paths["rules_dir"] / "jeo-second-brain.md"))

    if include_hooks:
        for fname in MANAGED_CONTEXT_FILES:
            p = paths["hooks_dir"] / fname
            add(f"global:hooks/{fname}", p.is_file(), str(p))
        add("global:hooks/ctx/__main__.py", (paths["hooks_dir"] / "ctx" / "__main__.py").is_file(), str(paths["hooks_dir"] / "ctx"))
        add("global:bin/ctx", paths["ctx_shim"].is_file(), str(paths["ctx_shim"]))

    for host, target_dir in detect_host_targets(home, env=env):
        ptr = target_dir / "jeo-context.json"
        ptr_data, ptr_err = _read_json_dict(ptr)
        add(f"{host}:jeo-context.json", ptr_err is None and bool(ptr_data), ptr_err or str(ptr))

        if host == "claude":
            md = target_dir / "CLAUDE.md"
            md_ok = md.is_file() and CONTEXT_START in md.read_text(encoding="utf-8", errors="replace")
            add("claude:CLAUDE.md", md_ok, str(md))
            add("claude:rules/jeo-tool-flow.md", (target_dir / "rules" / "jeo-tool-flow.md").exists(), str(target_dir / "rules"))
            if include_hooks:
                st, st_err = _read_json_dict(target_dir / "settings.json")
                st_text = json.dumps(st or {})
                add(
                    "claude:settings.json",
                    st_err is None and "ingest-prompt.py" in st_text and bool(re.search(r"ctx[\"']?\s+refresh", st_text)),
                    st_err or str(target_dir / "settings.json"),
                )
        elif host == "codex":
            md = target_dir / "AGENTS.md"
            add("codex:AGENTS.md", md.is_file() and CONTEXT_START in md.read_text(encoding="utf-8", errors="replace"), str(md))
            if include_hooks:
                hk, hk_err = _read_json_dict(target_dir / "hooks.json")
                add("codex:hooks.json", hk_err is None and "llm-wiki-ingest.sh" in json.dumps(hk or {}), hk_err or str(target_dir / "hooks.json"))
        elif host == "jeo":
            md = target_dir / "agent" / "AGENTS.md"
            add("jeo:agent/AGENTS.md", md.is_file() and CONTEXT_START in md.read_text(encoding="utf-8", errors="replace"), str(md))
            if include_hooks:
                hk, hk_err = _read_json_dict(target_dir / "hooks.json")
                add("jeo:hooks.json", hk_err is None and "ingest-prompt.py" in json.dumps(hk or {}), hk_err or str(target_dir / "hooks.json"))
        elif host in {"jeopi", "gjc", "pi", "omp"}:
            md = target_dir / "AGENTS.md"
            add(f"{host}:AGENTS.md", md.is_file() and CONTEXT_START in md.read_text(encoding="utf-8", errors="replace"), str(md))
            if include_hooks:
                ext = target_dir / "extensions" / "llm-wiki-ingest.ts"
                add(f"{host}:extensions/llm-wiki-ingest.ts", ext.is_file(), str(ext))
        elif host == "opencode":
            md = target_dir / "AGENTS.md"
            add("opencode:AGENTS.md", md.is_file() and CONTEXT_START in md.read_text(encoding="utf-8", errors="replace"), str(md))
            cfg_candidates = [target_dir / "opencode.jsonc", target_dir / "opencode.json"]
            cfg_path = next((p for p in cfg_candidates if p.exists() or p.is_symlink()), target_dir / "opencode.json")
            cfg_data, _raw, cfg_err = _read_jsonc_dict(cfg_path)
            inst = (cfg_data or {}).get("instructions") if isinstance(cfg_data, dict) else None
            cfg_ok = (
                cfg_err is None
                and isinstance(inst, list)
                and any(isinstance(x, str) and "jeo-tool-flow.md" in x for x in inst)
            )
            add("opencode:config", cfg_ok, cfg_err or str(cfg_path))
            if include_hooks:
                plg = target_dir / "plugins" / "jeo-context-ingest.js"
                add("opencode:plugins/jeo-context-ingest.js", plg.is_file(), str(plg))
        elif host == "gemini":
            md = target_dir / "GEMINI.md"
            add("gemini:GEMINI.md", md.is_file() and CONTEXT_START in md.read_text(encoding="utf-8", errors="replace"), str(md))
            if include_hooks:
                st, st_err = _read_json_dict(target_dir / "settings.json")
                add("gemini:settings.json", st_err is None and "llm-wiki-ingest.sh" in json.dumps(st or {}), st_err or str(target_dir / "settings.json"))
        elif host == "antigravity-cli":
            md = target_dir / "GEMINI.md"
            add("antigravity-cli:GEMINI.md", md.is_file() and CONTEXT_START in md.read_text(encoding="utf-8", errors="replace"), str(md))
            add("antigravity-cli:rules/jeo-tool-flow.md", (target_dir / "rules" / "jeo-tool-flow.md").exists(), str(target_dir / "rules"))
        elif host == "antigravity-config":
            if include_hooks:
                hk, hk_err = _read_json_dict(target_dir / "hooks.json")
                add("antigravity-config:hooks.json", hk_err is None and isinstance((hk or {}).get("jeo-context"), dict), hk_err or str(target_dir / "hooks.json"))
        elif host == "antigravity-ide":
            md = target_dir / "GEMINI.md"
            wf = target_dir / "global_workflows" / "jeo-context.md"
            add("antigravity-ide:GEMINI.md", md.is_file() and CONTEXT_START in md.read_text(encoding="utf-8", errors="replace"), str(md))
            add("antigravity-ide:global_workflows/jeo-context.md", wf.is_file(), str(wf))
        elif host == "cursor":
            add("cursor:rules/jeo-tool-flow.mdc", (target_dir / "rules" / "jeo-tool-flow.mdc").is_file(), str(target_dir / "rules"))
            if include_hooks:
                hk, hk_err = _read_json_dict(target_dir / "hooks.json")
                add("cursor:hooks.json", hk_err is None and "llm-wiki-ingest.sh" in json.dumps(hk or {}), hk_err or str(target_dir / "hooks.json"))
        elif host == "kimi":
            md = target_dir / "AGENTS.md"
            add("kimi:AGENTS.md", md.is_file() and CONTEXT_START in md.read_text(encoding="utf-8", errors="replace"), str(md))
            if include_hooks:
                cfg = target_dir / "config.toml"
                add("kimi:config.toml", cfg.is_file() and KIMI_START in cfg.read_text(encoding="utf-8", errors="replace"), str(cfg))

    all_ok = all(item["ok"] for item in checks)
    return all_ok, checks


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Sync shared jeo-skills context assets into detected coding-agent host directories."
    )
    parser.add_argument("--home", help="Override HOME directory (defaults to Path.home())")
    parser.add_argument("--repo-root", help="Override jeo-skills checkout root")
    parser.add_argument("--vault", help="Override llm-wiki vault path")
    parser.add_argument("--second-brain-config", help="Override second-brain config path")
    parser.add_argument("--second-brain-vault", help="Override second-brain vault path")
    parser.add_argument("--no-hooks", action="store_true", help="Sync rules/config pointers only, skip host hooks")
    parser.add_argument("--dry-run", action="store_true", help="Report planned changes without modifying files")
    parser.add_argument("--verify", action="store_true", help="Verify global and detected host context wiring")
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    args = parser.parse_args(argv)

    home = Path(args.home).expanduser() if args.home else Path.home()
    repo_root = Path(args.repo_root).expanduser() if args.repo_root else None
    include_hooks = not args.no_hooks

    if args.verify:
        ok, checks = verify_host_context(
            home,
            wiki_vault=args.vault,
            second_brain_config=args.second_brain_config,
            second_brain_vault=args.second_brain_vault,
            include_hooks=include_hooks,
        )
        if args.json:
            print(json.dumps({"ok": ok, "checks": checks}, indent=2, ensure_ascii=False))
        else:
            for item in checks:
                mark = "PASS" if item["ok"] else "FAIL"
                print(f"[{mark}] {item['check']}: {item['detail']}")
        return 0 if ok else 1

    report = sync_host_context(
        home,
        repo_root=repo_root,
        wiki_vault=args.vault,
        second_brain_config=args.second_brain_config,
        second_brain_vault=args.second_brain_vault,
        dry_run=args.dry_run,
        include_hooks=include_hooks,
    )
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        if report.get("skipped"):
            print(f"[skip] {report.get('reason')}")
        else:
            print(
                f"host-context synced: {len(report['changed'])} file(s) updated across "
                f"{len(report['hosts'])} detected host root(s)"
            )
            for note in report.get("notes", []):
                print(f"  note: {note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
