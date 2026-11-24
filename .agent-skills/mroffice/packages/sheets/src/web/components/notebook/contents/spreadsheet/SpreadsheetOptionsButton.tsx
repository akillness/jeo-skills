"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import { createPortal } from "react-dom";

import { usePopupPortalTarget } from "@mrnote/core/web/components/ui/portal-host.tsx";
import {
  placePopupInViewport,
  popupMaxSize,
} from "../../../../lib/spreadsheet/popup-placement";

export interface SpreadsheetOptionsButtonItem {
  id: string;
  label: string;
  onSelect: () => void;
  /** Set for a choice that is one of a group (Paste Options, Auto Fill Options). */
  checked?: boolean;
  /** A heading the item sits under ("Paste", "Paste Values"...); consecutive
   * items with the same heading form one group. */
  group?: string;
  /** Excel's access key: typed while the menu is open, it picks the item. */
  accessKey?: string;
  testId?: string;
}

export interface SpreadsheetOptionsButtonProps {
  /** Accessible name and tooltip: "AutoCorrect Options", "Paste Options"... */
  label: string;
  icon: ReactNode;
  items: readonly SpreadsheetOptionsButtonItem[];
  /** The anchored cell's bottom-right corner, in the grid's content box. */
  left: number;
  top: number;
  /** Esc on the closed button; the host also dismisses it on the next edit. */
  onDismiss: () => void;
  /** Each new value opens the menu from the keyboard (Paste Options opens on
   * Ctrl alone) with its first item focused. */
  openRequest?: number;
  /** Where focus goes back after the menu was used from the keyboard: the
   * grid's active cell. Without it Esc focuses the button. */
  returnFocus?: () => void;
  testId?: string;
}

const stop = (event: SyntheticEvent) => event.stopPropagation();

/**
 * Excel's in-grid options button (the smart tag that AutoCorrect Options,
 * Paste Options and Auto Fill Options share): a small button at the
 * bottom-right corner of the cell an action just changed, opening a short menu
 * of follow-up choices. It never takes focus from the grid on a pointer click,
 * so the active cell keeps typing; Esc closes the menu, then the button.
 */
export function SpreadsheetOptionsButton({
  label,
  icon,
  items,
  left,
  top,
  onDismiss,
  openRequest,
  returnFocus,
  testId = "spreadsheet-options-button",
}: SpreadsheetOptionsButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // A new open request opens the menu during render (no effect round trip);
  // the effect below only moves focus into it.
  const [seenRequest, setSeenRequest] = useState(openRequest);
  if (openRequest !== seenRequest) {
    setSeenRequest(openRequest);
    if (openRequest !== undefined) setOpen(true);
  }
  useEffect(() => {
    if (openRequest === undefined) return;
    const frame = requestAnimationFrame(() =>
      menuRef.current
        ?.querySelector<HTMLButtonElement>("[data-options-item]")
        ?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [openRequest]);

  // Where the menu actually sits. It drops from the button's bottom-left, but
  // a button near the bottom or the right edge of the window would push the
  // menu off screen with most of its items out of reach, so — as Excel does —
  // it opens upwards / to the left and then slides back inside the window.
  // A menu taller than the window itself scrolls, as a last resort. The menu
  // is a popup over the page, not part of the grid: drawn inside the grid's
  // scroller it was cut at the grid's bottom edge, its last items hidden under
  // the sheet tabs and the status bar (S-072).
  const portalTarget = usePopupPortalTarget();
  const [placement, setPlacement] = useState<{
    left: number;
    top: number;
    maxHeight: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu || typeof window === "undefined") return;
    const menuRect = menu.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    // An environment without layout (jsdom) measures zero: the menu stands
    // at the button's bottom-left rather than pinned to the margin.
    if (!menuRect.width || !menuRect.height) {
      setPlacement({ left: triggerRect.left, top: triggerRect.bottom + 2, maxHeight: popupMaxSize(window.innerHeight) });
      return;
    }
    const maxHeight = popupMaxSize(window.innerHeight);
    const placed = placePopupInViewport({
      x: triggerRect.left,
      y: triggerRect.bottom + 2,
      width: menuRect.width,
      height: Math.min(menuRect.height, maxHeight),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      // Flipped, the menu's right edge meets the button's right edge and its
      // bottom edge sits just above the button.
      flipEndX: triggerRect.right,
      flipEndY: triggerRect.top - 2,
    });
    const next = { left: placed.left, top: placed.top, maxHeight };
    setPlacement((previous) =>
      previous &&
      previous.left === next.left &&
      previous.top === next.top &&
      previous.maxHeight === next.maxHeight
        ? previous
        : next,
    );
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (rootRef.current?.contains(target) || menuRef.current?.contains(target));
    const close = (event: PointerEvent) => {
      if (!inside(event.target)) setOpen(false);
    };
    // The menu stands over the page where it opened; the grid scrolling the
    // button away closes it rather than leaving it beside other cells.
    const scrolled = (event: Event) => {
      if (!inside(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("scroll", scrolled, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("scroll", scrolled, true);
    };
  }, [open]);

  const focusItem = (index: number) => {
    const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      "[data-options-item]",
    );
    if (!buttons?.length) return;
    buttons[(index + buttons.length) % buttons.length]?.focus();
  };

  const choose = (item: SpreadsheetOptionsButtonItem, fromKeyboard: boolean) => {
    setOpen(false);
    if (fromKeyboard) returnFocus?.();
    item.onSelect();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      if (open) {
        setOpen(false);
        if (returnFocus) returnFocus();
        else triggerRef.current?.focus();
      } else {
        onDismiss();
      }
      return;
    }
    if (open && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      const letter = event.key.toUpperCase();
      const item = items.find(
        (candidate) => candidate.accessKey?.toUpperCase() === letter,
      );
      if (item) {
        event.preventDefault();
        choose(item, true);
      }
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!open) {
      setOpen(true);
      requestAnimationFrame(() => focusItem(0));
      return;
    }
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-options-item]",
      ) ?? [],
    );
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    focusItem(current + (event.key === "ArrowDown" ? 1 : -1));
  };

  const portal = (menu: ReactNode) =>
    portalTarget ? createPortal(menu, portalTarget) : menu;

  return (
    <div
      ref={rootRef}
      data-testid={testId}
      style={{
        position: "absolute",
        left: left - 8,
        top: top + 1,
        zIndex: 12,
        pointerEvents: "auto",
      }}
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
      onDoubleClick={stop}
      onKeyDown={onKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={`${testId}-trigger`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
        style={{
          width: 22,
          height: 18,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--foreground, #1f2937)",
          background: "var(--surface, #ffffff)",
          border: "1px solid var(--border, #c4c9d1)",
          borderRadius: 3,
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.18)",
          cursor: "pointer",
        }}
      >
        {icon}
      </button>
      {open ? portal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          data-testid={`${testId}-menu`}
          onPointerDown={stop}
          onPointerUp={stop}
          onClick={stop}
          onDoubleClick={stop}
          style={{
            position: "fixed",
            zIndex: 1000,
            top: placement?.top ?? 0,
            left: placement?.left ?? 0,
            maxHeight: placement?.maxHeight,
            overflowY: placement ? "auto" : undefined,
            minWidth: 260,
            padding: 4,
            display: "grid",
            gap: 1,
            color: "var(--foreground, #1f2937)",
            background: "var(--surface, #ffffff)",
            border: "1px solid var(--border, #d1d5db)",
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.2)",
            fontSize: 12,
            lineHeight: 1.3,
          }}
        >
          {items.map((item, index) => (
            <Fragment key={item.id}>
            {item.group && item.group !== items[index - 1]?.group ? (
              <div
                role="presentation"
                style={{
                  padding: index === 0 ? "3px 10px 2px" : "7px 10px 2px",
                  fontWeight: 600,
                  color: "var(--muted-foreground, #6b7280)",
                }}
              >
                {item.group}
              </div>
            ) : null}
            <button
              type="button"
              role={item.checked === undefined ? "menuitem" : "menuitemradio"}
              aria-checked={item.checked}
              aria-keyshortcuts={item.accessKey}
              data-options-item
              data-testid={item.testId}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => choose(item, event.detail === 0)}
              style={{
                padding: "5px 10px",
                textAlign: "start",
                whiteSpace: "nowrap",
                color: "inherit",
                background: "transparent",
                border: 0,
                borderRadius: 4,
                cursor: "pointer",
                fontWeight: item.checked ? 600 : undefined,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background =
                  "var(--muted, rgba(15, 23, 42, 0.06))";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "transparent";
              }}
            >
              {item.label}
              {item.accessKey ? (
                <span
                  aria-hidden
                  style={{
                    marginInlineStart: 8,
                    color: "var(--muted-foreground, #6b7280)",
                  }}
                >
                  ({item.accessKey})
                </span>
              ) : null}
            </button>
            </Fragment>
          ))}
        </div>,
      ) : null}
    </div>
  );
}
