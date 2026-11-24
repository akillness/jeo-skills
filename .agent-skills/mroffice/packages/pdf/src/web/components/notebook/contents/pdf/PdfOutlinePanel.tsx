"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ListTree,
  MapPin,
  Outdent,
  Pencil,
  Search,
  Trash2,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeTaskPane } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import type {
  ManagedOutlineDestination,
  ManagedOutlineMutation,
  ManagedOutlineNode,
  OutlineNode,
} from "@mrnote/core/web/lib/pdf/outline.ts";
import type { UserBookmark } from "../../../../lib/pdf/user-bookmarks";
import { isPdfManagedBookmarksTitle } from "../../../../lib/pdf/managed-bookmarks-title";

import { PDF_TASK_PANE_BODY_CLASS, pdfTaskPaneClassName } from "./pdfTaskPaneDock";

export interface PdfOutlinePanelProps {
  /** Normalized + sanitized outline tree (from `normalizeOutlineTree`). */
  nodes: OutlineNode[];
  /**
   * Invoked when an outline entry with a destination is clicked. The parent
   * resolves the destination to a page (via the pdf.js resolver) and navigates.
   * Entries without a navigable dest still render but are not clickable.
   */
  onNavigate: (node: OutlineNode) => void;
  /** Closes the outline panel and returns focus to the navigation rail. */
  onClose?: () => void;
  /** Disables interaction (e.g. while the document is still loading). */
  disabled?: boolean;
  /** True once the outline has been read; controls the empty-state message. */
  ready?: boolean;
  /**
   * Id of the outline node whose section contains the CURRENT page (computed
   * by the parent via `currentOutlineSectionId`). The matching row is
   * highlighted (`is-current` + `aria-current`) so the panel doubles as a
   * "where am I" indicator while scrolling. `null`/absent → no highlight.
   */
  activeNodeId?: string | null;
  /**
   * USER-created bookmarks (sorted for display by the parent). Rendered in their
   * own section below the embedded outline, each clickable (jump to its page)
   * with a delete control. Absent / empty → the section shows only the add
   * control (so the user can always create the first one).
   */
  userBookmarks?: ReadonlyArray<UserBookmark>;
  /** Jump to a user bookmark's page. */
  onNavigateBookmark?: (bookmark: UserBookmark) => void;
  /** Delete a user bookmark. */
  onDeleteBookmark?: (
    bookmark: UserBookmark,
  ) => void | boolean | Promise<void | boolean>;
  /**
   * Rename a user bookmark (inline edit committed with the new raw label; the
   * parent normalizes + PATCHes it). Omit to hide the rename affordance.
   */
  onRenameBookmark?: (
    bookmark: UserBookmark,
    label: string,
  ) => void | boolean | Promise<void | boolean>;
  /** Add a bookmark at the current page (the parent supplies the page + label). */
  onAddBookmark?: (
    trigger: HTMLButtonElement,
  ) => void | boolean | Promise<void | boolean>;
  /** True while an add/delete is in flight (disables the bookmark controls). */
  bookmarkSaving?: boolean;
  /** Newly-created bookmark that should enter the existing inline rename flow. */
  autoRenameBookmarkId?: string | null;
  /** Restores focus after the requested rename session ends. */
  onAutoRenameEnd?: () => void;
  /** Complete MRAI-owned native subtree; imported `nodes` remain immutable. */
  managedNodes?: readonly ManagedOutlineNode[];
  currentDestination?: ManagedOutlineDestination;
  onNavigateManaged?: (node: ManagedOutlineNode) => void;
  onManagedMutation?: (mutation: ManagedOutlineMutation) => void | Promise<void>;
  managedBusy?: boolean;
  managedDisabledReason?: string;
  /** Rename or delete one of the document's own bookmarks, as WPS does (the
   * node's id is its place in the outline). Omit to keep them read-only. */
  onSourceBookmarkEdit?: (edit: Readonly<{
    kind: "rename" | "delete";
    node: OutlineNode;
    title?: string;
    /** The node is one of MRAI's own bookmarks, listed here because the
     * pane has not matched MRAI's container (its tree was not read from the
     * file yet): its place inside that container. */
    managedPath?: readonly number[];
  }>) => void | Promise<void>;
}

const OUTLINE_FOCUS_CLASS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
const OUTLINE_ICON_TARGET_CLASS = `min-h-11 min-w-11 ${OUTLINE_FOCUS_CLASS}`;
const OUTLINE_ROW_TARGET_CLASS = `min-h-11 ${OUTLINE_FOCUS_CLASS}`;
const OUTLINE_INPUT_TARGET_CLASS = `min-h-11 ${OUTLINE_FOCUS_CLASS}`;

/**
 * Broadcast expand/collapse-all: a monotonically bumped version plus the
 * desired state. Entries adopt `expanded` when they SEE a new version, then
 * stay independently toggleable until the next broadcast.
 */
interface ExpandSignal {
  version: number;
  expanded: boolean;
}

interface OutlineEntryProps {
  node: OutlineNode;
  onNavigate: (node: OutlineNode) => void;
  disabled?: boolean;
  activeNodeId?: string | null;
  expandSignal: ExpandSignal | null;
  /** The document's own bookmark chosen for Rename / Delete. */
  selectedId?: string | null;
  onSelect?: (node: OutlineNode) => void;
}

function OutlineEntry({
  node,
  onNavigate,
  disabled,
  activeNodeId,
  expandSignal,
  selectedId,
  onSelect,
}: OutlineEntryProps) {
  const t = useTranslations("console-notebooks");
  const hasChildren = node.children.length > 0;
  
  // nothing, top-level branches start expanded so the panel reads as a TOC at
  // a glance and deeper ones start collapsed to keep large outlines scannable.
  const [expanded, setExpanded] = useState(node.open ?? node.depth === 0);
  
  const emphasis =
    node.bold || node.italic
      ? { fontWeight: node.bold ? 700 : undefined, fontStyle: node.italic ? "italic" : undefined }
      : undefined;
  // Adopt an expand/collapse-all broadcast exactly once per version (render-
  // phase prop/state comparison — React's "adjust state when a prop changes"
  // pattern — so no post-commit effect cascade). Local toggles still work
  // between broadcasts.
  const [seenSignalVersion, setSeenSignalVersion] = useState(0);
  if (expandSignal && expandSignal.version !== seenSignalVersion) {
    setSeenSignalVersion(expandSignal.version);
    setExpanded(expandSignal.expanded);
  }
  const navigable = node.dest != null;
  const isCurrent = activeNodeId != null && node.id === activeNodeId;

  return (
    <li className="pdf-viewer__outline-item">
      <div
        className={`pdf-viewer__outline-row${
          navigable ? "" : " is-static"
        }${isCurrent ? " is-current" : ""}`}
        style={{ paddingInlineStart: 6 + node.depth * 14 }}
        aria-current={isCurrent ? "location" : undefined}
        data-testid={isCurrent ? "pdf-outline-current" : undefined}
      >
        {hasChildren ? (
          <button
            type="button"
            className={`pdf-viewer__outline-twisty ${OUTLINE_ICON_TARGET_CLASS}`}
            onClick={() => setExpanded((open) => !open)}
            disabled={disabled}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? t("pdfViewer.outlineCollapse", { title: node.title })
                : t("pdfViewer.outlineExpand", { title: node.title })
            }
            data-testid="pdf-outline-twisty"
          >
            {expanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
          </button>
        ) : (
          <span className="pdf-viewer__outline-twisty pdf-viewer__outline-twisty--spacer min-h-11 min-w-11" />
        )}
        {navigable ? (
          <button
            type="button"
            className={`pdf-viewer__outline-link ${OUTLINE_ROW_TARGET_CLASS}`}
            onClick={() => {
              onSelect?.(node);
              onNavigate(node);
            }}
            disabled={disabled}
            title={node.title}
            data-outline-key-target="true"
            data-testid="pdf-outline-link"
            aria-pressed={onSelect ? selectedId === node.id : undefined}
          >
            {/* Rendered as a TEXT node — React escapes it, never HTML. */}
            <span style={emphasis}>{node.title}</span>
          </button>
        ) : onSelect ? (
          <button
            type="button"
            className={`pdf-viewer__outline-link ${OUTLINE_ROW_TARGET_CLASS}`}
            onClick={() => onSelect(node)}
            disabled={disabled}
            title={node.title}
            data-outline-key-target="true"
            data-testid="pdf-outline-text"
            aria-pressed={selectedId === node.id}
          >
            <span style={emphasis}>{node.title}</span>
          </button>
        ) : (
          <span
            className="pdf-viewer__outline-text"
            title={node.title}
            data-testid="pdf-outline-text"
            style={emphasis}
          >
            {node.title}
          </span>
        )}
      </div>
      {hasChildren && expanded ? (
        <ul className="pdf-viewer__outline-children">
          {node.children.map((child) => (
            <OutlineEntry
              key={child.id}
              node={child}
              onNavigate={onNavigate}
              disabled={disabled}
              activeNodeId={activeNodeId}
              expandSignal={expandSignal}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

interface BookmarkRowProps {
  bookmark: UserBookmark;
  disabled?: boolean;
  saving?: boolean;
  onNavigate?: (bookmark: UserBookmark) => void;
  onDelete?: (
    bookmark: UserBookmark,
  ) => void | boolean | Promise<void | boolean>;
  onRename?: (
    bookmark: UserBookmark,
    label: string,
  ) => void | boolean | Promise<void | boolean>;
  editing: boolean;
  onStartEdit: (bookmark: UserBookmark) => void;
  onEndEdit: () => void;
}

interface ManagedOutlineLocation {
  readonly node: ManagedOutlineNode;
  readonly parentId: string | null;
  readonly parentParentId: string | null;
  readonly index: number;
  readonly siblings: readonly ManagedOutlineNode[];
}

function findManagedOutlineLocation(
  nodes: readonly ManagedOutlineNode[],
  id: string,
  parentId: string | null = null,
  parentParentId: string | null = null,
): ManagedOutlineLocation | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === id) {
      return { node, parentId, parentParentId, index, siblings: nodes };
    }
    const child = findManagedOutlineLocation(
      node.children,
      id,
      node.id,
      parentId,
    );
    if (child) return child;
  }
  return null;
}

/** The shape MRAI's bookmarks container has in pdf.js's outline: the last
 * top-level item, "MRAI Bookmarks" (in whichever language it was created:
 * lib/pdf/managed-bookmarks-title), going nowhere. */
function isPhysicalManagedContainerShape(node: OutlineNode): boolean {
  return node.depth === 0 && isPdfManagedBookmarksTitle(node.title) && node.dest === null;
}

function matchesPhysicalManagedContainer(
  node: OutlineNode,
  managed: readonly ManagedOutlineNode[],
): boolean {
  if (
    !isPhysicalManagedContainerShape(node) ||
    node.children.length !== managed.length
  ) {
    return false;
  }
  const matchesChildren = (
    source: readonly OutlineNode[],
    expected: readonly ManagedOutlineNode[],
  ): boolean =>
    source.length === expected.length &&
    source.every(
      (item, index) =>
        item.title === expected[index].title &&
        matchesChildren(item.children, expected[index].children),
    );
  return matchesChildren(node.children, managed);
}

function ManagedOutlineEntry({
  node,
  depth,
  selectedId,
  disabled,
  onSelect,
  onNavigate,
}: {
  node: ManagedOutlineNode;
  depth: number;
  selectedId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onNavigate?: (node: ManagedOutlineNode) => void;
}) {
  const t = useTranslations("console-notebooks");
  const [expanded, setExpanded] = useState(true);
  return (
    <li className="pdf-viewer__outline-item" data-testid="pdf-managed-outline-item">
      <div
        className={`pdf-viewer__outline-row${selectedId === node.id ? " is-current" : ""}`}
        style={{ paddingInlineStart: 6 + depth * 14 }}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            className={`pdf-viewer__outline-twisty ${OUTLINE_ICON_TARGET_CLASS}`}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? t("pdfViewer.outlineCollapse", { title: node.title })
                : t("pdfViewer.outlineExpand", { title: node.title })
            }
            disabled={disabled}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="pdf-viewer__outline-twisty pdf-viewer__outline-twisty--spacer min-h-11 min-w-11" />
        )}
        <button
          type="button"
          className={`pdf-viewer__outline-link ${OUTLINE_ROW_TARGET_CLASS}`}
          data-outline-key-target="true"
          data-testid="pdf-managed-outline-link"
          aria-pressed={selectedId === node.id}
          // Not gated on `onNavigate`: selecting the node is this row's own
          // effect, so the row still does something without a navigator.
          disabled={disabled}
          title={t("pdfViewer.bookmarkGoTo", {
            label: node.title,
            page: node.destination.pageNumber,
          })}
          onClick={() => {
            onSelect(node.id);
            onNavigate?.(node);
          }}
        >
          <span>{node.title}</span>
        </button>
      </div>
      {expanded && node.children.length > 0 ? (
        <ul className="pdf-viewer__outline-children">
          {node.children.map((child) => (
            <ManagedOutlineEntry
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              disabled={disabled}
              onSelect={onSelect}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function BookmarkRow({
  bookmark,
  disabled,
  saving,
  onNavigate,
  onDelete,
  onRename,
  editing,
  onStartEdit,
  onEndEdit,
}: BookmarkRowProps) {
  const t = useTranslations("console-notebooks");
  // Draft label while the inline rename is open; seeded on edit start.
  const [draft, setDraft] = useState(bookmark.label);
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState(false);
  const renamePendingRef = useRef(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const deletePendingRef = useRef(false);

  const commit = () => {
    if (saving || renamePendingRef.current) return;
    const next = draft.trim();
    // An unchanged / emptied draft is a cancel, not a PATCH — the parent's
    // normalizer would fall back to "Page N" on empty, which the user did not
    // ask for from a rename gesture.
    if (!next || next === bookmark.label || !onRename) {
      onEndEdit();
      return;
    }
    setRenameError(false);
    let result: void | boolean | Promise<void | boolean>;
    try {
      result = onRename(bookmark, next);
    } catch {
      setRenameError(true);
      return;
    }
    if (!result || typeof (result as Promise<void | boolean>).then !== "function") {
      if (result === false) setRenameError(true);
      else onEndEdit();
      return;
    }
    renamePendingRef.current = true;
    setRenamePending(true);
    void Promise.resolve(result)
      .then((succeeded) => {
        if (succeeded === false) {
          setRenameError(true);
          return;
        }
        onEndEdit();
      })
      .catch(() => setRenameError(true))
      .finally(() => {
        renamePendingRef.current = false;
        setRenamePending(false);
      });
  };

  const requestDelete = () => {
    if (!onDelete || saving || deletePendingRef.current) return;
    setDeleteError(false);
    let result: void | boolean | Promise<void | boolean>;
    try {
      result = onDelete(bookmark);
    } catch {
      setDeleteError(true);
      return;
    }
    if (!result || typeof (result as Promise<void | boolean>).then !== "function") {
      if (result === false) setDeleteError(true);
      return;
    }
    deletePendingRef.current = true;
    setDeletePending(true);
    void Promise.resolve(result)
      .then((succeeded) => {
        if (succeeded === false) setDeleteError(true);
      })
      .catch(() => setDeleteError(true))
      .finally(() => {
        deletePendingRef.current = false;
        setDeletePending(false);
      });
  };

  if (editing) {
    return (
      <li className="pdf-viewer__bookmark-item" data-testid="pdf-bookmark-item">
        <input
          type="text"
          className={`pdf-viewer__bookmark-rename-input ${OUTLINE_INPUT_TARGET_CLASS}`}
          value={draft}
          autoFocus
          disabled={saving || renamePending}
          maxLength={200}
          aria-label={t("pdfViewer.bookmarkRenameInput")}
          data-testid="pdf-bookmark-rename-input"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape" && !renamePendingRef.current) {
              e.preventDefault();
              e.stopPropagation();
              onEndEdit();
            }
          }}
          onBlur={commit}
        />
        <button
          type="button"
          className={`pdf-viewer__bookmark-rename ${OUTLINE_ICON_TARGET_CLASS}`}
          // Commit happens via the input's blur; the button exists so the
          // affordance is mouse-discoverable (and stays in the tab order).
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          disabled={saving || renamePending}
          aria-label={t("pdfViewer.bookmarkRenameCommit")}
          title={t("pdfViewer.bookmarkRenameCommit")}
          data-testid="pdf-bookmark-rename-commit"
        >
          <Check size={12} />
        </button>
        {renameError ? (
          <span role="alert" data-testid="pdf-bookmark-rename-error">
            {t("references.saveFailed")}
          </span>
        ) : null}
      </li>
    );
  }

  return (
    <li className="pdf-viewer__bookmark-item" data-testid="pdf-bookmark-item">
      <button
        type="button"
        className={`pdf-viewer__bookmark-link ${OUTLINE_ROW_TARGET_CLASS}`}
        onClick={() => onNavigate?.(bookmark)}
        // Going to the bookmark is all this row does, so without a navigator
        // it is a button that swallows the click.
        disabled={disabled || !onNavigate}
        title={t("pdfViewer.bookmarkGoTo", {
          label: bookmark.label,
          page: bookmark.page,
        })}
        data-outline-key-target="true"
        data-testid="pdf-bookmark-link"
      >
        {/* Rendered as a TEXT node — React escapes it, never HTML. */}
        <span className="pdf-viewer__bookmark-label">{bookmark.label}</span>
        <span className="pdf-viewer__bookmark-page">{bookmark.page}</span>
      </button>
      {onRename ? (
        <button
          type="button"
          className={`pdf-viewer__bookmark-rename ${OUTLINE_ICON_TARGET_CLASS}`}
          onClick={() => {
            setDraft(bookmark.label);
            setRenameError(false);
            onStartEdit(bookmark);
          }}
          disabled={disabled || saving}
          aria-label={t("pdfViewer.bookmarkRename", {
            label: bookmark.label,
          })}
          title={t("pdfViewer.bookmarkRename", { label: bookmark.label })}
          data-testid="pdf-bookmark-rename"
        >
          <Pencil size={12} />
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          className={`pdf-viewer__bookmark-delete ${OUTLINE_ICON_TARGET_CLASS}`}
          onClick={requestDelete}
          disabled={disabled || saving || deletePending}
          aria-label={t("pdfViewer.bookmarkDelete", {
            label: bookmark.label,
          })}
          title={t("pdfViewer.bookmarkDelete", {
            label: bookmark.label,
          })}
          data-testid="pdf-bookmark-delete"
        >
          <Trash2 size={12} />
        </button>
      ) : null}
      {deleteError ? (
        <span role="alert" data-testid="pdf-bookmark-delete-error">
          {t("references.saveFailed")}
        </span>
      ) : null}
    </li>
  );
}

/**
 * PDF outline / bookmarks sidebar panel. Renders the document's bookmark tree
 * (read via pdf.js `getOutline()` and normalized by `lib/pdf/outline.ts`) as a
 * collapsible nested list. Clicking an entry asks the parent to navigate to the
 * bookmark's destination page.
 *
 * Presentational + (locally) only the per-branch expand/collapse state, the
 * expand/collapse-all broadcast, and the inline bookmark-rename draft live
 * here; all document/resolution logic stays in the parent PDFViewer + the pure
 * `lib/pdf/outline.ts` helpers, so this mirrors PdfViewModeToggle /
 * PdfPageOpsControls in being unit-testable without the pdf.js stack.
 *
 * Titles come pre-sanitized (whitespace-collapsed, length-capped) and are
 * always rendered as React text nodes — never HTML.
 */
export default function PdfOutlinePanel({
  nodes,
  onNavigate,
  onClose,
  disabled,
  ready,
  activeNodeId,
  userBookmarks,
  onNavigateBookmark,
  onDeleteBookmark,
  onRenameBookmark,
  onAddBookmark,
  bookmarkSaving,
  autoRenameBookmarkId,
  onAutoRenameEnd,
  managedNodes,
  currentDestination,
  onNavigateManaged,
  onManagedMutation,
  managedBusy,
  managedDisabledReason,
  onSourceBookmarkEdit,
}: PdfOutlinePanelProps) {
  const t = useTranslations("console-notebooks");
  const bookmarks = userBookmarks ?? [];
  // The bookmarks section renders whenever the parent wires the add handler (so
  // the reader can always create the first bookmark) or there are bookmarks to
  // list. Otherwise the panel is the embedded outline only (unchanged).
  // With native bookmarks managed above, a second empty "My bookmarks" with
  
  // section then shows only when it already holds bookmarks.
  const showBookmarks =
    bookmarks.length > 0 || (Boolean(onAddBookmark) && !onManagedMutation);
  // Expand/collapse-all broadcast (see ExpandSignal). Only offered when at
  // least one branch actually has children to expand.
  const [expandSignal, setExpandSignal] = useState<ExpandSignal | null>(null);
  const broadcast = (expanded: boolean) =>
    setExpandSignal((prev) => ({
      version: (prev?.version ?? 0) + 1,
      expanded,
    }));
  // Id of the bookmark currently being renamed inline (one at a time).
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const consumedAutoRenameIdRef = useRef<string | null>(null);
  const managed = managedNodes ?? [];
  const sourceNodes =
    managed.length > 0 &&
    nodes.length > 0 &&
    matchesPhysicalManagedContainer(nodes[nodes.length - 1], managed)
      ? nodes.slice(0, -1)
      : nodes;
  const hasBranches = sourceNodes.some((node) => node.children.length > 0);
  
  // contains the query, keeping every ancestor for context; clearing the box
  // restores the whole outline.
  const [outlineQuery, setOutlineQuery] = useState("");
  const normalizedQuery = outlineQuery.trim().toLocaleLowerCase();
  const filterNodes = (entries: OutlineNode[]): OutlineNode[] =>
    entries.flatMap((entry) => {
      const children = filterNodes(entry.children);
      const matches = entry.title.toLocaleLowerCase().includes(normalizedQuery);
      return matches || children.length > 0
        ? [{ ...entry, children: matches ? entry.children : children }]
        : [];
    });
  const visibleNodes = normalizedQuery ? filterNodes(sourceNodes) : sourceNodes;
  const queryExpandSignal = useMemo<ExpandSignal | null>(
    () => (normalizedQuery ? { version: -1, expanded: true } : null),
    [normalizedQuery],
  );
  const [selectedManagedId, setSelectedManagedId] = useState<string | null>(null);
  const [managedDraft, setManagedDraft] = useState<{
    kind: "add" | "rename";
    value: string;
  } | null>(null);
  const [managedMutationPending, setManagedMutationPending] = useState(false);
  const [managedMutationError, setManagedMutationError] = useState<string | null>(
    null,
  );
  const managedMutationRunRef = useRef(0);
  const [bookmarkAddPending, setBookmarkAddPending] = useState(false);
  const [bookmarkAddError, setBookmarkAddError] = useState(false);
  const bookmarkAddPendingRef = useRef(false);
  useEffect(
    () => () => {
      managedMutationRunRef.current += 1;
    },
    [],
  );
  const managedLocation = selectedManagedId
    ? findManagedOutlineLocation(managed, selectedManagedId)
    : null;
  const managedDisabled = Boolean(
    disabled || managedBusy || managedMutationPending || managedDisabledReason,
  );
  const panelMutationPending = Boolean(
    bookmarkSaving || bookmarkAddPending || managedBusy || managedMutationPending,
  );
  const requestAddBookmark = (trigger: HTMLButtonElement) => {
    if (!onAddBookmark || bookmarkSaving || bookmarkAddPendingRef.current)
      return;
    setBookmarkAddError(false);
    let result: void | boolean | Promise<void | boolean>;
    try {
      result = onAddBookmark(trigger);
    } catch {
      setBookmarkAddError(true);
      return;
    }
    if (!result || typeof (result as Promise<void | boolean>).then !== "function") {
      if (result === false) setBookmarkAddError(true);
      return;
    }
    bookmarkAddPendingRef.current = true;
    setBookmarkAddPending(true);
    void Promise.resolve(result)
      .then((succeeded) => {
        if (succeeded === false) setBookmarkAddError(true);
      })
      .catch(() => setBookmarkAddError(true))
      .finally(() => {
        bookmarkAddPendingRef.current = false;
        setBookmarkAddPending(false);
      });
  };
  const submitManagedMutation = (
    mutation: ManagedOutlineMutation,
    onSucceeded?: () => void,
  ) => {
    if (managedDisabled) return;
    const mutationRun = ++managedMutationRunRef.current;
    setManagedMutationPending(true);
    setManagedMutationError(null);
    const finish = () => {
      if (managedMutationRunRef.current !== mutationRun) return;
      setManagedMutationPending(false);
      onSucceeded?.();
    };
    const fail = (error: unknown) => {
      if (managedMutationRunRef.current !== mutationRun) return;
      setManagedMutationPending(false);
      setManagedMutationError(
        error instanceof Error ? error.message : t("references.saveFailed"),
      );
    };
    try {
      const result = onManagedMutation?.(mutation);
      if (result && typeof result.then === "function") {
        void result.then(finish, fail);
      } else {
        finish();
      }
    } catch (error) {
      fail(error);
    }
  };
  // The document's own bookmark chosen for Rename / Delete, and its draft title.
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourceDraft, setSourceDraft] = useState<string | null>(null);
  const findSource = (entries: OutlineNode[], id: string): OutlineNode | null => {
    for (const entry of entries) {
      if (entry.id === id) return entry;
      const found = findSource(entry.children, id);
      if (found) return found;
    }
    return null;
  };
  const selectedSource = selectedSourceId ? findSource(sourceNodes, selectedSourceId) : null;
  const submitSourceEdit = (sourceEdit: Readonly<{ kind: "rename" | "delete"; node: OutlineNode; title?: string }>) => {
    if (managedDisabled || !onSourceBookmarkEdit) return;
    // MRAI's own container still listed with the file's bookmarks (its
    // tree not matched yet): an edit inside it is MRAI's own, which the
    
    const path = sourceEdit.node.id.split("-").map(Number);
    const containerIndex = sourceNodes === nodes && nodes.length > 0 &&
      isPhysicalManagedContainerShape(nodes[nodes.length - 1]) ? nodes.length - 1 : -1;
    const edit = containerIndex >= 0 && path.length > 1 && path[0] === containerIndex
      ? { ...sourceEdit, managedPath: path.slice(1) }
      : sourceEdit;
    const mutationRun = ++managedMutationRunRef.current;
    setManagedMutationPending(true);
    setManagedMutationError(null);
    const finish = () => {
      if (managedMutationRunRef.current !== mutationRun) return;
      setManagedMutationPending(false);
      setSourceDraft(null);
      if (edit.kind === "delete") setSelectedSourceId(null);
    };
    const failed = (error: unknown) => {
      if (managedMutationRunRef.current !== mutationRun) return;
      setManagedMutationPending(false);
      setManagedMutationError(error instanceof Error ? error.message : t("references.saveFailed"));
    };
    try {
      const result = onSourceBookmarkEdit(edit);
      if (result && typeof result.then === "function") void result.then(finish, failed);
      else finish();
    } catch (error) {
      failed(error);
    }
  };
  const commitSourceDraft = () => {
    const title = sourceDraft?.trim();
    if (!title || !selectedSource || title === selectedSource.title) {
      setSourceDraft(null);
      return;
    }
    submitSourceEdit({ kind: "rename", node: selectedSource, title });
  };
  const commitManagedDraft = () => {
    const title = managedDraft?.value.trim();
    if (!title || !managedDraft) {
      setManagedDraft(null);
      return;
    }
    if (managedDraft.kind === "add" && currentDestination) {
      const id = `mrai-${crypto.randomUUID()}`;
      submitManagedMutation(
        {
          kind: "add",
          parentId: null,
          node: { id, title, destination: currentDestination, children: [] },
        },
        () => {
          setSelectedManagedId(id);
          setManagedDraft(null);
        },
      );
    } else if (managedDraft.kind === "rename" && managedLocation) {
      submitManagedMutation(
        {
          kind: "rename",
          id: managedLocation.node.id,
          title,
        },
        () => setManagedDraft(null),
      );
    }
  };

  useEffect(() => {
    if (
      !autoRenameBookmarkId ||
      consumedAutoRenameIdRef.current === autoRenameBookmarkId ||
      !bookmarks.some((bookmark) => bookmark.id === autoRenameBookmarkId)
    ) {
      return;
    }
    consumedAutoRenameIdRef.current = autoRenameBookmarkId;
    setRenamingId(autoRenameBookmarkId);
  }, [autoRenameBookmarkId, bookmarks]);

  const endBookmarkRename = (bookmarkId: string) => {
    setRenamingId(null);
    if (bookmarkId === autoRenameBookmarkId) onAutoRenameEnd?.();
  };

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (!target.matches("[data-outline-key-target='true']")) return;
    const targets = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[data-outline-key-target='true']:not(:disabled)",
      ),
    );
    const index = targets.indexOf(target as HTMLButtonElement);
    if (index < 0) return;
    // Tree navigation keys belong to the tree also where they have nothing
    // to do (Left on a top-level leaf, Right on the last row): the reader's
    // page shortcuts skip a handled key, and an unhandled boundary Left
    
    // (history Back/Forward) still pass through.
    if (
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(
        event.key,
      )
    ) {
      event.preventDefault();
    }

    if (event.key === "Escape" && onClose && !panelMutationPending) {
      event.preventDefault();
      onClose();
      return;
    }

    const focusAt = (nextIndex: number) => {
      event.preventDefault();
      targets[nextIndex]?.focus();
    };
    if (event.key === "ArrowDown") {
      focusAt(Math.min(targets.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      focusAt(Math.max(0, index - 1));
      return;
    }
    if (event.key === "Home") {
      focusAt(0);
      return;
    }
    if (event.key === "End") {
      focusAt(targets.length - 1);
      return;
    }

    const row = target.closest(".pdf-viewer__outline-row");
    const twisty = row?.querySelector<HTMLButtonElement>(
      ".pdf-viewer__outline-twisty:not(.pdf-viewer__outline-twisty--spacer)",
    );
    if (event.key === "ArrowRight") {
      if (twisty?.getAttribute("aria-expanded") === "false") {
        event.preventDefault();
        twisty.click();
      } else if (index < targets.length - 1) {
        focusAt(index + 1);
      }
      return;
    }
    if (event.key !== "ArrowLeft") return;
    if (twisty?.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      twisty.click();
      return;
    }
    const currentItem = target.closest("li.pdf-viewer__outline-item");
    const parentList = currentItem?.parentElement;
    if (!parentList?.classList.contains("pdf-viewer__outline-children")) return;
    const parentItem = parentList.closest("li.pdf-viewer__outline-item");
    const parentTarget = parentItem?.querySelector<HTMLButtonElement>(
      ":scope > .pdf-viewer__outline-row [data-outline-key-target='true']",
    );
    if (parentTarget) {
      event.preventDefault();
      parentTarget.focus();
    }
  };

  return (
    <OfficeTaskPane
      title={t("pdfViewer.outlinePanel")}
      closeLabel={t("outline.close")}
      onClose={() => {
        if (!panelMutationPending) onClose?.();
      }}
      hideClose={!onClose}
      closeDisabled={panelMutationPending}
      closeClassName={OUTLINE_ICON_TARGET_CLASS}
      closeTestId="pdf-outline-close"
      testIdPrefix="pdf-outline"
      testId="pdf-outline"
      dockRight={false}
      className={pdfTaskPaneClassName("pdf-viewer__outline")}
      onKeyDown={handlePanelKeyDown}
      headerActions={
        hasBranches ? (
          <span className="pdf-viewer__outline-header-actions">
            <button
              type="button"
              className={`pdf-viewer__outline-tree-action ${OUTLINE_ICON_TARGET_CLASS}`}
              onClick={() => broadcast(true)}
              disabled={disabled}
              aria-label={t("pdfViewer.outlineExpandAll")}
              title={t("pdfViewer.outlineExpandAll")}
              data-testid="pdf-outline-expand-all"
            >
              <ChevronsUpDown size={13} />
            </button>
            <button
              type="button"
              className={`pdf-viewer__outline-tree-action ${OUTLINE_ICON_TARGET_CLASS}`}
              onClick={() => broadcast(false)}
              disabled={disabled}
              aria-label={t("pdfViewer.outlineCollapseAll")}
              title={t("pdfViewer.outlineCollapseAll")}
              data-testid="pdf-outline-collapse-all"
            >
              <ChevronsDownUp size={13} />
            </button>
          </span>
        ) : undefined
      }
    >
      <div className={PDF_TASK_PANE_BODY_CLASS}>
        {sourceNodes.length > 0 ? (
          <div className="pdf-viewer__outline-search">
            <Search size={13} aria-hidden />
            <input
              type="search"
              className={`pdf-viewer__outline-search-input ${OUTLINE_INPUT_TARGET_CLASS}`}
              value={outlineQuery}
              placeholder={t("pdfViewer.outlineSearch")}
              aria-label={t("pdfViewer.outlineSearch")}
              data-testid="pdf-outline-search"
              onChange={(event) => setOutlineQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && outlineQuery) {
                  event.preventDefault();
                  event.stopPropagation();
                  setOutlineQuery("");
                }
              }}
            />
          </div>
        ) : null}
        {sourceNodes.length === 0 && !ready ? (
          <EditorLoadingState
            kind="list"
            minimal
            label={t("pdfViewer.outlineLoading")}
            testId="pdf-outline-empty"
          />
        ) : sourceNodes.length === 0 ? (
          <p className="pdf-viewer__outline-empty" data-testid="pdf-outline-empty">
            {t("pdfViewer.outlineEmpty")}
          </p>
        ) : visibleNodes.length === 0 ? (
          <p
            className="pdf-viewer__outline-empty"
            data-testid="pdf-outline-search-empty"
          >
            {t("pdfViewer.outlineSearchEmpty")}
          </p>
        ) : (
          <ul className="pdf-viewer__outline-tree">
            {visibleNodes.map((node) => (
              <OutlineEntry
                key={normalizedQuery ? `${node.id}:q` : node.id}
                node={node}
                onNavigate={onNavigate}
                disabled={disabled}
                activeNodeId={activeNodeId}
                expandSignal={queryExpandSignal ?? expandSignal}
                {...(onSourceBookmarkEdit
                  ? { selectedId: selectedSourceId, onSelect: (chosen: OutlineNode) => setSelectedSourceId(chosen.id) }
                  : {})}
              />
            ))}
          </ul>
        )}
        {onSourceBookmarkEdit && selectedSource ? (
          sourceDraft !== null ? (
            <div className="pdf-viewer__bookmark-item">
              <input
                type="text"
                className={`pdf-viewer__bookmark-rename-input ${OUTLINE_INPUT_TARGET_CLASS}`}
                value={sourceDraft}
                autoFocus
                maxLength={300}
                disabled={managedDisabled}
                aria-label={t("pdfViewer.bookmarkRenameInput")}
                data-testid="pdf-outline-source-name-input"
                onChange={(event) => setSourceDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitSourceDraft();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setSourceDraft(null);
                  }
                }}
              />
              <button
                type="button"
                className={`pdf-viewer__bookmark-rename ${OUTLINE_ICON_TARGET_CLASS}`}
                disabled={managedDisabled}
                aria-label={t("pdfViewer.bookmarkRenameCommit")}
                title={t("pdfViewer.bookmarkRenameCommit")}
                data-testid="pdf-outline-source-name-commit"
                onClick={commitSourceDraft}
              >
                <Check size={12} />
              </button>
              <button
                type="button"
                className={`pdf-viewer__bookmark-rename ${OUTLINE_ICON_TARGET_CLASS}`}
                aria-label={t("pdfViewer.linkCancel")}
                title={t("pdfViewer.linkCancel")}
                onClick={() => setSourceDraft(null)}
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div
              className="pdf-viewer__outline-header-actions flex-wrap"
              role="toolbar"
              aria-label={selectedSource.title}
              data-testid="pdf-outline-source-actions"
            >
              <button
                type="button"
                className={`pdf-viewer__outline-tree-action ${OUTLINE_ICON_TARGET_CLASS}`}
                aria-label={t("pdfViewer.bookmarkRename", { label: selectedSource.title })}
                title={managedDisabledReason ?? t("pdfViewer.bookmarkRename", { label: selectedSource.title })}
                data-testid="pdf-outline-source-rename"
                disabled={managedDisabled}
                onClick={() => setSourceDraft(selectedSource.title)}
              ><Pencil size={13} /></button>
              <button
                type="button"
                className={`pdf-viewer__outline-tree-action ${OUTLINE_ICON_TARGET_CLASS}`}
                aria-label={t("pdfViewer.bookmarkDelete", { label: selectedSource.title })}
                title={managedDisabledReason ?? t("pdfViewer.bookmarkDelete", { label: selectedSource.title })}
                data-testid="pdf-outline-source-delete"
                disabled={managedDisabled}
                onClick={() => submitSourceEdit({ kind: "delete", node: selectedSource })}
              ><Trash2 size={13} /></button>
            </div>
          )
        ) : null}

        {onManagedMutation ? (
          <div className="pdf-viewer__bookmarks" data-testid="pdf-managed-outline">
            <div className="pdf-viewer__bookmarks-header">
              <strong>{t("pdfViewer.bookmarksHeading")}</strong>
              <span className="pdf-viewer__outline-header-actions">
                <button
                  type="button"
                  className={`pdf-viewer__outline-tree-action ${OUTLINE_ICON_TARGET_CLASS}`}
                  data-testid="pdf-managed-outline-add"
                  disabled={managedDisabled || !currentDestination}
                  aria-label={t("pdfViewer.bookmarkAdd")}
                  title={managedDisabledReason ?? t("pdfViewer.bookmarkAdd")}
                  onClick={() => setManagedDraft({ kind: "add", value: "" })}
                >
                  <BookmarkPlus size={13} />
                </button>
              </span>
            </div>
            {managedDisabledReason ? (
              <p className="pdf-viewer__outline-empty" role="status">
                {managedDisabledReason}
              </p>
            ) : null}
            {managedMutationError ? (
              <p
                className="pdf-viewer__outline-empty"
                role="alert"
                data-testid="pdf-managed-outline-error"
              >
                {managedMutationError}
              </p>
            ) : null}
            {managedDraft ? (
              <div className="pdf-viewer__bookmark-item">
                <input
                  type="text"
                  className={`pdf-viewer__bookmark-rename-input ${OUTLINE_INPUT_TARGET_CLASS}`}
                  value={managedDraft.value}
                  autoFocus
                  maxLength={300}
                  disabled={managedDisabled}
                  aria-label={t("pdfViewer.bookmarkRenameInput")}
                  data-testid="pdf-managed-outline-name-input"
                  onChange={(event) =>
                    setManagedDraft({ ...managedDraft, value: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitManagedDraft();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setManagedDraft(null);
                    }
                  }}
                />
                <button
                  type="button"
                  className={`pdf-viewer__bookmark-rename ${OUTLINE_ICON_TARGET_CLASS}`}
                  disabled={managedDisabled}
                  aria-label={t("pdfViewer.bookmarkRenameCommit")}
                  title={t("pdfViewer.bookmarkRenameCommit")}
                  data-testid="pdf-managed-outline-name-commit"
                  onClick={commitManagedDraft}
                >
                  <Check size={12} />
                </button>
                {/* Esc's twin, for a keyboard without one (an iPad's). */}
                <button
                  type="button"
                  className={`pdf-viewer__bookmark-rename ${OUTLINE_ICON_TARGET_CLASS}`}
                  aria-label={t("pdfViewer.linkCancel")}
                  title={t("pdfViewer.linkCancel")}
                  data-testid="pdf-managed-outline-name-cancel"
                  onClick={() => setManagedDraft(null)}
                >
                  <X size={12} />
                </button>
              </div>
            ) : null}
            {managed.length === 0 ? (
              <p className="pdf-viewer__outline-empty">
                {t("pdfViewer.bookmarksEmpty")}
              </p>
            ) : (
              <ul
                className="pdf-viewer__outline-tree"
                aria-label={t("pdfViewer.bookmarksHeading")}
              >
                {managed.map((node) => (
                  <ManagedOutlineEntry
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedId={selectedManagedId}
                    disabled={Boolean(disabled)}
                    onSelect={setSelectedManagedId}
                    onNavigate={onNavigateManaged}
                  />
                ))}
              </ul>
            )}
            {managedLocation ? (
              <div
                className="pdf-viewer__outline-header-actions flex-wrap"
                role="toolbar"
                aria-label={t("pdfViewer.bookmarksHeading")}
              >
                <button
                  type="button"
                  className={`pdf-viewer__outline-tree-action ${OUTLINE_ICON_TARGET_CLASS}`}
                  aria-label={t("pdfViewer.bookmarkRename", { label: managedLocation.node.title })}
                  title={t("pdfViewer.bookmarkRename", { label: managedLocation.node.title })}
                  data-testid="pdf-managed-outline-rename"
                  disabled={managedDisabled}
                  onClick={() => setManagedDraft({ kind: "rename", value: managedLocation.node.title })}
                ><Pencil size={13} /></button>
                <button
                  type="button"
                  className={`pdf-viewer__outline-tree-action ${OUTLINE_ICON_TARGET_CLASS}`}
                  // This replaces the SELECTED bookmark's target; it used to
                  // read "Bookmark this page", so a user adding a bookmark
                  
                  // header's own button.
                  aria-label={t("pdfViewer.bookmarkSetDestination", { label: managedLocation.node.title })}
                  title={t("pdfViewer.bookmarkSetDestination", { label: managedLocation.node.title })}
                  data-testid="pdf-managed-outline-destination"
                  disabled={managedDisabled || !currentDestination}
                  onClick={() => currentDestination && submitManagedMutation({ kind: "update-destination", id: managedLocation.node.id, destination: currentDestination })}
                ><MapPin size={13} /></button>
                <button
                  type="button"
                  className={`pdf-viewer__outline-tree-action ${OUTLINE_ICON_TARGET_CLASS}`}
                  aria-label={t("pdfPageOps.moveUp")}
                  title={t("pdfPageOps.moveUp")}
                  disabled={managedDisabled || managedLocation.index === 0}
                  onClick={() => submitManagedMutation({ kind: "move", id: managedLocation.node.id, parentId: managedLocation.parentId, index: managedLocation.index - 1 })}
                ><ArrowUp size={13} /></button>
                <button
                  type="button"
                  className={`pdf-viewer__outline-tree-action ${OUTLINE_ICON_TARGET_CLASS}`}
                  aria-label={t("pdfPageOps.moveDown")}
                  title={t("pdfPageOps.moveDown")}
                  disabled={managedDisabled || managedLocation.index >= managedLocation.siblings.length - 1}
                  onClick={() => submitManagedMutation({ kind: "move", id: managedLocation.node.id, parentId: managedLocation.parentId, index: managedLocation.index + 1 })}
                ><ArrowDown size={13} /></button>
                <button
                  type="button"
                  className={`pdf-viewer__outline-tree-action ${OUTLINE_ICON_TARGET_CLASS}`}
                  aria-label={t("toolbar.indent")}
                  title={t("toolbar.indent")}
                  disabled={managedDisabled || managedLocation.index === 0}
                  onClick={() => {
                    const parent = managedLocation.siblings[managedLocation.index - 1];
                    submitManagedMutation({ kind: "move", id: managedLocation.node.id, parentId: parent.id, index: parent.children.length });
                  }}
                ><ListTree size={13} /></button>
                <button
                  type="button"
                  className={`pdf-viewer__outline-tree-action ${OUTLINE_ICON_TARGET_CLASS}`}
                  aria-label={t("toolbar.outdent")}
                  title={t("toolbar.outdent")}
                  disabled={managedDisabled || managedLocation.parentId === null}
                  onClick={() => {
                    const parent = managedLocation.parentId
                      ? findManagedOutlineLocation(managed, managedLocation.parentId)
                      : null;
                    if (parent) submitManagedMutation({ kind: "move", id: managedLocation.node.id, parentId: parent.parentId, index: parent.index + 1 });
                  }}
                ><Outdent size={13} /></button>
                <button
                  type="button"
                  className={`pdf-viewer__outline-tree-action ${OUTLINE_ICON_TARGET_CLASS}`}
                  aria-label={t("pdfViewer.bookmarkDelete", { label: managedLocation.node.title })}
                  title={t("pdfViewer.bookmarkDelete", { label: managedLocation.node.title })}
                  data-testid="pdf-managed-outline-delete"
                  disabled={managedDisabled}
                  onClick={() => {
                    submitManagedMutation(
                      { kind: "delete", id: managedLocation.node.id },
                      () => setSelectedManagedId(null),
                    );
                  }}
                ><Trash2 size={13} /></button>
              </div>
            ) : null}
          </div>
        ) : null}

        {showBookmarks ? (
          <div
            className="pdf-viewer__bookmarks"
            data-testid="pdf-bookmarks"
          >
            <div className="pdf-viewer__bookmarks-header">
              <strong>{t("pdfViewer.bookmarksHeading")}</strong>
              {onAddBookmark ? (
                <button
                  type="button"
                  className={`pdf-viewer__bookmark-add ${OUTLINE_ICON_TARGET_CLASS}`}
                  onClick={(event) => requestAddBookmark(event.currentTarget)}
                  disabled={disabled || bookmarkSaving || bookmarkAddPending}
                  aria-label={t("pdfViewer.bookmarkAdd")}
                  title={t("pdfViewer.bookmarkAdd")}
                  data-testid="pdf-bookmark-add"
                >
                  <BookmarkPlus size={13} />
                </button>
              ) : null}
            </div>
            {bookmarkAddError ? (
              <p
                className="pdf-viewer__outline-empty"
                role="alert"
                data-testid="pdf-bookmark-add-error"
              >
                {t("references.saveFailed")}
              </p>
            ) : null}
            {bookmarks.length === 0 ? (
              <p
                className="pdf-viewer__outline-empty"
                data-testid="pdf-bookmarks-empty"
              >
                {t("pdfViewer.bookmarksEmpty")}
              </p>
            ) : (
              <ul className="pdf-viewer__bookmark-list">
                {bookmarks.map((bookmark) => (
                  <BookmarkRow
                    key={bookmark.id}
                    bookmark={bookmark}
                    disabled={disabled}
                    saving={bookmarkSaving}
                    onNavigate={onNavigateBookmark}
                    onDelete={onDeleteBookmark}
                    onRename={onRenameBookmark}
                    editing={renamingId === bookmark.id}
                    onStartEdit={(b) => setRenamingId(b.id)}
                    onEndEdit={() => endBookmarkRename(bookmark.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </OfficeTaskPane>
  );
}
