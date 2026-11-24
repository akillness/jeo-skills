"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createContext, forwardRef, useContext, type ReactNode } from "react";

import {
  OfficeRibbonGroup,
  RibbonHStack,
  type OfficeRibbonStripProps,
} from "@mrnote/core/web/components/office-ribbon/OfficeRibbonChassis.tsx";
import {
  OfficeHomeCommand,
  OfficeHomeMenuTrigger,
  OfficeHomeRibbonGroup,
  type OfficeHomeMenuTriggerProps,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { OfficeRibbonSurfaceStrip } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonSurfaceStrip.tsx";
import { OfficeRibbonQuickStrip } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonQuickStrip.tsx";
import {
  OfficeEditorActionRail,
  type OfficeEditorActionRailProps,
} from "@mrnote/core/web/components/office-ribbon/OfficeEditorActionRail.tsx";
import { CodeRibbonIcon } from "./CodeRibbonIcons";

/**
 * Keep the visible command name authoritative while exposing the exact reason
 * a disabled command cannot run. Enabled badges remain announced because they
 * carry live command state (for example, the number of comparison changes).
 */
export function codeCommandAccessibleLabel({
  badge,
  disabled,
  disabledReason,
  label,
}: {
  badge?: number;
  disabled: boolean;
  disabledReason?: string;
  label: string;
}): string {
  if (disabled && disabledReason) return `${label}: ${disabledReason}`;
  if (badge && badge > 0) return `${label}: ${badge}`;
  return label;
}

/**
 * Code-specific authority adapter hosted by the shared Office command face.
 */
export function CodeRibbonAction({
  big = false,
  icon,
  label,
  onClick,
  pressed,
  expanded,
  disabled = false,
  disabledReason,
  badge,
  testId,
  keyShortcuts,
  title,
}: {
  big?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  badge?: number;
  testId: string;
  keyShortcuts?: string;
  /** Tooltip and accessible name when they say more than the visible label. */
  title?: string;
}) {
  return (
    <OfficeHomeCommand
      active={pressed}
      ariaExpanded={expanded}
      badge={badge}
      disabled={disabled}
      disabledReason={disabledReason}
      displayLabel={label}
      icon={icon}
      keyShortcuts={keyShortcuts}
      label={title ?? label}
      onClick={onClick}
      testId={testId}
      variant={big ? "large" : "compact"}
    />
  );
}

/**
 * Ref-forwarding Code adapter for shared Office menu/toggle faces. Radix menu
 * triggers and Code-owned panel toggles retain their exact ARIA attributes and
 * handlers while using the same command anatomy as the other editors.
 */
export const CodeRibbonMenuAction = forwardRef<
  HTMLButtonElement,
  OfficeHomeMenuTriggerProps
>(function CodeRibbonMenuAction({ disabled, disabledReason, ...props }, ref) {
  return (
    <OfficeHomeMenuTrigger
      {...props}
      ref={ref}
      disabled={disabled}
      disabledReason={disabledReason}
      data-disabled-reason={
        disabled && disabledReason ? disabledReason : undefined
      }
    />
  );
});

const CodeRibbonActiveTabContext = createContext("home");

/** Structural group contract shared by standalone code and multi-buffer host ribbons. */
export function CodeRibbonGroup({
  label,
  testId,
  children,
  layout = "grid",
}: {
  label: string;
  testId: string;
  children: ReactNode;
  layout?: "grid" | "hstack";
}) {
  const activeTab = useContext(CodeRibbonActiveTabContext);
  const content =
    layout === "hstack" ? (
      <RibbonHStack>{children}</RibbonHStack>
    ) : (
      <div className="note-editor-ribbon-grid">{children}</div>
    );

  if (activeTab === "home") {
    return (
      <OfficeHomeRibbonGroup label={label} ribbon={activeTab} testId={testId}>
        {content}
      </OfficeHomeRibbonGroup>
    );
  }

  return (
    <OfficeRibbonGroup label={label} ribbon={activeTab} testId={testId}>
      {content}
    </OfficeRibbonGroup>
  );
}

/**
 * Docs-style title-row quick actions: undo/redo, then the host action tail,
 * the same at every window width.
 */
export function CodeRibbonQuickActions({
  canRedo,
  canUndo,
  children,
  onRedo,
  onUndo,
  overflowLabel,
  redoLabel,
  undoLabel,
  testIdPrefix = "code",
  actionRail,
}: {
  canRedo: boolean;
  canUndo: boolean;
  children: ReactNode;
  onRedo: () => void;
  onUndo: () => void;
  overflowLabel: string;
  redoLabel: string;
  undoLabel: string;
  testIdPrefix?: string;
  actionRail?: Pick<
    OfficeEditorActionRailProps,
    "leading" | "search" | "save" | "ai" | "primary" | "trailing"
  >;
}) {
  if (actionRail) {
    return (
      <OfficeEditorActionRail
        {...actionRail}
        undo={{
          label: undoLabel,
          onClick: onUndo,
          disabled: !canUndo,
          testId: `${testIdPrefix}-quick-undo`,
          keyShortcuts: "Control+Z Meta+Z",
        }}
        redo={{
          label: redoLabel,
          onClick: onRedo,
          disabled: !canRedo,
          testId: `${testIdPrefix}-quick-redo`,
          keyShortcuts: "Control+Shift+Z Meta+Shift+Z",
        }}
        overflow={children}
        overflowLabel={overflowLabel}
        testIds={{
          strip: `${testIdPrefix}-toolbar-quick-actions`,
          overflow: `${testIdPrefix}-toolbar-quick-overflow`,
          overflowPanel: `${testIdPrefix}-toolbar-quick-overflow-panel`,
        }}
      />
    );
  }
  return (
    <OfficeRibbonQuickStrip
      ariaLabel={overflowLabel}
      overflowLabel={overflowLabel}
      tail={children}
      testIds={{
        strip: `${testIdPrefix}-toolbar-quick-actions`,
        overflow: `${testIdPrefix}-toolbar-quick-overflow`,
        overflowPanel: `${testIdPrefix}-toolbar-quick-overflow-panel`,
      }}
    >
      <OfficeHomeCommand
        activation="click"
        icon={<CodeRibbonIcon name="undo" />}
        label={undoLabel}
        onClick={onUndo}
        disabled={!canUndo}
        testId={`${testIdPrefix}-quick-undo`}
        keyShortcuts="Control+Z Meta+Z"
        variant="icon"
      />
      <OfficeHomeCommand
        activation="click"
        icon={<CodeRibbonIcon name="redo" />}
        label={redoLabel}
        onClick={onRedo}
        disabled={!canRedo}
        testId={`${testIdPrefix}-quick-redo`}
        keyShortcuts="Control+Shift+Z Meta+Shift+Z"
        variant="icon"
      />
    </OfficeRibbonQuickStrip>
  );
}

/** Responsive, horizontally-paged ribbon band shared by code surfaces. */
export function CodeRibbonStrip({
  activeTab,
  activeLabel,
  children,
  scrollLeftLabel,
  scrollRightLabel,
  testIdPrefix = "code",
}: {
  activeTab: string;
  activeLabel: string;
  children: ReactNode;
  scrollLeftLabel: string;
  scrollRightLabel: string;
  testIdPrefix?: string;
}) {
  const stripProps: OfficeRibbonStripProps = {
    activeTab,
    children,
    panelId: `${testIdPrefix}-toolbar-panel-${activeTab}`,
    panelLabel: activeLabel,
    panelLabelledBy: `${testIdPrefix}-ribbon-tab-${activeTab}`,
    scrollLeftLabel,
    scrollRightLabel,
    testIdPrefix,
    testIds: {
      body: `${testIdPrefix}-toolbar-panel-${activeTab}`,
      scrollLeft: `${testIdPrefix}-toolbar-ribbon-scroll-left`,
      scrollRight: `${testIdPrefix}-toolbar-ribbon-scroll-right`,
    },
  };
  // Edit's compact disclosures use the same accent-tinted menu surface as
  // Docs/PPT. Keep the real shared face instead of restyling its chevron here.
  // One strip for both anatomies, so a tab change never remounts the ribbon.
  const strip = (
    <OfficeRibbonSurfaceStrip
      surface={activeTab === "home" || false ? "home" : "insert"}
      density="office"
      bandHeight={100}
      {...stripProps}
    />
  );

  return (
    <CodeRibbonActiveTabContext.Provider value={activeTab}>
      {strip}
    </CodeRibbonActiveTabContext.Provider>
  );
}
