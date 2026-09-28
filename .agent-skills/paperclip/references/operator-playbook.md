# Paperclip Operator Playbook

This file summarizes the Paperclip workflows that carry the most state or retry risk. The upstream source is pinned in `upstream-map.md`; re-check the installed release's CLI help and API reference before applying a payload.

## Setup and test runs

- Treat `paperclipai --help` and the installed release's docs as the local command contract. Do not use `npx` merely to check whether the CLI exists; it can fetch and execute a package.
- If the user asks for a disposable trial, review the current official `test-drive` flow first. It can initialize local state and open a local service, so it is not a blanket-setup or read-only check.
- For a persistent installation, inspect the official installer before running it. Confirm the install location, database/backups, authentication mode, bind address, and whether any service should start automatically. Keep default access local unless the user explicitly asks for a remote surface and the auth/network boundary is known.
- Do not configure a paid model provider, enter credentials, connect external chat, or create a company/agent as an incidental part of installation.

## Issue updates inside a heartbeat

The reviewed `scripts/paperclip-issue-update.sh` helper accepts an issue ID, optional status/comment, and `--dry-run`. It reads a multiline comment from stdin, builds a JSON payload, and for live requests requires `PAPERCLIP_API_URL`, `PAPERCLIP_API_KEY`, and `PAPERCLIP_RUN_ID`. It sends the run ID as `X-Paperclip-Run-Id`, accepts only a non-empty successful response, and checks that an echoed status matches the requested one.

- Prefer this helper only when it is actually available from an inspected Paperclip checkout and matches the installed API version.
- Run `--dry-run` first to inspect the payload. Do not print or copy the API key.
- The helper caps retries at two and treats definitive 4xx responses (except 429) as rejected. Follow its result; do not add an unbounded retry loop.
- After an uncertain failure, read the issue before retrying. A shell/curl status by itself is not the final state.

## Company skill install and assignment

The upstream company-skill model has separate steps:

1. Browse and inspect the app-shipped catalog first when it may contain the requested skill.
2. Install the selected catalog skill or import the exact user-approved source into the company library.
3. Read back the library entry and its skill file.
4. Sync the skill to the intended agent. Use `add` to preserve other desired skills; use `replace` only after explicit approval to replace the complete set.
5. Verify the agent's resulting assignment.

A company-library install alone does not attach the skill to an agent. Use the CLI or API schema for the running release; do not reuse an ambiguous slug when a key or ID is available.

## Routines

Before creating a routine, make the following choices explicit:

- assigned agent and project;
- schedule/webhook/API trigger and timezone, if applicable;
- concurrency policy for an already-active run;
- catch-up behavior after downtime;
- whether quiet scheduled ticks should be skipped and at what scope.

The reviewed contract defines `active <-> paused` and `active -> archived`; archived routines cannot be reactivated. The documented defaults are `coalesce_if_active` for concurrent work and `skip_missed` for missed scheduled runs. Do not rely on defaults when the user's desired behavior differs or is unclear. Read the routine and its runs back after any mutation.

Webhook secret rotation invalidates the previous secret. Treat it as a credential rotation, not an ordinary edit. Store the returned secret only in an approved secret manager.

## Artifact uploads

The reviewed `skills/paperclip/scripts/paperclip-upload-artifact.sh` helper is more than a file copier:

- Live upload requires API URL/key, company ID, task ID, and run ID.
- `--dry-run` prints the resolved upload settings without calling the API.
- By default it uploads an issue attachment and creates an attachment-backed artifact work product with status `ready_for_review` and `isPrimary: true`; optional `--chat-comment` also creates an issue comment linked to the attachment.
- It hashes the file and reconciles existing attachments from the same run before uploading. An unresolved transport outcome leaves an uncertainty marker; the helper waits/reconciles instead of silently sending a duplicate.
- `--retry-unknown-upload` explicitly accepts duplicate-file risk. Do not add it unless the user has confirmed the prior operation did not commit or explicitly accepts that risk.
- A saved comment is not evidence that an external chat provider delivered a message.

Before a live upload, confirm the exact file and issue/company target, whether an artifact work product is intended, title/summary/status, and whether any chat comment should be created. Verify the returned attachment and work-product IDs by reading the resulting issue state.

## Recovery and retry discipline

For any timed-out or partially successful write:

1. Stop automatic retries.
2. Read the target object and relevant run/attachment list using the same company boundary.
3. Compare returned IDs, status, run ID, and timestamps with the intended operation.
4. Retry only if the write is proven absent and the operation is safe to repeat; use the documented idempotency mechanism when available.
5. Report uncertain state as uncertain, not as success or failure by guess.
