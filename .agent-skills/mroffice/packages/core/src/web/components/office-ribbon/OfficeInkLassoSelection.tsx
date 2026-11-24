"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  OfficeFloatingMiniToolbar,
  type OfficeFloatingAnchor,
} from "./OfficeFloatingMiniToolbar";
import type { OfficeTouchCommand } from "./OfficeTouchCommandBar";
import {
  INK_LASSO_HANDLES,
  INK_LASSO_OVERLAY_ATTRIBUTE,
  type InkLassoBox,
  type InkLassoHandle,
} from "../../lib/office-ink-lasso-selection";

import styles from "./OfficeInkLassoSelection.module.css";


















export interface OfficeInkLassoSelectionProps {
  /** The container's extent in the host's unit. */
  readonly space: { readonly width: number; readonly height: number };
  /** The frame around the picked strokes, in the host's unit. */
  readonly box: InkLassoBox;
  readonly label: string;
  /**
   * The selection's commands (Cut, Copy, the conversions, Group, Delete),
   * shown below the frame when the reader taps inside it -- a note-taking
   * app's lasso menu: on an iPad there is no Delete key and no right button.
   * Never shown on its own, so it never stands over the rotation grip.
   */
  readonly commands?: readonly OfficeTouchCommand[];
  readonly commandsLabel?: string;
  readonly testIdPrefix: string;
  /** A press inside the frame: the host moves the strokes. Absent, the press passes through. */
  readonly onPressBody?: (event: ReactPointerEvent<HTMLElement>) => void;
  /** A press on a corner grip: the host scales the strokes. Absent, no grips. */
  readonly onPressHandle?: (handle: InkLassoHandle, event: ReactPointerEvent<HTMLElement>) => void;
  readonly handleLabel?: (handle: InkLassoHandle) => string;
  /**
   * A press on the rotation grip above the frame: the host turns the strokes
   * about the frame's centre. Absent, no rotation grip.
   */
  readonly onPressRotate?: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly rotateLabel?: string;
  /** The turn a rotation shows while it runs (degrees, clockwise): the frame turns with the strokes. */
  readonly rotation?: number;
  /** Escape: the host clears the selection. */
  readonly onDismiss?: () => void;
  readonly zIndex?: number;
  /** Over the viewport (client pixels) instead of filling a container. */
  readonly fixed?: boolean;
}

function percent(value: number, extent: number): string {
  return `${extent > 0 ? (value / extent) * 100 : 0}%`;
}

export function OfficeInkLassoSelection({
  space,
  box,
  label,
  commands = [],
  commandsLabel,
  testIdPrefix,
  onPressBody,
  onPressHandle,
  handleLabel,
  onPressRotate,
  rotateLabel,
  rotation = 0,
  onDismiss,
  zIndex = 9_100,
  fixed = false,
}: OfficeInkLassoSelectionProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  // The commands' menu: a tap inside the frame (pressed and lifted where it
  // landed, at once) opens it; the next press anywhere else, or a command,
  // closes it. Heard at the window: the frame may let presses through to the
  // host's surface (the sheet moves the strokes from there).
  const [menuAt, setMenuAt] = useState<OfficeFloatingAnchor | null>(null);
  const menuOpenRef = useRef(false);
  useEffect(() => {
    menuOpenRef.current = menuAt !== null;
  }, [menuAt]);
  const hasCommands = commands.length > 0;
  useEffect(() => {
    if (!hasCommands) return;
    let press: { x: number; y: number; at: number; id: number; reopen: boolean } | null = null;
    const down = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('[data-ink-lasso-commands="true"]')) return;
      const frame = frameRef.current;
      const rect = frame?.getBoundingClientRect();
      const inside =
        rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom &&
        !target?.closest?.("button");
      press = inside
        ? { x: event.clientX, y: event.clientY, at: event.timeStamp, id: event.pointerId, reopen: !menuOpenRef.current }
        : null;
      setMenuAt(null);
    };
    const up = (event: PointerEvent) => {
      const tap = press;
      press = null;
      if (!tap || !tap.reopen || event.pointerId !== tap.id) return;
      if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8 || event.timeStamp - tap.at > 500) return;
      const rect = frameRef.current?.getBoundingClientRect();
      if (rect) setMenuAt({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
    };
  }, [hasCommands]);

  const measure = useCallback(() => {
    const root = rootRef.current;
    const frame = frameRef.current;
    if (!root || !frame) return;
    // The host may be zoomed (a scaled slide, the document zoom): the line
    // and the grips keep their screen size.
    const zoom = root.offsetWidth > 0 ? root.getBoundingClientRect().width / root.offsetWidth : 1;
    root.style.setProperty("--office-ink-lasso-zoom", String(Number.isFinite(zoom) && zoom > 0 ? zoom : 1));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, box.left, box.top, box.width, box.height, space.width, space.height]);

  useEffect(() => {
    // The page scrolls or the window resizes under the frame: the bar follows.
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [measure]);

  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !onDismissRef.current) return;
      onDismissRef.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);


  const frameStyle: CSSProperties = {
    left: percent(box.left, space.width),
    top: percent(box.top, space.height),
    width: percent(box.width, space.width),
    height: percent(box.height, space.height),
    ...(rotation ? { rotate: `${rotation}deg` } : {}),
  };
  const overlayAttribute = { [INK_LASSO_OVERLAY_ATTRIBUTE]: "true" };
  return (
    <div
      ref={rootRef}
      className={styles.root}
      style={fixed ? { zIndex, position: "fixed" } : { zIndex }}
      data-testid={testIdPrefix}
      {...overlayAttribute}
    >
      <div
        ref={frameRef}
        className={styles.frame}
        style={frameStyle}
        role="group"
        aria-label={label}
        data-testid={`${testIdPrefix}-frame`}
        data-draggable={onPressBody ? "true" : undefined}
        onPointerDown={
          onPressBody
            ? (event) => {
                if (event.button !== 0) return;
                event.stopPropagation();
                onPressBody(event);
              }
            : undefined
        }
      >
        {onPressHandle
          ? INK_LASSO_HANDLES.map((handle) => (
              <button
                key={handle}
                type="button"
                tabIndex={-1}
                className={styles.handle}
                data-handle={handle}
                data-testid={`${testIdPrefix}-handle-${handle}`}
                aria-label={handleLabel?.(handle) ?? handle}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                    onPressHandle(handle, event);
                }}
              />
            ))
          : null}
        {onPressRotate ? (
          // Office's rotation grip: a round grip on a short stem above the
          // frame's top edge, at its middle.
          <button
            type="button"
            tabIndex={-1}
            className={styles.rotate}
            data-testid={`${testIdPrefix}-rotate`}
            aria-label={rotateLabel ?? "Rotate"}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              onPressRotate(event);
            }}
          >
            <svg className={styles.rotateIcon} viewBox="0 0 12 12" aria-hidden="true">
              <path d="M9.6 4.2A4 4 0 1 0 10 7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M10.2 1.6v2.9H7.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>
      {commands.length > 0 ? (
        <OfficeFloatingMiniToolbar
          anchor={menuAt}
          label={commandsLabel ?? label}
          testId={`${testIdPrefix}-commands`}
          prefer="bottom"
          className={styles.commandCard}
        >
          <span className={styles.commands} data-ink-lasso-commands="true" {...overlayAttribute}>
            {commands.map((command) => (
              <button
                key={command.id}
                type="button"
                className={styles.command}
                data-command={command.id}
                data-testid={`${testIdPrefix}-commands-${command.id}`}
                disabled={command.disabled}
                // The selection stays where it is: a press on the menu never
                // reaches the page under it.
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  setMenuAt(null);
                  command.onClick();
                }}
              >
                <LassoCommandIcon id={command.id} />
                <span>{command.label}</span>
              </button>
            ))}
          </span>
        </OfficeFloatingMiniToolbar>
      ) : null}
    </div>
  );
}

/** The lasso command's own small icon, as the pen palette draws its tools (16px, one stroke weight). */
function LassoCommandIcon({ id }: { readonly id: string }): React.JSX.Element | null {
  const path = LASSO_COMMAND_ICONS[id];
  if (!path) return null;
  return (
    <svg className={styles.commandIcon} viewBox="0 0 16 16" aria-hidden="true">
      {path}
    </svg>
  );
}

const LASSO_COMMAND_ICONS: Readonly<Record<string, React.JSX.Element>> = {
  cut: (
    <>
      <circle cx="4.5" cy="11.5" r="2" />
      <circle cx="11.5" cy="11.5" r="2" />
      <path d="M5.9 10 12 2.5M10.1 10 4 2.5" />
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
      <path d="M10.5 5.5V3.6a1.1 1.1 0 0 0-1.1-1.1H3.6a1.1 1.1 0 0 0-1.1 1.1v5.8a1.1 1.1 0 0 0 1.1 1.1h1.9" />
    </>
  ),
  "ink-to-shape": (
    <>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1" />
      <circle cx="10.5" cy="10.5" r="3" />
    </>
  ),
  "ink-to-text": <path d="M3 3.5h10M8 3.5v9.5M6 13h4" />,
  "ink-to-math": <path d="M2 9h2l2 4 3.5-10H14M9.5 8l3.5 5M13 8l-3.5 5" />,
  group: (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" strokeDasharray="2 2" />
      <rect x="4" y="4" width="4" height="4" rx="0.8" />
      <rect x="8" y="8" width="4" height="4" rx="0.8" />
    </>
  ),
  ungroup: (
    <>
      <rect x="2.5" y="2.5" width="5" height="5" rx="1" />
      <rect x="8.5" y="8.5" width="5" height="5" rx="1" />
    </>
  ),
  delete: <path d="M2.5 4.5h11M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4.5M6.8 7v4.5M9.2 7v4.5" />,
};
