# Idea: finding the one thing only this brand could film

Order of work here: PAGE, the brand inventory, a first idea, two more of different KINDS, the cover-the-logo and competitor-swap tests, the pick with a reason, then the cues and the copy. Write it in the head of `film/STORYBOARD.md` (the worksheet is in `director.md`); a plan with no idea line does not get built. Don't stop to ask routine questions: state your assumption in a line and continue.

## 1. PAGE: what the film is for

Four lines, written before any effect is chosen. Every later decision is judged against them.

| | Question | It decides |
|---|---|---|
| **P** Problem | What is this film fixing? (Sometimes the honest answer is "not a film".) | whether a beat earns its place |
| **A** Audience | Who watches, where, in what state? (a feed on mute, a buyer on a call, a developer at 11 pm) | pace, density, vocabulary, type size, sound on or off |
| **G** Goal | Awareness, conversion, education, retention: what should they do after? | structure and the ending |
| **E** Emotion | Where does the viewer start (bored, sceptical, in pain) and where do they end (relieved, curious, amused)? | music, pace, weight, colour |

The emotional delta is the payload: the bigger the distance between where they start and end, the better the film performs. Lock things in this order: story, then frames, then style, then copy, then motion. Opening the animation before the story is locked is the commonest way a project goes wrong.

The one true thing: if the brief names a feature, find its real details (changelog, docs, the UI itself). If it names only a brand, the launch is yours to define: one real feature, one real behaviour, one real user moment. Specific beats general: a real example, a real number, a real time of day. Leaving things out is the point; 15 s holds 3-5 beats and ONE idea.

## 2. Brand inventory: where the idea is hiding

After capture and after looking at `film/brand/board.png` and `screens/`, fill this in (a table in STORYBOARD.md, one line per row, "none" is an answer):

| Look at | Ask | Typical idea that comes out |
|---|---|---|
| The logo's shape | What product object or gesture does it resemble? A pill is a toggle; a ring is a progress loop or a jar; three bars are sound; a folded corner is a page turning. Could it become that? | the mark IS the control or the character |
| The core control | What does a user touch? A play button, a search bar, a slider, a send arrow, a toggle, a blinking cursor. | the film's one cause-and-effect lives on this control |
| The signature material | What does the product's screen fill with? Cover art, listings, maps, code, photos, receipts, waveforms, paper. | that material is the ground and the hero image |
| The key verb | Split, play, find, ship, verify, mix, track, capture. Can motion perform the verb (and the type)? | the verb is performed on screen and on the key word |
| The success moment | What is on screen when it works? The ride arriving, the payment landing, the tests going green. | the film is built backwards from this frame |
| The voice | Read the site's H1s and buttons aloud. Deadpan, warm, cocky, technical? | your copy and your timing sound like that |
| The colour logic | Which colour means "on", "yours", "new", "error"? | colour in the film keeps those meanings |
| The type | Geometric, grotesk, humanist, serif? Big tight display or small careful UI? | their type sets the rhythm; follow it, serif included |
| What they would never do | A calm brand doesn't glitch; a playful one doesn't wear black-tie chrome. | the edges you respect |

Translate: keep literal the logo (never redraw), typeface, colour values and meanings, real UI, real copy, real behaviour. Invent the stage, camera, light, metaphor, choreography, sound, drawn in the brand's grammar (its corner radius, stroke weight, type, colour rules, pace). Amplify a micro-detail into weather: the iridescence in an icon becomes the light of the whole film. Give the logo a job (the button, the radar centre, the toggle, the cursor, a word in the sentence); a logo that only appears at the end as a sticker is wasted. Puns on the name are the weakest ownership.

## 3. First idea, then two of different KINDS

1. Write the first idea down. It is nearly always the name's first association or the category's costume (`judgment.md` section 7, reach 7). Put it aside.
2. Write at least two more, each as ONE sentence that predicts what happens on screen ("competing appointments physically yield until one shared interval opens"; "premium, smooth, cinematic" predicts nothing), and each a different KIND of film:

| Kind | Shape | Works when | Costs / fails when |
|---|---|---|---|
| UI documentary of one real task | one specific case from question to result, the camera does the explaining | the product is a tool people do something in | needs real or convincingly specific UI with identity (`world.md`); a feature tour is the failure |
| A single held shot that slowly changes | one take, one subject, something changes under the camera | one object or one material carries the brand | needs a world worth looking at for 15 s; empty is the failure |
| A joke with a character | a small figure, a deadpan problem, the product as the straight man | a funny, relatable problem; a playful brand | the character must be drawn in the brand's grammar; no mascots from the category |
| A typographic essay in the brand's voice | words are the picture; each performs its meaning | the product's value is a sentence; the voice is the brand | the writing must be good; a centred title page is the failure |
| A montage of real output | many real results, edited to a rhythm | the product makes things (images, sites, songs, trades) | the output must be real and varied |
| Stillness that breaks | calm held, then one cause breaks it, then calm again | the brand sells relief, silence, focus | the break must be earned by a visible cause |
| A transformation chain | A becomes B becomes C becomes the logo | rarely: the chain IS the product | the most over-used shape; the house style in `judgment.md` section 7. Do not pick it because it is the film you always make |
| Claim, cut, proof, cta | a claim in type, a hard cut to the product performing it | a clear one-line promise with a demo | the default skeleton of `director.md`; just one shape among these |

3. Test each with: **cover the logo** (does it still say which company?) and **swap in a competitor** (would the film work for them with the colours changed?). If it would, it is the category's film, not an idea yet.
4. Pick the one that could only be this brand AND that you can make well with the assets and renderer you have. Write the reason in a line. The idea is chosen, not averaged: never combine all three.
5. Scope check: the idea predicts the hero moment (`world.md`, the screenshot test). If you cannot name it, you have a topic, not an idea.

Optional precedent: `python3 "$SKILL/scripts/precedent.py" query --beat proof --content ui --text "<what the beat shows>"` returns rule-only, ID-cited precedent from the measured moments (also `show ID`, `rules`, `stats`; see `tools.md`). It is evidence for HOW (timing, sizes), never a picture to copy.

## 4. Metaphor bank: abstract words to images

Ask what the word looks like or what it is the opposite of. Use each metaphor once per film; reusing a visual reads as padding.

| The script says | What worked |
|---|---|
| "top 1%" | 100 identical dots or people, everything dims except one, which takes the accent; or a pie where the camera pushes into the 1% slice |
| "8 principles" | 8 abstract shapes that gather into one form; the number and the concept become one image |
| "getting attention" | a light sweep across a dark field of identical things, catching one |
| "over a weekend" | a calendar whose last two days light up |
| "commoditized" | many identical objects flooding in; "differentiated" is one thing standing apart |
| "blank canvas" | an actual empty artboard with a cursor about to draw |
| "billion-dollar" | the word at 3-4x the surrounding type, alone in frame |
| "stop scrolling" | cut on the action: a feed that halts dead on the word |
| a named AI chat product | its real UI (model picker, prompt box) at real proportions, never a mock-up |
| the product "thinks" or "works" | an object from the customer's world (a wok, a ledger, the real log), never an orb or sparkle |

Take props from the audience's culture, not the category's clip-art (a snack pouch, a group chat in slang, a muddy running shoe at dawn). Not rockets for launch, shields for security, lightbulbs for idea.

## 5. Script cues (when there is VO or a written script)

Mark each line with its cue before designing; each cue gets a visual:
- **Numbers** ("8 principles", "top 1%") get a visual built from that number, never a caption.
- **Abstract nouns** ("attention", "weekend", "blank canvas") get a concrete metaphor (section 4).
- **Names** (product, brand, person) get a name or logo beat with its own hold.
- **Contrast words** ("but", "not anymore", "instead") get a turn: a change of ground, colour, scale or camera.

Not every word goes on screen. The voice already says the sentence; the screen shows the one or two words that matter. From "Over 5 lakh 57,000 apps were built last year by AI over a weekend", show "557,000 apps, built by AI". Mute test: mute the audio and read the picture alone; do the visuals tell the same story as the words? "Think from a blank canvas" over a video-editor timeline is incoherent. Also test the opposite: with the audio only, is anything missing that the picture should have carried?

## 6. Copy voice

- **Write like the brand speaks, then cut half.** Use the site's real phrasing where you can; an official launch line verbatim beats a stock one (7 against 4 in one judged round). Sentence case with a full stop reads as a person; Title Case Benefit Lists read as a template. One sentence across a 16 s film is allowed. Sentence-length type with an aside is allowed ("(even yours)").
- **Real UI text beats marketing text.** Introduce the feature where the user will meet it (a tab typing itself into the real nav) instead of a headline describing it.
- **Copy tells to avoid:** "Not just X. It's Y."; triplets of one-word sentences ("Faster. Smarter. Yours."); "Unlock your potential"; "Meet X"; "the future of"; "superpowers"; "seamless"; benefit trios; on-screen disclaimers ("illustrative imagery"); chains of puns on the name; "Learn more"/"Get started free" as the last line. If a line could be pasted into any launch, rewrite or delete it.
- Protect the writer: the copy is often the best part of an AI film. Give the picture its own job instead of illustrating each noun.

## 7. Three worked examples (invented brands, deliberately different)

Do not borrow their looks; they differ in kind, ground, light, sound and joints on purpose.

**Pinhole** (camera-roll cleanup; mark: a circle with one dot). Inventory: the mark is a pinhole; the core control is the thumb's swipe; the material is the user's own photos; the verb is "sort"; the success moment is a 14,000-photo roll becoming a quiet 40; the voice is dry and lowercase; colour logic: warm paper, one red delete. First idea (discard): photos flying into a neat grid under "Declutter your memories". Others: a joke with a character (a thumb with a deadline); a held shot. Pick: **one held shot** at real scroll speed on a warm desk lit by a window; the roll scrolls faster than reading, the thumb stops on one photo, everything else slides away off the frame edge, and the lone photo's highlight is the pinhole mark. Hero moment: the stop. Sound: a thumb-on-glass tick that speeds up, then a dropout and one low note. Ending: the mark, small, on the warm ground, 0.8 s. World: photographic ground, window light, shallow depth, grain.

**Halyard** (deploy tool for solo developers; mark: a knot). Inventory: the control is one button; the material is a build log; the verb is "ship"; the success moment is red turning green at 03:14; the voice is tired and exact; colour logic: red = failing, green = live, nothing else is coloured. First idea (discard): a rocket and a progress bar. Others: a montage of strangers' deploys; a UI documentary. Pick: **UI documentary of one real task** on a light paper-white ground: 03:12 a failing build, the camera macros into the single red line, the fix is typed in the product's own field, the line goes green and the status dot, a loose rope end, ties itself into the knot mark. Real fragments of the captured UI, cropped by the frame, lit by a cool key; no invented dashboard. Sound: room tone and keyboard, silence before the green, one soft hit at 03:14. Ending: the tied mark on the paper ground, 1 s.

**Plainer** (a bank that writes in plain English; serif wordmark). Inventory: the control is "read the contract"; the material is words; the verb is "say"; the success moment is one sentence left; the voice is warm and direct. First idea (discard): coins and a shield. Others: a UI tour of the app; a joke with a lawyer. Pick: **a typographic essay in the brand's voice**: a dense page of fine print in the brand's serif, a bar draws a line through each clause, the words that survive slide together until one sentence stands ("We charge you $4 a month. That's it."), and the page itself shrinks to a card. Light ground, warm key light on a paper texture, no UI at all until the last second. Sound: a pencil strike per cut, no music until the sentence lands, then one chord. Ending: the sentence, then the name on the voice.

Notice what each shares: a stated reason, a cause for every joint, one hero moment, a world, a quiet ending. None of the three could advertise a competitor with the logo swapped.
