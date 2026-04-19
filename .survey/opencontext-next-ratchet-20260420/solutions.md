# Solution Landscape: opencontext next ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| OpenContext | Active project/repo memory with manifests, searchable notes, and stable links | Repo-local, explicit, cross-agent handoff friendly | Needs clear trust/freshness rules to stay sharp | Best fit for active project memory rather than generic knowledge storage |
| `CLAUDE.md` / Claude Code memory | Repo-visible persistent project instructions | Very low friction, native to Claude Code, straightforward startup packet | Easy to bloat; trust order across multiple docs is still manual | Strong evidence that users want repo-local memory surfaces ([Anthropic docs](https://docs.anthropic.com/en/docs/claude-code/memory)) |
| Cursor Rules / Memories | IDE-native recurring repo context | Convenient inside Cursor, easy to scope to project | Less portable across assistants; can still become another instruction layer to curate | Adjacent “assistant context surface,” not a full handoff layer |
| Cline Memory Bank | Structured markdown memory-bank files | Makes active-context / progress split explicit | More opinionated file taxonomy; still manual upkeep | Strong evidence for markdown-first handoff behavior ([Cline docs](https://docs.cline.bot/prompting/cline-memory-bank)) |
| Aider repo map | Generated structural repo summary | Good cold-start orientation on large repos | Structure, not ongoing active-memory ownership | Useful adjacent layer for “understand the repo,” not “trust this current handoff” ([Aider repo map](https://aider.chat/docs/repomap.html)) |
| Repomix / Gitingest / Code2Prompt-style packers | One-shot repo-to-prompt packaging | Fast context transfer to a model/chat, highly portable | Snapshot only; weak for ongoing project memory or post-run storage | Best route-out for repo-packer requests, not ongoing memory ([Repomix](https://github.com/yamadashy/repomix)) |
| llms.txt | Canonical AI-readable entry manifest | Helpful “read this first” surface and stable entrypoint | Early/uneven adoption; does not manage active handoffs itself | Good manifest pattern adjacent to OpenContext ([llmstxt.org](https://llmstxt.org/)) |
| Mem0 / Graphiti / Zep | Persistent agent-memory layer | Strong long-term retrieval and memory infrastructure | Can be opaque, less repo-local, less obvious for explicit handoffs | Adjacent memory systems, not necessarily canonical project briefs |
| Notion / Obsidian / markdown wiki | Human-authored project notes and long-lived knowledge | Flexible, durable, human-friendly | Not naturally scoped for minimal runtime packet; often duplicated into repo docs | Better as wiki/vault layer than active project-memory owner |

## Categories
- **Active assistant context surfaces:** `CLAUDE.md`, Cursor Rules/Memories, Cline Memory Bank
- **Structural/context compression:** Aider repo map, repo packers
- **Manifest / canonical entrypoint patterns:** llms.txt, repo “start here” docs
- **Persistent agent-memory infrastructure:** Mem0, Graphiti, Zep
- **Human-authored wiki/vault layers:** Obsidian, Notion, markdown wiki systems

## What People Actually Use
In practice, operators blend categories:
- repo-local markdown for active instructions and handoffs;
- external wiki/vault notes for longer-lived synthesis;
- repo maps or packers when cold-start orientation fails;
- manual copy/paste or compact summaries when assistant-native memory is not portable enough.

The dominant real behavior is still **explicit markdown handoff + repo-visible rules**, not fully automated “the memory layer handles everything.”

## Frequency Ranking
1. Repo-local instruction files (`CLAUDE.md`, rules, handoff docs)
2. Human-authored note/wiki layers with distilled repo subsets
3. Repo maps / repo packers for cold starts or cross-tool transfer
4. Agent-memory systems with retrieval backends
5. Canonical AI-entry manifest patterns such as `llms.txt`

## Key Gaps
- **Trust model gap:** most tools help store or surface context, but few clearly say which artifact should win when docs disagree.
- **Freshness gap:** branch-specific or migration-specific state is often implicit, so active memory can become dangerously stale.
- **Provenance gap:** users can read the note, but not always the origin or reliability of its claims.
- **Cross-tool portability gap:** assistant-native rules help inside one tool but do not travel cleanly across agent stacks.

## Contradictions
- Marketed claim: assistant memory or project rules reduce re-explanation.  
  User reality: teams still maintain explicit markdown handoff files and often duplicate context across tools.
- Marketed claim: retrieval/memory systems solve continuity.  
  User reality: operators still want simple repo-visible briefs they can inspect, version, and trust.
- Marketed claim: repo packers solve context.  
  User reality: they solve snapshot transfer, not durable active-memory ownership.

## Key Insight
The strongest remaining opportunity for `opencontext` is not another explanation of memory layers. It is a sharper **trustworthy active-memory packet**: tell the next agent what to load first, how to rank conflicting artifacts, how to judge freshness/provenance, and what minimal note to store after meaningful work. That differentiates OpenContext from assistant-native rules, long-lived wikis, graph layers, and one-shot repo packers without creating another overlapping memory wrapper.