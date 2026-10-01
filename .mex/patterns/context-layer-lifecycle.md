---
name: context-layer-lifecycle
description: Operate, verify, or extend the `ctx` lifecycle tool that refreshes and garbage-collects the four agent-context layers (mex, zvec-grep, llm-wiki vault, graphify) on TaskCompleted/SessionEnd and every repo's pre-push.
triggers:
  - "ctx checkpoint"
  - "ctx refresh"
  - "context legacy"
  - "vault archive TTL"
  - "graph.db stale"
  - "pre-push checkpoint"
  - "zvec index stale"
edges:
  - target: "context/decisions.md"
    condition: "when questioning why a layer is deleted vs archived, or why git push is the checkpoint"
  - target: "patterns/headroom-code-policy-install.md"
    condition: "when the Graphify/Headroom read-side policy interacts with checkpoint regeneration"
grounds_to: []
last_updated: 2026-10-01
---

# Context-Layer Lifecycle (`ctx`)

## Scope

Global tool at `~/.agents/hooks/ctx/` (stdlib Python, package `ctx`), shim
`~/.local/bin/ctx`. Seed, research and evidence for the decision live in this
repo under `.ouroboros/` (gitignored by `/.ouroboros/` — copy out before relying
on git for them).

| Layer | Root | Refresh (hook) | Checkpoint (pre-push) | GC |
|---|---|---|---|---|
| mex | `<repo>/.mex/graph.db` | `mex-agent graph refresh` | `mex-agent graph rebuild` (isolated, atomic) | recovery/sidecar files past grace |
| zvec | `<repo>/.zvec-grep/` | `zg status --check-ready` + marker (never `zg index`) | `zg index <repo>` incremental, skipped if already ready | daemon log >100 MB rotated; stale sibling roots whose repo is gone |
| vault | `~/vaults/llm-wiki` | lint-lite + `index.md` auto markers | consolidate foreign roots → `wiki/archive/roots/`; archive stale authored pages; delete regenerable stubs/copies; purge archive >30 d | `raw/sources/**` and `Clippings/` are exempt forever |
| graphify | `<vault>/graphify-out/` | none (checkpoint-only) | `graphify update --force` → evict dead-source nodes → `cluster-only --no-viz` | dated snapshots, orphan `cache/ast` |

Triggers wired: `~/.claude/settings.json` `TaskCompleted` → `ctx refresh --scope all`
(inline, 120 s) and `SessionEnd` → `nohup ctx refresh … &` (returns < 1.5 s);
`<repo>/.git/hooks/pre-push` → `ctx checkpoint --scope all --repo "$(git rev-parse
--show-toplevel)"` before the preserved `git lfs pre-push`. Install into another
repo with `ctx install pre-push --repo <path>` (resolves the hook via
`git rev-parse --git-path`, so linked worktrees share the common hook).

## Invariants (do not weaken)

- Every mutating subcommand needs `--scope`; `--dry-run` prints `DRY-RUN …` lines and
  records the plan in `<vault>/wiki/ctx-ledger.jsonl`; a real run refuses to apply a
  plan whose hash has no prior dry-run record (it records one first).
- `plan()` is filesystem/manifest-only and never shells out to `zg`/`graphify`/`mex`:
  even `zg status` rewrites index segments. Live probes belong in `apply()`.
- Per-layer `fcntl` locks under `~/.agents/hooks/ctx/locks/`, skip-if-locked (exit 0);
  `ingest-prompt.py` / `ingest-output.py` take the vault lock too.
- Nothing under a `raw/sources` or `Clippings` segment is ever an Action target,
  including inside consolidated roots. `<dest>.moving` staging dirs are resumed from
  their `MANIFEST.json`, never rmtree'd.
- `CTX_DRY_RUN=1` in the environment forces dry-run for every subcommand — export it
  before any `git push` whose checkpoint you do not want (and before smoke-testing a
  hook; that is how the 2026-10-01 unplanned real run happened).

## Verify

```bash
ctx status --check-wiring            # 19 wiring checks, exit 1 on any failure
ctx test dryrun-noop                 # hermetic: dry-run changes zero bytes (all 4 layers)
ctx test core-selftest zvec-reconciled zvec-orphan-gc consolidation-resume
ctx test graphify-reconciled --fixture
bash .ouroboros/verify/run_acs.sh    # the 12 seed acceptance criteria (needs seed on disk)
```

Live-scope dry-run preview: `python3 .ouroboros/verify/dryrun_noop.py` — it reports a
concurrent pre-push checkpoint instead of mis-scoring it.

## Gotchas

- `zg status` is documented read-only but rewrites proxima segments; the zvec daemon
  lease `.zvec-grep/locks/daemon.json` churns every 5 s. Never diff live `.zvec-grep/`
  bytes to prove anything; use the hermetic fixture.
- The first checkpoint after a vault consolidation defers roots touched within the
  10-minute grace window; they move on the next run.
- A `.gitignore` edit plus `git clean`-style cleanup removed `.ouroboros/` once; the
  seed/evidence were restored from the session's `local://` copies. Keep copies.
- Follow-ups not done here: register `ctx` as a jeo-skills catalog skill; decide
  whether `AGENTS.md`/`CLAUDE.md` duplicates stay tracked; zvec coverage of hidden
  `.agent-skills/` (`--hidden`) is a search-quality issue, not lifecycle.
