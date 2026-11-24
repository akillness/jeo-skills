"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Ribbon layout wrappers that draw Office Home ribbon markup (group, command
 * row, font command, split layout) when `home` is set and the legacy toolbar
 * markup otherwise.
 *
 * Moved verbatim out of `components/notebook/contents/PresentationWindow.tsx`
 * (structural split, no behaviour change).
 */

import type { ReactNode } from "react";
import {
  OfficeHomeCommand,
  OfficeHomeCommandRow,
  OfficeHomeRibbonGroup,
  OfficeHomeSplitLayout,
  type OfficeHomeGroupSize,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import type { OfficeRibbonGroupLauncher } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonChassis.tsx";
import {
  officeFormatPreviewHandlers,
  useOfficeFormatPreview,
  type OfficeFormatPreviewPatch,
} from "@mrnote/core/web/components/office-ribbon/officeFormatPreview.tsx";

export function PresentationHomeAwareGroup({
  home,
  label,
  homeSize = "content",
  legacyClassName,
  launcher,
  children,
}: {
  home: boolean;
  label: string;
  homeSize?: OfficeHomeGroupSize;
  legacyClassName?: string;
  /** The group's dialog launcher (Font, Paragraph), on the Home layout. */
  launcher?: OfficeRibbonGroupLauncher;
  children: ReactNode;
}) {
  if (home) {
    return (
      <OfficeHomeRibbonGroup
        label={label}
        size={homeSize}
        className={legacyClassName}
        launcher={launcher}
      >
        {children}
      </OfficeHomeRibbonGroup>
    );
  }
  return (
    <div
      className={`note-editor-office-toolbar__group${
        legacyClassName ? ` ${legacyClassName}` : ""
      }`}
      data-ribbon-label={label}
    >
      {children}
    </div>
  );
}

export function PresentationHomeAwareCommandRow({
  home,
  children,
}: {
  home: boolean;
  children: ReactNode;
}) {
  return home ? (
    <OfficeHomeCommandRow>{children}</OfficeHomeCommandRow>
  ) : (
    <div className="note-editor-ribbon-row">{children}</div>
  );
}

export function PresentationHomeAwareFontCommand({
  home,
  active,
  controlId,
  disabled,
  icon,
  label,
  onClick,
  testId,
  formatPreview,
  textFormatControl,
}: {
  home: boolean;
  active?: boolean | "mixed";
  controlId?: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
  /** Live Preview of a format toggle (see OfficeHomeCommand). */
  formatPreview?: OfficeFormatPreviewPatch | null;
  /** The command formats characters (see OfficeHomeCommand). */
  textFormatControl?: boolean;
}) {
  const preview = useOfficeFormatPreview();
  if (home) {
    return (
      <OfficeHomeCommand
        variant="icon"
        active={active}
        controlId={controlId}
        disabled={disabled}
        icon={icon}
        label={label}
        onClick={onClick}
        testId={testId}
        formatPreview={formatPreview}
        textFormatControl={textFormatControl}
      />
    );
  }
  return (
    <button
      type="button"
      className={`office-ribbon-control ${(`note-editor-office-toolbar__button${
        active ? " is-active" : ""
      }`)}`} data-office-control-part="button"
      disabled={disabled}
      {...officeFormatPreviewHandlers(preview, disabled ? null : formatPreview)}
      data-office-text-format-control={
        textFormatControl || formatPreview !== undefined ? "true" : undefined
      }
      onClick={() => {
        preview.clearPreview();
        onClick();
      }}
      aria-pressed={active}
      aria-label={label}
      title={label}
      data-control-id={controlId}
      data-testid={testId}
    >
      {icon}
    </button>
  );
}

export function PresentationHomeAwareSplitLayout({
  home,
  primary,
  trigger,
  className,
  controlId,
  testId,
}: {
  home: boolean;
  primary: ReactNode;
  trigger: ReactNode;
  className?: string;
  controlId?: string;
  testId?: string;
}) {
  return (
    <span
      data-control-id={controlId}
      data-presentation-home-split={home ? "true" : "false"}
      style={{ display: "contents" }}
    >
      <OfficeHomeSplitLayout
        primary={primary}
        trigger={trigger}
        className={className}
        testId={testId}
      />
    </span>
  );
}
