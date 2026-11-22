---
name: opencompass
description: >
  Evaluate large language models and multimodal foundation models across 100+ standard benchmarks (MMLU, GSM8K, MATH, HumanEval, BBH, ARC) using open-compass/opencompass. Configures datasets, models (HuggingFace, vLLM, LMDeploy, API endpoints), execution partitions, and generates comprehensive leaderboard score reports.
allowed-tools: Bash Read Write Edit Glob Grep
metadata:
  version: 1.0.0
  source: https://github.com/open-compass/opencompass
---

# opencompass

OpenCompass is a comprehensive, modular evaluation platform for large language models (LLMs) and multimodal foundation models developed by Shanghai AI Laboratory. It supports 100+ standard benchmarks spanning language understanding, reasoning, mathematics, code generation, instruction following, and agent capabilities.

## Core Capabilities

1. **Broad Benchmark Coverage**:
   - Reasoning & Math: GSM8K, MATH, ARC, DROP, BBH (Big-Bench Hard), GPQA
   - General Knowledge & Understanding: MMLU, MMLU-Pro, CMMLU, C-Eval, AGIEval
   - Code Generation: HumanEval, MBPP, EvalPlus, SWE-bench Lite
   - Instruction Following & Safety: IFEval, AlignBench, SafetyBench
2. **Multiple Model Backends**:
   - Local Hugging Face Transformers (`HuggingFaceCausalLM`, `HuggingFaceChat`)
   - High-throughput Inference Engines (`vLLM`, `LMDeploy`, `TGI`)
   - Cloud API Providers (OpenAI, Anthropic, Google Gemini, DeepSeek, Zhipu, Moonshot)
3. **Execution Modes**:
   - Single-node Multi-GPU (`accelerate`, `torchrun`, `slurm`)
   - Distributed Partitioned Tasks with resume and checkpointing
   - Objective Evaluation (Exact Match, ROUGE, BLEU) vs Subjective Evaluation (LLM-as-a-Judge)

## Workflow

### 1. Environment & Setup
```bash
pip install -e .
# Optional accelerated backends:
# pip install vllm lmdeploy
```

### 2. Dataset Discovery
Consult `dataset-index.yml` or use the CLI to inspect available evaluation suites:
```bash
python3 run.py --help
# View dataset index
cat dataset-index.yml | grep -E "name:|category:"
```

### 3. Running an Evaluation
Run an evaluation specifying models and datasets directly from presets:
```bash
# Evaluate an API model on MMLU and GSM8K
python3 run.py --models openai_gpt4o --datasets mmlu_gen gsm8k_gen

# Evaluate a Hugging Face model using vLLM on HumanEval
python3 run.py --models hf_llama3_8b --datasets humaneval_gen --eval-mode vllm
```

### 4. Custom Evaluation Configuration
Construct a Python configuration script under `configs/`:
```python
from mmengine.config import read_base

with read_base():
    from .datasets.mmlu.mmlu_gen import mmlu_datasets
    from .datasets.gsm8k.gsm8k_gen import gsm8k_datasets
    from .models.hf_llama.hf_llama3_8b_instruct import models

datasets = [*mmlu_datasets, *gsm8k_datasets]
```
Execute with:
```bash
python3 run.py configs/eval_custom.py --work-dir outputs/default
```

### 5. Inspecting Results & Generating Leaderboards
Results are output to `outputs/default/<timestamp>/`:
- `summary/summary_<timestamp>.csv`
- `summary/summary_<timestamp>.txt`

Use reporting tools under `tools/` for visual summaries:
```bash
python3 tools/summarize_results.py outputs/default/<timestamp>
```

## Best Practices & Boundaries
- When evaluating on restricted hardware, always use `vLLM` or `LMDeploy` backends for 3x-5x throughput improvement over standard PyTorch forward loops.
- Use `--reuse latest` to safely resume interrupted runs without recomputing already evaluated partitions.
- For subjective or open-ended reasoning benchmarks, configure judge models with fixed temperature (`temperature=0.0`) for deterministic grading.
