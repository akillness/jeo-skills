# scenario-godot-shaders critique rubric

Use this rubric before calling a shader deliverable done. Score each line pass, fail or n/a. One
fail in "Blocking" means the deliverable is not done.

## Blocking

1. **Compiles per target renderer.**
   - `compile_matrix` is ok for every renderer the brief names.
   - `draw_check` (windowed) shows zero shader and engine errors, so stencil and fog problems
     surface.
2. **Lint is clean.**
   - No `error` findings.
   - Each `warn` is fixed or justified in one line (uninitialized local, `canvas_color`, `light =`).
3. **Looked at.**
   - A contact sheet of the parameter sweep was opened. The description of the look comes from that
     sheet, not from the code.
   - Every claim ("foam ring at every shore", "edge glows") points to a shot.
4. **Right pass.**
   - The deliverable says whether the material is opaque, alpha-scissor or transparent, and why.
   - A transparent material accepts the loss of shadows and sorting, and states it.
   - A stencil reader writes ALPHA and has a higher render priority than the writer.
5. **Uniform surface.**
   - Colors have `source_color`; data textures do not.
   - Ranges have `hint_range`, and groups use `group_uniforms`.
   - Per-object values use `instance uniform` (16 at most, no samplers) when the material is shared.
   - Globals are registered in `[shader_globals]` (lint with `project=`).
6. **Version-correct.**
   - No Godot 3 names.
   - Full-screen quads use `vec4(VERTEX.xy, 1.0, 1.0)`.
   - Depth reconstruction has the Compatibility branch when Compatibility is a target.

## Quality

7. **Water.**
   - A depth ramp from shallow to deep.
   - Foam at every shoreline and around the objects.
   - Moving ripples (a phase sweep, `changes` above 0.005) with no visible tile scroll.
   - Submerged parts tinted and refracted; dry parts untouched.
   - Bands that do not flicker (hybrid toon).
8. **Dissolve.**
   - Amount 0 is whole and amount 1 leaves nothing.
   - The edge follows the noise and glows with Glow on.
   - The shadow dissolves with the mesh.
   - Each mesh in a shared material progresses on its own (mixed shot).
   - The back faces show the interior color.
9. **Cost.**
   - GPU p50 against a StandardMaterial3D baseline at the target resolution, with the driver named.
   - Any mobile claim is marked "desktop proxy" until it is measured on a device.
   - Screen and depth reads are justified; a LITE tier exists when mobile is a target.
10. **Renderer parity.**
    - Captures from every target renderer sit side by side.
    - The known differences are written down (Compatibility renders brighter and more saturated with
      the same Environment).
11. **Animation path.**
    - The parameter is animated through `instance_shader_parameters/<name>` or
      `shader_parameter/<name>`.
    - Material uniforms are set once before tweening (an unset value reads null).
12. **Ship path.**
    - The export preset has `shader_baker/enabled=true`.
    - The bake was verified from a windowed export (step count and pack size).
    - Shader stutter is handed to scenario-godot-performance-export.

## Red flags in a draft (from the no-skill baseline and the first passes here)

- "Headless runs compile no shaders" is false: headless compiles and reports language errors per
  renderer. Only some backend checks need a window.
- A LITE tier that bakes water depth into vertex colors, without measuring first. Here the
  depth-texture LITE cost only +0 to 0.15 ms over the baseline at 1080p, so measure before adding a
  bake step.
- One `height` or `bounds` uniform on a material shared by different meshes.
- A post effect "tested" only in Compatibility: the pre-4.3 quad works there and fails in Forward+.
- A sprite effect that multiplies `texture(TEXTURE, UV)` by `COLOR`.
- A claim that a missing global "fails to compile" or "reads zero": in 4.7.2 it compiles at runtime
  and reads another global's value.
- No contact sheet, or a sheet built from frame counts to show motion (TIME is wall time).
