/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type CellMap } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { type AutoRowMeasurement } from "./useSpreadsheetAutoRowHeights";
import { type CSSProperties } from "react";
import { isEditorCopilotSurfaceEnabled } from "@mrnote/core/web/__cut__/mc2523d29ba.ts";
import { officeFontSizeOptions } from "@mrnote/core/web/components/office-ribbon/officeFontSizeCatalog.ts";
import { OFFICE_FONT_SIZE_POINTS } from "@mrnote/core/web/components/office-ribbon/officeTypographyCatalog.ts";
import { type SpillOverlay } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type SpreadsheetBorderPreset } from "@mrnote/core/web/lib/spreadsheet/cell-format.ts";
import { type AutoSumFn } from "../../../../lib/spreadsheet/grid-ops";
import { prepareCellShiftFormulas } from "../../../../lib/spreadsheet/cell-shift";
import { buildChartXYSeriesFromRefs, type SpreadsheetChart } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { type PivotRange } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";

export const SPREADSHEET_COPILOT_V1_ENABLED =
  isEditorCopilotSurfaceEnabled("spreadsheet");

export const EMPTY_PIVOT_RANGES: readonly PivotRange[] = [];
/** The one empty report list a sheet with no drawn PivotTable answers with. */
export const EMPTY_PIVOT_REPORTS: readonly never[] = [];
export const AUTO_SUM_MENU_FUNCTIONS = [
  ["sum", "autoSumSum"],
  ["average", "autoSumAverage"],
  ["count", "autoSumCount"],
  ["max", "autoSumMax"],
  ["min", "autoSumMin"],
] as const satisfies ReadonlyArray<readonly [AutoSumFn, string]>;
// Excel's Borders menu, in its order, with each row's message key.
export const HOME_BORDER_PRESETS = [
  ["bottom", "bordersBottom"],
  ["top", "bordersTop"],
  ["left", "bordersLeft"],
  ["right", "bordersRight"],
  ["none", "bordersNone"],
  ["all", "bordersAll"],
  ["outside", "bordersOutside"],
  ["thickBox", "bordersThickBox"],
  ["bottomDouble", "bordersBottomDouble"],
  ["thickBottom", "bordersThickBottom"],
  ["topAndBottom", "bordersTopAndBottom"],
  ["topAndThickBottom", "bordersTopAndThickBottom"],
  ["topAndDoubleBottom", "bordersTopAndDoubleBottom"],
] as const satisfies ReadonlyArray<readonly [SpreadsheetBorderPreset, string]>;
/** A border the Home Borders menu lists (Inside is Format Cells only). */
export type HomeBorderMenuPreset = (typeof HOME_BORDER_PRESETS)[number][0];


/** A pause this long in typing in the Alt Text pane writes what was typed. */
export const ALT_TEXT_PANE_WRITE_DELAY_MS = 500;

export const spreadsheetTaskPaneTabTestId = (id: string) =>
  `spreadsheet-task-pane-tab-${id}`;

/** The files a drop on the grid imports: the File > Import picker's. */
/** The workbook files the sheet's Import replaces the workbook with: an
 * .xlsx and its macro/template variants are read as they are; Excel's other
 * workbook files (.xls, .xlsb, OpenDocument, WPS, SYLK, DIF, dBASE, Numbers,
 * Excel 2003 XML) are converted on the server first, as a page import is. */
export const SPREADSHEET_WORKBOOK_IMPORT_EXTENSIONS = [
  ".xlsx", ".xlsm", ".xltx", ".xltm", ".xls", ".xlt", ".xlsb", ".ods", ".fods", ".ots", ".sxc", ".wk1", ".wks",
  ".et", ".ett", ".slk", ".dif", ".dbf", ".numbers", ".xml",
] as const;
export function isSpreadsheetWorkbookImportFile(file: { name: string; type?: string }): boolean {
  const name = file.name.toLowerCase();
  return (
    SPREADSHEET_WORKBOOK_IMPORT_EXTENSIONS.some((extension) => name.endsWith(extension)) ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}
export const SPREADSHEET_DROP_IMPORT_FILE =
  /\.(xlsx|xlsm|xltx|xltm|xls|xlt|xlsb|ods|fods|ots|sxc|wk1|wks|et|ett|slk|dif|dbf|numbers|xml|csv|tsv|psv|txt)$/i;

/** The status bar's export chip wording, per phase (the Docs chip's). */
export const SPREADSHEET_EXPORT_STATUS_MESSAGE = {
  preparing: "toolbar.exportPreparing",
  ready: "toolbar.exportReady",
  failed: "toolbar.exportFailed",
} as const;
/** The status chip's format while File > Print prepares its PDF: it reads
 * "Preparing to print". */
export const SPREADSHEET_PRINT_STATUS_FORMAT = "print";
/** How long a finished export's chip stays in the status bar. */
export const SPREADSHEET_EXPORT_STATUS_LINGER_MS = 5_000;

/** The workbook's task panes and the edge each docks at: all at the right,
 * where Excel docks its Selection, Navigation, Version History and PivotTable
 * Fields panes (OfficeDockedPane reads this table). */
export const SPREADSHEET_TASK_PANE_EDGES = {
  "format-shape": "right",
  "alt-text": "right",
  selection: "right",
  navigation: "right",
  "version-history": "right",
  "pivot-fields": "right",
  changes: "right",
  thesaurus: "right",
} as const;

/** usePageWritable's reason codes: identifiers, not text a person can read. */
export const PAGE_WRITE_REASON_CODES: ReadonlySet<string> = new Set([
  "role",
  "read_only_tier",
  "locked",
]);

/** The most pictures one Place in Cell writes (one a cell, down the column). */
export const MAX_PICTURES_PLACED_IN_CELLS_AT_ONCE = 50;

// An accepted edit whose changed cells were literals before and after, with
// only value/kind touched, and whose keys name every changed cell. Derived
// readers that depend on formulas alone, or on values only while background
// results are carried unchanged, can reuse the previous map's result.
// The previous map is held weakly: undo history and render memos decide its
// lifetime, and a collected source simply ends the inheritance.
/** Changed cells a commit follows key by key; past this, what reads the cells reads them whole. */
export const CELLS_A_COMMIT_NAMES = 4096;
export const literalEditSources = new WeakMap<CellMap, { readonly from: WeakRef<CellMap>; readonly keys: readonly string[] }>();
// Cell-shift formula candidates depend only on stored formula sources; the
// prepared form (ranges parsed once) belongs to the candidate map.
export const cellShiftFormulaCandidateCache = new WeakMap<CellMap, CellMap>();
export const preparedCellShiftFormulas = new WeakMap<CellMap, ReturnType<typeof prepareCellShiftFormulas>>();
// Automatic row-height candidates each rendered cell map was computed with.
// What one literal cell asks of its row's automatic height, by the cell
// object itself: an edit replaces one cell and leaves every other object as
// it was, so the sheet's other cells are not styled and formatted again for
// each entry (a fifth of every Enter on a 2,300-cell table sheet). Valid
// while the cell sits at the same address under the same context: every
// sheet field but the cells, the other sheets, and the view's own inputs.
// The three caches below remember a window's own readers (its measuring
// callbacks, its evaluator) under cell maps and cell objects that outlive the
// window: a test's fixture, a page's content another window still holds. A
// cache shared by every window therefore kept each closed window alive (about
// 16 MB each), so each window makes its own (createSpreadsheetWindowCaches).
export type AutoRowCellMeasurements = WeakMap<object, {
  context: readonly unknown[];
  row: number;
  col: number;
  entries: readonly AutoRowMeasurement[];
  grows: boolean;
}>;
/** The rows a cell's content could grow (a row height's commit asks:
 * `useSpreadsheetLineSizeCommits`). The candidates of rows with a fixed
 * height are read the first time it is asked, not at every open: nothing
 * else reads them, and their display text was most of an open's measuring. */
export class AutoGrowRows {
  #rows: Set<number>;
  #deferred: readonly string[] | null;
  readonly #grows: (key: string) => boolean;
  constructor(rows: Set<number>, deferred: readonly string[], grows: (key: string) => boolean) {
    this.#rows = rows;
    this.#deferred = deferred.length ? deferred : null;
    this.#grows = grows;
  }
  has(row: number): boolean {
    const deferred = this.#deferred;
    if (deferred) {
      this.#deferred = null;
      for (const key of deferred) {
        const cellRow = Number(key.slice(0, key.indexOf(":")));
        if (!this.#rows.has(cellRow) && this.#grows(key)) this.#rows.add(cellRow);
      }
    }
    return this.#rows.has(row);
  }
}
export type AutoRowCandidatesByCells = WeakMap<CellMap, { deps: readonly unknown[]; projection: object | undefined; result: { measurements: AutoRowMeasurement[]; rows: AutoGrowRows } }>;
// The spill overlay each rendered cell map was computed with, and the carried
// result projection it read; a literal-only edit under the same projection
// reuses an overlay that has no array footprint.
export type SpillOverlayByCells = WeakMap<CellMap, { formulaKeys: readonly string[]; mergeSpans: object; projection: object | undefined; evaluator: object; dataTables: unknown; overlay: SpillOverlay }>;

/** The last render data derived for each chart object. A grid edit that does
 * not change a chart's values hands the engine the same rows again, so it
 * repaints only when something it draws actually changed. */
export const importedChartRenderCache = new WeakMap<object, Record<string, unknown>>();
// Native chart views keep their identity while their resolved rows and XY
// series stay equal, so an unrelated cell edit does not hand every chart
// canvas a new plan to paint.
export const nativeChartViewCache = new WeakMap<object, { chart: SpreadsheetChart; rows: string[][]; xySeries: ReturnType<typeof buildChartXYSeriesFromRefs>; headerRow?: boolean; categoryLevels?: string[][] }>();

// Parse a Solver "changing cells" reference into the ordered list of cell
// coordinates it covers. Accepts a single cell ("B1") or a rectangular range
// ("B1:C3"); cells are enumerated row-major and de-duplicated, giving the
// variable vector a stable, deterministic order. Returns null for any malformed
// side so the caller can report a clear error (mirrors Goal Seek's parse guard).
/**
 * XLS-A073: Solver's cell boxes take references separated by commas
 * ("A1:A3,C1"); every cell once, in the order written.
 */
/** Excel's eyedropper pointer for Choose Format From Cell (XLS-A103). */
export const SPREADSHEET_EYEDROPPER_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'%3E%3Cpath d='M20 4a2.8 2.8 0 0 0-4 0l-2.2 2.2-1-1-1.4 1.4 1 1L5 15v3H2v1l1 1h1v-3h3l7.4-7.4 1 1 1.4-1.4-1-1L20 8a2.8 2.8 0 0 0 0-4z'/%3E%3C/svg%3E\") 2 22, crosshair";

// Max sheets per workbook (MAX_SHEETS) mirrors spreadsheetPageContentSchema's
// `.max(200)` (the API's MAX_SPREADSHEET_WORKBOOK_SHEETS) so the "+" add-sheet
// tab refuses past the persisted cap.

/**
 * How far inside the selection outline still counts as the outline itself —
 * the band where Excel shows the move pointer and a drag moves the range
 * ("Move or copy cells and cell contents"). The bottom-right corner belongs to
 * the fill handle, which keeps a slightly wider claim so a near miss extends
 * the fill rather than moving the range.
 */
export const SELECTION_BORDER_GRAB = 4;
export const SELECTION_FILL_HANDLE_GRAB = 8;

// Font-size choices for the toolbar Font Size select (Excel's standard ramp, in
// px). The grid default (13) is included so a cell with no explicit size still
// reflects the right value. A size is stored as a finite number on the cell
// style; clamped to this set in the UI but rendered as any finite >0 number.
// The size control speaks POINTS, like Excel and WPS — the stored model stays
// CSS pixels. 11pt is the Excel/WPS default and matches the grid CSS's pinned
// 14.6667px base, so an unstyled cell reports the size it actually renders at.
export const SPREADSHEET_FONT_SIZES_PT = OFFICE_FONT_SIZE_POINTS;
/** Excel's Font Size list, from the shared Office catalog every editor lists. */
export const SPREADSHEET_FONT_SIZE_OPTIONS = officeFontSizeOptions("excel");
export const SPREADSHEET_DEFAULT_TEXT_COLOR = "#183c38";

// Pivot table (Excel/WPS parity): cell styles for the read-only result grid.
// Header cells (row/column field labels), body aggregate cells, and the bold
// grand-total cells. Kept as constants so the JSX stays readable.
const PIVOT_CELL_BORDER = "1px solid var(--border, #e5e7eb)";
export const pivotHeaderCellStyle: CSSProperties = {
  border: PIVOT_CELL_BORDER,
  padding: "3px 8px",
  textAlign: "left",
  fontWeight: 600,
  background: "var(--surface-muted, #f3f4f6)",
  whiteSpace: "nowrap",
  // A fixed-layout preview's long field label ends in an ellipsis inside its
  // own column; it ran on over the next headers (Recommended PivotTables).
  overflow: "hidden",
  textOverflow: "ellipsis",
};
export const pivotBodyCellStyle: CSSProperties = {
  border: PIVOT_CELL_BORDER,
  padding: "3px 8px",
  textAlign: "right",
};
export const pivotTotalCellStyle: CSSProperties = {
  border: PIVOT_CELL_BORDER,
  padding: "3px 8px",
  textAlign: "right",
  fontWeight: 600,
  background: "var(--surface-muted, #f3f4f6)",
};

/** One side of Copy/Cut mode's marching-ants rectangle (Microsoft Support,
 * "Move or copy cells and cell contents": the copied range wears a moving
 * border until the paste, Esc or the next entry ends Copy mode). */
export const MARQUEE_EDGE = "1px dashed var(--console-accent, #0D9488)";

export const MAX_TRACE_RELATIONSHIPS = 1000;
export const MAX_SPREADSHEET_THEME_FILE_BYTES = 64 * 1024;

/** XLS-A028: Modify Range shows a kept password as bullets, never the hash. */
export const EDIT_RANGE_PASSWORD_KEPT = "••••••••";

/** Excel's Zoom dialog magnifications. */
export const SPREADSHEET_ZOOM_DIALOG_PRESETS = ["200", "100", "75", "50", "25"] as const;

// Excel for the web does not expose the desktop Watch Window. Keep the
// session implementation below dormant so a future desktop profile can reuse
// its audited authority, but never mount an entry point or dock in the current
// web-parity product surface.


// on the Formulas tab, as in Excel.
export const SHOW_DESKTOP_WATCH_WINDOW = true;
export const SHOW_SPREADSHEET_DESKTOP_FORMULAS_EXTRAS = true;
// The command search row for Error Checking Options: a dialog the window
// opens itself, not a registered ribbon control.
export const ERROR_CHECKING_OPTIONS_SEARCH_ID = "MRAI.LOCAL.ERROR_CHECKING_OPTIONS";
// File > Options > Data > Automatic Data Conversion: a per-user box the
// workspace host opens (SpreadsheetDataConversionHost), found by search as
// Excel's own search finds its options.
export const DATA_CONVERSION_OPTIONS_SEARCH_ID = "MRAI.LOCAL.DATA_CONVERSION_OPTIONS";
// Commands with no ribbon face (as Excel keeps Form… and its options off the
// ribbon but in reach of its search): the window runs each one itself.
export const EYE_CARE_SEARCH_ID = "MRAI.LOCAL.EYE_CARE";
export const SPELL_CHECK_WHILE_TYPING_SEARCH_ID = "MRAI.LOCAL.SPELL_CHECK_WHILE_TYPING";
export const TIMELINE_SEARCH_ID = "MRAI.LOCAL.TIMELINE";
// Locate / Fill Blanks is MRAI's own; Excel's Fill menu has no such entry
// (XLS-A011), so it is reached from the command search.
export const FILL_BLANKS_SEARCH_ID = "MRAI.LOCAL.FILL_BLANKS";
// Edit Custom Lists… is an Excel Option (Advanced), not a Sort & Filter
// entry (XLS-A014); Custom Sort's Order ▸ Custom List… opens it too.
export const CUSTOM_LISTS_SEARCH_ID = "MRAI.LOCAL.CUSTOM_LISTS";
// Desktop/provider Data commands retain their audited handlers and dialogs,
// but do not mount in the Office-Web ribbon without a real MRAI authority.
export const SHOW_SPREADSHEET_DESKTOP_DATA_EXTRAS = false;


// (Scenario Manager, Goal Seek, Data Table), whose dialogs and write
// transactions are complete. The MRAI-only Transform menu and the provider
// commands stay parked above.
export const SHOW_SPREADSHEET_DESKTOP_ANALYSIS = true;
// The former all-in-one Table Design prototype contains several raw writers.
// Keep it dormant until those commands receive their own vertical authority;
// the production contextual tab below exposes only the complete style gallery.
export const SHOW_LEGACY_TABLE_DESIGN_CONTROLS = false;
export const SHOW_SPREADSHEET_DESKTOP_PAGE_LAYOUT_EXTRAS = true;

/** A window's own derived-render caches (see AutoRowCellMeasurements). */
export function createSpreadsheetWindowCaches(): {
  autoRowCellMeasurements: AutoRowCellMeasurements;
  autoRowCandidatesByCells: AutoRowCandidatesByCells;
  spillOverlayByCells: SpillOverlayByCells;
} {
  return {
    autoRowCellMeasurements: new WeakMap(),
    autoRowCandidatesByCells: new WeakMap(),
    spillOverlayByCells: new WeakMap(),
  };
}
