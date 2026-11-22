# scenario-motion-loops (maintainer notes, not packaged)

## Origin

The agent skill offered as a ZIP on the Motion Loops exploration
(scenario.com/explorations/motion-loops): 80 seamless loops (40 backgrounds, 40 shape animations),
each a few dozen lines of Canvas code on the helpers in `scripts/loop-template.html`. Brought into
this repository on 2026-10-20.

## Edits for this repository

- Description cut to triggering conditions, under 500 characters; the step summary is gone.
- American spelling throughout, script comments and identifiers included.
- `references/scenario-mcp.md` dropped. It repeated connection setup, the `recommend` and
  `next_step` loop, uploads and pricing, which the `scenario` skill owns. Its cut-out and
  alpha-video facts moved to the body, with removal handed to `scenario-image-editing` and
  `scenario-video-editing`.
- The rule table became a list, per the table-cell rule. The MCP-step table went with
  `scenario-mcp.md`.
- `render-loop.mjs` now fails with an install hint when the browser does not start (a fresh
  Playwright with no downloaded Chromium), instead of an uncaught stack trace. It also says why it
  skipped an encode (a failed page check, a refused still), where it used to exit 1 silently, and
  rejects non-numeric `--crf`, `--seconds`, `--samples` and `--ss`.
- The ffmpeg composite resamples the shot to 24 fps in the filter, which the original only advised.

## Verification

- `tests/scenario-motion-loops/`: the template's helpers, palette, example tile and overlay run in a
  VM against a recording context (frame at 12 s equals frame at 0 s, determinism, every aspect and
  tone). The script's arguments and `--qa` run against ffmpeg-made clips (seamless, jump, duplicate
  last frame).
- The browser half (`--check` pass, `SEAM JUMP` on a 5 s period, `NOT DETERMINISTIC` on
  `Math.random`, a full 288-frame render passing its own file check) runs only with
  `MOTION_LOOPS_PLAYWRIGHT_DIR` set, since CI installs no browser. It passed locally on 2026-10-20
  with Google Chrome (`MOTION_LOOPS_CHANNEL=chrome`) and ffmpeg 7.1.
- Live application test on 2026-10-20 (separate process, 5.5 CU over two background-removal runs): a
  rainbow loop with the Scenario wordmark cut out on Scenario. Passed with notes. It found:
  - the MP4 tagged only the BT.709 matrix: primaries and transfer read `unknown` on ffmpeg 7.1. The
    encode and the composite command now end their filter chains with `setparams`, and `--qa`
    reports `UNTAGGED COLOR`;
  - "never add a color" left a rainbow request to a guess, so the body now allows a computed hue
    sweep on a period dividing 12;
  - the halo advice named no knob, and the render time was unknown in advance. One clause each.
