# Platform Map: opencontext next ratchet

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Persistent project instructions | `CLAUDE.md` / imported markdown docs ([Anthropic docs](https://docs.anthropic.com/en/docs/claude-code/memory)) | repo-visible guidance files or repo-local startup notes passed into the CLI workflow | repo-visible workflow docs or harness instructions in the working repo | **Project memory packet**: repo-local docs the next agent can load first |
| Startup context shape | short read-first docs + project memory | compact repo brief / selected files / manifest-like startup note | compact workflow guide + selected docs | **Manifest / read-first list** |
| Context portability | strongest inside Claude Code | strongest inside the Codex/local CLI workflow that loads the repo | strongest inside the Gemini/portable harness workflow | **Portable markdown + stable links** rather than tool-private memory only |
| Structural orientation | repo docs + local memory | repo docs + selected files / packers | repo docs + selected files / packers | **Use OpenContext for active memory, not structure graphs or one-shot repo packing** |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Who owns active project memory? | `CLAUDE.md`-style repo memory often carries the startup burden | repo-local notes/manifests/handoff docs must be supplied or loaded explicitly | workflow guides and repo docs usually carry the burden | **OpenContext should own active project/repo memory when the need is load → search → store continuity** |
| When to route out | Route wiki/graph/vault/repo-packer jobs outward instead of overloading project memory | Same: do not flatten repo packing or wiki maintenance into active memory | Same: keep project memory distinct from harness docs, graphs, and note vaults | **Route wiki → `llm-wiki`; graph → `graphify`; vault → note/vault skill; snapshot packing → repo packer** |
| Trust / precedence | Multiple repo docs can disagree | Multiple local notes can disagree | Multiple harness/docs layers can disagree | **OpenContext needs a clearer precedence rule: canonical doc > current handoff > prior agent summary > inferred note** |
| Freshness | Branch and repo state can invalidate stored notes | Branch and repo state can invalidate stored notes | Branch and repo state can invalidate stored notes | **OpenContext should warn on stale or branch-mismatched memory** |
| Provenance | Users need to know where the note came from | Users need to know where the note came from | Users need to know where the note came from | **OpenContext should surface provenance in the stored/loaded brief** |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-task | load `CLAUDE.md` / read-first docs | load repo brief / selected startup docs | load workflow guide / startup docs | **Pre-task manifest / read-first packet** |
| During task | search prior docs when uncertain | search prior docs when uncertain | search prior docs when uncertain | **Targeted search for decisions, pitfalls, acceptance notes** |
| Post-task | update project memory or handoff note | update handoff note / working brief | update handoff note / working brief | **Store compact conclusions with provenance and next checks** |
| Cross-session | rely on repo-local memory files for continuity | rely on repo-local notes or packed context | rely on repo-local workflow docs | **Durable, inspectable markdown beats hidden session state for cross-tool handoff** |

## Platform Gaps
- Claude Code, Codex, and Gemini-adjacent workflows all support some form of repo-visible project context, but none automatically solve **precedence**, **provenance**, or **branch freshness** for active memory.
- Assistant-native memory surfaces are convenient inside one tool, yet portability still depends on markdown notes and stable links.
- This makes the next bounded `opencontext` improvement fairly clear: sharpen it around a **trustworthy active-memory brief** instead of broadening the memory-layer explanation again.