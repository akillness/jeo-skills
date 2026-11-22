"""Rebuild a rigged asset to a cond's canonical T-pose (bpy).

:func:`bake_canonical_asset` writes the rest-pose asset whose armature is the
stage-4 motion skeleton itself: the cond's joint order, canonical rest positions
and ``tpos_global_rotations``, in the Y-up feature frame (scale and grounding of
the training clips), so a feature clip drives it with no ``cond.npy``
(``animate_lbs``, cond-free). Used by ``feature_extraction/canonical_assets.py`` (a dataset's export assets,
also run by ``data_process.rig_preprocess`` for one asset).
"""

import json
import math

import bpy
import numpy as np
from loguru import logger
from mathutils import Matrix

from data_process.mesh_animation.common import load_character, quat_pos_to_mats
from data_process.utils.blender_export import clear_animation_state
from data_process.utils.blender_rig import (
    export_selected_to_file,
    find_skinned_meshes,
    rename_truncated_bones,
    select_objs,
    skin_rigid_parts,
    sync_armature_bones,
    update_scene,
)
from data_process.utils.skeleton import line_ratio, similarity_fit

# Largest rig-to-cond joint residual (relative to the extent) the fit accepts.
FIT_TOL = 5e-3
# Largest roll (radians) the fit may leave undetermined about a nearly straight
# skeleton, estimated as residual / line_ratio.
ROLL_TOL = 0.02


class UndeterminedRoll(ValueError):
    """The similarity fit cannot pin the skeleton's roll about its line."""


def transform_mesh_points(mesh, T):
    """Apply the affine ``(4, 4)`` *T* to every vertex of *mesh* and to the
    points of every shape key (a mesh with shape keys is evaluated and
    exported from its key blocks, not from ``vertices``). *T* being affine,
    each key's offsets from the basis move with it."""
    def moved(points):
        co = np.empty(len(points) * 3)
        points.foreach_get('co', co)
        co = co.reshape(-1, 3) @ T[:3, :3].T + T[:3, 3]
        points.foreach_set('co', co.ravel())

    moved(mesh.vertices)
    if mesh.shape_keys is not None:
        for key_block in mesh.shape_keys.key_blocks:
            moved(key_block.data)
    mesh.update()


def bake_canonical_asset(char_path, cond, out_base, formats=('glb',), extra_props=None):
    """Rebuild the asset's armature to the cond's canonical T-pose and save.

    The canonical skeleton (joint order, rest positions/orientations) is
    taken verbatim from the topology cond so the baked asset and the motion
    features agree by construction. The skinned mesh gets the same
    similarity transform, so binding is untouched; asset bones outside the
    motion skeleton are weight-merged away first. *extra_props* are stored
    as further object-level custom properties on the armature (glTF extras),
    beside ``canonical_joint_order``.
    """
    names = list(cond['joint_names'])
    canon_parents = [int(p) for p in cond['parents']]
    canon_pos = np.asarray(cond['tpos_first_frame'], dtype=np.float64)
    canon_mats = quat_pos_to_mats(
        np.asarray(cond['tpos_global_rotations'], dtype=np.float64), canon_pos)

    armature = load_character(char_path)
    rename_truncated_bones(armature, names)
    # Rigid parts (bone- or armature-parented meshes) would otherwise be
    # dropped below with the props; bind them to their bone first.
    skin_rigid_parts(armature)
    meshes = find_skinned_meshes(armature)
    assert meshes, "No mesh with an Armature modifier targeting the asset's armature"

    # The canonical asset holds ONLY the rigged character: drop unskinned
    # props, lights, cameras, helper empties (e.g. the egg Icosphere in
    # Truebones' Chicken-EggLaying) — they can't be driven by the motion and
    # would linger as static junk in the export.
    keep = {armature.name} | {m.name for m in meshes}
    dropped = [o.name for o in bpy.context.scene.objects if o.name not in keep]
    for name_ in dropped:
        bpy.data.objects.remove(bpy.data.objects[name_], do_unlink=True)
    if dropped:
        logger.info(f"Dropped {len(dropped)} non-skinned scene object(s): {dropped[:6]}")

    missing = [n for n in names if n not in armature.data.bones]
    assert not missing, f"cond joints missing from the asset: {missing}"
    sync_armature_bones(armature, names, extra_bones_strategy='merge')

    # Similarity mapping Blender world -> canonical frame: the whole export +
    # extract chain is one similarity of the world frame; fit it on the bone
    # heads and verify the residual (a current import may read the bind pose
    # of an older export up to ~2e-3 apart; more is another skeleton).
    arm_world = np.array(armature.matrix_world)
    bones = armature.data.bones
    world_pos = np.stack([
        (arm_world @ np.array(bones[n].matrix_local))[:3, 3] for n in names])
    R, sim_scale, t, resid = similarity_fit(world_pos, canon_pos)
    if resid > FIT_TOL:
        raise ValueError(f"world->canonical is not a clean similarity (residual {resid:.2e} "
                         f"of the extent); non-uniform armature scale, or the cond belongs "
                         f"to another asset?")
    straightness = line_ratio(canon_pos)
    if resid > ROLL_TOL * straightness:
        raise UndeterminedRoll(
            f"nearly straight skeleton (line ratio {straightness:.1e}) fitted with residual "
            f"{resid:.1e}: its roll about the joint line is uncertain by about "
            f"{resid / max(straightness, 1e-12):.2f} rad")
    if resid > 1e-4:
        logger.warning(f"Rig joints are {resid:.1e} of the extent from the cond's T-pose; "
                       f"the bones are placed at the cond's")
    M = np.eye(4)
    M[:3, :3] = sim_scale * R
    M[:3, 3] = t

    # Transform every skinned mesh into the canonical frame. Un-parent BEFORE
    # zeroing transforms: the meshes hang under the armature, so identity-ing
    # the armature afterwards would shift any still-parented mesh again. A
    # mesh shared by several objects is copied first, or its vertices would
    # be moved once per object.
    for mesh_obj in meshes:
        if mesh_obj.data.users > 1:
            mesh_obj.data = mesh_obj.data.copy()
    for mesh_obj in meshes:
        transform_mesh_points(mesh_obj.data, M @ np.array(mesh_obj.matrix_world))
        mesh_obj.parent = None
        mesh_obj.matrix_world = Matrix.Identity(4)

    # Rebuild the armature: canonical rest, canonical (BFS) bone order.
    old_lengths = {n: bones[n].length for n in names}
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode='EDIT')
    edit_bones = armature.data.edit_bones
    for eb in list(edit_bones):
        edit_bones.remove(eb)
    child_of = {p: j for j, p in enumerate(canon_parents) if p >= 0}
    for j, name in enumerate(names):
        eb = edit_bones.new(name)
        eb.head = (0.0, 0.0, 0.0)
        eb.tail = (0.0, 1.0, 0.0)
        length = (np.linalg.norm(canon_pos[child_of[j]] - canon_pos[j])
                  if j in child_of else old_lengths[name] * sim_scale)
        eb.matrix = Matrix(canon_mats[j].tolist())
        eb.length = max(float(length), 1e-5)
    for j, name in enumerate(names):
        if canon_parents[j] >= 0:
            eb = edit_bones[name]
            eb.use_connect = False
            eb.parent = edit_bones[names[canon_parents[j]]]
    bpy.ops.object.mode_set(mode='OBJECT')
    # ARMATURE-SPACE data stays exactly canonical (Y-up feature frame) — the
    # cond-free animate math lives there. The +90°X OBJECT rotation stands
    # the asset up in Blender's Z-up world; verified with an independent
    # glTF evaluator, the exported file is upright BOTH in standard Y-up
    # viewers and when re-imported into Blender.
    yup_to_zup = Matrix.Rotation(math.radians(90.0), 4, 'X')
    armature.matrix_world = yup_to_zup
    for mesh_obj in meshes:            # re-parent with identity LOCAL transforms
        mesh_obj.parent = armature
        mesh_obj.matrix_world = yup_to_zup.copy()

    # Strip animation; store the canonical joint ORDER as an OBJECT-level
    # custom property (glTF extras / FBX user properties) — importers do not
    # keep bone enumeration order stable.
    clear_animation_state(armature)
    for obj in meshes:
        if obj.animation_data:
            obj.animation_data_clear()
    # Unbinding is not enough: the glTF exporter's default animation mode
    # exports every matchable ACTION datablock, bound or not — delete them
    # all so the canonical asset is truly rest-only.
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    update_scene()
    armature['canonical_joint_order'] = json.dumps(names)
    for key, value in (extra_props or {}).items():
        armature[key] = value

    select_objs([armature] + meshes, deselect_first=True)
    for fmt in formats:
        assert fmt in ('glb', 'fbx'), f"unsupported output format: {fmt}"
        export_selected_to_file(f'{out_base}.{fmt}', fmt, custom_props=True)
