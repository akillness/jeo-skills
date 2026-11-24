---
"@ui-sdk/core": patch
---

When two cookies share a name, the preferences script now reads the same one as the server and the client, the first, so the value no longer changes after hydration.
