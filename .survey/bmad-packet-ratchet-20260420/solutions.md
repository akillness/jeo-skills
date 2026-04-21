# Solution Landscape: bmad packet ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| BMAD core workflow | Product brief → PRD → architecture → epics/stories → execution | Clear staged artifact chain; explicit workflow map | Can still feel phase-first when users arrive with mixed evidence packets | https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/docs/reference/workflow-map.md |
| BMAD `quick-dev` / quick fixes | Small bounded work starts from issue/file/bug packet | Matches real brownfield intake; lowers overhead | Not the full answer for mixed planning/runtime routing | https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/docs/explanation/quick-dev.md |
| Product-doc stack (PRD + architecture + sprint planning) | Separate planning artifacts with downstream sprint slicing | Familiar for web/fullstack/product teams | Requires manual handoff between documents | https://www.atlassian.com/agile/project-management/sprint-planning , https://arc42.org/overview |
| Game planning stack (GDD + milestone/sprint board) | Living design doc plus milestone/task coordination | Fits idea → prototype → production → launch reality | Still split across docs, tasks, and launch coordination | https://hacknplan.com/ , https://www.nuclino.com/articles/game-design-document-template |
| Plain issue tracker / spreadsheet / docs workflow | Manual source-of-truth across tickets, docs, CSV imports, boards | Portable and common in practice | Highest sync burden and weakest artifact-routing clarity | https://support.atlassian.com/jira-cloud-administration/docs/import-data-from-a-csv-file/ |

## Categories
- **Phase/artifact frameworks**: BMAD core workflow, product-doc stacks, game planning stacks
- **Fast-path bounded work**: BMAD `quick-dev`, issue-driven small-change flows
- **Operational substitutes**: Jira/boards, spreadsheets, docs modules, milestone boards

## What People Actually Use
In practice, teams rarely operate from a single monolithic workflow surface. They use a chain of bounded artifacts: concept note or brief, PRD, architecture note, sprint or milestone plan, and then execution tracking in tickets/boards. Game teams do the same with GDDs, milestones, playtest notes, and launch checklists. BMAD's own brownfield and quick-dev guidance also assumes users arrive with current evidence packets rather than a pristine phase transition.

## Frequency Ranking
1. Multi-artifact planning chain (brief / PRD / architecture / sprint-plan or milestone plan)
2. Issue-driven or small-change packet routing (`quick-dev`, bug/issue/file-path driven work)
3. Board or tracker as execution shell (Jira, milestones, tasks)
4. Game-specific GDD plus milestone board
5. Spreadsheet / CSV / manual docs as fallback or migration path

## Key Gaps
- No single front door cleanly normalizes mixed BMAD packets without re-explaining the full workflow.
- "Single source of truth" claims still collapse into multiple artifacts with manual handoffs.
- Brownfield and game-production flows especially need earlier packet selection and route-outs.
- Runtime-specific orchestration should stay outside the common BMAD layer.

## Contradictions
- Marketed claim: one unified lifecycle or source of truth.
  - Reality: teams still operate through multiple bounded artifacts with explicit handoffs.
- Marketed claim: workflow tools remove ambiguity.
  - Reality: brownfield work, review feedback, and mixed game-production packets still require front-door interpretation.

## Key Insight
The highest-value change is not another planning wrapper. It is a smaller `bmad` contract that starts from the packet the user actually has now—idea notes, PRD, architecture, review feedback, existing repo state, GDD, or milestone pressure—then chooses one next artifact and routes runtime, review, task decomposition, or game-production detail to the right neighboring skill.

## Curated Sources
- BMAD workflow map: https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/docs/reference/workflow-map.md
- BMAD quick-dev: https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/docs/explanation/quick-dev.md
- BMAD established projects: https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/docs/how-to/established-projects.md
- Atlassian sprint planning: https://www.atlassian.com/agile/project-management/sprint-planning
- arc42 overview: https://arc42.org/overview
- HacknPlan: https://hacknplan.com/
- Nuclino GDD template: https://www.nuclino.com/articles/game-design-document-template
- Jira CSV import docs: https://support.atlassian.com/jira-cloud-administration/docs/import-data-from-a-csv-file/
