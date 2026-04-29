# Context

## Workflow Context
- hourly cron runs survey-first candidate discovery across five keyword families.
- current gating is strong on license/freshness/signal floor, but maintenance evidence fields are under-specified in markdown outputs.

## Affected Users
- repo maintainer reviewing recurring PRs
- future agents trying to compare why candidate selection changed run-to-run

## Current Workarounds
- rely on raw evidence.json for extra metadata
- infer maintenance quality ad hoc from repo page before merge

## Adjacent Problems
- noisy keyword hits in generic 'skills' repos
- false confidence when only stars are reported

## User Voices
- direct page retrieval: https://docs.github.com/en/rest/repos/repos#get-a-repository (maintenance metadata fields)
- direct page retrieval: https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories
- direct page retrieval: https://docs.github.com/en/rest/licenses/licenses#get-all-commonly-used-licenses