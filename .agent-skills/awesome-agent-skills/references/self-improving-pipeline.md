# Self-Improving Pipeline

The one **meta** persona: optimize an existing agent skill until it passes its own evaluations. Based on the upstream `self-improving-agent-skills` app — a multi-agent optimizer built with **Google ADK (Agent Development Kit)** and **Gemini**, inspired by Karpathy-style autoresearch.

Use when the user wants to improve a `SKILL.md` (or any agentskills.io-spec skill) rather than perform a domain task.

## The ADK agent team

| Agent | Role | What it does |
|---|---|---|
| **Executor** | runner & scorer | runs the skill against test scenarios, scores outputs against binary yes/no criteria, and generates initial scenarios during analysis |
| **Analyst** | failure diagnostician | examines failed evaluations, finds root causes, picks a mutation strategy (structured JSON via Pydantic schema) |
| **Mutator** | prompt editor | applies exactly **one** targeted change to the skill prompt per round (structured JSON via Pydantic schema) |

## The optimization loop

1. **Upload** — point at the skill folder (must follow the [agentskills.io](https://agentskills.io) spec).
2. **Configure** — Executor generates test scenarios + evaluation criteria; the user edits/adds/regenerates them.
3. **Optimize** — Executor runs and scores → Analyst diagnoses the failure pattern and chooses a strategy (`add_example`, `add_constraint`, `restructure`, or `add_edge_case`) → Mutator applies ONE surgical fix → Executor re-runs and re-scores.
4. **Keep or revert** — keep the change if the score improved, revert if not.
5. **Repeat** — until the target pass rate is hit or max rounds reached.
6. **Results** — download the improved skill with a changelog of every accepted mutation.

## How to apply it here (no app required)

You can run the same discipline manually inside any agent:

1. **Define evals first** — write 5–10 concrete test scenarios and a binary pass/fail criterion for each. Never assert defaults or tautologies; test observable behavior, edge values, and error handling.
2. **Baseline** — run the skill against every scenario; record the pass rate.
3. **Diagnose** — for each failure, find the single most likely root cause in the skill text.
4. **One change** — make exactly one targeted edit (add an example, add a constraint, restructure a section, or add an edge case). One change per round keeps cause and effect attributable.
5. **Re-score** — re-run all scenarios. Keep the edit only if the pass rate rose and nothing regressed; otherwise revert.
6. **Loop** — until the target pass rate or a round cap; log each accepted change.

## Running the upstream app

The full app is a FastAPI backend + frontend that streams the loop over SSE. It needs Python and a **Gemini API key**. See the upstream README:
`https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/awesome_agent_skills/self-improving-agent-skills`

**Output format:** baseline pass rate → per-round (failure diagnosis · single mutation · new pass rate · kept/reverted) → final skill + changelog.

## Handoffs

- Optimizing a jeo-skill's prompt eval loop → also see `skill-autoresearch` / `ultraqa`.
- Standardizing a skill's structure/frontmatter before optimizing → route out to `skill-standardization`.
