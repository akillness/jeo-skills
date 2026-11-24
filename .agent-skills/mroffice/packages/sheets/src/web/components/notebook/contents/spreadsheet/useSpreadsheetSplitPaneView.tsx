"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { writeSplitPaneScroll } from "./SpreadsheetSplitPane";
import { useCallback, useEffect, type RefObject } from "react";
import { parseCellRef } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { type SplitPaneViewState, readFreezeConfig, hasFreeze, readSplitConfig, hasSplit, normalizeSplitPaneViewState, type SplitPaneName } from "@mrnote/core/web/lib/spreadsheet/freeze-panes.ts";
import { splitPaneScrollFor, type SplitPaneScrollState } from "../../../../lib/spreadsheet/split-pane-geometry";
import { type SheetModel } from "./spreadsheetSheetModel";
import { columnLabel, spreadsheetRangeA1 } from "./spreadsheetRangeA1";
import { splitPaneSelectionHydration, splitPaneAuthorityFingerprint } from "./spreadsheetSheetViews";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";
import { type Dispatch, type SetStateAction } from "react";
import { spreadsheetCellEditorAt } from "./spreadsheetCellLookup";

/** What useSpreadsheetSplitPaneView reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSplitPaneViewInputs {
  activeCell: { row: number; col: number; };
  commitSplitPaneViewRef: RefObject<(view: SplitPaneViewState) => boolean>;
  commitSplitView: (resolve: (liveSheet: SheetModel) => SheetModel | null) => boolean;
  gridRtl: boolean;
  hydratedSplitAuthority: string | null;
  physicalSplitPanes: ("topLeft" | "topRight" | "bottomLeft" | "bottomRight")[];
  readSplitScrollRef: RefObject<() => SplitPaneScrollState>;
  scheduleRaf: (callback: () => void) => void;
  selRect: GridRect;
  setActiveCell: Dispatch<SetStateAction<{ row: number; col: number; }>>;
  setHydratedSplitAuthority: Dispatch<SetStateAction<string | null>>;
  setSelectionAnchor: Dispatch<SetStateAction<{ row: number; col: number; } | null>>;
  sheet: SheetModel;
  sheetZoom: number;
  split: { splitRow: number; splitCol: number; };
  splitActive: boolean;
  splitAuthorityFingerprint: string | null;
  splitHydratedSelectionRef: RefObject<{ authority: string; selection: string; } | null>;
  splitPaneRefs: RefObject<Partial<Record<"topLeft" | "topRight" | "bottomLeft" | "bottomRight", HTMLDivElement | null>>>;
  splitPaneView: SplitPaneViewState;
  splitRenderingSupported: boolean;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetSplitPaneView({
  activeCell,
  commitSplitPaneViewRef,
  commitSplitView,
  gridRtl,
  hydratedSplitAuthority,
  physicalSplitPanes,
  readSplitScrollRef,
  scheduleRaf,
  selRect,
  setActiveCell,
  setHydratedSplitAuthority,
  setSelectionAnchor,
  sheet,
  sheetZoom,
  split,
  splitActive,
  splitAuthorityFingerprint,
  splitHydratedSelectionRef,
  splitPaneRefs,
  splitPaneView,
  splitRenderingSupported,
}: SpreadsheetSplitPaneViewInputs) {
  // Pane focus/selection is native VIEW state, not worksheet content. Persist it
  // without adding an Undo entry or scheduling formula recalculation, while
  // still authenticating the live active-sheet generation before autosave.
  const commitSplitPaneView = useCallback(
    (requested: SplitPaneViewState) => {
      if (!splitRenderingSupported) return false;
      return commitSplitView((liveSheet) => {
        const liveFreeze = readFreezeConfig({
          freezeRows: liveSheet.freezeRows,
          freezeCols: liveSheet.freezeCols,
          rowCount: liveSheet.rowCount,
          columnCount: liveSheet.columnCount,
        });
        const liveSplit = hasFreeze(liveFreeze)
          ? { splitRow: 0, splitCol: 0 }
          : readSplitConfig({
              splitRow: liveSheet.splitRow,
              splitCol: liveSheet.splitCol,
              rowCount: liveSheet.rowCount,
              columnCount: liveSheet.columnCount,
            });
        if (!hasSplit(liveSplit)) return null;
        const normalized = normalizeSplitPaneViewState(
          requested,
          liveSplit,
          { rowCount: liveSheet.rowCount, columnCount: liveSheet.columnCount },
          { row: activeCell.row, col: activeCell.col },
        );
        if (
          JSON.stringify(liveSheet.splitPaneState) === JSON.stringify(normalized)
        ) {
          return liveSheet;
        }
        return { ...liveSheet, splitPaneState: normalized };
      });
    },
    [
      activeCell.col,
      activeCell.row,
      commitSplitView,
      splitRenderingSupported,
    ],
  );
  commitSplitPaneViewRef.current = commitSplitPaneView;

  const activateSplitPane = useCallback(
    (pane: SplitPaneName, row?: number, col?: number) => {
      if (!physicalSplitPanes.includes(pane)) return;
      const selected = splitPaneView.selections.find(
        (candidate) => candidate.pane === pane,
      );
      if (!selected) return;
      const explicitlySelected = row !== undefined && col !== undefined;
      const requestedCell =
        explicitlySelected
          ? `${columnLabel(col)}${row + 1}`
          : selected.activeCell;
      const parsed = requestedCell ? parseCellRef(requestedCell) : null;
      const activeCellRef = parsed
        ? `${columnLabel(parsed.col)}${parsed.row + 1}`
        : selected.activeCell;
      const nextSelections = explicitlySelected
        ? splitPaneView.selections.map((candidate) =>
            candidate.pane === pane
              ? {
                  ...candidate,
                  activeCell: activeCellRef,
                  sqref: activeCellRef,
                  activeCellId: 0,
                }
              : candidate,
          )
        : splitPaneView.selections;
      const nextView = {
        ...splitPaneView,
        activePane: pane,
        selections: nextSelections,
      };
      if (!commitSplitPaneView(nextView)) return;
      const nextSelection = nextSelections.find(
        (candidate) => candidate.pane === pane,
      );
      const hydration = nextSelection
        ? splitPaneSelectionHydration(nextSelection)
        : null;
      if (hydration) {
        const authority = splitPaneAuthorityFingerprint(
          sheet.id,
          split,
          nextView,
        );
        splitHydratedSelectionRef.current = {
          authority,
          selection: hydration.signature,
        };
        setHydratedSplitAuthority(authority);
        setActiveCell(hydration.active);
        setSelectionAnchor(hydration.anchor);
      }
      // The live grid takes the pane's place at the pane's scroll; a clicked
      // cell takes the focus (typing goes into it, as in Excel), else the pane.
      const scroll = splitPaneScrollFor(readSplitScrollRef.current(), pane, split);
      const focusCell = explicitlySelected && parsed ? parsed : null;
      const settle = (attempt: number) => {
        const viewport = splitPaneRefs.current[pane];
        if (!viewport) return;
        writeSplitPaneScroll(viewport, scroll, sheetZoom, gridRtl);
        const input = focusCell
          ? spreadsheetCellEditorAt<HTMLInputElement>(viewport, `${focusCell.row}:${focusCell.col}`)
          : null;
        if (input) {
          input.focus({ preventScroll: true });
          return;
        }
        // The window may still be rendering the pane's rows.
        if (focusCell && attempt < 3) {
          scheduleRaf(() => settle(attempt + 1));
          return;
        }
        viewport.focus({ preventScroll: true });
      };
      scheduleRaf(() => settle(0));
    },
    [
      commitSplitPaneView,
      gridRtl,
      physicalSplitPanes,
      scheduleRaf,
      setActiveCell,
      setSelectionAnchor,
      sheet.id,
      sheetZoom,
      split,
      splitPaneView,
    ],
  );

  useEffect(() => {
    if (!splitActive || !splitAuthorityFingerprint) {
      if (hydratedSplitAuthority !== null) setHydratedSplitAuthority(null);
      splitHydratedSelectionRef.current = null;
      return;
    }
    if (hydratedSplitAuthority === splitAuthorityFingerprint) return;
    const selection = splitPaneView.selections.find(
      (candidate) => candidate.pane === splitPaneView.activePane,
    );
    const hydration = selection
      ? splitPaneSelectionHydration(selection)
      : null;
    if (!hydration) return;
    splitHydratedSelectionRef.current = {
      authority: splitAuthorityFingerprint,
      selection: hydration.signature,
    };
    setActiveCell(hydration.active);
    setSelectionAnchor(hydration.anchor);
    setHydratedSplitAuthority(splitAuthorityFingerprint);
  }, [
    hydratedSplitAuthority,
    setActiveCell,
    setSelectionAnchor,
    splitActive,
    splitAuthorityFingerprint,
    splitPaneView.activePane,
    splitPaneView.selections,
  ]);

  useEffect(() => {
    if (
      !splitActive ||
      !splitAuthorityFingerprint ||
      hydratedSplitAuthority !== splitAuthorityFingerprint
    ) {
      return;
    }
    const activeCellRef = `${columnLabel(activeCell.col)}${activeCell.row + 1}`;
    const sqref = spreadsheetRangeA1(selRect);
    const selectionSignature = `${activeCell.row}:${activeCell.col}:${sqref}`;
    const hydrated = splitHydratedSelectionRef.current;
    if (
      hydrated?.authority === splitAuthorityFingerprint &&
      hydrated.selection === selectionSignature
    ) {
      return;
    }
    const selections = splitPaneView.selections.map((candidate) =>
      candidate.pane === splitPaneView.activePane
        ? { ...candidate, activeCell: activeCellRef, sqref, activeCellId: 0 }
        : candidate,
    );
    const nextView = { ...splitPaneView, selections };
    splitHydratedSelectionRef.current = {
      authority: splitPaneAuthorityFingerprint(sheet.id, split, nextView),
      selection: selectionSignature,
    };
    void commitSplitPaneView(nextView);
  }, [
    activeCell.col,
    activeCell.row,
    commitSplitPaneView,
    hydratedSplitAuthority,
    selRect,
    sheet.id,
    split,
    splitActive,
    splitAuthorityFingerprint,
    splitPaneView,
  ]);
  return {
    activateSplitPane,
  };
}
