"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Insert > Symbols > Equation (公式), PowerPoint's split button: the face
 * inserts a new equation (Alt+=) and opens the editor on it; the arrow opens
 * the Equation gallery -- the built-in equations by their localized names,
 * the person's saved ones, the structure templates and symbols, Insert New
 * Equation and Save Selection to Equation Gallery -- which is the Docs
 * gallery itself (`DocumentEquationGalleryMenu`), so both editors offer the
 * same equations under the same names.
 */

import { OfficeEquationInsertSplitButton } from "@mrnote/core/web/components/office-equation/OfficeEquationInsertSplitButton.tsx";

export function PresentationEquationInsertButton({
  t,
  locale,
  disabled,
  selectedEquationLatex,
  onInsertEquation,
  onInsertNewEquation,
}: {
  t: (key: string) => string;
  locale: string;
  disabled: boolean;
  selectedEquationLatex: string | null;
  onInsertEquation: (latex: string) => void;
  onInsertNewEquation: () => void;
}) {
  return (
    <OfficeEquationInsertSplitButton
      t={t}
      locale={locale}
      disabled={disabled}
      selectedEquationLatex={selectedEquationLatex}
      onInsertEquation={onInsertEquation}
      onInsertNewEquation={onInsertNewEquation}
      controlIds={{
        primary: "PPTCTL.RIBBON.INSERT.EQUATION",
        menu: "PPTCTL.RIBBON.INSERT.EQUATION.MENU",
      }}
      testIdPrefix="presentation-ribbon-insert-equation"
      keyShortcuts="Alt+="
    />
  );
}
