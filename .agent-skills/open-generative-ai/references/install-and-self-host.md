# Install and Self-Host

Four delivery forms with different capabilities. Pick one before running commands.

| Form | Local inference | Network exposure | Best for |
|---|---|---|---|
| Desktop release | yes | none by default | end users who want it working |
| Desktop from source | yes | none by default | contributors, latest code |
| Web from source | no | port 3000 | UI development, hosted use |
| Docker | no | host port 3001 | server deployment of the UI |

## Desktop release

Assets published for `v2.0.0`:

| Platform | Asset | Approx size |
|---|---|---|
| macOS Apple Silicon | `Open.Generative.AI-2.0.0-arm64.dmg` | 212 MB |
| macOS Intel | `Open.Generative.AI-2.0.0.dmg` | 219 MB |
| Windows x64 | `Open.Generative.AI.Setup.2.0.0.exe` | 134 MB |
| Linux AppImage | `Open.Generative.AI-2.0.0.AppImage` | 182 MB |
| Linux DEB | `open-generative-ai_2.0.0_amd64.deb` | 109 MB |

Resolve the current asset list from the releases API rather than the README's
table, which still points at v1.0.9.

### First launch is blocked on every OS

Builds are neither notarized nor code-signed. Each workaround weakens a local
protection, so present it as a choice and let the user execute it.

**macOS** — Gatekeeper reports the app as damaged or unopenable.

```bash
xattr -cr "/Applications/Open Generative AI.app"
```

This strips the quarantine attribute. Verify the download origin first, and never
run it against a path the user did not name. The no-terminal path is
System Settings → Privacy & Security → "Open Anyway".

**Windows** — SmartScreen shows an unrecognized-publisher warning. "More info" →
"Run anyway" bypasses reputation checking for that installer. The app installs to
`%LocalAppData%`.

**Linux (Ubuntu 24.04+)** — Chromium's user-namespace sandbox is blocked by
`kernel.apparmor_restrict_unprivileged_userns=1`.

- Preferred: install the `.deb`. It ships a scoped AppArmor profile
  (`build/linux/apparmor.profile`) and grants only what the app needs.
- AppImage fallback: `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`
  relaxes the sandbox **for the whole machine** until reboot. Persisting it via
  `/etc/sysctl.d/` is a durable security change — get explicit approval, and
  prefer the `.deb`.
- If the AppImage will not start at all on an older distro, `libfuse2` is likely
  missing.

## Source build

The single most common failure is skipping submodules or the workspace build.

```bash
git clone --recurse-submodules https://github.com/Anil-matcha/Open-Generative-AI.git
cd Open-Generative-AI

# already cloned flat?
git submodule update --init --recursive

npm run setup    # submodules + install + build:packages — NOT optional
```

`npm install` alone is insufficient. `npm run setup` expands to
`git submodule update --init --recursive && npm install && npm run build:packages`.

Then pick exactly one entry point:

```bash
npm run electron:dev   # desktop (vite build + electron), local inference available
npm run dev            # web (Next.js) on http://localhost:3000, no local inference
```

### Submodules

| Path | Upstream |
|---|---|
| `packages/Vibe-Workflow` | `SamurAIGPT/Vibe-Workflow` |
| `packages/Open-Poe-AI` | `Anil-matcha/Open-Poe-AI` |
| `packages/Open-AI-Design-Agent` | `Anil-matcha/Open-AI-Design-Agent` |

These are separate repositories with their own licenses and history. Audit them
independently before shipping a derivative; do not assume the root MIT license
covers submodule content.

### Workspaces

`packages/studio`, `packages/Vibe-Workflow/packages/workflow-builder`,
`packages/Open-Poe-AI/packages/agents`, and
`packages/Open-AI-Design-Agent/packages/design-agent`. An empty submodule
directory makes its workspace unresolvable and the build fails in a way that
looks unrelated.

## Production build

```bash
npm run build
npm run start
```

## Desktop packaging

```bash
npm run electron:build         # macOS DMG (Intel + Apple Silicon)
npm run electron:build:win     # Windows NSIS
npm run electron:build:linux   # AppImage + DEB
npm run electron:build:all     # all three
```

Output lands in `release/`. Packaging pulls platform toolchains and can take a
long time; do not start it merely to answer a question about the app. Signing and
notarization are not configured — locally built artifacts hit the same OS
warnings as the published ones.

## Docker

```yaml
services:
  open-generative-ai:
    build: .
    ports:
      - "3001:3000"
```

Reach it at **`http://localhost:3001`**, not 3000. The multi-stage Dockerfile
(`node:20-alpine`) copies submodule package manifests, so build from a checkout
that already has submodules initialized or the image build fails at `npm install`.

Docker gets no local inference. Every generation is a MuAPI call. Treat any
reachable deployment as a proxy to a paid API and gate it accordingly — see
[configuration and security](configuration-and-security.md).

## Upgrade and removal

- **Desktop**: install the new release over the old one. Local model weights live
  outside the app bundle and survive; remove them separately if reclaiming disk.
- **Source**: `git pull && git submodule update --init --recursive && npm run setup`.
  A pull without the submodule step is the most common post-upgrade breakage.
- **Docker**: rebuild the image; the container holds no state worth preserving.
- **Removal**: delete the app, then the local-AI directory (see
  [local inference](local-inference.md)), then revoke the MuAPI key if it will not
  be reused. Browser `localStorage` also retains the key and history for a web
  deployment — clear the site data.
