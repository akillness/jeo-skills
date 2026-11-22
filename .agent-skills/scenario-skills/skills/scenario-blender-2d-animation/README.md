# scenario-blender-2d-animation: maintainer notes

Not read at runtime. How the skill was built and why it makes its choices.

## Origin

Distilled from the
[Blender 2D animation exploration](https://www.scenario.com/explorations/blender-2d-animation/) on
scenario.com: a 7.7 second side-scroller shot in three looks (a red panda in a golden-hour jungle, a
black cat on a moonlit Halloween street, a snow leopard cub in a winter valley), ten Scenario
generations per look, built and rendered by one Blender script. The page offers the skill as a
download; this directory is that skill brought to the repository's authoring contract.

The exploration used one text-to-image model for every picture and one image-to-video model at 768p
for the run clips. The body names neither and discovers both lanes with `recommend` (`txt2img`,
`img2video`), because availability differs per team and both generations will be superseded. The
page's credit figures are left out for the same reason: the body prices with `dry_run`.

## Why a core skill, not a Blender expert tool

Every paid step (ten generations per look) is a Scenario MCP call; Blender only lays out and
renders, locally. The expert tier exempts its skills from the MCP rules, which are exactly what this
skill must be graded on, and the Blender family's specialists share the lead's toolkit and
provenance, neither of which applies here. `scenario-patina-retexture` set the precedent: MCP
generation, then bundled Blender scripts run headless. The name keeps the download's, so the
exploration page and the repository agree.

## Changes from the download

- Description cut to triggers only; the body names no generative model; discovery moved from a
  newest-first `search` to `recommend`; payload field names hedged as schema examples.
- `scenario-side-view-game-kit` and `scenario-sprite-animation` named as the sprite-strip
  alternatives. The download's other related skills are not named: the model-family ones point at a
  model, and the workflow hands nothing to the rest, whose bodies would only push the fan-out past
  the re-attach pool.
- `build_scene.py --live` used to empty whatever file was open. It now refuses unless the file is
  new (nothing beyond the startup cube, light and camera) or the script's own output.
  `bpy.data.is_dirty` cannot make that call: Blender reports a new file as dirty.
- The jump still's scale was hard-coded as 768 / 960 (the clip's height over the reframed canvas),
  which is wrong for any video model that answers at another resolution. `run_loop.py` now prints
  `run_canvas_px` and `build_scene.py` reads it with the jump still's own height.
- The common mistakes that the scripts now prevent moved out of the body; `references/pipeline.md`
  already records them for anyone changing the scene script.

## Scripts

`reframe_stills.py` is a byte-for-byte copy of the one in `scenario-side-view-game-kit`, kept so
each skill installs alone; `tests/scenario-blender-2d-animation/test_reframe_stills.py` fails when
the two drift, so a fix to one reaches the other. `run_loop.py` shares that kit's loop-window idea
(seam over in-window motion) but adds the border key and writes a Blender image sequence instead of
a pixel strip.

The suite runs the five helpers on synthetic inputs. `test_build_scene.py` builds, bakes and saves a
synthetic set in a real Blender and is skipped unless `BLENDER` names the binary or `blender` is on
the `PATH`, which CI does not provide; it passed on Blender 5.0.1.
