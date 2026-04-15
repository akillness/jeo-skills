# Context: skill-autoresearch hardening

## Workflow Context
`skill-autoresearch` sits in the same workflow family as prompt/app evaluation systems such as LangSmith, Promptfoo, DeepEval, Braintrust, and OpenAI Evals: define a representative dataset, run repeatable checks, compare baseline versus changes, and catch regressions before shipping. The distinctive repo-local niche is narrower and more practical: mutate one `SKILL.md` at a time, freeze the evaluator for the run, log every attempt, and keep only measured improvements instead of relying on vibes or memory.

Real-world usage is still messy. Practitioner reports show teams mixing Promptfoo, ad hoc Python scripts, observability tools, PR comments, and spreadsheets. For many teams the actual job is not “full prompt optimization platform adoption”; it is a small repeatable loop using real failure cases, simple pass/fail checks, and a changelog strong enough for handoff.

Sources:
- LangSmith evaluation concepts: https://github.com/langchain-ai/langsmith-docs/blob/main/docs/evaluation/concepts/index.mdx
- Promptfoo CI/CD: https://github.com/promptfoo/promptfoo/blob/main/site/docs/integrations/ci-cd.md
- Promptfoo coding-agent evals: https://github.com/promptfoo/promptfoo/blob/main/site/docs/guides/evaluate-coding-agents.md
- OpenAI Evals README/docs: https://github.com/openai/evals
- Upstream autoresearch-skill: https://github.com/olelehmann100kMRR/autoresearch-skill/blob/main/SKILL.md
- HN eval practice thread: https://news.ycombinator.com/item?id=47319587
- HN prompt-testing thread: https://news.ycombinator.com/item?id=41019748

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Skill maintainer | Improve a reusable `SKILL.md` without breaking trigger quality or execution clarity | Intermediate |
| Prompt / agent operator | Compare prompt/skill variants and catch regressions before rollout | Intermediate |
| Repo maintainer / CI owner | Keep eval artifacts, logs, and support files reviewable in git | Intermediate-advanced |
| OSS collaborator | Understand why a skill change was kept or reverted from append-only logs | Intermediate |
| AI ops / eval owner | Build lightweight offline eval loops without standing up a hosted platform first | Advanced |

## Current Workarounds
1. Hosted evaluation platforms such as LangSmith, Braintrust, Weave, and TruLens for datasets, experiment comparison, and scoring dashboards.
   - Limitation: strong for eval infrastructure, weak for direct `SKILL.md` mutation workflows.
2. CLI-first prompt evaluation tools such as Promptfoo or DeepEval.
   - Limitation: excellent at benchmark execution, but they do not inherently preserve the repo-local keep/discard narrative for skill rewrites.
3. Ad hoc Python scripts plus observability tooling.
   - Limitation: easy to start, easy to drift, and hard to hand off.
4. Spreadsheets / PR comments / manual pass-fail review.
   - Limitation: practical, but weak on repeatability and artifact reuse.
5. Real-failure logging turned into tiny scripted suites.
   - Limitation: often works well, but teams rarely freeze the evaluator or record rejected mutations cleanly.

## Adjacent Problems
- Evaluator reliability and LLM-as-judge drift.
- Dataset drift when the benchmark changes mid-loop.
- Agent non-determinism across tool calls and retries.
- Blindness to intermediate behavior, cost, and latency when only final text is scored.
- Architecture/tooling confounds where “prompt quality” is mixed with runtime or tool affordances.
- Missing append-only repo-local experiment memory even when dashboards exist.

## User Voices
> “We make a spreadsheet. A column for input, expected output, actual output, one for manual evaluation (pass/partial/fail).” — HN practitioner on prompt testing  
https://news.ycombinator.com/item?id=41019748

> “I do my best with my initial prompt and then I have the ‘business’ test it and I log phrases that they use. I then make those phrases my scripted test suite.” — HN practitioner on AI evals  
https://news.ycombinator.com/item?id=47319587

> “mix of promptfoo and ad-hoc python scripts, with langfuse observability. Definitely not happy with it...” — HN practitioner on current stack  
https://news.ycombinator.com/item?id=47319587

> “Essentially all I needed was a way to upload a data set, run tests against that data set and spit out a percentage of pass fail.” — HN practitioner on eval platform value  
https://news.ycombinator.com/item?id=47319587
