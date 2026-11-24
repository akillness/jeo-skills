/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The empty paragraph a table cell's in-line picture is read out of.
 *
 * A Word cell paragraph that holds only an in-line picture is ONE line, as
 * tall as the picture, with the paragraph's own spacing around it. A table
 * read with its cell paragraphs (`source.cellParagraphFlow`) draws each
 * picture right after the paragraph that hosts it, so such a paragraph
 * reaches the page empty and the picture follows it: the cell drew an empty
 * line and the paragraph's space after above the picture (corpus R158-D22:
 * the Home Office crest 33px low in its letterhead cell, every page of the
 * report a line lower than Word's).
 *
 * The empty host is given no height and its spacing moves onto the picture
 * that follows it. Paint and layout only; nothing is saved, and the
 * paragraph takes its line again as soon as it holds anything.
 *
 * A host that holds only spaces is empty to Word's line too: the spaces
 * between a row of in-line pictures take no line of their own, and the line
 * is the pictures' height with no descent under them (Windows Word, corpus
 * R421-D02's Indexing row of six 21.6 pt logos: 24.0 pt with their effect
 * extents; the spaces' paragraph drew an 8 pt Book Antiqua line above them,
 * 33.5 pt). `window.__docsCellPictureSpacesHostOff = true` keeps such a host
 * on its own line, for an A/B of one build.
 */
import { SheetFact } from "@mrnote/core/web/lib/editor/sheet-facts.ts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const CELL_PICTURE_HOST_ATTR = "data-docs-cell-picture-host";

const CELL_TYPES = new Set(["tableCell", "tableHeader"]);

function points(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function spacesHostOff(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as Window & { __docsCellPictureSpacesHostOff?: boolean }).__docsCellPictureSpacesHostOff === true
  );
}

/** Nothing but spaces: no atom, no break, no character that draws. */
function holdsOnlySpaces(paragraph: ProseMirrorNode): boolean {
  if (paragraph.content.size === 0) return true;
  if (spacesHostOff()) return false;
  let spaces = true;
  paragraph.forEach((child) => {
    if (!child.isText || !/^[ \u00a0]*$/.test(child.text ?? "")) spaces = false;
  });
  return spaces;
}

function hostsInlinePicture(paragraph: ProseMirrorNode, next: ProseMirrorNode | null | undefined): boolean {
  return Boolean(
    paragraph.type.name === "paragraph" &&
      holdsOnlySpaces(paragraph) &&
      next &&
      next.type.name === "image" &&
      next.attrs.officeDrawingKind !== "anchor",
  );
}

const HOLDS_FLOWING_CELLS = new SheetFact((node) => node.type.name === "table" && (node.attrs.source as { cellParagraphFlow?: unknown } | null | undefined)?.cellParagraphFlow === 1);

export function cellPictureHostDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  HOLDS_FLOWING_CELLS.descendants(doc, (node, pos) => {
    if (node.type.name !== "table") return true;
    const source = node.attrs.source as { cellParagraphFlow?: unknown } | null | undefined;
    if (!source || source.cellParagraphFlow !== 1) return false;
    node.descendants((cell, cellOffset) => {
      if (!CELL_TYPES.has(cell.type.name)) return true;
      const cellPos = pos + 1 + cellOffset;
      let childPos = cellPos + 1;
      for (let index = 0; index < cell.childCount; index += 1) {
        const child = cell.child(index);
        const next = index + 1 < cell.childCount ? cell.child(index + 1) : null;
        if (next && hostsInlinePicture(child, next)) {
          const before = points(child.attrs.spaceBefore);
          const after = points(child.attrs.spaceAfter);
          decorations.push(
            Decoration.node(childPos, childPos + child.nodeSize, {
              [CELL_PICTURE_HOST_ATTR]: "true",
              style: "height:0;min-height:0;margin-top:0;margin-bottom:0;padding-top:0;padding-bottom:0;line-height:0;overflow:hidden",
            }),
          );
          const imagePos = childPos + child.nodeSize;
          if (before || after) {
            decorations.push(
              Decoration.node(imagePos, imagePos + next.nodeSize, {
                style: `${before ? `margin-top:${before}pt;` : ""}${after ? `margin-bottom:${after}pt;` : ""}`,
              }),
            );
          }
        }
        childPos += child.nodeSize;
      }
      return false;
    });
    return false;
  });
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const cellPictureHostKey = new PluginKey<DecorationSet>("cellPictureHost");

export const CellPictureHost = Extension.create({
  name: "cellPictureHost",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: cellPictureHostKey,
        state: {
          init: (_config, state) => cellPictureHostDecorations(state.doc),
          apply: (tr, previous) => (tr.docChanged ? cellPictureHostDecorations(tr.doc) : previous),
        },
        props: {
          decorations: (state) => cellPictureHostKey.getState(state),
        },
      }),
    ];
  },
});
