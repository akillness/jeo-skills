"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useLayoutEffect, useMemo, type ReactNode } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  OfficeDockedPane,
  OfficeTaskPaneDockHost,
} from "@mrnote/core/web/components/office-ribbon/OfficeTaskPaneDockHost.tsx";
import {
  keepOfficeTaskPaneRoom,
  useOfficeTaskPaneCover,
  type OfficeTaskPaneCover,
} from "@mrnote/core/web/components/office-ribbon/officeTaskPaneOverlay.ts";
import {
  useOfficeTaskPaneDockRegistry,
  type OfficeTaskPaneDockRegistry,
} from "@mrnote/core/web/components/office-ribbon/officeTaskPaneDock.ts";

import type { PdfNavigationPanel } from "./PdfNavigationRail";
import styles from "./PdfTaskPaneDock.module.css";

/**
 * The PDF reader's task pane dock: its adapter onto the shared dock model
 * (components/office-ribbon/officeTaskPaneDock.ts) and host
 * (OfficeTaskPaneDockHost), as Docs' is documentTaskPaneDock.tsx.
 *
 * Page Thumbnails, Bookmarks (the outline), Search results and Comments are
 * the reader's navigation panes; Acrobat and Word's Navigation pane dock them
 * at the LEFT edge of the window, beside the navigation rail that opens them.
 * The rail stays the switcher (one pane at a time, PdfNavigationRail); the
 * dock gives each pane the shared task pane chrome and its place.
 */

export type PdfTaskPaneEdge = "left" | "right";

/** The navigation panes, and the format panes of a selected object
 * (Format Shape, Format Chart): Office and ONLYOFFICE set those at the
 * right edge, beside what they format. */
export type PdfTaskPaneId = PdfNavigationPanel | "format-shape" | "format-chart" | "selection";

export const PDF_TASK_PANE_EDGE: Readonly<Record<PdfTaskPaneId, PdfTaskPaneEdge>> = {
  thumbnails: "left",
  outline: "left",
  search: "left",
  annotations: "left",
  "format-shape": "right",
  "format-chart": "right",
  selection: "right",
};

export interface PdfTaskPaneDocks {
  readonly left: OfficeTaskPaneDockRegistry;
  readonly right: OfficeTaskPaneDockRegistry;
}

const pdfTaskPaneTabTestId = (id: string) => `pdf-task-pane-tab-${id}`;

export function usePdfTaskPaneDocks(): PdfTaskPaneDocks {
  const t = useTranslations("console-notebooks");
  // The strip's accessible name is the one the slide and document docks read.
  const tabsLabel = t("presentation.taskPanes.tabs");
  const options = useMemo(
    () => ({ tabTestId: pdfTaskPaneTabTestId, tabsLabel }),
    [tabsLabel],
  );
  const left = useOfficeTaskPaneDockRegistry(options);
  const right = useOfficeTaskPaneDockRegistry(options);
  return useMemo(() => ({ left, right }), [left, right]);
}

/** The custom property and attribute through which the pages keep room
 * for the cards (PdfTaskPaneDock.module.css). */
const PDF_TASK_PANE_ROOM = {
  variable: "--pdf-task-pane-room",
  attribute: "data-task-pane-room",
} as const;

/** The pages' own scroll bars, for the cards that float over the pages' edges
 * (PdfTaskPaneDock.module.css; the page window's Comments card,
 * styles/pdf-viewer.css): the width of the vertical bar and the height of the
 * horizontal one, 0px where the system draws bars over the content. */
export const PDF_PAGES_BAR_VARIABLE = "--pdf-pages-bar";
export const PDF_PAGES_BAR_X_VARIABLE = "--pdf-pages-bar-x";

/** What the pages' scroll bars take of the pages' box: a bar counts when the
 * pages' edge it lies on is the edge the cards hang from (`root`'s), within a
 * pixel -- a card 8px in from another edge is not over the bar. */
export function measurePdfPagesBars(
  pages: HTMLElement,
  root: HTMLElement,
): Readonly<{ vertical: number; horizontal: number }> {
  // The pages' box has no border (styles/pdf-viewer.css): what its client
  // box lacks of its offset box is the bar.
  const vertical = Math.max(0, pages.offsetWidth - pages.clientWidth);
  const horizontal = Math.max(0, pages.offsetHeight - pages.clientHeight);
  if (vertical === 0 && horizontal === 0) return { vertical, horizontal };
  const box = pages.getBoundingClientRect();
  const edge = root.getBoundingClientRect();
  return {
    vertical: Math.abs(edge.right - box.right) < 1 ? vertical : 0,
    horizontal: Math.abs(edge.bottom - box.bottom) < 1 ? horizontal : 0,
  };
}

/** The anchor the reader's panes hang from, between the rail and the pages:
 * each pane floats over the pages' left edge (PdfTaskPaneDock.module.css).
 * It publishes what the cards over the pages cover -- this dock's, and the
 * page window's Comments card at the right -- and keeps the pages' room for
 * them (office-ribbon/officeTaskPaneOverlay.ts). */
export function PdfTaskPaneDockHost({
  docks,
}: {
  readonly docks: PdfTaskPaneDocks;
}): React.JSX.Element {
  const body = docks.left.host?.parentElement ?? null;
  const root = body?.closest<HTMLElement>(".pdf-page-window__body") ?? body;
  const pages = body?.querySelector<HTMLElement>(":scope > .pdf-viewer__pages") ?? null;
  const onChange = useCallback(
    (cover: OfficeTaskPaneCover) => {
      if (!pages) return;
      // The Comments card floats over the pages' right edge as Docs' does:
      
      
      // reader's own panes at the left keep the pages' room.
      keepOfficeTaskPaneRoom({
        scroller: pages,
        viewport: pages,
        cover: { left: cover.left, right: 0 },
        holder: pages,
        ...PDF_TASK_PANE_ROOM,
      });
    },
    [pages],
  );
  useOfficeTaskPaneCover({ root, viewport: pages, onChange });
  // Where the system gives scroll bars their own room (Windows, Linux, a Mac
  // set to always show them), the pages' bar lies along the edge the cards
  // at the right hang from: 8px in from that edge, the Comments card and the
  // format panes stood over the bar -- 9px of a 17px bar, the part a pointer
  
  // to the card). The cards stand 8px in from the bar instead; the bar's
  // width is published on the window's body, which both cards are in.
  useLayoutEffect(() => {
    if (!pages || !root) return;
    const write = () => {
      const bars = measurePdfPagesBars(pages, root);
      const vertical = `${bars.vertical}px`;
      const horizontal = `${bars.horizontal}px`;
      if (root.style.getPropertyValue(PDF_PAGES_BAR_VARIABLE) !== vertical) {
        root.style.setProperty(PDF_PAGES_BAR_VARIABLE, vertical);
      }
      if (root.style.getPropertyValue(PDF_PAGES_BAR_X_VARIABLE) !== horizontal) {
        root.style.setProperty(PDF_PAGES_BAR_X_VARIABLE, horizontal);
      }
    };
    write();
    // The pages' content box: it changes when a bar comes or goes (a page
    // zoomed wider than the area brings the horizontal one) and when the
    // window is resized.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(write);
    observer?.observe(pages);
    observer?.observe(root);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(PDF_PAGES_BAR_VARIABLE);
      root.style.removeProperty(PDF_PAGES_BAR_X_VARIABLE);
    };
  }, [pages, root]);
  return (
    <>
      <OfficeTaskPaneDockHost
        docks={docks}
        edge="left"
        className={styles.left}
        testId="pdf-task-pane-dock-left"
        overlay
      />
      {/* The format panes float over the pages' right edge, as the
          Comments card does: the pages keep their place. */}
      <OfficeTaskPaneDockHost
        docks={docks}
        edge="right"
        className={styles.right}
        testId="pdf-task-pane-dock-right"
        overlay
      />
    </>
  );
}

/** One reader pane in its dock. Without docks (a pane's own unit test) it
 * renders where it is. */
export function PdfDockedPane({
  docks,
  pane,
  children,
}: {
  readonly docks: PdfTaskPaneDocks | null;
  readonly pane: PdfTaskPaneId;
  readonly children: ReactNode;
}): React.JSX.Element | null {
  return (
    <OfficeDockedPane docks={docks} edges={PDF_TASK_PANE_EDGE} pane={pane}>
      {children}
    </OfficeDockedPane>
  );
}

/**
 * The target-size and focus utilities every PDF pane control carries (the
 * reader's 44px hit-area contract); the shared chrome draws the visible X.
 */
export const PDF_TASK_PANE_CLOSE_CLASS =
  "min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring focus-visible:ring-offset-1";

/**
 * The classes every docked reader pane adds to its OfficeTaskPane root: its
 * reader class (width, dark tokens). Its entrance and exit are the shared
 * pane's own (office-ribbon/officeTaskPaneMotion.ts).
 */
export function pdfTaskPaneClassName(readerClass: string): string {
  return `${readerClass} pdf-viewer__task-pane`;
}

/** A reader pane's scrolling content under the chrome's fixed title row. */
export const PDF_TASK_PANE_BODY_CLASS =
  `${officeDialogParts.paneBody} pdf-viewer__task-pane-body`;
