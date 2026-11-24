---
"@ui-sdk/vue": patch
---

A Vue part that a Vapor app sets up without `vaporInteropPlugin` now throws an error that says to install it, instead of "The root part must call usePart in its setup." or rendering nothing.
