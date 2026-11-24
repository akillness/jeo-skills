"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePopupPortalTarget } from "../ui/portal-host";

/**
 * The mini toolbar over a text selection (Word / PowerPoint's Mini Toolbar,
 * the Docs editor's floating toolbar). Two parts:
 *
 * - the look: `OfficeFloatingMiniToolbarButton` / `...Divider`, the Docs
 *   floating toolbar's own buttons (`floating-toolbar-*` in note-editor.css),
 *   which Docs' TipTap-bound command set (console/editor/FloatingToolbar)
 *   renders inside TipTap's BubbleMenu;
 * - the positioned shell, `OfficeFloatingMiniToolbar`, for an editor whose
 *   selection is not a ProseMirror one (a slide's text box): it takes the
 *   selection's rect in viewport pixels, sits centred above it (below when
 *   there is no room), stays inside the viewport, and scales in with the
 *   shared `office-scale-in` motion. A press on it never takes the focus, so
 *   the selection it formats stays selected.
 */

/** The gap between the selection and the toolbar, in CSS pixels. */
export const OFFICE_FLOATING_MINI_TOOLBAR_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;

export interface OfficeFloatingAnchor {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where the toolbar's top-left goes: centred over the anchor, above it when
 * it fits, else below; clamped into the viewport.
 */
export function officeFloatingMiniToolbarPosition(
  anchor: OfficeFloatingAnchor,
  size: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  gap = OFFICE_FLOATING_MINI_TOOLBAR_GAP_PX,
  /** Which side to try first (above, unless the anchor has something there of its own). */
  prefer: "top" | "bottom" = "top",
): { left: number; top: number; placement: "top" | "bottom" } {
  const above = anchor.top - gap - size.height;
  const belowFits = anchor.top + anchor.height + gap + size.height <= viewport.height - VIEWPORT_MARGIN_PX;
  const placement =
    prefer === "bottom"
      ? belowFits || above < VIEWPORT_MARGIN_PX
        ? "bottom"
        : "top"
      : above >= VIEWPORT_MARGIN_PX
        ? "top"
        : "bottom";
  const top =
    placement === "top"
      ? above
      : Math.min(
          anchor.top + anchor.height + gap,
          Math.max(VIEWPORT_MARGIN_PX, viewport.height - size.height - VIEWPORT_MARGIN_PX),
        );
  const centred = anchor.left + anchor.width / 2 - size.width / 2;
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN_PX, centred),
    Math.max(VIEWPORT_MARGIN_PX, viewport.width - size.width - VIEWPORT_MARGIN_PX),
  );
  return { left: Math.round(left), top: Math.round(top), placement };
}

export function OfficeFloatingMiniToolbar({
  anchor,
  label,
  testId,
  children,
  prefer = "top",
  className,
}: {
  /** The selection's rect in viewport pixels; null hides the toolbar. */
  readonly anchor: OfficeFloatingAnchor | null;
  readonly label: string;
  readonly testId?: string;
  readonly children: ReactNode;
  /** Below the anchor first: something of the selection's own stands above it (a rotation grip). */
  readonly prefer?: "top" | "bottom";
  /** A look of the caller's own on the shell (the ink lasso's command card). */
  readonly className?: string;
}): React.JSX.Element | null {
  const popupPortalTarget = usePopupPortalTarget();
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{
    readonly anchor: OfficeFloatingAnchor;
    readonly left: number;
    readonly top: number;
    readonly placement: "top" | "bottom";
  } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!anchor || !element) return;
    const next = officeFloatingMiniToolbarPosition(
      anchor,
      { width: element.offsetWidth, height: element.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      undefined,
      prefer,
    );
    setPosition((current) =>
      current &&
      current.anchor === anchor &&
      current.left === next.left &&
      current.top === next.top
        ? current
        : { anchor, ...next },
    );
  }, [anchor, prefer]);
  if (!anchor || typeof document === "undefined") return null;
  const placed = position?.anchor === anchor ? position : null;
  return createPortal(
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      className={`floating-toolbar office-scale-in${className ? ` ${className}` : ""}`}
      data-motion-exit="pop"
      data-testid={testId}
      data-placement={placed?.placement}
      style={{
        position: "fixed",
        left: placed?.left ?? anchor.left,
        top: placed?.top ?? anchor.top,
        // Measured first, then shown where it belongs: no jump.
        visibility: placed ? undefined : "hidden",
        transformOrigin: placed?.placement === "bottom" ? "top center" : "bottom center",
      }}
      // Keep the focus (and so the selection) in the text being formatted.
      onMouseDown={(event: ReactMouseEvent) => event.preventDefault()}
    >
      {children}
    </div>,
    popupPortalTarget ?? document.body,
  );
}

export function OfficeFloatingMiniToolbarButton({
  label,
  active = false,
  disabled,
  className,
  testId,
  onClick,
  onMouseDown,
  children,
}: {
  readonly label: string;
  readonly active?: boolean | "mixed";
  readonly disabled?: boolean;
  /** Extra classes (Docs: the AI button's accent). */
  readonly className?: string;
  readonly testId?: string;
  readonly onClick: () => void;
  readonly onMouseDown?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`floating-toolbar-btn${className ? ` ${className}` : ""}${active === true ? " is-active" : ""}`}
      data-testid={testId}
      disabled={disabled}
      onMouseDown={onMouseDown}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function OfficeFloatingMiniToolbarDivider(): React.JSX.Element {
  return <span className="floating-toolbar-divider" />;
}
