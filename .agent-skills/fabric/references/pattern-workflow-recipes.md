# Fabric pattern workflow recipes

These recipes show the intended operator posture: **clean input + one clear transform + realistic next step**.

## 1. Transcript summary
```bash
cat transcript.txt | fabric -p summarize
```
Use when the text already exists and the first pass is a readable summary.

Add a second step only if needed:
```bash
cat transcript.txt | fabric -p summarize > summary.md
cat summary.md | fabric -p extract_wisdom
```

## 2. Clipboard to extraction workflow
```bash
pbpaste | fabric -p extract_wisdom
```
Good for articles, notes, or copied snippets already in the clipboard.

## 3. Code or diff explanation
```bash
git diff HEAD~1 | fabric -p explain_code
```
Useful when the job is understanding or summarizing code/text, not editing the repo.

## 4. Logs to first-pass analysis
```bash
tail -200 app.log | fabric -p analyze_logs
```
This is a first-pass triage step. Route deeper root-cause work to debugging/log-analysis workflows if needed.

## 5. Custom pattern skeleton
Directory layout:
```text
~/.config/fabric/patterns/my-pattern/
└── system.md
```

Minimal scaffold:
```text
# IDENTITY AND PURPOSE
You are an expert at ...

# STEPS
1. ...
2. ...

# OUTPUT INSTRUCTIONS
- Output Markdown only.
- Use these sections: ...

# INPUT
INPUT:
```

## 6. REST/server mode
```bash
fabric --serve
curl http://localhost:8080/patterns/names
```
Use when another local tool or script needs HTTP access to patterns or chat endpoints.

## Pattern-choice reminders
- choose **summary** patterns when compression is the job,
- choose **extract** patterns when ideas/claims/actions are the job,
- choose **explain/analyze** patterns when interpretation is the job,
- fork a **custom pattern** when the workflow repeats and output shape matters.
