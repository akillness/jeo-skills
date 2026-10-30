#!/usr/bin/env python3
"""OpenSpace prompt-time skill router.

Ranks the installed skill catalog against one user prompt with OpenSpace's
local BM25 ranker (``SkillRanker.bm25_only``: no LLM, no embeddings, no
network) and prints a short routing note in the format the calling host
expects. Because the choice is made here, before the model sees the prompt,
routing behaves the same whichever model the host is running.

Hosts call it once per prompt (``UserPromptSubmit``, ``BeforeAgent``,
``before_agent_start``, ``chat.message``) with the host's JSON event on
stdin; every host sends the text as ``prompt``. Nothing is printed when no
skill clears the gate, and every failure is silent with exit status 0, so a
broken router never blocks a prompt.

    route_prompt.py --host claude < event.json
    route_prompt.py --explain "review this diff for over-engineering"

Environment:
    OPENSPACE_HOST_SKILL_DIRS  comma- or os.pathsep-separated skill roots
                               (default: ~/.agents/skills)
    OPENSPACE_ROUTE            "off" disables routing
    OPENSPACE_ROUTE_TOP_K      maximum skills to suggest (default: 3)
    OPENSPACE_ROUTE_CACHE      index cache directory
                               (default: ~/.cache/openspace-route)
    OPENSPACE_ROUTE_DEBUG      "1" prints failures to stderr
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path

HOSTS = ("claude", "codex", "gemini", "kimi", "pi", "opencode", "text")
INDEX_VERSION = 3
BODY_CHARS = 2000  # OpenSpace's BM25 corpus uses body[:2000]
DESCRIPTION_CHARS = 150
# A query term anchors a skill when it is rare: in at most this share of the
# skills written in the term's script (or RARE_MIN skills).
RARE_SHARE = 0.05
RARE_MIN = 3
# A skill named in the prompt needs one name term no more common than this.
NAME_SHARE = 0.08
# An anchored skill must contain this share of the prompt's content terms.
COVERAGE = 0.5
# Suggestions must score at least this share of the best qualifying skill.
RELATIVE_CUT = 0.5

CJK = "\u1100-\u11ff\u3040-\u30ff\u3130-\u318f\u3400-\u9fff\uac00-\ud7a3"
CJK_TERM = re.compile(rf"[{CJK}]")
# "openspace가" is one \w+ token; split where ASCII letters/digits meet CJK.
SCRIPT_BOUNDARY = re.compile(rf"(?<=[a-z0-9])(?=[{CJK}])|(?<=[{CJK}])(?=[a-z0-9])")
HANGUL_WORD = re.compile(r"[\uac00-\ud7a3]{3,}")
# "hooks" and "hook" must meet; only plain -s plurals of words of 4+ letters.
ENGLISH_PLURAL = re.compile(r"\b[a-z]{3,}s\b")
# Korean attaches particles and endings to words ("특허를", "검색해줘"); strip one
# from both prompt and catalog so the stems meet. Longest first.
KOREAN_SUFFIXES = sorted(
    """에서 으로 에게 한테 까지 부터 처럼 보다 하고 이랑 이나 해주세요 해줘요 해줘 해서 하게 하는 하기 하면 했어 합니다
    어줘 아줘 줘 을 를 이 가 은 는 의 에 로 와 과 도 만 랑""".split(),
    key=len,
    reverse=True,
)
TOKEN_SPLIT = re.compile(r"[^\w]+")
STOPWORDS = frozenset(
    """a about above after again all also am an and any are as at be been before being below between both but by
    can could did do does doing done down during each few for from further get got had has have having he her here
    him his how i if in into is it its just let like make me more most my need no nor not now of off on once only
    or other our out over own please same she should so some such than that the their them then there these they
    this those through to too under until up us use using very want was we were what when where which while who
    whom why will with would you your yours
    그거 그냥 그래서 그리고 근데 다시 이거 저거 좀 지금 하자 해라 해요 해주세요 해줘""".split()
)
# Intent and process words: they rank but never identify a skill on their own.
GENERIC = frozenset(
    """add better build change check create describe do done explain file files fix good great help improve issue new
    problem quick run show simple tell thing things update way work write
    개선 검토 결과 기능 내용 만들 문제 방법 보여 사용 설명 설정 수정 알려 업데이트 자동화 작업 정리 진행 추가 최적화 해결 현재 확인""".split()
)


def strip_korean_suffix(match: re.Match) -> str:
    word = match.group(0)
    for suffix in KOREAN_SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 2:
            return word[: -len(suffix)]
    return word


def fold_plural(match: re.Match) -> str:
    word = match.group(0)
    return word[:-1] if not word.endswith(("ss", "us", "is", "os")) else word


def normalize(text: str) -> str:
    text = SCRIPT_BOUNDARY.sub(" ", text.lower())
    return HANGUL_WORD.sub(strip_korean_suffix, ENGLISH_PLURAL.sub(fold_plural, text))


def split_terms(normalized: str) -> list[str]:
    """OpenSpace's BM25 tokenizer (``SkillRanker._tokenize``) on already normalized text."""
    return [token for token in TOKEN_SPLIT.split(normalized) if token]


def tokens(text: str) -> list[str]:
    return split_terms(normalize(text))


def skill_roots() -> list[Path]:
    raw = os.environ.get("OPENSPACE_HOST_SKILL_DIRS", "").strip()
    items = re.split(rf"[,{re.escape(os.pathsep)}]", raw) if raw else [str(Path.home() / ".agents" / "skills")]
    roots: list[Path] = []
    for item in items:
        item = item.strip()
        if item:
            root = Path(item).expanduser()
            if root not in roots:
                roots.append(root)
    return roots


def cache_dir() -> Path:
    raw = os.environ.get("OPENSPACE_ROUTE_CACHE", "").strip()
    if raw:
        return Path(raw).expanduser()
    base = os.environ.get("XDG_CACHE_HOME", "").strip()
    return (Path(base).expanduser() if base else Path.home() / ".cache") / "openspace-route"


def skill_entry(text: str) -> dict:
    """Index fields for one SKILL.md, parsed with OpenSpace and normalized once."""
    from openspace.skill_engine.skill_utils import parse_frontmatter, strip_frontmatter

    front = parse_frontmatter(text)
    name, description = front.get("name"), front.get("description")
    if not (isinstance(name, str) and name.strip() and isinstance(description, str) and description.strip()):
        return {"name": None}
    name, description = name.strip(), " ".join(description.split())
    name_norm, description_norm = normalize(name), normalize(description)
    body = normalize(strip_frontmatter(text)[: BODY_CHARS * 2])[:BODY_CHARS]
    return {
        "name": name,
        "description": description,
        "name_norm": name_norm,
        "description_norm": description_norm,
        "body": body,
        "name_terms": sorted(set(split_terms(name_norm))),
        "meta_terms": sorted(set(split_terms(f"{name_norm} {description_norm}"))),
        "terms": sorted(set(split_terms(f"{name_norm} {description_norm} {body}"))),
        "cjk": bool(CJK_TERM.search(f"{description_norm} {body}")),
    }


def load_index(roots: list[Path]) -> list[dict]:
    """Parsed skills for ``roots``, re-reading only SKILL.md files whose mtime or size changed."""
    key = json.dumps([str(root) for root in roots])
    cache_file = cache_dir() / "index.json"
    try:
        cached = json.loads(cache_file.read_text(encoding="utf-8"))
        if cached.get("version") != INDEX_VERSION or cached.get("roots") != key:
            cached = {}
    except (OSError, ValueError):
        cached = {}
    previous = cached.get("skills", {})
    skills: dict[str, dict] = {}
    changed = False
    for root in roots:
        for path in sorted(root.glob("*/SKILL.md")):
            try:
                stat = path.stat()
            except OSError:
                continue
            entry = previous.get(str(path))
            if not entry or entry["mtime_ns"] != stat.st_mtime_ns or entry["size"] != stat.st_size:
                changed = True
                try:
                    text = path.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                entry = {"mtime_ns": stat.st_mtime_ns, "size": stat.st_size, **skill_entry(text)}
            # Unparseable skills are cached too, so they are not re-read every prompt.
            skills[str(path)] = entry
    if changed or set(previous) != set(skills):
        try:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            fd, temporary = tempfile.mkstemp(prefix=".index.", dir=cache_file.parent)
            with os.fdopen(fd, "w", encoding="utf-8") as out:
                json.dump({"version": INDEX_VERSION, "roots": key, "skills": skills}, out)
            os.replace(temporary, cache_file)
        except OSError:
            pass
    seen: set[str] = set()
    result = []
    for path, entry in skills.items():
        if entry["name"] and entry["name"] not in seen:
            seen.add(entry["name"])
            result.append({"path": path, **entry})
    return result


def rank(prompt: str, skills: list[dict], top_k: int) -> tuple[list[dict], list[dict]]:
    """Return (suggestions, explained candidates) for one prompt."""
    from openspace.utils.logging import Logger

    # OpenSpace otherwise opens a log file on the first ranker import.
    Logger.configure(log_to_console=False, log_to_file=None)
    from openspace.skill_engine.skill_ranker import SkillCandidate, SkillRanker

    query_terms = {t for t in tokens(prompt) if len(t) > 1 and t not in STOPWORDS}
    content_terms = query_terms - GENERIC
    if not content_terms or not skills:
        return [], []
    candidates = [
        SkillCandidate(
            skill_id=skill["path"],
            name=skill["name_norm"],
            description=skill["description_norm"],
            body=skill["body"],
            metadata=skill,
        )
        for skill in skills
    ]
    document_terms = {skill["path"]: set(skill["terms"]) for skill in skills}
    frequency: dict[str, int] = {}
    for terms in document_terms.values():
        for term in terms & query_terms:
            frequency[term] = frequency.get(term, 0) + 1
    # Rarity is judged among skills written in the term's script: most of the
    # catalog is English, so a common Korean word would otherwise look rare.
    population = {False: len(skills), True: sum(skill["cjk"] for skill in skills)}

    def rare(term: str, share: float = RARE_SHARE) -> bool:
        return frequency.get(term, 0) <= max(RARE_MIN, share * population[bool(CJK_TERM.search(term))])

    ranked = SkillRanker(enable_cache=False).bm25_only(" ".join(sorted(query_terms)), candidates, top_k=10)
    explained = []
    for candidate in ranked:
        if candidate.bm25_score <= 0:
            continue
        terms = document_terms[candidate.skill_id]
        name_terms = set(candidate.metadata["name_terms"])
        # The prompt names the skill: every name term present, one of them distinctive.
        named = name_terms <= query_terms and any(rare(t, NAME_SHARE) for t in name_terms)
        meta_terms = set(candidate.metadata["meta_terms"])
        # Frontmatter is the skill's trigger contract: a rare prompt term there, or a
        # name term that is merely uncommon ("react" in "react-bits"), anchors it.
        anchors = sorted(
            t for t in content_terms & meta_terms if rare(t) or (t in name_terms and rare(t, NAME_SHARE))
        )
        # Catalog frontmatter is English, so Korean skills carry their triggers in the
        # body; a body-only Korean anchor is weaker evidence and needs every term.
        body_anchors = sorted(t for t in content_terms & terms if CJK_TERM.search(t) and rare(t)) if not anchors else []
        coverage = len(content_terms & terms) / len(content_terms)
        explained.append(
            {
                "skill": candidate.metadata,
                "score": candidate.bm25_score,
                "anchors": anchors or [f"body:{t}" for t in body_anchors],
                "coverage": coverage,
                "named": named,
                "qualified": named or (bool(anchors) and coverage >= COVERAGE) or (bool(body_anchors) and coverage == 1),
            }
        )
    qualified = [item for item in explained if item["qualified"]]
    if not qualified:
        return [], explained
    best = max(item["score"] for item in qualified)
    named = [item for item in qualified if item["named"]]
    others = [item for item in qualified if not item["named"] and item["score"] >= RELATIVE_CUT * best]
    return (named + others)[:top_k], explained


def shorten(text: str, limit: int = DESCRIPTION_CHARS) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",;:.")
    return f"{cut}..."


def routing_note(suggestions: list[dict]) -> str:
    lines = ["OpenSpace skill routing: local BM25 matches for this request (chosen before the model, no LLM involved)."]
    for index, item in enumerate(suggestions, 1):
        skill = item["skill"]
        lines.append(f"{index}. {skill['name']} - {skill['path']} - {shorten(skill['description'])}")
    lines.append("If one of these fits the request, read its SKILL.md and follow it before acting; otherwise ignore this note.")
    # Gemini escapes angle brackets in hook context; keep the note plain text.
    return "\n".join(lines).replace("<", "(").replace(">", ")")


def host_output(host: str, note: str) -> str:
    if host in ("claude", "codex"):
        return json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": note}})
    if host == "gemini":
        return json.dumps({"hookSpecificOutput": {"hookEventName": "BeforeAgent", "additionalContext": note}})
    if host in ("pi", "opencode"):
        return json.dumps({"context": note})
    return note  # kimi reads plain stdout as the hook message


def prompt_from_stdin(raw: str) -> str:
    try:
        event = json.loads(raw)
    except ValueError:
        return raw
    if isinstance(event, dict) and isinstance(event.get("prompt"), str):
        return event["prompt"]
    return ""


def top_k() -> int:
    try:
        return max(1, min(5, int(os.environ.get("OPENSPACE_ROUTE_TOP_K", "3"))))
    except ValueError:
        return 3


def check() -> int:
    """Exercise the exact OpenSpace surface the router uses, offline."""
    try:
        # BM25 needs a few documents for positive IDF; one target among unrelated skills.
        corpus = {
            "probe-router": "Probe the router contract with a synthetic request.",
            "calendar-notes": "Summarize meeting notes into calendar entries.",
            "image-resize": "Resize and compress images for the web.",
            "invoice-export": "Export invoices to spreadsheet files.",
        }
        skills = [
            {"path": name, **skill_entry(f"---\nname: {name}\ndescription: {text}\n---\n{text}\n")}
            for name, text in corpus.items()
        ]
        suggestions, _ = rank("probe the router", skills, 1)
        names = [item["skill"]["name"] for item in suggestions]
        assert names == ["probe-router"], f"expected probe-router, ranked {names}"
    except Exception as exc:
        print(f"OpenSpace router not ready: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    roots = ", ".join(str(root) for root in skill_roots())
    print(f"OpenSpace router ready (local BM25, no network); skill roots: {roots}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--host", choices=HOSTS)
    mode.add_argument("--explain", metavar="PROMPT", help="print the ranking and gate decisions")
    mode.add_argument("--check", action="store_true", help="verify the OpenSpace ranker contract offline")
    args = parser.parse_args(argv)

    if args.check:
        return check()

    if args.explain is not None:
        suggestions, explained = rank(args.explain, load_index(skill_roots()), top_k())
        chosen = {id(item) for item in suggestions}
        for item in explained:
            mark = "*" if id(item) in chosen else " "
            print(
                f"{mark} {item['score']:7.3f} {item['skill']['name']:32s} named={'yes' if item['named'] else 'no'} "
                f"coverage={item['coverage']:.2f} anchors={','.join(item['anchors']) or '-'}"
            )
        print(routing_note(suggestions) if suggestions else "(no suggestion)")
        return 0

    try:
        if os.environ.get("OPENSPACE_ROUTE", "").strip().lower() == "off":
            return 0
        prompt = prompt_from_stdin(sys.stdin.read()).strip()
        # Slash commands belong to the host, not to skill routing.
        if not prompt or prompt.startswith("/"):
            return 0
        suggestions, _ = rank(prompt, load_index(skill_roots()), top_k())
        if suggestions:
            sys.stdout.write(host_output(args.host, routing_note(suggestions)) + "\n")
    except Exception as exc:  # never block the host's prompt
        if os.environ.get("OPENSPACE_ROUTE_DEBUG") == "1":
            print(f"openspace route: {type(exc).__name__}: {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
