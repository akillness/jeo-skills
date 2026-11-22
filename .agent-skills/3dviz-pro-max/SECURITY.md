# Security

This project is an early foundation. No security support window or audited release is claimed.

Treat retrieved data and external sources as untrusted input. Catalog records describe scenes and checks; they must not execute shell commands or code through dynamic evaluation. Do not put credentials into prompts, catalog records, scene specifications, screenshots, or public evidence.

## Reporting a vulnerability

Do not post exploit details, tokens, private captures, or personal data in a public issue. Use the repository's private vulnerability reporting option if the hosting service exposes it. A dedicated private reporting address has not yet been published; if no private option exists, ask the maintainer to establish one without including sensitive details.

Privately provide the affected revision, minimal reproducer, actual impact, and a suggested mitigation when available. A visual or factual error without a security impact belongs in a normal correction report.

## Published sensitive data

Notify the maintainer privately. Revoke exposed credentials promptly. The maintainer should remove sensitive content from active files, artifacts, and history as appropriate and publish a sanitized correction when safe. The evidence append-only convention never requires preserving secrets.

## Before release

Maintainers must establish a private reporting channel, confirm the remaining media rights (the repository is [MIT licensed](LICENSE); the Harness Village recording is not covered and its redistribution rights are still open), verify installable package contents, and record tested host/runtime versions. A passing structural check alone does not certify security, scientific accuracy, or safe execution of generated artifacts.
