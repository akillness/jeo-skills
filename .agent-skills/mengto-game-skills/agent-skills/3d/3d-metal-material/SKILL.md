---
name: 3d-metal-material
description: >
  Build hyperrealistic PBR metal in Three.js: steel, brass, gold, copper and iron as true conductors (metalness 1, measured F0 tint, no albedo) with roughness-varied finishes (polished, brushed anisotropic, aged with patina and worn edges) lit by a dark HDR studio of real bright window cards prefiltered with PMREM. Use when metal looks like grey plastic, a dull blur, or a black hole; when blades, tools, rings, ingots, hardware or product metal need reflections with edges and structure; or when a finish needs scratches, streaks, fingerprints and bevels that catch light.
---

# 3D Metal Material

**Mechanism:** a conductor has no colour of its own, so it looks like metal only when a dark environment holds a few very bright, hard-edged things to reflect, and the surface then bends those reflections with roughness that varies across it. Remove the bright cards and the same steel goes flat grey; remove the roughness variation and it goes CG-clean.

Boundary. This skill is the material and the environment it reads. Reach for `3d-specular-rim-glow` when the job is one bright edge catch and halo on a product, `3d-high-resolution-textures` when you ship authored PBR texture sets and need texel density and mip budgets, `3d-ultra-realistic-water` for water. Siblings `3d-wood-material`, `3d-cloth-material` and `3d-paper-material` cover the non-metal surfaces that usually sit next to metal; use them for the bench, handle or wrapping. The demo has a bench and a chisel handle only as staging.

Verified stack of the demo: Three.js r169 (`three@0.169.0`), WebGL 2, GLSL patched into `MeshStandardMaterial`/`MeshPhysicalMaterial` with `onBeforeCompile`, `PMREMGenerator`, a HalfFloat MSAA target and a hand-written ACES pass. No post-processing library.

## Build order

Do these in order; each one fixes a named failure the previous step cannot.

1. **Conductor, not painted.** `metalness: 1`, `color` = the metal's F0 (linear reflectance at normal incidence), nothing else in `color`. A bright base colour turns lit faces into white paint, and metalness < 1 lets a diffuse term leak in as plastic.
2. **A dark room with bright cards.** Build the environment as a real `Scene` of `MeshBasicMaterial` planes with `toneMapped:false` and HDR radiance above 1, on a near-black background, then `PMREMGenerator.fromScene`. A bright uniform sky makes every reflection the same mean tone, and raising `envMapIntensity` only lifts that mean. A canvas equirect capped at display white cannot make a window brighter than the paper. Cards used in the demo:

   | card | size, position | linear radiance |
   | --- | --- | --- |
   | window, 4 x 3 panes | 1.08 x 1.20 panes on 1.30 x 1.47 pitch, at (-5, 4.2, 4.8) | 3.8, 3.55, 3.05 |
   | cool side card | 3.0 x 5.4 at (6, 1.6, 2) | 0.52, 0.68, 0.90 |
   | warm back card | 2.0 x 4.6 at (2.5, 2.2, -5.5) | 1.50, 1.22, 0.88 |
   | top card | 7.5 x 2.2 at (0, 6, 0) | 0.52, 0.55, 0.60 |
   | floor bounce | 9 x 9 at (0, -4, 0) | 0.18, 0.12, 0.07 |
   | background | | 0.045, 0.050, 0.060 |

3. **Aim a card at the object.** The eye sees the reflection of whatever lies along the mirror direction. The hero plate is turned to the bisector of eye and window (yaw -0.38, pitch -0.36 rad). Left face-on to a dark region, the same polished steel reads black.
4. **Vary the roughness.** Roughness is the finish, not the constant. Layer low-frequency smears (fingerprints), two angles of micro-scratches, and a fine grain into `roughnessFactor`, and fade each below its pixel footprint with `fw = max(length(dFdx(p)), length(dFdy(p)))`. Uniform roughness is what makes metal look rendered.
5. **Give it a bevel.** Use a chamfered box (round the arrises 1 to 3 mm at object scale, 3 to 5 segments). A sharp 90 degree edge has no normals between faces, so it catches no highlight. Above 6 to 19 percent of the smallest side it reads as soap.
6. **Ground it in darkness.** Contact shadow blobs and a shadow-casting key light on a dark bench. Metal on a bright ground reflects the ground and loses contrast.
7. **Tone map last.** Render into a HalfFloat target, add the bloom, then ACES and the sRGB encode by hand. Keep `renderer.toneMapping = NoToneMapping` while rendering to the target.

## Constants

F0 goes in `color` as linear values (`Color.setRGB(r,g,b, LinearSRGBColorSpace)`), so you do not lose the tint to an sRGB round trip.

| metal | F0 linear | aged surface tint (`uPatCol`) |
| --- | --- | --- |
| steel | 0.56, 0.57, 0.58 | rust 0.16, 0.055, 0.02 |
| brass | 0.89, 0.72, 0.36 | dark tarnish 0.09, 0.055, 0.02 |
| gold | 1.00, 0.71, 0.29 | dirty wear 0.13, 0.085, 0.03 |
| copper | 0.95, 0.64, 0.54 | verdigris 0.10, 0.34, 0.27 |

| finish | base roughness | envMapIntensity | extra |
| --- | --- | --- | --- |
| polished | 0.09 (0.045 to 0.6 after variation) | 1.0 | smear +0.11, scratch +0.24, grain +-0.025 |
| brushed | 0.26 (0.10 to 0.75) | 0.72 | `MeshPhysicalMaterial.anisotropy` 0.85, streaks 520 and 1500 cycles per unit along the grain |
| aged | 0.36 (0.10 to 0.95) | 0.85 | patina lowers metalness to 0.28, raises roughness +0.42, bump 0.9 |

Intensities fall as roughness rises because a rough finish spreads the same window over more of the surface and clips it. Kibori's own steel is `envMapIntensity 0.94`, roughness 0.16 to 0.5, F0 `0xc9ced2`; its baked floor room for a polished blade uses `3.0` (the map is dim, so the gain is high).

Bloom: threshold 5.0 in linear, clamp 1.0, gain 0.22, quarter resolution. Lower thresholds turn one hot lamp glint into an orange halo above the object.

## Symptom-first gotchas

- **Metal looks like grey plastic, and `envMapIntensity` changes nothing.** On r163+ `material.envMapIntensity` is ignored when the environment comes only from `scene.environment`. Set `material.envMap = envTexture` too, and re-bind it whenever the environment is rebuilt. Sweep it to an extreme and diff if you doubt it.
- **Reflection shows a soft cloud, no window bars.** PMREM `fromScene` renders a 256 px cube and its `sigma` blurs. Kibori's 0.06 unit mullions and sigma 0.025 vanished. Widen the gaps to 0.22 units and use sigma 0.006.
- **Window reflection is a flat white block.** ACES rolls linear 1.0 to about 204, so a window at 3.8 times F0 clips. Cut `envMapIntensity` for rougher finishes (table above) and let the panes read as luminous with bars, not as a paper rectangle. Measure `>250` percent on the object's own mask, not on the frame.
- **Polished blade reflects a black nothing.** A face that looks up at a dark ceiling has nothing to show. Aim it at a card, or bake a floor room (Kibori's blade room: near black above 0.07 to 0.12, warm boards, five soft sun patches with kumiko bars, 1024 x 512 equirect, about 424 ms once) and give only that object the map.
- **Rough metal goes flat and dark, not satin.** Metal needs the roughness spread; a constant 0.4 with no variation is a matte grey. Add the layered terms above.
- **Detail shimmers or disappears at distance.** Every high-frequency term needs a footprint fade (`smoothstep(0.15..0.8, fw * frequency)`), or it aliases to noise. The macro shot only resolves the 0.4 mm grain because the camera is close.
- **Anisotropy does nothing.** It needs `MeshPhysicalMaterial` and UVs; streak your roughness along the same axis as `anisotropyRotation`, or the highlight stretches across the streaks.
- **Aged patina looks like camouflage.** One big fbm blob field. Multiply a large region mask, a fine fbm at about 70 cycles per unit and a dust term, and wear it off the bevels (`edgeK` from the object-space normal: `1 - max(|n.x|, |n.y|, |n.z|)`). Drop metalness inside the patina or it stays mirror.
- **A custom shader program is shared between finishes.** Set `customProgramCacheKey` per finish, or `onBeforeCompile` for the second finish is never used.
- **GLSL inside a JS template with a `//` comment.** In a one-line string it comments out the rest of the shader and the mesh silently draws nothing. Use `/* */`.

## Lifecycle and cost

- Reduced motion: no orbit, light parked at -0.3 (the window lands across the plate), one still render on every control change. Controls stay live.
- Pause on `document.hidden`; reset the time base on resume; clamp `dt` to 1/30 s; cap DPR at 2; size from a `ResizeObserver`.
- Measured on an Apple GPU through ANGLE Metal, 1440 x 900, 4x MSAA HalfFloat target: 1.1 ms per frame polished, 2.9 ms brushed, 3.1 ms aged at DPR 1; 9.4 and 13.0 ms at DPR 2. 13 shader programs and 9 textures alive after cycling all three finishes. The expensive part is the fragment noise on a full-screen-sized plate, not the environment. The cheap lever is DPR; the thing that does not matter is bloom at quarter resolution. Boot is about 1.4 s cold, of which the floor-room bake is 0.42 s.
- Contrast, not brightness, separates real from grey: the same plate measured mean luminance 174 under the studio and 169 under a flat grey room, but standard deviation 76 against 23.

## Provenance

Extracted from KIBORI 木彫, a scroll-driven three.js woodworking film where a chisel blade, saw plate and plane iron had to hold up at macro range in a dark workshop. Ported unchanged: `steelMat` (forge, polish lines, lamination), `buildEnvironment` (with the two window changes above), `chamferBox`, the blade-room bake and its `envMapIntensity 3.0`, the crowned blade normals, the ACES pass. New in this skill: the finish layers, the metal library, the environment switch.

## Self-score

Anchors: 0 flat colour, 3 PBR with a stock environment, 5 structured reflections but uniform roughness, 7 finish variation and bevels, 9 macro-legible with contact, 10 indistinguishable from a photograph.

| axis | score | evidence |
| --- | --- | --- |
| reflections have structure | 8 | window bars, cool and warm cards visible on plate, ball and ring |
| surface texture at macro | 7 | scratches, grain and streaks resolve; no normal-mapped pitting on polished |
| edge and bevel highlights | 7 | chamfer arrises catch a continuous line |
| contact and darkness | 7 | shadow map plus blobs; no true AO |
| tone and no blown highlights | 7 | window clips on flat plate at some angles |
| overall | 7 | an honest 7; a photograph would still win on micro-pitting and dust |
