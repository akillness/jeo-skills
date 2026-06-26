# obsidian-second-brain — install matrix

> **One codebase, four platforms.** Vault behavior is identical across all four;
> only the install path and the dispatcher file (`CLAUDE.md` / `AGENTS.md` /
> `GEMINI.md`) differ.

## Plugin (this jeo-skill front door)

Install the routing skill into any skills-compatible agent:

```bash
npx skills add https://github.com/akillness/jeo-skills --skill obsidian-second-brain
# global:
npx skills add https://github.com/akillness/jeo-skills --skill obsidian-second-brain -g
# or, from this skill dir:
bash scripts/install.sh
```

`scripts/install.sh` env knobs:

- `GLOBAL=1` — install globally (`npx skills add -g`)
- `WITH_UPSTREAM=1` — also clone the full upstream vault skill (45 commands + agents)
- `VAULT=<dir>` — when `WITH_UPSTREAM=1`, run the upstream `setup.sh` against this vault
- `AGENTS=<list>` — comma/space agent targets for `-a` (e.g. `claude-code,codex`)
- `JEO=1|0|auto` — jeo wiring: `1` force, `0` skip, `auto` (default) wires when `~/.jeo/config.json` exists
- `JEO_CONFIG=<file>` — override the jeo config path (default `~/.jeo/config.json`)
- `UNINSTALL=1` — remove the jeo AI-first hook (creates a backup) and exit

## jeo-code (jeo)

`jeo` discovers the skill automatically (`~/.agents/skills`). The 45 commands are
declared in the `aliases:` frontmatter of `SKILL.md`, so jeo lists them as
**slash aliases** in `jeo skills obsidian-second-brain`, the skill picker, and
shell autocomplete. Note: in current `jeo-code` (v0.7.x) a skill is *invoked* only
via the `$` entrypoint — run `$obsidian-second-brain <intent>` (or `$obsidian` by
unique prefix). Typing `/idea-discovery` does not load the skill in jeo; the slash
names are discovery/autocomplete hints here and remain live commands under Claude
Code. Confirm registration with `jeo skills obsidian-second-brain`.

`install.sh` also registers an **advisory** write-time AI-first validator as a
`post-turn` hook in `~/.jeo/config.json`:

```bash
JEO=1 VAULT="$HOME/.llm-wiki" bash scripts/install.sh
```

The hook runs `scripts/jeo-validate-ai-first.sh`, which normalizes jeo's payload
(single `.args.filePath` and batch `.calls[].args.filePath`) and checks each
markdown file written inside `VAULT` for AI-first frontmatter
(`date`/`type`/`tags`/`ai-first`), a `## For future Claude` preamble, and
ASCII-only content. It only **warns** (never reverts a write), and ignores files
outside the vault and non-markdown files.

Config safety: the installer backs up `~/.jeo/config.json` (which holds live
tokens) before editing, merges with `jq` (append-only — existing hooks such as
`graphify update .` are preserved), re-validates with `jq empty`, and restores the
backup if the result is invalid. The wiring is idempotent. Remove it with
`UNINSTALL=1 bash scripts/install.sh`.

Deliberately **not** ported to jeo (Claude Code only): the `/` dispatcher palette,
the SessionStart context loader, and the PostCompact background agent — jeo has no
matching hook events. Vault behavior is identical; only the trigger surface differs.

## Upstream — Claude Code (default)

One line:

```bash
curl -fsSL https://raw.githubusercontent.com/akillness/obsidian-second-brain/main/scripts/quick-install.sh | bash
```

Or two commands:

```bash
git clone https://github.com/akillness/obsidian-second-brain ~/.claude/skills/obsidian-second-brain
bash ~/.claude/skills/obsidian-second-brain/scripts/setup.sh "/path/to/your/vault"
```

Then run `/obsidian-init`.

## Upstream — Codex CLI / Gemini CLI / OpenCode

```bash
git clone https://github.com/akillness/obsidian-second-brain
cd obsidian-second-brain
bash scripts/build.sh --platform codex-cli     # or gemini-cli, or opencode
cp -R dist/codex-cli/. /path/to/your/vault/    # or .gemini-cli / .opencode
```

Start your CLI from the vault root. Each build produces a platform-specific
dispatcher (`AGENTS.md` for Codex / OpenCode, `GEMINI.md` for Gemini) with an
auto-generated routing table mapping natural-language triggers to command files
under `.codex/commands/` (or `.gemini/`, `.opencode/`).

Codex has no native slash-command runtime — install wrappers to run commands by
name: `bash scripts/install-codex-wrappers.sh` creates one shim per command in
`~/.codex/bin/` (each delegating to `scripts/run-command.sh`, which wraps the
command into a `codex exec` prompt). Preview without running:
`scripts/run-command.sh --print <command>`.

Run `bash scripts/build.sh` with no args to build all four platforms at once.

## Run on Hermes / open models

The skill is model-agnostic. The OpenCode / Codex / Gemini builds are plain
instruction files, so they run on whatever model the host CLI points at —
including open models like Nous Research Hermes via OpenRouter. No separate
build, no code changes.

`opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "openrouter/nousresearch/hermes-4-70b",
  "provider": { "openrouter": { "models": { "nousresearch/hermes-4-70b": {} } } }
}
```

| Model id | Best for | Cost (in / out per 1M) |
|---|---|---|
| `nousresearch/hermes-4-70b` | Default. Cheap, capable, 131k context. | $0.13 / $0.40 |
| `nousresearch/hermes-4-405b` | Strongest instruction-following for synthesis-heavy commands | $1.00 / $3.00 |
| `nousresearch/hermes-3-llama-3.1-405b:free` | Zero-cost trial (needs any OpenRouter key) | free |

Honest expectation: core commands (`/obsidian-save`, `/obsidian-daily`,
`/obsidian-capture`, `/obsidian-find`, `/obsidian-task`, `/research` in free mode)
hold up well on open models. Sub-agent-heavy and deep-synthesis commands
(`/obsidian-architect`, `/obsidian-reconcile`, `/research-deep`) lean hard on
instruction-following — prefer `hermes-4-405b` or Claude. The AI-first vault rule
applies on every write regardless of model.

## Research toolkit (optional)

The 6 keyed research commands need API keys. Either run `install.sh` and answer
"y" to the research prompt, or set up manually:

```bash
mkdir -p ~/.config/obsidian-second-brain
cp .env.example ~/.config/obsidian-second-brain/.env
chmod 600 ~/.config/obsidian-second-brain/.env
# paste keys into the file
uv sync   # installs Python deps
```

| Key | Where | Required for | Cost |
|---|---|---|---|
| `XAI_API_KEY` | console.x.ai | `/x-read`, `/x-pulse`, `/research-deep` X pulse, `/youtube` summary | ~$0.05/call |
| `PERPLEXITY_API_KEY` | perplexity.ai/settings/api | `/research`, `/research-deep` | ~$0.02–0.50/call |
| `GEMINI_API_KEY` | aistudio.google.com/apikey | `/notebooklm` (Gemini File Search) | free tier; paid ~$0.004–0.06 |
| `YOUTUBE_API_KEY` | console.cloud.google.com | `/youtube` metadata + comments (optional) | free tier 10k units/day |
| `OPENAI_API_KEY` | platform.openai.com | `/podcast` Whisper transcription (optional) | ~$0.006/min |

Without keys, the 35 non-research commands work fully, and `/research` +
`/research-deep` fall back to free key-less sources.
