---
name: academic-research
description: ">"
compatibility: ">"
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
metadata:
  tags: academic-research, deep-research, paper-writing, peer-review, literature-review, systematic-review, citation-check, research-pipeline, scholarly-publishing, ars
  version: 1.0.0
  source: "https://github.com/Imbad0202/academic-research-skills"
  upstream_version: 3.13.0
  license: CC-BY-NC-4.0
---







# academic-research

A routing-first front door for the full **Academic Research Skills (ARS)** suite — 4 pipelines, 27 modes, spanning the complete research-to-publication lifecycle.

> **AI is copilot, not pilot.** ARS handles the grunt work (hunting references, verifying citations, checking logical consistency, formatting). You handle the parts that require your brain: defining the question, choosing the method, interpreting results, and writing the sentence after "I argue that."

Read these pipeline references before executing:
- [references/deep-research-pipeline.md](../academic-research--references/deep-research-pipeline.md)
- [references/academic-paper-pipeline.md](../academic-research--references/academic-paper-pipeline.md)
- [references/academic-paper-reviewer-pipeline.md](../academic-research--references/academic-paper-reviewer-pipeline.md)
- [references/academic-pipeline-stages.md](../academic-research--references/academic-pipeline-stages.md)

## Plugin Installation

```bash
# Full upstream suite (all 4 skills, 27 modes — recommended for heavy use)
claude plugin marketplace add Imbad0202/academic-research-skills

# Or install this routing skill only via jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill academic-research
```

## When to use this skill

- Conducting rigorous literature research on a topic (→ deep-research pipeline)
- Writing a new academic paper from scratch or guided outline (→ academic-paper pipeline)
- Reviewing or evaluating an existing paper (→ academic-paper-reviewer pipeline)
- Orchestrating the full research-to-publication workflow end-to-end (→ academic-pipeline)
- Fact-checking claims in a paper or source (→ deep-research / fact-check mode)
- Preparing for peer review, rebuttal, or journal revision (→ academic-paper / revision modes)
- Running a PRISMA 2020 systematic review (→ deep-research / systematic-review mode)
- Generating a bilingual abstract, converting citations, checking AI disclosure requirements

## When not to use this skill

- The request is a code documentation or API reference → use `technical-writing`
- The request is an ML experiment loop (training/eval) → use `autoresearch`
- The request is a general writing task (blogs, marketing, newsletters) → use `marketing-automation`
- The request needs autonomous agent ML training → use `autoresearch`
- The user already has a paper draft and just needs copy editing → use `technical-writing` or `user-guide-writing`

## Required intake packet

Before routing, identify:
1. **Pipeline** — which of the 4 pipelines fits (deep-research / academic-paper / academic-paper-reviewer / academic-pipeline)
2. **Mode** — which specific mode within that pipeline (see routing table below)
3. **Topic or input** — the research topic, paper text, or reviewer comments to work from
4. **Oversight preference** — Very High (guided/Socratic) → High (key decisions) → Medium (structured) → Low (template)
5. **Format / venue** — APA 7.0, IEEE, LaTeX, NeurIPS, ICLR, CVPR, or journal target

## Pipeline & Mode Routing Table

| What the user says | Pipeline | Mode | Oversight |
|---|---|---|---|
| "research [topic]", "deep research", "academic analysis" | deep-research | full | High |
| "quick brief", "30 minute summary" | deep-research | quick | Medium |
| "review this paper's research quality" | deep-research | review | High |
| "literature review", "annotated bibliography" | deep-research | lit-review | Medium |
| "WHY HOW WHAT papers", "3W scan", "compare papers" | deep-research | three-way-scan | Low |
| "verify claims", "fact-check", "evidence verification" | deep-research | fact-check | Medium |
| "guide my research", "help me think through" | deep-research | socratic | Very High |
| "systematic review", "meta-analysis", "PRISMA" | deep-research | systematic-review | Medium |
| "write a paper on X", "academic paper", "research paper" | academic-paper | full | High |
| "guide me through writing", "help me plan my paper" | academic-paper | plan | Very High |
| "build a paper outline" | academic-paper | outline-only | High |
| "I have reviewer comments", "revise my paper" | academic-paper | revision | High |
| "parse reviewer comments into a roadmap" | academic-paper | revision-coach | Medium |
| "write an abstract" | academic-paper | abstract-only | Medium |
| "turn this into a literature review paper" | academic-paper | lit-review | Medium |
| "convert to LaTeX", "convert citations to IEEE" | academic-paper | format-convert | Medium |
| "check citations" | academic-paper | citation-check | Medium |
| "generate AI disclosure statement for NeurIPS" | academic-paper | disclosure | Medium |
| "audit my rebuttal draft against reviews" | academic-paper | rebuttal-audit | Medium |
| "review this paper" → full EIC + R1/R2/R3 + Devil's Advocate | academic-paper-reviewer | full | High |
| "quick assessment of this paper" | academic-paper-reviewer | quick | Low |
| "guide me to improve this paper" | academic-paper-reviewer | guided | Very High |
| "check the methodology" | academic-paper-reviewer | methodology-focus | Medium |
| "verify the revisions" | academic-paper-reviewer | re-review | Medium |
| "calibrate this reviewer against my gold set" | academic-paper-reviewer | calibration | Medium |
| "I want to write a complete research paper" | academic-pipeline | full (10-stage) | Very High |
| "continue pipeline from reset boundary" | academic-pipeline | resume_from_passport | High |

## Instructions

### Step 1: Pick the pipeline

```
deep-research        → topic investigation, literature synthesis, fact-checking, PRISMA
academic-paper       → write, outline, revise, abstract, format, rebuttal, disclosure
academic-paper-reviewer → evaluate, review, calibrate reviewer quality
academic-pipeline    → full orchestrated 10-stage research → paper → review → revise → finalize
```

If ambiguous between deep-research and academic-paper: the user doing *discovery* → deep-research; the user *writing or revising a document* → academic-paper.

### Step 2: Confirm the mode and input

- State the chosen pipeline and mode explicitly before proceeding
- For `socratic` or `plan` modes: begin Socratic dialogue immediately (one question at a time)
- For `full` or `revision` modes: confirm the topic/paper and output format first
- For `citation-check` or `fact-check`: confirm which claims or sections to target

### Step 3: Execute with human-in-the-loop

Follow the pipeline reference for the chosen mode:
- **deep-research**: Read [references/deep-research-pipeline.md](../academic-research--references/deep-research-pipeline.md)
- **academic-paper**: Read [references/academic-paper-pipeline.md](../academic-research--references/academic-paper-pipeline.md)
- **academic-paper-reviewer**: Read [references/academic-paper-reviewer-pipeline.md](../academic-research--references/academic-paper-reviewer-pipeline.md)
- **academic-pipeline (10-stage)**: Read [references/academic-pipeline-stages.md](../academic-research--references/academic-pipeline-stages.md)

Checkpoints marked **[USER CHECKPOINT]** require explicit user confirmation before continuing. Never skip them.

### Step 4: Return a structured output packet

Every completed mode should return:
```
Pipeline:     <which pipeline>
Mode:         <which mode>
Topic/Input:  <research topic or paper title>
Output:       <the primary artifact — report / draft / review / outline>
Citations:    <APA 7.0 / IEEE / inline — as applicable>
Integrity:    <claim verification status if fact-check or citation-check was run>
Next step:    <recommended follow-up mode or pipeline>
```

## Data access and integrity principles

- `data_access_level: verified_only` — ARS never uses unverified claims in outputs
- `task_type: open-ended` — all modes are open-ended; ARS does not run experiments
- Citation hallucination guard: three-index triangulation (Semantic Scholar + OpenAlex + Crossref) in academic-pipeline Stage 6/7
- Experiment provenance: claims backed by experiments must be declared in the Material Passport; ARS audits alignment (`ALIGNED` / `OVERSTATED` / `NOT_SUPPORTED_BY_PROVENANCE`)
- Style Calibration: `academic-paper` `plan` mode can learn your voice from past work samples

## Route-out map

| If the user needs… | Route to |
|---|---|
| ML training experiment loop | `autoresearch` |
| Prompt / skill eval pipeline | `skill-autoresearch` |
| Engineering design doc or ADR | `technical-writing` |
| API portal or SDK reference | `api-documentation` |
| Karpathy-style ML research | `autoresearch` |
| General content / blog / newsletter | `marketing-automation` |
| Code documentation | `technical-writing` |
