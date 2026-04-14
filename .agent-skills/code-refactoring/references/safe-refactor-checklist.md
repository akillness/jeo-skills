# Safe Refactor Checklist

Use this before broad or risky cleanup.

## Before editing
- State the structural problem in one sentence.
- Write down the intended behavior that must remain unchanged.
- Pick one refactor mode: local safe refactor, behavior freeze first, or repetitive migration / codemod.
- List existing safety signals: tests, typecheck, linter, screenshots, fixtures, golden outputs, or manual smoke steps.
- Decide what belongs in this diff versus a follow-up diff.

## During the change
- Keep mechanical cleanup separate from semantic behavior changes when possible.
- Prefer a sequence of small diffs or commits over one giant rewrite.
- Check for hidden references in config, docs, generated files, serialized names, or string lookups.
- Stop and reframe if the task turns into bug diagnosis instead of cleanup.

## Before saying it is done
- Re-run the chosen verification steps.
- Summarize what behavior was preserved and how you proved it.
- Name the risky edges that were checked explicitly.
- Call out what remains messy but intentionally untouched.
- Route the next step if review, debugging, testing policy, or profiling now owns the work.

## Smells that should trigger caution
- giant rename touching code, docs, config, and generated files at once
- weak or flaky tests around the target area
- unclear expected behavior
- dynamic references or reflection-heavy code
- temptation to mix redesign with cleanup in the same pass
