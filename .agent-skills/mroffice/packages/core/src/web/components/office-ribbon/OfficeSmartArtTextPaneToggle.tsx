"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Text Pane control on a selected SmartArt graphic's frame: the small tab
 * on the frame's left edge that shows or hides the Text Pane, as Office draws
 * it (Microsoft Support, "Use the Text pane to edit text in a SmartArt
 * graphic": click the control on the left side of the graphic's frame). Every
 * host's frame (Slides, Sheets, Docs) mounts this one control; the host owns
 * the pane's open state.
 */

import { useLayoutEffect, useRef } from "react";
import { useTranslations } from "../../../host/next-intl";

import { ChevronLeft, ChevronRight } from "./icons/houseIcons";

import styles from "./OfficeSmartArtDesignTab.module.css";

export function OfficeSmartArtTextPaneToggle({
  open,
  onToggle,
  testId,
}: {
  open: boolean;
  onToggle: () => void;
  testId: string;
}) {
  const t = useTranslations("console-notebooks");
  const label = t(
    open
      ? "presentation.smartartContext.menu.hideTextPane"
      : "presentation.smartartContext.menu.showTextPane",
  );
  return (
    <button
      type="button"
      className={styles.textPaneToggle}
      data-open={open ? "true" : undefined}
      data-smartart-text-pane-toggle
      aria-label={label}
      aria-pressed={open}
      title={label}
      data-testid={testId}
      // A press on the tab is not a press on the frame: no drag, no reselect.
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {open ? <ChevronRight size={12} aria-hidden="true" /> : <ChevronLeft size={12} aria-hidden="true" />}
    </button>
  );
}

/**
 * The same control for a host whose frame it cannot render into (a Docs
 * diagram is drawn by the document's node view): it stands on the left edge
 * of the frame `anchor` finds, and follows it through scrolls and drags.
 */
export function OfficeAnchoredSmartArtTextPaneToggle({
  anchor,
  ...props
}: {
  anchor: () => Element | null;
  open: boolean;
  onToggle: () => void;
  testId: string;
}) {
  const host = useRef<HTMLSpanElement | null>(null);
  const anchorRef = useRef(anchor);
  useLayoutEffect(() => {
    anchorRef.current = anchor;
  });
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const target = anchorRef.current();
      if (!target?.isConnected) {
        element.style.display = "none";
        return;
      }
      element.style.display = "";
      if (!element.style.left) {
        element.style.left = "0px";
        element.style.top = "0px";
      }
      const drawn = element.getBoundingClientRect();
      const originX = drawn.left - parseFloat(element.style.left);
      const originY = drawn.top - parseFloat(element.style.top);
      const frameRect = target.getBoundingClientRect();
      element.style.left = `${Math.round(frameRect.left - originX)}px`;
      element.style.top = `${Math.round(frameRect.top - originY)}px`;
      element.style.height = `${Math.round(frameRect.height)}px`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("pointermove", schedule, { capture: true, passive: true });
    window.addEventListener("pointerup", schedule, { capture: true });
    const timer = window.setInterval(schedule, 500);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("pointermove", schedule, { capture: true });
      window.removeEventListener("pointerup", schedule, { capture: true });
      window.clearInterval(timer);
    };
  }, []);
  return (
    <span ref={host} className={styles.textPaneToggleHost}>
      <OfficeSmartArtTextPaneToggle {...props} />
    </span>
  );
}
