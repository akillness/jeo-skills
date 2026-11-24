---
"@ui-sdk/react": patch
---

A popup that unmounts lets go of its elements at once. React could keep the old popup's elements in memory until the next popup opened.
