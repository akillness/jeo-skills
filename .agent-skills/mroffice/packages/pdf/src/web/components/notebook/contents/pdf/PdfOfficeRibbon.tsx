"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import "@mrnote/core/web/styles/note-editor.css";

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { OfficeEditorActionRail } from "@mrnote/core/web/components/office-ribbon/OfficeEditorActionRail.tsx";

import { OfficeRibbonTabs, useKeptWhileHidden } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonChassis.tsx";
import { OfficeRibbonSurfaceStrip } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonSurfaceStrip.tsx";
import {
  OfficeRibbonQuickStrip,
  OfficeSaveStatus,
} from "@mrnote/core/web/components/office-ribbon/OfficeRibbonQuickStrip.tsx";
import { computeRibbonOverflow } from "@mrnote/core/web/components/console/editor/ribbonOverflow.ts";

import { PdfRibbonFitContext, usePdfRibbonFit } from "./pdfRibbonFit";

export type PdfRibbonSaveStatus = "saved" | "saving" | "unsaved" | "conflict";
export type PdfOfficeActionRail = Omit<
  ComponentProps<typeof OfficeEditorActionRail>,
  "overflow" | "overflowLabel" | "testIds"
>;

export interface PdfOfficeRibbonTab<TabId extends string> {
  id: TabId;
  label: ReactNode;
  ariaLabel?: string;
  /** Stable command/catalog identity attached to the real tab element. */
  controlId?: string;
  /** Contextual tint hook shared with the other Office editors. */
  className?: string;
  /** Typed contextual family, surfaced as `data-contextual`. */
  contextual?: string;
  /**
   * Which shared command band hosts the tab's content. A contextual tab
   * defaults to the Home surface (font pickers, value boxes, compact
   * commands); one whose content is a primary tab's own Insert-anatomy
   * command run — the comment tool, which re-renders the Comment tab —
   * declares `"insert"` so its large commands keep that tab's geometry
   * instead of shifting when the tool opens.
   */
  surface?: "home" | "insert";
}

interface PdfOfficeRibbonProps<TabId extends string> {
  activeTab: TabId;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  onActiveTabChange: (tab: TabId) => void;
  




  quickActions?: ReactNode;
  actionRail?: PdfOfficeActionRail;
  quickActionTail?: ReactNode;
  quickOverflowOnlyTail?: ReactNode;
  quickOverflowLabel: string;
  saveStatus?: PdfRibbonSaveStatus;
  saveStatusLabel?: string;
  scrollLeftLabel: string;
  scrollRightLabel: string;
  tabs: readonly PdfOfficeRibbonTab<TabId>[];
  testId: string;
  /** Makes this ribbon's DOM ids its own when several PDF windows share a
   * document: `${prefix}-${instanceId}-ribbon-tab-<id>` and the panel id. Test
   * ids keep their established names. */
  instanceId?: string;
  /** Pen-first drawing (lib/pen-first-draw): the fold control after the tabs, while the pen palette is available. */
  collapse?: { onCollapse: () => void };
  /** The ribbon is folded into the pen palette (hidden; the palette stands in for it). */
  penCompact?: boolean;
}

interface RibbonOverflowState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

export function pdfRibbonOverflow(input: {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}): RibbonOverflowState {
  return computeRibbonOverflow(input);
}

/** The PDF ribbon pages by viewport width instead of the docs fixed step. */
/** The ribbon tab on show, for the groups inside the ribbon (none outside one). */
const PdfRibbonActiveTabContext = createContext<string | null>(null);

/**
 * Whether a group tagged with these `data-ribbon` tokens is on show. The
 * shared tab gating hides every other group (`display: none`); a hidden
 * group keeps its frame but draws none of its commands, so the window's
 * renders (each page change while scrolling) do not rebuild the commands of
 * every tab behind the one in view. Outside a ribbon every group draws.
 */
export function usePdfRibbonGroupShown(tokens: string): boolean {
  const activeTab = useContext(PdfRibbonActiveTabContext);
  return activeTab === null || tokens.split(/\s+/).includes(activeTab);
}

/**
 * A group's commands, for a group that may be out of view: drawn while the
 * group is shown; once it has been shown, kept (frozen at what they last
 * drew, hidden by the tab gating) while another tab is in view, so coming
 * back updates them in place instead of inserting them again (~200 ms of
 * style work on an iPad per tab change). Frozen, they cost the window's
 * renders nothing: the same element is handed back and React skips it.
 * Never drawn before, they stay undrawn (dd8b626957).
 */
export function usePdfRibbonGroupCommands(
  tokens: string,
  children: ReactNode,
): ReactNode {
  const shown = usePdfRibbonGroupShown(tokens);
  return useKeptWhileHidden(shown, children);
}

function pdfRibbonScrollStep(clientWidth: number): number {
  return Math.max(160, Math.round(clientWidth * 0.72));
}











export function PdfOfficeRibbon<TabId extends string>({
  activeTab,
  ariaLabel,
  children,
  className,
  onActiveTabChange,
  quickActions,
  actionRail,
  quickActionTail,
  quickOverflowLabel,
  saveStatus,
  saveStatusLabel,
  scrollLeftLabel,
  scrollRightLabel,
  tabs,
  testId,
  instanceId,
  collapse,
  penCompact = false,
}: PdfOfficeRibbonProps<TabId>) {
  // "pdf-ribbon" → prefix "pdf" so the chassis's `<prefix>-ribbon-tab-<id>`
  // ids/testids land exactly on the established `${testId}-tab-<id>` names.
  const prefix = testId.endsWith("-ribbon") ? testId.slice(0, -7) : testId;
  const idPrefix = instanceId ? `${prefix}-${instanceId}` : prefix;
  const panelId = `${idPrefix}-ribbon-panel-host`;
  const hasQuickCluster = Boolean(
    actionRail || quickActions ||
    quickActionTail ||
    (saveStatus && saveStatusLabel),
  );
  // Home, Featured and the other primary tabs keep the shared Insert band.
  // A contextual tab (Text Editing, Picture Editing, ...) is built from the
  // Home anatomy — font pickers, value boxes, compact commands, number
  // fields — so it renders on the shared Home surface, exactly as the
  // Presentation editor's format tabs do; only that surface carries the
  // geometry those shared controls were designed for.
  const activeTabEntry = tabs.find((tab) => tab.id === activeTab);
  // The Draw tab (绘图) is built from the Home anatomy too: its groups are
  // the Docs and Slides Draw tabs' (OfficeHomeRibbonGroup), and on the
  // Insert surface their pens and large commands stretched to the band.
  const usesHomeAnatomy =
    (Boolean(activeTabEntry?.contextual) && activeTabEntry?.surface !== "insert") ||
    activeTabEntry?.surface === "home";
  // Groups that do not fit collapse, the furthest along first (pdfRibbonFit).
  const fit = usePdfRibbonFit(activeTab);
  const stripProps = {
    activeTab,
    panelId,
    panelLabelledBy: `${idPrefix}-ribbon-tab-${activeTab}`,
    scrollLeftLabel,
    scrollRightLabel,
    scrollStep: pdfRibbonScrollStep,
    bodyAttributes: { "data-pdf-ribbon-active": activeTab },
    testIds: {
      body: `${testId}-panel`,
      track: `${testId}-track`,
      scrollLeft: `${testId}-scroll-left`,
      scrollRight: `${testId}-scroll-right`,
    },
  } as const;
  return (
    <div
      className="note-editor-toolbar-stack pdf-office-ribbon-shell !static !z-auto !m-0 min-w-0 w-full"
      data-testid={`${testId}-stack`}
    >
      <section
        aria-label={ariaLabel}
        className={`note-editor-office-toolbar office-ribbon-skin pdf-office-ribbon min-w-0${className ? ` ${className}` : ""}`}
        data-office-authoring-ribbon="true"
        data-pdf-object-selection-retain="true"
        data-pdf-ribbon-active={activeTab}
        data-pen-compact={penCompact ? "true" : undefined}
        data-testid={testId}
        role="toolbar"
      >
        <OfficeRibbonTabs
          collapse={collapse}
          tabs={tabs.map((tab) => ({
            key: tab.id,
            label: tab.label,
            ariaLabel: tab.ariaLabel,
            controlId: tab.controlId,
            className: tab.className,
            contextual: tab.contextual,
          }))}
          activeTab={activeTab}
          onSelect={onActiveTabChange}
          testIdPrefix={prefix}
          idPrefix={idPrefix}
          tabTestId={(key) => `${testId}-tab-${key}`}
          listLabel={ariaLabel}
          panelId={panelId}
          attributes={{
            "data-has-quick-actions": hasQuickCluster ? "true" : undefined,
          }}
          trailing={
            actionRail ? (
              <OfficeEditorActionRail
                {...actionRail}
                overflowLabel={quickOverflowLabel}
                testIds={{
                  strip: `${testId}-quick-actions`,
                  overflow: `${testId}-quick-overflow`,
                  overflowPanel: `${testId}-quick-overflow-panel`,
                }}
              />
            ) : hasQuickCluster ? (
              <OfficeRibbonQuickStrip
                ariaLabel={quickOverflowLabel}
                overflowLabel={quickOverflowLabel}
                tail={
                  quickActionTail || (saveStatus && saveStatusLabel) ? (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5"
                      data-testid={`${testId}-quick-tail`}
                    >
                      {saveStatus && saveStatusLabel ? (
                        <OfficeSaveStatus
                          status={saveStatus}
                          label={saveStatusLabel}
                          testId={`${testId}-save-status`}
                        />
                      ) : null}
                      {quickActionTail}
                    </span>
                  ) : undefined
                }
                testIds={{
                  strip: `${testId}-quick-actions`,
                  overflow: `${testId}-quick-overflow`,
                  overflowPanel: `${testId}-quick-overflow-panel`,
                }}
              >
                {quickActions}
              </OfficeRibbonQuickStrip>
            ) : null
          }
        />
        <PdfRibbonActiveTabContext.Provider value={activeTab}>
          <PdfRibbonFitContext.Provider value={fit.collapsed}>
            {/* One strip for both anatomies (OfficeRibbonSurfaceStrip): a
                contextual tab no longer unmounts and re-inserts the ribbon.
                Every tab's groups are children here, gated by data-ribbon. */}
            <OfficeRibbonSurfaceStrip
              surface={usesHomeAnatomy ? "home" : "insert"}
              density="office"
              {...stripProps}
            >
              <span ref={fit.markerRef} hidden aria-hidden="true" data-pdf-ribbon-fit-marker="" />
              {children}
            </OfficeRibbonSurfaceStrip>
          </PdfRibbonFitContext.Provider>
        </PdfRibbonActiveTabContext.Provider>
      </section>
    </div>
  );
}
