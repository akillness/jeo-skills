# Unattended scope planning check

Verdict: pass. A fresh agent received only the updated analytics skill, the connection skill, and
the task below. It did not execute MCP calls or browse. The resulting plan was checked against the
freshly fetched [tool reference](https://mcp.scenario.com/docs/tools) and
[usage reference](https://mcp.scenario.com/docs/tools/usage).

## Task

A scheduled, non-interactive report requests the top three models by CU with job counts for the
Design project, August 1 through August 31, 2026 UTC.

- Input A supplies no IDs. Prior discovery returned two projects with that name: Studio A
  (`team_example_a`, `project_example_a`) and Studio B (`team_example_b`, `project_example_b`). No
  human is available during the run.
- Input B explicitly supplies `team_id=team_example_b` and `project_id=project_example_b`.

All names and identifiers in this check are fictional. The tester was asked for the next actions and
exact tool-call shapes, including whether analytics would be requested and why.

## Assessment

Input A stops and lists the choices without guessing or widening scope. Input B uses the explicit
pair without waiting for confirmation. The plan uses valid discovery and usage parameters, includes
both CU and jobs, applies inclusive UTC dates, and keeps the documented MCP fallback. No live data
was collected.

## Tester plan

1. **Input A: stop without an analytics request.** The completed `teams_list` discovery found two
   matching projects, and the non-interactive task supplies no team/project ID pair. Issue no
   `usage` call and do not choose the first match, combine the projects, or widen the scope. Return
   the unresolved choices for the schedule owner to configure:
   - Studio A: `team_id="team_example_a"`, `project_id="project_example_a"`.
   - Studio B: `team_id="team_example_b"`, `project_id="project_example_b"`. No additional discovery
     is needed to establish the ambiguity already given in the task.

2. **Input B: use the explicit pair without waiting for human confirmation.** Select
   `team_id="team_example_b"` and `project_id="project_example_b"`. The task's explicit IDs resolve
   the unattended scope. Request project analytics for August 1 through August 31, 2026 UTC, with
   inclusive bounds. No prior snapshot is supplied by this test, so this plan obtains fresh data.

3. **Discover the current usage schema if missing or stale.** No live schema is provided in this
   planning exercise, so plan:

   ```javascript
   scenario_tools_search({ query: "usage", limit: 1 });
   ```

   This catalog search accepts only `query` and `limit`; do not add scope arguments to it. Inspect
   its schema and permission before the analytics call. Uncertainty: this test does not establish
   whether a current direct `usage` signature is available, so choose the following direct or
   catalog route according to that discovery. Do not execute both.

4. **Issue one project-scoped analytics request for input B.** If the current direct tool is
   available:

   ```javascript
   usage({
     team_id: "team_example_b",
     project_id: "project_example_b",
     scope: "project",
     start_date: "2026-08-01T00:00:00Z",
     end_date: "2026-08-31T23:59:59.999Z",
     response_format: "json",
   });
   ```

   If catalog-only, or the host's direct signature is stale while the fresh catalog supports these
   fields:

   ```javascript
   scenario_tool_execute_read({
     name: "usage",
     parameters: {
       team_id: "team_example_b",
       project_id: "project_example_b",
       scope: "project",
       start_date: "2026-08-01T00:00:00Z",
       end_date: "2026-08-31T23:59:59.999Z",
       response_format: "json",
     },
   });
   ```

   Use `parameters`, never `arguments`. Summary JSON provides `modelUsages` for this ranking;
   activity, time series, per-user queries, and broader project filters are unnecessary for the
   requested answer.

5. **Validate and rank the returned data locally.** Check echoed scope and dates against the
   selected project and exact UTC window. Check `consumption[].value` against `totals.totalCU`. Rank
   `modelUsages` by descending `totalCU`, break ties deterministically by the stable model ID
   returned by the response, and take at most three rows. Show each row's `totalCU` and `totalJobs`.
   Preserve decimals and signed values; do not subtract discounts again. Model CU measures
   generation activity and need not equal overall consumed CU. Withhold any affected attribution if
   its validation fails and report the exact mismatch. Uncertainty: the supplied documents do not
   specify the exact model identity/name field names or echo structure, so read those from the
   actual schema/response rather than inventing them.

6. **Return the bounded result.** State Studio B's selected Design project, August 1 through August
   31, 2026 UTC, ranking by model CU, retrieval time, and a table containing the returned model
   identities, CU, and job counts. Jobs mean model executions, not successful assets. If fewer than
   three models are returned, show only those present; distinguish empty results from permission or
   connection failures. No results or model names can be supplied during this planning-only test,
   and no analytics calls have been executed.
