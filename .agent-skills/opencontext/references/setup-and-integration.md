# OpenContext Setup and Integration Notes

## Install paths
```bash
npm install -g @aicontextlab/cli
# or
npx @aicontextlab/cli <command>
```

## Initialize in a repository
```bash
cd your-project
oc init
```

`oc init` is the right move when the repo should gain OpenContext-aware setup, command surfaces, or MCP config.

## Core commands worth remembering
```bash
oc folder ls --all
oc doc ls <folder>
oc doc create <folder> <doc>.md -d "Description"
oc search "query" --mode keyword --format json
oc context manifest <folder> --limit 10
oc doc link <doc_path>
```

## Semantic search / embeddings
Only escalate to semantic search when keyword search and manifests are not enough.

Typical setup:
```bash
oc config set EMBEDDING_API_KEY "<key>"
oc config set EMBEDDING_API_BASE "https://api.openai.com/v1"
oc config set EMBEDDING_MODEL "text-embedding-3-small"
oc index build
```

## Integration boundary reminders
- OpenContext is compatible with existing agent CLIs; it should complement, not replace, the execution agent.
- Use OpenContext stable links or manifests for handoff.
- Pair OpenContext with `llm-wiki` when project memory should mature into a long-lived knowledge base.
- Pair OpenContext with `graphify` when the next question is structural rather than narrative.

## Evidence sources
- OpenContext README: https://raw.githubusercontent.com/0xranx/OpenContext/main/README.md
- Karpathy LLM Wiki gist: https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw
- Graphify README: https://raw.githubusercontent.com/safishamsi/graphify/main/README.md
