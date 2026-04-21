# Context: fabric modernization

## Workflow Context
`fabric` appears in real workflows as a **pattern-first CLI layer** for transforming external content or shell output into reusable AI operations. Upstream describes Fabric as an open-source framework for augmenting humans using AI and solving the integration problem by organizing prompts by real-world task rather than by model or chat surface ([README](https://github.com/danielmiessler/fabric/blob/main/README.md), [repo API metadata](https://api.github.com/repos/danielmiessler/Fabric)). In practice this puts it in four recurring lanes:

1. developer / terminal workflows — piping logs, diffs, notes, code, or command output through named patterns;
2. research / reading workflows — summarizing articles, transcripts, PDFs, and source dumps;
3. marketing / content workflows — repurposing one source into summaries, takeaways, titles, outlines, and social-ready drafts;
4. reusable prompt operations — maintaining a pattern pack instead of keeping scattered prompts in notes apps or shell history.

Recent upstream movement reinforces that Fabric is still evolving as a serious operator tool rather than a static prompt pack: the repo had ~40.6k stars, ~4.0k forks, 33 open issues, and fresh releases including `v1.4.445` published 2026-04-13 when checked in this run via direct GitHub API retrieval.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| CLI-heavy developer | Turn shell output, code, logs, docs, and diffs into structured AI transforms | Intermediate to advanced terminal user |
| Technical writer / DevRel | Summarize source material and produce reusable editorial transforms | Intermediate |
| Marketing / content operator | Repurpose transcripts, articles, and notes into campaign or content assets | Intermediate |
| Research / analysis worker | Distill large text inputs into action-ready summaries and extracted insights | Intermediate |
| Prompt/pattern maintainer | Build and curate reusable custom patterns for repeatable workflows | Advanced |

## Current Workarounds
1. **Copy/paste into chat UIs** — fast for one-offs, weak for repeatability, piping, versioning, and team reuse.
2. **Saved prompts in docs / notes / snippets** — useful socially, but prompts drift and there is no clear operator workflow.
3. **General-purpose LLM CLIs** such as Simon Willison's `llm`, Charm's `mods`, ShellGPT, or AIChat — strong shell access, but they are less centered on a curated reusable pattern library than Fabric ([LLM](https://github.com/simonw/llm), [Mods](https://github.com/charmbracelet/mods), [ShellGPT](https://github.com/TheR1D/shell_gpt), [AIChat](https://github.com/sigoden/aichat)).
4. **Custom shell scripts** around model APIs — more deterministic for automation, but users must reinvent prompt catalog, discovery, and conventions.
5. **External preprocessing tools** for URL/transcript/file extraction — users often fetch/clean text first, then hand the result to Fabric or another LLM tool.

## Adjacent Problems
- **Pattern discoverability:** upstream now ships about 252 patterns, which is powerful but increases selection ambiguity; an operator skill should guide pattern choice rather than dump the whole catalog.
- **Provider/config friction:** open issues show setup is still a real pain surface, e.g. vendor resolution problems for Ollama/remote configs (`#2084`) and custom-pattern directory resolution bugs in server mode (`#2045`) ([issue #2084](https://github.com/danielmiessler/Fabric/issues/2084), [issue #2045](https://github.com/danielmiessler/Fabric/issues/2045)).
- **CLI surface sprawl:** users are explicitly asking for a cleaner mental model because the CLI has become cluttered (`#1974`) ([issue #1974](https://github.com/danielmiessler/Fabric/issues/1974)).
- **Input acquisition still persists outside Fabric:** YouTube and other ingestion workflows still hit edge cases, e.g. custom `yt-dlp` instance requests (`#1927`) ([issue #1927](https://github.com/danielmiessler/Fabric/issues/1927)).
- **Single-shot output vs multi-step workflows:** Fabric excels at named prompt transforms, but larger ingest → clean → summarize → export pipelines still need shell composition or separate automation.

## User Voices
> "Fabric was created to address this by creating and organizing the fundamental units of AI—the prompts themselves!" — upstream README framing the product around reusable prompt units instead of generic chat ([README](https://github.com/danielmiessler/fabric/blob/main/README.md))

> "What I'm really asking for is a stable core shape: One opinionated default, a small number of sharp options, and something I can actually hold in my head." — user request arguing the CLI has become too cluttered ([issue #1974](https://github.com/danielmiessler/Fabric/issues/1974))

> "fabric -L successfully lists the models from the remote URL, proving the URL is reachable, but the chat/stream logic fails to map the model to the vendor." — provider-config frustration from an Ollama/remote setup issue ([issue #2084](https://github.com/danielmiessler/Fabric/issues/2084))

> "Pattern names are discovered from both directories, but content resolution only checks `~/.config/fabric/patterns/`." — custom-pattern server mismatch that matters to users treating Fabric as a reusable prompt library ([issue #2045](https://github.com/danielmiessler/Fabric/issues/2045))
