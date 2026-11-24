---
"@ui-sdk/solid": patch
---

A part's event handler that runs while another component renders, like a focus change that component makes, no longer logs Solid's `STRICT_READ_UNTRACKED` warning for each reactive prop it reads.
