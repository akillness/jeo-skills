# close.md: CTA, logo and endings

See also: layout.md section 7 (lockup geometry) and section 0 (no tagline, label or URL strip), type.md (word timing, name morphs), motion.md (eases, crash-in, dive), transitions.md (cuts into the close), sound-sync.md (name on the voice; the score covers the whole cut), idea.md (the close follows from the idea), world.md (what the end ground is made of), slop.md (Part 0 house style; Part 1b conditions for calm endings).

Every ending seen in 53 moments (IDs M913-M974): how a logo or call to action is built, how long it holds, and how a moment or film stops. Use it to choose a close by brand personality *and by the film's idea*, then build it with the numbers given. **The logo arrives by cause** (a click, a result, a camera move, the end of a motion), not by default; and an ending is one beat, usually smaller than the climax before it. Several closes below (C1, C2, C3, C5) are signatures of the corpus: each carries a house-style warning, because used as the automatic last move they make every film end the same way. Sizes are in layout.md section 7; word timing is in type.md.

Conventions. Time as `s (f@30)` (1 f@30 = 0.033 s). Source fps differs (24/25/29.97/30/60); numbers are converted, with the source fps noted when frames are quoted. Positions are x,y 0-1; sizes % of W or H. Rule format: **WHEN** situation -> **DO** decision -- *because* effect (evidence IDs). PRACTICE = extrapolation not in the sample.

---

## 1. The closes, one by one

### C1. Wordmark crash-in, then perpetual contraction
Seen in M929 (dark sign-off after three hard cuts) and M932 (dark sign-off after a light UI).
- **House-style warning:** a near-black ground, a glow halo and a name that crashes in is also the "premium pastiche" an AI reaches for to look expensive (slop.md Part 0, N11). Use it only if the brand is dark and weighty *and* the film has not already spent its scale (director.md section 6); a halo only at the event, never as wallpaper.
- **When to use:** premium/tech brands, high energy, a light film that needs a heavy last beat. Needs a hard cut into an inverted dark ground (M929 #0F1013, M932 #120F13).
- **Entry:** wordmark white (weight 480-500, lowercase), enters at **3.5-3.75x** its settled size (`M.ease.snapSettle`, then a `M.ease.cruise` creep; `M.ease.crashIn` only if it should punch past the mark); ink wider than the frame (M932: 1.7 W, cropped both edges; M929: .70 W at 0.04 s).
- **Scale track (M929, f@30):** 3.75 -> 2.29 (f1, 39% of the collapse in one frame) -> 1.90 -> 1.72 -> 1.55 -> 1.42 -> 1.33 (f6) -> 1.21 (f8) -> 1.12 (f10) -> 1.07 (f12) -> 1.04 (f14) -> 1.00 (f20 = 0.67 s) -> 0.97 (f30) -> 0.93 (f36).
- **Scale track (M932):** 3.51 -> 2.47 (+1 f) -> 2.10 (f2) -> 1.57 (f4) -> 1.34 (f6 = 0.2 s, 86% of the drop) -> 1.0 at 0.6 s after the cut -> 0.84 (1.06 s) -> 0.57 at the last frame (name .28 W).
- **Streaks:** 64-96 scaled low-alpha copies as radial zoom streaks (M929: length ~60 px at the cut, halving every frame to ~2 px by f5; M932: spread .43, streaks up to .21 H). All streaks/aberration/core blur decay to zero in 5 f.
- **Aberration/glow:** cyan left fringe + amber right fringe offset ~15 px (M932, decays with the streaks); bloom ~65 px. Rest glow in 3 layers: 3 px, 15 px (alpha .6), 45 px (alpha .22), slight flicker; halo #444044 wide (x .14-.86, y .33-.65) scaling with the name.
- **No-dead-frame tail:** contraction continues the whole hold; it accelerates in the last 0.2 s (M929: .26 W at 5.21 s, .23 at 5.31, .17 at 5.41, blur back to 5 px then 14 px radial); ends visible, mid-shrink.
- **Hold:** wordmark scene 1.2-1.44 s (M929 1.44 s, M932 1.2 s). Wordmark ink is only .27-.28 W; the empty field plus glow is the hold.
- **Preceded by:** a UI that breathes +3-8% in 0.3 s, then contracts (`M.ease.gentleIn`) to 0.53x with 6 px blur/12 px smear (M932), or a tagline scene and an icon scene that only shrinks 1.0 -> 0.70 accelerating (M929).

### C2. Logo built from parts
Seen in M932 (stems), M920 (line -> hollow -> solid), M938 (bars + glyph-per-frame wordmark).
- **House-style warning:** "the lockup is built from the film's motif" and "a small dot becomes the logo's dot" were found in nearly every direction a generation of AI films produced, so a film that ends this way by default reads as one designer's reel in a new colourway. It is one option among several: choose it only when the brand's own mark really is made of repeated parts and the build is the idea. Otherwise the logo arrives by cause.
- **When to use:** mark made of simple geometry; developer/enterprise/playful brands that want a "constructed" feel.
- **Stems (M932):** 5 rects (3 stems .03 x .06 with .01 gaps, 2 blocks .03 x .03 under the gaps; mark .11 W x .10 H). Over 7 f (1.37-1.60 s): one blue stem with a wide haze (r ~.09) -> three cyan stems with a bloom (r .06, #8FFFFF) -> lower blocks appear (1.47-1.53) -> stems turn black one by one (1.50-1.57) -> full black mark, spread narrowed from .39-.57 to .44-.56, haze gone. Stems translate and scale inward; not typed.
- **Line -> hollow -> solid (M920):** 1 px #9C9C9C line grows symmetrically from (.50, .57), 12 -> 265 px (.21 W) over 0.5 s in alternating big/small steps (not smooth); unsquashes vertically in 8 discrete steps (0, .13, .23, .55, .62, .85, .91, .98, 1) over 0.33 s into a hollow 1 px #B2B2B2 outline with faint grey ghosts; hollow hold 0.12 s; **solid white in ONE frame**, then settles to .22 W in 0.4 s.
- **Bars (M938):** 12 bars (.01 W x .15 H, pitch 19 px): 6 pale back bars L->R (2 at 3.00, +1/f, 6 by 3.16), 6 gradient front bars R->L (rightmost first and darkest, starts .03 W right of rest then glides left), each fade + slight scale. Wordmark 1 glyph per frame, each fading over 5 f (#D1D3D3 -> black), letter-spacing collapsing +20 -> -3 px while the left edge slides .51 -> .40 over 0.5 s.
- **Rule:** the mark never holds (M932: .11 -> .10 W over 0.7 s, then .07 W in 0.16 s with 2 px blur; M938: lockup 1.0 -> .835 over 0.8 s, accelerating, then a hard cut to the next UI).
- **Hold:** the resolved lockup 0.6-1.2 s (M920 1.0 s, M932 logo 1.2 s).

### C3. Emblem enters oversized and blurred (halving the excess every 2 frames)
Seen in M968.
- **House-style warning:** an oversized arrival is law 7 (an arrival that decelerates), not a rule that every logo starts big; the mosaic, the typed name and the petal outro are one film's signature (use rarely). If you already spent scale earlier in the film, let the mark arrive at its own size.
- **When to use:** quiet/editorial/consumer-premium brands; a name that is typed after its emblem.
- **Preceded by:** a hard-edged mosaic: 12 x 12 grid cells (106.7 x 60 px) at peak for 2 f, retreating to the corners in 3 steps (cells 85 -> 75 -> 64 px) over 0.27 s; lavender blobs .23 W across hide the centre; page goes from near-white to cream over 0.6 s.
- **Emblem:** enters at .28 W, 18 px blur, tint #75678F; every 2-f step halves the excess: .28 -> .19 -> .14 -> .12 -> .10 W; blur 18 -> 9 -> 4 -> 2 -> .6 -> 0; colour darkens to #201614; sharp at 0.33 s. **Never scales up from zero.**
- **Lockup:** emblem creeps left, then two 52 px steps coincident with the first letters; tail to x .32 (total travel .12 W, final centre (.37, .50)). Name types one letter per 2-f step (no cursor), coarse pixel reveal 5 px -> 3 px -> smooth over 0.7 s; cap .16 H, .24 W wide, left edge .46 W.
- **Hold:** 0.67 s truly static (the one allowed static hold).
- **Outro (signature):** five petals swing counterclockwise ~100 deg into a bean-shaped cluster (.07 W x .13 H) while the name backspaces one letter per step R->L; ends on the cluster, no text, no fade.
- Variant: logo held full at frame 0 and shrunk on `M.ease.snapSettle` (scaleX 1.46 -> 1.0 in 8 f, excess x0.72 per frame, 90% in 0.25 s), creeping to .96 by 0.8 s, accelerating .94 -> .815, then **one-frame cut to nothing** at ~1.0 s (M965) -- the wordmark "falls" out.

### C4. Icon on white, settling from 1.86x
Seen in M959.
- **When to use:** a mark that is a pure shape (triangle + dot); minimal/premium/consumer brands; follow a dark, glowing scene.
- **Build:** hard cut to #FFFFFF; black rounded triangle .13 W x .20 H above a .05 W dot (gap .04 H), one transform at x .50, corner radius 10 px at start -> 5 px at rest.
- **Scale (seconds after the cut):** 1.864 (0) -> 1.654 (+0.04) -> 1.568 (+0.07) -> 1.449 (+0.14) -> 1.284 (+0.34) -> 1.21 (+0.47) -> 1.144 (+0.67) -> 1.10 (+0.87) -> 1.07 (+1.07) -> 1.025 (+1.47) -> 1.008 (+1.87) -> 1.001 (+2.27) -> 1.0 (+2.47). The first 0.13 s covers 48% of the travel, 0.33 s covers 67%, and the last 0.5% takes 2 s.
- **Hold:** the settle itself is the motion (about 2.5 s); then 0.5 s static. No fade, no wordmark, no tagline.

### C5. Mosaic / pixel dissolve into the mark
Seen in M965, M968, M946.
- **House-style warning:** a field of squares dissolving into the mark and a motif-shaped wipe into a lockup are the same default as C2 in different clothes. Use only when the texture really is the brand's (pixels, a lattice, data) and the wipe is built from the scene's own geometry; never because a transition was needed.
- **When to use:** technical/digital/data brands whose texture is pixels or a lattice; a field that must become a logo or a screen.
- **Dissolve:** real hard-edged cells (1.5-2.5% W), stepped coverage 90% -> 60% -> 35% -> 10% -> 0 over 0.33 s, opening from the bottom; never opacity (M965). Alternatively a 12 -> 20 cell grid retreating to the corners in 3 steps over 0.27 s (M968).
- **Pixel-resolve of a mark (M946):** the mark inherits the scene's texture. Flame fills inside its silhouette: sparse 2-3 px dots on a 6 px grid -> dense dots -> solid rising from the base (58% at 0.23 s, solid at 0.56 s). Wordmark: a solid front sweeps L->R through 5 px squares and tiny crosses (positions per frame 13-17 f on a 365 px word, paired frames: -75, -75, -35, 0, 65, 95, 95, 125, 155, 180, 225, 225, 250, 280, 280, 365, 410), the first three letters at 0.30 s, whole by 0.60 s; flame and word drift ~.09 W left while resolving (flame x .36 -> .32).
- **Preceded by:** a stair-notched white wave that is the scene's own motif (a repeated wave shape) flooding left from x .73 while the world jerks left with accelerating offsets -.01, -.04, -.10, -.14, -.29, -.41, -.63, -.86 W (one repeated frame; per-frame jumps up to .22 W) -- *because* the wipe is built from the scene's own geometry (M946).
- **Hold (alive):** 3.66 s (57% of the clip) with the flame tip swaying +-1% W in an irregular ~1 s rhythm on 2-f holds; static wordmark. A measured outlier, valid in that clip only because the mark is alive; in your film the end hold stays <= 1.4 s (R2.0, gate G3).

### C6. Logo morph from a previous identity
Seen in M973.
- **When to use:** a rename, a rebrand, "from X to Y"; high-energy product launch; 1.05 s total.
- **Name:** per-glyph flip (type.md section 9), fixed left anchor x .49, anticipation spread +26% over 0.19 s, second flip 0.70-0.83 s, glyphs arriving violet, darkening L->R.
- **Icon:** rosette spins clockwise, accelerating (8 deg at 0.47 s, 35 at 0.53, 128 at 0.60, 275 at 0.67, 336 at 0.70, ~30 deg/f) while shrinking 153 -> 133 px (.87x), centre fixed; cross-dissolve over 8 f (0.70-0.78 s: new badge opacity 0, .1, .35, .6, .85, 1) on the same centre, new badge drawn above; new badge scale .68 -> .85 -> 1.02 -> **1.04 peak** (4% overshoot, 0.87 s) -> 1.0 (0.93 s); rotation continues clockwise and decelerates (-139 deg at 0.77 s, -85, -56, -31, -8, 0 at 1.03 s); still moving on the last frame; no glow or flash at the swap.
- **Hold:** none; ends mid-rotation.

### C7. Dive into the logo to enter the product
Seen in M974.
- **When to use:** developer/tool brands whose logo has a feature that can be a container (an underscore or caret -> an input).
- **Camera:** scale 1, 1.02, 1.15, 1.46, 2.28, 4.52, 8.98, 14.67, 21.9 at 0, .067, .133, .2, .267, .333, .4, .467, .533 s (constant octave rate, x1.5-2 per 0.067 s; no hold at frame 0). Translate follows the feature (underscore), not the frame centre; the wordmark grows and exits right (only its first letter at 0.40 s, gone 0.47 s).
- **Feature to container:** the underscore becomes a white pill (.68 H tall at 0.73 s, .93 H at 1.08 s) with a 11 px periwinkle band top and 39 px bottom; fade in place over 3 f (1.083-1.133 s), 3 blank frames, then a rounded box zooms out (top/bottom y .05/.98 -> .16/.88 -> .22/.82 -> .25/.78 over 0.62 s; stroke 10 -> 4 px; box 1.78 W wide).
- **Then:** placeholder fades, wave typing 1.80-3.90 s, pan, send button cross-colours black -> #969696 -> white while the arrow goes white -> grey -> black over 0.28 s, no scale or press (type.md 3.7).
- **Hold:** none; the next scene's cutout rises 0.15 -> 1 opacity and the clip ends mid-rise.

### C8. Button click, cut before release
Seen in M959 (CTA), M931 (ends at compression), M956/M958 (product beats).
- **Footer warning:** a logo plus a "Download" or "Get started" pill plus a cursor that presses it is a web CTA footer with a cursor (slop.md N14). C8 works when the button is the *product's own control* and the film cuts before the release; it does not work as an add-on under a lockup.
- **When to use:** playful/consumer and developer CTAs where the viewer's next action is the click; any energy level.
- **Button (M959):** .46 W x .19 H at (.50, .50), label 6% H white; blooms from .60x on `M.ease.snapSettle` (0.60 -> .72 -> .79 -> .84 -> .87 -> .91 -> .93 -> .94 -> .96 @10 f -> .97 @12 f -> .99 @16 f -> 1.0 @20 f), first frame already 31% of travel, blur 5 -> 2 -> 1 -> 0 over 4 f.
- **Cursor:** 5.1x its settled size (.10 W x .20 H), mostly below the frame, blurred 5 px; scales about its tip 5.1 -> 3.45 -> 3.0 -> ... -> 1.0 over 0.87 s; first frame jump covers 37% of x and 60% of y; the click lands while it is still creeping (no hold before the click).
- **Click (ONE frame, 0.93 s):** button x1.021 + fill flash; label becomes a 95 px horizontal white smear (.44 W) with 25 px glow (12, 7 px over the next frames); cursor compresses to .847 (-13%) with tip pushed down 0.03 H, relaxing over 6 f. Next frame: a lavender bracket (two U shapes, gap x .40-.60, x .26-.74 / y .38-.62) appears instantly with no fade.
- **Pre-cut shrink (0.23 s):** button .947 -> .74, bracket -> .76, cursor -> .75, accelerating; biggest step on the last frame; **hard cut at maximum velocity (1.53 s)**; the release is never shown.
- **Simpler variants:** end on maximum compression (button .14 -> .11 W = .81, hand to .08 W, M931); press -29% with arrow lagging a frame, rebound 0.33 s, glow 3 -> 35 px at 40% (M956); purchase-button squash to 79% and recover, ends with the camera still moving (M958).
- **Hold:** 0 s on the button; if the next scene is an icon plate use C4.

### C9. Typed CTA prompt, cut before send
Seen in M949, M969, M914, M974.
- **When to use:** developer/AI-tool brands; the CTA is "type what you want" and the action transfers to the viewer.
- **Prompt line (M949):** white #FDFDFD ground, line #575756 at 400, tall thin caret (.008 W x .25 H) that never blinks; 38 graphemes with a human cadence (type.md 7.2); scales hard-cut large -> wide (x0.42) -> close-up (x1.57 of large), each in the same frame as a content jump (a multi-word tail appears at once); film ends 0.11 s into the close-up with the send arrow (.14 W x .21 H at x .69, tip .83/.50) just arrived .18 W right of the last glyph. The send is never shown.
- **Bar version (M969):** white bar .71 x .13 (radius H/4) centred, a 40-character request typed over 1.07 s, pointer appears at (.89, .80) at 3.20 s, 2-f steps decaying x0.72 per step, bends to vertical, parks on send (.81, .52) at 3.80 s (no press, no hover); contract 4.00-4.43 s (bar .70 -> .64 W on `M.ease.gentleIn`, biggest step last); **hard replacement at 4.47 s** with an empty white card (.83 x .85 at x .09, y .08, halo .02 W) on a ground one step darker/greyer (#ECEBE3 -> #C4C2B1). The card is the proof of the click and the container for the next scene.
- **Click-then-handoff (M914):** cursor parks on send 0.48 s while the camera regrows to 1.13x; disc 1 -> .94 -> .63 -> 1.0 -> 1.055; rings born on the press frame, 0.48 s total (the one ring film, ui-demo.md 3.4); cursor accelerates off; last frame hard-jumps to an empty bordered card.
- **Hold:** 0-0.5 s; action ends on the handoff.

### C10. CTA words focusing in place (with a character-built logo)
Seen in M920.
- **When to use:** consumer/playful brands with a mascot or avatar; quiet energy that grows.
- **Sequence (24 fps source, times from the cut):** last phrase fades linear over 0.4 s, one fully black frame, avatar appears at max size (.14 W, centre (.36, .43)) and shrinks about its fixed centre (.12 W at +0.04 s, .07 W at +0.25 s, .06 W at ~+0.6 s; halo 22 px -> 3 px, eyes grey -> black, no translation, no overshoot, no animation-in); logo builds as in C2 (line, hollow, solid) starting 0.08 s after the avatar; CTA words focus in place (opacity .12 -> 1, blur 8 -> 0 px, 4 f each, back-to-back) starting 0.04 s after the unsquash begins so they are sharp 0.05 s after the logo goes solid.
- **Geometry:** CTA white 7.2% H em (52 px), x .40-.66, top y .41; avatar sits ~.02 W left of the first word; wordmark semibold 9% H (66 px), .22 W x .07 H, centred below at (.39, .54); lockup .30 W x .20 H; ~95% of the frame stays black.
- **Alive end:** a pink band (~130 px, 7 px glow) sweeps L->R across the CTA glyphs at ~55 px/f, repeating with a 0.708 s period; one-frame shear glitches on the top half of the logo only (5 px, then 12 px with a scanline; the lower half stays sharp); ends mid-sweep; ~1.0 s of fully resolved lockup.

### Other closes and endings seen

| Ending | Numbers | IDs |
|---|---|---|
| Glitch bridge from UI to logo | 3 localized black static rects over 6 f, re-randomised each frame, sparks in one only; hard cut mid-bridge; no full-frame scanline | M932 |
| Wash resolve into a mark | teal haze rises from the bottom, feather .28 H, 0.4 s; content swells 1.07 -> 1.20x; objects fade bottom-first; at the peak frame everything gives way to a pale gradient (never a solid colour); mark bar by bar | M938 |
| Hard cut to the next UI on the last frame | blank UI, top .40 H empty | M938 |
| One-frame placeholder | empty capsule .30 W x .06 H, radius 16 px at x .35-.65, y .74-.80; or empty white card; or grid + bar; or a one-frame single-word card (.10 H, centre .46/.53, 3 px blur) | M966, M969, M964, M957 |
| One-frame carry of the last scene | the final terminal frame shown 1 f, then black | M959 (frame 0) |
| Ends on max compression | button at .81, hand .08 W | M931 |
| Ends mid-rotation/roll/fling | badge still turning; roll to -76 deg with 22/18 px smear; photo cards flung 5 -> 35 px/f | M973, M944, M941 |
| Ends on a still-accelerating pan | accelerating left pan, no settle | M913 |
| Ends on a cropped, moving figure | second figure cropped at the right edge, mid-slide | M936 |
| Ends on a shrinking lockup | contraction to .88 over 0.8 s; or to .835 over 0.8 s | M916, M938 |
| Ends mid-sweep / mid-growth | pink band cut off; a motif shape mid-growth; purchase-button pulse with camera moving | M920, M945, M958 |
| Ends with a half-arrived word | last word at alpha .3 | M940 |
| Ends with a living hold | flame sway +-1% W, 3.66 s | M946 |
| Ends on a drifting card | applied card still easing up | M939 |

---

## 2. Universal close rules

**R2.1** WHEN you size a lockup -> DO follow layout.md R7.1 (wordmark ink .22-.38 W, modal .27-.28 W; icon .05-.14 W; gap .02-.06 W; centred at y .50) and leave ~95% of the frame empty -- *because* a small mark in a quiet field feels confident and leaves room for glow and motion (M920, M929, M932, M946, M973, M974).
**R2.2** WHEN you add copy to a lockup -> DO use at most one tagline (layout.md R7.3: one line, 0.05 H, light grey, under the name); most closes carry none (M929, M932, M946, M959) -- *because* the mark is the last thing, not a paragraph.
**R2.3** WHEN you end the film -> DO NOT fade the lockup out by default; end mid-motion, or on a one-frame placeholder (empty card/capsule/word), or on a hard cut to the next UI -- *because* the cut is the edit and the next scene inherits the momentum (M913, M916, M920, M929, M932, M938, M946, M959, M966, M969). **Condition:** a calm, reassuring or quiet brand may end calmly (about 22 of 51 human films do): a slow settle or a soft fade is right when it follows sustained motion, echoes the opening and the mark has already arrived by cause; never a fade because the film ran out of ideas, and never a long hold (R2.0, gate G3).
**R2.4** WHEN you must reach black -> DO fade only the last text phrase (linear 10 f), hold one fully black frame, then build the lockup (M920); never fade the lockup itself.
**R2.0 (HARD GATE)** WHEN you time the end -> DO keep the resolved end-card hold (lockup landed -> last frame) at **0.6-1.4 s** and the whole CTA beat at **<= 25 % of the film** (4 s of 16, 3.75 s of 15). Check the storyboard before building and `look.py`'s "end hold" after rendering. Slow contraction or drift does not make a 4-5 s hold acceptable (a test film held its end card ~4.5-5 s, ~30 % of 16 s, with only a slow contraction, and read as dead air). If the film must run longer, add a proof beat or a second CTA action (the line, then the URL), never a longer logo. -- *because* a mark registers in ~0.5 s and a name in ~1 s; everything after is the viewer waiting.
**R2.5** WHEN the lockup is resolved -> DO keep something alive for the whole hold: a creeping scale (1.008 -> 1.001 over 2 s, M959), an accelerating contraction in the last 0.2 s (M929), a flame sway +-1% W (M946), a sweep with a fixed period (0.708 s, M920), a flicker in the glow (M929), a 1-frame glitch on the top half only (M920) -- *because* a static logo reads as a slide; the one allowed static hold is 0.5-0.67 s after a settle (M959, M968).
**R2.6** WHEN you set hold times -> DO resolved lockup 0.6-1.4 s (M920 1.0, M932 1.2 + 1.2, M929 1.44, M968 0.67, M959 0.5 static after a 2.5 s settle) -- *because* a mark needs about 0.5 s to register and a name about 1 s (derived from the holds listed). The corpus has one longer alive-mark hold (M946, ~3.7 s); it is not licence to exceed the 1.4 s gate in any film (R2.0).
**R2.7** WHEN you place the CTA copy -> DO sit it in the centre band, x .40-.66, top y .41 (7% H em), the lockup directly below or left (avatar .02 W left of the first word); or the action object at (.50, .50): button .46 W x .19 H, prompt bar .71 x .13, typed line at baseline y .53-.56 with the send target .18 W to its right (M920, M949, M959, M969) -- *because* the action belongs where the eye already rests.
**R2.8** WHEN the film's ground is light -> DO flip to a dark sign-off on the cut (M929 #0F1013, M932 #120F13), with a halo wide enough to feel like a stage; when the last act was dark or glowing -> flip to flat white (M959); when the lockup is character-built -> pure black (M920) -- *because* an inverted ground with a hard cut gives the sign-off a "different room" feel; never a gradient crossfade. These are options, not a recipe: follow the brand's own surface (world.md), and give the end ground light or texture (the halo is the light) unless the brand is genuinely flat.
**R2.9** WHEN you build a close -> DO plan scenes that shorten, then let the last linger (tagline 1.7 s -> phrase 1.5 s -> icon 0.8 s -> wordmark 1.44 s, M929; cards fan 1.0 s -> logo 1.2 s -> name 1.2 s, M932), linked by hard cuts, no crossfade, no hold over 0.5 s before the last scene -- *because* acceleration into the sign-off makes it feel thrown at the viewer, then lingering.
**R2.10** WHEN the audio carries the name -> DO make the wordmark reveal complete 0.16 s before it is spoken (M926; sound-sync.md section 5) and land cuts on spoken words -- *because* the text should be complete when heard.
**R2.11** WHEN you enter a final mark -> DO start it large (1.5-3.75x) and bring it down; never scale up from zero and never fade it up (M929, M932, M959, M968) -- *because* "arrives from the camera" reads as authority. (A calm brand's mark may arrive at 1.1x on a long ease, C4; the rule is "it decelerates in", not "it is always huge".)

---

## 3. Choose your close

| Brand personality | Pick | Why | Energy | Hold | Avoid |
|---|---|---|---|---|---|
| Technical / infrastructure / data | C5 mosaic or pixel-resolve with a motif wipe; or C7 dive | Mark made of the scene's own texture; alive hold | medium, building | 0.7-1.4 s alive | gradient glows, fades |
| Developer / AI tool | C9 typed prompt, cut before send; or C7 dive into the logo | The viewer's action is the CTA; no logo needed | low-medium, precise | 0-0.5 s | showing the result, a tagline |
| Playful / consumer | C10 character-built lockup; or C8 button click cut before release | Character carries the build; click feels real | medium, lively, no overshoot | 1.0 s with sweeps | static hold, rainbow gradients |
| Premium / dark | C1 wordmark crash with radial streaks | Weight and arrival; inverted ground | high, then a long creep | 1.2-1.4 s | tagline, bounce |
| Quiet / editorial / enterprise | C3 emblem blur-down with typed name; or C2 bar-built mark (wash resolve) | Restraint; slow reveal | low | 0.67 s static then outro | glow, particles |
| Rebrand / "from X to Y" | C6 per-glyph morph with icon spin | Both names visible from one lockup | high, 1.05 s | 0 s | crossfade |
| Minimalist consumer (pure shape icon) | C4 icon on white | Large start settling for 2.5 s | low | 0.5 s static | wordmark, tagline |

**R3.0** WHEN you choose a close -> DO start from the idea (idea.md), then the brand's personality (table above): the mark's job in the film (the button, the toggle, the result) often *is* the close, and no table row is needed -- *because* the table is a menu of corpus signatures, and a close picked from a menu is a default.
**R3.1** WHEN two closes tempt you -> DO use one; the only pairings seen are a UI act followed by one build or sign-off (M920, M932) -- *because* one ending is stronger than two (PRACTICE for the general case).

---

## Slop tells for closes

| An AI default would | A designer does |
|---|---|
| Fade the logo up with a bounce and a tagline | Hard cut, enter at 1.5-3.75x, settle with an exponential curve, 0 or 1 tagline |
| Let the end card sit 3-5 s (a third of the film) with a slow contraction | Resolved hold 0.6-1.4 s, CTA beat <= 25 % of the film; add a beat, not logo time (R2.0) |
| Hold the logo still for 2 s, then fade to black | Keep it alive (creep, sweep, sway), end mid-motion or on a placeholder frame |
| Add a "click ripple" and show the result | Squeeze the object (.74-.85), one smear frame, cut before release or before send |
| Crossfade between brand colours | Hard cut to an inverted ground (dark after light, white after dark) |
| Scale the mark up from zero | Oversized and blurred, halve the excess every 2 f; or stems/bars/line built in discrete steps and solid in one frame |
| Use a glow on everything | 3 layers (3/15/45 px) on the sign-off only, a halo scaling with the name |
| Make the CTA a big button with "Get started" and a gradient | A small lockup (.22-.38 W) in 95% empty space; CTA at 7% H em with focus-in words |
| End with a fade-out and music tail | End mid-sweep, mid-rotation, or on a one-frame card |
| Animate the wordmark with a typewriter | Crash-in, glyph-per-frame with tracking collapse, or pixel-resolve left to right |
| Put a tagline, URL and button together | One line at most; the mark is the last thing |
| End with logo + "Download" pill + cursor (a web footer with a cursor) | The product's own control pressed and cut before release, or the name on the voice and one hard slam; no URL strip |
| Always end with the carrier dot becoming the logo's dot, or a lockup built from the motif | The logo arrives by cause; the built-from-parts close only when it is this brand's idea (C2 warning) |
| Start every logo at 3.5x because "start big" | An arrival that decelerates; spend scale once, and let the ending be smaller than the climax |
