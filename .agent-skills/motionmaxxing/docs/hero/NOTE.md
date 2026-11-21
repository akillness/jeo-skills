# Hero banner: NOTE

The banner at the top of the README is a film made with this skill's own runtime (`runtime/motion.js`, measured eases) and checked with its own scripts. Source: `docs/hero/index.html`. 1600x500, 30 fps, 6.5 s (195 frames), no sound, loops. Outputs: `docs/media/hero.mp4` (faithful, 835 KB, with grain) and `docs/media/hero.gif` (1000 px wide, 15 fps, 192 colours, no grain: grain does not survive a small palette).

**The one idea: your keyframes get a face rating.** It borrows the grammar of the viral looksmaxxing "face analysis" edit (thin coloured measurement lines, blue thirds lines with arrowheads and a "?" at each midpoint, white angle wedges with arcs and degree labels, dashed grey symmetry lines, short coloured arrows, a dark cold desaturated glitchy ground, scanlines, blocky tears, vignette) and points it at motion instead of a face. The "face" is the word "motion" and the ease that moves it.

- **Mid (frames 0-89).** The word is Times, flat grey, 17 px off-centre, on a flat ground. The four blue lines are the four typographic lines (ascender, x-height, baseline, descender), the three double arrows between them are the thirds, and every reading is "?" or wrong: a dashed centre line and the word's own centre line 17 px apart, a straight linear ease drawn as a graph with equal axes and read as `linear 45.0°`, arrows reading `default serif`, `tracking 0.0`, `ease 0.0`, and a tiny verdict, `mid`.
- **Cut (frames 84-96).** Slices of the word tear sideways in cyan, red and white, macroblocks flash, a frame or two are just blocks, and the ground changes: a lit, cold, textured near-black.
- **Maxxed (frames 90-188).** The brand type lands (Inter 640, tracking tightening from +0.07 em to -0.045 em, `snapSettle`), "maxxing" lands in orange on `softLand` from the right, with a dashed line on its measured leading edge. The blue lines re-snap on the real letterforms in 6 frames instead of 10, the `?` blinks and becomes `1.0`, `2.4`, `1.0`; the centre line reads `0 px`; the straight line becomes the real `softLand` curve and reads `softLand 65.0°`; four wedges sit on letterforms; arrows read `weight 640`, `snapSettle`, `softLand`, `-0.045 em`; the verdict becomes `maxxed`; the tagline "looksmaxxing for motion graphics" arrives at speech rhythm.
- **Loop.** A second tear-and-block burst cuts back to the mid word the film started on.

**Stepped timing.** The overlays draw on with a crisp wipe that holds a pose every 2 frames (`M.kf` with `step: 2`), labels and arrows cut in hard, readings "compute" through two wrong values at 2 frames each, and every glitch event sits on an even frame and lasts 2 frames so it also survives the 15 fps GIF. Nothing is eased on the overlays; the eased things are the words and the camera (`snapSettle`, `softLand`).

**What is real and what is decoration.** Nothing is captured or third party, and there is no photograph, no statue and no person: it is purely typographic and vector, so there is no Wikimedia or other image to credit. Every ease is a function the runtime ships. The numbers are honest about what they measure:
- `17 px`, `0 px`: the real offset of the mid word and the real centring of the maxxed one.
- `1.0 / 2.4 / 1.0`: the real ratios of the three zone heights of Inter at this size, computed from the drawn lines.
- `softLand 65.0°`: `atan2(softLand(0.32), 0.32)` on the plotted curve, computed from `M.ease.softLand` at load; the curve itself is that function sampled 29 times.
- `weight 640`, `-0.045 em`, `snapSettle`, `softLand`: the exact settings the words use.
- `73.2°`, `81.5°`, `118.9°`, `41.9°`: the angles of the rays drawn on the letters (the label is the angle the wedge was built with). They are a nod to the meme's numbers, not measurements of glyph geometry.
- `default serif`, `tracking 0.0`, `ease 0.0`, `linear 8.0° / 31.0° / 45.0°`: the mid state described in the meme's voice; the `8.0° / 31.0°` are the stepped "computing" values before it settles.

**G5 and the meme's labels.** The meme is made of labels, so G5 was the risk. It passes on all 15 rules, with no warning, without changing the idea: every label is an object-attached reading (sits next to the line, arrow or wedge it describes, on a dark plate), set in Inter at 5.2-6.4 % of the frame height (above the 4 % small-label ceiling of C1), none in a corner or edge strip, none uppercase or tracked (C2), none shaped like a counter, timecode or version (C3, C4), no mono (C5). The word and its "maxxing" half are one centred headline block (an earlier version set them as two absolute blocks and D1 warned on the left one; they are now one flow).

**Gate numbers** (`lint.mjs`, `Motion.selfTest`, `look.py --expect 6.5`)
- G0 render exists: PASS, 6.50 s matches the plan, picture moves.
- G2 no empty frame: PASS, no run of more than 3 flat frames.
- G3 end hold: PASS, the film ends mid-glitch (0.00 s hold), which is intended: it is a loop.
- G5 page chrome: PASS on all 15 rules (C1-C7, D1, P1, T1, V1-V5), 12 samples, no warnings.
- Seek safety: `selfTest` 24 samples, 358 elements, 0 mismatches.
- G1 and G4 by eye on stills: one hero per frame (the word); the overlays are measurement, not a second subject.
- Motion note: mean frame-to-frame luma change 1.5 (human band 6.8, IQR 4.4-9.8). The picture is a held word with stepped overlays and a drifting scan band, so this is a choice, not a miss.

**Still to improve.** The GIF is 15 fps and 192 colours, so the dark gradients band slightly and the scanlines shimmer a little; the MP4 is the faithful version. The mid half is 3 s, which is long if you only watch once. The overlays crowd the right-hand "xxing" area in the last second; the cluster is on purpose (it is the meme) but it is the first thing to thin if the banner ever feels busy.
