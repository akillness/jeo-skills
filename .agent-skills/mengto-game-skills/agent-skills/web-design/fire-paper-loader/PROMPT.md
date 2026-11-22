# Fire-Paper Loader — Demo Prompts

## Minimal prompt

Use $fire-paper-loader to add a burning-paper ring loader that starts from the head, is drawn by a worker so it keeps moving while the page builds, and hands off to the page without a stall.

## Recreate the demo

Use $fire-paper-loader to recreate **Fire-Paper Loader** as one standalone HTML file. Treat `demo.html` as the reference for the loader's code, motion and hand-off.

- Head: a script that starts a Worker from a Blob boot script and transfers an OffscreenCanvas to it before the stylesheets finish; the worker makes its WebGL context there.
- Body: a fixed black `#kindle` layer, a full-size canvas, and a centred label `KINDLING` plus a count, 11 px Inter, 0.26em tracking, 24vh below centre, `role="progressbar"`.
- The ring: a torn ember arc that opens to a ragged ring of about 0.28 of the half-diagonal at hand-off. Smooth yellow to orange to red gradient with a beading gold thread, near-black porous char, cinders off the upper arc. Grown in S-space, sprung, never still, never lurching.
- A stand-in build that holds the main thread for 250-450 ms at 14 stations and calls `step(p)` between them, then `done()` and `close()`.
- Under it, a page (serif headline, stack line, one-paragraph mechanism note, worker and blocking checkboxes, Replay, and a readout of the longest gap between fire frames).
- Reduced motion: no time, no cinders, 250 ms fade. Hidden tab: no waiting.

Verify at 1440x900 and 390x844: ring visible on first frame, main-thread mode shows a 450 ms gap and worker mode under 20 ms, clean console.

## Remix prompt

Use $fire-paper-loader to change the subject and keep the mechanism: a loader for a film-title site where a candle-wax seal melts open on cream paper, in indigo and gold. Keep the head-started worker, parallel compile plus a waited 1-px warm-up draw, the S-space pace, the CSS-faded last frame, no early terminate, reduced-motion still, and the DPR 1.5 cap. Change the shape, palette, label copy and the page beneath it.
