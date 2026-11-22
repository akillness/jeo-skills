---
name: scenario-maya-groom
description: "Use when grooming hair or fur in Maya with XGen (Interactive Groom splines or legacy descriptions): scalp hair, eyebrows, eyelashes, fur, guides, clumps, noise, parting, density maps, a fill layer, aiStandardHair shading, noisy or flickering hair renders, hair that must move (Linear Wire, nHair, Alembic caches), or a groom for Unreal (groom Alembic, cards). Also when XGen hair looks CG, clumps look uniform, the scalp shows through, or an XGen script fails."
license: MIT
---

# Hair and fur grooming (XGen Interactive Groom, Maya 2027)

Expert grooming sets the flow on a few guides first, then a clump hierarchy with loose roots and
varied profiles, then breakup only where the reference shows it (tips, strays), judged in close,
side-lit renders with the real hair shader. Interactive Groom brushes have no stroke API, so the
agent grooms with data (guides from a flow sheet wired into the stack, masks written as images,
modifiers set by value) and judges with numbers from exported strands plus renders. Code:
[`scripts/mx_groom.py`](scripts/mx_groom.py) (`import mx_groom as G`). If a sibling skill named here
is missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to
install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas
and flag the gap.

**REQUIRED BACKGROUND:** scenario-maya-expert (execution channel, review loop, 2027 version traps).

**Status (2026-09-24):** every Maya call here is **not yet run in Maya** (2027 not installed). The
pure layer of `mx_groom` passes offline (`tests/code/maya-groom/test_mx_groom_offline.py`). Names
not quoted from the 2027 help resolve at run time from `G.NAME_CANDIDATES`.

## Stance (the expert delta)

- **Flow first, on the guides, copied from arrows drawn over the reference** (Fernandez). Flow is
  pressure: neighbors share the compression curve, and opposing streams meet through a straighter
  band. Short fur turns sharply, long hair slowly. Decide whether the flow or a clump owns each big
  shape.
- **Roots loose, every clump different, two levels** (Fernandez). No attraction over about the first
  14 % of the length, or the base pinches into bald lines. 3 to 5 small clumps per big one; a third
  level only for long hair or manes. Vary size and profile (`G.CLUMP_PROFILES`: spike, onion).
- **Mask and tightness are different knobs** (Fernandez 05, 06). The mask decides triangle versus
  square: square clumps are tight small clumps inside a looser big clump, both masks lowered.
  Tightness (IG Clump strength [added]) 0 keeps the clump's shape without converging; mask 0 removes
  it. Straight guides make them look alike, so test on noisy guides (`G.clump_follow`).
- **The level that gets the noise decides what breaks** (Fernandez 07). Clump-level noise (the
  secondary Clump's Noise, tip half) breaks the big clumps and keeps the small ones and the roots; a
  Noise modifier breaks the small clumps too, so it goes on few hairs (Giovannini: 0 on the body, 3
  on a 5 % share). Vary the frequency; fray only on few hairs. Stray clumps come from holes in the
  primary's mask, not a new system.
- **The hairline reads real through thinner edge strands plus transition and peach-fuzz
  descriptions**, not density alone (Hadi Karimi). One density map is shared by every description;
  each hair type gets its own description.
- **A short fill layer hides the scalp** (Giovannini): body guides cut to 2/3, so long hair need not
  be "crazy dense".
- **Motion drives a few wires, never the hair** (Flood). Export the wires from the Linear Wire's
  inGuide. Update the Reference State at the rest pose on frame 1. Curve to Spline gets Align to
  Normals off.
- **Standard Hair realism comes from melanin, roughness and IOR** (Arnold hair doc). Keep diffuse 0,
  tints white and indirect scales at 1, and use ribbon mode (Min Pixel Width only works there).
  Blond hair gets Extra Depth. Cost has four knobs (MPW, transparency depth, specular samples, AA);
  opacity below 1 costs significantly.

## Establish first

Write the answers to `brief.json` before any node.

| Input                   | Changes                                                                                                                                                                                                                      | Default when silent                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Target                  | Arnold strands, Unreal strands, or cards (MtoA renders no XGen Card primitives)                                                                                                                                              | Arnold strands                        |
| Hair types              | one description each: body, fill, fringe, strays, brows, upper and lower lashes, transition, fuzz. Close-up face: rule peach fuzz in or out (Hadi)                                                                           | body + brows                          |
| Style                   | realistic: random clump points, Randomness > 0, melanin. Stylized: clumps on the guides (FlippedNormals), flat Base Color with Melanin 0 [added]. Both: a point on the defined-to-soft range, same silhouette (Fernandez 07) | realistic                             |
| Motion, and who owns it | static follow; keyed or simulated wires; rig or CFX department (Flood) or the groom file (2027 help)                                                                                                                         | follows the scalp                     |
| Still or animated       | still likeness: grow on the head (Hadi). Animated or real time: scalp cap with clean UVs                                                                                                                                     | scalp cap                             |
| Camera distance         | Scattering Mode: Accurate for close-ups (10 to 30 % slower), Adaptive for mixed shots                                                                                                                                        | Adaptive                              |
| Budget                  | spline count and GPU memory (`xgmSplineQuery`), Unreal sim guides                                                                                                                                                            | state a number                        |
| Reference               | flow arrows and clump counts come from it                                                                                                                                                                                    | ask; else write the assumed look down |
| New or inherited        | Interactive Groom for new work; legacy XGen only for an inherited asset or non-spline primitives                                                                                                                             | Interactive Groom                     |

## Workflow

Headless `mayapy` (`mx_run --plugins mtoa,xgen,abc`, in that order) covers guides, masks, Alembic,
Unreal tags, lint, analysis and Arnold reviews; the GUI bridge covers the menu queries and whatever
the probe shows does not evaluate headless (IG computes on the GPU).
[`references/procedures.md`](references/procedures.md) P16 is the whole job as one script with every
gate asserted (`G.gate` raises).

0. **Probe and recipes (once per install).** `G.probe()` headless and in the GUI. Menu actions with
   no documented command are read, not clicked: through the bridge, `G.menu_recipe(name)` queries
   the item's command string (`cmds.menuItem(item, q=True, command=True)`) and stores it; Attribute
   Editor buttons (Make Wires Dynamic, Reference State Update, Rebuild) go through
   `G.button_recipe(name, node)`. Export Cache opens a dialog: write its `@path@` template from
   `G.recipe_source`. **GATE:** probe JSON saved; `recipe_status()` shows the recipes the plan needs
   as recorded.
1. **Scalp.** `G.scalp_check(scalp, for_unreal=...)`. **GATE:** no `error:` line, border edges
   present (the hairline), UVs unique.
2. **Flow sheet and counts.** From the reference write the flow sheet (`base`, `whorl`, `part`,
   `direction`, length regions) and count big clumps and small per big. **GATE:**
   `G.check_flow_sheet(flow) == []`.
3. **Guides.** `g = G.make_guides(scalp, flow, spacing=..., cvs=8, collide=head)`, few first
   (FlippedNormals); `symmetric=True` only on symmetric topology (Hadi). **GATE:**
   `G.gate(G.measure_curves(...)["verdict"])`, penetration 0, discontinuities only at parts and
   whorls.
4. **Descriptions and wiring.** `G.create_description(scalp, "hair_body")` per hair type (recipe,
   renamed). `G.wire_guides(desc, g["curves"])`: a Guide modifier low in the stack interpolates the
   guides, fed by a Curve to Spline on its inGuide; it holds the region maps parts need. A Curve to
   Spline on the description itself turns each curve into one hair and disables everything below it:
   only for exact strands or caches. **GATE:** `G.wiring_verdict`: flow-sheet error of the hair
   drops after wiring, and the InGuide_base cache holds every guide.
5. **Stack, density and masks.** Bottom to top: base (CV count per Numbers), Scale, Guide, primary
   and secondary Clump (`G.build_clumps`), strand Noise on a share, length breakup, Collision.
   `G.write_hairline_mask` for the hairline (`band=True`: transition), one map shared across
   descriptions (`G.connect_texture`), `G.patches` holes in the primary's mask for stray clumps.
   **GATE:** `G.gate(G.lint()["lines"])`; the `coverage` pass (showthrough %) and spline count
   within budget.
6. **Clumps and breakup, one layer at a time** (Giovannini). Once per install, P5b's two tests
   settle the Clump Scale convention, which knob acts as tightness and what each noise level breaks.
   Export mid-stack caches, then `G.hierarchy_from_states` (3 to 5), `G.breakup_report` and
   `G.measure_abc`. Render Clump before and after Noise once each (2027 help). **GATE:**
   `breakup_verdict` and `strand_verdict` clean; a side-lit close-up passes
   [`references/critique.md`](references/critique.md), triangles and squares in the reference's
   proportion.
7. **Shader and render.** `G.hair_shader(desc, preset=...)` (replaces the default
   `hairPhysicalShader`), `G.curve_render(desc, "ribbon", min_pixel_width=...)`, `G.cost_sweep` over
   the four knobs with flicker. Save before rendering XGen. **GATE:** `G.review(...)` sheet judged
   with the critique, no shader `warn:`.
8. **Motion.** Static follow, keyed wires (Flood) or dynamics (Linear Wire, Make Wires Dynamic).
   Caches are versioned. **GATE:** renders at the rest, mid and last frames with no penetration.
9. **Deliver** (Handoffs).

## Numbers

| Value                                                                                       | Relative to                              | Source                                             |
| ------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| no clump pull over the first ~14 %                                                          | strand length, clump profile             | Fernandez 02 [00:17:56]                            |
| spike: 0.01 at mid length; onion: mid bulge ~0.9                                            | legacy Clump Scale ramp (radius reading) | Fernandez 02 [00:05:38], frames 00:06:00, 00:10:51 |
| 3 to 5 small clumps per big; 2 levels, 3 for long hair                                      | clump hierarchy                          | Fernandez 03 [00:01:31], [00:09:11]                |
| second clump density 7.5, clump noise 2, Cut random up to 10                                | his real-time scalp asset                | Giovannini [00:09:43] to [00:11:25]                |
| strays 5 % (up to 20 %), noise 3 on strays, 0 on body                                       | share of hairs                           | Giovannini [00:09:28], [00:11:59]                  |
| noise mask 0.1 to 0.5 (1 kills clumping)                                                    | legacy Noise modifier                    | FlippedNormals [00:32:05]                          |
| 20 CVs with noise; 24 to 36 for curls                                                       | modifier or base CV count                | FlippedNormals [00:28:52]; 2027 help               |
| random length 0.8 to 1.2; clump cut 0.2                                                     | balanced around 1; small-clump level     | Fernandez 08 [00:09:33], [00:15:34]                |
| melanin 0.2 blonde, 0.5 red or brown, 1.0 black                                             | Standard Hair                            | Arnold hair doc                                    |
| IOR 1.55 (outside 1.4 to 1.6 only wet); Shift 0 to 10 deg, 2.3 to 3.7 measured, 0 synthetic | Standard Hair                            | Arnold hair doc                                    |
| Unreal: Sub Steps 40, Iterations 10, Collision Radius 3.5, Bend Scale tip 0.1               | UE 5.3 era [estimate]                    | Giovannini [00:51:04] to [00:54:27]                |
| Nucleus Space Scale 0.01                                                                    | cm scenes                                | maya-version-deltas 2.8                            |

## Quality gates

**In code.** `G.lint()` (plug-in order, stack, clump wiring and profiles, noise placement, budget,
shader), `G.measure_abc(cache)["verdict"]` (root pinch, profile variety, small per big, strays, tip
noise, frequency and fray, length balance, flow, penetration), `G.wiring_verdict`,
`G.breakup_verdict`, `G.unreal_verdict(G.inspect_abc(abc))`. `G.gate` turns any of them into an
assertion. Thresholds marked [added] are this skill's defaults; each line cites its rule.

**Visual.** `G.review(hair, out, head=head, scalp=scalp, closeups=[...])` renders the real shader:
beauty (dome plus a key along the groom, Schneider), backlit (strays, halo), silhouette, coverage.
Viewport captures only after `G.viewport_aa(True)` (FlippedNormals, Fernandez). Judge with
`references/critique.md`: flow, then clumps, then strands (Fernandez).

## Common mistakes

| Mistake                                                         | Looks like                                                | Fix                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| Guides not wired, or through Curve to Spline on the description | hair ignores the flow sheet, or one hair per curve        | `G.wire_guides` (Guide modifier), then `wiring_verdict`               |
| Clumped roots                                                   | bald lines between clumps at the scalp                    | root-loose Clump Scale ramp (Fernandez)                               |
| One clump shape everywhere, all triangles                       | "CG" regularity                                           | Radius Variance, profiles, square clumps (Fernandez 02, 05)           |
| Mask and tightness judged on straight guides                    | two knobs seem to do the same                             | noise below the Clump, `G.clump_follow` (Fernandez 06)                |
| Strand noise to break big clumps; noise on the body             | small clumps dissolve into frizz                          | clump-level noise, strand noise on a share (Fernandez 07, Giovannini) |
| One noise frequency, fray everywhere                            | fake, uniform frizz                                       | vary frequency; fray on few hairs (Fernandez 05)                      |
| Strays as a new system only                                     | strays unrelated to the clumps                            | holes in the primary's mask (Fernandez 03)                            |
| Extending strands                                               | criss-crossing inside clumps                              | scale or cut at the small-clump level (Fernandez 08)                  |
| Jagged clumps, bad placement                                    | stepped clump edges                                       | raise Map Subdivision Level on every level; new Seed (2027 help)      |
| Secondary density at or below primary                           | secondary clumps leak across cells                        | duplicate the primary, raise density, Use Control Map (2027 help)     |
| Clumps crossing a part                                          | clumps straddle the part                                  | Guide region map as clump control map, or separate descriptions       |
| Cache without Multiple Transforms and Write Final Width         | curves wrong in other apps                                | turn both on (2027 help, Flood); check Epic's opposite advice         |
| Default `hairPhysicalShader` kept                               | no indirect diffuse on the hair (Ai Kd Ind defaults to 0) | aiStandardHair, or raise Ai Kd Ind (2027 help)                        |
| Judging an aliased viewport                                     | density and clumps misread                                | `G.viewport_aa(True)` first                                           |

## Handoffs

- **Receives from scenario-maya-retopology-uv:** a scalp-only cap (open border at the hairline),
  unique UVs in 0 to 1, UV set `map1` for Unreal, frozen, no history; it passes `G.scalp_check`.
- **Receives from scenario-maya-animation:** rig referenced, shots starting at the rest pose on
  frame 1, an Alembic of the animated body (`-uvWrite`, `-stripNamespaces`), and the wires cache
  when the rig owns the wires.
- **Delivers to scenario-maya-lighting-rendering:** a new groom version, aiStandardHair assigned and
  linted, ribbon settings, versioned per-shot caches, the review sheet and what was not verified.
  Loop in scenario-maya-lookdev when the hair must match the skin.
- **Delivers to scenario-maya-pipeline-scripting (Unreal):** `<asset>_ue5.abc` with
  `groom_group_id`, `groom_guide` (real guides, no fill) and `groom_root_uv` (UV set `map1`), a
  clean `unreal_verdict` on the reimport, and the Unreal start values (Numbers).

## Maya 2027 notes

- Legacy descriptions do not work with Interactive Groom tools; convert one at a time, then Rebuild
  each (Giovannini).
- Default IG shader is `hairPhysicalShader` (Ai Kd Ind 0). Standard Hair gained `scattering_mode` in
  MtoA 5.6.0. Load MtoA before XGen.
- IG computes on the GPU; headless evaluation on Apple Silicon is unverified (probe). Parallel Maya
  known limitation: batch rendering XGen scenes "may produce incorrect results".
- Alembic is Ogawa only. Epic's scripts are Python 2 and API 1.0: use the `mx_groom` ports. No
  Arnold GPU on macOS; Arnold RenderView replaces Maya IPR. Ctrl means Control, not Command.

## References

- `references/procedures.md`: code for every stage, P5b clump tests, P16 the whole job. Load before
  writing groom code.
- `references/critique.md`: the rubric for judging a groom from renders and numbers. Load at every
  gate.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert, disagreements
  with deciding conditions. Load when choosing between options.
- [`references/gui-paths.md`](references/gui-paths.md): menus, editors, brushes, hotkeys
  (computer-use agent).
- [`references/sources.md`](references/sources.md): every source, credentials, URLs, best
  timestamps.
