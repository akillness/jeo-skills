---
name: jevgrep
description: >
  Operate Jevgrep (`jg`) as optional remote-agent discovery over explicitly scoped
  skills, wiki pages, or graph source documents. Use only when the user explicitly
  requests Jevgrep and separately approves transmitting source content and queries
  to the configured provider with potential cost. Preserve native catalog,
  exact/LSP/zvec retrieval and Graphify query/path/explain as defaults; Jevgrep does
  not query or rebuild durable graphs.
allowed-tools: Bash Read Grep Glob
compatibility: >
  Requires Node.js 22+ and approved manual installation of @dzhng/jevgrep@0.8.0.
  Remote search requires existing saved upstream provider credentials; the optional
  jeo-skill wrapper requires Python 3.9+.
metadata:
  version: "1.0.0"
  source: https://github.com/dzhng/jevgrep
  license: MIT
---

# Jevgrep — optional remote-agent discovery

## When to use this skill

Use only for an explicit Jevgrep request over a chosen source-document root. A
request to find a skill, search a wiki, or trace a graph does not by itself select
Jevgrep or authorize remote transmission.

Keep existing routes authoritative: catalog metadata search for skill selection,
exact search/LSP for definitions and exhaustive matches, zvec-grep for established
workspace retrieval, and Graphify `query` / `path` / `explain` for graph relations.
Jevgrep searches generic UTF-8 source text, including Markdown or JSON; it does not
traverse graph edges, query database binaries, or own graph regeneration.

## Instructions

### 1. Freeze the source and remote boundary

Name the query, existing root, configured provider, exclusions, and request/output
bounds. Obtain separate approval for sending eligible source content and the query
to that provider, with possible charges. Saved credentials are not data consent.
Keep secrets, personal raw sources, generated graphs, and database files outside
the root or explicitly excluded. Use a narrower root before increasing scope.

Choose one source surface:

| Surface | Root | Retained authority |
| --- | --- | --- |
| Skills | `/path/to/jeo-skills/.agent-skills` or one skill folder | `jeo-skill search`, catalog metadata, then the selected `SKILL.md` |
| Wiki | `/path/to/chosen-vault/wiki` or a relevant subtree | Read `index.md` first; retain vault query/citation/filing rules |
| Graph sources | `/path/to/project/.mex/context` or a source tree | Graphify `query` / `path` / `explain`; existing checkpoint/refresh ownership |

Do not select `.mex/graph.db`, `graphify-out/graph.json`, or a graph-artifact directory
as the default upload surface. A source lookup neither mutates nor rebuilds the
durable graph. Respect project-local graph ownership even when a graph skill's
portable defaults differ.

### 2. Check installation locally; leave auth to the user

Verify an existing `jg` binary's version/help without network calls. The approved
manual install for this contract is:

```bash
npm install -g @dzhng/jevgrep@0.8.0
```

Show this action only after installation approval; do not execute it automatically
because a search was requested. The user operates upstream `jg auth` privately.
Never gather, print, or automate API-key entry. Auth overwrites saved configuration;
search uses that saved provider configuration, not environment API-key/model/endpoint
overrides. `jg doctor` makes a real provider call and may incur charges: it is not a
local prerequisite or an automatic connectivity check.

### 3. Preview locally before remote execution

The upstream count preview is provider-free:

```bash
jg files -- /path/to/chosen-vault/wiki
```

It prints file counts and directory groups, not filenames, snippets, a secrets
audit, or an upload-size estimate. It reads ignore configuration. Inspect the root
and sensitive exclusions with native tools before approving the remote boundary.
Selecting `.agent-skills` or `.mex/context` explicitly does not need `--hidden` for
that root; `--hidden` widens traversal to hidden descendants and needs review.
Repeat `--exclude PATTERN` for extra exclusions; retain upstream ignore rules.

Use the optional wrapper for an inert execution plan:

```bash
jeo-skill explore "Which skill handles vault source citations?" --root /path/to/jeo-skills/.agent-skills --dry-run
jeo-skill explore "Where is the retention decision documented?" --root /path/to/chosen-vault/wiki --dry-run
jeo-skill explore "Which source describes checkpoint ownership?" --root /path/to/project/.mex/context --dry-run
```

If the linked CLI has not been upgraded, use the source-checkout path instead:

```bash
python3 /path/to/jeo-skills/.agent-skills/jeo-skill/scripts/jeo-skill.py explore "Which skill handles vault source citations?" --root /path/to/jeo-skills/.agent-skills --dry-run
```

Dry-run performs no Jevgrep invocation, auth, installation, or provider check. It
is a plan, not retrieval evidence or confirmation that credentials work.

### 4. Execute only the approved plan

After explicit source/query/cost approval and existing upstream provider setup:

```bash
jeo-skill explore "Which skill handles vault source citations?" --root /path/to/jeo-skills/.agent-skills --exclude '*/raw/**' --allow-remote
```

Use the same source-checkout Python entrypoint when needed. `--allow-remote` is a
wrapper gate, not an upstream `jg` flag or a persistent grant. Defaults are eight
provider requests, 24,000 output bytes, concurrency one, and a 120-second timeout;
the wrapper passes `--no-cache` to disable upstream answer-cache reads and writes.
Optional wrapper bounds are `--max-requests`, `--max-output-bytes`, and `--timeout`.
`--hidden` and repeatable `--exclude` are available only when that wider scope was
approved. Request/time bounds do not guarantee a monetary ceiling; output clipping
and upstream `--max-source-bytes` bound rendered output, not source upload.

### 5. Verify snippets against native evidence

Read bounded returned snippets and open only the cited source sections needed to
answer. Verify definitions, exact occurrences, skill metadata, and relationships
through their native routes before asserting them. Empty, truncated, or failed
agent output is not proof of absence or an exhaustive inventory.

On errors, report the command, failure, and unresolved result. Do not silently
switch providers, install/authenticate, broaden roots, retry with new disclosure,
or claim that a fallback answered the original query. If a native route is the
next move, identify it explicitly and preserve its own authorization rules.

## References

- Upstream: <https://github.com/dzhng/jevgrep>
- Pinned release: <https://github.com/dzhng/jevgrep/tree/679a0351206a99ef3e4f23e930a8529e78607ecd> (`v0.8.0`, npm `@dzhng/jevgrep@0.8.0`, MIT)
- Wrapper: `../jeo-skill/scripts/jeo-skill.py explore`; upstream has no JSON-output,
  MCP-server, search-stdin, include, or limit flags in this pinned contract.
