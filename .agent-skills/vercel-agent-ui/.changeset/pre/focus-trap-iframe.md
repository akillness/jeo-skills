---
"@ui-sdk/core": patch
---

Tab and Shift+Tab from inside an iframe that is the last or first control of a modal Dialog, or another focus-trapping popup, now wrap around the popup. Before, focus left the page, or moved to the page behind a dialog that traps focus without making the page inert.
