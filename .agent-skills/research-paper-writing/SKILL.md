---
name: research-paper-writing
description: >
  Draft and revise ML, CV, NLP, and systems research papers with strong claim-evidence
  flow, reviewer-aware structure, and submission-ready section planning. Use when the
  user needs help with an abstract, introduction, related work, method, experiments,
  ablations, discussion, figures/tables, checklist coverage, or rebuttal / response-letter
  writing for a paper. Triggers on: research paper, academic paper, ML paper, NeurIPS paper,
  ICLR paper, CVPR paper, experiments section, ablation plan, related work, contribution
  framing, reviewer response, rebuttal, camera-ready revision.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
license: MIT
metadata:
  tags: research-paper-writing, academic-writing, ml, cv, nlp, experiments, rebuttal
  version: "1.1"
  source: akillness/jeo-skills
---

# research-paper-writing

Use this skill when the job is not generic prose cleanup, but turning research work into a **defensible manuscript package**.

The center of gravity is:
- contribution framing,
- claim → evidence alignment,
- section-level structure,
- figure/table support,
- reviewer-facing completeness,
- rebuttal and camera-ready revision.

Read these support notes before drafting or revising:
- [references/claim-evidence-packet.md](references/claim-evidence-packet.md)
- [references/experiment-and-figure-coverage.md](references/experiment-and-figure-coverage.md)
- [references/rebuttal-and-camera-ready.md](references/rebuttal-and-camera-ready.md)

## When to use this skill

- Drafting or rewriting an abstract around concrete claims and measurable evidence
- Structuring an introduction so motivation, gap, method, and contributions land quickly
- Turning notes, code results, or slide bullets into a method section with reproducible detail
- Designing experiment, ablation, error-analysis, or figure/table coverage for a paper
- Writing related work that positions the paper instead of listing references
- Tightening a rebuttal, reviewer response, or camera-ready revision plan under strict limits
- Checking whether the manuscript actually supports each promised contribution

## When not to use this skill

- The request is an internal design doc, ADR, architecture note, or engineering runbook → use `technical-writing`
- The request is an API portal, SDK reference, or developer-facing product documentation problem → use `api-documentation`
- The request is an end-user tutorial, onboarding guide, or FAQ → use `user-guide-writing`
- The request is a slide deck, investor pitch, roadmap deck, or game pitch → use `presentation-builder`
- The request is broad marketing or launch messaging rather than academic publication → use `marketing-automation`
- The request is only citation collection / literature discovery without manuscript writing or revision pressure

## Instructions

### Step 1: Lock the paper contract

Before writing, define this packet:

```yaml
paper_contract:
  target_venue: "conference / journal / workshop"
  primary_problem: "one-sentence problem statement"
  core_claim: "the single strongest contribution"
  evidence_required:
    - benchmark or empirical proof
    - ablation or mechanism check
    - failure case / limitation / scope note
  audience: "reviewers / readers / subcommunity"
  constraints:
    page_or_word_limit: "..."
    anonymity_or_style_rules: "..."
    must_keep_sections:
      - abstract
      - intro
      - method
      - experiments
      - rebuttal / response letter
```

If the core claim or required evidence is fuzzy, fix that first. Weak framing leaks into every section.

### Step 2: Map each claim to proof

Build a quick claim-evidence table before drafting:

| Claim | Evidence needed | Supporting figure/table | Risk if missing |
|-------|-----------------|-------------------------|-----------------|
| ... | ... | ... | ... |

Do not let a headline contribution survive without an experiment, ablation, analysis, or explicit scope boundary.

### Step 3: Draft the abstract from claims, not chronology

Use this order:
1. problem and stakes
2. gap in existing work
3. proposed method
4. strongest quantitative or qualitative result
5. scope, limitation, or implication

Replace vague phrases like “significant improvement” with metric + benchmark + margin whenever possible.

### Step 4: Build the introduction as a reviewer funnel

Structure the introduction in five moves:
1. why the problem matters
2. why existing approaches fall short
3. what your method changes
4. what the evidence shows
5. bullet contributions

Contribution bullets should be **specific and testable**, not marketing copy.

### Step 5: Make the method reproducible

The method section should answer:
- what inputs and outputs exist,
- what modules or stages the system contains,
- what training or optimization objective is used,
- what implementation choices materially affect results,
- what assumptions or boundary conditions matter.

Use equations only where they clarify behavior. If a precise algorithm box, table, or pipeline list explains the system more cleanly, prefer that.

### Step 6: Treat experiments as the proof section

Cover at least:
- main benchmark or task results,
- strong baselines,
- ablations for the claimed mechanism,
- qualitative or failure analysis when useful,
- efficiency / compute / cost when the paper claims practicality,
- limitations or scope notes when evidence is mixed.

Each subsection should map back to one contribution claim.

### Step 7: Check figures, tables, and checklist coverage

For each important figure or table, verify:
- what claim it supports,
- whether the caption states the takeaway,
- whether the text references it at the right moment,
- whether a reviewer could misread it without extra context,
- whether the venue checklist expects additional disclosure.

If a result is important enough to mention in the abstract or contribution bullets, it usually deserves a clear table or figure anchor.

### Step 8: Write rebuttals with evidence first

For each reviewer concern:
1. restate the concern precisely,
2. answer directly in one sentence,
3. add concrete evidence,
4. say what text, figure, table, or experiment changes in the revision,
5. keep tone calm and non-defensive.

Use a response matrix before final prose if several reviewers overlap or contradict one another.

### Step 9: Return one paper-ready packet

Choose the single most useful output for the current stage:
- `abstract rewrite`
- `introduction / contribution framing packet`
- `method clarification packet`
- `experiment + ablation plan`
- `figure/table support packet`
- `reviewer response / rebuttal packet`
- `camera-ready revision checklist`

Do not emit a vague “full paper advice” dump if the user clearly needs one stage-specific artifact.

## Output format

```markdown
# Research Paper Writing Packet

## Stage
- Abstract | Introduction | Method | Experiments | Related work | Rebuttal | Camera-ready

## Core claim
- ...

## Evidence map
| Claim | Evidence | Figure / table | Status |
|-------|----------|----------------|--------|
| ... | ... | ... | ... |

## Recommended draft or revision
- ...

## Reviewer-risk check
- Missing proof: ...
- Overclaim risk: ...
- Ambiguity risk: ...

## Next artifact
- ...
```

## Examples

### Example 1: Abstract rewrite

Input:
- notes on a diffusion model paper
- benchmark table
- target venue: CVPR

Output:
- a 150–200 word abstract with problem, gap, method, results, and scope
- one warning about the strongest unsupported claim

### Example 2: Experiment plan

Input:
- draft method section
- three claimed contributions

Output:
- experiment matrix listing datasets, baselines, ablations, metrics, and figure/table owners
- one note on which contribution is still under-supported

### Example 3: Rebuttal packet

Input:
- reviewer comments from OpenReview
- current manuscript claims
- two new analyses available, no time for new large experiment

Output:
- point-by-point response packet
- manuscript change list
- explicit note on what can be promised for camera-ready versus what cannot

## Best practices

1. Every major claim should have a matching figure, table, ablation, or explicit limitation.
2. Do not bury the best result in the middle of a paragraph.
3. Use consistent terminology for modules, datasets, and metrics throughout the paper.
4. Prefer short, information-dense sentences over long narrative transitions.
5. If a result is mixed, state the boundary clearly instead of overselling.
6. Treat rebuttal writing as evidence packaging, not persuasion theater.
7. Keep this skill narrow: manuscript structure, evidence, figures/tables, and reviewer responses — not generic research tooling.

## References

- Overleaf collaboration and versioning docs
- OpenReview author-response workflow
- NeurIPS paper checklist and venue reporting expectations
- Academic writing / response-letter guidance synthesized in the support docs under `references/`
