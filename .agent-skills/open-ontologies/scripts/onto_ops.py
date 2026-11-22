#!/usr/bin/env python3
"""Open-ontologies CLI helper for save, update, delete, search, and store init.

Bridges file-backed RDF/Turtle ontologies (e.g. knowledge/ontology/*.ttl) and
the ~/.open-ontologies store/CLI (`open-ontologies --no-connect ...`) so
save, update, delete, search, and SPARQL queries work reliably after install.
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
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PREFIXES: dict[str, str] = {
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "owl": "http://www.w3.org/2002/07/owl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "skos": "http://www.w3.org/2004/02/skos/core#",
    "sh": "http://www.w3.org/ns/shacl#",
    "jb": "https://joseonbirok.dev/ontology#",
}

PREFIX_RE = re.compile(r"^\s*(?:@prefix|PREFIX)\s+([A-Za-z0-9_-]*):\s*<([^>]+)>\s*\.?\s*$")
NT_LINE_RE = re.compile(r'^\s*(<[^>]+>|_:[A-Za-z0-9_.-]+)\s+(<[^>]+>)\s+(.+?)\s+\.\s*$')
RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
XSD_STRING = "http://www.w3.org/2001/XMLSchema#string"


class OntoOpError(RuntimeError):
    """Raised on invalid ontology input, validation failure, or missing binary."""


def resolve_oo_bin() -> str | None:
    env_bin = os.environ.get("OPEN_ONTOLOGIES_BIN", "").strip()
    if env_bin:
        if env_bin.lower() == "none":
            return None
        p = Path(env_bin).expanduser()
        if p.is_file():
            return str(p)
    local = Path.home() / ".local" / "bin" / "open-ontologies"
    if local.is_file():
        return str(local)
    return shutil.which("open-ontologies")


def binary_has_embeddings(oo_bin: str | None) -> bool:
    if not oo_bin:
        return False
    path = Path(oo_bin)
    if not path.is_file():
        return False
    try:
        data = path.read_bytes()
    except OSError:
        return False
    # Binaries compiled without `--features embeddings` embed this literal diagnostic.
    return b"Compiled without embeddings feature" not in data


def _extract_prefixes(text: str) -> dict[str, str]:
    prefixes: dict[str, str] = {}
    for line in text.splitlines():
        m = PREFIX_RE.match(line)
        if m:
            prefixes[m.group(1)] = m.group(2)
    return prefixes


def _strip_prefix_lines(text: str) -> str:
    kept: list[str] = []
    for line in text.splitlines():
        if PREFIX_RE.match(line):
            continue
        kept.append(line)
    return "\n".join(kept).strip()


def _expand_term(term: str, prefixes: dict[str, str], *, is_object: bool = False) -> str:
    raw = term.strip()
    if not raw:
        raise OntoOpError("Empty RDF term")
    if raw == "a" and not is_object:
        return f"<{RDF_TYPE}>"
    if raw.startswith("<") and raw.endswith(">"):
        return raw
    if raw.startswith("_:"):
        return raw
    if raw.startswith('"') or raw.startswith("'"):
        return raw
    if is_object and raw in ("true", "false"):
        return f'"{raw}"^^<http://www.w3.org/2001/XMLSchema#boolean>'
    if is_object and re.fullmatch(r"-?\d+", raw):
        return f'"{raw}"^^<http://www.w3.org/2001/XMLSchema#integer>'
    if is_object and re.fullmatch(r"-?\d+\.\d+", raw):
        return f'"{raw}"^^<http://www.w3.org/2001/XMLSchema#decimal>'
    if ":" in raw and "://" not in raw:
        pfx, local = raw.split(":", 1)
        if pfx in prefixes:
            return f"<{prefixes[pfx]}{local}>"
    if is_object:
        escaped = raw.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
        return f'"{escaped}"'
    if "://" in raw:
        return f"<{raw}>"
    raise OntoOpError(f"Unrecognized RDF term or unknown prefix in {term!r}")


def _compact_iri(iri_token: str, prefixes: dict[str, str]) -> str:
    if iri_token == f"<{RDF_TYPE}>":
        return "a"
    if not (iri_token.startswith("<") and iri_token.endswith(">")):
        return iri_token
    iri = iri_token[1:-1]
    best_pfx = ""
    best_ns = ""
    for pfx, ns in prefixes.items():
        if iri.startswith(ns) and len(ns) > len(best_ns):
            best_pfx = pfx
            best_ns = ns
    if best_ns:
        local = iri[len(best_ns):]
        if local and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.-]*", local):
            return f"{best_pfx}:{local}"
    return iri_token


def _compact_object(obj_token: str, prefixes: dict[str, str]) -> str:
    if obj_token.startswith("<") and obj_token.endswith(">"):
        return _compact_iri(obj_token, prefixes)
    if obj_token.endswith(f"^^<{XSD_STRING}>"):
        return obj_token[: -(len(XSD_STRING) + 4)]
    if "^^<http://www.w3.org/2001/XMLSchema#" in obj_token:
        lit, dt = obj_token.rsplit("^^", 1)
        return f"{lit}^^{_compact_iri(dt, prefixes)}"
    return obj_token


def _run_oo(oo_bin: str, args: list[str], stdin_text: str | None = None, timeout: int = 45) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [oo_bin, "--no-connect", *args],
        input=stdin_text,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def _validate_ttl(oo_bin: str | None, ttl_path: Path, shacl_path: Path | None = None) -> dict[str, Any]:
    if not oo_bin:
        return {"validated": False, "reason": "open-ontologies binary missing"}
    proc = _run_oo(oo_bin, ["validate", str(ttl_path)])
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout).strip()
        raise OntoOpError(f"Turtle validation failed: {detail}")
    if shacl_path:
        if not shacl_path.is_file():
            raise OntoOpError(f"SHACL shapes file not found: {shacl_path}")
        sh_proc = _run_oo(oo_bin, ["shacl", str(ttl_path), str(shacl_path)])
        if sh_proc.returncode != 0:
            raise OntoOpError(f"SHACL validation failed: {(sh_proc.stderr or sh_proc.stdout).strip()}")
        try:
            parsed = json.loads(sh_proc.stdout)
            if isinstance(parsed, dict) and parsed.get("conforms") is False:
                raise OntoOpError(f"SHACL non-conformant: {sh_proc.stdout.strip()}")
        except json.JSONDecodeError:
            pass
    return {"validated": True, "shacl": bool(shacl_path)}


def _to_ntriples(oo_bin: str | None, rdf_path: Path) -> list[tuple[str, str, str]]:
    if oo_bin:
        with tempfile.TemporaryDirectory() as td:
            out_nt = Path(td) / "graph.nt"
            proc = _run_oo(oo_bin, ["convert", str(rdf_path), "--to", "nt", "--output", str(out_nt)])
            if proc.returncode == 0 and out_nt.is_file():
                triples: list[tuple[str, str, str]] = []
                for line in out_nt.read_text(encoding="utf-8").splitlines():
                    m = NT_LINE_RE.match(line)
                    if m:
                        triples.append((m.group(1), m.group(2), m.group(3)))
                return triples

    # Fallback parser for simple Turtle/N-Triples when binary is absent (e.g. unit stubs)
    text = rdf_path.read_text(encoding="utf-8")
    prefixes = dict(DEFAULT_PREFIXES)
    prefixes.update(_extract_prefixes(text))
    body = _strip_prefix_lines(text)
    triples = []
    # Split statements terminating on `.` outside quotes/IRIs
    statements = re.split(r"(?<=\s)\.\s*(?:\n|$)", body)
    for stmt in statements:
        stmt = stmt.strip()
        if not stmt or stmt.startswith("#"):
            continue
        m_nt = NT_LINE_RE.match(stmt + " .")
        if m_nt:
            triples.append((m_nt.group(1), m_nt.group(2), m_nt.group(3)))
            continue
        parts = [p.strip() for p in re.split(r"\s*;\s*(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)", stmt) if p.strip()]
        if not parts:
            continue
        first_tokens = re.split(r"\s+", parts[0], maxsplit=2)
        if len(first_tokens) < 3:
            continue
        subj = _expand_term(first_tokens[0], prefixes)
        pred_obj_list = [(first_tokens[1], first_tokens[2])]
        for cont in parts[1:]:
            ctok = re.split(r"\s+", cont, maxsplit=1)
            if len(ctok) == 2:
                pred_obj_list.append((ctok[0], ctok[1]))
        for pred_raw, objs_raw in pred_obj_list:
            pred = _expand_term(pred_raw, prefixes)
            for obj_raw in re.split(r"\s*,\s*(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)", objs_raw):
                obj_raw = obj_raw.strip().rstrip(".")
                if obj_raw:
                    triples.append((subj, pred, _expand_term(obj_raw, prefixes, is_object=True)))
    return triples


def _serialize_turtle(triples: list[tuple[str, str, str]], prefixes: dict[str, str]) -> str:
    used_prefixes: dict[str, str] = {}
    for pfx, ns in prefixes.items():
        for s, p, o in triples:
            for tok in (s, p, o):
                if tok.startswith("<") and tok[1:-1].startswith(ns):
                    used_prefixes[pfx] = ns
                    break
            if pfx in used_prefixes:
                break
    for essential in ("rdf", "rdfs", "owl", "xsd"):
        if essential in prefixes and essential not in used_prefixes:
            used_prefixes[essential] = prefixes[essential]

    lines: list[str] = []
    for pfx in sorted(used_prefixes):
        lines.append(f"@prefix {pfx}: <{used_prefixes[pfx]}> .")
    if lines:
        lines.append("")

    grouped: dict[str, list[tuple[str, str]]] = defaultdict(list)
    subject_order: list[str] = []
    seen_triples: set[tuple[str, str, str]] = set()
    for s, p, o in triples:
        if (s, p, o) in seen_triples:
            continue
        seen_triples.add((s, p, o))
        if s not in grouped:
            subject_order.append(s)
        grouped[s].append((p, o))

    for subj in subject_order:
        s_str = _compact_iri(subj, used_prefixes)
        by_pred: dict[str, list[str]] = defaultdict(list)
        pred_order: list[str] = []
        for p, o in grouped[subj]:
            if p not in by_pred:
                pred_order.append(p)
            by_pred[p].append(_compact_object(o, used_prefixes))
        # Put rdf:type first when present
        if f"<{RDF_TYPE}>" in pred_order:
            pred_order.remove(f"<{RDF_TYPE}>")
            pred_order.insert(0, f"<{RDF_TYPE}>")
        blocks: list[str] = []
        for idx, pred in enumerate(pred_order):
            p_str = _compact_iri(pred, used_prefixes)
            o_str = " , ".join(by_pred[pred])
            prefix = f"{s_str} " if idx == 0 else "    "
            suffix = " ." if idx == len(pred_order) - 1 else " ;"
            blocks.append(f"{prefix}{p_str} {o_str}{suffix}")
        lines.extend(blocks)
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _atomic_write_validated(
    target: Path,
    new_text: str,
    oo_bin: str | None,
    shacl_path: Path | None = None,
) -> dict[str, Any]:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".ttl", dir=str(target.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(new_text)
        val_res = _validate_ttl(oo_bin, tmp_path, shacl_path)
        os.replace(tmp_path, target)
        return val_res
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink()
        raise


def _parse_prefix_args(items: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for item in items:
        if "=" not in item:
            raise OntoOpError(f"Expected --prefix name=iri (got {item!r})")
        name, iri = item.split("=", 1)
        out[name.strip().rstrip(":")] = iri.strip().strip("<>")
    return out


def _snapshot_file(target: Path, label: str) -> str | None:
    snap_dir = Path.home() / ".open-ontologies" / "snapshots"
    snap_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe_label = re.sub(r"[^A-Za-z0-9_.-]+", "-", label).strip("-") or "snapshot"
    dest = snap_dir / f"{stamp}-{safe_label}-{target.name}"
    shutil.copy2(target, dest)
    return str(dest)


def op_save(
    file_path: Path,
    *,
    subject: str | None = None,
    predicate: str | None = None,
    obj: str | None = None,
    turtle: str | None = None,
    turtle_file: Path | None = None,
    extra_prefixes: dict[str, str] | None = None,
    shacl_path: Path | None = None,
    snapshot_label: str | None = None,
) -> dict[str, Any]:
    oo_bin = resolve_oo_bin()
    existing_text = file_path.read_text(encoding="utf-8") if file_path.is_file() else ""
    prefixes = dict(DEFAULT_PREFIXES)
    prefixes.update(_extract_prefixes(existing_text))
    if extra_prefixes:
        prefixes.update(extra_prefixes)

    if turtle_file:
        turtle = turtle_file.read_text(encoding="utf-8")

    existing_triples = _to_ntriples(oo_bin, file_path) if file_path.is_file() else []
    added_triples: list[tuple[str, str, str]] = []

    if turtle is not None:
        prefixes.update(_extract_prefixes(turtle))
        snippet_body = _strip_prefix_lines(turtle)
        with tempfile.TemporaryDirectory() as td:
            snippet_ttl = Path(td) / "snippet.ttl"
            header = "\n".join(f"@prefix {k}: <{v}> ." for k, v in sorted(prefixes.items()))
            snippet_ttl.write_text(f"{header}\n\n{snippet_body}\n", encoding="utf-8")
            _validate_ttl(oo_bin, snippet_ttl)
            added_triples = _to_ntriples(oo_bin, snippet_ttl)
    elif subject and predicate and obj is not None:
        s_iri = _expand_term(subject, prefixes)
        p_iri = _expand_term(predicate, prefixes)
        o_term = _expand_term(obj, prefixes, is_object=True)
        added_triples = [(s_iri, p_iri, o_term)]
    else:
        raise OntoOpError("Provide --turtle/--turtle-file OR --subject, --predicate, and --object")

    merged = list(existing_triples)
    existing_set = set(existing_triples)
    new_count = 0
    for tr in added_triples:
        if tr not in existing_set:
            merged.append(tr)
            existing_set.add(tr)
            new_count += 1

    new_text = _serialize_turtle(merged, prefixes)
    val_res = _atomic_write_validated(file_path, new_text, oo_bin, shacl_path)
    snap = _snapshot_file(file_path, snapshot_label) if snapshot_label else None
    return {
        "status": "saved",
        "file": str(file_path),
        "added_triples": new_count,
        "total_triples": len(merged),
        "validation": val_res,
        "snapshot": snap,
    }


def op_update(
    file_path: Path,
    *,
    subject: str,
    predicate: str,
    obj: str,
    old_obj: str | None = None,
    extra_prefixes: dict[str, str] | None = None,
    shacl_path: Path | None = None,
) -> dict[str, Any]:
    if not file_path.is_file():
        raise OntoOpError(f"Ontology file not found: {file_path}")
    oo_bin = resolve_oo_bin()
    existing_text = file_path.read_text(encoding="utf-8")
    prefixes = dict(DEFAULT_PREFIXES)
    prefixes.update(_extract_prefixes(existing_text))
    if extra_prefixes:
        prefixes.update(extra_prefixes)

    s_iri = _expand_term(subject, prefixes)
    p_iri = _expand_term(predicate, prefixes)
    new_o_term = _expand_term(obj, prefixes, is_object=True)
    old_o_term = _expand_term(old_obj, prefixes, is_object=True) if old_obj is not None else None

    triples = _to_ntriples(oo_bin, file_path)
    updated: list[tuple[str, str, str]] = []
    replaced_count = 0
    inserted = False

    for s, p, o in triples:
        if s == s_iri and p == p_iri and (old_o_term is None or o == old_o_term):
            replaced_count += 1
            if not inserted:
                updated.append((s_iri, p_iri, new_o_term))
                inserted = True
        else:
            updated.append((s, p, o))

    if replaced_count == 0:
        raise OntoOpError(f"No matching triple found for {subject} {predicate}" + (f" {old_obj}" if old_obj else ""))

    new_text = _serialize_turtle(updated, prefixes)
    val_res = _atomic_write_validated(file_path, new_text, oo_bin, shacl_path)
    return {
        "status": "updated",
        "file": str(file_path),
        "replaced_triples": replaced_count,
        "total_triples": len(updated),
        "validation": val_res,
    }


def op_delete(
    file_path: Path,
    *,
    subject: str | None = None,
    entity: str | None = None,
    predicate: str | None = None,
    obj: str | None = None,
    extra_prefixes: dict[str, str] | None = None,
    shacl_path: Path | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    if not file_path.is_file():
        raise OntoOpError(f"Ontology file not found: {file_path}")
    oo_bin = resolve_oo_bin()
    existing_text = file_path.read_text(encoding="utf-8")
    prefixes = dict(DEFAULT_PREFIXES)
    prefixes.update(_extract_prefixes(existing_text))
    if extra_prefixes:
        prefixes.update(extra_prefixes)

    target_subj = entity or subject
    if not target_subj and not predicate and obj is None:
        raise OntoOpError("Provide --entity or at least one of --subject / --predicate / --object")

    s_match = _expand_term(target_subj, prefixes) if target_subj else None
    p_match = _expand_term(predicate, prefixes) if predicate else None
    o_match = _expand_term(obj, prefixes, is_object=True) if obj is not None else None

    triples = _to_ntriples(oo_bin, file_path)
    kept: list[tuple[str, str, str]] = []
    removed: list[tuple[str, str, str]] = []

    for s, p, o in triples:
        if entity:
            hit = (s == s_match) or (o == s_match)
        else:
            hit = (
                (s_match is None or s == s_match)
                and (p_match is None or p == p_match)
                and (o_match is None or o == o_match)
            )
        if hit:
            removed.append((s, p, o))
        else:
            kept.append((s, p, o))

    if dry_run:
        return {
            "status": "dry_run",
            "action": "delete",
            "file": str(file_path),
            "would_remove": len(removed),
            "remaining_triples": len(kept),
        }

    if not removed:
        return {
            "status": "unchanged",
            "file": str(file_path),
            "removed_triples": 0,
            "total_triples": len(triples),
        }

    new_text = _serialize_turtle(kept, prefixes)
    val_res = _atomic_write_validated(file_path, new_text, oo_bin, shacl_path)
    return {
        "status": "deleted",
        "file": str(file_path),
        "removed_triples": len(removed),
        "total_triples": len(kept),
        "validation": val_res,
    }


def _discover_ontology_files(file_arg: Path | None, dir_arg: Path | None) -> list[Path]:
    if file_arg:
        if not file_arg.is_file():
            raise OntoOpError(f"Ontology file not found: {file_arg}")
        return [file_arg]
    search_dirs: list[Path] = []
    if dir_arg:
        search_dirs.append(dir_arg)
    else:
        for candidate in (Path.cwd() / "knowledge" / "ontology", Path.cwd()):
            if candidate.is_dir() and candidate not in search_dirs:
                search_dirs.append(candidate)
        cfg_file = Path.home() / ".open-ontologies" / "config.toml"
        if cfg_file.is_file():
            m = re.search(r"ontology_dirs\s*=\s*\[([^\]]*)\]", cfg_file.read_text(encoding="utf-8"))
            if m:
                for raw in re.findall(r'"([^"]+)"', m.group(1)):
                    p = Path(raw).expanduser()
                    if p.is_dir() and p not in search_dirs:
                        search_dirs.append(p)

    files: list[Path] = []
    seen: set[Path] = set()
    for d in search_dirs:
        for ext in ("*.ttl", "*.nt", "*.owl", "*.rdf"):
            for p in sorted(d.rglob(ext)):
                rp = p.resolve()
                if rp not in seen:
                    seen.add(rp)
                    files.append(p)
    return files


def op_search(
    query: str | None,
    *,
    file_path: Path | None = None,
    dir_path: Path | None = None,
    sparql: str | None = None,
    limit: int = 15,
) -> dict[str, Any]:
    oo_bin = resolve_oo_bin()
    files = _discover_ontology_files(file_path, dir_path)
    if not files:
        raise OntoOpError("No ontology files found; specify --file or --dir")

    if sparql:
        if not oo_bin:
            raise OntoOpError("SPARQL search requires open-ontologies binary")
        batch_lines = ["clear"] + [f"load {f}" for f in files] + [f"query {sparql}"]
        proc = _run_oo(oo_bin, ["--pretty", "batch", "--bail", "-"], stdin_text="\n".join(batch_lines) + "\n")
        if proc.returncode != 0:
            raise OntoOpError(f"SPARQL query failed: {(proc.stderr or proc.stdout).strip()}")
        return {
            "status": "ok",
            "mode": "sparql",
            "files": [str(f) for f in files],
            "raw_output": proc.stdout.strip(),
        }

    if not query or not query.strip():
        raise OntoOpError("Provide a search query or --sparql")

    q_lower = query.strip().lower()
    tokens = [tok for tok in re.split(r"\s+", q_lower) if tok]
    hits: list[dict[str, Any]] = []

    for f in files:
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        prefixes = dict(DEFAULT_PREFIXES)
        prefixes.update(_extract_prefixes(text))
        triples = _to_ntriples(oo_bin, f)
        labels: dict[str, str] = {}
        for s, p, o in triples:
            if p.endswith("#label>") or p.endswith("#prefLabel>") or p.endswith("#title>"):
                labels[s] = o.strip('"').split('"@')[0]

        for s, p, o in triples:
            s_c = _compact_iri(s, prefixes)
            p_c = _compact_iri(p, prefixes)
            o_c = _compact_object(o, prefixes)
            hay = f"{s_c} {p_c} {o_c} {labels.get(s, '')}".lower()
            score = 0.0
            if q_lower in hay:
                score += 6.0
            if q_lower in s_c.lower() or q_lower in labels.get(s, "").lower():
                score += 4.0
            matched = 0
            for tok in tokens:
                if tok in hay:
                    matched += 1
                    score += 1.5
                    if tok in s_c.lower() or tok in labels.get(s, "").lower():
                        score += 2.0
            if tokens and matched == len(tokens) and len(tokens) > 1:
                score += 3.0
            if score > 0:
                hits.append({
                    "file": str(f),
                    "subject": s_c,
                    "predicate": p_c,
                    "object": o_c,
                    "label": labels.get(s, ""),
                    "score": round(score, 2),
                })

    hits.sort(key=lambda item: (-float(item["score"]), item["file"], item["subject"], item["predicate"]))
    ranked = hits[: max(1, limit)]
    return {
        "status": "ok",
        "mode": "keyword",
        "query": query,
        "files_searched": len(files),
        "embeddings_binary": binary_has_embeddings(oo_bin),
        "count": len(ranked),
        "hits": ranked,
    }


def op_init_store(ontology_dirs: list[Path] | None = None) -> dict[str, Any]:
    oo_bin = resolve_oo_bin()
    home_oo = Path.home() / ".open-ontologies"
    home_oo.mkdir(parents=True, exist_ok=True)
    db_path = home_oo / "open-ontologies.db"
    cfg_path = home_oo / "config.toml"

    init_ran = False
    init_ok = True
    if oo_bin and (not db_path.is_file() or not cfg_path.is_file()):
        try:
            proc = subprocess.run([oo_bin, "init"], capture_output=True, text=True, timeout=30)
            init_ran = True
            init_ok = proc.returncode == 0
        except Exception:
            init_ok = False

    dirs_to_register = [str(d.resolve()) for d in (ontology_dirs or []) if d.is_dir()]
    if not cfg_path.is_file():
        lines = [
            "[general]",
            f'data_dir = "{home_oo}"',
            f"ontology_dirs = {json.dumps(dirs_to_register)}",
            "",
            "[storage]",
            'mode = "persistent"',
            "",
        ]
        cfg_path.write_text("\n".join(lines), encoding="utf-8")
    elif dirs_to_register:
        text = cfg_path.read_text(encoding="utf-8")
        m = re.search(r"ontology_dirs\s*=\s*\[([^\]]*)\]", text)
        if m:
            existing = re.findall(r'"([^"]+)"', m.group(1))
            merged = list(existing)
            for d in dirs_to_register:
                if d not in merged:
                    merged.append(d)
            if merged != existing:
                text = text[: m.start()] + f"ontology_dirs = {json.dumps(merged)}" + text[m.end() :]
                cfg_path.write_text(text, encoding="utf-8")
        else:
            text = text.rstrip() + f"\nontology_dirs = {json.dumps(dirs_to_register)}\n"
            cfg_path.write_text(text, encoding="utf-8")

    return {
        "status": "ok" if init_ok else "partial",
        "binary": oo_bin,
        "embeddings": binary_has_embeddings(oo_bin),
        "init_ran": init_ran,
        "db_exists": db_path.is_file(),
        "config_path": str(cfg_path),
        "registered_dirs": dirs_to_register,
        "capabilities": ["save", "update", "delete", "search", "sparql", "validate", "shacl", "init-store"],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Open-ontologies CRUD, search, and store operator")
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init-store", help="Initialize ~/.open-ontologies store and register ontology dirs")
    p_init.add_argument("--dir", action="append", default=[], help="Ontology directory to register")
    p_init.add_argument("--json", action="store_true")

    p_save = sub.add_parser("save", help="Save/merge RDF triples into a Turtle ontology and validate")
    p_save.add_argument("--file", required=True, type=Path)
    p_save.add_argument("--subject")
    p_save.add_argument("--predicate")
    p_save.add_argument("--object", dest="obj")
    p_save.add_argument("--turtle")
    p_save.add_argument("--turtle-file", type=Path)
    p_save.add_argument("--prefix", action="append", default=[])
    p_save.add_argument("--shacl", type=Path)
    p_save.add_argument("--snapshot", help="Optional snapshot label in ~/.open-ontologies/snapshots")
    p_save.add_argument("--json", action="store_true")

    p_update = sub.add_parser("update", help="Update matching triple(s) in a Turtle ontology and validate")
    p_update.add_argument("--file", required=True, type=Path)
    p_update.add_argument("--subject", required=True)
    p_update.add_argument("--predicate", required=True)
    p_update.add_argument("--object", dest="obj", required=True)
    p_update.add_argument("--old-object", dest="old_obj")
    p_update.add_argument("--prefix", action="append", default=[])
    p_update.add_argument("--shacl", type=Path)
    p_update.add_argument("--json", action="store_true")

    p_del = sub.add_parser("delete", help="Delete matching triple(s) or an entity from a Turtle ontology and validate")
    p_del.add_argument("--file", required=True, type=Path)
    p_del.add_argument("--subject")
    p_del.add_argument("--entity", help="Remove all triples where entity is subject or object")
    p_del.add_argument("--predicate")
    p_del.add_argument("--object", dest="obj")
    p_del.add_argument("--prefix", action="append", default=[])
    p_del.add_argument("--shacl", type=Path)
    p_del.add_argument("--dry-run", action="store_true")
    p_del.add_argument("--json", action="store_true")

    p_search = sub.add_parser("search", help="Search ontology files by keyword or SPARQL query")
    p_search.add_argument("query", nargs="?", default=None)
    p_search.add_argument("--file", type=Path)
    p_search.add_argument("--dir", type=Path)
    p_search.add_argument("--sparql", help="Execute SPARQL SELECT/ASK/CONSTRUCT query via open-ontologies")
    p_search.add_argument("--limit", type=int, default=15)
    p_search.add_argument("--json", action="store_true")

    args = parser.parse_args(argv)
    try:
        if args.command == "init-store":
            res = op_init_store([Path(d) for d in args.dir])
        elif args.command == "save":
            res = op_save(
                args.file,
                subject=args.subject,
                predicate=args.predicate,
                obj=args.obj,
                turtle=args.turtle,
                turtle_file=args.turtle_file,
                extra_prefixes=_parse_prefix_args(args.prefix),
                shacl_path=args.shacl,
                snapshot_label=args.snapshot,
            )
        elif args.command == "update":
            res = op_update(
                args.file,
                subject=args.subject,
                predicate=args.predicate,
                obj=args.obj,
                old_obj=args.old_obj,
                extra_prefixes=_parse_prefix_args(args.prefix),
                shacl_path=args.shacl,
            )
        elif args.command == "delete":
            res = op_delete(
                args.file,
                subject=args.subject,
                entity=args.entity,
                predicate=args.predicate,
                obj=args.obj,
                extra_prefixes=_parse_prefix_args(args.prefix),
                shacl_path=args.shacl,
                dry_run=args.dry_run,
            )
        elif args.command == "search":
            res = op_search(
                args.query,
                file_path=args.file,
                dir_path=args.dir,
                sparql=args.sparql,
                limit=args.limit,
            )
        else:
            raise OntoOpError(f"Unsupported command: {args.command}")
    except OntoOpError as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1

    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
