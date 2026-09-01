---
name: mcp-builder
description: >
  Build production MCP (Model Context Protocol) servers that let LLMs drive an
  external API through well-designed tools, in TypeScript (MCP SDK) or Python
  (FastMCP). Route one request to research and planning, tool design, transport
  choice, implementation, security review, or evaluation. Use when the user
  wants to wrap an API as MCP tools, name and shape those tools, choose between
  stdio and streamable HTTP, fix a server whose tools the model cannot use
  correctly, or build the 10-question evaluation that proves it works. Requires
  confirmation before running an evaluation harness that spends API credits or
  calls a live service. Route consuming an existing MCP server to that server's
  own skill, and generic API contract design to `api-design`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  TypeScript path needs Node.js and the MCP SDK; Python path needs Python and
  FastMCP. The bundled evaluation harness additionally needs an Anthropic API
  key and spends credits per run. Upstream content is Apache-2.0.
license: Apache-2.0
metadata:
  platforms: Claude, ChatGPT, Gemini, Codex, Cursor, Cline
  version: "1.0"
  source: https://github.com/anthropics/skills
---

# MCP Server Builder

Build an MCP server whose quality is measured by one thing: **can an LLM
actually accomplish real tasks with it?** Not endpoint coverage, not schema
elegance. A server that mirrors 40 REST endpoints and leaves the model unable to
complete a workflow has failed.

The most common failure is treating this as an API-wrapping exercise. Tool
naming, response shape, error text, and pagination are all *agent ergonomics*
problems, and they decide whether the server works.

Bundled from `anthropics/skills` commit
`3b3fad96af16a10759d930941b4520ba0c40edae` (2026-08-21), Apache-2.0. Upstream
ships `skills/mcp-builder/LICENSE.txt`; the repository root carries no SPDX
license, so the per-skill license is the operative one — see
[upstream and licensing](references/upstream-and-licensing.md).

## When to use this skill

- Wrap an external API or service as an MCP server.
- Decide tool granularity: comprehensive endpoint coverage versus workflow tools.
- Name and shape tools so an agent picks the right one unprompted.
- Choose a transport and a state model.
- Diagnose a server whose tools the model misuses or cannot chain.
- Build evaluations that prove the server enables real tasks.

Do not use this skill for neighboring jobs:

- Consume or configure an already-built MCP server: use that server's own skill.
- Design a REST or GraphQL contract for human clients: use `api-design`.
- Write the underlying service: this covers the MCP layer over it.
- Harden a web app generally: use `security-best-practices`.
- Build a non-MCP agent tool layer: use `agent-tool-routing`.

## Instructions

### Step 0: Pick the phase

| Phase | Job | Output |
|---|---|---|
| `research` | understand the API and MCP design norms | tool inventory and plan |
| `design` | naming, granularity, response shape | tool contract |
| `implement` | build in TypeScript or Python | working server |
| `secure` | auth, validation, error handling, DNS rebinding | reviewed surface |
| `evaluate` | 10 verified questions, harness run | pass or fail evidence |

Skipping `research` and `design` is what produces servers with 40 thin tools
that no agent can use.

### Step 1: Research before writing tools

Read the target API's real semantics: resources, verbs, pagination style, auth
model, rate limits, error shapes. Then decide coverage strategy.

**Coverage versus workflow tools.** Comprehensive endpoint coverage gives agents
composition flexibility; workflow tools are more convenient for specific tasks.
Performance varies by client — some benefit from code execution combining basic
tools, others from higher-level workflows. Upstream's guidance when uncertain:
**prioritize comprehensive API coverage.**

MCP specification: start at `https://modelcontextprotocol.io/sitemap.xml`, then
fetch pages with a `.md` suffix for markdown.

### Step 2: Choose the stack deliberately

Upstream recommends **TypeScript**: strong SDK support, good compatibility in
execution environments such as MCPB, static typing, and models generate it well.
Python with FastMCP is fully supported and often better when the surrounding
service is already Python.

| Need | Choose |
|---|---|
| Default, broad compatibility | TypeScript + MCP SDK |
| Existing Python service, scientific stack | Python + FastMCP |

### Step 3: Design tools for discoverability

- **Consistent prefixes**: `github_create_issue`, `github_list_repos`.
- **Action-oriented names**: the verb says what happens.
- **Concise descriptions**: they are read by a model with limited context.
- **Filterable, paginated results**: return focused data, not everything.
- **Actionable errors**: an error must suggest the next step, not just report
  failure. `"Invalid repo"` is a dead end; `"Repository not found. List
  available repositories with github_list_repos."` is recoverable.

Full conventions in [design and implementation](references/design-and-implementation.md).

### Step 4: Choose transport and state model

| Transport | Use for | Note |
|---|---|---|
| stdio | local servers | simplest; process-scoped |
| Streamable HTTP | remote servers | prefer **stateless JSON** |

Upstream prefers stateless JSON over stateful sessions and streaming responses:
simpler to scale and maintain. Choose stateful only with a concrete reason.

### Step 5: Secure the surface before exposing it

- Authenticate and authorize every tool that touches private data.
- Validate all input at the boundary; never trust model-supplied arguments.
- Return errors that guide without leaking internals, stack traces, or secrets.
- Enable **DNS rebinding protection** on HTTP transports.
- Apply tool annotations honestly — a destructive tool marked read-only is a
  trap for both the agent and its user.

### Step 6: Evaluate — the phase most often skipped

Ten questions, each **independent**, **read-only**, **complex** (multiple tool
calls), **realistic**, **verifiable** by string comparison, and **stable** over
time.

Process: inspect the tools, explore data with read-only calls, generate the
questions, then **solve each one yourself** to verify the answer before it
becomes the expected value.

```xml
<evaluation>
  <qa_pair>
    <question>...</question>
    <answer>3</answer>
  </qa_pair>
</evaluation>
```

Upstream ships a harness (`scripts/evaluation.py`, `scripts/connections.py`)
that runs these against a live model.

> **Cost and blast radius.** The harness requires an Anthropic API key and
> spends credits per question, and it drives your server against whatever it is
> connected to. Confirm before running it, keep questions read-only, and point
> it at non-production data.

See [evaluation](references/evaluation.md).

### Step 7: Verify what you claim

- **design**: every tool has a prefix, an action name, and a concise description
- **implement**: server starts, tools list, one call succeeds end to end
- **secure**: auth enforced, input validated, no secret in an error path
- **evaluate**: harness run with a pass count, not "evaluations were written"

State which layer you verified. Writing evaluations is not running them.

## Examples

### Example 1: Wrapping a REST API

Request: "Turn our internal REST API into an MCP server."

Start in `research`. Inventory endpoints, identify the two or three workflows
users actually perform, then decide coverage. Default to comprehensive coverage
plus a small number of workflow tools for the dominant paths.

### Example 2: Agent picks the wrong tool

Request: "The model keeps calling the wrong tool."

This is `design`, not a bug. Check for ambiguous names, overlapping
descriptions, missing prefixes, and tools that differ only by an unstated
precondition. Rename and re-describe before touching code.

### Example 3: Evaluation request with cost

Request: "Run the eval suite."

Confirm the API key source, the per-run credit cost, and that every question is
read-only against non-production data. Then run and report the pass count.

## Best practices

1. **Measure by task completion** — not endpoint coverage.
2. **Default to comprehensive coverage** — add workflow tools for real paths.
3. **Prefix and verb every tool name** — discovery is the agent's bottleneck.
4. **Make errors actionable** — every failure names a next step.
5. **Prefer stateless streamable HTTP** — stateful needs a reason.
6. **Annotate destructive tools honestly** — read-only means read-only.
7. **Verify eval answers yourself** — an unverified expected value tests nothing.
8. **Gate the harness on cost and confirmation** — it spends credits per run.

## References

- [Design and implementation](references/design-and-implementation.md)
- [Evaluation](references/evaluation.md)
- [Upstream and licensing](references/upstream-and-licensing.md)
- [MCP specification](https://modelcontextprotocol.io/)
- [Upstream skill](https://github.com/anthropics/skills/tree/main/skills/mcp-builder)
- [Audited pin `3b3fad9`](https://github.com/anthropics/skills/commit/3b3fad96af16a10759d930941b4520ba0c40edae)
