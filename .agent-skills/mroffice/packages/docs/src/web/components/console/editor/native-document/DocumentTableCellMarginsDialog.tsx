"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import {
  documentLengthUnit,
  documentPxPerLengthUnit,
  parseDocumentLengthPx,
  type DocumentLengthUnit,
} from "@mrnote/core/web/lib/document-length-fields.ts";
import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import { documentValueInputClassName } from "@mrnote/core/web/components/console/editor/documentValueInput.ts";
import styles from "@mrnote/core/web/components/console/editor/native-document/DocumentLayoutDialogs.module.css";
import {
  normalizeCellMarginSide,
  normalizeCellMargins,
  normalizeTableCellSpacingPx,
  type CellMarginSide,
  type CellMargins,
} from "@mrnote/core/web/components/console/editor/native-document/tableCellStyle.ts";

/*
 * Word's Table Options and Cell Options dialogs (Table Layout > Cell
 * Margins; Table Properties > Table > Options… / Cell > Options…; "Change
 * the spacing in a table", "Resize a table, column, or row", Microsoft
 * Support; ECMA-376 17.4.42 tblCellMar, 17.4.44 tblCellSpacing, 17.4.53
 * tblLayout, 17.4.43 tcMar):
 * - Table Options: Default cell margins Top/Bottom/Left/Right (Word's own
 *   default is 0" top/bottom and 0.08" left/right), "Allow spacing between
 *   cells" with its value (w:tblCellSpacing), and "Automatically resize to
 *   fit contents" (w:tblLayout autofit; unchecked writes fixed).
 * - Cell Options: "Same as the whole table" (no w:tcMar) or the selected
 *   cells' own four margins.
 * Measurements are in Word's unit for the locale (lib/document-length-fields:
 * centimetres in Chinese Word, inches in US English), as the other Docs page
 * dialogs; the model keeps CSS pixels at 96 per inch.
 */

export interface DocumentTableCellMarginsDialogProps {
  readonly canEdit?: boolean;
  readonly open: boolean;
  readonly locale: string;
  readonly initialScope: DocumentTableCellMarginsScope;
  readonly initialTableMargins: CellMargins | null;
  /** The margins an imported Word table inherits from its style where it
   * declares none. Blank edges show what they inherit as placeholders. */
  readonly inheritedTableMargins?: CellMargins | null;
  readonly initialCellMargins: CellMargins | null;
  readonly initialTableCellSpacing?: number | null;
  /** Whether Word would resize this table to its contents (w:tblLayout). */
  readonly initialAutoResize?: boolean;
  readonly cellScopeDisabledReason?: string | null;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onSubmit: (value: DocumentTableCellMarginsValue) => boolean;
  readonly onClose: () => void;
}

export type DocumentTableCellMarginsScope = "table" | "cells";

export interface DocumentTableCellMarginsValue {
  readonly scope: DocumentTableCellMarginsScope;
  readonly margins: CellMargins | null;
  readonly cellSpacingPx: number | null;
  /** Table scope only: Automatically resize to fit contents. */
  readonly autoResize?: boolean;
}

function pxToLength(px: number, unit: DocumentLengthUnit): string {
  return String(Math.round((px / documentPxPerLengthUnit(unit)) * 1000) / 1000);
}

const SIDE_ORDER = ["top", "bottom", "left", "right"] as const;

function marginDrafts(
  margins: CellMargins | null,
  unit: DocumentLengthUnit,
): Record<CellMarginSide, string> {
  return {
    top: margins?.top === undefined ? "" : pxToLength(margins.top, unit),
    right: margins?.right === undefined ? "" : pxToLength(margins.right, unit),
    bottom: margins?.bottom === undefined ? "" : pxToLength(margins.bottom, unit),
    left: margins?.left === undefined ? "" : pxToLength(margins.left, unit),
  };
}

export function DocumentTableCellMarginsDialog({
  canEdit = true,
  open,
  locale,
  initialScope,
  initialTableMargins,
  inheritedTableMargins = null,
  initialCellMargins,
  initialTableCellSpacing = null,
  initialAutoResize = true,
  cellScopeDisabledReason = null,
  returnFocusRef,
  onSubmit,
  onClose,
}: DocumentTableCellMarginsDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const lengthUnit = documentLengthUnit(locale);
  const [scope, setScope] =
    useState<DocumentTableCellMarginsScope>(initialScope);
  // Each scope keeps its own unsubmitted margins: switching Apply to and
  // back must not throw away what was typed for the other one.
  const [draftsByScope, setDraftsByScope] = useState(() => ({
    table: marginDrafts(initialTableMargins, lengthUnit),
    cells: marginDrafts(initialCellMargins, lengthUnit),
  }));
  const drafts = draftsByScope[scope];
  // Cell Options: "Same as the whole table" = the cells carry no margins.
  const [sameAsTable, setSameAsTable] = useState(initialCellMargins === null);
  const [error, setError] = useState<string | null>(null);
  const [spacingEnabled, setSpacingEnabled] = useState(
    initialTableCellSpacing !== null,
  );
  // Word's own default when the box is first ticked: 0.02" (0.05 cm). The box shows the
  // gap between cells, twice the table's stored cell spacing (w:tblCellSpacing),
  // as Word's does: 0.08" in Word's box is stored as 57 twips (0.04") and draws
  // a 0.08" gap (measured in Word 16.86).
  // Shown to the hundredth, as Word shows it: the stored half of 0.08" is
  // whole twips (57), which reads back as 0.0792" and Word displays 0.08".
  const [spacingDraft, setSpacingDraft] = useState(
    initialTableCellSpacing === null
      ? lengthUnit === "cm"
        ? "0.05"
        : "0.02"
      : String(
          Math.round(
            ((initialTableCellSpacing * 2) / documentPxPerLengthUnit(lengthUnit)) * 100,
          ) / 100,
        ),
  );
  const [autoResize, setAutoResize] = useState(initialAutoResize);
  const unit =
    lengthUnit === "cm" ? t("toolbar.indentUnitCm") : t("toolbar.pageSetupUnitInches");
  const sideLabel = useMemo(
    () => ({
      top: t("toolbar.pageSetupMarginTop"),
      bottom: t("toolbar.pageSetupMarginBottom"),
      left: t("toolbar.pageSetupMarginLeft"),
      right: t("toolbar.pageSetupMarginRight"),
    }),
    [t],
  );

  // A blank table edge inherits the style's margin; a blank cell edge
  // inherits the table's effective one.
  const placeholderFor = (side: CellMarginSide): string | undefined => {
    const inherited =
      scope === "table"
        ? inheritedTableMargins?.[side]
        : (initialTableMargins?.[side] ?? inheritedTableMargins?.[side]);
    return inherited === undefined ? undefined : pxToLength(inherited, lengthUnit);
  };

  const selectScope = useCallback(
    (nextScope: DocumentTableCellMarginsScope) => {
      if (nextScope === "cells" && cellScopeDisabledReason) return;
      setScope(nextScope);
      setError(null);
    },
    [cellScopeDisabledReason],
  );

  const submit = useCallback(() => {
    if (!canEdit) return;
    let margins: CellMargins | null = null;
    if (scope === "table" || !sameAsTable) {
      const candidate: Partial<Record<CellMarginSide, number>> = {};
      for (const side of SIDE_ORDER) {
        const draft = drafts[side].trim();
        if (!draft) continue;
        const px = parseDocumentLengthPx(draft, lengthUnit);
        const value = px === null ? null : normalizeCellMarginSide(px, true);
        if (value === null) {
          setError(t("toolbar.tableOptionsInvalidMargin", { side: sideLabel[side] }));
          return;
        }
        candidate[side] = value;
      }
      margins = normalizeCellMargins(candidate);
    }
    let cellSpacingPx: number | null = null;
    if (scope === "table" && spacingEnabled) {
      const px = parseDocumentLengthPx(spacingDraft, lengthUnit);
      // The gap typed is twice what the table stores (see the box above).
      cellSpacingPx = px === null ? null : normalizeTableCellSpacingPx(px / 2);
      if (cellSpacingPx === null) {
        setError(t("toolbar.tableOptionsInvalidSpacing"));
        return;
      }
    }
    if (
      !onSubmit({
        scope,
        margins,
        cellSpacingPx,
        ...(scope === "table" ? { autoResize } : {}),
      })
    ) {
      setError(t("toolbar.tableOptionsChanged"));
      return;
    }
    onClose();
  }, [
    autoResize,
    canEdit,
    drafts,
    lengthUnit,
    onClose,
    onSubmit,
    sameAsTable,
    scope,
    sideLabel,
    spacingDraft,
    spacingEnabled,
    t,
  ]);

  const marginsDisabled = !canEdit || (scope === "cells" && sameAsTable);

  return (
    <OfficeDialogShell
      open={open}
      title={t(scope === "table" ? "toolbar.tableOptionsTitle" : "toolbar.cellOptionsTitle")}
      description={t(
        scope === "table"
          ? "toolbar.tableOptionsDescription"
          : "toolbar.cellOptionsDescription",
      )}
      defaultActionLabel={t("toolbar.dialogOk")}
      cancelActionLabel={t("toolbar.pageSetupCancel")}
      defaultActionDisabled={!canEdit}
      onDefaultAction={submit}
      onCancel={onClose}
      initialFocusRef={firstInputRef}
      returnFocusRef={returnFocusRef}
      testIdPrefix="document-table-cell-margins"
    >
      <fieldset className="office-dialog__group" disabled={!canEdit}>
        <legend>{t("toolbar.tableOptionsApplyTo")}</legend>
        <div className={styles.choiceRow}>
          {(["table", "cells"] as const).map((value) => {
            const disabled =
              value === "cells" && Boolean(cellScopeDisabledReason);
            return (
              <label
                key={value}
                className="office-dialog__check"
                title={
                  disabled ? (cellScopeDisabledReason ?? undefined) : undefined
                }
              >
                <input
                  type="radio"
                  name="document-table-cell-margin-scope"
                  value={value}
                  checked={scope === value}
                  disabled={disabled}
                  data-testid={`document-table-cell-margins-scope-${value}`}
                  onChange={() => selectScope(value)}
                />
                <DocumentDialogIcon icon={value === "table" ? "table.insert" : "table.select"} />
                <span>
                  {t(
                    value === "table"
                      ? "toolbar.tableOptionsScopeTable"
                      : "toolbar.tableOptionsScopeCells",
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <section className="office-dialog__group">
        <h3 className="office-dialog__section-title">
          {t(
            scope === "table"
              ? "toolbar.tableOptionsDefaultMargins"
              : "toolbar.cellOptionsMargins",
          )}
        </h3>
        {scope === "cells" ? (
          <label className="office-dialog__check">
            <input
              disabled={!canEdit}
              type="checkbox"
              checked={sameAsTable}
              data-testid="document-table-cell-margins-same-as-table"
              onChange={(event) => {
                setSameAsTable(event.target.checked);
                setError(null);
              }}
            />
            <span>{t("toolbar.cellOptionsSameAsTable")}</span>
          </label>
        ) : null}
        <div className={styles.twoColumns}>
          {SIDE_ORDER.map((side, index) => (
            <label key={side} className="office-dialog__field">
              <span className="office-dialog__label">{sideLabel[side]}</span>
              <span className={styles.valueRow}>
                <input
                  disabled={marginsDisabled}
                  ref={index === 0 ? firstInputRef : undefined}
                  type="text"
                  inputMode="decimal"
                  value={drafts[side]}
                  placeholder={placeholderFor(side)}
                  className={documentValueInputClassName("min-w-0 flex-1")}
                  data-testid={`document-table-cell-margins-${side}`}
                  aria-invalid={error ? "true" : undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraftsByScope((current) => ({
                      ...current,
                      [scope]: { ...current[scope], [side]: value },
                    }));
                    setError(null);
                  }}
                />
                <span className={styles.unit}>{unit}</span>
              </span>
            </label>
          ))}
        </div>
      </section>
      {scope === "table" ? (
        <>
          <section className="office-dialog__group">
            <h3 className="office-dialog__section-title">
              {t("toolbar.tableOptionsDefaultSpacing")}
            </h3>
            <div className={styles.valueRow}>
              <label className="office-dialog__check">
                <input
                  disabled={!canEdit}
                  type="checkbox"
                  checked={spacingEnabled}
                  data-testid="document-table-cell-spacing-enabled"
                  onChange={(event) => {
                    setSpacingEnabled(event.target.checked);
                    setError(null);
                  }}
                />
                <span>{t("toolbar.tableOptionsAllowSpacing")}</span>
              </label>
              <input
                disabled={!canEdit || !spacingEnabled}
                type="text"
                inputMode="decimal"
                value={spacingDraft}
                aria-label={t("toolbar.tableOptionsAllowSpacing")}
                data-testid="document-table-cell-spacing"
                className={documentValueInputClassName("ml-auto", {
                  inline: true,
                })}
                onChange={(event) => {
                  setSpacingDraft(event.target.value);
                  setError(null);
                }}
              />
              <span className={styles.unit}>{unit}</span>
            </div>
          </section>
          <section className="office-dialog__group">
            <h3 className="office-dialog__section-title">
              {t("toolbar.tableOptionsOptions")}
            </h3>
            <label className="office-dialog__check">
              <input
                disabled={!canEdit}
                type="checkbox"
                checked={autoResize}
                data-testid="document-table-options-auto-resize"
                onChange={(event) => setAutoResize(event.target.checked)}
              />
              <span>{t("toolbar.tableOptionsAutoResize")}</span>
            </label>
          </section>
        </>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="office-dialog__message"
          data-testid="document-table-cell-margins-error"
        >
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
