---
"@ui-sdk/core": patch
---

A carousel behind a modal dialog or drawer is now inert, like the rest of the page. Its slides and viewport stayed usable, because the slides are a live region and live regions stay live over a modal.
