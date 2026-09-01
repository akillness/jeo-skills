# Troubleshooting and Extension

## Diagnose by layer

Identify the layer before changing anything. Most reports are setup, not bugs.

### `Couldn't find a 'pages' directory`

Next.js cannot see `app/`. Either the command ran outside the repo root, or the
checkout is incomplete.

```bash
pwd && ls app package.json next.config.mjs
ls packages/Vibe-Workflow packages/Open-Poe-AI packages/Open-AI-Design-Agent
```

Empty submodule directories → `npm run setup`.

### Empty submodule directories

Cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
npm run setup
```

### Blank studio, or missing component exports

`npm install` ran but `npm run build:packages` did not. The workspaces
(`studio`, `workflow-builder`, `ai-agent`, `design-agent`) must be built before
either dev script works.

```bash
npm run build:packages   # or npm run setup for the full sequence
```

### 401 / "Unauthorized" on generation

In order of likelihood:

1. The key **name** was pasted instead of the key **value**.
2. No key entered — check the API key modal.
3. Key revoked or out of credits — verify in the MuAPI console.
4. A reverse proxy is stripping the `x-api-key` header.

Never print the key while debugging. Confirm presence and length, not content.

### Model missing from the picker

Studios switch model sets by input state: Image Studio shows t2i models with no
reference image and i2i models once one is uploaded; Video Studio does the same
for t2v/i2v. A "missing" model is usually in the other mode.

If it is genuinely absent, verify against source instead of the README:

```bash
python3 .agent-skills/open-generative-ai/scripts/audit-ogai.py models \
  --repo /path/to/Open-Generative-AI --endpoint nano-banana --format json
```

### Desktop app will not launch

macOS Gatekeeper, Windows SmartScreen, or Ubuntu AppArmor — see
[install and self-host](install-and-self-host.md). Launch from a terminal to see
the real error; the app logs engine and download failures to the process console.

### Local generation is very slow

sd.cpp fell back to CPU. Verify Metal/CUDA linkage — see
[local inference](local-inference.md).

### Docker container unreachable

`docker-compose.yml` publishes `3001:3000`. Use `http://localhost:3001`.

### Upload rejected

`isBlockedFileType` rejects HTML, SVG, and executables by design, and
`validateUploadProxyTarget` rejects private/reserved IPs and non-allowlisted
hosts. Convert to a supported media format, or set
`UPLOAD_PROXY_ALLOWED_HOSTS` deliberately. Do not weaken either guard.

### Multi-image model ignores some images

Each model declares its own maximum (14 for Nano Banana 2 Edit, 10 for several
others, 2–3 for some Wan/Qwen edits). Extra images beyond the cap are dropped.
Check the model entry rather than assuming a global limit.

## Repository layout

```
Open-Generative-AI/
├── app/                       # Next.js App Router
│   ├── api/                   # proxy + dedicated route handlers
│   ├── agents/  studio/  workflow/  assistant/
│   └── layout.js  page.js
├── components/                # StandaloneShell, ApiKeyModal
├── electron/
│   ├── main.js  preload.js
│   └── lib/                   # localInference*, wan2gp*, modelCatalog
├── packages/
│   ├── studio/                # shared React library — the real app
│   │   └── src/
│   │       ├── index.js       # studio exports
│   │       ├── models.js      # 354 model definitions (generated)
│   │       ├── muapi.js       # API client
│   │       └── components/    # *Studio.jsx
│   ├── Vibe-Workflow/         # submodule
│   ├── Open-Poe-AI/           # submodule
│   └── Open-AI-Design-Agent/  # submodule
├── src/lib/uploadProxyTarget.js
├── middleware.js              # security headers + MuAPI rewrites
├── models_dump.json           # source for models.js
└── docker-compose.yml  Dockerfile  next.config.mjs
```

`packages/studio` is also consumed by the hosted muapi.ai build, so changes to
`models.js` affect both.

## Extending

### Adding or correcting a model

`packages/studio/src/models.js` carries the header
`// Auto-generated from models_dump.json`. Hand-edits are at risk of being
overwritten by the next regeneration — check whether `models_dump.json` is the
real upstream source before editing, and prefer changing that.

An entry declares `id`, `name`, `endpoint`, and an `inputs` map with per-field
`type`, `title`, `enum`, and `description`. Add to the array matching the
modality (`t2iModels`, `i2vModels`, …) — placement determines which studio and
which input mode surfaces it.

After any change, re-count and confirm the endpoint resolves:

```bash
python3 .agent-skills/open-generative-ai/scripts/audit-ogai.py models \
  --repo . --endpoint <new-endpoint-id> --format json
```

### Adding a studio component

Add `packages/studio/src/components/<Name>Studio.jsx`, export it from
`packages/studio/src/index.js`, and register the tab in
`components/StandaloneShell.js`. Rebuild with `npm run build:studio`. A component
that is not exported from `index.js` silently never renders.

### Workflow nodes

The node-based workflow builder lives in the `Vibe-Workflow` submodule. Changes
belong in that repository, not here — a commit against the parent repo will be
lost on the next submodule update.

### Contributing

Work from a pinned commit, run `npm run build` and `npm run lint`, and state
whether an artifact was merely built or actually installed. Preserve the MIT
notice. Submodules carry their own licenses — do not relicense their content by
vendoring it.
