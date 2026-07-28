---
name: open-design-game-ui-takeover
description: Take over an approved Open Design artifact (game UI, VFX, skill, RIG, enemy/boss) into Darkbone Archer without degrading the runtime. Use whenever Codex must analyze, port, integrate, or review an Open Design standalone; apply a responsive Home, Map Select, Talent, Mask, Fusion, Victory, or settlement design; port an Open Design VFX/RIG lab into Phaser; preserve existing animations omitted by a mockup; or prove current-runtime vs standalone vs integrated-runtime fidelity before merge.
---

# Open Design Game UI Takeover

Port only what was approved. A standalone is authoritative by component and axis, not by omission.

**Craft-fidelity gate**: the integrated runtime result must pass the 7-point game-feel checklist in
`open-design-game-ui-concept/references/darkbone-visual-language.md` at every viewport — porting an approved
gorgeous standalone into a flattened web-feel implementation (lost engraving/materials/breathing motion) is a
fidelity regression even when the layout matches; compare rendered-vs-rendered against the standalone AND
against the checklist. Fidelity scoring runs on `codex exec -m gpt-5.6-sol -c model_reasoning_effort=high`;
for motion-bearing components compare driven videos/keyframes, never stills alone.

## Takeover standard = `claude-design-standalone-takeover` (owner benchmark)

For **VFX / skill / RIG / enemy / boss / summon artifacts**, the takeover flow IS the battle-tested
`claude-design-standalone-takeover` skill — follow it in full: completeness audit FIRST with
refuse-to-port on missing key contracts (palette, integration map, source entrypoints, density/fanout,
budget mapping, texture-memory ownership, behavior contract), surface classification, deep source reading
(painters/timelines/anchors/pivots/tuning — never port from screenshots), the required
`takeover-analysis.md` sections, the loading/bundle + localization + level-up card copy hard rules, R2
raw-source archive (the learn loop) with Phase-2 Studio onboarding and the ±5% Phaser fidelity gate before
gameplay wiring, mobile `#game` video verification for live content, real playtest/perf scenarios, and the
full default decision-rules table. Do not re-derive a thinner flow here.

Open Design-specific substitutions when applying that standard:

- **Artifact intake**: instead of a returned zip, bind the OD project's immutable revision — record
  `artifactBinding` (projectId, revisionId, artifact SHA-256, preview-manifest SHA-256, generation-evidence
  SHA-256 for `gpt-5.6-sol / ultra`). Copy the artifact bytes into `.handoff/<ts>-<feature>/incoming/`
  unchanged and archive to R2 as raw/source exactly like a Claude Design return.
- **Return-to-designer**: a supplemental handoff becomes a **side-chat fix run in the same OD project**
  (`od chat new --seed-from` + run; see open-design-control.md) with the missing-contract list as the brief;
  re-bind fresh generation evidence after every fix run.
- **Fidelity/review scoring**: `codex exec -m gpt-5.6-sol -c model_reasoning_effort=high`; motion-bearing
  comparisons use driven videos with per-candidate parity, never stills alone.
- Interactive labs expose `window.DARKBONE_VFX_LAB` — drive it for beat/density/floor evidence instead of
  hand-clicking preview controls.

UI surfaces keep the preservation/authority/evidence machinery below on top of that standard.

Read `docs/hard-rules/ui-adaptation-upgrade-only-contract.md`, the handoff's
`preservation-contract.json`, and [authority-and-proof.md](references/authority-and-proof.md) before editing
runtime source.

## Workflow

1. Validate the preservation contract with `open-design-game-ui-handoff`.
2. Render the standalone independently. Archive the exact artifact plus its successful preview manifest. Record
   `artifactBinding` with project, immutable revision, artifact SHA-256, preview-manifest SHA-256,
   preservation-contract SHA-256, and the validated `gpt-5.6-sol / ultra` generation-evidence SHA-256. Reject a
   filtered/mutable preview or generation evidence from another model, reasoning tier, run, revision, or artifact.
   Inventory source, states, controls, motion, responsive branches, and placeholders.
   If the immutable preview service later becomes unavailable or its successful full manifest did not capture
   every comparison-plan Cartesian row, run `capture_open_design_preview.mjs --scenario-set=contract-cartesian`
   with `--archive-artifact` and `--source-preview-manifest`. This creates a separately hashed archival replay
   manifest from the exact artifact bytes. The capture subtracts every semantic tuple already present in the
   immutable preview, keyed by `(surface, locale, viewport, state)`, and records only missing rows. It supplements
   the original revision proof; it never replaces or rewrites the original preview manifest or generation evidence.
3. Write `takeover-analysis.md`. For every component, copy `changeScope` plus the six-axis authority matrix and
   identify the exact standalone implementation to port. Copy `standaloneMotionPolicy`,
   `runtimeMotionImplementation`, and `runtimeOwnerAnchors` without drift. Treat every axis outside
   `changeScope` as frozen.
   When one approved artifact covers several surfaces but this PR stages only some of them, declare strict
   `takeoverScope` in `takeover-evidence.json`. It must list the in-scope surface ids and the exact remaining
   contract complement with policy `frozen-runtime-no-change`. The artifact, full preview manifest, generation
   evidence, and complete preservation contract remain bound; scope only limits which surface matrices this
   takeover is authorized to emit. Omitting `takeoverScope` keeps full-contract validation.
4. Classify every standalone omission as `unspecified-preserve-runtime`. Never infer deletion.
5. Build the runtime diff one component at a time:
   - port Open Design-owned layout or visual axes;
   - move runtime-owned identity, animation, interaction, copy, and data paths intact;
   - retain reduced-motion branches, timers, event cleanup, state transitions, and input semantics;
   - use existing tokens and real game data.
6. Capture the integrated runtime at every component, viewport, locale, state, and animation beat declared by
   each surface's `comparisonPlan`. Preserved components remain in the matrix; this is not one representative row.
7. Write `takeover-evidence.json` with current-vs-standalone-vs-integrated stills, three-way videos, three-way
   keyframes, per-dimension verdicts, and any explicitly accepted differences. Every component on a
   motion-critical surface needs its own motion matrix row, including components whose treatment is `preserve`.
   Add one `runtimeContinuity` row
   for every changed component, listing the exact frozen axes, whether their implementation was `unchanged` or
   `moved-intact`, and the retained runtime owner anchors. Every standalone still must name the scenario from
   the bound preview manifest. The validator rejects same-path or same-hash current/standalone/integrated proof,
   plus evidence reused across a different viewport, locale, state, motion state, or animation beat. WebP,
   WebM, and MP4 evidence must have valid media signatures; a renamed text fixture is invalid.
8. Validate the evidence before owner review:

   ```bash
   node .agents/skills/open-design-game-ui-takeover/scripts/validate_takeover_evidence.mjs \
     --evidence=.handoff/<timestamp>-<feature>/takeover-evidence.json --phase=review
   ```

9. Generate the Chinese screenshot/video review HTML. Owner approval is required before merge. The review-phase
   validator returns `reviewEvidenceSha256`; copy it into the JSON approval receipt. Approval phase binds that
   digest to the exact artifact, revision, preview manifest, preservation contract, comparison files, verdicts,
   videos, keyframes, and `takeoverScope`. A free-standing `approved` string or unrelated/stale feedback file is
   invalid.
10. Run repository UI, localization, geometry, input, build, and independent PR review gates.

## Static Placeholder Rule

When Open Design shows a static character portrait, icon, level emblem, mask, talent node, Fusion result, or
Victory result where runtime already animates, treat the standalone element as a layout/material reference only.
Keep the live runtime implementation unless the authority matrix explicitly assigns `motion` to Open Design and
the replacement passes same-beat video comparison.

This is a scope rule, not a fidelity guess. A layout-only commission may move or resize a dynamic component, but
it cannot authorize a new painter, timeline, timing curve, lifecycle, input behavior, or reduced-motion branch.

For a layout-only Home task, preserve the animated character rig/rotation, ritual floor, floating mask sigils,
level emblem, talent emblem, character-switch entrance, and circular animated `battleSigilSVG()` / `.sortie`
deploy medallion. A rectangular standalone CTA is a placement proxy, not permission to replace that medallion.
For Talent, preserve the Wedjat eyes, colored pupils, legacy trunk, flowing links, breathing states, and
investment reveal. For Fusion and Victory, preserve or improve the complete reveal choreography, not only the
settled frame.

## Blocking Conditions

- any authority cell is absent or differs from the approved preservation contract;
- takeover `changeScope` differs from the approved preservation contract;
- runtime continuity proof is missing, broadens scope, or fails to retain the approved runtime owner anchors;
- runtime-owned source paths were deleted or reimplemented without necessity;
- a current animation became static, shorter in meaning, visually weaker, or absent;
- the integrated UI is better at one viewport but loses a quality dimension at another;
- current and integrated evidence is not aligned by viewport/state/beat;
- artifact, preview manifest, preservation contract, `gpt-5.6-sol / ultra` generation evidence, or owner
  approval is not hash/revision-bound;
- an archival replay is used without exact artifact bytes, the original successful immutable preview manifest,
  or an approval receipt that binds both manifest hashes;
- the full component x viewport x locale x state matrix is incomplete, including preserved components;
- a staged takeover omits any out-of-scope contract surface, uses a policy other than
  `frozen-runtime-no-change`, or emits authority/continuity/rendered evidence outside `takeoverScope`;
- current/standalone/integrated evidence reuses a path or content hash within a row or across different proof contexts;
- owner approval does not bind the validator-produced digest of the exact reviewed stills, videos, keyframes, and verdicts;
- any component on a motion-critical surface lacks current/standalone/integrated video and at least three
  current/standalone/integrated keyframes;
- any dimension verdict is `regressed`, any unexplained omission remains, or owner approval is missing.

The standalone is never allowed to erase quality that it did not attempt to specify.
