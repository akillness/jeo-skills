# Firebase CLI modes and routing

## What `firebase-cli` owns

Use `firebase-cli` when the request is primarily about operating Firebase from the terminal:
- install/update `firebase-tools`
- authenticate the CLI
- initialize `firebase.json` / `.firebaserc`
- run emulators
- deploy Hosting / Functions / rules / App Hosting
- manage preview channels, aliases, and deploy targets
- run Firebase admin/data commands (auth import/export, Remote Config, Extensions, App Distribution, Data Connect CLI commands)

## Decision table

| If the user wants… | Use | Why |
|---|---|---|
| Firebase project setup, aliases, Hosting/App Hosting deploys, or emulator commands | `firebase-cli` | Firebase platform/operator work |
| Flow/tool/RAG/eval orchestration in the Firebase ecosystem | `genkit` | Backend AI workflow layer, not CLI operations |
| Direct Gemini feature wiring inside the app/client SDK | `firebase-ai-logic` | App/client integration layer |
| Auth architecture choice (hosted auth vs sessions/JWTs vs enterprise SSO) | `authentication-setup` | Product-auth design question |
| Schema/index design and staged data-model evolution | `database-schema-design` | Storage-modeling question |
| Generic preview/staging/prod rollout strategy across providers | `deployment-automation` | Provider-agnostic release design |

## Mode selection inside this skill

1. **Install / auth** — missing CLI, stale CLI, local login, CI credentials
2. **Bootstrap / config** — `firebase init`, aliases, targets, repo config
3. **Local emulators** — local runtime, persistence, seed data, tests
4. **Deploy / release** — selective deploys, preview channels, App Hosting rollout, CI execution
5. **Admin / data ops** — auth import/export, Remote Config rollback, App Distribution, Extensions, targeted cleanup

## Common route-out mistakes to avoid

- Do not keep `firebase-cli` active when the real request became “design a Genkit flow”
- Do not turn Firebase CLI questions into generic security or auth architecture advice
- Do not let Hosting/App Hosting deploy work absorb broader provider-agnostic rollout planning
- Do not treat command reference lookup as a substitute for choosing the right operating mode first
