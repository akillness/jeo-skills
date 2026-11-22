#!/usr/bin/env python3
"""Second-brain CRUD, search, index bootstrap, and stdio MCP operator.

Provides deterministic save, update, delete, search, init-indexes, status, and
stdio JSON-RPC MCP operations over the configured second-brain vault while
enforcing RawGuard immutability on raw/** and archived roots.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from ctx_guard import RawGuard


def assert_safe_dir(path: Path, label: str = "directory") -> None:
    if path.is_symlink() or not path.is_dir():
        raise VaultOpError(f"Unsafe or missing {label}: {path}")


def is_symlink_or_inside_symlink(vault: Path, target: Path) -> bool:
    cur = target
    vault_res = vault.resolve()
    while True:
        if cur.is_symlink():
            return True
        if cur == vault or cur == vault_res or cur == cur.parent:
            break
        cur = cur.parent
    return False

PROTECTED_EXACT = {"index.md", "log.md", "_CLAUDE.md", "CLAUDE.md", "README.md"}
ALLOWED_MUTATION_TOP = {"wiki"}
RAW_CAPTURE_SUBDIR = "raw/sources"
SKIP_SEARCH_DIRS = {
    ".obsidian",
    ".trash",
    ".git",
    ".second-brain",
    ".mex",
    ".zvec-grep",
    ".graphify",
    "graphify-out",
    ".venv",
    ".jeo",
}


class VaultOpError(RuntimeError):
    """Raised when a vault operation violates safety or input invariants."""


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> str:
    return _now_utc().strftime("%Y-%m-%d")


def _slugify(text: str) -> str:
    cleaned = re.sub(r"[^\w\u3131-\u318e\uac00-\ud7a3-]+", "-", text.strip().lower())
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    if not cleaned:
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]
        return f"note-{digest}"
    return cleaned[:80]


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _augmented_env(config: dict[str, Any] | None = None) -> dict[str, str]:
    env = dict(os.environ)
    parts: list[str] = []
    home = Path.home()
    for candidate in (
        home / ".local/bin",
        Path("/opt/homebrew/bin"),
        Path("/usr/local/bin"),
    ):
        if candidate.is_dir():
            parts.append(str(candidate))
    if config:
        for key in ("claude_bin", "codex_bin", "gemini_bin", "python_bin", "zvec_bin", "mex_bin", "graphify_bin"):
            val = str(config.get(key) or "").strip()
            if val:
                parent = str(Path(val).expanduser().parent)
                if parent and parent not in parts:
                    parts.append(parent)
    nvm_node_bins = sorted(home.glob(".nvm/versions/node/*/bin"), reverse=True)
    for nb in nvm_node_bins:
        if nb.is_dir():
            parts.append(str(nb))
            break
    existing = env.get("PATH", "")
    merged = [p for p in parts if p]
    if existing:
        merged.extend(p for p in existing.split(os.pathsep) if p and p not in merged)
    env["PATH"] = os.pathsep.join(merged)
    return env


def resolve_config_and_vault(
    vault_arg: str | None = None,
    config_arg: str | None = None,
) -> tuple[Path, dict[str, Any]]:
    config: dict[str, Any] = {}
    cfg_candidates: list[Path] = []
    if config_arg:
        cfg_candidates.append(Path(config_arg).expanduser())
    env_cfg = os.environ.get("JEO_SECOND_BRAIN_CONFIG", "").strip()
    if env_cfg:
        cfg_candidates.append(Path(env_cfg).expanduser())
    cfg_candidates.append(Path.home() / ".jeo" / "second-brain-config.json")

    for candidate in cfg_candidates:
        if candidate.is_file():
            try:
                loaded = json.loads(candidate.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    config = loaded
                    break
            except Exception:
                pass

    if vault_arg:
        vault = Path(vault_arg).expanduser()
    elif os.environ.get("JEO_SECOND_BRAIN_VAULT", "").strip():
        vault = Path(os.environ["JEO_SECOND_BRAIN_VAULT"].strip()).expanduser()
    elif config.get("vault") or config.get("vault_dir"):
        vault = Path(str(config.get("vault") or config.get("vault_dir"))).expanduser()
    else:
        vault = Path.home() / "vaults" / "jeo-second-brain"

    vault_cfg = vault / ".second-brain" / "config.json"
    if not config and vault_cfg.is_file():
        try:
            loaded = json.loads(vault_cfg.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                config = loaded
        except Exception:
            pass
    elif vault_cfg.is_file():
        try:
            loaded = json.loads(vault_cfg.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                merged = dict(loaded)
                merged.update(config)
                config = merged
        except Exception:
            pass

    if not vault.exists():
        raise VaultOpError(f"Second-brain vault does not exist: {vault}")
    assert_safe_dir(vault, "second-brain vault")
    return vault.resolve(), config


def _guard(vault: Path, config: dict[str, Any]) -> RawGuard:
    return RawGuard(vault)


def _normalize_rel_path(vault: Path, raw_rel: str) -> tuple[str, Path]:
    rel_str = raw_rel.strip().replace("\\", "/").lstrip("/")
    if not rel_str:
        raise VaultOpError("Path must not be empty")
    rel = Path(rel_str)
    if rel.is_absolute() or ".." in rel.parts:
        raise VaultOpError(f"Refusing path escape outside vault: {raw_rel}")
    target = vault / rel
    if is_symlink_or_inside_symlink(vault, target):
        raise VaultOpError(f"Refusing symlink target inside vault: {rel.as_posix()}")
    resolved_parent = target.parent.resolve() if target.parent.exists() else (vault / rel.parent)
    try:
        resolved_parent.relative_to(vault.resolve())
    except ValueError as exc:
        raise VaultOpError(f"Resolved parent escapes vault: {rel.as_posix()}") from exc
    return rel.as_posix(), target


def _assert_mutable_wiki_target(vault: Path, guard: RawGuard, rel: str, target: Path) -> None:
    if rel in PROTECTED_EXACT or rel.startswith(".second-brain/") or rel.startswith("."):
        raise VaultOpError(f"Refusing mutation of protected control file: {rel}")
    parts = Path(rel).parts
    top = parts[0] if parts else ""
    if top not in ALLOWED_MUTATION_TOP:
        raise VaultOpError(f"Mutations are restricted to wiki/ (got {rel}); raw/** is immutable.")
    if len(parts) >= 3 and parts[1] == "archive" and parts[2] == "roots":
        raise VaultOpError(f"Refusing mutation of archived root path: {rel}")
    if Path(rel).suffix.lower() != ".md":
        raise VaultOpError(f"Only markdown notes (*.md) under wiki/ can be mutated (got {rel}).")
    try:
        guard.check_path(target, operation="mutate", ancestors=True)
    except PermissionError as exc:
        raise VaultOpError(str(exc)) from exc


def _atomic_write(target: Path, text: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.parent / f".{target.name}.tmp.{os.getpid()}"
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, target)


def _upsert_index_entry(vault: Path, rel: str, title: str, summary: str = "") -> None:
    index_path = vault / "index.md"
    if is_symlink_or_inside_symlink(vault, index_path):
        raise VaultOpError("Refusing symlink index.md")
    existing = index_path.read_text(encoding="utf-8") if index_path.is_file() else "# Index\n\n## Wiki\n"
    clean_summary = re.sub(r"\s+", " ", summary).strip()
    if len(clean_summary) > 120:
        clean_summary = clean_summary[:117] + "..."
    bullet = f"- [{title}]({rel})" + (f" — {clean_summary}" if clean_summary else "")

    lines = existing.splitlines()
    pattern = re.compile(rf"^- \[[^\]]*\]\({re.escape(rel)}\)(?:\s*[—-].*)?$")
    replaced = False
    new_lines: list[str] = []
    for line in lines:
        if pattern.match(line.strip()):
            if not replaced:
                new_lines.append(bullet)
                replaced = True
        else:
            new_lines.append(line)
    if not replaced:
        if new_lines and new_lines[-1].strip():
            new_lines.append("")
        if "## Managed Notes" not in existing and "## Wiki" not in existing:
            new_lines.append("## Wiki")
        new_lines.append(bullet)
    _atomic_write(index_path, "\n".join(new_lines).rstrip() + "\n")


def _remove_index_entry(vault: Path, rel: str) -> bool:
    index_path = vault / "index.md"
    if not index_path.is_file() or is_symlink_or_inside_symlink(vault, index_path):
        return False
    lines = index_path.read_text(encoding="utf-8").splitlines()
    pattern = re.compile(rf"^- \[[^\]]*\]\({re.escape(rel)}\)(?:\s*[—-].*)?$")
    filtered = [line for line in lines if not pattern.match(line.strip())]
    if len(filtered) == len(lines):
        return False
    _atomic_write(index_path, "\n".join(filtered).rstrip() + "\n")
    return True


def _append_log(vault: Path, action: str, rel: str, detail: str) -> None:
    log_path = vault / "log.md"
    if is_symlink_or_inside_symlink(vault, log_path):
        raise VaultOpError("Refusing symlink log.md")
    existing = log_path.read_text(encoding="utf-8") if log_path.is_file() else "# Log\n"
    entry = f"\n## [{_today()}] {action} | {rel}\n- {detail}\n"
    _atomic_write(log_path, existing.rstrip() + "\n" + entry)


def _extract_title_and_summary(content: str, fallback_title: str) -> tuple[str, str]:
    title = fallback_title
    summary = ""
    in_frontmatter = False
    lines = content.splitlines()
    for i, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        if i == 0 and stripped == "---":
            in_frontmatter = True
            continue
        if in_frontmatter:
            if stripped == "---":
                in_frontmatter = False
                continue
            m = re.match(r"^title\s*:\s*(.+)$", stripped, re.IGNORECASE)
            if m:
                title = m.group(1).strip().strip("\"'")
            continue
        if stripped.startswith("# "):
            title = stripped[2:].strip()
            continue
        if stripped and not stripped.startswith("#") and not stripped.startswith(">") and not stripped.startswith("- ") and not summary:
            summary = stripped
    return title or fallback_title, summary


def _refresh_zvec_index(vault: Path, config: dict[str, Any]) -> dict[str, Any]:
    if not (vault / ".zvec-grep").is_dir():
        return {"ran": False, "reason": "no_zvec_dir"}
    zg_bin = _resolve_tool(config.get("zvec_bin"), "zg")
    if not zg_bin:
        return {"ran": False, "reason": "missing_zg"}
    try:
        proc = subprocess.run(
            [zg_bin, "index"],
            cwd=str(vault),
            env=_augmented_env(config),
            capture_output=True,
            text=True,
            timeout=30,
        )
        return {
            "ran": True,
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
        }
    except Exception as exc:
        return {"ran": False, "reason": str(exc)}


def _resolve_tool(configured: Any, name: str) -> str | None:
    if configured:
        p = Path(str(configured)).expanduser()
        if p.is_file():
            return str(p)
    found = shutil.which(name)
    if found:
        return found
    for prefix in (Path.home() / ".local/bin", Path("/opt/homebrew/bin"), Path("/usr/local/bin")):
        cand = prefix / name
        if cand.is_file():
            return str(cand)
    return None


def _ensure_frontmatter(content: str, title: str, tags: list[str] | None = None) -> str:
    stripped = content.lstrip()
    if stripped.startswith("---\n"):
        return content.rstrip() + "\n"
    tag_line = ", ".join(tags or [])
    header = [
        "---",
        f'title: "{title.replace(chr(34), "")}"',
        f"created: {_today()}",
        f"updated: {_today()}",
    ]
    if tag_line:
        header.append(f"tags: [{tag_line}]")
    header.append("---")
    body = content.rstrip()
    if not body.startswith("# "):
        body = f"# {title}\n\n{body}"
    return "\n".join(header) + "\n\n" + body + "\n"


def save_note(
    vault: Path,
    config: dict[str, Any],
    *,
    title: str | None = None,
    rel_path: str | None = None,
    folder: str = "wiki/notes",
    content: str = "",
    tags: list[str] | None = None,
    kind: str = "wiki",
    reindex: bool = True,
) -> dict[str, Any]:
    if not content.strip():
        raise VaultOpError("Content must not be empty")
    guard = _guard(vault, config)
    kind_norm = kind.strip().lower()

    if kind_norm == "raw":
        slug = _slugify(title or Path(rel_path or "capture").stem)
        if rel_path:
            rel, target = _normalize_rel_path(vault, rel_path)
            if not rel.startswith("raw/"):
                raise VaultOpError(f"Raw captures must live under raw/ (got {rel})")
        else:
            rel = f"{RAW_CAPTURE_SUBDIR}/{_today()}-{slug}.md"
            rel, target = _normalize_rel_path(vault, rel)
        if target.exists():
            raise VaultOpError(f"Raw files are immutable and already exist: {rel}")
        final_title = title or slug
        body = _ensure_frontmatter(content, final_title, tags)
        _atomic_write(target, body)
        _append_log(vault, "capture", rel, f"Captured immutable raw source `{final_title}`")
        return {
            "status": "saved",
            "kind": "raw",
            "path": rel,
            "sha256": _sha256_bytes(body.encode("utf-8")),
            "bytes": len(body.encode("utf-8")),
        }

    if kind_norm != "wiki":
        raise VaultOpError(f"Unsupported save kind {kind!r}; expected 'wiki' or 'raw'")

    if rel_path:
        rel, target = _normalize_rel_path(vault, rel_path)
    else:
        if not title:
            raise VaultOpError("Either --title or --path is required for save")
        clean_folder = folder.strip().strip("/")
        if not clean_folder.startswith("wiki"):
            clean_folder = f"wiki/{clean_folder}" if clean_folder else "wiki/notes"
        rel, target = _normalize_rel_path(vault, f"{clean_folder}/{_slugify(title)}.md")

    _assert_mutable_wiki_target(vault, guard, rel, target)
    if target.exists():
        raise VaultOpError(f"Note already exists at {rel}; use 'update' to modify it.")

    final_title = title or Path(rel).stem.replace("-", " ").title()
    body = _ensure_frontmatter(content, final_title, tags)
    _atomic_write(target, body)
    parsed_title, summary = _extract_title_and_summary(body, final_title)
    _upsert_index_entry(vault, rel, parsed_title, summary)
    _append_log(vault, "save", rel, f"Created wiki note `{parsed_title}`")
    zvec_res = _refresh_zvec_index(vault, config) if reindex else {"ran": False, "reason": "skipped"}
    return {
        "status": "saved",
        "kind": "wiki",
        "path": rel,
        "title": parsed_title,
        "sha256": _sha256_bytes(body.encode("utf-8")),
        "bytes": len(body.encode("utf-8")),
        "reindex": zvec_res,
    }


def update_note(
    vault: Path,
    config: dict[str, Any],
    *,
    rel_path: str,
    content: str,
    append: bool = False,
    expected_sha256: str | None = None,
    title: str | None = None,
    reindex: bool = True,
) -> dict[str, Any]:
    if not content.strip():
        raise VaultOpError("Update content must not be empty")
    guard = _guard(vault, config)
    rel, target = _normalize_rel_path(vault, rel_path)
    _assert_mutable_wiki_target(vault, guard, rel, target)
    if not target.is_file():
        raise VaultOpError(f"Cannot update missing note: {rel} (use 'save' to create)")

    current_bytes = target.read_bytes()
    before_sha = _sha256_bytes(current_bytes)
    if expected_sha256 and expected_sha256.strip() != before_sha:
        raise VaultOpError(
            f"SHA-256 mismatch for {rel}: expected {expected_sha256}, actual {before_sha}"
        )

    current_text = current_bytes.decode("utf-8")
    if append:
        new_text = current_text.rstrip() + "\n\n" + content.rstrip() + "\n"
    else:
        new_text = content.rstrip() + "\n"
    new_text = re.sub(
        r"(?m)^updated\s*:\s*.*$",
        f"updated: {_today()}",
        new_text,
        count=1,
    )
    _atomic_write(target, new_text)
    fallback_title = title or Path(rel).stem.replace("-", " ").title()
    parsed_title, summary = _extract_title_and_summary(new_text, fallback_title)
    _upsert_index_entry(vault, rel, parsed_title, summary)
    _append_log(vault, "update", rel, f"Updated wiki note `{parsed_title}` ({before_sha[:8]} -> {_sha256_bytes(new_text.encode('utf-8'))[:8]})")
    zvec_res = _refresh_zvec_index(vault, config) if reindex else {"ran": False, "reason": "skipped"}
    return {
        "status": "updated",
        "path": rel,
        "title": parsed_title,
        "before_sha256": before_sha,
        "sha256": _sha256_bytes(new_text.encode("utf-8")),
        "bytes": len(new_text.encode("utf-8")),
        "reindex": zvec_res,
    }


def delete_note(
    vault: Path,
    config: dict[str, Any],
    *,
    rel_path: str,
    hard: bool = False,
    dry_run: bool = False,
    reindex: bool = True,
) -> dict[str, Any]:
    guard = _guard(vault, config)
    rel, target = _normalize_rel_path(vault, rel_path)
    _assert_mutable_wiki_target(vault, guard, rel, target)
    if not target.is_file():
        raise VaultOpError(f"Cannot delete missing note: {rel}")

    before_sha = _sha256_bytes(target.read_bytes())
    trash_rel: str | None = None
    if not hard:
        stamp = _now_utc().strftime("%Y%m%dT%H%M%SZ")
        trash_path = vault / ".second-brain" / "trash" / f"{stamp}-{Path(rel).name}"
        trash_rel = trash_path.relative_to(vault).as_posix()

    if dry_run:
        return {
            "status": "dry_run",
            "action": "delete",
            "path": rel,
            "sha256": before_sha,
            "trash_path": trash_rel,
            "hard": hard,
        }

    if not hard and trash_rel is not None:
        trash_path = vault / trash_rel
        trash_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, trash_path)

    target.unlink()
    removed_index = _remove_index_entry(vault, rel)
    _append_log(
        vault,
        "delete",
        rel,
        f"Deleted wiki note (sha={before_sha[:8]}, trash={trash_rel or 'hard'})",
    )
    zvec_res = _refresh_zvec_index(vault, config) if reindex else {"ran": False, "reason": "skipped"}
    return {
        "status": "deleted",
        "path": rel,
        "before_sha256": before_sha,
        "trash_path": trash_rel,
        "removed_from_index": removed_index,
        "reindex": zvec_res,
    }


def _iter_searchable_files(vault: Path, kind: str) -> list[tuple[str, Path]]:
    kind_norm = kind.strip().lower()
    roots: list[tuple[str, Path]] = []
    if kind_norm in ("all", "wiki"):
        if (vault / "index.md").is_file():
            roots.append(("index", vault / "index.md"))
        if (vault / "wiki").is_dir():
            for p in sorted((vault / "wiki").rglob("*.md")):
                if not any(part in SKIP_SEARCH_DIRS for part in p.relative_to(vault).parts):
                    roots.append(("wiki", p))
    if kind_norm in ("all", "raw"):
        if (vault / "raw").is_dir():
            for p in sorted((vault / "raw").rglob("*.md")):
                if not any(part in SKIP_SEARCH_DIRS for part in p.relative_to(vault).parts):
                    roots.append(("raw", p))
    return roots


def _keyword_score(query: str, rel: str, text: str) -> tuple[float, int, str]:
    q_lower = query.strip().lower()
    if not q_lower:
        return 0.0, 1, ""
    tokens = [tok for tok in re.split(r"\s+", q_lower) if tok]
    lines = text.splitlines()
    title, _ = _extract_title_and_summary(text, Path(rel).stem)
    title_l = title.lower()
    rel_l = rel.lower()
    text_l = text.lower()

    score = 0.0
    if q_lower in title_l:
        score += 10.0
    if q_lower in rel_l:
        score += 6.0
    if q_lower in text_l:
        score += 5.0

    matched_tokens = 0
    for tok in tokens:
        in_title = tok in title_l
        in_rel = tok in rel_l
        in_body = tok in text_l
        if in_title or in_rel or in_body:
            matched_tokens += 1
        if in_title:
            score += 3.0
        if in_rel:
            score += 2.0
        if in_body:
            score += 1.0 + min(text_l.count(tok), 5) * 0.25

    if tokens and matched_tokens == len(tokens) and len(tokens) > 1:
        score += 3.0

    if score <= 0.0:
        return 0.0, 1, ""

    best_line = 1
    best_snippet = title
    for idx, line in enumerate(lines, 1):
        ll = line.lower()
        if q_lower in ll or any(tok in ll for tok in tokens):
            best_line = idx
            best_snippet = line.strip()[:160]
            break
    return round(score, 3), best_line, best_snippet


def search_vault(
    vault: Path,
    config: dict[str, Any],
    *,
    query: str,
    kind: str = "all",
    limit: int = 10,
) -> dict[str, Any]:
    if not query.strip():
        raise VaultOpError("Search query must not be empty")

    results_by_path: dict[str, dict[str, Any]] = {}
    zvec_used = False
    if (vault / ".zvec-grep").is_dir():
        zg_bin = _resolve_tool(config.get("zvec_bin"), "zg")
        if zg_bin:
            try:
                proc = subprocess.run(
                    [zg_bin, "query", query, "--preview", "none", "--limit", str(max(limit * 2, 10))],
                    cwd=str(vault),
                    env=_augmented_env(config),
                    capture_output=True,
                    text=True,
                    timeout=15,
                )
                if proc.returncode == 0 and proc.stdout.strip():
                    zvec_used = True
                    for raw_line in proc.stdout.splitlines():
                        m = re.match(r"^\s*([^\s:]+\.md):(\d+)(?::\d+)?\s*(.*)$", raw_line)
                        if not m:
                            continue
                        rel_candidate = m.group(1).lstrip("./")
                        if kind == "wiki" and not (rel_candidate.startswith("wiki/") or rel_candidate == "index.md"):
                            continue
                        if kind == "raw" and not rel_candidate.startswith("raw/"):
                            continue
                        p = vault / rel_candidate
                        if p.is_file():
                            results_by_path[rel_candidate] = {
                                "path": rel_candidate,
                                "kind": "raw" if rel_candidate.startswith("raw/") else ("index" if rel_candidate == "index.md" else "wiki"),
                                "line": int(m.group(2)),
                                "snippet": m.group(3).strip()[:160],
                                "score": 8.0,
                                "source": "zvec",
                            }
            except Exception:
                pass

    for file_kind, path in _iter_searchable_files(vault, kind):
        rel = path.relative_to(vault).as_posix()
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        score, line_no, snippet = _keyword_score(query, rel, text)
        if score <= 0.0:
            continue
        if file_kind == "wiki":
            score = round(score + 3.0, 3)
        elif file_kind == "raw":
            score = round(score + 1.0, 3)
        title, _ = _extract_title_and_summary(text, path.stem)
        existing = results_by_path.get(rel)
        if existing:
            existing["score"] = round(existing["score"] + score, 3)
            existing["title"] = title
            if not existing.get("snippet"):
                existing["snippet"] = snippet
            existing["source"] = "zvec+lexical"
        else:
            results_by_path[rel] = {
                "path": rel,
                "kind": file_kind,
                "title": title,
                "line": line_no,
                "snippet": snippet,
                "score": score,
                "source": "lexical",
            }

    ranked = sorted(
        results_by_path.values(),
        key=lambda item: (-float(item["score"]), str(item["path"])),
    )[: max(1, limit)]
    return {
        "status": "ok",
        "query": query,
        "kind": kind,
        "vault_dir": str(vault),
        "zvec_used": zvec_used,
        "count": len(ranked),
        "hits": ranked,
    }


def init_indexes(vault: Path, config: dict[str, Any]) -> dict[str, Any]:
    env = _augmented_env(config)
    results: dict[str, Any] = {}

    zg_bin = _resolve_tool(config.get("zvec_bin"), "zg")
    if zg_bin:
        try:
            proc = subprocess.run(
                [zg_bin, "index"],
                cwd=str(vault),
                env=env,
                capture_output=True,
                text=True,
                timeout=45,
            )
            results["zvec"] = {
                "ok": proc.returncode == 0,
                "present": (vault / ".zvec-grep").is_dir(),
                "returncode": proc.returncode,
            }
        except Exception as exc:
            results["zvec"] = {"ok": False, "present": (vault / ".zvec-grep").is_dir(), "error": str(exc)}
    else:
        results["zvec"] = {"ok": False, "present": (vault / ".zvec-grep").is_dir(), "reason": "missing_zg"}

    mex_bin = _resolve_tool(config.get("mex_bin"), "mex-agent")
    if mex_bin:
        if (vault / ".mex").is_dir():
            results["mex"] = {"ok": True, "present": True, "already_initialized": True}
        elif not (vault / ".git").exists():
            results["mex"] = {"ok": False, "present": False, "reason": "no_git_repo"}
        else:
            try:
                proc = subprocess.run(
                    [mex_bin, "init"],
                    cwd=str(vault),
                    env=env,
                    capture_output=True,
                    text=True,
                    timeout=45,
                )
                results["mex"] = {
                    "ok": proc.returncode == 0,
                    "present": (vault / ".mex").is_dir(),
                    "returncode": proc.returncode,
                }
            except Exception as exc:
                results["mex"] = {"ok": False, "present": (vault / ".mex").is_dir(), "error": str(exc)}
    else:
        results["mex"] = {"ok": False, "present": (vault / ".mex").is_dir(), "reason": "missing_mex"}

    pending = [
        name
        for name, dirname in (("mex", ".mex"), ("zvec", ".zvec-grep"), ("graphify", "graphify-out"))
        if not (vault / dirname).is_dir()
    ]
    return {
        "status": "ok",
        "vault_dir": str(vault),
        "indexes": results,
        "pending": pending,
    }


def vault_status(vault: Path, config: dict[str, Any]) -> dict[str, Any]:
    raw_count = sum(1 for _ in (vault / "raw").rglob("*.md")) if (vault / "raw").is_dir() else 0
    wiki_count = sum(1 for _ in (vault / "wiki").rglob("*.md")) if (vault / "wiki").is_dir() else 0
    pending = [
        name
        for name, dirname in (("mex", ".mex"), ("zvec", ".zvec-grep"), ("graphify", "graphify-out"))
        if not (vault / dirname).is_dir()
    ]
    return {
        "status": "ok",
        "vault_dir": str(vault),
        "raw_notes": raw_count,
        "wiki_notes": wiki_count,
        "indexes": {
            "zvec": (vault / ".zvec-grep").is_dir(),
            "mex": (vault / ".mex").is_dir(),
            "graphify": (vault / "graphify-out").is_dir(),
        },
        "pending": pending,
        "capabilities": ["save", "update", "delete", "search", "init-indexes", "mcp"],
        "host": config.get("host", "auto"),
    }


MCP_TOOLS: list[dict[str, Any]] = [
    {
        "name": "sb_save",
        "description": "Save a new wiki note (under wiki/) or immutable raw capture (under raw/sources/) in the second-brain vault and update index.md + log.md.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Note title"},
                "path": {"type": "string", "description": "Optional vault-relative path (must be under wiki/ or raw/)"},
                "folder": {"type": "string", "description": "Wiki subfolder when path is omitted (default wiki/notes)"},
                "content": {"type": "string", "description": "Markdown content"},
                "kind": {"type": "string", "enum": ["wiki", "raw"], "default": "wiki"},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["content"],
        },
    },
    {
        "name": "sb_update",
        "description": "Update an existing non-raw wiki note under wiki/ (raw/** and archived roots are protected by RawGuard) and refresh index/log.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Vault-relative path under wiki/"},
                "content": {"type": "string", "description": "Replacement or appended markdown content"},
                "append": {"type": "boolean", "default": False},
                "expected_sha256": {"type": "string"},
                "title": {"type": "string"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "sb_delete",
        "description": "Delete a non-raw wiki note under wiki/ (archives to .second-brain/trash/ unless hard=true; raw/** is strictly protected) and clean up index.md + log.md.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Vault-relative path under wiki/"},
                "hard": {"type": "boolean", "default": False},
                "dry_run": {"type": "boolean", "default": False},
            },
            "required": ["path"],
        },
    },
    {
        "name": "sb_search",
        "description": "Search across the second-brain vault (wiki/, index.md, raw/) using zvec-grep + deterministic UTF-8 lexical ranking.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "kind": {"type": "string", "enum": ["all", "wiki", "raw"], "default": "all"},
                "limit": {"type": "integer", "default": 10},
            },
            "required": ["query"],
        },
    },
    {
        "name": "sb_status",
        "description": "Return second-brain vault counts, index status, and supported CRUD/search capabilities.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "vault": {"type": "string"},
            },
        },
    },
]


def _read_mcp_message() -> tuple[dict[str, Any] | None, str]:
    while True:
        first = sys.stdin.buffer.readline()
        if not first:
            return None, "line"
        stripped = first.strip()
        if not stripped:
            continue
        if stripped.lower().startswith(b"content-length:"):
            length = int(stripped.split(b":", 1)[1].strip())
            while True:
                hdr = sys.stdin.buffer.readline()
                if not hdr or hdr in (b"\r\n", b"\n"):
                    break
            body = sys.stdin.buffer.read(length)
            if not body:
                return None, "lsp"
            return json.loads(body.decode("utf-8")), "lsp"
        return json.loads(stripped.decode("utf-8")), "line"


def _write_mcp_message(payload: dict[str, Any], framing: str) -> None:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if framing == "lsp":
        header = f"Content-Length: {len(raw)}\r\n\r\n".encode("ascii")
        sys.stdout.buffer.write(header + raw)
    else:
        sys.stdout.buffer.write(raw + b"\n")
    sys.stdout.buffer.flush()


def _handle_mcp_tool(name: str, args: dict[str, Any], vault_arg: str | None, config_arg: str | None) -> dict[str, Any]:
    vault, config = resolve_config_and_vault(args.get("vault") or vault_arg, config_arg)
    if name == "sb_save":
        return save_note(
            vault,
            config,
            title=args.get("title"),
            rel_path=args.get("path"),
            folder=str(args.get("folder") or "wiki/notes"),
            content=str(args.get("content") or ""),
            tags=list(args.get("tags") or []) or None,
            kind=str(args.get("kind") or "wiki"),
        )
    if name == "sb_update":
        return update_note(
            vault,
            config,
            rel_path=str(args.get("path") or ""),
            content=str(args.get("content") or ""),
            append=bool(args.get("append", False)),
            expected_sha256=args.get("expected_sha256"),
            title=args.get("title"),
        )
    if name == "sb_delete":
        return delete_note(
            vault,
            config,
            rel_path=str(args.get("path") or ""),
            hard=bool(args.get("hard", False)),
            dry_run=bool(args.get("dry_run", False)),
        )
    if name == "sb_search":
        return search_vault(
            vault,
            config,
            query=str(args.get("query") or ""),
            kind=str(args.get("kind") or "all"),
            limit=int(args.get("limit") or 10),
        )
    if name == "sb_status":
        return vault_status(vault, config)
    raise VaultOpError(f"Unknown MCP tool: {name}")


def run_mcp_server(vault_arg: str | None = None, config_arg: str | None = None) -> int:
    while True:
        try:
            msg, framing = _read_mcp_message()
        except Exception as exc:
            _write_mcp_message(
                {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": str(exc)}},
                "line",
            )
            continue
        if msg is None:
            return 0
        req_id = msg.get("id")
        method = msg.get("method", "")
        params = msg.get("params") or {}
        if method == "notifications/initialized" or req_id is None:
            continue
        if method == "initialize":
            proto = params.get("protocolVersion") or "2024-11-05"
            _write_mcp_message(
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "protocolVersion": proto,
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "second-brain", "version": "1.0.0"},
                    },
                },
                framing,
            )
        elif method == "ping":
            _write_mcp_message({"jsonrpc": "2.0", "id": req_id, "result": {}}, framing)
        elif method == "tools/list":
            _write_mcp_message(
                {"jsonrpc": "2.0", "id": req_id, "result": {"tools": MCP_TOOLS}},
                framing,
            )
        elif method == "tools/call":
            tool_name = str(params.get("name") or "")
            tool_args = dict(params.get("arguments") or {})
            try:
                res = _handle_mcp_tool(tool_name, tool_args, vault_arg, config_arg)
                _write_mcp_message(
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {
                            "content": [{"type": "text", "text": json.dumps(res, ensure_ascii=False, indent=2)}],
                            "isError": False,
                        },
                    },
                    framing,
                )
            except Exception as exc:
                _write_mcp_message(
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {
                            "content": [{"type": "text", "text": json.dumps({"error": str(exc)}, ensure_ascii=False)}],
                            "isError": True,
                        },
                    },
                    framing,
                )
        else:
            _write_mcp_message(
                {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method not found: {method}"}},
                framing,
            )


def _read_content_arg(content: str | None, content_file: str | None, use_stdin: bool) -> str:
    if content is not None:
        return content
    if content_file:
        return Path(content_file).expanduser().read_text(encoding="utf-8")
    if use_stdin:
        return sys.stdin.read()
    raise VaultOpError("Provide --content, --content-file, or --stdin")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Second-brain save, update, delete, search, index, and MCP operator")
    parser.add_argument("--vault", help="Path to second-brain vault (defaults to config vault_dir)")
    parser.add_argument("--config", help="Path to second-brain config JSON")
    sub = parser.add_subparsers(dest="command", required=True)

    p_save = sub.add_parser("save", help="Save a new wiki note or immutable raw capture")
    p_save.add_argument("--title", help="Note title")
    p_save.add_argument("--path", help="Vault-relative path (under wiki/ or raw/)")
    p_save.add_argument("--folder", default="wiki/notes", help="Folder under wiki/ when --path is omitted")
    p_save.add_argument("--content", help="Inline markdown content")
    p_save.add_argument("--content-file", help="Read markdown content from file")
    p_save.add_argument("--stdin", action="store_true", help="Read content from stdin")
    p_save.add_argument("--tag", action="append", default=[], help="Frontmatter tag (repeatable)")
    p_save.add_argument("--kind", choices=["wiki", "raw"], default="wiki")
    p_save.add_argument("--no-reindex", action="store_true")
    p_save.add_argument("--json", action="store_true")

    p_update = sub.add_parser("update", help="Update an existing non-raw wiki note")
    p_update.add_argument("--path", required=True, help="Vault-relative path under wiki/")
    p_update.add_argument("--content", help="Replacement or appended markdown content")
    p_update.add_argument("--content-file", help="Read markdown content from file")
    p_update.add_argument("--stdin", action="store_true", help="Read content from stdin")
    p_update.add_argument("--append", action="store_true", help="Append instead of replacing")
    p_update.add_argument("--expected-sha256", help="Optimistic concurrency SHA-256 check")
    p_update.add_argument("--title", help="Override title recorded in index.md")
    p_update.add_argument("--no-reindex", action="store_true")
    p_update.add_argument("--json", action="store_true")

    p_del = sub.add_parser("delete", help="Delete a non-raw wiki note (archives to .second-brain/trash/ by default)")
    p_del.add_argument("--path", required=True, help="Vault-relative path under wiki/")
    p_del.add_argument("--hard", action="store_true", help="Permanently delete without archiving to .second-brain/trash/")
    p_del.add_argument("--dry-run", action="store_true", help="Preview deletion without modifying disk")
    p_del.add_argument("--no-reindex", action="store_true")
    p_del.add_argument("--json", action="store_true")

    p_search = sub.add_parser("search", help="Search notes across the second-brain vault")
    p_search.add_argument("query", help="Search query text")
    p_search.add_argument("--kind", choices=["all", "wiki", "raw"], default="all")
    p_search.add_argument("--limit", type=int, default=10)
    p_search.add_argument("--json", action="store_true")

    p_init = sub.add_parser("init-indexes", help="Initialize .zvec-grep and .mex indexes in the vault")
    p_init.add_argument("--json", action="store_true")

    p_status = sub.add_parser("status", help="Show second-brain vault status")
    p_status.add_argument("--json", action="store_true")

    sub.add_parser("mcp", help="Run stdio JSON-RPC MCP server exposing sb_save/sb_update/sb_delete/sb_search/sb_status")

    args = parser.parse_args(argv)
    if args.command == "mcp":
        return run_mcp_server(args.vault, args.config)

    try:
        vault, config = resolve_config_and_vault(args.vault, args.config)
        if args.command == "save":
            text = _read_content_arg(args.content, args.content_file, args.stdin)
            res = save_note(
                vault,
                config,
                title=args.title,
                rel_path=args.path,
                folder=args.folder,
                content=text,
                tags=args.tag,
                kind=args.kind,
                reindex=not args.no_reindex,
            )
        elif args.command == "update":
            text = _read_content_arg(args.content, args.content_file, args.stdin)
            res = update_note(
                vault,
                config,
                rel_path=args.path,
                content=text,
                append=args.append,
                expected_sha256=args.expected_sha256,
                title=args.title,
                reindex=not args.no_reindex,
            )
        elif args.command == "delete":
            res = delete_note(
                vault,
                config,
                rel_path=args.path,
                hard=args.hard,
                dry_run=args.dry_run,
                reindex=not args.no_reindex,
            )
        elif args.command == "search":
            res = search_vault(
                vault,
                config,
                query=args.query,
                kind=args.kind,
                limit=args.limit,
            )
        elif args.command == "init-indexes":
            res = init_indexes(vault, config)
        elif args.command == "status":
            res = vault_status(vault, config)
        else:
            raise VaultOpError(f"Unsupported command: {args.command}")
    except VaultOpError as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1

    if getattr(args, "json", False) or args.command in ("init-indexes", "status", "save", "update", "delete", "search"):
        print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
