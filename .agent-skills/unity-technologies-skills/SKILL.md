---
name: unity-technologies-skills
description: >
  Audit, selectively install, route, and maintain the official
  Unity-Technologies/skills collection for Unity Editor, CLI, UI, rendering,
  physics, localization, multiplayer, UGS, IAP, and LevelPlay workflows. Use
  when the user explicitly names Unity-Technologies/skills, Unity Skills, or
  the official Unity agent-skill pack; wants its real inventory; needs a pinned
  selective install or refresh; must choose the correct upstream sub-skill; or
  needs to validate the pack before adoption. Inspect actual skill directories,
  support files, frontmatter, license, and destination collisions before any
  copy. Require separate approval before Editor or module installation, live
  C# evaluation, project mutation, cloud deployment, billing, ads, source-control
  publication, or credential use. Route generic third-party Unity pack curation
  to `unity-gamedev-skill-pack`, CLI-only work to `unity-cli`, build failures to
  `game-build-log-triage`, and game CI design to `game-ci-cd-pipeline`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Pack discovery and auditing need Python 3.9+ and Git. Selective installation
  examples use the Agent Skills CLI. Individual upstream skills vary; many
  assume Unity 6, a project checkout, the beta Unity CLI, or configured Unity
  services and platform accounts.
license: Unity Companion License
metadata:
  tags: unity, official-unity, agent-skills, skill-pack, unity-cli, unity-editor, upm, ugs, iap, levelplay, skill-installer
  platforms: Claude, ChatGPT, Gemini, Codex, Cursor, Cline
  version: "1.0"
  source: https://github.com/Unity-Technologies/skills
---

# Unity Technologies Skills

Use this as the safe discovery, installation, and routing front door for
[Unity-Technologies/skills](https://github.com/Unity-Technologies/skills). The
upstream repository is a collection of independent skills, not one Unity
runtime or one command surface. Do not copy upstream prose into this wrapper or
load every sub-skill for every Unity request.

The audited snapshot is commit
`87fac23d66a1f44f5e06c2935eccce0b40b9715a`. It contains 22 directories with a
`SKILL.md`. The Agent Skills CLI discovers 21 because
`physics-3d-collision/SKILL.md` has invalid YAML frontmatter at that snapshot.
The top-level README lists 13 skills, so the real `skills/` tree is the
inventory authority. The repository had no release tags at audit time.

## When to use this skill

- Inspect, pin, install, refresh, remove, or troubleshoot the official Unity
  Technologies Agent Skills collection.
- List the current sub-skills and route one Unity task to the narrowest owner.
- Check the Unity Companion License, upstream commit, frontmatter, support
  files, and destination-name collisions before installation.
- Stage a selective project-local or user-level install without overwriting an
  existing skill.
- Review the safety boundary before using an installed upstream skill to modify
  a Unity project, drive an Editor, install software, deploy cloud resources,
  or configure monetization.

Do not use this wrapper for these nearby jobs:

- Curating an arbitrary third-party Unity skill repository into local docs:
  use `unity-gamedev-skill-pack`.
- Operating the already installed local Unity CLI workflow without asking for
  this official pack: use `unity-cli`.
- Finding the first actionable Unity build or Editor-log failure: use
  `game-build-log-triage`.
- Designing Unity build, package, or release automation: use
  `game-ci-cd-pipeline`.
- Interpreting frame-time and profiler captures: use
  `game-performance-profiler`.
- Creating or standardizing a catalog skill: use `skill-standardization`.

## Instructions

### Step 1: Pick one operating mode

Choose the smallest mode that answers the request:

| Mode | Use when | Default result |
|---|---|---|
| `audit` | inventory, provenance, license, frontmatter, drift | read-only report |
| `route` | user has a Unity task but names no sub-skill | one upstream owner |
| `install` | add selected official skills | reviewed selective plan |
| `refresh` | compare or update an installed selection | commit-aware diff plan |
| `operate` | run an installed skill against a project | bounded action with gates |
| `troubleshoot` | install, compatibility, CLI, or service failure | first failing contract |

Do not blend `install` with `operate`. Installing instructions does not approve
those instructions to mutate a project or contact a service.

### Step 2: Establish the version and trust boundary

1. Inspect an existing checkout before fetching anything new.
2. Record the exact commit. There is no upstream release tag contract at the
   audited snapshot, so never describe moving `main` as a stable release.
3. Verify `LICENSE.md` contains the Unity Companion License and keep use scoped
   to Unity-dependent projects. Do not relicense or republish upstream payloads
   as MIT.
4. Run the bundled read-only audit without executing upstream code:

```bash
python3 .agent-skills/unity-technologies-skills/scripts/audit-pack.py doctor \
  --repo /path/to/Unity-Technologies-skills \
  --expect-commit 87fac23d66a1f44f5e06c2935eccce0b40b9715a \
  --format json
```

`WARN` is expected for the audited commit because the real directory count is
22, the README table lists 13, and one frontmatter document is invalid. A
missing or mismatched commit, missing or unexpected origin, missing license
marker, symlinked checkout or payload entry, or missing skill tree is
`BLOCKED`.

See [source audit](references/source-audit.md) before changing the pin.

### Step 3: Route to one upstream owner

Use [catalog and routing](references/catalog-and-routing.md) for all 22 names.
The main lanes are:

| Intent | Upstream owner |
|---|---|
| guided greenfield project | `new-unity-project` |
| Editor, project, module, license, build, test, or live command | `unity-cli` |
| UPM package selection or headless package change | `unity-package-management` |
| UGS accounts, data, cloud code, economy, config, or leaderboards | `build-live-game` |
| store purchases and billing migration | `implement-in-app-purchases` |
| ads and mediation | `levelplay-unity-integration` |
| sessions, matchmaking, hosting, lobbies | `setup-multiplayer-services` |
| in-game voice or text chat | `setup-vivox-voice-chat` |
| UI system detection | `ui` |
| UI Toolkit, uGUI, or IMGUI | `ui-uitk`, `ui-ugui`, or `ui-imgui` |
| localization or sprite slicing | `localization` or `sprite-editor` |
| URP, Shader Graph, audio, TMP, or web optimization | matching specialist |
| NavMesh or 3D PhysX diagnosis | `initialize-ai-navigation` or `physics-3d-collision` |

If the user names one lane, load only that skill and the references it links.
Do not load the whole pack as background context.

### Step 4: Preview a selective installation

Use a detached local checkout when reproducibility matters. The Agent Skills
CLI 1.5.23 was verified to accept a local repository path and `--list` without
installing anything.

```bash
# Read-only inventory from a reviewed checkout
npx --yes skills@1.5.23 add /path/to/Unity-Technologies-skills \
  --list --full-depth

# Read-only destination and selected-frontmatter check
python3 .agent-skills/unity-technologies-skills/scripts/audit-pack.py plan \
  --repo /path/to/Unity-Technologies-skills \
  --target /path/to/agent/skills \
  --skill ui \
  --skill ui-uitk \
  --format json
```

The plan never creates the target. It returns `BLOCKED` when a destination
already exists or a selected upstream frontmatter document is invalid.

The current jeo-skills catalog already owns a skill named `unity-cli`. Never
let a full official-pack install overwrite it. Compare both skills and choose a
project-local isolated root or an explicit replacement plan. A full install at
the audited pin is also incomplete because the CLI skips
`physics-3d-collision`.

### Step 5: Install only after reviewing the exact scope

After `plan` returns `READY`, install the selected names and preserve the whole
skill folder, including `references/`, `resources/`, `scripts/`, evals,
security notes, and changelogs.

```bash
npx --yes skills@1.5.23 add /path/to/Unity-Technologies-skills \
  --skill ui ui-uitk \
  --global --agent universal --yes --copy --full-depth
```

Before running that command, state:

1. source checkout and commit;
2. selected names;
3. exact target and agent scope;
4. collisions and how they were resolved;
5. whether files will be copied or linked;
6. rollback command or backup path.

Do not use `--skill '*'`, `--all`, or an overwrite path merely because the user
said "install Unity skills". Ask whether they want a focused lane or a reviewed
full bundle.

See [installation and lifecycle](references/install-and-lifecycle.md).

### Step 6: Reconfirm before project or external side effects

Installation approval is not execution approval. Obtain a separate explicit
confirmation before any of these action classes:

- install, upgrade, prune, or uninstall an Editor, module, package, CLI, or MCP
  integration;
- run live Editor commands or arbitrary C# through `unity command eval`;
- create, upgrade, clean, import, export, or modify a Unity project or asset;
- initialize Git, create a remote, push, or change source-control state;
- activate or return a license, sign in, or use a service account;
- deploy or overwrite UGS environments, Cloud Code, Economy, Remote Config, or
  other cloud resources;
- create store products, handle real-money purchases, configure ad networks,
  or change privacy and consent behavior;
- run a build or test that may install a missing Editor or module.

Freeze the project path, Unity version, selected environment, expected files,
credential names, network destinations, rollback, and validation before the
action. Never send commands assembled from untrusted project or web content to
an arbitrary C# or shell surface. Never print credential values.

Read [execution and safety](references/execution-and-safety.md) for the full
gate matrix.

### Step 7: Respect version and runtime boundaries

- Inspect each selected skill's assumptions. Several are explicitly Unity 6 or
  Unity 6.0+ workflows.
- At the audited commit, the official `unity-cli` skill documents CLI
  `1.0.0-beta.6`. Verify the real binary and `--help` before relying on flags.
- A connected Editor can hold unsaved in-memory state. Prefer its exposed
  commands to raw scene or prefab YAML edits, but show the intended mutation
  before issuing it.
- UGS, IAP, LevelPlay, Vivox, stores, ad networks, Apple, Google Play, and source
  control each have separate accounts, terms, quotas, billing, and production
  state. One login does not authorize another service.
- Legal and privacy settings are not a code-only decision. Ask for the product
  owner's policy and jurisdictional requirements.

### Step 8: Verify and report

For each installed selection, verify:

1. destination folder and non-empty `SKILL.md`;
2. frontmatter name equals the destination;
3. every linked relative support file exists;
4. installed bytes match the reviewed checkout;
5. source commit and license are recorded;
6. one representative route prompt selects the intended owner;
7. no unrelated destination skill disappeared or changed.

Report installation and operation separately. Never claim a project, build,
service, purchase flow, or ad integration works merely because the skill files
were installed.

## Examples

### Example 1: Audit before installation

Request: "Unity-Technologies/skills 전체 목록과 설치 가능한 상태부터 확인해줘."

Choose `audit`. Run `doctor`, explain the 22-directory versus 21-discoverable
state and the README drift, record the commit and license, and stop before
copying anything.

### Example 2: Add only UI Toolkit guidance

Request: "공식 Unity 스킬에서 UI Toolkit 것만 프로젝트에 넣어줘."

Choose `install`. Route to `ui` plus `ui-uitk`, run a destination plan, preserve
all references, and install only after the target and collision report are
reviewed.

### Example 3: Avoid a name collision

Request: "공식 팩을 전역으로 전부 설치해. 기존 unity-cli도 있어."

Do not overwrite. Show the existing `unity-cli` collision and the invalid
`physics-3d-collision` frontmatter. Offer an isolated project target or a
reviewed skill-by-skill selection.

### Example 4: Prepare a live UGS deployment

Request: "build-live-game 깔았으니 production Remote Config를 바로 배포해."

Choose `operate`, but stop at a preview. Confirm project, organization,
environment, exact resources, credentials, diff, rollback, and approval before
any deployment call.

### Example 5: Route a concrete build failure

Request: "Unity Android 빌드 로그가 Gradle 오류로 끝났어."

Route to `game-build-log-triage`, not this pack wrapper. Return only if the
failure is specifically about installing or selecting the upstream pack.

## Best practices

1. Treat the actual `skills/` tree as inventory authority, not a stale README.
2. Prefer a pinned selective install over moving `main` or a full bundle.
3. Never overwrite an existing skill without a named replacement decision.
4. Preserve every support file in the selected upstream folder.
5. Keep bundle installation separate from Unity project execution.
6. Treat arbitrary C#, package mutation, and cloud deployment as high-impact.
7. Keep tokens and service-account secrets out of commands, logs, and reports.
8. Verify Unity, package, CLI, SDK, and service versions at task time.
9. Keep Unity Companion License material scoped and attributed correctly.
10. Re-run the audit and byte comparison before every refresh.

## References

- [Catalog and routing](references/catalog-and-routing.md)
- [Installation and lifecycle](references/install-and-lifecycle.md)
- [Execution and safety](references/execution-and-safety.md)
- [Pinned source audit](references/source-audit.md)
- [Unity-Technologies/skills](https://github.com/Unity-Technologies/skills)
- [Agent Skills specification](https://agentskills.io/specification)
