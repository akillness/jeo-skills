# Expert notes: VFX, particles and game feel

Principles by expert, each with its source and timestamp. Lines marked [added] are this skill's own
judgment. Lines marked "live" were measured in Godot 4.7.2 on 2026-10-02 (see procedures.md).

## Brackeys: How to make VFX in Godot (htRjt505sPg, 2026-01)

**Layering and resources**

- One effect is several small systems (fire, smoke, sparks, debris, shockwave, light, sound) timed
  together [00:02:30]. Build the next layer by duplicating a working one and changing lifetime,
  velocity, gravity and color [00:13:27].
- After duplicating, use Make Unique Recursive on the process material, but never on the texture,
  which would be embedded in the scene [00:13:59, 00:15:04]. Keep the mesh shared and put the
  material in `material_override` [00:14:32]. The kit stores shared textures as
  `res://vfx/tex/*.tres`.

**Silent settings**

- In 3D, color reaches the mesh only through Vertex Color > Use as Albedo [00:11:50, 00:12:26].
- Billboards ignore the scale curve without Keep Scale [00:23:44].
- Align Y conflicts with billboarding: use Transform Align Z Billboard + Y to Velocity [00:27:07].
  The kit's sparks use it.
- The shockwave is one particle on a Face-Y quad with a ring texture, scaled and faded by curves,
  with cull disabled [00:18:02 to 00:19:40].

**Blend modes**

- Add for fire, magic and sparks; Mix for smoke and debris [00:24:34].
- Premultiplied alpha lets one system go from Add (low alpha) to Mix (high alpha) [00:30:56 to
  00:32:39].

**Layer problems and runtime**

- Z-fighting between layers: offset the nodes first, then use a sorting or depth offset [00:29:57].
- Replay with `restart()`. A spawned one-shot scene needs its own autoplay and must free itself
  [00:33:12 to 00:35:21]. `fx_burst.gd` does both.
- Rain uses a flat velocity, not gravity. Enlarge the AABB, and use a sub-emitter for impacts
  [00:37:38 to 00:40:33]. The sub-emitter's `amount` caps total live particles [00:40:00].

## Godotneers: Particles Part 2, 3D (cZ5Ang_Ji8E, 2024-09)

**3D setup and the AABB**

- 3D adds four steps to 2D: transparency, vertex color as albedo, billboarding and cull mode
  [00:01:09, 00:09:44].
- Particles ignore physics colliders; use GPUParticlesCollision Box, HeightField or SDF [00:44:23].
- The visibility AABB is also the area where collision is evaluated [00:45:28].

**Tunnelling and particle size**

- The step per tick is speed / fixed_fps. With the default 30 fps, 22 m/s moves about 0.7 m per
  tick, so thicken the collider or go to 60 fps [00:46:42 to 00:48:55].
- Live: `vfx_audit` computes the step and flags 0.745 m against a 0.2 m wall.
- `collision_base_size` defaults to 0.01 m: match it to the particle size [00:57:27, 01:08:38].
- Live [added]: if that base size is larger than the height above the collider at spawn, debris
  sticks (0.5 m of travel instead of 10.2 m).

**Colliders, sub-emitters and trails**

- HeightField treats everything below the first surface as solid. SDF handles overhangs but needs an
  editor bake [00:50:08 to 00:57:04].
- Sub-emitters do not inherit the parent's AABB: copy it [01:06:19]. `link_sub_emitter` does.
- Trails: Use Particle Trails on the material, or the trail breaks into pieces [00:32:54]. Lit
  trails rendered dark in 4.2 [00:33:26]: not re-tested.

## Godotneers: Particles Part 1, 2D (yKoGuBGZatY, 2024-05)

- Prefer GPUParticles2D. CPUParticles2D is for old PCs, has fewer features and gets no updates
  [00:02:15].
- A sub-emitter asks an existing emitter to emit N particles at a spot, limited by its `amount`
  [00:44:48].
- Settings have prerequisites: radial acceleration needs a non-zero spawn offset [00:07:01].
- Trail pop-out: the ramp must be transparent before t = 1 [01:00:48].

## Bonkahe: GPUParticles deep dive (BUa-mKHEPUM, 2024-03)

- Layers make the effect [00:19:38]. A prefab that autoplays and frees itself needs no spawning
  script [00:22:56].
- `amount_ratio` fades emission without restarting and saves no performance [00:01:18]. Docs agree.
- Lifetime randomness only shortens [00:05:55].
- Sub-emitter CONSTANT at 100 Hz draws smoke trails behind chunks, with the cap at 1000 [00:21:49].
  The expert treats the value as Hz. Live: confirmed as Hz, while the doc note's "seconds between
  spawns" reading is wrong. Some emissions are dropped: 13 of 20 at 10 Hz and 60 fps.
- Save the effect animation `local_to_scene`, or instances share one animation [00:23:30].

## Le Lu: Fireball projectile (74XywaLGO5Q, 2024-06)

**Anatomy**

- A projectile is head (most important), tail (sells speed) and sparks [00:00:34].
- The head is a stretched sphere with an unshaded, cull-disabled, no-shadow shader. The color is HDR
  (2, 1.3, 0.6) so it glows [00:07:30, 00:08:05].

**Head shader**

- Noise minus a gradient along the UV, clamped, because negative values show as black marks
  [00:09:18 to 00:12:44].
- Scrolling at (0.1, 3) [00:14:38].
- Inner ball: inverted Fresnel to alpha, power 4 to 5. Render priority is 2 for the head and 1 for
  the ball [00:15:01 to 00:18:25].

**Sparks and tail**

- Sparks: amount 10, lifetime 0.3, velocity 3 to 8, radial velocity 1 to 2, HDR (2, 1.3, 0.5), Align
  Y [00:28:15 to 00:33:30].
- A static quad tail only works for straight shots. Curved paths need a node-following trail
  [00:33:30]. The kit uses the Octodemy shader in place of the plugin.

## Le Lu: Realistic smoke (e_6ZA-xa_DQ, 2025-03)

- Unshaded smoke looks wrong in darkness. For realism keep lit particles and push the color
  [00:07:23].
- Ramping the texture LOD from 0 to 8 over life blurs smoke almost for free [00:19:00].
- Particle COLOR can carry data; the color then comes from a uniform [00:23:13].
- Live [added]: an unshaded alpha-blended smoke ramp of about 0.06 linear reads mid gray on Forward+
  and near black on Compatibility. Retune the low tier on its renderer.

## Octodemy: Hidden 3D trail system (iPCzOe-S9EQ, 2026-07, 4.7 era)

- Trails need a RibbonTrailMesh or TubeTrailMesh draw pass, Use Particle Trails, cull disabled and
  unshaded for ribbons [00:00:14, 00:00:47].
- Sections divide the trail lifetime and segments subdivide them. Keep sections high and section
  length small [00:02:00 to 00:03:44].
- Changing sections may not reach the renderer: reload, or re-paste the material and toggle trails
  [00:02:24, 00:04:50]. Not yet run on 4.7.2.
- To follow a node, set `TRANSFORM[3].xyz = EMISSION_TRANSFORM[3].xyz` at the end of `start()` and
  `process()`, remove forces, and do not align to velocity [00:05:42 to 00:06:51]. Live: the ribbon
  follows the projectile in Forward+ and Mobile.

## onetupthree: Common VFX shader techniques (N9ilhL8JFes, 2023-09)

- Seven techniques cover most VFX: tiling and offset, masking, distortion, erosion, polar
  coordinates, depth fade, and lifetime as an input [00:00:00].
- Particle lifetime is `INSTANCE_CUSTOM.y` in the vertex stage; pass it by varying [00:05:38]. The
  `fx_erode` puffs use it.
- To get an engine formula, configure a built-in material and convert it to a shader [00:04:20]. The
  `fx_erode` billboard vertex code comes from the StandardMaterial3D particle billboard.

## onetupthree: Anatomy of a slash (QyI8ZS-G9nw, 2025-02)

- Lore first. Then base, highlight (most visual weight), support and impact [00:02:51 to 00:07:17].
  The same hierarchy is used to judge the explosion: the flash and fire read first, then smoke and
  sparks.

## Mostly Mad Productions: Freeze frame (Jwv9t5zFlqI) and Screen shake (pG4KGyxQp40), 2025-04

- Hit-stop lowers `Engine.time_scale` and awaits `create_timer(d, true, false, true)`, which ignores
  time scale [00:00:32 to 00:01:04]. Reset the time scale on scene change or in `_ready` [00:01:37].
- Time scale does not slow audio [00:00:32].
- Shake: smooth noise with a randomized seed, intensity decaying, offset returned to zero [00:00:39
  to 00:03:00].
- [added] Trauma squared, and shake that keeps moving during a hit-stop (real delta). Live: bounded
  and back to 0.

## Four Games: Confetti trails (V_kwx2HGwNU, 2024-07)

- Trails need three things together: the mesh, Use Particle Trails, and trails enabled [00:00:28 to
  00:01:34].
- Vary trail lifetime and count across duplicated systems [00:04:35].

## PlayWithFurcifer: How games make VFX (eU-F-xuEo7s, 2023-02)

- Most effects are a few tricks layered: scrolling noise, gradient mapping, dissolve, distortion.
  One trick alone rarely convinces [00:04:15, 00:04:47].

## MrElipteach: Balatro effects (Alwy-TH0WzE, 2024-04)

- Most juice is cheap: tweens, one reused shader, small maths [00:00:17].
- One shader per node: put the second on the parent and toggle `use_parent_material` [00:02:48].

## Watt Interactive (QhntE6vOLXY), DevWorm (yWIH7hHfWyU), GDC Coffin (yG4ChOPyC-4)

- Watt: property cross-check. Angular velocity needs its flags [00:09:05].
- DevWorm: CPU-first advice, contradicted by the docs and the other experts. The deciding condition
  is the renderer: CPU twins are only for Compatibility or old hardware.
- Coffin (GDC 2018): surface-driven GPU emission needs geometry shaders and append buffers that
  Godot does not expose. Design thinking only.

## Official docs (stable, retrieved 2026-10-02)

**GPUParticles3D**

- `amount_ratio` gives no performance gain; changing `amount` restarts the system.
- Use `restart()` to replay one-shots. `finished` fires only for `one_shot`.
- The trails prerequisites.
- `DRAW_ORDER_INDEX` is the only order with motion vectors.
- `emit_particle()` is not available in Compatibility.

**ParticleProcessMaterial**

- Color needs vertex color.
- Turbulence is costly on mobile and web.
- `sub_emitter_frequency` is described both as a frequency and as "every X seconds". Live: it is Hz.
- Animated velocities ignore damping.

**Other**

- GPUParticlesCollisionSDF3D: bake is editor-only; pre-baked Texture3D loads in exports.
- Particle shader: `start()` and `process()`; state persists; TIME follows time_scale.
- Renderers (`sources/docs/rendering-lighting__renderers.md`): Compatibility has no decals, no
  particle trails and no SDF particle collision, with an RGBA8 LDR buffer. Mobile uses RGB10A2.
  Live: decals vanish with no log line, while trails and sub-emitters log warnings.
