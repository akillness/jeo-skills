---
"@ui-sdk/core": patch
---

A Number Input reads back long unit and currency names in every plural form, like Russian "50 километров", and values some locales write as a word alone, like Arabic "يومان" for 2 days, which now show their minus sign when negative. It reads its text with the decimals it shows, and `formatNumberRange` writes both ends whole when both are negative.
