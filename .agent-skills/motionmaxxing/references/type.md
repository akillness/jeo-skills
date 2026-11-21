# type.md: kinetic typography

See also: layout.md section 4 (type sizes by role) and section 0 (page chrome, no labels or kickers), motion.md (eases, smear, clocks), ui-demo.md (typing inside UI; the case), close.md (wordmark endings), sound-sync.md (cutting words to a voice), idea.md (metaphor bank for abstract words), judgment.md (scale is intonation), slop.md (copy and type patterns).

How words enter, hold, change and leave in a launch/explainer film, measured from 53 moments (IDs M913-M974). Use it to pick the entry mechanic for a line, set its timing, and decide how long it must stay readable. Placement and sizes are in layout.md; endings are in close.md.

Conventions. Time as `s (f@30)` (1 f@30 = 0.033 s; 2 f = 0.067; 3 f = 0.10; 5 f = 0.167; 6 f = 0.20; 10 f = 0.33). Source frame rates differ (24/25/29.97/30/60) so numbers are converted; where the source gave frames, the source fps is noted. Sizes in % of H (em). Rule format: **WHEN** situation -> **DO** decision -- *because* effect (evidence IDs). PRACTICE = extrapolation not in the sample.

---

## 0. Meaning on the word, and the voice of the copy

Sections 1-12 are mechanics: how words enter, move and leave. This section decides what a word should *do*. It is the difference between a film that sets type and a film that performs it.

### 0.1 Act out the meaning on the word

**WHEN** a key word has a physical meaning **DO** act it out on the type itself, so the viewer understands before they finish reading **because** a word that does what it says needs no explanation and cannot be mistaken for a slide. Examples to borrow the reasoning from, not the look:
- a bar slices the word "splitting" in two; the word "with leverage" widens its own letter-spacing; "more expensive" tightens; "heavier" sags under a weight;
- in a sentence like "we draw attention to something important", every word leaves except "important", which stays and scales;
- a word too big for the frame, so the camera has to pan across it to read it;
- the product performs *inside* the sentence: a toggle replaces the verb "complete" and flips to DONE; a prompt box opens in the gap between two words of the headline; a cursor drags a misplaced word into its place.
Use the film's one motion grammar and clock (director.md section 4) so the performance looks like the same hand, and do it for the one or two words that matter, not every line (the importance budget, director.md section 0).

**WHEN** the line names an abstract thing (a number of users, privacy, speed, "the top 1%") **DO** turn it into an object or quantity the viewer can count or watch (a hundred identical dots with everything dimming except one; a coin scanned into a ghost of dots; a grid of hundreds that keeps flowing past) **because** a counted or watched quantity is believed; a bigger number is not. Metaphor bank and the use-each-once rule: idea.md.

**WHEN** the claim is a consequence **DO** show the consequence on the type or beside it (a line crosses a threshold and a notification fires) rather than writing the claim large (ui-demo.md, the case).

### 0.2 Statement lines

**WHEN** a statement is centred on one line **DO** pace it to speech and keep its position fixed (layout.md R1.1), and keep the second visual voice (the product, an object, a cursor) moving behind or beside it **because** a centred line works only as a spoken beat. Centred line after centred line on a flat ground, each held, is a slide deck in a different order. Never a title plus a sub-line plus a kicker (layout.md section 0). Scale is intonation: the smallest line in a film can be the aside ("(this is a big one)" set small), and the biggest is the word that would be said loudest; spend the giant size once, and let the ending get smaller.

### 0.3 Voice of the copy

**WHEN** you write or choose any on-screen line **DO** write it the way the brand speaks (inventory row "voice", brand.md section 0.5), then cut half **because** the copy was often the best part of AI-made films and the rules silenced the writer: protect it. Sentence case with a full stop reads as a person ("It's done."); Title Case Benefit Lists read as a template. A sentence-length line with an aside, a parenthesis, a small joke is allowed when it is the brand's voice. Real UI text is more believable than marketing text: introduce a feature *where the user will meet it* (a new tab typing itself into the real nav; the camera pushing into the real "Share" button until it is the headline) rather than with a headline that describes it. Use the brand's own official line verbatim when one exists.

**Copy tells** (each one marks the line as machine-written; rewrite or delete):
- "Not just X. It's Y." and "More than X, it's Y."
- Triplets of one-word sentences ("Faster. Smarter. Yours.") and slogan triplets of any kind; benefit trios.
- "Unlock your potential", "Meet X", "Introducing the future of", "superpowers", "seamless", "effortless", "reimagined", "all-in-one".
- On-screen disclaimers and apologies ("illustrative", "fan-made"); production notes as text.
- A chain of puns on the brand's name; the name's dictionary meaning as the headline.
- Invented numbers, users, testimonials ("12,000+ creators"); a stat that nothing on screen backs up.
- A line that could be pasted into any other launch film unchanged.

### 0.4 Headline typing is banned

**WHEN** a headline, claim or opening line appears **DO** use whole words on the speech rhythm (sections 2-3); letter-by-letter typing with a caret is for the product's **own input field** (a prompt, a message being composed) and nothing else. There is no narrative exception: a test film typed its opening headline ("typed, because the film is about typing; the caret dies") on an empty flat ground, justified it in its own storyboard, and it was rejected as slop. A justified exception is still a fail. If the product genuinely is typed into, type *its* field inside the product's UI, not the film's headline (slop.md Part 1b, typewriter row).

---

## 1. The type system

| Property | Rule | IDs |
|---|---|---|
| Family | One family for everything: the brand's own face when its site loads one (grotesk, humanist or serif); a neutral grotesque (Inter-class) is the measured default when the brand has none (the corpus is all Inter-class) | all films; brand.md section 2 |
| Weight | 400 default; 350-450 on pale grounds; 450-550 headlines/names; 600 only on a wordmark; 650 only on a single word, pill or UI label; 900 only as a blurred hero-counter entrance (signature) | M930-M938 (400/450/480), M956 (650 headline), M968 (650 name), M967 (550) |
| Case | Sentence case or lowercase; keep proper nouns/abbreviations; wordmarks lowercase. No tracked-caps labels, kickers or taglines (layout.md section 0) | M964, M920, M929 |
| Tracking | display -1.5% to -5.5% em (e.g. -3 px at 54 px; -2 px at 54-62 px; -1.7 px at 82 px; -6 px at 154 px); small UI normal; ident small -0.4 px | M930, M927, M967, M968, M962 |
| Ink colour | charcoal (#383837, #20201E, #5D5E5C, #171719), not pure black; pure black only on the hero figure or wordmark; white on dark | M936-M938, M947, M953, M973 |
| Secondary words | dim grey for connectives ("and" #A6A09E never turns white), light grey (#8B8F90) for subtitles | M967, M916 |
| Second face | at most one per film, as a deliberate second voice (a serif against a sans UI for one emotional line, a pixel/stepped face for a name); never a lone serif-italic accent word dropped into a sans line (a 2023 reel habit, slop.md N12). If the brand's own heading face is a serif it is the headline voice everywhere, not a second face | M914, M916, M920, M933, M953 |
| Mixed weight in a line | one signature only: heavy numeral next to regular words (N% at 16% H vs words at 7.5% H) | M955 |
| Glow | dark grounds only: soft grey glow beneath words (16 px on bright rows); stronger on the key word | M913, M917, M920 |

**R1.1** WHEN you choose a film's motion grammar -> DO pick smear or crisp steps once and hold it (motion.md R4.1, R4.2); the mechanics below say which suits each (3.6 hard step is the crisp one) -- *because* mixed grammars look like different authors.
**R1.2** WHEN you choose a film clock -> DO set one per moment (motion.md R5.1, R5.2); type is quantised with the rest (words land on even frames in an on-twos film) -- *because* mixed step rates read as a bug.
**R1.3** WHEN you need emphasis without bold -> DO change size, colour on one word, or a second face (section 6) -- *because* bold reads as template (M930-M938, M962-M969).

## 2. Whole-word builds

### 2.1 Onset cadence

Gaps between word onsets (converted to seconds):

| Situation | Gap s (f@30) | Pattern | IDs |
|---|---|---|---|
| Fast hook, inside a phrase | 0.07-0.12 (2-4) | steady or accelerating | M947 (.03/.04/.06/.07, loosening), M956 (.06-.10), M920 (.13/.08/.09), M938 (.12/.08/.12) |
| Standard headline | 0.12-0.20 (4-6) | accelerating toward the end | M936 (.20/.20/.12/.12), M921 (.10-.12), M941 (.17), M929 (.17/.27/.27), M967 (.13/.20), M914 (.20/.16) |
| Voice-led, thoughtful | 0.25-0.40 (8-12) | irregular | M964 (.33-.38), M927 (.57 then .23), M958 (.27/.16/.17), M917 (first words .50/.42, later words .12) |
| Before the payoff/stinger word | 1.5-2x the base gap (e.g. 10 f@60 = 0.17 s vs 6-7 f = 0.10-0.12 s) | one longer gap | M921 |
| 1 word per 2 f when stacking identical-role words | 0.067 (2) | drum | M955 |
| Listed items one after another (rows tied to voice) | 0.7-1.0 | on the spoken word | M925 |

**R2.1** WHEN you time a phrase -> DO set each onset where the spoken syllable lands (voice-led films: M925 rows at 0.07/0.83/1.74/2.74 s, M967 words at .07/.33/.47 then 2.33/2.47/2.67; M926 wordmark reveal completes 0.16 s before the spoken name) and spread gaps like speech: accelerate toward the end (5,5,3,3 f@25) or slow on the last word (4 then 6 f@30) -- *because* the viewer hears the headline as a list and the line is visibly still being formed (M936, M967, M947).
**R2.2** WHEN no voice exists -> DO use base gap 0.07-0.12 s for a hook, 0.12-0.20 s for a standard headline, and add +-40% jitter in a speech pattern (never a constant interval) -- *because* a metronome gap reads as a template (PRACTICE derived from the table; M921/M936/M947 show non-uniform gaps).
**R2.3** WHEN a technical ident cuts through states -> DO use a constant interval (10 f = 0.333 s, four cuts in a row) -- *because* the constant cadence is the music grid; this is the one place uniform gaps are right (M962).

### 2.2 Entry offsets and curves

**R2.4** WHEN a word enters -> DO start it offset and decelerate (`M.ease.softLand`; hero first word `M.ease.snapSettle`), no overshoot, no opacity ramp:
- vertical rise: 0.03-0.07 H below (M941 .07, M967 .03-.04, M958 .10 -> .04 -> .03 as the line speeds up), up to 24% H for a big rise (M929: 173 px, shrinking per word 24/18/13/13% H; M938 .16/.13/.13/.07 H);
- horizontal: 0.03 W to the entry side or 16-35 px (M920 +35/+12/+4/0 px over 3 f; M964 16 px; M936 pops right of slot then slides left);
- curve: 59% of travel in 5 f (0.17 s), 80% by 10 f, 91% by 16 f, tail 0.4-1.2 s (M929), or decay 0.6-0.72 per frame = 90% in 5 f@24 (M964, M969);
-- *because* the fast head gives energy, the long tail keeps the line alive, and shrinking offsets make the build accelerate toward the last word (M929, M938, M941, M958, M964).
**R2.5** WHEN a word is added to a held line -> DO either re-centre the line each time with +12 to +32 px of extra gap closing 50% in ~7 f (M921: 18 -> 13 -> 9 -> 5 -> -2 px; the final stinger word +32 -> 21 -> 13 -> 9 over 25 f) or lay out final slots first and never re-centre -- *because* re-centring makes the line breathe; fixed slots keep boxes, loops and inserted badges aligned. Decide in section 3.9.
**R2.6** WHEN you need to avoid fades -> DO fade only inside a blur-resolve (section 3.4), as an exit paired with motion (section 5) or the last phrase to black (10 f linear: M920) -- *because* a plain opacity 0 -> 1 reads as slideware (M920, M921, M938, M947). "Almost nothing fades" is the default, not a ban: a calm brand's voice, a dissolve that *is* the meaning (privacy, forgetting) or a blur that copies a real focus pull may fade (slop.md Part 1b).

## 3. Entry mechanics seen

### 3.1 Rise with smear
- M929 @30: onset gaps 5/8/8 f; vertical smear kernel 20/14/15/10 px -> 4 -> 2 -> 0 in 3 f, plus gaussian 2 -> 0.7 -> 0.25 -> 0 over 6 f, down-trail copies at .22/.12/.06 opacity; RGB split (cyan/yellow/blue, +-10 px) on the first word only, f0-f9; flat rectangles step every 2 f for glitch (0-0.37 s).
- M938 @25: rise .16/.13/.13/.07 H, grey #BFBFBF -> #808180 -> #353635 in 2 f, settle ~15 f (0.6 s). M941: rise 0.67 s, grey #B8B8B8 + 1.5 px blur -> black in 0.33 s, 5 f stagger.
- **Choose when** the line has 3-5 distinct words, a building/adding sense (rising = adding), light or neutral ground, and the film runs smear grammar or a calm stepped one (M929, M938, M941, M958, M967).

### 3.2 Pop whole with x-decay
- M964 @24: whole word on one frame, offset 16 px to the entry side, x decays x0.6/frame, line slides left so the group stays centred.
- M936 @25: 1-frame pop right of slot, decelerates left on its own track (first step ~33 px/f for the biggest), colour ramp dark -> light across the line (#3A3A38 ... #969795) so later words fade "into the future".
- M920 @24: start +0.03 W right, 24-30 px horizontal smear on f1 (strongest on the longest word), row drifts left 1.1-1.5 px/f while held. M917: 10-20 px horizontal smear, slides 14-30 px left, sharp in ~5 f, earlier words shoved left.
- M921 @60: 1-frame hard cut with zero smear, +18/+32 px extra gap, the whole phrase leaning left (-88 px = 6.9% W over 1.1 s).
- **Choose when** the line is a spoken sentence (voice-led hook, claim lines) -- the pop is the speech beat. Use smear only if the film is in smear grammar.

### 3.3 Start oversized, shrink
*Runtime:* `M.words(..., { words: (i, w) => (i === last ? { dist: 160, scale: 1.4 } : null) })` makes the thesis word enter bigger and further than the others (runtime/README.md, Words).
- M947: first word 0.39 H (ink .58 W), 6 px blur -> 0.09 H in 0.30 s (about 86% of the shrink in the first 8 f, tail 0.27 s); the second phrase lands at about 2x frame width (0.33 H ink), .90 W -> .66 -> .49 -> .45 W -> settled 0.09 H over ~0.4 s. M953: red words 1.44x converge to one line in 0.5 s, then keep shrinking -9% in 0.63 s. M917: first word 1.94x, pink -> white, 1.94 -> 1.31 (0.27 s) -> 1.025 (0.56 s) -> 1.0 (0.73 s). M968: typed word cap 0.49 H -> 0.33 H step by step. M937: thesis word .91 W then collapses (section 11).
- Reverse variant: M967 act-two words enter small (0.73 scale, accent colour) and grow to 1.0 white in 0.2-0.33 s (about each word's own slot centre), after an act-one squeeze and hard cut.
- **Choose when** the word is the film's first word, the thesis, or the payoff; it lands like a hit and never bounces. This is an *arrival* (decelerating from oversize) used once, not a giant cropped first word in every film: that is the house style of one over-used generation (slop.md N15). Give the word a cause or a surface, and spend scale once.

### 3.4 Blur-resolve in place
- M920 @24 (CTA): opacity .12 -> .3 -> .65 -> .9 -> 1, blur 8 -> 6 -> 4 -> 1.5 -> 0 px, 4 f each = 0.17 s per word, words back-to-back, no motion.
- M919 @24 (status): per word 12 px blur, 0.1 opacity -> sharp in 4 f, back-to-back. M916: subtitle words from dark blur, 0.09-0.13 s each. M936: second phrase 0.9 opacity, ~5 px blur, sharp within 4 f while sliding left; the unit label fades up from 0.12/5 px over 0.28 s with no slide. M956: header 0.08 -> 1 opacity, blur 5 -> 0 over 0.33 s while sliding down. M955/M958: pale coral + 2.5-4 px blur -> black in 0.10-0.20 s.
- **Choose when** the text must not move (fixed layout, camera already moving), for status/log lines, CTA words, and secondary text.

### 3.5 Per-glyph variety inside one line
- M930: first word glyph by glyph (about 1 glyph/f, blur 10 -> 1.2 px in 0.27 s, cold blue -> white in 0.30 s), each glyph on its own slide, lift or jump path; second word whole with 45 px blur; third as scattered fragments (not sequential) whole by 0.17 s later.
- M927: one word as a scrambled glyph flash (1 glyph per f in the accent, white in ~0.2 s). M916: letter roll (each glyph blurs-and-drops 0.03 H for 2 f, 0.08 s apart). M947: a 11-letter word assembles out of order in 0.23 s, letters contracting inward. M937: a 10-letter final word appears 4 letters at once, then +1 letter per 3 f, left-anchored in its final centred slot.
- **Choose when** one word in the line must differ (the claim word, a proper noun) or when a long film would otherwise repeat the same word-pop; "variety inside one line avoids the typewriter-title look" (M930). Signature move: use rarely.

### 3.6 Hard step, zero ramp
- M921: 1-frame cuts, no opacity ramp, no smear, drift continues through the hold; energy comes from plates behind the type. Choose for crisp-step films, fintech/technical, very short holds.

### 3.7 Wave typing per glyph
- M974 @60: each glyph lives 14 f (0.23 s): opacity 0 -> 1 in 0.05 s; vertical offset +25, +24, +21, +14, +7, -2, -12, -24 (peak at age 7 f = 0.117 s), then -18, -12, -6, 0 (age 11), +2, 0 (age 14); x slides in from +15 px over 12 f; colour #7655CE -> ink in 17 f; amplitude 0.035 H; no blur, no cursor; onsets ~45 chars/s for the first 27 glyphs, then slowing to 2-4 f per glyph. Choose for a long prompt in a container wider than the frame, with the whole UI panning as one group.

### 3.8 Colour sweep through glyphs
- M967: recolour band of 4-5 glyphs, 2 glyphs per 2 f, repeating 1.27 s later while the line shrinks. M920: a 130 px band at 55 px/f, period 0.708 s. M919: two shimmer sweeps of a masked brighter copy, band .23 W, 0.42 s each, 0.21 s gap. Choose for "alive while held" or an agent "thinking" state (no spinner).

### 3.9 Fixed slots vs re-centring

| Choose | When | IDs |
|---|---|---|
| Re-centre the line on every new word | 2-5 words, centred, the line is "being said"; baseline wave allowed (M947 first word walks .42 -> .24) | M921, M947, M962, M964 |
| Fixed slots, no re-centring | Later elements depend on geometry: selection boxes, loops, reticles, a gap that opens for a badge, survivor words after a drop-out, lines longer than 6 words | M914 (survivors stay put), M934 (6 words, 3 f apart), M956 line 2 starts at final x, M967 (each word scales about its slot centre), M937 |
| Left-anchored, grows rightward | Typed UI text | M937, M969 UI field |
| Right-aligned around a still caret | A numeric field | M923 |

## 4. Accent colour on arrival

**R4.1** WHEN a new word arrives and deserves attention -> DO give it the film's one accent for 0.04-0.33 s (sweet spot 0.13-0.28 s), starting on its first frame and decaying to ink; the line is monochrome at rest -- *because* colour then means "this is arriving".

| Frame clock | Duration | IDs |
|---|---|---|
| 24 fps stepped | 1-2 f flash, cycling colours (each word a different flash; single-film signature, use rarely) | M966 |
| 30 fps 2-f holds | 6 f (0.20 s) accent -> white; the connective word goes grey, never white | M967 |
| 60 fps smooth | 0.28 s linear violet -> ink; per glyph | M973, M974 |
| 25-30 fps smooth | 0.13-0.33 s: grey -> black (M941 .33 s), red -> charcoal (M958 .13-.20 s), cold blue -> white (M930 .30 s), 2 f dark -> light (M938), mint 4-6 f -> white (M927) | M927, M930, M938, M941, M958 |
| Slow tint tied to a long tail | accent -> ink over 1.2 s on the last word only | M929 (last word: #177253 -> #12513D at f26 -> ink f36) |
| Luminance instead of hue | 4 stepped opacities 30/50/75/100% (grey #A9AAA0 -> #10110B), 3 f apart | M934 |

**R4.2** WHEN you pick the arrival colour -> DO use the film's single accent (never a new hue per line) and keep a second signal colour only for "done" (green) -- *because* hue is meaning (M913-M920, M929, M967).
**R4.3** WHEN a typed glyph appears -> DO tint the newest 1-3 glyphs for 1 f (M956 red, M914 bright #F5E8FF with 1-2 ghosts, M966 each glyph for 1 f) -- *because* the leading edge shows where the writing is.

## 5. Phrase replacement

**R5.1** WHEN one phrase replaces another -> DO make exits faster than entries and overlap them by about 2 f: exit one word per frame, each 3-4 f (up 0.07 H, fade to #CCC), entries 2-3 f apart settling over ~15 f (M938: in 0.00/.12/.20/.32 s, out 1.00/1.04/1.08/1.12 s, next phrase entering 1.16-1.60 s) -- *because* the eye keeps reading momentum, no dead frames.
**R5.2** WHEN the replacement is a prompt metaphor -> DO drop leading words in single frames without re-centring survivors (M914: .84 s and .88 s), then add the new words to the right (.92/1.08/1.24 s) -- *because* it reads as backspace-and-retype.
**R5.3** WHEN a phrase ends a thought -> DO hard-swap in one frame (M920 at 1.67 s; M921; M929 at f51 after a wind-up) -- *because* the cut is the beat.

| Exit | Numbers | When | IDs |
|---|---|---|---|
| Hard vanish in steps | words 2 f apart (1.42/1.50/1.58 s @24) | short phrase, crisp grammar | M964, M914 |
| Clip-edge wipe | a clip edge sweeps L->R through the glyphs (cutting mid-glyph) while the group slides the same way, 5 f, accelerating (clip fraction .94/.87/.76/.33/.23/0) | removing a typed line | M962 |
| Wind-up then hard replace | nudge right 0 -> 95 px (7.4% W), scaleX 1 -> .923, last 8 f accelerating 13.7 -> 95 px/f, 24 px smear, replace on f51; or lean-out 7 -> 14 px/f in the last 2 f | line pulled out before the cut | M929, M921 |
| Shrink into centre | .55 W -> .28 W -> gone in 0.24 s | oversize/central words | M947 |
| Centre-outward mask wipe | first word erases from its right, second word from its left | two-part phrase | M947 |
| Scramble + hard switch | glyphs rotate +-12 deg -> 39 deg, recolour grey, hard switch | letter ring becoming a title | M947 |
| Staged L->R fade | 4-5 f per word, blur up to 8 px on the last two, 0.56 s total | phrase before a number | M936 |
| Drift up + fade | line drifts up 26-42 px accelerating, line 1 fades #93958A, #C2C3B8, gone; line 2 stays black | claim line before a hard end | M934, M938 |
| Two soft masks | erase front L->R runs ahead of the reveal front by ~0.1 s; leading edge 25-45 px | question -> name | M926 |
| Backspace one letter per 2 f | R->L, remaining letters do not re-centre | brand name erased as a mark transforms | M968 |
| Fade to black (last phrase only) | linear 10 f, one fully black frame | before an avatar-built lockup | M920 |

**R5.4** WHEN you must fade a word -> DO pair the fade with outward motion or a replacing icon (M958: 90% -> 5% over 9 f while phrases push out and badges grow) -- *because* the eye tracks an object instead of seeing a gap.

## 6. Key-word emphasis

| Device | Numbers | Metaphor/film | IDs |
|---|---|---|---|
| Selection boxes | solid rect behind a word 4-5 f each (0.13-0.17 s), one empty frame between boxes, word dims (not inverts), hard cut in and out, fired the instant the line is complete | prompt/text-selection (product mechanic) | M930 |
| Hand-drawn loop | 5 px stroke, round caps, ~9 held poses at 2-f holds on a 12 fps clock over 0.75 s, drawn from under an object, held ~0.7 s, exits as a new curl, behind text and card | editorial/hand-made | M933 |
| Reticle box | 4 thin lines drawn by travelling dashes in sequence over ~0.37 s, locked to the line's drift | technical/lock-on | M927 |
| Accent word | accent colour on the argument noun; rest in ink; or a larger size (10-40%); a different face only as the film's one deliberate second voice (section 1) | any | M914, M932, M936-M938, M953 |
| Size jump | the key words enter 1.44-2x larger and converge to the line (or numerals 2x the words) | any | M947, M953, M955 |
| Gradient clipped to the glyphs | one word only | "AI" moment | M947 |

**R6.1** WHEN a line has one claim word -> DO choose one device by metaphor: selection boxes for a product-mechanic film, loop for editorial, reticle for technical, accent colour/size for the rest; never combine two on one line, never an underline or glow -- *because* the highlight must say which word is the claim without becoming a second object (M930, M933, M927).
**R6.2** WHEN you time the highlight -> DO start it when the line is readable (selection boxes at completion; loop 0.6 s after the words are readable; M930, M933) -- *because* the sentence is read first, then marked.

## 7. Headline typing versus prompt typing

**R7.1** WHEN a headline or claim appears -> DO use whole words (sections 2-3); type only where the film shows a prompt or a person composing in the product's own input field (a brand name typed as an ident is a rare signature move, M962, M968; never a headline) -- *because* letter typing makes titles look like a terminal; word pops match speech (M920, M936, M964, M934). Section 0.4: a narrative reason is not an exception.

| Typing class | Speed | Where | IDs |
|---|---|---|---|
| Content the viewer must read | 14-30 chars/s, 1 char/f with 1-f holds, irregular | prompt, ident title | M928 (30), M931 (21-24), M949 (about 20), M962 (14 with pauses), M969 headline (1 char per 2-4 f) |
| Long prompt / result / status where reading is not the point | 70-85 chars/s in bursts of 3-6 chars/f | UI field | M914 (3.4 chars/f, 85/s), M919 (3.4/f), M935 (84/s result), M956 (70/s), M969 UI (~37/s) |
| Wave typing | ~45/s start, slowing at the end | box wider than frame | M974 |

**R7.2** WHEN you author a typing rhythm -> DO write it by hand: bursts of 1-f letters, a 6-10 f pause after a space (first word + space held 10 f, first three words + space held 6 f at 30 fps, M962), skipped intermediate states (a 2-letter prefix never shown, a 2-letter word arriving as 2 chars at once, a lone leading letter never shown before its 2-letter prefix, a 2-letter ending landing together: M949, M965, M969), a slower last word (letters every 3 f after fast whole words: M966, M969) -- *because* a metronomic char per frame is the clearest slop tell.
**R7.3** WHEN you animate the caret -> DO: show it 0.04 s before the first character and keep it on the last glyph (M914); never blink during typing (M949 jumps with each glyph and exits in 1 f; M956 and M935 steady 2 px; M923 stationary with the value growing to its left); blink only in idle waits after typing, on its own clock (M914 windows [2.44-3.44), [3.76-3.96), [4.24-4.52); M969 UI caret on its own clock); omit it entirely if the field is a result (M928, M942) -- *because* a blinking caret during typing belongs to a terminal.
**R7.4** WHEN a centred line is typed -> DO re-centre on every event and move a carrier object with its right edge (M962 dot steps +0.10 W across 18 chars, even on space-only steps; M969 caret derives x from live text; M949 line slides left, accelerating .006 -> .027 W per step) -- *because* it reads as composing now.
**R7.5** WHEN a typed UI line grows -> DO step the camera or scale during typing so the target is already bigger (M914: 1.6x -> 1.5x drift, one-frame x0.77 contraction at 2.84 s, regrow to 1.13x for the click); hard-cut scale in the same frame as a content jump (a multi-word tail appears at once, M949) -- *because* the cut reads as editing, not two events.
**R7.6** WHEN you type user copy -> DO proof it first; films shipped with typos kept from source (M917-M919, M949, M956, M959) -- PRACTICE: a typo in your own copy is not a style.
**R7.7** WHEN a prompt ends -> DO end without a final period if it is a prompt (M919) and hold ~0.5-0.6 s with a blinking caret before the cursor moves (M919: 1.38-2.1 s; M935 steady caret 0.5 s then it vanishes).

## 8. Counters and numbers

**R8.1** WHEN a hero number "arrives" -> DO roll one value per frame with step sizes decaying to the end, 15-23 steps in 0.5-0.9 s, never an eased tween of the digits:
- M954: 16 values in 0.5 s, steps .75 .81 .85 1.78 1.84 .90 .88 .85 1.56 .69 .61 .95 .32 .20 .07 -> lands $100.00; edge glyphs ($ and last 0) stay ~12 px blurred while centre digits sharpen; pull back .91 -> .63 W in 0.20 s.
- M958: 2.71 -> 522.14 over 0.93 s in 23 events (3.8, 6.0, 8.8, 12.6, 18, 26, 40, 65, 94, then decaying 77, 33, 49, 23, 16, 13, 8 ... .45).
- M936: 29:08, 29:17, 29:25, 29:34, 29:42, 29:51, 30:00 in 7 f (+8.6 s per step, reads as time-lapse); size grows 0.12 -> 0.22 H over 0.4 s while colour/blur resolve (#E4E4E4 + 5 px blur -> #5C sharp -> #000 one beat after landing); hold 1.24 s; label fades up 0.2 s after it lands. 1 -> 5 counter: 1 f per digit (40 ms), size +12%/f, last digit reaches size one beat later.
-- *because* uneven decaying steps look measured; the last 3 frames barely move so the value lands instead of stopping (M936, M954, M958).
**R8.2** WHEN you need a step-based value -> DO skip values and hold 1-3 f per value (M955: 2, 3, 4, 6, 7, 8, 9, 10%, 5% skipped; ticks +1/+2 every 1-3 f for the token counter) -- *because* smooth tweens look like presets.
**R8.3** WHEN a counter or progress ring is the finale -> DO decelerate (3.1 pts/f -> 0.5 pts/f), park on 99 for 5 f (0.083 s at 60 fps), land 100 without flash, keep scaling the card through the last frame (M924) -- *because* the last 1% becomes suspense.
**R8.4** WHEN you choose how a number lands -> DO decide by role: **hero claim** ends on a round value (100.00, 10%, 30:00); **product data** ends on a specific un-round value (522.14, 119, 112/500, $194.67) -- *because* round reads as a claim, un-round reads as real (M954, M955, M958, M923, M936).
**R8.5** WHEN a number is proof texture, not the claim -> DO show it complete at onset, no count-up (view counts, metrics: M917, M919) -- *because* counting calls attention to a number nobody is asked to read.
**R8.6** WHEN a number is too large to count -> DO resolve the final value left to right through 12-15 px squares and ASCII glyphs (final value from frame 0, size 96 -> 176 px, crisp in 0.70 s), hold ~0.47 s, dissolve from both ends toward the middle in 0.33 s (M945) -- *because* it shows magnitude without a ticking counter.
**R8.7** WHEN two quantities are compared -> DO render them at the same height (hero numerals 0.22 H), keep the sentences at 6.5-8% H, reserve pure black for the figure, and leave the second figure cropped and moving (6 slides left at -11, -12, -19, -30 px/f while the unit enters at -70, -62, -54 px/f) -- *because* equal weight reads as fair; motion at the edge implies more (M936).
**R8.8** WHEN several numbers change off one control -> DO move all of them every frame on `M.ease.softInOut` (M923: four numbers over 50 f@60 off one handle, no overshoot) -- *because* viewers read cause and effect without text.
**R8.9** WHEN a number is the hero -> DO grow and sharpen while it counts; hold solid 0.5-1.24 s depending on whether it is one number or a figure with a label -- *because* growth sells impact and the hold makes it a fact (M936, M945).

## 9. Identity and name morphs

**R9.1** WHEN one name must become another -> DO flip per glyph left to right at 2-2.4 f@60 (0.033-0.04 s) per glyph, keeping a fixed left anchor so the eye never travels: the outgoing glyph squashes up to a hairline at y .49 in 0.05 s, the incoming grows from a hairline at y .54 to full in 0.10-0.13 s, two thin strokes at different heights visible mid-swap; outgoing glyphs shift black -> #594390, incoming start dark violet and brighten to #7454D9 -> ink (M973).
**R9.2** WHEN a second flip follows -> DO add an anticipation spread (slots fan right +26% over 0.19 s, `M.ease.softLand`) before it; the outgoing word squashes away in place at the expanded positions (0.83-1.02 s), no slide, no fade; the new word's glyphs arrive violet and darken L->R (M973) -- *because* the viewer sees both names from one lockup.
**R9.3** WHEN a word changes identity inside a line -> DO swap per letter (3.42/3.46/3.54/3.63 s), each blurring and dropping 0.03 H for 2 f, the new glyph arriving with the roll -- *because* the mechanism is visible, so the morph feels built (M916).
**R9.4** WHEN a question becomes a name -> DO run two independent soft masks (erase front L->R ahead of reveal front, mint 25-45 px leading edge, ~0.1 s empty gap), the wordmark revealed in place, the mark sliding back over the text as the name's tail (M926). Never crossfade.
**R9.5** WHEN a ring of letters becomes a title -> DO scramble, hard-switch to exactly the glyph count, start two glyphs at +-90 deg and unwind over 0.30 s on `M.ease.softLand`, no elastic (M947).

## 10. Reading time

Observed holds (fully assembled to departure) and total life:

| Words / chars | Assembly s | Full hold s | Life s | IDs |
|---|---|---|---|---|
| 3 w / 18 | 0.22 | 0.92 | 1.13 | M921 |
| 4 w / 15 | 0.36 | 0.48 | 0.84 | M914 phrase 1 |
| 3 w / 16 | 0.32 | 0.60 | 0.92 | M914 phrase 2 |
| 4 w / 19 | 0.70 | 0.50 | 1.70 (incl. 0.5 s wind-up) | M929 |
| 5 w / 26 | 0.30 | 1.00 | 1.34 | M920 phrase 1 |
| 4 w / 20 | 0.29 | 0.83 | ~1.1 (+0.42 s fade) | M920 phrase 2 |
| 3 w / 14 | 0.71 | 0.42-0.71 | 1.42 | M964 |
| 2 w / 14 | 0.44 | 1.00 | 1.44 | M938 |
| 3 w / 20 | 0.83 | 1.00 | 1.9 | M941 |
| 5 w / ~28 | 0.64 | ~0.45 | ~1.1 | M936 |
| 6 w, 2 lines | 0.75 | 1.66 | 2.4 | M934 |
| 8 w, 2 lines | n/a | ~2.0 | n/a | M933 |
| single number | 0.70 | 0.47-1.24 | n/a | M945, M936 |
| list of 8 lines | n/a | 0.8 | n/a | M939 |

**R10.1** WHEN you set a hold -> DO use: floor **0.45 s** after the line is complete (only with voice carrying it), comfortable **0.2 s per word** for 2-5 words (3 words 0.6-0.9, 4 words 0.8, 5 words 1.0), **1.7-2.0 s** for 6-8 words on two lines (about 0.25 s per word), single number **0.5-1.2 s** -- *because* viewers read along as words arrive, so total life per phrase runs about 0.25-0.35 s per word (derived from the table).
**R10.2** WHEN several phrases follow -> DO shorten scenes then let the last linger (phrase A 1.7 s, phrase B 1.5 s, icon 0.8 s, wordmark 1.44 s: M929); the second phrase may hold only 0.17 s if the same sentence continues (M929 phrase B).
**R10.3** WHEN the copy is texture (UI text 9-14 px) -> DO give it no reading time -- *because* no one is asked to read it (M913, M939).

## 11. No dead frame while holding

**R11.0** WHEN a line holds -> DO make sure one thing on the frame is alive (the line's own drift, a caret, a counter, a camera creep, light moving on the ground); a *designed breath* of 0.6-1.5 s with a reason you can state (a beat before the payoff word) is wanted and may rest more quietly -- *because* the rule is "no dead frame", not constant motion (director.md section 6).

**R11.1** WHEN a held line has no new event -> DO keep it moving along one axis or scale:
- lateral drift: -88 px = 6.9% W over 1.1 s (M921), 0.01 W per 0.44 s (M914), ~0.02 W over a 1 s hold (M920), 1.1-1.5 px/f@24 (M920);
- shrink: -9% in 0.63 s (M953), 0.55 -> 0.53 W in 1 s (M947), 5-10% per second as a default;
- big word: slow shrink 18% in 0.6 s, then accelerate (M937);
- vertical creep: 0.02 H over a 1.24 s hold (M936); parallax drift 0.07 W/s on a ground (M964);
- last frames before a cut: accelerate 2-5x (7 -> 14 px/f in the last 2 f, M921; 13.7 -> 95 px/f over the last 8 f, M929)
-- *because* a locked line reads as a slide, and the lean-out makes the cut feel pulled.
**R11.2** WHEN the end of a phrase is a hold -> DO keep something alive under it: counters ticking (M955 token counter 69 -> 119 across 1.87 s), a mascot blink, a rotating dial at ~14 deg/s (M936), a tile drift, an orbiting rim highlight -- *because* the headline can stay static while the scene lives.
**R11.3** WHEN a true static hold is allowed -> DO restrict it to the moment after a payoff lands (0.67 s on a name lockup M968; headline 0.67 s with a solid caret M969), never mid-phrase.

## 12. Decision table: if the line is X, use mechanic Y

| If the line is... | Use | Timing | IDs |
|---|---|---|---|
| The first word of the film / the thesis noun | start oversized, shrink (3.3) | 33% H, .91 W, 0.30 s to land, then slow shrink | M937, M947 |
| A spoken hook sentence, 3-6 words | pop whole + x-decay (3.2), re-centred | 0.07-0.20 s gaps, accelerate | M920, M936, M964 |
| A calm 3-5 word headline | rise (3.1) | 0.12-0.27 s gaps, offsets shrink | M929, M938, M941 |
| A technical/fintech statement | hard step (3.6) with drifting phrase and busy background | 0.10-0.12 s gaps | M921 |
| A status/log line of an agent | blur-resolve per word (3.4) + shimmer (3.8) | 4 f per word | M919 |
| CTA words | blur-resolve in place (3.4) | 0.17 s per word | M920 |
| A second phrase meant as a reply | change axis: first rises, second slides in from the right with 3 f anticipation | peak 3.2% W/f | M929 |
| A claim with one key noun | accent colour or loop/box (6) | box 4-5 f; loop 0.75 s | M930, M933, M936 |
| A prompt in a UI | typing (7): content 14-30 cps, long/result 70-85 cps | caret 0.04 s early | M914, M919, M949 |
| A very long prompt in a wider-than-frame box | wave typing (3.7) + pan | ~45 cps | M974 |
| A hero number | per-frame decaying steps (8.1), growth + sharpen | 0.5-0.9 s, hold 1.24 s | M936, M954 |
| A huge number (1,000,000) | pixel/ASCII resolve L->R (8.6) | 0.70 s, hold 0.47 s | M945 |
| A name that changes | per-glyph flip with fixed anchor (9) | 0.033-0.04 s per glyph | M973 |
| A word that differs inside a line | per-glyph or scattered fragments (3.5) | ~1 glyph/f | M930, M927 |
| A two-act headline | squeeze old act (scale .98 -> .91 -> .74 -> .30 over 4 steps, +-1 px strip jitter 0.4 s), hard cut, new bigger words from 0.73 scale in accent | gaps 4 then 6 f | M967 |
| A line that must leave | exit faster than entry (5), overlap 2 f | 3-4 f per word | M938 |
| A list tied to voice | whole word + icon, 3 f slide 12 px, onset on the spoken word | 0.7-1.0 s apart | M925 |

---

## Slop tells for type

| An AI default would | A designer does |
|---|---|
| Fade every word in (opacity 0 -> 1), then fade out | Hard step, rise with a 5 f head and long tail, or blur-resolve; exit by motion |
| Type the headline letter by letter with a blinking caret (and justify it as "the film is about typing") | Whole words in speech rhythm; letters appear one at a time only in the product's own input field, with authored bursts and pauses after spaces (section 0.4) |
| Set the word and nothing more | Act out the meaning on the one or two words that matter: slice, widen, tighten, leave all but one (section 0.1) |
| Write launch copy: "Not just X. It's Y.", one-word triplets, "Meet X", "seamless", "the future of" | Write the way the brand speaks, then cut half; a sentence with a full stop and one aside; the feature introduced where the user meets it (section 0.3) |
| Centre one line after another on flat grounds, each held | Centred lines only when paced to speech with a fixed position and a second visual voice moving; otherwise a split phrase or a line the product performs inside |
| A giant cropped word as the opening of every film | One arrival from oversize, once, with a cause; scale spent once and the ending smaller |
| Tracked small caps for brand names, kickers and taglines | Sentence case at role size; no labels (layout.md section 0) |
| Constant 0.1 s per word | Gaps follow speech: 5,5,3,3 f; 10 f before the stinger; slower last word |
| Centre every line and hold it still | Lean/drift 1-2%/s, accelerate before the cut, something alive under it |
| Bounce/overshoot every pop | No overshoot; 80-90% in the first 8-10 f |
| Bold for emphasis | Size, one accent word, a second face, or one device (box/loop/reticle) |
| New accent colour per line | One accent, 0.13-0.28 s on arrival, decays to ink |
| Smooth count-up to a round number | Per-frame decaying steps, skipped values, round hero vs un-round data, growth + sharpen |
| Ease digits between values | Discrete frames; ease the cadence, not the digit |
| Crossfade one name to another | Per-glyph flip with hairline squash and fixed anchor, or two soft masks |
| Hold every phrase 2 s regardless | 0.45 s floor, 0.2 s per word, 1.7-2 s only for 6-8 words |
| Re-centre survivors after a delete | Survivors stay put; new words append (backspace-retype metaphor) |
| Mix smear on some lines and hard steps on others | One grammar per film, one clock per film |
| Leave typos as style | Proof the copy |
