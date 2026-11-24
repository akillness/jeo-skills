---
"@ui-sdk/core": patch
---

A modal popup no longer writes `--scrollbar-width` on `<html>` when the page has no scrollbar gutter, as with overlay scrollbars or a page that doesn't scroll. Closing one no longer restyles the whole page a second time for a value that was `0px`. Read it as `var(--scrollbar-width, 0px)`.
