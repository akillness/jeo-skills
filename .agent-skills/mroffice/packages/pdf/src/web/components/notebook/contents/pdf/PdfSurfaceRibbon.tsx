"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type ReactNode, type Ref } from "react";
import { usePdfRibbonGroupCommands } from "./PdfOfficeRibbon";
import { PdfRibbonGroupFlyout } from "./PdfRibbonGroupFlyout";
import {
  PDF_RIBBON_COLLAPSIBLE_ATTRIBUTE,
  usePdfRibbonGroupCollapsed,
} from "./pdfRibbonFit";

import {
  OfficeHomeCommandRow,
  OfficeHomeRibbonGroup,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { OfficeRibbonButton } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonChassis.tsx";

import homeStyles from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.module.css";

import anatomyStyles from "./PdfInsertRibbonTab.module.css";
import styles from "./PdfSurfaceRibbon.module.css";














export function PdfSurfaceRibbonGroup({
  ariaBusy,
  children,
  className,
  collapsedIcon,
  controlId,
  dataAttributes,
  eager = false,
  label,
  tab,
  testId,
}: {
  ariaBusy?: boolean;
  children: ReactNode;
  className?: string;
  /** The 24px glyph of the group's one button when the band is too narrow
   * for it (pdfRibbonFit): naming one lets the group collapse. */
  collapsedIcon?: ReactNode;
  controlId?: string;
  /** Extra `data-*` attributes on the group (a state a walkthrough reads). */
  dataAttributes?: Record<`data-${string}`, string | undefined>;
  /** Drawn from the first render, its tab shown or not: for a group that
   * also hosts dialogs other tabs open (More PDF Tools' export, split). */
  eager?: boolean;
  label: string;
  /** The ribbon tab token the group belongs to (`data-pdf-ribbon-tab`). */
  tab: string;
  testId?: string;
}) {
  const ribbon =
    tab;
  const keptCommands = usePdfRibbonGroupCommands(ribbon, children);
  const commands = eager ? children : keptCommands;
  const collapseId = collapsedIcon === undefined ? undefined : (testId ?? label);
  const collapsed = usePdfRibbonGroupCollapsed(collapseId);
  const group = (content: ReactNode, flyout = false) => (
    <OfficeHomeRibbonGroup
      ariaBusy={ariaBusy}
      className={className}
      controlId={flyout ? undefined : controlId}
      dataAttributes={{
        ...dataAttributes,
        "data-pdf-ribbon-label": label,
        "data-pdf-ribbon-tab": tab,
        ...(collapseId !== undefined && !flyout
          ? { [PDF_RIBBON_COLLAPSIBLE_ATTRIBUTE]: collapseId }
          : {}),
        ...(collapsed && !flyout ? { "data-pdf-ribbon-collapsed": "true" } : {}),
      }}
      label={label}
      // A contextual tab's groups carry the `context` token the Office ribbon
      // module keys its group divider on (a group followed by a contextual
      // group keeps its divider); without it the picture tab's first group
      // ran into the next with no divider.
      ribbon={ribbon}
      testId={flyout ? (testId ? `${testId}-flyout-group` : undefined) : testId}
    >
      <OfficeHomeCommandRow className={styles.lane}>{content}</OfficeHomeCommandRow>
    </OfficeHomeRibbonGroup>
  );
  if (collapsed && collapsedIcon !== undefined) {
    return group(
      <PdfRibbonGroupFlyout
        icon={collapsedIcon}
        label={label}
        renderGroup={(content) => group(content, true)}
        renderTrigger={(trigger) => (
          <PdfSurfaceRibbonCommand
            active={trigger.active}
            ariaExpanded={trigger.ariaExpanded}
            ariaHasPopup="dialog"
            buttonRef={trigger.buttonRef}
            icon={trigger.icon}
            label={trigger.label}
            onClick={trigger.onClick}
            testId={trigger.testId}
          />
        )}
        testId={testId}
      >
        {children}
      </PdfRibbonGroupFlyout>,
    );
  }
  return group(commands);
}

export interface PdfSurfaceRibbonCommandProps {
  active?: boolean;
  ariaExpanded?: boolean;
  ariaHasPopup?: "dialog" | "menu";
  busy?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  controlId?: string;
  disabled?: boolean;
  /** Appended to the accessible name while disabled; never to the caption. */
  disabledReason?: string;
  /** Written to `data-disabled-reason` without touching the name, for a
   * command whose name already is the reason. */
  disabledReasonAttribute?: string;
  displayLabel?: string;
  /** A 24px glyph: a shared semantic icon, a PDF ribbon icon or a Lucide one. */
  icon: ReactNode;
  label: string;
  onClick: (trigger: HTMLButtonElement | null) => void;
  testId?: string;
  /** A two-state command always states its state (`aria-pressed` true or
   * false); a plain command carries no pressed state at all. */
  toggle?: boolean;
}








export function PdfSurfaceRibbonCommand({
  active,
  ariaExpanded,
  ariaHasPopup,
  busy,
  buttonRef,
  controlId,
  disabled,
  disabledReason,
  disabledReasonAttribute,
  displayLabel,
  icon,
  label,
  onClick,
  testId,
  toggle = false,
}: PdfSurfaceRibbonCommandProps) {
  const isDisabled = Boolean(disabled || busy);
  // The shared command convention: "label: reason" is the accessible name
  // and title while disabled; the caption stays the bare label.
  const title =
    isDisabled && disabledReason ? `${label}: ${disabledReason}` : label;
  let trigger: HTMLButtonElement | null = null;
  return (
    <OfficeRibbonButton
      active={toggle ? Boolean(active) : active || undefined}
      aria-busy={busy || undefined}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      big
      buttonRef={(node: HTMLButtonElement | null) => {
        trigger = node;
        if (typeof buttonRef === "function") buttonRef(node);
        else if (buttonRef) {
          (buttonRef as { current: HTMLButtonElement | null }).current = node;
        }
      }}
      // `is-active` is the state class every PDF toggle has carried since
      // the toolbar days; hosts and tests read it beside aria-pressed.
      className={`${homeStyles.command} ${homeStyles.commandLarge}${active ? " is-active" : ""}`}
      data-control-id={controlId}
      data-office-anatomy="large"
      data-disabled-reason={
        isDisabled ? (disabledReason ?? disabledReasonAttribute) : undefined
      }
      disabled={isDisabled}
      label={title}
      onClick={() => onClick(trigger)}
      testId={testId}
    >
      <span
        className={`${homeStyles.commandGlyph} ${styles.glyph}`}
        aria-hidden="true"
      >
        {icon}
        {busy ? <span className={anatomyStyles.busySpinner} /> : null}
      </span>
      <span className={homeStyles.commandLabel}>{displayLabel ?? label}</span>
    </OfficeRibbonButton>
  );
}

/** A short read-only line inside a group (a count, a page position, the last
 * message of a command), set in the caption's own size so it never reads as
 * a control. */
export function PdfSurfaceRibbonCaption({
  children,
  role,
  testId,
  title,
}: {
  children: ReactNode;
  role?: "status";
  testId?: string;
  title?: string;
}) {
  return (
    <span
      className={styles.caption}
      data-testid={testId}
      role={role}
      title={title}
    >
      {children}
    </span>
  );
}

/** One labelled field row on the editing surface: a caption (an icon or a
 * word), the shared Office number field or select, and a unit, at the
 * 30px height of one compact command. */
export function PdfSurfaceRibbonFieldRow({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <label
      className={`${styles.fieldRow}${className ? ` ${className}` : ""}`}
      data-testid={testId}
    >
      {children}
    </label>
  );
}

/** A column that holds inline inputs (a swatch row, a slider, a number
 * field) at the height of one large command. */
export function PdfSurfaceRibbonInputs({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={`${styles.inputs}${className ? ` ${className}` : ""}`}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
