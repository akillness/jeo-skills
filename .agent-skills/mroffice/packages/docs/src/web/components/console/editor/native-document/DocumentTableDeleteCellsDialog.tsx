"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useCallback, useRef, useState, type RefObject } from "react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import type { DocumentTableDeleteCellsMode } from "@mrnote/core/web/components/console/editor/native-document/tableSelectionDelete.ts";

const MODES: ReadonlyArray<{
  readonly mode: DocumentTableDeleteCellsMode;
  readonly label: string;
  readonly shifts: boolean;
}> = [
  { mode: "shiftLeft", label: "document.tableDeleteCells.shiftLeft", shifts: true },
  { mode: "shiftUp", label: "document.tableDeleteCells.shiftUp", shifts: true },
  { mode: "entireRow", label: "document.tableDeleteCells.entireRow", shifts: false },
  { mode: "entireColumn", label: "document.tableDeleteCells.entireColumn", shifts: false },
];

export interface DocumentTableDeleteCellsDialogProps {
  readonly open: boolean;
  readonly canEdit?: boolean;
  /** False when merged cells keep the cells from shifting. */
  readonly canShift: boolean;
  /**
   * False in a table with rows shorter than its grid, where whole rows and
   * columns cannot be deleted (the cells still shift).
   */
  readonly canDeleteLines?: boolean;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  /** Apply the option; false when the table no longer allows it. */
  readonly onSubmit: (mode: DocumentTableDeleteCellsMode) => boolean;
  readonly onClose: () => void;
}

/**
 * Word's Delete Cells dialog (Backspace on cells that are not whole rows or
 * columns, or Table Layout > Delete > Delete Cells): Shift cells left, the
 * default, Shift cells up, Delete entire row, Delete entire column.
 */
export function DocumentTableDeleteCellsDialog({
  open,
  canEdit = true,
  canShift,
  canDeleteLines = true,
  returnFocusRef,
  onSubmit,
  onClose,
}: DocumentTableDeleteCellsDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const [mode, setMode] = useState<DocumentTableDeleteCellsMode>(
    canShift || !canDeleteLines ? "shiftLeft" : "entireRow",
  );
  const [error, setError] = useState<string | null>(null);
  const checkedRef = useRef<HTMLInputElement | null>(null);

  const submit = useCallback(() => {
    if (!canEdit) return;
    if (!onSubmit(mode)) {
      setError(t("document.tableDeleteCells.stale"));
      return;
    }
    onClose();
  }, [canEdit, mode, onClose, onSubmit, t]);

  return (
    <OfficeDialogShell
      open={open}
      title={t("document.tableDeleteCells.title")}
      description={t("document.tableDeleteCells.description")}
      defaultActionLabel={t("document.tableDeleteCells.ok")}
      cancelActionLabel={t("document.tableDeleteCells.cancel")}
      defaultActionDisabled={!canEdit}
      onDefaultAction={submit}
      onCancel={onClose}
      initialFocusRef={checkedRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-table-delete-cells"
    >
      <fieldset className={parts.group} disabled={!canEdit}>
        <legend className="sr-only">{t("document.tableDeleteCells.title")}</legend>
        {MODES.map((option) => (
          <label key={option.mode} className={parts.check}>
            <input
              ref={option.mode === mode ? checkedRef : undefined}
              type="radio"
              name="document-table-delete-cells"
              value={option.mode}
              checked={mode === option.mode}
              disabled={option.shifts ? !canShift : !canDeleteLines}
              data-testid={`document-table-delete-cells-${option.mode}`}
              onChange={() => {
                setMode(option.mode);
                setError(null);
              }}
            />
            <DocumentDialogIcon icon={{ sheet: option.mode }} />
            {t(option.label)}
          </label>
        ))}
        {canShift ? null : (
          <p className={parts.hint}>{t("document.tableDeleteCells.mergedHint")}</p>
        )}
        {canDeleteLines ? null : (
          <p className={parts.hint}>{t("document.tableGridFiller.structureLocked")}</p>
        )}
      </fieldset>
      {error ? (
        <p role="alert" className={parts.error}>
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
