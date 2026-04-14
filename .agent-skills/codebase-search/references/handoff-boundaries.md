# Handoff boundaries

## Keep in `codebase-search`
Use this skill when the main job is discovery:
- locate definitions, call sites, configs, tests, or entry points
- map likely ownership and impact surface
- choose the right search lane and summarize evidence

## Route to `debugging`
Switch when the next task is:
- reproducing a failure
- isolating root cause
- testing hypotheses
- narrowing symptom timelines or recent-change regressions

## Route to `log-analysis`
Switch when the main artifact is logs and the first task is extracting signal from them.

## Route to `code-refactoring`
Switch when the user has already found the relevant area and now needs:
- behavior-preserving cleanup
- decomposition / extraction planning
- codemod or repetitive migration planning

## Route to `code-review`
Switch when the main task is judging a concrete diff / PR rather than locating code.

## Route to `graphify`
Switch when the user wants a persistent whole-repo or mixed-corpus structure map, `graph.json`, `GRAPH_REPORT.md`, or graph-backed path tracing.

## Smell test
If your next output would mostly be hypotheses, fixes, or redesign steps instead of search findings, you are probably in the wrong skill.
