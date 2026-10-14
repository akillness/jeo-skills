# AnyJev pinned reference

This reference preserves the audited operational details for
`nokia-applied-research/AnyJev` at commit
`d458d13968eec0e2cfa8c81b64629b96cf5cb4a9` (audited 2026-10-07, package
version `0.3.0`). Treat the pinned checkout as the source of truth after
verification. Do not infer newer `main` behavior from this document.

## Pin and inspect

```bash
git clone https://github.com/nokia-applied-research/AnyJev.git
cd AnyJev
git checkout d458d13968eec0e2cfa8c81b64629b96cf5cb4a9
```

For `inspect`, read `pyproject.toml`, `README.md`, `docs/levels.md`, and
`docs/limitations.md`; record Python, extras, and backend constraints without
downloading weights. The package requires Python `>=3.10` and `numpy>=1.24`.
The pinned metadata gives lower bounds, not a fully locked environment. Record
resolved versions or use a constraints/lock file for reproducible research.

Source: [README.md at the pin](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9),
[pyproject.toml](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9).

## Install boundaries and modes

Choose one mode before changing the environment:

| Mode | First action | Completion evidence |
| --- | --- | --- |
| `inspect` | Read pinned metadata and limitations. | Constraints recorded; no weights downloaded. |
| `decider` | Install only the selected backend extra; construct `Question` and `Decider`. | A `Decision` has `distribution` and an explicit `level`. |
| `tacit` | Select a published Tacit repo and engine; approve weight download or server use. | Output has `answer`, `probs`, `margin`, and `route`. |
| `backend` | Select one HF, vLLM, SGLang, or GGUF/llama.cpp path and its tokenizer. | Backend returns requested next-token log-probabilities. |
| `gateway` | Identify a local vLLM server, then run `python -m anyjev.serve`. | `/health`, `/v1/stats`, and one `/v1/decide` response checked. |
| `research` | Freeze model, question layout, dataset/license, and readout settings. | Results name model/backend/commit and stay within the measured setup. |

Install only one approved path; do not install every optional extra:

```bash
python -m pip install "anyjev[hf]==0.3.0"       # torch>=2.3, transformers>=4.53
python -m pip install "anyjev==0.3.0"             # base package, NumPy only
python -m pip install "anyjev[vllm]==0.3.0"      # vllm>=0.17.1
python -m pip install "anyjev[client]==0.3.0"    # tokenizer client for engine="server"
python -m pip install "anyjev[llamacpp]==0.3.0"  # llama-cpp-python>=0.3.16
python -m pip install "anyjev[eval]==0.3.0"      # datasets + transformers; downloads data
```

For a source checkout, use `python -m pip install -e ".[hf]"` (or the chosen
extra) only after the user approves installation. `vllm`, torch, and GGUF
wheels can be large; evaluation can download datasets. The pinned sources
document inference and evaluation, not a Tacit-training CLI.

## Training-free `Decider`, raw, and L0

`Question.choice` accepts 2–26 unique options, `Question.noul` is Yes/No, and
`Question.score` accepts 2–10 ordered bins/levels. A backend must expose a
single-token-label tokenizer and `next_token_logprobs(prompts, token_ids)`;
it returns full-vocabulary next-token log-probabilities for requested IDs and
never samples.

```python
from anyjev import Decider, Question
from anyjev.backends.hf import HFBackend

backend = HFBackend("Qwen/Qwen3-8B", device="cpu")  # model download is explicit
question = Question.choice(
    "Which team should handle this?",
    ["billing", "technical", "sales", "other"],
    name="route",
)
result = Decider(backend, level="L0").decide(
    "My card was charged twice for one order.", [question]
)["route"]
print(result.distribution, result.level)
```

Source: [`question.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/question.py),
[`readout.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/readout.py),
and [`decider.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/decider.py).

`raw` reads one option ordering and retains position/label-prior effects. `L0`
reads each choice in K cyclic rotations, combines rotations, and applies
label-free prior correction (batch prior by default, strength `0.75`). A skewed
batch can make that prior hurt accuracy; choose `prior="content_free"` or
`prior="none"` deliberately. Enforce the contract with
`decide(..., require="L0")` or `Decision.require("L0")`.

`adaptive_shifts=True` is an opt-in rotation budget. Pair it with
`canonical_order=True`, and call
`calibrate_adaptive(question, unlabelled_states, target=0.01)` before production
use. Its certificate is agreement with AnyJev's full-K answer, not external
accuracy. Published evidence covers K=18–20 on two 7–8B Qwen cells; calibrate
outside that regime.

## Tacit constraints

```python
from anyjev import Tacit

tacit = Tacit.from_pretrained(
    "morriszjm/Tacit-9B",
    adaptive=True,
    tau=0.5,
    max_cot_share=0.2,
    cot_window=1000,
)
out = tacit.decide(
    state="Customer: my package has not arrived.",
    question="What does the customer want?",
    options=["track_order", "refund"],
)
print(out["answer"], out["probs"], out["route"])
```

Source: [`tacit.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/tacit.py)
and [`docs/levels.md`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/docs/levels.md).

`engine="transformers"` is the default; `engine="vllm"` runs in-process; and
`engine="server"` loads only the tokenizer and calls a running vLLM server.
`adaptive` escalates low-margin decisions to the model's own reasoning, capped
by `max_cot_share` over `cot_window`; a `cot` route costs reasoning tokens and
can take seconds. Tacit's one-forward path keeps option order and is not
L0-averaged. Published Tacit accuracy is not a universal guarantee.

Pinned limitations: Tacit-9B and Tacit-2B (Qwen3.5) need transformers `>=5`;
Hopper vLLM serving may compile with `nvcc`, while in-process vLLM can fall
back to Triton. vLLM Tacit reads labels from the top 20 log-probabilities, so a
label outside that set is treated as zero. On Apple Silicon, validate the
chosen torch device independently; the source fixes a `device_map` loading path
but does not certify MPS performance.

## Backend and tokenizer boundaries

For raw/L0 through vLLM, serve processed log-probabilities so restricted labels
are returned rather than only the server's top tokens:

```bash
vllm serve Qwen/Qwen3-8B --enable-prefix-caching --logprobs-mode processed_logprobs
```

Source: [`anyjev/backends/vllm.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/backends/vllm.py).
Then use `VLLMBackend("http://127.0.0.1:8000", "Qwen/Qwen3-8B")`. SGLang uses
its native `/generate` endpoint (`max_new_tokens=0`, `return_logprob=true`,
`token_ids_logprob`) and requires a running server:

```bash
python -m sglang.launch_server --model-path Qwen/Qwen3-8B --port 30000
```

Source: [`anyjev/backends/sglang.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/backends/sglang.py).
Both HTTP backends need a loadable tokenizer; pass `tokenizer_name=` when the
served model alias is not itself a tokenizer source.

`LlamaCppBackend("model.gguf")` uses the GGUF vocabulary/chat template by
default. An optional Hugging Face tokenizer must agree token-for-token;
`TokenMismatchError` is the safe failure. Its default `n_gpu_layers=0` is
CPU-oriented. Arbitrary GGUF compatibility is not implied by AnyJev's custom
model format.

Source: [`anyjev/backends/llamacpp.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/backends/llamacpp.py).

## Local gateway and security boundary

The gateway is local-only by default and has no authentication of its own:

```bash
python -m anyjev.serve --model morriszjm/Tacit-9B \
  --upstream http://127.0.0.1:8000 --adaptive --port 8100
curl -s 127.0.0.1:8100/health
curl -s 127.0.0.1:8100/v1/stats
curl -s 127.0.0.1:8100/v1/decide -H 'Content-Type: application/json' \
  -d '{"state":"Package is late.","question":"What does the customer want?","options":["track_order","refund"]}'
```

Source: [`anyjev/serve.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/serve.py)
and [`tacit.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/tacit.py).

The gateway serves `GET /health`, `GET /v1/stats`, and `POST /v1/decide` (one
item or `{"items": [...]}`); malformed input returns 400 and upstream failures
return 502. Bind a non-loopback host only after adding external authentication
and network policy. Server credentials are opt-in: the server engine reads
`TACIT_API_KEY` or `OPENAI_API_KEY` when configured; never print or commit key
values.

## No-download verification and reporting

A no-download API smoke test may use the pinned synthetic backend. It is a test
fixture, not a quality signal:

```bash
python -c 'from anyjev import Decider,Question; from anyjev.backends.fake import FakeBackend; b=FakeBackend(lambda s,o: float(o=="yes")); q=Question.choice("Pick",["yes","no"]); d=Decider(b,level="L0").decide("x",[q])[0]; print(d.level,d.distribution)'
```

Source: [`anyjev/backends/fake.py`](https://github.com/nokia-applied-research/AnyJev/blob/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9/anyjev/backends/fake.py).

For a real model, record exact AnyJev commit, model revision, backend/engine,
tokenizer, dtype/device, question layout, prior settings, adaptive settings,
and dataset license. Published limitations include model-bounded accuracy,
order-sensitive Tacit one-forward reads, seconds-scale escalations, the
26-option letter limit, high variance for the n=300 coverage estimate, and
isolated decisions rather than agent-loop evidence.

## Pinned source index

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
