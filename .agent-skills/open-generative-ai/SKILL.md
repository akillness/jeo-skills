---
name: open-generative-ai
description: >
  Operate Anil-matcha/Open-Generative-AI, the MIT-licensed Next.js and Electron
  studio that fronts MuAPI image, video, audio, lip sync, workflow, and agent
  models with optional local sd.cpp and Wan2GP inference. Route one request to
  fit check, desktop release install, source or Docker self-host, API key and
  provider configuration, local inference setup, model catalog verification,
  troubleshooting, or upgrade. Use when the user names Open Generative AI,
  Anil-matcha/Open-Generative-AI, its Image, Video, Cinema, Lip Sync, Workflow,
  or Design Agent studios, `npm run electron:dev`, MuAPI keys, sd.cpp, or
  Wan2GP. Require confirmation before installer execution, unsigned-binary
  Gatekeeper or SmartScreen overrides, AppArmor sysctl changes, credential
  entry, multi-gigabyte model downloads, public deployment, or paid generation.
  Route provider-neutral programmatic video pipelines to `video-production` and
  local desktop video editing to `opencut`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Desktop releases target macOS arm64/x64, Windows x64, and Linux
  AppImage/DEB. Source builds need Node.js 18+, npm workspaces, and recursive
  git submodules. Bundled sd.cpp runs on Metal, CUDA, Vulkan, or ROCm; Wan2GP
  is a separate user-run CUDA/ROCm Gradio server. Hosted model generation
  requires a paid MuAPI access key.
license: MIT
metadata:
  platforms: Claude, ChatGPT, Gemini, Codex, Cursor, Cline
  version: "1.0"
  source: https://github.com/Anil-matcha/Open-Generative-AI
---

# Open Generative AI Studio

Operate Open Generative AI as a named product: a self-hostable generative-media
front end, not a general "make me a video" request handler. The application is a
Next.js 14 App Router monorepo that also ships as an Electron desktop app. Almost
every model it exposes is a **remote MuAPI call billed to the operator's own key**;
only the sd.cpp and Wan2GP paths run locally. That split decides cost, privacy,
and failure modes, so establish it before any install step.

This skill was audited against upstream commit
`5482a777047c0df189eef989ff994d0d7a1d2874` (2026-08-29), whose `package.json`
declares version `2.0.0` and MIT license. The README's own download table still
advertises v1.0.9 while the latest GitHub release is v2.0.0, and its model counts
disagree with the shipped catalog. See
[source audit and upstream drift](references/source-audit-and-upstream-drift.md).

## When to use this skill

- Decide whether Open Generative AI fits a media workflow before installing it.
- Choose between the desktop release, a source checkout, and the Docker path.
- Install, verify, upgrade, or remove a desktop build on macOS, Windows, or Linux.
- Configure the MuAPI access key, proxy routes, and self-host network exposure.
- Set up bundled sd.cpp local inference or attach a remote Wan2GP server.
- Verify which models actually exist in the shipped catalog before promising one.
- Diagnose submodule, workspace build, blank-page, port, upload, or key failures.
- Extend the studio: add a model entry, a studio component, or a workflow node.

Do not use this skill for neighboring jobs:

- Build a provider-neutral or code-first video pipeline: use `video-production`.
- Edit video locally in an open-source NLE: use `opencut`.
- Drive a hosted generative-media vendor API directly: use that vendor's skill,
  for example `higgsfield-generate` or `elevenlabs-tts`.
- Design a generic reproducible dev environment: use `system-environment-setup`.
- Harden an unrelated web app: use `security-best-practices`.
- Triage supplied build or runtime logs first: use `log-analysis`.

### Content responsibility boundary

Upstream markets the project as having "no content filters." That is a statement
about the software's defaults, not a grant of authority. This skill covers
installing, configuring, running, debugging, and extending the application. It
does not help produce sexual content involving minors, non-consensual intimate
imagery, impersonation or deceptive deepfakes of real people, or fraudulent
material — removing a vendor filter does not remove the operator's legal duty.
Note that duty once, plainly, when the deployment is discussed; do not moralize
on every install step.

## Instructions

### Step 0: Choose exactly one operating mode

| Mode | Use it for | Default boundary |
|---|---|---|
| `orient` | product fit, architecture, cost model, version truth | read-only |
| `install` | desktop release choice, verification, upgrade, removal | plan before execution |
| `selfhost` | source checkout, workspace build, Docker, exposure | never expose by default |
| `configure` | MuAPI key, proxy behavior, storage, upload policy | never print key values |
| `localai` | sd.cpp engine and weights, Wan2GP server attach | confirm large downloads |
| `catalog` | which models exist, endpoints, capabilities, counts | verify against source |
| `operate` | run studios, diagnose failures, read logs, upgrade | observe before changing |
| `extend` | add models, studios, workflow nodes, contributions | pin commit and test |

Installing an unsigned binary, entering a paid credential, downloading multi-GB
weights, and exposing a self-host to a network are four separate authority
changes. Do not roll them into one implied approval.

### Step 1: Establish version truth before quoting anything

Upstream prose drifts from upstream code. Derive facts in this order: release
API, then `package.json`, then source, and only then the README.

```bash
python3 .agent-skills/open-generative-ai/scripts/audit-ogai.py source \
  --repo /path/to/Open-Generative-AI \
  --expect-commit 5482a777047c0df189eef989ff994d0d7a1d2874 \
  --format json
```

The auditor reads only Git metadata and targeted text files. It never runs
`npm`, builds, downloads a model, starts the app, or makes a network request.
`WARN` is expected at the audited pin because README claims genuinely disagree
with the tree. Read each warning instead of suppressing it.

### Step 2: Pick the real product form

| Form | Command | Gets local inference | Notes |
|---|---|---|---|
| Desktop release | download installer | yes (sd.cpp, Wan2GP) | unsigned; OS will block first launch |
| Desktop from source | `npm run electron:dev` | yes | needs submodules + workspace build |
| Web from source | `npm run dev` | no | Next.js on port 3000 |
| Docker | `docker compose up` | no | publishes host port 3001 → container 3000 |
| Hosted muapi.ai | none | no | vendor-run, outside this skill's control |

Local inference exists **only in the desktop app**. A web or Docker deployment
always calls MuAPI, so "self-hosted" there means self-hosted UI, not self-hosted
models — say so explicitly when a user's goal is privacy or offline use.

See [install and self-host](references/install-and-self-host.md) for the release
matrix, the unsigned-binary prompts on each OS, and the submodule-aware source
build.

### Step 3: Treat first-launch security prompts as a decision, not a formality

Releases are not notarized or code-signed. Upstream's fix is to weaken a local
protection, so surface the tradeoff and let the user choose:

- macOS: `xattr -cr` strips the quarantine flag from the app bundle. Confirm the
  download source and checksum first; never run it on a path the user did not name.
- Windows: SmartScreen "Run anyway" bypasses reputation checking for that installer.
- Ubuntu 24.04+: the AppImage needs the user-namespace sandbox. Prefer the `.deb`,
  which ships a scoped AppArmor profile. Setting
  `kernel.apparmor_restrict_unprivileged_userns=0` relaxes the sandbox
  **machine-wide** — treat a persistent `sysctl.d` entry as a security change
  requiring explicit approval, not a troubleshooting step.

### Step 4: Configure credentials and exposure without leaking either

The MuAPI access key is entered in the UI and held in browser `localStorage`,
then sent as `x-api-key`. Consequences to state plainly:

1. Paste the generated key **value**, not its name or label — a frequent failure.
2. `localStorage` is readable by any script on the origin, and the shipped CSP
   allows `'unsafe-inline'` and `'unsafe-eval'` in `script-src`. Any XSS on the
   deployment is key disclosure. Do not put this UI on a shared or public origin.
3. Never echo, log, screenshot, or commit the key. Report presence, not value.
4. Middleware rewrites `/api/v1`, `/api/app`, and `/api/workflow` to
   `api.muapi.ai`. A reachable deployment is a proxy to a paid API; keep it on
   loopback or behind authentication.
5. Generation is billed to the key owner. Confirm before any run that spends
   credits, especially batch or video work.

See [configuration and security](references/configuration-and-security.md).

### Step 5: Set up local inference only with explicit download consent

Two independent engines, chosen per machine:

- **sd.cpp** — bundled, installed from Settings → Local Models. Image-only:
  SD 1.5 variants, SDXL, Z-Image. Weights are 2–7 GB plus a shared 2.4 GB text
  encoder and 335 MB VAE for Z-Image. On an 8 GB Apple Silicon machine Z-Image
  is documented to hang the system — steer to SD 1.5 there.
- **Wan2GP** — *not bundled*. The user runs a Gradio server on a CUDA/ROCm GPU;
  the app is only an HTTP client. There is no Apple Silicon path for the server.

Override the storage root with `OPEN_GENERATIVE_AI_LOCAL_AI_DIR` before launch
when the default app-data directory is on a small disk; the app then creates
`bin/`, `models/`, and `tmp/` under it. Confirm total download size and target
disk before starting.

See [local inference](references/local-inference.md).

### Step 6: Verify a model exists before promising it

Model definitions live in `packages/studio/src/models.js`, generated from
`models_dump.json`. Counts in the README are marketing, not inventory: at the
audited pin the file defines **354 model entries** across eight arrays, while the
README variously claims 200+, 400+, 420+, and 500+.

```bash
python3 .agent-skills/open-generative-ai/scripts/audit-ogai.py models \
  --repo /path/to/Open-Generative-AI --format json
```

Confirm the endpoint identifier and its declared inputs before telling a user a
specific model, resolution, duration, or reference-image count is available.

### Step 7: Diagnose with the failure's actual layer

Match the symptom to the layer before changing anything:

| Symptom | Most likely layer |
|---|---|
| `Couldn't find a 'pages' directory` | wrong cwd, or submodules absent |
| Empty `packages/Vibe-Workflow` or `packages/Open-Poe-AI` | submodules not initialized |
| Blank studio, missing exports | `npm run build:packages` skipped |
| 401 on generation | key absent, name pasted instead of value, wrong header |
| Model missing from picker | catalog mismatch, or mode switch (t2i vs i2i) |
| Desktop app will not launch | unsigned-binary block, or AppArmor userns |
| Local model absurdly slow | sd.cpp fell back to CPU — check Metal linkage |
| Docker reachable on 3000 | wrong port; compose publishes 3001 |

`npm install` alone is insufficient: `npm run setup` initializes submodules,
installs, and builds workspace packages. Most "broken checkout" reports are a
skipped setup step.

See [troubleshooting and extension](references/troubleshooting-and-extension.md).

### Step 8: Verify the outcome you actually claimed

- **install**: exact release tag, asset, checksum, launch, and removal path;
- **selfhost**: which entry point runs, bound interface, port, and exposure;
- **configure**: key accepted, one cheap generation succeeded, no key echoed;
- **localai**: engine present, model loaded, GPU (not CPU) path confirmed;
- **catalog**: endpoint verified in source, not inferred from the README;
- **extend**: pinned commit, build passes, and whether it was built or installed.

State which layer you verified. "It should work" is not verification.

## Examples

### Example 1: Fit check before install

Request: "Is Open Generative AI a free replacement for our video subscriptions?"

Use `orient`. The app is MIT and free; the models are not. Hosted generation
bills a MuAPI key per request, and local inference is desktop-only and image-only
unless the user runs a separate GPU server. Compare that against their volume
before recommending anything.

### Example 2: Privacy-driven self-host

Request: "Set it up on our server so nothing leaves our network."

Use `selfhost` and correct the premise first: server deployments proxy every
generation to `api.muapi.ai`. Only the desktop app with sd.cpp or an internal
Wan2GP server keeps inference local. Then scope the real target.

### Example 3: Mac install that will not open

Request: "Downloaded the DMG, macOS says it's damaged."

Use `install`. This is Gatekeeper on an unsigned build. Confirm the download came
from the project's releases page, explain that `xattr -cr` removes the quarantine
attribute, name the exact path, and let the user run it. Offer the
System Settings → Privacy & Security route as the no-terminal alternative.

### Example 4: Model that does not exist

Request: "Use Sora 2 at 4K for 30 seconds."

Use `catalog`. Check the endpoint and its declared inputs in `models.js` rather
than the README's category table. If the duration or resolution is not in the
model's enum, say so and offer a model that declares it.

## Best practices

1. **Derive versions from the API, never the README** — the download table is
   stale and the model counts contradict each other in three places.
2. **Count the catalog before promising a model** — `models.js` is the inventory;
   README category totals overstate several modalities.
3. **Separate "self-hosted UI" from "self-hosted models"** — only the desktop app
   with sd.cpp or an internal Wan2GP server keeps inference local.
4. **Treat each OS bypass as the user's decision** — quarantine clearing,
   SmartScreen overrides, and userns sysctl changes weaken real protections.
5. **Never print the key** — report presence and validity; `localStorage` plus an
   `unsafe-inline` CSP makes any disclosure permanent until rotated.
6. **Gate spend and disk explicitly** — generations bill the user's MuAPI key, and
   weights run to double-digit gigabytes.
7. **Run `npm run setup`, not `npm install`** — most "broken checkout" reports are
   uninitialized submodules or unbuilt workspaces.
8. **State the layer you verified** — installed, built, reachable, or generating
   are four different claims.

## References

- [Source audit and upstream drift](references/source-audit-and-upstream-drift.md)
- [Install and self-host](references/install-and-self-host.md)
- [Configuration and security](references/configuration-and-security.md)
- [Local inference](references/local-inference.md)
- [Troubleshooting and extension](references/troubleshooting-and-extension.md)
- [Upstream repository](https://github.com/Anil-matcha/Open-Generative-AI)
- [Audited pin `5482a77`](https://github.com/Anil-matcha/Open-Generative-AI/commit/5482a777047c0df189eef989ff994d0d7a1d2874)
