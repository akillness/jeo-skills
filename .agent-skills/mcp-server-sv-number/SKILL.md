---
name: mcp-server-sv-number
description: >
  Drive the SV Number MCP server (`sv-number-mcp`), nine stdio tools that order a private
  phone number for one signup, read the SMS verification code straight from the API, and
  hand the number back — covering 200+ countries. Use when an agent hits a signup form that
  needs a real phone number for an OTP/SMS code, when picking a country or service code
  (`list_countries`, `list_services`), ordering and polling a number (`order_number`,
  `wait_for_code`), closing out an activation (`finish_activation`, `cancel_activation`,
  `request_another_sms`), checking account balance (`get_balance`), or computing a TOTP/2FA
  code locally from a shared secret (`totp_code`). Triggers on: "sv-number", "sv-number-mcp",
  "SMS verification number", "order a phone number for OTP", "receive SMS verification code",
  "temporary/virtual number for signup", "sms-verification-number.com", "wait_for_code",
  "totp_code", "phone number MCP server for agents".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Node.js >=18. Runs over stdio via `npx -y sv-number-mcp`; no build step for consumers.
  Requires a funded `SVN_API_KEY` from sms-verification-number.com — there is no free tier.
  MIT license; the underlying SMS service is a commercial, paid API.
metadata:
  tags: mcp, mcp-server, sms, otp, phone-verification, sms-verification, sv-number, ai-agents, stdio, npx, totp
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: https://github.com/sv-number/mcp-server
---

# SV Number MCP Server

SV Number is a stdio MCP server that turns phone numbers into tools: an agent orders a
private number in the country a service expects, reads the SMS verification code straight
from the API, and hands the number back. Nine tools, no SDK to learn, 200+ countries of
coverage. It is not a messaging or calling product — receiving one verification code per
activation is the whole job.

## When to use this skill

- A signup or account-creation flow demands a real phone number to receive an SMS/OTP code
- Picking the right country id and service code before ordering a number
  (`list_countries`, `list_services`)
- Ordering a number, waiting for the code, and closing out the activation
  (`order_number`, `wait_for_code`, `finish_activation`, `cancel_activation`)
- Requesting a second SMS on the same number for a resend/password reset
  (`request_another_sms`)
- Checking remaining account balance before ordering (`get_balance`)
- Computing a TOTP/2FA code locally from an already-known Base32 secret (`totp_code`)
- Wiring this MCP server into Claude Code, Claude Desktop, Codex, or Cursor

## When not to use this skill

- The user needs a persistent number for real conversations, calls, banking, payment, or
  government accounts — these numbers are exclusive to one activation and expire in 20
  minutes; point them at a carrier product instead
- No `SVN_API_KEY` is configured and funding one is out of scope for the task — say so
  rather than guessing a key
- The task is about sending or receiving arbitrary SMS/voice traffic, not a one-time
  verification code — out of scope for this server
- A general MCP client setup question unrelated to SV Number specifically → use a generic
  MCP-configuration skill instead

## Instructions

### Step 1: Confirm the environment before ordering anything

```bash
node --version   # needs >=18
echo "${SVN_API_KEY:+set}"
```

`SVN_API_KEY` comes from the user's [profile page](https://sms-verification-number.com/en/user/profile/)
after [signup](https://sms-verification-number.com/en/register/), and the balance must be
funded — there is no free tier. Never print or echo the key itself; the server reads it from
the environment and no tool or error message ever returns it.

### Step 2: Register the server with the MCP client

Claude Code:

```bash
claude mcp add sv-number --env SVN_API_KEY=your_key_here -- npx -y sv-number-mcp
```

Any JSON-config client (Codex, Cursor, Claude Desktop) — see
[references/setup.md](references/setup.md) for the full snippet and env var table.

### Step 3: Check balance, then find the country and service

```text
get_balance()                          -> current funded balance
list_countries(search?)                -> id + operators per country
list_services(country, search?)        -> matches ranked best-first, notInList fallback
```

Service codes are arbitrary strings, never guess them from memory — `uk` is Airbnb, `re` is
Coinbase, `tn` is LinkedIn. Always resolve the code via `list_services` first. When
`deliveredPercent` is non-null, prefer the pair with the higher rate; when it is `null`
(the common case), prefer the pair with more numbers `online`. If nothing in the catalogue
matches the target site, order the `ot` ("Not on list") fallback service, not a guessed code.

### Step 4: Order the number and wait for the code

```text
order_number(service, country, operator?, maxPrice?)  -> { activationId, phone }
wait_for_code(activationId, timeoutSeconds?)           -> { code } (polls internally, up to 20 min)
```

Trigger the target service's "send code" action only after `order_number` returns the phone
number — `wait_for_code` polls `getStatus` on a sane interval and stops at the number's
20-minute lifetime on its own; do not build a manual polling loop around it.

### Step 5: Close out the activation

```text
finish_activation(activationId)     -> after the code was used successfully
cancel_activation(activationId)     -> no code arrived; money returns to balance
request_another_sms(activationId)   -> ask for a resend, only after a first code arrived
```

Always call `finish_activation` on success or `cancel_activation` on failure — a forgotten
activation holds money until it naturally expires after 20 minutes.

### Step 6: Compute a TOTP code when the account already has 2FA configured

```text
totp_code(secret, digits?, period?, algorithm?)   -> RFC 6238 code, computed locally
```

This tool never calls the network; the shared secret stays on the local machine. Use it only
when the user already has a Base32 secret from an authenticator setup, not as a substitute
for `order_number`/`wait_for_code`.

## Best practices

1. **Resolve service codes through `list_services`, never from memory** — the two-letter
   codes are arbitrary and easy to confuse (`uk` is not the United Kingdom).
2. **Pick by `deliveredPercent` when it exists, by `online` count when it does not** — a
   `null` deliverability is the common case, not a red flag.
3. **Always close the loop** — `finish_activation` on success, `cancel_activation` on
   failure, so money is not tied up until the 20-minute expiry.
4. **Treat the API key as write-only** — read it from the environment, never log it, never
   echo it back to the user, and never fund/rotate it without explicit confirmation.
5. **Do not build a manual polling loop** — `wait_for_code` already polls at a sane interval
   and respects the 20-minute activation life; wrapping it in another retry loop just wastes
   calls.
6. **These are single-activation numbers, not persistent lines** — route requests for a
   real, ongoing phone number to a carrier product instead of trying to reuse an activation.

## References

- [references/setup.md](references/setup.md) — install methods, env var table, MCP client
  registration snippets for Claude Code / Codex / Cursor / Claude Desktop
- [SV Number MCP server GitHub repo](https://github.com/sv-number/mcp-server)
- [Same product as a markdown skill](https://github.com/sv-number/skills)
- [API reference](https://sms-verification-number.com/en/api-sms-activate/)
- [Coverage and prices](https://sms-verification-number.com/en/number-for-ai-agents/)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`

## Examples

### Example 1: Verify a Telegram signup with an Indonesian number

```text
list_services(country=6, search="telegram")   -> service="tg", price, online, deliveredPercent
order_number(service="tg", country=6)          -> { activationId, phone: "62 838 1234 5678" }
# trigger Telegram's "send code" with the phone number (add leading + for E.164)
wait_for_code(activationId)                    -> { code: "123456" }
finish_activation(activationId)
```

### Example 2: No code arrives, so cancel and get the money back

```text
order_number(service="ds", country=0)          -> { activationId, phone }
wait_for_code(activationId, timeoutSeconds=120) -> { code: null, state: "timeout", next: "..." }
cancel_activation(activationId)                -> { state: "cancelled", money: "returned to the balance" }
```
