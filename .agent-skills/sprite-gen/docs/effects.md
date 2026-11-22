# Effects

`sprite-gen` creates non-looping additive visual effects (bursts, flashes, impacts) using pixel drawing or video workflows.

## Pixel Effects

Claude draws pixel grids (8–48 px) using palette brightness steps:

```bash
sprite-gen pixel-draw --kind effect --subject 'a small orange fire burst' \
  --size 16 --frames birth,peak,decay,gone --candidates 1 --out-dir fire
```

- **Frames**: 2–8 frames (default: `birth,peak,decay,gone`; other kinds retain at most four). Empty frames are allowed if content changes and at least one frame is visible.
- **Constraints**: No fixed height, feet, or stray spark checks. Origin is centered across all frames.
- **Outputs**: Generates `effect.strip.png`, `effect.strip.json` (mapped in `report.json`), preview, and individual frames.
- **Dark Smoke**: Dark occluding smoke is not additive light; use `sprite`, `icon`, or chroma modes for normal blending.

## Video Pipeline

1. **Prepare canvas**:
   ```bash
   sprite-gen video-canvas --still effect.png --state effect --out canvas.png
   ```
   Accepts RGBA or artwork on black. Retains canvas dimensions and center, composites alpha over black, and writes empty black `canvas.end.png`. Framing overrides are disabled for effects.

2. **Generate prompt**:
   ```bash
   sprite-gen video-prompt --direction front --state effect --character 'A fiery explosion' > prompt.txt
   ```

3. **Generate video**:
   ```bash
   sprite-gen video --image canvas.png --last-frame canvas.end.png \
     --prompt-file prompt.txt --duration 3 --resolution 480p --out clip.mp4
   ```
   `canvas.end.png` can be passed alone without `--image` for text-driven content. Standard provider billing applies.

4. **Extract frames**:
   ```bash
   sprite-gen video-frames --clip clip.mp4 --out-dir frames --alpha-mode brightness
   ```

5. **Extract lifetime sequence**:
   ```bash
   sprite-gen video-loop --frames-dir frames/keyed --fps 24 --state effect \
     --cycle lifetime --out-dir result --name fire
   ```
   Set playback using the FPS from `frames/frames.report.json`. The effect runtime automatically selects lifetime around a fixed origin without requiring particle cleanup passes or edge checks. The ending frame must reach alpha zero so the sequence terminates cleanly.

Automate all stages using `video-set`:
```bash
sprite-gen video-set --base front=effect.png --states effect \
  --out-dir result --character 'A fiery explosion'
```
No per-direction variations are needed; rotate a single front effect at runtime.

## Brightness Alpha & Rendering

Channel brightness is evaluated across 8-bit channels as $m = \max(R, G, B)$. A shared floor of 2 is applied to every frame and effect, reported as `brightness_noise_floor=2`. If $m \le 2$, all RGBA channels are set to zero. For $m > 2$, alpha is computed as $a = m / 255$, and straight color is reconstructed as $U = C / a$, where $C$ is the source-on-black color. Values 3 and above are not dimmed by subtracting the floor.

Additive output is calculated as $\min(255, B + a \cdot U)$ against background $B$. Pure white additive output saturates cleanly to white. Dark smoke becomes faint and black cannot occlude; use chroma keying when rendering opaque smoke. While PNG and WebP retain partial alpha, GIF cannot retain partial alpha ([Pillow](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html#gif): the transparency option selects a palette color index). Video lifetime GIF is now an opaque preview on a baked black background. It is NOT a transparent overlay; on a white page it intentionally has a solid black rectangle. PNG strips and WebP remain the transparent effect outputs, retain partial alpha and end on an alpha-zero cell/frame. Their normal-alpha preview on white is checked using ordinary alpha compositing (not addition).

## Metadata

Shared attributes:
- `loop: false`, `hold_last: false`, `blend: add`
- `end_frame`: final delivered strip index
- `anchor`: canvas center (relative to crop in video)

Pipeline differences:
- **Pixel**: `events: []`
- **Video**: `kind: lifetime`, `events: [{frame: <int>, name: "motion_peak"}]`, and `source_cut.samples` naming source frames. The video `<name>.loop.report.json` `gif` object contains `background: "#000000"`, `opaque: true`, `corners_transparent: false`. Strip metadata `blend: add` remains unchanged.

GIF and WebP play once. The video GIF ends on a fully opaque black frame; the transparent outputs end on an empty frame. Pixel GIF behavior has not changed. Strips can subsample while retaining both endpoints.

## Shared Code Reuse

| Component | Reuse Details |
|---|---|
| `effect.on_black` | Black compositing body extracted unchanged from `effect.canvas` so generation canvas and video GIF call one function |
| `util.gif_utils.save_clean_gif` | Added an explicit `opaque=True` mode for pre-composited frames; transparent default remains unchanged |
| `video.loop.verify_animation` | Verifies every frame's opacity and corner color only with its explicit background parameter; its default transparent corner check and loop checks are unchanged |
| `write_webp` | Reused unchanged |
