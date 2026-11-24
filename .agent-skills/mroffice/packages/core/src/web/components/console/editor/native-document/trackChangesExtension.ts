"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SheetFact } from "../../../../lib/editor/sheet-facts";
import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import {
  joinBackward,
  joinForward,
  selectNodeBackward,
  selectNodeForward,
} from "@tiptap/pm/commands";
import { closeHistory, isHistoryTransaction } from "@tiptap/pm/history";
import {
  Fragment,
  Slice,
  type Mark as ProseMirrorMark,
  type Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import {
  AddMarkStep,
  AttrStep,
  Mapping,
  RemoveMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
} from "@tiptap/pm/transform";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { paginationLayoutScale, paginationTransformScale } from "./paged/paginationGeometry";
import { positionOnHollowPage } from "./paged/pageHollowSheets";
import { sectionBandsWithRevisionsSettled } from "./bandStoryRevisions";
import {
  effectiveDocumentProtection,
  isDocumentTrackingLocked,
  normalizeDocumentProtection,
  revisionResolutionLocked,
  toggleDocumentTrackingLock,
} from "./documentProtection";
import {
  TRACK_REVISIONS_ATTR,
  effectiveTrackChangesMode,
  normalizeTrackChangesMode,
  normalizeTrackRevisions,
  trackChangesModeTransition,
  type TrackChangesMode,
} from "./trackChangesMode";
import {
  DELETION_MARK_NAME,
  FORMAT_REVISION_MARK_NAME,
  INSERTION_MARK_NAME,
  PARAGRAPH_FORMAT_LIST_LEVEL_KEY,
  PARAGRAPH_FORMAT_REVISION_ATTR,
  sanitizeChangeAuthor,
  PARAGRAPH_MARK_REVISION_ATTR,
  normalizeParagraphMarkRevision,
  LEGACY_PICTURE_DELETION_REVISION_ATTR,
  OBJECT_DELETION_NODE_NAMES,
  OBJECT_DELETION_REVISION_ATTR,
  OBJECT_INSERTION_NODE_KINDS,
  OBJECT_INSERTION_NODE_NAMES,
  OBJECT_INSERTION_REVISION_ATTR,
  ROW_DELETION_REVISION_ATTR,
  ROW_INSERTION_REVISION_ATTR,
  normalizeRowInsertionRevision,
  TRACKED_FORMAT_MARK_NAMES,
  CELL_FORMAT_REVISION_ATTR,
  ROW_FORMAT_REVISION_ATTR,
  TABLE_FORMAT_REVISION_ATTR,
  normalizeTablePropertyRevision,
  tablePropertyRevisionAttr,
  tablePropertyRevisionOf,
  tablePropertyRevisionScope,
  tablePropertySnapshot,
  type TablePropertyRevisionScope,
  acceptAll as acceptAllChanges,
  acceptChangeAt,
  carryRevisionFreeListThroughLayout,
  carryRevisionFreeListThroughPlainText,
  documentHasTrackedChanges,
  formatMarkSnapshots,
  listTrackedChanges,
  nextNativeRevisionId,
  normalizeChangeAttrs,
  normalizeNativeFormatRevisionAuthority,
  normalizeNativeParagraphFormatRevisionAuthority,
  normalizeObjectDeletionRevision,
  paragraphFormatSnapshot,
  rejectAll as rejectAllChanges,
  rejectChangeAt,
  supportsTrackedInsertion,
  trackedChangeAt,
  trackedDeletedObjects,
  trackedDeletedObjectsBetween,
  trackedInsertedObjects,
  trackedInsertedObjectsBetween,
  trackedObjectKind,
  trackedObjectKindIsStruck,
  trackedChangeEntriesInSelection,
  type TrackedChangeEntry,
} from "./trackChanges";

/** pageRebalanceExtension's REBALANCE_META (a module this one does not load). */
const PAGE_LEDGER_REBALANCE_META = "structuralRebalance";

/**
 * Track Changes (Word/WPS "suggesting mode") — STAGE 1 TipTap wiring.
 *
 * This module is ADDITIVE and FLAG-GATED: suggesting mode is OFF by default, and
 * when off the plugin's appendTransaction is a strict no-op, so normal editing
 * behaves EXACTLY as before. The pure accept/reject transforms live in
 * ./trackChanges (unit-tested headlessly); here we register the two marks, the
 * suggesting-mode plugin, and the accept/reject commands.
 */

// Transactions WE append (or that AI / programmatic callers dispatch) carry this
// meta flag so the suggesting plugin never re-intercepts its own work — the
// classic appendTransaction infinite-loop guard. Programmatic/AI edit paths can
// set tr.setMeta(TRACK_CHANGES_SKIP_META, true) to opt out of suggesting.
export const TRACK_CHANGES_SKIP_META = "trackChangesSkip";






export const TRACKED_OBJECT_DELETION_KEPT_META = "trackChangesObjectDeletionKept";

export const trackChangesPluginKey = new PluginKey<TrackChangesPluginState>(
  "mrnoteTrackChanges",
);

/**
 * Session-only markup presentations. `simple` is Word's Simple Markup: the
 * final-view text of `none` plus a change bar beside every text block that
 * still carries a tracked change, so the reader sees WHERE edits are without
 * the inline underline/strike-through noise. `all` / `none` are Word's All
 * Markup / No Markup; the type-scoped filters back Word's Show Markup submenu.
 */
export const TRACKED_CHANGE_MARKUP_FILTERS = [
  "simple",
  "all",
  "insertions",
  "deletions",
  "formatting",
  "none",
] as const;
export type TrackedChangeMarkupFilter =
  (typeof TRACKED_CHANGE_MARKUP_FILTERS)[number];

/** Word's Display for Review choices, in Word's menu order. */
export const TRACKED_CHANGE_DISPLAY_FILTERS = ["simple", "all", "none"] as const;
/** Word's Show Markup per-type choices (everything that is not a display mode). */
export const TRACKED_CHANGE_TYPE_FILTERS = TRACKED_CHANGE_MARKUP_FILTERS.filter(
  (filter): filter is "insertions" | "deletions" | "formatting" =>
    filter !== "simple" && filter !== "all" && filter !== "none",
);

/** DOM class the Simple Markup change bar widget carries (CSS paints the bar). */
export const SIMPLE_MARKUP_CHANGE_BAR_CLASS = "mrnote-tc-change-bar";

interface TrackChangesPluginState {
  




  justMine: boolean;
  markupFilter: TrackedChangeMarkupFilter;
}

/** Accepting or rejecting is refused (revisionResolutionLocked). */
function resolutionIsLocked(state: { doc: ProseMirrorNode }): boolean {
  return revisionResolutionLocked(state.doc.attrs.documentProtection);
}

function trackingIsLocked(state: { doc: ProseMirrorNode }): boolean {
  // An embedded review session records every edit too (effectiveDocumentProtection).
  return isDocumentTrackingLocked(effectiveDocumentProtection(state.doc.attrs.documentProtection));
}

/** The document's For Everyone setting (`w:trackRevisions`). */
function tracksForEveryone(state: { doc: ProseMirrorNode }): boolean {
  return normalizeTrackRevisions(state.doc.attrs[TRACK_REVISIONS_ATTR]);
}

// Meta channel used by the setSuggesting command to flip this session's own
// tracking (Just Mine).
const SET_SUGGESTING_META = "trackChangesSetSuggesting";
const SET_MARKUP_FILTER_META = "trackChangesSetMarkupFilter";

export function normalizeTrackedChangeMarkupFilter(
  value: unknown,
): TrackedChangeMarkupFilter {
  return TRACKED_CHANGE_MARKUP_FILTERS.includes(
    value as TrackedChangeMarkupFilter,
  )
    ? (value as TrackedChangeMarkupFilter)
    : "all";
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    trackChanges: {
      



      setSuggesting: (on: boolean) => ReturnType;
      /**
       * The Track Changes button: off when tracking is on in any mode, else
       * on For Everyone (Word's default mode).
       */
      toggleSuggesting: () => ReturnType;
      /**
       * Word's Track Changes menu: For Everyone (the document setting, saved
       * and shared), Just Mine (this author only) or Off.
       */
      setTrackChangesMode: (mode: TrackChangesMode) => ReturnType;
      /** Toggle the passwordless document-level Track Changes lock. */
      toggleTrackingLock: () => ReturnType;
      /** Accept the tracked change at the caret, or every one the selection touches. */
      acceptChange: () => ReturnType;
      /** Reject the tracked change at the caret, or every one the selection touches. */
      rejectChange: () => ReturnType;
      /** Accept the current (or selected) changes and select the next remaining one. */
      acceptChangeAndMoveNext: () => ReturnType;
      /** Reject the current (or selected) changes and select the next remaining one. */
      rejectChangeAndMoveNext: () => ReturnType;
      /**
       * Accept the tracked change covering an EXPLICIT document position
       * (re-resolved against the live doc). Drives the review panel's per-item
       * Accept button. No-op when no change covers `pos`.
       */
      acceptChangeAtPos: (pos: number) => ReturnType;
      /**
       * Reject the tracked change covering an EXPLICIT document position
       * (re-resolved against the live doc). Drives the review panel's per-item
       * Reject button. No-op when no change covers `pos`.
       */
      rejectChangeAtPos: (pos: number) => ReturnType;
      /** Accept every tracked change in the document. */
      acceptAllChanges: () => ReturnType;
      /** Reject every tracked change in the document. */
      rejectAllChanges: () => ReturnType;
      /** Accept only the change types visible through the current markup filter. */
      acceptAllShownChanges: () => ReturnType;
      /** Reject only the change types visible through the current markup filter. */
      rejectAllShownChanges: () => ReturnType;
      /** Accept every tracked change and turn suggesting mode off atomically. */
      acceptAllChangesAndStopTracking: () => ReturnType;
      /** Reject every tracked change and turn suggesting mode off atomically. */
      rejectAllChangesAndStopTracking: () => ReturnType;
      /** Change only this editor session's tracked-markup presentation. */
      setTrackedChangeMarkupFilter: (
        filter: TrackedChangeMarkupFilter,
      ) => ReturnType;
    };
  }
}

// Shared attribute spec for both marks: a sanitized author + timestamp that
// round-trip through data-* attributes. normalizeChangeAttrs runs on both parse
// (incoming HTML) and render (outgoing HTML) so a forged value never survives.
function changeAttributes() {
  const parsedAttrs = (element: HTMLElement) =>
    normalizeChangeAttrs({
      author: element.getAttribute("data-tc-author"),
      timestamp: element.getAttribute("data-tc-ts"),
      revisionId: element.getAttribute("data-tc-revision-id"),
      moveId: element.getAttribute("data-tc-move-id"),
      moveRole: element.getAttribute("data-tc-move-role"),
      moveRangeId: element.getAttribute("data-tc-move-range-id"),
    });
  return {
    author: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => parsedAttrs(element).author,
      renderHTML: (attrs: Record<string, unknown>) => {
        const author = normalizeChangeAttrs(attrs).author;
        return author ? { "data-tc-author": author } : {};
      },
    },
    timestamp: {
      default: null as number | null,
      parseHTML: (element: HTMLElement) => parsedAttrs(element).timestamp,
      renderHTML: (attrs: Record<string, unknown>) => {
        const timestamp = normalizeChangeAttrs(attrs).timestamp;
        return timestamp !== null ? { "data-tc-ts": String(timestamp) } : {};
      },
    },
    revisionId: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => parsedAttrs(element).revisionId,
      renderHTML: (attrs: Record<string, unknown>) => {
        const value = normalizeChangeAttrs(attrs).revisionId;
        return value ? { "data-tc-revision-id": value } : {};
      },
    },
    moveId: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => parsedAttrs(element).moveId,
      renderHTML: (attrs: Record<string, unknown>) => {
        const value = normalizeChangeAttrs(attrs).moveId;
        return value ? { "data-tc-move-id": value } : {};
      },
    },
    moveRole: {
      default: null as "from" | "to" | null,
      parseHTML: (element: HTMLElement) => parsedAttrs(element).moveRole,
      renderHTML: (attrs: Record<string, unknown>) => {
        const value = normalizeChangeAttrs(attrs).moveRole;
        return value ? { "data-tc-move-role": value } : {};
      },
    },
    moveRangeId: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => parsedAttrs(element).moveRangeId,
      renderHTML: (attrs: Record<string, unknown>) => {
        const value = normalizeChangeAttrs(attrs).moveRangeId;
        return value ? { "data-tc-move-range-id": value } : {};
      },
    },
  };
}

const InsertionMark = Mark.create({
  name: INSERTION_MARK_NAME,
  // Tracked-change marks should survive splitting/normalization the same way
  // other inline formatting does; inclusive so typing at a change's edge stays
  // inside it.
  inclusive: true,
  addAttributes() {
    return changeAttributes();
  },
  parseHTML() {
    return [{ tag: "span[data-tc-insertion]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-tc-insertion": "true",
        class: "mrnote-tc-insertion",
      }),
      0,
    ];
  },
});

const DeletionMark = Mark.create({
  name: DELETION_MARK_NAME,
  // Word never lets typing extend deleted text: the caret at a deletion's
  // edge writes ordinary (or newly inserted) text next to it, so the mark is
  // not inclusive.
  inclusive: false,
  addAttributes() {
    return changeAttributes();
  },
  addProseMirrorPlugins() {
    const type = this.type;
    return [
      new Plugin({
        key: new PluginKey("trackDeletionCaret"),
        // …nor typing inside it: with Track Changes off, words typed in the
        // middle of a tracked deletion are ordinary text and split the
        // deletion in two; with it on, an insertion between the halves (Word
        
        // reads as no revision, or as the typist's insertion). The caret's
        // marks took the deletion there, so the typed word was deleted text
        // the save could not place (FIXQUEUE 130). Typing, IME included,
        // takes the stored marks.
        appendTransaction(transactions, _oldState, state) {
          if (!transactions.some((tr) => tr.selectionSet || tr.docChanged)) return null;
          if (!state.selection.empty) return null;
          const marks = state.storedMarks ?? state.selection.$from.marks();
          if (!type.isInSet(marks)) return null;
          return state.tr.setStoredMarks(type.removeFromSet(marks));
        },
      }),
    ];
  },
  parseHTML() {
    return [{ tag: "span[data-tc-deletion]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-tc-deletion": "true",
        class: "mrnote-tc-deletion",
      }),
      0,
    ];
  },
});

const FormattingRevisionMark = Mark.create({
  name: FORMAT_REVISION_MARK_NAME,
  inclusive: true,
  excludes: "",
  addAttributes() {
    return {
      revisionId: { default: null },
      author: { default: null },
      timestamp: { default: null },
      previousMarks: { default: [] },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-tc-formatting]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          let previousMarks: unknown = null;
          try {
            previousMarks = JSON.parse(
              element.getAttribute("data-tc-previous-marks") ?? "null",
            );
          } catch {
            return false;
          }
          return (
            normalizeNativeFormatRevisionAuthority({
              revisionId: element.getAttribute("data-tc-revision-id"),
              author: element.getAttribute("data-tc-author"),
              timestamp: element.getAttribute("data-tc-ts"),
              previousMarks,
            }) ?? false
          );
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const authority = normalizeNativeFormatRevisionAuthority(HTMLAttributes);
    if (!authority) return ["span", {}, 0];
    return [
      "span",
      {
        "data-tc-formatting": "true",
        "data-tc-revision-id": authority.revisionId,
        ...(authority.author ? { "data-tc-author": authority.author } : {}),
        ...(authority.timestamp !== null
          ? { "data-tc-ts": String(authority.timestamp) }
          : {}),
        "data-tc-previous-marks": JSON.stringify(authority.previousMarks),
        class: "mrnote-tc-formatting",
      },
      0,
    ];
  },
});

function readJustMine(state: EditorState): boolean {
  return trackChangesPluginKey.getState(state)?.justMine ?? false;
}

function readTrackChangesMode(state: EditorState): TrackChangesMode {
  return effectiveTrackChangesMode({
    forEveryone: tracksForEveryone(state),
    locked: trackingIsLocked(state),
    justMine: readJustMine(state),
  });
}

export function readSuggesting(state: EditorState): boolean {
  return readTrackChangesMode(state) !== "off";
}

export function readMarkupFilter(state: EditorState): TrackedChangeMarkupFilter {
  return trackChangesPluginKey.getState(state)?.markupFilter ?? "all";
}

/** Whether the review display hides deleted text (Word's final view). */
export function markupFilterHidesDeletions(filter: TrackedChangeMarkupFilter): boolean {
  return filter === "none" || filter === "simple" || filter === "insertions";
}

export function trackedChangeIsShown(
  change: TrackedChangeEntry,
  filter: TrackedChangeMarkupFilter,
): boolean {
  // Simple Markup hides the inline markup but still represents every change
  // (as a change bar), so it counts as "all changes shown" like Word.
  if (filter === "all" || filter === "simple") return true;
  if (filter === "none") return false;
  if (change.kind === "move") return filter !== "formatting";
  if (filter === "insertions") return change.kind === "insertion";
  if (filter === "deletions") return change.kind === "deletion";
  return change.kind === "formatting";
}

/**
 * Is `tr` a transaction the suggesting plugin should react to? It must change
 * the doc, originate from a real user edit (history-tracked), and NOT be one of
 * our own appended/programmatic transactions.
 */
function shouldIntercept(tr: Transaction): boolean {
  if (!tr.docChanged) return false;
  // Undo/redo must replay the history event, not become a fresh suggestion.
  // The insertion-mark transaction is appended to the originating edit and is
  // therefore already part of that single event.
  if (isHistoryTransaction(tr)) return false;
  // Composition transactions describe WebKit's replaceable pre-edit DOM, not
  // a stable user edit. Marking them would redraw the composing text node and
  // cause Safari to retain raw pinyin before committing the CJK candidate.
  if (tr.getMeta("composition")) return false;
  if (tr.getMeta(TRACK_CHANGES_SKIP_META)) return false;
  if (tr.getMeta(SET_SUGGESTING_META) !== undefined) return false;
  // appendedTransaction / addToHistory:false transactions are programmatic
  // bookkeeping (e.g. block-id assignment); leave them alone.
  if (tr.getMeta("addToHistory") === false) return false;
  if (tr.getMeta("appendedTransaction")) return false;
  return true;
}

interface InsertedRange {
  from: number;
  to: number;
  /** Inserted into existing text (an open slice): any paragraph mark in it is new. */
  paragraphMarks?: boolean;
}

interface DeletedRun {
  // Position in the NEW doc where the deleted content should be re-inserted as a
  // tombstone, plus the slice (read from the OLD doc) that was removed.
  insertAt: number;
  /** When the edit put node boundaries back in place of what it removed
   * (the end of a range deleted from a list's first item reopens the list),
   * the tombstone replaces those boundaries, [insertAt, replaceTo), as the
   * exact inverse of the edit does: inserted beside them, it opened a second
   * list inside the first and the list came back in two (WUA 233). */
  replaceTo?: number;
  slice: Slice;
}

interface TrackedStepAnalysis {
  inserted: InsertedRange[];
  deleted: DeletedRun[];
  /** A stored line break (text "\\n") that a block type change re-spelled as a
   * hardBreak, in the coordinates of `inserted`, with the marks it had. */
  respelledBreaks?: { at: number; marks: readonly ProseMirrorMark[] }[];
}

/**
 * A block type change writes each line feed of the block's text as the schema's
 * line break node (ProseMirror's `setBlockType`, for a line feed stored by
 * projection_to_page). The user changed the paragraph's style, not its words:
 * read as an edit it was a struck line feed and an inserted break beside every
 * line break of the paragraph (corpus R329-D05, Heading 2 on an author line),
 * where Word records only the style.
 */
function respelledLineBreak(doc: ProseMirrorNode, step: ReplaceStep): readonly ProseMirrorMark[] | null {
  if (step.to - step.from !== 1 || step.slice.openStart > 0 || step.slice.openEnd > 0) return null;
  const written = step.slice.content;
  if (written.childCount !== 1 || written.firstChild?.type.name !== "hardBreak") return null;
  const before = doc.nodeAt(step.from);
  if (!before?.isText || doc.textBetween(step.from, step.to) !== "\n") return null;
  return before.marks;
}

/**
 * Inspect the steps of an intercepted transaction and compute, in NEW-doc
 * coordinates: ranges of freshly inserted text to mark as insertions, and slices
 * of removed content (read from the OLD doc) to re-insert as deletion tombstones.
 *
 * Only plain ReplaceStep / ReplaceAroundStep are handled (the steps text editing
 * produces). Mark-only steps and structural steps are ignored — they are not
 * content insert/delete events.
 */
function analyzeSteps(
  tr: Transaction,
  oldState: EditorState,
): TrackedStepAnalysis {
  const inserted: InsertedRange[] = [];
  const deleted: DeletedRun[] = [];
  const respelledBreaks: NonNullable<TrackedStepAnalysis["respelledBreaks"]> = [];

  for (let i = 0; i < tr.steps.length; i += 1) {
    const step = tr.steps[i];
    const docBeforeStep = tr.docs[i] ?? oldState.doc;
    const tailMapping = tr.mapping.slice(i + 1);

    if (step instanceof ReplaceAroundStep) {
      // The content of the gap [gapFrom, gapTo) is KEPT: it moves into the new
      // wrapper (a paragraph re-marked as a heading, an attribute change, a
      // lift or wrap). Only what lies outside the gap was replaced, which for
      // these structural steps is node boundaries, never text. Reading the
      // whole [from, to) as deleted re-inserted the paragraph's text as a
      // tombstone once per step: Heading 1 is six such steps, so six struck
      // copies stood beside the restyled paragraph.
      for (const [from, to] of [
        [step.from, step.gapFrom],
        [step.gapTo, step.to],
      ] as const) {
        if (to <= from) continue;
        const removed = docBeforeStep.slice(from, to);
        if (!sliceHasInlineContent(removed)) continue;
        deleted.push({ insertAt: tr.mapping.slice(i).map(from, 1), slice: removed });
      }
      const gapSize = step.gapTo - step.gapFrom;
      for (const [from, to] of [
        [step.from, step.from + step.insert],
        [step.from + step.insert + gapSize, step.from + step.slice.size + gapSize],
      ] as const) {
        if (to <= from) continue;
        const mappedFrom = tailMapping.map(from, 1);
        const mappedTo = tailMapping.map(to, 1);
        if (mappedTo > mappedFrom) inserted.push({ from: mappedFrom, to: mappedTo });
      }
      continue;
    }
    if (!(step instanceof ReplaceStep)) continue;
    if (isObjectPropertyChange(docBeforeStep, step)) continue;
    if (tablePropertyReplacement(docBeforeStep, step)) continue;
    const respelled = respelledLineBreak(docBeforeStep, step);
    if (respelled) {
      respelledBreaks.push({ at: tailMapping.map(step.from, 1), marks: respelled });
      continue;
    }

    const stepFrom = step.from;
    const stepTo = step.to;
    const slice = step.slice;

    // ---- Deletion: content existed in [stepFrom, stepTo) before this step ----
    if (stepTo > stepFrom) {
      // The removed content, read from the doc as it was BEFORE this step in the
      // sequence. tr.docs[i] is the document the i-th step applied to.
      const removed = docBeforeStep.slice(stepFrom, stepTo);
      // Only node boundaries put back (no text, no object): the step closed
      // or reopened the structure the deleted range cut through. The deleted
      // content goes back in their place, the edit undone, struck through.
      if (
        removed.content.size > 0 &&
        slice.size > 0 &&
        (removed.openStart > 0 || removed.openEnd > 0) &&
        !sliceHasInlineContent(slice) &&
        !sliceHasLeafObject(slice)
      ) {
        deleted.push({
          insertAt: tailMapping.map(stepFrom, -1),
          replaceTo: tailMapping.map(stepFrom + slice.size, 1),
          slice: removed,
        });
        continue;
      }
      if (removed.content.size > 0) {
        // Where this content now lives (start of the gap) in the FINAL new doc:
        // map the step's start through all subsequent steps' maps.
        const mappedInsertAt = tr.mapping.slice(i).map(stepFrom, 1);
        deleted.push({ insertAt: mappedInsertAt, slice: removed });
      }
    }

    // ---- Insertion: the slice contributes new content at stepFrom ----
    // `slice.size`, not its content's: an open slice's outer shells are not
    // inserted. Enter's split is two open paragraph shells (content size 4,
    // size 2), and the extra two positions marked the two characters after
    // the caret as new text, which rejecting then deleted (WUA 059).
    const insertedSize = slice.size;
    if (insertedSize > 0) {
      // The inserted content occupies [stepFrom, stepFrom + insertedSize) in the
      // doc produced by THIS step; map both ends forward to final-doc coords.
      const from = tailMapping.map(stepFrom, 1);
      const to = tailMapping.map(stepFrom + insertedSize, 1);
      const open = slice.openStart > 0 || slice.openEnd > 0;
      if (to > from) inserted.push(open ? { from, to, paragraphMarks: true } : { from, to });
    }
  }

  return { inserted, deleted, respelledBreaks };
}

/**
 * A leaf object given new properties (setNodeMarkup on a picture: the size
 * Insert Picture stores once the picture has loaded, a resize) is one
 * ReplaceStep swapping the node for a changed copy. Read as a deletion and an
 * insertion, the old picture stayed as a struck deletion beside the new one,
 * whose insertion an object cannot carry: one upload listed three deletions
 * nobody made, and Reject All kept all four copies (WUA 058). It is the same
 * object; a change of its properties is not a content revision.
 */
function isObjectPropertyChange(doc: ProseMirrorNode, step: ReplaceStep): boolean {
  const { slice } = step;
  if (slice.openStart !== 0 || slice.openEnd !== 0 || slice.content.childCount !== 1) return false;
  const before = doc.nodeAt(step.from);
  const after = slice.content.firstChild;
  return Boolean(
    before &&
      after &&
      before.isLeaf &&
      !before.isText &&
      before.type === after.type &&
      step.to - step.from === before.nodeSize &&
      !supportsTrackedInsertion(after),
  );
}

/**
 * Whether two nodes say the same words in the same shape: the same node types
 * and children, the same text and marks, every node but a table, row or cell
 * with the same attributes. Only the table's own properties may differ.
 */
function sameTableContent(a: ProseMirrorNode, b: ProseMirrorNode): boolean {
  if (a.type !== b.type || a.childCount !== b.childCount) return false;
  if (a.isText) return a.text === b.text && a.sameMarkup(b);
  if (a.type.spec.tableRole === undefined && !a.sameMarkup(b)) return false;
  for (let index = 0; index < a.childCount; index += 1) {
    if (!sameTableContent(a.child(index), b.child(index))) return false;
  }
  return true;
}

/**
 * A table replaced whole by a copy with the same words, marks and shape (the
 * table writers of Column Width, Row Height, Distribute Columns and AutoFit
 * put a new table node in the old one's place): a change of its properties,
 * as Word records it (``w:tblPrChange`` / ``w:trPrChange`` / ``w:tcPrChange``),
 * never a deleted table and an inserted one. Read as content, the old table
 * stayed as a struck copy beside the new one (corpus R490-D16 WALK1, a column
 * width set with Track Changes on: two tables, the save refused).
 */
function tablePropertyReplacement(
  doc: ProseMirrorNode,
  step: ReplaceStep,
): { before: ProseMirrorNode; after: ProseMirrorNode } | null {
  const { slice } = step;
  if (slice.openStart !== 0 || slice.openEnd !== 0 || slice.content.childCount !== 1) return null;
  const before = doc.nodeAt(step.from);
  const after = slice.content.firstChild;
  if (
    !before ||
    !after ||
    before.type.spec.tableRole !== "table" ||
    step.to - step.from !== before.nodeSize ||
    !sameTableContent(before, after)
  ) {
    return null;
  }
  return { before, after };
}

/**
 * A paragraph mark typed into existing text (Enter splitting a paragraph, a
 * pasted paragraph break): the paragraph that now ends at it carries an
 * inserted paragraph mark, as Word records one, and none of its words is new.
 * Rejecting it joins the two paragraphs again (resolveParagraphMarkRevisions).
 */
function markInsertedParagraphMarks(
  tr: Transaction,
  inserted: readonly InsertedRange[],
): boolean {
  let changed = false;
  for (const range of inserted) {
    // A closed slice puts in whole paragraphs (Convert Table to Text, Sort,
    // a pasted run of paragraphs between two others): each is a new
    // paragraph, its mark as new as its words, as Word records it. Only
    // its words were marked, so Reject All took the words and left every
    // new paragraph behind empty (WUA 234). A table or an object put in
    // whole is its own revision (an inserted row, an inserted object); the
    // paragraphs in it are not listed one by one.
    const wholeOnly = !range.paragraphMarks;
    tr.doc.nodesBetween(range.from, range.to, (node, pos) => {
      if (!node.isTextblock) {
        if (
          wholeOnly &&
          pos >= range.from &&
          pos + node.nodeSize <= range.to &&
          (node.type.spec.tableRole !== undefined || OBJECT_INSERTION_NODE_KINDS.has(node.type.name))
        ) {
          return false;
        }
        return true;
      }
      const markAt = pos + node.nodeSize - 1;
      if (wholeOnly && (pos < range.from || pos + node.nodeSize > range.to)) return false;
      if (
        markAt >= range.from &&
        markAt < range.to &&
        PARAGRAPH_MARK_REVISION_ATTR in node.attrs &&
        !normalizeParagraphMarkRevision(node.attrs[PARAGRAPH_MARK_REVISION_ATTR])
      ) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          [PARAGRAPH_MARK_REVISION_ATTR]: { kind: "ins", ...stampedAttrs() },
        });
        changed = true;
      }
      return false;
    });
  }
  return changed;
}

/**
 * A deletion that ran across paragraph marks (a selection from one paragraph
 * into another): every paragraph whose mark lies inside the struck-through
 * tombstone [from, to) carries a deleted paragraph mark, as Word records
 * `w:pPr/w:rPr/w:del`. Accepting then joins the paragraphs as the untracked
 * deletion would have; rejecting keeps them apart (WUA 061: only the words
 * were struck, so Accept left the original breaks and an empty paragraph).
 * A mark the reviewer's own pending insertion put in is left as it is, and
 * so are the marks inside an object deleted as one (a text box's story):
 * the object's own revision is the change, and its paragraphs are not
 * joined by accepting it or left struck by rejecting it.
 */
function markDeletedParagraphMarks(tr: Transaction, from: number, to: number): void {
  const author = stampedAttrs();
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.attrs[OBJECT_DELETION_REVISION_ATTR] != null) return false;
    if (!node.isTextblock) return true;
    const markAt = pos + node.nodeSize - 1;
    if (
      markAt >= from &&
      markAt < to &&
      PARAGRAPH_MARK_REVISION_ATTR in node.attrs &&
      !normalizeParagraphMarkRevision(node.attrs[PARAGRAPH_MARK_REVISION_ATTR])
    ) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        [PARAGRAPH_MARK_REVISION_ATTR]: { kind: "del", ...author },
      });
    }
    return false;
  });
}

/**
 * An object put in with Track Changes on (an uploaded or pasted picture, a
 * chart, shape or text box, a break, a rule, a display equation) carries an
 * insertion revision of its own, as Word records `w:ins` around its run:
 * Reject All takes it out, Accept leaves an ordinary object. Without one, an
 * inserted picture was no change at all and survived Reject All.
 */
function markInsertedObjects(tr: Transaction, inserted: readonly InsertedRange[]): boolean {
  let changed = false;
  const author = stampedAttrs();
  for (const range of inserted) {
    tr.doc.nodesBetween(range.from, range.to, (node, pos) => {
      if (!OBJECT_INSERTION_NODE_KINDS.has(node.type.name)) return true;
      if (
        pos >= range.from &&
        pos + node.nodeSize <= range.to &&
        node.attrs[OBJECT_INSERTION_REVISION_ATTR] == null &&
        node.attrs[OBJECT_DELETION_REVISION_ATTR] == null
      ) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          [OBJECT_INSERTION_REVISION_ATTR]: { ...author, revisionId: null },
        }, node.marks);
        changed = true;
      }
      return false;
    });
  }
  return changed;
}

/** Whether a removed slice is one or more whole table rows. */
function sliceIsWholeTableRows(slice: Slice): boolean {
  if (slice.openStart !== 0 || slice.openEnd !== 0 || slice.content.childCount === 0) {
    return false;
  }
  let rows = true;
  slice.content.forEach((node) => {
    if (node.type.spec.tableRole !== "row") rows = false;
  });
  return rows;
}

/**
 * The merged cells a Delete Rows shortened (prosemirror-tables' removeRow
 * restates a cell merged down across the row with one row less), as
 * `{ pos, rowspan }`: where the cell stands in the document after
 * `laterTransactions`, and the span it had before. With Track Changes on the
 * deleted row comes back as a row marked deleted, which the merge still
 * covers, as Word keeps it until the deletion is accepted.
 */
function cellsShortenedByRowRemoval(
  userTr: Transaction,
  laterTransactions: readonly Transaction[],
): Array<{ pos: number; rowspan: number }> {
  const out: Array<{ pos: number; rowspan: number }> = [];
  for (let i = 0; i < userTr.steps.length; i += 1) {
    const step = userTr.steps[i];
    if (
      !(step instanceof ReplaceAroundStep) ||
      step.insert !== 1 ||
      step.gapFrom !== step.from + 1 ||
      step.gapTo !== step.to - 1 ||
      step.slice.content.childCount !== 1
    )
      continue;
    const after = step.slice.content.firstChild!;
    const role = after.type.spec.tableRole;
    if (role !== "cell" && role !== "header_cell") continue;
    const before = (userTr.docs[i] ?? null)?.nodeAt(step.from);
    if (!before || before.type !== after.type) continue;
    const was = Number(before.attrs.rowspan) || 1;
    if ((Number(after.attrs.rowspan) || 1) >= was) continue;
    let pos = userTr.mapping.slice(i + 1).map(step.from, 1);
    for (const later of laterTransactions) pos = later.mapping.map(pos, 1);
    out.push({ pos, rowspan: was });
  }
  return out;
}

/** Whether a slice holds a leaf block (a picture, a rule): not only edges. */
function sliceHasLeafObject(slice: Slice): boolean {
  let found = false;
  slice.content.descendants((node) => {
    if (found) return false;
    if (node.isLeaf) found = true;
    return !found;
  });
  return found;
}

/** Whether a removed slice holds text or an inline atom (not just node edges). */
function sliceHasInlineContent(slice: Slice): boolean {
  let found = false;
  slice.content.descendants((node) => {
    if (found) return false;
    if (node.isInline) found = true;
    return !found;
  });
  return found;
}

/** Where an intercepted edit changed formatting, in new-state coordinates. */
interface FormatAnalysis {
  /** Paragraphs/headings re-marked by the edit: final position → the node
   *  as it was before the edit's first step on it. */
  paragraphs: Map<number, ProseMirrorNode>;
  /** Ranges whose tracked run formatting (bold, font, colour …) changed. */
  runs: InsertedRange[];
  /** Ranges a list wrapped (Bullets, Numbering, Checklist on paragraphs). */
  listed: InsertedRange[];
  /** Table cells, rows and tables re-marked by the edit (Shading, Borders,
   *  Cell Margins, Row Height, Table Alignment ...): final position → the
   *  node as it was before the edit's first step on it. */
  tableNodes: Map<number, ProseMirrorNode>;
}

const LIST_NODE_NAMES = new Set(["bulletList", "orderedList", "taskList"]);

/** Whether the paragraph at `pos` is in a list (not counting a table's). */
function paragraphInList(doc: ProseMirrorNode, pos: number): boolean {
  const $pos = doc.resolve(Math.min(Math.max(pos + 1, 0), doc.content.size));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (LIST_NODE_NAMES.has(node.type.name)) return true;
    if (node.type.spec.tableRole !== undefined) return false;
  }
  return false;
}

function isTextBlockNode(node: ProseMirrorNode | null | undefined): node is ProseMirrorNode {
  return node?.type.name === "paragraph" || node?.type.name === "heading";
}

/**
 * The formatting steps of an intercepted edit: a paragraph re-marked in
 * place (setNodeMarkup's ReplaceAroundStep or an AttrStep) and run marks
 * added or removed (AddMarkStep / RemoveMarkStep) of a tracked kind.
 */
function analyzeFormatSteps(
  tr: Transaction,
  oldState: EditorState,
  laterTransactions: readonly Transaction[],
): FormatAnalysis {
  const paragraphs = new Map<number, ProseMirrorNode>();
  const tableNodes = new Map<number, ProseMirrorNode>();
  const runs: InsertedRange[] = [];
  const listed: InsertedRange[] = [];
  const toFinal = (position: number, index: number, assoc: -1 | 1): number => {
    let mapped = tr.mapping.slice(index + 1).map(position, assoc);
    for (const transaction of laterTransactions) mapped = transaction.mapping.map(mapped, assoc);
    return mapped;
  };
  for (let i = 0; i < tr.steps.length; i += 1) {
    const step = tr.steps[i];
    const before = tr.docs[i] ?? oldState.doc;
    let nodePos: number | null = null;
    const replaced = step instanceof ReplaceStep ? tablePropertyReplacement(before, step) : null;
    if (replaced) {
      // Same shape, so a node of the old table and its new copy stand at the
      // same position: each one whose properties changed is re-marked there.
      const visit = (previous: ProseMirrorNode, next: ProseMirrorNode, pos: number) => {
        if (previous.type.spec.tableRole === undefined) return;
        if (!previous.sameMarkup(next)) {
          const final = toFinal(pos, i, -1);
          if (!tableNodes.has(final)) tableNodes.set(final, previous);
        }
        previous.forEach((child, offset, index) => visit(child, next.child(index), pos + 1 + offset));
      };
      visit(replaced.before, replaced.after, (step as ReplaceStep).from);
      continue;
    }
    // A list wrapped around paragraphs: the gap is what it holds now.
    if (step instanceof ReplaceAroundStep && step.gapTo > step.gapFrom) {
      let wraps = false;
      step.slice.content.descendants((node) => {
        if (LIST_NODE_NAMES.has(node.type.name)) wraps = true;
        return !wraps;
      });
      if (wraps) {
        // The gap's place once the step has run: after what it inserted.
        const gapStart = step.from + step.insert;
        const from = toFinal(gapStart, i, 1);
        const to = toFinal(gapStart + (step.gapTo - step.gapFrom), i, -1);
        if (to > from) listed.push({ from, to });
      }
    }
    if (
      step instanceof ReplaceAroundStep &&
      // `structure` is the step's own flag; prosemirror-transform types it only as a
      // constructor argument.
      Reflect.get(step, "structure") === true &&
      step.insert === 1 &&
      step.gapFrom === step.from + 1 &&
      step.gapTo === step.to - 1 &&
      step.slice.openStart === 0 &&
      step.slice.openEnd === 0 &&
      step.slice.content.childCount === 1
    ) {
      nodePos = step.from;
    } else if (step instanceof AttrStep) {
      nodePos = step.pos;
    } else if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
      if (!TRACKED_FORMAT_MARK_NAMES.has(step.mark.type.name)) continue;
      const from = toFinal(step.from, i, 1);
      const to = toFinal(step.to, i, -1);
      if (to > from) runs.push({ from, to });
      continue;
    }
    if (nodePos === null) continue;
    const node = before.nodeAt(nodePos);
    if (node && tablePropertyRevisionScope(node)) {
      const final = toFinal(nodePos, i, -1);
      if (!tableNodes.has(final)) tableNodes.set(final, node);
      continue;
    }
    if (!isTextBlockNode(node)) continue;
    const final = toFinal(nodePos, i, -1);
    if (!paragraphs.has(final)) paragraphs.set(final, node);
  }
  return { paragraphs, runs, listed, tableNodes };
}

/**
 * Whether a table node is new content of a pending revision: a row inserted
 * (or deleted) with Track Changes on, a cell in one, or a table whose every
 * row is. Word records no property change on content it records as inserted
 * or deleted: rejecting the insertion takes the properties with it.
 */
function tableNodeIsRevisedContent(doc: ProseMirrorNode, pos: number, node: ProseMirrorNode): boolean {
  const rowIsRevised = (row: ProseMirrorNode) =>
    normalizeRowInsertionRevision(row.attrs[ROW_INSERTION_REVISION_ATTR]) !== null ||
    row.attrs[ROW_DELETION_REVISION_ATTR] === true;
  const scope = tablePropertyRevisionScope(node);
  if (scope === "row") return rowIsRevised(node);
  if (scope === "table") {
    let all = node.childCount > 0;
    node.forEach((row) => {
      if (!rowIsRevised(row)) all = false;
    });
    return all;
  }
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const ancestor = $pos.node(depth);
    if (ancestor.type.spec.tableRole === "row") return rowIsRevised(ancestor);
  }
  return false;
}

/**
 * A cell, row or table whose properties the edit changed records the ones it
 * had (Word's `w:tcPrChange` / `w:trPrChange` / `w:tblPrChange`), once: a
 * node that already has a revision keeps it, since it still remembers the
 * original, as Word's record does.
 */
function recordTablePropertyRevisions(
  tr: Transaction,
  analysis: FormatAnalysis,
  author: string | null,
  timestamp: number | null,
  mintId: () => string,
): boolean {
  let changed = false;
  for (const [position, previous] of [...analysis.tableNodes].sort((a, b) => a[0] - b[0])) {
    const node = tr.doc.nodeAt(position);
    if (!node || node.type.spec.tableRole !== previous.type.spec.tableRole) continue;
    const scope: TablePropertyRevisionScope | null = tablePropertyRevisionScope(node);
    if (!scope) continue;
    const attr = tablePropertyRevisionAttr(scope);
    if (!(attr in (node.type.spec.attrs ?? {}))) continue;
    if (tablePropertyRevisionOf(node)) continue;
    if (tableNodeIsRevisedContent(tr.doc, position, node)) continue;
    const previousAttrs = tablePropertySnapshot(previous);
    if (sameSnapshot(previousAttrs, tablePropertySnapshot(node))) continue;
    tr.setNodeMarkup(position, undefined, {
      ...node.attrs,
      [attr]: { revisionId: mintId(), author, timestamp, previousAttrs },
    }, node.marks);
    changed = true;
  }
  return changed;
}

/** Whether every inline child of a paragraph is a pending tracked insertion. */
function whollyInserted(node: ProseMirrorNode): boolean {
  let inserted = 0;
  let other = 0;
  node.forEach((child) => {
    if (child.marks.some((mark) => mark.type.name === INSERTION_MARK_NAME)) inserted += 1;
    else other += 1;
  });
  return inserted > 0 && other === 0;
}

function sameSnapshot(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Record the edit's formatting as Word does with Track Formatting on: a
 * paragraph re-styled or re-formatted carries ONE paragraph revision holding
 * its previous properties (w:pPrChange), and changed run formatting carries a
 * run revision holding the previous marks (w:rPrChange). Run formatting a
 * paragraph style writes in the same edit (a heading's size and colour) joins
 * that paragraph's revision instead of opening its own. A paragraph or run
 * that already has a revision keeps it: it still remembers the original.
 */
function recordFormatRevisions(
  tr: Transaction,
  newState: EditorState,
  userTr: Transaction,
  analysis: FormatAnalysis,
  laterTransactions: readonly Transaction[],
): boolean {
  const formatType = newState.schema.marks[FORMAT_REVISION_MARK_NAME];
  const { author, timestamp } = stampedAttrs();
  let changed = false;
  let nextId: number | null = null;
  const mintId = (): string => {
    nextId = nextId === null ? Number(nextNativeRevisionId(newState.doc)) : nextId + 1;
    return String(nextId);
  };

  // Paragraph revisions minted by this edit, by paragraph position.
  const fresh = new Map<number, string>();
  for (const [position, previous] of analysis.paragraphs) {
    const node = tr.doc.nodeAt(position);
    if (!isTextBlockNode(node) || whollyInserted(node)) continue;
    if (normalizeNativeParagraphFormatRevisionAuthority(node.attrs[PARAGRAPH_FORMAT_REVISION_ATTR])) {
      continue;
    }
    const previousAttrs = paragraphFormatSnapshot(previous);
    if (sameSnapshot(previousAttrs, paragraphFormatSnapshot(node))) continue;
    const revisionId = mintId();
    tr.setNodeMarkup(position, undefined, {
      ...node.attrs,
      [PARAGRAPH_FORMAT_REVISION_ATTR]: { revisionId, author, timestamp, previousAttrs },
    });
    fresh.set(position, revisionId);
    changed = true;
  }

  changed = recordTablePropertyRevisions(tr, analysis, author, timestamp, mintId) || changed;

  // New-state positions back to the document before the edit, for the marks
  // each piece of text had.
  const before = userTr.docs[0] ?? userTr.doc;
  const forward = new Mapping();
  forward.appendMapping(userTr.mapping);
  for (const transaction of laterTransactions) forward.appendMapping(transaction.mapping);
  const inverse = forward.invert();

  // A paragraph that was in no list and is in one now (Bullets, Numbering,
  // Checklist): Word records the numbering as a paragraph property change
  // (w:pPrChange without the w:numPr); here the revision remembers that the
  // paragraph was in no list, and rejecting it lifts the paragraph out
  // (WUA 244: no revision was recorded and Reject All kept the list).
  const listedNow = new Set<number>();
  for (const range of analysis.listed) {
    tr.doc.nodesBetween(range.from, range.to, (node, position) => {
      if (!node.isTextblock) return true;
      if (position >= range.from && position + node.nodeSize <= range.to) listedNow.add(position);
      return false;
    });
  }
  for (const position of [...listedNow].sort((a, b) => a - b)) {
    const node = tr.doc.nodeAt(position);
    if (!isTextBlockNode(node) || whollyInserted(node) || !paragraphInList(tr.doc, position)) continue;
    const oldPosition = Math.min(Math.max(inverse.map(position, 1), 0), before.content.size);
    const oldNode = before.nodeAt(oldPosition);
    if (!isTextBlockNode(oldNode) || paragraphInList(before, oldPosition)) continue;
    const existing = normalizeNativeParagraphFormatRevisionAuthority(
      node.attrs[PARAGRAPH_FORMAT_REVISION_ATTR],
    );
    if (existing) {
      if (PARAGRAPH_FORMAT_LIST_LEVEL_KEY in existing.previousAttrs) continue;
      tr.setNodeMarkup(position, undefined, {
        ...node.attrs,
        [PARAGRAPH_FORMAT_REVISION_ATTR]: {
          ...existing,
          previousAttrs: { ...existing.previousAttrs, [PARAGRAPH_FORMAT_LIST_LEVEL_KEY]: 0 },
        },
      });
    } else {
      const revisionId = mintId();
      tr.setNodeMarkup(position, undefined, {
        ...node.attrs,
        [PARAGRAPH_FORMAT_REVISION_ATTR]: {
          revisionId,
          author,
          timestamp,
          previousAttrs: { ...paragraphFormatSnapshot(oldNode), [PARAGRAPH_FORMAT_LIST_LEVEL_KEY]: 0 },
        },
      });
      fresh.set(position, revisionId);
    }
    changed = true;
  }

  if (!formatType || analysis.runs.length === 0) return changed;
  const runOwner = (position: number): number | null => {
    const $pos = tr.doc.resolve(position);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if (isTextBlockNode($pos.node(depth))) return $pos.before(depth);
    }
    return null;
  };
  const pending: { from: number; to: number; mark: ProseMirrorMark }[] = [];
  for (const range of analysis.runs) {
    tr.doc.nodesBetween(range.from, range.to, (node, position) => {
      if (!node.isText) return true;
      if (
        node.marks.some(
          (mark) =>
            mark.type === formatType ||
            mark.type.name === INSERTION_MARK_NAME ||
            mark.type.name === DELETION_MARK_NAME,
        )
      ) {
        return false;
      }
      const from = Math.max(range.from, position);
      const to = Math.min(range.to, position + node.nodeSize);
      // Each character's marks before the edit (an earlier run boundary may
      // fall inside this piece once the edit unified its formatting).
      let start = from;
      let previousKey: string | null = null;
      let previousMarks: ReturnType<typeof formatMarkSnapshots> = [];
      const current = formatMarkSnapshots(node.marks);
      const flush = (end: number) => {
        if (previousKey !== null && end > start && !sameSnapshot(previousMarks, current)) {
          const owner = runOwner(start);
          const linked = owner === null ? undefined : fresh.get(owner);
          pending.push({
            from: start,
            to: end,
            mark: formatType.create({
              revisionId: linked ?? null,
              author,
              timestamp,
              previousMarks,
            }),
          });
        }
      };
      for (let at = from; at < to; at += 1) {
        const oldPosition = Math.min(Math.max(inverse.map(at, 1), 0), before.content.size);
        const oldNode = before.resolve(oldPosition).nodeAfter;
        const snapshots = oldNode?.isText ? formatMarkSnapshots(oldNode.marks) : current;
        const key = JSON.stringify(snapshots);
        if (key !== previousKey) {
          flush(at);
          start = at;
          previousKey = key;
          previousMarks = snapshots;
        }
      }
      flush(to);
      return false;
    });
  }
  // One run revision id per independent run change; the style's own marks
  // share their paragraph's id.
  let runId: string | null = null;
  for (const { from, to, mark } of pending) {
    const revisionId = mark.attrs.revisionId ?? (runId ??= mintId());
    tr.addMark(from, to, formatType.create({ ...mark.attrs, revisionId }));
    changed = true;
  }
  return changed;
}

/**
 * `appendTransaction` receives the root edit plus any transactions appended by
 * earlier plugins. `analyzeSteps` produces coordinates in the intercepted
 * transaction's result, so carry them through every later mapping before
 * applying marks to `newState`.
 */
function mapAnalysisThroughTransactions(
  analysis: TrackedStepAnalysis,
  laterTransactions: readonly Transaction[],
): TrackedStepAnalysis {
  if (laterTransactions.length === 0) return analysis;

  const mapPosition = (position: number, assoc: -1 | 1): number => {
    let mapped = position;
    for (const transaction of laterTransactions) {
      mapped = transaction.mapping.map(mapped, assoc);
    }
    return mapped;
  };

  return {
    respelledBreaks: analysis.respelledBreaks?.map((item) => ({ ...item, at: mapPosition(item.at, 1) })),
    inserted: analysis.inserted.flatMap((range) => {
      const from = mapPosition(range.from, 1);
      const to = mapPosition(range.to, -1);
      return to > from ? [{ ...range, from, to }] : [];
    }),
    deleted: analysis.deleted.map((run) =>
      run.replaceTo === undefined
        ? { ...run, insertAt: mapPosition(run.insertAt, 1) }
        : {
            ...run,
            insertAt: mapPosition(run.insertAt, -1),
            replaceTo: Math.max(mapPosition(run.insertAt, -1), mapPosition(run.replaceTo, 1)),
          },
    ),
  };
}

/**
 * Resolve spans inside an inserted range that may carry an insertion revision:
 * text plus the explicitly supported inline-atom set. Block/table revisions and
 * deletion marks on atoms remain outside the persisted document contract.
 */
function trackableInsertionSpansInRange(
  doc: ProseMirrorNode,
  range: InsertedRange,
): InsertedRange[] {
  const spans: InsertedRange[] = [];
  doc.nodesBetween(range.from, range.to, (node, position) => {
    // A text box put in whole is one inserted object, as it is one deleted
    // object: its words are not marked one by one.
    if (
      OBJECT_INSERTION_NODE_KINDS.has(node.type.name) &&
      position >= range.from &&
      position + node.nodeSize <= range.to
    ) {
      return false;
    }
    if (!supportsTrackedInsertion(node)) return true;
    const from = Math.max(range.from, position);
    const to = Math.min(range.to, position + node.nodeSize);
    if (to > from) spans.push({ from, to });
    return false;
  });
  return spans;
}

/**
 * Build the appended transaction that converts an intercepted user edit into a
 * tracked change, or null when there is nothing to do. Mutates a fresh tr off
 * the new state.
 */
function buildTrackingTransaction(
  newState: EditorState,
  oldState: EditorState,
  userTr: Transaction,
  laterTransactions: readonly Transaction[],
): Transaction | null {
  const insertionType = newState.schema.marks[INSERTION_MARK_NAME];
  const deletionType = newState.schema.marks[DELETION_MARK_NAME];
  if (!insertionType && !deletionType) return null;

  const { inserted, deleted, respelledBreaks = [] } = mapAnalysisThroughTransactions(
    analyzeSteps(userTr, oldState),
    laterTransactions,
  );
  const formats = analyzeFormatSteps(userTr, oldState, laterTransactions);
  if (
    respelledBreaks.length === 0 &&
    inserted.length === 0 &&
    deleted.length === 0 &&
    formats.paragraphs.size === 0 &&
    formats.runs.length === 0 &&
    formats.listed.length === 0 &&
    formats.tableNodes.size === 0
  ) {
    return null;
  }

  const tr = newState.tr;
  tr.setMeta(TRACK_CHANGES_SKIP_META, true);
  tr.setMeta("addToHistory", true);
  // Formatting first: re-marking keeps every position, so the insertion and
  // tombstone positions below stay valid.
  let changed = recordFormatRevisions(tr, newState, userTr, formats, laterTransactions);
  // The line breaks a block type change re-spelled stand as they were stored
  // (one position for one: nothing below moves).
  for (const { at, marks } of respelledBreaks) {
    if (tr.doc.nodeAt(at)?.type.name !== "hardBreak") continue;
    tr.replaceWith(at, at + 1, newState.schema.text("\n", marks));
    changed = true;
  }

  // Mark freshly inserted text and supported inline atoms. Strip any deletion
  // mark first (re-typing into a tombstone should read as a clean insertion),
  // then add the insertion mark.
  // Whole table rows inserted (Insert Rows Above/Below, a pasted or new
  // table): each is an inserted ROW, reviewable even while its cells are
  // empty, as Word writes w:trPr/w:ins on it.
  changed = markInsertedRows(tr, inserted) || changed;
  if (insertionType) {
    const mark = insertionType.create(stampedAttrs());
    for (const range of inserted) {
      for (const span of trackableInsertionSpansInRange(newState.doc, range)) {
        if (deletionType) tr.removeMark(span.from, span.to, deletionType);
        tr.addMark(
          span.from,
          span.to,
          continuedInsertionMark(tr.doc, span, mark) ?? mark,
        );
        changed = true;
      }
    }
  }

  changed = markInsertedParagraphMarks(tr, inserted) || changed;
  changed = markInsertedObjects(tr, inserted) || changed;

  // Re-insert removed content as a tombstone carrying the deletion mark. Process
  // right-to-left so earlier insert positions stay valid. If the removed content
  // was ITSELF an insertion suggestion, dropping it outright is the correct
  // behavior (you deleted your own un-accepted insertion) — so we skip
  // re-inserting any run that is entirely insertion-marked.
  if (deletionType) {
    const deletionMark = deletionType.create(stampedAttrs());
    const sorted = [...deleted].sort((a, b) => b.insertAt - a.insertAt);
    const backspace = backspaceDeletion(userTr, oldState);
    let rowsKept = false;
    for (const run of sorted) {
      const report = { keptObject: false };
      const tombstone = applyMarkToSlice(
        run.slice,
        deletionMark,
        Boolean(insertionType),
        report,
      );
      if (tombstone && tombstone.content.size > 0) {
        tr.replace(run.insertAt, run.replaceTo ?? run.insertAt, tombstone);
        changed = true;
        if (report.keptObject) tr.setMeta(TRACKED_OBJECT_DELETION_KEPT_META, true);
        // Whole table rows were deleted (Delete Row): the rows that come
        // back are DELETED ROWS, not rows whose text was deleted, so that
        
        // one of its rows deleted (Word writes w:trPr/w:del on each row).
        if (sliceIsWholeTableRows(run.slice)) {
          rowsKept = true;
          let rowPos = run.insertAt;
          tombstone.content.forEach((row) => {
            if (ROW_DELETION_REVISION_ATTR in (row.type.spec.attrs ?? {})) {
              tr.setNodeMarkup(rowPos, undefined, {
                ...row.attrs,
                [ROW_DELETION_REVISION_ATTR]: true,
              });
            }
            rowPos += row.nodeSize;
          });
        } else {
          markRowsOfWhollyDeletedTables(tr, run.insertAt, run.insertAt + tombstone.size);
          markDeletedParagraphMarks(tr, run.insertAt, run.insertAt + tombstone.size);
        }
        // Word leaves the insertion point before the character Backspace
        // struck through, so the next Backspace strikes the one before it.
        if (backspace && inserted.length === 0 && deleted.length === 1 && run.replaceTo === undefined) {
          tr.setSelection(TextSelection.create(tr.doc, run.insertAt));
        }
      }
    }
    // A row deleted under a cell merged down across it comes back marked
    // deleted, and the merge covers it again: shortened by the deletion, it
    // left the row a cell short, the table plugin filled the gap with a new
    // cell, and the stored table had one row more than its merge (corpus
    // R473-D04 LIVE: a row of a 34-row merged column deleted, the save
    // declined the table). `window.__docsTrackedRowSpanKeptOff = true`
    // leaves the merge shortened, as before.
    const keptOff =
      typeof window !== "undefined" &&
      (window as Window & { __docsTrackedRowSpanKeptOff?: boolean }).__docsTrackedRowSpanKeptOff === true;
    if (rowsKept && !keptOff) {
      for (const { pos, rowspan } of cellsShortenedByRowRemoval(userTr, laterTransactions)) {
        const at = tr.mapping.map(pos, 1);
        const node = tr.doc.nodeAt(at);
        const role = node?.type.spec.tableRole;
        if (!node || (role !== "cell" && role !== "header_cell") || (Number(node.attrs.rowspan) || 1) >= rowspan) continue;
        tr.setNodeMarkup(at, undefined, { ...node.attrs, rowspan });
        changed = true;
      }
    }
  }

  return changed ? tr : null;
}

/**
 * Every row of a table that lies wholly inside the re-inserted tombstone
 * [from, to) becomes a deleted row: accepting removes the table, rejecting
 * gives it back whole, as Word's tracked deletion of a table does.
 */
function markRowsOfWhollyDeletedTables(tr: Transaction, from: number, to: number): void {
  const rows: Array<{ pos: number; node: ProseMirrorNode }> = [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.spec.tableRole !== "table") return true;
    if (pos < from || pos + node.nodeSize > to) return true;
    node.forEach((row, offset) => {
      if (row.type.spec.tableRole === "row" && ROW_DELETION_REVISION_ATTR in (row.type.spec.attrs ?? {})) {
        rows.push({ pos: pos + 1 + offset, node: row });
      }
    });
    return false;
  });
  for (const { pos, node } of rows) {
    if (node.attrs[ROW_DELETION_REVISION_ATTR] === true) continue;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, [ROW_DELETION_REVISION_ATTR]: true });
  }
}

/** Every table row lying wholly inside an inserted range becomes an inserted row. */
function markInsertedRows(tr: Transaction, inserted: readonly InsertedRange[]): boolean {
  const rows: Array<{ pos: number; node: ProseMirrorNode }> = [];
  for (const range of inserted) {
    tr.doc.nodesBetween(range.from, Math.min(range.to, tr.doc.content.size), (node, pos) => {
      if (node.type.spec.tableRole !== "row") return !node.isTextblock;
      if (
        pos >= range.from &&
        pos + node.nodeSize <= range.to &&
        ROW_INSERTION_REVISION_ATTR in (node.type.spec.attrs ?? {}) &&
        !normalizeRowInsertionRevision(node.attrs[ROW_INSERTION_REVISION_ATTR])
      ) {
        rows.push({ pos, node });
      }
      return false;
    });
  }
  const { author, timestamp } = stampedAttrs();
  for (const { pos, node } of rows) {
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, [ROW_INSERTION_REVISION_ATTR]: { author, timestamp } });
  }
  return rows.length > 0;
}

/**
 * True when the intercepted edit is a Backspace at a caret: one deletion
 * ending where the collapsed selection stood.
 */
function backspaceDeletion(userTr: Transaction, oldState: EditorState): boolean {
  const { selection } = oldState;
  if (!selection.empty) return false;
  const steps = userTr.steps.filter(
    (step) => step instanceof ReplaceStep || step instanceof ReplaceAroundStep,
  ) as ReplaceStep[];
  if (steps.length !== 1) return false;
  const [step] = steps;
  return step.to > step.from && step.slice.size === 0 && step.to === selection.from;
}

/**
 * Where Backspace / Delete should start when the caret touches text that is
 * already struck through: past that deleted run, as Word skips it and
 * deletes the character beyond it. Null when nothing is to skip.
 */
export function skipDeletedRun(
  state: EditorState,
  direction: -1 | 1,
): number | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  let pos = selection.from;
  for (;;) {
    const $pos = state.doc.resolve(pos);
    const node = direction < 0 ? $pos.nodeBefore : $pos.nodeAfter;
    if (!node?.isText || !node.marks.some((m) => m.type.name === DELETION_MARK_NAME)) break;
    pos += direction * node.nodeSize;
  }
  return pos === selection.from ? null : pos;
}

/**
 * A `deleteContentBackward` / `deleteContentForward` beforeinput (an
 * on-screen keyboard's Backspace / Delete) while suggesting, at a caret
 * touching struck-through text: the caret steps past the deleted run and
 * the character beyond it is deleted by the editor — the deletion then
 * becomes a tracked one as any typed deletion does. Returns true when it
 * took the edit (the platform's own is cancelled). A beforeinput that
 * cannot be cancelled (some IME paths) still gets the caret moved, so the
 * platform deletes from there.
 */
export function deleteBesideDeletedRun(view: EditorView, event: InputEvent): boolean {
  if (!readSuggesting(view.state) || view.composing || event.isComposing) return false;
  const backward = event.inputType === "deleteContentBackward";
  if (!backward && event.inputType !== "deleteContentForward") return false;
  const target = skipDeletedRun(view.state, backward ? -1 : 1);
  if (target === null) return false;
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, target))
      .setMeta("addToHistory", false),
  );
  if (!event.cancelable) return false;
  event.preventDefault();
  const { state } = view;
  const $caret = state.doc.resolve(target);
  const neighbour = backward ? $caret.nodeBefore : $caret.nodeAfter;
  if (neighbour?.isText && neighbour.text) {
    // One user-perceived character: a surrogate pair is one.
    const text = neighbour.text;
    const code = backward ? text.codePointAt(Math.max(0, text.length - 2)) : text.codePointAt(0);
    const width = code !== undefined && code > 0xffff && text.length >= 2 ? 2 : 1;
    const from = backward ? target - width : target;
    view.dispatch(state.tr.delete(from, from + width).scrollIntoView());
    return true;
  }
  // At a block edge: join, or select the object beside the caret, as the key.
  const command = backward
    ? (s: EditorState, d?: (tr: Transaction) => void) =>
        joinBackward(s, d, view) || selectNodeBackward(s, d, view)
    : (s: EditorState, d?: (tr: Transaction) => void) =>
        joinForward(s, d, view) || selectNodeForward(s, d, view);
  command(view.state, view.dispatch);
  return true;
}

/**
 * The insertion revision a span continues: Word keeps one revision for text
 * the same author types in one run, so a keystroke next to that author's
 * pending insertion joins it instead of opening a revision per character. A
 * move endpoint keeps its own identity.
 */
function continuedInsertionMark(
  doc: ProseMirrorNode,
  span: InsertedRange,
  fresh: ProseMirrorMark,
): ProseMirrorMark | null {
  const neighbours = [
    doc.resolve(span.from).nodeBefore,
    doc.resolve(span.to).nodeAfter,
  ];
  for (const node of neighbours) {
    const existing = node?.marks.find((item) => item.type === fresh.type);
    if (
      existing &&
      existing.attrs.author === fresh.attrs.author &&
      !existing.attrs.moveId
    ) {
      return existing;
    }
  }
  return null;
}

// The name new revisions are stamped with: the signed-in person's, as Word
// stamps the user name of File > Options. One browser tab edits as one
// person, so the name is the tab's (set by the editor host once the
// identity is known); null until then, and for a guest.
let revisionAuthorName: string | null = null;

export function setRevisionAuthorName(name: string | null | undefined): void {
  revisionAuthorName = sanitizeChangeAuthor(name);
}

/** The name this editor stamps on the revisions it records (null: unknown). */
export function currentRevisionAuthorName(): string | null {
  return revisionAuthorName;
}

// Author/timestamp stamped onto a newly tracked change.
function stampedAttrs(): { author: string | null; timestamp: number } {
  return { author: revisionAuthorName, timestamp: Date.now() };
}

/**
 * Re-mark original text in `slice` with `deletionMark`, while omitting content
 * already carrying an insertion mark (deleting one's own pending insertion
 * removes it rather than creating a deletion tombstone). Supported inline atoms
 * participate in the same decision; unmarked atoms remain outside the
 * deletion/tombstone contract for this bounded slice.
 */
function applyMarkToSlice(
  slice: Slice,
  deletionMark: ProseMirrorMark,
  hasInsertionMark: boolean,
  report?: { keptObject: boolean },
): Slice | null {
  let sawInsertionOnly = true;
  let sawAny = false;

  const remark = (fragment: Fragment): Fragment => {
    const children: ProseMirrorNode[] = [];
    fragment.forEach((child) => {
      if (child.isText) {
        sawAny = true;
        const insertion = hasInsertionMark
          ? child.marks.find((m) => m.type.name === INSERTION_MARK_NAME)
          : undefined;
        if (insertion && !insertionIsAnotherReviewers(insertion, deletionMark)) return;
        sawInsertionOnly = false;
        if (insertion) {
          // Another reviewer's insertion, in the file: Word strikes the words
          // inside it (`w:ins > w:del`, ECMA-376 17.13.5.14) and they stay
          // until one of the two is decided. Taken out as one's own, Replace
          // All over a word someone else inserted left no trace of it
          // (corpus R456-D10 / R455-D56 E51).
          children.push(
            child.marks.some((m) => m.type.name === DELETION_MARK_NAME)
              ? child
              : child.mark(deletionMark.addToSet(child.marks)),
          );
          return;
        }
        // Text already struck through stays exactly as it was: deleting it
        // again changes nothing (re-stamping its revision was an invisible
        // edit and an undo step that seemed to do nothing).
        if (child.marks.some((m) => m.type.name === DELETION_MARK_NAME)) {
          children.push(child);
          return;
        }
        const kept = child.marks.filter(
          (m) =>
            m.type.name !== INSERTION_MARK_NAME &&
            m.type.name !== DELETION_MARK_NAME,
        );
        children.push(child.mark(deletionMark.addToSet(kept)));
      } else if (
        supportsTrackedInsertion(child) &&
        hasInsertionMark &&
        child.marks.some((m) => m.type.name === INSERTION_MARK_NAME)
      ) {
        sawAny = true;
        // This atom belongs only to the reviewer's still-unaccepted insertion.
        // Drop it even when the same deletion also contains original text; the
        // original text below is the only content that needs a tombstone.
      } else if (child.attrs[OBJECT_INSERTION_REVISION_ATTR] != null) {
        sawAny = true;
        // An object the reviewer's own unaccepted insertion put in: deleting
        // it takes it out, as deleting inserted text does.
      } else if (
        trackedObjectKind(child) &&
        child.type.spec.attrs !== undefined &&
        OBJECT_DELETION_REVISION_ATTR in child.type.spec.attrs
      ) {
        sawAny = true;
        sawInsertionOnly = false;
        // A picture, chart, shape, text box, equation, break or rule has no
        // text to strike through: the deletion is a revision of the object
        // itself (Word's w:del around its run, or the deleted paragraph mark
        // of a section break). One already deleted keeps its own revision; a
        // text box's words are not struck one by one, the box goes as one.
        children.push(
          child.attrs[OBJECT_DELETION_REVISION_ATTR] != null
            ? child
            : child.type.create(
                {
                  ...child.attrs,
                  [OBJECT_DELETION_REVISION_ATTR]: {
                    author: deletionMark.attrs.author ?? null,
                    timestamp: deletionMark.attrs.timestamp ?? null,
                    revisionId: null,
                  },
                },
                child.content,
                child.marks,
              ),
        );
      } else if (child.content.size > 0) {
        children.push(child.copy(remark(child.content)));
      } else {
        sawInsertionOnly = false;
        // Any other block object (a video, a cover page) cannot carry the
        // deletion: it comes back as it was, and the host says so. (An
        // empty paragraph or a line break is no object one would miss.)
        if (report && child.isLeaf && child.isBlock) {
          report.keptObject = true;
        }
        children.push(child);
      }
    });
    return Fragment.fromArray(children);
  };

  const content = remark(slice.content);
  // Pure deletion of one's own un-accepted insertion: nothing to tombstone.
  if (sawAny && sawInsertionOnly) return null;
  return new Slice(content, slice.openStart, slice.openEnd);
}

/**
 * Whether deleting these inserted words strikes them rather than taking them
 * out: they are another author's insertion the file holds (it has its
 * `w:id`). Deleting one's own pending insertion takes it out, as Word does;
 * an insertion not yet saved has no revision to nest the deletion in.
 */
function insertionIsAnotherReviewers(
  insertion: ProseMirrorMark,
  deletionMark: ProseMirrorMark,
): boolean {
  const revisionId: unknown = insertion.attrs.revisionId;
  if (typeof revisionId !== "string" || !/^[0-9]{1,10}$/.test(revisionId)) return false;
  if (insertion.attrs.moveId != null || insertion.attrs.moveRole != null) return false;
  const author = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return author(insertion.attrs.author) !== author(deletionMark.attrs.author);
}

/** Whether an inline node carries any tracked-change mark. */
function inlineNodeIsTracked(node: ProseMirrorNode): boolean {
  return node.marks.some(
    (mark) =>
      mark.type.name === INSERTION_MARK_NAME ||
      mark.type.name === DELETION_MARK_NAME ||
      mark.type.name === FORMAT_REVISION_MARK_NAME,
  );
}

/** The elements the tracked-change marks render as. */
const TRACKED_MARK_ELEMENT_SELECTOR = ".mrnote-tc-insertion, .mrnote-tc-deletion, .mrnote-tc-formatting";
/** DOM class of the change bar overlay host (a sibling of the editor root). */
export const CHANGE_BAR_OVERLAY_CLASS = "mrnote-tc-change-bars";
/** Word's change bars sit in the margin, this far before the text edge. */
const CHANGE_BAR_MARGIN_GAP_PX = 12;
const CHANGE_BAR_WIDTH_PX = 2;
/** Bound the overlay's work on a book-sized document with revisions on every line. */
const MAX_CHANGE_BARS = 4000;

interface TrackedRange {
  from: number;
  to: number;
  /** A paragraph-level format revision marks the line of its paragraph mark. */
  paragraphMark: boolean;
  /** A deleted object: the bar spans the object's own box. */
  object?: boolean;
}

function nodeIsDeletedObject(node: ProseMirrorNode): boolean {
  return (
    trackedObjectKind(node) !== null &&
    (node.attrs[OBJECT_DELETION_REVISION_ATTR] != null ||
      node.attrs[OBJECT_INSERTION_REVISION_ATTR] != null)
  );
}

/** Each document's tracked ranges: an immutable document has the same
 * answer every time the bars are painted. */
const trackedRangesOf = new WeakMap<ProseMirrorNode, readonly TrackedRange[]>();

/** Every tracked range of the document, in document order. */
function trackedRanges(doc: ProseMirrorNode): TrackedRange[] {
  let ranges = trackedRangesOf.get(doc);
  if (!ranges) trackedRangesOf.set(doc, (ranges = scanTrackedRanges(doc)));
  return ranges.map((range) => ({ ...range }));
}

const HOLDS_TRACKED = new SheetFact((node) =>
  nodeIsDeletedObject(node) || Boolean(tablePropertyRevisionOf(node)) || Boolean(node.attrs[PARAGRAPH_FORMAT_REVISION_ATTR]) || inlineNodeIsTracked(node),
);

function scanTrackedRanges(doc: ProseMirrorNode): TrackedRange[] {
  const ranges: TrackedRange[] = [];
  HOLDS_TRACKED.descendants(doc, (node, pos) => {
    if (nodeIsDeletedObject(node)) {
      ranges.push({ from: pos, to: pos + node.nodeSize, paragraphMark: false, object: true });
      return false;
    }
    // A cell, row or table whose properties changed: Word draws the change
    // bar beside the lines of what changed.
    if (tablePropertyRevisionOf(node) && node.content.size > 0) {
      ranges.push({ from: pos + 1, to: pos + node.nodeSize - 1, paragraphMark: false });
      return true;
    }
    if (node.isTextblock) {
      if (node.attrs[PARAGRAPH_FORMAT_REVISION_ATTR]) {
        const end = pos + node.nodeSize - 1;
        ranges.push({ from: Math.max(pos + 1, end - 1), to: end, paragraphMark: true });
      }
      node.forEach((child, offset) => {
        if (nodeIsDeletedObject(child)) {
          const from = pos + 1 + offset;
          ranges.push({ from, to: from + child.nodeSize, paragraphMark: false, object: true });
          return;
        }
        if (inlineNodeIsTracked(child)) {
          const last = ranges[ranges.length - 1];
          const from = pos + 1 + offset;
          const to = from + child.nodeSize;
          if (last && !last.paragraphMark && last.to === from) last.to = to;
          else ranges.push({ from, to, paragraphMark: false });
        }
      });
      return false;
    }
    return true;
  });
  return ranges;
}

interface LineBox {
  top: number;
  bottom: number;
  left: number;
}

/**
 * The line boxes a tracked range paints on, as client rects: the boxes of
 * the inline elements holding its text (an inline box spans its line's
 * height, a glyph box does not). A deletion hidden by the presentation has
 * no box of its own; the caret box at its position (or just before it)
 * names its line, as Word marks the line the deleted text was on.
 */
function trackedRangeLineRects(view: EditorView, range: TrackedRange): DOMRect[] {
  const rects: DOMRect[] = [];
  // A far page drawn hollow has no lines to mark: its bar comes with its text.
  if (positionOnHollowPage(view.state, range.from)) return rects;
  if (range.object) {
    const element = view.nodeDOM(range.from);
    if (element instanceof Element) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return [rect];
    }
  }
  const seen = new Set<Element>();
  view.state.doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (!node.isText) return true;
    try {
      const at = view.domAtPos(Math.max(pos, range.from), 1);
      const target = at.node.nodeType === Node.TEXT_NODE ? at.node.parentElement : (at.node.childNodes[at.offset] ?? at.node);
      const inner = target instanceof Element ? target : target?.parentElement;
      // The mark's own element spans the line box; a display span nested
      // inside it may carry a smaller box of its own.
      const element = inner?.closest(TRACKED_MARK_ELEMENT_SELECTOR) ?? inner;
      if (!element || seen.has(element) || !view.dom.contains(element)) return false;
      seen.add(element);
      for (const rect of Array.from(element.getClientRects())) {
        if (rect.width > 0 && rect.height > 0) rects.push(rect);
      }
    } catch {
      // A transitioning node view: the caret box below still names the line.
    }
    return false;
  });
  if (rects.length > 0) return rects;
  for (const pos of [range.from, Math.max(0, range.from - 1), range.to]) {
    try {
      const coords = view.coordsAtPos(pos);
      if (coords.bottom > coords.top) {
        // A caret box is a glyph box; the bar spans the line. The tallest
        // inline box on the caret's line is the line box: widen to the
        // union of the block's inline boxes that overlap the caret by half.
        let top = coords.top;
        let bottom = coords.bottom;
        const at = view.domAtPos(pos, 1);
        const element = at.node instanceof Element ? at.node : at.node.parentElement;
        const block = element?.closest<HTMLElement>("p, h1, h2, h3, h4, h5, h6, li, td, th");
        if (block) {
          for (const inline of Array.from(block.querySelectorAll<HTMLElement>("span, a, b, i, em, strong, code, sup, sub")).slice(0, 512)) {
            for (const rect of Array.from(inline.getClientRects())) {
              if (rect.height <= 0) continue;
              const overlap = Math.min(rect.bottom, coords.bottom) - Math.max(rect.top, coords.top);
              if (overlap >= Math.min(rect.height, coords.bottom - coords.top) / 2) {
                top = Math.min(top, rect.top);
                bottom = Math.max(bottom, rect.bottom);
              }
            }
          }
        }
        rects.push(new DOMRect(coords.left, top, 1, bottom - top));
        break;
      }
    } catch {
      // Outside the rendered view; try the next anchor.
    }
  }
  return rects;
}

/** The text edge a line's bar sits before: its page sheet's content edge, or
 * the editor root's in pageless mode. */
function lineTextEdge(
  view: EditorView,
  pos: number,
  edges?: Map<HTMLElement, number>,
): { left: number; host: HTMLElement } {
  let host: HTMLElement = view.dom;
  try {
    const at = view.domAtPos(pos, 1);
    const element = at.node instanceof HTMLElement ? at.node : at.node.parentElement;
    host = element?.closest<HTMLElement>("article[data-page-sheet]") ?? view.dom;
  } catch {
    // The editor root is the edge.
  }
  // One sheet's edge is one reading per paint, however many changes it holds.
  const known = edges?.get(host);
  if (known !== undefined) return { left: known, host };
  const rect = host.getBoundingClientRect();
  const scale = paginationLayoutScale(host);
  const padding = Number.parseFloat(getComputedStyle(host).paddingLeft) || 0;
  const left = rect.left + padding * scale.x;
  edges?.set(host, left);
  return { left, host };
}

/** The nearest ancestor that scrolls the editor (its pages scroll in it). */
function scrollParentOf(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style && /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`) && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

/**
 * The document positions on or near the screen: the top-level blocks (page
 * sheets) whose boxes meet the scroller's view widened by a screen above and
 * below. A long document's bars are painted there only, as its pages are
 * read on screen; a scroll paints the next ones. Null: everything (no
 * scroller, or nothing measured).
 */
export function visiblePositionSpans(view: EditorView, scroller: HTMLElement | null): Array<[number, number]> | null {
  if (!scroller) return null;
  const view_ = scroller.getBoundingClientRect();
  const reach = Math.max(view_.height, 400);
  const top = view_.top - reach;
  const bottom = view_.bottom + reach;
  const spans: Array<[number, number]> = [];
  view.state.doc.forEach((child, offset) => {
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof Element)) {
      spans.push([offset, offset + child.nodeSize]);
      return;
    }
    const rect = dom.getBoundingClientRect();
    if (rect.bottom >= top && rect.top <= bottom) {
      const last = spans[spans.length - 1];
      if (last && last[1] === offset) last[1] = offset + child.nodeSize;
      else spans.push([offset, offset + child.nodeSize]);
    }
  });
  return spans;
}

/**
 * Word's change bars: a bar in the margin beside every line that carries a
 * tracked change, red in Simple Markup and grey in All Markup; a click on
 * a bar switches between the two, as in Word. Painted on an overlay that is
 * a sibling of the editor root (never inside ProseMirror's DOM), measured
 * from the live layout after every update, so pagination, zoom and fonts
 * are all reflected and the document is never touched.
 */
/** The live change-bar overlay of each editor root, for a print to read. */
const changeBarOverlays = new WeakMap<HTMLElement, ChangeBarOverlay>();

/**
 * The editor root's change bars painted now, from the layout as it stands
 * (a print copies them onto its sheets: Word prints the change bars of the
 * markup it shows), or null when the root paints none (a filter that shows
 * no bars, no tracked change, no overlay).
 */
export function paintedChangeBars(root: HTMLElement): readonly HTMLElement[] | null {
  const overlay = changeBarOverlays.get(root);
  if (!overlay) return null;
  return overlay.paintNow();
}

class ChangeBarOverlay {
  private readonly overlay: HTMLElement;
  private frame: number | null = null;
  private readonly resize: ResizeObserver | null = null;
  private readonly onFonts = () => this.schedule();
  private readonly onResize = () => this.schedule();
  private readonly onScroll = () => this.schedule();
  private filter: TrackedChangeMarkupFilter = "all";
  /** The editor's scroller: the bars are painted for what is on or near its screen. */
  private scroller: HTMLElement | null = null;

  constructor(
    private readonly view: EditorView,
    /** Nobody looks at these pages (the print surface): the bars are painted
     * when the print copy asks for them. Followed through a layout, with no
     * scroller to bound them, a 272-page book's 262 changes were measured on
     * every update: 66 s of its print's 246 s. */
    private readonly onlyWhenAsked = false,
  ) {
    const doc = view.dom.ownerDocument;
    this.overlay = doc.createElement("div");
    this.overlay.className = CHANGE_BAR_OVERLAY_CLASS;
    this.overlay.setAttribute("aria-hidden", "true");
    this.overlay.setAttribute("data-testid", "track-changes-change-bars");
    this.overlay.addEventListener("click", (event) => {
      const bar = (event.target as HTMLElement | null)?.closest<HTMLElement>(`.${SIMPLE_MARKUP_CHANGE_BAR_CLASS}`);
      if (!bar) return;
      event.preventDefault();
      const next = readMarkupFilter(this.view.state) === "simple" ? "all" : "simple";
      this.view.dispatch(this.view.state.tr.setMeta(SET_MARKUP_FILTER_META, next));
    });
    view.dom.parentElement?.insertBefore(this.overlay, view.dom.nextSibling);
    changeBarOverlays.set(view.dom, this);
    const win = doc.defaultView;
    if (win && typeof win.ResizeObserver === "function") {
      this.resize = new win.ResizeObserver(this.onResize);
      this.resize.observe(view.dom);
    }
    try {
      doc.fonts?.addEventListener("loadingdone", this.onFonts);
    } catch {
      // No FontFaceSet in this environment.
    }
  }

  /** Paint at once (a pending frame is taken now); the bars painted. */
  paintNow(): readonly HTMLElement[] | null {
    const win = this.view.dom.ownerDocument.defaultView;
    if (this.frame !== null && win) {
      win.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.filter = readMarkupFilter(this.view.state);
    // Asked for the bars themselves (a print copies them all): every line.
    this.paint(true);
    const bars = Array.from(this.overlay.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    return bars.length > 0 ? bars : null;
  }

  update(): void {
    this.filter = readMarkupFilter(this.view.state);
    if (this.filter !== "simple" && this.filter !== "all") {
      this.clear();
      return;
    }
    this.schedule();
  }

  /** Coalesce measurement to one frame: layout is settled by then. */
  private schedule(): void {
    if (this.onlyWhenAsked) return;
    if (this.filter !== "simple" && this.filter !== "all") return;
    const win = this.view.dom.ownerDocument.defaultView;
    if (!win || typeof win.requestAnimationFrame !== "function") {
      this.paint();
      return;
    }
    if (this.frame !== null) return;
    this.frame = win.requestAnimationFrame(() => {
      this.frame = null;
      this.paint();
    });
  }

  private clear(): void {
    const win = this.view.dom.ownerDocument.defaultView;
    if (this.frame !== null && win) {
      win.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.overlay.replaceChildren();
    this.overlay.removeAttribute("data-markup-filter");
  }

  private paint(everything = false): void {
    if (this.filter !== "simple" && this.filter !== "all") {
      this.clear();
      return;
    }
    const container = this.overlay.offsetParent instanceof HTMLElement ? this.overlay.offsetParent : this.overlay.parentElement;
    if (!container) return;
    const ranges = trackedRanges(this.view.state.doc);
    if (ranges.length === 0) {
      this.clear();
      return;
    }
    // The overlay paints in its own layout space: a document zoom applied
    // to the editor root scales the measured lines but not this sibling,
    // one applied above both scales them alike. Undo only what scales the
    // overlay itself.
    const scale = paginationTransformScale(this.overlay) ?? { x: 1, y: 1 };
    const host = container.getBoundingClientRect();
    const layoutUnit = (value: number) => Math.round(value * 64) / 64;
    const boxes: LineBox[] = [];
    // Measured for the screen and a screen either side only: each range read
    // forces the layout it sits in, and a reviewed book (2,700 changes) was
    // measured whole on every update while its pages were laid out (29 s of
    
    if (!everything) this.watchScroller();
    const spans = everything ? null : visiblePositionSpans(this.view, this.scroller);
    const edges = new Map<HTMLElement, number>();
    for (const range of ranges) {
      if (boxes.length >= MAX_CHANGE_BARS) break;
      if (spans && !spans.some(([from, to]) => range.to >= from && range.from <= to)) continue;
      const edge = lineTextEdge(this.view, range.from, edges);
      const rects = trackedRangeLineRects(this.view, range);
      const rectsOnLines = range.paragraphMark && rects.length > 1 ? [rects[rects.length - 1]] : rects;
      for (const rect of rectsOnLines) boxes.push({ top: rect.top, bottom: rect.bottom, left: edge.left });
    }
    // Boxes are merged by vertical overlap: a tall inline box and the text
    // beside it are one line, two lines never overlap by half a box.
    boxes.sort((a, b) => a.top - b.top || a.left - b.left);
    const lines: LineBox[] = [];
    for (const box of boxes) {
      const line = lines[lines.length - 1];
      const overlap = line ? Math.min(line.bottom, box.bottom) - Math.max(line.top, box.top) : 0;
      if (line && Math.abs(line.left - box.left) < 0.5 && overlap >= Math.min(line.bottom - line.top, box.bottom - box.top) / 2) {
        line.top = Math.min(line.top, box.top);
        line.bottom = Math.max(line.bottom, box.bottom);
      } else {
        lines.push({ ...box });
      }
    }
    // The bars painted before are kept and moved: built anew on every paint,
    // each typed key inserted every bar on the screen again (54 a key on a
    
    const kept = Array.from(this.overlay.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains(SIMPLE_MARKUP_CHANGE_BAR_CLASS),
    );
    const extra: HTMLElement[] = [];
    lines.forEach((line, index) => {
      let bar = kept[index];
      if (!bar) {
        bar = this.overlay.ownerDocument.createElement("div");
        bar.className = SIMPLE_MARKUP_CHANGE_BAR_CLASS;
        extra.push(bar);
      }
      const top = `${layoutUnit((line.top - host.top) / scale.y - container.clientTop + container.scrollTop)}px`;
      const height = `${layoutUnit((line.bottom - line.top) / scale.y)}px`;
      const left = `${layoutUnit((line.left - host.left) / scale.x - container.clientLeft + container.scrollLeft - CHANGE_BAR_MARGIN_GAP_PX - CHANGE_BAR_WIDTH_PX)}px`;
      if (bar.style.top !== top) bar.style.top = top;
      if (bar.style.height !== height) bar.style.height = height;
      if (bar.style.left !== left) bar.style.left = left;
    });
    for (const bar of kept.slice(lines.length)) bar.remove();
    const bars = new Set<Element>(kept);
    for (const child of Array.from(this.overlay.children)) {
      if (!bars.has(child)) child.remove();
    }
    if (extra.length > 0) this.overlay.append(...extra);
    if (this.overlay.getAttribute("data-markup-filter") !== this.filter) {
      this.overlay.setAttribute("data-markup-filter", this.filter);
    }
  }

  /** Follow the editor's scroller (found once it scrolls: the pages make it). */
  private watchScroller(): void {
    if (this.scroller?.isConnected) return;
    this.scroller?.removeEventListener("scroll", this.onScroll);
    this.scroller = scrollParentOf(this.view.dom);
    this.scroller?.addEventListener("scroll", this.onScroll, { passive: true });
  }

  destroy(): void {
    const win = this.view.dom.ownerDocument.defaultView;
    if (this.frame !== null && win) win.cancelAnimationFrame(this.frame);
    this.scroller?.removeEventListener("scroll", this.onScroll);
    this.resize?.disconnect();
    try {
      this.view.dom.ownerDocument.fonts?.removeEventListener("loadingdone", this.onFonts);
    } catch {
      // No FontFaceSet in this environment.
    }
    if (changeBarOverlays.get(this.view.dom) === this) changeBarOverlays.delete(this.view.dom);
    this.overlay.remove();
  }
}

/**
 * A deleted object is drawn as Word draws it: a picture, chart, shape or
 * text box with a line through it, an equation in struck revision red, a
 * break or a horizontal line with its change bar alone; all hidden by the
 * final-view filters as deleted text is. The node views own the objects'
 * DOM, so the look is a node decoration (`data-tc-object-kind` picks the
 * rule); it is rebuilt only by a step that touches such an object.
 */
const objectDeletionDecorationsKey = new PluginKey<DecorationSet>(
  "trackChangesObjectDeletions",
);

function objectDeletionDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations = objectRevisionDecorations(trackedDeletedObjects(doc), trackedInsertedObjects(doc));
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

function objectRevisionDecorations(
  deleted: readonly ReturnType<typeof trackedDeletedObjects>[number][],
  inserted: readonly ReturnType<typeof trackedInsertedObjects>[number][],
): Decoration[] {
  const decorations = deleted.map(({ pos, node, kind, revision }) =>
    Decoration.node(pos, pos + node.nodeSize, {
      class: `mrnote-tc-object-deletion${kind === "picture" ? " mrnote-tc-picture-deletion" : ""}`,
      "data-tc-object-deletion": "true",
      "data-tc-object-kind": kind,
      ...(trackedObjectKindIsStruck(kind) ? { "data-tc-object-struck": "true" } : {}),
      ...(revision.author ? { "data-tc-author": revision.author } : {}),
    }),
  );
  // An inserted object: a drawing or an equation is underlined in the
  // revision colour as inserted text is; a break or a rule only gets its
  // change bar.
  for (const { pos, node, kind, revision } of inserted) {
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: "mrnote-tc-object-insertion",
        "data-tc-object-insertion": "true",
        "data-tc-object-kind": kind,
        ...(trackedObjectKindIsStruck(kind) ? { "data-tc-object-underlined": "true" } : {}),
        ...(revision.author ? { "data-tc-author": revision.author } : {}),
      }),
    );
  }
  return decorations;
}

/**
 * Where `tr` changed its document, as ranges of the document after it; null
 * for a step whose reach this cannot tell (the decorations are then rebuilt
 * whole). An attribute step changes its node alone.
 */
function changedRangesAfter(tr: Transaction): Array<{ from: number; to: number }> | null {
  const ranges: Array<{ from: number; to: number }> = [];
  for (let index = 0; index < tr.steps.length; index += 1) {
    const step = tr.steps[index];
    const after = tr.mapping.slice(index + 1);
    if (step instanceof AttrStep) {
      const pos = after.map((step as unknown as { pos: number }).pos, 1);
      const node = tr.doc.nodeAt(pos);
      ranges.push({ from: pos, to: pos + (node?.nodeSize ?? 1) });
      continue;
    }
    if (!(step instanceof ReplaceStep) && !(step instanceof ReplaceAroundStep)) return null;
    step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push({ from: after.map(newStart, -1), to: after.map(newEnd, 1) });
    });
  }
  return ranges;
}

/**
 * The decorations after `tr`, which touched objects: those it left mapped,
 * those of the objects in the ranges it changed read again. A stroke landed
 * on a long note rebuilt every object's decoration of the document, two walks
 * of it, at every lift.
 */
function objectDeletionDecorationsAfter(tr: Transaction, value: DecorationSet, doc: ProseMirrorNode): DecorationSet {
  const ranges = changedRangesAfter(tr);
  if (!ranges) return objectDeletionDecorations(doc);
  let next = value.map(tr.mapping, doc);
  for (const { from, to } of ranges) {
    // A step's edges, widened by one: an object touching an insertion is read
    // again too. What is taken away is exactly what is read again: the
    // decorations over a node that reaches into the range (nodesBetween's own
    // test), not every one `find` returns touching its ends.
    const start = Math.max(0, Math.min(from - 1, doc.content.size));
    const end = Math.max(start, Math.min(to + 1, doc.content.size));
    const stale = next.find(start, end).filter((decoration) => decoration.to > start && decoration.from < end);
    if (stale.length) next = next.remove(stale);
    const fresh = objectRevisionDecorations(
      trackedDeletedObjectsBetween(doc, start, end),
      trackedInsertedObjectsBetween(doc, start, end),
    );
    if (fresh.length) next = next.add(doc, fresh);
  }
  return next;
}

function stepTouchesObjects(transaction: Transaction): boolean {
  return transaction.steps.some((step) => {
    if (step instanceof AttrStep) return true;
    const slice = (step as { slice?: { content: { descendants: (f: (node: ProseMirrorNode) => boolean) => void } } }).slice;
    if (!slice) return false;
    let found = false;
    slice.content.descendants((node) => {
      if (trackedObjectKind(node)) found = true;
      return !found;
    });
    return found;
  });
}

function createObjectDeletionDecorationsPlugin() {
  return new Plugin<DecorationSet>({
    key: objectDeletionDecorationsKey,
    state: {
      init: (_config, state) => objectDeletionDecorations(state.doc),
      apply: (tr, value, _old, state) => {
        if (!tr.docChanged) return value;
        return stepTouchesObjects(tr)
          ? objectDeletionDecorationsAfter(tr, value, state.doc)
          : value.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations: (state) => objectDeletionDecorationsKey.getState(state),
    },
  });
}

function createSuggestingPlugin(changeBarsOnlyWhenAsked: boolean) {
  return new Plugin<TrackChangesPluginState>({
    key: trackChangesPluginKey,
    props: {
      handleKeyDown(view, event) {
        if (!readSuggesting(view.state) || view.composing || event.isComposing) return false;
        if (event.key !== "Backspace" && event.key !== "Delete") return false;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
        const target = skipDeletedRun(view.state, event.key === "Backspace" ? -1 : 1);
        if (target === null) return false;
        // Step over the struck-through run, then let the key delete as usual.
        view.dispatch(
          view.state.tr
            .setSelection(TextSelection.create(view.state.doc, target))
            .setMeta("addToHistory", false),
        );
        return false;
      },
      handleDOMEvents: {
        
        // keyboards report the key as "Unidentified", so the keydown above
        // never sees it, and the platform would delete the struck-through
        // character itself (a deletion of deleted text: nothing happens).
        // Its beforeinput names the edit instead: step over the run and
        // delete the character beyond it, as the key does.
        beforeinput(view, event) {
          return deleteBesideDeletedRun(view, event as InputEvent);
        },
      },
    },
    state: {
      init: () => ({
        justMine: false,
        markupFilter: "all",
      }),
      apply: (tr, value) => {
        const justMine = tr.getMeta(SET_SUGGESTING_META);
        const markupFilter = tr.getMeta(SET_MARKUP_FILTER_META);
        let next = value;
        if (typeof justMine === "boolean" && justMine !== next.justMine) {
          next = { ...next, justMine };
        }
        if (markupFilter !== undefined) {
          next = {
            ...next,
            markupFilter: normalizeTrackedChangeMarkupFilter(markupFilter),
          };
        }
        return next;
      },
    },
    appendTransaction: (transactions, oldState, newState) => {
      // FLAG GATE: when suggesting is OFF, this is a strict no-op → zero
      // regression to normal editing.
      if (!readSuggesting(newState)) return null;
      const userTransactionIndex = transactions.findIndex(shouldIntercept);
      if (userTransactionIndex < 0) return null;
      return buildTrackingTransaction(
        newState,
        oldState,
        transactions[userTransactionIndex],
        transactions.slice(userTransactionIndex + 1),
      );
    },
    view: (view) => {
      let renderedMarkupFilter: TrackedChangeMarkupFilter | null = null;
      const syncMarkupFilter = () => {
        const nextMarkupFilter = readMarkupFilter(view.state);
        if (nextMarkupFilter === renderedMarkupFilter) return;
        const previous = renderedMarkupFilter;
        renderedMarkupFilter = nextMarkupFilter;
        view.dom.setAttribute(
          "data-track-changes-markup-filter",
          nextMarkupFilter,
        );
        // Deleted text shown or hidden changes every line box after it, and
        // no transaction says so: the pages are laid out again, as Word
        // repaginates when Display for Review changes (No Markup after All
        // Markup drew the final copy on the All Markup pages, half empty).
        if (previous !== null && documentHasTrackedChanges(view.state.doc)) {
          view.dom.dispatchEvent(
            new CustomEvent("mrn-page-rebalance", { bubbles: true, detail: { reason: "track-changes-markup-filter" } }),
          );
        }
      };
      syncMarkupFilter();
      const changeBars = new ChangeBarOverlay(view, changeBarsOnlyWhenAsked);
      changeBars.update();
      return {
        update: () => {
          syncMarkupFilter();
          changeBars.update();
        },
        destroy: () => {
          changeBars.destroy();
          view.dom.removeAttribute("data-track-changes-markup-filter");
        },
      };
    },
  });
}

/**
 * Resolve the revision at the caret, or every revision the selection touches
 * (Word accepts `Selection.Range.Revisions`, so Select All then Accept accepts
 * them all), optionally advancing to the next remaining one, in one history
 * step. Targets and successor are derived from the command's live state,
 * never a React snapshot.
 */
function resolveSelectedChanges(
  tr: Transaction,
  resolveChange: (transaction: Transaction, position: number) => boolean,
  moveNext: boolean,
  




  filter: TrackedChangeMarkupFilter = "all",
): boolean {
  const changes = listTrackedChanges(tr.doc).filter((change) =>
    trackedChangeIsShown(change, filter),
  );
  const targets = trackedChangeEntriesInSelection(changes, tr.selection);
  if (targets.length === 0) {
    tr.setMeta("preventDispatch", true);
    return false;
  }

  let next: TrackedChangeEntry | null = null;
  if (moveNext) {
    const lastIndex = changes.indexOf(targets[targets.length - 1]);
    for (let step = 1; step < changes.length && !next; step += 1) {
      const candidate = changes[(lastIndex + step) % changes.length];
      if (!targets.includes(candidate)) next = candidate;
    }
  }
  tr.setMeta(TRACK_CHANGES_SKIP_META, true);
  // Last first, each re-found at its mapped start, and only when the change
  // found there is still of its kind (one resolved with another is skipped).
  const firstStep = tr.mapping.maps.length;
  let resolved = false;
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const target = targets[index];
    const position = tr.mapping.slice(firstStep).map(target.from, 1);
    if (trackedChangeAt(tr.doc, position)?.kind !== target.kind) continue;
    resolved = resolveChange(tr, position) || resolved;
  }
  if (!resolved) {
    tr.setMeta("preventDispatch", true);
    return false;
  }

  if (next) {
    const from = tr.mapping.map(next.from, 1);
    const to = tr.mapping.map(next.to, -1);
    // A deleted object is selected as the object it is.
    tr.setSelection(
      next.object && tr.doc.nodeAt(from)
        ? NodeSelection.create(tr.doc, from)
        : TextSelection.create(tr.doc, from, to),
    );
  }
  return true;
}

/** Accept/Reject All and Stop Tracking: tracking off in every mode. */
function stopTracking(tr: Transaction): void {
  if (tracksForEveryone(tr)) tr.setDocAttribute(TRACK_REVISIONS_ATTR, false);
  tr.setMeta(SET_SUGGESTING_META, false);
}

/**
 * Write a Track Changes mode choice: the document's For Everyone setting is
 * a doc attr (a DocAttrStep, so it is saved and reaches every co-author
 * through the shared document attributes), Just Mine is this session's
 * plugin state. Refused on a locked document unless the choice keeps For
 * Everyone on.
 */
function writeTrackChangesMode(
  state: EditorState,
  tr: Transaction,
  mode: TrackChangesMode,
  dispatch: ((tr: Transaction) => void) | undefined,
): boolean {
  const next = trackChangesModeTransition(mode, trackingIsLocked(state));
  if (!next) return false;
  const forEveryoneChanges = next.forEveryone !== tracksForEveryone(state);
  if (!forEveryoneChanges && next.justMine === readJustMine(state)) return true;
  if (!dispatch) return true;
  tr.setMeta(TRACK_CHANGES_SKIP_META, true);
  tr.setMeta(SET_SUGGESTING_META, next.justMine);
  if (forEveryoneChanges) {
    tr.setDocAttribute(TRACK_REVISIONS_ATTR, next.forEveryone);
    // A document change in its own undo step, like the tracking lock: the
    // collaborative attribute map only carries authored (history) changes.
    dispatch(closeHistory(tr));
  } else {
    tr.setMeta("addToHistory", false);
    dispatch(tr);
  }
  return true;
}

/** HTML round trip of a cell, row or table property revision. */
function tablePropertyRevisionHtmlAttribute(scope: TablePropertyRevisionScope, dataName: string) {
  const attr = tablePropertyRevisionAttr(scope);
  return {
    default: null,
    keepOnSplit: false,
    parseHTML: (element: HTMLElement) => {
      const raw = element.getAttribute(dataName);
      if (!raw) return null;
      try {
        return normalizeTablePropertyRevision(JSON.parse(raw), scope);
      } catch {
        return null;
      }
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const revision = normalizeTablePropertyRevision(attributes[attr], scope);
      return revision ? { [dataName]: JSON.stringify(revision), "data-tc-table-formatting": "true" } : {};
    },
  };
}

export const TrackChanges = Extension.create<{ changeBarsOnlyWhenAsked: boolean }>({
  name: "trackChanges",

  addOptions() {
    return { changeBarsOnlyWhenAsked: false };
  },

  addExtensions() {
    return [InsertionMark, DeletionMark, FormattingRevisionMark];
  },

  addGlobalAttributes() {
    return [
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          [CELL_FORMAT_REVISION_ATTR]: tablePropertyRevisionHtmlAttribute("cell", "data-track-cell-formatting"),
        },
      },
      {
        types: ["table"],
        attributes: {
          [TABLE_FORMAT_REVISION_ATTR]: tablePropertyRevisionHtmlAttribute("table", "data-track-table-formatting"),
        },
      },
      {
        types: ["tableRow"],
        attributes: {
          [ROW_FORMAT_REVISION_ATTR]: tablePropertyRevisionHtmlAttribute("row", "data-track-row-formatting"),
          [ROW_INSERTION_REVISION_ATTR]: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element: HTMLElement) => {
              const value = element.getAttribute("data-track-row-insertion");
              if (value === null) return null;
              try {
                return normalizeRowInsertionRevision(JSON.parse(value));
              } catch {
                return normalizeRowInsertionRevision(true);
              }
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              const revision = normalizeRowInsertionRevision(attributes[ROW_INSERTION_REVISION_ATTR]);
              return revision ? { "data-track-row-insertion": JSON.stringify(revision) } : {};
            },
          },
          [ROW_DELETION_REVISION_ATTR]: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute("data-track-row-deletion") === "true" ? true : null,
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes[ROW_DELETION_REVISION_ATTR] === true
                ? { "data-track-row-deletion": "true" }
                : {},
          },
        },
      },
      {
        types: [...OBJECT_DELETION_NODE_NAMES],
        attributes: {
          [OBJECT_DELETION_REVISION_ATTR]: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element: HTMLElement) => {
              // `data-track-picture-deletion` is the attribute's first spelling.
              const raw =
                element.getAttribute("data-track-object-deletion") ??
                element.getAttribute("data-track-picture-deletion");
              if (!raw) return null;
              try {
                return normalizeObjectDeletionRevision(JSON.parse(raw));
              } catch {
                return null;
              }
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              const revision = normalizeObjectDeletionRevision(
                attributes[OBJECT_DELETION_REVISION_ATTR] ??
                  attributes[LEGACY_PICTURE_DELETION_REVISION_ATTR],
              );
              return revision
                ? { "data-track-object-deletion": JSON.stringify(revision) }
                : {};
            },
          },
        },
      },
      {
        types: [...OBJECT_INSERTION_NODE_NAMES],
        attributes: {
          [OBJECT_INSERTION_REVISION_ATTR]: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element: HTMLElement) => {
              const raw = element.getAttribute("data-track-object-insertion");
              if (!raw) return null;
              try {
                return normalizeObjectDeletionRevision(JSON.parse(raw));
              } catch {
                return null;
              }
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              const revision = normalizeObjectDeletionRevision(
                attributes[OBJECT_INSERTION_REVISION_ATTR],
              );
              return revision
                ? { "data-track-object-insertion": JSON.stringify(revision) }
                : {};
            },
          },
        },
      },
      {
        types: ["paragraph", "heading"],
        attributes: {
          // A tracked paragraph mark (an inserted or deleted paragraph).
          [PARAGRAPH_MARK_REVISION_ATTR]: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element: HTMLElement) => {
              const raw = element.getAttribute("data-tc-paragraph-mark");
              if (!raw) return null;
              try {
                return normalizeParagraphMarkRevision(JSON.parse(raw));
              } catch {
                return null;
              }
            },
            renderHTML: (attrs: Record<string, unknown>) => {
              const revision = normalizeParagraphMarkRevision(
                attrs[PARAGRAPH_MARK_REVISION_ATTR],
              );
              return revision
                ? {
                    "data-tc-paragraph-mark": JSON.stringify(revision),
                    "data-tc-paragraph-mark-kind": revision.kind,
                  }
                : {};
            },
          },
          [PARAGRAPH_FORMAT_REVISION_ATTR]: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              let previousAttrs: unknown = null;
              try {
                previousAttrs = JSON.parse(
                  element.getAttribute("data-tc-previous-paragraph") ?? "null",
                );
              } catch {
                return null;
              }
              return normalizeNativeParagraphFormatRevisionAuthority({
                revisionId: element.getAttribute(
                  "data-tc-paragraph-revision-id",
                ),
                author: element.getAttribute("data-tc-paragraph-author"),
                timestamp: element.getAttribute("data-tc-paragraph-ts"),
                previousAttrs,
              });
            },
            renderHTML: (attrs: Record<string, unknown>) => {
              const authority = normalizeNativeParagraphFormatRevisionAuthority(
                attrs[PARAGRAPH_FORMAT_REVISION_ATTR],
              );
              if (!authority) return {};
              return {
                "data-tc-paragraph-formatting": "true",
                "data-tc-paragraph-revision-id": authority.revisionId,
                ...(authority.author
                  ? { "data-tc-paragraph-author": authority.author }
                  : {}),
                ...(authority.timestamp !== null
                  ? { "data-tc-paragraph-ts": String(authority.timestamp) }
                  : {}),
                "data-tc-previous-paragraph": JSON.stringify(
                  authority.previousAttrs,
                ),
              };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      createSuggestingPlugin(this.options.changeBarsOnlyWhenAsked),
      createObjectDeletionDecorationsPlugin(),
      // A page-ledger pass, or typing plain text into a paragraph, changes no
      // revision: a revision-free document's (empty) list goes on to the
      // document it made.
      new Plugin({
        state: {
          init: () => null,
          apply: (tr, value, oldState, newState) => {
            if (tr.docChanged && tr.getMeta(PAGE_LEDGER_REBALANCE_META) === true) {
              carryRevisionFreeListThroughLayout(oldState.doc, newState.doc);
            } else if (tr.docChanged) {
              carryRevisionFreeListThroughPlainText(oldState.doc, newState.doc, tr.steps, tr.docs);
            }
            return value;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setSuggesting:
        (on: boolean) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (!on && trackingIsLocked(state)) return false;
          if (dispatch) {
            tr.setMeta(SET_SUGGESTING_META, Boolean(on));
            tr.setMeta("addToHistory", false);
            dispatch(tr);
          }
          return true;
        },
      toggleSuggesting:
        () =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (trackingIsLocked(state)) return false;
          return writeTrackChangesMode(
            state,
            tr,
            readSuggesting(state) ? "off" : "everyone",
            dispatch,
          );
        },
      setTrackChangesMode:
        (mode: TrackChangesMode) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const requested = normalizeTrackChangesMode(mode);
          if (requested === null) return false;
          return writeTrackChangesMode(state, tr, requested, dispatch);
        },
      toggleTrackingLock:
        () =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const current = normalizeDocumentProtection(
            state.doc.attrs.documentProtection,
          );
          const next = toggleDocumentTrackingLock(current);
          if (next === current || next?.mode === current?.mode) return false;
          tr.setDocAttribute("documentProtection", next);
          if (next?.mode === "trackedChanges") {
            // Word writes <w:trackRevisions/> with the lock, and tracking stays
            // on For Everyone after the document is unlocked.
            if (!tracksForEveryone(state)) {
              tr.setDocAttribute(TRACK_REVISIONS_ATTR, true);
            }
            tr.setMeta(SET_SUGGESTING_META, false);
          }
          if (dispatch) dispatch(closeHistory(tr));
          return true;
        },
      acceptChange:
        () =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable || resolutionIsLocked(tr)) return false;
          const did = resolveSelectedChanges(tr, acceptChangeAt, false, readMarkupFilter(editor.state));
          if (did && dispatch) dispatch(closeHistory(tr));
          return did;
        },
      rejectChange:
        () =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable || resolutionIsLocked(tr)) return false;
          const did = resolveSelectedChanges(tr, rejectChangeAt, false, readMarkupFilter(editor.state));
          if (did && dispatch) dispatch(closeHistory(tr));
          return did;
        },
      acceptChangeAndMoveNext:
        () =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable || resolutionIsLocked(tr)) return false;
          const did = resolveSelectedChanges(tr, acceptChangeAt, true, readMarkupFilter(editor.state));
          if (did && dispatch) dispatch(closeHistory(tr));
          return did;
        },
      rejectChangeAndMoveNext:
        () =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable || resolutionIsLocked(tr)) return false;
          const did = resolveSelectedChanges(tr, rejectChangeAt, true, readMarkupFilter(editor.state));
          if (did && dispatch) dispatch(closeHistory(tr));
          return did;
        },
      acceptChangeAtPos:
        (pos: number) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable || resolutionIsLocked(tr)) return false;
          tr.setMeta(TRACK_CHANGES_SKIP_META, true);
          // acceptChangeAt re-resolves `pos` against tr.doc (the LIVE doc), so a
          // position captured when the panel rendered is validated here — a since-
          // shifted or since-removed change is a safe no-op (returns false).
          const did = acceptChangeAt(tr, pos);
          if (did && dispatch) dispatch(tr);
          return did;
        },
      rejectChangeAtPos:
        (pos: number) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable || resolutionIsLocked(tr)) return false;
          tr.setMeta(TRACK_CHANGES_SKIP_META, true);
          const did = rejectChangeAt(tr, pos);
          if (did && dispatch) dispatch(tr);
          return did;
        },
      acceptAllChanges:
        () =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable || resolutionIsLocked(tr)) return false;
          tr.setMeta(TRACK_CHANGES_SKIP_META, true);
          // Word's command settles the headers and footers with the body.
          const bands = sectionBandsWithRevisionsSettled(tr.doc.attrs, "accept");
          const did = acceptAllChanges(tr) || bands !== null;
          if (bands) {
            tr.setDocAttribute("sectionStoryGraph", bands.sectionStoryGraph);
            tr.setDocAttribute("sectionBands", bands.sectionBands);
          }
          if (did && dispatch) dispatch(tr);
          return did;
        },
      rejectAllChanges:
        () =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable || resolutionIsLocked(tr)) return false;
          tr.setMeta(TRACK_CHANGES_SKIP_META, true);
          // Word's command settles the headers and footers with the body.
          const bands = sectionBandsWithRevisionsSettled(tr.doc.attrs, "reject");
          const did = rejectAllChanges(tr) || bands !== null;
          if (bands) {
            tr.setDocAttribute("sectionStoryGraph", bands.sectionStoryGraph);
            tr.setDocAttribute("sectionBands", bands.sectionBands);
          }
          if (did && dispatch) dispatch(tr);
          return did;
        },
      acceptAllShownChanges:
        () =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable || resolutionIsLocked(tr)) return false;
          const filter = readMarkupFilter(state);
          if (filter === "all" || filter === "simple" || filter === "none") {
            return false;
          }
          tr.setMeta(TRACK_CHANGES_SKIP_META, true);
          const changes = listTrackedChanges(tr.doc)
            .filter((change) => trackedChangeIsShown(change, filter))
            .sort((a, b) => b.from - a.from || b.to - a.to);
          let did = false;
          for (const change of changes) {
            did = acceptChangeAt(tr, change.from) || did;
          }
          if (did && dispatch) dispatch(closeHistory(tr));
          return did;
        },
      rejectAllShownChanges:
        () =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable || resolutionIsLocked(tr)) return false;
          const filter = readMarkupFilter(state);
          if (filter === "all" || filter === "simple" || filter === "none") {
            return false;
          }
          tr.setMeta(TRACK_CHANGES_SKIP_META, true);
          const changes = listTrackedChanges(tr.doc)
            .filter((change) => trackedChangeIsShown(change, filter))
            .sort((a, b) => b.from - a.from || b.to - a.to);
          let did = false;
          for (const change of changes) {
            did = rejectChangeAt(tr, change.from) || did;
          }
          if (did && dispatch) dispatch(closeHistory(tr));
          return did;
        },
      acceptAllChangesAndStopTracking:
        () =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable || resolutionIsLocked(tr)) return false;
          tr.setMeta(TRACK_CHANGES_SKIP_META, true);
          const did = acceptAllChanges(tr);
          if (!did) return false;
          stopTracking(tr);
          if (dispatch) dispatch(closeHistory(tr));
          return true;
        },
      rejectAllChangesAndStopTracking:
        () =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable || resolutionIsLocked(tr)) return false;
          tr.setMeta(TRACK_CHANGES_SKIP_META, true);
          const did = rejectAllChanges(tr);
          if (!did) return false;
          stopTracking(tr);
          if (dispatch) dispatch(closeHistory(tr));
          return true;
        },
      setTrackedChangeMarkupFilter:
        (filter: TrackedChangeMarkupFilter) =>
        ({ tr, dispatch }) => {
          const next = normalizeTrackedChangeMarkupFilter(filter);
          if (dispatch) {
            tr.setMeta(SET_MARKUP_FILTER_META, next);
            tr.setMeta("addToHistory", false);
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

/**
 * Read whether suggesting mode is currently ON for an editor state. Exposed so
 * the toolbar can reflect the toggle's active state.
 */
export function isSuggestingActive(state: EditorState): boolean {
  return readSuggesting(state);
}

/**
 * The Track Changes mode in effect for this author (Word's menu state): the
 * document's For Everyone setting (or a tracking lock) shows For Everyone;
 * otherwise this session's Just Mine, else off.
 */
export function getTrackChangesMode(state: EditorState): TrackChangesMode {
  return readTrackChangesMode(state);
}

/** Session-only markup presentation; never serialized into the document. */
export function getTrackedChangeMarkupFilter(
  state: EditorState,
): TrackedChangeMarkupFilter {
  return readMarkupFilter(state);
}

/** Whether the doc currently holds any tracked change (gates Accept/Reject UI). */
export function hasTrackedChanges(state: EditorState): boolean {
  return documentHasTrackedChanges(state.doc);
}

/**
 * Every tracked change in the live document, in document order, for the review
 * panel. Re-derive from the CURRENT state on each editor update — the returned
 * positions are only valid against `state.doc` at call time. Re-exported entry
 * type lets the panel import both from one module.
 */
export function getTrackedChanges(state: EditorState): TrackedChangeEntry[] {
  return listTrackedChanges(state.doc);
}

/** Changes visibly included by the current session-only Show Markup filter. */
export function getShownTrackedChanges(
  state: EditorState,
): TrackedChangeEntry[] {
  const filter = readMarkupFilter(state);
  return listTrackedChanges(state.doc).filter((change) =>
    trackedChangeIsShown(change, filter),
  );
}

/** Whether Accept/Reject All Shown has a real live target. */
export function hasShownTrackedChanges(state: EditorState): boolean {
  return getShownTrackedChanges(state).length > 0;
}

export type { TrackedChangeEntry };

export default TrackChanges;
