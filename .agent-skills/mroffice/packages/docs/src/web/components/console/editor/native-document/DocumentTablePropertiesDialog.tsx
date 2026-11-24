"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import {
  documentLengthUnit,
  documentPxPerLengthUnit,
  documentTwipsPerLengthUnit,
} from "@mrnote/core/web/lib/document-length-fields.ts";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import type { OfficeSemanticIconId } from "@mrnote/core/web/components/office-ribbon/icons/officeIconRegistry.ts";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { DocumentDialogIcon } from "@mrnote/core/web/components/console/editor/native-document/DocumentDialogIcon.tsx";
import { documentValueInputClassName } from "@mrnote/core/web/components/console/editor/documentValueInput.ts";
import type { CellVerticalAlign } from "@mrnote/core/web/components/console/editor/native-document/tableCellStyle.ts";
import { MAX_TABLE_INDENT_PX, type TableAlign } from "@mrnote/core/web/components/console/editor/native-document/tableAlignment.ts";
import type {
  DocumentTablePropertiesChanges,
  DocumentTablePropertiesCommitResult,
  DocumentTablePropertiesRow,
  DocumentTablePropertiesTarget,
} from "./tableProperties";
import { DOCUMENT_TABLE_ALT_TEXT_MAX_LENGTH } from "./tableProperties";
import {
  DEFAULT_TABLE_ROW_HEIGHT,
  MAX_TABLE_COLUMN_WIDTH,
  MIN_TABLE_COLUMN_WIDTH,
} from "@mrnote/core/web/components/console/editor/native-document/tableStructure.ts";
import {
  MAX_ROW_HEIGHT_PX,
  MIN_ROW_HEIGHT_PX,
  normalizeTableRowHeight,
  type TableRowHeightRule,
} from "@mrnote/core/web/components/console/editor/native-document/tableRowStyle.ts";
import {
  TABLE_POSITION_MAX_TWIPS,
  tablePositioningInlineFloat,
  type TablePositioning,
} from "@mrnote/core/web/components/console/editor/native-document/tablePositioning.ts";

export type TablePropertiesTab =
  | "table"
  | "row"
  | "column"
  | "cell"
  | "altText";

export interface DocumentTablePropertiesDialogProps {
  readonly canEdit?: boolean;
  readonly open: boolean;
  readonly locale: string;
  readonly initialTab?: TablePropertiesTab;
  readonly target: DocumentTablePropertiesTarget;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onSubmit: (
    changes: DocumentTablePropertiesChanges,
  ) => DocumentTablePropertiesCommitResult;
  readonly onOpenBorders: () => void;
  readonly onOpenOptions: (scope: "table" | "cells") => void;
  readonly onClose: () => void;
}

interface TablePropertiesCopy {
  readonly title: string;
  readonly description: string;
  readonly tabs: Readonly<Record<TablePropertiesTab, string>>;
  readonly alignment: string;
  readonly alignments: Readonly<Record<TableAlign, string>>;
  readonly indentFromLeft: string;
  readonly tableIndentInvalid: string;
  readonly preferredWidth: string;
  readonly nativeWidthNotice: string;
  readonly tableWidth: string;
  readonly tableWidthUnit: string;
  readonly tableWidthInvalid: string;
  readonly wrapping: string;
  readonly wrapNone: string;
  readonly wrapAround: string;
  readonly wrappingSide: string;
  readonly surroundingTextDistance: string;
  readonly distanceEdges: Readonly<
    Record<"top" | "right" | "bottom" | "left", string>
  >;
  readonly distanceInvalid: string;
  readonly wrapUnavailable: string;
  readonly positioning: string;
  readonly positioningRequiresAround: string;
  readonly positioningUnavailable: string;
  readonly borders: string;
  readonly options: string;
  readonly rowPosition: (current: number, total: number) => string;
  readonly columnPosition: (current: number, total: number) => string;
  readonly cellPosition: (row: number, column: number) => string;
  /** The Cell tab over a selection of several cells. */
  readonly selectedCells: (count: number) => string;
  readonly previous: string;
  readonly next: string;
  readonly allowBreak: string;
  readonly repeatHeader: string;
  readonly repeatHeaderUnavailable: string;
  readonly specifyHeight: string;
  readonly rowHeight: string;
  readonly rowHeightRule: string;
  readonly rowHeightAtLeast: string;
  readonly rowHeightExact: string;
  readonly rowHeightUnit: string;
  readonly rowHeightInvalid: string;
  readonly columnWidth: string;
  readonly columnWidthUnit: string;
  readonly columnWidthInvalid: string;
  readonly columnWidthUnavailable: string;
  readonly cellWidthNotice: string;
  readonly verticalAlignment: string;
  readonly verticalAlignments: Readonly<Record<CellVerticalAlign, string>>;
  readonly altTextTitle: string;
  readonly altTextDescription: string;
  readonly altTextGuidance: string;
  readonly apply: string;
  readonly cancel: string;
  readonly stale: string;
}

function tablePropertiesCopy(
  t: (key: string, values?: Record<string, string | number>) => string,
): TablePropertiesCopy {
  const k = (leaf: string) => t(`toolbar.tablePropertiesDialog.${leaf}`);
  return {
    title: k("title"),
    description: k("description"),
    tabs: {
      table: k("tabs.table"),
      row: k("tabs.row"),
      column: k("tabs.column"),
      cell: k("tabs.cell"),
      altText: k("tabs.altText"),
    },
    alignment: k("alignment"),
    alignments: {
      left: k("alignments.left"),
      center: k("alignments.center"),
      right: k("alignments.right"),
    },
    indentFromLeft: k("indentFromLeft"),
    tableIndentInvalid: k("tableIndentInvalid"),
    preferredWidth: k("preferredWidth"),
    nativeWidthNotice: k("nativeWidthNotice"),
    tableWidth: k("tableWidth"),
    tableWidthUnit: k("tableWidthUnit"),
    tableWidthInvalid: k("tableWidthInvalid"),
    wrapping: k("wrapping"),
    wrapNone: k("wrapNone"),
    wrapAround: k("wrapAround"),
    wrappingSide: k("wrappingSide"),
    surroundingTextDistance: k("surroundingTextDistance"),
    distanceEdges: {
      top: k("distanceEdges.top"),
      right: k("distanceEdges.right"),
      bottom: k("distanceEdges.bottom"),
      left: k("distanceEdges.left"),
    },
    distanceInvalid: k("distanceInvalid"),
    wrapUnavailable: k("wrapUnavailable"),
    positioning: k("positioning"),
    positioningRequiresAround: k("positioningRequiresAround"),
    positioningUnavailable: k("positioningUnavailable"),
    borders: k("borders"),
    options: k("options"),
    rowPosition: (current, total) =>
      t("toolbar.tablePropertiesDialog.rowPosition", { current, total }),
    columnPosition: (current, total) =>
      t("toolbar.tablePropertiesDialog.columnPosition", { current, total }),
    cellPosition: (row, column) =>
      t("toolbar.tablePropertiesDialog.cellPosition", { row, column }),
    selectedCells: (count) =>
      t("toolbar.tablePropertiesDialog.selectedCells", { count }),
    previous: k("previous"),
    next: k("next"),
    allowBreak: k("allowBreak"),
    repeatHeader: k("repeatHeader"),
    repeatHeaderUnavailable: k("repeatHeaderUnavailable"),
    specifyHeight: k("specifyHeight"),
    rowHeight: k("rowHeight"),
    rowHeightRule: k("rowHeightRule"),
    rowHeightAtLeast: k("rowHeightAtLeast"),
    rowHeightExact: k("rowHeightExact"),
    rowHeightUnit: k("rowHeightUnit"),
    rowHeightInvalid: k("rowHeightInvalid"),
    columnWidth: k("columnWidth"),
    columnWidthUnit: k("columnWidthUnit"),
    columnWidthInvalid: k("columnWidthInvalid"),
    columnWidthUnavailable: k("columnWidthUnavailable"),
    cellWidthNotice: k("cellWidthNotice"),
    verticalAlignment: k("verticalAlignment"),
    verticalAlignments: {
      top: k("verticalAlignments.top"),
      middle: k("verticalAlignments.middle"),
      bottom: k("verticalAlignments.bottom"),
    },
    altTextTitle: k("altTextTitle"),
    altTextDescription: k("altTextDescription"),
    altTextGuidance: k("altTextGuidance"),
    apply: k("apply"),
    cancel: k("cancel"),
    stale: k("stale"),
  };
}

// The picture beside each alignment and wrapping choice, as Word draws its
// choices as pictures.
const TABLE_ALIGN_ICON = {
  left: "table.align.left",
  center: "table.align.center",
  right: "table.align.right",
} as const satisfies Record<TableAlign, OfficeSemanticIconId>;

const CELL_VERTICAL_ALIGN_ICON = {
  top: "table.cell.alignTop",
  middle: "table.cell.alignMiddle",
  bottom: "table.cell.alignBottom",
} as const satisfies Record<CellVerticalAlign, OfficeSemanticIconId>;

const TAB_ORDER: readonly TablePropertiesTab[] = [
  "table",
  "row",
  "column",
  "cell",
  "altText",
];

interface TablePropertiesRowDraft {
  readonly allowBreakAcrossPages: boolean;
  readonly repeatHeader?: boolean;
  readonly specifyHeight: boolean;
  readonly rowHeightDraft: string;
  readonly rowHeightRule: TableRowHeightRule;
}

function initialRowDraft(
  row: DocumentTablePropertiesRow,
  pxPerUnit: number,
): TablePropertiesRowDraft {
  return {
    allowBreakAcrossPages: row.allowBreakAcrossPages,
    repeatHeader: row.repeatHeader,
    specifyHeight: row.rowHeight !== null,
    rowHeightDraft: (
      (row.rowHeight ?? DEFAULT_TABLE_ROW_HEIGHT) / pxPerUnit
    ).toFixed(2),
    rowHeightRule: row.rowHeightRule,
  };
}

function scaledTableColumnWidths(
  columns: readonly number[],
  totalWidth: number,
): number[] | null {
  const target = Math.round(totalWidth);
  if (
    columns.length === 0 ||
    columns.some((width) => !Number.isFinite(width) || width <= 0) ||
    target < columns.length * MIN_TABLE_COLUMN_WIDTH ||
    target > MAX_TABLE_COLUMN_WIDTH
  ) {
    return null;
  }
  const result = Array<number>(columns.length).fill(0);
  let remainingIndexes = columns.map((_, index) => index);
  let remainingWidth = target;
  while (remainingIndexes.length > 0) {
    const weight = remainingIndexes.reduce(
      (sum, index) => sum + columns[index],
      0,
    );
    const constrained = remainingIndexes.filter(
      (index) =>
        (remainingWidth * columns[index]) / weight < MIN_TABLE_COLUMN_WIDTH,
    );
    if (constrained.length === 0) break;
    for (const index of constrained) result[index] = MIN_TABLE_COLUMN_WIDTH;
    remainingWidth -= constrained.length * MIN_TABLE_COLUMN_WIDTH;
    remainingIndexes = remainingIndexes.filter(
      (index) => !constrained.includes(index),
    );
  }
  if (remainingIndexes.length === 0) return result;
  const remainingWeight = remainingIndexes.reduce(
    (sum, index) => sum + columns[index],
    0,
  );
  const shares = remainingIndexes.map((index) => {
    const raw = (remainingWidth * columns[index]) / remainingWeight;
    return { index, floor: Math.floor(raw), fraction: raw - Math.floor(raw) };
  });
  let remainder =
    remainingWidth - shares.reduce((sum, share) => sum + share.floor, 0);
  for (const share of [...shares].sort(
    (left, right) => right.fraction - left.fraction || left.index - right.index,
  )) {
    if (remainder <= 0) break;
    share.floor += 1;
    remainder -= 1;
  }
  for (const share of shares) result[share.index] = share.floor;
  return result;
}

function defaultAroundPositioning(): TablePositioning {
  return {
    schemaVersion: 1,
    horizontalAnchor: "margin",
    verticalAnchor: "text",
    horizontal: { mode: "align", value: "left" },
    vertical: { mode: "align", value: "inline" },
    distanceFromText: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

function editableAroundSide(
  positioning: TablePositioning | null,
): "left" | "right" | null {
  if (
    positioning?.horizontalAnchor !== "margin" ||
    positioning.verticalAnchor !== "text"
  ) {
    return null;
  }
  return tablePositioningInlineFloat(positioning);
}

const TABLE_POSITION_DISTANCE_EDGES = [
  "top",
  "right",
  "bottom",
  "left",
] as const;
type TablePositionDistanceEdge = (typeof TABLE_POSITION_DISTANCE_EDGES)[number];

function initialPositionDistanceDrafts(
  positioning: TablePositioning | null,
  twipsPerUnit: number,
): Record<TablePositionDistanceEdge, string> {
  return Object.fromEntries(
    TABLE_POSITION_DISTANCE_EDGES.map((edge) => [
      edge,
      (
        (positioning?.distanceFromText[edge] ?? 0) / twipsPerUnit
      ).toFixed(2),
    ]),
  ) as Record<TablePositionDistanceEdge, string>;
}

function positionDistanceTwips(
  value: string,
  twipsPerUnit: number,
): number | null {
  if (!value.trim()) return null;
  const numeric = Number(value);
  const twips = Math.round(numeric * twipsPerUnit);
  return Number.isFinite(numeric) &&
    numeric >= 0 &&
    Number.isInteger(twips) &&
    twips <= TABLE_POSITION_MAX_TWIPS
    ? twips
    : null;
}

export function DocumentTablePropertiesDialog({
  canEdit = true,
  open,
  initialTab = "table",
  target,
  returnFocusRef,
  onSubmit,
  onOpenBorders,
  onOpenOptions,
  onClose,
}: DocumentTablePropertiesDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const copy = useMemo(() => tablePropertiesCopy(t), [t]);
  // Every length in Word's measurement unit for the locale (centimetres in
  // Chinese Word, inches in US English), as the ribbon's Cell Size fields.
  const lengthUnit = documentLengthUnit(useLocale());
  const pxPerUnit = documentPxPerLengthUnit(lengthUnit);
  const twipsPerUnit = documentTwipsPerLengthUnit(lengthUnit);
  const unitLabel =
    lengthUnit === "cm" ? t("toolbar.indentUnitCm") : copy.tableWidthUnit;
  const firstTabRef = useRef<HTMLButtonElement | null>(null);
  const [tab, setTab] = useState<TablePropertiesTab>(initialTab);
  const [tableAlign, setTableAlign] = useState<TableAlign>(target.tableAlign);
  const [tableIndentDraft, setTableIndentDraft] = useState(
    (target.tableIndentPx / pxPerUnit).toFixed(2),
  );
  const [tablePositioning, setTablePositioning] =
    useState<TablePositioning | null>(target.tablePositioning);
  const [positionDistanceDrafts, setPositionDistanceDrafts] = useState(() =>
    initialPositionDistanceDrafts(target.tablePositioning, twipsPerUnit),
  );
  const [positioningOpen, setPositioningOpen] = useState(false);
  const [tableCaption, setTableCaption] = useState(target.tableCaption);
  const [tableDescription, setTableDescription] = useState(
    target.tableDescription,
  );
  const [rowIndex, setRowIndex] = useState(target.initialRowIndex);
  const [columnIndex, setColumnIndex] = useState(target.initialColumnIndex);
  const [cellIndex, setCellIndex] = useState(target.initialCellIndex);
  // Opened on several cells, the Cell tab formats all of them (Word, and
  // the ribbon's alignment grid); Previous / Next then step through single
  // cells, one at a time.
  const selectedCellIndexes = target.selectedCellIndexes ?? [
    target.initialCellIndex,
  ];
  const [cellScope, setCellScope] = useState<"selection" | "single">(() =>
    selectedCellIndexes.length > 1 ? "selection" : "single",
  );
  const [rowDrafts, setRowDrafts] = useState<
    Record<number, TablePropertiesRowDraft>
  >({});
  const [columnDrafts, setColumnDrafts] = useState<Record<number, string>>({});
  const initialTableWidths = target.columns.map((column) => column.widthPx);
  const initialTableWidth = initialTableWidths.every(
    (width): width is number => width !== null,
  )
    ? initialTableWidths.reduce((sum, width) => sum + width, 0)
    : null;
  const [tableWidthDraft, setTableWidthDraft] = useState(
    initialTableWidth === null ? "" : (initialTableWidth / pxPerUnit).toFixed(2),
  );
  const [tableWidthDirty, setTableWidthDirty] = useState(false);
  const [cellDrafts, setCellDrafts] = useState<
    Record<number, CellVerticalAlign>
  >({});
  const [error, setError] = useState<string | null>(null);

  const currentRow = target.rows[rowIndex] ?? target.rows[0];
  const currentCell = target.cells[cellIndex] ?? target.cells[0];
  const currentColumn = target.columns[columnIndex] ?? target.columns[0];
  const currentRowDraft =
    rowDrafts[currentRow.index] ?? initialRowDraft(currentRow, pxPerUnit);
  const scopedCells =
    cellScope === "selection"
      ? selectedCellIndexes.flatMap((index) =>
          target.cells[index] ? [target.cells[index]] : [],
        )
      : [currentCell];
  const scopedAligns = new Set(
    scopedCells.map((cell) => cellDrafts[cell.index] ?? cell.verticalAlign),
  );
  // Cells that disagree show no alignment chosen, as Word's mixed state.
  const currentCellAlign =
    scopedAligns.size === 1 ? [...scopedAligns][0] : null;
  const aroundSide = editableAroundSide(tablePositioning);

  const submit = useCallback(() => {
    if (!canEdit) return;
    const rawTableIndentPx = Number(tableIndentDraft) * pxPerUnit;
    if (
      !Number.isFinite(rawTableIndentPx) ||
      Math.abs(rawTableIndentPx) > MAX_TABLE_INDENT_PX
    ) {
      setError(copy.tableIndentInvalid);
      return;
    }
    const rows: DocumentTablePropertiesChanges["rows"][number][] = [];
    for (const [index, value] of Object.entries(rowDrafts)) {
      const parsedHeight = value.specifyHeight
        ? normalizeTableRowHeight(Number(value.rowHeightDraft) * pxPerUnit)
        : null;
      if (value.specifyHeight && parsedHeight === null) {
        setError(copy.rowHeightInvalid);
        return;
      }
      rows.push({
        index: Number(index),
        allowBreakAcrossPages: value.allowBreakAcrossPages,
        repeatHeader: value.repeatHeader,
        rowHeight: parsedHeight,
        rowHeightRule: value.rowHeightRule,
      });
    }
    let columns: NonNullable<
      DocumentTablePropertiesChanges["columns"]
    >[number][] = [];
    for (const [index, value] of Object.entries(columnDrafts)) {
      const widthPx = Number(value) * pxPerUnit;
      const roundedWidthPx = Math.round(widthPx);
      if (
        !Number.isFinite(widthPx) ||
        roundedWidthPx < MIN_TABLE_COLUMN_WIDTH ||
        roundedWidthPx > MAX_TABLE_COLUMN_WIDTH
      ) {
        setError(copy.columnWidthInvalid);
        return;
      }
      columns.push({ index: Number(index), widthPx });
    }
    if (tableWidthDirty) {
      if (initialTableWidth === null) {
        setError(copy.tableWidthInvalid);
        return;
      }
      const requestedBase = target.columns.map((column) => {
        const drafted = columnDrafts[column.index];
        return drafted === undefined
          ? (column.widthPx as number)
          : Number(drafted) * pxPerUnit;
      });
      const scaled = scaledTableColumnWidths(
        requestedBase,
        Number(tableWidthDraft) * pxPerUnit,
      );
      if (!scaled) {
        setError(copy.tableWidthInvalid);
        return;
      }
      columns = scaled.map((widthPx, index) => ({ index, widthPx }));
    }
    let submittedTablePositioning = tablePositioning;
    if (tablePositioning && aroundSide !== null) {
      const parsedDistances = Object.fromEntries(
        TABLE_POSITION_DISTANCE_EDGES.map((edge) => [
          edge,
          positionDistanceTwips(positionDistanceDrafts[edge], twipsPerUnit),
        ]),
      ) as Record<TablePositionDistanceEdge, number | null>;
      if (
        TABLE_POSITION_DISTANCE_EDGES.some(
          (edge) => parsedDistances[edge] === null,
        )
      ) {
        setError(copy.distanceInvalid);
        return;
      }
      submittedTablePositioning = {
        ...tablePositioning,
        distanceFromText: parsedDistances as Record<
          TablePositionDistanceEdge,
          number
        >,
      };
    }
    const result = onSubmit({
      tableAlign,
      tableIndentPx: Math.round(rawTableIndentPx),
      tablePositioning: submittedTablePositioning,
      tableCaption,
      tableDescription,
      rows: rows.sort((left, right) => left.index - right.index),
      columns: columns.sort((left, right) => left.index - right.index),
      cells: Object.entries(cellDrafts)
        .map(([index, verticalAlign]) => ({
          index: Number(index),
          verticalAlign,
        }))
        .sort((left, right) => left.index - right.index),
    });
    if (result === "stale") {
      setError(copy.stale);
      return;
    }
    if (result === "invalid") {
      setError(copy.columnWidthInvalid);
      return;
    }
    onClose();
  }, [
    canEdit,
    cellDrafts,
    columnDrafts,
    copy.columnWidthInvalid,
    copy.distanceInvalid,
    copy.tableIndentInvalid,
    copy.rowHeightInvalid,
    copy.stale,
    copy.tableWidthInvalid,
    initialTableWidth,
    onClose,
    onSubmit,
    aroundSide,
    positionDistanceDrafts,
    rowDrafts,
    tableAlign,
    tableCaption,
    tableDescription,
    tableIndentDraft,
    tablePositioning,
    tableWidthDirty,
    tableWidthDraft,
    target.columns,
    pxPerUnit,
    twipsPerUnit,
  ]);

  const moveCell = useCallback(
    (delta: number) => {
      setCellIndex((current) =>
        Math.max(0, Math.min(target.cells.length - 1, current + delta)),
      );
      setCellScope("single");
      setError(null);
    },
    [target.cells.length],
  );

  return (
    <OfficeDialogShell
      open={open}
      title={copy.title}
      description={copy.description}
      defaultActionLabel={copy.apply}
      cancelActionLabel={copy.cancel}
      defaultActionDisabled={!canEdit}
      onDefaultAction={submit}
      onCancel={onClose}
      initialFocusRef={firstTabRef}
      returnFocusRef={returnFocusRef}
      className="sm:max-w-[620px]"
      testIdPrefix="document-table-properties"
      tabStrip={
        <div
          className={parts.tabs}
          role="tablist"
          aria-label={copy.title}
        >
          {TAB_ORDER.map((value) => (
            <button
              key={value}
              disabled={!canEdit}
              ref={value === initialTab ? firstTabRef : undefined}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={parts.tab}
              data-testid={`document-table-properties-tab-${value}`}
              onClick={() => {
                setTab(value);
                setError(null);
              }}
            >
              {copy.tabs[value]}
            </button>
          ))}
        </div>
      }
    >
      <div role="tabpanel" className="grid min-h-64 gap-4">
        {tab === "table" ? (
          <>
            <fieldset className={parts.group} disabled={!canEdit}>
              <legend className={parts.sectionTitle}>
                {copy.alignment}
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {(["left", "center", "right"] as const).map((value) => (
                  <label
                    key={value}
                    className={`${parts.choice} flex items-center gap-2`}
                  >
                    <input
                      type="radio"
                      name="document-table-properties-align"
                      value={value}
                      checked={tableAlign === value}
                      onChange={() => {
                        setTableAlign(value);
                        setError(null);
                      }}
                    />
                    <OfficeSemanticIcon
                      semanticId={TABLE_ALIGN_ICON[value]}
                      size={16}
                      className="office-dialog__icon"
                    />
                    <span>{copy.alignments[value]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className={parts.field}>
              <span className={parts.label}>{copy.indentFromLeft}</span>
              <span className={parts.measure}>
                <input
                  disabled={!canEdit || tableAlign !== "left"}
                  type="number"
                  min={(-MAX_TABLE_INDENT_PX / pxPerUnit).toFixed(2)}
                  max={(MAX_TABLE_INDENT_PX / pxPerUnit).toFixed(2)}
                  step="0.01"
                  value={tableIndentDraft}
                  data-testid="document-table-properties-table-indent"
                  className={documentValueInputClassName("min-w-0 flex-1")}
                  onChange={(event) => {
                    setTableIndentDraft(event.target.value);
                    setError(null);
                  }}
                />
                <span className={parts.hint}>
                  {unitLabel}
                </span>
              </span>
            </label>
            <section className={parts.group}>
              <h3 className={parts.sectionTitle}>{copy.preferredWidth}</h3>
              {initialTableWidth === null ? null : (
                <label className={parts.field}>
                  <span className={parts.label}>{copy.tableWidth}</span>
                  <span className={parts.measure}>
                    <input
                      disabled={!canEdit}
                      type="number"
                      min={(
                        (target.columnCount * MIN_TABLE_COLUMN_WIDTH) /
                        pxPerUnit
                      ).toFixed(2)}
                      max={(MAX_TABLE_COLUMN_WIDTH / pxPerUnit).toFixed(2)}
                      step="0.01"
                      value={tableWidthDraft}
                      data-testid="document-table-properties-table-width"
                      className={documentValueInputClassName("min-w-0 flex-1")}
                      onChange={(event) => {
                        setTableWidthDraft(event.target.value);
                        setTableWidthDirty(true);
                        setError(null);
                      }}
                    />
                    <span className={parts.hint}>
                      {unitLabel}
                    </span>
                  </span>
                </label>
              )}
              <p className={parts.hint}>
                {copy.nativeWidthNotice}
              </p>
            </section>
            <fieldset className={parts.group} disabled={!canEdit}>
              <legend className={parts.sectionTitle}>{copy.wrapping}</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className={`${parts.choice} flex items-center gap-2`}>
                  <input
                    type="radio"
                    name="document-table-properties-wrapping"
                    checked={tablePositioning === null}
                    onChange={() => {
                      setTablePositioning(null);
                      setPositioningOpen(false);
                      setError(null);
                    }}
                  />
                  <OfficeSemanticIcon
                    semanticId="table.wrap.none"
                    size={16}
                    className="office-dialog__icon"
                  />
                  <span>{copy.wrapNone}</span>
                </label>
                <label className={`${parts.choice} flex items-center gap-2`}>
                  <input
                    type="radio"
                    name="document-table-properties-wrapping"
                    checked={tablePositioning !== null}
                    onChange={() => {
                      setTablePositioning(
                        tablePositioning ?? defaultAroundPositioning(),
                      );
                      setError(null);
                    }}
                  />
                  <OfficeSemanticIcon
                    semanticId="table.wrap.around"
                    size={16}
                    className="office-dialog__icon"
                  />
                  <span>{copy.wrapAround}</span>
                </label>
              </div>
              <p className={parts.hint}>
                {copy.wrapUnavailable}
              </p>
              <button
                type="button"
                disabled={!canEdit || aroundSide === null}
                aria-controls="document-table-properties-positioning-panel"
                aria-expanded={positioningOpen}
                data-testid="document-table-properties-positioning"
                className={`${parts.button} self-end`}
                title={
                  tablePositioning === null
                    ? copy.positioningRequiresAround
                    : aroundSide === null
                      ? copy.positioningUnavailable
                      : copy.positioning
                }
                aria-label={
                  tablePositioning === null
                    ? `${copy.positioning}: ${copy.positioningRequiresAround}`
                    : aroundSide === null
                      ? `${copy.positioning}: ${copy.positioningUnavailable}`
                      : copy.positioning
                }
                onClick={() => setPositioningOpen((current) => !current)}
              >
                <DocumentDialogIcon icon="nav.move" />
                {copy.positioning}
              </button>
              {tablePositioning && positioningOpen ? (
                <div
                  id="document-table-properties-positioning-panel"
                  role="group"
                  aria-label={copy.wrappingSide}
                  data-testid="document-table-properties-wrap-side"
                  className="grid gap-2"
                  title={
                    aroundSide === null
                      ? copy.positioningUnavailable
                      : undefined
                  }
                >
                  <span className={parts.label}>
                    {copy.wrappingSide}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(["left", "right"] as const).map((side) => (
                      <label
                        key={side}
                        className={`${parts.choice} flex items-center gap-2`}
                      >
                        <input
                          type="radio"
                          name="document-table-properties-wrap-side"
                          checked={aroundSide === side}
                          disabled={aroundSide === null}
                          data-testid={`document-table-properties-wrap-side-${side}`}
                          onChange={() => {
                            if (!tablePositioning || aroundSide === null)
                              return;
                            setTablePositioning({
                              ...tablePositioning,
                              horizontal: { mode: "align", value: side },
                            });
                            setError(null);
                          }}
                        />
                        <span>{copy.alignments[side]}</span>
                      </label>
                    ))}
                  </div>
                  {aroundSide !== null ? (
                    <div
                      className="grid gap-2"
                      data-testid="document-table-properties-wrap-distance"
                    >
                      <span className={parts.label}>
                        {copy.surroundingTextDistance}
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {TABLE_POSITION_DISTANCE_EDGES.map((edge) => (
                          <label key={edge} className={parts.field}>
                            <span className={parts.label}>{copy.distanceEdges[edge]}</span>
                            <span className={parts.measure}>
                              <input
                                type="number"
                                min="0"
                                max={(
                                  TABLE_POSITION_MAX_TWIPS / twipsPerUnit
                                ).toFixed(2)}
                                step="0.01"
                                value={positionDistanceDrafts[edge]}
                                data-testid={`document-table-properties-wrap-distance-${edge}`}
                                className={documentValueInputClassName("min-w-0 flex-1")}
                                onChange={(event) => {
                                  setPositionDistanceDrafts((current) => ({
                                    ...current,
                                    [edge]: event.target.value,
                                  }));
                                  setError(null);
                                }}
                              />
                              <span className={parts.hint}>
                                {unitLabel}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
            <div className="flex justify-end gap-2">
              <button
                disabled={!canEdit}
                type="button"
                className={parts.button}
                data-testid="document-table-properties-borders"
                onClick={onOpenBorders}
              >
                <DocumentDialogIcon icon="table.borders" />
                {copy.borders}
              </button>
              <button
                disabled={!canEdit}
                type="button"
                className={parts.button}
                data-testid="document-table-properties-table-options"
                onClick={() => onOpenOptions("table")}
              >
                <DocumentDialogIcon icon="app.sliders" />
                {copy.options}
              </button>
            </div>
          </>
        ) : null}

        {tab === "row" ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <strong className={parts.sectionTitle}>
                {copy.rowPosition(currentRow.index + 1, target.rows.length)}
              </strong>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={parts.compactButton}
                  disabled={!canEdit || rowIndex <= 0}
                  onClick={() => {
                    setRowIndex((value) => Math.max(0, value - 1));
                    setError(null);
                  }}
                >
                  {copy.previous}
                </button>
                <button
                  type="button"
                  className={parts.compactButton}
                  disabled={!canEdit || rowIndex >= target.rows.length - 1}
                  onClick={() => {
                    setRowIndex((value) =>
                      Math.min(target.rows.length - 1, value + 1),
                    );
                    setError(null);
                  }}
                >
                  {copy.next}
                </button>
              </div>
            </div>
            <label
              className={parts.check}
            >
              <input
                disabled={!canEdit}
                type="checkbox"
                checked={currentRowDraft.allowBreakAcrossPages}
                onChange={(event) => {
                  setRowDrafts((current) => ({
                    ...current,
                    [currentRow.index]: {
                      ...currentRowDraft,
                      allowBreakAcrossPages: event.target.checked,
                    },
                  }));
                  setError(null);
                }}
              />
              <span>{copy.allowBreak}</span>
            </label>
            <label
              className={parts.check}
              title={copy.repeatHeaderUnavailable}
            >
              <input
                disabled={!canEdit}
                type="checkbox"
                checked={currentRowDraft.repeatHeader === true}
                onChange={(event) => {
                  const repeatHeader = event.target.checked;
                  setRowDrafts((current) => {
                    const next = { ...current };
                    for (const row of target.rows) {
                      if (
                        (repeatHeader && row.index <= currentRow.index) ||
                        (!repeatHeader && row.index >= currentRow.index)
                      ) {
                        next[row.index] = {
                          ...(current[row.index] ?? initialRowDraft(row, pxPerUnit)),
                          repeatHeader,
                        };
                      }
                    }
                    return next;
                  });
                  setError(null);
                }}
              />
              <span>{copy.repeatHeader}</span>
            </label>
            <p className={parts.hint}>
              {copy.repeatHeaderUnavailable}
            </p>
            <fieldset
              className={parts.group}
              disabled={!canEdit}
            >
              <legend className={parts.sectionTitle}>
                {copy.rowHeight}
              </legend>
              <label className={parts.check}>
                <input
                  type="checkbox"
                  checked={currentRowDraft.specifyHeight}
                  data-testid="document-table-properties-row-specify-height"
                  onChange={(event) => {
                    setRowDrafts((current) => ({
                      ...current,
                      [currentRow.index]: {
                        ...currentRowDraft,
                        specifyHeight: event.target.checked,
                      },
                    }));
                    setError(null);
                  }}
                />
                <span>{copy.specifyHeight}</span>
              </label>
              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <label className={parts.field}>
                  <span className={parts.label}>{copy.rowHeight}</span>
                  <span className={parts.measure}>
                    <input
                      type="number"
                      min={(MIN_ROW_HEIGHT_PX / pxPerUnit).toFixed(2)}
                      max={(MAX_ROW_HEIGHT_PX / pxPerUnit).toFixed(2)}
                      step="0.01"
                      disabled={!currentRowDraft.specifyHeight}
                      value={currentRowDraft.rowHeightDraft}
                      data-testid="document-table-properties-row-height"
                      className={documentValueInputClassName("min-w-0 flex-1")}
                      onChange={(event) => {
                        setRowDrafts((current) => ({
                          ...current,
                          [currentRow.index]: {
                            ...currentRowDraft,
                            rowHeightDraft: event.target.value,
                          },
                        }));
                        setError(null);
                      }}
                    />
                    <span className={parts.hint}>
                      {unitLabel}
                    </span>
                  </span>
                </label>
                <label className={parts.field}>
                  <span className={parts.label}>{copy.rowHeightRule}</span>
                  <select
                    disabled={!currentRowDraft.specifyHeight}
                    value={currentRowDraft.rowHeightRule}
                    data-testid="document-table-properties-row-height-rule"
                    onChange={(event) => {
                      const rowHeightRule = event.target
                        .value as TableRowHeightRule;
                      setRowDrafts((current) => ({
                        ...current,
                        [currentRow.index]: {
                          ...currentRowDraft,
                          rowHeightRule,
                        },
                      }));
                      setError(null);
                    }}
                  >
                    <option value="atLeast">{copy.rowHeightAtLeast}</option>
                    <option value="exact">{copy.rowHeightExact}</option>
                  </select>
                </label>
              </div>
            </fieldset>
          </>
        ) : null}

        {tab === "column" ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <strong className={parts.sectionTitle}>
                {copy.columnPosition(columnIndex + 1, target.columnCount)}
              </strong>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={parts.compactButton}
                  disabled={!canEdit || columnIndex <= 0}
                  onClick={() =>
                    setColumnIndex((value) => Math.max(0, value - 1))
                  }
                >
                  {copy.previous}
                </button>
                <button
                  type="button"
                  className={parts.compactButton}
                  disabled={!canEdit || columnIndex >= target.columnCount - 1}
                  onClick={() =>
                    setColumnIndex((value) =>
                      Math.min(target.columnCount - 1, value + 1),
                    )
                  }
                >
                  {copy.next}
                </button>
              </div>
            </div>
            {currentColumn?.widthPx === null || !currentColumn ? (
              <p className={parts.message}>
                {copy.columnWidthUnavailable}
              </p>
            ) : (
              <label className={parts.field}>
                <span className={parts.label}>{copy.columnWidth}</span>
                <span className={parts.measure}>
                  <input
                    disabled={!canEdit}
                    type="number"
                    min={(MIN_TABLE_COLUMN_WIDTH / pxPerUnit).toFixed(2)}
                    max={(MAX_TABLE_COLUMN_WIDTH / pxPerUnit).toFixed(2)}
                    step="0.01"
                    value={
                      columnDrafts[currentColumn.index] ??
                      (currentColumn.widthPx / pxPerUnit).toFixed(2)
                    }
                    data-testid="document-table-properties-column-width"
                    className={documentValueInputClassName("min-w-0 flex-1")}
                    onChange={(event) => {
                      setColumnDrafts((current) => ({
                        ...current,
                        [currentColumn.index]: event.target.value,
                      }));
                      setError(null);
                    }}
                  />
                  <span className={parts.hint}>
                    {unitLabel}
                  </span>
                </span>
              </label>
            )}
          </>
        ) : null}

        {tab === "cell" ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <strong className={parts.sectionTitle}>
                {cellScope === "selection"
                  ? copy.selectedCells(scopedCells.length)
                  : copy.cellPosition(currentCell.row + 1, currentCell.column + 1)}
              </strong>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={parts.compactButton}
                  disabled={!canEdit || cellIndex <= 0}
                  onClick={() => moveCell(-1)}
                >
                  {copy.previous}
                </button>
                <button
                  type="button"
                  className={parts.compactButton}
                  disabled={!canEdit || cellIndex >= target.cells.length - 1}
                  onClick={() => moveCell(1)}
                >
                  {copy.next}
                </button>
              </div>
            </div>
            <fieldset className={parts.group} disabled={!canEdit}>
              <legend className={parts.sectionTitle}>
                {copy.verticalAlignment}
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {(["top", "middle", "bottom"] as const).map((value) => (
                  <label
                    key={value}
                    className={`${parts.choice} flex items-center gap-2`}
                  >
                    <input
                      type="radio"
                      name="document-table-properties-cell-vertical-align"
                      value={value}
                      checked={currentCellAlign === value}
                      onChange={() => {
                        setCellDrafts((current) => {
                          const next = { ...current };
                          for (const cell of scopedCells) next[cell.index] = value;
                          return next;
                        });
                        setError(null);
                      }}
                    />
                    <OfficeSemanticIcon
                      semanticId={CELL_VERTICAL_ALIGN_ICON[value]}
                      size={16}
                      className="office-dialog__icon"
                    />
                    <span>{copy.verticalAlignments[value]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className={parts.message}>
              {copy.cellWidthNotice}
            </p>
            <div className="flex justify-end gap-2">
              <button
                disabled={!canEdit}
                type="button"
                className={parts.button}
                data-testid="document-table-properties-cell-borders"
                onClick={onOpenBorders}
              >
                <DocumentDialogIcon icon="table.borders" />
                {copy.borders}
              </button>
              <button
                disabled={!canEdit}
                type="button"
                className={parts.button}
                data-testid="document-table-properties-cell-options"
                onClick={() => onOpenOptions("cells")}
              >
                <DocumentDialogIcon icon="app.sliders" />
                {copy.options}
              </button>
            </div>
          </>
        ) : null}

        {tab === "altText" ? (
          <section className="grid content-start gap-4">
            <p className={parts.hint}>
              {copy.altTextGuidance}
            </p>
            <label className={parts.field}>
              <span className={parts.label}>{copy.altTextTitle}</span>
              <input
                disabled={!canEdit}
                type="text"
                value={tableCaption}
                maxLength={DOCUMENT_TABLE_ALT_TEXT_MAX_LENGTH}
                data-testid="document-table-properties-alt-text-title"
                onChange={(event) => {
                  setTableCaption(event.target.value);
                  setError(null);
                }}
              />
            </label>
            <label className={parts.field}>
              <span className={parts.label}>{copy.altTextDescription}</span>
              <textarea
                disabled={!canEdit}
                value={tableDescription}
                maxLength={DOCUMENT_TABLE_ALT_TEXT_MAX_LENGTH}
                rows={5}
                data-testid="document-table-properties-alt-text-description"
                className="resize-y"
                onChange={(event) => {
                  setTableDescription(event.target.value);
                  setError(null);
                }}
              />
            </label>
          </section>
        ) : null}
      </div>

      {error ? (
        <p className={parts.error} role="alert">
          {error}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}
