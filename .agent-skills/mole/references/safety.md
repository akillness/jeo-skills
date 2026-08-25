# Mole — safety model, recovery, and known limits

Mole's own framing: *"When Mole cannot prove an item is safe to change, it
skips or refuses it."* A skip with a reason is the product working. Do not
route around it.

Upstream docs: `SECURITY.md`, `SECURITY_AUDIT.md`, `docs/SECURITY_DESIGN.md`.

## Which commands delete, and how

| Command | Deletion mode | Recoverable? |
|---|---|---|
| `mo clean` | **permanent** | No — "there is usually nothing to restore" |
| `mo purge` | **permanent** | No (rebuild or re-download instead) |
| `mo installer` | **permanent** | No |
| `mo uninstall` | Trash (default) | Yes, until Trash is emptied. `--permanent` bypasses |
| `mo analyze` | Trash after confirmation | Yes, until Trash is emptied |
| `mo optimize` | not file deletion | Refreshes caches/services; effects are re-derived |
| `mo remove` | removes Mole itself | Reinstall |

This table is the single most important thing to state before a real run.
`mo clean`'s permanence is exactly why the dry-run is mandatory.

## The five protection layers

1. **`validate_path_for_deletion`** (`lib/core/file_ops.sh`) — six checks:
   non-empty and absolute; leaf symlink resolution; **ancestor** symlink
   canonicalization (deny-only, evaluated before the allow-list); `..` rejected
   as a full path component; control characters rejected; allow-then-deny
   matching.
2. **The `# SAFE:` contract** — raw `rm -rf` is only permitted inside
   `safe_remove` / `safe_sudo_remove`, or with an inline
   `# SAFE: <one-sentence reason>` annotation on the same line. CI enforces it
   by whitelist grep.
3. **App protection lists** (`lib/core/app_protection_data.sh`) —
   `SYSTEM_CRITICAL_BUNDLES_FAST` (wildcards, for cleanup),
   `SYSTEM_CRITICAL_BUNDLES` (explicit IDs, for uninstall — must be
   exhaustive), `APPLE_UNINSTALLABLE_APPS` (the Xcode / Final Cut / Logic /
   GarageBand / iWork / MainStage allow-list), `DATA_PROTECTED_BUNDLES`.
4. **Trash routing by default** for user-facing removals — `mo analyze` uses a
   Finder AppleScript move with a 30s timeout; permanent deletion requires an
   explicit `--permanent` or `mo clean`'s batched path.
5. **Test mode, dry run, and property tests** — `tests/path_validation_fuzz.bats`
   asserts every adversarial path in `tests/fuzz_corpus/dangerous_paths.txt` is
   rejected, plus a Go fuzz target (`go test -fuzz=FuzzValidatePath ./cmd/analyze`).

## Protected paths

**Never deleted (prefixes):**

```
/    /System    /bin    /sbin    /usr    /etc    /var    /private    /Library/Extensions
```

**Allow-listed subpaths under those roots:** `/private/tmp`,
`/private/var/tmp`, `/private/var/log`, `/private/var/folders`,
`/private/var/db/diagnostics`, `/private/var/db/DiagnosticPipeline`,
`/private/var/db/powerlog`, `/private/var/db/reportmemoryexception`, and
`/System/Library/Caches/com.apple.coresymbolicationd/data`.

**Never-delete bare roots** (guards against an empty variable collapsing a
path): `/Applications`, `/Library`, `/Library/Application Support`,
`/Volumes`, `/opt`, `/Users`, `/Users/<name>`, `/var/root`.

## Protected categories

- Keychains, password managers, credentials
- VPN / proxy tooling — Shadowsocks, V2Ray, Clash, Tailscale, AmneziaWG,
  WireGuard, NetworkExtension preferences
- AI tools — Cursor, Claude, ChatGPT, Ollama; Codex Desktop runtime state
- OrbStack live images (`~/.orbstack`, `dev.orbstack.*`,
  `dev.kdrag0n.MacVirt`) while `~/Library/Caches/dev.orbstack.OrbStack`
  stays cleanable
- Browser history and cookies
- Apple app group containers, including `group.com.apple.notes`
- Time Machine data during an active backup
- `com.apple.*` LaunchAgents / LaunchDaemons, and user
  `~/Library/LaunchAgents/*.plist`
- iCloud `Mobile Documents`

## Hard refusals

- Software Update staging trees (`/Library/Updates`, `/macOS Install Data`)
  are a read-only surface — directory age and process lists cannot prove they
  stay inactive across a scan-to-delete window.
- The active PowerLog database
  (`/private/var/db/powerlog/.../CurrentBackgroundProcessingDB.BGSQL` and its
  `-wal` / `-shm`) is never deleted, truncated, or vacuumed.
- No privileged path-based delete or move runs through an ancestor the
  invoking user can mutate; those paths downgrade or fail closed.
- Leftover matching stays on exact app or bundle-ID evidence. Vendor-wide,
  TeamID-prefix, generic-name, and fallback wildcard deletion are out of scope
  by policy.
- Git worktree staleness is treated as undecidable — only whitelisted
  rebuildable artifacts inside a worktree are cleaned, never the worktree.

## Audit trail and recovery

```
~/Library/Logs/mole/operations.log
~/Library/Logs/mole/deletions.log     # timestamp, mode, size, status, path (TSV)
```

Read them with `mo history` / `mo history --json`. Disable logging with
`MO_NO_OPLOG=1`; relocate with `MOLE_OPLOG_PATH`.

**"Did Mole take my file?"** — do not guess. Pull the deletions log via
`mo history --json`, quote the actual line, then add the path to
`mo clean --whitelist` so the next run leaves it alone.

**No telemetry.** Mole never reports what was scanned, deleted, or attempted.

## Install integrity

Releases carry `SHA256SUMS` plus a GitHub build-provenance attestation.
`install.sh` is fail-closed: a checksum or attestation mismatch aborts and
names the cause, and it must never downgrade to a quieter source build. If a
gate refuses, it names which cause it hit and what to run next — read that line
rather than blindly reinstalling.

## Permissions

Full Disk Access is **recommended, not required**. Mole pre-checks TCC to avoid
mid-run prompts and will say *"Grant Full Disk Access to your terminal in
System Settings for best results"*. Cache cleanup may surface several
permission dialogs; all need approval. Trash failures point at App Management,
App Data, or Full Disk Access for the terminal app.

## Known limitations (from `SECURITY_AUDIT.md`)

- Cleanup is destructive and most flows have no undo.
- `mo uninstall` Trash routing still depends on local permissions and volume
  behavior.
- Orphan-data heuristics are age-based: generic orphans wait 30 days, Claude VM
  orphans wait 7 days.
- Time Machine safety windows are hour-based and deliberately conservative.
- Localized app names can still be missed by heuristic paths.
- `mo history --json` escapes bytewise under `LC_ALL=C` for Bash 3.2
  portability; it is not Unicode-codepoint-aware.
- Bundle-ID matching is case-sensitive glob, and macOS ships inconsistent
  casing across releases (e.g. `com.apple.bootcampassistant` alongside
  `com.apple.BootCampAssistant`).
- Downstream package-manager trust depends on external infrastructure.

## Reporting a security issue

Private disclosure only: email `hitw93@gmail.com` with subject
`Mole security report`. Do not open a public issue for an unpatched
vulnerability. Include the Mole version and install method, macOS version, the
exact command, reproduction steps, and whether the issue involves deletion
boundaries, symlinks, sudo, path validation, or release/install integrity.
