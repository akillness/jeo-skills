# layout.md: where things go

See also: type.md (word entry and timing; meaning on the word), motion.md (eases, camera), ui-demo.md (cursor and UI behaviour), close.md (lockup builds and holds), director.md (film system, film shapes), world.md (what the ground, light and depth are made of), brand.md (using the capture's real screens and photos), slop.md (Part 0 on the plan; patterns N1-N25), tools.md (`scripts/lint.mjs`, gate G5).

Placement rules for a motion-graphics film, measured from 53 short launch/explainer moments (IDs M913-M974). Use it to put every element on the frame without guessing: anchor, extent, size, how many things share the frame, what overlaps what.

Conventions. Frame = 1.0 x 1.0, origin top-left, x right, y down. W = frame width, H = frame height. Type sizes are **em (font-size) as % of H** unless marked "ink". Ink height (ascender to descender) is about 0.75 em (M921: 66 px em = 9.2% H, ink 7% H). Time as `s (f@30)`. Rule format: **WHEN** situation -> **DO** decision -- *because* effect (evidence IDs). Items marked PRACTICE are not evidenced in the source films; they are extrapolations.

---

## 0. Page chrome is never part of the film (gate G5)

A film is not a web page, a slide or a design-tool screenshot. Anything that makes the frame look like a page layout (labels, counters, headers, footers, kickers, brand strips) is page chrome. It comes from the renderer's house style and from the urge to look designed; viewers read it as a template, and this user rejects it hardest. The only text on screen is the claim, the product's own UI words (inside the UI fragment), and the logo once. Nothing is "justified": delete the element.

**Detectable patterns** (each one is a FAIL; `scripts/lint.mjs <index.html>` finds them on rendered DOM, see tools.md; you find the rest on the contact sheet):

| Pattern | What it looks like | Typical origin |
|---|---|---|
| Corner or edge label | small text in the outer 12% band (x < 0.2 or > 0.8, y < 0.14 or > 0.86) that repeats across frames | brand name, film title, scene name pinned to a corner |
| Tracked-caps brand label | uppercase text with positive letter-spacing at small size ("BRAND NAME", "A NEW MODEL FROM...") | "editorial" look |
| Chapter counter | "02 / SPEAK", "01 - THE WAIT", "Step 2", "Chapter 3", "Act II" | numbered chapters read literally |
| Timecode / metadata | "T+01.6s", "BAR 1/8", "120 BPM", "30 FPS", "1920x1080", version numbers, (c) | the look of an editing tool |
| Header or footer bar | a strip across the top or bottom holding a logo, nav, a price, a URL | landing-page habit |
| Kicker above a headline | a small line (often tracked caps) directly over a larger headline | eyebrow text |
| Progress bar or hairline | a thin line that fills or sits above a label | deck/player chrome |
| Corner brackets / crop marks | L-shaped marks in the four corners | "HUD" decoration |
| Scene label chip | "Messages", "Mail", "Editor" above a shot to name it | looks informative; the UI should show what it is |
| Deck layout | a left-aligned headline block at x < 0.2 (with or without a sub-line) beside right-side media; title-then-content | web and keynote priors |
| Pinned element | a pill, dock or caption at identical coordinates through 3+ shots | "recurring carrier" taken literally (slop.md N8) |

**The pro alternatives, stated:**
- A statement is **one centred line** at y 0.52-0.54 paced to speech (R1.1), or a **split phrase** whose far half becomes an object (section 2), on screen briefly, handing off to something already moving.
- Identity comes from the **logo placed once, at the end**, and from the world looking like the brand (its surfaces, type, colour logic), never from a label.
- A chapter or act break is a **ground change plus a carried object** (transitions.md T1 + T15), never a number.
- The product is a **camera-magnified fragment** of its real UI inside a built world (R5.1, world.md), and the UI names itself by showing its real icon, layout and words.
- A number is a **physical quantity inside a beat** (type.md section 8), not a caption in a corner.
- Edge cropping is of *content* (R9): figures, cards, a device. Text, labels and logos stay out of the outer 12% W / 10% H band unless the crop is the point.

---

## 1. The frame as coordinates

| Zone | Coords | What lives there | IDs |
|---|---|---|---|
| Centre band | y 0.43-0.55 (baseline 0.52-0.54) | Every one-line statement, headline, counter, lockup | M914 .53, M916 .44, M918 .53, M919 .54, M920 .45-.52, M934 .43-.55, M935 .47-.53, M936 .53, M941 .48-.53, M947 .50, M964 .52, M965 .50 |
| Optical centre x | 0.46-0.50 | Centred text. Final titles sit left of true centre | M947 .47, M957 .46, M973/M974 lockup spans .33-.67 |
| Upper band | y 0.14-0.28 | Heading stacked above a hero visual (square film only, where heading and card fan read as one picture; in 16:9 a heading over content is a title-then-content slide) | M932 |
| Sub-line | y 0.57-0.61 | One line under a *name or lockup* (R7.3), 0.05 H, light grey; never a sub-line under a held headline (that is a slide) | M916 |
| Lower caption band | y 0.86-0.95 | Voice-synced caption pill, small italic subtitle: only when it is the film's own idea (a caption that is part of the product's UI), never a recurring caption at the same y on every beat (feature-tour tell, slop.md N6) | M954 (pill top .86, 0.08 H tall; subtitle .92-.95) |
| Left text margin | x 0.10-0.14 | ONLY a one-line phrase with no sub-line and no kicker, on screen under 1.2 s, handing off to an object already moving on the right (a split phrase). Never a held headline block | M920 .14, M938 .14, M966 .10 |
| Content margin | 0.04-0.12 W | Nothing nearer the edge unless the crop is the point (section 9). No text, label, logo, counter or brand name lives in the outer 0.12 W / 0.10 H band; it is empty or it is cropped content (section 0) | M913 card x .12-.88 |

**Width of a statement (derived).** Ink width in W is about `0.45-0.5 x em(%H) x characters / 1.78` for tight-tracked Inter-class type at 16:9. Examples: a 20-character 3-word line at 6.7% H spans .32 W (M941); 5 words at 6.7% spans .54 W (M936); 26 characters at 10% spans .72 W (M920); 4 words at 10% spans .54 W (M920). Cap any held statement at about 0.8 W; wider than that breaks to two lines (line pitch 1.15-1.35 x em: M933 .065 em / .08 pitch, M938 .09 em / .12 pitch).

**R1.1** WHEN a statement is one line and centred -> DO put its baseline at y 0.52-0.54, ink span 0.30-0.56 W for 3-5 words at 6.5-10% H, up to 0.72-0.78 W for 5-6 word lines at 10% -- *because* the eye's rest point is slightly above geometric centre and 40-57% of the frame stays empty above and below (M914, M919, M920, M936, M941, M947).
**R1.2** WHEN the thing is a final title or last word card -> DO set it off-centre at x 0.46-0.47, y 0.50-0.53 -- *because* an exact-centre title reads as a default template; a 0.03 W offset reads as placed (M947, M957).
**R1.3** WHEN the opening word is the thesis -> DO centre it at (0.50, 0.49), 33% H em, ink 0.75-0.91 W, then shrink -- *because* one oversized noun fixes the subject before anything else exists (M937; M947 glyph-ring cluster 33% H). This is an arrival that decelerates (motion.md 3.3), not a recipe for a giant cropped first word in every film: spend scale once (director.md section 6) and give the word a physical cause or surface.
**R1.4** WHEN a phrase must be left-aligned (a split phrase whose far half becomes an object: M958, M965, M966) -> DO anchor its ink-left at x 0.10-0.14 (two-phrase splits: left phrase at .10-.14, right phrase at .72-.78), keep it to one line, give it no sub-line or kicker, and cut or move it within 1.2 s -- *because* the empty right side gives the next object a landing zone, whereas a held left-aligned block with anything under it is a slide (M920, M938, M966; rejected as "like slides" by the user).

## 2. Off-centre layouts and when to use them

| Layout | Coordinates | Use when | IDs |
|---|---|---|---|
| Statement + hero object, split | hero centre (0.27, 0.50), r 0.16 W; menu left-aligned at x 0.70, bullet x 0.69 fixed, 6 words at 2.4% H, pitch 2.8% H; right 30% beyond the menu empty | One object with parameters/modes to name | M963 |
| Headline behind a device | headline centred behind the device, one sparkle in front (R8.1); device cropped (R9.4) | Product/hardware hero | M955 |
| Icon left of wordmark | icon x .33-.47 (0.14 W), wordmark ink x .49-.67; or flame .32-.38 + word .40-.68 | Any lockup (section 7) | M974, M946 |
| Mark right of wordmark | wordmark x .32-.60, 5-dot ring tail at x ~.65 | Brand where the mark is a loader/pointer | M926, M927 |
| Split phrase | halves at x .10 and x .72 with a gap that equals the inserted object's width | Sentence continues into an icon or waveform | M958, M965, M966 |
| Prompt box, end off-frame | box left x .42, top y .38, right end off-frame, never centred | Wide view of a long field | M931 |
| Centred card | portrait card .24-.29 W x .37-.41 H, centre (.51, .55) | A single output/product shot | M930, M932 |

**R2.1** WHEN you place one hero object and need labels/modes inside a diagram -> DO put the object on the left third (x 0.27) and the labels at x 0.70 -- *because* the eye reads object then list; the dead right edge keeps the list from crowding (M963). This is a lit object with a parameter list, not a text headline beside media: if the left element is a headline block, it is a deck layout (section 0).
**R2.2** WHEN a lockup has an icon and a wordmark -> DO put the icon left, same vertical centre, and let the combined bounding box (not the wordmark) centre on x 0.50 -- *because* optical balance beats arithmetic centring (M946, M974, M920).

## 3. How many things, how much empty

**R3.1** WHEN you compose any beat -> DO put 1 hero + at most 2 supporting elements on screen (statement frames: 1-2; UI frames: card + 3 rows; hook peaks: up to 4 groups for under 0.5 s) -- *because* the viewer reads one thing at a time; a 4th element must replace one (M913, M914, M930, M939, M947, M962).
**R3.2** WHEN you judge density -> DO budget ink + objects at 5-44% of frame area; the corpus's statement frames leave 85-95% of the frame free of ink (CTA lockup ~95%: M920; top and bottom ~40% empty every beat: M947; top 28% and bottom 28% empty around a magnified card: M913; top 0.27 H empty and nothing below y .56: M930; right 30% empty: M963) -- *because* free space is what makes a single 7% H line feel loud. "Free of ink" is not "flat": the free part is a ground made of something (a plate, a lit surface, texture, depth: world.md), with one focal point inside it. A frame that is only a flat swatch with a small element is the "minimalism as a hiding place" default; empty is allowed only when it does a job (a breath before a payoff, isolation after a matched cut) and for under about 1.5 s.
**R3.3** WHEN a long log/page scrolls past -> DO let the viewport run empty (M939 at 2.40 s: mostly empty below the last card) instead of inventing filler -- *because* a legible landing after volume reads as competence.
**R3.4** WHEN the claim IS a comparison (before/after, us/them) -> DO give the two things equal height and a shared baseline (Diagrams, comparison frame) -- *because* equal weight reads as a fair comparison (M936). This is the only case for equal side-by-side panels; in a proof see R3.5.
**R3.5 (HARD GATE, G4)** WHEN a proof or demo shows two panels (code + result, form + email, before + after) -> DO put them side by side in one frame ONLY if one is clearly the hero (>= 2x the other's area, the other a supporting texture) or the camera moves between them (a pan / push from A to B). Otherwise show ONE object per frame and cut or move the camera between them, carrying one edge or position across the cut. -- *because* two equal panels side by side read as a slide and each ends up at half the size it needs to be read; a test film with two 0.43 W panels failed this. Check: count the panels in every proof frame and compare areas.

## 4. Type size by role (em, % of H)

| Role | em % H | Weight | Tracking | Notes | IDs |
|---|---|---|---|---|---|
| Annotation / texture | 1.3-1.9 | 400 | normal | Unreadable on purpose (9-14 px on 720p), and only INSIDE a UI fragment or a diagram. Never a free-standing label, chip or caption pinned to a shot or a frame edge (section 0) | M962, M913, M939 |
| Menu item | 2.4 (pitch 2.8) | 450 | normal | inactive ~#A3A3A3, active black; colour only, never weight | M963 |
| UI card title / sub | 2.2-2.5 | 400 | normal | | M939, M940 |
| Orb/diagram label | 4 | 400 | normal | no box behind it | M966 |
| Ident title | 4.4 | 500 | -0.4 px (about -1% em) | | M962 |
| UI prompt text | 4-5 (3.1 growing to 3.9 as box enlarges; 6 when the line is the hero) | 370-450 | normal | the one readable UI object | M914, M919, M942, M949, M969 |
| Status / log line | 11 then 5.5 | 400 | normal | halves as camera pulls back (80 -> 40 px) | M919 |
| Phrase (supporting line) | 5-7 | 350-450 | -2% to -3.5% em | | M927, M930, M931, M936, M962-M969 |
| Headline | 7-11 (9 typical) | 400 (500-550 when branded) | -1.5% to -5.5% em | | M917-M921, M941, M944, M947, M953, M958 |
| Act-two / emphasis word | 16 (after 11 in act one) | 550 | -1.25% to -2.5% em | enters at 0.73 scale and grows into slot | M967 |
| Hero number | 22-29 | 400-500 | normal | blurred entrance can be ink 47% H at weight 900 (signature) | M936, M945 (24), M954 |
| Opening thesis word | 33 (ink .91 W) | 400 | normal | | M937, M947 |
| Name/brand word typed | 21 (cap 16) | 650 | -4% em | | M968 |
| Wordmark (sign-off) | 9-14 (cap 8-9; ink .22-.38 W) | 500-600, semibold only here | tight (collapses +20 -> -3 px while resolving) | | M920, M929, M932, M938, M946, M973 |

**R4.1** WHEN you need hierarchy -> DO change size by role (table above), not weight; weight rises only about 20% as copy becomes brand (400 -> 450 -> 480, M930-M932) and 600 appears only on the wordmark -- *because* bold reads as template; scale contrast reads as design (M930-M938, M962-M969).
**R4.2** WHEN a statement and a figure share a frame -> DO keep the sentence at 6.5-8% H and the figure at 22-29% H (about 3.5x) -- *because* the number is the claim and the sentence is its label (M936).
**R4.3** WHEN text must be read -> DO make it at least 4% H; below 2% H it is texture and no one should be asked to read it -- *because* readers need a stable target (M913, M914, M939).

## 5. UI framing

**R5.1** WHEN the UI is proof -> DO crop to a magnified fragment: modal/dashboard/rail 1.4-2x (M914 1.6, M916 1.5, M917 1.675, M918 1.42, M931 2), one card or one button 2.3-4.4x (M913 3.3, M943 2.33, M949 3.86, M919 4.39; M956 button .04 -> .27 W is an outlier at 6.8x), then pull back to reveal the product -- *because* one readable object at a time, and the pull-back becomes the "it was inside a real product" beat.
**R5.2** WHEN you show a screen -> DO show no *browser* chrome (no browser frame, URL bar, bezel, OS menu; the surface is a floating card, rail, modal or dashboard plane in a built world, world.md) -- *because* chrome says screenshot; a floating plane says designed (M913-M920, M939-M946). The plane still needs **identity**: the real icon, sender, time and sentence from the product, real density, a surface that contrasts with its ground. A generic white rounded card with a toolbar of three circles and a send arrow, or a dark card saying "Good morning" with a status dot and "label - value", is vibe-coded UI (slop.md N5); build from the capture's real screens (brand.md section 3).
**R5.1b (HARD GATE, G1)** WHEN the UI is the proof -> DO check the render: the one readable object's text is >= 0.04 H AND the fragment fills >= 0.55 W (or is deliberately cropped by the frame edge). A small card (~0.3 W, text ~0.03 H) in a large empty ground FAILS; the only exception is a wide establishing shot shown < 1 s directly before a push-in to readable size. Captured code and UI are small (12-14 px = 0.015 H): magnify the fragment 2-3x, crop it, or build it larger; do not keep it at capture size because it is "real". Magnify with the camera, not by resizing the UI's type, and let the fragment sit in a world (a lit surface with depth), not on a void. -- *because* the viewer reads one thing per beat and cannot read 0.03 H text at 30 fps on a phone.
**R5.3** WHEN you choose what to make readable -> DO make exactly one object readable at 0.04-0.12 H (prompt .04-.05, row text .05, tab label .05-.07, modal header .055, status .11 then .055, headline .10-.12) and set everything else at 1.3-1.9% H as texture -- *because* texture proves "real product" without competing (M913 editor labels 1.4-1.7%; M939 9-14 px).
**R5.4** WHEN the screen must feel physical -> DO make the window the camera: one transform on one group (card, panels, chips, scrubber, video together), dot grid and ground screen-fixed, text never zoomed separately; scale the window 0.70 -> 0.78 W over 1.2 s rather than scaling its bars (M913, M918, M919, M953, M958) -- *because* parallax between group and ground sells depth (mechanics: motion.md R6.1, R6.2).
**R5.5** WHEN a container's real size is bigger than the frame -> DO let it overflow: box 1.78 W (M974), dropzone 1.36x its settled size (M918), prompt box end off-frame (M931), status line overflowing right on purpose (M919), card 0.90 W with lower half cropped (M922) -- *because* the viewer infers a larger system from the part.
**R5.6** WHEN text sits in a field wider than the box -> DO crop it by the box edge instead of wrapping (M974, M913 clipped chip labels) -- *because* clipped labels read as real data.
**R5.7** WHEN one clip hands to the next -> DO carry geometry across the cut: same right edge x 0.20, same 5 rows at y .06/.28/.50/.72/.94 (M933 -> M934); same lattice cols .18/.39/.62/.83, rows .12/.50/.88 (M934 -> M935); same prompt card x .23, y .50, .54 x .27 (M941 -> M942); same title ink x .25-.69 (M947 -> M948) -- *because* a pixel-matched cut disappears.

## 6. Cards, grids, rings, orbits (geometry seen)

| Pattern | Geometry | IDs |
|---|---|---|
| Fan of 3 portrait cards | centre .29 x .41 upright at (.51, .55); left .26 x .36 at -18 deg centre (.29, .58); right .26 x .35 at +8 deg centre (.68, .57); centre card hides 1/3-1/2 of each; symmetric about x .50 | M932 |
| Fan of 3 coming out of a pocket | .09 W x .20 H at -18/-3/+10 deg, tops .10-.12 H above rim | M925 |
| Fan of 4 dragged | each .11 W x .25 H, radius 20 px, +/-4-5 deg | M918 |
| Token ring (ellipse) | centre (.52, .62), radii .10 W x .15 H, 9 discs .03-.06 W (upper smaller than lower for depth), each at its own slot, glyphs upright | M956 |
| Dot ring (mark) | 5 dots, ring r .03 W, dot .014 W; settled ring .055 W total | M926 |
| Orbit of mixed cards | 10 upright cards, sizes .08 x .29 to .21 x .21, tall ones further out, not an equal decagon; start r 650-800 px, rest 330-450 px | M941 |
| Orbit of icon tiles | 9 tiles at 40 deg, nominal .06 W swelling to .11 W; radius .63 H -> .29 H -> floor .275 H -> hold .38 H | M945 |
| 2 x 5 avatar grid | discs .17 H, columns x .84/.96 (right column touches the edge), rows y .06/.28/.50/.72/.94 (top and bottom rows cropped) | M933 |
| Badge lattice | pitch .12 W with 5-10 px hand jitter, orthogonal, badges .09 W; zoomed to .16 W, cols .18/.39/.61/.83, rows .12/.50/.88 | M934, M935 |
| Logo grid | pitch .125 W at scale 1; tiles one cell each; 5 tiles ringed around a 2 x 1 title hole (x .38-.62, y .39-.61) | M937 |
| Carousel | 6 cards .26 x .52, pitch .27 W, y .26, gap about 13 px; stop position is the selection (selected card ends at x .38) | M942 |
| Card list | .66 W x .17 H, pitch .19 H, no enclosing box | M940 |
| Service cards in a row | 3 at x .16/.40/.63, each .20 x .09, y .57 | M939 |
| Tile reveal | 13 tiles (5+5+3), each .13 W, radius ~10 px | M918 |
| Dot grid ground | pitch .056-.06 W (M913, M914), .11 W (M931 wide, doubles to .22 W when the camera is 2x), tile ground .057 W (M964), .05 W (M965); dense lattice 14.6 px pitch (M967); dot-matrix object: 271 dots on 1+6n rings, ring pitch 22.8 px, outer r .16 W (M963) | M913, M914, M931, M963-M967 |
| Rear peek stack | previous card retreats to left edge .50 W, .21 W x .41 H | M927 |
| Shape columns | outline shapes at x .77 and x .94, 0.13-0.17 W | M938 |

**R6.1** WHEN you stack cards -> DO put the centre card on top and the sides behind, hiding 1/3-1/2 of each; angle sides -18 and +8 (asymmetric) -- *because* symmetric fans read as clip art (M932).
**R6.2** WHEN you build a ring of items -> DO use an ellipse around the hero, depth by size (upper smaller), items entering at their own slot, never from one centre point -- *because* the ring counts inventory and never reads as particle dust (M956, M945).
**R6.3** WHEN you build an orbit of photos -> DO use irregular sizes, tall ones outside, upright cards (never rotated), constant size during motion -- *because* irregularity reads as photographed, an equal decagon reads as generated (M941).
**R6.4** WHEN you show a grid that could be a chart -> DO make it an orthogonal lattice with 5-10 px jitter, not hex or random -- *because* the viewer reads "spreading" as geometry (M934).

## 7. Lockup geometry (icon / wordmark / tagline)

| Lockup | Icon | Wordmark | Gap | Spans | IDs |
|---|---|---|---|---|---|
| Character-built | avatar .06 W (starts .14 W, shrinks about its centre) | .22 W x .07 H semibold, centred below the CTA line at (.39, .54) | avatar 25 px (~.02 W) left of CTA first word | block .30 W x .20 H centred | M920 |
| Icon left, word right | emblem .14 W x .25 H | ink .18 W (cap 8% H) | .02 W | .33-.67 | M973, M974 |
| Flame + word | .06 W x .15 H, base y .58 | ink .28 W (cap 9% H) | .02 W | .32-.68, centre (.50, .50) | M946 |
| Bars + wordmark | .11 W x .20 H at (.23, .40) | .38 W x .14 H semibold at x .40 | ~.06 W | .23-.78 | M938 |
| Emblem + typed name | .10 W x .18 H, final centre (.37, .50) | .24 W, cap .16 H, left edge .46 | ~.04 W | .32-.70 | M968 |
| Wordmark alone | none | ink .27-.28 W | n/a | centre (.50, .50) | M929, M932 |
| Stacked icon | rounded triangle .13 W x .20 H over .05 W dot | none | .04 H between | centre x .50 | M959 |
| Line icon alone | .07 W x .12 H | none | n/a | centre | M929 |

**R7.1** WHEN you size a lockup -> DO use wordmark ink 0.22-0.38 W (modal value 0.27-0.28 W), icon 0.05-0.14 W, gap 0.02-0.06 W, centre at y 0.50 (0.50-0.54 if a CTA line sits above) -- *because* small marks in an empty field feel confident and leave room for glow/motion (M920, M929, M932, M946, M973, M974).
**R7.2** WHEN a lockup follows a contracting UI -> DO match sizes at the cut (UI card .16 W -> mark .11 W at the same centre, M932) -- *because* the hand-off looks like one object becoming another.
**R7.3** WHEN the film has a single tagline -> DO set it one line, 0.05 H, light weight, light grey, 0.38-0.45 W wide, under the name at y 0.57-0.61 -- *because* it supports and never competes (M916); most closes carry no tagline (M929, M932, M946, M959).

## 8. Depth and layer order

Back to front:

1. Ground (a surface: a plate or screen from the capture, a material, a lit gradient with a source; flat only when the brand is flat or for a flood under 1 s. world.md).
2. Texture: dot grid, lattice, grain, small sparkles, or a real material from the capture. Screen-fixed, never inside the camera group, never above text (M913 dot grid screen-fixed; M964 tiles never scale with blocks; M967 lattice delayed 0.2 s). No ghost decoratives: faint giant words at 3-9% opacity, hairline rules, grid patterns used as "depth" are house-style slop (slop.md N20).
3. Background UI/panels, defocused 4-11 px or dimmed (M918 peak 11 px; M942 4 px; M956 7-15 px).
4. Hero object / camera group.
5. Claim text (headline). Screen-fixed, not parented to the camera, never blurred while the UI behind it is (M918, M958).
6. In-front accents only when the story needs depth: a sparkle over a phone corner, stickers over a card edge (M955, M930).
7. Caption/status pill: always frontmost text (M954).
8. Cursor: single instance on its own top layer outside the camera group, size follows camera scale (M914, M918, M919, M953, M969).

Allowed inversions (condition in brackets):
- Photo cards paint above a huge centred headline [cards irregular, overlap only the last letters, 3.27-4.20 s, M941].
- A stroke runs above phrases and below the product cluster [M947]; a hand-drawn loop runs behind both text and card [M933].
- A card rising from below occludes the headline bottom-up instead of fading it [M916].
- The cursor may drop behind a card between beats, blurred, and an orb may pass behind the cursor [M943].

**R8.1** WHEN a headline and a device share the frame -> DO put the headline behind the device and one sparkle/sticker in front of its corner -- *because* the device then sits in the same space as the type (M955).
**R8.2** WHEN you defocus the backdrop -> DO blur the UI (cap 11 px) and keep the type sharp -- *because* legibility holds and the UI still reads as proof (M918, M958).
**R8.3** WHEN something must disappear under another object -> DO occlude it (card rising 62% of travel in 0.13 s, hiding headline and bottle bottom-up) -- *because* occlusion implies physical space; fades imply a slide deck (M916).

## 9. Edge cropping as a device

**R9.1** WHEN a figure/avatar set shows reach -> DO crop it at the frame edge: right column touching the edge, top and bottom rows cut, 10 discs at .17 H (M933); 4 photo cards still on screen at the last frame at (.04, .17), (.98, .21), (.95, .82), (.03, 1.0) while the others have left (M941) -- *because* cropping says "there is more than you see".
**R9.2** WHEN a panel anchors a settle -> DO leave 0.20 W of its edge on screen at rest (card right edge x .20, only the last letters of its title showing) -- *because* an edge anchor keeps the composition tied without a visible box (M933, M934).
**R9.3** WHEN a second figure arrives to compare -> DO leave it cropped and moving at the cut (the second figure and its unit cropped at the right edge, never centred) -- *because* motion at the edge implies more (M936).
**R9.4** WHEN a device is the hero -> DO crop its top corners off-frame, bottom at y .97, screen ~.39 W (M955) -- *because* a fully visible phone is a mock-up; a cropped one is a hand-held object.
**R9.5** WHEN a late element enters from an edge -> DO have it arrive already filled as the pull-back reveals its cell (M937) -- *because* it reads as "the grid was always bigger".
**R9.6** WHEN you place type near an edge -> DO let a first word start oversized and clipped at the left edge as it shrinks (M918 first word at 1.39x, M947 first word at 0.39 H, M937 ink .91 W) -- *because* the crop reads as impact. Use it as an *arrival* (decelerating from oversize), once per film, and only when the idea wants that word to be huge: a giant cropped word in every film is the house style of one over-used generation (slop.md N15), and a giant word on a flat ground with no object is a slide.

## 10. Aspect ratios

**16:9 (1280 x 720 reference)** all numbers above; px values are on this stage (x1.5 at 1920x1080). Majority of the films.

**Square 720 x 720** (M930-M932 evidence). W = H, so a % of H equals the same % of W: the same line is 1.78x wider as a fraction of W.
- Keep em at the same % of H (white 54 px = 7.5% H on dark, black 45 px = 6.25% H on pale, heading ~7% H, sign-off 8% H at rest).
- Titles of ~3 words fit one line at ink .56 W (M930, x .16-.72, y .47-.54). Anything longer: break to 2 lines. The pale-phase heading is stacked 2 lines at top y .14-.28, ink .39-.42 W, with the card fan at y .32-.55 below.
- Portrait cards grow to .24-.29 W x .37-.41 H; logo mark .11 W x .10 H; sign-off name lands at .28 W and starts at 1.7 W (3.5x).
- Empty zones become bands: top .27 H empty over the title row in M930.

**9:16 (PRACTICE, not in the sample)**
- Set em by W, not H: headline about 8-10% of W (about 4.5-5.6% H). Apply the width formula above with W = 0.5625 H.
- Break statements to 2-3 lines of at most 0.8 W; keep the centre band at y 0.40-0.52 so platform UI (top ~0.10, bottom ~0.20) never covers it.
- Stack instead of splitting: hero object at y .30-.40, menu/labels below at y .62-.70; icon above wordmark (M959 stacked mark).
- Cards: fan at .55-.70 W; lockup wordmark .45-.60 W; keep the same 1-3 elements rule.

---

## Diagrams

The diagrams show the *geometry of the ink*. Every empty area in them is a built ground (world.md), not a flat swatch, and none of them has a label, counter or caption in a corner (section 0).

Statement frame (3-5 words, M914/M919/M941):
```
x 0      .25      .50      .75      1.0
y0 +----------------------------------------+
   |                                        |   top 40% empty
.25|                                        |
   |                                        |
.43|        .---------------------.         |   ink band
.53|        |  three to five words|  drift  |   baseline y .52-.54
.55|        '---------------------'  <--    |   x .23-.77, drifts left 1-2%/s
   |                                        |
.75|                                        |   bottom 40% empty
y1 +----------------------------------------+
```

Lockup frame (M946, M974, M920):
```
x 0      .25      .50      .75      1.0
y0 +----------------------------------------+
   |                                        |
.41|            Try it now   (CTA line)      |   x .40-.66, top y .41 (M920 only)
.50|       [icon] Wordmark                  |   icon .33-.47 | word .49-.67
.54|         ^ gap .02 W                     |   y centre .50
   |                                        |
y1 +----------------------------------------+   95% empty, glow/sweep alive
```

UI-proof frame (M913, one magnified card, camera = one group):
```
x 0      .25      .50      .75      1.0
y0 +----------------------------------------+
   |   (top 28% empty, dot grid screen-fixed)
.28|     .--------------------------------.  |
.38|     | o  row one       (.17 | .20)    |  |   rows 0.05 H, pitch .11 H
.49|     | o  row two                      |  |
.60|     | o  row three                    |  |
.72|     '--------------------------------'  |   card x .12-.88, 44% H tall
   |   (bottom 28% empty)                   |
y1 +----------------------------------------+   cursor above everything
```

Comparison frame (M936, 30:00 vs the next figure):
```
x 0      .25      .50      .75      1.0
y0 +----------------------------------------+
   |                                        |
.33|            30:00      (0.22 H em)      |   claim figure, pure black
.50|                                        |   same baseline, same height
.66|            unit label (0.067 H)         |   label fades in 0.2 s after figure lands
   |                                        |
   |  later: [6] slides left  | weeks ->    |   second figure same 0.22 H, cropped at
y1 +----------------------------------------+   right edge, never settles
```

Menu + hero (M963):
```
.50  (.27,.50) disk r .16 W               * Item A     x .70, 2.4% H
                                            Item B     bullet at x .69 fixed,
                                            Item C     list scrolls behind it
```

---

## Slop tells for layout

| An AI default would | A designer does |
|---|---|
| Put a brand label, counter, timecode, kicker, header or footer on the frame | Nothing: the frame holds the claim, the product and the logo once (section 0, `scripts/lint.mjs`) |
| Left-align a headline with a sub-line and put a grid or device on the right | One centred line, a split phrase whose far half is an object, or a headline behind a cropped device (R8.1) |
| A flat swatch plus one small element as the whole frame | One focal point inside a built world: ground, light, depth, texture (world.md) |
| Name each shot with a small chip or caption ("Messages", "Mail") | The UI shows what it is through its real icon, layout and words |
| Centre everything at exactly (0.50, 0.50) | Statement baseline .52-.54; final titles at x .46-.47; lockup bounding box centred, not wordmark |
| Fill the frame with a full app screenshot plus browser chrome | One magnified fragment (1.4-4.4x), floating, no browser chrome, one readable object, built from the capture's real screen with its real identity |
| Leave a small card (0.3 W) floating in a dark void as the proof | Fragment >= 0.55 W with text >= 0.04 H, or cropped by the frame edge (R5.1b) |
| Put code and result side by side at equal size | One object per frame; side by side only if one is >= 2x the other or the camera moves between them (R3.5) |
| Add 6-8 supporting elements per beat | 1 hero + 1-2 supporting; most of the frame free of ink, and that free part is a built ground |
| Use bold for hierarchy | Size by role (7-11% headline, 22-29% hero number); 600 only on wordmark |
| Make a symmetric fan with equal angles | Centre on top, sides -18 and +8, hiding 1/3-1/2 of each |
| Spawn rings from one centre point | Items at their own ellipse slot, upper smaller, 1-2 frames apart |
| Equal-sized orbit cards, rotated | Irregular sizes, tall outside, upright, constant size |
| Keep everything inside safe margins | Deliberate crop of *content*: avatars on the edge, panel anchor at x .20, phone corners off-frame, box wider than frame; text and labels stay out of the outer 12% band |
| Put the headline over the device or the cursor under cards | Headline behind device, sparkle in front, cursor always top |
| Blur the whole frame to focus the type | UI blur cap 11 px, type never blurred |
| Reuse 16:9 numbers unchanged in square or vertical | Same em % of H in square with wider fraction-of-W lines; 9:16 sized by W |
| Place a tagline under every logo | Zero or one line, 0.05 H, light grey |
