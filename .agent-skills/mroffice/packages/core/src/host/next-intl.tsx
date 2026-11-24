/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// next-intl's client API for a plain React host: the same hooks, from
// use-intl (next-intl's framework-free core).
export {
  IntlProvider as NextIntlClientProvider,
  IntlProvider,
  useFormatter,
  useLocale,
  useMessages,
  useNow,
  useTimeZone,
  useTranslations,
  createTranslator,
  hasLocale,
} from "use-intl";
