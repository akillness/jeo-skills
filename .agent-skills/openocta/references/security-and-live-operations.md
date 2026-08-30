# Security and Live Operations

## Why the safety boundary matters

OpenOcta can combine a language model with Bash, file mutation, process control,
remote systems, MCP tools, scheduled jobs, webhooks, and IM channels. A model's
helpful intent is not an authorization policy. Treat every connected system and
tool as a separate capability with its own identity, scope, approval, audit, and
revocation path.

## Minimum production posture

### Gateway

- Use desktop or loopback binding for local-only work.
- Treat `gateway.bind: lan` or equivalent service exposure as a network launch.
- Require gateway authentication in service mode even where upstream config
  permits an unauthenticated state.
- Keep the bind address and firewall narrower than the reachable network.
- Do not place a token in a command line, chat transcript, screenshot, support
  bundle, or source-controlled config.
- Test authenticated and unauthenticated health behavior from the intended
  client boundary.

Source truth uses port 18900 by default. A stale CLI help string says 18789; do
not open both ports merely to work around that discrepancy.

### Hooks

OpenOcta documents agent, alert, and wake webhook routes. Hooks are disabled by
default, but the token is optional in the upstream schema. This skill treats a
token as mandatory whenever hooks are enabled.

Rules:

1. keep hooks disabled until a concrete sender and payload contract exist;
2. use a strong token delivered outside URLs;
3. reject query-string credentials;
4. restrict source network, payload size, event type, and target agent;
5. map untrusted fields as data, never as new instructions;
6. prevent a webhook from silently obtaining Bash or production-remediation
   authority;
7. test replay, duplicate, malformed, and expired events;
8. log event identity and outcome without secrets.

A config audit returns `BLOCKED` for hooks enabled without a token.

### Sandbox

Upstream documents sandbox and validator defaults as enabled, with local network
and workspace-oriented defaults. Configure them explicitly for an operations
host rather than depending on mode- or version-specific fallback behavior.

- Use absolute allowed paths.
- Exclude home, credential, SSH, cloud config, browser profile, and unrelated
  repository roots unless a task truly needs them.
- Keep network destinations to named model, monitoring, ticketing, cloud, and
  MCP endpoints.
- Review symlink resolution and path traversal.
- Treat CPU, memory, and disk limits as guardrails, not capacity planning.
- Test denied paths and destinations as well as allowed ones.

### Command policy and validator

The current source supports a command policy with `deny`, `ask`, `allow`, and an
unmatched default. Keep the default at `ask` or `deny`.

Always deny destructive platform primitives unless a narrowly reviewed workflow
has a safer dedicated tool. Examples include disk formatting, raw device writes,
shutdown, reboot, privilege escalation, recursive root deletion, and disabling
security controls.

Put read-only inventory commands on a small allowlist only after checking their
arguments and target. A command name alone is not enough: `kubectl`, database
clients, cloud CLIs, and package managers can read or mutate depending on flags
and subcommands.

### Approval queue

Upstream documents `approvalQueue.enabled` as false by default. Enable it
explicitly for live operations.

- "approve" should allow one exact request.
- whitelist should be rare, scoped to one session and command family, and have a
  short TTL.
- denial must remain available even after earlier approvals.
- approval identity, request, arguments, target, timestamp, and result belong in
  an audit record.
- never approve a shell fragment that is truncated, templated with untrusted
  data, or missing its target environment.

The approval store is operationally sensitive even if it has no model key. Lock
down its filesystem permissions and include it in incident review.

### CozeLoop tracing

At v1.0.8, omitting the `cozeloop` section enables Eino trace export with a
workspace and credential bundled in source. This is an outbound data path, even
when the user's model and Knowledge Vault are local.

Set `cozeloop.enabled: false` explicitly unless the user approves tracing. If
approved, use an operator-owned workspace and credential, document what prompt,
tool, output, and metadata fields leave the host, and define retention and
revocation. Environment variables for token and workspace can re-enable export,
so verify key presence without printing values. The config auditor returns
`cozeloop_disabled_but_credentials_reenable_export` as a `BLOCKED` issue when a
false flag still resolves both credential fields.

### Local CLI agents

The `local_agent` tool delegates tasks to installed OpenClaw, Hermes, Cursor,
Codex, OpenCode, or Trae CLIs. At v1.0.8 it is enabled when `localAgents` or its
`enabled` field is absent, and an empty `allowed` list permits all recognized
installed agents. The schema's `requireApproval` field is not read by the tool
or runner at this pin.

Default to:

```json
{"localAgents": {"enabled": false}}
```

If delegation is intentionally enabled, provide a narrow `allowed` list, isolate
the working directory, cap timeout and concurrency, account for provider cost,
and put `local_agent` behind the effective command and approval policy. Do not
rely on `requireApproval` as the sole gate.

## Posture example

This is a shape, not a complete copy-paste configuration. Resolve the current
schema at the pinned version and provide the token privately.

```json
{
  "cozeloop": {
    "enabled": false
  },
  "localAgents": {
    "enabled": false
  },
  "gateway": {
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "<set privately>"
    }
  },
  "hooks": {
    "enabled": false
  },
  "security": {
    "sandbox": {
      "enabled": true,
      "allowedPaths": ["<dedicated workspace>"],
      "networkAllow": ["localhost", "127.0.0.1"]
    },
    "commandPolicy": {
      "enabled": true,
      "defaultPolicy": "ask",
      "deny": ["sudo", "dd", "mkfs", "shutdown", "reboot"]
    },
    "approvalQueue": {
      "enabled": true,
      "timeoutSeconds": 300
    }
  }
}
```

Do not commit the populated result. The config auditor shows field names and
posture without values:

```bash
python3 .agent-skills/openocta/scripts/audit-openocta.py config \
  --config /path/to/openocta.json \
  --run-mode service \
  --format json
```

## Local-first does not mean offline

Sessions and knowledge may stay on the local machine by default, but configured
features can send data to:

- public model providers;
- the OpenOcta site API for marketplace, tutorials, and package data;
- MCP servers;
- monitoring, logging, cloud, ticket, database, or bastion endpoints;
- IM providers and webhook senders;
- browser-controlled websites.

For every path, record what data leaves, legal and retention boundaries, TLS and
proxy behavior, service account scope, and how to revoke access. Avoid sending
raw production logs, customer data, secrets, or infrastructure topology to a
model without explicit authority and redaction.

## Channel and remote-command safety

Channels turn chat events into an agent entry point. Separate these permissions:

1. receive an event;
2. read attachments or linked content;
3. reply to the sender;
4. call read-only tools;
5. execute mutations;
6. administer the channel or credentials.

Use sender and conversation allowlists. In groups, require an explicit mention
or command form where supported. Bind one channel to one bounded agent profile,
not the broadest local agent. Disable execution for attachments and arbitrary
URLs until they are scanned and reviewed.

Go-live requires confirmation because it changes who can cause work and where
responses are sent.

## Production target rules

### Hosts and SSH

- use a dedicated account;
- start with inventory-only commands;
- restrict hosts and jump paths;
- do not allow agent-generated hostnames to escape the inventory;
- require confirmation for service restart, package change, process termination,
  firewall, account, or filesystem mutation.

### Kubernetes

- use a narrow namespace and read-only role first;
- pin context and cluster before every command;
- never let model text choose a context silently;
- separate describe/log access from apply/delete/exec;
- verify desired and observed state after any approved mutation.

### Databases

- use a read-only account for diagnosis;
- cap rows, time, and cost;
- remove customer and credential fields before model use;
- treat DDL, DML, kill, failover, backup restore, and privilege changes as
  separate confirmed operations;
- verify on the database, not only in the agent transcript.

### Cloud and FinOps

- separate inventory, billing read, resource mutation, and IAM;
- avoid account-wide wildcard permissions;
- require a resource identifier and region in every mutation;
- verify tags, ownership, dependency, and rollback before stopping or deleting.

## Schedules and autonomous runs

A schedule is standing authority. Before creation or enablement, freeze:

- owner and purpose;
- exact read-only or mutating tools;
- targets and environment;
- frequency, timeout, and concurrency;
- spend and rate limits;
- output destination;
- alert and approval behavior;
- expiration and disable path.

Do not use a schedule to avoid per-run confirmation for mutations. Test once
manually in a non-production target, then confirm the recurring authority.

## Incident workflow

1. Freeze the alert, target, time window, release/change context, and user impact.
2. Gather read-only evidence from the authoritative system.
3. Distinguish observation, hypothesis, and recommendation.
4. Use `log-analysis` for noisy logs and `debugging` for a narrowed code failure.
5. Rank one or two reversible next checks.
6. Review and confirm the exact remediation.
7. Execute one change.
8. Verify service health, user impact, and rollback criteria.
9. Record outcome without secret values.

OpenOcta can assist this loop; it does not become the incident commander or the
authority to mutate production by being connected.

## Singleton process behavior

Packaged startup calls code that terminates other processes whose executable
basename matches `openocta` or `openocta-launcher`. Before diagnosing a process
that disappears, check:

- whether two launchers or a service plus desktop app are starting;
- which state directory and run mode each uses;
- whether the packaged singleton logic ran;
- whether `OPENOCTA_SKIP_SINGLETON_KILL=1` is appropriate for a short controlled
  reproduction.

Do not leave the override enabled as a permanent workaround. Resolve duplicate
ownership instead.

## Primary sources

- Security: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/security.md
- Permission settings: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/permission-settings-configuration.md
- Webhooks: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/webhooks.md
- Command policy source: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/src/pkg/agent/runtime/command_policy.go
- Command validation source: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/src/pkg/agent/runtime/command_validation.go
- CozeLoop trace setup: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/src/pkg/agent/eino/cozeloop.go
- Local-agent tool: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/src/pkg/agent/tools/local_agent_tool.go
- Singleton behavior: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/src/pkg/appinstance/kill_others.go
