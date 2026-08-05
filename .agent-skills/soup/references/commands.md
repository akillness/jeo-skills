# Soup command reference

Curated from [`docs/commands.md`](https://github.com/MakazhanAlpamys/Soup/blob/main/docs/commands.md)
in the upstream repo, grouped by workflow stage. Run `soup <command> --help`
for the authoritative, version-pinned flag list — Soup ships a large surface
(150+ subcommands) and this file intentionally covers the ones an agent is
most likely to need, not every flag.

## Setup and config

```
soup init [--template chat|code|...|audio]              Create config
soup init --template hipaa|soc2|eu-ai-act|sr-11-7        Compliance-shaped starting config
soup fetch <name>                                        Fetch a ready-to-edit example config
soup migrate --from llamafactory config.yaml              Import config from LLaMA-Factory
soup migrate --from axolotl config.yml                    Import config from Axolotl
soup migrate --from unsloth notebook.ipynb                Import config from Unsloth notebook
soup migrate --from llamafactory c.yaml --dry-run          Preview without writing
```

## Pre-flight: decide the method before spending GPU hours

```
soup advise <data> --goal "..."                           PROMPT_ENG / RAG / SFT / DPO / GRPO verdict
soup autopilot --model <id> --data d.jsonl --goal <g>      Zero-config: picks task/quant/LR/epochs
soup profile --config soup.yaml [--gpu a100] [--json]      Estimate memory/speed before training
soup cost --config soup.yaml [--gpu H100]                  Estimate training cost in USD across providers
```

## Training

```
soup train --config soup.yaml                              Start training
soup train --config soup.yaml --tensorboard                 TensorBoard logging
soup train --config soup.yaml --replay old.jsonl --replay-ratio 0.1   Continual-learning rehearsal (sft/pretrain)
soup train --config soup.yaml --fsdp full_shard              FSDP2
soup train --config soup.yaml --deepspeed zero++             DeepSpeed ZeRO++ (quantized comms)
soup train --config soup.yaml --gpus auto|N                  Multi-GPU launch hint
soup train --config soup.yaml --gate evals/gate.yaml          Eval-gated training
soup train --config soup.yaml --push-as user/repo             Auto-push each checkpoint to HF as a branch
soup train --config soup.yaml --push-as user/repo --hf-resume Resume from latest HF checkpoint branch
soup train --config soup.yaml --find-lr                       LR range finder: writes recommended LR JSON
soup train --config soup.yaml --cloud modal --gpu a100         Render a Modal.com app (plan-only; --cloud-submit submits live)
```

Supported task families: SFT, DPO, GRPO, PPO, KTO, ORPO, SimPO, IPO, BCO,
tool-calling, PRM, pre-training, distillation, classification, vision/audio/
TTS, unlearning, RAFT/RA-DIT. See `docs/training.md` upstream for per-task
details.

### Layer streaming (BETA)

```yaml
training:
  stream_layers: true      # base streams out of VRAM; only the adapter trains
  quantization: 4bit       # NF4
  batch_size: 4
  stream_source: auto      # RAM when it fits, NVMe disk when it does not
```

Supported for SFT, DPO, ORPO, SimPO, KTO. Not GRPO/PPO — generation re-reads
every layer per token, which defeats the amortisation streaming relies on.

## Inference, serving, export

```
soup infer --model ./output --input p.jsonl                 Batch inference
soup infer --task asr --model <whisper|adapter> --input a.jsonl --output o.jsonl [--audio-dir d --asr-language en]  Whisper transcription + WER/CER
soup chat --model ./output                                  Interactive chat
soup serve --model m --adapters chat=./c code=./d            Multi-adapter serving
soup serve --model <m> --structured-output regex --regex-pattern '...'  Regex-constrained output
soup serve --model <m> --dashboard                            Live dashboard + /metrics endpoint
soup serve --model <m> --steer <name> [--steer-strength <s>]  Apply a steering vector at decode time
soup serve --bank <bank.json> [--bank-strength <s>]            Multi-tenant VeRA/VB-LoRA serving
soup serve --mole <dir>                                        Serve a trained MoLE (transformers-only)
soup push --model ./output --repo user/name                   Upload to HuggingFace
soup push --model ./output --repo user/name --collection user/coll-abc123  Add to HF Collection
soup merge --adapter ./output                                 Merge LoRA with base model
soup merge-sharded-fsdp-weights ./shards -o merged.safetensors  Consolidate FSDP shards
```

## Data engineering

```
soup data inspect <path>                                     View dataset stats
soup data validate <path>                                    Check format (auto-detect)
soup data doctor <path> --model <id>                          Chat-template compat report (8 checks)
soup data doctor <path> --model <id> --show-mask N            Per-token trained/masked colouring
soup data lint <path>                                          Preference-data linter
soup data convert <path> --to chatml                           Convert between formats
soup data merge data1.jsonl data2.jsonl                        Combine datasets
soup data dedup <path> --threshold 0.8                          Remove duplicates (MinHash)
soup data dedup <path> --semantic                               Dedup by embedding cosine ([train])
soup data topics <path> [--clusters N|auto]                      Cluster + c-TF-IDF labels ([train])
soup data canary insert <path> -o <out> --manifest <m>           Insert secrets to later prove memorization
soup data canary check --manifest <m> --base <model>               Rank secret loss vs controls; exit 2 = leak
soup data stats <path>                                          Extended statistics
soup data generate --prompt "..." --count 100                    Generate synthetic data (--provider ollama|anthropic|vllm)
soup data active-sample --input <jsonl> --output <jsonl> --budget N  Top-N uncertain prod traces for review
```

## Evaluation and shipping

```
soup ship --config soup.yaml                                    Go/no-go verdict before release
soup diff --model-a ./a --model-b ./b                             Compare two models
soup ab --input <jsonl> --metric latency|judge_score|retry_rate     mSPRT sequential A/B test
soup drift-alarm --reference <jsonl> --live <jsonl> --threshold 0.2  Rolling-KL drift alarm (exit 3 on drift)
```

## Adapters, registry, and the data flywheel

```
soup adapters list ./output/                                   Scan for LoRA adapters
soup adapters info ./output/checkpoint-500/                       Show adapter metadata
soup adapters compare adapter1/ adapter2/                          Compare two adapters
soup loop init <model> --eval <s> --baseline <b> [--pre-wired]     Create .soup/loop.yaml (data flywheel)
soup loop status                                                 Counters + status + pre_wired flag
soup loop watch [--detach] [--max-iter N] [--pre-wired] [--pack-cans]  Harvest → train → gate → deploy daemon
soup loop pause / soup loop resume                                Atomic status flip
soup loop canary <adapter> --traffic 5%                             Promote canary + auto-rollback on MAJOR
soup loop replay [<iter-id>] [--extract <dir>]                       Replay/unpack a recorded iteration manifest
```

## Tracing and ops

```
soup ingest --source langfuse|langsmith|helicone|openpipe|otel|openai-stored --logs <jsonl>  Universal trace importer
soup prune-prompt --input <jsonl> --output <jsonl> --min-frequency 0.95  Strip shared system-prompt prefix
soup sweep --config soup.yaml --param lr=...                     Hyperparameter search
```

## Reward verifier synthesis

```
soup reward synth references.jsonl -o reward.py --output-report calib.json
```

Infers a deterministic reward verifier from a JSONL of reference outputs;
refuses to emit one that cannot distinguish references from bad answers
(families: `numeric` / `json_schema` / `regex` / `tool_call`).

## Local dev / CI (upstream repo itself, not the CLI)

```
pip install -e ".[dev]"
pytest tests/ -v --tb=short      # smoke tests (model download + train) excluded by default
pytest -m smoke                  # opt-in slow tests
ruff check src/soup_cli/ tests/  # must be clean before any commit
```
