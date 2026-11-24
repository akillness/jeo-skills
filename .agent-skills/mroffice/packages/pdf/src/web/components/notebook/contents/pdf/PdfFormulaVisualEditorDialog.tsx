"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EquationVisualEditorDialog } from "@mrnote/core/web/components/office-equation/EquationVisualEditorDialog.tsx";

export interface PdfFormulaVisualEditorDialogProps {
  latex: string;
  onAccept: (latex: string) => void;
  onCancel: () => void;
}

/**
 * Port the shared Docs MathLive editor into the PDF formula workflow without
 * creating a second equation model. The controller owns only an in-memory
 * visual draft; the PDF source editor remains the sole Apply/persistence and
 * import/export boundary. The dialog itself is the shared
 * `EquationVisualEditorDialog` (also a slide's equation editor); in dark mode
 * pdf-viewer-chrome.css keeps the editor on the light ink it was drawn for,
 * keyed by this dialog's test id.
 */
export default function PdfFormulaVisualEditorDialog({
  latex,
  onAccept,
  onCancel,
}: PdfFormulaVisualEditorDialogProps) {
  return (
    <EquationVisualEditorDialog
      latex={latex}
      onAccept={(state) => onAccept(state.latex)}
      onCancel={onCancel}
      testId="pdf-formula-visual-dialog"
    />
  );
}
