#!/usr/bin/env python3
"""research_harvest_gate.py — offline-first responsible-harvesting gate.

Run this before pointing Scrapling at scientific literature, datasets, or
citation metadata. It never claims a scrape is authorized; it only surfaces
two deterministic checks so a human or agent can decide:

  1. robots.txt  — does the target's robots.txt disallow this path, or
                    declare a crawl-delay?
  2. paywall     — does the domain match a known subscription-gated
                    publisher (heuristic list, not exhaustive)?

Output contract mirrors ai4s-research/open-science's `domain-check` /
`stats-integrity` gate scripts: stdlib-only, one ` ```review ` fenced JSON
block on stdout, shaped as {"findings": [...], "note": "..."}.

Usage:
    python3 research_harvest_gate.py <url> [url ...]
"""

from __future__ import annotations

import json
import socket
import sys
import urllib.error
import urllib.request
import urllib.robotparser
from dataclasses import dataclass
from urllib.parse import urlparse

TIMEOUT_SECONDS = 5

# Heuristic only — absence from this list is not proof of open access, and
# presence is not proof the content is unreachable through legitimate means
# (institutional access, open-access mirrors, author copies).
KNOWN_PAYWALLED_DOMAINS = {
    "sciencedirect.com",
    "springer.com",
    "link.springer.com",
    "onlinelibrary.wiley.com",
    "tandfonline.com",
    "ieeexplore.ieee.org",
    "nature.com",
    "cell.com",
    "jstor.org",
    "pubs.acs.org",
    "academic.oup.com",
    "journals.plos.org",  # actually open-access, kept only if user overrides list
}
# journals.plos.org is fully open access; keep the set focused on genuinely
# gated publishers so the heuristic stays useful rather than noisy.
KNOWN_PAYWALLED_DOMAINS.discard("journals.plos.org")


@dataclass
class Finding:
    level: str
    tag: str
    title: str
    evidence: str


NOTE = (
    "Research-harvesting gate — checks robots.txt rules and a known-publisher "
    "heuristic only. It does not verify licensing, ToS, or institutional "
    "access; absence of findings is not proof a scrape is authorized."
)


def _registrable_domain(netloc: str) -> str:
    # Strip a leading "www." only; keep subdomains like "link.springer.com"
    # intact because the paywall heuristic list matches on them directly.
    return netloc[4:] if netloc.startswith("www.") else netloc


def check_robots(url: str) -> list[Finding]:
    findings: list[Finding] = []
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        findings.append(
            Finding("high", "robots", "URL is not absolute (missing scheme/host)", url)
        )
        return findings

    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = urllib.robotparser.RobotFileParser()
    try:
        with urllib.request.urlopen(robots_url, timeout=TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8", errors="replace")
        rp.parse(body.splitlines())
    except (urllib.error.URLError, socket.timeout, ValueError, OSError):
        findings.append(
            Finding(
                "info",
                "robots",
                "robots.txt could not be fetched — rule unverified, not permission",
                robots_url,
            )
        )
        return findings

    if not rp.can_fetch("*", url):
        findings.append(
            Finding("high", "robots", "robots.txt disallows this path for user-agent *", url)
        )

    delay = rp.crawl_delay("*")
    if delay:
        findings.append(
            Finding("info", "robots", "crawl-delay declared", f"{delay}s for {parsed.netloc}")
        )
    return findings


def check_paywall_heuristic(url: str) -> list[Finding]:
    parsed = urlparse(url)
    domain = _registrable_domain(parsed.netloc)
    if domain in KNOWN_PAYWALLED_DOMAINS:
        return [
            Finding(
                "medium",
                "paywall-heuristic",
                "domain matches a known subscription-gated publisher",
                domain,
            )
        ]
    return []


def run(urls: list[str]) -> dict:
    findings: list[Finding] = []
    for url in urls:
        findings.extend(check_robots(url))
        findings.extend(check_paywall_heuristic(url))
    return {
        "findings": [
            {"level": f.level, "check": "research-harvest", "tag": f.tag,
             "title": f.title, "evidence": f.evidence}
            for f in findings
        ],
        "note": NOTE,
    }


def main(argv: list[str]) -> int:
    urls = argv[1:]
    if not urls:
        print("usage: research_harvest_gate.py <url> [url ...]", file=sys.stderr)
        return 2
    result = run(urls)
    print("```review")
    print(json.dumps(result, ensure_ascii=False))
    print("```")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
