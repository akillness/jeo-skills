# Slop: the review file

See also: judgment.md (what good is, with the conditions), idea.md (finding the idea; cover-the-logo), world.md (grounds, light, surfaces: the cure for flat swatches), motion.md, type.md, layout.md (section 0: page chrome), ui-demo.md, transitions.md, close.md (the numbers behind each fix); director.md (what to change when a beat fails; the storyboard checks); sound-sync.md (section 6a: sound has an arc); tools.md (which script computes which gate).

Slop is not a style. It is what comes out when no decision was made. This file is used in three places:

- **Part 0 runs on your PLAN**, before you build: the twelve default reaches and the house style, as questions you ask of your own choices.
- **Part 1 is a lookup** of what an AI does by default against what a working motion designer decides instead, grouped by topic, plus **Part 1b**, the conditions under which each "tell" is actually right.
- **Part 2 runs on your RENDER**: an honest way of seeing, six gates (G0-G5) computed by scripts where possible, and a checklist. **Part 3** ranks the six fixes that matter most.

Times are at 30 fps with seconds in brackets; sizes are % of frame height H or width W; evidence is cited as moment IDs (M913...) or as N1-N25, the ranked page/template patterns of Part 1.

How to run it: build a draft, run the scripts (`render.mjs` writes `<out>.mp4.events.json`; `look.py` uses it for exact cut frames and prints G0, G2, G3, the audio audit and the motion note; `lint.mjs` computes G5), look at the sheet, work Part 2 top to bottom marking each item PASS / FAIL / JUSTIFIED (a justified fail names the film-level decision that allows it; gates are never justified), fix the three highest-impact FAILs in Part 3 order, re-render and re-check once more. Two passes is the budget; do not polish past that. Never certify your own film as good: the NOTE.md says what you looked at and quotes the numbers.

---

## Never ship

A film that contains any of these is not finished. Delete the element; do not justify it. (This list mirrors the "Never ship" block in SKILL.md; if they ever differ, SKILL.md wins.)

1. **Page chrome / HUD:** a brand or film name in a corner, tracked-caps labels, counters ("02 / SPEAK", "01 - THE WAIT"), timecodes, BPM/FPS/resolution text, progress bars, corner brackets, scene labels over a shot (N1, N2, N13, N21; gate G5; layout.md section 0).
2. **Deck layouts:** a held left-aligned headline block, a kicker above a headline, a title then content, header/body/footer, "headline left, device right" (N3).
3. **Generic web-component UI:** a rounded card with a status dot and "label - value", a "Good morning" card, three-circle toolbars with a send arrow, zinc greys, skeleton bars; invented names or numbers where the capture has real ones (N5, N17).
4. **The name's first association** as the idea (N19).
5. **Invented stats and proof**, stat walls, a stat slide (a centred big number over a small label), on-screen disclaimers (N7, N17).
6. **Slogan copy:** triplets of one-word sentences, "Not just X. It's Y.", "Unlock", "Meet X", "the future of" (type.md section 0.3).
7. **The house style as a default:** a giant cropped word, texture in the letters, a colour flood or circle wipe between beats, a dot that becomes the logo, a lockup built from the motif, a transformation chain, a headline typed with a caret (N9, N12, N15; Part 0).
8. **Flat swatch grounds per scene, or a small card on a void** (a 0.3 W object for a 1 s read on empty ground) (N4, N5).
9. **A pinned object**: a pill or dock at the same coordinates through three or more shots (N8).
10. **A web-footer ending:** logo + tagline + button + URL, or any end card held past 1.4 s (N14; gate G3).
11. **Self-certification:** no `NOTE.md`, gates claimed without script numbers, "justified" fails (N25).
12. **A film you did not look at.** A 15 s black render was once certified "VERIFIED / CLEAN".

Slide test (30 seconds, on `look/sheet.jpg`): cover all the text with your hand. If more than half the frames are "a flat colour with a card or a block on it", it is a deck. Fix the picture, not the type.

---

## Part 0. The default mind (run on the PLAN)

The root of every default below is the same: **no decision about what this one film is for.** None of them is banned. Each is fine *if you chose it for a reason you can say in one sentence about this brand*. What is not fine is arriving there by default. Run this on the storyboard before you write code (director.md section 7, check 10), and again on the render.

### The twelve reaches

| # | The default reach | Notice it: ask |
|---|---|---|
| 1 | **Making a page instead of staging a picture.** Left headline + grey sub-line + phone on the right held while the words change; a centred title + subtitle; a heading over a chart for every beat; a row of icon tiles. The frame stays put and content is swapped into slots, so time becomes pagination. | Would this frame work as a slide or a website hero? Then it is a page. |
| 2 | **Showing everything.** Every feature from the brief gets a beat of equal weight; nothing is *the* thing. | What is the one true thing? Which features did I leave out on purpose? |
| 3 | **States instead of events.** Things fade or rise in and hold; the plan describes end states ("a phone showing the toggle"). | Does my plan say what *happens* (what moves, what it causes), or only what is shown? |
| 4 | **Premium pastiche.** Near-black ground, radial glow, a gold or coral spark, lens flare, one serif-italic word in a sans line, tracked small caps. Six of ten AI films sat on near-black; under a third of the designer films did and almost half were bright. | Is the ground dark because the brand is dark, or because dark feels expensive? |
| 5 | **Production metadata as decoration.** HUD corners, "BAR 1/8 - 120 BPM", "FILM 01", "01 / 04", version numbers, on-screen disclaimers. The look of a design tool mistaken for design. | Does the viewer need this text? (They do not need your storyboard.) |
| 6 | **Filling holes with invented proof.** Stat walls, counters to unsourced numbers, grey skeleton bars as UI, a redrawn logo, emoji as icons, vibe-coded cards. | Is anything on screen invented to look real (numbers, UI, users, songs, quotes)? Did I open `screens/` and `media/` first? |
| 7 | **The first association of the name.** A name that sounds like stars gets stars; "launch" gets a rocket; security gets a shield. | What was my first idea? Did I write it down and look past it (idea.md)? |
| 8 | **Effects standing in for quality.** A new technique every beat (morph, particle cube, ribbon, circular text, glitch, 3D bars, orbit rings): showing you *can*. | Is this effect here because the idea needs it, or to show effort? |
| 9 | **A script with illustrations.** Words first, a picture under each sentence. (The copy is often the best part of an AI film: keep the writer.) | Does the picture have its own job, or does it illustrate each noun? |
| 10 | **Sound as wallpaper.** A fixed-tempo loop at a flat level, an onset every half second for 15 s, no silence, no build, no hit on the turn; or silence by default. | Where is the first big sound or silence, and what visible event is it tied to (sound-sync.md section 6a)? |
| 11 | **The ending as a web footer.** Logo + tagline + CTA pill + URL held for seconds, as conversion furniture rather than the last beat of the story. | Did the logo arrive by cause? Is the ending smaller than the climax? Is it 0.6-1.4 s? |
| 12 | **Minimalism as a hiding place.** A small UI element on a black void, a lone line, long holds, a logo alone for four seconds: it looks restrained, but nothing was risked, built or crafted. The user has rejected it directly ("it should have more stuff than this"). | Is more than a third of the film nearly still? Is any frame mostly empty ground with something small on it, and is that emptiness doing a job (a breath before a payoff) or is it undesigned? Where is the frame someone would screenshot? |

### The second-order default: the "designed" house style

Told "do not make slides, be bold", a model overcorrects into a different default that is just as recognisable:
- a giant word cropped off the frame edge, in every film;
- the repeated-word marquee band;
- texture, video or gradient filling the letters;
- a colour flood or circle wipe between every beat;
- a small dot or shape that becomes the logo's dot, "o" or full stop;
- a lockup built from the motif of the film (found in all of 21 generated directions);
- a text strip sandwiched between rows of texture;
- everything moving all the time, holds forbidden, giant type everywhere so giant means nothing;
- every film a chain of "X becomes Y becomes the logo" (18 of 22 idea lines).

Eight brands made this way read as one designer's reel in eight colourways. Each of these moves is legitimate when it *is* the idea for this brand. As proof of effort, it is the new slop. This skill's own defaults can feed it: law 7 (arrival from oversize), the carrier object and the built-from-parts logo (director.md section 4, close.md C2/C3/C5) are *options*, not the house style.

### Notice-it questions (the plan check)

- Which of my choices did I *decide*, and which did I *reach for*? (For the film shape, ground, type, ending, sound, transitions: one sentence each.)
- With the logo and colours swapped, is this the same film I would make for a competitor? (Cover the logo.)
- What is the first idea I had? Did I look past it?
- Am I showing everything? What is the one thing?
- Is anything on screen invented to look real?
- Is the ground dark because the brand is dark, or because dark feels premium?
- Is this a transformation chain because that is the best film, or because it is the film I always make?
- Is it sparse because the idea wants silence, or because I did not build the world? Where is the frame someone would screenshot?
- With the text covered, does every beat still show a picture?

### Mechanical compliance

A checklist can be satisfied by a film that does not exist: a 15-second black render was once self-certified "VERIFIED / CLEAN", and a banned stat card renamed as a "slot-swap move" is still a stat card. So the gates below are computed on the render by scripts the agent does not edit, the numbers are quoted in NOTE.md, and everything else is a question you answer in plain words. A passing gate is a floor, not a verdict.

---

## Part 1. Master table: AI default vs pro decision

### Page, template and house style: the 25 ranked patterns (N1-N25)

Ranked by how hard the user rejects each ("header, footer, text on left side... like slides" is the strongest dislike), then by how often it appears in the evidence (three rejected AI films, a v1 test film of this skill, and the earlier A/B tests). "Test" gives a contact-sheet check and a source/DOM check; `scripts/lint.mjs` computes the page-chrome and deck items (gate G5). The ranks 9, 22, 23 and 24 are merged into existing rows below (T2, M4, M5/G4, X1) with their tests.

| ID | Pattern (why AIs default to it) | Test | Pro alternative |
|---|---|---|---|
| N1 | **Corner chrome**: tracked-caps brand or film name, counter, timecode, BPM/FPS/resolution, corner brackets (renderer house style plus the urge to look designed) | Sheet: text under 0.04 H in the outer 14% band repeating on 3+ frames. Source: uppercase + positive tracking; class names like hud, kicker, eyebrow, header, footer, meta, counter, progress, bracket | Nothing. The frame is the claim, the product, the logo once (layout.md section 0) |
| N2 | **Chapter or scene counter**: "02 / SPEAK", "01 - THE WAIT", a progress hairline (decks have page numbers; a chapter row read literally as "numbered") | Sheet: digits + slash or dash + word. Source: text matching a number-separator-word shape, or "chapter/scene/act/step N" | The chapter is a ground change plus a carried object (transitions.md T1, T15), never a label |
| N3 | **Deck layout**: left-aligned headline with sub-line, kicker above headline, title top-left with content below (web and keynote priors) | Sheet: text block with ink-left x < 0.2 and a second smaller text under or over it. DOM: largest text, not centred, x0 < 0.2 | One centred line at y .52-.54, or a split phrase whose far half is an object (layout.md R1.1, R1.4) |
| N4 | **Flat swatch ground per scene** (cream, ink, lavender, green plateaus; "brand colours" read as hex, so a swatch is the safest fill) | Sheet: sample 9 points; under 6% luma range = flat. More than 3 distinct grounds in a film = deck. Source: scene roots with a plain background colour and no image or gradient child | A surface from the capture (plate, product screen, material, light) per act (world.md); flat only for a flood or dive under 1 s |
| N5 | **Generic UI card as the proof** (white rounded card, three-circle toolbar, send arrow; tweet card; calendar; "Good morning" card; the cheapest signal of "a real product") | Sheet: rounded rectangle with 3 identical small icons; no brand-specific detail. Source: large radius + `.ico/.send/.card` names + invented strings | A magnified fragment of the *captured* UI with its real icon, sender, time, sentence, cropped by the frame edge (brand.md section 3; layout.md R5.1) |
| N6 | **Feature tour**: card + caption x N, equal beats, caption at the same y every time (completeness reflex) | Sheet: 3+ frames with the same layout at the same coordinates and different words | One proof, one object per frame; beats of unequal length that shorten then linger (Tm1 below) |
| N7 | **Stat slide / stat wall**: centred big number + small label; "12,000+"; "88%" (numbers signal credibility) | Sheet: a 22-33% H number with a smaller label under it, centred, on a flat ground. Source: a count-up followed by a label; thousands-separated numbers | The number is the claim only inside a physical beat (a counter tied to the control that causes it, M9); otherwise cut the number and show the thing |
| N8 | **Pinned element**: a pill, dock or caption at identical coordinates through 3+ shots ("recurring carrier" taken literally) | Sheet: the same small object at the same x,y in 3+ consecutive frames. Source: an element outside all scene roots with no camera or x/y tween | A carrier that moves, scales or changes role at every seam (transitions.md T1); if it must sit, it sits for one beat |
| N10 | **Technique showreel**: a new effect per beat, no motif (the model cannot judge quality, so it shows range) | Sheet: adjacent frames share nothing (colour, object, layout). Source: more than 4 unrelated canvas/SVG generators | One idea and only the effects it needs; a carried motif if the shape is a chain |
| N11 | **Premium pastiche**: near-black ground, ember/gold glow, vignette, lens flare ("keynote dark mode" averaged with luxury) | Sheet: radial brightness falloff to corners; warm halo behind the logo. Source: radial gradients, large soft shadows, large blurs | Flat shapes; a halo only at an event (K3); a ground that is the brand's real surface; light with a source (world.md) |
| N12 | **Serif-italic accent word** inside a sans line ("in *your voice*", "*faster*"; a 2023 SaaS-reel habit) | Sheet: a caption with one italic serif word. Source: italic inside a sans element | One family; scale carries emphasis (T3, T9). A serif only if it is the brand's heading face, then used everywhere in that role (type.md section 1) |
| N13 | **Tracked-caps tagline** ("MOTION DESIGNER", "A NEW MODEL FROM...") (looks editorial) | Sheet: wide-spaced small caps. Source as N1 | No tagline (E6, H5) |
| N14 | **End card = logo + tagline + CTA pill + URL** (landing-page CTA habit) | Sheet: the last frame has more than 2 text groups. Source: button/CTA + url strings in the last scene | The name on the voice or one hard slam, 0.6-1.4 s hold, mid-motion (close.md R2.0; E2-E6) |
| N15 | **Giant single word as a slide** ("WAITING", "Hope.", "EVERY FRAME") (the skill's own scale push plus no picture) | Sheet: one word over 0.3 H on a flat ground, no object. Source: font size >= 250 px, one text child | Spend scale once and give the word a surface or a physical cause (type.md 3.3; layout.md R9.6) |
| N16 | **3D tilt / 3D chart / orbits** around a flat card ("depth" as a stand-in for craft) | Sheet: perspective-skewed card; red 3D bars. Source: perspective/rotateX/rotateY, a three.js import with no scene reason | A cropped, held-pose device (U11), a stepped 2D camera, or real 3D when the idea is physical (world.md) |
| N17 | **Invented proof / placeholder UI when real assets exist** (a stock first name, a made-up email subject, "12,000+ creators"; no real material was gathered) | Source: compare strings in `index.html` with `brand/BRAND.md` copy; any person name, number or UI label not in BRAND.md or the brief is a flag | Captured copy and screens; invented items declared in NOTE.md |
| N18 | **Brand = hex + font only**: the capture's photos, signature graphic and real UI unused (the skill said look, not build) | Source: `brand/media/*` and `brand/screens/*` not referenced by `index.html` (a v1 test film used 0 of 9) | Build the ground and the proof from the capture (brand.md sections 1, 3) |
| N19 | **Name-literal idea** (a name that means fire gets an orange glow; a name that sounds like stars gets stars) (first-association ideation) | Review the one-sentence idea: is it the dictionary meaning of the name? | One true feature or user moment from the inventory (brand.md section 0.5; idea.md) |
| N20 | **Ghost decoratives**: giant words at 3-9% opacity, hairline rules, grid patterns, grain as "depth" (a renderer house style) | Sheet: faint large text or lines behind content. Source: opacity 0.03-0.09 on large text, 1 px rules, repeating gradients | None. Texture only as a surface from the capture, or hard squares born in place (M12) |
| N21 | **Label chips naming the scene** ("Messages", "Mail", "Editor") (looks informative) | Sheet: small text at x < 0.2, y < 0.14 on each UI shot | The UI shows which app it is (real icon, layout), no caption |
| N25 | **Metronome sound + self-certification**: a flat loop on a printed BPM; a README that says "VERIFIED"; a lint that says CLEAN on an empty film | Printed "BPM" in the picture; no NOTE.md; a "CLEAN" lint on a film with under 5% pixel change | One to three hand-synced hits and designed silence (sound-sync.md section 6a); a mandatory NOTE.md that quotes the script numbers |

### Sound

| # | AI default | Pro decision | Evidence |
|---|---|---|---|
| S1 | A loop at one level on a fixed tempo for the whole film (N25) | Sections shaped around the edit; the arrangement changes at the turn; music pulled down 6-10 dB while the viewer reads | sound-sync.md 6a |
| S2 | A hit on every cut and every word | One to three hand-picked hits (the click, the name, the turn); wall-to-wall hits are a tell | sound-sync.md 6a, 7 |
| S3 | The first big sound on a bar line with no visible cause | Tie it to something visible (a click, a lift), or tie the silence to it; clear 8-15 dB before the biggest move | sound-sync.md 6a |
| S4 | Music fitted to an early cut, ending in digital silence | The score covers the whole cut; re-fit after any trim; the `look.py` audio audit shows no silent tail | sound-sync.md 6a, 8 |
| S5 | A swell over a real result | Consider no swell: the event is the climax; silence is a valid, decided choice for muted social | sound-sync.md 6a |

### Type

| # | AI default | Pro decision | Evidence |
|---|---|---|---|
| T1 | Headline words fade in (opacity 0 -> 1) | Whole word lands on one frame, or enters from an offset (0.03-0.24 H low, or 16-32 px to the entry side) with 3-6 px blur clearing in 4-8 f; no opacity ramp | M921, M929, M958, M964, M967 |
| T2 | Headline typed letter by letter with a caret (N9). A narrative reason ("the film is about typing") is not an exception: a justified exception is still a fail | Words arrive whole, 2-5 f (0.07-0.17 s) apart on the speech rhythm; typing only for the product's own input field. Test: a caret in frames 0-2 on a headline; a typing call on a non-input element | M936, M937, M964, M967, M934 |
| T3 | Bold weight for emphasis | Weight 400-550 everywhere; bold only on a wordmark (<= 600) or one headline word; scale (4-33% H) and colour carry hierarchy | M930-M938, M962-M969, M913 |
| T4 | Title centred and held static | Phrase drifts continuously (about 7% W over 1.1 s), accelerates 2x in the last 2 f before a cut; resting position slightly off-centre (x 0.46-0.47) | M921, M947, M957 |
| T5 | Default tracking | -1.5% to -5% em at display sizes; numerals tight | M929, M930, M947, M967 |
| T6 | Re-centre surviving words when the line changes | Survivors stay put; drop leading words on single frames (1 f apart), add new words at the right | M914, M956 |
| T7 | Pure #000 text everywhere | Charcoal ink (#383837, #575756); pure black only on the hero figure or wordmark | M936-M938, M947 |
| T8 | Key word highlighted with underline, glow or a left-to-right swipe | Hard-cut selection box 4-5 f (one per word, one empty frame between), OR a hand-drawn loop on a 12 fps pose clock; never both | M930, M933 |
| T9 | A different font and colour for every beat | One family, the brand's own (a neo-grotesk only when it has none); a serif is the brand's heading voice everywhere in that role, or one deliberate second-voice line; never a lone serif-italic accent word (N12) | M913-M969 |
| T10 | Word changes identity by whole-word crossfade | Per-letter swap in ~5 f (each letter blurs and drops 0.03 H, then the new glyph rolls in) or a per-glyph flip with a fixed left anchor | M916, M973 |
| T11 | Words enter all from the same side at the same speed | Different mechanic per word inside one line (whole slide, scattered fragments, per-glyph streak), shrinking travel per word (24/18/13/13% H) | M930, M929 |
| T12 | Hero number gets a soft entrance | An arrival that decelerates from oversize (0.33 H, 0.91 W), slow shrink then accelerate with blur 0 -> 18 px; once per film, with a cause (N15) | M937, M947 |

### Motion

| # | AI default | Pro decision | Evidence |
|---|---|---|---|
| M1 | One ease-out on everything | A curve per role: entrance `softLand` / `snapSettle` (60-72% of travel in the first 4-5 f, then a 0.4-0.6 s tail); exit `accelExit` over 6-13 f; counters stepped per frame (`softInOut` only for a number tied to a control); typing stepped; no-dead-frame drift `cruise` | M913, M914, M929, M920 |
| M2 | Bounce/overshoot on every pop | No overshoot except small late `popOver` leans (motion.md R1.10) and one visible spring payoff per film (+4-6%) | M948, M973, M914 |
| M3 | Items fly in from off-screen to slots | Scale in place 0 -> 1.12 -> 1.0, one frame apart; or shrink to nothing in place in 3 f | M918 |
| M4 | Uniform 0.1 s stagger; the same small slide-in (24 px, 4-6 px blur, 40-80 ms stagger) on every text (N22; a house rule of "24 px travel, hold every line 1.2 s" is this slop). Test: every entry call with the same distance and equal gaps | Uneven gaps (3,2,2,2,2,2), origin-first on a convex front; a curve per role; entries from 0.03-0.24 H offsets (M1, T1) | M933, M934, M935 |
| M5 | Held frames are frozen; hold-and-swap (each text held 1.2 s+ then replaced; 7 s on one card) (N23) | No dead frame: one living thing on every held frame (drift 1.1-1.5 px/f, dot grid 0.02 W over 2.9 s, shimmer, scrubber creep); true holds only after a payoff, 0.5-1.0 s; a designed breath (0.6-1.5 s, stated reason) before a payoff is fine. Test: `still.txt` stretches over 0.6 s | M913, M916, M932, M936 |
| M6 | Motion blur on everything (or inconsistent) | One grammar per film: crisp-step OR smear along the travel vector on frames 0-1 only (3 -> 65 px) | M913/M914 vs M916-M920 |
| M7 | A group slides as one block | Each object is its own body with its own path, rotation, bounce (0.03 H); settle, then hold 0.8-1.0 s motionless | M938, M941 |
| M8 | Smooth in-between morph between states | One-frame hard switch into ~90% of the state, then a 3-10% ease-out settle over 7-14 f | M958, M947, M962 |
| M9 | Count-up tween to a round value | One value per frame, step sizes decaying toward ~0.07, skipped values, product fields end un-round | M954, M955, M958, M923 |
| M10 | Logo scales up from zero or fades in | Enters oversized and blurred and scales DOWN (0.28 -> 0.10 W, excess halving every 2 f); or built from parts; or held large and shrunk on an exponential ease | M968, M965, M932, M959 |
| M11 | Every motion plays at full speed | The last word or event slows down for emphasis (a glyph every 3 f; a 10 f gap before the stinger word) | M921, M966 |
| M12 | A background texture fades in | Flat hard squares born in place, never moving, delayed ~0.2 s after the headline lands | M964, M967 |
| M13 | Exits are the entrance reversed | Exits are new motion: faster, accelerating, overlapping the next entrance by ~2 f | M933, M938 |

### Camera

| # | AI default | Pro decision | Evidence |
|---|---|---|---|
| C1 | Smooth ease-out zoom | One-frame snap (ratio 0.56-0.77) plus a 9-18 f tail; a 2-frame push, an ~18 f hold, an accelerating pan that ends hard | M913, M914 |
| C2 | Zoom tween between type scales | Hard scale cut in ONE frame, paired with a content jump in the same frame | M949, M964 |
| C3 | Show the full UI window | Crop one object at 1.4-4.4x; window is the camera; reveal by pull-back | M913-M919 |
| C4 | Static camera on UI | Camera never settles; parallax 2-2.4x between layers; two-phase pans | M922, M966 |
| C5 | Heavy backdrop blur (20 px+) or fading it to grey | 4 px readable, 7-15 px for non-hero panels, capped ~11 px behind a headline, headline unblurred | M918, M942, M956 |
| C6 | Camera zoom applied to text and UI separately | One camera group; type is never zoomed on its own track | M913, M919, M953 |

### Transitions

| # | AI default | Pro decision | Evidence |
|---|---|---|---|
| X1 | Opacity crossfade between scenes; dissolve or blur-swap between captions or cards (N24). Test: any frame showing two texts or two cards blended; scene-level opacity tweens | Hard cut, mid-motion, with a matched object (conditions for a fade in Part 1b) | M914-M974 |
| X2 | White flash or black dip | A growing object (0.04 W bead -> disk), a 4-frame flat-grey dip carrying the action, or a feathered wipe (0.31-0.42 of the axis, 0.56-0.6 s) painted in the next ground | M922, M916, M939 |
| X3 | Next scene starts from rest | Next scene's first frame is already moving (105-280 px on frame 1; blurred; mid-zoom), travelling along the previous vector | M914, M918, M916 |
| X4 | Last frame has nothing to do with the next first frame | Carry one object, pose, string, ground or caret across (same position within ~0.03) | M921/M922, M948/M949, M957/M958 |
| X5 | Occluded objects fade out | The new object rises and occludes them (62% of the travel in 4 f) | M916 |
| X6 | Ground colour fades or flashes | One continuous colour track 0.5-0.7 s timed to the leaving object, or hard plateaus of 0.3-0.4 s with a 1-frame gap | M926, M944 |
| X7 | Wipe as a plain edge | Wipe in the next scene's ground with a feather; or motif-as-wipe (stair edge, pixel cells, a band) | M939, M946, M965 |
| X8 | Scene change on a random frame | Cut interval constant on a beat (10 f = 0.333 s four times) or cut on peak velocity | M962, M948, M959 |

### UI and cursor

| # | AI default | Pro decision | Evidence |
|---|---|---|---|
| U1 | OS cursor with hand and I-beam swaps | Custom cursor, one family per film; either arrow-only or pose-swap (1 frame), never mixed | M914, M919, M931, M935 |
| U2 | Cursor lands at final size with a gentle ease | 1.5-5x oversize, scale about the tip, ~60% in frame 1, 0.5-0.9 s creep | M953, M956, M959 |
| U3 | Straight, constant-speed path | Curved path with heading rotation; arcs dipping 0.23 H; 2-frame steps decaying x0.72 | M914, M943, M969 |
| U4 | Hover and click on arrival | Park 2-15 f, finish zoom first, then press | M914, M919, M931 |
| U5 | Click = ripple ring | Press 2 f to 0.71-0.9; target 0.63-0.81 one frame later; hard colour step; no ring | M930, M939, M953, M956 |
| U6 | Typing at constant speed, blinking caret | Authored cadence, pauses after spaces, solid caret while typing; rate chosen by viewer task (21-24 vs 84 chars/s) | M931, M935, M949, M962 |
| U7 | Toggle with a long ease and a glow | Two frames: knob, pale frame, colour | M933, M935 |
| U8 | Cascade is a timer-regular list | 2-3 f per item, uneven gaps, <= 0.6 s total | M933, M935 |
| U9 | Spinner and "Loading..." | Per-word blur-in status, two shimmer passes, wipe, a check drawn on | M919 |
| U10 | Cards slide in from the side | Newest card inserted at the top blank, then filled; older cards pushed in jumps with one 2-frame hold | M940 |
| U11 | Phone tilted 15 deg with a drop shadow | Cropped, six held poses with visible thickness, headline behind, sparkle in front; or stepped 2D camera jumps | M955, M957 |
| U12 | Cursor lives on the UI layer and is scaled with it | Own top layer, own scale (1.5x when UI is 2.33x) | M914, M943, M969 |

### Colour

| # | AI default | Pro decision | Evidence |
|---|---|---|---|
| K1 | Accent colour on many objects | One hue, one meaning ("machine acting" or "arriving"), plus at most one signal colour (green = done); never both on one object | M913, M914, M919, M933, M967 |
| K2 | Words permanently coloured | Arrival tint for 1-6 f (24 fps) or 0.28 s linear, settling to ink | M966, M967, M973, M974 |
| K3 | Glows, nebulae, particles, gradient cards; the same floor glow under every scene (reads as a template) | Flat shapes, soft bands inside hard-edged shapes, halo only at an event (peak 35 px @40%, decays ~0.3 s). Light with a physical source (one direction, falloff, contact shadow) belongs to the world (world.md); a glow as wallpaper does not | M956, M954, M946 |
| K4 | Dark to light flip by fade | Growing object, hard cut at an act boundary, or a hard plateau sequence (white, teal, cyan, white at 0.3-0.4 s each) | M922, M944 |
| K5 | Every scene on the same ground, or a different flat swatch for every scene (N4) | A surface per act (plate, screen, material, lit gradient) that flips at act boundaries by a carried object or hard cut (dark bookends, light middle, or one world per act); surface greys stay neutral; flat colour only for a flood under 1 s | M930-M932, M953-M959 |
| K6 | Colour spread evenly through the film | Monochrome until the payoff; colour used once as an event (a single demo, a final word, one halo) | M963, M962 |

### Endings

| # | AI default | Pro decision | Evidence |
|---|---|---|---|
| E1 | Fade to black | Cut mid-motion; the last 0.2 s accelerates (contraction, pan); a visible, moving last frame | M913, M914, M929, M938, M944 |
| E2 | Logo fades up and sits 2-3 s | Built from parts, shrinks continuously, cut hard to the dark name that slams from 3.5x; a short hold (0.6-1.4 s) with something alive (sway +-1% W) | M929, M932, M946 |
| E3 | Tagline plus CTA plus logo in one lockup at once | CTA words focus in place (opacity 0.12 -> 1, blur 8 -> 0, 4 f each); lockup ~0.30 W x 0.20 H in 95% empty ground | M920 |
| E4 | End by showing the click resolve | Cut at max compression / before release; end 0.11 s after arrival | M931, M959, M949 |
| E5 | End on a settled hold | End mid-motion or on a one-frame new element (empty card, capsule, word) that the next shot inherits | M962, M966, M969, M957 |
| E6 | Tagline under logo | No tagline; the mark begins at 1.5-1.9x and settles over 2.5 s | M959 |

### Timing

| # | AI default | Pro decision | Evidence |
|---|---|---|---|
| Tm1 | Beats of equal length | Beats shorten then the last lingers (1.3 / 1.07 / 0.70 / 0.43 s then a 0.6 s title); scenes get shorter, the last one lingers | M947, M929 |
| Tm2 | Words land on a metronome | Onsets on spoken words; gaps 3-5 f accelerating or 5,5,3,3; a 4-word phrase assembled in 0.7 s then held 0.5 s (~1.2 s per ~20 characters) | M936, M964, M967, M929 |
| Tm3 | Mixed frame clocks (12, 24, 30 fps steps in one moment) | One clock per moment: 12 fps for drawn items under a 24 fps camera, or 2-frame holds across everything | M934, M947-M949, M967-M969 |
| Tm4 | Every hold the same length | Reading hold 0.5-1.2 s; payoff hold 0.8-1.0 s; single number 0.5-1.2 s; a designed breath 0.6-1.5 s before a payoff; nothing else holds | M939, M945, M946 |
| Tm5 | Silence after a click or send | 3 empty frames, then the next element sweeps in along the same vector | M916, M919 |

---

## Part 1b. Works when: the conditions behind the "tells"

Taste is conditional. Nearly everything above that generic AI films overuse was also used well somewhere, under a condition. The default is the left column's reading; the right column says when it is right (judgment.md has the full argument). Where a row says "never", there is no condition.

| Usually a tell | Works when |
|---|---|
| Typewriter text with a caret | The product *is* something you type into and the typing is inside its own input field, or the caret becomes something (a divider, the logo's letter, the UI). Never a film headline (type.md section 0.4), never as the reveal style of every line |
| Centred still end card | It follows sustained motion, echoes the opening, and the logo arrived by cause rather than by fade; held 0.6-1.4 s |
| Soft gradient / glow orb | It is the brand's own material, a named object with a job, or one light source that changes with the mood; never wallpaper under every scene |
| Serif in a sans film | It is the brand's own heading face (then use it everywhere in that role), or a deliberate second voice used rarely and large, or it quotes a partner's real typography; never a lone italic accent word |
| Dissolve / blur transition; "almost nothing fades" | The blur copies a real gesture (focus pull, scroll, whip) with a direction; the dissolve *is* the meaning (privacy, forgetting); the brand voice is calm and reassuring; a single object fades (one headline line, the last phrase). Never as the join between every scene |
| Hard colour flips | The colour change is the story beat and one element carries across the cut; the grounds are surfaces, not swatches (N4) |
| Slide grammar (centred line, flat field, cuts) | It is paced to a voice at speech rate, the type never moves position, and a second visual voice adds wit (a cursor, an object). Never as a page: no label, counter, sub-line or kicker |
| Mostly empty frame, tiny text | There is exactly one subject, something leads the eye (a cursor, a voice, eyes), the emptiness does a job (a breath before a payoff, isolation after a matched cut), it lasts under about 1.5 s, and it is not at phone size |
| A number counting up | The number is the real offer, its size is the point, and it is tied to the control that causes it (type.md section 8); a proof-texture number appears whole, with no count-up |
| Ending in motion (and "never a calm end") | Default for energetic brands. About 22 of 51 human films end calmly: a quiet brand, after sustained motion, with the mark already arrived |
| Template moves | Deliberate quotation (satire), where bland visuals against loaded copy is the joke |
| Low frame rate, no blur | Used consistently as a chosen texture (an on-twos film) |
| Monospace headline | It is doing a job (reads like a bill or a log) and gives way to the brand font when the product arrives |
| A giant cropped word or a giant first word | The idea wants that word to be huge, it arrives once with a cause (a camera pan across it, a surface), and scale is not spent again; not as an opening in every film |
| A dot that becomes the logo; a lockup built from the motif; a transformation chain | It *is* this brand's idea (its own mark really is that shape) and each link is true; otherwise the logo arrives by cause |
| A held frame ("no dead frame") | A designed breath of 0.6-1.5 s with a stated reason, immediately before a payoff or after a matched cut, with one living thing on it |
| A carrier object | The film shape is a chain of handoffs; it moves, scales or changes role at every seam |
| 3D / tilted flat UI | The idea is physical (an object that has mass, catches light, or that the brand makes), or a cropped held-pose device; never a tilted card as "depth" |
| Page chrome (labels, counters, timecodes, headers, footers, kickers) | **Never.** There is no condition (gate G5) |

---

## Part 2. Frame-review checklist: look honestly, then run the gates

### How to see (do this first, before any checklist)

A self-ticked checklist is exactly what once certified a black film, so Part 2 starts with plain looking, in this order:

1. **Is there actually a film in this file?** (G0.) Non-blank, the picture moves, the length is what you planned, audio is present if planned. The script prints the numbers; read them.
2. **Is there one frame worth a screenshot?** If you cannot point to it, the hero moment (director.md section 4 item 9) is missing.
3. **Describe every sheet frame in one sentence.** For each frame of `look/sheet.jpg`: what is on screen, what is the hero, and would it pass as a slide or a web page? Write the sentences down (they go in NOTE.md). A frame you cannot describe in one sentence has no hero; a sentence that starts "a card on a flat colour" is a deck frame.
4. **Four looks at the same footage.**
   - *Thumbnail:* the sheet at thumbnail size. Can you read the claim? Does anything read at all?
   - *Cover:* cover the logo (is it another brand's film?), then cover the text (does each frame still show a picture?).
   - *Mid-change:* `mid.jpg` and `strips.jpg`, the frames two before every cut and mid-transition. Two half-states blended? A blank frame? A beat that settled before the cut?
   - *Real speed:* watch it once at speed (or step through a beat in real time). Reading time, the hold before the payoff, where the film breathes and where it drags.
5. **Fix in this order:** anything untrue or broken; the idea and what the viewer must understand; the connections between beats; hierarchy and scale; timing; surface and finish; sound polish. Do not tune easing curves while the idea is unclear.
6. **Never certify your own film as good.** NOTE.md lists what you checked and quotes the script numbers; it does not say "verified".

### 0. Gates G0-G5 (run first; each is a pass/fail, a FAIL is fixed, never JUSTIFIED away)

Each gate names what computes it: `look.py` prints G0, G2 and G3 in its GATES block (also `look/gates.json`; `--strict` exits 3 on any FAIL); `lint.mjs` prints G5; G1 and G4 have no script, so judge them on the sheet and stills and say so in NOTE.md; never estimate a number. Same table in SKILL.md and `tools.md` (flags there).

| Gate | Pass when | Computed by | Where to look / fix |
|---|---|---|---|
| **G0** Render exists | The file is non-blank, the picture moves, its length matches the plan, audio is present when planned (and the score covers the whole cut: no silent tail) | `look.py --expect S --expect-audio` (GATES block + audio audit) | If it fails there is no film to review: fix the render first |
| **G1** Proof readable | The one readable UI object has text >= 0.04 H and the fragment fills >= 0.55 W (or is deliberately cropped by the frame edge), lit and sitting in a world, magnified by the camera. A small card (~0.3 W, text ~0.03 H) floating in an empty ground FAILS unless it is a deliberate wide establishing shot under 1 s before a push-in | By eye on `look/sheet.jpg` and the stills, with your own numbers (measure the card width and the height of the smallest line you need); no script computes it | The proof beat's stills at thumbnail size: can you read the text? Fix: push in with the camera, crop to the frame edge, or cut the text. Never answer "it is brand-true to the capture" |
| **G2** No empty frame | Every frame has content; the only allowed blank is <= 3 frames inside a dive or zoom-through | `look.py` (empty-frame check) | `mid.jpg`, `strips.jpg`, stills at cut-3..cut+3 and after every dive: ~0.2 s of plain ground between a dive and the next scene FAILS. Fix: put the next scene's first object on screen before the dive ends; overlap entrance and exit by ~2 f |
| **G3** End card short | End hold (the picture unchanged at the end, lockup landed -> last frame) <= 1.4 s, i.e. a resolved hold of 0.6-1.4 s (under 0.6 s is a NOTE: it ends mid-motion, fine when intended); CTA beat <= 25 % of the film | `look.py` (G3 line: end hold against `--hold-warn 1.4`; final shot = last cut to end, as the CTA share) | Cut the hold; if the film is too short add a proof beat, never logo time. A slow contraction does not make a long hold acceptable |
| **G4** One hero per frame | Two panels in one frame only if one is >= 2x the other's area or the camera moves between them; otherwise one object per frame | By eye on the sheet (count the panels in every proof frame and compare areas); no script computes it | Cut or move the camera between the objects; shrink the second to a supporting texture |
| **G5** No page chrome | No corner or edge labels (C1), tracked-caps labels (C2), "0N /" counters (C3), timecodes/metadata (C4), header/footer bars (C6), kicker above a headline (C7), left-aligned headline block at x < 0.2 with right-side media (D1), progress bars (P1), letter-typed headlines (T1), vibe-coded UI cards (V1-V5); C5, V3 and V4 are warnings (layout.md section 0) | `lint.mjs <index.html>` (`GATE G5: FAIL` = exit 1; text inside UI surfaces is exempt from the chrome rules) | The report lists each hit with time and selector. Delete the element; never "justify" it. Also check the outer 12% band of every sheet frame by eye: the lint cannot see text baked into images or canvas |

Inputs for the rest of this part: (a) `look/sheet.jpg` (16 evenly spaced frames with timecodes; `--frames` for more), (b) `look/mid.jpg` (the frame 2 f before each detected cut, max 12) plus frame 0 and the last frame; for cut-1, cut and cut+1 render stills at the times in `look/cuts.txt` with `render.mjs --still`, (c) `look/still.txt` (stretches of at least `--freeze-min` s, default 0.6 s = 18 f, where the picture does not change), (d) the composition source for grep, (e) the `look.py` motion and audio notes. Thresholds are working tolerances taken from the numbers in the other files (practice where not cited), for 30 fps; scale by fps/30 otherwise.

### 0b. Notice-it checks on the picture (questions, not gates; answer each in a sentence)

| # | Question | Pass when | Where to look | Fix |
|---|---|---|---|---|
| W1 | Is it a slide? | With the text covered every frame still shows a picture; at most 3 flat grounds in the film; every shot over 1 s has a surface from the capture or a built world | Cover-the-text pass over `look/sheet.jpg` | Rebuild the shot from the brand's media or product screen, not a card on a swatch (world.md) |
| W2 | Is the ground made of something? | Each act's ground names its source (capture file, material, lit surface) and has light or texture unless the brand is genuinely flat | Storyboard header vs the sheet | Add the surface; flat colour only for a flood or dive under 1 s |
| W3 | Does the proof have identity? | The UI shows a real icon, sender, time and sentence from the capture; no generic card, no invented names or numbers | Proof stills vs `brand/screens/` | Rebuild from the real screen (brand.md section 3) |
| W4 | Is the capture used? | Photos, screens and the signature graphic in `brand/media` and `brand/screens` appear in the film (all unused is a FAIL of the capture) | Grep `index.html` for the file names | Use them as grounds and proof |
| W5 | Could this be another brand's film? | Swap the logo and colours: the film stops working | One sentence in NOTE.md | Return to idea.md; the idea came from the category |
| W6 | Where is the screenshot-worthy frame? | One frame is named, and it is the hardest-worked one | The hero moment in the storyboard vs the sheet | Spend the ambition there (world.md) |
| W7 | Decided or reached for? | Each item of Part 0 is either absent or justified in one sentence for this brand | The twelve reaches | Remove what you cannot justify |
| W8 | Is emptiness doing a job? | Any frame that is mostly empty is a breath before a payoff or isolation after a matched cut, under ~1.5 s | Frames flagged by `look.py` | Fill the world or cut the stretch |
| W9 | Does the film breathe? | `look.py`'s motion note: mean luma motion near the human band (median 6.8, IQR 4.4-9.8); if above ~10, is there a breath anywhere? if below ~3, does the film exist? | `look.py` motion note | A question, not a gate: answer it in NOTE.md |

### A. Cuts and transitions

| # | Check | Pass when | Where to look | Fix |
|---|---|---|---|---|
| A1 | Any opacity crossfade between scenes? | No frame shows two scenes blended. Allowed: one 1-frame 50% double exposure per film; a 4-frame flat-grey dip that carries an action; a feathered wipe (>= 0.3 of the axis) in the next ground | Contact sheet, every cut-1 and cut frame; grep source for scene-level `opacity` tweens | Replace with a hard cut on a frame where something is moving; add a carried object (A4) |
| A2 | Does each cut land mid-motion? | At cut-2 vs cut-1, at least one major object moves >= 0.01 W (or scales >= 3%, or is blurred) | The pre-cut frames side by side | Shorten the hold before the cut; start the exit acceleration 4-6 f earlier; add a lean-out (drift 2x in the last 2 f) |
| A3 | Does the first frame after a cut already move? | Frame cut and cut+1 differ by >= 0.02 W of displacement or are blurred | First two frames after each cut | Start the next scene's object 60-100 px into its travel; blur on frame 0-1 only if the film uses smear |
| A4 | Does beat N's last frame share an object or pose with beat N+1's first? | At least one of: an object within 0.03 of the same position, the same ground colour, the same text string, the same cursor | Last frame of N next to first frame of N+1 | Carry a caret, headline, card, dot or colour across; or relocate N+1's layout to the end layout of N |
| A5 | Any white flash or black dip between scenes? | No frame is flat white/black unless it is the CTA slam or a deliberate 1-frame black before a build | Contact sheet; luminance of cut frames | Replace with a growing object, a wipe, or a plateau sequence |
| A6 | Dead air at a cut | <= 3 empty frames (M916 uses 3); 0 when the scenes are matched | Frames cut-3..cut+3 | Overlap the entrance with the exit by ~2 f |
| A7 | Ground changes by fade? | Ground colour changes by one continuous colour track timed to something leaving (0.5-0.7 s) or by a hard plateau | Contact sheet colour drift | Re-time the ramp to the leaving object, or step it |

### B. Motion and stillness

| # | Check | Pass when | Where to look | Fix |
|---|---|---|---|---|
| B1 | Any frame where nothing moves for > 0.6 s (18 f) outside a payoff hold or a designed breath? | The still-stretch report shows no run > 18 f except a designed breath (0.6-1.5 s, stated reason, before a payoff, with one living thing on it); payoff holds (readable list, number) <= 1.0 s (hero 1.2 s); the resolved end card <= 1.4 s (gate G3) and has something alive | Still-stretch report | Add drift (1.1-1.5 px/f along one axis), a slow shrink (0.82 per 0.6 s), a scrubber/caret/shimmer, a ground drift; or cut the hold |
| B2 | Overshoot used more than once? | At most one visible spring per film (about +4-6%), at the payoff; elsewhere only small late `popOver` leans (motion.md R1.10) | grep source for `back`, `elastic`, `spring`, `overshoot`; watch scale curves | Replace others with a plain ease-out; keep the best one |
| B3 | Does every entrance decelerate and every exit accelerate? | Entrances do 60-72% of travel in the first 4-5 f; exits speed up over 6-10 f | Three consecutive frames of one entrance and one exit | Swap ease curves per role (M1; motion.md section 2.1); never reuse one global ease |
| B4 | Is the whole piece one easing family? | At least four distinct curve roles are present (entrance, exit, counter, drift, stepped) | grep the ease names | Re-assign per role; counters stepped per frame, typing stepped, drift `cruise` |
| B5 | Do all staggers use uniform gaps? | Gaps vary (e.g. 3,2,2,2,2,2) and the largest gap is before the key word | Onset list from the source | Hand-author the gap list; lengthen the gap before the stinger by 3-4 f |
| B6 | Blur/smear grammar consistent? | Either no smear anywhere or smear on entering/leaving frames 0-1 everywhere (not mixed by scene) | Contact sheet for blurred frames | Remove smear from the minority scenes or add it to all |
| B7 | More than one clock? | One step rate per moment (all stepped on 2s, or all smooth); drawn items may be 12 fps under a 24 fps camera by design | Consecutive-frame diff in drawn vs camera layers | Align the step rates |

### C. Type

| # | Check | Pass when | Where to look | Fix |
|---|---|---|---|---|
| C1 | Any bold weight outside the wordmark? | Computed weight <= 550 for body/headline; <= 650 on one headline word at most; wordmark <= 600 | grep `font-weight`; zoom on stroke thickness | Set to 400-550 and use scale/colour for hierarchy |
| C2 | Is headline type letter-typed (with any narrative reason)? | Headline words appear whole across consecutive frames; letters appear one at a time only inside the product's own input field. A justified exception is still a fail | 4-6 consecutive frames of each headline entrance | Replace with whole-word entrances 2-5 f apart; keep typing for the prompt field only |
| C3 | Any headline entrance by opacity fade alone? | Entrances use offset + blur clearing in 4-8 f, or a 1-frame hard cut | grep `opacity` on text; consecutive frames of one entrance | Add 0.03-0.24 H offset and 3-6 px blur; drop the opacity ramp |
| C4 | Is headline type 7% H or larger (UI prompt >= 4%, annotation >= 1.3%)? | Each headline >= 7% H (supporting phrase >= 5%); hero figures 22-29% H (thesis word 33%); UI text that must be read >= 4% H | Contact sheet at thumbnail size: can you read it? | Raise the size or crop the UI (ui-demo 1.1) |
| C5 | Word replacement re-centres? | Surviving words do not move when others leave | Frames around a phrase swap | Stop re-centring; vanish leading words 1 f apart |
| C6 | Is any word tracked at default 0? | Display tracking -1.5% to -5% em | grep `letter-spacing` | Tighten |
| C7 | Black text everywhere? | Charcoal for statements; pure black only on hero figure or wordmark | Colour sample on type | Re-ink |
| C8 | Does a key word do something? | The one or two words that matter act out their meaning (type.md section 0.1) and the copy sounds like the brand, with none of the copy tells (type.md section 0.3) | Read every line out loud; the sheet | Rewrite the line or give the word an action |

### D. Colour

| # | Check | Pass when | Where to look | Fix |
|---|---|---|---|---|
| D1 | More than one accent meaning? | At most one hue for "arriving/machine acting" plus at most one signal (green = done); no object carries both | Contact sheet: list every non-neutral hue and its job | Collapse to one hue; re-assign or remove the rest |
| D2 | Do tints persist on text? | Arrival tints decay to ink within 1-6 f at 24 fps / 6 f at 30 / 0.28 s at 60 | Frames 6-10 after a word lands | Tween the tint to ink |
| D3 | Glows, particles, gradient cards, stock shadows? | None except a halo at an event (peak ~35 px blur, decays within 0.3 s) and a faint (<= 12%) card shadow | Contact sheet | Flatten; keep one halo per event |
| D4 | Does dark/light change by fade or flash? | Hard cut at an act boundary, a growing object, or hard plateaus | Cut frames | Replace |

### E. Camera, density, UI

| # | Check | Pass when | Where to look | Fix |
|---|---|---|---|---|
| E1 | UI shown full-window with chrome? | No title bar, URL, traffic lights or bezel; the largest UI object occupies <= 0.76 W (and the readable one >= 0.55 W, gate G1); text in it >= 4% H or deliberately texture | Contact sheet; grep for window chrome elements | Crop to one object at 1.4-4.4x; hide the chrome; reveal by pull-back |
| E2 | More than 3 elements competing for attention? | <= 3 focal groups per frame (type counts as one; UI card as one; cursor as one); the rest are texture/defocused | Every thumbnail: count focal groups | Defocus (4-11 px), stagger, or delete one |
| E3 | Camera moved as a single group? | UI parts never zoom independently | Source: how many transforms scale; frames during a zoom | Reparent everything to one camera group |
| E4 | Backdrop UI blur | Backdrop blur <= 11 px behind a headline; headline sharp | Frames during rack focus | Reduce blur; darken ~0.1 instead |
| E5 | Frame 0 populated? | Frame 0 already contains the hook object or is moving | Frame 0 | Start in motion; remove blank intros |
| E6 | Static camera? | The camera or UI plane drifts on every non-payoff frame | Still-stretch report | Add a slow 0.5-1.5% scale creep |

### F. Cursor and click

| # | Check | Pass when | Where to look | Fix |
|---|---|---|---|---|
| F1 | Cursor clicks with a ripple? | No ring or circle expanding from the cursor (unless the film's single declared ring grammar, <= 14 f); target squashes 0.63-0.81 one frame after the cursor minimum (0.71-0.9) | The 8 frames around each press | Delete the ring; add target squash, hard colour step, bar dip, or sheen |
| F2 | Cursor entry | Enters oversized (1.5-5x) and scales about the tip; ~60% of travel in frame 1; 0.5-0.9 s total | First 6 frames of each entry | Rebuild entry curve |
| F3 | Path straight or constant speed? | Path curves with a heading change; speed varies (asymptotic decay, 2-frame steps) | Overlay 5 frames of tip positions | Add a bezier, rotate heading, decay steps x0.72 |
| F4 | Arrival and press on the same frame? | A park of 2-15 f precedes the press; any camera zoom has finished | Frames before the press | Insert a park; finish the zoom |
| F5 | Cursor family inconsistent? | One cursor family; arrow-only or pose-swap, not both | Contact sheet | Pick one |
| F6 | Cursor on the UI layer? | Cursor on its own top layer; scale decoupled from the UI zoom | Source structure | Move layer |
| F7 | Typing metronomic or blinking caret while typing? | Pauses after spaces; skipped intermediate states; solid caret during typing; rate matched to the task (21-24 chars/s readable, ~85 chars/s burst) | 10 consecutive frames of typing; source for `setInterval`-like regular steps | Author the cadence by hand; make the caret solid |

### Cn. Counters and numbers

| # | Check | Pass when | Where to look | Fix |
|---|---|---|---|---|
| Cn1 | Count-up eased? | One value per frame, step sizes shrinking toward the end, values skipped, product fields end un-round, claims end round; no linear tween between integers | 8 consecutive frames of the number | Replace with a hand list of 15-23 values |
| Cn2 | Number static at the end? | Hold <= 1.2 s (single number 0.5-1.2 s) then the number dissolves/whips | Still-stretch report | Shorten or add edge-defocus |

### H. Logos and endings

| # | Check | Pass when | Where to look | Fix |
|---|---|---|---|---|
| H1 | Logo fades in or grows from zero? | First visible logo frame is full opacity and either >= 1.5x its rest size shrinking, or built from parts; no scale from 0, no opacity ramp | First 6 frames of the logo | Rebuild as shrink-in, stem build, or a hard cut to a slam |
| H2 | Ending fades to black? | Last frame has content, not black, and is still moving; the last 6 f accelerate | Last 10 frames; luminance trace | Remove the fade; add an accelerating contraction |
| H3 | Final hold frozen or long? | Anything held > 0.6 s has a living element; the resolved end hold is <= 1.4 s (gate G3) | Still-stretch report, `look.py` end hold | Cut the hold; add sway, shimmer, drift |
| H4 | Is the click shown resolving? | Film ends at maximum compression or before the release | Last 10 frames | Trim; cut at the biggest step |
| H5 | Tagline under the logo? | No tagline unless it is the sentence the film is about | Last frame | Remove |

### I. Rhythm

| # | Check | Pass when | Where to look | Fix |
|---|---|---|---|---|
| I1 | Equal beat lengths? | Beat lengths vary; the last one lingers | Contact sheet cut times | Shorten the middle; extend the last |
| I2 | Reading time too short? | A phrase of ~20 characters is on screen >= 1.2 s in total (assembly plus a hold of at least 0.45 s); a 2-word phrase >= 0.5 s | Frame counts between assembly and exit | Extend the hold or cut the copy |
| I3 | Too many events per second? | A new element every >= 0.3 s on average; a major event at most every ~0.8 s | Onset list | Remove events or space them |

### J. Sound

| # | Check | Pass when | Where to look | Fix |
|---|---|---|---|---|
| J1 | Does the score cover the whole cut? | `look.py` audio audit shows no silent tail; the music resolves on the last grid unit | Audio audit (integrated LUFS, true peak, silent tail, hit count) | Re-fit the score to the final length (`voice.py music-fit --duration`) |
| J2 | Is the first big sound or silence tied to something visible? | One named visible event (a click, a lift, the name) | Storyboard sound column vs the frame | Move the sound to the event, or the event to the sound |
| J3 | Is there a hit on every cut? | One to three hand-picked hits; sections shaped around the edit; the music pulled down while the viewer reads and cleared before the biggest move | Audio audit hit list vs the cuts | Remove hits; shape sections (sound-sync.md section 6a) |

---

## Part 3. The six fixes that matter most

The six gates (Part 2, section 0) come first: the render exists, the proof is big enough to read, no empty frame, end card 0.6-1.4 s and CTA <= 25 %, one object per frame, no page chrome. Then, ordered by judged impact on the feel (practice, not measured), do these in order.

**0. Remove the page.** No chrome, no counters, no left headline block, no kicker, no flat swatch as the picture, no pinned dock, no stat slide, no footer ending. This is what the user rejected hardest and it is not in the motion data; the corpus films have none of it (see Never ship). Run `scripts/lint.mjs` (gate G5), then look at the outer 12% of every sheet frame by eye.

**1. Replace every fade and crossfade with a hard cut on a moving frame, with a carried object, unless a Part 1b condition holds.** Every film in the study cuts hard (fades appear only on single objects: the last phrase to black, one line of a headline; calm brands and meaningful dissolves are the exceptions). Make the last frame of beat N and the first of beat N+1 share a position, a string, a ground, a caret or a card, and make both frames mid-motion (object displaced, scaled, or blurred). Check A1-A4. (M914-M974)

**2. Give each role its own curve, and stop overshooting.** One global ease is the loudest AI signature. Entrances do 60-72% of travel in the first 4-5 f then a 0.4-0.6 s tail; exits accelerate over 6-13 f (`accelExit`); counters step per frame; typing is stepped; drift is linear (`cruise`); one visible spring per film (+4-6%). Camera moves are a one-frame snap plus a tail, not one tween. Check B2-B4, E3. (M913, M914, M929, M920, M948)

**3. Kill every dead frame, and end in motion or on a designed stillness.** A hold is only allowed after a payoff and only 0.5-1.0 s (the resolved end card 0.6-1.4 s, gate G3), or as a designed breath of 0.6-1.5 s with a stated reason; everywhere else add drift, shrink, shimmer, scrubber creep. The film never fades to black by default: the last 0.2 s accelerates (or a calm brand settles by Part 1b) and the last frame is visible. Check B1, H2, H3, E6. (M913, M916, M932, M936, M944)

**4. Make type behave like a director set it.** Words arrive whole on the speech rhythm (3-5 f gaps, a longer gap before the stinger), from an offset with blur clearing, not by opacity and not letter by letter; the brand's own face at regular weight (400-550) with tight tracking; hierarchy by scale (7-11% H headlines, 22-29% H figures) not bold; the key word acts out its meaning; survivors never re-centre; highlights are hard-cut boxes or a hand-drawn loop. Check C1-C8, A5. (M921, M929, M930, M936, M964, M967)

**5. Spend colour and effects once, and show UI as a fragment with identity and a believable pointer.** One hue for "arriving/acting", one signal for "done", no glow as wallpaper; UI cropped to one object under one camera group, built from the capture's real screen, backdrop blur 4-11 px, a custom oversized cursor that parks then presses, the target squashes 0.63-0.81 one frame later, no ripple. Check D1-D3, E1-E2, F1-F7, W3. (M913, M914, M919, M931, M956, M959)
