# Drama Skills install and operations

## Requirements

- Python 3.9 or newer
- Git for a source checkout
- No package manifest and no third-party Python dependency for normal creation,
  validators, or self-tests
- Chinese-language skill instructions and project filenames
- Optional provider credentials only for external production

Start with the bundled read-only helper:

```bash
bash .agent-skills/drama-skills/scripts/drama-skills.sh doctor /path/to/drama-skills
bash .agent-skills/drama-skills/scripts/drama-skills.sh routes
bash .agent-skills/drama-skills/scripts/drama-skills.sh project /path/to/project
```

The helper never clones, installs, starts a server, runs upstream code, prints
credential values, or calls a provider.

## Stable checkout versus moving main

The latest tagged release at the research snapshot was `v0.6.0`; `main` was
already ahead. Choose deliberately:

```bash
# Stable creator-first release

git clone --branch v0.6.0 --depth 1 \
  https://github.com/zenstory-ai/drama-skills.git

# Development head, only when current unreleased fixes are required

git clone https://github.com/zenstory-ai/drama-skills.git
```

Record the selected version:

```bash
git -C drama-skills rev-parse HEAD
git -C drama-skills describe --tags --always --dirty
```

Do not mix v0.5 and v0.6 outputs in one project. v0.6 changed the default to the
creator-first five-document contract and is a breaking project-format upgrade.

A symlinked checkout changes agent instructions whenever `git pull` changes the
source. Pin a tag or commit before linking, review diffs before updates, and do
not run a blind update in a production project.

## Manual linking from the pinned checkout

Every directory under `skills/` is an independent install unit.

### Claude Code

```bash
cd /absolute/path/to/drama-skills
mkdir -p "$HOME/.claude/skills"
for skill in skills/*; do
  target="$HOME/.claude/skills/$(basename "$skill")"
  if [ -e "$target" ] || [ -L "$target" ]; then
    printf 'skip existing: %s\n' "$target"
  else
    ln -s "$PWD/$skill" "$target"
  fi
done
```

### Codex

```bash
cd /absolute/path/to/drama-skills
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
for skill in skills/*; do
  target="${CODEX_HOME:-$HOME/.codex}/skills/$(basename "$skill")"
  if [ -e "$target" ] || [ -L "$target" ]; then
    printf 'skip existing: %s\n' "$target"
  else
    ln -s "$PWD/$skill" "$target"
  fi
done
```

Before linking, inspect the target for an existing real directory or symlink.
Never overwrite unrelated user skills. For a single capability, link only the
corresponding stage directory.

Expected installable names:

```text
short-drama
short-drama-novel-analyze
short-drama-develop
short-drama-write
short-drama-assets
short-drama-image-prompts
short-drama-storyboard
short-drama-video-prompts
short-drama-produce
short-drama-review
```

Do not install `maintainers/skills/short-drama-knowhow`.

## Installation verification

The helper checks structure without executing upstream code:

```bash
bash .agent-skills/drama-skills/scripts/drama-skills.sh doctor ./drama-skills
```

Each stage includes an offline `scripts/selftest.py`. Run self-tests only after
reviewing/pinning the checkout, and only for install, upgrade, or troubleshooting:

```bash
for test in drama-skills/skills/*/scripts/selftest.py; do
  python3 "$test" || exit 1
done
```

Normal writing does not need the full self-test suite, the evaluation corpus,
or repository-wide CI.

## Project initialization and status

Resolve the core directory from the installed `short-drama` skill:

```bash
CORE=/absolute/path/to/drama-skills/skills/short-drama
python3 "$CORE/scripts/project_tool.py" init ./my-drama --title "Example drama"
python3 "$CORE/scripts/project_tool.py" status ./my-drama
```

`init` creates configuration and empty directories only. Episode documents are
created when their owning stage first writes real content. The helper recognizes
the canonical `剧集/` root and the supported legacy English `episodes/` alias.

Other project lifecycle commands exposed by `project_tool.py` include:

```text
publish   atomically publish text/JSON outputs
accept    record accepted or rejected artifact outputs
review    record a lightweight verdict for an accepted artifact
authority inspect artifact ownership/authority
package   package approved text/JSON artifacts
verify    verify package checksums
```

Read `python3 "$CORE/scripts/project_tool.py" <command> --help` before using a
lifecycle command. Accepting or packaging an artifact is not confirmation to
spend money on media generation.

## Local Dashboard

Start only when the user asks for the Dashboard:

```bash
python3 "$CORE/scripts/dashboard_server.py" \
  --workspace /absolute/path/to/project --port 0 --open
```

Security contract:

- loopback host only;
- per-launch access token and randomized API prefix;
- Host and Origin validation;
- text-extension allowlist;
- no symlink/reparse-point traversal;
- optimistic SHA-256 version check before writes;
- atomic file replacement.

Do not expose it through a public bind, reverse proxy, or shared tunnel without
a separate security design.

## Stage validators and utilities

Use only the validator owned by the current stage:

| Stage | Key scripts |
|---|---|
| novel analysis | `novel_index.py` |
| development | `episode_intake.py` |
| writing | `screenplay_index.py`, `duration_estimate.py`, `voice_sheet_check.py` |
| assets | `asset_check.py` |
| image prompts | `image_prompt_check.py` |
| storyboard | `storyboard_check.py` |
| video prompts | `container_check.py`, `motion_timing_check.py`, `music_spec_check.py` |
| production | `production_tool.py`, `provider_adapters.py`, `fixture_adapter.py` |
| review | `review_check.py` |

Run `--help` before invoking a script. Do not guess arguments from a different
version.

## Troubleshooting order

1. Run the local helper `doctor` and record the checkout commit.
2. Confirm Python is 3.9+.
3. Confirm all expected stage directories and `SKILL.md` files exist.
4. Read the selected stage `SKILL.md`; do not load all references.
5. Run only that stage's offline `selftest.py`.
6. Run the smallest validator on the real artifact.
7. Identify the first structural error before changing creative content.
8. For production failures, inspect job state and require a new confirmation
   before any retry.

## Windows note

Upstream documents `python3`; on native Windows use `py -3` or `python` when
that is the installed launcher. Current `main` contains Windows Dashboard
hardening newer than the v0.6.0 release, so pinning `main` for that fix is a
conscious trade-off rather than a silent update.
