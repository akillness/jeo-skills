/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { WORD_NOTE_MARK } from "@mrnote/core/web/lib/document-word-count.ts";

import { BOOKMARK_POINT_NODE_NAME } from "@mrnote/core/web/components/console/editor/native-document/bookmarks.ts";
import {
  CAPTION_ANCHOR_ID_ATTR,
  CAPTION_NODE_NAME,
  captionDisplayText,
  collectCaptionsFromDoc,
} from "@mrnote/core/web/components/console/editor/native-document/captions.ts";
import { CROSS_REF_NODE_NAME, liveCrossRefDisplay } from "@mrnote/core/web/components/console/editor/native-document/crossReferenceExtension.tsx";
import { isInlineDrawingNode } from "@mrnote/core/web/components/console/editor/native-document/documentObjectNodes.ts";
import { documentListLabels } from "./documentListLabels";
import { documentIndexPlainText } from "./documentIndexLayout";
import { DOCUMENT_FIELD_NODE_NAME } from "@mrnote/core/web/components/console/editor/native-document/documentFieldValues.ts";
import { documentFieldViewText } from "./documentFieldExtension";
import { FOOTNOTE_MARK_NAME } from "@mrnote/core/web/components/console/editor/native-document/footnotes.ts";
import { isContinuationTail, SPLITTABLE_BLOCK_TYPE } from "@mrnote/core/web/components/console/editor/native-document/paged/blockSplitting.ts";
import { PAGE_BLOCK_NODE } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { measurementRange } from "@mrnote/core/web/components/console/editor/native-document/paged/measurementRange.ts";
import { TABLE_REPEATED_HEADER_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";

/**
 * Word's Word Count dialog (Review > Word Count; "Show the word count",
 * Microsoft Support): Pages, Words, Characters (no spaces), Characters (with
 * spaces), Paragraphs, Lines, for the selection when there is one, else for
 * the document, and "Include textboxes, footnotes and endnotes", which adds
 * or removes the text in text boxes and in the notes from every count.
 */

const TEXT_BOX_NODES = new Set(["textBox"]);

/**
 * The text Word counts: every text block in order, one per line, leaving
 * out text boxes unless `includeTextBoxes`, and adding the footnote and
 * endnote bodies (for the whole document) when `notes` is given.
 */
export function wordCountText(
  doc: ProseMirrorNode,
  options: {
    includeTextBoxes: boolean;
    range?: { from: number; to: number } | null;
     
    ranges?: ReadonlyArray<{ from: number; to: number }> | null;
    notes?: readonly string[];
  },
): string {
  if (options.ranges?.length) {
    const parts = options.ranges.map((range) =>
      wordCountText(doc, { includeTextBoxes: options.includeTextBoxes, range }),
    );
    if (options.notes) parts.push(...options.notes.map(countedNoteBody));
    return parts.join("\n");
  }
  const from = Math.max(0, options.range?.from ?? 0);
  const to = Math.min(doc.content.size, options.range?.to ?? doc.content.size);
  const blocks: string[] = [];
  // Word counts a list's number or bullet as its text plus a tab, when the
  // count starts at or before the paragraph's start ("1." is a word, the
  // tab a character with spaces); a selection from inside it does not.
  const labels = documentListLabels(doc);
  // The text block last counted, so a page-split continuation joins it.
  let lastBlock: ProseMirrorNode | null = null;
  // Each caption's live number, collected once for every caption counted.
  let captions: Map<string, ReturnType<typeof collectCaptionsFromDoc>[number]> | null = null;
  doc.nodesBetween(from, to, (node, pos) => {
    // A caption is a paragraph in Word ("Figure 1: Sales"): its prefix and
    // description count, though the atom holds no text of its own.
    if (node.type.name === CAPTION_NODE_NAME) {
      captions ??= new Map(collectCaptionsFromDoc(doc).map((entry) => [entry.id, entry]));
      const id = String(node.attrs?.[CAPTION_ANCHOR_ID_ATTR] ?? "");
      blocks.push(captionDisplayText(node.attrs, captions.get(id)));
      lastBlock = null;
      return false;
    }
    if (!options.includeTextBoxes && TEXT_BOX_NODES.has(node.type.name)) {
      return false;
    }
    // A header row the page repeats at the top of a table's next page is a
    // read-only copy of the source row: its words are counted once, where
    // the row is (67 words for 63 once a header repeated).
    if (node.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) return false;
    // The Text Box command makes a shape atom whose words are its `text`
    
    if (node.type.name === "documentShape") {
      if (
        options.includeTextBoxes &&
        node.attrs?.isTextBox === true &&
        typeof node.attrs.text === "string" &&
        node.attrs.text !== ""
      ) {
        blocks.push(node.attrs.text);
        lastBlock = null;
      }
      return false;
    }
    if (node.isTextblock) {
      const start = Math.max(0, from - pos - 1);
      const end = Math.min(node.content.size, to - pos - 1);
      let text = end > start ? countedBlockText(doc, node, pos, start, end) : "";
      // An empty numbered paragraph still shows (and counts) its number.
      const label = start === 0 && to > pos + 1 ? labels.get(pos) : undefined;
      if (label !== undefined) text = `${label}\t${text}`;
      // A paragraph the page edge cut is still ONE paragraph: its tail on
      // the next page re-joins the head (a code block over the newline the
      
      // three pages counted three paragraphs and two extra characters).
      if (
        lastBlock !== null &&
        blocks.length > 0 &&
        isContinuationTail(node) &&
        lastBlock.type === node.type
      ) {
        const joiner = node.type.name === SPLITTABLE_BLOCK_TYPE ? "\n" : "";
        blocks[blocks.length - 1] += joiner + text;
      } else {
        blocks.push(text);
      }
      lastBlock = node;
      return false;
    }
    return true;
  });
  if (options.notes) blocks.push(...options.notes.map(countedNoteBody));
  return blocks.join("\n");
}







function countedBlockText(
  doc: ProseMirrorNode,
  block: ProseMirrorNode,
  blockPos: number,
  start: number,
  end: number,
): string {
  let text = "";
  block.nodesBetween(start, end, (child, offset) => {
    if (child.isText) {
      const from = Math.max(start, offset) - offset;
      const to = Math.min(end, offset + child.nodeSize) - offset;
      text += child.text?.slice(from, to) ?? "";
      return false;
    }
    if (child.isLeaf) {
      const pos = blockPos + 1 + offset;
      const shown =
        child.type.name === CROSS_REF_NODE_NAME
          ? (liveCrossRefDisplay(doc, pos, child.attrs) ??
            (typeof child.attrs?.label === "string" ? child.attrs.label : null))
          : child.type.name === DOCUMENT_FIELD_NODE_NAME && child.attrs?.fieldType === "INDEX"
            ? // The entries the index shows, not its cached summary (WUA 126).
              documentIndexPlainText(doc, child.attrs.options)
            : child.type.name === "ruby"
              ? // A phonetic guide's base is the words themselves; the guide
                // over them is not counted (WUA 184).
                (typeof child.attrs?.base === "string" ? child.attrs.base : null)
              : child.type.name === DOCUMENT_FIELD_NODE_NAME
                ? // The result the field shows on the page -- NUMPAGES' "2",
                  // PAGE's number, SEQ's live count -- not the placeholder
                  // its cache holds ("[NUMPAGES]" counted 9 extra
                  // characters; WUA 126).
                  documentFieldViewText(doc, pos, child.attrs as Record<string, unknown>)
                : null;
      text += shown ?? countedAtomText(child);
      return false;
    }
    if (child.isBlock && text.length > 0) text += "\n";
    return true;
  });
  return text;
}

/**
 * What Word counts for an inline object that shows no text of its own (Word
 * 16.86, `compute statistics` on each alone and between two letters): a
 * footnote or endnote reference mark is one character and no word, and splits
 * the words around it; a picture, chart or shape in line with the text is
 * nothing at all ("a<picture>b" is one word of two characters); a line break
 * is a space. Invisible markers (a point bookmark, an imported page boundary)
 * are nothing.
 */
function countedAtomText(node: ProseMirrorNode): string {
  const name = node.type.name;
  if (name === FOOTNOTE_MARK_NAME) return WORD_NOTE_MARK;
  if (isInlineDrawingNode(node) || name === BOOKMARK_POINT_NODE_NAME || name === "sourcePageBreak" || name === "rangePermission")
    return "";
  return " ";
}

/** A note's text as Word counts it: the note's own mark starts it. */
function countedNoteBody(body: string): string {
  return `${WORD_NOTE_MARK}${body}`;
}







export function documentNoteBodies(doc: ProseMirrorNode): string[] {
  const store = doc.attrs.footnotes;
  if (!Array.isArray(store)) return [];
  const referenced = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === FOOTNOTE_MARK_NAME) {
      const id = node.attrs?.noteId;
      if (typeof id === "string" && id) referenced.add(id);
      return false;
    }
    return !node.isLeaf;
  });
  return store.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { id, body } = entry as { id?: unknown; body?: unknown };
    return typeof body === "string" && typeof id === "string" && referenced.has(id)
      ? [body]
      : [];
  });
}

const PARITY_BLANK_SELECTOR = '[data-page-parity-blank="true"]';

/**
 * The blank pages on `surface`. They are drawn beside the editor, never in it, and
 * this is asked after every transaction: only what stands around `editor` is
 * searched, not the document's every element.
 */
export function parityBlanksIn(surface: ParentNode | null | undefined, editor?: ParentNode | null): Element[] {
  if (!surface?.querySelectorAll) return [];
  if (!editor || editor === surface || !("parentElement" in editor) || !(surface as Node).contains?.(editor as Node)) {
    return Array.from(surface.querySelectorAll(PARITY_BLANK_SELECTOR));
  }
  const found: Element[] = [];
  for (let inner = editor as Element; inner !== surface && inner.parentElement; inner = inner.parentElement) {
    for (let other = inner.parentElement.firstElementChild; other; other = other.nextElementSibling) {
      if (other === inner) continue;
      if (other.matches(PARITY_BLANK_SELECTOR)) found.push(other);
      found.push(...Array.from(other.querySelectorAll(PARITY_BLANK_SELECTOR)));
    }
  }
  return found;
}

/**
 * Pages as the page ledger lays them out: one page block per sheet, and the
 * blank page an odd- or even-page section break leaves before a sheet --
 * the pages NUMPAGES counts in the page's own footer ("3 / 3"). The
 * statistics counted only the sheets and said 2 (WUA 216).
 */
export function documentPageCount(doc: ProseMirrorNode, root?: ParentNode | null): number {
  // (the surface: a blank page is drawn over it, not in the editor)
  let pages = 0;
  doc.forEach((node) => {
    if (node.type.name === PAGE_BLOCK_NODE) pages += 1;
  });
  const surface =
    root && "closest" in root
      ? ((root as Element).closest('[data-testid="note-editor-page-surface"]') ?? root)
      : root;
  const blanks = parityBlanksIn(surface, root).length;
  if (pages > 0) return pages + blanks;
  const sheets = root?.querySelectorAll?.("article[data-page-sheet]").length ?? 0;
  return Math.max(1, sheets + blanks);
}

const LINE_BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, pre";

/**
 * Lines as the page draws them: each text block's rendered line boxes (a
 * block with no text is one line, as Word counts an empty paragraph). Text
 * boxes are left out unless `includeTextBoxes`; `range`, when given, limits
 * the count to the blocks it touches.
 */
export function renderedLineCount(
  root: HTMLElement,
  options: { includeTextBoxes: boolean; range?: Range | null },
): number {
  let lines = 0;
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(LINE_BLOCK_SELECTOR));
  for (const block of blocks) {
    // A block nested in another counted block is counted with it.
    if (block.parentElement?.closest(LINE_BLOCK_SELECTOR)) continue;
    // The page's repeated copy of a table header row is not more lines.
    if (block.closest('tr[data-page-table-repeated-header="true"]')) continue;
    if (
      !options.includeTextBoxes &&
      block.closest("[data-text-box]")
    ) {
      continue;
    }
    if (options.range && !options.range.intersectsNode(block)) continue;
    const measure = measurementRange(block.ownerDocument, "wordCount");
    measure.selectNodeContents(block);
    // A selection counts the lines IT covers, not every line of the
    // paragraphs it touches (Word's Word Count on a selection).
    const range = options.range;
    if (range) {
      if (range.compareBoundaryPoints(Range.START_TO_START, measure) > 0) {
        measure.setStart(range.startContainer, range.startOffset);
      }
      if (range.compareBoundaryPoints(Range.END_TO_END, measure) < 0) {
        measure.setEnd(range.endContainer, range.endOffset);
      }
      // Touching a paragraph's edge selects none of its lines.
      if (measure.collapsed && (block.textContent ?? "") !== "") continue;
    }
    const rects = Array.from(
      typeof measure.getClientRects === "function" ? measure.getClientRects() : [],
    ).filter(
      (rect) => rect.width > 0 || rect.height > 0,
    );
    if (rects.length === 0) {
      lines += 1;
      continue;
    }
    lines += Math.max(1, lineBoxCount(rects));
  }
  return lines;
}

/**
 * How many laid-out lines a block's glyph boxes stand on. Boxes of one line
 * overlap vertically even when their bottoms differ (a superscript, a note
 * reference, a larger run); boxes of successive lines at most touch. A box
 * joins a line when it overlaps one of that line's boxes by at least half the
 * shorter of the two.
 */
export function lineBoxCount(
  rects: ReadonlyArray<Pick<DOMRect, "top" | "bottom">>,
): number {
  const lineBoxes: Array<Array<Pick<DOMRect, "top" | "bottom">>> = [];
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  for (const rect of sorted) {
    const height = Math.max(1, rect.bottom - rect.top);
    const line = lineBoxes.find((boxes) =>
      boxes.some((box) => {
        if (rect.bottom <= rect.top) {
          return rect.top >= box.top && rect.top <= box.bottom;
        }
        const overlap =
          Math.min(box.bottom, rect.bottom) - Math.max(box.top, rect.top);
        return overlap >= Math.min(height, Math.max(1, box.bottom - box.top)) / 2;
      }),
    );
    if (line) line.push(rect);
    else lineBoxes.push([rect]);
  }
  return lineBoxes.length;
}
