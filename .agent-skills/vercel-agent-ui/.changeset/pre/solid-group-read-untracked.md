---
"@ui-sdk/solid": patch
---

In Solid, `CommandItem`, `SelectSelectAll` and `ComboboxSelectAll` follow their group's props: a group given spread props no longer logs a `STRICT_READ_UNTRACKED` warning in development, and an item keeps up with a group whose `id` changes.
