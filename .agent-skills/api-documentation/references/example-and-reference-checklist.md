# Example and Reference Checklist

Use this checklist before shipping API docs.

## Minimum developer-success set
- One first-success example request
- One realistic success response
- Auth prerequisites and header/signing details
- One common error and recovery note
- Environment/base-URL note if sandbox and production differ
- Link to the deeper reference surface for full parameters/fields

## When the API is more complex
Add any that apply:
- pagination example
- retry/backoff note
- idempotency key example
- webhook signature verification example
- version/deprecation example
- SDK example paired with raw HTTP
- rate-limit note and what to do when exceeded

## Good example rules
- Prefer tested or otherwise verified examples over invented placeholders
- Keep placeholders obvious when secrets or IDs are redacted
- Match field names and error shapes to the real contract
- Include just enough context to run or reason about the example
- Explain why the example matters, not just what it contains

## Reference-surface rules
- Put auth before endpoints when every call depends on it
- Keep common conventions together: base URL, headers, versioning, limits, retries
- Group operations by developer job or resource, not random internal service layout
- Keep error docs close to the relevant operation or in a clearly linked common section
- Show what success looks like after the call, not only the request syntax
