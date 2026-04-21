# Solution Landscape: graphify structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Graphify | Persistent structural / multimodal graph with `graph.json`, `GRAPH_REPORT.md`, `graph.html`, query/path/explain, assistant installs, wiki export | Best fit when the user explicitly wants durable graph artifacts, mixed-corpus graphing, path tracing, or graph-backed repo understanding | Upstream install/build surface is easy to confuse (`graphifyy` package vs `graphify` CLI), large-repo correctness/performance issues exist, and assistant-native vs local-Python workflows need clearer routing | Canonical skill candidate for this lane. Sources: https://github.com/safishamsi/graphify , https://pypi.org/project/graphifyy/ |
| codebase-search / Sourcegraph-style search | Search-first repo navigation and evidence gathering | Fastest first stop for definitions, references, config ownership, and impact mapping | Not a persistent graph; no durable architecture artifacts | Strong route-out when the user does not actually need graph outputs. Sources: https://sourcegraph.com/docs/code_search/explanations/features |
| Aider RepoMap | Lightweight repository map for coding-assistant context | Cheap whole-repo context compression inside coding loops | Ephemeral, code-focused, not multimodal, no durable graph artifacts | Good contrast tool for “cheap map, not graph memory.” Source: https://aider.chat/docs/repomap.html |
| Repomix | Packs code/docs into AI-friendly snapshots | Useful when the user wants code + docs bundled without maintaining a graph | Snapshot, not graph query/path tracing | Mixed-corpus fallback rather than graph replacement. Source: https://github.com/yamadashy/repomix |
| repo-visualizer | Diagram-style repo tree visualization | Fast orientation and folder-level visibility | Lightweight experiment; struggles on large repos; not a semantic graph | Better for visual tree scans than durable graph memory. Source: https://github.com/githubocto/repo-visualizer |
| dependency-cruiser | Dependency graphing for JS/TS-family repos | Strong narrow fit for dependency-only analysis and rendered graphs | Language-limited and still needs external rendering / filtering; mixed-repo coverage is weak | Substitute for dependency questions, not full Graphify lane. Source: https://github.com/sverweij/dependency-cruiser |
| llm-wiki | Persistent markdown knowledge base | Best when the user wants narrative synthesis, filed notes, and cross-linked wiki pages | No structural graph/query/path layer | Complementary narrative memory layer rather than a duplicate. Source: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f |
| OpenContext | Persistent project memory / handoff system | Strong for manifests, stable links, and cross-session context handoff | Not a graph extractor or wiki compiler | Complementary project-memory layer. Source: https://github.com/0xranx/OpenContext |
| GraphRAG | Heavy text-centric KG indexing pipeline | Useful for large narrative/private-text graph indexing | Heavier ops/cost/config burden; not codebase-first | Edge case route-out for text-KG workloads, not normal repo graphing. Sources: https://github.com/microsoft/graphrag , https://pypi.org/project/graphrag/ |

## Categories
- **Persistent structural graphing:** Graphify
- **Fast repo navigation / impact search:** codebase-search, Sourcegraph-style search, Aider RepoMap
- **Snapshot / visual orientation helpers:** Repomix, repo-visualizer, dependency-cruiser
- **Persistent narrative memory:** llm-wiki
- **Persistent project / handoff memory:** OpenContext
- **Heavier text-KG indexing:** GraphRAG

## What People Actually Use
In practice, teams mix layers instead of betting everything on one graph tool. Search remains the first pass (`ripgrep`, Sourcegraph, repo maps), diagram or packaging tools help with quick orientation, and durable graph workflows are reserved for cases where the user explicitly wants persistent structure, path tracing, or mixed-corpus memory. This is why the `graphify` skill should route aggressively: it should claim the durable graph lane, but it should hand off ordinary locate/reference work to `codebase-search`, narrative synthesis to `llm-wiki`, and handoff memory to `OpenContext`.

Relevant sources:
- https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md
- https://aider.chat/docs/repomap.html
- https://github.com/yamadashy/repomix
- https://github.com/githubocto/repo-visualizer
- https://github.com/sverweij/dependency-cruiser

## Frequency Ranking
1. Search-first repo navigation (`codebase-search`, Sourcegraph, ripgrep)
2. Graphify for durable structure / multimodal graph outputs
3. OpenContext for cross-session project memory
4. llm-wiki for markdown synthesis and filed research knowledge
5. Aider RepoMap / repo-map tools for lightweight coding-loop context
6. GraphRAG for heavy text-centric graph indexing

## Key Gaps
- The upstream Graphify surface still needs clearer routing between assistant-native `/graphify` installs and local/Python fallback builds.
- Large-repo and mixed-repo failure modes make “smallest useful scope first” and `.graphifyignore` guidance more important than a broad feature tour.
- The repo’s own skill catalog has already converged on routing-first front doors, but `graphify` still reads more like a capability catalog than a bounded packet selector.
- The skill lacks a compact discovery variant, so its trigger/discovery surface is weaker than the rest of the live catalog.

## Contradictions
- Marketed claim: one graph layer can unify code, docs, media, and downstream agent workflows.
  - User reality: teams still keep search, docs, repo maps, and custom scripts nearby because graph coverage/performance/correctness is imperfect.
- Marketed claim: assistant-native install plus graph queries feels turnkey.
  - User reality: local automation often needs a Python/API or structural-fallback path because the raw CLI/build surface is not always the same as the assistant UX.

## Key Insight
The best bounded improvement is not to add another graph/GraphRAG/repo-map wrapper. It is to harden `graphify` into a routing-first front door that chooses between assistant-native install, local/Python build, structural fallback for markdown-heavy corpora, and neighboring route-outs (`codebase-search`, `llm-wiki`, `OpenContext`) while keeping the durable graph lane clearly owned by `graphify` itself.
