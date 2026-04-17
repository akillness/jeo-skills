# Context: debugging structural hardening

## Workflow Context
Modern debugging guidance across CLI, web, CI, and game/runtime workflows keeps converging on the same operational loop: **reproduce the failure, isolate the narrowest failing boundary, then verify the fix under the same conditions**.

Browser-rendered primary-page evidence from Playwright emphasizes running a test live, reusing the browser session, stepping through breakpoints, and inspecting locators while debugging real UI state rather than jumping straight to broad fixes ([Playwright Debugging Tests](https://playwright.dev/docs/debug)). GitHub's Actions docs treat extra debug logging as a second-stage move for workflows whose normal logs are not detailed enough to diagnose why a workflow, job, or step failed, which reinforces the distinction between symptom capture and deeper debugging ([GitHub Docs: Enabling debug logging](https://docs.github.com/en/actions/how-tos/monitor-workflows/enable-debug-logging)). Git's `git bisect` docs frame regression isolation as a binary-search workflow for finding the commit that introduced a bug, which makes history narrowing a specific debugging mode rather than a generic always-on step ([git-bisect documentation](https://git-scm.com/docs/git-bisect)).

The strongest workflow implication for `oh-my-skills` is that `debugging` should stay focused on the **root-cause experiment loop after the failure is concrete enough to test**, while raw log triage, broad testing policy, PR review, and performance tuning remain explicit handoffs.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Application developer | Turn a failing request, test, or runtime bug into a minimal reproducer and verified fix | Mixed |
| CI / build engineer | Narrow workflow/job/step failures, compare environments, and stabilize flaky runs | Intermediate–advanced |
| Frontend / E2E engineer | Reproduce exact UI interactions, inspect state/network timing, and verify fixes in the same browser path | Intermediate |
| On-call / incident responder | Move from logs, traces, and crash reports to a testable suspect boundary | Intermediate–advanced |
| Game developer / technical designer | Reproduce runtime or scene issues, inspect editor/runtime state, and separate logic bugs from perf/tooling issues | Mixed |
| Agent / skill maintainer | Route debugging requests correctly instead of absorbing log triage, test-strategy design, or perf work | Advanced |

## Current Workarounds
1. **Manual rerun loops** — rerun the command, test, or workflow with the same input until the failure is reproducible or clearly flaky.
2. **Temporary logging / instrumentation** — add print statements, request dumps, or extra debug logging when interactive stepping is unavailable or too invasive.
3. **Artifact-first investigation** — inspect CI logs, traces, screenshots, or crash context before deciding whether the next move is debugging, log analysis, or perf work.
4. **Regression narrowing** — compare recent diffs or use `git bisect` when a last-known-good state exists.
5. **Environment diffing** — compare env vars, dependency versions, flags, and runtime context for bugs that only happen in CI/staging/prod.
6. **Flake mitigation workarounds** — rerun failing tests, increase retries/timeouts, or quarantine noisy tests while root cause is still unclear.

## Adjacent Problems
- **Raw symptom-first log triage** is an intake problem, not the same as root-cause debugging. GitHub's debug-logging docs explicitly start from the case where ordinary workflow logs are insufficient.
- **Broad testing policy** asks what to test or how to prevent flakes at program level; that belongs with `testing-strategies`, not `debugging`.
- **PR / diff review** is preventive judgment about code quality or risk, not a reproduce/isolate loop.
- **Performance tuning** overlaps in tooling but uses different success criteria and often starts from profiling/benchmarking rather than generic failure diagnosis.
- **Observability / crash-reporting setup** helps discover or localize failures, but it does not replace reproduction and verification.

## User Voices
> Evidence note: direct community-thread extraction was weak in this environment, so the strongest user-voice evidence this run comes from a primary article and visible comments rather than a broad forum scrape.

- "Almost 16% of our tests have some level of flakiness associated with them" and about 84% of observed pass→fail transitions involved a flaky test, which creates repetitive work to decide whether a new failure is real or noise ([Google Testing Blog](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we-mitigate-them), browser-rendered primary page).
- Google describes mitigation patterns that map directly to real debugging behavior: rerun only failing tests, auto-rerun on failure, require three consecutive failures for marked-flaky tests, and quarantine very flaky tests. Those mitigations reduce false positives but can also mask real issues ([Google Testing Blog](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we-mitigate-them), browser-rendered primary page).
- A visible reader comment adds a practical workflow detail: running new tests in a loop for a week before joining the critical CI path, which reinforces that teams often use repeated execution and staging loops before calling a failure understood ([Google Testing Blog comment thread](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we-mitigate-them), browser-rendered page).

## Sources
- Browser-rendered primary page: [Playwright – Debugging Tests](https://playwright.dev/docs/debug)
- Browser-rendered primary page: [GitHub Docs – Enabling debug logging](https://docs.github.com/en/actions/how-tos/monitor-workflows/enable-debug-logging)
- Browser-rendered primary page: [Git – git-bisect Documentation](https://git-scm.com/docs/git-bisect)
- Browser-rendered primary page: [Google Testing Blog – Flaky Tests at Google and How We Mitigate Them](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we-mitigate-them)
- Fallback solution-inventory summaries from this run's parallel survey lanes (tool-auth degraded, clearly labeled there)
