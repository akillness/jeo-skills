---
"@ui-sdk/core": patch
---

A trigger menu that lets go of its editor now removes the `aria-haspopup`, `aria-autocomplete` and `aria-controls` it wrote there. Before, they stayed on the textarea and pointed at a list that no longer existed.
