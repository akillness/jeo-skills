# Source Audit and Upstream Drift

Audited pin: `5482a777047c0df189eef989ff994d0d7a1d2874`, committed 2026-08-29
("Add drag-and-drop upload support across studio tools").

Everything below was read from the tree or the GitHub API at that pin. Re-derive
before acting on a newer commit.

## Ground truth at the pin

| Fact | Value | Source |
|---|---|---|
| Declared version | `2.0.0` | `package.json` |
| License | MIT | `LICENSE`, `package.json` |
| Latest GitHub release | `v2.0.0`, published 2026-05-23 | releases API |
| Workspaces | 4 | `package.json` |
| Git submodules | 3 | `.gitmodules` |
| Model entries in catalog | 354 | `packages/studio/src/models.js` |
| Docker port mapping | host `3001` → container `3000` | `docker-compose.yml` |

## Known drift — do not repeat these claims

1. **Download table is stale.** The README's desktop table links v1.0.9 assets
   while `v2.0.0` is the latest release and `package.json` says `2.0.0`. Always
   resolve the download from the releases API or the releases page.

2. **Release date precedes the code.** `v2.0.0` was published 2026-05-23, but the
   audited commit is 2026-08-29. A source checkout at `main` is materially newer
   than the newest published installer. Do not describe a desktop install and a
   source build as the same version.

3. **Model counts are marketing, not inventory.** The repository description says
   "500+ models"; the README says 400+ in one place, "200+ models" in the feature
   list, and "420+ models" in the category table footnote. The catalog defines
   **354** entries:

   | Array | Entries |
   |---|---|
   | `t2iModels` | 31 |
   | `t2vModels` | 47 |
   | `i2iModels` | 74 |
   | `i2vModels` | 131 |
   | `v2vModels` | 36 |
   | `lipsyncModels` | 15 |
   | `recastModels` | 3 |
   | `audioModels` | 17 |
   | **Total** | **354** |

   Per-category README claims also overstate: "Text-to-Image 70+" against 31, and
   "Text-to-Video 85+" against 47. Image-to-image and image-to-video are roughly
   consistent. Quote the array count, never the README number.

4. **Studio count varies.** The README says 14 studios in one place and lists a
   different set elsewhere. Enumerate from `packages/studio/src/index.js` exports.

5. **Docker port.** The README's quick start centers on port 3000, but
   `docker-compose.yml` publishes `3001:3000`. A Docker user reaching for 3000
   will get nothing.

## Running the auditor

```bash
python3 .agent-skills/open-generative-ai/scripts/audit-ogai.py source \
  --repo /path/to/Open-Generative-AI \
  --expect-commit 5482a777047c0df189eef989ff994d0d7a1d2874 \
  --format json
```

Checks origin, commit, dirty state, license, declared version, submodule
registration versus checkout, workspace declarations, and README-versus-source
version drift.

```bash
python3 .agent-skills/open-generative-ai/scripts/audit-ogai.py models \
  --repo /path/to/Open-Generative-AI --format json
```

Counts entries per model array and optionally resolves one endpoint with
`--endpoint <id>`.

```bash
python3 .agent-skills/open-generative-ai/scripts/audit-ogai.py release \
  --metadata /path/to/release.json --os darwin --arch arm64 --format json
```

Selects one asset from release JSON the caller already saved. Fetch that JSON
separately — the auditor makes no network request:

```bash
curl -fsS https://api.github.com/repos/Anil-matcha/Open-Generative-AI/releases/latest \
  -o /path/to/release.json
```

## Auditor guarantees

The script never runs `npm`, `next`, `electron`, or `docker`; never builds,
downloads, or launches anything; never makes a network request; and never prints
an API key or the contents of an env file. It reads Git metadata and targeted
text files only. `WARN` at the audited pin is expected — the README genuinely
disagrees with the tree.
