"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useState, useLayoutEffect, useEffect, type RefObject } from "react";
import { type EngineValue } from "@mrnote/core/web/lib/spreadsheet/formula-engine.ts";
import { placePopupInViewport } from "../../../../lib/spreadsheet/popup-placement";
import { type RuleAnswers } from "./spreadsheetHiddenRows";
import { type Dispatch, type SetStateAction } from "react";

/** What useSpreadsheetFilterAnswerAndPopupPlacement reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetFilterAnswerAndPopupPlacementInputs {
  cellContextFlyoutRef: RefObject<HTMLDivElement | null>;
  cellContextMenu: { x: number; y: number; kind: "cell" | "row" | "col"; row: number; col: number; } | null;
  cellContextMenuRef: RefObject<HTMLDivElement | null>;
  contextSubmenu: { id: string; trigger: HTMLElement; focusFirst: boolean; } | null;
  listPicker: { row: number; col: number; } | null;
  listPickerRef: RefObject<HTMLDivElement | null>;
  pickFromList: { row: number; col: number; } | null;
  pickFromListRef: RefObject<HTMLDivElement | null>;
  setCellContextMenu: Dispatch<SetStateAction<{ x: number; y: number; kind: "cell" | "row" | "col"; row: number; col: number; } | null>>;
  setCellContextMenuPlacement: Dispatch<SetStateAction<{ left: number; top: number; } | null>>;
  setListPicker: Dispatch<SetStateAction<{ row: number; col: number; } | null>>;
  setPickFromList: Dispatch<SetStateAction<{ row: number; col: number; } | null>>;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetFilterAnswerAndPopupPlacement({
  cellContextFlyoutRef,
  cellContextMenu,
  cellContextMenuRef,
  contextSubmenu,
  listPicker,
  listPickerRef,
  pickFromList,
  pickFromListRef,
  setCellContextMenu,
  setCellContextMenuPlacement,
  setListPicker,
  setPickFromList,
}: SpreadsheetFilterAnswerAndPopupPlacementInputs) {
  // The session answer value filters read (see filterValueSource).
  const [filterAnswer, setFilterAnswer] = useState<{ key: string; pageId: string; loadEpoch: number; results: ReadonlyMap<string, EngineValue>;
    ruleValues: RuleAnswers | null } | null>(null);
  useLayoutEffect(() => {
    if (!cellContextMenu) {
      setCellContextMenuPlacement(null);
      return;
    }
    const menu = cellContextMenuRef.current;
    if (!menu || typeof window === "undefined") return;
    const { width, height } = menu.getBoundingClientRect();
    // Shared with the in-grid options buttons (Paste / Auto Fill / AutoCorrect)
    // so every grid popup flips and clamps the same way.
    const { left, top } = placePopupInViewport({
      x: cellContextMenu.x,
      y: cellContextMenu.y,
      width,
      height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    setCellContextMenuPlacement((previous) =>
      previous && previous.left === left && previous.top === top
        ? previous
        : { left, top },
    );
  }, [cellContextMenu]);
  // Close the right-click context menu on an outside press or Escape. Uses a
  // capture-phase pointerdown (mirrors the PresentationWindow menu) so a fresh
  // right-click elsewhere closes this one BEFORE the new one opens.
  useEffect(() => {
    if (!cellContextMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      const menu = cellContextMenuRef.current;
      const target = event.target;
      // The open flyout is its own layer on <body>, outside the menu's box.
      const inside =
        target instanceof Node &&
        (menu?.contains(target) ||
          cellContextFlyoutRef.current?.contains(target));
      if (menu && !inside) {
        setCellContextMenu(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCellContextMenu(null);
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cellContextMenu]);
  // An open context menu takes the keyboard, as Excel's does: the arrow keys
  // walk its items rather than the grid, and Escape closes it (see the menu's
  // own key handler, which then hands focus back to the active cell).
  useEffect(() => {
    if (!cellContextMenu) return;
    cellContextMenuRef.current?.focus({ preventScroll: true });
  }, [cellContextMenu]);
  // A flyout opened from the keyboard (Right arrow, Enter) focuses its first
  // item; one opened by the pointer leaves focus where it is.
  useEffect(() => {
    if (!contextSubmenu?.focusFirst) return;
    cellContextFlyoutRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
      ?.focus({ preventScroll: true });
  }, [contextSubmenu]);
  // Close the in-cell validation dropdown picker on an outside press or Escape.
  useEffect(() => {
    if (!listPicker) return;
    const onPointerDown = (event: PointerEvent) => {
      const menu = listPickerRef.current;
      const target = event.target;
      if (menu && (!(target instanceof Node) || !menu.contains(target))) {
        setListPicker(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setListPicker(null);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [listPicker]);
  // Close the "Pick From Drop-down List" popover on an outside press or Escape.
  useEffect(() => {
    if (!pickFromList) return;
    const onPointerDown = (event: PointerEvent) => {
      const menu = pickFromListRef.current;
      const target = event.target;
      if (menu && (!(target instanceof Node) || !menu.contains(target))) {
        setPickFromList(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickFromList(null);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pickFromList]);
  return {
    filterAnswer,
    setFilterAnswer,
  };
}
