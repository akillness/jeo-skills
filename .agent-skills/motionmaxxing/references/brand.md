# Brand: turning a website into a film system

See also: idea.md (the inventory below feeds the idea; PAGE; cover-the-logo), judgment.md (what good is), world.md (grounds, light, surfaces), director.md (film system and storyboard), layout.md (type sizes, lockups, page chrome), type.md (weights, copy voice and number rules), close.md (logo reveals), tools.md (`scripts/fetch_logo.mjs` for official marks).

`node scripts/brand.mjs <url> [outDir]` captures a site into `brand.json`, `BRAND.md`, `board.png`, `logo/`, `fonts/`, `screens/` and `media/`. Capture is not design. This file is how to DECIDE from those files: what becomes ground, ink and accent; which type; whether to use the site's real UI or rebuild it; what the carrier object is; which copy lines survive. The output is a **film system**: a short list of fixed decisions every beat then obeys (see director.md section 4). IDs such as (M913) are reference moments from the study corpus, cited as evidence only.

Rules are written WHEN situation, DO decision with numbers, *because* what it buys. Positions are frame fractions, type is % of frame height H, widths % of W, time in frames at 30 fps with seconds in brackets.

Use only the brand the user supplied. Never carry a reference film's names, colours or logos into a new film.

---

## 0. Order of work

1. Open `BRAND.md` and **look at** `board.png` (palette, type, logo on one sheet). Read the hero headline, subhead, button labels and stats in `BRAND.md`.
1b. **Fill the inventory (section 0.5).** What does this brand already own? It is the source of the idea (idea.md); do it before system decisions, because the idea decides what the ground, carrier and type are *for*.
2. Decide ground / ink / accent and the accent's meaning (section 1).
3. Decide type (section 2).
4. Decide UI strategy per beat: real fragment, rebuilt UI, or type-only (section 3).
5. Decide the carrier object from `logo/` and the product (section 4).
6. Pull and compress copy (section 5).
7. Fill the checklist (section 8), then go to director.md for the storyboard.

**Verify the guesses.** `brand.json` ink and accent are heuristics. Look at `board.png` before you trust them: the headline ink (what the H1 is actually set in) is usually not the body-copy grey the capture reports as `ink`; the accent should be a colour you can SEE on the primary button or in the product imagery (a status dot, a chart), not the most frequent saturated pixel (links, borders, a cookie banner). Sample it from `screens/` and write the hex you chose, and where it came from, in the storyboard header.

If a capture field is missing or looks wrong (a gradient reported as one colour, a font that failed to download), say so in the storyboard and choose by hand; do not guess silently.

---

## 0.5 Inventory: what does this brand own?

Before you have an idea, list what is already there. The idea is usually hiding in this table, and it feeds `references/idea.md` (write the first idea, then at least two of different kinds, then cover the logo). Fill every row from `BRAND.md`, `board.png`, `screens/` and `media/`; write "none" rather than guessing.

| Row | Ask | Fill from |
|---|---|---|
| **Logo shape** | What product object or gesture does it resemble? (a pill is a toggle; a ring is a progress loop; three bars are sound.) Could it *become* that? | `logo/` |
| **Core control** | What is the one thing a user touches: a play button, a search bar, a slider, a send arrow, a toggle, the cursor in a text field? | `screens/`, hero section |
| **Signature material** | What does the product's screen fill with: gradients, listings, maps, code, photos, receipts, waveforms, paper? | `screens/`, `media/` |
| **Key verb** | What does the product *do*: split, play, find, ship, verify, mix, track, capture? Can motion perform that verb? | H1, buttons |
| **Success moment** | What is on screen when it works: the ride arriving, the payment landing, the tests going green, a scattered thought becoming a page? | docs, changelog, product shots |
| **Voice** | Read the site's H1s and buttons out loud. Deadpan, warm, cocky, technical? Your copy and your timing should sound like that. | `BRAND.md` copy |
| **Colour logic** | Which colour means "on", "yours", "new", "error"? Colour in the film keeps those meanings. | `screens/`, primary button |
| **Type** | Geometric, grotesk, humanist, serif? Big tight display or small careful UI? Their type sets your rhythm. | `fonts/` |
| **What they would never do** | A calm brand does not glitch; a playful one does not do black-tie chrome. Respect the edges. | tone of the whole site |

How to use it:
- In every film that worked, the best moment was where the brand's own shape or control turned into the product's action (a pill-shaped icon that was the same shape as the product's toggle, so the logo *became* the switch). Look for that one.
- A pun on the name is the weakest form of ownership. The brand's material, behaviour and voice are the strongest.
- **Keep literal** the logo (never redraw it), the typeface, the colour values and their meanings, the real UI and the real copy. **Invent** the stage, the camera, the light, the metaphor, the choreography, the sound. Keep the invention on-brand by drawing it in the brand's grammar: its corner radius, stroke weight, type and pace.
- **Give the logo a job** (the button, the toggle, the cursor, a word in the sentence) rather than a sticker at the end.
- **Use what was captured.** `media/` and `screens/` hold the brand's real photos, signature graphic and product screens. A test film took the hex codes and fonts and ignored all nine captured files, then built generic cards; the user's verdict on thin films was "it should use the animations, the fonts, the logos". Use the capture as the picture (section 3).

---

## 1. Colour: ground, ink, accent

The corpus never uses more than one saturated hue per film plus, at most, one semantic signal colour. Everything else is neutral (M913-M974).

**WHEN** choosing the film's **main ground** **DO** follow the site's own dominant theme: a near-white (#FDFDFD, #F7F7F7, #ECEEEB, warm paper #F8F5EF) for light sites, or a near-black (#000, #110F14, #120F13, warm brown #1E1212) for dark ones; never flat mid-grey. A dark ground may be a diagonal charcoal gradient from near-black to #242B2E (M916-M920) **because** a single theme makes the cut-in product fragments belong to the film, and a gradient keeps a dark ground from reading as dead black.

**WHEN** the capture contains photography, a signature graphic or product screens (look in `media/` and `screens/`) **DO** build every ground of the film from them at least once (crop, blur, tint, push in), and use a flat hex only for a flood or a dive of under 1 s **because** a hex-only film is a deck of swatches (the user's verdict: "too sparse, richer surfaces"). Write the source file of each act's ground in the storyboard header (director.md section 4 item 8).

**WHEN** the film has several acts **DO** alternate the ground by act, flipping only at a hard cut or with a growing object: light, dark, light (M921-M924); dark bookends around a light middle (M930-M932); light "user data" world, brand-colour claim ground, near-black sign-off (M925-M929) **because** the flip marks act boundaries without a word of copy. A "ground" here is a surface (plate, screen, material, lit gradient), not a swatch. Use the brand's primary or a pale tint of it as a *claim ground* (a 0.3-0.7 s ramp between a light world and the brand colour, M926) when the brand colour is too pale to carry text as an accent.

**WHEN** choosing **ink** **DO** use a warm or cool charcoal in the ground's hue family (#383837 on #FDFDFD, #575756 or #5D5E5C on near-white) for statements, and keep pure black only for the one hero figure or the wordmark (M936-M938, M947-M949). On dark, use white or an off-white (#FAF9F6), with secondary text at #808086 to #A6A09E **because** charcoal is less harsh at headline size (7-11% H) and the black figure becomes the loudest thing without being bolder.

**WHEN** choosing the **single accent** **DO** pick the one saturated hue that is already most associated with the brand: the colour of the site's primary button, link or logo. If several compete, take the button. If the site is monochrome, derive one hue from the logo or choose a calm one (lavender #BCAEF5, indigo #6259EC, coral, teal #4D8296; M914, M922, M933, M936) **because** the accent will stand for something specific, so it should be recognisable as the brand. If the brand colour is pale (under about 3:1 against the ground; *practice, not from the corpus*), use it as a ground wash or halo (M947 washes, M925) and take a darker tint of the same hue as the accent.

**WHEN** assigning the accent a **meaning** **DO** choose exactly one and write it in the storyboard header:

| Meaning | Spent on | Never on | Evidence |
|---|---|---|---|
| "the AI is acting" | typing text, caret, scan band, shimmer sweep, halo (no click rings, ui-demo.md 3.4) | static labels, decoration | M913, M914, M916-M920 |
| "this is arriving" | a new word's first 6 f to 0.3 s, decaying to ink; one-time colour flash per word | words at rest | M966, M967, M973, M974 |
| "ON" / "result" (two hues) | switch ON state / authorised badges | anything else | M933-M935 |
| "the argument noun" | the one word per line that carries the claim | whole lines | M936-M938 |
| "event" | the drag, drop, one highlighted word | ambient elements | M930-M932 |
| "brand only" | the brand's own number, mark, link; every other logo grey or black | third-party marks | M945-M946 |

**WHEN** the film needs a second signal colour **DO** add one semantic hue only, usually green: "done" (M916-M920) or "gain" (M921-M924), never on the same object as the accent at the same moment **because** hue becomes meaning, and two meanings in one hue make both unreadable.

**WHEN** drawing UI surfaces **DO** keep them neutral and separate from the accent: on black, panels #141414 / #171717 / #202020-#232323 with a 1-1.5 px border #262627-#292929; on light, white or #F8F8F8 with a 1 px hairline #D6D6D6 and no heavy shadow (M913, M914, M931, M945) **because** a neutral product surface makes the one hue read as the machine's act.

**WHEN** a hue must also work at text size **DO** check contrast of ink on ground (target at least 4.5:1) and accent on ground for words at 7-11% H (target at least 3:1) (*practice, not from the corpus*).

---

## 2. Type

**WHEN** choosing type **DO** follow the brand's own type: the heading and text faces its site actually loads (`fonts/`), whatever their class (grotesk, humanist, serif). Only when the brand has no face of its own use one neo-grotesk, which is the measured default (the corpus is all Inter-class). Keep the corpus's discipline either way: one family, weights 400-650 (400 for statements and UI, 450-550 for hero words and numerals, 600 on the wordmark only, 650 on one word, pill or UI label), no bold display faces, sentence case or lowercase, no tracked-caps labels (layout.md section 0), tracking -1.5 to -5% em at display sizes and normal at small sizes (M913-M974: weights 400-650; display tracking -1 to -6 px at 82-154 px) **because** scale gives hierarchy without bold, bold type is the template tell, and a brand's own face is the cheapest way for a film to look like the brand.

**WHEN** the site's own font is in `fonts/` **DO** use it for the film's text and headlines. If the site pairs a decorative display, rounded or script face with a plainer text face, keep the decorative one for the wordmark or one hero word and set everything else in the brand's text face **because** a quirky face over a whole film becomes the subject (*practice, not from the corpus*).

**WHEN** the brand's heading face is a serif **DO** use it as the film's headline voice in that role everywhere (every claim line), with the product UI in the brand's UI face **because** the serif is the brand speaking, not an accent. **WHEN** the brand is a sans brand and you want a serif **DO** treat it as a deliberate second voice for one emotional claim line per film against the sans UI (M933-M935 headline at 0.065 H settled) **because** one contrast of voice reads as editorial, more reads as noise; one serif-italic accent word inside a sans line is a habit, not a decision (slop.md N12).

**WHEN** sizing type **DO** use the role scale (director.md section 4, layout.md section 4): headline 7-11% H (supporting phrase 5-7%); act-two word 16% H; hero figure 22-29% H (opening thesis word 33%); wordmark 9-14% H; UI prompt 4-5% H; menu or card text 2.2-4% H; unreadable texture text 1.3-1.9% H (M921-M974).

**WHEN** a mark exists as a file **DO** use `logo/` for the mark and the wordmark; retype the name only when the film morphs it glyph by glyph (M968 typed on, M973 flipped glyph by glyph) **because** a retyped logo is almost always slightly wrong and is read as a fake (*practice, not from the corpus*).

---

## 3. The site's real UI, a rebuilt UI, or type only

No reference moment shows a browser frame, URL bar, window chrome, device bezel or a full-page screenshot. The "recording" is always a floating surface (card, modal, rail, input bar) on the film's ground, shown as a **magnified fragment** (M913-M974).

| Situation | Decision | Why |
|---|---|---|
| A `screens/` image has a distinctive, legible fragment (a card, a control, a chart, a prompt bar) that nothing needs to animate inside | **Crop it.** Mask to a rounded rectangle (radius 0.02-0.06 W), scale to 1.4-4.4x so the target is at least 5% H, drop the rest, keep it on its own layer under the camera | The viewer reads one thing at a time; the pull-back is the "it was inside a real product" beat (M913 3.3x, M914 1.6x, M916 1.5x, M917 1.675x, M918 1.42x, M919 4.39x, M931 2x, M943 2.33x) |
| The element must be read **and** change (typed text, switches, counters, a list that grows, a chip that turns on) | **Rebuild it in HTML/CSS** from brand tokens: radius, border, surface greys, font, accent. Match proportions from the screenshot and carry the product's identity (see "Real UI with identity" below) | Real pixels cannot be animated state by state; rebuilt UI can be typed into, toggled, counted (M913, M923, M933, M935) |
| The UI is dense and meant as volume, not content | **Real or imitation texture** at 9-14 px (1.3-1.9% H), unreadable on purpose, with one landmark shape about 0.49 H tall | Shapes keep rhythm when words cannot (M939, M913 editor labels) |
| The brand is not a product (services, consumer, no usable UI), or the film is under about 8 s | **Type only plus one object**: a word build, a dot or ring, a lattice (*duration threshold is practice, not from the corpus*) | Kinetic type and one carrier object carry whole films (M921, M929, M936-M938, M947, M962, M964, M967) |
| The site is a gallery, store or media product | **Media inside cards**: real videos and photos from `media/`, playing for the whole beat | Moving thumbnails read as outputs; static thumbnails read as slides (M917, M919, M930, M941) |

**WHEN** you build any UI the viewer will see **DO** give it the identity of the real product: the real icon and app name, a real sender, a real time stamp, a real sentence in the product's voice, real density (the number of rows, the real toolbar), the real corner radius and type, and a surface that contrasts with its ground. Real chrome for what it is (a status bar and tab bar on a phone UI) is fine; *browser* chrome is not. Make it readable by moving the camera in, not by inflating the UI's type (an inflated UI turns a product into a slide). **Vibe-coded UI** is what you get without this: a generic white rounded card with a toolbar of three circles and a send arrow; a dark card saying "Good morning" with a status dot and "label - value"; skeleton grey bars; zinc greys with an indigo accent; a calendar grid or tweet card with invented names. It is the cheapest signal of "a product" and the user has rejected it by name (slop.md N5).

**WHEN** the capture has photography, product screens or a signature graphic **DO** use them *as the picture*: crop a real screen to the fragment that matters, use a real photo as a ground or as the output cards' content, use the signature graphic as the world, with the product's real words **because** the capture is the cheapest source of a believable, specific, on-brand frame, and invented stand-ins (names, numbers, UI labels that appear nowhere in `BRAND.md` or the brief) are invented proof: declare any you keep in NOTE.md.

**WHEN** a phone or device is the hero **DO** crop it: top corners off-frame, bottom at y about 0.97, screen about 0.39 W, one perspective plane for the UI inside; otherwise show only a rim line 2-4 px (M922, M955) **because** a cropped, rim-lit device reads as a thing you could hold, and a full flat bezel reads as a mock-up.

**WHEN** deciding what to leave out **DO** omit navigation bars, footers, cookie banners, URL bars, scrollbars, window controls and any text the viewer is not meant to read **because** every extra element competes with the one target (M913-M974). Apply the same list to the film itself: no header strip, footer, corner brand label, counter or metadata (layout.md section 0, gate G5).

**WHEN** an image from `screens/` shows through the film **DO** blur secondary panels to 4-15 px and keep the hero panel sharp; never blur the type that sits over them (M918 backdrop 11 px peak, M953, M956) **because** focus tells the eye which panel is live.

---

## 4. The hero / carrier object (optional)

A carrier is one film shape's tool (a chain of handoffs), not a requirement. If the film is a held shot, a typographic essay or a documentary of one task, it has none. If you use one, choose an object that rides across cuts and **changes position, scale or role at every seam**, never pinned (director.md section 4 item 6 and section 5). Decide it from `logo/` and the product, in this order:

| If the brand has ... | Carrier / hero | Treatment | Evidence |
|---|---|---|---|
| A mark made of repeated simple parts (dots, bars, stems, petals) | The parts themselves | As a loader or ring before the name (ring pops to 3x for one frame then contracts, M926); build the lockup by adding one part per frame or per 2 frames (M938 bar mark, M932 stems turning black one per 2 f); petals swing into a closing shape (M968) | M926, M932, M938, M968 |
| A mark with one distinctive feature (an underscore, a chevron, a flame) | The feature | Zoom the camera from frame 0 into the feature at about x1.5-2 per 2 f until it is a full-frame mass, then fade the mass in place (3 f) and open the product; or resolve the flame inside its own silhouette from dots (M946) | M974, M946 |
| A bare wordmark | A dot or a caret in the accent | One dot (3.1% H) rides the end of a typed line and steps through states (M962); a tall thin caret hands one beat to the next (M948 to M949) | M962-M963, M948-M949 |
| One hero control in the product (slider, toggle, prompt bar, card) | That control | The control's pocket is the stage: a slider narrows to a caret (M923); a card is the container across the cut (M930-M931) | M913, M923, M924, M930, M931 |
| An existing mascot or avatar | One instance only | Marks the agent's position in the job: sweeps in, drops, shrinks about a fixed centre (M916-M920) | M916-M920 |
| A product visual that is a disc, orb or swatch | The disc | Docks into UI slots each beat; swings 6x in scale (M942-M944) | M942-M944 |

**WHEN** the carrier is a dot or caret **DO** keep it small (0.02-0.03 H dot, 0.008 W caret) and the one thing that never disappears **because** the viewer follows the one moving thing and the cut stays invisible.

**WHEN** the carrier is a dot that becomes the logo's dot, full stop or "o", or the lockup is built out of the carrier's motif, **DO** stop and ask whether that is *this brand's idea* **because** it is the signature of one over-used generation of films (the "dot becomes the logo" and "lockup from the motif" pattern showed up in most of a test set of 21 directions). It is legitimate only when the brand's own shape really is that. Otherwise the logo arrives by cause (a click, a result, a camera move).

**WHEN** the film ends on the logo **DO** pick the reveal from the logo type (director.md covers timing):

| Logo | Reveal | Evidence |
|---|---|---|
| Bold wordmark on dark | Crash-in from 3.5-3.75x with 64-96 stacked scaled copies as radial streaks, 86-95% of the drop in 6 f, then a slow creep; ends mid-contraction | M929, M932 |
| Simple icon on flat white | Hard cut to white; icon starts 1.5-1.9x and settles over 2.5 s exponentially; no tagline, no fade | M959 |
| Wordmark plus flame/emblem | Pixel-resolve left to right with a solid front, then a living hold with sway of +/-1% W | M946 |
| Wordmark built from the voice | Typed, or a per-glyph flip from the previous name at fixed left anchor | M968, M973 |
| Mark plus name from parts | Bars one per frame; letters one per frame with tracking collapsing from +20 px to -3 px | M938 |

---

## 5. Pulling copy from the site

**WHEN** writing on-screen claims **DO** compress the hero headline, subhead and feature titles into phrases of 2-6 words, at most two phrases per beat, verb plus noun, sentence case; never a sentence over about 7 words on screen (M921 3 words, M929 4 + 2, M936 5, M964 3 + 4, M920 5 + 4, M967 4 + 3) **because** at headline size (7-11% H) the viewer reads a 4-word phrase in about 1.2 s (36 f); more breaks the beat.

**WHEN** the site offers real numbers **DO** use them as hero figures at 22-29% H and let the claim end on a round value while product data fields end on specific un-round ones (100.00 vs 522.14; 10% vs 119) (M954, M955, M958) **because** round values state, specific values prove.

**WHEN** a beat shows a typed request **DO** take a real product sentence from the site: an example prompt, placeholder text, a use case, a testimonial's ask, in the *user's* words, 20-70 characters (M949 38, M914 68, M919 67, M935 21, M928 about 35, M956 about 70) **because** watching a real sentence typed into a familiar field turns the abstract product into "this is me asking". Placeholder text from the site's input field is the best source (M914, M948).

**WHEN** a status or checklist line is needed **DO** write a concrete verb plus a number or object ("verb-ing + 12 things"), three at a time, each different (M913) **because** vague status lines read as filler.

**WHEN** a voice line exists **DO** write it from the same source but let it run ahead of the type: on-screen text carries only the next fragment (sound-sync.md).

**WHEN** writing any copy that is not lifted from the site **DO** write the way the brand speaks (the voice row of the inventory), then cut half. Use the brand's own official line verbatim when it exists: it beat stock launch copy in the user's earlier tests. Copy voice, tells to avoid and meaning-on-the-word are in type.md section 0.

**WHEN** checking copy **DO** proofread every line and every brand name against the site, and correct typos, even though some corpus recreations preserve misspellings from their sources *because* those were fidelity choices for copies, not a style to adopt.

Selection procedure: list the site's H1, H2s, button labels, input placeholders, stat numbers and meta description; mark the one claim per beat; trim to the 2-6 word form; keep the longer original as the VO line.

---

## 6. When there is no URL

**WHEN** the user supplies only a name or an idea **DO** design a minimal system on purpose, from the same decisions:

| Decision | Default | Evidence |
|---|---|---|
| Ground | #FDFDFD (light) or #110F14 (dark) as the base, made into a surface (a lit gradient with a source, a material, a plate) per world.md; flip once at the turn | M930-M932, M962-M963 |
| Ink | #383837 on light; #FAF9F6 on dark; muted #A3A3A3; hairline #D6D6D6 | M936-M938, M963, M945 |
| Type | one neo-grotesk, 400 statements, 500 numbers, 600 wordmark only | M913-M974 |
| Accent | one hue with one meaning (default: "arriving" or "AI acting") | M913, M967, M973 |
| Surfaces | #171717 / #232323 on dark with 1 px #292929; white with #D6D6D6 on light | M913, M931 |
| Carrier | optional: a dot (0.026 H) or a tall thin caret, only if the film is a chain of handoffs | M962, M948 |
| Mark | 3-6 identical simple parts (dots, bars, stems) assembled one per frame, plus a typed name: one option among several, and a house style if used every time (slop.md Part 0) | M926, M932, M938 |
| UI | one rebuilt prompt bar (0.58-0.71 W x 0.13-0.29 H, radius 0.04-0.2 of height) and type-only beats | M914, M919, M969 |
| Copy | invent claims only from what the user told you; label anything invented in the storyboard | (practice) |

**WHEN** a brand name is missing **DO** ask once; if not available, use the concept's own noun as a placeholder wordmark and flag it **because** a made-up brand is a risk the user did not ask for (*practice, not from the corpus*).

---

## 7. Cases the capture can get wrong (practice fixes)

| Symptom | Fix |
|---|---|
| `brand.json` ink is the body grey, or the accent is a link/border colour | Look at `board.png` and `screens/`: take the headline ink from the H1 itself and the accent from the primary button or product imagery; record where each came from |
| `board.png` palette is all greys, accent unclear | Take the colour of the primary button from `screens/`; sample it, do not guess |
| Font did not download | Pick the nearest neo-grotesk, note the substitution in the header |
| Logo is a raster with a white box | Run `scripts/fetch_logo.mjs "<brand name>" <domain>` for the official SVG; otherwise set the name in type or ask the user for the asset. Never redraw the mark and never ship a boxed logo |
| `screens/` are cookie-banner or login pages | Rebuild the UI fragment instead (section 3) |
| Site is dark but screenshots are light | Choose one ground for the film and flip at the turn; do not mix grounds inside a beat |
| Brand colour is a gradient | Use its mid colour as the accent; keep the gradient only inside glyphs or one wash (M947, M929 icon) |

---

## 8. Brand to film system checklist

Fill every line before the storyboard (director.md section 7).

- [ ] Brand name, spelling verified against the site.
- [ ] Inventory table (section 0.5) filled; the idea (idea.md) states which row it came from.
- [ ] Main ground hex, theme (light/dark), the act where it flips, and the **capture file each act's ground is built from** (a surface, not a swatch).
- [ ] Ink hex (charcoal or off-white), and where pure black or pure white is spent (one figure or the wordmark).
- [ ] Neutral surface greys and border hex for UI.
- [ ] Single accent hex, **its one meaning**, and the one element per scene it may colour.
- [ ] Second signal colour (done or gain) if used, and its meaning.
- [ ] Type family, three weights, tracking at display sizes, role scale in % H.
- [ ] Serif: the brand's own heading face (use it as the headline voice), or a deliberate second voice (which single sentence).
- [ ] UI strategy per beat: cropped real / rebuilt / type only; the magnification (x) for each crop; identity of rebuilt UI (real icon, sender, time, sentence), no vibe-coded cards.
- [ ] Captured photos, screens and signature graphic: which ones the film uses (all unused is a FAIL of the capture).
- [ ] Carrier object (optional) chosen from the logo or product, its first and last state, and how it moves, scales or changes role at every seam.
- [ ] Logo reveal method matched to the logo type; lockup size and hold.
- [ ] 1 claim per beat, each 2-6 words; hero figures with real numbers.
- [ ] Typed prompt sentence(s), 20-70 characters, from the site.
- [ ] Media assets chosen from `media/` (playing video, not stills, for output cards).
- [ ] Anything invented or substituted is written down in the storyboard header.

---

## Slop tells for this topic

| An AI default would | The designer does |
|---|---|
| Paste the full-page screenshot in a browser frame and scroll it | Crop one object at 1.4-4.4x, rebuild the elements that must change, drop all chrome |
| Use every brand colour, plus gradients and glows | One ground family, charcoal ink, one accent with one meaning, one optional signal colour, flat shapes |
| Set everything in the site's quirky display font, in bold | The brand's own text face at 400-550 (a serif if that is the brand's heading face); a decorative display face on one role at most; neo-grotesk only when the brand has none |
| Pure #000 text on pure white, everywhere | Charcoal ink; black only on the hero figure or wordmark |
| Take the site's paragraphs as on-screen text | 2-6 word claims; the paragraph becomes the VO or disappears |
| Type "Lorem ipsum" or a generic "Write a prompt" | A real product sentence of 20-70 characters from the site |
| Fade the logo up at the end and hold it still | Reveal chosen by logo type (parts, feature dive, crash-in, pixel-resolve), ending mid-motion or alive |
| Retype the brand name in a similar font | Use the supplied vector mark; retype only for a glyph-by-glyph morph |
| Make a mascot or a 3D hero because the film feels empty | Use the one carrier the brand already has (logo part, control, dot), or none; build the world instead (world.md) |
| Take hex codes and fonts from the capture and ignore its photos, screens and signature graphic | Build grounds and proof from the captured media; hex-only films are decks of swatches |
| Rebuild the product as a generic rounded card with invented names | Rebuild with the real icon, sender, time and sentence, at real density, magnified by the camera |
| Start ideation from the name's dictionary meaning | Fill the inventory table, then find the idea in the logo's shape, the core control, the key verb or the success moment |
| Always end with the carrier dot becoming the logo's dot | The logo arrives by cause; the dot-to-logo move only when it is this brand's idea |
| Invent a brand system with six colours when no URL is given | A minimal system: one ground, one ink, one accent, one carrier, one mark from identical parts |
