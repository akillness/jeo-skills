---
name: firebase-cli
description: >
  Operate Firebase from the terminal with `firebase-tools`: install/auth the CLI,
  bootstrap `firebase.json` / `.firebaserc`, run the Emulator Suite, deploy Hosting /
  Functions / rules / App Hosting, manage preview channels, and handle Firebase admin
  tasks like auth import/export, Remote Config, App Distribution, and Extensions.
  Use when the job is Firebase platform/project operation through the CLI. Triggers on:
  firebase deploy, firebase init, firebase emulators, firebase hosting, firebase functions,
  firebase firestore, firebase database, firebase auth import, firebase remote config,
  firebase app distribution, firebase extensions, firebase apphosting, firebase dataconnect,
  firebase cli, firebase-tools, deploy firebase, firebase preview channel, firebase login,
  firebase use, firebase target apply. Route backend AI workflow orchestration to `genkit`
  and direct in-app SDK integration to `firebase-ai-logic`.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
metadata:
  tags: firebase, firebase-cli, firebase-tools, deploy, hosting, functions, firestore, database, emulators, auth, remote-config, app-distribution, extensions, apphosting, dataconnect
  version: "1.1"
  source: https://firebase.google.com/docs/cli
  license: Apache-2.0
---

# firebase-cli — Firebase platform operator

> **Keyword**: `firebase` · `firebase deploy` · `firebase init` · `firebase emulators`
>
> Use this skill when the center of gravity is **Firebase platform/project operation through the CLI**.

## When to use this skill

- Install or update `firebase-tools`, choose an auth path, and verify the CLI can operate the target project
- Bootstrap Firebase config in a repo with `firebase init`, `.firebaserc`, aliases, targets, and deploy surfaces
- Run the Firebase Emulator Suite for local development, persistence, and test execution
- Deploy or promote Hosting, Functions, rules, Remote Config, Extensions, or App Hosting through the CLI
- Manage preview channels, project aliases, selective deploys, and CI/CD auth for Firebase operations
- Perform Firebase admin/data tasks such as auth import/export, App Distribution, Remote Config rollback, and extension management

## When not to use this skill

- The main job is **backend AI workflow orchestration, tools, flows, RAG, evals, or observability** inside Firebase / Google AI products → use `genkit`
- The main job is **direct app/client SDK integration** for Gemini-powered in-app features → use `firebase-ai-logic`
- The main job is **auth stack choice and product auth architecture** rather than Firebase CLI execution → use `authentication-setup`
- The main job is **schema/index design** rather than Firebase CLI commands → use `database-schema-design`
- The main job is **generic rollout strategy across providers** instead of Firebase-specific operator commands → use `deployment-automation`

## Instructions

### Step 1: Pick the operating mode

Start by routing the request into one of these modes:

| Mode | Use when | Primary support |
|------|----------|-----------------|
| Install / auth | CLI missing, outdated, or blocked on credentials | `scripts/install.sh`, `references/install-auth-and-bootstrap.md` |
| Bootstrap / config | Need `firebase init`, aliases, targets, or repo config layout | `references/install-auth-and-bootstrap.md` |
| Local emulators | Need local Firebase runtime, persistence, or test harness | `scripts/emulators.sh`, `references/emulator-and-release-workflows.md` |
| Deploy / release | Need scoped deploys, preview channels, App Hosting rollout, or CI execution | `scripts/deploy.sh`, `references/emulator-and-release-workflows.md` |
| Admin / data ops | Need auth import/export, Remote Config, App Distribution, Extensions, or Data Connect commands | `references/admin-and-data-operations.md` |
| Unsure / mixed job | Need help deciding whether this is Firebase CLI vs adjacent lane work | `references/modes-and-routing.md` |

### Step 2: Verify prerequisites before changing anything

1. Confirm the CLI exists and capture the version: `firebase --version`
2. Confirm the runtime is new enough for current `firebase-tools` releases:
   - npm install path requires **Node.js 20+**
   - standalone installer is macOS/Linux only
3. Check authentication path:
   - local interactive work → `firebase login`
   - CI/non-interactive work → service account credentials via `GOOGLE_APPLICATION_CREDENTIALS`
4. Inspect project config before deploys or emulator work:
   - `firebase.json`
   - `.firebaserc`
   - any target-specific directories (`functions/`, hosting output dir, rules/index files)

### Step 3: Run the smallest workflow that answers the request

#### Mode A — Install / auth
- Install or update via `bash scripts/install.sh`
- Prefer npm install when Node.js 20+ is available: `npm install -g firebase-tools`
- Use browser OAuth locally with `firebase login`
- In CI, prefer service-account credentials over deprecated `--token` / `FIREBASE_TOKEN`

#### Mode B — Bootstrap / config
- Use `firebase init` for the exact surfaces needed instead of turning on everything blindly
- Set/inspect aliases with `firebase use` and `firebase use --add`
- Use deploy targets when multiple Hosting sites, DB instances, or buckets exist
- Record which Firebase features belong in this repo and which belong in adjacent skills

#### Mode C — Local emulators
- Use `bash scripts/emulators.sh --persistent` for durable local data
- Use `firebase emulators:exec "<test command>"` for one-shot test runs
- Start only the emulators you need with `--only auth,firestore,functions`
- Keep emulator config and seed-data expectations explicit in the repo

#### Mode D — Deploy / release
- Scope deploys with `--only` or `--except`
- Prefer preview channels for reviewable Hosting changes before production deploys
- For App Hosting, treat backend creation/rollouts as an operator workflow, not a generic web deploy shortcut
- In CI, use `--non-interactive` and explicit credentials
- Verify what changed after deploy instead of assuming success from the command exit alone

#### Mode E — Admin / data ops
- Use the CLI for auth import/export, Remote Config versioning/rollback, App Distribution, Extensions, and targeted cleanup tasks
- Be explicit about destructive commands like `firestore:delete --recursive --force`
- For large/import-sensitive jobs, capture the exact hash/config/version parameters before execution

### Step 4: Route out aggressively when the job changed shape

Use `firebase-cli` as the operator anchor, but hand off when the work is really about:
- app/client Gemini SDK feature wiring → `firebase-ai-logic`
- flow/tool/RAG/eval orchestration → `genkit`
- auth-model product decisions → `authentication-setup`
- schema/index modeling → `database-schema-design`
- provider-agnostic rollout strategy → `deployment-automation`

### Step 5: Verify the outcome

For every mode, verify the smallest truthful artifact:
- install/auth → `firebase --version`, `firebase login:list`, or successful auth-bound command
- bootstrap/config → `firebase.json`, `.firebaserc`, target mappings
- emulators → running ports, imported/exported data directory, successful test run
- deploy/release → deployed target list, preview URL, or post-deploy smoke check
- admin/data ops → exported/imported file, version rollback confirmation, tester/group update, or extension status

## Examples

### Example 1: Bootstrap a Firebase repo cleanly

```text
Prompt: "Set up Firebase in this repo for Hosting + Functions + preview channels"

Mode:
- Bootstrap / config

Likely actions:
- bash scripts/install.sh
- firebase login
- firebase init hosting functions
- firebase use --add
- firebase target:apply ...   # if multi-site is needed
```

### Example 2: Local emulator workflow with persistence

```text
Prompt: "Run auth + firestore emulators locally and keep the data between runs"

Mode:
- Local emulators

Likely actions:
- bash scripts/emulators.sh --only auth,firestore --persistent
- or firebase emulators:start --only auth,firestore --import ./emulator-data --export-on-exit
```

### Example 3: Firebase release / preview flow

```text
Prompt: "Deploy Hosting to a reviewable staging channel, then ship production after approval"

Mode:
- Deploy / release

Likely actions:
- bash scripts/deploy.sh --channel staging --expires 7d
- firebase hosting:channel:open staging
- firebase deploy --only hosting
```

### Example 4: Route AI workflow work away from this skill

```text
Prompt: "Build a Firebase RAG flow with tools, evals, and observability"

Decision:
- Route to `genkit`
- Keep `firebase-cli` only for operator tasks like local setup or deploy wiring if needed
```

## Best practices

1. **Prefer workflow selection over command dumping** — choose the mode first, then the commands
2. **Use service accounts in CI** — treat `--token` / `FIREBASE_TOKEN` as deprecated escape hatches, not the default path
3. **Scope deploys tightly** — `--only` and preview channels reduce accidental blast radius
4. **Keep repo config explicit** — `firebase.json`, `.firebaserc`, and target mappings should match the repo’s real deploy surfaces
5. **Use persistence intentionally in emulator work** — import/export directories make local debugging and tests repeatable
6. **Separate Firebase operator work from app/AI logic work** — route to `firebase-ai-logic` or `genkit` when the CLI is no longer the main job
7. **Treat destructive admin commands as high-risk** — confirm paths, versions, and resource IDs before delete/rollback/import operations

## References

- [Mode selection and route-outs](references/modes-and-routing.md)
- [Install, auth, and bootstrap guide](references/install-auth-and-bootstrap.md)
- [Emulator and release workflows](references/emulator-and-release-workflows.md)
- [Admin and data operations](references/admin-and-data-operations.md)
- [Full command reference](references/commands.md)
- [Scripts](scripts/) — `install.sh`, `deploy.sh`, `emulators.sh`
- [Firebase CLI reference](https://firebase.google.com/docs/cli)
- [firebase-tools GitHub](https://github.com/firebase/firebase-tools)
