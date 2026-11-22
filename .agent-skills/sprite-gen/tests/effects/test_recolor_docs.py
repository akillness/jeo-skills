# SPDX-License-Identifier: Apache-2.0
"""Doc surface lock for the recolor feature.

An external user who only reads the docs must be able to bake colourways. The
implementation is already covered by `test_recolor_bake` / `test_recolor_curation_view`;
this file only pins minimal anchors — the leaf names both commands, the hub and the
README link the leaf, and the curation doc names the sidecar field — not the prose.
Internal project names and absolute personal paths must not appear in the new leaf
(open-source vocabulary rule for this repo).
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# A denylist is itself published. Anything that would only be secret until this
# file is read (an operator's login name, a private address, an unpublished
# project id) is expressed as a *class* below, never as a literal — otherwise the
# guard leaks exactly what it guards.
#
# Literals here are limited to names this repository already prints in its own
# tracked tree (CHANGELOG / docs / other tests), so naming them again costs
# nothing new.
FORBIDDEN_LITERALS_IN_RECOLOR_LEAF = (
    "synthetic fixture",
)

# Classes of operator context that must never reach a published doc.
FORBIDDEN_PATTERNS_IN_RECOLOR_LEAF = (
    # An absolute path inside somebody's home directory — leaks a login name and
    # is unusable for every reader who is not that person.
    (re.compile(r"/(?:Users|home)/[A-Za-z0-9._-]+"), "an absolute personal home path"),
    # A contact address of any kind.
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "an e-mail address"),
)


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def test_the_docs_teach_recolor() -> None:
    leaf = _read("docs/recolor.md")
    assert "sprite-gen recolor" in leaf
    assert "sprite-gen recolor-palette" in leaf
    # The hub and the README route readers to the leaf.
    assert "docs/recolor.md" in _read("SKILL.md")
    assert "docs/recolor.md" in _read("README.md")
    # The curation doc names the sidecar field the curator writes.
    assert "picked" in _read("docs/curation.md")


# Every file this feature adds to the published tree. The leak found in review was
# in a *test* file, not in the leaf — so the vocabulary lock covers all of them.
RECOLOR_SURFACE = (
    "docs/recolor.md",
    "scripts/recolor.py",
    "sprite_gen/effects/recolor.py",
    "sprite_gen/serve/curator/src/recolor.js",
    "tests/effects/test_recolor_bake.py",
    "tests/packaging/test_recolor_cli_entrypoint.py",
    "tests/serve/test_recolor_curation_view.py",
    "tests/effects/test_recolor_docs.py",
)


def test_recolor_surface_carries_no_operator_context() -> None:
    lowered = _read("docs/recolor.md").lower()
    for token in FORBIDDEN_LITERALS_IN_RECOLOR_LEAF:
        assert token.lower() not in lowered, f"docs/recolor.md must not mention {token!r}"
    for rel in RECOLOR_SURFACE:
        raw = _read(rel)
        for pattern, what in FORBIDDEN_PATTERNS_IN_RECOLOR_LEAF:
            hit = pattern.search(raw)
            assert hit is None, f"{rel} must not carry {what} (found at offset {hit.start()})"
