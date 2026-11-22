# Skill behavior forward check

Method: non-rendering agent responses after reading the canonical SKILL.md, research-and-truth/design-synthesis references and relevant heart, felt/wool, papercraft, outpost and articulation records. No expected-outcome fixture read. No new source reading, code generation, browser interaction or runtime checks performed. These are actual authored responses, not claims that an artifact was built or a scientific model verified.

## Prompt 1

“Plan a beating-heart cutaway for students; flow must be scientifically correct; no rendering yet.”

### Response

Plan: a student-focused cutaway with a stable anatomical orientation, labeled structures and a phase control that connects contraction, valve state and flow explanation.

1. Ground the model first: read physiology references covering the cardiac cycle, valve timing and circulation. Map each claim to its source passage and the structure or motion that will communicate it. The current heart recipe covers structural inspection; it does not supply a verified contraction or flow model.
2. Use sourced or expert-reviewed geometry. Keep the cut surface visibly distinct from real tissue, and anchor anatomical left/right to the organ. Let students isolate a structure while retaining an uncut reference silhouette.
3. Give one physiological state model authority over contraction, valve state and the flow display. Define whether the lesson requires correct qualitative sequence or numerical pressure/velocity fields. Numerical values require an appropriate model or validated playback dataset, with units, assumptions and limits; decorative particles cannot establish flow accuracy.
4. Plan pause, phase stepping, labeled flow paths and reset. Before rendering, check model connectivity and phase/state consistency against the references. Later, inspect complete rendered cycles to verify that geometry, motion and labels communicate the same model.

Scientific flow correctness remains an acceptance requirement. No sources were newly verified, physiological model committed or scene rendered in this planning response.

## Prompt 2

“Give concise design direction for felt-wool spaceport with papercraft mountains and mechanical birds, no demo.”

### Response

**Celestial Workshop:** a cozy spaceport sewn into a folded-paper mountain pass. Give the terminal a padded felt silhouette, layered window patches and a few visible stitched seams. Build the mountains from broad folded panels with crisp ridges and exposed card edges. A curved landing apron links the terminal to a small repair hangar, so the scene has a clear arrival story.

Mechanical birds combine wool-covered bodies with exposed brass-colored shoulder pivots and layered felt wing panels. Their intended motion is purposeful: perch, look toward an arriving craft, unfold the wings, then return to rest. Keep joints connected through the movement and reserve fibers for close silhouettes so they do not obscure the mechanism.

Use deep teal felt, warm cream paper and restrained amber lights. A broad side light reveals textile softness against paper creases. Start with a three-quarter overview, with a closer inspection angle on one bird and the terminal entrance. This is design direction only; no demo has been created.

## Prompt 3

“Only change scene title to Celestial Workshop.”

### Response

I’ll change the scene title to **Celestial Workshop**. Please provide the scene file or its path so I can make that edit.

## Observation limits

Prompt 1 produced a bounded scientific planning response rather than asserting validated flow; research and runtime verification remain unperformed and visible. Prompt 2 synthesized the requested mixed materials and fictional setting without a fixed catalog template. Prompt 3 requested the missing artifact location and made no fabricated edit claim. These observations are an agent-level response check, not a host certification or runtime evaluation.

## Before/after generation run (2026-09)

The responses above are agent-level text checks. A separate, runtime check now exists: five fresh
agents of the same model were given the canonical README prompt on the same host, one without the
skill and four with it at four successive states, and each built and self-inspected a runnable
village. Every project, every capture set and a per-item scorecard against `visual-anti-slop.md` and `inspection-per-frame.md`
are published in [before-after-2026-09](before-after-2026-09/README.md).

Summary of what was observed, not a claim of improvement. Round 1: the with-skill artifact scored 18
of 28 checklist items pass to the baseline's 20, and was the only one to ship a design system, a
scene spec, a validation report, a viewer contract and instanced geometry — while also shipping a
scene in which nothing moved, because its demand-driven render loop parked itself after the first
frame. The baseline produced a plainer-documented but working village with animated creatures,
canvas picking and a headless smoke test.

That failure was traced to the skill's own scaffold and fixed, and both checklists gained a liveness
item. A second with-skill run generated after the fix is alive, respects `prefers-reduced-motion` and
fits 1280×720. A third, generated after the kit steps were added and after `visual-anti-slop.md`
gained item 16 (detail ladder on the hero), is the first to pass that item. A fourth, generated after
the quality tiers (T0–T4, the host probe, the quality brief, LOD and two Blender-baked T3 heroes) and
after item 17 (surface on the hero), scores highest of the five and is the only run to pass item 17 —
its hero is a Blender bake rather than a browser-built approximation.

All five scorecards are on one **30-item** scale (17 + 13), after `visual-anti-slop.md` gained item 17
(surface on the hero) with the kit quality tiers on 2026-09-09; the earlier /26, /28 and /29 totals
are superseded. Totals: baseline 20, run 1 18, run 2 22, run 3 23, run 4 24. Item 17 fails in the
first four — none ships a texture map or baked occlusion — and passes only in run 4. That item and
the T3 tier were authored in the same week by the same author, so it is the least independent result
in the set.

Three findings worth separating from the totals, before the two below: run 4 costs **7,242 draw calls
per drawn frame at 2.3 fps** under SwiftShader — the most expensive scene of the five, and its own
report writes "not measured" for cost while asserting 60 fps; **three of its seven named views are
unusable** (a camera inside a building, a lantern post on the sight line, a wall filling 37.5 % of a
third frame), only two of which it admits; and it is the first run whose documentation states a tier
and a blueprint per object class and the host it was built on.

Two more findings worth separating from the totals. **Selection focus framing** — poor in runs 1 and 2
(the camera lands on a roof plane), good in the baseline, and fixed in run 3, which frames the whole
mill. It was the skill's clearest unfixed defect after round 2. **Detail ladder** — run 3 is the only
run of the four to pass item 16 (silhouette 3 / medium 5 / fine 3, counted from its frames rather
than read from its report); the other three build heroes with an empty or near-empty fine band, so
they only read at 8 m. Against that, run 3 costs 4,773 draw calls per frame at 5 fps — seven times
run 2 — and regresses the viewport fit that run 2 had solved, and its own report overclaims hero
contrast that measurement contradicts. No with-skill run has yet written a test; the baseline did.

The liveness change is attributable to the scaffold fix by code inspection; nothing else is —
n=1 per condition, and the scale itself changed three times, each time after a run failed the new
item or alongside the feature that passes it. Self-graded, software-rendered; the eval README states
these limits and names where the baseline was better. Cost has risen in every with-skill round that
added a feature (687 → 4,773 → 7,242 draw calls), and no with-skill run has yet written a test.
