---
"@ui-sdk/core": patch
---

A popup's exit no longer waits on scroll-driven animations inside it, which kept it mounted for 100 seconds after closing in Firefox.
