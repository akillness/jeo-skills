# Wood Lighting Scorecard - Demo Prompts

## Minimal prompt

Use $3d-wood-lighting-scorecard to light this carved timber like a Kibori station: one warm window key in a dark room, grain that shows under raking light, soft shadows that touch, faint shafts with dust, and score the render out of 10 until every item reaches 8.

## Recreate the demo

Use $3d-wood-lighting-scorecard to recreate **Wood Lighting Scorecard** as one standalone HTML file. Treat `demo.html` as the visual, motion, responsive, accessibility and performance reference.

### Experience

- A dark workshop bench at dusk. A tall window in the back wall lets one warm shaft of light fall diagonally across the room and land as a bright parallelogram on the bench. Everything outside that pool stays dark.
- On the bench, in the pool: a hinoki plaque propped on an off-cut, its left third planed plain and its right two thirds carved with seigaiha waves; a keyaki post standing at its right end, throwing a long soft shadow across the bench; a kashi mallet lying in front with the handle toward the camera.
- Layer switches on the right (a panel under the canvas on a phone): wood grain, texture field 1024 vs 16, studio reflections, warm key, cool fill and rim, soft and contact shadow, light shafts, rays on the wall, dust in the beam, ACES grade. Beneath them a live score out of 10 for eight rubric items, each with a target mark at 8, a total, and the lowest item. "Flat baseline" turns everything off, "All on" restores it.
- The title is `Wood lighting scorecard` in Instrument Serif with "lighting" italic in gold, the stack line `Three.js · WebGL · GLSL` above it, two sentences of copy under it, bottom left. Palette from Kibori: ink #f2ece2, seal #9d382c, ground #0a0806, and a warm gold #d9a566 as the one accent (the demo's own, not Kibori's).

### Implementation contract

- Three.js 0.169 from unpkg via an import map, `RoundedBoxGeometry` from `three/addons`. WebGL2, `antialias:false` canvas, half-float MSAA-4 scene target, `NoToneMapping`, ACES written by hand in the last pass with sharpen, vignette and a 1/255 dither.
- Wood: `MeshPhysicalMaterial` patched with `onBeforeCompile` (`map_fragment`, `roughnessmap_fragment`, `normal_fragment_maps`, and the clearcoat roughness). One 1024x1024 periodic noise field baked once into a mipmapped render target drives ring drift with pith wander, knots, pores, fibres, rays, checks and bump. Object-space coordinates, per-material seed. A 16 px field is the "low" switch.
- Environment: `PMREMGenerator.fromScene` of a dark box with a 12-pane window of radiance (3.8, 3.55, 3.05) placed where the real window is, plus four dim cards. Set `material.envMap` on every wood material.
- Key: `DirectionalLight` 0xfff2df at 2.0, 4096 shadow map, static (`autoUpdate=false`), `bias -0.00025`, `normalBias 0.0045`. The wall is built from four boxes around the opening and casts, so the light pool is the window's shape. Fill 0xaec7df 0.60, rim 0xffdeb4 0.72, hemisphere 0.19.
- Shafts: five additive `ShaderMaterial` planes along the light direction, colour (1, 0.82, 0.56), `pow(1 - across, 2.2)` across, `fbm` along, a foot fade, a world-height fade so they never cut the timber, gain 0.13. Ten dimmer wide planes along the wall. 1900 dust points with `17 / depth` size, bokeh falloff, gated to the beam axes.
- Contact pools: radial alpha ellipses at y 0.0012 under the plaque, wedge, post and mallet.
- `metrics.js` inlined verbatim and run on a 640 px downsample of the canvas every 1.4 s and on every switch; `window.KiboriScore` exposes `regions()`, `render(nx, ny)`, `freeze()`, `set(id, on)`, `setAll(on)`, `layers()`, `texelPerPx()` for `scorecard.mjs`.
- Regions are projected from world points (plaque frame for grain, sheen and lit patch; post shadow strip and its lit neighbour; the plaque's front edge for the contact line; the window sill's corner for the beam strips), so they follow the camera.

### Behaviour and accessibility

- DPR cap 2, `ResizeObserver`, `dt` clamped to 1/30 s, pause on `document.hidden` and off-screen, first frame after a pause `dt = 0`.
- Reduced motion: time fixed at 5.2, no camera sway, no dust drift; render on demand; the switches and the score still work.
- Pointer sway of the camera by +-0.08 rad; slow idle sway of 0.045 rad.
- Switches are real checkboxes with a visible gold focus ring; the score is `aria-live`. Below 820 px the canvas takes the top 54% and the panel scrolls beneath it with a score chip on the canvas. No horizontal scroll at 390 px.
- Type never under 11 px. Console clean at 1440x900 and 390x844.

### Verify

Run `node references/scorecard.mjs`. Expect baseline about 3.7, all layers on about 8.8, seven of eight items over 8 and the specular item short at about 6.5. Turning off any of grain, key, shadows or the ACES grade should cost the items it feeds.

## Remix prompt

Use $3d-wood-lighting-scorecard to change the subject, palette and composition while keeping the mechanism and the budgets. Replace the plaque scene with a lacquered kumiko screen leaning on a tansu, light it by a low evening window at camera right, and make the room colder (key 0xffe6c8, fill 0x9fb4d0). Keep one key, a real opening that casts, the environment window where the real one is, shafts faded by height, ACES once at the end, a 4096 static shadow map, contact pools, and dust gated to the beams. Write a new `regions()` for the new objects, keep `metrics.js` and the rubric anchors, score the flat baseline first, run the ablation, and iterate until every item is 8 or higher or say which one plateaued and why.
