---
"@ui-sdk/core": patch
---

A Command whose `query` and `value` are both controlled now calls `onValueChange` in the same event as `onQueryChange` when the text changes from typing, Escape or `setQuery`, so an app renders the new text and the new highlight together. Before, the highlight was asked for a render later, which Solid's diagnostics reported as `EFFECT_WRITES_OWN_SOURCE` and `EFFECT_RELAY_TEAR`.
