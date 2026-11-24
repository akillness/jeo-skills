---
"@ui-sdk/core": patch
---

An agent's choice in a closed Select or Combobox now reads the option it chooses even when the option renders only while the list is open: the list opens for a moment, so a `data-agent-confirm` mark on that option asks a person first. With `items` or `emptyItems` data, the option was chosen without asking.
