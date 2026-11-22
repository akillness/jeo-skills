"""Checks bx_export.glb_summary() on a GLB built byte by byte, and compare() on
inspections written by hand.

Neither needs Blender, so this suite runs in the repository's script-tests job.
"""

import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parents[1] / "skills" / "dcc" / "blender" / "scenario-blender-export" / "scripts"))

import bx_export  # noqa: E402


def glb(doc, binary=b""):
    """A GLB with the given JSON chunk and an optional BIN chunk."""
    text = json.dumps(doc).encode()
    text += b" " * (-len(text) % 4)
    body = struct.pack("<I4s", len(text), b"JSON") + text
    if binary:
        binary += b"\0" * (-len(binary) % 4)
        body += struct.pack("<I4s", len(binary), b"BIN\0") + binary
    return struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body


DOC = {
    "asset": {"version": "2.0"},
    "extensionsUsed": ["EXT_meshopt_compression", "EXT_texture_webp"],
    "extensionsRequired": ["EXT_meshopt_compression"],
    "nodes": [{"mesh": 0}, {"name": "Hips"}, {"name": "Spine"}],
    "meshes": [{"name": "Body", "extras": {"targetNames": ["jawOpen", "eyeBlinkLeft"]},
                "primitives": [{"attributes": {"POSITION": 0}, "indices": 1},
                               {"attributes": {"POSITION": 0}, "mode": 1}]}],
    "accessors": [{"count": 4, "type": "VEC3", "componentType": 5126},
                  {"count": 6, "type": "SCALAR", "componentType": 5123}],
    "skins": [{"joints": [1, 2]}],
    "animations": [{"name": "Wave", "channels": [], "samplers": []}],
    "materials": [{}],
    "images": [{"mimeType": "image/webp"}, {"uri": "base.png"}],
}


class GlbSummary(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="bx_glb_test_"))

    def write(self, data):
        path = self.tmp / "model.glb"
        path.write_bytes(data)
        return str(path)

    def test_reads_the_json_chunk(self):
        r = bx_export.glb_summary(self.write(glb(DOC, b"\x01\x02\x03")))
        self.assertEqual(r["extensions_required"], ["EXT_meshopt_compression"])
        self.assertIn("EXT_texture_webp", r["extensions_used"])
        self.assertEqual(r["triangles"], 2)  # the line primitive is not counted
        self.assertEqual(r["morph_targets"], {"Body": ["jawOpen", "eyeBlinkLeft"]})
        self.assertEqual(r["skins"], [2])
        self.assertEqual(r["animations"], ["Wave"])
        self.assertEqual(r["images"], ["image/webp", ".png"])
        self.assertEqual(r["nodes"], 3)

    def test_rejects_other_files(self):
        with self.assertRaises(ValueError):
            bx_export.glb_summary(self.write(b"Kaydara FBX Binary  \0" + b"\0" * 16))

    def test_presets_name_their_extension(self):
        for name, (ext, op, _) in bx_export.PRESETS.items():
            with self.subTest(preset=name):
                self.assertTrue(ext.startswith("."))
                self.assertIn(op.split(".")[0], ("export_scene", "wm"))
                self.assertIn(name, bx_export.CARRIES)



RIG = {"type": "ARMATURE", "scale": [1.0, 1.0, 1.0], "bones": 5, "deform_bones": 4, "roots": ["Root"]}


class Compare(unittest.TestCase):
    def scene(self, actions, **rig):
        return {"objects": {"Rig": dict(RIG, **rig)}, "actions": actions}

    def test_a_lost_clip_is_named(self):
        diffs = bx_export.compare(self.scene(["Idle", "Walk"]), self.scene(["Rig|Rig|Walk"], bones=4),
                                  deform_only=True)
        self.assertEqual(diffs, ["actions lost: ['Idle']"])

    def test_a_scene_take_is_counted(self):
        before, after = self.scene(["Walk"]), self.scene(["Rig|Scene"], bones=4)
        self.assertEqual(bx_export.compare(before, after, deform_only=True, clip_names=False), [])

    def test_deform_only_expects_the_deforming_bones(self):
        before, after = self.scene([]), self.scene([], bones=4)
        self.assertEqual(bx_export.compare(before, after, deform_only=True), [])
        self.assertEqual(bx_export.compare(before, after), ["Rig: 5 bones became 4"])

    def test_a_second_root_is_a_difference(self):
        diffs = bx_export.compare(self.scene([]), self.scene([], roots=["Root", "Ctrl_Look"]))
        self.assertEqual(diffs, ["Rig: 2 root bones ['Root', 'Ctrl_Look'], engines want one"])


if __name__ == "__main__":
    unittest.main()
