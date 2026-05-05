---
name: setup-pre-commit
description: Use this skill when >
  Configure automated code quality checks at commit time using Husky and lint-staged.
  Sets up pre-commit hooks for formatting (Prettier), type checking, and tests.
  Adapts to existing project configurations and omits missing scripts gracefully.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Works with npm, yarn, pnpm, and bun. Requires Node.js project with package.json.
  Husky v9+ (no shebangs needed in hook files). Pairs with git-workflow and
  git-guardrails-claude-code.
metadata:
  tags: git-hooks, pre-commit, husky, lint-staged, prettier, code-quality, automation
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
---

# Setup Pre-Commit

Configure automated code quality checks at commit time using Husky and lint-staged.

## When to use this skill

- Setting up a new project's commit-time quality gates
- Adding formatting and type checking to an existing project
- Standardizing pre-commit behavior across a team

## When not to use this skill

- CI pipeline setup → use `deployment-automation`
- Git workflow strategy → use `git-workflow`
- Full testing strategy → use `testing-strategies`

## Installation process

### Step 1 — Detect package manager

```bash
# Check for lockfiles in order of precedence
ls package-lock.json  # npm
ls yarn.lock          # yarn
ls pnpm-lock.yaml     # pnpm
ls bun.lockb          # bun
```

### Step 2 — Install dependencies

```bash
# npm
npm install --save-dev husky lint-staged prettier

# pnpm
pnpm add -D husky lint-staged prettier

# yarn
yarn add -D husky lint-staged prettier
```

### Step 3 — Initialize Husky

```bash
npx husky init
```

This creates `.husky/` directory and adds a `prepare` script to `package.json`.

### Step 4 — Create the pre-commit hook

Create `.husky/pre-commit`:

```sh
npx lint-staged
npm run typecheck  # omit if script doesn't exist
npm test           # omit if script doesn't exist
```

Note: Husky v9+ doesn't need shebangs in hook files.

### Step 5 — Configure lint-staged

Create `.lintstagedrc`:

```json
{
  "**/*": "prettier --write --ignore-unknown"
}
```

### Step 6 — Configure Prettier (if absent)

Create `.prettierrc` only if it doesn't exist:

```json
{
  "tabWidth": 2,
  "printWidth": 80,
  "singleQuote": false,
  "trailingComma": "es5",
  "semi": true,
  "arrowParens": "always"
}
```

### Step 7 — Verify

```bash
git add -A
git commit -m "test: verify pre-commit hooks"
```

Watch for: lint-staged formatting, typecheck passing, tests passing.

## Execution order

lint-staged runs first (fast, only staged files) → typecheck (full project) → tests (full suite)

If `typecheck` or `test` scripts don't exist in `package.json`, omit those lines from the pre-commit hook.

## Instructions
1. Identify the task trigger and expected output.
2. Follow the workflow steps in this skill from top to bottom.
3. Validate outputs before moving to the next step.
4. Capture blockers and fallback path if any step fails.

## Examples
- Example: Apply this skill to a small scope first, then scale to full scope after validation passes.

## Best practices
- Keep outputs deterministic and auditable.
- Prefer small reversible changes over broad risky edits.
- Record assumptions explicitly.

## References
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
