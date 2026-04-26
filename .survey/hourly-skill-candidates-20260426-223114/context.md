# Context: hourly skill candidate survey

## Workflow Context
This run executed five mandatory keyword lanes and applied lane-intent overlap, signal floor, license/activity/archive gates, then prepared recommendation-grade candidates only. (provenance: indexed snippet)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Reviews/merges skill updates | Intermediate |
| Contributor | Proposes new/updated skills | Intermediate |
| Automation runner | Executes survey + artifacts + PR lifecycle | Advanced |

## Current Workarounds
1. Manual curation of noisy search results before making skill edits.
2. Reviewer-side filtering when automated runs suggest low-fit repos.
3. Recovery query pass for empty/noisy lanes (`stars:>5000 pushed:>=2024-01-01`).

## Adjacent Problems
- Lane imbalance can cause single-lane concentration in recommendations.
- Missing provenance labels can fail strict artifact validation.
- Metadata gaps (license/staleness/archive) can hide risky candidates.

## User Voices
- "A visual overview of useful skills to learn as a web developer" — andreasbm/web-skills (https://github.com/andreasbm/web-skills) [indexed snippet]
- "Agentic AI SKILL for Flutter. Automates production-grade BLoC implementation and enforces strict Clean Architecture standards." — AbdelhakRazi/flutter-bloc-clean-architecture-skill (https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill) [indexed snippet]
- "An agentic AI skill that transforms raw, vague prompts into professional-grade, context-rich instructions — like having a prompt engineer on" — VoDaiLocz/Enhance-Prompt (https://github.com/VoDaiLocz/Enhance-Prompt) [indexed snippet]
- "Agentic AI skills for knowledge graph management" — iwe-org/skills (https://github.com/iwe-org/skills) [indexed snippet]
- "21 Unity game development skills for Claude Code - Addressables, Behavior Designer, Cinemachine, GAS, VContainer, UniTask, Wwise, and more" — tjboudreaux/cc-plugin-unity-gamedev (https://github.com/tjboudreaux/cc-plugin-unity-gamedev) [indexed snippet]
