# Skill Discovery and Routing

This is the core "skill-finder" job: given a task, pick the right installed skill
instead of scanning ~150 `SKILL.md` files by hand or guessing from names alone.

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

## How to route a "find me a skill" request

1. State the task in plain language (what the user wants done).
2. Ask OpenSpace (via MCP tools, or the copied `skill-discovery` host skill) to
   search/rank skills scoped to `OPENSPACE_HOST_SKILL_DIRS`.
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
