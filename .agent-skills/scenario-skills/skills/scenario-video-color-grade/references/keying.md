# Keyed selective color (B&W + one color, or recolor one object)

A look with `"selective"` turns the frame black and white except one keyed color, which is kept or
swapped. The look's `ops` then run on the result (exposure, contrast...), so a bright, contrasty B&W
needs e.g. `exposure +0.3`, `cdl offset −0.025`, `contrast 0.55`, `highlight_rolloff 0.9`.

```json
"selective": {
  "center": 16, "width": 22,
  "min_sat": 0.32,
  "max_val": 0.42,
  "max_y": 0.66,
  "min_area": 4500,
  "max_val_hi": 0.9, "min_sat_hi": 0.18,
  "weights": [0.3, 0.55, 0.15],
  "shift": 0, "sat": 1.7, "val": 1.05, "sat_floor": 0
}
```

- **`center`, `width`**: the hue range in degrees, fully kept inside `width`/2 and dropped beyond
  `width`.
- **`min_sat`**: ignores grayish pixels (skin, highlights, white clothes).
- **`max_val`**: ignores pixels brighter than this. Faces, lips, and skin are brighter than a red
  jacket.
- **`max_y`**: ignores everything below this fraction of the frame height (ground reflections).
- **`min_area`**: drops connected blobs smaller than this, in pixels, or as a fraction of the frame
  when below 1.
- **`max_val_hi`, `min_sat_hi`**: a relaxed key used only inside the found object, to keep its
  highlights.
- **`weights`**: the black-and-white channel mix for everything else.
- **`shift`, `sat`, `val`, `sat_floor`**: recolor the kept object by rotating its hue and scaling
  its saturation and brightness.

## How the cleanup works (per frame)

1. **Strict key** = hue window × saturation ramp × brightness ceiling × ground band.
2. **Connected regions** above the threshold are labeled. Blobs smaller than `min_area` are dropped,
   which removes lips, fingertips, bushes, rust and specks that share the color.
3. **Highlight recovery:** inside the surviving object (grown 6 px, holes filled), a relaxed key
   lets back in the object's bright, less saturated highlights, so a backlit jacket stays fully
   colored. A face is a separate region, so it can't be affected.
4. Soft edges (a few px blur) so the color blends into the gray.

## Tuning procedure

1. `inspect_frame.py grid` to read coordinates, then `sample` the object AND what shares its color
   (skin, lips, hands, nearby ground, sky) on 2 or 3 frames.
2. Pick the separating dimension. Typical findings:
   - Red / brown leather vs skin: similar hue (12 to 34 vs 20 to 32°). The leather is **darker**
     (val 0.2 to 0.6 vs 0.45 to 0.78) and often **more saturated**, so use `max_val` around 0.42 and
     `min_sat` around 0.32.
   - Warm wet ground and car indicator lights share the color but sit low in the frame, so use
     `max_y`.
   - Under warm light the "red" moves toward orange; re-measure after any relight or source change.
3. `inspect_frame.py key ... --frame <several>` prints blob sizes and positions per frame. Set
   `min_area` between the smallest real piece (a jacket half can be about 15k px at 1080p) and the
   largest junk blob, with margin for when the object is partly hidden.
4. Check the red overlay on static AND motion frames (motion blur changes saturation).
5. Swapped colors: `shift` rotates the hue (red → gold ≈ +34 to +50, → emerald ≈ +140, → cobalt ≈
   +215). Use `sat_floor` (0.3 to 0.5) so a muted object becomes a clear color. Very saturated
   cobalt or green on leather looks fake; keep `sat` around 1.0 to 1.6 and `val` 0.85 to 1.3 (gold
   needs `val` above 1).

## Pixel-perfect: object masks (use these when the result must be exact)

A color key alone is never pixel-perfect on real footage: skin, lips, warm light, reflections and
rust share the object's color. When the user wants exact edges, get **object masks** and let the key
work only inside them:

1. Segment the objects with a video segmentation model on Scenario, picked with `recommend` (see the
   worked example in SKILL.md). Upload the exact clip you grade (same frames). Set the model's text
   prompt to a short noun phrase ("red leather jacket", "red fuel pump"), one run per object. It
   returns a black/white mask video with the same frame count. It only says WHERE the object is; it
   never changes a pixel. Check the mask by overlaying its outline on 2 or 3 full-res frames.
2. Reference the masks in the look, with paths relative to the looks file. Here the whole jacket
   keeps its color, and only the red paint of the pump does:

```json
"selective": {
  "masks": [
    {"path": "masks/jacket.mp4"},
    {"path": "masks/pump.mp4", "key": {"center": 11, "width": 18, "min_sat": 0.28, "max_val": 0.62}}
  ],
  "weights": [0.3, 0.55, 0.15], "shift": -14, "sat": 1.7, "val": 1.05
}
```

3. Mask edges are snapped to the image with a guided filter (sub-pixel, no halo). A mask entry with
   `key` keeps only the keyed color inside that object (white panels, black hoses and rust stay
   gray). Measure that inner key with `inspect_frame.py sample` like any key.
4. The mask video must have the same frame count and timing as the graded source. Re-segment if the
   source is re-cut or regenerated.

## Limits (say them to the user)

- A key separates by color, brightness and position only. If the object's color is mostly a
  reflection of its surroundings (car paint, glass, chrome), it can't be isolated this way: use
  object masks (above).
- A recolor through a LUT (the exported .cube) has no cleanup: in an editor, the user also needs a
  mask around the object.
