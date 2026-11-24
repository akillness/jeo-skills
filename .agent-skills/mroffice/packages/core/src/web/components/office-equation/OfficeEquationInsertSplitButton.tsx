"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Insert > Symbols > Equation (公式), Office's split button: the face inserts
 * a new equation and opens the editor on it; the arrow opens the Equation
 * gallery -- the built-in equations by their localized names, the person's
 * saved ones, the structure templates and symbols, Insert New Equation and
 * Save Selection to Equation Gallery -- which is the Docs gallery itself
 * (`DocumentEquationGalleryMenu`), so every editor offers the same equations
 * under the same names. A slide's and a worksheet's Insert tab draw it with
 * their own control ids and test ids.
 */

import { DocsInsertIcon } from "../console/editor/DocumentInsertRibbonIcons";
import { DocumentEquationGalleryMenu } from "../console/editor/native-document/DocumentEquationGalleryMenu";
import {
  OfficeHomeCommand,
  OfficeHomeLargeSplitLayout,
  OfficeHomeMenuTrigger,
} from "../office-ribbon/OfficeHomeRibbon";
import { OfficeSemanticIcon } from "../office-ribbon/icons/OfficeSemanticIcon";
import { DropdownMenu, DropdownMenuTrigger } from "../ui/dropdown-menu";

export interface OfficeEquationInsertSplitButtonProps {
  readonly t: (key: string) => string;
  readonly locale: string;
  readonly disabled: boolean;
  readonly disabledReason?: string | null;
  readonly selectedEquationLatex: string | null;
  readonly onInsertEquation: (latex: string) => void;
  readonly onInsertNewEquation: () => void;
  readonly controlIds: { readonly primary: string; readonly menu: string };
  /** `<prefix>-split`, `<prefix>` (the face), `<prefix>-menu`; the gallery's own ids under `<prefix>`. */
  readonly testIdPrefix: string;
  /** The face's shortcut, where the host has one (PowerPoint's Alt+=). */
  readonly keyShortcuts?: string;
}

export function OfficeEquationInsertSplitButton({
  t,
  locale,
  disabled,
  disabledReason,
  selectedEquationLatex,
  onInsertEquation,
  onInsertNewEquation,
  controlIds,
  testIdPrefix,
  keyShortcuts,
}: OfficeEquationInsertSplitButtonProps) {
  const label = t("equation.ribbon.equation");
  return (
    <OfficeHomeLargeSplitLayout
      testId={`${testIdPrefix}-split`}
      primary={
        <OfficeHomeCommand
          controlId={controlIds.primary}
          variant="large"
          icon={<DocsInsertIcon name="equation" size={24} />}
          label={label}
          keyShortcuts={keyShortcuts}
          disabled={disabled}
          disabledReason={disabledReason ?? undefined}
          onClick={onInsertNewEquation}
          testId={testIdPrefix}
        />
      }
      trigger={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <OfficeHomeMenuTrigger
              controlId={controlIds.menu}
              variant="icon"
              className="note-editor-office-toolbar__split-chevron"
              icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
              label={t("toolbar.equationMenu")}
              title={t("toolbar.equationMenu")}
              disabled={disabled}
              testId={`${testIdPrefix}-menu`}
            />
          </DropdownMenuTrigger>
          <DocumentEquationGalleryMenu
            t={t}
            locale={locale}
            testIdPrefix={testIdPrefix}
            align="start"
            onInsert={(payload) => onInsertEquation(payload.attrs.latex)}
            onInsertNew={onInsertNewEquation}
            selectedEquationLatex={selectedEquationLatex}
          />
        </DropdownMenu>
      }
    />
  );
}
