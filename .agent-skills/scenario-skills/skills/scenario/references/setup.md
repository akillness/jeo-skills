# Connection setup

Endpoint: `https://mcp.scenario.com/mcp` (Streamable HTTP). Every fact here is also on the public
[connection guide](https://mcp.scenario.com/docs) and
[troubleshooting page](https://mcp.scenario.com/docs/troubleshooting); when they disagree with this
file, they win.

## Transport: native HTTP first

Clients with native Streamable HTTP support connect to the URL directly; that is the reliable path.
`mcp-remote` (`npx mcp-remote@latest https://mcp.scenario.com/mcp`) is a stdio bridge for clients
without native HTTP, it needs Node.js installed, and it is the usual source of repeated sign-in
prompts and tokens that never persist. A client that offers both takes the native URL configuration.

## OAuth (preferred)

Add the endpoint and sign in with a Scenario account when the client prompts; no credentials pass
through the conversation.

Claude apps (claude.ai, Claude Desktop, and Claude Code signed in with the same Claude account): one
custom connector serves all three. Free, Pro or Max: on claude.ai, Customize, Connectors, Add, Add
custom connector, the URL, then OAuth in the browser (Free allows one). Team or Enterprise: an
owner, or on Enterprise a member whose custom role includes Manage access to Libraries, adds it once
under Organization settings, Connectors, Add, Custom, Web (other members see "Ask an organization
owner"); each member then clicks Connect under Customize, Connectors and signs in with their own
Scenario account. Keep it on OAuth: a fixed API-key header on an organization connector gives every
member that key's access.

Claude Code without that connector (not signed in with that account, or nobody has added it yet;
OAuth starts on first use, `/mcp` authenticates by hand):

```bash
claude mcp add --transport http scenario https://mcp.scenario.com/mcp
```

Claude Desktop without Connectors: the `mcp-remote` stdio bridge in `claude_desktop_config.json`,
then restart the app. A url-only entry there is rejected at startup ("not valid MCP server
configurations and were skipped"), since that file loads stdio servers only:

```json
{
  "mcpServers": {
    "scenario": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.scenario.com/mcp"]
    }
  }
}
```

Cursor (Settings, MCP; native OAuth and HTTP from 1.0), Windsurf (Cascade, Configure MCP):

```json
{ "mcpServers": { "scenario": { "url": "https://mcp.scenario.com/mcp" } } }
```

Codex (`codex mcp login scenario` starts the OAuth sign-in):

```bash
codex mcp add scenario --url https://mcp.scenario.com/mcp
```

VS Code: Command Palette, `MCP: Add Server`, HTTP, the URL. Zed:
`{ "context_servers": { "scenario": { "url": "https://mcp.scenario.com/mcp" } } }` in settings.
Gemini CLI: the server in `~/.gemini/settings.json`, then `/mcp auth scenario`. Other clients: the
standard URL through their CLI or configuration file.

Verify with a free call: "List my Scenario teams" should return `teams_list` output.
`diagnostics_run` names the failing layer when it does not.

## Claude connector symptoms

These are settings in the Claude app: the agent points the user to each one and changes nothing
itself.

- **Sign-in succeeds, then no MCP server or no tools**: check the saved connector URL first.
  - It must be `https://mcp.scenario.com/mcp`, the `/mcp` path included (a `?toolsets=full` query
    may follow). A domain alone (`https://mcp.scenario.com`, `https://scenario.com`) serves no MCP
    server, whatever the sign-in screen said.
  - URL correct but tools missing: check Tool permissions (below) for Blocked before removing
    anything. Nothing Blocked: re-authenticate (below).
  - URL wrong: remove the connector and add it again with the correct URL, since Claude edits no
    saved connector URL.
  - Free, Pro or Max: the user does this under Customize, Connectors.
  - Team or Enterprise: a member cannot change an organization connector. An owner removes and
    re-adds it under Organization settings, Connectors; then each member clicks Connect again under
    Customize, Connectors.
- **Approval asked on every tool call**: that is the Claude app's tool permission, not the server.
  - In the prompt, "Allow always" approves that tool from then on.
  - Customize, Connectors, the Scenario connector, Tool permissions: each category or tool takes
    Always allow, Needs approval, or Blocked.
  - On Team or Enterprise, an owner's setting there restricts the connector across the organization,
    and a member cannot override it.
  - On Enterprise, a custom role sets the same three options per connector or tool, so an owner
    checks the member's role too (Organization settings, Roles).

## Re-authenticating

A connection that worked and then fails, or a server-side authentication fix, needs a fresh
handshake: clear the client's stored authorization and connect again before debugging anything else.

- Claude Code: `/mcp`, select Scenario, Clear authentication.
- Cursor: Settings, Tools & MCP, deactivate and reactivate the server.
- VS Code: Command Palette, `MCP: List Servers`, remove and re-add.
- claude.ai and Claude Desktop: when sign-in succeeds and only the tools are missing, run the
  connector checks above first. Then Customize, Connectors, remove and re-add the custom connector
  (Team or Enterprise: reconnect instead). For Claude Desktop's `mcp-remote` config, Settings,
  Developer, Edit Config, remove the entry and `rm -rf ~/.mcp-auth`, then re-add and restart.
- Codex: `codex mcp logout scenario`, then `codex mcp login scenario`.
- OpenCode: `opencode mcp logout scenario`, then `opencode mcp auth scenario`.

Claude Desktop reopening the browser on every message is orphaned `mcp-remote` processes: quit the
app fully and reboot; if it persists, `pkill -f mcp-remote && rm -rf ~/.mcp-auth`; then switch to
the Connectors setup above, which ends the problem for good.

## API keys (headless or CI)

Where nobody is present to complete the OAuth prompt, the same endpoint also authenticates with a
Scenario API key sent as an HTTP header, and a client whose config file passes no headers (Claude
Desktop's `claude_desktop_config.json`) reaches it through `mcp-remote`. Keys are created in the
Scenario portal (the `api_key_create` catalog tool, read lane, returns that link and nothing else,
so calling it puts no secret in the conversation). Wiring one into a client is an operator task done
by hand: the [connection guide](https://mcp.scenario.com/docs#using-an-api-key) carries the header
format and the current steps for each client.

Credentials stay out of the conversation. An agent asked to set this up points to the guide and
stops there. It does not ask for a key or secret, does not place one in a command, a config file, or
a message, and does not repeat one that appears in its context.

## Server-side applications

OAuth from a web or server application fails with
`redirect_uri must use a loopback address or custom URI scheme` until the application's origin is on
the server's allowlist. Dynamic client re-registration does not help: only the origin is gated. An
API key serves the application without OAuth for generation and project work; team-level
administration (model access lists, member roles and caps) needs per-user OAuth with a team admin,
since the server refuses API keys there. To get an origin allowlisted, contact
[support](https://www.scenario.com/contact-us?intent=scenario-mcp-issue) with the bare `https`
origin (the port if any, no path), whether it is needed on production or a preview environment, and
the tools the application will call.
