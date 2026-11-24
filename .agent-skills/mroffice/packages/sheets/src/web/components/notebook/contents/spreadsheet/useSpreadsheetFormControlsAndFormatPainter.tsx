"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { updateCellValue, updateCellStyle, type SpreadsheetCell } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import { THEME_HEADING_CELL_STYLE_IDS } from "../../../../lib/spreadsheet/theme-buttons";
import { useCallback, type RefObject } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { formatPainterCellsSnapshot, sheetAfterFormatPaint } from "../../../../lib/spreadsheet/format-painter-buttons";
import { applyCellStyle } from "../../../../lib/spreadsheet/cell-styles";
import { snapshotSpreadsheetPictureShadow, snapshotSpreadsheetShapeVisual, armSingle, armSticky, FORMAT_PAINTER_OFF, isArmed, planFormatPainterDestination, afterPaint, planSpreadsheetShapeVisualPaint, planSpreadsheetPictureShadowPaint, type FormatPainterState, type FormatPainterStyleMatrix, type SpreadsheetShapeVisualSnapshot, type SpreadsheetPictureShadowSnapshot } from "../../../../lib/spreadsheet/format-painter";
import { type rangeHasLockedCell as rangeHasLockedCellWithProtection, type SheetProtectionPermission } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { type ConditionalFormatRule, type ConditionalRange } from "@mrnote/core/web/lib/spreadsheet/conditional-format.ts";
import { type SpreadsheetViewOptions } from "../../../../lib/spreadsheet/view-options";
import { radioSeedValue, spinnerSeedValue, sliderSeedValue } from "../../../../lib/spreadsheet/form-controls";
import { type SpreadsheetObject, type SheetModel } from "./spreadsheetSheetModel";
import { readSmartArtBlockMarker } from "@mrnote/core/web/lib/office-smartart/model.ts";
import { withSheetSmartArtAuthorMarks } from "../../../../lib/spreadsheet/smartart-author-marks";
import { MAX_SHEET_ROWS, MAX_SHEET_COLS } from "./spreadsheetGridConstants";
import { type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation } from "./spreadsheetSheetViews";
import { type NamedCellStyle } from "../../../../lib/spreadsheet/cell-styles";
import { type GridRect } from "../../../../lib/spreadsheet/grid-nav";
import { type Dispatch, type SetStateAction } from "react";
import { type FormatCellsBorderLinesPatch } from "@mrnote/core/web/lib/spreadsheet/format-cells-border.ts";

/** What useSpreadsheetFormControlsAndFormatPainter reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetFormControlsAndFormatPainterInputs {
  activePivotOutputIntersects: (range: { r1: number; r2: number; c1: number; c2: number; }) => boolean;
  cellStyleGalleryStyles: readonly NamedCellStyle[];
  conditionalFormats: ConditionalFormatRule[];
  formatPainterRef: RefObject<FormatPainterState>;
  formatPainterSnapshotRef: RefObject<{ kind: "cells"; workbookIdentity: Readonly<Record<string, never>>; sourceSheetId: string; sourceRange: Readonly<ConditionalRange>; conditionalFormats: readonly ConditionalFormatRule[]; matrix: FormatPainterStyleMatrix; unlocked: readonly (readonly boolean[])[]; hidden?: readonly (readonly boolean[])[]; } | { kind: "shape"; workbookIdentity: Readonly<Record<string, never>>; sourceSheetId: string; sourceObjectId: string; visual: Readonly<SpreadsheetShapeVisualSnapshot>; } | { kind: "picture"; workbookIdentity: Readonly<Record<string, never>>; sourceSheetId: string; sourceObjectId: string; visual: Readonly<SpreadsheetPictureShadowSnapshot>; } | null>;
  paintFormatRef: RefObject<() => void>;
  primaryCellStyleSelection: Readonly<Record<string, { value: boolean; mixed: boolean; }>> | null;
  rangeClipboardWorkbookIdentityRef: RefObject<Readonly<Record<string, never>>>;
  rangeHasLockedCellRef: RefObject<(candidate: SheetModel, range: Parameters<typeof rangeHasLockedCellWithProtection>[1]) => boolean>;
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  selectedObject: SpreadsheetObject | null;
  /**
   * The WHOLE SmartArt graphic is selected (its border, or Esc from a shape):
   * Office greys the Format Painter there, as there is no one shape whose
   * formatting it would pick up.
   */
  smartArtGraphicSelected?: boolean;
  selRect: GridRect;
  setActiveCell: Dispatch<SetStateAction<{ row: number; col: number; }>>;
  setCellStyleForSelection: (patch: NonNullable<SpreadsheetCell["style"]>, options?: { locked?: boolean; formulaHidden?: boolean; mergeCells?: boolean; borderLinesPatch?: FormatCellsBorderLinesPatch; }) => void;
  setFormatPainter: Dispatch<SetStateAction<FormatPainterState>>;
  setSelectionAnchor: Dispatch<SetStateAction<{ row: number; col: number; } | null>>;
  sheet: SheetModel;
  sheetObjects: SpreadsheetObject[];
  sheetProtectionAllowsRef: RefObject<(candidate: SheetModel | null | undefined, permission: SheetProtectionPermission) => boolean>;
  sheets: SheetModel[];
  showProtectNotice: (message?: string) => void;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  viewOptions: SpreadsheetViewOptions;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetFormControlsAndFormatPainter({
  activePivotOutputIntersects,
  cellStyleGalleryStyles,
  conditionalFormats,
  formatPainterRef,
  formatPainterSnapshotRef,
  paintFormatRef,
  primaryCellStyleSelection,
  rangeClipboardWorkbookIdentityRef,
  rangeHasLockedCellRef,
  replaceActiveSheet,
  selectedObject,
  smartArtGraphicSelected = false,
  selRect,
  setActiveCell,
  setCellStyleForSelection,
  setFormatPainter,
  setSelectionAnchor,
  sheet,
  sheetObjects,
  sheetProtectionAllowsRef,
  sheets,
  showProtectNotice,
  t,
  viewOptions,
}: SpreadsheetFormControlsAndFormatPainterInputs) {
  // ── Other in-cell FORM CONTROLS (Excel / WPS "Insert > Form Controls"):
  // radio / spinner / slider. Each mirrors the checkbox plumbing above: flag
  // every cell in the selection with the chosen control AND clear the other
  // three control flags (mutual exclusivity — updateCellStyle strips `false`
  // keys), then SEED the value to the control's canonical text (preserving an
  // existing value where the control's seed allows). Value + style commit
  // through replaceActiveSheet so undo/redo + autosave cover it; a locked cell
  // on a protected sheet writes nothing.

  // The control-flag patch that turns a cell into `which` and clears the rest.
  const controlFlagPatch = useCallback(
    (which: "checkbox" | "radio" | "spinner" | "slider") => ({
      checkbox: which === "checkbox",
      radio: which === "radio",
      spinner: which === "spinner",
      slider: which === "slider",
    }),
    [],
  );

  const insertRadioInSelection = useCallback(() => {
    if (
      rangeHasLockedCellRef.current(sheet, {
        r1: selRect.r1,
        r2: selRect.r2,
        c1: selRect.c1,
        c2: selRect.c2,
      })
    ) {
      showProtectNotice();
      return;
    }
    let nextSheet = sheet;
    for (let r = selRect.r1; r <= selRect.r2; r += 1) {
      for (let c = selRect.c1; c <= selRect.c2; c += 1) {
        const existing = nextSheet.cells[`${r}:${c}`]?.value;
        nextSheet = updateCellValue(nextSheet, r, c, radioSeedValue(existing));
        nextSheet = updateCellStyle(nextSheet, r, c, controlFlagPatch("radio"));
      }
    }
    replaceActiveSheet(nextSheet);
  }, [controlFlagPatch, replaceActiveSheet, sheet, selRect, showProtectNotice]);

  const insertSpinnerInSelection = useCallback(() => {
    if (
      rangeHasLockedCellRef.current(sheet, {
        r1: selRect.r1,
        r2: selRect.r2,
        c1: selRect.c1,
        c2: selRect.c2,
      })
    ) {
      showProtectNotice();
      return;
    }
    let nextSheet = sheet;
    for (let r = selRect.r1; r <= selRect.r2; r += 1) {
      for (let c = selRect.c1; c <= selRect.c2; c += 1) {
        const existing = nextSheet.cells[`${r}:${c}`]?.value;
        nextSheet = updateCellValue(
          nextSheet,
          r,
          c,
          spinnerSeedValue(existing),
        );
        nextSheet = updateCellStyle(
          nextSheet,
          r,
          c,
          controlFlagPatch("spinner"),
        );
      }
    }
    replaceActiveSheet(nextSheet);
  }, [controlFlagPatch, replaceActiveSheet, sheet, selRect, showProtectNotice]);

  const insertSliderInSelection = useCallback(() => {
    if (
      rangeHasLockedCellRef.current(sheet, {
        r1: selRect.r1,
        r2: selRect.r2,
        c1: selRect.c1,
        c2: selRect.c2,
      })
    ) {
      showProtectNotice();
      return;
    }
    let nextSheet = sheet;
    for (let r = selRect.r1; r <= selRect.r2; r += 1) {
      for (let c = selRect.c1; c <= selRect.c2; c += 1) {
        const existing = nextSheet.cells[`${r}:${c}`]?.value;
        nextSheet = updateCellValue(nextSheet, r, c, sliderSeedValue(existing));
        nextSheet = updateCellStyle(
          nextSheet,
          r,
          c,
          controlFlagPatch("slider"),
        );
      }
    }
    replaceActiveSheet(nextSheet);
  }, [controlFlagPatch, replaceActiveSheet, sheet, selRect, showProtectNotice]);

  // Write a control's new value into a single cell (radio select / spinner step
  // or typed number / slider drag), normalized to the control's canonical text,
  // through the normal cell-edit path. Respects sheet protection.
  const setControlValueAt = useCallback(
    (row: number, col: number, value: string) => {
      if (rangeHasLockedCellRef.current(sheet, { r1: row, r2: row, c1: col, c2: col })) {
        showProtectNotice();
        return;
      }
      replaceActiveSheet(updateCellValue(sheet, row, col, value));
    },
    [replaceActiveSheet, sheet, showProtectNotice],
  );

  // Excel's complete built-in Cell Styles gallery. Clicking an entry stamps its
  // owned fields onto the whole selection through setCellStyleForSelection, so
  // it lands as ONE undoable step + autosave like any other style edit. Visual
  // styles leave number/alignment alone, Number Format styles own only their
  // format, and Normal deliberately restores the built-in formatting defaults.
  //
  // Protection is enforced HERE, before any write, mirroring the Format Painter
  // guard EXACTLY: if the selection covers a locked cell on a protected sheet we
  // show the protect notice and write NOTHING (the gallery stays open so the
  // user can pick again on an editable target). An unknown id resolves to null
  // via applyCellStyle → no-op, no crash.
  const applyNamedCellStyle = useCallback(
    (styleId: string) => {
      const patch = applyCellStyle(styleId, cellStyleGalleryStyles);
      if (!patch) return; // unknown name → no-op, no write.
      const state = primaryCellStyleSelection?.[styleId];
      if (!state) return; // malformed/stale selection authority → fail closed.
      if (!state.mixed && state.value) return; // semantic repeat → zero write.
      if (
        rangeHasLockedCellRef.current(sheet, {
          r1: selRect.r1,
          r2: selRect.r2,
          c1: selRect.c1,
          c2: selRect.c2,
        })
      ) {
        showProtectNotice();
        return; // locked target → notice + write nothing.
      }
      // The patch keys are all valid cell-style fields (fontSize is carried via
      // the style's index signature); cast to the stored-style shape so the
      // merge in updateCellStyle treats it like any other style patch.
      const themeFontRole = THEME_HEADING_CELL_STYLE_IDS.has(styleId)
        ? "heading"
        : undefined;
      // XLS-A012: a custom style that includes Protection sets Locked and
      // Hidden too, which live on the cell rather than in its style.
      const protection = viewOptions.customCellStyles?.find(
        (style) => style.id === styleId,
      )?.protection;
      setCellStyleForSelection(
        {
          ...patch,
          themeFontRole,
        } as NonNullable<SpreadsheetCell["style"]>,
        protection
          ? { locked: protection.locked, formulaHidden: protection.hidden }
          : undefined,
      );
    },
    [
      viewOptions.customCellStyles,
      cellStyleGalleryStyles,
      primaryCellStyleSelection,
      sheet,
      selRect,
      showProtectNotice,
      setCellStyleForSelection,
    ],
  );

  // Format Painter (Excel/WPS 格式刷) — toolbar button wiring.
  //
  // Click  = arm SINGLE-use (capture the selected style matrix; the next
  //          paint disarms). Clicking again while armed cancels (no stuck state).
  // Dbl-clk = arm STICKY (stays armed, paints repeatedly until Esc / a click).
  // Esc / window blur disarms (handled by the grid keydown + cleanup).
  const captureFormatPainterSnapshot = useCallback(() => {
    // A selected drawing object owns the Format Painter source. Its detached
    // visual snapshot deliberately excludes identity, geometry and content.
    // Charts do not silently fall back to the active cell.
    if (selectedObject) {
      if (selectedObject.type === "image") {
        return {
          kind: "picture" as const,
          workbookIdentity: rangeClipboardWorkbookIdentityRef.current,
          sourceSheetId: sheet.id,
          sourceObjectId: selectedObject.id,
          visual: snapshotSpreadsheetPictureShadow(selectedObject.shadow),
        };
      }
      if (selectedObject.type !== "shape" || smartArtGraphicSelected) return null;
      return {
        kind: "shape" as const,
        workbookIdentity: rangeClipboardWorkbookIdentityRef.current,
        sourceSheetId: sheet.id,
        sourceObjectId: selectedObject.id,
        visual: snapshotSpreadsheetShapeVisual(
          selectedObject.shape,
          selectedObject.shadow,
        ),
      };
    }
    const cells = formatPainterCellsSnapshot(
      sheet,
      { r1: selRect.r1, c1: selRect.c1, r2: selRect.r2, c2: selRect.c2 },
      conditionalFormats,
    );
    return cells
      ? {
          ...cells,
          workbookIdentity: rangeClipboardWorkbookIdentityRef.current,
          sourceSheetId: sheet.id,
        }
      : null;
  }, [conditionalFormats, selectedObject, selRect, sheet, smartArtGraphicSelected]);
  const armFormatPainterSingle = useCallback(() => {
    const current = formatPainterRef.current;
    if (current.mode !== "off") {
      const next = armSingle(current, null);
      formatPainterSnapshotRef.current = null;
      formatPainterRef.current = next;
      setFormatPainter(next);
      return;
    }
    const snapshot = captureFormatPainterSnapshot();
    if (!snapshot) return;
    const next = armSingle(
      current,
      snapshot.kind === "cells" ? snapshot.matrix.styles[0][0] : {},
    );
    formatPainterSnapshotRef.current = snapshot;
    formatPainterRef.current = next;
    setFormatPainter(next);
  }, [captureFormatPainterSnapshot]);
  const armFormatPainterSticky = useCallback(() => {
    const snapshot = captureFormatPainterSnapshot();
    if (!snapshot) return;
    const next = armSticky(
      formatPainterRef.current,
      snapshot.kind === "cells" ? snapshot.matrix.styles[0][0] : {},
    );
    formatPainterSnapshotRef.current = snapshot;
    formatPainterRef.current = next;
    setFormatPainter(next);
  }, [captureFormatPainterSnapshot]);
  const disarmFormatPainter = useCallback(() => {
    formatPainterSnapshotRef.current = null;
    formatPainterRef.current = FORMAT_PAINTER_OFF;
    setFormatPainter(FORMAT_PAINTER_OFF);
  }, []);

  // Paint the detached style matrix and conditional-rule snapshot onto the
  // current selection rectangle. A one-cell target expands to the source
  // dimensions; larger targets must tile the source exactly. Every authority,
  // bounds, protection, and rule-cap check happens before a next sheet exists,
  // so failure writes nothing and deliberately stays armed.
  const paintFormatOntoSelection = useCallback(() => {
    const painter = formatPainterRef.current;
    const snapshot = formatPainterSnapshotRef.current;
    if (
      !isArmed(painter) ||
      !snapshot ||
      snapshot.kind !== "cells" ||
      snapshot.workbookIdentity !== rangeClipboardWorkbookIdentityRef.current ||
      !sheets.some((candidate) => candidate.id === snapshot.sourceSheetId)
    ) {
      return;
    }
    // The whole grid is a target, not only the used part: a blank cell far
    // below takes the format, and the sheet grows to it in the same step
    // (live audit B213); the destination still has to fit the grid.
    const destination = planFormatPainterDestination(snapshot.matrix, selRect, {
      rows: MAX_SHEET_ROWS,
      columns: MAX_SHEET_COLS,
    });
    if (!destination) {
      toast({ description: t("spreadsheet.formatPainterDoesNotFit") });
      return;
    }
    if (
      rangeHasLockedCellRef.current(sheet, destination) ||
      activePivotOutputIntersects(destination)
    ) {
      showProtectNotice();
      return; // write nothing; stay armed for a retry on an editable target.
    }
    const painted = sheetAfterFormatPaint(sheet, snapshot, destination, conditionalFormats);
    if (painted === null) return;
    if (painted !== sheet) replaceActiveSheet(painted);
    setSelectionAnchor({ row: destination.r1, col: destination.c1 });
    setActiveCell({ row: destination.r2, col: destination.c2 });
    const nextPainter = afterPaint(painter);
    if (nextPainter.mode === "off") formatPainterSnapshotRef.current = null;
    formatPainterRef.current = nextPainter;
    setFormatPainter(nextPainter);
  }, [
    activePivotOutputIntersects,
    conditionalFormats,
    replaceActiveSheet,
    selRect,
    sheet,
    sheets,
    showProtectNotice,
    t,
  ]);

  // Paint a detached shape visual or picture shadow onto a same-kind live
  // object resolved by stable id at event time. Incompatible objects and stale
  // workbook/source identities are true fail-closed attempts: no
  // sheet/history/save and the painter remains armed for a valid target.
  const paintFormatOntoObject = useCallback(
    (targetObjectId: string): boolean => {
      if (!sheetProtectionAllowsRef.current(sheet, "editObjects")) {
        showProtectNotice();
        return false;
      }
      const painter = formatPainterRef.current;
      const snapshot = formatPainterSnapshotRef.current;
      if (
        !isArmed(painter) ||
        !snapshot ||
        (snapshot.kind !== "shape" && snapshot.kind !== "picture") ||
        snapshot.workbookIdentity !== rangeClipboardWorkbookIdentityRef.current
      ) {
        return false;
      }
      const sourceSheets = sheets.filter(
        (candidate) => candidate.id === snapshot.sourceSheetId,
      );
      if (sourceSheets.length !== 1) return false;
      const sourceObjects = (sourceSheets[0].objects ?? []).filter(
        (object) => object.id === snapshot.sourceObjectId,
      );
      const expectedType = snapshot.kind === "shape" ? "shape" : "image";
      if (
        sourceObjects.length !== 1 ||
        sourceObjects[0].type !== expectedType
      ) {
        return false;
      }
      const targetMatches = sheetObjects.flatMap((object, index) =>
        object.id === targetObjectId ? [{ object, index }] : [],
      );
      if (
        targetMatches.length !== 1 ||
        targetMatches[0].object.type !== expectedType
      ) {
        return false;
      }
      const { object: target, index: targetIndex } = targetMatches[0];
      let nextTarget: SpreadsheetObject | null = null;
      // A SmartArt item whose words are a LABEL over its shape (the label is
      // what was clicked): the fill and line land on the item's shape, as a
      // click on the words selects that shape, and only the text formatting
      // on the words -- painted onto the label alone, its strip took a fill.
      const labelMarker = snapshot.kind === "shape" ? readSmartArtBlockMarker(target) : null;
      const itemNodeIndex =
        labelMarker?.role === "label" && labelMarker.itemId
          ? sheetObjects.findIndex((object) => {
              const marker = readSmartArtBlockMarker(object);
              return (
                object.type === "shape" &&
                marker?.groupId === labelMarker.groupId &&
                marker.role === "node" &&
                marker.itemId === labelMarker.itemId
              );
            })
          : -1;
      if (snapshot.kind === "shape" && itemNodeIndex >= 0) {
        const node = sheetObjects[itemNodeIndex];
        const nodePlan = planSpreadsheetShapeVisualPaint(snapshot.visual, node.shape, node.shadow);
        const labelPlan = planSpreadsheetShapeVisualPaint(snapshot.visual, target.shape, target.shadow);
        if (!nodePlan || !labelPlan) return false;
        const nextObjects = [...sheetObjects];
        if (nodePlan.changed) {
          const nextNode = { ...node, shape: nodePlan.shape } as SpreadsheetObject;
          if (nodePlan.shadow) nextNode.shadow = nodePlan.shadow;
          else delete nextNode.shadow;
          nextObjects[itemNodeIndex] = withSheetSmartArtAuthorMarks(node, nextNode);
        }
        const labelShape = {
          ...labelPlan.shape,
          fill: target.shape?.fill ?? labelPlan.shape.fill,
          stroke: target.shape?.stroke ?? labelPlan.shape.stroke,
          strokeWidth: target.shape?.strokeWidth ?? labelPlan.shape.strokeWidth,
        };
        if (JSON.stringify(labelShape) !== JSON.stringify(target.shape)) {
          nextObjects[targetIndex] = withSheetSmartArtAuthorMarks(target, { ...target, shape: labelShape } as SpreadsheetObject);
        }
        if (nextObjects.some((object, index) => object !== sheetObjects[index])) {
          replaceActiveSheet({ ...sheet, objects: nextObjects });
        }
        const nextPainter = afterPaint(painter);
        if (nextPainter.mode === "off") formatPainterSnapshotRef.current = null;
        formatPainterRef.current = nextPainter;
        setFormatPainter(nextPainter);
        return true;
      }
      if (snapshot.kind === "shape") {
        const plan = planSpreadsheetShapeVisualPaint(
          snapshot.visual,
          target.shape,
          target.shadow,
        );
        if (!plan) return false;
        if (plan.changed) {
          nextTarget = {
            ...target,
            shape: plan.shape,
          };
          if (plan.shadow) nextTarget.shadow = plan.shadow;
          else delete nextTarget.shadow;
        }
      } else {
        const plan = planSpreadsheetPictureShadowPaint(
          snapshot.visual,
          target.shadow,
        );
        if (!plan) return false;
        if (plan.changed) {
          nextTarget = { ...target };
          if (plan.shadow) nextTarget.shadow = plan.shadow;
          else delete nextTarget.shadow;
        }
      }

      if (nextTarget) {
        const nextObjects = [...sheetObjects];
        // One shape of a SmartArt graphic: what was painted on it is the
        // author's (fill and line, the words' colour and size).
        nextObjects[targetIndex] = withSheetSmartArtAuthorMarks(target, nextTarget);
        replaceActiveSheet({
          ...sheet,
          objects: nextObjects,
        });
      }

      const nextPainter = afterPaint(painter);
      if (nextPainter.mode === "off") formatPainterSnapshotRef.current = null;
      formatPainterRef.current = nextPainter;
      setFormatPainter(nextPainter);
      return true;
    },
    [replaceActiveSheet, sheet, sheetObjects, sheets, showProtectNotice],
  );
  // Keep the mouseup listener pointed at the freshest paint closure.
  paintFormatRef.current = paintFormatOntoSelection;
  return {
    applyNamedCellStyle,
    armFormatPainterSingle,
    armFormatPainterSticky,
    disarmFormatPainter,
    insertRadioInSelection,
    insertSliderInSelection,
    insertSpinnerInSelection,
    paintFormatOntoObject,
    setControlValueAt,
  };
}
