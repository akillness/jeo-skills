# Operating Modes and Route-Outs

Use this page when `SKILL.md` has already chosen the lane and you need the smallest next move.

## Mode picker

| User situation | Choose this mode | Immediate next artifact / command |
|----------------|------------------|-----------------------------------|
| Repo not installed or hardware unknown | Setup readiness | `bash scripts/check-hardware.sh` |
| Repo runs but search direction is weak | `program.md` authoring | edit `program.md` using `program-md-guide.md` |
| Baseline exists and loop is ready | Bounded run loop | `bash scripts/run-loop.sh --max N --desc session-name` |
| Session finished and results need meaning | Results interpretation | `bash scripts/show-results.sh --top 10` |
| VRAM / platform constraints dominate | Constrained-hardware adaptation | update `prepare.py` before the session and cross-check `hardware-config.md` |

## Immutable-harness reminders

Carry these into every mode:
- `program.md` is human-authored for the session
- `train.py` is the main mutable search surface
- `prepare.py` is read-only once the session starts
- `TIME_BUDGET=300` stays fixed
- `results.tsv` is append-only
- lower `val_bpb` wins

If any of those must change, start a **new comparison track** instead of mutating the active session.

## Route-outs

| If the request is really about... | Route to... | Why |
|-----------------------------------|-------------|-----|
| Improving a `SKILL.md`, prompt packet, or repo-local instruction artifact | `skill-autoresearch` | Same ratchet idea, different mutable artifact and evaluator |
| App-level evals, prompt regression suites, traces, feedback review, dashboards | LangSmith / Promptfoo / Braintrust / Weave | Observability/eval infrastructure, not `train.py` ML search |
| Literature review or broad research scan | `survey` or research skills | No runnable training loop yet |
| Generic GPU setup without the autoresearch workflow | environment / MLOps skill in the host repo | Hardware setup alone is not the full lane |

## Minimal response shape

A good front-door answer usually fits this template:

1. `Mode:` the one mode you chose
2. `Immutable rules:` what must not change
3. `Next step:` the file or command to touch now
4. `Route-out:` only if the request is adjacent or mixed
