# Hourly Knowledge Notes Generator

## Purpose
Generate deterministic Obsidian and LLM-Wiki markdown notes from a survey run directory.

## Command

```bash
python3 .agent-skills/survey/scripts/generate_hourly_knowledge_notes.py .survey/<slug>
```

## Outputs
- `.survey/<slug>/obsidian-note.md`
- `.survey/<slug>/llm-wiki-note.md`

## Contract
- Input is the survey directory path (not `evidence.json` path).
- `evidence.json` must exist under the survey directory.
- The notes include lane status/metrics and provenance labels for audit continuity.
