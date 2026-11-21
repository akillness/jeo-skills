# UI demo: showing a product working

See also: idea.md (the case is part of the idea; film shapes), judgment.md (show the consequence, not the claim), brand.md (real UI with identity; using the capture's screens), world.md (the world the UI sits in), motion.md (eases, camera, press physics), layout.md (UI framing, magnification, page chrome), type.md (typing cadence, counters, meaning on the word), transitions.md (cuts between UI scenes), close.md (click and typed-prompt endings), slop.md (UI patterns U1-U12, N5).

A UI demo is not a screenshot with animation on it. It is a magnified fragment of a product, a persistent pointer, and a chain of cause and effect that the viewer can read in under a second per link. This file covers how to frame real UI, how the cursor behaves, how clicks and typing look, how lists and grids react, how agent work is shown, and five frame-timed recipes. All times are at 30 fps with seconds in brackets unless stated; positions are 0-1 of frame (x right, y down); sizes are % of frame height H or width W. Evidence is cited as moment IDs.

Reading order: section 0 decides *what* is demonstrated; sections 1-3 are the grammar everything else sits on; 4-11 are mechanics; 12 is the recipe book (mechanics, not a default film); 13 is the slop list.

---

## 0. The case: what the demo is about

Everything below is how to make a UI beat *move* correctly. None of it says what the beat should *show*. That is decided here, first, and it is the main difference between a demo that proves a product and a feature tour.

**0.1 WHEN you demonstrate the product -> DO follow one specific case with stakes**, from its trigger to its result: one trade from question to the alert that fires; one lead from discovery to the message that lands in the team's channel; one shop built from one sentence; one late arrival turned into a sent apology. Not three features in a row. *Because* a single case with something at stake is a story the viewer follows, and a feature tour is a slide deck of cards.

**0.2 WHEN you fill the UI with content -> DO use real, specific, slightly odd, well-designed content**: the real sender, the real icon and app name, a time stamp, a sentence in the product's own voice, a real product the customer would actually sell or write (a shop for vintage postage stamps, a microgenre playlist). Take it from the capture's copy and screens first (brand.md section 3). "Project Alpha", "Your Brand Here", lorem ipsum, a stock name and a round-number stat prove the opposite: that nothing real was gathered. Any invented item you keep is declared in NOTE.md (never on screen as a disclaimer).

**0.3 WHEN the product "thinks", "loads" or "works" -> DO show it with an object from the customer's world, never an AI symbol.** A wok tossing ingredients for a food-ordering agent; the real agent log; a ring of user-dots around a shrinking figure. No orbs, sparkles, neural nets, glowing brains or scrambled-glyph "AI" text. Section 8 holds the mechanics of status and shimmer; this rule decides what the thing being worked on *is*.

**0.4 WHEN the copy names a capability -> DO let the viewer watch the consequence** (the price line crosses the threshold and a real notification fires; a cursor drags a misplaced word into place; a coin is scanned into a ghost of dots) rather than caption it. The strongest version has the product perform inside the sentence (type.md section 0.1). Put the proof first when there is a claim and a proof: run the flow, then say the line.

**0.5 Recipes are mechanics, not a default film.** Recipe A below (prompt, send, agent result) and its cousins are frame-timed templates for when the product genuinely *is* something you type into, drag into or toggle. A "prompt box + send arrow + cursor click" beat is already a cliche of 2025-26 AI-product films; as the default structure of every film it is a genre, not an idea. Choose the film shape in idea.md (director.md section 3a) first; use a recipe only for a beat that shape calls for.

---

## 1. Framing real UI

**1.1 WHEN the UI is the proof** (prompt, checklist, modal, button) -> **DO** crop to ONE object and magnify it: card at 0.76W x 0.44H (3.3x), prompt card 1.6x, tab rail 1.5x, dashboard 1.7x, modal 1.4x, send button 4.4x (2.3x if the cursor must stay in shot, 0.27W macro for a push-in). Keep the top and bottom ~28% of the frame empty. Text that must be read is >= 4% H (rows 5%, prompt 4-5%, tab labels 5-7%). -- *because* the viewer reads one thing at a time and the later pull-back becomes the beat that says "this was inside a real product". (M913, M914, M916, M917, M918, M919, M943, M956)
- **HARD GATE (G1).** The render must show the readable object with text >= 0.04 H and the fragment >= 0.55 W (or cropped by the frame edge), sitting in a world rather than on a void. Magnify with the camera, not by resizing the UI's type. A ~0.31 W code card with ~0.03 H text in a large empty ground fails; a wide establishing shot of that size is allowed only if it lasts < 1 s and a push-in to readable size follows immediately. Captured UI is tiny (12-14 px = 0.015 H): scale it up 2-3x with the camera or build it bigger, and when two objects are needed (code, then result) show ONE per frame and cut or move the camera between them (layout.md R3.5): do not put equal panels side by side.
- Where the films disagree: M939 and M913's editor use 9-14 px labels (1.3-1.9% H) on purpose. Condition: use texture-size text only when the claim is volume or "real product" and nothing in it must be read; then give it distinct silhouettes (one tall card of ~0.49H, a table, green chips) so the rhythm survives without words. If any line must be read, it is >= 4% H and everything else is texture.

**1.2 WHEN you reveal the product by pulling back** -> **DO** one-frame snap, then tail: scale ratio 0.56-0.77 in ONE frame (2.50 -> 1.41; 1.47 -> 1.14; a step to 2.46x mid-typing), then a `M.ease.softLand` tail of 9-18 f (0.3-0.6 s). Precede the snap with a slow accelerating creep (3.31 -> 3.01 over ~12 f) and fade the surrounding UI up behind the card during that creep. Release the pull-back about 12 f (0.40 s) after the last completion beat (a task check; M913, Recipe D). After the snap a 2-frame push (1.06 -> 1.30), decaying to 1.37, then a ~0.6 s (18 f) hold with only a sub-pixel creep, then an accelerating pan that ends hard with no settle. -- *because* the jump has the punch of a cut and the tail lets the eye read; completion releasing the camera makes the product appear as the result of the work. (M913, M914, M923)

**1.3 WHEN anything on the UI moves with the camera** -> **DO** put every part (card, panels, chips, scrubber, video, phone rim, cursor-adjacent elements) under ONE camera group; scale the window, never its bars or text separately (0.70W -> 0.78W over ~36 f). Dot grids and backgrounds stay screen-fixed or drift on their own. Parallax between layers is 2-2.4x (tiles > diagram > orb). -- *because* a single transform makes a flat UI read as one physical object; separate zooms read as a PowerPoint. (M913, M919, M953, M922, M966)

**1.4 WHEN a pan or whip is needed** -> **DO** two phases, not one ease. Pan (`M.ease.softLand`): about 1.2 H/s at the start falling to 0.18 H/s over 2 s; no hold. Whip (`M.ease.whip`, leaving half `M.ease.accelExit`; motion.md R6.4, R6.9): ~1.6 H/s plus 1.4 W/s at peak while shrinking 20%, decelerating after. Or, for a timeline, one shared track for sidebar, ruler and blocks at a peak ~0.1 W per frame, ~2.9 frame-widths of travel in 3.3 s, a fixed 0.03 W left gutter clipping everything. -- *because* two pushes and a clipped gutter look like a camera operator; one ease looks like a keyframe. (M922, M940, M966)

**1.5 WHEN a scene opens on UI** -> **DO** let it arrive built and already moving: the prompt card is mid-slide with 105 px gone on frame 1, the modal is at 1.42x already zooming out, the trace panel is complete and then drops 0.09H decelerating while a pale overlay clears in ~11 f. For a product shot, keep the carried element (header, brand) lit at frame 0 and lift the rest from near-black over 9-30 f with a screen-blend colour wash sweep, not opacity fades. -- *because* it says "the app was already running" and the first frame is not a blank. (M914, M918, M940, M922)

**1.6 WHEN the UI is a backdrop for other things** -> **DO** defocus by blur, not opacity: 4 px keeps copy readable (hold it; the cursor blurs with it), 7-15 px for non-hero panels, a cap of ~11 px when a headline sits over it (headline never blurred, UI also darkens ~0.1). Pull focus back to the destination form by animating blur 4 -> 0 px over ~14 f. -- *because* depth carried by blur still lets the backdrop prove the product. (M942, M943, M956, M918, M953)

**1.7 WHEN you draw the surface** -> **DO** flat, with the product's identity. No browser bar, URL, traffic lights, bezel or full-screen screenshot; but the real icon, name, sender, time and sentence stay, and the plane contrasts with its ground (a generic white card with three toolbar circles and a send arrow is vibe-coded UI, slop.md N5). A floating card/modal/rail/dashboard plane on a dark or pale ground; neutral greys (#141414 panels, #171717 prompt, or #F8F8F8 fill), a 1-1.5 px hairline (#262627 on dark, #DCE1DE on pale), radius about 0.2 x the card height for prompt cards, no shadow or at most ~12% soft, a dot grid or very low-contrast gradient behind (grid pitch 0.06-0.11 W, dots 2-3 px) or, better, a real ground from the capture (world.md). The grid pitch also proves zoom: pitch doubling = 2x. -- *because* chrome is the strongest "stock recording" tell and costs the frame. (M913-M919, M931, M932, M939)

**1.8 WHEN output cards appear** -> **DO** keep live content playing inside them (video, footage cover-fit and never stretched, wide -> portrait by cropping) and add a warm bloom (~20 px) or a neon flash that decays in ~10 f. -- *because* static thumbnails read as slides; moving ones read as outputs. (M917, M919, M920, M930)
- Disagreement on numbers: M917 shows view-count style metrics fully formed with no count-up (marketing output); M923/M955/M958 move numbers off a control (controlled value). Condition: output stats appear whole; values caused by a control animate (section 11).

---

## 2. The cursor

**2.1 WHEN you choose cursor art** -> **DO** design it per ground and keep one family per film: white arrow or hand with a 3-4 px dark outline on dark; black arrow with a 1 px white edge on pale; or a custom bevelled arrowhead in the film's accent. Size at rest 0.04-0.06 W (0.11 H if the film is cursor-led). Never an OS cursor, never an emoji, never an I-beam. -- *because* the cursor is a character in the film's identity. (M914, M918, M919, M930, M931, M932, M933, M953, M956, M959)
- Two valid grammars, pick one per film: (a) **arrow-only**: the cursor never changes shape, the UI carries all response (M914, M919, M939, M942, M969); (b) **pose film**: the cursor swaps art in one frame (arrow -> pointing hand 3-5 f before the click, M928 at 5 f, M931, M935; press pose = finger bend, height 0.06 -> 0.04 H, M930; pointing -> thumbs-up with an 8 px bounce and no scale, M935). Do not mix.

**2.2 WHEN the cursor enters** -> **DO** make it oversized and scale about its TIP: 1.5-2.2x (multi-cursor), 0.36 W rotated 55 deg (glossy 3D), up to 5x blurred 5 px and mostly off-frame, shrinking 5.1 -> 3.45 -> 3.0 -> 2.7 -> 2.45 -> ... -> 1.0 over ~26 f. In the first frame step it covers ~60% of its travel (a 79 px/frame = 0.06 W first step on a 1280 stage; in the oversize case 37% of x and 60% of y), then a long `M.ease.snapSettle` tail; total travel 0.5-0.9 s, with 85% done in the first ~0.7 s and a 0.5 s creep. It shrinks 15-20% as it nears a close target. -- *because* it reads as thrown at the screen and the tip stays the anchor. (M953, M956, M959, M933, M939, M942)

**2.3 WHEN the cursor travels** -> **DO** curve it and rotate its heading with the travel (heading swinging -20 -> -195 deg over a ~0.7 s loop under the card; a 20 deg clockwise lean at peak speed; tip-anchored rotation toward the target). Arcs dip well below the start (0.23 H) on the way to a distant button at peak ~80 px/frame with a one-sided 20-25 px smear (only if the film uses smear). Straight lines are only for drags. In stepped films use 2-frame steps with each step ~0.72 of the previous and x converging faster than y so the path bends. -- *because* a straight constant-speed line is the mouse-macro tell. (M914, M919, M943, M969, M918)

**2.4 WHEN the cursor reaches a target** -> **DO** park, and size the park to what the viewer must find: 2 f (0.07 s) for an obvious button, 3-5 f (0.1-0.17 s) for a switch, 0.16-0.5 s (5-15 f) when the camera must zoom onto the target, 0.3 s hover before a pose swap. Finish any camera zoom BEFORE the press. Hover states act early: a hover rim (#73C8F2) about 0.4 s before a drop; a hover square behind a trigger 5 f BEFORE the hand lands, then popup opens 6-7 f after landing. -- *because* the park gives the eye time to find the target, and early hover states prove the UI is live. (M914, M919, M931, M933, M935, M939)

**2.5 WHEN several cursors exist** -> **DO** one job each, started on different frames, with an event about every 9 f (0.3 s): one presses and drags a card, one recolours a bar twice, one clicks a heading; give each a name pill (~0.06 W x 0.04 H) and let them jump (not interpolate) across a cut. -- *because* collaboration reads as simultaneous cause and effect, and each pointer can be followed. (M953)

**2.6 WHEN the cursor leaves** -> **DO** one of: accelerate off-frame (0.04-0.06 W per frame at peak, curved, tilting 10-45 deg, edge-cropped by f+3); the whole zoomed view slides away with it (smear 20 -> 140 px, 10 f, then 3 empty frames); shrink to nothing in place in ~9 f (0.29 s); or park blurred in a layer behind (4 px) until the next beat. -- *because* an exit by acceleration clears the frame without dead time. (M914, M918, M919, M939, M942, M943)

**2.7 WHEN you build the layers** -> **DO** put the cursor (and a dragged stack) on its OWN top layer outside the camera group, scaling by its own factor (1.5x when the UI zooms 2.33x; follows camera scale in M914). Exactly one instance at a time. It rides a shrinking button during a contract. -- *because* cursor continuity keeps the "real recording" illusion and its scale stays believable. (M914, M918, M943, M969)

**2.8 WHEN the cursor enters relative to typing** -> **DO** decide by its job. If it must focus the field, enter before typing (M914: in at 1.84, typing at 2.48 s source; it rides the zoom). If its job is only "send", enter ~0.4-0.7 s (12-21 f) before the last character lands (pointer appears at 3.20 s while typing ends 3.60 s, M969) or just after (M919). -- *because* a pointer waiting around for 2 s has nothing to do and breaks the pace.

---

## 3. The click

**3.1 WHEN a click happens** -> **DO** cause then effect. Cursor press: 2 f down to 0.71-0.90 (0.81 -> 0.71), tip pushed down ~0.03 H, 3 f back to 1.0 (a 13% compression with the tip down is enough in a hero CTA; 0.75 over ~7 f for a slow one). Target reaction: 0-1 frame after the cursor minimum, to 0.63-0.81 (button 0.63 in M914; 0.76 M922; 0.80 M919/M928; 0.71 M956 held 2 f; 0.97 for a quiet close-up), the arrow glyph inside it lagging one frame. Reaction on the same frame the page responds (a card starts expanding on the press-minimum frame). -- *because* the tiny gap between cause and effect is what sells "real product". (M914, M919, M922, M928, M939, M943, M956, M959)

**3.2 WHEN the click needs weight** -> **DO** shape asymmetry on the target (the cursor itself is 2 f down, 3 f up, see 3.1): fast squeeze (`M.ease.glide`), slower release (6 f down, 10 f up at 30 fps), hold the minimum for 2 f (M956), release without overshoot (`M.ease.softLand`), OR a single small rebound to 1.05 over ~10 f (`M.ease.popOver`). At most one rebound style per film. -- *because* an asymmetric curve feels like a spring-loaded button without cartoon bounce. (M922, M956, M914)

**3.3 WHEN the response is shown** -> **DO** put it in the UI, never in a graphic on the cursor: a hard colour step on the target (green -> coral, no tween), a tint plate at ~0.25 opacity peaking at the press frame, a bar dipping 15% and recovering in ~4 f, a sheen band (25-45 px) crossing the button in 7-16 f, a glow that peaks at 35 px blur @40% about 7 f after press and decays over ~0.3 s. Variant for a "sent" state without a press: cross-colour the button over ~8 f (disc black -> #969696 -> white while the arrow goes white -> same grey, invisible at the midpoint -> black), no scale. -- *because* the click is felt in the object, not announced by decoration. (M930, M931, M953, M956, M928, M974)

**3.4 WHEN a ring is tempting** -> **DO** use none. Ripple rings appear in exactly one film (M914: a ring born ON the press frame at 0.7x button radius, outer to 1.6x then 2.4x, transparent in ~14 f). Six other films explicitly forbid them. Use rings only if the film already speaks in thin accent rings elsewhere. -- *because* a ripple is the stock "click" icon; the target's squash already says it. (M914 vs M930, M931, M939, M942, M953, M956, M959)

**3.5 WHEN you end a CTA-style click** -> **DO** cut at maximum compression or before the release: the last 7 f accelerate (button 0.947 -> 0.74, biggest step on the final frame), one frame of label smear (0.44 W wide) at the press, then cut to the next scene at max velocity; or end 0.11 s (3 f) after the pointer arrives and never show the send. -- *because* the release never happens on screen, so the action transfers to the viewer. (M931, M959, M949, M943)

---

## 4. Typing prompts

*Runtime:* `M.type` also types multi-line and syntax-highlighted code: give the host `<span class>` children and real line breaks and the caret follows the last glyph in 2D (runtime/README.md, Typing). Typed code must still be magnified to >= 0.04 H (hard gate in 1.1).

**4.1 WHEN text is typed in a UI** -> **DO** pick the rate by what the viewer must do with it:

| The viewer must... | Rate | Evidence |
|---|---|---|
| recognise "a person typed a command" | 2.8-3.4 chars/frame at 24-25 fps = ~82-85 chars/s; 68 chars in ~0.8 s, per grapheme in bursts (3/3/4/3) | M914, M919 |
| read the content | 21-24 chars/s, bursty (22 chars in 0.93 s, pauses while something else moves) | M931 |
| see a short result land | burst ~84 chars/s (21 chars in 0.25 s), ~0.5 s stall, second burst | M935 |
| watch a human author a line | ~1 char per frame (30 chars/s) with irregular 1-frame holds, ~40-45 chars/s for 40 chars in ~1 s | M928, M942, M949, M974 |
| see a field fill fast | 2-3 chars/frame (~70 chars/s) | M956 |

-- *because* too slow is boring and too regular reads as a script.

**4.2 WHEN you author the rhythm** -> **DO** write the cadence by hand: 1-frame letter bursts, 6-10 frame pauses after spaces (hold 10 f after the first word, 6 f after the second), skipped intermediate states ("Th" never shown, a two-letter word arriving as 2 letters at once, no lone letter before a pair), gaps of 0.02-0.07 s inside words, ~0.10 s before an ending letter, ~0.20 s before a space, a slower last word (a glyph every 3 f). Keep any deliberate typo. -- *because* metronomic one-character-per-frame typing is the clearest slop tell. (M949, M962, M966, M969)

**4.3 WHEN the caret appears** -> **DO** clear the placeholder, show a lone accent caret 1 f (0.04 s) before the first character, and keep it SOLID and non-blinking while typing and during result bursts. Blink only in a hold after typing, on its own clock (~0.25 s phases, independent of the typing clock; e.g. on 1.4 s, off 0.26 s, on 0.2 s). A big caret (0.008 W x 0.25 H, or a 0.06 W x 0.67 H bar that shrinks every step) may die in 1 frame instead of blinking. -- *because* the cadence tells who is typing; a blink during typing is a UI default. (M914, M919, M923, M935, M956, M968, M969)

**4.4 WHEN the line must stay framed** -> **DO** choose the anchor by text role: composed title text re-centres on every event and the carrier (dot, caret, emblem) follows its live right edge (dot +0.1 W across 18 chars, moving even on space steps); a field's text is left-anchored and the caret follows the last glyph; a numeric field grows LEFT around a stationary caret ($1, $19, $194 ... in gaps of 2-3 f). When erasing, wipe with a clip edge through the glyphs while the line slides (5 f, accelerating) or backspace one letter per step without re-centring survivors. -- *because* it reads as composing now rather than a pre-laid line being revealed. (M962, M969, M923, M968)

**4.5 WHEN the newest glyph needs life** -> **DO** show the leading 1-3 glyphs brighter or in the accent for 1 f then settle (fresh #F5E8FF -> accent, plus ~2 faint ghost glyphs at the leading edge; red for 1 f; violet -> ink over ~17 f). Wave typing: each glyph lives 14 f at 60 fps (~0.23 s), path +25 -> -24 -> 0 px (0.035 H), x slide from +15 px, colour accent -> ink; in a container wider than the frame (1.78 W) whose whole group pans (eased, fastest mid-typing) so controls arrive by pan, not by pop. -- *because* it marks the newest thing without a cursor or a wrap. (M914, M956, M974)

**4.6 WHEN the camera works during typing** -> **DO** step it: drift 1.6 -> 1.5x, then ONE-frame contraction ~0.77 mid-line so the whole input is visible, a fast `M.ease.softLand` return to canonical, then regrow ~1.13x so the send button is big for the click. For a text-only beat, hard-cut the scale (x0.42, then x1.57 of large) on the same frame the copy jumps ahead (a phrase appears at once); never zoom-tween. -- *because* stepping scale converts overflow into a committed line and the eye reads one cut, not two events. (M914, M923, M949)

**4.7 WHEN the placeholder exists** -> **DO** show it grey, clipped by the frame edge or fading in as a whole string (0.15 -> 1.0 over ~6 f); clear it in one frame before the caret appears. Never type placeholder text. (M914, M948, M974)

---

## 5. Toggles, cascades, checklists

**5.1 WHEN a switch flips** -> **DO** 2 frames: knob moves, one pale in-between frame (#CED9DC), full colour; no glow, no bounce, no ring. The flip starts ~1 f after contact, before the press bottoms out; the cursor recoils to 0.92 over 3-5 f and returns to 1.0 in ~10 f. -- *because* sparse cleanliness lets the cascade after it carry the drama. (M933, M935)

**5.2 WHEN one action propagates to a list** -> **DO** start the cascade ~5 f (0.17 s) after the master, 2-3 f per item with uneven gaps (3,2,2,2,2,2 or 3,3,2,2,2,4), 5-7 items, whole wave <= 0.6 s (17 f for 7 rows), each item its own 2-frame flip; or, when the pointer glides over without clicking, begin ~2 f after its peak speed and finish as it stops. -- *because* a wave short enough to hold in working memory reads as one gesture; slower reads as a loading list. (M933, M935)

**5.3 WHEN a wave crosses a 2D grid** -> **DO** origin-first on an orthogonal lattice (5-10 px jitter, never hex/random): the centre rows lead outer rows by 3-6 f (adjacent rows +0.25 s, outer +0.5 s at 24 fps), ~5 f (0.21 s) per column early so the front is convex; the wave's starts span ~1 s; each badge runs avatar -> arc -> ring (about 270 deg, closes, wiggles) -> fill -> slash -> solid disc -> check in ~1.5 s on a 12 fps pose clock while the camera runs 24 fps. -- *because* spreading becomes geometry, and posed items against a smooth camera give craft without noise. (M934)

**5.4 WHEN a checklist shows work** -> **DO** a three-state machine: pending = dashed ring + white text; active = rotating spinner (ring dim, arc bright, 34 px) + GREY text (#808086); done = check + white text. Swap the icon in ONE frame (no scale pop) while the row nudges 14-18 px right and returns over 6-8 f. Cadence ~0.9 s per row (26/26/29 f). Baton: the NEXT row dims and its spinner grows 16 -> 33 px 2-3 f BEFORE the previous check, text brightens ~2 f before its own check, so the list never idles. Rows enter bottom-to-top 2 f apart, whole, sliding ~37 px in ~10 f; each step is a concrete verb plus a number. -- *because* it shows labour in discrete, believable steps. (M913)

---

## 6. Drag and drop

**6.1 WHEN a card is dragged into a field** -> **DO** a reaction stack, earliest first: target grows (box bottom 0.61 -> 0.69 H over ~14 f) and a hover rim (#73C8F2) appears ~0.4 s before the drop; the card rises (0.63 -> 0.37 H, `M.ease.softLand`, ~11 f) with the hand pinned to its top edge, a 2-frame hold at the crest, tilts -8 deg over ~8 f then back to 0 by the drop; the drop is ONE frame (card 0.18 x 0.28 -> a 0.12 square attachment, radius 0.04 -> 0.02, hand -> arrow swap on the same frame, fill flash #DBEBF6); a soft patch slides off by ~7 f; a bottom tint fades by ~0.6 s; the ground cools ~4% across the drag. -- *because* one-frame snap with stacked feedback feels physical. (M931)

**6.2 WHEN a stack drags and drops into an uploader** -> **DO** stack and cursor on their own layer, hold still, fan contracts ~11 f, then travel together ~16 f with a slow start, peak speed mid-way (`M.ease.softInOut`, no overshoot, smear 0.08 W along the travel, -30 deg). No press flash. The drop is cards shrinking to nothing about their own centres in 3 f each with 1-frame stagger and blur up to 10 px; they do not fly to slots; the cursor scales to nothing in place over ~9 f. The next beat (a tile cascade) starts in the same frame range. -- *because* disappearing in place makes the result appear to have been consumed by the target. (M918)

**6.3 WHEN items are collected into a folder** -> **DO** four items from four different edges on ~3 f staggers (one as a huge ~20 px-blurred foreground square), a grab that lifts 0.03 H with no halo, a curved drag while scaling 0.14 -> 0.09 W, the stack hidden by a glass folder lip, folder + cursor vanishing on ONE frame. Then the result may spring (+0.06 H overshoot, thumbnails on 2-frame staggers): this is the film's single overshoot. -- *because* overshoot saved for one payoff reads as reward. (M948)

**6.4 WHEN a card is dragged over another** -> **DO** press 0.72, drag slow-fast-slow with the card painted over its neighbour which slides the other way underneath. (M953)

---

## 7. Cards, carousels, orbits, popups, selection

**7.1 WHEN data cards stack in** -> **DO** one repeatable birth: a 1-frame pale slab with ~25-30 px horizontal blur that grows to 0.5 H over ~14 f (0.47 s) while darkening to the card colour; ~22 f (0.75 s) apart; each front card lasts ~0.8 s then retreats to a rear peek (left edge 0.50, 0.21 W). Give each card one live micro-proof (a gauge to 77% of the arc, only the last digit rolling in a masked slot, a waveform wiping L -> R). Labels sit above, not as tabs. -- *because* repetition becomes rhythm and the micro-proof says "live". (M927)

**7.2 WHEN a list receives a new item at the top** -> **DO** insert the newest as a blank tinted card, fill its text 2-4 f later (whole, one-frame pop), shove older cards in piecewise-linear jumps (the first ~105 px in ONE frame, one true 2-frame hold), add ~0.02 W lateral drift per card. Move DOWN if the previous clip scrolled UP. Exit with a bottom-up wash, then a hard cut. -- *because* jerky, hold-punctuated steps feel like events being processed. (M940)

**7.3 WHEN a row of cards must end on a choice** -> **DO** cards 0.26 W x 0.52 H, pitch 0.27 W; the hero shrinks into the first slot (~14 f); the row slides ~36 f (1.2 s) with peak ~85 px/frame and 25 px smear, `M.ease.softInOut` and NO overshoot; the stop IS the selection (travel of 5 pitches, ~1.35 W; the chosen card ends near centre); it then grows 1.46x over ~23 f, slow start accelerating near the end with a 1-frame 6 px blur, ending mid-ease. -- *because* the stopping point is the answer, so no highlight is needed. (M942)

**7.4 WHEN a selection must reach the form** -> **DO** collapse the chosen card's SURFACE inward around the orb (10 f, box and radius animated) while its children keep size and are cropped by the shrinking rounded mask; shrink the siblings IN PLACE and fade over ~5 f (never slide them off); pull focus on the form by blur 4 -> 0 over ~14 f; fly the orb on a curved path down, left, up for ~24 f (diameter 0.22 W -> 0.036 W, 5 px blur at peak speed, no overshoot) into the form's slot; change the slot's label to the choice. -- *because* one continuous object makes the choice a traceable state change. (M942, M943)

**7.5 WHEN items gather around a mark (orbit)** -> **DO** nine or ten upright items (faces never rotate): nine at 40 deg spacing, or ten of irregular size (0.08 x 0.29 to 0.21 x 0.21, tall ones further out); enter by `M.ease.softLand` convergence (radius 650-800 -> 330-450 px, smear halving every 0.1-0.2 s); radius collapse ~8 f while rotation decelerates 17 -> 10 -> 1 deg/frame; a swell (1.8x for ~4 f) travels AGAINST the orbit with gaps widening 0.07 -> 0.27 s; exit as a clockwise 2-3 f stagger on an expanding orbit; for a hook, fling 7x faster with the headline swelling 1 -> 1.3. A token ring on an ellipse (radii ~0.10 W x 0.15 H, upper tokens smaller) lights each token at its own slot 1-2 f apart. -- *because* irregularity and overlap look photographed, not generated; counter-motion keeps identity. (M941, M945, M956)

**7.6 WHEN you open with a card stack (rolodex)** -> **DO** (signature move, use rarely) two perspective stacks mirrored about the logo (3-5 sheets, outer wider, top photos inverted), on screen at frame 0; flip fast for 3 f, advance slowly ~1.5 s, then spin as one rigid unit (2 -> 4 -> 11 -> 29 -> 74 deg, scale 1 -> 2.0 over 0.7 s, blur to 10 px) and cut while still large. (M941)

**7.7 WHEN a menu or popup opens** -> **DO** height-wipe (0.29 -> 0.41 H in ~4 f), rows to full opacity 1-2 f apart top-down, a divider growing L -> R over ~0.67 s, hover square before the hand lands. Exit by sliding down with the camera and fading only the last 4 f. Never fade the whole panel in. -- *because* staged reveal reads as UI, a fade reads as a slide. (M935)

**7.8 WHEN a card must become a canvas** -> **DO** animate a zoom OUT, not in: the container grows while its header content shrinks (scale 1 -> 0.39, one width overshoot 0.63 -> 1.06 -> 0.82 W), children step in whole 1-2 f apart and are shrunk only by the zoom, and a thin connector draws last. -- *because* the viewer sees a camera, so the content feels spatial. (M939)

---

## 8. Agent work beats

**8.1 WHEN the agent is "thinking"** -> **DO** status text per whole word: blur 12 px and opacity 0.1 -> sharp in 4-5 f, words back-to-back (3 words in 12-15 f), grey ink; then TWO shimmer passes: a masked brighter COPY of the text, band ~0.23 W, 13 f (0.42 s) each with a ~6 f gap, accent hue; no spinner, no dots, never per-character. -- *because* nothing types for the agent and it reads as inference. (M919, M920)

**8.2 WHEN you need an agent marker** -> **DO** one persistent mascot/character: sweep in from beyond the edge with ~25 px smear, decelerate hard, settle; scale with the camera; later drop straight down over ~15 f (slow start, ~100 px smear at burst) leaving a green check where it was; at the end shrink about its fixed centre (0.14 W -> 0.06 W over ~0.6 s), no translation. Never fly in from above, never bounce. -- *because* the viewer tracks the agent's position in the job. (M916, M917, M919, M920)

**8.3 WHEN you show a full agent step** -> **DO** this order: act (send) -> 3 empty frames -> marker arrives -> status words -> shimmer x2 -> the user's prompt returns as a right-aligned bubble (opacity 0.2 -> 1 in ~0.4 s, text NOT shrunk) -> L -> R wipe of the status (~5 f) + a check drawn on (~2-3 f) -> result status (smaller, 40 px vs 80 px as the camera pulls back) -> result cards at near full size 2 f apart with footage playing and a warm bloom -> layout scrolls up 0.04 H accelerating -> next status begins and stays unresolved at the cut. -- *because* every beat answers the previous one and the last never settles. (M919)

**8.4 WHEN colour is spent** -> **DO** one hue for "the machine is acting" (typing, scan, sweep, shimmer, halo) and a second signal (green) ONLY for "done"; never on the same object at once. (M913, M914, M916, M919, M920)

**8.5 WHEN you must show "a lot of work"** -> **DO** at least three items in progress at once, about 0.9 s per step, a concrete verb plus a number per row, completion releasing the camera (1.2). For logs: start fully populated and moving (frame 0), accelerate scroll (section 10), let new system events step in whole. -- *because* volume and specificity read as competence. (M913, M939)

---

## 9. Phone and device

**9.1 WHEN a 3D phone is the hero** -> **DO** crop it (top corners off-frame, bottom ~0.97 H, screen ~0.39 W), start at yaw -54 / x-tilt 29 / roll 11 and reach -9 / 24 / 2 in SIX held poses inside 0.4 s (0.03, 0.07, 0.10, 0.20, 0.30, 0.40 s, each reached in 1 f and held 1-2) under ~1870 px perspective, scale 0.79 -> 0.95, visible side thickness 0.05 W -> 0.01 W early, then a mild drift. All screen UI is one perspective plane. Headline BEHIND the device, a large sparkle IN FRONT of its corner; no drop shadow. -- *because* held poses with thickness look photographed; a CSS tilt looks flat. (M955)

**9.2 WHEN you can't render 3D** -> **DO** fake depth with stepped 2D camera jumps (jumps at 4, 6, 7 f, held 2 f each, a gentle enlarge to ~1.8x, a dive in held steps 3, 2, 2, 7 f long) plus a separate parallax star layer drifting ~0.07 H per frame; or keep the phone flat and rim-lit (a 2-4 px accent edge) and move the camera: cut in at 0.9 W with the lower half out of frame, pan, whip, zoom. -- *because* the camera, not the object, supplies the 3D. (M957, M922)

**9.3 WHEN there is no pointer** -> **DO** an eye carrier: a shaded 0.04 W bead riding the device rim during the camera move, growing x1.5-2.2 per 3 f into the next scene, finally a disk 17x larger that becomes the new (white) ground. Light/dark flips come from a growing object, never an opacity flash. (M922)

**9.4 WHEN the window must "land" then give way to titles** -> **DO** open from a 0.10 W slit with top and bottom fixed and contents cropped, never stretched; hold, then +0.22 W in ONE frame; panel and gallery rise on two slightly different tracks (16 px smear); a logo disc docks 0.10 -> 0.04 W with 20 px smear at peak; then tip the window back over ~34 f (top 0.11 -> 0.46 H, sides splay, lower half off-frame) and drift ~4 px for 2 s as a plinth under the headline. End on an accelerating roll to -76 deg (22/18 px smear) with no settle. (M944)

**9.5 WHEN a phone or notification must be rebuilt** (the real UI cannot be captured) -> **DO** use `runtime/native-ui/` (`NativeUI.phone`, `lockScreen`, `notification`, `banner`, `list`, `tabBar`, `appScreen`; `NativeUI.arrive` for the roll-up and `NativeUI.macro` for the camera push that makes it readable; API in `runtime/README.md` "Phone UI", reference `examples/phone/index.html`); a physically rendered device is `M.hero3d` with `kind: 'phone'` (README "3D"). A real screenshot always wins over a rebuild. -- *because* true-proportion furniture with real identity (icon, sender, time, sentence) is what separates a phone UI from a mock-up.

---

## 10. Dense scrolls and logs

**10.1 WHEN a long chat or log proves volume** -> **DO** start fully populated and already moving, one group y, no blur: ~6 px/frame early accelerating continuously to ~250 px/frame (0.35 H per frame) over ~55 f (1.84 s). The first 0.4 s moves only ~0.07 H. Let the viewport run EMPTY after the last block; do not fill it. Decelerate over ~9 f onto a short, large, readable list (8 lines at y 0.14-0.45) and hold it still 0.8 s (24 f). New system events step in whole, then ride the scroll. -- *because* speed and mass read as competence and the single legible landing is the payoff. (M939)

**10.2 WHEN content passes too fast to read** -> **DO** make blocks of distinct silhouette (table card, one tall red/green diff card ~0.49 H, green chips) at 9-14 px text; keep ONE landmark. -- *because* shapes keep rhythm when words can't. (M939)

**10.3 WHEN wiping between UI scenes** -> **DO** a feathered mask (0.31-0.42 of the axis, 0.56-0.6 s) painted in the NEXT scene's ground, start it 0.1-0.2 s before the voice line ends, enter the next hero (6 px blur) 0.1 s before the wipe completes, rotate directions R -> L, B -> T. Hard cut only when the incoming scene is empty or a single UI frame. (M939, M940)

---

## 11. Counters inside UI

**11.1 WHEN a control moves numbers** -> **DO** drive several numbers off one handle, updating EVERY frame on `M.ease.softInOut` with no overshoot ($60 -> $193 limit, 161 -> 493 amount, 69 -> 100%, profit $9.6k -> $32.1k in ~50 f at 60 fps, all in the same ~0.83 s as a 1.69x -> 1.0 zoom). -- *because* four numbers off one handle shows causality without text. (M923)

**11.2 WHEN numbers have to feel real** -> **DO** end product fields on un-round values ($194.67, 522.14, 119, 112/500); end hero claims on round values (100.00, 10%). Skip values (a 2,3,4,6,7,8,9,10 percent sequence omits 5), hold 1-3 f per value, step sizes decaying toward ~0.07 so it lands rather than stops (15-23 steps in 0.5-0.9 s). Never tween digits. -- *because* uneven steps look measured; smooth rolls look like a preset. (M923, M954, M955, M958)

**11.3 WHEN a counter is the finale** -> **DO** decelerate (about 3 pts/frame at 60 fps to 0.5), park on 99 for ~5 f (~0.1 s), land 100 with no flash and keep scaling the whole card (0.43 -> 0.89 W) through the last frame. For a hero number, defocus only its edge glyphs (~12 px on "$" and the last digit) while the centre stays sharp. (M924, M954)

**11.4 WHEN a timecode or scrubber is on screen** -> **DO** let it creep sub-pixel (never tick), so a 0.6 s hold stays alive. (M913)

---

## 12. Demo beat recipes (30 fps frame timelines)

Each is a mechanic, not a film; swap content and scale, and choose the film shape first (section 0.5). Frames are relative to the start of the recipe (f0). Convert source timing at 24/25 fps by x1.2/x1.25.

### Recipe A: prompt -> send -> agent result (~205 f, 6.8 s). Evidence M914, M919, M969. Use only when the product is typed into (section 0.5).
1. f0: hard cut into the prompt card at 1.6x, already moving: 105 px gone on frame 1, 72% of the slide done by f5, tail to ~f15 (`M.ease.snapSettle`). Placeholder grey, clipped at the edge.
2. f2-f16: cursor enters from bottom-right on a decelerating curve (first step ~0.06 W), heading rotating, parks on the field at f16.
3. f14: placeholder clears. f15: lone solid accent caret. f16-f40: type ~68 chars in ~24 f (~85 chars/s), per grapheme, leading glyph brighter with 1-2 ghosts.
4. f34: ONE-frame camera contraction x0.77, ease-out tail ~9 f. f40: typing ends, caret begins its own blink clock.
5. f40-f61: cursor loops BELOW the card (~21 f curved path, heading -20 -> -195 deg) to the send button; camera regrows to ~1.13x f55-f70; cursor parks f61-f75 (15 f).
6. f76-f81 press: f76 cursor 0.81; f77 cursor 0.71; f78 cursor 0.88 + button 0.86; f79 cursor 1.0 + button 0.80; f80 button 0.93; f81 button 1.0. (No ring. Optional: accent rings only if the film uses them, 14 f.)
7. f82-f87: hold 6 f. f88-f98: box + button + cursor slide left together, accelerating, smear 20 -> 140 px. f98-f101: 3 empty frames.
8. f102: marker sweeps in from the right (25 px smear), decelerates, settles by f115. f117-f132: status words blur in, 5 f each.
9. f132-f145 shimmer pass 1; f151-f164 shimmer pass 2. f165: the prompt returns as a right bubble (opacity 0.2 -> 1 by f177).
10. f170-f175: status wipes L -> R; green check draws f173-f176. f175-f190: marker drops straight down (burst ~f185, smear ~100 px).
11. f178-f190: the result status blurs in per word at half size. f191: first result card at near full size; f193 second; footage playing, 20 px warm bloom.
12. f195-f205: layout scrolls up 0.04 H accelerating. Cut here; next status starts unresolved.

### Recipe B: toggle -> cascade -> claim (~175 f, 5.8 s). Evidence M933, M935.
1. f0: card already mid-open; rows fade in top-down 1 f apart (full by ~f10); divider grows from the centre.
2. f4-f30: glove enters lower right (0.96, 0.78): first step ~0.06 W, long `M.ease.softLand`, tilt ~30 deg straightening, no smear, lands on the master switch (0.87, 0.26) at f30.
3. f30-f33: hover (3 f). f34-f40: press (tip down 0.03 H).
4. f35: master flips: f35 knob moves, f36 pale frame, f37 full blue. f42-f50: cursor recoil 0.92 and back to 1.0.
5. f44, f48, f51, f54, f57, f59, f61: seven rows flip (uneven gaps 4,3,3,3,2,2), each three frames knob -> pale -> colour. Cascade total 17 f, ~0.8 s after the click.
6. f70-f107: card slides and shrinks (scale 1 -> 0.6; 27% of travel in the first 14 f, 42% in the next 3-4 f, a ~21 f tail; keep ~0.2 W of its edge on screen). The cursor leaves in parallel, curving up-right, rotating 0 -> 45 deg, edge-cropped by f78, gone by f80.
7. f88-f92: claim line 1 fades 0.3 -> 1.0 in 4-5 f while gliding x 0.58 -> 0.29 over ~18 f and shrinking 0.078 -> 0.065 H. f99: line 2 starts and glides x 0.34 -> 0.29.
8. f103-f125: key-word loop emerges from under the card edge (9 held poses at 2-3 f), closes into a lopsided oval around the key words; hold ~0.7 s (f125-f146).
9. f130-f157: result badges grow 45 -> 100% over 8 f, glyph lagging 1 f, onsets 2 f apart down each column, second column offset ~8 f (a diagonal ripple). f165-f175: lines drift up 0.025 H, line 1 fades; end mid-fade on a hard cut.

### Recipe C: drag -> drop -> output cascade -> headline (~135 f, 4.5 s). Evidence M918, M931.
1. f0-f10: stack and cursor held still on their own layer. f10-f21: fan contracts. f24-f40: stack + cursor travel together on a straight diagonal, slow start, peak speed f31, smear 0.08 W along -30 deg (shoulders f30, f33, gone by f37).
2. f46-f50: four cards each shrink to nothing about their own centres in 3-4 f, 1-2 f apart, blur to 10 px. f51-f60: cursor scales to nothing in place. f50-f56: a one-word status fades in; out f70-f75.
3. f50-f64: 13 tiles pop in place, ~1 per frame (5+5+3), each 0 -> 1.12 (by +8 f) -> 1.0 (by +13 f) with 3-4 px blur clearing by +10 f. No slide.
4. f79-f100: rack focus: UI blur 0.7 -> 5.5 -> 10 -> 11 px with ~0.1 darkening while the camera zooms out fast.
5. f81, f85, f88, f90: four headline words land (gaps 4,3,3 f), each with a 1-frame horizontal smear of 0.03-0.04 W, the whole line starting at 1.39x clipped at the left and shrinking to 1.0x by f96; headline NEVER blurred. Settles to 0.74 W by ~f135. Cut mid-zoom.

### Recipe D: checklist -> reveal (~165 f, 5.5 s). Evidence M913.
1. f0: card at 3.3x on screen, top row already active. Rows 2 and 3 enter at f2 and f4, each sliding ~37 px in ~10 f; the card slides x 0.26 -> 0.12 with 70% of travel in 5 f.
2. f0: row 1 spinner running, text grey. f23-f28: row 2 dims and its spinner grows 16 -> 33 px. f24: row 1 text brightens. f26: row 1 check (one-frame swap, row nudges 15 px, returns by f34).
3. f49-f54: same overlap for row 3. f53: row 2 check. f79: row 3 text brightens. f82: row 3 check (mid-move, see 5).
4. f76-f90: the editor fades up behind the card; camera starts to pull back, scale 3.31 -> 3.01 (slow then accelerating).
5. f94: ONE-frame snap: scale 2.50 -> 1.41 (44% in 1 f). f95-f112: decelerating settle to 1.0.
6. f102-f114: five chips pop L -> R 2 f apart, small -> full in 2 f, whole text. f104-f120: a cyan band scans down the portrait (forehead f108, mouth f111, chest f114) and merges into a permanent bottom wash.
7. f120-f122: 2-frame push-in 1.06 -> 1.30, decaying to 1.37 by f132. f132-f150: hold with only a sub-pixel scrubber creep (18 f). f150-f166: accelerating left pan, ends hard.

### Recipe E: select from carousel -> commit into a form (~270 f, 9 s; two clips). Evidence M942, M943.
1. f0-f30: prompt card present, ~1 grapheme/f typing, no caret. f24-f60: card enlarges with ~1 deg rotateY and type 22 -> 28 px.
2. f25: cursor enters from (0.38, 0.94) with a 1-frame 20 px smear; asymptotic decay (85% in ~21 f), creeps to f61.
3. f65: target avatar compresses 48 -> 37 px (0.77), cursor dips; f66: release. The orb leaves the badge, grows to 0.25 x 0.47 W/H over 9 f (15 px blur at peak f70, sharp by f75). Background defocus 3 -> 4 px, cursor blurs with it.
4. f74-f88: a shell unfolds behind the fixed orb (rim -> blur blob -> card; radius circle -> 32 px). f90-f104: hero shrinks into the first card slot.
5. f90-f126: the row slides (peak ~85 px/f f100-f114, 25 px smear, `M.ease.softInOut`, no overshoot); it stops on the chosen card near centre. f126-f149: chosen card grows 1.46x, ends mid-ease. [clip cut]
6. f0-f10 (clip 2): same frame: chosen card at full size, prompt blurred 4 px, cursor parked behind a sibling. f10-f20: card surface collapses around the orb (0.36 W x 0.74 H -> 0.15 W x 0.31 H), children cropped, text fades; siblings shrink in place f16-f24.
7. f20-f34: prompt blur 4 -> 0. f26-f50: orb flies down, left, up (lowest point ~f38 at y 0.73; diameter .22 W -> .036 W; 5 px blur peak ~f37), lands in the form slot; slot label changes to the choice. Hold docked ~f50-f81.
8. f54-f81: cursor sweep along an arc to y 0.87 (peak ~80 px/f f60-f61, 20-25 px one-sided smear, 20 deg lean).
9. f82: ONE frame at 50% double exposure; f83: 2.33x close-up, cursor scaled only 1.5x; cursor glides f83-f110 and parks.
10. f112-f116: violet shadow grows to ~22 px on the card's bottom and right. f113-f117: press: cursor 1.5x -> 1.32x, button 0.97, label greys. f117-f122: 5-frame burst (width x2.2, blur 3 -> 25 px). Cut mid-burst.

---

## 13. Slop tells for this topic

| AI default | Pro decision |
|---|---|
| Demonstrate three features in a row, each in its own card | One specific case with stakes, from trigger to result (0.1) |
| Fill the UI with "Project Alpha", lorem ipsum, a stock name, "Good morning" and a status dot | The real sender, icon, time and sentence from the capture; specific, slightly odd, well-designed content (0.2, brand.md section 3) |
| Show the product thinking as an orb, sparkles, a neural net or scrambled glyphs | An object from the customer's world, or the real log (0.3) |
| Caption the capability in type over a thumbnail | Show the consequence: the line crosses, the alert fires (0.4) |
| Make every film "prompt box + send arrow + cursor click" | A recipe only when the product is typed into; otherwise another shape (0.5, director.md section 3a) |
| Leave a small card (0.3 W) in an empty ground as the proof, or show code and result as two equal panels | One object per frame at >= 0.55 W with text >= 0.04 H, in a world (1.1 hard gate G1) |
| Show the whole app window with a title bar and traffic lights | Crop one object at 1.4-4.4x and reveal the product by pull-back (1.1, 1.2) |
| Smooth ease-out zoom into the UI | One-frame snap 0.56-0.77 plus a 9-18 f tail; 2-frame push, 18 f hold, hard-ending pan (1.2) |
| Different cameras on each card | One camera group; background fixed (1.3) |
| Cursor is the OS arrow, switches to a hand and an I-beam | Custom, one family per film; pose swaps only in a declared pose film (2.1) |
| Cursor lands at final size with a gentle ease | 1.5-5x oversize, scale about the tip, ~60% in frame 1, 0.5-0.9 s creep (2.2) |
| Straight line path at constant speed | Curve with heading rotation, arc dips, 2-frame decay steps (2.3) |
| Click and hover at the moment of arrival | Park 2-15 f, finish the camera zoom first, then press (2.4) |
| Click shows a ripple ring | Press 0.71-0.9, target 0.63-0.81 one frame later, colour step (3.1-3.4) |
| Release animation is shown | Cut at max compression / before release (3.5) |
| Typing at one speed with a blinking caret | Authored rhythm, solid caret while typing, rate matched to the viewer's task (4.1-4.3) |
| Placeholder text typed in | Placeholder clears in a frame, lone caret appears first (4.7) |
| Toggle tweens with a long ease and glow | 2 f: knob, pale frame, colour (5.1) |
| Cascade at a uniform 0.1 s stagger | Uneven 2-3 f gaps, convex wave, origin first (5.2, 5.3) |
| Checklist ticks all at once with a bouncy check | Three-state machine, one-frame icon swap, baton overlap, ~0.9 s per row (5.4) |
| Dragged card flies to its slot | Target reacts early; the drop is one frame; cards vanish in place (6.1, 6.2) |
| "Loading..." spinner | Per-word blur-in status, two shimmer passes, wipe to a check (8.1, 8.3) |
| Mascot floats in from above and bounces | One marker, sweeps in from the side, drops straight down, never bounces (8.2) |
| Phone tilted 15 deg with a drop shadow | Cropped, six held poses with visible thickness, headline behind (9.1) |
| Chat scrolls at constant speed with motion blur | Accelerates 6 -> 250 px/frame, no blur, empty viewport, 0.8 s landing hold (10.1) |
| Counts every number up linearly with a round end | One value per frame, decaying steps, skips, un-round product values (11.2) |
| Static thumbnails in "output" cards | Live footage inside, warm bloom, static stats (1.8) |
| Backdrop UI blurred to mush at 20 px | 4 px (readable) or 7-15 px (non-hero), cap 11 px behind a headline (1.6) |
