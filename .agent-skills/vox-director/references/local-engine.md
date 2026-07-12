# Advanced: element-level motion collage (local keyframe engine)

Use this when the standard whole-poster animation isn't dramatic enough — when you want the
**pieces-fly-in-and-assemble** look (à la cr7v2), or you must animate **real people with full
control and zero content filters**. The video model is not used here at all; frames are drawn
locally, so nothing is blocked and everything is exact and reproducible.

The tradeoff: it's **hands-on**. Cutting the pieces and hand-placing each element's keyframes
is the bulk of the work — decomposition and hand-placement are where most of the time goes. The engine is
reusable; the per-video layout is manual (until an LLM auto-layout layer exists).

## Two stages

### 1. `extract_elements.py` — cut the poster into pieces
Reads `<project>/elements_spec.json`:
```json
{"card": "<poster.png>",
 "elements": [
   {"name": "hero",  "bbox": [x0,y0,x1,y1], "mode": "cutout", "erase": [[x0,y0,x1,y1]]},
   {"name": "title", "bbox": [x0,y0,x1,y1], "mode": "crop"}
 ]}
```
- `crop` — rectangle kept as-is (newspaper strips, text blocks). Faster, cleaner.
- `cutout` — crop → `youchuan/v8.1/remove-background` → transparent PNG (figures, trophies,
  stickers).
- `erase` — optional feathered regions to delete after cutout, in CARD coords. Needed when
  the cutout drags in a neighbor (e.g. the player cutout also grabbed the trophy → erase the
  trophy's box so it doesn't double with the separately-animated trophy).
- Pick bboxes by overlaying a labeled grid on the poster and reading coordinates.
- Clean residue: background-removal leaves color edges/ghosts — connected-components (keep the
  largest blob), color-key, or geometric masks.

### 2. `motion.py` — animate the pieces
- **`Layer(img, keys, sway, pulse, shadow)`** — each element. `keys` is a list of
  `dict(t, x, y, s, r, a, e)`: time, center x/y, scale, rotation, alpha, and the segment's
  easing. `sway`+`pulse` add a low-frequency wobble / scale-breath so settled pieces aren't
  dead-still.
- **Easings**: `smooth/in/out` (normal), `back` (settle with slight overshoot — the paper
  "snap" feel), `bounce` (drop-in). NOTE: `back` overshoots the target, so on scale it can dip
  below 1.0 and briefly reveal a copy — use `out` for scale-settles over a full backdrop.
- **Entrance helpers**: `fly_in(t0,x,y,W,H,frm,spin)` (off-screen fly + overshoot),
  `slap(t0,x,y)` (from enlarged → snap in), `drop(...)` (bounce down),
  `pop_settle(t0,x,y)` (focus-pop in place — opaque, scale 1.35→1.0, no off-screen travel, so
  it never ghosts against a full backdrop).
- **Procedural VFX** (drawn in code, keyed to the beat's palette): `starburst`, `Confetti`.
  Confetti drifting throughout is a big part of the tactile energy.
- **Camera**: `cam()` = slow zoom + impact shake (exponential-decay sine on entrances) + whip
  between beats (sample from a 1.2× overscan canvas with directional blur — never affine
  translate, or you reveal black edges).
- **Render**: Pillow draws each frame, piped as rawvideo to ffmpeg. Supports `--only` to
  re-render selected shots.

## Making the assembly reconstruct the ORIGINAL poster

The key lesson: if you scatter pieces into a *new* arrangement on a new background, the result
stops looking like the source poster (the user will notice). To avoid that:
- Elements rest at their **original positions** on the card (bbox center × canvas scale). The
  canvas aspect must match the card (e.g. 3:4), so the assembled frame == the original poster.
- Use the **original poster as the backdrop** so context/background matches.
- **Placeholder problem**: before a flying element lands, its home spot on the backdrop would
  show a copy (ghost). Dimming/lightening that region makes a visible dark/bright patch
  (worse on off-color backgrounds). The fix that works: **blur that region only** — luminance
  and color are preserved (no patch), and the sharp element flies in to "focus" it. Or inpaint
  the region to clean background.

## When NOT to bother
If the content is non-real and "living poster" motion is enough, stay on the standard path —
it's one prompt and fully automated. The local engine is worth it for hero pieces, real
people, or when a client specifically wants the fragment-assembly aesthetic.

Scripts: `extract_elements.py`, `motion.py`, plus `confetti.py` (overlay asset), `kenburns.py`
(pure-ffmpeg fallback when no AI motion is available), and `mg_scrapbook.py` (a lighter
"tilted cards on a desk + confetti + whip + ending layout" assembler).
