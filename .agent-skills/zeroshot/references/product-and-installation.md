# Product lanes and installation

## Audited source and release status

This skill was researched on 2026-08-27 against:

- repository: `the-open-engine/zeroshot`
- audited `main`: `362453b743ca1ef79d4fff3525f9db3cffdbf2ad`
- established Node release: `v6.45.0` at `f015ffd66465b50613421717c323d14cef23df27`
- standalone Rust release: `zeroshot-rust-v0.4.0` at
  `8b56809d763e6f8b1459cf817e9af4adbb2e4eaa`
- npm packages observed: `@the-open-engine/zeroshot@6.45.0` and
  `@the-open-engine/zeroshot-rust@0.4.0`
- license: MIT, with the copyright and permission notice required in copies or
  substantial portions

The stable `v6.45.0` commit had successful push CI and CodeQL runs. The audited
`main` was two Rust commits ahead and its push CI had one failing Node fake-provider
E2E job even though the preceding merge-group CI had passed. Treat `main` as moving
source, not a release. Recheck the current tag, registry metadata, and CI before
installing or making compatibility claims.

The checked-in root package version is `0.0.0-development`. It is not release
authority. Git tags, npm metadata, and GitHub Releases are the durable Node version
sources. Upstream also says the Node version increments on every merge and should be
read as a build counter, not as a stability promise.

Pinned source links:

- [README at the audit commit](https://github.com/the-open-engine/zeroshot/blob/362453b743ca1ef79d4fff3525f9db3cffdbf2ad/README.md)
- [Node CLI source](https://github.com/the-open-engine/zeroshot/blob/362453b743ca1ef79d4fff3525f9db3cffdbf2ad/cli/index.js)
- [Provider reference](https://github.com/the-open-engine/zeroshot/blob/362453b743ca1ef79d4fff3525f9db3cffdbf2ad/docs/providers.md)
- [Generated Rust CLI reference](https://github.com/the-open-engine/zeroshot/blob/362453b743ca1ef79d4fff3525f9db3cffdbf2ad/docs/zeroshot-rust-cli.md)
- [Security policy](https://github.com/the-open-engine/zeroshot/blob/362453b743ca1ef79d4fff3525f9db3cffdbf2ad/SECURITY.md)

## Pick one product lane

The repository contains three related but separate user surfaces. Do not blend their
commands, state, or support claims.

| Lane | Command or import | Best fit | Platforms at audit | State and protocol |
|---|---|---|---|---|
| Established Node product | `zeroshot` | Guided local software-change orchestration, issue sources, worktrees, Docker, PR delivery, trace export | Linux and macOS | `~/.zeroshot`, SQLite ledgers, human CLI output plus JSON flags |
| Standalone native product | `zeroshot-rust` | Typed graph runs, local or named targets, JSON and NDJSON automation, Windows support | Linux x64/arm64, macOS x64/arm64, Windows x64 | Native controller or target state, JSON and NDJSON contract |
| Python SDK for native engine | `import zeroshot` | Typed async control of the Rust sidecar | Platform wheels are intended | Rust remains source of truth; Python projects typed projections |

Choose the Node lane unless the user explicitly needs the Rust command contract,
named targets, Windows, NDJSON automation, or the Python client. A Node run id is not
a Rust run id. Node `resume`, Node trace exports, Rust `watch`, and Python `Run` objects
are not interchangeable.

## Established Node installation

Requirements at `v6.45.0`:

- Node.js 22 or newer
- npm
- Linux or macOS
- a Git repository for the normal software-change workflow
- at least one supported provider, or a configured bundled Gateway provider
- Docker only for `--docker`
- the platform CLI for PR delivery, such as `gh`, `glab`, or `az`

Install an exact version after the user asks to use ZeroShot:

```bash
npm install -g @the-open-engine/zeroshot@6.45.0
zeroshot --version
```

Global installation runs package lifecycle scripts. At the audited commit the
postinstall path:

1. builds a missing legacy TypeScript output;
2. runs `fix-node-pty-permissions.js`;
3. runs `check-path.js`;
4. prints a setup invitation for an interactive global install outside CI.

Do not install ZeroShot during blanket skill setup. Do not pipe an unpinned installer
into a shell. Do not run bare `zeroshot` in unattended verification because no-argument
first use can enter the guided setup wizard.

For source development:

```bash
git clone https://github.com/the-open-engine/zeroshot.git
cd zeroshot
git checkout f015ffd66465b50613421717c323d14cef23df27
npm ci
npm link
zeroshot --version
```

`npm ci`, `npm link`, and package lifecycle scripts change the checkout or global npm
state. Run them only for an explicit source-development task.

## Read-only setup before applying settings

Use the upstream setup-plan contract before the wizard or writes:

```bash
zeroshot setup plan --json
```

Source tests require this plan to omit secret-shaped fields. It reports stable facts,
recommendations, risk, decisions, and proposed writes. It does not apply them.

The bundled skill helper keeps this distinction visible:

```bash
bash .agent-skills/zeroshot/scripts/zeroshot.sh doctor /path/to/repo
bash .agent-skills/zeroshot/scripts/zeroshot.sh setup-plan /path/to/repo
```

`zeroshot setup apply --decisions FILE` writes global or repository settings. Review
the exact decision file and proposed scopes before applying it. A global
`defaultDelivery=ship` needs the upstream `--allow-risky-defaults` override and should
never be stored merely to make a setup check pass. `zeroshot setup undo` is a state
change too; use it only when the user asks to roll back a prior apply.

Relevant settings include:

- `defaultProvider`
- provider level ranges and model overrides
- `defaultIsolation`: `worktree`, `docker`, or `none`
- `defaultDelivery`: `none`, `pr`, or `ship`
- issue source and PR base
- Docker mounts and environment passthrough

Always print explicit isolation and delivery flags for a consequential run. A saved
default can change behavior while leaving the command text unchanged.

## Provider setup boundary

Supported Node provider ids at the audit commit were:

- `claude`
- `codex`
- `gateway`
- `gemini`
- `opencode`
- `pi`
- `omp`, also described as Oh My Pi
- `kiro`
- `copilot`

Use `zeroshot providers` as the live authority. Use
`zeroshot providers set-default ID` or `zeroshot providers setup ID` only when the
user asks to configure that provider.

CLI-backed providers own their authentication and account state. ZeroShot launches
their binaries. The bundled Gateway provider is different: its ZeroShot settings can
contain a base URL, API key, model, headers, and a mandatory file/command tool policy.
Do not repeat the broad statement that ZeroShot never stores provider keys when the
Gateway lane is in use.

Native web search is off by default. At the audit commit only Codex and OpenCode had a
strict boolean web-search setting with local CLI version checks. Enabling it changes
network behavior and must be intentional.

Read `providers-and-security.md` before Docker, Gateway, environment forwarding, or a
remote native target.

## Standalone Rust installation

The npm installer is a thin verified-binary installer. It selects the declared host
archive and checks it against that release's `SHA256SUMS`. Unsupported hosts fail
closed instead of falling back to another product or architecture.

```bash
npm install -g @the-open-engine/zeroshot-rust@0.4.0
zeroshot-rust version
zeroshot-rust template list
```

The installer itself needs Node 18 or newer. The resulting `zeroshot-rust` executable
is the native product. Source builds use the Rust workspace and audited CI toolchain,
not the Node package version.

Use the generated CLI reference as the contract. It is produced from the typed Clap
model, while hand-written examples can lag.

## Python SDK status at the audit

The repository contains a typed Python SDK under `sdks/python`. Its documentation says:

```bash
pip install zeroshot-rust
```

However, `https://pypi.org/pypi/zeroshot-rust/json` returned 404 on 2026-08-27. The
`v6.45.0` Python SDK release workflow built all wheels successfully but failed at its
trusted-publishing step. Do not claim the PyPI install works until the registry is
rechecked and a real version is visible.

If the user needs the SDK before publication is repaired, treat source installation or
wheel building as a development task. Review `sdks/python/pyproject.toml`, the release
workflow, and the requested platform rather than improvising an install URL.

## Updating and uninstalling

`zeroshot update --check` is a networked read-only version check. Plain
`zeroshot update` installs a newer global package and can change behavior. Pin a version
for reproducible automation and update only on request.

For uninstall, first identify the lane and package manager. Removing the package does
not automatically mean the user wants durable run data under `~/.zeroshot` deleted.
Never combine uninstall with `zeroshot purge` or manual directory removal without a
separate data-deletion confirmation.
