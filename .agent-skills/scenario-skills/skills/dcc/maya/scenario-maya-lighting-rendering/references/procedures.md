# Procedures (maya.cmds and mx_light, full code)

**Status of every Python block below: not yet run in Maya** (Maya 2027 not installed on 2026-09-24).
Each block starts with `# test: <id>`:
`tests/code/maya-lighting-rendering/job_procedures_snippets.py` extracts these exact blocks from
this file, runs them in order in one namespace on a prepared scene, and checks their results. A
block marked `# soft-block` holds unverified API calls: if it raises, the runner records a soft
failure (a name to fix after the probe) instead of a hard one. Deeper tests of the same functions:
`job_rig_and_groups.py`, `job_render_aovs_sums.py`, `job_frame_critique.py`, `job_noise_loop.py`,
`job_color_setup_batch.py`, and the probe `job_00_probe_lighting.py` (all under
`tests/code/maya-lighting-rendering/`, run by `run_all.sh` through scenario-maya-expert's
`mx_run.py`). Verified without Maya: the pure layer of `mx_light` (`test_mx_light_offline.py`, 138
checks with python3 + numpy) and the Python logic of every block and job against a fake `maya.cmds`
with a toy renderer (`test_jobs_fakemaya.py`); neither proves Maya or Arnold behavior.

Context the blocks assume (the runner builds it): `WATCH` a product root group (`watch_GRP`, a watch
proxy in cm on a slate plane), `CAM` its 100 mm camera, `HEAD` a head proxy turned 45 degrees to
screen right with `FACE_FORWARD` its forward vector and `CU_CAM` its camera, `HDRI` a lat-long
`.hdr`, `OUT` an output folder. Run inside mayapy through `mx_run.py --plugins mtoa`, or through the
GUI bridge.

Agent-side analysis (`analyze_frame`, `noise_pair`, `check_sums`, sheets) needs numpy. If mayapy
lacks numpy (probe answers it), run those calls in the agent's python3 on the files the Maya jobs
wrote: `python3 mx_light.py analyze --png ... --exr ... --out ...`.

## P0. Session: Arnold, color state, options

Why: Maya 2027 ships MtoA 5.6 (Arnold 7.5); Global Light Sampling replaced per-light samples; the
color names changed in 2026.2 (version deltas 2.6, 2.7). Read the state before touching a light.

```python
# test: P0_session
# status: not yet run in Maya 2027; test: tests/code/maya-lighting-rendering/job_procedures_snippets.py (block P0_session), deeper: job_00_probe_lighting.py
import json
import os
import maya.cmds as cmds
import mx_light as L

mtoa_version = L.ensure_arnold()                 # loads mtoa, creates the Arnold option nodes
cm = L.cm_state()                                # rendering space, display, view, output transform, OCIO env
color = L.cm_audit(cm, delivering_exr=True)      # render-side color findings
opts = L.get_options()                           # AASamples, GI* samples and depths, light_samples (GLS)...
print(cmds.about(version=True), mtoa_version, cm["rendering_space"], cm["view"], opts)
```

## P1. The shot brief, before any light

Why: "what is the story I am trying to tell?" comes before any button (KT 00:16:50); the target can
be a hand or a dial, not a face by default (KT 00:15:49); the continuity contract decides which shot
tweaks are free (BR 00:37:17, BR-B ch6 Continuity).

```python
# test: P1_brief
# status: not yet run in Maya 2027 (pure Python); test: job_procedures_snippets.py (block P1_brief)
brief = L.default_brief("product")
brief.update(story="a steel watch reads as precise and expensive; the eye lands on the dial",
             target="subject", mood="drama", art_direction="natural",
             contract={"continuity": "conservative",
                       "allowed_shot_tweaks": ["aiExposure", "translate", "rotate", "visibility"]})
with open(os.path.join(OUT, "brief.json"), "w") as f:
    json.dump(brief, f, indent=1)
```

## P2. Product rig keyed to the product axis

Why: for polished metal the lights are designed as shapes seen in the metal (ARV-C 00:36:21; lookdev
digest P9): each softbox sits on the reflected view ray of the plane it must define. Soft means
large (JHILL 00:08:26), rims small and hot (JHILL 00:13:47), strips asymmetric unless the art
direction is symmetric (BR-B ch6 Planet 51). Energy in stops with intensity 1 (LGT § Exposure),
normalize on so size only changes softness (LGT § Normalize). A camera looking down sees the floor
reflected in near-vertical planes, so a strip placed by pure reflection would sit under the slate:
the planner tilts the target plane up until the whole source clears the floor and says so in
`plan["notes"]` [added; found by the offline test]. Every coefficient is a starting point; the
measurement loop tunes it.

```python
# test: P2_product_rig
# status: not yet run in Maya 2027; test: job_procedures_snippets.py (block P2_product_rig), deeper: job_rig_and_groups.py
bb = cmds.exactWorldBoundingBox(WATCH)
cam_pos = tuple(cmds.xform(CAM, q=True, worldSpace=True, translation=True))
plan = L.plan_product_rig("watch", bb[:3], bb[3:], cam_pos,
                          include=("key", "strip_left", "strip_right", "rim", "grazer"))
for f in L.rig_plan_checks(plan):
    print(f["status"], f["id"], f["message"])
rig = L.apply_rig(plan)          # lights under lgt_watch_GRP, one light group per role, tagged mxLightRole
print(sorted(rig["lights"]), rig["flags"], rig["missing"])
```

## P3. Character rig keyed to the face axis (upstage key)

Why: the key lights the far side of the face from the camera (BR-B ch8.5 Lighting upstage and
downstage); measured from the face, not the lens, or a turned face gets a frontal key. No fill from
the lens axis, wrap about twice the key's size, lower, front-ish (BR 00:13:46, 00:26:54, 00:27:59);
the rim outlines the face and must not equal the key (BR 00:30:11; BR-B ch6 Balance). For a shot and
its reverse, the same rule gives opposite keys (BR 00:09:53).

```python
# test: P3_character_rig
# status: not yet run in Maya 2027; test: job_procedures_snippets.py (block P3_character_rig), deeper: job_rig_and_groups.py
hb = cmds.exactWorldBoundingBox(HEAD)
head_c = ((hb[0] + hb[3]) / 2.0, (hb[1] + hb[4]) / 2.0, (hb[2] + hb[5]) / 2.0)
cu_pos = tuple(cmds.xform(CU_CAM, q=True, worldSpace=True, translation=True))
cplan = L.plan_character_rig("mary", head_c, hb[4] - hb[1], cu_pos, FACE_FORWARD)
assert cplan["checks"]["key_upstage"] and cplan["checks"]["wrap_off_lens_axis"], cplan["checks"]
crig = L.apply_rig(cplan)
chk = L.scene_checks(CU_CAM, {"scene": "character"},
                     [{"name": "mary", "head": HEAD, "face_forward": FACE_FORWARD}])
print([(f["id"], f["status"]) for f in chk if f["id"] in ("key_upstage", "fill_lens_axis", "one_key")])
cmds.setAttr(crig["group"] + ".visibility", 0)   # one rig per shot file in production; hidden here
```

## P4. Block on gray, each light alone

Why: test shading on a linear 0.18 gray with a little specular (BR 00:04:21); render each light solo
on every shot, then together, "a truly powerful technique" (BR 00:25:14, BR-B ch8 Key lights). Light
groups give every solo in one render.

```python
# test: P4_grey_block
# status: not yet run in Maya 2027; test: job_procedures_snippets.py (block P4_grey_block), deeper: job_frame_critique.py
L.apply_preset("block")
with L.grey_shading(0.18):                        # every assignment comes back on exit
    grey = L.render_shot(os.path.join(OUT, "grey"), CAM, width=320, height=240, name="grey",
                         aovs="lighting", masks={"subject": [WATCH]})
grey_rep = L.analyze_frame(png=grey["png"], exr=grey["exr"], brief=brief)
solo = L.light_group_sheet(grey["exr"], os.path.join(OUT, "grey", "solo.png"))
print(L.verdict(grey_rep), solo["sheet"])
```

## P5. One light by hand (plain maya.cmds)

Why: the same light without the toolkit, for a human reading along or a quick fix: stops not
intensity (LGT § Exposure), spread as the softbox grid (ARV-L 00:04:30), a light group string (SARK
00:04:15), placed from the subject outward. Maya lights emit down local -Z.

```python
# test: P5_light_by_hand
# status: not yet run in Maya 2027; test: job_procedures_snippets.py (block P5_light_by_hand)
import mx_review
xf = cmds.shadingNode("aiAreaLight", asLight=True, name="lgt_kicker_watch_01")   # [verify] returns the transform
shape = cmds.listRelatives(xf, shapes=True, fullPath=True)[0]
cmds.setAttr(shape + ".aiExposure", L.exposure_for_target(60.0) - 1.0)   # stops; intensity stays 1 [verify names]
cmds.setAttr(shape + ".aiNormalize", 1)                                   # size changes softness, not energy
cmds.setAttr(shape + ".aiSpread", 0.5)                                    # focus without shrinking the source
cmds.setAttr(shape + ".aiAov", "watch_kicker", type="string")             # the light group
target, pos = (0.0, 0.8, 0.0), (-40.0, 25.0, -30.0)
d = tuple(p - t for p, t in zip(pos, target))                             # subject -> light
cmds.xform(xf, worldSpace=True, translation=pos)
cmds.xform(xf, worldSpace=True, rotation=mx_review.aim_rotation(d, cmds.upAxis(q=True, axis=True)))
cmds.setAttr(xf + ".scale", 6.0, 3.0, 1.0, type="double3")               # a 12 x 6 cm quad (2 x 2 units at scale 1 [verify])
```

## P5b. A light blocker to vignette the lighting

Why: fade lights toward the frame edges instead of letting one source blast the set (BR-B ch6
Vignetting); shape the falloff with a blocker rather than re-aiming the light (ARV-L 00:14:30).
Blockers work on any light, barndoors only on spots (LGT § Light Filters).

```python
# test: P5b_blocker
# soft-block: node type and the light's filter plug are unverified
# status: not yet run in Maya 2027; test: job_procedures_snippets.py (block P5b_blocker)
blocker = cmds.createNode("aiLightBlocker", name="lgt_kicker_blockerShape")    # [verify] a filter shape
cmds.connectAttr(blocker + ".message", shape + ".aiFilters", nextAvailable=True)   # [verify] plug name
bx = cmds.listRelatives(blocker, parent=True, fullPath=True)[0]
cmds.xform(bx, worldSpace=True, translation=(-20.0, 12.0, -15.0))              # between light and slate edge
```

## P6. Light groups, AOVs, EXR driver, denoiser

Why: one dict for light-group names so the AOV strings cannot drift: a typo renders an empty pass
with no error (SARK 00:07:19); at most 16 light AOVs (AOV § Light Group Example); ask the compositor
which AOVs they need (AOV § AOVs for Image Compositing). EXR half for color, merged single-part
(noice refuses multipart), Preserve Layer Name, zip. On macOS the denoiser is OIDN, first in the
imager chain; `_denoised` keeps the noisy layer next to it (AOV § Imager Denoiser OIDN).

```python
# test: P6_groups_aovs_driver
# status: not yet run in Maya 2027; test: job_procedures_snippets.py (block P6_groups_aovs_driver), deeper: job_render_aovs_sums.py
groups = dict((l["name"], l["light_group"]) for l in plan["lights"])
groups["lgt_kicker_watch_01"] = "watch_kicker"
L.set_light_groups(groups)
made = L.setup_aovs("comp", light_groups=True)     # additive set + Z, N, P, albedo, crypto + RGBA_<group>
mask = L.add_mask_aov("subject", [WATCH])         # mask_subject: 1 on the watch, 0 elsewhere
missing = L.setup_exr_driver(half=True, merge=True, compression="zip", tiled=False)
dn = L.set_denoiser(enabled=True, first=True, output_suffix="_denoised")
contract = L.group_contract(L.scene_light_groups())
print(sorted(made), missing, dn, [(f["status"], f["message"]) for f in contract])
```

## P7. Render, then critique the frame like a lead

Why: numbers first, then eyes. The critique order is Tanzillo's and Brejon's: story, same world, eye
path (squint), value structure back to front, separation, balance, color, face, shaping, motivation,
technical, polish (TZ-C 00:11:53, 00:08:38; BR-B ch6; digest critique). The report lists each
finding with its fix and whether it is a lighting or a comp note (KT 00:47:19).

```python
# test: P7_render_critique
# status: not yet run in Maya 2027; test: job_procedures_snippets.py (block P7_render_critique), deeper: job_frame_critique.py
L.apply_preset("preview")
shot = L.render_shot(os.path.join(OUT, "v001"), CAM, width=320, height=240, name="watch_v001",
                     aovs="comp", masks={"subject": [WATCH]}, keep_setup=True)
rep = L.analyze_frame(png=shot["png"], exr=shot["exr"], brief=brief)
paths = L.write_report(rep, os.path.join(OUT, "v001", "critique"))   # critique.md/.json, annotated.png, squint.png
sheet = L.light_group_sheet(shot["exr"], os.path.join(OUT, "v001", "groups.png"))
bracket = L.exposure_bracket(shot["exr"], os.path.join(OUT, "v001", "bracket.png"))   # -5 to +5 stops (BRJ-CM Ch.9)
print(L.verdict(rep), paths["md"], L.check_sums(shot["exr"]).get("light_groups"))
```

## P8. Noise: find the AOV, raise one sampler

Why: raising the wrong rays costs time without removing noise; AOVs are the most efficient diagnosis
(SMP § Removing Noise). Samples are squared and multiplied by AA squared (SMP § Camera (AA)); GLS
wants 4 on CPU (SMP § Best setting for light samples); diffuse seen in reflections only cleans with
AA. Two renders that differ only by seed give per-AOV noise; the denoiser stays off while measuring.

```python
# test: P8_noise
# status: not yet run in Maya 2027; test: job_procedures_snippets.py (block P8_noise), deeper: job_noise_loop.py
pair = L.render_seed_pair(os.path.join(OUT, "noise"), CAM, 1, width=160, height=120,
                          samples={"AASamples": 2, "light_samples": 1})
noise = L.noise_pair(pair["a"], pair["b"])
step = L.next_step(noise, L.get_options(), target=0.02)
print(pair["route"], noise["top"], [(r["aov"], round(r["share"], 2)) for r in noise["ranking"]], step)
```

The full loop (`L.noise_loop(render_pair, settings)`) wraps the same calls: render the pair, rank,
raise the top sampler one step, re-measure, stop at the target, at a sampler limit (denoiser), on
fireflies (the playbook in `L.FIREFLY_PLAYBOOK`), or when a step bought less than 15 percent of that
AOV's variance (reverted) [added stopping rule].

## P9. A comp note back into the light

Why: explore the balance on light groups, then copy it back: "once I am happy with the result, I
ALWAYS copy back the values" (BR-B ch8 Final result); the multiplier goes on the light's color, not
the grade value itself (BR 01:02:57, 01:03:30). `split` mode puts the neutral part in stops so shot
deltas stay readable.

```python
# test: P9_grade_back
# status: not yet run in Maya 2027; test: job_procedures_snippets.py (block P9_grade_back)
key = [l for l in plan["lights"] if l["role"] == "key"][0]
cur = L.get_light(key["name"])
new = L.grade_to_light((1.2, 1.1, 0.9), cur["color"], cur["exposure"])   # the comp gain, as a light change
L.set_light(key["name"], exposure=new["exposure"], color=new["color"])
print(cur, new)
```

## P10. Color: the dome HDRI under ACEScg

Why: Maya 2027's shipped rules tag .hdr and .exr as Raw; under ACEScg a linear-sRGB HDRI tagged Raw
is read as ACEScg, which the Arnold ACES page calls incorrect (CM § Define rules; CM § ACES
Workflow). Query the name, never hardcode it (version deltas 2.7). Output transform off for EXR (CM
§ Render color-managed scenes). Texture color spaces on shaders belong to scenario-maya-lookdev's
lint.

```python
# test: P10_colour
# status: not yet run in Maya 2027; test: job_procedures_snippets.py (block P10_colour), deeper: job_color_setup_batch.py
st = L.cm_state()
linear = [n for n in (st["inputs"] or []) if "linear" in n.lower() and ("709" in n or "srgb" in n.lower())]
hdr = cmds.shadingNode("file", asTexture=True, isColorManaged=True, name="studio_HDR")
cmds.setAttr(hdr + ".fileTextureName", HDRI, type="string")           # the rules fire here and tag .hdr Raw
if linear:
    cmds.setAttr(hdr + ".colorSpace", linear[0], type="string")        # linear Rec.709, not Raw, under ACEScg
    cmds.setAttr(hdr + ".ignoreColorSpaceFileRules", 1)
dome = [l for l in plan["lights"] if l["role"] == "dome"][0]["name"]
cmds.connectAttr(hdr + ".outColor", L.shape_and_xform(dome)[0] + ".color", force=True)
audit = L.cm_audit_scene()
print(linear[:1], [(f["id"], f["status"]) for f in audit["findings"]])
```

## P11. Render Setup layer, template, command line

Why: Render Setup is the system in 2027 (exclusive with legacy layers per session); collections
resolve top-down and `*foo*` misses namespaces (`foo::*`); Render Setup nodes are dropped on import
or reference, so setups travel as JSON templates applied with `Render -rst` (CM § Render setup best
practices; PY § Render Setup). `maya -render` is obsolete: `Render -r arnold` (Maya 2027 Help). Save
before rendering from a script.

```python
# test: P11_setup_batch
# soft-block: the Render Setup API calls are unverified
# status: not yet run in Maya 2027; test: job_procedures_snippets.py (block P11_setup_batch), deeper: job_color_setup_batch.py
layer = L.make_layer("watch_beauty", patterns=("watch_GRP*", "slate_geo"))
tpl = L.export_render_setup(os.path.join(OUT, "watch_rs.json"))
scene = os.path.join(OUT, "watch_lighting_v002.ma")
cmds.file(rename=scene)
cmds.file(save=True, type="mayaAscii", force=True)
cmd = L.render_cmd(scene, "hero_CAM", 1, 1, os.path.join(OUT, "batch"), 320, 240, template=tpl)
print(" ".join(cmd))
```

## P12. Settings report and render budget

Why: rays per pixel are computed, not guessed (SMP § Camera (AA)); raising AA from 3 to 6 quadruples
every secondary ray count; time the test and extrapolate with pixels x AA squared for fixed
sampling, then re-time one full frame (Arnold digest P9 [added rule]).

```python
# test: P12_budget
# status: not yet run in Maya 2027; test: job_procedures_snippets.py (block P12_budget)
rs = L.render_settings_report(scene="product", glass_interfaces=4, metal_interreflection=True)
for f in rs["findings"]:
    print(f["status"], f["id"], f["message"])
est = L.extrapolate_time(shot["seconds"], (320, 240), (4000, 3000), 3, 4)
budget = L.sequence_budget(est["seconds"], frames=1, machines=1, hours_available=2)
print(rs["rays_per_pixel"], est, budget)
```

## P13. Master rig referenced into a shot, tweaks under the contract

Why: masters hold the ingredients, shots the recipe; one master per camera axis; allowed shot tweaks
are exposure, transform and on/off, sometimes color (BR 00:37:17; BR-B ch8 Start with practical
lights). The shot references the master and logs every delta so the continuity cost stays visible
[added logging].

```python
# test: P13_master_shot
# status: not yet run in Maya 2027; test: job_procedures_snippets.py (block P13_master_shot)
master = os.path.join(OUT, "lgt_master_watch_front.ma")
cmds.select(rig["group"], replace=True)                     # file export works on the selection
cmds.file(master, exportSelected=True, type="mayaAscii", force=True)
cmds.select(clear=True)
cmds.delete(rig["group"])
cmds.file(master, reference=True, namespace="lgtM")
tweaks = []


def shot_tweak(plug, value, allowed=tuple(brief["contract"]["allowed_shot_tweaks"])):
    attr = plug.split(".")[-1]
    if attr not in allowed:
        raise ValueError("%s is not an allowed shot tweak under this contract" % attr)
    tweaks.append({"plug": plug, "before": cmds.getAttr(plug), "after": value})
    cmds.setAttr(plug, value)


key_shape = L.shape_and_xform("lgtM:" + key["name"])[0]
shot_tweak(key_shape + ".aiExposure", cmds.getAttr(key_shape + ".aiExposure") + 0.5)
try:
    shot_tweak(key_shape + ".color", (1.0, 0.0, 0.0))
    refused = None
except ValueError as exc:
    refused = str(exc)
with open(os.path.join(OUT, "shot_tweaks.json"), "w") as f:
    json.dump(tweaks, f, indent=1)
```

## Shell routes (not blocks; same calls from the agent's terminal)

```bash
# a render through mx_run (headless mayapy), then the critique in plain python3
python3 <skills >/scenario-maya-expert/scripts/mx_run.py --plugins mtoa --scene shot_v003.ma \
  -- render --camera hero_CAM --out /abs/out/v003 \
  --aovs comp --mask subject=watch_GRP <skills >/scenario-maya-lighting-rendering/scripts/mx_light.py
python3 <skills >/scenario-maya-lighting-rendering/scripts/mx_light.py analyze --png /abs/out/v003/_raw/shot_preview.png \
  --exr /abs/out/v003/_raw/shot.exr --kind product --out /abs/out/v003/critique
# noise pair and diagnosis
python3 <skills >/scenario-maya-expert/scripts/mx_run.py --plugins mtoa --scene shot_v003.ma \
  -- render-pair --camera hero_CAM --out /abs/out/noise <skills >/scenario-maya-lighting-rendering/scripts/mx_light.py
python3 <skills >/scenario-maya-lighting-rendering/scripts/mx_light.py noise --a /abs/out/noise/seed_a/_raw/seedA.exr \
  --b /abs/out/noise/seed_b/_raw/seedB.exr
# budget
python3 <skills >/scenario-maya-lighting-rendering/scripts/mx_light.py budget --seconds 42 --test-size 960x540 \
  --size 3840x2160 --test-aa 3 --aa 4 --frames 120 --machines 1 --hours 24
```
