# Triage
- Problem: Hourly lane survey quality can drift, causing weak or unauditable recommendations.
- Audience: Maintainers of akillness/oh-my-skills hourly survey loop.
- Why now: Active open PR has no checks; we still need auditable survey cadence and stronger guardrails.

## Workflow Context
- Provenance used: indexed snippet and direct page retrieval.
- Mandatory lanes executed: 5/5.

## Affected Users
- Skill maintainers reviewing hourly candidate PRs.

## Current Workarounds
- Manual spot-check of lane quality and provenance.

## Adjacent Problems
- Open PR branches without CI checks block merge confidence.

## User Voices
- Development-first rule requires substantive procedural hardening every run.
