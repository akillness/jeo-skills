"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

import { usePopupPortalTarget } from "./portal-host";
import { isDocumentRtl, useDocumentDirection } from "../../lib/document-direction";

const EDGE_GUTTER = 8;
/** The flyout's edge tucks this far under its trigger row, as a macOS menu's. */
const FLYOUT_OVERLAP = 4;

export interface MenuFlyoutAnchor {
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

/**
 * Where a submenu opened from a trigger row goes: beside the row's right
 * edge, flipped to its left edge when the window's right edge is too close,
 * and moved up (never above the top gutter) when the bottom edge is.
 * `offset` is the gap to the trigger (negative tucks under it, as a menu's
 * submenu does; a panel beside a button keeps a gap). Under an rtl
 * interface (`rtl`) the sides swap: beside the row's left edge first, as a
 * Windows menu opens its submenus in a right-to-left language.
 */
export function placeMenuFlyout(
  anchor: MenuFlyoutAnchor,
  size: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  offset = -FLYOUT_OVERLAP,
  rtl = false,
): { left: number; top: number } {
  const maxLeft = Math.max(
    EDGE_GUTTER,
    viewport.width - size.width - EDGE_GUTTER,
  );
  const maxTop = Math.max(
    EDGE_GUTTER,
    viewport.height - size.height - EDGE_GUTTER,
  );
  let left = anchor.right + offset;
  if (rtl) {
    left = anchor.left - size.width - offset;
    if (left < EDGE_GUTTER) {
      const flipped = anchor.right + offset;
      if (flipped + size.width <= viewport.width - EDGE_GUTTER) left = flipped;
    }
  } else if (left + size.width > viewport.width - EDGE_GUTTER) {
    const flipped = anchor.left - size.width - offset;
    if (flipped >= EDGE_GUTTER) left = flipped;
  }
  return {
    left: Math.min(Math.max(EDGE_GUTTER, left), maxLeft),
    top: Math.min(
      Math.max(EDGE_GUTTER, anchor.top + Math.min(offset, 0)),
      maxTop,
    ),
  };
}

/** The popover tier (a Cupertino submenu's), the least a flyout takes. */
const FLYOUT_MIN_LAYER = 60;

/**
 * The stacking layer a flyout takes: above every layer its trigger sits in.
 * The flyout is portalled out of them, so the trigger's nearest z-index can
 * be local to a window or pane that itself sits higher on the page.
 */
function layerAbove(trigger: HTMLElement): number {
  let highest = FLYOUT_MIN_LAYER - 1;
  for (let node: HTMLElement | null = trigger; node; node = node.parentElement) {
    const z = Number.parseInt(getComputedStyle(node).zIndex, 10);
    if (Number.isFinite(z)) highest = Math.max(highest, z);
  }
  return highest + 1;
}

export interface MenuFlyoutProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  /** The trigger row the flyout opens from. */
  readonly trigger: HTMLElement;
  /** Where to portal; <body> unless a surface hosts its own layer. */
  readonly container?: HTMLElement | null;
  /** Gap to the trigger; negative tucks under it (a submenu's default). */
  readonly offset?: number;
  /** Width, type and wrapping; the placement and layer are the flyout's. */
  readonly style?: CSSProperties;
}

/**
 * A menu's ▸ flyout, drawn as its own layer beside its trigger rather than
 * inside the parent menu.
 *
 * Every Cupertino menu card scrolls (overflow: auto) and is glass
 * (backdrop-filter). A flyout nested in the card is clipped to it, and its own
 * blur samples only the card, so it showed as a sliver hidden behind its
 * parent. Portalled to <body> with fixed placement from the trigger's
 * rectangle, it is a sibling layer painted above the menu it opens from.
 * React still routes its events through the parent menu (keyboard walking,
 * Escape), but a DOM containment test on the parent menu no longer sees it:
 * callers that close on an outside press must also test the flyout's ref.
 */
export const MenuFlyout = forwardRef<HTMLDivElement, MenuFlyoutProps>(
  function MenuFlyout(
    { trigger, container, offset = -FLYOUT_OVERLAP, style, ...rest },
    forwardedRef,
  ) {
    const panelRef = useRef<HTMLDivElement | null>(null);

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        panelRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    // Placed before the first paint, straight on the element: a flyout
    // hidden until a re-render could not take the focus its opener moves
    // into it (Right arrow focuses the first item) in the same commit.
    useLayoutEffect(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const { width, height } = panel.getBoundingClientRect();
      const { left, top } = placeMenuFlyout(
        trigger.getBoundingClientRect(),
        { width, height },
        { width: window.innerWidth, height: window.innerHeight },
        offset,
        isDocumentRtl(),
      );
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.zIndex = String(layerAbove(trigger));
    }, [trigger, offset]);

    // Grows from the side it opens on (lib/surface-motion).
    const rtl = useDocumentDirection() === "rtl";
    // The enclosing layer (a standalone window layer), else <body>.
    const layerTarget = usePopupPortalTarget();
    const target = container ?? layerTarget;
    if (!target) return null;
    return createPortal(
      <div
        ref={setRefs}
        data-menu-flyout=""
        // A flyout opens beside its trigger and leaves like any menu
        // (lib/surface-motion); a caller may name another kind.
        data-motion-surface="pop"
        {...rest}
        style={{ ["--surface-origin" as string]: rtl ? "top right" : "top left", ...style, position: "fixed" }}
      />,
      target,
    );
  },
);
