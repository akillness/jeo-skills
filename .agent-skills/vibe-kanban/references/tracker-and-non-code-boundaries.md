# Tracker and Non-Code Boundaries

`vibe-kanban` overlaps with several adjacent workflows. This note keeps the boundary clear.

## Existing trackers vs `vibe-kanban`
Use an existing tracker alone when the team only needs:
- issue assignment
- status visibility
- comments/audit trail
- sprint or roadmap management

Add `vibe-kanban` when the team also needs:
- isolated coding workspaces/worktrees per task
- explicit agent selection and retries
- fast board-first review before PR handoff
- comparison between multiple agent attempts on bounded code work

## PM / ops
If the request is really about standups, retros, prioritization, or status reporting, route to PM skills.

## Marketing / content
If the workflow is mostly briefs, calendars, approvals, launch messaging, or content operations, route to `marketing-automation` or related GTM/content skills. Many teams use boards or spreadsheets there, but they do not need coding workspaces, diffs, or PR cleanup.

## Game development
If the request is about production planning, pitch decks, milestone reviews, or feature prioritization without a coding-board control plane, route to `bmad-gds` or the relevant game workflow skill. Use `vibe-kanban` only when game work is actually being executed as bounded coding tasks on a board.

## Practical operator question
Ask: **Will success be judged mainly through diffs, workspaces, retries, and PR handoff?**
- If yes, `vibe-kanban` may fit.
- If no, use the domain workflow skill and keep the board out of the way.
