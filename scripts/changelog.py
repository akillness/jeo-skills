#!/usr/bin/env python3
"""Manage the README "What's New" changelog.

Single source of truth: changelog/{en,ko}/YYYY-MM.md (monthly files).
Each README shows only the latest N dates between sync markers; the full
history lives in the changelog/ folder. stdlib only — no dependencies.

Commands:
  extract   One-time migration: pull the existing README "What's New" region
            into monthly files, then replace it with a marked, windowed block.
  sync      Re-render the latest-N window into each README from the monthly files.
  check     Verify each README window matches the monthly files. Exit 1 if stale.

Usage:
  python3 scripts/changelog.py extract
  python3 scripts/changelog.py sync
  python3 scripts/changelog.py check
"""
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WINDOW = 3
START = "<!-- WHATS-NEW:START -->"
END = "<!-- WHATS-NEW:END -->"

LANGS = {
    "en": {
        "readme": "README.md",
        "dir": "changelog/en",
        "header": re.compile(r"^## 🆕 What's New in v(\d{4}-\d{2}-\d{2})"),
        "title": "# Changelog — {month}\n\n"
                 "Full history for this month. The README shows only the latest "
                 "{w} dates; see [`changelog/en/`](../) for the rest.\n",
        "footer": "> 📜 Older entries: [`changelog/en/`](changelog/en/) "
                  "(monthly files, newest first).",
    },
    "ko": {
        "readme": "README.ko.md",
        "dir": "changelog/ko",
        "header": re.compile(r"^## 🆕 v(\d{4}-\d{2}-\d{2}) 업데이트"),
        "title": "# 변경 이력 — {month}\n\n"
                 "이 달의 전체 기록입니다. README에는 최신 {w}개 날짜만 노출되며, "
                 "나머지는 [`changelog/ko/`](../) 에 있습니다.\n",
        "footer": "> 📜 이전 기록: [`changelog/ko/`](changelog/ko/) "
                  "(월별 파일, 최신순).",
    },
}


def split_sections(text, header):
    """Return [(date, body), ...] for each '## 🆕' block in `text`."""
    lines = text.split("\n")
    starts = [i for i, ln in enumerate(lines) if header.match(ln)]
    out = []
    for i in starts:
        end = len(lines)
        for j in range(i + 1, len(lines)):
            if header.match(lines[j]) or re.match(r"^---\s*$", lines[j]) or lines[j].startswith("## "):
                end = j
                break
        date = header.match(lines[i]).group(1)
        body = "\n".join(lines[i:end]).rstrip()
        out.append((date, body))
    return out


def render_window(sections, footer):
    """Render the latest WINDOW distinct dates (newest first) + footer."""
    top_dates = set(sorted({d for d, _ in sections}, reverse=True)[:WINDOW])
    chosen = [(d, b) for d, b in sections if d in top_dates]
    chosen.sort(key=lambda x: x[0], reverse=True)  # stable within a date
    block = "\n\n".join(b for _, b in chosen)
    return block + "\n\n" + footer


def load_monthly(cfg):
    sections = []
    d = os.path.join(ROOT, cfg["dir"])
    if os.path.isdir(d):
        for fn in sorted(os.listdir(d)):
            if fn.endswith(".md"):
                with open(os.path.join(d, fn), encoding="utf-8") as f:
                    sections += split_sections(f.read(), cfg["header"])
    return sections


def write_monthly(cfg, sections):
    by_month = defaultdict(list)
    for date, body in sections:
        by_month[date[:7]].append(body)
    out_dir = os.path.join(ROOT, cfg["dir"])
    os.makedirs(out_dir, exist_ok=True)
    for month, bodies in by_month.items():
        title = cfg["title"].format(month=month, w=WINDOW)
        content = title + "\n" + "\n\n".join(bodies) + "\n"
        with open(os.path.join(out_dir, month + ".md"), "w", encoding="utf-8") as f:
            f.write(content)
    return by_month


def new_block(cfg, sections):
    return START + "\n\n" + render_window(sections, cfg["footer"]) + "\n\n" + END


def extract():
    for lang, cfg in LANGS.items():
        path = os.path.join(ROOT, cfg["readme"])
        with open(path, encoding="utf-8") as f:
            lines = f.read().split("\n")
        first = next((i for i, ln in enumerate(lines) if cfg["header"].match(ln)), None)
        if first is None:
            print(f"[{lang}] no 'What's New' sections found — skipping")
            continue
        end = next(j for j in range(first, len(lines)) if re.match(r"^---\s*$", lines[j]))
        region = "\n".join(lines[first:end])
        sections = split_sections(region, cfg["header"])
        by_month = write_monthly(cfg, sections)
        rebuilt = lines[:first] + [new_block(cfg, sections), ""] + lines[end:]
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(rebuilt))
        print(f"[{lang}] extracted {len(sections)} sections -> {len(by_month)} monthly files")


def _apply(write):
    pat = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)
    stale = []
    for lang, cfg in LANGS.items():
        path = os.path.join(ROOT, cfg["readme"])
        with open(path, encoding="utf-8") as f:
            text = f.read()
        if not pat.search(text):
            print(f"[{lang}] markers not found — run 'extract' first")
            sys.exit(2)
        sections = load_monthly(cfg)
        updated = pat.sub(lambda m: new_block(cfg, sections), text)
        if updated != text:
            stale.append(lang)
            if write:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(updated)
    return stale


def sync():
    stale = _apply(write=True)
    print("synced: " + (", ".join(stale) if stale else "already up to date"))


def check():
    stale = _apply(write=False)
    if stale:
        print(f"STALE: {', '.join(stale)} — run 'python3 scripts/changelog.py sync'")
        sys.exit(1)
    print("OK: README windows match changelog/ monthly files")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    {"extract": extract, "sync": sync, "check": check}.get(cmd, lambda: (
        print(__doc__), sys.exit(2)))()
