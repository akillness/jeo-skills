/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Docs adapter for the shared Office table gallery (the Presentation
 * editor's 74 table styles, written to Word as real table styles by
 * `lib/office-table-style-word.ts`).
 *
 * Two kinds of table carry a style here:
 *
 * - an imported Word table carries its native identity in
 *   `source.tableDesignAuthority` (`w:tblStyle` + `w:tblLook`); a gallery
 *   choice becomes that authority's `styleId`, and the server writes the
 *   style into `styles.xml` when the page is saved;
 * - an editor table carries the gallery style's id in `tableStyleTheme` and
 *   the Table Style Options in its own attrs (the header row is the first
 *   row's `tableHeader` cells). The client exporter writes the same style.
 *
 * A style is matched by NAME, the identity Word uses: a document that already
 * defines "Medium Style 2 - Accent 1" is showing that gallery style, drawn
 * with the document's own definition.
 */
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";

import {
  documentDefinedTableStyles,
  documentOfficeTableStyleForId,
  documentTableDesignAuthorityFromNode,
  documentTableStyleCatalogFromDoc,
  type DocumentTableDesignState,
  type DocumentTableLook,
  type DocumentTableStyleVisualAuthority,
} from "../../../../lib/document-table-design-authority";
import {
  OFFICE_WORD_DEFAULT_TABLE_LOOK,
  officeWordTableStyleBySlot,
  officeWordTableStyleIdFor,
  officeWordTableStyleVisual,
  documentThemeColorsForExport,
  type OfficeWordThemeColors,
} from "../../../../lib/office-table-style-word";

import {
  getTableStyleTheme,
  locateTableStyleCells,
  tableStyleOptionsFromAttrs,
} from "./tableStyleGallery";

export { documentDefinedTableStyles, documentOfficeTableStyleForId };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function documentOfficeTableTheme(
  doc: ProseMirrorNode,
): OfficeWordThemeColors {
  return documentThemeColorsForExport(doc.attrs);
}

/** The id this document writes for a gallery slot (reused or allocated). */
export function documentOfficeTableStyleIdForSlot(
  doc: ProseMirrorNode,
  slot: number,
): string | null {
  const style = officeWordTableStyleBySlot(slot);
  return style
    ? officeWordTableStyleIdFor(style, documentDefinedTableStyles(doc)).styleId
    : null;
}

/**
 * How a style id paints: the document's own definition when its styles part
 * has one (the importer's catalogue), otherwise the gallery definition in the
 * document's theme.
 */
export function documentTableStyleVisualForId(
  doc: ProseMirrorNode,
  styleId: string | null | undefined,
  catalog: ReadonlyMap<string, DocumentTableStyleVisualAuthority> | null = null,
): DocumentTableStyleVisualAuthority | null {
  if (!styleId) return null;
  const own =
    catalog?.get(styleId) ??
    documentTableStyleCatalogFromDoc(doc).find(
      (entry) => entry.styleId === styleId,
    )?.visual;
  if (own) return own;
  const style = documentOfficeTableStyleForId(doc, styleId);
  return style
    ? officeWordTableStyleVisual(style, styleId, documentOfficeTableTheme(doc))
    : null;
}

/** A table the source package owns: its style lives in the package, not here. */
export function isSourceBoundDocxTable(node: ProseMirrorNode): boolean {
  return record(node.attrs.source)?.adapter === "docx";
}

export function localOfficeTableLook(node: ProseMirrorNode): DocumentTableLook {
  const options = tableStyleOptionsFromAttrs(node.attrs);
  return {
    firstRow: locateTableStyleCells(node, 0).geometry.hasHeaderRow,
    lastRow: options.totalRow,
    firstColumn: options.firstColumn,
    lastColumn: options.lastColumn,
    bandedRows: options.bandedRows,
    bandedColumns: options.bandedColumns,
  };
}

/** The gallery style an editor table wears, or null (none / legacy recipe). */
export function localOfficeTableStyleId(
  doc: ProseMirrorNode,
  node: ProseMirrorNode,
): string | null {
  const id = node.attrs.tableStyleTheme;
  if (typeof id !== "string" || getTableStyleTheme(id)) return null;
  if (documentTableDesignAuthorityFromNode(node)) return null;
  return documentOfficeTableStyleForId(doc, id) ? id : null;
}

export function localOfficeTableDesignState(
  doc: ProseMirrorNode,
  node: ProseMirrorNode,
): DocumentTableDesignState | null {
  const styleId = localOfficeTableStyleId(doc, node);
  return styleId ? { styleId, look: localOfficeTableLook(node) } : null;
}

/**
 * The look a gallery application gives an editor table. A table that never
 * chose a style or an option starts from Word's own default look (header
 * row, first column, banded rows: `w:tblLook w:val="04A0"`); otherwise the
 * Table Style Options stay exactly as the author set them.
 */
export function localOfficeTableLookForApplication(
  node: ProseMirrorNode,
): DocumentTableLook {
  const look = localOfficeTableLook(node);
  const untouched =
    node.attrs.tableStyleTheme == null &&
    !Object.values(look).some(Boolean);
  return untouched ? OFFICE_WORD_DEFAULT_TABLE_LOOK : look;
}

export function findSelectedDocumentTable(
  editor: Editor,
): { pos: number; node: ProseMirrorNode } | null {
  const { from, to } = editor.state.selection;
  let best: { pos: number; node: ProseMirrorNode } | null = null;
  // Only the nodes the selection overlaps: the toolbar asks on every render.
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "table") return true;
    if (to <= pos || from >= pos + node.nodeSize) return true;
    if (!best || node.nodeSize <= best.node.nodeSize) best = { pos, node };
    return true;
  });
  return best;
}

function rebuildEditorTable(
  editor: Editor,
  target: { pos: number; node: ProseMirrorNode },
  attrs: Record<string, unknown>,
  options: { clearCellStyle: boolean; headerRow: boolean | null },
): boolean {
  const { state } = editor;
  const header = state.schema.nodes.tableHeader;
  const cell = state.schema.nodes.tableCell;
  const rows: ProseMirrorNode[] = [];
  let rowIndex = 0;
  target.node.forEach((row) => {
    const cells: ProseMirrorNode[] = [];
    row.forEach((child) => {
      let type = child.type;
      if (
        options.headerRow !== null &&
        rowIndex === 0 &&
        header &&
        cell &&
        (child.type === header || child.type === cell)
      ) {
        type = options.headerRow ? header : cell;
      }
      const nextAttrs = options.clearCellStyle
        ? { ...child.attrs, backgroundColor: null, borderStyle: null }
        : child.attrs;
      cells.push(type.create(nextAttrs, child.content, child.marks));
    });
    rows.push(row.type.create(row.attrs, cells, row.marks));
    rowIndex += 1;
  });
  const replacement = target.node.type.create(
    { ...target.node.attrs, ...attrs },
    rows,
    target.node.marks,
  );
  if (replacement.eq(target.node)) return false;
  const selection = state.selection.toJSON();
  let tr = state.tr.replaceWith(
    target.pos,
    target.pos + target.node.nodeSize,
    replacement,
  );
  try {
    tr = tr.setSelection(Selection.fromJSON(tr.doc, selection));
  } catch {
    // A structural drift that invalidates the old selection maps it instead.
  }
  editor.view.dispatch(closeHistory(tr).scrollIntoView());
  return true;
}

/**
 * Apply one gallery slot (or clear the style, `null`) to the editor table
 * holding the selection, in one undoable transaction. As in the Presentation
 * gallery, an explicit application replaces direct cell shading so the
 * style is what shows; text, merges and direct borders stay.
 */
export function applyDocumentOfficeTableStyle(
  editor: Editor,
  slot: number | null,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const target = findSelectedDocumentTable(editor);
  if (
    !target ||
    documentTableDesignAuthorityFromNode(target.node) ||
    isSourceBoundDocxTable(target.node)
  ) {
    return false;
  }
  if (slot === null) {
    return rebuildEditorTable(
      editor,
      target,
      { tableStyleTheme: null },
      { clearCellStyle: true, headerRow: null },
    );
  }
  const styleId = documentOfficeTableStyleIdForSlot(editor.state.doc, slot);
  if (!styleId) return false;
  const look = localOfficeTableLookForApplication(target.node);
  return rebuildEditorTable(
    editor,
    target,
    {
      tableStyleTheme: styleId,
      tableStyleTotalRow: look.lastRow,
      tableStyleFirstColumn: look.firstColumn,
      tableStyleLastColumn: look.lastColumn,
      tableStyleBandedRows: look.bandedRows,
      tableStyleBandedColumns: look.bandedColumns,
    },
    { clearCellStyle: true, headerRow: look.firstRow },
  );
}

/**
 * One Table Style Options switch on an editor table that wears a gallery
 * style or no style: only the switch changes (Word's `w:tblLook`), nothing is
 * stamped onto cells. The header row is the first row's header cells.
 */
export function toggleDocumentOfficeTableOption(
  editor: Editor,
  key: keyof DocumentTableLook,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const target = findSelectedDocumentTable(editor);
  if (!target || documentTableDesignAuthorityFromNode(target.node)) return false;
  const look = localOfficeTableLook(target.node);
  if (key === "firstRow") {
    return rebuildEditorTable(editor, target, {}, {
      clearCellStyle: false,
      headerRow: !look.firstRow,
    });
  }
  const attr = {
    lastRow: "tableStyleTotalRow",
    firstColumn: "tableStyleFirstColumn",
    lastColumn: "tableStyleLastColumn",
    bandedRows: "tableStyleBandedRows",
    bandedColumns: "tableStyleBandedColumns",
  }[key];
  return rebuildEditorTable(
    editor,
    target,
    { [attr]: !look[key] },
    { clearCellStyle: false, headerRow: null },
  );
}

/** Whether a table's Table Style Options follow the gallery path. */
export function documentTableUsesOfficeGalleryOptions(
  editor: Editor,
): boolean {
  const target = findSelectedDocumentTable(editor);
  if (!target || documentTableDesignAuthorityFromNode(target.node)) return false;
  const id = target.node.attrs.tableStyleTheme;
  return id == null || !getTableStyleTheme(String(id));
}
