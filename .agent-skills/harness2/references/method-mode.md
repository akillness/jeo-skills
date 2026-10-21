# Method mode: apply Propose–Probe–Compose to your own agent harness

<!-- jeo-skills catalog addition (not upstream): a manual application of the pinned Harness²
method for projects that have no Harness² benchmark adapter. Upstream automation only ships the
LAB, JobBench, WorkBuddy, and local demo adapters. -->

Use this mode when the job is designing or refining *one* agent harness — a system prompt, rules,
memory, tool guidance, subagents/agent team, skills, scripts, or hooks — and running the upstream
pipeline is unnecessary or impossible. It replaces the retired `harness` skill's agent-team design
job: an agent team is the subagents component (c5) plus the routing text that triggers it.

## 1. Freeze the task and the evidence rule

- Pick one representative task (or a small ordered stream within one domain) the harness must do.
- Write down what a run produces and how two runs will be compared *without* a hidden answer key:
  deliverable completeness, tool errors, retries, wasted turns, policy violations, missing
  evidence, and output format. Upstream withholds rubrics from the improver; do the same — the
  person or agent editing the harness must not see grading criteria.
- Keep model, tools, permissions, and network constant across every probe.

## 2. Map the current harness onto the eight components

| Component | Typical file in this ecosystem |
|---|---|
| c1 system prompt | `AGENTS.md`, `CLAUDE.md`, `systemprompt.md` |
| c2 guardrails | rules files, "never/always" sections, trigger lines that load skills |
| c3 memory | long-term memory file, project notes, `.mex/` context |
| c4 tool guidance | tool-usage policy text |
| c5 subagents | `.claude/agents/<name>.md`, `sub_agents/<name>/AGENT.md`, role prompts |
| c6 skills | `skills/<name>/SKILL.md` with a description that states when to load it |
| c7 scripts | deterministic helpers the agent calls instead of improvising |
| c8 plugins/hooks | in-loop enforcement (OpenCode plugins, Codex/Claude hooks) — the only lever the model cannot skip |

Respect always-on budgets: every token in c1–c4 competes with the agent's own output (upstream caps
OpenCode at 24,000 characters and Codex `AGENTS.md` at 8,000). Push detail into c6 skills and
give each skill an explicit trigger line in c1 or c2.

## 3. Propose

Produce two kinds of candidate edits from the reference runs:

- **Invariant** edits — would help any task in this harness (clearer completion criteria, a
  verification script, a guardrail against a recurring tool misuse).
- **Domain** edits — specific to this task family (a domain skill, a specialist subagent, a
  checklist for the deliverable type).

Each candidate is a concrete diff to named component files, not advice.

## 4. Probe

Execute the same task under the base harness and under each candidate. Record, per run: the
artifact produced, turn count, tool failures, retries, and any observable violation. Upstream uses
`k` reference runs plus `k` invariant and `k` domain candidates (parallel) or `k` chained steps
(sequential); scale `k` to the budget and say which you used.

## 5. Compose and select

Build the refined harness from edits whose probe evidence shows a behavioral improvement over the
base runs; drop edits that only changed wording or helped one run by chance. Select blind: compare
outputs without knowing which harness produced them, then adopt.

## 6. Reflect into a library

Record the adopted harness and the evidence-supported lessons (what changed, which behavior it
fixed, which probe showed it) in a dated per-domain library entry. The next task in the same
domain starts from that library, never from a later task's evidence.

## Agent-team design through this lens

1. Name the roles only after the reference runs show work that a single context handles badly
   (context overflow, conflicting objectives, verification that needs independence).
2. Implement each role as a c5 subagent file with a description that states when it is invoked,
   its inputs, outputs, and completion signal; route to it from c1/c2.
3. Prefer the smallest structure that the probes justify: one agent plus skills, then a
   producer-reviewer pair, then fan-out/fan-in. Every added role must win a probe.
4. Keep runtime choice separate: Paperclip, ruflo, ZeroShot, tmux managers, or native subagents
   execute a team; this mode decides what the team should be.

## What this mode does not claim

Manual application is an adaptation of the published method, not the upstream implementation or
its benchmark results. Report the task, `k`, probes run, evidence compared, and the adopted diff;
never cite the paper's benchmark gains as evidence for a harness that was not measured.
