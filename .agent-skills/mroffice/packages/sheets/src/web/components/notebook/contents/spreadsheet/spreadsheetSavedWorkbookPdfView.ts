/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * What a saved workbook's printed page shows beyond its stored cells, built
 * once for both printers: the spreadsheet window's Print command
 * (`spreadsheetSavedPagePdfViews`, over the window's own read model) and the
 * server's prints of a workbook no window holds -- an attached .xlsx's
 * preview, an .xlsx converted into a PDF page -- through the engine host
 * (`sheet-calc.printView`, over the calculation's answer for the saved
 * workbook). The server lays these cells over the saved ones and never
 * evaluates any of them itself, so screen and print agree.
 */

import { type ReactElement } from "react";
import { createElement } from "react";
import { type SpreadsheetPdfConditionalStyle, type SpreadsheetPdfDerivedCell, MAX_SPREADSHEET_PDF_DERIVED_CELLS, MAX_SPREADSHEET_PDF_GLYPH_CHARS, MAX_SPREADSHEET_PDF_GLYPHS, MAX_SPREADSHEET_PDF_PANELS, type SpreadsheetPdfDerivedStyle, type SpreadsheetPdfExportView, type SpreadsheetPdfPanel, SpreadsheetPdfViewError } from "@mrnote/core/web/lib/spreadsheet/pdf-export-view.ts";
import { buildSpillOverlay, resolveCellDisplay } from "@mrnote/core/web/lib/spreadsheet/display-cache.ts";
import { conditionalPdfCellsForSheet } from "./spreadsheetPdfConditionalCells";
import { type ConditionalFormatRule } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { SlicerPrintGlyph, TimelinePrintGlyph } from "./SpreadsheetPrintPanels";
import { spreadsheetSlicerView } from "../../../../lib/spreadsheet/slicer-view";
import { DEFAULT_SLICER_HEIGHT, DEFAULT_SLICER_WIDTH, normalizeSlicers } from "../../../../lib/spreadsheet/slicer";
import { pivotSlicerBinding } from "../../../../lib/spreadsheet/slicer-buttons";
import { DEFAULT_PIVOT_TIMELINE_HEIGHT, DEFAULT_PIVOT_TIMELINE_WIDTH, normalizePivotTimelines, type PivotTimelineLevel, type PivotTimelineTranslate } from "../../../../lib/spreadsheet/pivot-timeline";
import { normalizeDataTables } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { normalizeSheets } from "./spreadsheetNormalizeSheets";
import { columnLabel } from "./spreadsheetRangeA1";
import { SPREADSHEET_HEADER_HEIGHT_PX, SPREADSHEET_HEADER_WIDTH_PX } from "./spreadsheetGridConstants";
import { answeredRuleValue, buildWorkbookSheetInput, SESSION_PENDING, type RuleAnswers } from "./spreadsheetHiddenRows";
import { formatGeneralNumber, numberFormatColor, numberFormatLayout } from "@mrnote/core/web/lib/spreadsheet/number-format.ts";
import { isCheckboxCell } from "../../../../lib/spreadsheet/checkbox";
import { normalizeMerges, coveredCells, mergeAnchorCells } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import { tableStyleCellPaint, tableTotalsRowIndex } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { sheetPivots, pivotPlanKey } from "@mrnote/core/web/lib/spreadsheet/pivot.ts";
import { isBuiltInPivotStyle, builtInPivotCellPaint } from "../../../../lib/spreadsheet/pivot-style-recipes";
import { pivotStyleOptionsOf, pivotStyleCellLook, savedPivotStyleReport } from "../../../../lib/spreadsheet/pivot-style-look";
import { type PivotOutputLabels, type PivotOutputPlan } from "@mrnote/core/web/lib/spreadsheet/pivot-output.ts";
import { planWorkbookPivots, withPivotOverlay } from "@mrnote/core/web/lib/spreadsheet/pivot-overlay.ts";
import { createValueStoreWorkbook } from "@mrnote/core/web/lib/spreadsheet/value-store.ts";
import { normalizeSpreadsheetDateSystem } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";
import { normalizeViewOptions, spreadsheetViewThemeAccents } from "../../../../lib/spreadsheet/view-options";
import { type FilterDateToday } from "@mrnote/core/web/lib/spreadsheet/date-filter-tree.ts";
import { type WorkbookAnswerRequest } from "@mrnote/core/web/lib/spreadsheet/workbook-values-cache.ts";
import { type SheetModel } from "./spreadsheetSheetModel";
import { createSpreadsheetPdfExportView, spreadsheetPastPageRules, spreadsheetPdfExportValues } from "./spreadsheetWorkbookValuePlans";
import { type SheetEvaluator, type Workbook } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type SpreadsheetNativeTableStyle } from "@mrnote/core/web/lib/spreadsheet/native-table-styles.ts";
import { type ExcelDateSystemArg, excelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

/** What a printed slicer and timeline say in the reader's language. */
export interface SpreadsheetPrintPanelLabels {
  blank: string;
  allPeriods: string;
  levels: Record<PivotTimelineLevel, string>;
  translate?: PivotTimelineTranslate;
}

/** The read model a sheet's derived print cells are resolved over. */
export interface SpreadsheetPdfDerivedSources {
  /** The saved workbook (a PivotTable slicer reads its PivotTable on any sheet). */
  savedSheets: SheetModel[];
  /** Each sheet's evaluator and every PivotTable's report, as the grid reads them. */
  formulaWorkbook: { evaluatorFor: (sheetName: string) => SheetEvaluator; pivotPlans: ReadonlyMap<string, PivotOutputPlan> };
  /** The grid's own glyph components rendered to SVG markup for the PDF
   * (icon-set icons, sparklines, slicers, timelines); null prints without them. */
  renderSvg: ((element: ReactElement) => string) | null;
  /** The calculation's answers for the rule formulas a sheet's paint reads. */
  ruleAnswersFor: (sheetId: string) => RuleAnswers | null;
  workbookNativeTableStyles: SpreadsheetNativeTableStyle[] | undefined;
  workbookThemeAccentColors: readonly string[];
  printPanelLabels: SpreadsheetPrintPanelLabels;
  locale?: string;
  /** A sheet's rules past the ones its page lists, read from its saved file
   * for a print the server makes (spreadsheetPastPageRules); none otherwise. */
  pastPageRulesFor?: (sheetId: string) => readonly ConditionalFormatRule[];
}

/**
 * What the grid shows on `candidate` beyond the saved cells, for the PDF the
 * server prints: a PivotTable's report cells and their style paint, a dynamic
 * array's spilled values, the paint a table style lays on its cells,
 * conditional formats and sparklines, a number format's colour and layout,
 * and the sheet's slicers and timelines.
 */
export function derivedPdfCellsForSheet(
  candidate: SheetModel,
  sources: SpreadsheetPdfDerivedSources,
): { cells: SpreadsheetPdfDerivedCell[]; glyphs: string[]; panels: SpreadsheetPdfPanel[]; trimmed?: true } {
  const out: SpreadsheetPdfDerivedCell[] = [];
  const budget = MAX_SPREADSHEET_PDF_DERIVED_CELLS;
  /** Something the grid shows was left out past the budget (never silently:
   * the view says so and the export tells the reader). */
  let trimmed = false;
  const styleOf = (paint: {
    backgroundColor?: string; color?: string; bold?: boolean; italic?: boolean; strike?: boolean;
    borderEdges?: Partial<Record<"top" | "right" | "bottom" | "left", { style: string; color: string }>>;
  } | null | undefined): SpreadsheetPdfDerivedStyle | undefined => {
    if (!paint) return undefined;
    const style: SpreadsheetPdfDerivedStyle = {};
    if (paint.backgroundColor) style.backgroundColor = paint.backgroundColor;
    if (paint.color) style.color = paint.color;
    if (paint.bold !== undefined) style.bold = paint.bold;
    if (paint.italic !== undefined) style.italic = paint.italic;
    if (paint.strike !== undefined) style.strikethrough = paint.strike;
    if (paint.borderEdges) {
      const edges: NonNullable<SpreadsheetPdfDerivedStyle["borderEdges"]> = {};
      for (const edge of ["top", "right", "bottom", "left"] as const) {
        const line = paint.borderEdges[edge];
        if (line) edges[edge] = { style: line.style, color: line.color };
      }
      if (Object.keys(edges).length) style.borderEdges = edges;
    }
    return Object.keys(style).length ? style : undefined;
  };
  const push = (cell: SpreadsheetPdfDerivedCell) => {
    if (!(cell.t !== undefined || cell.s || cell.cf)) return;
    // A cell past the saved sheet's rows is on no printed page; the export's
    // validator refuses a view holding one, and the print then lost the
    // whole view (R455-X26: a PivotTable the file never refreshed, its
    // report planned from the source down past its sheet's one saved row,
    // dropped every sheet's paint).
    if (cell.r >= candidate.rowCount) return;
    if (out.length < budget) out.push(cell);
    else trimmed = true;
  };
  // A PivotTable report: its cells are a read model, never stored.
  sheetPivots(candidate).forEach((config, slot) => {
    // A PivotTable the file holds no report for (never laid out: no row or
    // column items cached, its location's first data row 0) prints nothing,
    // as Windows Excel prints it -- not the report the source would give
    // (R455-X80: a generated workbook's refreshOnLoad report over a table,
    // 9 pages in Excel, 12 with the planned report).
    const layout = config.native?.savedLayout;
    if (layout && !layout.rowItems.length && !layout.colItems.length && layout.firstDataRow === 0) return;
    const plan = sources.formulaWorkbook.pivotPlans.get(pivotPlanKey(candidate.id, slot));
    if (!plan || plan.status !== "ready") {
      // A report the grid does not draw prints the cells the file cached,
      // in its PivotTable style, as the grid shows it (X-235).
      const saved = config.native ? savedPivotStyleReport(config) : null;
      if (!saved) return;
      // The cached cells keep the file's own font (black text): the
      // style's fill, colour and weight lie over it, as on the grid
      // (`cf`, over the cell's own), its lines where the cell has none.
      const hex = (color: string | undefined) => (color && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined);
      for (const cell of saved.plan.cells.values()) {
        const look = pivotStyleCellLook(saved.plan, saved.config, saved.options, cell.row, cell.col);
        if (!look) continue;
        const { borderEdges, backgroundColor, color, bold, italic } = builtInPivotCellPaint(saved.styleName, sources.workbookThemeAccentColors, look);
        const lines = styleOf(borderEdges ? { borderEdges } : null);
        const face: SpreadsheetPdfConditionalStyle = {
          ...(hex(backgroundColor) ? { backgroundColor: hex(backgroundColor) } : {}),
          ...(hex(color) ? { color: hex(color) } : {}),
          ...(bold !== undefined ? { bold } : {}),
          ...(italic !== undefined ? { italic } : {}),
        };
        push({ r: cell.row, c: cell.col, ...(lines ? { s: lines } : {}), ...(Object.keys(face).length ? { cf: face } : {}) });
      }
      return;
    }
    const requested = config.styleName ?? config.native?.styleName ?? (config.native ? null : "PivotStyleLight16");
    const styleName = requested ? (isBuiltInPivotStyle(requested) ? requested : "PivotStyleLight16") : null;
    const options = pivotStyleOptionsOf(config);
    for (const cell of plan.cells.values()) {
      const text = cell.value === null || cell.value === undefined ? "" :
        typeof cell.value === "number" ? formatGeneralNumber(cell.value) : String(cell.value);
      const look = styleName ? pivotStyleCellLook(plan, config, options, cell.row, cell.col) : null;
      const paint = look && styleName ? builtInPivotCellPaint(styleName, sources.workbookThemeAccentColors, look) : null;
      push({ r: cell.row, c: cell.col, ...(text ? { t: text, k: typeof cell.value === "number" ? "number" : "text" } : {}),
        ...(styleOf(paint) ? { s: styleOf(paint) } : {}) });
    }
  });
  // A dynamic array's spilled cells: the formula's neighbours hold nothing.
  try {
    const evaluator = sources.formulaWorkbook.evaluatorFor(candidate.name || candidate.id);
    const spans = normalizeMerges(candidate.merges);
    const overlay = buildSpillOverlay(candidate.cells, coveredCells(spans), evaluator, undefined, mergeAnchorCells(spans));
    for (const key of overlay.spilled.keys()) {
      const stored = candidate.cells[key];
      if (stored && ((stored.value ?? "") !== "" || (stored.formula ?? "") !== "")) continue;
      const [row, col] = key.split(":").map(Number);
      const text = resolveCellDisplay(undefined, row, col, evaluator, overlay);
      if (text === "") continue;
      const raw = overlay.spilled.get(key);
      push({ r: row, c: col, t: text, k: typeof raw === "number" ? "number" : "text" });
    }
  } catch {
    // A sheet the read model cannot evaluate prints its stored cells only.
  }
  // A table style paints its range, and its Total Row just below it
  // (bold over a double rule, as the grid draws it); the cells carry no
  // style of their own.
  for (const table of candidate.dataTables ?? []) {
    const { r1, c1, c2 } = table.range;
    const r2 = tableTotalsRowIndex(table) ?? table.range.r2;
    if ((r2 - r1 + 1) * (c2 - c1 + 1) > budget - out.length) {
      trimmed = true;
      break;
    }
    for (let row = r1; row <= r2; row += 1) {
      for (let col = c1; col <= c2; col += 1) {
        const style = styleOf(tableStyleCellPaint(table.styleId, sources.workbookThemeAccentColors, table, row, col, sources.workbookNativeTableStyles));
        if (style) push({ r: row, c: col, s: style });
      }
    }
  }
  // Conditional formats (colour scales, data bars, icon sets, rule paint)
  // and sparklines, as the grid resolves and draws them. A cell the
  // report or a table style already derived gains them on the same entry.
  let glyphs: string[] = [];
  if (sources.renderSvg) {
    try {
      // The sheet on screen paints its rules from its grid's own answers
      // (an unanswered rule paints as unanswered); the others from the
      // calculation's answers for the saved workbook.
      const answers = sources.ruleAnswersFor(candidate.id);
      const conditional = conditionalPdfCellsForSheet(candidate,
        sources.formulaWorkbook.evaluatorFor(candidate.name || candidate.id), sources.renderSvg, budget,
        (formula, row, col, anchorRow, anchorCol) => {
          const answered = answeredRuleValue(answers, candidate.id, formula, row, col, anchorRow, anchorCol);
          return answered === SESSION_PENDING ? undefined : answered;
        }, sources.pastPageRulesFor?.(candidate.id));
      glyphs = conditional.glyphs;
      if (conditional.cells.length >= budget || conditional.glyphs.length >= MAX_SPREADSHEET_PDF_GLYPHS) trimmed = true;
      const byKey = new Map(out.map((cell) => [`${cell.r}:${cell.c}`, cell] as const));
      for (const cell of conditional.cells) {
        const known = byKey.get(`${cell.r}:${cell.c}`);
        // A rule's paint lies over a saved report's style paint.
        if (known) Object.assign(known, { ...cell, ...known, ...(cell.cf ? { cf: { ...known.cf, ...cell.cf } } : {}) });
        else if (out.length < budget) out.push(cell);
        else trimmed = true;
      }
    } catch {
      // A sheet the read model cannot resolve prints without them.
    }
  }
  // A number format's colour ([Red] in 0.00;[Red]-0.00) and its layout
  // operators (_x reserves a character's width, *x fills the cell: the
  // Accounting symbol at the left edge, the number at the right), as the
  // grid draws them (numberFormatColor / numberFormatLayout); the saved
  // display keeps neither.
  try {
    const evaluator = sources.formulaWorkbook.evaluatorFor(candidate.name || candidate.id);
    const byKey = new Map<string, SpreadsheetPdfDerivedCell>(out.map((cell) => [`${cell.r}:${cell.c}`, cell]));
    for (const [key, cell] of Object.entries(candidate.cells)) {
      const format = cell?.style?.numberFormat;
      if (!format || !/[_*[]/.test(format)) continue;
      const [row, col] = key.split(":").map(Number);
      const computed = evaluator.getComputed(row, col);
      const value = typeof computed === "number" ? computed
        : !cell.formula && cell.value?.trim() ? Number(cell.value) : NaN;
      if (!Number.isFinite(value)) continue;
      const color = numberFormatColor(value, format) ?? undefined;
      const layout = cell.style?.textRotation || cell.style?.verticalText || cell.style?.shrinkToFit || isCheckboxCell(cell.style)
        ? undefined
        : numberFormatLayout(value, format, { date1904: evaluator.date1904 });
      if (!color && !layout) continue;
      const fields: Pick<SpreadsheetPdfDerivedCell, "nc" | "nl"> = {
        ...(color ? { nc: color } : {}),
        ...(layout ? { nl: layout.map((part) => part.kind === "text" ? [0, part.text] as const : [part.kind === "reserve" ? 1 : 2, part.character] as const) } : {}),
      };
      const known = byKey.get(key);
      if (known) Object.assign(known, fields);
      else if (out.length < budget) out.push({ r: row, c: col, ...fields });
      else {
        trimmed = true;
        break;
      }
    }
  } catch {
    // A sheet the read model cannot evaluate prints its saved display.
  }
  // Slicers and timelines, as the sheet shows them (Excel prints both).
  const panels: SpreadsheetPdfPanel[] = [];
  if (sources.renderSvg) {
    try {
      const render = sources.renderSvg;
      const glyphIndex = (markup: string): number | undefined => {
        if (markup.length > MAX_SPREADSHEET_PDF_GLYPH_CHARS || glyphs.length >= MAX_SPREADSHEET_PDF_GLYPHS) {
          trimmed = true;
          return undefined;
        }
        glyphs.push(markup);
        return glyphs.length - 1;
      };
      const place = (x: number | undefined, y: number | undefined, fallbackX: number, fallbackY: number, w: number, h: number, glyph: number | undefined) => {
        if (glyph === undefined || panels.length >= MAX_SPREADSHEET_PDF_PANELS) return;
        // The panel layer's coordinates include the headings; the PDF's
        // drawings start at the sheet's first cell.
        panels.push({ x: Math.max(0, (x ?? fallbackX) - SPREADSHEET_HEADER_WIDTH_PX), y: Math.max(0, (y ?? fallbackY) - SPREADSHEET_HEADER_HEIGHT_PX), w, h, glyph });
      };
      const slicers = normalizeSlicers(candidate.slicers, candidate.columnCount);
      if (slicers.length) {
        const evaluator = sources.formulaWorkbook.evaluatorFor(candidate.name || candidate.id);
        const spans = normalizeMerges(candidate.merges);
        const overlay = buildSpillOverlay(candidate.cells, coveredCells(spans), evaluator, undefined, mergeAnchorCells(spans));
        const dataTables = normalizeDataTables(candidate.dataTables, { rowCount: candidate.rowCount, columnCount: candidate.columnCount });
        slicers.forEach((slicer, index) => {
          const view = spreadsheetSlicerView(slicer, {
            dataTables,
            filters: candidate.filters,
            rowCount: candidate.rowCount,
            shown: (row, col) => {
              try {
                return resolveCellDisplay(candidate.cells[`${row}:${col}`], row, col, evaluator, overlay);
              } catch {
                return String(candidate.cells[`${row}:${col}`]?.display ?? candidate.cells[`${row}:${col}`]?.value ?? "");
              }
            },
            pivot: (target) => pivotSlicerBinding(sources.savedSheets, target, () => null),
            columnLabel,
          });
          place(slicer.x, slicer.y, SPREADSHEET_HEADER_WIDTH_PX + 12 + index * 184, SPREADSHEET_HEADER_HEIGHT_PX + 12,
            slicer.width ?? DEFAULT_SLICER_WIDTH, slicer.height ?? DEFAULT_SLICER_HEIGHT,
            glyphIndex(render(createElement(SlicerPrintGlyph, { slicer, view, blankLabel: sources.printPanelLabels.blank }))));
        });
      }
      normalizePivotTimelines(candidate.timelines).forEach((timeline, index) => {
        place(timeline.x, timeline.y, SPREADSHEET_HEADER_WIDTH_PX + 12 + index * 24, SPREADSHEET_HEADER_HEIGHT_PX + 12 + index * 24,
          timeline.width ?? DEFAULT_PIVOT_TIMELINE_WIDTH, timeline.height ?? DEFAULT_PIVOT_TIMELINE_HEIGHT,
          glyphIndex(render(createElement(TimelinePrintGlyph, {
            timeline,
            accents: sources.workbookThemeAccentColors,
            locale: sources.locale,
            allPeriodsLabel: sources.printPanelLabels.allPeriods,
            levelLabel: sources.printPanelLabels.levels[timeline.level],
            translate: sources.printPanelLabels.translate,
          }))));
      });
    } catch {
      // A panel the read model cannot draw prints nothing.
    }
  }
  return { cells: out, glyphs, panels, ...(trimmed ? { trimmed: true as const } : {}) };
}

/** A saved workbook's read model as the window builds it (formulaWorkbook),
 * over the calculation's results for it: every PivotTable's report planned
 * over the workbook without them, then laid over its cells. */
export function savedWorkbookReadModel(
  sheets: readonly SheetModel[],
  results: SpreadsheetPdfValuesResults,
  options: { date1904: ExcelDateSystemArg; labels: PivotOutputLabels; collapsed: ReadonlySet<string>; onMissing?: "blank" | "throw" },
): SpreadsheetPdfDerivedSources["formulaWorkbook"] & { readonly workbook: Workbook } {
  const inputs = sheets.map((candidate) => buildWorkbookSheetInput(candidate, { date1904: options.date1904 }));
  const bootstrap = createValueStoreWorkbook(inputs, { results, date1904: options.date1904 });
  const { plans, nativeFootprints } = planWorkbookPivots(sheets, bootstrap.evaluatorFor, { labels: options.labels, collapsed: options.collapsed });
  const finalInputs = withPivotOverlay(sheets, inputs, { plans, nativeFootprints });
  const { workbook, evaluatorFor } = createValueStoreWorkbook(finalInputs, { results, date1904: options.date1904, onMissing: options.onMissing });
  return { workbook, evaluatorFor, pivotPlans: plans };
}

type SpreadsheetPdfValuesResults = NonNullable<Awaited<ReturnType<typeof spreadsheetPdfExportValues>>>["results"];

export interface SavedWorkbookPdfViewOptions {
  /** The reader's today (relative date filters). */
  today: FilterDateToday;
  locale?: string;
  /** The text a PivotTable writes itself, in the reader's language. */
  pivotLabels: PivotOutputLabels;
  printPanelLabels: SpreadsheetPrintPanelLabels;
  renderSvg: ((element: ReactElement) => string) | null;
  /** The stateless calculation that answers the saved workbook (the engine
   * host's own runtime on the server). */
  request: WorkbookAnswerRequest;
  /** The server's own bound on the rule formulas asked (sheet-calc printView
   * answers them in one call on one workbook); the protocol's without. */
  ruleBounds?: { readonly requests: number; readonly cells: number };
}

/**
 * The PDF view the window's Print command sends for a saved workbook with no
 * Sheet View session (filters and sorts as saved), for a print no window
 * makes: the same view builder over the same read model, the workbook's
 * formulas and rule formulas answered by the calculation. Throws
 * SpreadsheetPdfViewError when the calculation cannot answer or the view
 * exceeds its budget.
 */
export async function spreadsheetSavedWorkbookPdfView(
  content: Record<string, unknown>,
  options: SavedWorkbookPdfViewOptions,
): Promise<SpreadsheetPdfExportView> {
  const collapsed = new Set<string>();
  const values = await spreadsheetPdfExportValues(content, false, { labels: options.pivotLabels, collapsed },
    { always: true, request: options.request, ...(options.ruleBounds ? { ruleBounds: options.ruleBounds } : {}) });
  if (!values) throw new SpreadsheetPdfViewError("view_unavailable");
  const savedSheets = normalizeSheets(content);
  const pastPage = spreadsheetPastPageRules(content, savedSheets);
  const date1904 = excelDateSystemArg(content["dateSystem"]);
  const viewOptions = normalizeViewOptions(content);
  const sources: SpreadsheetPdfDerivedSources = {
    savedSheets,
    formulaWorkbook: savedWorkbookReadModel(savedSheets, values.results, { date1904, labels: options.pivotLabels, collapsed }),
    renderSvg: options.renderSvg,
    ruleAnswersFor: () => values.rules,
    workbookNativeTableStyles: viewOptions.nativeTableStyles,
    workbookThemeAccentColors: spreadsheetViewThemeAccents(viewOptions),
    printPanelLabels: options.printPanelLabels,
    locale: options.locale,
    pastPageRulesFor: (sheetId) => pastPage.get(sheetId) ?? [],
  };
  return createSpreadsheetPdfExportView(content, undefined, options.today,
    (sheet) => derivedPdfCellsForSheet(sheet, sources), values);
}
