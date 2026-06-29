# Install / scaffold

`webtoon-harness` ships two layers:

1. **The routing skill** (this folder) — installed as a jeo-skills plugin so any agent recognizes the
   webtoon-production intent and follows this methodology.
2. **The upstream harness** — the 27 agent definitions (`.claude/agents/`) and 6 methodology skills
   (`.claude/skills/`) from [revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness),
   scaffolded into your working project so Claude Code can run the agent teams.

## Plugin install (the skill)

```bash
# From the jeo-skills repo (recommended)
npx skills add https://github.com/akillness/jeo-skills --skill webtoon-harness

# Global install (all detected agents)
npx skills add -g https://github.com/akillness/jeo-skills --skill webtoon-harness
```


## Scaffold the upstream harness into a project

```bash
# Into the current directory's .claude/
bash scripts/install.sh

# Into a specific project
TARGET=/path/to/your-project bash scripts/install.sh

# Also install this routing skill globally first
GLOBAL=1 bash scripts/install.sh

# Pin a specific upstream ref
REF=main bash scripts/install.sh
```


Env knobs:

| Var | Default | Effect |
|-----|---------|--------|
| `TARGET` | `.` (cwd) | Project root to scaffold `.claude/agents` + `.claude/skills` into |
| `GLOBAL` | `0` | `1` → also run `npx skills add -g … --skill webtoon-harness` |
| `REF` | `main` | Upstream git ref to clone |
| `UPSTREAM_URL` | `https://github.com/revfactory/webtoon-harness` | Source repo |

The installer is **idempotent and additive**: it never deletes existing `.claude/agents` or
`.claude/skills` entries, only copies the webtoon harness files in (overwriting same-named files).

## Run it

In a Claude Code session opened on the scaffolded project (with
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` set), ask in natural language:

- "Make episode 1 of a webtoon reflecting current trends" — full pipeline
- "Make the next episode" — reuse world/style/continuity, new episode
- "Make this episode's twist stronger" — partial scenario re-run
- "Redraw panel 23" — re-render + re-validate just that panel

The `webtoon-orchestrator` skill auto-triggers and coordinates the phase teams.

## Requirements

- Claude Code with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- codex CLI (ChatGPT OAuth) for `image_generation` — keep ≤5 concurrent codex sessions
- The `scrapling` skill (Python 3.10+) for Phase 2 web extraction
