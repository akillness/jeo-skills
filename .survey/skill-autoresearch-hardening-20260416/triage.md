# Triage
- Problem: `skill-autoresearch` is useful but under-specified for modern repo maintenance loops: it lacks evals, does not freeze the evaluation harness strongly enough, and undersells the local keep-or-revert niche versus hosted eval platforms.
- Audience: maintainers of reusable agent skills, prompt/agent operators, and repo owners who need disciplined prompt/skill iteration without standing up LangSmith/Braintrust-style infrastructure.
- Why now: the hourly maintenance loop depends on autoresearch discipline, and the repo still has a support gap on this skill despite repeated use of the concept across other skill upgrades.
