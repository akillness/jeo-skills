# Repository commands

Read this before adding or editing a repository command. [AGENTS.md](../AGENTS.md) "Authoring aids"
links here.

- They live in regular `.agents/skills/skills-*/SKILL.md` files. Codex exposes `$skills-pr-handle`
  and `$skills-validate`; the [contributor guide](../CONTRIBUTING.md#shared-agent-commands) maps
  their Claude names.
- Claude command paths under `.claude/commands/` are relative symlinks to those files. Edit the
  canonical files, then run `pnpm sync:agent-commands` to create or repair links (`pnpm format` runs
  it too).
- Explicit-only commands carry `disable-model-invocation: true` and `argument-hint` in shared
  frontmatter for Claude, plus `allow_implicit_invocation: false` in `agents/openai.yaml` for Codex.
  Codex CLI 0.154.0 was verified to load both commands with those Claude fields present.
- These maintainer skills keep their command structure and stay outside the published `skills/`
  catalog.
- Set `metadata.internal: true` (a YAML boolean) in each command's frontmatter to exclude it from
  normal CLI discovery and bulk installs. Explicit skill requests or `INSTALL_INTERNAL_SKILLS=1` can
  still include it. The flag does not remove existing skills.sh listings: request removal from the
  maintainers (see [vercel-labs/skills#1578](https://github.com/vercel-labs/skills/issues/1578)).
- Add new command mappings in `scripts/sync-agent-commands.mjs`.
- `pnpm validate` checks command metadata, argument hints, invocation guards, and symlinks. Strict
  spec validation covers only published `skills/*/`, because the spec rejects Claude frontmatter
  extensions.
