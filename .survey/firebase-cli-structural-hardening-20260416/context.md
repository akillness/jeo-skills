# Context: firebase-cli structural hardening

## Workflow Context
This lane appears when a user needs to operate Firebase itself from the terminal: install the CLI, authenticate, initialize project config, run the Emulator Suite, deploy Hosting / Functions / rules, manage preview channels, or perform Firebase admin tasks.

In the repo, `firebase-cli` is the Firebase platform/operator anchor, while adjacent skills already own narrower concerns:
- `firebase-ai-logic` = app/client integration and production controls
- `genkit` = backend AI workflow orchestration
- `firebase-cli` = project/bootstrap/deploy/admin operations for Firebase itself

The current `firebase-cli/SKILL.md` is 419 lines and still reads like a command encyclopedia. That creates a mismatch with the repo’s newer maintenance pattern: routing-first `SKILL.md`, focused `references/`, explicit route-outs, and evals that reflect decision modes instead of raw command recall.

Cross-domain scan for this run:

| Domain | Representative skill | Current state | Why not the best target now |
|------|----------------|-------------|------------------------------|
| CLI / developer workflow | `firebase-cli` | 419-line front door; no prior modernization query in wiki | **Chosen**: biggest unmodernized high-utility anchor in the scan |
| Web / fullstack | `authentication-setup` | already modernized in wiki | Better to avoid reopening a recently clarified lane |
| Product / ops | `task-planning` | already modernized in wiki | Not the best bounded win this hour |
| Marketing / GTM | `marketing-automation` | already canonicalized and supported | Lower structural urgency than `firebase-cli` |
| Game development | `bmad-gds` | already modernized and supported | Lower structural urgency than `firebase-cli` |

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Fullstack app developer | Bootstrap Firebase locally, wire deploy targets, run emulators | Intermediate |
| Backend / platform engineer | Set up CI/CD, service-account auth, selective deploys, preview environments | Intermediate–Advanced |
| Mobile / web product team | App Distribution, project aliases, Hosting/App Hosting rollout | Intermediate |
| Agent maintaining a repo skill catalog | Route Firebase questions to the right skill without overlapping `genkit` / client-integration lanes | Advanced |

## Current Workarounds
1. Read the giant `SKILL.md` sequentially and manually extract the few commands relevant to the current job.
2. Fall back to `references/commands.md`, which is comprehensive but even more command-centric.
3. Infer boundaries ad hoc from wiki notes or adjacent skills (`genkit`, `firebase-ai-logic`) rather than from the skill’s own front door.
4. Use scripts for install/deploy/emulators, but without a short decision layer explaining when each script is the right move.

## Adjacent Problems
- Boundary blur with `genkit` and `firebase-ai-logic` can cause Firebase platform operations to mix with backend AI workflow design or client-side integration work.
- Newer Firebase CLI surfaces such as App Hosting, Data Connect, and `firebase init genkit` increase scope pressure on a skill that still presents itself mostly as a flat command list.
- CI/CD auth guidance needs to stay explicit because deprecated token patterns still appear in older examples.
- The repo’s graph maintenance now favors high-degree anchor cleanup over adding wrapper skills, so this is better solved by upgrading `firebase-cli` in place.

## User Voices
> “The Firebase Command Line Interface (CLI) Tools can be used to test, manage, and deploy your Firebase project from the command line.” — firebase-tools README (GitHub raw primary-source retrieval)  
> Source: https://raw.githubusercontent.com/firebase/firebase-tools/master/README.md

> “The Firebase CLI (`firebase-tools`) manages your Firebase project from the terminal: deploy, emulate, import/export data, manage users, configure services, and automate CI/CD.” — current repo skill front door  
> Source: `.agent-skills/firebase-cli/SKILL.md`

> “Firebase App Hosting is a framework that provides serverless hosting for modern, full-stack and AI web apps.” — Firebase App Hosting docs (browser/title retrieval)  
> Source: https://firebase.google.com/docs/app-hosting
