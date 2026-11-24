"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The SmartArt Text Pane — PowerPoint's outline editor for the selected
 * diagram, shared by every host.
 *
 * One `<textarea>` per outline item, indented by its level, with the keyboard
 * contract Office has: Enter adds a sibling after the item, Tab / Shift+Tab
 * (or Alt+Shift+Right / Left) demote / promote it, Alt+Shift+Up / Down move it
 * among its siblings, Backspace on an emptied item deletes it where the host
 * allows that, Escape closes the pane, and blur commits the text. Every one of
 * those leaves through a callback: the pane owns no state, no selection
 * authority and no transaction. Escape commits the focused row's text before
 * it closes, the way the close button's blur does.
 *
 * ## Mounting it
 *
 * The host renders it beside its canvas (it positions itself absolutely inside
 * the nearest positioned ancestor) and supplies the outline
 * ({@link readSmartArtOutline} over the diagram's members), which item is
 * selected, and — per item — whether promote / demote / delete are available
 * and whether the text is editable. Those are per-item because the native and
 * authored diagrams answer them differently and only the host knows which it
 * has.
 *
 * Test ids follow the tab's: `<prefix>-smartart-text-pane`,
 * `…-outline-list`, `…-outline-input`, `…-outline-delete`.
 */

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Minus,
  Plus,
  Trash2,
  X,
} from "./icons/houseIcons";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "../../../host/next-intl";

import { officeSmartArtTextPaneMenuEntries } from "./OfficeSmartArtContextMenu";
import { PointerContextMenu } from "../ui/PointerContextMenu";
import { OFFICE_SMARTART_LAYOUTS, officeSmartArtLayout } from "../../lib/office-smartart/catalog";
import type { SmartArtOutlineItem } from "../../lib/office-smartart/outline";
import {
  intersectPaneRect,
  scrollingAncestor,
  smartArtTextPanePlacement,
} from "../../lib/office-smartart/text-pane-placement";

import styles from "./OfficeSmartArtDesignTab.module.css";

/** The pane's style slots; anything omitted falls back to the shared module. */
export interface OfficeSmartArtTextPaneClasses {
  textPane: string;
  textPaneHeader: string;
  textPaneHint: string;
  textPaneList: string;
  textPaneItem: string;
  textPaneBullet: string;
}

/** What one item's row may do, decided by the host per item. */
export interface OfficeSmartArtTextPaneItemState {
  canPromote: boolean;
  canDemote: boolean;
  canDelete: boolean;
  /**
   * Backspace on an ALREADY empty item deletes it. Off by default because only
   * a host whose delete is safe mid-typing wants the key bound at all.
   */
  canBackspaceDelete?: boolean;
  /** Alt+Shift+Up / Alt+Shift+Down: whether this item has a sibling that way. */
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** The text cannot be edited (read-only page, or a busy native round trip). */
  readOnly: boolean;
}

export interface OfficeSmartArtTextPaneLabels {
  /** Pane title and accessible name (Office: "SmartArt Text"). */
  title: string;
  /** Accessible name of the close button. */
  close: string;
  /** Accessible name of item `n` (1-based). */
  item: (n: number) => string;
  /** Accessible name of item `n`'s delete button (1-based). */
  deleteItem: (n: number) => string;
  /** An empty item's placeholder (Office: "[Text]"). */
  placeholder?: string;
  /** Office's toolbar above the outline: + − ← → ↓ ↑. */
  toolbar?: {
    add: string;
    remove: string;
    promote: string;
    demote: string;
    moveDown: string;
    moveUp: string;
  };
  /**
   * The pane's right-click menu (Office's `ContextMenuSmartArtContentPane`):
   * its name and the clipboard words; the verbs reuse {@link toolbar}'s.
   */
  menu?: {
    label: string;
    cut: string;
    copy: string;
  };
}

export interface OfficeSmartArtTextPaneProps {
  /** `"presentation"` → `presentation-smartart-text-pane`, and so on. */
  testIdPrefix: string;
  labels: OfficeSmartArtTextPaneLabels;
  outline: readonly SmartArtOutlineItem[];
  /**
   * The items the layout does not draw (`smartArtHidden`): Office keeps their
   * text and marks each row's bullet with a red X ("unused text does not
   * appear, but remains available if you switch layouts").
   */
  unusedItemIds?: ReadonlySet<string>;
  /**
   * The items whose PICTURE the layout does not show (a picture layout's
   * pictures, kept after a switch to a layout without picture shapes,
   * `lib/office-smartart/held-pictures`): Office marks that content with the
   * same red X, and shows it again on a picture layout.
   */
  hiddenPictureItemIds?: ReadonlySet<string>;
  selectedItemId: string | null;
  /** Cap on one item's text, so a paste cannot exceed the outline's limit. */
  maxTextLength: number;
  /** Whether Enter may add an item at all. */
  canAddItem: boolean;
  itemState: (item: SmartArtOutlineItem, index: number) => OfficeSmartArtTextPaneItemState;
  classes?: Partial<OfficeSmartArtTextPaneClasses>;
  /**
   * Prefix for each row's React key. A host whose outline is re-fetched (the
   * native round trip) passes its own generation so a stale `defaultValue`
   * cannot survive the refresh.
   */
  itemKeyPrefix?: string;
  /** Mirrors the pane's `aria-busy`. */
  busy?: boolean;
  /**
   * The host's own state word for the pane's `data-native-smartart-structure`
   * attribute (`"busy"`, `"ready"`, `"unavailable"`, `"loading"`). Omitted, the
   * attribute is absent.
   */
  structureState?: string;
  /** A one-line notice above the list (e.g. "this diagram is text-only"). */
  notice?: string;
  /**
   * The diagram's frame on screen. Given, the pane stands beside it, as
   * Office's Text Pane does, and follows it (`text-pane-placement.ts`);
   * omitted, the host's class places it.
   */
  anchor?: (pane: HTMLElement) => Element | null;
  /** The canvas the pane stays inside; omitted, the frame's scrolling ancestor. */
  bounds?: (pane: HTMLElement) => Element | null;
  /**
   * The diagram's layout (any id the catalog resolves): the pane's footer
   * names it and says what it is for, as Office's does.
   */
  layoutId?: string | null;
  onClose: () => void;
  onSelect: (itemId: string) => void;
  /** Blur: commit this item's text. */
  onCommitText: (itemId: string, text: string) => void;
  /**
   * A row's words typed and never handed over: the pane, or the row, was
   * taken down with no blur (a click on a cell or another object moved the
   * selection, and the pane went away with it). Office edits the diagram as
   * the row is typed, so those words stay. The host writes them to the
   * diagram they were typed in, which is no longer the selected one; the
   * function given here is the one from the render the row was typed in.
   * A host that leaves it out keeps no such words.
   */
  onLeaveText?: (itemId: string, text: string) => void;
  /**
   * Enter: add an item after this one, carrying its uncommitted text. Enter
   * splits the row at the caret, as the Text Pane does: `text` is what stays
   * (before the caret) and `nextText` what moves to the new item (after it,
   * possibly empty). The toolbar's Add Shape passes no `nextText`.
   */
  onAddAfter: (itemId: string, text: string, nextText?: string) => void;
  /**
   * The toolbar's Add Shape: Microsoft's `SmartArtNode.AddNode` After, a new
   * sibling placed after the item's whole subtree, so the item keeps its own
   * subordinates (PPT-B064). Enter splits the row instead, as a list does.
   * A host that leaves it out gets `onAddAfter`.
   */
  onAddShape?: (itemId: string, text: string) => void;
  /** Tab: demote; Shift+Tab: promote. Both carry the uncommitted text. */
  onPromote: (itemId: string, text: string) => void;
  onDemote: (itemId: string, text: string) => void;
  onDelete: (itemId: string) => void;
  /**
   * Alt+Shift+Up / Alt+Shift+Down (Microsoft Support, "Keyboard shortcuts for
   * SmartArt graphics": Move text up / down). Both carry the uncommitted text;
   * a host without Move Up / Move Down leaves them out and the keys do nothing.
   */
  onMoveUp?: (itemId: string, text: string) => void;
  onMoveDown?: (itemId: string, text: string) => void;
  /**
   * Backspace on an item whose text is already empty, where that item's
   * `canBackspaceDelete` is set. The host deletes the item.
   */
  onBackspaceEmpty?: (itemId: string) => void;
  /**
   * The Text Pane's line merge (Microsoft Support, "Keyboard shortcuts for
   * SmartArt graphics": "Merge two lines of text — Delete at the end of the
   * first line"): Delete at a row's end, or Backspace at the start of the row
   * after it (an emptied row included), joins the two. `keepId` takes `text`
   * with the caret at `caret`; `goneId`, the row after it, goes as a deleted
   * row does. A host that leaves it out keeps the keys inside the row.
   */
  onMerge?: (keepId: string, text: string, goneId: string, caret: number) => void;
  /**
   * A paste of several lines: the Text Pane makes each line a line of the
   * outline, one shape each, as Enter does. `text` is what the row keeps (its
   * words before the caret and the first line), `lines` the new rows after it
   * (the last carrying the row's words after the caret), `caret` where the
   * caret goes in the last of them. A host that leaves it out pastes the
   * lines into the row as line breaks.
   */
  onPasteLines?: (itemId: string, text: string, lines: string[], caret: number) => void;
  /**
   * Keep the delete button from stealing focus before it fires — what a host
   * needs when its commit path reads the focused input.
   */
  preventDeleteFocus?: boolean;
}

export function OfficeSmartArtTextPane({
  testIdPrefix,
  labels,
  outline,
  unusedItemIds,
  hiddenPictureItemIds,
  selectedItemId,
  maxTextLength,
  canAddItem,
  itemState,
  classes,
  itemKeyPrefix = "",
  busy,
  structureState,
  notice,
  anchor,
  bounds,
  layoutId,
  onClose,
  onSelect,
  onCommitText,
  onLeaveText,
  onAddAfter,
  onAddShape,
  onPromote,
  onDemote,
  onDelete,
  onMoveUp,
  onMoveDown,
  onBackspaceEmpty,
  onMerge,
  onPasteLines,
  preventDeleteFocus,
}: OfficeSmartArtTextPaneProps) {
  // A host's class adds to the shared one: placement is the host's, the
  // chrome is the same pane in every editor.
  const cls = (slot: keyof OfficeSmartArtTextPaneClasses) =>
    classes?.[slot] ? `${styles[slot]} ${classes[slot]}` : styles[slot];
  const surfaceId = (suffix: string) => `${testIdPrefix}-smartart-${suffix}`;
  // The row inputs by item, so the toolbar can carry an item's uncommitted
  // text into the command it fires, exactly as the keys do.
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  const paneRef = useRef<HTMLElement | null>(null);
  // Where the header was dragged to, from the pane's place beside the frame.
  const dragOffset = useRef({ x: 0, y: 0 });
  const placeRef = useRef<() => void>(() => {});
  // The host's finders, read when the pane places itself: a host passes new
  // closures each render, and the pane re-binds nothing for that.
  const anchorRef = useRef(anchor);
  const boundsRef = useRef(bounds);
  useLayoutEffect(() => {
    anchorRef.current = anchor;
    boundsRef.current = bounds;
  });
  const anchored = Boolean(anchor);
  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane || !anchored) return;
    const anchor = (element: HTMLElement) => anchorRef.current?.(element) ?? null;
    const bounds = (element: HTMLElement) => boundsRef.current?.(element) ?? null;
    let frame = 0;
    const place = () => {
      frame = 0;
      const target = anchor(pane);
      if (!target?.isConnected) {
        delete pane.dataset.anchored;
        for (const key of ["position", "left", "top", "right", "bottom", "maxHeight"] as const) pane.style[key] = "";
        return;
      }
      const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      const canvas = bounds(pane) ?? scrollingAncestor(target);
      const area = intersectPaneRect(canvas ? canvas.getBoundingClientRect() : viewport, viewport);
      pane.dataset.anchored = "true";
      // Fixed, so no overflow on the way up clips it; a transformed window
      // is its containing block instead, which the origin below absorbs.
      pane.style.position = "fixed";
      pane.style.right = "auto";
      pane.style.bottom = "auto";
      if (!pane.style.left) {
        pane.style.left = "0px";
        pane.style.top = "0px";
      }
      const drawn = pane.getBoundingClientRect();
      const originX = drawn.left - parseFloat(pane.style.left);
      const originY = drawn.top - parseFloat(pane.style.top);
      const at = smartArtTextPanePlacement({
        anchor: target.getBoundingClientRect(),
        bounds: area,
        pane: { width: drawn.width, height: drawn.height },
      });
      pane.dataset.side = at.side;
      pane.style.maxHeight = `${at.maxHeight}px`;
      pane.style.left = `${Math.round(at.left - originX + dragOffset.current.x)}px`;
      pane.style.top = `${Math.round(at.top - originY + dragOffset.current.y)}px`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    placeRef.current = schedule;
    place();
    // The frame moves with a drag, a scroll, a zoom or a relayout: follow it.
    const observer = new ResizeObserver(schedule);
    observer.observe(pane);
    const target = anchor(pane);
    if (target) observer.observe(target);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("pointermove", schedule, { capture: true, passive: true });
    window.addEventListener("pointerup", schedule, { capture: true });
    window.addEventListener("keyup", schedule, { capture: true });
    const timer = window.setInterval(schedule, 500);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("pointermove", schedule, { capture: true });
      window.removeEventListener("pointerup", schedule, { capture: true });
      window.removeEventListener("keyup", schedule, { capture: true });
      window.clearInterval(timer);
    };
  }, [anchored]);
  // Office's pane moves by its title bar.
  const beginHeaderDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!anchor || event.button !== 0 || (event.target as Element).closest("button")) return;
    event.preventDefault();
    const startX = event.clientX - dragOffset.current.x;
    const startY = event.clientY - dragOffset.current.y;
    const header = event.currentTarget;
    header.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      dragOffset.current = { x: next.clientX - startX, y: next.clientY - startY };
      placeRef.current();
    };
    const end = () => {
      header.removeEventListener("pointermove", move);
      header.removeEventListener("pointerup", end);
      header.removeEventListener("pointercancel", end);
    };
    header.addEventListener("pointermove", move);
    header.addEventListener("pointerup", end);
    header.addEventListener("pointercancel", end);
  };
  // The row typed in since its words last left through a blur, a key or a
  // button, with the host's writer from that render (`onLeaveText`).
  const typing = useRef<{
    itemId: string;
    element: HTMLTextAreaElement;
    text: string;
    leave: (itemId: string, text: string) => void;
  } | null>(null);
  const leaveTyping = () => {
    const open = typing.current;
    typing.current = null;
    if (open && open.element.value !== open.text) open.leave(open.itemId, open.element.value);
  };
  // A row replaced or removed under the caret, and the pane taken down.
  useLayoutEffect(() => {
    if (typing.current && !typing.current.element.isConnected) leaveTyping();
  });
  useLayoutEffect(() => () => leaveTyping(), []);
  // The row and caret a Tab, Shift+Tab or Alt+Shift+arrow was pressed in. The
  // command re-renders the row (its key carries its words), which dropped the
  // focus: the caret went to the canvas and the next words typed went
  // nowhere. Office keeps the caret where it was in the Text Pane, so the
  // re-rendered row takes it back, unless the author has moved on meanwhile.
  const keepCaret = useRef<{
    itemId: string;
    start: number;
    end: number;
    until: number;
    /** The row the key was pressed in (a merge's other row). */
    from?: HTMLTextAreaElement;
  } | null>(null);
  useLayoutEffect(() => {
    const keep = keepCaret.current;
    if (!keep) return;
    const input = inputs.current.get(keep.itemId);
    if (Date.now() > keep.until) {
      keepCaret.current = null;
      return;
    }
    if (!input?.isConnected) return;
    const active = document.activeElement;
    if (active !== input) {
      // Another row (Enter's new one), or a field outside the pane: the
      // caret has gone where it was sent, and stays there.
      const elsewhere =
        active instanceof HTMLElement &&
        active !== document.body &&
        active !== keep.from &&
        (paneRef.current?.contains(active) ||
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          active.isContentEditable);
      if (elsewhere) {
        keepCaret.current = null;
        return;
      }
      input.focus({ preventScroll: true });
      const length = input.value.length;
      input.setSelectionRange(Math.min(keep.start, length), Math.min(keep.end, length));
    }
  });
  useLayoutEffect(() => {
    // A press anywhere is the author moving on: the kept caret stands down.
    const stand = () => {
      keepCaret.current = null;
    };
    document.addEventListener("pointerdown", stand, true);
    return () => document.removeEventListener("pointerdown", stand, true);
  }, []);
  const holdCaret = (itemId: string, element: HTMLTextAreaElement) => {
    keepCaret.current = {
      itemId,
      start: element.selectionStart ?? element.value.length,
      end: element.selectionEnd ?? element.value.length,
      until: Date.now() + 1500,
    };
  };
  // The pane's own right-click menu: which row, and where.
  const [menu, setMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const t = useTranslations("console-notebooks");
  const placeholder =
    labels.placeholder ?? t("office.smartArtTextPane.placeholder");
  const unusedWords = {
    notice: t("office.smartArtTextPane.unusedNotice"),
    item: t("office.smartArtTextPane.unusedItem"),
    picture: t("office.smartArtTextPane.hiddenPicture"),
  };
  // Only an offered layout has words of its own; a convert-only one has none.
  const layout = officeSmartArtLayout(layoutId);
  const layoutInfo =
    layout && OFFICE_SMARTART_LAYOUTS.includes(layout)
      ? {
          name: t(`toolbar.smartArtLayoutName_${layout.id}` as "toolbar.smartArtLayoutName_basic-list"),
          description: t(`toolbar.smartArtLayoutDesc_${layout.id}` as "toolbar.smartArtLayoutDesc_basic-list"),
        }
      : null;
  const toolbar = labels.toolbar ?? {
    add: t("office.smartArtTextPane.add"),
    remove: t("office.smartArtTextPane.remove"),
    promote: t("office.smartArtTextPane.promote"),
    demote: t("office.smartArtTextPane.demote"),
    moveDown: t("office.smartArtTextPane.moveDown"),
    moveUp: t("office.smartArtTextPane.moveUp"),
  };
  const menuWords = labels.menu ?? {
    label: labels.title,
    cut: t("office.smartArtTextPane.cut"),
    copy: t("office.smartArtTextPane.copy"),
  };
  // Office's toolbar acts on the selected item (the first one when none is).
  const targetIndex = Math.max(
    0,
    outline.findIndex((item) => item.id === selectedItemId),
  );
  const target = outline[targetIndex];
  const targetState = target ? itemState(target, targetIndex) : null;
  const targetText = () => (target ? (inputs.current.get(target.id)?.value ?? target.text) : "");
  const toolbarButton = (
    key: "add" | "remove" | "promote" | "demote" | "moveDown" | "moveUp",
    icon: ReactNode,
    enabled: boolean,
    run: () => void,
  ) => (
    <button
      type="button"
      className={styles.textPaneToolbarButton}
      data-command={key}
      disabled={!target || !enabled}
      aria-label={toolbar[key]}
      title={toolbar[key]}
      data-testid={surfaceId(`text-pane-${key === "moveDown" ? "move-down" : key === "moveUp" ? "move-up" : key}`)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!target) return;
        onSelect(target.id);
        typing.current = null;
        run();
      }}
    >
      {icon}
    </button>
  );
  return (
    <aside
      ref={paneRef}
      className={cls("textPane")}
      aria-busy={busy || undefined}
      data-native-smartart-structure={structureState}
      data-office-smartart-text-pane=""
      data-testid={surfaceId("text-pane")}
      aria-label={labels.title}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className={cls("textPaneHeader")}
        data-draggable={anchor ? "true" : undefined}
        onPointerDown={beginHeaderDrag}
      >
        <strong>{labels.title}</strong>
        <button
          type="button"
          onClick={() => onClose()}
          aria-label={labels.close}
          data-testid={surfaceId("text-pane-close")}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {/* Office's "SmartArt Text" toolbar: add, remove, promote, demote,
          move down, move up, each on the selected item, carrying the text
          typed so far. */}
      <div className={styles.textPaneToolbar} role="toolbar" aria-label={labels.title} data-testid={surfaceId("text-pane-toolbar")}>
        {toolbarButton("add", <Plus size={16} aria-hidden="true" />, canAddItem, () =>
          onAddShape
            ? onAddShape(target!.id, targetText())
            : onAddAfter(target!.id, targetText()),
        )}
        {toolbarButton("remove", <Minus size={16} aria-hidden="true" />, Boolean(targetState?.canDelete), () => onDelete(target!.id))}
        {toolbarButton("promote", <ArrowLeft size={16} aria-hidden="true" />, Boolean(targetState?.canPromote), () => onPromote(target!.id, targetText()))}
        {toolbarButton("demote", <ArrowRight size={16} aria-hidden="true" />, Boolean(targetState?.canDemote), () => onDemote(target!.id, targetText()))}
        {toolbarButton("moveDown", <ArrowDown size={16} aria-hidden="true" />, Boolean(targetState?.canMoveDown && onMoveDown), () => onMoveDown?.(target!.id, targetText()))}
        {toolbarButton("moveUp", <ArrowUp size={16} aria-hidden="true" />, Boolean(targetState?.canMoveUp && onMoveUp), () => onMoveUp?.(target!.id, targetText()))}
      </div>
      {notice ? (
        <p
          className={cls("textPaneHint")}
          role="status"
          data-testid={surfaceId("editing-limit")}
        >
          {notice}
        </p>
      ) : null}
      <ol
        className={cls("textPaneList")}
        data-testid={surfaceId("outline-list")}
      >
        {outline.map((item, index) => {
          const state = itemState(item, index);
          return (
            <li
              key={`${itemKeyPrefix}${item.id}:${item.text}`}
              className={cls("textPaneItem")}
              data-smartart-outline-item-id={item.id}
              data-level={item.level}
              data-selected={selectedItemId === item.id ? "true" : undefined}
              // Office marks an assistant with a bullet that has a line
              // attached (Microsoft Support, "Create an organization chart").
              data-assistant={item.assistant ? "true" : undefined}
              // Unused text: the layout does not draw this item.
              data-unused={unusedItemIds?.has(item.id) ? "true" : undefined}
              // …and a picture of the item's that the layout does not show.
              data-picture-hidden={hiddenPictureItemIds?.has(item.id) ? "true" : undefined}
              style={
                {
                  ["--smartart-outline-level" as string]: item.level,
                } as CSSProperties
              }
            >
              <span
                className={cls("textPaneBullet")}
                aria-hidden="true"
                title={unusedItemIds?.has(item.id) ? unusedWords.item : undefined}
              />
              {hiddenPictureItemIds?.has(item.id) && !unusedItemIds?.has(item.id) ? (
                // Office's red X on the picture the layout does not show.
                <span
                  className={styles.textPanePictureHidden}
                  role="img"
                  aria-label={unusedWords.picture}
                  title={unusedWords.picture}
                  data-testid={surfaceId("outline-picture-hidden")}
                />
              ) : null}
              <textarea
                ref={(element) => {
                  if (element) inputs.current.set(item.id, element);
                  else inputs.current.delete(item.id);
                }}
                placeholder={state.readOnly ? undefined : placeholder}
                defaultValue={item.text}
                rows={Math.min(8, item.text.split("\n").length)}
                onInput={(event) => {
                  event.currentTarget.rows = Math.min(
                    8,
                    event.currentTarget.value.split("\n").length,
                  );
                }}
                onChange={(event) => {
                  if (onLeaveText && !state.readOnly) {
                    typing.current = { itemId: item.id, element: event.currentTarget, text: item.text, leave: onLeaveText };
                  }
                }}
                maxLength={maxTextLength}
                readOnly={state.readOnly}
                aria-label={labels.item(index + 1)}
                data-testid={surfaceId("outline-input")}
                onPaste={(event) => {
                  if (!onPasteLines || state.readOnly || !canAddItem) return;
                  const pasted = event.clipboardData
                    .getData("text/plain")
                    .replace(/\r\n?/g, "\n")
                    // One line break at the end of a copied line is its end,
                    // not an empty line after it.
                    .replace(/\n$/, "");
                  if (!pasted.includes("\n")) return;
                  event.preventDefault();
                  const element = event.currentTarget;
                  const value = element.value;
                  const start = element.selectionStart ?? value.length;
                  const end = element.selectionEnd ?? start;
                  const lines = pasted.split("\n");
                  const last = lines[lines.length - 1];
                  const added = [...lines.slice(1, -1), last + value.slice(end)];
                  const text = value.slice(0, start) + lines[0];
                  if ([text, ...added].some((line) => line.length > maxTextLength)) return;
                  typing.current = null;
                  onSelect(item.id);
                  onPasteLines(item.id, text, added, last.length);
                }}
                onCompositionStart={(event) => {
                  event.currentTarget.dataset.smartartComposing = "true";
                }}
                onCompositionEnd={(event) => {
                  delete event.currentTarget.dataset.smartartComposing;
                }}
                onFocus={() => onSelect(item.id)}
                onContextMenu={(event) => {
                  // Office's Text Pane answers a right click with its own
                  // menu (the clipboard and the four outline verbs).
                  event.preventDefault();
                  onSelect(item.id);
                  setMenu({ x: event.clientX, y: event.clientY, itemId: item.id });
                }}
                onBlur={(event) => {
                  if (typing.current?.element === event.currentTarget) typing.current = null;
                  onCommitText(item.id, event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229)
                    return;
                  // Every key the pane answers carries the row's words to
                  // the host (or ends the row): they have left.
                  if (
                    event.key === "Escape" ||
                    event.key === "Enter" ||
                    event.key === "Tab" ||
                    (event.key === "Backspace" && event.currentTarget.value === "") ||
                    (event.altKey && event.shiftKey)
                  ) {
                    typing.current = null;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    // Office's Text Pane edits the diagram as you type, so
                    // Esc closes the pane over the text already there. The
                    // pane unmounts without a blur, so commit the row first:
                    // Esc, the close button and moving focus all keep it.
                    const value = event.currentTarget.value;
                    if (!state.readOnly && value !== item.text) {
                      onCommitText(item.id, value);
                    }
                    onClose();
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!canAddItem) return;
                    onSelect(item.id);
                    // Split at the caret (a selection is replaced): the text
                    // before stays, the text after becomes the new item.
                    const value = event.currentTarget.value;
                    const start = event.currentTarget.selectionStart ?? value.length;
                    const end = event.currentTarget.selectionEnd ?? start;
                    onAddAfter(item.id, value.slice(0, start), value.slice(end));
                    return;
                  }
                  if (
                    event.key === "Backspace" &&
                    event.currentTarget.value === "" &&
                    state.canBackspaceDelete
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    onBackspaceEmpty?.(item.id);
                    return;
                  }
                  // Backspace at a row's start joins it to the row above;
                  // Delete at a row's end joins the row below to it.
                  const merge = (() => {
                    if (!onMerge || state.readOnly || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return null;
                    const element = event.currentTarget;
                    if (element.selectionStart !== element.selectionEnd) return null;
                    const value = element.value;
                    if (event.key === "Backspace" && element.selectionStart === 0 && index > 0) {
                      const above = outline[index - 1];
                      const aboveText = inputs.current.get(above.id)?.value ?? above.text;
                      return state.canDelete && !itemState(above, index - 1).readOnly
                        ? { keep: above.id, gone: item.id, text: aboveText + value, caret: aboveText.length }
                        : null;
                    }
                    if (event.key === "Delete" && element.selectionStart === value.length && index + 1 < outline.length) {
                      const below = outline[index + 1];
                      const belowText = inputs.current.get(below.id)?.value ?? below.text;
                      return itemState(below, index + 1).canDelete
                        ? { keep: item.id, gone: below.id, text: value + belowText, caret: value.length }
                        : null;
                    }
                    return null;
                  })();
                  if (merge) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (merge.text.length > maxTextLength) return;
                    typing.current = null;
                    // The joined row re-renders with its new words (or the
                    // row the caret was in goes): it takes the caret at the
                    // join, however late the host's own focus comes.
                    keepCaret.current = {
                      itemId: merge.keep,
                      start: merge.caret,
                      end: merge.caret,
                      until: Date.now() + 1500,
                      from: event.currentTarget,
                    };
                    onSelect(merge.keep);
                    onMerge!(merge.keep, merge.text, merge.gone, merge.caret);
                    return;
                  }
                  // Office's other outline keys: Alt+Shift+Up / Down move the
                  // item among its siblings, Alt+Shift+Left / Right promote /
                  // demote it (Microsoft Support, "Keyboard shortcuts for
                  // SmartArt graphics").
                  if (event.altKey && event.shiftKey) {
                    const value = event.currentTarget.value;
                    const run =
                      event.key === "ArrowUp"
                        ? state.canMoveUp && onMoveUp
                        : event.key === "ArrowDown"
                          ? state.canMoveDown && onMoveDown
                          : event.key === "ArrowLeft"
                            ? state.canPromote && onPromote
                            : event.key === "ArrowRight"
                              ? state.canDemote && onDemote
                              : null;
                    if (run) {
                      event.preventDefault();
                      holdCaret(item.id, event.currentTarget);
                      onSelect(item.id);
                      run(item.id, value);
                      return;
                    }
                  }
                  if (event.key !== "Tab") return;
                  // Tab and Shift+Tab are the pane's demote / promote keys
                  // and never leave the row, even where the item cannot
                  // move a level (Office keeps the caret in the Text Pane):
                  // the caret was lost to the canvas and the next words
                  // typed there went nowhere.
                  event.preventDefault();
                  const commandAvailable = event.shiftKey
                    ? state.canPromote
                    : state.canDemote;
                  if (!commandAvailable) return;
                  holdCaret(item.id, event.currentTarget);
                  onSelect(item.id);
                  const value = event.currentTarget.value;
                  if (event.shiftKey) onPromote(item.id, value);
                  else onDemote(item.id, value);
                }}
              />
              <button
                type="button"
                className={styles.textPaneRowDelete}
                disabled={!state.canDelete}
                onClick={() => {
                  if (typing.current?.itemId === item.id) typing.current = null;
                  onDelete(item.id);
                }}
                onMouseDown={(event) => {
                  if (preventDeleteFocus) event.preventDefault();
                }}
                aria-label={labels.deleteItem(index + 1)}
                data-testid={surfaceId("outline-delete")}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
      {outline.some((item) => unusedItemIds?.has(item.id) || hiddenPictureItemIds?.has(item.id)) ? (
        // Office's own words under the pane while any of its content is
        // marked with a red X (Microsoft Support, "Anything above marked
        // with a red X will not appear in this SmartArt graphic and will
        // not be saved").
        <p className={styles.textPaneUnusedNotice} role="note" data-testid={surfaceId("text-pane-unused-notice")}>
          <span className={styles.textPaneUnusedMark} aria-hidden="true" />
          {unusedWords.notice}
        </p>
      ) : null}
      {layoutInfo ? (
        <footer className={styles.textPaneFooter} data-testid={surfaceId("text-pane-layout")}>
          <strong>{layoutInfo.name}</strong>
          {layoutInfo.description ? <span>{layoutInfo.description}</span> : null}
        </footer>
      ) : null}
      {menu
        ? (() => {
            const index = outline.findIndex((item) => item.id === menu.itemId);
            const item = outline[index];
            const input = inputs.current.get(menu.itemId);
            if (!item || !input) return null;
            const state = itemState(item, index);
            const text = () => input.value;
            const selected = input.selectionStart !== input.selectionEnd;
            const clipboard = (verb: "cut" | "copy") => () => {
              input.focus();
              document.execCommand(verb);
            };
            return (
              <PointerContextMenu
                x={menu.x}
                y={menu.y}
                label={menuWords.label}
                testId={surfaceId("text-pane-menu")}
                onClose={() => setMenu(null)}
                entries={officeSmartArtTextPaneMenuEntries({
                  testIdPrefix,
                  labels: {
                    menu: menuWords.label,
                    cut: menuWords.cut,
                    copy: menuWords.copy,
                    promote: toolbar.promote,
                    demote: toolbar.demote,
                    moveUp: toolbar.moveUp,
                    moveDown: toolbar.moveDown,
                  },
                  readOnly: state.readOnly,
                  hasSelection: selected,
                  onCut: clipboard("cut"),
                  onCopy: clipboard("copy"),
                  onPromote: state.canPromote
                    ? () => onPromote(item.id, text())
                    : null,
                  onDemote: state.canDemote ? () => onDemote(item.id, text()) : null,
                  onMoveUp:
                    state.canMoveUp && onMoveUp
                      ? () => onMoveUp(item.id, text())
                      : null,
                  onMoveDown:
                    state.canMoveDown && onMoveDown
                      ? () => onMoveDown(item.id, text())
                      : null,
                })}
              />
            );
          })()
        : null}
    </aside>
  );
}
