"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Data-bound content controls (Word's `w:dataBinding`) that map ONE store
 * node show ONE value, as Word shows them.
 *
 * Word, per Microsoft's documentation of content controls bound to custom
 * XML parts (Microsoft Learn, "Content controls"; Word VBA "XMLMapping"):
 * "If a user edits text in the control, the corresponding XML elements are
 * automatically updated. Similarly, if element values in the custom XML
 * parts are changed, the content controls that are bound to the XML elements
 * will display the new data." Quick Parts > Document Property inserts such a
 * control (core Title, Subject, Author...): typing a new title on a cover
 * changes the Title in the heading and the header too. What Word refreshes
 * is the text; each control keeps its own character format (a plain text
 * control has one format over all its words; a bound rich text control is
 * read as plain text, MS-OI29500 17.5.2.6). A single-line plain text or rich
 * text control shows a multi-line value with its lines joined; one that
 * allows carriage returns shows the breaks (Word 16.86, corpus R31-D06; the
 * server's `data_binding._typed_text`).
 *
 * The import names each bound control's node with a token (the mark's
 * `binding`; `data_binding.binding_token`). When a transaction changes the
 * words of one bound control, this writes the same words into every other
 * control of that token, in the same transaction the history groups with
 * the edit -- one Undo takes both back. The save then finds the page as
 * Word's refresh leaves the file (FIXQUEUE 232, corpus R424-D05: the title
 * typed on a cover was refused, the heading's Title control changed by the
 * save with no edit of the page asking for it).
 *
 * Not refreshed here, as the server's refresh leaves them to it: controls
 * other than plain and rich text (a date or list control shows the node in
 * its own picture or item), a control whose words are under Track Changes,
 * a control whose pieces are not one run of words, an emptied control (it
 * shows its placeholder prompt), and Word's own header and footer parts,
 * whose bound controls the story editor shows as read-only atoms and the
 * reading refreshes from the store whenever the document is opened.
 */

import type { Mark as ProseMirrorMark, MarkType, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import {
  CONTENT_CONTROL_MARK_NAME,
  controlMetaToAttrs,
  sanitizeControlKey,
  type ContentControlMeta,
} from "@mrnote/core/web/components/console/editor/native-document/contentControls.ts";
import { collectContentControlRanges } from "./contentControlExtension";

/** Control types whose words are the node's value as it stands. */
const SYNCED_TYPES: ReadonlySet<string> = new Set(["text", "richText"]);
const REVISION_MARKS: ReadonlySet<string> = new Set(["trackInsertion", "trackDeletion"]);
const HARD_BREAK = "hardBreak";

/** One bound control in a document: its span and its words. */
interface BoundControl {
  key: string;
  /** The store node (the token without its paragraph flag). */
  binding: string;
  meta: ContentControlMeta;
  mark: ProseMirrorMark;
  from: number;
  to: number;
  text: string;
}

/** The token's trailing flag: the control is its whole paragraph (a
 * block-level `w:sdt`; `data_binding.binding_token`). */
const WHOLE_PARAGRAPH_FLAG = "p";

function revised(doc: ProseMirrorNode, from: number, to: number): boolean {
  let found = false;
  doc.nodesBetween(from, to, (node) => {
    if (node.marks.some((mark) => REVISION_MARKS.has(mark.type.name))) found = true;
    return !found;
  });
  return found;
}

/**
 * A block-level control's words: all of its paragraph's (Word's control is
 * the paragraph, so words typed at its end are the control's too), or null
 * when the paragraph holds more than words and line breaks, or another
 * control.
 */
function paragraphControl(doc: ProseMirrorNode, at: number, key: string): { from: number; to: number; text: string } | null {
  const $at = doc.resolve(at);
  const paragraph = $at.parent;
  if (!paragraph.isTextblock) return null;
  let text = "";
  let plain = true;
  paragraph.forEach((child) => {
    const other = child.marks.find(
      (mark) => mark.type.name === CONTENT_CONTROL_MARK_NAME && sanitizeControlKey(mark.attrs.controlKey) !== key,
    );
    if (other) plain = false;
    else if (child.isText) text += child.text ?? "";
    else if (child.type.name === HARD_BREAK) text += "\n";
    else plain = false;
  });
  return plain ? { from: $at.start(), to: $at.end(), text } : null;
}

/**
 * Every bound plain or rich text control of `doc` that is one run of words
 * in one paragraph (its pieces apart only at line breaks), by its
 * `controlKey`. A control in tracked revisions, or in pieces with other
 * content between them, is left out: nothing is refreshed into it, and an
 * edit of it refreshes nothing. Read off the document's control ranges
 * (kept per document), so a document with no bound control costs a lookup.
 */
export function boundControls(doc: ProseMirrorNode): Map<string, BoundControl> {
  const found = new Map<string, BoundControl>();
  const uncertain = new Set<string>();
  for (const range of collectContentControlRanges(doc)) {
    const token = range.meta.binding;
    const key = sanitizeControlKey(range.mark.attrs.controlKey);
    if (!token || !key) continue;
    const binding = token.endsWith(WHOLE_PARAGRAPH_FLAG) ? token.slice(0, -1) : token;
    if (!SYNCED_TYPES.has(range.meta.controlType)) uncertain.add(key);
    const known = found.get(key);
    if (token.endsWith(WHOLE_PARAGRAPH_FLAG)) {
      const whole = paragraphControl(doc, range.from, key);
      if (!whole || (known && known.from !== whole.from)) {
        uncertain.add(key);
      } else if (!known) {
        if (revised(doc, whole.from, whole.to)) uncertain.add(key);
        found.set(key, { key, binding, meta: range.meta, mark: range.mark, ...whole });
      }
      continue;
    }
    if (revised(doc, range.from, range.to)) uncertain.add(key);
    const words = doc.textBetween(range.from, range.to, "", "");
    if (!known) {
      found.set(key, { key, binding, meta: range.meta, mark: range.mark, from: range.from, to: range.to, text: words });
      continue;
    }
    // A later piece of the same control: only line breaks of its own
    // paragraph may stand between them.
    let gap = "";
    let joined = doc.resolve(known.to).sameParent(doc.resolve(range.from));
    if (joined) {
      doc.nodesBetween(known.to, range.from, (node) => {
        if (!node.isInline) return true;
        if (node.type.name === HARD_BREAK) gap += "\n";
        else joined = false;
        return false;
      });
    }
    if (!joined || known.binding !== binding) {
      uncertain.add(key);
      continue;
    }
    known.text += gap + words;
    known.to = range.to;
  }
  uncertain.forEach((key) => found.delete(key));
  return found;
}

/** What a control shows of a node holding `value` (`data_binding._typed_text`). */
function shownText(meta: ContentControlMeta, value: string): string {
  return meta.controlType === "text" && meta.multiline ? value : value.replace(/\n/g, "");
}

/**
 * Refresh, inside `tr`, every bound control mapping the node of a control
 * whose words `tr` changed from `before`. Returns whether it wrote anything.
 */
export function syncBoundControls(markType: MarkType, before: ProseMirrorNode, tr: Transaction): boolean {
  const after = boundControls(tr.doc);
  if (after.size < 2) return false;
  const old = boundControls(before);
  // The node's new value: the words of the control the edit changed. Two
  // controls of one node changed to different words leave it to the save.
  const values = new Map<string, string | null>();
  after.forEach((control) => {
    const previous = old.get(control.key);
    if (!previous || previous.binding !== control.binding || previous.text === control.text) return;
    const known = values.get(control.binding);
    values.set(control.binding, known === undefined || known === control.text ? control.text : null);
  });
  const targets: { control: BoundControl; text: string }[] = [];
  values.forEach((value, binding) => {
    // An emptied control shows its placeholder prompt: the node's empty
    // value is the save's to refresh.
    if (!value) return;
    after.forEach((control) => {
      if (control.binding !== binding) return;
      const text = shownText(control.meta, value);
      if (control.text !== text) targets.push({ control, text });
    });
  });
  if (targets.length === 0) return false;
  let wrote = false;
  const schema = tr.doc.type.schema;
  const hardBreak = schema.nodes[HARD_BREAK];
  for (const { control, text } of targets.sort((a, b) => b.control.from - a.control.from)) {
    const first = tr.doc.nodeAt(control.from);
    const attrs = controlMetaToAttrs({ ...control.meta, placeholder: false });
    attrs.controlKey = control.key;
    const marks = markType.create(attrs).addToSet(
      (first?.marks ?? [control.mark]).filter((mark) => mark.type !== markType),
    );
    const nodes: ProseMirrorNode[] = [];
    text.split("\n").forEach((line, index) => {
      if (index > 0 && hardBreak) nodes.push(hardBreak.create(null, null, marks));
      if (line) nodes.push(schema.text(line, marks));
    });
    if (nodes.length === 0) continue;
    tr.replaceWith(control.from, control.to, nodes);
    wrote = true;
  }
  return wrote;
}
