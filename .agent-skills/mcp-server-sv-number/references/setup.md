# SV Number MCP Server — Setup Reference

## Install

The package is published as `sv-number-mcp` on npm and run over stdio; there is nothing to
build for consumers, `npx -y` fetches and runs it directly.

### Claude Code

```bash
claude mcp add sv-number --env SVN_API_KEY=your_key_here -- npx -y sv-number-mcp
```

### Any JSON-config client (Codex, Cursor, Claude Desktop)

```json
{
  "mcpServers": {
    "sv-number": {
      "command": "npx",
      "args": ["-y", "sv-number-mcp"],
      "env": { "SVN_API_KEY": "your_key_here" }
    }
  }
}
```

### From source (contributing / debugging)

```bash
git clone https://github.com/sv-number/mcp-server.git
cd mcp-server
npm install
npm run build     # tsc -> dist/index.js
SVN_API_KEY=your_key_here node dist/index.js
```

## Getting an API key

1. Sign up at https://sms-verification-number.com/en/register/
2. Fund the account balance — there is **no free tier**
3. Copy the key from https://sms-verification-number.com/en/user/profile/
4. Set it as `SVN_API_KEY` in the environment or MCP client config, never inline in a prompt

The key is read from the environment and never leaves the process: no tool response contains
it and no error message quotes it.

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `SVN_API_KEY` | *(required)* | From the sms-verification-number.com profile page; secret |
| `SVN_API_BASE` | `https://sms-verification-number.com/stubs/handler_api` | Override only for a proxy/mirror |
| `SVN_LANG` | `en` | Sets both response language and currency (`ru` → RUB, else USD) |
| `SVN_POLL_SECONDS` | `4` | Interval `wait_for_code` polls at internally |

## Tools

| Tool | Signature | What it does |
| --- | --- | --- |
| `get_balance` | `()` | Current funded balance and currency |
| `list_countries` | `(search?)` | Every country with its id and operators |
| `list_services` | `(country, search?)` | Ranked service matches + `notInList` fallback, price, `online`, `deliveredPercent` |
| `order_number` | `(service, country, operator?="any", maxPrice?)` | Order a private number; returns `{ activationId, phone }` |
| `wait_for_code` | `(activationId, timeoutSeconds?=300)` | Poll until the SMS code lands (capped at the 20-minute activation life) |
| `finish_activation` | `(activationId)` | Close a successful activation |
| `cancel_activation` | `(activationId)` | Cancel and refund |
| `request_another_sms` | `(activationId)` | Ask for a second code on the same number (only after a first code arrived) |
| `totp_code` | `(secret, digits?=6, period?=30, algorithm?="sha1")` | Compute an RFC 6238 authenticator code locally, no network call |

Notes:

- `order_number` returns the phone without a leading `+`; add it if the signup form expects
  E.164 format.
- `list_services` codes are arbitrary two-letter strings (e.g. `tg` = Telegram, `ot` =
  "Not on list", a catch-all for services outside the catalogue) — always resolve them
  through `list_services`, never guess.
- `deliveredPercent` is `null` when the country/service pair has no delivery statistics yet;
  that is the common case, not an error.
- A number belongs to exactly one activation and expires after 20 minutes; it is not a
  reusable or persistent line.

## License

MIT (`sv-number-mcp` package and repo). The SMS verification service behind it
(sms-verification-number.com) is a separate commercial product with its own paid API.
