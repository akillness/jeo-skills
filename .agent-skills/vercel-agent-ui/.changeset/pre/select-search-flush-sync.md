---
"@ui-sdk/core": patch
---

Select's search field no longer writes the old query over text its own `onChange` flushed, so the highlight moves to the first match.
