# Context: graphify structural hardening

## Workflow Context
`graphify` sits in the repo-understanding / durable-memory lane: users reach for it when plain search is no longer enough and they want persistent graph artifacts (`GRAPH_REPORT.md`, `graph.json`, `graph.html`) that can be reused across later sessions. Upstream Graphify explicitly positions itself as a structure-first layer for codebases and mixed corpora, with assistant install hooks, path/query/explain flows, wiki export, URL ingestion, and incremental update workflows rather than one-off screenshots or diagrams.

That workflow appears across multiple domains in this maintenance loop:
1. web/fullstack repos that need architecture tracing beyond `grep`
2. PM/ops or research corpora that mix docs, PDFs, notes, screenshots, and links
3. marketing/content collections where the durable artifact is a graph-backed corpus rather than a single memo
4. game-dev or mixed-language repos where cross-file / cross-language structure matters but raw repo size makes blind graphing risky

Related source-backed signals:
- Graphify README: https://github.com/safishamsi/graphify
- Aider repo map docs: https://aider.chat/docs/repomap.html
- Graphify issue on large-repo compact loops: https://github.com/safishamsi/graphify/issues/266
- Graphify issue on semantic-layer overwrite in watch mode: https://github.com/safishamsi/graphify/issues/253

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Fullstack / backend developer | Understand architecture, imports, cross-file relationships, and entry points before editing | Intermediate–advanced |
| Agent maintainer / automation operator | Keep a persistent structural memory layer for recurring repo maintenance | Advanced |
| PM / ops / research owner | Turn mixed docs/assets/notes into a reusable graph or wiki-backed corpus | Intermediate |
| Marketing / content operator | Organize campaign docs, reports, screenshots, and sources into a durable knowledge layer | Intermediate |
| Game-dev / tooling engineer | Understand mixed-language Unity/Unreal/tooling repos and delivery artifacts | Intermediate–advanced |

## Current Workarounds
1. Start with `ripgrep`, repo maps, or Sourcegraph-style search, then escalate only if the user clearly needs durable structure or graph-backed questions.
   - Sources: https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md, https://sourcegraph.com/docs/code_search/explanations/features
2. Limit the graph scope to a subtree and add ignores instead of graphing the whole repo blindly.
   - Source: https://github.com/safishamsi/graphify
3. Read `GRAPH_REPORT.md` or export to wiki/Obsidian instead of pasting raw `graph.json` into prompts.
   - Source: https://github.com/safishamsi/graphify
4. Use lightweight substitutes like Aider RepoMap, Repomix, repo-visualizer, or dependency-cruiser when the main need is orientation, file packing, or dependency-only graphing.
   - Sources: https://aider.chat/docs/repomap.html, https://github.com/yamadashy/repomix, https://github.com/githubocto/repo-visualizer, https://github.com/sverweij/dependency-cruiser
5. Re-run update/build steps manually when continuous/watch mode or large-repo performance is unreliable.
   - Sources: https://github.com/safishamsi/graphify/issues/253, https://github.com/sverweij/dependency-cruiser/issues/715

## Adjacent Problems
- Large repos can trigger token / cost / runtime problems, especially if the user graphs the whole tree instead of a targeted scope.
  - Source: https://github.com/safishamsi/graphify/issues/266
- Graph correctness bugs break trust downstream: dropped import edges, false inferred edges, node ID collisions, and cross-language connectivity gaps all corrupt the structural story.
  - Sources: https://github.com/safishamsi/graphify/issues/256, https://github.com/safishamsi/graphify/issues/437, https://github.com/safishamsi/graphify/issues/438, https://github.com/safishamsi/graphify/issues/439
- Generated artifacts can leak local-machine absolute paths, which makes committed graph outputs noisy and less portable.
  - Source: https://github.com/safishamsi/graphify/issues/433
- Graph tools rarely replace all other navigation surfaces; teams still keep search, docs, wiki notes, or custom packing scripts nearby.
  - Sources: https://aider.chat/docs/repomap.html, https://github.com/yamadashy/repomix, https://github.com/githubocto/repo-visualizer

## User Voices
- “`/graphify .` on large directories causes infinite compact/restart loop — drains all tokens.”
  - Source: https://github.com/safishamsi/graphify/issues/266
- In a 388-file TypeScript codebase, extraction found raw import edges but the final graph had zero `imports_from` edges, fragmenting the graph.
  - Source: https://github.com/safishamsi/graphify/issues/256
- “Every code file save destroys the semantic layer” described the pre-fix mixed code+docs `--watch` behavior.
  - Source: https://github.com/safishamsi/graphify/issues/253
- Common .NET method names produced “hundreds of false `INFERRED` edges,” polluting community detection.
  - Source: https://github.com/safishamsi/graphify/issues/437
- Multiple same-name files like `Program.cs` caused node collisions and merged unrelated methods.
  - Source: https://github.com/safishamsi/graphify/issues/438
