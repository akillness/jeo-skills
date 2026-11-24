"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { forwardRef, useImperativeHandle, useState } from "react";

/**
 * The visually-hidden aria-live region of the presentation editor. It owns the
 * announcement text itself, so narrating a slide change or a selection
 * re-renders this one element instead of the whole editor window.
 */
export interface PresentationLiveRegionHandle {
  /** Announce `message`; an identical consecutive message is not re-fired. */
  publish(message: string): void;
  clear(): void;
}

export const PresentationLiveRegion = forwardRef<PresentationLiveRegionHandle>(
  function PresentationLiveRegion(_props, ref) {
    const [announcement, setAnnouncement] = useState("");
    useImperativeHandle(
      ref,
      () => ({
        publish(message) {
          if (!message) return;
          setAnnouncement(message);
        },
        clear() {
          setAnnouncement("");
        },
      }),
      [],
    );
    return (
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="presentation-live-region"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {announcement}
      </div>
    );
  },
);
