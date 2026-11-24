---
"@ui-sdk/core": patch
---

A `ToastRegion` without `toaster` no longer throws "Expected a toaster from createToaster()" when a second copy of `@ui-sdk/core` runs in the page, such as after upgrading during `next dev`.
