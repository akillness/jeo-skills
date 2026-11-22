# Sources

Five videos were distilled into this skill. Notes and transcripts are in the project folder:
`notes/hair/<id> - <title>.md`, the batch digest `notes/hair/_digest_hair.md`, and
`transcripts/<id>.txt` (auto captions). None had frame grabs, so visual details come from speech.
The Blender versions on screen were 3.5 to about 4.5. `procedures.md` and the **5.2** marks in
`expert-notes.md` record what changed in 5.2.1.

| #   | Video                                                                                                                       | Expert and credential                                                                                                                                                              | Date, length, version               | Best for                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [Character grooming with the new hair system](https://www.youtube.com/watch?v=Kx88edAbiek) (Blender Conference 2023)        | **Daniel Bystedt**, senior concept artist at Goodbye Kansas Studios (VFX, game cinematics), Blender sculpt and modeling module contributor, author of the official hair demo files | 2023-10-26, 41:30, about 3.6 or 4.0 | Human hairstyle as layered populations, hair cap, parting fixes, density map, debug colors                                                  |
| 2   | [A million little curves: creating hair for animals](https://www.youtube.com/watch?v=ZrBbNhCgGww) (Blender Conference 2025) | **Kerstin Schmidbauer**, founder and technical director of Critter Crew Animation (leads the fur department, a new groom every year)                                               | 2025-09-18, 53:55, about 4.4 or 4.5 | Animal fur: reference, 2-point guides, landmark objects, masks for everything, troubleshooting (bald spots, invalid UVs, mouth, dents)      |
| 3   | [How to Make Procedural Fur in Blender Geometry Nodes](https://www.youtube.com/watch?v=gCQN5vNgHiI) (Blender Studio)        | **Simon Thommes**, Blender Studio technical artist, co-author of the procedural hair node assets and demo files                                                                    | 2023-03-29, 34:58, 3.5              | Value-by-value procedural long-fur recipe, asset mechanics (Shape, guide maps, density units), per-curve randomness, shading and review rig |
| 4   | [Geometry nodes hair card setup for Blender](https://www.youtube.com/watch?v=g_ZIOafq4QU)                                   | **Daniel Bystedt** (as above)                                                                                                                                                      | 2024-03-17, 25:53, about 4.0 or 4.1 | Specification of a production hair-card generator: surface-aligned tilt, root snap, transfers, hair cap, texture scene                      |
| 5   | [Mesh Hair with Geometry Nodes and Hair Curves](https://www.youtube.com/watch?v=vXBL-oiqY7Q) (Blender Conference 2024)      | **Sara Matsumoto**, SM5 by Helan (fantasy asset store, Transhuman character creator for Blender)                                                                                   | 2024-10-24, 43:10, about 4.2        | Cards and tubes from curves with GN UVs, in-Blender strand texture plates, anisotropic card material                                        |

## Best timestamps

**1. Bystedt, BCON23 (`Kx88edAbiek`)**

- `[00:02:19]` to `[00:02:53]`: hair cap and splitting it along the part.
- `[00:05:06]` to `[00:07:24]`: brush settings (Projected falloff, Scale Uniform off, Curve-domain
  selection).
- `[00:08:38]`: resample to 15. `[00:09:52]`: grow, comb, shrink.
- `[00:11:33]` to `[00:12:09]`: Shrinkwrap Hair Curves.
- `[00:13:24]` to `[00:15:44]`: Noise and Roll settings.
- `[00:16:21]` to `[00:21:31]`: Interpolate, Profile, Clump for wide clumps (Shape semantics at
  `[00:18:04]`).
- `[00:22:04]` to `[00:24:56]`: density map and Global Density.
- `[00:26:08]`: debug colors. `[00:27:54]` to `[00:29:44]`: thin-clump population.
- `[00:32:06]` to `[00:41:16]`: parting root snap and lift graph.

**2. Schmidbauer, BCON25 (`ZrBbNhCgGww`)**

- `[00:03:24]` to `[00:08:43]`: reference discipline and draw-overs.
- `[00:13:15]` to `[00:14:25]`: objects per landmark.
- `[00:19:44]` to `[00:21:34]`: 2-point guides.
- `[00:22:07]` to `[00:26:14]`: Interpolate masks and density units.
- `[00:27:26]` to `[00:32:36]`: Trim, Clump, Frizz with masks.
- `[00:33:16]` to `[00:47:50]`: troubleshooting (deformation x10, mouth, dents, invalid UVs, mirror
  seam, snapping).
- `[00:50:04]` to `[00:53:28]`: shape-key-like groom blend.

**3. Thommes, Blender Studio (`gCQN5vNgHiI`)**

- `[00:02:32]` to `[00:04:20]`: density per area, snap to deformed surface, Strip display, Profile
  Shape.
- `[00:09:02]` to `[00:09:35]`: 1M density and 4% viewport.
- `[00:12:04]` to `[00:16:44]`: Curl, guide maps, Frizz shape, sub-clumps, radius.
- `[00:17:16]` to `[00:21:13]`: lighting, shader (Cycles vs EEVEE), color variation.
- `[00:19:32]`: first-render critique.
- `[00:25:31]` to `[00:32:08]`: per-curve randomness, curl frequency ramp, strays, second clump,
  final frizz.
- `[00:32:51]`: full-density patch.

**4. Bystedt, hair cards (`g_ZIOafq4QU`)**

- `[00:00:31]` to `[00:06:16]`: generator inputs.
- `[00:06:53]` to `[00:11:03]`: masks, color and UV transfer, parting line.
- `[00:17:15]` to `[00:22:28]`: character setup (front and back grooms, thick and sparse cards, hair
  cap).
- `[00:23:04]` to `[00:25:25]`: texture scene and outputs.

**5. Matsumoto, BCON24 (`vXBL-oiqY7Q`)**

- `[00:03:55]` to `[00:10:57]`: strand plate grooming and passes.
- `[00:11:37]` to `[00:17:06]`: material test rig and anisotropic card material.
- `[00:18:16]` to `[00:24:21]`: GN cards and tubes (Resample, Arc, Spiral, taper).
- `[00:24:36]` to `[00:31:27]`: GN UVs and the card vs tube density fix.
- `[00:32:09]` to `[00:33:47]`: root attach.
- `[00:39:47]` to `[00:41:28]`: density scale, hairline systems, render times.

## Related skills

- scenario-blender-expert: the router, execution channel and review loop.
- scenario-blender-geometry-nodes: general node-group work beyond the hair assets.
- scenario-blender-texturing-shading: the head and skin under the groom.
- scenario-blender-lighting-rendering: final lighting of hero shots.
- scenario-blender-rigging: the deformation the groom has to survive.
- scenario-3d: generated characters to groom.
