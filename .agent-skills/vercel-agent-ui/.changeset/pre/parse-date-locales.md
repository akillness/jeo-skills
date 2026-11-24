---
"@ui-sdk/core": patch
---

`parseDate`, and so a Date Picker and Date Input, reads dates typed with a month name in more locales: in the long date's order (Swedish "16 oktober 2026"), with combining marks (Thai, Hindi), and with names that hold a space, an apostrophe, a number or a prefix (Irish, Catalan, Vietnamese, Hebrew), and a weekday's words (Danish "fredag den"). A locale whose numeric dates go year, day, month reads "2026-05-01" in its own order, and a date typed with the short date's separator reads in the short date's order.
