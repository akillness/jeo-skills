# Source and evidence

Source snapshot: [upstash/context7 commit `5c4a4b43cd5010f5678c6fceac3dd16865112e67`](https://github.com/upstash/context7/tree/5c4a4b43cd5010f5678c6fceac3dd16865112e67), observed 2026-11-13. The repository is MIT licensed. The public repo hosts MCP source; the cloud backend, crawler and parser are not included.

- [README](https://github.com/upstash/context7/blob/5c4a4b43cd5010f5678c6fceac3dd16865112e67/README.md): mode selection, remote MCP URL and repository scope.
- [CLI guide](https://github.com/upstash/context7/blob/5c4a4b43cd5010f5678c6fceac3dd16865112e67/docs/clients/cli.mdx): commands, auth, setup writes, on-prem restrictions and Node requirement.
- [API guide](https://github.com/upstash/context7/blob/5c4a4b43cd5010f5678c6fceac3dd16865112e67/docs/api-guide.mdx): endpoint names, authentication, version fallback and errors.
- [MCP entrypoint](https://github.com/upstash/context7/blob/5c4a4b43cd5010f5678c6fceac3dd16865112e67/packages/mcp/src/index.ts) and [query-code schema](https://github.com/upstash/context7/blob/5c4a4b43cd5010f5678c6fceac3dd16865112e67/packages/mcp/src/lib/query-code-tool.ts): transports, experimental tool gating and source operations.
- [Upstream MCP skill](https://github.com/upstash/context7/blob/5c4a4b43cd5010f5678c6fceac3dd16865112e67/skills/context7-mcp/SKILL.md): source-lookup workflow and caveats.

This is a source inspection, not runtime validation of any installed CLI, remote server, credentials, quota, network connection, package version or external documentation accuracy. Upstream releases and deployed service capabilities can change independently; recheck their current documentation and advertised schemas before execution.
