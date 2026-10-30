# Skill Discovery and Routing

This is the core "skill-finder" job: given a task, pick the right installed skill
instead of scanning hundreds of `SKILL.md` files by hand or guessing from names alone.

## Discovery precedence

OpenSpace discovers skills from, in order:

1. `OPENSPACE_HOST_SKILL_DIRS` (env var — set to `$HOME/.agents/skills` in this repo)
2. configured `skills.skill_dirs`
3. project roots such as `.openspace/skills`
4. user roots such as `~/.openspace/skills`
5. bundled OpenSpace skills in `openspace/skills` (lowest priority)

Project skills live under `.openspace/skills/<name>/SKILL.md`, with optional helper
files alongside:

```text
.openspace/
└── skills/
    ├── my-skill/
    │   └── SKILL.md
    └── another-skill/
        ├── SKILL.md
        └── helper.sh
```

## Stable IDs and safety gating

Each discovered skill has a `.skill_id` sidecar for stable tracking. New project or
user skills can omit it — OpenSpace creates one on first discovery. Keep `.skill_id`
when a copied skill should remain the same logical skill; remove it before first
discovery when creating an independent skill.

All discovered skills pass `check_skill_safety` before loading. Skills with dangerous
patterns — prompt injection, credential exfiltration — are blocked and logged. A
skill failing this gate should never be silently retried into ranking results.

## Ranking mechanics (from the code structure / framework sections)

- `skill_ranker.py` — BM25 + embedding hybrid ranking
- `search_tools.py` (Smart Tool RAG) — BM25 + embedding + LLM, for tool-level search
- `fuzzy_match.py` — fuzzy matching for skill discovery
- Local skill search reuses the `SkillRanker` embedding cache and refreshes embeddings
  when skill text changes, so warm-cache searches are fast after first use.
- Cloud search adds lexical recall plus semantic reranking beyond exact text matching,
  for package/skill discovery in the cloud hub.

### Both ranking stages are optional at runtime — and fail silently

`hybrid_rank()` degrades instead of erroring, so a broken ranker looks like a working one:

| Stage | Needs | Missing → |
|-------|-------|-----------|
| BM25 rough-rank | the `rank_bm25` package in the OpenSpace venv | falls back to naive token overlap; in practice only a skill's own **name** matches |
| Embedding re-rank | an OpenAI-compatible key (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or a nanobot/OpenClaw host config), model `text-embedding-3-small` | BM25-only results are returned unchanged |

With neither available, `search_skills` still answers, every result carries
`score: 0.0`, and the returned order is arbitrary — the query
`"scrape a javascript rendered page"` will not surface `scrapling`. Verify with an
**intent** query, never a name query: a name query passes even when ranking is dead.
Setup guide Step 4's Tool-Flow Liveness gate runs exactly this check.

## Prompt-time routing (the default path)

`scripts/route_prompt.py` runs from a host hook on every user prompt and calls only
`SkillRanker.bm25_only`, the BM25 stage above, so it needs `rank_bm25` and nothing else:
no embeddings, no LLM, no network. Because the hook decides before the model runs, the
suggestions are the same for every model the host uses. `--check` proves the ranker
contract offline; `--explain "<prompt>"` shows each candidate's gate evidence.

The gate exists because raw BM25 always returns *something*: an all-zero ranking hands
back the first candidates unranked, and common words ("this", "for", "update") make any
long prompt match dozens of skills. A candidate is suggested when either

- the prompt **names** it: every name term appears and one of them is uncommon
  (in at most 8% of skills), or
- a **rare** prompt term (in at most 5% of the skills written in that term's script)
  appears in its name or description, and it covers at least half of the prompt's
  content terms. A Korean term found only in the body needs full coverage.

Stopwords and intent words ("fix", "update", "explain", "개선", "확인", "설정") never
qualify a skill. Suggestions within half of the best qualifying score are kept, named
skills first, three at most. On a 764-skill catalog with 33 labeled English/Korean
prompts that should route and 24 that should not, this gate suggested a correct skill for
26 and stayed silent on 23 of the 24 negatives. Its misses are cross-language: a Korean
prompt cannot reach an English-only skill without a shared term (product names and
"react" work; "포니테일" for `ponytail` or "특허" for `korean-patent-search` do not).

## How to route a "find me a skill" request

1. State the task in plain language (what the user wants done).
2. If a routing note arrived with the prompt, start from it. Otherwise rank locally with
   `route_prompt.py --explain "<task>"`; use MCP tools or the `skill-discovery` host skill
   only when their embedding or cloud search has separate approval.
3. Prefer the top-ranked skill whose trust status is `trusted` over an equally-ranked
   `provisional` one, all else equal (see `quality-and-evolution.md`).
4. Load the winning skill's `SKILL.md` and proceed with that skill's own instructions.
5. If no installed skill is a good fit, say so explicitly rather than forcing a
   mediocre match — that is a legitimate answer, not a failure.

## Honest route-outs

Do not use OpenSpace for jobs that are not really about skill selection/quality/evolution:

- **Plain grep/keyword lookup across the existing skill catalog, no ranking or quality
  judgment needed** → `codebase-search` or `semble`. Installing an MCP skill-management
  layer for a single `grep`-equivalent lookup is over-engineering.
- **Long-lived, synthesized markdown knowledge** (concept pages, narrative research,
  indexes) that is not about which skill to run → `llm-wiki`.
- **Per-repo agent memory** — handoff notes, decision logs, manifests, "what should the
  next agent read first" — that does not involve choosing between installed skills →
  `opencontext`.
- **The user already knows exactly which skill to use** → skip OpenSpace and load that
  skill's `SKILL.md` directly.
