# Installing Heretic

Two layers: (1) this **routing skill** as a jeo-skills plugin, and (2) the **Heretic tool** itself in a
Python environment. `scripts/install.sh` handles layer 2.

## Prerequisites

- **Python 3.10+**.
- **PyTorch 2.2+** installed appropriately for your hardware (CUDA build strongly recommended). Some
  models need newer torch: **MXFP4-quantized models (e.g. gpt-oss)** use `torch.accelerator`, added in
  **PyTorch 2.6**. Install torch *before* Heretic so it matches your CUDA/ROCm/CPU setup.
- A **CUDA GPU** with enough VRAM. Use `quantization = "bnb_4bit"` (bitsandbytes) to fit larger models.
- Optional **[uv](https://docs.astral.sh/uv/)** for reproducible, pinned dependencies.

## Skill (plugin) install

```sh
npx skills add https://github.com/akillness/jeo-skills --skill heretic
```


## Tool install — `scripts/install.sh`

```sh
bash scripts/install.sh            # pip install -U heretic-llm  (into the active Python env)
RESEARCH=1 bash scripts/install.sh # also install the [research] extra (PaCMAP / matplotlib / plots)
UV=1 bash scripts/install.sh       # clone the repo and `uv sync` for uv.lock-pinned deps
UV=1 REF=v1.2.3 bash scripts/install.sh  # pin a specific upstream tag/branch when cloning
CHECK=1 bash scripts/install.sh    # just verify `heretic --help` runs; install nothing
```


### Env knobs

| Var | Default | Effect |
| :--- | :--- | :--- |
| `RESEARCH` | `0` | `1` → install `heretic-llm[research]` (interpretability extras) |
| `UV` | `0` | `1` → clone repo + `uv sync` (pinned via `uv.lock`) instead of `pip install` |
| `REF` | `main` | upstream git ref to clone when `UV=1` |
| `PIP` | `pip` | pip executable (e.g. `pip3`, or a venv's pip) |
| `UPSTREAM_URL` | `https://github.com/p-e-w/heretic` | source repo |
| `CHECK` | `0` | `1` → only run `heretic --help` to verify an existing install |

The script does **not** install PyTorch (that is hardware-specific and must match your accelerator) — it
verifies torch ≥ 2.2 is importable and warns if it is missing or too old.

## Manual equivalents

```sh
# pip (simplest)
pip install -U heretic-llm
pip install -U 'heretic-llm[research]'   # with interpretability extras
```

# uv (reproducible — pins every dependency via uv.lock)
git clone https://github.com/p-e-w/heretic && cd heretic
uv run heretic Qwen/Qwen3-4B-Instruct-2507


## First run

```sh
heretic Qwen/Qwen3-4B-Instruct-2507      # replace with a model you may modify
heretic --help                           # all flags
```


## Responsible use & license

Heretic is **AGPL-3.0-or-later** (© 2025-2026 Philipp Emanuel Weidmann + contributors). If you serve a
modified model over a network, AGPL obligations may apply to your service. Only modify models you have
the right to modify, honour each base model's license and every platform's Terms of Service, and do not
use abliteration to produce a model for genuinely illegal/harmful content or to evade controls you are
bound by. Cite Heretic in research (BibTeX in the upstream README).
