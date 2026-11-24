"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { createPortal } from "react-dom";

import { usePopupPortalTarget } from "../ui/portal-host";

import {
  OfficeColorPalettePanel,
  type OfficeColorPaletteEntry,
  type OfficeColorPalettePanelLabels,
  type OfficeColorPalettePanelProps,
} from "./OfficeColorPalettePanel";

export type OfficeColorPalettePopoverLabels = OfficeColorPalettePanelLabels;
export type { OfficeColorPaletteEntry };

export interface OfficeColorPalettePopoverProps
  extends OfficeColorPalettePanelProps {
  onDismiss?: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
  /** Stacking level of the portalled panel. A popup opened from inside a
   * modal dialog must sit above that dialog's overlay, not the ribbon's. */
  zIndex?: number;
}

const DEFAULT_POPOVER_Z_INDEX = 60;

/**
 * A modal dialog the palette's trigger sits in. The palette opens beside the
 * dialog's card, in the same portal, never inside the card: the card clips
 * what it holds (Format Cells cut the top off a palette that opened upward)
 * and, being glass and transformed, is the containing block of its fixed
 * children. The palette is a Radix layer of its own (a non-modal dialog
 * nested in the modal's React tree), so the modal's focus trap pauses while
 * it is open, a press on a swatch is not a click outside the modal, and it
 * takes pointer events although the modal makes the rest of the page inert.
 */
const MODAL_DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]';

type RectLike = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}>;

export function officeColorPalettePosition({
  anchor,
  panel,
  viewportWidth,
  viewportHeight,
  direction = "ltr",
  padding = 8,
  offset = 4,
}: {
  anchor: RectLike;
  panel: Pick<RectLike, "width" | "height">;
  viewportWidth: number;
  viewportHeight: number;
  direction?: "ltr" | "rtl";
  padding?: number;
  offset?: number;
}): Readonly<{ left: number; top: number }> {
  const preferredLeft =
    direction === "rtl" ? anchor.right - panel.width : anchor.left;
  const maxLeft = Math.max(padding, viewportWidth - panel.width - padding);
  const left = Math.max(padding, Math.min(preferredLeft, maxLeft));
  const below = anchor.bottom + offset;
  const above = anchor.top - panel.height - offset;
  const preferredTop =
    below + panel.height <= viewportHeight - padding || above < padding
      ? below
      : above;
  const maxTop = Math.max(padding, viewportHeight - panel.height - padding);
  const top = Math.max(padding, Math.min(preferredTop, maxTop));
  return { left, top };
}

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function OfficeColorPalettePopover({
  onDismiss,
  anchorRef,
  zIndex = DEFAULT_POPOVER_Z_INDEX,
  ...panelProps
}: OfficeColorPalettePopoverProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  /**
   * Fallback anchor for a caller that passes no `anchorRef`.
   *
   * The panel itself CANNOT be used to find the trigger: it is portalled to
   * `document.body`, so `containerRef.current.parentElement` is the body, and a
   * `querySelector("button")` from there returns the FIRST button in the whole
   * page. That is what pinned an un-anchored picker to the viewport's top-left
   * corner (the Docs Layout ribbon's Page Color panel) instead of opening under
   * its own button, while every picker that passes `anchorRef` (Font Color,
   * Highlight, Paragraph Shading) positioned correctly.
   *
   * This sentinel is rendered in the CALLER's DOM position — i.e. inside the
   * trigger's host element — so the fallback search stays local. It is
   * `display:none`, renders only while the popover is open, and is skipped
   * entirely when `anchorRef` is supplied, so an anchored caller is unchanged.
   */
  const fallbackAnchorRef = useRef<HTMLSpanElement | null>(null);
  const usesFallbackAnchor = anchorRef === undefined;
  const fitsContent = panelProps.swatchSet === "highlighter";
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  // A palette opened inside a layer over the page stays in that layer.
  const popupTarget = usePopupPortalTarget();

  useBrowserLayoutEffect(() => {
    const origin = anchorRef?.current ?? fallbackAnchorRef.current;
    const modal = origin?.closest<HTMLElement>(MODAL_DIALOG_SELECTOR);
    setPortalHost(modal ? (modal.parentElement ?? modal) : popupTarget);
  }, [anchorRef, popupTarget]);

  useBrowserLayoutEffect(() => {
    const panel = containerRef.current;
    const wrapper = usesFallbackAnchor
      ? fallbackAnchorRef.current?.parentElement
      : null;
    const ownerWindow =
      (anchorRef?.current ?? wrapper)?.closest<HTMLElement>(
        "[data-window-id]",
      ) ??
      document.querySelector<HTMLElement>(
        '.wm-window[data-focused="true"][data-window-id]',
      );
    const ownerWindowId = ownerWindow?.dataset.windowId;
    if (panel && ownerWindowId) {
      panel.dataset.windowTransientPopupOwner = ownerWindowId;
    }
    const anchor =
      anchorRef?.current ??
      wrapper?.querySelector<HTMLElement>("button, [role='button']") ??
      wrapper;
    if (!panel || !(anchor instanceof HTMLElement)) return;
    const returnFocusTarget = anchor.matches("button, [role='button']")
      ? anchor
      : anchor.querySelector<HTMLElement>("button, [role='button']");
    const place = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const direction =
        document.documentElement.dir === "rtl" ||
        getComputedStyle(anchor).direction === "rtl"
          ? "rtl"
          : "ltr";
      const position = officeColorPalettePosition({
        anchor: anchorRect,
        panel: panelRect,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        direction,
      });
      panel.style.left = `${position.left}px`;
      panel.style.top = `${position.top}px`;
      // Inside a dialog that is transformed (centred with a translate) the
      // fixed panel is placed against the dialog, not the viewport: shift it
      // by the offset it was actually drawn at.
      const drawn = panel.getBoundingClientRect();
      const dx = drawn.left - position.left;
      const dy = drawn.top - position.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        panel.style.left = `${position.left - dx}px`;
        panel.style.top = `${position.top - dy}px`;
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      if (returnFocusTarget && document.body.contains(returnFocusTarget)) {
        returnFocusTarget.focus({ preventScroll: true });
      }
    };
  }, [anchorRef, usesFallbackAnchor, portalHost]);

  useEffect(() => {
    if (!onDismiss) return;
    const dismissOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        onDismiss();
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [onDismiss]);

  const content = (
    <DialogPrimitive.Root open modal={false}>
      <DialogPrimitive.Content
        asChild
        aria-describedby={undefined}
        // The palette keeps its own focus and its own outside-press rule.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onFocusOutside={(event) => event.preventDefault()}
        // The top layer takes Escape: the palette closes, a dialog under it
        // stays open.
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          onDismiss?.();
        }}
      >
    <span
      ref={containerRef}
      className="docs-cupertino-menu office-color-palette spreadsheet-color-palette"
      // Unmounted by its owner while open: leaves like the ribbon's menus.
      data-motion-exit="pop"
      // A swatch press is a ribbon command on the selected object: an editor
      // that drops its object selection on outside presses (a PDF text box)
      // must keep it, or the colour lands on nothing.
      data-ribbon-object-selection-retain="true"
      role="dialog"
      aria-modal="false"
      aria-label={panelProps.labels.themeColors}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
      }}
      style={{
        display: "block",
        left: 8,
        position: "fixed",
        top: 8,
        zIndex,
        ...(fitsContent
          ? // Text Highlight Color's five-a-row grid: as wide as its
            // swatches, under the Cupertino menu's 184px floor too
            { maxWidth: "calc(100vw - 16px)", minWidth: 0, width: "max-content" }
          : {
              // 276px, or wider under a coarse pointer (globals.css) where
              // each swatch is a 44px finger target
              maxWidth: "min(var(--office-color-palette-width, 276px), calc(100vw - 16px))",
              minWidth: "min(var(--office-color-palette-width, 276px), calc(100vw - 16px))",
              width: "var(--office-color-palette-width, 276px)",
            }),
      }}
    >
      <DialogPrimitive.Title className="sr-only">
        {panelProps.labels.themeColors}
      </DialogPrimitive.Title>
      <OfficeColorPalettePanel {...panelProps} />
    </span>
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
  if (typeof document === "undefined") return null;
  const portal = portalHost ? createPortal(content, portalHost) : null;
  return usesFallbackAnchor ? (
    <>
      <span
        aria-hidden="true"
        data-office-color-palette-anchor="fallback"
        ref={fallbackAnchorRef}
        style={{ display: "none" }}
      />
      {portal}
    </>
  ) : (
    portal
  );
}
