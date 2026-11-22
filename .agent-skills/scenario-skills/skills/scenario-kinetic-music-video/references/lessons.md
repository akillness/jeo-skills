# Lessons learned

Every item here cost real time or credits once. Read the matching section before each phase.
"Director" means whoever commissions the video. Their taste overrides these defaults, but these
defaults are the right place to start.

## Contents

- [Direction defaults that held](#direction-defaults-that-held)
- [Song and lyrics](#song-and-lyrics)
- [Generation and moderation](#generation-and-moderation)
- [Lip-sync](#lip-sync)
- [Mattes, tracking and compositing](#mattes-tracking-and-compositing)
- [Engine and rendering](#engine-and-rendering)
- [Color](#color)
- [Agents](#agents)
- [Review and revisions](#review-and-revisions)
- [Delivery](#delivery)

## Direction defaults that held

- **Generated footage is shown clean.** Directors rejected effects on the footage itself: LED dots,
  halftone, scanlines, ASCII, posterize/cel, outline traces, glow, grain and color grades. To get a
  different look on the subject, _generate_ it in that look (a style frame, then animate it). Don't
  filter it.
- **Code goes on top of the footage and is integrated with it** (behind via the matte, on it via
  tracking, in front). Footage pasted onto a graphic background, or a split screen, was rejected.
- **Motion graphics first.** The video should feel like a motion designer's showreel: fast, kinetic
  type, 2D and 3D mixed. It still needs the subject in many sections, including full-body long
  shots, not just close-ups.
- **Type frames the subject, never covers the face.** That means vertical banner type on the empty
  third, a dim zone behind the subject, or hero type behind via the matte. Behind-the-subject type
  still has to read; a hidden first letter got flagged.
- **No static frames, ever.** A frozen plate (a clip that ran out, a slot clip held before its slot,
  a still image standing in for video) reads as broken. Every footage moment plays live.
- **Variety of looks per section** (dark neon, white editorial, flat color, B&W film, pixel), cut
  hard on downbeats. Directors who want lots of color need to give color references; without them
  the palette drifts toward safe choices.
- **The first 3 seconds decide whether people keep watching.** Open on the hook with the subject
  already performing, and make sure it works as a muted autoplay.
- **Brand assets are exact.** Use the official logo files in their official colors (never recolored
  to the palette), and only where the director says. A small "made with …" credit on the end card is
  welcome.
- **Showcase moments get time.** A logo build or end card played too fast to see until it ran at
  0.35-0.5×. A pixel-art moment with many fast cuts was "too much", and two long shots worked
  better. It's fine for the video to run past the song with silence on an extended end card.
- **Offer variants instead of arguing.** Alternate endings rendered as timeline variants let the
  director pick (one picked the third of three).
- **Replace rather than patch.** A close-up the director dislikes gets a different shot, not a
  re-grade. A weak generated insert (a glowing node network) gets rebuilt in code as vector
  graphics.

## Song and lyrics

- Separate the vocals with Demucs first, and align on the vocal stem.
- **Whisper large-v3 word timestamps beat wav2vec/MMS forced alignment on singing.** MMS ran about
  200 ms late. Do two passes, plain and with vocabulary hints, then hand-correct the text. Invented
  and technical words are often misheard.
- **Held notes pull the next short word early.** `lyrics_align.py` fixes this, except for
  legitimately long tokens (acronyms, numbers); pass those to `--no-fix`.
- **Check timing visually** with `plot_lyrics.py`. Word starts sit on the rise of a harmonic stack
  or a consonant burst.
- A chant Whisper hallucinates can be timed from vocal-envelope peaks (`--chant section:WORD`). Keep
  chant events on the half-beat grid; it reads right even when a syllable is slightly off.
- **Measure the tempo; don't trust labels.** A song generated "at 130 BPM" measured 98 with
  double-time drums. Use the event lists (`beats`, `kicks`…) and never a hard-coded BPM.
- Vocals often lead the downbeat with pickups, so check the first word of each section. Section cuts
  go on the downbeat or just before the pickup.
- The demucs stems, librosa and ffmpeg decode the mp3 consistently. The verified end-to-end offset
  was 0.0 ms.
- **Song models mangle accented names.** A French first name with an accent was sung as "her vape".
  Spell the name phonetically in the sheet sent to the model (the sound, in plain English letters),
  keep the real spelling in `lyrics.txt`, and read the transcript for every name before spending on
  footage. The same run asked for about 2:00 and got 3:04, then 2:14 after the sheet was shortened
  and an "about 2 minutes, very short intro" cue added: the sheet length and a duration cue steer
  the result, so check `ffprobe` before building anything on it.
- Match the audio edit to the request: a new musical direction calls for new auditions; a local
  correction calls for a candidate patch in a defined window. Do not treat a rejected splice as a
  ban on editing. Asking for a half-time bridge turned one take into a ballad.

## Generation and moderation

- **Style frames before video.** Generating a still per shot in its look (from the subject sheet)
  and then animating it gives better looks and consistency than text-to-video. It also lets the
  director approve the look cheaply.
- **Never send the song** to a video model. Moderation rejects it
  ("InputAudioSensitiveContentDetected"), and `generateAudio:true` reproducing the vocal fails the
  job. Use `generateAudio:false`, synthesized beat tracks for dances, and the isolated vocal stem
  for lip-sync (that was accepted).
- Reference-image mode (sheet + crop) held identity well at 720p. Clips come back at 24 fps, about
  0.04 s longer than requested.
- **Sets that composite:** a pitch-black void with a hard rim light, a flat color cyc, or white
  high-key. A glossy floor came back as a gray gradient. Flat color cycs let you replace the
  backdrop via the matte.
- Beat alignment from a beat-track reference is loose (about 1-1.5σ above chance). Always beat-warp
  dance clips; it matched 14/14 motion peaks within 160 ms.
- Text baked into generated frames is never usable. Prompt "no text", and do all type in code.
- Budget anchors at 720p, relative to one style frame (confirm live prices with `dry_run`; 1080p ran
  about 2.5 times as much per clip): a 6 s clip costs about twenty, 10 s about thirty-five, a
  lip-sync correction pass about thirteen. A full video with about 17 shots plus frames and
  lip-syncs came to about five hundred.

## Lip-sync

- **Audio-to-video** from a style frame and a vocal slice gave the lip-sync shots the director liked
  most, at 1080p, with a camera motion option.
- The alternative is reference-audio video with the vocal stem, then a **lip-sync correction** model
  (cut-off sync mode), replacing frames in place under the same clip name.
- Measure it: `lipsync_check.py` correlates mouth openness (MediaPipe FaceMesh) with vocal RMS.
  About 0.5 is good, and 0.1-0.2 is weak. Tracking fails on wide shots or when a hand crosses the
  face. Held vowels read as "closed", so judge by eye too. Never shift a slot clip to chase a
  measured lag. Under 0.2, retake it in another look if the budget allows, or run a lip-sync
  correction pass on it (the `video2video` route in `pipeline.md` §4, about thirteen style frames);
  otherwise keep the shot wider or shorter so the mouth is not the focal point.
- The audio-to-video member capped audio at 10 s at authoring time (an 11 s slice failed with a 400,
  and so did a slice of exactly 10.0 s), so cut slices of 9.9 s at most; clips come back a few
  frames shorter than the slice.
- Cut vocal slices as WAV, not mp3 (priming delay). MediaPipe must be pinned to `0.10.14` (newer
  versions dropped `mp.solutions`).

## Mattes, tracking and compositing

- **Apple Vision foreground masks** (`tools/matte`) are free, fast and good on people, but they miss
  hair against white and fine detail such as fingers on keys. Inspect mattes over a bright color
  before designing around them.
- On flat color cycs, union a chroma key with the Vision matte (`fixmatte.py`); use `--white` on
  white sets.
- On pixel art, soft mattes look dirty. Use a hard binary mask on the pixel grid plus a 1-cell ink
  outline.
- Where a cut-out is poor, don't ship it: show the full plate inside a window or shape, or
  regenerate the shot in a style that keys cleanly.
- Pose tracking is single-person and may lock onto a backup dancer, and it fails on non-human
  subjects. The matte bbox, centroid and top point work for everything. Smooth landmarks over ±2
  frames.
- Keyed (luma) footage: output is `rgb = c·m, alpha = key·m`, so dim rim halos add light and crop
  edges inside the halo show as boxes. Near-black costumes go see-through over bright type; back
  them with a dark silhouette.
- Reframe every shot for its final use: headroom, no cut-off heads (except a deliberate face ECU),
  and room for full-body shots.

## Engine and rendering

- Headless Chrome with `--use-angle=metal` runs WebGL on the GPU on macOS. A simple 1080p60 scene
  renders at about 28 fps per worker, and 3 workers in parallel are fine. A 2:00 video renders in
  about 5 minutes.
- Frame sequences decoded with `createImageBitmap` ignore WebGL `flipY`. Use
  `imageOrientation:'flipY'` with `tex.flipY=false` (already in core.js).
- **MSAA render targets only resolve inside `renderer.render()`**, so a scene that drew nothing
  showed its previous frame. main.js renders an empty scene into every layer after the scene
  renders.
- Canvas `fontStretch` only accepts keywords (`stretchKW` maps them). `drawKaraoke` over a
  left-aligned layout must force `align:'center'` per word.
- Bloom: a threshold just above 1.0 with strength about 0.5. Lower thresholds wash whole frames
  white.
- `start×fps` may not be an integer, so the first frame of a scene can belong to the previous one.
- ffmpeg `drawtext` contact sheets failed silently on this machine; `sheet.py` uses PIL.

## Color

- With footage on screen, keep the grade neutral (`grade:'neutral'`): values ≤ 1 pass through
  untouched, and only HDR graphics compress.
- For amber-on-black, graphics-led pieces, `grade:'warm'` solves known problems:
  - ACES turns #FFB000 lemon-yellow, which the hue-preserving blend and yellow pull fix.
  - Chromatic aberration creates cool fringes on white type, which the g ≤ r, b ≤ g clamp kills.
  - A pink cast on peach skin is fixed by re-clamping b ≤ 0.85·g.
- Fades to black through a flash go gray or muddy. Fade through color instead (white → brand color →
  dark brand color → black), or iris to pure #000. #0B0B0B "ink" is not black, and it showed as a
  raised black.

## Agents

- One agent per song section, each owning one scene file, all working in parallel. It stays coherent
  when they share STYLE.md, a written treatment with a footage map, ENGINE_API.md, research notes
  and an explicit verification loop.
- Build the engine, data, style bible, smoke scene and footage pipeline **before** launching agents.
  Message the agents as new clips land.
- For revisions, resume the same agents via SendMessage (they keep their context) with one shared
  notes file. Keep the agent ids in `analysis/agents.md`.
- A global audit message to all agents ("find and fix any static frame in your section") works well.
  Ask each for a measured check (freezedetect, stills) in its report.
- Watch for clip double-use across sections. Agents under load report low fps; the in-page frame
  time is the real number.

## Review and revisions

- Watch the whole cut as 0.5 s contact sheets (8×5 tiles per 20 s) and check each section boundary
  at −1/0/+1 frames.
- Director notes arrive as timestamps ("at 0:36 the cut-out is bad", "at 0:48 it's too static"). Map
  each to its owning section and agent, fix it, re-render that range, and show a still or short clip
  of the fix.
- Count the iterations, song and video separately. Directors want that number for the making-of.

## Delivery

- 1080p60, 2-pass x264 at about 21 Mb/s (maxrate 25M) with AAC 192k gives about 414 MB for 2:37,
  under X's 512 MB limit. Standard X accounts cap video at 2:20, so cut a teaser too.
- Always run `av_sync_check.py` on the delivered file: expect 0.0 ms audio and 0 to +1 frame visual.
  A lyric-led cut with a correlation under about 0.15 can read -2 or -3 frames because type leads by
  `E.LEAD`; confirm with onset stills.
- macOS filenames are case-insensitive: an encode named like its master with different case
  overwrote its own input.
- Don't delete a render output until you've confirmed it's incomplete. A stopped job may have
  finished the concat and only been encoding.
