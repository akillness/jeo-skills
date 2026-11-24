---
"@ui-sdk/core": patch
---

A toast with no layout, like one in a region under a hidden ancestor, has no height to measure. `--toast-height`, `--toast-offset`, `--toast-front-height` and `--toast-stack-height` now stay unset for it rather than reading `NaNpx`, and they're set once the toast is laid out.
