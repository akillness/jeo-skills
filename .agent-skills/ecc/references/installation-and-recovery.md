# ECC installation and recovery

Source audited on 2026-09-01: [affaan-m/ECC](https://github.com/affaan-m/ECC),
its `ecc-universal` package manifest (`2.2.1`), and its
[`configure-ecc` skill](https://github.com/affaan-m/ECC/blob/main/skills/configure-ecc/SKILL.md).
ECC is MIT-licensed. Treat upstream releases and provider CLIs as the authority if they
disagree with this snapshot.

## Official sources only

Use only:

- GitHub: `https://github.com/affaan-m/ECC`
- npm: `ecc-universal`
- Claude marketplace plugin: `ecc@ecc`

Upstream explicitly warns that third-party re-uploads and mirrors may be unsafe.

## Claude Code

The human-terminal guided path is:

```bash
npx ecc-universal setup
```

It requires Node.js 18 or newer, Git, and Claude Code 2.1 or newer on `PATH`. For
an agent shell, do not invoke the wizard without a TTY. Inventory provider state first,
then use explicit scope and hook choices in the dry run:

```bash
claude plugin marketplace list --json
claude plugin list --json
npx --yes --package ecc-universal ecc setup --mode claude-plugin \
  --scope user --hooks standard --dry-run --json
```

After confirmation, remove only `--dry-run` and retain `--yes --json`. Valid scopes
are `user`, `project`, and `local`; valid hook modes are `off`, `minimal`, `standard`,
and `strict`.

The native alternative is:

```text
/plugin marketplace add https://github.com/affaan-m/ECC
/plugin install ecc@ecc
```

Choose one of those Claude paths. Do not stack native plugin setup with a full/manual
ECC install. The plugin does not distribute ECC rule packs; add only selected rules
later when a concrete project needs them.

## Codex

Use the native marketplace path, not the legacy sync script:

```bash
codex plugin marketplace add affaan-m/ECC
codex plugin add ecc@ecc --json
codex plugin list --json
```

To refresh an existing native installation, run `codex plugin marketplace upgrade ecc`
then `codex plugin add ecc@ecc`. Codex has one active plugin state in `CODEX_HOME`, not
Claude's three scopes. Its hooks require a separate provider trust decision and do not
map to ECC's four Claude hook profiles. Never layer `scripts/sync-ecc-to-codex.sh` over
the native plugin.

## Kimi and other adapters

ECC's source supports target-specific adapters. From a trusted checkout, preview the
exact target before applying it:

```bash
./install.sh --profile minimal --target <target> --dry-run --json
```

The documented targets include `cursor`, `opencode`, `gemini`, `zed`, `antigravity`,
`qwen`, `hermes`, `openclaw`, `kimi`, `codebuddy`, `joycode`, `adal`, `claude`,
`claude-project`, and `codex`. Kimi uses a project-local `.kimi-code` surface; ECC does
not configure lifecycle hooks for Kimi.

Hook materialization is a separate operation. Do not apply `--enable-hooks` until the
user has approved that local automation change.

## Recovery and updates

Before changing an existing installation, inventory it with the provider plugin list
and an ECC read-only command when its CLI is already available:

```bash
ecc list-installed
ecc doctor --json
ecc repair --dry-run
```

`repair` writes managed files without `--dry-run`; preview first. Do not run `ecc
auto-update` during blanket setup. Upstream's automatic update workflow fetches and
fast-forwards a trusted checkout before reinstalling recorded targets, so it is an
explicit update decision rather than a safe default.
