#!/usr/bin/env python3
"""jeox — lightweight code-graph + BM25 search DB (mex/zvec core extraction).

Per-repo DB at `<repo>/.jeo/db/jeo.db`. No external dependencies.

CLI:
  jeox build [--repo PATH] [--full]
  jeox who-calls NAME [--json]
  jeox what-calls NAME [--json]
  jeox where-defined NAME [--json]
  jeox impact NAME|PATH [--json]
  jeox query "q" [-g GLOB]... [--limit N] [--json]
  jeox status [--json]
  jeox mcp
"""
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import sqlite3
import sys
import tempfile
import urllib.request
from pathlib import Path

DB_NAME = ".jeo/db/jeo.db"
SKIP_DIRS = {
    "node_modules", ".git", ".mex", ".zvec-grep", ".jeo", "dist", "build",
    "__pycache__", ".venv", "venv", "target", ".next", ".turbo", ".cache",
}
SKIP_FILES = {"bun.lock", "package-lock.json", "yarn.lock"}
CODE_EXT = {".ts": "ts", ".tsx": "ts", ".mjs": "js", ".js": "js", ".cjs": "js",
            ".py": "py", ".rs": "rs"}
MD_EXT = {".md": "md"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT, path TEXT NOT NULL,
  line INTEGER, lang TEXT
);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE TABLE IF NOT EXISTS edges (
  caller_id INTEGER REFERENCES symbols(id), callee_name TEXT NOT NULL,
  kind TEXT, src_line INTEGER
);
CREATE INDEX IF NOT EXISTS idx_edges_caller ON edges(caller_id);
CREATE INDEX IF NOT EXISTS idx_edges_callee ON edges(callee_name);
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY, path TEXT NOT NULL, heading TEXT, body TEXT NOT NULL, lang TEXT
);
CREATE TABLE IF NOT EXISTS files_state (
  path TEXT PRIMARY KEY, mtime REAL, sha256 TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  body, heading, path, content='chunks', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, body, heading, path)
    VALUES (new.id, new.body, new.heading, new.path);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, body, heading, path)
    VALUES ('delete', old.id, old.body, old.heading, old.path);
END;
"""

# --- extraction patterns ---------------------------------------------------
DEF_PATTERNS = {
    "ts": [
        re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)"),
        re.compile(r"^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)"),
        re.compile(r"^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\("),
    ],
    "py": [
        re.compile(r"^\s*def\s+(\w+)"),
        re.compile(r"^\s*class\s+(\w+)"),
    ],
    "rs": [
        re.compile(r"^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)"),
        re.compile(r"^\s*(?:pub\s+)?struct\s+(\w+)"),
        re.compile(r"^\s*(?:pub\s+)?trait\s+(\w+)"),
        re.compile(r"^\s*(?:pub\s+)?enum\s+(\w+)"),
    ],
}
CALL_PATTERN = re.compile(r"\b(\w+)\s*\(")
IMPORT_PATTERNS = {
    "py": re.compile(r"^\s*(?:from\s+[\w.]+\s+)?import\s+(.+)$"),
    "ts": re.compile(r"^\s*import\s+(?:type\s+)?(?:\{([^}]*)\}|\*?as\s+\w+|\w+)\s+from"),
    "js": re.compile(r"^\s*(?:import\s+(?:\{([^}]*)\})?.*\sfrom|const\s+\w+\s*=\s*require\()"),
    "rs": re.compile(r"^\s*use\s+[\w:]+(?:\{([^}]*)\})?;"),
}
HEADING_RE = re.compile(r"^(#{1,4})\s+(.*)$")
CHUNK_MAX = 3600
CHUNK_OVERLAP = 540


def open_db(repo: Path) -> sqlite3.Connection:
    db_path = repo / DB_NAME
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    con.execute("PRAGMA temp_store=MEMORY")
    con.execute("PRAGMA cache_size=-16000")
    con.execute("PRAGMA mmap_size=67108864")
    con.execute("PRAGMA busy_timeout=5000")
    con.executescript(SCHEMA)
    return con


def iter_files(repo: Path):
    for root, dirs, files in os.walk(repo, topdown=True):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            ext = Path(f).suffix
            if f in SKIP_FILES or ext.endswith("lock") or ext == ".json":
                continue
            if ext in CODE_EXT or ext in MD_EXT:
                yield Path(root) / f


def extract_symbols_and_edges(rel: str, text: str, lang: str):
    """Return (symbols, edges) — heuristic: caller = nearest preceding def."""
    defs = []
    if lang in DEF_PATTERNS:
        for i, line in enumerate(text.splitlines(), 1):
            for pat in DEF_PATTERNS[lang]:
                m = pat.match(line)
                if m:
                    kind = "class" if re.search(r"\bclass\b|\bstruct\b|\btrait\b|\benum\b", line) else "function"
                    defs.append((m.group(1), kind, i, line))
                    break
    symbols = [(name, kind, rel, i, lang) for (name, kind, i, _l) in defs]

    # resolve caller by nearest preceding def (simple nesting collapse)
    def caller_at(line_no):
        best = None
        for (name, kind, i, _l) in defs:
            if i <= line_no and (best is None or i > best[2]):
                best = (name, kind, i)
        return best

    edges = []
    lines = text.splitlines()
    for i, line in enumerate(lines, 1):
        imp = IMPORT_PATTERNS.get(lang)
        if imp:
            m = imp.match(line)
            if m and i <= (defs[0][2] if defs else 1):
                names = (m.group(1) or "").split(",")
                for n in names:
                    n = n.strip().split(" as ")[0].strip()
                    if n:
                        edges.append((None, n, "import", i))
                continue
        # skip def lines themselves
        if any(pat.match(line) for pat in DEF_PATTERNS.get(lang, [])):
            continue
        for m in CALL_PATTERN.finditer(line):
            callee = m.group(1)
            if callee in ("if", "for", "while", "switch", "catch", "return",
                          "match", "elif", "with", "fn", "def", "new", "typeof"):
                continue
            c = caller_at(i)
            caller_name = c[0] if c else None
            edges.append((caller_name, callee, "call", i))
    # resolve caller names to symbol rows later in build()
    return symbols, edges


def chunk_markdown(rel: str, text: str):
    """Heading-based chunking (zvec extractor parameters)."""
    chunks = []
    headings: list[str] = []
    cur, cur_h = [], ""
    def flush():
        if cur:
            chunks.append((cur_h, "\n".join(cur)))
            cur.clear()
    for line in text.splitlines():
        m = HEADING_RE.match(line)
        if m:
            flush()
            level = len(m.group(1))
            headings = headings[: level - 1] + [m.group(2).strip()]
            cur_h = " > ".join(headings)
        cur.append(line)
    flush()
    if not chunks:
        chunks = [("", text)]
    out = []
    for h, body in chunks:
        body = body.strip()
        while len(body) > CHUNK_MAX:
            out.append((h, body[:CHUNK_MAX]))
            body = body[CHUNK_MAX - CHUNK_OVERLAP:]
        out.append((h, body))
    return [(rel, h, b, "md") for (h, b) in out if b]


MAX_WIKI_FILES = 40
WIKI_SUBDIRS = ("projects", "concepts", "entities", "reports", "queries")
_BACKTICK_IDENT_RE = re.compile(r"`([A-Za-z_][A-Za-z0-9_]{2,})`")


def _is_temp_workspace(repo: Path) -> bool:
    try:
        resolved = repo.resolve()
    except OSError:
        resolved = repo
    tmp_resolved = Path(tempfile.gettempdir()).resolve()
    prefixes = (
        str(tmp_resolved),
        "/tmp",
        "/private/tmp",
        "/var/folders",
        "/private/var/folders",
    )
    target = str(resolved)
    return any(target == p or target.startswith(p + "/") for p in prefixes)


def discover_project_wiki_files(repo: Path, explicit_wiki_root: str | None = None) -> list[tuple[str, Path]]:
    env_vault = (os.environ.get("JEO_WIKI_ROOT") or os.environ.get("LLM_WIKI_VAULT") or "").strip()
    vault_str = (explicit_wiki_root or "").strip() or env_vault or ("" if _is_temp_workspace(repo) else str(Path.home() / "vaults" / "llm-wiki"))
    if not vault_str:
        return []
    wiki_dir = Path(vault_str) / "wiki"
    if not wiki_dir.is_dir():
        return []
    real_wiki = wiki_dir.resolve()
    project_slug = repo.resolve().name.lower()
    if len(project_slug) < 2:
        return []

    matched: dict[Path, tuple[int, float]] = {}
    projects_dir = real_wiki / "projects"
    sub_dir = projects_dir / project_slug
    if sub_dir.is_dir():
        for p in sub_dir.rglob("*.md"):
            if p.is_file() and not p.name.startswith("."):
                try:
                    matched[p.resolve()] = (0, p.stat().st_mtime)
                except OSError:
                    pass
    if projects_dir.is_dir():
        for p in projects_dir.iterdir():
            if p.is_file() and p.suffix.lower() in (".md", ".mdx") and project_slug in p.name.lower():
                try:
                    matched.setdefault(p.resolve(), (0, p.stat().st_mtime))
                except OSError:
                    pass
    for sub in WIKI_SUBDIRS:
        if sub == "projects":
            continue
        d = real_wiki / sub
        if not d.is_dir():
            continue
        for p in d.iterdir():
            if p.is_file() and p.suffix.lower() in (".md", ".mdx") and project_slug in p.name.lower():
                try:
                    matched.setdefault(p.resolve(), (1, p.stat().st_mtime))
                except OSError:
                    pass

    ordered = sorted(matched.items(), key=lambda kv: (kv[1][0], -kv[1][1]))[:MAX_WIKI_FILES]
    out: list[tuple[str, Path]] = []
    for abs_p, _ in ordered:
        rel_virt = "@wiki/" + abs_p.relative_to(real_wiki).as_posix()
        out.append((rel_virt, abs_p))
    return out


def _extract_wiki_refs(text: str) -> list[str]:
    refs: list[str] = []
    seen_ref: set[str] = set()
    for m in _BACKTICK_IDENT_RE.finditer(text):
        tok = m.group(1)
        if tok not in seen_ref:
            seen_ref.add(tok)
            refs.append(tok)
            if len(refs) >= 64:
                break
    return refs


def rerank_hits_with_qev(query: str, hits: list[dict], explicit_rerank: bool | None = None) -> list[dict]:
    enabled = explicit_rerank is True or (explicit_rerank is not False and os.environ.get("JEOX_JEV_RERANK") == "1")
    if not enabled or len(hits) <= 1:
        return hits
    endpoint = (os.environ.get("JEOX_QEV_URL") or "").strip() or "http://127.0.0.1:8017/v1/systemone"
    capped = hits[:12]
    state: dict[str, str] = {"query": query}
    questions: dict[str, dict] = {}
    for i, item in enumerate(capped):
        key = f"cand_{i}"
        state[key] = f"{item.get('path', '')} {item.get('heading') or ''}: {item.get('snippet', '')}"[:200]
        questions[f"relevant::{i}"] = {
            "type": "noul",
            "instructions": f"Is candidate {key} directly relevant to the query?",
        }
    try:
        req = urllib.request.Request(
            endpoint,
            data=json.dumps({"state": state, "model": "qev-0.8b-text-Q8_0", "questions": questions}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=0.5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        answers = payload.get("answers") if isinstance(payload, dict) else None
        if not isinstance(answers, dict):
            return hits
        total = len(capped)
        scored = []
        for idx, item in enumerate(capped):
            bm25_norm = 1.0 - (idx / (total - 1)) if total > 1 else 1.0
            ans = answers.get(f"relevant::{idx}")
            noul_prob = float(ans["noul"]) if isinstance(ans, dict) and isinstance(ans.get("noul"), (int, float)) else bm25_norm
            scored.append((-(0.45 * bm25_norm + 0.55 * noul_prob), idx, item))
        scored.sort(key=lambda t: (t[0], t[1]))
        return [t[2] for t in scored] + hits[12:]
    except Exception:
        return hits


def cmd_build(args):
    repo = Path(args.repo or os.getcwd()).resolve()
    con = open_db(repo)
    full = bool(getattr(args, "full", False))
    state = {} if full else {row[0]: (row[1], row[2]) for row in con.execute("SELECT path, mtime, sha256 FROM files_state")}
    changed, removed = [], []
    seen = set()
    entries = [(str(path.relative_to(repo)), path, False) for path in iter_files(repo)] + [
        (virt, p, True) for virt, p in discover_project_wiki_files(repo, getattr(args, "wiki_root", None))
    ]
    for rel, path, is_wiki in entries:
        seen.add(rel)
        st = path.stat()
        prev = state.get(rel)
        if prev is not None and prev[0] == st.st_mtime:
            continue
        with open(path, "rb") as fh:
            raw = fh.read()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        sha = hashlib.sha256(raw).hexdigest()
        if prev is not None and prev[1] == sha:
            con.execute("UPDATE files_state SET mtime=? WHERE path=?", (st.st_mtime, rel))
            continue
        changed.append((rel, path, st, sha, text, is_wiki))
    for rel in state:
        if rel not in seen:
            removed.append(rel)

    cur = con.cursor()
    if changed or removed:
        for rel, path, st, sha, text, is_wiki in changed:
            lang = "md" if is_wiki else (CODE_EXT.get(path.suffix) or MD_EXT.get(path.suffix))
            cur.execute("SELECT id FROM chunks WHERE path=?", (rel,))
            chunk_ids = [r[0] for r in cur.fetchall()]
            for cid in chunk_ids:
                cur.execute("INSERT INTO chunks_fts(chunks_fts,rowid,body,heading,path) VALUES('delete',?,NULL,NULL,NULL)", (cid,))
            cur.execute("DELETE FROM chunks WHERE path=?", (rel,))
            cur.execute("DELETE FROM edges WHERE caller_id IN (SELECT id FROM symbols WHERE path=?)", (rel,))
            cur.execute("DELETE FROM symbols WHERE path=?", (rel,))
            cur.execute("DELETE FROM edges WHERE kind='import' AND src_line IS NOT NULL AND caller_id IS NULL AND callee_name IN (SELECT name FROM symbols WHERE path=?)", (rel,))
            if lang == "md":
                for (r, h, b, l) in chunk_markdown(rel, text):
                    cur.execute("INSERT INTO chunks(path,heading,body,lang) VALUES(?,?,?,?)", (r, h, b, l))
                if is_wiki:
                    refs = _extract_wiki_refs(text)
                    if refs:
                        cur.execute("INSERT INTO symbols(name,kind,path,line,lang) VALUES(?,?,?,?,?)", (rel, "wiki", rel, 1, "wiki"))
                        wiki_sym_id = cur.lastrowid
                        for ident in refs:
                            cur.execute("INSERT INTO edges(caller_id,callee_name,kind,src_line) VALUES(?,?,?,?)", (wiki_sym_id, ident, "references", 1))
            else:
                cur.execute("INSERT INTO chunks(path,heading,body,lang) VALUES(?,NULL,?,?)", (rel, text[:2048], lang))
                syms, edges = extract_symbols_and_edges(rel, text, lang)
                id_by_name = {}
                for (name, kind, r, line, lg) in syms:
                    cur.execute("INSERT INTO symbols(name,kind,path,line,lang) VALUES(?,?,?,?,?)", (name, kind, r, line, lg))
                    id_by_name.setdefault(name, cur.lastrowid)
                for (caller, callee, kind, line) in edges:
                    caller_id = id_by_name.get(caller) if caller else None
                    cur.execute("INSERT INTO edges(caller_id,callee_name,kind,src_line) VALUES(?,?,?,?)", (caller_id, callee, kind, line))
            cur.execute("INSERT OR REPLACE INTO files_state(path,mtime,sha256) VALUES(?,?,?)", (rel, st.st_mtime, sha))
        for rel in removed:
            cur.execute("SELECT id FROM chunks WHERE path=?", (rel,))
            for (cid,) in cur.fetchall():
                cur.execute("INSERT INTO chunks_fts(chunks_fts,rowid,body,heading,path) VALUES('delete',?,NULL,NULL,NULL)", (cid,))
            cur.execute("DELETE FROM chunks WHERE path=?", (rel,))
            cur.execute("DELETE FROM edges WHERE caller_id IN (SELECT id FROM symbols WHERE path=?)", (rel,))
            cur.execute("DELETE FROM symbols WHERE path=?", (rel,))
            cur.execute("DELETE FROM edges WHERE caller_id IS NULL", ())
            cur.execute("DELETE FROM files_state WHERE path=?", (rel,))
    con.commit()
    n_sym = cur.execute("SELECT count(*) FROM symbols").fetchone()[0]
    n_edges = cur.execute("SELECT count(*) FROM edges").fetchone()[0]
    n_chunks = cur.execute("SELECT count(*) FROM chunks").fetchone()[0]
    print(json.dumps({"repo": str(repo), "changed": len(changed), "removed": len(removed),
                      "symbols": n_sym, "edges": n_edges, "chunks": n_chunks,
                      "db": str(repo / DB_NAME)}))


def _edge_query(con, sql, params):
    return con.execute(sql, params).fetchall()


def cmd_who_calls(args):
    con = open_db(Path(args.repo or os.getcwd()).resolve())
    rows = _edge_query(con, """
        SELECT s.path, s.name, s.line, e.src_line, e.caller_id IS NOT NULL
        FROM edges e LEFT JOIN symbols s ON s.id = e.caller_id
        WHERE e.callee_name = ? AND e.kind IN ('call', 'references')
        ORDER BY s.path, e.src_line""", (args.name,))
    out = [{"path": r[0] or "(module-scope)", "symbol": r[1], "line": r[2],
            "call_line": r[3], "resolved": bool(r[4])} for r in rows]
    print(json.dumps(out if args.json else out, ensure_ascii=False, indent=None if args.json else 2))


def cmd_what_calls(args):
    con = open_db(Path(args.repo or os.getcwd()).resolve())
    rows = _edge_query(con, """
        SELECT DISTINCT e.callee_name, count(*) c
        FROM edges e WHERE e.caller_id IN (
          SELECT id FROM symbols WHERE name = ?)
          AND e.kind = 'call'
        GROUP BY e.callee_name ORDER BY c DESC""", (args.name,))
    out = [{"callee": r[0], "calls": r[1]} for r in rows]
    print(json.dumps(out, ensure_ascii=False, indent=None if args.json else 2))


def cmd_where_defined(args):
    con = open_db(Path(args.repo or os.getcwd()).resolve())
    rows = _edge_query(con, "SELECT name,kind,path,line,lang FROM symbols WHERE name=? ORDER BY path,line", (args.name,))
    out = [{"name": r[0], "kind": r[1], "path": r[2], "line": r[3], "lang": r[4]} for r in rows]
    print(json.dumps(out, ensure_ascii=False, indent=None if args.json else 2))


def cmd_impact(args):
    con = open_db(Path(args.repo or os.getcwd()).resolve())
    start = args.target
    seen: dict[str, dict] = {}
    frontier = [(start, 0)]
    while frontier and len(seen) < 200:
        name, depth = frontier.pop(0)
        if name in seen:
            continue
        seen[name] = {"depth": depth}
        if depth >= (args.depth or 3):
            continue
        for (p, s, l) in _edge_query(con, """
            SELECT s.path, s.name, s.line FROM edges e
            JOIN symbols s ON s.id = e.caller_id
            WHERE e.callee_name=? AND e.kind='call'""", (name,)):
            frontier.append((s, depth + 1))
    out = [{"caller": k, "depth": v["depth"]} for k, v in seen.items() if k != start]
    print(json.dumps({"target": start, "affected": out}, ensure_ascii=False, indent=None if args.json else 2))


def _glob_ok(rel: str, globs: list[str]) -> bool:
    if not globs:
        return True
    result = False
    for g in globs:
        neg = g.startswith("!")
        pat = g[1:] if neg else g
        ok = fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(rel, f"**/{pat}" if not pat.startswith("**/") else pat)
        if ok:
            result = not neg
    return result


def cmd_query(args):
    con = open_db(Path(args.repo or os.getcwd()).resolve())
    rows = con.execute("""
        SELECT c.path, c.heading, snippet(chunks_fts, 0, '', '', '…', 12), bm25(chunks_fts) AS score
        FROM chunks_fts c JOIN chunks ON chunks.id = c.rowid
        WHERE chunks_fts MATCH ?
        ORDER BY score LIMIT ?""", (args.q, args.limit)).fetchall()
    out = []
    for (path, heading, snip, score) in rows:
        if _glob_ok(path, args.g or []):
            out.append({"path": path, "heading": heading, "snippet": snip,
                        "score": round(score, 4)})
    out = rerank_hits_with_qev(args.q, out, getattr(args, "rerank", None))
    print(json.dumps(out, ensure_ascii=False, indent=None if args.json else 2))


def cmd_status(args):
    repo = Path(args.repo or os.getcwd()).resolve()
    con = open_db(repo)
    s = con.execute("SELECT count(*) FROM symbols").fetchone()[0]
    e = con.execute("SELECT count(*) FROM edges").fetchone()[0]
    c = con.execute("SELECT count(*) FROM chunks").fetchone()[0]
    f = con.execute("SELECT count(*) FROM files_state").fetchone()[0]
    db_path = repo / DB_NAME
    print(json.dumps({"repo": str(repo), "symbols": s, "edges": e, "chunks": c,
                      "files": f, "db_size": db_path.stat().st_size if db_path.exists() else 0},
                     indent=None if args.json else 2))


# --- MCP stdio server -------------------------------------------------------
def mcp_serve():
    con = open_db(Path(os.getcwd()).resolve())

    TOOLS = [
        {"name": "jeox_who_calls", "description": "Who calls the named symbol (code graph)", "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
        {"name": "jeox_what_calls", "description": "What the named symbol calls out to", "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
        {"name": "jeox_where_defined", "description": "Where a symbol is defined (path + line)", "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
        {"name": "jeox_impact", "description": "Transitive callers of a symbol (impact radius)", "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
        {"name": "jeox_search", "description": "BM25 hybrid-lite search across repo docs/code with optional scope globs", "inputSchema": {"type": "object", "properties": {"q": {"type": "string"}, "globs": {"type": "array", "items": {"type": "string"}}, "limit": {"type": "integer", "default": 5}}, "required": ["q"]}},
    ]

    def call_tool(name, a):
        if name == "jeox_who_calls":
            rows = _edge_query(con, "SELECT s.path,s.name,s.line,e.src_line FROM edges e LEFT JOIN symbols s ON s.id=e.caller_id WHERE e.callee_name=? AND e.kind IN ('call', 'references')", (a["name"],))
            return [{"path": r[0] or "(module-scope)", "symbol": r[1], "call_line": r[3]} for r in rows]
        if name == "jeox_what_calls":
            rows = _edge_query(con, "SELECT DISTINCT e.callee_name FROM edges e JOIN symbols s ON s.id=e.caller_id WHERE s.name=? AND e.kind='call'", (a["name"],))
            return [r[0] for r in rows]
        if name == "jeox_where_defined":
            rows = _edge_query(con, "SELECT name,kind,path,line FROM symbols WHERE name=?", (a["name"],))
            return [{"name": r[0], "kind": r[1], "path": r[2], "line": r[3]} for r in rows]
        if name == "jeox_impact":
            start = a["name"]
            seen, frontier = set(), [start]
            for _ in range(3):
                nxt = []
                for n in frontier:
                    if n in seen:
                        continue
                    seen.add(n)
                    nxt += [r[0] for r in _edge_query(con, "SELECT DISTINCT s.name FROM edges e JOIN symbols s ON s.id=e.caller_id WHERE e.callee_name=? AND e.kind='call'", (n,))]
                frontier = [x for x in nxt if x not in seen]
            return sorted(seen - {start})
        if name == "jeox_search":
            globs = a.get("globs", [])
            rows = con.execute("""SELECT c.path,c.heading,snippet(chunks_fts,0,'','','…',10) FROM chunks_fts c WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT ?""",
                               (a["q"], a.get("limit", 5))).fetchall()
            return [{"path": p, "heading": h, "snippet": s} for (p, h, s) in rows if _glob_ok(p, globs)]
        raise ValueError(f"unknown tool {name}")

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            mid = req.get("id")
            method = req.get("method", "")
            if method == "initialize":
                resp = {"jsonrpc": "2.0", "id": mid, "result": {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "jeox", "version": "0.1.0"}}}
            elif method == "tools/list":
                resp = {"jsonrpc": "2.0", "id": mid, "result": {"tools": TOOLS}}
            elif method == "tools/call":
                p = req.get("params", {})
                result = call_tool(p.get("name", ""), p.get("arguments", {}))
                resp = {"jsonrpc": "2.0", "id": mid, "result": {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]}}
            elif method.startswith("notifications/"):
                continue
            else:
                resp = {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": "method not found"}}
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()
        except BrokenPipeError:
            return
        except Exception as exc:  # noqa: BLE001
            sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32603, "message": str(exc)}}) + "\n")
            sys.stdout.flush()


def main():
    p = argparse.ArgumentParser(prog="jeox", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("build"); sp.add_argument("--repo"); sp.add_argument("--wiki-root", dest="wiki_root"); sp.add_argument("--full", action="store_true"); sp.add_argument("--json", action="store_true", help="build output is always JSON; flag accepted for symmetry"); sp.set_defaults(fn=cmd_build)
    for name, fn in [("who-calls", cmd_who_calls), ("what-calls", cmd_what_calls), ("where-defined", cmd_where_defined), ("impact", cmd_impact)]:
        sp = sub.add_parser(name); sp.add_argument("name" if name != "impact" else "target"); sp.add_argument("--repo"); sp.add_argument("--json", action="store_true"); sp.add_argument("--depth", type=int, default=3); sp.set_defaults(fn=fn)
    sp = sub.add_parser("query"); sp.add_argument("q"); sp.add_argument("-g", action="append", dest="g"); sp.add_argument("--limit", type=int, default=10); sp.add_argument("--repo"); sp.add_argument("--rerank", action="store_true", default=None); sp.add_argument("--no-rerank", action="store_false", dest="rerank"); sp.add_argument("--json", action="store_true"); sp.set_defaults(fn=cmd_query)
    sp = sub.add_parser("status"); sp.add_argument("--repo"); sp.add_argument("--json", action="store_true"); sp.set_defaults(fn=cmd_status)
    sub.add_parser("mcp")
    args = p.parse_args()
    if args.cmd == "mcp":
        mcp_serve()
    else:
        args.fn(args)


if __name__ == "__main__":
    main()
