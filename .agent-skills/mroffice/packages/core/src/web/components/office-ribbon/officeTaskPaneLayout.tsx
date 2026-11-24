"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

/**
 * Where a task pane sits and how big it is, as Office lets the person set it
 * (Microsoft Support, "Manage pane layout in Office apps"): a pane is docked
 * at the side of the window and its inner border drags its width; the
 * downward arrow on its title bar moves it off the edge as a free-floating
 * window, which drags back to the right edge to dock again; and "when you
 * close a pane, Office remembers its last size and position" for the next
 * time it opens. The title bar's menu is the Task Pane Options menu (Move,
 * Size, Close), which Ctrl+Space opens from inside the pane; after Size the
 * arrow keys resize the pane and Ctrl+arrow does it one pixel at a time.
 *
 * An editor opts in by providing `OfficeTaskPaneLayoutContext`; a pane under
 * no provider keeps its fixed column and its plain close button.
 */

export interface OfficeTaskPaneFloatRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface OfficeTaskPanePlacement {
  /** The docked width the person dragged it to, in CSS px. */
  readonly width?: number;
  /** Set while the pane floats: its box over the editor. */
  readonly float?: OfficeTaskPaneFloatRect | null;
  /** Moved out of the tab group (Office: "the next time you open the pane,
   * it will be displayed side-by-side"). */
  readonly separate?: boolean;
}

export type OfficeTaskPaneLayoutState = Readonly<
  Record<string, OfficeTaskPanePlacement>
>;



export const OFFICE_TASK_PANE_MIN_WIDTH = 270;
/** The widest (Excel: 1000 px)... */
export const OFFICE_TASK_PANE_MAX_WIDTH = 1000;
/** ...as long as the document keeps this much beside it (Excel keeps the
 * sheet 500 px wide: a pane in a 1200 px window stops at 699). */
export const OFFICE_TASK_PANE_DOCUMENT_MIN_WIDTH = 500;
export const OFFICE_TASK_PANE_MIN_HEIGHT = 200;
/** A floating pane let go this close to the right edge docks again. */
export const OFFICE_TASK_PANE_REDOCK_DISTANCE = 24;

/** The widest a pane can be in an editor `available` px wide. */
export function officeTaskPaneMaxWidth(available: number): number {
  return Math.max(
    OFFICE_TASK_PANE_MIN_WIDTH,
    Math.min(
      OFFICE_TASK_PANE_MAX_WIDTH,
      Math.round(available - OFFICE_TASK_PANE_DOCUMENT_MIN_WIDTH),
    ),
  );
}

export function clampOfficeTaskPaneWidth(width: number, available: number): number {
  if (Number.isNaN(width)) return OFFICE_TASK_PANE_MIN_WIDTH;
  return Math.round(
    Math.min(officeTaskPaneMaxWidth(available), Math.max(OFFICE_TASK_PANE_MIN_WIDTH, width)),
  );
}

/** A floating pane kept inside the editor's box (it can always be reached). */
export function clampOfficeTaskPaneFloat(
  rect: OfficeTaskPaneFloatRect,
  bounds: { readonly width: number; readonly height: number },
): OfficeTaskPaneFloatRect {
  const width = clampOfficeTaskPaneWidth(rect.width, bounds.width);
  const x = Math.round(Math.min(Math.max(0, rect.x), Math.max(0, bounds.width - width)));
  const y = Math.round(
    Math.min(Math.max(0, rect.y), Math.max(0, bounds.height - OFFICE_TASK_PANE_MIN_HEIGHT)),
  );
  // It never runs past the editor's bottom edge.
  const height = Math.round(
    Math.max(
      Math.min(OFFICE_TASK_PANE_MIN_HEIGHT, bounds.height),
      Math.min(rect.height, bounds.height - y),
    ),
  );
  return { x, y, width, height };
}

/**
 * One arrow key in the Size or Move mode: 10 px a press, 1 px with Ctrl
 * (Office: "Use CTRL+ the arrow keys to resize by one pixel at a time").
 * Size grows a docked pane leftwards (its free edge is the left one); a
 * floating pane's Left/Right change its width and Up/Down its height. Null
 * for a key the mode does not take.
 */
export function stepOfficeTaskPaneByKey(
  kind: "size" | "move",
  floating: boolean,
  key: string,
  fine: boolean,
): { readonly dx: number; readonly dy: number } | null {
  const step = fine ? 1 : 10;
  const horizontal = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const vertical = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
  if (!horizontal && !vertical) return null;
  if (kind === "size" && !floating) {
    // The docked pane's free edge is its left one: Left widens it.
    return horizontal ? { dx: -horizontal, dy: 0 } : null;
  }
  return { dx: horizontal, dy: vertical };
}

function readLayout(storageKey: string): OfficeTaskPaneLayoutState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, OfficeTaskPanePlacement> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Record<string, unknown>;
      const width = typeof entry.width === "number" && Number.isFinite(entry.width) ? entry.width : undefined;
      const float = entry.float && typeof entry.float === "object" ? (entry.float as Record<string, unknown>) : null;
      const rect =
        float &&
        ["x", "y", "width", "height"].every((key) => typeof float[key] === "number" && Number.isFinite(float[key]))
          ? { x: float.x as number, y: float.y as number, width: float.width as number, height: float.height as number }
          : null;
      out[id] = {
        ...(width !== undefined ? { width } : {}),
        ...(rect ? { float: rect } : {}),
        ...(entry.separate === true ? { separate: true } : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The editor's remembered pane placements, kept for this viewer in the
 * browser (a convenience: a cleared or blocked store is the default layout).
 */
export function useOfficeTaskPaneLayout(storageKey: string): {
  readonly layout: OfficeTaskPaneLayoutState;
  readonly setPlacement: (id: string, placement: OfficeTaskPanePlacement) => void;
} {
  const [layout, setLayout] = useState<OfficeTaskPaneLayoutState>(() =>
    typeof window === "undefined" ? {} : readLayout(storageKey),
  );
  const setPlacement = useCallback(
    (id: string, placement: OfficeTaskPanePlacement) => {
      setLayout((current) => {
        const next = { ...current, [id]: { ...current[id], ...placement } };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Storage refused (private window, quota): the layout lasts the session.
        }
        return next;
      });
    },
    [storageKey],
  );
  return { layout, setPlacement };
}

export interface OfficeTaskPaneLayoutControls {
  readonly labels: {
    readonly options: string;
    readonly move: string;
    readonly size: string;
    readonly close: string;
    readonly moveOutOfTab?: string;
    readonly moveToTab?: string;
  };
  /** Take the pane off the edge (it floats where it was) and let the arrow
   * keys move it; a floating pane just starts moving. */
  readonly move: (paneId: string) => void;
  /** The arrow keys resize the pane until Enter or Esc. */
  readonly size: (paneId: string) => void;
  /**
   * Where the pane sits among the dock's tabs: "grouped" (a tab of the group;
   * the menu offers Move Out of Tab), "separate" (moved out, beside the
   * group; the menu offers Move to Tab), or null (a pane with a column of its
   * own anyway, as the workbook's Comments).
   */
  readonly tabPlacement?: (paneId: string) => "grouped" | "separate" | null;
  






  readonly escapeKeepsPane?: boolean;
  readonly setTabPlacement?: (paneId: string, placement: "grouped" | "separate") => void;
}

export const OfficeTaskPaneLayoutContext =
  createContext<OfficeTaskPaneLayoutControls | null>(null);

export function useOfficeTaskPaneLayoutControls(): OfficeTaskPaneLayoutControls | null {
  return useContext(OfficeTaskPaneLayoutContext);
}

/** A task pane's own element: OfficeTaskPane's frame, a pane that draws its
 *  own header and marks itself the same way, or the comments pane. */
const OFFICE_TASK_PANE_ROOT = "[data-office-task-pane], aside";

/** The pane a dock column shows: the one in front, not a pane kept mounted
 *  (hidden) behind another tab. */
export function shownOfficeTaskPane(host: ParentNode | null | undefined): HTMLElement | null {
  if (!host) return null;
  const front = host.querySelector("[data-office-task-pane-slot]:not([hidden])") ?? host;
  return front.querySelector<HTMLElement>(
    "[data-office-task-pane]:not([hidden]), aside:not([hidden])",
  );
}

/** Whether a header is a pane's title bar (the row the pane drags by). */
export function isOfficeTaskPaneTitleBar(header: Element): boolean {
  return Boolean(header.parentElement?.matches(OFFICE_TASK_PANE_ROOT));
}

/**
 * The title bar's downward arrow: Office's Task Pane Options menu, which
 * Ctrl+Space also opens from anywhere inside the pane.
 * Renders nothing when the editor provides no layout controls.
 */
export function OfficeTaskPaneOptions({
  paneId,
  onClose,
  closeDisabled,
  className,
  testIdPrefix,
}: {
  readonly paneId: string;
  readonly onClose: () => void;
  readonly closeDisabled?: boolean;
  readonly className?: string;
  readonly testIdPrefix: string;
}): React.JSX.Element | null {
  const controls = useOfficeTaskPaneLayoutControls();
  const [open, setOpen] = useState(false);
  // Move and Size hand the keyboard to the pane or its border: the menu
  // must not take it back to its arrow as it closes.
  const handOffRef = useRef(false);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  useEffect(() => {
    const pane = trigger?.closest(OFFICE_TASK_PANE_ROOT);
    if (!pane) return;
    // On the document, after the pane's own controls have had the key.
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== " " ||
        !event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        !(event.target instanceof Node && pane.contains(event.target))
      ) {
        return;
      }
      event.preventDefault();
      setOpen(true);
    };
    const doc = pane.ownerDocument;
    doc.addEventListener("keydown", onKeyDown);
    return () => doc.removeEventListener("keydown", onKeyDown);
  }, [trigger]);
  if (!controls) return null;
  // Office's Move Out of Tab / Move to Tab, where the editor lays its panes
  // out in columns of their own.
  const tabPlacement = controls.tabPlacement?.(paneId) ?? null;
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          ref={setTrigger}
          type="button"
          className={className}
          aria-label={controls.labels.options}
          title={controls.labels.options}
          data-testid={`${testIdPrefix}-pane-options`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M4.5 6.5 8 10l3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="docs-cupertino-menu w-max min-w-[9rem]"
        onCloseAutoFocus={(event) => {
          if (!handOffRef.current) return;
          handOffRef.current = false;
          event.preventDefault();
        }}
      >
        <DropdownMenuItem
          data-testid={`${testIdPrefix}-pane-options-move`}
          onSelect={() => {
            handOffRef.current = true;
            controls.move(paneId);
          }}
        >
          {controls.labels.move}
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid={`${testIdPrefix}-pane-options-size`}
          onSelect={() => {
            handOffRef.current = true;
            controls.size(paneId);
          }}
        >
          {controls.labels.size}
        </DropdownMenuItem>
        {tabPlacement && controls.setTabPlacement ? (
          <DropdownMenuItem
            data-testid={`${testIdPrefix}-pane-options-${tabPlacement === "separate" ? "move-to-tab" : "move-out-of-tab"}`}
            onSelect={() => {
              // The pane remounts in its new column, which takes the keyboard.
              handOffRef.current = true;
              controls.setTabPlacement?.(
                paneId,
                tabPlacement === "separate" ? "grouped" : "separate",
              );
            }}
          >
            {tabPlacement === "separate"
              ? controls.labels.moveToTab
              : controls.labels.moveOutOfTab}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={closeDisabled}
          data-testid={`${testIdPrefix}-pane-options-close`}
          onSelect={onClose}
        >
          {controls.labels.close}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The docked pane's inner border: drag it (the pointer is a two-headed
 * arrow) or, focused, press Left/Right to widen or narrow the pane, Ctrl
 * for one pixel; Home/End go to the narrowest/widest, Enter or Esc hand the
 * keyboard back to the pane. `onWidth` hears every step; `commit` is true
 * when the gesture or key press ends, which is when the width is kept.
 *
 * `edge` is which side of the pane the border is: a task pane docked at the
 * right is sized at its left edge (the default); a pane docked at the left,
 * as the slide thumbnails are, at its right edge; a pane under the document,
 * as the Notes pane is, at its top edge, and then `width` is its height and
 * Up/Down size it.
 */
export const OfficeTaskPaneResizeHandle = forwardRef<
  HTMLDivElement,
  {
    readonly width: number;
    readonly minWidth: number;
    readonly maxWidth: number;
    readonly label: string;
    readonly onWidth: (width: number, commit: boolean) => void;
    readonly onDone?: () => void;
    readonly className?: string;
    readonly style?: React.CSSProperties;
    readonly testId?: string;
    readonly edge?: "left" | "right" | "top";
    /** False keeps the border out of the Tab order (still focusable). */
    readonly tabbable?: boolean;
  }
>(function OfficeTaskPaneResizeHandle(
  { width, minWidth, maxWidth, label, onWidth, onDone, className, style, testId, edge = "left", tabbable = true },
  ref,
) {
  const clamp = (value: number) => Math.round(Math.min(maxWidth, Math.max(minWidth, value)));
  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation={edge === "top" ? "horizontal" : "vertical"}
      aria-label={label}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={Math.round(width)}
      tabIndex={tabbable ? 0 : -1}
      className={className}
      style={style}
      data-testid={testId}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const target = event.currentTarget;
        const startX = event.clientX;
        const startY = event.clientY;
        const startWidth = width;
        let latest = startWidth;
        target.setPointerCapture(event.pointerId);
        const move = (moveEvent: PointerEvent) => {
          // A left edge widens the pane dragged left; a right edge dragged
          // right; a top edge makes it taller dragged up.
          const grow =
            edge === "top"
              ? startY - moveEvent.clientY
              : edge === "right"
                ? moveEvent.clientX - startX
                : startX - moveEvent.clientX;
          latest = clamp(startWidth + grow);
          onWidth(latest, false);
        };
        const end = () => {
          target.removeEventListener("pointermove", move);
          target.removeEventListener("pointerup", end);
          target.removeEventListener("pointercancel", end);
          onWidth(latest, true);
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", end);
        target.addEventListener("pointercancel", end);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onDone?.();
          return;
        }
        const next =
          event.key === "Home"
            ? minWidth
            : event.key === "End"
              ? maxWidth
              : (() => {
                  const fine = event.ctrlKey || event.metaKey;
                  if (edge === "left") {
                    const step = stepOfficeTaskPaneByKey("size", false, event.key, fine);
                    return step ? width + step.dx : null;
                  }
                  const grows = edge === "top" ? "ArrowUp" : "ArrowRight";
                  const shrinks = edge === "top" ? "ArrowDown" : "ArrowLeft";
                  const step = fine ? 1 : 10;
                  return event.key === grows ? width + step : event.key === shrinks ? width - step : null;
                })();
        if (next === null) return;
        event.preventDefault();
        event.stopPropagation();
        onWidth(clamp(next), true);
      }}
    />
  );
});
