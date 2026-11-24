"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SheetFact } from "../../../../lib/editor/sheet-facts";
import { subscribeEditorSurfaceEditable } from "../useEditorSurfaceEditable";
import { Extension, Node, mergeAttributes, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { floatSelectionInsertionPos } from "./floatInsertionPoint";
import { Mapping } from "@tiptap/pm/transform";
import type { NodeView } from "@tiptap/pm/view";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { reactNodeViewWithLivePosition } from "../extensions/reactNodeViewPosition";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  ReactNode,
} from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslations } from "../../../../../host/next-intl";
import {
  PAGED_EDIT_GUTTER_PX,
  cancelNoteCaret,
  nearestNoteElement,
  noteIslandCaretOffset,
  noteKeyAcrossCut,
  pagedEditingPluginKey,
  requestNoteCaret,
  settleNoteIslandCaret,
  takeNoteCaret,
  type PagedEditingGeometry,
} from "./paged/pagedEditingExtension";
import {
  NOTE_SLICE_END_ATTR,
  NOTE_SLICE_END_OFFSET_ATTR,
  NOTE_SLICE_START_ATTR,
  NOTE_SLICE_START_OFFSET_ATTR,
} from "./paged/blockSplitting";
import {
  noteBodyRenderKey,
  noteTextNodes,
  renderNoteBodyInto,
  applyNoteParagraphLines,
  noteParagraphIndexAt,
  noteParagraphLineStyle,
  serializeNoteBodyDom,
} from "./noteRichText";
import {
  applyNoteRowTypography,
  applyNoteZoneTypography,
  applyNoteSeparatorTypography,
  endnoteTextStyleFromDocAttrs,
  ENDNOTE_TEXT_STYLE_ATTR,
  FOOTNOTE_TEXT_STYLE_ATTR,
  type NoteTextStyle,
} from "./noteTextStyle";
import {
  FOOTNOTE_MARK_NAME,
  addFootnoteEntry,
  footnoteIdFor,
  noteMarkerLabels,
  noteNumberingFromDocAttrs,
  normalizeFootnotes,
  noteStreamOf,
  numberNoteStreams,
  removeFootnoteEntry,
  resolveFootnoteMode,
  sanitizeCustomMark,
  sanitizeFootnoteId,
  sanitizeNoteNumFmt,
  sanitizeNoteNumStart,
  sanitizeNotePosition,
  sanitizeNoteRestart,
  sanitizeNoteMathRun,
  setFootnoteBody as setBodyInStore,
  sliceFootnoteRichBody,
  spliceFootnoteRichBody,
  type FootnoteEntry,
  type FootnoteMode,
  type NoteNumFmt,
  type NotePosition,
  type NoteRestart,
  type NoteStream,
  type NoteStreamsNumbering,
  type NoteStreamsSettings,
  type NumberedStreamNote,
  type OrderedNoteRef,
  type FootnoteRichBody,
  type FootnoteParagraphLine,
} from "./footnotes";
import { imeReplayingAppendTransaction } from "./imeCompositionGuard";
import { documentNoteSettings } from "./noteSectionSettings";
import {
  noteListMembers,
  sectionEndnotePlan,
  storedNoteListIndex,
} from "./paged/noteSliceIntegrity";
import { trustReadOnlyDocumentMutation } from "./readOnlyTransactionAuthority";

/**
 * Document FOOTNOTES / ENDNOTES (Word/WPS parity) — TipTap wiring.
 *
 * ADDITIVE: registering this extension adds:
 *   - ONE inline ATOM node ("footnoteRef") — a zero-width superscript marker
 *     dropped at the caret, carrying a sanitized `noteId`. It renders its live
 *     auto-number (derived from document order), NOT a stored number.
 *   - ONE block node ("footnoteList") — an atom whose NodeView renders the
 *     auto-numbered note bodies (editable), like the TableOfContents node renders
 *     a heading-derived list. A document carries at most one.
 *   - ONE optional top-level doc attribute ("footnotes") holding the note-body
 *     store, plus ("footnoteMode") = "footnote" | "endnote".
 *
 * The node + attribute round-trip through the document schema's open
 * `content`/`attrs` passthrough (see lib/native-page-schemas → documentNodeSchema
 * accepts any node type; documentDocAttrsSchema bounds the optional store), so
 * EXISTING documents — which carry none of these — still validate and load
 * unchanged. There is no flag: the feature is purely opt-in per user action
 * (Insert footnote); a document with no footnotes behaves exactly as before.
 *
 * SECURITY: the ref node renders ONLY a sanitized `data-note-id` attribute + a
 * fixed class (no user text in the DOM attribute surface). The body store is held
 * on the doc attribute and is always rendered as TEXT by the list NodeView, never
 * as HTML. All values pass through the sanitizers in ./footnotes on every edge.
 */

/**
 * A formula written into a new note's text ($...$ or \\(...\\)) is an equation, as
 * in the body: a footnote asked for with an editable formula kept the LaTeX as
 * words, while the reply said it was a formula (AI70H H181 B02). "$5 and $10" stays
 * text, by the same rule as the body: no space inside the dollars' edges.
 */
export function noteFormulasOf(body: string | undefined): FootnoteRichBody | undefined {
  if (!body) return undefined;
  const formula = /\\\((.+?)\\\)|\$(?!\s)([^$\n]*?[^\s$\\])\$(?!\d)/g;
  let found = false;
  const rich: FootnoteRichBody = body.split("\n").map((line) => {
    const runs: FootnoteRichBody[number] = [];
    let at = 0;
    for (const match of line.matchAll(formula)) {
      const run = sanitizeNoteMathRun({ math: match[1] ?? match[2] });
      if (!run) continue;
      if (match.index > at) runs.push({ text: line.slice(at, match.index) });
      runs.push(run);
      at = match.index + match[0].length;
      found = true;
    }
    if (at < line.length) runs.push({ text: line.slice(at) });
    return runs;
  });
  return found ? rich : undefined;
}

function withNoteFormulas(notes: FootnoteEntry[], id: string, body: string | undefined): FootnoteEntry[] {
  const rich = noteFormulasOf(body);
  return rich ? setBodyInStore(notes, id, body ?? "", rich) : notes;
}

/** The block node name for the rendered note list. */
export const FOOTNOTE_LIST_NODE_NAME = "footnoteList";
/** The doc-level attribute key holding the note-body store. */
export const FOOTNOTES_ATTR = "footnotes";
/** The doc-level attribute key holding the placement mode. */
export const FOOTNOTE_MODE_ATTR = "footnoteMode";
/**
 * The doc-level note-setting attribute keys (Word w:footnotePr / w:endnotePr —
 * pos + numFmt + numStart + numRestart per stream). Defaults are all null =
 * native Word defaults. Key strings must match the readers in footnotes.ts
 * (footnotes.ts) and the hydration list in DocumentPageSetup.ts
 * (normalizeHydratedDocumentPageAttrs) — the restore path that re-attaches
 * them after a runtime setContent so an autosave cannot launder them back to
 * the defaults (the docGridLinePitch laundering lesson).
 */
export const FOOTNOTE_NUM_FMT_ATTR = "footnoteNumFmt";
export const ENDNOTE_NUM_FMT_ATTR = "endnoteNumFmt";
export const FOOTNOTE_NUM_START_ATTR = "footnoteNumStart";
export const ENDNOTE_NUM_START_ATTR = "endnoteNumStart";
export const FOOTNOTE_POSITION_ATTR = "footnotePosition";
export const ENDNOTE_POSITION_ATTR = "endnotePosition";
export const FOOTNOTE_NUM_RESTART_ATTR = "footnoteNumRestart";
export const ENDNOTE_NUM_RESTART_ATTR = "endnoteNumRestart";

/**
 * Window CustomEvent the toolbar's Insert-footnote button dispatches. NoteEditor
 * listens for it to run `addFootnote` (decoupling the thin toolbar trigger from
 * the command). Mirrors ADD_COMMENT_EVENT.
 */
export const INSERT_FOOTNOTE_EVENT = "mrnote:insert-footnote";

/**
 * Insert an ENDNOTE (Word 引用 ribbon parity: 插入脚注 / 插入尾注 side by
 * side). The document model keeps ONE note stream with a doc-level placement
 * mode, so inserting an endnote switches the mode to "endnote" (relabelling
 * the document-end list 尾注 — Word's convert-all behaviour) and drops a
 * marker at the caret like any other note.
 */
export const INSERT_ENDNOTE_EVENT = "mrnote:insert-endnote";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentFootnotes: {
      /**
       * Insert a footnote at the current caret: drop a footnoteRef atom node
       * (auto-numbered by position) and add an (initially empty) note record to
       * the store. Ensures a single footnoteList node exists at the document end.
       * Optionally seeds the note body.
       */
      addFootnote: (body?: string) => ReturnType;
      /**
       * Insert an ENDNOTE at the caret (Word 引用 parity): mints an "en-"
       * prefixed id so the note lives in the ENDNOTE stream (document-end
       * 尾注 section, own numbering) while footnotes keep theirs.
       */
      addEndnote: (body?: string) => ReturnType;
      /** Set/replace the body of the note with the given id. `rich` carries
       * whitelisted inline formatting (paragraphs of runs); plain `body` is
       * the derived text and stays authoritative for legacy consumers. */
      setFootnoteBody: (
        noteId: string,
        body: string,
        rich?: FootnoteRichBody,
      ) => ReturnType;
      /**
       * Delete a note AND strip its footnoteRef node(s) from the document, so the
       * in-text marker disappears with the note. Remaining notes renumber.
       */
      removeFootnote: (noteId: string) => ReturnType;
      /** Switch placement mode (footnote vs endnote) — affects only labelling. */
      setFootnoteMode: (mode: FootnoteMode) => ReturnType;
      /** Persist native Word/WPS numbering format + start for one note stream. */
      setNoteNumbering: (
        stream: NoteStream,
        numFmt: NoteNumFmt,
        start: number,
        position?: NotePosition,
        restart?: NoteRestart,
      ) => ReturnType;
      /** Scroll/select the in-text ref anchoring a given note id. */
      scrollToFootnoteRef: (noteId: string) => ReturnType;
      /**
       * Re-apply the note store + mode onto the top-level doc attrs from a value
       * read out of persisted content. setContent restores only the doc's CHILDREN
       * (incl. the footnoteRef nodes + the footnoteList node) and DISCARDS the doc
       * node's own attrs, so the store must be re-attached on load. Mirrors
       * restoreCommentThreads. Always returns true.
       */
      restoreFootnotes: (footnotes: unknown, mode?: unknown) => ReturnType;
    };
  }
}

/** Read + normalize the note store off a doc node's attrs. Never throws. */
export function readFootnotes(doc: ProseMirrorNode): FootnoteEntry[] {
  const attrs = (doc.attrs ?? {}) as Record<string, unknown>;
  return normalizeFootnotes(attrs[FOOTNOTES_ATTR]);
}

/** Convenience reader off an EditorState. */
export function getFootnotes(state: EditorState): FootnoteEntry[] {
  return readFootnotes(state.doc);
}

/** The resolved placement mode for a doc (default "footnote"). */
export function getFootnoteMode(state: EditorState): FootnoteMode {
  const attrs = (state.doc.attrs ?? {}) as Record<string, unknown>;
  return resolveFootnoteMode(attrs[FOOTNOTE_MODE_ATTR]);
}

/**
 * The sanitized per-stream numbering settings (numFmt + start) off a doc
 * node's attrs. Null fields = the decimal-from-1 default. Never throws.
 */
export function readNoteNumbering(doc: ProseMirrorNode): NoteStreamsNumbering {
  return noteNumberingFromDocAttrs(
    (doc.attrs ?? {}) as Record<string, unknown>,
  );
}

/** Convenience reader off an EditorState. */
export function getNoteNumbering(state: EditorState): NoteStreamsNumbering {
  return readNoteNumbering(state.doc);
}

/** Full native location + numbering settings for both note streams. */
export function readNoteSettings(doc: ProseMirrorNode): NoteStreamsSettings {
  // The document values plus each section's own (Word's per-section
  // w:footnotePr / w:endnotePr): what every number in the editor reads.
  return documentNoteSettings((doc.attrs ?? {}) as Record<string, unknown>);
}

export function getNoteSettings(state: EditorState): NoteStreamsSettings {
  return readNoteSettings(state.doc);
}

/**
 * Collect the note ids of every footnoteRef node in the order they FIRST appear
 * in the document body. This is the source of truth for auto-numbering: the list
 * + the in-text markers both derive their numbers from this order. Duplicate ids
 * (a note referenced twice) keep their first position.
 */
export function collectFootnoteRefOrder(
  doc: ProseMirrorNode,
): OrderedNoteRef[] {
  // A paged document: each page's references and section breaks kept by the
  // page's node. A keystroke makes a new document, and the walk of every node
  // of it, text included, was 8 ms a key on a 124-page report.
  let paged = doc.childCount > 0;
  doc.forEach((child) => { if (child.type.name !== "pageBlock") paged = false; });
  if (paged) {
    const refs: OrderedNoteRef[] = [];
    const seen = new Set<string>();
    let sectionIndex = 0;
    let pageIndex = 0;
    doc.forEach((page) => {
      const scan = footnotePageScan(page);
      for (const ref of scan.refs) {
        if (seen.has(ref.id)) continue;
        seen.add(ref.id);
        refs.push({ id: ref.id, customMark: ref.customMark, sectionIndex: sectionIndex + ref.sectionsBefore, pageIndex });
      }
      sectionIndex += scan.sections;
      pageIndex += 1;
    });
    return refs;
  }
  const refs: OrderedNoteRef[] = [];
  const seen = new Set<string>();
  let hasPageBlocks = false;
  doc.descendants((node) => {
    if (node.type.name === "pageBlock") hasPageBlocks = true;
    return !hasPageBlocks;
  });
  let sectionIndex = 0;
  let pageIndex = hasPageBlocks ? -1 : 0;
  doc.descendants((node) => {
    if (node.type.name === "pageBlock") pageIndex += 1;
    if (!hasPageBlocks && node.type.name === "pageBreak") pageIndex += 1;
    if (node.type.name === "sectionBreak") sectionIndex += 1;
    if (node.type.name === FOOTNOTE_MARK_NAME) {
      const id = sanitizeFootnoteId(node.attrs?.noteId);
      if (id && !seen.has(id)) {
        seen.add(id);
        refs.push({
          id,
          customMark: sanitizeCustomMark(node.attrs?.customMark),
          sectionIndex,
          pageIndex: Math.max(0, pageIndex),
        });
      }
    }
    return true;
  });
  return refs;
}

const footnotePageScans = new WeakMap<ProseMirrorNode, { refs: Array<{ id: string; customMark: string | null; sectionsBefore: number }>; sections: number }>();

/** A page's footnote references in order, each with the section breaks before
 * it on the page, and the page's section breaks. */
function footnotePageScan(page: ProseMirrorNode): { refs: Array<{ id: string; customMark: string | null; sectionsBefore: number }>; sections: number } {
  const kept = footnotePageScans.get(page);
  if (kept) return kept;
  const refs: Array<{ id: string; customMark: string | null; sectionsBefore: number }> = [];
  let sections = 0;
  page.descendants((node) => {
    if (node.type.name === "sectionBreak") sections += 1;
    if (node.type.name === FOOTNOTE_MARK_NAME) {
      const id = sanitizeFootnoteId(node.attrs?.noteId);
      if (id) refs.push({ id, customMark: sanitizeCustomMark(node.attrs?.customMark), sectionsBefore: sections });
    }
    return true;
  });
  const scan = { refs, sections };
  footnotePageScans.set(page, scan);
  return scan;
}

/** Does the doc carry any footnote? (gates the list / sidebar affordances.) */
export function hasFootnotes(state: EditorState): boolean {
  return (
    readFootnotes(state.doc).length > 0 ||
    collectFootnoteRefOrder(state.doc).length > 0
  );
}

/** Find the position of the first footnoteRef node anchoring a note id, or null. */
export function findFootnoteRefPos(
  doc: ProseMirrorNode,
  noteId: unknown,
): number | null {
  const id = sanitizeFootnoteId(noteId);
  if (!id) return null;
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (
      node.type.name === FOOTNOTE_MARK_NAME &&
      sanitizeFootnoteId(node.attrs?.noteId) === id
    ) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

export type NoteNavigationDirection = -1 | 1;

/** One authenticated, positioned note reference for ribbon navigation. */
export interface NoteNavigationTarget {
  id: string;
  pos: number;
  stream: NoteStream;
}

function exactCanonicalFootnoteId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const sanitized = sanitizeFootnoteId(value);
  return sanitized === value ? value : null;
}

/**
 * The note store is the authority for whether an in-body reference is live.
 * Reject noncanonical ids rather than laundering them through the sanitizer:
 * a forged `fn!a` must never gain authority over a real `fna` note.
 */
function canonicalStoredNoteIds(doc: ProseMirrorNode): Set<string> {
  const raw = (doc.attrs ?? {})[FOOTNOTES_ATTR];
  if (!Array.isArray(raw)) return new Set();
  const ids = new Set<string>();
  const ambiguous = new Set<string>();
  for (const candidate of raw) {
    const rawId =
      candidate && typeof candidate === "object"
        ? (candidate as { id?: unknown }).id
        : null;
    const id = exactCanonicalFootnoteId(rawId);
    if (!id) continue;
    if (ids.has(id)) ambiguous.add(id);
    ids.add(id);
  }
  for (const id of ambiguous) ids.delete(id);
  return ids;
}

/**
 * Canonical note references in exact PM document order. Orphan refs, duplicate
 * anchors, missing store records and sanitizer lookalikes are not navigation
 * targets. This is deliberately stricter than the rendering projection.
 */
export function orderedNoteNavigationTargets(
  doc: ProseMirrorNode,
  stream?: NoteStream,
): NoteNavigationTarget[] {
  const storedIds = canonicalStoredNoteIds(doc);
  if (storedIds.size === 0) return [];
  const referenceCounts = new Map<string, number>();
  doc.descendants((node) => {
    if (node.type.name !== FOOTNOTE_MARK_NAME) return true;
    const id = exactCanonicalFootnoteId(node.attrs?.noteId);
    if (id) referenceCounts.set(id, (referenceCounts.get(id) ?? 0) + 1);
    return false;
  });
  const mode = resolveFootnoteMode((doc.attrs ?? {})[FOOTNOTE_MODE_ATTR]);
  const targets: NoteNavigationTarget[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== FOOTNOTE_MARK_NAME) return true;
    const id = exactCanonicalFootnoteId(node.attrs?.noteId);
    if (!id || referenceCounts.get(id) !== 1 || !storedIds.has(id)) {
      return false;
    }
    const targetStream = noteStreamOf(id, mode);
    if (stream === undefined || stream === targetStream) {
      targets.push({ id, pos, stream: targetStream });
    }
    return false;
  });
  return targets;
}

export function hasNoteNavigationTarget(
  doc: ProseMirrorNode,
  stream?: NoteStream,
): boolean {
  return orderedNoteNavigationTargets(doc, stream).length > 0;
}

function targetTouchesSelection(
  target: NoteNavigationTarget,
  from: number,
  to: number,
): boolean {
  if (from === to) return from === target.pos || from === target.pos + 1;
  return from <= target.pos && to >= target.pos + 1;
}

export function adjacentNoteNavigationTarget(
  doc: ProseMirrorNode,
  stream: NoteStream,
  direction: NoteNavigationDirection,
  from: number,
  to: number,
): NoteNavigationTarget | null {
  const targets = orderedNoteNavigationTargets(doc, stream);
  if (targets.length === 0) return null;
  const currentIndex = targets.findIndex((target) =>
    targetTouchesSelection(target, from, to),
  );
  // Word stops at the last (first) note: Next past it does nothing, it does
  // not start over from the other end of the document.
  if (currentIndex >= 0) return targets[currentIndex + direction] ?? null;
  if (direction === 1) {
    return targets.find((target) => target.pos >= to) ?? null;
  }
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const target = targets[index];
    if (target && target.pos < from) return target;
  }
  return null;
}

/**
 * Move to one note reference without changing document content or history.
 * All authority is resolved from the event-time editor state before focus or
 * dispatch; a concurrent doc replacement fails closed.
 */
export function navigateNoteReference(
  editor: Editor,
  stream: NoteStream,
  direction: NoteNavigationDirection,
): boolean {
  const state = editor.state;
  const doc = state.doc;
  const target = adjacentNoteNavigationTarget(
    doc,
    stream,
    direction,
    state.selection.from,
    state.selection.to,
  );
  if (!target || editor.state.doc !== doc) return false;
  const selection = TextSelection.create(doc, target.pos, target.pos + 1);
  if (editor.state.doc !== doc) return false;
  // Into view, as Word brings the reference it goes to: a reference on
  // another page was selected off screen and the window stayed where it was
  // (WUA 051).
  editor.view.dispatch(
    state.tr
      .setSelection(selection)
      .setMeta("addToHistory", false)
      .scrollIntoView(),
  );
  editor.view.focus();
  return true;
}

/**
 * Word's Show Notes asks "View footnote area / View endnote area" when the
 * document has both kinds and the selection is not on a note reference.
 */
export function showNotesNeedsAreaChoice(state: EditorState): boolean {
  const all = orderedNoteNavigationTargets(state.doc);
  if (
    all.some((target) =>
      targetTouchesSelection(target, state.selection.from, state.selection.to),
    )
  ) {
    return false;
  }
  return (
    all.some((target) => target.stream === "footnote") &&
    all.some((target) => target.stream === "endnote")
  );
}

function showNotesTarget(
  state: EditorState,
  stream?: NoteStream,
): NoteNavigationTarget | null {
  const all = orderedNoteNavigationTargets(state.doc);
  const selected = all.find((target) =>
    targetTouchesSelection(target, state.selection.from, state.selection.to),
  );
  if (selected) return selected;
  const activeStream =
    stream ??
    resolveFootnoteMode((state.doc.attrs ?? {})[FOOTNOTE_MODE_ATTR]);
  if (stream) {
    const inStream = all.filter((target) => target.stream === stream);
    return (
      inStream.find((target) => target.pos >= state.selection.to) ??
      inStream[inStream.length - 1] ??
      null
    );
  }
  return (
    adjacentNoteNavigationTarget(
      state.doc,
      activeStream,
      1,
      state.selection.from,
      state.selection.to,
    ) ??
    all.find((target) => target.pos >= state.selection.to) ??
    all[0] ??
    null
  );
}

/** Focus the existing live note-body island; never creates a second pane. */
export function showNotesForSelection(
  editor: Editor,
  stream?: NoteStream,
): boolean {
  const state = editor.state;
  const doc = state.doc;
  const target = showNotesTarget(state, stream);
  if (!target) return false;
  // The body lives in the view's own note list, or -- paginated -- in the
  // page's note area beside the view.
  const body = nearestNoteElement(
    editor.view.dom,
    `[data-footnote-body="${CSS.escape(target.id)}"]`,
  );
  if (!body?.isConnected || editor.state.doc !== doc) return false;
  body.scrollIntoView?.({ block: "center", behavior: "smooth" });
  body.focus();
  return true;
}








export function focusInsertedNoteBody(
  editor: Editor,
  noteId: string,
  onMissing?: () => void,
): () => void {
  let frames = 0;
  let handle = 0;
  const attempt = () => {
    if (editor.isDestroyed || !editor.isEditable) return;
    const body = nearestNoteElement(
      editor.view.dom,
      `[data-footnote-body="${CSS.escape(noteId)}"]`,
    );
    if (body?.isConnected && body.getAttribute("contenteditable") === "true") {
      body.scrollIntoView?.({ block: "nearest" });
      body.focus({ preventScroll: true });
      const selection = body.ownerDocument.defaultView?.getSelection();
      if (selection) {
        const range = body.ownerDocument.createRange();
        range.selectNodeContents(body);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return;
    }
    frames += 1;
    if (frames > 60) {
      onMissing?.();
      return;
    }
    handle = window.requestAnimationFrame(attempt);
  };
  handle = window.requestAnimationFrame(attempt);
  return () => window.cancelAnimationFrame(handle);
}

/** Whether the doc already contains a footnoteList node. */
function hasFootnoteListNode(doc: ProseMirrorNode): boolean {
  let present = false;
  doc.descendants((node) => {
    if (node.type.name === FOOTNOTE_LIST_NODE_NAME) {
      present = true;
      return false;
    }
    return true;
  });
  return present;
}

// ---------------------------------------------------------------------------
// Node views.
// ---------------------------------------------------------------------------

/**
 * The labels of a document's note markers, read once per document version
 * whatever the number of markers. Each marker used to walk the whole document on
 * every update for its own number: 518 endnotes (corpus R329-D02) were 518 walks
 * a keystroke and a React root each to mount at every page cut.
 */
const noteLabelsByDoc = new WeakMap<
  ProseMirrorNode,
  { signature: string; labelOf: (noteId: string) => string | null }
>();

function noteLabelsOf(state: EditorState): { signature: string; labelOf: (noteId: string) => string | null } {
  const known = noteLabelsByDoc.get(state.doc);
  if (known) return known;
  const order = collectFootnoteRefOrder(state.doc);
  const mode = getFootnoteMode(state);
  const settings = getNoteSettings(state);
  let labels: Map<string, string> | null = null;
  const made = {
    signature: JSON.stringify([order, mode, settings]),
    labelOf: (noteId: string) => {
      labels ??= noteMarkerLabels(order, mode, settings);
      return labels.get(noteId) ?? null;
    },
  };
  noteLabelsByDoc.set(state.doc, made);
  return made;
}

/** A document's markers renumber together, once an edit has paused (the number of
 * a marker changes only when a marker comes or goes, or its page or section does). */
const NOTE_MARKER_REFRESH_MS = 60;

const noteMarkerViews = new WeakMap<
  NodeViewProps["editor"],
  { views: Set<() => void>; stop: () => void }
>();

function watchNoteMarkers(editor: NodeViewProps["editor"], refresh: () => void): () => void {
  let watch = noteMarkerViews.get(editor);
  if (!watch) {
    const views = new Set<() => void>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let signature: string | null = null;
    const onUpdate = () => {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (editor.isDestroyed) return;
        const next = noteLabelsOf(editor.state).signature;
        if (next === signature) return;
        signature = next;
        for (const view of views) view();
      }, NOTE_MARKER_REFRESH_MS);
    };
    editor.on("update", onUpdate);
    watch = {
      views,
      stop: () => {
        editor.off("update", onUpdate);
        if (timer !== undefined) clearTimeout(timer);
        noteMarkerViews.delete(editor);
      },
    };
    noteMarkerViews.set(editor, watch);
  }
  const current = watch;
  current.views.add(refresh);
  return () => {
    current.views.delete(refresh);
    if (current.views.size === 0) current.stop();
  };
}

/** `window.__docsNoteRefTextOff = true` (A/B, read as a reference's view is
 * made): the number is drawn in a <button> again, the older view. */
function noteRefTextOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsNoteRefTextOff?: boolean }).__docsNoteRefTextOff === true;
}

/**
 * The in-text footnote marker. Paints the LIVE auto-number derived from this ref's
 * position among all footnoteRef nodes (so inserting/deleting earlier notes
 * renumbers automatically), and on click scrolls to the matching note body in the
 * list. The number is never stored — always recomputed from document order.
 *
 * The number is drawn as text of its line, as Word's reference mark is a run of
 * its paragraph: Windows Word keeps "word¹.", "word¹ and", "word.¹" and an
 * endnote's "wordⁱ." whole and takes them to the next line together, breaking
 * only at a space ("word ¹" breaks before the mark; docx-look/brk17/probes fn1,
 * 120 paragraphs at right indents 0-380 twips). Drawn in a <button> -- an
 * atomic inline, which the browser and the line engine reading it break before
 * and after -- a reference at a line's end went down alone, "production / ²³⁴ /
 * . Nevertheless" (corpus R460-D16), and the engine read no paragraph holding
 * one without its layout. It is still a button to the keyboard and to
 * assistive technology.
 */
function createFootnoteRefView({ editor, node: initial }: Pick<NodeViewProps, "editor" | "node">): NodeView {
  let node = initial;
  const dom = document.createElement("sup");
  dom.className = "mrnote-footnote-ref";
  dom.setAttribute("data-type", "footnote-ref");
  dom.setAttribute("data-testid", "footnote-ref");
  dom.style.whiteSpace = "normal";
  const asButton = noteRefTextOff();
  const marker = document.createElement(asButton ? "button" : "span");
  if (marker instanceof HTMLButtonElement) marker.type = "button";
  else {
    marker.setAttribute("role", "button");
    marker.tabIndex = 0;
  }
  marker.className = "mrnote-footnote-ref__marker";
  marker.contentEditable = "false";
  dom.append(marker);

  const noteId = () => sanitizeFootnoteId(node.attrs?.noteId);
  const paint = () => {
    const id = noteId();
    // Word 自定义标记: a custom-marked ref shows its glyph, no auto number.
    const label = !id ? null : sanitizeCustomMark(node.attrs?.customMark) || noteLabelsOf(editor.state).labelOf(id);
    const text = label ?? "?";
    if (marker.textContent !== text) marker.textContent = text;
    if (id) {
      dom.setAttribute("data-note-id", id);
      marker.setAttribute("data-footnote-ref-id", id);
    } else {
      dom.removeAttribute("data-note-id");
      marker.removeAttribute("data-footnote-ref-id");
    }
  };
  paint();
  const unwatch = watchNoteMarkers(editor, paint);

  const jump = () => {
    const id = noteId();
    if (!id) return;
    // Move focus to the note body in the list (scroll it into view).
    const target = nearestNoteElement(
      editor.view.dom,
      `[data-footnote-body="${CSS.escape(id)}"]`,
    );
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus?.();
    // The jump scrolls the page under the pointer, so the second press of a
    // double-click lands on whatever arrived there and would take the focus
    // out of the note again. That press belongs to this jump.
    const view = editor.view.dom.ownerDocument;
    const swallow = (event: MouseEvent) => {
      if (event.detail < 2) return;
      event.preventDefault();
      event.stopPropagation();
    };
    view.addEventListener("mousedown", swallow, true);
    window.setTimeout(() => view.removeEventListener("mousedown", swallow, true), 500);
  };
  marker.addEventListener("click", jump);
  // A button's own keys, for the marker drawn as text.
  if (!asButton) {
    marker.addEventListener("keydown", (event) => {
      const { key } = event as KeyboardEvent;
      if (key !== "Enter" && key !== " ") return;
      event.preventDefault();
      jump();
    });
  }

  return {
    dom,
    update(next) {
      if (next.type !== node.type) return false;
      node = next as typeof node;
      paint();
      return true;
    },
    // The marker is a button of its own; the editor keeps drags and drops.
    stopEvent: (event) => event.target === marker && event.type !== "dragstart" && event.type !== "drop",
    ignoreMutation: () => true,
    destroy: unwatch,
  };
}

/** Compact, order-sensitive signature for cheap list equality. */
function listSignature(
  mode: FootnoteMode,
  footnotes: NumberedStreamNote[],
  endnotes: NumberedStreamNote[],
): string {
  const part = (notes: NumberedStreamNote[]): string =>
    notes
      .map(
        (note) =>
          `${note.id}\u0001${note.label}\u0001${noteBodyRenderKey(note.body, note.rich)}`,
      )
      .join("\u0002");
  return `${mode}\u0003${part(footnotes)}\u0003${part(endnotes)}`;
}

/**
 * A press in the notes area outside a note's words: right of a short note,
 * the gap between notes, the separator. The words are inline islands no wider
 * than their text, so without this the press selects the whole notes area as
 * one object (no insertion point, and the next key replaces every note). Word
 * puts the insertion point in the nearest note, on that line at the pointer's x.
 */
function pressNoteList(event: ReactMouseEvent<HTMLElement>) {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("[data-footnote-body], button")) return;
  let body: HTMLElement | null = null;
  let nearest = Infinity;
  for (const candidate of event.currentTarget.querySelectorAll<HTMLElement>(
    '[data-footnote-body][contenteditable="true"]',
  )) {
    const rect = candidate.getBoundingClientRect();
    const away =
      event.clientY < rect.top
        ? rect.top - event.clientY
        : event.clientY > rect.bottom
          ? event.clientY - rect.bottom
          : 0;
    if (away < nearest) {
      nearest = away;
      body = candidate;
    }
  }
  if (!body) return;
  event.preventDefault();
  body.focus({ preventScroll: true });
  const doc = body.ownerDocument;
  const selection = doc.getSelection();
  if (!selection) return;
  const box = body.getBoundingClientRect();
  const x = Math.max(box.left + 1, Math.min(box.right - 1, event.clientX));
  const y = Math.max(box.top + 1, Math.min(box.bottom - 1, event.clientY));
  const range = doc.createRange();
  range.selectNodeContents(body);
  range.collapse(event.clientX <= box.left);
  if (event.clientX > box.left && event.clientX < box.right) {
    const at = doc.caretRangeFromPoint?.(x, y);
    if (at && body.contains(at.startContainer)) {
      range.setStart(at.startContainer, at.startOffset);
      range.collapse(true);
    }
  } else if (event.clientX >= box.right && event.clientY < box.bottom - 1) {
    // Right of a line that is not the last: the end of that line.
    const at = doc.caretRangeFromPoint?.(box.right - 1, y);
    if (at && body.contains(at.startContainer)) {
      range.setStart(at.startContainer, at.startOffset);
      range.collapse(true);
    }
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * One editable note body. Word edits notes IN PLACE (page bottom for
 * footnotes, document end for endnotes), so the body is a plain-text
 * editable island: uncontrolled while focused (typing/IME never fights
 * React), synced from the store otherwise, committed through
 * setFootnoteBody on blur. Rendered as wrapping inline flow — the full
 * text is always visible, nothing is ever clipped.
 */
function EditableNoteBody(props: {
  editor: NodeViewProps["editor"];
  noteId: string;
  body: string;
  rich?: FootnoteRichBody;
  /** Full semantic note body + the fragment range rendered by this page.
   * Runtime page fragments edit by splicing back into this source; storage
   * always keeps one Word-compatible note body. */
  sourceBody?: string;
  sourceRich?: FootnoteRichBody;
  sliceStart?: number;
  sliceEnd?: number;
  placeholder: string;
  focusedBodyIdRef: MutableRefObject<string | null>;
  onFocusChange?: (noteId: string | null) => void;
  /** The note holds a drawing kept only in the source file: shown, never
   * edited (its words are the source's, written back with the drawing). */
  readOnly?: boolean;
  /** Each paragraph's own Exactly / At least line (null: the note's line). */
  paragraphLines?: (FootnoteParagraphLine | null)[];
}) {
  const {
    editor,
    noteId,
    body,
    rich,
    sourceBody = body,
    sourceRich = rich,
    sliceStart = 0,
    sliceEnd = sourceBody.length,
    placeholder,
    focusedBodyIdRef,
    onFocusChange,
    readOnly = false,
    paragraphLines,
  } = props;
  const ref = useRef<HTMLSpanElement | null>(null);
  const editSessionRef = useRef<{
    host: HTMLSpanElement;
    dirty: boolean;
    sourceBody: string;
    sourceRich?: FootnoteRichBody;
    from: number;
    to: number;
  } | null>(null);
  const [editorEditable, setEditable] = useState(() => editor.isEditable);
  const editable = editorEditable && !readOnly;
  const canEdit = () => editor.isEditable && !readOnly;

  useEffect(() => {
    const refresh = () => setEditable(editor.isEditable);
    refresh();
    // The host turns editing on with setEditable(value, false), which emits
    // no update (WUA 063): watch the surface's authority as well.
    return subscribeEditorSurfaceEditable(editor, refresh);
  }, [editor]);

  const syncBodyFromStore = (el: HTMLSpanElement, force = false) => {
    // Only the actual focused island owns its draft. Other page projections
    // of the same note id must still initialize from the store; keying the
    // guard by noteId left a newly remounted slice empty while another slice
    // retained focus.
    if (!force && el.ownerDocument.activeElement === el) return;
    const key = `${noteBodyRenderKey(body, rich)}|${paragraphLines ? `${sliceStart}:${JSON.stringify(paragraphLines)}` : ""}`;
    if (!force && el.dataset.renderedKey === key) return;
    if (rich) renderNoteBodyInto(el, rich);
    else {
      el.textContent = "";
      el.appendChild(noteTextNodes(el.ownerDocument, body));
    }
    // Each paragraph on its own line, as Word sets it (R77-D14).
    applyNoteParagraphLines(el, paragraphLines, noteParagraphIndexAt(sourceBody, sliceStart));
    el.dataset.renderedKey = key;
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setAttribute("contenteditable", editable ? "true" : "false");
    el.setAttribute("aria-readonly", editable ? "false" : "true");
    if (!editable) {
      editSessionRef.current = null;
      focusedBodyIdRef.current = null;
      onFocusChange?.(null);
    }
    syncBodyFromStore(el, !editable);
    // An edit across a page cut asked for the caret at its place in the
    // whole note: the island that now shows that place takes it (WUA 044).
    if (editable) {
      const from = Math.max(0, Math.min(sliceStart, sourceBody.length));
      const to = Math.max(from, Math.min(sliceEnd, sourceBody.length));
      const caret = takeNoteCaret(noteId, from, to, to < sourceBody.length);
      if (caret !== null) settleNoteIslandCaret(el, caret);
    }
  });

  // The whole note with this island's edits in it, and where the island's
  // own words end in it (before the breaks the page cut left at its end).
  const editedNote = (
    host: HTMLSpanElement,
    session: { sourceBody: string; sourceRich?: FootnoteRichBody; from: number; to: number },
  ) => {
    const serialized = serializeNoteBodyDom(host);
    const wholeNote = session.from === 0 && session.to === session.sourceBody.length;
    // The island of a note fragment ends where the page cut it, often
    // right after a paragraph break. The DOM serializer drops trailing
    // empty paragraphs (a browser's placeholder <br>), which here is the
    // break between two note lines on either side of the cut: keep as
    
    const trailingBreaks = wholeNote
      ? ""
      : (/\n+$/.exec(session.sourceBody.slice(session.from, session.to))?.[0] ?? "");
    const richBody: FootnoteRichBody = trailingBreaks
      ? [...serialized, ...Array.from(trailingBreaks, () => [])]
      : serialized;
    const words = serialized.map((runs) => runs.map((run) => run.text).join("")).join("\n");
    const plain = richBody
      .map((runs) => runs.map((run) => run.text).join(""))
      .join("\n");
    return {
      body: wholeNote
        ? plain
        : `${session.sourceBody.slice(0, session.from)}${plain}${session.sourceBody.slice(session.to)}`,
      rich: wholeNote
        ? richBody
        : spliceFootnoteRichBody(
            session.sourceBody,
            session.sourceRich,
            session.from,
            session.to,
            plain,
            richBody,
          ),
      contentLength: words.length,
      contentEnd: session.from + words.length,
    };
  };

  return (
    <span
      ref={(el) => {
        ref.current = el;
        
        // whitelisted inline marks work via execCommand shortcuts. Paste is
        // forced to plain text below; serialization whitelists on commit.
        if (el) {
          el.setAttribute("contenteditable", editable ? "true" : "false");
          el.setAttribute("aria-readonly", editable ? "false" : "true");
        }
        if (el) syncBodyFromStore(el);
      }}
      className="mrnote-footnote-list__bodytext"
      data-footnote-body={noteId}
      data-testid="footnote-body"
      data-placeholder={placeholder}
      role="textbox"
      aria-multiline="true"
      aria-readonly={!editable}
      tabIndex={0}
      spellCheck={false}
      onFocus={(event) => {
        if (!canEdit()) {
          editSessionRef.current = null;
          return;
        }
        const from = Math.max(0, Math.min(sliceStart, sourceBody.length));
        const to = Math.max(from, Math.min(sliceEnd, sourceBody.length));
        editSessionRef.current = {
          host: event.currentTarget,
          dirty: false,
          sourceBody,
          sourceRich,
          from,
          to,
        };
        focusedBodyIdRef.current = noteId;
        onFocusChange?.(noteId);
      }}
      onInput={(event) => {
        if (!canEdit()) {
          syncBodyFromStore(event.currentTarget, true);
          return;
        }
        const session = editSessionRef.current;
        if (session?.host === event.currentTarget) session.dirty = true;
      }}
      onBlur={(event) => {
        const session = editSessionRef.current;
        editSessionRef.current = null;
        focusedBodyIdRef.current = null;
        onFocusChange?.(null);
        const host = event.currentTarget;
        // A pagination or foreign transaction can detach a slice NodeView
        // before the browser delivers blur. Never let that stale/empty island
        // overwrite the semantic note store. A connected dirty host may still
        // commit an intentionally empty body.
        if (
          !session ||
          session.host !== host ||
          !session.dirty ||
          !host.isConnected
        ) {
          if (!canEdit()) syncBodyFromStore(host, true);
          return;
        }
        if (!canEdit()) {
          delete host.dataset.renderedKey;
          return;
        }
        const edited = editedNote(host, session);
        delete host.dataset.renderedKey; // re-render from the store echo
        editor.commands.setFootnoteBody(noteId, edited.body, edited.rich);
      }}
      onPaste={(event) => {
        // Plain text only: free-form pasted HTML must never enter the island
        // (the whitelist walk would strip it on commit, but live foreign
        // markup pre-commit is still unwanted).
        event.preventDefault();
        if (!canEdit()) return;
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (text) document.execCommand("insertText", false, text);
      }}
      onBeforeInput={(event) => {
        if (canEdit()) return;
        event.preventDefault();
        syncBodyFromStore(event.currentTarget, true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.blur();
          return;
        }
        // Backspace at the start of a page's part of a note and Delete at
        // the end of its part before the cut reach the character across
        // the cut, as in one note (WUA 044).
        const session = editSessionRef.current;
        if (
          (event.key === "Backspace" || event.key === "Delete") &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.nativeEvent.isComposing &&
          session?.host === event.currentTarget &&
          !(session.from === 0 && session.to === session.sourceBody.length) &&
          canEdit()
        ) {
          const host = event.currentTarget;
          const edited = editedNote(host, session);
          const across = noteKeyAcrossCut(
            event.key,
            noteIslandCaretOffset(host),
            session.from,
            edited.contentLength,
            edited.contentEnd,
            edited.body.length,
          );
          if (across !== null) {
            event.preventDefault();
            event.stopPropagation();
            // This island's blur writes nothing after it (the note is
            // written whole here), and an island without the focus is
            // drawn again from the note.
            editSessionRef.current = null;
            delete host.dataset.renderedKey;
            host.blur();
            requestNoteCaret(noteId, across);
            const done = editor.commands.setFootnoteBody(
              noteId,
              `${edited.body.slice(0, across)}${edited.body.slice(across + 1)}`,
              spliceFootnoteRichBody(edited.body, edited.rich, across, across + 1, ""),
            );
            if (!done) {
              cancelNoteCaret(noteId);
              syncBodyFromStore(host, true);
            }
            return;
          }
        }
        if (!(event.metaKey || event.ctrlKey)) return;
        // Select All in a note selects the note (Word): an endnote's island
        // sits inside the document's editor, whose own Select All took the
        // key and moved the focus to the body, so the next typing replaced
        // body text (WUA 161).
        if (event.key.toLowerCase() === "a" && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          event.stopPropagation();
          const host = event.currentTarget;
          const selection = host.ownerDocument.getSelection();
          if (selection) {
            const range = host.ownerDocument.createRange();
            range.selectNodeContents(host);
            selection.removeAllRanges();
            selection.addRange(range);
          }
          return;
        }
        if (!canEdit()) {
          event.preventDefault();
          return;
        }
        const key = event.key.toLowerCase();
        // Word-parity inline formatting inside the note island.
        const command = event.shiftKey
          ? key === "x"
            ? "strikeThrough"
            : key === "="
              ? "superscript"
              : null
          : key === "b"
            ? "bold"
            : key === "i"
              ? "italic"
              : key === "u"
                ? "underline"
                : key === "="
                  ? "subscript"
                  : null;
        if (command) {
          event.preventDefault();
          event.stopPropagation();
          document.execCommand(command);
        }
      }}
    />
  );
}

type NoteFlowPlan = NonNullable<PagedEditingGeometry["noteFlow"]>;

interface PagedNoteState {
  active: boolean;
  /** The document is laid out on sheets (every document is). */
  sheeted: boolean;
  covered: Set<string>;
  noteFlow: NoteFlowPlan | null;
  marginTopPx: number;
  marginBottomPx: number;
}

const FOOTNOTE_IDS_BY_SHEET = new WeakMap<ProseMirrorNode, readonly string[]>();

/** The note ids a page's references name, once per page node. */
function footnoteIdsOfSheet(sheet: ProseMirrorNode): readonly string[] {
  let ids = FOOTNOTE_IDS_BY_SHEET.get(sheet);
  if (!ids) {
    const found: string[] = [];
    sheet.descendants((node) => {
      if (node.type.name === "footnoteRef") {
        const id = sanitizeFootnoteId(node.attrs?.noteId);
        if (id) found.push(id);
      }
      return true;
    });
    ids = found;
    FOOTNOTE_IDS_BY_SHEET.set(sheet, ids);
  }
  return ids;
}

/** Cheap equality for the paged note-area state. */
function pagedCoverageSignature(state: PagedNoteState): string {
  const coveredKey = [...state.covered].sort().join("\u0001");
  return [
    state.active ? "1" : "0",
    state.sheeted ? "1" : "0",
    coveredKey,
    JSON.stringify(state.noteFlow),
    String(state.marginTopPx),
    String(state.marginBottomPx),
  ].join("\u0003");
}

/** Tiny stable hash so the measured-flow clone re-syncs on body edits. */
function noteContentHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return String(hash >>> 0);
}

/**
 * The rendered note area at the document end. Word structure:
 *   - paged mode (print layout): footnote-stream notes render AND edit at
 *     the bottom of their page (seam zones) — here only the ENDNOTE area
 *     remains: Word's short separator rule + flowing full-width entries,
 *     no titles, no list chrome. Footnotes the zones could not place stay
 *     visible here as a safety net (a note body is never unreachable).
 *   - unpaged mode: both streams render here under small titles (there is
 *     no page bottom to host the footnote stream).
 * Entries derive from the note store + footnoteRef document order on every
 * edit; orphan notes (no anchoring ref) are dropped. Custom-marked notes
 * (Word customMarkFollows) show no extra mark — their body text already
 * leads with the literal glyph.
 */
function FootnoteListView(props: NodeViewProps) {
  const t = useTranslations("console-notebooks");
  const { editor } = props;

  const derive = useCallback((): {
    mode: FootnoteMode;
    footnotes: NumberedStreamNote[];
    endnotes: NumberedStreamNote[];
  } => {
    const refs = collectFootnoteRefOrder(editor.state.doc);
    const store = readFootnotes(editor.state.doc);
    const mode = getFootnoteMode(editor.state);
    return {
      mode,
      ...numberNoteStreams(store, refs, mode, getNoteSettings(editor.state)),
    };
  }, [editor]);

  const [state, setState] = useState(derive);
  const focusedBodyIdRef = useRef<string | null>(null);
  // Split-entry editing state (Word 尾注区跨页流): while a note body has
  // focus its slices render unsplit, so the state must trigger a re-render.
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);

  // Word print layout: with the paged chrome active the page-bottom zones
  // own the footnote stream (track which note ids they cover), and the
  // endnote area flows across pages per geometry.noteFlow.
  const derivePaged = useCallback((): PagedNoteState => {
    const pagedState = pagedEditingPluginKey.getState(editor.state);
    const seams = pagedState?.seams ?? [];
    const covered = new Set<string>();
    for (const seam of seams) {
      for (const note of seam.footnotes ?? []) covered.add(note.id);
    }
    let active = seams.length > 0;
    const doc = editor.state.doc;
    let sheeted = false;
    doc.forEach((child) => {
      if (child.type.name === "pageBlock") sheeted = true;
    });
    if (!active) {
      
      // footnote stream (no seams exist there), so the end list must show
      // ENDNOTES only — cover every footnote-stream marker id, mirroring
      // the painted coverage. The endnote area needs no flow geometry: the
      // footnoteList is a normal block inside the last sheet.
      if (sheeted) {
        const mode = resolveFootnoteMode(doc.attrs?.footnoteMode);
        doc.forEach((sheet) => {
          for (const id of footnoteIdsOfSheet(sheet)) {
            if (noteStreamOf(id, mode) === "footnote") covered.add(id);
          }
        });
        // The sheet is Word's print layout whether or not any footnote is
        // in it: an endnote-only document's area is set as the paged one
        // (separator rule, document ink, endnote text style), not as the
        // list chrome (WUA 140 follow-up).
        active = true;
      }
    }
    const geometry = pagedState?.geometry ?? null;
    return {
      active,
      sheeted,
      covered,
      noteFlow: geometry?.noteFlow ?? null,
      marginTopPx: geometry?.marginTopPx ?? 96,
      marginBottomPx: geometry?.marginBottomPx ?? 96,
    };
  }, [editor]);
  const [paged, setPaged] = useState(derivePaged);

  useEffect(() => {
    const refresh = () => {
      const next = derive();
      // The bodies are uncontrolled while focused (EditableNoteBody skips
      // syncing the focused island), so the store values can be applied
      // as-is here.
      setState((prev) =>
        listSignature(prev.mode, prev.footnotes, prev.endnotes) ===
        listSignature(next.mode, next.footnotes, next.endnotes)
          ? prev
          : next,
      );
    };
    refresh();
    editor.on("update", refresh);
    return () => {
      editor.off("update", refresh);
    };
  }, [editor, derive]);

  useEffect(() => {
    // Seam sets arrive via non-doc transactions — listen beyond "update".
    let seenDoc: unknown = null, seenPaged: unknown = null;
    const refresh = () => {
      // A transaction that changed neither has nothing new to say (the
      // walk below ran after every one, typing or not).
      const pagedNow = pagedEditingPluginKey.getState(editor.state);
      if (editor.state.doc === seenDoc && pagedNow === seenPaged) return;
      seenDoc = editor.state.doc;
      seenPaged = pagedNow;
      const next = derivePaged();
      setPaged((prev) =>
        pagedCoverageSignature(prev) === pagedCoverageSignature(next)
          ? prev
          : next,
      );
    };
    refresh();
    editor.on("transaction", refresh);
    return () => {
      editor.off("transaction", refresh);
    };
  }, [editor, derivePaged]);

  const handleJumpToRef = useCallback(
    (noteId: string) => {
      const pos = findFootnoteRefPos(editor.state.doc, noteId);
      if (pos === null) return;
      editor
        .chain()
        .focus()
        .setTextSelection({ from: pos, to: pos + 1 })
        .scrollIntoView()
        .run();
    },
    [editor],
  );

  interface RenderedNoteSpec {
    note: NumberedStreamNote;
    /** Original index in the ENDNOTE stream (for semantic page cuts). */
    index?: number;
    start?: number;
    end?: number;
    suppressMark?: boolean;
  }

  const renderEntries = (
    specs: RenderedNoteSpec[],
    kind: "footnote" | "endnote" = "endnote",
  ) =>
    specs.map((spec) => {
      const { note } = spec;
      const start = Math.max(0, Math.min(spec.start ?? 0, note.body.length));
      const end = Math.max(
        start,
        Math.min(spec.end ?? note.body.length, note.body.length),
      );
      const fragmentBody = note.body.slice(start, end);
      const fragmentRich = sliceFootnoteRichBody(
        note.body,
        note.rich,
        start,
        end,
      );
      return (
        <div
          key={`${note.id}:${start}:${end}`}
          className="mrnote-footnote-list__entry"
          data-note-id={note.id}
          data-note-index={spec.index}
          data-note-slice-start-offset={start}
          data-note-slice-end-offset={end}
        >
          {!note.customMark && !spec.suppressMark && (
            <button
              type="button"
              className="mrnote-footnote-list__mark"
              aria-label={t(kind === "endnote" ? "footnotes.goToEndnoteRef" : "footnotes.goToRef")}
              title={t(kind === "endnote" ? "footnotes.goToEndnoteRef" : "footnotes.goToRef")}
              onClick={() => handleJumpToRef(note.id)}
              contentEditable={false}
            >
              {note.label}
            </button>
          )}
          <EditableNoteBody
            editor={editor}
            noteId={note.id}
            body={fragmentBody}
            rich={fragmentRich}
            sourceBody={note.body}
            sourceRich={note.rich}
            sliceStart={start}
            sliceEnd={end}
            placeholder={t(
              note.readOnly
                ? "footnotes.mediaKeptPlaceholder"
                : kind === "endnote"
                  ? "footnotes.endnoteBodyPlaceholder"
                  : "footnotes.bodyPlaceholder",
            )}
            focusedBodyIdRef={focusedBodyIdRef}
            onFocusChange={setFocusedNoteId}
            readOnly={note.readOnly === true}
            paragraphLines={note.paragraphLines}
          />
        </div>
      );
    });

  // Paged mode: only footnotes the page-bottom zones did NOT absorb render
  // here (normally none).
  const footnotesShown = paged.active
    ? state.footnotes.filter((note) => !paged.covered.has(note.id))
    : state.footnotes;
  const empty = state.footnotes.length === 0 && state.endnotes.length === 0;
  // A document whose last note was deleted keeps its (empty) note list
  // node; on the sheet it is nothing at all, as Word shows no note area
  // without notes. The "No footnotes" title and rule sat on the paper, in
  // Reading View too (live Word audit WUA 041).
  const emptyOnSheet = empty && paged.sheeted;

  // V3.6 structural 尾注跨页: a sliced node renders only its entry range
  // (the rebalancer stamps the attrs; the store stays whole). A tail slice
  // additionally suppresses the footnote section — those render once, on
  // the FIRST slice.
  const rawSliceStart = props.node.attrs?.noteSliceStart;
  const rawSliceEnd = props.node.attrs?.noteSliceEnd;
  const rawSliceStartOffset = props.node.attrs?.noteSliceStartOffset;
  const rawSliceEndOffset = props.node.attrs?.noteSliceEndOffset;
  const sliceStart = Number.isInteger(rawSliceStart)
    ? (rawSliceStart as number)
    : null;
  const sliceEnd = Number.isInteger(rawSliceEnd)
    ? (rawSliceEnd as number)
    : null;
  const sliceStartOffset = Number.isInteger(rawSliceStartOffset)
    ? Math.max(0, rawSliceStartOffset as number)
    : 0;
  const sliceEndOffset = Number.isInteger(rawSliceEndOffset)
    ? Math.max(0, rawSliceEndOffset as number)
    : 0;
  const sliced =
    sliceStart !== null ||
    sliceEnd !== null ||
    sliceStartOffset > 0 ||
    sliceEndOffset > 0;
  const rangeStartEntry = sliceStart ?? 0;
  const endnoteSpecs: RenderedNoteSpec[] = [];
  state.endnotes.forEach((note, index) => {
    if (index < rangeStartEntry) return;
    if (sliceEnd !== null) {
      if (index > sliceEnd) return;
      if (index === sliceEnd && sliceEndOffset === 0) return;
    }
    const start = index === rangeStartEntry ? sliceStartOffset : 0;
    const end =
      sliceEnd !== null && index === sliceEnd
        ? Math.min(sliceEndOffset, note.body.length)
        : note.body.length;
    // A newly inserted endnote starts with an empty body. Keep that unsliced
    // entry mounted so Word's "insert, then type in the note area" workflow
    // has a real editable placeholder. Empty runtime slices remain suppressed:
    // they are pagination boundaries, not independent semantic notes.
    if (end <= start && (sliced || note.body.length > 0)) return;
    endnoteSpecs.push({
      note,
      index,
      start,
      end,
      suppressMark: start > 0,
    });
  });
  const isTailSlice = rangeStartEntry > 0 || sliceStartOffset > 0;
  // With endnotes at the end of each section, a section's area opens on an
  // entry after the first, under its own separator as in Word.
  const opensSectionArea =
    rangeStartEntry > 0 &&
    sliceStartOffset === 0 &&
    (() => {
      const plan = sectionEndnotePlan(editor.state.doc);
      return Boolean(
        plan &&
          (plan.lastStart === rangeStartEntry ||
            plan.areas.some((area) => area.start === rangeStartEntry)),
      );
    })();
  const footnotesRendered = isTailSlice ? [] : footnotesShown;

  // Word 尾注区跨页流: apply the engine's op plan only when it provably
  // covers EXACTLY the entries rendered here (a stale plan — e.g. one
  // generation behind an edit — falls back to the unsplit flow).
  const noteFlowGroups = (() => {
    if (
      sliced ||
      !paged.active ||
      !paged.noteFlow ||
      footnotesShown.length > 0 ||
      paged.noteFlow.groups.length < 2
    ) {
      return null;
    }
    const groups = paged.noteFlow.groups;
    const wholeSeen = new Set<number>();
    const firstSeen = new Set<number>();
    const touched = new Set<number>();
    for (const group of groups) {
      if (!Array.isArray(group.ops) || group.ops.length === 0) return null;
      for (const op of group.ops) {
        if (
          !Number.isInteger(op.entry) ||
          op.entry < 0 ||
          op.entry >= state.endnotes.length ||
          !(op.heightPx > 0)
        ) {
          return null;
        }
        touched.add(op.entry);
        if (op.whole) {
          if (wholeSeen.has(op.entry) || firstSeen.has(op.entry)) return null;
          wholeSeen.add(op.entry);
        } else if (op.first) {
          if (wholeSeen.has(op.entry) || firstSeen.has(op.entry)) return null;
          firstSeen.add(op.entry);
        } else if (!touched.has(op.entry)) {
          return null; // continuation before its first slice
        }
      }
    }
    return touched.size === state.endnotes.length ? groups : null;
  })();

  // A split entry temporarily renders UNSPLIT while its body is being
  // edited (mirrors hidden, clip released) — the plan recomputes on blur.
  // Matches the architecture-wide rule: layout is frozen during typing.
  const editingEntryIndex = focusedNoteId
    ? state.endnotes.findIndex((note) => note.id === focusedNoteId)
    : -1;

  const renderOp = (
    op: NonNullable<typeof noteFlowGroups>[number]["ops"][number],
    key: string,
  ): ReactNode => {
    const note = state.endnotes[op.entry];
    if (!note) return null;
    if (op.whole) return renderEntries([{ note, index: op.entry }]);
    const editing = editingEntryIndex === op.entry;
    if (op.first) {
      // The live island, clipped to its first slice (unclipped while
      // editing so the caret can travel the whole body).
      return (
        <div
          key={key}
          className="mrnote-footnote-list__entrywindow"
          data-note-window="true"
          style={
            editing
              ? undefined
              : { height: `${op.heightPx}px`, overflow: "hidden" }
          }
        >
          {renderEntries([{ note, index: op.entry }])}
        </div>
      );
    }
    if (editing) return null;
    // Continuation slice: a read-only mirror of the same entry, shifted so
    // this window shows [topPx, topPx+heightPx) — LibreOffice master/follow
    // in projection form. Clicking it focuses the live island.
    return (
      <div
        key={key}
        className="mrnote-footnote-list__entrywindow"
        data-note-window="true"
        style={{ height: `${op.heightPx}px`, overflow: "hidden" }}
      >
        <div
          className="mrnote-footnote-list__entry mrnote-footnote-list__entry--mirror"
          data-note-mirror="true"
          aria-hidden="true"
          style={{ marginTop: `${-op.topPx}px` }}
          onMouseDown={(event) => {
            event.preventDefault();
            const target = editor.view.dom.querySelector<HTMLElement>(
              `[data-footnote-body="${CSS.escape(note.id)}"]`,
            );
            target?.focus();
          }}
        >
          {!note.customMark && (
            <button
              type="button"
              className="mrnote-footnote-list__mark"
              tabIndex={-1}
              contentEditable={false}
            >
              {note.label}
            </button>
          )}
          <span className="mrnote-footnote-list__bodytext">
            {note.paragraphLines
              ? note.body.split("\n").map((part, index, parts) => (
                  <span
                    key={index}
                    data-note-paragraph-line={index}
                    style={noteParagraphLineStyle(note.paragraphLines?.[index])}
                  >
                    {index < parts.length - 1 ? `${part}\n` : part}
                  </span>
                ))
              : note.body}
          </span>
        </div>
      </div>
    );
  };

  const renderEndnoteFlow = (): ReactNode[] => {
    if (!noteFlowGroups) return renderEntries(endnoteSpecs);
    const out: ReactNode[] = [];
    noteFlowGroups.forEach((group, index) => {
      group.ops.forEach((op, opIndex) => {
        out.push(renderOp(op, `note-op-${index}-${opIndex}`));
      });
      if (group.fillPx === null) return;
      // Internal page transition — same visual contract as a widget seam
      // (fill + footer band + gutter + next sheet's top margin), rendered
      // inside the note area because an atom has no positions for widgets.
      out.push(
        <div
          key={`note-pagebreak-${index}`}
          className="paged-edit-seam paged-edit-seam--note-flow"
          data-note-pagebreak="true"
          aria-hidden="true"
          contentEditable={false}
          style={
            {
              "--seam-fill": `${Math.max(0, group.fillPx)}px`,
              "--seam-margin-bottom": `${paged.marginBottomPx}px`,
              "--seam-margin-top": `${paged.marginTopPx}px`,
              "--seam-gutter": `${PAGED_EDIT_GUTTER_PX}px`,
            } as CSSProperties
          }
        >
          {group.label ? (
            <span className="paged-edit-seam__number">{group.label}</span>
          ) : null}
        </div>,
      );
    });
    return out;
  };

  // The measured flow keys the note area's clone on this attribute — the PM
  // node identity never changes while the store-derived DOM does, so the
  // clone (and the entry boxes measured from it) must re-sync whenever the
  // rendered flow content changes. The noteFlow plan is EXCLUDED on purpose:
  // internal transitions are stripped from the clone, and keying on the plan
  // would loop plan -> render -> re-measure -> plan.
  const renderKey = [
    state.mode,
    `${sliceStart ?? ""}:${sliceStartOffset}~${sliceEnd ?? ""}:${sliceEndOffset}`,
    paged.active ? "p" : "u",
    footnotesShown.length,
    state.footnotes.length,
    state.endnotes.length,
    noteContentHash(
      [...state.footnotes, ...state.endnotes]
        .map(
          (note) =>
            `${note.id}:${note.label}:${noteBodyRenderKey(note.body, note.rich)}`,
        )
        .join("|"),
    ),
  ].join("|");

  // Word sets the document-end notes in the "endnote text" style: its size
  // and faces on the list, each entry advancing by Word's single line for
  // the face it is set in (the same rule the page-bottom zones follow).
  // Applied to the painted DOM after every render, so the ledger measures
  // the notes it will split at the height they paint.
  const listRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root || !paged.active) return;
    const textStyle = endnoteTextStyleFromDocAttrs(editor.state.doc.attrs);
    for (const separator of root.querySelectorAll<HTMLElement>(
      '[data-note-stream="endnote"] > .mrnote-footnote-list__separator',
    )) {
      applyNoteSeparatorTypography(
        separator,
        editor.state.doc.attrs,
        textStyle,
        separator.classList.contains("mrnote-footnote-list__separator--continuation") ? "continuation" : "separator",
      );
    }
    applyNoteZoneTypography(root, textStyle);
    if (!textStyle) return;
    const formats = new Map(
      [...state.footnotes, ...state.endnotes].map((note) => [note.id, note.paragraphFormat] as const),
    );
    for (const entry of root.querySelectorAll<HTMLElement>(".mrnote-footnote-list__entry")) {
      const body = entry.querySelector(".mrnote-footnote-list__bodytext");
      applyNoteRowTypography(entry, textStyle, body?.textContent ?? "", formats.get(entry.dataset.noteId ?? ""));
    }
  });

  return (
    <NodeViewWrapper
      ref={listRef}
      className={
        paged.active || emptyOnSheet
          ? "mrnote-footnote-list mrnote-footnote-list--paged"
          : "mrnote-footnote-list"
      }
      data-testid="footnote-list"
      data-empty={empty ? "true" : undefined}
      data-mode={state.mode}
      data-note-render-key={renderKey}
      contentEditable={false}
      onMouseDown={pressNoteList}
    >
      {empty ? (
        !paged.active && !emptyOnSheet && (
          <>
            <p
              className="mrnote-footnote-list__empty"
              data-testid="footnote-list-empty"
            >
              {state.mode === "endnote"
                ? t("footnotes.endnotesEmpty")
                : t("footnotes.empty")}
            </p>
          </>
        )
      ) : (
        <>
          {footnotesRendered.length > 0 && (
            <section
              className="mrnote-footnote-list__section"
              data-note-stream="footnote"
            >
              {/* Word sets notes under a short separator rule, with no
                  title and in the document's own ink, in every view. */}
              <div
                className="mrnote-footnote-list__separator"
                aria-hidden="true"
              />
              {renderEntries(footnotesRendered.map((note) => ({ note })), "footnote")}
            </section>
          )}
          {endnoteSpecs.length > 0 && (
            <section
              className="mrnote-footnote-list__section"
              data-note-stream="endnote"
            >
              {/* Word 尾注区: a short separator rule, then the entries —
                  no title, in every view. */}
              {(!isTailSlice || opensSectionArea) ? (
                <div
                  className="mrnote-footnote-list__separator"
                  aria-hidden="true"
                />
              ) : (
                // Notes continued from the page before open under Word's
                // continuation separator, a rule across the text width
                // (corpus R52-D15: its exact 55 pt line takes each continued
                // page's room, a page more in Word).
                <div
                  className="mrnote-footnote-list__separator mrnote-footnote-list__separator--continuation"
                  aria-hidden="true"
                />
              )}
              {renderEndnoteFlow()}
            </section>
          )}
        </>
      )}
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// Nodes + store extension.
// ---------------------------------------------------------------------------

/**
 * The inline footnote-reference ATOM node. Carries ONLY a sanitized `noteId`.
 * parse/render funnel the id through sanitizeFootnoteId so a forged/imported value
 * can never break out of the `data-note-id` attribute or inject markup. Rendered
 * as a superscript marker; the live number is painted by the NodeView. Mirrors
 * InlineMath (inline atom) for registration shape.
 */
const FootnoteRef = Node.create({
  name: FOOTNOTE_MARK_NAME,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      noteId: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          sanitizeFootnoteId(element.getAttribute("data-note-id")),
        renderHTML: (attrs: Record<string, unknown>) => {
          const id = sanitizeFootnoteId(attrs.noteId);
          return id ? { "data-note-id": id } : {};
        },
      },
      // Word 自定义标记 (customMarkFollows glyph, e.g. "a"/"*"): the marker
      // shows this literal glyph and consumes no auto number — like Word.
      customMark: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          sanitizeCustomMark(element.getAttribute("data-custom-mark")),
        renderHTML: (attrs: Record<string, unknown>) => {
          const mark = sanitizeCustomMark(attrs.customMark);
          return mark ? { "data-custom-mark": mark } : {};
        },
      },
    };
  },

  parseHTML() {
    // Above the superscript MARK rule (default priority 50), which would
    
    return [{ tag: 'sup[data-type="footnote-ref"]', priority: 100 }];
  },

  renderHTML({ HTMLAttributes }) {
    const id = sanitizeFootnoteId(
      (HTMLAttributes as { "data-note-id"?: unknown })["data-note-id"],
    );
    // Static serialization (HTML/DOCX export path): emit only the sanitized id +
    // a fixed class. The live editor NodeView paints the real auto-number. No
    // user text in the DOM attribute surface.
    return [
      "sup",
      mergeAttributes({}, id ? { "data-note-id": id } : {}, {
        "data-type": "footnote-ref",
        class: "mrnote-footnote-ref",
      }),
    ];
  },

  addNodeView() {
    return ({ editor, node }) => createFootnoteRefView({ editor, node });
  },
});

/**
 * The block footnote-LIST atom node. Stores nothing — it derives its entries from
 * the note store + the footnoteRef document order at render time (like the TOC
 * node derives from headings). A document carries at most one.
 */
const FootnoteList = Node.create({
  name: FOOTNOTE_LIST_NODE_NAME,
  group: "block",
  atom: true,
  // Not draggable: the notes area has one place (Word's cannot be moved
  // either), and a draggable node is dragged WHOLE by a press-and-move that
  // starts on its text. Sliding across an endnote's words to select them
  // picked the list up instead, and letting go over the body text dropped a
  // second list there.
  draggable: false,
  selectable: true,

  addAttributes() {
    
    // ENDNOTE entries [noteSliceStart, noteSliceEnd) so the rebalancer can
    // continue the note area across sheets. Editor-runtime only — every
    // serialization boundary keeps ONE unsliced node (blockSplitting).
    const sliceAttr = (dashed: string) => ({
      default: null as number | null,
      parseHTML: (element: HTMLElement) => {
        const raw = Number.parseInt(
          element.getAttribute(`data-${dashed}`) ?? "",
          10,
        );
        return Number.isInteger(raw) && raw >= 0 ? raw : null;
      },
      renderHTML: (attrs: Record<string, unknown>) => {
        const value =
          attrs[
            dashed === "note-slice-start" ? "noteSliceStart" : "noteSliceEnd"
          ];
        return Number.isInteger(value)
          ? { [`data-${dashed}`]: String(value) }
          : {};
      },
    });
    return {
      noteSliceStart: sliceAttr("note-slice-start"),
      noteSliceEnd: sliceAttr("note-slice-end"),
      noteSliceStartOffset: {
        default: null as number | null,
        parseHTML: (element: HTMLElement) => {
          const raw = Number.parseInt(
            element.getAttribute("data-note-slice-start-offset") ?? "",
            10,
          );
          return Number.isInteger(raw) && raw >= 0 ? raw : null;
        },
        renderHTML: (attrs: Record<string, unknown>) =>
          Number.isInteger(attrs.noteSliceStartOffset)
            ? {
                "data-note-slice-start-offset": String(
                  attrs.noteSliceStartOffset,
                ),
              }
            : {},
      },
      noteSliceEndOffset: {
        default: null as number | null,
        parseHTML: (element: HTMLElement) => {
          const raw = Number.parseInt(
            element.getAttribute("data-note-slice-end-offset") ?? "",
            10,
          );
          return Number.isInteger(raw) && raw >= 0 ? raw : null;
        },
        renderHTML: (attrs: Record<string, unknown>) =>
          Number.isInteger(attrs.noteSliceEndOffset)
            ? {
                "data-note-slice-end-offset": String(attrs.noteSliceEndOffset),
              }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="footnote-list"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "footnote-list" }),
    ];
  },

  addNodeView() {
    return reactNodeViewWithLivePosition(FootnoteListView, {
      // The note bodies are plain-text editable islands; keep ProseMirror's
      // keymaps/beforeinput/composition handling away from them (TipTap's
      // default stopEvent only covers form controls, not contenteditable).
      stopEvent: ({ event }) => {
        const target = event.target;
        return (
          target instanceof HTMLElement &&
          (target.closest("[data-footnote-body]") !== null ||
            target.closest("button") !== null ||
            // A press in the notes area outside a note's words is a note's
            // too (pressNoteList places the insertion point).
            (event.type.startsWith("mouse") &&
              target
                .closest(".mrnote-footnote-list")
                ?.querySelector('[data-footnote-body][contenteditable="true"]') != null))
        );
      },
    });
  },
});

/**
 * Doc-level attribute carrier for the note store + mode. Registered as GLOBAL
 * attributes on the `doc` node so they persist on doc.attrs through getJSON, and
 * are re-attached on load via `restoreFootnotes` (mirrors DocumentComments). There
 * is intentionally NO HTML (de)serialization: getHTML serializes only the doc's
 * CONTENT fragment, never the doc node's own attrs.
 */
const FootnoteStore = Extension.create({
  name: "documentFootnoteStore",

  addGlobalAttributes() {
    return [
      {
        types: ["doc"],
        attributes: {
          [FOOTNOTES_ATTR]: { default: [] as FootnoteEntry[] },
          [FOOTNOTE_MODE_ATTR]: { default: "footnote" as FootnoteMode },
          // Word note settings (w:footnotePr / w:endnotePr): per-stream
          // pos + numFmt + numStart + numRestart. null = native defaults, so a
          // document that never touches these is byte-for-byte unchanged.
          // Hydration restore rides normalizeHydratedDocumentPageAttrs
          // (DocumentPageSetup.ts) — the restoreDocumentPageSetup command
          // receives the WHOLE persisted attrs record, unlike
          // restoreFootnotes whose call signature carries only the store +
          // mode — so a reload can never launder them back to null.
          [FOOTNOTE_NUM_FMT_ATTR]: { default: null as NoteNumFmt | null },
          [ENDNOTE_NUM_FMT_ATTR]: { default: null as NoteNumFmt | null },
          [FOOTNOTE_NUM_START_ATTR]: { default: null as number | null },
          [ENDNOTE_NUM_START_ATTR]: { default: null as number | null },
          [FOOTNOTE_POSITION_ATTR]: { default: null as NotePosition | null },
          [ENDNOTE_POSITION_ATTR]: { default: null as NotePosition | null },
          [FOOTNOTE_NUM_RESTART_ATTR]: {
            default: null as NoteRestart | null,
          },
          [ENDNOTE_NUM_RESTART_ATTR]: {
            default: null as NoteRestart | null,
          },
          // Word "footnote text" style (size + Latin/East Asian faces) the
          // 脚注区 paints and the ledger charges notes in; null = editor stack.
          [FOOTNOTE_TEXT_STYLE_ATTR]: { default: null as NoteTextStyle | null },
          [ENDNOTE_TEXT_STYLE_ATTR]: { default: null as NoteTextStyle | null },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [pastedNoteCopyPlugin()];
  },
});

/** How often each note is referenced in `doc`. */
const HOLDS_NOTE_REFERENCE = new SheetFact((node) => node.type.name === FOOTNOTE_MARK_NAME);

function noteReferenceCounts(doc: ProseMirrorNode): Map<string, number> {
  const counts = new Map<string, number>();
  HOLDS_NOTE_REFERENCE.descendants(doc, (node) => {
    if (node.type.name !== FOOTNOTE_MARK_NAME) return true;
    const id = typeof node.attrs.noteId === "string" ? node.attrs.noteId : "";
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    return false;
  });
  return counts;
}

/** Whether some note is referenced more often in `after` than in `before`. */
function noteShownMoreOften(before: ProseMirrorNode, after: ProseMirrorNode): boolean {
  if (before === after) return false;
  const was = noteReferenceCounts(before);
  for (const [id, count] of noteReferenceCounts(after)) {
    if (count > 1 && count > (was.get(id) ?? 0)) return true;
  }
  return false;
}








function pastedNoteCopyPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("documentPastedNoteCopy"),
    appendTransaction: imeReplayingAppendTransaction((transactions, oldState, newState) => {
      // A paste, or any local edit that shows a note more often than before:
      // a table's cell paste (a whole row pasted over another table's cells)
      // is dispatched by the table plugin without the paste event, and its
      // copied reference shared the source's note (live Word audit WUA 169).
      // Not a peer's change, nor Undo/Redo (they restore notes as they were).
      const local = (tr: Transaction) =>
        tr.docChanged && tr.getMeta("addToHistory") !== false && tr.getMeta("history$") === undefined;
      const pastes = transactions.filter(
        (tr) => tr.docChanged && (tr.getMeta("uiEvent") === "paste" || (local(tr) && noteShownMoreOften(oldState.doc, newState.doc))),
      );
      if (!pastes.length) return null;
      const mapping = new Mapping();
      let inPaste = false;
      for (const transaction of transactions) {
        for (const map of transaction.mapping.maps) mapping.appendMap(map);
        if (pastes.includes(transaction)) inPaste = true;
      }
      if (!inPaste) return null;
      // The ranges the paste wrote, in the final document.
      const ranges: Array<[number, number]> = [];
      mapping.maps.forEach((map, index) => {
        const rest = mapping.slice(index + 1);
        map.forEach((_a, _b, start, end) => ranges.push([rest.map(start, -1), rest.map(end, 1)]));
      });
      const refs: Array<{ pos: number; id: string; pasted: boolean }> = [];
      newState.doc.descendants((node, pos) => {
        if (node.type.name !== FOOTNOTE_MARK_NAME) return true;
        const id = typeof node.attrs.noteId === "string" ? node.attrs.noteId : "";
        if (id) refs.push({ pos, id, pasted: ranges.some(([from, to]) => pos >= from && pos < to) });
        return false;
      });
      const shownOutside = new Set(refs.filter((ref) => !ref.pasted).map((ref) => ref.id));
      const seenInPaste = new Set<string>();
      let notes = readFootnotes(newState.doc);
      let tr: Transaction | null = null;
      for (const ref of refs) {
        if (!ref.pasted) continue;
        const duplicate = shownOutside.has(ref.id) || seenInPaste.has(ref.id);
        seenInPaste.add(ref.id);
        if (!duplicate) continue;
        const entry = notes.find((note) => note.id === ref.id);
        if (!entry) continue;
        const id = ref.id.startsWith("en-") ? `en-${footnoteIdFor()}` : footnoteIdFor();
        const next = addFootnoteEntry(notes, id, entry.body);
        if (next === notes) continue;
        notes = next.map((note) => (note.id === id ? { ...entry, id } : note));
        tr ??= newState.tr;
        const node = tr.doc.nodeAt(ref.pos);
        if (node) tr.setNodeMarkup(ref.pos, undefined, { ...node.attrs, noteId: id });
      }
      if (!tr) return null;
      tr.setDocAttribute(FOOTNOTES_ATTR, notes);
      return tr;
    }),
  });
}

/** Runtime note pagination may materialize several footnoteList projection
 * nodes across pageBlock sheets. A semantic body edit first collapses those
 * projections back to the single Word note-list node, then the rebalancer
 * measures and re-splits the new text. This prevents stale character cursors
 * from duplicating/skipping text after an insertion inside an earlier slice. */
function collapseRuntimeNoteSlices(
  tr: import("@tiptap/pm/state").Transaction,
): void {
  const members = noteListMembers(tr.doc);
  if (members.length === 0) return;
  // The stored list stands; a section's endnote area (endnotes at the end
  // of each section) is laid out again by noteSliceIntegrity.
  const headPos = members[storedNoteListIndex(members)].pos;
  const positions = members.map((member) => member.pos);
  const mapFrom = tr.mapping.maps.length;
  for (const pos of positions.filter((pos) => pos !== headPos).sort((a, b) => b - a)) {
    const node = tr.doc.nodeAt(pos);
    if (!node || node.type.name !== FOOTNOTE_LIST_NODE_NAME) continue;
    const $pos = tr.doc.resolve(pos);
    if ($pos.parent.type.name === "pageBlock" && $pos.parent.childCount === 1) {
      const parentPos = $pos.before($pos.depth);
      tr.delete(parentPos, parentPos + $pos.parent.nodeSize);
    } else {
      tr.delete(pos, pos + node.nodeSize);
    }
  }
  const keptPos = tr.mapping.slice(mapFrom).map(headPos);
  const head = tr.doc.nodeAt(keptPos);
  if (!head || head.type.name !== FOOTNOTE_LIST_NODE_NAME) return;
  tr.setNodeMarkup(keptPos, undefined, {
    ...head.attrs,
    [NOTE_SLICE_START_ATTR]: null,
    [NOTE_SLICE_END_ATTR]: null,
    [NOTE_SLICE_START_OFFSET_ATTR]: null,
    [NOTE_SLICE_END_OFFSET_ATTR]: null,
  });
}






function collapseNoteInsertionToSelectionEnd(tr: Transaction): void {
  // A floating object selected: the reference opens its anchor paragraph's
  // text and the object stays (Word 16.86, Insert Footnote with a floating
  // picture selected).
  const anchored = floatSelectionInsertionPos(tr);
  if (anchored !== null) {
    tr.setSelection(TextSelection.create(tr.doc, anchored));
    return;
  }
  if (tr.selection.empty) return;
  const $end = tr.doc.resolve(tr.selection.to);
  tr.setSelection(
    $end.parent.inlineContent ? TextSelection.create(tr.doc, $end.pos) : Selection.near($end, -1),
  );
}

/**
 * The user-facing extension: registers the ref node + the list node + the store +
 * the commands. The commands keep the document nodes and the store in sync.
 */
export const DocumentFootnotes = Extension.create({
  name: "documentFootnotes",

  addExtensions() {
    return [FootnoteRef, FootnoteList, FootnoteStore];
  },

  addCommands() {
    return {
      addFootnote:
        (body?: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const refType = state.schema.nodes[FOOTNOTE_MARK_NAME];
          const listType = state.schema.nodes[FOOTNOTE_LIST_NODE_NAME];
          if (!refType) return false;

          const existing = readFootnotes(state.doc);
          const id = footnoteIdFor();
          const added = addFootnoteEntry(existing, id, body ?? "");
          // No-op only if the store rejected the id (cap — the id is fresh).
          if (added === existing) return false;
          const nextNotes = withNoteFormulas(added, id, body);

          if (dispatch) {
            const node = refType.create({ noteId: id });
            collapseNoteInsertionToSelectionEnd(tr);
            tr.replaceSelectionWith(node, false);
            // Ensure a single list node exists at the very end of the document.
            if (listType && !hasFootnoteListNode(state.doc)) {
              tr.insert(tr.doc.content.size, listType.create());
            }
            tr.setDocAttribute(FOOTNOTES_ATTR, nextNotes);
            dispatch(tr);
          }
          return true;
        },

      addEndnote:
        (body?: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const refType = state.schema.nodes[FOOTNOTE_MARK_NAME];
          const listType = state.schema.nodes[FOOTNOTE_LIST_NODE_NAME];
          if (!refType) return false;

          const existing = readFootnotes(state.doc);
          // The "en-" prefix IS the stream discriminator (imported endnotes
          // are "en-N"); an app-minted endnote joins the same stream.
          const id = `en-${footnoteIdFor()}`;
          const added = addFootnoteEntry(existing, id, body ?? "");
          if (added === existing) return false;
          const nextNotes = withNoteFormulas(added, id, body);

          if (dispatch) {
            const node = refType.create({ noteId: id });
            collapseNoteInsertionToSelectionEnd(tr);
            tr.replaceSelectionWith(node, false);
            if (listType && !hasFootnoteListNode(state.doc)) {
              tr.insert(tr.doc.content.size, listType.create());
            }
            tr.setDocAttribute(FOOTNOTES_ATTR, nextNotes);
            // Word numbers a document's endnotes i, ii, iii unless told
            // otherwise, so they never read as the footnotes' 1, 2, 3. The
            // FIRST endnote of a document that has not chosen a format takes
            // Word's; a document that already has endnotes keeps its own.
            const hasEndnotes = existing.some((note) => note.id.startsWith("en-"));
            if (!hasEndnotes && state.doc.attrs.endnoteNumFmt == null) {
              tr.setDocAttribute("endnoteNumFmt", "lowerRoman");
            }
            dispatch(tr);
          }
          return true;
        },

      setFootnoteBody:
        (noteId: string, body: string, rich?: FootnoteRichBody) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const existing = readFootnotes(state.doc);
          const nextNotes = setBodyInStore(existing, noteId, body, rich);
          if (nextNotes === existing) return false;
          if (dispatch) {
            collapseRuntimeNoteSlices(tr);
            tr.setDocAttribute(FOOTNOTES_ATTR, nextNotes);
            // A body edit should not churn the undo stack per keystroke beyond the
            // normal text-input grouping; leave history default (grouped).
            dispatch(tr);
          }
          return true;
        },

      removeFootnote:
        (noteId: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const id = sanitizeFootnoteId(noteId);
          if (!id) return false;
          const existing = readFootnotes(state.doc);
          const nextNotes = removeFootnoteEntry(existing, id);
          const positions: { from: number; to: number }[] = [];
          state.doc.descendants((node, pos) => {
            if (
              node.type.name === FOOTNOTE_MARK_NAME &&
              sanitizeFootnoteId(node.attrs?.noteId) === id
            ) {
              positions.push({ from: pos, to: pos + node.nodeSize });
            }
            return true;
          });
          if (nextNotes === existing && positions.length === 0) return false;
          if (dispatch) {
            // Delete ref nodes right-to-left so positions stay valid.
            for (const range of positions.sort((a, b) => b.from - a.from)) {
              tr.delete(range.from, range.to);
            }
            if (nextNotes !== existing) {
              tr.setDocAttribute(FOOTNOTES_ATTR, nextNotes);
            }
            dispatch(tr);
          }
          return true;
        },

      setFootnoteMode:
        (mode: FootnoteMode) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          if (dispatch) {
            tr.setDocAttribute(FOOTNOTE_MODE_ATTR, resolveFootnoteMode(mode));
            dispatch(tr);
          }
          return true;
        },

      setNoteNumbering:
        (
          stream: NoteStream,
          numFmt: NoteNumFmt,
          start: number,
          position?: NotePosition,
          restart?: NoteRestart,
        ) =>
        ({ editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const prefix = stream === "endnote" ? "endnote" : "footnote";
          const format = sanitizeNoteNumFmt(numFmt) ?? "decimal";
          const normalizedStart = sanitizeNoteNumStart(start) ?? 1;
          if (dispatch) {
            tr.setDocAttribute(
              prefix === "endnote"
                ? ENDNOTE_NUM_FMT_ATTR
                : FOOTNOTE_NUM_FMT_ATTR,
              format === "decimal" ? null : format,
            );
            tr.setDocAttribute(
              prefix === "endnote"
                ? ENDNOTE_NUM_START_ATTR
                : FOOTNOTE_NUM_START_ATTR,
              normalizedStart === 1 ? null : normalizedStart,
            );
            if (position !== undefined) {
              const normalizedPosition = sanitizeNotePosition(stream, position);
              const defaultPosition =
                stream === "endnote" ? "docEnd" : "pageBottom";
              tr.setDocAttribute(
                stream === "endnote"
                  ? ENDNOTE_POSITION_ATTR
                  : FOOTNOTE_POSITION_ATTR,
                normalizedPosition && normalizedPosition !== defaultPosition
                  ? normalizedPosition
                  : null,
              );
            }
            if (restart !== undefined) {
              const normalizedRestart = sanitizeNoteRestart(stream, restart);
              tr.setDocAttribute(
                stream === "endnote"
                  ? ENDNOTE_NUM_RESTART_ATTR
                  : FOOTNOTE_NUM_RESTART_ATTR,
                normalizedRestart && normalizedRestart !== "continuous"
                  ? normalizedRestart
                  : null,
              );
            }
            dispatch(tr);
          }
          return true;
        },

      scrollToFootnoteRef:
        (noteId: string) =>
        ({ state, commands }) => {
          const pos = findFootnoteRefPos(state.doc, noteId);
          if (pos === null) return false;
          return commands.setTextSelection({ from: pos, to: pos + 1 });
        },

      restoreFootnotes:
        (footnotes: unknown, mode?: unknown) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            // addToHistory:false so a hydration restore is not an undoable edit.
            tr.setDocAttribute(FOOTNOTES_ATTR, normalizeFootnotes(footnotes));
            tr.setDocAttribute(FOOTNOTE_MODE_ATTR, resolveFootnoteMode(mode));
            trustReadOnlyDocumentMutation(tr, "hydration-restore");
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

export default DocumentFootnotes;
