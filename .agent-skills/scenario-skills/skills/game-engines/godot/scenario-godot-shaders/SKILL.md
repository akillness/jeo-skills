---
name: scenario-godot-shaders
description: "Use when writing or fixing Godot 4.7 shaders: .gdshader code (spatial, canvas_item, particles, sky, fog), VisualShader graphs built in code, stylized or toon water, dissolve or burn effects, hit flash, outlines, X-ray or portals with the stencil buffer, depth or screen-texture post-processing, global or per-instance uniforms, compute shaders and Texture2DRD, the shader baker; or when 'shader compiles but looks wrong', 'black screen from my post effect', 'my Godot 3 shader breaks', 'colors look washed out', 'first-launch shader stutter'."
license: MIT
---

# Godot shaders (technical artist, shading)

Target: Godot 4.7.2.stable, macOS Apple Silicon (Metal by default, Vulkan through MoltenVK for GPU
timing).

Expert level here means every shader is text the agent can diff, compiled under each target
renderer, drawn on a real mesh in a window, swept across its parameters and looked at on a contact
sheet, with its GPU cost measured against a StandardMaterial3D baseline. Compiling is not the same
as working: several 4.7.2 failures only appear when the backend draws, and several bugs produce no
error at all. If a sibling skill named here is missing from your available skills, load it with
`skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-godot-expert (channels, `gd_run`, the review loop, 4.7 traps).

## Stance (the expert delta)

1. **Code first, graphs on request.** Text shaders give loops, functions, `#include` and clean diffs
   (Godotneers, Shaderland [01:10:09]; Daniel Ilett on the gaps of VisualShader). When a human wants
   a graph, build the VisualShader in code (`add_node`, `connect_nodes`, an Expression node for the
   maths) and save it as `.tres`; port names are not exposed to GDScript, so output indices are
   hard-coded and checked by reading `get_code()` [added, run 2026-10-02].
2. **Compile headless, then draw windowed.** Headless `get_shader_uniform_list()` catches language
   errors per `--rendering-method` in about 0.4 s per renderer. Stencil reads in the opaque pass and
   fog shaders under Compatibility only fail when a window draws them. Uninitialized locals and
   `DEPTH` written in one branch never fail at all, so the linter checks those [added, run
   2026-10-02].
3. **World or object space beats mesh UVs.** Dissolve, wind, water and triplanar effects should be
   driven from object-space or world-space coordinates, so seams and UV stretch disappear
   (StayAtHomeDev dissolve [00:09:59], DevPoodle triplanar, Dylearn grass). For a shared material,
   put the per-object values (bounds, amount) in `instance uniform`s, or each mesh dissolves at the
   wrong height [added].
4. **Water that does not slide.** Use two panned copies of one seamless cellular noise, multiply
   them, raise to 1.25, and share them between `vertex()` and `fragment()` so the crests sit on the
   wave tops (Bramwell [00:11:57 to 00:20:57]). Use hybrid toon bands, a smoothstep only near each
   cut, so the bands do not flicker (Dylearn [00:13:42]). Shore foam comes from vertical depth,
   reconstructed from the depth texture with the reversed-z formula [added].
5. **HDR edges need three things together:** a color above 1.0, the EMISSION output, and Glow in the
   WorldEnvironment (StayAtHomeDev [00:07:36], Daniel Ilett [00:10:22], Pixezy [00:06:55]).
6. **Know what moves a material to the transparent pass.** Writing `ALPHA` or reading the screen or
   depth texture moves it there. It loses shadows and sorting, and it is invisible to other
   screen-reading materials (docs). Use `ALPHA_SCISSOR_THRESHOLD` for dissolves: the material stays
   opaque and the shadow dissolves too. Scissor is still an alpha test: like `discard`, it gives up
   early-Z for that mesh (docs), which costs most on mobile tile GPUs, so swap the dissolve material
   in only for the effect (P18). Stencil readers must be transparent, with a `render_priority` above
   the writer's (LowQualityCoding [00:07:35]).
7. **Compute: on screen, stay on the main device.** Texture2DRD needs the main RenderingDevice
   inside `RenderingServer.call_on_render_thread`, and no submit or sync (The Pathfinders Codex
   [00:03:07]). To get results back on the CPU, use a local device, free every RID and test parity
   against a CPU version (DevPoodle [00:02:21], Crigz [00:11:24]).
8. **Bake shaders from a windowed export.** The shader baker runs only when the export process has a
   rendering device. A `--headless` export with `shader_baker/enabled=true` silently packs nothing
   extra [added, run 2026-10-02].

## Establish first

- **Target renderers:** Forward+ (desktop), Mobile (phones), Compatibility (web, old GPUs); each
  decides which hints and stages exist. Default: Forward+ plus one named fallback.
- **Style:** toon, PBR or pixel art. Decide the band count, the outline method (stencil or inverted
  hull) and whether Glow is on.
- **Budget:** GPU ms per effect against a StandardMaterial3D baseline. Default: under +0.5 ms at
  1080p on this Mac for a hero effect, confirmed on the device.
- **Who edits:** an agent (text) or a human artist too (VisualShader `.tres`, grouped uniforms with
  hints).
- **Shared or unique materials:** per-instance values decide between instance uniforms (at most 16,
  no textures), unique materials and globals.

## Workflow

1. **Install and lint.** `gd_shaders.install(project)` copies the templates into `res://shaders/`
   and the tools into `addons/agentkit/shaders/`. Then
   `gd_shaders.lint(path, renderers, project=P)`. GATE: no `error` findings; every `warn` fixed or
   justified.
2. **Compile per renderer.** `gd_shaders.compile_matrix(P, root="res://shaders/")`. GATE: `ok` with
   an empty `failed` list for every target renderer.
3. **Draw once per renderer.** `gd_shaders.draw_check(P, files)` puts each shader on a drawn mesh,
   canvas item, sky, particle system or fog volume. GATE: zero `shader_errors` and `engine_errors`
   in each run.
4. **Build the test scene in code.** Write a job that saves a `.tscn` with the camera, the light and
   the Environment set explicitly: AgX, Glow on or off as the brief says. Water needs ground
   crossing the water level and objects above and below it. A dissolve needs at least three meshes
   with different sizes and rotations. GATE: the scene loads headless with `ok`, and the
   project.godot renderer and Jolt settings were checked.
5. **Sweep and look.** Run `gd_shaders.param_sweep(P, scene, shots=...)` with kinds `shader`,
   `instance`, `global` or `prop`. Open the contact sheet. GATE: `changes` behave as expected (a
   monotonic dissolve, a moving phase), and the sheet shows the intended look in every shot.
6. **Compare renderers.** `gd_shaders.renderer_captures(P, scene)`. GATE: the look holds under each
   target renderer; known differences are written down (Compatibility renders brighter and more
   saturated with the same Environment).
7. **Cost.** `gd_shaders.cost_compare(P, {"standard": ..., "hq": ..., "lite": ...})` on Vulkan at
   1080p. GATE: the delta against the baseline is within budget; mobile numbers are marked "desktop
   proxy".
8. **Ship.** Add a macOS or target preset with `shader_baker/enabled=true`. Export once from a
   windowed process (see procedures.md P14). GATE: the log shows "Baking shaders (N steps)" and the
   pack grows. A missing global uniform shows up here as an error.

**Side paths:**

- **VisualShader for a human artist** (P9): build the graph in code with an Expression node and save
  it as `.tres`. Read it back with `shader_tools.gd:visual_shader`, which returns the generated
  code, the node counts and the uniforms. Then sweep it like a text shader. GATE: the generated code
  contains every expected output assignment.
- **Compute** (P12, P13): run `compute_probe` windowed for the CPU parity check. Use the Texture2DRD
  job for on-screen output. GATE: zero mismatches, no leaked RIDs, and frames that change.
- **Globals** (P11): register the global with `register_global` (it writes the editor's multi-line
  format). Set live values with `RenderingServer.global_shader_parameter_set` and keep a copy in an
  autoload: the getter stalls the render thread (docs). `ProjectSettings.set_setting` at runtime
  does not register a global.
- **Animating parameters:** a Tween or an AnimationPlayer track on
  `instance_shader_parameters/dissolve_amount` drives an instance uniform; `shader_parameter/<name>`
  drives a material uniform (P8).

## Expert checklist (state these in the plan)

- **Complete code in the deliverable.** Paste the full templates
  ([`dissolve.gdshader`](scripts/agentkit/shaders/dissolve.gdshader),
  [`water_stylized.gdshader`](scripts/agentkit/shaders/water_stylized.gdshader) plus its include)
  and setup script: readers may lack the kit.
- **`source_color`** on every color uniform and color sampler, never on normal, roughness or mask
  data (`lint` rule `source_color`).
- **Uniform budget** 16,384 B on mobile, vec3 padded to 16 B; big arrays go in a texture (`lint`
  rule `uniform_budget`).
- **`TIME`** wraps at 3,600 s and keeps running while paused (docs): drive pausable motion from
  `global uniform float game_time`, written by the
  [`game_time.gd`](scripts/agentkit/shaders/game_time.gd) autoload (P18).
- **Dissolve bounds.** World space breaks when the mesh moves or scales; StayAtHomeDev feeds AABB
  min and max from an `@tool` script (pIwQ 09:59 to 12:52). The template uses object space plus an
  `instance uniform vec2 bounds` per mesh, which survives movement, scale and sharing.
- **Swap in for the effect.** `dissolve_swap.gd:swap_in(mi, mat)` puts one duplicate per surface
  (keeping each surface's albedo color and texture) and returns the originals for `restore` (P18).
- **Sorting.** `depth_prepass_alpha` with `cull_disabled` fixes transparent sorting artifacts and
  keeps shadows (pIwQ 00:01:00).
- **`LIGHT_VERTEX`** (4.3) moves the lit position, for example snapped to a grid for stepped
  pixel-art light, without touching `VERTEX` (Dylearn 00:01:25); it draws on all three renderers
  (P18).
- **Outlines.** BaseMaterial3D `stencil_mode` outline on dense meshes; an inverted-hull next pass
  elsewhere (Daniel Ilett 15:18).

## Numbers

| Value                                     | Number                                                              | Relative to                                                  |
| ----------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| Headless compile, 3 renderers, 11 shaders | 1.3 s                                                               | M5 Max, run 2026-10-02                                       |
| First windowed draw (pipeline build)      | Metal 7.5 s, Mobile 5.3 s, Compat 1.6 s                             | cold cache, same probe set                                   |
| Water GPU p50 at 1080p                    | standard 2.9 to 3.2 ms, HQ 3.4 to 3.5, LITE 3.0 to 3.1              | Vulkan, 3 runs, whole frame                                  |
| HQ water (refraction) over baseline       | +0.35 to 0.5 ms                                                     | same scene, StandardMaterial3D water                         |
| Uniform buffer                            | 65,536 B desktop, 16,384 B mobile; vec3 pads to 16 B                | official docs                                                |
| Instance uniforms per shader              | 16, no samplers or arrays                                           | docs, sampler rejected by the compiler                       |
| Water noise                               | product of 2 pans, pow 1.25                                         | Bramwell                                                     |
| Dissolve edge                             | width 0.06, emission x6, Glow on                                    | template defaults [added]                                    |
| Compute, 1M floats, submit + sync         | Metal 1.2 ms, Vulkan 1.9 to 2.4 ms                                  | local RD, windowed                                           |
| Shader baker, this project                | 709 steps, pack 4.9 MB to 18.3 MB, 19 s first bake, 4 to 12 s later | windowed export, Metal limited to SPIR-V without Xcode tools |
| `TIME`                                    | wraps at 3,600 s, ignores pause                                     | docs                                                         |
| Shader-driven lockstep                    | diverged by one pixel after about 60,000 frames across GPU vendors  | Leszek Nowak [00:23:39]                                      |

## Quality gates

- **Measurable:** `lint` has no errors; `compile_matrix` and `draw_check` show zero shader errors
  per target renderer; sweep `changes` match the intent (0 at the first shot, monotonic for a
  dissolve, above 0.005 for a moving phase); pixel probes hit the expected colors; `cost_compare`
  within budget; compute `mismatches == 0` with no `leaks`; the baker log shows its step count.
- **Visual (open the sheet):**
  - water: a depth ramp, a foam ring at every shore, ripples that move, no tile scroll, and
    submerged objects tinted while dry rocks are not;
  - dissolve: the edge follows the noise, glows, and cuts the shadow too; no leftover at amount 1;
    each mesh dissolves independently;
  - post effect: it covers the whole screen when the camera turns;
  - stencil: the outline is continuous on smooth meshes;
  - sky: the bands and the sun disc are where `LIGHT0_DIRECTION` puts them.

## Common mistakes

| Mistake                                                        | What it looks like                                                                                 | Fix                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Godot 3 names (`SCREEN_TEXTURE`, `hint_color`, `WORLD_MATRIX`) | compile error; the message names the uniform to use                                                | hinted uniforms and `MODEL_MATRIX`; `lint` rule `godot3`                     |
| Full-screen quad with `POSITION = vec4(VERTEX, 1.0)`           | Forward+ and Mobile: the effect shows only over the sky; Compatibility hides the bug               | `vec4(VERTEX.xy, 1.0, 1.0)`, flip_faces quad, `extra_cull_margin` 16384      |
| `texture(TEXTURE, UV) * COLOR` in canvas_item                  | sprite darker (channel 54 becomes 11)                                                              | `COLOR` already holds texture times modulate                                 |
| Global uniform not in `[shader_globals]`                       | compiles at runtime with no error and reads another global's value; the baker and editor report it | `gd_shaders.register_global` before saving the shader                        |
| `#include` of a `.gdshader`                                    | "Unknown character #35"                                                                            | include `.gdshaderinc` only                                                  |
| Stencil read in an opaque material                             | "reads stencil but is not in the alpha queue" at draw time; nothing masks                          | write `ALPHA` (or disable depth draw or depth test), raise `render_priority` |
| Stencil outline on a box                                       | broken outline at the corners (split normals)                                                      | dense smooth meshes, or an inverted hull                                     |
| Shared dissolve material with one `bounds`                     | small meshes vanish at once, big ones never finish                                                 | `instance uniform vec2 bounds` per mesh                                      |
| `textureLod` on the screen texture without a mipmap filter     | blur stays sharp                                                                                   | `filter_linear_mipmap`                                                       |
| `hint_normal_roughness_texture` on Mobile or Compatibility     | compile error under that renderer                                                                  | Forward+ only, or a `#if CURRENT_RENDERER` branch                            |
| Shader baker enabled, `--headless` export                      | same pack size, no log line                                                                        | export from a windowed process                                               |
| Tween on `shader_parameter/x` left at its default              | "Type mismatch ... Nil and float"; the tween never finishes                                        | `set_shader_parameter` once before tweening (unset values read null)         |
| Measuring motion from capture frame counts                     | water looks frozen between frames                                                                  | sweep `wave_speed` as a phase offset                                         |
| `TIME` for gameplay-synced motion                              | keeps scrolling in the pause menu                                                                  | `game_time` global from an autoload (P18)                                    |

## Handoffs

- **Receives:** renderer, Environment and Compositor needs (scenario-godot-rendering-lighting);
  particle and card shaders (scenario-godot-vfx); sprite effects (scenario-godot-2d); tileable maps
  (scenario-textures).
- **Delivers:** `.gdshader`, `.gdshaderinc` and VisualShader `.tres` files, ShaderMaterial setup
  code, instance and global uniform names with ranges, the sweep sheet and the cost table.
- **Hands off to:** scenario-godot-performance-export (stutter, baker in CI, device timing);
  scenario-godot-animation (tracks on `instance_shader_parameters/<name>`);
  scenario-godot-rendering-lighting (full-screen effects for a CompositorEffect).

## Godot 4.7 notes

- Reversed-z since 4.3 (Forward+ and Mobile); Compatibility keeps OpenGL depth. Use
  `#if CURRENT_RENDERER == RENDERER_COMPATIBILITY` (4.4+) for the NDC formula.
- Stencil (4.5, still experimental): shader `stencil_mode`, and the BaseMaterial3D `stencil_mode`
  presets (outline, X-ray), which create their own `next_pass`. These run in Forward+ and
  Compatibility on 4.7.2.
- Shader baker (4.5): an export option; ubershaders (4.4) reduce the remaining stutter.
- Texture2DRD (4.2) and `texture_get_data_async` (4.4) are current.
- Changes in 4.8 or later: not covered; recheck the stencil syntax, which is marked experimental.

## References

- [`references/expert-notes.md`](references/expert-notes.md) (principles by expert, timestamps,
  4.7.2 observations), [`procedures.md`](references/procedures.md) (P1 to P18, code, tests,
  results), [`critique.md`](references/critique.md) (rubric),
  [`gui-paths.md`](references/gui-paths.md) (editor paths), [`sources.md`](references/sources.md)
  (sources and timestamps).
- [`scripts/gd_shaders.py`](scripts/gd_shaders.py): install, lint, uniforms and budget, globals,
  compile_matrix, draw_check, param_sweep, renderer_captures, cost_compare.
- [`scripts/agentkit/shaders/`](scripts/agentkit/shaders/):
  [`shader_tools.gd`](scripts/agentkit/shaders/shader_tools.gd),
  [`dissolve_swap.gd`](scripts/agentkit/shaders/dissolve_swap.gd), `game_time.gd` and the templates
  (water HQ and LITE, dissolve, fullscreen_depth, portal writer and reader, sky_toon, hit_flash).
