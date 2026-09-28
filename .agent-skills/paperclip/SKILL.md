---
name: paperclip
description: >
  Operate Paperclip's agent-company control plane: inspect and configure companies,
  agents, projects, workspaces, issues, company skills, routines, heartbeats, artifacts,
  and integrations. Use when the user names Paperclip or paperclipai, asks to manage a
  Paperclip company, agent, task, skill, routine, or run, or needs Paperclip setup or
  troubleshooting. Also triggers on agent company, Paperclip heartbeat, or Paperclip
  control plane. Route local tmux lifecycle work to agent-manager, executive-team app
  operations to openexecutive, and team architecture to harness.
allowed-tools: Bash Read Write Edit
metadata:
  version: "1.0"
  source: https://github.com/paperclipai/paperclip
---

# Paperclip

## When to use this skill

Use this guide for requested Paperclip inspection, configuration, troubleshooting, installation planning, or operation involving companies, agents, projects, workspaces, issues, skills, routines, heartbeats, artifacts, or integrations.

This is an operator guide, not permission to install or run the Paperclip server, start agents, call live APIs, or change company state by itself.

## Choose the right surface

- Use `paperclip` for Paperclip companies, agent identities, assignments, projects, workspaces, issues, heartbeats, routines, company skills, artifacts, and Paperclip integrations.
- Use `agent-manager` for local tmux/Python agent lifecycle management without Paperclip.
- Use `clawteam` for ClawTeam's team, task, inbox, worktree, and board workflow.
- Use `openexecutive` for the fixed self-hosted virtual-executive application.
- Use `harness` to design an agent team or its role boundaries before choosing a runtime.

Do not treat these surfaces as aliases just because a request says "multi-agent".

## Instructions

1. **Classify the request.** Separate read-only inspection, local installation, company/agent configuration, task execution, scheduled automation, and troubleshooting.
2. **Inspect before changing state.** Check the installed Paperclip version and its CLI help, the configured API origin, company/project/agent/issue identifiers, and the relevant current state. Do not assume a default company or infer IDs from names when the API can disambiguate them.
3. **Load the narrow reference.** Use `references/upstream-map.md` to select the upstream API, routine, company-skill, artifact, or workflow reference that matches the request. Validate its instructions against the installed Paperclip version before using an API payload or command.
4. **Scope the change.** State the exact target, mutation, schedule/trigger, permission boundary, and expected result. Perform only the action the user requested. Ask before destructive, irreversible, externally visible, paid, or wider-than-requested changes.
5. **Execute through the supported surface.** Prefer the installed `paperclipai` CLI when its version supports the operation. For direct API calls, follow the installed API schema and authorization rules. Never expose API keys, webhook secrets, or provider credentials in chat or logs.
6. **Verify by reading back.** After a write, inspect the affected object and confirm the fields/state the server accepted. A successful process exit alone is not proof. After a timeout or empty response, read the object before retrying to avoid duplicate writes.
7. **Report exact status.** Separate attempted, accepted, and verified actions. If a task is blocked by missing IDs, permissions, credentials, or an ambiguous policy choice, name the smallest missing input instead of guessing.

## Safety rules

- A Paperclip company is a data boundary. Verify the company ID on every cross-company operation; never reuse one company's IDs or credentials for another.
- During an agent heartbeat, preserve the supplied run identity. Mutating issue requests must carry the actual `X-Paperclip-Run-Id` when required by that heartbeat. Never invent a run ID or claim an agent completed work without evidence.
- Do not install Paperclip or its dependencies as part of blanket skill setup. Do not pipe a remote installer directly into a shell. For a requested installation, inspect the official installer and release-specific guidance first; treat network binding, auth mode, database changes, and service exposure as separate decisions.
- Do not create, hire, wake, or reassign agents; run a heartbeat; create/enable a routine; or publish an artifact unless the user asked for that specific operation and the required target/policy values are known.
- Deleting, resetting, replacing a complete desired-skill set, archiving a routine, rotating a webhook secret, or changing public/remote access requires explicit confirmation for that exact target. Routine archival is terminal in the reviewed API contract.
- Use least-privilege credentials from a secret manager or existing environment. Do not print environment values, copy secrets into files, or request secrets through chat.

## Common Paperclip workflows

### Agent task / heartbeat

- Read the assigned issue and agent context first; preserve the issue's acceptance criteria and existing state.
- In an active heartbeat, use the task-provided run context and include its run ID on modifying API requests where required. Prefer the official issue-update helper when it is present in the audited checkout; its dry-run and response checks are described in `references/operator-playbook.md`.
- After an update, read the issue back. If a request times out, reconcile the live issue state before retrying. Report `blocked` or `in_progress` honestly; do not mark work `done` merely to close a loop.

### Company skills

- Separate **installing a skill in the company library** from **assigning it to an agent**. Installing alone does not make the agent use it.
- Browse and inspect the built-in catalog before importing an external source. Then sync the selected company-skill key/id/unique slug to the agent.
- Prefer merge mode `add` for a narrow assignment. Use `replace` only after the user explicitly approves changing the agent's entire desired-skill set.

### Routines

- Before creating or editing a routine, establish its agent, project, timezone, trigger, concurrency policy, catch-up policy, and activity-gate behavior.
- Prefer an explicit concurrency and missed-run policy over relying on a default. `coalesce_if_active` prevents overlapping active runs from multiplying; `skip_missed` drops missed scheduled ticks. Use a different policy only when the user wants that behavior.
- Distinguish pausing from archiving. Archiving is terminal in the reviewed contract; do not archive as a reversible pause.

### Artifacts

- Treat artifact upload as a state-changing operation. The upstream helper creates an issue attachment and, by default, an attachment-backed work product; it may also bind a comment to an external chat response. Preview resolved settings with `--dry-run` and confirm the issue/company, file, title, status, and whether a work product/comment is intended before a live upload.
- If an upload's result is indeterminate, reconcile by listing attachments before retrying. The helper's `--retry-unknown-upload` explicitly accepts duplicate-file risk; never add it automatically.
- A saved Paperclip comment does not prove that an external chat provider delivered the message. Verify delivery in the authorized destination when external delivery was requested.

## Examples

- “Install a skill for the QA agent without removing its current skills” means inspect the company library and use additive agent sync, then read back both states.
- “The issue update timed out; should I retry?” means read the issue and run context first; do not infer whether the write committed.
- “Create a routine that avoids a pile-up” means resolve the agent/project, timezone, concurrency, and missed-run policy before creating it.

## Best practices

- Prefer the installed version's CLI help and API schema over pinned examples.
- Ask for missing IDs or policy choices instead of guessing; distinguish attempted, accepted, and verified state.
- Keep company boundaries, credentials, network exposure, and external delivery explicit.

## References

- `references/operator-playbook.md` — operational decision points and the upstream helper-script behavior.
- `references/upstream-map.md` — source paths, reviewed revision, and version-drift rules.
