# scenario-video-color-grade: build notes

Maintainer notes, not runtime instructions. SKILL.md does not link this file on purpose.

## Origin

The skill comes from Scenario's public exploration
[One Loop, Twelve Grades](https://www.scenario.com/explorations/video-color-grade/): twelve looks on
one seamless 8-second loop (191 frames at 24 fps), each a recipe of color math baked into a 33³
`.cube` LUT and rendered with ffmpeg. The page offers the skill as a ZIP; this folder is that skill
brought to the repository's authoring contract.

## Changes from the published ZIP

- SKILL.md rewritten to house style: a "Use when" description, the agent-agnostic voice, a "Steps"
  section, list-form reference tables, and the sibling-install sentence. The body went from about
  2400 words to about 1600.
- The two LUT tool models are named by id. They fall under the `model_scenario-postprocessing-*`
  platform-utility rule in AGENTS.md. The segmentation model stays unnamed and is found with
  `recommend`, because object masks are a contested lane.
- `render_looks.py` skips a look whose mask video is missing, with a message, instead of crashing
  the whole run. Unmeasured `match` looks were already skipped the same way.
- `showreel.py`: the intro panel's slide-in offset was not scaled with the frame, so below about
  720p the panel ran past the bottom edge and `paste` crashed. The offset now scales, and `paste`
  clips to the frame.
- `showreel.py` no longer brands reels: the ZIP closed every reel on a "Made with Scenario" end card
  unless `--no-endcard` was passed. The end card now appears only with the user's own `--credit` or
  `--logo`, and the default to a logo file the ZIP never shipped is gone.
- British spellings and a model name in a docstring were removed.

## Verification

- `tests/scenario-video-color-grade/` covers every op, the LUT writer, relight, keys and masks, and
  end-to-end runs of each script on generated clips (ffmpeg needed).
- The exploration page reports the original run: 112 CU for two masks and the reel's music, 0 CU for
  the grades. SKILL.md carries that figure as an authoring-time number.
