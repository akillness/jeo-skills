#!/usr/bin/env python3
"""Fixed offline evaluator for link-exception safety; takes checkout root as argv[1]."""
from __future__ import annotations
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

repo = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(repo / "scripts"))
spec = importlib.util.spec_from_file_location("ratchet_link_targets", repo / "scripts/link_targets.py")
assert spec and spec.loader
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)


def scan_fixture(content: str, exceptions: list[str] | None = None, deferred: list[str] | None = None, existing: list[str] | None = None, relative: bool = False):
    with tempfile.TemporaryDirectory(prefix="frozen-link-eval-") as base:
        base = Path(base)
        root = base / ".agent-skills"
        art = base / ".frontmatter"
        (root / "demo").mkdir(parents=True)
        art.mkdir()
        (root / "demo/README.md").write_text(content, encoding="utf-8")
        for p in existing or []:
            (root / "demo" / p).write_text("fixture", encoding="utf-8")
        for filename, entries in [(scanner.EXCLUSIONS, exceptions or []), (scanner.DEFERRED, deferred or [])]:
            (art / filename).write_text("\n".join(entries) + "\n", encoding="utf-8")
        if relative:
            import os
            original = Path.cwd()
            try:
                os.chdir(base)
                rows = scanner.scan(Path(".agent-skills"), Path(".frontmatter"))
            finally:
                os.chdir(original)
        else:
            rows = scanner.scan(root, art)
        return {(r["rule"], r["target"]): r["status"] for r in rows}


legacy = [".agent-skills/demo/README.md:1"]
qualified = [".agent-skills/demo/README.md:1\t7b\t../intentional.md"]
real = scan_fixture("[live](live.md) [missing](missing.md)\n", existing=["live.md"])
raw = scan_fixture(r"`[example](ignored.md)\` [real](missing.md)`" + "\n")
single = scan_fixture("`../intentional.md`\n", legacy)
deferred = scan_fixture("[missing](missing.md)\n", deferred=["demo"])
mixed = scan_fixture("`../intentional.md` [real](missing.md)\n", legacy)
specific = scan_fixture("`../intentional.md` [real](missing.md)\n", qualified)
same_target = scan_fixture("`../intentional.md` [real](../intentional.md)\n", qualified)
absolute = scan_fixture("`../intentional.md` [real](missing.md)\n", qualified)
relative = scan_fixture("`../intentional.md` [real](missing.md)\n", qualified, relative=True)
checks = {
    "real_link_detection": real == {("7a", "live.md"): "ok", ("7a", "missing.md"): "broken"} and raw == {("7a", "missing.md"): "broken"},
    "legacy_single_and_deferred": single == {("7b", "../intentional.md"): "excluded:explicit"} and deferred == {("7a", "missing.md"): "excluded:deferred"},
    "ambiguous_legacy_fails_closed": mixed.get(("7a", "missing.md")) == "broken",
    "qualified_rule_target_precision": specific == {("7a", "missing.md"): "broken", ("7b", "../intentional.md"): "excluded:explicit"} and same_target == {("7a", "../intentional.md"): "broken", ("7b", "../intentional.md"): "excluded:explicit"},
    "root_path_equivalence": absolute == relative,
}
print(json.dumps({"score": sum(checks.values()), "total": len(checks), "checks": checks}, sort_keys=True))
sys.exit(0 if all(checks.values()) else 1)
