# Flide operation reference

Source checked against [OmniJev/Flide](https://github.com/OmniJev/Flide/tree/8de99efe651d6189763473f083bd88a42542e2c2), version 0.1.15. Recheck upstream before use: models, dependencies and flags may change. This is a decision-inference service, not a general chat-completions replacement.

## Requirements and setup

Upstream specifies Python >=3.10, PyTorch >=2.12,<2.15 and NVIDIA GPU on Linux or Windows WSL2. The README uses Python 3.12 and installs `flide torchvision`; requirements and compatible GPU memory depend on the model. Linux detection alone does not establish WSL2 or CUDA capability. Inspect the target host and model license/access/VRAM first. No network, package changes, weight downloads or GPU use happen in the bundled preflight.

After explicit approval, in an appropriate working directory and isolated environment:

```bash
uv venv -p 3.12
source .venv/bin/activate
uv pip install 'flide==0.1.15' torchvision
flide --help
flide serve --help
flide verify --help
```

These installation commands access package indexes and change the environment. Upstream's unpinned quick start may install a later version; the pin here matches the inspected source, not a compatibility guarantee. `uv` itself must already exist or be installed separately with approval.

## Serve and request

After separately authorizing weight download, GPU usage and a local listener:

```bash
flide serve --model OmniJev/OneJev1.6-0.8B --host 127.0.0.1 --port 8000
```

The model identifier can cause a Hugging Face download; gated models may require access approval and credentials. The source defaults to `0.0.0.0:8000`; override the host as above. Loopback limits network exposure but does not authenticate other local users. Do not treat the service as secure for untrusted clients; use explicit security controls before exposing it. Do not set `--allow-media-urls` for untrusted requests: upstream warns the server can reach any address it can access. `--media-root` permits requests to refer to local media; scope access carefully. Session caching uses GPU memory; FP8 quantization changes numbers.

With a running authorized endpoint, use synthetic or otherwise approved content:

```bash
curl --fail-with-body http://127.0.0.1:8000/v1/systemone \
  -H 'Content-Type: application/json' \
  -d '{"state":"The customer received a damaged item.","questions":{"action":{"type":"choice","instructions":"What should support do next?","criteria":{"refund":"refund the order","replace":"send a replacement","escalate":"ask a human"}},"urgent":{"type":"noul","instructions":"Does this need a reply within the hour?"}}}'
```

Inspect status and returned answers; a server starting or `/health` succeeding does not prove inference correctness. For exact-forking comparison use `flide verify --help` and the installed version's documented model/request options, after permission to load weights and use GPU. Fork equivalence is not a guarantee that the model's decisions are correct. No claim of measured speedup applies without a comparable local benchmark.
