"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

import type { OfficeTaskPaneDockRegistry } from "@mrnote/core/web/components/office-ribbon/officeTaskPaneDock.ts";
import { OFFICE_COMMENTS_PANE_LAYOUT_ID } from "@mrnote/core/web/components/office-comments/OfficeCommentsPane.tsx";
import {
  clampOfficeTaskPaneFloat,
  clampOfficeTaskPaneWidth,
  isOfficeTaskPaneTitleBar,
  OFFICE_TASK_PANE_MIN_WIDTH,
  OFFICE_TASK_PANE_REDOCK_DISTANCE,
  officeTaskPaneMaxWidth,
  OfficeTaskPaneResizeHandle,
  shownOfficeTaskPane,
  stepOfficeTaskPaneByKey,
  type OfficeTaskPaneFloatRect,
  type OfficeTaskPaneLayoutControls,
  type OfficeTaskPaneLayoutState,
  type OfficeTaskPanePlacement,
} from "@mrnote/core/web/components/office-ribbon/officeTaskPaneLayout.tsx";

/** The workbook's default column widths (the CSS clamps' middle). */
const DEFAULT_DOCK_WIDTH = 300;
const DEFAULT_COMMENTS_WIDTH = 300;
/** The Comments pane's place in the layout (it has a column of its own). */
export const SPREADSHEET_COMMENTS_PANE_ID = OFFICE_COMMENTS_PANE_LAYOUT_ID;

type KeyboardMode = { readonly paneId: string; readonly kind: "move" | "size" } | null;

/** One column of the workbook's panes: the dock's tab group, a pane moved
 * out of the tab (Office's Move Out of Tab), or Comments. */
interface PaneColumn {
  readonly paneId: string;
  readonly kind: "group" | "separate" | "comments";
  readonly host: HTMLElement | null;
  readonly defaultWidth: number;
}

/** The panes the person moved out of the dock's tab group, from the kept
 * layout (they open beside the group again next time, as in Office). */
export function separateTaskPanes(layout: OfficeTaskPaneLayoutState): ReadonlySet<string> {
  return new Set(
    Object.entries(layout)
      .filter(([, placement]) => placement?.separate)
      .map(([id]) => id),
  );
}

/**
 * The workbook's task panes laid out as Office lets the person lay them out
 * (officeTaskPaneLayout.tsx): each pane's docked width is dragged at its
 * inner border and kept, the Task Pane Options menu's Move floats the pane
 * over the sheet and Size resizes it from the keyboard, the title bar drags
 * a pane off the edge and back onto it (a double-click docks it too), and
 * every placement is remembered per pane for the next time it opens. The
 * dock's front pane and the Comments pane each have a column of their own.
 */
export function useSpreadsheetTaskPaneLayout({
  store,
  dock,
  dockOpen,
  commentsPaneOpen,
  commentsHostRef,
  surfaceRef,
  labels,
  returnFocusRef,
}: {
  /** The kept placements (useOfficeTaskPaneLayout), shared with the dock
   * registry, which reads from it the panes moved out of the tab. */
  readonly store: {
    readonly layout: OfficeTaskPaneLayoutState;
    readonly setPlacement: (id: string, placement: OfficeTaskPanePlacement) => void;
  };
  readonly dock: OfficeTaskPaneDockRegistry;
  readonly dockOpen: boolean;
  readonly commentsPaneOpen: boolean;
  readonly commentsHostRef: RefObject<HTMLElement | null>;
  readonly surfaceRef: RefObject<HTMLElement | null>;
  readonly labels: OfficeTaskPaneLayoutControls["labels"] & { readonly resize: string };
  /** Puts the keyboard back on the worksheet (its active cell). */
  readonly returnFocusRef?: RefObject<(() => void) | null>;
}) {
  const { layout, setPlacement } = store;
  // A width or a box being dragged: shown at once, kept when the gesture ends.
  const [liveWidth, setLiveWidth] = useState<{ readonly id: string; readonly width: number } | null>(null);
  const [liveFloat, setLiveFloat] = useState<{ readonly id: string; readonly rect: OfficeTaskPaneFloatRect } | null>(null);
  const [keyboardMode, setKeyboardMode] = useState<KeyboardMode>(null);
  const [surfaceSize, setSurfaceSize] = useState<{ width: number; height: number }>({ width: 1200, height: 800 });
  const handleRefs = useRef(new Map<string, HTMLDivElement>());

  // The surface mounts after the workbook's loading state, so the element
  // is looked for after every render and observed once it is there (a
  // mount-only effect would find no element and keep the default size).
  const observedRef = useRef<{ element: HTMLElement; observer: ResizeObserver } | null>(null);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (observedRef.current?.element === surface) return;
    observedRef.current?.observer.disconnect();
    observedRef.current = null;
    if (!surface || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = surface.clientWidth;
      const height = surface.clientHeight;
      setSurfaceSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    observedRef.current = { element: surface, observer };
  });
  useEffect(() => () => observedRef.current?.observer.disconnect(), []);

  // A pane closed with the keyboard in it (its X, Task Pane Options > Close,
  // a tab's X) gives the keyboard back to the worksheet, as Excel does; the
  // pane's node is gone, and the focus with it, so typing went nowhere.
  const openCount = dock.state.opened.length + (commentsPaneOpen ? 1 : 0);
  const openCountRef = useRef(openCount);
  useEffect(() => {
    const before = openCountRef.current;
    openCountRef.current = openCount;
    if (openCount >= before) return;
    const frame = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      returnFocusRef?.current?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openCount, returnFocusRef]);

  const front = dockOpen ? dock.front : null;
  const separate = dock.separate;
  // The open panes moved out of the tab, in the order they were opened.
  const separateOpen = useMemo(
    () => (dockOpen && separate ? dock.state.opened.filter((id) => separate.has(id)) : []),
    [dock.state.opened, dockOpen, separate],
  );
  const columns = useMemo(() => {
    const list: PaneColumn[] = [];
    if (commentsPaneOpen) {
      list.push({
        paneId: SPREADSHEET_COMMENTS_PANE_ID,
        kind: "comments",
        host: commentsHostRef.current,
        defaultWidth: DEFAULT_COMMENTS_WIDTH,
      });
    }
    for (const id of separateOpen) {
      list.push({
        paneId: id,
        kind: "separate",
        host: dock.separateHost?.(id) ?? null,
        defaultWidth: DEFAULT_DOCK_WIDTH,
      });
    }
    if (front) {
      list.push({ paneId: front, kind: "group", host: dock.host, defaultWidth: DEFAULT_DOCK_WIDTH });
    }
    return list;
    // The comments host is a ref that exists while the workbook is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentsPaneOpen, dock.host, dock.separateHost, front, separateOpen]);
  const columnOf = useCallback(
    (paneId: string) => columns.find((column) => column.paneId === paneId) ?? null,
    [columns],
  );

  const widthOf = useCallback(
    (id: string | null, fallback: number) => {
      if (!id) return fallback;
      if (liveWidth?.id === id) return liveWidth.width;
      return clampOfficeTaskPaneWidth(layout[id]?.width ?? fallback, surfaceSize.width);
    },
    [layout, liveWidth, surfaceSize.width],
  );
  const floatOf = useCallback(
    (id: string | null): OfficeTaskPaneFloatRect | null => {
      if (!id) return null;
      if (liveFloat?.id === id) return liveFloat.rect;
      const stored = layout[id]?.float;
      return stored ? clampOfficeTaskPaneFloat(stored, surfaceSize) : null;
    },
    [layout, liveFloat, surfaceSize],
  );
  const dockFloat = floatOf(front);
  const commentsFloat = commentsPaneOpen ? floatOf(SPREADSHEET_COMMENTS_PANE_ID) : null;

  /** A box in the surface's own px (the window may be zoomed). */
  const boxInSurface = useCallback(
    (element: Element | null): OfficeTaskPaneFloatRect | null => {
      const surface = surfaceRef.current;
      if (!surface || !element) return null;
      const outer = surface.getBoundingClientRect();
      const inner = element.getBoundingClientRect();
      const scale = surface.offsetWidth > 0 ? outer.width / surface.offsetWidth : 1;
      if (!(scale > 0)) return null;
      return {
        x: (inner.left - outer.left) / scale,
        y: (inner.top - outer.top) / scale,
        width: inner.width / scale,
        height: inner.height / scale,
      };
    },
    [surfaceRef],
  );

  const undock = useCallback(
    (column: PaneColumn): OfficeTaskPaneFloatRect | null => {
      const box = boxInSurface(column.host);
      if (!box) return null;
      // Office floats a pane where it was, a little in from the edge.
      const rect = clampOfficeTaskPaneFloat(
        { x: box.x - 24, y: box.y + 24, width: box.width, height: box.height },
        surfaceSize,
      );
      setPlacement(column.paneId, { float: rect });
      return rect;
    },
    [boxInSurface, setPlacement, surfaceSize],
  );

  const focusPane = useCallback(
    (column: PaneColumn | null) => {
      shownOfficeTaskPane(column?.host)?.focus({ preventScroll: true });
    },
    [],
  );

  // Move Out of Tab / Move to Tab remounts the pane in its new column: the
  // keyboard follows it there once the column shows it.
  const pendingFocusRef = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id) return;
    const pane = shownOfficeTaskPane(columnOf(id)?.host);
    if (!pane) return;
    pendingFocusRef.current = null;
    pane.focus({ preventScroll: true });
  });

  const controls = useMemo<OfficeTaskPaneLayoutControls>(
    () => ({
      labels,
      escapeKeepsPane: true,
      tabPlacement: (paneId) =>
        paneId === SPREADSHEET_COMMENTS_PANE_ID || !dock.state.opened.includes(paneId)
          ? null
          : separate?.has(paneId)
            ? "separate"
            : "grouped",
      setTabPlacement: (paneId, placement) => {
        setPlacement(paneId, { separate: placement === "separate" });
        if (placement === "grouped") {
          // Back among the tabs, in front of them (its tab takes the keyboard).
          dock.select(paneId);
        } else {
          pendingFocusRef.current = paneId;
        }
      },
      move: (paneId) => {
        const column = columnOf(paneId);
        if (!column) return;
        if (!floatOf(paneId)) undock(column);
        setKeyboardMode({ paneId, kind: "move" });
      },
      size: (paneId) => {
        if (!columnOf(paneId)) return;
        if (floatOf(paneId)) {
          setKeyboardMode({ paneId, kind: "size" });
          return;
        }
        // The docked pane's inner border takes the arrow keys.
        window.requestAnimationFrame(() =>
          handleRefs.current.get(paneId)?.focus({ preventScroll: true }),
        );
      },
    }),
    [columnOf, dock, floatOf, labels, separate, setPlacement, undock],
  );

  // Move / Size from the keyboard on a floating pane: the arrows act until
  // Enter or Esc, as Office's menu commands do.
  useEffect(() => {
    if (!keyboardMode) return;
    const { paneId, kind } = keyboardMode;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setKeyboardMode(null);
        focusPane(columnOf(paneId));
        return;
      }
      const rect = floatOf(paneId);
      if (!rect) return;
      const step = stepOfficeTaskPaneByKey(kind, true, event.key, event.ctrlKey || event.metaKey);
      if (!step) return;
      event.preventDefault();
      event.stopPropagation();
      const next =
        kind === "move"
          ? { ...rect, x: rect.x + step.dx, y: rect.y + step.dy }
          : { ...rect, width: rect.width + step.dx, height: rect.height + step.dy };
      setPlacement(paneId, { float: clampOfficeTaskPaneFloat(next, surfaceSize) });
    };
    const end = () => setKeyboardMode(null);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", end, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", end, true);
    };
  }, [columnOf, floatOf, focusPane, keyboardMode, setPlacement, surfaceSize]);
  useEffect(() => {
    if (keyboardMode && !columnOf(keyboardMode.paneId)) setKeyboardMode(null);
  }, [columnOf, keyboardMode]);

  // The title bar drags the pane: off the edge to float it, and a floating
  // pane let go at the right edge docks again (a double-click docks it too).
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const cleanups: Array<() => void> = [];
    for (const column of columns) {
      const host = column.host;
      if (!host) continue;
      const titleBarOf = (target: EventTarget | null) => {
        if (!(target instanceof Element)) return null;
        // The dock's tab strip is its title: a press there drags the pane
        // (a click without a drag still picks the tab).
        if (target.closest("button:not([role='tab']), input, select, textarea, a, [role='menuitem'], [contenteditable='true']")) {
          return null;
        }
        const header = target.closest("header");
        return header && host.contains(header) && isOfficeTaskPaneTitleBar(header)
          ? header
          : null;
      };
      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0 || !titleBarOf(event.target)) return;
        const startX = event.clientX;
        const startY = event.clientY;
        const outer = surface.getBoundingClientRect();
        const scale = surface.offsetWidth > 0 ? outer.width / surface.offsetWidth : 1;
        let origin = floatOf(column.paneId);
        let moved = false;
        let latest: OfficeTaskPaneFloatRect | null = origin;
        const move = (moveEvent: PointerEvent) => {
          const dx = (moveEvent.clientX - startX) / scale;
          const dy = (moveEvent.clientY - startY) / scale;
          if (!moved) {
            if (Math.hypot(dx, dy) < 6) return;
            moved = true;
            origin ??= undock(column);
          }
          if (!origin) return;
          moveEvent.preventDefault();
          latest = clampOfficeTaskPaneFloat({ ...origin, x: origin.x + dx, y: origin.y + dy }, surfaceSize);
          setLiveFloat({ id: column.paneId, rect: latest });
        };
        const end = (endEvent: PointerEvent) => {
          window.removeEventListener("pointermove", move, true);
          window.removeEventListener("pointerup", end, true);
          window.removeEventListener("pointercancel", end, true);
          setLiveFloat(null);
          if (!moved || !latest) return;
          const pointerX = (endEvent.clientX - outer.left) / scale;
          const atRightEdge =
            latest.x + latest.width >= surfaceSize.width - OFFICE_TASK_PANE_REDOCK_DISTANCE ||
            pointerX >= surfaceSize.width - OFFICE_TASK_PANE_REDOCK_DISTANCE;
          setPlacement(column.paneId, { float: atRightEdge ? null : latest });
        };
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", end, true);
        window.addEventListener("pointercancel", end, true);
      };
      const onDoubleClick = (event: MouseEvent) => {
        if (!titleBarOf(event.target) || !floatOf(column.paneId)) return;
        setPlacement(column.paneId, { float: null });
      };
      host.addEventListener("pointerdown", onPointerDown);
      host.addEventListener("dblclick", onDoubleClick);
      cleanups.push(() => {
        host.removeEventListener("pointerdown", onPointerDown);
        host.removeEventListener("dblclick", onDoubleClick);
      });
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [columns, floatOf, setPlacement, surfaceRef, surfaceSize, undock]);

  const dockWidth = widthOf(front, DEFAULT_DOCK_WIDTH);
  const commentsWidth = widthOf(SPREADSHEET_COMMENTS_PANE_ID, DEFAULT_COMMENTS_WIDTH);

  // With a pane moved out of the tab the workbook lays its pane columns out
  // itself: Comments, the panes moved out (in the order they opened), then
  // the tab group at the edge, each docked one a column of the grid at its
  // own width. Without one, the module CSS's fixed columns stay in charge.
  const paneColumns = separateOpen.length > 0;
  const dockedColumns = useMemo(
    () =>
      paneColumns
        ? columns
            .filter((column) => !floatOf(column.paneId))
            .map((column, index) => ({
              column,
              gridColumn: index + 2,
              width: widthOf(column.paneId, column.defaultWidth),
            }))
        : [],
    [columns, floatOf, paneColumns, widthOf],
  );
  const gridColumnOf = (paneId: string) =>
    dockedColumns.find((entry) => entry.column.paneId === paneId)?.gridColumn ?? null;

  const surfaceStyle = useMemo<CSSProperties>(() => {
    const style: Record<string, string> = {
      "--spreadsheet-chart-format-pane-width": `${dockWidth}px`,
      "--spreadsheet-review-comments-pane-width": `${commentsWidth}px`,
    };
    const place = (prefix: string, rect: OfficeTaskPaneFloatRect | null) => {
      if (!rect) return;
      style[`${prefix}-x`] = `${rect.x}px`;
      style[`${prefix}-y`] = `${rect.y}px`;
      style[`${prefix}-width`] = `${rect.width}px`;
      style[`${prefix}-height`] = `${rect.height}px`;
    };
    place("--spreadsheet-task-pane-float", dockFloat);
    place("--spreadsheet-comments-pane-float", commentsFloat);
    if (paneColumns) {
      style["--spreadsheet-pane-grid-template"] = [
        "minmax(0, 1fr)",
        ...dockedColumns.map((entry) => `${entry.width}px`),
      ].join(" ");
      for (const entry of dockedColumns) {
        if (entry.column.kind === "group") style["--spreadsheet-task-pane-grid-column"] = String(entry.gridColumn);
        if (entry.column.kind === "comments") style["--spreadsheet-comments-grid-column"] = String(entry.gridColumn);
      }
    }
    return style as CSSProperties;
  }, [commentsFloat, commentsWidth, dockFloat, dockWidth, dockedColumns, paneColumns]);

  /** What the surface carries for the module CSS while it lays the pane
   * columns out itself (`paneColumns`). */
  const surfaceAttributes = {
    "data-task-pane-group": paneColumns ? (front ? (dockFloat ? "floating" : "docked") : "empty") : undefined,
    "data-comments-column": paneColumns && commentsPaneOpen && !commentsFloat ? "docked" : undefined,
    // The column a keyboard Move / Size outlines.
    "data-task-pane-keyboard-pane": keyboardMode
      ? keyboardMode.paneId === SPREADSHEET_COMMENTS_PANE_ID
        ? "comments"
        : separate?.has(keyboardMode.paneId)
          ? "separate"
          : "group"
      : undefined,
  } as const;

  const maxWidth = officeTaskPaneMaxWidth(surfaceSize.width);
  const renderHandle = (
    paneId: string,
    width: number,
    column: number,
    className: string,
    testId: string,
  ) => (
    <OfficeTaskPaneResizeHandle
      key={paneId}
      ref={(element) => {
        if (element) handleRefs.current.set(paneId, element);
        else handleRefs.current.delete(paneId);
      }}
      width={width}
      minWidth={OFFICE_TASK_PANE_MIN_WIDTH}
      maxWidth={maxWidth}
      label={labels.resize}
      className={className}
      style={{ gridColumn: column, gridRow: "1 / 3" }}
      testId={testId}
      onWidth={(next, commit) => {
        if (commit) {
          setLiveWidth(null);
          setPlacement(paneId, { width: next });
        } else {
          setLiveWidth({ id: paneId, width: next });
        }
      }}
      onDone={() => focusPane(columnOf(paneId))}
    />
  );
  const handleTestId = (column: PaneColumn) =>
    column.kind === "comments"
      ? "spreadsheet-comments-pane-resize"
      : column.kind === "group"
        ? "spreadsheet-task-pane-resize"
        : `spreadsheet-task-pane-resize-${column.paneId}`;
  /** The inner borders of the docked columns, placed on the surface grid. */
  const renderResizeHandles = (input: {
    readonly className: string;
    readonly dockColumn: number | null;
    readonly commentsColumn: number | null;
  }): ReactNode =>
    paneColumns ? (
      <>
        {dockedColumns.map((entry) =>
          renderHandle(entry.column.paneId, entry.width, entry.gridColumn, input.className, handleTestId(entry.column)),
        )}
      </>
    ) : (
      <>
        {input.dockColumn !== null && front && !dockFloat
          ? renderHandle(front, dockWidth, input.dockColumn, input.className, "spreadsheet-task-pane-resize")
          : null}
        {input.commentsColumn !== null && commentsPaneOpen && !commentsFloat
          ? renderHandle(
              SPREADSHEET_COMMENTS_PANE_ID,
              commentsWidth,
              input.commentsColumn,
              input.className,
              "spreadsheet-comments-pane-resize",
            )
          : null}
      </>
    );

  // A ref callback per column, kept, so a render does not hand the dock a
  // null and then the same element again.
  const separateRefs = useRef(new Map<string, (element: HTMLDivElement | null) => void>());
  const separateRefOf = (id: string) => {
    let ref = separateRefs.current.get(id);
    if (!ref) {
      ref = (element) => dock.setSeparateHost?.(id, element);
      separateRefs.current.set(id, ref);
    }
    return ref;
  };
  /** The columns of the panes moved out of the tab: each pane renders into
   * its own (OfficeTaskPaneDockSlot), docked beside the group or floating. */
  const renderSeparateColumns = (input: {
    readonly className: string;
    readonly floatingClassName: string;
  }): ReactNode =>
    separateOpen.map((id) => {
      const rect = floatOf(id);
      const gridColumn = gridColumnOf(id);
      return (
        <div
          key={id}
          ref={separateRefOf(id)}
          className={rect ? `${input.className} ${input.floatingClassName}` : input.className}
          data-testid={`spreadsheet-task-pane-column-${id}`}
          // A card of its own for the pane motion (officeTaskPaneMotion.ts).
          data-office-task-pane-dock="card"
          data-office-task-pane-edge="right"
          // Docked, it floats over the sheet's edge (officeTaskPaneOverlay.ts).
          data-office-task-pane-overlay={rect ? "floating" : "right"}
          data-keyboard-mode={keyboardMode?.paneId === id ? keyboardMode.kind : undefined}
          style={
            rect
              ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
              : { gridColumn: gridColumn ?? undefined, gridRow: "1 / 3" }
          }
        />
      );
    });

  /** The columns of the panes moved out of the tab, as mounted. */
  const separateHosts = (): HTMLElement[] =>
    separateOpen
      .map((id) => dock.separateHost?.(id) ?? null)
      .filter((host): host is HTMLElement => Boolean(host));

  return {
    controls,
    dockFloating: Boolean(dockFloat),
    commentsFloating: Boolean(commentsFloat),
    keyboardMode,
    paneColumns,
    surfaceStyle,
    surfaceAttributes,
    renderResizeHandles,
    renderSeparateColumns,
    separateHosts,
  };
}
