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


def cmd_build(args):
    repo = Path(args.repo or os.getcwd()).resolve()
    con = open_db(repo)
    state = dict(con.execute("SELECT path, sha256 FROM files_state"))
    changed, removed = [], []
    seen = set()
    for path in iter_files(repo):
        rel = str(path.relative_to(repo))
        seen.add(rel)
        st = path.stat()
        with open(path, "rb") as fh:
            raw = fh.read()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        sha = hashlib.sha256(raw).hexdigest()
        if state.get(rel) == sha:
            continue
        changed.append((rel, path, st, sha, text))
    for rel in state:
        if rel not in seen:
            removed.append(rel)

    cur = con.cursor()
    for rel, path, st, sha, text in changed:
        lang = CODE_EXT.get(path.suffix) or MD_EXT.get(path.suffix)
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
        cur.execute("DELETE FROM chunks WHERE path=?", (rel,))
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
        WHERE e.callee_name = ? AND e.kind = 'call'
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
            rows = _edge_query(con, "SELECT s.path,s.name,s.line,e.src_line FROM edges e LEFT JOIN symbols s ON s.id=e.caller_id WHERE e.callee_name=? AND e.kind='call'", (a["name"],))
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
    sp = sub.add_parser("build"); sp.add_argument("--repo"); sp.add_argument("--full", action="store_true"); sp.add_argument("--json", action="store_true", help="build output is always JSON; flag accepted for symmetry"); sp.set_defaults(fn=cmd_build)
    for name, fn in [("who-calls", cmd_who_calls), ("what-calls", cmd_what_calls), ("where-defined", cmd_where_defined), ("impact", cmd_impact)]:
        sp = sub.add_parser(name); sp.add_argument("name" if name != "impact" else "target"); sp.add_argument("--repo"); sp.add_argument("--json", action="store_true"); sp.add_argument("--depth", type=int, default=3); sp.set_defaults(fn=fn)
    sp = sub.add_parser("query"); sp.add_argument("q"); sp.add_argument("-g", action="append", dest="g"); sp.add_argument("--limit", type=int, default=10); sp.add_argument("--repo"); sp.add_argument("--json", action="store_true"); sp.set_defaults(fn=cmd_query)
    sp = sub.add_parser("status"); sp.add_argument("--repo"); sp.add_argument("--json", action="store_true"); sp.set_defaults(fn=cmd_status)
    sub.add_parser("mcp")
    args = p.parse_args()
    if args.cmd == "mcp":
        mcp_serve()
    else:
        args.fn(args)


if __name__ == "__main__":
    main()
