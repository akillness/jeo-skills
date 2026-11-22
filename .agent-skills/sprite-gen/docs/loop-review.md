# Loop automation and visual review

Use the normal pipeline first. No model needs to choose every cut:

```bash
sprite-gen video-loop --frames-dir keyed/ --out-dir loop/ --state run --fps 24
```

The caller must pass the **measured source fps**, not always 24. `video-set` obtains it
from `video-frames`. `video-loop` defaults to `body` for walk/run and `none` otherwise;
`video-set` defaults to `none`. The default clip
request remains 3 seconds; it does not determine the playback speed.

## What the script decides

- It measures repeat candidates from the keyed frames and the state's time window.
- It scores the last displayed frame -> first frame against ordinary adjacent motion,
  reducing repeated-pose stalls at a loop boundary.
- Gaits below the duration floor may use a double period, as before. Above that floor,
  similarly credible non-exact candidates at P and approximately 2P now retain 2P once
  when it fits the window and passes the periodicity gate. Keeping two real repetitions
  is preferable to discarding a potentially distinct phase. This may produce a two-cycle
  loop of a genuine short gait; frames keep their original timing.
- Nothing is cut shorter than the period found. A half or a third of it that repeats is
  recorded as a suspect (`cycle.fundamental.suspects`); look at
  whether the loop shows one stride or two, and tell `video-cycle-align` with `--cycles`
  ([loop repair](loop-repair.md) section 4).
- Near-exact short repeats, implausible longer repeats, and non-gait states are not
  extended by that ambiguity policy. There is no character-specific frame count.
- Alpha, frame counts and seam metrics are checked before the output is accepted.

A numeric pass establishes those facts. It does **not** establish correct foot contact,
anatomical left/right alternation, a believable gait, or that the source was drawn well.
`cycle.review_recommended = true` marks an ambiguous-harmonic choice; `false` means
that this particular heuristic did not flag ambiguity, not that visual quality is certified.
The direct CLI summary preserves that flag and the guard evidence. `video-set` also
propagates them in its item report and marks the table row `OK (review gait)`.

### The body anchor and the seam gate

`--anchor body` is `video-loop`'s default for `walk` and `run`. It measures the cut's
last frame's head and torso offset against its first once (strip sidecar `wrap_dx_px`)
and ramps frame k by that offset times k/L; the loop plays cells that are not the source
frames. The seam gate (`--seam-max`, default 2.0: wrap against mean step) reads source
frames (`seam_measurement: source-frames`) unless RIFE made a frame
([loop repair](loop-repair.md) section 2) or anchor is `motion` or `motion-auto`
(`rendered-cells`). Where source frames refuse, `wrap_dx_px` moved cells, no frame was
made, and the cut is gated by its seam (neither pinned nor played once), the gate reads
the cells that play again; a cell given way to the frame beside it is read as filmed
(`seam_as_filmed`). The cut passes (`seam_measurement: rendered-cells`,
`resampled_seam_ratio`) when wrap and largest step against mean step both meet the
limit; otherwise source refusal stands. Passing cuts, `--seam-max 1000` included, are
not read again, keeping identical bytes.

Only where read again, `seam_after_anchor` records `source_seam_ratio`, `seam_ratio`,
`largest_step_ratio`, and `largest_step_into` (pass or fail). It also records `read`,
`drawings`, and `hold` for the cells read again, and its `largest_step_into` is the
first frame of a drawing. The ramp closes the wrap
of a cut whose frames at the wrap jump sideways and moves the jump a few frames into the
loop; read at the wrap alone, every such cut of the test walk passed (one or two frames
moved 2 to 10 px); a window of steps beside the wrap misses a jump one frame longer than
the window; every step catches a jump of any length. A test walk sliding 0.1 px/frame
(2.4 px over 24 frames) failed at 3.08 on source frames but passes on the cells that
play at 1.33 (steps within 2.0). The slide widens the mean step, so a swapped-leg
half-stride passes at 1.93 on the cells that play while the walk without the slide is
refused at 2.19 on source frames; the reading does not promise to refuse every wrap that
does not close. Repaired frames check the wrap alone, a walk whose ordinary steps are
uneven can read a step over the limit on the cells that play and is refused as before,
and `--anchor feet` reads source frames.

For any walk or run whose seam ratio gates the cut (neither pinned nor played once), the
seam is read between the loop's drawings rather than frame by frame, using each drawing's
first frame (`loop.seam_drawings`, built on `repair.flow_drawings`), the same reading the
step gate uses. This applies in three places: the seam gate itself, both on
source frames (`seam_measurement: source-frames`) and on rendered cells (`rendered-cells`:
`--anchor motion` or `motion-auto`, a frame made by repair, or the body anchor rule); the
body anchor's ramp rule on the cells that play, reading both the wrap and every step
between the cells' drawings; and `--anchor motion-auto`'s candidate seam gate before a cut
is taken (`loop.seam_on_cells` through `loop.wrap_on_cells`), which chooses among two-step
cuts from foot crossings and judges overlapped wrap attempts. A loop showing fewer than
three drawings is read on every frame (`seam_read.read: cells`), as the step gate skips
such loops. A walk drawn a frame each (hold 1) has every frame a drawing, giving the same
values, the same failure line, and the same loop files byte for byte. Reports record
`seam_read` (`read`, `drawings`, `hold`) on every walk or run whose seam ratio gates the
cut; `seam_after_anchor` gains the same three fields for cells read again, and its
`largest_step_into` is the first frame of a drawing. Strip sidecar `strip.json` and the
failure line of the seam gate do not change.

On synthetic test frames of a 24-frame stride side walk standing in place, cut one stride
from a drawing's first frame, the wrap reads 1.02 on twos and 0.95 on threes between drawings
and passes, where frame-by-frame readings were 2.13 and 3.14 (refused before). When sliding
0.3 px a frame and cut by hand with `--anchor body`, source frames still read 3.25 (twos)
and 2.38 (threes) between drawings, but after the ramp moves the wrap back, the cells that
play read wrap 1.02 and 0.98, and largest step 1.47 and 1.58 between drawings (passes, where
frame-by-frame cell steps of 2.41 and 3.31 were refused). Under `--anchor motion-auto`, the
side walk on twos cut at 0/24 reads 1.00 between drawings (2.10 frame by frame), and a second
side walker on threes reads 0.75 (2.40 frame by frame). For a walker on threes with a big
tail on its own beat, motion-auto's seam gate read tried two-step cuts at 3.81 to 4.07 frame
by frame; between drawings the first tried reads 1.35, but it is out of phase by 4.3 frames,
so the search's own cut stands. Jumps remain refused: a last drawing moved 10 px sideways
reads 4.10 (twos) and 2.85 (threes) between drawings; on the sliding walk the ramp moves that
jump into the loop, and the largest step between the cells' drawings is 5.52 and 2.45, so the
refusal matches `--anchor none`. A ramp limitation also still refuses 3 of 24 cuts on threes
sliding 0.2 to 0.3 px a frame: the ramp shifts cells by whole pixels, and where it moves the
frames of one drawing apart, cells read as a drawing a frame, reading largest steps of 2.85
to 2.99 on both the ramp rule and the step gate.

Known limits (measured on the synthetic walk standing in place, cut from frame 0):
- Between drawings, a wrap a few drawings off the stride reads as an ordinary step,
  because one drawing step covers two or three frames of motion.
- Cut length: drawn a frame each, cuts of 16 to 22, 28, and 30 frames of the 24-frame
  stride are refused (2.38 to 4.07; 23 and 26 pass). On twos, cuts of 16 to 28 frames pass
  (1.02 to 1.67) and 30 is refused (2.06). On threes, cuts of 16 to 30 frames all pass
  (0.95 to 1.48).
- Last drawing moved sideways: drawn a frame each, a last frame moved 2 px is refused
  (3.05). On twos, a last drawing moved 2 px passes (1.66) and 3 px is refused (2.03). On
  threes, it passes up to 4 px (1.73) and is refused from 6 px (2.14).
- Sliding 0.2 px a frame with `--anchor body`, the ramp passes cuts of 16 to 28 frames on
  twos (30 refused) and 16 to 30 on threes, a last drawing moved 2 px on twos (3 px refused)
  and up to 6 px on threes (8 px refused).
- The step gate, which already read between drawings before this change, passes the same
  cuts (largest step 1.26 to 1.86); the frame-by-frame seam gate refused every such held
  cut, closing ones included.
- Synthetic motion has a fixed amplitude, so a cut off the stride stays within it; these
  numbers do not translate directly into how visible such a cut is on a drawn walk.
- The seam value is a mean over the whole frame, so the body and legs weigh most; on the
  synthetic walk, the seam value between drawings alone does not see a small part (here
  the arm) jumping at the wrap of a cut that skips a third of the cycle: on twos, the
  16-frame cut has the arm cross its whole swing in one drawing at the wrap (a step moves
  a sixth) at seam 1.26, the 20-frame cut crossing half; on threes, the 22-frame cut has the
  stride drawings with the last shown one frame instead of three, a beat slip it cannot see.

## Material for a vision-capable reviewer

Provide the original clip, the generated loop played at source speed for at least three
repeats, the JSON report, and an ordered contact sheet with original frame indices. For
an ambiguous harmonic include both P and 2P candidates using the same size and fps.
A single still cannot establish a gait cycle. If the model cannot consume video, provide
ordered frames spanning at least two candidate cycles, including several frames on both
sides of the wrap. Do not ask it to judge motion from an unordered image collage.

A human or a vision-capable model should check:

1. Do the limbs alternate, or does one phase restart before its counterpart appears?
2. At the wrap, does motion stall, snap, or reverse compared with nearby frames?
3. Does the torso translate across the canvas, or are only the limbs/clothing moving?
4. Are deformation or contact errors already present in the source clip?

Return the evidence frame indices, chosen mode/start/length, anchor, reason and any
uncertainty. Keep that decision separate from the unmodified automatic report. A model
without the required visual input must not claim it reviewed the gait. Ambiguous or
contradictory visual evidence should remain unresolved rather than inventing a precise cut.

## Automatic XY correction and local cycle selection

For a fully automatic walk/run candidate, opt into `motion-auto`:

```bash
sprite-gen video-frames --clip clip.mp4 --out-dir frames/ --key auto \
  --spill auto --reference canvas.png --report frames.report.json
sprite-gen video-loop --frames-dir frames/keyed/ --out-dir loop/ \
  --state walk --fps <measured-source-fps> --anchor motion-auto
```

`video-set` takes the same path by default: each walk or run item whose loop is
searched is cut with `motion-auto` and its view, every other item with `none`,
and `--anchor none` cuts every item as before. Given explicitly,
`--anchor motion-auto` is used for every item, and other states and fixed/manual
cuts are rejected before generation. The defaults above remain unchanged. This
mode accepts no supplied regions or frame indices.

The script searches a grid in the upper part of the foreground for two separated,
textured regions. It ranks their normalized cross-correlation across time and
requires both to track throughout the sequence. These are stable image regions,
not semantic detections of a face, torso, species or limb. Untrackable patches are
counted as rejected candidates; absence of a usable pair is an explicit failure. Where the pair is
absent from the whole clip, the clip is read once more after the fewest frames it opens on, fewer than
the window's shortest cut, with which a pair tracks through the rest (`auto_motion.analyse_after_opening`):
a clip filmed from a still opens on that still and on the standing pose the body sets off from, where the
regions of the walk may be out of reach. Those frames are left out of the search as a lead-in is
([video-pipeline.md](video-pipeline.md) section 4), the report says so in `untracked_opening` and a
warning line, and where no such opening leaves a pair tracked the clip is refused as before.
The correlation at every offset of a search window comes out of FFTs: per channel,
the masked patch sum, its squared sum and its product with the centered reference are
window correlations, so the masked patch is never copied out once per offset. The
costs agree with that direct form to about 1e-6. On three 3 s walk clips at 544 px the
region search took 1.0 to 1.4 s of CPU instead of 22.6 to 37.4 s, and full loops cut from
the same frames gave the same cycle and byte-identical strips.

FFT rounding is not the same on every machine (numpy's builds differ by about 1e-14), and
a patch on a flat fill slides: several offsets match it alike. Costs within 1e-9 of the
lowest (`auto_motion.MATCH_TIE`) are one match, and the offset nearest the centre the
search was put on is taken; regions whose qualities tie on that grain are ranked by their
box. Before this the rounding chose, and a synthetic walk was cut at another start on
Linux than on macOS from the same pixels.

For selection only, the measured horizontal trajectory is locally fitted and the
vertical linear trend is removed (least-squares lines with exactly rounded sums,
`sprite_gen.util.lsq`, not np.polyfit, whose LAPACK solve rounds differently between machines:
the line moves the analysis frames by a fraction of a pixel, and its last bit can tip a bilinear
sample). Local lag minima can then identify a repeat in
a clip with changing drift or cadence. Selection requires repeat depth, active
motion around both boundaries, and a supported doubled recurrence when a short
step falls below the gait floor. Candidate ranking also penalizes drift that a
single linear correction could not remove. Among scores within 15% of the best,
the earliest repeat is used; exact cut quantization may differ by one frame from
the lag minimum. When the top of the silhouette jumps into that cut's first frame —
a staff or flag held above the head, swinging on its own beat — the candidates are measured
and the cut is chosen again among those whose top was read and closes ([loop repair](loop-repair.md)
section 3, "The seam pop"; `cycle.seam_pop`). A first choice whose top closes, or cannot be read, is kept and
nothing more is measured. Once it pops, the held part is read below its top as well, on the side
the top band sits on: a cut whose shaft closes under the hand is taken first, and where no cut one
step long closes it, a window two steps long — one cycle — is (`cycle.steps`, `strip.json`
`steps: 2`; [loop repair](loop-repair.md) section 3, "The held side"). Where the seam pop gate would
refuse the cut so chosen, the next of the search's candidates in search order is read, and the first of
up to four cuts the gate does not refuse is taken; if all four fail, the first choice stays and fails on
the loop. See [loop repair](loop-repair.md) section 3, "The seam pop gate", recorded as
`cycle.seam_pop_gate`. An explicit `--max-len` is
never widened, nor cut back to half the clip: an explicit window is the window, on every path that
sets a length (the count of steps and the one-shot failover below included), and a cut outside it
fails ([loop repair](loop-repair.md) section 3, "The step screen"). Without one, only
the gait fallback below looks past the state's window, and only after this search found nothing.

A walk whose two steps look alike — its legs drawn alike, from the side or a diagonal — can be found
one step long (or, past a tail on its own beat, three), and the search has nothing to refuse it on:
the step repeats. Where the clip shows its feet pass, the cut is counted on those crossings and is
two steps long — any length the count allows, past the window for a slow walk — joined at the walk's
own point (`cycle.step_count`; [loop repair](loop-repair.md) section 3, "The step count"). Where the far
foot passes hidden behind the near one, or the clip's view is given (`--view`) and is not `side`, the
crossings are asked whether they mark cycles instead of steps (`local_cycle.read_cycles`); where they do,
one crossing interval is two steps and the cut is one cycle long. The search's cut stands where no cut of
two steps closes in its place. Where the clip does not show its feet pass, the cut is screened the other
way, over the whole clip (`cycle.step_screen`): where twice it
repeats better than it, the report names it a suspect and nothing else changes. Look at the loop and
count its steps (how often each foot lands); `video-loop --steps 1` cuts it again two of its lengths
long, `--steps 2` keeps it and says so ([loop repair](loop-repair.md) section 3, "The step screen").

### The gait fallback: a slow walk, or a walk toward the camera

When the local search finds no cycle, `motion-auto` looks once more, for two things a
front or back gait does that the first search cannot see past. (A clip that changes size by 1 % or more, read one cycle on, is held at its first frame's size before the first search ([video-pipeline.md](video-pipeline.md) section 4, `size_hold`), and its feet are held on the first frame's row where they climb or sink by 1 % of the height or more over the clip, so the fallback below seldom finds anything left to scale back unless `--size-hold off` was passed. The fallback still scales the size alone with the feet left where they were filmed. That is what `--size-hold off` leaves in place: with `off`, a clip the first search does not cut is still scaled back at 3 % or more. Both read the size one cycle on, so the two never disagree about a clip. A clip's lead-in, where the video model reframed a small subject, is left out of both searches ([video-pipeline.md](video-pipeline.md) section 4, "A lead-in").)

- **It walked toward the camera, or away from it.** Asked to walk in place, a front walk
  sometimes comes closer, and the body grows through the clip, so the same pose never matches
  itself in size. The change read one cycle on measures it (`gait_fallback.cycle_drift`, as for
  the size hold; it was a straight line through the clip before, which a first pose settling into
  the walk pulls flat over a body that does grow); at 3 % or
  more over the clip (`SCALE_DRIFT_MIN`) every frame is scaled back to the first frame's
  height about its fitted foot point, with its coverage and its colour mapped apart
  (`transform_cell`, [video-pipeline.md](video-pipeline.md) "Cells") so the soft edge keeps its
  colour and gets no lighter rim or key tint from the resample. The
  search, the cells and the seam gate then all read the scaled-back frames. On the walk clips
  we have kept, the median change is 0.5 % and nine in ten stay under 2.7 %.
- **It walked slowly.** A calm walk in long clothing can take longer than half the clip per
  cycle, the most the first search confirms (a 3 s clip at 24 fps: 36 frames). The second
  search allows up to 60 % of the clip and at most 2 s (`LONG_CYCLE_FRACTION`,
  `LONG_CYCLE_SECONDS`; 43 frames for that clip), so a cycle is still seen once whole and
  repeating for the rest.

Every other gate is the same, the seam limit included. A clip the first search cuts is cut
exactly as before. The report records the first search's reason, the measured drift, whether
it was undone and the window (`gait_fallback`); if the second search fails too, the error
keeps its `no periodic cycle found` start and says what was tried. The failed report's `cycle`
then names the windows the search measured and refused (`status: "refused"`, `window`,
`refused_count`, and up to 12 `candidates`: `start`, `length`, `score`, `ratio`,
`context_repeat_over_step`, `drift_line_residual_analysis_px`, `seam_pop`, and `refused`, why),
best score first, those whose top could not be read (`seam_pop: null`, `seam_pop_skipped`) after
those whose top closes, and those whose top jumps at the wrap last, so a caller that must deliver
anyway (a forced `--cycle fixed`) cuts one the engine measured rather than the whole clip. The
scaled-back frames are written to a new folder of the run's own in the out dir,
`.gait-fallback-frames.<pid>-<random>`, and removed however the run ends. A
`.gait-fallback-frames` folder already there is never touched.

Measured on six stored 3 s front walks that had failed with `no periodic cycle found`: four
loop now. A long kimono, which hides the legs, walked a 38 to 39 frame cycle (one clip also
grew 3.9 %, two grew 11 % and 16 %), and a front horse walk grew 6.4 % with a 42 frame cycle.
Of the other two, one still shows no repeat and one finds a 38 frame candidate that the seam
gate refuses (2.81).

The selected original frames receive the same integer XY correction described
below, using regions discovered again in the selected interval. Analysis resampling
never enters the emitted cycle. Reports include `automatic_motion_analysis`,
`automatic_motion_regions`, local candidates, the duration guard and every final
translation. The unchanged seam limit measures the actual rendered cells.

Automatic results carry `review_recommended=true`: these measurements cannot
establish limb identity or fix changing drawings. Validate unfamiliar body shapes
and motions visually; no animal-wide quality claim follows from humanoid examples.

If the selected cycle's fine XY match reaches its bounded search edge,
`motion-auto` discards that uncertain correction and submits the unchanged selected
frames to the same rendered-cell seam gate. It emits them only if that gate and
normal animation verification pass. Reports and the CLI summary explicitly say
`applied: false`, retain the rejected match and record zero translations; this is
an uncorrected output, not a successful registration. Failed period selection,
unusable regions, coarse-search limits and other errors still fail. The explicit
`motion` mode also keeps its strict registration contract.

## Explicit adjustments

If the visible full cycle is clear but the automatic candidate is wrong, make the choice
explicit and keep the report's `kind = fixed`:

```bash
sprite-gen video-loop --frames-dir keyed/ --out-dir reviewed/ --state run \
  --fps 24 --cycle fixed --start <zero-based-index> --length <frame-count>
```

Do not double a frame count unconditionally or duplicate existing frames. Choose a
continuous interval in the original sequence. `--min-len/--max-len` can instead narrow
an evidenced search interval while leaving the exact cut to the detector.

### Explicit XY motion correction

For a visually reviewed fixed cut, `--anchor motion` measures both XY placement and
the average movement at the wrap. Supply two rectangles in the **first selected
source frame**, head first and torso second, excluding swinging hair, limbs and
accessories. Coordinates are original pixels, with exclusive right/bottom edges:

```bash
sprite-gen video-loop --frames-dir keyed/ --out-dir reviewed/ --state walk \
  --fps 24 --cycle fixed --start 4 --length 24 --anchor motion \
  --anchor-region 60,20,90,50 --anchor-region 50,50,100,100
```

The rectangles are explicit inputs, not automatically detected regions. This mode
requires at least six frames and is unavailable in `video-set`, where the cycle and
its regions have not been reviewed. Existing automatic selection and default anchors
are unchanged. A fixed cut remains `kind=fixed`; correction does not prove a gait cycle.

Masked normalized cross-correlation of premultiplied RGBA (head weight 0.7, torso
0.3) matches the first/last three frames against the first. With measured last-frame
translation `m`, mean boundary velocity `v` and length `L`, the correction endpoint
is `round((m-v)*(L-1)/L)`. One integer XY ramp runs from zero to that endpoint;
it does not pin each frame or remove the original bob. Empty/flat regions and
search-boundary matches are errors, never a fallback to another anchor.

The fine search (`motion_anchor._register`, 29 × 57 shifts, both regions) reads a row
of side-by-side shifts at once: their masked patches gathered together, a block of
mask pixels at a time (`ROW_BLOCK`), then the operations one patch read alone takes,
in the same order — its mean sums its pixels one after the other, its other two sums
run over that patch alone — so each cost is the same value, and the match, the report
and the frames the same bytes, as reading one patch at a time. `--anchor motion-auto`
corrects every two-step cut its seam gate tries this way, so the search is most of a
walk's cut on a CPU ([loop repair](loop-repair.md#the-step-count--two-steps-read-off-the-clips-crossings)).

Cycle PNGs preserve the supplied keyed pixels (no additional speck removal), with
common transparent padding to avoid clipping. Strip scaling, GIF palette conversion
and output frame-density settings still apply. The sidecar/report records regions,
measurements, endpoint, every shift and padding. For this mode the unchanged seam
limit gates the **rendered, resampled cells**, recorded as `seam_measurement=rendered-cells`;
a cell the jump repair gave a filmed ghost way to the frame beside it is read there as filmed
(`seam_as_filmed`, [loop repair](loop-repair.md) section 2).
This tests the corrected output, not the drifting input. It cannot repair missing
poses, changing colors, limb identity or an incorrectly chosen cycle.

Use `--anchor feet` only when the source shows slow in-canvas translation. It removes a
linear horizontal trend; it is not a universal stabilizer, does not pin each planted foot,
and can alter an already stationary subject. Compare with `--anchor none` and
`feet` on identical frames before selecting it. Normal body bounce, clothing motion and
a model's changing anatomy are not position drift.

Do not raise `--seam-max` merely to make a failed result pass. A source lacking a complete
usable cycle may require a longer/new clip. Regeneration is a new generation request,
not a hidden fallback inside loop extraction.

## Reproducibility

Store the source identity, engine version, exact CLI arguments, selected report and
whether a person/model overrode the automatic choice. Keep the same fps for comparisons.
Render comparison videos from PNG strips or lossless frame outputs, not palette GIFs.
A reviewed example is not evidence that all future inputs will automatically attain its
quality. Consumers can route `review_recommended` to review while retaining the automatic
result as an explicitly labelled candidate.
