/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  CAPTION_CHAPTER_SEPARATORS,
  CAPTION_NODE_NAME,
  CAPTION_SEPARATORS,
  collectCaptionsFromDoc,
  createCaptionNumberingState,
  nextCaptionNumber,
  observeCaptionHeading,
  observeSeqField,
  type CaptionChapterSeparator,
  formatCaptionNumber,
  normalizeCaptionAttributes,
  normalizeCaptionNumberFormat,
  sanitizeCaptionLabel,
  seqFieldIdentifier,
  seqIdentifierCaptionLabel,
  type CaptionSeparator,
  type DocCaption,
} from "./captions";

/**
 * FIELD CAPTIONS: the captions of an imported Word document.
 *
 * In a Word file a caption is an ordinary paragraph holding a SEQ field:
 * "Figure " + { SEQ Figure } + " A cat". The importer keeps it exactly so (it
 * round-trips byte for byte), which left such captions outside everything the
 * editor does with captions: the Caption dialog's label list, the Table of
 * Figures, cross-references and the running numbers. This module reads those
 * paragraphs as the captions they are, without changing how they are stored.
 */

/** Ids of field captions; never collides with a caption node's anchor id. */
export const FIELD_CAPTION_ID_PREFIX = "seqcap-";

export function isFieldCaptionId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(FIELD_CAPTION_ID_PREFIX);
}

export interface FieldCaption extends DocCaption {
  fieldCaption: true;
  /** Position of the caption paragraph. */
  pos: number;
  /** Content range of the paragraph. */
  from: number;
  to: number;
  /** Position just after the SEQ field ("Figure 1" ends here). */
  labelEnd: number;
  /** Start of the caption text after the separator. */
  textStart: number;
}

function leadingSeparator(text: string): CaptionSeparator {
  for (const separator of CAPTION_SEPARATORS) {
    if (separator && separator !== " " && text.startsWith(separator)) return separator;
  }
  // A separator typed without its space ("Figure 1:A cat").
  const bare = text.match(/^[:.]/)?.[0];
  if (bare === ":") return ": ";
  if (bare === ".") return ". ";
  return text.startsWith(" ") ? " " : "";
}

interface Walk {
  /** In document order: a caption node, or a field caption. */
  order: Array<{ native: true } | { native: false; caption: FieldCaption }>;
  /** SEQ field position → its live number. */
  numberAt: Map<number, number>;
}








const walks = new WeakMap<ProseMirrorNode, Walk>();

function walk(doc: ProseMirrorNode): Walk {
  const known = walks.get(doc);
  if (known) return known;
  const made = walkDocument(doc);
  walks.set(doc, made);
  return made;
}

function walkDocument(doc: ProseMirrorNode): Walk {
  let hasPageBlocks = false;
  doc.forEach((child) => {
    if (child.type.name === "pageBlock") hasPageBlocks = true;
  });
  let page = hasPageBlocks ? 0 : 1;
  // One numbering with the caption blocks (`collectCaptions`), so both read
  // every caption alike: per label, restarting at headings where a SEQ says.
  const numbering = createCaptionNumberingState();
  const headingNumberingEnabled = doc.attrs?.headingNumbering === true;
  const order: Walk["order"] = [];
  const numberAt = new Map<number, number>();
  doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name === "pageBlock") page += 1;
    else if (!hasPageBlocks && (name === "pageBreak" || name === "sourcePageBreak")) page += 1;
    if (name === "heading") observeCaptionHeading(numbering, node.attrs?.level);
    if (name === CAPTION_NODE_NAME) {
      nextCaptionNumber(numbering, normalizeCaptionAttributes(node.attrs), headingNumberingEnabled);
      order.push({ native: true });
      return false;
    }
    if (!node.isTextblock) return true;
    const found: { caption: FieldCaption | null } = { caption: null };
    // A chapter-numbered caption: "Figure " STYLEREF "-" SEQ … (Word's
    // Insert Caption with Include chapter number).
    let chapter: { at: number; number: string } | null = null;
    node.forEach((child, offset) => {
      if (child.type.name === "documentField" && child.attrs?.fieldType === "STYLEREF" && !found.caption) {
        chapter = {
          at: offset,
          number: typeof child.attrs?.cachedValue === "string" ? child.attrs.cachedValue : "",
        };
        return;
      }
      const label = seqIdentifierCaptionLabel(seqFieldIdentifier(child.attrs));
      if (child.type.name !== "documentField" || !label) return;
      const fieldPos = pos + 1 + offset;
      const number = observeSeqField(numbering, child.attrs);
      if (number === null) return;
      numberAt.set(fieldPos, number);
      // The paragraph's first SEQ field is the caption's number.
      if (found.caption) return;
      const chapterPart = chapter as { at: number; number: string } | null;
      const labelEnd = chapterPart ? chapterPart.at : offset;
      const before = node.textBetween(0, labelEnd, "", "").replace(/\s+/g, " ").trim();
      const chapterSeparator = chapterPart
        ? node.textBetween(chapterPart.at + 1, offset, "", "").trim()
        : "";
      const afterStart = offset + child.nodeSize;
      const after = node.textBetween(afterStart, node.content.size, "", "");
      const separator = leadingSeparator(after);
      const skipped = after.length - after.replace(/^[\s:.\-–—]+/, "").length;
      const blockId = node.attrs?.block_id;
      found.caption = {
        fieldCaption: true,
        kind: label.kind,
        // The words the document itself shows before the number.
        labelName: before || label.labelName,
        number,
        label: sanitizeCaptionLabel(after.slice(skipped)),
        id: `${FIELD_CAPTION_ID_PREFIX}${typeof blockId === "string" && blockId ? blockId : `p${pos}`}`,
        pageNumber: Math.max(1, page),
        numberFormat: normalizeCaptionNumberFormat(child.attrs?.format),
        excludeLabel: before === "",
        separator,
        position: "below",
        ...(chapterPart
          ? {
              includeChapterNumber: true,
              chapterNumber: chapterPart.number,
              chapterSeparator: (CAPTION_CHAPTER_SEPARATORS as readonly string[]).includes(chapterSeparator)
                ? (chapterSeparator as CaptionChapterSeparator)
                : "-",
            }
          : {}),
        pos,
        from: pos + 1,
        to: pos + 1 + node.content.size,
        labelEnd: fieldPos + child.nodeSize,
        textStart: Math.min(pos + 1 + node.content.size, pos + 1 + afterStart + skipped),
      };
    });
    if (found.caption) order.push({ native: false, caption: found.caption });
    return false;
  });
  return { order, numberAt };
}

/** The imported (SEQ paragraph) captions of the document, in order. */
export function collectFieldCaptions(doc: ProseMirrorNode): FieldCaption[] {
  return walk(doc).order.flatMap((entry) => (entry.native ? [] : [entry.caption]));
}

/**
 * Every caption of the document in document order: caption blocks and
 * imported SEQ-paragraph captions, numbered in one sequence per label.
 */
export function collectAllCaptions(doc: ProseMirrorNode): DocCaption[] {
  const natives = collectCaptionsFromDoc(doc);
  let next = 0;
  const all: DocCaption[] = [];
  for (const entry of walk(doc).order) {
    if (entry.native) {
      const caption = natives[next];
      next += 1;
      if (caption) all.push(caption);
    } else {
      all.push(entry.caption);
    }
  }
  return all;
}

export function findFieldCaption(doc: ProseMirrorNode, id: unknown): FieldCaption | null {
  if (!isFieldCaptionId(id)) return null;
  return collectFieldCaptions(doc).find((caption) => caption.id === id) ?? null;
}







export function liveSeqFieldText(
  doc: ProseMirrorNode,
  fieldPos: number,
  format: unknown,
): string | null {
  const field = doc.nodeAt(fieldPos);
  if (field?.attrs?.locked === true) {
    return typeof field.attrs.cachedValue === "string" ? field.attrs.cachedValue : "";
  }
  const number = walk(doc).numberAt.get(fieldPos);
  return number === undefined
    ? null
    : formatCaptionNumber(normalizeCaptionNumberFormat(format), number);
}

/**
 * How many of the document's captions (caption blocks and imported ones)
 * start before `pos`: a caption inserted there takes the number after theirs,
 * which the Caption dialog shows before it is inserted.
 */
export function captionsBefore(doc: ProseMirrorNode, pos: number): number {
  let count = 0;
  doc.descendants((node, nodePos) => {
    if (nodePos >= pos) return false;
    if (node.type.name === CAPTION_NODE_NAME) {
      count += 1;
      return false;
    }
    return true;
  });
  return count + collectFieldCaptions(doc).filter((caption) => caption.pos < pos).length;
}

