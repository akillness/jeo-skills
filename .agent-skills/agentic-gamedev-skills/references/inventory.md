# Upstream skill inventory

Inventory observed at commit `d632732fa0f09dfac9bb4d5fa2e5c8872f41cc10`. Run `install-upstream.sh --list` for the live selected ref.

## Game design

- `designing-mini-games` — original mini-game rules, controls, scoring, hazards, and difficulty.
- `designing-minimal-game-rules` — reduce an abstract seed to a minimal surviving rule system.
- `generating-retro-arcade-concepts` — compare and specify fixed-screen arcade concepts.
- `verifying-turn-based-games` — pure-function engine contracts and bot-ladder quality measurement.

## Implementation

- `scaffolding-godot-mini-games` — minimal Godot project scaffolding.
- `running-headless-godot` — reproducible Godot CLI, test, and export workflows.
- `developing-with-crisp-game-lib` — browser mini-games with crisp-game-lib.
- `arcadifying-mini-games` — ceremony, score economy, initials, high scores, and attract mode.
- `implementing-gameplay-invariants` — encode and test anti-idle/anti-mashing design promises.
- `smoke-testing-web-games` — live-browser crash and console smoke tests.
- `probing-web-game-mechanics` — inject state and verify mechanic transitions in a browser.

## Presentation and assets

- `directing-game-visuals` — visual hierarchy, palette roles, composition, and feedback.
- `maximizing-game-feel` — squash/stretch, tilt, particles, trails, and impact polish.
- `creating-godot-procedural-audio` — Godot runtime procedural sounds.
- `styling-web-game-typography` — readable, licensed game typography.
- `designing-retro-arcade-sound-kits` — event-driven SFX/jingle kit contracts.
- `generating-dot-assets` — transparent pixel-art object generation and validation.

## Evaluation

- `evaluating-gameplay-balance` — compare monotonous and intended-skill policies through telemetry.

## Agent workflow

- `extracting-agent-skills` — distill reusable procedures from project evidence.
- `extracting-spec-design-ladders` — reverse-engineer source into concrete and abstract specs.
- `gating-by-blind-restoration` — test whether one abstraction layer can reconstruct the next.
- `gating-expensive-batch-work` — cheap reversible pass before expensive irreversible batch work.
- `migrating-agents-md-to-control-flow` — move repeatable workflow out of oversized agent instructions.
- `refining-workflows-from-artifacts` — improve workflows from execution artifacts and failure causes.
- `critiquing-own-response` — structured adversarial self-review of the immediately prior response.

## Selection rule

Install only the narrowest owner. Combining complementary skills is reasonable when their contracts are distinct—for example, design + implementation + smoke test + telemetry—but installing the whole bundle is not a substitute for choosing an execution sequence.
