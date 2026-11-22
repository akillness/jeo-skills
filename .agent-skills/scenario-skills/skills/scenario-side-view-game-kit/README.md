# scenario-side-view-game-kit: maintainer notes

Not read at runtime. How the skill was built and why it makes its choices.

## Origin

Distilled on 2026-09-30 from a browser side-scroller built over two days in one agent session: one
hero, two ground enemies, five levels of one setting. Every generation ran through the Scenario MCP
server (`recommend`, `model_schema_get`, `model_run` with `dry_run` and `wait: false`, `jobs_wait`,
`upload_asset` and `upload_asset_complete`, `asset_download`); keying, loop search, pixelation,
seamless tiles, prop cutting and WebP conversion ran as local Python. The sources were the build
journal, the verbatim prompt record and the build's own processing scripts.

The hero route is an earlier isometric sprite-cycle pipeline (two-pose still on flat magenta,
reframe, image-to-video clips, loop-window search, one shared palette) adapted to a single side-view
facing. The build used a text-to-image model for the stills, the pose sheet and the level layers; an
image-to-video model with a last-frame input for the clips; and a pixel-art model for a superseded
first pass. The skill names no model and discovers both lanes with `recommend` (`txt2img`, and
`img2video` with `features: ["endImage"]` for pinned clips), because availability differs per team
and these generations will be superseded. The record has no credit costs, which is why the body
prices with `dry_run` instead of quoting a figure.

## Why audio was dropped

The build also scored every level and gave each action a sound effect. One skill, one output type:
the deliverables here are images (sprite strips and level layers; the clips are intermediates), so
music and effects stay with `scenario-audio` and `scenario-elevenlabs`. The body says in one
sentence that they are outside this skill without naming those siblings: a named sibling joins the
context fan-out and the install commands, and the image workflow never calls them. The prompt
templates and processing settings carry no audio sections for the same reason.

## Why the finish is local

Keying, the loop search, the shared-canvas palette and the seamless cross-fade all need the pixels
on disk, and the deliverables are game files, not platform assets. `scenario-sprite-animation` lists
"assembling locally" as a mistake for sheets the platform can tile itself; this skill's local steps
are the ones no MCP tool performs, so the body says why once and offers `upload_asset` into a
collection for users who want the finished strips on the platform.

## Choices the build tested

- Static poses (fall, wall cling, plunge, dash) come from one pose sheet split by connected
  components. Splitting by column runs failed: the poses overlap horizontally.
- The first attack's third frame keyed a white slash trail into a solid block, and the heavy enemy's
  impact frame keyed its dust cloud into a blob; both were dropped after processing. `--drop`
  reproduces that, applied after the canvas and palette, which is what matches the shipped strips.
- The heavy enemy's walk loop closes at 1.03x baseline. Widening the search range did not help; it
  was kept after review, which is why the body's threshold (0.6x) is a target, not a rejection rule.
- The first armed-enemy walk swung its weapon mid-stride and could not loop (1.44x). Regenerated
  with a still-arms sentence and a lower guidance value, it closed at 0.42x. That pair became the
  "loop that will not close" mistake.
- The first-pass environments were judged too retro after a playtest. The "richly detailed
  high-resolution pixel art" replacement was validated on level 1 before levels 2 to 5 were
  generated, which is the order the body teaches.
- Texture renders asked to be "seamless tileable" did not reliably tile, hence the cross-fade in
  `process_env.py` rather than trusting the prompt.

## Scripts

All four run in plain Python 3 with Pillow and NumPy; `side_sprites.py` also needs ffmpeg.

- `reframe_stills.py`: from the isometric pipeline, pixels unchanged. The output names lost their
  isometric facings: it now writes `<name>_rest.png` (left pose, the first frame of every ground
  clip) and `<name>_action.png` (right pose: hero jump or enemy attack wind-up). The build ran its
  own copy with an auto split column and a death cycle; the shared copy reproduced all six of the
  build's first frames pixel for pixel, so those extras were not ported.
- `sprite_cycles.py`: the isometric pipeline's processing core, now a helper module imported by
  `side_sprites.py` only. Its four-facing command line and anything only that command line used were
  removed. Two changes after the port's review: `pick` takes the cycle's mode and windows by it (it
  used to branch on the name `attack`, so a loop named `attack` got one-shot windowing), and
  `read_frames` stops on a clip more than 2% off square instead of squashing it, since the figure
  scale and feet anchor assume a square frame. Square clips process as before.
- `side_sprites.py`: the build's one-facing wrapper, generalized. The hard-coded hero cycle table,
  pose names and file names became `--cycles`, `--pose-names` and `<name>_pose_*`; loop cycles other
  than walk, run and idle need a `--range`; `--drop` was added for the frames removed by hand;
  missing clips are an error instead of a silent skip; overwrites need `--force`; `--webp` writes
  lossless WebP; `sprite_cycles.py` is imported from the script's own folder.
- `process_env.py`: the build's script, generalized. Hard-coded input and output folders and the
  fixed five-level loop became `--env`, `--out`, `--levels` and `--file KIND=PATH`; texture size,
  fade share, ledge height, prop count and height, alpha threshold and the three WebP qualities
  became flags; `--dry-run` and `--force` were added. The processing is unchanged.

Comments, docstrings and help text were moved to American spelling and house style in the port; no
processing changed.

## Script verification

Run on 2026-09-30 (Windows, Python 3.14.2, NumPy 2.5.0, Pillow 12.2.0, ffmpeg 8.1.1) against the
build's intermediate files, writing only to a temporary folder, with the scripts as they stood
before the port's renames:

- `--help` printed usage for every script.
- `reframe_stills.py` on the hero still and both enemy stills: all six first frames pixel-identical
  to the build's.
- `side_sprites.py` for the hero (eight cycles, the pose sheet, the jump still, `--drop atk1=2`),
  the heavy enemy (`--drop attack=5`) and the armed enemy (`--range walk=12:48`): all 19 strips and
  poses pixel-identical to the build's. Cells, anchors and fps matched the build's meta files: hero
  98x81 anchored at 49,75; heavy enemy 137x123 at 68,111; armed enemy 116x93 at 58,92. Seams
  printed: hero run 0.32, idle 0.282, heavy-enemy walk 1.032 (flagged), armed-enemy walk 0.421, the
  first armed-enemy walk 1.445 (flagged). Without `--drop` the hero's first attack has 7 frames and
  the heavy enemy's attack 8, as recorded.
- `side_sprites.py` refused to overwrite without `--force`, stopped on a missing clip, and asked for
  `--range` on an unknown loop cycle; `--webp` wrote lossless WebP.
- `process_env.py` over five levels: all 35 outputs byte-identical to the build's WebP layers. A
  second run refused to overwrite; `--file tex=... --file props=...` wrote `env_tex_<stem>.webp` and
  `env_prop_<stem>_<k>.webp`; with neither `--env` nor `--file` it stopped with an error. On the
  five textures the mean wrap-edge difference after the cross-fade sat at the neighboring-pixel
  level.

Apart from the two `sprite_cycles.py` fixes above, the port changes names and text only.
`tests/scenario-side-view-game-kit/` runs on synthetic inputs: the build's own files are not in this
repository, so the byte-level reproduction above is not re-run in CI.

## What the record does not cover

- The worked example (a fox knight, a mole miner, two levels) is a recommended route built from the
  shipped build; the build made one hero, two ground enemies and five levels of one setting.
- The pose-sheet prompt is recorded only as a description; `references/prompt-templates.md` gives a
  template in the style of the other prompts and says so. The attack, lunge, shot, hurt and spin
  motion sentences are abbreviated in the record; the templates keep their recorded opening and
  closing words.
- The enemy stills are recorded only as "follow the hero still template (standing / attack
  wind-up)", and their attack and hurt prompts are not recorded. Their heights (78 and 66 px) and
  the drop indices come from the shipped strips.
- How the two frames were removed from the attack strips is not recorded; the drop indices (hero
  first attack index 2, heavy-enemy attack index 5) were recovered by matching the shipped strips.
- The ledge was requested at 1536x384 and came back 1536x512. The trim makes the output the same
  either way.
- The pose-sheet scale (0.122) was set by eye; the skill says to tune it.
- The first-pass pixel-art route (some enemies, pickups and icons that still ship) is mentioned in
  the record but not taught; its prompts are not recorded.
- Game code (combat, wall runs, parallax, the ledge 3-slice draw) is out of scope beyond a few
  drawing rules; the skill stops at game-ready assets.
