# 3D Paper Material: prompts

## Minimal prompt

Use $3d-paper-material to make a hung sheet of washi in Three.js that survives a macro close-up: long kozo fibres, a torn deckle edge with pulled-out fibres, visible thickness, a rolled corner and a crease, sumi ink that wicks into the fibres, and warm back-light passing through where the sheet is thin. Add toggles for washi, cotton rag and kraft, a back-light switch and a macro mode. No image files.

## Recreate the demo

Build `demo.html` as one self-contained page. Three.js 0.169 from unpkg via an import map, Instrument Serif, Inter and Shippori Mincho from Google Fonts, everything else inline. Dark charred-wood room, warm key spot from upper left, a faint fill, and a lamp behind the sheet that comes on with the back-light switch. Title "3D Paper Material" with 和紙, a stack line, one italic sentence, a bottom-left control panel.

1. Scene units: 1 unit = 134.8 mm; the sheet is 1.55 x 2.2 (A4) inside a geometry rectangle 0.06 larger on each side. Camera FOV 28. Renderer antialias on, ACES tone mapping, DPR capped at 2.
2. Bake a full-screen shader to a half-float target (`samples: 0`, mipmaps, anisotropy 8) at 990 px/unit: formation `fbm(q*2.6,4)*0.62 + fbm(q*7.4,3)*0.38`; kozo fibres `ridged` on lattices (washi 1.9x54 and 44x2.3), the lattice warped by 0.014 and rotated by `(gnoise(q*2.1)-0.5)*1.5`; a finer set at 2.7x frequency; bark flecks from a cell hash rounded into ellipses; tooth noise; laid and chain lines for cotton; a crease line. Output height, formation, fibre and fleck.
3. Model each edge with `tearLine` (integer-sample tear, 3400 samples per unit) plus fray fibres and a feather strip as records. Paint four canvases at any resolution: silhouette with fray, thin strip, ink (木 and 彫 in Shippori Mincho 800, plus a dry-brush enso), and a shadow-blurred silhouette for edge age. Merge into an RGBA `DataTexture`.
4. Geometry: plane 168 x 240, hung bow, mountain crease, two pin dimples, cylinder roll of radius 0.23 and angle `2.6*curl`. Three copies behind, offset along the normal by up to the stock thickness. Two lacquered pins.
5. Material: MeshPhysicalMaterial (sheen, alphaToCoverage, no alphaTest) patched with `onBeforeCompile`: albedo from the fields, toast and foxing, ink, a world-unit bump replacing `bumpmap_pars_fragment`, and back-light transmission added to emissive.
6. Macro: a second bake and mask over a 0.5 unit window at 1536 px, blended over the base. Three focus targets: deckle edge, ink bleed, fibres. The camera eases between overview and macro poses.
7. Reduced motion draws a still and re-renders only on input. Pause on `document.hidden`.

Check at 1440x900 and 390x844, in macro, in reduced motion, with a clean console.

## Remix prompt

Keep the fibre field, the torn-edge model, the layer stack, the world-unit bump and the transmission maths. Change the subject, palette and composition. For example: a handmade cotton-rag invitation with a gold-brown foxed edge lit by a single window, a stack of three kraft wrapping sheets fanned on a table with contact shadows between them, or a hanging paper lantern panel with a lattice in front. Replace the kanji with your own ink layout, and keep the budgets: base 990 px/unit, macro window 3072 px/unit, four layers, DPR 2.
