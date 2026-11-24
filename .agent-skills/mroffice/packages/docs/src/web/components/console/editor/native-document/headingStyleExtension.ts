"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import {
  headingStyleInlineCss,
  normalizeHeadingStyles,
  type HeadingStyleMap,
} from "@mrnote/core/web/lib/document-heading-styles.ts";

/** Transient DOM evidence that a heading is painted by its style definition. */
export const HEADING_STYLE_LEVEL_ATTR = "data-heading-style-level";

/**
 * Paint every heading from the document's own `Heading 1`..`Heading 6`
 * definition.
 *
 * The exported package states the type scale on the style, not on the runs, so
 * a heading with no direct formatting resolves through Word's style cascade. If
 * the editor kept rendering from its stylesheet's own heading rules, the
 * document would look one way here and another way in Word — worse than the
 * unlinked formatting this replaced. The decoration is deliberately
 * non-persistent: the editor JSON and both DOCX writers continue to carry only
 * `doc.attrs.headingStyles`, and a document without that attribute renders
 * exactly as it always has.
 *
 * Direct run formatting still wins, because it is painted by the mark layer on
 * top of these block declarations — the same precedence Word applies.
 */
export function buildHeadingStyleDecorations(
  doc: ProseMirrorNode,
): DecorationSet {
  const styles: HeadingStyleMap | null = normalizeHeadingStyles(
    doc.attrs?.headingStyles,
  );
  if (!styles) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;
    const level = node.attrs?.level;
    const css = headingStyleInlineCss(styles, level);
    if (css) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          style: css,
          [HEADING_STYLE_LEVEL_ATTR]: String(level),
        }),
      );
    }
    return false;
  });
  return decorations.length
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty;
}

const headingStyleKey = new PluginKey<DecorationSet>("documentHeadingStyles");

/** The document's heading style definitions as a pure ProseMirror projection. */
export const DocumentHeadingStyles = Extension.create({
  name: "documentHeadingStyles",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: headingStyleKey,
        state: {
          init: (_config, state: EditorState) =>
            buildHeadingStyleDecorations(state.doc),
          apply(tr, value, oldState, newState) {
            // A doc attribute change does not set docChanged, so compare the
            // attribute itself rather than only the content.
            return tr.docChanged ||
              oldState.doc.attrs?.headingStyles !==
                newState.doc.attrs?.headingStyles
              ? buildHeadingStyleDecorations(newState.doc)
              : value;
          },
        },
        props: {
          decorations(state) {
            return headingStyleKey.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

export default DocumentHeadingStyles;
