"""
bx_materials: material builders, headless UV-space painting and render-based material
checks for Blender 5.2.1 (skill: scenario-blender-texturing-shading). Every function below is
exercised by tests/code/blender-texturing-shading/test_*.py.

  import sys; sys.path.append("<skills>/scenario-blender-texturing-shading/scripts"); import bx_materials as M

Builders (get-or-create by name, Principled BSDF v2 sockets addressed by NAME):
  maps = M.find_texture_set("/abs/textures/bricks")            # role -> path, from file names
  mat  = M.pbr_from_textures("Bricks", maps, uv_map="UVMap")      # colour spaces set per role
  mat  = M.pbr_from_textures("Rock", maps, projection="BOX")      # box/triplanar, no UVs needed
  M.add_wear(mat, edge_color=(0.75, 0.72, 0.68), edge_roughness=0.3, dirt_color=(0.05, 0.04, 0.03))
  ng   = M.edge_wear_group(); ng = M.grunge_group()               # reusable node groups
  M.stylized_skin("snow.skin", obj=body)                          # Kaspar's Snow recipe in v2 terms
  M.stylized_eye("snow.eye", iris_color=(0.18, 0.3, 0.45))        # object-space procedural eye
  M.add_decal(mat, obj, "/abs/logo.png", center, normal, up, size)

Vertex masks (Color Attributes, engine independent, no GUI):
  M.curvature_attribute(obj)                  # col_curvature: 0.5 flat, >0.5 convex, <0.5 concave
  M.mask_from_points(obj, "col_sss", [(co, radius, value), ...])
  M.smooth_attribute(obj, "col_sss", iterations=4)

Headless painting through UV space (the substitute for texture-paint strokes):
  tm  = M.TexelMap(obj, 1024)                 # world position + normal of every texel
  img = M.new_image("rust_mask", 1024, color=(0, 0, 0, 1), colorspace="Non-Color")
  arr = M.pixels(img)
  M.paint_stroke(arr, tm, world_points, radius=0.05, color=(1, 1, 1, 1))  # seam-proof dabs
  arr[...] = M.project(tm, lambda P, N: N[..., 2])                         # e.g. dust from normal z
  M.write_pixels(img, M.dilate(arr, tm.valid, 8)); M.save_image(img, "/abs/rust_mask.png")
  M.high_pass(gray, sigma)                    # Kaspar's grain-extract pattern extraction

Live GUI session (real brushes through scenario-blender-expert/scripts/bx_gui.py):
  M.gui_texture_stroke(world_points, size=40, brush="Paint Hard", color=(0.8, 0.1, 0.1))
                                              # forces a redraw first, resamples dabs

Checks:
  M.audit_material(mat)                       # static: colour spaces by role, UV maps, bump, emission...
  M.value_report(objs)                        # renders albedo/roughness/metallic as emission to EXR, stats
  M.preview(mat_or_objs, out_dir)             # EEVEE + Cycles contact sheet, studio and backlit rigs

Conventions: colours passed to node sockets are scene-linear. Byte images store values
as encoded (sRGB images: sRGB-encoded; Non-Color: raw); float images store linear.
Always write alpha = 1 into images without meaningful alpha: an RGB PNG save multiplies
colour by alpha.
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import math
import os
import re
import sys

import bpy
import numpy as np
from mathutils import Vector

_HERE = os.path.dirname(os.path.abspath(__file__))
_EXPERT = os.path.normpath(os.path.join(_HERE, "..", "..", "scenario-blender-expert", "scripts"))
if _EXPERT not in sys.path:
    sys.path.append(_EXPERT)

# --------------------------------------------------------------------------------------
# node helpers
# --------------------------------------------------------------------------------------


def get_material(mat):
    """Material by object or name (created if missing; 5.x new materials already hold
    Principled BSDF + Material Output, `use_nodes` is deprecated)."""
    if isinstance(mat, bpy.types.Material):
        return mat
    m = bpy.data.materials.get(mat)
    return m if m is not None else bpy.data.materials.new(mat)


def output_node(mat):
    nt = mat.node_tree
    outs = [n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial"]
    for n in outs:
        if n.is_active_output:
            return n
    return outs[0] if outs else nt.nodes.new("ShaderNodeOutputMaterial")


def principled(mat):
    """The Principled BSDF that feeds the active output (or the first one)."""
    nt = mat.node_tree
    out = output_node(mat)
    if out.inputs["Surface"].is_linked:
        n = out.inputs["Surface"].links[0].from_node
        if n.bl_idname == "ShaderNodeBsdfPrincipled":
            return n
    for n in nt.nodes:
        if n.bl_idname == "ShaderNodeBsdfPrincipled":
            return n
    return None


def _new(nt, idname, loc=(0, 0), label=None, **props):
    n = nt.nodes.new(idname)
    n.location = loc
    if label:
        n.label = label
    for k, v in props.items():
        setattr(n, k, v)
    return n


def _sock(sockets, name):
    """First ENABLED socket called `name` (Mix and Map Range carry hidden duplicates)."""
    for s in sockets:
        if s.name == name and s.enabled:
            return s
    raise KeyError(name)


def _link(nt, a, b):
    return nt.links.new(a, b)


def _set(sock, value):
    if hasattr(sock, "default_value"):
        dv = sock.default_value
        if hasattr(dv, "__len__") and not hasattr(value, "__len__"):
            value = [value] * len(dv)
        elif hasattr(dv, "__len__") and len(value) != len(dv):
            value = tuple(value) + (1.0,) * (len(dv) - len(value))
        sock.default_value = value


def _feed(nt, sock, src):
    """src: a socket (linked), or a constant."""
    if src is None:
        return
    if isinstance(src, bpy.types.NodeSocket):
        _link(nt, src, sock)
    else:
        _set(sock, src)


def _mix(nt, dtype="RGBA", blend="MIX", fac=None, a=None, b=None, loc=(0, 0), label=None, clamp=False):
    n = _new(nt, "ShaderNodeMix", loc, label)
    n.data_type = dtype
    if dtype == "RGBA":
        n.blend_type = blend
        n.clamp_result = clamp
    _feed(nt, _sock(n.inputs, "Factor"), fac)
    _feed(nt, _sock(n.inputs, "A"), a)
    _feed(nt, _sock(n.inputs, "B"), b)
    return n, _sock(n.outputs, "Result")


def _math(nt, op, a=None, b=None, loc=(0, 0), clamp=False, label=None):
    n = _new(nt, "ShaderNodeMath", loc, label, operation=op, use_clamp=clamp)
    _feed(nt, n.inputs[0], a)
    if b is not None:
        _feed(nt, n.inputs[1], b)
    return n, n.outputs[0]


def _maprange(nt, v, fmin, fmax, tmin=0.0, tmax=1.0, interp="LINEAR", loc=(0, 0), clamp=True, label=None):
    n = _new(nt, "ShaderNodeMapRange", loc, label, interpolation_type=interp, clamp=clamp)
    _feed(nt, _sock(n.inputs, "Value"), v)
    _feed(nt, _sock(n.inputs, "From Min"), fmin)
    _feed(nt, _sock(n.inputs, "From Max"), fmax)
    _feed(nt, _sock(n.inputs, "To Min"), tmin)
    _feed(nt, _sock(n.inputs, "To Max"), tmax)
    return n, _sock(n.outputs, "Result")


def _upstream(sock):
    """(from_socket or None, default value) of an input socket."""
    if sock.is_linked:
        return sock.links[0].from_socket, None
    dv = sock.default_value
    return None, (tuple(dv) if hasattr(dv, "__len__") else dv)


def _source(nt, sock, loc):
    """A socket carrying what currently feeds `sock` (an RGB/Value node for constants)."""
    s, dv = _upstream(sock)
    if s is not None:
        return s
    if sock.type == "RGBA":
        n = _new(nt, "ShaderNodeRGB", loc)
        n.outputs[0].default_value = dv
        return n.outputs[0]
    n = _new(nt, "ShaderNodeValue", loc)
    n.outputs[0].default_value = dv
    return n.outputs[0]


def _group_node(nt, ng, loc=(0, 0)):
    g = _new(nt, "ShaderNodeGroup", loc)
    g.node_tree = ng
    return g


def _iface(ng, name, io, stype, default=None, lo=None, hi=None):
    s = ng.interface.new_socket(name=name, in_out=io, socket_type=stype)
    if default is not None:
        s.default_value = default
    if lo is not None:
        s.min_value = lo
    if hi is not None:
        s.max_value = hi
    return s


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(np.asarray(c, dtype=np.float64), 0, None)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


# --------------------------------------------------------------------------------------
# texture sets
# --------------------------------------------------------------------------------------

# roles whose images are colour (sRGB); every other role is data (Non-Color)
COLOR_ROLES = {"base_color", "emission"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".exr", ".tga", ".bmp", ".webp"}
_SKIP = {"preview", "thumb", "thumbnail", "sphere", "render", "cube", "swatch"}
_ROLE_TOKENS = [
    ("orm", {"orm", "arm", "occlusionroughnessmetallic", "occlusionroughnessmetalness"}),
    ("normal", {"normal", "nor", "nrm", "norm", "normalgl", "normaldx", "normalmap"}),
    ("ao", {"ao", "ambientocclusion", "occlusion", "occ"}),
    ("roughness", {"roughness", "rough", "rgh"}),
    ("gloss", {"gloss", "glossiness"}),
    ("metallic", {"metallic", "metalness", "metal", "mtl"}),
    ("height", {"height", "disp", "displacement", "bump", "heightmap"}),
    ("opacity", {"opacity", "alpha", "transparency"}),
    ("emission", {"emission", "emissive", "emit", "glow"}),
    ("specular", {"specular", "spec", "reflection", "refl"}),
    ("base_color", {"basecolor", "albedo", "diffuse", "diff", "color", "colour", "col", "base"}),
]


def _tokens(stem):
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", stem)       # camelCase -> camel_Case
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", s)
    return [t for t in re.split(r"[^a-zA-Z0-9]+", s.lower()) if t]


_NOISE_TOK = re.compile(r"^(\d+k|\d+|png|jpe?g|exr|tiff?|tga|webp|gl|dx|opengl|directx|\d+bits?|bit|lod\d*|udim|srgb|linear|map|tex|texture|t|m)$")


def classify_texture(filename):
    """Role of a texture file from its name, or None. The role word is taken from the END
    of the name (skipping resolution/format tokens) so a material called 'metal_plate'
    does not turn its diffuse into a metallic map. Normal maps return 'normal' or
    'normal_dx' (DirectX green: ambientCG _NormalDX, Poly Haven _nor_dx)."""
    stem, ext = os.path.splitext(os.path.basename(filename))
    if ext.lower() not in IMAGE_EXT:
        return None
    toks = _tokens(stem)
    if any(t in _SKIP for t in toks):
        return None
    flat = "".join(toks)
    if {"orm", "arm"} & set(toks) or "occlusionroughnessmetal" in flat:
        return "orm"
    dx = bool({"dx", "directx"} & set(toks)) or "normaldx" in flat or "nordx" in flat
    role_of = {}
    for role, words in _ROLE_TOKENS:
        for w in words:
            role_of.setdefault(w, role)
    for i in range(len(toks) - 1, -1, -1):
        t = toks[i]
        if _NOISE_TOK.match(t):
            continue
        pair = toks[i - 1] + t if i > 0 else None
        role = role_of.get(pair) if pair else None
        role = role or role_of.get(t)
        if role is None:
            continue
        if role == "normal" and dx:
            return "normal_dx"
        return role
    return None


def find_texture_set(folder, stem=None):
    """{role: path} for the images in `folder` (optionally only names containing `stem`).
    Preference when a role appears twice: exr > png > tif > jpg, then larger file."""
    pref = {".exr": 0, ".png": 1, ".tif": 2, ".tiff": 2, ".tga": 3, ".jpg": 4, ".jpeg": 4}
    found = {}
    for f in sorted(os.listdir(folder)):
        if stem and stem.lower() not in f.lower():
            continue
        role = classify_texture(f)
        if role is None:
            continue
        p = os.path.join(folder, f)
        key = (pref.get(os.path.splitext(f)[1].lower(), 5), -os.path.getsize(p))
        if role not in found or key < found[role][0]:
            found[role] = (key, p)
    return {r: v[1] for r, v in found.items()}


def load_image(path, role):
    """Load (or reuse) an image and set its colour space for the role."""
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = "sRGB" if role in COLOR_ROLES else "Non-Color"
    return img


def pbr_from_textures(mat, maps, uv_map=None, projection="UV", box_blend=0.2, scale=(1.0, 1.0, 1.0),
                      height_as="auto", height_depth=0.005, displacement_midlevel=0.5,
                      ao_mode="multiply", ao_strength=1.0, clear=True):
    """Wire a texture set into a Principled BSDF v2 by socket NAME.

    maps: {role: path or bpy Image}; roles base_color, roughness, gloss, metallic, normal,
          normal_dx, height, ao, orm (R=AO, G=roughness, B=metallic; Poly Haven 'arm'),
          opacity, emission. Unknown roles are ignored ('specular' is reported, not wired).
    uv_map: explicit UV map name for every image node (Kaspar: never rely on the active
          render UV). projection='BOX' uses Object coordinates + box blending (no UVs).
    height_as: 'auto' (bump only when there is no normal map), 'bump', 'displacement'
          (true displacement; the normal map is then NOT wired: Price, confirmed by Brecht,
          normal map and displacement encode the same relief), 'none'.
    height_depth: metres that height 0..1 spans; becomes the Bump Distance (the 5.2 default
          0.001 is 1 mm) or the Displacement Scale (Poliigon: 0.2, a fixed 20 cm range).
    ao_mode: 'multiply' (Price: AO x base colour at factor 1 for scanned sets, restores the
          cavity shadow the flash capture removed; optional under true displacement),
          'gltf' (game export: separate occlusion via a glTF Material Output group, never
          baked into albedo), 'none'.
    Returns the material. Non-Color is set on every data map, sRGB on colour maps."""
    mat = get_material(mat)
    nt = mat.node_tree
    if clear:
        for n in list(nt.nodes):
            nt.nodes.remove(n)
    out = _new(nt, "ShaderNodeOutputMaterial", (900, 0))
    p = _new(nt, "ShaderNodeBsdfPrincipled", (500, 0))
    _link(nt, p.outputs["BSDF"], out.inputs["Surface"])
    maps = dict(maps)
    if "normal_dx" in maps and "normal" not in maps:
        maps["normal"], dx = maps.pop("normal_dx"), True
    else:
        dx = False
        maps.pop("normal_dx", None)
    if projection == "BOX":
        tc = _new(nt, "ShaderNodeTexCoord", (-1100, 0))
        vec_src = tc.outputs["Object"]
    else:
        uvn = _new(nt, "ShaderNodeUVMap", (-1100, 0))
        if uv_map:
            uvn.uv_map = uv_map
        vec_src = uvn.outputs["UV"]
    mapping = _new(nt, "ShaderNodeMapping", (-900, 0))
    mapping.inputs["Scale"].default_value = scale
    _link(nt, vec_src, mapping.inputs["Vector"])

    y = [400]

    def tex(role):
        src = maps[role]
        img = src if isinstance(src, bpy.types.Image) else load_image(src, role)
        img.colorspace_settings.name = "sRGB" if role in COLOR_ROLES else "Non-Color"
        n = _new(nt, "ShaderNodeTexImage", (-600, y[0]), role)
        y[0] -= 300
        n.image = img
        if projection == "BOX":
            n.projection, n.projection_blend = "BOX", box_blend
        _link(nt, mapping.outputs["Vector"], n.inputs["Vector"])
        return n

    ao_sock = None
    if "base_color" in maps:
        t = tex("base_color")
        base = t.outputs["Color"]
    else:
        base = None
    if "orm" in maps:
        t = tex("orm")
        sep = _new(nt, "ShaderNodeSeparateColor", (-300, y[0] + 300))
        _link(nt, t.outputs["Color"], sep.inputs["Color"])
        _link(nt, sep.outputs["Green"], p.inputs["Roughness"])
        _link(nt, sep.outputs["Blue"], p.inputs["Metallic"])
        ao_sock = sep.outputs["Red"]
    if "roughness" in maps:
        _link(nt, tex("roughness").outputs["Color"], p.inputs["Roughness"])
    elif "gloss" in maps:
        _, inv = _math(nt, "SUBTRACT", 1.0, tex("gloss").outputs["Color"], (-300, y[0] + 300))
        _link(nt, inv, p.inputs["Roughness"])
    if "metallic" in maps:
        _link(nt, tex("metallic").outputs["Color"], p.inputs["Metallic"])
    if "ao" in maps and ao_sock is None:
        ao_sock = tex("ao").outputs["Color"]
    if base is not None:
        if ao_sock is not None and ao_mode == "multiply":
            _, base = _mix(nt, "RGBA", "MULTIPLY", ao_strength, base, ao_sock, (-150, 350), "AO multiply")
        _link(nt, base, p.inputs["Base Color"])
    if "opacity" in maps:
        _link(nt, tex("opacity").outputs["Color"], p.inputs["Alpha"])
        mat.surface_render_method = "DITHERED"
    if "emission" in maps:
        _link(nt, tex("emission").outputs["Color"], p.inputs["Emission Color"])
        p.inputs["Emission Strength"].default_value = 1.0     # 5.x default is 0
    normal_out = None
    if "normal" in maps and projection == "BOX":
        maps.pop("normal")                         # tangent frame comes from UVs, box projection has none [added]
        mat["bx_note"] = "normal map dropped: box projection (height drives bump instead)"
    if "normal" in maps and height_as == "displacement" and "height" in maps:
        maps.pop("normal")                         # one or the other, never both (Price)
        mat["bx_note"] = "normal map dropped: true displacement in use"
    if "normal" in maps:
        t = tex("normal")
        nm = _new(nt, "ShaderNodeNormalMap", (-150, y[0] + 300))
        if uv_map:
            nm.uv_map = uv_map
        if dx:
            nm.convention = "DIRECTX"
        _link(nt, t.outputs["Color"], nm.inputs["Color"])
        normal_out = nm.outputs["Normal"]
    mode = height_as
    if mode == "auto":
        mode = "bump" if ("height" in maps and "normal" not in maps) else "none"
    if "height" in maps and mode in ("bump", "displacement"):
        t = tex("height")
        t.interpolation = "Cubic"                  # Price: hides 8/16-bit stepping
        if mode == "bump":
            b = _new(nt, "ShaderNodeBump", (150, -400))
            b.inputs["Distance"].default_value = height_depth
            b.inputs["Strength"].default_value = 1.0
            _link(nt, t.outputs["Color"], b.inputs["Height"])
            if normal_out is not None:                    # chain, never add normals
                _link(nt, normal_out, b.inputs["Normal"])
            normal_out = b.outputs["Normal"]
        else:
            d = _new(nt, "ShaderNodeDisplacement", (500, -500))
            d.inputs["Midlevel"].default_value = displacement_midlevel
            d.inputs["Scale"].default_value = height_depth
            _link(nt, t.outputs["Color"], d.inputs["Height"])
            _link(nt, d.outputs["Displacement"], out.inputs["Displacement"])
            mat.displacement_method = "BOTH"
    if normal_out is not None:
        _link(nt, normal_out, p.inputs["Normal"])
    if ao_mode == "gltf" and ao_sock is not None:
        ng = bpy.data.node_groups.get("glTF Material Output")
        if ng is None:
            ng = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
            _iface(ng, "Occlusion", "INPUT", "NodeSocketFloat", 1.0, 0.0, 1.0)
        g = _group_node(nt, ng, (900, -300))
        _link(nt, ao_sock, g.inputs["Occlusion"])
    mat["bx_texture_set"] = {k: (v.filepath if isinstance(v, bpy.types.Image) else v) for k, v in maps.items()}
    return mat


# --------------------------------------------------------------------------------------
# wear, dirt, variation
# --------------------------------------------------------------------------------------


def edge_wear_group(name="BX Edge Wear"):
    """Node group: Edges (convex), Cavity (concave), Wear (edges broken by noise into
    chips), Dirt (cavities broken by noise). Edges = angle between the Bevel-node normal
    and the shading normal (linear across the bevel radius), kept only where AO says the
    surface is open (convex). Cavity = 1 - AO.
    Cycles only for Edges/Wear: the Bevel node returns the plain normal in EEVEE (masks
    go black, verified), and EEVEE's AO node is screen-space (Cavity/Dirt differ). For
    EEVEE or a game engine bake these outputs (scenario-blender-uv-baking) or use
    curvature_attribute()."""
    ng = bpy.data.node_groups.get(name)
    if ng is not None:
        return ng
    ng = bpy.data.node_groups.new(name, "ShaderNodeTree")
    _iface(ng, "Radius", "INPUT", "NodeSocketFloat", 0.03, 0.0, 10.0)
    _iface(ng, "Edge Sharpness", "INPUT", "NodeSocketFloat", 0.35, 0.01, 1.57)
    _iface(ng, "Cavity Distance", "INPUT", "NodeSocketFloat", 0.1, 0.0, 10.0)
    _iface(ng, "Noise Scale", "INPUT", "NodeSocketFloat", 12.0, 0.0, 1000.0)
    _iface(ng, "Breakup", "INPUT", "NodeSocketFloat", 0.8, 0.0, 2.0)
    _iface(ng, "Wear Amount", "INPUT", "NodeSocketFloat", 0.5, 0.0, 1.0)
    _iface(ng, "Dirt Amount", "INPUT", "NodeSocketFloat", 0.5, 0.0, 1.0)
    for o in ("Wear", "Edges", "Cavity", "Dirt"):
        _iface(ng, o, "OUTPUT", "NodeSocketFloat")
    gi = _new(ng, "NodeGroupInput", (-1400, 0))
    go = _new(ng, "NodeGroupOutput", (900, 0))
    geo = _new(ng, "ShaderNodeNewGeometry", (-1200, 300))
    bev = _new(ng, "ShaderNodeBevel", (-1200, 100))
    bev.samples = 16
    _link(ng, gi.outputs["Radius"], bev.inputs["Radius"])
    dot = _new(ng, "ShaderNodeVectorMath", (-1000, 200), operation="DOT_PRODUCT")
    _link(ng, geo.outputs["Normal"], dot.inputs[0])
    _link(ng, bev.outputs["Normal"], dot.inputs[1])
    _, dotc = _math(ng, "MINIMUM", dot.outputs["Value"], 1.0, (-850, 200))
    _, ang = _math(ng, "ARCCOSINE", dotc, None, (-700, 200))          # 0 flat, 0.785 on a 90 deg edge
    _, edge = _maprange(ng, ang, 0.0, gi.outputs["Edge Sharpness"], loc=(-500, 200))
    ao = _new(ng, "ShaderNodeAmbientOcclusion", (-1200, -200), only_local=True, samples=16)
    _link(ng, gi.outputs["Cavity Distance"], ao.inputs["Distance"])
    _, openness = _maprange(ng, ao.outputs["AO"], 0.75, 0.95, loc=(-700, 0))
    _, edge = _math(ng, "MULTIPLY", edge, openness, (-300, 200))
    _, cav = _math(ng, "SUBTRACT", 1.0, ao.outputs["AO"], (-1000, -200))
    _, cav = _maprange(ng, cav, 0.0, 0.5, loc=(-700, -200))
    tc = _new(ng, "ShaderNodeTexCoord", (-1200, -500))
    nz = _new(ng, "ShaderNodeTexNoise", (-1000, -500))
    nz.inputs["Detail"].default_value = 5.0           # Price: Detail above 5-6 blows up shader cost
    nz.inputs["Roughness"].default_value = 0.65
    _link(ng, tc.outputs["Object"], nz.inputs["Vector"])
    _link(ng, gi.outputs["Noise Scale"], nz.inputs["Scale"])
    # Noise Fac clusters around 0.5 (roughly 0.3..0.7): stretch it to -1..1 first
    _, n0 = _maprange(ng, nz.outputs["Fac"], 0.3, 0.7, -1.0, 1.0, loc=(-800, -500))
    _, nbw = _math(ng, "MULTIPLY", gi.outputs["Breakup"], 0.5, (-800, -700))
    _, nb = _math(ng, "MULTIPLY", n0, nbw, (-600, -500))
    # thresholds: a higher amount lowers the level the mask must pass
    _, wthr = _math(ng, "SUBTRACT", 1.0, gi.outputs["Wear Amount"], (-500, -300))
    _, wthr_hi = _math(ng, "ADD", wthr, 0.06, (-300, -300))
    _, e2 = _math(ng, "ADD", edge, nb, (-100, 200))
    _, wear = _maprange(ng, e2, wthr, wthr_hi, loc=(250, 200))
    _, dthr = _math(ng, "SUBTRACT", 1.0, gi.outputs["Dirt Amount"], (-500, -700))
    _, dthr_hi = _math(ng, "ADD", dthr, 0.2, (-300, -700))
    _, d2 = _math(ng, "ADD", cav, nb, (-100, -200))
    _, dirt = _maprange(ng, d2, dthr, dthr_hi, loc=(250, -200))
    _link(ng, wear, go.inputs["Wear"])
    _link(ng, edge, go.inputs["Edges"])
    _link(ng, cav, go.inputs["Cavity"])
    _link(ng, dirt, go.inputs["Dirt"])
    return ng


def grunge_group(name="BX Grunge"):
    """Node group: Variation (low-frequency 0..1 around 0.5, for hue/value shifts),
    Grunge (spotty coverage mask), Streaks (vertical, stretched along Z). Works in EEVEE
    and Cycles. Feed Vector with Object coords (rigid props) or UV (deforming meshes)."""
    ng = bpy.data.node_groups.get(name)
    if ng is not None:
        return ng
    ng = bpy.data.node_groups.new(name, "ShaderNodeTree")
    _iface(ng, "Vector", "INPUT", "NodeSocketVector")
    _iface(ng, "Scale", "INPUT", "NodeSocketFloat", 4.0, 0.0, 1000.0)
    _iface(ng, "Variation Scale", "INPUT", "NodeSocketFloat", 1.5, 0.0, 1000.0)
    _iface(ng, "Coverage", "INPUT", "NodeSocketFloat", 0.3, 0.0, 1.0)
    _iface(ng, "Softness", "INPUT", "NodeSocketFloat", 0.1, 0.001, 1.0)
    _iface(ng, "Streak Stretch", "INPUT", "NodeSocketFloat", 10.0, 1.0, 100.0)
    for o in ("Variation", "Grunge", "Streaks"):
        _iface(ng, o, "OUTPUT", "NodeSocketFloat")
    gi = _new(ng, "NodeGroupInput", (-1200, 0))
    go = _new(ng, "NodeGroupOutput", (800, 0))
    nv = _new(ng, "ShaderNodeTexNoise", (-800, 300))
    nv.inputs["Detail"].default_value = 2.0
    _link(ng, gi.outputs["Vector"], nv.inputs["Vector"])
    _link(ng, gi.outputs["Variation Scale"], nv.inputs["Scale"])
    _link(ng, nv.outputs["Fac"], go.inputs["Variation"])
    ng_ = _new(ng, "ShaderNodeTexNoise", (-800, 0))
    ng_.inputs["Detail"].default_value = 5.0
    ng_.inputs["Roughness"].default_value = 0.7
    _link(ng, gi.outputs["Vector"], ng_.inputs["Vector"])
    _link(ng, gi.outputs["Scale"], ng_.inputs["Scale"])
    vo = _new(ng, "ShaderNodeTexVoronoi", (-800, -250))
    _link(ng, gi.outputs["Vector"], vo.inputs["Vector"])
    _, vs = _math(ng, "MULTIPLY", gi.outputs["Scale"], 2.0, (-1000, -250))
    _link(ng, vs, vo.inputs["Scale"])
    _, g = _mix(ng, "FLOAT", fac=0.3, a=ng_.outputs["Fac"], b=vo.outputs["Distance"], loc=(-550, 0))
    # coverage: fraction of the surface that ends up above the threshold (roughly)
    _, thr = _math(ng, "SUBTRACT", 0.7, _math(ng, "MULTIPLY", gi.outputs["Coverage"], 0.4, loc=(-550, -200))[1], (-350, -200))
    _, thr_hi = _math(ng, "ADD", thr, gi.outputs["Softness"], (-150, -200))
    _, grunge = _maprange(ng, g, thr, thr_hi, loc=(100, 0))
    _link(ng, grunge, go.inputs["Grunge"])
    mp = _new(ng, "ShaderNodeMapping", (-800, -550))
    _link(ng, gi.outputs["Vector"], mp.inputs["Vector"])
    _, inv = _math(ng, "DIVIDE", 1.0, gi.outputs["Streak Stretch"], (-1000, -600))
    cz = _new(ng, "ShaderNodeCombineXYZ", (-1000, -750))
    cz.inputs[0].default_value = 1.0
    cz.inputs[1].default_value = 1.0
    _link(ng, inv, cz.inputs[2])
    _link(ng, cz.outputs[0], mp.inputs["Scale"])
    ns = _new(ng, "ShaderNodeTexNoise", (-550, -550))
    ns.inputs["Detail"].default_value = 5.0
    _link(ng, mp.outputs["Vector"], ns.inputs["Vector"])
    _, ss = _math(ng, "MULTIPLY", gi.outputs["Scale"], 1.5, (-800, -800))
    _link(ng, ss, ns.inputs["Scale"])
    _, streaks = _maprange(ng, ns.outputs["Fac"], 0.5, 0.75, loc=(100, -550))
    _link(ng, streaks, go.inputs["Streaks"])
    return ng


def add_wear(mat, edge_color=None, edge_roughness=None, edge_metallic=None,
             dirt_color=(0.06, 0.05, 0.04), dirt_roughness=0.9, dirt_amount=0.8,
             grunge_amount=0.35, variation=0.06, coords="OBJECT", uv_map=None,
             radius=0.03, wear_amount=0.5, cavity_dirt=0.5, noise_scale=12.0, grunge_scale=4.0):
    """Insert colour variation, grunge/dirt and edge wear between whatever feeds the
    Principled Base Color / Roughness (/ Metallic) and the BSDF. Returns the group nodes.
    edge_*: what worn convex edges become (None = leave that channel). Dirt goes into
    cavities (AO) and grunge spots; it darkens and roughens. variation: +- value shift.
    Edge wear and cavity dirt use Bevel/AO, i.e. Cycles; grunge/variation work everywhere.
    Bevel/AO are sampled per render sample: any threshold on them (wear chips, the 0/1
    metallic here) averages to fractional values at the border (17-18% grey metallic at
    16-128 spp, 0% at 1 spp, measured). For final frames, EEVEE or games bake Wear/Dirt
    to textures first (scenario-blender-uv-baking), then threshold the baked mask."""
    mat = get_material(mat)
    nt = mat.node_tree
    p = principled(mat)
    x0, y0 = p.location.x - 700, p.location.y
    bc = _source(nt, p.inputs["Base Color"], (x0 - 400, y0 + 300))
    rg = _source(nt, p.inputs["Roughness"], (x0 - 400, y0 - 100))
    if coords == "UV":
        c = _new(nt, "ShaderNodeUVMap", (x0 - 600, y0 - 600))
        if uv_map:
            c.uv_map = uv_map
        vec = c.outputs["UV"]
    else:
        vec = _new(nt, "ShaderNodeTexCoord", (x0 - 600, y0 - 600)).outputs["Object"]
    gg = _group_node(nt, grunge_group(), (x0 - 350, y0 - 600))
    gg.label = "grunge"
    _link(nt, vec, gg.inputs["Vector"])
    gg.inputs["Scale"].default_value = grunge_scale
    gg.inputs["Coverage"].default_value = grunge_amount
    ew = _group_node(nt, edge_wear_group(), (x0 - 350, y0 - 950))
    ew.label = "edge wear"
    ew.inputs["Radius"].default_value = radius
    ew.inputs["Wear Amount"].default_value = wear_amount
    ew.inputs["Dirt Amount"].default_value = cavity_dirt
    ew.inputs["Noise Scale"].default_value = noise_scale
    # variation: value (and a touch of hue) from the low-frequency noise
    hsv = _new(nt, "ShaderNodeHueSaturation", (x0, y0 + 300), "variation")
    _, hue = _maprange(nt, gg.outputs["Variation"], 0.0, 1.0, 0.5 - variation * 0.15, 0.5 + variation * 0.15, loc=(x0 - 200, y0 + 450))
    _, val = _maprange(nt, gg.outputs["Variation"], 0.0, 1.0, 1.0 - variation * 2, 1.0 + variation * 2, loc=(x0 - 200, y0 + 150))
    _link(nt, hue, hsv.inputs["Hue"])
    _link(nt, val, hsv.inputs["Value"])
    _link(nt, bc, hsv.inputs["Color"])
    # dirt = max(cavity dirt, grunge) * amount
    _, dmask = _math(nt, "MAXIMUM", ew.outputs["Dirt"], gg.outputs["Grunge"], (x0 + 50, y0 - 300))
    _, dmask = _math(nt, "MULTIPLY", dmask, dirt_amount, (x0 + 200, y0 - 300), clamp=True)
    _, col = _mix(nt, "RGBA", "MIX", dmask, hsv.outputs["Color"], dirt_color, (x0 + 250, y0 + 300), "dirt")
    _, rough = _mix(nt, "FLOAT", fac=dmask, a=rg, b=dirt_roughness, loc=(x0 + 250, y0 - 100))
    if edge_color is not None:
        _, col = _mix(nt, "RGBA", "MIX", ew.outputs["Wear"], col, edge_color, (x0 + 450, y0 + 300), "edge wear")
    if edge_roughness is not None:
        _, rough = _mix(nt, "FLOAT", fac=ew.outputs["Wear"], a=rough, b=edge_roughness, loc=(x0 + 450, y0 - 100))
    if edge_metallic is not None:
        # metallic stays a 0/1 mask: harden the soft wear edge (value_report flagged 19%
        # grey metallic when the soft mask drove it directly)
        mt = _source(nt, p.inputs["Metallic"], (x0 - 400, y0 - 250))
        _, hard = _math(nt, "GREATER_THAN", ew.outputs["Wear"], 0.5, (x0 + 250, y0 - 250))
        _, met = _mix(nt, "FLOAT", fac=hard, a=mt, b=edge_metallic, loc=(x0 + 450, y0 - 250))
        _link(nt, met, p.inputs["Metallic"])
    _link(nt, col, p.inputs["Base Color"])
    _link(nt, rough, p.inputs["Roughness"])
    return {"grunge": gg, "edge_wear": ew}


def painted_light(mat, obj=None, curvature="col_curvature", top=1.15, bottom=0.8, crevice=0.45, highlight=0.4,
                  highlight_color=(1.0, 0.95, 0.85)):
    """Grant Abbitt's hand-painted stylized pass (5.1 guide) as nodes, for baking into an
    unlit/game albedo: vertical gradient (lighter top, darker bottom), MULTIPLY darkening in
    crevices, SCREEN highlights on extremities. Masks come from a curvature colour
    attribute when `obj` has one (engine independent; see curvature_attribute), else from
    the BX Edge Wear group (Bevel/AO, Cycles). Judge it with preview(rigs=('unlit',)) and
    bake it (Emit) for the game. Returns the final colour socket."""
    mat = get_material(mat)
    nt = mat.node_tree
    p = principled(mat)
    x0, y0 = p.location.x - 900, p.location.y + 500
    base = _source(nt, p.inputs["Base Color"], (x0 - 300, y0))
    tc = _new(nt, "ShaderNodeTexCoord", (x0 - 700, y0 + 300))
    sep = _new(nt, "ShaderNodeSeparateXYZ", (x0 - 500, y0 + 300))
    _link(nt, tc.outputs["Generated"], sep.inputs[0])            # 0 at the bottom of the bbox, 1 at the top
    _, grad = _maprange(nt, sep.outputs["Z"], 0.0, 1.0, bottom, top, loc=(x0 - 300, y0 + 300), label="vertical gradient")
    _, col = _mix(nt, "RGBA", "MULTIPLY", 1.0, base, _math(nt, "MULTIPLY", grad, 1.0, (x0 - 150, y0 + 300))[1], (x0, y0 + 200), "gradient")
    if obj is not None and obj.type == "MESH" and curvature in obj.data.color_attributes:
        vc = _new(nt, "ShaderNodeVertexColor", (x0 - 500, y0 - 200), curvature)
        vc.layer_name = curvature
        k = vc.outputs["Color"]
        _, cav = _maprange(nt, k, 0.45, 0.2, loc=(x0 - 300, y0 - 150), label="crevices")
        _, edge = _maprange(nt, k, 0.55, 0.8, loc=(x0 - 300, y0 - 350), label="extremities")
    else:
        ew = _group_node(nt, edge_wear_group(), (x0 - 500, y0 - 250))
        cav, edge = ew.outputs["Cavity"], ew.outputs["Edges"]
    _, fc = _math(nt, "MULTIPLY", cav, crevice, (x0 - 100, y0 - 150))
    _, col = _mix(nt, "RGBA", "MULTIPLY", fc, col, (0.0, 0.0, 0.0), (x0 + 200, y0), "crevices (multiply)")
    _, fe = _math(nt, "MULTIPLY", edge, highlight, (x0 - 100, y0 - 350))
    _, col = _mix(nt, "RGBA", "SCREEN", fe, col, highlight_color, (x0 + 400, y0), "highlights (screen)")
    _link(nt, col, p.inputs["Base Color"])
    return col


# --------------------------------------------------------------------------------------
# stylized character shading (Julien Kaspar, Snow lives, translated to Principled v2)
# --------------------------------------------------------------------------------------


def _attr_fac(nt, obj, name, loc):
    """Fac of a colour attribute if the mesh has it, else None."""
    if obj is None or obj.type != "MESH" or name not in obj.data.color_attributes:
        return None
    n = _new(nt, "ShaderNodeVertexColor", loc, name)
    n.layer_name = name
    return n.outputs["Color"]


def stylized_skin(mat, obj=None, base_color=(0.50, 0.26, 0.18), brighter_color=(0.68, 0.40, 0.29),
                  darker_color=(0.36, 0.16, 0.12), lips_color=(0.45, 0.14, 0.12),
                  sss_scale=(0.005, 0.04), base_roughness=0.7, rough_zone=(0.72, 1.0), lips_roughness=0.45,
                  pore_scale=100.0, pore_amount=0.06, noise_mix=0.22, coords="UV", uv_map=None,
                  masks=None):
    """Kaspar's Snow skin in 5.2 terms. Masks are black/white colour attributes, read only
    if present on `obj`: col_brighter, col_darker, col_lips, col_sss, col_rough.
      base colour: start darker, brighten/darken through masks; lips mask removed from both.
      SSS: Subsurface Weight 1, Subsurface Scale = Map Range(col_sss) over `sss_scale`
           metres, Random Walk (Skin). His v1 'Subsurface' 0.02..0.15 was a radius
           multiplier; in 5.2 (Random Walk rescaled) those values turned a 0.33 m head's
           ears white-pink and waxy in a backlit Cycles test, 0.005..0.04 gave the red
           glow he asks for (measured, test_skin.py). Scale with character size.
      roughness: base 0.68..0.72 with pores (two Voronoi Smooth F1 scales, mixed by a
           detail-0 noise, general noise mixed at ~0.2); col_rough -> 0.72..1; lips glossy.
      Specular IOR Level stays 0.5: wetness is roughness, not specular.
    Returns the material."""
    mat = get_material(mat)
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    names = {"brighter": "col_brighter", "darker": "col_darker", "lips": "col_lips",
             "sss": "col_sss", "rough": "col_rough"}
    names.update(masks or {})
    out = _new(nt, "ShaderNodeOutputMaterial", (1400, 0))
    p = _new(nt, "ShaderNodeBsdfPrincipled", (1000, 0))
    _link(nt, p.outputs["BSDF"], out.inputs["Surface"])
    p.subsurface_method = "RANDOM_WALK_SKIN"
    p.inputs["Subsurface Weight"].default_value = 1.0
    p.inputs["Specular IOR Level"].default_value = 0.5
    # ---- base colour block
    m = {k: _attr_fac(nt, obj, v, (-1200, 600 - i * 180)) for i, (k, v) in enumerate(names.items())}
    col = base_color
    not_lips = None
    if m["lips"] is not None:
        _, not_lips = _math(nt, "SUBTRACT", 1.0, m["lips"], (-900, 700))
    for key, c, blend in (("brighter", brighter_color, "MIX"), ("darker", darker_color, "MIX")):
        if m[key] is None:
            continue
        f = m[key]
        if not_lips is not None:
            _, f = _math(nt, "MULTIPLY", f, not_lips, (-700, 600 if key == "brighter" else 450))
        _, col = _mix(nt, "RGBA", blend, f, col, c, (-450, 600 if key == "brighter" else 450), key)
    if m["lips"] is not None:
        _, col = _mix(nt, "RGBA", "MIX", m["lips"], col, lips_color, (-200, 500), "lips")
    _feed(nt, p.inputs["Base Color"], col)
    # ---- SSS amount block (mask stays black/white, Map Range sets the real values)
    if m["sss"] is not None:
        _, s = _maprange(nt, m["sss"], 0.0, 1.0, sss_scale[0], sss_scale[1], loc=(300, -150), label="sss scale")
        _link(nt, s, p.inputs["Subsurface Scale"])
    else:
        p.inputs["Subsurface Scale"].default_value = (sss_scale[0] + sss_scale[1]) * 0.5
    # ---- roughness block: pores in roughness, not in bump
    if coords == "UV":
        cn = _new(nt, "ShaderNodeUVMap", (-1400, -500))
        if uv_map:
            cn.uv_map = uv_map
        vec = cn.outputs["UV"]
    else:
        vec = _new(nt, "ShaderNodeTexCoord", (-1400, -500)).outputs["Object"]
    v1 = _new(nt, "ShaderNodeTexVoronoi", (-1100, -400), "pores 1", feature="SMOOTH_F1")
    v2 = _new(nt, "ShaderNodeTexVoronoi", (-1100, -650), "pores 2", feature="SMOOTH_F1")
    v1.inputs["Scale"].default_value = pore_scale
    v2.inputs["Scale"].default_value = pore_scale * 2
    nsz = _new(nt, "ShaderNodeTexNoise", (-1100, -900), "pore size mix")
    nsz.inputs["Detail"].default_value = 0.0
    nsz.inputs["Scale"].default_value = pore_scale * 0.05
    ngen = _new(nt, "ShaderNodeTexNoise", (-1100, -1150), "general noise")
    ngen.inputs["Scale"].default_value = pore_scale * 0.5
    for n in (v1, v2, nsz, ngen):
        _link(nt, vec, n.inputs["Vector"])
    _, pores = _mix(nt, "FLOAT", fac=nsz.outputs["Fac"], a=v1.outputs["Distance"], b=v2.outputs["Distance"], loc=(-850, -500))
    _, pores = _mix(nt, "FLOAT", fac=noise_mix, a=pores, b=ngen.outputs["Fac"], loc=(-650, -500))
    # pore centres (low distance) glossier, cracks rougher
    _, rough = _maprange(nt, pores, 0.0, 1.0, base_roughness - pore_amount, base_roughness + pore_amount,
                         loc=(-450, -500), label="pore roughness")
    if m["rough"] is not None:
        _, zone = _maprange(nt, m["rough"], 0.0, 1.0, rough_zone[0], rough_zone[1], loc=(-450, -250), label="rough zones")
        _, rough = _mix(nt, "FLOAT", fac=m["rough"], a=rough, b=zone, loc=(-200, -400))
    if m["lips"] is not None:
        _, rough = _mix(nt, "FLOAT", fac=m["lips"], a=rough, b=lips_roughness, loc=(0, -400))
    _link(nt, rough, p.inputs["Roughness"])
    mat.diffuse_color = tuple(base_color) + (1.0,)          # Workbench / animator solid view
    return mat


def stylized_eye(mat, iris_color=(0.10, 0.20, 0.33), sclera_color=(0.80, 0.74, 0.70),
                 sclera_edge=(0.72, 0.50, 0.45), iris_radius=0.45, pupil_radius=0.18,
                 radius=1.0, forward="-Y", streaks=True, iris_metallic=0.6):
    """Procedural stylized eye on an eyeball whose ORIGIN is the eyeball centre and whose
    front pole looks along `forward` (object axes). Kaspar: spherical gradient in object
    space (here centred on the front pole), Linear Light noise to break the circles,
    darker limbal rim, radial iris streaks, off-white sclera tinted to flesh at the edges,
    black pupil without specular. iris_radius/pupil_radius are fractions of `radius`.
    One object per eye (mirror modifier removed) or the gradient is shared and wrong."""
    mat = get_material(mat)
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = _new(nt, "ShaderNodeOutputMaterial", (1500, 0))
    p = _new(nt, "ShaderNodeBsdfPrincipled", (1150, 0))
    _link(nt, p.outputs["BSDF"], out.inputs["Surface"])
    axis = {"-Y": (0, -1, 0), "Y": (0, 1, 0), "-X": (-1, 0, 0), "X": (1, 0, 0), "Z": (0, 0, 1), "-Z": (0, 0, -1)}[forward]
    tc = _new(nt, "ShaderNodeTexCoord", (-1500, 0))
    # distance from the front pole, normalised by radius: 0 at pole
    sub = _new(nt, "ShaderNodeVectorMath", (-1300, 0), operation="SUBTRACT")
    _link(nt, tc.outputs["Object"], sub.inputs[0])
    sub.inputs[1].default_value = tuple(a * radius for a in axis)
    ln = _new(nt, "ShaderNodeVectorMath", (-1100, 0), operation="LENGTH")
    _link(nt, sub.outputs["Vector"], ln.inputs[0])
    _, d = _math(nt, "DIVIDE", ln.outputs["Value"], radius, (-900, 0))
    # break the circle without moving it: Linear Light with low-contrast noise
    nz = _new(nt, "ShaderNodeTexNoise", (-1100, -250))
    nz.inputs["Scale"].default_value = 6.0 / radius
    _link(nt, tc.outputs["Object"], nz.inputs["Vector"])
    _, dn = _mix(nt, "FLOAT", fac=0.06, a=d, b=nz.outputs["Fac"], loc=(-700, 0))
    _, iris_m = _maprange(nt, dn, iris_radius, iris_radius - 0.03, interp="SMOOTHSTEP", loc=(-500, 150), label="iris mask")
    _, pupil_m = _maprange(nt, dn, pupil_radius, pupil_radius - 0.015, interp="SMOOTHSTEP", loc=(-500, -50), label="pupil mask")
    _, rim = _maprange(nt, dn, iris_radius * 0.72, iris_radius, 0.0, 1.0, interp="SMOOTHSTEP", loc=(-500, 350), label="limbal rim")
    iris_c = iris_color
    if streaks:
        # radial streaks: polar coordinates around the forward axis
        sep = _new(nt, "ShaderNodeSeparateXYZ", (-1100, -500))
        _link(nt, sub.outputs["Vector"], sep.inputs[0])
        a_idx = [i for i in range(3) if axis[i] == 0]
        _, ang = _math(nt, "ARCTAN2", sep.outputs[a_idx[0]], sep.outputs[a_idx[1]], (-900, -500))
        cmb = _new(nt, "ShaderNodeCombineXYZ", (-700, -500))
        _, angs = _math(nt, "MULTIPLY", ang, 12.0, (-800, -650))
        _link(nt, angs, cmb.inputs[0])
        _, ds = _math(nt, "MULTIPLY", d, 3.0, (-800, -800))
        _link(nt, ds, cmb.inputs[1])
        vo = _new(nt, "ShaderNodeTexNoise", (-500, -500))
        vo.inputs["Scale"].default_value = 2.0
        vo.inputs["Detail"].default_value = 4.0
        _link(nt, cmb.outputs[0], vo.inputs["Vector"])
        _, st = _maprange(nt, vo.outputs["Fac"], 0.35, 0.75, loc=(-300, -500))
        light = tuple(min(1.0, c * 2.2 + 0.05) for c in iris_color)
        _, iris_c = _mix(nt, "RGBA", "MIX", st, iris_color, light, (-100, -300), "iris streaks")
    rim_dark = tuple(c * 0.35 for c in iris_color)
    _, iris_c = _mix(nt, "RGBA", "MIX", rim, iris_c, rim_dark, (100, -100), "limbal rim")
    # sclera: never pure white, flesh toward the edges (far from the pole)
    _, edge_t = _maprange(nt, d, 0.8, 1.4, interp="SMOOTHSTEP", loc=(-300, 500))
    _, scl = _mix(nt, "RGBA", "MIX", edge_t, sclera_color, sclera_edge, (100, 500), "sclera")
    _, col = _mix(nt, "RGBA", "MIX", iris_m, scl, iris_c, (350, 300), "iris")
    _, col = _mix(nt, "RGBA", "MIX", pupil_m, col, (0.003, 0.003, 0.003), (550, 300), "pupil")
    _link(nt, col, p.inputs["Base Color"])
    _, met = _math(nt, "MULTIPLY", iris_m, iris_metallic, (350, -300))
    _, met = _mix(nt, "FLOAT", fac=pupil_m, a=met, b=0.0, loc=(550, -300))
    _link(nt, met, p.inputs["Metallic"])
    _, spec = _mix(nt, "FLOAT", fac=pupil_m, a=0.5, b=0.0, loc=(550, -500))        # no highlight in the pupil
    _link(nt, spec, p.inputs["Specular IOR Level"])
    p.inputs["Roughness"].default_value = 0.35
    mat.diffuse_color = tuple(sclera_color) + (1.0,)
    return mat


def cornea_material(mat, ior=1.376, roughness=0.02):
    """Clear cornea shell: Transmission 1, low roughness, Material Output Thickness 0
    (SLAB). Without the zero thickness EEVEE refracts the shell as a solid glass ball and
    magnifies the iris across the eye; Cycles is right either way (verified). Keep
    material.use_raytrace_refraction on (off: the eye vanishes behind a probe reflection)
    and scene.eevee.use_raytracing on. Pair with obj.visible_shadow = False (Kaspar: the
    cornea casts no shadow; honoured by EEVEE and Cycles, verified). ior: human cornea
    [added]."""
    mat = get_material(mat)
    p = principled(mat)
    out = output_node(mat)
    th = out.inputs["Thickness"]
    if not th.is_linked:          # EEVEE treats a closed transmissive shell as a solid lens
        z = mat.node_tree.nodes.new("ShaderNodeValue")
        z.location = (out.location.x - 200, out.location.y - 300)
        z.label = "thin shell"
        z.outputs[0].default_value = 0.0
        mat.node_tree.links.new(z.outputs[0], th)
    mat.thickness_mode = "SLAB"
    p.inputs["Transmission Weight"].default_value = 1.0
    p.inputs["Roughness"].default_value = roughness
    p.inputs["IOR"].default_value = ior
    p.inputs["Base Color"].default_value = (1, 1, 1, 1)
    mat.use_raytrace_refraction = True
    mat.surface_render_method = "DITHERED"
    return mat


# --------------------------------------------------------------------------------------
# decals
# --------------------------------------------------------------------------------------


def add_decal(mat, obj, image, center, normal, up=(0, 0, 1), size=0.2, uv_name="decal", max_angle=70.0):
    """Kaspar's logo method, scripted: a dedicated UV map projected along -normal onto the
    faces that face it within `size`, every other loop parked outside 0..1; the image node
    uses Extension CLIP so parked loops read alpha 0. Mixes the decal over Base Color by
    its alpha. `image` is a path or bpy Image (sRGB). Returns the mix node."""
    mat = get_material(mat)
    img = image if isinstance(image, bpy.types.Image) else load_image(image, "base_color")
    img.alpha_mode = "CHANNEL_PACKED"
    me = obj.data
    uvl = me.uv_layers.get(uv_name) or me.uv_layers.new(name=uv_name)
    mw = obj.matrix_world
    n = Vector(normal).normalized()
    u = Vector(up).cross(n)
    if u.length < 1e-6:
        u = Vector((1, 0, 0)).cross(n)
    u.normalize()
    v = n.cross(u)
    c = Vector(center)
    cos_max = math.cos(math.radians(max_angle))
    nmat = mw.to_3x3().inverted_safe().transposed()
    uv = np.full((len(me.loops), 2), -2.0, dtype=np.float32)
    for poly in me.polygons:
        pn = (nmat @ poly.normal).normalized()
        if pn.dot(n) < cos_max:
            continue
        for li in poly.loop_indices:
            w = mw @ me.vertices[me.loops[li].vertex_index].co
            d = w - c
            uu, vv = d.dot(u) / size + 0.5, d.dot(v) / size + 0.5
            if abs(d.dot(n)) > size:
                continue
            uv[li] = (uu, vv)
    uvl.uv.foreach_set("vector", uv.ravel())
    nt = mat.node_tree
    p = principled(mat)
    un = _new(nt, "ShaderNodeUVMap", (p.location.x - 900, p.location.y + 700), uv_name)
    un.uv_map = uv_name
    tx = _new(nt, "ShaderNodeTexImage", (p.location.x - 700, p.location.y + 700), "decal")
    tx.image, tx.extension = img, "CLIP"
    _link(nt, un.outputs["UV"], tx.inputs["Vector"])
    base = _source(nt, p.inputs["Base Color"], (p.location.x - 700, p.location.y + 400))
    mix, res = _mix(nt, "RGBA", "MIX", tx.outputs["Alpha"], base, tx.outputs["Color"],
                    (p.location.x - 300, p.location.y + 500), "decal over")
    _link(nt, res, p.inputs["Base Color"])
    return mix


# --------------------------------------------------------------------------------------
# vertex masks (colour attributes)
# --------------------------------------------------------------------------------------


def _mesh_arrays(obj):
    me = obj.data
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    ev = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", ev)
    return co, ev.reshape(-1, 2)


def _vertex_normals(obj):
    me = obj.data
    n = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertex_normals.foreach_get("vector", n)
    return n.reshape(-1, 3)


def _neighbor_mean(values, ev, nv):
    acc = np.zeros((nv,) + values.shape[1:])
    cnt = np.zeros(nv)
    np.add.at(acc, ev[:, 0], values[ev[:, 1]])
    np.add.at(acc, ev[:, 1], values[ev[:, 0]])
    np.add.at(cnt, ev[:, 0], 1)
    np.add.at(cnt, ev[:, 1], 1)
    cnt = np.maximum(cnt, 1)
    return acc / cnt.reshape((-1,) + (1,) * (values.ndim - 1))


def write_vertex_values(obj, name, values, domain="POINT"):
    """Write a per-vertex scalar (0..1) into a FLOAT_COLOR attribute (grey)."""
    me = obj.data
    attr = me.color_attributes.get(name)
    if attr is not None and (attr.domain != domain or attr.data_type != "FLOAT_COLOR"):
        me.color_attributes.remove(attr)
        attr = None
    if attr is None:
        attr = me.color_attributes.new(name=name, type="FLOAT_COLOR", domain=domain)
    v = np.clip(np.asarray(values, dtype=np.float32), 0, 1)
    if domain == "CORNER":
        lv = np.empty(len(me.loops), dtype=np.int64)
        me.loops.foreach_get("vertex_index", lv)
        v = v[lv]
    rgba = np.repeat(v[:, None], 4, axis=1)
    rgba[:, 3] = 1.0
    attr.data.foreach_set("color", rgba.ravel())
    return attr


def read_vertex_values(obj, name):
    attr = obj.data.color_attributes[name]
    a = np.empty(len(attr.data) * 4, dtype=np.float32)
    attr.data.foreach_get("color", a)
    return a.reshape(-1, 4)[:, 0]


def curvature_attribute(obj, name="col_curvature", smooth=2, contrast=4.0):
    """Vertex curvature as a colour attribute: 0.5 flat, > 0.5 convex, < 0.5 concave
    (Laplacian along the normal, scaled by mean edge length). Engine independent: the
    EEVEE/game substitute for Bevel-node edge masks and Cycles-only Pointiness. Depends on
    vertex density like Pointiness: on a low poly, bake from the high instead."""
    co, ev = _mesh_arrays(obj)
    nrm = _vertex_normals(obj)
    nv = len(co)
    lap = _neighbor_mean(co, ev, nv) - co
    el = np.linalg.norm(co[ev[:, 0]] - co[ev[:, 1]], axis=1)
    le = np.zeros(nv)
    ce = np.zeros(nv)
    np.add.at(le, ev[:, 0], el)
    np.add.at(le, ev[:, 1], el)
    np.add.at(ce, ev[:, 0], 1)
    np.add.at(ce, ev[:, 1], 1)
    le = le / np.maximum(ce, 1)
    k = -(lap * nrm).sum(1) / np.maximum(le, 1e-9)      # convex -> positive
    for _ in range(smooth):
        k = 0.5 * k + 0.5 * _neighbor_mean(k, ev, nv)
    val = 0.5 + 0.5 * np.tanh(k * contrast)
    write_vertex_values(obj, name, val)
    return val


def mask_from_points(obj, name, points, falloff="SMOOTH", combine="MAX", base=0.0, smooth=0):
    """Colour-attribute mask from world-space landmarks: points = [(co, radius, value)].
    The substitute for painting a black/white mask by hand (Kaspar paints col_sss,
    col_brighter...). combine MAX or ADD. Returns the per-vertex values."""
    co, ev = _mesh_arrays(obj)
    mw = np.array(obj.matrix_world)
    wco = co @ mw[:3, :3].T + mw[:3, 3]
    val = np.full(len(co), base, dtype=np.float64)
    for c, r, v in points:
        d = np.linalg.norm(wco - np.asarray(c), axis=1) / max(r, 1e-9)
        t = np.clip(1 - d, 0, 1)
        if falloff == "SMOOTH":
            t = t * t * (3 - 2 * t)
        contrib = t * v
        val = np.maximum(val, contrib) if combine == "MAX" else val + contrib
    for _ in range(smooth):
        val = 0.5 * val + 0.5 * _neighbor_mean(val, ev, len(co))
    write_vertex_values(obj, name, np.clip(val, 0, 1))
    return val


def smooth_attribute(obj, name, iterations=4, factor=0.5):
    """Laplacian blur of a POINT colour attribute (the headless 'blur brush')."""
    co, ev = _mesh_arrays(obj)
    v = read_vertex_values(obj, name).astype(np.float64)
    for _ in range(iterations):
        v = (1 - factor) * v + factor * _neighbor_mean(v, ev, len(co))
    write_vertex_values(obj, name, v)
    return v


# --------------------------------------------------------------------------------------
# UV-space painting (headless substitute for texture-paint strokes)
# --------------------------------------------------------------------------------------


class TexelMap:
    """World position, world normal and validity of every texel of a res x res image,
    rasterised from `uv_layer` (default: active render UV). Array layout matches
    image.pixels: row 0 is the BOTTOM of the image (v = 0).
    Strokes painted by world distance through this map are seam-proof: a dab that
    crosses a UV seam lands on both islands, unlike a stroke drawn in UV space."""

    def __init__(self, obj, res, uv_layer=None, use_modifiers=False):
        self.res = res
        dg = bpy.context.evaluated_depsgraph_get()
        src = obj.evaluated_get(dg) if use_modifiers else obj
        me = src.to_mesh() if use_modifiers else obj.data
        try:
            me.calc_loop_triangles()
            nt = len(me.loop_triangles)
            tl = np.empty(nt * 3, dtype=np.int64)
            me.loop_triangles.foreach_get("loops", tl)
            tl = tl.reshape(-1, 3)
            tv = np.empty(nt * 3, dtype=np.int64)
            me.loop_triangles.foreach_get("vertices", tv)
            tv = tv.reshape(-1, 3)
            if uv_layer is None:
                uvl = next((u for u in me.uv_layers if u.active_render), me.uv_layers.active)
            else:
                uvl = me.uv_layers[uv_layer]
            uv = np.empty(len(me.loops) * 2, dtype=np.float64)
            uvl.uv.foreach_get("vector", uv)
            uv = uv.reshape(-1, 2)
            co = np.empty(len(me.vertices) * 3, dtype=np.float64)
            me.vertices.foreach_get("co", co)
            co = co.reshape(-1, 3)
            cn = np.empty(len(me.loops) * 3, dtype=np.float64)
            me.corner_normals.foreach_get("vector", cn)
            cn = cn.reshape(-1, 3)
        finally:
            if use_modifiers:
                src.to_mesh_clear()
        mw = np.array(obj.matrix_world)
        co = co @ mw[:3, :3].T + mw[:3, 3]
        nm = np.linalg.inv(mw[:3, :3]).T
        cn = cn @ nm.T
        cn /= np.maximum(np.linalg.norm(cn, axis=1, keepdims=True), 1e-12)
        self.pos = np.zeros((res, res, 3), dtype=np.float32)
        self.nrm = np.zeros((res, res, 3), dtype=np.float32)
        self.valid = np.zeros((res, res), dtype=bool)
        self.tri = np.full((res, res), -1, dtype=np.int32)
        P = uv[tl] * res - 0.5                         # pixel-centre coordinates
        for t in range(len(tl)):
            p0, p1, p2 = P[t]
            x0 = int(max(math.floor(min(p0[0], p1[0], p2[0])), 0))
            x1 = int(min(math.ceil(max(p0[0], p1[0], p2[0])), res - 1))
            y0 = int(max(math.floor(min(p0[1], p1[1], p2[1])), 0))
            y1 = int(min(math.ceil(max(p0[1], p1[1], p2[1])), res - 1))
            if x1 < x0 or y1 < y0:
                continue
            den = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1])
            if abs(den) < 1e-12:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
            w0 = ((p1[1] - p2[1]) * (xs - p2[0]) + (p2[0] - p1[0]) * (ys - p2[1])) / den
            w1 = ((p2[1] - p0[1]) * (xs - p2[0]) + (p0[0] - p2[0]) * (ys - p2[1])) / den
            w2 = 1 - w0 - w1
            ins = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
            if not ins.any():
                continue
            yy, xx = ys[ins], xs[ins]
            W = np.stack([w0[ins], w1[ins], w2[ins]], 1)
            self.pos[yy, xx] = W @ co[tv[t]]
            self.nrm[yy, xx] = W @ cn[tl[t]]
            self.valid[yy, xx] = True
            self.tri[yy, xx] = t
        n = np.linalg.norm(self.nrm, axis=2, keepdims=True)
        self.nrm /= np.maximum(n, 1e-12)
        self.coverage = float(self.valid.mean())


def new_image(name, res, color=(0, 0, 0, 1), colorspace="Non-Color", float_buffer=False):
    """Get-or-create a square image filled with `color` (values as stored, see module doc)."""
    img = bpy.data.images.get(name)
    if img is None or tuple(img.size) != (res, res) or img.is_float != float_buffer:
        if img is not None:
            bpy.data.images.remove(img)
        img = bpy.data.images.new(name, res, res, alpha=True, float_buffer=float_buffer)
    img.colorspace_settings.name = colorspace
    a = np.empty((res, res, 4), dtype=np.float32)
    a[:] = color
    img.pixels.foreach_set(a.ravel())
    img.update()
    return img


def pixels(img):
    """image.pixels as an (h, w, 4) float32 array (row 0 = bottom)."""
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def write_pixels(img, arr):
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    img.update()
    return img


def save_image(img, path, file_format=None):
    """Save to disk (headless scripts have no autosave; Kaspar lost painted maps to this).
    PNG for byte maps, OPEN_EXR for float data."""
    fmt = file_format or ("OPEN_EXR" if path.lower().endswith(".exr") else "PNG")
    img.filepath_raw = path
    img.file_format = fmt
    img.save()
    return path


def _dab_weights(dist, radius, hardness):
    t = np.clip(1 - dist / radius, 0, 1)
    if hardness >= 1:
        return (dist <= radius).astype(np.float32)
    # smoothstep falloff sharpened by hardness
    s = np.clip(t / max(1 - hardness, 1e-3), 0, 1)
    return s * s * (3 - 2 * s)


def paint_sphere(arr, tm, center, radius, color=(1, 1, 1, 1), strength=1.0, hardness=0.3, normal_cut=None):
    """One world-space dab: texels within `radius` of `center` blend toward `color`.
    normal_cut: dot(texel normal, normal_cut) > 0 required (skip the far side of thin parts)."""
    c = np.asarray(center, dtype=np.float32)
    lo, hi = c - radius, c + radius
    box = tm.valid & np.all((tm.pos >= lo) & (tm.pos <= hi), axis=2)
    if not box.any():
        return 0
    yy, xx = np.nonzero(box)
    d = np.linalg.norm(tm.pos[yy, xx] - c, axis=1)
    w = _dab_weights(d, radius, hardness) * strength
    if normal_cut is not None:
        w = w * (tm.nrm[yy, xx] @ np.asarray(normal_cut, dtype=np.float32) > 0)
    col = np.asarray(color, dtype=np.float32)
    arr[yy, xx] = arr[yy, xx] * (1 - w[:, None]) + col * w[:, None]
    return int((w > 0).sum())


def paint_stroke(arr, tm, points, radius, color=(1, 1, 1, 1), strength=1.0, hardness=0.3, spacing=0.3):
    """Dabs along a world-space polyline, spaced `spacing * radius` apart (a brush stroke)."""
    pts = [np.asarray(p, dtype=np.float64) for p in points]
    dabs = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        seg = np.linalg.norm(b - a)
        k = max(1, int(seg / (spacing * radius)))
        dabs += [a + (b - a) * (i / k) for i in range(1, k + 1)]
    touched = 0
    for d in dabs:
        touched += paint_sphere(arr, tm, d, radius, color, strength, hardness)
    return touched


def project(tm, fn, fill=0.0):
    """Evaluate fn(P, N) -> (h, w) values on every valid texel (P, N world position and
    normal arrays of shape (h, w, 3)). The general 'project a 3D mask into the texture'."""
    v = np.asarray(fn(tm.pos, tm.nrm), dtype=np.float32)
    return np.where(tm.valid, v, fill).astype(np.float32)


def vertex_values_to_texels(obj, values, tm):
    """Rasterise a per-vertex scalar (e.g. curvature_attribute output) into texel space
    by barycentric interpolation, reusing the TexelMap triangle ids."""
    me = obj.data
    me.calc_loop_triangles()
    tv = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("vertices", tv)
    tv = tv.reshape(-1, 3)
    vals = np.asarray(values, dtype=np.float64)
    out = np.zeros((tm.res, tm.res), dtype=np.float32)
    ok = tm.valid
    t = tm.tri[ok]
    # recover barycentrics from positions (least squares on the triangle's vertices)
    mw = np.array(obj.matrix_world)
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
    A = co[tv[t]]                         # (n, 3, 3) triangle corners
    p = tm.pos[ok].astype(np.float64)
    v0, v1 = A[:, 1] - A[:, 0], A[:, 2] - A[:, 0]
    v2 = p - A[:, 0]
    d00, d01, d11 = (v0 * v0).sum(1), (v0 * v1).sum(1), (v1 * v1).sum(1)
    d20, d21 = (v2 * v0).sum(1), (v2 * v1).sum(1)
    den = np.maximum(d00 * d11 - d01 * d01, 1e-18)
    b1 = (d11 * d20 - d01 * d21) / den
    b2 = (d00 * d21 - d01 * d20) / den
    b0 = 1 - b1 - b2
    V = vals[tv[t]]
    out[ok] = b0 * V[:, 0] + b1 * V[:, 1] + b2 * V[:, 2]
    return out


def dilate(arr, valid, px=8):
    """Bleed painted texels `px` pixels into the empty UV margin (Kaspar: bleed 8 px),
    so mip-mapping and filtering never pull background colour across seams."""
    a = arr.copy()
    v = valid.copy()
    for _ in range(px):
        acc = np.zeros_like(a)
        cnt = np.zeros(v.shape, dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            sv = np.roll(np.roll(v, dy, 0), dx, 1)
            sa = np.roll(np.roll(a, dy, 0), dx, 1)
            acc += sa * sv[..., None] if a.ndim == 3 else sa * sv
            cnt += sv
        grow = (~v) & (cnt > 0)
        if not grow.any():
            break
        if a.ndim == 3:
            a[grow] = acc[grow] / cnt[grow][:, None]
        else:
            a[grow] = acc[grow] / cnt[grow]
        v = v | grow
    return a


def gaussian_blur(gray, sigma, wrap=True):
    """FFT gaussian blur of a 2D array (periodic: correct for tileable textures)."""
    h, w = gray.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi ** 2) * (sigma ** 2) * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(gray) * g))


def high_pass(gray, sigma):
    """Kaspar's photo-texture pattern extraction (blur + Grain Extract): original minus
    blurred plus 0.5. Keeps the weave/structure, drops baked grunge and lighting.
    Pick sigma ~ 2 to 4 x the pattern period in pixels. Save the result as Non-Color."""
    return np.clip(gray - gaussian_blur(gray, sigma) + 0.5, 0, 1)


def gui_redraw():
    """Force one synchronous window redraw (live GUI session only). Texture-paint
    projection uses the depth buffer of the LAST viewport draw for occlusion: strokes
    issued in the same call that created the object / changed the view or mode depend on
    what that draw showed (verified: 163 px vs 21161 px for the same stroke without and
    with a redraw; another run without redraw painted fully)."""
    if not bpy.app.background:
        bpy.ops.wm.redraw_timer(type="DRAW_WIN_SWAP", iterations=1)


def gui_texture_stroke(world_points, size=40, strength=1.0, color=None, brush=None, spacing=0.25,
                       mode="TEXTURE_PAINT", redraw=True):
    """A texture/vertex-paint stroke with real brushes through bx_gui, made reliable:
    forces a redraw first, and resamples the polyline so dabs are at most
    `spacing * size` screen pixels apart (scripted strokes paint ONE dab per point, the
    brush's own spacing is not applied: 16 points over 740 px gave separate dots).
    Object must already be in `mode`; call bx_gui.set_view() before. Returns
    (operator result, missed points)."""
    import bx_gui as G
    from bpy_extras import view3d_utils
    if redraw:
        gui_redraw()
    if brush:
        G.activate_brush(mode, brush)
    if color is not None:
        G.set_paint_color(mode, color)
    _, _, region, rv3d = G.view3d()
    pts = [Vector(p) for p in world_points]
    dense = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        pa = view3d_utils.location_3d_to_region_2d(region, rv3d, a)
        pb = view3d_utils.location_3d_to_region_2d(region, rv3d, b)
        px = (pb - pa).length if (pa is not None and pb is not None) else size
        k = max(1, int(math.ceil(px / max(1.0, spacing * size))))
        dense += [a.lerp(b, i / k) for i in range(1, k + 1)]
    return G.stroke(mode, [tuple(p) for p in dense], size=size, strength=strength)


# --------------------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------------------

_DATA_SOCKETS = {"Metallic", "Roughness", "IOR", "Alpha", "Normal", "Subsurface Weight", "Subsurface Scale",
                 "Specular IOR Level", "Anisotropic", "Anisotropic Rotation", "Transmission Weight",
                 "Coat Weight", "Coat Roughness", "Sheen Weight", "Sheen Roughness", "Emission Strength",
                 "Height", "Displacement", "Strength", "Distance", "Fac", "Factor", "Value"}
_COLOR_SOCKETS = {"Base Color", "Emission Color", "Sheen Tint", "Coat Tint", "Specular Tint", "Subsurface Radius"}


def _consumers(nt, sock, seen=None, depth=0):
    """Final Principled/Bump/NormalMap/Displacement sockets a socket ends up feeding
    (walks through reroutes, math, mix, ramps, separate)."""
    seen = seen if seen is not None else set()
    res = []
    for l in sock.links:
        n, s = l.to_node, l.to_socket
        key = (n.name, s.identifier)
        if key in seen or depth > 12:
            continue
        seen.add(key)
        if n.bl_idname == "ShaderNodeBsdfPrincipled":
            res.append(("principled", s.name))
        elif n.bl_idname == "ShaderNodeNormalMap":
            res.append(("normal_map", s.name))
        elif n.bl_idname == "ShaderNodeBump":
            res.append(("bump", s.name))
        elif n.bl_idname == "ShaderNodeDisplacement":
            res.append(("displacement", s.name))
        elif n.bl_idname in ("ShaderNodeOutputMaterial", "ShaderNodeOutputAOV"):
            res.append(("output", s.name))
        elif n.bl_idname == "ShaderNodeEmission" or n.bl_idname.startswith("ShaderNodeBsdf"):
            res.append((n.bl_idname, s.name))
        else:
            for o in n.outputs:
                res += _consumers(nt, o, seen, depth + 1)
    return res


def audit_material(mat, obj=None):
    """Static checks an expert does by eye. Returns a list of (severity, message).
    severity: 'error' (wrong result), 'warn' (likely wrong), 'info'."""
    mat = get_material(mat)
    nt = mat.node_tree
    issues = []
    p = principled(mat)
    for n in nt.nodes:
        if n.bl_idname == "ShaderNodeTexImage":
            img = n.image
            if img is None:
                issues.append(("error", f"image node '{n.label or n.name}' has no image"))
                continue
            if img.source == "FILE" and not img.packed_file and not os.path.exists(bpy.path.abspath(img.filepath)):
                issues.append(("error", f"image '{img.name}' file missing: {img.filepath}"))
            cons = _consumers(nt, n.outputs["Color"])
            color_use = any(c[0] == "principled" and c[1] in _COLOR_SOCKETS for c in cons)
            data_use = any((c[0] == "principled" and c[1] not in _COLOR_SOCKETS) or c[0] in ("normal_map", "bump", "displacement") for c in cons)
            cs = img.colorspace_settings.name
            role = classify_texture(img.filepath or img.name) or classify_texture((img.name or "") + ".png")
            if role is not None:                      # file name says what it is (AO multiplied into colour is still data)
                color_use, data_use = role in COLOR_ROLES, role not in COLOR_ROLES
            if ("principled", "Normal") in cons:
                issues.append(("error", f"image '{img.name}' plugged straight into Normal: add a Normal Map node (tangent) or a Bump node (height)"))
            if data_use and not color_use and cs != "Non-Color":
                issues.append(("error", f"image '{img.name}' feeds data ({sorted(set(c[1] for c in cons))}) but colour space is {cs}: set Non-Color"))
            if color_use and not data_use and cs == "Non-Color":
                issues.append(("error", f"image '{img.name}' feeds colour but is Non-Color: set sRGB"))
            if not n.inputs["Vector"].is_linked and n.projection != "BOX":
                issues.append(("warn", f"image node '{img.name}' has no explicit UV Map/vector input (uses the active render UV; Kaspar: set it)"))
            if img.is_dirty:
                issues.append(("error", f"image '{img.name}' has unsaved changes: save or pack it"))
        elif n.bl_idname == "ShaderNodeUVMap" and obj is not None and n.uv_map and n.uv_map not in obj.data.uv_layers:
            issues.append(("error", f"UV Map node points to missing UV map '{n.uv_map}'"))
        elif n.bl_idname == "ShaderNodeBump":
            d = n.inputs["Distance"].default_value
            s = n.inputs["Strength"].default_value
            if d > 0.05:
                issues.append(("warn", f"Bump Distance {d:.3f} m is large (stepped, plastic bump; Kaspar lowers Distance, not only Strength)"))
            if s > 1.0:
                issues.append(("warn", f"Bump Strength {s:.2f} > 1"))
        elif n.bl_idname == "ShaderNodeAddShader":
            issues.append(("warn", "Add Shader is not energy conserving (Kaspar: use Mix Shader)"))
        elif n.bl_idname == "ShaderNodeVectorMath" and n.operation == "ADD":
            if any(c[1] == "Normal" for c in _consumers(nt, n.outputs["Vector"])):
                issues.append(("error", "normals summed with Vector Math Add without Normalize (wrong in Cycles; chain Bump nodes instead)"))
        elif n.bl_idname == "ShaderNodeNormalMap":
            if n.inputs["Color"].is_linked:
                src = n.inputs["Color"].links[0].from_node
                if src.bl_idname == "ShaderNodeTexImage" and src.image and src.image.colorspace_settings.name != "Non-Color":
                    pass  # reported above as data image
    out = output_node(mat)
    disp_on = out.inputs["Displacement"].is_linked and mat.displacement_method in ("DISPLACEMENT", "BOTH")
    if disp_on:
        nmaps = [n for n in nt.nodes if n.bl_idname == "ShaderNodeNormalMap"]
        if any(any(c[1] == "Normal" for c in _consumers(nt, n.outputs["Normal"])) for n in nmaps):
            issues.append(("error", "normal map AND true displacement: they encode the same relief (Price: use one or the other)"))
    for n in nt.nodes:
        if n.bl_idname == "ShaderNodeTexNoise" and not n.inputs["Detail"].is_linked and n.inputs["Detail"].default_value > 6:
            issues.append(("info", f"Noise '{n.label or n.name}' Detail {n.inputs['Detail'].default_value:.0f} > 6: cost roughly doubles per level (Price)"))
        if disp_on and n.bl_idname == "ShaderNodeTexImage" and n.interpolation != "Cubic" and any(
                c[0] == "displacement" for c in _consumers(nt, n.outputs["Color"])):
            issues.append(("warn", f"displacement image '{n.image.name if n.image else n.name}' not Cubic (stepping; Price)"))
    if p is None:
        issues.append(("info", "no Principled BSDF on the active output: value checks skipped"))
        return issues
    m_src, m_val = _upstream(p.inputs["Metallic"])
    if m_src is None and 0.05 < m_val < 0.95:
        issues.append(("warn", f"constant Metallic {m_val:.2f}: real surfaces are 0 or 1 (mix only in transitions/dirt)"))
    r_src, r_val = _upstream(p.inputs["Roughness"])
    if r_src is None:
        issues.append(("info", f"constant Roughness {r_val:.2f}: roughness variation is what sells a surface"))
    bc_src, bc_val = _upstream(p.inputs["Base Color"])
    if bc_src is None:
        s = linear_to_srgb(np.asarray(bc_val[:3])) * 255
        metal = m_src is None and m_val >= 0.5
        if metal and s.max() < 180:
            issues.append(("warn", f"metal base colour sRGB max {s.max():.0f} < 180 (metals reflect 70-100%)"))
        if not metal and (s.max() > 243 or s.max() < 30):
            issues.append(("warn", f"dielectric base colour sRGB {tuple(int(x) for x in s)} outside ~30-240"))
    e_src, e_col = _upstream(p.inputs["Emission Color"])
    es_src, es_val = _upstream(p.inputs["Emission Strength"])
    if e_src is not None and es_src is None and es_val == 0.0:
        issues.append(("error", "Emission Color is linked but Emission Strength is 0 (5.x default)"))
    if p.inputs["Subsurface Weight"].is_linked or p.inputs["Subsurface Weight"].default_value > 0:
        sc_src, sc_val = _upstream(p.inputs["Subsurface Scale"])
        if sc_src is None and obj is not None:
            size = max(obj.dimensions) if obj.dimensions.length > 0 else 1.0
            if sc_val > 0.5 * size:
                issues.append(("warn", f"Subsurface Scale {sc_val} is large for an object {size:.2f} m tall (waxy)"))
    if mat.surface_render_method == "BLENDED" and not p.inputs["Alpha"].is_linked and p.inputs["Alpha"].default_value >= 1:
        issues.append(("info", "render method Blended without alpha: use Dithered (sorting problems)"))
    return issues


# ---- rendering helpers ---------------------------------------------------------------


def _temp_scene(name, objs, res, engine="CYCLES", samples=16, transparent=False, view="Standard"):
    sc = bpy.data.scenes.new(name)
    for o in objs:
        sc.collection.objects.link(o)
    r = sc.render
    r.engine = engine
    r.resolution_x = r.resolution_y = res
    r.resolution_percentage = 100
    r.film_transparent = transparent
    r.image_settings.media_type = "IMAGE"
    sc.view_settings.view_transform = view
    sc.cycles.samples = samples
    sc.cycles.use_denoising = samples >= 32
    sc.eevee.taa_render_samples = max(samples, 16)
    sc.eevee.use_raytracing = True
    if bpy.app.background:
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = "METAL" if sys.platform == "darwin" else "CUDA"
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type != "CPU"]
            for d in prefs.devices:
                d.use = d.type != "CPU"
            if gpus:
                sc.cycles.device = "GPU"
        except Exception:
            pass
    cam = bpy.data.objects.new(name + "_cam", bpy.data.cameras.new(name + "_cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    world = bpy.data.worlds.new(name + "_world")
    sc.world = world
    return sc, cam, world


def _drop_scene(sc, extra=()):
    for o in list(sc.collection.objects):
        if o.name.startswith(sc.name) or o in extra:
            data = o.data
            bpy.data.objects.remove(o)
            if data is not None and data.users == 0:
                for coll in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
                    if data.name in coll and coll[data.name] == data:
                        coll.remove(data)
                        break
    w = sc.world
    bpy.data.scenes.remove(sc)
    if w is not None and w.users == 0:
        bpy.data.worlds.remove(w)


def _frame(cam, objs, view, margin=1.15):
    import bx_review as R
    pts = R._sample_points(objs)
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    center = (lo + hi) / 2
    d = R.VIEW_DIRS[view]
    cam.data.type, cam.data.lens = "PERSP", 50
    fov = 2 * math.atan(cam.data.sensor_width / (2 * cam.data.lens))
    dist = R._persp_distance(pts, center, d, math.tan(fov / 2) / margin)
    cam.data.clip_start, cam.data.clip_end = dist * 0.01, dist * 10
    R._look_at(cam, center, d, dist)
    return center, dist


def _render(sc, path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=sc.name)
    return path


def _load_exr(path):
    img = bpy.data.images.load(path, check_existing=False)
    try:
        return pixels(img).copy()
    finally:
        bpy.data.images.remove(img)


def _materials(objs):
    mats = []
    for o in objs:
        for s in getattr(o, "material_slots", []):
            if s.material and s.material not in mats:
                mats.append(s.material)
    return mats


def _swap_to_emission(mat, channel):
    """Route one Principled channel through an Emission shader (Node Wrangler preview).
    Returns an undo record."""
    nt = mat.node_tree
    out = output_node(mat)
    p = principled(mat)
    prev = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].is_linked else None
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 1.0
    if p is not None:
        src, dv = _upstream(p.inputs[channel])
        if src is not None:
            nt.links.new(src, em.inputs["Color"])
        else:
            em.inputs["Color"].default_value = tuple(dv) if hasattr(dv, "__len__") else (dv, dv, dv, 1.0)
    else:
        em.inputs["Color"].default_value = (1, 0, 1, 1)
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return (mat, em, prev)


def _restore(rec):
    mat, em, prev = rec
    nt = mat.node_tree
    nt.nodes.remove(em)
    if prev is not None:
        nt.links.new(prev, output_node(mat).inputs["Surface"])


def render_channels(objs, channels=("Base Color", "Roughness", "Metallic"), res=256,
                    views=("front", "threequarter"), engine="CYCLES", samples=8, out_dir=None):
    """Render each Principled channel as emission (linear EXR) from `views`.
    Returns {channel: (n_views, res, res, 4) array}; alpha marks object pixels.
    Materials are restored afterwards."""
    out_dir = out_dir or bpy.app.tempdir
    os.makedirs(out_dir, exist_ok=True)
    sc, cam, world = _temp_scene("BX_Channels", objs, res, engine, samples, transparent=True)
    world.color = (0, 0, 0)
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_depth = "32"
    sc.render.filter_size = 0.01 if engine == "CYCLES" else sc.render.filter_size
    result = {}
    try:
        for ch in channels:
            recs = [_swap_to_emission(m, ch) for m in _materials(objs)]
            try:
                arrs = []
                for v in views:
                    _frame(cam, objs, v)
                    p = _render(sc, os.path.join(out_dir, f"bx_ch_{ch.replace(' ', '_')}_{v}.exr"))
                    arrs.append(_load_exr(p))
                result[ch] = np.stack(arrs)
            finally:
                for r in recs:
                    _restore(r)
    finally:
        _drop_scene(sc)
    return result


def value_report(objs, res=256, views=("front", "threequarter"), engine="CYCLES", out_dir=None):
    """Render-based PBR value check over the VISIBLE surface (procedural and painted alike).
    Returns a dict with albedo sRGB stats split dielectric/metal, roughness stats, metallic
    binariness, and 'problems' (list of strings). Reference ranges [added, Substance PBR
    guide]: dielectric albedo sRGB ~30..240, metal reflectance sRGB ~180..255, metallic
    0 or 1 except transitions."""
    ch = render_channels(objs, ("Base Color", "Roughness", "Metallic"), res, views, engine, out_dir=out_dir)
    bc, rg, mt = ch["Base Color"], ch["Roughness"], ch["Metallic"]
    inside = bc[..., 3] > 0.99
    n = int(inside.sum())
    rep = {"pixels": n, "problems": []}
    if n == 0:
        rep["problems"].append("object not visible in the channel renders")
        return rep
    alb_lin = bc[..., :3][inside]
    alb = linear_to_srgb(alb_lin) * 255
    met = mt[..., 0][inside]
    rough = rg[..., 0][inside]
    val = alb.max(1)
    is_metal = met >= 0.5
    def pct(x, q):
        return [round(float(v), 3) for v in np.percentile(x, q)] if len(x) else None
    rep["albedo_srgb_max_channel"] = {"dielectric_p1_p50_p99": pct(val[~is_metal], [1, 50, 99]),
                                      "metal_p1_p50_p99": pct(val[is_metal], [1, 50, 99])}
    rep["roughness_p1_p50_p99"] = pct(rough, [1, 50, 99])
    rep["roughness_std"] = round(float(rough.std()), 4)
    rep["metal_fraction"] = round(float(is_metal.mean()), 4)
    grey = (met > 0.1) & (met < 0.9)
    rep["metallic_grey_fraction"] = round(float(grey.mean()), 4)
    d = val[~is_metal]
    if len(d):
        lo, hi = float((d < 30).mean()), float((d > 243).mean())
        rep["dielectric_below_30"], rep["dielectric_above_243"] = round(lo, 4), round(hi, 4)
        if lo > 0.02:
            rep["problems"].append(f"{lo:.1%} of dielectric albedo darker than sRGB 30 (charcoal is ~50; baked shadow/AO in albedo?)")
        if hi > 0.02:
            rep["problems"].append(f"{hi:.1%} of dielectric albedo brighter than sRGB 243 (pure white albedo blows out; Kaspar: no 100% white)")
    m = val[is_metal]
    if len(m) and float((m < 180).mean()) > 0.05:
        rep["problems"].append(f"{float((m < 180).mean()):.1%} of metal pixels have reflectance below sRGB 180 (too dark for raw metal)")
    if rep["metallic_grey_fraction"] > 0.05:
        rep["problems"].append(f"{rep['metallic_grey_fraction']:.1%} of pixels have metallic between 0.1 and 0.9 (metallic is a 0/1 mask)")
    if float((rough < 0.05).mean()) > 0.2:
        rep["problems"].append("over 20% of the surface has roughness < 0.05 (mirror-like: intended?)")
    if rep["roughness_std"] < 0.01:
        rep["problems"].append("roughness is uniform (std < 0.01): no breakup, reads CG")
    return rep


# ---- preview ---------------------------------------------------------------------------


def _preview_shapes(prefix):
    """UV sphere + bevelled cube, UV map named 'UVMap', transforms written to matrix_world
    directly (location alone stays stale until a depsgraph update of their scene)."""
    import bmesh
    from mathutils import Matrix
    objs = []
    for kind, loc, rot in (("sphere", (-0.62, 0, 0.5), 0.0), ("cube", (0.62, 0, 0.4), 30.0)):
        me = bpy.data.meshes.new(f"{prefix}_{kind}")
        bm = bmesh.new()
        bm.loops.layers.uv.new("UVMap")          # calc_uvs writes into an EXISTING layer
        if kind == "sphere":
            bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=0.5, calc_uvs=True)
        else:
            bmesh.ops.create_cube(bm, size=0.8, calc_uvs=True)
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.03, segments=3, affect="EDGES", profile=0.5)
        bm.to_mesh(me)
        bm.free()
        me.shade_smooth()
        if kind == "cube":
            me.set_sharp_from_angle(angle=math.radians(40))
        o = bpy.data.objects.new(f"{prefix}_{kind}", me)
        o.matrix_world = Matrix.LocRotScale(Vector(loc), Matrix.Rotation(math.radians(rot), 3, "Z").to_quaternion(), None)
        objs.append(o)
    return objs


def _light(sc, name, kind, energy, loc, target, size=1.0, color=(1, 1, 1)):
    ld = bpy.data.lights.new(sc.name + "_" + name, kind)
    ld.energy = energy
    ld.color = color
    if kind == "AREA":
        ld.size = size
    o = bpy.data.objects.new(sc.name + "_" + name, ld)
    o.location = loc
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(o)
    return o


def _rig(sc, center, size, kind):
    """studio: key/fill/rim on neutral grey. backlit: Kaspar's SSS test, a strong light
    right behind the subject plus one from below. roughness: studio + base colour black."""
    c = Vector(center)
    s = max(size, 1e-3)
    world = sc.world
    world.color = (0.18, 0.18, 0.18)       # neutral mid grey, no gradient (Kaspar)
    bg = world.node_tree.nodes.get("Background") if world.node_tree else None
    if bg is not None:
        bg.inputs["Color"].default_value = (0.18, 0.18, 0.18, 1)
        bg.inputs["Strength"].default_value = 0.35 if kind == "backlit" else 1.0
    e = 60.0 * s * s
    if kind in ("studio", "roughness"):
        _light(sc, "key", "AREA", e * 4, c + Vector((-2.2, -2.6, 2.4)) * s, c, size=1.2 * s)
        _light(sc, "fill", "AREA", e * 1.2, c + Vector((2.8, -1.8, 0.8)) * s, c, size=1.5 * s)
        _light(sc, "rim", "AREA", e * 3, c + Vector((1.2, 2.8, 1.8)) * s, c, size=0.8 * s)
    else:
        _light(sc, "back", "AREA", e * 6, c + Vector((0, 2.4, 0.3)) * s, c, size=0.7 * s)
        _light(sc, "below", "AREA", e * 1.5, c + Vector((0.4, -1.6, -2.0)) * s, c, size=1.0 * s)
        _light(sc, "front", "AREA", e * 0.6, c + Vector((-1.5, -3.0, 1.0)) * s, c, size=2.0 * s)


def preview(target, out_dir, engines=("BLENDER_EEVEE", "CYCLES"), rigs=("studio", "backlit"),
            res=512, view="threequarter", samples=64, view_transform="AgX", tag="preview"):
    """Render a material (on a sphere + bevelled cube) or real objects under each light rig
    in each engine; returns the contact sheet path (rows = rigs, cols = engines).
    rigs: 'studio', 'backlit' (SSS test), 'roughness' (studio with Base Color forced to
    black: Kaspar's way to read roughness and bump alone), 'unlit' (Base Color as
    emission: Grant's check for hand-painted, unlit-game albedo)."""
    import bx_review as R
    os.makedirs(out_dir, exist_ok=True)
    made = []
    if isinstance(target, (bpy.types.Material, str)):
        mat = get_material(target)
        made = _preview_shapes("BXprev")
        for o in made:
            o.data.materials.append(mat)
        objs = made
    else:
        objs = list(target)
    sc, cam, world = _temp_scene("BX_Preview", objs, res, "CYCLES", samples, view=view_transform)
    if made:
        sc.render.resolution_x = int(res * 1.6)              # sphere + cube side by side
    paths, labels = [], []
    try:
        center, dist = _frame(cam, objs, view, margin=1.25 if not made else 0.95)
        size = max(max(o.dimensions) for o in objs)
        for rig in rigs:
            for o in [o for o in sc.collection.objects if o.type == "LIGHT"]:
                bpy.data.objects.remove(o)
            _rig(sc, center, size, "backlit" if rig == "backlit" else "studio")
            recs = []
            if rig == "unlit":                      # Grant: judge hand-painted albedo with no lighting
                recs_unlit = [_swap_to_emission(m, "Base Color") for m in _materials(objs)]
            else:
                recs_unlit = []
            if rig == "roughness":
                for m in _materials(objs):
                    p = principled(m)
                    if p is None:
                        continue
                    prev = p.inputs["Base Color"].links[0].from_socket if p.inputs["Base Color"].is_linked else None
                    if prev is not None:
                        m.node_tree.links.remove(p.inputs["Base Color"].links[0])
                    old = tuple(p.inputs["Base Color"].default_value)
                    sw = p.inputs["Subsurface Weight"].default_value
                    p.inputs["Base Color"].default_value = (0, 0, 0, 1)
                    p.inputs["Subsurface Weight"].default_value = 0.0
                    recs.append((m, p, prev, old, sw))
            try:
                for eng in engines:
                    sc.render.engine = eng
                    fn = os.path.join(out_dir, f"{tag}_{rig}_{eng.lower()}.png")
                    sc.render.image_settings.file_format = "PNG"
                    _render(sc, fn)
                    paths.append(fn)
                    labels.append(f"{rig} / {eng}")
            finally:
                for r in recs_unlit:
                    _restore(r)
                for m, p, prev, old, sw in recs:
                    p.inputs["Base Color"].default_value = old
                    p.inputs["Subsurface Weight"].default_value = sw
                    if prev is not None:
                        m.node_tree.links.new(prev, p.inputs["Base Color"])
        sheet = R._tile(paths, len(rigs), len(engines), os.path.join(out_dir, f"{tag}_sheet.png"), labels)
    finally:
        _drop_scene(sc, extra=made)
    return sheet
