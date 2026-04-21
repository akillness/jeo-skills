# Platform Map: bmad-gds modernization

## Settings
| Concern | Current bmad-gds need | Nearby repo evidence | Common Layer |
|---------|-----------------------|----------------------|--------------|
| Input scope | Accept vague game idea, GDD, backlog, playtest notes, build issues, or launch target | `task-planning`, `game-demo-feedback-triage`, `game-build-log-triage`, `steam-store-launch-ops` all assume narrower packets | A coordinating skill should normalize mixed game-production packets into one starting brief |
| Output scope | Produce milestone brief, phase recommendation, handoff packet, or next artifact recommendation | Adjacent game skills already produce focused outputs | `bmad-gds` should route and stitch, not duplicate specialist outputs |
| Engines | Unity, Unreal, Godot, custom engine | Existing game specialist skills already mention Unity / Unreal where relevant | Keep engine coverage broad but avoid fake engine-deep promises |
| Team mode | Solo dev or small studio | Existing game skills assume small-team or event-driven workflows | Phrase as orchestration for small teams, not enterprise pipeline software |

## Rules
| Concern | Current bmad-gds issue | Better rule | Common Layer |
|---------|------------------------|-------------|--------------|
| Trigger scope | Over-broad: phases, prototyping, retrospectives, code review, testing, and quick work all mixed together | Trigger on cross-phase game coordination and artifact conversion, not on every game task | Canonical orchestrator + specialist downstream skills |
| Overlap control | Collides with `task-planning`, `game-demo-feedback-triage`, `game-build-log-triage`, `game-performance-profiler`, `steam-store-launch-ops` | Add explicit when-not-to-use and handoff rules | Boundary-first routing |
| Output discipline | Mostly command catalog, little deterministic output | Require one short coordination artifact per run | Practical reusable workflow |
| Human oversight | Implied but not explicit | Make milestone / scope / risk sign-off explicit | Human-in-the-loop producer pattern |

## Hooks
| Lifecycle | Current gap | Better hook | Common Layer |
|-----------|-------------|-------------|--------------|
| Pre-production | No clear intake structure | Capture game type, milestone, platform/engine, constraints, and success metric first | Intake brief |
| Mid-production | No re-entry path from playtests or build failures | Re-route into backlog or specialist triage skill based on evidence type | Re-entry / reprioritization hook |
| Launch prep | Not connected to store/demo/launch beats | Escalate public-facing deadlines to launch/store skill when needed | Milestone-aware routing |
| Post-specialist pass | No integration rule after specialist outputs | Merge specialist findings back into one milestone brief | Stitch-back synthesis |

## Platform Gaps
- `bmad-gds` is not a vendor-platform abstraction problem; it is a repo-internal workflow-boundary problem.
- The clean abstraction is: **one game producer/orchestrator skill + multiple specialist downstream skills**.
- The strongest improvement is canonical routing and deterministic outputs, not more slash-command surface area.
