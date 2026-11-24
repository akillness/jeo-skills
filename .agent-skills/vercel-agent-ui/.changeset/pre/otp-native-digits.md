---
"@ui-sdk/core": patch
---

OTP Input reads another script's digits, like Arabic-Indic "٤٨٢" or Persian "۴۸۲", as plain ones when its pattern doesn't take them as they are, so a code typed or pasted in them goes in.
