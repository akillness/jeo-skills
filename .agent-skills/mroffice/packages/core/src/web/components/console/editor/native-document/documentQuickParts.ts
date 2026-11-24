"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Quick Parts (Word's building blocks) saved IN THE DOCUMENT.
 *
 * Word's "Create New Building Block" dialog (Insert > Quick Parts > Save
 * Selection to Quick Part Gallery; Microsoft Support "Use Quick Parts and
 * AutoText"): Name, Gallery (Quick Parts, AutoText, ...), Category (General
 * or a new one), Description, Save in (a template, or here: this document),
 * and Options — "Insert content only", "Insert content in its own
 * paragraph", "Insert content in its own page" (`w:docPartPr/w:behaviors`:
 * content, p, pg).
 *
 * Carried on `doc.attrs.quickParts` (closed, bounded list) so the gallery
 * survives reload and travels with the document; the content is the
 * selection's TipTap JSON, re-inserted through the editor schema.
 */

import { useEffect, useState } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { FOOTNOTE_MARK_NAME, footnoteIdFor, sanitizeFootnoteBody, sanitizeFootnoteId, sanitizeFootnoteRichBody, type FootnoteEntry, type FootnoteRichBody } from "./footnotes";
import { readFootnotes } from "./footnoteExtension";

export const QUICK_PART_GALLERIES = [
  "quickParts",
  "autoText",
  "coverPages",
  "equations",
  "footers",
  "headers",
  "pageNumbers",
  "tableOfContents",
  "tables",
  "textBoxes",
  "watermarks",
] as const;
export type QuickPartGallery = (typeof QUICK_PART_GALLERIES)[number];

export const QUICK_PART_BEHAVIORS = ["content", "paragraph", "page"] as const;
export type QuickPartBehavior = (typeof QUICK_PART_BEHAVIORS)[number];

export const MAX_DOCUMENT_QUICK_PARTS = 100;
const MAX_QUICK_PART_TEXT = 120;
const MAX_QUICK_PART_DESCRIPTION = 500;
const MAX_QUICK_PART_CONTENT_CHARS = 200_000;
const QUICK_PART_ID_RE = /^qp_[a-z0-9_]{1,40}$/;

export interface DocumentQuickPart {
  id: string;
  name: string;
  gallery: QuickPartGallery;
  category: string;
  description: string;
  behavior: QuickPartBehavior;
  content: JSONContent[];
  /**
   * The notes the content's footnote / endnote references point at, as they
   * read when the part was saved. A part saved only the references, so once
   * the original note was deleted an inserted part dangled and the export
   * refused the document (OFL-037); inserting a part now mints a fresh note
   * per reference from these (Word gives each reference its own note).
   */
  notes?: DocumentQuickPartNote[];
}

export interface DocumentQuickPartNote {
  id: string;
  body: string;
  rich?: FootnoteRichBody;
}

const MAX_QUICK_PART_NOTES = 64;

function normalizeQuickPartNotes(value: unknown): DocumentQuickPartNote[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: DocumentQuickPartNote[] = [];
  for (const raw of value.slice(0, MAX_QUICK_PART_NOTES)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const note = raw as Record<string, unknown>;
    const id = sanitizeFootnoteId(note.id);
    if (!id || out.some((entry) => entry.id === id)) continue;
    const rich = sanitizeFootnoteRichBody(note.rich);
    out.push({ id, body: sanitizeFootnoteBody(note.body), ...(rich ? { rich } : {}) });
  }
  return out.length > 0 ? out : undefined;
}

/** The note ids the content's references name, in order, once each. */
export function quickPartNoteIds(content: readonly JSONContent[]): string[] {
  const ids: string[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === FOOTNOTE_MARK_NAME) {
      const id = sanitizeFootnoteId((node.attrs as Record<string, unknown> | undefined)?.noteId);
      if (id && !ids.includes(id)) ids.push(id);
    }
    node.content?.forEach(walk);
  };
  content.forEach(walk);
  return ids;
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

export function normalizeDocumentQuickPart(value: unknown): DocumentQuickPart | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = typeof source.id === "string" && QUICK_PART_ID_RE.test(source.id)
    ? source.id
    : null;
  const name = cleanText(source.name, MAX_QUICK_PART_TEXT);
  if (!id || !name || !Array.isArray(source.content) || source.content.length === 0) {
    return null;
  }
  let content: JSONContent[];
  try {
    const serialized = JSON.stringify(source.content);
    if (serialized.length > MAX_QUICK_PART_CONTENT_CHARS) return null;
    content = JSON.parse(serialized) as JSONContent[];
  } catch {
    return null;
  }
  if (!content.every((node) => node && typeof node === "object" && typeof node.type === "string")) {
    return null;
  }
  return {
    id,
    name,
    gallery: (QUICK_PART_GALLERIES as readonly unknown[]).includes(source.gallery)
      ? (source.gallery as QuickPartGallery)
      : "quickParts",
    category: cleanText(source.category, MAX_QUICK_PART_TEXT) || "General",
    description: cleanText(source.description, MAX_QUICK_PART_DESCRIPTION),
    behavior: (QUICK_PART_BEHAVIORS as readonly unknown[]).includes(source.behavior)
      ? (source.behavior as QuickPartBehavior)
      : "content",
    content,
    ...(normalizeQuickPartNotes(source.notes) ? { notes: normalizeQuickPartNotes(source.notes)! } : {}),
  };
}

/** Closed list normalizer; null for an empty or absent store. */
export function normalizeDocumentQuickParts(
  value: unknown,
): DocumentQuickPart[] | null {
  if (!Array.isArray(value)) return null;
  const out: DocumentQuickPart[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    const part = normalizeDocumentQuickPart(raw);
    if (!part || ids.has(part.id)) continue;
    ids.add(part.id);
    out.push(part);
    if (out.length >= MAX_DOCUMENT_QUICK_PARTS) break;
  }
  return out.length > 0 ? out : null;
}

export function newQuickPartId(): string {
  return `qp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Word's default Options for a selection: text inside one paragraph inserts
 * as content only; a selection that takes whole paragraphs (their marks)
 * inserts in its own paragraph.
 */
export function defaultQuickPartBehavior(editor: Editor): QuickPartBehavior {
  const { selection } = editor.state;
  // Cells of a table, or a block object, are whole blocks of their own.
  if (
    selection instanceof CellSelection ||
    (selection instanceof NodeSelection && selection.node.isBlock)
  ) {
    return "paragraph";
  }
  const { $from, $to } = selection;
  const wholeParagraphs =
    $from.parentOffset === 0 &&
    $to.parentOffset === $to.parent.content.size &&
    !$from.sameParent($to);
  return wholeParagraphs ? "paragraph" : "content";
}

/** The selection's content as the JSON a quick part stores. */
/**
 * The notes a part's content refers to, read from the document's store at
 * save time (a reference whose note is already gone is left out: there is
 * nothing to carry).
 */
export function quickPartNotesForContent(editor: Editor, content: readonly JSONContent[]): DocumentQuickPartNote[] {
  const ids = quickPartNoteIds(content);
  if (ids.length === 0) return [];
  const store = readFootnotes(editor.state.doc);
  return ids.flatMap((id) => {
    const note = store.find((entry) => entry.id === id);
    return note ? [{ id, body: note.body, ...(note.rich ? { rich: note.rich } : {}) }] : [];
  });
}

/**
 * The part's content with a fresh note behind every footnote / endnote
 * reference: Word gives each reference its own note, so the inserted copy
 * never shares (or dangles on) the original. A reference whose note neither
 * the document nor the part knows is dropped rather than left dangling.
 * Returns the rewritten content and the notes to add to the store.
 */
export function quickPartContentWithFreshNotes(
  part: Pick<DocumentQuickPart, "content" | "notes">,
  store: readonly FootnoteEntry[],
): { content: JSONContent[]; notes: DocumentQuickPartNote[] } {
  const ids = quickPartNoteIds(part.content);
  if (ids.length === 0) return { content: part.content, notes: [] };
  const fresh = new Map<string, string | null>();
  const notes: DocumentQuickPartNote[] = [];
  for (const id of ids) {
    const source = store.find((entry) => entry.id === id) ?? part.notes?.find((entry) => entry.id === id) ?? null;
    if (!source) {
      fresh.set(id, null);
      continue;
    }
    const next = footnoteIdFor();
    fresh.set(id, next);
    notes.push({ id: next, body: source.body, ...(source.rich ? { rich: source.rich } : {}) });
  }
  const rewrite = (node: JSONContent): JSONContent | null => {
    if (node.type === FOOTNOTE_MARK_NAME) {
      const id = sanitizeFootnoteId((node.attrs as Record<string, unknown> | undefined)?.noteId);
      const next = id ? fresh.get(id) : null;
      if (!next) return null;
      return { ...node, attrs: { ...(node.attrs ?? {}), noteId: next } };
    }
    if (!node.content) return node;
    return { ...node, content: node.content.map(rewrite).filter((child): child is JSONContent => child !== null) };
  };
  return {
    content: part.content.map(rewrite).filter((node): node is JSONContent => node !== null),
    notes,
  };
}

export function quickPartContentFromSelection(editor: Editor): JSONContent[] {
  const { selection, doc } = editor.state;
  if (selection.empty) return [];
  const nodes: JSONContent[] = [];
  if (selection instanceof CellSelection) {
    // The selected cells as a table (Word saves the selected rows/cells as
    // a table). The range from the first cell to the last held only the last
    
    selection.content().content.forEach((node) => {
      nodes.push(node.toJSON() as JSONContent);
    });
    if (nodes.length > 0 && nodes.every((node) => node.type === "tableRow")) {
      const table = selection.$anchorCell.node(-1);
      return [{ ...(table.toJSON() as JSONContent), content: nodes }];
    }
    return nodes;
  }
  doc.slice(selection.from, selection.to).content.forEach((node) => {
    // A selection across pages is its pages' blocks, not the page frames.
    if (node.type.name === "pageBlock") {
      node.content.forEach((child) => {
        nodes.push(child.toJSON() as JSONContent);
      });
      return;
    }
    nodes.push(node.toJSON() as JSONContent);
  });
  return nodes;
}

/**
 * The content to insert for a part's Options: "content only" unwraps a
 * single paragraph into its runs (so it joins the paragraph at the caret);
 * "own paragraph" keeps whole paragraphs; "own page" puts page breaks
 * before and after.
 */
export function quickPartInsertion(
  part: Pick<DocumentQuickPart, "content" | "behavior">,
  /** Whether a node type is in-line content (the editor schema's answer). */
  isInline: (type: string) => boolean = (type) => type === "text" || type === "hardBreak",
): {
  content: JSONContent[];
  atBlockBoundary: boolean;
} {
  // A run of in-line content (text in its marks, fields, in-line objects) is
  // ONE paragraph: wrapping each text node on its own split a paragraph with
  
  const blocks: JSONContent[] = [];
  let line: JSONContent[] | null = null;
  for (const node of part.content) {
    if (node.type && isInline(node.type)) {
      if (!line) {
        line = [];
        blocks.push({ type: "paragraph", content: line });
      }
      line.push(node);
    } else {
      line = null;
      blocks.push(node);
    }
  }
  if (part.behavior === "content") {
    const only = part.content.length === 1 ? part.content[0] : null;
    if (only?.type === "paragraph") {
      return { content: only.content ?? [], atBlockBoundary: false };
    }
    return { content: part.content, atBlockBoundary: false };
  }
  const paragraphs = blocks;
  if (part.behavior === "page") {
    return {
      content: [{ type: "pageBreak" }, ...paragraphs, { type: "pageBreak" }],
      atBlockBoundary: true,
    };
  }
  return { content: paragraphs, atBlockBoundary: true };
}

/** The document's quick parts, re-read on every update. */
export function useDocumentQuickParts(editor: Editor): DocumentQuickPart[] {
  const read = () =>
    normalizeDocumentQuickParts(
      (editor.state?.doc?.attrs as { quickParts?: unknown } | undefined)?.quickParts,
    ) ?? [];
  const [parts, setParts] = useState<DocumentQuickPart[]>(read);
  useEffect(() => {
    const refresh = () => {
      const next = read();
      setParts((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    refresh();
    editor.on("update", refresh);
    return () => {
      editor.off("update", refresh);
    };
    // `read` closes over `editor` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
  return parts;
}
