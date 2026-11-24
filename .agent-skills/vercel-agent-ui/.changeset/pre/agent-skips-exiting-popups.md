---
"@ui-sdk/core": patch
---

The agent bridge leaves out a component inside a popup that's animating out (`data-ending-style`), so a step right after a person's choice in a menu isn't ambiguous with the field the menu belongs to.
