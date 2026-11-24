"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Rnd } from "react-rnd";
import {
  ChevronDown,
  PanelBottom,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { RUN_OUTPUT_PANEL_MAX_PERCENT } from "../../../../lib/code-runner/run-output-workbench";
import { TOUCH_WINDOW_RESIZE_HANDLE_STYLES, useTouchMode } from "@mrnote/core/web/lib/touch-mode.ts";
import { useBottomPanelsInset } from "./useBottomPanelsInset";
import styles from "../CodeWindow.module.css";
import { CodeRibbonIcon } from "./CodeRibbonIcons";

/** Presentation only. The producer and all result/history authority stay in
 * CodeWindow; moving the panel never starts a run or creates another document. */
/** The docked card's gap to the editor column's edges (CodeWindow.module.css). */
const OVERLAY_INSET = 12;

/** The floating output keeps this far above its window's bottom edge, so the
 *  status bar (zoom, cursor) stays in sight. */
const FLOAT_STATUS_CLEARANCE = 40;

export function CodeOutputPanel({
  title,
  percent,
  onHide,
  dockLabel,
  children,
}: {
  title: string;
  percent: number;
  onHide: () => void;
  dockLabel: string;
  children: (value: {
    floating: boolean;
    toggleFloating: () => void;
  }) => ReactNode;
}) {
  const dock = useRef<HTMLDivElement>(null),
    floatingHost = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [floating, setFloating] = useState(false);
  // Touch mode gives the floating panel the window manager's touch-sized
  // edges (24px) and corners (44px), as every window has (touch audit
  
  const touchEdges = useTouchMode();
  const [rect, setRect] = useState({ x: 24, y: 80, width: 640, height: 360 });
  useLayoutEffect(() => {
    const node = document.createElement("div");
    node.className = styles.outputStableHost;
    setHost(node);
    return () => node.remove();
  }, []);
  useLayoutEffect(() => {
    if (!host) return;
    const target = floating ? floatingHost.current : dock.current;
    if (!target) return;
    const focused =
      document.activeElement instanceof HTMLElement &&
      host.contains(document.activeElement)
        ? document.activeElement
        : null;
    // State-preserving DOM moves also retain iframe contexts on supporting
    // browsers; the fallback still keeps the React result subtree and data.
    if (host.parentElement !== target) {
      const mover = target as HTMLDivElement & {
        moveBefore?: (node: Node, before: Node | null) => void;
      };
      if (mover.moveBefore && host.isConnected) mover.moveBefore(host, null);
      else target.appendChild(host);
    }
    focused?.focus({ preventScroll: true });
  }, [host, floating]);
  useBottomPanelsInset(dock);
  // The docked card floats over the editor; tell the column how much of its
  // bottom the card covers, so the code can scroll its last lines above it.
  useLayoutEffect(() => {
    const node = dock.current;
    const column = node?.parentElement;
    if (!node || !column) return;
    const publish = () =>
      column.style.setProperty(
        "--code-output-overlay-space",
        `${Math.ceil(node.getBoundingClientRect().height) + OVERLAY_INSET}px`,
      );
    publish();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      column.style.removeProperty("--code-output-overlay-space");
    };
  }, [floating]);
  useEffect(() => {
    if (!floating) return;
    const node = floatingHost.current;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !event.isComposing &&
        event.keyCode !== 229
      ) {
        event.preventDefault();
        event.stopPropagation();
        onHide();
      }
    };
    node?.addEventListener("keydown", escape);
    const keepVisible = () =>
      setRect((previous) => {
        const width = Math.min(
          previous.width,
          Math.max(440, window.innerWidth - 32),
        );
        const height = Math.min(
          previous.height,
          Math.max(180, window.innerHeight - 32),
        );
        return {
          ...previous,
          width,
          height,
          x: Math.max(16, Math.min(previous.x, window.innerWidth - width - 16)),
          y: Math.max(
            16,
            Math.min(previous.y, window.innerHeight - height - 16),
          ),
        };
      });
    window.addEventListener("resize", keepVisible);
    return () => {
      window.removeEventListener("resize", keepVisible);
      node?.removeEventListener("keydown", escape);
    };
  }, [floating, onHide]);
  const toggleFloating = () => {
    if (!floating) {
      // Float into the code window's lower right, clear of its status bar
      // (the bottom strip), and inside the screen.
      const frame =
        dock.current?.closest<HTMLElement>('[data-testid="code-window"]')?.getBoundingClientRect() ??
        dock.current?.getBoundingClientRect();
      const viewWidth = window.innerWidth;
      const viewHeight = window.innerHeight;
      const width = Math.max(
        440,
        Math.min(720, viewWidth - 48, frame ? frame.width * 0.62 : 720),
      );
      const height = Math.max(
        220,
        Math.min(420, viewHeight - 64, frame ? frame.height * 0.55 : 420),
      );
      const right = frame ? frame.right - 16 : viewWidth - 24;
      const bottom = frame ? frame.bottom - FLOAT_STATUS_CLEARANCE : viewHeight - 24;
      setRect({
        width,
        height,
        x: Math.max(16, Math.min(right - width, viewWidth - width - 16)),
        y: Math.max(16, Math.min(bottom - height, viewHeight - height - 16)),
      });
    }
    setFloating((value) => !value);
  };
  return (
    <>
      <div
        ref={dock}
        className={styles.outputDock}
        data-testid="code-output-dock"
        data-floating={floating ? "true" : undefined}
        style={
          floating
            ? undefined
            : {
                height: `${percent}%`,
                maxHeight: `${RUN_OUTPUT_PANEL_MAX_PERCENT}%`,
                minHeight: 96,
              }
        }
      >
        {floating ? (
          <button
            type="button"
            className={styles.outputDockReturn}
            onClick={toggleFloating}
            title={title}
          >
            <PanelBottom size={14} aria-hidden />
            {dockLabel}
          </button>
        ) : null}
      </div>
      {host ? createPortal(children({ floating, toggleFloating }), host) : null}
      {host
        ? createPortal(
            <div
              className={`${styles.codeWindow} ${styles.outputFloatLayer}`}
              data-theme="console"
              style={{ visibility: floating ? "visible" : "hidden" }}
            >
              <Rnd
                size={{ width: rect.width, height: rect.height }}
                position={{ x: rect.x, y: rect.y }}
                minWidth={440}
                minHeight={180}
                bounds="window"
                style={{ pointerEvents: "auto" }}
                dragHandleClassName="code-output-drag-handle"
                cancel="button,input,select,textarea,summary,a"
                enableUserSelectHack={false}
                disableDragging={!floating}
                enableResizing={floating}
                resizeHandleStyles={
                  touchEdges ? TOUCH_WINDOW_RESIZE_HANDLE_STYLES : undefined
                }
                onDragStop={(_event, data) =>
                  setRect((value) => ({ ...value, x: data.x, y: data.y }))
                }
                onResizeStop={(_event, _direction, element, _delta, position) =>
                  setRect({
                    x: position.x,
                    y: position.y,
                    width: element.offsetWidth,
                    height: element.offsetHeight,
                  })
                }
              >
                <div
                  ref={floatingHost}
                  data-code-output-floating="true"
                  role={floating ? "dialog" : undefined}
                  aria-modal={floating ? "false" : undefined}
                  aria-label={title}
                  className={styles.outputFloat}
                />
              </Rnd>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Native disclosure preserves the existing action controls, unlike remounting
 * the execution/history tree just to hide its secondary chrome. */
export function CodeOutputDisclosure({
  label,
  testId,
  children,
  iconOnly = false,
}: {
  label: string;
  testId: string;
  children: ReactNode;
  iconOnly?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({
    down: false,
    maxHeight: 260,
    edge: 0,
  });
  const closeDisclosure = () => {
    bodyRef.current?.hidePopover?.();
    if (ref.current) ref.current.open = false;
  };
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const node = ref.current;
      if (
        node?.open &&
        event.target instanceof Node &&
        !node.contains(event.target)
      ) {
        bodyRef.current?.hidePopover?.();
        node.open = false;
      }
    };
    // Retire an anchored popup when its surrounding surface moves. Scrolling
    // the popup itself must remain possible without dismissing it.
    const retire = (event: Event) => {
      if (
        event.target instanceof Node &&
        bodyRef.current?.contains(event.target)
      )
        return;
      bodyRef.current?.hidePopover?.();
      if (ref.current) ref.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", retire);
    document.addEventListener("scroll", retire, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", retire);
      document.removeEventListener("scroll", retire, true);
    };
  }, []);
  return (
    <details
      ref={ref}
      data-testid={testId}
      className={styles.outputDisclosure}
      onClick={(event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest("button")
            : null;
        const id = target?.getAttribute("data-testid") ?? "";
        if (
          id.startsWith("code-run-timeline-select-") ||
          [
            "code-output-search-toggle",
            "code-output-download",
            "code-output-download-run",
            "code-output-clear",
            "code-output-size-toggle",
          ].includes(id)
        ) {
          closeDisclosure();
          if (id.startsWith("code-run-timeline-select-"))
            event.currentTarget
              .closest('[data-testid="code-output-region"]')
              ?.querySelector<HTMLElement>('[data-testid="code-output"]')
              ?.focus();
          else if (
            id !== "code-output-search-toggle" &&
            id !== "code-output-clear"
          )
            event.currentTarget.querySelector("summary")?.focus();
        }
      }}
      onToggle={(event) => {
        const node = event.currentTarget;
        if (!node.open) {
          bodyRef.current?.hidePopover?.();
          return;
        }
        const r = node.getBoundingClientRect();
        const above = r.top - 8,
          below = window.innerHeight - r.bottom - 8;
        const down = below > above;
        setPlacement({
          down,
          edge: down ? r.bottom + 6 : window.innerHeight - r.top + 6,
          maxHeight: Math.max(48, Math.min(320, Math.max(above, below))),
        });
        // The native top layer escapes window clipping and every Ribbon/tab
        // stacking context while retaining DOM ancestry, styles and handlers.
        const body = bodyRef.current;
        body?.showPopover?.();
        // Placed by its own width, measured before the first paint: a menu
        // from an icon (More) ends under it, a list from a labelled trigger
        // (the run history) starts under it, and either stays 8px inside the
        // viewport. Placing every body as if it were 220px wide pushed the
        // wider run history off the left edge of the screen.
        if (body) {
          const width = body.getBoundingClientRect().width;
          const preferred = iconOnly ? r.right - width : r.left;
          body.style.left = `${Math.round(
            Math.max(8, Math.min(preferred, window.innerWidth - width - 8)),
          )}px`;
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeDisclosure();
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        title={label}
        aria-label={label}
        className={styles.outputDisclosureTrigger}
        data-icon-only={iconOnly ? "true" : undefined}
      >
        {iconOnly ? (
          <CodeRibbonIcon name="outputMore" size={16} />
        ) : (
          <>
            {label}
            <ChevronDown size={12} aria-hidden />
          </>
        )}
      </summary>
      <div
        ref={bodyRef}
        popover="manual"
        className={styles.outputDisclosureBody}
        style={{
          position: "fixed",
          margin: 0,
          right: "auto",
          width: iconOnly ? 220 : "max-content",
          background: "var(--console-bg, #fff)",
          maxHeight: placement.maxHeight,
          ...(placement.down
            ? { top: placement.edge, bottom: "auto" }
            : { bottom: placement.edge, top: "auto" }),
        }}
      >
        {children}
      </div>
    </details>
  );
}
