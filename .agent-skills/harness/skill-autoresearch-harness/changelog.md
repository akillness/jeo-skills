# skill-autoresearch changelog: harness

## Experiment 0 — baseline

Score: 12/15 (80%)
Change: none (baseline)
Reasoning: initial scoring of original SKILL.md
Result: E1–E4 all pass across 3 test inputs. E5 fails on all 3: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 appears only in the intro header, not in any step instruction. Agents following the step-by-step workflow skip the header and never surface the env var in their output.
Remaining failures: E5 on all 3 workflow test inputs

## Experiment 1 — keep

Score: 15/15 (100%)
Change: Added `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` reminder to Step 5 Integration & Orchestration
Reasoning: Step 5 is where the orchestration workflow is defined and where the env var is most actionable. Adding it here ensures it appears in the generated output whenever an agent team is being created.
Result: E5 now passes all 3 workflow test inputs. No regressions on E1–E4.
Remaining failures: none
