# Emberfall

An explorable fantasy village on a terraced hillside, twenty minutes before sunset. Eight buildings,
each shaped by the work done inside it; three residents walking their own errands; a drift of
lantern moths around the beacon.

Built with the `3dviz-pro-max` skill: Vite + three 0.180, the skill's scaffold, orbit camera,
sun rig and post stack, and the dusk-golden-hour and painterly-pastoral catalog records.

```sh
pnpm install
pnpm dev      # http://127.0.0.1:4173
pnpm build    # static build in dist/
```

## What is where

| File | Holds |
| --- | --- |
| `village-model.js` | **The authoritative state.** Buildings (program, inputs, outputs, site, tell), lanes, residents. Add a row and the picker, the panel and the list all follow. |
| `main.js` | `LOOK` (the resolved catalog mood) and `VIEWS` (named cameras the capture script drives), plus the scaffold wiring. |
| `terrain.js` | `heightAt` - the one source of ground height. Everything else samples it, so nothing floats. |
| `scene.js` | Assembly: sky, fog, ground, water, lanes, buildings, scatter, creatures. |
| `building-kit.js` | The shared joinery: curled-eave roofs, braced walls, 2.0 m doors, lit windows. |
| `building-programs.js` | One builder per program - the wheel, the flue, the hoist, the louvres. |
| `lanes.js`, `scatter.js`, `creatures.js`, `selection.js`, `materials.js` | Paths, woodland, moving life, picking, surfaces. |
| `docs/` | The look statement, the scene spec and the validation report. Read `design-system.md` before changing anything. |

## Capture

```sh
pnpm build
python3 <skill>/scripts/capture.py --dir dist --all-views --settle-ms 1300 \
  --click "#pick-mill" --click "#control" --click "#reset" --out captures
```

`window.__sceneReady` and `window.__viewer = {views, setView}` are the contract the script reads.

Emberfall is invented. Nothing in it is a historical, structural or ecological claim.
