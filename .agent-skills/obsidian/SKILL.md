---
name: obsidian
description: >
  Unified Obsidian skill: plugin development AND desktop automation. Use when building
  or validating an Obsidian plugin (boilerplate, 27 ESLint rules, submission), or when
  driving desktop Obsidian from the terminal via the official CLI, obsidian:// URIs, or
  kepano/obsidian-skills markdown/bases/json-canvas patterns. Triggers on: obsidian plugin,
  obsidian cli, obsidian automation, obsidian development, obsidian eslint, obsidian submission,
  obsidian markdown, obsidian bases, json-canvas, obsidian vault, obsidian URI, obsidian commands.
  Installable as a plugin: claude plugin marketplace add akillness/oh-my-skills
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Plugin dev works anywhere TypeScript/Node.js is available. CLI automation requires
  desktop Obsidian with CLI enabled (Settings → General → Command line interface,
  installer 1.12.7+). Replaces obsidian-plugin and obsidian-cli skills. Incorporates
  patterns from kepano/obsidian-skills (markdown, bases, json-canvas, defuddle).
metadata:
  tags: obsidian, plugin-development, eslint, cli, automation, markdown, bases, json-canvas, vault, uri
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/oh-my-skills
  based-on: gapmiss/obsidian-plugin-skill, obsidian.md/help/cli, kepano/obsidian-skills
---

# obsidian — Plugin Development + Desktop Automation

> Replaces: `obsidian-plugin` · `obsidian-cli`
> Plugin install: `claude plugin marketplace add akillness/oh-my-skills`
> Skill install: `npx skills add https://github.com/akillness/oh-my-skills --skill obsidian`

## When to use this skill

**Plugin development path:**
- Generate a new Obsidian plugin with clean boilerplate (no bloat)
- Fix ESLint violations from `eslint-plugin-obsidianmd` (27 rules)
- Prepare a plugin for community directory submission
- Apply memory-safe lifecycle, type safety, accessibility, CSS variables

**CLI automation path:**
- Drive desktop Obsidian via official CLI (`obsidian` command)
- Execute vault/note targeting, daily-note, search, create, read, tasks
- Use `obsidian://` URI for app handoff from launchers/browsers/scripts
- Plugin/theme development loop (reload, screenshot, eval, devtools)

**Markdown & content patterns (kepano/obsidian-skills):**
- Wikilinks, embeds, callouts, frontmatter, Obsidian Bases queries, JSON Canvas

## When not to use this skill

- Headless Sync/Publish without desktop → Obsidian Headless
- Raw filesystem markdown edits → direct filesystem writes
- Shell-native notes backend → `nb`, `zk`, or Joplin Terminal
- Richer external CRUD/frontmatter → Local REST API or Advanced URI plugin

## Instructions

### Routing: choose your path first

```yaml
obsidian_intent:
  path: plugin-dev | cli-automation | markdown-patterns
  surface: boilerplate | eslint-fix | submission | cli-command | uri-handoff | developer-mode | content-patterns
```

### Plugin development quick start

```bash
# Generate boilerplate
npx github:gapmiss/obsidian-plugin-skill create-plugin

# Install ESLint validation
npm install --save-dev eslint eslint-plugin-obsidianmd
npx eslint src/         # validate all 27 rules
npx eslint src/ --fix   # auto-fix where possible
```

Security note: treat remote generators as untrusted code. Review the source repo and pin to a specific commit/tag when possible before running in sensitive environments.

Key rules: `prefer-register-event` (memory), `no-tfile-cast` (type safety),
`require-aria-label` (accessibility), `prefer-css-variables` (styling).
See [references/plugin-dev.md](references/plugin-dev.md) for all 27 rules + code patterns.

### CLI automation quick start

```bash
obsidian help && obsidian version   # verify CLI is enabled
obsidian vault="My Vault" search query="meeting notes"
obsidian vault="My Vault" read path="Projects/Roadmap.md"
obsidian daily:append content="- [ ] Follow up"
obsidian plugin:reload id=my-plugin   # developer mode
```

URI handoff:
```
obsidian://open?vault=my%20vault&file=my%20note
obsidian://new?vault=my%20vault&name=new-note
```

See [references/cli-automation.md](references/cli-automation.md) for full command reference.

### Markdown & content patterns (kepano)

- Wikilinks: `[[Note Name]]`, `[[Note|Alias]]`, `[[Note#Heading]]`
- Embeds: `![[Note]]`, `![[image.png|300]]`
- Callouts: `> [!NOTE]`, `> [!WARNING]`, `> [!TIP]`
- Bases: `\`\`\`base` queries with `from`, `filter`, `sort`, `group`
- JSON Canvas: nodes + edges structure for visual knowledge graphs

See [references/content-patterns.md](references/content-patterns.md) for full syntax.

## Plugin install & distribution

```bash
# Install this skill as a Claude Code plugin
claude plugin marketplace add akillness/oh-my-skills

# Or install just the obsidian skill via skills CLI
npx skills add https://github.com/akillness/oh-my-skills --skill obsidian
```

## References

- [references/plugin-dev.md](references/plugin-dev.md) — All 27 ESLint rules, code patterns, submission
- [references/cli-automation.md](references/cli-automation.md) — CLI commands, URI, developer mode
- [references/content-patterns.md](references/content-patterns.md) — Markdown, Bases, JSON Canvas
- [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin)
- [Obsidian Plugin Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian CLI](https://obsidian.md/help/cli)
- [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)

## Examples
- "Set up a new Obsidian plugin and fix eslint-plugin-obsidianmd violations before submission."
- "Use Obsidian CLI to append today's standup note and search unresolved tasks in a vault."
- "Convert meeting notes to Obsidian callouts and link related notes with wikilinks."

## Operational checklist
1. Identify the task trigger and expected output.
2. Follow the workflow steps in this skill from top to bottom.
3. Validate outputs before moving to the next step.
4. Capture blockers and fallback path if any step fails.

## Best practices
- Keep outputs deterministic and auditable.
- Prefer small reversible changes over broad risky edits.
- Record assumptions explicitly.
