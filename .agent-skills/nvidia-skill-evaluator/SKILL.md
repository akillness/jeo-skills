---
name: nvidia-skill-evaluator
description: >
  Use when operating NVIDIA/SkillEvaluator: choose keyless quality checks or scanner-backed Tier 1, inspect Tier 2 overlap and provider egress, plan paired Tier 3 skill-impact runs, interpret incomplete reports, or prepare approval-gated repository CI. Covers skillevaluator, quality-check, tier1/tier2/tier3, validate, doctor, and ci init at a pinned revision. Route skill-format compliance to skill-standardization, reusable skill improvement to skill-autoresearch, and general agent benchmarks to agent-evaluation.
allowed-tools: Bash Read Grep Glob
metadata:
  version: 1.0.0
  source: https://github.com/NVIDIA/SkillEvaluator
  upstream_commit: 12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2
---

# NVIDIA SkillEvaluator

## When to use this skill

Use for this named evaluator's setup, tier selection, report diagnosis, paired skill-impact measurements or CI onboarding. For format-only compliance, generic skill revision or product-neutral agent benchmarks, use the route-outs below instead.

## Instructions

### 1. Choose the smallest evidence lane

This is an operator guide for the named NVIDIA repository, not an installed evaluator or an NVIDIA certification. The source snapshot is version 0.8.0 at commit `12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2` (2026-11-12). Catalog installation copies this guide and its support files only.

| User intent | Lane to read in [upstream notes](references/upstream.md) | Evidence boundary |
| --- | --- | --- |
| Check the skill package or source snapshot offline | Offline preflight | Inventory and selected file hashes only |
| Get a keyless quality score | Installation; Quality versus Tier 1 | `quality-check` is not the full security suite |
| Run full static validation without an LLM | Quality versus Tier 1 | `tier1 --no-llm` still requires scanners and can download them |
| Find repeated guidance or overlapping skills | Tier 2 | Embeddings plus chat for intra-skill analysis; catalog required for inter-skill coverage |
| Measure whether the skill helps an agent | Tier 3 | Reviewed cases, live agent/provider and sandbox; paired arms for Skill Lift |
| Combine gates or explain an exit code | Combined validation; Reports | A successful process is not a publication verdict |
| Prepare repository workflows and reports | Repository CI | Preview first; file writes, PRs, uploads and activation require separate approval |

Route plain Agent Skills format/frontmatter compliance to `skill-standardization`, a bounded skill-improvement ratchet to `skill-autoresearch`, and product-neutral agent evaluation or benchmark design to `agent-evaluation` / `eval-harness`.

### 2. Start with the offline package helper

Set `SKILL_DIR` to this installed skill's canonical absolute directory with no symlink components (the shared real skill directory, not a host's per-skill symlink), then run:

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --json
```

To compare an existing source tree with the selected-file manifest:

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --json --repo /absolute/real/path/to/SkillEvaluator
```

Use absolute nonsymlink paths, including ancestors, for both the package and source root; on macOS `/tmp` is a symlink, so use the real `/private/tmp/...` path when applicable. The helper uses local files and executable discovery only: no installs, network, subprocess execution, scanners, model calls, or containers. It does not import or run the upstream project. Secure traversal requires POSIX `dir_fd`/`O_NOFOLLOW` support and fails closed as `secure_posix_traversal_unavailable` where unavailable, including unsupported Windows hosts; this does not describe upstream CLI platform support.

Exit `0` means inventory completed, or all selected source bytes matched when `--repo` was supplied; missing optional executables are informational. Exit `1` means missing/mismatched selected source; exit `2` means unsafe input or malformed manifest. `runtime_verified`, `whole_revision_verified`, and `tool_versions_verified` stay false. A match does not verify Git HEAD, unlisted files, dependencies, scanner readiness, security, or inference.

### 3. Freeze authority before an upstream command

Record the skill/collection path, evaluator revision, lane, report destination, and intended gate. For hosted calls, also record the provider/endpoint, data permitted to leave the host, models, agent, sandbox, case count, attempts and arms. Read the corresponding reference branch before proposing its command.

Obtain explicit approval for each relevant effect:

- Installing/upgrading the evaluator, Python, extras, scanners, agent CLIs or downloaded images changes the environment; a docs-only skill install authorizes none of them.
- Tier 1 can download checksum-verified SkillSpector and Gitleaks without prompting. `--no-llm` is not a no-network flag; dependency audits can contact vulnerability services.
- Tier 2 embeddings and chat, rubric checks, dataset generation, live agents and judges can transmit skill/task content and incur charges. A local endpoint is local only when its routing is verified.
- Tier 3 executes task/skill code and can pull/build Docker images or consume a managed sandbox. Experimental local mode is weaker isolation, not a safe fallback for untrusted skills.
- CI save mode writes workflow files; PR mode can configure GitHub, push branches and open PRs. Merging/activating workflows and publishing reports/source excerpts require their own approval.

Keep credentials in the operator environment or approved CI secret store, never in skill files, manifests, command arguments, examples containing real keys, `runtime_env`, reports or pasted debug output. Review endpoint destinations before using credentials. Treat trajectories and source excerpts as sensitive even after credential redaction.

### 4. Report the evidence, not a stronger claim

Keep these separate: helper inventory, upstream readiness, command execution status, per-tier findings, baseline/coverage, publication eligibility and CI deployment state. `doctor` checks readiness, not successful inference. Its `--verify-models` option is a live credential-bearing operation; Tier 3 catalog visibility still does not prove inference, while Tier 2 probing sends embedding and chat requests.

Use the reference commands only after the matching approvals and prerequisites are satisfied. Report the exact command, observed exit code, artifact paths, missing/skipped stages, provider/scanner errors, dataset gaps, and whether both arms ran. A one-case autopilot, an omitted catalog, an unavailable baseline, or an incomplete scanner is not full coverage. Never replace an infrastructure error with a score of zero or relabel `INCOMPLETE` as `PASS`.

## Examples

- “Check this skill without keys or downloads.” → Inspect the offline helper; if the evaluator is already installed, propose `quality-check` with an approved output path. Do not substitute full Tier 1.
- “Does it improve the agent?” → Review cases and paired Tier 3 setup; a with-skill-only score cannot establish Skill Lift.
- “Enable checks on our repository.” → Prepare CI preview, then distinguish approved local saves, remote setup PR, workflow activation and report publication.

## Best practices

- Use pinned source as a documented snapshot; inspect the installed CLI help before applying commands to a different release.
- Preserve missing evidence and negative results. Lowering thresholds, disabling gates or skipping scanners is a policy change, not a repair.
- Retain paired evidence privately; share only reviewed reports. No upstream runtime, provider, scanner or CI success is claimed by this package.

## References

- [Pinned commands, branch caveats and Apache-2.0/NOTICE attribution](references/upstream.md)
- [Selected source bytes, full commit and SHA-256 hashes](references/source.json)
- [Offline helper](scripts/preflight.py)
- [Evaluation scenarios for this operator skill](evals/evals.json)
