# Rowboat pinned-source operator notes

**Repository:** `rowboatlabs/rowboat` at `eb3122953a4bdb96ba43914bc12ed763202ea976` (observed 2026-10-16). These are source-derived workflow notes, not a claim that the current release/runtime was exercised.

## Product and boundary

The root README describes a personal/team AI work application with email, notes, browser, meeting notes, code mode, and workspaces. Its knowledge surface indexes work context into an Obsidian-style backlinked graph. The core knowledge README describes source files (email/transcripts), generated Markdown notes under `WorkDir/knowledge/`, build state in `WorkDir/knowledge_graph_state.json`, and sync integrations. Do not recast that feature as a separate database product.

## Setup and configuration path

- The root README directs users to the Rowboat downloads page for Mac/Windows/Linux. The checked-in `apps/x/package.json` describes the app workspace and its `dev`, build, `test`, and `typecheck` scripts. For source development, first inspect the current checkout's package manager/runtime docs and scripts; do not assume an install command from a stale checkout.
- `apps/x/packages/core/src/config/rowboat.ts` fetches and validates API config from `${API_URL}/v1/config`, caching the parsed result for the process. That is an app configuration client, not a recipe for local secrets. Find the credential-free setup instructions in the current checkout before handling auth.
- Root README describes an isolated built-in browser, so account access there is distinct from the user's ordinary browser. Connecting any account or importing mail/meeting material requires explicit approval and least-privilege scope.

## Knowledge graph lifecycle

1. Sync scripts fetch configured sources and save them as Markdown before calling `buildGraph`.
2. The graph builder loads per-file state, skips unchanged sources using an mtime check followed by a content-hash check when mtime differs, and processes changed sources incrementally.
3. It sends one source file per agent run (`BATCH_SIZE = 1` per the pinned knowledge README) to reduce cross-file entity contamination, then creates or updates entity notes and checkpoints state after successful batches.
4. A curation/gardener pass is documented as consolidating eligible accumulated notes, aging old activity into monthly summaries, retiring stale open items, and reconciling note/frontmatter drift. Do not assume every run invokes curation; inspect the current call path and state first.

Owner identity is injected into creation and curation prompts from user configuration and an owner note; the source documentation explicitly warns against guessing identity from email headers. Preserve that guard in any proposed workflow.

## Troubleshooting sequence

- **Missing recent source:** inspect connector/sync result and whether a Markdown source was written before graph diagnosis.
- **Source exists, note absent:** inspect graph-builder logs/result, processed-file state, mtime/hash comparison, and destination note path. A changed mtime alone is not proof the content changed.
- **Duplicate or contaminated entity:** inspect which inputs were grouped; the documented one-file batch exists to limit cross-file contamination. Avoid deleting notes or resetting state as a first response.
- **Stale or bloated notes:** verify whether the curation pass ran and the eligibility/cooldown conditions in the pinned implementation; do not run a bulk rewrite without reviewing its target set.
- **Configuration/API error:** inspect API URL and parsed config shape in source; never print secrets or ask for token values in chat.

## Commands and effect gates

No app command is authorized merely because it appears here. Installation/download and dependency installation require approval. Login, connector authorization, private email or meeting imports, changes to user configuration/state, cloud resource access, database writes, public service activation, and paid uploads each require separate approval. Treat a user-approved app install as not also approving account connection or data import. Do not use this skill to create or upload external content.

For local source-only verification, the parent helper is documented as:

```bash
python3 .agent-skills/rowboat/scripts/preflight.py --repo /absolute/upstream --json
```

The installed-root equivalent is `python3 /absolute/installed/rowboat/scripts/preflight.py --json`. Without `--repo`, the helper performs inventory-only checks. The helper is read-only stdlib code: no subprocess/network/credential-file reads/writes; an explicit absolute, nonsymlink source path is required for `--repo`. Its secure traversal requires Python 3.10+ on POSIX Linux/macOS or WSL2 on Windows; unsupported native platforms fail closed. This is helper support, not a Rowboat upstream app-platform guarantee. It hashes selected pinned public files, not Git HEAD, the full repository revision, dependencies, or runtime. Exit 0 means offline checks passed, 1 means source missing/mismatch, 2 means invalid input; `runtime_verified` remains false. No source download or command execution is part of preflight. These commands are documentation only here.

## Pinned source links

- [README](https://github.com/rowboatlabs/rowboat/blob/eb3122953a4bdb96ba43914bc12ed763202ea976/README.md)
- [Knowledge graph lifecycle notes](https://github.com/rowboatlabs/rowboat/blob/eb3122953a4bdb96ba43914bc12ed763202ea976/apps/x/packages/core/src/knowledge/README.md)
- [Graph builder implementation](https://github.com/rowboatlabs/rowboat/blob/eb3122953a4bdb96ba43914bc12ed763202ea976/apps/x/packages/core/src/knowledge/build_graph.ts)
- [Rowboat API config loader](https://github.com/rowboatlabs/rowboat/blob/eb3122953a4bdb96ba43914bc12ed763202ea976/apps/x/packages/core/src/config/rowboat.ts)
- [App package scripts](https://github.com/rowboatlabs/rowboat/blob/eb3122953a4bdb96ba43914bc12ed763202ea976/apps/x/package.json)
- [License](https://github.com/rowboatlabs/rowboat/blob/eb3122953a4bdb96ba43914bc12ed763202ea976/LICENSE): full upstream text is Apache License 2.0. Permission to use/modify/distribute is subject to its terms, notices, and conditions; this skill copies no upstream code.
