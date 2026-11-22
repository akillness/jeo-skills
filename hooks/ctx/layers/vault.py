"""llm-wiki vault layer for `ctx`: archive / TTL purge / consolidation / lint-lite.

Policy (seed `seed_ctx_lifecycle_20261001`, constraints 1-3, 9):
  * `raw/sources/**` and `Clippings/**` are exempt forever — no Action ever
    targets a path with such a segment (also inside `wiki/archive/roots/*`).
  * AUTHORED pages (wiki/concepts|projects|reports|entities, answered queries,
    anything without an auto-generated marker) are never deleted: stale ones
    are moved to `wiki/archive/<rel>` with `status: archived` frontmatter and
    purged only after `ttl_days`.
  * REGENERABLE pages (auto source summaries, unanswered query stubs,
    project-graph/project-wiki copies, empty fix* dirs, broken auto bullets)
    are deleted / rewritten directly.
  * Other live vault roots are consolidated under `wiki/archive/roots/<slug>/`
    with an ORIGIN.md + `.ctx-archived.json` marker; their `raw/sources/**`
    lands under the archive and is purge-exempt forever.
  * Foreign bulk (.venv, tmp, .survey, .jeo, Reviews, Tasks) is reported only.

plan() is pure. apply() is idempotent and does nothing when ctx.dry_run.
The core apply loop appends the ledger; this module never does.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

from ctx.core import (
    CANONICAL_VAULT,
    Action,
    Context,
    atomic_write_text,
    file_size,
    is_raw_exempt,
    iter_files,
    tree_size,
)

LAYER = "vault"
REFRESH_DESCRIPTION = "vault: lint-lite (broken wikilinks/orphans), ensure index.md ctx:auto markers, write .state/raw-manifest.json"

ARCHIVE_REL = Path("wiki") / "archive"
ROOTS_REL = ARCHIVE_REL / "roots"
MARKER_FILE = ".ctx-archived.json"
AUTO_START = "<!-- ctx:auto:START -->"
AUTO_END = "<!-- ctx:auto:END -->"
SYNTHESIS_BOUNDARY_RE = re.compile(r"^## Raw ingest\b|^<!-- (?:SOURCES|QUERIES|REPORTS|ctx:auto):START -->", re.M)

AUTHORED_DIRS = ("concepts", "projects", "reports", "entities")
REGENERABLE_REPORT_DIRS = ("project-graphs", "project-wiki")
QUERY_PLACEHOLDER = "- [ ] Fill this after the answer becomes worth keeping"
FOREIGN_BULK = (".venv", "tmp", ".survey", ".jeo", "Reviews", "Tasks")
ROOT_STRAYS = ("build-inventory.json",)
# Directories that are never pages (lint + inbound-link index + page classes).
NON_PAGE_DIRS = {".obsidian", ".trash", ".git", ".graphify", "graphify-out", ".state", ".venv",
                 ".jeo", ".survey", "scripts", "tmp", "node_modules", "Templates"}
CACHE_SUBDIRS = (".graphify", "graphify-out")  # regenerable caches inside foreign roots
# Consolidation scan roots and exclusions.
SKELETON_SCAN_ROOTS = (Path.home() / ".superset" / "projects", Path.home() / "Documents")
SKELETON_SCAN_DEPTH = 4
SKELETON_NEVER = (Path.home() / "Documents" / "Unity" / "portfolio" / "unknown-castle",)
SKELETON_PRUNE = {"node_modules", ".venv", "Library", ".git", "graphify-out", ".graphify", "dist", "build"}
FIXED_LIVE_ROOTS = (
    Path.home() / ".plannotator" / "llm-wiki",
    Path.home() / "vaults" / "obsidian-mind" / "llm-wiki",
)

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]")
MDLINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s#]+)(?:#[^)]*)?\)")
BULLET_LINK_RE = re.compile(r"^\s*-\s+(?:[A-Za-z ]+:\s*)?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]")
FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n?", re.S)


# --------------------------------------------------------------------------- #
# small helpers
# --------------------------------------------------------------------------- #


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _frontmatter(text: str) -> Dict[str, str]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}
    out: Dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" not in line or line.startswith((" ", "\t", "-")):
            continue
        k, _, v = line.partition(":")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def _parse_iso(value: str) -> Optional[float]:
    value = (value or "").strip().strip('"').strip("'")
    if not value:
        return None
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return time.time()


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    try:
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 16), b""):
                h.update(chunk)
    except OSError:
        return ""
    return h.hexdigest()


def _rel(ctx: Context, path: Path) -> str:
    try:
        return path.relative_to(ctx.vault).as_posix()
    except ValueError:
        return str(path)


def _count_files(root: Path) -> int:
    return sum(1 for _ in iter_files(root))


def _slug(text: str, max_len: int = 64) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    s = re.sub(r"-{2,}", "-", s)
    return (s or "root")[:max_len].strip("-") or "root"


def _obsidian_cli_usable(ctx: Context) -> bool:
    """obsidian-cli only ever addresses the registered vault; never for scratch copies."""
    try:
        if Path(ctx.vault).resolve() != CANONICAL_VAULT.resolve():
            return False
    except OSError:
        return False
    if shutil.which("obsidian-cli") is None:
        return False
    try:
        cp = subprocess.run(["pgrep", "-x", "Obsidian"], capture_output=True, timeout=5)
    except Exception:
        return False
    return cp.returncode == 0


# --------------------------------------------------------------------------- #
# page index (pure, read-only)
# --------------------------------------------------------------------------- #


class _Index:
    """All vault markdown pages, their classes and inbound links."""

    def __init__(self, ctx: Context) -> None:
        self.ctx = ctx
        self.vault = Path(ctx.vault)
        self.archive = self.vault / ARCHIVE_REL
        self.pages: List[Path] = []          # every .md page (incl. archive) outside NON_PAGE_DIRS
        self.live_pages: List[Path] = []     # pages not under wiki/archive
        self.by_rel: Dict[str, Path] = {}    # 'wiki/queries/x' -> path (no suffix)
        self.by_base: Dict[str, List[Path]] = {}
        self.inbound: Dict[Path, Set[Path]] = {}
        self.outbound: Dict[Path, List[str]] = {}
        self.broken: List[Tuple[Path, str]] = []
        self.index_md = self.vault / "index.md"
        self.log_md = self.vault / "log.md"
        self._scan()

    # -- scanning -------------------------------------------------------- #

    def _iter_md(self) -> Iterable[Path]:
        for dirpath, dirnames, filenames in os.walk(self.vault):
            dirnames[:] = sorted(d for d in dirnames if d not in NON_PAGE_DIRS and not d.startswith(".obsidian"))
            for fn in sorted(filenames):
                if fn.endswith(".md"):
                    yield Path(dirpath) / fn

    def _scan(self) -> None:
        for p in self._iter_md():
            self.pages.append(p)
            rel = p.relative_to(self.vault).with_suffix("").as_posix()
            self.by_rel.setdefault(rel, p)
            self.by_base.setdefault(p.stem, []).append(p)
            if not self._under_archive(p):
                self.live_pages.append(p)
        for p in self.pages:
            self.inbound.setdefault(p, set())
        for p in self.pages:
            text = _read(p)
            targets = [t.strip() for t in WIKILINK_RE.findall(text)]
            targets += [t.strip() for t in MDLINK_RE.findall(text) if not t.startswith(("http://", "https://", "mailto:"))]
            self.outbound[p] = targets
            if self._under_archive(p):
                continue  # archived pages never keep a live page alive
            for t in targets:
                dest = self.resolve(t, from_page=p)
                if dest is None:
                    if t.endswith((".png", ".jpg", ".jpeg", ".gif", ".svg", ".pdf", ".json", ".py", ".sh")):
                        continue  # asset / code link, not a page link
                    self.broken.append((p, t))
                else:
                    self.inbound[dest].add(p)

    def _under_archive(self, p: Path) -> bool:
        try:
            p.relative_to(self.archive)
            return True
        except ValueError:
            return False

    # -- resolution ------------------------------------------------------ #

    def resolve(self, target: str, from_page: Optional[Path] = None) -> Optional[Path]:
        t = target.strip().strip("/")
        if t.endswith(".md"):
            t = t[:-3]
        if not t:
            return None
        hit = self.by_rel.get(t)
        if hit is not None:
            return hit
        if from_page is not None and "/" in t:
            cand = (from_page.parent / (t + ".md"))
            try:
                rel = cand.resolve().relative_to(self.vault.resolve()).with_suffix("").as_posix()
                hit = self.by_rel.get(rel)
                if hit is not None:
                    return hit
            except (ValueError, OSError):
                pass
        base = t.rsplit("/", 1)[-1]
        cands = self.by_base.get(base)
        if cands:
            return cands[0]
        return None

    def target_exists(self, target: str) -> bool:
        """For index/log reconciliation: resolves to ANY existing .md (incl. archive)
        or to an existing non-md file under the vault."""
        if self.resolve(target) is not None:
            return True
        t = target.strip().strip("/")
        return (self.vault / t).exists() or (self.vault / (t + ".md")).exists()

    # -- classification -------------------------------------------------- #

    def classify(self, p: Path) -> str:
        """'raw' | 'archive' | 'index' | 'auto-source' | 'auto-query' | 'auto-report'
        | 'regen-copy' | 'authored' | 'other'."""
        rel = p.relative_to(self.vault)
        parts = rel.parts
        if is_raw_exempt(rel):
            return "raw"
        if self._under_archive(p):
            return "archive"
        if len(parts) == 1 and parts[0] in ("index.md", "log.md"):
            return "index"
        if parts[0] != "wiki" or len(parts) < 3:
            return "other"
        section = parts[1]
        text = _read(p)
        fm = _frontmatter(text)
        if section == "reports" and len(parts) >= 4 and parts[2] in REGENERABLE_REPORT_DIRS:
            return "regen-copy"
        if section == "sources" and fm.get("type") == "source-summary":
            return "auto-source"
        if section == "queries":
            if fm.get("section") == "queries" and "raw_prompt" in fm and QUERY_PLACEHOLDER in text:
                return "auto-query"
            return "authored"
        if section == "reports" and fm.get("section") == "reports" and "raw_output" in fm and fm.get("status") == "captured":
            return "auto-report"
        if section in AUTHORED_DIRS:
            return "authored"
        if "raw_path" in fm or "raw_prompt" in fm or "raw_output" in fm:
            return "auto-source"
        return "authored"

    def synthesis_links(self) -> Set[Path]:
        text = _read(self.index_md)
        head = split_synthesis(text)[0]
        out: Set[Path] = set()
        for t in WIKILINK_RE.findall(head):
            dest = self.resolve(t.strip())
            if dest is not None:
                out.add(dest)
        return out


def split_synthesis(index_text: str) -> Tuple[str, str]:
    """(synthesis, rest): synthesis = everything before the first auto boundary."""
    m = SYNTHESIS_BOUNDARY_RE.search(index_text)
    if not m:
        return index_text, ""
    return index_text[: m.start()], index_text[m.start():]


# --------------------------------------------------------------------------- #
# plan
# --------------------------------------------------------------------------- #


def plan(ctx: Context) -> List[Action]:
    vault = Path(ctx.vault)
    if not (vault / "wiki").is_dir():
        ctx.log("vault: %s has no wiki/ — nothing to plan" % vault)
        return []
    idx = _Index(ctx)
    actions: List[Action] = []
    actions += _plan_regenerable(ctx, idx)
    actions += _plan_authored_archive(ctx, idx)
    actions += _plan_index_log(ctx, idx)
    actions += _plan_purge(ctx)
    actions += _plan_consolidation(ctx)
    actions += _plan_notes(ctx)
    # absolute guard: never an exempt target, never the ledger
    out: List[Action] = []
    for a in actions:
        if is_raw_exempt(a.path) or (a.dest and is_raw_exempt(a.dest)):
            ctx.log("vault: dropped exempt target %s" % a.path)
            continue
        if Path(a.path) == Path(ctx.ledger_path):
            continue
        out.append(a)
    return out


def _plan_regenerable(ctx: Context, idx: _Index) -> List[Action]:
    acts: List[Action] = []
    vault = idx.vault
    for p in idx.live_pages:
        cls = idx.classify(p)
        if cls == "auto-source":
            fm = _frontmatter(_read(p))
            raw_rel = fm.get("raw_path", "")
            if raw_rel and not (vault / raw_rel).exists() and not ctx.in_grace(p):
                acts.append(Action("delete", LAYER, str(p), "auto source summary whose raw capture is gone (%s)" % raw_rel, bytes=file_size(p)))
        elif cls == "auto-query":
            if ctx.older_than_ttl(p) and not ctx.in_grace(p):
                acts.append(Action("delete", LAYER, str(p), "unanswered query stub older than %dd (Answer placeholder unfilled)" % ctx.ttl_days, bytes=file_size(p)))
        elif cls == "regen-copy":
            if ctx.older_than_ttl(p) and not ctx.in_grace(p):
                sub = p.relative_to(vault / "wiki" / "reports").parts[0]
                acts.append(Action("delete", LAYER, str(p), "regenerable %s copy older than %dd (source: project graphify-out/.omc)" % (sub, ctx.ttl_days), bytes=file_size(p)))
    # empty wiki/projects/fix* dirs
    projects = vault / "wiki" / "projects"
    if projects.is_dir():
        for d in sorted(projects.iterdir()):
            if d.is_dir() and d.name.startswith("fix") and not any(d.iterdir()) and not ctx.in_grace(d):
                acts.append(Action("delete", LAYER, str(d), "empty wiki/projects/fix* residue (overnight loop)"))
    return acts


def _plan_authored_archive(ctx: Context, idx: _Index) -> List[Action]:
    acts: List[Action] = []
    synthesis = idx.synthesis_links()
    for p in idx.live_pages:
        if idx.classify(p) != "authored":
            continue
        if not ctx.older_than_ttl(p) or ctx.in_grace(p):
            continue
        if p in synthesis:
            continue
        inbound = {q for q in idx.inbound.get(p, set()) if q not in (idx.index_md, idx.log_md) and q != p}
        if inbound:
            continue
        rel = p.relative_to(idx.vault)
        dest = idx.vault / ARCHIVE_REL / rel
        acts.append(Action(
            "archive", LAYER, str(p),
            "authored page stale: mtime %s > %dd, no inbound wikilinks, not in index.md Synthesis" % (_iso(_mtime(p)).split("T")[0], ctx.ttl_days),
            dest=str(dest), bytes=file_size(p),
        ))
    return acts


def _plan_index_log(ctx: Context, idx: _Index) -> List[Action]:
    acts: List[Action] = []
    for name in ("index.md", "log.md"):
        p = idx.vault / name
        if not p.exists():
            continue
        broken = broken_auto_bullets(idx, p)
        if broken:
            acts.append(Action("regenerate", LAYER, str(p), "drop %d auto bullet(s) pointing at missing files (temp+rename; Synthesis section byte-identical)" % len(broken)))
    return acts


def broken_auto_bullets(idx: _Index, p: Path) -> List[int]:
    """Line numbers (0-based) of `- [[link]]` bullets outside the Synthesis section whose target is gone."""
    text = _read(p)
    if p.name == "index.md":
        head, rest = split_synthesis(text)
        offset = head.count("\n")
        lines = rest.split("\n")
    else:
        offset = 0
        lines = text.split("\n")
    out: List[int] = []
    for i, line in enumerate(lines):
        m = BULLET_LINK_RE.match(line)
        if not m:
            continue
        if not idx.target_exists(m.group(1)):
            out.append(offset + i)
    return out


def _archive_units(ctx: Context) -> List[Tuple[Path, Optional[float]]]:
    """Every dir under wiki/archive carrying a `.ctx-archived.json` marker -> (dir, archived_at)."""
    archive = Path(ctx.vault) / ARCHIVE_REL
    out: List[Tuple[Path, Optional[float]]] = []
    if not archive.is_dir():
        return out
    for dirpath, dirnames, filenames in os.walk(archive):
        dirnames[:] = sorted(dirnames)
        if MARKER_FILE in filenames:
            d = Path(dirpath)
            try:
                meta = json.loads(_read(d / MARKER_FILE) or "{}")
            except ValueError:
                meta = {}
            out.append((d, _parse_iso(str(meta.get("archived_at", "")))))
            dirnames[:] = []  # unit boundary: do not descend for nested markers
    return out


def _plan_purge(ctx: Context) -> List[Action]:
    acts: List[Action] = []
    archive = Path(ctx.vault) / ARCHIVE_REL
    if not archive.is_dir():
        return acts
    cutoff = ctx.ttl_cutoff()
    units = _archive_units(ctx)
    unit_dirs = [u[0] for u in units]

    def in_unit(p: Path) -> bool:
        return any(str(p).startswith(str(u) + os.sep) or p == u for u in unit_dirs)

    # 1) marker units: one unit aged from archived_at
    for d, archived_at in units:
        if archived_at is None or archived_at >= cutoff:
            continue
        files = list(iter_files(d))
        exempt = [f for f in files if is_raw_exempt(f)]
        if not exempt:
            acts.append(Action("purge", LAYER, str(d), "archived unit past TTL (archived_at %s < %dd)" % (_iso(archived_at), ctx.ttl_days), bytes=tree_size(d)))
            continue
        for f in sorted(files):
            if is_raw_exempt(f) or ctx.in_grace(f):
                continue
            if f.parent == d and f.name in (MARKER_FILE, "ORIGIN.md"):
                continue  # provenance of the surviving raw/sources stays with the unit
            acts.append(Action("purge", LAYER, str(f), "archived root file past TTL (unit archived_at %s); raw/sources & Clippings kept" % _iso(archived_at), bytes=file_size(f)))
    # 2) individually archived files: frontmatter archived_at
    for f in sorted(iter_files(archive)):
        if in_unit(f) or is_raw_exempt(f) or f.name == MARKER_FILE:
            continue
        if any(part.endswith(".moving") for part in f.relative_to(archive).parts):
            continue  # interrupted consolidation staging: recoverable state, never purged
        if f.suffix != ".md":
            continue
        fm = _frontmatter(_read(f))
        archived_at = _parse_iso(fm.get("archived_at", ""))
        if archived_at is None or archived_at >= cutoff or ctx.in_grace(f):
            continue
        acts.append(Action("purge", LAYER, str(f), "archived page past TTL (archived_at %s < %dd)" % (_iso(archived_at), ctx.ttl_days), bytes=file_size(f)))
    return acts


def _is_vault_skeleton(d: Path) -> bool:
    if (d / "SKILL.md").exists() or (d / "SKILL.toon").exists():
        return False
    if any(part.startswith(".") for part in d.parts):
        return False  # never inside .agent-skills/.claude/.codex/... dotted trees
    markers = ("index.md", "log.md", "raw", "wiki", "sync-tracker.md")
    return any((d / m).exists() for m in markers)


def find_skeletons(ctx: Context) -> List[Path]:
    """`<repo>/llm-wiki/` skeletons produced by hooks run without LLM_WIKI_VAULT."""
    vault = Path(ctx.vault)
    try:
        vault_res = vault.resolve()
    except OSError:
        vault_res = vault
    found: List[Path] = []
    for root in SKELETON_SCAN_ROOTS:
        if not root.is_dir():
            continue
        base_depth = len(root.parts)
        for dirpath, dirnames, _ in os.walk(root):
            cur = Path(dirpath)
            depth = len(cur.parts) - base_depth
            if depth >= SKELETON_SCAN_DEPTH:
                dirnames[:] = []
                continue
            dirnames[:] = sorted(d for d in dirnames if d not in SKELETON_PRUNE and not d.startswith("."))
            for d in list(dirnames):
                cand = cur / d
                if d != "llm-wiki":
                    continue
                dirnames.remove(d)  # never descend into a found root
                try:
                    cand_res = cand.resolve()
                except OSError:
                    continue
                if cand_res == vault_res or str(cand_res).startswith(str(vault_res) + os.sep):
                    continue
                if any(str(cand_res).startswith(str(n)) for n in SKELETON_NEVER):
                    continue
                if _is_vault_skeleton(cand):
                    found.append(cand)
    return found


def consolidation_roots(ctx: Context) -> List[Tuple[Path, str]]:
    """(origin dir, archive slug) for every live root that must fold into the vault."""
    vault = Path(ctx.vault)
    out: List[Tuple[Path, str]] = []
    for r in FIXED_LIVE_ROOTS:
        try:
            same = r.resolve() == vault.resolve()
        except OSError:
            same = False
        if not r.is_dir() or same or any(str(r.resolve()).startswith(str(n)) for n in SKELETON_NEVER):
            continue
        try:
            slug = _slug(r.relative_to(Path.home()).as_posix())
        except ValueError:  # outside $HOME: keep it short but unique
            slug = _slug(r.parent.name + "-" + r.name, 48) + "-" + hashlib.sha256(str(r).encode("utf-8")).hexdigest()[:8]
        out.append((r, slug))
    for s in find_skeletons(ctx):
        out.append((s, _slug("repo-" + s.parent.name + "-llm-wiki")))
    return out


MANIFEST_FILE = "MANIFEST.json"
MOVING_SUFFIX = ".moving"


def _dest_root(ctx: Context, slug: str) -> Path:
    dest = Path(ctx.vault) / ROOTS_REL / slug
    if dest.exists():
        dest = dest.with_name(slug + "-" + ctx.now.strftime("%Y%m%d"))
    return dest


def _moving_dir(dest: Path) -> Path:
    return dest.with_name(dest.name + MOVING_SUFFIX)


def _sidecar_manifest(dest: Path) -> Path:
    return dest.with_name(dest.name + MOVING_SUFFIX + ".manifest.json")


def _load_moving_manifest(dest: Path) -> Optional[dict]:
    """Manifest of an interrupted consolidation: inside <dest>.moving/ or the sidecar next to it."""
    tmp = _moving_dir(dest)
    for cand in (tmp / MANIFEST_FILE, _sidecar_manifest(dest)):
        if cand.exists():
            try:
                m = json.loads(_read(cand) or "{}")
            except ValueError:
                continue
            if isinstance(m, dict) and isinstance(m.get("files"), list) and m.get("origin"):
                return m
    return None


def interrupted_consolidations(ctx: Context) -> List[Tuple[Path, Optional[dict]]]:
    """Every `wiki/archive/roots/<slug>.moving` left by an interrupted move -> (dest, manifest|None)."""
    roots_dir = Path(ctx.vault) / ROOTS_REL
    out: List[Tuple[Path, Optional[dict]]] = []
    if not roots_dir.is_dir():
        return out
    for d in sorted(roots_dir.iterdir()):
        if d.is_dir() and d.name.endswith(MOVING_SUFFIX):
            dest = d.with_name(d.name[: -len(MOVING_SUFFIX)])
            out.append((dest, _load_moving_manifest(dest)))
    return out


def _is_canonical(vault: Path) -> bool:
    try:
        return Path(vault).resolve() == CANONICAL_VAULT.resolve()
    except OSError:
        return False


def _is_scratch_origin(origin: Path) -> bool:
    """Roots living under a temp dir (test fixtures) may fold into any vault."""
    tmp_roots = {Path(tempfile.gettempdir()).resolve(), Path("/tmp").resolve(), Path("/private/tmp")}
    try:
        o = origin.resolve()
    except OSError:
        return False
    return any(str(o).startswith(str(t) + os.sep) for t in tmp_roots)


def _plan_consolidation(ctx: Context) -> List[Action]:
    acts: List[Action] = []
    vault = Path(ctx.vault)
    pending: Dict[Path, Optional[dict]] = dict(interrupted_consolidations(ctx))
    for origin, slug in consolidation_roots(ctx):
        if ctx.in_grace(origin):
            ctx.log("vault: %s touched < grace window, consolidation deferred" % origin)
            continue
        dest = _dest_root(ctx, slug)
        if not _is_canonical(vault) and not _is_scratch_origin(origin):
            # A scratch copy under /tmp must never swallow a real root: the
            # archive would end up in the scratch tree and vanish with it.
            acts.append(Action("note", LAYER, str(origin),
                               "would consolidate into %s (%d files) — skipped: %s is not the canonical vault %s" % (
                                   dest, _count_files(origin), vault, CANONICAL_VAULT), bytes=tree_size(origin)))
            continue
        caches = [origin / c for c in CACHE_SUBDIRS if (origin / c).is_dir()]
        cache_bytes = sum(tree_size(c) for c in caches)
        n = _count_files(origin)
        was_pending = dest in pending
        manifest = pending.pop(dest, None)
        if was_pending:
            if manifest is None:
                acts.append(Action("note", LAYER, str(_moving_dir(dest)),
                                   "interrupted consolidation of %s has no readable MANIFEST.json — refusing to touch it; recover manually (never deleted by ctx)" % origin))
                continue
            reason = ("resume interrupted consolidation of %s from %s (manifest %s, %d files listed); "
                      "newer files in the re-created source are merged without overwriting" % (
                          origin, _moving_dir(dest).name, manifest.get("started_at", "?"), len(manifest.get("files", []))))
        else:
            reason = "consolidate live llm-wiki root into the canonical vault (%d files; raw/sources kept under the archive, purge-exempt)" % n
        if caches:
            # Deleting the caches first would bump the root's mtime and trip the
            # grace check on the move itself, so they are dropped from the moved
            # copy inside apply(); the ledger carries this record for both.
            reason += "; regenerable %s dropped from the archived copy (%s)" % (
                "+".join(c.name for c in caches), "%.1fMB" % (cache_bytes / 1e6))
        acts.append(Action("archive", LAYER, str(origin), reason, dest=str(dest), bytes=tree_size(origin) - cache_bytes))
    # .moving dirs whose source root was not re-created: finish them in place
    for dest, manifest in pending.items():
        tmp = _moving_dir(dest)
        if manifest is None:
            acts.append(Action("note", LAYER, str(tmp),
                               "interrupted consolidation has no readable MANIFEST.json — refusing to touch it; recover manually (never deleted by ctx)"))
            continue
        acts.append(Action("archive", LAYER, str(tmp),
                           "resume interrupted consolidation of %s from %s (manifest %s, %d files listed); source root no longer exists" % (
                               manifest.get("origin"), tmp.name, manifest.get("started_at", "?"), len(manifest.get("files", []))),
                           dest=str(dest), bytes=tree_size(tmp)))
    # stale vault copy of the prompt ingest script
    stale = vault / "scripts" / "ingest-prompt.py"
    if stale.exists() and not ctx.in_grace(stale):
        acts.append(Action(
            "archive", LAYER, str(stale),
            "stale vault copy of ingest-prompt.py (the executing copy is ~/.agents/hooks/ingest-prompt.py)",
            dest=str(vault / ARCHIVE_REL / "scripts" / "ingest-prompt.py"), bytes=file_size(stale),
        ))
    return acts


def _plan_notes(ctx: Context) -> List[Action]:
    acts: List[Action] = []
    vault = Path(ctx.vault)
    for name in FOREIGN_BULK:
        p = vault / name
        if not p.exists():
            continue
        n = _count_files(p) if p.is_dir() else 1
        acts.append(Action("note", LAYER, str(p), "foreign bulk in vault (%d files) — report only, never deleted by ctx" % n, bytes=tree_size(p) if p.is_dir() else file_size(p)))
    for name in ROOT_STRAYS:
        p = vault / name
        if p.exists():
            acts.append(Action("note", LAYER, str(p), "root stray (external build artifact) — report only", bytes=file_size(p)))
    return acts


# --------------------------------------------------------------------------- #
# apply
# --------------------------------------------------------------------------- #


def apply(action: Action, ctx: Context) -> None:
    if ctx.dry_run or action.kind == "note":
        return
    if is_raw_exempt(action.path) or (action.dest and is_raw_exempt(action.dest)):
        raise PermissionError("raw-exempt target refused: %s" % action.path)
    src = Path(action.path)
    if action.kind == "archive":
        _apply_archive(action, ctx, src)
    elif action.kind == "delete":
        _apply_delete(action, ctx, src)
    elif action.kind == "purge":
        _apply_purge(action, ctx, src)
    elif action.kind == "regenerate":
        _apply_regenerate(action, ctx, src)
    else:
        raise ValueError("vault layer cannot apply kind %r" % action.kind)


def _apply_archive(action: Action, ctx: Context, src: Path) -> None:
    dest = Path(action.dest or "")
    if not action.dest:
        raise ValueError("archive action without dest: %s" % src)
    if not src.exists():
        if dest.exists():
            return  # already archived (idempotent)
        raise FileNotFoundError(str(src))
    if src.is_dir():
        _archive_root(ctx, src, dest)
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    rel_from = _rel(ctx, src)
    if src.suffix == ".md":
        text = _stamp_frontmatter(_read(src), {
            "status": "archived",
            "archived_at": _iso(ctx.now.timestamp()),
            "archived_from": rel_from,
        })
        atomic_write_text(dest, text)  # temp + rename into place
    else:
        shutil.copy2(str(src), str(dest))  # non-markdown (scripts): verbatim, mtime kept
    src.unlink()


def _tree_manifest(root: Path) -> List[dict]:
    out = []
    for f in sorted(iter_files(root)):
        rel = f.relative_to(root).as_posix()
        out.append({"path": rel, "size": file_size(f), "cache": rel.split("/", 1)[0] in CACHE_SUBDIRS})
    return out


def _merge_tree(src: Path, dst: Path) -> Dict[str, List[str]]:
    """Move every file under src into dst WITHOUT overwriting. Identical files
    (same size + sha256) are deduped (src copy removed); differing files land
    beside the existing one as `<name>.from-source-<ts>`. Nothing is ever lost."""
    moved: List[str] = []
    deduped: List[str] = []
    renamed: List[str] = []
    for f in sorted(iter_files(src)):
        rel = f.relative_to(src)
        target = dst / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.move(str(f), str(target))
            moved.append(rel.as_posix())
        elif file_size(target) == file_size(f) and _sha256_file(target) == _sha256_file(f):
            f.unlink()
            deduped.append(rel.as_posix())
        else:
            alt = target.with_name(target.name + ".from-source-" + str(int(_mtime(f))))
            while alt.exists():
                alt = alt.with_name(alt.name + "_")
            shutil.move(str(f), str(alt))
            renamed.append(rel.as_posix())
    # drop now-empty dirs in src (never the root itself if anything is left)
    for dirpath, dirnames, filenames in os.walk(src, topdown=False):
        d = Path(dirpath)
        if d != src and not any(d.iterdir()):
            try:
                d.rmdir()
            except OSError:
                pass
    if not any(src.iterdir()):
        src.rmdir()
    return {"moved": moved, "deduped": deduped, "renamed": renamed}


def _archive_root(ctx: Context, src: Path, dest: Path) -> None:
    """Move a whole foreign root under wiki/archive/roots/<slug>/, drop its
    regenerable caches from the moved copy, stamp ORIGIN.md + marker.

    Crash-safe: a MANIFEST.json (origin, started_at, file list + sizes) is
    written beside the destination BEFORE the move and copied into the staging
    dir `<dest>.moving/`. A later apply that finds `<dest>.moving/` resumes
    from that manifest instead of touching it blindly; it NEVER rmtree's it.
    """
    if dest.exists():
        raise FileExistsError("archive destination already exists: %s" % dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = _moving_dir(dest)
    sidecar = _sidecar_manifest(dest)
    resumed = None
    if src == tmp or tmp.exists():
        manifest = _load_moving_manifest(dest)
        if manifest is None:
            raise FileExistsError(
                "interrupted consolidation at %s has no readable MANIFEST.json; refusing to touch it "
                "(recover manually, nothing deleted)" % tmp)
        resumed = _resume_consolidation(ctx, src if src != tmp else None, tmp, manifest)
        origin = Path(manifest["origin"])
        n_files = len(manifest.get("files", []))
        started_at = manifest.get("started_at", "?")
    else:
        origin = src
        files = _tree_manifest(src)
        n_files = len(files)
        started_at = _iso(ctx.now.timestamp())
        manifest = {"origin": str(src), "dest": str(dest), "started_at": started_at, "layer": LAYER, "files": files}
        atomic_write_text(sidecar, json.dumps(manifest, indent=1, sort_keys=True) + "\n")
        shutil.move(str(src), str(tmp))  # rename when same fs, copy+delete otherwise
        atomic_write_text(tmp / MANIFEST_FILE, json.dumps(manifest, indent=1, sort_keys=True) + "\n")
    dropped = []
    for cache in CACHE_SUBDIRS:
        c = tmp / cache
        if c.is_dir():
            if any(is_raw_exempt(f) for f in iter_files(c)):
                continue  # never drop a cache tree carrying exempt segments
            shutil.rmtree(str(c))
            dropped.append(cache)
    moved_at = _iso(ctx.now.timestamp())
    marker = {"archived_at": moved_at, "layer": LAYER, "from": str(origin), "files": n_files,
              "dropped_caches": dropped, "started_at": started_at, "resumed": resumed}
    atomic_write_text(tmp / MARKER_FILE, json.dumps(marker, indent=2, sort_keys=True) + "\n")
    origin_md = "\n".join([
        "---",
        'status: "archived"',
        'archived_at: "%s"' % moved_at,
        'archived_from: "%s"' % origin,
        "---",
        "",
        "# ORIGIN",
        "",
        "- origin: `%s`" % origin,
        "- moved_at: %s" % moved_at,
        "- started_at: %s" % started_at,
        "- file_count: %d" % n_files,
        "- dropped_caches: %s" % (", ".join(dropped) or "none"),
        "- resumed: %s" % (json.dumps(resumed, sort_keys=True) if resumed else "no"),
        "- note: `raw/sources/**` and `Clippings/**` under this root are purge-exempt forever.",
        "",
    ])
    atomic_write_text(tmp / "ORIGIN.md", origin_md)
    os.replace(str(tmp), str(dest))
    try:
        sidecar.unlink()
    except OSError:
        pass


def _resume_consolidation(ctx: Context, src: Optional[Path], tmp: Path, manifest: dict) -> dict:
    """Complete an interrupted move: merge whatever the (re-created) source still
    holds into tmp without overwriting, then verify every non-cache manifest
    entry is present with its recorded size. Refuses (raises) when a listed
    file is missing from both places — nothing is deleted on any path."""
    merge = {"moved": [], "deduped": [], "renamed": []}
    if src is not None and src.exists() and src != tmp:
        merge = _merge_tree(src, tmp)
    missing: List[str] = []
    mismatched: List[str] = []
    for entry in manifest.get("files", []):
        if entry.get("cache"):
            continue
        p = tmp / entry["path"]
        if not p.exists():
            missing.append(entry["path"])
        elif int(entry.get("size", -1)) != file_size(p):
            mismatched.append(entry["path"])
    if missing:
        raise FileNotFoundError(
            "resume of %s refused: %d manifest file(s) missing from both source and staging (e.g. %s); "
            "staging dir left untouched for manual recovery" % (tmp, len(missing), missing[:3]))
    if mismatched:
        ctx.log("vault: resume %s: %d file(s) differ in size from the manifest (kept as-is): %s" % (tmp.name, len(mismatched), mismatched[:3]))
    ctx.log("vault: resumed consolidation into %s (moved %d, deduped %d, renamed %d)" % (
        tmp.name, len(merge["moved"]), len(merge["deduped"]), len(merge["renamed"])))
    return {"at": _iso(ctx.now.timestamp()), "moved": len(merge["moved"]), "deduped": len(merge["deduped"]),
            "renamed": len(merge["renamed"]), "size_mismatch": mismatched[:20]}


def _stamp_frontmatter(text: str, fields: Dict[str, str]) -> str:
    m = FRONTMATTER_RE.match(text)
    if m:
        body = m.group(1).split("\n")
        keys = set(fields)
        kept = [ln for ln in body if ln.split(":", 1)[0].strip() not in keys or ln.startswith((" ", "\t", "-"))]
        kept += ['%s: "%s"' % (k, v) for k, v in fields.items()]
        return "---\n" + "\n".join(kept) + "\n---\n" + text[m.end():]
    head = "---\n" + "\n".join('%s: "%s"' % (k, v) for k, v in fields.items()) + "\n---\n\n"
    return head + text


def _apply_delete(action: Action, ctx: Context, src: Path) -> None:
    if not src.exists():
        return
    if src.is_dir():
        # the only whole-dir delete this layer plans is an EMPTY wiki/projects/fix* dir
        if any(src.iterdir()):
            raise OSError("refusing to delete non-empty dir %s" % src)
        src.rmdir()
        return
    if _obsidian_cli_usable(ctx):
        cp = subprocess.run(
            ["obsidian-cli", "vault=llm-wiki", "delete", "path=%s" % _rel(ctx, src)],
            capture_output=True, text=True, timeout=30,
        )
        if cp.returncode == 0 and not src.exists():
            return
    src.unlink()


def _apply_purge(action: Action, ctx: Context, src: Path) -> None:
    if not src.exists():
        return
    if src.is_dir():
        for f in iter_files(src):
            if is_raw_exempt(f):
                raise PermissionError("purge unit contains exempt file %s" % f)
        shutil.rmtree(str(src))
    else:
        src.unlink()
    # tidy empty parents up to wiki/archive (never touches exempt dirs: they are non-empty)
    archive = Path(ctx.vault) / ARCHIVE_REL
    parent = src.parent
    while parent != archive and str(parent).startswith(str(archive)):
        try:
            if any(parent.iterdir()):
                break
            parent.rmdir()
        except OSError:
            break
        parent = parent.parent


def _apply_regenerate(action: Action, ctx: Context, src: Path) -> None:
    idx = _Index(ctx)
    drop = set(broken_auto_bullets(idx, src))
    if not drop:
        return
    text = _read(src)
    lines = text.split("\n")
    kept = [ln for i, ln in enumerate(lines) if i not in drop]
    new_text = "\n".join(kept)
    if src.name == "index.md":
        head_before = split_synthesis(text)[0]
        head_after = split_synthesis(new_text)[0]
        if head_before != head_after:
            raise AssertionError("index.md Synthesis section would change; refusing")
    atomic_write_text(src, new_text)


# --------------------------------------------------------------------------- #
# refresh / status
# --------------------------------------------------------------------------- #


def ensure_auto_markers(ctx: Context) -> bool:
    """Append `<!-- ctx:auto:START/END -->` once at the end of index.md. Idempotent."""
    index_md = Path(ctx.vault) / "index.md"
    if not index_md.exists():
        return False
    text = _read(index_md)
    if AUTO_START in text and AUTO_END in text:
        return False
    if ctx.dry_run:
        return True
    text = text.rstrip("\n") + "\n\n## Auto-captured (ctx-managed)\n" + AUTO_START + "\n" + AUTO_END + "\n"
    atomic_write_text(index_md, text)
    return True


def refresh(ctx: Context) -> dict:
    vault = Path(ctx.vault)
    if not (vault / "wiki").is_dir():
        return {"layer": LAYER, "skipped": "no wiki/ under %s" % vault}
    idx = _Index(ctx)
    orphans = [p for p in idx.live_pages
               if p not in (idx.index_md, idx.log_md)
               and not any(q not in (idx.index_md, idx.log_md) for q in idx.inbound.get(p, set()))]
    markers_added = ensure_auto_markers(ctx)
    classes: Dict[str, int] = {}
    for p in idx.live_pages:
        c = idx.classify(p)
        classes[c] = classes.get(c, 0) + 1
    out = {
        "layer": LAYER,
        "pages": len(idx.live_pages),
        "broken_wikilinks": len(idx.broken),
        "orphans": len(orphans),
        "classes": classes,
        "index_markers_added": markers_added,
        "dry_run": ctx.dry_run,
    }
    ctx.log("vault refresh: %d pages, %d broken links, %d orphans%s" % (
        out["pages"], out["broken_wikilinks"], out["orphans"], ", markers added" if markers_added else ""))
    return out


def raw_roots(ctx: Context) -> List[Path]:
    vault = Path(ctx.vault)
    roots = [vault / "raw" / "sources"]
    roots_dir = vault / ROOTS_REL
    if roots_dir.is_dir():
        for d in sorted(roots_dir.iterdir()):
            r = d / "raw" / "sources"
            if r.is_dir():
                roots.append(r)
    return [r for r in roots if r.is_dir()]


def raw_manifest(ctx: Context) -> dict:
    """count + sha256 over sorted `path|size|sha256` of every file under each raw root."""
    vault = Path(ctx.vault)
    entries: List[dict] = []
    for root in raw_roots(ctx):
        for f in iter_files(root):
            st = f.stat()
            entries.append({"path": _rel(ctx, f), "size": st.st_size, "sha256": _sha256_file(f)})
    entries.sort(key=lambda e: e["path"])
    h = hashlib.sha256()
    for e in entries:
        h.update(("%s|%d|%s\n" % (e["path"], e["size"], e["sha256"])).encode("utf-8"))
    return {
        "vault": str(vault),
        "generated_at": _iso(ctx.now.timestamp()),
        "roots": [_rel(ctx, r) for r in raw_roots(ctx)],
        "count": len(entries),
        "sha256": h.hexdigest(),
        "entries": entries,
    }


def write_raw_manifest(ctx: Context) -> Path:
    m = raw_manifest(ctx)
    out = Path(ctx.vault) / ".state" / "raw-manifest.json"
    atomic_write_text(out, json.dumps(m, indent=1, sort_keys=True) + "\n")
    return out


def status(ctx: Context) -> dict:
    vault = Path(ctx.vault)
    if not (vault / "wiki").is_dir():
        return {"layer": LAYER, "vault": str(vault), "present": False}
    idx = _Index(ctx)
    classes: Dict[str, int] = {}
    for p in idx.live_pages:
        c = idx.classify(p)
        classes[c] = classes.get(c, 0) + 1
    archive = vault / ARCHIVE_REL
    archive_count = sum(1 for _ in iter_files(archive)) if archive.is_dir() else 0
    ledger = Path(ctx.ledger_path)
    ledger_lines = 0
    if ledger.exists():
        ledger_lines = sum(1 for ln in _read(ledger).splitlines() if ln.strip())
    manifest = raw_manifest(ctx)
    try:
        manifest_path = str(write_raw_manifest(ctx))
    except OSError as exc:
        manifest_path = "unwritable: %s" % exc
    index_text = _read(vault / "index.md")
    return {
        "layer": LAYER,
        "vault": str(vault),
        "present": True,
        "pages": len(idx.live_pages),
        "classes": classes,
        "archive_files": archive_count,
        "archive_units": len(_archive_units(ctx)),
        "ledger_path": str(ledger),
        "ledger_bytes": file_size(ledger),
        "ledger_lines": ledger_lines,
        "raw_files": manifest["count"],
        "raw_sha256": manifest["sha256"],
        "raw_manifest": manifest_path,
        "index_has_auto_markers": AUTO_START in index_text and AUTO_END in index_text,
        "broken_wikilinks": len(idx.broken),
        "consolidation_roots": [str(o) for o, _ in consolidation_roots(ctx)],
    }


def evidence_roots(ctx: Context) -> List[Path]:
    vault = Path(ctx.vault)
    return [vault / "wiki", vault / "raw", vault / "index.md", vault / "log.md"]
