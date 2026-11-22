# Delivery, audio, and pre-flight

## Masters and safe zones

Compose per ratio, never crop: a 9:16 master at 1080x1920 (TikTok, Reels, Stories, Shorts) and, when
the brief needs it, a 16:9 master at 1920x1080 (YouTube in-stream, CTV). A 4:5 feed variant may
center-crop from the 9:16 only if the storyboard planned for it.

Safe zone for 9:16 (as of 2026, platform UI eats the edges): keep the product hero, all text, and
the CTA inside the central band, clearing roughly the top 14 percent, the bottom 35 percent, and 6
to 13 percent per side. One composition then passes every 9:16 placement. For 16:9 broadcast-style
delivery, keep text inside a 10 percent title-safe margin.

Durations are placement-exact: bumpers exactly 6s; CTV slots exactly 15s or 30s (a 22-second cut is
undeliverable there); skippable in-stream must land brand and proposition before the skip button at
5s. Feed cuts: 6 to 15s for conversion, 15 to 30s otherwise.

## Assembly

The cut, overlays, and captions are all model runs (contract in `scenario-video-assembly`): clips as
video layers, the logo and every text card as image layers, the music as an audio layer. Render text
cards deterministically with the `scenario-text-overlay` skill, canvas sized to the master: exact
type, boxes positioned inside the safe zone. Legal and locale text must be verbatim, which is why it
is never generated.

Keep every generated frame text-free so locale and legal variants are overlay swaps, not
regenerations: German text runs about 30 percent longer than English, right-to-left locales mirror
alignment and directional motion, and legal supers differ per market (WLTP-qualified range wording
in the UK and EU, "EPA-estimated" in the US, retouching labels on altered bodies in France and
Norway).

Captions: burned in for sound-off feeds, white sans-serif on a dark backing, 3 to 7 words per cue,
inside the safe zone, and moved off the bottom edge when an overlay sits there (`model_schema_get`
on the caption tool decides whether position is a field or the overlay must move instead).

Give overlays hard in and out points rather than fades, and QC the assembled master by extracting
its frames and checking every overlay window: compositors have dropped mid-timeline image layers
that carried fade parameters, and a fade can be simulated safely with two or three stacked copies of
the layer at rising opacity.

## Audio

- Music is generated, not licensed by default: commercial tracks need sync licenses for paid media,
  and platform music libraries do not travel with the creative (TikTok's commercial library is
  TikTok-only), so a cross-platform campaign cannot rely on them. Generation contract:
  `scenario-audio`.
- Decide the cut grid first, then prompt the music at that tempo: one beat lasts 60/BPM seconds; cut
  calm sections on bars, payoffs on beats, and land the reveal and the end card on downbeats.
- Voiceover reads at 2 to 2.5 words per second: 8 to 12 words in 6s, 30 to 35 in 15s, 60 to 70 in
  30s, finishing a beat before the end card. Count words before running text-to-speech. Stock or
  synthetic voices with commercial licenses only; cloning a real voice requires the owner's verified
  consent.
- Duck the bed 12 to 18 dB under speech with the compositor's per-layer volume. A 1.5 to 3 second
  sonic logo sits on the end card; on skippable formats repeat a short brand sound cue inside the
  first 5 seconds.
- Loudness: platforms normalize down, never up. Social masters sit near -14 LUFS integrated with -1
  dBTP true peak; CTV requires -24 LKFS plus or minus 2 with -2 dBTP, so a CTV delivery is a
  separate audio pass. The compositor is not a loudness meter: name the conform step to the user
  instead of claiming compliance.
- CTV picture floor: 1920x1080, constant frame rate, bitrate well above social norms. AI clips
  usually need a video upscaler pass first (`recommend` with the upscale need in the user's own
  words).

## Pre-flight, before calling it shipped

1. Fidelity: every product and character clip passed the gate in [storyboard.md](storyboard.md).
2. Cumulative effect: review the assembled cut as a whole for sensuality, driving behavior, and body
   framing; ad review judges the sum of shots, not each shot.
3. Flashes: no more than 3 luminance flashes in any second and no saturated red flashing; broadcast
   and CTV clearance test this mechanically, and strobe hooks are the classic failure.
4. Sound-off pass: watch the master muted; the message must survive on picture and captions alone.
   Then watch it with sound.
5. Report: files per placement, actual spend against the approved board (`usage`), and cost per
   usable shot.
