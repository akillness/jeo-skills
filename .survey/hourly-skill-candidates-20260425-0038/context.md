# Context: hourly skill-candidate maintenance loop

## Workflow Context
The hourly loop must discover skill-update candidates via survey-first research, then gate noisy results before editing skill files. This run used the five required keyword families and collected GitHub metadata (`license`, `pushed_at`, `archived`). (direct page retrieval)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Keep skill catalog current and merge safe updates | Advanced |
| Automation operator | Run hourly cron loop and verify quality gates | Advanced |
| Skill consumers | Rely on high-signal skills and references | Mixed |

## Current Workarounds
1. Manually inspect noisy keyword hits and drop irrelevant repos.
2. Add ad-hoc curated seeds when direct keyword queries return empty sets.
3. Encode one-off logic in PR notes instead of reusable skill guidance.

## Adjacent Problems
- Inconsistent provenance labeling across hourly artifacts.
- Empty keyword lanes can be mistaken for "no ecosystem activity".
- Repeated rediscovery of the same filtering heuristics.

## User Voices
- "Agentic AI SKILL for Flutter. Automates production-grade BLoC implementation and enforces strict Clean Architecture stan" — https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill (direct page retrieval)
- "Enhance your Pong game with Pygame! Learn how to add exciting features and unleash your creativity in this tutorial seri" — https://github.com/SMDS-Studio/Building-a-New-creative-Pong- (direct page retrieval)
- "An agentic AI skill that transforms raw, vague prompts into professional-grade, context-rich instructions — like having " — https://github.com/VoDaiLocz/Enhance-Prompt (direct page retrieval)
- "A fun little parkour game for our now-famous marble. Here you'll start learning real-world blueprint game development sk" — https://github.com/UnrealBlueprint/02_CrystalCavern (direct page retrieval)
