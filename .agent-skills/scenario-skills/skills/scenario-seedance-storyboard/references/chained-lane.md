# Chained per-shot runs

Per-shot detail for the second lane in `SKILL.md`. Read it when the sequence runs past one job's
duration cap, when each shot needs its own control, or when the sequence must open on an exact pose.

## The chain

Draw the board first: it is the cheap place to catch a broken chain, and it stays the artifact the
user approves, exactly as in the scripted lane. What differs here is that the video model never sees
it, so its register and its markings cannot reach the delivery and the set review below covers the
same ground the board would. That makes the board the one item a user can knowingly trade away for
another image slot when the budget is tight, which is their call to make and not a default. Keep one
slot in reserve either way, for re-rendering a drifted still. Then render each boundary pose as a
still and run each shot in first and last frame mode, so shot N takes `image` = boundary still N-1
and `lastFrameImage` = boundary still N. Adjacent shots share the still, so every cut lands on a
frame both sides already agree on. N shots cost N+1 stills and N runs, plus one plate per character.

A departure, a return or a change made off camera lands on a boundary still: the still after the
exit shows the frame without the character, and the still after the return shows them back with the
change visible. The shot that runs into that still writes its TIMELINE exit pose as position and
posture (where she stands, hands at her chest) and does not name the changed detail, which
`lastFrameImage` carries; the next shot, whose `image` shows it, is the first prompt that names it;
when the return is the last shot, nothing names it and the still carries it alone.

Count the seconds before the stills. Each run carries its own duration floor, 4 seconds on 2.5 at
authoring time, and takes whole seconds only, so N shots occupy at least N times that floor, a
sequence cannot be shorter, and any total has to be reachable as a sum of N whole numbers at or
above it. Eight discrete shots is 32 seconds at the floor, not 24, and twelve is 48. When the brief
asks for more cuts than the arithmetic allows, the choice is fewer shots, a longer sequence, or the
scripted lane's camera-move handoffs instead of cuts. Read the floor off `model_schema_get` rather
than trusting this number, and settle it with the user before rendering nine stills for a sequence
that cannot exist.

This mode excludes `referenceImages` (mutually exclusive with `image`), so the stills are the only
identity a shot gets. `aspectRatio` is ignored here too: the output adapts to the first frame, so
the stills set the delivered shape.

## Rendering the boundary stills

The sheet makes each still plausible on its own, not identical to the next. Three disciplines close
that gap, and all three are cheaper than a re-run:

- **One baseline prompt, one varying clause.** Keep the prompt byte-identical across the set and
  change only the pose clause (see `scenario-consistency`).
- **Pin screen position, not just pose.** A named pose is not a named position: say which side of
  frame each character holds in every still. A mirrored still asks two fighters to swap sides
  mid-shot, which breaks the cut as hard as a wrong limb.
- **Hold the framing.** A shot whose camera travels cannot land on a boundary drawn from the anchor
  framing. Pick continuity over camera variety, or move the camera inside a single shot only.
- **Shot size cannot change at a join.** This lane and the size ladder in `SKILL.md` pull against
  each other, and the mechanism decides it: both sides of a chained cut are the same frame, so the
  coverage size on either side of it is the same too. Climb the ladder with camera moves inside
  shots (crane down, dolly in, push, pull back), and accept that the joins read as continuous motion
  rather than as visibly distinct coverage. When the brief needs cuts a viewer can feel, deliver the
  continuous take and cut it at those points with `scenario-video-editing`: that route is reliable,
  and no generation-side trick for producing a felt cut at a join has been measured here.

These stills also absorb `SKILL.md` step 8: there is no `referenceImages` slot in this lane to pass
concept art through, so the boundary stills are the key frames, and they carry the delivered look as
well as the poses. Render them photoreal at the delivery ratio for that reason.

Then review the whole set together before spending one video run. Costume detail drifts still to
still, a mask, a helmet crest, a metal finish, and because the stills sit on the boundaries, every
drift lands on a cut. Regenerate the offending still, not the delivered shot.

## Verifying the joins

Free, and exact: `asset_get` returns each clip's `firstFrame` and `lastFrame` as their own asset
ids, so `asset_display` the outgoing `lastFrame` against the incoming `firstFrame`, one pair per
join. Both must read as the same pose. When a delivered ending beats the drawn one, pass that clip's
`lastFrame` asset id as the next shot's `image` instead of the drawn still, and rewrite that shot's
STARTING STATE and its TIMELINE beat's entry pose to what the frame shows rather than what the
script planned.

## When a shot is refused

A per-shot run can be rejected on its generated audio rather than its picture, which reads as a
content refusal on a fight that is fine to look at. Re-run that shot with `generateAudio: false`. Do
not leave some shots scored and one silent: lay the master picture-only and score the assembled cut,
which is the rule anyway.

## Repairing one shot

Render the shot's two boundary stills, split the master at its timecodes, regenerate the shot
between them, and rejoin (`scenario-video-editing`, `scenario-video-assembly`). Score once over the
assembled cut, never per shot: the sound lanes are in `scenario-seedance`.
