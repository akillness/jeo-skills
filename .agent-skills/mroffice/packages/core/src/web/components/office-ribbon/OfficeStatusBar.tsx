"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle } from "lucide-react";
import {
  CircleAlert,
  CircleCheck,
} from "./icons/houseIcons";

import { ContinuousZoomDial } from "../ui/ContinuousZoomDial";
import {
  editorZoomPercentFromPosition,
  editorZoomPositionFromPercent,
} from "../../lib/editor-zoom";

import { useOfficeScreenTipRegion } from "./OfficeScreenTipProvider";
import { useTransferWhile } from "../../lib/transfer-progress";

import styles from "./OfficeStatusBar.module.css";












export type OfficeStatusBarData = Readonly<
  Record<`data-${string}`, string | undefined>
>;

export interface OfficeStatusBarProps {
  readonly left?: ReactNode;
  readonly status?: ReactNode;
  readonly zoom?: ReactNode;
  readonly right?: ReactNode;
  /** After the right slot: popovers or dialogs anchored to the bar. */
  readonly children?: ReactNode;
  /** The editor's own skin classes, beside the shared defaults. */
  readonly className?: string;
  /** A full-width strip at the window's bottom edge instead of a pill. */
  readonly docked?: boolean;
  readonly portalTarget?: HTMLElement | null;
  readonly ariaLive?: "polite" | "assertive" | "off";
  readonly style?: CSSProperties;
  readonly testId?: string;
  /** Extra data-* attributes (e.g. data-document-chrome="bottom"). */
  readonly data?: OfficeStatusBarData;
}

export function OfficeStatusBar({
  left,
  status,
  zoom,
  right,
  children,
  className,
  docked,
  portalTarget,
  ariaLive = "polite",
  style,
  testId,
  data,
}: OfficeStatusBarProps): React.JSX.Element {
  // Inside an editor's ScreenTip provider, the bar's buttons show the card.
  const screenTipRegion = useOfficeScreenTipRegion();
  const bar = (
    <div
      className={className ? `${styles.bar} ${className}` : styles.bar}
      {...screenTipRegion}
      {...data}
      data-office-status-docked={docked ? "true" : undefined}
      data-office-status-bar=""
      data-testid={testId}
      aria-live={ariaLive}
      style={style}
    >
      {left ? <span className={styles.left}>{left}</span> : null}
      {status}
      {zoom}
      {right}
      {children}
    </div>
  );
  return portalTarget ? createPortal(bar, portalTarget) : bar;
}

export type OfficeStatusPhase = "preparing" | "ready" | "failed";

export interface OfficeStatusProgressProps {
  readonly phase: OfficeStatusPhase;
  readonly label: ReactNode;
  /** The editor's own skin classes, beside the shared defaults. */
  readonly className?: string;
  /** Hover text (the full error of a failed phase). */
  readonly title?: string;
  readonly testId?: string;
  readonly data?: OfficeStatusBarData;
  /** While preparing, also show this on the line at the top of the window
   * (an export: the chip down here alone is easy to miss). */
  readonly transferName?: string;
}

/**
 * A status chip with its phase glyph: a spinning loader while preparing, a
 * check when ready, an alert when failed (announced assertively). The spin
 * is the shared `office-spin` utility, still under reduced motion.
 */
export function OfficeStatusProgress({
  phase,
  label,
  className,
  title,
  testId,
  data,
  transferName,
}: OfficeStatusProgressProps): React.JSX.Element {
  useTransferWhile(phase === "preparing" ? transferName : null);
  return (
    <span
      className={className ? `${styles.progress} ${className}` : styles.progress}
      role="status"
      aria-live={phase === "failed" ? "assertive" : "polite"}
      data-testid={testId}
      data-office-status-phase={phase}
      {...data}
      title={title}
    >
      {phase === "preparing" ? (
        <LoaderCircle size={13} aria-hidden="true" className="office-spin" />
      ) : phase === "ready" ? (
        <CircleCheck size={13} aria-hidden="true" />
      ) : (
        <CircleAlert size={13} aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}

export interface OfficeStatusZoomDialProps {
  /** Current zoom in percent (100 = 100%). */
  readonly percent: number;
  readonly minPercent: number;
  readonly maxPercent: number;
  readonly defaultPercent: number;
  /** Sets the zoom (percent) while the slider moves and when it settles. */
  readonly onZoom: (percent: number) => void;
  readonly label: string;
  readonly resetLabel: string;
  /** Test ids: `${prefix}-zoom-dial` (the thumb), `${prefix}-zoom-popover`, … */
  readonly testIdPrefix: string;
  readonly disabled?: boolean;
  /** Kept for hosts that still pass them: the status bar's zoom is a slider
   *  now, with no trigger button to dress and the shared levels menu. */
  readonly triggerClassName?: string;
  readonly popoverClassName?: string;
  readonly side?: "top" | "bottom";
  readonly align?: "start" | "center" | "end";
}

const formatPercent = (percent: number) => `${Math.round(percent)}%`;
const percentAriaValueNow = (percent: number) => Number(percent.toFixed(2));
const noCommitSideEffect = () => undefined;

/**
 * The status bar's zoom, as Word, Excel and PowerPoint put it there: a
 * slider. Its thumb reads the percentage and drags the zoom; a click on it
 * opens the levels (reset, the usual percentages, a typed one). Arrows,
 * Page Up/Down and Home/End work on the thumb; the editor's own Ctrl/Cmd
 * shortcuts are untouched.
 */
export function OfficeStatusZoomDial({
  percent,
  minPercent,
  maxPercent,
  defaultPercent,
  onZoom,
  label,
  resetLabel,
  testIdPrefix,
  disabled = false,
  side = "top",
  align = "end",
}: OfficeStatusZoomDialProps): React.JSX.Element {
  const range = maxPercent - minPercent;
  return (
    <ContinuousZoomDial
      value={percent}
      min={minPercent}
      max={maxPercent}
      defaultValue={defaultPercent}
      valueToPosition={editorZoomPositionFromPercent}
      positionToValue={editorZoomPercentFromPosition}
      formatter={formatPercent}
      ariaValueText={formatPercent}
      ariaValueNow={percentAriaValueNow}
      label={label}
      resetLabel={resetLabel}
      disabled={disabled}
      resetDisabled={disabled || Math.round(percent) === Math.round(defaultPercent)}
      testIdPrefix={testIdPrefix}
      className={styles.zoomSlider}
      menuSide={side}
      menuAlign={align}
      onPreview={onZoom}
      onChange={onZoom}
      onCommit={noCommitSideEffect}
      keyboardPositionStep={range > 0 ? 1 / range : undefined}
      keyboardPagePositionStep={range > 0 ? 10 / range : undefined}
    />
  );
}
