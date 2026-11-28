# Upstream Provenance: `open-goat/pequalnp-proofs`

- **Repository**: <https://github.com/open-goat/pequalnp-proofs>
- **Pinned Commit**: `3c12bb097bb91b6c3cfc4ffd278d63aed0093195` (`2026-11-28`)
- **License**: `Apache-2.0`
- **Primary Interface**: `cli`

## Installation & Setup Channels

- Lean version manager: `elan default leanprover/lean4:v4.16.0`
- Build system: `lake build`
- Verification report: `lake exe check-proofs`

## Key Architecture & Concepts

- **Machine-Checked Epistemology**: A proof statement is accepted only when the Lean 4 kernel mechanically validates the derivation tree.
- **Complexity Gap Tracking**: Maps verified reduction lemmas against remaining open steps in computational complexity theory.
- **Mathlib4 Ecosystem**: Integrates formalized discrete mathematics, combinatorics, and computability theory foundations.

## Boundaries & Cross-Routing

- Focuses strictly on machine-checked Lean 4 mathematical proofs; does not execute heuristic approximations.
- Route out: Automated SMT solving / software model checking -> `testing`.
