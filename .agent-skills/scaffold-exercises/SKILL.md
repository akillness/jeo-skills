---
name: scaffold-exercises
description: Use this skill when >
  Create exercise directory structures for educational content that comply with
  linting standards. Sections use XX-section-name/ naming, exercises use
  XX.YY-exercise-name/ with problem/, solution/, explainer/ variants. Use when
  creating course content or educational exercise structures.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Designed for ai-hero-cli course content structure. Validates with
  `pnpm ai-hero-cli internal lint`. Primarily for educational content creators
  building structured learning materials.
metadata:
  tags: education, exercises, scaffolding, course-content, linting, structure
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
---

# Scaffold Exercises

Create exercise directory structures that pass linting validation for educational content.

## When to use this skill

- Creating course sections and exercises for educational content
- Scaffolding structured learning materials with problem/solution variants
- Building content that must pass `pnpm ai-hero-cli internal lint`

## When not to use this skill

- General project scaffolding → use `file-organization`
- Documentation writing → use `technical-writing`

## Directory structure

```
exercises/
├── 01-introduction/
│   ├── 01.01-getting-started/
│   │   ├── problem/
│   │   │   ├── readme.md     (required, non-empty, has title)
│   │   │   └── main.ts       (optional, >1 line if present)
│   │   └── solution/
│   │       ├── readme.md
│   │       └── main.ts
│   └── 01.02-basic-concepts/
│       └── explainer/
│           └── readme.md
```

## Naming conventions

- Sections: `XX-section-name/` (two-digit number, lowercase, hyphens)
- Exercises: `XX.YY-exercise-name/` (section.exercise number, lowercase, hyphens)
- Variants: `problem/`, `solution/`, `explainer/`

## Required files per variant

Every variant folder needs:
- `readme.md` — non-empty, must have at least a title (`# Title`)
- `main.ts` — optional, but must be >1 line if present

## Workflow

### 1. Parse requirements

Identify section names, exercise names, and which variants are needed (problem, solution, explainer, or combinations).

### 2. Create directory hierarchy

```bash
mkdir -p exercises/01-section-name/01.01-exercise-name/problem
mkdir -p exercises/01-section-name/01.01-exercise-name/solution
```

### 3. Add stub readme files

```bash
# Minimum valid readme
echo "# Exercise: Getting Started\n\nComplete the task described below." > exercises/01-section-name/01.01-exercise-name/problem/readme.md
```

### 4. Validate

```bash
pnpm ai-hero-cli internal lint
```

### 5. Fix iteratively

The linter checks:
- Exercises have appropriate subfolders
- Readmes are non-empty with titles
- No broken links
- No prohibited files (`.gitkeep`, `speaker-notes.md`)

### Moving exercises

Use `git mv` (not `mv`) to rename directories — preserves git history:

```bash
git mv exercises/01-old-name exercises/01-new-name
```

## Instructions
1. Identify the task trigger and expected output.
2. Follow the workflow steps in this skill from top to bottom.
3. Validate outputs before moving to the next step.
4. Capture blockers and fallback path if any step fails.

## Examples
- Example: Apply this skill to a small scope first, then scale to full scope after validation passes.

## Best practices
- Keep outputs deterministic and auditable.
- Prefer small reversible changes over broad risky edits.
- Record assumptions explicitly.

## References
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
