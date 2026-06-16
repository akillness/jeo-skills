---
name: file-organization
description: "Design or refactor project structure around the right boundary unit: feature, shared layer, route segment, or workspace package. Use when a repo feels scattered, a team needs naming/import conventions, or the user must choose between type-based, feature-based, framework-colocated, and workspace layouts. Triggers on: file organization, folder structure, project structure, reorganize repo, feature folders, shared vs feature code, where should this file live, apps/packages split, and project layout refactor."
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for frontend, backend, fullstack, and developer-workflow repositories
  where the main problem is maintainable file boundaries and migration planning.
  Not for component API design, environment provisioning, or workflow/deployment
  automation.
license: MIT
metadata:
  tags: project-structure, folder-structure, feature-based-architecture, naming-conventions, monorepo, migration
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/jeo-skills
---

# File Organization

Use this skill when the main question is **"what structural boundary should this codebase use, and how do we move toward it without turning a reorg into chaos?"**

The job is not to dump a giant folder tree and pretend it fits every repo.
The job is to:
1. identify the real organizing unit,
2. separate feature/shared/framework/package boundaries,
3. define naming and import rules that prevent drift,
4. plan the migration safely,
5. return a structure brief another engineer or agent can apply immediately.

Read [references/boundary-decision-matrix.md](references/boundary-decision-matrix.md) before recommending a structure.
Read [references/migration-checklist.md](references/migration-checklist.md) before moving files or renaming directories.
Read [references/naming-and-import-rules.md](references/naming-and-import-rules.md) when the problem includes barrel files, alias paths, or team conventions.

## When to use this skill
- Choose a maintainable folder strategy for a new repo or app
- Refactor a repo whose `components/`, `hooks/`, `utils/`, and `store/` folders no longer match business boundaries
- Decide whether code belongs in a feature module, shared layer, route segment, or workspace package
- Review structure drift before a large reorganization or migration
- Standardize naming, import paths, and ownership rules across a growing team
- Decide whether a monorepo/workspace split is justified or premature
- Produce a migration plan that minimizes broken imports, duplicate files, and half-finished moves

## When not to use this skill
- **The main task is designing reusable component APIs, variants, or slot/primitive composition** → use `ui-component-patterns` or `design-system`
- **The main task is framework state ownership, cache/store boundaries, or URL/form/server-state placement** → use `state-management`
- **The main task is making the repo runnable across machines, services, toolchains, or containers** → use `system-environment-setup`
- **The main task is task runners, bootstrap scripts, hooks, or local-CI command design** → use `workflow-automation`
- **The main task is deployment topology or hosted CI/CD rollout** → use `deployment-automation` or `vercel-deploy`
- **The repo only needs a tiny mechanical file move with no architectural decision**; in that case implement the move directly instead of reopening structure design

## Instructions

### Step 1: Classify the structural pressure before drawing folders
Normalize the request into this intake first:

```yaml
structure_intake:
  repo_shape: single-app | app-plus-api | monorepo | library-cli | content-site | unknown
  current_pattern: type-based | feature-based | route-colocated | package-workspace | mixed | unknown
  main_pressure:
    - scattered-feature-code
    - unclear-shared-boundaries
    - framework-routing-collision
    - premature-monorepo-split
    - monorepo-needed-now
    - naming-drift
    - import-chaos
    - migration-risk
    - onboarding-confusion
    - unknown
  change_scope: greenfield | incremental-refactor | major-reorg | audit-only
  primary_boundary_unit: feature | shared-layer | route-segment | package | unknown
  confidence: high | medium | low
```

If the user is vague, prefer the smallest obvious interpretation and state the assumption.

### Step 2: Choose one primary organization mode
Pick exactly one primary mode for the current run:

1. **starter cleanup**
   - Use when a type-based starter tree is still small enough to fix before it calcifies.
2. **feature modularization**
   - Use when business areas are spread across technical folders and need feature ownership.
3. **framework colocation**
   - Use when Next.js / similar router conventions should guide route-segment placement.
4. **shared layer governance**
   - Use when the repo already has features, but shared code keeps leaking everywhere.
5. **workspace split**
   - Use when multiple runnable apps/services/packages justify `apps/` + `packages/` boundaries.
6. **migration audit**
   - Use when the repo needs a safe move plan more than a brand-new structure proposal.

### Step 3: Choose the smallest boundary unit that solves the problem
Use these rules:

- Prefer **feature folders** when the same business area touches components, hooks, data access, tests, and state together.
- Prefer **shared layers** only for code reused by multiple features with stable ownership.
- Prefer **framework colocation** when routing/layout/file-convention semantics are part of the architecture, not just file storage.
- Prefer **workspace packages** only when there are multiple deployable apps/services, reusable libraries, or independent dependency/runtime needs.
- Do not promote a package split just because the repo feels messy; many repos need better feature/shared rules, not a monorepo.
- Keep **generated artifacts, docs, scripts, and tests** explicit instead of burying them in ambiguous utility folders.

### Step 4: Apply the decision ladder
#### Use feature modularization when
- understanding one user-facing capability currently requires opening files across many technical folders
- changes in one domain repeatedly touch `components/`, `hooks/`, `utils/`, `api/`, and `store/`
- the team needs clear ownership per feature or business area

#### Use framework colocation when
- route segments, loaders, layouts, server/client boundaries, or file conventions shape where code must live
- the framework docs already define special files or reserved paths
- the real goal is to organize around routes/features without fighting the framework

#### Use shared layer governance when
- the repo already has features, but shared folders have become a dumping ground
- teams keep asking whether something is truly shared or just reused twice
- import paths and barrel files make boundaries hard to see

#### Use workspace split when
- the repo contains multiple apps/services/packages with distinct dependencies or runtime targets
- shared libraries need versioned or explicit package boundaries
- build/test/deploy concerns are meaningfully different per package

#### Use migration audit when
- the structure idea is mostly known but the move would break imports, docs, tests, or ownership if done casually
- the team needs staged moves, aliases, codemods, or compatibility shims

### Step 5: Keep structural boundaries honest
A good structure recommendation says what it does **not** own.

Examples:
- if the real pain is reusable component primitives and API shape, route to `ui-component-patterns`
- if the real pain is design-token / library-wide UI governance, route to `design-system`
- if the real pain is runtime/services/toolchain setup, route to `system-environment-setup`
- if the real pain is recurring scripts and task entrypoints, route to `workflow-automation`
- if the real pain is state/caching ownership, route to `state-management`

Mixed requests are normal. Split them explicitly instead of forcing one folder strategy to solve everything.

### Step 6: Set reusable naming and import guardrails
Any recommended structure should name these rules explicitly:

- **Directory purpose** — what belongs here and what does not
- **Naming style** — folder and file case conventions
- **Shared vs feature rule** — when code graduates into shared folders/packages
- **Public API rule** — whether features/packages export through one boundary file
- **Import rule** — whether deep imports across sibling features are forbidden
- **Test/doc/story placement rule** — colocated with feature or centralized by policy

Bad smells:
- `utils/` or `shared/` becoming a junk drawer
- feature code spread across five top-level technical folders
- barrel files that erase ownership and encourage deep implicit coupling
- moving to `apps/` + `packages/` without a real package/runtime boundary
- framework special files mixed with unrelated domain logic with no colocation rule

### Step 7: Plan the migration before changing files
Before moving anything, produce a change plan that covers:

1. current hotspots and why they are painful
2. target boundary model
3. staged move order
4. alias/import or barrel compatibility strategy
5. test/build/docs verification steps
6. rollback or partial-adoption safety

Prefer incremental refactors over one huge rename when the repo is active.

### Step 8: Produce the file-organization brief
Return a concise artifact someone can act on immediately.

Preferred format:
```markdown
# File Organization Brief

## Mode
- Primary mode:
- Why this mode fits:

## Boundary choice
- Primary organizing unit:
- What belongs in feature/shared/route/package boundaries:
- What stays out of scope:

## Recommended structure
- Top-level folders/packages:
- One example feature/package layout:
- Naming/import rules:

## Migration plan
1. First step
2. Second step
3. Verification step

## Handoffs
- Adjacent skills:
- Risks / follow-up work:
```

### Step 9: Prefer clarity over template worship
When modernizing an existing structure:
- keep the recommendation tied to current repo pressures, not a fashionable template
- use framework conventions where they help, but do not confuse framework files with the whole architecture
- move code toward the smallest durable boundary model
- treat naming/import rules as part of the architecture, not cleanup trivia
- preserve transferable principles that work across frontend, backend, and fullstack repos

## Output format
Always return a **file organization brief**, **repo structure recommendation**, or **migration audit**.

Required qualities:
- classify the structure problem before prescribing a tree
- choose one primary organization mode
- name the boundary unit explicitly
- include route-outs to adjacent skills
- provide naming/import guardrails
- include a migration plan when the repo already exists

## Examples

### Example 1: Type-based starter tree is collapsing
**Input**
> We have `components`, `hooks`, `utils`, and `store`, but every checkout change touches all four folders. How should we reorganize this React app?

**Good output direction**
- mode: `feature modularization`
- recommend feature folders for checkout/auth/catalog with a small shared layer
- add a rule for when code is allowed to move into shared
- keep state-ownership specifics routed to `state-management`

### Example 2: Next.js route folders are getting messy
**Input**
> Our Next.js app router repo mixes route files, data helpers, and business logic all over `app/`. We need a clean structure that still respects framework conventions.

**Good output direction**
- mode: `framework colocation`
- keep special route files where Next.js expects them
- colocate route-local code with route segments, move reusable domain logic into feature/shared boundaries outside route-only files
- mention route groups/private folders if they help organize without changing the URL

### Example 3: Team wants to split into packages
**Input**
> Should this repo become `apps/` and `packages/`? We now have a web app, worker, and shared UI library.

**Good output direction**
- mode: `workspace split`
- justify package boundaries by runnable targets and shared libraries
- recommend `apps/` for deployables and `packages/` for reusable libraries/tooling
- include migration and verification steps instead of only drawing the final tree

## Best practices
1. Start from the pressure on the repo, not from a favorite architecture meme.
2. Prefer the smallest boundary model that reduces change amplification.
3. Treat shared code as a governed exception, not the default landing zone.
4. Let framework conventions inform structure, but do not let them become accidental junk drawers.
5. Split into packages only when dependencies, runtimes, or deployables truly require it.
6. Name import and public-API rules early; they are part of the organization system.
7. Use staged migrations and verification steps for live repos.

## References
- [Feature-Sliced Design folder-structure article](https://feature-sliced.design/blog/frontend-folder-structure)
- [Bulletproof React README](https://raw.githubusercontent.com/alan2207/bulletproof-react/master/README.md)
- [Bulletproof React project structure](https://raw.githubusercontent.com/alan2207/bulletproof-react/master/docs/project-structure.md)
- [Next.js project structure docs](https://nextjs.org/docs/app/getting-started/project-structure)
- [Turborepo repository structure docs](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
- [MIT Comm Lab file structure guidance](https://mitcommlab.mit.edu/broad/commkit/file-structure/)
