/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension, getTextSerializersFromSchema } from "@tiptap/core";
import type { Fragment, Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";

import { DELETION_MARK_NAME } from "@mrnote/core/web/components/console/editor/native-document/trackChanges.ts";
import { citationDisplayText } from "@mrnote/core/web/components/console/editor/native-document/citationExtension.tsx";
import { CITATION_MARK_NAME } from "@mrnote/core/web/components/console/editor/native-document/citations.ts";
import {
  SPLITTABLE_BLOCK_TYPE,
  SPLIT_CONTINUES_ATTR,
  isContinuationTail,
} from "@mrnote/core/web/components/console/editor/native-document/paged/blockSplitting.ts";
import { markupFilterHidesDeletions, readMarkupFilter } from "@mrnote/core/web/components/console/editor/native-document/trackChangesExtension.ts";

const BLOCK_SEPARATOR = "\n\n";
const TABLE_TYPES = new Set(["table"]);
const ROW_TYPES = new Set(["tableRow"]);
const CELL_TYPES = new Set(["tableCell", "tableHeader"]);

interface TextProjectionOptions {
  hideDeletions: boolean;
  serializers: ReturnType<typeof getTextSerializersFromSchema>;
}

function isDeleted(node: ProseMirrorNode): boolean {
  return node.marks.some((mark) => mark.type.name === DELETION_MARK_NAME);
}

/** One inline node as the reader sees it. */
function inlineNodeText(
  child: ProseMirrorNode,
  parent: ProseMirrorNode,
  options: TextProjectionOptions,
): string {
  if (child.isText) {
    return options.hideDeletions && isDeleted(child) ? "" : (child.text ?? "");
  }
  const serializer = options.serializers[child.type.name];
  if (serializer) {
    return serializer({ node: child, pos: 0, parent, index: 0, range: { from: 0, to: 0 } });
  }
  return child.content.size > 0 ? inlineText(child, options) : "";
}

/** Inline content of one text block, in reading order. */
function inlineText(node: ProseMirrorNode, options: TextProjectionOptions): string {
  let out = "";
  node.forEach((child) => {
    out += inlineNodeText(child, node, options);
  });
  return out;
}






function blockPieces(fragment: Fragment, options: TextProjectionOptions): string[] {
  const pieces: string[] = [];
  collectBlockPieces(fragment, options, pieces, { head: null });
  return pieces;
}







interface OpenSplitHead {
  head: { index: number; type: string } | null;
}

function collectBlockPieces(
  fragment: Fragment,
  options: TextProjectionOptions,
  pieces: string[],
  open: OpenSplitHead,
): void {
  let inline: string | null = null;
  const flushInline = () => {
    if (inline !== null) pieces.push(inline);
    inline = null;
  };
  fragment.forEach((node) => {
    if (node.isInline) {
      inline = (inline ?? "") + inlineNodeText(node, node, options);
      return;
    }
    flushInline();
    if (TABLE_TYPES.has(node.type.name)) {
      pieces.push(tableText(node, options));
      return;
    }
    if (node.isTextblock) {
      const text = inlineText(node, options);
      const head = open.head;
      if (head && isContinuationTail(node) && head.type === node.type.name) {
        // A code block's cut consumed the newline between its lines.
        pieces[head.index] +=
          node.type.name === SPLITTABLE_BLOCK_TYPE ? `\n${text}` : text;
      } else {
        pieces.push(text);
        open.head = { index: pieces.length - 1, type: node.type.name };
      }
      if (node.attrs?.[SPLIT_CONTINUES_ATTR] !== true) open.head = null;
      return;
    }
    if (node.isLeaf) {
      const serializer = options.serializers[node.type.name];
      if (serializer) {
        pieces.push(serializer({ node, pos: 0, parent: node, index: 0, range: { from: 0, to: 0 } }));
      }
      return;
    }
    collectBlockPieces(node.content, options, pieces, open);
  });
  flushInline();
}

/** A cell's paragraphs, one line each. */
function cellText(cell: ProseMirrorNode, options: TextProjectionOptions): string {
  return blockPieces(cell.content, options).join("\n");
}

/** Rows on lines, cells separated by a Tab — the grid a spreadsheet reads. */
function tableText(table: ProseMirrorNode, options: TextProjectionOptions): string {
  const rows: string[] = [];
  const visit = (node: ProseMirrorNode): void => {
    node.forEach((child) => {
      if (ROW_TYPES.has(child.type.name)) {
        const cells: string[] = [];
        child.forEach((cell) => {
          if (CELL_TYPES.has(cell.type.name)) cells.push(cellText(cell, options));
        });
        rows.push(cells.join("\t"));
      } else if (!child.isTextblock && !child.isLeaf) {
        visit(child);
      }
    });
  };
  visit(table);
  return rows.join("\n");
}

function projectionOptions(state: EditorState, schema: Schema): TextProjectionOptions {
  return {
    hideDeletions: markupFilterHidesDeletions(readMarkupFilter(state)),
    serializers: {
      ...getTextSerializersFromSchema(schema),
      
      [CITATION_MARK_NAME]: ({ node }) => citationDisplayText(state.doc, node, ""),
    },
  };
}

/**
 * The plain text of the current selection as the reader sees it (exported
 * for tests and for callers that write the clipboard themselves).
 */
export function selectionPlainText(state: EditorState): string {
  const options = projectionOptions(state, state.schema);
  const { selection, doc } = state;
  if (selection instanceof CellSelection) {
    // One range per selected cell; group them by row so a rectangle of cells
    // keeps its columns and rows.
    const rows = new Map<number, string[]>();
    const ordered = [...selection.ranges].sort((a, b) => a.$from.pos - b.$from.pos);
    for (const { $from, $to } of ordered) {
      let rowPos = -1;
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        if (ROW_TYPES.has($from.node(depth).type.name)) {
          rowPos = $from.before(depth);
          break;
        }
      }
      const cell = doc.cut($from.pos, $to.pos);
      const text = blockPieces(cell.content, options).join("\n");
      const row = rows.get(rowPos) ?? [];
      row.push(text);
      rows.set(rowPos, row);
    }
    return [...rows.values()].map((cells) => cells.join("\t")).join("\n");
  }
  const ranges = [...selection.ranges].sort((a, b) => a.$from.pos - b.$from.pos);
  return ranges
    .map(({ $from, $to }) => {
      const slice = doc.slice($from.pos, $to.pos);
      return blockPieces(slice.content, options).join(BLOCK_SEPARATOR);
    })
    .join(BLOCK_SEPARATOR);
}

export const ClipboardTextProjection = Extension.create({
  name: "clipboardTextProjection",
  // Ahead of TipTap's own clipboardTextSerializer: ProseMirror takes the
  // first plugin that provides the prop.
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("clipboardTextProjection"),
        props: {
          clipboardTextSerializer: (_slice, view) => selectionPlainText(view.state),
        },
      }),
    ];
  },
});

export default ClipboardTextProjection;
