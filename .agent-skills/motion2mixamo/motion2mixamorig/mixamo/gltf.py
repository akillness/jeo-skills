"""Write a skinned Mixamo character + its animation as a .glb (glTF 2.0).

Blender opens this in one import: mesh, skin weights, and the clip. Each joint
node stores the recovered full bind-local transform ``T_bind * R_bind``; the
animation channel stores the rest-relative delta ``R_anim``. This works whether
the source FBX kept ``PreRotation`` or baked it into another bind representation.

Units are metres (Y-up). Vertex influences are the top four weights.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np

from .fbx_skeleton import matrix_to_quat_wxyz
from .kinematics import continue_quaternion, local_matrix
from .skinned_mesh import YBotAsset

_GLTF_MAGIC = 0x46546C67
_JSON_CHUNK = 0x4E4F534A
_BIN_CHUNK = 0x004E4942


class _Bin:
    def __init__(self) -> None:
        self._parts: list[bytes] = []
        self._cursor = 0

    def add(self, data: bytes) -> tuple[int, int]:
        offset = self._cursor
        self._parts.append(data)
        self._cursor += len(data)
        pad = (4 - len(data) % 4) % 4
        if pad:
            self._parts.append(b"\x00" * pad)
            self._cursor += pad
        return offset, len(data)

    def add_array(self, array: np.ndarray) -> tuple[int, int]:
        return self.add(np.ascontiguousarray(array).tobytes())

    def dumps(self) -> bytes:
        return b"".join(self._parts)


def _quat_xyzw(rmat: np.ndarray) -> np.ndarray:
    wxyz = matrix_to_quat_wxyz(rmat)
    return np.array([wxyz[1], wxyz[2], wxyz[3], wxyz[0]], dtype=np.float32)


def _scale_affine(mat: np.ndarray, scale: float) -> np.ndarray:
    """Metres from centimetres: R stays, translation is multiplied by `scale`."""
    out = np.asarray(mat, dtype=np.float64).reshape(4, 4).copy()
    out[:3, 3] *= scale
    return out


def _top4_weights(weights: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    n_bones = weights.shape[1]
    take = min(4, n_bones)
    order = np.argpartition(-weights, take - 1, axis=1)[:, :take]
    w = np.take_along_axis(weights, order, axis=1)
    w = w / np.maximum(w.sum(axis=1, keepdims=True), 1e-8)
    if take < 4:
        pad_i = np.zeros((weights.shape[0], 4 - take), dtype=order.dtype)
        pad_w = np.zeros((weights.shape[0], 4 - take), dtype=w.dtype)
        order = np.concatenate([order, pad_i], axis=1)
        w = np.concatenate([w, pad_w], axis=1)
    return order.astype(np.uint16), w.astype(np.float32)


def _vertex_normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    normals = np.zeros_like(vertices, dtype=np.float64)
    p0, p1, p2 = vertices[faces[:, 0]], vertices[faces[:, 1]], vertices[faces[:, 2]]
    face_n = np.cross(p1 - p0, p2 - p0)
    for i in range(3):
        np.add.at(normals, faces[:, i], face_n)
    length = np.linalg.norm(normals, axis=1, keepdims=True)
    return (normals / np.where(length < 1e-12, 1.0, length)).astype(np.float32)


def write_glb(
    path: Path,
    asset: YBotAsset,
    r_anim_frames: list[dict[str, np.ndarray]],
    hips_cm_frames: list[np.ndarray],
    fps: float,
) -> Path:
    """Skinned character + clip → a single `.glb` file."""
    rig = asset.rig
    scale = float(rig.meters_per_unit)
    identity = np.eye(3)
    n_bones = len(rig.order)
    bone_index = {name: i for i, name in enumerate(rig.order)}

    blob = _Bin()
    accessors: list[dict] = []
    views: list[dict] = []

    def accessor(array: np.ndarray, typ: str, component: int, *, target: int | None = None,
                 normalized: bool = False) -> int:
        offset, length = blob.add_array(array)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": length,
                      **({"target": target} if target is not None else {})})
        acc: dict = {
            "bufferView": len(views) - 1,
            "componentType": component,
            "count": int(array.shape[0]),
            "type": typ,
        }
        if normalized:
            acc["normalized"] = True
        if typ in {"VEC3", "VEC4", "SCALAR"} and array.dtype.kind == "f":
            flat = array.reshape(array.shape[0], -1)
            acc["min"] = [float(v) for v in flat.min(axis=0)]
            acc["max"] = [float(v) for v in flat.max(axis=0)]
        accessors.append(acc)
        return len(accessors) - 1

    nodes: list[dict] = []
    for name in rig.order:
        bone = rig.bones[name]
        rest = local_matrix(bone, identity)
        kids = [bone_index[c] for c in bone.children if c in bone_index]
        node = {
            "name": name,
            "translation": [float(v) * scale for v in rest[:3, 3]],
            "rotation": [float(v) for v in _quat_xyzw(rest[:3, :3])],
        }
        if kids:
            node["children"] = kids
        nodes.append(node)

    # FBX skin clusters can have different inverse-bind matrices for each
    # geometry object because each mesh has its own bind-space transform. A
    # glTF skin has only one inverseBindMatrices accessor, shared by every
    # node using that skin. Keep the meshes as separate nodes/skins so that
    # each geometry preserves the per-mesh cluster matrices used by the
    # preview renderer. The joint hierarchy itself is still shared.
    mesh_nodes: list[int] = []
    meshes: list[dict] = []
    skins: list[dict] = []
    materials = []
    for mesh_i, mesh in enumerate(asset.meshes):
        verts = (mesh.vertices * scale).astype(np.float32)
        faces = np.ascontiguousarray(mesh.faces, dtype=np.uint32)
        joints, weights = _top4_weights(mesh.weights)
        normals = _vertex_normals(verts.astype(np.float64), mesh.faces)
        color = np.clip(np.asarray(mesh.color, dtype=np.float64).reshape(3), 0, 1)
        materials.append({
            "name": mesh.name,
            "pbrMetallicRoughness": {
                "baseColorFactor": [float(color[0]), float(color[1]), float(color[2]), 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.7,
            },
        })
        primitive = {
            "attributes": {
                "POSITION": accessor(verts, "VEC3", 5126, target=34962),
                "NORMAL": accessor(normals, "VEC3", 5126, target=34962),
                "JOINTS_0": accessor(joints, "VEC4", 5123, target=34962),
                "WEIGHTS_0": accessor(weights, "VEC4", 5126, target=34962),
            },
            "indices": accessor(faces.reshape(-1), "SCALAR", 5125, target=34963),
            "material": len(materials) - 1,
        }
        meshes.append({"name": mesh.name or f"character_mesh_{mesh_i}", "primitives": [primitive]})

        ibm = np.stack(
            [_scale_affine(mesh.ibm[i], scale) for i in range(n_bones)],
            axis=0,
        ).astype(np.float32)
        # glTF stores matrices column-major. This is intentionally per mesh:
        # using asset.meshes[0].ibm for every primitive breaks meshes whose
        # FBX cluster Transform differs from the first geometry's Transform.
        ibm_acc = accessor(np.ascontiguousarray(ibm.transpose(0, 2, 1)), "MAT4", 5126)
        skin_i = len(skins)
        skins.append({
            # Same name on every skin: Blender names the armature after it, and
            # earlier releases produced an armature called "mixamo".
            "name": "mixamo",
            "joints": list(range(n_bones)),
            "skeleton": bone_index[rig.root],
            "inverseBindMatrices": ibm_acc,
        })
        mesh_node = len(nodes)
        mesh_nodes.append(mesh_node)
        nodes.append({
            "name": f"skinned_mesh_{mesh_i}_{mesh.name or 'mesh'}",
            "mesh": mesh_i,
            "skin": skin_i,
        })

    n = len(r_anim_frames)
    times = (np.arange(n, dtype=np.float32) / max(float(fps), 1e-6))
    time_acc = accessor(times, "SCALAR", 5126)

    channels = []
    samplers = []
    prev_q: dict[str, np.ndarray] = {}
    rot_tracks = {name: np.zeros((n, 4), dtype=np.float32) for name in rig.order}
    hips_track = np.zeros((n, 3), dtype=np.float32)
    for i, (r_anim, hips) in enumerate(zip(r_anim_frames, hips_cm_frames)):
        hips_track[i] = np.asarray(hips, dtype=np.float64).reshape(3) * scale
        for name in rig.order:
            bone = rig.bones[name]
            local = local_matrix(
                bone,
                r_anim.get(name, identity),
                hips if name == rig.root else None,
            )
            q_wxyz, _ = continue_quaternion(matrix_to_quat_wxyz(local[:3, :3]), prev_q.get(name))
            prev_q[name] = q_wxyz
            rot_tracks[name][i] = [q_wxyz[1], q_wxyz[2], q_wxyz[3], q_wxyz[0]]

    def add_sampler(values: np.ndarray, typ: str) -> int:
        samplers.append({"input": time_acc, "output": accessor(values, typ, 5126), "interpolation": "LINEAR"})
        return len(samplers) - 1

    hips_s = add_sampler(hips_track.astype(np.float32), "VEC3")
    channels.append({"sampler": hips_s, "target": {"node": bone_index[rig.root], "path": "translation"}})
    for name in rig.order:
        sid = add_sampler(rot_tracks[name], "VEC4")
        channels.append({"sampler": sid, "target": {"node": bone_index[name], "path": "rotation"}})

    gltf = {
        "asset": {"version": "2.0", "generator": "motion2mixamorig"},
        "scene": 0,
        "scenes": [{"nodes": [bone_index[rig.root], *mesh_nodes]}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "skins": skins,
        "animations": [{"name": "mixamo_clip", "samplers": samplers, "channels": channels}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": blob._cursor}],
    }

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_pad = (4 - len(json_bytes) % 4) % 4
    json_bytes = json_bytes + b" " * json_pad
    bin_bytes = blob.dumps()
    bin_pad = (4 - len(bin_bytes) % 4) % 4
    bin_bytes = bin_bytes + b"\x00" * bin_pad

    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    header = struct.pack("<III", _GLTF_MAGIC, 2, total)
    json_chunk = struct.pack("<II", len(json_bytes), _JSON_CHUNK) + json_bytes
    bin_chunk = struct.pack("<II", len(bin_bytes), _BIN_CHUNK) + bin_bytes

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + json_chunk + bin_chunk)
    return path
