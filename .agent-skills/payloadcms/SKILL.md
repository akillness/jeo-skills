---
name: payloadcms
description: >
  Operate Payload CMS (Next.js-native headless CMS) in repo workflows: bootstrap a Payload app,
  configure collections/globals, run local dev + migrations, and ship safe content-model changes.
  Use when the request mentions Payload CMS, payload config, collection schema, admin panel, or
  Next.js + headless CMS integration.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
metadata:
  tags: payloadcms,payload,cms,headless-cms,nextjs,backend,content-model,migration
  version: "1.0"
  source: https://github.com/payloadcms/payload
  license: MIT
---

# payloadcms — Payload CMS operator

> Keyword: `payload`, `payloadcms`, `headless cms`, `payload config`

## When to use this skill

- Set up a new Payload project (or add Payload into an existing Next.js app)
- Define or evolve collections, globals, access control, and field schemas
- Run/dev/test Payload locally and verify admin/API behavior
- Plan safe content-model migrations and rollback strategy
- Prepare production-ready Payload changes with explicit validation checks

## When not to use this skill

- Generic API contract work with no Payload runtime context → use `api-design`
- Auth architecture decisions outside Payload-specific setup → use `authentication-setup`
- Pure DB physical schema tuning without Payload model constraints → use `database-schema-design`
- Broad deployment orchestration not specific to Payload runtime → use `deployment-automation`

## Instructions

### Step 1) Identify the operating mode

Pick one primary mode before editing anything:

| Mode | Use when | Core output |
|---|---|---|
| Bootstrap | New install or first-time integration | working local Payload app |
| Modeling | Collection/global schema updates | reviewed model diff + migration notes |
| Runtime debug | Admin/API failing or misconfigured | root-cause + verified fix |
| Release prep | Production rollout request | risk/rollback + verification checklist |

### Step 2) Preflight checks

1. Verify runtime/toolchain in repo (`node`, package manager, framework layout)
2. Locate Payload config (`payload.config.*`) and model files
3. Confirm environment/secrets shape (`DATABASE_URI`, storage/auth keys)
4. Inspect existing migration history before schema edits

### Step 3) Execute smallest valid workflow

#### A. Bootstrap
- Install dependencies according to repo package manager
- Generate/init Payload configuration with minimal required collections
- Run local dev and verify both:
  - Admin UI loads
  - API responds for at least one collection

#### B. Modeling
- Edit one bounded model change at a time (field add/remove/type changes)
- Document blast radius: affected collections, API output, admin forms, seed/import jobs
- Prepare migration path and rollback path before merge

#### C. Runtime debug
- Reproduce in local or staging with concrete failing endpoint/page
- Check config, env bindings, access rules, and adapter wiring
- Verify fix with explicit before/after proof (endpoint + admin behavior)

#### D. Release prep
- Confirm migration order and downtime assumptions
- Add rollback notes (revert migration, restore backup, disable feature flags if used)
- Ensure verification list is executable in CI or staging smoke tests

### Step 4) Validation checklist

- Payload server starts without schema/runtime errors
- At least one modified collection/global is verified through API and admin
- Migration steps are deterministic and reversible
- Risk + rollback notes are present for production-bound changes

## Examples

### Example 1: Add a new collection safely

```text
Prompt: "Add a blog-post collection to our Payload app and keep migration risk low"

Mode:
- Modeling

Expected flow:
- Locate payload config and collection directory
- Add collection schema with access defaults
- Run local checks (admin + API)
- Document migration/rollback in PR notes
```

### Example 2: Debug broken admin panel route

```text
Prompt: "Payload admin page fails after yesterday's schema change"

Mode:
- Runtime debug

Expected flow:
- Reproduce failure
- Isolate misconfigured field/access/env issue
- Apply minimal fix
- Verify admin loads and affected API endpoint works
```

## Best practices

1. Keep model changes small and auditable per PR
2. Never merge schema changes without migration + rollback notes
3. Validate both admin UI and API surface for touched models
4. Prefer explicit access rules over implicit defaults
5. Treat environment binding and adapter configuration as first-class checks

## References

- Payload repo: https://github.com/payloadcms/payload
- Payload docs: https://payloadcms.com/docs/getting-started/what-is-payload
- Survey evidence run: `.survey/hourly-skill-candidates-20260427-095216/evidence.json`
