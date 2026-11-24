"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Paged EDITING — page seams rendered into the live editor, driven by the
 * PaginatedLayoutSnapshot (docs/paged-layout-architecture.md).
 *
 * The document stays ONE continuous ProseMirror surface (selection, IME,
 * undo, collaboration untouched); pagination is a VIEW-ONLY decoration layer.
 * This is a rebuild of the deleted widget system with its failure modes
 * designed out:
 *
 *   - Seam widgets are placed ONLY at positions BETWEEN top-level blocks
 *     (page boundaries come from the engine's whole-block packing), so a
 *     block-level div can never be mounted inside a paragraph / link /
 *     formula — the corruption class of the old system.
 *   - Nothing here measures or observes the editor DOM. Measurement happens
 *     on the engine's hidden flow; seams arrive via one command per
 *     committed generation (single snapshot per generation ⇒ the page count
 *     cannot oscillate).
 *   - Positions map through ordinary transactions between generations, so
 *     typing keeps seams visually stable until the next commit.
 *
 * Each seam paints the END of one sheet and the START of the next: the
 * remaining content fill, the footer band (logical page number), the gray
 * gutter, and the next sheet's top margin — via CSS custom properties on one
 * contenteditable=false block div.
 */

import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import {
  MAX_FOOTNOTE_BODY_LENGTH,
  insertFootnoteMediaPictures,
  sanitizeFootnoteRichBody,
  sliceFootnoteRichBody,
  spliceFootnoteRichBody,
  type FootnoteMediaPicture,
  type FootnoteParagraphFormat,
  type FootnoteParagraphLine,
  type FootnoteRichBody,
} from "../footnotes";
import {
  applyNoteParagraphLines,
  isNoteMathAtom,
  noteMathAtomOf,
  noteParagraphIndexAt,
  noteTextNodes,
  renderNoteBodyInto,
  serializeNoteBodyDom,
} from "../noteRichText";
import {
  applyNoteRowTypography,
  applyNoteZoneTypography,
  type NoteTextStyle,
} from "../noteTextStyle";

const PAGED_EDITING_META = "setPagedEditing";

/** The gray gutter between two sheets (px) — matches paged print/preview. */
export const PAGED_EDIT_GUTTER_PX = 24;

export interface PagedEditingSeam {
  /**
   * Document position BETWEEN two top-level blocks — or, for a page
   * transition INSIDE a split table/list (Word 表格/列表跨页), the position
   * just BEFORE the row/item that starts the next page.
   */
  pos: number;
  /** 0-based index of the sheet that ENDS at this seam. */
  pageIndex: number;
  /** Formatted logical label of the ending sheet (footer band), or null. */
  label: string | null;
  /** Unused content height remaining on the ending sheet (px ≥ 0). */
  fillPx: number;
  /**
   * Word 脚注区: the FOOTNOTE-stream notes whose markers sit on the ending
   * sheet, rendered at the bottom of that sheet above the footer band
   * (separator rule + marker label + body), exactly where Word prints them.
   * Like Word, the note body is edited IN PLACE at the page bottom: each
   * body is a plain-text editable island committing on blur.
   */
  footnotes?: PagedEditingSeamNote[];
  /**
   * Dispatch-time intent: the seam position sits INSIDE a table, before a
   * row (the fragment's block is a table). The widget then renders with a
   * <tr><td> wrapper so the tbody's row flow stays valid DOM. The build
   * re-verifies against the CURRENT doc (positions map between generations)
   * — the resolved parent node, not this flag, is the final authority.
   */
  inTable?: boolean;
  /**
   * Word blank pages BETWEEN the ending sheet and the next content page
   * (oddPage/evenPage parity fillers, a sectPr immediately followed by a
   * page break). They host no widget anchor of their own, so this seam
   * renders each as a whole empty sheet — footer label included — exactly
   * where Word prints it.
   */
  blankPages?: Array<{ label: string | null }>;
  /**
   * The page STARTING at this seam was opened by an explicit break. Word
   * keeps the first block's space-before after a hard break but suppresses
   * it at a natural page top; the seam CSS keys off the class this flag
   * adds to keep the on-screen sheet height equal to the engine's account.
   */
  hardBreak?: boolean;
}

export interface PagedEditingSeamNote {
  id: string;
  /** The visible marker label (auto number or Word custom mark). */
  label: string;
  body: string;
  /** Whitelisted inline formatting (paragraphs of runs); body stays plain. */
  rich?: FootnoteRichBody;
  /** This zone shows only `body.slice(sliceStart, sliceEnd)`: the rest of a
   * note the page could not hold is continued on the following pages
   * (Word). Absent: the whole body. */
  sliceStart?: number;
  sliceEnd?: number;
  /** Rows continued from an earlier page: the zone opens with Word's
   * continuation separator and the row shows no mark. */
  continued?: boolean;
  /** More rows follow on a later page. */
  continues?: boolean;
  /** The note holds a drawing kept only in the source file: not edited. */
  readOnly?: boolean;
  /** The pictures such a note draws in its line (offsets into `body`). */
  pictures?: FootnoteMediaPicture[];
  /** The note's own paragraph format, when it is not in the note style. */
  paragraphFormat?: FootnoteParagraphFormat;
  /** Each paragraph's own Exactly / At least line (null: the note's line). */
  paragraphLines?: (FootnoteParagraphLine | null)[];
}

export interface PagedEditingGeometry {
  marginTopPx: number;
  marginBottomPx: number;
  /**
   * Full paper height (px) — sizes the whole blank sheets a seam renders for
   * its `blankPages`. Optional: restored cache entries from before this
   * field simply render blanks from margins alone (next generation corrects).
   */
  pageHeightPx?: number;
  /** Terminal sheet info: fill + label for the document's LAST page. */
  terminal: {
    label: string | null;
    fillPx: number;
    footnotes?: PagedEditingSeamNote[];
  } | null;
  /**
   * Word 尾注区跨页流: how the document-end note area splits across pages.
   * Page boundaries INSIDE the note block cannot host widget seams (an atom
   * has no inner positions), so the note view renders the transitions
   * itself from this plan. Each group is one page's portion — a sequence of
   * ops: a WHOLE entry, or a pixel SLICE of an entry taller than one page
   * (`first` hosts the live editable island clipped to its slice; later
   * slices render as read-only continuation mirrors, LibreOffice
   * master/follow style). After a group whose fillPx is non-null the view
   * paints a page transition (fill + footer label + gutter + next top
   * margin); the final group ends at the normal seam after the block.
   */
  noteFlow?: {
    groups: Array<{
      ops: Array<{
        /** Endnote entry index in the note view's own order. */
        entry: number;
        /** Slice top WITHIN the entry (0 for whole / first slice). */
        topPx: number;
        /** Slice height (the entry's full height for whole ops). */
        heightPx: number;
        whole: boolean;
        /** First slice of a split entry — hosts the live island. */
        first: boolean;
      }>;
      fillPx: number | null;
      label: string | null;
    }>;
  } | null;
}

interface PagedEditingState {
  seams: PagedEditingSeam[];
  geometry: PagedEditingGeometry | null;
  decorations: DecorationSet;
}

interface PagedEditingMeta {
  seams: PagedEditingSeam[];
  geometry: PagedEditingGeometry | null;
}

export const pagedEditingPluginKey = new PluginKey<PagedEditingState>(
  "pagedEditing",
);

/** Callbacks the seam DOM uses to write note edits back into the document. */
export interface SeamNoteHooks {
  canEdit: () => boolean;
  commitBody: (
    noteId: string,
    body: string,
    rich?: FootnoteRichBody,
  ) => boolean;
  /** The document's own Undo / Redo (one history across the stories). */
  history?: (command: "undo" | "redo") => boolean;
}

/** Undo / Redo for each live note island, by its body element. */
const noteIslandHistory = new WeakMap<HTMLElement, (command: "undo" | "redo") => boolean>();

/**
 * Undo / Redo with a note island focused, as the ribbon's buttons run it.
 * Null when `element` is not a live note island (the caller then runs the
 * document's history itself).
 */
export function runNoteIslandHistory(
  element: Element | null | undefined,
  command: "undo" | "redo",
): boolean | null {
  const body = element?.closest<HTMLElement>("[data-footnote-body]") ?? null;
  const run = body ? noteIslandHistory.get(body) : undefined;
  return run ? run(command) : null;
}

/**
 * The nearest element matching `selector` around `from`: inside it, else in
 * the smallest ancestor that holds one, up to the document's editor body. A
 * paged document draws its note bodies in an overlay BESIDE the ProseMirror
 * view (and the references inside it), so neither side can look only within
 * its own subtree; stopping at the nearest match keeps another open
 * document's note of the same id out of reach.
 */
export function nearestNoteElement(
  from: Element,
  selector: string,
): HTMLElement | null {
  const boundary = from.closest(".note-editor-body");
  let scope: Element | null = from;
  while (scope) {
    const found = scope.querySelector<HTMLElement>(selector);
    if (found) return found;
    if (scope === boundary) break;
    scope = scope.parentElement;
  }
  return null;
}

/** The text offset, counted as a note island is serialized, of a DOM point. */
function noteIslandPointOffset(body: HTMLElement, container: Node, at: number): number | null {
  if (!body.contains(container)) return null;
  // A point inside a formula is beside it: after it (a formula is one
  // character, never entered).
  const formula = noteMathAtomOf(container, body);
  if (formula && formula.parentNode) {
    const parent = formula.parentNode;
    return noteIslandPointOffset(body, parent, Array.prototype.indexOf.call(parent.childNodes, formula) + 1);
  }
  let offset = 0;
  let found: number | null = null;
  const walk = (node: Node): boolean => {
    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) {
        found = offset + at;
        return true;
      }
      const children = Array.from(node.childNodes);
      for (let index = 0; index < at && index < children.length; index += 1) {
        offset += noteIslandNodeLength(children[index]);
      }
      found = offset;
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0;
      return false;
    }
    if (node.nodeName === "BR" || isNoteMathAtom(node)) {
      offset += 1;
      return false;
    }
    for (const child of Array.from(node.childNodes)) if (walk(child)) return true;
    return false;
  };
  walk(body);
  return found;
}

/**
 * The text offset of the caret in a note island, counted as the island is
 * serialized: each character of text, and each <br> as one paragraph break.
 * Null when the selection is not a caret inside `body`.
 */
export function noteIslandCaretOffset(body: HTMLElement): number | null {
  const selection = body.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  return noteIslandPointOffset(body, range.startContainer, range.startOffset);
}

/** The selection in a note island as text offsets (a caret has start = end). */
export function noteIslandSelectionOffsets(body: HTMLElement): { start: number; end: number } | null {
  const selection = body.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const start = noteIslandPointOffset(body, range.startContainer, range.startOffset);
  const end = noteIslandPointOffset(body, range.endContainer, range.endOffset);
  return start === null || end === null ? null : { start, end };
}

function noteIslandNodeLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (node.nodeName === "BR" || isNoteMathAtom(node)) return 1;
  let length = 0;
  for (const child of Array.from(node.childNodes)) length += noteIslandNodeLength(child);
  return length;
}

/** Set `range`'s start (or end) at text `offset` of a note island. */
function setNoteIslandPoint(body: HTMLElement, range: Range, offset: number, edge: "start" | "end"): void {
  let left = Math.max(0, offset);
  const place = (node: Node, at: number) => (edge === "start" ? range.setStart(node, at) : range.setEnd(node, at));
  const before = (node: Node) => (edge === "start" ? range.setStartBefore(node) : range.setEndBefore(node));
  const after = (node: Node) => (edge === "start" ? range.setStartAfter(node) : range.setEndAfter(node));
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (left <= length) {
        place(node, left);
        return true;
      }
      left -= length;
      return false;
    }
    if (node.nodeName === "BR" || isNoteMathAtom(node)) {
      if (left === 0) {
        before(node);
        return true;
      }
      left -= 1;
      if (left === 0) {
        after(node);
        return true;
      }
      return false;
    }
    for (const child of Array.from(node.childNodes)) if (walk(child)) return true;
    return false;
  };
  if (!walk(body)) place(body, body.childNodes.length);
}

/** Select text `start`..`end` of a note island (counted as above). */
export function selectNoteIslandRange(body: HTMLElement, start: number, end: number): void {
  const doc = body.ownerDocument;
  const range = doc.createRange();
  range.selectNodeContents(body);
  setNoteIslandPoint(body, range, start, "start");
  setNoteIslandPoint(body, range, Math.max(start, end), "end");
  const selection = doc.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Put the caret at text `offset` of a note island (counted as above). */
export function placeNoteIslandCaret(body: HTMLElement, offset: number): void {
  selectNoteIslandRange(body, offset, offset);
}

/**
 * Where the caret goes once a note's slices are drawn again after an edit
 * across a page cut: the note id and the offset in its whole body. Read by
 * the island that holds the offset.
 */
const pendingNoteCaret = new Map<string, { offset: number; at: number }>();

/** Ask for the caret at `offset` of note `noteId`'s whole body. */
export function requestNoteCaret(noteId: string, offset: number): void {
  pendingNoteCaret.set(noteId, { offset, at: Date.now() });
}

export function cancelNoteCaret(noteId: string): void {
  pendingNoteCaret.delete(noteId);
}

/**
 * The offset in this island where the asked-for caret goes, when the island
 * showing `[sliceStart, sliceEnd)` of the note (`continues`: a later part
 * follows) holds it; the request is then used up.
 */
export function takeNoteCaret(
  noteId: string,
  sliceStart: number,
  sliceEnd: number,
  continues: boolean,
): number | null {
  const pending = pendingNoteCaret.get(noteId);
  if (!pending) return null;
  if (Date.now() - pending.at >= 3000) {
    pendingNoteCaret.delete(noteId);
    return null;
  }
  const holds =
    pending.offset >= sliceStart &&
    (pending.offset < sliceEnd || (pending.offset === sliceEnd && !continues));
  if (!holds) return null;
  pendingNoteCaret.delete(noteId);
  return pending.offset - sliceStart;
}

/**
 * Settle the caret in a note island once it is in the page: focus it and put
 * the caret at `offset` of its text.
 */
export function settleNoteIslandCaret(body: HTMLElement, offset: number): void {
  const settle = () => {
    if (!body.isConnected) return;
    body.focus({ preventScroll: true });
    placeNoteIslandCaret(body, offset);
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(settle);
  else queueMicrotask(settle);
}

/**
 * The character a Backspace (at the island's start) or a Delete (at the
 * end of its words) takes across the page cut of a note, as an offset in
 * the whole body; null when the key is the island's own. `contentEnd` is
 * where the island's words end in the whole body, before the breaks the cut
 * left at its end.
 */
export function noteKeyAcrossCut(
  key: string,
  caret: number | null,
  sliceStart: number,
  contentLength: number,
  contentEnd: number,
  bodyLength: number,
): number | null {
  if (caret === null) return null;
  if (key === "Backspace") return caret === 0 && sliceStart > 0 ? sliceStart - 1 : null;
  if (key === "Delete") return caret >= contentLength && contentEnd < bodyLength ? contentEnd : null;
  return null;
}

/**
 * Build one Word 脚注区 DOM: rows of label + body, bodies edited IN PLACE as
 * rich islands committing through `hooks` on blur. Shared by the painted
 * seam widgets AND the structural sheet overlays (V3.4) — the zone itself is
 * position-agnostic; the caller anchors it. Returns null for an empty list.
 * Text lands via textContent (never HTML).
 */
/** The pause in a note island's typing after which it is written to the document. */
export const NOTE_ISLAND_IDLE_WRITE_MS = 1000;

export function buildFootnoteZoneDom(
  notes: readonly PagedEditingSeamNote[],
  hooks: SeamNoteHooks | null,
  textStyle: NoteTextStyle | null = null,
): HTMLElement | null {
  if (notes.length === 0) return null;
  const zone = document.createElement("div");
  zone.className = "paged-edit-seam__footnotes";
  zone.setAttribute("data-testid", "paged-seam-footnotes");
  // Word's continuation separator: a page whose note area opens with rows
  // continued from the page before draws the long rule.
  if (notes[0]?.continued) zone.classList.add("paged-edit-seam__footnotes--continued");
  // The document's "footnote text" style: the same size, faces and single
  // line the ledger's note measurer charges (pagedFootnotes.ts).
  applyNoteZoneTypography(zone, textStyle);
  for (const note of notes) {
    const row = document.createElement("div");
    row.className = "paged-edit-seam__footnote";
    row.setAttribute("data-note-id", note.id);
    applyNoteRowTypography(row, textStyle, note.body, note.paragraphFormat);
    if (note.label) {
      const marker = document.createElement("span");
      marker.className = "paged-edit-seam__footnote-ref";
      marker.textContent = note.label;
      // Word parity: the mark navigates to the in-text reference.
      marker.addEventListener("click", () => {
        const target = nearestNoteElement(
          zone,
          `[data-footnote-ref-id="${CSS.escape(note.id)}"]`,
        );
        target?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      row.appendChild(marker);
    }
    const body = document.createElement("span");
    body.className = "paged-edit-seam__footnote-body";
    // A continued note shows this page's rows only; edits splice back into
    
    const sliceStart = Math.max(0, Math.min(note.sliceStart ?? 0, note.body.length));
    const sliceEnd = Math.max(sliceStart, Math.min(note.sliceEnd ?? note.body.length, note.body.length));
    const partial = sliceStart > 0 || sliceEnd < note.body.length;
    const renderBody = () => {
      const richSlice = note.rich
        ? sliceFootnoteRichBody(note.body, note.rich, sliceStart, sliceEnd)
        : undefined;
      if (richSlice) renderNoteBodyInto(body, richSlice);
      else {
        body.textContent = "";
        body.appendChild(noteTextNodes(body.ownerDocument, note.body.slice(sliceStart, sliceEnd)));
      }
      // A read-only note's own pictures, where they stand in its line.
      insertFootnoteMediaPictures(body, note.pictures, sliceStart, sliceEnd);
      // Each paragraph on its own line, as Word sets it (R77-D14).
      applyNoteParagraphLines(body, note.paragraphLines, noteParagraphIndexAt(note.body, sliceStart));
    };
    renderBody();
    // An edit across the page cut asked for the caret back at its place in
    // the whole body: the island that now holds that place takes it.
    const pendingCaret = takeNoteCaret(note.id, sliceStart, sliceEnd, Boolean(note.continues));
    if (pendingCaret !== null) settleNoteIslandCaret(body, pendingCaret);
    if (note.continued) row.setAttribute("data-note-continued", "true");
    if (note.continues) row.setAttribute("data-note-continues", "true");
    body.setAttribute("data-footnote-body", note.id);
    // The row shows a text cursor; a click on it beside the (possibly
    // empty) body puts the caret at the body's end instead of falling
    
    row.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      const target = event.target as Node | null;
      if (!target || body.contains(target)) return;
      if (target instanceof Element && target.closest(".paged-edit-seam__footnote-ref")) return;
      if (body.getAttribute("contenteditable") !== "true") return;
      event.preventDefault();
      body.focus();
      const selection = body.ownerDocument.getSelection();
      if (selection) {
        const range = body.ownerDocument.createRange();
        range.selectNodeContents(body);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    });
    body.setAttribute("role", "textbox");
    body.setAttribute("aria-multiline", "true");
    body.tabIndex = 0;
    body.spellcheck = false;
    // The whole body with this island's edits in it, and where the island's
    // own words end in it (before the breaks the page cut left at its end).
    let committedAcrossCut = false;
    const editedIsland = () => {
      const serialized = serializeNoteBodyDom(body);
      // The island of a continued slice ends where the page cut it, often
      // right after a paragraph break the serializer drops as a trailing
      // empty paragraph: keep as many trailing breaks as the slice had.
      const trailingBreaks = partial
        ? (/\n+$/.exec(note.body.slice(sliceStart, sliceEnd))?.[0] ?? "")
        : "";
      const rich: FootnoteRichBody = trailingBreaks
        ? [...serialized, ...Array.from(trailingBreaks, () => [])]
        : serialized;
      const words = serialized.map((runs) => runs.map((run) => run.text).join("")).join("\n");
      const plain = rich
        .map((runs) => runs.map((run) => run.text).join(""))
        .join("\n");
      return {
        body: partial
          ? `${note.body.slice(0, sliceStart)}${plain}${note.body.slice(sliceEnd)}`
          : plain,
        rich: partial
          ? spliceFootnoteRichBody(note.body, note.rich, sliceStart, sliceEnd, plain, rich)
          : rich,
        contentLength: words.length,
        contentEnd: sliceStart + words.length,
      };
    };
    if (hooks?.canEdit() && !note.readOnly) {
      // Rich island (mirrors EditableNoteBody): whitelisted inline marks
      // via execCommand shortcuts, plain-text paste, whitelist-serialized
      // commit on blur.
      body.setAttribute("contenteditable", "true");
      body.setAttribute("aria-readonly", "false");
      // What this island last wrote: an idle write and the blur after it
      // must not write (or, refused as unchanged, redraw) the same text.
      let lastWritten: string | null = null;
      // Whether the island holds words typed since its last write.
      let typedSinceWrite = false;
      const writtenKey = (edited: { body: string; rich: unknown }) =>
        JSON.stringify([edited.body, edited.rich ?? null]);
      // A pause in the typing writes the island to the document, as a pause
      // in the body's typing does: the window said 已保存 over a footnote
      // being typed, then warned of unsaved changes on closing (WUA 080).
      // The zone is never rebuilt under a caret in it, so the island keeps
      // its caret and its words; the blur writes whatever came after.
      let idleWrite: number | null = null;
      let composing = false;
      const scheduleIdleWrite = () => {
        const view = body.ownerDocument.defaultView;
        if (!view) return;
        if (idleWrite !== null) view.clearTimeout(idleWrite);
        idleWrite = view.setTimeout(() => {
          idleWrite = null;
          if (composing || committedAcrossCut || !body.isConnected || !hooks.canEdit()) return;
          const edited = editedIsland();
          const key = writtenKey(edited);
          if (key === lastWritten) return;
          // The write may draw the zone again: the island then drawn for
          // this place takes the caret back, so the typing goes on in it
          // (WUA 226: the redraw dropped the focus about a second after the
          // typing stopped, and the next keys went nowhere).
          const doc = body.ownerDocument;
          const caret = doc.activeElement === body ? noteIslandCaretOffset(body) : null;
          if (caret !== null) requestNoteCaret(note.id, sliceStart + caret);
          if (hooks.commitBody(note.id, edited.body, edited.rich)) {
            lastWritten = key;
            typedSinceWrite = false;
          }
          if (caret !== null) {
            const settled = () => {
              // Not drawn again: the request is not for a later redraw.
              if (body.isConnected) cancelNoteCaret(note.id);
            };
            const win = doc.defaultView;
            if (win) win.requestAnimationFrame(() => win.requestAnimationFrame(settled));
            else settled();
          }
        }, NOTE_ISLAND_IDLE_WRITE_MS);
      };
      body.addEventListener("compositionstart", () => {
        composing = true;
      });
      body.addEventListener("compositionend", () => {
        composing = false;
        scheduleIdleWrite();
      });
      body.addEventListener("input", () => {
        typedSinceWrite = true;
        scheduleIdleWrite();
      });
      // Word keeps ONE Undo list across the body and its notes (Microsoft
      // Support, "Undo, redo, or repeat an action"): with the island
      // focused, a step the island did not type itself -- a symbol the
      // Symbol dialog put here, already written to the document, or any
      // earlier edit -- is the document's to undo. The browser's own undo
      // of the island had nothing (the island was drawn again from the
      // document after the write), so Cmd+Z and the ribbon's Undo did
      // nothing (live Word audit WUA 007). Words typed since the last write
      // are still the island's own and undo as typed.
      const islandHistory = (command: "undo" | "redo"): boolean => {
        if (typedSinceWrite || !hooks.history) {
          const doc = body.ownerDocument;
          return typeof doc.execCommand === "function" && doc.execCommand(command);
        }
        // The island hands the caret to the one drawn after the change
        // (the zone is never drawn again under a caret in it).
        const caret = noteIslandCaretOffset(body);
        if (caret !== null) requestNoteCaret(note.id, sliceStart + caret);
        // Nothing of the island's own to write on the way out: the step
        // undone must be the document's last one, not a rewrite of the note.
        lastWritten = writtenKey(editedIsland());
        body.blur();
        const done = hooks.history(command);
        if (!done && caret !== null) {
          cancelNoteCaret(note.id);
          body.focus();
        }
        return done;
      };
      noteIslandHistory.set(body, islandHistory);
      body.addEventListener("beforeinput", (event) => {
        if (hooks.canEdit()) return;
        event.preventDefault();
        renderBody();
        body.setAttribute("contenteditable", "false");
        body.setAttribute("aria-readonly", "true");
      });
      body.addEventListener("paste", (event) => {
        if (!hooks.canEdit()) {
          event.preventDefault();
          body.setAttribute("contenteditable", "false");
          body.setAttribute("aria-readonly", "true");
          return;
        }
        event.preventDefault();
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (text) document.execCommand("insertText", false, text);
      });
      body.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          body.blur();
          return;
        }
        // Backspace at the start of a page's part of a note, and Delete at
        // the end of its part before the cut, reach the character across
        // the cut, as in one note (live Word audit WUA 044: the line break
        // where the page cut a long footnote could not be deleted, and the
        // same break could once the paper size moved the cut).
        if (
          (event.key === "Backspace" || event.key === "Delete") &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.isComposing &&
          partial &&
          hooks.canEdit()
        ) {
          const edited = editedIsland();
          const across = noteKeyAcrossCut(
            event.key,
            noteIslandCaretOffset(body),
            sliceStart,
            edited.contentLength,
            edited.contentEnd,
            edited.body.length,
          );
          if (across !== null) {
            event.preventDefault();
            event.stopPropagation();
            const nextBody = `${edited.body.slice(0, across)}${edited.body.slice(across + 1)}`;
            const nextRich = spliceFootnoteRichBody(edited.body, edited.rich, across, across + 1, "");
            committedAcrossCut = true;
            requestNoteCaret(note.id, across);
            if (!hooks.commitBody(note.id, nextBody, nextRich)) {
              committedAcrossCut = false;
              cancelNoteCaret(note.id);
              renderBody();
            }
            return;
          }
        }
        if (!(event.metaKey || event.ctrlKey)) return;
        if (!hooks.canEdit()) {
          event.preventDefault();
          body.setAttribute("contenteditable", "false");
          body.setAttribute("aria-readonly", "true");
          body.blur();
          return;
        }
        const key = event.key.toLowerCase();
        if (!event.altKey && (key === "z" || (key === "y" && !event.shiftKey))) {
          // Typing of its own: the browser's undo of the island, as before.
          if (typedSinceWrite || !hooks.history) return;
          event.preventDefault();
          event.stopPropagation();
          islandHistory(key === "y" || event.shiftKey ? "redo" : "undo");
          return;
        }
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
      });
      body.addEventListener("blur", () => {
        if (!hooks.canEdit()) {
          renderBody();
          body.setAttribute("contenteditable", "false");
          body.setAttribute("aria-readonly", "true");
          return;
        }
        // Already written with the edit across the page cut; this island's
        // slice is gone.
        if (committedAcrossCut) return;
        const pending = idleWrite;
        if (pending !== null) body.ownerDocument.defaultView?.clearTimeout(pending);
        idleWrite = null;
        const edited = editedIsland();
        if (writtenKey(edited) === lastWritten) return;
        if (!hooks.commitBody(note.id, edited.body, edited.rich)) {
          renderBody();
        } else {
          lastWritten = writtenKey(edited);
          typedSinceWrite = false;
        }
      });
    } else {
      body.setAttribute("contenteditable", "false");
      body.setAttribute("aria-readonly", "true");
    }
    row.appendChild(body);
    zone.appendChild(row);
  }
  return zone;
}

/**
 * Make an element a plain-text editing host (Word note-body islands).
 * `plaintext-only` where the engine supports it; assigning an unsupported
 * value throws per spec, so fall back to a normal editable host (paste is
 * committed through the sanitizing store either way).
 */
export function makePlainTextEditable(el: HTMLElement): void {
  try {
    el.contentEditable = "plaintext-only";
  } catch {
    el.contentEditable = "true";
  }
  // jsdom: the property is not a reflected editing-host toggle — force the
  // attribute so tests (and any exotic engine) still see an editable host.
  if (!el.hasAttribute("contenteditable")) {
    el.setAttribute("contenteditable", "true");
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pagedEditing: {
      /** Replace the seam set (one call per committed layout generation). */
      setPagedEditingSeams: (
        seams: PagedEditingSeam[],
        geometry: PagedEditingGeometry | null,
      ) => ReturnType;
      /** Clear all paged-editing chrome (paged mode off / page switch). */
      clearPagedEditing: () => ReturnType;
    };
  }
}

function sanitizeSeams(
  seams: PagedEditingSeam[],
  docSize: number,
): PagedEditingSeam[] {
  return seams
    .filter(
      (seam) =>
        Number.isInteger(seam.pos) &&
        seam.pos >= 0 &&
        seam.pos <= docSize &&
        Number.isInteger(seam.pageIndex) &&
        seam.pageIndex >= 0,
    )
    .map((seam) => ({
      pos: seam.pos,
      pageIndex: seam.pageIndex,
      label: typeof seam.label === "string" && seam.label ? seam.label : null,
      fillPx:
        Number.isFinite(seam.fillPx) && seam.fillPx > 0
          ? Math.min(seam.fillPx, 100_000)
          : 0,
      footnotes: sanitizeSeamNotes(seam.footnotes),
      inTable: seam.inTable === true ? true : undefined,
      blankPages: sanitizeBlankPages(seam.blankPages),
      hardBreak: seam.hardBreak === true ? true : undefined,
    }))
    .sort((a, b) => a.pos - b.pos || a.pageIndex - b.pageIndex);
}

function sanitizeBlankPages(
  value: unknown,
): Array<{ label: string | null }> | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const out: Array<{ label: string | null }> = [];
  // A blank run longer than this is pathological input, not a document.
  for (const item of value.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const label = (item as { label?: unknown }).label;
    out.push({
      label:
        typeof label === "string" && label ? label.slice(0, 32) : null,
    });
  }
  return out.length > 0 ? out : undefined;
}

function blankPagesSignature(
  blanks: Array<{ label: string | null }> | undefined,
): string {
  return (blanks ?? []).map((b) => b.label ?? "\u0000").join("\u0001");
}

function seamNotesSignature(notes: PagedEditingSeamNote[] | undefined): string {
  return (notes ?? [])
    .map((note) => `${note.id}\u0001${note.label}\u0001${note.body}\u0001${note.sliceStart ?? ""}:${note.sliceEnd ?? ""}:${note.continued ? 1 : 0}${note.continues ? 1 : 0}${note.readOnly ? 1 : 0}\u0001${JSON.stringify(note.paragraphFormat ?? null)}\u0001${JSON.stringify(note.paragraphLines ?? null)}`)
    .join("\u0002");
}

function sanitizeSeamNotes(value: unknown): PagedEditingSeamNote[] {
  if (!Array.isArray(value)) return [];
  const out: PagedEditingSeamNote[] = [];
  for (const item of value.slice(0, 200)) {
    if (!item || typeof item !== "object") continue;
    const note = item as Record<string, unknown>;
    if (typeof note.id !== "string" || !note.id) continue;
    const rich = sanitizeFootnoteRichBody(note.rich);
    const body =
      typeof note.body === "string"
        ? note.body.slice(0, MAX_FOOTNOTE_BODY_LENGTH)
        : "";
    const sliceOf = (value: unknown): number | undefined =>
      Number.isInteger(value) && (value as number) >= 0 && (value as number) <= body.length
        ? (value as number)
        : undefined;
    const sliceStart = sliceOf(note.sliceStart);
    const sliceEnd = sliceOf(note.sliceEnd);
    out.push({
      id: note.id.slice(0, 64),
      label: typeof note.label === "string" ? note.label.slice(0, 16) : "",
      body,
      ...(rich ? { rich } : {}),
      ...(sliceStart !== undefined ? { sliceStart } : {}),
      ...(sliceEnd !== undefined ? { sliceEnd } : {}),
      ...(note.continued === true ? { continued: true } : {}),
      ...(note.continues === true ? { continues: true } : {}),
      ...(note.readOnly === true ? { readOnly: true } : {}),
      ...(note.paragraphFormat && typeof note.paragraphFormat === "object"
        ? { paragraphFormat: note.paragraphFormat as FootnoteParagraphFormat }
        : {}),
      ...(Array.isArray(note.paragraphLines)
        ? { paragraphLines: note.paragraphLines as (FootnoteParagraphLine | null)[] }
        : {}),
    });
  }
  return out;
}

function sameSeams(a: PagedEditingSeam[], b: PagedEditingSeam[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (seam, i) =>
        seam.pos === b[i]?.pos &&
        seam.pageIndex === b[i]?.pageIndex &&
        seam.label === b[i]?.label &&
        seam.fillPx === b[i]?.fillPx &&
        (seam.inTable === true) === (b[i]?.inTable === true) &&
        (seam.hardBreak === true) === (b[i]?.hardBreak === true) &&
        blankPagesSignature(seam.blankPages) ===
          blankPagesSignature(b[i]?.blankPages) &&
        seamNotesSignature(seam.footnotes) ===
          seamNotesSignature(b[i]?.footnotes),
    )
  );
}

/**
 * The DOM context a seam widget mounts into, resolved from the CURRENT doc
 * at build time: between top-level blocks ("top"), between the rows of a
 * table ("table"), between the items of a list ("list"). Anything else
 * (e.g. a position mapped inside a paragraph by an edit) hosts NO widget —
 * a block div inside a textblock is the old system's corruption class.
 */
type SeamContext = "top" | "table" | "list";

interface SeamHost {
  context: SeamContext;
  /**
   * Column count of the hosting table (sum of first-row colspans). The seam
   * cell must span EXACTLY this many columns: under `table-layout: fixed`
   * an oversized colspan (e.g. a blanket 1000) DECLARES that many columns,
   * shrinking the real ones to sub-pixel slivers.
   */
  tableColumns: number;
}

function seamHostAt(doc: EditorState["doc"], pos: number): SeamHost | null {
  let parent: ProseMirrorNode;
  try {
    parent = doc.resolve(pos).parent;
  } catch {
    return null;
  }
  const parentType = parent.type.name;
  if (parentType === "doc") return { context: "top", tableColumns: 0 };
  if (parentType === "table") {
    let columns = 0;
    const firstRow = parent.firstChild;
    firstRow?.forEach((cell) => {
      const span = Number((cell.attrs as { colspan?: unknown })?.colspan);
      columns += Number.isInteger(span) && span > 0 ? span : 1;
    });
    return { context: "table", tableColumns: Math.max(1, columns) };
  }
  if (parentType === "bulletList" || parentType === "orderedList") {
    return { context: "list", tableColumns: 0 };
  }
  return null;
}

function seamElement(
  seam: PagedEditingSeam,
  geometry: PagedEditingGeometry,
  terminal: boolean,
  hooks: SeamNoteHooks | null,
  context: SeamContext = "top",
): HTMLElement {
  const el = document.createElement("div");
  el.className = terminal
    ? "paged-edit-seam paged-edit-seam--terminal"
    : "paged-edit-seam";
  if (!terminal && seam.hardBreak) {
    // The next page starts via an explicit break: its first block KEEPS its
    // space-before (Word), so the CSS must not suppress the margin after
    // this seam.
    el.classList.add("paged-edit-seam--hard");
  }
  if (context !== "top") {
    // Inside a table/list the container is narrower than the sheet: the
    // full-bleed negative margins of the top-level seam don't apply — the
    // CSS variant renders a container-width band with IDENTICAL vertical
    // metrics (fill + margin-bottom + gutter + margin-top), so on-screen
    // offsets stay exact.
    el.classList.add(
      context === "table"
        ? "paged-edit-seam--in-table"
        : "paged-edit-seam--in-list",
    );
  }
  el.setAttribute("contenteditable", "false");
  el.setAttribute("data-testid", "paged-edit-seam");
  el.setAttribute("data-page-after", String(seam.pageIndex + 1));
  el.setAttribute("role", "separator");
  el.setAttribute("aria-label", `page ${seam.pageIndex + 1}`);
  el.style.setProperty("--seam-fill", `${seam.fillPx}px`);
  el.style.setProperty("--seam-margin-bottom", `${geometry.marginBottomPx}px`);
  el.style.setProperty(
    "--seam-margin-top",
    terminal ? "0px" : `${geometry.marginTopPx}px`,
  );
  el.style.setProperty(
    "--seam-gutter",
    terminal ? "0px" : `${PAGED_EDIT_GUTTER_PX}px`,
  );
  // Word blank pages riding this seam (parity fillers / double breaks):
  // each renders as a whole empty sheet between the ending page's footer
  // band and the next page's top margin — Word prints them as real pages;
  // fusing them into a neighbor sheet made that sheet run a page tall.
  const blanks = seam.blankPages ?? [];
  const pageHeightPx =
    typeof geometry.pageHeightPx === "number" &&
    Number.isFinite(geometry.pageHeightPx) &&
    geometry.pageHeightPx > 0
      ? geometry.pageHeightPx
      : null;
  if (blanks.length > 0 && pageHeightPx !== null) {
    el.classList.add("paged-edit-seam--has-blanks");
    // A terminal seam normally has no gutter (the surface padding closes the
    // last sheet); with trailing blanks it needs the standard sheet gap.
    el.style.setProperty("--seam-gutter", `${PAGED_EDIT_GUTTER_PX}px`);
    el.style.setProperty(
      "--seam-blank-extra",
      `${blanks.length * (pageHeightPx + PAGED_EDIT_GUTTER_PX)}px`,
    );
    blanks.forEach((blank, i) => {
      const sheet = document.createElement("div");
      sheet.className = "paged-edit-seam__blank";
      sheet.setAttribute("data-testid", "paged-edit-seam-blank");
      sheet.style.top = `calc(var(--seam-break) + var(--seam-gutter) + ${
        i * (pageHeightPx + PAGED_EDIT_GUTTER_PX)
      }px)`;
      sheet.style.height = `${pageHeightPx}px`;
      if (blank.label) {
        const number = document.createElement("span");
        number.className = "paged-edit-seam__blank-number";
        number.textContent = blank.label;
        // Same footer position as a content sheet: 10px under the content
        // edge (page height minus the bottom margin).
        number.style.top = `${pageHeightPx - geometry.marginBottomPx + 10}px`;
        sheet.appendChild(number);
      }
      el.appendChild(sheet);
    });
  }
  // Word 脚注区: this sheet's footnotes above its footer band. Text is
  // rendered via textContent (never HTML). Like Word, each body is edited
  // IN PLACE: a plain-text editable island that commits through the store
  // on blur. The widget's stopEvent keeps ProseMirror away from every event
  // inside the zone, and widget descs always ignore DOM mutations, so
  // typing here can never corrupt the document.
  const zone = buildFootnoteZoneDom(seam.footnotes ?? [], hooks);
  if (zone) el.appendChild(zone);
  if (seam.label) {
    const label = document.createElement("span");
    label.className = "paged-edit-seam__number";
    label.textContent = seam.label;
    el.appendChild(label);
  }
  return el;
}

/**
 * Widget DOM for one seam in its resolved context. A seam whose position
 * sits between TABLE ROWS must not inject a raw div into the tbody (CSS
 * table fix-up would wrap it in an anonymous single-column cell): it renders
 * as a real row — <tr contenteditable=false><td colspan=N> hosting the seam
 * element — so the row flow stays valid DOM and the band spans every column.
 * N is the table's REAL column count: under the editor's
 * `table-layout: fixed` an oversized colspan would itself declare that many
 * columns and crush the data columns to slivers.
 * Between LIST ITEMS a block div is fine — the CSS variant handles width.
 */
function seamWidgetDom(
  seam: PagedEditingSeam,
  geometry: PagedEditingGeometry,
  terminal: boolean,
  hooks: SeamNoteHooks | null,
  host: SeamHost,
): HTMLElement {
  const el = seamElement(seam, geometry, terminal, hooks, host.context);
  if (host.context !== "table") return el;
  const row = document.createElement("tr");
  row.className = "paged-edit-seam-row";
  row.setAttribute("contenteditable", "false");
  row.setAttribute("data-testid", "paged-edit-seam-row");
  const cell = document.createElement("td");
  cell.className = "paged-edit-seam-cell";
  cell.colSpan = Math.max(1, Math.min(1000, host.tableColumns));
  cell.appendChild(el);
  row.appendChild(cell);
  return row;
}

// The PagedEditing seam-decoration Extension (setPagedEditingSeams command,

// pipeline: after the pageBlock+ schema migration nothing feeds seams. The
// helpers above (buildFootnoteZoneDom / makePlainTextEditable and the seam
// DOM builders) stay — NoteEditor's structural sheet overlays and
// structuralPrint consume them directly.
