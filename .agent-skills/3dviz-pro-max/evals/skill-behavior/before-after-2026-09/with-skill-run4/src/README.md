# Lanternfall — a riverside lantern village

A small fictional river town at civil dusk, lit only by paper lanterns. Orbit it, walk the named
views, click any building to select it, and reset the camera when you are lost.

```sh
pnpm install
pnpm dev      # http://127.0.0.1:4173
pnpm build    # static build
```

## Where things live

| Path | What it is |
| --- | --- |
| `main.js` | `LOOK` (the style record's values), `VIEWS`, renderer + demand-driven loop, panel UI |
| `scene.js` | assembles sky, terrain, river, lighting, village, planting, props, walkers |
| `world/terrain.js` | height field, river carve, building pads, ground-following lane ribbons |
| `world/water.js` | planar mirror + two scrolling ripple layers |
| `world/village-plan.js` | the authored site plan: every building, its pad, its blurb |
| `world/village.js` | builds each structure at its quality tier (T3 / GLB / T2) |
| `world/lanterns.js` | lantern posts, hanging paper lanterns, the 12-light budget |
| `world/nature.js`, `world/props.js`, `world/creatures.js` | planting, dressing, walkers |
| `world/selection.js` | pointer picking and the highlight ring |
| `kits/`, `rigs/` | copied out of the 3dviz-pro-max skill; edit here, not there |
| `docs/` | design system, validation report, scene spec — read before changing anything |
| `captures/` | the frames the scene was inspected from |

Two known defects are recorded in `docs/validation-report.md`: the `lane` view's camera sits inside
a building, and the `cottage` close-up has a lantern post on its sight line.
