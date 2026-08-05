---
name: soup
description: >
  Drive Soup (`soup-cli`), a CLI-first tool for fine-tuning and post-training
  LLMs with one YAML config and one command — SFT, DPO/GRPO/ORPO/SimPO/KTO,
  QLoRA/DoRA/LoRA+, layer streaming for 4-8 GB GPUs, eval-gated training, and
  serving. Use when the user wants to `soup init`/`soup train` a model, pick a
  training method or quantization scheme, estimate cost/memory before
  training, fine-tune on a small local GPU, migrate a config from
  Axolotl/LLaMA-Factory/Unsloth, or serve/merge/push a trained adapter.
  Triggers on: "soup-cli", "soup train", "soup init", "fine-tune an LLM
  locally", "QLoRA on a laptop GPU", "layer streaming", "soup advise",
  "soup autopilot", "DPO/GRPO/ORPO training", "merge LoRA adapter".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Python 3.10+. `pip install soup-cli` for the light CLI; `pip install
  "soup-cli[train]"` adds torch/transformers/peft/trl for actual training.
  GPU (CUDA or Apple MLX) recommended for training; CPU-only works for
  init/advise/profile/cost/data commands. Apache-2.0.
metadata:
  tags: soup, soup-cli, llm-fine-tuning, post-training, sft, dpo, grpo, orpo, qlora, lora, layer-streaming, peft, trl, python
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: https://github.com/MakazhanAlpamys/Soup
---

# Soup — one-command LLM fine-tuning

Soup turns fine-tuning into `soup init` → `soup train` with a single YAML
config: task selection, quantization, batch size, and GPU/backend detection
are all handled for you. Its headline feature, **layer streaming**
(`stream_layers: true`), keeps the frozen base model out of VRAM and streams
it one decoder layer at a time, so an 8B model can fine-tune on a 4 GB laptop
GPU — measured bit-exact against a normal resident run.

## When to use this skill

- Standing up a new fine-tuning run (`soup init`, `soup train`) instead of
  hand-rolling a Transformers/PEFT/TRL training script
- Choosing a training method (SFT vs DPO/GRPO/ORPO/SimPO/KTO/IPO/BCO) or a
  memory-saving scheme (QLoRA, DoRA, LoRA+, rsLoRA, layer streaming) for a
  constrained GPU
- Estimating training cost/memory (`soup cost`, `soup profile`) before
  spending GPU hours, or getting a pre-flight method recommendation
  (`soup advise`)
- Migrating an existing Axolotl / LLaMA-Factory / Unsloth config into Soup
- Serving, merging, or pushing a trained adapter (`soup serve`, `soup merge`,
  `soup push`), or running the data-quality/eval tooling (`soup data ...`,
  `soup ship`)

## When not to use this skill

- Training infrastructure at the Ray/DeepSpeed-cluster/multi-node scale as
  the primary concern → use `deepspeed` or `openrlhf-training` directly;
  Soup wraps DeepSpeed/FSDP as launch flags, not a replacement for them
- Pure inference serving of an already-merged model with no training
  involved → a plain inference-runtime skill is a better fit
- The user is not touching Soup/PEFT/TRL at all (e.g. prompt engineering
  only) → route to `soup advise`'s own verdict (it may say `PROMPT_ENG`, not
  training) rather than jumping straight into `soup train`

## Instructions

### Step 1: Install the right profile

bash
pip install soup-cli            # light CLI only: init/advise/data/profile/cost
pip install "soup-cli[train]"   # + torch/transformers/peft/trl for real training


### Step 2: Decide the method before spending GPU hours

bash
soup advise <data.jsonl> --goal "..."     # PROMPT_ENG / RAG / SFT / DPO / GRPO verdict
soup autopilot --model <id> --data d.jsonl --goal "<g>"   # zero-config: picks task/quant/LR/epochs


Do not default straight to `soup train`; `advise`/`autopilot` exist because
the wrong method (e.g. SFT when the data is a preference pair) wastes a full
run.

### Step 3: Scaffold and edit the config

bash
soup init --template chat            # or code/audio/... — see docs/models.md
soup fetch <name>                    # pull a ready-made example config


For memory-constrained hardware, opt into layer streaming explicitly:

yaml
training:
  stream_layers: true      # base streams out of VRAM; only the adapter trains
  quantization: 4bit       # NF4
  batch_size: 4
  stream_source: auto      # RAM when it fits, NVMe disk otherwise


Layer streaming is BETA and supports SFT plus DPO/ORPO/SimPO/KTO — not
GRPO/PPO (those re-read every layer per generated token, which defeats
streaming's amortisation).

### Step 4: Estimate before you commit a GPU

bash
soup profile --config soup.yaml --gpu a100
soup cost --config soup.yaml --gpu H100


### Step 5: Train, then verify before shipping

bash
soup train --config soup.yaml
soup train --config soup.yaml --gate evals/gate.yaml   # eval-gated
soup ship --config soup.yaml                            # go/no-go verdict


### Step 6: Serve, merge, or push the result

bash
soup infer --model ./output --input p.jsonl
soup chat --model ./output
soup merge --adapter ./output
soup push --model ./output --repo user/name
soup serve --model ./output


### Step 7: Use the wrapper for a read-only environment check

bash
bash .agent-skills/soup/scripts/soup.sh doctor
bash .agent-skills/soup/scripts/soup.sh advise <data.jsonl> --goal "..."
bash .agent-skills/soup/scripts/soup.sh profile <config.yaml>


`doctor` only inspects the environment (Python version, `soup` install,
`[train]` extras, CUDA/MPS availability) — it never installs packages or
starts a training run.

## Best practices

1. **Run `soup advise`/`soup autopilot` before `soup train`** — picking the
   wrong task family (SFT vs a preference loss) is discovered only after a
   full training run otherwise.
2. **`soup cost`/`soup profile` before renting a GPU** — cheaper than
   discovering an OOM or a $40 surprise after the fact.
3. **Layer streaming is an opt-in trade, not a default** — it trades memory
   for extra layer-stack reads (DPO reads it ~1.52× as often as SFT); confirm
   the method is on the supported list (SFT/DPO/ORPO/SimPO/KTO) before
   enabling it.
4. **Gate before you ship** — prefer `--gate evals/gate.yaml` and `soup ship`
   over eyeballing loss curves.
5. **Heavy deps stay lazy** — don't suggest importing `torch`/`transformers`/
   `peft`/`trl` at module top in scripts driving Soup; the project itself
   lazy-imports them so the light CLI stays fast.
6. **Migrate configs, don't hand-port them** — `soup migrate --from
   axolotl|llamafactory|unsloth` exists precisely to avoid manual config
   translation errors.

## References

- [references/commands.md](references/commands.md) — curated command reference by workflow stage
- [scripts/soup.sh](scripts/soup.sh) — read-only doctor + thin `advise`/`profile`/`cost` wrappers
- [Soup GitHub Repository](https://github.com/MakazhanAlpamys/Soup)
- [Soup docs index](https://github.com/MakazhanAlpamys/Soup/blob/main/docs/README.md)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`

## Examples

### Example 1: Pick a method, then fine-tune on a 4 GB laptop GPU

bash
soup advise data.jsonl --goal "make the model follow a strict output schema"
soup init --template chat
# soup.yaml: set stream_layers: true, quantization: 4bit
soup profile --config soup.yaml
soup train --config soup.yaml


### Example 2: Environment check before recommending a training path

bash
bash .agent-skills/soup/scripts/soup.sh doctor

