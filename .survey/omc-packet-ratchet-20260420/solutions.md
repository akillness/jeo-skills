# Solution Landscape: omc packet ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Claude Code native teams / subagents / hooks | First-party Claude orchestration surfaces | Native, well-supported, rich hook model | Claude-only, less opinionated packet routing | Baseline host runtime for OMC |
| OMC / oh-my-claudecode | Claude-first orchestration wrapper over Claude Code + shell CLI | Strong in-session skill set, `omc` CLI, active upstream | Two-surface confusion, fast-moving, plugin-vs-CLI drift | Primary target of this ratchet |
| OMX / oh-my-codex | Codex-first sibling wrapper | Clear Codex runtime owner, tmux team runtime | Less native hook parity than Claude/Gemini, platform-dependent | Useful route-out comparator |
| OHMG / Gemini wrapper space | Gemini / Antigravity portable-harness wrappers | Strong settings/rules/hooks portability, `.agents/` anchor | Fragmented implementations, weaker single-default story | Useful route-out comparator |
| OpenHands / CrewAI / LangGraph | General orchestration frameworks | Powerful when building a platform or custom agent system | Too heavy for a wrapper front door | Indirect competitors / substitutes |

## Categories
- First-party runtime surfaces: Claude Code, Codex CLI, Gemini CLI.
- Opinionated wrapper packs: OMC, OMX, OHMG variants.
- Heavy general frameworks: OpenHands, CrewAI, LangGraph.

## What People Actually Use
Operators mix marketplace/plugin installs with npm CLI installs, use `/team` and `omc team` as different runtimes, and fall back to tmux/worktrees/plugin-dir flows when they need real external CLIs or local development loops. The recurring real-world behavior is install-topology management, not abstract command memorization.

## Frequency Ranking
1. First-party runtime + extension surfaces
2. Wrapper packs that add an opinionated operating method
3. Parallel team runtimes with shared state
4. Hook / automation surfaces
5. Heavy orchestration frameworks

## Key Gaps
- Most wrapper confusion comes from install topology and surface truth, not from a missing new wrapper category.
- Codex lacks a broad native hook surface comparable to Claude/Gemini, so wrapper runtime behavior must stay labeled as wrapper behavior.
- Gemini-side wrapper space is active but fragmented, which reinforces keeping `omc` explicitly Claude-first rather than pretending portable parity.

## Contradictions
- Marketed wrapper stories often sound unified, but operators still juggle plugin skills, shell CLIs, tmux panes, worktrees, and manual cleanup.
- `/team` and `omc team` sound similar, but upstream docs and user reports confirm they are different runtimes.

## Key Insight
The best bounded maintenance move is not another orchestration wrapper. It is making `omc` identify install topology and runtime surface earlier so the skill can say whether the user is on Claude Code plugin runtime, shell CLI runtime, local-checkout/plugin-dir mode, or an adjacent owner path before it suggests commands.

## Curated Sources
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks-guide
- https://github.com/Yeachan-Heo/oh-my-claudecode
- https://github.com/Yeachan-Heo/oh-my-codex
- https://github.com/google-gemini/gemini-cli
- https://github.com/first-fluke/oh-my-agent/blob/main/README.md
- https://github.com/OpenHands/OpenHands
- https://github.com/crewAIInc/crewAI
- https://github.com/langchain-ai/langgraph
