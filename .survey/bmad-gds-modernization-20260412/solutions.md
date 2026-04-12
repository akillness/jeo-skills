# Solution Landscape: bmad-gds modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Ludo.ai | Game ideation and design-assist SaaS | Strong on concepting and inspiration | Weak on downstream backlog / QA / launch orchestration | Better ideation layer than producer layer |
| Rosebud AI | Prompt-to-prototype / game generation | Fast prototype loop | Not a durable studio workflow system | Better for early validation than ongoing production |
| modl.ai | AI-assisted game testing / QA | Strongest practical game-testing angle in the scan | Narrower than full planning-to-launch orchestration | Good adjacent specialist, not the orchestrator |
| Unity Muse / Unity AI | Engine-side AI features | Close to implementation workflow inside Unity | Not a cross-artifact studio operating system | Engine-local rather than cluster-wide |
| MetaGPT / AutoGen / CrewAI / LangGraph | Multi-agent orchestration frameworks | Flexible role-based orchestration patterns | Game-specific workflow still has to be designed manually | Good inspiration for role structure, not ready-made game ops |
| Generic PM + docs stack (Notion, Trello, Jira, GitHub Projects, spreadsheets, Discord) | Actual day-to-day coordination stack | Familiar, flexible, widely adopted | Fragmented source of truth, heavy manual glue | This is the real baseline behavior |

## Categories
- **Ideation / GDD assistance:** Ludo.ai, generic LLM + docs workflows, Rosebud AI
- **Testing / QA assistance:** modl.ai, engine-native testing plus AI summarization
- **Agent orchestration frameworks:** MetaGPT, AutoGen, CrewAI, LangGraph
- **Reality layer / actual operations:** GitHub Projects, Jira/Trello, Notion/Docs, Discord, spreadsheets, Steamworks portals, engine editor workflows

## What People Actually Use
People still operate through mixed artifacts: GDD docs, backlog tools, Discord threads, spreadsheets, build systems, and engine editors. AI most often drafts or summarizes. Humans still decide milestone scope, triage feedback, and resolve engine-specific failures.

## Frequency Ranking
1. Generic docs + backlog + chat stack
2. Game ideation helpers / GDD assistance
3. Multi-agent orchestration frameworks adapted from software workflows
4. Testing specialists such as modl.ai
5. Prototype generators / instant game makers

## Key Gaps
- Few solutions connect **idea → GDD → sprint plan → playtest synthesis → build triage → launch readiness** in one practical operating loop.
- Multi-agent frameworks offer roles but rarely give game-specific artifact handoffs.
- AI game tools over-index on ideation, NPCs, or asset generation while under-serving producer workflows.
- Generic PM tools do not capture game-specific manual steps such as engine packaging, playtest gating, or launch-event timing.

## Contradictions
- Marketed claim: "AI game studio" implies end-to-end automation.
  Reality: most tools are strong in one lane only — ideation, testing, assets, or runtime characters.
- Marketed claim: multi-agent frameworks already model a software team.
  Reality: game teams still need explicit support for design pillars, playtest evidence, build gating, and release beats.

## Key Insight
The best bounded improvement is not adding another specialist skill. It is upgrading `bmad-gds` into the coordinating layer for the existing game-skill cluster, with explicit artifact transforms and boundaries to the sharper downstream skills that already exist in the repo.
