"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * 表格 on a PDF page: the page's tables made in MRAI (managed-table.ts),
 * shown and edited where they stand. A table is drawn as the native writer
 * draws it (managed_table.py): its columns' shares, a cell's inner margin
 * and line height, the managed text box's faces; the page's revision paints
 * it too, so the layer covers its own copy only while it is selected.
 *
 * Click selects a table (its frame, the move grip, the size handle);
 * double-click or typing in a cell edits its words; Tab / Shift+Tab move to
 * the next / previous cell (Tab in the last cell adds a row, as in Word);
 * Esc leaves the cell; Delete with the table selected takes it out.
 */
import { pdfAnnotationSlotStyle } from "../../../../lib/pdf/annotation-stack-order";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { FONT_STACK } from "../../../../lib/pdf/font-resolve";
import { ensurePdfEastAsianFace, PDF_EAST_ASIAN_CSS_FAMILY } from "../../../../lib/pdf/east-asian-face";
import {
  insertPdfTableRow,
  managedNativeTableDirective,
  pdfTableRange,
  PDF_TABLE_CELL_PADDING_EM,
  PDF_TABLE_LINE_HEIGHT,
  PDF_TABLE_MAX_CELL_TEXT,
  updatePdfTableCell,
  type PdfTable,
} from "../../../../lib/pdf/managed-table";

export interface PdfTableCellAddress {
  readonly tableId: string;
  readonly row: number;
  readonly column: number;
  /** Shift+click: the range's other corner (cells in between selected). */
  readonly endRow?: number;
  readonly endColumn?: number;
}

export interface PdfTableLayerProps {
  readonly tables: readonly PdfTable[];
  /** CSS pixels of the page as shown. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  /** CSS pixels a PDF point takes as shown. */
  readonly pxPerPoint: number;
  /** The tables the page's revision already paints, by id: their directive
   * as saved. One unchanged since is left to the page (the layer keeps only
   * its hit target) until it is selected, moved or edited. */
  readonly paintedDirectives: ReadonlyMap<string, string>;
  readonly writable: boolean;
  readonly selection: PdfTableCellAddress | { readonly tableId: string; readonly row?: undefined } | null;
  readonly onSelectionChange: (selection: PdfTableCellAddress | { readonly tableId: string } | null) => void;
  readonly onChange: (table: PdfTable) => void;
  readonly onDelete: (table: PdfTable) => void;
  /** Each object's place in the page's stack of annotations the reader
   * draws itself (lib/pdf/annotation-stack-order.ts), back first: the slot
   * is stacked at it, so the screen keeps the page's /Annots order. */
  readonly stackRanks?: ReadonlyMap<string, number>;
  readonly t: (key: string, values?: Record<string, string | number>) => string;
}

/** The writer's faces: a line's Latin in the class's base-14 face, its East
 * Asian characters in the bundled one (managed_table.py, as a text box). */
function cellFamily(font: PdfTable["font"]): string {
  const stack = FONT_STACK[font].split(", ");
  return [...stack.slice(0, -1), PDF_EAST_ASIAN_CSS_FAMILY, stack[stack.length - 1]].join(", ");
}

/** The next cell along a row, then down (Tab), or back (Shift+Tab). */
function adjacentCell(table: PdfTable, row: number, column: number, back: boolean): { row: number; column: number } | null {
  const slots: { row: number; column: number }[] = [];
  table.rows.forEach((tableRow, rowIndex) => tableRow.cells.forEach((cell, columnIndex) => {
    if (cell) slots.push({ row: rowIndex, column: columnIndex });
  }));
  const index = slots.findIndex((slot) => slot.row === row && slot.column === column);
  return slots[index + (back ? -1 : 1)] ?? null;
}

export function PdfTableLayer({
  tables, cssWidth, cssHeight, pxPerPoint, paintedDirectives, writable, selection, onSelectionChange, onChange, onDelete, t,
  stackRanks,
}: PdfTableLayerProps) {
  const [editing, setEditing] = useState<PdfTableCellAddress | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ id: string; kind: "move" | "size" | "column"; column?: number; dx: number; dy: number; startX: number; startY: number } | null>(null);
  // The cells' East Asian face, for a page that has a table: every page of
  // every PDF mounts this layer, and loaded for all of them the face (10.6 MB)
  // was downloaded, hashed and parsed by each PDF that opened, tables or not.
  const hasTables = tables.length > 0;
  useEffect(() => { if (hasTables) void ensurePdfEastAsianFace(); }, [hasTables]);
  const selectedId = selection?.tableId ?? null;
  const gridRefs = useRef(new Map<string, HTMLTableElement>());
  // The frame follows the rows as laid out (a cell's words wrapping, a row
  // taller than its least height): the table keeps the height it shows, so
  // the writer's frame and the page's copy stand where the layer's does.
  useLayoutEffect(() => {
    if (!writable || drag || editing || !(cssHeight > 0)) return;
    for (const table of tables) {
      const grid = gridRefs.current.get(table.id);
      if (!grid) continue;
      const shown = grid.getBoundingClientRect().height / cssHeight;
      if (Number.isFinite(shown) && shown > 0 && Math.abs(shown - table.height) * cssHeight > 1.5 && table.y + shown <= 1) {
        onChange({ ...table, height: shown });
        return;
      }
    }
  }, [cssHeight, drag, editing, onChange, tables, writable]);

  // The cell being edited takes the keyboard at once, its caret at the end.
  useLayoutEffect(() => {
    const node = editorRef.current;
    if (!editing || !node) return;
    node.focus({ preventScroll: true });
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const selected = node.ownerDocument.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
  }, [editing]);

  const commitCell = useCallback((table: PdfTable, row: number, column: number, text: string) => {
    const cell = table.rows[row]?.cells[column];
    if (!cell || cell.text === text) return table;
    const next = updatePdfTableCell(table, row, column, { text: text.slice(0, PDF_TABLE_MAX_CELL_TEXT) });
    onChange(next);
    return next;
  }, [onChange]);

  const leaveCell = useCallback((table: PdfTable, move?: { back: boolean }) => {
    const node = editorRef.current;
    if (!editing || !node) return;
    const text = (node.innerText ?? node.textContent ?? "").replace(/\r\n?/g, "\n").replace(/\n$/, "");
    let current = commitCell(table, editing.row, editing.column, text);
    if (!move) {
      setEditing(null);
      onSelectionChange({ tableId: table.id, row: editing.row, column: editing.column });
      return;
    }
    let target = adjacentCell(current, editing.row, editing.column, move.back);
    if (!target && !move.back) {
      // Tab in the last cell: a new row, as in Word and PowerPoint.
      current = insertPdfTableRow(current, current.rows.length - 1, true);
      onChange(current);
      target = { row: current.rows.length - 1, column: 0 };
    }
    if (!target) return;
    const address = { tableId: table.id, row: target.row, column: target.column };
    setEditing(address);
    onSelectionChange(address);
  }, [commitCell, editing, onChange, onSelectionChange]);

  // A press elsewhere on the page ends the table's selection (its ribbon,
  // menus and colour palette are the table's own and keep it).
  useEffect(() => {
    if (!selectedId || editing) return;
    const onPress = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest) return;
      if (target.closest('.pdf-viewer__table, .pdf-viewer__office-ribbon, .office-color-palette, [data-radix-popper-content-wrapper], [role="dialog"], [role="menu"]')) return;
      onSelectionChange(null);
    };
    document.addEventListener("pointerdown", onPress, true);
    return () => document.removeEventListener("pointerdown", onPress, true);
  }, [editing, onSelectionChange, selectedId]);

  // Delete with a table selected (no cell open) takes it out.
  useEffect(() => {
    if (!selectedId || editing || !writable) return;
    const table = tables.find((entry) => entry.id === selectedId);
    if (!table) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onDelete(table);
        onSelectionChange(null);
      } else if (event.key === "Escape") {
        onSelectionChange(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing, onDelete, onSelectionChange, selectedId, tables, writable]);

  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>, table: PdfTable, kind: "move" | "size" | "column", column?: number) => {
    if (!writable || event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ id: table.id, kind, ...(column !== undefined ? { column } : {}), dx: 0, dy: 0, startX: event.clientX, startY: event.clientY });
  }, [writable]);
  /** The columns' shares with the border after `column` dragged `dx` CSS
   * pixels: the two columns beside it share their width (Word's border drag). */
  const draggedColumns = useCallback((table: PdfTable, column: number, dx: number): number[] => {
    const shares = [...table.columns];
    const width = table.width * cssWidth;
    if (!(width > 0) || column < 0 || column >= shares.length - 1) return shares;
    const minimum = Math.min(shares[column], shares[column + 1], 0.03);
    const pair = shares[column] + shares[column + 1];
    const left = Math.min(pair - minimum, Math.max(minimum, shares[column] + dx / width));
    shares[column] = left;
    shares[column + 1] = pair - left;
    return shares;
  }, [cssWidth]);
  const moveDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    setDrag((current) => current ? { ...current, dx: event.clientX - current.startX, dy: event.clientY - current.startY } : current);
  }, []);
  const endDrag = useCallback((table: PdfTable) => {
    const current = drag;
    setDrag(null);
    if (!current || current.id !== table.id || (Math.abs(current.dx) < 2 && Math.abs(current.dy) < 2)) return;
    if (current.kind === "column" && current.column !== undefined) {
      onChange({ ...table, columns: draggedColumns(table, current.column, current.dx) });
      return;
    }
    if (current.kind === "move") {
      const x = Math.min(1 - table.width, Math.max(0, table.x + current.dx / cssWidth));
      const y = Math.min(1 - table.height, Math.max(0, table.y + current.dy / cssHeight));
      onChange({ ...table, x, y });
      return;
    }
    // The corner: the table's width and its rows' least heights in
    // proportion (columns keep their shares).
    const width = Math.min(1 - table.x, Math.max(0.04, table.width + current.dx / cssWidth));
    const height = Math.min(1 - table.y, Math.max(table.fontSize * 2, table.height + current.dy / cssHeight));
    const ratio = height / table.height;
    onChange({ ...table, width, height, rows: table.rows.map((row) => ({ ...row, height: row.height * ratio })) });
  }, [cssHeight, cssWidth, drag, draggedColumns, onChange]);

  const tableStyles = useMemo(() => new Map(tables.map((table) => {
    const fontPx = table.fontSize * cssHeight;
    return [table.id, {
      fontPx,
      padding: PDF_TABLE_CELL_PADDING_EM * fontPx,
      border: table.borderColor && table.borderWidth > 0
        ? `${Math.max(0.5, table.borderWidth * pxPerPoint)}px solid ${table.borderColor}` : "none",
      painted: paintedDirectives.get(table.id) === managedNativeTableDirective(table),
    }];
  })), [cssHeight, paintedDirectives, pxPerPoint, tables]);

  if (tables.length === 0) return null;
  return (
    <div className="pdf-viewer__table-layer" data-testid="pdf-table-layer">
      {tables.map((table) => {
        const style = tableStyles.get(table.id)!;
        const selected = table.id === selectedId;
        const offset = drag && drag.id === table.id ? drag : null;
        const frame: CSSProperties = {
          left: (table.x * cssWidth) + (offset?.kind === "move" ? offset.dx : 0),
          top: (table.y * cssHeight) + (offset?.kind === "move" ? offset.dy : 0),
          width: Math.max(8, table.width * cssWidth + (offset?.kind === "size" ? offset.dx : 0)),
        };
        // Painted by the page and left alone: only its hit target. Shown,
        // the page's copy is covered where it stands (on the page's paper).
        const shown = !style.painted || selected || offset !== null;
        return (
          <div key={table.id} className="pdf-viewer__table-slot"
            data-stack-rank={stackRanks?.get(`table:${table.id}`)}
            style={pdfAnnotationSlotStyle(stackRanks?.get(`table:${table.id}`))}>
            {style.painted && shown ? (
              <div
                key="cover"
                className="pdf-viewer__table-cover"
                aria-hidden="true"
                style={{ left: table.x * cssWidth, top: table.y * cssHeight, width: table.width * cssWidth, height: table.height * cssHeight }}
              />
            ) : null}
          <div
            key="table"
            className={`pdf-viewer__table${selected ? " pdf-viewer__table--selected" : ""}${shown ? "" : " pdf-viewer__table--painted"}`}
            data-testid="pdf-table"
            data-table-id={table.id}
            style={{ ...frame, ...(style.painted && shown ? { background: "#FFFFFF" } : {}) }}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (!selected) onSelectionChange({ tableId: table.id });
            }}
          >
            <table
              ref={(node) => {
                if (node) gridRefs.current.set(table.id, node);
                else gridRefs.current.delete(table.id);
              }}
              className="pdf-viewer__table-grid"
              style={{ fontSize: style.fontPx, lineHeight: PDF_TABLE_LINE_HEIGHT }}
              aria-label={t("pdf.table.label")}
            >
              <colgroup>
                {(offset?.kind === "column" && offset.column !== undefined
                  ? draggedColumns(table, offset.column, offset.dx) : table.columns)
                  .map((share, index) => <col key={index} style={{ width: `${share * 100}%` }} />)}
              </colgroup>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} style={{ height: row.height * cssHeight * (offset?.kind === "size" ? (table.height * cssHeight + offset.dy) / (table.height * cssHeight) : 1) }}>
                    {row.cells.map((cell, columnIndex) => {
                      if (!cell) return null;
                      const isEditing = editing?.tableId === table.id && editing.row === rowIndex && editing.column === columnIndex;
                      const range = selection && "row" in selection && selection.row !== undefined && selection.tableId === table.id
                        ? pdfTableRange(table, selection, { row: selection.endRow ?? selection.row, column: selection.endColumn ?? selection.column })
                        : null;
                      const active = range !== null && rowIndex >= range.row && rowIndex <= range.endRow &&
                        columnIndex >= range.column && columnIndex <= range.endColumn;
                      return (
                        <td
                          key={columnIndex}
                          colSpan={cell.colSpan ?? 1}
                          rowSpan={cell.rowSpan ?? 1}
                          data-testid="pdf-table-cell"
                          data-row={rowIndex}
                          data-column={columnIndex}
                          data-active={active ? "true" : undefined}
                          style={{
                            padding: style.padding,
                            border: style.border,
                            background: cell.fill ?? "transparent",
                            color: cell.color ?? "#000000",
                            fontWeight: cell.bold ? 700 : 400,
                            fontStyle: cell.italic ? "italic" : "normal",
                            textAlign: cell.align ?? "left",
                            verticalAlign: cell.verticalAlign ?? "top",
                            fontFamily: cellFamily(table.font),
                          }}
                          onPointerDown={(event) => {
                            if (isEditing) { event.stopPropagation(); return; }
                            event.stopPropagation();
                            // Shift+click: from the selected cell to this one.
                            if (event.shiftKey && selection && "row" in selection && selection.row !== undefined && selection.tableId === table.id) {
                              onSelectionChange({ tableId: table.id, row: selection.row, column: selection.column, endRow: rowIndex, endColumn: columnIndex });
                              return;
                            }
                            onSelectionChange({ tableId: table.id, row: rowIndex, column: columnIndex });
                          }}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            if (!writable) return;
                            setEditing({ tableId: table.id, row: rowIndex, column: columnIndex });
                          }}
                        >
                          {isEditing ? (
                            <div
                              ref={editorRef}
                              className="pdf-viewer__table-cell-editor"
                              contentEditable="plaintext-only"
                              suppressContentEditableWarning
                              role="textbox"
                              aria-multiline="true"
                              aria-label={t("pdf.table.cellLabel", { row: rowIndex + 1, column: columnIndex + 1 })}
                              data-testid="pdf-table-cell-editor"
                              onKeyDown={(event) => {
                                if (event.key === "Tab") {
                                  event.preventDefault();
                                  leaveCell(table, { back: event.shiftKey });
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  leaveCell(table);
                                }
                              }}
                              onBlur={() => leaveCell(table)}
                            >
                              {cell.text}
                            </div>
                          ) : (
                            <span className="pdf-viewer__table-cell-text">{cell.text || "​"}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {selected && writable ? (
              <>
                <button
                  type="button"
                  className="pdf-viewer__table-grip"
                  data-testid="pdf-table-move"
                  aria-label={t("pdf.table.move")}
                  title={t("pdf.table.move")}
                  onPointerDown={(event) => startDrag(event, table, "move")}
                  onPointerMove={moveDrag}
                  onPointerUp={() => endDrag(table)}
                  onPointerCancel={() => setDrag(null)}
                />
                {table.columns.slice(0, -1).map((_, column) => {
                  const shares = offset?.kind === "column" && offset.column !== undefined
                    ? draggedColumns(table, offset.column, offset.dx) : table.columns;
                  const left = shares.slice(0, column + 1).reduce((sum, share) => sum + share, 0);
                  return (
                    <span
                      key={`column-${column}`}
                      className="pdf-viewer__table-column-border"
                      data-testid="pdf-table-column-border"
                      data-column={column}
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={t("pdf.table.columnWidth")}
                      style={{ left: `calc(${left * 100}% - 3px)` }}
                      onPointerDown={(event) => startDrag(event, table, "column", column)}
                      onPointerMove={moveDrag}
                      onPointerUp={() => endDrag(table)}
                      onPointerCancel={() => setDrag(null)}
                    />
                  );
                })}
                <button
                  type="button"
                  className="pdf-viewer__table-size"
                  data-testid="pdf-table-size"
                  aria-label={t("pdf.table.resize")}
                  title={t("pdf.table.resize")}
                  onPointerDown={(event) => startDrag(event, table, "size")}
                  onPointerMove={moveDrag}
                  onPointerUp={() => endDrag(table)}
                  onPointerCancel={() => setDrag(null)}
                />
              </>
            ) : null}
          </div>
          </div>
        );
      })}
    </div>
  );
}
