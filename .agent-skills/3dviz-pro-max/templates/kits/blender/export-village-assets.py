"""Build the village glTF heroes procedurally in bpy and export them headless.

Follows `knowledge.blender-headless-gltf-export-script`: job arguments are read after the
`--` separator, parsed with argparse, every exporter keyword is spelled out, and the process
exits non-zero when the output file is missing or empty.

    Blender -b --factory-startup --python-exit-code 1 \
      --python templates/kits/blender/export-village-assets.py -- \
      --asset stone-guildhall --out templates/kits/gltf/stone-guildhall.glb

Nothing is loaded from a .blend: each asset is built from the parameters below, so the GLB is
reproducible from this file alone and no binary source has to be committed. Geometry is
authored Blender Z-up with z = 0 on the ground; `export_yup=True` converts the scene to glTF
Y-up on the way out, so socket `normal` custom properties are written already converted --
blender (x, y, z) becomes glTF (x, z, -y) -- and can be read straight out of `node.extras`
(three.js: `object.userData`) with no further axis juggling.
"""
import argparse
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

EXPORT_KWARGS = dict(export_format='GLB', export_apply=True, export_yup=True,
                     export_extras=True, export_lights=False,
                     export_draco_mesh_compression_enable=False,
                     export_animation_mode='ACTIONS', export_force_sampling=True)


def material(name, color, roughness, metallic, emission=None, strength=0.0):
    """One Principled slot. A `strength` above 1 makes the exporter emit
    KHR_materials_emissive_strength; at or below 1 it stays in emissiveFactor alone."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission is not None:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat


def box(bm, centre, size, index, rot_x=0.0):
    """One axis-aligned (optionally pitched about X) box tagged with a material slot."""
    verts = bmesh.ops.create_cube(bm, size=1.0)['verts']
    bmesh.ops.scale(bm, vec=Vector(size), verts=verts)
    if rot_x:
        bmesh.ops.rotate(bm, verts=verts, cent=(0.0, 0.0, 0.0),
                         matrix=Matrix.Rotation(rot_x, 3, 'X'))
    bmesh.ops.translate(bm, vec=Vector(centre), verts=verts)
    for face in {f for v in verts for f in v.link_faces}:
        face.material_index = index


def wall(bm, axis, centre, span, height, thickness, openings, index):
    """A wall with real holes: the span and the height are cut at every opening edge and only
    the cells outside an opening become boxes, so every reveal is a full wall-thickness deep."""
    us = sorted({-span / 2, span / 2, *(v for o in openings for v in o[:2])})
    zs = sorted({0.0, height, *(v for o in openings for v in o[2:])})
    for u0, u1 in zip(us, us[1:]):
        for z0, z1 in zip(zs, zs[1:]):
            if any(o[0] <= u0 and u1 <= o[1] and o[2] <= z0 and z1 <= o[3] for o in openings):
                continue
            u, z, su, sz = (u0 + u1) / 2, (z0 + z1) / 2, u1 - u0, z1 - z0
            if axis == 'X':
                box(bm, (centre[0] + u, centre[1], z), (su, thickness, sz), index)
            else:
                box(bm, (centre[0], centre[1] + u, z), (thickness, su, sz), index)


def glazing(bm, axis, plane, out, opening, timber, glass):
    """Glazing set back inside an opening -- pane, mullion, transom -- so the reveal shades it.

    `plane` is the outer wall face and `out` its outward sign, so every depth below is
    subtracted from the face and lands inside the wall whichever way the wall looks."""
    u0, u1, z0, z1 = opening
    u, z, width, height = (u0 + u1) / 2, (z0 + z1) / 2, u1 - u0, z1 - z0

    def place(depth, su, sn, sz, index):
        centre = ((u, plane - out * depth) if axis == 'X' else (plane - out * depth, u))
        size = ((su, sn, sz) if axis == 'X' else (sn, su, sz))
        box(bm, (centre[0], centre[1], z), size, index)
    place(0.20, width - 0.03, 0.02, height - 0.03, glass)
    place(0.15, 0.05, 0.05, height - 0.03, timber)
    place(0.15, width - 0.03, 0.05, 0.05, timber)


def slope(bm, sign, eave_y, eave_z, rise, width, index, courses=12, tilt=math.radians(12)):
    """One roof slope as overlapping tile courses laid up the pitch from the eave.

    Every course centre sits on the slope plane, so courses laid parallel to it would be
    coplanar and render as one flat sheet. Laying each course `tilt` shallower than the roof
    lifts its downslope edge and drops its upslope edge, so the course above laps over the
    one below with a visible lip -- that lap is the whole reason the roof reads as tiles."""
    run, length = abs(eave_y), math.hypot(abs(eave_y), rise)
    pitch, step = math.atan2(rise, run), length / courses
    for i in range(courses):
        t = (i + 0.5) * step
        angle = pitch - tilt
        box(bm, (0.0, sign * (run - t * math.cos(pitch)), eave_z + t * math.sin(pitch)),
            (width, step * 1.7, 0.10), index,
            rot_x=angle if sign < 0 else math.pi - angle)


def gable(bm, x, thickness, half_depth, eave_z, rise, index):
    """The triangular wall that closes one gable end, extruded to the wall thickness."""
    profile = ((-half_depth, eave_z), (half_depth, eave_z), (0.0, eave_z + rise))
    verts = [bm.verts.new((sx, y, z))
             for sx in (x - thickness / 2, x + thickness / 2) for y, z in profile]
    for indices in ((0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)):
        bm.faces.new([verts[i] for i in indices]).material_index = index


def unwrap(obj):
    """Smart UV project every face, so a downstream texture has somewhere to land."""
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)


def to_object(bm, name, materials, bevel=0.02, segments=1):
    """Finish a bmesh into a scene object with material slots, UVs and a bevel modifier."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    for mat in materials:
        obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    unwrap(obj)
    modifier = obj.modifiers.new('Bevel', 'BEVEL')
    modifier.width, modifier.segments = bevel, segments
    modifier.limit_method, modifier.angle_limit = 'ANGLE', math.radians(35)
    return obj


def socket(name, position, normal):
    """An empty carrying its glTF-space normal; export_extras writes both into node extras."""
    empty = bpy.data.objects.new(f'socket-{name}', None)
    empty.empty_display_type, empty.empty_display_size = 'ARROWS', 0.25
    empty.location = position
    empty['socket'] = name
    empty['normal'] = [float(normal[0]), float(normal[2]), float(-normal[1])]
    bpy.context.collection.objects.link(empty)


def build_stone_guildhall():
    """A four-square guildhall: stone body, timber openings, tiled gable roof."""
    stone = material('GuildhallStone', (0.52, 0.50, 0.46), 0.88, 0.0)
    timber = material('GuildhallTimber', (0.19, 0.12, 0.07), 0.62, 0.0)
    tile = material('GuildhallRoofTile', (0.32, 0.16, 0.13), 0.74, 0.0)
    glass = material('GuildhallGlass', (0.06, 0.09, 0.11), 0.12, 0.0,
                     emission=(1.0, 0.80, 0.50), strength=0.9)
    hx, hy, thick, eave, rise = 3.6, 2.7, 0.42, 5.0, 2.3
    door = (-0.85, 0.85, 0.0, 3.0)
    tall = [(-2.95, -1.95, 3.4, 4.6), (1.95, 2.95, 3.4, 4.6)]
    low = [(-2.8, -1.9, 1.5, 2.6), (1.9, 2.8, 1.5, 2.6)]
    row = [(-1.85, -0.95, 1.5, 2.85), (-0.45, 0.45, 1.5, 2.85), (0.95, 1.85, 1.5, 2.85)]
    bm = bmesh.new()
    box(bm, (0.0, 0.0, 0.18), (2 * hx + 0.7, 2 * hy + 0.7, 0.36), 0)          # plinth
    box(bm, (0.0, 0.0, 3.02), (2 * hx + 0.3, 2 * hy + 0.3, 0.14), 0)          # string course
    for axis, plane, out, openings, span in (('X', -hy, -1.0, [door, *low, *tall], 2 * hx),
                                             ('X', hy, 1.0, [*low, *tall], 2 * hx),
                                             ('Y', -hx, -1.0, row, 2 * hy - 2 * thick),
                                             ('Y', hx, 1.0, row, 2 * hy - 2 * thick)):
        mid = plane - out * thick / 2
        wall(bm, axis, (0.0, mid) if axis == 'X' else (mid, 0.0),
             span, eave, thick, openings, 0)
        for opening in openings:
            if opening[2] > 0.0:                                             # the door is not glazed
                glazing(bm, axis, plane, out, opening, 1, 3)
    for x in (-(hx - thick / 2), hx - thick / 2):
        gable(bm, x, thick, hy, eave, rise, 0)
    box(bm, (0.0, -hy + 0.16, 1.46), (1.62, 0.11, 2.85), 1)                  # door leaf
    box(bm, (0.0, -hy - 0.34, 0.09), (2.5, 0.7, 0.18), 0)                    # entrance step
    for sign in (-1.0, 1.0):
        slope(bm, sign, sign * (hy + 0.34), eave - 0.1, rise + 0.1, 2 * hx + 0.7, 2)
    box(bm, (0.0, 0.0, eave + rise + 0.06), (2 * hx + 0.8, 0.42, 0.14), 2)   # ridge cap
    box(bm, (2.2, 0.0, eave + rise - 0.4), (0.85, 0.85, 2.2), 0)             # chimney stack
    box(bm, (2.2, 0.0, eave + rise + 0.78), (1.05, 1.05, 0.18), 0)           # chimney cap
    to_object(bm, 'stone-guildhall', [stone, timber, tile, glass])
    socket('door', (0.0, -hy, 0.0), (0.0, -1.0, 0.0))
    socket('banner', (0.0, -hy, 3.9), (0.0, -1.0, 0.0))
    socket('chimney', (2.2, 0.0, eave + rise + 0.87), (0.0, 0.0, 1.0))
    socket('lantern', (-hx, -hy + 0.4, 3.3), (-1.0, 0.0, 0.0))


def build_iron_lantern():
    """A wrought iron post lantern whose glazing carries the emissive strength extension."""
    # Metalness is kept low on purpose: the proof harness lights the asset with a sun and
    # a hemisphere and no environment map, and a fully metallic surface with nothing to
    # reflect renders black. These are art values for a no-IBL rig, not measured metals.
    iron = material('LanternIron', (0.14, 0.14, 0.17), 0.50, 0.30)
    brass = material('LanternBrass', (0.78, 0.58, 0.24), 0.30, 0.35)
    glass = material('LanternGlass', (0.05, 0.04, 0.03), 0.16, 0.0,
                     emission=(1.0, 0.58, 0.22), strength=1.8)
    top, head = 2.72, 2.96
    bm = bmesh.new()
    box(bm, (0.0, 0.0, 0.09), (0.46, 0.46, 0.18), 0)                 # base plinth
    box(bm, (0.0, 0.0, 0.28), (0.30, 0.30, 0.20), 0)                 # base flare
    box(bm, (0.0, 0.0, 1.54), (0.11, 0.11, 2.36), 0)                 # post
    for z in (0.62, 2.46):
        box(bm, (0.0, 0.0, z), (0.155, 0.155, 0.05), 1)              # brass collars
    box(bm, (0.0, 0.22, 2.60), (0.05, 0.44, 0.05), 0)                # hook arm
    box(bm, (0.0, 0.20, 2.44), (0.04, 0.40, 0.04), 0, rot_x=math.radians(38))
    box(bm, (0.0, 0.0, top + 0.04), (0.42, 0.42, 0.07), 0)           # head floor
    for sx in (-0.155, 0.155):
        for sy in (-0.155, 0.155):
            box(bm, (sx, sy, head), (0.035, 0.035, 0.44), 0)         # corner posts
    for sign in (-1.0, 1.0):
        box(bm, (sign * 0.155, 0.0, head), (0.02, 0.28, 0.38), 2)
        box(bm, (0.0, sign * 0.155, head), (0.28, 0.02, 0.38), 2)    # glazing panes
    cap = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=4,
                                radius1=0.32, radius2=0.03, depth=0.26)['verts']
    bmesh.ops.rotate(bm, verts=cap, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 4, 3, 'Z'))
    bmesh.ops.translate(bm, vec=Vector((0.0, 0.0, head + 0.34)), verts=cap)
    for face in {f for v in cap for f in v.link_faces}:
        face.material_index = 0
    box(bm, (0.0, 0.0, head + 0.53), (0.05, 0.05, 0.12), 1)          # finial
    to_object(bm, 'iron-lantern', [iron, brass, glass], bevel=0.006, segments=2)
    socket('base', (0.0, 0.0, 0.0), (0.0, 0.0, 1.0))
    socket('lamp', (0.0, 0.0, head), (0.0, 0.0, 1.0))
    socket('hook', (0.0, 0.44, 2.60), (0.0, 1.0, 0.0))


ASSETS = {'stone-guildhall': build_stone_guildhall, 'iron-lantern': build_iron_lantern}


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description='Build and export one village glTF hero.')
    parser.add_argument('--asset', required=True, choices=sorted(ASSETS))
    parser.add_argument('--out', required=True)
    args = parser.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ASSETS[args.asset]()
    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, **EXPORT_KWARGS)
    if not os.path.exists(out) or os.path.getsize(out) == 0:
        sys.stderr.write(f'export produced no file at {out}\n')
        sys.exit(1)
    print(f'exported {args.asset}: {os.path.getsize(out)} bytes -> {out}')


if __name__ == '__main__':
    main()
