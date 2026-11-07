---
name: skills-upgrade-refresh
description: Reinstall/refresh installed jeo-skills catalog safely on hosts that are symlinked to the shared root.
last_updated: 2026-11-06
---

# Skills upgrade / refresh (symlinked hosts)

## Reinstall/refresh installed jeo-skills catalog safely on hosts that are symlinked to the shared root.

Default host set (2026-11): `claude,pi,gjc,antigravity,cursor,aside-user` — overridable via `--hosts` or `SKILLS_UPGRADE_HOSTS`. `opencode-config` stays opt-in: opencode already serves the shared root via `OPENSPACE_HOST_SKILL_DIRS`, so default links there would double-list skills.

Scheduling: launchd job `com.jeo-skills.skills-upgrade` (`~/Library/LaunchAgents/`, from `scripts/com.jeo-skills.skills-upgrade.plist`) runs the script weekly Monday 09:30; logs in `~/.local/state/jeo-skill/upgrade.log[.err]`. The script self-adds the newest nvm node bin to PATH so cron/headless runs can still find `npx`.

When: user asks to 최신화/refresh/update installed skills, or after committing new skills to the shared repo — and host roots are symlinked to `~/.agents/skills`.

## Do

```sh
bash scripts/skills-upgrade.sh          # full: pull → doctor → refresh → prune → reconcile → verify
bash scripts/skills-upgrade.sh --dry-run
python3 scripts/refresh-host-links.py   # examine link plan without touching
```

## Steps
1. `git pull --ff-only` the trusted checkout; stop if it fails.
2. `jeo-skill doctor` — verify the refreshed local catalog.
3. Refresh the shared root only: `jeo-skill install --all --global --yes`. This overwrites `~/.agents/skills` wholesale with the latest.
4. `jeo-skill prune-retired --global` — remove retired catalog copies; exactly the legacy-dedupe cleanup that has been user-approved.
5. `scripts/refresh-host-links.py --apply` — create per-skill links for newly added skills, relink/reconcile hosts, back up any inverted stale links to quaternary quarantine.
6. Verify: jeo-skill doctor exit 0 + broken-link count 0 across claude/pi/gjc/antigravity host roots.

## Steps (NEVER do)
- **Never re-run per-host copy installers** (`--agent claude-code`, `-a gjc`, `-a antigravity`, pi copy) once hosts are symlinked: the installer deletes destinations (`rmtree`) and deletes through symlink slots, which can delete WHOLE SHARED-ROOT originals. This breaks every other host simultaneously.
- Never delete non-catalog host-local skills (proof examples: `launchpad-chat-agent`, `.local/tools`, etc.).

## Steps (Link reconcile detail)
- `plan` mode is read-only; apply should be run after `--dry-run` review tallies look sane.
- Missing links appear when the router adds new catalog skills but host roots have no link slot yet — that is expected and desirable.
- Broken links are removed (they point into vanished shared-root paths) — not "fixed"; the correct repair is `create-link` against its shared root twin.
- Quarantine dir: `~/.local/state/jeo-skill/quarantine/upgrade-<UTC>/...` only, never direct deletion; matches `skill_quarantine.py` conventions.

## Steps (Recovery)
- If `git pull` has conflicts or stale subtree checkout state, abort and report; never resolve by pushing state that mixes intended work with new skills.
- If a host root is a symlink (whole-dir) by someone else's change, skip it (`skip-symlinked-root`); do not break others' symlink conventions silently.
