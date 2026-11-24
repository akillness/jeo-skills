---
"@ui-sdk/core": patch
---

An agent's `setValue` or `clear` that takes a `data-agent-confirm` item out of a value now needs a person, as adding that item does. Before, dropping a marked selection went through without asking. A step that touches several marks, like replacing one marked option with another, shows `allow` every mark's text, joined by semicolons, instead of only the first.
