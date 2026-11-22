# Threadwater Hollow

A small fictional village, hand-felted, twenty minutes before sunset. Orbit it, click any of its
ten structures to focus and read what it is, and press **Reset view** to get the home view back
with nothing selected.

```sh
pnpm install
pnpm dev      # http://127.0.0.1:4173
pnpm build    # static build in dist/
```

Add a git ignore file for the installed dependency folder and `dist/` before a first commit.

## Art direction

`knowledge.style-felt-wool` for the material identity (sheen-driven fibre rim, matte 0.86–1.0
roughness, no metal, dyed-patch palette) over `knowledge.lighting-mood-dusk-golden-hour` for the
light (low warm key at 6°, cool sky fill, long shadows, ACESFilmic at exposure 0.9). The full look
statement, every departure from those records, and the anti-slop opt-outs are in
[docs/design-system.md](docs/design-system.md).

## Layout of the source

| Path | What it owns |
| --- | --- |
| `src/look.js` | `LOOK` (the pasted `defaults.values`) and the village plan constants |
| `src/terrain-felt-ground.js` | the height field, the felted ground, the river and the lane ribbon |
| `src/felt-material-pass.js` | one pass that re-makes every kit material as felt |
| `src/village-buildings.js` | the ten structures and where they stand |
| `src/village-dressing.js` | lanterns and their practicals, props, planting |
| `src/village-creatures.js` | four walkers on routes cut from the lanes |
| `src/selection-controller.js` | picking, the marker, the panel readout |
| `scene.js` | sky, fog, environment, plan, motes, update order |
| `main.js` | renderer, views, render loop, controls — scaffold wiring |
| `kits/`, `rigs/` | copied unchanged out of the skill's templates |

## Verification

`docs/validation-report.md` lists what was run, what was observed in the captures under
`captures/`, and what is still unverified (performance on real hardware, the mobile breakpoint).

Everything here is fiction: no real place, trade, date or structure is depicted, and the kit
blueprints certify no historical construction.
