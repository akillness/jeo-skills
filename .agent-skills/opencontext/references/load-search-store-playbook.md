# OpenContext Load/Search/Store Playbook

## Core operating loop

```text
Load context → do the work → search when unsure → store conclusions
```

This skill is strongest when the operator treats OpenContext as a lightweight project-memory loop, not as a giant document dump.

## 1. Load before work
Use a manifest or folder scan to pull in the minimum relevant context.

Typical commands:
```bash
oc folder ls --all
oc context manifest <folder> --limit 10
oc search "<topic>" --mode keyword --format json
```

Questions to answer before doing work:
- Which folder holds the project or topic memory?
- Which 3-10 documents should the next agent read first?
- Are there already decisions or pitfalls recorded?

## 2. Search during work
Search when a task would otherwise trigger guesswork or re-explanation.

Good search targets:
- prior decisions
- acceptance criteria
- environment quirks
- architectural constraints
- release notes / known incidents

## 3. Store after meaningful work
Capture outcomes after a meaningful run, not after every tiny edit.

Good document types:
- `decision-log.md`
- `pitfalls.md`
- `release-notes.md`
- `acceptance-criteria.md`
- `handoff-<date>.md`

A useful stored note usually contains:
- what changed
- why that choice was made
- what to verify next
- links/citations to evidence

## 4. Update instead of duplicate
If the relevant document already exists, extend or refresh it instead of creating parallel files with the same purpose.

## 5. Handoff packet
When work passes to another agent or session, store a compact handoff packet:
- current objective
- constraints / decisions already made
- files or folders to read first
- next checks / open questions

## Anti-patterns
- dumping giant raw transcripts without extracting decisions
- storing everything in one mega document
- using OpenContext as a substitute for a real wiki when the need is long-lived synthesis
- rebuilding semantic search indexes without a reason or cost check
