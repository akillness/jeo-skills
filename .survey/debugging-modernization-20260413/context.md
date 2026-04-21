# Context: debugging modernization

## Workflow Context
`debugging` sits between symptom detection and safe change-making. In practice, teams enter this workflow after an alert, failing test, customer report, or suspicious log line, then work toward a reproducible explanation and a verified fix path. The durable workflow across sources is not "read the code and guess"; it is evidence gathering, reproduction, isolation, hypothesis testing, and fix verification. Direct page retrieval confirmed the current emphasis in major references such as VS Code debugging support, Git bisect, pytest flaky-test guidance, and Google SRE troubleshooting methodology.

Sources:
- VS Code — "Debug code with Visual Studio Code": https://code.visualstudio.com/docs/editor/debugging
- Git bisect docs: https://git-scm.com/docs/git-bisect
- pytest flaky tests: https://docs.pytest.org/en/stable/explanation/flaky.html
- Google SRE troubleshooting methodology: https://sre.google/sre-book/effective-troubleshooting/
- OpenTelemetry docs: https://opentelemetry.io/docs/

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Application developer | Reproduce failures, isolate suspects, implement fixes | Intermediate–advanced |
| Frontend/fullstack developer | Correlate browser symptoms, API failures, and state issues | Intermediate–advanced |
| Backend/platform engineer | Narrow runtime, dependency, config, and CI regressions | Intermediate–advanced |
| QA / test engineer | Turn vague failures into reproducible cases and regression tests | Intermediate |
| On-call engineer / SRE | Debug under time pressure with partial production evidence | Advanced |
| AI coding agent | Follow a bounded root-cause workflow instead of patching blindly | Intermediate |

## Current Workarounds
1. Add temporary prints or logs around the suspected path because it is faster than standing up richer instrumentation.
2. Re-run locally and trim the failing case until a minimal reproducer emerges; this matches the persistent MRE culture around debugging help.
3. Use `git bisect` or recent-change comparison when the team knows it used to work and needs to find the introducing change quickly.
4. Re-run flaky CI/tests repeatedly, cut unrelated setup, and stabilize timing/data until the failure becomes investigable.
5. Use feature flags or partial rollouts operationally to isolate whether a code path is implicated before deeper debugging.

## Adjacent Problems
- **Log analysis / observability:** logs, traces, and metrics help localize the problem but do not replace reasoning or reproduction.
- **Testing strategy:** flaky tests, weak fixtures, and low-fidelity environments make debugging harder.
- **Code review:** many debugging costs trace back to preventable design or boundary mistakes that review could have caught earlier.
- **Environment setup:** CI/prod-only failures often come from configuration, secrets, versions, or runtime drift rather than the obvious source file.
- **Performance and concurrency:** not every bug is a simple exception; some require timeline, resource, or race-condition thinking.

## User Voices
> "Minimal... Complete... Reproducible" remains the center of debugging help culture.
- Source: Stack Overflow MRE help — https://stackoverflow.com/help/minimal-reproducible-example

> Git documents `git bisect` as a first-class workflow to "find the commit that introduced a bug," which reflects how often developers ask "what changed?" rather than only "what line looks wrong?"
- Source: https://git-scm.com/docs/git-bisect

> Modern debugger UX still centers breakpoints, stepping, watches, and call stacks, which is strong evidence that developers continue to rely on iterative state inspection rather than one-shot diagnosis.
- Source: VS Code debugging docs — https://code.visualstudio.com/docs/editor/debugging
