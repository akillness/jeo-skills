---
"@ui-sdk/core": patch
---

`onHighlight` runs with `null` when the highlighted item leaves the list, like when it's filtered out or the items are replaced, so it matches what the list shows.
