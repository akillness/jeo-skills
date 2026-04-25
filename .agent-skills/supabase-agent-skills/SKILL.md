---
name: supabase-agent-skills
description: >
  Install and use Supabase Agent Skills (`supabase/agent-skills`) with AI coding
  agents. Covers install modes, skill selection, plugin path, verification, and
  safe fallback for direct Supabase CLI/database workflows.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
license: MIT
metadata:
  tags: supabase, postgres, agent-skills, ai-agent, database, backend, cli
  version: "1.0"
  source: https://github.com/supabase/agent-skills
---

# supabase-agent-skills

Use this skill when the task involves enabling Supabase workflows for AI agents using the open-source `supabase/agent-skills` package.

## When to use
- Install Supabase skill packs for Claude/Codex/Copilot/Cursor style agents
- Select only specific Supabase skills instead of bulk install
- Verify that skill installation succeeded before relying on generated code
- Route to direct SQL/CLI checks when skill loading is unavailable

## Instructions

### Step 1: Verify prerequisites
- Confirm Node.js and npm/npx are available.
- Confirm project actually uses Supabase/Postgres before installing extra skills.

```bash
node -v
npm -v
```

### Step 2: Install skill package
Use one of these paths:

```bash
# Install all Supabase skills
npx skills add supabase/agent-skills

# Install specific skill only
npx skills add supabase/agent-skills --skill supabase
npx skills add supabase/agent-skills --skill supabase-postgres-best-practices
```

### Step 3: Optional Claude plugin path
If using Claude plugin workflow:

```bash
claude plugin marketplace add supabase/agent-skills
claude plugin install supabase@supabase-agent-skills
```

### Step 4: Verify and smoke test
- Confirm installed skill list includes Supabase entries.
- Run one bounded task (schema introspection or query review) and inspect output quality.
- If results are weak, fall back to direct commands and SQL inspection.

### Step 5: Fallback strategy
When agent skill loading is unavailable:
- Use direct Supabase CLI and SQL workflow.
- Keep migration/review steps explicit; do not rely on hidden agent assumptions.

## Guardrails
- Do not run destructive SQL/migrations without explicit confirmation.
- Prefer read-only verification first (`SELECT`, schema introspection, dry-run if available).
- Keep credentials in environment/secret manager; never hardcode tokens in repo files.

## Evidence
- direct page retrieval: https://github.com/supabase/agent-skills
- direct page retrieval: https://supabase.com/docs/guides/getting-started/ai-skills
