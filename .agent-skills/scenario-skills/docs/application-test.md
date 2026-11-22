# Application test protocol

The test every new or changed skill passes before merging. `/skills:validate <name>` drives it.

## When to run it

This is the one home of these criteria: [AGENTS.md](../AGENTS.md) "Validation and testing" and
`/skills:pr-handle` point here.

Run it for each skill a PR changes when any of these hold:

- The skill folder is new.
- `SKILL.md` changed in substance: description, steps, tool names, parameters, examples, or common
  mistakes.
- A supporting file linked from `SKILL.md` was added, removed, or materially reworked: a script
  whose behavior changed, a reference, an asset that changes agent behavior.

Skip it only when the change cannot alter agent behavior, or leaves no skill to test:

- only paths outside every skill folder changed;
- the PR deletes the skill: nothing is left to install;
- a typo-only, whitespace-only, or formatting edit;
- README table rows, or `skills.sh.json` grouping churn with no `SKILL.md` change.

A skipped test is still recorded: the PR template's "not applicable" line names the criterion.

## Protocol

1. Spawn a fresh agent with no conversation history. Give it only:
   - a framing line ("you are an agent connected to the Scenario MCP server; the skill document
     below is installed");
   - the SKILL.md under test, plus the `scenario` SKILL.md when testing any other skill, since real
     installs ship both;
   - one realistic task.
2. Ask for a numbered tool-call plan with exact tool names and argument shapes. Planning only: the
   agent must not execute tools, browse, or consult anything beyond the provided documents, and must
   flag uncertainty instead of guessing.
3. Pick a task that forces the skill's non-obvious facts (upload flow, job-wait re-calls, dry runs,
   launch semantics), not one answerable with generic MCP intuition. Known case: for `scenario-3d`,
   price a six-legged creature batch from one concept, rig included before its mesh exists. It
   caught a top-down concept and an unanswered `ask_user`.
4. Grade the plan against the [tool reference](https://mcp.scenario.com/docs/tools), fetched fresh
   rather than recalled:
   - Every tool and parameter named in the plan exists. One invented name is a fail.
   - Correct flow: the loop the skill under test teaches. For a generation task: discovery,
     `model_schema_get`, `model_run`, then `jobs_wait` re-called with `pending_job_ids` for any job
     still running (fast models return complete inline; `job_get` polling is never correct), then
     `asset_display` / `asset_download`.
   - Generative model ids come from a `recommend` or `search` step, never asserted as constants. A
     named first-party tool model is not a violation when it is a sanctioned singleton or the member
     the skill under test is dedicated to; a named generative model always is.
   - The agent's own steps stay on MCP. A plan that reaches for the REST API, the SDK, or a CLI
     where an MCP tool exists fails, and so does one that invents an API call to cover a capability
     MCP lacks. Running a script the skill ships does not fail, whatever that script uses
     internally, and neither does saving a URL an MCP tool returned.
   - The task's trap steps are handled the way the skill teaches.
   - Anything asserted that appears in neither the SKILL.md nor the tool reference counts as a
     guess, even when it happens to be right.
5. A failure is a defect in the skill text. Fix the missing or ambiguous sentence, then re-run with
   a new fresh agent: a failed agent is contaminated by its own mistake.
6. Baseline probe, once per new skill (not per edit): run the same task with no skill installed, to
   confirm the skill earns its context cost.

## Rules learned from past runs

- Catalog-only MCP tools (`collection_*`, `asset_quality_gate_run`) take their arguments under
  `parameters`, not `arguments`, in `scenario_tool_execute_read/write`. The wrong key fails with a
  misleading "team_id and project_id are required".
- `usage` accepts inclusive date bounds and defaults to the last 31 days when both dates are
  omitted. Set explicit dates and scope for attribution.
  - Overall consumed CU is `totals.totalCU` (the sum of `consumption.value`). Model CU is generation
    activity and can differ. Both are already after discounts.
  - Never substitute job billing snapshots, or a sum of your own calls, for consumed CU.
- Verify a delivered video by sweeping it into contact sheets (`ffmpeg -vf "fps=2"`), not one frame
  per shot: a defect that fades in mid-shot passes a spot check.
- Before a paid run, pre-register what each outcome would mean, so conclusions are not fitted to
  results afterwards.
- Stop hunting a mechanism after roughly two inconclusive controlled runs: ship the rule that holds
  regardless and record the open question.
