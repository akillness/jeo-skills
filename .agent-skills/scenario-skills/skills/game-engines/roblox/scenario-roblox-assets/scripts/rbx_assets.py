#!/usr/bin/env python3
"""Asset intake for Roblox: GLB triage, Blender prep, gates, texture budget, Studio previews, UGC checks.

Built on the scenario-roblox-expert toolkit (rbx_run, rbx_play). Offline parts need only Python 3.10+,
plus Blender 5.x for `blender_prep` and ImageMagick for `pack_images`.

    import sys; sys.path[:0] = ["<skills>/scenario-roblox-expert/scripts", "<skills>/scenario-roblox-assets/scripts"]
    import rbx_assets as ra
    info = ra.glb_info("chest.glb")                              # offline: tris, bounds, images, materials
    rep = ra.blender_prep({"input": "hat.glb", "out_dir": "out", "mode": "prep", **ra.ACCESSORY_PREP})
    ra.gates(rep["after"], kind="accessory", acc_type="Hat")     # list of {gate, ok, value, limit}
    data = ra.pack_mesh(rep["files"]["payload"]["path"]); imgs = ra.pack_images(rep["files"], 256)
    ra.stage(studio, "hat", data, imgs)                          # Edit data model, chunked through _G
    r = ra.run(studio, 'local d = Payload.fromStage("hat") '
               'return MeshBuild.build(d.mesh, d.images, {Name = "Hat", Parent = workspace.AssetLab}).Size',
               kit=["Payload", "MeshBuild"])

Coordinates: Blender (x, y, z) = Roblox (x, z, -y). glTF is already Y up, so a GLB maps 1:1 to Roblox axes
when 1 unit = 1 stud. CLI:
  rbx_assets.py glb <file.glb>                 offline triage (JSON)
  rbx_assets.py prep <spec.json>               Blender headless prep through the machine guard
  rbx_assets.py gates <report.json> <kind> [AccessoryType] [ScaleType]
"""
from __future__ import annotations

import base64
import json
import struct
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT_DIR = HERE / "agentkit" / "assets"
PREP = HERE / "blender_roblox_prep.py"
LEAD = HERE.parents[1] / "scenario-roblox-expert" / "scripts"
sys.path.insert(0, str(LEAD))

__version__ = "0.1.0"

PURE = ("Payload", "MeshBuild", "AssetAudit", "UGCCheck")

# Roblox docs, retrieved 2026-10: per-mesh import limit, rigid accessory budget, EditableMesh caps.
LIMITS = {
    "mesh_tris": 20000,
    "accessory_tris": 4000,
    "editable_mesh_verts": 60000,
    "editable_mesh_tris": 20000,
    "editable_image_side": 1024,
    "texture_side_place": 4096,
    "texture_side_marketplace": 2048,
    "avatar_color_side": 1024,
    "avatar_other_side": 256,
}

# Max accessory size in studs (X, Y, Z) per AccessoryType and AvatarPartScaleType (rigid accessory specs).
# Live values come from AvatarCreationService:GetValidationRules(); prefer them when Studio is reachable.
ACCESSORY_BOUNDS = {
    "Hat": {"ProportionsNormal": (1.87, 2.5, 1.87), "ProportionsSlender": (1.78, 2.5, 1.78), "Classic": (3, 4, 3)},
    "Hair": {"ProportionsNormal": (1.87, 3.12, 2.18), "ProportionsSlender": (1.78, 3.12, 2.08), "Classic": (3, 5, 3.5)},
    "Face": {"ProportionsNormal": (1.87, 1.25, 1.25), "ProportionsSlender": (1.78, 1.25, 1.18), "Classic": (3, 2, 2)},
    "Neck": {"ProportionsNormal": (2.95, 3.68, 2.16), "ProportionsSlender": (2.59, 3.39, 1.92), "Classic": (3, 3, 2)},
    "Shoulder": {"ProportionsNormal": (6.90, 3.68, 3.24), "ProportionsSlender": (6.05, 3.39, 2.88), "Classic": (7, 3, 3)},
    "Front": {"ProportionsNormal": (2.95, 3.68, 3.24), "ProportionsSlender": (2.59, 3.39, 2.88), "Classic": (3, 3, 3)},
    "Back": {"ProportionsNormal": (9.86, 8.59, 4.87), "ProportionsSlender": (8.64, 7.91, 4.32), "Classic": (10, 7, 4.5)},
    "Waist": {"ProportionsNormal": (3.94, 4.29, 7.57), "ProportionsSlender": (3.76, 3.29, 6.73), "Classic": (4, 3.5, 7)},
}
ATTACHMENTS = {
    "Hat": ["HatAttachment"], "Hair": ["HairAttachment"], "Face": ["FaceFrontAttachment", "FaceCenterAttachment"],
    "Neck": ["NeckAttachment"], "Front": ["BodyFrontAttachment"], "Back": ["BodyBackAttachment"],
    "Waist": ["WaistFrontAttachment", "WaistCenterAttachment", "WaistBackAttachment"],
    "Shoulder": ["NeckAttachment", "RightCollarAttachment", "LeftCollarAttachment",
                 "RightShoulderAttachment", "LeftShoulderAttachment"],
}

# Spec presets for blender_prep (merge with input, out_dir, scale).
PROP_PREP = {"mode": "prep", "max_tris": 20000, "pivot": "bottom", "weld": 1e-5, "metal_threshold": 0.5,
             "textures": {"color": 1024, "normal": 512, "roughness": 512, "metalness": 512}}
ACCESSORY_PREP = {"mode": "prep", "max_tris": 3800, "pivot": "center", "weld": 1e-4, "fill_holes": True,
                  "min_island_faces": 8, "opaque_color": True, "metal_threshold": 0.5,
                  "textures": {"color": 1024, "normal": 256, "roughness": 256, "metalness": 256}}


# ---------------------------------------------------------------- GLB triage (offline, no Blender)

def _img_size(b: bytes) -> tuple[int, int] | None:
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", b[16:24])
    if b[:2] == b"\xff\xd8":
        i = 2
        while i < len(b) - 9:
            if b[i] != 0xFF:
                i += 1
                continue
            m = b[i + 1]
            if m in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack(">HH", b[i + 5:i + 9])
                return w, h
            i += 2 + struct.unpack(">H", b[i + 2:i + 4])[0]
    return None


def _mat_mul(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def _node_matrix(n):
    if "matrix" in n:
        m = n["matrix"]
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    tx, ty, tz = n.get("translation", (0, 0, 0))
    x, y, z, w = n.get("rotation", (0, 0, 0, 1))
    sx, sy, sz = n.get("scale", (1, 1, 1))
    r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[r[0][0] * sx, r[0][1] * sy, r[0][2] * sz, tx], [r[1][0] * sx, r[1][1] * sy, r[1][2] * sz, ty],
            [r[2][0] * sx, r[2][1] * sy, r[2][2] * sz, tz], [0, 0, 0, 1]]


def glb_info(path: str | Path) -> dict:
    """Triangles, world bounds (glTF Y up = Roblox Y up), images, materials, skins, extensions of a .glb."""
    data = Path(path).read_bytes()
    magic, version, _ = struct.unpack("<4sII", data[:12])
    if magic != b"glTF":
        raise ValueError("not a binary glTF")
    off, js, binc = 12, None, b""
    while off < len(data):
        ln, typ = struct.unpack("<I4s", data[off:off + 8])
        chunk = data[off + 8:off + 8 + ln]
        if typ == b"JSON":
            js = json.loads(chunk)
        elif typ == b"BIN\x00":
            binc = chunk
        off += 8 + ln
    acc, views = js.get("accessors", []), js.get("bufferViews", [])
    tris = verts = 0
    lo, hi = [float("inf")] * 3, [float("-inf")] * 3
    prims = []

    def visit(i, parent):
        nonlocal tris, verts
        n = js["nodes"][i]
        m = _mat_mul(parent, _node_matrix(n))
        if "mesh" in n:
            for p in js["meshes"][n["mesh"]]["primitives"]:
                pa = acc[p["attributes"]["POSITION"]]
                count = acc[p["indices"]]["count"] if "indices" in p else pa["count"]
                t = count // 3 if p.get("mode", 4) == 4 else 0
                tris += t
                verts += pa["count"]
                prims.append({"mesh": n["mesh"], "tris": t, "verts": pa["count"], "mode": p.get("mode", 4),
                              "attributes": sorted(p["attributes"]), "material": p.get("material")})
                mn, mx = pa.get("min"), pa.get("max")
                if mn and mx:
                    for cx in (mn[0], mx[0]):
                        for cy in (mn[1], mx[1]):
                            for cz in (mn[2], mx[2]):
                                w = [sum(m[r][k] * v for k, v in enumerate((cx, cy, cz, 1))) for r in range(3)]
                                for k in range(3):
                                    lo[k], hi[k] = min(lo[k], w[k]), max(hi[k], w[k])
        for c in n.get("children", []):
            visit(c, m)

    ident = [[1 if r == c else 0 for c in range(4)] for r in range(4)]
    scene = js.get("scenes", [{}])[js.get("scene", 0)]
    for root in scene.get("nodes", []):
        visit(root, ident)
    images = []
    for im in js.get("images", []):
        size = None
        if "bufferView" in im:
            v = views[im["bufferView"]]
            b = binc[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
            size = _img_size(b)
        images.append({"name": im.get("name"), "mime": im.get("mimeType"), "size": list(size) if size else None})
    mats = []
    for m in js.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {})
        mats.append({"name": m.get("name"), "doubleSided": m.get("doubleSided", False),
                     "alphaMode": m.get("alphaMode", "OPAQUE"),
                     "metallicFactor": pbr.get("metallicFactor", 1.0), "roughnessFactor": pbr.get("roughnessFactor", 1.0),
                     "maps": sorted(k for k in ("baseColorTexture", "metallicRoughnessTexture") if k in pbr)
                     + sorted(k for k in ("normalTexture", "occlusionTexture", "emissiveTexture") if k in m)})
    dims = [round(hi[k] - lo[k], 4) for k in range(3)] if tris else [0, 0, 0]
    return {"version": version, "tris": tris, "verts": verts, "primitives": prims,
            "mesh_count": len(js.get("meshes", [])), "dims": dims,
            "center": [round((hi[k] + lo[k]) / 2, 4) for k in range(3)] if tris else [0, 0, 0],
            "min_y": round(lo[1], 4) if tris else 0, "images": images, "materials": mats,
            "skins": len(js.get("skins", [])), "animations": len(js.get("animations", [])),
            "extensions": js.get("extensionsUsed", []), "bytes": len(data)}


# ---------------------------------------------------------------- sizing rules

def texture_side(dims_studs, cap: int = 1024, px_per_2_studs: int = 256) -> int:
    """Texture side from the docs density rule (256 px per 2 x 2 x 2 studs), power of two, 64 to cap."""
    a, b = sorted(float(x) for x in dims_studs)[-2:]
    want = px_per_2_studs * max(a, b) / 2.0
    side = 64
    while side < want and side < cap:
        side *= 2
    return min(side, cap)


def accessory_fit(dims, acc_type: str = "Hat", scale: str = "Classic", fill: float = 0.92) -> dict:
    """Uniform scale factor that fits `dims` (studs, Roblox axes) inside the type bounds at `fill`."""
    box = ACCESSORY_BOUNDS[acc_type][scale]
    s = fill * min(box[i] / float(dims[i]) for i in range(3) if dims[i])
    return {"bounds": box, "scale": round(s, 5), "dims_after": [round(float(d) * s, 4) for d in dims]}


def gates(stats: dict, kind: str = "prop", acc_type: str | None = None, scale: str = "Classic",
          images: dict | None = None, box=None) -> list[dict]:
    """Offline gates on Blender `stats` (report["after"]). kind: "prop" or "accessory".
    Bounds default to the Classic row, the box GetValidationRules returned live; `box` overrides it."""
    out = []

    def g(name, ok, value, limit):
        out.append({"gate": name, "ok": bool(ok), "value": value, "limit": limit})

    tri_cap = LIMITS["accessory_tris"] if kind == "accessory" else LIMITS["mesh_tris"]
    g("triangles", stats["tris"] <= tri_cap, stats["tris"], tri_cap)
    g("ngons", stats.get("ngons", 0) == 0, stats.get("ngons", 0), 0)
    g("uv_layer", stats["uv"]["layers"] >= 1, stats["uv"]["layers"], ">= 1")
    g("loose_geometry", stats["loose_verts"] + stats["wire_edges"] == 0,
      stats["loose_verts"] + stats["wire_edges"], 0)
    g("zero_area_faces", stats["zero_area_faces"] == 0, stats["zero_area_faces"], 0)
    vc_ok = all(v["all_white"] for v in stats["vertex_colors"])
    g("vertex_colors_white_or_none", vc_ok, [v["name"] for v in stats["vertex_colors"]], "none or white")
    dims = stats["dims_studs"]
    if kind == "accessory":
        g("watertight", stats["boundary_edges"] == 0, stats["boundary_edges"], 0)
        g("nonmanifold_edges", stats["nonmanifold_edges"] == 0, stats["nonmanifold_edges"], 0)
        g("single_object", stats["objects"] == 1, stats["objects"], 1)
        if acc_type:
            label = scale if box is None else "given"
            box = box or ACCESSORY_BOUNDS[acc_type][scale]
            g(f"bounds_{acc_type}_{label}", all(dims[i] <= box[i] for i in range(3)), dims, list(box))
        g("pivot_centered", all(abs(c) < 0.01 for c in stats["center"]), stats["center"], [0, 0, 0])
    else:
        g("pivot_bottom", abs(stats["min_y"]) < 0.01, stats["min_y"], 0)
        g("size_nonzero", min(dims) > 0.05, dims, "> 0.05 stud each axis")
    for role, info in (images or {}).items():
        side = max(info["size"])
        if kind == "accessory":
            cap = LIMITS["avatar_color_side"] if role == "color" else LIMITS["avatar_other_side"]
        else:
            cap = LIMITS["texture_side_place"]
        g(f"texture_{role}", side <= cap, info["size"], cap)
    return out


def failed(gate_list: list[dict]) -> list[dict]:
    return [x for x in gate_list if not x["ok"]]


# ---------------------------------------------------------------- silhouette and tilt (offline, no Blender)

def _mesh(mesh) -> tuple[list, list]:
    """Positions and triangles from a `<name>_mesh.json` path or dict (Roblox axes, 0-based triangles)."""
    d = json.loads(Path(mesh).read_text()) if isinstance(mesh, (str, Path)) else mesh
    p, t = d["p"], d["t"]
    pts = [tuple(p[i:i + 3]) for i in range(0, len(p), 3)] if p and not isinstance(p[0], list) else [tuple(x) for x in p]
    tris = [tuple(t[i:i + 3]) for i in range(0, len(t), 3)] if t and not isinstance(t[0], list) else [tuple(x) for x in t]
    return pts, tris


# view: (axis the camera looks along is the dropped one, u axis, v axis, sign of the facing normal)
VIEWS = {"front": (2, 0, 1, -1), "back": (2, 0, 1, 1), "left": (0, 2, 1, -1), "right": (0, 2, 1, 1),
         "top": (1, 0, 2, 1), "bottom": (1, 0, 2, -1)}


def opacity_views(mesh, res: int = 128, cull: bool = True) -> dict:
    """Six orthographic silhouettes, as the validator's opacity check rasterizes them (#161, #190).

    Coverage = covered pixels / pixels of the mesh's bounding rectangle in that view. With `cull`, a
    triangle counts only from the side its normal faces (counter-clockwise front, like a MeshPart without
    DoubleSided); Roblox does not document its rasterizer or thresholds, so read zero as a sure fail and
    low values as a risk. Front is seen from -Z, the Roblox front."""
    pts, tris = _mesh(mesh)
    out = {}
    for name, (drop, ua, va, sign) in VIEWS.items():
        us, vs = [q[ua] for q in pts], [q[va] for q in pts]
        u0, v0 = min(us), min(vs)
        du, dv = max(us) - u0, max(vs) - v0
        if du < 1e-9 or dv < 1e-9:
            out[name] = 0.0
            continue
        covered = set()
        for a, b, c in tris:
            pa, pb, pc = pts[a], pts[b], pts[c]
            if cull:
                e1 = [pb[i] - pa[i] for i in range(3)]
                e2 = [pc[i] - pa[i] for i in range(3)]
                n = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
                if n[drop] * sign <= 0:
                    continue
            xy = [((q[ua] - u0) / du * res, (q[va] - v0) / dv * res) for q in (pa, pb, pc)]
            (x1, y1), (x2, y2), (x3, y3) = xy
            area = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)
            if abs(area) < 1e-12:
                continue
            for py in range(max(0, int(min(y1, y2, y3))), min(res, int(max(y1, y2, y3)) + 1)):
                for px in range(max(0, int(min(x1, x2, x3))), min(res, int(max(x1, x2, x3)) + 1)):
                    cx, cy = px + 0.5, py + 0.5
                    w1 = (x2 - x1) * (cy - y1) - (cx - x1) * (y2 - y1)
                    w2 = (x3 - x2) * (cy - y2) - (cx - x2) * (y3 - y2)
                    w3 = (x1 - x3) * (cy - y3) - (cx - x3) * (y1 - y3)
                    if (w1 >= 0 and w2 >= 0 and w3 >= 0) or (w1 <= 0 and w2 <= 0 and w3 <= 0):
                        covered.add(py * res + px)
        out[name] = round(len(covered) / (res * res), 4)
    return {"coverage": out, "min_view": min(out, key=out.get), "invisible": [k for k, v in out.items() if v == 0.0]}


def tilt_limit(mesh, box, axis: str = "x", max_deg: int = 45) -> dict:
    """Smallest whole-degree tilt about `axis` at which the mesh's axis-aligned size leaves `box`.

    Roblox measures the accessory box on axis-aligned bounds (KatsBits L28Ng6Hia1E [00:10:34]), so a tilt
    grows it. Returns {upright, limit_deg (None if it stays inside up to max_deg), size_at_limit}."""
    import math
    pts, _ = _mesh(mesh)
    i, j = {"x": (1, 2), "y": (0, 2), "z": (0, 1)}[axis]

    def size(deg):
        c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
        rot = [list(q) for q in pts]
        for q in rot:
            q[i], q[j] = q[i] * c - q[j] * s, q[i] * s + q[j] * c
        return [round(max(q[k] for q in rot) - min(q[k] for q in rot), 4) for k in range(3)]

    up = size(0)
    for deg in range(1, max_deg + 1):
        sz = size(deg)
        if any(sz[k] > box[k] for k in range(3)):
            return {"upright": up, "limit_deg": deg, "size_at_limit": sz}
    return {"upright": up, "limit_deg": None, "size_at_limit": None}


# ---------------------------------------------------------------- Blender headless, behind the machine guard

def blender_processes() -> int:
    r = subprocess.run(["ps", "-axo", "command"], capture_output=True, text=True)
    return sum(1 for line in r.stdout.splitlines()
               if "Blender.app/Contents/MacOS/Blender" in line or line.startswith("blender "))


def blender_ready(max_gpu: float = 85, max_ram: float = 75, max_procs: int = 2) -> tuple[bool, str]:
    try:
        import rbx_env
        load = rbx_env.machine_load()
    except Exception as e:  # toolkit missing: the caller decides
        return True, f"no machine_load ({e})"
    procs = blender_processes()
    if (load.get("gpu_util") or 0) > max_gpu:
        return False, f"GPU {load.get('gpu_util')}% > {max_gpu}%"
    if (load.get("ram") or 0) > max_ram:
        return False, f"RAM {load.get('ram')}% > {max_ram}%"
    if procs >= max_procs:
        return False, f"{procs} Blender processes already running"
    return True, json.dumps(load)


def blender_prep(spec: dict, blender: str = "blender", wait: float = 900, timeout: float = 900) -> dict:
    """Run blender_roblox_prep.py headless on `spec`; waits for the machine guard first."""
    t0 = time.time()
    while True:
        ok, why = blender_ready()
        if ok:
            break
        if time.time() - t0 > wait:
            raise RuntimeError(f"machine guard: {why}")
        time.sleep(15)
    out_dir = Path(spec["out_dir"]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    spec = {**spec, "input": str(Path(spec["input"]).resolve()), "out_dir": str(out_dir)}
    sp = out_dir / f"{spec.get('name') or Path(spec['input']).stem}_spec.json"
    sp.write_text(json.dumps(spec, indent=1))
    cmd = [blender, "-b", "--factory-startup", "-noaudio", "-P", str(PREP), "--", str(sp)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    line = next((x for x in r.stdout.splitlines() if x.startswith("RBX_PREP_REPORT ")), None)
    if r.returncode != 0 or not line:
        raise RuntimeError(f"blender prep failed ({r.returncode}): {(r.stderr or r.stdout)[-2000:]}")
    return json.loads(Path(line.split(" ", 1)[1]).read_text())


# ---------------------------------------------------------------- payloads for EditableMesh / EditableImage

def _zstd_stored(raw: bytes) -> bytes:
    """One zstd frame of stored (uncompressed) blocks, which any zstd decoder reads."""
    # Single segment (no window descriptor), 8-byte content size, no checksum; blocks of at most 128 KiB.
    out = bytearray(struct.pack("<IB", 0xFD2FB528, 0xE0) + struct.pack("<Q", len(raw)))
    step = 128 * 1024
    starts = range(0, len(raw), step) or [0]
    for i in starts:
        block = raw[i:i + step]
        last = i + step >= len(raw)
        out += (len(block) << 3 | int(last)).to_bytes(3, "little")  # block type 0: raw
        out += block
    return bytes(out)


def _zb64(raw: bytes) -> str:
    """zstd + base64: decoded in Studio by EncodingService (Base64Decode, DecompressBuffer Zstd).

    compression.zstd is Python 3.14+; older Pythons send the same frame format uncompressed (larger)."""
    try:
        from compression import zstd
    except ImportError:
        return base64.b64encode(_zstd_stored(raw)).decode("ascii")
    return base64.b64encode(zstd.compress(raw, 9)).decode("ascii")


def pack_mesh(payload_json: str | Path) -> dict:
    """Binary layout: u32 nv, nuv, nt; f32 pos[nv*3]; f32 uv[nuv*2]; u32 tri[nt*3]; u32 triuv[nt*3]."""
    d = json.loads(Path(payload_json).read_text())
    nv, nuv, nt = len(d["p"]) // 3, len(d["uv"]) // 2, len(d["t"]) // 3
    raw = (struct.pack("<III", nv, nuv, nt) + struct.pack(f"<{nv * 3}f", *d["p"])
           + struct.pack(f"<{nuv * 2}f", *d["uv"]) + struct.pack(f"<{nt * 3}I", *d["t"])
           + struct.pack(f"<{nt * 3}I", *(d["tu"] or [0] * (nt * 3))))
    b = _zb64(raw)
    return {"b64": b, "verts": nv, "uvs": nuv, "tris": nt, "raw_bytes": len(raw), "b64_bytes": len(b),
            "size": d["size"]}


def pack_images(files: dict, side: int | None = None, magick: str = "magick") -> dict:
    """RGBA8 rows top to bottom (EditableImage WritePixelsBuffer layout), resized to `side`."""
    out = {}
    for role in ("color", "normal", "roughness", "metalness"):
        f = files.get(role)
        if not f:
            continue
        path = f["path"] if isinstance(f, dict) else f
        args = [magick, path, "-alpha", "on"]
        if side:
            args += ["-resize", f"{side}x{side}!"]
        args += ["-depth", "8", "RGBA:-"]
        raw = subprocess.run(args, capture_output=True, check=True).stdout
        w = h = int((len(raw) // 4) ** 0.5)
        out[role] = {"b64": _zb64(raw), "w": w, "h": h, "raw_bytes": len(raw)}
    return out


def stage(studio, key: str, mesh: dict | None = None, images: dict | None = None, chunk: int = 180_000,
          dm: str = "Edit") -> dict:
    """Send payloads into one data model's Luau VM as _G.RbxAssetStage[key] (several calls when large).

    _G lives as long as that data model: Edit keeps it across calls, a playtest Server loses it at stop."""
    import rbx_run
    parts = []
    if mesh:
        parts.append(("mesh", mesh["b64"], {}))
    for role, im in (images or {}).items():
        parts.append((role, im["b64"], {"w": im["w"], "h": im["h"]}))
    calls = 0
    init = f'_G.RbxAssetStage = _G.RbxAssetStage or {{}}; _G.RbxAssetStage["{key}"] = {{}}; return true'
    t0 = time.time()
    r = rbx_run.run(studio, init, dm)
    if not r.get("ok"):
        return r
    for name, b64, meta in parts:
        meta_lua = ", ".join(f"{k} = {v}" for k, v in meta.items())
        for i in range(0, len(b64), chunk):
            piece = b64[i:i + chunk]
            code = (f'local s = _G.RbxAssetStage["{key}"]\n'
                    f's["{name}"] = s["{name}"] or {{chunks = {{}}, {meta_lua}}}\n'
                    f'table.insert(s["{name}"].chunks, "{piece}")\nreturn #s["{name}"].chunks')
            r = rbx_run.run(studio, code, dm, timeout=60)
            calls += 1
            if not r.get("ok"):
                return {"ok": False, "error": r.get("error"), "part": name, "calls": calls}
    return {"ok": True, "calls": calls, "parts": [p[0] for p in parts],
            "bytes": sum(len(p[1]) for p in parts), "seconds": round(time.time() - t0, 2)}


# ---------------------------------------------------------------- Luau kit

def kit_source(names) -> str:
    parts = []
    for n in names:
        if n not in PURE:
            raise ValueError(f"unknown kit module {n}")
        src = "\n".join(x for x in (KIT_DIR / f"{n}.luau").read_text().splitlines() if not x.startswith("--!"))
        parts.append(f"local {n} = (function()\n{src}\nend)()")  # directives only count on line 1
    return "\n".join(parts) + "\n" if parts else ""


def run(studio, code: str, dm: str = "Edit", kit=(), lead_kit=(), timeout: float | None = None) -> dict:
    """rbx_run.run with this skill's modules inlined before `code`. Same result dict."""
    import rbx_run
    names = list(kit)
    head = kit_source(names)
    r = rbx_run.run(studio, head + code, dm, timeout=timeout, kit=list(lead_kit))
    if r.get("error") and head and hasattr(rbx_run, "_fix_lines"):
        r["error"] = rbx_run._fix_lines(r["error"], head.count("\n"))
    return r


def _main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    cmd = argv[0]
    if cmd == "glb":
        print(json.dumps(glb_info(argv[1]), indent=1))
        return 0
    if cmd == "prep":
        rep = blender_prep(json.loads(Path(argv[1]).read_text()))
        print(json.dumps({k: rep[k] for k in ("before", "after", "steps", "files") if k in rep}, indent=1))
        return 0
    if cmd == "gates":
        rep = json.loads(Path(argv[1]).read_text())
        res = gates(rep.get("after") or rep["before"], argv[2], *(argv[3:5]), images=None)
        print(json.dumps(res, indent=1))
        return 1 if failed(res) else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
