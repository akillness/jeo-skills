# Rubric: lit wood in a dark room, scored out of 10

Eight items, each 0-10, each built from 2-4 measured sub-metrics. A sub-metric maps to a score through three anchors, `[v@3, v@6, v@9]`, linear between them and beyond, clamped to 0-10. An item's score is the mean of its sub-scores. The anchors below are the numbers in `metrics.js`; if you change one, change it in both places and re-run the baseline and the ablation, or the scores stop meaning anything.

Benchmark for "9": a still from a Kibori station (oiled hinoki on a bench, one window, dust in the beam) that you could not tell from a photograph at a glance. "6" is a competent three.js scene: right colours, lit, nothing wrong, nothing convincing. "3" is a flat-shaded prop.

Scale: 10 study it, 9 a trained eye finds almost nothing, 8 polished with minor nits, 7 a noticeable flaw, 6 works with visible rough edges, 5 mediocre, 3-4 clearly wrong in places, 1-2 barely works.

Every region below is in the frame's own fractions and is projected from world points through the live camera (`KiboriScore.regions()` in the demo). Scoring a different scene means writing that function, not changing the metrics.

## 1. Materials and grain

| | looks like | |
|---|---|---|
| 3 | one flat tan colour, or a tiled photo with a visible repeat; grain lines cross the board at random angles | `uFlat` on: 1.7 |
| 6 | streaks run the right way but every board has the same pattern; no pores, no ring drift | |
| 9 | rings drift into cathedral arcs, pores and fibres resolve at 1 px, end grain reads as cells, no two boards alike | demo: 8.1 |

Measure, on a lit patch of plain wood (not the carving):
- `grainContrast` band-pass 1-8 px std / mean luma: **0.006 / 0.022 / 0.05**
- `grainAniso` gradient energy across the grain over along it: **1.1 / 1.9 / 3.2** (lines that follow the axis)
- `toneVar` std of a 29 px blur / mean, the broad drift of ring bands: **0.008 / 0.035 / 0.08**

## 2. Key / fill contrast

| | looks like | |
|---|---|---|
| 3 | lit and shaded faces within half a stop; reads as ambient light | baseline 4.1 |
| 6 | a clear light side, but the dark side is either mud or black | |
| 9 | warm key 3+ stops over a cool fill that keeps the shaded flank alive; the room stays dark around the pool of light | demo: 10 |

- `keyFillStops` log2(lit face / shaded face), linear light: **0.7 / 1.7 / 2.8**
- `rangeStops` p99 / p1 of the whole frame, stops: **3 / 5 / 7**
- `shadeAlive` shaded flank in linear light x1000 (must not crush to 0): **1.5 / 4 / 10**

## 3. Shadows and contact

| | looks like | |
|---|---|---|
| 3 | no shadow, or a shadow with a bright gap under the object (peter-panning) | baseline 5.6 |
| 6 | shadows land but are uniform grey; the base of each object floats a little | |
| 9 | shadow is deep where it starts, opens into a soft penumbra, and the object sits in a dark seam where it touches | demo: 9.6 |

- `shadowRatio` lit bench / shadowed bench, linear: **1.6 / 3.5 / 7**
- `contactDark` contact strip / open bench, lower is better: **0.75 / 0.42 / 0.18**
- `penumbraMono` share of the profile that rises monotonically from contact: **0.6 / 0.8 / 0.95**
- `contactGap` brightness drop moving away from contact, i.e. a light sliver, lower is better: **0.30 / 0.10 / 0.02**

## 4. Volumetric shafts and dust

| | looks like | |
|---|---|---|
| 3 | no beam, or a hard-edged translucent plane with a visible end | baseline 4.7 |
| 6 | a beam with soft sides but the same brightness end to end; dust absent or evenly sprinkled | |
| 9 | modulated beams that fade in and out along their length, a hard wedge nowhere, blacks intact beside them, dust that shows only where the light is | demo: 8.0 |

- `shaftDelta` levels above a reference strip out of the beam, **1.2 / 4 / 9**, and it must not exceed 35 (a beam that bright is washing the room; the score falls to 3 at 70)
- `shaftRough` jaggedness of the falloff, lower is better: **0.5 / 0.22 / 0.08**
- `dustFrac` soft specks 6+ levels above their 7 px neighbourhood, in the beam minus dark wall: **0.0002 / 0.001 / 0.003**

## 5. Background rays

| | looks like | |
|---|---|---|
| 3 | none, or one band | baseline 0.8 |
| 6 | two bands, even brightness | |
| 9 | four or more bands of unequal width and brightness fading down the wall, behind the objects, not competing with them | demo: 8.8 |

- `rayContrast` p92 - p8 across the wall band, levels: **1 / 3 / 6.5**, capped: above 45 it is glare (3 at 90)
- `rayPeaks` distinct bands across the wall: **1 / 2 / 4**

## 6. Colour and tone mapping

| | looks like | |
|---|---|---|
| 3 | highlights clipped to white, blacks lifted to grey, banded gradients, warm and cool the same | baseline 4.5 |
| 6 | no clipping but flat, or crushed | |
| 9 | the window rolls off instead of clipping, black point at 2-7, warm key vs cool shadow, no bands in the dark wall | demo: 9.8 |

- `clipPct` % of pixels with a channel >= 254, lower better: **4 / 1.2 / 0.25**
- `p1` black point luma, lower better until crushed: **34 / 18 / 7**
- `crushPct` % of pixels < 2: **45 / 22 / 8**
- `warmCool` R-B of the same bench in light minus in shadow: **1 / 8 / 18**
- `flatRun` share of wall pixels in runs of 6+ identical values (8-bit banding), lower better: **0.5 / 0.2 / 0.04**

## 7. Texture resolution and texel density

| | looks like | |
|---|---|---|
| 3 | soft mush at the closest view, or shimmering moire on a board seen edge-on | field 16 px: 6.9 |
| 6 | sharp face-on, crawls at grazing angles | |
| 9 | 1 px detail face-on, calm when the camera moves by half a pixel, source texels >= 1 per device pixel | demo: 9.7 |

- `fineStd` 1 px Laplacian std, levels: **0.5 / 1.4 / 3.2**
- `texelPerPx` source texels per device pixel at the finest grain band, below 1 means magnified (soft): **0.45 / 0.9 / 1.6**
- `shimmer` shift the view by half a pixel; mean |A-B| over 0.5 x mean |gradient|, lower better: **3.2 / 1.9 / 1.15**. A prefiltered surface is ~1; an aliased one is 3+.

## 8. Specular and roughness realism

| | looks like | |
|---|---|---|
| 3 | no highlight, or a white plastic hotspot | baseline 4.5 |
| 6 | a smooth sheen that ignores the grain | |
| 9 | a broad soft sheen that travels across the board, broken up where open pores raise the roughness, never near-white | demo: 6.5 (short) |

- `sheenSpread` p95 / p25 of the blurred wood, linear: **1.06 / 1.3 / 1.9**
- `paintClip` share of near-white pixels in the wood, lower better: **0.05 / 0.01 / 0.0005**
- `hlBreakup` texture surviving inside the brightest quartile of the sheen: **0.004 / 0.018 / 0.045**

## Reading a scorecard honestly

- These are proxies. Two things a metric cannot see: whether the object reads as the thing it is (a plaque, not a tray), and whether a lighting choice is tasteful. For those, hand the captures to a fresh judge who has not seen the numbers and take the lower of the two scores.
- The ablation in the scorecard is the check on the metrics themselves. A layer that does not move any item it should move, or whose removal *raises* the total, means the metric is measuring the wrong thing or the layer is not earning its cost. In the demo, turning the studio reflections off raised the total by 0.14 (they lift the shadows); that is reported, not tuned away.
- A score is only comparable at the same size and DPR. The demo scores 8.8 at 1440x900 x1 and 8.7 at x2 (more texels, but the dust specks are finer than the 7 px window).
- Stop when every item reaches the target or one plateaus for a reason outside the task. The demo's specular item plateaus at 6.5-7.4: the sheen is broad, not a distinct highlight, and the two levers that add one (clearcoat over a window that fills the board, and anisotropy) veiled the grain or smeared the carving in a 2x crop, so they were rejected on sight.
