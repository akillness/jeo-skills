"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useMemo, useRef } from "react";

import {
  OfficeFloatingMiniToolbar,
  type OfficeFloatingAnchor,
} from "./OfficeFloatingMiniToolbar";

import styles from "./OfficeTouchCommandBar.module.css";

/**
 * The command bar Office shows on a touch screen when the selection is
 * tapped again (Excel / Word for iPad and Android: Cut, Copy, Paste, Clear,
 * Fill …): a row of worded commands, each a full 44px touch target, in the
 * glass shell of the mini toolbar. It closes after a command, on a press
 * anywhere outside it, on Escape and when the page scrolls.
 *
 * Editor-agnostic: a host hands in worded commands and where to stand (a
 * rect in viewport pixels, or the element to stand over).
 */
export interface OfficeTouchCommand {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

export function OfficeTouchCommandBar({
  anchor,
  label,
  commands,
  testIdPrefix,
  onClose,
}: {
  /** What to stand over: a rect in viewport pixels, or an element (measured
   * when the anchor changes); null hides the bar. */
  readonly anchor: OfficeFloatingAnchor | Element | null;
  readonly label: string;
  readonly commands: readonly OfficeTouchCommand[];
  /** `${prefix}` for the bar, `${prefix}-${id}` for each command. */
  readonly testIdPrefix: string;
  readonly onClose: () => void;
}): React.JSX.Element | null {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const rect = useMemo<OfficeFloatingAnchor | null>(() => {
    if (!anchor) return null;
    if (typeof Element !== "undefined" && anchor instanceof Element) {
      const box = anchor.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height };
    }
    return anchor as OfficeFloatingAnchor;
  }, [anchor]);
  const open = rect !== null;
  useEffect(() => {
    if (!open) return;
    const close = () => onCloseRef.current();
    const outside = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(`[data-testid="${testIdPrefix}"]`)) return;
      close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, testIdPrefix]);
  return (
    <OfficeFloatingMiniToolbar anchor={rect} label={label} testId={testIdPrefix}>
      {commands.map((command) => (
        <button
          key={command.id}
          type="button"
          className={styles.command}
          data-testid={`${testIdPrefix}-${command.id}`}
          disabled={command.disabled}
          onClick={() => {
            onCloseRef.current();
            command.onClick();
          }}
        >
          {command.label}
        </button>
      ))}
    </OfficeFloatingMiniToolbar>
  );
}
