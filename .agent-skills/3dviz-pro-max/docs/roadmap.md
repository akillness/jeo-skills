# Roadmap

The foundation begins with three pilot subjects: fantasy village, linear transformation, and cube face turns. They exercise artistic composition, factual geometry, and discrete state changes. Pilot records are not equivalent to evaluated scenes.

| Milestone | Completion evidence needed |
| --- | --- |
| Three-recipe foundation | Canonical skill/data, clear contracts, useful local checks, English documentation |
| Pilot scene evaluation | One retired pilot preserved with committed software-rendered captures and an [observation report](../evidence/artifacts/legacy-early-slice/validation-report.md), plus a controlled [before/after generation run](../evals/skill-behavior/before-after-2026-09/README.md) over five artifacts — baseline, with-skill, with-skill after the scaffold fix, with-skill after the kit steps, and with-skill after the quality tiers (2026-09, one 30-item scale, n=1 per condition, self-graded, software-rendered) |
| Installation verification | Actual discovery, invocation, update and removal on named host versions; so far one observed Claude Code 2.1.265 `--plugin-dir` load (2026-09-09), no marketplace or Codex app install |
| Full direction coverage | Original 144-recipe milestone reached across 24 directions; current 223 recipes provide at least six per direction, with deeper topic coverage remaining |
| Broader catalog | Authored budgets complete: 144 recipes, 96 conditional reasoning rules and 72 domain-validation records |
| Public release | License selected, asset rights reviewed, reproducible packages, release rehearsal and verified install instructions |

The milestone table distinguishes authored coverage from remaining targets. No completion date or compatibility promise is implied.

## Creative workflow refinement

The current entrypoint puts object identity and representation before kit selection. Direct reuse, adapted kits, custom geometry and sourced assets are valid routes; T0–T4 remains a description of shipped kit pipelines rather than a universal art or factual-quality scale. Visual review is conditional on the subject. Existing evaluation scores describe the earlier rubric; evaluation of this revised guidance remains separate work.

Subject-clarity and meaningful-motion guidance now covers synchronized annotations, local deformation and clearance, readable control effects, and scientific model/unit/readout consistency. It consolidates author feedback into conditional workflow guidance; it does not increase dataset counts or establish new runtime proof.

Lighting guidance now covers visible key direction, uniform inverse-square scene rescaling, shadow
fit at tiny world scales, practical emitter/receiver ownership and reversible day/night state. This
is skill workflow guidance only; catalog counts and runtime-proof status are unchanged.

## Foundation implementation status

Two hundred twenty-three recipes cover all 24 registered directions, with at least six per direction. The canonical catalog contains 440 reusable knowledge records across 18 populated families, including 18 theme profiles and 22 kit blueprints, plus 451 source records and 3,599 public evidence events. This includes 99 conditional reasoning rules, 75 domain-validation records, 12 geometry profiles, 22 lighting profiles, 28 tool adapters and 12 output profiles. The retained 144-recipe, 96-reasoning-rule and 72-domain-validation authoring budgets remain completed historical targets; source and editorial checks do not establish rendered or runtime validity.

The skill entrypoint, optional search/resolve/design-context helpers, evidence validation and local ZIP packaging are implemented. Shared-script governance and its current command inventory are documented in [shared tooling](shared-tooling.md); broader experiment/export inspection commands require demonstrated reuse before implementation. Generated indexes lead progressively to 24 direction pages and 17 knowledge-family pages. Search includes applicability conditions so conditional rules can be retrieved for their intended context.

The four original depth batches are promoted after source and editorial review. Further subject depth, broader paraphrase retrieval evaluation and runtime evaluation are separate follow-on work, not unfinished rows in the completed authoring budgets. Latent Village received a bounded catalog-guided refinement: supported locomotion, connected mill/door mechanics and an isolated cargo contact experiment. Its sequential checks and software-rendered browser observations remain in the historical [demo validation report](../evidence/artifacts/legacy-early-slice/validation-report.md). The documented showcase captures landed on 2026-09-09. Existing desktop observations remain separately scoped to their artifact revisions; see [coverage accounting](dataset-coverage.md).

The object/material/physical/tool expansion adds eight reviewed records per family (32 total). Three water revisions are also promoted with portable historical snapshots. Later reviewed batches add handbook inspection, object/science construction, mixed-domain recipes and bounded experience/math/physics records. The first two Blender/Three.js waves add 29 records: 17 evaluated-asset, rendering and physics handoffs, followed by 12 functional-object, decal/height, decoder/texture-transform and lighting contracts. A third wave adds 21 presentation/composition, motion, interaction and geometry profiles, and a fourth adds 14 inspection, validation, delivery and breakable-joint profiles, bringing the four-wave total to 64 records, 88 net-new sources and 605 events; see [Blender and Three.js: design the handoff](../skills/3dviz-pro-max/references/blender-threejs-handoff.md). No Blender export, decoder, solver, browser or renderer was run for these data batches. At that checkpoint all 229 authored lexical retrieval cases, all unit tests, schema/evidence, generated-index and package checks passed; 209 protected baseline files and the original 414-source prefix remained exact. This does not establish runtime or subject validity. The approved depth collection is complete. Broader model coverage can be proposed through the [handbook coverage audit](handbook-coverage.md); concrete adapter and artifact validation remain separate work.

Object Lab reached a bounded 37-body playground revision with pendulum impact, stacked blocks, dominoes, pointer grabbing and tunable contact/playback controls; its build and sequential Node tests passed at that revision. That scene was retired on 2026-09-08 together with the matrix and cube scenes, so the paragraph is historical and its artifacts no longer exist; the [scoped upgrade report](../evidence/artifacts/legacy-early-slice/validation-report.md#object-lab-playground-upgrade--2026-09-08) keeps the observations as history. These were local artifact observations, separate from catalog validation.

GitHub Actions files are authored and their local checks pass. Hosted workflow runs, app installation, marketplace discovery and the wider artifact evaluation remain unverified or incomplete.

## Accuracy + creativity pass (2026-09)

An eight-phase pass closed the distance between what the catalog described and what an agent could actually execute. Status:

| Phase | Status and outcome |
| --- | --- |
| 1 · Repository back to green | Done — references left dangling by the retired scenes removed; `validate.py`, `check-retrieval.py`, `check-docs.py` and the unit suite pass again |
| 2 · `defaults` contract | Done — an `authored` / `source-backed` `defaults` block on recipe and knowledge records, plus `scripts/evidence-log.py` for revision evidence |
| 3 · Look and mood numbers | Done — numeric defaults on 33 style profiles, five named looks, eight mood lighting profiles, and the visual anti-slop checklist |
| 4 · Execution layer | Done — the 10-step entrypoint, `templates/` scaffold, rigs, artifact document templates, inspection checklists and `scripts/capture.py` |
| 5 · Subject accuracy | Done — 21 recipes with worked numeric defaults, three state tables, a default tolerance rule and four factual tooling records |
| 6 · Retrieval | Done — both collections searched by default, validated alias expansion, 241 authored known-intent cases |
| 7A · Example upgrade | Done — historical pilot with sky, fog, environment, bloom, shared materials, instanced scatter, canvas picking and committed [captures](../evidence/artifacts/legacy-early-slice/README.md) |
| 7B · Before/after evaluation | Done — [before-after-2026-09](../evals/skill-behavior/before-after-2026-09/README.md): one prompt, same model and host, **five** artifacts published with capture sets and per-item scorecards, all scored on one 30-item scale. Baseline 21, round 1 19 (scene never animated), round 2 23 (after the scaffold fix that failure produced), round 3 23 (after the kit steps), round 4 **25** (after the quality tiers; totals re-read on 2026-09-09 after item 9 gained a lightness floor, which every run now passes) — the only run to pass the surface item, with a Blender-baked T3 hero and the viewport fit recovered. It also costs 7,242 draw calls at 2.3 fps, the most of the five, and ships three of seven named views damaged by camera placement. n=1 per condition, self-graded, SwiftShader; item 17 and the T3 tier were authored in the same week by the same author |
| 8A · Blueprint contract | Done — the `blueprint` knowledge kind with `asset`, `params`, `sockets`, `detail_ladder`, `footprint_m`, `poly_budget`, `fits_looks` and `proof`; `scripts/kit-proof.py` and its offline harness; `evidence-log.py check-run`; one proved blueprint |
| 8B · Village kit library | Done — 22 proved blueprints (6 buildings, 8 props, 4 plants and rocks, 2 walkers, 2 Blender GLB heroes) with 95 captures, `kit-core.js` / `kit-walk.js`, nine primitives, `layout/village-layout.js`, and the `scatterInstances` colour-squaring fix |
| 8C · Layout, retrieval and workflow | Done — `design-context.py --blueprints --look`, SKILL.md steps 5 and 6, anti-slop item 16 (the detail ladder) and the per-frame close-up procedure, `knowledge.hero-detail-ladder-defaults`, 8 blueprint retrieval cases and the "Add a blueprint" contributor section |
| 8D · Re-evaluation | Done — the early-slice example rebuilt on the kit modules (152 example tests), and eval run 3 generated and scored with all four runs re-scored on the 16 + 13 scale |

The pass produced authored guidance and one upgraded local artifact. It did not produce hardware-rendered frames, host certification or an independently graded quality result.

## Quality tiers (phase 9, 2026-09-08 / 09)

A follow-on pass gave the kits a stated quality ceiling instead of an implied one. Status:

| Phase | Status and outcome |
| --- | --- |
| 9A · Tier contract, textures and occlusion | Done — a `tiers` block (T0 blockout, T1 flat, T2 procedural surface, T3 baked, T4 authored) on the blueprint contract, `kit-surface.js` canvas textures and vertex-baked occlusion through `buildKit(create, { tier, surface })`, `knowledge.surface-tier-defaults`, and `kit-proof.py --tier` writing per-tier captures and their own check id. Measured, not assumed: texture build 248 ms at 1024 px, vertex AO 107 ms at 13 samples, AO a fine 2.5–3.4 luma contact effect |
| 9B · Host probe, quality brief and LOD | Done — `scripts/host-probe.py` reports OS/CPU/GPU/Blender/runtime and computes a `quality_ceiling`; `design-context.py --host --delivery --hero` adds a per-blueprint `quality_brief` (role, tier, reason); `lodFor()` swaps tiers by distance; `capture.py` gained `--gpu` and `--format/--quality` and records `webgl_renderer` and `capture_mode` |
| 9C · Blender T3 heroes | Done — `scripts/hero-tier.py` bakes a T3 hero GLB from a kit module's own geometry through a located Blender (`blender_locate.py`), time-boxed and cached; a missing Blender is reported, never faked. Two heroes ship (`timber-cottage-t3.glb`, `watermill-t3.glb`), both under the 2 MB cap |
| 9D · Tier proofs, mixed-tier example, eval run 4 | In progress — all 22 records declare tiers; T2 proved on 18 with the four exceptions stating a measured reason; both T3 heroes proved after a 16 px bake-margin rebake; the example village runs heroes at T3, mid ground at T2 and instanced background at T1 (overview draw calls 2,902 → 2,330, first frame 0.45 s → 2.37 s of which 1.70 s is the AO bake). Anti-slop item 17 (surface on the hero) makes the checklists a 17 + 13 = 30 item scale and all four earlier runs were re-scored on it. Eval run 4 is generated, captured in SwiftShader (with a labelled, unscored GPU set beside it) and scored: **24 / 30**, the only item-17 pass, and the most expensive scene of the five |
| 9E · Showcase renders | Done (2026-09-09) — 21 GPU-captured frames in [docs/demos/showcase](demos/README.md#skill-showcase-2026-09) with a log naming host, capture mode, tiers and hashes; village at mixed tiers, harness frames at their proved tier, two breadth recipes. Limits stated in the gallery: four village looks via the example's look switch, harness frames are stills, T2 is stylized-game quality |

**The ceiling is stated, not implied.** T2 is stylized-game quality drawn in the browser; T3 is what Blender can bake from the same geometry, and only two heroes have it; T4 — hand-built topology and edge flow for film or photoreal work — ships nowhere and is a schema slot every record declares missing. A tier a record does not prove is a tier it does not claim, and the AO bake cost, the draw-call floor and the single-bake limit are published rather than tuned away. Nothing in this pass was graded by an independent grader or rendered on certified hardware.

Follow-ups this pass deliberately left open:

- Source hygiene: three duplicate URL pairs, and `version` strings that should become content hashes.
- Knowledge gaps named while working: `BatchedMesh`, cascaded shadow maps and XR-controller records.
- A uniform-grid broadphase for the example's creature sweeps.
- A second independent grader for the before/after evaluation; the first run is self-graded with n=1.
- A repeat of the before/after run against the scaffold fixed on 2026-09-08 (zero-dt render loop and the camera rig's missing `invalidate`, now covered by `capture.py --motion-check` and a liveness item in both checklists); the published run's numbers stand as recorded.

## Design commitments

- One standalone skill and one canonical dataset.
- Creative freedom across styles, representations, and interactions.
- Factual claims checked against sources and actual rendered output.
- New knowledge added primarily as data, without topic-specific code branches.
- Public evidence that distinguishes proposals, source verification, and observed behavior.
- Small edits handled directly; substantial scenes get coherent design and validation artifacts.

## Release blockers

The maintainer must choose a license and review third-party media rights before release. Plugin and host compatibility need actual tests. The existing historical village media must not be presented as an English runtime demo of the new skill; the documented showcase that need was waiting on landed on 2026-09-09 ([gallery](demos/README.md#skill-showcase-2026-09), twenty runtime captures with host and tier per frame), so what remains here is the license and media-rights review.

See the [changelog](../CHANGELOG.md) for recorded changes and [contributing](../CONTRIBUTING.md) for focused ways to help.

## Character study follow-up

The rejected Yuna character experiment was removed from the local app at the user’s request on 2026-09-08. One interactive scene remains after the matrix, cube and Object Lab scenes were retired the same day. The skill showcase was produced on 2026-09-09; broader demo redesign remains deferred.

The fifth craft wave adds ten style/theme/reasoning profiles, bringing this depth program to 74 records, 89 net-new sources and 655 evidence events. Five overlapping reasoning candidates reuse existing contracts rather than duplicate them. The approved subject collection is now complete as authored and independently reviewed content.

The reviewed mathematics, logic and puzzle subject batch adds twelve recipes, fourteen sources and 92 events. Finite numerical/discrete models retain exact input/state boundaries and explicit Blender-to-Three.js construction; inverse history is distinct from imported-state solving. These are source-reviewed authoring contracts, not executed solvers. The subsequent scientific and applied collections are also complete, as recorded below.

Nineteen further scientific recipes cover supplied biomedical records, mechanical/XPBD/contact models, chemistry trajectories/orbitals and environmental/observer/scenario models. They add 23 net-new sources and 146 public evidence events. Each separates source facts, authored numerical assumptions, object construction and runtime ownership; no clinical, calibration, forecast or device validation is implied. Cities/operations, AI/quantum, art/story and concrete XR subjects are now promoted after independent review.

The completed Blender/Three.js depth program adds **74 knowledge records and 49 subject recipes (123 total)**, with 146 net-new sources and 1,016 public evidence events. The final applied collection contributes cities/operations 5, AI/quantum 5, art/story 5 and XR 3. Overlapping candidates reuse existing records; this is coverage of the approved collection, not exhaustive coverage of every 3D subject. A clinical intervention recipe still requires a named procedure/version, primary guidance and qualified review before collection. Actual artifact, specialist-data and device validation remain separate from documentary acceptance.
