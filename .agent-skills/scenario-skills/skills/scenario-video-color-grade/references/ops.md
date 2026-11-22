# Color ops (per-pixel, baked into the LUT)

All ops take and return Rec.709 display RGB in 0-1. They run in the order listed in a look's `ops`.
Typical ranges are what produced good results on real footage; push further only for stylized looks.

Each entry gives the op, its parameters with defaults, then what it does and typical values.

- **`decode_log`** (`curve="slog3"`, `exposure=0`, `knee=0.8`): camera log to Rec.709. Put it first
  for log footage. Supports S-Log3 / S-Gamut3.Cine only.
- **`white_balance`** (`temp=0`, `tint=0`): linear-light gains. `temp` +0.05 to +0.35 is warmer,
  negative cooler. `tint` positive is magenta, negative green (0.02 to 0.1 either way).
- **`exposure`** (`stops=0`): linear exposure. -0.9 to -1.5 for day-for-night.
- **`cdl`** (`slope=[1,1,1]`, `offset=[0,0,0]`, `power=[1,1,1]`): ASC CDL. Offset -0.02 to -0.04
  deepens blacks; a per-channel offset tints the shadows.
- **`contrast`** (`amount=0`, `pivot=0.45`): filmic S-curve. 0.15 to 0.45 is normal, 0.75 to 0.9
  hard (bleach, noir); negative flattens.
- **`levels`** (`black=0`, `white=1`): where black and white land. `black` 0.03 to 0.08 fades or
  lifts blacks (film, 70s); `white` 0.92 to 0.97 rolls off.
- **`saturation`** (`amount=1`): global, luma-preserving. 0.4 bleach, 0.75 muted, 1.1 to 1.35 rich.
- **`vibrance`** (`amount=0`): boosts weak colors more than strong ones (0.2 to 0.4).
- **`split_tone`** (`shadows=[r,g,b]`, `highlights=[r,g,b]`, `balance=0.5`): adds a color to the
  shadows and another to the highlights, offsets 0.02 to 0.08. Teal shadows are about
  `[-0.05, 0.01, 0.06]`, warm highlights about `[0.06, 0.025, -0.05]`.
- **`hue_shift`** (`center`, `width`, `shift=0`, `sat=1`, `val=1`, `min_sat=0.05`, `sat_floor=0`,
  `max_val=None`): changes one hue range by rotating it (`shift` degrees) and scaling its saturation
  and brightness. Edges blend instead of sweeping through in-between hues. Hues: red 0, orange 25,
  yellow 55, green 120, teal 185, blue 215, purple 280.
- **`mono`** (`weights=[.2126,.7152,.0722]`, `tint=[0,0,0]`): black and white with a channel mix. A
  red filter `(0.6, 0.35, 0.05)` gives bright skin and a dark sky.
- **`duotone`** (`shadows`, `highlights`, `mid=None`, `contrast=0`): brightness mapped to two or
  three colors. On flat sources, precede it with `levels` (black -0.12, white 1.35) so the full
  gradient is used.
- **`match`** (`stats`, `strength=1`): Reinhard transfer to a reference's Lab mean and spread. The
  stats come from `match.py`; the path is relative to the looks file.
- **`highlight_rolloff`** (`knee=0.8`): a soft shoulder so boosted highlights don't clip (0.85 to
  0.9).

## Finishing (ffmpeg, per look)

| key        | example                                                                      | note                                                                                                  |
| ---------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `vignette` | `"PI/5"`                                                                     | ffmpeg vignette angle; PI/6 subtle, PI/3.5 strong.                                                    |
| `grain`    | `6`                                                                          | Temporal noise strength (4 to 10). Makes files bigger.                                                |
| `halation` | `{"threshold": 0.5, "sigma": 12, "opacity": 0.85, "color": [1, 0.25, 0.06]}` | Red glow bleeding from the brightest areas (cine film look). Lower threshold catches more highlights. |

## Building a look from a description

Translate the words into the five things a colorist adjusts, then express each one as ops:

1. **White balance / overall cast:** `white_balance`, then `split_tone` for different shadow and
   highlight colors.
2. **Contrast and black level:** `contrast`, `cdl` offset, `levels`.
3. **Saturation overall:** `saturation` / `vibrance`.
4. **Specific colors:** `hue_shift` (push skin toward orange, the sky toward teal, kill blues,
   deepen reds).
5. **Texture:** vignette, grain, halation.

Test every new look on stills (render_looks.py --frame) before rendering video.
