---
"@ui-sdk/core": patch
---

A Drawer or Dialog opened through a controlled `open` on a phone no longer gets a `--keyboard-inset` with no keyboard open. A read taken before it rendered that shows a covered strip is measured again.
