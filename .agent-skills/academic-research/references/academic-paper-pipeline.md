# academic-paper Pipeline Reference

**Upstream skill:** `academic-paper` v3.2.0 (Imbad0202/academic-research-skills)  
**Agent ensemble:** 12-agent paper-writing team  
**Total modes:** 11

---

## Mode Map

| Mode | Spectrum | Output | Oversight | Triggers |
|------|----------|--------|-----------|----------|
| `full` | Balanced | Complete paper draft (IMRaD or domain-appropriate) | High | "write a paper", "academic paper", "research paper" |
| `plan` | Originality | Chapter Plan + INSIGHT collection (Socratic) | Very High | "guide my paper", "help me plan", "step by step paper" |
| `outline-only` | Balanced | Detailed outline + evidence map | High | "paper outline", "just need an outline" |
| `revision` | Fidelity | Revised draft + point-by-point R&R responses | High | "revise paper", "incorporate reviewer feedback" |
| `revision-coach` | Balanced | Revision Roadmap + Response Letter Skeleton | Medium | "parse reviews", "I got reviewer comments" |
| `abstract-only` | Fidelity | Bilingual abstract (zh-TW + EN) + keywords | Medium | "write abstract" |
| `lit-review` | Fidelity | Literature review section (positions the paper) | Medium | "write related work", "literature review section" |
| `format-convert` | Fidelity | Reformatted paper (LaTeX / IEEE / APA 7.0 / AMA) | Medium | "convert to LaTeX", "convert citations to IEEE" |
| `citation-check` | Fidelity | Citation verification report | Medium | "check citations", "verify references" |
| `disclosure` | Fidelity | AI usage disclosure statement | Medium | "AI disclosure", "NeurIPS AI statement", "AI usage policy" |
| `rebuttal-audit` | Fidelity | Annotated rebuttal audit against reviewer comments | Medium | "audit my rebuttal", "check my response letter" |

---

## Execution Protocol

### full mode
1. Confirm: topic, venue/format, core claim, target length  
2. **[USER CHECKPOINT]** Agree on IMRaD structure or domain-appropriate format  
3. 12-agent parallel drafting (abstract → intro → related work → method → experiments → discussion → conclusion)  
4. Claim-evidence alignment check: every contribution bullet must have supporting evidence  
5. **[USER CHECKPOINT]** Review draft; user confirms or requests section revisions  
6. Return submission-ready manuscript  

### plan mode (Socratic — Very High oversight)
1. One question at a time — do NOT front-load  
2. Elicit: venue, research question, claimed contribution, evidence available, co-author constraints  
3. Build Chapter Plan with INSIGHT collection  
4. **[USER CHECKPOINT]** Confirm chapter plan before outline generation  
5. Generate section-level outline with evidence anchors  

### outline-only mode
1. Confirm venue, topic, and length target  
2. Generate detailed outline with section headers, key claims per section, and evidence map  
3. Flag contribution bullets that lack confirmed evidence → mark as `[NEEDS EVIDENCE]`  

### revision mode
1. Accept: (a) original paper + (b) reviewer comments  
2. Parse comments into R1/R2/R3 action items  
3. **[USER CHECKPOINT]** Agree on which comments to accept, partially accept, or rebut  
4. Produce revised manuscript + point-by-point R&R response letter  
5. Flag any comment not addressed with explicit rationale  

### revision-coach mode
1. Accept reviewer comments (PDF, text, or pasted)  
2. Parse into structured Revision Roadmap by reviewer and comment ID  
3. Generate Response Letter Skeleton (template with placeholders)  
4. Classify each comment: `MUST_FIX` / `SHOULD_FIX` / `REBUT`  

### abstract-only mode
1. Confirm: topic, venue, word limit  
2. Write abstract in 5-move structure: problem → gap → method → result → scope  
3. Return bilingual (zh-TW + EN) with keywords  

### lit-review mode (positions the paper — not a survey)
1. Confirm: paper topic and claimed contributions  
2. Synthesize related work into positioning narrative (what exists, where it falls short, how this paper fills the gap)  
3. Return related work section with inline citations (APA 7.0 default)  

### format-convert mode
1. Accept: paper draft + target format (LaTeX / IEEE / APA 7.0 / AMA / Vancouver)  
2. Convert citation style and section formatting  
3. Return reformatted document; flag anything requiring manual review  

### citation-check mode
1. Accept: paper draft (with reference list)  
2. Verify each cited work against Semantic Scholar + OpenAlex + Crossref  
3. Return verification report: `VERIFIED` / `PREPRINT` / `UNMATCHED` / `HALLUCINATED`  
4. Do NOT block submission for preprints — flag advisory only  

### disclosure mode
1. Confirm venue (NeurIPS / ICLR / CVPR / ACL / journal / generic)  
2. Identify all AI-assisted sections from the paper  
3. Generate venue-compliant AI usage disclosure statement  

### rebuttal-audit mode
1. Accept: (a) rebuttal draft + (b) original reviewer comments  
2. Verify every reviewer comment has a matching response  
3. Flag: unanswered comments, overlong responses, unsubstantiated factual claims in rebuttal  
4. Return annotated rebuttal with severity tags  

---

## Claim-evidence alignment rules

| Contribution claim | Required evidence |
|---|---|
| "X outperforms Y on benchmark Z" | Experiment table + statistical significance note |
| "Our method is more efficient" | Runtime or memory measurement |
| "We propose a novel X" | Related work section showing gap + method section |
| "Ablation shows component Y matters" | Ablation table row |

Claims without evidence must be scoped, bounded, or removed. Never let an unsupported claim reach the abstract.

---

## Output format defaults

- IMRaD (Introduction / Methods / Results / Discussion) for empirical papers  
- Varies by venue: NeurIPS / ICML use 8-page + appendix; CVPR uses 8-page double-column  
- Citations: APA 7.0 default; IEEE on request  
- LaTeX source on request  
- Style Calibration: provide 1–3 past writing samples to learn your voice (plan mode)  
