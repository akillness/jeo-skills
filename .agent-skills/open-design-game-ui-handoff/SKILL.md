---
name: open-design-game-ui-handoff
description: Build and validate Open Design handoffs from the real Darkbone Archer runtime — game UI (upgrade-only preservation contracts) AND VFX/skill/RIG design packages. Use whenever Codex must prepare, regenerate, or audit an Open Design handoff; feed an existing Claude Design handoff zip into Open Design; collect current screenshots, animation videos, keyframes, source anchors, assets, responsive states, or preservation boundaries; or prevent a standalone concept from deleting existing identity, motion, interaction, copy, or data that it does not show.
---

# Open Design Game UI Handoff

Package what the game already does before asking Open Design to change it. Treat runtime omission from a
standalone as unspecified, never as permission to simplify.

Read `docs/hard-rules/ui-adaptation-upgrade-only-contract.md` and
[preservation-contract.md](references/preservation-contract.md) before capturing evidence.

## Package content standard = `claude-design-handoff-generate` (owner benchmark)

The battle-tested `claude-design-handoff-generate` skill is the CONTENT standard for every Open Design
handoff — Open Design gets the same package a Claude Design session would get, plus an Open-Design delta.
Do not reinvent a thinner brief.

For **VFX / skill / weapon / enemy / boss / RIG packages**, build the package WITH
`claude-design-handoff-generate` first (or reuse an existing `.handoff/*.zip` produced by it): README with
the Owner Summary Matrix, brief with approved mechanics, **visual orthogonality table** (existing identities
the design must NOT read as, with reference screenshots of those neighbors), timing/beat sequence, 5+ real
mobile `#game` WebP proof states, `reference/` contracts (owner decisions, runtime excerpts, performance
budget + annotation template, review contract, onboarding checklist, scenario JSONs), density `0-100` with
`100/80/50/30/0%` anchors, fanout/texture tables, icon requirements, and level-up card copy inputs. A brief
without the orthogonality table produces designs that collide with shipped identities (measured: two engines
independently reinvented the shipped 镇魂瓮 teal-vial identity when the table was omitted).

**Feeding an existing Claude Design handoff zip into Open Design**: unzip it as-is, change nothing inside,
and ADD only the Open Design delta files alongside:

- `DESIGN.md` — aspiration-first creative cover (identity, craft bar, what gorgeous looks like), pointing to
  the original README/brief for scope and to the craft docs below;
- `darkbone-visual-language.md` + `exemplar-craft.html` (from `open-design-game-ui-concept/references/`) —
  Open Design engines need the craft scaffolding that the Claude Design product ships built-in;
- a placeholder artifact file named for the expected deliverable;
- `source-manifest.json` with the generation contract (`codex` / `gpt-5.6-sol` / `ultra` / no override);
- for interactive VFX labs: require a scriptable review API (`window.DARKBONE_VFX_LAB`: playBeat/playCycle/
  setDensity/setFloor/setTargets/setSpeed/state, every method returning truthy) so acceptance can be driven
  and recorded per beat.

The kickoff message orders reading: DESIGN.md → craft docs → original README/brief → reference contracts.
For UI surfaces, the preservation-contract workflow below still applies on top.

**The canonical step-by-step for VFX/skill packages is
[references/vfx-handoff-recipe.md](references/vfx-handoff-recipe.md)** — the owner-approved recipe (proven
2026-07-19 on the real 巫毒魂瓶 handoff: 91/100 blind score, owner-preferred). Follow it verbatim: package
composition, DESIGN.md cover template, launch/kickoff wording, engine defaults, driven-video acceptance, and
the handover into takeover.

## Workflow

0. **Branch by surface type.** UI surfaces (`#home`/mapselect/talent/masks/fusion/victory/steam-title/HUD)
   follow the full preservation-contract workflow below (steps 1-9). **VFX / skill / weapon / RIG /
   enemy / boss packages skip the preservation contract** and instead follow the content standard above
   (`claude-design-handoff-generate` package + Open Design delta); their validation path is the CD checker,
   not the Open Design packager:

   ```bash
   make claude-design-check ARGS="validate-handoff .handoff/<id>.zip --kind=skill_vfx"
   ```

   The Open Design packager (`package_open_design_handoff.mjs`) hard-requires a preservation contract and a
   UI contract profile — it is the gate for UI handoffs only. A VFX package still carries the generation
   contract in `od-source-manifest.json` and the `DARKBONE_VFX_LAB` API requirement in `DESIGN.md`.

1. Name the affected surfaces and the player job of each surface. **Copy
   `open-design-game-ui-concept/references/darkbone-visual-language.md` and `exemplar-craft.html` into the
   handoff folder, and structure `DESIGN.md` aspiration-first**: page one = identity, craft bar ("match the
   exemplar"), what gorgeous looks like for this surface; preservation/authority language comes after. A
   constraints-first brief reliably produces stiff web-dashboard output.
2. Read the live owner source. Record searchable source anchors for identity, motion, interaction, copy, and data.
3. Capture the current runtime at every target viewport and locale. Use at least two states per upgraded or
   redesigned surface.
   A genuinely new surface may use `baselinePolicy: new-surface-no-runtime` only under the `steam-title`
   contract profile. It must keep `baselineStills` empty and provide at least two real Home `contextStills`;
   this exception cannot be applied to an existing runtime surface.
4. Capture motion-critical behavior with real runtime video and timestamped keyframes. Home, Talent investment,
   Fusion reveal, and Victory/settlement reveal are motion-critical by default.
5. Write `preservation-contract.json`. For every component, assign one treatment (`preserve`, `upgrade`,
   `redesign`, or `untouched`) and authority for `layout`, `identity`, `motion`, `interaction`, `copy`, and
   `data`. Declare `changeScope` explicitly; it must exactly equal the axes whose authority is not `runtime`.
   Every axis outside `changeScope` is frozen even when the standalone omits or statically proxies it. `data`
   must remain runtime-owned. Also record `standaloneMotionPolicy`, `runtimeMotionImplementation`, and concrete
   `runtimeOwnerAnchors`. Runtime-owned motion must use `placeholder-only-preserve-runtime` plus
   `reuse-existing-runtime`; the standalone is showing placement, not replacement behavior.
6. List signatures that must survive, forbidden regressions, untouched details, and an executable rendered
   comparison plan with target viewports, locales, states, motion states, and required beats.
7. Bundle all referenced evidence inside one `.handoff/<timestamp>-<feature>/` folder. Never reference an
   absolute local path from the contract. `source-manifest.json` must contain the exact non-overridable
   generation contract `{ "agentId": "codex", "model": "gpt-5.6-sol", "reasoning": "ultra",
   "allowOverride": false }`.
8. Validate before Open Design import:

   ```bash
   node .agents/skills/open-design-game-ui-handoff/scripts/validate_preservation_contract.mjs \
     --contract=.handoff/<timestamp>-<feature>/preservation-contract.json
   ```

9. Run the parent handoff packager. It must invoke the same semantic validator; a zip that bypasses this step is
   not a valid handoff.

## Evidence Rules

- Use the real running app, not reconstructed HTML or source inspection alone.
- Dev-server capture prerequisites (the capture gates block on console errors and broken images):
  `index.html` registers `/sw.js`, which is a build artifact — drop an uncommitted no-op stub at
  `apps/game-runtime/public/sw.js` before capturing against `vite dev`, or every scenario fails with an
  unsupported-MIME console error. Mask art referenced as `/masks/mask-*.webp` is R2-hosted — populate
  `apps/game-runtime/public/masks/` (uncommitted) from the `publicUrl` entries in
  `data/artifact-manifest.json` or Home/Masks/Fusion image assertions fail.
- Store screenshots and keyframes as compressed WebP. Store motion as WebM or MP4.
- Capture setup, peak/transformation, and settled/result beats at minimum. Add interaction and recovery beats
  when they carry meaning.
- Record active animation names or runtime source anchors as supporting evidence, never as a substitute for video.
- Capture reduced-motion separately when the component has a reduced-motion branch.
- Keep artifacts local/gitignored unless the owner explicitly requests archival.

## Rejection Conditions

Reject the handoff when any of these are true:

- `darkbone-visual-language.md` or `exemplar-craft.html` is missing from the folder, or `DESIGN.md` opens
  with constraints/authority instead of creative direction;
- a redesigned surface has fewer than two current-runtime stills;
- a motion-critical surface has no video or fewer than three timestamped keyframes;
- a component grants Open Design authority implicitly;
- `changeScope` is missing, broader than the assigned authority, or narrower than it;
- a layout-only task grants Open Design identity, motion, interaction, copy, or data authority;
- runtime-owned motion is not explicitly marked as a placeholder-only standalone representation backed by the
  existing runtime implementation;
- Home, Talent, Fusion, or Victory omits one of its known protected runtime components from the contract;
- source anchors, evidence files, must-retain signatures, or forbidden regressions are missing;
- the brief describes an existing dynamic component as disposable because the standalone cannot render it;
- the comparison plan cannot align current, standalone, and future integrated renders by viewport/state/beat.

The deliverable is a validated preservation contract plus a self-contained handoff. It is not runtime code.
