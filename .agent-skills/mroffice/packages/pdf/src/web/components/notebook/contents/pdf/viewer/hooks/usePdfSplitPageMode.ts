/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isTypingTarget } from "../../../../../../lib/pdf/keyboard-nav";
import {
  PDF_NATIVE_PAGE_SPLIT_MAX_LINES,
  PDF_NATIVE_PAGE_SPLIT_MAX_PAGES,
  PDF_PAGE_SPLIT_MIN_GAP,
  evenPageSplitLines,
  normalizePageSplitLines,
  pageSplitGridIsWritable,
  pageSplitRangePages,
  roundPageSplitFraction,
  spacedPageSplitLines,
  type PdfNativePageSplitGrid,
  type PdfPageSplitParity,
  type PdfSplitPagesIntent,
} from "../../../../../../lib/pdf/page-split-mode";

export type PdfSplitLineAxis = "rows" | "columns";

export interface PdfSplitLineRef {
  readonly page: number;
  readonly axis: PdfSplitLineAxis;
  readonly index: number;
}

/** WPS 页面设置 of the split mode. */
export interface PdfSplitModeSettings {
  readonly range: Readonly<{ mode: "all" } | { mode: "custom"; text: string }>;
  /** 应用到: 奇数和偶数页 / 仅奇数页 / 仅偶数页. */
  readonly parity: PdfPageSplitParity;
  /** 分割线调整范围: every page in the range, or only the page dragged on. */
  readonly adjust: "batch" | "current";
  /** 分割后原页面处理: 删除原页面 (false) or 保留原页面 (true). */
  readonly keepOriginal: boolean;
}

/** One direction of WPS 添加分割线: on or off, then N even lines or one line
 * every `spacingCm`. */
export interface PdfSplitLineRequest {
  readonly enabled: boolean;
  readonly by: "count" | "spacing";
  readonly count: number;
  readonly spacingCm: number;
}

export const DEFAULT_PDF_SPLIT_GRID: PdfNativePageSplitGrid = Object.freeze({
  rows: Object.freeze([0.5]),
  columns: Object.freeze([0.5]),
});

const DEFAULT_SETTINGS: PdfSplitModeSettings = Object.freeze({
  range: Object.freeze({ mode: "all" as const }),
  parity: "all" as const,
  adjust: "batch" as const,
  keepOriginal: false,
});

export type PdfSplitModeOutcome =
  | Readonly<{ kind: "split"; pages: number }>
  | Readonly<{ kind: "refused"; message: string }>;

/** What the page layer needs to draw and drag the split lines. */
export interface PdfSplitPageModeView {
  readonly active: boolean;
  readonly busy: boolean;
  readonly selected: PdfSplitLineRef | null;
  /** The lines a page shows, or null when the page is outside the range. */
  readonly gridFor: (page: number) => PdfNativePageSplitGrid | null;
  readonly select: (line: PdfSplitLineRef | null) => void;
  /** Move a line to `fraction` of the displayed page (kept between its
   * neighbours). */
  readonly moveLine: (line: PdfSplitLineRef, fraction: number) => void;
  readonly label: string;
}

export interface UsePdfSplitPageModeOptions {
  readonly pageCount: number;
  readonly currentPage: number;
  /** The page as displayed, in PDF points (after /Rotate). */
  readonly readDisplaySize: (page: number) => Readonly<{ width: number; height: number }> | null;
  readonly onSplitPages?: (intent: PdfSplitPagesIntent) => Promise<boolean>;
  readonly messages: Readonly<{
    lineLabel: string;
    nothingToSplit: string;
    tooManyPages: string;
    rangeInvalid: string;
    failed: string;
  }>;
}

const POINTS_PER_CM = 72 / 2.54;

function gridWith(
  grid: PdfNativePageSplitGrid,
  axis: PdfSplitLineAxis,
  lines: readonly number[],
): PdfNativePageSplitGrid {
  return Object.freeze({
    rows: axis === "rows" ? Object.freeze([...lines]) : grid.rows,
    columns: axis === "columns" ? Object.freeze([...lines]) : grid.columns,
  });
}

/**
 * WPS 分割页面 as an on-page mode: red dashed cut lines over the pages (one
 * vertical and one horizontal through the middle to start), dragged into
 * place, with 添加分割线 / 删除分割线 / 页面设置 / 立即分割 / 退出分割 beside
 * the page. 立即分割 hands the host one native split of every page in the
 * range, each with its own lines.
 */
export function usePdfSplitPageMode({
  pageCount,
  currentPage,
  readDisplaySize,
  onSplitPages,
  messages,
}: UsePdfSplitPageModeOptions) {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<PdfNativePageSplitGrid>(DEFAULT_PDF_SPLIT_GRID);
  const [overrides, setOverrides] = useState<ReadonlyMap<number, PdfNativePageSplitGrid>>(
    () => new Map(),
  );
  const [settings, setSettings] = useState<PdfSplitModeSettings>(DEFAULT_SETTINGS);
  const [selected, setSelected] = useState<PdfSplitLineRef | null>(null);
  const [popover, setPopover] = useState<"lines" | "settings" | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const rangePages = useMemo(
    () => pageSplitRangePages(pageCount, settings.range, settings.parity),
    [pageCount, settings.parity, settings.range],
  );
  const rangeSet = useMemo(() => new Set(rangePages ?? []), [rangePages]);

  const gridFor = useCallback(
    (page: number): PdfNativePageSplitGrid | null =>
      rangeSet.has(page) ? (overrides.get(page) ?? batch) : null,
    [batch, overrides, rangeSet],
  );

  const enter = useCallback(() => {
    setActive(true);
    setSelected(null);
    setPopover(null);
  }, []);
  const exit = useCallback(() => {
    setActive(false);
    setSelected(null);
    setPopover(null);
    setBatch(DEFAULT_PDF_SPLIT_GRID);
    setOverrides(new Map());
  }, []);

  // A host that stops offering the writer ends the mode (adjusted while
  // rendering, as React prescribes for state that follows a prop).
  const hasWriter = Boolean(onSplitPages);
  const [writerOffered, setWriterOffered] = useState(hasWriter);
  if (writerOffered !== hasWriter) {
    setWriterOffered(hasWriter);
    if (!hasWriter) {
      setActive(false);
      setSelected(null);
      setPopover(null);
    }
  }

  /** Write a page's lines where the adjust setting says: every page in the
   * range (批量调整) or the page itself (仅调整当前页). */
  const writeGrid = useCallback(
    (page: number, next: PdfNativePageSplitGrid) => {
      if (settings.adjust === "batch") {
        setBatch(next);
        setOverrides(new Map());
        return;
      }
      setOverrides((current) => {
        const updated = new Map(current);
        updated.set(page, next);
        return updated;
      });
    },
    [settings.adjust],
  );

  const moveLine = useCallback(
    (line: PdfSplitLineRef, fraction: number) => {
      const grid = gridFor(line.page);
      if (!grid) return;
      const lines = [...grid[line.axis]];
      if (line.index < 0 || line.index >= lines.length) return;
      const low = (line.index > 0 ? lines[line.index - 1] : 0) + PDF_PAGE_SPLIT_MIN_GAP;
      const high = (line.index < lines.length - 1 ? lines[line.index + 1] : 1) - PDF_PAGE_SPLIT_MIN_GAP;
      if (!(high >= low)) return;
      lines[line.index] = roundPageSplitFraction(Math.min(high, Math.max(low, fraction)));
      writeGrid(line.page, gridWith(grid, line.axis, lines));
    },
    [gridFor, writeGrid],
  );

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    const grid = gridFor(selected.page);
    if (!grid) return;
    const lines = grid[selected.axis].filter((_, index) => index !== selected.index);
    writeGrid(selected.page, gridWith(grid, selected.axis, lines));
    setSelected(null);
  }, [gridFor, selected, writeGrid]);

  /** The displayed size of the page lines are added on, in centimetres. */
  const pageSizeCm = useCallback(
    (page: number) => {
      const size = readDisplaySize(page);
      if (!size) return null;
      return {
        width: Math.round((size.width / POINTS_PER_CM) * 10) / 10,
        height: Math.round((size.height / POINTS_PER_CM) * 10) / 10,
      };
    },
    [readDisplaySize],
  );

  const addLines = useCallback(
    (requests: Readonly<{ rows: PdfSplitLineRequest; columns: PdfSplitLineRequest }>) => {
      const page = Math.min(Math.max(1, currentPage), Math.max(1, pageCount));
      const base = gridFor(page) ?? batch;
      const size = pageSizeCm(page);
      const linesFor = (axis: PdfSplitLineAxis): readonly number[] => {
        const request = requests[axis];
        if (!request.enabled) return base[axis];
        if (request.by === "count") return evenPageSplitLines(request.count);
        const length = axis === "rows" ? size?.height : size?.width;
        return length ? spacedPageSplitLines(length, request.spacingCm) : base[axis];
      };
      const next = Object.freeze({
        rows: normalizePageSplitLines(linesFor("rows")),
        columns: normalizePageSplitLines(linesFor("columns")),
      });
      if (settings.adjust === "batch" || !rangeSet.has(page)) {
        setBatch(next);
        setOverrides(new Map());
      } else {
        writeGrid(page, next);
      }
      setSelected(null);
      setPopover(null);
    },
    [batch, currentPage, gridFor, pageCount, pageSizeCm, rangeSet, settings.adjust, writeGrid],
  );

  const applySettings = useCallback((next: PdfSplitModeSettings) => {
    setSettings(next);
    setSelected(null);
    setPopover(null);
  }, []);

  const splitNow = useCallback(async (): Promise<PdfSplitModeOutcome> => {
    const write = onSplitPages;
    if (!write || busy) return { kind: "refused", message: messages.failed };
    if (!rangePages) return { kind: "refused", message: messages.rangeInvalid };
    const pages = rangePages
      .map((page) => ({ pageNumber: page, grid: overrides.get(page) ?? batch }))
      .filter(({ grid }) => pageSplitGridIsWritable(grid));
    if (pages.length === 0) return { kind: "refused", message: messages.nothingToSplit };
    if (pages.length > PDF_NATIVE_PAGE_SPLIT_MAX_PAGES) {
      return { kind: "refused", message: messages.tooManyPages };
    }
    setBusy(true);
    setPopover(null);
    try {
      const written = await write({ keepOriginal: settings.keepOriginal, pages });
      if (!written) return { kind: "refused", message: messages.failed };
      if (mountedRef.current) exit();
      return { kind: "split", pages: pages.length };
    } catch (error) {
      return {
        kind: "refused",
        message: error instanceof Error && error.message ? error.message : messages.failed,
      };
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [batch, busy, exit, messages, onSplitPages, overrides, rangePages, settings.keepOriginal]);

  // Escape leaves the mode (a popover closes first); Delete removes the
  // selected line.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (popover) setPopover(null);
        else if (!busy) exit();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selected && !busy) {
        event.preventDefault();
        deleteSelected();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, busy, deleteSelected, exit, popover, selected]);

  const view: PdfSplitPageModeView = {
    active,
    busy,
    selected,
    gridFor,
    select: setSelected,
    moveLine,
    label: messages.lineLabel,
  };

  return {
    view,
    active,
    busy,
    settings,
    popover,
    setPopover,
    selected,
    enter,
    exit,
    addLines,
    deleteSelected,
    applySettings,
    splitNow,
    pageSizeCm,
    maxLines: PDF_NATIVE_PAGE_SPLIT_MAX_LINES,
    batchGrid: batch,
  };
}
