# Context: bmad-gds modernization

## Workflow Context
AI-assisted indie game production already follows a repeatable loop: concept and prototype work, design documentation, sprint or milestone planning, external playtest collection, bug/build triage, and launch readiness. The gap is not the existence of phases; it is the lack of one practical orchestration layer that converts artifacts between them.

Official platform docs reinforce that teams repeatedly cross these checkpoints:
1. Controlled external feedback via Steam Playtest — <https://partner.steamgames.com/doc/features/playtest> (direct page retrieval verified title: "Steam Playtest (Steamworks Documentation)")
2. Release checklist and review dependencies — <https://partner.steamgames.com/doc/store/releasing> (direct page retrieval verified title: "Release Process (Steamworks Documentation)")
3. Event-driven demo readiness via Steam Next Fest — <https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest> (direct page retrieval verified title: "Steam Next Fest (Steamworks Documentation)")
4. Backlog/project coordination via GitHub Projects — <https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects>
5. Engine/editor-side manual source-control and packaging work in Unreal — <https://dev.epicgames.com/documentation/en-us/unreal-engine/using-source-control-in-the-unreal-editor>

The durable pattern: teams do not need another abstract list of phases. They need help converting one artifact into the next while keeping milestone intent, risks, and ownership synchronized.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo indie developer | Owns concept, backlog, QA, and launch prep alone | Mixed; often strong in one lane, stretched across the rest |
| Small studio founder / producer | Coordinates creative direction, milestones, feedback, and shipping risk | Intermediate to advanced |
| Tech lead / gameplay programmer | Translates design intent into implementation slices and triages build blockers | Intermediate to advanced |
| Design / narrative lead | Shapes GDD, design pillars, and content constraints | Intermediate |
| QA / playtest coordinator | Synthesizes player feedback, bugs, and regression risk into next actions | Intermediate |

## Current Workarounds
1. Generic PM stack glued together manually: Docs or Notion for GDD, Trello/Jira/GitHub for tasks, Discord for decisions, spreadsheets for tuning and launch checklists.
2. AI drafts a GDD or brainstorm, then humans manually rewrite it into milestone plans and tickets.
3. Playtest notes are summarized in docs or spreadsheets, then manually turned into backlog items.
4. Build failures are still handled by humans reading raw logs, reproducing locally, and fixing engine/config issues.
5. Event dates such as Next Fest or launch review become ad-hoc production anchors because the workflow is not continuously stitched together.

## Adjacent Problems
- Scope creep from AI-generated ideas without explicit kill/defer/test-later rules
- Drift between GDD, backlog, and launch messaging
- Noisy playtest feedback that mixes onboarding, balance, UX, stability, and conversion issues
- Game-specific manual work that generic PM tooling does not model well (engine settings, packaging, playtest operations, launch checklists)
- Coordination friction between design work and launch/store work

## User Voices
> "Projects is an adaptable, flexible tool for planning and tracking work on GitHub."
Source: GitHub Docs — About Projects
<https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects>

> "How to use Source Control software inside UE."
Source: Epic Developer Community — Using Source Control In The Unreal Editor
<https://dev.epicgames.com/documentation/en-us/unreal-engine/using-source-control-in-the-unreal-editor>

> Steam Playtest gives teams a formal way to put a build in front of players before release.
Source: Steamworks Documentation — Steam Playtest
<https://partner.steamgames.com/doc/features/playtest>

> Steam release and festival participation introduce explicit checklist and milestone pressure, not just creative work.
Sources:
- <https://partner.steamgames.com/doc/store/releasing>
- <https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest>

## Confidence note
- Direct page retrieval succeeded for the Steam Playtest / Release / Next Fest titles plus GitHub and Unreal titles.
- Broader market and workflow observations are based on mixed evidence from repo context plus bounded external research lanes, with web-search API failures noted in the run log.
