# Data Analysis Decision Brief Template

```markdown
## Analysis brief
- Goal: [decision question]
- Audience: [who needs the answer]
- Data source: [files / tables / export scope]
- Time window: [range]
- Trust level: high | medium | low
- Lane used: spreadsheet triage | SQL slicing | notebook/statistical | summary-only

## Key findings
1. [Finding with magnitude]
2. [Finding with segment/context]
3. [Finding with likely implication]

## Supporting evidence
- [metric / segment / denominator / comparison]
- [metric / segment / denominator / comparison]
- [metric / segment / denominator / comparison]

## Caveats
- [missing data / sample bias / join risk / instrumentation change / seasonality]
- [confidence note]

## Recommended next actions
- [decision or follow-up slice]
- [dashboard / reporting handoff if needed]
- [instrumentation / data cleanup if trust is limited]
```

## Usage notes
- Keep observation separate from interpretation.
- Include denominator context whenever you compare rates.
- If confidence is low, say what is still trustworthy and what needs follow-up.
- If the user only asked for analysis, keep recommendations lightweight and evidence-tied.
