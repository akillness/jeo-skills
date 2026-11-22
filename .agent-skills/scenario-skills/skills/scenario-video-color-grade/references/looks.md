# The look library (assets/looks_library.json)

Tuned on a soft, slightly desaturated 1080p outdoor source. On contrasty or already-graded footage,
reduce contrast and saturation amounts by about a third.

| key                   | name                | recipe in words                                                                                            |
| --------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| 00_ungraded           | Ungraded            | no ops; the reel's first shot                                                                              |
| 01_sunset_glow        | Sunset Glow         | warmer white balance (+0.2), soft contrast, saturation ×1.15, warm highlights, rolloff                     |
| 02_duotone            | Duotone             | levels stretch, then brightness → navy to peach                                                            |
| 03_teal_orange        | Teal & Orange       | contrast 0.45; oranges ×1.8, teals ×2.2, blues pushed to teal, teal shadows and orange highlights (strong) |
| 04_scorched_desert    | Scorched Desert     | crushed blacks, hard contrast, oranges ×1.4, sky to teal, warm                                             |
| 05_vintage_slide      | Vintage Slide       | deep, rich reds and blues, punchy contrast (60s slide film)                                                |
| 06_pastel_film        | Pastel Film         | gentle contrast, faded blacks, warm highlights and green-teal shadows, grain                               |
| 07_tobacco_filter     | Tobacco Filter      | strong warm-green balance, blues nearly removed, yellow highlights                                         |
| 08_seventies_faded    | 70s Faded           | yellow-green cast, muted blues, reds toward orange, lifted blacks, grain                                   |
| 09_tungsten_halation  | Tungsten Halation   | cool tungsten balance, red halation around highlights, grain                                               |
| 10_blue_hour          | Blue Hour           | −0.9 stops, warm sky glow removed, strong cool balance                                                     |
| 11_bleach_bypass      | Bleach Bypass       | saturation ×0.4, hard contrast, slight green-cool cast, grain                                              |
| 12_noir               | Noir                | B&W through a red filter, hard contrast, vignette, grain                                                   |
| 13_bw_keep_red        | B&W + Red           | keyed: everything B&W except the red object (tune the key per clip)                                        |
| 14_bw_red_to_gold     | B&W + Gold          | same key, red turned gold                                                                                  |
| 15_match_reference    | Reference Match     | match to an image (run match.py first, writing match/reference.json)                                       |
| 16_relight_golden_sun | Relight: Golden Sun | warm directional light from the left + warm sky grad + warm grade                                          |
| 17_relight_night_lamp | Relight: Night Lamp | day-for-night with a warm pool of light on the subject                                                     |
| 18_relight_spotlight  | Relight: Spotlight  | lit subject, darker surroundings                                                                           |
| 19_relight_overcast   | Relight: Overcast   | soft, cooler, flatter daylight                                                                             |
| 20_day_for_night      | Day for Night       | color only: −1.4 stops, strong cool balance, warm and green tones muted, whites capped at 0.9              |

## Writing new looks

- **Movie or genre looks** ("like a Western", "like a heist movie"): describe the palette, contrast
  and cast in words first, then map them to ops (see ops.md, "Building a look from a description").
  Give the look a descriptive name, not the film's title.
- **Film stocks:** slide film = deep saturated primaries plus contrast; negative / portrait film =
  soft contrast, faded blacks, gentle warm skin, grain; cine tungsten stock = cool balance plus
  halation; cross-processed = green-yellow highlights, cyan shadows, oversaturated.
- **Eras:** 70s = yellow-green cast plus faded blacks; 80s VHS = magenta-cyan, low contrast (add a
  finishing blur if wanted); 90s music video = crushed blacks, cyan shadows.
- **Single-color change on the full-color image:** a `hue_shift` with a tight `center` / `width`,
  plus `min_sat` / `max_val` to exclude skin, previewed on stills. If it leaks onto skin or lips,
  switch to a `selective` look, which has the per-frame cleanup.
