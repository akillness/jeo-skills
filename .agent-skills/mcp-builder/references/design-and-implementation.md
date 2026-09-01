# Design and Implementation

Operative guidance bundled from `anthropics/skills` commit
`3b3fad96af16a10759d930941b4520ba0c40edae` (2026-08-21), Apache-2.0.
Redistributed with attribution; see [upstream and licensing](upstream-and-licensing.md).

## Server naming

One clear namespace per server, matching the service it wraps. The server name
becomes the prefix users and agents reason about.

## Tool naming

| Rule | Good | Bad |
|---|---|---|
| Consistent prefix | `github_create_issue` | `createIssue` |
| Action-oriented verb | `github_list_repos` | `github_repos` |
| One obvious purpose | `slack_post_message` | `slack_handle` |
| No overlap without a stated precondition | — | `get_user` and `fetch_user` |

The agent selects tools from names and short descriptions, usually without
reading full schemas. Ambiguity at this layer is the dominant cause of wrong
tool calls.

## Tool granularity

Balance two pressures:

- **Comprehensive coverage** — mirrors the API, lets agents compose freely.
  Better for clients that support code execution combining basic tools.
- **Workflow tools** — collapse a common multi-step task into one call. More
  convenient, less flexible.

Upstream's tiebreaker: **when uncertain, prioritize comprehensive API coverage.**
A useful shape is full coverage plus a small number of workflow tools for the
one or two paths users actually repeat.

## Descriptions

Written for a model with limited context:

- State what the tool does and when to use it, in one or two sentences.
- Name the required inputs and their meaning, not their types alone.
- Mention preconditions that disambiguate it from a neighboring tool.
- Skip implementation detail the agent cannot act on.

## Response formats

| Format | Use when |
|---|---|
| `json` | the agent will filter, sort, or compute on the result |
| `markdown` (typical default) | the result is read and summarized |

Return focused, relevant data. A tool that dumps an entire collection burns
context and makes the agent worse at the next step.

## Pagination

Paginate anything unbounded. Expose page size and cursor explicitly, and state
in the description how to request the next page. An agent that cannot tell it
received a partial result will confidently report incomplete answers.

## Error messages

An error is a control-flow signal for the agent, not a log line.

| Weak | Actionable |
|---|---|
| `Invalid repo` | `Repository not found. List available repositories with github_list_repos.` |
| `400 Bad Request` | `Missing required field "title". Provide a non-empty title.` |
| `Unauthorized` | `Token lacks repo:write scope. Re-authorize with write access.` |

Guide without leaking internals: no stack traces, no secrets, no internal
hostnames.

## Transport

| Transport | Use for | Characteristics |
|---|---|---|
| stdio | local servers | simplest, process-scoped |
| Streamable HTTP | remote servers | prefer stateless JSON |

Upstream prefers **stateless JSON** over stateful sessions and streaming
responses: simpler to scale and maintain. Adopt stateful sessions only with a
concrete requirement.

## Tool annotations

Annotate accurately: read-only, destructive, idempotent, open-world. These
drive client-side confirmation prompts. A destructive tool annotated read-only
removes the user's chance to intervene — treat a wrong annotation as a security
defect, not a metadata typo.

## Security

- **Authentication and authorization** on every tool touching private data.
- **Input validation** at the boundary; model-supplied arguments are untrusted.
- **Error handling** that never returns secrets or internal topology.
- **DNS rebinding protection** on HTTP transports.
- **Least privilege** for whatever credential the server holds.

## Stack choice

| Path | Stack | Notes |
|---|---|---|
| Recommended | TypeScript + MCP SDK | strong SDK, MCPB compatibility, static typing, models generate it well |
| Alternative | Python + FastMCP | natural when the surrounding service is Python |

TypeScript registers tools with `server.registerTool` and Zod schemas. Python
uses the `@mcp.tool` decorator with Pydantic models. Both upstream guides carry
complete working examples and a quality checklist:

- `reference/node_mcp_server.md`
- `reference/python_mcp_server.md`

Fetch the current SDK READMEs when implementing:

- `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
- `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`

## Testing

Test that the server starts, lists tools, and completes at least one real call
end to end. Then test the failure paths: bad input, missing auth, and pagination
past the last page. A server that only works on the happy path will strand an
agent on its first error.
