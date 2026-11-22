# Templates

Runnable starting points. Copy what you need into the user's project, then edit it there. Each file
opens with a comment saying what to change; the rest is wiring that is meant to survive.

## Copy-out rule

A packaged skill ships text files only — no installed dependency folder, no hidden files, no build
output. Nothing here can be installed or built in place. Copy first, install second:

```sh
cp -r <skill>/templates/scaffold-vite-threejs my-scene
cp -r <skill>/templates/rigs my-scene/rigs
cd my-scene && pnpm install && pnpm dev
```

The same applies to a project that already exists: copy the rig or the doc template into it rather
than importing across the skill folder, whose path is not stable.

## Index

| Path | Use it for |
| --- | --- |
| [scaffold-vite-threejs/](scaffold-vite-threejs/README.md) | A new scene: Vite + three 0.180, renderer defaults, demand-driven loop, viewer contract. |
| [rigs/camera-orbit-follow.js](rigs/camera-orbit-follow.js) | Orbit camera with damping, named views, a 0.9 s focus tween and follow that yields to the user. |
| [rigs/lighting-sun.js](rigs/lighting-sun.js) | Outdoor key/fill/rim. Defaults: dusk golden hour; overcast soft is commented in the file. |
| [rigs/lighting-night-lantern.js](rigs/lighting-night-lantern.js) | Night by falloff: moon, hemisphere fill, capped practicals with an emissive-only fallback. |
| [rigs/lighting-studio.js](rigs/lighting-studio.js) | Product studio: RoomEnvironment plus three RectAreaLight panels and one contact shadow. |
| [rigs/post-stack.js](rigs/post-stack.js) | Bloom, vignette and optional depth of field via pmndrs `postprocessing`. Read its tone-mapping note. |
| [kits/kit-lod.js](kits/README.md) | One `THREE.LOD` per object from the tiers you built, plus the T0 blockout proxy. |
| [docs/design-system.md](docs/design-system.md) | The look statement and the decisions a later edit must not undo. |
| [docs/scene-spec.json](docs/scene-spec.json) | What the scene claims, which records it used, and what its runtime is. |
| [docs/validation-report.md](docs/validation-report.md) | What ran, what was observed, what is still uncertain. |
| [checklists/visual-anti-slop.md](checklists/visual-anti-slop.md) | Seventeen hard defaults for any rendered view, each with its cheapest check. |
| [checklists/inspection-per-frame.md](checklists/inspection-per-frame.md) | The captures a scene owes and the per-frame checks to run on each one. |

## How they fit together

The scaffold imports the rigs. `LOOK` in `main.js` and the rig defaults are the same catalog
numbers, so change them together. The captures the checklists ask for come from
`python3 scripts/capture.py --dir <build dir> --all-views`, which depends on the viewer contract the
scaffold installs. The three documents in `docs/` travel with the artifact: keep them with the scene
so the next edit knows which choices were deliberate.
