---
name: open-design-game-ui-concept
description: Prepare, generate, and review game UI concepts through the local nexu-io/Open Design app using real runtime screenshots and project assets. Use when Codex must design or redesign Darkbone Archer UI for phone, tablet, desktop, Steam, controller, or multiple locales; create an Open Design handoff/project; drive a local Codex design run; inspect an Open Design HTML artifact; or complete a design-first approval loop before runtime implementation.
---

# Open Design Game UI Concept

Use Open Design as a shared, inspectable design workspace. Keep design generation and runtime implementation as separate phases: no runtime UI edits are allowed until the rendered concept is reviewed and approved.

This skill orchestrates two stricter workflows:

- use `open-design-game-ui-handoff` before generation to capture current identity, motion, source anchors, and
  per-component authority in `preservation-contract.json`;
- use `open-design-game-ui-takeover` only after owner approval to integrate approved axes without degrading
  runtime-owned behavior.

Read `docs/hard-rules/ui-adaptation-upgrade-only-contract.md`. Open Design omission always means
`unspecified-preserve-runtime`; it never means remove or replace an existing animation with a static placeholder.

## Required Workflow

1. Read [darkbone-visual-language.md](references/darkbone-visual-language.md) and open
   [exemplar-craft.html](references/exemplar-craft.html) in a browser **before anything else** — they define
   the craft bar (real palette, material recipes, game-feel checklist). Then read the relevant feature docs,
   current overlay source, and design tokens. State the player-facing job of each screen. The generation
   target is a gorgeous game artifact that matches the exemplar's craft level; preservation contracts bound
   it, they do not define it.
2. Capture the live runtime before proposing a layout:

   ```bash
   node .agents/skills/open-design-game-ui-concept/scripts/capture_meta_ui_design_audit.mjs \
     --base-url=http://127.0.0.1:5173 \
     --out-dir=.omc/artifacts/open-design-meta-ui-audit/<run>
   ```

   Treat this as source-integrity evidence, not a best-effort gallery. The capture blocks on page/console
   errors, broken rendered images, locale drift, viewport overflow, a missing primary surface, or zero visible
   actions. It traverses nested Shadow DOM and the default run must extract all five expected character rigs.

3. Review representative captures at actual size. Evaluate first-glance comprehension, player fantasy, hierarchy, spatial use, component relationships, interaction distance, and detail polish. Read [meta-ui-design-contract.md](references/meta-ui-design-contract.md).
   For a new Steam title shell, use the separate `steam-title` profile and read
   [steam-title-design-contract.md](references/steam-title-design-contract.md). Do not change the six-screen
   defaults or reuse the six-screen artifact name.
4. Run `open-design-game-ui-handoff`. Build one complete handoff folder under
   `.handoff/<timestamp>-<feature>/`. Include `README.md`, `brief.md`, `DESIGN.md`,
   `preservation-contract.json`, `source-manifest.json`, the screenshot manifest, current-state WebP
   screenshots, motion WebM/MP4 plus timestamped WebP keyframes, selected real assets, relevant docs, and the
   source files that own the current UI.
5. Validate and zip it:

   ```bash
   node .agents/skills/open-design-game-ui-concept/scripts/package_open_design_handoff.mjs \
     --dir=.handoff/<timestamp>-<feature>
   ```

   The packager rejects absolute or traversal references. Every screenshot, source file, config, character
   asset, map/mask asset directory, and primary artifact declared by the manifests must resolve inside the
   handoff and must be present in the resulting zip.

6. Import the folder into Open Design and start a Codex run. Read [open-design-control.md](references/open-design-control.md) first. This workflow is locked to Codex `gpt-5.6-sol` with `ultra` reasoning. Do not accept another model, a lower reasoning tier, or a request-level override.
7. Start the generation-evidence capture as soon as the run ID is returned. It must observe the live child process and then bind the successful result package to the immutable artifact revision:

   ```bash
   node .agents/skills/open-design-game-ui-concept/scripts/capture_open_design_generation_evidence.mjs \
     --run=<run-id> \
     --artifact=<artifact.html> \
     --out=.omc/artifacts/open-design-generation-evidence/<run-id>.json
   ```

   The evidence is invalid unless the actual process command contains only `gpt-5.6-sol` model overrides and
   only `model_reasoning_effort=ultra` reasoning overrides. Long thinking is not a failure; do not cancel a
   healthy run merely because it takes several minutes. The listener waits up to two hours by default; use
   `--timeout-ms=<milliseconds>` only when a documented run needs a different bound.
8. Resolve the generated artifact through Open Design's preview URL, then capture it:

   ```bash
   node .agents/skills/open-design-game-ui-concept/scripts/capture_open_design_preview.mjs \
     --preview-url=<immutable-preview-url> \
     --contract-profile=<meta-ui|steam-title> \
     --contract=.handoff/<timestamp>-<feature>/preservation-contract.json \
     --generation-evidence=.omc/artifacts/open-design-generation-evidence/<run-id>.json \
     --out-dir=.omc/artifacts/open-design-preview/<run>
   ```

   The default `--scenario-set=full` is the acceptance gate; `--scenario-set=defaults` is smoke-only. The full
   matrix adds detail, locked, insufficient-resource, loading, confirmation, result, and completion states,
   plus keyboard, controller, hover, Escape/B, modal focus-trap, and reduced-motion probes to the 40 default
   locale/viewport/screen renders.

   Treat `manifest.ok !== true` as a failed design run. The capture gate independently checks the requested
   screen/locale/state/responsive mode against visible DOM sentinels and localized primary actions, then checks
   page/console errors, image loading, document overflow, ancestor clipping, label clipping, and actionable
   overlap on every viewport. Phone and iPad additionally require every visible actionable target to be at
   least `44x44` CSS px.

   Full mode rejects filtered locales/screens/viewports, a mutable URL, a state set that does not cover the
   preservation contract, or generation evidence that does not match the exact project, revision, file, and
   artifact SHA-256. Keep the immutable `projectId`, preview `revisionId`, artifact SHA-256, contract SHA-256,
   generation-evidence SHA-256, per-screenshot SHA-256, and preview manifest. Takeover approval must bind to
   these exact values; a mutable URL or filename alone is insufficient.

9. Generate the Chinese owner review HTML with `screenshot-review-artifact`. Open both the Open Design GUI project and the review HTML. Any independent/blind review scoring uses `codex exec -m gpt-5.6-sol -c model_reasoning_effort=high` (anonymized labels); motion-bearing artifacts are scored on driven video/live evidence with per-candidate parity, never stills alone (see open-design-control.md Review Loop).
10. Iterate inside the same Open Design project. Keep the project, conversation, run, artifact file, handoff zip, model, reasoning, and review paths in the final manifest.

## Handoff Rules

- **Every handoff folder must contain `darkbone-visual-language.md` and `exemplar-craft.html`** (copied from
  this skill's references), and `DESIGN.md` must LEAD with the creative direction (identity, craft bar,
  "match the exemplar") before any preservation language. A brief whose first page is constraints produces
  timid web-dashboard output — aspiration first, boundaries second.
- Use real rendered screenshots, not source-code guesses.
- Preserve or upgrade all seven quality dimensions: identity, composition, information, interaction, motion,
  material, and readability. A technical matrix cannot overrule a visible aesthetic regression.
- Assign authority per component for layout, identity, motion, interaction, copy, and data. Runtime is the
  default; data remains runtime-owned.
- If this task changes only layout, retain the current animation implementation and timing intact even when the
  standalone does not depict it.
- Motion-critical surfaces require baseline video and at least three timestamped keyframes in the handoff.
- Treat phone landscape, iPad landscape, 1440 desktop, and 1920x1080 Steam as different compositions, not scaled copies.
- Include `zh` and `en`; every render is single-locale.
- Include hover, keyboard focus, controller focus, touch, reduced motion, loading, empty, locked, insufficient-resource, and destructive confirmation behavior when applicable.
- Preserve Darkbone's pharaonic stone-gothic identity. Do not turn meta UI into a generic web dashboard.
- Make character art, map art, masks, or the progression object the primary visual signal for the screen that owns it.
- Require one self-contained HTML artifact with six switchable screens and the review API defined in the design contract.
- The `steam-title` profile is the only exception to the six-screen artifact shape: it returns the standalone
  `bone-halls-steam-title-concept.html`, preserves all six meta surfaces as contract-only frozen context, and
  captures the complete title state x locale x five-viewport matrix. The default profile remains six-screen.
- Do not ask Open Design to edit runtime source in the design phase.

## Quality Gate

Reject or rerun the concept when any of these are true:

- **the squint test fails**: any surface reads as a generic web/SaaS dashboard (flat rounded-rect cards,
  bootstrap hues, bare left-aligned headings, plain `#fff` text) instead of the engraved bone-gilt +
  soul-teal altar language defined in `darkbone-visual-language.md` §6-§7;
- the first glance does not reveal the screen's purpose or primary action;
- desktop leaves most of the viewport unused or merely enlarges phone spacing;
- important icons, characters, maps, nodes, or masks stay phone-sized on desktop;
- primary buttons become very long text bars instead of adopting a desktop-appropriate command treatment;
- controls collide, drift, or lose grouping across viewports or locales;
- the concept has no game-specific signature, no responsive state model, or no controller/focus model;
- a runtime signature becomes generic (for example Wedjat eyes become circles) or a live animation becomes a
  static placeholder;
- current-vs-concept evidence is not aligned by viewport, state, and animation beat;
- the artifact cannot be rendered and independently screenshot-tested.
- any capture assertion fails, including a touch target below `44x44`, viewport overflow, page error,
  unloaded image, mismatched independent DOM sentinel, failed input probe, clipped actionable label, or
  overlapping actionable controls.

The deliverable for this skill is an owner-reviewable design artifact and evidence packet. Runtime takeover is a later task.
