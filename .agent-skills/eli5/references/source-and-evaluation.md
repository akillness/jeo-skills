# Source, License, and Evaluation

## Pinned source

- Repository: `https://github.com/DreambigOu/ELI5`
- Commit: `a766623b062331fdde53467001379b4ddf3acc2f`
- Default branch: `main`
- Audited tree: one prompt skill plus a Python A/B evaluation workspace
- Audit date: 2026-08-30

The upstream skill supplies the central audience-calibration idea, age,
education, role, and relationship profiles, a what-analogy-details-so-what
structure, and worked examples. This adaptation narrows routing against the
existing jeo-skills catalog, preserves safety caveats, and separates pure
explanation from evidence audit and technical-document authoring.

## License and attribution

The upstream repository contains a standard MIT license whose copyright line is
literally `Copyright (c) 2026` and names no holder. Attribute the source to
DreambigOu / Andrew Ou and retain the notice below with substantial copies or
adaptations.

```text
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Primary license source:
https://github.com/DreambigOu/ELI5/blob/a766623b062331fdde53467001379b4ddf3acc2f/LICENSE

## Upstream evaluation shape

The upstream `eli5-workspace/` contains:

- three prompts: database index for age five, web-app codebase for a manager,
  and Git merge conflicts for a fifth grader;
- four assertions per prompt;
- an A/B runner that invokes `claude -p` for a skill configuration and a
  baseline configuration;
- a second model pass that grades each response against the assertions;
- iteration folders containing responses, timing, grading, summaries, and
  config.

The upstream repository reports large improvements in its own documented runs.
Treat those figures as upstream self-reported evidence, not a guarantee for a
different model, prompt, source document, language, or audience.

## Evaluation risks and portability notes

The upstream runner is useful as a pattern, but do not copy or run it blindly:

- it defaults to `~/.claude/skills/eli5/SKILL.md`;
- it writes `iteration-N/` next to the runner;
- each case uses multiple metered Claude CLI calls for generation and grading;
- the model response is embedded into the judge prompt;
- a response containing grade-like text can influence a naive parser;
- LLM-as-judge scores need deterministic checks and human review.

This jeo-skills adaptation therefore ships only an offline schema validator for
its eval contract:

```bash
node .agent-skills/eli5/scripts/validate-evals.mjs
```

The validator checks structure, unique IDs, prompts, expected outputs, and
assertions. It does not call a model and does not claim that the explanation
quality passed.

## Recommended evaluation workflow

1. Freeze the skill revision, model, system prompt, source material, language,
   audience, and output constraints.
2. Use a small set of clearly different audiences and at least one route-out.
3. Run skill and baseline in isolated, equivalent contexts.
4. Save raw responses and timing outside the skill folder.
5. Apply deterministic checks first: length, required or forbidden terms,
   headings, code blocks, and source citations where appropriate.
6. Use a judge only for semantic qualities such as analogy fit, dignity, and
   audience calibration.
7. Delimit untrusted response text and require structured judge output.
8. Blind human reviewers to A/B labels when possible.
9. Report per-assertion evidence, not only an aggregate percentage.
10. Keep failures and near misses; do not tune only to the three original
    examples.

## Local eval coverage

The bundled `evals/evals.json` adds cases for:

- default age-five behavior;
- manager framing;
- fifth-grade sequential explanation;
- technical expert depth;
- respectful partner or parent framing;
- explicit audit and verification route-out;
- tutorial and runbook route-out;
- safety-critical caveat preservation;
- avoiding condescension when the user says "dumb it down."

These cases test routing and output contracts. They are not a substitute for
running representative audience evaluations.

## Primary sources

- Pinned skill: https://github.com/DreambigOu/ELI5/blob/a766623b062331fdde53467001379b4ddf3acc2f/skills/eli5/SKILL.md
- Pinned eval cases: https://github.com/DreambigOu/ELI5/blob/a766623b062331fdde53467001379b4ddf3acc2f/eli5-workspace/evals.json
- Pinned eval runner: https://github.com/DreambigOu/ELI5/blob/a766623b062331fdde53467001379b4ddf3acc2f/eli5-workspace/run-evals.py
- Upstream evaluation notes: https://github.com/DreambigOu/ELI5/blob/a766623b062331fdde53467001379b4ddf3acc2f/eli5-workspace/eval-results.md
