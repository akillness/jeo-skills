# Checks

Run these before calling a look finished. The problems named here are the ones the reference shot
ran into.

## Pictures (before any Blender work)

- The concept frame is a strict side view with a flat walkable ground line. Two takes; keep the one
  whose layers you can name one by one.
- Every layer except the sky has real transparency above its content: check it on a checkerboard.
- The far and mid layers reach the bottom edge of the image, so the ground strip always covers their
  lower end.
- The ground strip's top edge is flat over the whole width. Its height in the image, as a share from
  the top, becomes `ground_top` in `config.json`.
- Props and foreground sheets: every piece is separated by clear gaps. `prep_assets.py cut` prints
  one line per sprite; a count that does not match the names means two pieces touched or a speck
  survived.
- The hero sheet: both poses the same size, side profile facing right, no magenta on the character
  itself.

## Run cycle

- The kept loop is one stride period (9 to 12 frames at 24 fps for a small cartoon animal), and its
  last frame flows into the first. Play the frames as a GIF before building.
- Key the background on each frame's own border color if the clip's background drifts; a fixed
  magenta key leaves colored halos on the frames where it changed.
- No colored fringe on the outline (check over black and over white), and red or pink parts of the
  character (a scarf, a hat, a tongue) are intact.
- The run frame's feet line matches the rest pose's: measure `run_fig_px` (figure height in the run
  frames) and `run_pad_px` (empty rows under the feet) and write them into `config.json`.

## Scene (`build_scene.py --review`)

- The hero's feet sit slightly into the ground lip, not on the grass tips: the reference shot moved
  `ground_top` down by about 10 cm per look after the heroes looked like they floated.
- The tree stands on the ground: its image can have empty rows under the trunk, which the script
  reads from `shapes.json` (`bbox`) to offset it.
- The tiled layers show no seam and no repeated landmark cut in half while the camera pans.
- Physics: the tower stands still until the hero reaches it, the pieces fall inside the picture
  plane, nothing shoots off screen, and the fruit drops when the hero runs under the tree. The
  script prints `HIT`, `EVENTS` and the `FINAL` resting place of every piece; compare them between
  looks.
- The baked cache is saved in the .blend, so any frame can be opened directly.

## Film

- 1920 x 1080, 24 fps, 184 frames (7.7 s) per look, EEVEE.
- Frame 1 is a full, lit frame (never black).
- The same frame of two looks lines up when overlaid: only the pictures differ.
