# Game UI layers, effects, and sound

Every overlay is rendered at final size, uploaded, and placed in `model_scenario-compose-video`. Two
kinds:

- **Static layers** (hook, burst words, gate labels, end-card background): one transparent PNG each,
  a rich layer from `scenario-text-overlay`, every string in `variables`.
- **Moving layers** (hand, counter, floaters, rewards, bursts, stars, end-card motion): rendered
  frame by frame at 30 fps and encoded into one transparent video per element. Elements that move
  together, such as the pieces of the end card, may share one video.
- **Scripted gameplay** (a tile-match or sort board animated from cut pieces): one full-frame layer
  needs no alpha. Render it over its background as high-quality H.264: a full-frame ProRes 4444
  gameplay track was 345 MB.

Values below are for a 1080-wide canvas.

## Transparent video

- Encode ProRes 4444 `.mov` with alpha:
  `ffmpeg -framerate 30 -i f%03d.png -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le out.mov`.
  Compose honors its alpha. A VP9 WebM with alpha came out as an opaque black box.
- Rendering the frames is local, like the PNG overlays. Compositing stays a compose run.
- Crop each video to the box its element moves in, and place it with `x`, `y`, `width`, and `height`
  equal to that box, `fit: "fill"`, `mute: true`. An 8 s hand track was 24.5 MB at full canvas and
  6.6 MB cropped to 400x450.
- Uploads go out in parts of 6,000,000 bytes (not 6 MiB): `upload_asset` returns one presigned URL
  per part. Write the response, or its part URLs in order, to a file, run
  `put_parts.py FILE parts.json`, then call `upload_asset_complete`. By hand: write each part to a
  file and PUT it in order; piping into the request failed.
- Every upload means copying its URLs into that file, and one test ad took 25 uploads. Keep the
  count down:
  - a generated sound goes in by its own asset id, with `trimStart` at its onset (see Sound);
  - the end card's alpha parts (icon pop, label, stars) render as one `group` track;
  - a track whose `layers.json` entry has `same_as` (taps with the same relative timing can) is not
    uploaded: `build_passes.py` reuses that file's asset id;
  - a compose output is already an asset: use its id as the silent master of the next pass, with no
    download and re-upload.
- Never animate with a run of stepped image layers. Compose can draw the outgoing and the incoming
  layer on one boundary frame, which shows a double hand or two counters.
- An element animated by a video model on a flat color, such as a hero dancing on the end card,
  becomes alpha through a chroma-key tool model (`recommend` one). Ask for its MOV (ProRes 4444)
  output, never WebM.
- Compose reads layer times to the millisecond. A video layer starting on a frame time rounded down
  (185 / 30 as 6.166) can lose its last frame, a black frame at a hard cut; rounded up (6.167), it
  starts a frame late. `build_passes.py` and `render_tracks.py` start each video layer half a frame
  early and end it a quarter frame early, which shows exactly the planned frames.
- An image layer starts on its frame time rounded down and ends half a frame before its cut. Ended
  exactly on the cut, it shows on the next shot's first frame: a HUD and a win word sat over an
  insert this way.
- Video layers start on their frame; image layers can start one or two frames late. A word that must
  land on a contact frame is a video track.
- A track that hands over to a static PNG (an icon pop, then the still icon) shows its last frame
  just before the PNG's first, with no overlap: one shared frame draws soft shadows twice and
  darkens them.
- Give every image layer an explicit `width` and `height` at its natural size. A 750x107 PNG with no
  size was drawn about 2.5 times too large. Pad small PNGs with transparent margin to at least 304
  px on the short side, and shift `x` and `y` so the content stays put. `build_passes.py picture`
  writes these as `<name>.pad.png` copies: upload the copies.

## Static recipes

- **Burst word** (FAIL, NICE, HUGE!): a heavy rounded display face at 250 px or more, gold for wins,
  red for fails.
  - Stack two copies of the word in the same box. The back copy is solid in the outline color, with
    `-webkit-text-stroke` about 8 to 10% of the size and the shadows. The front copy carries the
    fill: a `linear-gradient` background with `-webkit-background-clip: text` and
    `-webkit-text-fill-color: transparent`, and no stroke.
  - Never put the stroke on the gradient copy. On clipped text the stroke paints over the fill and
    `paint-order` does not help: a smaller second line lost the bars of its E, A, and F.
  - Shadows go in `filter: drop-shadow(...)` on the back copy: a hard offset in the stroke color,
    then a soft one. `text-shadow` shows through a transparent fill.
  - Scale the stroke with the size, about 5 px minimum. A fixed 12 px stroke filled in words under
    about 90 px.
  - Crop the PNG tight with 24 px padding, so `transitionIn: "zoomin"` grows from the word's own
    center.
  - Keep it inside the placement's text zone: under 800 px wide on TikTok, clear of the right rail,
    and inside the 6% side margins elsewhere.
  - Put a full-canvas red flash (about 40% alpha, 0.5 s) under FAIL.
  - Desaturate a freeze frame locally before its upload. Compose's `saturation` 0.35 and
    `brightness` 0.9 rendered one at 44% of its brightness.
- **Hook line**: the same recipe, tilted 2 to 4 degrees, on two lines: the key words at 150 to 190
  px, and a longer second line at 70 px or more ("ONLY 1%" big, "CAN CLEAR THIS BOARD" small). A
  newline in a plain `{{variable}}` is lost, so put `<br>` in the value and use `{{{variable}}}`. It
  shows on frame 0 and is gone by 2.5 s unless the action needs it.
- **Gate label**: white fill, dark outline, sized to the gate it sits on.

## Moving recipes

- **HUD**: a level badge and a counter pill, 120 px tall, with digits at 72 px or more. On 9:16
  social, their top edge is at y 280, under the platform band. The counter is one video for the
  whole ad: each new value pops at 112% for 0.15 s, then rests.
  - The HUD may cover only pieces that never move, and a covered piece still counts. A test ad
    claimed 12 of 12 cars out with a parked car half under the HUD. With a locked camera, a static
    patch cut from the same take removes such a piece for the whole ad.
- **Counter values**: name the unit (coins, size, army) and tie every step to an event the clip
  shows. Use 4 or 5 steps that only climb, with values a viewer can believe: five cars swallowed
  never adds 300 m.
  - When a value is measured on the board (percent dug, cars out), step at the midpoint between two
    values. Stepping when a value is reached lagged one step behind the board.
  - Cash, coins, and score come only from events the viewer sees: a customer who walked in already
    holding a cup pays nothing.
- **Score floater**: "+N" at about 90 px, white with a dark stroke. It rises 120 px from the event
  point over 0.6 s and fades in its last third.
- **Reward fly-to-HUD**: 3 to 10 of the game's own reward icons burst from the event point. They arc
  into the counter icon in about 0.4 s, staggered 45 ms, and the counter pops as the first one
  lands. Rewards fly only from events the clip shows.
- **Impact burst**: radial spikes, a shockwave ring, and sparkles, about 0.4 s. It is centered on
  the 1 to 3 biggest impacts of the ad, never on every event.
- **Repeated words** (BONK!, PERFECT!): two copies never overlap in time and space. Shorten them, or
  move the second.
- **Punch-in**: the same take re-layered at about 130% for about 0.5 s on the key contact, with a
  short local slow motion before it. It sells the clever move in every ad that used it.
- **Win stars**: three slots under the win word fill one by one with a sparkle each, over about 0.9
  s, with the payoff still visible.
- **Hand**: one glove sprite on a transparent background, generated or drawn once, never inside a
  still or a take. Measure the fingertip's offset on the PNG.
  - A tap presses for 0.15 s at 92% scale.
  - A drag follows the object's position, measured on extracted frames of the take. The fingertip
    stays on the object or just behind it, never ahead of it.
- **Icon pop**: render the pop into an alpha video, at scales 0.4, 0.82, 1.1, 1.05, and 1.0 on five
  frames, ending exactly where the static icon layer takes over. `zoomin` on a rounded app icon
  showed black corners on its first frame.
- **End card**: designed per game in the plan, like the hook, from this game's world and this ad's
  payoff. Never reuse a layout, typeface, motion, or call-to-action line from another ad: eleven
  test ads that shared one template all ended on the same "PLAY NOW" card.
  - Start from one of these and make it the game's own:
    - **The game's own screen**: its level-complete or results screen, with the call to action where
      "next level" would sit.
    - **Cliffhanger**: the next, harder board frozen, under a challenge line ("CAN YOU SOLVE IT?").
    - **The hero carries it**: the payoff's character pushes, holds up, or wears the label: a cart,
      a sign, a banner. Generate the prop blank and composite the words on it.
    - **The payoff keeps going**: the final state stays alive behind the icon: the crowd still
      pours, the hole still eats.
  - The words come from the game's fantasy: SAVE HIM, DIG NOW, TRY LEVEL 2. Use "PLAY NOW" only when
    nothing in the game fits.
  - Typeface and colors come from the game's UI kit or the hook, not a shared kit.
  - Every design keeps these:
    - opaque from its first frame, starting the frame the last clip ends;
    - the real icon and the game name, readable;
    - something moving until the last frame: a card static for 4 s read as the ad being over;
    - content centered in the safe band, not on the canvas: on 9:16 social, between y 270 and 1248;
    - on social placements, a label with no button shape that no hand taps; on a clickable
      ad-network card, a button in two states, tapped twice by the hand.
  - The icon pop, bounce-in, label pulse, rays, and stars from `render_tracks.py` are parts to pick
    from, not a set every card uses. A breathing label scales 1 to 1.035 over 0.9 s.
- **Anchoring**: a layer is fixed in screen space, so a label on a moving object slides off it. Keep
  such a label to the seconds when the object barely moves, or put the value on the HUD.

## Sound

- One hit per visible event, on its frame within 0.1 s, measured on the extracted frames, not the
  plan.
- Build a kit once: tap, whoosh, counter tick, fail buzz, win sting, end-card chime. Add 2 to 4
  theme hits (crash, gulp, gem burst).
  - Generate each hit with a sound-effect model (`recommend` one), as 48 kHz WAV when its schema
    offers that output.
  - Place each by its own asset id with `trimStart` at its onset, which makes the cue time the hit
    time. Upload a local copy only after changing its sound, such as a pitch shift.
  - Each hit's peak sits at least 4 dB over the music's peak in the same 50 ms, and over any hit
    playing on top of it. A star under the win sting vanished although it cleared the music.
  - Keep every sound at 48 kHz, generated or uploaded, and upload as WAV. One master came out at
    44.1 kHz, and a 192 kHz extract made a 96 kHz one.
- Compose plays a 128 kbps copy of each uploaded sound, which drops everything above 16 kHz.
  - A sparkle or star with most of its energy up there plays about 8 dB quieter than planned.
  - Low-pass each hit at 16 kHz before judging it, and pitch such hits down.
- Animal sounds come from a sound-effect model: speech models cannot bark or meow.
- The music bed comes back at its own length (a 10 s request returned 19 s). Trim it with `trimEnd`
  and measure its energy every 0.1 s.
  - Ask for a few seconds more than the ad, then trim: one 10 s bed faded out from 7.5 s, leaving
    the end card nearly silent.
  - Offset it so its lift lands within 0.3 s of the payoff start.
  - Start it in a section with energy. A quiet intro under a quiet fail left one test's first 5 s 10
    dB under the rest.
  - Duck it about 4 dB under the fail beat, unless it is already that low there.
- Compose adds layers with no limiter, so stacked hits clip: one test master peaked at +1.8 dBTP.
  Before the sound pass, sum the cue sheet locally and trim the master volume and the few hits that
  make the peaks. A test ad reached -14.4 LUFS and -2.0 dBTP this way, and the render matched the
  local sum within 0.3 dB.
- The final encode moves true peak by -0.3 to +0.8 dB against the local sum, across ten ads. Aim the
  sum at about -1.8 dBTP and -15.5 LUFS, so the master lands inside both limits.
- Sound pass: the silent master as the only video layer, plus the music, the video-to-audio track,
  and every hit as audio layers.
  - A test pass took 40 audio layers. Every hit landed within 1 ms, and 0.15 s layers, exact
    volumes, and 10 ms fades all held.
  - Compose takes at most 49 audio layers. Premix a dense run of hits (a 16-car flood, a combo of
    ticks) into one stem, and drop the video-to-audio track first.
  - End the music on a bar or fade its tail locally: compose ignored an `audioFadeOut` on the last
    music layer.
- Loudness pass, only when the sound pass misses the target: run `model_scenario-audio-extract` on
  the sound pass with `normalizeLoudness: true` and `outputFormat: "wav"`. Then compose the silent
  master with that track as the only audio layer.
  - Measured on two test masters: about -16 LUFS integrated, true peak -1.5 dBTP, no time shift.
  - The extract has no limiter, so it cannot fix a true peak. Trim the master volume or the few hits
    that make the peaks, and resample the track to 48 kHz before composing it.
  - Check with ffmpeg's `ebur128` filter (`-af ebur128=peak=true`).
