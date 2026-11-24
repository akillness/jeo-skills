/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ICON_SET_FAMILIES } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";

/**
 * The name an icon set shows in the sort and filter lists: the same localized
 * name the conditional-format icon-set gallery uses ("三向箭头(彩色)"), never
 * the internal key ("3-arrows", "arrows"). A set the gallery does not offer
 * (an imported one) reads as its key without the count (live audit S-108).
 */
export type IconSetNameTranslator = (key: string) => string;

export function iconSetDisplayName(iconSet: string, t: IconSetNameTranslator): string {
  if (ICON_SET_FAMILIES.some((family) => family.name === iconSet)) {
    return t(`spreadsheet.cfDialog.iconSet.${iconSet}`);
  }
  return iconSet.replace(/^[0-9]+-/, "").replaceAll("-", " ");
}
