"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ChevronDown } from "../office-ribbon/icons/houseIcons";
import {
  cloneElement,
  createContext,
  type AriaAttributes,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./dropdown-menu";

import styles from "./ContinuousZoomDialPopover.module.css";

type CrownStyle = CSSProperties & {
  "--continuous-zoom-crown-position": string;
};

/**
 * Set inside a zoom popover: a ContinuousZoomDial rendered there lays out as
 * a panel (stepper, levels, field at once) instead of a capsule that would
 * open a second menu.
 */
export const ContinuousZoomPanelContext = createContext(false);

export interface ContinuousZoomCrownGlyphProps {
  /** Unit position in the caller's mapping; the glyph never owns zoom state. */
  position: number;
  /** Caller-formatted value such as `125%` or `1.2x`. */
  valueLabel: string;
  open?: boolean;
  className?: string;
  testId?: string;
}

function clampCrownPosition(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Presentational reading for an editor-owned zoom button: the value and a
 * disclosure chevron, with a hairline showing where it sits in the range.
 * The host retains its native button, command id, tooltip and
 * disabled-reason semantics. (The name is kept from the dial it replaced.)
 */
export function ContinuousZoomCrownGlyph({
  position,
  valueLabel,
  open = false,
  className,
  testId,
}: ContinuousZoomCrownGlyphProps) {
  const style = {
    "--continuous-zoom-crown-position": `${clampCrownPosition(position) * 100}%`,
  } as CrownStyle;
  return (
    <span
      aria-hidden="true"
      className={className ? `${styles.crown} ${className}` : styles.crown}
      data-open={open ? "true" : undefined}
      data-testid={testId}
      style={style}
    >
      <span className={styles.crownValue}>{valueLabel}</span>
      <ChevronDown
        className={styles.crownChevron}
        size={11}
        strokeWidth={2.2}
        aria-hidden="true"
      />
    </span>
  );
}

export interface ContinuousZoomDialPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ref owned by the caller and attached to `trigger`. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Existing editor button. Radix composes its props/ref through `asChild`. */
  trigger: ReactElement<{
    "aria-haspopup"?: AriaAttributes["aria-haspopup"];
  }>;
  children: ReactNode;
  label: string;
  testIdPrefix: string;
  direction?: "ltr" | "rtl";
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  collisionPadding?: number;
  className?: string;
}

/**
 * Controlled, non-modal body portal around a caller-owned zoom button.
 * Radix Popper owns anchoring, flip/collision and live scroll/resize updates;
 * this adapter only supplies zoom-dialog semantics and deterministic focus.
 */
export function ContinuousZoomDialPopover({
  open,
  onOpenChange,
  anchorRef,
  trigger,
  children,
  label,
  testIdPrefix,
  direction = "ltr",
  align = "center",
  side = "bottom",
  sideOffset = 6,
  collisionPadding = 8,
  className,
}: ContinuousZoomDialPopoverProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const dialogTrigger = cloneElement(trigger, { "aria-haspopup": "dialog" });
  useEffect(() => {
    if (!open) return;
    // DropdownMenu performs its own content autofocus after mount. Move from
    // that temporary container focus into the real reading on the next task,
    // or, in a list of levels without one, onto the level now in use.
    const timer = window.setTimeout(() => {
      const content = contentRef.current;
      const target =
        content?.querySelector<HTMLElement>(
          '[role="slider"]:not([aria-disabled="true"])',
        ) ??
        content?.querySelector<HTMLElement>('[data-zoom-focus="true"]') ??
        content?.querySelector<HTMLElement>("button:not(:disabled)");
      target?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);
  return (
    <DropdownMenu
      dir={direction}
      modal={false}
      open={open}
      onOpenChange={onOpenChange}
    >
      <DropdownMenuTrigger asChild>{dialogTrigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        ref={contentRef}
        role="dialog"
        aria-modal="false"
        aria-label={label}
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        avoidCollisions
        sticky="always"
        updatePositionStrategy="always"
        className={
          className ? `${styles.popover} ${className}` : styles.popover
        }
        data-testid={`${testIdPrefix}-zoom-popover`}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const anchor = anchorRef.current;
          if (anchor?.isConnected) anchor.focus({ preventScroll: true });
        }}
      >
        <div
          className={styles.interaction}
          onKeyDown={(event) => {
            // The embedded reading owns its arrows/Home/End and the levels
            // their Tab order (a menu would swallow Tab and typeahead).
            // Escape must keep bubbling to Radix so the popover closes.
            if (event.key !== "Escape") event.stopPropagation();
          }}
        >
          <ContinuousZoomPanelContext.Provider value>
            {children}
          </ContinuousZoomPanelContext.Provider>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
