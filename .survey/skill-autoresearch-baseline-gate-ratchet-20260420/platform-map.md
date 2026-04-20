# Platform Map: skill-autoresearch baseline gate ratchet

## Settings
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Baseline inputs | Usually encoded in repo files, prompt text, eval fixtures, and task instructions | Same pattern: repo files + task context + local validators | Same pattern: repo files + workflow docs + local validators | `settings.baseline_inputs` = prompt/scenario set, binary evals, baseline artifact path |
| Budget control | Turn/tool budgets usually expressed in system/task instructions | Same | Same | `settings.budget` = max iterations, allowed files, time/tool limits |
| Comparison surface | Agent can inspect repo diffs, eval fixtures, and validators | Same | Same | `settings.compare_surface` = baseline copy + frozen harness + diff target |
| Hosted evaluator use | Optional route-out to LangSmith / Promptfoo / Braintrust / Weave | Same | Same | `settings.hosted_eval_mode` = local-only vs route-out |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Freeze the judge | Must be written into the prompt/skill or charter; not guaranteed by platform | Same | Same | `rules.freeze_evaluator = true` |
| One-change mutation | Needs explicit instruction; platforms do not naturally enforce single-variable edits | Same | Same | `rules.one_meaningful_change_only = true` |
| No-ratchet outcome | Usually implicit unless written explicitly | Same | Same | `rules.allow_no_change = true` |
| Keep vs revert | Usually implemented through git/file diffs and operator policy | Same | Same | `rules.keep_only_measured_improvements = true` |
| Support-sync ordering | Easy to violate unless stated | Same | Same | `rules.support_sync_after_core_win = true` |
| Route-outs | Must be made explicit so hosted eval / ML autoresearch / direct implementation are not conflated | Same | Same | `rules.route_out_when_boundary_crossed = true` |

## Hooks
| Lifecycle | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|-----------|---------------|-------------|---------------|--------------|
| Pre-run | Read target + support surfaces; decide packet | Same | Same | `hooks.pre_run = inspect_target -> choose_packet -> decide_if_ratchet_is_justified` |
| Pre-mutation | Write charter and baseline copy | Same | Same | `hooks.pre_mutation = freeze_harness -> record_experiment_0` |
| Post-mutation | Rerun same validators and compare | Same | Same | `hooks.post_mutation = rerun_harness -> keep_or_revert` |
| Post-win | Sync evals/compact/README/setup/manifests if boundary changed materially | Same | Same | `hooks.post_win = support_sync_if_needed` |
| Finalize | Write append-only results and final report | Same | Same | `hooks.finalize = append_log -> report_keep_revert_or_no_change` |

## Platform Gaps
- None of Claude / Codex / Gemini natively provide a first-class repo-local `baseline already passes, stop here` control. That rule must live in the skill/workflow contract.
- All three can run or assist with evaluations, but append-only git-visible keep/revert history is still external to the model platform.
- Hosted eval tools integrate with these agents as route-outs, yet the decision to avoid unnecessary mutation remains a repo-local policy problem.
- The practical abstraction layer for this skill is therefore not vendor-specific tooling. It is a portable contract:
  - **settings:** frozen inputs and budget,
  - **rules:** allow `no ratchet justified`, keep one change at a time, do support-sync later,
  - **hooks:** baseline check before mutation, compare after mutation, append-only final log.
