# Library, 0.x migration and Browser Use Cloud

Source: `README.md`, `MIGRATING.md`, `CLOUD.md`, `AGENTS.md` and `skills/{open-source,cloud}` at the pin; the error messages and constructors were
exercised in an isolated 1.0.3 install ([`upstream.md`](upstream.md)). Tiers refer to [`SKILL.md`](../SKILL.md).

## Which path

| Need | Path | Notes |
|---|---|---|
| A coding agent should use a browser now | CLI (`browser-use <<'PY'`) | Local Chrome or own Chromium: no spend. Cloud browser: billed |
| Browser agents inside the user's application | Library (`Agent`, `Browser`, `Tools`) | `Agent(task)` alone uses the Browser Use gateway model and a cloud browser: tier 3 |
| Hosted "task in, result out", or a cloud browser for an existing agent | Cloud API v4 / `browser-use-sdk` | Hosted only, billed, key required |
| An MCP host should drive a browser | `browser-use --cli-mcp` | Host registration is tier 4 |

## Install and first agent (library)

```bash
uv add 'browser-use==1.0.3'            # or: pip install 'browser-use==1.0.3' in a venv. Python 3.11 or newer. Pin with ==.
browser-use login                      # the user's step: one key for the default model and cloud browsers (or set BROWSER_USE_API_KEY)
browser-use install                    # only for Browser('chromium') without an installed Chrome
```

```python
import asyncio
from browser_use import Agent

async def main():
    result = await Agent('Find the top story on Hacker News').run()
    print(result.final_result())

asyncio.run(main())
```

`Agent(task).run_sync()` works outside async code (not inside a running event loop). Defaults: model `bu-fast` on the Browser Use gateway
(`gpt-6-luna` at medium reasoning; `bu-ultrafast` is the same model at low reasoning on the priority tier, `bu-smart` a larger one), browser `Browser()` = a
Browser Use Cloud browser stopped when the run ends, `mode='ultrafast'` on the two fast aliases, `max_steps=100`, `timeout=1700` seconds.

## Agent

```python
Agent(
    task,                        # non-empty str
    llm=None,                    # default ChatBrowserUse('bu-fast'); a Chat* class or a Pydantic AI model string
    browser=None,                # default Browser() (cloud)
    tools=None,                  # Tools() with custom actions
    output_model_schema=None,    # pydantic model, Literal, enum...: result.structured_output
    sensitive_data=None,         # {'name': 'value'} or {'https://site.com': {'name': 'value'}}
    extend_system_message=None,
    reasoning=None,              # 'low' | 'medium' | 'high'
    mode=None,                   # 'ultrafast' = accessibility-tree helpers
    workspace=None,              # the agent's files; default a temp dir that is kept
    web_search=False,            # True gives search(): billed per search, needs a Browser Use key, not with allowed_domains
    highlight_actions=True,      # orange corner brackets for 1 s, never in the agent's screenshots
)
await agent.run(max_steps=100, timeout=1700)   # max_steps >= 1; timeout in seconds for the agent loop
agent.add_new_task('next task')                # the next run() continues the same conversation
```

Result: `final_result()`, `structured_output`, `status` (`completed` | `max_steps` | `timeout` | `error`), `is_successful()` (the agent's own verdict, `None` when the
run did not complete), `error`, `partial` (the last `checkpoint(..., partial=True)`), `usage`, `cost_usd` (model and web search only; the cloud browser and
proxy bill apart), `messages` (the transcript), `downloads`, and the files in `agent.workspace` (downloads in `workspace/downloads`).

## Browser

| Call | What the agent drives |
|---|---|
| `Browser()` | A Browser Use Cloud browser (default): `cloud_profile_id`, `cloud_proxy_country_code='us'`, `cloud_timeout` (minutes, 1 to 240), `live_view`, `captcha_solver` |
| `Browser('chromium')` | A fresh local Chrome, Chromium or Edge with a temp profile deleted afterwards; headless when there is no display; `headless=`, `executable_path=`, `user_data_dir=` |
| `Browser('chrome')` | The Chrome the user has open, with their logins (they enable `chrome://inspect/#remote-debugging` once and click Allow) |
| `Browser('chrome', profile='Work')` | A new Chrome on a temporary copy of the profile (sync off); the user's Chrome can stay open (Windows: quit it first) |
| `Browser(cdp_url='http://127.0.0.1:9222')` | Any CDP endpoint |
| `Browser(keep_alive=True)` | `run()` leaves it running; `await browser.stop()` ends it |
| `Browser(allowed_domains=[...])`, `prohibited_domains=`, `block_ip_addresses=True` | A guard in every mode; see [`safety.md`](safety.md) |

Give each concurrent `Agent` its own `Browser()`; one running `Agent` per `Browser`. `Browser('chrome')` is one at a time because every instance in a process shares the
default daemon. A server creates a `Browser()` per request, not one at module level. Options that do not fit the browser (`headless` on a cloud browser,
`profile` on `'chromium'`, `cloud_profile_id` on a local one) raise `ValueError` naming the right call.

## Models

```python
from browser_use import ChatBrowserUse, ChatOpenAI, ChatAnthropic, ChatGoogle

ChatBrowserUse('bu-fast')                          # also 'bu-ultrafast', 'bu-smart'
ChatOpenAI('<model>')                              # OPENAI_API_KEY; Responses API on api.openai.com
ChatOpenAI('<model>', base_url='http://localhost:11434/v1', api_key='ollama')   # any OpenAI-compatible server, e.g. Ollama
ChatAnthropic('<model>')                           # ANTHROPIC_API_KEY
ChatGoogle('<model>')                              # GOOGLE_API_KEY
Agent(task, llm='groq:<model>')                    # any Pydantic AI model string (the provider extra is installed separately)
```

Do not replace model names: users try models you do not know yet (upstream's own rule). LangChain chat models are not supported.

## Custom tools

```python
from browser_use import Agent, Tools, ActionResult

tools = Tools()

@tools.action('Look up the internal price of a product')
def get_price(sku: str) -> str:
    return prices[sku]

Agent(task, tools=tools)
```

Actions receive only the arguments the model passes (no injected browser or page). An action that raises returns the error to the model and the run continues.
Returning `ActionResult(is_done=True, ...)`, `attachments` or `images` is rejected: the model ends the run with `finish(result)`.

## Sensitive data

```python
Agent('Log in with my account', sensitive_data={'https://example.com': {'user': 'me@example.com', 'password': '...'}})
```

The model sees names only and types a value with `type_secret('password')` into a focused field on a matching site. A name ending in `bu_2fa_code` holds a TOTP seed. This is
redaction, not a sandbox ([`safety.md`](safety.md)). Never hard-code a real secret in the source or the task.

## Defaults that changed from 0.x

| | 0.x | 1.0 |
|---|---|---|
| `llm=None` | required | `bu-fast` on the Browser Use gateway |
| `Browser()` | local Chromium | Browser Use Cloud browser; `Browser('chromium')` is the local one |
| Keys | one per provider | one Browser Use key (`browser-use login` or `BROWSER_USE_API_KEY`) for the default model, cloud browsers, the CLI and MCP |
| `run(max_steps=...)` | 500 | 100; one step is one model request; `timeout=1700` s added |
| Localhost and private IPs | worked | a cloud browser cannot reach them: use `Browser('chromium')` |
| Cloud proxy | the API's default | `us` (`cloud_proxy_country_code=None` turns it off); live view off |

## Removed in 1.0 (each raises a named error before a browser starts; tuning knobs warn and are ignored)

- Imports: `BrowserSession`, `BrowserProfile`, 0.1-era `Controller(...)` options, `browser_use.llm.*` provider modules, `browser_use.browser.session` and `.profile`, `CodeAgent`,
  `browser_use.dom`, `browser_use.actor`, `browser_use.filesystem`, `browser_use.skill_cli`, `browser_use.mcp.client` / `.server`, `browser_use.observability`.
  Import from the top level: `from browser_use import Agent, Browser, Tools, ActionResult, ChatBrowserUse, ChatOpenAI, ChatAnthropic, ChatGoogle`.
- `Agent` arguments: `max_steps` (pass it to `run`), `browser_profile`, `planner_llm`, `use_judge` (ignored), `judge_llm`, `fallback_llm`, `file_system_path`,
  `available_file_paths`, `initial_actions`, `page_extraction_llm`, step callbacks. `Agent` methods: `pause`, `resume`, `stop`, `step`, history replay (`save_history`, `rerun_history`).
- `Browser` options: window and identity (`window_size`, `viewport`, `user_agent`, `locale`, ...), launch tuning (`channel`, `args`, `chromium_sandbox`, `devtools`),
  `storage_state`, `proxy`, recording (`record_video_dir`, `record_har_path`, `traces_dir`), downloads settings, and the 0.x engine tuning knobs.
  `BROWSER_USE_ALLOWED_DOMAINS` is not read; use `Browser(allowed_domains=[...])`.
- Providers: `ChatAzureOpenAI`, `ChatAWSBedrock`, `ChatDeepSeek`, `ChatGroq`, `ChatOllama` and the rest become model strings (`llm='azure:<deployment>'`,
  `'bedrock:<id>'`, `'groq:<model>'`) or `ChatOpenAI(model, base_url=...)`; each import error names its replacement.
- `browser-use --mcp` tools (`browser_navigate`, `browser_click`, ...) become `browser_exec` and `browser_screenshot` on `--cli-mcp`.
- Result methods: `history`, `urls()`, `screenshots()`, `action_history()`, `model_thoughts()`, `save_to_file()` and the like raise `AttributeError`; read
  `result.messages`, `status`, `partial` and `agent.workspace`.

Migrate in this order: pin the new version, change only imports and constructor options that raise, run one small task with a scripted or low-cost model,
then read `result.messages` for what the agent actually did. `pip install 'browser-use<1'` keeps 0.x when a feature has no 1.0 answer.

## Tests for code that uses browser-use

Use a real headless Chrome and a scripted model (Pydantic AI `FunctionModel`), never a paid API or a cloud browser; mock the Cloud HTTP calls and write one regression
test per bug that fails before the fix (upstream's own rules in `AGENTS.md`). Upstream's suite: `uv sync --all-extras`, `uv run pytest tests/ci`, then
`ruff` and `pyright`; code style there is `uv`, tabs and modern typing.

## Browser Use Cloud (hosted, billed, not open source)

- Two products: **cloud browsers** (managed Chromium over CDP for Playwright, Puppeteer or any CDP client; Selenium cannot connect to a remote WebSocket CDP URL) and
  the **Agents API** (a task goes in, a hosted agent runs in a cloud browser and a result comes back).
- REST base `https://api.browser-use.com/api/v4`, header `X-Browser-Use-API-Key`, key from https://cloud.browser-use.com. SDK: `browser-use-sdk` on PyPI and npm
  (`from browser_use_sdk.v4 import BrowserUse`; `client.runs.create(task, max_cost_usd=...)`, `client.runs.wait_for_completion(id)`,
  `client.browsers.create(...)`, `client.browsers.stop(id)`); v4 `browsers.create` / `stop` need SDK 3.11.3 or newer. V2 and V3 remain for existing integrations.
  The SDK is a different API from the open-source library.
- A polling timeout does not cancel a remote run (`client.runs.cancel`); only `completed` means success; do not blindly retry an ambiguous create.
- CDP WebSocket: `wss://connect.browser-use.com?apiKey=KEY&proxyCountryCode=us` embeds the key in the URL: keep it out of logs and chat.
- Profiles keep cookies and local storage across browsers; recording is off by default (`enable_recording=True`); concurrency is a shared project limit that rises with
  lifetime payments. Facts are a snapshot at the pin: read the docs index (https://docs.browser-use.com/llms.txt) and pricing before relying on a number.
- The hosted MCP endpoint (`https://api.browser-use.com/v3/mcp`, header `x-browser-use-api-key`) runs API v3 agent sessions. Registering it puts the key in a host config: tier 4.
