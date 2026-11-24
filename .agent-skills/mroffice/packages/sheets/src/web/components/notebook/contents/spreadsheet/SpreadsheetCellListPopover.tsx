"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

import { usePopupPortalTarget } from "@mrnote/core/web/components/ui/portal-host.tsx";
import { pinFixedToViewport } from "@mrnote/core/web/lib/pin-fixed-to-viewport.ts";

const EDGE_GUTTER = 8;

/**
 * Where a cell's dropdown list goes: under the cell, its left edges lined up;
 * moved left (its right edge on the cell's, then clamped to the window) when
 * the window's right edge is too close, and above the cell when there is no
 * room below.
 */
export function placeCellListPopover(
  cell: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number },
  size: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
): { left: number; top: number } {
  let left = cell.left;
  if (left + size.width > viewport.width - EDGE_GUTTER) {
    left = cell.right - size.width;
  }
  left = Math.min(
    Math.max(EDGE_GUTTER, left),
    Math.max(EDGE_GUTTER, viewport.width - size.width - EDGE_GUTTER),
  );
  let top = cell.bottom;
  if (top + size.height > viewport.height - EDGE_GUTTER) {
    const above = cell.top - size.height;
    top = above >= EDGE_GUTTER
      ? above
      : Math.max(EDGE_GUTTER, viewport.height - size.height - EDGE_GUTTER);
  }
  return { left, top };
}

export interface SpreadsheetCellListPopoverProps {
  options: readonly string[];
  /** The cell's current entry; its option shows as the chosen one. */
  value: string;
  testId: string;
  optionTestId: (option: string) => string;
  onPick: (option: string) => void;
  onClose: () => void;
}

/**
 * The list a cell drops down: a data-validation list's allowed values, or
 * Pick From Drop-down List's values already in the column (Excel Alt+Down).
 *
 * It is drawn as its own layer over the grid, from the cell's rectangle, so a
 * cell at the grid's right edge shows its whole list instead of one clipped
 * by the scrolling grid (live audit B254). The keyboard walks it while the
 * cell keeps the focus, as Excel's list does (live audit B253): Down / Up,
 * Home / End and Page Down / Page Up move the highlight, Enter picks the
 * highlighted value, Escape and Alt+Up close the list without a change, and
 * none of those keys reach the grid under it. Rendered inside the cell: a
 * zero-size probe there is what the list is placed from.
 */
export const SpreadsheetCellListPopover = forwardRef<
  HTMLDivElement,
  SpreadsheetCellListPopoverProps
>(function SpreadsheetCellListPopover(
  { options, value, testId, optionTestId, onPick, onClose },
  forwardedRef,
): ReactElement {
  const probeRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const [active, setActive] = useState(-1);
  const setPanel = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );
  const target = usePopupPortalTarget();

  const place = useCallback(() => {
    const probe = probeRef.current;
    const panel = panelRef.current;
    const cell = probe?.parentElement;
    if (!probe || !panel || !cell) return;
    const cellRect = cell.getBoundingClientRect();
    // At least as wide as its cell, as the list under a cell is.
    panel.style.minWidth = `${cellRect.width}px`;
    const { width, height } = panel.getBoundingClientRect();
    const { left, top } = placeCellListPopover(
      cellRect,
      { width, height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    pinFixedToViewport(panel, left, top);
  }, []);
  useLayoutEffect(() => {
    place();
  }, [place, options]);
  // The grid scrolls under the list; the list stays on its cell.
  useEffect(() => {
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [place]);

  const latest = useRef({ options, value, active, onPick, onClose });
  useLayoutEffect(() => {
    latest.current = { options, value, active, onPick, onClose };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.metaKey || event.ctrlKey) return;
      const { options: list, value: held, active: current, onPick: pick, onClose: close } = latest.current;
      const last = list.length - 1;
      // The list opens on the cell's value, highlighted: the keys move on
      // from there, not from the top (Down on a cell holding 20 of 10/20/30
      // goes to 30, as Excel's list does).
      const from = current >= 0 ? current : list.indexOf(held);
      let next: number | null = null;
      switch (event.key) {
        case "ArrowDown":
          if (event.altKey) return;
          next = Math.min(last, from + 1);
          break;
        case "ArrowUp":
          if (event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
          }
          next = from < 0 ? last : Math.max(0, from - 1);
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = last;
          break;
        case "PageDown":
          next = Math.min(last, Math.max(0, from) + 8);
          break;
        case "PageUp":
          next = Math.max(0, from - 8);
          break;
        case "Enter":
          // Nothing highlighted: the list closes and Enter does what it does
          // in the cell.
          if (current < 0 || current > last) {
            close();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          pick(list[current]);
          return;
        case "Escape":
          event.preventDefault();
          event.stopPropagation();
          close();
          return;
        case "Tab":
          close();
          return;
        default:
          return;
      }
      if (last < 0) return;
      event.preventDefault();
      event.stopPropagation();
      setActive(next);
    };
    // Capture on the window runs before the cell's own key handler.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
  useEffect(() => {
    if (active < 0) return;
    panelRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  // Screen readers follow the highlight from the focused cell.
  useEffect(() => {
    const input = probeRef.current?.parentElement?.querySelector("input, textarea");
    if (!input) return;
    if (active >= 0) input.setAttribute("aria-activedescendant", `${listId}-${active}`);
    else input.removeAttribute("aria-activedescendant");
    return () => input.removeAttribute("aria-activedescendant");
  }, [active, listId]);

  return (
    <>
      <span ref={probeRef} aria-hidden="true" style={{ display: "none" }} />
      {target
        ? createPortal(
            <div
              ref={setPanel}
              id={listId}
              role="listbox"
              className="spreadsheet-window__validation-picker"
              data-testid={testId}
              onPointerDown={(event) => event.stopPropagation()}
              style={{
                position: "fixed",
                left: 0,
                top: 0,
                zIndex: 60,
                maxHeight: 200,
                overflowY: "auto",
                background: "#ffffff",
                border: "1px solid rgba(15, 23, 42, 0.14)",
                borderRadius: 6,
                boxShadow: "0 8px 24px rgba(15, 23, 42, 0.18)",
                padding: "2px 0",
                fontSize: 13,
                color: "#0f172a",
              }}
            >
              {options.map((option, index) => {
                const highlighted = active >= 0 ? index === active : value === option;
                return (
                  <button
                    key={option}
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={highlighted}
                    data-option-index={index}
                    className="spreadsheet-window__validation-option"
                    data-testid={optionTestId(option)}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onPick(option);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "4px 12px",
                      border: "none",
                      background: highlighted
                        ? "var(--console-surface-2, #f1f5f9)"
                        : "transparent",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {option || " "}
                  </button>
                );
              })}
            </div>,
            target,
          )
        : null}
    </>
  );
});
