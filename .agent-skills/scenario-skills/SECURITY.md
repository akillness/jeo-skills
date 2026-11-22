# Security Policy

## Reporting a vulnerability

Do not report security vulnerabilities through public GitHub issues, discussions, or pull requests:
everything posted here is public and permanent.

Report privately instead, through either channel:

- Email support@scenario.com and put "security" in the subject line.
- Use in-app support at [app.scenario.com](https://app.scenario.com).

Include what an investigation needs: the affected surface (a skill or script in this repository, the
Scenario MCP server, or the Scenario platform), reproduction steps, and the impact you see. Scenario
support routes security reports to the right team and follows up through the same channel.

## Scope

This repository contains skill documents (markdown) and a small number of helper scripts; it runs no
service of its own. Reports that belong here include:

- a script shipped with a skill that does something unsafe,
- skill guidance that would lead an agent to expose credentials or other secrets,
- a supply-chain concern with the repository's tooling or CI.

Vulnerabilities in the Scenario platform itself (app.scenario.com, the MCP server at
mcp.scenario.com, the public API) go through the same private channels above, not through this
repository's issue tracker.

## Secrets in issues and pull requests

Signed asset URLs are credentials: never commit them and never paste them into issues or PRs. The
same goes for API keys, tokens, and anything else the issue templates flag. If you spot a secret
already exposed in this repository, report it privately rather than pointing to it in a public
issue.
