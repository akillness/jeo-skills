# Threadwater Hollow: design system

## 1. Look statement

- **Feeling:** soft, cosy, handmade — and, from the lighting, unhurried.
- **Time of day / setting:** 20 minutes before sunset, sun elevation 6°, azimuth 250°.
- **References (traits, not titles):** hand-felted craft toys (matte fibre bodies, cut-layer
  patches, stitched joins); a European timber-framed river village (plot-to-lane geometry, a mill
  on the bank, one stone crossing); golden-hour landscape photography (long shadows, cool shade).
- **Palette:** `#35302c` deep felt shadow · `#8c6f5a` mid wool brown · `#d8c3a5` lit oatmeal ·
  `#5f7a4f` dyed moss green (the village green) · `#7f9b8e` sage patch · `#e2725b` dyed accent ·
  `#ffc58f` lantern paper (the one emissive family).
- **Key light:** `#ffb46b` from azimuth 250° at 6° elevation, intensity 3.2, shadow extent 34 m.
  Fill: HemisphereLight `#6f8fc9` / `#4a3a2a` at 0.5. Rim: `#ffd9a8` at 0.8, azimuth 70°, no shadow.
- **Camera:** 45° fov, orbit 6–82 m, polar 55–88°, home view 27 / 21 / 33 looking at the green.
- **Signature technique:** every surface in the hollow is re-made as felt by one pass —
  `src/felt-material-pass.js` converts each kit material to a `MeshPhysicalMaterial` with
  sheen 0.6 / sheenRoughness 0.8 / sheenColor `#ffe6cf`, metalness 0 and roughness squeezed into
  0.86–1.0, keeping the kit's own hue relationships. Softness comes from the sheen rim, never gloss.
- **Deliberately absent:** no metal anywhere (the ironwork is felted too), no normal-mapped
  stitching, no glass specular, no stars or moon. A single gloss highlight would read as plastic
  and break the whole conceit.

Source records: `knowledge.style-felt-wool` (palette, materials, sheen, fov, motion),
`knowledge.lighting-mood-dusk-golden-hour` (sun rig, sky, fog, tone mapping, environment, post).
Kit blueprints: timber-cottage, long-hall, market-stall, round-tower, watermill, stone-bridge,
well, cart, barrel, crate, fence-run, clothesline, signboard, lantern-post, tree-round,
tree-conifer, rock-cluster, reeds, biped-walker, quadruped-walker, plus `layout/village-layout.js`.

### Departures from the records' `defaults.values`

| Departure | Record value | Used | Why |
| --- | --- | --- | --- |
| Fog density | 0.02 | **0.0072** | The dusk profile's density is tuned for a ~20 m set. At 0.02 a 45 m overview washed to one amber field with no depth layers (first capture pass). Refitted to a 130 m terrain. |
| Exposure | felt 1.0 / dusk 0.9 | **0.9** | Two profiles disagree; the lighting profile owns exposure because it owns the key. |
| Orbit limits | 0.4–4 m | **6–82 m** | The felt profile is written for a figure in the hand. This is a village. |
| Camera height | 0.35 m | view-derived | Same reason; the `green` view sits at 2.4 m, roughly a standing eye above the lane. |
| Sky / fog colour | felt overcast `#ddd6cc` | dusk `#f2a55c`/`#e8b07a` | Mood comes from the lighting profile; only the material identity comes from the style profile. |
| Bloom | felt 1.15 / 0.14 | dusk 1.0 / 0.3 | The lantern paper is the only authored emissive; the dusk numbers let it bloom, the felt numbers did not. |
| Palette | five wool entries | **six** — added `#5f7a4f` moss | `#7f9b8e` sage is 14% saturation; under a `#ffb46b` key the whole village green rendered as sand (capture pass 1). Moss keeps the wool saturation rule (25–45%) and reads as ground. |
| Shadow extent | 20 m | **34 m** | The profile's own instruction is to fit the extent to the visible scene. |

## 2. Representation

**Illustration.** Nothing here is measured. The authoritative state is the seeded village plan
(`planVillage` → lanes, plots, scatter zones) plus the height field derived from it; every
building, prop, plant and walker route is placed from that plan, and `heightAt(x, z)` is the single
source of truth for what elevation anything sits at. The animation displays state (walker phase =
distance travelled ÷ stride length, wheel angle, water uv offset, lantern flicker); it never
invents position.

## 3. Factual grounding

Nothing in this scene is a factual claim. The village, its names, its trades and its river are
fictional. Building proportions come from the kit blueprints, which state plainly that they are
authored creative starting points and certify no historical construction. The one physical
behaviour that is procedural rather than decorative is the walk cycle: a planted foot holds its
world position because the gait phase advances by distance, not by wall clock. That is a locomotion
convention, not a biomechanical model.

## 4. Composition and scale cues

- **Hero:** Threadwater Mill — the only structure that moves under its own power, and the brightest
  lit mass in the `overview` and `mill` frames. The landmark counterweight is Emberwatch Tower at
  10.5 m, more than twice its neighbours' ridge height, on the highest clear knoll.
- **Scale cues in frame:** cottage doors at ~1.95 m, the biped walkers at ~1.75 m, the well head,
  the 1.18 m fence runs, the 0.94 m barrels, the 3.4 m bridge deck width.
- **Depth layers:** foreground plots and lane props / midground mill, bridge and gorge / far hill
  rim and tree line, separated by fog at 0.0072 and by the value drop from oatmeal hills to moss green.
- **Authored views:** `overview` (home) · `green` (standing on the lane at the Moot Hall) ·
  `mill` (the hero and its wheel over the gorge) · `tower` (the landmark) · `bridge` (the crossing).

## 5. Materials

| Family | Roughness | Metalness | Reads as |
| --- | --- | --- | --- |
| Ground (vertex-coloured) | 0.97 | 0 | cut felt patches: moss green, sage shoulder, oatmeal hilltop, wool at the water |
| Plaster walls | 0.88–0.92 | 0 | pressed wool sheet |
| Roof tiles, timber | 0.93–0.96 | 0 | thicker dyed felt, laid in courses |
| Stone (tower, bridge, mill) | 0.95–0.99 | 0 | dense grey wool |
| Ironwork, lantern frames | 0.86–0.89 | 0 | felted-over iron: matte, never specular |
| Lantern paper | 0.9 | 0 | emissive `#ffc58f`, the one thing above the bloom threshold |
| River | 0.22 | 0 | the deliberate exception (see §9) |

59 distinct roughness values across the built materials, read back at runtime via
`window.__village.stats.roughness`.

## 6. Motion

- **Ambient:** four walkers on lane routes (procedural gait); the mill wheel at ~0.5 rad/s; one
  cart's wheels rolling at a walking pace; 37 trees and 7 reed beds swaying on 2.2–3.4 s sines;
  four lantern practicals breathing ±8% at ~0.3 Hz; the river's normal map scrolling at
  0.012 uv/s; nine wool motes drifting.
- **Triggered:** picking a building tweens the camera over 0.9 s (interruptible: any orbit input
  cancels it) and raises a stitched ground ring plus a bobbing pin.
- **Reduced motion:** the scene starts paused under `prefers-reduced-motion`, and the control
  button reads "Resume motion" from the first frame so it never misdescribes the state.

## 7. Interaction map

| Control | Selector | Changes | Visible confirmation |
| --- | --- | --- | --- |
| Camera view buttons | `#view-<name>` | jumps to a named view | the whole frame |
| Building buttons | `#pick-<id>` | selects and focuses that building | button turns accent, panel fills, ring + pin appear |
| Click in the scene | canvas raycast | selects the building under the cursor; empty ground clears | same as above |
| Pause / resume motion | `#control` | freezes or resumes every animator | label and pressed state flip |
| Reset view | `#reset` | home view **and** clears the selection | overview framing, marker gone, panel back to its hint |

## 8. Selection, in detail

The selected id is the only state. The marker never touches a building's materials — kit materials
are shared through `kit-core`'s cache, so tinting one wall would tint every wall in the hollow.
Instead the ring's 28 stitches are each dropped onto `heightAt` under their own place on the
circle, which is why the ring follows a gorge bank instead of floating across it, and why it does
not rotate.

## 9. Anti-slop checklist: opt-outs

- **Item 13 (three roughness values):** passed, 59 values — but they all sit inside 0.86–1.0 by
  design, because wool has no gloss. The one exception is the river at 0.22: water is not felt, and
  without a low-roughness surface the gorge read as a painted stripe.
- **Item 12 (fov band):** 45° is inside the 35–50° product band and is the felt profile's own
  number, used here for an exterior. A wider interior fov would have bent the village edges.
- **Item 10 (bloom):** threshold 1.0 with only the lantern paper and the marker pin authored above
  it. No diffuse surface glows.
- No other item is opted out of. Item 16's counts are in the validation report.
