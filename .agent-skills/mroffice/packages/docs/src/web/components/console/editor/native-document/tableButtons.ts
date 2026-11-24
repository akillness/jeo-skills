/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Table Design / Table Layout button logic shared by the document toolbar and
 * the editor-command catalog: finding the table the selection owns, cell
 * formatting, table styles and style options, AutoFit, and the text <-> table
 * conversions. The toolbar keeps its dialogs, drafts and menus.
 */

import type { ChainedCommands, Editor, JSONContent } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { NodeSelection, Selection as ProseMirrorSelection, TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { twipsToPx } from "@mrnote/core/web/lib/document-tabstops.ts";
import type { DocumentTableCellMarginsValue } from "./DocumentTableCellMarginsDialog";
import {
  readDocumentTableDesignTarget,
  setDocumentTableDesignState,
  type DocumentTableLook,
} from "@mrnote/core/web/lib/document-table-design-authority.ts";
import { COLUMN_GAP_PX, resolveColumns } from "@mrnote/core/web/components/console/editor/native-document/documentLayout.ts";
import {
  applyDocumentOfficeTableStyle,
  documentOfficeTableStyleIdForSlot,
  documentTableUsesOfficeGalleryOptions,
  localOfficeTableLook,
  toggleDocumentOfficeTableOption,
} from "@mrnote/core/web/components/console/editor/native-document/documentOfficeTableStyles.ts";
import { activeSectionLayout } from "./layoutButtons";
import {
  logicalTableAtSelection,
  replaceLogicalTableFragments,
} from "./documentTextTransforms";
import { pageGeometryTwips } from "@mrnote/core/web/components/console/editor/native-document/pageSetup.ts";
import type { SectionLayout } from "@mrnote/core/web/components/console/editor/native-document/sectionLayouts.ts";
import {
  cellMarginsEqual,
  normalizeCellMargins,
  normalizeTableCellSpacingPx,
  normalizeTableCellSpacingTwips,
  normalizeCellBackgroundColor,
  normalizeCellBorderStyle,
  normalizeCellFormula,
  normalizeCellFormulaNumberFormat,
  normalizeCellTextAlign,
  normalizeCellTextDirection,
  normalizeCellVerticalAlign,
  serializeCellFormulaFieldInstruction,
  uniformCellMargins,
  type CellFormulaNumberFormat,
  type CellMargin,
  type CellMargins,
  type CellTextDirection,
} from "@mrnote/core/web/components/console/editor/native-document/tableCellStyle.ts";
import {
  commitDocumentTableProperties,
  type DocumentTablePropertiesChanges,
  type DocumentTablePropertiesCommitResult,
  type DocumentTablePropertiesTarget,
} from "./tableProperties";
import {
  defaultTableStyleOptionsForTheme,
  getTableStyleTheme,
  locateTableStyleCells,
  tableCellThemePatch,
  tableStyleNodeAttrs,
  tableStyleOptionsFromAttrs,
  tableStyleThemeFromAttrs,
  type TableStyleOptions,
} from "@mrnote/core/web/components/console/editor/native-document/tableStyleGallery.ts";
import {
  tableNodeToTextBlocks,
} from "./textTableConvert";

type TableStyleOptionKey = keyof TableStyleOptions;

// ---- Which table --------------------------------------------------------------

export function innermostTableAt($position: ResolvedPos): { pos: number; node: ProseMirrorNode } | null {
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    const node = $position.node(depth);
    if (node.type.name === "table") {
      return { pos: $position.before(depth), node };
    }
  }
  return null;
}

/**
 * Resolve the one table that may own contextual Ribbon tabs. Nested tables use
 * the innermost common table. A range spanning different tables (or table and
 * non-table content) is deliberately ambiguous and therefore exposes no table
 * tools; commands must never guess a target from a multi-object selection.
 */
export function findTableContextTarget(editor: Editor): { pos: number; node: ProseMirrorNode } | null {
  const { selection } = editor.state;
  if (selection instanceof NodeSelection && selection.node.type.name === "table") {
    return { pos: selection.from, node: selection.node };
  }
  const start = innermostTableAt(selection instanceof CellSelection ? selection.$anchorCell : selection.$from);
  const end = innermostTableAt(selection instanceof CellSelection ? selection.$headCell : selection.$to);
  return start && end && start.pos === end.pos ? start : null;
}

/**
 * Locate the table node that contains the current selection, returning its
 * document position + node, or `null` when the caret is not inside a table.
 * Prefers the SMALLEST overlapping table (a table nested in a cell wins over an
 * outer one), mirroring how the cell-controls snapshot resolves the active cell.
 */
export function findSelectedTable(editor: Editor): { pos: number; node: ProseMirrorNode } | null {
  const { from, to } = editor.state.selection;
  let best: { pos: number; node: ProseMirrorNode } | null = null;
  // Only the nodes the selection overlaps (the toolbar asks after every
  // transaction: a walk of the whole document twice a keystroke).
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "table") return true;
    const start = pos;
    const end = pos + node.nodeSize;
    if (to <= start || from >= end) return true; // no overlap with selection.
    if (!best || node.nodeSize <= best.node.nodeSize) {
      best = { pos, node };
    }
    return true;
  });
  return best;
}

/** The cell (tableCell / tableHeader) holding a position, with its position. */
function cellAt($position: ResolvedPos): number | null {
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    const name = $position.node(depth).type.name;
    if (name === "tableCell" || name === "tableHeader") return $position.before(depth);
  }
  return null;
}

/**
 * A text range from one cell to another of the same table becomes those
 * cells, as when a person drags across them; a range inside one cell stays.
 */
export function selectTargetCells(editor: Editor): void {
  const { selection, doc } = editor.state;
  if (selection instanceof CellSelection || selection instanceof NodeSelection) return;
  const fromCell = cellAt(selection.$from);
  const toCell = cellAt(selection.$to);
  if (fromCell === null || toCell === null || fromCell === toCell) return;
  const table = findTableContextTarget(editor);
  if (!table) return;
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(doc, fromCell, toCell)));
}

// ---- Cell formatting -------------------------------------------------------------

type CellChain = {
  setSelectedCellsAttribute: (name: string, value: unknown) => CellChain;
  alignSelectedCellParagraphs: (align: string) => CellChain;
  run: () => boolean;
};

/** Table Design ▸ Shading: the cells' fill; null clears it. */
export function setCellShading(chain: unknown, color: string | null): boolean {
  const next = color === null ? null : normalizeCellBackgroundColor(color);
  return (chain as CellChain).setSelectedCellsAttribute("backgroundColor", next).run();
}

/** Table Layout ▸ Alignment: one of the nine cell alignments. */
export function setCellAlignment(chain: unknown, horizontal: unknown, vertical: unknown): boolean {
  const nextHorizontal = normalizeCellTextAlign(horizontal);
  const nextVertical = normalizeCellVerticalAlign(vertical);
  if (nextHorizontal === null || nextVertical === null) return false;
  return (chain as CellChain)
    .setSelectedCellsAttribute("textAlign", nextHorizontal)
    .setSelectedCellsAttribute("verticalAlign", nextVertical)
    
    .alignSelectedCellParagraphs(nextHorizontal)
    .run();
}

/** Table Layout ▸ Text Direction. */
export function setCellTextDirection(chain: unknown, direction: CellTextDirection): boolean {
  const next = normalizeCellTextDirection(direction);
  if (next === null) return false;
  return (chain as CellChain).setSelectedCellsAttribute("textDirection", next).run();
}

/**
 * Cell Margins presets: uniform, written as the native four-edge object;
 * null clears the override back to the table default.
 */
export function setCellMargins(chain: unknown, margin: CellMargin | null): boolean {
  const next = margin === null ? null : uniformCellMargins(margin);
  return (chain as CellChain).setSelectedCellsAttribute("cellMargin", next).run();
}

/** Cell Margins per edge on the selected cells (Cell Options); null clears them. */
export function setCellMarginsPerEdge(chain: unknown, margins: CellMargins | null): boolean {
  return (chain as CellChain).setSelectedCellsAttribute("cellMargin", normalizeCellMargins(margins)).run();
}

// ---- Table styles ------------------------------------------------------------------

/**
 * Apply a one-click table-style theme/options state to the table containing the
 * selection. The theme is resolved to a per-cell
 * `{ backgroundColor, borderStyle }` recipe (pure, tested in tableStyleGallery)
 * and stamped onto EVERY cell of the table in a SINGLE transaction.
 *
 * The table node also owns the closed gallery/options state so save/hydration
 * can faithfully restore the controls. Every visual value is re-validated
 * through strict normalizers here. Returns true when a table was styled.
 */
export function applyTableStyleTheme(editor: Editor, themeId: string, optionOverride?: TableStyleOptions): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const theme = getTableStyleTheme(themeId);
  if (!theme) return false;
  const target = findSelectedTable(editor);
  if (!target) return false;

  const previousTheme = tableStyleThemeFromAttrs(target.node.attrs);
  const options =
    optionOverride ??
    (previousTheme ? tableStyleOptionsFromAttrs(target.node.attrs) : defaultTableStyleOptionsForTheme(theme));

  // Locate every cell (with absolute position) + the table geometry via the
  // shared pure walk (unit-tested in tableStyleGallery against a real document
  // node, so the position/header-detection math has no untested copy here).
  const { cells, geometry } = locateTableStyleCells(target.node, target.pos);

  const styledAttrs = new Map<ProseMirrorNode, Record<string, unknown>>();
  for (const cell of cells) {
    const patch = tableCellThemePatch(theme, geometry, cell.rowIndex, cell.columnIndex, options);
    const nextAttrs: Record<string, unknown> = { ...cell.node.attrs };
    // backgroundColor: a validated #rrggbb sets the fill; null clears it.
    nextAttrs.backgroundColor =
      patch.backgroundColor === null ? null : normalizeCellBackgroundColor(patch.backgroundColor);
    // borderStyle: a whitelisted preset, or leave the cell's existing border
    // untouched when the theme declines to set one (null → keep current).
    if (patch.borderStyle !== null) {
      nextAttrs.borderStyle = normalizeCellBorderStyle(patch.borderStyle);
    }
    styledAttrs.set(cell.node, nextAttrs);
  }
  if (cells.length === 0) return false;

  // Replace the same-shape table once instead of mutating every live TableView
  // cell independently. The custom TableView mirrors cell styles into DOM; a
  // later focus flush must never reparse those TD styles as inline highlight
  // marks or ask prosemirror-tables to repair a phantom grid. Explicit toolbar
  // activation is an atomic table edit, so a controlled same-size replacement
  // plus exact selection restore is the honest transaction boundary.
  const rows: ProseMirrorNode[] = [];
  target.node.forEach((row) => {
    const nextCells: ProseMirrorNode[] = [];
    row.forEach((cell) => {
      nextCells.push(cell.type.create(styledAttrs.get(cell) ?? cell.attrs, cell.content, cell.marks));
    });
    rows.push(row.type.create(row.attrs, nextCells, row.marks));
  });
  const replacement = target.node.type.create(
    { ...target.node.attrs, ...tableStyleNodeAttrs(theme, options) },
    rows,
    target.node.marks,
  );
  const selectionJson = editor.state.selection.toJSON();
  let tr = editor.state.tr.replaceWith(target.pos, target.pos + target.node.nodeSize, replacement);
  try {
    tr = tr.setSelection(ProseMirrorSelection.fromJSON(tr.doc, selectionJson));
  } catch {
    // Collaborative structural drift can invalidate a frozen selection; the
    // replacement itself remains table-local and ProseMirror maps it safely.
  }
  editor.view.dispatch(closeHistory(tr).scrollIntoView());
  return true;
}

/**
 * The Table Styles gallery's commit of one of Office's built-in styles (a
 * gallery slot) or Clear (null): a source-bound table takes the style id in
 * its table design, a page table the style's own recipe.
 */
export function commitDocumentTableStyleSlot(
  editor: Editor,
  slot: number | null,
  native = readDocumentTableDesignTarget(editor),
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  if (native) {
    const styleId = slot === null ? null : documentOfficeTableStyleIdForSlot(editor.state.doc, slot);
    if (styleId === undefined || (slot !== null && styleId === null)) return false;
    setDocumentTableDesignState(editor, native, { ...native.authority.current, styleId });
    return true;
  }
  return applyDocumentOfficeTableStyle(editor, slot);
}

/** Table Design ▸ Table Style Options on a source-bound table. */
export function toggleNativeTableLook(editor: Editor, key: keyof DocumentTableLook): boolean {
  const target = readDocumentTableDesignTarget(editor);
  if (!editor.isEditable || !target || !target.authority.receipt.editable) return false;
  const current = target.authority.current;
  setDocumentTableDesignState(editor, target, {
    ...current,
    look: { ...current.look, [key]: !current.look[key] },
  });
  return true;
}

/** Table Style Options on a page table wearing a legacy one-click recipe. */
export function toggleTableStyleOption(editor: Editor, option: TableStyleOptionKey): boolean {
  const target = findSelectedTable(editor);
  if (!target || editor.isDestroyed || !editor.isEditable) return false;
  const theme = tableStyleThemeFromAttrs(target.node.attrs) ?? getTableStyleTheme("banded-grey");
  if (!theme) return false;
  const options = tableStyleOptionsFromAttrs(target.node.attrs);
  const nextOptions = { ...options, [option]: !options[option] };
  return applyTableStyleTheme(editor, theme.id, nextOptions);
}

/** Header Row on a page table: the header row, then the recipe restamped. */
export function toggleTableHeaderRow(editor: Editor, chain: unknown): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const target = findSelectedTable(editor);
  const theme = tableStyleThemeFromAttrs(target?.node.attrs);
  const options = tableStyleOptionsFromAttrs(target?.node.attrs);
  if (!(chain as { toggleHeaderRow: () => { run: () => boolean } }).toggleHeaderRow().run()) return false;
  if (theme) applyTableStyleTheme(editor, theme.id, options);
  return true;
}

const LOCAL_OPTION_BY_LOOK: Partial<Record<keyof DocumentTableLook, TableStyleOptionKey>> = {
  lastRow: "totalRow",
  firstColumn: "firstColumn",
  lastColumn: "lastColumn",
  bandedRows: "bandedRows",
  bandedColumns: "bandedColumns",
};

/**
 * One Table Style Options checkbox. A source-bound table keeps the option in
 * its design; a table wearing an Office gallery style (or none) keeps each
 * option as Word's w:tblLook switch; only legacy recipes restamp their cells.
 * `chain` is the table chain the Header Row toggle runs on.
 */
export function toggleTableDesignLook(
  editor: Editor,
  key: keyof DocumentTableLook,
  chain: () => unknown,
  nativeTarget = readDocumentTableDesignTarget(editor),
): boolean {
  if (nativeTarget) return toggleNativeTableLook(editor, key);
  if (key !== "firstRow" && documentTableUsesOfficeGalleryOptions(editor)) {
    return toggleDocumentOfficeTableOption(editor, key);
  }
  if (key === "firstRow") return toggleTableHeaderRow(editor, chain());
  const option = LOCAL_OPTION_BY_LOOK[key];
  return option ? toggleTableStyleOption(editor, option) : false;
}

// ---- AutoFit and conversions ---------------------------------------------------------

/**
 * Width AutoFit may occupy inside the current page/section column. It never
 * reads the editor shell DOM: ribbon/sidebar/window widths are not page
 * geometry. Unequal-column documents conservatively use the narrowest authored
 * column because block-to-column placement is not an editable model property.
 */
export function documentTableAutoFitWidthPx(
  layout: SectionLayout | null,
  docAttrs: Record<string, unknown>,
): number | undefined {
  let widthTwips: number;
  if (layout) {
    const printableTwips =
      layout.pageSize.widthTwips -
      layout.pageMargins.leftTwips -
      layout.pageMargins.rightTwips -
      layout.pageMargins.gutterTwips;
    const count = Math.max(1, Math.floor(layout.columns.count));
    const unequalWidths = layout.columns.equalWidth
      ? []
      : (layout.columns.items ?? [])
          .slice(0, count)
          .map((column) => column.widthTwips)
          .filter((value) => Number.isFinite(value) && value > 0);
    widthTwips =
      unequalWidths.length === count
        ? Math.min(...unequalWidths)
        : Math.floor((printableTwips - Math.max(0, layout.columns.spaceTwips) * (count - 1)) / count);
  } else {
    const geometry = pageGeometryTwips(
      docAttrs.pageSize,
      docAttrs.pageMargins,
      docAttrs.customPageSize,
      docAttrs.customPageMargins,
      docAttrs.pageOrientation,
    );
    const count = resolveColumns(docAttrs.columns);
    widthTwips = Math.floor(
      (geometry.width - geometry.left - geometry.right - COLUMN_GAP_PX * 15 * (count - 1)) / count,
    );
  }
  if (!Number.isFinite(widthTwips) || widthTwips <= 0) return undefined;
  const widthPx = twipsToPx(widthTwips);
  return widthPx > 0 ? widthPx : undefined;
}

/** AutoFit Window fills the actual printable section column. */
export function tableAutoFitWindowWidth(editor: Editor): number | undefined {
  return documentTableAutoFitWidthPx(activeSectionLayout(editor), editor.state.doc.attrs as Record<string, unknown>);
}

/**
 * Run an AutoFit (or Fixed Column Width) command on the chain and keep the
 * selection on the same table, refusing when the command moved it elsewhere.
 */
export function runTableAutoFit(editor: Editor, chain: ChainedCommands, command: (chain: ChainedCommands) => ChainedCommands): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const target = findTableContextTarget(editor);
  if (!target) return false;
  const selectionJson = editor.state.selection.toJSON();
  return command(chain)
    .command(({ tr }) => {
      try {
        const restored = ProseMirrorSelection.fromJSON(tr.doc, selectionJson);
        const nextTable = tr.doc.nodeAt(target.pos);
        if (!nextTable || nextTable.type.name !== "table") return false;
        const ownsSelection =
          restored instanceof NodeSelection
            ? restored.from === target.pos && restored.node.type.name === "table"
            : restored.from > target.pos && restored.to < target.pos + nextTable.nodeSize;
        if (!ownsSelection) return false;
        tr.setSelection(restored).scrollIntoView();
        return true;
      } catch {
        return false;
      }
    })
    .run();
}







export function convertTableToText(
  editor: Editor,
  chain: ChainedCommands,
  pos: number,
  separator: Parameters<typeof tableNodeToTextBlocks>[1],
): boolean {
  const liveNode = editor.state.doc.nodeAt(pos);
  if (!liveNode || liveNode.type.name !== "table") return false;
  // The whole LOGICAL table converts: a table pagination cut across pages is
  
  const { table, fragments } = logicalTableAtSelection(editor.state.doc, {
    node: liveNode,
    pos,
  });
  const paragraphs = tableNodeToTextBlocks(table.toJSON(), separator);
  if (!paragraphs) return false;
  let nodes: ProseMirrorNode[];
  try {
    nodes = paragraphs.map((json) => editor.schema.nodeFromJSON(json));
  } catch {
    return false;
  }
  const doc = editor.state.doc;
  return chain
    .command(({ tr }) => {
      if (tr.doc !== doc) return false;
      if (!replaceLogicalTableFragments(tr, fragments, nodes)) return false;
      const head = fragments[0]!.pos;
      tr.setSelection(TextSelection.near(tr.doc.resolve(head + 1)));
      return true;
    })
    .run();
}

/** The Table Style Options checkboxes as the ribbon shows them for the table. */
export function currentTableDesignLook(editor: Editor): DocumentTableLook | null {
  const native = readDocumentTableDesignTarget(editor);
  if (native) return native.authority.current.look;
  const table = findSelectedTable(editor);
  return table ? localOfficeTableLook(table.node) : null;
}

/**
 * Table Layout ▸ Formula OK on one cell (null clears it): Word's `= SUM(ABOVE)`
 * style formula and number format, validated by the closed formula grammar
 * before any field is written. The selection is restored from its JSON.
 */
export function writeTableCellFormula(
  editor: Editor,
  pos: number,
  formula: string | null,
  numberFormat: CellFormulaNumberFormat | null,
  selectionJson: unknown,
): boolean {
  const liveNode = editor.state.doc.nodeAt(pos);
  if (!liveNode || (liveNode.type.name !== "tableCell" && liveNode.type.name !== "tableHeader")) return false;
  const normalizedFormula = formula === null ? null : normalizeCellFormula(formula);
  if (formula !== null && normalizedFormula === null) return false;
  const normalizedNumberFormat = normalizedFormula === null ? null : normalizeCellFormulaNumberFormat(numberFormat);
  if (normalizedFormula && numberFormat && !normalizedNumberFormat) return false;
  if (normalizedFormula && !serializeCellFormulaFieldInstruction(normalizedFormula, normalizedNumberFormat)) {
    return false;
  }
  const transaction = editor.state.tr.setNodeMarkup(
    pos,
    undefined,
    { ...liveNode.attrs, formula: normalizedFormula, formulaNumberFormat: normalizedNumberFormat },
    liveNode.marks,
  );
  let restoredSelection: ProseMirrorSelection;
  try {
    restoredSelection = ProseMirrorSelection.fromJSON(transaction.doc, selectionJson as Record<string, unknown>);
  } catch {
    return false;
  }
  closeHistory(transaction.setSelection(restoredSelection).scrollIntoView());
  if (transaction.docChanged) editor.view.dispatch(transaction);
  return true;
}

/**
 * Table Properties OK with the dialog's fields as the table has them and the
 * given ones changed: the dialog's own commit, without its Options pane.
 */
export function commitDocumentTablePropertiesFromTarget(
  editor: Editor,
  target: DocumentTablePropertiesTarget,
  overrides: Partial<Pick<DocumentTablePropertiesChanges, "tableAlign" | "tableIndentPx" | "tableCaption" | "tableDescription">>,
): DocumentTablePropertiesCommitResult {
  return commitDocumentTableProperties(editor, target, {
    tableAlign: target.tableAlign,
    tableIndentPx: target.tableIndentPx,
    tablePositioning: target.tablePositioning,
    tableCaption: target.tableCaption,
    tableDescription: target.tableDescription,
    rows: target.rows.map((row) => ({
      index: row.index,
      allowBreakAcrossPages: row.allowBreakAcrossPages,
      repeatHeader: row.repeatHeader,
    })),
    cells: target.cells.map((cell) => ({ index: cell.index, verticalAlign: cell.verticalAlign })),
    ...overrides,
  });
}

// ---- Cell Margins dialog (Table Properties > Options) -------------------------

/**
 * Whether Word resizes this table to its contents (Table Options'
 * "Automatically resize to fit contents"): the stored choice, else what the
 * DOCX writer emits for the table's shape (an AutoFit policy or no column
 * widths = autofit; explicit column widths = fixed).
 */
export function tableAutoResizes(table: ProseMirrorNode): boolean {
  const stored = table.attrs.tableLayoutType;
  if (stored === "fixed") return false;
  if (stored === "autofit") return true;
  if (table.attrs.tableLayoutPolicy) return true;
  let widthed = false;
  table.descendants((node) => {
    if (widthed) return false;
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      if (Array.isArray(node.attrs.colwidth) && node.attrs.colwidth.some(Boolean)) {
        widthed = true;
      }
      return false;
    }
    return true;
  });
  return !widthed;
}

/**
 * The table's attrs with the Table Options dialog's default cell margins
 * (per edge), cell spacing and automatic resize, or null when it already has
 * them.
 */
export function documentTableCellMarginsAttrs(
  liveNode: ProseMirrorNode,
  { margins, cellSpacingPx, autoResize }: DocumentTableCellMarginsValue,
): Record<string, unknown> | null {
  const next = normalizeCellMargins(margins);
  const nextSpacing = normalizeTableCellSpacingPx(cellSpacingPx);
  const currentSpacing = normalizeTableCellSpacingPx(
    liveNode.attrs.tableCellSpacingPx,
  );
  const layoutType =
    autoResize === undefined || autoResize === tableAutoResizes(liveNode)
      ? liveNode.attrs.tableLayoutType ?? null
      : autoResize
        ? "autofit"
        : "fixed";
  if (
    cellMarginsEqual(liveNode.attrs.tableCellMargin, next) &&
    currentSpacing === nextSpacing &&
    layoutType === (liveNode.attrs.tableLayoutType ?? null)
  ) {
    return null;
  }
  return {
    ...liveNode.attrs,
    tableLayoutType: layoutType,
    tableCellMargin: next,
    tableCellSpacingPx: nextSpacing,
    tableCellSpacingTwips:
      currentSpacing === nextSpacing
        ? normalizeTableCellSpacingTwips(liveNode.attrs.tableCellSpacingTwips)
        : null,
  };
}
