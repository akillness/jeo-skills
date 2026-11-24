"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";

import { OfficeRibbonButton } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonChassis.tsx";
import homeStyles from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.module.css";

export interface PdfRibbonButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children" | "className" | "onClick" | "onMouseDown"
> {
  active?: boolean;
  big?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
  className?: string;
  displayLabel?: ReactNode;
  label: string;
  onClick: () => void;
  testId?: string;
  /** A toggle names its off state (`aria-pressed="false"`) instead of dropping the attribute. */
  toggle?: boolean;
  /** A compact face that shows its caption beside the glyph (Office's small command). */
  captioned?: boolean;
}




















export default function PdfRibbonButton({
  active,
  big = true,
  buttonRef,
  children,
  className,
  disabled,
  displayLabel,
  label,
  onClick,
  testId,
  toggle = false,
  captioned = false,
  ...buttonProps
}: PdfRibbonButtonProps) {
  return (
    <OfficeRibbonButton
      {...buttonProps}
      active={toggle ? Boolean(active) : active || undefined}
      big={big}
      buttonRef={buttonRef}
      className={`${homeStyles.command} ${big ? homeStyles.commandLarge : homeStyles.commandCompact}${className ? ` ${className}` : ""}`}
      data-office-anatomy={big ? "large" : "compact"}
      disabled={disabled}
      label={label}
      onClick={onClick}
      testId={testId}
    >
      {big || captioned ? (
        <>
          <span className={homeStyles.commandGlyph} aria-hidden="true">
            {children}
          </span>
          <span className={homeStyles.commandLabel}>{displayLabel ?? label}</span>
        </>
      ) : (
        children
      )}
    </OfficeRibbonButton>
  );
}

/** The compact command face of the Office ribbon module, for a command the
 * PDF tools host draws as a plain button of its own. */
export const PDF_RIBBON_TOOL_CLASS = `office-ribbon-control note-editor-office-toolbar__button ${homeStyles.command} ${homeStyles.commandCompact}`;

/**
 * A command of the Featured tab's tools host (More PDF tools): the plain button
 * it always was, every attribute and ref its own, in the compact Office face
 * instead of the pills these commands wore.
 */
export const PdfRibbonToolButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; icon?: ReactNode }
>(function PdfRibbonToolButton({ active, children, className, icon, ...buttonProps }, ref) {
  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      className={`${PDF_RIBBON_TOOL_CLASS}${active ? " is-active" : ""}${className ? ` ${className}` : ""}`}
      data-office-anatomy="compact"
      data-office-control-part="button"
    >
      {icon ? (
        <span className={homeStyles.commandGlyph} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={homeStyles.commandLabel}>{children}</span>
    </button>
  );
});
