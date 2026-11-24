"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslations } from "../../../../host/next-intl";

import {
  OfficeDockedPane,
  OfficeTaskPaneDockHost,
  officeTaskPaneTopBelowRibbon,
  useOfficeTaskPaneBelowRibbon,
} from "../../office-ribbon/OfficeTaskPaneDockHost";
import {
  useOfficeTaskPaneDockRegistry,
  type OfficeTaskPaneDockRegistry,
} from "../../office-ribbon/officeTaskPaneDock";
import {
  keepOfficeTaskPaneRoom,
  NO_OFFICE_TASK_PANE_COVER,
  readOfficeTaskPaneCover,
  useOfficeTaskPaneCover,
  type OfficeTaskPaneCover,
} from "../../office-ribbon/officeTaskPaneOverlay";

import styles from "./DocumentTaskPaneDock.module.css";





























export type DocumentTaskPaneEdge = "left" | "right";

export type DocumentTaskPaneId =
  | "navigation"
  | "find"
  | "reviewing"
  | "styles"
  | "backlinks"
  | "selection"
  | "accessibility"
  | "editor"
  | "reveal-formatting"
  | "version-history"
  | "compare"
  | "source-documents"
  | "format-shape"
  | "format-picture"
  | "format-chart"
  | "format-text-effects"
  | "alt-text";

export const DOCUMENT_TASK_PANE_EDGE: Readonly<
  Record<DocumentTaskPaneId, DocumentTaskPaneEdge>
> = {
  navigation: "left",
  // Find and Replace opens where Word's Navigation pane does: over the
  // window's left edge, the page staying where it is (WUA 224: drawn in the
  // ribbon's flow, it pushed the page below the window).
  find: "left",
  reviewing: "left",
  styles: "right",
  backlinks: "right",
  selection: "right",
  accessibility: "right",
  // Word's Editor pane opens at the right of the document.
  editor: "right",
  // Word's Reveal Formatting pane docks at the right.
  "reveal-formatting": "right",
  "version-history": "right",
  compare: "right",
  // Word's source documents sit at the right of the result.
  "source-documents": "right",
  "format-shape": "right",
  "format-picture": "right",
  "format-chart": "right",
  // Format Text Effects (Text Effects > 3-D Options…) docks where Word's does.
  "format-text-effects": "right",
  "alt-text": "right",
};

export interface DocumentTaskPaneDocks {
  readonly left: OfficeTaskPaneDockRegistry;
  readonly right: OfficeTaskPaneDockRegistry;
}

/** The editor's docks, provided by NoteEditor to the toolbar it renders. */
export const DocumentTaskPaneDocksContext =
  createContext<DocumentTaskPaneDocks | null>(null);

const documentTaskPaneTabTestId = (id: string) =>
  `document-task-pane-tab-${id}`;

export function useDocumentTaskPaneDocks(): DocumentTaskPaneDocks {
  const t = useTranslations("console-notebooks");
  // The strip's accessible name is the one the slide editor's dock reads.
  const tabsLabel = t("presentation.taskPanes.tabs");
  const options = useMemo(
    () => ({ tabTestId: documentTaskPaneTabTestId, tabsLabel }),
    [tabsLabel],
  );
  const left = useOfficeTaskPaneDockRegistry(options);
  const right = useOfficeTaskPaneDockRegistry(options);
  return useMemo(() => ({ left, right }), [left, right]);
}

/**
 * Where the right dock's top goes: just below the ribbon (the shared
 * officeTaskPaneTopBelowRibbon, whose notes cover the scaled, transformed
 * window).
 */
export const documentTaskPaneTopBelowRibbon = officeTaskPaneTopBelowRibbon;

/**
 * Word docks its format panes, Styles and the Selection Pane at the window's
 * right edge BELOW the ribbon (Microsoft Support, "Manage pane layout in
 * Office apps"). The right dock used a fixed `top: 52px`, which put the pane
 * over the ribbon's right end (Arrange, Size and the Format Pane button
 * itself). While a pane is open the shared host keeps the dock's top on the
 * ribbon's bottom edge.
 */
const DOCUMENT_DOCK_BELOW_RIBBON = {
  containerSelector: ".note-editor-wrapper",
  ribbonSelector: ".note-editor-toolbar-stack",
  cssVariable: "--document-task-pane-top",
} as const;

/** The element a dock's panes render into: a card floating over the
 * editor window at its edge, below the ribbon (both edges; the page does
 * not move for it, officeTaskPaneOverlay.ts). Empty, it is not drawn. */
export function DocumentTaskPaneDockHost({
  docks,
  edge,
}: {
  readonly docks: DocumentTaskPaneDocks;
  readonly edge: DocumentTaskPaneEdge;
}): React.JSX.Element {
  return (
    <OfficeTaskPaneDockHost
      docks={docks}
      edge={edge}
      className={edge === "left" ? styles.left : styles.right}
      testId={`document-task-pane-dock-${edge}`}
      belowRibbon={DOCUMENT_DOCK_BELOW_RIBBON}
      // The right dock is the card its panes sit in: it slides in and out
      // as a whole (the left one holds panes drawing their own card).
      card={edge === "right"}
      overlay
    />
  );
}

/** One Docs pane in the dock of its edge. Without docks (a pane's own unit
 * test) it renders where it is. */
export function DocumentDockedPane({
  docks,
  pane,
  children,
}: {
  readonly docks: DocumentTaskPaneDocks | null;
  readonly pane: DocumentTaskPaneId;
  readonly children: ReactNode;
}): React.JSX.Element | null {
  return (
    <OfficeDockedPane docks={docks} edges={DOCUMENT_TASK_PANE_EDGE} pane={pane}>
      {children}
    </OfficeDockedPane>
  );
}










export function DocumentCommentsCard({
  docks,
  children,
}: {
  readonly docks: DocumentTaskPaneDocks;
  readonly children: ReactNode;
}): React.JSX.Element {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const open = Boolean(children);
  useOfficeTaskPaneBelowRibbon(host, open, DOCUMENT_DOCK_BELOW_RIBBON);
  const besideDock = docks.right.state.opened.length > 0;
  return (
    <div
      ref={setHost}
      className={styles.comments}
      data-testid="document-comments-card"
      data-beside-dock={besideDock || undefined}
      data-office-task-pane-overlay="right"
    >
      {children}
    </div>
  );
}

/** The custom property and attribute through which the page keeps room
 * (DocumentTaskPaneDock.module.css). */
const DOCUMENT_TASK_PANE_ROOM = {
  variable: "--document-task-pane-room",
  attribute: "data-task-pane-room",
} as const;

/**
 * Docs' side of the floating cards: publishes what they cover of the editor
 * window (the caret keeps clear of it, native-document/
 * scrollportToolbarMargin.ts) and keeps the body's room for them
 * (keepOfficeTaskPaneRoom).
 */
export function useDocumentTaskPaneCover(
  wrapperRef: RefObject<HTMLElement | null>,
): void {
  const [nodes, setNodes] = useState<{
    readonly root: HTMLElement | null;
    readonly viewport: HTMLElement | null;
  }>({ root: null, viewport: null });
  // The wrapper mounts with the editor; its scrollport is the window's.
  useEffect(() => {
    const root = wrapperRef.current;
    const viewport = root?.closest<HTMLElement>(".note-window-scroll") ?? null;
    setNodes((current) =>
      current.root === root && current.viewport === viewport
        ? current
        : { root, viewport },
    );
  });
  const { root, viewport } = nodes;
  const onChange = useCallback(
    (cover: OfficeTaskPaneCover) => {
      const body = root?.querySelector<HTMLElement>(":scope > .note-editor-body");
      if (!root || !viewport || !body) return;
      // The body centres the page and scrolls sideways when it keeps room.
      // The web layout fills the window instead (no page to keep clear).
      const web = body.querySelector(
        ':scope > .note-editor-body-main[data-document-view-mode="web"]',
      );
      keepOfficeTaskPaneRoom({
        scroller: body,
        viewport,
        cover: web ? NO_OFFICE_TASK_PANE_COVER : cover,
        holder: root,
        ...DOCUMENT_TASK_PANE_ROOM,
      });
    },
    [root, viewport],
  );
  useOfficeTaskPaneCover({ root, viewport, onChange });
  
  // room it needs is measured again under the same cover.
  useEffect(() => {
    const page = root?.querySelector<HTMLElement>(
      ":scope > .note-editor-body > .note-editor-body-main",
    );
    if (!page || !viewport || typeof ResizeObserver === "undefined") return;
    // Its width: the page also grows taller with every pass of a long
    // document's layout, which changes no room.
    let width = -1;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      const next = entry?.borderBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width ?? -1;
      if (next === width) return;
      width = next;
      onChange(readOfficeTaskPaneCover(viewport));
    });
    observer.observe(page);
    return () => observer.disconnect();
  }, [onChange, root, viewport]);
}
