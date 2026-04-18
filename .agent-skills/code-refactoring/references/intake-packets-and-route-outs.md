# Intake Packets and Route-outs

Use this note when the incoming request is ambiguous. Normalize the request into one packet before writing a cleanup plan.

## Packet 1: Local cleanup
Use when the user has one file, function, component, service, script, or narrow module that is obviously too tangled.

### Best fit
- Oversized handler / component
- Duplication between close variants
- Rename / extract / split cleanup
- Move side effects to a clearer edge

### Output shape
- one primary cleanup goal
- one behavior guardrail
- two to four reviewable slices
- one short verification plan

## Packet 2: Fragile legacy area
Use when the structure is messy **and** confidence in current behavior is weak.

### Best fit
- hidden invariants
- weak or missing tests
- globals / side effects / mystery branches
- high fear of accidental regressions

### Output shape
- freeze-first framing
- characterization examples or tests
- smallest safe seam
- strict warning against a heroic rewrite

### Route-out
If the current behavior is still not understood well enough to define what must stay the same, send the diagnosis step to `debugging` before continuing.

## Packet 3: Repeated migration / codemod
Use when the same change repeats across many files.

### Best fit
- deprecated API replacement
- naming migration
- syntax modernization
- pattern rewrite across a directory or repo

### Output shape
- source pattern
- target pattern
- known exceptions
- pilot subset
- repo-wide rollout guardrail
- rollback note

### Route-out
If the main need is only to map symbols, files, or impact scope before choosing a transform, use `codebase-search` first.

## Packet 4: Diff-shaping cleanup
Use when the code technically changed already, but the diff is too mixed or risky to review cleanly.

### Best fit
- cleanup tangled with semantic behavior changes
- generated/mechanical edits mixed with hand-tuned changes
- hard-to-review rename + logic + test changes in one stack

### Output shape
- split suggestion by commit or patch layer
- note which edits are mechanical vs semantic
- explicit review-risk note
- route review judgment to `code-review`

## Route-out ladder
Use these checks before claiming `code-refactoring` should own the whole task:

| If the main job is... | Route to... |
|---|---|
| Proving why behavior is wrong | `debugging` |
| Judging whether a specific diff is safe / merge-ready | `code-review` |
| Designing validation depth or gate policy | `testing-strategies` |
| Naming the bottleneck from traces, CWV, profiler output, or benchmarks | `performance-optimization` |
| Mapping symbols, call sites, wrappers, or blast radius | `codebase-search` |

## Compact decision rule
- **Known cleanup shape + behavior guardrail exists** → `code-refactoring`
- **Known cleanup shape + no trustworthy behavior definition yet** → `debugging` first, then `code-refactoring`
- **Known cleanup shape + only impact mapping is needed first** → `codebase-search` first, then `code-refactoring`
- **Cleanup request is actually about merge confidence** → `code-review`
- **Cleanup request is really a performance bottleneck complaint** → `performance-optimization`
