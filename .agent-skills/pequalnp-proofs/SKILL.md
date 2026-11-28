---
name: pequalnp-proofs
description: >
  Inspect, check, and contribute to open-goat/pequalnp-proofs, a machine-checked Lean 4 formal verification repository formalizing computational complexity theorems and proof gaps from the public AI P vs NP project (pequalnp.com). Use when validating complexity theory lemmas with Lake and Lean 4, formalizing reduction algorithms, auditing machine-checked proof certificates, or verifying circuit complexity bounds. Do not use for general software model checking (route to testing) or Coq/Isabelle theorem provers without Lean 4 toolchains. Triggers on: pequalnp, lean4 complexity proofs, p vs np formal proof, open-goat, lake build complexity.
allowed-tools: Read Glob Grep Bash
compatibility: Lean 4 toolchain (elan), Lake build tool, Mathlib4. Preflight runs offline in Python 3.10+.
license: Apache-2.0
metadata:
  version: "1.0.0"
  source: https://github.com/open-goat/pequalnp-proofs
  upstream_commit: 3c12bb097bb91b6c3cfc4ffd278d63aed0093195
  pinned_at: "2026-11-28"
---
# P vs NP Proofs (`open-goat/pequalnp-proofs`)

Source-pinned operator guide for `open-goat/pequalnp-proofs` (Apache-2.0), providing verified instructions and offline preflight validation.

## When to use this skill

- Verify and contribute machine-checked Lean 4 computational complexity proofs from the public AI P vs NP initiative.
- For complete trigger patterns: pequalnp, lean4, formal-verification, complexity-theory, math-proofs, p-vs-np.
- Cross-routing boundaries: route out to `academic`, `data-analysis`, `experimentation` where appropriate.

## Instructions

1. **Run offline preflight first** to confirm tool availability and pinned file integrity:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Verify installation channels & environment prerequisites**:
   - Lean version manager: `elan default leanprover/lean4:v4.16.0`
   - Build system: `lake build`
   - Verification report: `lake exe check-proofs`

3. **Execute verified workflows & operations**:
   - **Machine-Checked Epistemology**: A proof statement is accepted only when the Lean 4 kernel mechanically validates the derivation tree.
   - **Complexity Gap Tracking**: Maps verified reduction lemmas against remaining open steps in computational complexity theory.
   - **Mathlib4 Ecosystem**: Integrates formalized discrete mathematics, combinatorics, and computability theory foundations.

4. **Gate sensitive mutating operations & respect boundaries**:
   - Focuses strictly on machine-checked Lean 4 mathematical proofs; does not execute heuristic approximations.
   - Route out: Automated SMT solving / software model checking -> `testing`.

## References

- Pinned upstream summary and concepts: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
