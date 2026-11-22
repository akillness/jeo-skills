// The loop section's copy, verbatim from the Daylight design. It is authored page copy — the ten
// steps themselves live in the skill's SKILL.md — so it sits here as data and loop-section.tsx
// only lays it out.

export const LOOP_HEADING = 'How one sentence becomes a scene';

export const LOOP_LEDE =
  'Ten steps, but the agent only walks the ones a task needs. It probes your machine, picks a ' +
  'construction route per object, then keeps looking at real frames until the scene holds up.';

export const PROMPT = '“build a small fantasy village I can explore”';

export const DECIDE_KICKER = 'STEPS 01–03 · DECIDE WHAT IT IS';

export const DECIDE_TILES = [
  {
    title: 'Intent',
    text: 'What the viewer should see, feel or do. Art direction, viewing distance, time of day.',
  },
  {
    title: 'Objects',
    text: 'Silhouette, proportions, parts and joins — before any template is opened.',
  },
  {
    title: 'Representation',
    text: 'Illustration, discrete state, simulation or playback. Factual claims get sourced.',
  },
] as const;

export const ROUTE_KICKER = 'STEP 04 · ROUTE EACH OBJECT';
export const ROUTE_LEDE =
  'One scene can use all five at once — the route is chosen per object, not per project.';

/** Chip tone names map to the token pairs in theme.css. */
export const ROUTE_CHIPS = [
  { label: 'Reuse a kit', tone: 'mint' },
  { label: 'Adapt a kit', tone: 'mint' },
  { label: 'Author custom', tone: 'leaf' },
  { label: 'External asset', tone: 'sky' },
  { label: 'Combine', tone: 'sand' },
] as const;

export const PROBE_KICKER = 'STEP 05 · host-probe.py LOOKS AT YOUR MACHINE';
export const PROBE_NODE = 'host-probe.py';

/** The probe diagram: two lanes, each branching on what the machine has into what that forces.
 *  `mark` names the tool logo drawn beside the condition (`none` for the CPU fallback). */
export const PROBE_LANES = [
  {
    lane: 'renderer',
    branches: [
      { mark: 'blender', condition: 'Blender ≥ 4.2', outcome: 'T3 baked hero' },
      { mark: 'three', condition: 'no Blender', outcome: 'T2 procedural surface' },
    ],
  },
  {
    lane: 'capture',
    branches: [
      { mark: 'chromium', condition: 'Chromium + GPU', outcome: 'real capture' },
      { mark: 'none', condition: 'no GPU path', outcome: 'SwiftShader, stated' },
    ],
  },
] as const;

export const LOOP_BADGE = 'LOOP ↺ UNTIL IT HOLDS UP';

export const LOOP_CARDS = [
  {
    kicker: 'STEPS 06–07 · BUILD',
    text:
      'Rigs, scaffold and materials from the templates, custom geometry where the subject needs ' +
      'it. Transforms, joints and controls stay tied to the real state.',
  },
  {
    kicker: 'STEP 08 · LOOK AT IT',
    command: 'capture.py --all-views --out captures',
    text: 'Real frames from the built scene. Never describe a frame nobody looked at.',
  },
  {
    kicker: 'STEP 09 · REFINE',
    text:
      'Fix the most consequential weakness first. A failed shape needs a different method, not ' +
      'more texture.',
  },
] as const;

export const REPORT_KICKER = 'STEP 10 · REPORT HONESTLY';
export const REPORT_LEDE = 'Four separate columns, never merged into one claim.';

export const REPORT_CHIPS = [
  { label: 'Built', tone: 'mint' },
  { label: 'Observed', tone: 'mint' },
  { label: 'Numerically checked', tone: 'leaf' },
  { label: 'Still limited', tone: 'rose' },
] as const;
