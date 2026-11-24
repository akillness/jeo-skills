"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createElement, type ReactElement } from "react";
import {
  normalizeRules as normalizeConditionalRules,
  resolveCellConditionalDisplay,
  ruleAreas,
  type ConditionalDisplay,
  type ConditionalFormatRule,
  type RangeExtent,
  type RangeStats,
} from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { type CellValue } from "@/lib/spreadsheet/formula-evaluator";
import { normalizeSparklines, type Sparkline } from "@mrnote/core/web/lib/spreadsheet/sparkline.ts";
import { normalizeChartRange } from "@mrnote/core/web/lib/spreadsheet/chart-config.ts";
import { normalizeManualHidden } from "@mrnote/core/web/lib/spreadsheet/manual-hidden.ts";
import { hiddenColsFromGroups, hiddenRowsFromGroups, normalizeOutlineGroups } from "@mrnote/core/web/lib/spreadsheet/outline-groups.ts";
import { type SheetEvaluator } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { buildSpillOverlay, resolveCellDisplay } from "@mrnote/core/web/lib/spreadsheet/display-cache.ts";
import { coveredCells, mergeAnchorCells, normalizeMerges } from "@mrnote/core/web/lib/spreadsheet/merge-cells.ts";
import {
  MAX_SPREADSHEET_PDF_GLYPH_CHARS,
  MAX_SPREADSHEET_PDF_GLYPHS,
  type SpreadsheetPdfConditionalStyle,
  type SpreadsheetPdfDerivedCell,
} from "@mrnote/core/web/lib/spreadsheet/pdf-export-view.ts";
import { ConditionalIconGlyph } from "./ConditionalIconGlyph";
import { SparklineGlyph } from "./SpreadsheetSparklineGlyph";
import { type SheetModel } from "./spreadsheetSheetModel";

/** The cells a rule pass may visit on one sheet (a whole-column rule reads its used rows only). */
const MAX_CONDITIONAL_CELL_VISITS = 200_000;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** What the grid paints for a cell's conditional formats and sparkline, for the PDF. */
export interface SpreadsheetPdfConditionalCells {
  cells: SpreadsheetPdfDerivedCell[];
  glyphs: string[];
}

function conditionalStyleOf(display: ConditionalDisplay): SpreadsheetPdfConditionalStyle | undefined {
  const style = display.style;
  const out: SpreadsheetPdfConditionalStyle = {};
  if (style.backgroundColor === "transparent") out.backgroundColor = "none";
  else if (style.backgroundColor && HEX.test(style.backgroundColor)) out.backgroundColor = style.backgroundColor.toLowerCase();
  if (style.color && HEX.test(style.color)) out.color = style.color.toLowerCase();
  if (style.fontWeight !== undefined) out.bold = style.fontWeight >= 600;
  if (style.fontStyle !== undefined) out.italic = style.fontStyle === "italic";
  if (style.textDecoration !== undefined) {
    out.underline = style.textDecoration.includes("underline");
    out.strikethrough = style.textDecoration.includes("line-through");
  }
  return Object.keys(out).length ? out : undefined;
}

const percent = (value: number) => Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;

/**
 * The conditional formats (colour scales, data bars, icon sets, classic and
 * formula rule paint) and sparklines a sheet shows, resolved exactly as the
 * grid resolves them (`resolveCellConditionalDisplay` with a formula rule's
 * value the calculation's answer, the range extents and statistics cached per rule;
 * `SparklineGlyph` over the same values), for the PDF view. The icons and
 * sparklines travel as the grid's own glyph components rendered to SVG
 * markup (`renderSvg`), shared by every cell that draws the same one.
 */
export function conditionalPdfCellsForSheet(
  sheet: SheetModel,
  evaluator: SheetEvaluator,
  renderSvg: (element: ReactElement) => string,
  budget: number,
  /** The calculation's answer for a rule formula at a cell (the grid's
   * `evalConditionalFormula`), or `undefined` when it gave none. */
  answeredRule?: (formula: string, row: number, col: number, anchorRow: number, anchorCol: number) => CellValue | undefined,
  /** The sheet's rules past the ones its page lists (normalizePastPageRules),
   * drawn after its own: lower in priority than every rule the page lists. */
  pastPage: readonly ConditionalFormatRule[] = [],
): SpreadsheetPdfConditionalCells {
  const cells = new Map<string, SpreadsheetPdfDerivedCell>();
  const glyphs: string[] = [];
  const glyphIndex = new Map<string, number>();
  const glyph = (markup: string): number | undefined => {
    if (markup.length > MAX_SPREADSHEET_PDF_GLYPH_CHARS) return undefined;
    const known = glyphIndex.get(markup);
    if (known !== undefined) return known;
    if (glyphs.length >= MAX_SPREADSHEET_PDF_GLYPHS) return undefined;
    glyphs.push(markup);
    glyphIndex.set(markup, glyphs.length - 1);
    return glyphs.length - 1;
  };
  const entry = (row: number, col: number): SpreadsheetPdfDerivedCell | null => {
    const key = `${row}:${col}`;
    const known = cells.get(key);
    if (known) return known;
    if (cells.size >= budget) return null;
    const fresh: SpreadsheetPdfDerivedCell = { r: row, c: col };
    cells.set(key, fresh);
    return fresh;
  };

  const rules: ConditionalFormatRule[] = [...normalizeConditionalRules(sheet.conditionalFormats, {
    maxRow: sheet.rowCount - 1,
    maxCol: sheet.columnCount - 1,
  }), ...pastPage];
  if (rules.length) {
    // Excel prints a sheet's used range, so a rule paints only there: the
    // stored cells' extent bounds the visit (a whole-column rule is not a
    // million cells).
    let usedRow = -1;
    let usedCol = -1;
    for (const key of Object.keys(sheet.cells)) {
      const [row, col] = key.split(":").map(Number);
      if (Number.isInteger(row) && Number.isInteger(col)) {
        usedRow = Math.max(usedRow, row);
        usedCol = Math.max(usedCol, col);
      }
    }
    const extentCache = new Map<ConditionalFormatRule, RangeExtent | null>();
    const statsCache = new Map<ConditionalFormatRule, RangeStats | null>();
    const options = {
      cellValueAt: (r: number, c: number) => evaluator.getComputed(r, c),
      // The grid reads a rule formula's value from the calculation's answer
      // and never evaluates it itself: an unanswered formula is no value
      // (a formula stop then falls back as the grid's does). Evaluating it
      // here painted a colour scale with a shifted formula stop differently
      // from the sheet (audit S25 Sheet2 column F).
      evalFormula: (formula: string, row: number, col: number, anchorRow: number, anchorCol: number) =>
        answeredRule?.(formula, row, col, anchorRow, anchorCol) ?? null,
      extentCache,
      statsCache,
      date1904: evaluator.date1904,
    };
    let overlay: ReturnType<typeof buildSpillOverlay> | null = null;
    const visited = new Set<string>();
    let visits = 0;
    outer: for (const rule of rules) {
      for (const area of ruleAreas(rule)) {
        for (let row = Math.max(0, area.r1); row <= Math.min(area.r2, usedRow); row += 1) {
          for (let col = Math.max(0, area.c1); col <= Math.min(area.c2, usedCol); col += 1) {
            const key = `${row}:${col}`;
            if (visited.has(key)) continue;
            visited.add(key);
            if ((visits += 1) > MAX_CONDITIONAL_CELL_VISITS) break outer;
            let display: ConditionalDisplay;
            try {
              display = resolveCellConditionalDisplay(rules, evaluator.getComputed(row, col), row, col, options);
            } catch {
              continue;
            }
            const style = conditionalStyleOf(display);
            const bar = display.dataBar;
            const icon = display.icon;
            const numberFormat = display.style.numberFormat;
            let shown: string | undefined;
            if (numberFormat) {
              // The value as the rule's number format shows it, as the
              // grid's cellDisplayValue draws it.
              try {
                if (!overlay) {
                  const spans = normalizeMerges(sheet.merges);
                  overlay = buildSpillOverlay(sheet.cells, coveredCells(spans), evaluator, undefined, mergeAnchorCells(spans));
                }
                shown = resolveCellDisplay(sheet.cells[key], row, col, evaluator, overlay, numberFormat);
              } catch {
                shown = undefined;
              }
            }
            if (!style && !bar && !icon && shown === undefined) continue;
            const cell = entry(row, col);
            if (!cell) break outer;
            if (style) cell.cf = style;
            if (shown !== undefined && shown.length <= 4_000) cell.ft = shown;
            if (bar && HEX.test(bar.color)) {
              cell.bar = {
                s: percent(bar.startPercent),
                w: percent(bar.widthPercent),
                c: bar.color.toLowerCase(),
                ...(bar.gradient ? { g: true as const } : {}),
                ...(bar.direction === "negative" ? { n: true as const } : {}),
                ...(bar.borderColor && HEX.test(bar.borderColor) ? { b: bar.borderColor.toLowerCase() } : {}),
                ...(bar.axisColor && HEX.test(bar.axisColor) ? { a: percent(bar.axisPercent), ac: bar.axisColor.toLowerCase() } : {}),
              };
              if (!bar.showValue) cell.hide = true;
            }
            if (icon) {
              const index = glyph(renderSvg(createElement(ConditionalIconGlyph, {
                iconSet: icon.iconSet, index: icon.index, count: icon.count,
              })));
              if (index !== undefined) cell.icon = index;
              if (icon.iconOnly) cell.hide = true;
            }
          }
        }
      }
    }
  }

  const sparklines = normalizeSparklines(sheet.sparklines);
  const sparklineKeys = Object.keys(sparklines);
  if (sparklineKeys.length) {
    const groups = normalizeOutlineGroups(sheet.outlineGroups, { rowCount: sheet.rowCount, columnCount: sheet.columnCount });
    const hiddenRows = new Set([...normalizeManualHidden(sheet.manuallyHiddenRows, sheet.rowCount), ...hiddenRowsFromGroups(groups)]);
    const hiddenCols = new Set([...normalizeManualHidden(sheet.manuallyHiddenCols, sheet.columnCount), ...hiddenColsFromGroups(groups)]);
    // The grid's sparklineValuesFor / sparklineAxisBoundsFor.
    const valuesFor = (sparkline: Sparkline): Array<number | null> => {
      const rect = normalizeChartRange(sparkline.range);
      if (!rect) return [];
      const out: Array<number | null> = [];
      for (let r = rect.r1; r <= rect.r2; r += 1) {
        for (let c = rect.c1; c <= rect.c2; c += 1) {
          if (!sparkline.displayHidden && (hiddenRows.has(r) || hiddenCols.has(c))) continue;
          const v = evaluator.getComputed(r, c);
          if (typeof v === "number" && Number.isFinite(v)) out.push(v);
          else if (typeof v === "boolean") out.push(v ? 1 : 0);
          else if (typeof v === "string" && v.trim() !== "") {
            const n = Number(v.trim());
            out.push(Number.isFinite(n) ? n : null);
          } else out.push(null);
        }
      }
      return out;
    };
    const values = new Map<string, Array<number | null>>();
    const valuesOf = (key: string) => {
      let known = values.get(key);
      if (!known) values.set(key, (known = valuesFor(sparklines[key])));
      return known;
    };
    for (const key of sparklineKeys) {
      const sparkline = sparklines[key];
      const [row, col] = key.split(":").map(Number);
      if (!Number.isInteger(row) || !Number.isInteger(col)) continue;
      const group = sparkline.groupId
        ? sparklineKeys.filter((other) => sparklines[other].groupId === sparkline.groupId)
        : [key];
      const groupValues = group.flatMap((other) => valuesOf(other).filter((value): value is number => value !== null));
      const axisBounds = {
        minimum: sparkline.minAxisType === "custom" ? sparkline.manualMin
          : sparkline.minAxisType === "group" && groupValues.length ? Math.min(...groupValues) : undefined,
        maximum: sparkline.maxAxisType === "custom" ? sparkline.manualMax
          : sparkline.maxAxisType === "group" && groupValues.length ? Math.max(...groupValues) : undefined,
      };
      const index = glyph(renderSvg(createElement(SparklineGlyph, { sparkline, values: valuesOf(key), axisBounds })));
      if (index === undefined) continue;
      const cell = entry(row, col);
      if (!cell) break;
      cell.spark = index;
    }
  }
  return { cells: [...cells.values()], glyphs };
}
