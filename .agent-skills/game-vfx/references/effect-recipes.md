# Effect recipes

These recipes are implementation-neutral contracts. Translate them into the target engine only after the event, timing, and budget are agreed.

## Impact burst

- **Signal:** one strong contact event.
- **Layers:** short-lived core flash, directional sparks, optional dust/smoke, restrained bloom.
- **Timing:** flash and audio transient at contact; particles decelerate and fade rather than lingering indefinitely.
- **Readability rule:** the hit point remains visible through the effect.

## Smoke or fog

- Use authored flipbooks when silhouette matters; use a small number of soft noise blobs for ambient overlays.
- Keep movement slow and coherent; do not add per-particle random flicker unless it communicates turbulence.
- For volumetrics, state sample count, render scale, depth behavior, and fallback before implementation.

## Lightning

- Generate a deterministic centerline, then apply bounded midpoint displacement or controlled curve offsets.
- Add branches only at meaningful junctions and cap total segments.
- Draw the bright core separately from the wider glow so the silhouette survives bloom reduction.

## Fire and sparks

- Separate a stable low-frequency flame shape from high-frequency sparks.
- Pool particles and recycle by lifetime; do not allocate arrays or textures during the burst.
- Keep emission tied to gameplay intensity, not merely to elapsed time.

## Spell timeline

Model the effect as a phase machine: `idle`, `charge`, `release`, `impact`, `cooldown`. Each layer declares its active phases and reads the same normalized clock. A cancellation event must stop emission, fade existing particles, release pooled resources, and leave no listener behind.

## Bloom and glow

1. Render emissive contributors to a reduced-resolution target.
2. Threshold only what should glow.
3. Blur horizontally and vertically with a bounded radius.
4. Composite additively or with a controlled screen blend.
5. Measure GPU time and overdraw on the oldest supported device.

A glow pass is not a substitute for contrast or a readable silhouette.
