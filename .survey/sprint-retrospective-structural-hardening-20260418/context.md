# Context: sprint-retrospective structural hardening

## Workflow Context
The hourly maintenance loop scanned current opportunities across CLI/developer workflow, web/fullstack, product/ops, marketing/GTM/content, and game development. Repo-local graph evidence showed the strongest bounded improvement was still inside the PM cluster: `sprint-retrospective` remains structurally correct, but its front door is oversized relative to the repo's newer routing-first pattern.

The current repo state points to the same maintenance shape seen in recent hardening passes:
- `graphify-out/GRAPH_REPORT.md` lists `sprint-retrospective` on the oversized front-door watchlist at 304 lines.
- `.agent-skills-wiki/concepts/project-management-cluster.md` confirms the PM cluster already has separate anchors for planning (`task-planning`), estimation (`task-estimation`), daily coordination (`standup-meeting`), and reflection/follow-through (`sprint-retrospective`).
- The remaining improvement is therefore not another PM skill; it is smaller routing, better packet separation, and discovery-surface truthfulness.

External workflow evidence still matches that conclusion:
- Atlassian frames retrospectives as meetings to improve team success rather than template theater, and its page surfaces remote, async, blame, psychological-safety, and follow-through language in the same guide. Source: https://www.atlassian.com/team-playbook/plays/retrospective (direct page retrieval + keyword presence check).
- Scrum.org defines the Sprint Retrospective around inspecting how the last Sprint went across people, interactions, processes, tools, and Definition of Done. Source: https://www.scrum.org/resources/what-is-a-sprint-retrospective (direct page retrieval).
- Miro's remote-retro and retrospective guides emphasize distributed-team engagement, remote/hybrid facilitation, and action-oriented reflection. Sources: https://miro.com/agile/guide-to-remote-retrospectives/ and https://miro.com/agile/guide-to-retrospectives/ (direct page retrieval).
- Parabol's browser-rendered retrospective guide emphasizes learning from missteps, improving resilience, transparency, psychological hygiene, and remote-team formats. Source: https://www.parabol.co/resources/sprint-retrospective-ideas/ (browser-rendered primary page evidence).
- TeamRetro's template positioning still turns the workflow into reflection + learnings + actions for the next sprint. Source: https://ww2.teamretro.com/retro-template/sprint-retrospective/ (direct page retrieval).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Engineering manager / scrum master | Facilitate a healthy retrospective and keep actions alive | Intermediate |
| Product / ops lead | Run milestone or release postmortems without turning them into planning meetings | Intermediate |
| Game producer | Convert milestone, QA, or cross-discipline friction into a few owned changes | Intermediate |
| Agent maintaining the skill repo | Keep PM-cluster anchors small, truthful, and non-overlapping | Advanced |

## Current Workarounds
1. Leave all retrospective guidance in the front-door `SKILL.md`, which keeps the skill usable but harder to scan and maintain.
2. Reuse one generic retro template even when the real need is remote facilitation, milestone postmortem framing, or dead-action-item recovery.
3. Drift into adjacent PM work such as planning, estimation, or standups when the retrospective intake is vague.
4. Track action items informally in docs or boards, then rediscover the same follow-through failure next cycle.

## Adjacent Problems
- Teams often confuse retrospectives with backlog planning, estimation, or status coordination.
- Distributed and hybrid teams need collection/facilitation patterns that differ from in-room retros.
- Repeated action-item failure is a separate ritual problem from idea generation.
- Milestone/game/postmortem workflows need cross-discipline prompts without collapsing into deep incident RCA.

## User Voices
- "How do you track action points from the retro?" — indexed Reddit thread title showing follow-through pain is common. Source: DuckDuckGo HTML indexed snippet for https://www.reddit.com/r/agile/comments/13cj3w7/how_do_you_track_action_points_from_the_retro/ (medium confidence).
- "How and where do you track your retrospective action items?" — indexed Reddit thread title reinforcing that teams still fall back to manual tracking patterns. Source: DuckDuckGo HTML indexed snippet for https://www.reddit.com/r/scrum/comments/tt52l8/how_and_where_do_you_track_your_retrospective/ (medium confidence).
- "How are you handling retrospectives remotely?" — indexed Reddit thread title showing that remote facilitation remains a live workflow problem, not just vendor marketing copy. Source: DuckDuckGo HTML indexed snippet for https://www.reddit.com/r/agile/comments/kzhxp3/how_are_you_handling_retrospectives_remotely/ (medium confidence).
- "My new team HATES retros - any advice" — indexed Reddit thread title showing ceremony fatigue and engagement breakdown. Source: DuckDuckGo HTML indexed snippet for https://www.reddit.com/r/scrum/comments/wqwzmy/my_new_team_hates_retros_any_advice/ (medium confidence).
