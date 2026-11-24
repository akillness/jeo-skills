/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  officeDialogClassName,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

// The viewer's own dialogs (insert, page labels, export image, layers, split,
// stamps, proofing text) wear the PDF dialog chrome like every other dialog.
export const PDF_POPOVER_CHROME = officeDialogClassName({ tone: "pdf" });
