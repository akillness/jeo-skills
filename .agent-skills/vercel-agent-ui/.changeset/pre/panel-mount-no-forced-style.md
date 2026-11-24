---
"@ui-sdk/core": patch
---

A Collapsible or Accordion panel that mounts open finishes its keyframes in the frame before the first paint, instead of reading its animations while the framework commits, which forced style for everything the commit changed.
