# Solution Landscape: firebase-cli structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Current repo `firebase-cli` skill | One large front door + scripts + command reference | Broad coverage already exists; scripts and evals are present | Main `SKILL.md` is oversized and command-heavy; route-outs are too implicit | Best bounded move is to modernize in place |
| Official Firebase CLI docs | Primary command/documentation source | Canonical command coverage; current feature surface | Not tailored to repo boundaries or trigger wording | Source: https://firebase.google.com/docs/cli |
| `firebase-tools` README | Primary-source operational summary | Short statement of CLI scope; confirms current installation path and broader project role | Not structured as a router for this repo’s skill system | Source: https://raw.githubusercontent.com/firebase/firebase-tools/master/README.md |
| Firebase App Hosting docs | Product-specific operator context | Confirms App Hosting belongs in the Firebase operator lane | Does not define boundaries with repo-local AI/client skills | Source: https://firebase.google.com/docs/app-hosting |
| Adjacent repo skills (`genkit`, `firebase-ai-logic`) | Boundary relief via specialization | Already own backend AI workflow orchestration and app/client integration | Current `firebase-cli` front door does not route to them sharply enough | Use route-outs, not a new wrapper skill |

## Categories
- **Canonical primary sources**: Firebase CLI docs, `firebase-tools` README, App Hosting docs
- **Repo-local operator surface**: `firebase-cli` skill, scripts, evals, compact variant
- **Boundary companions**: `genkit`, `firebase-ai-logic`

## What People Actually Use
In practice, Firebase CLI work clusters into a handful of repeated workflows rather than “read all commands” behavior:
1. install/auth/bootstrap a Firebase project,
2. run emulators locally,
3. deploy a selected surface (Hosting / Functions / rules / App Hosting),
4. manage preview channels and CI/CD auth,
5. perform Firebase admin/data tasks.

The current repo packaging technically covers these, but the front door makes users hunt through examples instead of routing them to the right packet quickly.

## Frequency Ranking
1. Official Firebase CLI docs — canonical command reference and install flow
2. Current repo `firebase-cli` skill — reusable agent-facing operator surface, but needs structural cleanup
3. `firebase-tools` README — concise primary-source summary of CLI scope
4. App Hosting docs — important because Firebase now markets a broader modern/full-stack hosting surface
5. Adjacent repo skills — important for boundary control, not as replacements

## Key Gaps
- The skill still optimizes for command recall rather than workflow selection.
- The main `SKILL.md` should be smaller and route to focused references for install/auth, project bootstrap, emulators, deploy flows, and admin/data operations.
- Route-outs to `genkit` and `firebase-ai-logic` should be explicit at decision points, not implied by wiki knowledge.
- Existing evals are command-rich but should better reflect mode selection and boundary decisions.

## Contradictions
- Marketed/current scope keeps expanding (`apphosting`, `dataconnect`, `genkit`, broader platform operations), but the repo skill still presents the lane mostly as a flat command catalog.
- The repo’s maintenance standard prefers routing-first front doors with support packets, yet this skill still behaves like an all-in-one manual.

## Key Insight
The right move is not another Firebase wrapper. The right move is to harden `firebase-cli` into a routing-first Firebase operator anchor: keep broad Firebase platform ownership, shrink the front door, package the repeated workflows into focused references/scripts, and make the route-outs to `genkit` and `firebase-ai-logic` explicit so the Firebase lane reads cleanly again.
