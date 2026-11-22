"""Build the export stage's processed assets (bpy).

``export_asset_glb`` writes ``<export>/rigs/<asset>.glb``: the asset in its
rest pose on the export's pruned skeleton, without animation, textures
embedded and checked (layout and notes: :mod:`data_process.utils.asset_files`).
The exporters call it through :func:`build_asset_glb` / :func:`add_asset_glb`,
which record a failure instead of raising.
"""

import glob
import os

import bpy
import numpy as np
from loguru import logger
from mathutils import Matrix

from data_process.utils.asset_files import (
    GLB_ERRORS_DIR,
    PROCESSED_GLB_DIR,
    TEXTURE_ISSUES_DIR,
    check_glb_textures,
    log_other_skeletons,
    main_skeleton_clips,
    processed_glb_path,
    write_note,
)
from data_process.utils.blender_rig import (
    build_ancestor_map,
    export_selected_to_file,
    find_skinned_meshes,
    rename_truncated_bones,
    repair_and_pack_textures,
    select_objs,
    sync_armature_bones,
    update_scene,
)
from data_process.utils.kinematics import clip_global, rest_global
from data_process.utils.skeleton import similarity_fit


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def _node_tree_images(node_tree, seen_groups=None):
    """Images of every Image Texture node in *node_tree*, through node groups."""
    seen_groups = set() if seen_groups is None else seen_groups
    images = set()
    for node in node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image is not None:
            images.add(node.image)
        elif node.type == 'GROUP' and node.node_tree is not None \
                and node.node_tree.name not in seen_groups:
            seen_groups.add(node.node_tree.name)
            images |= _node_tree_images(node.node_tree, seen_groups)
    return images


def material_images(objs):
    """Images the materials of *objs* use (any node depth)."""
    images = set()
    for obj in objs:
        for slot in getattr(obj, 'material_slots', ()):
            mat = slot.material
            if mat is not None and mat.use_nodes and mat.node_tree is not None:
                images |= _node_tree_images(mat.node_tree)
    return images


def _upstream_nodes(socket):
    """Every node feeding *socket*, transitively."""
    seen, stack = set(), [link.from_node for link in socket.links]
    while stack:
        node = stack.pop()
        if node in seen:
            continue
        seen.add(node)
        stack.extend(link.from_node for inp in node.inputs for link in inp.links)
    return seen


def _material_output(mat):
    """The active Material Output node of *mat*, or None."""
    if not mat.use_nodes or mat.node_tree is None:
        return None
    outputs = [n for n in mat.node_tree.nodes if n.type == 'OUTPUT_MATERIAL']
    return next((n for n in outputs if n.is_active_output), outputs[0] if outputs else None)


def _surface_images(mat):
    """Names of the images feeding the surface of *mat*'s active output."""
    out = _material_output(mat)
    if out is None:
        return set()
    return {n.image.name for n in _upstream_nodes(out.inputs['Surface'])
            if n.type == 'TEX_IMAGE' and n.image is not None}


def principled_from_specgloss(objects):
    """Rebuild glTF spec-gloss materials as a Principled BSDF the exporter reads.

    Blender's glTF importer turns a ``KHR_materials_pbrSpecularGlossiness``
    material into Diffuse + Glossy (+ Emission, + a Transparent mix), which its
    exporter cannot translate, so it would write the material without its
    diffuse image. A material whose
    output is fed by a Diffuse BSDF and no Principled BSDF gets a Principled
    BSDF wired to the output: Base Color from the Diffuse color, Normal from
    the Diffuse normal, Emission from the Emission node, Alpha from the
    Transparent mix factor, metallic 0, and the Glossy roughness when it is a
    value. The old nodes stay, unconnected. The specular-glossiness map has no
    slot in a metallic-roughness material (it would have to be baked into a
    new image), so it is not carried, and a roughness that came from it falls
    back to the Principled default (0.5).

    Returns ``(converted material names, names of the images no material
    surface uses any more)``.
    """
    mats = {slot.material for obj in objects if obj.type == 'MESH'
            for slot in obj.material_slots if slot.material is not None}
    converted, before = [], set()
    for mat in mats:
        out = _material_output(mat)
        if out is None or not out.inputs['Surface'].is_linked:
            continue
        upstream = _upstream_nodes(out.inputs['Surface'])
        types = {n.type for n in upstream}
        if 'BSDF_PRINCIPLED' in types or 'BSDF_DIFFUSE' not in types:
            continue
        before |= _surface_images(mat)
        tree = mat.node_tree
        first = lambda kind: next((n for n in upstream if n.type == kind), None)  # noqa: E731
        diffuse, glossy, emission = first('BSDF_DIFFUSE'), first('BSDF_GLOSSY'), first('EMISSION')
        bsdf = tree.nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.location = (out.location.x - 300, out.location.y - 300)

        def carry(src, dst):
            if src.is_linked:
                tree.links.new(src.links[0].from_socket, dst)
            else:
                dst.default_value = src.default_value

        carry(diffuse.inputs['Color'], bsdf.inputs['Base Color'])
        if diffuse.inputs['Normal'].is_linked:
            carry(diffuse.inputs['Normal'], bsdf.inputs['Normal'])
        bsdf.inputs['Metallic'].default_value = 0.0
        if glossy is not None and not glossy.inputs['Roughness'].is_linked:
            bsdf.inputs['Roughness'].default_value = glossy.inputs['Roughness'].default_value
        if emission is not None:
            carry(emission.inputs['Color'], bsdf.inputs.get('Emission Color') or bsdf.inputs['Emission'])
            bsdf.inputs['Emission Strength'].default_value = emission.inputs['Strength'].default_value
        for mix in (n for n in upstream if n.type == 'MIX_SHADER'):
            # result = (1 - Fac) * Shader_1 + Fac * Shader_2: opacity is Fac
            # when the first shader is the Transparent BSDF.
            first_shader = mix.inputs[1].links[0].from_node if mix.inputs[1].is_linked else None
            if first_shader is not None and first_shader.type == 'BSDF_TRANSPARENT':
                carry(mix.inputs['Fac'], bsdf.inputs['Alpha'])
                break
        tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
        converted.append(mat.name)
    # An image is dropped only if no material surface uses it any more.
    dropped = before - set().union(*(_surface_images(m) for m in mats)) if converted else set()
    if converted:
        logger.info(f"Rebuilt {len(converted)} spec-gloss material(s) as Principled BSDF: "
                    f"{sorted(converted)[:4]}"
                    + (f"; spec-gloss map(s) not carried: {sorted(dropped)}" if dropped else ''))
    return converted, dropped


# Weights Blender uses to read a colour linked into a float socket.
_LUMINANCE = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def _roughness_from_gloss(gloss):
    """A packed, non-colour image holding ``1 - gloss`` (*gloss* read as
    luminance), or None when *gloss* has no pixel data."""
    w, h = gloss.size
    if not (w and h and gloss.has_data):
        logger.warning(f"Gloss map '{gloss.name}' has no pixel data; left as roughness")
        return None
    px = np.empty(w * h * gloss.channels, dtype=np.float32)
    gloss.pixels.foreach_get(px)
    px = px.reshape(-1, gloss.channels)
    rough = 1.0 - (px[:, :3] @ _LUMINANCE if gloss.channels >= 3 else px[:, 0])
    out = np.ones((w * h, 4), dtype=np.float32)
    out[:, :3] = np.clip(rough, 0.0, 1.0)[:, None]
    # Named after the map's file (FBX image datablocks are often 'file6').
    stem = os.path.splitext(bpy.path.basename(gloss.filepath) or gloss.name)[0]
    image = bpy.data.images.new(f"{stem}_roughness", w, h)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(out.ravel())
    image.file_format = 'PNG'
    image.pack()
    return image


def pbr_from_fbx_phong(objects):
    """Convert the Phong values Blender's FBX importer writes into a Principled
    BSDF to the metallic-roughness values they stand for.

    - Metallic: the importer copies FBX ``ReflectionFactor`` (or a reflection
      map), an environment-reflection strength rather than metalness, which
      the glTF exporter would write as metal. It becomes 0.
    - Roughness: a ``ShininessExponent`` texture is a gloss map (bright =
      shiny) that the importer links to Roughness unchanged. It is replaced by
      a packed image of ``1 - gloss``, gloss read as Blender reads a colour in
      a float socket (luminance).

    Specular keeps the importer's mapping (``SpecularFactor * 2``). Returns ``(materials whose metallic was reset,
    {gloss image name: roughness image name})``.
    """
    mats = {slot.material for obj in objects if obj.type == 'MESH'
            for slot in obj.material_slots if slot.material is not None}
    reset, inverted = [], {}
    for mat in mats:
        if not mat.use_nodes or mat.node_tree is None:
            continue
        tree = mat.node_tree
        for bsdf in [n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED']:
            metallic = bsdf.inputs['Metallic']
            if metallic.is_linked or metallic.default_value != 0.0:
                for link in list(metallic.links):
                    tree.links.remove(link)
                metallic.default_value = 0.0
                reset.append(mat.name)
            roughness = bsdf.inputs['Roughness']
            if not roughness.is_linked:
                continue
            link = roughness.links[0]
            node = link.from_node
            if node.type != 'TEX_IMAGE' or node.image is None or link.from_socket.name != 'Color':
                continue
            if sum(len(out.links) for out in node.outputs) > 1:
                logger.warning(f"'{mat.name}': gloss texture node also feeds other inputs; "
                               f"left as roughness")
                continue
            gloss = node.image
            if gloss.name not in inverted:
                inverted[gloss.name] = _roughness_from_gloss(gloss)
            if inverted[gloss.name] is not None:
                node.image = inverted[gloss.name]
    inverted = {k: v.name for k, v in inverted.items() if v is not None}
    if reset or inverted:
        logger.info(f"FBX materials: metallic reset to 0 on {len(set(reset))}, "
                    f"gloss map(s) inverted to roughness: {sorted(inverted)[:4]}")
    return sorted(set(reset)), inverted


# ---------------------------------------------------------------------------
# Scene preparation
# ---------------------------------------------------------------------------

def _strip_to_rig(armature, kept_bones):
    """Reduce the scene to *armature* and the meshes that belong to it.

    Belonging = skinned to it (Armature modifier) or parented under it, the
    rule the renderer uses (``blender_render.keep_armature_meshes``); other
    meshes and armatures are deleted, among them armatures nested under this
    one with everything below them and the meshes they deform, except
    ancestors of what is kept (their transforms place the rig; empties are
    never deleted). A mesh parented to a bone that is about to be pruned moves
    to the bone that takes that bone's weights (:func:`build_ancestor_map`:
    the nearest kept ancestor, for a dropped root the kept bone below it),
    keeping its rest-pose world transform. Bone constraints and drivers go,
    and every bone gets the standard inheritance (rotation, full scale, local
    location): an NPZ replayed onto the asset is keyed as ``rest^-1 @ local``
    (``compute_bone_keyframes``), which reproduces the exported pose under
    exactly those rules, as glTF assumes.

    Raises:
        ValueError: no mesh belongs to the armature.
    """
    def deformed_by_other(obj):
        return any(mod.type == 'ARMATURE' and mod.object is not None and mod.object != armature
                   for mod in getattr(obj, 'modifiers', ()))

    def under_other_armature(obj):
        node = obj.parent
        while node is not None and node != armature:
            if node.type == 'ARMATURE':
                return True
            node = node.parent
        return False

    # Other armatures under this one, what hangs below them, and meshes they
    # deform are another rig: a second armature would confuse character loading.
    rig = {armature} | set(find_skinned_meshes(armature)) | {
        o for o in armature.children_recursive
        if o.type != 'ARMATURE' and not deformed_by_other(o) and not under_other_armature(o)}
    keep = set(rig)
    for obj in rig:
        parent = obj.parent
        while parent is not None:
            keep.add(parent)
            parent = parent.parent
    for obj in list(bpy.context.scene.objects):
        if obj.type in ('MESH', 'ARMATURE') and obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    if not any(o.type == 'MESH' for o in rig):
        raise ValueError(f"no mesh is skinned to or parented under armature '{armature.name}'")

    # Re-parent in the rest pose, so the result does not depend on the frame
    # the scene was left at (last extracted frame vs. freshly imported).
    pose_position = armature.data.pose_position
    armature.data.pose_position = 'REST'
    update_scene()
    target_of = build_ancestor_map(armature, kept_bones)
    for obj in list(armature.children_recursive):
        if obj.parent != armature or obj.parent_type != 'BONE' \
                or obj.parent_bone in kept_bones:
            continue
        target = target_of.get(obj.parent_bone)
        world = obj.matrix_world.copy()
        if target is None:
            obj.parent_type = 'OBJECT'
            obj.parent_bone = ''
        else:
            obj.parent_bone = target
        update_scene()
        obj.matrix_world = world
        logger.info(f"Re-parented '{obj.name}' to "
                    f"{'the armature' if target is None else repr(target)} (bone pruned)")
    armature.data.pose_position = pose_position

    for bone in armature.data.bones:
        bone.use_inherit_rotation = True
        bone.inherit_scale = 'FULL'
        bone.use_local_location = True
    for pose_bone in armature.pose.bones:
        for constraint in list(pose_bone.constraints):
            pose_bone.constraints.remove(constraint)
    if armature.animation_data is not None:
        for driver in list(armature.animation_data.drivers):
            armature.animation_data.drivers.remove(driver)
    update_scene()


def _set_armature_world(armature, new):
    """Give *armature* the world matrix *new*; meshes outside its hierarchy keep
    their armature-relative pose explicitly, its descendants follow it."""
    old = np.array(armature.matrix_world)
    inside = set(armature.children_recursive)
    others = [(o, np.linalg.inv(old) @ np.array(o.matrix_world))
              for o in bpy.context.scene.objects
              if o.type == 'MESH' and o not in inside]
    armature.matrix_world = Matrix(np.asarray(new).tolist())
    update_scene()
    for obj, rel in others:
        obj.matrix_world = Matrix((np.asarray(new) @ rel).tolist())
    update_scene()


# Export space is Blender's world turned -90 degrees about X (Y-up).
_EXPORT_FROM_BLENDER = np.array([[1., 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]])


def _rotate_rest(armature, fix, names, rest_pos):
    """Move the whole rig by the rest-orientation fix an export NPZ records
    (``rest_orientation_applied``: quat w, x, y, z then an optional offset, export
    space; the NPZ's rest is already ``p -> quat * p + offset`` of the original).

    The rig's rest joints match the original NPZ rest up to a similarity (scale,
    and possibly a constant offset that replay cancels); the fix is applied in that
    frame, so the rig ends up related to the fixed NPZ exactly as it was to the
    original one. *rest_pos* is the fixed NPZ's rest (export space)."""
    fix = np.asarray(fix, dtype=np.float64)
    w, x, y, z = fix[:4] / np.linalg.norm(fix[:4])
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
                  [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
                  [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])
    t = fix[4:7] if len(fix) >= 7 else np.zeros(3)
    C = _EXPORT_FROM_BLENDER
    arm_world = np.array(armature.matrix_world)
    bones = armature.data.bones
    keep = [j for j, n in enumerate(names) if n in bones]
    heads = np.stack([(C @ arm_world @ np.array(bones[names[j]].matrix_local))[:3, 3] for j in keep])
    original = (np.asarray(rest_pos)[keep] - t) @ R          # R^T (p - t), row vectors
    Rf, scale, delta, _ = similarity_fit(original, heads)    # heads ~ scale Rf original + delta
    A = Rf @ R @ Rf.T
    X = np.eye(4)
    X[:3, :3] = A
    X[:3, 3] = delta - A @ delta + scale * Rf @ t
    _set_armature_world(armature, np.linalg.inv(C) @ X @ C @ arm_world)


def _similarity_armature_frame(armature, tol=1e-3):
    """Give *armature* the nearest proper similarity of its world transform.

    Export NPZs store the skeleton in armature space, and a rotation-only
    skeleton cannot carry a non-uniform or mirroring object scale. When the
    armature's world matrix has one (singular values differing by more than
    *tol*, or a negative determinant), it is replaced by its polar rotation
    (made proper) times the mean scale, keeping its translation; meshes keep
    their placement relative to the armature, so the asset becomes its
    armature-space shape, the one its clips animate. Returns True when changed.
    """
    M = np.array(armature.matrix_world)
    U, sv, Vt = np.linalg.svd(M[:3, :3])
    det = np.linalg.det(M[:3, :3])
    if sv.max() / max(sv.min(), 1e-12) - 1 <= tol and det > 0:
        return False
    R = U @ np.diag([1.0, 1.0, np.sign(np.linalg.det(U @ Vt))]) @ Vt
    new = np.eye(4)
    new[:3, :3] = R * np.cbrt(abs(det))
    new[:3, 3] = M[:3, 3]
    _set_armature_world(armature, new)
    logger.info(f"Armature '{armature.name}' had a non-uniform or mirroring scale "
                f"(singular values {np.round(sv, 4).tolist()}, det {det:.3g}); "
                f"exported in armature space")
    return True


def _reset_to_rest(armature):
    """Drop every action and animation binding, and put every bone at rest."""
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    for obj in bpy.context.scene.objects:
        if obj.animation_data is not None:
            obj.animation_data_clear()
        shape_keys = getattr(getattr(obj, 'data', None), 'shape_keys', None)
        if shape_keys is not None and shape_keys.animation_data is not None:
            shape_keys.animation_data_clear()
    for pose_bone in armature.pose.bones:
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.rotation_axis_angle = (0.0, 0.0, 1.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)
    update_scene()


def _check_hierarchy(armature, names, parents):
    """Every NPZ joint the rig has must hang under the bone of its nearest
    NPZ ancestor the rig has (ValueError otherwise)."""
    bones = armature.data.bones
    for j, name in enumerate(names):
        if name not in bones:
            continue
        p = int(parents[j])
        while p >= 0 and names[p] not in bones:
            p = int(parents[p])
        want = names[p] if p >= 0 else None
        got = bones[name].parent.name if bones[name].parent is not None else None
        if got != want:
            raise ValueError(f"bone '{name}' hangs under {got!r}, the NPZ puts it under "
                             f"{want!r}; wrong asset or rig?")


# Largest difference (relative to its extent) between the rig's rest skeleton
# and the NPZ's that a processed GLB may have; the same tolerance as the
# canonical bake (canonical_rig.FIT_TOL) and skeleton.motion_axis_alignment.
REST_TOL = 5e-3
# Written into export NPZs by tools/patch_annotations.py (apply_rest_orientations);
# keep the name in sync.
REST_ORIENTATION_KEY = 'rest_orientation_applied'


def _check_rest(armature, names, rest_pos, tol):
    """The rig's rest joints must be the NPZ's (*rest_pos*, export space) up
    to a similarity, within *tol* of the extent; ValueError otherwise."""
    arm_world = np.array(armature.matrix_world)
    bones = armature.data.bones
    keep = [j for j, n in enumerate(names) if n in bones]
    rig = np.stack([(arm_world @ np.array(bones[names[j]].matrix_local))[:3, 3] for j in keep])
    resid = similarity_fit(rest_pos[keep], rig)[3]
    if resid > tol:
        raise ValueError(
            f"rest skeleton is {resid:.1e} of its extent from the NPZ's (tolerance {tol:g}); "
            f"the clips were extracted from a different reading of this file")


# A rig whose rest skeleton is further from the origin than this many times its
# own extent is moved next to it (:func:`_recentre_far_rig`).
FAR_ORIGIN = 10.0


def _translation(t):
    T = np.eye(4)
    T[:3, 3] = t
    return T


def _map_rig(armature, world_map, arm_translation=None):
    """Apply *world_map* (a 4x4 uniform scale plus translation, world space) to
    the whole rig in its rest pose, in the data rather than the object
    transforms: the bones in armature space, each mesh's vertices around its own
    centre. *arm_translation* moves the armature object too (its rotation and
    scale stay); the bones absorb the difference. The asset ends up
    ``world_map`` of what it was, with no large values left in the node chain
    or vertex data for an exporter writing float32 to lose precision on."""
    W = np.asarray(world_map, dtype=np.float64)
    A = np.array(armature.matrix_world)
    A_new = A.copy()
    if arm_translation is not None:
        A_new[:3, 3] = arm_translation
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    old = {o: np.array(o.matrix_world) for o in meshes}

    def depth(obj):
        n = 0
        while obj.parent is not None:
            obj, n = obj.parent, n + 1
        return n

    X = np.linalg.inv(A_new) @ W @ A        # armature space: old -> new
    view_layer = bpy.context.view_layer
    previous = view_layer.objects.active
    view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode='EDIT')
    # Read everything before writing: moving a bone's tail moves the head of a
    # child connected to it.
    edit_bones = list(armature.data.edit_bones)
    ends = [(np.array(eb.head), np.array(eb.tail), eb.roll) for eb in edit_bones]
    for eb, (head, tail, roll) in zip(edit_bones, ends):
        eb.head = (X[:3, :3] @ head + X[:3, 3]).tolist()
        eb.tail = (X[:3, :3] @ tail + X[:3, 3]).tolist()
        eb.roll = roll
    bpy.ops.object.mode_set(mode='OBJECT')
    view_layer.objects.active = previous
    armature.matrix_world = Matrix(A_new.tolist())
    update_scene()

    for obj in meshes:                          # each mesh maps its own data
        if obj.data.users > 1:
            obj.data = obj.data.copy()
    for obj in sorted(meshes, key=depth):       # parents first: children are placed by world
        target = W @ old[obj]                   # the object's frame, mapped
        new = old[obj].copy()
        new[:3, 3] = target[:3, 3]
        data_map = np.linalg.inv(new) @ target  # carries the scale into the data
        if len(obj.data.vertices):
            co = np.empty(3 * len(obj.data.vertices))
            obj.data.vertices.foreach_get('co', co)
            co = co.reshape(-1, 3) @ data_map[:3, :3].T + data_map[:3, 3]
            centre = (co.min(0) + co.max(0)) / 2
            data_map = _translation(-centre) @ data_map
            new = new @ _translation(centre)
        obj.data.transform(Matrix(data_map.tolist()), shape_keys=True)
        obj.matrix_world = Matrix(new.tolist())
        update_scene()


def _recentre_far_rig(armature, names, rest_pos, clip_paths, far=FAR_ORIGIN):
    """Move a rig lying more than *far* times its skeleton's extent from the
    origin next to it, when its clips then replay closer to the origin too:
    skeleton centred over the origin in X/Y, lowest joint at Z = 0 (Blender
    world), armature object at the origin. Far away, the float32 node
    transforms and inverse bind matrices of the GLB lose the pose's precision.

    Replay keys are relative to the NPZ rest pose, so a clip replays where it
    was exported, displaced by the move. Some assets were exported with their
    rest pose far away but their clips at the origin (the offset is between the
    rest pose and the animation in the source); moving those would carry every
    replay away, so they stay. *rest_pos* (export space, joints *names*) maps
    the clips (*clip_paths*) into the rig's frame. Returns True when moved."""
    A = np.array(armature.matrix_world)
    bones = armature.data.bones
    heads = np.stack([(A @ np.array(b.matrix_local))[:3, 3] for b in bones])
    lo, hi = heads.min(0), heads.max(0)
    extent = float((hi - lo).max())
    centre = (lo + hi) / 2
    if extent <= 0 or np.linalg.norm(centre) <= far * extent:
        return False
    shift = -np.array([centre[0], centre[1], lo[2]])
    keep = [j for j, n in enumerate(names) if n in bones]
    rig = np.stack([(A @ np.array(bones[names[j]].matrix_local))[:3, 3] for j in keep])
    R, s, t, _ = similarity_fit(np.asarray(rest_pos)[keep], rig)   # export space -> world
    replay = []
    for path in clip_paths:
        with np.load(path, allow_pickle=True) as npz:
            replay.append(s * clip_global(npz).reshape(-1, 3).mean(0) @ R.T + t)
    replay = np.array(replay).reshape(-1, 3)
    before = float(np.linalg.norm(replay, axis=1).max()) if len(replay) else np.inf
    after = float(np.linalg.norm(replay + shift, axis=1).max()) if len(replay) else 0.0
    if after >= before:
        logger.info(f"Rig '{armature.name}' is {np.linalg.norm(centre) / extent:.0f}x its extent "
                    f"from the origin but its clips replay {before / extent:.0f}x from it; "
                    f"not moved")
        return False
    _map_rig(armature, _translation(shift), arm_translation=np.zeros(3))
    logger.info(f"Rig '{armature.name}' was {np.linalg.norm(centre) / extent:.0f}x its extent "
                f"from the origin; moved by {np.round(shift, 3).tolist()} (clips replay "
                f"{after / extent:.1f}x its extent from it, was {before / extent:.0f}x)")
    return True


def _rescale_to_npz(armature, names, rest_pos, tol):
    """Scale a rig whose skeleton stands more than *tol* times taller or shorter
    than the NPZ's (*rest_pos*, export space) to the NPZ's size, about the
    armature's origin. Heights are taken over the joints both have, the rig's
    along world Z in armature units, the NPZ's along Y; a similarity fit or a
    bounding box would confuse a character's own proportions (short legs, wide
    arms) with a unit error. Returns the factor applied, or None."""
    A = np.array(armature.matrix_world)
    bones = armature.data.bones
    keep = [j for j, n in enumerate(names) if n in bones]
    heads = np.stack([(A @ np.array(bones[names[j]].matrix_local))[:3, 3] for j in keep])
    arm_scale = np.cbrt(abs(np.linalg.det(A[:3, :3])))
    npz_height = float(np.ptp(np.asarray(rest_pos)[keep, 1]))
    ratio = float(np.ptp(heads[:, 2]) / arm_scale / npz_height) if npz_height > 0 else np.nan
    if not np.isfinite(ratio) or ratio <= 0:
        logger.warning(f"Rig '{armature.name}': no height to compare with the export "
                       f"skeleton's; not rescaled")
        return None
    if 1 / tol <= ratio <= tol:
        return None
    S = np.diag([1 / ratio] * 3 + [1.0])
    _map_rig(armature, A @ S @ np.linalg.inv(A))
    logger.info(f"Rig '{armature.name}' stood {ratio:.3g}x the height of the export skeleton; "
                f"scaled by {1 / ratio:.4g}")
    return 1 / ratio


# ---------------------------------------------------------------------------
# Building
# ---------------------------------------------------------------------------

def export_asset_glb(armature, npz_path, output_dir, asset, source_path=None, required=None,
                     rest_tol=REST_TOL, rescale_tol=None):
    """Write ``<output_dir>/rigs/<asset>.glb``: the asset on the export's
    pruned skeleton, in its rest pose, without animation.

    The skeleton is that of *npz_path* (one of the asset's clips). Bones whose
    long names were cut differently than in the NPZ are renamed to it
    (``rename_truncated_bones``); bones the export pruned are removed and
    their (sub-threshold) weights merged into the bone that takes them (the
    nearest kept ancestor; for a dropped root, the kept bone below it), the
    reconciliation the mesh-animation entry points apply
    (``sync_armature_bones``). Bone names and hierarchy then equal the NPZ's
    ``names`` / ``parents`` (checked), and so does the rest pose (checked up
    to a similarity, *rest_tol*; the root's Z-up -> Y-up turn is cancelled by
    keyframing); a Mixamo character keeps its own rest pose and proportions. Any clip NPZ of that skeleton drives the file
    directly (``animate_npz``), with no extra bones to reconcile.
    With *rescale_tol*, a rig whose skeleton is more than that factor larger
    or smaller than the NPZ's is scaled to its size (a character authored in
    other units). A rig further than :data:`FAR_ORIGIN` times its extent from
    the origin is moved next to it when its clips (``motions/<asset>-*.npz``)
    then replay closer to the origin too (:func:`_recentre_far_rig`).
    Spec-gloss materials are rebuilt as Principled BSDF
    (:func:`principled_from_specgloss`); textures are re-linked next to the
    source, packed, embedded and checked (``rigs/texture_issues/<asset>.txt``);
    an FBX source's materials get metallic 0 and their gloss maps inverted
    into roughness (:func:`pbr_from_fbx_phong`).

    The scene is modified in place (objects deleted, bones removed, actions
    dropped): call it after the asset's NPZs are extracted, or on a freshly
    imported asset. The file is written under a temporary name and renamed,
    so an interrupted run never leaves a truncated GLB behind.

    Args:
        required: NPZ joints the rig must have (default: all of them). Others
            may be absent (e.g. the finger bones of a Mixamo character whose
            mesh has none); the GLB then lacks them and replay skips them.
        rest_tol: largest rest-skeleton difference from the NPZ's, relative to
            its extent (default :data:`REST_TOL`); None skips the check (a
            Mixamo character, whose proportions are its own).
        rescale_tol: size factor beyond which the rig is scaled to the NPZ's
            (:func:`_rescale_to_npz`); None (default) never rescales.

    Returns:
        The GLB path.
    """
    with np.load(npz_path, allow_pickle=True) as npz:
        names = [str(n) for n in npz['names']]
        parents = np.asarray(npz['parents'])
        rest_pos = rest_global(npz)
        rest_fix = np.asarray(npz[REST_ORIENTATION_KEY]) if REST_ORIENTATION_KEY in npz.files else None
    rename_truncated_bones(armature, names)
    _strip_to_rig(armature, set(names))
    sync_armature_bones(armature, names, extra_bones_strategy='merge')
    missing = [n for n in names if n not in armature.data.bones]
    must = set(names) if required is None else set(required)
    lost = [n for n in missing if n in must]
    if lost:
        raise ValueError(f"{len(lost)} required NPZ joints are not bones of armature "
                         f"'{armature.name}' (e.g. {lost[:3]}); wrong asset or rig?")
    if missing:
        logger.warning(f"'{asset}': {len(missing)} of {len(names)} export joints are not in "
                       f"the rig (e.g. {missing[:3]}); the GLB has the other "
                       f"{len(names) - len(missing)}")
    _check_hierarchy(armature, names, parents)
    # Actions go first: an animated object transform would override the frame.
    _reset_to_rest(armature)
    _similarity_armature_frame(armature)
    if rest_fix is not None:
        _rotate_rest(armature, rest_fix, names, rest_pos)
    if rest_tol is not None:
        _check_rest(armature, names, rest_pos, rest_tol)
    if rescale_tol is not None:
        _rescale_to_npz(armature, names, rest_pos, rescale_tol)
    clip_paths = sorted(glob.glob(os.path.join(
        output_dir, 'motions', f'{glob.escape(asset)}-*.npz'))) or [npz_path]
    _recentre_far_rig(armature, names, rest_pos, clip_paths)

    export_objs = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'ARMATURE')]
    _, spec_maps = principled_from_specgloss(export_objs)
    unresolved = set()
    if source_path is not None:
        unresolved = set(repair_and_pack_textures(source_path))
        # After the repair: inverting a gloss map needs its pixels.
        if os.fspath(source_path).lower().endswith('.fbx'):
            pbr_from_fbx_phong(export_objs)
    used = [img for img in material_images(export_objs) if img.name not in spec_maps]
    unresolved &= {img.name for img in used}
    expected = {
        img.name: {img.name, os.path.splitext(img.name)[0],
                   os.path.splitext(bpy.path.basename(img.filepath))[0]} - {''}
        for img in used
        if img.name not in unresolved
        and (img.packed_file is not None or img.source == 'GENERATED')}

    final = processed_glb_path(output_dir, asset)
    os.makedirs(os.path.dirname(final), exist_ok=True)
    partial = os.path.join(os.path.dirname(final), f'.{asset}.partial.glb')
    select_objs(export_objs, deselect_first=True)
    try:
        export_selected_to_file(partial, 'glb')
        os.replace(partial, final)
    finally:
        if os.path.isfile(partial):
            os.remove(partial)

    try:
        problems = check_glb_textures(final, expected, unresolved)
    except Exception as exc:  # noqa: BLE001 — the GLB is written; keep it
        problems = [f"texture check failed: {type(exc).__name__}: {exc}"]
    write_note(os.path.join(output_dir, PROCESSED_GLB_DIR), TEXTURE_ISSUES_DIR, asset, problems)
    if problems:
        logger.warning(f"Textures of '{asset}': " + '; '.join(problems))
    logger.info(f"Saved processed GLB {final} ({len(names) - len(missing)} joints, "
                f"{len(expected) + len(unresolved)} material image(s)"
                + (f", {len(unresolved)} not found" if unresolved else '') + ")")
    return final


def build_asset_glb(asset, npz_path, output_dir, get_armature, source_path=None,
                    required=None, rest_tol=REST_TOL, rescale_tol=None):
    """:func:`export_asset_glb`, with a failure recorded instead of raised.

    The GLB comes after the asset's NPZs are complete, so a GLB that cannot be
    built must not fail the export (the wrapper would refuse to merge the
    shards, on every rerun). The error goes to ``rigs/glb_errors/<asset>.txt``,
    removed again once a rerun with ``--save_glb`` / ``--glb_only`` succeeds.

    Args:
        get_armature: callable returning the asset's armature in the current
            scene (importing the asset when needed), called inside the guard.

    Returns:
        True when the GLB was written.
    """
    notes = os.path.join(output_dir, PROCESSED_GLB_DIR)
    try:
        export_asset_glb(get_armature(), npz_path, output_dir, asset,
                         source_path=source_path, required=required, rest_tol=rest_tol,
                         rescale_tol=rescale_tol)
    except Exception as exc:  # noqa: BLE001 — the NPZs are done; keep the batch going
        logger.exception(f"Processed GLB of '{asset}' failed (NPZs unaffected)")
        write_note(notes, GLB_ERRORS_DIR, asset, [f'{type(exc).__name__}: {exc}'])
        return False
    write_note(notes, GLB_ERRORS_DIR, asset, [])
    return True


def add_asset_glb(asset, output_dir, get_armature, source_path=None):
    """Build the missing processed GLB of an already exported asset from one of
    its main-skeleton clips (``main_skeleton_clips``), guarded like
    :func:`build_asset_glb`. Returns True when the GLB was written."""
    main, others = main_skeleton_clips(output_dir, asset)
    if not main:
        return False
    log_other_skeletons(asset, others)
    return build_asset_glb(asset, main[0], output_dir, get_armature, source_path=source_path)
