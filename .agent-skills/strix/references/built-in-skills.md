# Strix Built-In Skills

> Source: `strix/skills/` and https://docs.strix.ai/advanced/skills
> Last reviewed: 2026-03-28

## Important distinction

This repo's `strix` skill teaches an external AI agent how to operate the Strix CLI.

Strix itself also has internal skills. Those live inside the Strix project and are injected into Strix agents during a scan. They are not installed through `oh-my-skills`.

## How Strix uses internal skills

- Strix selects up to 5 relevant internal skills for a task
- The selected skill files are injected into the agent context
- This gives Strix specialized tactics, payloads, and validation guidance for the target

## Confirmed categories

### Vulnerabilities

Examples:

- `authentication_jwt`
- `idor`
- `sql_injection`
- `xss`
- `ssrf`
- `csrf`
- `xxe`
- `business_logic`
- `race_conditions`

### Frameworks

Examples:

- `fastapi`
- `nextjs`

### Technologies

Examples:

- `supabase`
- `firebase_firestore`

### Protocols

Examples:

- `graphql`

### Tooling

Examples:

- `nmap`
- `nuclei`
- `httpx`
- `ffuf`
- `subfinder`
- `naabu`
- `katana`
- `sqlmap`

## Related runtime tool model

Strix agents can combine internal skills with these runtime tools:

- Browser automation via Playwright-powered Chrome
- HTTP proxying and replay through a Caido-backed proxy
- Persistent bash terminals in the sandbox
- Python runtime for custom validation or exploit code
- File editing, notes, reporting, and optional web search

## Why this matters for this skill

When you prepare a Strix scan, give it targets, scope, credentials, exclusions, and focus areas. Do not try to manually micromanage every vulnerability trick that Strix internal skills already provide.

Instead:

1. Set the correct target mix
2. Pick the right scan mode
3. Provide precise instructions and authorization boundaries
4. Let Strix choose the internal skills that match the task
