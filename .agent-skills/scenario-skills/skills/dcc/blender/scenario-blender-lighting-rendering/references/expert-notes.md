# Expert notes: lighting, color, rendering, compositing, composition

Principles and judgment by expert, with the video id and `[hh:mm:ss]`. Full notes:
`notes/lighting/<id> - <title>.md`. "Measured" = re-tested on 5.2.1 in this skill's tests (see
procedures.md). [added] = not from the experts.

## Andy Goralczyk (Blender Studio art director) on film lighting, APgQKQgAdyU

- **The job:** "make sculptures that are in motion look right" [00:20:18]. Images blast by, so
  everything must read instantly [00:01:16]. Appeal and dimensionality over naturalism; fog and
  depth "at the end of the day it's a distraction" [00:19:44].
- **Gradients along the faces** matter more than the three-point metaphor [00:20:28]. Vocabulary:
  shadow area (colored by the environment/bounce), highlight (key), rim. A tiny shared language let
  two lighters do 227 shots [00:16:08].
- **Value separation** character vs background in almost every shot, checked desaturated: "your
  brain just registers all the values and then all the colors next" [00:22:09] [00:22:42]. Keep the
  action in the area of biggest contrast.
- **Vignette in the lighting**: light the center, mask the edges with falloff, the world feels
  staged [00:23:18].
- **Restrict speculars** to the eyes and the few props that must read as metal, and keep those dull:
  tiny highlights cost noise and render time and twinkle in the background [00:24:23].
- **Rim side:** day, on the key side; on the shadow side "it looks a little fake", like a bounce
  from nowhere [00:53:36]. Night: rim may move to the back to separate from the background
  [00:21:34]. Backlit: the rim is the main source, still fake a key into the face [00:21:34].
- **Continuity** comes from the sun direction relative to the set, decided from a location breakdown
  and color script, with about 30 deg of leeway toward backlight or frontal [00:29:30]. Stylize
  left/right light in shot/reverse-shot [00:36:04].
- **Color value library:** node groups of RGB values linked into every asset and light; per-shot
  deviations through a Hue/Saturation node after the library color [00:30:38] [00:31:43]. Limited
  palette: 2 to 3 greens, one ground brown [00:18:02].
- **Eye highlights:** never in the lower half ("never do this unless you're told to do so, and even
  then protest") [00:35:30]; wrong placement makes a character cross-eyed [00:32:46]; a per-shot
  arrow cheat sheet aligns animation and lighting [00:33:51].
- **Primary shots:** light the wide, propagate to coverage, "doing one shot lights five others"
  [00:37:12]. **Contact sheet** of all shots exposes outliers playback hides [00:38:59].
- **Shot session:** link a template world (no shot starts from black) [00:48:59]; split world:
  camera sees a simple drop-off, lighting world blue from above and warm from below [00:49:35]; fill
  = disk area colored from the world, low; key = duplicate, brighter, small-ish; sun angle about 2
  deg; shadow caster keeps the sun off the character [00:50:46] to [00:52:30]; darken the background
  a little [00:53:02].
- **Cycles economy:** 3 bounces (5 at most for a city; 16 is "ridiculous"), no clamping, no
  caustics, Fast GI replace saved 10 to 30 %, adaptive sampling, OIDN; tests about 100 samples,
  finals 500 to 1,500 [00:45:05] to [00:47:54]. Bounces are faked with lights [00:46:47].
- **Output:** 32-bit multilayer EXR with denoising data and Cryptomatte; comp to 16-bit EXR
  [00:41:12].
- Demo numbers (fill 2, key 20) are one quick demo, not a ratio rule.

## Andrew Price (Blender Guru) on fundamentals, ENnEYoUpFfU

- **Shadow is your friend** [00:03:41]; the many-lamp failure is the absence of shadow, not the
  count [00:02:36]. Frontal light reads as flash photography [00:05:13].
- **Kill the world** first (strength 0) so every photon is yours [00:01:32]. **Lock the camera
  before lighting**: "lighting is view dependent" [00:05:13].
- **Shadow-side lamp** dim enough that the side still reads as shadow but shows its detail; the
  textbook "fill at half the key" is "bogus", judge by eye [00:04:45]. "Every light needs to have a
  purpose", not key/fill/rim thinking [00:34:40]. So no key:fill ratio (3:1, 4:1) is a rule;
  `three_point(fill_ratio=0.25)` is a starting value [added] and the result is measured on the
  subject.
- **Ground:** always a surface; near-black, rough, so a light object reads and the shadow side does
  not merge; darken a textured ground with RGB Curves [00:09:33] [00:30:54].
- **Inverse square** (double the distance, a quarter of the light; measured 0.2501) as the attention
  tool: move a light close to what matters [00:13:27] [00:14:31]; for even priority, a distant high
  point lamp, not a flat-looking sun [00:16:42].
- **Light size:** small = shadows, scratches, normal detail; large = form, hides pores [00:21:27]
  [00:22:34]; for faces and characters, large sources [00:19:17] [00:22:34]; hard light signals sun
  or streetlamp and aggression [00:23:06]; too large flattens to "color values" [00:23:39]. In code:
  the rig key is as big as the subject radius [added], and `light_report(face=head)` flags a key
  smaller than the head [added threshold]; a 2 to 5 cm point key on a face is the wrong tool unless
  the look is toon or deliberately harsh.
- **Kelvin** for natural sources (candle about 1,500 K, incandescent 2,000 to 2,500 K, daylight
  about 6,500 K), RGB for artificial or sci-fi [00:24:11] [00:24:58]. Different colors on different
  sides separate planes [00:26:35].
- **Workflow:** point lamps first, spots later to carve [00:37:25]; never adjust a lamp with others
  visible [00:35:13]; A/B every change; try a radically different setup to escape micro-tweaking
  [00:40:10]; ask a fresh eye [00:42:21]. 80 mm for boxy products, 50 mm distorts [00:32:32].

## Andrew Price on EEVEE, -gW6vk_OuNQ

- EEVEE is "technologies stacked on each other's shoulders wearing a trench coat" [00:03:09]; screen
  space only knows what is in front of the camera [00:10:50].
- **Ray tracing is off by default** [00:09:07] (measured: factory `use_raytracing` False). Pure ray
  tracing is dark and muddy on rough surfaces: Fast GI is required [00:22:09]; 0.5 max roughness
  splits them [00:25:26]; Fast GI steps 16 minimum [00:28:23] (measured on 5.2.1: 8 vs 16 almost
  identical after the overhaul); most bounce from a baked volume probe [00:28:57].
- **Leaks:** thick walls in any engine [00:02:36]; shadow steps 10 to 16 [00:04:47]; very soft
  lights still leak. **Penumbra noise:** shadow rays 2 instead of more samples [00:08:11].
- **World leak:** without a volume probe, world light fills a sealed room [00:37:14]. He places the
  outermost grid points exactly at the inner wall ("the last point needs to be the exact position of
  the wall") [00:38:22] and warns that a high search distance lets points jump through walls
  [00:41:10]. Measured on 5.2.1 (test_13): 5.2.1 puts the samples one spacing inside the box faces
  (local (i + 1) / (N + 1) x 2 - 1, from the shader in the binary), and the leak follows where the
  outer samples sit: 0.44 m inside the walls 0.223, 0.2 m 0.054, at the walls 0.0022, half a 0.2 m
  wall deep 0.0007, 0.1 m past the outer face 0.0091 (no probe 0.26). **Andrew's rule holds.** The
  skill's first version sized only the box, assumed points on its faces, and wrote that the rule was
  not reproduced; its "wall + half a cell" box had in fact put the samples within 1.3 cm of the
  walls. `volume_probe_for_room` now sizes the box from the sample positions.
- **Probes:** plane probes spawn under the floor [00:15:47]; sphere probe clip start: too low
  self-reflects, too high opens a portal [00:55:30]; probes cannot see other probes [00:18:48]; fog
  and glass block volume bakes, hide them [01:04:39]; re-bake after material changes [00:49:02]; add
  probes only where artifacts show [01:12:42]; surfel resolution 100 [00:43:51].
- **HDRI:** the sun extraction threshold applies after the Background strength [00:51:15]
  (measured); he sets threshold 0 and adds his own sun lamp [00:51:50].
- **Glass:** thin glass cannot show what is behind via refraction; fake glass = Transparent + Glossy
  by Layer Weight Facing [00:59:15]; glass close-ups belong in Cycles [00:56:36]. 5.2 adds
  Principled Thin Wall (g4OXlrxqIx0 [00:17:59]).
- **Performance:** removing constant texture maps took 11 s to 4 s per frame [01:11:04]; final ray
  tracing 1:1, GI 1:2; 1/16 flickers [01:15:34]. Temporal accumulation smears textures [00:48:28].

## Gleb Alexandrov (Creative Shrimp) on EEVEE portraits, 6hPZ0ckL5I0

- One well-placed light is often enough [00:00:56]. Any angle beats frontal: "flattening, not
  flattering" [00:02:56] [00:14:48].
- **Custom distance** high so lights behave physically [00:01:26] (measured: automatic distance
  loses 8 % on a low-power area light). **Per-light jitter** for microshadows under nose, chin,
  eyelids, "absolutely critical" [00:05:55] (measured: head p5 luma 0.0060 to 0.0044).
- Skin: Specular IOR Level above 0, smaller SSS radius, low Material Output Thickness [00:04:24]
  [00:04:54].
- HDRI needs ray tracing on (occlusion, no leaks behind ears) [00:08:00]; split world with Is Camera
  Ray to darken the backdrop without darkening the face [00:08:34] (measured: works fully in 5.2.1
  EEVEE); for HDRI stills: denoise off, Fast GI off for precise contact shadows, resolution 1:2 or
  1:1 [00:10:47].
- Cinematic layer: harsh backlight sun as kicker motivated by the plate, duplicate with a large
  angle as wrap, bounce lights colored from the plate; stop before it "looks lit" [00:09:42]
  [00:17:06] [00:17:36] [00:19:40].
- Eye light: tiny, far, light-linked to the eyes, diffuse down: "that tiny little glint? That's
  emotion" [00:20:35] (measured: linking honored in EEVEE and Cycles).
- "Be generous with haze" [00:21:12]. View: ACES 2.0 or AgX High Contrast with a little exposure;
  Khronos PBR Neutral oversaturates skin [00:21:42].

## Lino Thomas (Egosoft art director) on color, Xqne7oRxSjM

- Contrast in value, saturation **and** hue; when an image fails one is missing; "contrast of
  contrast" [00:01:06] [00:01:38]. Think in gradients of all three on every surface [00:02:04].
- Screen color wheel is additive (red vs cyan) [00:02:58]. Vectorscope beats gut feeling [00:05:39].
- **Balance:** one saturated focus color; its complement desaturated over a large area or saturated
  only in small dots; two full-saturation opposites "look like a child drawing" [00:07:40]
  [00:08:15]. Triadic: one saturated focus, two toned down [00:09:19].
- Start from darkness, be bold with the sun; volume with anisotropy for a haze gradient; foreground
  high contrast, background midtones [00:16:07] [00:17:13] [00:17:45].
- **Blockers:** hole-cut cube around the camera darkens the frame sides; shadow distracting shapes
  instead of painting them black; move a blocker away from a surface to widen the gradient
  [00:18:19] [00:19:25] [00:20:34].
- **Fake second sun:** spot with a 1 deg cone, far and bright, over the hero; a blocker keeps the
  real sun off it; two real suns only brighten everything [00:22:24] [00:25:05]. Exclude faked
  lights from volume scatter [00:23:29].
- Rims colored by eyedropping the rendered background, then raised in value [00:30:45]. Counter-hue
  dirt lands near neutral under colored light [00:33:09]. Sneak the foreground color into the
  background and back [00:43:31]. Explore hue rotations on the render, then eyedrop winners back
  into 3D [00:45:47].

## Jacob Holiday (VFX) and Nathan Vegdahl (color science), qt1GidFwVt0, SqJ_rtaPqg4

- Name the color space and transform at every hop [00:09:49]. Data maps Non-Color [00:10:50]. The
  image color space dropdown is a transform, not a label [00:13:36].
- View transform = working space to display; Standard clips, AgX/Filmic/Khronos compress [00:16:03];
  a look is an artistic adjustment before the transform [00:16:36].
- PNG bakes view, look and display (Follow Scene); EXR stays working-space linear [00:19:17];
  intermediates wide and linear, finals display-referred [00:17:40]. Background footage needs View
  as Render [00:28:09]. Khronos PBR Neutral for brand RGB fidelity [00:45:24] (measured: a brand red
  or blue in a white furnace within 3.8 of 255 steps, AgX 27 to 42, Standard 33; a zero channel is
  lifted to about 24 by its toe; above the knee it compresses). AgX stays the scene transform.
- **Exposure, not light energy, for global brightness** (digest attribution [00:16:36] [00:45:24]):
  measured, exposure +1 equals every emitter x2 exactly, while doubling only the lamps leaves the
  world and emissive surfaces behind and changes the ratios. 5.2 adds camera log spaces (V-Log,
  S-Log3, LogC4, Apple Log), so his Resolve pre-conversion is unneeded.
- Vegdahl: the horseshoe is cone-stimulation ratios, not "all visible colors" [00:22:45];
  equal-channel white vs perceptual white [00:33:19]; **the working space changes render results**
  [00:44:14] (measured: the operator converts existing colors; choose once).

## Andrew Price on composition, O8i7OKbWmRM

- Pyramid: one focal element, then a structure, then balance [00:01:00]. The highest-contrast area
  becomes the focal point regardless of intent (bright window beats the couch) [00:04:00]. Two equal
  focal elements irritate [00:11:00].
- Stack 3 to 5 cues on the one element: contrast, saturation, focus/DoF, face or figure, guiding
  lines, framing [00:05:30] to [00:09:30]. Never lead the eye off the page; place stoppers
  [00:08:00] [00:10:30].
- Structures: thirds (character plus environment, dialogue), pyramid (heroic, low camera), symmetry
  (calm, power, reflections), full frame (single subject); "any structure is better than none"
  [00:12:30] [00:14:00] to [00:22:00]. Near a thirds point is enough [00:15:30].
- Balance around the vertical center like a scale; figures carry weight even small and dark; shadows
  balance masses [00:22:30] [00:26:00] [00:28:30]. **Squint test** = contrast up plus blur, then a
  second pass for saturation, faces and figures [00:25:00].

## Robin Ruud, Pau Homs, Habib Gahbiche on passes and the 5.x compositor

- Robin (vtdczoXVyvQ): studios split light and layers so late changes need no 3D re-render
  [00:32:55] (light groups: one render, key/fill/rim/window gains in comp); multilayer EXR, half
  float, DWAA [00:01:30]; back to beauty = per component (direct + indirect) x color, plus emission
  and environment; group defaults black for added inputs, white for multiplied [00:03:10] [00:04:52]
  (measured exact, 7.6e-7); "things that both go in front of and behind other things need holdouts",
  shadow/light casters are indirect only [00:17:14] (measured); render single layer after a fix
  [00:17:47]; "the image saved in linear should look awful" [00:19:33]; "if you don't know why you
  need this then you don't need it" [00:32:21].
- Pau (kAWfjBKcgFc): "always, always comp your renders" [00:01:10]; minimum finish bloom +
  vignette + correction, not "2013's Instagram" [00:06:32]; order matters [00:07:04]; passes as
  masks (inverted AO, Cryptomatte, glow by pushing above 1) [00:08:59] [00:09:32]; AO multiply is
  for EEVEE, it double-counts in Cycles [00:08:27]; pixel-unit inputs through Relative To Pixel
  [00:11:54] (measured); viewport comp shows passes only with EEVEE [00:10:49]; render Cycles
  animation dry and comp from EXRs in another file [00:12:47].
- Habib (hFzg41j68hg): the compositing tree is its own node-group data-block [00:20:28]; options are
  sockets; "if you think about vignette, you should have a vignette" (assets) [00:13:59].

## Wyatt Hall and the Singularity team on stylized looks, M4v_hfGF4EM, NJGyiWqNJoE

- Wyatt: plan the final image in comp from day one, character and environment lit separately, down
  to headlights vs body lights [00:07:23] [00:07:57] (vanilla 5.2: Cycles light groups,
  `BL.light_groups` + `lightgroup_mix`, measured to match a re-render within noise; EEVEE has no
  light-group outputs, use light linking and view layers); lookbook with don'ts and a key visual
  [00:04:39]; terminator tint band, subtle ("if you squint it's there") [00:11:07]; soft low-res
  shadows "suggest depth as opposed to prove it", crisp ones for toon terminators [00:18:26]
  (measured: filter radius + coarse resolution limit double the in-between share; a big jittered key
  dithers a toon terminator); LOD by screen coverage not distance [00:21:09]; topology follows
  desired shadow shapes, normals from a static proxy via Data Transfer, never edited on the
  deforming mesh [00:28:36] [00:29:40]; AOV names must match exactly or nothing renders, silently
  [00:43:07]; rim and light wrap in comp when materials are library-linked [00:49:42]; never step
  animation globally after the fact [00:38:31].
- Singularity (Blender Studio): additive glow keeps stacked strokes brightening, needed for HDR
  [00:24:07]; watercolor edge layers from distance to silhouette with chroma shift per layer
  [00:23:32]; sphere-mapped strokes read the same from any angle [00:22:59]; timing chosen on a
  painterly render test: local motion on twos, big travel on ones [00:42:47] [00:43:56]; scale
  without atmosphere: shrink the giant with distance, add swarms of small creatures [00:49:33];
  "sometimes 95% is good enough" [00:07:22].

## Where experts disagree, and the deciding condition

| Choice              | A                                        | B                                              | Decide by                                                                                         |
| ------------------- | ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Light vocabulary    | Named roles (Andy, Gleb)                 | Purposes only (Andrew)                         | Many shots or people: shared vocabulary; one still: purpose                                       |
| Fill level          | Demo values (Andy)                       | "Half the key is bogus" (Andrew)               | Neither is a rule: measure on the subject (`light_contributions`, light-group shares, form ratio) |
| Rim side            | Key side (Andy, day)                     | Opposite, motivated (Andy night, Gleb kicker)  | A visible or implied source behind on that side                                                   |
| EEVEE Fast GI       | Required (Andrew, bounce interiors)      | Off for HDRI portraits (Gleb)                  | Interior bounce vs close-up HDRI character; re-test on 5.2                                        |
| RT denoise          | Keep, temporal off (Andrew)              | Off (Gleb, stills)                             | Stills tolerate noise; animation needs denoise                                                    |
| HDRI sun            | Threshold 0 + own sun (Andrew)           | Keep HDRI sun, soften (Gleb)                   | Need to art-direct sun height vs keep the plate's key                                             |
| Where to grade      | Blender compositor (Lino, Pau)           | Resolve/Fusion from EXR (Jacob, Robin)         | Agent: Blender; keep EXR masters for a human colorist                                             |
| View transform      | Khronos PBR Neutral (Jacob, brand color) | ACES 2.0 / AgX High Contrast (Gleb, portraits) | Product color fidelity vs photographic skin                                                       |
| Volumes             | EEVEE excels (Andrew)                    | Cycles fine now (Lino)                         | Budget and animation length                                                                       |
| Comp inside/outside | Blender (Pau, Habib)                     | External (Robin, Wyatt)                        | Headless agent: Blender; handoff to other departments: EXR                                        |
| Structure           | Thirds (default)                         | Pyramid, symmetry, full frame                  | Character + environment: thirds; heroic: pyramid; calm/architecture: symmetry                     |
