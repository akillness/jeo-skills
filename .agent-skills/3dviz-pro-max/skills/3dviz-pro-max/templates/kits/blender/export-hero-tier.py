"""Bake one already-exported kit GLB into a T3 hero GLB: bevel, UVs, baked colour, AO, roughness.

Generic on purpose: no blueprint geometry lives here. The mesh comes from the kit module itself
(`kit_proof_harness.py --export-glb` drives the harness through THREE.GLTFExporter), so the hero
is the module's own shape with topology and light a runtime cannot produce. `scripts/hero-tier.py`
owns the time box, the cache and Blender discovery and calls this file:

    Blender -b --factory-startup --python-exit-code 1 --threads 4 \
      --python templates/kits/blender/export-hero-tier.py -- --in <t1>.glb --out <t3>.glb \
      --bake-size 1024 --ao-samples 64 --bevel 0.012 --families '{"#e5dccb": "plaster"}'

`--families` is the record's own `tiers.T2.families` map, so one authored colour-to-family mapping
feeds both the runtime canvas generator and this script; an unmapped colour stays flat, as at T2.
Run on Blender 5.2.1 LTS (2026-09-08), written against 4.2 LTS: the calls that moved are guarded
on `hasattr` and the exporter's keywords are filtered against its own RNA before the call.
"""
import argparse
import json
import math
import os
import sys
import tempfile
import time

import bpy
import numpy as np

BAKE = dict(engine='CYCLES', ao_samples=64, margin=16, image_format='JPEG', quality=85,
            ao_distance_m=0.75, ao_strength=0.8, uv_angle_deg=66.0, island_margin=0.001,
            bevel_angle_deg=35.0, smooth_angle_deg=35.0, colour_tolerance=0.045)
# Per-family grain. `scale` is in object metres, so 90 is roughly centimetre variation on a 4 m
# wall; `contrast` is the half-range of the multiplier, so 0.18 shifts the colour by up to 18 %.
NOISE = {'wood': dict(scale=180.0, detail=6.0, distortion=1.6, contrast=0.35, cells=0.0),
         'plaster': dict(scale=60.0, detail=4.0, distortion=0.2, contrast=0.18, cells=0.0),
         'stone': dict(scale=24.0, detail=8.0, distortion=0.6, contrast=0.40, cells=14.0),
         'roof-tile': dict(scale=40.0, detail=5.0, distortion=0.3, contrast=0.30, cells=9.0),
         'metal': dict(scale=120.0, detail=3.0, distortion=0.1, contrast=0.14, cells=0.0),
         'fabric': dict(scale=220.0, detail=2.0, distortion=0.4, contrast=0.22, cells=0.0)}


def srgb_hex(colour):
    """The lowercase #rrggbb a linear base colour was authored as in the kit module."""
    def encode(value):
        value = min(max(float(value), 0.0), 1.0)
        return round(255 * (value * 12.92 if value <= 0.0031308
                            else 1.055 * value ** (1 / 2.4) - 0.055))
    return '#{:02x}{:02x}{:02x}'.format(*(encode(v) for v in colour[:3]))


def hex_linear(text):
    """The linear triple of an #rrggbb colour, for nearest-colour matching."""
    parts = [int(text[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in parts]


def principled(material):
    """The material's Principled BSDF, or None for a material that has no shader graph."""
    return next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)


def add_node(tree, kind, **values):
    """One shader node with its named inputs set: `from_min=0.2` sets the 'From Min' socket."""
    node = tree.nodes.new(kind)
    for name, value in values.items():
        socket = name.replace('_', ' ').title() if '_' in name else name.capitalize()
        node.inputs[socket].default_value = value
    return node


def family_of(material, families):
    """The surface family for one imported material, or None when the record leaves it flat."""
    bsdf = principled(material)
    if bsdf is None:
        return None
    colour = list(bsdf.inputs['Base Color'].default_value)
    exact = families.get(srgb_hex(colour))
    if exact:
        return exact
    best, distance = None, BAKE['colour_tolerance']
    for text, family in families.items():
        delta = sum((a - b) ** 2 for a, b in zip(hex_linear(text), colour[:3])) ** 0.5
        if delta < distance:
            best, distance = family, delta
    return best


def prepare(path, bevel):
    """Import, join, smooth, bevel and unwrap. Only meshes are joined: the socket empties stay
    separate so `export_extras` carries their names and normals through, and one UV atlas serves
    all three bakes."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not meshes:
        raise ValueError(f'{path} holds no mesh')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = 'hero'
    angle = math.radians(BAKE['smooth_angle_deg'])
    if hasattr(bpy.ops.object, 'shade_auto_smooth'):      # 4.1+ replaced mesh.use_auto_smooth
        bpy.ops.object.shade_auto_smooth(angle=angle)
    else:                                                  # 4.0 and older
        bpy.ops.object.shade_smooth()
        obj.data.use_auto_smooth, obj.data.auto_smooth_angle = True, angle
    if bevel > 0:
        modifier = obj.modifiers.new('Bevel', 'BEVEL')
        modifier.width, modifier.segments = bevel, 1
        modifier.limit_method, modifier.angle_limit = 'ANGLE', math.radians(BAKE['bevel_angle_deg'])
        modifier.harden_normals = False
        bpy.ops.object.modifier_apply(modifier='Bevel')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(BAKE['uv_angle_deg']),
                             island_margin=BAKE['island_margin'])
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def add_variation(material, family, seed):
    """Multiply family-tuned noise into whatever already drives Base Color. The grain is baked,
    not tiled: object-space coordinates keep the feature size in metres however the atlas fell.
    `socket_by` matches by name *and* type - ShaderNodeMix repeats 'A'/'B' once per data type."""
    def socket_by(node, name, kind):
        return next(entry for entry in node.inputs if entry.name == name and entry.type == kind)

    tree, bsdf = material.node_tree, principled(material)
    settings = NOISE[family]
    coords = tree.nodes.new('ShaderNodeTexCoord')
    noise = add_node(tree, 'ShaderNodeTexNoise', scale=settings['scale'],
                     detail=settings['detail'], distortion=settings['distortion'])
    # Measured on 5.2.1: a 3D noise node has no 'W' input, so the seed cannot offset the grain
    # there. It still reaches the hero through the module's own seeded geometry, which the
    # harness exported before this script ever ran.
    if 'W' in noise.inputs:
        noise.inputs['W'].default_value = float(seed % 997) * 0.37
    tree.links.new(coords.outputs['Object'], noise.inputs['Vector'])
    source = noise.outputs['Fac']
    if settings['cells'] > 0:                       # stone courses and roof tiles get blocks too
        cells = add_node(tree, 'ShaderNodeTexVoronoi', scale=settings['cells'])
        tree.links.new(coords.outputs['Object'], cells.inputs['Vector'])
        blend = tree.nodes.new('ShaderNodeMath')
        blend.operation = 'MULTIPLY'
        tree.links.new(noise.outputs['Fac'], blend.inputs[0])
        tree.links.new(cells.outputs['Distance'], blend.inputs[1])
        source = blend.outputs['Value']
    span = add_node(tree, 'ShaderNodeMapRange', from_min=0.22, from_max=0.78,
                    to_min=1.0 - settings['contrast'], to_max=1.0 + settings['contrast'])
    span.clamp = True                               # 0..1 noise becomes a 1±contrast multiplier
    tree.links.new(source, span.inputs['Value'])
    mix = add_node(tree, 'ShaderNodeMix', factor=1.0)
    mix.data_type, mix.blend_type = 'RGBA', 'MULTIPLY'
    base = bsdf.inputs['Base Color']
    if base.is_linked:
        tree.links.new(base.links[0].from_socket, socket_by(mix, 'A', 'RGBA'))
    else:
        socket_by(mix, 'A', 'RGBA').default_value = base.default_value
    tree.links.new(span.outputs['Result'], socket_by(mix, 'B', 'RGBA'))
    tree.links.new(next(o for o in mix.outputs if o.type == 'RGBA'), base)


def bake_images(obj, size, ao_samples, ao_strength):
    """Three Cycles bakes, one atlas each: colour, ambient occlusion, roughness."""
    scene = bpy.context.scene
    scene.render.engine = BAKE['engine']
    scene.cycles.device, scene.cycles.samples = 'CPU', ao_samples
    scene.world = scene.world or bpy.data.worlds.new('hero-world')
    scene.world.light_settings.distance = BAKE['ao_distance_m']   # the AO pass ray length, metres
    images = {name: bpy.data.images.new(f'hero-{name}', size, size, float_buffer=False,
                                        is_data=name != 'colour')
              for name in ('colour', 'ao', 'rough')}
    targets = [(m, m.node_tree.nodes.new('ShaderNodeTexImage'))
               for m in obj.data.materials if m is not None]
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    timings = {}
    for name, kind, passes in (('colour', 'DIFFUSE', dict(use_pass_direct=False,
                                                          use_pass_indirect=False,
                                                          use_pass_color=True)),
                               ('ao', 'AO', {}), ('rough', 'ROUGHNESS', {})):
        for material, node in targets:
            node.image = images[name]
            node.select = True
            material.node_tree.nodes.active = node
        for key, value in passes.items():
            setattr(scene.render.bake, key, value)
        if hasattr(scene.render.bake, 'margin_type'):   # 3.1+; keeps a margin off its neighbour
            scene.render.bake.margin_type = 'ADJACENT_FACES'
        started = time.time()
        bpy.ops.object.bake(type=kind, margin=BAKE['margin'], use_clear=True,
                            target='IMAGE_TEXTURES', use_selected_to_active=False)
        timings[name] = round(time.time() - started, 2)
    # Occlusion is folded into the colour map as well as exported, so a runtime with no aoMap
    # still sees the contact. The multiply is on the encoded bytes, not in linear light: the
    # darkening is then even across the range, which is what the eye judges a baked hero on.
    count = size * size * 4
    top, shade = np.empty(count, dtype=np.float32), np.empty(count, dtype=np.float32)
    images['colour'].pixels.foreach_get(top)
    images['ao'].pixels.foreach_get(shade)
    factor = 1.0 - ao_strength + ao_strength * shade
    factor[3::4] = 1.0                                   # alpha is never occluded
    images['colour'].pixels.foreach_set(np.clip(top * factor, 0.0, 1.0))
    images['colour'].update()
    return images, timings


def pack(obj, images):
    """One Principled reading the baked maps; occlusion goes through the exporter's own group.

    Every image is saved and packed first: a bake fills an image whose source is still GENERATED,
    and such an image is rebuilt from its flat generated colour the moment anything re-evaluates
    it - which is what the glTF exporter does, so an unstored bake exports as a black JPEG.
    """
    with tempfile.TemporaryDirectory() as folder:
        for name, image in images.items():
            image.file_format = 'PNG'
            image.filepath_raw = os.path.join(folder, f'{name}.png')
            image.save()
            image.pack()
            image.source = 'FILE'
    material = bpy.data.materials.new('hero-baked')
    material.use_nodes = True
    tree = material.node_tree
    bsdf = principled(material)
    for name, target, space in (('colour', 'Base Color', 'sRGB'),
                                ('rough', 'Roughness', 'Non-Color')):
        node = tree.nodes.new('ShaderNodeTexImage')
        node.image = images[name]
        node.image.colorspace_settings.name = space
        tree.links.new(node.outputs['Color'], bsdf.inputs[target])
    bsdf.inputs['Metallic'].default_value = 0.0          # no environment map in the proof harness
    group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    holder = tree.nodes.new('ShaderNodeGroup')
    holder.node_tree = group
    occlusion = tree.nodes.new('ShaderNodeTexImage')
    occlusion.image = images['ao']
    occlusion.image.colorspace_settings.name = 'Non-Color'
    tree.links.new(occlusion.outputs['Color'], holder.inputs['Occlusion'])
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return material


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description='Bake one kit GLB into a T3 hero GLB.')
    parser.add_argument('--in', dest='source', required=True, help='GLB written by the harness')
    parser.add_argument('--out', required=True)
    parser.add_argument('--families', default='{}', help="record tiers.T2.families as JSON")
    parser.add_argument('--bake-size', type=int, default=1024)
    parser.add_argument('--ao-samples', type=int, default=BAKE['ao_samples'])
    parser.add_argument('--ao-strength', type=float, default=BAKE['ao_strength'])
    parser.add_argument('--bevel', type=float, default=0.012, help='bevel width in metres')
    parser.add_argument('--seed', type=int, default=1)
    parser.add_argument('--quality', type=int, default=BAKE['quality'])
    args = parser.parse_args(argv)
    families = json.loads(args.families)
    started = time.time()
    obj = prepare(args.source, args.bevel)
    assigned = {m.name: family_of(m, families) for m in obj.data.materials if m is not None}
    for material in obj.data.materials:
        if material is not None and assigned[material.name] in NOISE:
            add_variation(material, assigned[material.name], args.seed)
    images, timings = bake_images(obj, args.bake_size, args.ao_samples, args.ao_strength)
    pack(obj, images)
    obj['blueprint_tier'] = 'T3'
    obj['built_by'] = 'templates/kits/blender/export-hero-tier.py'
    # Every exporter keyword is spelled out, then filtered against this Blender's own RNA.
    kwargs = dict(export_format='GLB', export_apply=True, export_yup=True, export_extras=True,
                  export_lights=False, export_draco_mesh_compression_enable=False,
                  export_image_format=BAKE['image_format'], export_jpeg_quality=args.quality,
                  export_image_quality=args.quality)
    known = {prop.identifier for prop in bpy.ops.export_scene.gltf.get_rna_type().properties}
    dropped = sorted(set(kwargs) - known)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or '.', exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=args.out,
                              **{k: v for k, v in kwargs.items() if k in known})
    if not os.path.exists(args.out) or os.path.getsize(args.out) == 0:
        raise ValueError(f'export produced no file at {args.out}')
    print('HERO ' + json.dumps({
        'out': args.out, 'bytes': os.path.getsize(args.out), 'families': assigned,
        'blender': bpy.app.version_string.split()[0], 'triangles': len(obj.data.loop_triangles),
        'polygons': len(obj.data.polygons), 'bake_size': args.bake_size, 'bake_seconds': timings,
        'ao_samples': args.ao_samples, 'unsupported_export_keywords': dropped,
        'seconds': round(time.time() - started, 2)}))


if __name__ == '__main__':
    main()
