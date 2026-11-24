"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { lazy, Suspense, type RefObject } from "react";
import type { OfficeIconChoice } from "@mrnote/core/web/components/office-ribbon/OfficeIconGalleryDialog.tsx";
import { officeIconChoiceSvgFile } from "@mrnote/core/web/components/office-ribbon/officeIconChoiceSvgFile.ts";

// Insert > Icons: the shared gallery (its catalog and drawings load with it).
const OfficeIconGalleryDialog = lazy(() => import("@mrnote/core/web/components/office-ribbon/OfficeIconGalleryDialog.tsx"));

/** Excel's Insert > Icons: every chosen icon is inserted as its own SVG
 * graphic, through the sheet's picture insertion (`insertFile`). */
export function SpreadsheetIconGallery({
  onClose,
  insertFile,
  onFailed,
  returnFocusRef,
}: {
  onClose: () => void;
  insertFile: (file: File) => void;
  onFailed: (label: string) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const insert = (icons: readonly OfficeIconChoice[]) => {
    onClose();
    for (const icon of icons) {
      const file = officeIconChoiceSvgFile(icon);
      if (file) insertFile(file);
      else onFailed(icon.label);
    }
  };
  return (
    <Suspense fallback={null}>
      <OfficeIconGalleryDialog
        open
        onInsert={insert}
        onCancel={onClose}
        returnFocusRef={returnFocusRef}
        testIdPrefix="spreadsheet-icon-gallery"
      />
    </Suspense>
  );
}
