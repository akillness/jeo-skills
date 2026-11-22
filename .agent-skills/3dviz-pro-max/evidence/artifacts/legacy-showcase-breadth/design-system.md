# Breadth bench — design system

Three subjects in one Vite project, each drawn under the whole look its catalog record specifies.
The point of the project is breadth: a qubit state, a gear train and a heart section are three
different jobs, and a skill that claims all three should be able to show all three from the same
scaffold.

Built the way `SKILL.md` describes: `templates/scaffold-vite-threejs` copied out, `templates/rigs`
copied beside it, look numbers pasted from resolved records rather than invented. `pnpm install`
was run after copying, never in place.

```sh
cd docs/demos/showcase/breadth
pnpm install
pnpm dev            # http://127.0.0.1:4175
pnpm build
```

## Records this project reads

| View | Recipe | Look records |
| --- | --- | --- |
| `bloch` | `recipe.single-qubit-bloch-ball` | `knowledge.style-technical-illustration` |
| `gears` | `recipe.coupled-gears` | `knowledge.style-stylized-realism` + `knowledge.lighting-mood-dark-studio-product` |
| `heart` | `recipe.heart-cutaway` | `knowledge.style-scientific-encoding` |

Reproduce the numbers in `src/looks.js`:

```sh
cd skills/3dviz-pro-max
python3 scripts/resolve.py knowledge.style-technical-illustration \
  knowledge.style-scientific-encoding knowledge.style-stylized-realism \
  knowledge.lighting-mood-dark-studio-product
```

`setView(name)` applies the exhibit **and** its whole look — background, fog, tone mapping,
exposure, environment intensity, lights and camera field of view — because half a look reads as a
mistake. Only the active exhibit is in frame; the other two are hidden, not deleted.

## Departures from the records

| Record value | Shipped | Why |
| --- | --- | --- |
| technical-illustration `projection: orthographic` | perspective at fov 24 | The record allows perspective at fov 24 "when overlap must be disambiguated"; the state vector, the polar wedge and the axis arrows overlap. |
| technical-illustration outline pass (1.5 px silhouette) | no inverted-hull pass | The Bloch plate is line work already: great circles and arrows are `Line`/`MeshBasicMaterial`, so an outline pass would double every edge. The heart plate does carry the record's darker outline via `EdgesGeometry`. |
| stylized-realism `camera.orbit.minDist_m: 2` | 0.12 m | The gear train is 0.52 m across. A 2 m floor would put it in the far distance; the orbit limits are shared by all three views and are set to the widest range the three subjects need. |
| stylized-realism / dark-studio `post` (bloom 0.15–0.25, vignette, grain) | no post stack at all | Two of the three looks specify no bloom, no vignette, no grain, and a project that switches post per view would have to be judged per view. Dropping the composer keeps every frame's tone mapping on the renderer and the comparison fair. The dependency is not installed. |
| stylized-realism `bevel 3–6 mm` | 1.5 mm on the gear teeth | A 3 mm bevel on a 10 mm module tooth removes most of the flank. The bevel is sized to the part, not to the record's building-scale example. |
| scientific-encoding ramp texture with `SRGBColorSpace` | five stops sampled in JS, sRGB lerp | The ramp is read per chamber, not per texel, so there is no ramp texture to tag. The interpolation is a plain sRGB lerp between neighbouring stops — an approximation, and the legend shows the five exact stops so a reader can check. |
| scaffold "one thing always moves" | only `gears` animates | An instructional plate and an encoded section are read, not watched; motion in them is noise. The gear train carries the project's idle motion and is the view the motion capture uses. |
| scaffold `scene.js` | three modules under `src/` | One scene file cannot hold three subjects without becoming a switch statement. |

## What each exhibit claims, and what it does not

- **Bloch ball** — `r = (rx, ry, rz)`, `|r| ≤ 1`, `rho = (I + r·sigma)/2`. The frame shows a pure
  state at `theta = 55°`, `phi = 35°`, so `|r| = 1`, `purity = 1.00`, `P(0) = (1 + rz)/2 = 0.79`.
  Three's up axis is `+Y`, so Bloch `+Z` is drawn along `+Y` and Bloch `+Y` along `-Z`; the axis
  labels say so. The ball radius is a state-space quantity drawn at 1 unit = 1 m — it is not a
  spatial distance and nothing in frame suggests it is. This is a still plate of one state, not
  the recipe's interactive state model: there is no drag handle, no mixture chord and no density
  matrix tile.
- **Coupled gears** — 24 and 16 teeth, module 10 mm, pitch radii 0.12 m and 0.08 m, centre
  distance exactly 0.20 m, ratio 3:2 enforced in `update()` as `omega2 = -omega1 · N1/N2`. The
  tooth flank is a straight trapezoid, **not** an involute: it meshes at this ratio and reads at
  this size, and that is all it claims.
- **Heart cutaway** — a schematic four-chamber block of ellipsoids at roughly life size (about
  120 mm base to apex), sectioned by one clipping plane, viewed from the front so the patient's
  left chambers are on the right of frame. It is **not** derived from a segmentation. The
  encoding is the exact part: ramp position = `(pressure − 3) / (120 − 3)` mmHg with
  representative adult values (RA 5, LA 10, RV 25, LV 120 mmHg; atria means, ventricles peak
  systolic), and the in-frame legend carries the same five stops with their mmHg values.

## Capture

```sh
pnpm build
python3 ../../../../skills/3dviz-pro-max/scripts/capture.py \
  --dir dist --all-views --gpu --format jpeg --quality 88 --out captures
```

`viewer-contract.js` is the scaffold's, unchanged: `window.__sceneReady` and
`window.__viewer = {views, setView(name)}` are the only globals, and `scripts/showcase.py` drives
exactly those. Neither `node_modules/` nor `dist/` is committed — this directory ships sources.
