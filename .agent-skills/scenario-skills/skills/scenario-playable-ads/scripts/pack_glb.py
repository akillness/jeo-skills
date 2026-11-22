"""Pack a GLB mesh (for example an image-to-3D result) into a small JS include for a three.js playable.

Usage: python3 pack_glb.py <project_dir> --glb assets/raw/pod.glb [--name POD_MESH] [--out src/pod_mesh.js]
                           [--tex assets/raw/pod_tex.jpg] [--yaw 0] [--tex-max 512] [--preview analysis/pod_axes.png]

Why: a playable must not load files, and the stock GLTFLoader pulls in fetch(). This bakes the node rotations,
recenters the mesh, scales it to radius 1, and writes quantized arrays as base64:
  window.<NAME> = {pos: int16 xyz / 32767, uv: uint16 uv / 65535, idx: uint16 or uint32 indices, idx32: bool}
The base-color texture goes to --tex (downscaled to --tex-max): list it in assets/manifest.json like any image.
Normals are dropped: use an unlit material (MeshBasicMaterial) with the baked look. In three.js, set
texture.flipY = false for glTF UVs. --yaw (degrees) squares up a model that came back rotated (image-to-3D
alignment can be about 10 degrees off: read it from the --preview axis views).
Only the first primitive of the first mesh is packed; the tool says so when there are more.

Decode in the game (three.js):
  const M = window.POD_MESH, b64 = (s, C) => { const b = atob(s), u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new C(u.buffer); };
  const q = b64(M.pos, Int16Array), u = b64(M.uv, Uint16Array), ix = b64(M.idx, M.idx32 ? Uint32Array : Uint16Array);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(q, v => v / 32767), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(u, v => v / 65535), 2));
  g.setIndex(new THREE.BufferAttribute(ix, 1));
"""
import argparse
import base64
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("project")
ap.add_argument("--glb", required=True)
ap.add_argument("--name", default="MESH")
ap.add_argument("--out", default=None)
ap.add_argument("--tex", default=None)
ap.add_argument("--yaw", type=float, default=0.0)
ap.add_argument("--tex-max", type=int, default=512)
ap.add_argument("--preview", default=None)
a = ap.parse_args()
root = Path(a.project)
stem = Path(a.glb).stem
out_js = root / (a.out or f"src/{stem}_mesh.js")
out_tex = root / (a.tex or f"assets/raw/{stem}_tex.jpg")

b = (root / a.glb).read_bytes()
assert b[:4] == b"glTF", "not a binary glTF (.glb)"
jl = struct.unpack("<I", b[12:16])[0]
j = json.loads(b[20:20 + jl])
BIN = b[20 + jl + 8:]


def acc(i):
    x = j["accessors"][i]
    bv = j["bufferViews"][x["bufferView"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[x["type"]]
    dt = {5126: np.float32, 5121: np.uint8, 5123: np.uint16, 5125: np.uint32}[x["componentType"]]
    off = bv.get("byteOffset", 0) + x.get("byteOffset", 0)
    stride = bv.get("byteStride", 0)
    item = np.dtype(dt).itemsize * n
    if stride and stride != item:  # interleaved buffer view
        raw = np.frombuffer(BIN, np.uint8, stride * (x["count"] - 1) + item, off)
        rows = [np.frombuffer(raw[k * stride:k * stride + item].tobytes(), dt) for k in range(x["count"])]
        arr = np.stack(rows)
    else:
        arr = np.frombuffer(BIN, dt, x["count"] * n, off).reshape(-1, n)
    if x.get("normalized") and dt != np.float32:
        arr = arr.astype(np.float64) / np.iinfo(dt).max
    return arr if n > 1 else arr.reshape(-1)


def quat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


meshes = j["meshes"]
if len(meshes) > 1 or len(meshes[0]["primitives"]) > 1:
    print(f"warning: {len(meshes)} meshes / {len(meshes[0]['primitives'])} primitives; packing only the first")
p = meshes[0]["primitives"][0]
pos = acc(p["attributes"]["POSITION"]).astype(np.float64)
uv = acc(p["attributes"]["TEXCOORD_0"]).astype(np.float64)
idx = acc(p["indices"]).astype(np.uint32) if "indices" in p else np.arange(len(pos), dtype=np.uint32)

# bake the node rotations and scales (image-to-3D GLBs nest the mesh under a rotated scene node)
R = np.eye(3)
for n in reversed(j.get("nodes", [])):
    if "rotation" in n:
        R = R @ quat(n["rotation"])
    if "scale" in n:
        R = R @ np.diag(n["scale"])
    if "matrix" in n:
        R = R @ np.array(n["matrix"]).reshape(4, 4).T[:3, :3]
with np.errstate(all="ignore"):  # some numpy/BLAS builds on macOS warn spuriously in matmul
    pos = pos @ R.T
if a.yaw:
    y = np.radians(a.yaw)
    with np.errstate(all="ignore"):
        pos = pos @ np.array([[np.cos(y), 0, np.sin(y)], [0, 1, 0], [-np.sin(y), 0, np.cos(y)]]).T
assert np.isfinite(pos).all(), "non-finite vertex positions"
pos -= (pos.max(0) + pos.min(0)) / 2
pos /= np.abs(pos).max()
print("verts", len(pos), "tris", len(idx) // 3, "extent", pos.min(0).round(3), pos.max(0).round(3))

idx32 = len(pos) >= 65536
mesh = {
    "pos": base64.b64encode(np.round(pos * 32767).astype(np.int16).tobytes()).decode(),
    "uv": base64.b64encode(np.round(np.clip(uv, 0, 1) * 65535).astype(np.uint16).tobytes()).decode(),
    "idx": base64.b64encode(idx.astype(np.uint32 if idx32 else np.uint16).tobytes()).decode(),
    "idx32": idx32,
}
out_js.parent.mkdir(parents=True, exist_ok=True)
js = (f"/* generated by pack_glb.py from {a.glb}. Do not edit. */\n"
      f"window.{a.name} = " + json.dumps(mesh) + ";\n")
out_js.write_text(js)
print(f"{out_js.relative_to(root)}  {len(js) // 1024} KB")

T = None
if j.get("images"):
    img = j["images"][0]
    bv = j["bufferViews"][img["bufferView"]]
    tex = Image.open(io.BytesIO(BIN[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]])).convert("RGB")
    print("texture", tex.size, "->", end=" ")
    tex.thumbnail((a.tex_max, a.tex_max), Image.LANCZOS)
    out_tex.parent.mkdir(parents=True, exist_ok=True)
    tex.save(out_tex, quality=92)
    print(out_tex.relative_to(root), tex.size)
    T = np.asarray(tex)
else:
    print("no embedded texture")

if a.preview:  # three axis views colored from the texture, to read the orientation and any yaw error
    out = Image.new("RGB", (900, 300), "black")
    if T is not None:
        col = T[np.clip(((1 - uv[:, 1]) * (T.shape[0] - 1)).astype(int), 0, T.shape[0] - 1),
                np.clip((uv[:, 0] * (T.shape[1] - 1)).astype(int), 0, T.shape[1] - 1)]
    else:
        col = np.full((len(pos), 3), 220)
    for k, (h, v, dep) in enumerate(((0, 1, 2), (2, 1, 0), (0, 2, 1))):
        for i in np.argsort(pos[:, dep]):
            out.putpixel((int(150 + k * 300 + pos[i, h] * 130), int(150 - pos[i, v] * 130)), tuple(int(c) for c in col[i]))
    (root / a.preview).parent.mkdir(parents=True, exist_ok=True)
    out.save(root / a.preview)
    print("preview", a.preview, "(front | side | top)")
