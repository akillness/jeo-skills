"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { concurrencyLimitOf } from "@mrnote/core/web/lib/concurrency-limit.ts";
import { friendlyMessageForCode } from "@mrnote/core/web/lib/errors/user-message.ts";
import { MAX_PICTURE_NAME_LENGTH, normalizedTableAltTextInput } from "../../../../lib/spreadsheet/drawing-buttons";
import { pageMarginSelectionFromPrintSettings } from "../../../../lib/spreadsheet/page-layout-buttons";
import { ImageIcon, ChartNoAxesCombined, Network, Shapes } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { isOfficeImportConnectionRequired, OFFICE_IMPORT_TOO_LARGE_CODES, OfficeImportRefusedError } from "@mrnote/docs/web/lib/document-import/officeImportProjectionClient.ts";
import { officePixelsToPoints } from "@mrnote/core/web/components/office-ribbon/officeTypographyCatalog.ts";
import { pageDocumentJsonEquals as copilotJsonEqual } from "@mrnote/core/web/lib/page-save-acknowledgement.ts";
import { type NativePageCommandRejectionReason } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { type ReferenceStyle } from "@mrnote/core/web/lib/spreadsheet/r1c1.ts";
import { type NamedRange } from "@mrnote/core/web/lib/spreadsheet/named-ranges.ts";
import { type DataTable } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { pivotSourceTableNamed } from "../../../../lib/spreadsheet/pivot-buttons";
import { sanitizeImageSource, SPREADSHEET_IMAGE_FILE_MIME_TYPES } from "@mrnote/core/web/lib/spreadsheet/sheet-image.ts";
import { fitSpreadsheetPictureSource, spreadsheetPictureFileByteCeiling, FittedPictureReader } from "../../../../lib/spreadsheet/sheet-image-fit";
import { type ConditionalRuleKind } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { type SpreadsheetViewOptions } from "../../../../lib/spreadsheet/view-options";
import { type SheetModel, type SpreadsheetObject } from "./spreadsheetSheetModel";
import { MAX_SHEET_COLS, MAX_SHEET_ROWS } from "./spreadsheetGridConstants";
import { mapCellKeyThroughLineEdit, remapCellEntryThroughLineEdit, type SheetLineEdit } from "@mrnote/core/web/lib/spreadsheet/structural.ts";

export function spreadsheetEditFailureMessage(
  t: (key: string) => string,
  reason?: NativePageCommandRejectionReason,
): string {
  if (reason === "invalid_image_source") {
    return t("spreadsheet.editRejectedImage");
  }
  if (reason === "payload_too_large") {
    return t("spreadsheet.editRejectedTooLarge");
  }
  return t("spreadsheet.editTargetNotFound");
}

// Flash Fill (Ctrl+E) and Merge Identical Cells report what they did, or why
// they did nothing, as a notification (Excel shows the Flash Fill count in the
// status bar and its no-pattern message in a box).
export function announceCommandResult(result: {
  kind: "success" | "error";
  text: string;
}) {
  toast(
    result.kind === "error"
      ? { variant: "destructive", description: result.text }
      : { description: result.text },
  );
}

export interface ProjectedWorkbookLinkReference {
  readonly workbookName: string;
  readonly sheetId: string;
  readonly row: number;
  readonly col: number;
}

export function projectedWorkbookLinkReferences(
  sheets: readonly SheetModel[],
): readonly ProjectedWorkbookLinkReference[] {
  const references: ProjectedWorkbookLinkReference[] = [];
  const workbookPattern = /\[([^\]\r\n]{1,255}\.(?:xlsx|xlsm|xlsb|xls))\]/gi;
  for (const sheet of sheets) {
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const formula = cell.formula ?? cell.value;
      if (typeof formula !== "string" || !formula.trim().startsWith("=")) {
        continue;
      }
      const coordinate = key.match(/^(\d+):(\d+)$/);
      if (!coordinate) continue;
      const workbookNames = new Set<string>();
      workbookPattern.lastIndex = 0;
      for (const match of formula.matchAll(workbookPattern)) {
        const workbookName = match[1]?.trim();
        if (workbookName) workbookNames.add(workbookName);
      }
      for (const workbookName of workbookNames) {
        references.push({
          workbookName,
          sheetId: sheet.id,
          row: Number(coordinate[1]),
          col: Number(coordinate[2]),
        });
      }
    }
  }
  return Object.freeze(references);
}

/** The Personal Macro Workbook's store, or null where storage is refused. */
export function personalMacroStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The table a PivotTable source box names (lib/spreadsheet/pivot-buttons). */
export function pivotSourceTableByName(
  workbook: readonly SheetModel[],
  rawName: string,
): { sheet: SheetModel; table: DataTable } | null {
  return pivotSourceTableNamed(workbook, rawName);
}

/** The Selection Pane's type glyph for a worksheet object. */
export function spreadsheetSelectionPaneIcon(object: {
  type: "image" | "chart" | "shape" | "smartart";
}): React.JSX.Element {
  const Icon =
    object.type === "image"
      ? ImageIcon
      : object.type === "chart"
        ? ChartNoAxesCombined
        : object.type === "smartart"
          ? Network
          : Shapes;
  return <Icon size={14} aria-hidden />;
}

/** Names the object the Alt Text pane shows: a new key reseeds its box. */
export function spreadsheetAltTextPaneKey(
  sheetId: string,
  object: SpreadsheetObject,
): string {
  return `${sheetId}:${object.type}:${object.id}`;
}

/** The Alt Text pane's key for the picture placed in a cell. */
export function spreadsheetCellPictureAltTextKey(
  sheetId: string,
  row: number,
  col: number,
): string {
  return `${sheetId}:cell-picture:${row}:${col}`;
}

export function normalizedPivotTableObjectName(value: string): string {
  const name = normalizedTableAltTextInput(
    value,
    MAX_PICTURE_NAME_LENGTH,
  );
  return /[\[\]:*?/\\]/.test(name) ? "" : name;
}

export function conditionalFormatKindIsClassicNativeEditable(
  kind: ConditionalRuleKind,
): boolean {
  return (
    kind === "comparison" ||
    kind === "formula" ||
    kind === "colorScale" ||
    kind === "dataBar" ||
    kind === "iconSet" ||
    kind === "textContains" ||
    kind === "duplicateValues" ||
    kind === "topBottom" ||
    kind === "aboveBelowAverage" ||
    kind === "dateOccurring"
  );
}

export function hasValidPageSetupSheetAuthority(sheet: SheetModel): boolean {
  return (
    typeof sheet.id === "string" &&
    sheet.id.length > 0 &&
    Number.isSafeInteger(sheet.rowCount) &&
    sheet.rowCount > 0 &&
    sheet.rowCount <= MAX_SHEET_ROWS &&
    Number.isSafeInteger(sheet.columnCount) &&
    sheet.columnCount > 0 &&
    sheet.columnCount <= MAX_SHEET_COLS &&
    pageMarginSelectionFromPrintSettings(sheet.printSettings) !== null
  );
}

export function namedRangeUiIdentity(entry: NamedRange): string {
  const scope = entry.scope ?? "workbook";
  const scopeSheetId = scope === "worksheet" ? entry.scopeSheetId ?? "" : "";
  return [entry.name, scope, scopeSheetId]
    .map((value) => encodeURIComponent(value.toLowerCase()))
    .join("--");
}

/**
 * Carry this client's not-yet-queued workbook edits over a remote load.
 *
 * `base` is the workbook the autosave already holds (the last one handed to
 * it, or the last load), `local` the workbook on screen with edits accepted
 * since, `remote` the incoming merge. What changed between base and local is
 * replayed over remote — per cell, and per sheet-level field — so a peer's
 * edit and the local one both survive; on the same cell the local entry wins,
 * because it is newer than the merge that raced it. A sheet the peer deleted
 * stays deleted; one this client added after `base` is kept (live audit
 * B026: an entry typed just before a sheet switch vanished when a load
 * replaced the workbook before the entry reached the save queue).
 *
 * `lineEdits` are collaborators' row/column edits `remote` brings (base and
 * local are from before them): a local entry is replayed at the address the
 * edits moved its cell to, its formula rewritten as they rewrote every other
 * cell, and one in a deleted line goes with it; the sheet keeps the remote
 * extent, grown to cover the replayed cells.
 */
export function rebaseLocalSheetEdits(
  base: readonly SheetModel[],
  local: readonly SheetModel[],
  remote: readonly SheetModel[],
  lineEdits: ReadonlyArray<SheetLineEdit & { sheetId: string }> = [],
): SheetModel[] {
  const baseById = new Map(base.map((candidate) => [candidate.id, candidate]));
  const localById = new Map(local.map((candidate) => [candidate.id, candidate]));
  const out: SheetModel[] = [];
  for (const remoteSheet of remote) {
    const localSheet = localById.get(remoteSheet.id);
    const baseSheet = baseById.get(remoteSheet.id);
    if (!localSheet) {
      // Deleted here after base: stay deleted. Unknown to base: a peer's.
      if (!baseSheet) out.push(remoteSheet);
      continue;
    }
    if (baseSheet === localSheet || !baseSheet) {
      out.push(baseSheet ? remoteSheet : localSheet);
      continue;
    }
    const merged: Record<string, unknown> = { ...remoteSheet };
    const localRecord = localSheet as unknown as Record<string, unknown>;
    const baseRecord = baseSheet as unknown as Record<string, unknown>;
    const edits = lineEdits.filter((edit) => edit.sheetId === remoteSheet.id);
    for (const key of new Set([...Object.keys(localRecord), ...Object.keys(baseRecord)])) {
      if (key === "cells") continue;
      if (edits.length > 0 && (key === "rowCount" || key === "columnCount")) continue;
      const next = localRecord[key];
      if (next === baseRecord[key] || copilotJsonEqual(next, baseRecord[key])) continue;
      if (next === undefined) delete merged[key];
      else merged[key] = next;
    }
    if (localSheet.cells !== baseSheet.cells) {
      const cells = { ...remoteSheet.cells };
      const localCells = localSheet.cells;
      const baseCells = baseSheet.cells;
      let rowCount = remoteSheet.rowCount, columnCount = remoteSheet.columnCount;
      for (const key of new Set([...Object.keys(localCells), ...Object.keys(baseCells)])) {
        const next = localCells[key];
        const before = baseCells[key];
        if (next === before || copilotJsonEqual(next, before)) continue;
        const at = edits.reduce<string | null>((moved, edit) => (moved === null ? null : mapCellKeyThroughLineEdit(moved, edit)), key);
        if (at === null) continue;
        if (next === undefined) {
          delete cells[at];
          continue;
        }
        cells[at] = edits.reduce((entry, edit) => remapCellEntryThroughLineEdit(entry, edit, remoteSheet.name), next);
        if (edits.length > 0) {
          const [row, col] = at.split(":").map(Number);
          if (Number.isInteger(row) && Number.isInteger(col)) {
            rowCount = Math.max(rowCount, row + 1);
            columnCount = Math.max(columnCount, col + 1);
          }
        }
      }
      merged.cells = cells;
      if (edits.length > 0) {
        merged.rowCount = rowCount;
        merged.columnCount = columnCount;
      }
    }
    out.push(merged as unknown as SheetModel);
  }
  // Sheets added here after base, kept in their local position order.
  for (const localSheet of local) {
    if (!baseById.has(localSheet.id) && !out.some((candidate) => candidate.id === localSheet.id)) {
      const at = local.indexOf(localSheet);
      out.splice(Math.min(at, out.length), 0, localSheet);
    }
  }
  return out;
}

/**
 * One picture file as the embedded data image a sheet stores: the type and
 * size checks Insert > Picture makes, then fitted to the page's
 * single-string bound and authenticated. Null for a file that is not one.
 */
export function readSpreadsheetPictureFile(file: File): Promise<string | null> {
  const type = file.type.toLowerCase();
  if (
    !SPREADSHEET_IMAGE_FILE_MIME_TYPES.includes(
      type as (typeof SPREADSHEET_IMAGE_FILE_MIME_TYPES)[number],
    ) ||
    file.size <= 0 ||
    file.size > spreadsheetPictureFileByteCeiling(type)
  ) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const reader = new FittedPictureReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      void fitSpreadsheetPictureSource(reader.result)
        .then((source) => resolve(source === null ? null : sanitizeImageSource(source)))
        .catch(() => resolve(null));
    };
    reader.readAsDataURL(file);
  });
}

/** Start a system-clipboard write and report whether it landed, never
 * throwing and never rejecting: the write may be refused outright, may throw
 * synchronously, or (in a test double) may not return a promise at all. */
export function quietClipboardWrite(start: () => unknown): Promise<boolean> {
  try {
    return Promise.resolve(start()).then(
      () => true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

/** Stored px -> the pt the control shows, at Excel's half-point resolution. */
export function spreadsheetPxToPt(px: number): number {
  return officePixelsToPoints(px);
}

/**
 * Where the formula suggestions or argument hint go: under the cell editor,
 * kept inside the browser window - shifted left from a cell near the right
 * edge, and above the editor when there is no room below (live audit B440).
 */
export function formulaIntelPlacement(
  anchor: { left: number; top: number; above?: number },
  width: number,
  height: number,
): { left: number; top: number } {
  if (typeof window === "undefined") return { left: anchor.left, top: anchor.top };
  const margin = 8;
  const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin));
  const fitsBelow = anchor.top + height + margin <= window.innerHeight;
  const top =
    fitsBelow || anchor.above === undefined
      ? anchor.top
      : Math.max(margin, anchor.above - height);
  return { left, top };
}

export interface TraceArrowEndpoint {
  sheetId: string;
  row: number;
  col: number;
}

interface TraceRelationship {
  from: TraceArrowEndpoint;
  to: TraceArrowEndpoint;
  /** The non-root endpoint selected when the user double-clicks the arrow. */
  navigateTo: TraceArrowEndpoint;
}

export type TraceMode = "precedents" | "dependents";

export interface TraceSession {
  mode: TraceMode;
  root: TraceArrowEndpoint;
  relationships: TraceRelationship[];
  /** Same-sheet cells discovered at the newest level and not yet expanded. */
  frontier: TraceArrowEndpoint[];
  /** Same-sheet cells already discovered, so cycles never re-enter the walk. */
  visited: string[];
}

export interface MoveCopySheetDialogAuthority {
  readonly pageId: string;
  readonly sheetId: string;
  readonly sheetIndex: number;
  readonly workbook: readonly SheetModel[];
  readonly sheet: SheetModel;
  readonly inventory: readonly string[];
}

export interface MoveCopySheetLiveAuthority {
  readonly pageId: string;
  readonly activeSheetIndex: number;
  readonly workbook: readonly SheetModel[];
  readonly sheet: SheetModel;
}

export interface WorkbookImportAuthority {
  readonly requestId: number;
  readonly pageId: string;
  readonly workbook: readonly SheetModel[];
  readonly title: string;
  readonly referenceStyle: ReferenceStyle;
  readonly viewOptions: SpreadsheetViewOptions;
}

export const systemSpreadsheetCalendarClock = (): Date => new Date();

/**
 * The URL folder of a workbook page, for CELL("filename"): Excel for the web
 * answers the folder of the document's URL, then "[Book.xlsx]Sheet" (X-194).
 * A page lives in its notebook, so the folder is the notebook's address on
 * this deployment, ending in "/". Undefined without a notebook or a window.
 */
export function spreadsheetWorkbookFolder(notebookId: string | null | undefined): string | undefined {
  if (!notebookId || typeof window === "undefined") return undefined;
  const origin = window.location?.origin;
  if (!origin || origin === "null") return undefined;
  return `${origin}/app/notebooks/${encodeURIComponent(notebookId)}/`;
}
let reviewCommentPageAuthorityGenerationSequence = 0;

export function spreadsheetZoomPositionFromPercent(
  percent: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(percent) || maximum <= minimum) return 0;
  return (Math.min(maximum, Math.max(minimum, percent)) - minimum) /
    (maximum - minimum);
}

export function spreadsheetZoomPercentFromPosition(
  position: number,
  minimum: number,
  maximum: number,
): number {
  const bounded = Number.isFinite(position)
    ? Math.min(1, Math.max(0, position))
    : 0;
  return Number((minimum + bounded * (maximum - minimum)).toFixed(2));
}

export const noZoomCommitSideEffect = () => undefined;

// XLS-A030: Excel's View tab order — Sheet View, Workbook Views, Show, Zoom,
// Window, then MRAI's Immersive Reader, then Macros.
const SPREADSHEET_VIEW_GROUP_ORDER = [
  "view-sheet-views",
  "view-workbook-views",
  "view-show",
  "view-zoom",
  "view-window",
  "view-immersive",
  "view-macros",
];
export function orderSpreadsheetViewGroups<T extends { id: string }>(groups: T[]): T[] {
  const rank = (group: T) => {
    const index = SPREADSHEET_VIEW_GROUP_ORDER.indexOf(group.id);
    return index < 0 ? SPREADSHEET_VIEW_GROUP_ORDER.length : index;
  };
  return [...groups].sort((left, right) => rank(left) - rank(right));
}

// XLS-A028: Excel for desktop's Review order — Proofing, Accessibility,
// Comments, Notes, Protect; MRAI's Changes (version history) last.
const SPREADSHEET_REVIEW_GROUP_ORDER = [
  "review-proofing",
  "review-accessibility",
  "review-comments",
  "review-notes",
  "review-protection",
  "review-changes",
];
export function orderSpreadsheetReviewGroups<T extends { id: string }>(groups: T[]): T[] {
  const rank = (group: T) => {
    const index = SPREADSHEET_REVIEW_GROUP_ORDER.indexOf(group.id);
    return index < 0 ? SPREADSHEET_REVIEW_GROUP_ORDER.length : index;
  };
  return [...groups].sort((left, right) => rank(left) - rank(right));
}

export function nextReviewCommentPageAuthorityGeneration(): number {
  reviewCommentPageAuthorityGenerationSequence += 1;
  return reviewCommentPageAuthorityGenerationSequence;
}

export function spreadsheetWorkbookImportFailureDescription(
  error: unknown,
  t: (key: string) => string,
): string {
  // The workbook is read on the server; without a connection there is no
  // reader at all.
  if (isOfficeImportConnectionRequired(error)) {
    return t("document.capability.onlineRequired");
  }
  if (error instanceof OfficeImportRefusedError) {
    // Past the server's size, archive-inflation or member budgets: the same
    // words the browser reader used for a worksheet past its safe limit.
    if (
      OFFICE_IMPORT_TOO_LARGE_CODES.has(error.code) ||
      /inflation or member budget/.test(error.message)
    ) {
      return t("spreadsheet.uiCopy.worksheetSafeImportLimit");
    }
    return t("spreadsheet.uiCopy.workbookCouldNotBeRead");
  }
  if (concurrencyLimitOf(error)) {
    return friendlyMessageForCode("concurrency_limited") ?? t("spreadsheet.uiCopy.workbookCouldNotBeRead");
  }
  if (error instanceof Error) return error.message;
  return t("spreadsheet.uiCopy.workbookCouldNotBeRead");
}
