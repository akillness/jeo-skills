# Context: oh-my-skills hourly survey

## Workflow Context
This run applied open-PR hard gate first, then appended new hourly survey outputs to the existing PR branch due to no-checks-reported blocker. Discovery used required lanes with stage recovery queries and recommendation gates. Provenance labels used: indexed snippet, direct page retrieval.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Approve/merge quality-gated hourly updates | advanced |
| Automation runner | Produce survey artifacts and quality reports | intermediate |

## Current Workarounds
1. Continue artifact generation on existing blocked PR branch.
2. Post deterministic blocker comments with CI bootstrap steps.

## Adjacent Problems
- Check infrastructure absent on PR branches blocks merge completion.
- Low-fit/no-signal lanes can degrade recommendation breadth.

## User Voices
- "development-first hard rule" and "no maintenance-only PRs" from run policy. — direct page retrieval
- "no checks reported means do not merge" from quality gate contract. — direct page retrieval
