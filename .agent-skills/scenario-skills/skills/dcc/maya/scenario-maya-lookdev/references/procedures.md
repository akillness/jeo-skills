# Procedures (maya.cmds and mx_shade, full code)

**Status of every block below: not yet run in Maya** (Maya 2027 not installed on 2026-09-24). Each
block starts with `# test: <id>`: `tests/code/maya-lookdev/job_procedures_snippets.py` extracts
these exact blocks from this file and runs them in order, in one namespace, in a fresh scene, then
checks their results. Deeper tests of the same functions: `job_texture_set_material.py`,
`job_displacement.py`, `job_presets_and_special.py`, `job_lookdev_scene_render.py`,
`job_lint_planted.py` (all under `tests/code/maya-lookdev/`, run by `run_all.sh` through
scenario-maya-expert's `mx_run.py`). Already verified without Maya: `mx_shade`'s pure-Python layer
(`test_mx_shade_offline.py`, 122 checks) and the Python logic of every block and job against a fake
`maya.cmds` (`test_jobs_fakemaya.py`); neither proves Maya behavior. When a probe result contradicts
a name here, fix `mx_shade`'s tables and this file together.

Context the blocks assume: `TEX` is a folder holding a Painter-style set named `case`
(`case_BaseColor.1001.png`, `case_Roughness.1001.png`, `case_Metalness.1001.png`,
`case_Normal.1001.png`, `case_Height.1001.png`, same for 1002), `OUT` an output folder, `HDRI` a
lat-long `.hdr`. Run inside mayapy through `mx_run.py --plugins mtoa`, or through the GUI bridge.

## P0. Session: Arnold, color spaces, names

Why: color-space names changed in 2026.2 and differ between configs; hardcoding "sRGB" or "Utility -
Raw" breaks (version deltas 2.7). Query once, use the names.

```python
# test: P0_session
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P0_session), deeper: job_00_probe_lookdev.py
import maya.cmds as cmds
import mx_shade as sh

mtoa_version = sh.ensure_arnold()          # loads mtoa, creates the Arnold option nodes
cm = sh.cm_info()                          # rendering space, view, config path, input space names
SRGB = sh.space_name("srgb")               # e.g. "sRGB Encoded Rec.709 (sRGB)" in 2026.2+
LINEAR = sh.space_name("linear_srgb")      # "scene-linear Rec.709-sRGB" (spelled two ways in the help)
RAW = sh.space_name("raw")
print(cmds.about(version=True), mtoa_version, cm["rendering_space"], SRGB, LINEAR, RAW)
```

## P1. A file node by hand: color space after the path, rules ignored, UDIM, grayscale plug

Why: the rules fire when the path is set, so the space goes after it; Ignore Color Space File Rules
keeps Reapply Rules from resetting it (Maya 2027 help). Grayscale maps: outColorR (Raycast
[vPHhVrxxThU 00:19:46]) or outAlpha with Alpha Is Luminance on (Sarkamari [ZtEiVa3MPLg 00:20:17]).

```python
# test: P1_file_node
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P1_file_node), deeper: job_texture_set_material.py
P2D = ("coverage", "translateFrame", "rotateFrame", "mirrorU", "mirrorV", "stagger", "wrapU", "wrapV",
       "repeatUV", "offset", "rotateUV", "noiseUV", "vertexUvOne", "vertexUvTwo", "vertexUvThree",
       "vertexCameraOne")


def file_node(path, name, space, udim=False, gray=False):
    f = cmds.shadingNode("file", asTexture=True, isColorManaged=True, name=name)
    p = cmds.shadingNode("place2dTexture", asUtility=True, name=name + "_P2D")
    for a in P2D:
        cmds.connectAttr(p + "." + a, f + "." + a, force=True)
    cmds.connectAttr(p + ".outUV", f + ".uvCoord", force=True)
    cmds.connectAttr(p + ".outUvFilterSize", f + ".uvFilterSize", force=True)
    if udim:
        cmds.setAttr(f + ".uvTilingMode", 3)                    # 3 = "UDIM (Mari)" [verify]; sh.set_enum matches labels
    cmds.setAttr(f + ".fileTextureName", path, type="string")  # color space rules fire here
    cmds.setAttr(f + ".colorSpace", space, type="string")      # so set the space AFTER the path
    cmds.setAttr(f + ".ignoreColorSpaceFileRules", 1)
    cmds.setAttr(f + ".alphaIsLuminance", 1 if gray else 0)
    return f


manual = cmds.shadingNode("openPBRSurface", asShader=True, name="manual_MTL")
base = file_node(TEX + "/case_BaseColor.1001.png", "manual_base_TEX", SRGB, udim=True)
rough = file_node(TEX + "/case_Roughness.1001.png", "manual_rough_TEX", RAW, udim=True, gray=True)
cmds.connectAttr(base + ".outColor", manual + ".baseColor", force=True)
cmds.connectAttr(rough + ".outColorR", manual + ".specularRoughness", force=True)   # OpenPBR names [verify]
```

## P2. Normal map routes by hand (aiNormalMap, and Raycast's normal plus height)

Why: a tangent-space normal never goes into a plain bump or straight into the shader. aiNormalMap is
the default (Sarkamari [ZtEiVa3MPLg 00:21:10]); to keep normal and height at separate strengths,
feed aiNormalMap into the hidden normalCamera of a bump2d that takes the height (Raycast
[vPHhVrxxThU 00:23:40]). DirectX maps invert Y. Maya 2027.1 adds a MIKKTSpace mode
(`tangentSpaceType` [verify], What's New 2027).

```python
# test: P2_normal_routes
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P2_normal_routes), deeper: job_texture_set_material.py
nrm = file_node(TEX + "/case_Normal.1001.png", "manual_nrm_TEX", RAW, udim=True)
nm = cmds.shadingNode("aiNormalMap", asUtility=True, name="manual_NRM")
cmds.connectAttr(nrm + ".outColor", nm + ".input", force=True)
cmds.setAttr(nm + ".invertY", 0)                              # 1 for a DirectX map
hgt = file_node(TEX + "/case_Height.1001.png", "manual_hgt_TEX", RAW, udim=True, gray=True)
bmp = cmds.shadingNode("bump2d", asUtility=True, name="manual_BMP")
cmds.setAttr(bmp + ".bumpInterp", 0)                          # 0 Bump (1 would be Tangent Space Normals)
cmds.setAttr(bmp + ".bumpDepth", 0.2)                         # starting value [added]; tune on the N AOV
cmds.connectAttr(hgt + ".outColorR", bmp + ".bumpValue", force=True)
cmds.connectAttr(nm + ".outValue", bmp + ".normalCamera", force=True)    # hidden plug: connectAttr does not care
cmds.connectAttr(bmp + ".outNormal", manual + ".normalCamera", force=True)  # OpenPBR normal input [verify]
```

bump2d-only route (J Hill [mpk6IurOWbs 00:24:31]): file `outAlpha` into `bumpValue`, `bumpInterp` 1
(Tangent Space Normals), Arnold `aiFlipG` 1 only for DirectX maps, `outNormal` into the shader
normal; this is `sh.build_material(..., normal_mode="bump2d")`.

## P3. A material from a texture set (mx_shade)

Why: the per-map contract applied the same way every time (Sarkamari's table, J Hill's two
questions, Raycast's outColorR fix), with names that lighting can read.

```python
# test: P3_build_material
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P3_build_material), deeper: job_texture_set_material.py
ts = sh.parse_texture_set(TEX)                  # {"sets": {"case": {channel: info}}, "unmatched": [...]}
print(sorted(ts["sets"]), ts["unmatched"])
case_geo = cmds.polySphere(name="case_geo", radius=2.0)[0]
rep = sh.build_material(ts, "case", meshes=[case_geo], texture_set="case",
                        normal_mode="aiNormalMap", tangent_space="standard", ao="skip")
print(rep["spaces"])                            # base color sRGB, every data map Raw
print(rep["connections"])                       # color plugs <- outColor, floats <- outColorR
print(rep["notes"])
print(sh.verdict(sh.lint_scene())["lines"])
```

Options: `shader_type="aiStandardSurface"` (Painter AiStandard exports, legacy scenes);
`normal_mode="bump2d"` or `"hybrid"`; `tangent_space="mikk"` (2027.1+, A/B on a bevel [verify]);
`ao="multiply"` only to match Painter or a real-time look; `height_mode="displacement"` plus
`displacement={"scale": s, "zero": z}`; `prefer_tx=True` loads sibling .tx files and keeps the color
role of their source.

## P4. Displacement

Why: shader gives the final displacement, padding contains it (Arnold doc); zero value matches the
bake (J Hill [mpk6IurOWbs 00:26:59]); never stack Smooth Mesh Preview on Arnold subdivision; each
iteration is 4x the polygons.

```python
# test: P4_displacement
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P4_displacement), deeper: job_displacement.py
geo = cmds.polyPlane(name="disp_geo", width=10, height=10, subdivisionsX=20, subdivisionsY=20)[0]
shp = cmds.listRelatives(geo, shapes=True, fullPath=True)[0]
dmat, dsg = sh.get_or_create_material("disp", "openPBRSurface")
sh.assign(dsg, [geo])
drep = sh.add_displacement(dsg, TEX + "/case_Height.1001.png", [geo], scale=0.3, iterations=2)
print(drep["zero"], drep["zero_reason"], drep["padding"], drep["shapes"])
# What it wired: file (Raw).outColorR -> displacementShader.displacement -> SG.displacementShader;
# displacementShader.scale 0.3; shape displaySmoothMesh 0, aiSubdivType catclark, aiSubdivIterations 2,
# aiDispZeroValue 0.5 (8-bit map), aiDispPadding = bounds_padding(0.3, 0.5), aiDispAutobump 1.
print(cmds.getAttr(shp + ".aiSubdivIterations"), cmds.getAttr(shp + ".aiDispPadding"))
```

Finals: iterations 3 to 4 (J Hill). Float EXR bakes: `zero=0.0`, and pass `value_range` measured
from the map so the padding is right. Micro detail on top (J Hill): `aiCellNoise` alligator,
amplitude 0.003 to 0.004, added with `aiComposite` (plus) before the displacementShader, masked with
a second `aiComposite` (multiply).

## P5. Presets, metals and color conversion

Why: F0 and F82 come from the Arnold table in linear sRGB; Maya swatches hold rendering-space
numbers, so under ACEScg they are converted (OCIO when importable, else the Rec.709 to AP1 matrix)
[added consequence]. Standard Surface metals use their own table.

```python
# test: P5_presets
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P5_presets), deeper: job_presets_and_special.py
steel, steel_sg = sh.get_or_create_material("steel", "openPBRSurface")
prep = sh.apply_preset(steel, "steel_polished")
print(prep["converted"])                          # {"base_color": {"from", "to", "method"}, ...}
print(sh.rec709_to_acescg(sh.METALS_OPENPBR["steel"][0]))
gold_ss, _ = sh.get_or_create_material("goldSS", "aiStandardSurface")
print(sh.apply_preset(gold_ss, "metal_gold")["notes"])
crystal_geo = cmds.polyCube(name="crystal_geo", width=3.0, height=0.25, depth=3.0)[0]
crystal, crystal_sg = sh.get_or_create_material("crystal", "openPBRSurface")
crep = sh.apply_preset(crystal, "sapphire_crystal", mesh=crystal_geo)
print(crep["transmission_depth"])                 # thinnest bounding-box side: absorption across the thickness
sh.assign(crystal_sg, [crystal_geo])
```

Presets (`sh.PRESETS`, each with its source and its [added] keys): `metal_<name>` for the twelve
table metals, `steel_polished`, `steel_brushed` (needs rotation, UVs, smooth tangents, 1 iteration),
`mirror_chrome_ball`, `grey_ball`, `chart_diffuse`, `glass_clear`, `glass_tinted`,
`sapphire_crystal`, `diamond`, `water`, `skin`, `skin_oil_coat`, `leather`, `rubber`, `stone`. Hair:
`sh.HAIR_PRESETS` with `sh.HAIR_BASE`.

## P6. Skin (J Hill in one shader)

```python
# test: P6_skin
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P6_skin), deeper: job_presets_and_special.py
head = cmds.polySphere(name="head_geo", radius=10.0)[0]
col = sh.file_texture(TEX + "/case_BaseColor.1001.png", "head_col_TEX", "srgb", udim=True)
rgh = sh.file_texture(TEX + "/case_Roughness.1001.png", "head_rgh_TEX", "raw", udim=True, gray=True)
srep = sh.skin("skin", meshes=[head], color_file=col, radius_mm=1.0, oil_mask_from=rgh, oil_range=(0.3, 0.6))
print(srep["set"], srep["notes"])
```

It sets subsurface 1, radius scale (1, 0.35, 0.2) (not color-converted: it is per-channel distance),
radius 1 mm in scene units, IOR 1.4, the color map into subsurface color, and coat weight from the
inverted, crunched roughness with coat roughness 0.1. Judge with a backlit ear, the nose and the
eyelid corners, at higher SSS samples on a crop. Teeth and gums share an `interior_set` string user
data (2027.1; `sss_setname` still read).

## P7. Breakup toolkit (Arvid)

```python
# test: P7_breakup
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P7_breakup), deeper: job_presets_and_special.py
rub, rub_sg = sh.get_or_create_material("rubber", "openPBRSurface")
sh.apply_preset(rub, "rubber")
rb = sh.roughness_breakup(rub, 0.2, 0.4, scale=15.0)                  # aiNoise -> aiRange smoothstep -> roughness
lea, lea_sg = sh.get_or_create_material("leather", "openPBRSurface")
sh.apply_preset(lea, "leather")
coarse = sh.noise_bump(lea, height=0.02, scale=40.0, key=None, name="leather_coarse")
fine = sh.noise_bump(lea, height=0.005, scale=450.0, upstream=coarse["out"], name="leather_fine")
side = cmds.polyCube(name="sideGlass_geo")[0]
mask = sh.user_mask([side], "sideMask", 1, 0)                         # mtoa_constant_sideMask + aiUserDataInt
print(rb, fine["out"], mask)
```

Chained bumps go coarse to fine, each bump's output into the next bump's normal (Arvid [cpMBRIWwghg
00:08:34]). Put the mask reader into an aiMultiply with any pattern to restrict it to tagged
objects. Brushed metal: a rotation map from procedurals into specular rotation (Standard Surface) or
a tangent (OpenPBR `geometry_tangent` [verify]), with the file's mipmap bias about -8.

## P8. Car paint, one layer at a time

```python
# test: P8_car_paint
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P8_car_paint), deeper: job_presets_and_special.py
body = cmds.polySphere(name="body_geo", radius=50.0)[0]
paint = None
if "aiCarPaint" in (cmds.allNodeTypes() or []):
    prep = sh.car_paint("paint", base_color=(0.05, 0.07, 0.30), flake_color=(0.10, 0.14, 0.55), meshes=[body])
    paint = prep["shader"]
    saved = sh.isolate_lobes(paint, keep=("base",))   # render the base alone, then specular + flakes, then coat
    sh.restore_values(paint, saved)
    print(prep["waviness"])                           # 4 noises (3, 25, 80, 200) -> aiLayerFloat -> aiBump2d -> coat normal
```

Flake scale is judged from a close-up camera against a close-up photo (Arvid); check after the
denoiser that flakes survive.

## P9. Standard Hair

```python
# test: P9_hair
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P9_hair), deeper: job_presets_and_special.py
hrep = sh.hair_shader("hair", color="brown")                 # melanin 0.5, roughness 0.2, IOR 1.55, shift 3, diffuse 0
htex = sh.hair_shader("hairTextured", base_color_file=col)    # texture into base color, melanin 0
print(hrep["set"], hrep.get("scattering_mode"), htex["set"])
```

Assign with `targets=[description_shape]` (XGen Interactive Groom assigns `hairPhysicalShader` by
default). Blond: raise `extraDepth` on the shader before touching global depth, then specular or AA
samples (Arnold Standard Hair doc).

## P10. Lookdev scene, turntable and review renders

```python
# test: P10_lookdev
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P10_lookdev), deeper: job_lookdev_scene_render.py
asset = cmds.group(case_geo, name="asset_GRP")
ld = sh.lookdev_scene(["asset_GRP"], hdri=HDRI, frames=8, focal=85.0, out_dir=OUT)
print(ld["camera"], ld["frames"], ld["hdri_info"], ld["refs"].keys())
turn = sh.render_frames([1, 5, 9, 13], OUT + "/turn", width=320, height=180, columns=2, tile=160)
print(turn["frames"], turn["sheet"], turn["seconds"])
```

Frames 1 to N spin the asset, N+1 to 2N the HDRI. `render_frames` restores every render setting it
touched and turns the output transform on only for these PNGs (EXR for comp stays off, Maya 2027
help). Pass `hdri=None` for the procedural studio stand-in [added]; for a Painter transfer use the
HDRI Painter displayed and its focal length.

## P11. Porting a Standard Surface shader to OpenPBR

```python
# test: P11_port
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P11_port), deeper: job_presets_and_special.py
legacy, _ = sh.get_or_create_material("legacy", "aiStandardSurface")
cmds.setAttr(legacy + ".thinFilmThickness", 400.0)
vals = {a: cmds.getAttr(legacy + "." + a) for a in ("thinFilmThickness", "emission", "subsurfaceScale",
                                                    "specularRoughness", "metalness")}
ported, pnotes = sh.port_standard_to_openpbr(vals)
legacy_pbr, _ = sh.get_or_create_material("legacyPBR", "openPBRSurface")
sh.set_values(legacy_pbr, ported, convert=False)
print(ported, pnotes)
```

After the MtoA menu conversion ("Convert All Standard Surface to OpenPBR Surface"), run the lint:
thin film above 1 micrometer, emission off by 1000x and white F82 on metals are the usual leftovers,
and MTOA-2560 leaves shaders inside networks unconverted.

## P12. Lint and handoff

```python
# test: P12_lint_handoff
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P12_lint_handoff), deeper: job_lint_planted.py
issues = sh.lint_scene()
v = sh.verdict(issues)
print(v["pass"], v["errors"], v["warnings"], v["info"])
for line in v["lines"]:
    print(line)
handoff = sh.handoff_report(OUT + "/handoff.json")
```

The rule list and what each one protects is in `critique.md`. `hero=["case_MTL"]` adds the
uniform-roughness check to named hero shaders.

## P13. Turntable keys by hand (the contract behind lookdev_scene)

```python
# test: P13_turntable_by_hand
# status: not yet run in Maya 2027; test: tests/code/maya-lookdev/job_procedures_snippets.py (block P13_turntable_by_hand), deeper: job_lookdev_scene_render.py
N = 24
loc = cmds.spaceLocator(name="tt_LOC")[0]
cmds.setKeyframe(loc, attribute="rotateY", time=1, value=0)
cmds.setKeyframe(loc, attribute="rotateY", time=N + 1, value=360)   # one frame past the range: no duplicate frame
cmds.keyTangent(loc, attribute="rotateY", inTangentType="linear", outTangentType="linear")
cmds.playbackOptions(minTime=1, maxTime=N)
```

## Headless renders outside mx_shade

`render_frames` uses `arnoldRender -b` per frame, as scenario-maya-expert's `mx_review` does [verify
flags]. For sequences use `Render -r arnold` or `kick` (scenario-maya-lighting-rendering). Without
an Arnold license the command line watermarks; `ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL=0` keeps it from
aborting (What's New 2025).
