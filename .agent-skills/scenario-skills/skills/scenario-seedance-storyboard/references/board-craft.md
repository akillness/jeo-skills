# Board craft and the coherence gate

Drawing the board, then proving it is fit to spend a video run on. Read this before generating
panels.

## Drawing the panels

Draw them light. Thin pale pencil line, bare white paper, the setting indicated by two or three
quick lines and no more, no heavy shading and no rendered environment. This rule binds wherever the
board is passed to the video model, which is the scripted lane; a chained run never shows it the
board, so there the register is insurance for the human reviewer rather than the mechanism. The
board is a plan, and a board drawn as a competing picture gets treated as one.

That is the whole finding, arrived at the expensive way. A photoreal board leaked its panel numeral
into 6 of 8 delivered shots with the prompt held byte-identical, while a pencil board leaked none,
and the pencil delivery was fully filmic because the plates and key frames supplied the surfaces.
But a _heavily drawn_ pencil board, full environment in every panel and dark confident arrows, still
rendered its motion arrows into the delivery as real arrows floating in shot: three runs, and no
prompt clause suppressed one. Redrawn light, with the same arrows in the same places, the same board
delivered 48 of 48 frames clean.

So markings are safe on a light board, and that includes motion arrows, which means the annotated
board a human actually wants to review is the same board the model gets. Draw arrows broad, soft and
pale, feathered rather than solid, so they read as gestural annotation. Numbering and captions have
never transferred from any pencil board: 0 leaks in 93 opportunities across four runs.

Two things carry that result and both belong in the prompt, not the drawing. Declare the marks as
guides rather than prohibiting them, and pass photoreal key frames as concept art so the model has a
photographic source for appearance instead of the drawing. Both are in
[video-prompt.md](video-prompt.md), which is worth reading before the run rather than after it.

Give each character its own plate rather than a combined sheet. Seedance 2.5 takes up to 30
`referenceImages` and the prompt binds them by index, so `@image1` is fighter A and `@image2` is
fighter B, each at full canvas and unambiguous. A pencil board carries no surfaces of its own, so in
the scripted lane the plates do double duty: holding the cast steady while the board is drawn, then
supplying identity and material to the video run.

Pick the plate and board model for legible in-image text, strict grid adherence, and
`referenceImages` input so panels lock to the plates; shortlist with `recommend`, stating those
three needs in the user's own words (at authoring time `model_openai-gpt-image-2` did all three),
and since `recommend` can answer this step with style LoRAs, hold each hit to all three before
picking. A board is a large canvas: it can exceed an unstated total-pixel ceiling even inside the
schema's per-axis limits, and a height like 1080 can miss the schema's `step`, so read the error and
adjust.

Generate the panels as individual images rather than one grid, then compose the grid. One bad panel
then costs one panel instead of the board, which is the same reason `scenario-storyboards` runs one
`model_run` per panel.

## Filing, before anything is generated

A sequence produces dozens of assets: a plate per character, a panel per shot, a repair per failure,
a composed board, then the video. Loose in a project they are unrecoverable a week later, and the
panel you need to re-repair is indistinguishable from the one it replaced.

So create the collection first and add each artifact as it lands, rather than tidying up at the end.
The collection tools are catalog-only, so route them through `scenario_tools_search` once for the
schemas and then `scenario_tool_execute_write`:

- `collection_create` takes a `name` only, there is no description field, so put the sequence and
  the date in the name.
- `collection_add_assets` takes `collection_id` and an `asset_ids` array; batch each stage's output
  in one call.
- `collection_update` accepts a `thumbnail` asset id: point it at the composed board so the
  collection is recognizable in a list.

The payoff is retrieval: `search` with `target="assets"` accepts `filters.collection_ids`, so the
whole sequence comes back in one call, and a repaired panel sits next to the panel it replaced.

## Why the gate takes two passes

A board-level verdict hides panel defects. Three 12-panel boards each scored 88 and `pass` while one
of them carried a physically impossible frame: four gauntlets for two fighters, an unattached glove,
and a hilt guard floating with no blade through it. Twelve panels average their defects away.

Scoring the offending panel alone does not fix that by itself. The isolated broken-car panel came
back at 92 and `pass`, and the report praised the "chrome rims" that were the defect: two different
wheels, one without the whitewall its plate specifies, neither sitting in a wheel arch. The
AI-quality gate detects artifacts, not disagreements with a reference it has never seen.

So run both passes on every panel, and require both:

1. **Artifacts.** `asset_quality_gate_run` per panel (see `scenario-quality-gate`): 1 CU per new
   analysis, image assets only, an Enterprise add-on, so degrade to `asset_analyze` when it is not
   entitled. It reliably finds melted finger joints, warped dial numerals, and doubled blade edges.
2. **Differences.** Compare the panel with its plate, item by item. The baseline enumeration is the
   checklist, so read it as a spot-the-difference:
   - **Count**: hands, fingers per hand, arms, blades, wheels, headlights. Every one attached to a
     single body, and every hand to a single arm.
   - **Part to whole**: a wheel sits inside an arch, a hilt guard sits on its own blade, wheelbase
     and door length match the plate's silhouette, a reflection sits under the limb that casts it.
   - **Livery and costume**: every named detail, the whitewalls, the gold edging, the chain.
   - **Screen side**: the character stands where the script pinned them.

A panel fails if either pass fails. Do not average, and do not accept a board-level `pass` as the
bar.

The score is a weak signal for whether a repair worked. The broken wheel panel and its corrected
replacement both scored 92: what changed was the flaw list, from praising the mismatched rims to
naming a taillight housing. So judge a repair on the differences checklist and on the new `reasons`,
never on the number moving.

## Repairing one panel without re-rolling the others

1. If the board is already a single image, slice it: `model_scenario-image-slicer` with
   `xSubdivisions` and `ySubdivisions` (up to 6 each), 1 CU, returning the cells in reading order.
2. Regenerate only the failing panel, with the plates as references and the correction stated as a
   positive requirement rather than a prohibition. "Both wheels the same rim design with whitewall
   tires, each inside a wheel arch, the wheelbase of a full-size hardtop" fixes what "not deformed"
   does not. Keep the panel's caption text in the prompt so the replacement carries its own label.
3. Recompose with `model_scenario-compose-image` (Image Studio): one `layers` entry per panel with
   explicit `x`, `y`, `width` and `height`, `canvasMode: "custom"`, and the board's own canvas size.
   Read the canvas and per-layer field names off `model_schema_get` rather than assuming them: two
   clean-room runs guessed `canvasWidth` and `canvasHeight` from this sentence when it only
   described the size in words. Approved panels are pasted, not regenerated, so they survive
   unchanged.

   Keep the composed board's own aspect ratio between 0.4 and 2.5. Seedance rejects a reference
   image outside that range, and the run fails on an opaque internal error whose `hint` is the only
   place the range appears. A grid of 16:9 panels reaches it fast, and what decides it is columns
   against rows rather than either alone: the board's ratio is 16 times the columns over 9 times the
   rows. Four by two is 3.56 and fails, while three by three (1.78) and four by three (2.37) both
   pass, and a six-panel board wants two by three (1.19) rather than three by two (2.67). Compute
   that ratio for the grid you intend before composing, since it holds while the columns stay at
   most about 1.4 times the rows and the rows at most about four times the columns. Choose the grid
   for the ratio, not for the panel count.

4. Re-gate the replaced panel before spending the video run.

The economics are the argument: a repaired panel cost 47 CU against the 2730 CU video run it
protects, and a board that reaches the video model with a broken panel spends the whole run on a
sequence that cannot be delivered.

## What transfers from a panel to the video, and what does not

Not every panel flaw survives into the render, so know which classes to spend a repair on.

**Transfers.** Marks the video model reads as depicted objects rather than notation, which is a
property of how heavily the board is drawn rather than of the mark: a numbered badge on a photoreal
board burned into all 20 seconds of a delivered clip, and dark arrows on a heavy pencil board
rendered as arrows in shot, while the same marks on a light board transfer nothing. So does anything
that is a plan error rather than a rendering error, because the video obeys the plan: a mismatched
livery, a character on the wrong side of frame, a shot order that contradicts the script.

**Often does not.** Prop and limb geometry that the video model re-derives from scratch. A staff
duel whose panels were flagged five times over for hands merging into wood and staffs bending or
breaking still delivered a clean 24 seconds: rigid staffs, four distinct hands at the bind. The
panels were the worst of three sequences and the video was not.

So the gate is worth its cost for the classes that transfer and for proving the plan before a video
run, and a panel whose only defect is local prop geometry is worth one repair attempt, not three.
