---
name: audit-verify-explain-grade-5
description: >
  Audit work, verify claims with concrete evidence, and explain the result in simple grade-5
  language. Use when the user asks to review, audit, check, verify, explain a change, explain a
  fix, summarize test results, validate whether something works, or translate technical findings
  into plain language for non-technical readers.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Authored for Codex CLI workflows; portable to any agent with filesystem and shell access. Some steps need the tool named in the skill body (browser capture, ffmpeg, Gmail, X/Twitter, ElevenLabs).
license: MIT
metadata:
  tags: audit, verify, explain, grade, mengto-skills, codex-workflow
  version: "1.0"
  source: https://github.com/MengTo/Skills/tree/main/agent-skills/codex/audit-verify-explain-grade-5
---

# Audit, Verify, Explain

## When to use this skill


- The user asks you to review, audit, or check a change, fix, or claim before it is trusted.
- The user wants you to verify results with concrete evidence (tests, running the app, logs, screenshots, or artifacts) rather than assuming they work.
- The user asks you to summarize test results or validate whether something actually works.
- The user wants a technical finding, diff, or fix explained in simple, grade-5 language for a non-technical reader.
- Performance or improvement claims need to be checked against measured evidence instead of assumed.
- Do NOT use this skill for tasks that are purely about writing new code or content with no audit/verify/explain step, or when the user wants a highly technical, jargon-heavy explanation aimed at expert readers — route those to a standard implementation or writing workflow instead.

## Core Rule

Treat every answer as three jobs:

1. Audit what changed or what is being claimed.
2. Verify it with direct evidence.
3. Explain it like the reader is smart but new to the topic.

Do not skip verification when local files, commands, logs, tests, screenshots, or source data are available. Do not pretend something was verified if it was only inferred.

## Workflow

### 1. Audit

Start by finding the real source of truth:

- For code changes, inspect the diff, touched files, related call sites, and existing tests.
- For bug fixes, identify the before/after behavior and the user-facing path.
- For performance claims, separate measured evidence from likely improvement.
- For release or app behavior, check the packaged/running artifact when possible.
- For documents or content, compare the user request against the actual produced artifact.

Look for:

- obvious bugs or regressions
- missing edge cases
- stale assumptions
- unverified claims
- mismatches between implementation and user intent
- risks that a grade-5 explanation might accidentally hide

### 2. Verify

Prefer evidence in this order:

1. Automated tests, builds, linters, typechecks, or validators.
2. Running the actual app or workflow.
3. Logs, process checks, screenshots, generated artifacts, or live output.
4. Static code inspection when execution is impractical.
5. Clearly labeled inference when nothing stronger is available.

When verification fails, report the blocker and what it means. When verification is partial, say exactly what was and was not checked.

For performance work, avoid overclaiming. Say "this removes repeated work" only when the code clearly does so. Say "should improve" only when no timing trace was captured. Say "measured faster" only when before/after measurements exist.

### 3. Explain Simply

Use grade-5 language without talking down to the user:

- Use short sentences.
- Define technical terms in plain words.
- Use one simple analogy only if it genuinely helps.
- Say what changed, why it matters, and how to test it.
- Keep important caveats visible.

Prefer this shape:

```markdown
What changed:
- ...

Why it matters:
- ...

How I verified it:
- ...

What is still not proven:
- ...
```

For very small answers, use a short paragraph instead of forcing headings.

## Explanation Standards

Translate technical ideas like this:

- "cache" -> "remember the answer so we do not ask the same question again"
- "metadata" -> "small facts about a file, like size or modified date"
- "regression" -> "something that used to work but broke"
- "artifact" -> "the real file or app that was created"
- "static inspection" -> "reading the code without running it"

Do not say "everything works" unless the full workflow was tested. Say "the checked parts work" when verification covered only part of the system.

## Output Rules

Lead with the answer. Keep the tone calm and clear.

Include file paths, commands, commit hashes, test names, or log snippets when they are the evidence. Keep them brief.

Separate facts from judgment:

- Fact: "The tests passed."
- Judgment: "That gives confidence in the timeline planner, but not the full editor UI."

End with the most useful next test only when another test would materially improve confidence.

## References


- Upstream source: https://github.com/MengTo/Skills/tree/main/agent-skills/codex/audit-verify-explain-grade-5
- [agents/openai.yaml](agents/openai.yaml) — OpenAI/Codex interface metadata (display name, short description, default prompt) for this skill
