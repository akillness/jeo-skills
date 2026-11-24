"use client";





























/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  OFFICE_TASK_PANE_MIN_WIDTH,
  OfficeTaskPaneResizeHandle,
  clampOfficeTaskPaneWidth,
  officeTaskPaneMaxWidth,
  useOfficeTaskPaneLayout,
} from "@mrnote/core/web/components/office-ribbon/officeTaskPaneLayout.tsx";
import type { PresentationNormalViewSizes } from "@mrnote/core/web/lib/presentation-grid.ts";
import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";

/** A new deck's `p:restoredLeft@sz` (PowerPoint and its own template). */
export const PRESENTATION_DEFAULT_RAIL_PCT = 15.62;
/** A new deck's `p:restoredTop@sz`: the Notes pane is the rest, 5.34 %. */
export const PRESENTATION_DEFAULT_SLIDE_PCT = 94.66;
/** The narrowest the thumbnail pane drags to, and the widest share. */
export const PRESENTATION_RAIL_MIN_PX = 96;
export const PRESENTATION_RAIL_MAX_PCT = 50;
/** The Notes pane keeps a line; the slide keeps at least 40 %. */
export const PRESENTATION_NOTES_MIN_PX = 28;
export const PRESENTATION_NOTES_MAX_PCT = 60;

const STORAGE_KEY = "mrai.presentation.normal-view-panes.v1";

/** Decks remembered at most; the oldest is forgotten first. */
const STORAGE_LIMIT = 200;

interface StoredPanes {
  readonly railPct?: number;
  readonly notesPct?: number;
}

const NONE_STORED: StoredPanes = {};

function validPct(value: unknown, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= max ? value : undefined;
}

function readStore(): Record<string, StoredPanes> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, StoredPanes>)
      : {};
  } catch {
    return {};
  }
}

function readStored(pageId: string): StoredPanes {
  if (typeof window === "undefined") return {};
  const entry = readStore()[pageId];
  if (!entry || typeof entry !== "object") return {};
  const railPct = validPct(entry.railPct, PRESENTATION_RAIL_MAX_PCT);
  const notesPct = validPct(entry.notesPct, PRESENTATION_NOTES_MAX_PCT);
  return {
    ...(railPct !== undefined ? { railPct } : {}),
    ...(notesPct !== undefined ? { notesPct } : {}),
  };
}

function writeStored(pageId: string, panes: StoredPanes): void {
  try {
    const store = readStore();
    delete store[pageId];
    store[pageId] = { ...readStored(pageId), ...panes };
    const ids = Object.keys(store);
    for (const id of ids.slice(0, Math.max(0, ids.length - STORAGE_LIMIT))) delete store[id];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage refused (private window, quota): the size lasts the session.
  }
}

/** The panes' sizes as a deck opens: the viewer's own drag, else the
 * file's, else PowerPoint's default. Percentages of the workspace. */
export function presentationNormalViewPaneSizes(
  file: PresentationNormalViewSizes | undefined,
  stored: StoredPanes,
): { readonly railPct: number; readonly notesPct: number } {
  const fileRail = validPct(file?.leftPct, 100);
  const fileSlide = validPct(file?.topPct, 100);
  const slidePct = fileSlide !== undefined && fileSlide < 100 ? fileSlide : PRESENTATION_DEFAULT_SLIDE_PCT;
  const thousandths = (pct: number) => Math.round(pct * 1000) / 1000;
  return {
    railPct: thousandths(
      Math.min(PRESENTATION_RAIL_MAX_PCT, stored.railPct ?? fileRail ?? PRESENTATION_DEFAULT_RAIL_PCT),
    ),
    notesPct: thousandths(Math.min(PRESENTATION_NOTES_MAX_PCT, stored.notesPct ?? 100 - slidePct)),
  };
}

export interface PresentationNormalViewPanes {
  readonly railPct: number;
  readonly notesPct: number;
  /** The thumbnail pane's width once the person dragged it (px). */
  readonly railPx: number | null;
  /** The workspace's custom properties the grid sizes the panes by. */
  readonly style: CSSProperties;
  readonly commitRailPx: (px: number, workspaceWidth: number) => void;
  readonly commitNotesPct: (pct: number) => void;
}

export function usePresentationNormalViewPanes(
  pageId: string,
  file: PresentationNormalViewSizes | undefined,
): PresentationNormalViewPanes {
  const [dragged, setDragged] = useState<{ readonly pageId: string; readonly panes: StoredPanes }>(() => ({
    pageId,
    panes: readStored(pageId),
  }));
  // Another deck in the same window: its own remembered sizes.
  if (dragged.pageId !== pageId) setDragged({ pageId, panes: readStored(pageId) });
  const stored = dragged.pageId === pageId ? dragged.panes : NONE_STORED;
  const fileLeft = file?.leftPct;
  const fileTop = file?.topPct;
  const { railPct, notesPct } = useMemo(
    () => presentationNormalViewPaneSizes({ leftPct: fileLeft, topPct: fileTop }, stored),
    [fileLeft, fileTop, stored],
  );
  const commit = useCallback(
    (panes: StoredPanes) => {
      setDragged((current) => ({
        pageId,
        panes: { ...(current.pageId === pageId ? current.panes : {}), ...panes },
      }));
      writeStored(pageId, panes);
    },
    [pageId],
  );
  // Dragged, the pane holds its width in px while the window changes size
  // (autoAdjust="0"); the share is what the deck opens at next time.
  const [railWidth, setRailWidth] = useState<{ readonly pageId: string; readonly px: number } | null>(null);
  const railPx = railWidth?.pageId === pageId ? railWidth.px : null;
  const commitRailPx = useCallback(
    (px: number, workspaceWidth: number) => {
      setRailWidth({ pageId, px });
      if (workspaceWidth > 0) commit({ railPct: Math.round((px / workspaceWidth) * 100_000) / 1000 });
    },
    [commit, pageId],
  );
  const commitNotesPct = useCallback((pct: number) => commit({ notesPct: pct }), [commit]);
  const style = useMemo(
    () =>
      ({
        "--ppt-rail-width": railPx !== null ? `${railPx}px` : `${railPct}%`,
        "--ppt-notes-height": `${notesPct}%`,
      }) as CSSProperties,
    [notesPct, railPct, railPx],
  );
  return { railPct, notesPct, railPx, style, commitRailPx, commitNotesPct };
}

/**
 * The two borders, drawn in the workspace grid over the panes' edges. Each
 * drag sets the workspace's property directly (the slide follows it as
 * PowerPoint's does) and hands the size over when it ends.
 */
export function PresentationNormalViewSplitters({
  workspace,
  panes,
  showRail,
  showNotes,
  labels,
}: {
  readonly workspace: HTMLElement | null;
  readonly panes: PresentationNormalViewPanes;
  readonly showRail: boolean;
  readonly showNotes: boolean;
  readonly labels: { readonly rail: string; readonly notes: string };
}) {
  const [box, setBox] = useState<{ readonly width: number; readonly height: number }>({ width: 0, height: 0 });
  useEffect(() => {
    if (!workspace) return undefined;
    // Layout size, not the drawn box: a window opening (or the notebook
    // canvas zoomed) scales the drawing, never the panes' share.
    const measure = () => {
      const width = workspace.offsetWidth;
      const height = workspace.offsetHeight;
      setBox((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [workspace]);
  if (!workspace || box.width <= 0) return null;
  const railMax = Math.round((box.width * PRESENTATION_RAIL_MAX_PCT) / 100);
  const railMin = Math.min(PRESENTATION_RAIL_MIN_PX, railMax);
  const railWidth = Math.min(
    railMax,
    Math.max(railMin, panes.railPx ?? (box.width * panes.railPct) / 100),
  );
  const notesMax = Math.round((box.height * PRESENTATION_NOTES_MAX_PCT) / 100);
  const notesMin = Math.min(PRESENTATION_NOTES_MIN_PX, notesMax);
  const notesHeight = Math.min(notesMax, Math.max(notesMin, (box.height * panes.notesPct) / 100));
  const toPct = (px: number, of: number) => Math.round((px / of) * 100_000) / 1000;
  return (
    <>
      {showRail ? (
        <OfficeTaskPaneResizeHandle
          edge="right"
          // Not a Tab stop: the panes are reached as PowerPoint's are (F6),
          // and the border is a pointer's.
          tabbable={false}
          width={railWidth}
          minWidth={railMin}
          maxWidth={railMax}
          label={labels.rail}
          className={presentationChrome.railSplitter}
          testId="presentation-rail-splitter"
          onWidth={(width, done) => {
            workspace.style.setProperty("--ppt-rail-width", `${width}px`);
            if (done) panes.commitRailPx(width, box.width);
          }}
        />
      ) : null}
      {showNotes && box.height > 0 ? (
        <OfficeTaskPaneResizeHandle
          edge="top"
          tabbable={false}
          width={notesHeight}
          minWidth={notesMin}
          maxWidth={notesMax}
          label={labels.notes}
          className={presentationChrome.notesSplitter}
          testId="presentation-notes-splitter"
          onWidth={(height, done) => {
            const pct = toPct(height, box.height);
            workspace.style.setProperty("--ppt-notes-height", `${pct}%`);
            if (done) panes.commitNotesPct(pct);
          }}
        />
      ) : null}
    </>
  );
}





export const PRESENTATION_COMMENTS_PANE_WIDTH = 300;
const COMMENTS_LAYOUT_KEY = "mrai.presentation.task-panes.v1";
/** The shared Comments pane's layout id (OFFICE_COMMENTS_PANE_LAYOUT_ID),
 * named here so the window does not load the pane's module eagerly. */
const OFFICE_COMMENTS_PANE_LAYOUT_ID = "comments";
const COMMENTS_OPEN_KEY = "mrai.presentation.comments-pane-open.v1";

/** Whether this deck's Comments pane was open when it was left (per deck,
 * in this browser: PowerPoint reopens a file with the pane it had). */
export function readPresentationCommentsPaneOpen(pageId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(COMMENTS_OPEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Boolean(
      parsed && typeof parsed === "object" && !Array.isArray(parsed) && (parsed as Record<string, unknown>)[pageId] === true,
    );
  } catch {
    return false;
  }
}

export function writePresentationCommentsPaneOpen(pageId: string, open: boolean): void {
  try {
    const raw = window.localStorage.getItem(COMMENTS_OPEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const store: Record<string, true> =
      parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...(parsed as Record<string, true>) } : {};
    if (open === (store[pageId] === true)) return;
    delete store[pageId];
    if (open) store[pageId] = true;
    const ids = Object.keys(store);
    for (const id of ids.slice(0, Math.max(0, ids.length - STORAGE_LIMIT))) delete store[id];
    window.localStorage.setItem(COMMENTS_OPEN_KEY, JSON.stringify(store));
  } catch {
    // Storage refused: the pane opens closed next time.
  }
}

export function usePresentationCommentsDock(workspace: HTMLElement | null): {
  readonly style: CSSProperties;
  readonly resize: (available: number) => {
    readonly width: number;
    readonly minWidth: number;
    readonly maxWidth: number;
    readonly onWidth: (width: number, commit: boolean) => void;
  };
} {
  const { layout, setPlacement } = useOfficeTaskPaneLayout(COMMENTS_LAYOUT_KEY);
  const stored = layout[OFFICE_COMMENTS_PANE_LAYOUT_ID]?.width;
  const width = typeof stored === "number" && stored > 0 ? Math.round(stored) : PRESENTATION_COMMENTS_PANE_WIDTH;
  const style = useMemo(() => ({ "--ppt-comments-dock-width": `${width}px` }) as CSSProperties, [width]);
  const resize = useCallback(
    (available: number) => {
      const maxWidth = officeTaskPaneMaxWidth(available);
      return {
        width: clampOfficeTaskPaneWidth(width, available),
        minWidth: Math.min(OFFICE_TASK_PANE_MIN_WIDTH, maxWidth),
        maxWidth,
        onWidth: (next: number, commit: boolean) => {
          workspace?.style.setProperty("--ppt-comments-dock-width", `${next}px`);
          if (commit) setPlacement(OFFICE_COMMENTS_PANE_LAYOUT_ID, { width: next });
        },
      };
    },
    [setPlacement, width, workspace],
  );
  return { style, resize };
}
