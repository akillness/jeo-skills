"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Transient DOM evidence that Word contextual spacing suppressed one edge. */
export const CONTEXTUAL_SPACING_BEFORE_ATTR =
  "data-contextual-spacing-before-suppressed";
export const CONTEXTUAL_SPACING_AFTER_ATTR =
  "data-contextual-spacing-after-suppressed";

const CONTEXTUAL_TEXT_BLOCK_TYPES = new Set(["paragraph", "heading"]);

function boundedIdentity(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized &&
    normalized.length <= maxLength &&
    !/[\u0000-\u001f]/.test(normalized)
    ? normalized
    : null;
}

/** Stable paragraph-style identity used only by the live layout projection. */
export function contextualParagraphStyleIdentity(
  node: ProseMirrorNode,
): string | null {
  if (!CONTEXTUAL_TEXT_BLOCK_TYPES.has(node.type.name)) return null;

  const customId = boundedIdentity(node.attrs.customStyleId, 128);
  if (customId) return `custom:${customId}`;
  const customName = boundedIdentity(node.attrs.customStyleName, 64);
  if (customName) return `custom-name:${customName}`;
  const docxStyleId = boundedIdentity(node.attrs.docxStyleId, 128);
  if (docxStyleId) return `docx:${docxStyleId}`;

  if (node.type.name === "heading") {
    const level = Number(node.attrs.level);
    return `heading:${Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1}`;
  }
  
  const builtin = boundedIdentity(node.attrs.builtinStyleId, 32);
  if (builtin) return `builtin:${builtin}`;
  // An absent w:pStyle resolves to the document's default paragraph style.
  return "paragraph:default";
}

interface PositionedChild {
  node: ProseMirrorNode;
  pos: number;
}

interface ContextualTextBlockRange {
  node: ProseMirrorNode;
}

/** Find the one represented text block whose CONTENT contains this range. */
function contextualTextBlockContainingRange(
  doc: ProseMirrorNode,
  rawFrom: number,
  rawTo: number,
): ContextualTextBlockRange | null {
  const from = Math.min(Math.max(rawFrom, 0), doc.content.size);
  const to = Math.min(Math.max(rawTo, from), doc.content.size);
  const scanFrom = Math.max(0, from - 1);
  const scanTo = Math.min(doc.content.size, Math.max(to + 1, scanFrom + 1));
  let match: ContextualTextBlockRange | null = null;
  doc.nodesBetween(scanFrom, scanTo, (node, pos) => {
    if (match || !CONTEXTUAL_TEXT_BLOCK_TYPES.has(node.type.name)) {
      return !match;
    }
    const contentFrom = pos + 1;
    const contentTo = contentFrom + node.content.size;
    if (from >= contentFrom && to <= contentTo) {
      match = { node };
      return false;
    }
    return true;
  });
  return match;
}

/**
 * True when every document step changes only inline content/marks inside one
 * existing represented paragraph. Those edits cannot change style adjacency,
 * so DecorationSet.map is both exact and dramatically cheaper than an O(n)
 * rebuild during normal typing/IME composition.
 */
function canMapContextualSpacingDecorations(tr: Transaction): boolean {
  if (!tr.docChanged || tr.steps.length === 0) return false;

  return tr.steps.every((step, index) => {
    const stepType = String(
      (step.toJSON() as { stepType?: unknown }).stepType ?? "",
    );
    if (stepType === "addMark" || stepType === "removeMark") return true;
    if (stepType !== "replace") return false;

    const oldDoc = tr.docs[index];
    const newDoc = tr.docs[index + 1] ?? tr.doc;
    if (!oldDoc || !newDoc) return false;
    let sawRange = false;
    let safe = true;
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      sawRange = true;
      const oldBlock = contextualTextBlockContainingRange(
        oldDoc,
        oldStart,
        oldEnd,
      );
      const newBlock = contextualTextBlockContainingRange(
        newDoc,
        newStart,
        newEnd,
      );
      if (
        !oldBlock ||
        !newBlock ||
        oldBlock.node.type.name !== newBlock.node.type.name ||
        oldBlock.node.attrs.contextualSpacing !==
          newBlock.node.attrs.contextualSpacing ||
        contextualParagraphStyleIdentity(oldBlock.node) !==
          contextualParagraphStyleIdentity(newBlock.node)
      ) {
        safe = false;
      }
    });
    return sawRange && safe;
  });
}

/**
 * Derive Word's contextual-spacing paint from durable paragraph attrs.
 *
 * Decorations are deliberately non-persistent: editor JSON and DOCX continue
 * to carry only `contextualSpacing`; this projection merely suppresses the
 * relevant painted margin when the immediate sibling has the same stable
 * paragraph style. Page boundaries are different parents, where the existing
 * page-edge contract already suppresses leading/trailing paragraph margins.
 */
/** Containers a paragraph's neighbours are read through: Word's list items
 * are paragraphs one after another, whatever level they stand at. */
const CONTEXTUAL_TRANSPARENT_CONTAINERS = new Set([
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
]);

export function buildContextualParagraphSpacingDecorations(
  doc: ProseMirrorNode,
): DecorationSet {
  const decorations: Decoration[] = [];

  // The blocks of one scope in reading order: list containers are read
  // through, so the item after "1)" is its nested "a)" and the item after
  // the last nested one is the next "2)". Word compares a paragraph with
  // the paragraph next to it in the text; R12-D12's List Paragraph items
  // kept their 8pt after wherever the level changed. Any other block
  // (a table, a picture, a sheet) is its own scope and stands between.
  const flatten = (
    parent: ProseMirrorNode,
    contentStart: number,
    out: PositionedChild[],
  ): void => {
    parent.forEach((node, offset) => {
      const pos = contentStart + offset;
      if (CONTEXTUAL_TRANSPARENT_CONTAINERS.has(node.type.name)) {
        flatten(node, pos + 1, out);
      } else {
        out.push({ node, pos });
      }
    });
  };

  const visit = (parent: ProseMirrorNode, contentStart: number): void => {
    const children: PositionedChild[] = [];
    flatten(parent, contentStart, children);

    children.forEach(({ node, pos }, index) => {
      const identity = contextualParagraphStyleIdentity(node);
      if (identity && node.attrs.contextualSpacing === true) {
        const before =
          index > 0 &&
          contextualParagraphStyleIdentity(children[index - 1].node) ===
            identity;
        const after =
          index + 1 < children.length &&
          contextualParagraphStyleIdentity(children[index + 1].node) ===
            identity;
        if (before || after) {
          // The mark alone: note-editor.css zeroes the marked edge. A margin
          // written into the decoration's style was taken off again with it,
          // and with it the paragraph's own inline space before/after: once
          // the next paragraph took another style, a 24pt space after was
          // drawn at the stylesheet's default until the page reloaded
          // (WUA 030).
          const attrs: Record<string, string> = {};
          if (before) attrs[CONTEXTUAL_SPACING_BEFORE_ATTR] = "true";
          if (after) attrs[CONTEXTUAL_SPACING_AFTER_ATTR] = "true";
          decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs));
        }
      }

      if (!node.isTextblock && node.childCount > 0) {
        visit(node, pos + 1);
      }
    });
  };

  visit(doc, 0);
  return decorations.length > 0
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty;
}

const contextualParagraphSpacingKey = new PluginKey<DecorationSet>(
  "contextualParagraphSpacing",
);

/** Word/WPS same-style paragraph spacing as a pure ProseMirror projection. */
export const ContextualParagraphSpacing = Extension.create({
  name: "contextualParagraphSpacing",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: contextualParagraphSpacingKey,
        state: {
          init: (_config, state) =>
            buildContextualParagraphSpacingDecorations(state.doc),
          apply(tr: Transaction, value: DecorationSet, _oldState, newState) {
            return tr.docChanged
              ? canMapContextualSpacingDecorations(tr)
                ? value.map(tr.mapping, newState.doc)
                : buildContextualParagraphSpacingDecorations(newState.doc)
              : value;
          },
        },
        props: {
          decorations(state) {
            return (
              contextualParagraphSpacingKey.getState(state) ??
              DecorationSet.empty
            );
          },
        },
      }),
    ];
  },
});
