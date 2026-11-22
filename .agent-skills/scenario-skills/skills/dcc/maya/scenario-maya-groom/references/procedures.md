# scenario-maya-groom procedures (full code)

Every procedure below is **not yet run in Maya** (written 2026-09-24; Maya 2027 not installed). Each
names its test under `tests/code/maya-groom/`; `run_all.sh` runs them through
`<skills>/scenario-maya-expert/scripts/mx_run.py`, one mayapy child each. Code that only uses the
pure layer of `mx_groom` ran offline in `test_mx_groom_offline.py` (passed 2026-09-24). Names marked
[verify] are not quoted from a 2027 page; `G.probe()` resolves them.

Common header for every snippet. Every name the snippets use is defined here or in an earlier
procedure (P3 defines `g` and `fill`, P4 `body`, P5 `prim`, `sec`, `tris`); P16 is the whole job as
one script.

```python
import glob, json, os, sys
PROJECT = os.environ["MX_PROJECT"]                            # this repository's root
sys.path.insert(0, os.path.join(PROJECT, "skills", "scenario-maya-groom", "scripts"))   # also finds scenario-maya-expert/scripts
import maya.cmds as cmds
import maya.mel as mel
import mx_groom as G
G.load_plugins()          # mtoa BEFORE xgenToolkit (Arnold hair doc § XGen), then AbcExport/AbcImport
OUT = os.environ["MX_GROOM_OUT"]                              # this groom version's folder: flow sheet, masks, caches, reviews
HEAD, SCALP = "head_GEO", "scalp_GEO"                         # names from the scenario-maya-retopology-uv handoff
REFS = sorted(glob.glob(os.path.join(OUT, "ref", "*.jpg")))   # reference photos the flow sheet and counts come from
BIG_CLUMPS = 60                                               # big clumps counted on the reference (P2); replace with the count
CONVENTION = "magnitude"                                      # Clump Scale reading confirmed by P5b / test_groom_stack.py
BROW_L_FACES = []                                             # faces for a partial binding, e.g. ["head_GEO.f[1203:1219]"]
```

Headless:
`python3 <project>/skills/scenario-maya-expert/scripts/mx_run.py --plugins mtoa,xgen,abc --scene in.ma job.py -- args`
(plug-ins load in the order given). GUI: `mx_bridge.Bridge().run(code)` or
`.call("mx_groom", "review", ...)`.

---

## P0. Probe the install and record the menu recipes by query

**Why:** Interactive Groom nodes compute on the GPU and whether they evaluate in headless `mayapy`
on Apple Silicon is unknown (maya-version-deltas § 4). The 2027 help documents node types and four
MEL commands, but not the commands behind Create Interactive Groom Splines, Export Cache, Add
Modifier > Guide, Make Wires Dynamic or Reference State > Update. Discover, never invent. The menus
already hold the answer: every menu item and button stores the command string it runs, and the GUI
bridge can read it, so no one has to click.

Query logic ran offline on a fake menu bar (`test_mx_groom_offline.py`: lazy menus built, submenu
trails, option boxes, popups, runtime commands, procedure source, button tokens). Tests:
`test_groom_probe.py` (headless), `gui_groom_smoke.py` (GUI query).

```python
rec = G.probe()                               # node types, attribute catalog, commands, xgenm, descriptions
import json; json.dump(rec, open("/abs/out/probe.json", "w"), indent=1, default=str)
rec["candidates"]                             # which NAME_CANDIDATES resolved on which node type
rec.get("menu_matches")                       # GUI only: the menu trail each recipe would come from
```

In the GUI, through the bridge (`mx_bridge.Bridge().run(code)`), once per Maya version:

```python
recs = G.menu_items("groom|cache|xgen")        # walks main menus + open popups; builds lazy menus (postMenuCommand)
[(r["menu"], r["command"], r.get("option_box_command")) for r in recs][:20]
G.menu_recipe("create_splines")                # cmds.menuItem(item, q=True, command=True) -> recipe, plus runtime body,
G.menu_recipe("convert_to_ig")                 #   MEL procedure, its file (whatIs) and the xgm/xgen optionVars
G.menu_recipe("export_cache")                  # finds Generate > Cache > Export Cache: it opens a dialog, so:
src = G.recipe_source("export_cache")          # read the procedure it calls, then write a direct template
# G.save_recipe("export_cache", '<the command the procedure runs> ... "@path@" ... @start@ @end@', note="from recipe_source")
#   with Multiple Transforms and Write Final Width on (XGIG § cache); test it on a cube-sized groom, then verified=True
G.menu_recipe("open_ig_editor", pattern=r"^Interactive Groom Editor")   # its own menu item [verify label]
G.run_recipe("open_ig_editor")                 # the editor's Add Modifier popup now exists
G.menu_recipe("add_guide_modifier")            # the editor's Add Modifier > Guide (builds the Guide's inGuide network)
G.button_recipe("update_reference_state", "linearWire1")   # Attribute Editor button; node name becomes @node@
G.button_recipe("make_wires_dynamic", "linearWire1")
G.recipe_status()                              # recorded vs missing, with the route for each
```

Replay: `G.run_recipe("create_splines", select=["scalp_GEO"])`;
`G.create_description("scalp_GEO", "hair_body")` wraps it and renames. Options of an item run
without its option box come from optionVars; the recipe stores their values (`option_vars`), so set
them with `cmds.optionVar` before replaying if the creation Density, Length or CV Count must change
[verify names from the stored list]. Recipes live in `$MX_GROOM_RECIPES` or
`scripts/mx_groom_recipes.json`; after a recipe passes its test, copy it into this file with the
Maya version.

Fallback only when an item's command is a Python callable (no string to read) or the editor popup
cannot be listed: `G.capture_start(log)`, one click by Emmanuel, `G.capture_stop`, `G.save_recipe`.

---

## P1. Scalp gate (receive from scenario-maya-retopology-uv)

**Why:** "If you are creating hair on a character's head, create a mesh of the scalp region only"
(2027 help § Get started). IG hairs inherit the base's UVs (Schneider [00:25:13]), masks and root
UVs live in them, Epic's root-UV bake reads `map1` (Giovannini [00:34:20]), history must go
(FlippedNormals [00:04:30]).

Test: `test_groom_guides.py`.

```python
r = G.scalp_check("scalp_GEO", for_unreal=True)     # mx_audit.audit + scalp_verdict
r["lines"]                                           # [] when clean; "error: ..." blocks grooming
G.uv_set_map1("scalp_GEO")                           # rename the current UV set to map1 if missing
```

---

## P2. Flow sheet from the reference

**Why:** Fernandez draws the flow as arrows over a photo and copies it onto the groom; flow is set
on the guides first [CEk0IQ6dk3A 00:06:43, 00:10:35]. The agent's equivalent is a flow sheet it
writes after reading the photo, kept as JSON next to the scene so later passes can be compared
against it.

**Status:** pure; ran offline (`test_mx_groom_offline.py`: projection, whorl, part, length regions,
validation).

```python
FLOW = {                                   # scene UI units (cm); head centered at (0, 170, 0), radius 10
    "base": [0.0, -0.6, -1.0],             # combed back and down
    "controls": [
        {"type": "whorl", "center": [0, 178, -5], "radius": 4, "turn": 1, "outward": 0.7},    # crown
        {"type": "part", "a": [3, 179.5, 5], "b": [3, 179, -2], "radius": 1.5},                # side part
        {"type": "direction", "center": [0, 176, 7], "radius": 4, "vector": [0.3, -0.4, 1]},   # fringe forward
    ],
    "length": {"default": 4.0, "regions": [{"center": [0, 176, 7], "radius": 3, "length": 3.0}]},
}
assert G.check_flow_sheet(FLOW) == []
json.dump(FLOW, open("/abs/groom/flow_v001.json", "w"), indent=1)
```

Rules for writing it (Fernandez 01): mark compression lines where streams press (neighbors share the
curve); where two streams oppose, the band between them is straighter; short-fur regions change
direction abruptly and need tighter control radii and more guides; long hair turns slowly. Also
count, on the reference, the big clumps and the small clumps inside a few of them (Fernandez 02
[00:08:24], 03 [00:05:10]): these counts set Clump Points Density (P5). Eyebrow and eyelash flows
follow the same format, one sheet per description; the directions for a given brow come from its
reference, not from a template [added].

---

## P3. Guides from code

**Why:** "Good guides then modifiers" (FlippedNormals [00:08:22]); as few as possible at first
[00:08:54]; add guides only where interpolation facets (Fernandez 01 [00:09:31]); first and last
guide then interpolate, place on one side and mirror on symmetric topology (Hadi [00:05:13],
[00:08:51]).

Test: `test_groom_guides.py` (roots on the scalp, 8 CVs, no CV inside the head, flow error,
symmetric count, rebuild to 20, fill layer at 2/3, Alembic round trip).

```python
g = G.make_guides("scalp_GEO", FLOW, spacing=1.2, cvs=8, collide="head_GEO", seed=1,
                  length_random=(0.8, 1.2))            # balanced around 1 (Fernandez 08)
rep = G.measure_curves(g["group"], surface="head_GEO", flow=FLOW, long_hair=False)
assert rep["penetration_pct"] <= 0.5, rep["penetration_pct"]          # [added] threshold, critique.md
G.gate(rep["verdict"], label="guides")                                 # flow discontinuities, penetration
rep["flow"]["sheet_error_mean"], rep["flow"]["worst_roots"]            # read the worst roots: parts and whorls only
# a region that reads wrong: add a direction control there, or grow extra guides locally
extra = G.make_guides("scalp_GEO", FLOW, count=12, cvs=8, collide="head_GEO", seed=7,
                      mask=lambda p, n, uv: 1.0 if p[2] > 5.0 else 0.0,     # fringe only
                      group="mxGuides_fringe_GRP", prefix="fringeGuide")
G.rebuild_curves(g["curves"], 20)                      # 20 CVs before edits (Giovannini [00:05:20])
fill = G.fill_layer_from_guides(g["curves"])           # body guides cut to 2/3 (Giovannini [00:05:56])
```

Big silhouette changes on many guides: Giovannini uses a lattice with soft select ([00:06:31]);
scripted: `lat = cmds.lattice(g["curves"], divisions=(3, 3, 3), objectCentered=True)`,
`cmds.move(0, 2, 0, lat[1] + ".pt[1][2][1]", relative=True)`, then
`cmds.delete(g["curves"], constructionHistory=True)` to bake it; fix roots after (test:
`test_groom_guides.py`, soft).

---

## P4. Descriptions, and wiring the guides into them

**Why:** one description per hair type with its own density and width (Hadi [00:14:53], [01:54:41],
[02:07:27]; Giovannini body, fringe, fill, breakups [00:03:46]). New grooms are Interactive Groom
(2027 help). Guide curves that never enter the stack leave the flow sheet on the shelf: the wiring
is a stage with its own gate.

**Two routes, not interchangeable (2027 help § modifiers):**

- **Guide modifier** (default for guides): it interpolates the guides onto every hair and carries
  the region maps a clean part needs; its guides can be "generated from existing curves". The curves
  feed its inGuide through a Curve to Spline on top of the inGuide's own stack (Flood puts Curve to
  Spline on a Linear Wire's inGuide the same way [00:09:17]). The Guide modifier does not disable
  the modifiers below it.
- **Curve to Spline on the description itself:** every curve becomes one hair ("the curve density
  cannot be modified") and, on top of the stack, it disables every modifier below. For a handful of
  exact strands or a cache, never for guides.

**Status:** creation, wiring and rerun logic ran offline on the fake DG
(`test_mx_groom_offline.py`); on Maya not yet run. Tests: `test_groom_stack.py` (wiring block),
`gui_groom_smoke.py`.

```python
xf, body = G.create_description("scalp_GEO", "hair_body")          # recipe from P0, renamed; raises unless exactly one new
_, fill_desc = G.create_description("scalp_GEO", "hair_fill")
_, brow_l = G.create_description("head_GEO", "brow_L", select=BROW_L_FACES)   # faces list for a partial binding
G.stack(body)                                                        # base, Scale, Sculpt by default (2027 help)
# before wiring: flow-sheet error of the unguided hair, to prove the wiring moved it
G.export_cache(body, OUT + "/body_unwired.abc")
err0 = G.measure_abc(OUT + "/body_unwired.abc", surface="head_GEO", flow=FLOW, long_hair=False)["flow"]["sheet_error_mean"]
w = G.wire_guides(body, g["curves"])            # Guide just above the bottom Scale; Curve to Spline on its inGuide
G.export_cache(body, OUT + "/body_wired.abc")
err1 = G.measure_abc(OUT + "/body_wired.abc", surface="head_GEO", flow=FLOW, long_hair=False)["flow"]["sheet_error_mean"]
G.export_cache(w["in_guide_base"], OUT + "/guides_only.abc")         # "select the modifier's InGuide_base node" (2027 help)
n_cached = len(G.strands_from_abc(OUT + "/guides_only.abc"))
G.gate(G.wiring_verdict(err0, err1, len(g["curves"]), n_cached), label="guides wired")
w_fill = G.wire_guides(fill_desc, fill["curves"])                  # the fill follows its own cut guides (P3)
```

`wire_guides` uses the `add_guide_modifier` recipe when recorded (the editor's Add Modifier builds
the inGuide network); a Guide made with `createNode` may lack that network, and then it raises and
names the recipe to record. The curve input plug of Curve to Spline is resolved from
`NAME_CANDIDATES["input_curves"]` [verify]; if none resolves, record `add_curve_to_spline` and run
it with the curves selected. Put a Sculpt modifier above the Guide for later edits. For stylized
locks, place the primary clumps on the guides (FlippedNormals [00:27:13]; Hadi's long hair
[00:53:36]) [verify the IG attribute for "clump points from guides"].

**Parts** (2027 help § Clump Map; FlippedNormals [00:23:15]; Hadi [01:24:59]): a region map on the
Guide modifier isolates the hair on each side so it follows only its own guides; the same map as the
clumps' control map (Use Control Map, Control Using = the region map or Custom Map) keeps clumps
from straddling the part. Region maps belong to the Guide modifier, which is one more reason guides
go through it. Alternatives: separate descriptions per side when length, density or shading differ;
Freeze on the part line ("also a good way to create a hair part", 2027 help), scripted as
`mel.eval("xgmSplineSelect -convertToFreeze")` on a selection [verify selection semantics].

Faces rebinding after duplicating a description:
`mel.eval("xgmSplineSelect -replaceBySelectedFaces")` with the faces selected (2027 help § MEL
commands) [verify selection semantics]. Duplicating traps from legacy (Hadi [00:23:56] to
[00:25:56]): patch bindings, then regenerate clump points.

---

## P5. The modifier stack by value

**Why:** bottom to top (2027 help); clumping is the foundation (FlippedNormals [00:27:45]); two
levels, 3 to 5 small per big (Fernandez 03); root-loose profile and every clump different (Fernandez
02); the mask decides triangle or square (Fernandez 05); the level that gets the noise decides what
breaks (Fernandez 07); strays come from holes in the big clump (Fernandez 03); length breakup at the
small-clump level (Fernandez 08); CVs for noise and curls.

**Status:** splice, clone, ramp and lint logic ran offline against a fake DG
(`test_mx_groom_offline.py`); on Maya not yet run. Tests: `test_groom_stack.py`,
`test_groom_clump_levels.py`.

```python
desc = body                                            # description shape from P4 (guides already wired)
base = G.stack(desc)[0]["node"]
G.set_attrs(base, {"cv_count": 20})                    # 20 with noise, 24 to 36 for curls
G.run_recipe("rebuild", node=base)                     # the Rebuild button (P0 button_recipe)
area = G.surface_area(G.mesh_triangles("scalp_GEO"))
d1 = G.clump_density_for(BIG_CLUMPS, area)             # BIG_CLUMPS: counted on the reference in P2
prim, sec = G.build_clumps(desc, {"clump_density": d1, "clump_strength": 1.0, "clump_randomness": 0.5,
                                  "radius_variance": 0.5}, levels=2, ratio=4.0,
                           secondary={"clump_noise": 0.3})   # clump-level noise; Noise Scale on the tip half by default
G.set_ramp(prim, G.find_attr(prim, "clump_scale"), G.profile_ramp("root_loose", CONVENTION))   # CONVENTION from P5b
# stray clumps: holes in the PRIMARY's mask remove the big clump locally (Fernandez 03 [00:04:16])
tris = G.mesh_triangles("scalp_GEO")
holes = G.write_mask_png(OUT + "/sourceimages/primary_holes.png", 512,
                         G.rasterize_uv(tris, 512, texel_value=G.patches(0.05, cells=64, seed=4)))
G.connect_texture(holes, prim, "mask", name="strayClumps")
# single flyaways: strand noise on a few hairs only (Giovannini: 3 on a 5 % share, his scale [00:09:28] [00:11:59])
share = G.write_mask_png(OUT + "/sourceimages/strays5.png", 1024,
                         G.rasterize_uv(tris, 1024, texel_value=G.speckle(0.05, seed=3, size=1024)))
fly = G.insert_modifier(desc, "xgmModifierNoise", "top", values={"noise_magnitude": 3.0})
G.connect_texture(share, fly, "mask", name="flyaways")
# length: balanced random scale above the clumps (Fernandez 08 [00:09:33]); never extend strands
sc = G.insert_modifier(desc, "xgmModifierScale", "top")
G.connect_expression(sc, "scale", "rand(0.8, 1.2)")    # [verify SeExpr form]
col = G.insert_modifier(desc, "xgmModifierCollide", "top")        # add the collider with the GUI button (gui-paths)
G.gate(G.lint([desc])["lines"], label="stack")
```

`clump_randomness` 0.5, `radius_variance` 0.5, `clump_noise` 0.3, the 5 % of holes and `cells=64`
are [added] starting points (the hole share borrows Giovannini's stray share as its order of
magnitude); tune against the reference. `CONVENTION` is "magnitude" or "radius", whichever the
one-clump test in P5b or `test_groom_stack.py` confirms.

**Clump shape: triangle or square** (Fernandez 05 [00:03:16], 07 [00:16:55]). Full mask and full
Clump on both levels converge into triangles. Square clumps are tight small clumps inside a looser
big clump with both masks below 1, plus a little noise: lower the primary's Clump and mask, keep the
secondary's Clump high and lower its mask a little. Read the values off the P5b sweep (the pair
whose side-lit close-up matches the reference's squares), then count triangles and squares in the
close-up against the reference.

**Which level gets the noise** (Fernandez 07 [00:04:10] [00:13:39]; FUND disagreement "Where noise
goes"). Clump level, the secondary Clump's own Noise with a high Noise Correlation and the Noise
Scale ramp near 0 over the root half (`G.TIP_HALF_RAMP`, the default above): it breaks the big
clumps and keeps the small ones and the roots, which gives soft tips with structure. Strand level, a
Noise modifier: it breaks the small clumps too, so it goes on a share of hairs (flyaways, fray) or,
lightly, on short hair and brows (Hadi). Prove which one you built with `G.breakup_report` (P7).
Vary the frequency across the groom; high-frequency fray only on a few hairs (Fernandez 05
[00:07:28] [00:08:15]); `strand_verdict` flags a single frequency and fray on more than 20 % of the
noisy strands.

**Same silhouette, different texture** (Fernandez 07 [00:09:16]). Inner breakup moves hair from
defined to soft without changing the outline. Decide the point on that range in "Establish first"
(stylized locks usually sit at the defined end [added]), then set it with the clump-level noise
amount, not with the silhouette.

**Every clump different** (Fernandez 02 [00:07:52]). One Clump modifier has one Clump Scale ramp for
all its clumps. Variety comes from Radius Variance and Randomness, and for profile variety from two
or three primary Clump modifiers with different `G.CLUMP_PROFILES` ramps, each masked by one part of
`G.partition` [added method, cells about one big clump wide; judge the close-up]:

```python
for k, prof in enumerate(("root_loose", "spike")):
    part = G.write_mask_png("%s/sourceimages/profile_part%d.png" % (OUT, k), 512,
                            G.rasterize_uv(tris, 512, texel_value=G.partition(2, k, cells=16, seed=9)))
    mod = prim if k == 0 else G.clone_modifier(desc, prim)             # clone keeps the clump map (same cells)
    G.set_ramp(mod, G.find_attr(mod, "clump_scale"), G.profile_ramp(prof, CONVENTION))
    G.connect_texture(part, mod, "mask", name="profilePart%d" % k)
```

The onion profile keeps some pull at the root (lint warns): keep it to a few clumps. Before modeling
a large even shape as a clump, decide whether the flow owns it (Fernandez 02 [00:07:19]): then it
belongs on the guides.

**Length breakup** (Fernandez 08). The useful level is the small clumps: the secondary's Cut ("0.1
cuts the hairs by 10 percent", 2027 help; his example is 0.2 on the cut of the clumps [00:15:34]),
for example `G.connect_expression(sec, "clump_cut", "rand(0, 0.2)")` [verify that the expression is
evaluated per clump]. On strands, only the balanced Scale above; extending strands makes hairs of
one clump criss-cross [00:03:18] [00:11:12]. Gate: `length.ratio_to_reference` 0.9 to 1.1 (P7); when
it falls short, lengthen the guides (flow sheet `length`), not the strands.

**Duplicates at different percentages** (Hadi [00:19:53] to [00:20:46]): instead of pushing one
modifier harder, stack a soft one on all hairs and a clone at a higher value on a few
(`G.clone_modifier`, then a `G.speckle` mask on the clone). Brows and lashes: a light Noise on all
plus a stronger one on about a tenth of the hairs [added share].

**Clump artifacts** (2027 help § Work with Clump modifiers): jagged clump edges, raise Map
Subdivision Level on the primary and every level above it together (lint checks they match); clumps
in the wrong places, a new Seed regenerates the clump points:

```python
for m in (prim, sec):
    G.set_attrs(m, {"map_subdivision": G.get_values(m, ["map_subdivision"])["map_subdivision"] + 1})
G.set_attrs(prim, {"clump_seed": 7})
```

Third clump level only for long hair or manes: `levels=3` (Fernandez 03 [00:06:50]). Curls: CV count
24 to 36, Curl above 1, Offset for room, `connect_expression(clump, "curl", "rand(1,-1)")` (2027
help § Create curls and coils). A/B any layer: `G.toggle_modifier(desc, fly, False)`, review, then
`True`.

Clump and Noise order: "the hair clumping may look different depending on whether it comes before or
after a Noise or Sculpting modifier" (2027 help). Render both once (`toggle_modifier` plus
`insert_modifier(..., "below:" + clump)`) and keep the one that matches the reference.

---

## P5b. Two clump-control tests, once per install

**Why:** two expert distinctions depend on how Interactive Groom's knobs really behave, and the
mapping from Fernandez's Houdini demos is [added]. (1) Mask versus tightness: tightness 0 keeps the
clump's shape without converging, mask 0 removes it, and on straight guides the two look the same
[LbqWjd0p-qw 00:05:32] [00:10:00] [00:11:07]. (2) Clump-level versus strand-level noise [QQm4nLGFxFM
00:04:10] [00:13:39]. Run both before trusting a clump recipe, and keep the numbers.

**Status:** the measures (`clump_follow`, `breakup_report`, `breakup_verdict`) ran offline on
synthetic clumps with known answers; the Maya part not yet run. Test: `test_groom_clump_levels.py`.

```python
# (1) one clump on a small plane, NOISE BELOW the Clump so the clump guide is not straight
cmds.file(new=True, force=True)
p1 = cmds.polyPlane(name="mxOneClump", width=4, height=4, subdivisionsX=8, subdivisionsY=8)[0]
_, one = G.create_description(p1, "one_clump")
G.insert_modifier(one, "xgmModifierNoise", "top", values={"noise_magnitude": 0.5})
clump = G.insert_modifier(one, "xgmModifierClump", "top", values={
    "clump_density": G.clump_density_for(1, G.surface_area(G.mesh_triangles(p1))), "clump_strength": 1.0})
sweep = {}
for c in (1.0, 0.5, 0.0):
    for m in (1.0, 0.5, 0.0):
        G.set_attrs(clump, {"clump_strength": c, "mask": m})
        G.export_cache(one, "%s/one_c%.1f_m%.1f.abc" % (OUT, c, m))
        sweep[(c, m)] = G.clump_follow(G.strands_from_abc("%s/one_c%.1f_m%.1f.abc" % (OUT, c, m)))
# Clump low: tip_spread up, shape_coherence kept. mask low: coherence lost. The knob that keeps the coherence is
# Fernandez's tightness in this Maya; record it in the recipes file next to the Clump Scale convention.
assert sweep[(0.0, 1.0)]["tip_spread"] > sweep[(1.0, 1.0)]["tip_spread"], sweep
```

(2) Two levels on a larger plane, three caches: before, with the secondary's Clump Noise (tip half),
and with a Noise modifier on top instead. `G.breakup_report(before, clump_noise)` should keep the
small clumps (`G.breakup_verdict(rep, "big") == []`), and the strand-level report should keep fewer.
The full script is `test_groom_clump_levels.py`.

---

## P6. Masks without painting

**Why:** Hadi paints one density map and reuses it for every description, and paints a width map to
thin the hairline [00:02:45], [00:09:53], [00:22:54]; masks from noise expressions for modifiers
[00:11:58]; Schneider paints clump masks where dirt and wetness clump fur [00:18:49]. Painting is
GUI-only: the agent writes the images.

**Status:** rasterizer, hairline value, speckle, noise ran offline; Maya parts not yet run. Tests:
`test_mx_groom_offline.py`, `test_groom_guides.py`.

```python
m = G.write_hairline_mask("scalp_GEO", "/abs/groom/sourceimages/hairline_density.png", width=1.5, edge=0.25, size=1024)
t = G.write_hairline_mask("scalp_GEO", "/abs/groom/sourceimages/transition_band.png", width=1.0, band=True, size=1024)
base_body = G.stack("hair_body")[0]["node"]
G.connect_texture(m["path"], base_body, "density_mask", name="hairlineDensity")        # [verify attribute]
G.connect_texture(t["path"], G.stack("hair_transition")[0]["node"], "density_mask", name="transitionBand")
# the same file node on every description (Hadi's shared map)
f = G.connect_texture(m["path"], base_body, "density_mask")
cmds.connectAttr(f + ".outAlpha", G.stack("hair_fill")[0]["node"] + "." + G.find_attr(G.stack("hair_fill")[0]["node"], "density_mask"), force=True)
# a 5 % stray selection and a cloudy clump mask, written in the scalp UVs
tris = G.mesh_triangles("scalp_GEO")
G.write_mask_png("/abs/groom/sourceimages/strays5.png", 1024, G.rasterize_uv(tris, 1024, texel_value=G.speckle(0.05, seed=3, size=1024)))
cloud = lambda u, v, p, n: 0.15 + 0.85 * G.value_noise(p, freq=0.4, seed=5)    # never 0: a little clumping everywhere (Schneider [00:22:55])
G.write_mask_png("/abs/groom/sourceimages/clump_mask.png", 512, G.rasterize_uv(tris, 512, texel_value=cloud))
```

Check a mask the way Hadi does: put it on the head's color and render ([00:02:45]).

---

## P7. Measure the groom

**Why:** the agent cannot orbit a viewport of 100,000 hairs; exported strands give numbers for the
expert checks (roots loose, 3 to 5 small per big, tips soft, strays, balanced length). Caching any
state of the stack: select the description (all modifiers), a mid-stack modifier (up to it) or
`InGuide_base` (guides or wires only) (2027 help § Create an interactive groom hair cache).

**Status:** analysis ran offline on synthetic grooms with known answers; the export recipe and
import not yet run. Tests: `test_mx_groom_offline.py`, `test_groom_guides.py` (Alembic round trip),
`test_groom_stack.py` (convention test).

```python
G.export_cache("hair_body", "/abs/cache/body_final.abc")              # recipe, Current Frame, Multiple Transforms + Write Final Width
rep = G.measure_abc("/abs/cache/body_final.abc", surface="head_GEO")
rep["clumps"]["root_pinch"], rep["clumps"]["profile_variety"], rep["strays_pct"], rep["frizz"], rep["verdict"]
# hierarchy and breakup from mid-stack states (same strands, same order [verify])
G.export_cache(prim, "/abs/cache/after_primary.abc")
G.export_cache(sec, "/abs/cache/after_secondary.abc")
G.export_cache(noise, "/abs/cache/after_noise.abc")
A = G.strands_from_abc("/abs/cache/after_primary.abc")
B = G.strands_from_abc("/abs/cache/after_secondary.abc")
N = G.strands_from_abc("/abs/cache/after_noise.abc")
hs = G.hierarchy_from_states(A, B)   # small per big; target 3 to 5 (Fernandez 03); links from root spacing [added]
assert 3.0 <= hs["mean"] <= 5.0, hs
br = G.breakup_report(B, N)          # which level the noise broke (Fernandez 07): small clumps kept, tips moved, roots still
G.gate(G.breakup_verdict(br, "big"), label="clump-level breakup")   # intent "small" for a strand-noise pass on strays
G.gate(rep["verdict"], label="final strands")                       # root pinch, profile variety, strays, frequency, length...
```

Mask versus tightness and the Clump Scale convention are settled once per install in P5b; here,
judge the triangle and square proportion in a side-lit close-up against the reference.

The two-state hierarchy is the reliable one; the single-state `rep["hierarchy"]` groups clumps by
the gaps between their tip centroids and reports `levels_detected` 1 when there is no gap. Quick
numbers without export: `G.spline_count(desc)`, `G.gpu_memory()`; full dump for format discovery:
`G.dump_spline_data(desc, path)` (`xgmExportSplineDataInternal`, 2027 help).

Multiple Transforms: the 2027 help and Flood say on; Epic's page says off. Export once each way and
compare the hierarchies (`G.inspect_abc`) before trusting either for Unreal.

---

## P8. Standard Hair and curve render settings

**Why:** realism from melanin, roughness, IOR; diffuse 0, tints white, indirect 1; texture into Base
Color with Melanin 0; Shift by hair type; light hair needs Extra Depth; ribbon mode; opacity < 1
needs Ai Opaque off and costs (Arnold hair doc). IG assigns `hairPhysicalShader` by default (2027
help).

Test: `test_groom_shader.py`.

```python
r = G.hair_shader("hair_body", preset="brown", hair_type="dark_brown_european", name="hair_body_MTL")
r["report"]                                          # {"set", "missing", "errors"}: missing names = MtoA differs
G.set_attrs(r["shader"], {"roughness": 0.25, "scatteringMode": "adaptive"})   # mixed distances (MtoA 5.6) [verify label]
G.curve_render("hair_body", mode="ribbon", min_pixel_width=0.25)              # MPW value [added]; tune in P10
G.shader_verdict(G.shader_record(G.resolve("hair_body")[1]))                  # lint
# fur with a pattern (Schneider [00:25:13], [00:33:00]): texture into Base Color, Melanin 0
tex = cmds.shadingNode("file", asTexture=True, isColorManaged=True, name="tigerFur_tex")
cmds.setAttr(tex + ".fileTextureName", "/abs/tex/tiger.png", type="string")
fur = G.hair_shader("fur_back", preset="textured", name="fur_MTL")
cmds.connectAttr(tex + ".outColor", fur["shader"] + ".baseColor", force=True)
```

Blond noise: `extraDepth` on the shader first, then specular samples 2 to 5 or AA (Arnold hair doc).
Roughness encodes cleanliness: lower for shiny, higher for dusty (Schneider [00:36:35]). Wet hair:
IOR outside 1.4 to 1.6 (`shader_verdict(..., wet=True)`).

---

## P9. Review renders

**Why:** experts judge hair in close, side-lit renders against the reference; Schneider lights fur
with a key along the groom plus an HDRI dome [00:34:32]; Giovannini toggles the fill layer to see
the scalp [00:12:29]; Fernandez reads silhouette, breakup, fuzzy tips, halo [lRm2sBSOo00 00:15:01].

Tests: `test_groom_review.py` (headless, guide curves as hair), `gui_groom_smoke.py` (an IG
description in the GUI).

```python
rv = G.review(["hair_body", "hair_fill", "hair_strays", "brow_L", "brow_R"], "/abs/review/v003",
              head="head_GEO", scalp="scalp_GEO",
              views=("front", "side", "back", "threequarter", "top"),
              closeups=[("hairline", (0, 172, 9), 3.5, "front"), ("brow_L", (3.5, 166, 9.5), 2, "front"),
                        ("tips_back", (0, 165, -9), 4, "back")],
              resolution=1024, tile=384)
rv["sheet"], rv["metrics"]["coverage"], rv["notes"]
```

Viewport captures (GUI playblasts, `mx_review.playblast`) only after `G.viewport_aa(True)`: judge
hair in an aliased viewport and the density and clumps read wrong (FlippedNormals [00:13:07];
Fernandez 02 [00:04:03]). Open `rv["sheet"]` and every close-up tile with the image reader and judge
with `critique.md`. A/B a layer: toggle a description's visibility (fill on and off) or
`G.toggle_modifier`, render the same views, compare. Denoise is off so noise is judged, not hidden
[added].

---

## P10. Render cost and flicker sweep

**Why:** four knobs: Min Pixel Width, Transparency Depth, Specular samples, AA; higher AA needs less
MPW; MPW only in ribbon mode; transparency depth 0 disables the MPW transparency (the doc is
ambiguous: test it) (Arnold hair doc § Optimization).

Test: `test_groom_review.py` (AA variants).

```python
shape = G.resolve("hair_body")[1]
mpw = shape + "." + (G.find_attr(shape, "ai_min_pixel_width") or "aiMinPixelWidth")
V = [{"label": "aa3_mpw0",    "plugs": {"defaultArnoldRenderOptions.AASamples": 3, mpw: 0.0}},
     {"label": "aa3_mpw025",  "plugs": {"defaultArnoldRenderOptions.AASamples": 3, mpw: 0.25}},
     {"label": "aa6_mpw0",    "plugs": {"defaultArnoldRenderOptions.AASamples": 6, mpw: 0.0}},
     {"label": "aa3_spec4",   "plugs": {"defaultArnoldRenderOptions.AASamples": 3,
                                        "defaultArnoldRenderOptions.GISpecularSamples": 4}}]
sw = G.cost_sweep("hair_body", "/abs/review/sweep", V, head="head_GEO", focus=((0, 172, 9), 4), frames=(1, 2, 3))
sorted(sw["table"], key=lambda r: r["seconds_mean"])       # cheapest variant whose frames pass flicker and noise review
```

Transparency Depth and opacity are the other two cost levers (Arnold hair doc § Transparency Depth,
§ Opacity): depth 0 disables the MPW transparency (the page contradicts itself on whether MPW itself
stays on: test it), a higher depth is smoother and slower; opacity below 1 costs "significantly" and
needs Ai Opaque off on the description. Add them to the same sweep:

```python
td = "defaultArnoldRenderOptions.autoTransparencyDepth"                 # [verify name on MtoA 5.6]
V += [{"label": "aa3_mpw025_td0", "plugs": {"defaultArnoldRenderOptions.AASamples": 3, mpw: 0.25, td: 0}},
      {"label": "aa3_mpw025_td4", "plugs": {"defaultArnoldRenderOptions.AASamples": 3, mpw: 0.25, td: 4}}]   # depth 4: the doc's MPW example
```

Keep the shader opaque unless the look needs soft strands; if it does,
`G.curve_render(desc, "ribbon", opaque=False)` and time it in the sweep before committing.

---

## P11. Motion: wires, dynamics, caches

**Why:** Flood: wires from the Linear Wire's inGuide, Multiple Transforms and Write Final Width on,
prefixed names, wrap to a skinned proxy that encloses the groom (keys) or nHair output curves
(sims), Curve to Spline with Align to Normals off and source Cache, Reference State Update at the
rest pose on frame 1, magnitude ramp 0 at the root when the scalp moves the roots, separate wire and
geometry caches with namespaces stripped [7IS_tnkO_oU 00:02:34 to 00:18:41]. 2027 help: Linear
Wire > Make Wires Dynamic builds hairSystem, nucleus, nRigid, follicles, output curves and
`xgmCurveToSpline_dynamic` in the groom file.

Test: `test_groom_motion.py` (prefix, wrap, shot export, nucleus scale, nHair from curves).

```python
# groom file: wires (Linear Wire "Create" is a recipe), then export only the wires
wire = G.insert_modifier("hair_body", "xgmModifierLinearWire", "top")
G.run_recipe("create_wires", select=[wire], node=wire)
# export from the modifier's InGuide_base node, not the description (which writes every hair)
net = G.guide_inputs(wire)                                        # {"in_guide", "base"}: the wires' own stack [verify names]
G.export_cache(net["base"], "/abs/cache/mary_wires_rest.abc")    # InGuide_base = wires only (2027 help § cache)
# empty scene: import, prefix, FBX for the rig (Flood's convention)
cmds.AbcImport("/abs/cache/mary_wires_rest.abc", mode="import")
G.prefix_hierarchy("|SplineGrp0", "mary_")                       # root name from the import [verify]
# rig file: wires follow a skinned proxy that encloses the whole groom
cmds.select(wire_curves + ["hairProxy_GEO"], replace=True)       # curves first, proxy last
cmds.CreateWrap()                                                # Deform > Wrap runtime command [verify batch]
# shot file: animated wires out, geometry separately
G.export_abc(["|mary_rig|hairWires"], "/abs/cache/shot010_mary_wires_v001.abc", 1, 115, strip_namespaces=True, world_space=True)
G.export_abc(["|mary_rig|geo"], "/abs/cache/shot010_mary_geo_v001.abc", 1, 115, strip_namespaces=True, world_space=True, uv_write=True)
```

Groom file, receiving the cache: Curve to Spline on top of the inGuide's stack, Align to Normals
off, source Cache [verify attribute], load the cache; then the reference state at the rest pose on
frame 1:

```python
c2s = G.insert_modifier(G.guide_inputs(wire)["in_guide"], "xgmCurveToSpline", "top")
G.set_attrs(c2s, {"align_to_normals": False})
cmds.currentTime(1)
assert cmds.currentTime(q=True) == 1
G.run_recipe("update_reference_state", node=wire)                # button_recipe from P0
```

Magnitude ramp: 1 along the length when the wires carry everything, 0 at the root when the head
moves the roots (Flood [00:11:59]).

nHair from curves in the rig (Flood's dynamics variant), and the centimeter fix:

```python
cmds.select(wire_curves + ["scalp_GEO"], replace=True)
mel.eval('makeCurvesDynamic 2 { "1", "0", "1", "1", "0" }')     # argument order [verify]
for n in cmds.ls(type="nucleus"):
    cmds.setAttr(n + ".spaceScale", 0.01)                        # Nucleus assumes 1 unit = 1 m (maya-version-deltas 2.8)
out = cmds.ls("hairSystem*OutputCurves", long=True)              # export these like the keyed wires
```

In-groom dynamics (2027 help): Linear Wire > Input Wire > Make Wires Dynamic (recipe), play, rewind,
Reference State > Update, play, then Description > Cache > Create New Cache; hairSystem Self Collide
on; nCache for playback speed.

---

## P12. Unreal groom export

**Why:** Epic's Alembic for Grooms: `groom_guide` (only tagged curves simulate; otherwise 10 %
auto), `groom_group_id` (materials and sim per group), `groom_root_uv` (binding and textures),
widths converted from Maya (fallback 1 cm), unique names. Giovannini: real guides without the fill,
UV set `map1`, bake in a throwaway scene and save as new, one export with all three attributes,
Outliner closed.

Test: `test_groom_unreal.py`.

```python
# throwaway scene with the growth cap, the guide curves (no fill) and the exported strands
G.export_cache("hair_body", "/abs/ue/body_strands.abc")          # Current Frame, Write Final Width
cmds.file(new=True, force=True)
cmds.file("/abs/groom/growth_cap.ma", i=True)                     # the cap only
cmds.AbcImport("/abs/ue/body_strands.abc", mode="import")
cmds.refresh(suspend=True)                                        # keep the UI out of it [added]
try:
    G.tag_group_id("|hair_body|SplineGrp0", 0)                    # one id per material or sim group
    G.tag_guides(body_guide_curves)                               # -> |guides with groom_guide, riCurves, scope
    G.uv_set_map1("growthCap_GEO")
    G.bake_root_uv("|hair_body|SplineGrp0", "growthCap_GEO")      # vectorArray, scope uni, type vector2
finally:
    cmds.refresh(suspend=False)
cmds.file(rename="/abs/ue/hair_body_ue5_bake.ma"); cmds.file(save=True, type="mayaAscii")   # new file: tags cannot be redone
out = G.export_abc(["|guides", "|hair_body|SplineGrp0"], "/abs/ue/hair_body_ue5.abc",
                   attrs=("groom_group_id", "groom_guide", "groom_root_uv"))
info = G.inspect_abc(out["path"]); G.unreal_verdict(info)          # run in a fresh mayapy (mx_run)
```

Hand to the Unreal agent (scenario-maya-pipeline-scripting): use imported guides; Y-up import
conversion as Giovannini hedges it ([00:40:46], "I believe"); binding source = the head groomed in
Maya, target of the same topology, right mesh section; physics start values Sub Steps 40, Iteration
Count 10, Collision Radius about 3.5, Stretch Stiffness 1, Bend Scale tip about 0.1, keep Bend
Damping (UE 5.3 era names); MetaHuman hair material covers most needs. Cards and LODs are
Unreal-side work in his series ([00:01:59]).

---

## P13. Game cards preparation (convert to geometry)

**Why:** 2027 help § Prepare a groom for conversion: widen hairs to card width, Face Camera off
(description Primitive Attributes; guides on `inGuide`, wires on `transform_fromCurve`), Twist brush
with Align to Surface, then convert to polygons so cards cover the mesh from all angles. MtoA does
not render XGen Card primitives.

Test: `test_groom_stack.py` (Face Camera attribute when a description exists).

```python
shape = G.resolve("hair_cards")[1]
G.set_attrs(shape, {"face_camera": False})     # [verify attribute]
# width to card width: description width attribute [verify]; the Twist brush is GUI-only (gui-paths)
```

---

## P14. Legacy XGen (inherited assets only)

**Why:** legacy descriptions do not work with IG tools; keep legacy only for an existing asset or
non-spline primitives [added]. FlippedNormals' survival rules: set the project, UVs, save before
starting, never update Maya mid-project, save texture then Ptex, export patches before batch render
[rfxt0ubgLXc 00:02:08 to 00:35:20]. Giovannini converts one description at a time, then Rebuild each
[00:13:46], [00:15:26].

Test: `test_groom_legacy.py` (needs `MX_GROOM_LEGACY_FIXTURE`).

```python
import xgenm as xg                                   # importability on macOS 2027 [verify]
pal = xg.palettes()                                  # collections
descs = {p: xg.descriptions(p) for p in pal}
mods = {(p, d): xg.fxModules(p, d) for p in pal for d in descs[p]}      # [verify signatures]
cmds.workspace(q=True, rootDirectory=True), cmds.file(q=True, sceneName=True)   # project set, scene saved
```

Conversion per description is the `convert_to_ig` recipe (Generate > Convert to Interactive Groom),
followed by the `rebuild` recipe on each converted description; check spline counts before and
after.

---

## P15. Before any handoff

**Status:** lint and gate logic ran offline; Maya parts not yet run. Tests: all of the above.

```python
r = G.lint(roles={"hair_fill": "fill", "hair_strays": "stray", "brow_L": "brow"}, budget=BRIEF["budget"], style=BRIEF["style"])
G.gate(r["lines"], label="handoff lint")                     # raises on any warn or error line
assert not cmds.file(q=True, modified=True), "save as a new version first"
```

---

## P16. One complete job as a script (short stylized hair and brows)

**Why:** a groom fails silently between stages: guides that never reach the hair, a measurement
nobody asserts, a description still called `description1`. This script runs P1 to P9 in order with
every name defined and every gate raising (`G.gate`, `assert`), so a failure stops at the stage that
caused it. It assumes the common header above, the P0 recipes (`create_splines`, `export_cache` as a
template, `add_guide_modifier`, `rebuild`), and two files the agent wrote before any node:
`brief.json` (the "Establish first" answers) and the flow sheets from the references (P2).

Its pure parts (gates, verdicts, measures) ran offline in `test_mx_groom_offline.py`; the Maya calls
are the ones tested in `test_groom_guides.py`, `test_groom_stack.py`, `test_groom_clump_levels.py`,
`test_groom_shader.py` and `test_groom_review.py`.

```python
BRIEF = json.load(open(os.path.join(OUT, "brief.json")))     # {"style": "stylized", "budget": ..., "hair_rgb": [r, g, b], ...}
FLOW = json.load(open(os.path.join(OUT, "flow_v001.json")))  # P2, written from REFS
FLOW_BROW = json.load(open(os.path.join(OUT, "flow_brow_L_v001.json")))
BROW_L = "browL_GEO"                                         # brow patch cut from the head faces (same scalp gate)
need = ("create_splines", "export_cache", "add_guide_modifier", "rebuild")
st = G.recipe_status()
assert all(st[k].startswith("recorded") for k in need), {k: st[k] for k in need}

# P1 scalp and P2 flow sheet
for mesh in (SCALP, BROW_L):
    G.gate(G.scalp_check(mesh)["lines"], label="growth mesh " + mesh)
assert G.check_flow_sheet(FLOW) == [] and G.check_flow_sheet(FLOW_BROW) == []

# P3 guides
g = G.make_guides(SCALP, FLOW, spacing=1.2, cvs=8, collide=HEAD, seed=1, length_random=G.LENGTH_RANDOM)
rep = G.measure_curves(g["group"], surface=HEAD, flow=FLOW, long_hair=False, style=BRIEF["style"])
assert rep["penetration_pct"] <= 0.5 and rep["flow"]["over_threshold_pct"] <= 5.0, (rep["penetration_pct"], rep["flow"])
G.rebuild_curves(g["curves"], 20)
gb = G.make_guides(BROW_L, FLOW_BROW, count=12, cvs=8, collide=HEAD, seed=2)

# P4 descriptions, then the wiring gate
_, body = G.create_description(SCALP, "hair_body")
_, brow = G.create_description(BROW_L, "brow_L")
G.export_cache(body, OUT + "/body_unwired.abc")
err0 = G.measure_abc(OUT + "/body_unwired.abc", surface=HEAD, flow=FLOW, long_hair=False)["flow"]["sheet_error_mean"]
w = G.wire_guides(body, g["curves"])
G.wire_guides(brow, gb["curves"])
G.export_cache(body, OUT + "/body_wired.abc")
err1 = G.measure_abc(OUT + "/body_wired.abc", surface=HEAD, flow=FLOW, long_hair=False)["flow"]["sheet_error_mean"]
G.export_cache(w["in_guide_base"], OUT + "/guides_only.abc")
G.gate(G.wiring_verdict(err0, err1, len(g["curves"]), len(G.strands_from_abc(OUT + "/guides_only.abc"))), label="wiring")

# P5 stack: two levels, root-loose, clump-level noise on the tip half, stray-clump holes, balanced length
base = G.stack(body)[0]["node"]
G.set_attrs(base, {"cv_count": 20})
G.run_recipe("rebuild", node=base)
tris = G.mesh_triangles(SCALP)
prim, sec = G.build_clumps(body, {"clump_density": G.clump_density_for(BIG_CLUMPS, G.surface_area(tris)),
                                  "clump_strength": 1.0, "radius_variance": 0.5}, levels=2, ratio=4.0)
G.set_ramp(prim, G.find_attr(prim, "clump_scale"), G.profile_ramp("root_loose", CONVENTION))
G.connect_texture(G.write_mask_png(OUT + "/sourceimages/primary_holes.png", 512,
                                   G.rasterize_uv(tris, 512, texel_value=G.patches(0.05, cells=64, seed=4))),
                  prim, "mask", name="strayClumps")
sc = G.insert_modifier(body, "xgmModifierScale", "top")
G.connect_expression(sc, "scale", "rand(0.8, 1.2)")
G.build_clumps(brow, {"clump_density": G.clump_density_for(BRIEF.get("brow_clumps", 20), G.surface_area(G.mesh_triangles(BROW_L))),
                      "clump_strength": 0.5}, levels=1, convention=CONVENTION)   # brows: a light clump (Hadi [00:13:40])
G.gate(G.lint([body, brow], style=BRIEF["style"], rendering=False)["lines"], label="stack")

# P7 measure: hierarchy, which level the noise broke, final strands
G.export_cache(prim, OUT + "/after_primary.abc")
G.export_cache(sec, OUT + "/after_secondary.abc")                     # secondary without noise
G.set_attrs(sec, {"clump_noise": 0.3, "noise_scale": G.TIP_HALF_RAMP})  # [added] amount: the defined end of the soft range
G.export_cache(sec, OUT + "/after_secondary_noise.abc")
A, B, N = (G.strands_from_abc(OUT + f) for f in ("/after_primary.abc", "/after_secondary.abc", "/after_secondary_noise.abc"))
hs = G.hierarchy_from_states(A, B)
assert 3.0 <= hs["mean"] <= 5.0, hs
G.gate(G.breakup_verdict(G.breakup_report(B, N), "big"), label="clump-level noise")
G.export_cache(body, OUT + "/body_final.abc")
final = G.measure_abc(OUT + "/body_final.abc", surface=HEAD, flow=FLOW, long_hair=False, style=BRIEF["style"])
G.gate(final["verdict"], label="final strands")

# P8 shader and curves, then save and lint with rendering on
for d, nm in ((body, "hair_body_MTL"), (brow, "brow_L_MTL")):
    r = G.hair_shader(d, preset="textured", values={"baseColor": tuple(BRIEF["hair_rgb"])}, name=nm)   # flat color, Melanin 0
    assert not r["report"]["errors"] and not r["report"]["missing"], r["report"]
G.curve_render([body, brow], "ribbon", min_pixel_width=0.25)
cmds.file(rename=os.path.join(OUT, "groom_v001.ma"))
cmds.file(save=True, type="mayaAscii")
G.gate(G.lint([body, brow], roles={"hair_body": "body", "brow_L": "brow"}, budget=BRIEF["budget"],
              style=BRIEF["style"])["lines"], label="pre-render lint")

# P9 review: numbers first, then the sheet with critique.md
bb = cmds.exactWorldBoundingBox(SCALP)
cx, top, front, wd = (bb[0] + bb[3]) / 2.0, bb[4], bb[5], bb[3] - bb[0]
rv = G.review([body, brow], OUT + "/review", head=HEAD, scalp=SCALP,
              closeups=[("hairline", (cx, top - 0.3 * (bb[4] - bb[1]), front), 0.2 * wd, "front")])   # framing [added]
assert all((v.get("showthrough_pct") or 0) <= BRIEF.get("showthrough_max", 100) for v in rv["metrics"]["coverage"].values()), rv["metrics"]
print(rv["sheet"])       # open with the image reader; a failure goes back to the flow sheet (P2) or the stack (P5), never a brush
```

[added] values in this script, to replace from the reference or the tests: 20 brow clumps (only the
fallback when the brief has no count), 12 brow guides, brow Clump 0.5, clump noise 0.3 (the defined
end of the soft range) and MPW 0.25 (tuned in P10).
