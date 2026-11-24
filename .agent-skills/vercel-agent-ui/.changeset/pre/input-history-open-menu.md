---
"@ui-sdk/core": patch
---

`createInputHistory` leaves ArrowUp and ArrowDown to a Trigger Menu open on a textarea. It only looked for `aria-expanded`, which a textarea can't carry, so the keys brought back an earlier message while the menu was open.
