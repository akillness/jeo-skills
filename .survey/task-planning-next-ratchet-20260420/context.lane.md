# Lane A — Context

## Workflow Context
- Official planning docs still separate planning from tracking. Atlassian backlog refinement and sprint planning prepare work before commitment instead of treating the board as the whole planning artifact.
- GitHub Projects and milestones are explicit planning/tracking surfaces, but they are system-of-record tools rather than compact decomposition packets.
- HacknPlan's documentation reinforces that game work needs milestone-aware, discipline-aware coordination rather than a generic scrum-only framing.
- Repo-local graph evidence still flags `task-planning` as a high-degree, oversized front door even after the 2026-04-18 structural-hardening pass, so it remains a credible candidate for one more bounded ratchet.
- The wiki's PM-cluster notes already say the lane benefits more from boundary clarification and discovery-surface truthfulness than from catalog expansion.

## Affected Users
- Engineers and tech leads slicing features or bug clusters into sprint-ready work.
- Product / ops owners translating roadmap work into execution packets.
- Marketing / GTM operators shaping launch packets before board entry.
- Game leads/producers coordinating milestone slices across design, code, content, QA, and launch work.

## Current Workarounds
1. Put planning directly into the issue board and lose readiness nuance.
2. Keep a sidecar doc/spreadsheet for blockers, dependencies, and not-ready items.
3. Use one tool for roadmap intent and another for execution, with human translation in between.
4. Let downstream estimation or board-control workflows absorb planning ambiguity they do not actually own.

## Adjacent Problems
- Planning vs estimation blur.
- Planning vs board-control blur.
- Discovery hidden inside implementation tickets.
- Cross-functional launch/game work flattened into generic lists.

## User Voices
- DuckDuckGo HTML indexed-snippet fallback produced zero usable Reddit results for the targeted workflow-language queries in this run, so direct community workflow evidence is thin rather than absent.
- The zero-result outcome itself matters: highly specific workflow pain around planning packets is not easily surfaced by indexed search, which makes repo-local structural evidence more valuable than pretending broad social validation was recovered.

## Sources
- [Atlassian backlog refinement](https://www.atlassian.com/agile/scrum/backlog-refinement) — direct page retrieval (unverified SSL context); title: "What is Backlog Refinement? | Atlassian"; description: "Learn how and why is it important to run a backlog refinement session with Atlassian’s backlog refinement guide."
- [Atlassian sprint planning](https://www.atlassian.com/agile/scrum/sprint-planning) — direct page retrieval (unverified SSL context); title: "Sprint Planning | Atlassian"; description: "Sprint Planning is an event in scrum that defines what can be delivered in the upcoming sprint and how that work will be achieved."
- [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects) — direct page retrieval (unverified SSL context); title: "About Projects - GitHub Docs"; description: "Projects is an adaptable, flexible tool for planning and tracking work on GitHub."
- [GitHub milestones](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/about-milestones) — direct page retrieval (unverified SSL context); title: "About milestones - GitHub Docs"; description: "You can use milestones to track progress on groups of issues or pull requests in a repository."
- [HacknPlan milestones and deadlines](https://hacknplan.com/docs/milestones-and-deadlines/) — direct page retrieval (unverified SSL context); title: "Documentation | HacknPlan"; description: "Read HacknPlan documentation, guides, and API references for game production workflows."
- Local graph evidence: `graphify-out/GRAPH_REPORT.md`
- Local boundary evidence: `.agent-skills-wiki/concepts/project-management-cluster.md`
