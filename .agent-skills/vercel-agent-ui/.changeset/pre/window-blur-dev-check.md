---
"@ui-sdk/core": patch
---

A window blur that closes a popup no longer logs a development warning in Chrome, or throws in strict mode. Chrome sends it as a plain `Event`.
