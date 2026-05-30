# Platform Map: Vercel Skills Scope

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Project skill path | `.claude/skills/` | `.agents/skills/` | `.agents/skills/` | `.agents/skills/` |
| Global path on macOS/Linux | `$HOME/.claude/skills/` | `$HOME/.codex/skills/` | `$HOME/.gemini/skills/` | `$HOME/.agents/skills/` |
| Global path on Windows PowerShell | `$env:USERPROFILE\.claude\skills\` | `$env:USERPROFILE\.codex\skills\` | `$env:USERPROFILE\.gemini\skills\` | `$env:USERPROFILE\.agents\skills\` |
| Vercel CLI agent selector | `-a claude-code` | `-a codex` | `-a gemini-cli` | `-a '*'` or omit for auto-detect |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Global vs project | Use global for personal Claude workflows; project for team-shared slash-skill behavior | Use global for personal Codex defaults; project `.agents/skills/` for repo-shared skills | Use global for Gemini CLI defaults; project `.agents/skills/` for portable repo skills | Project scope is default; `-g` means user global |
| Install source | `skills add -g <repo> --skill <name> -a claude-code` | `skills add -g <repo> --skill <name> -a codex` | `skills add -g <repo> --skill <name> -a gemini-cli` | `skills add <repo> --skill <name>` |
| Trigger reliability | Add a concise `CLAUDE.md`/AGENTS pointer for important skills | Add AGENTS instructions under repo scope | Add AGENTS/GEMINI guidance where supported | Always keep `SKILL.md` descriptions specific |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Install | `skills add` can link/copy into `.claude/skills` | `skills add` can link/copy into Codex/global or portable project path | `skills add` can link/copy into Gemini/global or portable project path | `--copy` avoids symlink issues; `--full-depth` finds nested skills |
| Discovery | Claude reads installed skill catalog and may expose slash workflows | Codex consumes installed skills when configured by runtime | Gemini CLI consumes installed/project skills when configured | `npx skills list`, `npx skills find`, `npx skills update` |
| Validation | Read `SKILL.md`, review scripts, then install | Same | Same | Review known repos; pin or review diffs for updates |

## Platform Gaps
1. OS-specific global paths are agent-specific rather than a single universal directory.
2. Windows path syntax differs by PowerShell vs Git Bash/WSL2, so docs need both forms.
3. `skills` CLI project installs are portable, but agent trust/loading behavior still differs.
4. Important skills should be referenced from always-loaded guidance because auto-triggering is not guaranteed.

Provenance: direct page retrieval from Vercel `skills` CLI docs/README and Vercel KB.
