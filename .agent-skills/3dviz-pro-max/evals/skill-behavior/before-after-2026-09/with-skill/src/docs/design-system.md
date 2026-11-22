# Emberfall: design system

## 1. Look statement

- **Feeling:** warm, unhurried, lived-in
- **Time of day / setting:** 20 minutes before sunset, sun elevation 6 deg, azimuth 250 deg
- **References:** hand-painted animation backgrounds (grouped value masses, no per-leaf detail);
  a terraced hill village where the lane is a staircase; blown-glass lantern light at dusk
- **Palette:** `#3a4a7a` dusk zenith · `#f2a55c` horizon band and fog · `#61703f` turf ·
  `#dcc59c` plaster · `#9c7a45` thatch · `#ffb46b` ember accent (the only emissive family)
- **Key light:** `#ffb46b` from azimuth 250 deg at 6 deg elevation, intensity 3.2, shadows on
- **Camera:** 40 deg FOV, orbit 6-95 m, polar 42-87 deg; overview at 51 m, lane view at eye height
- **Signature technique:** buildings differ by program, not by jitter - a wheel that reaches water,
  a flue twice its roof height, a floor lifted on staddle stones, a louvred moth tower
- **Deliberately absent:** any medieval-European set dressing (no castle, no cart, no market stall),
  and any texture maps; the look has to come from value grouping and silhouette or it is not earned

Source records: `knowledge.style-ghibli-painterly-pastoral`, `knowledge.lighting-mood-dusk-golden-hour`,
`recipe.fantasy-village-diorama`, `knowledge.theme-fantasy-woodland`,
`knowledge.reasoning-settlement-function-variation`, `knowledge.inspectable-selection`.

Departures from their `defaults.values`:

- Fog density 0.02 -> **0.0062**. The lighting record's 0.02 was tuned for a 20 m subject; over a
  62 m village it erased every depth layer into one orange field (first capture pass proved it).
- Hemisphere fill 0.5 -> **0.8**, ground colour `#4a3a2a` -> `#5c4a38` (key:fill ~4:1, not 6:1).
  This scene carries far more dark canopy mass than the record's demo; at 0.5 the tree silhouettes
  read as holes rather than as shaded green.
- Shadow camera extent 20 m -> **42 m**, light distance 30 -> 90 m. Same principle as the record
  (fit the shadow camera to the visible scene), different scene extent.
- Style record's "sky >= 45% of frame height" is **not** met in the overview. This is a diorama
  looked down into, not a pastoral landscape looked across; the ground is the subject. The style
  record's value grouping, jitter and material discipline are all kept.
- Style record's key (52 deg, `#fff2d8`) is dropped entirely in favour of the dusk rig, exactly as
  its own `creative_affordances` note suggests for a late-afternoon variant.

## 2. Representation

**Illustration + discrete state.** The village is invented, so nothing is simulated; but what a
viewer can select and read is state, not decoration.

- **Authoritative state:** `village-model.js` - `BUILDINGS` (id, program, consumes, produces, site,
  tell, position, footprint), `LANES` (polylines), `RESIDENTS` (route, speed, rest point).
- **What the animation does:** each resident owns a distance along its route; `creatures.js` moves
  the mesh to whatever that distance and `terrain.heightAt` resolve to. The panel text is read
  straight out of the model row, never authored twice.
- **What it must never do:** invent state the model does not hold. Adding a building means adding a
  row; the picker, the list, the panel and the lane it stands on all follow from it.

## 3. Factual grounding

Nothing in Emberfall is a factual claim. It is an invented settlement: no historical, structural,
ecological or engineering assertion is made, and the panel says so on screen.

The one piece of real-world reasoning is dimensional consistency, and it is stated rather than
sourced: doors are 2.0 m, fence posts 1.1 m, the fox-folk 1.5 m, the mill wheel 4.4 m. These are
authored so the scene reads at a consistent scale, not measured from anything.

Purely fictional: emberlight, lantern moths, ground glimmer, fox-folk, and every building name.

## 4. Composition and scale cues

- **Hero:** the Ember Beacon - a 7 m hollow stump on the knoll, the only round mass in a village of
  gables, and the only thing in frame carrying a value above 0.9.
- **Scale cues in frame:** 2.0 m doorways on every building, 1.1 m fence posts along the store's
  lane, 1.5 m fox-folk walking the lanes, 0.45 m cottage benches.
- **Depth layers:** foreground lane and mill / midground village terraces / far ridge and woodland,
  separated by terrain height, fog and value.
- **Authored views:**
  - `overview` - the whole settlement and how the lanes connect it (home view).
  - `beacon` - the landmark from the north; shows the crown and the moths.
  - `lane` - eye height on the spine lane, to feel the scale of a doorway.
  - `millpond` - the wheel meeting the water, the reason the mill stands where it does.
  - `terraces` - the west side, showing the store on staddle stones and the stepped ground.

## 5. Materials

| Family | Roughness | Metalness | Reads as |
| --- | --- | --- | --- |
| pond water | 0.11 | 0.15 | still water holding the sun |
| iron, hoist, lantern frames | 0.38 | 0.65 | worked metal |
| plaster walls | 0.62 / 0.66 | 0 | limewashed daub |
| dark timber, joinery | 0.70 | 0 | tarred structural wood |
| framing timber | 0.78 | 0 | dry sawn wood |
| stone, plinths, staddles | 0.88 | 0 | dressed rubble |
| canopy, shrub, thatch | 0.90-0.95 | 0 | leaf mass and straw |
| ground | 0.95 | 0 | turf and bare earth |

Emissives (window glow 1.5, mushroom caps 1.7, moth wings 1.3, forge 2.4, flame 2.2) are the only
surfaces authored above the bloom threshold of 1.0.

## 6. Motion

- **Ambient:** three residents walking their own routes at 0.95-1.25 m/s, each pausing 2.4-4.0 s at
  its own rest point; nine moths orbiting the beacon (0.35-0.61 rad/s, 13 Hz wing flap); five smoke
  puffs rising 5.2 m over ~7 s from the smithy flue.
- **Triggered:** clicking a building or its list entry runs a 0.9 s camera tween that approaches
  from outside the village, and drops a ring marker on the ground.
- **Reduced motion:** `prefers-reduced-motion` starts the scene paused - the first frame is a still,
  fully composed village; `#control` resumes.

## 7. Interaction map

| Control | Selector | Changes | Visible confirmation |
| --- | --- | --- | --- |
| Pause motion | `#control` | ambient motion on/off | label flips to "Resume motion", `aria-pressed` |
| Reset view | `#reset` | home view + clears selection | frame matches `overview`, ring hidden, panel empty state |
| Building list | `#pick-<id>` | selection + camera tween | button `aria-pressed`, ring on ground, panel facts |
| Canvas click | pointer on any mesh | selection (drag is ignored) | same as above; a miss clears |
| Named views | `#view-<name>` | camera jump | frame changes; `window.__viewer.setView` |

## 8. Runtime limits

- Engine and build: three@0.180.0, vite@7.1.5, postprocessing@6.39.4
- Pixel ratio cap 2, shadow map 2048, 4 lights (key, hemisphere fill, rim, one capped point light
  in the beacon crown), ~40 draw calls before instancing plus 5 instanced families
- Remote runtime assets: none. No textures, no fonts, no models - everything is procedural.
- Known cost: not measured. No frame-time instrumentation was added and none was read.

## 9. Opt-outs from the anti-slop checklist

| Item | Why this scene departs |
| --- | --- |
| #4 hero highest contrast | Holds in every view except `beacon`, which looks at the stump's shaded north face; the glowing crown is still the brightest thing in that frame, but the stump body is dark. Recorded as a known weakness rather than fixed - the fix budget ran out. |
| #8 three hue families + accent | Kept: dusk blue, woodland green, ochre timber, ember accent. The pond's teal is the green family desaturated, not a fifth hue. |

No other item is opted out of.
