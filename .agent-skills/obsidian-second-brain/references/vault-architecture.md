# obsidian-second-brain — vault architecture and automation

**Last updated:** 2026-11-02

The consented adapter creates a **new general-purpose wiki vault**. It retains
Obsidian and its CLI but does not migrate or rewrite an existing installation.
Use [install.md](install.md) to review targets, permissions, model, schedules and
allowances before applying setup.

## Operating files and storage boundary

`setup.py` installs actual operating assets pinned to upstream
`c8b1d8c1c5b41d4f1845f7188200d354837be96f`, not empty stand-ins. It extracts core
templates as data and adapts Bases folder references to the wiki layout; upstream
setup/bootstrap/background scripts are never executed during installation.

```text
new-vault/
├── CLAUDE.md, _CLAUDE.md           Local operating map and skill imports
├── index.md, log.md               Retrieval entrypoint and change history
├── raw/sources/                   Immutable source captures and compact summaries
├── raw/videos/                    Immutable retained video sources
├── wiki/                          Rewritable knowledge, with provenance
│   ├── entities/, concepts/, sources/, syntheses/
│   ├── projects/, tasks/, daily/
│   └── reports/, queries/, archive/
├── Templates/, Bases/             Actual adapted upstream templates
├── Logs/, .obsidian/app.json      Local scaffold
├── .claude/
│   ├── commands/                  Local upstream command documents
│   ├── skills/obsidian-second-brain/  Local operating skill and references
│   └── settings.json              New-vault-only native Claude PostCompact hook
└── .second-brain/
    ├── upstream/                  Pristine pinned assets for provenance
    ├── scripts/runtime.py         Serialized, tool-free proposal events
    ├── scripts/ctx_guard.py       Portable lifecycle and raw retention proof
    ├── config.json, install.json  Reviewed configuration and owned-file inventory
    └── state.json, schedule.log   Runtime accounting/progress and schedule output
```

The collection inbox is explicitly configured; it can be a separate new directory
or a permitted non-reserved directory inside the new vault. Its ownership marker
is control metadata, not an ingested source. The general-wiki preset is the adapter
default; upstream executive/builder/creator/researcher presets remain operating
reference material, not selectable `setup.py` modes.

## Source-to-wiki transaction

1. A `scan` examines regular files in the approved inbox. It preserves accepted-size
   source bytes under `raw/sources/<path-and-content-identity>/<filename>` using
   exclusive publication, hashes and read-only permissions. Oversized files remain
   unchanged in the inbox with explicit errors; they are not silently truncated.
   Completion: a stable capture or a visible retained-source error exists.
2. Supported UTF-8 text sources, current wiki pages, and the installed event
   playbooks become untrusted data in a bounded model prompt. PDF, Office, media,
   image, ZIP and undecodable/NUL-containing binary inputs have no automatic
   extractor: originals remain retained, an explicit `source_errors` entry is
   recorded, and those inputs remain unprocessed. Other supported entries progress
   independently; a mixed batch can return `completed_with_source_errors` with a
   nonzero CLI exit. Text deferred by the batch allowance stays pending for a later
   scan. Completion: selected source IDs fit the full playbook/wiki/input allowance.
3. Claude CLI runs with tools disabled, strict empty MCP configuration, safe mode,
   JSON schema output, the chosen model and an allowance reservation. It proposes
   complete replacements using `updates: [{path, content, before_sha256}]`; it
   cannot call research tools, fetch URLs, change hooks or execute commands.
   Completion: a successful structured result includes at least one update.
4. Deterministic host code validates the complete proposal before committing it.
   Only `wiki/**`, `index.md` and `log.md` are writable; any path component named
   `raw`, traversal, aliases/hardlinks, conflicting destinations and stale hashes
   are refused. No delete operation exists. A vault-local writer lock and durable
   transaction journal serialize events and recover interrupted commits.
   Completion: committed updates and processed-source/event state are recorded.
5. Successful wiki writes request portable `ctx` refresh. Unfinished integration
   is retried from recorded state before a later event. This is not permission to
   build an absent index or run a Graphify provider. Completion: refresh reports
   the performed work and any pending initialization/readiness.

A text file containing a URL is text, not an instruction to fetch that URL.
Interactive `/obsidian-ingest` guidance can cover richer capture formats, but the
automatic runtime does not implement binary extraction or live research.

## Knowledge-writing policy versus enforcement

Operating guidance asks each knowledge note to include a `## For future Claude`
preamble, retrieval frontmatter, exact source provenance, fact-time and learn-time,
and an explanation when replacing a prior claim. Rewrite relevant pages rather
than append disconnected fragments; preserve opposing evidence during
reconciliation. `index.md` is the retrieval starting point and `log.md` records
verified changes of belief.

These are model-quality instructions, not proof that a provider synthesizes well.
Host validation enforces JSON shape, destination, bounds and prior-content hashes;
it does not establish factual correctness or semantic quality. The upstream
Two-Output Rule is interactive operating guidance, not a claim that this adapter
captures every host conversation or updates the vault after every answer.

## Consented events, not always-on host parity

Setup requires separate data/model/hooks/schedule/PostCompact permissions and
makes no model calls. Once registered, the managed cron block runs the following
shared-runtime events at the approved times (defaults shown in the cron host's
timezone):

| Event | Default | Installed playbook role |
|---|---|---|
| `scan` | Every minute | Ingest supported pending inbox sources. |
| `morning` | Daily 08:00 | Daily-note maintenance. |
| `nightly` | Daily 22:00 | Daily consolidation, reconciliation and synthesis. |
| `weekly` | Friday 18:00 | Recap/review. |
| `health` | Sunday 21:00 | Vault health proposal. |
| `postcompact` | Native Claude event only | Save the provided `compact_summary`. |

Only the new vault's `.claude/settings.json` receives native `PostCompact` wiring.
Its summary is preserved under `raw/sources/postcompact/` before model use. jeo,
Codex, Gemini and OpenCode use copied operating documents/shared runtime; no
native PostCompact or SessionStart support is fabricated for those hosts. The
shared automated runner uses Claude CLI even when the interactive host differs.
Save reminders in upstream documents are guidance, not a new host callback.

The runtime avoids duplicate completed events and recursive invocation. It
reserves the configured run allowance in a UTC-day ledger before model launch;
reported successful cost reconciles it, while failures keep the reservation. This
is a Claude allowance estimate, **not a hard billing guarantee**. Provider
model-quality, billing accuracy and live host event delivery remain unverified by
the installed smoke/fixture checks.

## Portable ctx roles and checkpoint authority

The bundled `ctx_guard.py` owns a new-vault-only lifecycle without importing a
private HOME `ctx` package or changing an existing `ctx` command. Persisted
`.second-brain/config.json` is authoritative; in-memory configuration mismatches
are refused. External indexer executables are trusted dependencies, not sandboxed
processes; raw inventories detect changes but cannot undo a malicious helper.

| Layer | Refresh | Checkpoint |
|---|---|---|
| Vault | Record complete raw retention inventory. | Record and compare retention inventory. |
| mex | Refresh an already initialized graph. | Rebuild an already initialized graph. |
| zvec | Check an existing index's readiness; report pending when not ready. | Index the separately initialized root, then check readiness. |
| Graphify | Report `checkpoint_only`; never launch Graphify. | With separate provider authority, forced update, missing-source graph reconciliation and cluster-only. |

Setup reports absent `.mex`, `.zvec-grep` and `graphify-out` as
`pending_initialization`; initialization requires separate approval. mex/zvec
remain pending when their directories are absent. Graphify rebuilding occurs
**only at checkpoint**, never at ingest/refresh. Checkpoint requires separate
`consent.graphify_provider: true` plus explicit `graphify_provider.backend`,
`graphify_provider.model` and `accept_unbounded_cost: true`; without these it
reports `pending_consent` and fails before a Graphify process starts. Graphify
`update --force --no-cluster` performs local AST extraction in the inspected
implementation; `cluster-only` receives the selected backend/model and can call
its provider. That external cost is separate from the Claude ledger.
Missing-source reconciliation prunes graph nodes/edges, not source files, and
preserves semantic/rationale/community nodes and semantic-cache identities.

All `raw` trees at any depth, including `raw/videos`, archived-root raw sources,
and `Clippings`, remain immutable and are SHA-256 inventoried before and after
lifecycle execution. Own writes reject protected paths, ancestors and aliases.
The portable adapter implements **no legacy GC, archive, purge, move or deletion**;
`gc: disabled_raw_retention` is intentional. Index refresh/rebuild does not grant
permission to delete originals or to migrate an existing vault.

## Inspect or run the installed interfaces

Use the absolute installed configuration, not a private HOME configuration:

```bash
python3 /absolute/new-vault/.second-brain/scripts/ctx_guard.py --config /absolute/new-vault/.second-brain/config.json --check
python3 /absolute/new-vault/.second-brain/scripts/runtime.py --config /absolute/new-vault/.second-brain/config.json --event scan
python3 /absolute/new-vault/.second-brain/scripts/ctx_guard.py --config /absolute/new-vault/.second-brain/config.json --scope vault --command refresh
```

The first command is a read-only prerequisite/retention check; the second can
spend the approved Claude allowance; the third writes the vault retention
manifest. For Graphify checkpoint, review separate provider authority and cost in
[install.md](install.md) before invoking `--scope graphify --command checkpoint`.
