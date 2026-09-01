# Upstream and Licensing

## Audited pin

| Field | Value |
|---|---|
| Repository | `anthropics/skills` |
| Commit | `3b3fad96af16a10759d930941b4520ba0c40edae` |
| Date | 2026-08-21 |
| Skill path | `skills/mcp-builder/` |
| Skill license | Apache-2.0 (`skills/mcp-builder/LICENSE.txt`) |
| Repository root license | **none declared** |

## The licensing nuance that matters

The GitHub API reports **no SPDX license** for `anthropics/skills` at the
repository level. Do not read that as "unlicensed content" and do not read the
repository as permissively licensed as a whole.

`skills/mcp-builder/` ships its own `LICENSE.txt` containing the full Apache
License 2.0, and the skill's own frontmatter declares
`license: Complete terms in LICENSE.txt`. That per-skill license is the
operative grant for this content.

Consequences:

1. This catalog skill is Apache-2.0, not MIT like most of the repository.
2. The vendored `LICENSE.upstream.txt` must ship with it — Apache-2.0 §4
   requires retaining the license and attribution notices.
3. Any modification should be marked as such, per Apache-2.0 §4(b).
4. **Do not generalize this license to sibling skills** in `anthropics/skills`.
   Each carries its own terms; check per skill before vendoring another.

## What was bundled

Original routing and operator content written for this catalog, derived from
upstream guidance:

| This skill | Derived from |
|---|---|
| `SKILL.md` | `skills/mcp-builder/SKILL.md` |
| `references/design-and-implementation.md` | `reference/mcp_best_practices.md`, `reference/node_mcp_server.md`, `reference/python_mcp_server.md` |
| `references/evaluation.md` | `reference/evaluation.md`, `scripts/evaluation.py` |

## What was deliberately not bundled

| Upstream file | Lines | Why not |
|---|---|---|
| `reference/node_mcp_server.md` | 969 | full TypeScript walkthrough; fetch upstream when implementing |
| `reference/python_mcp_server.md` | 718 | full Python/FastMCP walkthrough; same |
| `reference/evaluation.md` | 601 | condensed here; fetch for the complete guide |
| `scripts/evaluation.py` | 373 | executable harness; needs an API key and spends credits |
| `scripts/connections.py` | 151 | harness transport helper |

The two language guides are large, change with their SDKs, and are only needed
during implementation. Fetching them at that moment is more accurate than
freezing a copy here.

## Fetching the unbundled parts

```bash
B=https://raw.githubusercontent.com/anthropics/skills/3b3fad96af16a10759d930941b4520ba0c40edae/skills/mcp-builder

curl -fsS "$B/reference/node_mcp_server.md"   -o node_mcp_server.md
curl -fsS "$B/reference/python_mcp_server.md" -o python_mcp_server.md
curl -fsS "$B/reference/evaluation.md"        -o evaluation_full.md
```

Read-only fetches. The harness scripts are a separate decision — see the cost
and blast-radius gate in [evaluation](evaluation.md).

## Version drift

The pin above is a snapshot. The MCP specification and both SDKs move
independently of this skill, so during implementation prefer:

1. the live MCP spec at `https://modelcontextprotocol.io/sitemap.xml`
2. the current SDK READMEs
3. this skill's bundled conventions

for anything version-sensitive. The conventions here — naming, error
actionability, pagination, transport preference — are stable; specific API
signatures are not.
