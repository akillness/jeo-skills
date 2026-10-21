---
name: skill-usage-lifecycle
description: Operating, extending, or debugging skill usage tracking, unused-skill quarantine/restore/purge, Jev review/relevance gates, the Jev usage ledger, and catalog retirement of never-used skills.
triggers:
  - "unused skill"
  - "skill usage"
  - "prune-unused"
  - "quarantine"
  - "retire-unused-skills"
  - "jev-usage.jsonl"
edges:
  - target: "patterns/catalog-metadata-changes.md"
    condition: "when a catalog retirement needs manual follow-up (route-outs, relationship groups)"
  - target: "patterns/jev-control-plane.md"
    condition: "when the Jev review/relevance gate or the hook ledger misbehaves"
  - target: "patterns/jeo-skill-install-flow.md"
    condition: "when install roots or projections change (they are the quarantine roots)"
last_updated: 2026-10-21
---

# Skill Usage Lifecycle

## Context
Interview-approved policy (2026-10-21): two separate removal scopes with separate approvals —
local install quarantine (`jeo-skill prune-unused`) and catalog retirement
(`scripts/retire-unused-skills.py`). "Used" means invoked or loaded; nothing else counts.
Candidate = zero uses across all history AND a 30-day grace after tracking began (or after
first seen installed). Protected: `jeo-skill`, bundles `starter`/`cli-core`/
`infrastructure-core`, `usage keep` pins, `usage relevance` protections.

Modules (all stdlib, in `.agent-skills/jeo-skill/scripts/`): `skill_usage.py` (state dir,
per-store collectors, incremental cursor, report), `skill_quarantine.py` (fingerprinted
plan, write-ahead manifest, exclusive moves, restore, purge), `skill_jev.py` (review gate,
relevance), `skill_usage_cli.py` (router glue; `jeo-skill.py` only registers/dispatches).
Jev hook ledger: `recordSkillUsage()` in `jev/jev-plugin.mjs`. State:
`${JEO_SKILL_STATE_DIR:-${XDG_STATE_HOME:-~/.local/state}/jeo-skill}` — `usage.json`,
`usage-cursor.json`, `policy.json`, `relevance.json`, `quarantine/<batch>/manifest.json`,
`jev-usage*.jsonl`.

Load events per store: Claude `skillUsage` in `~/.claude.json` and each remembered
`CLAUDE_CONFIG_DIR` profile's `.claude.json` (cumulative, merged by max, never summed) and
transcript `Skill` tool_use/`<command-name>`; Codex completed `CommandExecution`
`parsed_cmd` entries of type `read` only; OpenCode read tool `state.input.filePath`;
Antigravity `brain/*/.system_generated/logs/transcript.jsonl` `view_file` `AbsolutePath`
(chunks are duplicates, ignored); Aside `read_file` toolResult `details.skillName`;
jeopi/GJC/OMP/Pi `custom_message` `skill-prompt` and assistant `read` toolCalls of
`*/SKILL.md` or `skill://name`; Jev ledger `injected`.

## Steps
1. `jeo-skill usage scan` (first run sets `tracking_started_at`; ~2.5 min cold and ~30 s
   incremental on this machine under load; hooks/schedulers pass `--if-idle`).
   `jeo-skill usage report [--status candidate] [--json]`.
2. Local cleanup: `jeo-skill prune-unused --global` (preview, read-only), then
   `--apply --jev-profile P --allow-remote` or `--apply --skip-jev-review`. Apply rescans.
3. Undo: `jeo-skill restore --list`, `restore --batch B --apply`. Permanent:
   `purge-quarantine --older-than DAYS --apply`.
4. Catalog: `jeo-skill usage report --json > report.json`, then
   `python3 scripts/retire-unused-skills.py --usage-report report.json` (preview) and
   `--apply --approve a,b --skip-jev-review|--jev-profile P --allow-remote`.

## Gotchas
- Never count mentions: a new collector must match a runtime-emitted load envelope (tool
  call of a read tool, skill-load event), never free user/assistant text, session_init
  skill listings, writes/edits/greps, or shell command strings.
- Reads of `<checkout>/.agent-skills/<name>/SKILL.md` are catalog maintenance, excluded in
  `_path_skill()`. Without this, this repo's own maintenance sessions mark ~87 skills used.
- Evidence is high-water: vanished/rotated files keep their cursor contribution. A parser
  fix therefore cannot lower counts already recorded in an existing state dir (conservative
  by design: over-counting only protects skills).
- Cursor identity: key = inode + 4 KiB head hash. History carries over only for the same
  inode live last scan, the same path whose old inode is gone, or a byte-exact copy (size +
  full SHA-256). Never dedupe on a shared header alone: transcripts share long headers.
- `prune-unused --apply` refuses when any present store failed to read (any `error` other
  than `store not found`): a broken store could hide fresh use. Scans and reports stay
  failure-isolated.
- Every Jev call needs `--allow-remote`, checked before any harness subprocess: harness
  `status` itself probes configured endpoints (systemone with its bearer token), which may
  be remote. Unknown harness flags are silently ignored, so do not rely on new status flags.
- `proposal_only` proceeds (the explicit `--apply` is the human approval); `deny`,
  `unavailable`, missing/invalid receipt fail closed. Unvalidated tiers never `permit`.
- Quarantine identity reuses `install_support._retired_reason` (dir name = frontmatter name
  = catalog name, first H1 equal). Copies with an unprovable heading are kept.
- Cross-device moves use `_copy_tree_exact` (keeps `.DS_Store`/`__pycache__`/empty dirs);
  `install_support.copy_tree` filters runtime artifacts and would fail hash verification.
- Jev ledger rotation is lock-free (unique segment names, inode re-check, byte-bounded
  retention); the installed `~/.agents/jev` copy changes only after Jev setup is re-run.
- Previews must write zero bytes: `prune-unused` without `--apply` and `usage report`
  disable the catalog cache download write (`skill_usage_cli.read_only`).
- Scans hold an exclusive `flock` on `<state>/scan.lock` (never unlinked); `--if-idle` skips
  when busy. Never add a second lock protocol beside it.
- Per-file cursor contributions only contain names of the catalog that parsed them; the
  cursor's `names_sha256` forces a re-parse of live files on catalog change, and usage.json
  carries forward rows absent from the current catalog. Pin `JEO_SKILLS_CATALOG` for
  scheduled scans so they do not alternate catalogs (each alternation is a full re-parse).
- Tests must isolate HOME, JEO_SKILL_STATE_DIR and XDG_STATE_HOME even for in-process
  calls: an early direct-call test leaked fixture rows into the real state dir.
- This machine: Claude `SessionEnd` hooks (default and orca `CLAUDE_CONFIG_DIR` profile)
  plus LaunchAgent `com.jeo-skills.usage-scan` run `usage scan --if-idle` daily at 03:17.
  `CLAUDE_CONFIG_DIR` profiles may link `skills` back to `~/.claude/skills`, so global
  quarantine roots always include `~/.claude/skills` explicitly. The orca profile has its
  own `.claude.json` `skillUsage` (projects link to the default store); the collector reads
  it and remembers the profile for scheduled scans.

## Verify
- `python3 scripts/test_skill_usage_regressions.py -v`
- `python3 scripts/test_skill_quarantine_regressions.py -v`
- `python3 scripts/test_retire_unused_regressions.py -v`
- `JEO_SKILL_STATE_DIR=$(mktemp -d) node --test jev/usage-ledger.test.mjs jev/runtime.test.mjs`
- Real-data read-only check: run `skill_usage.scan()` against the real HOME with
  `JEO_SKILL_STATE_DIR` in `/tmp`; two consecutive scans with no new sessions must match.

## Debug
- A store shows `absent`: confirm the path glob in its `_collect_*` against the runtime's
  real layout (e.g. Antigravity moved from `antigravity/` to `antigravity-cli/brain`).
- A skill unexpectedly `used`: inspect `usage.json` `by_source` to find the store, then
  sample that store's matching records (names/field shapes only, never prompt text).
- `prune-unused --apply` exits 1: read per-item `errors` in the batch manifest; items in
  `*-cleanup-incomplete` states need manual review and are never auto-overwritten.

## Update Scaffold
- [ ] Update `.mex/ROUTER.md` "Current Project State" if what's working/not built has changed
- [ ] Update any `.mex/context/` files that are now out of date
- [ ] If this is a new task type without a pattern, create one in `.mex/patterns/` and add to `INDEX.md`
