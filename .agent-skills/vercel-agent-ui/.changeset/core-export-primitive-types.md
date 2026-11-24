---
"@ui-sdk/core": patch
---

`@ui-sdk/core` exports `SlotProps`, `Named`, `BaseSlotProps`, `Feature` and `Listener`, every type a primitive's inferred type names, so a package that ships its own primitive can emit or bundle its declarations without a TS2742 error or a copy of core's files.
