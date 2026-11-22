"""Runs every bx_export preset in a real Blender and re-imports the files.

export_cases.py builds a crate and a skinned, animated character with a shape key,
exports them with each preset, re-imports every file and writes JSON; these tests read
it. Without Blender every test skips; .github/workflows/blender.yml installs Blender.
"""

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from live_blender import BLENDER, SKIP

HERE = Path(__file__).parent
SCRIPTS = HERE.parents[1] / "skills" / "dcc" / "blender" / "scenario-blender-export" / "scripts"


@unittest.skipIf(SKIP, SKIP)
class Presets(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp = tempfile.mkdtemp(prefix="bx_export_test_")
        out = Path(tmp) / "cases.json"
        run = subprocess.run(
            [BLENDER, "-b", "--factory-startup", "--python-exit-code", "1",
             "-P", str(HERE / "export_cases.py"), "--", str(SCRIPTS), str(out), tmp],
            capture_output=True, text=True, timeout=900,
        )
        if run.returncode != 0:
            raise AssertionError(run.stdout[-3000:] + run.stderr[-3000:])
        cls.c = json.loads(out.read_text())
        shutil.rmtree(tmp, ignore_errors=True)

    def test_every_preset_round_trips(self):
        self.assertEqual(len(self.c["roundtrip"]), 11)
        for preset, r in self.c["roundtrip"].items():
            with self.subTest(preset=preset):
                self.assertEqual(r["diffs"], [])

    def test_rigged_presets_keep_bones_morphs_and_unit_scale(self):
        for preset in ("unity_skeletal", "unreal_skeletal", "roblox", "godot", "web"):
            with self.subTest(preset=preset):
                objs = self.c["roundtrip"][preset]["after"]["objects"]
                self.assertEqual(objs["Rig"]["bones"], 3)
                self.assertEqual(objs["Rig"]["scale"], [1.0, 1.0, 1.0])
                self.assertEqual(objs["Body"]["shape_keys"], ["jawOpen"])
                self.assertEqual(objs["Body"]["size"], [0.65, 0.5, 2.0])

    def test_animation_survives_where_the_preset_carries_it(self):
        for preset in ("unity_skeletal", "unreal_skeletal", "godot", "web"):
            with self.subTest(preset=preset):
                self.assertTrue(self.c["roundtrip"][preset]["after"]["actions"])

    def test_print_writes_millimeters(self):
        objs = self.c["roundtrip"]["print"]["after"]["objects"]
        self.assertEqual(sorted(next(iter(objs.values()))["size"]), [600.0, 700.0, 1000.0])

    def test_round_trip_runs_in_a_background_blender(self):
        r = self.c["round_trip_godot"]
        self.assertTrue(r["pass"], r["diffs"])
        self.assertTrue(r["scene_kept"])

    def test_glb_contents(self):
        g = self.c["glb_godot"]
        self.assertEqual(g["morph_targets"], {"Body": ["jawOpen"]})
        self.assertEqual(g["skins"], [3])
        self.assertEqual(g["animations"], ["Wave"])
        self.assertEqual(g["extensions_required"], [])
        w = self.c["glb_web"]
        self.assertIn("EXT_meshopt_compression", w["extensions_used"])
        self.assertLess(w["bytes"], g["bytes"])

    def test_lods_keep_a_parented_mesh_in_place(self):
        r = self.c["lods_parented"]
        self.assertEqual(r["group_parent"], "Base")
        for name, center in r["centers"].items():
            for k in range(3):
                self.assertAlmostEqual(center[k], r["start"][k], places=3, msg=name)
        self.assertIn("skinned", self.c["lods_skinned"])

    def test_roblox_animation_on_request(self):
        self.assertTrue(self.c["roblox_anim"]["pass"], self.c["roblox_anim"]["diffs"])
        self.assertTrue(self.c["roblox_anim"]["actions"])
        self.assertFalse(self.c["roblox_no_anim"]["pass"])
        self.assertTrue(any("action" in d for d in self.c["roblox_no_anim"]["diffs"]))

    def test_lods_use_unity_names(self):
        tris = {k: v["tris"] for k, v in self.c["lods"]["objects"].items()}
        self.assertEqual(sorted(tris), ["Crate_LOD0", "Crate_LOD1", "Crate_LOD2"])
        self.assertGreater(tris["Crate_LOD0"], tris["Crate_LOD1"])
        self.assertGreater(tris["Crate_LOD1"], tris["Crate_LOD2"])
        self.assertEqual(self.c["lods_file"], ["Crate", "Crate_LOD0", "Crate_LOD1", "Crate_LOD2"])

    def test_collision_names(self):
        self.assertEqual(self.c["collision_unreal"]["object"], "UCX_Crate_00")
        self.assertEqual(self.c["collision_godot"]["object"], "Crate-convcolonly")
        # Godot 4.7 builds one convex shape from the box's 8 corners: a box collider.
        self.assertEqual(self.c["collision_godot_box"]["object"], "Crate-convcolonly")
        self.assertEqual(self.c["collision_godot_box"]["faces"], 6)
        self.assertEqual(self.c["collision_godot_mesh"]["object"], "Crate-colonly")
        self.assertIsNone(self.c["collision_unity"])
        self.assertEqual(self.c["ucx_file"], ["Crate", "UCX_Crate_00"])

    def test_usdz_is_a_package(self):
        self.assertTrue(any(m.endswith(".usdc") for m in self.c["usdz_members"]))

    def test_batch_gates_converts_and_checks(self):
        r = self.c["batch"]["files"]["crate.glb"]
        self.assertTrue(r["gate"]["pass"], r["gate"]["errors"])
        self.assertGreater(r["export"], 0)
        self.assertEqual(r["diffs"], [])
        self.assertEqual(r["out"], "crate.glb")

    def test_batch_keeps_inputs_that_share_a_stem(self):
        files = self.c["batch_shared_stem"]["files"]
        self.assertEqual({k: v["out"] for k, v in files.items()},
                         {"crate.fbx": "crate_fbx.glb", "crate.glb": "crate_glb.glb"})
        self.assertEqual(self.c["batch_shared_stem_files"], ["crate_fbx.glb", "crate_glb.glb", "report.json"])

    def test_export_after_a_render_and_a_removed_object(self):
        self.assertGreater(self.c["after_render"], 0)

    def test_fbx_names_packed_images_with_their_extension(self):
        r = self.c["packed_fbx"]
        self.assertTrue(r["relative"], "no texture in the FBX")
        for name in r["relative"]:
            self.assertTrue(name.endswith("Image_0.png"), r["relative"])
        self.assertEqual(r["filepath_after"], "")

    def test_fbx_embeds_an_image_never_saved(self):
        r = self.c["generated_fbx"]
        self.assertEqual(r["packed"], ["baked_albedo"])
        self.assertGreater(r["png_bytes"], 0)
        self.assertEqual((r["source_after"], r["name_after"]), ("GENERATED", "baked_albedo"))
        self.assertTrue(r["node_kept"])
        self.assertEqual(r["images_after"], ["baked_albedo"])

    def test_roblox_leaves_control_bones_out(self):
        r = self.c["roblox_ctrl"]
        self.assertTrue(r["pass"], r["diffs"])
        self.assertEqual(r["roots"], ["Hips"])
        self.assertTrue(any("root bones" in d for d in self.c["roblox_two_roots"]), self.c["roblox_two_roots"])

    def test_round_trip_counts_stored_actions(self):
        self.assertEqual(self.c["roblox_ctrl"]["before_actions"], ["Idle", "Wave"])
        r = self.c["skeletal_ctrl"]
        self.assertTrue(r["pass"], r["diffs"])
        for clip in ("Idle", "Wave"):
            self.assertTrue(any(clip in a for a in r["actions"]), r["actions"])
        r = self.c["skeletal_active_only"]  # one take named for the scene: counted, not named
        self.assertTrue(r["pass"], r["diffs"])

    def test_presets_write_the_documented_settings(self):
        s = self.c["exports"]["unity"]["settings"]
        self.assertEqual(s["apply_scale_options"], "FBX_SCALE_ALL")
        self.assertFalse(s["add_leaf_bones"])
        s = self.c["exports"]["roblox"]["settings"]
        self.assertEqual(s["apply_scale_options"], "FBX_SCALE_UNITS")
        self.assertEqual(s["path_mode"], "COPY")
        self.assertTrue(s["embed_textures"])
        self.assertTrue(s["use_armature_deform_only"])

    def test_web_keeps_meshopt_on_a_blender_that_has_it(self):
        self.assertEqual(self.c["exports"]["web"]["skipped_settings"], [])
        self.assertTrue(self.c["exports"]["web"]["settings"]["export_meshopt_compression_enable"])

    def test_an_optional_setting_the_exporter_lacks_is_skipped_and_reported(self):
        p = self.c["probe"]
        self.assertEqual(p["skipped"], ["no_such_setting"])
        self.assertNotIn("no_such_setting", p["settings"])
        self.assertGreater(p["bytes"], 0)
        self.assertIn("no_such_setting", self.c["probe_override"])

    def test_a_missing_setting_outside_optional_still_raises(self):
        self.assertIn("no_such_setting", self.c["probe_required"])

    def test_round_trip_reports_maps_an_fbx_drops(self):
        self.assertEqual(self.c["maps_gltf_import"], {"M_Crate": ["Base Color", "Metallic", "Roughness"]})
        self.assertEqual(self.c["maps_fbx"], ["Crate: material M_Crate lost its Metallic, Roughness maps"])
        self.assertEqual(self.c["maps_glb"], [])
        self.assertEqual(self.c["maps_fbx_direct"], [])

    def test_extra_maps_carry_the_packed_values(self):
        px = self.c["extra_maps"]
        # metallic 0.75 in RGB, smoothness 1 - 0.25 in alpha; 8-bit PNGs
        for got, want in zip(px["M_Crate_MetallicSmoothness.png"], (0.75, 0.75, 0.75, 0.75)):
            self.assertAlmostEqual(got, want, delta=0.01)
        self.assertAlmostEqual(px["M_Crate_Metallic.png"][0], 0.75, delta=0.01)
        self.assertAlmostEqual(px["M_Crate_Roughness.png"][0], 0.25, delta=0.01)
        self.assertEqual(self.c["extra_maps_png_type"],
                         {"M_Crate_MetallicSmoothness.png": 6, "M_Crate_Metallic.png": 0, "M_Crate_Roughness.png": 0})

    def test_lods_of_a_glb_import_stay_closed(self):
        self.assertGreater(self.c["seam_split_verts"], 64 * 31 + 2)  # the import split the seams
        self.assertEqual(self.c["seam_lods"], {"Sphere_LOD0": 0, "Sphere_LOD1": 0, "Sphere_LOD2": 0})
        self.assertEqual(self.c["seam_meshes"], 3)  # the welded copy is gone

    def test_convex_hull_keeps_to_its_vertex_budget(self):
        h = self.c["seam_hull"]
        self.assertEqual(h["object"], "UCX_Sphere_LOD0_00")
        self.assertEqual(h["verts"], 64)
        self.assertEqual(h["open"], 0)
        self.assertEqual(self.c["collision_unreal"]["verts"], 8)  # a crate's hull is under budget
        for msg in self.c["hull_too_small"]:
            self.assertIn("at least 4", msg)

    def test_lods_keep_both_sides_of_a_double_sided_card(self):
        sides = self.c["card_sides"]
        self.assertEqual(sides["Card_LOD0"], [400, 400])
        up, down = sides["Card_LOD1"]
        self.assertGreater(down, 0.8 * up)

    def test_ground_bakes_transforms_and_sets_the_pivot_on_the_floor(self):
        g = self.c["ground"]
        self.assertIsNone(g["parent"])
        self.assertTrue(g["identity"])
        self.assertAlmostEqual(g["min_z"], 0.0, places=4)
        for v in g["center_xy"]:
            self.assertAlmostEqual(v, 0.0, places=4)
        self.assertAlmostEqual(max(g["result"]["size"][:2]), 0.5, places=3)
        self.assertTrue(g["outward"])  # the mirrored mesh keeps its faces pointing out
        self.assertIn("skinned", self.c["ground_skinned"])


if __name__ == "__main__":
    unittest.main()
