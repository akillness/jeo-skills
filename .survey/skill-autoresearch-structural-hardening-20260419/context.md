# Context: skill-autoresearch structural hardening

## Workflow Context
Repo-local eval loops now show up well beyond prompt tinkering. GitHub Models pushes prompt/version comparison and side-by-side evaluation for developer workflows, Genkit ties prompt changes to runtime traces and A/B-style evaluation for web/fullstack AI apps, Atlassian postmortems treat SOP improvement as a written record plus tracked follow-up actions for PM/ops, HubSpot workflows normalize trigger/action/publish loops for marketing automation, and HacknPlan connects living design docs to executable work for game production.[GitHub Models](https://github.com/features/models) [Genkit Evaluation](https://firebase.google.com/docs/genkit/evaluation) [Atlassian Postmortems](https://www.atlassian.com/incident-management/handbook/postmortems) [HubSpot Workflows](https://knowledge.hubspot.com/workflows/create-workflows) [HacknPlan](https://hacknplan.com/)

For this repo, `skill-autoresearch` is the local answer when the mutable artifact is a reusable markdown skill or workflow document and the maintainer needs git-reviewable evidence instead of only a hosted dashboard.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Skill maintainer | Improve trigger wording, boundary clarity, support files, and evals for repo-local skills | intermediate to advanced |
| Fullstack AI builder | Tie prompt/skill changes to deterministic checks instead of ad hoc playground edits | intermediate |
| PM / ops maintainer | Ratchet runbooks, postmortem templates, and SOP packets without moving the judge mid-run | intermediate |
| Marketing ops maintainer | Tighten trigger/action templates and reusable automation docs while preserving publish discipline | intermediate |
| Game production lead | Improve milestone / GDD / launch-support workflows with durable keep-or-revert history | intermediate |

## Current Workarounds
1. Treat prompts or skills as pseudo-code in Git, then compare outputs manually or with lightweight eval tooling.
   - Limitation: baseline, scoring rules, and narrative rationale often drift across commits.
2. Use hosted eval tools for runs, but export CSV/JSON/HTML to spreadsheets or custom review docs.
   - Limitation: the platform stores experiment results, but not always the repo-local why-kept / why-reverted story.
3. Improve SOPs and templates through postmortem notes, Jira tickets, or wiki pages.
   - Limitation: the run contract, rejected directions, and final ratchet can be split across multiple tools.
4. Rewrite skills ad hoc after a bad trigger or support-gap incident.
   - Limitation: maintainers can rediscover the same failed edits because failed mutations are not logged.

## Adjacent Problems
- Evaluator drift when prompts, tests, and scoring rules change inside one run.
- Surface-sync drift when `SKILL.md`, `SKILL.toon`, manifests, and README/setup text stop matching.
- Overbroad trigger descriptions that turn a skill into a catch-all.
- Loss of rejected experiments and baseline snapshots.
- Confusion between repo-local skill ratcheting, hosted prompt/app eval suites, and GPU-bound ML `autoresearch`.

## User Voices
- “Run side-by-side evaluations to compare outputs from industry-leading models in real time. No guesswork, just better results.” — [GitHub Models](https://github.com/features/models)
- “Manage prompts like code — Version, share, and reuse your prompts across projects.” — [GitHub Models](https://github.com/features/models)
- “Genkit tooling helps you automatically extract data including inputs, outputs, and information from intermediate steps to evaluate the end-to-end quality of LLM responses...” — [Genkit Evaluation](https://firebase.google.com/docs/genkit/evaluation)
- “A postmortem is a written record of an incident” with “Follow-up actions taken to prevent the incident from happening again.” — [Atlassian Postmortems](https://www.atlassian.com/incident-management/handbook/postmortems)
- “Plan by Discipline, Ship as One Team” and “Turn Game Design Into Executable Work.” — [HacknPlan](https://hacknplan.com/)
