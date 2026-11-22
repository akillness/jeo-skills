# 3D Cloth Material — Demo Prompts

## Minimal prompt

Use $3d-cloth-material to make this cloth read as woven linen, not a plastic sheet: a thread-level weave, sheen that stays small, folds that do not stretch the texture, and a hem with visible thickness.

- Use $3d-cloth-material for a silk banner in a dark room with a lit paper window behind it, so the thin cloth glows where it turns away.
- Use $3d-cloth-material to add a heavy wool blanket with a twill weave, a stitched seam and a raw fringe.
- Use $3d-cloth-material to fix a stretched, blurry fabric texture on a draped model: rebuild uv in rest metres and re-bake the weave.

## Recreate the demo

Use $3d-cloth-material to recreate **Woven Cloth 布織** as one standalone `demo.html`. Treat the file in this folder as the visual, motion, responsive, accessibility and performance reference.

### Scene

- A dark warm room (`#0a0806`): plaster wall 0.78 m behind the cloth, a dim floor, a dark wooden rod at y 1.16 with ball finials and two round brackets to the wall, and a paper window with kumiko bars at the right of the wall glowing warm.
- A 2.0 × 1.95 m cloth hung from nine fabric tabs over the rod, with a slow wind. Key: a warm SpotLight from the front left with a 2048 shadow map, so the folds throw soft shadows on the wall. A cool low fill, and a warm directional "window" light from behind that both lights the folds facing it and shines through thin cloth.
- Three.js r169 from unpkg via an import map; `ACESFilmicToneMapping`, `PCFSoftShadowMap`, sRGB output, anisotropy at the device maximum up to 16.
- Type: Instrument Serif for the title, Inter for copy and controls, Shippori Mincho for 麻 絹 毛 and 布織, nothing under 11 px. Palette: ink `#f2ece2`, hairlines `rgba(242,236,226,.16)`, one vermilion accent `#c4483a`.

### Cloth

- Rows of 160 samples and 120 rows. Per row, a tangent angle `α(s) = av·env·(sinθ + 0.16 sin(2θ+0.8)) + 0.26·av·sin(2.7θ+…) + 0.12·av·sin(5.4θ+…)`, `θ = k s + wp·sin(0.43ks+1.7+0.8vn) + 0.6·sin(0.19ks+4vn) + 1.4vn`, integrated to x and z; subtract the row's mean z so rows do not walk. Amplitude `av = amax·fullness·(0.55+0.45·smoothstep(0,0.3,vn))`.
- Wind: billow `w·(0.045+0.10·gust)·sin(πs/W)·vn^1.4`, a travelling ripple `0.012·sin(6.5s − 2.4t + 2.1vn)·vn²`, a pendulum swing and a phase wobble inside θ. Gust `0.55 + 0.45·sin(0.37t + 0.9 sin 0.11t)`.
- Free edges turn under on a half circle; the bottom hem returns up the back; linen ends in a raw fray (warp threads kept, weft discarded) plus 520 loose strands.
- Material: MeshPhysicalMaterial with sheen, sheen roughness, sheen colour, anisotropy (silk) and a baked 512² normal map per fabric. An `onBeforeCompile` adds: two-tone warp/weft dye, per-thread tone, cavity, dye wear on thread tops, stitches and a seam drawn in cloth metres, an anisotropic wrinkle bump, fold AO on indirect light and backlit transmission.

### Controls

Fabric radios (麻 Linen, 絹 Silk, 毛 Wool), sliders for wind, fullness and window light, radios that strip a layer (All, No weave, No sheen, Flat sheet) and a Macro close-up toggle that flies the camera 0.36 m off a fold beside the seam and fades the title copy. Announce every change in an `aria-live` region. Fabric changes tween fold and material numbers over about 0.6 s and swap the weave at once.

### Acceptance

- The first screen shows folds with soft self-shadow, a visible weave at macro, sheen along the crests and a stitched seam.
- Flat sheet mode must clearly look worse: no weave, no sheen, no wrinkles, almost no folds.
- Under reduced motion one still frame is drawn and the controls still re-render it. Hidden tab pauses. DPR cap 2, dt clamp 1/30.
- Verify at 1440×900 and 390×844 with a clean console, and macro on all three fabrics.

## Remix prompt

Use $3d-cloth-material to make a *noren* shop curtain in a rainy alley at night: cotton twill, indigo with a white stencil-dyed crest, a slit up the middle so the two halves swing separately, cold rim light from a lantern behind, and a cyan-black palette instead of amber. Keep the mechanism: fold curves integrated from a tangent angle so uv stays in rest metres, a baked interlacement normal map, small sheen, half-circle hems and stitches drawn in the shader, and light through the gaps between threads. Keep the budgets: 160×120 rows, DPR cap 2, dt clamp 1/30, reduced-motion still, hidden pause.
