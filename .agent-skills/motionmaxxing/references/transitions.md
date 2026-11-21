# transitions.md: how beat A becomes beat B

See also: motion.md (eases, whips, camera, shutter blur), ui-demo.md (cursor and UI beats that get cut), type.md (line replacement), close.md (endings), director.md (continuity and handoff planning; film shapes), world.md (grounds are surfaces), slop.md (Part 1b: when a fade or dissolve is right), layout.md (section 0: a chapter break is never a label).

A catalogue of the ways 53 measured moments (IDs M913-M974) leave one beat and enter the next, with mechanics, numbers and the object that carries the eye. Nearly every join in the sample is a hard cut made invisible by something else: motion, a carried object, a wipe that crosses the cut, matched blur, or an effect that turns into the next scene. Scene-to-scene crossfades do not occur in this corpus; that is the default, not a law: a calm brand voice, a dissolve that *is* the meaning (privacy, forgetting) or a blur that copies a real focus pull may fade (slop.md Part 1b has the conditions). Per-property durations and eases are in motion.md; typography of the lines being swapped is in type.md.

Conventions. Time as `s (f@30)`; 1 f = 0.033 s, 3 f = 0.10, 6 f = 0.20, 10 f = 0.33. Source fps differ, noted where it matters. Positions are normalised frame coordinates (x, y in 0-1), sizes % of H (height) or W (width). Rule format: **WHEN** situation -> **DO** decision -- *because* effect (IDs). Each catalogue entry lists *what*, *mechanics*, *use when*, *eye carried by*, *evidence*.

---

## 1. Anatomy of a cut

Seen across the sample, in order:

1. **A accelerates into the cut** (last 3-8 f): an exit with growing step size, a shrink with biggest step on the final frame, blur/smear ramping, or an action peak. Steps seen: 0.033, 0.022, 0.031, 0.014, 0.024, 0.031, 0.034, 0.051 (M959); lockup 1.0 -> 0.835 accelerating (M938); roll to -76 deg with 22 px smear (M944); card 17 -> 111 px/f (M920).
2. **The cut itself**: one frame, zero fade. 96% of moments have hard visibility switches (median ~20 cut-frames per moment), 25% of exits are hard steps (MEAS).
3. **B's first frame is already moving or already built**: a card sliding 105 px in frame 1 (M914), a modal at 1.42x already zooming out (M918), a word half-risen (M938), a hero mid-open (M933), a layout pre-built then moved (M940).
4. **Optional 0-3 empty frames** where the vector continues: 3 empty gradient frames after a whip (M916), 2-3 empty ground frames after a slide-out (M919), 1-frame empty text gap (M936).
5. **B's entrance continues A's vector**: the new word drifts up-left after the up-left whip (M916); smear that ends A is the smear that starts B (M925 -> M926).

**R1.1** WHEN you plan a cut -> DO author it as a pair: spec A's last 6 frames and B's first 6 frames together (object, position within ~0.02, scale, colour, blur, ground, velocity), then draw both -- *because* in every handoff in the sample something concrete is identical across the cut (all films).
**R1.2** WHEN a clip ends -> DO end on a peak (peak velocity, maximum compression, still-shrinking lockup, half-faded field) -- *because* the next clip inherits momentum; settled endings exist only in M946 (3.66 s living hold) and M968 (0.67 s static lockup before its outro).

---

## 2. Catalogue

### T1. Hard cut on motion
- **What**: the cut lands mid-move at peak velocity, never on a settled frame.
- **Mechanics**: (a) A's exit accelerates and the cut lands on its fastest frame (button edge 0.37 -> -0.16 W in 5 f, M919; whip cut mid-smear at 65 px, M916; shrink step biggest on the last frame, cut at 1.53, M959; growth cut mid-acceleration 2.67x -> peak 1.23 s, M948; scan fade 0.73/0.50/0.30/0.13 then cut 2.07, M954; stacks scaled 2x cut at 2.53, M941; arc circle 0.25 W with empty cream at right, cut 3.04, M958). (b) B opens in motion (M914 card 862 -> 757 px in frame 1, 53% by frame 2, 72% by frame 4; M918 1.42x -> 1.07x fast ease-out; M913 camera already at 3.3x and sliding). (c) If B is an empty or one-frame field, let it arrive built, then move it: layout visible at full size, overlay clearing in ~0.36 s, panel dropping 0.09 H decelerating (M940 trace panel after the 1.28 hard cut).
- **Use when**: any scene boundary by default; the sample has no crossfades between scenes.
- **Eye carried by**: velocity and direction across the cut.
- **Evidence**: M914, M916, M918, M919, M941, M944, M948, M954, M958, M959, M940, M953 (cursors jump to new positions rather than interpolate).

### T2. Carried-object match cut
- **What**: the same object (or same layout) sits at the same screen position and pose on both sides.
- **Mechanics**: match position within ~0.02, scale, colour and the velocity vector; start B mid-motion. Examples with numbers: a dot at (0.28, 0.50) -> (0.27, 0.50), the seed of the next product shape (M962 -> M963); a token module/badge at x 0.32, ticker x 0.40, subtitle y 0.58 becomes the app header (M921 -> M922); an empty #0B0B0B card with a 1 px #292929 border -> the same card with a 1.5 px #262627 border (M914 -> M913); a gray caret 0.008-0.01 W x 0.25 H at x 0.50, y 0.38-0.63 -> the typed-prompt scene (M948 -> M949); a badge lattice, cols x 0.18/0.39/0.62/0.83, rows y 0.12/0.50/0.88, headline ink x 0.36-0.64 at y 0.47-0.53 (M934 -> M935); panel right edge x 0.20, y 0.16-0.85, 8 toggles, avatar columns x 0.84/0.96 (M933 -> M934); a card at (0.33, 0.15), 0.37 x 0.76 over a 4 px blurred prompt with the cursor parked at (0.24, 0.64) (M942 -> M943); a card at (0.17, 0.43) still easing up -> (0.17, 0.42) still drifting (M939 -> M940); badge/connector/motif columns at the same x stops (M945 -> M946); a lockup at the same centre (M973 -> M974); one headline at 0.74 W, 0.11 H over a swapped backdrop (M918 -> M919); a title off-centre at x 0.47 with the same washes and a moving icon (M947 -> M948); a one-frame word card at centre (0.46, 0.53) -> same word opening the next scene (M957 -> M958); the last terminal frame held for exactly 1 f, then black (M958 -> M959); the same smeared six-photo orbit with 35 px tangential smear (M925 -> M926); a five-dot loader ring at (0.65, 0.50) (M926 -> M927); the typed value and data string carried through four clips (M921-M924).
- **Use when**: you want two clips to read as one take; every film in the sample does this at most boundaries.
- **Eye carried by**: the object that does not change.
- **Evidence**: above.

**R2.1** WHEN a film has several moments -> DO choose, for each boundary, one carried object (caret, dot, card, headline, cursor position, ground colour, text string) and record it in a handoff table -- *because* a film of 15 different looks still reads as one piece (M947-M959, M913-M920).
**R2.2** WHEN the recurring character exists -> DO let it dock into a UI slot each time and change scale up to 6x between moments (disc: 0.25 W -> 0.22 W -> 0.036 W -> 0.10 W -> 0.04 W) -- *because* the viewer follows one object (M942, M943, M944).

### T3. The effect becomes the next scene
- **What**: the thing that finishes A is the ground or surface of B.
- **Mechanics**:
  - *Burst -> ground*: a navy burst grows 0.37 -> 0.81 W with blur 3 -> 25 px over 5 f (3.93-4.07 s) and a lavender glow radius 0.26 -> 0.47; next clip frame 0 is the burst as a black band with lavender page strips at y 0-0.18 and 0.82-1.0, cropped copy from the previous scene still at the top left, the disc carried across at 12% opacity; band expands to full frame by 0.30-0.33 s, strips slide away (M943 -> M944).
  - *Wave -> wipe*: the brand shape's own white stair-edged wave starts at x 0.73 at 1.80 s and floods left while the world jerks left by -0.04, -0.10, -0.29, -0.41, -0.63, -0.86 W (per-frame jumps up to 0.22 W, one repeated frame), full white at 2.23 s, then the logo pixel-resolves (M946; see T9).
  - *Growing bead -> full-frame disk*: a 0.04 W bead runs the rim of the device, grows x1.5-2.2 per 0.05 s (0.07 W at 4.00, 0.11, 0.24, 0.37 at 4.12) then at 4.13 hands off to a white disk 0.58 W, 1.01 W at 4.20, pure white by 4.23 (17x total); the new scene's first element is the old action's carrier (M922).
  - *Centre dot -> next surface*: a centre disc 0.01 W -> 0.23 (1.00) -> 0.47 (1.25) -> 0.68 -> 0.90 (1.42) -> fills the frame by 1.58 as a rounded rect relaxing from a circle, the content on a separate scale track (M935); a dot -> 0.33 H disc by a hard step then +11% ease-out (M962); a dot -> 0.15 W QR in 0.30 s (M954).
  - *Dark band over the button*: a far-track dark band sweeps down with a 25 px blurred edge, only a 13% dark strip is left on a pale frame at 1.83, the cut at 1.85 sits inside it (M924).
  - *Shapes -> wash -> brand*: feathered teal haze rises from the bottom (feather 0.28 H, 0.4 s), content swells 1.07 -> 1.20x, objects fade bottom-first, at the peak frame everything gives way to a pale gradient (never a solid colour) (M938).
- **Use when**: A's last action has a visible product (a click, a burst, a wipe, a growing mark) and B is a different ground or act.
- **Eye carried by**: the effect's own growth and direction.
- **Evidence**: M922, M924, M935, M938, M943, M944, M946, M954, M962.

**R3.1** WHEN the ground must change -> DO make the effect of A's last action (a burst, a growing disk, a travelling band, a feathered wash) fill the frame and become B's ground -- *because* the change has a cause and a direction; never a white flash (M922, M924, M943, M938).

### T4. Container replacement
- **What**: the old container (bar, card, pill) contracts and a new container takes its place at full size; or a one-frame placeholder holds the slot.
- **Mechanics**: old container eases in and contracts ~9% (0.70 -> 0.64 W, 0.13 -> 0.12 H, biggest step on the last frame, pointer riding the shrinking button); hard replacement: bar and pointer gone, new card 0.83 x 0.85 at x 0.09, y 0.08 appears at full size with a faint 0.02 W halo; ground shifts one step darker (#ECEBE3 -> #C4C2B1) (M969). A ONE-frame placeholder card or capsule (0.30 W x 0.06 H, radius 16 px, #EEEEEE with 1 px #727672 rim at x 0.35-0.65, y 0.74-0.80) steps in on the last frame while phrases slide out, and the next scene's content fills it (M966). A one-frame lone empty rounded card as B's first frame, carrying border and surface colour (M914 -> M913); after the lockup softens (1.5 -> 6 px blur), a one-frame step at 4.27 s to a new blurred mint panel 0.34 W x 0.20 H, 45 px radius that opens the next shot (M926); an empty near-white UI frame with the same panel position as B's first frame (M941 -> M942).
- **Use when**: A ends on an input or a list and the result is the next container; also when the next scene's content is not yet known to the viewer.
- **Eye carried by**: the container outline and position.
- **Evidence**: M969, M966, M914, M913, M926, M941, M942, M958 (badges replaced by a dumbbell in 1 f at 1.90, then 5 f recolour).

**R4.1** WHEN the next scene is a result in a box -> DO contract A's container ~9% on `M.ease.gentleIn`, then replace it outright at full size with a faint halo and a one-step ground shift; use a 1-f empty capsule/card as a placeholder if B needs a beat to arrive -- *because* the cut is the proof of the click and no frame is spent on a loading state (M969, M966).

### T5. Grey/flat dip hiding a theme flip
- **What**: a 4-frame contrast dip masks a light -> dark flip plus a magnification.
- **Mechanics** (24 fps source): contrast washes 30% (1.21 s) -> 65% (1.25) -> ONE flat #7D7D7D frame (1.29) -> dark macro under a grey veil (1.33) -> clear by 1.42. Across the dip the same object is magnified ~1.5x (rail height 0.14 H -> 0.21 H, labels 0.05 H -> 0.07 H) and inverted to dark; the action carries over (the selection pill that was sliding right continues onto its target, left edge 0.32 -> 0.38 -> 0.45 -> 0.56, decelerating, peak 0.04 W/f, rim smear, no overshoot).
- **Use when**: the film changes mode (human UI -> AI part) and a light-to-dark and scale jump would otherwise show.
- **Eye carried by**: the continuing pill/slide and the same object at 1.5x.
- **Evidence**: M916. Similar but harder steps: light plateaus of 0.3-0.4 s with 1-f gaps (white 3.90-4.20, teal 4.23-4.53, cyan 4.57-4.97, white 5.00) for a state change inside a scene (M944).

**R5.1** WHEN a theme flip would be visible -> DO hide it in a 4-frame flat grey dip, not a black cut, and carry the object's motion across (M916); for a state change within a scene use hard plateaus of 0.3-0.4 s with a 1-f gap, never cross-fade (M944).

### T6. Blur-matched cut
- **What**: the exit ends blurred and the entrance starts more blurred, so the cut disappears into defocus.
- **Mechanics**: (a) exit: scale shrinks slowly 1.0 -> 0.82 over 0.6 s then accelerates 0.74 -> 0.25 in 0.48 s, opacity 1 -> 0.42, blur 0.7 -> 18 px (0.84 -> 1.08 s) with an 8 px blurred copy at 0.4 opacity; (b) cut at 1.12 s into the zoomed state starting as an 80 px defocused pale smear; (c) a bottom -> top soft focus wipe, 4 f (lower line sharp at 1.20, upper at 1.28); no white frame (M937). (d) Whip version: last 3 f of A ramp text blur 8-20 px and a ~100 px horizontal smear; one-frame discontinuity into a view at ~2x already blurred (the button as a smeared pill); sharpens over ~8 f (M931 1.53 -> 1.80). (e) Heavy blur on both sides of a cut with a wipe crossing it (M930 -> M931). (f) First frame of a new word with 12 px smear continuing a whip vector (M916).
- **Use when**: the film's language includes blur (smear grammar). In a crisp film use T13 with content changing inside the whip, not blur.
- **Eye carried by**: blur level and direction; the viewer reads the cut as inertia.
- **Evidence**: M937, M931, M930, M916, M926, M944.

**R6.1** WHEN you cut between zoom levels with blur -> DO ramp the exit blur 3-8 f, start the entrance at >= the exit's blur (18 -> 80 px) and resolve over ~8 f (0.27 s), bottom-to-top or in place -- *because* equal-or-greater blur on the incoming side hides the discontinuity (M937, M931).

### T7. Wipe that starts in A and finishes in B
- **What**: a gradient or band begun at the end of A is completed in B's first frames, so the cut hides inside the wipe.
- **Mechanics**: A's last frames: a grey-to-white gradient sweeps down from the top edge (<10 px strip at 2.87 s, #F4F4F4 to y 0.10 and grey to y 0.21 by 3.07, max ~0.43 H) while the card sits at the same position; B's frames 0-2 hold a blurred remnant of exactly that (dark lower gradient from y 0.63, blurred sticker blobs cut by the bottom edge, same card bobbing down to y 0.76) and the white finishes wiping the dark away by 0.10 s (M930 -> M931). Variants: a dark band sweeping down over the hero with a 25 px blurred edge, the cut inside it (M924); a bottom-up wash (mask opaque .72 -> .07 over 0.28 s) then a hard cut to an empty field (M940 at 1.28); a teal band top -> bottom with 0.22 H falloff covering to y 0.58 at 3.67 s and the scene vanishing exactly as the next headline word lands (M927).
- **Feathered scene wipe in the next scene's ground**: feather 0.31-0.42 of the wiped axis, 0.56-0.6 s long (a short wash 0.28-0.32 s), painted in the NEXT scene's ground colour (#F1F7F9); under-wipe text stays sharp and static; the next hero starts 0.1-0.12 s before the wipe completes; rotate direction across the film (R -> L, B -> T, B -> T, R -> L); the wipe starts 0.1-0.2 s before the voice line ends (the wipe leads the voice by 0.16 s) (M939 chat -> diagram 3.12-3.68 s; diagram -> card 5.68-6.28 s; M940).
- **Use when**: both scenes are content-heavy (chat -> diagram, list -> trace) and a cut alone would be abrupt; use the plain hard cut (T1) when the incoming scene is empty or one frame of UI.
- **Eye carried by**: the edge of the wipe; the overlap with the incoming hero.
- **Evidence**: M930, M931, M924, M939, M940, M927.

**R7.1** WHEN two content-heavy scenes meet -> DO start the wipe in A (0.1-0.2 s before the voice ends), let it finish inside B's first 3 frames over a blurred remnant of A, and paint it in B's ground colour with a 0.31-0.42 feather -- *because* overlap kills dead time and the wipe reveals rather than erases (M930, M931, M939, M940).

### T8. Mask / clip-edge wipe through glyphs
- **What**: a clip edge or soft mask sweeps through text (or a logo) so lines erase and reveal mid-glyph; no crossfade.
- **Mechanics**:
  - *Erase*: clip-path inset-left 0 -> 100% across a line in 5 f, cutting mid-glyph (fractions 0.94/0.87/0.76/0.33/0.23/0), accelerating, while the line slides the same way and its carrier dot shifts 0.59 -> 0.51; the visible text shrinks to its last fragment (a trailing number), then nothing; the dot then eases to exact centre in 0.07-0.13 s and holds 0.17 s (M962).
  - *Two independent soft masks swap a question for a name*: erase front keep-right, x 0.44 at 2.34 s -> 0.52 (2.47) -> 0.57 -> 0.61 -> 0.63, gone at 2.60; reveal front unmasks the wordmark behind the dots with a 25-45 px mint leading edge, x 0.35 (2.24) -> 0.40 (2.47) -> 0.48 (2.54) -> 0.60 (2.67), peak ~60 px/f, done 2.74; the erase front leads the reveal front (a ~0.1 s empty breath); the wordmark is revealed in place (left edge creeps 0.35 -> 0.32) while the mark slides back across the text as its tail (M926).
  - *Centre-outward erase*: the first word erases from its right and the second from its left, fragments still visible over the next word's first letters for 2-4 f (M947).
  - *Soft L -> R wipe of a status line* 0.16 s followed by a green check drawn on 0.08 s (M919).
  - *Clip-edge reveal/collapse of a surface*: a window opens from a 0.10 W slit with top/bottom fixed and content cropped never stretched, jump +0.22 W in one frame (M944); a surface collapses around an orb while children stay full size and are cropped by the shrinking rounded mask over 10 f (M943).
- **Use when**: text or a label must be replaced in place, or an element is replaced by another that is its continuation.
- **Eye carried by**: the moving mask edge (mint 25-45 px leading edge in M926).
- **Evidence**: M962, M926, M947, M919, M944, M943.

**R8.1** WHEN a line is replaced by another thing -> DO sweep a clip edge through it (5 f, accelerating) or run two soft masks with the erase front ~0.1 s ahead of the reveal front, never crossfade -- *because* mid-glyph cuts feel physical and the gap is a breath (M962, M926).

### T9. Stair / block wipe in screen-grid steps
- **What**: a wipe whose front advances in whole screen-grid jumps, no interpolation.
- **Mechanics**: 80 px (0.06 W) jumps; 3 stacked brand-colour rects at 0.68/0.30/0.20 opacity (core ~0.8, bands ~0.44, ~0.2); glyphs inside the core white, in the bands grey, outside charcoal; the front travels right and up in discrete positions (core x -0.06-0.31, y 0.74-1.00 at 2.64 s -> x 0.38-0.56, y 0.63-0.84 at 2.72 -> x 0.69-0.75, y 0.53-0.69 at 2.80 -> two 80 px columns 2.84-2.96 -> gone 3.00); the new text reveals behind the front (the first word at 2.64, then +1 glyph/frame, whole by 2.92) (M937). The stair-edged white wave of a brand motif floods left with the world jerking left by accelerating offsets, one repeated frame (M946, offsets in T3).
- **Use when**: the film's world is a grid of tiles or a stepped brand shape; the wipe takes the grid as its unit.
- **Eye carried by**: the stepped front; the text revealed behind it.
- **Evidence**: M937, M946.

### T10. Pixel / mosaic dissolve with stepped coverage
- **What**: a field of real hard-edged cells dissolves or resolves; opacity is not used.
- **Mechanics**:
  - *Field -> logo (A to B)*: cell 0.025 -> 0.02 W; coverage 90% (0.00 s) -> 60% (0.08) -> 35% (0.13) -> 10% (0.21) -> 0 (0.33), opening bottom-up; the stripe band resolves from white/magenta residue by 0.42 (M965).
  - *Mosaic bridge*: a 12 x 12 hard-cell grid (cell 106.7 x 60 px) at peak for 2 f, retreating to the corners in 3 steps (85.3 x 48 at 1.07 s, 75.3 x 42 at 1.13, 64 x 36 at 1.20, none at 1.27), over blurred lavender blobs; the ground ramps near-white -> cool -> cream by 1.60 (M968).
  - *Number or logo resolve*: final value present from the first frame, resolves L -> R through 12-15 px squares and ASCII to real glyphs while scaling 96 -> 176 px, hold 0.47 s, dissolve from both outer digits toward the centre in 0.33 s (M945); a flame fills inside its silhouette with 2-3 px dots on a 6 px grid, dense dots, then solid rising from the base (0.6 s), the word with a solid front L -> R over ~13 f with paired frames (M946).
  - *Field -> object*: dots from the ground dissolve at ~50% fill, then drop out in place 25% -> 10% -> 2.5% -> 0 over 0.27 s (M927); 190 -> 120 -> 60 -> 15 random dots fading over 0.2 s (M963).
- **Use when**: the brand has a pixel/dot/ASCII texture (the cells carry brand colour); a logo or number needs a "digital" reveal.
- **Eye carried by**: the cell grid and the front.
- **Evidence**: M965, M968, M945, M946, M927, M963.

**R10.1** WHEN you dissolve a field -> DO use real cells 1.5-2.5% W with stepped coverage (90 -> 60 -> 35 -> 10 -> 0 over ~0.33 s, from the bottom, or a grid retreating to the corners in 3 steps over 0.27 s) -- *because* pixel occlusion reads as craft and opacity reads as default (M965, M968).

### T11. Zoom-through / dive into a logo detail
- **What**: the camera scales into one detail of the logo until it becomes the next surface.
- **Mechanics**: scale 1 -> 21.9x in 0.533 s at a constant octave rate (see motion.md 6.6); translation follows the underscore, not the frame centre, so the logo's wordmark exits right (only its first letter at 0.40 s, gone 0.47) and the underscore's left end exits left after 0.40 s; the underscore becomes a white pill/mass (0.68 H tall at 0.73 s, 0.93 H at 1.08 s, full width, 11 px periwinkle band at the top); fade IN PLACE over 3 f (opacity 1/0.48/0.04/0), 3 blank frames (1.133-1.183 s), then a container zooms OUT from outside the frame (top/bottom 0.05/0.98 -> 0.16/0.88 -> 0.22/0.82 -> 0.25/0.78 over 0.62 s, stroke 10 -> 4 px), a 10 px outline band at the vanished pill's line (M974). Related: zoom onto a button to x4.39 before the click, then the zoomed group slides out left accelerating (button left edge 0.37 -> -0.16 W in 5 f, smear 20 -> 140 px) and 2-3 empty frames follow (M919).
- **Use when**: brand -> product ("the logo contains the product"), or a close-up zoom is the setup for a click.
- **Eye carried by**: the feature being dived into; the horizon line shared between pill and container.
- **Evidence**: M974, M919.

### T12. Pull-back reveal with snap
- **What**: the product is shown as one magnified fragment, then revealed by pulling back.
- **Mechanics**: a card at 3.3x (0.76 W x 0.44 H, text 36 px) shows a 3-step checklist; the editor fades up behind it over 0.48 s (2.52-3.00) while the pull-back starts slowly (3.31 -> 3.01 by 3.00 s); the last tick lands mid-pull (2.72); one-frame snap 3.12 -> 3.16 (scale 2.50 -> 1.41, ratio 0.56) and a 0.56 s decelerating settle to 1.0 at 3.72 (M913). Variants: grid pulled back in two surges, 2.5 -> 1.85 (0.28 s), near-stall (1.79 -> 1.73 over 0.28 s), -> 1.08 (0.32 s) -> 0.875, tiles popping 1 f apart as the pull reveals their cells (M937); a card expanding as a zoom-out, header content 1 -> 0.389 while the surface grows, width .63 -> 1.06 -> .82, children stepping in whole every 1-2 f (M939). The pull is released 0.40 s after completion so cause -> effect reads.
- **Use when**: "it was inside a real product" is the beat; the next scene is the whole interface.
- **Eye carried by**: the fragment that stays in frame while the camera retreats.
- **Evidence**: M913, M937, M939.

### T13. Whip pan with content changing during the whip
- **What**: a fast pan (median 8 f, peak ~13% W per frame, peak speed at t 0.25) in which the old content exits and the new content arrives inside the move.
- **Mechanics**: crisp-film version: world x 0 -> -1000 px over 0.79-2.00 s: 27% of travel in the first 10 f (ease-in), 31% in 2 f, 49% in the 4 f around the peak (12.9% W/f at 1.25-1.29), 24% over a final 15-f tail; no blur; panel gone 1.21, wordmark 1.38, link lines retract during the pan (right line to 0.09 W by 1.25, gone 1.29); badge size constant, so it is a pan not a zoom (M934). Smear-film version: pan accelerates 0.73-1.50 s with blur building, then whip: last 3 f blur and ~100 px smear, one-frame discontinuity (T6) (M931); whip up-left 2.42-2.75 with smear 3 -> 65 px, hard cut mid-whip at 2.79, 3 empty frames (M916); a form jumps ~260 px in one frame at 4.47 with 9 px blur and a duplicate frame, easing to rest by 4.64 while a screen-fixed headline lands (M958).
- **Use when**: moving between regions of one UI or between two UIs on the same ground.
- **Eye carried by**: a constant-size anchor (bead, cursor, card) or the continuing vector.
- **Evidence**: M934, M931, M916, M919, M922 (whip 2.47-2.80, peak 0.027 H/f + 0.024 W/f), M958.

### T14. Scale cut
- **What**: scale changes in one frame, never by a zoom tween, ideally with a content change in the same frame.
- **Mechanics**: blocks 0.037 W -> 0.136 W (3.7x) in one frame at 4.38 s with the tile background keeping its own scale and drift (0.07 W/s), then back to 0.035 W at 5.29 (M964); prompt text hard-cut 1.00 -> 0.42x -> 1.57x of large, the cut at 1.17 coincides with the copy jump (a multi-word tail appears) so the eye reads one cut, and a second cut at 2.07 to a close-up 3.86x (M949); exactly ONE 50% double-exposed frame (both buttons grey, cursor at the old spot) then a 2.33x close-up as a hard state; cursor scales only 1.5x (M943); a discontinuous camera jump after an ease-in push, 0.04 W -> 0.27 W (M956); 1.0 -> 2.46x in one frame mid-typing with peripherals stepping to 0.65-1 px blur and 0.4-0.5 opacity in the same frame (M923); a hard change into a 2.5x-zoomed grid (M937).
- **Use when**: the scale change is the edit (a different distance), not a camera move.
- **Eye carried by**: the unchanged object at a new size (text line, caret, button); the background's own scale keeps the world stable.
- **Evidence**: M964, M949, M943, M956, M923, M937.

**R14.1** WHEN you change scale -> DO decide camera vs edit: a zoom tween says "camera", a one-frame cut says "different distance"; for the cut, change content in the same frame and keep the background at its own scale and drift -- *because* a zoom interpolation announces itself and a snap reads as editing (M949, M964).

### T15. Ground flips by act (dark / light)
- **What**: the ground inverts at an act boundary, always caused by an object or hidden in motion.
- **Mechanics**: dark -> light via a growing object (T3: bead -> disk, M922), via a gradient wipe from the top edge (M930 -> M931), via a dark band sweep (M924); light -> dark by a hard cut at the sign-off with the name slammed from 3.5x (M932 at 2.54 s; M929 at 4.00 s to #0F1013 with a radial-streak crash) or hidden in a grey dip (M916, T5); a ground that tints to sage over 0.5 s while everything accelerates out, then a hard switch (M925 3.00-3.54 s, switch 3.50); a continuous sRGB ground ramp over 0.7 s timed to what is leaving (#ECEEEB -> #41977F as the cards vanish, never cut, M926); act-boundary hard cuts dark -> cream -> a one-step-darker cream (#1E1212 -> #ECEBE3 -> #C4C2B1, M967 -> M969); dark bookends with a light middle (M930-M932); a black stage at the product-reveal beat (M944).
- **Use when**: the film has acts with different semantics (user's data world vs brand claim; human vs AI part; product vs sign-off). A "ground" here is a surface (plate, screen, material, lit gradient), not a flat swatch per scene; the flip is carried by an object, and the act is never numbered or labelled on screen (layout.md section 0).
- **Eye carried by**: the object or band that changes the ground; the ramped colour timed to the leaving objects.
- **Evidence**: M922, M924, M925, M926, M929, M930, M931, M932, M938, M944, M967, M969, M916.

**R15.1** WHEN the ground must flip -> DO flip it with a growing object, a band/wipe crossing the frame, a cut hidden in fast motion, or a 0.5-0.7 s sRGB ramp timed to what is leaving; never a white flash or a crossfade -- *because* the flip then has a cause and a direction (M922, M924, M926).

### T16. Localized glitch rectangles (<= 6 frames) as a bridge
- **What**: a few black static rectangles over part of the frame bridge a UI -> logo hard cut.
- **Mechanics**: 6 frames (39-44 at 30 fps), all re-randomised every frame (dense 1 px static plus pale inner blocks): 1.30-1.33 s a 0.17 x 0.37 rect at (0.26, 0.27) over the left of the UI; 1.37-1.40 a 0.39 x 0.12 rect at (0.45, 0.35) with faint red lines (5 px pitch) and orange-red sparks (one rect only); 1.43-1.47 a 0.08 x 0.06 rect at (0.66, 0.61), gone by 1.50; the hard cut to the logo ground at 1.37, inside the middle rect; no full-frame scanline, no crossfade. It follows a UI contraction (+3-8% breath over 0.3 s then ease-in to 0.53x with 6 px blur and 12 px smear) and the logo size matches the contracting UI (0.16 W card -> 0.11 W mark at the same centre) (M932). Entry-burst variants: 0.07 W squares in packets of 1-3, each blinking 1 f, colour stepping every 1-2 f over ~90 events in 0.5 s (M930); five flat rectangles stepping every 2 f, never tweened (M929).
- **Use when**: UI -> sign-off, and a glitch aesthetic is on-brand. Keep to one rect per 2 frames, localized.
- **Eye carried by**: the matched size and centre of A's last object and B's mark.
- **Evidence**: M932, M930, M929.

### T17. Occlusion (a rising card covers the old content)
- **What**: a surface rises or slides over the previous content; nothing fades.
- **Mechanics**: card top edge y 0.96 (0.08 s) -> 0.58 (0.21) -> 0.41 (0.42) -> 0.36 (0.58) -> 0.35 (0.71): 62% of the 0.61 H travel in the first 0.13 s (peak 0.22 H/f), no overshoot; it hides a headline (gone by 0.38 s) and an object (gone by 0.63 s) bottom-up; a brand mark rides the card with a vertical smear 0.05 H at 0.13 s, gone 0.54 (M916). Related: new card inserted at the TOP as a blank tinted card, text popping in 2-4 f later, the stack shoved down in piecewise-linear jumps (first jump ~105 px in one frame, one 2-f hold, 0.02 W lateral drift) (M940); cards paint above a headline with right cards overlapping its last letters (M941); a black band expanding vertically y .02-1.0 in 0.20 s and page strips sliding up (M944).
- **Use when**: the new scene is "on top of" the old (a UI surface rising over a teaser); the old content can be hidden by position.
- **Eye carried by**: the surface edge.
- **Evidence**: M916, M940, M941, M944.

### T18. One-frame double exposure and carry-over ghosts
- **What**: 1-3 frames where A and B coexist, or a one-frame word/card carries across.
- **Mechanics**: exactly one frame at 50% double exposure (both buttons grey, cursor in the old spot) before a hard close-up (M943 2.73 s); a 2-f ghost of the previous headline with blurred 4-5 px thumbnails shifted 30-60 px outward on frame 1, then the hard cut (M942 0.00-0.07 s); a 2-f ghost of the old word behind the new hero (0.18 W grey), fragments over the new letters for 2-4 f (M947); a 2-f drafting diagram at frame 0 as a "receipt" before the first hard cut (M962); one frame of A (tilted order panel, headline at x 0.63-0.86) then black (M959 0.00-0.03 s); a one-frame word card, 0.10 H coral on cream at centre (0.46, 0.53) with 3 px blur (M957 4.27-4.30 s) that opens the next scene.
- **Use when**: you want the cut felt but not seen; a handoff needs one more frame of identity.
- **Eye carried by**: the surviving ghost.
- **Evidence**: M943, M942, M947, M962, M959, M957.

### T19. Hard replacement of a word or line
- **What**: text is replaced without a transition.
- **Mechanics**: drop leading words in single frames (0.84 s, 0.88) without re-centring, add new words at 0.92, 1.08, 1.24 (backspace-and-retype) (M914); phrase 1 -> phrase 2 hard cut at 1.67 (M920); the line leans out (7 -> 14 px/f in the last 2 f) then a hard replace (M921); a phrase winds up (0 -> 95 px, scaleX 1 -> 0.923, steps 13.7, 23.5, 35.3, 45.1, 58.8, 73.5, 95.2 px per frame, 24 px smear at f50) and is replaced at f51 (1.70 s), with 1-f empty gap at most (M929, M936); words vanish in hard steps 2 f apart (M964); exit words 1 f apart (3-4 f each) overlapping the next entrance ~2 f (M938); per-glyph flip with old glyph squashing to a hairline and the new growing from a baseline hairline (2-2.4 f per slot at 60 fps), fixed left anchor (M973); service/name swaps with logo and name on the same frame, 0.36 s apart, only the pill width easing 2-3 f (M955); a one-frame identity switch (scramble +-12 deg -> 39 deg, hard switch to exactly six glyphs; muddy node -> red over 5 f after a 1-f step) (M947, M958).
- **Use when**: a statement is replaced by the next; a name changes; rows tick through variants.
- **Eye carried by**: the fixed anchor (left edge, centre, carrier dot).
- **Evidence**: M914, M920, M921, M929, M936, M938, M947, M955, M958, M964, M973.

### T20. Strobe / reel flip (montage bridge)
- **What**: many plates or card/badge pairs flip on a rhythm to read as range or volume.
- **Mechanics**: 14 full-bleed plates, first plate 2 f, then 4 f each (0.067 s, ~15 plates/s), 20 slots (14 + 6 repeats), hard switches, tiny internal drift only; entered on a peak-velocity cut (1.23 s) and exited by a hard cut (2.53 s) (M948); 13 card + badge pairs flipping instantly on a syncopated 4/2-f pattern (~9 swaps/s) over a 0.30 -> 1.0 scale track while outer words creep apart (M967); a 4-f ten-mockup stack (M947); services swapping every ~11 f (M955).
- **Use when**: you must show breadth without reading each item.
- **Eye carried by**: the fixed container; the rhythm.
- **Evidence**: M948, M967, M947, M955.

---

## 3. Choosing a transition

### 3.1 Decision table (by what changes)

| What changes between A and B | First choice | Alternatives | Numbers to start with |
|---|---|---|---|
| Nothing but state (same UI, new moment) | T1 hard cut on motion + T2 carried object | T18 one-frame ghost | cut at peak velocity; B starts mid-move |
| Ground (dark <-> light) | T3 effect becomes ground (bead -> disk, band, wash) | T15 cut hidden in a band; T5 4-f grey dip | bead x1.5-2.2 per 0.05 s, 17x; dip 30 -> 65 -> flat -> veil |
| Scale (different distance, same subject) | T14 scale cut + content jump in the same frame | T12 pull-back reveal with snap | 3.7x in 1 f; snap ratio 0.56-0.77 + 0.3-0.6 s tail |
| Subject (text -> UI, UI -> different UI) | T7 wipe that finishes in B (content-heavy) | T4 container replacement; T17 occlusion | feather 0.31-0.42, 0.56 s, painted in B's ground |
| Subject (text line -> text line) | T19 hard replacement | T8 clip-edge wipe | 1-f replace; clip sweep 5 f |
| Act (chapter, claim -> product, product -> claim) | T1 + T2 with one carried object (the chapter break is a ground change plus the carried object, never a number, index or label) | T15 ground flip; T16 glitch bridge | claim phase 1.5-3.0 s, product phase the same or longer |
| Brand -> product | T11 zoom-through into a logo detail | T12 pull-back reveal | x21.9 in 0.53 s, 3 blank frames, container zoom-out 0.62 s |
| Product -> brand/sign-off | T4 contraction + T16 glitch bridge + T1 | T14 scale cut to 3.5x slam | UI contracts to 0.53x, mark built in 7 f, name slams from 3.5x |
| Field/texture -> logo or number | T10 pixel dissolve with stepped coverage | T9 stair wipe | 90 -> 0% coverage in 0.33 s; 80 px steps |
| Words -> an icon that continues the sentence | T19 + gap-matching | T3 | gap equals badge width (M958) |
| Question -> answer/name | T8 two soft masks | T19 | erase front leads reveal by ~0.1 s |
| List/form -> result | T4 container replacement | T17 | 0.70 -> 0.64 W then full-size replace |
| Montage of styles | T20 strobe | - | 4 f plates, 2 f first plate |

### 3.2 Rules

**R3.2.1 No crossfades between scenes.** WHEN you leave a scene -> DO hard-cut it, wipe it with a feathered mask in the next ground, or let an effect become the next scene; fade only a single object (one headline line 0.75 -> 0.18 over 4 f, the last phrase linearly over 10 f, a ghost behind a new hero) or a single identity swap on a shared centre (icon dissolve 8 f, M973; dial and rings 8 f, M936) -- *because* "no cross-fades anywhere" holds in M941-M944, M913-M920 and the rest of the sample; the only whole-scene overlap is ONE 50% frame (M943). A fade is allowed where the object is the same and its motion continues across it.
**R3.2.2 Cut cadence.** WHEN you set scene or shot lengths -> DO inside a beat cut every 0.3-2.3 s (0.33 s on a beat grid, 0.36 s for item swaps, 0.7-1.3 s for stinger beats, 1.5-2.5 s for claim and product phases), let chapter claims run 1.5-3.0 s with the product phase the same length or longer, shorten scenes toward the end and let the last scene linger (1.70 / 1.50 / 0.80 / 1.44 s, M929) -- *because* rhythm is built from the pace of cuts (M929, M947 beats 1.30/1.07/0.70/0.43 s, M962, M953-M959).
**R3.2.3 Beat grid.** WHEN the film is music-led -> DO cut on a constant interval (10 f = 0.333 s for four consecutive cuts), make each state complete at the cut (dashes full length, labels present) and let secondary detail echo 1-3 f later in two waves (even ticks +1 f, odd +2 f); ~11-f drum for list swaps; syncopated 4/2-f pattern for reels (M962, M955, M967, M948). WHEN voice-led -> DO land onsets on the spoken word and let the wipe or reveal start before the word (wipe leads the voice by 0.16 s, wordmark reveal completes 0.16 s before it is spoken) (M925, M927, M926, M939) -- *because* the viewer hears the cut as part of the line.
**R3.2.4 Both sides planned together.** WHEN you write a transition -> DO fill one row of a handoff table before animating: A's last frame (object, position, scale, colour, blur, velocity), B's first frame (the same fields), the carried element, the cut type and the frame on which it fires -- *because* the cut works only if A and B were drawn together (M921-M929, M930-M938, M939-M946, M947-M959).
**R3.2.5 Transitions belong to the brand's own shapes.** WHEN you pick or design a transition -> DO build it from a shape that already lives in the film: a wave of the logo's own mark (stair-notched white, M946), a cell grid in the brand colour (M965, M968, M937), a dot or ring that is the brand (five-dot ring, M926; dot, M962), a bead along the device rim (M922), a glitch rect only if the brand is glitchy (M932), a stripe band (M965) -- *because* a generic wipe or slide-in reads as a template; the film's own geometry reads as authored.
**R3.2.6 One grammar.** WHEN the film's motion language is crisp steps (no smear) -> DO use T1, T2, T4, T9, T10, T14, T19 and put content change inside whips (T13 crisp version); WHEN it is smear -> DO add T6 and the blur-matched whip -- *because* mixed grammars read as different authors (see motion.md R4.1).

---

## Slop tells for this topic

| An AI default would | Do instead |
|---|---|
| Crossfade scene A to scene B for 0.5 s | Hard cut on motion; or feathered wipe in B's ground; or effect becomes B's ground (a fade only under the conditions in slop.md Part 1b) |
| Mark a chapter with a number, a title card or a corner label | A ground change plus a carried object; the viewer reads the break from the picture |
| Dissolve between cards or captions as the default join | A hard cut on a moving frame with a carried object (a dissolve that means something is the exception) |
| Cut when the last animation has settled | Cut at peak velocity or on an action peak; B opens mid-move |
| Fade to white (or black) to change the ground | Growing bead -> disk, a sweeping band, a 4-f grey dip, or a 0.5-0.7 s colour ramp timed to what leaves |
| Slide a generic wipe bar across | Wipe made of the film's own shape (stair wave, cell grid, ring, bead) |
| Zoom-tween into the next scene | One-frame scale cut + content jump in the same frame; or one-frame snap + tail |
| Fade the old headline out, fade a new one in | Hard replacement, backspace-style drop-outs without re-centring, or two soft masks with the erase front ahead |
| Dissolve a logo in over 20 f with opacity | Pixel/cell coverage 90 -> 0% over 0.33 s; or stems built over 7 f; or dive-through into a detail |
| Put a loading spinner between scenes | 1-f placeholder card/capsule, or the next container at full size in one step |
| Make each scene independent | Carry one object (caret, dot, card, headline, cursor spot, ground colour) and record it in a handoff table |
| Cut every 4 s on a pause | Cut every 0.3-2.3 s on a beat grid or on spoken words; last scene lingers |
| Add a glitch pass over the whole frame | Localized rectangles, <= 6 f, one hard cut inside, matched sizes of A's last and B's first object |
| Blur-cross-dissolve a zoom | Blur-matched cut: exit ends at 18 px, entrance starts at 80 px, resolves in ~8 f |
