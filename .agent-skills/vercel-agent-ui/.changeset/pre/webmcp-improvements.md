---
"@ui-sdk/core": patch
---

`registerTools` marks `act` with `consequentialHint` and ends a step that is waiting on `allow` when the browser cancels its call. The bridge no longer keeps a hidden input's value after the input leaves the page.
