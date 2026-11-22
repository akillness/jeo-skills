# The game's own material

Read this when the user supplies screenshots, footage, or assets. Upload every file with
`upload_asset` first. With the game's own material, the ad must look and play like that game:
invented gameplay is the fallback for a user with nothing to give, never an override.

## Screenshots

- Read the screenshot before using it: the art style, the camera angle, the board layout, and the UI
  language (fonts, colors, button shapes). The overlays copy that UI language.
- **Board from the screenshot.** When its layout can carry the concept, edit it into a text-free
  board: remove the HUD, numbers, buttons, and banners, and keep the art and layout (an instruction
  edit; `scenario-image-editing` for removal and cleanup tools).
- **Board in its style.** When the concept needs a different layout, pass the screenshot as a
  reference image for a new board ("same art style, palette, and camera as the reference").
- **Ratio.** A phone capture is often taller or wider than the delivery ratio. Expand or reframe it
  to the exact canvas before animating (`scenario-formats`), never stretch it.
- Check the result at phone size like any board: every piece reads, and the move is solvable as
  drawn.

## Screen recording or gameplay video

- `asset_get` the upload and read `properties`: duration, frame rate, width, height.
- Sweep it at 2 fps into a contact sheet, then mark the moments worth an ad: a near-fail, a
  satisfying chain, an escalation, a big win.
- **Footage as takes.** When its ratio matches the delivery, cut the marked moments with
  `model_scenario-video-cut` (its `startTime` and `endTime` are source in and out points) and place
  them as clip layers. Real gameplay needs no logic check of its own, but the overlays must match
  it: the hand on the real touch point, the counter on the real event.
- **Beats from footage.** Build the timeline from the marked moments, not the fail-tease table.
  - The hook plays over the strongest opening moment.
  - Three or four escalation moments follow, each with a counter step read off its own event.
  - The biggest moment is the payoff, then the end card.
  - A fail tease needs a real fail in the footage. Never fake one with generated video.
- **Footage as a source.** When the ratio differs, or the moment is too short, extract frames
  (`scenario-video-editing`) and use them as first frames or references for generated takes at the
  delivery ratio. A landscape recording cropped to 9:16 usually loses the action.
- **Baked UI.** A recording carries its own HUD. Never stack a second HUD on it. Either keep the
  game's HUD and add only the hook, bursts, hand, and end card, or crop or edit it out first.
- **Its audio.** Mute it unless the game's own sounds are clean. When they are, keep them as the
  incidental layer and still add a hit on each key event.

## Characters, items, icon, logo, UI kit

- **Characters and items** go in as reference images on every still that shows them, with "same
  character as the reference" in the prompt (`scenario-consistency`). Check them on-model in every
  take: a hero who changes face between the fail and the win is a reject.
- **App icon and logo** go on the end card as supplied. Never regenerate them.
- **Cut-outs.** A character or item on a transparent background composites directly: a hero bouncing
  in on the end card, a reward icon flying to the counter.
- **UI kit.** Buttons, panels, and fonts set the overlay styling: match their colors, corner radii,
  and outlines in the HTML/CSS layers, and use the kit's button art on the end card.
- **Store page or feature list.** Mine it for the hook and the end-card line. Never claim a feature
  the ad does not show.
