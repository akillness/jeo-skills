# deep-research Pipeline Reference

**Upstream skill:** `deep-research` v2.11.0 (Imbad0202/academic-research-skills)  
**Agent ensemble:** 13-agent research team  
**Total modes:** 8

---

## Mode Map

| Mode | Spectrum | Output | Oversight | Triggers |
|------|----------|--------|-----------|----------|
| `full` | Balanced | APA 7.0 report, 3,000–8,000 words | High | "research [topic]", "deep research", "academic analysis" |
| `quick` | Fidelity | Research brief, 500–1,500 words | Medium | "quick brief", "30 minute summary", "quick research" |
| `review` | Balanced | Reviewer report on provided text | High | "review this paper", "evaluate this paper", "assess this source" |
| `lit-review` | Fidelity | Annotated bibliography + synthesis | Medium | "literature review", "annotated bibliography" |
| `three-way-scan` | Fidelity | WHY/HOW/WHAT paper shortlist + cross-paper synthesis | Low | "WHY HOW WHAT papers", "3W literature scan", "compare these papers" |
| `fact-check` | Fidelity | Claim-by-claim verification report | Medium | "verify claims", "fact-check", "evidence verification" |
| `socratic` | Originality | Research Plan Summary + INSIGHT collection | Very High | "guide my research", "help me think through", "I'm not sure what to research" |
| `systematic-review` | Fidelity | PRISMA 2020 report, 5,000–15,000 words | Medium | "systematic review", "meta-analysis", "PRISMA" |

---

## Execution Protocol

### full mode
1. Confirm research topic and scope with user  
2. 13-agent parallel literature sweep  
3. **[USER CHECKPOINT]** Show source shortlist; user approves sources and angles  
4. Synthesize into APA 7.0 report (3,000–8,000 words)  
5. Run citation integrity check (Semantic Scholar triangulation)  
6. Return final report with integrity annotation  

### quick mode
1. Confirm topic and time constraint (target: 30 minutes)  
2. Rapid sweep (3–5 key sources)  
3. Synthesize into brief (500–1,500 words)  
4. Return with key claims and source list  

### review mode
1. Accept paper text or URL  
2. Run multi-agent assessment across methodology, evidence, citations  
3. Return structured reviewer report with findings by section  

### lit-review mode
1. Confirm research question and target scope  
2. Build annotated bibliography (5–20 sources)  
3. Synthesize cross-paper themes  
4. Return annotated bibliography + thematic synthesis  

### three-way-scan (WHY/HOW/WHAT)
1. Accept topic or set of papers  
2. Classify each paper as WHY (motivation), HOW (method), WHAT (result)  
3. Return shortlist by category + cross-paper synthesis  

### fact-check mode
1. Accept document or list of claims  
2. Verify each claim against Semantic Scholar / OpenAlex / Crossref  
3. Return claim-by-claim report: `SUPPORTED` / `CONTESTED` / `NOT_FOUND` / `HALLUCINATED`  

### socratic mode (opt-in: `ARS_SOCRATIC_ADJACENT_PROBE=1`)
1. One question at a time — do NOT front-load  
2. Layer 1: Framing (research question, gap, angle) — may surface ONE adjacent framing as a question  
3. Layer 2: Evidence (what do you already know?)  
4. Layer 3: Method (how will you investigate?)  
5. Return Research Plan Summary + INSIGHT collection  

### systematic-review mode (PRISMA 2020)
1. Confirm PICO/PICOS criteria and database scope  
2. **[USER CHECKPOINT]** Search strategy and inclusion/exclusion criteria  
3. Execute literature sweep with PRISMA flowchart  
4. Quality appraisal (RoB, GRADE, or domain-appropriate tool)  
5. **[USER CHECKPOINT]** Included study list  
6. Synthesize 5,000–15,000 word PRISMA report  

---

## Integrity gate

All modes with external sources run:
- **Semantic Scholar** lookup (primary)  
- **OpenAlex** triangulation (advisory)  
- **Crossref** triangulation (advisory)  

Hallucinated citations flagged as `CONTAMINATED-UNMATCHED`. Preprint DOIs exempt from lookup unmatched flag.

---

## Output format defaults

- APA 7.0 unless user specifies IEEE, Vancouver, Chicago, or inline  
- Bilingual abstract (zh-TW + EN) on request  
- `fact-check` returns JSON-schema-compliant verification report  
