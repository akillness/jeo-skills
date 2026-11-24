# MR Office MCP server

An [MCP](https://modelcontextprotocol.io) server that puts MR Office's
document, spreadsheet and PDF editors into AI conversations. The assistant
writes a document or spreadsheet, the editor opens it, the person changes it
by hand, and the assistant reads those edits back before it goes on.

- **Create** documents from Markdown and spreadsheets from CSV.
- **Open** Markdown, HTML, text, CSV/TSV and PDF files (from text, base64 or an https URL).
- **Edit together**: in apps that render [MCP Apps](https://modelcontextprotocol.io/extensions/apps)
  views, the editor appears inline in the chat and autosaves; in every other
  app the tools answer with a link to the same editor in the browser and a
  picture of the page. The tools and what they can do are the same either way.
- **Read back** the person's edits (`get_document`), **picture** any page as the
  editor draws it (`render_page`), and **export** (`md`, `html`, `csv`, `pdf`,
  and the editors' own `mrdoc` / `mrsheet`).

Documents stay on the machine that runs the server. The editor page is served
on `127.0.0.1`; only the editor's code (scripts, styles, fonts) loads from
`https://demo.mroffice.ai`, the build of the editors in this repository.

Word, Excel and PowerPoint files go through MR Office's Office engine as the
person's own MR Office account: the first one opens the sign-in page in the
browser by itself (OAuth 2.1 with PKCE; `npx -y mroffice-mcp login` signs in
ahead, `logout` revokes it).

## Requirements

- Node.js 22 or newer.
- For page pictures: Google Chrome or Microsoft Edge, or
  `npx playwright-core install chromium-headless-shell`.

## Use it from an AI app

Any MCP client that starts local (stdio) servers runs it with one command,
no settings needed:

```
npx -y mroffice-mcp
```

Most clients take a JSON entry of this shape in their MCP settings:

```json
{
  "mcpServers": {
    "mroffice": {
      "command": "npx",
      "args": ["-y", "mroffice-mcp"]
    }
  }
}
```

Clients that connect to remote MCP servers can use the hosted server instead,
with nothing installed: `https://mcp.mroffice.ai/mcp` (the client signs the
person in to MR Office with OAuth).

Install instructions for specific apps: <https://mroffice.ai/developers/mcp>.

### Over HTTP

```sh
npx -y mroffice-mcp --http           # MCP endpoint at http://127.0.0.1:3410/mcp
```

To serve it to others, set `MROFFICE_MCP_LISTEN_HOST`, `MROFFICE_MCP_PUBLIC_URL`
and `MROFFICE_MCP_DATA_DIR` and put it behind an HTTPS proxy. Without an
account engine configured it has no sign-in of its own: anyone who can reach
the address can use it.

## From source

```sh
cd apps/mcp
npm ci
npm test
node src/cli.ts             # stdio; Node 22.18+ runs the TypeScript directly
npm run build               # dist/, what the npm package runs
```

## Tools

| Tool | What it does |
|---|---|
| `create_document` | New document (Markdown) or spreadsheet (CSV), opened in the editor |
| `open_document` | Open a file given as text, base64 or an https URL |
| `update_document` | Replace a document's content as a new revision (refused if the person edited it since the revision the assistant read) |
| `get_document` | The current content, with the person's edits: Markdown for documents, CSV per sheet |
| `render_page` | A PNG of one page as the editor draws it |
| `export_document` | The document as a file, with a download link |
| `list_documents` | The documents created or opened with this server |

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `MROFFICE_MCP_PORT` | `3410` | Port of the editor pages (and of `--http`) |
| `MROFFICE_MCP_DATA_DIR` | `<system temp>/mroffice-mcp` | Where documents and their revisions are kept |
| `MROFFICE_MCP_EDITOR_ORIGIN` | `https://demo.mroffice.ai` | Where the editor's scripts, styles and fonts load from |
| `MROFFICE_MCP_EDITOR_DIST` | – | A local build of `apps/playground` to serve instead |
| `MROFFICE_MCP_PUBLIC_URL` | `http://127.0.0.1:<port>` | The address links point to |
| `MROFFICE_MCP_LISTEN_HOST` | `127.0.0.1` | The address the HTTP side listens on |
| `MROFFICE_MCP_MAX_FILE_BYTES` | `20971520` | Largest file a tool accepts |
| `MROFFICE_MCP_UI_DOMAIN` | – | A stable sandbox domain for the inline view, when an app asks for one |
| `MROFFICE_MCP_AUTH` | `none` | `oauth`: a shared `--http` server that takes only callers signed in to MR Office; each account sees only its own documents |
| `MROFFICE_MCP_RETENTION_DAYS` | – | Remove documents nobody saved for this many days |
| `MROFFICE_MCP_MAX_DOCUMENTS_PER_PERSON` | `200` | With `oauth`: the most documents one account keeps (oldest go first) |
| `MROFFICE_MCP_RENDER_CONCURRENCY` | `2` | Pages the headless editor draws at once |

## License

AGPL-3.0-only. MR Office: <https://mroffice.ai>.
