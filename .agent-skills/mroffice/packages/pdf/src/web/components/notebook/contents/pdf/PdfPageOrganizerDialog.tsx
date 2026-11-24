"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckSquare2,
  GripVertical,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Trash2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { FileOutput } from "lucide-react";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeContextMenuIcon } from "@mrnote/core/web/components/office-ribbon/officeContextMenuIcons.tsx";
import { PointerContextMenu, type PointerContextMenuEntry } from "@mrnote/core/web/components/ui/PointerContextMenu.tsx";
import { OfficeTouchMultiSelectBar } from "@mrnote/core/web/components/office-ribbon/OfficeTouchMultiSelectBar.tsx";
import { latestPointerIsTouchLike } from "@mrnote/core/web/lib/pointer-capability.ts";
import { useTouchMultiSelect } from "@mrnote/core/web/lib/touch-multi-select.ts";
import { useTouchReorder } from "@mrnote/core/web/lib/use-touch-reorder.ts";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  buildPdfPageOrganizerOperations,
  createPdfPageOrganizerDraft,
  deletePdfPageOrganizerPages,
  movePdfPageOrganizerPages,
  reorderPdfPageOrganizerPages,
  rotatePdfPageOrganizerPages,
  selectPdfPagesByPreset,
  PDF_PAGE_SELECTION_PRESETS,
  type PdfPageOrganizerDraft,
  type PdfPageOrganizerOperation,
  type PdfPageSelectionPreset,
} from "../../../../lib/pdf/page-organizer";
import type { PdfRotation } from "@mrnote/core/web/lib/pdf/page-ops.ts";

export interface PdfPageOrganizerPage {
  page: number;
  width: number;
  height: number;
  rotation: PdfRotation;
  /** The card's own name (an inserted blank page): else "第 N 页". */
  label?: string;
}

export interface PdfPageOrganizerDialogProps {
  open: boolean;
  pages: ReadonlyArray<PdfPageOrganizerPage>;
  currentPage: number;
  insertedPageCount?: number;
  onRenderThumbnail?: (
    page: number,
    rotation: PdfRotation,
    canvas: HTMLCanvasElement,
  ) => void | Promise<void>;
  onApply: (operations: PdfPageOrganizerOperation[]) => void;
  onCancel: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** WPS's 页面选择 the grid opens with (else the current page alone). */
  initialSelection?: PdfPageSelectionPreset;
  /** 提取页面: the selected pages, in their order, as a file of their own. */
  onExtractPages?: (pages: number[]) => void;
  /** The pages selected when it opens (else the preset, else the current page). */
  initialSelectedPages?: readonly number[];
  /** Told the selection as it changes (the Page tab's commands act on it). */
  onSelectionChange?: (pages: number[]) => void;
  /** A page's right-click 在前面/后面插入空白页 (ONLYOFFICE's and WPS's
   * thumbnail menu): a blank page put before or after it. Absent, the menu
   * goes without them. */
  onInsertBlankAt?: (page: number, position: "before" | "after") => void;
  /** 复制 then 粘贴到前面/后面: copies of the pages put before or after a
   * page (cut and paste moves them in the grid itself). Absent, the menu
   * offers cut and paste only. */
  onCopyPagesTo?: (pages: number[], page: number, position: "before" | "after") => void;
}

export interface PdfPageOrganizerWorkspaceProps extends Omit<
  PdfPageOrganizerDialogProps,
  "onApply" | "open" | "returnFocusRef"
> {
  mode?: "organize" | "select";
  /** WPS's Page tab: each change is written as it is made (no Apply), the
   * grid stands in for the pages, with a thumbnail size slider. */
  live?: boolean;
  onApply?: PdfPageOrganizerDialogProps["onApply"];
  onSelectionConfirm?: (pages: number[]) => void;
  workspaceConfirmLabel?: string;
  workspaceDescription?: string;
  workspaceTitle?: string;
}

interface PdfPageOrganizerSurfaceProps extends PdfPageOrganizerDialogProps {
  presentation: "dialog" | "workspace";
  live?: boolean;
  workspaceConfirmLabel?: string;
  workspaceDescription?: string;
  workspaceMode?: "organize" | "select";
  workspaceTitle?: string;
  onSelectionConfirm?: (pages: number[]) => void;
}

function pageMap(
  pages: ReadonlyArray<PdfPageOrganizerPage>,
): Map<number, PdfPageOrganizerPage> {
  return new Map(pages.map((page) => [page.page, page]));
}

function selectedInOrder(
  order: ReadonlyArray<number>,
  selected: ReadonlySet<number>,
): number[] {
  return order.filter((page) => selected.has(page));
}

function PdfPageOrganizerSurface({
  open,
  pages,
  currentPage,
  insertedPageCount = 0,
  onRenderThumbnail,
  onApply,
  onCancel,
  returnFocusRef,
  initialSelection,
  onExtractPages,
  initialSelectedPages,
  onSelectionChange,
  onInsertBlankAt,
  onCopyPagesTo,
  live = false,
  presentation,
  workspaceConfirmLabel,
  workspaceDescription,
  workspaceMode = "organize",
  workspaceTitle,
  onSelectionConfirm,
}: PdfPageOrganizerSurfaceProps) {
  const t = useTranslations("console-notebooks");
  const selectionMode =
    presentation === "workspace" && workspaceMode === "select";
  const initialOrder = useMemo(() => pages.map((page) => page.page), [pages]);
  const initialRotations = useMemo(
    () =>
      Object.fromEntries(
        pages.map((page) => [page.page, page.rotation]),
      ) as Record<number, PdfRotation>,
    [pages],
  );
  const pagesByNumber = useMemo(() => pageMap(pages), [pages]);
  const initialSelectedPage = initialOrder.includes(currentPage)
    ? currentPage
    : initialOrder[0];
  const [draft, setDraft] = useState(() =>
    createPdfPageOrganizerDraft({
      order: initialOrder,
      rotations: initialRotations,
    }),
  );
  const pageSizes = useMemo(
    () => new Map(pages.map((page) => [page.page, { width: page.width, height: page.height }])),
    [pages],
  );
  const [selected, setSelected] = useState<Set<number>>(() =>
    initialSelectedPages?.some((page) => initialOrder.includes(page))
      ? new Set(initialSelectedPages.filter((page) => initialOrder.includes(page)))
      : initialSelection
      ? new Set(selectPdfPagesByPreset({
          order: initialOrder, sizes: pageSizes, rotations: initialRotations, preset: initialSelection,
        }))
      : new Set(initialSelectedPage ? [initialSelectedPage] : []),
  );
  const selectByPreset = (preset: PdfPageSelectionPreset) => {
    const picked = selectPdfPagesByPreset({
      order: draft.order, sizes: pageSizes, rotations: draft.rotations, preset,
    });
    setSelected(new Set(picked));
    selectionAnchorRef.current = picked[0] ?? null;
  };
  const [visiblePreviews, setVisiblePreviews] = useState<Set<number>>(
    () => new Set(initialOrder.length <= 24 ? initialOrder : []),
  );
  const [deleteError, setDeleteError] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  // The grid mounts with the dialog's body, after the first render: the
  // reorder below attaches when it does.
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
  const firstCardRef = useRef<HTMLButtonElement | null>(null);
  const selectionAnchorRef = useRef<number | null>(initialSelectedPage ?? null);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    if (!open || presentation !== "workspace") return;
    const timer = window.setTimeout(() => firstCardRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, presentation]);

  useEffect(() => {
    if (!open) return;
    // Small documents paint every thumbnail immediately; large documents use
    // the observer below so opening a 500-page organizer does not start 500
    // pdf.js render tasks at once.
    if (draft.order.length <= 24) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(
        () => setVisiblePreviews(new Set(draft.order)),
        0,
      );
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const next: number[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const page = Number(entry.target.getAttribute("data-page-number"));
          if (Number.isInteger(page) && page > 0) next.push(page);
        }
        if (next.length === 0) return;
        setVisiblePreviews((previous) => {
          const updated = new Set(previous);
          let changed = false;
          for (const page of next) {
            if (updated.has(page)) continue;
            updated.add(page);
            changed = true;
          }
          return changed ? updated : previous;
        });
      },
      {
        root: gridRef.current,
        rootMargin: "180px",
      },
    );
    cardRefs.current.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [draft.order, open]);

  useEffect(() => {
    if (!open || !onRenderThumbnail) return;
    let cancelled = false;
    const renderVisiblePreviews = () => {
      for (const page of visiblePreviews) {
        if (!draft.order.includes(page)) continue;
        const canvas = canvasRefs.current.get(page);
        if (!canvas) continue;
        const rotation = draft.rotations[page] ?? 0;
        const renderKey = `${page}:${rotation}`;
        if (canvas.dataset.renderKey === renderKey) continue;
        canvas.dataset.renderKey = renderKey;
        canvas.dataset.renderState = "loading";
        void Promise.resolve(onRenderThumbnail(page, rotation, canvas))
          .then(() => {
            if (
              cancelled ||
              !canvas.isConnected ||
              canvas.dataset.renderKey !== renderKey
            ) {
              return;
            }
            canvas.dataset.renderState = "ready";
          })
          .catch(() => {
            if (
              cancelled ||
              !canvas.isConnected ||
              canvas.dataset.renderKey !== renderKey
            ) {
              return;
            }
            canvas.dataset.renderState = "error";
          });
      }
    };
    renderVisiblePreviews();
    // Radix mounts dialog portal content after the owning component's first
    // passive effect. Retry once so newly attached canvases receive their
    // initial thumbnail without requiring an unrelated state change.
    const mountRetry = window.setTimeout(renderVisiblePreviews, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(mountRetry);
    };
  }, [draft.order, draft.rotations, onRenderThumbnail, open, visiblePreviews]);

  const selectedPages = useMemo(
    () => selectedInOrder(draft.order, selected),
    [draft.order, selected],
  );
  const dragHint = t("pdf.organizer.dragHint", {
    key: typeof navigator !== "undefined" && /Mac|iPhone|iPad/u.test(navigator.platform || navigator.userAgent)
      ? "Command" : "Ctrl",
  });
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  useEffect(() => {
    onSelectionChangeRef.current?.(selectedPages);
  }, [selectedPages]);
  // Live (WPS's Page tab): a change is written at once, as the steps from
  // the grid as it stood to the grid as it is now.
  const changeDraft = (next: PdfPageOrganizerDraft) => {
    if (next === draft) return;
    setDraft(next);
    if (!live) return;
    const steps = buildPdfPageOrganizerOperations({
      initialOrder: draft.order,
      initialRotations: draft.rotations,
      draft: next,
    });
    if (steps.length > 0) onApply(steps);
  };
  const [cardSize, setCardSize] = useState(144);
  const operations = useMemo(
    () =>
      buildPdfPageOrganizerOperations({
        initialOrder,
        initialRotations,
        draft,
      }),
    [draft, initialOrder, initialRotations],
  );
  const deleteCount = operations.filter(
    (operation) => operation.op === "delete_pdf_page",
  ).length;
  const rotationCount = operations.filter(
    (operation) => operation.op === "rotate_pdf_page",
  ).length;
  const moveCount = operations.filter(
    (operation) => operation.op === "move_pdf_page",
  ).length;

  const selectPage = useCallback(
    (page: number, event: MouseEvent<HTMLButtonElement>) => {
      setDeleteError(false);
      setSelected((previous) => {
        const next = new Set(previous);
        const anchor = selectionAnchorRef.current;
        if (event.shiftKey && anchor != null) {
          const from = draft.order.indexOf(anchor);
          const to = draft.order.indexOf(page);
          if (from >= 0 && to >= 0) {
            if (!event.metaKey && !event.ctrlKey) next.clear();
            const start = Math.min(from, to);
            const end = Math.max(from, to);
            for (let index = start; index <= end; index += 1) {
              next.add(draft.order[index]);
            }
            return next;
          }
        }
        if (event.metaKey || event.ctrlKey) {
          if (next.has(page)) next.delete(page);
          else next.add(page);
        } else {
          next.clear();
          next.add(page);
        }
        selectionAnchorRef.current = page;
        return next;
      });
    },
    [draft.order],
  );

  // Fingers select several pages as PowerPoint for iPad selects several
  // objects (P-11): a finger resting on a selected page while another taps
  // pages adds or removes them, as does every tap after that until Done; a
  // still hold on a page (its touch menu) starts the same mode with that
  // page selected. The Shift / Ctrl clicks above stay the mouse's path.
  const touchMultiSelect = useTouchMultiSelect({
    count: selectedPages.length,
    root: () => gridRef.current,
  });
  const touchToggledPageRef = useRef<number | null>(null);
  const togglePageSelected = (page: number, keep = false) => {
    setDeleteError(false);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(page) && !keep) next.delete(page);
      else next.add(page);
      return next;
    });
    selectionAnchorRef.current = page;
  };

  const rotateSelection = (quarterTurns: -1 | 1) => {
    if (selectedPages.length === 0) return;
    setDeleteError(false);
    changeDraft(rotatePdfPageOrganizerPages(draft, selectedPages, quarterTurns));
  };

  const moveSelection = (direction: -1 | 1) => {
    if (selectedPages.length === 0) return;
    setDeleteError(false);
    changeDraft(movePdfPageOrganizerPages(draft, selectedPages, direction));
  };

  const deleteSelection = () => {
    if (selectedPages.length === 0) return;
    const current = draft;
    const result = deletePdfPageOrganizerPages(current, selectedPages);
    setDeleteError(result.rejected);
    if (result.rejected || result.draft === current) return;
    const firstDeletedIndex = Math.min(
      ...selectedPages.map((page) => current.order.indexOf(page)),
    );
    const nextFocus =
      result.draft.order[
        Math.min(firstDeletedIndex, result.draft.order.length - 1)
      ];
    setSelected(new Set(nextFocus ? [nextFocus] : []));
    selectionAnchorRef.current = nextFocus ?? null;
    window.setTimeout(() => {
      gridRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-organizer-page="${nextFocus}"]`,
        )
        ?.focus();
    }, 0);
    changeDraft(result.draft);
  };

  // The page's own menu (ONLYOFFICE's and WPS's thumbnail menu), in the
  // live grid: cut, copy and paste before or after a page, a blank page
  // before or after it, rotate, delete -- each on the selection, the page
  // pressed joining it as Office selects on a right click.
  const [pageMenu, setPageMenu] = useState<Readonly<{ x: number; y: number; page: number }> | null>(null);
  const [pageClipboard, setPageClipboard] = useState<Readonly<{ mode: "copy" | "cut"; pages: number[] }> | null>(null);
  const openPageMenu = (page: number, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!selected.has(page)) {
      setSelected(new Set([page]));
      selectionAnchorRef.current = page;
    }
    setPageMenu({ x: event.clientX, y: event.clientY, page });
  };
  const pasteAt = (page: number, position: "before" | "after") => {
    const clipboard = pageClipboard;
    if (!clipboard) return;
    if (clipboard.mode === "cut") {
      const moving = clipboard.pages.filter((candidate) => draft.order.includes(candidate));
      setPageClipboard(null);
      if (moving.length === 0 || moving.includes(page)) return;
      setDeleteError(false);
      changeDraft(reorderPdfPageOrganizerPages(draft, moving, page, position === "after"));
      return;
    }
    onCopyPagesTo?.(clipboard.pages, page, position);
  };
  const pageMenuEntries = (page: number): PointerContextMenuEntry[] => {
    const pagesInMenu = selected.has(page) ? selectedPages : [page];
    const pasteReason = pageClipboard === null || (pageClipboard.mode === "copy" && !onCopyPagesTo);
    const entries: PointerContextMenuEntry[] = [
      {
        id: "cut",
        label: t("toolbar.cut"),
        icon: officeContextMenuIcon("cut"),
        onSelect: () => setPageClipboard({ mode: "cut", pages: [...pagesInMenu] }),
        testId: "pdf-page-menu-cut",
      },
      ...(onCopyPagesTo
        ? [{
            id: "copy",
            label: t("toolbar.copy"),
            icon: officeContextMenuIcon("copy"),
            onSelect: () => setPageClipboard({ mode: "copy" as const, pages: [...pagesInMenu] }),
            testId: "pdf-page-menu-copy",
          }]
        : []),
      {
        id: "paste-before",
        label: t("pdf.organizer.pasteBefore"),
        icon: officeContextMenuIcon("paste"),
        disabled: pasteReason,
        onSelect: () => pasteAt(page, "before"),
        testId: "pdf-page-menu-paste-before",
      },
      {
        id: "paste-after",
        label: t("pdf.organizer.pasteAfter"),
        icon: officeContextMenuIcon("paste"),
        disabled: pasteReason,
        onSelect: () => pasteAt(page, "after"),
        testId: "pdf-page-menu-paste-after",
      },
    ];
    if (onInsertBlankAt) {
      entries.push(
        { id: "separator-insert", separator: true },
        {
          id: "insert-blank-before",
          label: t("pdf.organizer.insertBlankBefore"),
          icon: officeContextMenuIcon("insert"),
          onSelect: () => onInsertBlankAt(page, "before"),
          testId: "pdf-page-menu-insert-blank-before",
        },
        {
          id: "insert-blank-after",
          label: t("pdf.organizer.insertBlankAfter"),
          icon: officeContextMenuIcon("insert"),
          onSelect: () => onInsertBlankAt(page, "after"),
          testId: "pdf-page-menu-insert-blank-after",
        },
      );
    }
    entries.push(
      { id: "separator-rotate", separator: true },
      {
        id: "rotate-right",
        label: t("pdf.organizer.rotateRight"),
        icon: <RotateCw size={16} />,
        onSelect: () => rotateSelection(1),
        testId: "pdf-page-menu-rotate-right",
      },
      {
        id: "rotate-left",
        label: t("pdf.organizer.rotateLeft"),
        icon: <RotateCcw size={16} />,
        onSelect: () => rotateSelection(-1),
        testId: "pdf-page-menu-rotate-left",
      },
      { id: "separator-delete", separator: true },
      {
        id: "delete",
        label: t("pdf.organizer.delete"),
        icon: <Trash2 size={16} />,
        danger: true,
        onSelect: deleteSelection,
        testId: "pdf-page-menu-delete",
      },
    );
    return entries;
  };

  const focusPageCard = (page: number) => {
    window.setTimeout(() => {
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`[data-organizer-page="${page}"]`)
        ?.focus();
    }, 0);
  };

  const handleCardKeyDown = (
    page: number,
    index: number,
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    const accelerator = event.metaKey || event.ctrlKey;
    const key = event.key;
    if (accelerator && !event.altKey && key.toLowerCase() === "a") {
      event.preventDefault();
      setDeleteError(false);
      setSelected(new Set(draft.order));
      selectionAnchorRef.current = page;
      return;
    }
    if (selectionMode && (key === "Delete" || key === "Backspace")) {
      event.preventDefault();
      return;
    }
    if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      deleteSelection();
      return;
    }
    if (
      !selectionMode &&
      accelerator &&
      !event.altKey &&
      (key === "ArrowLeft" ||
        key === "ArrowUp" ||
        key === "ArrowRight" ||
        key === "ArrowDown")
    ) {
      event.preventDefault();
      moveSelection(
        key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1,
      );
      return;
    }
    const targetIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? draft.order.length - 1
          : key === "ArrowLeft" || key === "ArrowUp"
            ? Math.max(0, index - 1)
            : key === "ArrowRight" || key === "ArrowDown"
              ? Math.min(draft.order.length - 1, index + 1)
              : null;
    if (targetIndex === null || targetIndex === index) return;
    const targetPage = draft.order[targetIndex];
    if (targetPage === undefined) return;
    event.preventDefault();
    setDeleteError(false);
    if (event.shiftKey) {
      const anchor = selectionAnchorRef.current ?? page;
      const anchorIndex = draft.order.indexOf(anchor);
      if (anchorIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        setSelected(new Set(draft.order.slice(start, end + 1)));
      }
    } else {
      setSelected(new Set([targetPage]));
      selectionAnchorRef.current = targetPage;
    }
    focusPageCard(targetPage);
  };

  // A card dragged next to another moves there, with the other selected
  // cards when it is one of them: by the pointer path (the mouse once it
  // travels past a click, a finger after a hold), as the deck's slide sorter
  // does. HTML5 drag could stay stuck to the pointer in Safari when the grid
  // re-rendered under the press, the card floating beside it.
  useTouchReorder(
    gridElement,
    {
      idAttribute: "data-page-number",
      itemSelector: ".pdf-page-organizer__card",
      orientation: "grid",
      keyboard: false,
      mouse: true,
      enabled: open && !selectionMode && !touchMultiSelect.active,
      movingIds: (id) => {
        const page = Number(id);
        return selected.has(page) ? selectedPages.map(String) : [id];
      },
      onLift: (id) => {
        const page = Number(id);
        if (!selected.has(page)) {
          setSelected(new Set([page]));
          selectionAnchorRef.current = page;
        }
      },
      onReorder: ({ ids, targetId, position }) => {
        const moving = ids.map(Number).filter(Number.isInteger);
        const target = Number(targetId);
        if (moving.length === 0 || moving.includes(target)) return;
        changeDraft(
          reorderPdfPageOrganizerPages(draft, moving, target, position === "after"),
        );
      },
    },
    draft.order.length,
  );

  const title =
    presentation === "workspace" && workspaceTitle
      ? workspaceTitle
      : t("pdf.organizer.title");
  const description =
    presentation === "workspace" && workspaceDescription
      ? workspaceDescription
      : t("pdf.organizer.description");
  const workspaceContent = (
    <>
      <style>{`
        .pdf-page-organizer__workspace {
          background: var(--office-dialog-surface-muted, #f8fafc);
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }
        .pdf-page-organizer__workspace-header {
          align-items: center;
          background: var(--office-dialog-surface, #ffffff);
          border-bottom: 1px solid var(--office-dialog-divider, #e2e8f0);
          display: flex;
          gap: 14px;
          padding: 12px 18px;
        }
        .pdf-page-organizer__workspace-heading {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        .pdf-page-organizer__workspace-heading strong {
          color: var(--office-dialog-ink, #0f172a);
          font-size: 15px;
        }
        .pdf-page-organizer__workspace-heading p {
          color: var(--office-dialog-muted, #64748b);
          font-size: 12px;
          margin: 0;
        }
        .pdf-page-organizer__workspace-content {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          min-height: 0;
          overflow: hidden;
        }
        .pdf-page-organizer__workspace-actions {
          align-items: center;
          background: var(--office-dialog-surface, #ffffff);
          border-top: 1px solid var(--office-dialog-divider, #e2e8f0);
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          padding: 10px 18px;
        }
        .pdf-page-organizer__workspace-actions button {
          border: 1px solid var(--office-dialog-control-border, #dbe3ec);
          border-radius: 8px;
          min-height: 44px;
          min-width: 44px;
          padding: 0 14px;
        }
        .pdf-page-organizer__workspace-actions button:last-child {
          background: var(--office-dialog-accent, #0f766e);
          border-color: var(--office-dialog-accent, #0f766e);
          color: #ffffff;
        }
        .pdf-page-organizer__workspace-actions button:disabled {
          cursor: not-allowed;
          opacity: 0.42;
        }
        .pdf-page-organizer__toolbar {
          align-items: center;
          background: var(--office-dialog-surface, #ffffff);
          border-bottom: 1px solid var(--office-dialog-divider, #e2e8f0);
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          padding: 10px 18px;
        }
        /* In the dialog the toolbar's buttons are the chrome's compact
           buttons. The page-replace workspace is a reader surface, not a
           dialog, and draws its own. */
        .pdf-page-organizer__workspace .pdf-page-organizer__toolbar button {
          align-items: center;
          background: var(--office-dialog-surface, #ffffff);
          border: 1px solid var(--office-dialog-control-border, #dbe3ec);
          border-radius: 8px;
          color: var(--office-dialog-ink, #334155);
          cursor: pointer;
          display: inline-flex;
          font-size: 12px;
          font-weight: 650;
          gap: 6px;
          height: 44px;
          justify-content: center;
          min-height: 44px;
          min-width: 44px;
          padding: 0 10px;
        }
        .pdf-page-organizer__workspace .pdf-page-organizer__toolbar button:hover:not(:disabled) {
          background: var(--office-dialog-accent-soft, #f0fdfa);
          border-color: rgba(13, 148, 136, 0.4);
          color: var(--office-dialog-accent, #0f766e);
        }
        .pdf-page-organizer__workspace .pdf-page-organizer__toolbar button:disabled {
          cursor: not-allowed;
          opacity: 0.42;
        }
        .pdf-page-organizer__workspace .pdf-page-organizer__toolbar button.is-danger:hover:not(:disabled) {
          background: var(--office-dialog-danger-soft, #fef2f2);
          border-color: var(--office-dialog-danger-line, #fecaca);
          color: var(--office-dialog-danger, #b91c1c);
        }
        .pdf-page-organizer__toolbar-divider {
          background: var(--office-dialog-surface-muted, #e2e8f0);
          height: 22px;
          margin: 0 2px;
          width: 1px;
        }
        .pdf-page-organizer__selection-count {
          color: var(--office-dialog-muted, #64748b);
          font-size: 12px;
          font-variant-numeric: tabular-nums;
          margin-left: auto;
        }
        .pdf-page-organizer__body {
          display: grid;
          max-height: min(620px, calc(100vh - 320px));
          min-height: 0;
          overflow: hidden;
          position: relative;
        }
        .pdf-page-organizer__workspace .pdf-page-organizer__body {
          max-height: none;
        }
        .pdf-page-organizer__notice {
          align-items: flex-start;
          background: var(--office-dialog-warning-soft, #fffbeb);
          border: 1px solid var(--office-dialog-warning-line, #fde68a);
          border-radius: 9px;
          color: var(--office-dialog-warning, #92400e);
          display: flex;
          font-size: 11.5px;
          gap: 8px;
          line-height: 1.45;
          margin: 14px 18px 0;
          padding: 9px 11px;
        }
        .pdf-page-organizer__error {
          background: var(--office-dialog-danger-soft, #fef2f2);
          border: 1px solid var(--office-dialog-danger-line, #fecaca);
          border-radius: 9px;
          color: var(--office-dialog-danger, #b91c1c);
          font-size: 12px;
          margin: 14px 18px 0;
          padding: 9px 11px;
        }
        .pdf-page-organizer__grid {
          align-content: start;
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(auto-fill, minmax(var(--pdf-organizer-card, 144px), 1fr));
          min-height: 0;
          overflow: auto;
          padding: 18px;
        }
        .pdf-page-organizer__card {
          background: var(--office-dialog-surface, #ffffff);
          border: 1px solid var(--office-dialog-control-border, #dbe3ec);
          border-radius: 11px;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
          min-width: 0;
          padding: 7px;
          position: relative;
          transition:
            border-color 130ms ease,
            box-shadow 130ms ease,
            transform 130ms ease;
        }
        .pdf-page-organizer__card:hover {
          border-color: var(--office-dialog-control-border-hover, #94a3b8);
          box-shadow: 0 8px 22px rgba(15, 23, 42, 0.09);
          transform: translateY(-1px);
        }
        .pdf-page-organizer__card.is-selected {
          border-color: var(--office-dialog-accent, #0d9488);
          box-shadow:
            0 0 0 2px rgba(13, 148, 136, 0.14),
            0 9px 24px rgba(15, 118, 110, 0.12);
        }
        .pdf-page-organizer__card.is-drop-before::before,
        .pdf-page-organizer__card.is-drop-after::after {
          background: var(--office-dialog-accent, #0d9488);
          border-radius: 2px;
          bottom: 7px;
          content: "";
          position: absolute;
          top: 7px;
          width: 3px;
          z-index: 3;
        }
        .pdf-page-organizer__card.is-drop-before::before { left: -8px; }
        .pdf-page-organizer__card.is-drop-after::after { right: -8px; }
        .pdf-page-organizer__card-button {
          align-items: stretch;
          background: transparent;
          border: 0;
          color: inherit;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 0;
          text-align: left;
          width: 100%;
        }
        .pdf-page-organizer__preview {
          align-items: center;
          background: linear-gradient(135deg, rgba(226, 232, 240, 0.58) 25%, transparent 25%) 0 0 / 12px 12px,
            linear-gradient(315deg, rgba(226, 232, 240, 0.58) 25%, transparent 25%) 0 0 / 12px 12px,
            var(--office-dialog-surface-muted, #f8fafc);
          border: 1px solid var(--office-dialog-divider, #e2e8f0);
          border-radius: 7px;
          display: flex;
          height: 154px;
          justify-content: center;
          overflow: hidden;
          position: relative;
        }
        .pdf-page-organizer__preview canvas {
          background: var(--office-dialog-surface, #ffffff);
          box-shadow: 0 2px 9px rgba(15, 23, 42, 0.13);
          display: block;
          max-height: 142px;
          max-width: 128px;
        }
        .pdf-page-organizer__preview-fallback {
          align-items: center;
          color: var(--office-dialog-muted, #94a3b8);
          display: flex;
          inset: 0;
          justify-content: center;
          position: absolute;
          z-index: 0;
        }
        .pdf-page-organizer__preview canvas {
          position: relative;
          z-index: 1;
        }
        .pdf-page-organizer__card-meta {
          align-items: center;
          display: flex;
          gap: 6px;
          min-width: 0;
        }
        .pdf-page-organizer__check {
          align-items: center;
          background: var(--office-dialog-surface, #ffffff);
          border: 1px solid var(--office-dialog-control-border, #cbd5e1);
          border-radius: 5px;
          color: transparent;
          display: inline-flex;
          height: 18px;
          justify-content: center;
          width: 18px;
        }
        .is-selected .pdf-page-organizer__check {
          background: var(--office-dialog-accent, #0d9488);
          border-color: var(--office-dialog-accent, #0d9488);
          color: #ffffff;
        }
        .pdf-page-organizer__page-label {
          color: var(--office-dialog-ink, #334155);
          font-size: 12px;
          font-variant-numeric: tabular-nums;
          font-weight: 700;
        }
        .pdf-page-organizer__badge {
          background: var(--office-dialog-surface-muted, #f1f5f9);
          border-radius: 999px;
          color: var(--office-dialog-muted, #64748b);
          font-size: 10px;
          margin-left: auto;
          max-width: 76px;
          overflow: hidden;
          padding: 2px 6px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pdf-page-organizer__badge.is-current {
          background: var(--office-dialog-accent-soft, #ccfbf1);
          color: var(--office-dialog-accent, #0f766e);
        }
        .pdf-page-organizer__rotation {
          align-items: center;
          background: rgba(15, 23, 42, 0.76);
          border-radius: 999px;
          color: #ffffff;
          display: inline-flex;
          font-size: 10px;
          font-variant-numeric: tabular-nums;
          gap: 3px;
          padding: 3px 6px;
          position: absolute;
          right: 6px;
          top: 6px;
          z-index: 2;
        }
        .pdf-page-organizer__drag {
          align-items: center;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 6px;
          color: var(--office-dialog-muted, #64748b);
          display: flex;
          left: 6px;
          padding: 3px 2px;
          position: absolute;
          top: 6px;
          z-index: 2;
        }
        .pdf-page-organizer__summary {
          align-items: center;
          color: var(--office-dialog-muted, #64748b);
          display: flex;
          font-size: 11.5px;
          gap: 8px;
          line-height: 1.4;
          min-width: 0;
        }
        .pdf-page-organizer__summary svg {
          color: var(--office-dialog-accent, #0d9488);
          flex: 0 0 auto;
        }
        .pdf-page-organizer__toolbar button:focus-visible,
        .pdf-page-organizer__card-button:focus-visible {
          outline: 3px solid rgba(13, 148, 136, 0.24);
          outline-offset: 2px;
        }
        @media (max-width: 700px) {
          .pdf-page-organizer__toolbar button span { display: none; }
          .pdf-page-organizer__selection-count {
            margin-left: 0;
            width: 100%;
          }
          .pdf-page-organizer__grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            padding: 12px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .pdf-page-organizer__card { transition: none; }
        }
        /* A card's preview stands over its name. In a page window the
           window's blanket button rule (.native-page-window button, an
           inline-flex 36px pill) out-ranked the card's class and set the name
           beside the thumbnail, one character a row ("第/1/页", owner 11-08). */
        .pdf-page-organizer__grid .pdf-page-organizer__card .pdf-page-organizer__card-button {
          align-items: stretch;
          background: transparent;
          border: 0;
          border-radius: 0;
          display: flex;
          flex-direction: column;
          font-size: inherit;
          gap: 7px;
          padding: 0;
        }
        /* WPS's page view: the thumbnails centred on the page's grey, each
           with its 第N页 under it, the picked ones framed; a hint line
           above in place of a second row of the ribbon's commands. */
        .pdf-page-organizer__workspace[data-live] {
          background: var(--office-page-gutter, #eef0f3);
        }
        .pdf-page-organizer__hint-bar {
          align-items: center;
          display: grid;
          gap: 12px;
          /* The hint stays centred while the row has room; when the page
             view is narrowed (a pane open beside it) the count and the size
             keep their own width and the hint gives way, ending in an
             ellipsis, never drawn over them. */
          grid-template-columns: minmax(0, 1fr) minmax(0, max-content) minmax(max-content, 1fr);
          padding: 10px 18px 2px;
        }
        .pdf-page-organizer__hint {
          color: var(--office-dialog-muted, #6b7280);
          font-size: 12.5px;
          min-width: 0;
          overflow: hidden;
          text-align: center;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pdf-page-organizer__hint-tools {
          align-items: center;
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }
        .pdf-page-organizer__hint-tools .pdf-page-organizer__selection-count {
          margin-left: 0;
          white-space: nowrap;
        }
        .pdf-page-organizer__hint-tools .pdf-page-organizer__size {
          width: 112px;
        }
        [data-live] .pdf-page-organizer__grid {
          gap: 22px 26px;
          grid-template-columns: repeat(auto-fill, var(--pdf-organizer-card, 144px));
          justify-content: center;
          padding: 18px 24px 32px;
        }
        [data-live] .pdf-page-organizer__card,
        [data-live] .pdf-page-organizer__card:hover,
        [data-live] .pdf-page-organizer__card.is-selected {
          background: transparent;
          border: 0;
          box-shadow: none;
          padding: 0;
          transform: none;
        }
        [data-live] .pdf-page-organizer__preview {
          background: transparent;
          border: 0;
          border-radius: 2px;
          height: calc(var(--pdf-organizer-card, 144px) * 1.12);
          outline: 2px solid transparent;
          outline-offset: 2px;
        }
        [data-live] .pdf-page-organizer__preview canvas {
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.16);
          max-height: calc(var(--pdf-organizer-card, 144px) * 1.12);
          max-width: var(--pdf-organizer-card, 144px);
        }
        [data-live] .pdf-page-organizer__card:hover .pdf-page-organizer__preview {
          outline-color: var(--office-dialog-control-border-hover, #c3cad5);
        }
        [data-live] .pdf-page-organizer__card.is-selected .pdf-page-organizer__preview {
          outline-color: var(--office-dialog-accent, #0d9488);
        }
        .pdf-page-organizer__card-meta.is-live {
          justify-content: center;
        }
        .pdf-page-organizer__card-meta.is-live .pdf-page-organizer__page-label {
          font-weight: 500;
          overflow: hidden;
          text-align: center;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pdf-page-organizer__page-name {
          color: var(--office-dialog-muted, #6b7280);
        }
        .is-selected .pdf-page-organizer__card-meta.is-live .pdf-page-organizer__page-label {
          color: var(--office-dialog-accent, #0f766e);
        }
        @media (max-width: 700px) {
          .pdf-page-organizer__hint-bar { grid-template-columns: minmax(0, 1fr); }
          .pdf-page-organizer__hint-bar > span:first-child { display: none; }
          .pdf-page-organizer__hint-tools { justify-content: center; }
        }
      `}</style>
      {live ? (
        // WPS's page view: no second row of the ribbon's commands (rotate,
        // delete, extract and 页面选择 are the Page tab's; cut, copy, paste,
        // a blank page and rotate are each page's own menu; moving is a
        // drag), only how to pick and move pages, the count and the size.
        <div className="pdf-page-organizer__hint-bar" data-testid="pdf-page-organizer-hint-bar">
          <span aria-hidden />
          <span className="pdf-page-organizer__hint" title={dragHint}>
            {dragHint}
          </span>
          <span className="pdf-page-organizer__hint-tools">
          {touchMultiSelect.active ? (
            <OfficeTouchMultiSelectBar
              count={selectedPages.length}
              onDone={touchMultiSelect.exit}
              testId="pdf-page-organizer-touch-multi-select"
            />
          ) : null}
          <span
            className="pdf-page-organizer__selection-count"
            role="status"
            data-testid="pdf-page-organizer-selection-count"
          >
            {t("pdf.organizer.selectionSummary", {
              selected: selectedPages.length,
              total: draft.order.length,
            })}
          </span>
          <input
            type="range"
            min={96}
            max={320}
            step={8}
            value={cardSize}
            aria-label={t("pdf.organizer.thumbnailSize")}
            className="pdf-page-organizer__size"
            data-testid="pdf-page-organizer-thumbnail-size"
            onChange={(event) => setCardSize(Number(event.target.value))}
          />
          </span>
        </div>
      ) : (
      <div className="pdf-page-organizer__toolbar" role="toolbar">
        <button
          type="button"
          className={parts.compactButton}
          onClick={() => {
            const allSelected =
              selectedPages.length === draft.order.length &&
              draft.order.length > 0;
            setSelected(new Set(allSelected ? [] : draft.order));
            selectionAnchorRef.current = allSelected
              ? null
              : (draft.order[0] ?? null);
          }}
          disabled={draft.order.length === 0}
          data-testid="pdf-page-organizer-select-all"
        >
          <CheckSquare2 size={15} />
          <span>
            {selectedPages.length === draft.order.length &&
            draft.order.length > 0
              ? t("pdf.organizer.clearSelection")
              : t("pdf.organizer.selectAll")}
          </span>
        </button>
        {/* WPS 页面选择: all, odd, even, landscape or portrait pages. */}
        <select
          aria-label={t("pdf.organizer.pageSelect")}
          className={parts.compactButton}
          data-testid="pdf-page-organizer-page-select"
          disabled={draft.order.length === 0}
          value=""
          onChange={(event) => {
            const preset = event.target.value as PdfPageSelectionPreset;
            if (PDF_PAGE_SELECTION_PRESETS.includes(preset)) selectByPreset(preset);
          }}
        >
          <option value="" disabled>
            {t("pdf.organizer.pageSelect")}
          </option>
          {PDF_PAGE_SELECTION_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {t(`pdf.organizer.pageSelect_${preset}` as "pdf.organizer.pageSelect_all")}
            </option>
          ))}
        </select>
        {selectionMode ? null : (
          <>
            <span className="pdf-page-organizer__toolbar-divider" aria-hidden />
            <button
              type="button"
              className={parts.compactButton}
              onClick={() => rotateSelection(-1)}
              disabled={selectedPages.length === 0}
              data-testid="pdf-page-organizer-rotate-left"
            >
              <RotateCcw size={15} />
              <span>{t("pdf.organizer.rotateLeft")}</span>
            </button>
            <button
              type="button"
              className={parts.compactButton}
              onClick={() => rotateSelection(1)}
              disabled={selectedPages.length === 0}
              data-testid="pdf-page-organizer-rotate-right"
            >
              <RotateCw size={15} />
              <span>{t("pdf.organizer.rotateRight")}</span>
            </button>
            <span
              className="pdf-page-organizer__toolbar-divider"
              aria-hidden
            />
            <button
              type="button"
              className={parts.compactButton}
              onClick={() => moveSelection(-1)}
              disabled={selectedPages.length === 0}
              data-testid="pdf-page-organizer-move-earlier"
            >
              <ArrowLeft size={15} />
              <span>{t("pdf.organizer.moveEarlier")}</span>
            </button>
            <button
              type="button"
              className={parts.compactButton}
              onClick={() => moveSelection(1)}
              disabled={selectedPages.length === 0}
              data-testid="pdf-page-organizer-move-later"
            >
              <ArrowRight size={15} />
              <span>{t("pdf.organizer.moveLater")}</span>
            </button>
            <button
              type="button"
              className={`${parts.compactButton} is-danger`}
              onClick={deleteSelection}
              disabled={selectedPages.length === 0}
              data-testid="pdf-page-organizer-delete"
            >
              <Trash2 size={15} />
              <span>{t("pdf.organizer.delete")}</span>
            </button>
            {onExtractPages ? (
              <button
                type="button"
                className={parts.compactButton}
                onClick={() => onExtractPages(selectedPages)}
                disabled={selectedPages.length === 0}
                data-testid="pdf-page-organizer-extract"
              >
                <FileOutput size={15} />
                <span>{t("pdf.organizer.extract")}</span>
              </button>
            ) : null}
          </>
        )}
        {touchMultiSelect.active ? (
          <OfficeTouchMultiSelectBar
            count={selectedPages.length}
            onDone={touchMultiSelect.exit}
            testId="pdf-page-organizer-touch-multi-select"
          />
        ) : null}
        <span
          className="pdf-page-organizer__selection-count"
          role="status"
          data-testid="pdf-page-organizer-selection-count"
        >
          {t("pdf.organizer.selectionSummary", {
            selected: selectedPages.length,
            total: draft.order.length,
          })}
        </span>
      </div>
      )}

      <div className="pdf-page-organizer__body">
        {insertedPageCount > 0 ? (
          <div
            className="pdf-page-organizer__notice"
            role="note"
            data-testid="pdf-page-organizer-inserted-notice"
          >
            <ShieldCheck size={15} aria-hidden />
            <span>
              {t("pdf.organizer.insertedPagesPending", {
                count: insertedPageCount,
              })}
            </span>
          </div>
        ) : null}
        {deleteError ? (
          <div
            className="pdf-page-organizer__error"
            role="alert"
            data-testid="pdf-page-organizer-delete-error"
          >
            {t("pdf.organizer.lastPage")}
          </div>
        ) : null}
        <div
          ref={(node) => {
            gridRef.current = node;
            setGridElement(node);
          }}
          className="pdf-page-organizer__grid"
          style={{ "--pdf-organizer-card": `${cardSize}px` } as CSSProperties}
          aria-label={t("pdf.organizer.pageList")}
        >
          {draft.order.map((page, index) => {
            const selectedPage = selected.has(page);
            const pageInfo = pagesByNumber.get(page);
            const rotation = draft.rotations[page] ?? 0;
            const rotated = rotation === 90 || rotation === 270;
            const width = rotated
              ? (pageInfo?.height ?? 792)
              : (pageInfo?.width ?? 612);
            const height = rotated
              ? (pageInfo?.width ?? 612)
              : (pageInfo?.height ?? 792);
            const fallbackStyle = {
              width: `${Math.min(112, Math.max(48, (width / height) * 112))}px`,
              height: `${Math.min(132, Math.max(62, (height / width) * 92))}px`,
              background: "#fff",
              border: "1px solid #cbd5e1",
              boxShadow: "0 2px 9px rgba(15, 23, 42, 0.1)",
            } satisfies CSSProperties;
            return (
              <div
                key={page}
                ref={(node) => {
                  if (node) cardRefs.current.set(page, node);
                  else cardRefs.current.delete(page);
                }}
                className={`pdf-page-organizer__card${
                  selectedPage ? " is-selected" : ""
                }`}
                data-page-number={page}
                // Moved by the pointer path (useTouchReorder above).
                draggable={false}
                data-testid={`pdf-page-organizer-card-${page}`}
                // That path captures the mouse on the card as it is pressed,
                // so a plain click lands on the card, not on its button: it
                // selects here as the button would (it reached nothing and a
                // page could not be picked by the mouse).
                onClick={(event) => {
                  if (event.target !== event.currentTarget) return;
                  selectPage(page, event as unknown as MouseEvent<HTMLButtonElement>);
                }}
              >
                {selectionMode || live ? null : (
                  <span className="pdf-page-organizer__drag" aria-hidden>
                    <GripVertical size={13} />
                  </span>
                )}
                {rotation !== 0 ? (
                  <span
                    className="pdf-page-organizer__rotation"
                    data-testid={`pdf-page-organizer-rotation-${page}`}
                  >
                    <RotateCw size={10} />
                    {rotation}°
                  </span>
                ) : null}
                <button
                  ref={page === initialSelectedPage ? firstCardRef : undefined}
                  type="button"
                  className="pdf-page-organizer__card-button"
                  aria-pressed={selectedPage}
                  aria-label={pageInfo?.label ?? t("pdf.organizer.page", { page })}
                  aria-keyshortcuts="Delete Meta+A Control+A Meta+ArrowUp Meta+ArrowDown Control+ArrowUp Control+ArrowDown"
                  data-organizer-page={page}
                  onPointerDown={(event) => {
                    touchToggledPageRef.current = null;
                    if (!touchMultiSelect.isAdditivePress(event)) return;
                    // a second finger's tap may never become a click
                    event.preventDefault();
                    touchToggledPageRef.current = page;
                    togglePageSelected(page);
                  }}
                  onContextMenu={(event) => {
                    if (!latestPointerIsTouchLike()) {
                      if (live && !selectionMode) openPageMenu(page, event);
                      return;
                    }
                    event.preventDefault();
                    togglePageSelected(page, true);
                    touchMultiSelect.enter();
                  }}
                  onClick={(event) => {
                    if (touchToggledPageRef.current === page) {
                      touchToggledPageRef.current = null;
                      return;
                    }
                    selectPage(page, event);
                  }}
                  onKeyDown={(event) =>
                    handleCardKeyDown(page, index, event)
                  }
                >
                  <span className="pdf-page-organizer__preview">
                    <span
                      className="pdf-page-organizer__preview-fallback"
                      aria-hidden
                    >
                      <span style={fallbackStyle} />
                    </span>
                    <canvas
                      ref={(node) => {
                        if (node) canvasRefs.current.set(page, node);
                        else canvasRefs.current.delete(page);
                      }}
                      aria-hidden
                    />
                  </span>
                  {live ? (
                    // WPS: 第N页 under the thumbnail, by where the page now
                    // stands (a page another tool inserted says so beside it).
                    <span className="pdf-page-organizer__card-meta is-live">
                      <span className="pdf-page-organizer__page-label">
                        {t("pdf.organizer.page", { page: index + 1 })}
                        {pageInfo?.label ? <span className="pdf-page-organizer__page-name"> · {pageInfo.label}</span> : null}
                      </span>
                    </span>
                  ) : (
                  <span className="pdf-page-organizer__card-meta">
                    <span className="pdf-page-organizer__check" aria-hidden>
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="pdf-page-organizer__page-label">
                      {pageInfo?.label ?? t("pdf.organizer.page", { page })}
                    </span>
                    {page === currentPage ? (
                      <span className="pdf-page-organizer__badge is-current">
                        {t("pdf.organizer.current")}
                      </span>
                    ) : (
                      <span className="pdf-page-organizer__badge">
                        {t("pdf.organizer.position", { position: index + 1 })}
                      </span>
                    )}
                  </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {live ? null : (
      <div
        className="pdf-page-organizer__summary"
        data-testid="pdf-page-organizer-summary"
      >
        <ShieldCheck size={16} aria-hidden />
        <span>
          {selectionMode
            ? t("pdf.organizer.replaceTargetsSelected", {
                count: selectedPages.length,
              })
            : operations.length === 0
              ? t("pdf.organizer.noChanges")
              : t("pdf.organizer.pendingSummary", {
                  deleteCount,
                  rotationCount,
                  moveCount,
                })}
        </span>
      </div>
      )}
    </>
  );

  if (presentation === "workspace") {
    return (
      <section
        aria-label={workspaceTitle ?? t("pdf.organizer.title")}
        className="pdf-page-organizer__workspace"
        data-testid="pdf-page-organizer-workspace"
        role="region"
        data-live={live || undefined}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || live) return;
          event.preventDefault();
          onCancel();
        }}
      >
        {live ? null : (
          <header className="pdf-page-organizer__workspace-header">
            <div className="pdf-page-organizer__workspace-heading">
              {title}
              <p>{description}</p>
            </div>
          </header>
        )}
        <div className="pdf-page-organizer__workspace-content">
          {workspaceContent}
        </div>
        {pageMenu ? (
          <PointerContextMenu
            x={pageMenu.x}
            y={pageMenu.y}
            label={t("pdf.organizer.pageMenu")}
            entries={pageMenuEntries(pageMenu.page)}
            onClose={() => {
              setPageMenu(null);
              focusPageCard(pageMenu.page);
            }}
            testId="pdf-page-menu"
          />
        ) : null}
        {live ? null : (
        <footer className="pdf-page-organizer__workspace-actions">
          <button
            type="button"
            data-testid="pdf-page-organizer-workspace-cancel"
            onClick={onCancel}
          >
            {t("pdf.organizer.cancel")}
          </button>
          <button
            type="button"
            data-testid="pdf-page-organizer-workspace-apply"
            disabled={
              selectionMode
                ? selectedPages.length === 0 || !onSelectionConfirm
                : operations.length === 0
            }
            onClick={() => {
              if (selectionMode) onSelectionConfirm?.(selectedPages);
              else onApply(operations);
            }}
          >
            {workspaceConfirmLabel ?? t("pdf.organizer.apply")}
          </button>
        </footer>
        )}
      </section>
    );
  }

  return (
    <OfficeDialogShell
      open={open}
      title={title}
      description={description}
      defaultActionLabel={t("pdf.organizer.apply")}
      cancelActionLabel={t("pdf.organizer.cancel")}
      onDefaultAction={() => onApply(operations)}
      onCancel={onCancel}
      defaultActionDisabled={operations.length === 0}
      initialFocusRef={firstCardRef}
      returnFocusRef={returnFocusRef}
      className="pdf-page-organizer__dialog max-h-[calc(100vh-40px)] overflow-hidden sm:max-w-[1080px]"
      testIdPrefix="pdf-page-organizer"
    >
      {workspaceContent}
    </OfficeDialogShell>
  );
}

export function PdfPageOrganizerWorkspace(
  {
    mode = "organize",
    onApply = () => undefined,
    live = false,
    ...props
  }: PdfPageOrganizerWorkspaceProps,
) {
  return (
    <PdfPageOrganizerSurface
      {...props}
      live={live}
      onApply={onApply}
      open
      presentation="workspace"
      workspaceMode={mode}
    />
  );
}

export default function PdfPageOrganizerDialog(
  props: PdfPageOrganizerDialogProps,
) {
  return <PdfPageOrganizerSurface {...props} presentation="dialog" />;
}
