# OpenUI Lang 1.0, Providers, and Regeneration Guide

## Runtime & Package Surface
- **Engine requirement:** Node.js `>= 24`
- **Core OpenUI packages (`package.json`):**
  - `@openuidev/intelligent-ui-library`
  - `@openuidev/lang-core`
  - `@openuidev/react-lang`
  - `@openuidev/react-ui`
  - `@openuidev/cli` (devDependency for `openui generate`, `openui generate-api-key`, `openui deploy`)
- **App Extensions (`src/lib/library.ts`):** `SearchImage` (`/api/wiki` + `/api/image-search`), `Map` + `MapMarker` (MapLibre GL + `/api/street-route` via OSRM), and `@CopyToClipboard` (`src/lib/actions.ts`).

## Provider Paths (`.env`)

| Mode | Required Env Vars | Notes |
|---|---|---|
| OpenUI Cloud Gateway | `THESYS_API_KEY` | Validates/corrects generated OpenUI Lang server-side; defaults to `openai/gpt-6.1-sol` at `https://api.thesys.dev/v1/embed`. |
| OpenAI-Compatible API | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Calls Chat Completions directly (`generateSystemPrompt` built locally); no Gateway output correction. |
| Local Ollama / LM Studio | `MODEL_PROVIDER=ollama`, `OLLAMA_MODEL`, `OLLAMA_BASE_URL` | Requires `OLLAMA_CONTEXT_LENGTH=32768` (or `num_ctx 32768`); default `qwen3.8:27b`. |

Optional tuning: `LLM_REASONING_EFFORT=low` (default) reduces time-to-first-UI-line on reasoning models.

## Key OpenUI Lang 1.0 Primitives & Functions
- **Layout:** `Col`, `Row`, `Box`, `Grid`, `Card`, `Carousel`, `Popover`, `Divider`, `Spacer`
- **Text & Play:** `Title`, `Text`, `Caption`, `Label`, `Badge`, `Link`, `List`, `ListItem`, `Markdown`, `Quote`, `Code`, `Math` (KaTeX), `Flashcard`, `Celebration`
- **Stateful Inputs (`$variables`):** `Button`, `IconButton`, `Pressable`, `Input`, `TextArea`, `Select`, `SegmentedControl`, `Slider`, `Checkbox`, `RadioGroup`, `DatePicker`, `Timer`, `Form`
- **Media, Data & Drawing:** `SearchImage`, `Image`, `Icon`, `Table`, `Chart` (`bar`, `line`, `area`, `pie`, `donut`, `scatter`), `Map`, `MapMarker`, `YouTube`, `Svg` (`G`, `Circle`, `Ellipse`, `Rect`, `Line`, `Path`, `Polyline`, `Polygon`, `SvgText`), `HtmlView`
- **59 `@functions` + Built-ins:** `@Each`, `@Set`, `@Reset`, `@ToAssistant`, `@OpenUrl`, `@CopyToClipboard`, list ops (`@Append`, `@Toggle`, `@Range`, `@Chunk`), math/finance (`@Pow`, `@Clamp`, `@Allocate`, `@Payment`), date/data ops (`@GroupBy`, `@Pivot`, `@MovingAvg`, `@Stats`).

## Regeneration & Verification Commands

```bash
npm run generate     # rebuilds src/generated/spec.json, coach-spec.json, chess-spec.json
npm run prompt       # rebuilds system-prompt.txt, dashboard/coach/chess-system-prompt.txt
npm test             # runs Vitest parser and function tests
npm run typecheck    # tsc --noEmit
npm run build        # next build
npm run bench -- --fake
```

## Specialized Modes
- `/gallery` — Offline hand-written showcase (16 working-tool examples, 2 dashboards, component demos; light/dark toggle).
- `/clash` — Clash Royale deck coach (`src/lib/coach/`, `DeckSim`, playable `public/arena/`, `npm run cards:art`).
- `/chess` — Chess coach (`src/lib/chess/`, `chess.js`, alpha-beta sparring engine).
