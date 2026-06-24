# academic-pipeline Stages Reference

**Upstream skill:** `academic-pipeline` v3.13.0 (Imbad0202/academic-research-skills)  
**Pattern:** 10-stage orchestrated workflow with adaptive checkpoints  
**Oversight:** Very High — mandatory user confirmation at each stage boundary  

---

## Pipeline Overview

```
Stage 1  → Research Question & Scope
Stage 2  → Literature Sweep
Stage 2.5→ Integrity Gate (pre-write claim audit)
Stage 3  → Outline & Chapter Plan
Stage 4  → Paper Draft
Stage 4.5→ Integrity Gate (claim-faithfulness audit)
Stage 5  → Citation Verification
Stage 6  → Peer Review Simulation
Stage 7  → Cross-Model Verification (optional)
Stage 8  → Author Revision
Stage 9  → Final Formatting & Disclosure
Stage 10 → Material Passport & Repro Lock
```

> **[USER CHECKPOINT]** gates appear at the end of Stages 1, 2, 3, 4, 5, 6, 8. Never skip.

---

## Stage Details

### Stage 1 — Research Question & Scope

**Input:** Topic or research goal (free text)  
**Actions:**
- Socratic intake: research question, target venue, claimed contribution type (empirical / theoretical / survey / system)
- Declare `experiment_intake_declaration`: did you run experiments externally? (`yes` → provide provenance; `no` → `no_experiments_declared`)
- Set `data_access_level`: `raw` / `redacted` / `verified_only`
- Record initial research question in Material Passport

**[USER CHECKPOINT]:** Confirm RQ, venue, contribution type, and experiment provenance before proceeding.

---

### Stage 2 — Literature Sweep

**Input:** Confirmed RQ from Stage 1  
**Actions:**
- 13-agent deep-research sweep (cross-index: Semantic Scholar + OpenAlex + Crossref)
- WHY/HOW/WHAT three-way scan classification
- Build source shortlist (20–50 papers)
- Flag preprints and grey literature separately

**[USER CHECKPOINT]:** User reviews and approves source shortlist. User may add or remove sources.

---

### Stage 2.5 — Pre-Write Integrity Gate

**Input:** Source shortlist from Stage 2  
**Actions:**
- Audit each planned claim against declared experiment provenance
- Classify: `ALIGNED` / `OVERSTATED` / `NOT_SUPPORTED_BY_PROVENANCE` / `PROVENANCE_INSUFFICIENT`
- Block advancement if any claim is `NOT_SUPPORTED_BY_PROVENANCE` (unless user explicitly scopes or removes claim)
- Record gate result in Material Passport

> This gate is **fail-closed**: a claim that cannot be traced to declared provenance or published source must be scoped, bounded, or removed.

---

### Stage 3 — Outline & Chapter Plan

**Input:** Approved source shortlist + RQ  
**Actions:**
- Generate IMRaD (or domain-appropriate) outline
- Map each section to evidence anchors from source shortlist
- Flag contribution bullets missing evidence: `[NEEDS EVIDENCE]`
- Apply Style Calibration if user provides past writing samples

**[USER CHECKPOINT]:** User approves outline and evidence map.

---

### Stage 4 — Paper Draft

**Input:** Approved outline from Stage 3  
**Actions:**
- 12-agent parallel drafting (all sections simultaneously)
- Claim-evidence alignment enforced in every section
- Writing Quality Check: flags patterns that make prose feel machine-generated
- Style Calibration applied if samples were provided in Stage 3

**[USER CHECKPOINT]:** User reviews full draft; requests section revisions as needed.

---

### Stage 4.5 — Claim-Faithfulness Integrity Gate (L3)

**Input:** Draft from Stage 4  
**Actions:**
- L3 claim-faithfulness audit (v3.7.3 spec)
- Each abstract/introduction claim traced to body evidence
- Classify: `FAITHFUL` / `OVERSTATED` / `UNSUPPORTED` / `SCOPE_MISMATCH`
- Block Stage 5 if any `OVERSTATED` or `UNSUPPORTED` claims remain

> Gate is **fail-closed**: unresolved claims block the pipeline. User must fix, scope, or explicitly acknowledge each finding.

---

### Stage 5 — Citation Verification

**Input:** Draft with reference list  
**Actions:**
- Three-index triangulation: Semantic Scholar (primary) + OpenAlex + Crossref (advisory)
- Per-citation status: `VERIFIED` / `PREPRINT` / `UNMATCHED` / `HALLUCINATED`
- `HALLUCINATED` citations must be removed or replaced before Stage 6
- Preprint citations flagged advisory (do not block)

**[USER CHECKPOINT]:** User confirms citation corrections.

---

### Stage 6 — Peer Review Simulation

**Input:** Verified draft from Stage 5  
**Actions:**
- Full `academic-paper-reviewer` run: EIC + R1/R2/R3 + Devil's Advocate
- Meta-review synthesized
- Score trajectory recorded in Material Passport

**[USER CHECKPOINT]:** User reviews peer review reports and decides: accept findings, partially accept, or rebut.

---

### Stage 7 — Cross-Model Verification (Optional)

**Input:** Reviewer reports from Stage 6  
**Activation:** Set `ARS_CROSS_MODEL=1` + provide OpenAI-compatible endpoint  
**Actions:**
- Routes Devil's Advocate findings to independent model (MiMo, DeepSeek, OpenAI, or self-hosted)
- Checks for agreement or divergence on fatal flaws
- Returns cross-model verification report
- Never silently downgrades to single-model if env var is set

> Optional but recommended for high-stakes venues (NeurIPS, Nature, Science).

---

### Stage 8 — Author Revision

**Input:** Peer review reports (+ optional cross-model report)  
**Actions:**
- `revision` mode: produce revised draft + point-by-point R&R letter
- `rebuttal-audit` mode: verify rebuttal covers all reviewer comments
- Every reviewer comment must be tagged: `RESOLVED` / `PARTIALLY_ADDRESSED` / `REBUTTED`

**[USER CHECKPOINT]:** User approves final revised manuscript.

---

### Stage 9 — Final Formatting & AI Disclosure

**Input:** Approved revised manuscript  
**Actions:**
- `format-convert` mode: apply target venue format (LaTeX / IEEE / APA 7.0 / AMA)
- `disclosure` mode: generate venue-compliant AI usage disclosure statement
- Final Writing Quality Check pass
- Return submission-ready package

---

### Stage 10 — Material Passport & Repro Lock

**Input:** Finalized manuscript + all stage artifacts  
**Actions:**
- Compile **Material Passport**: records all stage outputs, source provenance, claim-faithfulness gate results, citation verification results, reviewer reports, revisions
- Optional `repro_lock` sub-block: configuration snapshot (model, date, key parameters) — **documentation only, not byte-reproducible replay**
- Record final score trajectory (Stage 2.5 → 4.5 → 6 → post-revision)
- Archive in `material_passport_{hash}.json`

> The Material Passport is the single source of truth for the pipeline run. Use its hash as the `resume_from_passport` reference if the pipeline is interrupted.

---

## Resume Mode

```
resume_from_passport=<hash>
```

Activated via `ARS_PASSPORT_RESET=1`. Restores pipeline state from the Material Passport at a prior reset boundary and resumes from the next uncompleted stage. Used when context is lost mid-pipeline.

---

## Key Environment Variables

| Variable | Effect |
|---|---|
| `ARS_CROSS_MODEL=1` | Enable Stage 7 cross-model verification |
| `ARS_PASSPORT_RESET=1` | Enable resume-from-passport mode |
| `ARS_SOCRATIC_ADJACENT_PROBE=1` | Enable adjacent-framing probe in Stage 1 Socratic intake |

---

## Integrity gate summary

| Gate | Stage | Condition | Action on fail |
|---|---|---|---|
| Pre-write claim audit | 2.5 | Claim not in provenance | Block; user must scope or remove |
| Claim-faithfulness (L3) | 4.5 | Abstract/intro claim unsupported in body | Block; user must fix or acknowledge |
| Citation verification | 5 | `HALLUCINATED` citation | Remove or replace before Stage 6 |
