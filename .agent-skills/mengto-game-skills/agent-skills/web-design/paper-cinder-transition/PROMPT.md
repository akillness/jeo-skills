# Paper Cinder Transition — Demo Prompts

## Minimal prompt

Use $paper-cinder-transition to change between these chapters with a paper-burn line:
a ragged ember edge sweeps across, the old chapter frozen and charring ahead of it,
the next one live behind it. Not a fade, not a slide.

## Recreate the demo

Use $paper-cinder-transition to recreate **Paper Cinder Transition** as one standalone
HTML document. Treat `demo.html` as the visual, motion, responsive, accessibility and
performance reference.

### Experience

- One full-viewport WebGL canvas showing one of three timber-workshop chapters: a washi
  and cedar-lattice room in cloud light, a night workshop with one flickering paper lantern,
  and raking light over planed cedar boards. Each has a large serif title, a small kicker
  and kanji, and a two-line body, on the left, right, left in that order.
- The burn is the subject. It runs by itself once on load (about 1.4 s in), then every
  2.6 s, until the first touch or key, so the mechanism is on the first screen.
- Controls: Prev, three numbered chapter buttons, "Burn to next", and a burn-time slider
  (1.5 to 5 s, default 3.0). Arrow keys, Page Up/Down, Space and 1 to 3 change chapter.
  A press during a burn queues the target; the last one wins after the line leaves.
- A translucent chip top-left names the technique, the verified stack line
  (Vanilla JavaScript, WebGL 2, GLSL; no Three.js) and one sentence of mechanism.

### Implementation contract

- Raw WebGL 2, no libraries. Half-float render targets (`EXT_color_buffer_float`). A
  fullscreen triangle from `gl_VertexID`.
- Two scene buffers per burn: the outgoing chapter drawn once into a full-size target with
  its words and its clock frozen, and the incoming chapter drawn live each frame.
- One composite pass: `xc` is the signed pixel distance to a noisy, seeded, leaning front
  (`front = -0.26 + 1.62*rc`, band half width `0.215`, sweep from the side the incoming
  words sit). It shows the frozen frame ahead, the live frame behind, scorches the frozen
  frame 20 to 40 px ahead in one continuous darkening (tan to dark brown), draws a 26 px
  torn porous char band that is alpha-masked over the live scene, a 3 to 6 px crust, and adds
  the flame: a 0.7 to 5 px beading gold thread, a smooth yellow-orange-deep-red ember zone
  12 to 66 px wide with a torn lip, a tight 2 to 5 px glow, and dim grain glowing in the
  char just behind it. No smoke, no streaks, no rims round pores, no hard colour steps.
- Ember ramp (linear): deep `0.34,0.022,0.003`, orange `0.86,0.20,0.024`, gold
  `1.02,0.38,0.055`, hot gold `1.10,0.64,0.17`; thread `1.40,0.56,0.09` to `1.85,1.02,0.30`.
  Hot colours stay gold, never cream.
- Everything alive: heat pulses along the edge both ways, flicker, rolling back through the
  zone, drifting beads, tongues licking up the front.
- Noise baked once at start: a 1024^2 RGBA16F tileable fbm/ridged/gradient texture on a
  16-cell period, and a 2048^2 R16F hash table. The composite samples them; the slope of
  the front is taken by finite differences 4 px apart, never with derivatives of the bake.
- The live scene is scissored to the revealed side (`front + 0.215 + 0.16`) and drawn at
  0.75 scale during the burn; after 150 ms of rest it cross-fades to full size over 0.3 s.
  The incoming words are composited at full size in the burn pass.
- Bloom from a bright pass at threshold 1.15, half-res and quarter-res blurs; final pass
  vignette, ACES, sRGB, 0.003 grain. Scenes are clamped under 1.1 so a rest frame carries no bloom.
- Words are drawn once per chapter in a 2D canvas (Instrument Serif, Inter, Shippori Mincho),
  uploaded as textures, and rebuilt on resize.
- `dt` clamped to 1/30 s, DPR capped at 2, sized from a `ResizeObserver`, paused when the
  page is hidden or off-screen with the time base reset on resume.
- `prefers-reduced-motion: reduce`: scenes render as a fixed still and a chapter change is a
  0.35 s cross-fade; controls stay live.
- Buttons are real and keyboard-reachable with a visible focus ring; a live region names the
  chapter that arrives. Clean console at 390 and 1440 px, no horizontal scroll.

### Restrictions

- No images, video or third-party JS. Google Fonts only.
- No blur-based flames, no additive white, no sheen or streak passes over the scenes.
- The composition must be complete without the pointer.

## Remix prompt

Use $paper-cinder-transition on a different world: a contemporary art-gallery site with
four rooms (white cube, concrete, blue glass, night), with the ember ramp shifted toward
magenta and cyan and a cool ash char, sweeping vertically from the bottom in place of the
side. Keep the mechanism and the budgets: a frozen old frame and live new scene, the
pixel-true noisy front, alpha-masked porous char, a smooth luminous zone with a beading
thread that stays lit at the hot spots, baked noise with finite-difference slopes, the
scissored 0.75-scale live scene with its rest cross-fade, the queued presses, the
reduced-motion cross-fade, `dt` and DPR limits.
