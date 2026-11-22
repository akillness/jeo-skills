# Lanternfall: design system

## 1. Look statement

- **Feeling:** gentle, expectant, communal — hushed rather than spooky.
- **Time of day / setting:** two hours after sunset, no sun, thin moon at 22° elevation; the
  festival lamps are already lit.
- **References (traits, not titles):** dusk photography of a lantern-lit river town (practical
  density, one lamp per 2.5–4 m of frontage); hand-painted animation night exteriors (a two-stop
  painted sky gradient instead of stars); watercolour game art (value grouped into three masses).
- **Palette:** `#070c18` sky zenith / deepest shadow · `#1b2a4a` sky horizon band, cool fill ·
  `#f2b25c` lantern paper, primary warm · `#c8642e` roof tile and lantern frame, accent warm ·
  `#e8d9b8` ochre wall plaster catching lamplight.
- **Key light:** there is no key. Twenty-five lanterns at 60 cd (decay 2) with the beacon lamp at
  130 cd carry the frame; a moon DirectionalLight `#9fb4ff` at 0.32 from azimuth 40° / elevation 22°
  only draws silhouettes, and a HemisphereLight `#16233f` / `#241a12` at 0.24 keeps shadows tinted.
- **Camera:** 42° FOV, orbit 6–78 m, polar 32–86°, home view 67 m out and 22 m up.
- **Signature technique:** every lantern appears twice — once in the air, once as an additive
  streak on the river that wobbles on its own sine. Reflections double the light count without
  adding a light.
- **Deliberately absent:** stars and a visible moon disc (they flatten the two-stop sky gradient);
  cyan water; any real place, festival or deity — the settlement is invented end to end.

Source records: `knowledge.style-lantern-festival-riverside` (palette, camera, materials, motion,
signature technique), `knowledge.lighting-mood-night-lantern` (sky, fog, tone mapping, practicals,
post), `recipe.fantasy-village-diorama` (one landmark with breathing room, contrasting roof
silhouettes, paths that reach doors).

Departures from their `defaults.values`:

| Value | Record | Used | Why |
| --- | --- | --- | --- |
| exposure | 0.9 (style) vs 1.15 (lighting) | 1.15 | The two records disagree; the scaffold's split gives tone mapping to the lighting record. |
| sky horizon | `#16233f` | `#1b2a4a` (the style record's zenith) | At 67 m the far bank had no value to separate from; this lifts the horizon band without inventing a colour. |
| fog density | 0.05 | 0.013 | The record is tuned for a 20 m street (its own `known_limits` say so). This valley is 90 m across; 0.05 erased everything past the bridge. |
| moon / hemisphere | 0.15 / 0.12 | 0.32 / 0.24 | Same reason: a 90 m village needs the terraces and the far bank legible. Still ~1/200 of a lantern pool, so it never keys a face. |
| environment | none, 0.0 | sky dome at 0.14, `envMapIntensity` 2.4 on water | With no environment the river and wet quay rendered as black holes; the dome is the scene's own sky, so nothing warm leaks in. |
| bloom threshold | 0.9 | 1.0 | Anti-slop item 10 wants ≥ 1.0 and the lantern emissives still sit well above it. |
| camera orbit | 4–22 m, polar 60–92° | 6–78 m, polar 32–86° | The record's range is for a walkable street; exploring a settlement needs a diorama distance and a look-down angle. |
| lantern candela | 60 | 130 for the beacon lamp | It is a navigation light and the scene's hero; every other lamp is the record's 60 cd. |

## 2. Representation

**Illustration + discrete state.** The world is fiction, so nothing is simulated; but *selection* is
discrete state and is authoritative.

- **Authoritative state:** `scene.js` holds `selected` (a building id) and the `BUILDINGS` records
  in `village/village-layout.js`. `world.select(id)` is the only writer.
- **What the animation does:** displays that state — the marker ring, the emissive lift on that
  building's own materials, the panel readout and the camera tween all read it.
- **What it must never do:** invent state the model does not hold. Clicking empty ground clears the
  selection through the same path as the panel buttons.

## 3. Factual grounding

Nothing in this scene is a factual claim. Lanternfall, the Slowwater, the beacon, the river drakes
and the lamp keepers are invented, and the page says so in its own fine print. The only numbers a
viewer could read as measurement are the human-scale cues, which are authored, stated in the
readout, and labelled as authored: door 2.0 m, quay wall 1.25 m, ferry hull 4.5 m, lantern 0.35 m,
mill wheel 4.4 m. No historical, structural or ecological accuracy is claimed.

## 4. Composition and scale cues

- **Hero:** The Ferryman's Beacon — four tiers, ~19.7 m to the ridge, more than 2× its neighbours,
  on the headland in the right third of the home view, carrying the brightest lamp in the frame.
- **Scale cues in frame:** a 2.0 m door on every building, 1.25 m quay wall, 4.5 m moored ferries,
  0.35 m lantern shells, ~1.8 m lamp keepers walking the paths.
- **Depth layers:** foreground water and reeds / midground bridge and quay / far terraces and
  hillcrest, separated by FogExp2 at 0.013 plus the value drop between lantern pools.
- **Authored views:** `overview` (home — the whole settlement with the beacon right of centre);
  `quay` (the bridge approach from the north bank, lantern pools at eye level); `bridge` (the arch
  from downstream, the reflection trick at its strongest); `terrace` (the mill, its wheel and the
  stepped cottages); `beacon` (the landmark close up).

## 5. Materials

| Family | Roughness | Metalness | Reads as |
| --- | --- | --- | --- |
| River surface | 0.15 | 0.22 | wet, reflective, scrolling normal map at 0.02 uv/s |
| Wet quay stone | 0.30 | 0.04 | damp flagstone the lanterns skid across |
| Drake skin | 0.35 | 0.05 | slick, half-submerged |
| Deck plank / hull / door | 0.55 | 0 | dry sawn timber |
| Ground, framing timber | 0.62 | 0.02 | riverside earth, oiled beams |
| Roof tile | 0.70 | 0 | overlapping courses, hue-jittered per building |
| Masonry, plinths, arch | 0.78 | 0 | dressed stone |
| Wall plaster | 0.84 | 0 | limewash, hue- and value-jittered per building |
| Lantern paper, pine, reed | 0.88–0.92 | 0 | matte paper and foliage |

## 6. Motion

- **Ambient:** lanterns sway on seeded sines of 3.2–4.8 s at 3°, phase-offset by x; the mill wheel
  turns at ~4 rpm; ferries bob 2 cm on a 5.5 s period; the water normal map scrolls and the
  reflection streaks shimmer; two lamp keepers walk their routes at ~1.05 m/s with pauses at every
  third waypoint; two river drakes undulate along the meander at varying speed; three moths orbit
  three different lamps with a ~2 Hz wingbeat.
- **Triggered:** selecting a building tweens the camera to it over 0.9 s (interruptible — any drag
  cancels it), lights that building's own materials and drops the marker ring.
- **Reduced motion:** `prefers-reduced-motion: reduce` starts the scene paused; the frame is still
  and fully readable, and `#control` resumes.

## 7. Interaction map

| Control | Selector | Changes | Visible confirmation |
| --- | --- | --- | --- |
| Pause / resume motion | `#control` | ambient motion (dt is forced to 0) | label flips, `aria-pressed` flips, everything stops |
| Reset view | `#reset` | clears selection, returns to `overview` | marker disappears, readout resets, camera snaps home |
| Named view | `#view-<name>` | camera position and target | frame changes; also driven by `window.__viewer.setView` |
| Select a building | `#pick-<id>` | `selected` | button pressed, readout fills, ring appears, camera tweens |
| Select a building | canvas click | `selected` | same; a drag over 5 px is treated as a camera move |

## 8. Runtime limits

- three@0.180.0, vite@7.1.5, postprocessing@6.39.4; pixel ratio capped at 2; PCF soft shadows.
- Lights: 1 directional (moon, no shadow), 1 hemisphere, 10 lantern PointLights (the other 15
  lanterns are emissive-only), 2 carried keeper lamps. One PointLight casts shadows, at 1024 with
  `camera.far` 26.
- Remote runtime assets: none. Sky, water normal map, reflection streaks and every mesh are
  procedural.
- Measured cost: 89.6 ms median frame (p90 97.7 ms) in headless Chromium on SwiftShader — software
  rasterisation, so this is a floor, not a GPU number. Not measured on real hardware.

## 9. Opt-outs from the anti-slop checklist

| Item | Why this scene departs |
| --- | --- |
| #1 no single PointLight as key | Honoured in spirit and letter: no single light keys the scene, but *all* of the key light is point lights — that is what a lantern-lit night is. Removing any one changes only its own pool. |
| #4 hero highest contrast | Holds in `overview`, `bridge` and `terrace`. In `quay` the ferryhouse wall nearest a quay pole is the brightest thing in frame, not the beacon — an unfixed defect, recorded in the validation report. |
| #12 FOV | 42° is inside the 35–50° band, though the subject is closer to an interior in the `quay` view. |
