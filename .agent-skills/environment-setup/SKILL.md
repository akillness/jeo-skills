---
name: environment-setup
description: >
  Organize application environment configuration: `.env` files, env precedence,
  typed env validation, secret handoff, framework-specific env rules, and config
  drift between local, staging, CI, and production. Use when the user needs help
  structuring environment variables, validating required config, separating
  public/private env values, or cleaning up env-file sprawl. This is the narrower
  app-config compatibility skill. Route broader runnable-machine, Docker,
  devcontainer, onboarding, and local-service setup work to `system-environment-setup`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best when the main problem is application configuration rather than whole-machine
  reproducibility: env files, config layering, schema validation, and secrets
  handoff boundaries.
metadata:
  tags: environment, env-files, dotenv, env-validation, config-management, secrets-handoff
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.1"
  source: akillness/jeo-skills
---

# Environment Configuration

Use this skill as the repository's **narrower application-config and `.env` compatibility skill**.

The job is to make app configuration clear and safe across environments:
- decide what belongs in env vars,
- structure `.env` files and precedence rules,
- validate required config,
- separate public/private values,
- reduce config drift between local, CI, staging, and production,
- make secret handoff explicit.

Read [references/env-patterns.md](references/env-patterns.md) and [references/scope-boundaries.md](references/scope-boundaries.md) before unusual cases or when deciding whether the real need belongs in `system-environment-setup`.

If the user mainly needs:
- **toolchains, local services, Docker Compose, devcontainers, or onboarding** → route to `system-environment-setup`
- **deployment or CI secret wiring** → pair with `deployment-automation`
- **security architecture or policy** → pair with `security-best-practices`

## When to use this skill
- Design `.env.example`, `.env.local`, or per-environment config structure
- Explain env precedence and which values should or should not be committed
- Validate required env vars with typed/runtime checks
- Separate server-only vs client-exposed env values
- Reduce drift between local, CI, staging, and production config
- Clean up a repo where env files, secret docs, and runtime expectations disagree
- Decide when env vars are enough and when secret-manager injection is needed

## When not to use this skill
- The main task is making the full repo runnable across machines → use `system-environment-setup`
- The main task is local service orchestration, Docker, or devcontainers → use `system-environment-setup`
- The main task is deployment automation or production rollout → use `deployment-automation`
- The main task is broader security review rather than config organization → pair with `security-best-practices`

## Instructions

### Step 1: Classify the config problem
Normalize the request into this intake first:

```yaml
env_config_intake:
  primary_goal: env-structure | validation | secret-handoff | public-private-split | drift-cleanup | framework-rules | unknown
  app_shape: backend | frontend | fullstack | monorepo | unknown
  current_storage: env-files | framework-config | secret-manager | mixed | unknown
  drift_surface:
    - missing-required-vars
    - duplicate-env-files
    - CI-local-mismatch
    - public-private-leak-risk
    - undocumented-secret-source
    - framework-prefix-confusion
    - unclear
  confidence: high | medium | low
```

### Step 2: Choose one primary mode
Pick exactly one mode for the run:

1. **env-file-structure**
   - Use when the main need is file layout, naming, and precedence.
2. **env-validation**
   - Use when missing or malformed values are causing runtime/build pain.
3. **secret-handoff-boundary**
   - Use when `.env` files are colliding with secret-manager or credential-delivery concerns.
4. **framework-config-rules**
   - Use when the main problem is framework-specific env behavior (public/private prefixes, build-time vs runtime exposure, etc.).
5. **drift-cleanup**
   - Use when env templates, docs, CI vars, and actual runtime expectations disagree.

### Step 3: Apply config rules
- Keep deploy-specific values out of source code and commit only safe templates.
- Separate **committed templates** from **developer-local values**.
- Make public/client-exposed env vars visually distinct from server-only values.
- Prefer typed validation when the app is large enough for env drift to be expensive.
- Record the source of secrets: local file, secret manager, CI variable, or cloud platform.
- Route outward when the actual blocker is machine setup, Docker, or local services rather than config design.

### Step 4: Build the config brief
Return this exact structure:

```markdown
# Environment Config Brief

## Recommended mode
- Mode: env-file-structure | env-validation | secret-handoff-boundary | framework-config-rules | drift-cleanup
- Why this mode fits: ...

## Current config surface
- App shape: ...
- Config sources: ...
- Main drift or risk: ...
- Confidence: high | medium | low

## Recommended config layout
1. ...
2. ...
3. ...

## Example files / checks
```bash
...
```

## Why this layout is safer
- ...
- ...

## Watch-outs
- ...
- ...

## Adjacent handoff
- Use `system-environment-setup` for ...
- Use `deployment-automation` for ...
- Use `security-best-practices` for ...
```

### Step 5: Use mode-specific guidance

**For env-file-structure**
- Define the committed template files first.
- Call out local-only overrides and ignored files explicitly.
- Make precedence easy to explain.

**For env-validation**
- Choose a schema/validation layer appropriate for the stack.
- Fail fast with clear missing-variable messages.
- Keep validation close to app startup.

**For secret-handoff-boundary**
- Name which values are safe in templates and which must come from a secret source.
- Document how a developer obtains sensitive values.
- Avoid pretending secret-manager adoption removes the need for local conventions.

**For framework-config-rules**
- Explain public/private env prefixes and build-time/runtime behavior.
- Call out framework-specific exposure risks.

**For drift-cleanup**
- Compare templates, runtime code, CI vars, and docs.
- Remove duplicate or stale env file conventions.
- Make one source of truth obvious.

### Step 6: Keep boundaries sharp
Before finalizing:
- Do **not** turn this into a Docker/devcontainer tutorial.
- Do **not** bury public/private env exposure risk.
- Do **not** assume `.env` files are enough for all secret workflows.
- Do **not** keep this as a peer duplicate of `system-environment-setup`; route broader setup work outward.

## Examples

### Example 1: Env template cleanup
Input: "Help me structure `.env.example` and `.env.local` so new devs stop guessing values."
Output: chooses `env-file-structure`, defines committed templates vs local overrides, and keeps the scope at app config.

### Example 2: Validation hardening
Input: "We keep forgetting env vars until runtime."
Output: chooses `env-validation`, recommends typed validation, and shows how to fail fast.

### Example 3: Framework split
Input: "Which env vars can be exposed to the frontend and which must stay server-only?"
Output: chooses `framework-config-rules`, explains the client/server split, and avoids broad setup drift.

## Best practices
1. Treat this as the app-config layer, not the whole-machine setup skill.
2. Make secret sources explicit rather than implied.
3. Prefer committed templates plus local-only overrides.
4. Add validation once env drift becomes expensive.
5. Route broader runnable-repo work to `system-environment-setup`.

## References
- [Environment patterns](references/env-patterns.md)
- [Scope boundaries](references/scope-boundaries.md)
- [Twelve-Factor config](https://12factor.net/config)
- [Next.js env guide](https://nextjs.org/docs/app/guides/environment-variables)
- [T3 Env intro](https://env.t3.gg/docs/introduction)
