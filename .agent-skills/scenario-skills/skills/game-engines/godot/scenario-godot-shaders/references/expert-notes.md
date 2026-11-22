# scenario-godot-shaders expert notes

Principles and judgment by expert, with source and timestamp. Full sources: `sources.md`. Items
marked [added] are this skill's own. Items marked "observed 4.7.2" were measured in the live tests
(see `procedures.md`).

## Bramwell, "Simple 3D Water in Godot 4" (XjCh2cN3Mfg)

- Water that does not look like a sliding texture: two seamless cellular noises panned in different
  directions, multiplied, then `pow(x, 1.25)` [00:11:57 to 00:20:57].
- Share the same noise between `vertex()` and `fragment()` so the bright crests sit on top of the
  displaced waves.
- His noise, as shown in the frames at [00:07:23]: FastNoiseLite Cellular, frequency 0.01, Euclidean
  Squared distance, jitter 1, return type Distance, Seamless. `ShaderTools.noise_texture_2d` uses
  the same settings at frequency 0.02 for a 256 px texture [added].
- The plane must be subdivided for vertex displacement; the video uses a 20 x 20 subdivision on a
  small plane. The template expects at least 32, and the test scene uses 159 on 80 m [added].
- The video does not cover depth-based foam; that part of the template is [added] (vertical depth
  from the depth texture, reversed-z).

## Dylearn, "Stylized 3D Pixel Art Grass" (OxsuWDtjuGw)

- Hybrid toon shading: hard bands, with a smoothstep only in a narrow window around each cut,
  removes flicker while keeping the toon look [00:13:42]. Used in `toon()` of the water.
- Quantize TIME, not the rotation, for stepped animation, and give every instance a random phase
  [00:08:01 to 00:09:06].
- Two noise samples with the wind direction rotated plus or minus a divergence and an irrational
  speed ratio never repeat visibly [00:04:09].
- Fixed shader arrays: allocate 64 vec4, zero-fill the unused entries (radius 0 = no effect), update
  on a tick [00:11:47 to 00:13:23].
- Under an orthographic camera, fake perspective in the fragment (scale UV.x), never in the vertex
  [00:05:14].
- `LIGHT_VERTEX` (4.3) moves the lit position without patching the engine [00:01:25].
- Put shared functions (cloud shadow march) in an include file [00:15:09].

## StayAtHomeDev, "BOTW Style Dissolve Shader" (pIwQx8B_zR4) and "Sky Shaders in Godot 4" (SzNmHPr4vf8)

- Dissolve in world or object space, not UV: no seams [00:09:59].
- With world space, movement and scale break the effect: pass the AABB bounds from a script and
  `mix(min, max, amount)` [00:09:59 to 00:12:52].
  - This skill keeps object space and makes `bounds` an instance uniform, so one material serves
    many meshes [added].
  - With one shared `bounds`, the small meshes vanished at once and the big ones never finished
    (observed 4.7.2, before the fix).
- HDR edge: color above 1, EMISSION, Glow in the Environment [00:07:36].
- `depth_prepass_alpha` with `cull_disabled` fixes transparent sorting artifacts and keeps shadows
  [00:01:00].
  - The template uses `ALPHA_SCISSOR_THRESHOLD` instead: an opaque pipeline, shadows that dissolve,
    no sorting [added]. Scissor is still an alpha test, so the mesh loses early-Z like with
    `discard` (docs); swap the material in only for the effect (`dissolve_swap.gd`, P18). Round 2
    correction: the round-1 template comment said scissor keeps the depth prepass, which overstated
    it.
- Sky shaders feed the radiance cubemap: with the ambient or reflection source set to Sky, a sky
  shader changes scene lighting. Use half- or quarter-resolution passes for expensive skies
  [00:01:22, 00:04:27].

## Daniel Ilett, "Making Effects with Godot Visual Shaders" (S1FPSU1sp5E)

- Visual shaders suit prototyping. Code wins for loops, functions and reuse; a
  VisualShaderNodeCustom `@tool` class can inject inline, function and global code into a shared
  node library [00:07:38].
- Inverted-hull outline as a next pass: expand along normals in the vertex stage, Cull Front on the
  pass [00:15:18]. It works on every renderer and version.
- Glow needs emission above 1 [00:10:22].
- The 4.2.1 gaps he hit (no noise node, a swizzle bug) were not rechecked here.

## Godotneers, "Shaderland: Intro to Godot Shaders" (nyFzPaWAzeQ)

- Readable named variables cost nothing at runtime [01:10:09].
- Never compare floats for equality for color keys: mask with `length` or `distance` plus a
  threshold, and use the key as a blend weight to keep anti-aliasing [00:37:51, 00:53:11].
- Do per-vertex work in `vertex()`, per-pixel work in `fragment()`, and pass values with `varying`.

## LowQualityCoding, "Godot 4.5 Stencil Buffer" (8EM0cgfbGp8)

- Stencil reads only work in the transparent pass: reader materials need alpha and a render priority
  above the writer [00:07:35]. The error on screen at [00:07:38] gives the full condition: "Ensure
  the material uses alpha blending or has depth_draw disabled or depth_test disabled".
  - Observed 4.7.2: an opaque reader logs "reads stencil but is not in the alpha queue" when drawn,
    in Forward+ and Compatibility; it compiles fine headless.
- The stencil outline looks broken on low-poly cubes; use dense meshes [00:01:39].
  - Observed 4.7.2: 1 px and broken at the box corners at thickness 0.03; continuous on a sphere at
    0.06.
- Alpha transparency loses shadows in the portal setup; the workaround is a second visual layer and
  a light cull mask [00:09:17].
- The portal content needs `depth_test_disabled`, or the frame around the portal hides it (observed
  4.7.2) [added].

## The Pathfinders Codex, "Texture2DRD with Compute Shaders" (wRa2dojxd1o)

- Texture2DRD needs the MAIN rendering device. Wrap the compute work in
  `RenderingServer.call_on_render_thread`, and drop manual submit or sync there, or crashes come
  intermittently [00:03:07, 00:06:36]. Observed 4.7.2: works, with no errors or leaks.

## DevPoodle, "Compute Shaders Guide" (ry7bv7BY56c) and "Triplanar Mapping" (e3Luf7dXSEY)

- RenderingDevice RIDs are never freed automatically; leaking one per frame slows and crashes the
  game [00:02:21]. The RID handed to Texture2DRD is owned by it [00:14:29].
- A texture format mismatch between GDScript and GLSL silently gives garbage; read the imported
  format (RGBA8 or RGB8) [00:04:28].
- Triplanar: weight by `pow(abs(normal), 8)` normalized by the component sum, and gate the top
  texture with `normal.y > 0` [00:05:06 to 00:09:17].

## Crigz, "Compute Shaders in Godot 4" (5CKvGYqagyI)

- Run compute on a separate thread and parity-test it against the CPU version. In his test, 2048
  squared pixels took 500 ms on the CPU and 8 to 21 ms on the GPU [00:11:24, 00:12:13].
- Format mismatch gives gibberish [00:09:04].
- His video is 2022 (4.0 beta era): the loading code is dated, the principles hold.
- Observed 4.7.2: 1M floats submitted and synced in 1.2 ms (Metal) and 2.4 ms (Vulkan). The local RD
  is null headless and under Compatibility.

## Leszek Nowak, "Shaders and Magic", GodotCon 2024 (B1rseqc52iM)

- Shader maths is not bit-identical across GPU vendors: a shader-driven deterministic simulation
  diverged by one pixel after about 60,000 frames [00:23:39]. Never put lockstep game state in
  shaders.
- A single 2 x 2 white sprite plus a shader can be a planet, a ring or an asteroid field. State
  simulations live in one SubViewport that is not cleared [00:06:29, 00:18:34]; the two-viewport
  ping-pong is obsolete.

## Pixezy, "Hologram Shader" (NSFHaGXvyQs)

- Key screen patterns off `SCREEN_UV`, not distorted mesh UVs. Gate glitches with a tiny `step`
  threshold: the probability equals the threshold [00:01:07, 00:08:46].
- Glow and emission above 1 [00:06:55].

## Code It All (JM09avtMlmE), BucketBrigade (ICvceorRu6k), DitzyNinja (qyOyURVpi4U), Single-Minded Ryan (QfojEwv7iRk)

- Code It All: `SCREEN_TEXTURE` is gone; use a `hint_screen_texture` uniform [00:07:08]. For 2D
  water, choose between waving the whole sprite and masking the top edge by view (side or top-down).
- BucketBrigade: a color swap by threshold, not by equality [00:04:06].
- DitzyNinja: set live global values with `RenderingServer.global_shader_parameter_set`, not
  ProjectSettings [00:00:31].
  - Observed 4.7.2: `ProjectSettings.set_setting` at runtime does not register a global at all.
- Single-Minded Ryan:
  - multiply flash factors by the sprite alpha;
  - per-instance blink needs `resource_local_to_scene` (or an instance uniform);
  - hit-feedback values: blink 1 to 0 over 0.5 s, shake intensity 5 to 1 over 0.5 s.
  - Observed 4.7.2: `COLOR` in canvas_item `fragment()` already holds texture times modulate;
    multiplying by the texture again squares it.

## Official docs (shading language, spatial, canvas_item, screen reading, compute, 4.5 release)

- Reversed-z since 4.3: the full-screen quad needs `POSITION = vec4(VERTEX.xy, 1.0, 1.0)`.
  - Observed 4.7.2: the old form draws only over the sky in Forward+, and covers the whole screen in
    Compatibility, which hides the bug.
- `textureLod` blur needs a LOD above 0 and a mipmap filter hint. Parent the full-screen quad to the
  camera and raise `extra_cull_margin`.
- Locals are uninitialized and there are no implicit int-to-float casts.
  - Observed 4.7.2: `float a = 2;` fails to compile; an uninitialized local compiles silently.
- A global uniform must exist in Project Settings when the shader is saved, or compilation fails.
  - Observed 4.7.2: at runtime it compiles with no error and reads another global's value (day_tint
    in the test); the editor process and the shader baker report the error.
- `global_shader_parameter_get` stalls on the render thread; keep a script-side copy.
- Instance uniforms: at most 16, no textures or arrays. Observed 4.7.2: a sampler instance uniform
  fails to compile.
- Uniform budget: 65,536 bytes desktop, 16,384 mobile, with vec3 padded to vec4.
- `discard` defeats the depth prepass. A `light()` function, even empty, replaces built-in lighting;
  use `+=`.
- `DEPTH` must be written in all branches. Observed 4.7.2: not a compile error.
- `#include` only works for `.gdshaderinc`. Observed 4.7.2: including a `.gdshader` gives the
  misleading "Unknown character #35".
- `#if CURRENT_RENDERER == RENDERER_COMPATIBILITY` (4.4) lets one shader serve all renderers.
- `TIME` wraps at 3,600 s and ignores pause.
- Shader baker (4.5): about 20 times shorter load times on Metal and D3D12 in the TPS demo (release
  notes).
  - Observed 4.7.2: it runs only in an export process with a rendering device; on this Mac it is
    limited to SPIR-V without the Xcode Metal toolchain.
- Stencil is experimental (4.5); BaseMaterial3D presets exist for outline and X-ray.
