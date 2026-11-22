"""Animate a rigged asset by applying Linear Blend Skinning manually in NumPy.

Instead of building a Blender Action and letting Blender's armature modifier
deform the mesh (the :mod:`animate_motion` / :mod:`animate_npz` path), this
extracts the skinning data from the rigged asset once — vertices, weights,
bind pose — computes per-frame bone matrices from the motion, and runs the
LBS equation itself:

    v[f] = sum_b  w[v,b] * (G[f,b] @ inv(bind[b])) @ v_rest

Blender is used ONLY to parse the asset (GLB/FBX mesh + weights + rest bones);
all skinning math is plain NumPy, so the result doubles as a reference
implementation and feeds pipelines that want raw deformed vertices (point
clouds, custom renderers, geometry losses) rather than a re-exported rig.

Accepts both motion formats, auto-detected from the NPZ keys:
  - export-stage NPZ (``anim_local_rot`` / ``names`` / ...), self-contained;
  - feature-format NPZ (``local_rotations`` + ``global_positions``, the
    generated-motion format):
      * with ``--dataset_type`` (and optionally ``--cond_path``) the motion
        skeleton is resolved through ``cond.npy`` exactly like
        :mod:`animate_motion`;
      * WITHOUT them, the asset itself is taken as the canonical motion
        skeleton — the cond-free path for assets baked by
        ``rig_preprocess`` (joint order = bone order, rest = the
        asset's rest, scale = 1).
      * A canonical asset (``canonical_joint_order`` property: from
        ``feature_extraction/canonical_assets.py`` or rig_preprocess) always
        takes the cond-free path, ``--dataset_type`` or not.

``--char_path`` may be omitted with ``--dataset_type``: a feature NPZ then
drives the canonical asset ``dataset/canonical_assets/<ds>/<name>.glb``, an
export NPZ the export asset ``dataset/export/<ds>/rigs/<name>.glb``; <name>
is the clip's object type, for Mixamo ``--character`` (default Michelle).

Bones are matched to the asset by name. Asset bones missing from the motion
keep their rest local transform (they follow their parent, the ``'keep'``
strategy); motion bones missing from the asset are ignored with a warning.

Outputs (per ``--save``; default ``glb``):
  - ``glb`` / ``fbx``: ``<clip>_lbs.<fmt>`` — the animated RIGGED asset,
    exported through the same keyframe path as :mod:`animate_npz` (the
    manual LBS and Blender's armature modifier are numerically equivalent,
    so this is the playable twin of the vertex outputs).
  - ``npz``: ``<clip>_lbs.npz`` with ``vertices (F, V, 3)`` (world space),
    ``faces``, ``fps``, ``frame_count`` — opt-in, for pipelines that want
    raw deformed vertices.
  - ``obj``: one OBJ per frame under ``<clip>_lbs/`` — opt-in.

Usage (Blender headless or plain python with pip bpy):
    blender -b -P data_process/mesh_animation/animate_lbs.py -- \\
        --char_path my_rigged_asset.glb \\
        --anim_path <export_dir>/motions/<clip>.npz \\
        --output_dir outputs/lbs
"""

import argparse
import os
import sys

import numpy as np
from loguru import logger

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from Animation import transforms_global, transforms_local  # noqa: E402

from data_process.mesh_animation.common import (  # noqa: E402
    DEFAULT_MIXAMO_CHARACTER,
    canonical_joint_order,
    is_canonical_asset,
    is_feature_motion,
    load_character,
    npz_scalar,
    parse_blender_argv,
    quat_pos_to_mats,
    resolve_processed_asset,
    rotations_to_quats,
)
from data_process.utils.blender_rig import (  # noqa: E402
    compute_bone_keyframes,
    export_animated_character,
    find_skinned_meshes,
    rebuild_action_from_data,
    set_scene_timing,
    update_scene,
)
from data_process.utils.skeleton import motion_axis_alignment  # noqa: E402


# ---------------------------------------------------------------------------
# Skin extraction (the only bpy-dependent step)
# ---------------------------------------------------------------------------

def extract_skin(char_armature):
    """Extract everything LBS needs from a loaded rigged asset.

    Returns a dict with:
        bone_names   : list of N bone names (armature order)
        parents      : (N,) parent indices, -1 for roots
        rest_global  : (N, 4, 4) armature-space bind matrices
        rest_local   : (N, 4, 4) parent-relative rest transforms
        vertices     : (V, 4) homogeneous rest vertices in ARMATURE space
        weights      : (V, N) normalized skinning weights (rows may be all
                       zero for unskinned vertices — those stay at rest)
        faces        : list of per-polygon vertex-index tuples
        arm_world    : (4, 4) armature object world matrix
    """
    bones = list(char_armature.data.bones)
    bone_names = [b.name for b in bones]
    bone_index = {n: i for i, n in enumerate(bone_names)}
    parents = np.array(
        [bone_index[b.parent.name] if b.parent else -1 for b in bones])
    rest_global = np.stack([np.array(b.matrix_local) for b in bones])
    rest_local = np.stack([
        np.array(b.matrix_local) if b.parent is None
        else np.linalg.inv(np.array(b.parent.matrix_local)) @ np.array(b.matrix_local)
        for b in bones])

    arm_world = np.array(char_armature.matrix_world)
    arm_world_inv = np.linalg.inv(arm_world)

    all_verts, all_weights, all_faces = [], [], []
    offset = 0
    meshes = find_skinned_meshes(char_armature)
    assert meshes, "No mesh with an Armature modifier targeting the asset's armature"
    for mesh_obj in meshes:
        mesh = mesh_obj.data
        to_arm = arm_world_inv @ np.array(mesh_obj.matrix_world)

        v = np.ones((len(mesh.vertices), 4))
        for i, vert in enumerate(mesh.vertices):
            v[i, :3] = vert.co
        all_verts.append(v @ to_arm.T)

        group_to_bone = {g.index: bone_index.get(g.name) for g in mesh_obj.vertex_groups}
        w = np.zeros((len(mesh.vertices), len(bones)))
        for i, vert in enumerate(mesh.vertices):
            for g in vert.groups:
                b = group_to_bone.get(g.group)
                if b is not None and g.weight > 0.0:
                    w[i, b] += g.weight
        all_weights.append(w)

        all_faces.extend(tuple(idx + offset for idx in poly.vertices)
                         for poly in mesh.polygons)
        offset += len(mesh.vertices)

    vertices = np.concatenate(all_verts)
    weights = np.concatenate(all_weights)
    sums = weights.sum(axis=1, keepdims=True)
    skinned = sums[:, 0] > 0
    weights[skinned] /= sums[skinned]
    logger.info(f"Extracted {len(vertices)} vertices ({(~skinned).sum()} unskinned), "
                f"{len(all_faces)} faces, {len(bones)} bones from {len(meshes)} mesh(es)")

    # Canonical joint order baked into a canonical asset (glTF extras carry
    # object-level custom properties); bone enumeration order itself is not
    # stable across glTF round trips.
    import json
    order = canonical_joint_order(char_armature)
    # The clips' rest root, on a Mixamo character baked by canonical_assets.py
    # (its own rest root differs: motion_from_canonical_char).
    motion_root = (char_armature.get('canonical_motion_rest_root')
                   or char_armature.data.get('canonical_motion_rest_root'))
    if isinstance(motion_root, str):
        motion_root = json.loads(motion_root)

    return {
        'bone_names': bone_names, 'parents': parents,
        'rest_global': rest_global, 'rest_local': rest_local,
        'vertices': vertices, 'weights': weights, 'faces': all_faces,
        'arm_world': arm_world, 'canonical_order': order,
        'motion_rest_root': None if motion_root is None else np.asarray(motion_root, dtype=np.float64),
    }


# ---------------------------------------------------------------------------
# Motion loading (both NPZ flavors)
# ---------------------------------------------------------------------------

def load_motion_local_mats(anim_path, dataset_type=None, cond_path=None):
    """Return ``(anim_local (F,J,4,4), rest_local (J,4,4), bone_names, fps,
    rest_global (J,4,4))``.

    Auto-detects the NPZ flavor: export-stage (self-contained) vs
    feature-format (generated motion; resolved through ``cond.npy`` exactly
    like :mod:`animate_motion`).
    """
    data = np.load(anim_path, allow_pickle=True)
    if 'anim_local_rot' in data:
        from data_process.mesh_animation.animate_npz import build_anims_from_export_npz
        anim, rest_anim, names = build_anims_from_export_npz(data)
        fps = npz_scalar(data, 'fps', 30)
    elif 'local_rotations' in data:
        from data_process.mesh_animation.animate_motion import (
            COND_PATH_TEMPLATE,
            build_anim_from_npz,
            load_cond_data,
        )
        # Either flag resolves the cond: --dataset_type picks the dataset's
        # default cond.npy (and the 'mixamo' key), --cond_path names the file
        # directly (object type from the clip's filename prefix, or the file's
        # single entry — a rig_preprocess cond has exactly one).
        if not dataset_type and not cond_path:
            raise RuntimeError(
                "feature-format motion needs --dataset_type and/or --cond_path "
                "(omit both only for a canonical asset: rig_preprocess, "
                "canonical_assets.py)")
        cond_path = cond_path or COND_PATH_TEMPLATE.format(dataset_type=dataset_type)
        cond_data = load_cond_data(cond_path, anim_path, dataset_type)
        anim, rest_anim, _tpos, raw = build_anim_from_npz(anim_path, cond_data)
        names = list(cond_data['joint_names'])
        fps = npz_scalar(raw, 'fps', 30)
    else:
        raise RuntimeError(
            f"Unrecognized motion NPZ (keys: {sorted(data.keys())}); expected "
            "export-stage ('anim_local_rot', ...) or feature format "
            "('local_rotations', ...)")
    return (transforms_local(anim), transforms_local(rest_anim)[0],
            [str(n) for n in names], fps, transforms_global(rest_anim)[0])


def motion_from_canonical_char(data, skin):
    """Feature NPZ driving a canonical asset (``rig_preprocess`` or ``canonical_assets.py`` output).

    The asset's own skeleton IS the motion skeleton: joint order = bone
    order, rest pose = the asset's rest, scale = 1 — so no ``cond.npy`` is
    needed. Root positions come from ``global_positions``; every other joint
    keeps its rest offset (rigid bones), rotations from ``local_rotations``.
    A Mixamo character other than the clips' rig stores the clips' rest root
    (``canonical_motion_rest_root``): its root then moves by the clip's change
    from that rest, starting from its own rest root, as :mod:`animate_motion`
    retargets the root, so its feet stay on the ground.
    """
    q = np.asarray(data['local_rotations'], dtype=np.float64)     # (F, J, 4) wxyz
    gp = np.asarray(data['global_positions'], dtype=np.float64)   # (F, J, 3)

    order = skin.get('canonical_order')
    if order is None:
        logger.warning("Asset carries no canonical_joint_order property (not "
                       "produced by rig_preprocess / canonical_assets.py?); "
                       "assuming its bone "
                       "enumeration order matches the motion's joint order")
        order = list(skin['bone_names'])
    J = len(order)
    assert q.shape[1] == J, (
        f"motion has {q.shape[1]} joints but the asset's canonical skeleton "
        f"has {J} bones; the cond-free path needs an asset baked to the "
        f"motion skeleton (rig_preprocess, canonical_assets.py) — or pass "
        f"--dataset_type/--cond_path")
    missing = [n for n in order if n not in skin['bone_names']]
    assert not missing, f"canonical_joint_order names missing from armature: {missing}"

    idx = [skin['bone_names'].index(n) for n in order]
    rest_local = skin['rest_local'][idx]                 # motion joint order
    pos = np.repeat(rest_local[None, :, :3, 3], q.shape[0], axis=0)
    pos[:, 0] = gp[:, 0]
    if skin.get('motion_rest_root') is not None:
        pos[:, 0] += rest_local[0, :3, 3] - skin['motion_rest_root']
    anim_local = quat_pos_to_mats(q, pos)
    return anim_local, rest_local, list(order), npz_scalar(data, 'fps', 30)


# ---------------------------------------------------------------------------
# Manual LBS
# ---------------------------------------------------------------------------

def lbs_deform(skin, anim_local, motion_rest_local, motion_bone_names, conj=None):
    """Run manual Linear Blend Skinning; returns world-space ``(F, V, 3)``.

    Per frame and asset bone (*conj*: optional ``(J, 3, 3)`` per-motion-bone
    rotations from :func:`motion_axis_alignment`, conjugating ``rel``)::

        pose_local[b] = rest_local[b] @ inv(m_rest[b]) @ m_anim[f, b]   (driven)
        pose_local[b] = rest_local[b]                                    (undriven)
        G[f, b]       = G[f, parent] @ pose_local[b]
        skin_mat[b]   = G[f, b] @ inv(rest_global[b])
        v[f]          = sum_b w[v, b] * skin_mat[b] @ v_rest

    which is exactly what the Blender armature modifier evaluates for the
    Action built by the keyframe path, so the two pipelines are
    interchangeable.
    """
    bone_names = skin['bone_names']
    parents = skin['parents']
    nframes = anim_local.shape[0]
    nbones = len(bone_names)

    motion_idx = {n: i for i, n in enumerate(motion_bone_names)}
    driven = [(b, motion_idx[n]) for b, n in enumerate(bone_names) if n in motion_idx]
    missing = [n for n in motion_bone_names if n not in set(bone_names)]
    if missing:
        logger.warning(f"{len(missing)} motion bones not on the asset "
                       f"(ignored): {missing[:8]}{'...' if len(missing) > 8 else ''}")
    undriven = nbones - len(driven)
    if undriven:
        logger.info(f"{undriven} asset bones not in the motion keep their rest "
                    f"local transform (follow parent)")
    assert driven, "No motion bone matches the asset's armature by name"

    # Per-frame local transforms for every asset bone.
    pose_local = np.broadcast_to(skin['rest_local'], (nframes, nbones, 4, 4)).copy()
    for b, j in driven:
        rel = np.linalg.inv(motion_rest_local[j])[None] @ anim_local[:, j]
        if conj is not None:
            C = np.eye(4)
            C[:3, :3] = conj[j]
            rel = C.T[None] @ rel @ C[None]
        pose_local[:, b] = skin['rest_local'][b][None] @ rel

    # FK to armature space (bones are stored parent-before-child in Blender).
    glob = np.empty_like(pose_local)
    for b in range(nbones):
        p = parents[b]
        glob[:, b] = pose_local[:, b] if p < 0 else glob[:, p] @ pose_local[:, b]

    skin_mats = glob @ np.linalg.inv(skin['rest_global'])[None]   # (F, N, 4, 4)

    # LBS: blend matrices per vertex, then transform.
    verts = skin['vertices']                                      # (V, 4)
    weights = skin['weights']                                     # (V, N)
    unskinned = weights.sum(axis=1) == 0
    out = np.empty((nframes, len(verts), 3))
    for f in range(nframes):
        vert_mats = np.einsum('vb,bij->vij', weights, skin_mats[f])
        deformed = np.einsum('vij,vj->vi', vert_mats, verts)
        deformed[unskinned] = verts[unskinned]
        out[f] = (deformed @ skin['arm_world'].T)[:, :3]
    return out


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def save_obj_sequence(dirpath, vertices, faces):
    os.makedirs(dirpath, exist_ok=True)
    face_lines = ["f " + " ".join(str(i + 1) for i in poly) for poly in faces]
    for f in range(vertices.shape[0]):
        with open(os.path.join(dirpath, f"{f:04d}.obj"), 'w') as fh:
            fh.write("\n".join(f"v {x:.6f} {y:.6f} {z:.6f}" for x, y, z in vertices[f]))
            fh.write("\n" + "\n".join(face_lines) + "\n")
    logger.info(f"Saved {vertices.shape[0]} OBJ frames to {dirpath}")


def resolve_lbs_char(anim_path, dataset_type, character=None):
    """The processed asset for a motion (module docstring): canonical for a
    feature NPZ, export for an export NPZ."""
    if not dataset_type:
        raise ValueError("--char_path is required without --dataset_type")
    kind = 'canonical' if is_feature_motion(anim_path) else 'export'
    return resolve_processed_asset(anim_path, dataset_type, kind, character)


def animate_lbs(char_path, anim_path, output_dir, dataset_type=None,
                cond_path=None, save=('glb',), character=None):
    """Deform a rigged asset with a motion NPZ via manual LBS and save.
    *char_path* None: :func:`resolve_lbs_char`."""
    assert os.path.exists(anim_path), f"Animation file not found: {anim_path}"
    if not anim_path.endswith('.npz'):
        raise ValueError(
            f"{anim_path}: animate_lbs reads motion NPZs (stage-1 export or stage-4 "
            f"feature format). Drive a sampler .npy with animate_motion "
            f"(scripts/run_animate_motion.sh <samples_dir>).")
    os.makedirs(output_dir, exist_ok=True)
    char_path = char_path or resolve_lbs_char(anim_path, dataset_type, character)

    rig_formats = tuple(f for f in save if f in ('glb', 'fbx'))
    char_armature = load_character(char_path, pack_textures=bool(rig_formats))
    skin = extract_skin(char_armature)

    data = np.load(anim_path, allow_pickle=True)
    if 'local_rotations' in data and (is_canonical_asset(char_armature)
                                      or (dataset_type is None and cond_path is None)):
        logger.info("Feature NPZ on a canonical asset: the asset is the motion "
                    "skeleton (no cond)")
        if cond_path is not None:
            logger.warning(f"--cond_path {cond_path} not used: the canonical asset "
                           f"carries the motion's skeleton")
        anim_local, rest_local, motion_names, fps = motion_from_canonical_char(data, skin)
        conj = None
    else:
        anim_local, rest_local, motion_names, fps, rest_global = load_motion_local_mats(
            anim_path, dataset_type=dataset_type, cond_path=cond_path)
        # The asset's bone axes may differ from the motion's.
        conj = motion_axis_alignment(rest_global, motion_names,
                                     skin['rest_global'], skin['bone_names'])

    vertices = lbs_deform(skin, anim_local, rest_local, motion_names, conj=conj)

    stem = os.path.splitext(os.path.basename(anim_path))[0] + '_lbs'
    faces_arr = np.array(skin['faces'], dtype=object)
    if 'npz' in save:
        out = os.path.join(output_dir, stem + '.npz')
        np.savez_compressed(out, vertices=vertices.astype(np.float32),
                            faces=faces_arr, fps=fps,
                            frame_count=vertices.shape[0])
        logger.info(f"Saved LBS vertex animation: {out} "
                    f"(F={vertices.shape[0]}, V={vertices.shape[1]})")
    if 'obj' in save:
        save_obj_sequence(os.path.join(output_dir, stem), vertices, skin['faces'])
    if rig_formats:
        # Rigged export via the same keyframe path animate_npz uses: the
        # relative keyframes inv(rest) @ anim land on the asset's own rest,
        # exactly what lbs_deform evaluates. Bones absent from the motion
        # keep their rest local transform (no keyframes = follow parent),
        # matching the LBS 'keep' semantics.
        set_scene_timing(anim_local.shape[0], fps)
        keyframes = compute_bone_keyframes(
            rest_local, anim_local, motion_names,
            None if conj is None else rotations_to_quats(conj))
        rebuild_action_from_data(char_armature, keyframes)
        update_scene()
        export_animated_character(os.path.join(output_dir, stem),
                                  formats=rig_formats)
    return vertices


# Outputs ``--save`` can ask for (see animate_lbs).
SAVE_FORMATS = ('glb', 'fbx', 'npz', 'obj')


def parse_args():
    parser = argparse.ArgumentParser(
        description="Animate a rigged asset via manual NumPy LBS.")
    parser.add_argument("--char_path", type=str, default=None,
                        help="Rigged asset GLB/FBX (mesh + armature + weights). Default with "
                             "--dataset_type: the processed asset (module docstring).")
    parser.add_argument("--character", type=str, default=None,
                        help=f"Mixamo character for the auto-resolved asset "
                             f"(default {DEFAULT_MIXAMO_CHARACTER}).")
    parser.add_argument("--anim_path", type=str, required=True,
                        help="Motion NPZ (export-stage or feature-format, auto-detected), "
                             "or a DIRECTORY of NPZs — one output set per action clip.")
    parser.add_argument("--dataset_type", type=str, default=None,
                        choices=['truebones', 'objaverse', 'mixamo', 'general'],
                        help="Resolves --char_path when omitted (the processed asset of "
                             "the clip: canonical for a feature NPZ, export for an export "
                             "NPZ) and, for a feature NPZ on a non-canonical asset, "
                             "cond.npy. A canonical asset is always driven cond-free.")
    parser.add_argument("--cond_path", type=str, default=None,
                        help="cond.npy override for feature-format motion.")
    parser.add_argument("--output_dir", type=str, default='outputs/lbs')
    parser.add_argument("--save", type=str, default='glb',
                        help="Comma-separated outputs: glb / fbx (animated rigged "
                             "asset via the animate_npz keyframe path; default), "
                             "npz (vertex animation), obj (per-frame OBJ files).")
    return parse_blender_argv(parser)


if __name__ == "__main__":
    args = parse_args()
    save = tuple(s.strip() for s in args.save.split(',') if s.strip())
    unknown = sorted(set(save) - set(SAVE_FORMATS))
    if unknown or not save:
        raise SystemExit(f"--save {args.save!r}: expected a comma-separated subset of "
                         f"{', '.join(SAVE_FORMATS)}")

    if os.path.isdir(args.anim_path):
        import glob as _glob
        from data_process.mesh_animation.common import run_clip_batch
        clips = sorted(_glob.glob(os.path.join(args.anim_path, '*.npz')))
        logger.info(f"Animating {len(clips)} clip(s) from {args.anim_path} — "
                    f"one output set per action")
        run_clip_batch(
            clips,
            lambda clip: animate_lbs(
                char_path=args.char_path, anim_path=clip,
                output_dir=args.output_dir, dataset_type=args.dataset_type,
                cond_path=args.cond_path, save=save, character=args.character),
            output_dir=args.output_dir,
            desc="LBS animating",
        )
    else:
        animate_lbs(
            char_path=args.char_path,
            anim_path=args.anim_path,
            output_dir=args.output_dir,
            dataset_type=args.dataset_type,
            cond_path=args.cond_path,
            save=save,
            character=args.character,
        )
