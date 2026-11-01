#!/usr/bin/env python3
"""Offline link-policy regressions; all generated files live in temporary fixtures.

Run with: python3 -B scripts/test_link_targets.py -v
"""

from __future__ import annotations

from contextlib import contextmanager
import os
from pathlib import Path
import tempfile
import unittest

import link_targets


@contextmanager
def working_directory(path: Path):
    previous = Path.cwd()
    try:
        os.chdir(path)
        yield
    finally:
        os.chdir(previous)


class LinkTargetTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="link-targets-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.repo = self.base / "repo"
        self.root = self.repo / ".agent-skills"
        self.artifacts = self.repo / ".frontmatter"
        self.other = self.base / "other-cwd"
        self.root.mkdir(parents=True)
        self.artifacts.mkdir()
        self.other.mkdir()

    def document(self, relative, body, frontmatter=False):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        prefix = "---\nname: fixture\ndescription: '[not scanned](frontmatter.md)'\n---\n"
        path.write_text((prefix if frontmatter else "") + body, encoding="utf-8")
        return path

    def ledger(self, name, entries):
        (self.artifacts / name).write_text("# fixture ledger\n" + "\n".join(entries) + "\n", encoding="utf-8")

    def policy_fixture(self):
        self.document("explicit/SKILL.md", "[example](line-example.md)\n[real](line-real.md)\n", True)
        self.document("explicit/README.md", "[raw](raw-example.md)\n")
        self.document("explicit-extra/SKILL.md", "[real](prefix-real.md)\n", True)
        self.document("vendor/upstream/README.md", "[vendor](vendor-example.md)\n")
        self.document("vendor/upstream/nested/README.md", "[vendor](nested-example.md)\n")
        self.document("vendor/upstream-extra/README.md", "[real](vendor-prefix-real.md)\n")
        self.document("vendor/single.md", "[vendor](single-example.md)\n")
        self.document("vendor/single.md-extra/README.md", "[real](file-prefix-real.md)\n")
        self.document("later/SKILL.md", "[deferred](later-example.md)\n", True)
        self.document("later/references/README.md", "[deferred](later-nested.md)\n")
        self.document("later-extra/SKILL.md", "[real](deferred-prefix-real.md)\n", True)
        self.document("live/SKILL.md", "[ok](docs.md#heading)\n[real](missing.md)\n", True)
        self.document("live/docs.md", "# Existing target\n")
        self.ledger(link_targets.EXCLUSIONS, [
            ".agent-skills/explicit/SKILL.md:5 # exact line only",
            "raw-example.md",
        ])
        self.ledger(link_targets.VENDORED, [
            ".agent-skills/vendor/upstream/",
            ".agent-skills/vendor/single.md",
        ])
        self.ledger(link_targets.DEFERRED, ["later"])

    def test_root_forms_and_cwd_have_identical_policy_results_and_keep_file_format(self):
        self.policy_fixture()
        expected = {
            "line-example.md": "excluded:explicit",
            "line-real.md": "broken",
            "raw-example.md": "excluded:explicit",
            "prefix-real.md": "broken",
            "vendor-example.md": "excluded:vendored",
            "nested-example.md": "excluded:vendored",
            "vendor-prefix-real.md": "broken",
            "single-example.md": "excluded:vendored",
            "file-prefix-real.md": "broken",
            "later-example.md": "excluded:deferred",
            "later-nested.md": "excluded:deferred",
            "deferred-prefix-real.md": "broken",
            "docs.md": "ok",
            "missing.md": "broken",
        }
        baseline = None
        modes = [
            (self.repo, Path(".agent-skills"), Path(".frontmatter")),
            (self.repo, self.root, self.artifacts),
            (self.other, self.root, self.artifacts),
            (self.other, Path("../repo/.agent-skills"), Path("../repo/.frontmatter")),
            (self.other, Path("../repo/./.agent-skills/../.agent-skills"), self.artifacts),
        ]
        for cwd, root, artifacts in modes:
            with self.subTest(cwd=cwd, root=root), working_directory(cwd):
                rows = link_targets.scan(root, artifacts)
                self.assertEqual(len(rows), len(expected))
                self.assertEqual({row["target"]: row["status"] for row in rows}, expected)
                for row in rows:
                    self.assertEqual(set(row), {"file", "line", "rule", "target", "resolved", "status"})
                    relative = Path(row["file"]).resolve().relative_to(self.root)
                    self.assertEqual(row["file"], (root / relative).as_posix())
                semantic = [{key: value for key, value in row.items() if key != "file"} for row in rows]
                if baseline is None:
                    baseline = semantic
                self.assertEqual(semantic, baseline)
                self.assertEqual(link_targets.validate_link_targets(root, artifacts),
                                 [row for row in rows if row["status"] == "broken"])
        with working_directory(self.repo):
            self.assertEqual(link_targets.scan(), link_targets.scan(Path(".agent-skills"), Path(".frontmatter")))

    def test_logical_namespace_uses_scan_root_not_its_physical_name(self):
        self.policy_fixture()
        renamed = self.repo / "custom-skill-tree"
        self.root.rename(renamed)
        rows = link_targets.scan(renamed, self.artifacts)
        statuses = {row["target"]: row["status"] for row in rows}
        self.assertEqual(statuses["line-example.md"], "excluded:explicit")
        self.assertEqual(statuses["vendor-example.md"], "excluded:vendored")
        self.assertEqual(statuses["later-example.md"], "excluded:deferred")
        self.assertEqual(statuses["missing.md"], "broken")

    def test_policy_precedence_stays_explicit_then_vendored_then_deferred(self):
        self.document("later/SKILL.md", "[one](one.md)\n[two](two.md)\n", True)
        self.ledger(link_targets.EXCLUSIONS, [".agent-skills/later/SKILL.md:5"])
        self.ledger(link_targets.VENDORED, [".agent-skills/later"])
        self.ledger(link_targets.DEFERRED, ["later"])
        self.assertEqual([row["status"] for row in link_targets.scan(self.root, self.artifacts)],
                         ["excluded:explicit", "excluded:vendored"])

    def test_real_links_rules_and_shapes_remain_detectable(self):
        self.document("demo/README.md", "[ok](docs.md#heading)\n![image](image.png)\n"
                      "[ref]: missing-ref.md\n`../missing-code.md`\n[missing](missing.md)\n"
                      "[external](https://example.invalid/a)\n[anchor](#heading)\n"
                      "[home](~/absent.md)\n[root](.agent-skills/demo/absent.md)\n"
                      "[template]({slug}/missing.md)\n")
        self.document("demo/docs.md", "# Heading\n")
        (self.root / "demo/image.png").write_bytes(b"fixture")
        rows = link_targets.scan(self.root, self.artifacts)
        self.assertEqual([(row["target"], row["rule"], row["status"], row["line"]) for row in rows], [
            ("docs.md", "7a", "ok", 1),
            ("image.png", "7a", "ok", 2),
            ("missing-ref.md", "8", "broken", 3),
            ("../missing-code.md", "7b", "broken", 4),
            ("missing.md", "7a", "broken", 5),
        ])

    def test_fences_comments_and_frontmatter_preserve_absolute_line_offsets(self):
        body = ("[ok](docs.md)\n<!-- comment\n[hidden](comment.md)\n-->\n"
                "````markdown\n[hidden](fenced.md)\n```\n[hidden](still-fenced.md)\n````\n"
                "~~~text\n[hidden](tilde.md)\n~~~\n"
                "[real](missing.md)\n<!-- hidden -->[ref]: reference.md\n")
        self.document("demo/SKILL.md", body, True)
        self.document("demo/docs.md", "# Existing\n")
        rows = link_targets.scan(self.root, self.artifacts)
        self.assertEqual([(row["target"], row["line"], row["status"]) for row in rows], [
            ("docs.md", 5, "ok"), ("missing.md", 17, "broken"), ("reference.md", 18, "broken"),
        ])

    def test_markdown_examples_inside_inline_code_are_not_rule_7a_links(self):
        self.document("demo/README.md", "`[1] [Source name](URL)`\n"
                      "`![example](example.png)` [real](missing.md)\n"
                      "[`code label`](label-missing.md)\n"
                      "`../missing-code.md`\n"
                      "`[example](../relative-example.md)`\n"
                      "[ok](docs.md) and `[example](URL)`\n")
        self.document("demo/docs.md", "# Existing\n")
        rows = link_targets.scan(self.root, self.artifacts)
        self.assertEqual([(row["target"], row["rule"], row["line"]) for row in rows], [
            ("missing.md", "7a", 2), ("label-missing.md", "7a", 3),
            ("../missing-code.md", "7b", 4), ("docs.md", "7a", 6),
        ])
        self.assertEqual(rows[-1]["status"], "ok")

    def test_escaped_backticks_and_unclosed_code_do_not_hide_real_links(self):
        self.document("demo/README.md", r"\`[real](escaped.md)\`" + "\n"
                      + r"\\`[example](URL)`" + "\n"
                      + "`[real](unclosed.md)\n")
        self.assertEqual([(row["target"], row["status"]) for row in link_targets.scan(self.root, self.artifacts)],
                         [("escaped.md", "broken"), ("unclosed.md", "broken")])

    def test_mixed_backtick_lengths_do_not_hide_links_after_code(self):
        self.document("demo/README.md", "``literal ` [example](URL)`` [real](missing.md) `unclosed\n")
        self.assertEqual([(row["target"], row["rule"], row["status"]) for row in link_targets.scan(self.root, self.artifacts)],
                         [("missing.md", "7a", "broken")])

    def test_multiline_inline_code_ignores_examples_but_keeps_surrounding_links(self):
        self.document("demo/SKILL.md", "[before](before.md) start `\n"
                      "[example](example.md)\n"
                      "end ` [after](after.md)\n[following](following.md)\n", True)
        self.assertEqual([(row["target"], row["line"], row["status"]) for row in link_targets.scan(self.root, self.artifacts)], [
            ("before.md", 5, "broken"), ("after.md", 7, "broken"), ("following.md", 8, "broken"),
        ])

    def test_multiline_bare_delimiters_match_the_reported_counterexample(self):
        self.document("demo/README.md", "`\n[example](missing.md)\n`\n[real](real.md)\n")
        self.assertEqual([(row["target"], row["line"]) for row in link_targets.scan(self.root, self.artifacts)],
                         [("real.md", 4)])

    def test_multiline_delimiters_on_block_lines_do_not_swallow_real_links(self):
        bodies = [
            "# Heading `\n[real](real.md)\nend `\n",
            "start `\n[real](real.md)\n# Heading `\n",
            "- list `\n[real](real.md)\nend `\n",
            "start `\n[real](real.md)\n> quote `\n",
        ]
        for body in bodies:
            with self.subTest(body=body):
                self.document("demo/README.md", body)
                self.assertEqual([(row["target"], row["line"]) for row in link_targets.scan(self.root, self.artifacts)],
                                 [("real.md", 2)])

    def test_multiline_mixed_backticks_preserve_rule_7b_and_real_links(self):
        self.document("demo/README.md", "start ``\n"
                      "[example](example.md) and `../still-7b.md`\n"
                      "end `` [real](real.md)\n")
        self.assertEqual([(row["target"], row["rule"], row["line"]) for row in link_targets.scan(self.root, self.artifacts)], [
            ("../still-7b.md", "7b", 2), ("real.md", "7a", 3),
        ])

    def test_multiline_unclosed_or_mismatched_runs_do_not_hide_links(self):
        for ending in ("", "end `", "end ``` trailing"):
            with self.subTest(ending=ending):
                self.document("demo/README.md", "start ``\n[real](real.md)\n" + ending + "\n")
                self.assertEqual([(row["target"], row["line"]) for row in link_targets.scan(self.root, self.artifacts)],
                                 [("real.md", 2)])

    def test_multiline_backtick_escape_rules(self):
        cases = [
            (r"start \`", "end `", ["real.md"]),
            (r"start \\`", "end `", []),
            ("start `", r"end \`", []),
        ]
        for opening, closing, expected in cases:
            with self.subTest(opening=opening, closing=closing):
                self.document("demo/README.md", opening + "\n[real](real.md)\n" + closing + "\n")
                self.assertEqual([row["target"] for row in link_targets.scan(self.root, self.artifacts)], expected)

    def test_multiline_code_never_crosses_blank_or_new_block_boundaries(self):
        boundaries = [
            "", "   ", "# Heading", "Heading\n======", "---", "***", "___",
            "- list item", "+ list item", "* list item", "1. list item", "2) list item",
            "> blockquote", "    indented code", "\tindented code", "| table | row |",
            "[reference]: reference.md", "[reference]:", "<div>HTML block</div>", "hard break  ", "hard break\\",
        ]
        for boundary in boundaries:
            with self.subTest(boundary=boundary):
                body = "start `\n[before](before.md)\n" + boundary + "\n[after](after.md)\nend `\n"
                self.document("demo/README.md", body)
                rows = link_targets.scan(self.root, self.artifacts)
                self.assertEqual([(row["target"], row["status"]) for row in rows if row["rule"] == "7a"],
                                 [("before.md", "broken"), ("after.md", "broken")])

    def test_multiline_code_never_bridges_removed_fences_or_html(self):
        boundaries = [
            "~~~text\nhidden\n~~~", "```text\nhidden\n```",
            "<!-- comment -->", "<!-- comment\ncontinued\n-->", "text <!-- comment --> remainder",
        ]
        for boundary in boundaries:
            with self.subTest(boundary=boundary):
                body = "start `\n[before](before.md)\n" + boundary + "\n[after](after.md)\nend `\n"
                self.document("demo/SKILL.md", body, True)
                rows = link_targets.scan(self.root, self.artifacts)
                after_line = 8 + boundary.count("\n")
                self.assertEqual([(row["target"], row["line"], row["status"]) for row in rows], [
                    ("before.md", 6, "broken"), ("after.md", after_line, "broken"),
                ])

    def test_line_exclusions_apply_to_reference_and_inline_path_rules(self):
        self.document("demo/README.md", "[ref]: reference.md\n`../example.md`\n`../real.md`\n")
        self.ledger(link_targets.EXCLUSIONS, [
            ".agent-skills/demo/README.md:1",
            ".agent-skills/demo/README.md:2",
        ])
        self.assertEqual([(row["rule"], row["status"]) for row in link_targets.scan(self.root, self.artifacts)], [
            ("8", "excluded:explicit"), ("7b", "excluded:explicit"), ("7b", "broken"),
        ])

    def test_qualified_exclusion_only_matches_its_rule_and_target(self):
        self.document("demo/README.md", "`../example.md` [same](../example.md) [real](missing.md)\n")
        self.ledger(link_targets.EXCLUSIONS, [".agent-skills/demo/README.md:1\t7b\t../example.md"])
        self.assertEqual([(row["rule"], row["target"], row["status"]) for row in link_targets.scan(self.root, self.artifacts)], [
            ("7a", "../example.md", "broken"), ("7a", "missing.md", "broken"),
            ("7b", "../example.md", "excluded:explicit"),
        ])

    def test_legacy_line_exclusion_fails_closed_for_multiple_candidates(self):
        self.document("demo/README.md", "`../example.md` [real](missing.md)\n")
        self.ledger(link_targets.EXCLUSIONS, [".agent-skills/demo/README.md:1"])
        self.assertEqual([(row["target"], row["status"]) for row in link_targets.scan(self.root, self.artifacts)], [
            ("missing.md", "broken"), ("../example.md", "broken"),
        ])

    def test_qualified_exclusion_does_not_hide_duplicate_normalized_targets(self):
        self.document("demo/README.md", "`../same.md#one` `../same.md#two`\n")
        self.ledger(link_targets.EXCLUSIONS, [".agent-skills/demo/README.md:1\t7b\t../same.md"])
        self.assertEqual([(row["target"], row["status"]) for row in link_targets.scan(self.root, self.artifacts)], [
            ("../same.md", "broken"), ("../same.md", "broken"),
        ])

    def test_backslash_before_code_closer_does_not_hide_following_real_link(self):
        self.document("demo/README.md", r"`[example](ignored.md)\` [real](missing.md)`" + "\n")
        self.assertEqual([(row["target"], row["status"]) for row in link_targets.scan(self.root, self.artifacts)],
                         [("missing.md", "broken")])

    def test_raw_target_exclusion_remains_global_but_does_not_match_prefixes(self):
        self.document("first/README.md", "[example](example.md)\n[real](example.md-extra)\n")
        self.document("second/README.md", "[example](example.md)\n")
        self.ledger(link_targets.EXCLUSIONS, ["example.md"])
        self.assertEqual([row["status"] for row in link_targets.scan(self.root, self.artifacts)],
                         ["excluded:explicit", "broken", "excluded:explicit"])

    def test_missing_ledgers_do_not_hide_real_broken_links(self):
        self.document("demo/README.md", "[real](missing.md)\n")
        self.assertEqual(link_targets.scan(self.root, self.artifacts)[0]["status"], "broken")

    def test_census_retains_existing_columns_and_reported_file_path(self):
        self.document("demo/README.md", "[real](missing.md)\n")
        rows = link_targets.scan(self.root, self.artifacts)
        output = link_targets.write_census(rows, self.artifacts)
        self.assertEqual(output, self.artifacts / link_targets.CENSUS)
        self.assertEqual(output.read_text(encoding="utf-8").splitlines(), [
            "file\tline\trule\ttarget\tresolved\tstatus",
            "\t".join(str(rows[0][key]) for key in ("file", "line", "rule", "target", "resolved", "status")),
        ])


if __name__ == "__main__":
    unittest.main()
