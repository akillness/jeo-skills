# Known limits

motionmaxxing is an early release, so the glow-up is not finished. Even a maxxed film has flaws, and this page is the honest list of what it cannot do, what it cannot see, and where it is still rough. If a gate passes, that is a floor, not a verdict on taste: the scripts report numbers, a person (or the agent, looking at the render) still decides whether the film is good.

## What the gates can and cannot see

| Gate | Limit |
|---|---|
| G1 proof readable | No script. Judged by eye on `look/sheet.jpg` and the stills (text >= 0.04 H, fragment >= 0.55 W or cropped by the frame). The agent is asked to describe every sheet frame in one sentence first, and to say in `NOTE.md` that G1 was judged by eye. |
| G4 one hero per frame | No script. Same method as G1. |
| G5 page chrome (`lint.mjs`) | Reads the DOM. It **cannot see text inside `<canvas>`, WebGL, images or video**, so chrome baked into a generated plate or drawn in a canvas passes. A lint is a lead, not a verdict, and some real films will trip a rule that a designer would accept (text inside a faithful UI rebuild is exempt only when marked `data-ui="captured"`). |
| G2 / G3 (`look.py`) | Computed from frame differences on the render. A shutter-blurred or grained film changes the numbers; a held frame with a tiny living element (a caret) can read as moving. |
| Motion band | The "human band" (median 6.8, IQR 4.4-9.8) is a question printed by `look.py`, never a gate. Banners, calm brand films and GIF loops sit below it on purpose. |

## `look.py`

- It treats `show` and `hide` events from `render.mjs` (`window.__events`) as cuts. A film built from many show/hide swaps inside one continuous scene will report more "cuts" and shorter "shots" than a viewer would see (the hero banner in this repo reports 33 "cuts" from its overlay show/hide steps), which also moves the final-shot share (G3). Without an events file it falls back to detecting cuts from the picture.
- With no cuts at all the final-shot share is not computed.

## Rendering

- **WebGL is slow.** A hero3d scene renders at about 7-11 fps at 1080p on an Apple GPU (bloom and depth of field cost more); software GL is slower still. `--scale 0.5` does not shrink the WebGL draw. Render only the hardest beat with `--from/--to`, and use `--still` for look checks.
- **GPU versus software GL differ** by a small amount (about 38 dB PSNR on a chrome scene). Do not mix modes inside one film, and do not re-render one beat on a different machine than the rest if the move is continuous across the seam.
- `--shutter` multiplies render time by `--subframes` and is for smooth-clock films only. Stepped content stays crisp by design.
- Smear and blur filters need room: the SVG filter region is -50%..+150% of the element's box.
- Fonts are measured once the page and fonts have loaded. `Motion.loaded()` waits for that; code that measures text earlier gets fallback-font widths.
- Chrome is required (any recent Google Chrome or Chromium). Headless rendering through the DevTools protocol; no other browser is supported.

## Sound

- **ElevenLabs music tempo and fit.** The music endpoint does not reliably hit a requested tempo or length: it can start late, end short, carry a silent tail, or restart a loop mid-film. `voice.py music-check` and `music-fit` repair what they can, and `look.py` flags a silent tail and late start, but a score still has to be listened to against the picture.
- **The sfx normaliser can corrupt very short clips.** `voice.py sfx-norm` trims leading silence and peak-normalises to -3 dBFS; on a clip of a few milliseconds the trim and the mp3 re-encode can leave a click or an empty file. Check short hits by ear, and prefer a longer clip with a hand-placed gain over a very short one.
- `voice.py vo-local` (macOS `say`) gives estimated word timings, not aligned ones.
- With no key there is no voice, sfx or music. The skill says so in a line and carries on; the picture then runs on a fixed cadence.
- Nothing here masters audio for broadcast. `mix.py` targets -14 LUFS / -1 dBTP stereo 48 kHz, which suits web and social.

## Brand capture and logos

- **`fetch_logo.mjs` may return a header ribbon instead of the mark.** The order is SVGL, Simple Icons, then the site's own icon or header SVG; when it falls through to the site, the "logo" it finds can be a wide header strip or a lockup rather than the symbol. Render the SVG once and look at it before building on it. Exit 1 means no SVG mark was found; the skill then sets the name in type and never redraws a logo.
- `brand.mjs` cannot capture pages that block headless Chrome (an empty page is reported as blocked), pages that need a login, or fonts that are not served as web fonts. It flags colour roles heuristically: verify ink and accent on `board.png` by eye.

## Image generation

- `imagegen.py` needs the Codex CLI with the `image_generation` feature on. Plates take 1-2 minutes each. The guard refuses prompts that ask for text, logos, UI, charts, people or faces, but it checks the prompt, not the picture: a model can still draw lettering, so look at every plate.
- Generated plates are for a missing surface only, are labelled illustrative in `NOTE.md`, and never replace product proof.

## The runtime

- Every frame must be a pure function of time. Code that uses `setTimeout`, `Math.random`, `Date`, CSS animations or `gsap.set` outside the build will not render the same when seeked; `Motion.selfTest` catches most of this but only on the frames it samples.
- Two tweens must not overlap on the same property of the same element (put one on a parent).
- `M.words` does not split words into letters, and `fixedSlots:false` supports a single line only.
- `hero3d` loads an ES module, so a double-clicked `file://` page will not draw 3D; use `render.mjs` or a local server. `extrudedText` reads TTF/OTF/WOFF but not WOFF2, and ignores variable axes (use `runtime/hero3d/tools/fontconv.py`).
- Clock modes: on `clock:'twos'` quantisation happens inside `__seek`; seeking `__timelines.main` directly gives smooth poses.

## The research behind it

- **Genre skew.** The measured moments come from short SaaS-style launch clips, so the statistics describe 3-7 s UI-forward moments, not a whole film. "Motion on ~99% of frames" is a property of those moments and is not a target for a full film (human whole films are calmer: median luma motion 6.8).
- **Model-decoded rules.** The precedent library (`library/moments.jsonl`) was decoded by model analysts from frame-accurate recreations. Rows are unverified; open the cited moment before trusting a number. They never outrank `references/` or `taste/verdicts.md`.
- **One rater.** The blind A/B history that shaped the taste layer has a single human rater (and a model judge in some rounds). "9 of 10 picks with the skill" is an earlier generation of this skill on five briefs and two models; it is encouraging, not a benchmark. No A/B exists yet for this generation of the skill.
- **Taste is not a template.** The skill is written to find an idea per brand. It will still sometimes land on a default; the "Never ship" list and the lint exist because it has.
