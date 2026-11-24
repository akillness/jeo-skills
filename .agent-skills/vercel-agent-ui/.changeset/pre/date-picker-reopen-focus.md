---
"@ui-sdk/core": patch
---

Open a Date Picker on the selected date, else today, each time, as the docs say, instead of the day browsing stopped on last time. Each open turns the calendar back to that date's month, which `onMonthChange` hears with reason `"imperative"`. A roving focus group whose key is set back to `null` now forgets the item focused last.
