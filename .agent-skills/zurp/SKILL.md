---
name: zurp
description: >
  Operate facebookincubator/Zurp, the MIT-licensed Meta bug-bounty research toolkit
  combining a Burp Suite Java extension with three standalone stdio MCP servers:
  meta-context, fbdl, and sparta. Use when fitting or preflighting a checkout, building
  the Jar or MCP package, registering servers, configuring researcher-token/proxy/TLS
  settings, running controlled FBDL/Meta-context/SPARTA workflows, or troubleshooting
  403, token, rate-limit, startup, or SSL failures. Triggers on Zurp, bug-bounty-research,
  FBDL MCP, Meta Context, SPARTA, zurp.jar, or BB_RESEARCH_TOKEN.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Audited against upstream commit c30c04edd8a0a85f3ee980324b7edc8e814fadb3.
  The Burp extension needs Burp Suite 2024.7+; a source build needs Java 17+ and
  Gradle. The MCP package needs Node 22.19.0+ and npm plus an MCP client speaking
  stdio. Live API calls require an enrolled Meta bug-bounty researcher token.
  Host-specific MCP registration, Burp UI actions, network access, and credentials
  are approval-gated.
license: MIT
metadata:
  version: "1.1.0"
  source: https://github.com/facebookincubator/Zurp
  upstream_commit: c30c04edd8a0a85f3ee980324b7edc8e814fadb3
---

# Zurp operator guide

Zurp has two independently auditable surfaces:

- the Java Burp extension (`zurp.jar`), which handles request annotations and
  FBDL/CSRF/sprinkle integration; and
- `bug-bounty-research/`, a Node package exposing `meta-context`, `fbdl`, and
  `sparta` over stdio MCP.

This wrapper is pinned to [`c30c04e`](https://github.com/facebookincubator/Zurp/tree/c30c04edd8a0a85f3ee980324b7edc8e814fadb3).
Read [`references/upstream.md`](references/upstream.md) for the audited command,
configuration, provenance, and per-tool evidence before relying on a detail not
included here.

## When to use this skill

- Fit-check or offline-preflight a supplied Zurp checkout.
- Build the Java Jar or Node MCP package, then verify artifacts without spending API budget.
- Register absolute `dist/*.js` entry points with an MCP client.
- Route one `meta-context`, FBDL, SPARTA, or Burp request workflow and troubleshoot its first failure.

Use `mcp-builder` for generic MCP authoring, the browser skills for unrelated browser work,
and the checked-out upstream skills for detailed per-tool procedures. This skill does not
replace those sources.

## Instructions

### 1. Select one mode

Choose `fit`, `preflight`, `setup-build`, `register`, `use`, `verify`, or `troubleshoot`.
State the selected surface (Burp, MCP, or both), requested side effect, checkout path,
and approval boundary before acting. Complete the mode only when its artifact, blocker,
or evidence is explicit.

### 2. Run the offline preflight first

The helper checks the host OS/architecture, Python 3.10+, the selected toolchain (Java/Gradle
for `burp`, Node/npm for `mcp`, or both for `all`), the public checkout shape, and an optional
caller-supplied commit. It does not inspect token values, environment files, or credentials;
it sanitizes inherited Git variables for bounded local revision checks, invokes no Java/Node/
upstream process, and makes no writes.

From the repository root:

```bash
python3 .agent-skills/zurp/scripts/preflight.py --json --surface mcp --repo /path/to/Zurp \
  --expect-commit c30c04edd8a0a85f3ee980324b7edc8e814fadb3
```

From an installed skill root:

```bash
python3 "$SKILLS_ROOT/zurp/scripts/preflight.py" --json --repo /path/to/Zurp
```
Use `--surface mcp` for the Node/npm surface, `--surface burp` for Java/Gradle, or omit it
(`all`) to audit both toolchains. A non-selected toolchain is not a blocker.

Exit `0` means the local checks passed; exit `1` reports missing/mismatched prerequisites
or a failed local audit; exit `2` means invalid arguments. `runtime_verified` remains false:
tool presence is not a version, network, enrollment, or API-health claim.

### 3. Inspect, then build only with approval

For a checkout, inspect `git -C /path/to/Zurp rev-parse HEAD` and the source-owned files
listed in the reference. A different revision requires a fresh source read. Cloning,
checkout, dependency installation, and updates are network or write operations.

Source-owned build paths:

```bash
cd /path/to/Zurp && gradle jar       # build/libs/zurp.jar
cd /path/to/Zurp/bug-bounty-research && npm install && npm run build
npm run typecheck                    # optional confidence check
```

`npm install` writes dependencies and may use the network. Do not start an MCP server merely
to prove that a process stays open; verify with a client-side, no-tool-call handshake instead.

### 4. Keep endpoint, scope, and replay gates

Before any live call, resolve the server-specific API base URL, then the shared base URL,
then the documented default. The pinned source accepts arbitrary URLs; inspect normalized
scheme and host. Send a real researcher bearer token only to documented
`https://api.facebook.com`; custom/test hosts require separate approval and a non-production
credential. Never print or copy token values.

Use read-only Meta Context resolution or FBDL language/reference tools before API-backed runs.
FBDL runs are one-at-a-time and have source-documented cooldowns; create a run only with
explicit approval. SPARTA findings are leads, and a built PoC is a template, not a verdict.
Keep placeholders tied to controlled FBDL assets and obtain human approval before any
state-changing Burp or GraphQL replay against researcher-owned accounts.

### 5. Verify and troubleshoot the first material failure

For MCP, check the three entry points (`dist/meta-context/index.js`, `dist/fbdl/index.js`,
`dist/sparta/index.js`) and list tools by server without invoking a tool. For Burp, verify
the Jar and loaded extension only through the approved host. Empty SPARTA results and unresolved
Meta symbols can be valid outcomes; do not loop on latched `401`/`403`, rate limits, or retries.
Use the reference matrix for source warnings, TLS/CA handling, cooldowns, and provenance.

## Examples

### Safe first MCP turn

1. Run the offline helper and compare the supplied checkout only when `--expect-commit` is given.
2. Build only the requested package after approval; inspect absolute `dist/*.js` paths.
3. Handshake with an MCP client and list tools without calling one.
4. Use Meta Context or FBDL language/reference operations first; gate runs and replay separately.

### Absolute-path registration

```text
meta-context -> node /path/to/Zurp/bug-bounty-research/dist/meta-context/index.js
fbdl         -> node /path/to/Zurp/bug-bounty-research/dist/fbdl/index.js
sparta       -> node /path/to/Zurp/bug-bounty-research/dist/sparta/index.js
```

## Best practices

- Re-audit source-owned commands when the checkout is not the audited commit.
- Keep inventory, grammar, and no-budget verification separate from token-backed calls and metered replay.
- Prefer documented CA/proxy settings over disabling TLS verification; treat client config and `user.vmoptions` as plaintext credential surfaces.
- Preserve Meta Context's symbol-versus-source distinction and SPARTA's lead-versus-vulnerability distinction.
- Keep upstream MIT and ported FBDL/ISC provenance intact; inspect per-file history before redistribution.

## References

- [Pinned upstream evidence and source/command matrix](references/upstream.md)
- [Zurp source at the audited commit](https://github.com/facebookincubator/Zurp/tree/c30c04edd8a0a85f3ee980324b7edc8e814fadb3)
- [Meta Bug Bounty terms](https://www.facebook.com/whitehat)
- [FBDL access criteria/token page](https://www.facebook.com/whitehat/fbdl/)
