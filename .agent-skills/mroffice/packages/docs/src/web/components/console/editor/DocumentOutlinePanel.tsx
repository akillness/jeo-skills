"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Search,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import { OfficeTaskPane } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import {
  collectHeadingsFromDoc,
  normalizeOutlineHeadingLevel,
  resolveTocSourceLevel,
  tocStyleLevelsOf,
  shouldDescendDocumentOutlineNode,
  type TocHeading,
} from "@mrnote/core/web/components/console/editor/native-document/tableOfContents.ts";
import {
  collectDocumentGoToTargets,
  type DocumentGoToTarget,
} from "./native-document/documentGoTo";
import { findHeadingPos } from "@mrnote/core/web/components/console/editor/extensions/TableOfContents.tsx";
import { collectTextMatchesFromDoc } from "./DocumentFindReplace";
import {
  collectDocumentOutlineSectionMoveAvailability,
  moveDocumentOutlineSection,
  type DocumentOutlineMoveDirection,
} from "./native-document/documentOutlineOperations";
import { isSuggestingActive } from "@mrnote/core/web/components/console/editor/native-document/trackChangesExtension.ts";
import { DOCUMENT_BUILTIN_STYLE_FONT_SIZE } from "@mrnote/core/web/components/console/editor/documentStyleGallery.ts";
import {
  documentDesignOfDoc,
  documentStyleRecipeFor,
  galleryStyleOfBlock,
  legacyGalleryRecipe,
  restyleBlock,
} from "@mrnote/core/web/components/console/editor/native-document/documentDesignRestyle.ts";
import type { WordQuickStyleId } from "@mrnote/core/web/lib/office-word-style-sets.ts";
import type { Transaction } from "@tiptap/pm/state";
import { fragmentCarries } from "@mrnote/core/web/components/console/editor/native-document/paged/fragmentRoles.ts";

interface DocumentOutlinePanelProps {
  editor: Editor;
  onClose: () => void;
  canEdit?: boolean;
}

type RuntimeEditor = Editor & {
  on?: (event: string, cb: () => void) => void;
  off?: (event: string, cb: () => void) => void;
  getJSON?: () => unknown;
};

type OutlineSnapshot = {
  doc: ProseMirrorNode;
  headings: TocHeading[];
  positions: number[];
};

type OutlineMode = "headings" | "pages";

type OutlinePageTarget = {
  index: number;
  pos: number;
  node: ProseMirrorNode;
  preview: string;
  navigation: DocumentGoToTarget | null;
};

type OutlineSearchResult = {
  from: number;
  to: number;
  text: string;
  context: string;
};

type OutlineHeadingEntry = {
  heading: TocHeading;
  parentId: string | null;
  hasChildren: boolean;
};

const SEARCH_CONTEXT_RADIUS = 36;
const PAGE_PREVIEW_POSITION_LIMIT = 180;
const PAGE_PREVIEW_TEXT_LIMIT = 84;

/** Compact, order-sensitive signature of a heading list for cheap equality. */
function outlineSignature(headings: TocHeading[]): string {
  return headings.map((h) => [h.level, h.id, h.text].join("|")).join("\n");
}

/** Position stream aligned 1:1 with the body-only heading derivation. */
function collectOutlineHeadingPositions(doc: ProseMirrorNode): number[] {
  const positions: number[] = [];
  const styleLevelOf = tocStyleLevelsOf(doc.attrs);
  doc.descendants((node, pos) => {
    if (!shouldDescendDocumentOutlineNode(node.type.name)) return false;
    if (node.type.name !== "heading" && node.type.name !== "paragraph") {
      return true;
    }
    if (!fragmentCarries("headingEntry", node.attrs)) return true;
    if (
      resolveTocSourceLevel(
        node.type.name,
        node.attrs,
        normalizeOutlineHeadingLevel,
        styleLevelOf,
      ) !== null
    ) {
      positions.push(pos);
    }
    return true;
  });
  return positions;
}

function headingAtDocumentPosition(
  headings: readonly TocHeading[],
  positions: readonly number[],
  position: number,
): string | null {
  let active: string | null = null;
  for (let index = 0; index < positions.length; index += 1) {
    if ((positions[index] ?? Number.POSITIVE_INFINITY) > position) break;
    active = headings[index]?.id ?? active;
  }
  return active;
}

/** Project the document-order heading stream into its Word outline hierarchy. */
function collectOutlineHeadingEntries(
  headings: TocHeading[],
): OutlineHeadingEntry[] {
  const ancestors: TocHeading[] = [];
  return headings.map((heading, index) => {
    while (
      ancestors.length > 0 &&
      ancestors[ancestors.length - 1].level >= heading.level
    ) {
      ancestors.pop();
    }
    const parentId = ancestors[ancestors.length - 1]?.id ?? null;
    const hasChildren = (headings[index + 1]?.level ?? 0) > heading.level;
    ancestors.push(heading);
    return { heading, parentId, hasChildren };
  });
}

/** O(headings × six levels) collapsed projection; never traverses the PM doc. */
function collectVisibleHeadingEntries(
  entries: OutlineHeadingEntry[],
  collapsedIds: ReadonlySet<string>,
): OutlineHeadingEntry[] {
  if (collapsedIds.size === 0) return entries;
  const entriesById = new Map(
    entries.map((entry) => [entry.heading.id, entry]),
  );
  return entries.filter((entry) => {
    let parentId = entry.parentId;
    while (parentId) {
      if (collapsedIds.has(parentId)) return false;
      parentId = entriesById.get(parentId)?.parentId ?? null;
    }
    return true;
  });
}

/** First legal text/caret position inside one structural page. */
function firstCaretInPage(
  node: ProseMirrorNode,
  nodePos: number,
): number | null {
  let emptyTextblock: number | null = null;
  let textPosition: number | null = null;
  node.descendants((child, relativePos) => {
    if (textPosition !== null) return false;
    const absolutePos = nodePos + 1 + relativePos;
    if (child.isText && child.nodeSize > 0) {
      textPosition = absolutePos;
      return false;
    }
    if (emptyTextblock === null && child.isTextblock) {
      emptyTextblock = absolutePos + 1;
    }
    return true;
  });
  return textPosition ?? emptyTextblock;
}

/** Derive bounded previews and page-only navigation authority from one doc. */
function collectOutlinePages(doc: ProseMirrorNode): OutlinePageTarget[] {
  const pages: OutlinePageTarget[] = [];
  let navigationOrdinal = 0;
  doc.forEach((node, pos, index) => {
    if (node.type.name !== "pageBlock") return;
    const from = firstCaretInPage(node, pos);
    if (from !== null) navigationOrdinal += 1;
    const preview = node
      .textBetween(
        0,
        Math.min(node.content.size, PAGE_PREVIEW_POSITION_LIMIT),
        " ",
      )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, PAGE_PREVIEW_TEXT_LIMIT);
    pages.push({
      index,
      pos,
      node,
      preview,
      navigation:
        from === null
          ? null
          : {
              id: `page:${pos}`,
              kind: "page",
              ordinal: navigationOrdinal,
              label: null,
              from,
              to: from,
              selection: "caret",
            },
    });
  });
  return pages;
}

function sameDocumentGoToTarget(
  left: DocumentGoToTarget,
  right: DocumentGoToTarget,
): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.ordinal === right.ordinal &&
    left.label === right.label &&
    left.from === right.from &&
    left.to === right.to &&
    left.selection === right.selection
  );
}

/** Whether a result is one the collector listed for this document (same
 * range and text), the rule that decides a click or Previous/Next can go
 * there. */
export function outlineSearchResultListed(
  results: readonly OutlineSearchResult[],
  result: Pick<OutlineSearchResult, "from" | "to" | "text">,
): boolean {
  return results.some(
    (listed) =>
      listed.from === result.from &&
      listed.to === result.to &&
      listed.text === result.text,
  );
}

/** Derive safe, single-block result labels from the exact document snapshot. */
export function collectOutlineSearchResults(
  doc: ProseMirrorNode,
  query: string,
): OutlineSearchResult[] {
  if (!query) return [];
  return collectTextMatchesFromDoc(doc, query, false).map((match) => {
    const $from = doc.resolve(match.from);
    const blockStart = $from.start($from.depth);
    const blockEnd = $from.end($from.depth);
    const contextFrom = Math.max(
      blockStart,
      match.from - SEARCH_CONTEXT_RADIUS,
    );
    const contextTo = Math.min(blockEnd, match.to + SEARCH_CONTEXT_RADIUS);
    const contextText = doc
      .textBetween(contextFrom, contextTo, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      from: match.from,
      to: match.to,
      text: doc.textBetween(match.from, match.to),
      context: `${contextFrom > blockStart ? "…" : ""}${contextText}${
        contextTo < blockEnd ? "…" : ""
      }`,
    };
  });
}

/**
 * Document navigation pane / outline sidebar (Word "Navigation Pane" / WPS
 * 导航窗格 parity). Headings mode lists every body heading as a click-to-jump
 * tree; Pages mode lists the live structural sheets as bounded text previews;
 * a non-empty query switches the same pane to an ordered document-search result
 * list. Every view stays in lock-step with the live doc.
 *
 * Source of truth: the SAME pure `collectHeadings` derivation the in-body Table
 * of Contents node uses (so the two never drift), and the SAME `findHeadingPos`
 * resolver for click targets. The heading list is NOT denormalized — it is
 * re-derived from the live document on every `update`, so an insert / rename /
 * delete / reorder is reflected without any persisted copy to keep in sync.
 *
 * Click behavior mirrors the TOC/Go To domains: every target is re-resolved
 * against the CURRENT doc at click time (never a cached, possibly stale
 * position); page/search navigation uses a selection-only transaction.
 *
 * SECURITY: heading labels are rendered as React children (TEXT), never via
 * dangerouslySetInnerHTML, and `collectHeadings` already sanitizes the text and
 * derives a safe anchor id, so a forged/imported/AI-authored heading can never
 * inject markup through the outline.
 */








export function moveBuiltinHeadingSize(
  tr: Transaction,
  pos: number,
  heading: ProseMirrorNode,
  fromLevel: number,
  toLevel: number,
): void {
  if (fromLevel === toLevel) return;
  const fromId = `heading${fromLevel}`;
  const toId = `heading${toLevel}`;
  if (!/^heading[1-6]$/.test(fromId) || !/^heading[1-6]$/.test(toId)) return;
  const doc = tr.doc;
  const design = documentDesignOfDoc(doc);
  const target =
    (heading.attrs.builtinStyleId === fromId || design) && galleryStyleOfBlock(heading)
      ? documentStyleRecipeFor(doc, design, toId as WordQuickStyleId)
      : null;
  // (No target while Word's style sets are not here: the level moves with
  // its size only, as below.)
  if (target) {
    const from = fromId as WordQuickStyleId;
    restyleBlock(
      tr,
      pos,
      [documentStyleRecipeFor(doc, design, from), legacyGalleryRecipe(doc, from)].filter(
        (recipe): recipe is NonNullable<typeof recipe> => recipe !== null,
      ),
      target,
    );
    const node = tr.doc.nodeAt(pos);
    if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, builtinStyleId: toId });
    return;
  }
  const previous = DOCUMENT_BUILTIN_STYLE_FONT_SIZE[fromId];
  const next = DOCUMENT_BUILTIN_STYLE_FONT_SIZE[toId];
  if (!previous || !next || previous === next) return;
  heading.descendants((child, offset) => {
    if (!child.isText) return true;
    const mark = child.marks.find((candidate) => candidate.type.name === "fontSize");
    if (!mark || mark.attrs.size !== previous) return false;
    const from = pos + 1 + offset;
    const to = from + child.nodeSize;
    tr.removeMark(from, to, mark.type);
    tr.addMark(from, to, mark.type.create({ ...mark.attrs, size: next }));
    return false;
  });
}

export default function DocumentOutlinePanel({
  editor,
  onClose,
  canEdit = false,
}: DocumentOutlinePanelProps) {
  const t = useTranslations("console-notebooks");
  // The outline lists EVERY heading level (h1–h6), unlike the TOC's 1–3 depth,
  // so it passes the wider `normalizeOutlineHeadingLevel` to both the collector
  // and the click resolver (they MUST share the normalizer to stay index-aligned).
  const [snapshot, setSnapshot] = useState<OutlineSnapshot>(() => {
    const doc = editor.state.doc;
    return {
      doc,
      headings: collectHeadingsFromDoc(
        doc,
        normalizeOutlineHeadingLevel,
        shouldDescendDocumentOutlineNode,
      ),
      positions: collectOutlineHeadingPositions(doc),
    };
  });
  const [outlineMode, setOutlineMode] = useState<OutlineMode>("headings");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [collapsedHeadingIds, setCollapsedHeadingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [currentDocumentHeadingId, setCurrentDocumentHeadingId] = useState<
    string | null
  >(null);
  const [suggestingActive, setSuggestingActive] = useState(() =>
    isSuggestingActive(editor.state),
  );
  const headingButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const headings = snapshot.headings;
  const headingEntries = useMemo(
    () => collectOutlineHeadingEntries(headings),
    [headings],
  );
  const visibleHeadingEntries = useMemo(
    () => collectVisibleHeadingEntries(headingEntries, collapsedHeadingIds),
    [collapsedHeadingIds, headingEntries],
  );
  const sectionMoveAvailability = useMemo(
    () => collectDocumentOutlineSectionMoveAvailability(snapshot.doc),
    [snapshot.doc],
  );
  const rovingHeadingId = visibleHeadingEntries.some(
    (entry) => entry.heading.id === activeHeadingId,
  )
    ? activeHeadingId
    : (visibleHeadingEntries[0]?.heading.id ?? null);
  const pages = useMemo(
    () =>
      outlineMode === "pages" && searchQuery.length === 0
        ? collectOutlinePages(snapshot.doc)
        : [],
    [outlineMode, searchQuery, snapshot.doc],
  );
  const searchResults = useMemo(
    () => collectOutlineSearchResults(snapshot.doc, searchQuery),
    [searchQuery, snapshot.doc],
  );
  const searchActive = searchQuery.length > 0;
  const boundedSearchIndex = searchResults.length
    ? Math.min(currentSearchIndex, searchResults.length - 1)
    : 0;
  const boundedPageIndex = pages.length
    ? Math.min(currentPageIndex, pages.length - 1)
    : 0;

  // Live-update: re-derive the heading list whenever the document changes, and
  // UNSUBSCRIBE on unmount. The off() returned from the effect cleanup is what
  // prevents a listener leak / setState-after-unmount (this product has a
  // documented history of exactly that class of bug). We preserve the previous
  // heading array when its signature is unchanged, but still publish the new
  // immutable doc identity so an old link can never authorize a new document
  // generation that happens to have the same outline.
  useEffect(() => {
    const runtime = editor as RuntimeEditor;
    const refresh = () => {
      const doc = editor.state.doc;
      const next = collectHeadingsFromDoc(
        doc,
        normalizeOutlineHeadingLevel,
        shouldDescendDocumentOutlineNode,
      );
      const positions = collectOutlineHeadingPositions(doc);
      setSnapshot((prev) => {
        const sameHeadings =
          outlineSignature(prev.headings) === outlineSignature(next);
        if (prev.doc === doc && sameHeadings) return prev;
        return {
          doc,
          headings: sameHeadings ? prev.headings : next,
          positions,
        };
      });
    };
    refresh();
    if (typeof runtime.on !== "function" || typeof runtime.off !== "function") {
      return;
    }
    runtime.on("update", refresh);
    return () => {
      runtime.off?.("update", refresh);
    };
  }, [editor]);

  useEffect(() => {
    const runtime = editor as RuntimeEditor;
    const refreshCurrentHeading = () => {
      if (editor.state.doc !== snapshot.doc) return;
      const next = headingAtDocumentPosition(
        snapshot.headings,
        snapshot.positions,
        editor.state.selection.head,
      );
      setCurrentDocumentHeadingId((previous) =>
        previous === next ? previous : next,
      );
    };
    refreshCurrentHeading();
    runtime.on?.("selectionUpdate", refreshCurrentHeading);
    return () => {
      runtime.off?.("selectionUpdate", refreshCurrentHeading);
    };
  }, [editor, snapshot]);

  useEffect(() => {
    const runtime = editor as RuntimeEditor;
    const refreshSuggesting = () => {
      const next = isSuggestingActive(editor.state);
      setSuggestingActive((previous) => (previous === next ? previous : next));
    };
    refreshSuggesting();
    runtime.on?.("transaction", refreshSuggesting);
    return () => {
      runtime.off?.("transaction", refreshSuggesting);
    };
  }, [editor]);

  const handleEntryClick = useCallback(
    (anchorId: string) => {
      if (editor.state.doc !== snapshot.doc) return;
      // Re-resolve against the CURRENT doc — never trust a position captured at
      // render time, the document may have changed since. Guard when the
      // heading no longer exists (deleted between render and click).
      const pos = findHeadingPos(
        editor.state.doc,
        anchorId,
        normalizeOutlineHeadingLevel,
        shouldDescendDocumentOutlineNode,
      );
      if (pos === null) return;
      // Caret at the start of the heading text + scroll into view. This mirrors
      // the in-body TOC node's jump dispatch exactly.
      editor
        .chain()
        .focus()
        .setTextSelection(pos + 1)
        .scrollIntoView()
        .run();
    },
    [editor, snapshot.doc],
  );

  const focusHeadingEntry = useCallback((headingId: string) => {
    setActiveHeadingId(headingId);
    headingButtonRefs.current.get(headingId)?.focus();
  }, []);

  const toggleHeadingEntry = useCallback((entry: OutlineHeadingEntry) => {
    if (!entry.hasChildren) return;
    setActiveHeadingId(entry.heading.id);
    setCollapsedHeadingIds((previous) => {
      const next = new Set(previous);
      if (next.has(entry.heading.id)) next.delete(entry.heading.id);
      else next.add(entry.heading.id);
      return next;
    });
  }, []);

  const handleHeadingKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLButtonElement>,
      entry: OutlineHeadingEntry,
      visibleIndex: number,
    ) => {
      const headingId = entry.heading.id;
      const focusAt = (index: number) => {
        const target = visibleHeadingEntries[index];
        if (target) focusHeadingEntry(target.heading.id);
      };

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          focusAt(Math.min(visibleIndex + 1, visibleHeadingEntries.length - 1));
          return;
        case "ArrowUp":
          event.preventDefault();
          focusAt(Math.max(visibleIndex - 1, 0));
          return;
        case "Home":
          event.preventDefault();
          focusAt(0);
          return;
        case "End":
          event.preventDefault();
          focusAt(visibleHeadingEntries.length - 1);
          return;
        case "ArrowRight": {
          event.preventDefault();
          if (!entry.hasChildren) return;
          if (collapsedHeadingIds.has(headingId)) {
            toggleHeadingEntry(entry);
            return;
          }
          const firstChild = visibleHeadingEntries[visibleIndex + 1];
          if (firstChild?.parentId === headingId) {
            focusHeadingEntry(firstChild.heading.id);
          }
          return;
        }
        case "ArrowLeft":
          event.preventDefault();
          if (entry.hasChildren && !collapsedHeadingIds.has(headingId)) {
            toggleHeadingEntry(entry);
          } else if (entry.parentId) {
            focusHeadingEntry(entry.parentId);
          }
          return;
        case "Enter":
        case " ":
          event.preventDefault();
          handleEntryClick(headingId);
          return;
      }
    },
    [
      collapsedHeadingIds,
      focusHeadingEntry,
      handleEntryClick,
      toggleHeadingEntry,
      visibleHeadingEntries,
    ],
  );

  const activateSearchResult = useCallback(
    (result: OutlineSearchResult, index: number) => {
      const liveDoc = editor.state.doc;
      if (liveDoc !== snapshot.doc) return false;
      if (
        !Number.isInteger(result.from) ||
        !Number.isInteger(result.to) ||
        result.from < 0 ||
        result.to <= result.from ||
        result.to > liveDoc.content.size ||
        liveDoc.textBetween(result.from, result.to) !== result.text ||
        // The result is valid by the collector's own rule (case folding that
        // maps "i" onto "İ"), not by a stricter lower-case equality that
        
        !outlineSearchResultListed(searchResults, result)
      ) {
        return false;
      }

      const transaction = editor.state.tr
        .setSelection(TextSelection.create(liveDoc, result.from, result.to))
        .setMeta("addToHistory", false)
        .scrollIntoView();
      editor.view.dispatch(transaction);
      editor.view.focus();
      setCurrentSearchIndex(index);
      return true;
    },
    [editor, searchResults, snapshot.doc],
  );

  const moveSearchResult = useCallback(
    (direction: 1 | -1) => {
      if (!searchResults.length) return;
      const safeIndex = Math.min(currentSearchIndex, searchResults.length - 1);
      const nextIndex =
        (safeIndex + direction + searchResults.length) % searchResults.length;
      activateSearchResult(searchResults[nextIndex], nextIndex);
    },
    [activateSearchResult, currentSearchIndex, searchResults],
  );

  const activatePage = useCallback(
    (page: OutlinePageTarget) => {
      const liveDoc = editor.state.doc;
      if (liveDoc !== snapshot.doc || !page.navigation) return false;
      const liveNode =
        liveDoc.childCount > page.index ? liveDoc.child(page.index) : null;
      if (
        liveNode !== page.node ||
        liveNode?.type.name !== "pageBlock" ||
        liveDoc.nodeAt(page.pos) !== liveNode
      ) {
        return false;
      }
      const liveTarget = collectDocumentGoToTargets(liveDoc).find(
        (target) => target.id === page.navigation?.id,
      );
      if (
        !liveTarget ||
        liveTarget.kind !== "page" ||
        liveTarget.selection !== "caret" ||
        !sameDocumentGoToTarget(liveTarget, page.navigation)
      ) {
        return false;
      }

      const transaction = editor.state.tr
        .setSelection(TextSelection.create(liveDoc, liveTarget.from))
        .setMeta("addToHistory", false)
        .scrollIntoView();
      editor.view.dispatch(transaction);
      editor.view.focus();
      setCurrentPageIndex(page.index);
      return true;
    },
    [editor, snapshot.doc],
  );

  const selectOutlineMode = useCallback((mode: OutlineMode) => {
    setOutlineMode(mode);
    setSearchQuery("");
    setCurrentSearchIndex(0);
  }, []);

  const changeHeadingLevel = useCallback(
    (entry: OutlineHeadingEntry, direction: -1 | 1) => {
      if (
        !canEdit ||
        editor.isDestroyed ||
        !editor.isEditable ||
        editor.state.doc !== snapshot.doc
      ) {
        return false;
      }
      const { heading } = entry;
      const nextLevel = heading.level + direction;
      if (nextLevel < 1 || nextLevel > 6) return false;
      const pos = findHeadingPos(
        editor.state.doc,
        heading.id,
        normalizeOutlineHeadingLevel,
        shouldDescendDocumentOutlineNode,
      );
      if (pos === null) return false;
      const liveNode = editor.state.doc.nodeAt(pos);
      if (!liveNode) return false;
      // The level the pane lists is the paragraph's EFFECTIVE outline level:
      // a direct outline level wins over its heading style. A heading with
      // one ("Heading 1" set to level 2) read its style level here, saw a
      
      const liveLevel =
        liveNode.type.name === "heading" || liveNode.type.name === "paragraph"
          ? resolveTocSourceLevel(
              liveNode.type.name,
              liveNode.attrs,
              normalizeOutlineHeadingLevel,
              tocStyleLevelsOf(editor.state.doc.attrs),
            )
          : null;
      if (liveLevel !== heading.level) return false;
      const attrs = { ...liveNode.attrs };
      const styleLevel = normalizeOutlineHeadingLevel(liveNode.attrs.level);
      if (liveNode.type.name === "heading") {
        // Word's Promote / Demote gives a heading the Heading style of the
        // new level; the style then states the level, so the direct
        // override goes.
        attrs.level = nextLevel;
        attrs.tocOutlineLevel = null;
      } else if (liveNode.type.name === "paragraph") {
        attrs.tocOutlineLevel = nextLevel;
      } else return false;
      const transaction = editor.state.tr.setNodeMarkup(
        pos,
        undefined,
        attrs,
        liveNode.marks,
      );
      if (liveNode.type.name === "heading" && styleLevel !== null) {
        moveBuiltinHeadingSize(transaction, pos, liveNode, styleLevel, nextLevel);
      }
      if (!transaction.docChanged) return false;
      editor.view.dispatch(transaction.scrollIntoView());
      setActiveHeadingId(heading.id);
      return true;
    },
    [canEdit, editor, snapshot.doc],
  );

  const moveHeadingSection = useCallback(
    (entry: OutlineHeadingEntry, direction: DocumentOutlineMoveDirection) => {
      if (!canEdit) return false;
      const moved = moveDocumentOutlineSection(
        editor,
        snapshot.doc,
        entry.heading.id,
        direction,
      );
      if (moved) setActiveHeadingId(entry.heading.id);
      return moved;
    },
    [canEdit, editor, snapshot.doc],
  );

  const visibleCount = searchActive
    ? searchResults.length
    : outlineMode === "pages"
      ? pages.length
      : headings.length;

  // Word's Navigation pane (View > Navigation Pane, "Use the Navigation pane
  // in Word", Microsoft Support) in the shared Office task pane frame; its
  // Headings / Pages tabs and search box stay the pane's own.
  return (
    <OfficeTaskPane
      title={t("outline.title")}
      closeLabel={t("outline.close")}
      onClose={onClose}
      testIdPrefix="document-outline"
      testId="document-outline-panel"
      dockRight={false}
      className="ai-panel document-outline-panel"
      headerActions={
        <span className="document-outline-panel-count">{visibleCount}</span>
      }
    >

      <div
        role="tablist"
        aria-label={t("outline.title")}
        data-testid="document-outline-tabs"
        style={{ display: "flex", gap: "4px", padding: "8px 8px 0" }}
      >
        {(["headings", "pages"] as const).map((mode) => {
          const selected = outlineMode === mode;
          const label =
            mode === "headings"
              ? t("crossReference.tabHeadings")
              : t("pages.title");
          return (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={selected}
              className="document-outline-panel-link"
              data-testid={`document-outline-tab-${mode}`}
              style={{
                flex: 1,
                width: "auto",
                paddingInline: "10px",
                textAlign: "center",
                ...(selected
                  ? {
                      background:
                        "var(--office-dialog-surface-muted, var(--bg-raised, #f1f5f9))",
                      color:
                        "var(--office-dialog-ink, var(--console-text-primary, #1a1a2e))",
                      fontWeight: 600,
                    }
                  : {}),
              }}
              onClick={() => selectOutlineMode(mode)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        className="note-editor-find-replace document-outline-panel-search"
        role="search"
        data-testid="document-outline-search"
      >
        <div className="note-editor-find-replace__field">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            className="note-editor-find-replace__input"
            data-testid="document-outline-search-query"
            aria-label={t("findReplace.findPlaceholder")}
            placeholder={t("findReplace.findPlaceholder")}
            value={searchQuery}
            autoFocus
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentSearchIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              moveSearchResult(event.shiftKey ? -1 : 1);
            }}
          />
        </div>
        <span
          className="note-editor-find-replace__count"
          data-testid="document-outline-search-count"
          aria-live="polite"
        >
          {searchActive
            ? t("findReplace.matchCount", {
                current: searchResults.length ? boundedSearchIndex + 1 : 0,
                total: searchResults.length,
              })
            : t("findReplace.ready")}
        </span>
        <button
          type="button"
          className="note-editor-find-replace__button"
          data-testid="document-outline-search-previous"
          aria-label={t("findReplace.previous")}
          title={t("findReplace.previous")}
          disabled={!searchResults.length}
          onClick={() => moveSearchResult(-1)}
        >
          <ChevronUp size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="note-editor-find-replace__button"
          data-testid="document-outline-search-next"
          aria-label={t("findReplace.next")}
          title={t("findReplace.next")}
          disabled={!searchResults.length}
          onClick={() => moveSearchResult(1)}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>

      <div
        className="document-outline-panel-body"
        data-testid="document-outline-body"
      >
        {searchActive ? (
          searchResults.length === 0 ? (
            <div
              className="document-outline-panel-empty"
              data-testid="document-outline-search-empty"
            >
              {t("search.window.noResults", { query: searchQuery })}
            </div>
          ) : (
            <ul
              className="document-outline-panel-list"
              data-testid="document-outline-search-list"
            >
              {searchResults.map((result, index) => {
                const isCurrent = index === boundedSearchIndex;
                return (
                  <li
                    key={`${result.from}:${result.to}:${result.text}`}
                    className="document-outline-panel-item"
                  >
                    <button
                      type="button"
                      className="document-outline-panel-link"
                      data-testid="document-outline-search-result"
                      data-from={result.from}
                      data-to={result.to}
                      aria-current={isCurrent ? "true" : undefined}
                      title={result.context}
                      style={{
                        paddingInlineStart: "10px",
                        ...(isCurrent
                          ? {
                              background: "var(--bg-raised, #f1f5f9)",
                              color: "var(--console-text-primary, #1a1a2e)",
                              fontWeight: 600,
                            }
                          : {}),
                      }}
                      onClick={() => activateSearchResult(result, index)}
                    >
                      {result.context || result.text}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : outlineMode === "pages" ? (
          pages.length === 0 ? (
            <div
              className="document-outline-panel-empty"
              data-testid="document-outline-pages-empty"
            >
              {t("pages.empty")}
            </div>
          ) : (
            <ul
              className="document-outline-panel-list"
              data-testid="document-outline-pages-list"
              style={{ gap: "8px" }}
            >
              {pages.map((page) => {
                const isCurrent = page.index === boundedPageIndex;
                return (
                  <li
                    key={`${page.index}:${page.pos}`}
                    className="document-outline-panel-item"
                  >
                    <button
                      type="button"
                      className="document-outline-panel-link"
                      data-testid="document-outline-page"
                      data-page-index={page.index}
                      data-page-pos={page.pos}
                      aria-current={isCurrent ? "page" : undefined}
                      disabled={!page.navigation}
                      title={page.preview || t("pages.untitled")}
                      style={{
                        minHeight: "76px",
                        padding: "10px 12px",
                        borderColor: isCurrent
                          ? "var(--console-accent, #2563eb)"
                          : "var(--console-border, #e2e8f0)",
                        background: "var(--console-surface, #ffffff)",
                        boxShadow: isCurrent
                          ? "0 0 0 1px var(--console-accent, #2563eb)"
                          : "none",
                      }}
                      onClick={() => activatePage(page)}
                    >
                      <span
                        style={{
                          display: "block",
                          marginBottom: "6px",
                          fontWeight: 600,
                          color: "var(--console-text-primary, #1a1a2e)",
                        }}
                      >
                        {t("goTo.kind.page")} {page.index + 1}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: "11px",
                          lineHeight: 1.45,
                          color: "var(--console-text-tertiary, #6b7280)",
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {page.preview || t("pages.untitled")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : headings.length === 0 ? (
          <div
            className="document-outline-panel-empty"
            data-testid="document-outline-empty"
          >
            {t("outline.empty")}
          </div>
        ) : (
          <ul
            role="tree"
            aria-label={t("crossReference.tabHeadings")}
            className="document-outline-panel-list"
            data-testid="document-outline-list"
          >
            {visibleHeadingEntries.map((entry, visibleIndex) => {
              const { heading } = entry;
              const collapsed = collapsedHeadingIds.has(heading.id);
              const moveAvailability = sectionMoveAvailability.get(
                heading.id,
              ) ?? { up: false, down: false };
              return (
                <li
                  key={heading.id}
                  role="none"
                  className={`document-outline-panel-item document-outline-panel-item--level-${heading.level}`}
                  data-level={heading.level}
                >
                  <div className="document-outline-panel-row">
                    <button
                      ref={(node) => {
                        if (node)
                          headingButtonRefs.current.set(heading.id, node);
                        else headingButtonRefs.current.delete(heading.id);
                      }}
                      type="button"
                      role="treeitem"
                      aria-level={heading.level}
                      aria-expanded={entry.hasChildren ? !collapsed : undefined}
                      aria-selected={heading.id === rovingHeadingId}
                      aria-current={
                        heading.id === currentDocumentHeadingId
                          ? "location"
                          : undefined
                      }
                      tabIndex={heading.id === rovingHeadingId ? 0 : -1}
                      className="document-outline-panel-link"
                      data-testid="document-outline-link"
                      data-anchor-id={heading.id}
                      data-level={heading.level}
                      data-collapsed={entry.hasChildren ? collapsed : undefined}
                      title={heading.text || t("outline.untitled")}
                      // Preserve the document's RAW h1–h6 rank. The fixed-width
                      // disclosure slot keeps peer labels aligned even when a
                      // heading has no children.
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "3px",
                        paddingInlineStart: `${(heading.level - 1) * 14 + 6}px`,
                      }}
                      onFocus={() => setActiveHeadingId(heading.id)}
                      onKeyDown={(event) =>
                        handleHeadingKeyDown(event, entry, visibleIndex)
                      }
                      onClick={(event) => {
                        // Safari does not consistently focus buttons on pointer
                        // activation. Establish the persistent treeitem as the
                        // roving target before a collapse can unmount descendants.
                        setActiveHeadingId(heading.id);
                        event.currentTarget.focus();
                        const disclosureClicked =
                          event.target instanceof Element &&
                          event.target.closest("[data-outline-disclosure]") !==
                            null;
                        if (disclosureClicked) {
                          toggleHeadingEntry(entry);
                          return;
                        }
                        handleEntryClick(heading.id);
                      }}
                    >
                      <span
                        data-outline-disclosure={
                          entry.hasChildren ? "true" : undefined
                        }
                        aria-hidden="true"
                        style={{
                          alignItems: "center",
                          display: "inline-flex",
                          flex: "0 0 14px",
                          height: "14px",
                          justifyContent: "center",
                        }}
                      >
                        {entry.hasChildren ? (
                          collapsed ? (
                            <ChevronRight size={13} />
                          ) : (
                            <ChevronDown size={13} />
                          )
                        ) : null}
                      </span>
                      <span
                        style={{
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {/* Rendered as TEXT (React children) — never HTML. */}
                        {heading.text || t("outline.untitled")}
                      </span>
                    </button>
                    <span
                      className="document-outline-panel-actions"
                      role="group"
                      aria-label={heading.text || t("outline.untitled")}
                    >
                      <button
                        type="button"
                        className="document-outline-panel-action"
                        data-testid="document-outline-move-up"
                        aria-label={t("outline.moveUp")}
                        title={t("outline.moveUp")}
                        disabled={
                          !canEdit || suggestingActive || !moveAvailability.up
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          moveHeadingSection(entry, "up");
                        }}
                      >
                        <ChevronUp size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="document-outline-panel-action"
                        data-testid="document-outline-move-down"
                        aria-label={t("outline.moveDown")}
                        title={t("outline.moveDown")}
                        disabled={
                          !canEdit || suggestingActive || !moveAvailability.down
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          moveHeadingSection(entry, "down");
                        }}
                      >
                        <ChevronDown size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="document-outline-panel-action"
                        data-testid="document-outline-promote"
                        aria-label={t("outline.promote")}
                        title={t("outline.promote")}
                        disabled={!canEdit || heading.level <= 1}
                        onClick={(event) => {
                          event.stopPropagation();
                          changeHeadingLevel(entry, -1);
                        }}
                      >
                        <ChevronLeft size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="document-outline-panel-action"
                        data-testid="document-outline-demote"
                        aria-label={t("outline.demote")}
                        title={t("outline.demote")}
                        disabled={!canEdit || heading.level >= 6}
                        onClick={(event) => {
                          event.stopPropagation();
                          changeHeadingLevel(entry, 1);
                        }}
                      >
                        <ChevronRight size={13} aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </OfficeTaskPane>
  );
}
