#!/usr/bin/env python3
"""Resolve project names read from an image to verified GitHub repositories.

Read-only: the only network traffic is GET requests to the GitHub REST API (or the
host given with --api-base). Nothing is cloned, executed, installed, or written.

Each candidate describes one project seen in an image: a name, optionally an
owner or an explicit URL/slug, the star count printed next to it, and a few
English keywords describing what the image says it does. The script confirms
the repository exists, follows renames, ranks same-named repositories using
those hints, and reports a confidence level instead of guessing.

Confidence: verified (explicit URL/slug confirmed) > high (exact name plus a
corroborating star count or keyword, no equally corroborated rival) > medium
(exact name, no corroboration available, unique or >=10x the next rival) >
low / ambiguous (no match is chosen; alternatives are listed) > none.

Exit codes: 0 every candidate is verified/high/medium, 1 at least one is
low/ambiguous/not found/error, 2 invalid input.

Examples:
  resolve_repo.py --name MoneyPrinterV2 --stars "3.16만" --hint "money online automation"
  resolve_repo.py --url https://github.com/simular-ai/Agent-S --format markdown
  resolve_repo.py --batch candidates.json --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

SCHEMA_VERSION = 1
DEFAULT_API = "https://api.github.com"
TOKEN_HOST = "api.github.com"
USER_AGENT = "jeo-skills-image-to-github-repo/1.0"
MAX_BATCH = 25
MAX_BATCH_BYTES = 1 << 20
MAX_BODY_BYTES = 4 << 20
SEARCH_PAGE = 30
STAR_WINDOW = (0.9, 2.0)  # actual / printed; stars grow, and printed values are rounded
DOMINANCE = 10  # a rival this many times smaller does not make a match ambiguous
CONFIDENT = {"verified", "high", "medium"}
CANDIDATE_KEYS = {"name", "owner", "url", "stars", "hints"}

UNITS = {"k": 1_000, "m": 1_000_000, "천": 1_000, "만": 10_000, "억": 100_000_000}
COUNT_PART = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*([kKmM천만억])?")
COUNT_TAIL = re.compile(r"\s*(?:개|stars?)?\s*", re.IGNORECASE)
MAX_COUNT_TEXT = 40
STOPWORDS = {
    "and", "app", "apps", "for", "free", "from", "github", "into", "open", "program",
    "project", "source", "that", "the", "this", "tool", "tools", "with", "your",
}
HOSTS = {"github.com", "www.github.com", "gitingest.com", "www.gitingest.com"}
SLUG = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}")
RESERVED_OWNERS = {
    "about", "apps", "features", "issues", "login", "marketplace", "orgs", "pricing",
    "pulls", "search", "settings", "sponsors", "topics", "trending",
}


class InputError(Exception):
    """The caller supplied something this tool cannot interpret (exit 2)."""


class ApiError(Exception):
    def __init__(self, code, message, reset=None):
        super().__init__(message)
        self.code = code
        self.reset = reset


def parse_count(text):
    """Parse a displayed count such as 31600, 12,886, 1.2k or 3.16만 into an int.

    Compound forms such as '3만 1천' are summed; every segment except the last must
    carry a unit, so '1 2' is rejected rather than read as 3.
    """
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_COUNT_TEXT:
        raise ValueError(f"not a count: {text!r}")
    parts = COUNT_PART.findall(text)
    if not parts or not all(unit for _, unit in parts[:-1]) or not COUNT_TAIL.fullmatch(COUNT_PART.sub("", text)):
        raise ValueError(f"not a count: {text!r}")
    return int(round(sum(float(n.replace(",", "")) * UNITS.get(u.lower(), 1) for n, u in parts)))


def normalize(text):
    """Case- and separator-insensitive form: 'Agent S' == 'Agent-S' == 'agent_s'."""
    return "".join(ch for ch in text.lower() if ch.isalnum())


def parse_repo_ref(text):
    """Return (owner, repo) for a GitHub URL, SSH remote, or bare owner/repo slug."""
    text = text.strip()
    ssh = re.match(r"git@github\.com:(.+)$", text)
    if ssh:
        segments = [s for s in ssh.group(1).split("/") if s]
    else:
        has_scheme = "://" in text
        first = text.split("/", 1)[0].lower()
        if has_scheme or first in HOSTS:
            parsed = urllib.parse.urlsplit(text if has_scheme else "https://" + text)
            if (parsed.hostname or "").lower() not in HOSTS:
                return None
            segments = [s for s in parsed.path.split("/") if s]
        else:
            segments = [s for s in text.split("/") if s]
            if len(segments) != 2:
                return None
    if len(segments) < 2:
        return None
    owner, repo = segments[0], segments[1]
    if repo.endswith(".git"):
        repo = repo[:-4]
    if owner.lower() in RESERVED_OWNERS or not SLUG.fullmatch(f"{owner}/{repo}"):
        return None
    return owner, repo


def hint_words(hints):
    words = {w for h in hints for w in re.findall(r"[0-9a-z가-힣]{3,}", h.lower())}
    return sorted(words - STOPWORDS)


def query_variants(name):
    """Search spellings, most likely first: repos hyphenate, then run words together."""
    base = " ".join(name.replace('"', " ").split())
    variants = [base.replace(" ", "-"), base.replace(" ", ""), base] if " " in base else [base]
    return list(dict.fromkeys(v for v in variants if v))


class SameHostRedirect(urllib.request.HTTPRedirectHandler):
    """Follow redirects (GitHub 301s renamed repos) but never to another host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlsplit(newurl).netloc != urllib.parse.urlsplit(req.full_url).netloc:
            return None
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Client:
    def __init__(self, api_base, timeout, token):
        self.api_base = api_base.rstrip("/")
        self.timeout = timeout
        parsed = urllib.parse.urlsplit(self.api_base)
        # The token is sent to GitHub's API only, never to an arbitrary --api-base host.
        self.token = token if parsed.scheme == "https" and parsed.hostname == TOKEN_HOST else None
        self.opener = urllib.request.build_opener(SameHostRedirect)
        self.rate = None
        self.exhausted = None

    def url(self, path, params=None):
        return self.api_base + path + ("?" + urllib.parse.urlencode(params) if params else "")

    def _record(self, headers):
        keys = ("limit", "remaining", "reset")
        raw = {k: headers.get("x-ratelimit-" + k) for k in keys}
        if raw["remaining"] is None:
            return
        reset = None
        if (raw["reset"] or "").isdigit():
            reset = datetime.fromtimestamp(int(raw["reset"]), timezone.utc).isoformat()
        self.rate = {
            "limit": int(raw["limit"]) if (raw["limit"] or "").isdigit() else None,
            "remaining": int(raw["remaining"]) if raw["remaining"].isdigit() else None,
            "reset": reset,
        }

    def get(self, path, params=None):
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        request = urllib.request.Request(self.url(path, params), headers=headers, method="GET")
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                self._record(response.headers)
                body = response.read(MAX_BODY_BYTES + 1)
        except urllib.error.HTTPError as err:
            self._record(err.headers)
            body = err.read(MAX_BODY_BYTES + 1)
            if err.code == 404:
                raise ApiError("not_found", "repository not found or not public") from None
            limited = err.code == 429 or (
                err.code == 403
                and ((self.rate or {}).get("remaining") == 0 or b"rate limit" in body.lower())
            )
            if err.code in (403, 429) and limited:
                reset = (self.rate or {}).get("reset")
                self.exhausted = ApiError(
                    "rate_limited", "GitHub API rate limit exhausted"
                    + (f"; resets at {reset}" if reset else "")
                    + ("" if self.token else "; set GITHUB_TOKEN to raise the limit"),
                    reset,
                )
                raise self.exhausted from None
            if 300 <= err.code < 400:
                raise ApiError("redirect_off_host", f"HTTP {err.code} redirects to another host") from None
            raise ApiError(f"http_{err.code}", f"HTTP {err.code} from {urllib.parse.urlsplit(self.api_base).netloc}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            reason = getattr(err, "reason", err)
            raise ApiError("network", f"request failed: {reason}") from None
        if len(body) > MAX_BODY_BYTES:
            raise ApiError("bad_response", "response body exceeds the size cap")
        try:
            return json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise ApiError("bad_response", "response is not valid JSON") from None


def summarize(item):
    owner_repo = item["full_name"]
    return {
        "full_name": owner_repo,
        "html_url": item.get("html_url") or f"https://github.com/{owner_repo}",
        "description": item.get("description"),
        "stars": item.get("stargazers_count"),
        "archived": bool(item.get("archived")),
        "fork": bool(item.get("fork")),
        "pushed_at": item.get("pushed_at"),
        "license": (item.get("license") or {}).get("spdx_id"),
        "topics": item.get("topics") or [],
    }


def stars_within(actual, hint):
    if hint is None or actual is None:
        return None
    return STAR_WINDOW[0] * hint <= actual <= STAR_WINDOW[1] * hint


def assess(repo, norm_name, star_hint, words):
    # Repository names are excluded from the keyword haystack: every same-named
    # repository contains the project name, so it can corroborate nothing.
    haystack = " ".join([repo["description"] or "", " ".join(repo["topics"])]).lower()
    return {
        "repo": repo,
        "exact": normalize(repo["full_name"].split("/", 1)[1]) == norm_name,
        "matched": [w for w in words if w in haystack],
        "stars_ok": stars_within(repo["stars"], star_hint),
    }


def contradicted(entry):
    """Only a printed star count can rule a repository out; a missing keyword cannot."""
    return entry["stars_ok"] is False


def supported(entry):
    return entry["stars_ok"] is True or (entry["stars_ok"] is None and bool(entry["matched"]))


def explain(entry, star_hint):
    parts = [f"name matches {entry['repo']['full_name'].split('/', 1)[1]!r}"]
    if entry["matched"]:
        parts.append("description/topics mention " + ", ".join(entry["matched"]))
    if star_hint is not None and entry["stars_ok"] is not None:
        parts.append(
            f"stars {entry['repo']['stars']} {'within' if entry['stars_ok'] else 'outside'} "
            f"the window for the printed {star_hint}"
        )
    return parts


def repo_flags(repo):
    notes = []
    if repo["archived"]:
        notes.append("repository is archived (read-only upstream)")
    if repo["fork"]:
        notes.append("repository is a fork")
    return notes


def new_result(query):
    return {"query": query, "status": "error", "confidence": "none", "match": None,
            "alternatives": [], "evidence": [], "notes": []}


def resolve_explicit(client, query, ref):
    result = new_result(query)
    owner, repo = ref
    requested = f"{owner}/{repo}"
    try:
        item = client.get(f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}")
    except ApiError as err:
        if err.code != "not_found":
            raise
        result.update(status="not_found")
        result["notes"].append(f"{requested} does not exist or is not public; the printed link may be wrong or the repository removed")
        return result
    match = summarize(item)
    result.update(status="verified", confidence="verified", match=match)
    result["evidence"].append("repository confirmed via the GitHub API from an explicit URL/slug")
    if match["full_name"].lower() != requested.lower():
        match["renamed_from"] = requested
        result["notes"].append(f"{requested} now redirects to {match['full_name']}; report the current URL")
    hint = query["stars_hint"]
    ok = stars_within(match["stars"], hint)
    if ok is False:
        result["notes"].append(f"stars {match['stars']} are outside the window for the printed {hint}; the post may be old or the link points at a different repository")
    elif ok:
        result["evidence"].append(f"stars {match['stars']} consistent with printed {hint}")
    result["notes"].extend(repo_flags(match))
    return result


def search_variants(client, name):
    seen, repos = set(), []
    norm = normalize(name)
    for variant in query_variants(name):
        data = client.get("/search/repositories", {"q": f'"{variant}" in:name', "per_page": SEARCH_PAGE})
        for item in data.get("items", []):
            if item["full_name"] not in seen:
                seen.add(item["full_name"])
                repos.append(summarize(item))
        if any(normalize(r["full_name"].split("/", 1)[1]) == norm for r in repos):
            break
    return repos


def resolve_by_name(client, query, limit):
    result = new_result(query)
    name = query["name"]
    repos = search_variants(client, name)
    if not repos:
        result["status"] = "not_found"
        result["notes"].append("no repository name matched; try other spellings or add an owner")
        return result
    star_hint = query["stars_hint"]
    words = [w for w in query["hint_words"] if w not in normalize(name)]
    assessed = [assess(r, normalize(name), star_hint, words) for r in repos]
    exact = sorted((e for e in assessed if e["exact"]), key=lambda e: e["repo"]["stars"] or 0, reverse=True)
    signals = star_hint is not None or bool(words)
    if not exact:
        result.update(status="candidates", confidence="low",
                      alternatives=[e["repo"] for e in assessed[:limit]])
        result["notes"].append("no repository has exactly this name; these are partial matches, none is chosen")
        return result
    stars = lambda e: e["repo"]["stars"] or 0
    if not signals:
        top = exact[0]
        if len(exact) > 1 and stars(top) < DOMINANCE * stars(exact[1]):
            result.update(status="ambiguous", confidence="none", alternatives=[e["repo"] for e in exact[:limit]])
            result["notes"].append("several same-named repositories exist and no printed stars or keywords separate them; add the printed star count, a keyword, or the owner")
            return result
        result.update(status="resolved", confidence="medium", match=top["repo"],
                      alternatives=[e["repo"] for e in exact[1:limit + 1]])
        result["evidence"].extend(explain(top, star_hint))
        result["notes"].append("matched by name only; no printed stars or keywords were supplied to corroborate it"
                               + (f"; it has at least {DOMINANCE}x the stars of every same-named repository" if len(exact) > 1 else ""))
        result["notes"].extend(repo_flags(top["repo"]))
        return result
    standing = [e for e in exact if not contradicted(e)]
    backed = [e for e in standing if supported(e)]
    if not backed:
        result.update(status="candidates", confidence="low", alternatives=[e["repo"] for e in exact[:limit]])
        result["notes"].append("exact-name repositories exist, but none matches the printed stars or keywords; none is chosen")
        return result
    top = backed[0]
    more_popular = [e for e in standing if stars(e) > stars(top)]
    if more_popular:
        result.update(status="ambiguous", confidence="none", alternatives=[e["repo"] for e in standing[:limit]])
        result["notes"].append("a more popular same-named repository exists that the hints neither support nor rule out; add the printed star count or the owner")
        return result
    rivals = [e for e in backed[1:] if stars(top) < DOMINANCE * stars(e)]
    result.update(status="resolved", confidence="medium" if rivals else "high", match=top["repo"],
                  alternatives=[e["repo"] for e in standing if e is not top][:limit])
    result["evidence"].extend(explain(top, star_hint))
    if rivals:
        result["notes"].append(f"same-named repositories that also fit the hints: {len(rivals)}; this is the most popular, so verify it is the one shown")
    elif len(exact) > 1:
        result["notes"].append(f"{len(exact)} repositories share this name; only this one fits the hints and none is more popular")
    result["notes"].extend(repo_flags(top["repo"]))
    return result


def build_query(raw, index):
    where = f"candidate {index}"
    if not isinstance(raw, dict):
        raise InputError(f"{where}: expected an object")
    unknown = set(raw) - CANDIDATE_KEYS
    if unknown:
        raise InputError(f"{where}: unknown keys {sorted(unknown)}; allowed {sorted(CANDIDATE_KEYS)}")
    text = {}
    for key in ("name", "owner", "url"):
        value = raw.get(key)
        if value is not None and (not isinstance(value, str) or not value.strip()):
            raise InputError(f"{where}: {key} must be a non-empty string")
        text[key] = value.strip() if value else None
    hints = raw.get("hints", [])
    if isinstance(hints, str):
        hints = [hints]
    if not isinstance(hints, list) or not all(isinstance(h, str) for h in hints):
        raise InputError(f"{where}: hints must be a string or a list of strings")
    stars = raw.get("stars")
    star_hint = None
    if stars is not None:
        try:
            star_hint = int(stars) if isinstance(stars, int) and not isinstance(stars, bool) else parse_count(str(stars))
        except ValueError:
            raise InputError(f"{where}: cannot read stars {stars!r}; use forms like 31600, 12,886, 1.2k or 3.16만") from None
    if not (text["name"] or text["url"]):
        raise InputError(f"{where}: give at least a name or a url")
    return {
        "name": text["name"], "owner": text["owner"], "url": text["url"],
        "stars_text": None if stars is None else str(stars), "stars_hint": star_hint,
        "hints": hints, "hint_words": hint_words(hints),
    }


def plan(query, api_base):
    ref = explicit_ref(query)
    client = Client(api_base, 1, None)
    if ref:
        owner, repo = ref
        return [client.url(f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}")]
    if not query["name"]:
        return []
    return [client.url("/search/repositories", {"q": f'"{v}" in:name', "per_page": SEARCH_PAGE})
            for v in query_variants(query["name"])]


def explicit_ref(query):
    if query["url"]:
        return parse_repo_ref(query["url"])
    if query["owner"] and query["name"]:
        return parse_repo_ref(f"{query['owner']}/{query['name']}")
    if query["name"] and "/" in query["name"]:
        return parse_repo_ref(query["name"])
    return None


def resolve(client, query, limit):
    result = new_result(query)
    if client.exhausted:
        result["notes"].append(str(client.exhausted))
        result["error"] = {"code": client.exhausted.code, "message": str(client.exhausted)}
        return result
    try:
        ref = explicit_ref(query)
        if ref:
            return resolve_explicit(client, query, ref)
        if query["url"] and not query["name"]:
            result["notes"].append("the url is not a GitHub repository reference (expected github.com/<owner>/<repo>)")
            result["error"] = {"code": "unsupported_url", "message": result["notes"][-1]}
            return result
        found = resolve_by_name(client, query, limit)
        if query["url"]:
            found["notes"].insert(0, "the url is not a GitHub repository reference; resolved by name instead")
        return found
    except ApiError as err:
        result["notes"].append(str(err))
        result["error"] = {"code": err.code, "message": str(err)}
        return result


def load_candidates(args):
    if args.batch:
        try:
            if args.batch == "-":
                data = sys.stdin.read(MAX_BATCH_BYTES + 1)
            else:
                with open(args.batch, "r", encoding="utf-8") as handle:
                    data = handle.read(MAX_BATCH_BYTES + 1)
        except (OSError, UnicodeDecodeError) as err:
            raise InputError(f"cannot read --batch: {err}") from None
        if len(data) > MAX_BATCH_BYTES:
            raise InputError("--batch input exceeds 1 MiB")
        try:
            parsed = json.loads(data)
        except ValueError as err:
            raise InputError(f"--batch is not valid JSON: {err}") from None
        if isinstance(parsed, dict):
            parsed = parsed.get("candidates")
        if not isinstance(parsed, list) or not parsed:
            raise InputError("--batch must be a non-empty JSON array (or {\"candidates\": [...]})")
        if len(parsed) > MAX_BATCH:
            raise InputError(f"--batch has {len(parsed)} candidates; the limit is {MAX_BATCH} to stay inside GitHub's search rate limit")
        return [build_query(raw, i + 1) for i, raw in enumerate(parsed)]
    raw = {"name": args.name, "owner": args.owner, "url": args.url, "stars": args.stars,
           "hints": args.hint or []}
    return [build_query({k: v for k, v in raw.items() if v is not None}, 1)]


def render_markdown(report):
    lines = ["| # | Query | Status | Confidence | Repository | Stars | Evidence |",
             "|---|---|---|---|---|---|---|"]
    extra = []
    for index, result in enumerate(report["results"], 1):
        query = result["query"]
        label = query["name"] or query["url"]
        match = result["match"]
        repo = match["html_url"] if match else "—"
        stars = match["stars"] if match else "—"
        evidence = "; ".join(result["evidence"] + result["notes"]) or "—"
        lines.append(f"| {index} | {label} | {result['status']} | {result['confidence']} | {repo} | {stars} | {evidence} |".replace("\n", " "))
        if result["alternatives"] and not match:
            extra.append(f"\nAlternatives for {label}:")
            extra.extend(f"- {a['html_url']} ({a['stars']} stars) — {a['description'] or 'no description'}"
                         for a in result["alternatives"])
    return "\n".join(lines + extra)


def build_parser():
    parser = argparse.ArgumentParser(
        description="Resolve project names from an image to verified GitHub repositories (read-only).")
    parser.add_argument("--name", help="project name exactly as printed in the image")
    parser.add_argument("--owner", help="GitHub owner when the image shows one (with --name)")
    parser.add_argument("--url", help="URL or owner/repo slug literally visible in the image")
    parser.add_argument("--stars", help="star count as printed, e.g. 31600, 1.2k, 3.16만")
    parser.add_argument("--hint", action="append", help="English keyword(s) for what the image says it does; repeatable")
    parser.add_argument("--batch", metavar="FILE", help="JSON array of candidates ('-' reads stdin); exclusive with --name/--owner/--url/--stars/--hint")
    parser.add_argument("--api-base", default=DEFAULT_API, help=f"GitHub API base URL (default {DEFAULT_API})")
    parser.add_argument("--timeout", type=float, default=15.0, help="per-request timeout in seconds (default 15)")
    parser.add_argument("--limit", type=int, default=5, help="max alternatives per result (default 5)")
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    parser.add_argument("--dry-run", action="store_true", help="print the requests that would be made; no network access")
    return parser


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        single = any(v is not None for v in (args.name, args.owner, args.url, args.stars)) or bool(args.hint)
        if args.batch and single:
            raise InputError("--batch cannot be combined with --name/--owner/--url/--stars/--hint")
        if not args.batch and not (args.name or args.url):
            raise InputError("give --name and/or --url, or --batch FILE")
        if args.limit < 1 or args.timeout <= 0:
            raise InputError("--limit must be >= 1 and --timeout > 0")
        parsed = urllib.parse.urlsplit(args.api_base)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise InputError("--api-base must be an http(s) URL")
        queries = load_candidates(args)
    except InputError as err:
        print(f"error: {err}", file=sys.stderr)
        return 2

    public = lambda q: {k: v for k, v in q.items() if k != "hint_words"}
    if args.dry_run:
        report = {"schema_version": SCHEMA_VERSION, "dry_run": True, "results": [
            {"query": public(q), "planned_requests": plan(q, args.api_base)} for q in queries]}
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0

    token = (os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or "").strip() or None
    client = Client(args.api_base, args.timeout, token)
    results = []
    for query in queries:
        result = resolve(client, query, args.limit)
        result["query"] = public(result["query"])
        results.append(result)
    report = {"schema_version": SCHEMA_VERSION, "authenticated": client.token is not None,
              "rate_limit": client.rate, "results": results}
    print(render_markdown(report) if args.format == "markdown" else json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if all(r["confidence"] in CONFIDENT for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
