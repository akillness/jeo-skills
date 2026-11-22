# Vite + Three.js scaffold

A runnable scene: renderer, demand-driven loop, camera rig, sun rig, gradient sky, scale cues,
jittered scatter, emissive motes and the capture contract. Change `LOOK`, `VIEWS` and `scene.js`;
leave the wiring alone.

## Copy it out first

This folder lives inside a packaged skill, which ships only text files: no installed dependency
folder and no hidden files (there is no `.gitignore` here — add one after copying). Install nothing
in place.

```sh
cp -r <skill>/templates/scaffold-vite-threejs my-scene
cp -r <skill>/templates/rigs my-scene/rigs      # main.js imports ./rigs/*
cd my-scene
pnpm install
pnpm dev            # http://127.0.0.1:4173
pnpm build          # writes the static build to dist/
```

Add a `.gitignore` with the installed dependency folder and `dist/` before your first commit.
Pinned versions: `three@0.180.0`, `postprocessing@6.39.4` (the version `pnpm add postprocessing`
resolved on 2026-09-08; its peer range is `three >= 0.168.0 < 0.186.0`), `vite@7.1.5`.
Rename `"name"` in `package.json` to your scene.

## Where the numbers come from

`LOOK` at the top of `main.js` is a `defaults.values` block pasted from the catalog, not invention:

```sh
python3 scripts/search.py "nostalgic warm unhurried" --kind lighting-profile
python3 scripts/resolve.py knowledge.lighting-mood-dusk-golden-hour knowledge.style-painterly
```

The shipped values are `knowledge.lighting-mood-dusk-golden-hour` (sky, fog, tone mapping,
environment, post) plus `knowledge.style-painterly` (camera, palette). Replace the whole block when
you change mood — half a mood reads as a mistake. `createSunRig` carries the matching light values,
so change the rig and `LOOK` together. Every number is a starting point you may tune; record the
departure in [design-system.md](../docs/design-system.md).

## Views, controls, capture

`VIEWS` in `main.js` is a map of `name -> {position, target}`. Adding an entry adds a button and a
name the capture script can drive. Keep `overview` first: it is the home view `Reset view` returns
to. `viewer-contract.js` publishes exactly two globals — `window.__sceneReady` (true after the first
rendered frame) and `window.__viewer = {views, setView(name)}` — and the capture script needs both.

```sh
pnpm build
python3 scripts/capture.py --dir dist --all-views --click "#control" \
  --motion-check 2000 --expect-motion --out captures
```

`--motion-check` takes a second frame two seconds after `default.png` and `--expect-motion` exits 5
when they are identical: the check that catches a scene which renders once and then freezes.

Then work through [visual-anti-slop.md](../checklists/visual-anti-slop.md) and
[inspection-per-frame.md](../checklists/inspection-per-frame.md) against the PNGs.

## Deliberate choices to keep

- Pixel ratio capped at 2, PCF soft shadows, `SRGBColorSpace` output, tone mapping from `LOOK`.
- Demand-driven loop: a still scene schedules no frame, so a capture is the frame you looked at.
  Two rules keep "still" from meaning "dead", and both are load-bearing:
  the first frame after idle is charged one frame's worth of time, never `dt = 0` (a zero dt makes
  `scene.js`'s `update()` answer "nothing moved" and parks the loop forever); and every wake-up
  source is wired to `invalidate` — the camera rig gets it as an argument and fires it on
  `start` / `change` / `end` and on focus tweens, `viewer-contract.js` fires it in `setView`, and
  the pause, reset and resize handlers call it. If you add a control, wire it to `invalidate` too.
- One thing always moves: the emissive motes drift in `scene.js`. Replace them with your own idle
  motion rather than deleting them — `update()` returning `true` is what keeps the loop alive.
- Post is **off** by default. Read the tone-mapping note at the top of
  [post-stack.js](../rigs/post-stack.js) before turning it on.
- Reduced motion starts paused; `#control` toggles ambient motion; `#reset` restores the home view.
- Everything is procedural: no remote fonts, textures or models at runtime.
