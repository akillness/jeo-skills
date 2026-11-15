---
name: repo-knowledge-wiki
description: >
  Manage a repository-local LLM wiki, query history, and active work-check
  memory alongside code in one Git repository without mixing noise into code
  search. Pairs `knowledge/` documents with code symbols via `.mex/context/knowledge-pairings.md`
  (`mex-agent` `grounds_to`) and enforces scoped semantic retrieval via
  `zvec-grep` (`zg query -g 'knowledge/**' -g '!knowledge/raw/**' --preview none`).
  Use when setting up or querying repo-local knowledge, pairing docs to code
  symbols, archiving completed work notes, or gating context retrieval.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Python 3.10+, mex-agent >= 0.8.5 (optional for symbol grounding), and
  @zvec/zvec-grep 0.2.2 (optional for scoped semantic search).
metadata:
  version: "1.0.0"
  source: https://github.com/akillness/jeo-skills
  license: MIT
---

# repo-knowledge-wiki

Repository-local knowledge architecture combining `llm-wiki`, `mex` symbol
grounding, and `zvec-grep` scoped retrieval inside one Git repository.

## When to use this skill

- Bootstrapping a repository-local `knowledge/` tree (`raw/`, `queries/`, `work/active/`, `work/archive/`, `concepts/`) separated from source code
- Pairing query history, design decisions, or active work checklists to exact code symbols via `.mex/context/knowledge-pairings.md`
- Running minimal-context retrieval (Context Gate) so code searches exclude wiki noise and wiki searches exclude `raw/` and `work/archive/`
- Auditing pairing drift between `knowledge/` frontmatter (`paired_symbols`) and `.mex/` grounded entities

## Architecture (Dual-Layer Bridge)

`mex-agent` only indexes Markdown inside `.mex/`, while `zvec-grep` (`zg`) skips
hidden directories like `.mex/` by default. This skill bridges both:

1. **`knowledge/` (Git-tracked, `zg`-indexed)**: Human- and Obsidian-readable Markdown (`index.md`, `log.md`, `raw/`, `queries/`, `work/active/`, `work/archive/`, `concepts/`).
2. **`.mex/context/knowledge-pairings.md` (`mex`-grounded)**: Bridge entities (`<!-- mex:entity ... -->` with `mex.grounds_to`) linking code symbols (`file` + `symbol`) to `knowledge/*.md` paths.

## Instructions

### 1. Bootstrap a repository

```bash
python3 .agent-skills/repo-knowledge-wiki/scripts/bootstrap.py --project /path/to/repo --dry-run --json
python3 .agent-skills/repo-knowledge-wiki/scripts/bootstrap.py --project /path/to/repo --json
```

Idempotent: creates missing `knowledge/` directories, `index.md`, `log.md`,
and `.mex/context/knowledge-pairings.md` (when `.mex/` exists) without
overwriting existing files. If `.gitignore` uses a root `/*` allowlist, adds
`!/knowledge/`.

### 2. Follow the Context Gate on every lookup

- **Before editing code**: run `mex-agent wiki for-code <nodeId>` or `mex-agent impact <symbol|file>` and read only the linked `knowledge/` sections.
- **Searching past queries or active work**:
  ```bash
  zg query "<topic>" -g 'knowledge/**' -g '!knowledge/raw/**' -g '!knowledge/work/archive/**' --preview none --limit 5
  ```
  Inspect paths/headings/line ranges first, then read only the needed lines.
- **Searching code only**:
  ```bash
  zg query "<symbol or concept>" -g '!knowledge/**' --preview none --limit 8
  ```

### 3. Pair documents and audit drift

Every durable note in `knowledge/queries/`, `knowledge/work/active/`, or
`knowledge/concepts/` uses frontmatter `status`, `paired_files`, and
`paired_symbols` (`path/to/file.py#symbol_name` or `path/to/file.py:line`). Audit or sync pairings:

```bash
python3 .agent-skills/repo-knowledge-wiki/scripts/pair_sync.py --project /path/to/repo --json
python3 .agent-skills/repo-knowledge-wiki/scripts/pair_sync.py --project /path/to/repo --sync --dry-run --json
python3 .agent-skills/repo-knowledge-wiki/scripts/pair_sync.py --project /path/to/repo --sync --json
```

`--sync` generates an idempotent `mex-agent wiki apply` batch under `.mex/local/setup-ops/pair-sync.json`, refreshes `.mex/graph.db` and `.zvec-grep/`, and verifies pairing integrity.

### 4. Archive completed work checks

When a `knowledge/work/active/<task>.md` checklist finishes:

1. Update `status: done` in frontmatter and move it to `knowledge/work/archive/`.
2. Update `knowledge/index.md` and append one line to `knowledge/log.md`.
3. Run `zg index` so default active-work queries exclude the archived note.
