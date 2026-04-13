# Platform Map: plannotator modernization

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Install surface | Plugin / hook plus CLI install | CLI install plus prompt/config integration | CLI install plus hook / approval-mode setup | Install plannotator CLI, then connect the platform-specific review trigger |
| Review trigger | ExitPlanMode hook or plugin flow | Prompt-driven/manual review flow | Approval-mode / hook-driven review flow | Human opens plan/diff review in browser UI, then approves or requests changes |
| Notes export | Works when hook-mode endpoint is active | Depends on running plannotator in the correct mode | Depends on running plannotator in the correct mode | Note export is a secondary mode with extra prerequisites |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Use before implementation | Strongest fit because plan mode is explicit | Works, but often more manual | Works when approval-mode / hooks are configured | `plannotator` should act before execution when a human wants an approval gate |
| Route to diff review | After coding or after a commit range is ready | After coding or after a commit range is ready | After coding or after a commit range is ready | Diff review is for changed code, not for unfinished planning |
| Route out to neighboring skills | `task-planning`, `jeo`, `agentation` | `task-planning`, `code-review` | `task-planning`, `jeo` | Keep planning/spec generation separate from review UI work |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-review | Hook / plugin fires after plan mode exits | Manual command / prompt prepares content | Hook / approval mode prepares content | The agent must have a concrete plan or diff to review |
| Review | Browser UI annotations with approve/request-changes flow | Browser UI or manual review flow | Browser UI annotations with approve/request-changes flow | Reviewer leaves structured annotations tied to specific issues |
| Post-review | Approved plan can unblock execution or be saved to notes | Feedback can be pasted/imported back to agent | Approved plan can unblock execution or be saved to notes | Review output becomes approval, request-changes feedback, or archived notes |

## Platform Gaps
- The common abstraction is stable (`settings`, `rules`, `hooks`), but the trigger/install surface differs enough that platform setup details belong in references, not the main skill body.
- Claude-centric hook behavior is currently better documented than Gemini or Codex specifics inside the repo skill.
- Note export depends on hook-mode behavior, which is a review-adjacent capability, not the primary reason to activate the skill.
