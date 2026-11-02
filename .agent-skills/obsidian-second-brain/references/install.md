# obsidian-second-brain — consented installation

**Last updated:** 2026-11-02

## Preferred: initialize a new vault

This adapter retains Obsidian and its CLI, replaces the knowledge-operation layer
for future installations, and leaves existing vaults and installations alone.
It installs the operating assets and initializes a new wiki vault; it is not a
migration or an existing-install upgrade.

1. Review a version-1 JSON configuration using the fields below. Choose a **new**
   vault and collection inbox, the model, processing limits, schedule, and separate
   data/model/hook/PostCompact/schedule permissions. Keep credentials out of this
   file; the selected CLI/provider owns authentication. Completion: the operator
   has approved the actual targets, data disclosure, model and allowances.
2. From this skill directory, preview without subprocesses, downloads or writes:

   ```bash
   python3 scripts/setup.py --config /absolute/reviewed.json --dry-run
   # Optional local source; preview defers git-blob verification until apply:
   python3 scripts/setup.py --config /absolute/reviewed.json --source /absolute/pinned-checkout --dry-run
   ```

   Completion: JSON reports `dry-run`; inspect `actions`, `integrations.pending`
   and `deferred`. Executable availability is not initialized-index readiness.
3. Apply the reviewed configuration through the preferred installer entrypoint:

   ```bash
   JEO_SECOND_BRAIN_CONFIG=/absolute/reviewed.json bash scripts/install.sh
   # Optional, verified local source instead of downloading the pinned archive:
   JEO_SECOND_BRAIN_CONFIG=/absolute/reviewed.json JEO_SECOND_BRAIN_SOURCE=/absolute/pinned-checkout bash scripts/install.sh
   # Direct equivalent:
   python3 scripts/setup.py --config /absolute/reviewed.json
   # Add --source /absolute/pinned-checkout when using the local checkout.
   ```

   Completion: JSON reports `installed` with `model_invoked: false`, or `unchanged`
   for an identical, intact adapter-owned rerun. Installation makes **no model
   calls**; the approved scheduled runtime can make calls after registration.

`setup.py` uses actual operating assets from
`akillness/obsidian-second-brain` pinned to
`c8b1d8c1c5b41d4f1845f7188200d354837be96f`: commands, references, scripts,
core note templates and Bases templates. A local source must be a self-contained
Git checkout at that exact revision; apply checks copied bytes against its pinned
Git blobs. Without `--source`, apply requires `consent.download: true` and downloads
the pinned archive into staging. It does not clone/pull a global upstream skill or
execute upstream `setup.sh`, bootstrap code, or background agents. Templates are
extracted as data. Native Claude operating copies live inside the new vault;
pristine provenance remains under `.second-brain/upstream/`.

### Verify the package transport in isolation

For installation verification, use a new temporary HOME, project and npm cache;
keep the real vault, scheduler and provider untouched. Request the transport
explicitly rather than relying on a same-version globally installed `skills` CLI:

```bash
npx --yes --package skills@1.7.0 -- skills --version
# After populating the temporary cache, install from the reviewed local catalog:
npx --offline --yes --package skills@1.7.0 -- skills add /absolute/reviewed-catalog --skill obsidian-second-brain --agent claude-code --copy --full-depth --yes
```

Completion: confirm which executable the temporary package environment resolved,
then run the **installed** `setup.py` preview, apply and owned rerun against the
pinned upstream checkout. Check installed operating-asset bytes and preservation
of an authored page. Scheduler/index fixtures and `claude --help` can prove local
wiring without authorizing inference; they do not prove live service behavior.

### Reviewed configuration

This is a schema example, not approval to use these paths, model or costs. Replace
the absolute paths and model after review; all executable prerequisites must exist.
The adapter requires Python 3.10+ on POSIX, Claude CLI with its required safe/JSON
flags, `crontab`, `graphify`, `mex-agent`, and `zg`. Absolute `claude_bin`,
`crontab_bin`, `graphify_bin`, `mex_bin`, and `zvec_bin` overrides are optional;
otherwise setup resolves executables from `PATH`.

```json
{
  "version": 1,
  "vault": "/absolute/new-second-brain",
  "inbox": "/absolute/new-second-brain-inbox",
  "model": "operator-selected-model",
  "max_run_usd": 0.25,
  "daily_budget_usd": 2.0,
  "timeout_seconds": 120,
  "max_input_bytes": 262144,
  "consent": {
    "data": true,
    "model": true,
    "hooks": true,
    "schedule": true,
    "postcompact": true,
    "download": true
  },
  "integrations": {"ctx": true, "graphify": true, "mex": true, "zvec": true},
  "schedules": {
    "scan": "* * * * *",
    "morning": "0 8 * * *",
    "nightly": "0 22 * * *",
    "weekly": "0 18 * * 5",
    "health": "0 21 * * 0"
  }
}
```

All five operation consents must be explicitly `true`; neither `VAULT` nor
`WITH_UPSTREAM=1` grants model or spend authority. Explicit false values in
`JEO_SKILLS_APPROVE_KNOWLEDGE_HOOKS` or `JEO_SKILLS_APPROVE_KNOWLEDGE_DATA` veto
setup. Run and daily allowances must be positive and finite; the daily allowance
must cover a run. Schedules use exactly the five shown event keys and five-field
cron expressions in the cron host's timezone. The mapping must be supplied explicitly;
omitting schedules rejects setup before effects rather than activating example defaults.

Vault/inbox parents must already exist unless the inbox is inside the newly
created vault outside its reserved trees. Arbitrary existing vaults or inboxes,
symlinked targets and protected existing HOME knowledge/agent trees are refused.
Identical adapter-owned reruns verify completeness rather than overwrite content;
changed targets, consent or configuration require a separate reviewed migration,
which this adapter does not implement.

### Provider and billing boundaries

The runtime reserves `max_run_usd` against its UTC-day ledger before launching
Claude, passes `--max-budget-usd`, and reconciles reported `total_cost_usd` after a
successful result. Treat this as a **Claude allowance estimate**, not a hard
billing guarantee or proof of provider entitlement. Failures/timeouts retain the
reservation. Provider model quality, actual billing and live host integration are
unverified by fixture/installed smoke tests.

Graphify checkpoint has separate external-provider authority. If approved before
installation, add `consent.graphify_provider: true` and a `graphify_provider`
object with explicit `backend`, `model`, and `accept_unbounded_cost: true`.
Without both, checkpoint reports `pending_consent` and fails before launching
Graphify. The example deliberately omits this authority. The Claude allowance does
**not** cap Graphify costs. In the inspected Graphify implementation,
`update --force --no-cluster` performs local AST extraction; `cluster-only`
receives the selected backend/model and can call its provider. Review that
provider and external cost before approving; there is no automatic index
initialization or private HOME `ctx` source.

## Runtime and host scope

`runtime.py` handles collection scans, morning/nightly/weekly/health work and
PostCompact summaries through one shared tool-free Claude JSON-proposal runner.
Host code validates allowed paths and prior-content hashes before committing wiki
changes. See [vault-architecture.md](vault-architecture.md) for the storage,
retention, event and lifecycle boundaries.

Only the **new Claude vault's** `.claude/settings.json` receives a native
`PostCompact` command hook. It consumes the event's `compact_summary`; it does not
subscribe other hosts or read their private transcripts. The managed crontab block
runs the shared runtime and preserves unrelated entries. Codex, Gemini, OpenCode
and jeo can use copied operating documents and invoke the shared runtime; this is
not equivalent native hook support. The automated model runner remains Claude CLI
with the configured model, regardless of the interactive host.

Indexes are separately initialized with separate approval. Setup reports missing
`.mex`, `.zvec-grep` and `graphify-out` as `pending_initialization`; it does not
claim they are ready. The portable `ctx_guard.py` retains mex graph, zvec retrieval,
Graphify checkpoint and vault-retention roles without importing or changing a
private `~/.local/bin/ctx` or HOME package. It implements no legacy GC, archive,
purge or raw deletion.

## Routing skill only and legacy jeo validator

`npx skills add https://github.com/akillness/jeo-skills --skill obsidian-second-brain`
installs the routing front door, not an initialized vault. Bare
`bash scripts/install.sh` retains routing-skill installation and optional legacy
jeo advisory validation. It is not the preferred consented runtime setup.

| Installer variable | Scope |
|---|---|
| `JEO_SECOND_BRAIN_CONFIG` | Select the reviewed new-vault setup; this path bypasses routing-only install and legacy validator wiring. |
| `JEO_SECOND_BRAIN_SOURCE` | Optional exact pinned checkout for that setup. |
| `WITH_UPSTREAM=1` | Compatibility selector for the same new-vault path; configuration is mandatory. No upstream `setup.sh` execution. |
| `GLOBAL=1`, `AGENTS` | Routing-skill install scope and agent targets only. Existing non-routing Claude directories are parked/restored during global routing installation, not pulled or upgraded. |
| `JEO=1\|0\|auto`, `JEO_CONFIG`, `VAULT` | Legacy advisory `post-turn` validator target/settings; not data, model, schedule or PostCompact approval. |
| `UNINSTALL=1` | Remove only the legacy jeo AI-first hook with backup; not a runtime/vault/schedule uninstall. |

In jeo invoke `$obsidian-second-brain <intent>` or an unambiguous prefix such as
`$obsidian-s`. **`$obsidian` exact-matches the separate `obsidian` skill.** Slash
aliases are discovery hints in jeo, not its invocation mechanism. The legacy
validator warns on AI-first markdown issues; it cannot supply SessionStart or
PostCompact events that jeo does not expose.

## Manual upstream recipes: unsafe/global operator-only

Upstream quick-install and `scripts/setup.sh` recipes may modify global Claude
skills/settings and use upstream background behavior outside this adapter's
new-vault/proposal boundaries. They are **not the recommended default** and are not
executed by this installer. Upstream build/wrapper scripts and the optional research
toolkit likewise require their own review before execution; copied availability is
not approval for network calls, keys, dependencies or host mutation. Interactive
command documents can describe URL/PDF/audio/research workflows, but those are not
implemented binary extractors in the automatic text-source runtime.

Start with the reviewed configuration and the read-only preview above; do not use
an upstream global setup recipe to bypass a refused consent or existing-vault gate.
