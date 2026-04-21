# API Documentation Modes and Boundaries

Use `api-documentation` for **developer-facing API docs that help integrators succeed after the contract already exists**.

## Canonical modes

### 1. Reference docs
Use when developers need endpoint, schema, field, or error truth.

Typical signals:
- endpoint reference
- parameter/field tables
- response schema
- error/status code docs
- pagination, limits, retries

### 2. Quickstart
Use when the job is first success, not exhaustive reference.

Typical signals:
- get an API key
- make the first request
- verify a response
- choose sandbox vs production
- next steps into deeper docs

### 3. Integration guide
Use when one task or workflow needs a guided path.

Typical signals:
- "how to sync orders"
- "how to upload files"
- "how to paginate through results"
- "how to recover from webhook retries"

### 4. SDK guide
Use when a client library needs install/config/usage guidance.

Typical signals:
- package install
- client configuration
- first working example
- error handling conventions
- version compatibility notes

### 5. Webhook guide
Use when delivery, verification, retries, and local-debug flows matter.

Typical signals:
- event registration
- signature verification
- idempotency
- replay/retry behavior
- local listener setup

### 6. Migration update
Use when a changed API needs a docs-facing transition path.

Typical signals:
- deprecated field or endpoint
- new version path
- changed auth or pagination semantics
- compatibility deadline
- old-vs-new example pairs

## Boundary table

| If the request is mainly about... | Use |
|---|---|
| Resource modeling, interface shape, versioning strategy, or contract design | `api-design` |
| Internal specs, ADRs, rollout plans, runbooks, migration procedures | `technical-writing` |
| End-user onboarding, help-center articles, screenshots, or UI how-to docs | `user-guide-writing` |
| Provider auth setup, token/session implementation, middleware, or login flows | `authentication-setup` |
| Release-note summaries, semver communication, or CHANGELOG.md upkeep | `changelog-maintenance` |

## Common failure modes
- Dumping a raw OpenAPI schema into docs and calling it done
- Mixing quickstart, full reference, SDK setup, and release notes into one giant page
- Confusing contract design questions with documentation tasks
- Hiding auth assumptions and environment setup until halfway through the guide
- Publishing examples that do not match current API behavior
