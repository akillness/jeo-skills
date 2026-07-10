---
name: lazyweb
description: |
  Lazyweb is the design-evidence skill for AI coding agents. Use it when designing,
  critiquing, or changing product UI — it provides real app screenshots, competitor
  references, best practices, quick examples, creative cross-category ideas, paywall
  optimization guidance, and mobile growth + monetization A/B test context. Routes
  to the right Lazyweb mode (design workflow, quick search, update, flowchart, or
  A/B test research) using MCP tools and the Lazyweb server at https://www.lazyweb.com/mcp.
  Use before designing any screen when you need design evidence instead of training-data vibes.
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - WebFetch
  - AskUserQuestion
metadata:
  tags: lazyweb, design-research, ui-reference, product-design, competitive-analysis, paywall-optimization, a-b-testing, monetization
  platforms: Claude, Codex, Gemini, OpenCode, jeo, jeopi
  keyword: lazyweb
  version: "1.0.0"
  upstream: https://github.com/aboul3ata/lazyweb-skill
  source: aboul3ata/lazyweb-skill
  license: MIT
---

# Lazyweb

**Design with evidence, not vibes.** Use Lazyweb when the user asks for product UI
inspiration, competitive design analysis, best-practice research, quick screen
examples, feedback on an existing interface, creative design ideas, or
paywall optimization, monetization, and A/B test research.

This skill routes to the right Lazyweb mode. Hand off by **invoking the installed
mode skill by name** (when available), using the **Lazyweb MCP tool**, or **calling
the workflow endpoint** — see Routing below. Never point at a `skills/<name>/SKILL.md`
file path: that layout exists only in the source repo, not in the install.
## Design References

Quick access to curated design resources for inspiration and best practices:

- **[Refero Styles](https://styles.refero.design/?q=monochrome+interface)** — Real product screenshots and monochrome interface references for cohesive design systems
- **[React Bits](https://reactbits.dev/backgrounds/orb)** — Visual components and effects library with interactive examples

These complement Lazyweb's MCP-driven research and competitive analysis. Use alongside Lazyweb searches for faster design evidence gathering.


## First Run

If Lazyweb MCP has not been configured, run the standalone setup:

```bash
curl -fsSL https://www.lazyweb.com/install.sh | bash
```

The installer creates or reuses `~/.lazyweb/lazyweb_mcp_token`, installs visible
Lazyweb skills into detected local clients, and configures the Lazyweb MCP server
at `https://www.lazyweb.com/mcp`.

Lazyweb MCP tokens are free no-billing bearer tokens for UI reference tools.
They do not authorize purchases, paid spend, private user data, or destructive
actions. Keep tokens out of public git, but ignored local MCP config is fine.

After setup, show the user what Lazyweb can do:

1. Fetch `https://www.lazyweb.com/api/mcp/welcome-message` and show the welcome message.
2. List MCP tools and confirm `lazyweb_get_workflows` is present.
3. Call `lazyweb_get_workflows` with `{"operation":"list","task_context":"first run Lazyweb capabilities","skill":"lazyweb"}`.
4. Summarize the returned workflows as Lazyweb's super powers.

If MCP tools are unavailable, tell the user to run the installer above, then
continue with web research only if they want a degraded fallback.

## Routing

Choose exactly one mode. **`lazyweb-design` is the default for any design work** —
design, redesign, optimize, improve, critique, or build any product screen (paywall,
pricing, landing, onboarding, settings, dashboard, etc.). It runs the one-call
server-side `lazyweb_generate_report` and hosts a full report.

| User Intent | How to Run |
|---|---|
| **DEFAULT for design work** — design, redesign, optimize, improve, critique, or build ANY product screen (paywall, pricing, landing, signup, onboarding, dashboard, settings, etc.) | **Invoke the `lazyweb-design` skill** (one-call server-side `lazyweb_generate_report`) |
| The user **explicitly** asks for a quick reference / examples lookup ("quick search", "just show me a few references", "look up examples first") — and does NOT want a report | **Invoke the `lazyweb-quick-search` skill** or use the `lazyweb_search` MCP tool |
| Update local Lazyweb skills, reinstall Lazyweb, or sync Lazyweb into agentic IDEs | **Invoke the `lazyweb-update` skill** |
| Map how a product's agent/app talks to its backend as a flow chart / architecture diagram | **Use the `lazyweb_generate_flowchart` MCP tool** |
| A/B tests, experiment examples, pricing, trials, lifecycle, or monetization strategy | Use the `lazyweb_search_ab_tests` MCP tool (mobile A/B evidence) |

When in doubt, choose `lazyweb-design`: it is the default for producing anything
(a redesign, a critique, a report). Reach for `lazyweb-quick-search` only on an
explicit reference-lookup request, and never as a fallback for building a report.

**How to run, explained.** Only `lazyweb-design` and `lazyweb-quick-search` are
installed as local skills — invoke them **by name**, which resolves regardless of
how the host lays out skill directories. The `create` objective inside
`lazyweb-design` fetches the `lazyweb-design-create` backend over MCP. A/B-test
evidence is reached through the `lazyweb_search_ab_tests` MCP tool. Never
substitute a `skills/<name>/SKILL.md` file read for any of these — that path does
not exist in the install.

**Retired skills — route their intent to one of the modes above.** These
earlier Lazyweb skills no longer exist. Do NOT try to invoke the old name; route the
*intent* instead:

| Retired skill / intent | Use now |
|---|---|
| `lazyweb-optimize-paywall`, `lazyweb-design-improve`, `lazyweb-optimize-sign-up` | `lazyweb-design` (objective `optimize` / `improve`) |
| `lazyweb-design-research`, `lazyweb-design-brainstorm`, `lazyweb-design-best-practices` | `lazyweb-quick-search` for references; `lazyweb-design` (objective `create`) for a full new-screen design |
| `lazyweb-quick-references`, `lazyweb-lite-design-research` | `lazyweb-quick-search` |
| `lazyweb-paywall-cta` — CTA copy | `lazyweb-design` (the CTA is part of the screen) |
| `lazyweb-ab-test-research` — A/B / experiment evidence | the `lazyweb_search_ab_tests` MCP tool |

## Mode Handoff

When a mode is clear:

1. Reach the mode by the mechanism in the table above — **invoke the installed
   skill by name** (`lazyweb-design`, `lazyweb-quick-search`), use the mode's
   **dedicated MCP tool**, or **call the workflow** with `lazyweb_get_workflows`.
   Do NOT read a `skills/<name>/SKILL.md` file path — that layout exists only in
   the source repo, not in the install.
2. Follow that mode from the top.
3. Use Lazyweb MCP tools for database-backed evidence.
4. Embed Lazyweb database images directly with returned `imageUrl`/`image_url` values,
   and save only current-state or web-captured screenshots locally when the selected
   mode requires them.
5. Cite whether each reference came from Lazyweb or the web.

## Search Discipline

These rules apply to every `lazyweb_search` call:

- **Always run at least one real search for the user's actual screen.** Example or
  connectivity queries (like "pricing page") teach the user nothing about their own
  project — follow them immediately with the screen they are building.

- **One screen, one search.** When the user is building a whole app or page, run one
  query per screen/section (onboarding, home, paywall, settings, checkout…) instead
  of a single broad query. Pass `platform` ("mobile" or "desktop") and
  `company: "<app>"` when the user names a reference product.

- **Never repeat an identical query** — results are deterministic. To see more, pass
  `offset` (e.g. `{"query":"onboarding quiz","limit":20,"offset":20}`); the
  response's `pagination.next_offset` gives the next page.

- **Read `coverage` and `warnings` on every response and obey them.** On
  `no_matches` or `low_coverage`, use the closest result anyway, strip the query to
  its core 2-6 word UI pattern, or tell the user the pattern is not in the library —
  do not rephrase the same concept in a loop. Style adjectives ("dark", "minimal",
  "editorial") are not searchable facets yet; drop them from the query and judge
  style from the returned images.

- **On a `company_not_in_library` warning**, pick one of the suggested closest
  companies or drop the company filter — do not retry other spellings of the
  same brand.

## Tool Rules

**Pass `skill: "lazyweb"` on every call.** Include `"skill": "lazyweb"` in the arguments
of each `lazyweb_*` tool call — this is optional analytics metadata Lazyweb uses to
understand which skills are used; never drop or change a real argument for it.

- Always inspect the live MCP tool list before assuming optional filters or backend
  aliases are available.

- The current public gateway normally exposes `lazyweb_health`, `lazyweb_search`,
  `lazyweb_find_similar`, `lazyweb_compare_image`, `lazyweb_list_categories`,
  `lazyweb_get_workflows`, `lazyweb_get_flows`, `lazyweb_search_ab_tests`, and
  `lazyweb_paywall_cta_research`. Full-pipeline run tools (`paywall_design_run` /
  `paywall_design_check_status`) are gated behind env flags and may be exposed —
  check the live tool list.

- All current public Lazyweb MCP tools and visible workflow skills are free,
  including `lazyweb_search_ab_tests`, `lazyweb_paywall_cta_research`, and the
  pipeline tools when exposed. If a tool is missing or returns no matching evidence,
  treat that as an availability or coverage issue, not a billing gate.

- Pass `high_design_bar: true` only to tools whose live schema exposes it, and
  only when the user asks for premium, stronger, high-design-bar, or best-designed
  examples.

- Screenshot-bearing tools return optimized image URLs. Supabase storage-backed URLs
  are signed for 365 days. Do not request or pass screenshot IDs, and do not
  construct storage URLs from raw paths.

- `lazyweb_search_ab_tests` is mobile-only A/B test evidence. It uses `category` as
  the industry filter and forwards `product`/`company` as target context. Do not use
  them to force an exact company match or trust a zero-result answer caused by an
  exact product/company filter.

- `lazyweb_find_similar` accepts `image_url` or `image_base64` plus `mime_type`; it
  does not take a screenshot ID.

- `lazyweb_compare_image` does real image-similarity. Always send `image_base64` —
  localhost, file paths, and web-page URLs are unreachable from the server. When you
  only have a page URL or a running local app, capture it yourself with your client's
  built-in screenshot tool and pass the capture as `image_base64`. Failed calls return
  a `how_to_fix` field — follow it instead of retrying the same input.

## Integrity Guardrails

- **Never fabricate** design references or evidence. All images and data come from the
  Lazyweb database or web search — cite the source.

- **Screenshot URLs are signed** — they expire after 365 days. Do not archive them
  without downloading first.

- **Respect user privacy** — do not share images or design evidence with external
  services unless the user consents.

---

**Upstream**: [aboul3ata/lazyweb-skill](https://github.com/aboul3ata/lazyweb-skill)
**Lazyweb API**: [https://www.lazyweb.com](https://www.lazyweb.com)
