---
name: open-intelligent-ui
description: >
  Build, customize, and benchmark ChatGPT-style Generative UI applications with thesysdev/open-intelligent-ui and OpenUI Lang 1.0 (`@openuidev/intelligent-ui-library`). Use when streaming interactive UI (maps, photos, charts, flashcards, SVG/HTML views, stateful `$variable` working tools and `@functions`), configuring OpenUI Cloud (`THESYS_API_KEY`), OpenAI-compatible Chat Completions (`LLM_BASE_URL`), or local Ollama (`MODEL_PROVIDER=ollama` with 32K context), extending `src/lib/library.ts` via `library.extend`, regenerating system prompts (`npm run generate && npm run prompt`), or running `/gallery` and `scripts/bench/run.mjs`. Route single-file React agent cards to affectui, Tailwind v4 frosted glass CSS themes to solid-glass, and SKILL.md validation to skill-standardization.
allowed-tools: Bash Read Grep Glob
metadata:
  version: 0.1.0
  source: https://github.com/thesysdev/open-intelligent-ui
  upstream_commit: dd45370b3ca785692c4c761cbafe4242421275f6
---

# Open Intelligent UI

## When to use this skill

Use when operating, extending, or self-hosting `thesysdev/open-intelligent-ui` — an MIT-licensed Next.js 16 / React 19 Generative UI app where LLM responses stream as OpenUI Lang 1.0 programs rendered with `@openuidev/intelligent-ui-library` and app-specific extensions (`SearchImage`, `Map`/`MapMarker`, `@CopyToClipboard`).

### Route-outs
- For standalone React 19 agent UI components installed via shadcn without OpenUI Lang streaming, use `affectui`.
- For Tailwind CSS 4 + Base UI frosted glass CSS theme tokens, use `solid-glass`.
- For general token governance or component API design systems, use `design-system`.
- For validating `SKILL.md` format or catalog metadata, use `skill-standardization`.

## Instructions

### 1. Run offline project preflight

Before starting the dev server, editing schemas, or configuring providers, inspect the checkout and Node runtime offline:

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --workspace "/absolute/path/to/open-intelligent-ui" --json
```

The preflight script checks Node.js `>= 24` availability, `@openuidev/*` dependencies in `package.json`, `src/generated/` prompt/spec artifacts, and `.env` / `.env.example` variable names (boolean presence only, never reading or printing key values).

### 2. Choose one LLM provider path

Configure `.env` from `.env.example` for exactly one inference backend:

1. **OpenUI Cloud (Gateway, validates & corrects OpenUI Lang):**
   - Run `npm run generate:apiKey` (writes `THESYS_API_KEY` to `.env`) or set `THESYS_API_KEY` manually.
   - Optional: `THESYS_MODEL` (default `openai/gpt-6.1-sol`), `THESYS_BASE_URL` (`https://api.thesys.dev/v1/embed`), `LLM_REASONING_EFFORT` (`low` default).
2. **Any OpenAI-compatible Chat Completions endpoint (e.g., OpenRouter):**
   - Set `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`.
   - `/api/chat` builds the full OpenUI 1.0 system prompt locally (`generateSystemPrompt`) and streams completions without Gateway output correction.
3. **Local Ollama (no API key):**
   - Set `MODEL_PROVIDER=ollama`, `OLLAMA_MODEL` (default `qwen3.8:27b`), `OLLAMA_BASE_URL` (`http://localhost:11434/v1`).
   - **Critical:** Ollama's default 4,096-token context silently truncates the ~8,000-token OpenUI system prompt. Start Ollama with `OLLAMA_CONTEXT_LENGTH=32768 ollama serve` or set `PARAMETER num_ctx 32768` in a `Modelfile`.

### 3. Extend components, functions, or prompt options safely

- **Base library:** `@openuidev/intelligent-ui-library` provides Layout (`Col`, `Row`, `Box`, `Grid`, `Card`, `Carousel`), Text/Data (`Title`, `Text`, `Table`, `Chart`, `Markdown`, `Code`, `Math`, `Flashcard`), Inputs (`Slider`, `Select`, `DatePicker`, `Form` bound to `$variables`), Drawing (`Svg`, `HtmlView`), and 59 `@functions` (`@Append`, `@Each`, `@Range`, `@Pow`, `@Allocate`, `@GroupBy`, `@MovingAvg`, etc.).
- **App extensions (`src/lib/library.ts`):** Uses `library.extend(...)` to add `SearchImage`, `Map`/`MapMarker`, and `@CopyToClipboard`.
- **Mandatory regeneration:** Whenever you modify a component schema, `@function`, or `src/lib/prompt-options.ts` (including coach/chess variants in `src/lib/coach/` and `src/lib/chess/`), regenerate specs and prompts and run checks:

```bash
npm run generate && npm run prompt
npm test && npm run typecheck
```

Do not rename existing component or `@function` signatures, reorder arguments, or remove allowed color tokens (`ink`, `muted`, `faint`, `surface`, `info`, `success`, `warning`, `danger`, `purple`, `pink`, `chart1`–`chart6`) without regenerating prompts and updating gallery/bench programs.

### 4. Inspect `/gallery` and run benchmarks

- Visit `/gallery` during `npm run dev` to verify all 16 working-tool examples, dashboards, and light/dark/mobile layouts with zero API keys required.
- Run the offline fake benchmark or live model benchmark:

```bash
npm run bench -- --fake                  # validates hand-written answers with 1.0 parser
# With npm run dev running in another terminal (requires explicit key approval):
npm run bench -- --model <id> --base-url https://openrouter.ai/api/v1 --key-env OPENROUTER_API_KEY
```

## Examples

### Local Ollama setup with 32K context and gallery verification

```bash
# 1. Offline preflight
python3 "$SKILL_DIR/scripts/preflight.py" --workspace /path/to/open-intelligent-ui --json

# 2. Configure Ollama with 32K context window
cp .env.example .env
# Set MODEL_PROVIDER=ollama and OLLAMA_MODEL=qwen3.8:27b in .env
OLLAMA_CONTEXT_LENGTH=32768 ollama serve

# 3. Verify parser tests and build
npm install && npm test && npm run typecheck && npm run build
```

## Best practices

1. **Enforce Node 24+ and 32K context for Ollama:** Skipping the context override causes silent prompt truncation and broken OpenUI Lang output.
2. **Never break OpenUI Lang positional contracts:** Models stream positional arguments (`Slider($price, 0, 100)`, `Card` gap before padding); regenerate `spec.json` and `system-prompt.txt` immediately after schema edits.
3. **Keep `/api/chat` and demo extensions honest:** Note that `SearchImage` queries Wikipedia/Wikimedia Commons and `/api/street-route` queries the public OSRM demo server.
4. **Gate paid API runs and benchmarks:** Confirm provider choice and API key env vars with the user before running `npm run bench` against live endpoints.

## References

- [OpenUI Lang, Providers, and Regeneration Guide](references/openui-lang-and-providers.md): Primitives, `@functions`, provider matrix, `generate`/`prompt` commands, and `/clash` & `/chess` coach modes.
- [Sources and Provenance](references/sources.md): Upstream pin (`dd45370b3ca785692c4c761cbafe4242421275f6`), v0.1.1 metadata, MIT license, and operational boundaries.
- [Evaluation Scenarios](evals/evals.json): Five behavioral evaluation scenarios covering provider configuration, Ollama context limits, prompt regeneration, and route-outs.
