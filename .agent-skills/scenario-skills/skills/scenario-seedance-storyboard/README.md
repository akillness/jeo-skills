# How this skill was built

Maintainer notes, not runtime instructions. Every rule in `SKILL.md` below is tied to the live run
that produced it, so a future edit can check whether the evidence still holds rather than re-arguing
from taste. All runs used Seedance 2.5 and GPT Image 2 through the Scenario MCP server.

## Why a separate skill

The pose-chain workflow existed nowhere in the repo: the only trace was one sentence in
`scenario-seedance-music-video/references/shots.md`, a supporting file of a different skill. It
could not be folded into `scenario-seedance` either, because that body was already at the top of the
house word target and the combined text would have blown the hard cap. The triggering conditions
also differ: the family skill fires on parameter and conditioning questions, this one fires on a
symptom ("limbs teleport", "motion resets at every cut"). A baseline probe with no skill installed
had the agent reconstruct the chaining mechanism itself and flag it as guesswork.

## Decisions and the evidence

### Pencil panels with photographic plates, not photoreal panels

Reversed twice, and the second reversal is the one that holds. The skill first said pencil, then
said photoreal on the strength of a 2x2 test, and now says pencil again because that test never
contained the cell that matters.

The 2x2 compared board style against number placement with the character sheet held constant, and
concluded photoreal because pencil-plus-render-sheet drifted toward posed action-figure plastic.
What it never ran cleanly was pencil board plus a _photographic_ plate. That cell was finally
measured with the prompt held byte-identical and only the register changed:

- Photoreal board: the panel numeral leaked into 6 of 8 delivered shots, despite an explicit
  negative clause naming it. The quality gate had flagged that numeral as "an unwanted watermark" on
  all 24 panels of the earlier boards and was overridden. It was right.
- Pencil board: 0 of 7 numerals and 0 of 8 captions transferred, and the delivery was fully filmic,
  candlelit stone and fabric weight, not plastic. The plate supplied the surfaces the drawing did
  not.

Repeated on a second run of the same board: 0 leaks in 30 opportunities across the two runs. The
mechanism, stated as narrowly as the evidence allows: a drawn board reads as notation and is
discarded, a photoreal board reads as picture and is copied. So the board's job is the plan, and the
plate's job is the look.

The user's original instinct, that a drawn board was the right input, was correct throughout. The
detour cost a badge burn-in and a run of numeral leaks.

### Arrows: a prohibition that lasted one commit

The reference board this skill was modeled on carries numbers, captions and motion arrows, and its
delivered video is clean. Reproducing that took five wrong explanations, and the prohibition written
after the fourth survived exactly one commit before the fifth attempt replaced it. The sequence is
kept in full because the wrong turns are the useful part.

**"Arrows always transfer."** Drawn from one crisp white vector arrow rendering beside the dancer's
hand. Killed by checking the reference board: `asset_get` confirms both the still and that heavily
arrowed board (six arrowed panels, including a thick block arrow) went in as `referenceImages`, and
16 samples of its delivery show no arrow anywhere.

**"Naming arrows in a negative clause causes the leak."** Pre-registered, then falsified by deleting
"No arrows, symbols or annotation marks of any kind in frame" and changing nothing else. The clause
changed how the arrow rendered, from crisp white to dark red, not whether it appeared.

**"The beats were not bound to their panels."** The original prompt names a panel in every beat and
restates each entry pose, and the leaking prompts did neither, which also meant they dropped two of
the six elements the skill's own table row 1 asks for. Falsified in the opposite direction: binding
produced _both_ of panel 4's arrows where the unbound runs produced one each. Explicit binding
raises panel fidelity, so more of the panel transfers, annotations included.

**"Reference starvation."** The runs passed a character plate as `@image1` while the clean original
passed a photographic still of the whole scene, so perhaps a plate leaves the model without a
template for the frame, pushing it to mine the board for appearance. Appealing, because it also
explains the binding result. Dropped without spending a run: identity held across all eight beats of
every run and the model built a consistent candlelit courtyard from prose alone, so nothing in those
deliveries looks like a model short of information. Seedance 2.5 taking a character sheet was never
the question.

At that point the skill said "never draw a motion arrow", resting on measurement with no mechanism.
The user then made the observation that resolved it, about the drawing rather than the
configuration: our board carried far more detail than the original, and its arrows were far darker.

| Run | Board              | Arrows drawn        | Guides named as guides | Concept art  | Panel 4   | Panel 7   |
| --- | ------------------ | ------------------- | ---------------------- | ------------ | --------- | --------- |
| A   | heavy, dark arrows | 5 panels            | no, prohibition only   | no           | 1 arrow   | both      |
| B   | heavy, dark arrows | 5 panels            | no                     | no           | 1 arrow   | clean     |
| C   | heavy, dark arrows | 5 panels            | no                     | no           | **both**  | both      |
| D   | light, soft pale   | 5 panels, same spot | yes                    | 3 key frames | **clean** | **clean** |

Arrow placement was held identical across all four runs, so panels 4 and 7 are directly comparable.
Panel 4 went from 3 of 3 leaking to clean, and run D swept 48 of 48 frames with nothing on screen.

So the rule is not about arrows at all. It is about how heavily the board is drawn: a board drawn as
a competing picture is treated as one, and its markings render as objects. Drawn light, the same
markings in the same places transfer nothing, which means the annotated board a human wants to
review is the same board the model gets, and the two-board workaround is unnecessary.

Run D is a deliberate bundle of three changes, accepted as such rather than spending more runs on
decomposition: the light board, the guide declaration, and the concept art. The cause is
undetermined among them, and the cheapest decomposition if it ever matters is to drop the concept
art and keep the other two, since concept art is the most expensive of the three to mandate. Two of
the three earn their place on other grounds anyway: run D is the best-looking delivery of the
session, its courtyard consistent with the key frames rather than reinvented.

The prompt wording is the part that would not survive paraphrase, so it moved to
[references/video-prompt.md](references/video-prompt.md) verbatim rather than being described. The
load-bearing discovery inside it is that a prohibition failed three times where a definition worked:
"the storyboard's frame borders, panel numbers, caption text and motion arrows are planning guides
drawn on paper by the director. They describe the shot, they are not objects in the world."

### Verification has to sweep, not sample

Run B's eight-beat check sampled panel 4 at 10.5s and came back clean. The arrow appears at 11.0s.
Only a two-frames-a-second sweep of the whole clip caught it, and without that sweep this section
would have recorded a false result. A leaked marking can fade in part-way through a shot, so one
sample per shot is not a check. That is now a rule in the skill rather than a lesson in this file.

### Panel numbers: a non-problem once the board is pencil

This question absorbed three rounds and turned out to be downstream of the register. An early run
burned a white panel-number badge into the top-left corner of a 20-second clip, surviving an
explicit "no panel numbers" clause, which read as proof that numbering must sit outside the frame.
Then a controlled test had neither badge-inside board leak, which read as prominence rather than
placement. Then a photoreal board leaked its numeral into 6 of 8 shots despite the negative clause.

The resolution: numbering leaks from photoreal boards and not from pencil boards, at 0 of 14 across
two runs. On the pencil board the skill now prescribes, numbering is safe in frame or under it, and
the corner check stays only as cheap insurance. What survives from the whole detour is the smaller
lesson, which did keep proving true: never trust a negative clause to remove what you drew.

### One plate per character, not a combined sheet

Seedance 2.5 accepts up to 30 `referenceImages` and the prompt binds them by index, so `@image1` can
be one character and `@image2` another. A combined turnaround gives each character an eighth of a
canvas and leaves the model to work out which figure the prompt means. Per-character plates are
unambiguous and full resolution. The earlier grouped sheet was habit, not a constraint.

### The plate is load-bearing at video time, not just upstream

Recorded here in its original form because it was wrong and the correction matters. The observation
was real: a photoreal board carried identity with no character plate in the video call, matching the
best plate-bearing run, which suggested the plate's only job was keeping the cast consistent while
the board was drawn.

That conclusion does not survive the register reversal. A photoreal board can carry identity alone
because it _is_ photographic reference, and it is exactly that property that burns its numbering
into the delivery. A pencil board carries no surfaces, so on the board the skill now prescribes the
plate supplies identity and material to the video run and dropping it is not an option. The plate
does both jobs, upstream and at video time, in both lanes.

### Cinematic labels, not action verbs alone

The first fight boards read as twelve pictures rather than coverage. Labeling every panel with
number, shot size, angle, lens or camera move, then three action verbs, and arranging the panels as
real coverage (master first, hold the axis, climb the size ladder, punctuate with inserts and
reactions) produced boards and videos that read as filmed sequences. The vocabulary itself is
standard cinematography that a model already knows, so `SKILL.md` spends its words on the
instruction and the coverage rules rather than on a glossary.

### Seedance 2.5, discovered but not trusted to rank first

`search` with `query="seedance"` returned 2.5 **last, at relevance score 0**, while 2.0 ranked first
with a 15-second duration cap that cannot deliver a 24-second sequence. So the skill tells the agent
to scan every hit for the newest non-deprecated generation instead of taking the first, and says why
2.5 is the target: the largest reference count in the family and the best identity hold.

### An approval gate before any video run

A board costs a fraction of a video run, so the skill stops for approval on the script, the plates
and the numbered board, and invites a reshoot by panel number. Re-running one panel is a single
board call with that clause changed and the approved board passed as a reference.

### Scripted run versus chained lane

A single scripted run does not deliver a cut per scripted timecode. Against eleven scripted
handoffs, detected hard cuts were 0, 2, 2 and 6 across runs: the model renders most handoffs as
camera moves. That satisfies continuity, which is the point, but it is not editorial control. Twelve
discrete shots require the chained lane.

In the chained lane the pose chain protects motion and nothing else. Boundary stills are independent
generations, so costume detail drifts between them (a mask, a helmet crest, a metal finish) and
every drift lands on a cut. One clean-room run also mirrored two of its seven stills, which would
have asked the fighters to swap sides mid-shot. Hence: pin screen position as well as pose, hold the
framing, and review the stills as a set before spending a video run.

### Why the chained lane lives in a reference file

Body words load on every trigger. After the fixes the body reached the point where the next lesson
would break the 1400-word hard cap in force at the time, and the chained lane is per-mode detail
that only a chained run needs (four of five live runs used the scripted lane). It moved to
[references/chained-lane.md](references/chained-lane.md); the lane choice, the mutual-exclusion trap
and the cost model stayed in the body.

## What the chained-lane validation added

A clean-room agent was given a 40-second knife duel that had to open on an exact pose, which forces
the chained lane, with only the installed skill as documentation. It picked the lane from the one
sentence about reference mode anchoring frame one, followed the link to the reference, applied all
four disciplines, and verified every join for free from `asset_get`. Frame one was the specified
locked-blades pose and all three joins were the same pose either side of the cut. Four defects came
out of it:

- **The board and the image budget could contradict each other.** Two plates, a board and five
  stills hit an eight-image ceiling exactly, leaving nothing to re-render a drifted still, which is
  the dominant failure in this lane. The reference now ranks the board below a reserved repair slot
  and says why: the board is never passed to the video model here.
- **No plate or board model was named at runtime.** The only named one lived in this file, which the
  agent correctly discounted as maintainer notes. `SKILL.md` now carries a hedged authoring-time
  example alongside the selection criteria.
- **A height like 1080 can miss the image model's `step`,** failing as an opaque internal error.
  Folded into the existing canvas sentence.
- **A shot can be refused on its generated audio, not its picture.** `generateAudio: false` clears
  it. Covered in the reference, with the instruction not to leave one shot silent while others carry
  sound.

## The coherence gate, and why the quality gate alone is not it

Two boards reached a video run carrying frames that break physical sense: an extreme close-up with
four gauntlets for two fighters, an unattached glove and a hilt guard floating with no blade through
it; and a low-angle wheel shot whose car had two different wheels, only one whitewall, no wheel
arch, and a toy-proportioned body. Neither survives a viewer's first glance, and both cost a full
video run.

Three measurements shaped the gate that now exists:

- **A board-level verdict hides panel defects.** All three boards scored 88 and `pass` at high
  sensitivity while carrying those frames. Twelve panels average their defects away.
- **Scoring the panel alone does not fix that either.** The broken-car panel, scored in isolation,
  came back 92 and `pass`, and the report praised the "chrome rims" that were the defect. The gate
  detects artifacts; it has never seen the plate, so it cannot know the car should wear matching
  whitewalls in proper arches.
- **The score is a weak signal for a repair.** The corrected wheel panel also scored 92. What
  changed was the flaw list, from praising the rims to naming a taillight housing. Judge a repair on
  the differences checklist and the new `reasons`, not on the number.

So the gate is two passes per panel, and a panel must clear both: `asset_quality_gate_run` for
artifacts (it did find melted finger joints, warped speedometer numerals and doubled blade edges
that the eye skipped), and a spot-the-difference against the plate for anything only wrong beside
the reference. What the two passes found together, across three boards: samurai 4 and 10, cars 2, 3,
8 and 11, dancer 3, 7 and 8.

Repair is by replacement, not by re-rolling the board: slice with `model_scenario-image-slicer`,
regenerate only the failing panel with the plates as references and the correction stated
positively, then recompose with `model_scenario-compose-image` so approved panels are pasted rather
than regenerated. Measured cost of the loop: 1 CU to slice, 1 CU per panel scored, 47 CU per
repaired panel, 2 CU to recompose, against 2730 CU for the video run it protects.

One honest side effect: replacing a whole cell replaces its caption too, so a repaired panel's label
renders at a slightly different size from its neighbors. Compositing only the art region over the
original cell would avoid it, at the cost of locating that region per board.

## The full-flow validation, three sequences from scratch

Three new sequences were built end to end through all nine steps: a flamenco courtyard, a staff duel
on a temple terrace, and a 1970s night rally. New cast, new compositions, 8 panels each at 3
seconds, 24 panels generated individually, all 24 gated, 8 repaired, 3 boards composed, 3 videos
delivered.

What it proved and changed:

- **Per-panel gating localizes what board scoring hid.** Six panels warned or scored low across the
  three sequences, and every finding was specific: melted fingers on the floreo, warped rally dials,
  a staff broken into two misaligned segments, a driver's hand fused to the wheel. All had passed my
  own eye first.
- **The differences pass caught what the gate never mentions.** In one rally panel the yellow car
  sat ahead of the white, contradicting the brief. Every score on that panel was fine.
- **An intentional annotation reads as a defect.** The gate flagged the small in-frame panel numeral
  as "an unwanted watermark" on every single panel, depressing scores by a design decision. Worth
  knowing before treating per-panel scores as absolute.
- **A composed board must stay inside a 0.4 to 2.5 aspect ratio.** Two 1080p runs failed outright on
  a four-by-two grid of 16:9 panels (3.56). Three-by-three (1.78) passed. Only the job record's
  `hint` names the range.
- **Some panel flaws do not reach the video.** The staff sequence was the worst-scoring board of the
  three, flagged five times for hands merging into wood and staffs bending, and it still delivered a
  clean 24 seconds with rigid staffs and four distinct hands at the bind. Prop geometry gets
  re-derived; burned-in graphics and plan errors do not. That distinction now sits in the reference,
  because it decides how many repair rounds a flaw class deserves.

Also measured: the actual spend for the whole PR came to about 26k CU, against a running estimate of
41k that had been accumulated from per-call arithmetic rather than read from `usage`. Read the
meter.

## What the plan-only validation found

A clean-room agent, given only the installed skill and a 24-second eight-shot fight brief, produced
an 85-call plan and followed every rule this PR added without prompting: light board, diegetic audio
with no instrument named, the 2 fps sweep, the 0.4 to 2.5 board ratio (noting correctly that it only
binds when the board is actually passed), per-panel gating, collection before generation,
`jobs_wait` with `pending_job_ids`, discovery instead of an asserted model id, and `aspectRatio`
omitted in first/last-frame mode. It flagged eight uncertainties rather than guessing.

It also found that the brief was impossible, which no one on this side had noticed. `SKILL.md`
routes discrete shots to the chained lane, but `duration` accepts only -1 or 4 to 30, so eight
chained shots occupy at least 32 seconds while the scripted lane will not honor eight cuts in 24.
The worked example compounded it by scripting twelve shots across 24 seconds, two seconds each. Six
defects came out of it, all fixed:

- **The duration floor was never stated**, so the lane's cost arithmetic invited impossible plans.
  Now in the body and spelled out with the numbers in the chained-lane reference.
- **The size ladder and hold-the-framing contradicted each other.** Both sides of a chained cut are
  the same frame, so shot size cannot change at a join. The agent called this the hardest decision
  in the task and resolved it by inference. Now reconciled explicitly.
- **`video-prompt.md` read as lane-neutral** while two of its seven sections only apply to the
  scripted lane, and the chained lane had no prompt shape at all. Now labeled, with the five
  sections that carry over named.
- **Step 8's key frames had no home in the chained lane**, which has no `referenceImages` slot. The
  boundary stills are the key frames; said so.
- **The board was the approval artifact in one file and "the first thing to drop" in another**,
  which bit immediately because the brief asked for storyboard sign-off.
- **No step elicited the creative brief**, though the plate is load-bearing everywhere after it.

Two things were deliberately not filed as defects. The agent named `numImages` where the real
parameter is `numOutputs`, but the skill never discusses image-model parameters and the plan had
already scheduled the schema read that would have caught it. And all six named siblings were absent
from the clean room, which is the known install-resolution gap: the invitation sentence fired
correctly and the agent flagged the affected phase instead of inventing a model id.

The lesson for this file: five paid video runs found the register and arrow rules, and one free
plan-only run found a correctness bug that would have sent a user down an impossible path. Run the
cheap test first.

## Felt cuts are not what either lane delivers

Two clean-room agents, given different briefs, both asked for cuts a viewer could feel, both chose
the chained lane because `SKILL.md` routed discrete shots there, and both then extrapolated the same
untested workaround: render each boundary twice, one still per framing, and treat the pair as a
match cut. Neither had documentation for it. Both invented it from the same sentence, which said a
size change at a join "would need two different stills of one pose" as a reason it could not work. A
sentence that reliably produces the inference it was arguing against is a defect whatever it
intended.

The measurements say neither lane gives editorially distinct cuts. The scripted lane converted
eleven scripted handoffs into 0, 2, 2 and 6 detected hard cuts across four runs, rendering the rest
as camera moves. The chained lane makes both sides of a join the same frame, so the coverage size
cannot differ across it and the join reads as continuous motion by construction.

So the skill now says what it delivers in the Overview rather than leaving it to be derived after a
lane is chosen, stops describing the paired-stills mechanism, and routes the want to where it
actually works: deliver the continuous take and cut it at your own points with
`scenario-video-editing`. The momentum is real because it was one take, the cuts are real because an
editor made them, the cut points are exact and free to move, and nothing needs re-rendering.

The paired-stills idea was deliberately not priced as an option. It is unmeasured, it doubles the
still budget, it cannot be checked without a paid video run, and recommending an untested technique
inside a skill whose whole purpose is to stop an agent guessing would undercut the rest of the file.
Two independent agents converging on it is a reason to close the inference off, not to bless it.

The `description` was left alone on purpose. Someone who wants six felt cuts should still trigger
this skill, because it now carries the answer for them; narrowing the keywords would hide the
guidance from exactly the reader who needs it.

## The six plan-only defects, and one caught by verification

A third clean-room run on a scripted-lane brief (the first two both chose the chained lane, so the
scripted half had never been read cold) came back a pass with six non-blocking items. All six are
fixed: the compose canvas fields now say to read them off `model_schema_get`, `generateAudio`'s
default-on is stated so sound needs no flag, the audio check is named as eyes and ears with the
warning that a useless run looks like a good one, the grid guidance generalizes, the caps are read
before the script is written, and the deliverable statement moved to the Overview's third sentence.

That run also confirmed the earlier fixes in a way a repeat brief could not have: the duration floor
was used in reverse, to disqualify the chained lane at "4 s floor x 6 shots = 24 s > 20 s", and the
audio lane scoping held with `generateAudio: true` in a scripted prompt and no confusion with the
chained lane's picture-only rule.

The fix for the grid item was wrong on the first attempt, and how it was caught is the part worth
keeping. Replacing two correct examples with a general rule produced "three columns is the most that
stays inside the range", which is false: four by three is 2.37 and sits inside it. Worse, the rule
was unsound in both directions, since "at most three columns" permits three by two at 2.67, which
the same sentence names as a failure, and it forbids four by three, the natural layout for this
skill's own 12-panel worked example. A five-panel board obeying it lands on 3x2 (2.67) or 1x5
(0.356) and fails either way.

Nineteen candidate findings came out of four verification passes over the diff, run with distinct
lenses: lost content, internal contradiction, whether each fix closes its defect, and mechanical
compliance. Seventeen were rejected under adversarial re-check, including two that attacked the same
grid paragraph for having wrong numbers, which it did not. The two that survived were the two that
correctly identified the rule rather than the arithmetic as the error. Both proposed stating the
formula, which is what the file now does.

The lesson is narrower than "verify more". Replacing correct-but-narrow examples with a general rule
is the single riskiest edit in a reference file, because a confidently stated wrong rule is worse
than the vague text it replaced, and it reads as more authoritative. Two attacks on the
canvas-fields fix were also rejected here on solid evidence, one verifier checking the live schema
and another the sibling `scenario-video-assembly` skill, both confirming `canvasWidth` and
`canvasHeight` are real. A harness that rejects seventeen of nineteen findings is doing its job in
both directions.

## Open questions

- How reliably a single-panel reshoot holds the other panels. Verified once: with the approved board
  passed as a third reference and only panel 9's clause changed, panel 9 was corrected and the other
  eleven panels came back unchanged, labels included. One trial is not a guarantee.
- Whether the register finding generalizes to non-photoreal deliveries: an animation-style board for
  an animation-style delivery should follow the same logic, untested.
- Which of run D's three changes suppresses the markings. Undetermined by design. One run separates
  the concept art from the other two.
- Where the line falls between a board light enough to stay a plan and one heavy enough to be
  copied. Only the two extremes have been measured.
