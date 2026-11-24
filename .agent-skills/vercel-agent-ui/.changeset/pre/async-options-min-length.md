---
"@ui-sdk/core": patch
---

Async options take `minLength`: text shorter than it, trimmed, loads nothing, cancels a load in flight and clears the items, so a server search waits for a few characters.
