"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  Highlighter,
  ListChecks,
  Pencil,
  Shapes,
  StickyNote,
  Download,
  Paperclip,
  RefreshCw,
  Trash2,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import commentCardStyles from "@mrnote/core/web/components/office-comments/OfficeCommentsPane.module.css";
import {
  MentionText,
  type CommentMentionsController,
} from "@mrnote/core/web/components/office-comments/CommentMentions.tsx";
import { RibbonDropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import { OfficeTaskPane } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import {
  ANNOTATION_LIST_KINDS,
  filterAnnotationListAdvanced,
  sortAnnotationList,
  type AnnotationListItem,
  type AnnotationListBatchDeleteTarget,
  type AnnotationListKind,
  type AnnotationListMarkup,
} from "../../../../lib/pdf/annotation-list";

import { PDF_TASK_PANE_BODY_CLASS, pdfTaskPaneClassName } from "./pdfTaskPaneDock";

const ANNOTATION_TARGET_CLASS =
  "min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const ANNOTATION_LABEL_TARGET_CLASS =
  "min-h-11 min-w-11 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1";

export interface PdfAnnotationsPanelProps {
  /** @mentions for this page: previews and replies draw mentions as chips. */
  mentions?: CommentMentionsController | null;
  /**
   * The consolidated, uniformly-shaped annotation list (built from the viewer's
   * per-kind state arrays by `buildAnnotationList`). Already sanitized — previews
   * are plain text, colors are inert. Rendering / filtering / sorting are local.
   */
  items: ReadonlyArray<AnnotationListItem>;
  /** Per-kind totals across the UNFILTERED list (drives the filter chip badges). */
  counts: Record<AnnotationListKind, number>;
  /** The document's annotations are still being read (pages not drawn yet):
   * what is listed is not all of them, and the panel says so. */
  reading?: boolean;
  /** Jump to an annotation (the parent resolves its page + navigates). */
  onNavigate: (item: AnnotationListItem) => void;
  /** Export the WHOLE set (ignores the live filter) as a JSON download. */
  onExportJson: () => void;
  /** Export the WHOLE set (ignores the live filter) as a text-summary download. */
  onExportText: () => void;
  /** Export the WHOLE set as a Word .docx download (Acrobat "comments to Word"). */
  onExportDocx: () => void;
  /** True while the server writes the Word file (the item waits). */
  exportDocxPending?: boolean;
  /** Disables interaction (e.g. while the document is still loading). */
  disabled?: boolean;
  /** Number of annotation families whose last authoritative load failed. */
  loadFailureCount?: number;
  /** True while the failed families are being retried. */
  loadRetrying?: boolean;
  /** Retry only the failed annotation families. */
  onRetryLoad?: () => void;
  /** Delete one exact selected set; false retains the complete selection. */
  onDeleteSelected?: (
    targets: readonly AnnotationListBatchDeleteTarget[],
  ) => Promise<boolean>;
  deleteSelectedBusy?: boolean;
  deleteSelectedError?: boolean;
  /**
   * Files pinned to pages as /FileAttachment annotations, read from the
   * document itself. Absent while not yet loaded; empty when the document has
   * none — the section only renders when there is something to show.
   */
  fileAttachments?: ReadonlyArray<{
    /** Null for a file attached to the document, not to a page. */
    page: number | null;
    name: string;
    description: string;
    size: number;
    /** Present on a file placed this session and not yet exported. */
    placedId?: string;
    /** Imported bytes remain listed but cannot be saved when quarantined. */
    downloadDisabledReason?: string;
  }>;
  /** Save one pinned file to disk, by its index in `fileAttachments`. */
  onSaveFileAttachment?: (index: number) => void;
  /** Remove a file placed this session (never touches the document's own). */
  onDeleteFileAttachment?: (
    placedId: string,
  ) => void | boolean | Promise<void | boolean>;
  /** Jump to the page a pinned file sits on. */
  onNavigateToPage?: (page: number) => void;
  /** Closes the pane and returns focus to the navigation rail. */
  onClose?: () => void;
}

/** The comment cards take the user's theme colour, as in every editor. */
const PDF_COMMENT_ACCENT_STYLE = {
  "--office-comments-accent": "var(--user-theme-accent, #b146bd)",
} as CSSProperties;

/** Two letters for a comment avatar, as Docs' comments pane draws them. */
function commentInitials(author: string | undefined, fallback: string): string {
  const value = (author || fallback).trim();
  if (!value) return "?";
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
  }
  return Array.from(value).slice(0, 2).join("").toUpperCase();
}

const KIND_ICON: Record<AnnotationListKind, typeof Highlighter> = {
  highlight: Highlighter,
  note: StickyNote,
  ink: Pencil,
  shape: Shapes,
  bookmark: Bookmark,
};

/**
 * Consolidated comments / annotations sidebar panel (Acrobat's "Comments" pane,
 * WPS's 批注 list). Lists EVERY annotation across all pages — highlights, sticky
 * notes, ink strokes, shapes, user bookmarks — with:
 *
 *   - filter chips (All + one per kind, each badged with its count),
 *   - a page-sorted list (the pure `sortAnnotationList` orders page → kind →
 *     creation order),
 *   - per-row click to jump to the annotation's page,
 *   - an "Export all" menu (JSON or text summary), which always exports the full
 *     set regardless of the active filter.
 *
 * Presentational: only the local filter selection + export-menu open state live
 * here; aggregation / sort / filter / export-string building are the pure
 * `lib/pdf/annotation-list.ts` helpers, so this mirrors PdfOutlinePanel in being
 * testable without the pdf.js stack. Previews come pre-sanitized and are always
 * rendered as React text nodes — never HTML.
 */
/** A file's size the way an attachments list shows it. */
function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PdfAnnotationsPanel({
  mentions = null,
  items,
  counts,
  reading = false,
  onNavigate,
  onExportJson,
  onExportText,
  onExportDocx,
  exportDocxPending = false,
  disabled,
  loadFailureCount = 0,
  loadRetrying = false,
  onRetryLoad,
  onDeleteSelected,
  deleteSelectedBusy = false,
  deleteSelectedError = false,
  fileAttachments,
  onSaveFileAttachment,
  onDeleteFileAttachment,
  onNavigateToPage,
  onClose,
}: PdfAnnotationsPanelProps) {
  const t = useTranslations("console-notebooks");
  const [activePanel, setActivePanel] = useState<"comments" | "attachments">(
    "comments",
  );
  // Active kind filter: null == "All". A single-kind selection is the common
  // case (Acrobat lets you scope by type); the chip toggles it on/off.
  const [activeKind, setActiveKind] = useState<AnnotationListKind | null>(null);
  const [activePage, setActivePage] = useState<number | null>(null);
  const [activeAuthor, setActiveAuthor] = useState<string | null>(null);
  const [activeReviewState, setActiveReviewState] = useState<
    "active" | "resolved" | null
  >(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [attachmentDeletesPending, setAttachmentDeletesPending] = useState<
    Set<string>
  >(() => new Set());
  const batchDeleteInFlightRef = useRef(false);
  const [batchDeleteDispatchPending, setBatchDeleteDispatchPending] =
    useState(false);
  const attachmentCount = fileAttachments?.length ?? 0;
  const effectivePanel =
    activePanel === "attachments" && attachmentCount > 0
      ? "attachments"
      : "comments";
  const panelTabs = [
    {
      id: "comments" as const,
      label: t("pdfViewer.annotationsPanel"),
      count: items.length,
      icon: ListChecks,
    },
    ...(attachmentCount > 0
      ? [
          {
            id: "attachments" as const,
            label: t("pdfViewer.pinnedAttachments", {
              count: attachmentCount,
            }),
            count: attachmentCount,
            icon: Paperclip,
          },
        ]
      : []),
  ];
  const selectAdjacentPanel = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? panelTabs.length - 1
          : (index +
              (event.key === "ArrowRight" ? 1 : -1) +
              panelTabs.length) %
            panelTabs.length;
    const next = panelTabs[target];
    if (!next) return;
    setActivePanel(next.id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .item(target)
      ?.focus();
  };
  // Rows with a reply thread expand/collapse in place (keyed kind:id, so a
  // highlight and a note sharing an id can't shadow each other).
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleThread = (key: string) =>
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const kindLabel = (kind: AnnotationListKind): string => {
    switch (kind) {
      case "highlight":
        return t("pdfViewer.annotationsKindHighlight");
      case "note":
        return t("pdfViewer.annotationsKindNote");
      case "ink":
        return t("pdfViewer.annotationsKindInk");
      case "shape":
        return t("pdfViewer.annotationsKindShape");
      case "bookmark":
        return t("pdfViewer.annotationsKindBookmark");
      default:
        return kind;
    }
  };

  // A text markup row says which markup it is (user audit PDF 0002).
  const markupLabel = (markup: AnnotationListMarkup): string => {
    switch (markup) {
      case "underline":
        return t("pdfViewer.annotationsKindUnderlineOne");
      case "strikeout":
        return t("pdfViewer.annotationsKindStrikeoutOne");
      case "squiggly":
        return t("pdfViewer.annotationsKindSquigglyOne");
      default:
        return t("pdfViewer.annotationsKindHighlightOne");
    }
  };

  const kindLabelSingular = (kind: AnnotationListKind): string => {
    switch (kind) {
      case "highlight":
        return t("pdfViewer.annotationsKindHighlightOne");
      case "note":
        return t("pdfViewer.annotationsKindNoteOne");
      case "ink":
        return t("pdfViewer.annotationsKindInkOne");
      case "shape":
        return t("pdfViewer.annotationsKindShapeOne");
      case "bookmark":
        return t("pdfViewer.annotationsKindBookmarkOne");
      default:
        return kind;
    }
  };

  const pageOptions = useMemo(
    () => [...new Set(items.map((item) => item.page))].sort((a, b) => a - b),
    [items],
  );
  const authorOptions = useMemo(() => {
    const authors = new Map<string, string>();
    for (const item of items) {
      if (item.authorId && item.authorName && !authors.has(item.authorId)) {
        authors.set(item.authorId, item.authorName);
      }
    }
    return [...authors].sort((left, right) => left[1].localeCompare(right[1]));
  }, [items]);
  const hasReviewStates = items.some((item) => item.reviewState !== undefined);
  const effectivePage =
    activePage !== null && pageOptions.includes(activePage) ? activePage : null;
  const effectiveAuthor =
    activeAuthor !== null &&
    authorOptions.some(([authorId]) => authorId === activeAuthor)
      ? activeAuthor
      : null;
  const effectiveReviewState = hasReviewStates ? activeReviewState : null;

  // Sort first (stable, page-ordered), then combine every active filter.
  const visible = useMemo(() => {
    const sorted = sortAnnotationList(items);
    return filterAnnotationListAdvanced(sorted, {
      kinds: activeKind ? new Set([activeKind]) : null,
      pages: effectivePage === null ? null : new Set([effectivePage]),
      authorIds: effectiveAuthor === null ? null : new Set([effectiveAuthor]),
      reviewStates:
        effectiveReviewState === null ? null : new Set([effectiveReviewState]),
    });
  }, [activeKind, effectiveAuthor, effectivePage, effectiveReviewState, items]);
  const itemKey = (item: AnnotationListBatchDeleteTarget) =>
    `${item.kind}:${item.id}`;
  // A source-PDF annotation is edited or deleted from the page and the side
  // panel (its own writer and protection flags), never by this batch delete.
  const selectable = (item: AnnotationListItem) => item.origin !== "pdf";
  const selectedItems = items.filter(
    (item) => selectable(item) && selectedKeys.has(itemKey(item)),
  );
  const visibleSelectable = visible.filter(selectable);
  const selectionLocked = Boolean(
    disabled || deleteSelectedBusy || batchDeleteDispatchPending,
  );
  const allVisibleSelected =
    visibleSelectable.length > 0 &&
    visibleSelectable.every((item) => selectedKeys.has(itemKey(item)));
  const toggleVisibleSelection = () =>
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleSelectable.forEach((item) => next.delete(itemKey(item)));
      } else {
        visibleSelectable.forEach((item) => next.add(itemKey(item)));
      }
      return next;
    });
  const deleteSelected = async () => {
    if (
      !onDeleteSelected ||
      selectedItems.length === 0 ||
      batchDeleteInFlightRef.current
    ) {
      return;
    }
    batchDeleteInFlightRef.current = true;
    setBatchDeleteDispatchPending(true);
    try {
      const accepted = await onDeleteSelected(
        selectedItems.map(({ id, kind }) => ({ id, kind })),
      );
      if (accepted) setSelectedKeys(new Set());
    } finally {
      batchDeleteInFlightRef.current = false;
      setBatchDeleteDispatchPending(false);
    }
  };
  const deletePlacedAttachment = (placedId: string) => {
    if (
      !onDeleteFileAttachment ||
      disabled ||
      attachmentDeletesPending.has(placedId)
    ) {
      return;
    }
    setAttachmentDeletesPending((current) => new Set(current).add(placedId));
    const settle = () =>
      setAttachmentDeletesPending((current) => {
        const next = new Set(current);
        next.delete(placedId);
        return next;
      });
    try {
      const result = onDeleteFileAttachment(placedId);
      if (
        result &&
        typeof (result as Promise<void | boolean>).then === "function"
      ) {
        void Promise.resolve(result).then(settle, settle);
      } else {
        settle();
      }
    } catch {
      settle();
    }
  };

  return (
    <OfficeTaskPane
      title={t("pdfViewer.annotationsPanel")}
      closeLabel={t("common.close")}
      onClose={() => onClose?.()}
      hideClose={!onClose}
      closeClassName={ANNOTATION_TARGET_CLASS}
      closeTestId="pdf-annotations-close"
      testIdPrefix="pdf-annotations"
      testId="pdf-annotations"
      dockRight={false}
      className={pdfTaskPaneClassName("pdf-viewer__annotations")}
      headerActions={
        <div className="pdf-viewer__annotations-export-wrap">
          {/* The export choices are a menu: the shared Cupertino menu, so it
              matches every other editor menu in both themes. */}
          <DropdownMenu
            open={exportOpen && items.length > 0}
            onOpenChange={setExportOpen}
            modal={false}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`pdf-viewer__annotations-export ${ANNOTATION_TARGET_CLASS}`}
                disabled={disabled || items.length === 0}
                aria-label={t("pdfViewer.annotationsExport")}
                title={t("pdfViewer.annotationsExport")}
                data-testid="pdf-annotations-export-toggle"
              >
                <Download size={13} />
              </button>
            </DropdownMenuTrigger>
            <RibbonDropdownMenuContent
              align="end"
              className="min-w-[160px]"
              aria-label={t("pdfViewer.annotationsExport")}
              data-testid="pdf-annotations-export-menu"
            >
              <DropdownMenuItem
                className={ANNOTATION_TARGET_CLASS}
                onSelect={() => onExportJson()}
                data-testid="pdf-annotations-export-json"
              >
                {t("pdfViewer.annotationsExportJson")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={ANNOTATION_TARGET_CLASS}
                onSelect={() => onExportText()}
                data-testid="pdf-annotations-export-text"
              >
                {t("pdfViewer.annotationsExportText")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={ANNOTATION_TARGET_CLASS}
                onSelect={() => onExportDocx()}
                disabled={exportDocxPending}
                aria-busy={exportDocxPending || undefined}
                data-testid="pdf-annotations-export-docx"
              >
                {t("pdfViewer.annotationsExportDocx")}
              </DropdownMenuItem>
            </RibbonDropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className={PDF_TASK_PANE_BODY_CLASS}>
        <div
          className="pdf-viewer__annotations-tabs"
          role="tablist"
          aria-label={t("pdfViewer.annotationsPanel")}
          data-testid="pdf-annotations-tabs"
        >
          {panelTabs.map((panel, index) => {
            const Icon = panel.icon;
            return (
              <button
                key={panel.id}
                id={`pdf-annotations-tab-${panel.id}`}
                type="button"
                role="tab"
                aria-selected={effectivePanel === panel.id}
                aria-controls={`pdf-annotations-panel-${panel.id}`}
                tabIndex={effectivePanel === panel.id ? 0 : -1}
                onClick={() => setActivePanel(panel.id)}
                onKeyDown={(event) => selectAdjacentPanel(event, index)}
                className={ANNOTATION_TARGET_CLASS}
                data-testid={`pdf-annotations-tab-${panel.id}`}
              >
                <Icon size={13} aria-hidden />
                <span>{panel.label}</span>
                <span className="pdf-viewer__annotations-tab-count">
                  {panel.count}
                </span>
              </button>
            );
          })}
        </div>

        <section
          id="pdf-annotations-panel-comments"
          role="tabpanel"
          aria-labelledby="pdf-annotations-tab-comments"
          hidden={effectivePanel !== "comments"}
          className="pdf-viewer__annotations-panel"
          data-testid="pdf-annotations-comments-panel"
        >

        {loadFailureCount > 0 && onRetryLoad ? (
          <div
            role="alert"
            aria-live="polite"
            data-testid="pdf-annotations-load-recovery"
            data-load-failure-count={loadFailureCount}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minHeight: 44,
              margin: "6px 8px 2px",
              padding: "5px 6px 5px 10px",
              border: "1px solid var(--warning-border, #d97706)",
              borderRadius: 8,
              background: "var(--warning-muted, rgba(245, 158, 11, 0.08))",
              color: "var(--foreground)",
              fontSize: 12,
              lineHeight: 1.35,
            }}
          >
            <span style={{ flex: 1 }}>
              {t("pdfViewer.annotationsLoadPartial", {
                count: loadFailureCount,
              })}
            </span>
            <button
              type="button"
              className={ANNOTATION_TARGET_CLASS}
              onClick={onRetryLoad}
              disabled={disabled || loadRetrying}
              aria-label={t("pdfViewer.annotationsLoadRetry")}
              title={t("pdfViewer.annotationsLoadRetry")}
              data-testid="pdf-annotations-load-retry"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                minWidth: 44,
                minHeight: 44,
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid currentColor",
                background: "transparent",
                cursor: disabled || loadRetrying ? "default" : "pointer",
              }}
            >
              <RefreshCw
                size={12}
                aria-hidden
                className={loadRetrying ? "animate-spin" : undefined}
              />
              <span>{t("pdfViewer.retry")}</span>
            </button>
          </div>
        ) : null}

        {/* Filter chips: All + one per kind (badged with its count). */}
        <div
          className="pdf-viewer__annotations-filters"
          role="group"
          aria-label={t("pdfViewer.annotationsFilterAll")}
          data-testid="pdf-annotations-filters"
        >
          <button
            type="button"
            className={`pdf-viewer__annotations-chip ${ANNOTATION_TARGET_CLASS}${
              activeKind === null ? " is-active" : ""
            }`}
            aria-pressed={activeKind === null}
            onClick={() => setActiveKind(null)}
            disabled={disabled}
            data-testid="pdf-annotations-filter-all"
          >
            {t("pdfViewer.annotationsFilterAll")}
            <span className="pdf-viewer__annotations-count">{items.length}</span>
          </button>
          {ANNOTATION_LIST_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`pdf-viewer__annotations-chip ${ANNOTATION_TARGET_CLASS}${
                activeKind === kind ? " is-active" : ""
              }`}
              aria-pressed={activeKind === kind}
              onClick={() => setActiveKind((cur) => (cur === kind ? null : kind))}
              disabled={disabled || counts[kind] === 0}
              data-testid={`pdf-annotations-filter-${kind}`}
            >
              {kindLabel(kind)}
              <span className="pdf-viewer__annotations-count">{counts[kind]}</span>
            </button>
          ))}
        </div>

        <div
          className="pdf-viewer__annotations-advanced-filters"
          data-testid="pdf-annotations-advanced-filters"
        >
          <select
            className={ANNOTATION_TARGET_CLASS}
            value={effectivePage ?? ""}
            onChange={(event) =>
              setActivePage(
                event.target.value ? Number(event.target.value) : null,
              )
            }
            disabled={disabled || pageOptions.length < 2}
            aria-label={t("pdfViewer.annotationsFilterPage")}
            title={t("pdfViewer.annotationsFilterPage")}
            data-testid="pdf-annotations-filter-page"
          >
            <option value="">{t("pdfViewer.annotationsFilterAllPages")}</option>
            {pageOptions.map((page) => (
              <option key={page} value={page}>
                {t("pdfViewer.annotationsPageLabel", { page })}
              </option>
            ))}
          </select>
          <select
            className={ANNOTATION_TARGET_CLASS}
            value={effectiveAuthor ?? ""}
            onChange={(event) => setActiveAuthor(event.target.value || null)}
            disabled={disabled || authorOptions.length === 0}
            aria-label={t("pdfViewer.annotationsFilterAuthor")}
            title={t("pdfViewer.annotationsFilterAuthor")}
            data-testid="pdf-annotations-filter-author"
          >
            <option value="">{t("pdfViewer.annotationsFilterAllAuthors")}</option>
            {authorOptions.map(([authorId, authorName]) => (
              <option key={authorId} value={authorId}>
                {authorName}
              </option>
            ))}
          </select>
          <select
            className={ANNOTATION_TARGET_CLASS}
            value={effectiveReviewState ?? ""}
            onChange={(event) =>
              setActiveReviewState(
                event.target.value === "active" ||
                  event.target.value === "resolved"
                  ? event.target.value
                  : null,
              )
            }
            disabled={disabled || !hasReviewStates}
            aria-label={t("pdfViewer.annotationsFilterReview")}
            title={t("pdfViewer.annotationsFilterReview")}
            data-testid="pdf-annotations-filter-review"
          >
            <option value="">
              {t("pdfViewer.annotationsFilterAllReviewStates")}
            </option>
            <option value="active">{t("comments.activeComments")}</option>
            <option value="resolved">{t("comments.resolvedComments")}</option>
          </select>
        </div>

        {onDeleteSelected && items.length > 0 ? (
          <div
            className="pdf-viewer__annotations-batch"
            data-testid="pdf-annotations-batch"
          >
            <label
              className={ANNOTATION_LABEL_TARGET_CLASS}
              data-testid="pdf-annotations-select-all-target"
            >
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleVisibleSelection}
                disabled={selectionLocked || visibleSelectable.length === 0}
                data-testid="pdf-annotations-select-all"
              />
              <span>{t("pdfViewer.annotationsSelectVisible")}</span>
            </label>
            <button
              type="button"
              className={ANNOTATION_TARGET_CLASS}
              onClick={() => void deleteSelected()}
              disabled={
                selectionLocked || selectedItems.length === 0
              }
              aria-label={t("pdfViewer.annotationsDeleteSelected", {
                count: selectedItems.length,
              })}
              title={t("pdfViewer.annotationsDeleteSelected", {
                count: selectedItems.length,
              })}
              data-testid="pdf-annotations-delete-selected"
            >
              <Trash2 size={12} aria-hidden />
              <span>{selectedItems.length}</span>
            </button>
          </div>
        ) : null}

        {deleteSelectedError ? (
          <p
            role="alert"
            className="pdf-viewer__annotations-batch-error"
            data-testid="pdf-annotations-delete-error"
          >
            {t("pdfViewer.annotationsDeleteSelectedFailed")}
          </p>
        ) : null}
        {reading ? (
          <p
            className="pdf-viewer__annotations-empty"
            data-testid="pdf-annotations-reading"
            role="status"
          >
            {t("pdfViewer.annotationsReading")}
          </p>
        ) : null}
        {items.length === 0 ? (
          reading ? null : (
          <p
            className="pdf-viewer__annotations-empty"
            data-testid="pdf-annotations-empty"
          >
            {t("pdfViewer.annotationsEmpty")}
          </p>
          )
        ) : visible.length === 0 ? (
          <p
            className="pdf-viewer__annotations-empty"
            data-testid="pdf-annotations-none-filtered"
          >
            {t("pdfViewer.annotationsNoneFiltered")}
          </p>
        ) : (
          <ul
            className="pdf-viewer__annotations-list"
            data-testid="pdf-annotations-list"
          >
            {visible.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const threadKey = `${item.kind}:${item.id}`;
              const replies = item.replies ?? [];
              const threadOpen = expandedThreads.has(threadKey);
              return (
                <li
                  key={threadKey}
                  className={`pdf-viewer__annotations-item${
                    onDeleteSelected ? " is-selectable" : ""
                  }`}
                  data-testid="pdf-annotations-item"
                >
                  {onDeleteSelected && selectable(item) ? (
                    <label
                      className={ANNOTATION_LABEL_TARGET_CLASS}
                      data-testid="pdf-annotations-select-one-target"
                    >
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(threadKey)}
                        onChange={() =>
                          setSelectedKeys((current) => {
                            const next = new Set(current);
                            if (next.has(threadKey)) next.delete(threadKey);
                            else next.add(threadKey);
                            return next;
                          })
                        }
                        disabled={selectionLocked}
                        aria-label={t("pdfViewer.annotationsSelectOne", {
                          page: item.page,
                        })}
                        data-testid="pdf-annotations-select-one"
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className={`pdf-viewer__annotations-link ${ANNOTATION_TARGET_CLASS}`}
                    onClick={() => onNavigate(item)}
                    disabled={disabled}
                    title={t("pdfViewer.annotationsGoTo", { page: item.page })}
                    data-testid="pdf-annotations-link"
                  >
                    <span
                      className="pdf-viewer__annotations-icon"
                      aria-hidden="true"
                      style={
                        item.color
                          ? { color: item.color }
                          : undefined
                      }
                    >
                      <Icon size={13} />
                    </span>
                    <span className="pdf-viewer__annotations-body">
                      <span className="pdf-viewer__annotations-meta">
                        {t("pdfViewer.annotationsPageLabel", { page: item.page })}
                        {" · "}
                        {item.kind === "highlight" && item.markup && item.markup !== "highlight"
                          ? markupLabel(item.markup)
                          : kindLabelSingular(item.kind)}
                        {item.origin === "pdf" ? (
                          <span
                            className="pdf-viewer__annotations-origin"
                            data-testid="pdf-annotations-origin"
                            title={
                              item.readOnly
                                ? t("pdfViewer.annotationsOriginPdfLocked")
                                : t("pdfViewer.annotationsOriginPdfHint")
                            }
                          >
                            {" · "}
                            {item.readOnly
                              ? t("pdfViewer.annotationsOriginPdfLockedLabel")
                              : t("pdfViewer.annotationsOriginPdf")}
                          </span>
                        ) : null}
                        {/* Creator identity — plain text node, never HTML. */}
                        {item.authorName ? (
                          <span
                            className="pdf-viewer__annotations-author"
                            data-testid="pdf-annotations-author"
                          >
                            {" · "}
                            {item.authorName}
                          </span>
                        ) : null}
                      </span>
                      {/* Pre-sanitized preview — React text node, never HTML. */}
                      {item.preview ? (
                        <span className="pdf-viewer__annotations-preview">
                          <MentionText text={item.preview} mentions={mentions} />
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {replies.length > 0 ? (
                    <>
                      <button
                        type="button"
                        className={`pdf-viewer__annotations-thread-toggle ${ANNOTATION_TARGET_CLASS}`}
                        onClick={() => toggleThread(threadKey)}
                        aria-expanded={threadOpen}
                        data-testid="pdf-annotations-thread-toggle"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                        }}
                      >
                        {threadOpen ? (
                          <ChevronDown size={11} aria-hidden />
                        ) : (
                          <ChevronRight size={11} aria-hidden />
                        )}
                        {t("pdfViewer.annotationsReplies", {
                          count: replies.length,
                        })}
                      </button>
                      {threadOpen ? (
                        // The thread in the shared comment card grammar
                        // (OfficeCommentsPane / OfficeCommentThread messages:
                        // avatar, author, text), read-only here: replies are
                        // written on the page's own note / markup popover.
                        <ol
                          className={`${commentCardStyles.messages} pdf-viewer__annotations-thread`}
                          data-testid="pdf-annotations-thread"
                          style={PDF_COMMENT_ACCENT_STYLE}
                        >
                          {replies.map((reply) => (
                            <li
                              key={reply.id}
                              className={
                                `${commentCardStyles.message} ` +
                                "pdf-viewer__annotations-reply"
                              }
                              data-testid="pdf-annotations-reply"
                            >
                              <span
                                className={commentCardStyles.avatar}
                                aria-hidden="true"
                              >
                                {commentInitials(
                                  reply.authorName,
                                  t("comments.anonymous"),
                                )}
                              </span>
                              <div className={commentCardStyles.messageBody}>
                                <div className={commentCardStyles.messageHeader}>
                                  <strong
                                    className="pdf-viewer__annotations-reply-author"
                                    data-testid={
                                      reply.authorName
                                        ? "pdf-annotations-reply-author"
                                        : undefined
                                    }
                                  >
                                    {reply.authorName || t("comments.anonymous")}
                                  </strong>
                                </div>
                                {/* Previewed plain text — never HTML. */}
                                <p className={commentCardStyles.messageText}>
                                  <MentionText text={reply.text} mentions={mentions} />
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        </section>

        {fileAttachments && fileAttachments.length > 0 ? (
          <section
            id="pdf-annotations-panel-attachments"
            role="tabpanel"
            aria-labelledby="pdf-annotations-tab-attachments"
            hidden={effectivePanel !== "attachments"}
            className="pdf-viewer__annotations-panel pdf-viewer__annotations-attachments"
            data-testid="pdf-attachments-section"
          >
            <strong>
              {t("pdfViewer.pinnedAttachments", {
                count: fileAttachments.length,
              })}
            </strong>
            <ul>
              {fileAttachments.map((attachment, index) => (
                <li key={`${attachment.page ?? "document"}:${attachment.name}:${index}`}>
                  <button
                    type="button"
                    className={`pdf-viewer__annotations-attachment-main ${ANNOTATION_TARGET_CLASS}`}
                    onClick={() => {
                      const page = attachment.page;
                      if (page !== null) onNavigateToPage?.(page);
                    }}
                    title={attachment.description || attachment.name}
                    data-testid={
                      attachment.page === null
                        ? "pdf-document-attachment"
                        : "pdf-attachment-goto"
                    }
                  >
                    <Paperclip size={14} aria-hidden />
                    <span className="pdf-viewer__annotations-attachment-name">
                      {attachment.name}
                    </span>
                    <span className="pdf-viewer__annotations-attachment-page">
                      {attachment.page === null
                        ? t("pdfViewer.documentAttachmentLabel", {
                            size: formatAttachmentSize(attachment.size),
                          })
                        : t("pdfViewer.pinnedAttachmentPage", {
                            page: attachment.page,
                          })}
                    </span>
                    {attachment.downloadDisabledReason ? (
                      <span
                        className="pdf-viewer__annotations-attachment-blocked"
                        data-testid="pdf-attachment-blocked-reason"
                      >
                        {attachment.downloadDisabledReason}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className={`pdf-viewer__annotations-attachment-action ${ANNOTATION_TARGET_CLASS}`}
                    onClick={() => onSaveFileAttachment?.(index)}
                    disabled={Boolean(attachment.downloadDisabledReason)}
                    aria-label={
                      attachment.downloadDisabledReason ??
                      t("pdfViewer.pinnedAttachmentSave")
                    }
                    title={
                      attachment.downloadDisabledReason ??
                      t("pdfViewer.pinnedAttachmentSave")
                    }
                    data-testid="pdf-attachment-save"
                  >
                    <Download size={14} aria-hidden />
                  </button>
                  {attachment.placedId && onDeleteFileAttachment ? (
                    <button
                      type="button"
                      className={`pdf-viewer__annotations-attachment-action ${ANNOTATION_TARGET_CLASS}`}
                      onClick={() => deletePlacedAttachment(attachment.placedId!)}
                      disabled={
                        disabled ||
                        attachmentDeletesPending.has(attachment.placedId)
                      }
                      aria-label={t("pdfViewer.pinnedAttachmentDelete")}
                      title={t("pdfViewer.pinnedAttachmentDelete")}
                      data-testid="pdf-attachment-delete"
                    >
                      <X size={14} aria-hidden />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </OfficeTaskPane>
  );
}
