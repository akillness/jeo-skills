"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The ribbon title-row quick cluster — ONE implementation of the
 * fold-behind-"⋯" behaviour that the document, spreadsheet and presentation
 * ribbons each used to carry as a private copy (the drift between those
 * copies is exactly how the three editors ended up with three different
 * top-bar formats).
 *
 * Contract shared by every editor:
 * - `children` is the always-visible head — undo/redo (plus any pinned
 *   editor-specific toggle) stays inline at any width.
 * - `tail` is the collapsible run, in the product-wide order:
 *   save status · save · import · editor tools · print · export (last).
 * - `overflowOnlyTail` is never rendered inline. It mounts only inside the
 *   existing flyout while that flyout is open, for editor commands that must
 *   remain available without becoming permanent title-row chrome.
 * - `alwaysOverflow` parks the tail behind an "⋯" trigger whose flyout
 *   dismisses on outside pointerdown and Escape. The cluster is the same at
 *   every window width: a row too narrow for it scrolls sideways.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import { PortalHostProvider } from "../ui/portal-host";
import { attachRibbonSidewaysWheel } from "./ribbonSidewaysWheel";

import styles from "./OfficeRibbonQuickStrip.module.css";

const FLYOUT_ACTION_SELECTOR =
  "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

interface OfficeQuickPersistentContextValue {
  host: HTMLSpanElement | null;
  register: () => () => void;
}

const OfficeQuickPersistentContext =
  createContext<OfficeQuickPersistentContextValue | null>(null);

function usePersistentQuickAction(node: ReactNode, persistent: boolean) {
  const context = useContext(OfficeQuickPersistentContext);
  useEffect(() => {
    if (!persistent || !context) return;
    return context.register();
  }, [context, persistent]);
  return persistent && context?.host ? createPortal(
    <PortalHostProvider host={undefined}>{node}</PortalHostProvider>, context.host,
  ) : node;
}

export interface OfficeRibbonQuickStripTestIds {
  strip?: string;
  overflow?: string;
  overflowPanel?: string;
}

export function OfficeRibbonQuickStrip({
  children,
  tail,
  overflowOnlyTail,
  overflowOpen,
  onOverflowOpenChange,
  overflowLabel,
  ariaLabel,
  testIds,
  alwaysOverflow = false,
  className,
}: {
  /** Always-visible head of the cluster (undo/redo first). */
  children?: ReactNode;
  /** Collapsible tail: save status · save · import · tools · print · export. */
  tail?: ReactNode;
  /** Commands that exist only inside the one real overflow flyout. */
  overflowOnlyTail?: ReactNode;
  /** Optional controlled state for an editor command that launches content
   * hosted by this one shared overflow surface. */
  overflowOpen?: boolean;
  onOverflowOpenChange?: (open: boolean) => void;
  overflowLabel: string;
  ariaLabel?: string;
  testIds?: OfficeRibbonQuickStripTestIds;
  /** Fixed action rails park utility commands behind More at every width. */
  alwaysOverflow?: boolean;
  className?: string;
}) {
  const flyoutId = useId();
  const stripRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const flyoutPanelRef = useRef<HTMLDivElement | null>(null);
  const [flyoutPortalHost, setFlyoutPortalHost] = useState<HTMLDivElement | null>(null);
  const bindFlyoutPanel = useCallback((node: HTMLDivElement | null) => {
    flyoutPanelRef.current = node;
    setFlyoutPortalHost(node);
  }, []);
  const focusFlyoutOnOpenRef = useRef(false);
  const [uncontrolledFlyoutOpen, setUncontrolledFlyoutOpen] = useState(false);
  const flyoutOpen = overflowOpen ?? uncontrolledFlyoutOpen;
  const setFlyoutOpen = useCallback(
    (next: boolean | ((open: boolean) => boolean)) => {
      const resolved = typeof next === "function" ? next(flyoutOpen) : next;
      if (overflowOpen === undefined) setUncontrolledFlyoutOpen(resolved);
      onOverflowOpenChange?.(resolved);
    },
    [flyoutOpen, onOverflowOpenChange, overflowOpen],
  );
  const nativePopover = typeof HTMLElement !== "undefined" &&
    typeof HTMLElement.prototype.showPopover === "function";
  const closeFlyoutRef = useRef(() => setFlyoutOpen(false));
  useLayoutEffect(() => {
    closeFlyoutRef.current = () => setFlyoutOpen(false);
  }, [setFlyoutOpen]);
  const [inlineTailHost, setInlineTailHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [parkedTailHost, setParkedTailHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [flyoutTailHost, setFlyoutTailHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [persistentHost, setPersistentHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [tailPortalHost, setTailPortalHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [persistentCount, setPersistentCount] = useState(0);
  const hasTail = Boolean(tail);
  const hasOverflowOnlyTail = Boolean(overflowOnlyTail);
  const activeTailMount = alwaysOverflow
    ? flyoutOpen && flyoutTailHost
      ? flyoutTailHost
      : parkedTailHost
    : (inlineTailHost ?? parkedTailHost);

  const registerPersistent = useCallback(() => {
    setPersistentCount((count) => count + 1);
    return () => setPersistentCount((count) => Math.max(0, count - 1));
  }, []);

  const flyoutActions = useCallback(
    () =>
      Array.from(
        flyoutPanelRef.current?.querySelectorAll<HTMLElement>(
          FLYOUT_ACTION_SELECTOR,
        ) ?? [],
      ),
    [],
  );

  const moveFlyoutFocus = useCallback(
    (
      current: HTMLElement,
      key:
        | "ArrowDown"
        | "ArrowLeft"
        | "ArrowRight"
        | "ArrowUp"
        | "End"
        | "Home",
    ) => {
      const actions = flyoutActions();
      if (!actions.length) return false;
      const currentIndex = Math.max(0, actions.indexOf(current));
      const forward = key === "ArrowDown" || key === "ArrowRight";
      const nextIndex =
        key === "Home"
          ? 0
          : key === "End"
            ? actions.length - 1
            : (currentIndex + (forward ? 1 : -1) + actions.length) %
              actions.length;
      actions[nextIndex]?.focus({ preventScroll: true });
      return true;
    },
    [flyoutActions],
  );
  const persistentContextValue = useMemo(
    () => ({ host: persistentHost, register: registerPersistent }),
    [persistentHost, registerPersistent],
  );

  // The tail is one stable React/DOM tree. Move its detached host between the
  // inline rail, hidden parking slot and open flyout instead of switching a
  // portal's container (which remounts descendants and used to make the Save
  // button lose focus precisely when its status change collapsed the strip).
  useEffect(() => {
    const host = document.createElement("span");
    host.className = styles.tailPortal;
    host.style.alignItems = "center";
    host.style.display = "inline-flex";
    host.style.gap = "6px";
    setTailPortalHost(host);
    return () => {
      host.remove();
    };
  }, []);

  useLayoutEffect(() => {
    if (!tailPortalHost || !activeTailMount) return;
    activeTailMount.appendChild(tailPortalHost);
  }, [activeTailMount, tailPortalHost]);

  // Like Code's output menus and Copilot's draft layer, native Popover escapes
  // clipped/transformed windows while retaining source DOM ancestry, theme,
  // event ownership and the one persistent tail tree.
  useLayoutEffect(() => {
    if (!flyoutOpen || !nativePopover) return;
    const panel = flyoutPanelRef.current, anchor = moreButtonRef.current;
    if (!panel || !anchor) return;
    const sourceWindow = anchor.closest<HTMLElement>(".wm-window");
    panel.dataset.sourceWindow = sourceWindow?.dataset.windowId ?? "standalone";
    let disposed = false, frame = 0;
    const setStyle = (key: "width" | "maxHeight" | "left" | "top" | "visibility", value: string) => {
      if (panel.style[key] !== value) panel.style[key] = value;
    };
    const place = () => {
      if (disposed) return;
      const bounds = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      if (!anchor.isConnected || !panel.isConnected ||
        anchor.closest(".wm-window") !== sourceWindow ||
        (typeof anchor.checkVisibility === "function" && !anchor.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) ||
        bounds.width <= 0 || bounds.height <= 0 ||
        bounds.right <= x || bounds.left >= x + width || bounds.bottom <= y || bounds.top >= y + height) {
        if (panel.isConnected && panel.matches(":popover-open")) panel.hidePopover();
        closeFlyoutRef.current();
        return;
      }
      const source = sourceWindow?.getBoundingClientRect();
      const leftEdge = Math.max(x + 8, source ? source.left + 8 : x + 8);
      const rightEdge = Math.min(x + width - 8, source ? source.right - 8 : x + width - 8);
      setStyle("width", `${Math.max(1, Math.min(440, rightEdge - leftEdge))}px`);
      const below = Math.max(1, y + height - bounds.bottom - 14);
      const above = Math.max(1, bounds.top - y - 14);
      const down = panel.scrollHeight + 2 <= below || below >= above;
      setStyle("maxHeight", `${Math.max(1, Math.min(height - 16, down ? below : above))}px`);
      const rect = panel.getBoundingClientRect();
      setStyle("left", `${Math.max(leftEdge, Math.min(bounds.right - rect.width, rightEdge - rect.width))}px`);
      setStyle("top", `${Math.max(y + 8, Math.min(down ? bounds.bottom + 6 : bounds.top - rect.height - 6, y + height - rect.height - 8))}px`);
      setStyle("visibility", "visible");
      // Window dragging/panning changes transforms without resize or scroll
      // events. Track only while this small non-modal surface is open.
      frame = requestAnimationFrame(place);
    };
    panel.showPopover();
    place();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (panel.isConnected && panel.matches(":popover-open")) panel.hidePopover();
    };
  }, [flyoutOpen, nativePopover]);

  // A row too narrow for the strip scrolls it sideways (a swipe, a trackpad);
  // a plain mouse wheel over it moves it along as it does the tab list.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    return attachRibbonSidewaysWheel(strip);
  }, []);

  useEffect(() => {
    if (!flyoutOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const host = moreRef.current;
      if (host && event.target instanceof Node && host.contains(event.target)) {
        return;
      }
      // Utilities can own a portalled native menu/listbox. Hiding their
      // trigger on that menu's pointerdown makes its exit jump to (0, 0).
      // Keep the parent surface until an ordinary outside click dismisses it.
      if (
        alwaysOverflow &&
        event.target instanceof Element &&
        event.target.closest('[role="menu"], [role="listbox"]')
      ) {
        return;
      }
      setFlyoutOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        focusFlyoutOnOpenRef.current = false;
        setFlyoutOpen(false);
        moreButtonRef.current?.focus({ preventScroll: true });
        return;
      }
      if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight" &&
        event.key !== "ArrowUp" &&
        event.key !== "End" &&
        event.key !== "Home"
      ) {
        return;
      }
      const panel = flyoutPanelRef.current;
      if (
        !(event.target instanceof HTMLElement) ||
        !panel?.contains(event.target)
      ) {
        return;
      }
      if (moveFlyoutFocus(event.target, event.key)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    // A command in the flyout that opens a dialog, or an operation notice
    // that takes focus, moves focus out of the flyout. The flyout is a
    // top-layer popover, so left open it stayed painted over that dialog or
    
    // its command has run; a nested menu/listbox or popper of its own does
    // not count as leaving.
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const host = moreRef.current;
      const panel = flyoutPanelRef.current;
      if (host?.contains(target) || panel?.contains(target)) return;
      if (
        target.closest(
          '[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]',
        ) &&
        !target.closest('[role="dialog"][aria-modal="true"]')
      ) {
        return;
      }
      setFlyoutOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [alwaysOverflow, flyoutOpen, moveFlyoutFocus]);

  const focusFirstFlyoutAction = useCallback(() => {
    const firstAction = flyoutActions()[0];
    if (!firstAction) return false;
    firstAction.focus({ preventScroll: true });
    return true;
  }, [flyoutActions]);

  useEffect(() => {
    if (!flyoutOpen || !focusFlyoutOnOpenRef.current) return;
    // A keyboard-opened flyout can commit once before its stable tail host ref
    // is available. Keep the intent until the layout effect above has moved
    // that one DOM tree into the panel and a real command accepts focus.
    if (focusFirstFlyoutAction()) focusFlyoutOnOpenRef.current = false;
  }, [flyoutOpen, flyoutTailHost, focusFirstFlyoutAction, tailPortalHost]);

  return (
    <div
      className={classes("note-editor-ribbon-quick", styles.quickStrip, className)}
      ref={stripRef}
      role={ariaLabel ? "toolbar" : undefined}
      aria-label={ariaLabel}
      data-collapsed={alwaysOverflow || undefined}
      data-testid={testIds?.strip}
    >
      {children}
      <span
        ref={setPersistentHost}
        style={{
          alignItems: "center",
          display: persistentCount > 0 ? "inline-flex" : "none",
          flex: "0 0 auto",
          gap: 6,
        }}
      />
      <span
        ref={setInlineTailHost}
        style={{
          alignItems: "center",
          display: alwaysOverflow ? "none" : "inline-flex",
          flex: "0 0 auto",
          gap: 6,
        }}
      />
      {/* Keep one tail tree alive while collapsed. Persistent actions portal
          out of this parking host; the remaining commands move into the same
          flyout when it opens, so no Save/testid is ever duplicated. */}
      <span
        ref={setParkedTailHost}
        aria-hidden="true"
        style={{ display: "none" }}
      />
      {(alwaysOverflow && hasTail) || hasOverflowOnlyTail ? (
        <div
          className={classes("note-editor-ribbon-quick__more", styles.more)}
          ref={moreRef}
        >
          <button
            type="button"
            className={`office-ribbon-control ${(classes(
              "note-editor-office-toolbar__menu-trigger",
              styles.moreButton,
            ))}`} data-office-control-part="button"
            aria-label={overflowLabel}
            title={overflowLabel}
            aria-controls={`${flyoutId}-quick-overflow-panel`}
            aria-expanded={flyoutOpen}
            aria-haspopup="true"
            data-state={flyoutOpen ? "open" : undefined}
            data-testid={testIds?.overflow}
            ref={moreButtonRef}
            onClick={(event) => {
              setFlyoutOpen((value) => {
                const next = !value;
                focusFlyoutOnOpenRef.current = next && event.detail === 0;
                return next;
              });
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown") return;
              event.preventDefault();
              if (flyoutOpen) {
                focusFirstFlyoutAction();
                return;
              }
              focusFlyoutOnOpenRef.current = true;
              setFlyoutOpen(true);
            }}
          >
            <OfficeSemanticIcon semanticId="overflow.more" size={16} />
          </button>
          {flyoutOpen ? (
            <div
              id={`${flyoutId}-quick-overflow-panel`}
              className={classes(
                "note-editor-ribbon-quick__flyout",
                styles.flyout,
              )}
              role="group"
              aria-label={overflowLabel}
              data-testid={testIds?.overflowPanel}
              ref={bindFlyoutPanel}
              popover={nativePopover ? "manual" : undefined}
            >
              <span
                ref={setFlyoutTailHost}
                className={styles.flyoutHost}
                style={{ alignItems: "center", display: "inline-flex", gap: 6 }}
              />
              <PortalHostProvider host={nativePopover ? flyoutPortalHost : undefined}>
                {overflowOnlyTail}
              </PortalHostProvider>
            </div>
          ) : null}
        </div>
      ) : null}
      {tail && tailPortalHost
        ? createPortal(
            <PortalHostProvider host={nativePopover && alwaysOverflow
              ? flyoutOpen ? flyoutPortalHost : null : undefined}>
              <OfficeQuickPersistentContext.Provider
                value={persistentContextValue}
              >
                {tail}
              </OfficeQuickPersistentContext.Provider>
            </PortalHostProvider>,
            tailPortalHost,
          )
        : null}
    </div>
  );
}

/**
 * The one save-state pill every editor's quick cluster wears: plain text on
 * `.note-editor-save-status`, colour driven solely by `data-status`
 * (note-editor.css) — no per-editor icons or dots, so 已保存 reads the same
 * in the document, spreadsheet and presentation top bars.
 */
export function OfficeSaveStatus({
  status,
  label,
  testId,
  persistent = false,
}: {
  status: string;
  label: string;
  testId?: string;
  /** Keep this one status node inline while the remaining quick tail folds. */
  persistent?: boolean;
}) {
  return usePersistentQuickAction(
    <span
      className="note-editor-save-status"
      data-status={status}
      title={label}
      aria-label={label}
      data-testid={testId}
      role="status"
    >
      {label}
    </span>,
    persistent,
  );
}

/**
 * Shared save command used by every ribbon adapter that exposes an explicit
 * save action. Save authority and status stay with the editor; this component
 * only owns the stable title-row face and its honest disabled/unsaved states.
 */
export function OfficeSaveButton({
  label,
  title,
  status,
  onClick,
  disabled = false,
  className,
  testId,
  ariaLabel,
  disabledReason,
  persistent = false,
}: {
  label: string;
  title?: string;
  status: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  disabledReason?: string;
  /** Keep this one command inline while the remaining quick tail folds. */
  persistent?: boolean;
}) {
  const saving = status === "saving";
  return usePersistentQuickAction(
    <button
      type="button"
      className={classes(
        "note-editor-save-button",
        styles.saveButton,
        className,
      )}
      data-unsaved={status === "unsaved" || undefined}
      data-testid={testId}
      data-disabled-reason={disabled || saving ? disabledReason : undefined}
      disabled={disabled || saving}
      onClick={onClick}
      title={title ?? label}
      aria-label={ariaLabel ?? label}
    >
      {label}
    </button>,
    persistent,
  );
}
