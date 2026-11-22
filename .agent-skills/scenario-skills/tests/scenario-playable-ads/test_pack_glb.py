import base64
import io
import json
import math
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

PACK = playable.SCRIPTS / "pack_glb.py"


def box_glb(path, size=(2.0, 4.0, 1.0), offset=(5.0, -3.0, 2.0), rotation_x_deg=90.0):
    """A textured box, off center and nested under a rotated node, as image-to-3D GLBs often come."""
    sx, sy, sz = (s / 2 for s in size)
    corners = [(x, y, z) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
    pos = np.array(corners, np.float32) + np.array(offset, np.float32)
    uv = np.array([[i / 7, 1 - i / 7] for i in range(8)], np.float32)
    faces = [(0, 1, 3), (0, 3, 2), (4, 6, 7), (4, 7, 5), (0, 4, 5), (0, 5, 1),
             (2, 3, 7), (2, 7, 6), (0, 2, 6), (0, 6, 4), (1, 5, 7), (1, 7, 3)]
    idx = np.array(faces, np.uint16).reshape(-1)
    png = io.BytesIO()
    Image.new("RGB", (64, 64), (200, 40, 40)).save(png, "PNG")
    blobs = [pos.tobytes(), uv.tobytes(), idx.tobytes(), png.getvalue()]
    views, binary = [], b""
    for b in blobs:
        views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(b)})
        binary += b + b"\0" * (-len(b) % 4)
    half = math.radians(rotation_x_deg) / 2
    gltf = {
        "asset": {"version": "2.0"},
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": views,
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 8, "type": "VEC3"},
            {"bufferView": 1, "componentType": 5126, "count": 8, "type": "VEC2"},
            {"bufferView": 2, "componentType": 5123, "count": len(idx), "type": "SCALAR"},
        ],
        "images": [{"bufferView": 3, "mimeType": "image/png"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "TEXCOORD_0": 1}, "indices": 2}]}],
        "nodes": [{"mesh": 0, "rotation": [math.sin(half), 0, 0, math.cos(half)]}],
        "scenes": [{"nodes": [0]}],
    }
    js = json.dumps(gltf).encode()
    js += b" " * (-len(js) % 4)
    body = struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binary), 0x004E4942) + binary
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body)


def read_mesh(js_path, name):
    text = js_path.read_text()
    prefix = f"window.{name} = "
    line = next(ln for ln in text.splitlines() if ln.startswith(prefix))
    mesh = json.loads(line[len(prefix):].rstrip(";"))
    pos = np.frombuffer(base64.b64decode(mesh["pos"]), np.int16).reshape(-1, 3) / 32767
    idx = np.frombuffer(base64.b64decode(mesh["idx"]), np.uint32 if mesh["idx32"] else np.uint16)
    uv = np.frombuffer(base64.b64decode(mesh["uv"]), np.uint16).reshape(-1, 2) / 65535
    return mesh, pos, idx, uv


class PackGlbTests(unittest.TestCase):
    def setUp(self):
        self.project = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.project)
        box_glb(self.project / "assets" / "raw" / "pod.glb")

    def pack(self, *extra):
        return playable.run(PACK, self.project, "--glb", "assets/raw/pod.glb", "--name", "POD_MESH", *extra)

    def test_bakes_the_node_rotation_recenters_and_scales_to_radius_one(self):
        self.pack()
        mesh, pos, idx, uv = read_mesh(self.project / "src" / "pod_mesh.js", "POD_MESH")
        self.assertFalse(mesh["idx32"])
        self.assertEqual(len(idx), 36)
        self.assertEqual(len(pos), 8)
        np.testing.assert_allclose((pos.max(0) + pos.min(0)) / 2, 0, atol=1e-3)
        # a 2 x 4 x 1 box turned 90 degrees about x is 2 wide, 1 tall and 4 deep
        np.testing.assert_allclose(pos.max(0), [0.5, 0.25, 1.0], atol=2e-3)
        self.assertLessEqual(uv.max(), 1.0)

    def test_yaw_squares_up_a_rotated_model(self):
        self.pack("--yaw", "90")
        _, pos, _, _ = read_mesh(self.project / "src" / "pod_mesh.js", "POD_MESH")
        np.testing.assert_allclose(pos.max(0), [1.0, 0.25, 0.5], atol=2e-3)

    def test_texture_is_extracted_and_downscaled(self):
        self.pack("--tex-max", "32")
        self.assertEqual(playable.image_size(self.project / "assets" / "raw" / "pod_tex.jpg"), (32, 32))

    def test_preview_shows_three_axis_views(self):
        self.pack("--preview", "analysis/pod_axes.png")
        self.assertEqual(playable.image_size(self.project / "analysis" / "pod_axes.png"), (900, 300))

    def test_refuses_a_file_that_is_not_binary_gltf(self):
        (self.project / "assets" / "raw" / "pod.glb").write_bytes(b"not a glb at all")
        out = playable.run(PACK, self.project, "--glb", "assets/raw/pod.glb", check=False)
        self.assertNotEqual(out.returncode, 0)
        self.assertIn("not a binary glTF", out.stderr)


if __name__ == "__main__":
    unittest.main()
