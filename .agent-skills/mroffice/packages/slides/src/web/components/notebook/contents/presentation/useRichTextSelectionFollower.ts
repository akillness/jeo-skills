"use client";






















/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useRef } from "react";

import { OFFICE_FORMAT_PREVIEW_ATTRIBUTE } from "@mrnote/core/web/components/office-ribbon/officeFormatPreview.tsx";

export function useRichTextSelectionFollower(
  /** The host now drawn, or null. */
  host: () => HTMLElement | null,
  /** Record the host's selection (a no-op when it is the one recorded). */
  follow: (host: HTMLElement) => void,
  /** Whether the host is being typed in. */
  active: boolean,
): void {
  const hostRef = useRef(host);
  const followRef = useRef(follow);
  useEffect(() => {
    hostRef.current = host;
    followRef.current = follow;
  });
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const doc = document;
    const view = doc.defaultView;
    let pressed = false;
    let pressedInHost = false;
    let frame = 0;
    const read = () => {
      frame = 0;
      const current = hostRef.current();
      if (!current?.isConnected) return;
      const focused = doc.activeElement;
      if (!focused || !current.contains(focused)) return;
      if (current.querySelector(`[${OFFICE_FORMAT_PREVIEW_ATTRIBUTE}]`)) return;
      const selection = doc.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!current.contains(range.startContainer) || !current.contains(range.endContainer)) return;
      followRef.current(current);
    };
    const schedule = () => {
      if (frame || !view) return;
      frame = view.requestAnimationFrame(read);
    };
    const onPointerDown = (event: Event) => {
      pressed = true;
      const target = event.target;
      pressedInHost = target instanceof Node && !!hostRef.current()?.contains(target);
    };
    const onPointerUp = () => {
      pressed = false;
      if (pressedInHost) schedule();
      pressedInHost = false;
    };
    const onSelectionChange = () => {
      if (!pressed) schedule();
    };
    doc.addEventListener("pointerdown", onPointerDown, true);
    doc.addEventListener("pointerup", onPointerUp, true);
    doc.addEventListener("pointercancel", onPointerUp, true);
    doc.addEventListener("selectionchange", onSelectionChange);
    return () => {
      doc.removeEventListener("pointerdown", onPointerDown, true);
      doc.removeEventListener("pointerup", onPointerUp, true);
      doc.removeEventListener("pointercancel", onPointerUp, true);
      doc.removeEventListener("selectionchange", onSelectionChange);
      if (frame && view) view.cancelAnimationFrame(frame);
    };
  }, [active]);
}
