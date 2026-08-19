# ScrapingAnt MCP — per-client registration

Source of truth: [docs.scrapingant.com/mcp-server](https://docs.scrapingant.com/mcp-server)
(re-verified 2026-08). Endpoint `https://api.scrapingant.com/mcp`, transport
`streamableHttp`, auth header `x-api-key`.

Substitute your key from the dashboard. Prefer `${SCRAPINGANT_API_KEY}` where the
client interpolates environment variables; otherwise keep the config file out of
version control.

## Claude Code (CLI)

```bash
claude mcp add scrapingant --transport http https://api.scrapingant.com/mcp \
  -H "x-api-key: $SCRAPINGANT_API_KEY"

claude mcp list          # scrapingant should appear
```

Remove with `claude mcp remove scrapingant`.

## Claude Desktop

Config file:

- macOS — `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows — `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "scrapingant": {
      "url": "https://api.scrapingant.com/mcp",
      "transport": "streamableHttp",
      "headers": {
        "x-api-key": "<YOUR-API-KEY>"
      }
    }
  }
}
```

Restart Claude Desktop after editing.

## VS Code / GitHub Copilot

Different shape — `servers`, `requestInit.headers`, trailing slash on the URL.
Put it in VS Code settings or `.vscode/mcp.json` in the workspace:

```json
{
  "servers": {
    "scrapingant": {
      "url": "https://api.scrapingant.com/mcp/",
      "requestInit": {
        "headers": {
          "x-api-key": "<YOUR-API-KEY>"
        }
      }
    }
  }
}
```

## Cursor

Settings → MCP → Add new MCP Server:

- Name: `scrapingant`
- URL: `https://api.scrapingant.com/mcp`
- Transport: `streamableHttp`
- Headers: `x-api-key: <YOUR-API-KEY>`

## Cline

`cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "scrapingant": {
      "url": "https://api.scrapingant.com/mcp",
      "transport": "streamableHttp",
      "headers": {
        "x-api-key": "<YOUR-API-KEY>"
      }
    }
  }
}
```

## Windsurf

Standard MCP configuration file, same block as Cline/Claude Desktop:

```json
{
  "mcpServers": {
    "scrapingant": {
      "url": "https://api.scrapingant.com/mcp",
      "transport": "streamableHttp",
      "headers": {
        "x-api-key": "<YOUR-API-KEY>"
      }
    }
  }
}
```

## Other MCP runtimes

Any client that speaks streamable HTTP MCP works with the same three values
(URL, transport, `x-api-key` header). ScrapingAnt does not document those
clients, so treat them as unverified and confirm the tool list appears before
relying on them.

## After registering

1. Restart the client — most load MCP servers only at startup.
2. Confirm the three tools are visible: `get_web_page_markdown`,
   `get_web_page_html`, `get_web_page_text`.
3. Validate the key itself without a client:

```bash
bash .agent-skills/scrapingant-web-fetch/scripts/scrapingant.sh credits
bash .agent-skills/scrapingant-web-fetch/scripts/scrapingant.sh probe https://example.com --no-browser
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Tools never appear | client not restarted, or config in the wrong file | restart; verify the exact path above |
| 401 / auth error | wrong or unset key | re-copy from the dashboard; `scrapingant.sh doctor` |
| VS Code fails while Cursor works | used `mcpServers` shape in VS Code | use `servers` + `requestInit` + trailing slash |
| Works then stops mid-month | free credits exhausted | `scrapingant.sh credits`; credits do not roll over |
