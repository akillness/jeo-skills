# Context: oh-my-skills hourly survey loop

## Workflow Context
Repository maintenance runs every hour: discover candidates by lane, produce structured artifacts, then PR/merge with quality gate.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Accept/merge improvements | advanced |
| Reviewer | Validate evidence/provenance | intermediate |
| Automation operator | Keep hourly loop stable | advanced |

## Current Workarounds
1. Manual re-check of lane evidence in PR body.
2. Ad-hoc fallback notes for tool failures.

## Adjacent Problems
- Empty/noisy lane outputs can degrade recommendation quality.
- CI/check visibility may block merge despite good content.

## User Voices
- "A fun little parkour game for our now-famous marble. Here you'll start learning real-world blueprint game development sk" — https://github.com/UnrealBlueprint/02_CrystalCavern (direct page retrieval)
- "I am strengthening my C# game development skills day by day." — https://github.com/rohithnafeel/My-CS-Projects (direct page retrieval)
- "for my game development skill" — https://github.com/Unengine/GameEngineAndGameMathTIL (direct page retrieval)
- "Enhance your Pong game with Pygame! Learn how to add exciting features and unleash your creativity in this tutorial seri" — https://github.com/SMDS-Studio/Building-a-New-creative-Pong- (direct page retrieval)
- "A virtual pet simulator game developed using Unity and C#. The game allows users to interact with and take care of a vir" — https://github.com/inchussa/Virtual-Pet-Simulator (direct page retrieval)
