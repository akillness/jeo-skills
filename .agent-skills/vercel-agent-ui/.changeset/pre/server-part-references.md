---
"@ui-sdk/core": patch
---

Server-rendered HTML now names and links the parts that render after the one pointing at them: an open Collapsible's trigger has `aria-controls`, a Progress or Meter with a label has `aria-labelledby`, and a Timeline item is named by its title. Once the component binds, a part that isn't in the page is dropped again.
