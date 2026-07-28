# Open Design VFX/Skill Handoff Recipe（正典流程）

Proven 2026-07-19: this exact recipe on the real 巫毒魂瓶 handoff produced an owner-preferred, 91/100
blind-scored artifact from a single gpt-5.6-sol run — beating the frame-evidence score of the shipped
Claude Design original on equal footing. Follow it verbatim for every VFX/skill/weapon/RIG package;
divergence must be justified in the handoff folder.

## 1. Package = Claude-Design-grade content + Open Design delta

**Content core** (two ways to get it):

- Reuse an existing `.handoff/<id>-<feature>.zip` built by `claude-design-handoff-generate`: unzip into the
  working folder **unchanged** — README owner matrix, brief (approved mechanics, visual orthogonality table,
  timing), `reference/` contracts, real mobile `#game` WebP proofs, scenario JSONs all stay byte-identical.
- Or build a fresh package WITH `claude-design-handoff-generate` first. Never hand-write a thinner brief:
  the measured cost of omitting the orthogonality table alone was two engines independently reinventing the
  shipped 镇魂瓮 teal-vial identity.

**Open Design delta** (add alongside, never inside the original files):

| File | Content |
| --- | --- |
| `DESIGN.md` | Aspiration-first cover, structure below |
| `darkbone-visual-language.md` | Copied from `open-design-game-ui-concept/references/` |
| `exemplar-craft.html` | Copied from same place — the craft bar |
| `<artifact>.html` | Tiny placeholder ("replaced by the design run") |
| `od-source-manifest.json` | `{"generationContract":{"agentId":"codex","model":"gpt-5.6-sol","reasoning":"ultra","allowOverride":false},"artifactContract":{"primaryFile":"<artifact>.html"},"origin":"<zip id> unmodified + OD delta"}` |

**`DESIGN.md` cover structure** (all five sections required):

1. **你在做什么** — one-paragraph fantasy of the skill, craft-bar line ("open exemplar-craft.html — match
   or exceed"), pointer to the craft bible.
2. **阅读顺序（严格）** — numbered: DESIGN.md → craft docs → **original README.md + brief.md（全部照办）**
   → reference/owner-decisions → other reference contracts → screenshots（点名哪几张是"必须避让的邻居身份，
   不是模仿对象"）.
3. **特别强调** — restate the orthogonality rows as hard constraints ("先查表再定色定形"), the mechanic's
   semantic red line (e.g. 诅咒=记账清算，绝不是 buff 光环), and the money-shot requirement ("结算爆发必须
   是全页最强视觉事件").
4. **交付物** — artifact filename; everything the original brief's "What to Produce" lists (theme proposals,
   icon direction, timing sequence, density anchors, integration map) PLUS the interactive review API:
   `window.DARKBONE_VFX_LAB` = { playBeat(name), playCycle(), setDensity(pct), setFloor(id), setTargets(n),
   setReturn(bool), setSpeed(x), state() } — every method returns truthy; at least two stage floor variants
   (the real bright floor from the proof screenshots + one dark floor).
5. **返件前自检** — 7-point game-feel checklist per beat × floors × density anchors; row-by-row
   orthogonality self-audit; "money shot 不是最强事件 → 重做再交".

## 2. Launch

- Duplicate the folder per engine when racing (each run writes the same artifact filename — shared folders
  clobber).
- `od project import-folder <folder> --name "<feature> <engine>" --json`.
- Kickoff message = compressed mirror of DESIGN.md's reading order + delivery contract, ending with the
  self-check demand. Append two engine-specific lines:
  - all engines: "Do not ask discovery questions — desktop review lab (1440x900 primary, usable 1280-1920);
    decide remaining details yourself and note them in the artifact."
  - BYOK engines (K3 etc.): "write the artifact INCREMENTALLY in 5-8 smaller edits; a single giant write gets
    truncated; verify complete valid HTML before returning."
- Default engine for VFX/skill packages: **codex gpt-5.6-sol / ultra** (two blind rounds: 91:82 and 91:72 vs
  the challenger). K3 remains the UI/composition challenger lane and a settlement/money-shot reference.
- Attach `capture_open_design_generation_evidence.mjs` the moment the run id returns (a completed run can
  never be retro-bound).

## 3. Acceptance

1. Probe `window.DARKBONE_VFX_LAB`: every method truthy; discover the artifact's actual floor/theme/beat ids
   from `state()` + source before scripting (engines name them differently).
2. Driven-video evidence with parity: one recorded sequence per candidate — full cycle on the bright floor
   at 100% → dark-floor cycle → 30% density cycle → theme-B switch — identical timing across candidates.
3. Stills per beat × floors × density anchors for the review page.
4. Scoring per the review rules in `open-design-control.md`: `codex exec -m gpt-5.6-sol -c
   model_reasoning_effort=high`, anonymized shuffled labels, equal-timestamp keyframes extracted from the
   videos (never stills-only for motion).
5. Chinese review page via `screenshot-review-artifact` (embed the driven videos — they play natively), open
   the OD preview labs for the owner, remind to close tabs (infinite ambient animations pin CPU cores).
6. Iterate via side-chat fix runs (never the default conversation); refetch the preview URL and verify the
   revision id + content changed before re-testing.

## 4. After owner approval

Hand to `open-design-game-ui-takeover`, which applies the `claude-design-standalone-takeover` standard in
full (completeness audit, R2 learn-loop archive, ±5% Phaser fidelity gate, mobile `#game` video verification).
