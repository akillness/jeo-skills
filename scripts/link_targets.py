#!/usr/bin/env python3
"""Relative-link census and validator for the skill catalog (A0-d / rule 7-8).

Boundary contract (B-1): this module NEVER reads frontmatter bytes. It reuses
`frontmatter_boundary.body_after_frontmatter()` so rule 7 and rule F can never
collide on the same byte — that deadlock is what froze
`skill-standardization/SKILL.md:11` (`scripts/...` inside a frozen frontmatter).

Scanned forms
  rule 7a  markdown link/image targets:  [text](target)  ![alt](target)
  rule 7b  inline code spans that are unambiguously relative paths:
           `../...` with no whitespace and no {placeholder}
  rule 8   bare reference-style definitions:  [label]: target

Never flagged (deliberate exclusions, each one an observed false-positive class)
  - repo-root-relative paths beginning `.agent-skills/`
  - HOME paths beginning `~/`
  - `{...}` template placeholders
  - URLs, mailto:, anchors, and protocol-relative targets
  - fenced code blocks and HTML comments
  - markdown link/image syntax wholly inside an inline code span (rule 7a only)
  - vendored mirrors listed in `.frontmatter/vendored-mirrors.txt`
  - the deferred batch listed in `.frontmatter/deferred-batch.txt`
  - explicit entries in `.frontmatter/link-check-exclusions.txt`
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frontmatter_boundary import body_after_frontmatter, split_frontmatter_text  # noqa: E402

SKILLS_ROOT = Path(".agent-skills")
ARTIFACT_DIR = Path(".frontmatter")
CENSUS = "link-census.tsv"
EXCLUSIONS = "link-check-exclusions.txt"
VENDORED = "vendored-mirrors.txt"
DEFERRED = "deferred-batch.txt"

G10_EXCLUSION_BUDGET = 15

_MD_LINK = re.compile(r"!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
_REF_DEF = re.compile(r"^\s{0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?", re.M)
_CODE_SPAN = re.compile(r"`([^`\n]+)`")
_FENCE_OPEN = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")
_HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)

_SKIP_PREFIX = ("http://", "https://", "mailto:", "//", "#", "tel:", "data:")


def _is_external(target: str) -> bool:
    return target.startswith(_SKIP_PREFIX)


def _is_excluded_shape(target: str) -> bool:
    """Root-relative, HOME, or templated targets are not repo-relative links."""
    if target.startswith(".agent-skills/") or target.startswith("~/"):
        return True
    if "{" in target or "}" in target:
        return True
    if target.startswith("$"):
        return True
    return False


def _strip_fences_and_comments(body: str) -> list[tuple[int, str]]:
    """Return (1-based line number, text) for lines outside fences/HTML comments.

    CommonMark fence rules, not a naive toggle: an opening fence may carry an
    info string, a closing fence may not and must be at least as long as the
    opener and use the same character. A naive toggle desynchronises on nested
    or longer fences — `okf/SKILL.md` has 31 fence lines (odd), which silently
    inverted the in/out state and leaked documentation examples into the census.
    """
    body = _HTML_COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"), body)
    out: list[tuple[int, str]] = []
    fence_char: str | None = None
    fence_len = 0
    for idx, line in enumerate(body.split("\n"), start=1):
        match = _FENCE_OPEN.match(line)
        if fence_char is None:
            if match:
                fence_char = match.group(1)[0]
                fence_len = len(match.group(1))
            else:
                out.append((idx, line))
        else:
            if (
                match
                and match.group(1)[0] == fence_char
                and len(match.group(1)) >= fence_len
                and not match.group(2).strip()
            ):
                fence_char = None
                fence_len = 0
    return out


def _inline_code_ranges(text: str) -> list[tuple[int, int]]:
    """Match same-length backtick runs for 7a, without changing rule 7b."""
    runs = list(re.finditer(r"`+", text))
    ranges: list[tuple[int, int]] = []
    index = 0
    while index < len(runs):
        opener = runs[index]
        prefix = text[:opener.start()]
        if (len(prefix) - len(prefix.rstrip("\\"))) % 2:
            index += 1
            continue
        for closing in range(index + 1, len(runs)):
            if len(runs[closing].group()) == len(opener.group()):
                ranges.append((opener.start(), runs[closing].end()))
                index = closing + 1
                break
        else:
            index += 1
    return ranges


def _inline_code_ranges_by_line(body: str, lines: list[tuple[int, str]]) -> dict[int, list[tuple[int, int]]]:
    """Extend 7a code spans only across conservative plain-text paragraphs.

    This is not a Markdown block parser. Ambiguous block/container syntax,
    indentation, hard breaks, comments, and removed-line gaps end a group;
    those lines retain only their existing single-line handling. False-positive
    examples in complex Markdown are preferable to hiding a real broken link.
    """
    original = body.split("\n")
    result = {number: _inline_code_ranges(text) for number, text in lines}
    paragraph: list[tuple[int, str]] = []

    def flush() -> None:
        if len(paragraph) > 1:
            ranges = _inline_code_ranges("\n".join(text for _, text in paragraph))
            offset = 0
            for number, text in paragraph:
                result[number] = [
                    (max(0, start - offset), min(len(text), end - offset))
                    for start, end in ranges
                    if start < offset + len(text) and end > offset
                ]
                offset += len(text) + 1
        paragraph.clear()

    for number, text in lines:
        plain = (
            bool(text.strip())
            and text == original[number - 1]
            and not re.match(r"^(?:\s|[#>*+_=~-]|\d+[.)](?:\s|$))", text)
            and not re.match(r"^\[[^\]]+\]:", text)
            and "<" not in text
            and "|" not in text
            and not text.endswith(("  ", "\t", "\\"))
        )
        if not plain or (paragraph and number != paragraph[-1][0] + 1):
            flush()
        if plain:
            paragraph.append((number, text))
    flush()
    return result


def _load_list(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    return {
        line.split("#", 1)[0].strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.split("#", 1)[0].strip()
    }


def iter_markdown(root: Path = SKILLS_ROOT):
    for path in sorted(root.rglob("*.md")):
        if path.name.endswith(".baseline"):
            continue
        yield path


def _body_of(path: Path) -> str:
    """Body only for SKILL.md (B-1); other markdown has no frontmatter contract."""
    if path.name == "SKILL.md":
        try:
            return body_after_frontmatter(path)
        except Exception:
            return path.read_text(encoding="utf-8")
    return path.read_text(encoding="utf-8")


def _line_offset(path: Path) -> int:
    """SKILL.md bodies start after the frontmatter; census line numbers are absolute."""
    if path.name != "SKILL.md":
        return 0
    try:
        full = path.read_text(encoding="utf-8")
        body = body_after_frontmatter(path)
        return full[: len(full) - len(body)].count("\n")
    except Exception:
        return 0


def scan(root: Path = SKILLS_ROOT, artifact_dir: Path = ARTIFACT_DIR) -> list[dict]:
    exclusions = _load_list(artifact_dir / EXCLUSIONS)
    vendored = _load_list(artifact_dir / VENDORED)
    deferred = _load_list(artifact_dir / DEFERRED)

    findings: list[dict] = []
    for path in iter_markdown(root):
        rel = path.as_posix()
        # Ledger paths live in a logical catalog namespace, independently of
        # the caller's cwd or absolute/relative root spelling. Keep `rel` above
        # unchanged for census/diagnostic compatibility; never resolve symlinks
        # when deriving this policy identity.
        relative = path.relative_to(root)
        policy_path = (SKILLS_ROOT / relative).as_posix()
        slug = relative.parts[0] if len(relative.parts) > 1 else ""
        in_vendor = any(
            policy_path.startswith(v.rstrip("/") + "/") or policy_path == v.rstrip("/")
            for v in vendored
        )
        in_deferred = slug in deferred
        raw_text = path.read_text(encoding="utf-8")
        if path.name == "SKILL.md":
            try:
                front, body = split_frontmatter_text(raw_text, path)
                offset = front.count("\n")
            except Exception:
                body = raw_text
                offset = 0
        else:
            body = raw_text
            offset = 0

        lines = _strip_fences_and_comments(body)
        code_ranges_by_line = _inline_code_ranges_by_line(body, lines)
        for lineno, text in lines:
            abs_line = lineno + offset
            candidates: list[tuple[str, str]] = []
            code_ranges = code_ranges_by_line[lineno]
            for m in _MD_LINK.finditer(text):
                # Literal Markdown examples are not links. Only suppress a
                # complete 7a match inside code, not a link with a code label.
                if any(start <= m.start() and m.end() <= end for start, end in code_ranges):
                    continue
                candidates.append(("7a", m.group(1)))
            for m in _REF_DEF.finditer(text):
                candidates.append(("8", m.group(1)))
            for m in _CODE_SPAN.finditer(text):
                span = m.group(1)
                if span.startswith("../") and " " not in span and "{" not in span:
                    candidates.append(("7b", span))

            normalized_counts: Counter[tuple[str, str]] | None = None
            for rule, raw in candidates:
                target = raw.split("#", 1)[0].strip()
                if not target or _is_external(target):
                    continue
                if _is_excluded_shape(target):
                    continue
                key = f"{policy_path}:{abs_line}"
                qualified_key = f"{key}\t{rule}\t{target}"
                resolved = (path.parent / target).resolve()
                exists = resolved.exists()
                # Legacy line exclusions are unambiguous only for one candidate.
                # Qualified entries also fail closed when the same normalized
                # target occurs more than once under the same rule on the line.
                qualified = False
                if qualified_key in exclusions:
                    if normalized_counts is None:
                        normalized_counts = Counter(
                            (item_rule, item_raw.split("#", 1)[0].strip())
                            for item_rule, item_raw in candidates
                        )
                    qualified = normalized_counts[(rule, target)] == 1
                legacy_line = key in exclusions and len(candidates) == 1
                if qualified or legacy_line or raw in exclusions:
                    status = "excluded:explicit"
                elif in_vendor:
                    status = "excluded:vendored"
                elif in_deferred:
                    status = "excluded:deferred"
                elif exists:
                    status = "ok"
                else:
                    status = "broken"
                findings.append(
                    {
                        "file": rel,
                        "line": abs_line,
                        "rule": rule,
                        "target": target,
                        "resolved": resolved.as_posix(),
                        "status": status,
                    }
                )
    return findings


def write_census(findings: list[dict], artifact_dir: Path = ARTIFACT_DIR) -> Path:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    out = artifact_dir / CENSUS
    lines = ["file\tline\trule\ttarget\tresolved\tstatus"]
    lines += [
        f"{f['file']}\t{f['line']}\t{f['rule']}\t{f['target']}\t{f['resolved']}\t{f['status']}"
        for f in findings
    ]
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out


def validate_link_targets(root: Path = SKILLS_ROOT, artifact_dir: Path = ARTIFACT_DIR) -> list[dict]:
    """Return broken findings. Empty means no broken findings within the enforced scope."""
    return [f for f in scan(root, artifact_dir) if f["status"] == "broken"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=str(SKILLS_ROOT), type=Path)
    parser.add_argument("--artifact-dir", default=str(ARTIFACT_DIR), type=Path)
    parser.add_argument("--report-only", action="store_true", help="write the census and exit 0")
    args = parser.parse_args()

    findings = scan(args.root, args.artifact_dir)
    census = write_census(findings, args.artifact_dir)
    broken = [f for f in findings if f["status"] == "broken"]

    counts: dict[str, int] = {}
    for f in findings:
        counts[f["status"]] = counts.get(f["status"], 0) + 1
    print(f"census: {census} ({len(findings)} relative-link references)")
    for status in sorted(counts):
        print(f"  {status:<22}{counts[status]:>5}")

    by_rule: dict[str, int] = {}
    for f in broken:
        by_rule[f["rule"]] = by_rule.get(f["rule"], 0) + 1
    print(f"broken: {len(broken)}  " + " ".join(f"rule{r}={n}" for r, n in sorted(by_rule.items())))
    for f in broken:
        print(f"  {f['file']}:{f['line']}  [{f['rule']}]  {f['target']}")

    used = len(_load_list(args.artifact_dir / EXCLUSIONS))
    print(f"exclusion ledger: {used}/{G10_EXCLUSION_BUDGET} (G10 budget)")

    if args.report_only:
        return 0
    return 1 if broken else 0


if __name__ == "__main__":
    raise SystemExit(main())
