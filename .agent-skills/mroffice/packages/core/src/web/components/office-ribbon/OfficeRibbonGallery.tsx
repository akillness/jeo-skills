"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createWheelGestureLatch } from "../../lib/wheel-gesture";
import {
  cloneElement,
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

import styles from "./OfficeRibbonGallery.module.css";
import { resyncHoverAfterScroll } from "../../lib/pointer-hover-resync";

export interface OfficeRibbonGalleryProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "aria-label"> {
  ariaLabel: string;
  disclosurePlacement?: "bottom" | "end";
  testId?: string;
  /** Keep each editor's existing item structure and event/selection ownership. */
  viewport: ReactElement<HTMLAttributes<HTMLDivElement>>;
  /** The existing trigger and portalled menu, never a second popup implementation. */
  more: ReactNode;
}

/** Shared geometry for an inline Office gallery and its disclosure rail. */
export function OfficeRibbonGallery({
  ariaLabel,
  disclosurePlacement = "bottom",
  testId,
  className,
  viewport,
  more,
  onFocusCapture,
  role = "group",
  ...rootProps
}: OfficeRibbonGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // The gallery's items slide under a resting pointer when it scrolls; the
  // item that slid away must not stay lit (pointer-hover-resync).
  useEffect(() => {
    const viewport = rootRef.current?.querySelector<HTMLElement>("[data-office-gallery-viewport]");
    return viewport ? resyncHoverAfterScroll(viewport) : undefined;
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const gesture = createWheelGestureLatch<HTMLElement | null>();
    const onWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey) return;
      // Uncancelable: the browser scrolls this gesture itself (Safari after
      // a slow handler); moving the strip by hand too doubles the scroll.
      if (!event.cancelable) return;
      // A trackpad swipe stays native, even one more vertical than not (moved
      // by hand too, Safari's screen and hit testing part); a plain mouse
      // wheel scrolls the strip only while it can actually move, then returns
      // control to its host. Decided once per gesture (lib/wheel-gesture): a
      // gesture begun by hand keeps every tick by hand, sideways ones too.
      const scroller = gesture.hold(event, () => {
        if (event.deltaX !== 0 || event.deltaY === 0) return null;
        const target = event.target;
        const viewport = target instanceof Element
          ? target.closest<HTMLElement>("[data-office-gallery-viewport]") : null;
        return viewport && root.contains(viewport) && viewport.scrollWidth > viewport.clientWidth ? viewport : null;
      });
      if (!scroller || !scroller.isConnected) return;
      const limit = scroller.scrollWidth - scroller.clientWidth;
      if (limit <= 0) return;
      const multiplier = event.deltaMode === 1 ? 16
        : event.deltaMode === 2 ? scroller.clientWidth : 1;
      const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * multiplier;
      const rtl = getComputedStyle(scroller).direction === "rtl";
      const next = rtl
        ? Math.max(-limit, Math.min(0, scroller.scrollLeft - delta))
        : Math.max(0, Math.min(limit, scroller.scrollLeft + delta));
      // At the strip's end the rest of a gesture begun here is kept (moved
      // by nobody) rather than handed to the browser mid-way.
      event.preventDefault();
      event.stopPropagation();
      if (next !== scroller.scrollLeft) scroller.scrollLeft = next;
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      {...rootProps}
      ref={rootRef}
      className={[styles.gallery, className].filter(Boolean).join(" ")}
      role={role}
      aria-label={ariaLabel}
      data-office-gallery="scrollable"
      data-office-gallery-disclosure={disclosurePlacement}
      data-testid={testId}
      onFocusCapture={(event) => {
        onFocusCapture?.(event);
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const scroller = target.closest<HTMLElement>("[data-office-gallery-viewport]");
        if (!scroller || !event.currentTarget.contains(scroller) || target === scroller) return;
        const viewportBox = scroller.getBoundingClientRect();
        const itemBox = target.getBoundingClientRect();
        if (viewportBox.width <= 0) return;
        const scale = scroller.clientWidth / viewportBox.width;
        const delta = itemBox.left < viewportBox.left ? itemBox.left - viewportBox.left
          : itemBox.right > viewportBox.right ? itemBox.right - viewportBox.right : 0;
        if (delta) scroller.scrollLeft += delta * scale;
      }}
    >
      {cloneElement(viewport, {
        className: [styles.viewport, viewport.props.className].filter(Boolean).join(" "),
        ...{ "data-office-gallery-viewport": "true" },
      })}
      <div className={styles.more} data-office-gallery-footer="true">
        {more}
      </div>
    </div>
  );
}
