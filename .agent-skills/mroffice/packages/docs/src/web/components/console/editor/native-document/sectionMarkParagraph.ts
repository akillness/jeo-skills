"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * An empty paragraph that holds nothing but the mark of a CONTINUOUS section
 * break takes no room on Word's page: "Hello", an empty paragraph carrying
 * the section mark, then "World" in a continuous section set "World" exactly
 * one line pitch below "Hello" -- with or without a field's code in the empty
 * paragraph (Word 16.86 probe, `scratchpad/sectfld`; corpus R30-D04, whose
 * INDEX field begins in such a paragraph). The import keeps that paragraph
 * (it may hold a field's code, a bookmark), so the page draws it as zero
 * height instead of as a blank line.
 */

import { SheetFact } from "@mrnote/core/web/lib/editor/sheet-facts.ts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { DELETION_MARK_NAME, OBJECT_DELETION_REVISION_ATTR, PARAGRAPH_MARK_REVISION_ATTR } from "@mrnote/core/web/components/console/editor/native-document/trackChanges.ts";

export const SECTION_MARK_ONLY_ATTR = "data-section-mark-only";
/**
 * An empty paragraph whose paragraph mark is hidden text (`w:pPr/w:rPr/w:vanish`,
 * read as the page's `paragraphMarkMarks` hiddenText) takes no room either,
 * in the body, in a cell, or between two tables: Word 16.86 set "B" one line
 * pitch below "A" across such a paragraph, and a table right under the one
 * before it (probe `scratchpad/hidmark`; corpus R03-D23, a job posting whose
 * HTML conversion puts one between its nested tables). Not when it is the
 * last block of its container, whose mark Word keeps, and not while hidden
 * text is shown (the stylesheet keys on `data-show-hidden-text`).
 */
export const HIDDEN_MARK_ONLY_ATTR = "data-hidden-mark-only";
/**
 * The same mark alone on the last line of a paragraph, after a line break
 * (`w:br` closing the text): that empty line takes no room either, and the
 * paragraph's space after is not added. Word 16.86 set the next section's
 * first line at the top of where the empty line would be, one line pitch
 * below the paragraph's last words; with the break removed, one line pitch
 * plus the paragraph's 12 pt after; with text after the break, both lines
 * and the 12 pt (corpus R93-D23 and edited copies of it, probe
 * `scratchpad/r93d23/v`; one or two columns in the next section alike).
 */
export const SECTION_MARK_AFTER_BREAK_ATTR = "data-section-mark-after-break";

/**
 * A paragraph whose mark is a tracked deletion (`w:pPr/w:rPr/w:del`) and
 * whose every word is deleted too: in Word's final view (No Markup, Simple
 * Markup, and the PDF a document is saved as) its mark goes, the paragraph
 * joins the next one, and the joined paragraph is the next one's: its
 * alignment, indents and spacing (Windows Word, probe docx-look
 * probes/pmerge pm1: a deleted mark before a right-aligned paragraph with
 * 36 pt before and after set the survivor at its own place, alone; a chain
 * of deleted marks ends in the last paragraph's). Nothing of it is left, so
 * it takes no room (corpus R387-D06: 97 such paragraphs, R417-D03: 219,
 * each drawn as an empty line), before a paragraph, a table, or between two
 * tables, and as a cell's first paragraph (pm2). Not when it is the last
 * block of its container (a cell's last paragraph keeps its line, pm2), and
 * not in the views that show deletions (the stylesheet keys on the markup
 * filter).
 * `window.__docsFinalMarkJoinOff = true` keeps the older layout (A/B).
 */
export const FINAL_VIEW_GONE_ATTR = "data-tc-final-gone";

/**
 * On the paragraph a deleted mark joins: the spaces the joining paragraph
 * leaves, drawn at its start in the views that hide deletions (Word draws
 * the joined paragraph as the first one's words, then the second's, with
 * the second's properties; probes pmerge, corpus R380-D02).
 */
export const FINAL_VIEW_JOIN_LEAD_ATTR = "data-tc-final-join-lead";

function deletedMarkParagraph(node: ProseMirrorNode): boolean {
  if (node.type.name !== "paragraph" && node.type.name !== "heading") return false;
  const revision = node.attrs?.[PARAGRAPH_MARK_REVISION_ATTR] as { kind?: unknown } | null | undefined;
  return !!revision && typeof revision === "object" && revision.kind === "del";
}

/** Whether the final view draws anything of a paragraph's content. */
function finalViewShowsContent(node: ProseMirrorNode): boolean {
  let visible = false;
  node.forEach((child) => {
    if (visible) return;
    if (child.marks.some((mark) => mark.type.name === DELETION_MARK_NAME)) return;
    if (child.attrs?.[OBJECT_DELETION_REVISION_ATTR]) return;
    if (child.type.name === "bookmarkPoint" || child.type.name === "rangePermission") return;
    visible = true;
  });
  return visible;
}

function deletedMarkOnly(node: ProseMirrorNode): boolean {
  return deletedMarkParagraph(node) && !finalViewShowsContent(node);
}

/** A paragraph whose mark is deleted and whose words the final view still
 * draws: they join the next paragraph. */
function deletedMarkJoining(node: ProseMirrorNode): boolean {
  return deletedMarkParagraph(node) && finalViewShowsContent(node);
}

/** `window.__docsFinalJoinEmptyOff = true`: the empty paragraph a deleted
 * mark joins still draws its own line (as before; A/B). */
function finalJoinEmptyOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsFinalJoinEmptyOff?: boolean }).__docsFinalJoinEmptyOff === true;
}

/** The words the final view draws of a paragraph, when they are spaces only. */
function finalViewSpacesOnly(node: ProseMirrorNode): string | null {
  let text = "";
  let other = false;
  node.forEach((child) => {
    if (other) return;
    if (child.marks.some((mark) => mark.type.name === DELETION_MARK_NAME)) return;
    if (child.attrs?.[OBJECT_DELETION_REVISION_ATTR]) return;
    if (child.type.name === "bookmarkPoint" || child.type.name === "rangePermission") return;
    if (child.isText && /^ +$/.test(child.text ?? "")) text += child.text;
    else other = true;
  });
  return !other && text.length > 0 && text.length <= 64 ? text : null;
}

/** `window.__docsFinalJoinLeadOff = true`: a paragraph of spaces a deleted
 * mark joins to the next one's words still draws its own line (A/B). */
function finalJoinLeadOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsFinalJoinLeadOff?: boolean }).__docsFinalJoinLeadOff === true;
}

function finalMarkJoinOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsFinalMarkJoinOff?: boolean }).__docsFinalMarkJoinOff === true;
}

function hiddenMarkOnly(node: ProseMirrorNode): boolean {
  if (node.type.name !== "paragraph" || node.content.size !== 0) return false;
  const marks = node.attrs?.paragraphMarkMarks;
  return Array.isArray(marks) && marks.some(
    (mark) => !!mark && typeof mark === "object" && (mark as { type?: unknown }).type === "hiddenText",
  );
}

/** The paragraph's text closes with a line break: a hard break node, or
 * the newline an imported `w:br` became at the end of its text. */
function endsInLineBreak(node: ProseMirrorNode): boolean {
  const last = node.lastChild;
  if (!last) return false;
  if (last.type.name === "hardBreak") return true;
  return Boolean(last.isText && last.text?.endsWith("\n"));
}

const sectionMarkParagraphKey = new PluginKey<DecorationSet>("documentSectionMarkParagraph");

/**
 * An empty paragraph the import folded a dedicated section-mark paragraph
 * INTO (`source.sectionMarkFolded`): the mark was the paragraph after it, and
 * this one is an ordinary blank line, which Word draws (Word 16.86, corpus
 * R281-D18: removing the dedicated paragraph moves nothing, removing this one
 * moves the next section up a line).
 */
function sectionMarkFolded(node: ProseMirrorNode): boolean {
  const source = node.attrs?.source as { sectionMarkFolded?: unknown } | null | undefined;
  return source?.sectionMarkFolded === 1;
}

function continuousBreak(node: ProseMirrorNode | null | undefined): boolean {
  return node?.type.name === "sectionBreak" && node.attrs.breakType === "continuous";
}

const HOLDS_HIDDEN_MARK = new SheetFact((node) => hiddenMarkOnly(node));
const HOLDS_CONTINUOUS_BREAK = new SheetFact((node) => continuousBreak(node));
const HOLDS_DELETED_MARK = new SheetFact((node) => deletedMarkParagraph(node));

export function buildSectionMarkParagraphDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  if (HOLDS_HIDDEN_MARK.inDoc(doc)) {
    const visitHidden = (parent: ProseMirrorNode, start: number) => {
      parent.forEach((child, offset, index) => {
        const pos = start + offset;
        if (child.isTextblock) {
          if (index + 1 < parent.childCount && hiddenMarkOnly(child)) {
            decorations.push(Decoration.node(pos, pos + child.nodeSize, { [HIDDEN_MARK_ONLY_ATTR]: "true" }));
          }
        } else if (!child.isAtom && child.childCount) {
          visitHidden(child, pos + 1);
        }
      });
    };
    visitHidden(doc, 0);
  }
  if (!finalMarkJoinOff() && HOLDS_DELETED_MARK.inDoc(doc)) {
    // The body runs on across its page sheets: a sheet's last block closes
    // the body only on the last sheet.
    let sheetIndex = -1;
    // A paragraph whose mark is deleted and whose words stay joins the next
    // one: when that one draws nothing of its own (an empty paragraph, or
    // one whose words are all deleted), the joined paragraph is its words
    // alone, and the empty one's line is not drawn (corpus R380-D02 and
    // R387-D06: 8 of their 10 such joins end in an empty paragraph, each an
    // extra empty line here). The joined paragraph keeps the first one's
    // properties here; Word gives it the second one's (pmerge).
    let joining: ProseMirrorNode | null = null;
    let joiningParent: ProseMirrorNode | null = null;
    // Where the joining paragraph is, and its spaces when it draws only
    // spaces: joined to a paragraph with words of its own, the spaces lead
    // that paragraph's first line and their own line is not drawn (corpus
    // R380-D02: three inserted spaces before a deleted mark; Word's line
    // starts with them at the second paragraph's indent).
    let joiningPos = -1;
    let joiningLead: string | null = null;
    const sameStory = (parent: ProseMirrorNode | null) =>
      parent === joiningParent || (parent?.type.name === "pageBlock" && joiningParent?.type.name === "pageBlock");
    HOLDS_DELETED_MARK.descendants(doc, (child, pos, parent, index) => {
      if (parent === doc) sheetIndex = index;
      if (!child.isTextblock) {
        if (parent !== doc) joining = null;
        return true;
      }
      const closes =
        !parent ||
        (index + 1 >= parent.childCount && (parent === doc || parent.type.name !== "pageBlock" || sheetIndex >= doc.childCount - 1));
      const joined = joining !== null && sameStory(parent);
      if (!closes && deletedMarkOnly(child)) {
        decorations.push(Decoration.node(pos, pos + child.nodeSize, { [FINAL_VIEW_GONE_ATTR]: "true" }));
        return false;
      }
      if (joined && !finalJoinEmptyOff() && !finalViewShowsContent(child)) {
        decorations.push(Decoration.node(pos, pos + child.nodeSize, { [FINAL_VIEW_GONE_ATTR]: "true" }));
      } else if (
        joined &&
        joining &&
        joiningLead !== null &&
        !finalJoinLeadOff() &&
        parent?.type.name !== "listItem" &&
        finalViewShowsContent(child)
      ) {
        const lead = joiningLead;
        decorations.push(
          Decoration.node(joiningPos, joiningPos + (joining as ProseMirrorNode).nodeSize, { [FINAL_VIEW_GONE_ATTR]: "true" }),
          Decoration.node(pos, pos + child.nodeSize, {
            [FINAL_VIEW_JOIN_LEAD_ATTR]: String(lead.length),
            style: `--tc-join-lead: "${lead}"`,
          }),
        );
      }
      joining = deletedMarkJoining(child) ? child : null;
      joiningParent = parent;
      joiningPos = pos;
      joiningLead = joining ? finalViewSpacesOnly(child) : null;
      return false;
    });
  }
  const visit = (parent: ProseMirrorNode, start: number) => {
    parent.forEach((child, offset, index) => {
      const pos = start + offset;
      if (child.isTextblock) {
        if (
          child.type.name === "paragraph" &&
          child.content.size === 0 &&
          !sectionMarkFolded(child) &&
          continuousBreak(index + 1 < parent.childCount ? parent.child(index + 1) : null)
        ) {
          decorations.push(Decoration.node(pos, pos + child.nodeSize, { [SECTION_MARK_ONLY_ATTR]: "true" }));
        } else if (
          child.type.name === "paragraph" &&
          endsInLineBreak(child) &&
          continuousBreak(index + 1 < parent.childCount ? parent.child(index + 1) : null)
        ) {
          decorations.push(Decoration.node(pos, pos + child.nodeSize, { [SECTION_MARK_AFTER_BREAK_ATTR]: "true" }));
          // An imported break is the text's own closing newline (white-space
          // pre-wrap draws the empty row after it): that newline is not drawn.
          if (child.lastChild?.isText) {
            const end = pos + child.nodeSize - 1;
            decorations.push(Decoration.inline(end - 1, end, { style: "display: none" }));
          }
        }
      } else if (!child.isAtom && child.childCount && child.type.name !== "table") {
        visit(child, pos + 1);
      }
    });
  };
  if (HOLDS_CONTINUOUS_BREAK.inDoc(doc)) visit(doc, 0);
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const DocumentSectionMarkParagraph = Extension.create({
  name: "documentSectionMarkParagraph",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: sectionMarkParagraphKey,
        state: {
          init: (_config, state) => buildSectionMarkParagraphDecorations(state.doc),
          apply: (tr, value, _old, state) => (tr.docChanged ? buildSectionMarkParagraphDecorations(state.doc) : value),
        },
        props: {
          decorations: (state) => sectionMarkParagraphKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});

export default DocumentSectionMarkParagraph;
