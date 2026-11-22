# Assets from the game's own frames

Every asset in a playable comes from what the user supplied: a gameplay recording, screenshots, a
logo, a font, store links, and any art, 3D, sound or music the studio already has
([existing-assets.md](existing-assets.md)). With no recording or screenshots, it comes from the
user's one-paragraph brief. Scenario rebuilds what the frames show at full detail; it never invents
the game.

## Inputs

| Case                       | Motion and payoff from                 | Stills (plate, sprites, HUD) from                                  |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Recording only (preferred) | the recording                          | its frames                                                         |
| Screenshots only           | the genre guide and `game_description` | the screenshots                                                    |
| Both                       | the recording                          | the screenshots; frames for poses and effects the screenshots lack |
| The studio's own files     | the recording                          | the supplied files ([existing-assets.md](existing-assets.md))      |
| An idea only               | the brief, then the genre guide        | supplied art first, then two concept screens made on Scenario      |

- Where a recording and a screenshot disagree, the recording wins for behavior, the screenshot for
  art.
- With screenshots only, the beat sheet and timings come from the genre guide. Ask for a short clip.

### From an idea

The brief is one paragraph: the world, what the finger does, the big moment, how a round ends. It
plays the recording's role.

- After the genre answer, make two portrait concept screens from it: the calm first screen (the
  waiting state, the target visible) and the big moment (the signature payoff).
- Generate them like any other asset (see Generating with Scenario, the concept-screens rows).
- The stated budget covers the whole build: count the screens against it before pricing the other
  assets.
- Unattended, start each paid job only when its `dry_run` price fits what is left of the budget.
  With no budget, or for a job that would exceed it, report the price and stop.
- When the user also supplied art, its mode from [existing-assets.md](existing-assets.md) wins:
  - **As supplied:** make no screens. A slot the game needs with no file is a question for the user
    (unattended: report it and stop).
  - **Complement or derive:** the screens fill only what that art leaves missing. Skip them when it
    leaves nothing. The supplied characters and props do appear in the screens, drawn from the
    uploaded references to match their shapes, colors and shading; the screens generate only what
    the supplied art lacks (background, layout, effects). A supplied logo goes in as a style
    reference and is never redrawn. Make them with `img2img`, not `txt2img`, and the supplied art as
    references ([existing-assets.md](existing-assets.md), section 4), so they match it.
- They then serve as the screenshots: plate, sprites and HUD come from them.
- They are already Scenario assets: skip the contact sheet and the upload. Their source labels in
  the asset map are `concept 1` and `concept 2`.
- Build only what the brief and the genre guide state. A mechanic neither names stays out.
- Where they disagree (one boss in the brief, a crowd clash in the guide), the brief wins. The guide
  fills what the brief leaves out, motion and timing included. Note the difference in
  `analysis/brief.md`.
- In `analysis/brief.md` and `notes.md`, call the build a concept, not the user's game.
- Without store links, the template's placeholder links stay in, and the CTA would open them. The
  packages are preview only: say so first in `notes.md` and in the handover, and never hand them
  over for a campaign.

## Rights and source check

Answer these at the top of `analysis/brief.md` before using any frame:

- **Rights.** An ad for a game needs the owner's assets or written permission. Ask the user to
  confirm they own or license the game. Write the answer, or "not confirmed".
- Unattended, write "not confirmed", build, and open `notes.md` with it: the build is a test until
  the user confirms the rights.
- From an idea, write "concept" and whether a game exists yet. Supplied files still need the answer
  below.
- **Supplied files** need the same answer, and a license for the game does not always cover ads
  ([existing-assets.md](existing-assets.md), section 7).
- **First-party capture or third-party video?** A video found online is a reference only. Ask for a
  raw device capture, the logo, the store links and the font.
- **Platform UI is never art.** Do not copy player controls, captions, overlays or face-cams,
  watermarks, the mouse cursor, letterbox bars, progress bars, timestamps, or anything after a cut
  to another clip. List what you see.
- **Crop per element before uploading,** so no job sees an overlay. Never use footage past a cut.

## Working with frames

- Make a 4 fps contact sheet first. Then pull full-resolution PNGs only at chosen moments:
  `ffmpeg -ss <t> -i gameplay.mp4 -frames:v 1 f_<t>.png`.
- Pick frames per element, not one master frame: the calm setup frame for the HUD and the plate, the
  clean moment after effects for pieces, the payoff moment for the hero pose. Skip motion-blurred
  frames.
- Upload 3 to 5 frames with `upload_asset`. Give each job only the frames that show its elements.
- The asset map in `analysis/design.md` lists the source frame of every asset (`f_0.1`,
  `screenshot 2`, or "code").
- **Recordings glitch.** Numbers drift, labels flip, pieces change color. Write them under
  "recording glitches, do not copy" in the brief, and redraw every HUD number live.
- **Missing views** (a level-2 tower never shown, a worried face) are designed as variants of what
  the frames show. List them as open questions for the user.

## Generating with Scenario

Connection, uploads and the core loop are in the `scenario` skill. For each asset:

1. `recommend` with the table's `capability` value and the user's words as `prompt`; read
   `next_step`. The `prompt` carries what the value cannot: edit, transparent, music or SFX.
2. `model_schema_get` on the pick: sizes, reference slots, transparent background, take count.
3. `dry_run` with the references attached, since references can change the price.
4. `model_run` with `wait=false`, then `jobs_wait`. Keep at most 4 jobs in flight.
5. `asset_download` (`png` for images; omit the format for audio), then
   `curl -fsSL -o <file> "<url>"`.

| Asset                                     | `capability` | Settings that worked                                                                  |
| ----------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| Concept screens, no supplied art          | `txt2img`    | portrait 9:16, 2 screens; the first as a reference for the second if accepted         |
| Concept screens, supplied art guides them | `img2img`    | portrait 9:16, 2 screens; as in section 4 of [existing-assets.md](existing-assets.md) |
| Plate                                     | `img2img`    | 2 to 3 frames as references, high quality, 1152 x 2048                                |
| Sprite sheets                             | `img2img`    | transparent background, 1536 x 1024, 3 x 2 cells, the frames that show each piece     |
| Logo, only when none was supplied         | `img2img`    | transparent background, frames as style references                                    |
| Clean render for 3D                       | `img2img`    | 1024 x 1024, one object, plain mid-gray background                                    |
| 3D model                                  | `img23d`     | low poly; see [3d-games.md](3d-games.md)                                              |
| Seamless texture                          | `txt2img`    | 1024 x 1024, tiles in both directions                                                 |
| SFX                                       | `txt2audio`  | 0.3 to 2.5 s, one take per event group; vary pitch with `rate`, not a new take        |
| Music                                     | `txt2audio`  | 30 s instrumental loop                                                                |

Detail per lane: `scenario-image` (edits, references), `scenario-game-assets` (sheets, cut-outs),
`scenario-audio` (SFX, music), `scenario-3d` (image-to-3D), `scenario-sprite-animation` (walk
cycles).

## Prompt patterns

- **Plate:**
  1. "Remove: ..." naming every character, item, effect, number and HUD element with its position.
  2. "Keep exactly the same: ..." for the scenery, framing and camera.
  3. "Fill where characters were with matching floor; nothing on the floor."
  - For soft frames add "the frames are small and a little soft: redraw at full detail, same
    design".
  - Name reusable slots to empty: "the five round slots become empty wooden recesses".
- **Sheets:**
  - "Strict 3 columns by 2 rows, exactly one element per cell, generous empty transparent space,
    nothing crossing a cell border, no grid lines, no labels."
  - Number each cell with its view direction.
  - For color variants: "match the pieces in the reference frames exactly; only the color changes".
  - Ask for blank panels (gates, buttons) and draw the numbers in code.
  - Use two sheets (characters, props) rather than one crowded sheet.
- **Cutting sheets.** The grid is never exact: cut with `"blob": n` and check
  `prep_assets.py --blobs`. Glowing art (stars, rings, fire) touches across cells: cut it with
  `crop` boxes and `"largest_blob": false`. Drop glow halos with `alpha_floor`.
- **Logo.** Use the user's logo when supplied, keyed off a plain background with `"key": true`.
  Otherwise ask for a transparent background first, and key a flat background only as the fallback.
- **Music:** "Starts immediately at full energy on the first beat, no intro, no fade in, no outro,
  loops seamlessly." Trim trailing silence with `max_s`.
- **SFX:** short, with an instant onset. Nobody can listen during an agent run: pick by onset and
  loudness, boost quiet takes with `boost_db`, and say in the report that the audio was not heard.

## Report

`notes.md` lists every Scenario job id, the source frame or supplied file of every asset, the
tuning, and what to look at first.
