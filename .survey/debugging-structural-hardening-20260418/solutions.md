# Solution Landscape: debugging structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Log / print debugging | Temporary instrumentation and output inspection | Universal, fast, works in CI/remote/prod-like contexts | Noisy, easy to overgrow, weak for shared-state/concurrency reasoning | Still one of the most common real workflows in practice |
| Interactive debugger / IDE debug UI | Breakpoints, stepping, call stack, variables, watch expressions | Precise local-state inspection; strong for deterministic repros | Harder in remote/CI/async/timing-sensitive cases; breakpoint timing can distort behavior | VS Code emphasizes configuration, breakpoints, data inspection, and remote debugging ([VS Code docs](https://code.visualstudio.com/docs/debugtest/debugging)) |
| Browser DevTools / test-debug UI | Reuse browser session, inspect DOM/network/state, step through tests | Strong for frontend/E2E debugging with real rendered state | Web-focused; backend/distributed context still needs separate tooling | Playwright explicitly treats browser reuse and live debugging as core workflow ([Playwright](https://playwright.dev/docs/debug)) |
| CI debug logging / artifact inspection | Increase log verbosity and inspect workflow/job/step artifacts | Good when ordinary logs are insufficient; works without local attach | Symptom-heavy; can still leave root cause unclear | GitHub exposes runner and step debug logs as explicit escalation steps ([GitHub Docs](https://docs.github.com/en/actions/how-tos/monitor-workflows/enable-debug-logging)) |
| Regression isolation with `git bisect` | Binary-search commit history to find the first bad change | Objective, reproducible, high leverage when a pass/fail check exists | Needs a reliable reproducer; overkill for poorly bounded flakes | Best represented as a debugging mode, not a whole skill |
| Flaky-test mitigation workflows | Rerun failing tests, auto-rerun, quarantine, threshold-based failure policies | Reduces false positives and keeps pipelines moving | Can hide legitimate defects or normalize instability | Google's writeup shows how widespread this is in mature orgs ([Google Testing Blog](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we-mitigate-them)) |
| Traces / crash context / observability tools | Collect richer production signal before local reproduction | Useful for narrowing distributed/system failures | Often localizes symptoms more than causes | Good adjacent category, but not the core of `debugging` |
| Record/replay / heavy replay tooling | Deterministic replay for hard-to-reproduce failures | Powerful for racey or heisenbug cases | Setup and platform complexity keep it niche | Better as a reference-level tactic than front-door skill content |

## Categories
- **Reproduce and inspect locally** — debugger, IDE debug UI, browser/test debug UI
- **Escalate logging and artifacts** — CI debug logs, traces, crash context, temporary instrumentation
- **Narrow history or scope** — `git bisect`, suspect-commit comparison, reduced fixtures/repros
- **Mitigate and stabilize flakes** — reruns, retries, quarantine, repeated-run loops
- **Specialized hard-mode tools** — replay debugging, heavier observability stacks

## What People Actually Use
People do not rely on a single elegant debugger workflow. They combine **manual reruns, ad-hoc logging, copied CI artifacts, env/config diffing, reduced repro scripts, and occasional bisect/history narrowing**. That combination supports a compact route-in for the skill and detailed tactics in references rather than a giant all-in-one front door.

## Frequency Ranking
1. Log / print debugging and temporary instrumentation
2. Interactive debugger / IDE-driven debugging
3. Browser/test debug UIs for frontend/E2E work
4. CI debug logging and artifact inspection
5. Flaky-test rerun / quarantine workflows
6. `git bisect` or commit narrowing
7. Observability / crash-context tools
8. Record/replay workflows

## Key Gaps
- Many solution surfaces assume a stable reproducer, but the hard part is often making the bug happen reliably enough to test.
- Tool-specific docs explain features well, but they do not always tell you **when to switch modes** or **when to hand off** to log triage, test-policy, review, or performance skills.
- Flaky-test mitigation often becomes a tolerated workaround rather than a verified diagnosis path.
- Production signal tools are strong for localization, but they rarely replace the need for a focused local/controlled reproduction loop.

## Contradictions
- Tool marketing implies that richer observability or richer debugger UIs solve debugging end-to-end, while real workflows still fall back to manual reruns, temporary instrumentation, and repeated environment comparison.
- Flake mitigations like reruns or 3x-fail thresholds reduce false positives, but they also increase the risk of delaying or masking legitimate failures.
- `git bisect` is a great regression tool, but its value collapses when the failure is not reproducible; it should be taught as a conditional mode, not a universal default.

## Key Insight
The best bounded improvement is **not** adding another debugging-adjacent wrapper. It is tightening `debugging` into a routing-first diagnosis anchor whose front door answers: *Is the failure reproducible yet? Is this a regression? Is this mainly logs/artifacts? Is this turning into flake policy or performance work?* Then the skill can keep the reproduce → isolate → verify core loop small and move slower-changing tactic packets into support references.

## Curated Sources
- Browser-rendered primary page: [VS Code – Debug code with Visual Studio Code](https://code.visualstudio.com/docs/debugtest/debugging)
- Browser-rendered primary page: [Playwright – Debugging Tests](https://playwright.dev/docs/debug)
- Browser-rendered primary page: [GitHub Docs – Enabling debug logging](https://docs.github.com/en/actions/how-tos/monitor-workflows/enable-debug-logging)
- Browser-rendered primary page: [Git – git-bisect Documentation](https://git-scm.com/docs/git-bisect)
- Browser-rendered primary page: [Google Testing Blog – Flaky Tests at Google and How We Mitigate Them](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we-mitigate-them)
- Fallback source summary: ecosystem solution inventory compiled in the parallel survey lanes after `web_search` / `web_extract` auth failures
