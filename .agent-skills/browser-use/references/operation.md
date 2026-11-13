# Setup and operation

Source: [upstream README at reviewed commit](https://github.com/browser-use/browser-use/blob/dfb6a73d520809341c975c6a01c228327991e88b/README.md). Recheck official documentation and installed CLI help for changes. The commands below download or execute software and are not part of the offline preflight.

## CLI

After authorizing installation, upstream's example is `uv tool install browser-use==1.0.3`. The upstream `browser-use skill install` changes agent configuration; run it only if separately requested, and do not assume it installs this catalog skill. If needed, use `browser-use --doctor` after authorizing execution and reviewing its effects. Connecting a browser, visiting a website, and using a provider require appropriate authorization.

## Python

Upstream requires Python 3.11+ and recommends an exact package pin. In an approved isolated virtual environment, install `browser-use==1.0.3`. The minimal example uses the Browser Use Cloud browser and gateway by default:

```python
from browser_use import Agent
result = Agent('Find the number of stars of the browser-use repo').run_sync()
print(result.final_result())
```

This requires a Browser Use API key and creates paid network activity; it is not an offline smoke test. Upstream also documents explicitly selecting `Browser('chromium')` and `ChatOpenAI(...)` for a local browser with a chosen model provider. A local browser alone does not make inference local. Check provider settings, costs, network destination and data policy first.

## Boundaries

A login session or browser profile grants access to the account. Use a fresh profile where possible; ask before accessing an existing one. Do not bypass CAPTCHAs or access controls. Confirm purchases, submissions, destructive changes and other consequential actions before execution. Agent-generated Python and page content are untrusted; review output and do not treat an agent or a credential-redaction feature as a security sandbox. Do not expose CDP or other control endpoints publicly. Stop only processes started for the task.
