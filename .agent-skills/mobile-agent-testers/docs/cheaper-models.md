# Cheaper models

Each agent drives a phone by looking at screenshots and deciding what to do next, for about 30 actions. Two abilities of the model decide what a run is worth:

- **Reading images.** Every screenshot reaches the model as an image. A model that reads them poorly misses cut text, hidden buttons and untranslated labels, or reports ones that aren't there. A model with no image input gets a text placeholder instead of the screen: the agent is blind and the run is worthless.
- **Reasoning.** The agent has to plan, notice that a tap did nothing, try another way, and tell a bug in the app from a quirk of the emulator. A weaker model gives up sooner, repeats itself and reports more false positives.

So a cheaper model is a trade: more phones or more runs for the same money, and fewer, less reliable findings per phone. Open the screenshots before you file anything.

## 1. Claude Haiku: same setup, smaller bill

Run with `-f model=haiku`. Nothing else changes: same tools, same screenshots, same secrets (Claude subscription or API key).

At API list prices (November 2026), Claude Haiku costs $0.10 per million input tokens and $0.50 per million output tokens for requests up to 100K tokens, and $0.50 / $2.50 beyond, against $2 / $10 for Claude Sonnet, the default. An agent sends its history again with every action, so long sessions go past 100K tokens: expect 4 to 20 times less than Sonnet, depending on the length of the session. On a subscription, Haiku uses less of your plan's limits.

Good for many phones on an app you already know, a quick check before a release, or a second reproduction pass. Keep Sonnet or Opus for a first look at an app, for complex features and for anything you will file.

## 2. Any Anthropic-compatible API

Claude Code can talk to any API that speaks Anthropic's Messages format. Several providers offer one, often for less, and some are easier to pay for in China.

1. Create a key with the provider and add it as the `LLM_API_KEY` secret: `gh secret set LLM_API_KEY`.
2. Run with `-f llm_base_url=<base URL> -f model=<the provider's model name>`. Start with one persona:

```bash
gh workflow run agent-testers.yml -f llm_base_url=https://openrouter.ai/api -f model=<a model with image input> \
  -f android_personas=anna -f ios_personas=none
```

| Provider | `llm_base_url` | Image input |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api` | One key for hundreds of models (Gemini, Qwen, GLM, Kimi...): pick one that takes images |
| DeepSeek | `https://api.deepseek.com/anthropic` | Depends on the model: some replace images with a text placeholder |
| Moonshot (Kimi) | `https://api.moonshot.ai/anthropic` | Check the model you pick |
| Z.ai (GLM) | `https://api.z.ai/api/anthropic` | Check the model you pick |
| MiniMax | `https://api.minimax.io/anthropic` | Some models only |
| Alibaba Cloud (Qwen) | `https://dashscope-intl.aliyuncs.com/apps/anthropic` | Check the model you pick |

Model names, prices and image support change often, and mainland China has its own endpoints: check the provider's documentation before a run.

With `llm_base_url` set, [scripts/llm_env.sh](../scripts/llm_env.sh) sends every request of the agent to that URL with your key, uses your model for Claude Code's small background requests too, and leaves your Claude secrets out of that run. The key never appears in the logs.

Then open that persona's screenshots and report. Did it see the screen? Did it get past the onboarding? Are the findings real? Claude Code is built and tested with Claude models, and OpenRouter's own guide warns that other models may not work as well: one may stop early, loop, or fail a tool call. That is a limit of the model, not of your setup.

## 3. Spend less with any model

- Fewer phones: pick the devices that matter to you (`-f android_personas=anna,malik`).
- Shorter sessions: your brief can lower the budget of about 30 actions.
- The summary groups duplicates with your local `claude` CLI: `SUMMARY_MODEL=haiku bash scripts/collect.sh <run id>` makes that cheaper too, and `SUMMARY_GROUPING=0` skips it.
