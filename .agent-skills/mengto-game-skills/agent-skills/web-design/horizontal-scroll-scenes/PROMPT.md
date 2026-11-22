# Horizontal Scroll Scenes — Demo Prompts

## Minimal prompt

Use $horizontal-scroll-scenes to turn this page into five scenes on one fixed stage that advance left to right as I scroll down, with a resting dwell and a burn-wipe move per scene, an index that follows, and correct reverse, fast-skip and reload.

## Recreate the demo

Use $horizontal-scroll-scenes to recreate **Horizontal Scroll Scenes** as one self-contained HTML file in the Kibori look: near-black `#0a0806` workshop, cream `#f2ece2` type, ember `#ff8a2b`, Instrument Serif display with Inter and Shippori Mincho labels, Vanilla JavaScript + DOM/CSS + inline SVG, no WebGL or libraries.

- A `#track` of `(9.15 + 1) * 100vh`; a `position:fixed` stage over it. Five scenes (Kumiko lattice, Seigaiha wave, Kigumi joint, Yakisugi char, Urushi bowl), each a dark wall with a shoji window and one SVG craft. Text alternates left and right, the craft sits on the opposite side.
- `travel(sp)` with `DWELL 1.15`, `MOVE 0.85`, line `L = -0.08 + 1.24*rc`, index flip at `f < 0.39`. Two copies of the world: A frozen at scene `i` clipped ahead of the ragged ember line, B at `i+1` behind it. Char veil 34% wide ahead of the line. Craft clocks `--p0..--p4` and eased `--e0..--e4` on the stage drive stroke-draw, a beam drop, a char clip and a lacquer coat.
- First screen: the title "Horizontal Scroll Scenes" with the stack line, which the first 0.02-0.40 units burn off as scene 1 is written in. Bottom-left readout `u 0.00 / 9.15 · S1 / dwell 0.00`, bottom-right index of five real links, `Scroll` cue.
- A Burn wipe / Pan radio pair in the bar: same state machine, two transitions.
- Index links glide: one scene away is a plain cubic leg, more is smoke, jump to the station before, and only the last move. Wheel, touch or nav key cancels. A polite live region announces landings. Reduced motion cross-fades and jumps instantly.
- Verify: 20 states forward and reverse with an identical style signature, direct jumps, reload at three depths, 1440×900 and 390×844, clean console.

## Remix prompt

Use $horizontal-scroll-scenes to build a six-chapter tide-table for a harbour town: chapters march right to left instead, on a pale paper stage, with a teal accent and a monospace index, using a pan between chapters rather than a burn. Keep the mechanism and budgets: derived state, `DWELL 1.15 / MOVE 0.85`, index flip at `f < 0.39`, last-move-only skip with a veil, no wheel hijack, no scroll-snap, `inert` on hidden chapters, and a still cross-fade under reduced motion.
