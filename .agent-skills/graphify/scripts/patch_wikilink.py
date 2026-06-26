#!/usr/bin/env python3
"""Re-apply graphify's wikilink normalization to the installed wiki.py.

Why this exists
---------------
graphify (the PyPI package ``graphifyy``) saves community / god-node pages
under a *slugged* filename — ``_safe_filename(label)`` turns spaces into ``_``,
``/`` into ``-``, ``:`` into ``-`` (e.g. ``Community 36`` -> ``Community_36.md``)
— but its wiki generator emits wikilinks using the *raw* label
(``[[Community 36]]``). The link therefore never resolves to the real
``Community_36.md`` file, producing broken links across the whole vault.

The fix normalizes every link emission to ``[[slug|label]]`` via a ``_wikilink``
helper:

    def _wikilink(label: str) -> str:
        slug = _safe_filename(label)
        return f"[[{label}]]" if slug == label else f"[[{slug}|{label}]]"

Because the real fix lives in ``site-packages/graphify/wiki.py`` (an in-place
edit), ``pip install --upgrade graphifyy`` wipes it out. The permanent fix is an
upstream PR to https://github.com/safishamsi/graphify. Until that lands, this
script makes the local patch a durable, idempotent, re-runnable step: wire it
into your post-install / post-upgrade hook so the generator self-heals.

Usage
-----
    python3 patch_wikilink.py                 # locate installed graphify, patch
    python3 patch_wikilink.py --path X/wiki.py # patch a specific file
    python3 patch_wikilink.py --check         # report status, change nothing
    python3 patch_wikilink.py --self-test     # verify the transform logic only

Idempotent: a second run is a no-op. Exit code 0 on success / already-patched,
1 on failure (file not found, transform produced invalid Python, etc.).
"""
from __future__ import annotations

import argparse
import ast
import re
import sys

HELPER = (
    "def _wikilink(label: str) -> str:\n"
    "    slug = _safe_filename(label)\n"
    '    return f"[[{label}]]" if slug == label else f"[[{slug}|{label}]]"\n'
)

# Matches a raw-label wikilink f-string: f"[[{X}]]" or f'[[{X}]]' where X has no
# '|' already (so an already-normalized f"[[{slug}|{label}]]" is left alone).
_LINK_RE = re.compile(r"""f(["'])\[\[\{([^}|]+)\}\]\]\1""")


def transform(src: str) -> tuple[str, int]:
    """Return (patched_source, n_links_rewritten).

    Rewrites every raw-label wikilink f-string to a ``_wikilink(...)`` call, then
    inserts the ``_wikilink`` helper immediately after ``_safe_filename``.
    Replacement runs BEFORE the helper is inserted so the helper's own
    ``f"[[{label}]]"`` literal is never clobbered. Already-patched input is
    returned unchanged with a count of 0.
    """
    if "def _wikilink(" in src:
        return src, 0

    # 1. Rewrite link emission sites first (helper not present yet).
    patched, n = _LINK_RE.subn(lambda m: f"_wikilink({m.group(2)})", src)
    if n == 0:
        # Nothing to rewrite — don't inject an unused helper.
        return src, 0

    # 2. Insert the helper right after the _safe_filename function block.
    tree = ast.parse(patched)
    anchor_end = None
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "_safe_filename":
            anchor_end = node.end_lineno
            break
    if anchor_end is None:
        raise RuntimeError("could not locate `_safe_filename` to anchor the helper")

    lines = patched.split("\n")
    block = ["", HELPER.rstrip("\n")]
    lines[anchor_end:anchor_end] = block
    result = "\n".join(lines)

    # 3. Fail loudly if we produced invalid Python.
    ast.parse(result)
    return result, n


def patch_file(path: str, check_only: bool) -> int:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            src = fh.read()
    except OSError as exc:
        print(f"ERROR: cannot read {path}: {exc}", file=sys.stderr)
        return 1

    if "def _wikilink(" in src:
        print(f"OK: already patched — {path}")
        return 0

    if check_only:
        n = len(_LINK_RE.findall(src))
        print(f"UNPATCHED: {path} has {n} raw-label wikilink site(s) to normalize")
        return 1

    try:
        result, n = transform(src)
    except (SyntaxError, RuntimeError) as exc:
        print(f"ERROR: patch failed for {path}: {exc}", file=sys.stderr)
        return 1

    if n == 0:
        print(f"NOTHING TO DO: no raw-label wikilink sites found in {path}")
        return 0

    with open(path + ".bak", "w", encoding="utf-8") as fh:
        fh.write(src)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(result)
    print(f"PATCHED: normalized {n} wikilink site(s) — {path} (backup: {path}.bak)")
    return 0


def locate_wiki_py() -> str | None:
    try:
        import graphify  # type: ignore
    except Exception:
        return None
    import os

    candidate = os.path.join(os.path.dirname(graphify.__file__), "wiki.py")
    return candidate if os.path.isfile(candidate) else None


SELF_TEST_SRC = '''\
import re


def _safe_filename(label: str) -> str:
    return label.replace(" ", "_").replace("/", "-").replace(":", "-")


def _cross_community_links(other_label):
    return f"- {f'[[{other_label}]]'}"


def god_node(community_name, neighbor_label):
    a = f"**Community:** {f'[[{community_name}]]'}"
    b = f"{f'[[{neighbor_label}]]'}"
    return a, b


def index(label, node):
    x = f"- {f'[[{label}]]'}"
    y = f"- {f\'[[{node["label"]}]]\'}"
    return x, y
'''


def self_test() -> int:
    out, n = transform(SELF_TEST_SRC)
    failures = []
    if n != 5:
        failures.append(f"expected 5 rewrites, got {n}")
    for needle in (
        "def _wikilink(label: str) -> str:",
        "_wikilink(other_label)",
        "_wikilink(community_name)",
        "_wikilink(neighbor_label)",
        "_wikilink(label)",
        '_wikilink(node["label"])',
    ):
        if needle not in out:
            failures.append(f"missing expected substring: {needle!r}")
    if "f'[[{other_label}]]'" in out:
        failures.append("raw-label wikilink survived rewrite")

    # Helper must be importable and behave as specified.
    ns: dict = {}
    exec(out, ns)  # noqa: S102 - trusted, self-generated test source
    cases = {
        "Community 36": "[[Community_36|Community 36]]",
        "Plain": "[[Plain]]",
        "A/B: C": "[[A-B-_C|A/B: C]]",
    }
    for label, expected in cases.items():
        got = ns["_wikilink"](label)
        if got != expected:
            failures.append(f"_wikilink({label!r}) -> {got!r}, expected {expected!r}")

    # Idempotency: re-running transform changes nothing.
    again, n2 = transform(out)
    if n2 != 0 or again != out:
        failures.append("transform is not idempotent")

    if failures:
        for f in failures:
            print(f"FAIL: {f}", file=sys.stderr)
        return 1
    print("OK: self-test passed (5 sites rewritten, helper correct, idempotent)")
    return 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--path", help="explicit path to graphify/wiki.py")
    ap.add_argument("--check", action="store_true", help="report status only")
    ap.add_argument("--self-test", action="store_true", help="verify transform logic")
    args = ap.parse_args(argv)

    if args.self_test:
        return self_test()

    path = args.path or locate_wiki_py()
    if not path:
        print(
            "ERROR: could not locate graphify/wiki.py — is `graphifyy` installed "
            "in this environment? Pass --path explicitly.",
            file=sys.stderr,
        )
        return 1
    return patch_file(path, check_only=args.check)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
