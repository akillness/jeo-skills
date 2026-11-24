# UI localization

English source text is the translation key. `t(key, vars)` is shared by React
components, module constants, toasts and non-React helpers; missing keys fall back
to English. Keep keys, `{name}` placeholders, HTML formatting tags, Go template
actions and literal command/API examples intact when adding translations.

The registered locales are English (`en`), Turkish (`tr`) and Simplified Chinese
(`zh-CN`). The Preferences language control renders `LOCALES` directly. A saved
`artex.locale` browser preference takes priority over browser language detection;
otherwise an exact language tag, then its base language, is matched. Chinese
browser variants use the available Simplified Chinese dictionary. Static export
and unsupported languages retain the English default. Switching language saves
the preference and reloads the page, following the existing module-level design.

To add a locale, add `locales/<code>.json` and register it in `Locale`, `LOCALES`,
`DICTIONARIES` and `INTL_LOCALES` in `index.ts`. Date/number formatting uses
`intlLocale`, and the HTML `lang` attribute follows the selected locale.

Run `npm run test:i18n` and `npm run build:static` from `web/`. The dictionary
checker covers every locale, checks literal call sites, requires matching keys
including dynamic entries, and validates placeholders. Runtime tests exercise
language detection, persistence, English fallback and prototype-safe lookups.

The initial Simplified Chinese dictionary reuses Chinese wording from this
repository's parent of commit `e233c02` (the English translation migration), with
additional translations for current functionality and normalized UI terminology.
This only localizes interface text; backend data, user content, model responses,
protocol identifiers and tool output are not rewritten.
