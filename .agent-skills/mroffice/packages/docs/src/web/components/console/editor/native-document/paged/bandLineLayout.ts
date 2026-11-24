/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's line heights for the header/footer story editor.
 *
 * The painted band sets each line from the line's Word inputs (its spacing
 * and the face and size of its tallest run: `bandLineHeightCss`), while a
 * body paragraph draws its spacing multiple against its own font size. Opened
 * in the story editor, an imported header line at 1.5 lines of a 12pt face
 * was drawn 18px tall instead of Word's 45px, and the text jumped up the page
 * by half the difference. This plugin gives every story line the painted
 * band's own line height as a node decoration, so opening a header or footer
 * moves no line. Display only: it changes nothing in the document.
 *
 * Only the island's editor loads it.
 */

import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { bandLineHeightCss, bandStyleRunSizePx } from "@mrnote/core/web/components/console/editor/native-document/paged/bandRichDom.ts";
import { BAND_RUN_MARK_NAME } from "@mrnote/core/web/components/console/editor/native-document/paged/bandRunMark.ts";
import { bandLineFromParagraphAttrs } from "./bandStoryDoc";

const bandLineLayoutKey = new PluginKey<DecorationSet>("bandLineLayout");

/** The line's text as the band measures it: neither its fields nor the
 * words of a text box drawn from it count. */
function lineText(node: PmNode): string {
  let text = "";
  node.forEach((child) => {
    if (!child.isText) return;
    const frame = child.marks.find((mark) => mark.type.name === BAND_RUN_MARK_NAME)?.attrs.frame;
    if (frame === null || frame === undefined) text += child.text ?? "";
  });
  return text;
}

export function bandLineDecorations(doc: PmNode, dom: Document | null): DecorationSet {
  if (!dom) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  const styles = doc.attrs.styleDefinitions;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const height = bandLineHeightCss(dom, bandLineFromParagraphAttrs(node.attrs), lineText(node));
    const size = bandStyleRunSizePx(styles, node.attrs.docxStyleId);
    // A line with no Word inputs takes the band's single line from the story
    // (`.sheet-band-story`), whatever spacing the body would draw it with;
    // its runs take their Word style's size, as the painted band sets them.
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        style: `line-height: ${height ?? "inherit"}${size !== null ? `; font-size: ${Math.round(size * 1000) / 1000}px` : ""}`,
        // A Word line height in px is the line's whole height (note-editor.css).
        ...(height?.endsWith("px") ? { "data-band-word-line": "" } : {}),
      }),
    );
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

const FONTS_META = "bandLineLayoutFonts";

export const BandLineLayout = Extension.create({
  name: "bandLineLayout",
  addProseMirrorPlugins() {
    const dom = typeof document === "undefined" ? null : document;
    return [
      new Plugin<DecorationSet>({
        key: bandLineLayoutKey,
        state: {
          init: (_config, state) => bandLineDecorations(state.doc, dom),
          apply(tr, set, _old, state) {
            return tr.docChanged || tr.getMeta(FONTS_META)
              ? bandLineDecorations(state.doc, dom)
              : set;
          },
        },
        props: {
          decorations: (state) => bandLineLayoutKey.getState(state),
        },
        view(editorView) {
          // A face that arrives later is measured again, as the band is.
          const fonts = editorView.dom.ownerDocument.fonts;
          let destroyed = false;
          const refresh = () => {
            if (destroyed || editorView.isDestroyed) return;
            editorView.dispatch(
              editorView.state.tr.setMeta(FONTS_META, true).setMeta("addToHistory", false),
            );
          };
          fonts?.addEventListener?.("loadingdone", refresh);
          return {
            destroy() {
              destroyed = true;
              fonts?.removeEventListener?.("loadingdone", refresh);
            },
          };
        },
      }),
    ];
  },
});
