# GUI paths (Godot 4.7 editor) for the same procedures

These are for a computer-use agent or a human. The code path in procedures.md is preferred. Menu
names follow the 4.x editor; items not checked against the 4.7.2 editor are marked [verify].

## Build a layer (P2)

1. Scene dock > + (Ctrl+A) > GPUParticles3D.
2. Inspector > Process Material > New ParticleProcessMaterial. Without it nothing emits (Brackeys
   00:05:20).
3. Inspector > Draw Passes > Pass 1 > New QuadMesh (or RibbonTrailMesh / TubeTrailMesh for trails).
4. Inspector > Geometry > Material Override > New StandardMaterial3D, then set:
   - Transparency > Alpha.
   - Shading > Unshaded.
   - Vertex Color > Use as Albedo.
   - Billboard > Particle Billboard, with Keep Scale.
   - Cull Mode > Disabled.
   - Blend Mode > Add or Mix.
5. Curves and ramps: Process Material > Display > Scale Curve / Color Ramp / Alpha Curve > New
   CurveTexture or GradientTexture1D. Edit them in the bottom curve editor. Right-click the
   sub-resource for a larger editor (Octodemy 00:03:48).
6. Duplicate a layer: Ctrl+D, then right-click the Process Material > Make Unique (Recursive).
   Untick the textures in the dialog (Brackeys 00:13:59, 00:15:04).
7. Preview: the restart button on the particles toolbar, or Ctrl+R [verify shortcut in 4.7].

## Trails (P2)

- Node > Drawing > Trails > Enabled, Lifetime.
- Draw Pass 1 > RibbonTrailMesh, with sections, section length, segments and curve. Its material
  needs Transform > Use Particle Trails.
- If the trail breaks after you change sections: Scene > Reload Saved Scene, or copy the material,
  clear it, paste it back and toggle Trails (Octodemy 00:02:24, 00:04:50).
- To follow the emitter: Process Material dropdown > Convert to ShaderMaterial, then in the shader
  editor add `TRANSFORM[3].xyz = EMISSION_TRANSFORM[3].xyz;` at the end of `start()` and `process()`
  (Octodemy 00:05:42).

## Sub-emitter (P2)

- Parent > Inspector > Sub Emitter > pick the child node.
- Parent's Process Material > Sub Emitter > Mode (Constant / At End / At Collision / At Start), with
  frequency (Hz) or amount.
- Child > Visibility AABB: right-click the parent's value > Copy Value, then right-click the
  child's > Paste Value (Godotneers 01:06:16).
- Child > Amount = parent amount x per-event count (or x Hz x child lifetime).

## Collision (P2, P3)

- Add GPUParticlesCollisionBox3D (or HeightField3D or SDF3D) and size it to the floor or wall. It
  must sit inside the emitter's Visibility AABB.
- Process Material > Collision > Mode Rigid or Hide On Contact; set Friction and Bounce. On the
  node: Collision > Base Size.
- SDF: select the node > Bake SDF on the 3D viewport toolbar (editor only). Commit the Texture3D.
- Tunnelling: raise the node's Fixed FPS (Drawing / Time group) or thicken the collider.

## Visibility AABB (P4)

- Select the GPUParticles3D, then the Particles toolbar menu > Generate Visibility AABB. Set the
  generation time, then play.
- 2D: Particles menu > Generate Visibility Rect.

## Capture and look (P5)

- Run the scene (F6). Use the Remote scene tree to pause.
- Debug draw: viewport Perspective menu > Display Overdraw (P7) [verify the menu label in 4.7].
- Renderer: Project Settings > Rendering > Renderer > Rendering Method (forward_plus / mobile /
  gl_compatibility), then restart the editor. For a one-off run, `--rendering-method` on the command
  line.

## CPU fallback (P6)

- Select the GPUParticles3D > Particles toolbar menu > Convert to CPUParticles3D. Check the draw
  order and alpha fade afterwards (procedures P6: the converter drops both on 4.7.2).

## Profiling (P8)

- Debugger > Visual Profiler (GPU and CPU per frame), Debugger > Monitors.
- macOS: Project Settings > Rendering > Rendering Device > Driver.macos = vulkan, to see GPU time
  [observed: Metal reports 0 in the AgentKit monitor].

## Juice (P9)

- Project Settings > Globals > Autoload > add `res://vfx/runtime/juice.gd` as `Juice`. Call
  `Juice.hitstop()` and `Juice.add_trauma()` from hit code.

## Effect assembly with AnimationPlayer (alternative to fx_burst)

- Add an AnimationPlayer as a child. Key `emitting` on each layer at its start time, add an
  OmniLight3D energy track and a `queue_free` method track, set Autoplay on Load, and save the
  animation with Local To Scene (Brackeys 00:21:27, Bonkahe 00:23:30).
