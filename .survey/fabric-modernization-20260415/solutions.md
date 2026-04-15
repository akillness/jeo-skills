# Solution Landscape: fabric modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Fabric | Pattern-first CLI for reusable AI transforms over stdin, files, URLs, and ingested content | Distinct pattern library, content-oriented workflows, built-in REST server, custom patterns | Setup/provider friction, pattern sprawl, still depends on external ingest and shell composition | Direct target; upstream positions it as solving AI integration through organized prompts ([repo](https://github.com/danielmiessler/Fabric), [README](https://github.com/danielmiessler/Fabric/blob/main/README.md), [REST API docs](https://raw.githubusercontent.com/danielmiessler/Fabric/main/docs/rest-api.md)) |
| LLM (`llm`) | General-purpose plugin-driven LLM CLI | Strong shell ergonomics, plugins, broad model support, composable with other tools | Less opinionated around curated reusable pattern workflows | Best comparator for generic CLI prompting ([repo](https://github.com/simonw/llm)) |
| Mods | Polished terminal AI CLI | Strong UX and shell integration for ad hoc prompting | Not a pattern-library-first system | Adjacent but broader prompt runner ([repo](https://github.com/charmbracelet/mods)) |
| ShellGPT | Quick shell/chat CLI | Familiar shell helper model, command generation, fast one-offs | Less suited to reusable pattern packs and structured content transforms | More assistant-like than pattern-first ([repo](https://github.com/TheR1D/shell_gpt)) |
| AIChat | Terminal chat + model routing tool | Role/config support, shell integration, broader agent/chat surface | Broader chat tool, less centered on a reusable pattern catalog | Overlaps on terminal usage, not on Fabric's core identity ([repo](https://github.com/sigoden/aichat)) |
| Aider | Terminal coding assistant | Excellent for repo editing, git-aware coding workflows | Distinct job: coding assistant, not general content/pattern transforms | Clear route-out when task is repo editing rather than prompt orchestration ([docs](https://aider.chat/docs/)) |
| files-to-prompt | File/repo packing utility | Strong context packaging primitive for other LLM CLIs | Not a prompt/pattern runner by itself | Complementary preprocessor, not a substitute ([repo](https://github.com/simonw/files-to-prompt)) |
| Repomix | Repository context packer | Good for codebase/repo bundling before model use | Narrow scope; not a pattern library | Complementary upstream context step ([repo](https://github.com/yamadashy/repomix)) |
| Jina Reader / `r.jina.ai` | URL-to-LLM-friendly text extraction | Useful pre-ingest primitive for web/article workflows | External dependency; extraction brittleness remains | Complement to Fabric's content pipeline ([reader](https://jina.ai/reader/), [r.jina.ai](https://r.jina.ai/)) |

## Categories
- **Pattern-first orchestration:** Fabric is the clearest example of a prompt/pattern catalog as a product identity rather than an incidental feature.
- **General-purpose AI CLIs:** `llm`, Mods, ShellGPT, AIChat cover broader shell prompting and model access.
- **Coding assistants:** Aider belongs next door but should remain a separate boundary.
- **Context/extraction helpers:** files-to-prompt, Repomix, and Jina Reader are upstream helpers rather than full workflow replacements.

## What People Actually Use
People seem to use Fabric most as a **single-transform accelerator**: summarize, extract, explain, clean up, or repurpose a specific piece of text after they already have the text in hand. Even when Fabric advertises ingestion and server capabilities, the durable practical behavior is still shell composition: fetch or copy input, run one named pattern, optionally chain another tool or editor pass, then export the result.

## Frequency Ranking
1. General-purpose LLM CLIs (`llm`, Mods, AIChat, ShellGPT) — most common shell-adjacent category.
2. Context/extraction helpers (files-to-prompt, Repomix, Jina Reader) — common complementary layer.
3. Coding assistants (Aider) — highly visible, but clearly separate from Fabric's prompt/content role.
4. Pattern-first orchestration (Fabric) — less crowded category and therefore the best reason to keep a dedicated skill.

## Key Gaps
- Most adjacent tools cover **shell access** but not **curated reusable pattern operations** as the main value layer.
- Pattern libraries often lack strong **routing guidance**: which pattern to pick, when to fork a custom pattern, and when to leave the tool for a heavier workflow.
- Many tools still leave **input acquisition and normalization** outside the product boundary, which means operator-facing skills must explicitly describe the surrounding shell workflow.
- Multi-step workflows still tend to fall back to shell scripts or external automation even when single transforms are easy.

## Contradictions
- Marketed claim: terminal AI tools feel like seamless end-to-end automation.
  - User reality: operator workflows still involve copy/paste, shell wrappers, cleanup steps, and editor passes.
- Marketed claim: large pattern libraries increase power.
  - User reality: more patterns also increase discoverability problems and CLI mental overhead (`#1974`).
- Marketed claim: multi-provider support increases flexibility.
  - User reality: configuration and vendor resolution remain a meaningful failure mode (`#2084`).

## Key Insight
Fabric still clears the bar for a dedicated skill, but only if the repo treats it as the **pattern-first CLI for repeatable text/content transforms** rather than as a generic "AI in the terminal" wrapper. The cleaner move is to modernize the existing skill around pattern routing, shell composition, and custom-pattern maintenance—then explicitly route coding-assistant work, one-off chat use, and upstream context extraction to neighboring tools or skills instead of letting `fabric` absorb everything.

## Curated Sources
- Fabric repo: https://github.com/danielmiessler/Fabric
- Fabric README: https://github.com/danielmiessler/Fabric/blob/main/README.md
- Fabric REST API docs: https://raw.githubusercontent.com/danielmiessler/Fabric/main/docs/rest-api.md
- `llm`: https://github.com/simonw/llm
- `files-to-prompt`: https://github.com/simonw/files-to-prompt
- Mods: https://github.com/charmbracelet/mods
- ShellGPT: https://github.com/TheR1D/shell_gpt
- AIChat: https://github.com/sigoden/aichat
- Aider: https://aider.chat/docs/
- Repomix: https://github.com/yamadashy/repomix
- Jina Reader: https://jina.ai/reader/
