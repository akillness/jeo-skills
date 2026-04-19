# JEO intake packets and route-outs

Use this reference when `jeo` activates and you need to decide the smallest honest next handoff.

## Packet chooser

| Packet | Use when | Main output | Primary route-outs |
|--------|----------|-------------|--------------------|
| `bootstrap-or-resume` | The workflow has no reliable state yet or must continue from prior work | Initialized / resumed ledger and machine state snapshot | `references/DOT_JEO_LEDGER.md`, `references/STATE_AND_TROUBLESHOOTING.md` |
| `planning-gate` | The next meaningful step is creating or revising an approved plan | Plan gate state, next planning commands, approval owner | `ralph`, `plannotator` |
| `runtime-handoff` | The plan is approved and implementation should start in a runtime-native way | Runtime owner + minimal next commands | `omc`, `omx`, `ohmg`, `bmad` |
| `verification-loop` | The build exists and behavior must be proved | Evidence checklist + browser verification decision | `agent-browser` |
| `annotate-submit-loop` | Browser-visible work needs explicit human-submitted UI feedback | Submit gate status + annotation owner | `agentation` |
| `cleanup-and-closeout` | Work is done or paused and must be summarized honestly | Completion summary + follow-up queue + cleanup commands | JEO scripts + git cleanup |

## Shared boundary rules
- `jeo` owns the durable ledger contract and the shared workflow phases.
- `jeo` does **not** own runtime-specific config, hook registration, or slash-command semantics.
- `jeo` decides when browser verification and annotation review are required, but the mechanics belong to `agent-browser` and `agentation`.
- `jeo` should prefer the smallest truthful route-out instead of re-explaining a sibling skill.

## Route-out matrix

| Situation | Route to | Why |
|-----------|----------|-----|
| Immutable spec / seed / completion loop is the real job | `ralph` | JEO should not replace the spec-first contract |
| Visual plan or diff needs review / approval | `plannotator` | Plan review is its own specialist surface |
| Claude-native execution and runtime setup | `omc` | Claude hook/team/runtime details live there |
| Codex-native execution and runtime setup | `omx` | Codex config / approval / runtime details live there |
| Gemini / portable `.agents` execution | `ohmg` | Gemini / portable runtime details live there |
| Browser behavior must be checked | `agent-browser` | Browser verification is a dedicated loop |
| Human-submitted UI annotations must be processed | `agentation` | Submit-gated UI feedback is a dedicated loop |
| Trust posture / approval configuration is the main issue | `ralphmode` | Safety posture is adjacent, not core JEO routing |

## Good packet shape

```markdown
## JEO Packet: [task]
- Primary packet: ...
- Current phase: ...
- Ledger state: ...
- Route-outs: ...
- Next commands: ...
- Exit criteria: ...
```

Keep it short. If the answer starts turning into a runtime setup manual, move that detail into the route-out or reference instead.
