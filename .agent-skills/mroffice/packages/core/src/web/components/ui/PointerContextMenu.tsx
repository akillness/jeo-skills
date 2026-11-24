"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { MenuFlyout } from "./MenuFlyout";
import {
  OFFICE_CONTEXT_MENU_PART as PART,
  officeContextMenuClassName,
} from "../../lib/office-context-menu";
import { isDocumentRtl } from "../../lib/document-direction";
import { viewportPointInFixedParent } from "../../lib/pin-fixed-to-viewport";
import { takePluginContextMenu } from "../../lib/plugins/context-menu";
import { latestPointerIsTouchLike } from "../../lib/pointer-capability";

import styles from "./PointerContextMenu.module.css";
import {
  Check,
  ChevronRight,
} from "../office-ribbon/icons/houseIcons";

export interface PointerContextMenuAction {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  /** Shown as the item's tooltip and appended to its accessible name. */
  readonly disabledReason?: string;
  /**
   * Runs the item. An item that only opens a {@link submenu} may pass a no-op;
   * it is never called for such an item.
   */
  readonly onSelect: () => void;
  readonly testId?: string;
  /** The command's glyph, drawn in the menu's icon column (Office on the
   * web: every row has one; rows without one keep the column blank). */
  readonly icon?: ReactNode;
  /** The command's keyboard shortcut, printed at the right edge the way
   * Office on the web prints it ("⌘+X"); see lib/office-context-menu. */
  readonly shortcut?: string;
  /** Present on a toggle: the item becomes a menuitemcheckbox with a check
   * mark column (Excel's Customize Status Bar rows). */
  readonly checked?: boolean;
  /** Secondary text at the right edge, such as a toggle's current value. */
  readonly detail?: string;
  /** Leave the menu open after the item runs, so several toggles can be
   * flipped in one visit. */
  readonly keepOpen?: boolean;
  /**
   * A cascading menu (Office's "Add Shape ▸", "Bring to Front ▸"). The item
   * opens it on click, hover or ArrowRight instead of running; ArrowLeft and
   * Escape close it and return focus to the item. One level deep.
   */
  readonly submenu?: readonly PointerContextMenuEntry[];
  /** A destructive command (Delete Slide, Delete): drawn in Office red. */
  readonly danger?: boolean;
  /** The command is still working (announced as aria-busy). */
  readonly busy?: boolean;
}

export interface PointerContextMenuSeparator {
  readonly id: string;
  readonly separator: true;
}

/**
 * A row of icon-only commands laid side by side (WPS's clipboard row: 复制 ·
 * 剪切 · 粘贴 · 粘贴为无格式文本 · 删除). Each is a menu item named by its label
 * (its tooltip and accessible name); ArrowLeft/ArrowRight walk the row.
 */
export interface PointerContextMenuIconRow {
  readonly id: string;
  readonly iconRow: readonly PointerContextMenuAction[];
}

export type PointerContextMenuEntry =
  | PointerContextMenuAction
  | PointerContextMenuSeparator
  | PointerContextMenuIconRow;

export interface PointerContextMenuProps {
  /** Viewport coordinates of the press that opened the menu. */
  readonly x: number;
  readonly y: number;
  /** Accessible name for the menu itself. */
  readonly label: string;
  /** Optional title row shown above the items (not focusable). */
  readonly heading?: string;
  readonly entries: readonly PointerContextMenuEntry[];
  readonly onClose: () => void;
  readonly testId?: string;
  readonly container?: HTMLElement | null;
  /**
   * The window the menu belongs to, marked on its panels the way a ribbon
   * popover marks itself (`data-window-transient-popup-owner`), so an editor
   * that ends its edit on a press outside it knows the menu is its own.
   */
  readonly ownerWindowId?: string;
  /**
   * Called when Escape closes the menu (after `onClose`), so the surface can
   * take the keyboard back (the code editor refocuses its text).
   */
  readonly onEscape?: () => void;
}

function isIconRow(
  entry: PointerContextMenuEntry,
): entry is PointerContextMenuIconRow {
  return "iconRow" in entry;
}

function isAction(
  entry: PointerContextMenuEntry,
): entry is PointerContextMenuAction {
  return !("separator" in entry) && !isIconRow(entry);
}

const EDGE_GUTTER = 8;
const ITEM_SELECTOR =
  '[role="menuitem"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])';
const PANEL_ATTRIBUTE = "data-pointer-menu-panel";

/** The card's sizes are the one right-click menu specification
 * (office-context-menu, styles/office-context-menu.css); its glass, motion
 * and themes come from the Cupertino menu class every ribbon menu wears.
 * Only the placement is set inline. */
const PANEL_CLASS = `docs-cupertino-menu ${officeContextMenuClassName()} ${styles.menu}`;
const SUBMENU_CLASS = `docs-cupertino-menu docs-cupertino-menu--submenu ${officeContextMenuClassName({ submenu: true })} ${styles.menu}`;

export interface PointerMenuPlacement {
  /** The card's top-left corner, in viewport (client) coordinates. */
  readonly left: number;
  readonly top: number;
  /** The corner it grows from: "top left" unless it was flipped. */
  readonly origin: string;
}

/**
 * Where a menu opened at a viewport point goes, as Office places its own:
 * its top-left corner on the point; flipped to the point's left when the
 * window's right edge is too close, above the point when the bottom edge is;
 * and, when neither side fits (a menu taller than the space either way),
 * slid back inside the window's gutter. Under an rtl interface (`rtl`) it
 * grows leftwards instead, its top-right corner on the point, as Windows
 * opens a menu in a right-to-left language, and flips to the right.
 */
export function placePointerMenu(
  point: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  gutter = EDGE_GUTTER,
  rtl = false,
): PointerMenuPlacement {
  const along = (at: number, length: number, room: number) => {
    if (at + length <= room - gutter) return { start: at, flipped: false };
    if (at - length >= gutter) return { start: at - length, flipped: true };
    return {
      start: Math.max(gutter, Math.min(at, room - length - gutter)),
      flipped: false,
    };
  };
  const backwards = (at: number, length: number, room: number) => {
    if (at - length >= gutter) return { start: at - length, flipped: false };
    if (at + length <= room - gutter) return { start: at, flipped: true };
    return {
      start: Math.max(gutter, Math.min(at - length, room - length - gutter)),
      flipped: false,
    };
  };
  const x = rtl
    ? backwards(point.x, size.width, viewport.width)
    : along(point.x, size.width, viewport.width);
  const y = along(point.y, size.height, viewport.height);
  // The corner it grows from: the point's side of the card.
  const pointOnRight = rtl ? !x.flipped : x.flipped;
  return {
    left: x.start,
    top: y.start,
    origin: `${y.flipped ? "bottom" : "top"} ${pointOnRight ? "right" : "left"}`,
  };
}

/**
 * Places a mounted card at the point. The card is `position: fixed`, but a
 * workspace window (a transform hint), a backdrop filter or a Touch-mode
 * region (a CSS zoom, whose left/top WebKit multiplies) above it can be its
 * containing block; the corner is converted into that block's own pixels
 * (lib/pin-fixed-to-viewport) so it lands on the press however the page is
 * zoomed or transformed. The size is the card's drawn (screen) size.
 */
function placeOnScreen(
  panel: HTMLElement,
  x: number,
  y: number,
): { left: number; top: number; origin: string } {
  // The card's own size, not its box on screen this instant: it opens with
  // a scale-in, so the box measured as it mounts is ~4% short, and a menu
  // placed to just fit at that height ran 20px off the bottom of the window
  
  // scale (a zoomed or transformed window) still applies.
  const parent = panel.parentElement;
  const parentRect = parent?.getBoundingClientRect();
  const scale =
    parent && parentRect && parent.offsetWidth > 0 && parentRect.width > 0
      ? parentRect.width / parent.offsetWidth
      : 1;
  const rect = panel.getBoundingClientRect();
  const width = panel.offsetWidth > 0 ? panel.offsetWidth * scale : rect.width;
  const height = panel.offsetHeight > 0 ? panel.offsetHeight * scale : rect.height;
  const placed = placePointerMenu(
    { x, y },
    { width, height },
    { width: window.innerWidth, height: window.innerHeight },
    EDGE_GUTTER,
    isDocumentRtl(),
  );
  const local = parent
    ? viewportPointInFixedParent(parent, placed.left, placed.top)
    : placed;
  return { left: local.left, top: local.top, origin: placed.origin };
}

/**
 * Pointer-anchored menu for an editor surface's own right-click.
 *
 * Every MRAI editor that answers a right click had grown its own copy of this
 * (the presentation canvas, the spreadsheet grid, the code editor), each one
 * re-deriving the same four behaviours: anchor in viewport coordinates so a
 * zoom transform cannot skew it, clamp inside the window, close on Escape /
 * click-away / scroll, and drive the items from the keyboard. This is that
 * shared piece, owning only the menu interaction — the caller keeps every
 * command, its enablement and its copy.
 */
export function PointerContextMenu({
  x,
  y,
  label,
  heading,
  entries: ownEntries,
  onClose,
  testId,
  container,
  ownerWindowId,
  onEscape,
}: PointerContextMenuProps) {
  // An editor plugin's items (lib/plugins/context-menu), below the
  // editor's own, when this menu was opened by a right-click in an editor
  // with plugins. Taken once, when the menu opens.
  const [pluginItems] = useState(takePluginContextMenu);
  const entries = useMemo<readonly PointerContextMenuEntry[]>(
    () =>
      pluginItems.length
        ? [
            ...ownEntries,
            { id: "separator-plugins", separator: true },
            ...pluginItems.map((item) => ({ id: `plugin-${item.id}`, label: item.label, onSelect: item.onSelect, testId: `plugin-context-${item.id}` })),
          ]
        : ownEntries,
    [ownEntries, pluginItems],
  );
  const menuRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({
    left: x,
    top: y,
    origin: "top left",
  });
  const [submenu, setSubmenu] = useState<{
    id: string;
    trigger: HTMLElement;
    focusFirst: boolean;
  } | null>(null);
  const portalTarget =
    container ?? (typeof document === "undefined" ? null : document.body);
  const openEntry = submenu
    ? (entries.find(
        (entry): entry is PointerContextMenuAction =>
          isAction(entry) && entry.id === submenu.id && Boolean(entry.submenu),
      ) ?? null)
    : null;

  // Measure once mounted: a menu opened near the right or bottom edge flips
  // to the other side of the press instead of being clipped away.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const next = placeOnScreen(menu, x, y);
    setPosition((current) =>
      current.left === next.left &&
      current.top === next.top &&
      current.origin === next.origin
        ? current
        : next,
    );
  }, [entries, x, y]);

  useLayoutEffect(() => {
    const panel = submenuRef.current;
    if (!panel || !submenu?.focusFirst) return;
    panel.querySelector<HTMLButtonElement>(ITEM_SELECTOR)?.focus();
  }, [submenu]);

  // The element that had the keys when the menu opened (the object or cell
  // right-clicked), read while rendering, before the menu takes them (an
  // effect run twice in development would read the menu's own item).
  const [opener] = useState<Element | null>(() =>
    typeof document === "undefined" ? null : document.activeElement,
  );
  useEffect(() => {
    // Once the menu has gone -- Esc, a command, a press elsewhere -- and
    // nothing took the keys, they go back to the opener, as Office returns
    // them to the selection: left on the page, the next Delete or arrow went
    // nowhere. A command that moved them (a dialog, a text box) or removed
    // the opener (Delete) decides for itself.
    const menu = menuRef.current;
    const first = menu?.querySelector<HTMLButtonElement>(ITEM_SELECTOR);
    first?.focus();
    return () => {
      if (!(opener instanceof HTMLElement) || opener === document.body) return;
      requestAnimationFrame(() => {
        const now = document.activeElement;
        if (now && now !== document.body && now.isConnected) return;
        if (opener.isConnected) opener.focus({ preventScroll: true });
      });
    };
  }, [opener]);

  const openSubmenu = useCallback(
    (entryId: string, item: HTMLElement, focusFirst: boolean) => {
      setSubmenu({ id: entryId, trigger: item, focusFirst });
    },
    [],
  );

  const closeSubmenu = useCallback((refocus: boolean) => {
    setSubmenu((current) => {
      if (current && refocus) {
        const parent = menuRef.current?.querySelector<HTMLButtonElement>(
          `[data-pointer-menu-submenu-trigger="${CSS.escape(current.id)}"]`,
        );
        parent?.focus();
      }
      return null;
    });
  }, []);

  /** Arrow keys walk the panel that holds focus, never across panels. */
  const focusStep = useCallback((delta: number) => {
    const active = document.activeElement;
    const panel =
      (active instanceof Element
        ? active.closest<HTMLElement>(`[${PANEL_ATTRIBUTE}]`)
        : null) ?? menuRef.current;
    if (!panel) return;
    const items = Array.from(
      panel.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR),
    ).filter(
      (item) => item.closest(`[${PANEL_ATTRIBUTE}]`) === panel,
    );
    if (items.length === 0) return;
    const current = items.indexOf(active as HTMLButtonElement);
    const next =
      current < 0
        ? delta > 0
          ? 0
          : items.length - 1
        : (current + delta + items.length) % items.length;
    items[next]?.focus();
  }, []);

  /** Home / End: the first or last live row of the panel that holds focus. */
  const focusEdge = useCallback((edge: "first" | "last") => {
    const active = document.activeElement;
    const panel =
      (active instanceof Element
        ? active.closest<HTMLElement>(`[${PANEL_ATTRIBUTE}]`)
        : null) ?? menuRef.current;
    if (!panel) return;
    const items = Array.from(
      panel.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR),
    ).filter((item) => item.closest(`[${PANEL_ATTRIBUTE}]`) === panel);
    (edge === "first" ? items[0] : items[items.length - 1])?.focus();
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (menuRef.current?.contains(target) || submenuRef.current?.contains(target))
      ) {
        return;
      }
      onClose();
    };
    // The surface the menu was opened over: the topmost element under the
    // pointer that is not the menu itself (the menu's corner sits on the
    // pointer). A scroll closes the menu only when it moves that surface,
    // so a scroll elsewhere on the page (Word's ribbon strip bringing a
    // contextual tab into view when the right click selected a picture, a
    // side pane) leaves the menu where it is. Without hit testing (jsdom)
    // every scroll closes it, as before.
    const anchor = (() => {
      if (typeof document.elementsFromPoint !== "function") return null;
      return (
        document
          .elementsFromPoint(x, y)
          .find((element) => !element.closest(`[${PANEL_ATTRIBUTE}]`)) ?? null
      );
    })();
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node) {
        if (
          menuRef.current?.contains(target) ||
          submenuRef.current?.contains(target)
        ) {
          return;
        }
        if (anchor && !target.contains(anchor)) return;
      }
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      const inSubmenu =
        active instanceof Element &&
        active.closest(`[${PANEL_ATTRIBUTE}="sub"]`) !== null;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (inSubmenu) closeSubmenu(true);
        else {
          onClose();
          onEscape?.();
        }
        return;
      }
      const iconRow =
        active instanceof Element
          ? active.closest<HTMLElement>("[data-pointer-menu-icon-row]")
          : null;
      // Under an rtl interface the inline axis runs leftwards: Left opens a
      // submenu and walks an icon row forwards, Right closes the submenu.
      const rtl = isDocumentRtl();
      const forwardKey = rtl ? "ArrowLeft" : "ArrowRight";
      const backKey = rtl ? "ArrowRight" : "ArrowLeft";
      if (iconRow && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        const items = Array.from(
          iconRow.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR),
        );
        const current = items.indexOf(active as HTMLButtonElement);
        const step = event.key === forwardKey ? 1 : -1;
        items[(current + step + items.length) % items.length]?.focus();
        return;
      }
      if (event.key === backKey && inSubmenu) {
        event.preventDefault();
        closeSubmenu(true);
        return;
      }
      if (
        event.key === forwardKey &&
        active instanceof HTMLElement &&
        active.dataset.pointerMenuSubmenuTrigger
      ) {
        event.preventDefault();
        openSubmenu(active.dataset.pointerMenuSubmenuTrigger, active, true);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusStep(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusStep(-1);
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        focusEdge(event.key === "Home" ? "first" : "last");
        return;
      }
      if (
        event.key === "Enter" &&
        active instanceof HTMLButtonElement &&
        active.closest(`[${PANEL_ATTRIBUTE}]`) &&
        active.matches(ITEM_SELECTOR)
      ) {
        // The row runs on Enter in one place for every engine; the native
        // activation the default would add is cancelled so it runs once.
        event.preventDefault();
        active.click();
        return;
      }
      if (event.key === "Tab") {
        // The menu owns focus while it is open; Tab must not walk out onto the
        // surface behind it.
        event.preventDefault();
        focusStep(event.shiftKey ? -1 : 1);
      }
    };
    // Capture so a surface that stops propagation on its own container cannot
    // strand the menu open.
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [closeSubmenu, focusEdge, focusStep, onClose, onEscape, openSubmenu, x, y]);

  if (!portalTarget) return null;

  const renderEntries = (
    list: readonly PointerContextMenuEntry[],
    nested: boolean,
  ) => {
    const hasToggles = list.some(
      (entry) => isAction(entry) && entry.checked !== undefined,
    );
    // One icon column for the whole list once any row carries a glyph, so the
    // labels line up as Office's do.
    const hasIcons = list.some(
      (entry) => isAction(entry) && entry.icon !== undefined,
    );
    return list.map((entry) => {
      if (isIconRow(entry)) {
        return (
          <div
            key={entry.id}
            role="group"
            className={styles.iconRow}
            data-pointer-menu-icon-row="true"
          >
            {entry.iconRow.map((item) => {
              const named =
                item.disabled && item.disabledReason
                  ? `${item.label} — ${item.disabledReason}`
                  : item.label;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  title={named}
                  aria-label={named}
                  data-testid={item.testId}
                  data-disabled-reason={
                    item.disabled ? item.disabledReason : undefined
                  }
                  className={`${styles.iconRowItem} ${PART.iconButton}`}
                  onMouseEnter={
                    nested || !submenu ? undefined : () => closeSubmenu(false)
                  }
                  onClick={() => {
                    if (item.disabled) return;
                    item.onSelect();
                    if (!item.keepOpen) onClose();
                  }}
                >
                  {item.icon ?? (
                    <span className={`${styles.label} ${PART.label}`}>
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      }
      if (!isAction(entry)) {
        return (
          <div
            key={entry.id}
            role="separator"
            aria-hidden="true"
            className={styles.separator}
          />
        );
      }
      const opensSubmenu = !nested && Boolean(entry.submenu?.length);
      const expanded = opensSubmenu && submenu?.id === entry.id;
      return (
        <button
          key={entry.id}
          type="button"
          role={entry.checked === undefined ? "menuitem" : "menuitemcheckbox"}
          aria-checked={entry.checked}
          aria-haspopup={opensSubmenu ? "menu" : undefined}
          aria-expanded={opensSubmenu ? expanded : undefined}
          disabled={entry.disabled}
          title={
            entry.disabled && entry.disabledReason
              ? entry.disabledReason
              : entry.label
          }
          aria-label={
            entry.disabled && entry.disabledReason
              ? `${entry.label} — ${entry.disabledReason}`
              : undefined
          }
          data-testid={entry.testId}
          data-disabled-reason={
            entry.disabled ? entry.disabledReason : undefined
          }
          data-pointer-menu-submenu-trigger={
            opensSubmenu ? entry.id : undefined
          }
          data-expanded={expanded ? "true" : undefined}
          data-toggles={hasToggles ? "true" : undefined}
          data-danger={entry.danger ? "true" : undefined}
          aria-busy={entry.busy || undefined}
          className={styles.item}
          onMouseEnter={
            nested
              ? undefined
              : (event) => {
                  // a tap's compatibility mouseenter is not a hover: the
                  // tap's click opens (and a second tap closes) the submenu
                  if (latestPointerIsTouchLike()) return;
                  if (opensSubmenu && !entry.disabled) {
                    openSubmenu(entry.id, event.currentTarget, false);
                  } else if (submenu) {
                    closeSubmenu(false);
                  }
                }
          }
          onClick={(event) => {
            if (entry.disabled) return;
            if (opensSubmenu) {
              if (expanded) closeSubmenu(false);
              else openSubmenu(entry.id, event.currentTarget, true);
              return;
            }
            entry.onSelect();
            if (!entry.keepOpen) onClose();
          }}
        >
          {hasToggles ? (
            <span aria-hidden="true" className={PART.check}>
              {entry.checked ? <Check size={14} strokeWidth={2.25} /> : null}
            </span>
          ) : null}
          {hasIcons ? (
            <span aria-hidden="true" className={`${styles.icon} ${PART.icon}`}>
              {entry.icon ?? null}
            </span>
          ) : null}
          <span className={`${styles.label} ${PART.label}`}>{entry.label}</span>
          {entry.detail ? (
            <span className={`${styles.detail} ${PART.detail}`}>
              {entry.detail}
            </span>
          ) : null}
          {entry.shortcut && !opensSubmenu ? (
            <span className={`${styles.shortcut} ${PART.shortcut}`}>
              {entry.shortcut}
            </span>
          ) : null}
          {opensSubmenu ? (
            <ChevronRight
              aria-hidden="true"
              size={14}
              className={PART.chevron}
            />
          ) : null}
        </button>
      );
    });
  };

  // The submenu is the shared MenuFlyout, a layer of its own beside the
  // menu, never the menu's child: the menu card is glass (backdrop-filter)
  // and scrolls (overflow), and either one makes it the containing block of
  // a fixed-position child, so a nested submenu was placed against the card
  // and clipped by it, a sliver at the card's edge.
  return createPortal(
    <>
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        data-testid={testId}
        data-window-transient-popup-owner={ownerWindowId}
        {...{ [PANEL_ATTRIBUTE]: "root" }}
        // The menu is the whole answer to this right click; a second one on top
        // of it would be the browser's.
        onContextMenu={(event) => event.preventDefault()}
        className={PANEL_CLASS}
        // Grows from the corner it opened at, and leaves the same way
        // (lib/surface-motion).
        data-motion-surface="pop"
        style={{
          left: position.left,
          top: position.top,
          ["--surface-origin" as string]: position.origin,
        }}
      >
        {heading ? (
          <div aria-hidden="true" className={`${styles.heading} ${PART.heading}`}>
            {heading}
          </div>
        ) : null}
        {renderEntries(entries, false)}
      </div>
      {openEntry?.submenu && submenu ? (
        <MenuFlyout
          ref={submenuRef}
          trigger={submenu.trigger}
          container={portalTarget}
          role="menu"
          aria-label={openEntry.label}
          data-testid={openEntry.testId ? `${openEntry.testId}-submenu` : undefined}
          data-window-transient-popup-owner={ownerWindowId}
          {...{ [PANEL_ATTRIBUTE]: "sub" }}
          onContextMenu={(event) => event.preventDefault()}
          className={SUBMENU_CLASS}
        >
          {renderEntries(openEntry.submenu, true)}
        </MenuFlyout>
      ) : null}
    </>,
    portalTarget,
  );
}

export default PointerContextMenu;
