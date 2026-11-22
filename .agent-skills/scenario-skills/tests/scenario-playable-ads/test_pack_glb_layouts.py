"""pack_glb.py on buffer layouts and node transforms the textured test box does not use."""

import json
import shutil
import struct
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import playable  # noqa: E402
from test_pack_glb import read_mesh  # noqa: E402

PACK = playable.SCRIPTS / "pack_glb.py"
UV = np.array([[0, 65535], [65535, 0], [32768, 16384], [1000, 2000],
               [4000, 8000], [12345, 54321], [65535, 65535], [0, 0]], np.uint16)


def interleaved_glb(path, size=(1.0, 2.0, 4.0)):
    """An untextured box without indices, positions and normalized uint16 UVs interleaved in one buffer view,
    in two primitives, its mesh node turned 90 degrees about y by a matrix under a parent scaled 2x on x."""
    sx, sy, sz = (s / 2 for s in size)
    pos = np.array([(x, y, z) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)], np.float32) + 3
    binary = b"".join(p.tobytes() + u.tobytes() for p, u in zip(pos, UV))
    attrs = {"POSITION": 0, "TEXCOORD_0": 1}
    gltf = {
        "asset": {"version": "2.0"},
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(binary), "byteStride": 16}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 8, "type": "VEC3"},
            {"bufferView": 0, "byteOffset": 12, "componentType": 5123, "normalized": True, "count": 8, "type": "VEC2"},
        ],
        "meshes": [{"primitives": [{"attributes": attrs}, {"attributes": attrs}]}],
        # column-major: x' = z, z' = -x
        "nodes": [{"mesh": 0, "matrix": [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]},
                  {"children": [0], "scale": [2, 1, 1]}],
        "scenes": [{"nodes": [1]}],
    }
    js = json.dumps(gltf).encode()
    js += b" " * (-len(js) % 4)
    body = struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binary), 0x004E4942) + binary
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body)


class InterleavedGlbTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.project = Path(tempfile.mkdtemp())
        interleaved_glb(cls.project / "assets" / "raw" / "crate.glb")
        cls.out = playable.run(PACK, cls.project, "--glb", "assets/raw/crate.glb", "--name", "CRATE",
                               "--preview", "analysis/crate_axes.png").stdout
        cls.mesh, cls.pos, cls.idx, cls.uv = read_mesh(cls.project / "src" / "crate_mesh.js", "CRATE")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.project)

    def test_warns_that_only_the_first_primitive_is_packed(self):
        self.assertIn("warning: 1 meshes / 2 primitives; packing only the first", self.out)

    def test_child_matrix_then_parent_scale_are_baked(self):
        # 1 x 2 x 4 turned about y is 4 x 2 x 1, then 8 x 2 x 1 after the parent's scale
        np.testing.assert_allclose(self.pos.max(0), [1.0, 0.25, 0.125], atol=2e-3)
        np.testing.assert_allclose(self.pos.min(0), [-1.0, -0.25, -0.125], atol=2e-3)

    def test_interleaved_normalized_uvs_survive_exactly(self):
        np.testing.assert_array_equal(np.round(self.uv * 65535).astype(np.uint16), UV)

    def test_a_primitive_without_indices_gets_sequential_ones(self):
        self.assertFalse(self.mesh["idx32"])
        np.testing.assert_array_equal(self.idx, np.arange(8))

    def test_no_texture_means_no_jpeg_and_a_gray_preview(self):
        self.assertIn("no embedded texture", self.out)
        self.assertFalse((self.project / "assets" / "raw" / "crate_tex.jpg").exists())
        with Image.open(self.project / "analysis" / "crate_axes.png") as im:
            colors = {c for _, c in im.convert("RGB").getcolors(900 * 300)}
        self.assertEqual(colors, {(0, 0, 0), (220, 220, 220)})


if __name__ == "__main__":
    unittest.main()
