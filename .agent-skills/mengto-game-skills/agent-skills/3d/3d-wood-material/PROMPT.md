# Prompts for 3D Wood Material

## Minimal prompt

Use $3d-wood-material to make the timber in my Three.js scene procedural: growth rings with per-ring widths, cathedral figure, pores, rays and tool marks in one patched MeshPhysicalMaterial, with an oil or lacquer finish, so a 5 cm close-up still reads as wood. No tiled image textures.

## Recreate the demo

Build `demo.html`: a single file, Three.js 0.169 from an unpkg import map, the Kibori dark workshop staging (#0a0806, Instrument Serif and Inter, cream ink, gold accent, hairline outlined controls).

Scene. A bench of near-black timber in front of a wall of charred siding boards. On the bench, a 1.7 x 0.16 x 0.62 plank with the grain along x, a 0.42 cube with the grain up (its top is end grain), and four 0.44 x 0.06 x 0.30 swatches, one per species (keyaki, sugi, hinoki, kuri). Every part rests exactly on the bench (y = h/2), is a chamfered box with radius min(w,h,d) x 0.055, and casts a shadow; the shadow map is rendered once. One warm directional light from the upper left, a PMREM studio environment built from HDR window cards, ACES tone mapping, exposure 1.15, DPR capped at 2.

Material. Copy `woodMat()` from Kibori: one 1024 squared periodic noise field bake, the `WOOD_GLSL` block (rings, latewood, pores, fibres, rays, checks, knots, tool marks, end grain), and `bumpNormal`. Give each part its own seed (saved and restored serial), and a distinct `customProgramCacheKey` per finish. Finishes: raw, oil (pow 1.16 and rough x0.88, clearcoat 0.10), wax (clearcoat 0.22), urushi (the workshop's lacquer wrapper, clearcoat 0.42).

Controls (real form elements, visible focus): species radios, finish radios, sliders for tool marks (0 to 1.6, default 0.5), relief (0 to 3, default 1.8) and grain scale (0.5 to 2), camera buttons Overview, Macro face (0.34 units) and Macro end grain (0.30 units), and a checkbox that swaps every part to a single tiled canvas colour map with roughness 0.32. A live readout of camera distance and device pixels per unit.

Camera. Custom orbit: drag, wheel (0.10 to 6), arrow keys, damped; slow auto orbit only in Overview until touched. Reduced motion: no orbit, camera moves snap. Pause when hidden. Title `Procedural Wood Grain`, kicker `Three.js · WebGL · GLSL`.

Check at 1440 x 900 and 390 x 844, macro face and end grain at 4,000 px per unit, grazing at elevation 0.08, reduced motion, and a clean console.

## Remix prompt

Keep the mechanism: one mip-filtered noise field read at several stretches, feeding colour, roughness and relief together, each layer faded by its own screen footprint, per-part seeds, arrises rounded. Change the subject and staging: a walnut cutting board on a pale linen counter in soft north light, or an oak barrel with hoop-bent staves and burnished iron bands, or a sanded pine skateboard deck on a concrete floor. Choose new species colours and ring frequencies from real ring spacing at your model's scale, a matt hand-rubbed oil finish, and a new palette and type. Keep the close-up mode, the failure switch, the reduced-motion still, DPR cap 2 and hidden pause.
