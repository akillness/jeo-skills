"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { plainTextEdits } from "@mrnote/core/web/components/console/editor/native-document/textblockOnlyEdits.ts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Word's style separator: a paragraph whose mark is hidden by `w:specVanish`
 * (the import's receipt `source.styleSeparator`) runs the next paragraph's
 * text on its own line -- a run-in heading ("Apple shall mean a piece of
 * fruit;" with "Apple" a Heading 2). Both paragraphs stay what they are in
 * the document; the page draws them on one line, the following paragraph
 * closing it (tdf131728). A mark inside a field's code is hidden with the
 * code the same way (R170-D18: a paragraph holding only a HYPERLINK's begin
 * and the start of its address draws nothing, its result on the next line).
 */
export const STYLE_SEPARATOR_ATTR = "data-style-separator";
export const STYLE_SEPARATOR_RUN_ON_ATTR = "data-style-separator-run-on";

const styleSeparatorKey = new PluginKey<DecorationSet>("documentStyleSeparator");

function isSeparator(node: ProseMirrorNode): boolean {
  const source = node.attrs?.source as { adapter?: unknown; styleSeparator?: unknown } | null | undefined;
  // A cell paragraph's receipt names no adapter: only the docx reader writes one.
  return node.isTextblock && (source?.adapter ?? "docx") === "docx" && source?.styleSeparator === 1;
}

export function buildStyleSeparatorDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  const visit = (parent: ProseMirrorNode, start: number) => {
    let previousSeparator = false;
    parent.forEach((child, offset) => {
      const pos = start + offset;
      const separator = isSeparator(child);
      if (child.isTextblock) {
        const attrs: Record<string, string> = {};
        if (separator) attrs[STYLE_SEPARATOR_ATTR] = "true";
        // The paragraph a separator runs into is drawn on the same line.
        if (previousSeparator) attrs[STYLE_SEPARATOR_RUN_ON_ATTR] = "true";
        if (Object.keys(attrs).length) decorations.push(Decoration.node(pos, pos + child.nodeSize, attrs));
      } else if (!child.isAtom && child.childCount) {
        visit(child, pos + 1);
      }
      previousSeparator = separator;
    });
  };
  let any = false;
  doc.descendants((node) => {
    if (any) return false;
    if (isSeparator(node)) any = true;
    return !node.isTextblock;
  });
  if (!any) return DecorationSet.empty;
  visit(doc, 0);
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const DocumentStyleSeparator = Extension.create({
  name: "documentStyleSeparator",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: styleSeparatorKey,
        state: {
          init: (_config, state) => buildStyleSeparatorDecorations(state.doc),
          // A separator is a paragraph's attribute: typing moves the marks.
          apply: (tr, value, _old, state) =>
            !tr.docChanged ? value : plainTextEdits(tr) ? value.map(tr.mapping, tr.doc) : buildStyleSeparatorDecorations(state.doc),
        },
        props: {
          decorations: (state) => styleSeparatorKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});

export default DocumentStyleSeparator;
