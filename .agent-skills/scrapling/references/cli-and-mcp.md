# CLI and MCP

Scrapling's CLI covers install, shell, extraction, and MCP server startup.

## Install and shell

```bash
pip install "scrapling[shell]"
scrapling install
scrapling shell
scrapling shell -c 'Fetcher.get("https://example.com").css("title::text").get()'
```

`scrapling shell` is useful when the user wants an interactive REPL backed by IPython instead of a standalone script.

## Extract commands

The `extract` group supports:

- `get`
- `post`
- `put`
- `delete`
- `fetch`
- `stealthy-fetch`

Output format follows the target file extension:

- `.md` for Markdown conversion
- `.html` for raw HTML
- `.txt` for cleaner text content

Examples:

```bash
scrapling extract get "https://example.com" article.md
scrapling extract post "https://api.example.com/search" result.html --json '{"query":"shoes"}'
scrapling extract fetch "https://app.example.com" dashboard.md --network-idle
scrapling extract stealthy-fetch "https://protected.example.com" data.txt --solve-cloudflare
```

Useful shared flags:

- `-s, --css-selector`
- `--proxy`
- `--timeout`
- `-H, --headers` or `--extra-headers`

Useful browser flags:

- `--headless` or `--no-headless`
- `--network-idle`
- `--wait`
- `--wait-selector`
- `--real-chrome`

Stealth-only flags:

- `--solve-cloudflare`
- `--block-webrtc`
- `--allow-webgl` or `--block-webgl`
- `--hide-canvas`

## Wrapper script

This skill includes:

```bash
bash scripts/run-extract.sh <mode> <url> <output_file> [extra args...]
```

Mode aliases:

- `get`
- `post`
- `put`
- `delete`
- `fetch`
- `stealthy-fetch`
- `dynamic` -> `fetch`
- `stealth` -> `stealthy-fetch`
- `auto` -> `get`

## MCP server

Scrapling's MCP server exposes six main tools:

- `get`
- `bulk_get`
- `fetch`
- `bulk_fetch`
- `stealthy_fetch`
- `bulk_stealthy_fetch`

Local stdio mode:

```bash
pip install "scrapling[ai]"
scrapling install
scrapling mcp
```

Streamable HTTP mode:

```bash
scrapling mcp --http --host 0.0.0.0 --port 8000
```

Wrapper:

```bash
bash scripts/run-mcp.sh --http --host 127.0.0.1 --port 8000
```

Minimal Claude-style config:

```json
{
  "mcpServers": {
    "ScraplingServer": {
      "command": "scrapling",
      "args": ["mcp"]
    }
  }
}
```

## Operational guidance

- Start with stdio MCP for local agent use
- Use HTTP transport only when the environment already expects streamable HTTP
- Prefer CSS selectors in extraction commands to avoid returning giant documents
- Use `.md` output for model-friendly inspection unless raw HTML is necessary
