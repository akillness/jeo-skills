# Legacy `higgsfield-game-generation` name (jeo catalog addition)

This folder is **not** part of upstream `higgsfield-ai/skills`. It was merged into
`higgsfield-websites` on 2026-09-19 from the former jeo-skills compatibility alias
`higgsfield-game-generation`, which is now recorded in `skills.json` `retired_skills`
and resolves to `higgsfield-websites` at install time.

Use it only when a prompt, installed catalog, search result, or stale `higgsfield game
...` command names the retired skill and you need evidence about which upstream folder
owns games today. Ordinary game requests go straight to `higgsfield-websites --type game`
(`../game-flow.md`).

## Read-only owner audit

```bash
python3 "$SKILLS_ROOT/higgsfield-websites/references/game-alias/audit-higgsfield-game.py" \
  --repo /path/to/higgsfield-ai-skills --format json
python3 "$SKILLS_ROOT/higgsfield-websites/references/game-alias/audit-higgsfield-game.py" --self-test
```

`decision` is one of `higgsfield-game-generation` (an exact upstream owner exists — read
that skill), `higgsfield-websites` (the exact folder is absent and the website skill owns
games), or `unresolved` (stop and report). At upstream commit `d071406` (the vendored
0.12.0 tree) the decision is `higgsfield-websites`. The audit is read-only and grants no
operational approval: CLI install, login, paid generation, deployment, and marketplace
publication still require their own confirmation.

- [upstream-drift.md](upstream-drift.md) — resolution algorithm and evidence hierarchy
- [source-notes.md](source-notes.md) — claim ledger for the original alias
