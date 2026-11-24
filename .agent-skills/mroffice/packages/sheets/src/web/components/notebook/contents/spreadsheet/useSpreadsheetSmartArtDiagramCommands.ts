"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, type RefObject } from "react";
import { type SmartArtHierBranch, type SmartArtStyle, type SmartArtNodePaint, type OfficeSmartArtHostNode, type SmartArtKind, type SmartArtDirection } from "@mrnote/core/web/lib/office-smartart/model.ts";
import { smartArtResetChange } from "@mrnote/core/web/lib/office-smartart/design-model.ts";
import { type SmartArtColorTheme } from "@mrnote/core/web/lib/office-smartart/colors.ts";
import { smartArtRecolourIsAuthors, smartArtOutlineAfterAdd, type SmartArtOutlineInsertPosition, smartArtOutlineAfterInsert, smartArtOutlineAfterMove, smartArtOutlineAfterDelete, smartArtOutlineAfterMerge, smartArtOutlineAfterPaste, smartArtOutlineAfterPromote, smartArtOutlineAfterHierBranch, smartArtOutlineAfterDemote } from "@mrnote/core/web/lib/office-smartart/design-model.ts";
import { readSheetSmartArtColors, readSheetSmartArtStyleId } from "@mrnote/core/web/lib/spreadsheet/smartart-design.ts";
import { type SmartArtOutlineItem } from "@mrnote/core/web/lib/office-smartart/outline.ts";
import { type SmartArtStyleId, DEFAULT_SMARTART_STYLE_ID } from "@mrnote/core/web/lib/office-smartart/styles-model.ts";
import { type SpreadsheetObject } from "./spreadsheetSheetModel";
import { type OfficeSmartArtPlaceholders } from "@mrnote/core/web/lib/office-smartart/catalog.ts";
import { smartArtCommandItemId, type SmartArtItemCommand } from "@mrnote/core/web/lib/office-smartart/interaction-model.ts";

/** What useSpreadsheetSmartArtDiagramCommands reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSmartArtDiagramCommandsInputs {
  applySmartArtDesign: (plan: (context: { kind: SmartArtKind; members: readonly SpreadsheetObject[]; outline: readonly SmartArtOutlineItem[]; }) => { kind?: SmartArtKind; outline?: readonly SmartArtOutlineItem[]; colors?: SmartArtStyle; styleId?: SmartArtStyleId; direction?: SmartArtDirection; authorPaint?: boolean; nodePaint?: readonly SmartArtNodePaint[]; colorsId?: string | null; resetItemId?: string; allowItemChanges?: boolean; selectedItemId?: string; } | null, options?: { select?: boolean; caret?: "select" | "start" | number }) => boolean;
  smartArtOutlineSelectedIdRef: RefObject<string | null>;
  smartArtPlaceholders: OfficeSmartArtPlaceholders;
  /** The workbook theme Change Colors resolves Office's variations against. */
  smartArtColorTheme: Partial<SmartArtColorTheme>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetSmartArtDiagramCommands({
  applySmartArtDesign,
  smartArtOutlineSelectedIdRef,
  smartArtPlaceholders,
  smartArtColorTheme,
}: SpreadsheetSmartArtDiagramCommandsInputs) {
  /**
   * Change Colors, the Styles gallery and Reset Graphic — the two INDEPENDENT
   * axes PowerPoint has: a colour change keeps the quick style the members
   * wear, a style change keeps their colours, and Reset passes both defaults.
   */
  const restyleSmartArtDiagram = useCallback(
    (
      colors: SmartArtStyle | null,
      styleId: SmartArtStyleId | null,
      nodePaint?: readonly SmartArtNodePaint[],
      /** The variation Change Colors picked (Office's id). */
      colorsId?: string,
    ) =>
      applySmartArtDesign(({ members }) => {
        const hostMembers = members as unknown as OfficeSmartArtHostNode[];
        const current = readSheetSmartArtColors(hostMembers);
        return {
          // A colour set says nothing about the type, so the labels keep the
          // size the worksheet draws them at.
          colors: colors
            ? { ...colors, fontSize: current.fontSize }
            : current,
          ...(colors && nodePaint ? { nodePaint } : {}),
          // …and the variation itself, which paints the Office-drawn layouts
          // (words included) from Office's own definition.
          ...(colors && colorsId ? { colorsId } : {}),
          styleId:
            styleId ??
            readSheetSmartArtStyleId(hostMembers) ??
            DEFAULT_SMARTART_STYLE_ID,
          // Say whose paint this is, so a UNIFORM recolour exports with its
          // colours on the FIRST export instead of only after a reopen
          // (SMARTART-IMPORT.md §5.17's own remainder). Derived from the
          // command's OWN arguments, not from the defaults filled in above:
          // this host reads the diagram's current colour when the caller
          // passes none, and that is not the author choosing one.
          authorPaint: smartArtRecolourIsAuthors(colors, styleId),
        };
      }),
    [applySmartArtDesign],
  );
  /**
   * Reset Graphic: the default quick style and Office's default colour
   * variation (accent 1, `accent1_2`) resolved against the workbook's theme,
   * as an inserted diagram is -- PowerPoint's Reset puts a Colorful diagram
   * back on it (SmartArt probe B10b), and Excel runs the same command. The
   * fixed default set was Office 2013's blue, never this workbook's accent.
   */
  const resetSmartArtDiagram = useCallback(
    () =>
      applySmartArtDesign(({ members }) => {
        const hostMembers = members as unknown as OfficeSmartArtHostNode[];
        const current = readSheetSmartArtColors(hostMembers);
        const reset = smartArtResetChange(hostMembers, smartArtColorTheme);
        return {
          colors: { ...reset.colors, fontSize: current.fontSize },
          ...(reset.nodePaint ? { nodePaint: reset.nodePaint } : {}),
          styleId: reset.styleId,
          colorsId: reset.colorsId,
          authorPaint: false,
          // Reset keeps a Right to Left and the background colour applied to
          // the whole graphic (Microsoft Support, "Restore the default layout
          // and color of your SmartArt graphic", Customizations not removed;
          // WUA 260), so no direction is named and only the graphic's own line
          // and effect come off.
          resetGraphicFormat: true,
        };
      }),
    [applySmartArtDesign, smartArtColorTheme],
  );
  /**
   * The outline item a structural command acts on, as the three editors share
   * it (`smartArtCommandItemId`): the pane's row (which the shape selected on
   * the sheet also sets), the row being typed; with neither, Add Shape adds
   * after the last item and the other commands have nothing to act on.
   */
  const commandItemId = (
    outline: readonly SmartArtOutlineItem[],
    pendingItemId: string | undefined,
    command: SmartArtItemCommand,
  ) =>
    smartArtCommandItemId({
      outline,
      command,
      paneItemId: smartArtOutlineSelectedIdRef.current,
      shapeItemId: pendingItemId,
    });
  /** The four structural commands: one outline transform, then one rebuild. */
  const addSmartArtOutlineItemCommand = useCallback(
    (pendingText?: { itemId: string; text: string }, newItemText?: string) =>
      applySmartArtDesign(({ kind, outline }) => {
        const target = commandItemId(outline, pendingText?.itemId, "add");
        if (!target) return null;
        const next = smartArtOutlineAfterAdd(
          outline,
          target,
          // A new shape is EMPTY, as Office's Add Shape leaves it: the sheet
          // draws the `[Text]` prompt, and no words reach the file.
          newItemText ?? "",
          kind,
          pendingText,
        );
        return next
          ? {
              outline: next.items,
              selectedItemId: next.selectedItemId,
              allowItemChanges: true,
            }
          : null;
      // Enter's split keeps the caret at the start of the words it moved.
      }, { caret: newItemText ? "start" : "select" }),
    [applySmartArtDesign, smartArtPlaceholders],
  );
  /**
   * Add Shape After / Before / Above / Below and Move Up / Down, anchored on
   * the item the ribbon names (the pane's, else the selected member's).
   */
  const insertSmartArtShapeCommand = useCallback(
    (
      position: SmartArtOutlineInsertPosition,
      itemId: string | null,
      pendingText?: { itemId: string; text: string },
    ) =>
      applySmartArtDesign(({ kind, outline }) => {
        const anchor =
          itemId && outline.some((item) => item.id === itemId)
            ? itemId
            : commandItemId(outline, undefined, "add");
        if (!anchor) return null;
        const next = smartArtOutlineAfterInsert(
          outline,
          anchor,
          position,
          "",
          kind,
          pendingText,
        );
        return next
          ? {
              outline: next.items,
              selectedItemId: next.selectedItemId,
              allowItemChanges: true,
            }
          : null;
      }),
    [applySmartArtDesign, smartArtPlaceholders],
  );
  const moveSmartArtOutlineItemCommand = useCallback(
    (
      direction: "up" | "down",
      itemId: string | null,
      pendingText?: { itemId: string; text: string },
    ) =>
      applySmartArtDesign(({ kind, outline }) => {
        const anchor =
          itemId && outline.some((item) => item.id === itemId)
            ? itemId
            : commandItemId(outline, undefined, direction === "up" ? "move-up" : "move-down");
        if (!anchor) return null;
        const next = smartArtOutlineAfterMove(
          outline,
          anchor,
          direction,
          kind,
          pendingText,
        );
        return next
          ? { outline: next.items, selectedItemId: next.selectedItemId }
          : null;
      }),
    [applySmartArtDesign],
  );
  const deleteSmartArtOutlineItemCommand = useCallback(
    (itemId: string) =>
      applySmartArtDesign(({ outline }) => {
        if (outline.length <= 1) return null;
        const next = smartArtOutlineAfterDelete(outline, itemId);
        return next
          ? {
              outline: next.items,
              selectedItemId: next.selectedItemId,
              allowItemChanges: true,
            }
          : null;
      }),
    [applySmartArtDesign],
  );
  /** The Text Pane's line merge: one transform, one rebuild, the caret at the join. */
  const mergeSmartArtOutlineItemsCommand = useCallback(
    (keepId: string, text: string, goneId: string, caret: number) =>
      applySmartArtDesign(({ outline }) => {
        const next = smartArtOutlineAfterMerge(outline, keepId, goneId, text);
        return next
          ? {
              outline: next.items,
              selectedItemId: next.selectedItemId,
              allowItemChanges: true,
            }
          : null;
      }, { caret }),
    [applySmartArtDesign],
  );
  /** A paste of several lines into a Text Pane row: one row per line, one rebuild. */
  const pasteSmartArtOutlineLinesCommand = useCallback(
    (itemId: string, text: string, lines: string[], caret: number) =>
      applySmartArtDesign(({ outline }) => {
        const next = smartArtOutlineAfterPaste(outline, itemId, text, lines);
        return next
          ? {
              outline: next.items,
              selectedItemId: next.selectedItemId,
              allowItemChanges: true,
            }
          : null;
      }, { caret }),
    [applySmartArtDesign],
  );
  /** Layout on an org chart box: how its subordinates hang (Office's hierBranch). */
  const setSmartArtHierBranchCommand = useCallback(
    (branch: SmartArtHierBranch) =>
      applySmartArtDesign(({ kind, outline }) => {
        const target = commandItemId(outline, undefined, "promote");
        if (!target) return null;
        const next = smartArtOutlineAfterHierBranch(outline, target, branch, kind);
        return next ? { outline: next.items, selectedItemId: next.selectedItemId } : null;
      }),
    [applySmartArtDesign],
  );
  const promoteSmartArtOutlineItemCommand = useCallback(
    (pendingText?: { itemId: string; text: string }) =>
      applySmartArtDesign(({ kind, outline }) => {
        const target = commandItemId(outline, pendingText?.itemId, "promote");
        if (!target) return null;
        const next = smartArtOutlineAfterPromote(
          outline,
          target,
          kind,
          pendingText,
        );
        return next
          ? { outline: next.items, selectedItemId: next.selectedItemId }
          : null;
      }),
    [applySmartArtDesign],
  );
  const demoteSmartArtOutlineItemCommand = useCallback(
    (pendingText?: { itemId: string; text: string }) =>
      applySmartArtDesign(({ kind, outline }) => {
        const target = commandItemId(outline, pendingText?.itemId, "demote");
        if (!target) return null;
        const next = smartArtOutlineAfterDemote(
          outline,
          target,
          kind,
          pendingText,
        );
        return next
          ? { outline: next.items, selectedItemId: next.selectedItemId }
          : null;
      }),
    [applySmartArtDesign],
  );
  return {
    addSmartArtOutlineItemCommand,
    deleteSmartArtOutlineItemCommand,
    demoteSmartArtOutlineItemCommand,
    insertSmartArtShapeCommand,
    mergeSmartArtOutlineItemsCommand,
    moveSmartArtOutlineItemCommand,
    pasteSmartArtOutlineLinesCommand,
    promoteSmartArtOutlineItemCommand,
    resetSmartArtDiagram,
    restyleSmartArtDiagram,
    setSmartArtHierBranchCommand,
  };
}
