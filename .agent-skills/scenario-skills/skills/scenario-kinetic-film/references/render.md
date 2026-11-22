# Render, encode and check

## The pipeline

- `render.py` serves the film folder on a free local port and asks the film for its length, frame
  rate and cuts (`info.mjs`). It splits the frames across workers and joins the parts.
- Each worker (`post.py`) runs a headless Chrome (`render.mjs`) that seeks the film to sub-frame
  times and captures JPEGs.
- Python averages the samples of each frame (motion blur), adds bloom (a bright pass at quarter
  resolution, two radii) and film grain (seeded, so re-renders match), and pipes the frames to the
  encoder.
- Motion blur: a 180 degree forward shutter with 4 samples by default. Blocks raise the count in
  fast windows (`f.fast`), and whips stretch the shutter (`f.smear`) to about 600 degrees with 21
  samples.
- Samples never cross a hard cut: when a cut falls inside the shutter, the window slides back, so
  the fastest frame of a whip is still blurred.
- The HUD frame counter reads the output frame time (`window.__frameT`), so blur never smears its
  digits.
- 1080p renders at device scale 1, 4K at 2: the page is always 1920x1080 CSS pixels.
- Run the scripts with the film folder's `.venv/bin/python`. Workers run with `-I`, which keeps user
  site-packages out, so a `pip install --user` setup breaks inside them.
- Outputs are replaced on every run: re-mix, re-render and re-finish freely.

## Traps the scripts already handle

Change render.mjs, browser.mjs or post.py only after reading these:

- **Window chrome**: headless Chrome keeps about 90 px of it, so a 1920x1080 viewport paints only
  about 990 px of the stage. Fix: a 1920x1300 viewport, frames clipped to 1920x1080.
- **CSS pixels**: `captureScreenshot` returns them, so a "4K" render comes back at 1080p. Fix:
  `clip.scale` equals the device scale factor.
- **Half-drawn 3D**: big 3D layers are captured before every tile rasters. Fix:
  `--run-all-compositor-stages-before-draw`.
- **Too many 4K workers**: six filled 36 GB of memory and stalled the machine. Fix: `render.py`
  sizes workers to memory, about 11 GB each at 4K. Never override upward.
- **A shutter clipped at a cut**: the fastest frame of every whip renders sharp. Fix: `render.mjs`
  slides the window back.
- **A slower x264 preset without a level**: the file came out H.264 Level 6.0, which plays in ffmpeg
  and nowhere on a Mac. Fix: `-level 5.2` at 4K, `4.2` at 1080p.
- **`-shortest` when muxing**: it drops the last frames when the audio is a few milliseconds
  shorter. Fix: `finish.py` muxes without it.
- **A tall scrolling layer at 4K**: GPU memory runs out. Fix: only the rows in view exist (the
  Counters block recycles them).
- **A spec or font problem**: the page sets `window.__ready` with `window.__problems` instead of
  hanging, so every script fails at once with the reason.

## Encode settings

- Masters: H.264 High, CRF 12.4, preset slower, lookahead 40, Level 5.2 (4K) or 4.2 (1080p), 4:2:0,
  BT.709.
- A 52 s 4K film with grain came to 0.96 GB at about 50 dB PSNR against lossless frames. CRF 11
  medium is 1.37 GB for 51 dB, which the eye cannot tell apart.
- 1080p and 9:16 versions are made from the master by `finish.py` (CRF 15, preset slow, Level 4.2).
- Override the encoder with the `ENC` environment variable for `post.py`, for example a lossless
  test: `ENC="-c:v libx264 -qp 0 -preset ultrafast"`. `GRAIN=0` turns the grain off.

## The gates in finish.py

Every file:

- frame count equals the film's;
- size under 1 GB;
- H.264 level 5.2 or lower;
- a full decode on the macOS hardware decoder (what QuickTime uses) with no errors. It prints SKIP
  on other systems, or when ffmpeg lacks videotoolbox, and a SKIP never fails the run;
- loudness between -16 and -12 LUFS, when `--audio` is given.

The film, measured on the 1080p file up to the end card:

- 40% still frames or less;
- no still stretch over 0.6 s;
- a median motion of 2.5 px/frame or more.

The end card starts at the Logo block's start or 4.5 s before the end, whichever is earlier. It also
prints cuts per 10 s and color flips for reference. Hand over nothing that does not print
`ALL CHECKS PASS`.

## Other checks worth running

- `holds.py <video> 0.35 <bpm>` lists every still stretch with the beat it starts on.
- `audit.py <video>` flags frozen frames between moving ones, blank bands and single-frame flashes.
  A flash may be intended: look at it.
- `montage.py <out.jpg> <cols> <width> <images>` builds labeled contact sheets from stills;
  `snap.mjs` takes stills at beats (`b12.5`).

## Time and memory

On the author's 36 GB laptop (authoring-time figures): a 24 s film rendered at 1080p in about 4
minutes with 4 workers, and in 4K in about 10 minutes with 3. A 52 s film took about 18 minutes in
4K. Render 1080p until the film passes, then 4K once.
