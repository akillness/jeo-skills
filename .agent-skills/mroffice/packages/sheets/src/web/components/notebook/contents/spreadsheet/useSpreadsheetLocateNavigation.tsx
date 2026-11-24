"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { usePageLocate } from "@mrnote/core/web/hooks/usePageLocate.ts";
import { type PageLocateRequest, PAGE_LOCATE_SNIPPET_PREFIX } from "@mrnote/core/web/lib/page-locate.ts";
import { useRef, useInsertionEffect, useCallback, type RefObject } from "react";
import { type SpreadsheetNavigationElementSelection } from "@/components/notebook/contents/spreadsheet/SpreadsheetNavigationPane";
import { type ErrorCheckFinding } from "../../../../lib/spreadsheet/error-checking";
import { normalizeNamedRanges } from "@mrnote/core/web/lib/spreadsheet/named-ranges.ts";
import { resolveNameBoxTarget } from "../../../../lib/spreadsheet/grid-ops";
import { splitSheetQualifier } from "@mrnote/core/web/lib/spreadsheet/name-syntax.ts";
import { formatInternalLink, parseNamedLink, resolveInternalLinkTarget } from "@mrnote/core/web/lib/spreadsheet/sheet-interactions.ts";
import { normalizeDataTables } from "@mrnote/core/web/lib/spreadsheet/data-table.ts";
import { normalizeCharts } from "@mrnote/core/web/lib/spreadsheet/chart.ts";
import { parseA1Range } from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";
import { findMatchesInWorkbook, type FindDisplayText } from "../../../../lib/spreadsheet/find-replace";
import { type SheetModel } from "./spreadsheetSheetModel";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetLocateNavigation reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetLocateNavigationInputs {
  activeCell: { row: number; col: number; };
  activeSheetIndex: number;
  formulaInputRef: RefObject<HTMLInputElement | null>;
  navigateToSheetCell: (targetSheetIndex: number, row: number, col: number) => void;
  navigateToSheetRange: (targetSheetIndex: number, rawRange: { r1: number; c1: number; r2: number; c2: number; }) => void;
  pageId: string;
  renderedSheetIdRef: RefObject<string>;
  rootRef: RefObject<HTMLDivElement | null>;
  scheduleRaf: (callback: () => void) => void;
  setActiveCell: Dispatch<SetStateAction<{ row: number; col: number; }>>;
  setCommentDraft: Dispatch<SetStateAction<string>>;
  setCommentOpen: Dispatch<SetStateAction<boolean>>;
  setErrorCheckOpen: Dispatch<SetStateAction<boolean>>;
  setEvaluateFormulaOpen: Dispatch<SetStateAction<boolean>>;
  setObjectSelectionMode: Dispatch<SetStateAction<boolean>>;
  setSelectedObjectId: Dispatch<SetStateAction<string | null>>;
  setSelectionAnchor: Dispatch<SetStateAction<{ row: number; col: number; } | null>>;
  sheet: SheetModel;
  sheets: SheetModel[];
  writeActiveSheetIndex: Dispatch<SetStateAction<number>>;
  writeSelectedChartSelection: (next: Readonly<{ sheetId: string; chartId: string; }> | null) => void;
  /**
   * What each sheet's cells display (the Find dialog's Look in Values,
   * `useSpreadsheetFindReplace`), filled once that hook has run: a snippet
   * Locate searches the workbook by it, not the cells drawn on screen.
   */
  locateDisplayTextFor?: RefObject<((sheetIndex: number) => FindDisplayText | undefined) | null>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetLocateNavigation({
  activeCell,
  activeSheetIndex,
  formulaInputRef,
  navigateToSheetCell,
  navigateToSheetRange,
  pageId,
  renderedSheetIdRef,
  rootRef,
  scheduleRaf,
  setActiveCell,
  setCommentDraft,
  setCommentOpen,
  setErrorCheckOpen,
  setEvaluateFormulaOpen,
  setObjectSelectionMode,
  setSelectedObjectId,
  setSelectionAnchor,
  sheet,
  sheets,
  writeActiveSheetIndex,
  writeSelectedChartSelection,
  locateDisplayTextFor,
}: SpreadsheetLocateNavigationInputs) {
  // An AI answer's "Locate" (lib/page-locate.ts): a request naming a cell
  // selects it the way the Name Box does (switching sheets, scrolling the
  // virtualized grid), then the hook flashes the cell once it is mounted. A
  // request with only a snippet finds the first visible cell showing it.
  const locateNavigatedRequestRef = useRef<string | null>(null);
  const resolveWorkbookLocate = (
    scope: Element,
    request: PageLocateRequest,
  ): HTMLElement | null => {
    const located = request.cell;
    if (located) {
      const wanted = located.sheet.toLowerCase();
      // The sheet by its id when the source names it (a renamed sheet is the
      // same sheet), else by its name.
      const byId = located.sheetId
        ? sheets.findIndex((candidate) => candidate.id === located.sheetId && !candidate.hidden)
        : -1;
      const targetSheetIndex = byId >= 0 ? byId : sheets.findIndex(
        (candidate) => candidate.name.toLowerCase() === wanted && !candidate.hidden,
      );
      const target =
        targetSheetIndex >= 0 ? resolveNameBoxTarget(located.ref, () => null) : null;
      if (!target) return null;
      if (locateNavigatedRequestRef.current !== request.requestId) {
        locateNavigatedRequestRef.current = request.requestId;
        navigateToSheetRange(targetSheetIndex, target);
        return null;
      }
      if (renderedSheetIdRef.current !== sheets[targetSheetIndex].id) return null;
      return scope.querySelector<HTMLElement>(
        `td[data-range-cell="${target.r1}:${target.c1}"]`,
      );
    }
    const needle = (request.snippet ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, PAGE_LOCATE_SNIPPET_PREFIX)
      .trim();
    if (!needle) return null;
    // The first cell that displays the snippet, on the active sheet first,
    // then the others in tab order: found in the workbook as Find finds it
    // (the grid draws most cells on a canvas and mounts only those in view,
    // so the cells on screen are not where to look), then selected as the
    // Name Box selects it.
    const matches = findMatchesInWorkbook(
      sheets.map((candidate) => (candidate.hidden ? {} : candidate.cells)),
      needle,
      {},
      (sheetIndex) => locateDisplayTextFor?.current?.(sheetIndex),
    );
    const match =
      matches.find((entry) => entry.sheetIndex === activeSheetIndex) ?? matches[0];
    if (!match) return null;
    if (locateNavigatedRequestRef.current !== request.requestId) {
      locateNavigatedRequestRef.current = request.requestId;
      navigateToSheetCell(match.sheetIndex, match.row, match.col);
      return null;
    }
    if (renderedSheetIdRef.current !== sheets[match.sheetIndex]?.id) return null;
    return scope.querySelector<HTMLElement>(
      `td[data-range-cell="${match.row}:${match.col}"]`,
    );
  };
  usePageLocate(pageId, rootRef, {
    resolve: resolveWorkbookLocate,
    marker: "attribute",
  });

  const selectNavigationSheet = (sheetId: string): void => {
    const targetSheetIndex = sheets.findIndex(
      (candidate) => candidate.id === sheetId && !candidate.hidden,
    );
    if (targetSheetIndex < 0) return;
    navigateToSheetCell(targetSheetIndex, 0, 0);
  };

  const selectNavigationElement = (
    selection: SpreadsheetNavigationElementSelection,
  ): void => {
    const targetSheetIndex = sheets.findIndex(
      (candidate) => candidate.id === selection.sheetId && !candidate.hidden,
    );
    const targetSheet = sheets[targetSheetIndex];
    if (!targetSheet) return;

    if (selection.kind === "range") {
      const namedRange = normalizeNamedRanges(targetSheet.namedRanges).find(
        (candidate) =>
          `range:${candidate.name.toLowerCase()}` === selection.id,
      );
      // A name's reference is stored sheet-qualified (`回款!$C$4:$C$10`), as
      // Excel stores it; select it on the sheet it names.
      const range = namedRange
        ? resolveNameBoxTarget(namedRange.ref.replace(/^=\s*/, ""), () => null)
        : null;
      const rangeSheet = range?.sheet?.toLowerCase();
      const rangeSheetIndex =
        rangeSheet === undefined
          ? targetSheetIndex
          : sheets.findIndex(
              (candidate) => candidate.name.toLowerCase() === rangeSheet,
            );
      if (range && rangeSheetIndex >= 0 && !sheets[rangeSheetIndex].hidden) {
        navigateToSheetRange(rangeSheetIndex, range);
      }
      return;
    }
    if (selection.kind === "table") {
      const table = normalizeDataTables(targetSheet.dataTables, {
        rowCount: targetSheet.rowCount,
        columnCount: targetSheet.columnCount,
      }).find((candidate) => candidate.id === selection.id);
      if (table) navigateToSheetRange(targetSheetIndex, table.range);
      return;
    }
    if (selection.kind === "pivot") {
      const morePivotIndex = selection.id.startsWith(`pivot:${targetSheet.id}:`)
        ? Number(selection.id.slice(`pivot:${targetSheet.id}:`.length)) - 1
        : -1;
      const morePivot = targetSheet.morePivots?.[morePivotIndex];
      if (morePivot) {
        const moreRange = parseA1Range(
          (morePivot.native?.outputRef || morePivot.output || morePivot.source).replace(
            /\$/g,
            "",
          ),
        );
        if (moreRange) navigateToSheetRange(targetSheetIndex, moreRange);
        return;
      }
      if (selection.id !== `pivot:${targetSheet.id}` || !targetSheet.pivot)
        return;
      const range = parseA1Range(
        (targetSheet.pivot.output || targetSheet.pivot.source).replace(
          /\$/g,
          "",
        ),
      );
      if (range) navigateToSheetRange(targetSheetIndex, range);
      return;
    }

    const objectMatches = (targetSheet.objects ?? []).filter(
      (object) =>
        object.id === selection.id && object.type === selection.kind,
    );
    if (objectMatches.length === 1) {
      const object = objectMatches[0];
      const anchorRow = object.anchor?.from?.row ?? 0;
      const anchorCol =
        object.anchor?.from?.column ?? object.anchor?.from?.col ?? 0;
      if (object.hidden) {
        navigateToSheetCell(targetSheetIndex, anchorRow, anchorCol);
        return;
      }
      if (targetSheetIndex !== activeSheetIndex) {
        writeActiveSheetIndex(targetSheetIndex);
      }
      setActiveCell({ row: anchorRow, col: anchorCol });
      setSelectionAnchor({ row: anchorRow, col: anchorCol });
      setSelectedObjectId(object.id);
      setCommentDraft("");
      setCommentOpen(false);
      setObjectSelectionMode(false);
      scheduleRaf(() => {
        const objectButton = Array.from(
          rootRef.current?.querySelectorAll<HTMLElement>(
            "[data-spreadsheet-object-id]",
          ) ?? [],
        ).find(
          (candidate) =>
            candidate.dataset.spreadsheetObjectId === object.id,
        );
        objectButton?.focus();
      });
      return;
    }
    if (selection.kind !== "chart") return;
    const chart = normalizeCharts(targetSheet.charts).find(
      (candidate) => candidate.id === selection.id,
    );
    if (chart) {
      navigateToSheetCell(
        targetSheetIndex,
        chart.anchor.row,
        chart.anchor.col,
      );
      if (!chart.hidden) {
        writeSelectedChartSelection({
          sheetId: targetSheet.id,
          chartId: chart.id,
        });
      }
    }
  };

  // ErrorCheckPanel selects the first finding on open and every finding as its
  // pointer moves. Keep that callback stable so unrelated renders cannot replay
  // navigation, while the latest-ref preserves the current worksheet identity
  // and the shared scroll/selection/focus seam.
  const errorCheckNavigationRef = useRef({
    sheets,
    navigateToSheetCell,
    activeSheetId: sheet.id,
    activeRow: activeCell.row,
    activeCol: activeCell.col,
  });
  useInsertionEffect(() => {
    errorCheckNavigationRef.current = {
    sheets,
    navigateToSheetCell,
    activeSheetId: sheet.id,
    activeRow: activeCell.row,
    activeCol: activeCell.col,
  };
  });
  const errorCheckSheetId = sheet.id;
  const navigateToErrorCheckFinding = useCallback(
    (row: number, col: number) => {
      const navigation = errorCheckNavigationRef.current;
      const targetSheetIndex = navigation.sheets.findIndex(
        (candidate) => candidate.id === errorCheckSheetId,
      );
      if (targetSheetIndex < 0) return;
      navigation.navigateToSheetCell(targetSheetIndex, row, col);
    },
    [errorCheckSheetId],
  );

  const resolveCurrentErrorCheckFinding = useCallback(
    (finding: ErrorCheckFinding) => {
      const navigation = errorCheckNavigationRef.current;
      const targetSheetIndex = navigation.sheets.findIndex(
        (candidate) => candidate.id === errorCheckSheetId,
      );
      const targetSheet = navigation.sheets[targetSheetIndex];
      if (
        !targetSheet ||
        !Number.isInteger(finding.row) ||
        !Number.isInteger(finding.col) ||
        finding.row < 0 ||
        finding.row >= targetSheet.rowCount ||
        finding.col < 0 ||
        finding.col >= targetSheet.columnCount
      ) {
        return null;
      }
      const value = targetSheet.cells[`${finding.row}:${finding.col}`]?.value;
      const raw = typeof value === "string" ? value : String(value ?? "");
      if (raw !== finding.detail) return null;
      return { navigation, targetSheetIndex, raw };
    },
    [errorCheckSheetId],
  );

  const showErrorCheckCalculationSteps = useCallback(
    (finding: ErrorCheckFinding) => {
      const resolved = resolveCurrentErrorCheckFinding(finding);
      if (!resolved || !resolved.raw.startsWith("=")) return;
      resolved.navigation.navigateToSheetCell(
        resolved.targetSheetIndex,
        finding.row,
        finding.col,
      );
      setErrorCheckOpen(false);
      setEvaluateFormulaOpen(true);
    },
    [resolveCurrentErrorCheckFinding],
  );

  const editErrorCheckFindingInFormulaBar = useCallback(
    (finding: ErrorCheckFinding) => {
      const resolved = resolveCurrentErrorCheckFinding(finding);
      if (!resolved) return;
      resolved.navigation.navigateToSheetCell(
        resolved.targetSheetIndex,
        finding.row,
        finding.col,
      );
      setErrorCheckOpen(false);
      scheduleRaf(() => {
        const current = resolveCurrentErrorCheckFinding(finding);
        if (
          !current ||
          current.navigation.activeSheetId !== errorCheckSheetId ||
          current.navigation.activeRow !== finding.row ||
          current.navigation.activeCol !== finding.col
        ) {
          return;
        }
        const input = formulaInputRef.current;
        if (!input) return;
        input.focus();
        input.select();
      });
    },
    [errorCheckSheetId, resolveCurrentErrorCheckFinding, scheduleRaf],
  );

  // Internal-link jump (Excel/WPS "#Sheet2!A1"): resolve the stored link to its
  // target sheet (by name, case-insensitive) and cell (clamped to that sheet's
  // extent), then route through the shared viewport/selection seam above. A
  // malformed link or a now-missing sheet is a no-op.
  // A defined name as a formula on this sheet reads it (B332): this sheet's
  // own local name first, then a workbook name; another sheet's local name
  // is not in scope here.
  const findScopedName = (name: string) => {
    
    const qualified = splitSheetQualifier(name.trim());
    const scopeSheet = qualified.sheet !== undefined
      ? sheets.find((candidate) => candidate.name.toLowerCase() === qualified.sheet!.toLowerCase())
      : sheet;
    if (!scopeSheet) return null;
    const wanted = qualified.ref.trim().toLowerCase();
    const sameScopeSheet = (entry: { scopeSheetId?: string }) =>
      (entry.scopeSheetId ?? "").trim().toUpperCase() === scopeSheet.id.trim().toUpperCase();
    for (const local of [true, false]) {
      for (const candidate of sheets) {
        const named = (candidate.namedRanges ?? []).find(
          (entry) =>
            entry.name.trim().toLowerCase() === wanted &&
            (local ? entry.scope === "worksheet" && sameScopeSheet(entry) : entry.scope !== "worksheet"),
        );
        if (named) return { named, owner: candidate };
      }
    }
    return null;
  };
  /** Where a link to a defined name leads now: the name's range as it is
   * defined at this moment (B359), or null when the name is gone. */
  const namedLinkPlace = (name: string): string | null => {
    const found = findScopedName(name);
    if (!found) return null;
    const ref = found.named.ref.replace(/^=/, "").replace(/\$/g, "");
    return ref.includes("!") ? `#${ref}` : formatInternalLink(found.owner.name, ref);
  };
  const navigateInternalLink = (link: string): void => {
    const name = parseNamedLink(link);
    const place = name === null ? link : namedLinkPlace(name);
    if (place === null) return;
    const target = resolveInternalLinkTarget(
      place,
      sheets.map((candidate) => candidate.name),
      (index) => {
        const s = sheets[index];
        return { rowCount: s?.rowCount ?? 0, columnCount: s?.columnCount ?? 0 };
      },
    );
    if (!target) return;
    navigateToSheetCell(target.sheetIndex, target.row, target.col);
  };
  return {
    editErrorCheckFindingInFormulaBar,
    findScopedName,
    navigateInternalLink,
    navigateToErrorCheckFinding,
    selectNavigationElement,
    selectNavigationSheet,
    showErrorCheckCalculationSteps,
  };
}
