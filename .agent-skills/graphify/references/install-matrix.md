# Graphify Install Matrix

Two separate things get installed. Do not conflate them.

1. **The CLI** — `pip install graphifyy` (PyPI package name is `graphifyy`; the binary is
   `graphify`). This is what actually builds and queries graphs. Every agent below needs it.
2. **The skill/integration** — a `SKILL.md` (plus hooks/plugins) placed where a specific agent
   looks for skills, so the agent knows to reach for `graphify` on its own.

```bash
pip install graphifyy          # or: pipx install graphifyy
graphify --version
```

Use `pipx` on macOS installs that report an externally-managed environment, and on Windows when
`pip install` does not put `graphify` on PATH.

---

## `graphify install` platform ids

`graphify install [platform] [--project]` copies the skill into a platform config dir. The
**complete** set of valid ids, as reported by the CLI itself:

`claude` · `codex` · `gemini` · `opencode` · `aider` · `copilot` · `claw` · `droid` · `trae` ·
`trae-cn` · `hermes` · `kimi` · `kiro` · `antigravity` · `antigravity-windows` ·
`vscode-copilot-chat` · `windows` · `vscode`

Anything else is rejected:

```
$ graphify install agents
error: unknown platform 'agents'. Choose from: claude, codex, gemini, opencode, aider,
copilot, claw, droid, trae, trae-cn, hermes, kimi, kiro, antigravity,
antigravity-windows, vscode-copilot-chat, windows, vscode
```

**There is no `jeo`, `jeopi`, `gjc`, `universal`, or `agents` platform id.** Never tell a user to
run `graphify install jeo`.

`--project` writes into the current repo instead of the user's home config. Verified output:

| Command | Writes |
| --- | --- |
| `graphify install opencode --project` | `.opencode/skills/graphify/SKILL.md`, `.opencode/plugins/graphify.js`, `.opencode/opencode.json` (`tool.execute.before` hook), plus a graphify section in `AGENTS.md` |
| `graphify install claude --project` | `.claude/skills/graphify/SKILL.md`, `.claude/settings.json` (PreToolUse Bash/Read/Glob hooks), `.claude/CLAUDE.md`, plus a graphify section in `CLAUDE.md` |

---

## jeo · jeopi · gjc — install via the shared `~/.agents/skills` root

Per this repo's `setup-all-skills-prompt.md` (Step 0), `jeopi`, `jeo` and `gjc` are **not** valid
skills-CLI agent ids either. They need none: all three discover `~/.agents/skills` natively, and
the unconditional `universal` id is what populates that root.

So the correct route for these three is:

```bash
# 1. the CLI itself
pip install graphifyy && graphify --version

# 2. the skill, into the shared root all three read natively
npx skills add https://github.com/akillness/jeo-skills --skill graphify -a universal
# or, equivalently, place this folder at:
#   ${SKILLS_ROOT:-$HOME/.agents/skills}/graphify/SKILL.md

ls "${SKILLS_ROOT:-$HOME/.agents/skills}/graphify/SKILL.md"
```

Do **not** run `graphify install <id> --project` for these three expecting jeo/jeopi/gjc to pick
it up — they read `~/.agents/skills`, not `.claude/skills` or `.opencode/skills`.

Optional per-repo reinforcement: jeo runs `graphify update .` from its post-implementation hook,
so a repo-local `.graphify/` is enough; no extra platform install is required.

## opencode — two products, one binary name

`setup-all-skills-prompt.md` documents the split, and it matters here:

- **sst/opencode** (opencode.ai, TypeScript/Bun) has a native skill loader and reads
  `~/.config/opencode/skills/`, `~/.claude/skills/`, and `~/.agents/skills/`. Either route works:
  the shared `~/.agents/skills` root above, or `graphify install opencode` for the plugin +
  `tool.execute.before` hook wiring.
- **opencode-ai/opencode** (the archived Go TUI, continued as charmbracelet/crush) has **no**
  skill loader — it only reads `.md` command files under `~/.opencode/commands/`,
  `$XDG_CONFIG_HOME/opencode/commands/`, and `<project>/.opencode/commands/`. `graphify install
  opencode` will not make the skill discoverable there; bridge it as a command file (Step 2b of
  `setup-all-skills-prompt.md`) or just use the `graphify` CLI directly.

```bash
graphify install opencode              # user config
graphify install opencode --project    # this repo only
```

## Recommended order for a fresh machine

```bash
pip install graphifyy                                   # 1. CLI on PATH
npx skills add https://github.com/akillness/jeo-skills --skill graphify -a universal
                                                        # 2. skill into ~/.agents/skills (jeo, jeopi, gjc, opencode)
graphify install opencode                               # 3. optional: opencode plugin + hook
graphify install claude                                 # 4. optional: Claude Code hooks
cd <your-repo> && graphify update . && graphify summary # 5. prove it works
```

## Uninstall

`graphify uninstall` removes graphify from all detected platform integrations. It does not
uninstall the `graphifyy` package and does not touch `~/.agents/skills` — remove that folder
yourself if you installed the skill there.
