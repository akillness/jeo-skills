# academic-paper-reviewer Pipeline Reference

**Upstream skill:** `academic-paper-reviewer` v1.10.0 (Imbad0202/academic-research-skills)  
**Agent ensemble:** 5 reviewers + optional cross-model Devil's Advocate  
**Total modes:** 6

---

## Mode Map

| Mode | Spectrum | Output | Oversight | Triggers |
|------|----------|--------|-----------|----------|
| `full` | Balanced | EIC summary + R1/R2/R3 reports + Devil's Advocate critique | High | \"review this paper\", \"full peer review\", \"simulate peer review\" |
| `quick` | Fidelity | EIC quick assessment + key issues list | Low | \"quick review\", \"quick look\", \"brief assessment\" |
| `guided` | Originality | Socratic issue-by-issue dialogue | Very High | \"guide me to improve\", \"walk me through issues\" |
| `methodology-focus` | Fidelity | In-depth methodology review | Medium | \"check methodology\", \"focus on methods\", \"statistical analysis review\" |
| `re-review` | Fidelity | Revision verification report | Medium | \"check revisions\", \"verify changes\", \"re-review after revision\" |
| `calibration` | Fidelity | Calibration Report (FNR/FPR/AUC) + confidence disclosure | Medium | \"calibrate reviewer\", \"measure reviewer accuracy\", \"benchmark against gold set\" |

---

## Execution Protocol

### full mode (EIC + R1/R2/R3 + Devil's Advocate)
1. Accept paper (PDF, URL, or pasted text)  
2. **[USER CHECKPOINT]** Confirm review scope and venue norms (NeurIPS / ICLR / CVPR / journal)  
3. Run 5-reviewer ensemble in parallel:  
   - **EIC** (Editor-in-Chief): fit, novelty, significance  
   - **R1**: methodology and experimental design  
   - **R2**: related work and positioning  
   - **R3**: clarity, reproducibility, and presentation  
   - **Devil's Advocate**: actively argues the strongest case for rejection  
4. Synthesize individual reports into meta-review  
5. Return: individual reviewer reports + EIC meta-review + Devil's Advocate summary  
6. Optional (requires OpenAI-compatible endpoint): cross-model verification of Devil's Advocate findings  

**Reviewer ensemble outputs:**

| Agent | Focus | Output |
|---|---|---|
| EIC | Novelty, significance, fit | Accept / Major Revision / Minor Revision / Reject + rationale |
| R1 | Methods, experiments, stats | Methodology score (1–10) + findings list |
| R2 | Related work, positioning | Gap analysis + missing citations |
| R3 | Clarity, reproducibility | Writing quality score + reproduction checklist |
| Devil's Advocate | Strongest rejection arguments | Ordered list of fatal flaws (if any) |

### quick mode
1. Accept paper  
2. Single-pass EIC-style assessment (no full reviewer ensemble)  
3. Return: overall recommendation + top 3–5 issues  
4. Estimated time: < 5 minutes  

### guided mode (Socratic — Very High oversight)
1. Present one issue at a time as a question  
2. Wait for user response before advancing  
3. Build a collaborative revision plan from the dialogue  
4. Return: structured improvement roadmap keyed to reviewer issues  

### methodology-focus mode
1. Accept paper (methods + experiments sections focus)  
2. Audit: experimental design, statistical tests, sample size, baselines, ablation completeness, reproducibility details  
3. Return: methodology score + itemized findings with severity (`CRITICAL` / `MAJOR` / `MINOR` / `SUGGESTION`)  

### re-review mode
1. Accept: (a) original reviewer comments + (b) revised manuscript  
2. Verify each comment is addressed: `RESOLVED` / `PARTIALLY_ADDRESSED` / `NOT_ADDRESSED`  
3. Flag new issues introduced in the revision  
4. Return: verification report with per-comment status  

### calibration mode
1. Accept: reviewer outputs + gold-standard review set (user-provided)  
2. Compute FNR (false negative rate — missed real issues), FPR (false positive rate — phantom issues), AUC  
3. Return: Calibration Report with per-category scores + confidence disclosure  
4. Use case: validate that the reviewer ensemble is not systematically over/under-detecting for a specific venue  

---

## Reviewer quality principles

- **No fabricated citations** in reviewer reports — any claim about prior work must cite a real, verifiable source  
- **No hallucinated reviewer scores** — scores must follow from the findings listed  
- **Devil's Advocate is adversarial by design** — it is supposed to argue for rejection; treat its output as a stress test, not a verdict  
- **cross-model DA** (optional): routes Devil's Advocate critique to an OpenAI-compatible endpoint for independent verification; never silently downgrades to single-model  

---

## Output format defaults

- Each reviewer report: structured sections (Summary / Strengths / Weaknesses / Questions / Recommendation / Score)  
- EIC meta-review: 200–400 words + final decision  
- Calibration Report: JSON-compatible schema + narrative summary  
- Severity tags: `CRITICAL` (must fix before acceptance) / `MAJOR` (should fix) / `MINOR` (optional) / `SUGGESTION`  
