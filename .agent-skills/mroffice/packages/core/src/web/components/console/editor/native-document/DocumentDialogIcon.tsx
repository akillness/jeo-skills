/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { OfficeSemanticIconId } from "../../../office-ribbon/icons/officeIconRegistry";
import { OfficeSemanticIcon } from "../../../office-ribbon/icons/OfficeSemanticIcon";
import {
  SpreadsheetDialogIcon,
  type SpreadsheetDialogIconName,
} from "../../../notebook/contents/spreadsheet/SpreadsheetDialogIcon";

import { DocsInsertIcon, type DocsInsertIconName } from "../DocumentInsertRibbonIcons";

/*
 * The picture on a Docs dialog's choice or option button, at the dialog's
 * 16px, in the same glyph language as the ribbon it was opened from. A choice
 * the ribbon already draws (Drop Cap's positions) wears the ribbon's picture;
 * one the spreadsheet dialogs already draw (Delete Cells' shifts) wears
 * theirs, so the same alternative looks the same in every editor.
 */
export type DocumentDialogIconSource =
  | OfficeSemanticIconId
  | { readonly insert: DocsInsertIconName }
  | { readonly sheet: SpreadsheetDialogIconName };

const ICON_CLASS = "office-dialog__icon";

export function DocumentDialogIcon({ icon }: { icon: DocumentDialogIconSource }) {
  if (typeof icon === "string") {
    return <OfficeSemanticIcon semanticId={icon} size={16} className={ICON_CLASS} />;
  }
  if ("insert" in icon) {
    return <DocsInsertIcon name={icon.insert} size={16} className={ICON_CLASS} />;
  }
  return <SpreadsheetDialogIcon name={icon.sheet} />;
}
