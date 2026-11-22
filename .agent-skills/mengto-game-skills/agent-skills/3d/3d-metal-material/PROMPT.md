# 3D Metal Material: prompts

## Minimal prompt

Use $3d-metal-material. Make the metal in my Three.js scene hyperrealistic: metalness 1 with a measured F0 tint and no albedo, a dark PMREM studio with bright window cards to reflect (set `material.envMap` as well as `scene.environment`), roughness that varies across the surface (scratches, streaks, fingerprints), chamfered edges, and a dark bench so it is grounded. Give me polished, brushed and aged finishes for steel, brass, gold and copper.

## Recreate the demo

Build one self-contained `demo.html` titled "3D Metal Material", in the Kibori look: near-black warm page (#0a0806), Instrument Serif headline with the second word in italic gold (#dbad64), Inter 11px letter-spaced labels, cream ink (#f2ece2). Load `three@0.169.0` from unpkg through an import map. Stack line above the title: "Three.js · WebGL · GLSL · PMREM studio".

Scene, on a dark oak bench (canvas-drawn grain, `Fog(0x0a0806, 1.3, 3.3)`), camera 34 degrees at (0, 0.30, 0.92) looking at (0, 0.085, 0.02):
- a crowned 0.36 x 0.23 x 0.014 chamfered plate standing in a walnut stand, yawed -0.38 and pitched -0.36 rad so it mirrors the window; a chamfered ingot; a chisel (0.24 blade, lathe ferrule, dielectric handle) touching the bench at tip and handle; a 43 mm ball bearing; a torus ring.
- environment: a `Scene` on background (0.045, 0.05, 0.06) holding a 4 x 3 window of 1.08 x 1.20 panes at (-5, 4.2, 4.8) with radiance (3.8, 3.55, 3.05), a cool card (0.52, 0.68, 0.90), a warm back card (1.5, 1.22, 0.88), a grey top card and a dim floor card, all `MeshBasicMaterial` with `toneMapped:false`; `PMREMGenerator.fromScene(studio, 0.006, 0.1, 40)`. Bake Kibori's floor room (dark equirect, five soft sun patches with grid bars) as a second environment and add a flat grey room as the failure case.
- materials: `MeshStandardMaterial`/`MeshPhysicalMaterial`, metalness 1, F0 (steel 0.56 0.57 0.58, brass 0.89 0.72 0.36, gold 1.0 0.71 0.29, copper 0.95 0.64 0.54) as linear colours, `onBeforeCompile` layering forge noise, polish lines, fingerprint smears, two-angle micro-scratches and a fine grain into roughness with pixel-footprint fades. Brushed adds `anisotropy 0.85` and x-axis streaks; aged adds region x fine fbm x dust patina, metalness dropped to 0.28 in the patina, worn off the bevels by the object-space normal, plus a bump.
- render to a HalfFloat 4x MSAA target, quarter-resolution bloom (threshold 5.0, gain 0.22), then ACES, vignette and grain in a final pass; DPR cap 2.
- controls: Metal (steel/brass/gold/copper), Finish (polished/brushed/aged), Reflects (studio/floor/grey), Light slider with Orbit (env rotation +-1.0 rad around a warm key light), Macro toggle that dollies to the plate's top-left bevel at 22 degrees fov. Reduced motion renders one still with the light parked at -0.3; pause on hidden; dt clamp 1/30.

## Remix prompt

Keep the mechanism (F0 conductor, dark HDR card environment aimed at the object, layered roughness, chamfers, dark ground, tone mapping last) and the budgets (DPR cap 2, dt clamp 1/30, threshold 5.0 bloom, PMREM `envMap` set on each material). Change the subject, palette and composition: for example a titanium watch case on black slate under a single strip softbox, a row of cast bronze door hardware in a cold blue stone hall lit by a low amber lamp, or a hero pour of liquid mercury in a glass lab. Re-derive the cards: pick the one or two you want visible in the metal, size them so their mullions or edges are at least 1.5 degrees wide, aim them by the eye-to-card bisector, and re-tune `envMapIntensity` per finish until less than 3 percent of the object's own pixels exceed 250.
