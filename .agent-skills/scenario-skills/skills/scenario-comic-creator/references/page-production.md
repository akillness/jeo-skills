# Page production

## Production unit

Default: one complete page per request. The model draws panels, gutters and balloons together, so
tone, gutter width and lettering match across the page. Separate panels are for vertical-scroll
webtoons, for animation, and for a single panel that keeps failing.

## Lettering mode test

Do not assume the model letters well. Test it on the first two pages.

1. Pick the two pages with the most printed words. Put every word in their prompts.
2. Proofread each balloon against the script at reading size and in a 100% crop. Check accents,
   apostrophes, capitals and which balloon belongs to which speaker.
3. Run both pages together and proofread both the same way.

Then choose:

- **Integrated**: every word of both pages is exact. Keep generated lettering for the whole book,
  one language.
- **Overlay**: any word breaks, or the book ships in several languages, or the text will be edited
  later. Generate the art with empty balloons sized for the word count (or with no balloons), then
  add exact text with `scenario-text-overlay` and measure each balloon interior first.

Record the mode in the brief card. Never switch a book to empty balloons silently. A text-only
repair on an accepted page can use an in-place text-edit model found with `recommend`. Compare
unchanged areas at native scale, keep the original if anything else moved, and never edit that page
twice.

## Page prompt anatomy

A page prompt runs about 300 to 1,700 words, median near 1,000 on a long project. Length is the
checklist the model follows. Short prompts leave light, camera, acting, cast, state and geometry to
chance, and chance returns the stock look. Aim for 600 to 1,000 words once a book has a template.

| Section       | Holds                                                                     |
| ------------- | ------------------------------------------------------------------------- |
| Art direction | Named influences, hard rules, a FORBIDDEN list. Reference 1 is the anchor |
| Anatomy       | Rules for bodies, hands, faces, creatures that failed before              |
| Setting       | Place, time, fixed landmarks, what must never appear                      |
| Light         | The motivated source, its color, where shadows fall, the darkest area     |
| Cast          | Who is on the page, which sheet is theirs, their state                    |
| Equipment     | What each character wears or holds, per panel when it changes             |
| Layout        | Panel count, arrangement, reading order and direction                     |
| Panels        | Camera, action phase, gaze, expression, exact words, speaker              |
| References    | What each attached image is for, numbered in attachment order             |
| Rules         | A short list of what must not be drawn                                    |

Excerpt, a three-panel page:

```
Create a finished comic page. Reference 1 sets line, color, paper and
lettering only, never its characters or composition: dry-brush ink on warm
paper, four colors (slate blue, rust, ochre, paper white), rounded white
balloons with narrow hand-lettered capitals. References 2 and 3 set
identity only: Ines and her grandfather, never their pose, expression or
backdrop. No title, no page number.
Light: one oil lamp at the far end of the table, warm, left of frame.
Beyond its reach everything falls to near black. The window is a flat cold
gray rectangle with no sky detail. No glow, no gradients.
Three panels. P1 fills the top two thirds. Below it, two small panels.
P1 (dominant): wide, from the doorway, low camera. A narrow night kitchen.
Ines, small, foreground, back to us, her shadow reaching the table. Her
grandfather sits at the lamp, hands flat on a letter. No balloons.
P2 (bottom left): insert on the letter under his hands, thumbs pressing the
corners. Caption: "Eleven stamps, none of them ours."
P3 (bottom right): close on Ines, lamplight on one cheek, the other half
of her face dark. She wants to ask and is afraid of the answer, lips
pressed. She says: "Who is it from?"
References: 1 style anchor, 2 Ines sheet, 3 grandfather sheet.
Rules: no extra people, no lettering outside the balloons.
```

## Writing rules

- Every panel names actor, action phase, camera, gaze, expression, object states and exact words.
- Describe positions in screen terms. Keep one plan per location.
- Groups of three or more moving figures: give each a different readable action phase, spacing and
  gaze. A copied pose reads as marching.
- Say what is absent as well as present.
- Say the panel count and the arrangement outright.
- Write each text container as its own object, so the model never picks the shape: "a round white
  balloon, tail to Mara, reading: ...", "a square-cornered cream caption rectangle at the top left
  of panel 1, reading: ...", "a label rectangle beside Teo reading: Teo, security reviewer". A
  screen message is an enlarged card at page size ([clear-first.md](clear-first.md)).
- For a silent page, write "no balloons, no text, no captions".
- Put a TIME line before panel 1. Repeat it in any panel it affects, and name the sky seen through
  windows. Pages that share a place and hour paste the same setting block and TIME line word for
  word.
- Counts above about four are unreliable in small panels. Stage them in rows ("three in front, three
  behind") or leave them uncounted.
- State relative sizes against the body: "the cat is about half the height of her torso".
- State a costume or object in the scene block and again in each panel that shows it.
- Write printed words in the case that will print. A direction that calls for capitals returns
  capitals, so a script line in mixed case prints in capitals and fails an exact-text check.
- A word in the prompt draws what it names. A rule like "no gray" written with the word gray, a
  season word that adds colored foliage, or "faintly" that asks for a third tone will show in the
  image. State the rule once in positive terms ("two inks, black and orange, on white paper") and
  remove every contrary word.
- A limited-ink style may finish with one deterministic print pass that thresholds every pixel to
  the inks. Run it once on the original render, never chained, and log the threshold.
- Before the first page runs, read the shared light clause against every panel clause. A shadow that
  climbs a wall the same prompt calls solid black loses the story beat.
- Open every page prompt with the one-line style command from [style-library.md](style-library.md),
  and end the art direction with the FORBIDDEN list.

## Fix through the prompt first

A defect usually traces to one clause. Replace that clause. Do not append a history of corrections.

| Defect                               | Cause in the prompt                    | Replacement that worked                                         |
| ------------------------------------ | -------------------------------------- | --------------------------------------------------------------- |
| Lit lamps after "no fire"            | The light source was never named       | Name the only light and place it. Forbid the others             |
| Built structures in a natural place  | "Doorway" or "alcove" with no material | State the material, say nothing is built, list forbidden items  |
| Rider fused with mount               | Relative position left open            | State order, gap and the rein as one visible line               |
| Piggyback drawn as a shoulder ride   | Legs anchored to the wrong body part   | Anchor at the carrier's hips, "nothing in front of the belly"   |
| Beard or hair changes                | Only one of them described             | Describe hair and facial hair together from the sheet           |
| Crowd missing                        | Only implied                           | Stage it: count, rows, position between named characters        |
| Legs cut off                         | Foreground prop, framing unspecified   | Full-figure camera, feet on the floor, prop at the panel edge   |
| One figure walks against the group   | Direction given for the group only     | Give each figure's direction: chest, face, knees, feet          |
| Costume lost                         | State written once                     | Repeat the costume in the scene block and each panel            |
| Two identical hands                  | Handedness unspecified                 | Left hand on screen left, right on screen right, thumbs inward  |
| Long prop shrinks                    | Length stated in one panel             | State length against the body in every panel it appears         |
| Wrong architecture                   | The reference image itself shows it    | Name what to take from it and what to ignore, or edit the image |
| Extra object                         | A shared block contradicts a panel     | Remove the shared clause                                        |
| Wrong time of day                    | In the plan, absent from the prompt    | A TIME line, repeated in each affected panel                    |
| Text that should go                  | The balloon was a quoted clause        | Delete the quote and write "X says nothing: no balloon"         |
| Absent character appears (seen once) | Named in a shared clause as absent     | Say who is in the scene. Avoid naming the absent one            |

Before blaming one clause, search the whole prompt for words that contradict the fix. A "night" in
the style paragraph defeats a morning TIME line.

Do not answer every failure with more references or a longer list of prohibitions. When two rewrites
of the clause leave a defect in place, record it as a residual and ship the stronger try.

## Proof pass

Draw every page once at a low-cost quality value before the final pass. Take the value from the
schema: the middle of its range (`medium` on the model tested), never the lowest.

- In one test, a proof kept the final's panel layout, scene content, balloon placement and every
  printed word. Figure scale, faces and some hand positions changed. The proof cost about a tenth of
  the final and took nearly the same time.
- Read the proofs for words, beats, layout and reading order. Run the lettering check and the cold
  read on them.
- Fix what they show in the prompt text: a wrong word, a missing beat, a confusing panel, a hand
  over a label ("her finger stays below the button label").
- The final is a fresh generation from the same prompt and references at the highest quality value.
  Never attach a proof as a reference and never edit one. A seed, where the schema has one,
  reproduces a run only with every other field unchanged, and the quality value changes, so judge
  framing and faces on the finals.
- Sheets and the style round skip the proof: faces and line are what they decide.

## Running pages

1. Write each prompt to a file before sending it. The file is the record of what was asked.
2. Proof the two pages with the most words first, together, and apply the lettering test on them.
   Tune the template.
3. Then submit every other proof at once, up to the team's concurrency limit, with `wait: false`,
   and collect with `jobs_wait`, which takes no timeout. A return of `in_progress` is not a failure:
   call it again with the returned `pending_job_ids`, and never relaunch or cancel a launched job.
   Never review one page while the others wait to be submitted. After the proof fixes, submit all
   finals at once the same way.
4. A 429 with `actionName` and `actionLimit` in `details` means the team's concurrency ceiling. Hold
   that many jobs in flight.
5. After a transport error with no HTTP status, call `jobs_list` before any re-run. The job may have
   landed.
6. Record the job ID right after each `model_run`. Download or file the asset the same hour.
7. Pages that share a failing recipe (a pose, a location) wait until a representative page passes.
8. Keep the reference IDs with each prompt file. A redraw starts from that prompt.

## Size

Choose the size by the deliverable (see [intake.md](intake.md)), in the closest portrait ratio the
schema allows. Read the real size back from the asset with `asset_get`: a model can return less than
requested.

Models often ignore margin instructions. Put captions and balloons inside panel interiors, never on
the page edge, and run the style round at the pages' aspect ratio.
