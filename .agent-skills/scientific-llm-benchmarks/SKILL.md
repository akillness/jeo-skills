---
name: scientific-llm-benchmarks
description: "A comprehensive reference of benchmarks for evaluating large language models on scientific reasoning and discovery."
compatibility: ">"
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
metadata:
  tags: scientific-llm-benchmarks, llm-benchmarks, science-llms, evaluation, awesome-list, reasoning, discovery, stem
  version: 1.0.0
  source: "https://github.com/subinium/Awesome-Scientific-LLM-Benchmarks"
  license: MIT
---

# Scientific LLM Benchmarks

This skill provides references to benchmarks used for evaluating large language models on scientific reasoning and discovery. The data comes from the Awesome-Scientific-LLM-Benchmarks repository.

## Contents
The complete benchmark list is stored locally within this skill:
- **References List:** `references/benchmarks.md`
- **Data (YAML format):** `data/benchmarks.yaml` 

## Benchmark Domains Covered
- **General / Multi-domain Science:** Cross-disciplinary STEM reasoning benchmarks.
- **Mathematics:** Arithmetic, competition, olympiad, and frontier / formal-proof mathematics.
- **Physics and Astronomy:** Physics olympiad, graduate physics, computational physics, and astronomy.
- **Chemistry:** Molecular property, reaction, retrosynthesis, safety, and chemical knowledge.
- **Materials Science:** Crystals, materials property prediction, and materials-science knowledge.
- **Biology and Life Sciences:** Genomics, proteins, bioinformatics agents, protocols, and research biology.
- **Agentic Science and AI Research:** LLM agents that write research code, run data analyses, attempt autonomous discovery, and conduct ML/AI research.

## Helper Scripts
Also included are python scripts inside `scripts/`:
- `generate_readme.py`: Regenerates the markdown tables and list from `data/benchmarks.yaml`.
- `fetch_examples.py`: Fetches real sample rows from HuggingFace dataset URLs specified in the dataset metadata.