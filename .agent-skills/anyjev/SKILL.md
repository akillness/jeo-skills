---
name: anyjev
description: >
  Operate nokia-applied-research/AnyJev, the Apache-2.0 Python library that turns
  open causal LLMs into typed choice, yes/no, and score decisions with next-token
  probabilities. Use when pinning or installing AnyJev, selecting its training-free
  Decider (raw/L0), running Tacit self-distilled checkpoints, configuring the
  transformers/vLLM/SGLang/llama.cpp backends, or exposing the local HTTP gateway.
  Triggers on AnyJev, Tacit, L0 readout, permutation debiasing, llama.cpp logprob
  backend, SGLang /generate scoring, or a request to compare AnyJev with TypeSafe
  AI/Jev without changing the existing TypeSafe skill or Jev harness.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Python >=3.10. Model weights and datasets are opt-in downloads. HF/transformers,
  vLLM, SGLang, and llama.cpp have separate runtime and hardware requirements;
  remote servers and model providers may require credentials or incur compute cost.
  This skill is for the pinned AnyJev repository, not hosted TypeSafe AI services.
license: Apache-2.0
metadata:
  version: "1.0"
  source: https://github.com/nokia-applied-research/AnyJev
  upstream_commit: d458d13968eec0e2cfa8c81b64629b96cf5cb4a9
---

# AnyJev operator

Audited against upstream commit `d458d13968eec0e2cfa8c81b64629b96cf5cb4a9`
(2026-10-07, package version `0.3.0`). Re-read the pinned sources before relying on
newer `main`; the API has breaking changes between 0.2.0 and 0.3.0.

## When to use this skill

- Pin, inspect, install, or smoke-test an AnyJev checkout.
- Use `Decider` with an open causal model, or compare `raw` with label-free `L0`.
- Run a prebuilt Tacit checkpoint with transformers, in-process vLLM, or a vLLM server.
- Configure the native SGLang or GGUF/llama.cpp log-probability backend.
- Run the standard-library `python -m anyjev.serve` gateway and verify its API.
- Reproduce a bounded research/evaluation readout while keeping model and dataset downloads explicit.

Use the external [TypeSafe AI documentation](https://docs.typesafe.ai/llms.txt) or a
caller-provided TypeSafe integration for hosted TypeSafe System One/Jev APIs,
TypeSafe credentials/billing, or TypeSafe cookbook design. This checkout's manifest
has no `typesafe-ai` entry; AnyJev is an independent, self-hosted open-model readout
library and is explicitly not affiliated with TypeSafe AI or Jev. Do not use this
skill to modify a separate TypeSafe integration or Jev harness.

## Instructions

### 1. Pin the repository and choose one mode

Treat the checkout, not this document, as the live source of truth after the pin:

```bash
git clone https://github.com/nokia-applied-research/AnyJev.git
cd AnyJev
git checkout d458d13968eec0e2cfa8c81b64629b96cf5cb4a9
```

Source: [README.md at the pin](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/README.md),
[pyproject.toml](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/pyproject.toml).

Choose exactly one mode before making changes:

| Mode | First action | Completion evidence |
| --- | --- | --- |
| `inspect` | Read `pyproject.toml`, `README.md`, `docs/levels.md`, and `docs/limitations.md`. | Python/extras/backend constraints recorded; no weights downloaded. |
| `decider` | Install only the selected backend extra; construct `Question` and `Decider`. | A `Decision` has `distribution` and an explicit `level`. |
| `tacit` | Select a published Tacit repo and engine; approve the weight download or server use. | Output has `answer`, `probs`, `margin`, and `route`. |
| `gateway` | Start/identify a local vLLM server, then run `python -m anyjev.serve`. | `/health`, `/v1/stats`, and one `/v1/decide` response checked. |
| `research` | Freeze model, question layout, dataset/license, and readout settings first. | Results state model/backend/commit and do not generalize beyond the measured setup. |

### 2. Install the smallest approved dependency set

The package requires Python >=3.10 and `numpy>=1.24`. Install one optional path;
these commands come from the pinned project metadata and README:

```bash
python -m pip install "anyjev[hf]==0.3.0"       # torch>=2.3, transformers>=4.53
python -m pip install "anyjev==0.3.0"             # base package, NumPy only
python -m pip install "anyjev[vllm]==0.3.0"      # vllm>=0.17.1
python -m pip install "anyjev[client]==0.3.0"    # tokenizer client for engine="server"
python -m pip install "anyjev[llamacpp]==0.3.0"  # llama-cpp-python>=0.3.16
python -m pip install "anyjev[eval]==0.3.0"      # datasets + transformers; downloads data
```
Source: [`pyproject.toml`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/pyproject.toml) and the pinned README install examples.
The audited metadata gives lower bounds rather than a fully locked environment; capture
resolved backend/runtime versions or use a constraints/lock file for reproducible research.

For a pinned source checkout, use `python -m pip install -e ".[hf]"` (or the chosen
extra) rather than installing an unpinned `main`. Do not install all extras by habit:
`vllm`, torch, and GGUF wheels can be large; evaluation can download datasets. The
pinned README/pyproject document inference and evaluation, not a Tacit-training CLI;
treat Tacit training as out of scope unless upstream adds and documents it.

### 3. Use the training-free `Decider` contract

`Question.choice` requires 2–26 unique options; `Question.noul` is Yes/No; and
`Question.score` accepts 2–10 ordered bins/levels. A backend must expose a tokenizer
with single-token labels and `next_token_logprobs(prompts, token_ids)`. It must return
full-vocabulary next-token log-probabilities for the requested ids; it never samples.

```python
from anyjev import Decider, Question
from anyjev.backends.hf import HFBackend

backend = HFBackend("Qwen/Qwen3-8B", device="cpu")  # use cuda on a CUDA host; download is explicit
question = Question.choice("Which team should handle this?",
                           ["billing", "technical", "sales", "other"], name="route")
result = Decider(backend, level="L0").decide(
    "My card was charged twice for one order.", [question])["route"]
print(result.distribution, result.level)
```
Source: [`question.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/question.py), [`readout.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/readout.py), and [`decider.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/decider.py).

`raw` reads one ordering and retains position/label-prior effects. `L0` reads each
choice in K cyclic rotations, combines the rotations, and applies label-free prior
correction (batch prior by default, strength 0.75). A skewed batch can make that prior
hurt accuracy; use `prior="content_free"` or `prior="none"` deliberately. Enforce the
contract with `decide(..., require="L0")` or `Decision.require("L0")`.

`adaptive_shifts=True` is an opt-in rotation budget. Pair it with
`canonical_order=True`, and call `calibrate_adaptive(question, unlabelled_states,
target=0.01)` before production use. Its certificate is agreement with AnyJev's full-K
answer, not external accuracy; the published evidence covers K=18–20 on two 7–8B
Qwen cells, so calibrate outside that regime.

### 4. Run Tacit only with an approved checkpoint and engine

```python
from anyjev import Tacit

tacit = Tacit.from_pretrained("morriszjm/Tacit-9B", adaptive=True,
                              tau=0.5, max_cot_share=0.2, cot_window=1000)
out = tacit.decide(state="Customer: my package has not arrived.",
                   question="What does the customer want?",
                   options=["track_order", "refund"])
print(out["answer"], out["probs"], out["route"])
```
Source: [`tacit.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/tacit.py) and [`docs/levels.md`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/docs/levels.md).

`engine="transformers"` is the default; `engine="vllm"` runs in-process;
`engine="server"` loads only the tokenizer and calls a running vLLM server. `adaptive`
escalates low-margin decisions to the model's own reasoning, capped by
`max_cot_share` over `cot_window`; a `cot` route costs reasoning tokens and can take
seconds. Tacit's one-forward path keeps option order and is not L0-averaged. Do not
present the published Tacit accuracy as a universal guarantee.

Version-specific constraints from the pinned limitations: Tacit-9B and Tacit-2B
(Qwen3.5) need transformers >=5; Hopper vLLM serving may compile with `nvcc`, while
in-process vLLM can fall back to Triton. vLLM Tacit reads labels from the top 20
log-probabilities, so a label outside that set is treated as zero. On Apple Silicon,
validate the chosen torch device independently; the source fixes a `device_map` loading
path but does not certify MPS performance.

### 5. Configure remote backends and the local gateway deliberately

For raw/L0 through vLLM, start the server with processed log-probabilities so restricted
labels are returned rather than only the server's top tokens:

```bash
vllm serve Qwen/Qwen3-8B --enable-prefix-caching --logprobs-mode processed_logprobs
```
Source: [`anyjev/backends/vllm.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/backends/vllm.py).

Then use `VLLMBackend("http://127.0.0.1:8000", "Qwen/Qwen3-8B")`. SGLang uses its
native `/generate` endpoint (`max_new_tokens=0`, `return_logprob=true`,
`token_ids_logprob`) and requires a running server, for example:

```bash
python -m sglang.launch_server --model-path Qwen/Qwen3-8B --port 30000
```
Source: [`anyjev/backends/sglang.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/backends/sglang.py).
Both HTTP backends need a loadable tokenizer; pass `tokenizer_name=` when the server's
served model alias is not itself a tokenizer source.

`LlamaCppBackend("model.gguf")` uses the GGUF vocabulary/chat template by default and
requires token-for-token agreement when an optional Hugging Face tokenizer is supplied;
`TokenMismatchError` is the safe failure. Its default `n_gpu_layers=0` is CPU-oriented.
Source: [`anyjev/backends/llamacpp.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/backends/llamacpp.py).

The gateway is local-only by default and has no authentication of its own:

```bash
python -m anyjev.serve --model morriszjm/Tacit-9B \
  --upstream http://127.0.0.1:8000 --adaptive --port 8100
curl -s 127.0.0.1:8100/health
curl -s 127.0.0.1:8100/v1/stats
curl -s 127.0.0.1:8100/v1/decide -H 'Content-Type: application/json' \
  -d '{"state":"Package is late.","question":"What does the customer want?","options":["track_order","refund"]}'
```
Source: [`anyjev/serve.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/serve.py) and [`tacit.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/tacit.py).

The gateway serves `GET /health`, `GET /v1/stats`, and `POST /v1/decide` (one item or
`{"items": [...]}`); malformed input returns 400 and upstream failures return 502.
Bind a non-loopback host only after adding an external authentication and network policy.
Server credentials are opt-in: AnyJev's server engine reads `TACIT_API_KEY` or
`OPENAI_API_KEY` when configured; never print or commit key values.

### 6. Verify and report honestly

A no-download API smoke test can use the pinned synthetic backend (it is a test fixture,
not a quality signal):

```bash
python -c 'from anyjev import Decider,Question; from anyjev.backends.fake import FakeBackend; b=FakeBackend(lambda s,o: float(o=="yes")); q=Question.choice("Pick",["yes","no"]); d=Decider(b,level="L0").decide("x",[q])[0]; print(d.level,d.distribution)'
```
Source: [`anyjev/backends/fake.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/backends/fake.py).

For a real model, record the exact AnyJev commit, model revision, backend/engine,
tokenizer, dtype/device, question layout, prior settings, adaptive settings, and dataset
license. Published limitations include model-bounded accuracy, order-sensitive Tacit
one-forward reads, seconds-scale escalations, a 26-option letter limit, high variance
for the n=300 coverage estimate, and isolated decisions rather than agent-loop evidence.

## Examples

- **No-download contract check:** run the Step 6 `FakeBackend` command; it exercises the
  real prompt/readout path but says nothing about model quality.
- **Training-free model:** follow Step 3 with an approved causal-LM revision and inspect
  `Decision.distribution`, `level`, and diagnostics before acting.
- **Shared Tacit service:** follow Steps 4–5, keep the gateway loopback-bound, then prove
  `/health`, `/v1/stats`, and `/v1/decide` with the exact model/backend pin.

## Best practices

1. Keep model downloads, dataset downloads, GPU installs, remote-server calls, and
   provider credentials opt-in; local inference still consumes compute.
2. Prefer `Decider(level="L0")` when option-order bias matters, and require the level
   before an automated action; do not call L0 “calibrated accuracy” without target data.
3. Treat `answer_mass` and other diagnostics as evidence that the prompt landed; a
   low label mass is not confidence.
4. Keep Tacit's escalation cap enabled for shared services and inspect `route`/`stats`.
5. Preserve Apache-2.0 notices. Tacit base models are stated as Apache-2.0, while
   benchmark datasets retain their own licenses (one listed dataset has unknown license).

## References

- [Pinned README](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/README.md)
- [Pinned `pyproject.toml`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/pyproject.toml)
- [`Decider` and rotation budget](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/decider.py)
- [Question/readout contracts](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/question.py)
- [Backend protocol](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/backends/base.py)
- [HF, vLLM, SGLang, and llama.cpp backends](https://github.com/nokia-applied-research/AnyJev/tree/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/backends)
- [Tacit API and engines](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/tacit.py)
- [Levels and route promises](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/docs/levels.md)
- [Rotation-budget evidence](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/docs/rotation_budget.md)
- [Limitations](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/docs/limitations.md)
- [Apache-2.0 license](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/LICENSE)
- [Third-party data/code notices](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/THIRD_PARTY.md)
