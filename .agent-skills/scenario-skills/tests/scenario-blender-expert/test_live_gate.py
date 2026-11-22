"""Runs bx_audit.deliverable() in a real Blender against fixtures with planted defects.

gate_cases.py builds every fixture in one Blender run and writes the verdicts to JSON;
these tests read them. Without Blender (the repository's script-tests job) every test
skips; .github/workflows/blender.yml installs Blender and runs them.
"""

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from live_blender import BLENDER, SKIP

HERE = Path(__file__).parent
SCRIPTS = HERE.parents[1] / "skills" / "dcc" / "blender" / "scenario-blender-expert" / "scripts"


@unittest.skipIf(SKIP, SKIP)
class DeliveryGate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp = tempfile.mkdtemp(prefix="bx_gate_test_")
        out = Path(tmp) / "cases.json"
        run = subprocess.run(
            [BLENDER, "-b", "--factory-startup", "--python-exit-code", "1",
             "-P", str(HERE / "gate_cases.py"), "--", str(SCRIPTS), str(out), tmp],
            capture_output=True, text=True, timeout=600,
        )
        if run.returncode != 0:
            raise AssertionError(run.stdout[-3000:] + run.stderr[-3000:])
        cls.cases = json.loads(out.read_text())
        shutil.rmtree(tmp, ignore_errors=True)

    def verdict(self, name):
        return self.cases[name]

    def test_planted_defects_are_exactly_the_errors(self):
        r = self.verdict("crate_defects")
        self.assertFalse(r["pass"])
        self.assertEqual(len(r["errors"]), 4, r["errors"])
        text = " | ".join(r["errors"])
        for needle in ("Lid: unapplied scale", "Bracket: 1 closed part with normals pointing inward",
                       "Body <-> Label", "z-fighting", "Handle: floating"):
            self.assertIn(needle, text)
        self.assertEqual(r["warnings"], [])

    def test_documented_fixes_clear_the_gate(self):
        r = self.verdict("crate_fixed")
        self.assertTrue(r["pass"], r["errors"])
        self.assertEqual(r["warnings"], [])

    def test_clean_crate_passes_every_profile(self):
        for name in ("crate_clean", "crate_clean_render", "crate_clean_print", "crate_clean_roblox"):
            with self.subTest(case=name):
                r = self.verdict(name)
                self.assertTrue(r["pass"], r["errors"])
                self.assertEqual(r["warnings"], [])

    def test_glb_round_trip_welds_split_seams(self):
        r = self.verdict("crate_glb")
        self.assertTrue(r["pass"], r["errors"])
        self.assertEqual(r["warnings"], [])
        self.assertEqual(sum(o["parts"] for o in r["per_object"].values()), 5)

    def test_fragment_inside_one_mesh_floats(self):
        r = self.verdict("fragment")
        self.assertEqual(r["errors"], ["Hull: 1 floating fragment (50% of its faces), nearest 0.775 from the rest"])

    def test_small_gap_warns_but_fails_print(self):
        r = self.verdict("near_gap_game")
        self.assertTrue(r["pass"], r["errors"])
        self.assertEqual(r["warnings"], ["Handle: not touching, 0.005 from Body"])
        r = self.verdict("near_gap_print")
        self.assertEqual(r["errors"], ["Handle: not touching, 0.005 from Body"])

    def test_enclosed_part_warns_without_floating(self):
        r = self.verdict("enclosed")
        self.assertTrue(r["pass"], r["errors"])
        self.assertEqual(len(r["warnings"]), 1)
        self.assertIn("Core: 1 part enclosed", r["warnings"][0])

    def test_parts_crossing_face_to_face_touch(self):
        r = self.verdict("crossing")
        self.assertTrue(r["pass"], r["errors"])
        self.assertEqual(r["warnings"], [])

    def test_part_beside_a_thin_shell_is_not_enclosed(self):
        r = self.verdict("beside_thin_shell")
        self.assertEqual(r["errors"], ["Plate: floating, 0.0985 from Fender"])
        self.assertEqual(r["warnings"], [])

    def test_negative_scale_fails(self):
        r = self.verdict("negative_scale")
        self.assertEqual(len(r["errors"]), 1)
        self.assertIn("Mirror: negative scale", r["errors"][0])

    def test_duplicate_face_fails(self):
        r = self.verdict("double_faces")
        self.assertIn("Doubled: 1 duplicate face", r["errors"])

    def test_face_pointing_inward_fails(self):
        r = self.verdict("flipped_face")
        self.assertIn("Flipped: 1 face pointing into the part (16.67% of its surface), at edges of opposite winding",
                      r["errors"])

    def test_sliver_hole_warns_for_engines_and_fails_print(self):
        r = self.verdict("sliver_game")
        self.assertTrue(r["pass"], r["errors"])
        self.assertTrue(any("sliver holes" in w for w in r["warnings"]), r["warnings"])
        self.assertEqual(len(r["per_object"]["Sliver"]["inward_faces_at"]), 1)
        self.assertFalse(self.verdict("sliver_print")["pass"])

    def test_fold_at_a_seam_only_warns(self):
        r = self.verdict("folded")
        self.assertTrue(r["pass"], r["errors"])
        self.assertTrue(any("fold over at a seam" in w for w in r["warnings"]), r["warnings"])

    def test_open_mesh_fails_print_only(self):
        self.assertTrue(self.verdict("open_game")["pass"])
        r = self.verdict("open_print")
        self.assertFalse(r["pass"])
        self.assertIn("Open: 1 open border (4 edges)", r["errors"])

    def test_roblox_triangle_limit(self):
        self.assertTrue(self.verdict("dense_game")["pass"])
        r = self.verdict("dense_roblox")
        self.assertEqual(r["errors"], ["Dense: 20480 triangles, over the 20000 per-mesh limit"])

    def test_parent_scale_names_the_parent(self):
        r = self.cases["parent_scale"]
        self.assertFalse(r["pass"])
        self.assertEqual(len(r["errors"]), 1)
        self.assertIn("unapplied scale [2.0, 2.0, 2.0] from its parent Root", r["errors"][0])
        self.assertTrue(self.cases["parent_scale_applied"]["pass"])

    def test_uvs_read_from_the_evaluated_mesh(self):
        self.assertTrue(self.cases["nodes_uv"]["pass"])
        self.assertEqual(self.cases["nodes_uv"]["errors"], [])
        self.assertTrue(any("no UV map" in e for e in self.cases["nodes_uv_base"]["errors"]))

    def test_missing_uv_fails_only_under_a_texture(self):
        r = self.verdict("bare")
        self.assertTrue(r["pass"], r["errors"])
        self.assertEqual(len(r["warnings"]), 2, r["warnings"])
        self.assertIn("Bare: no material or an empty material slot", r["warnings"])
        r = self.verdict("textured_no_uv")
        self.assertEqual(r["errors"], ["Painted: no UV map, and a material samples an image texture"])

    def test_texture_inside_a_node_group_needs_uvs(self):
        r = self.verdict("grouped_texture_no_uv")
        self.assertEqual(r["errors"], ["Grouped: no UV map, and a material samples an image texture"])

    def test_mesh_with_no_faces_fails_every_profile(self):
        for name in ("no_faces", "no_faces_render"):
            with self.subTest(case=name):
                r = self.verdict(name)
                self.assertEqual(r["errors"], ["Void: no faces after modifiers; nothing would export"])
                self.assertEqual(r["warnings"], [])

    def test_modifier_that_empties_the_mesh_fails(self):
        r = self.verdict("emptied_by_modifier")
        self.assertEqual(r["errors"], ["Welded: no faces after modifiers; nothing would export"])
        self.assertTrue(self.verdict("emptied_base")["pass"])
        r = self.verdict("emptied_beside_a_part")
        self.assertEqual(r["errors"], ["Welded: no faces after modifiers; nothing would export"])
        self.assertEqual(r["per_object"]["Base"]["errors"], [])

    def test_mesh_with_no_faces_skips_the_scale_checks(self):
        for name in ("Mirrored", "Scaled"):
            with self.subTest(case=name):
                r = self.verdict("emptied_" + name.lower())
                self.assertEqual(r["errors"], [f"{name}: no faces after modifiers; nothing would export"])
                self.assertEqual(r["warnings"], [])

    def test_part_smaller_than_the_weld_still_has_faces(self):
        r = self.verdict("speck_under_the_weld")
        self.assertFalse(any("no faces" in e for e in r["errors"]), r["errors"])

    def test_pieces_on_the_ground_stand_together(self):
        self.assertEqual(self.verdict("stones")["errors"], ["StoneB: floating, 1.65 from StoneA"])
        r = self.verdict("stones_ground")
        self.assertTrue(r["pass"], r["errors"])
        self.assertEqual(r["warnings"], [])

    def test_part_off_the_ground_floats_however_large(self):
        self.assertEqual(self.verdict("board_ground")["errors"], ["Board: floating, 0.863 from StoneA"])

    def test_part_under_the_ground_floats(self):
        r = self.verdict("stray_ground")
        self.assertEqual(len(r["errors"]), 1, r["errors"])
        self.assertTrue(r["errors"][0].startswith("Stray: floating"), r["errors"])

    def test_ground_no_part_reaches_warns(self):
        r = self.verdict("stones_ground_missed")
        self.assertIn("no part reaches the ground at z = 5.0", r["warnings"])
        self.assertEqual(r["errors"], ["StoneB: floating, 1.65 from StoneA"])

    def test_ground_check_covers_a_single_part(self):
        self.assertEqual(self.verdict("one_part_ground")["warnings"], [])
        self.assertIn("no part reaches the ground at z = 5.0", self.verdict("one_part_ground_missed")["warnings"])

    def test_cli_passes_the_ground(self):
        self.assertEqual(self.verdict("cli_ground"), {"without": 2, "with": 0})


if __name__ == "__main__":
    unittest.main()
