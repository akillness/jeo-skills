# Judgment: what good is, and when the "slop" thing is right

Craft (curves, coordinates, sizes) is in the other references and decides HOW. This file decides WHAT is worth making. It comes from ~50 designer-made films, ~30 AI-made ones, 52 ranked human films, the user's own picks and rejections (`taste/verdicts.md`) and the before/after fixes in `taste/edits.md`. In the whole study the tools were the same everywhere (push-ins, cursors, typed text, gradients, 3D). What separated films was a decision about meaning. Examples are described, not named: borrow the reasoning, never the look.

Nothing here is a rule you pass. If you have a better reason you have a better film, but you must be able to say the reason in one sentence about THIS brand.

## 1. The eight judgments

Each: when, prefer, because, evidence, and where it stops being true.

**1. The idea belongs to the brand.** WHEN you look for the film's idea, look at what the brand already owns before inventing: logo shape, core control, signature material, key verb, success moment, voice. PREFER the moment its own shape turns into the product's action. BECAUSE that is what the viewer cannot get from a competitor.
- Evidence: a launchpad's pill icon was the same shape as its currency toggle, so the logo became the switch; a chain-link icon split into its logo's two strokes; a bot logo's two highlights became its eyes (8 of 10, among the top human films); a counting app's receipt became the fifth stroke of a tally mark (best AI idea in one re-analysis). In every film that scored, the best moment was brand inventory turning into the product's action.
- The losers took the name's first association: a name that suggests stars became stars, a name that suggests fire became an orange glow. Hollow-but-correct films lost 41-56 and 44-57 to a film that simply used the brand's own launch picture.
- Test: cover the logo, then swap in a competitor's. If the film still works, it is the category's film.
- Fails when the "asset" is forced. A pun on the name is the weakest ownership; material, behaviour and voice are the strongest. Invent the surroundings (stage, camera, light, metaphor) and keep the product literal (real UI, logo, typeface, copy). A film that invents everything has nothing of the brand at a visible size. With no brand, decide one on purpose and write the reason (one hue family tied to the audience, one type family tied to the voice, one material, one behaviour); never the category costume.

**2. The viewer watches something happen.** WHEN copy names a capability, let the viewer watch its consequence. PREFER one specific case with stakes, real content, proof before claim. BECAUSE a claim in type is a caption and a result on screen is evidence. Sections 2 to 4 below carry the detail.
- Evidence: a price line crosses $98.50 and a real notification fires; a toggle replaces the verb "complete" and flips to DONE; a CI run goes red at 03:12 and green at 03:14. The weakest films stated claims over thumbnails at 3 percent of frame height.
- Fails when invented specifics are presented as real. Illustrative content is fine if it is plausible and declared in NOTE.md (never as an on-screen disclaimer).

**3. Every beat causes the next.** WHEN you leave a scene, turn the current object into the next one. PREFER the interface's own gestures as joints: a click that floods the frame, a caret that becomes a number, a sentence that becomes an input, a dock icon that becomes the next ground. BECAUSE a film of motivated joints reads as edited and a film of resets reads as a slideshow.
- Evidence: the user's own verdict, "joints that each had a physical cause beat films of repeating cards"; the thread objects in the best films (a dot through six scenes, a stroke, a "$42"); hard cuts landed on motion with the object position-matched (M916 hides a theme flip in a 4-frame flat dip while the pill's slide carries across; M966/M969 contract the old container and replace it outright).
- Fails when the carrier is the idea's costume: a pinned pill, a dot that becomes the logo by default. A carrier is optional, travels at every seam and never sits at fixed coordinates across more than two shots. A hard cut is a decision with a meaning (new task, punchline, contrast), not a rest.

**4. Emphasis is spent, not spread.** WHEN you size, colour, speed or silence something, ask what it means that this thing is special. PREFER two sizes doing the work (huge for the one word that matters, small for everything between) and one lit thing per frame. BECAUSE "this is a big one" set in the smallest type, then "MORE." enormous, is how it would be said.
- Evidence: the top-anchored human film (9 of 10) is a still picture 55 percent of the time and sets its biggest aside in its smallest type. Human films' mean motion median is 6.8 (IQR 4.4-9.8); the with-skill AI films ran 11.7, above the human 75th percentile, and the user picked the calm film in one round (u5).
- The importance budget (section 5) and "spend scale once": endings usually get smaller; a small mark after a full-frame climax reads as confidence.
- Fails when everything is the exception: giant type everywhere (TYPE-SCALE 9 in 18 of 21 direction files), energy 7-8 in 21 of 21.

**5. Time breathes.** WHEN something matters, hold before it: stillness or silence is what makes an arrival land. PREFER reading to take exactly its time (1-3 display words 0.5-1 s, a sentence 1.5-2 s, never a paragraph) and the film to stop before the idea is exhausted. BECAUSE a film that never stops has nowhere for anything to land.
- Evidence: measured music dips of 8-15 dB before the major transformation in several human films; the tightest films were 15-20 s, the 40-90 s ones each repeated one device or ended twice; 22 of 51 gold films end calmly. No-skill AI films that froze 8 s of 15 were the worst.
- Reconciled with "no dead frame": a held frame keeps one living thing (drift, caret, light, a breath of sound). A designed breath of 0.6-1.5 s before a payoff, with a stated reason, is good. An undesigned freeze (a v1 dictation-app test: 0.9 s unchanged while a card waited; 7 s on one card) is a fail. look.py prints the human band as a question.
- Fails when "breath" is a euphemism for empty (a v1 music-app film: 67 percent still, a small UI on black for 4 s, a 3.8 s logo hold; judged "restraint pushed into emptiness").

**6. It sounds like the brand.** WHEN you write words or score, ask how this brand would say or play it. PREFER real phrasing, sentence case, an aside; phrase-level sound (a section change where the picture changes, silence before the hit, 1-3 hand-placed hits). BECAUSE copy and sound are where templates are recognised fastest.
- Evidence: the no-skill copy was often the best part of AI films ("We were done before the logo was."), and v1's rules silenced the writer; official launch lines beat stock ones 7 to 4; music that ignored the edit scored 5 against 7.
- Details in `idea.md` (copy voice) and `sound-sync.md`. Measured delivery band: about -14 LUFS integrated, true peak at or under -1 dBTP, a small loudness range.

**7. One world.** WHEN you invent anything, draw it in the brand's grammar (its corner radius, stroke weight, type, colour meanings, pace) and under one light logic, one lens, one rendering style. PREFER a world with ground, light, depth and texture over a swatch. BECAUSE assets in four styles (flat icon, stock 3D, photo, glass) read as stock however polished each is, and blur, grain, aberration and bloom belong to the camera, so they apply consistently and appear with motion.
- Evidence: "Left is better in everyone": photographic plates, a paper ground, a 3D object, real shutter blur and designed sound beat the same films in flat silent vector (v2 over v1, three reels). Six of ten no-skill AI films sat on near-black; under a third of human films did and 22 of 52 were bright. A light ground is as premium as a dark one.
- Details and tools in `world.md`.

**8. Made with ambition.** WHEN the idea is chosen, the hero moment gets your hardest work (real 3D, a shader, a dense composition, a physical simulation, an image plate you generated for a missing surface). PREFER one focal point inside a built world. BECAUSE restraint decides where emphasis goes; it is not doing less. "It should have more stuff than this, but it should use the animations, the fonts, the logos." (user, `verdicts.md`).
- Evidence: a music-app round 1 to round 2 correction (v1 had no tells but looked unfinished; v2 with real covers, silence until the click and -14 LUFS had 29 percent still); a ring-logo test (the ring logo as a jar, real brand type, a coded score, 54 percent still) over slides at 91 percent still with invented stats.
- Fails when richness is clutter (the user picked a calm legible film once). One focal point, many layers.
- A small UI on a black void, long empty holds and a lone logo is not taste; it is the minimalist default.

## 2. Consequence over claim

WHEN the copy names a capability, replace the adjective with its result.
- Not "smart alerts": the user types "ping me near $98", a line crosses $98.50, a notification fires. Not "aligned": a cursor drags the wrong-order word into place. Not "private": a coin is scanned into a ghost of dots. Not "500 videos": a grid of hundreds that keeps flowing.
- Strongest: the product performs INSIDE the sentence. A toggle replaces the verb "complete" and switches to DONE; a prompt box opens in the gap between two words of the headline.
- A claim with its proof: proof first, then the claim ("Launch in one day" after the setup flow ran). A number is a graphic only when it is real and the film makes you feel its size. "10x faster" with nothing to back it is weak at any scale. Counters follow a cause (the control that triggers them), and land on a round value for a claim, a specific un-round value for a data field so the screen feels real (M954, M955, M958).
- When the product "thinks", show an object from the customer's world (a wok for a food-ordering agent, the real agent log), never an AI symbol: no orbs, sparkles, neural nets, glowing brains, scrambled-glyph text.
- When you follow a case, follow one with stakes: one trade, one lead from discovery to the team chat, one shop built from one prompt.

## 3. Act out meaning on the type

WHEN a key word has a physical meaning, make the word do it. A bar slices "splitting" apart; "with leverage" widens its own letter-spacing; "more expensive" tightens; a word too big for the frame makes the camera pan across it; in "we draw attention to something important" every word leaves except "important". The viewer gets it before they read it. Cost: one beat of design. Condition: only for the one word that carries the film; once per film.

## 4. Specific, real content

Specific, slightly odd, well-designed demo content (a shop for vintage Japanese postage stamps, microgenres like "Solarpunk") is the cheapest proof the product is real. "Project Alpha", "Your Brand Here", lorem ipsum, a sender "Name" with the subject "Re: Update" prove the opposite. Order of preference: real captured copy and screens; real-looking specifics you declare as illustrative; an honest abstract idea. Never invent stats, users, testimonials, partners, songs or UI and present them as real. The feature is introduced where the user will meet it (a tab typing itself into the real nav; the camera pushing into the real "Share as template" button until it is the headline) rather than described.

## 5. The importance budget

Every line or beat gets a number before design: 1 connective (fast, small, a cut or word swap), 2 supporting, 3 the point (slower, larger, held to reading time plus 0.5-1 s, its own sound). At most 25 percent of beats are 3. Animating every line the same is the number one AI tell. When a line has a number, the number is the hero at 2x scale contrast or more; emphasise by scale, then colour, then isolation (weight last); when two elements fight, apply via negativa and delete one. The 60/30/10 colour split: the accent marks the one thing that matters, and it keeps one meaning ("AI acting", "on", "done"). Colour reports state changes (blue = speaking, red = falling, green = solved); ration the brand colour so it arrives as the brand; treat it as light more often than paint; never place it on a word because of its position.

## 6. Honest seeing

You can't hear or feel a film, but you can look. v1 failed most when it ticked its own checklist. Order:
1. Is there a film in this file (G0), and one frame worth a screenshot?
2. Describe every sheet frame in one sentence: what is on screen, what is the hero, would it pass as a slide.
3. Thumbnail test (can you tell whose and what at sheet size?), cover test (cover the logo), mid-change frames (`mid.jpg`: broken half-words, collisions, ghosts), real speed (reading time against on-screen time).
4. Fix in this order: anything untrue or broken; the idea and what the viewer must understand; connections between beats; hierarchy and scale; timing; surface and finish; sound polish. Two or three honest passes beat ten cosmetic ones.
5. Describe what you checked, quote the numbers the scripts printed, say what you'd still improve. Never certify your own film as good; only the user decides taste (`blind_review.py`).
A 15 s black render was once certified "VERIFIED / CLEAN" by its agent. That is why gates are computed on the render.

## 7. The default mind

Slop is what comes out when no decision was made. Notice these in your plan and in the render. None is banned; each is fine if you chose it for a reason you can say in one sentence about this brand.

| # | The reach | Notice-it question |
|---|---|---|
| 1 | A page, not a picture: left headline + sub-line + phone; centred title + subtitle; content swapped into slots | Would this frame work as a slide or a website hero? |
| 2 | Showing everything: every feature gets a beat, equal weight | What is the ONE thing? What did I leave out on purpose? |
| 3 | States, not events: things fade in and hold | What moves, what does it cause, what does the viewer see change? |
| 4 | Premium pastiche: near-black, radial glow, gold/coral spark, serif-italic accent, tracked small caps | Is the ground dark because the brand is, or because dark feels expensive? |
| 5 | Production metadata as decoration: HUD corners, "BAR 1/8", "01 / 04", versions, disclaimers | Does the viewer need this to follow the film? (They never do.) |
| 6 | Invented proof: stat walls, unsourced counters, skeleton bars, redrawn logo, emoji icons, "Good morning" cards | Is every number, name, UI string real or declared illustrative? |
| 7 | The name's first association (a star-like name to stars, a fire-like name to glow, launch to rocket, security to shield) | What was my first idea? Did I generate two others of a different kind? |
| 8 | Effects as quality: a new technique every beat | Which effect does the idea need? Delete the rest. |
| 9 | A script with illustrations: a picture under each noun | Does the picture have its own job apart from the sentence? |
| 10 | Sound as wallpaper: a loop at one level, an onset every half second, or silence by default | Where does it breathe, where does it hit, where does it leave? |
| 11 | The ending as a web footer: logo + tagline + pill + URL, held | Does the ending land once, quietly, and end? |
| 12 | Minimalism as a hiding place: a small UI on black, long holds, a lone logo | Is it empty because the idea wants silence, or because I didn't build the world? Where is the screenshot frame? |

The over-designed house style (what models do when told "don't make slides, be bold"): a giant word cropped off the frame, in every film; the repeated-word marquee; texture, video or gradient filling the letters; a colour flood or circle wipe between beats; a small dot that becomes the logo's dot or full stop; a text strip sandwiched between texture rows; everything always moving with holds forbidden; every film a chain of "X becomes Y becomes the logo". Measured in the 21-direction study: giant cropped word 20 of 21, material inside the letters 17, flood or circle wipe 19, dot-to-logo 11, lockup built from the motif 21. Eight brands read as one designer's reel in eight colourways. Each move is legitimate when it IS the idea for this brand. As proof of effort it is the new slop.

Self-check: with the logo and colour swapped, is this the same film I'd make for another brand? Which of my choices did I decide, and which did I reach for?

## 8. When the slop thing is right

Taste is conditional. Everything AI films overuse was used well somewhere in the study, under a condition.

| Usually a tell | Works when |
|---|---|
| Typewriter text with a caret | The product IS something you type into, or the caret becomes something (a divider, a letter of the logo, the UI). Fails as a reveal style on every line and on a headline. |
| Centred still end card | It follows sustained motion and echoes the opening; the logo arrived by cause, not a fade. Short (0.6-1.4 s). |
| Soft gradient or glow | It is the brand's own material, a named object with a job, or one light source that changes with the mood. Never the same floor glow under every scene. |
| Serif in a sans film | It is the brand's own face, or a deliberate second voice (the brand speaking against the UI), used rarely and large. |
| Dissolve, blur transition | The blur copies a real gesture (focus pull, scroll, whip) with a direction, or the dissolve IS the meaning (private = dissolving). Calm brands may fade. |
| Hard colour flips | The colour change is the story beat and an object carries across the cut. |
| Slide grammar (centred line, flat field, cuts) | Paced to a voice at speech rate, the type never changes position, and a second visual voice adds wit. Never as a page. |
| Mostly empty frame, small text | Exactly one subject, something leads the eye (cursor, voice, eyes), and it lasts under ~1.5 s; not at phone size. |
| A number counting up | The number is the real offer and its size is the point, tied to a cause. |
| Template moves | Deliberate quotation (satire): bland visuals against loaded copy is the joke. |
| Low frame rate, no blur | Used consistently as a chosen texture. |
| Monospace headline | It does a job (reads like a bill or a log) and gives way to the brand font when the product arrives. |
| A fade to black, a dead calm ending | The brand is calm and the film breathes throughout; 22 of 51 gold films end calmly. |
