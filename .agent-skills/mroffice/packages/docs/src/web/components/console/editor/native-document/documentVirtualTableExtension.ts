/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { isCompatMouseFromTouch } from "@mrnote/core/web/lib/pointer-capability.ts";
import { closeHistory } from "@tiptap/pm/history";
import {
  Fragment,
  Slice,
  type Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import type { EditorView, NodeView } from "@tiptap/pm/view";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import {
  DOCUMENT_VIRTUAL_TABLE_FORBIDDEN_ANCESTORS,
  DOCUMENT_VIRTUAL_TABLE_DEFAULT_ROW_HEIGHT_PX,
  DOCUMENT_VIRTUAL_TABLE_MAX_CELL_TEXT_LENGTH,
  DOCUMENT_VIRTUAL_TABLE_NODE_NAME,
  DOCUMENT_VIRTUAL_TABLE_REPRESENTATION,
  DOCUMENT_VIRTUAL_TABLE_SCHEMA_VERSION,
  computeDocumentVirtualTableWindow,
  documentVirtualTableColumnWidthPx,
  createDocumentVirtualTableAxis,
  createDocumentVirtualTableAttrs,
  documentVirtualTableCellText,
  normalizeDocumentVirtualTableAttrs,
  updateDocumentVirtualTableCell,
  type DocumentVirtualTableAttrs,
} from "@mrnote/core/web/components/console/editor/native-document/documentVirtualTableModel.ts";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentVirtualTable: {
      setDocumentVirtualTableCell: (input: {
        readonly tableId: string;
        readonly row: number;
        readonly column: number;
        readonly text: string;
      }) => ReturnType;
    };
  }
}

const SERIALIZED_ATTR = "data-document-virtual-table";

export interface DocumentVirtualTableLabels {
  readonly grid: (rows: number, columns: number) => string;
  readonly cell: (row: number, column: number) => string;
  readonly commitError: string;
  /** Shown above a table read as its text (`formattingSimplified`). */
  readonly simplified?: string;
}

interface DocumentVirtualTableOptions {
  readonly labels: DocumentVirtualTableLabels;
}

const DEFAULT_DOCUMENT_VIRTUAL_TABLE_LABELS: DocumentVirtualTableLabels = {
  grid: (rows, columns) => `${rows} rows by ${columns} columns`,
  cell: (row, column) => `Row ${row}, column ${column}`,
  commitError: "Cell value exceeds the sparse table limits.",
  simplified: "Table formatting simplified: shown read-only.",
};

function parseSerializedAttrs(
  element: HTMLElement,
): DocumentVirtualTableAttrs | null {
  const source = element.getAttribute(SERIALIZED_ATTR);
  if (!source) return null;
  try {
    return normalizeDocumentVirtualTableAttrs(JSON.parse(source));
  } catch {
    return null;
  }
}

function serializedField(
  element: HTMLElement,
  key: keyof DocumentVirtualTableAttrs,
): unknown {
  return parseSerializedAttrs(element)?.[key] ?? null;
}

/**
 * The node attributes after a sparse-payload edit. The normalizer returns the
 * sparse fields only, so writing its result with setNodeMarkup alone reset
 * every other attribute the schema declares on the node — the block identity
 * (`block_id`) and its native provenance (`source`) among them — and the
 * block-id plugin then minted a new identity for the same table on every cell
 * edit. An edit changes the table's cells, never which table it is.
 */
function withNodeIdentity(
  node: ProseMirrorNode,
  next: DocumentVirtualTableAttrs,
): Record<string, unknown> {
  return { ...node.attrs, ...next };
}

/**
 * The line-break convention of a cell's stored text, so an edited value keeps
 * the separators the user did not touch. A textarea reports every CRLF or CR
 * as LF; a value that used CRLF (or CR) throughout gets it back on commit.
 */
function restoreLineBreaks(original: string, edited: string): string {
  const hasCrlf = original.includes("\r\n");
  const withoutCrlf = original.replace(/\r\n/g, "");
  const hasLf = withoutCrlf.includes("\n");
  const hasCr = withoutCrlf.includes("\r");
  if (hasCrlf && !hasLf && !hasCr) return edited.replace(/\n/g, "\r\n");
  if (hasCr && !hasCrlf && !hasLf) return edited.replace(/\n/g, "\r");
  return edited;
}

/**
 * Undo / Redo chords (Mod-Z, Mod-Shift-Z, Mod-Y). While a cell of the grid,
 * not its text editor, has the focus these belong to the document's history,
 * exactly as from the body text and the ribbon.
 */
function isHistoryChord(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;
  const key = event.key.toLowerCase();
  return key === "z" || key === "y";
}

function rekeyPastedVirtualTableNode(node: ProseMirrorNode): ProseMirrorNode {
  const mappedContent = node.content.size
    ? rekeyPastedVirtualTableFragment(node.content)
    : node.content;
  if (node.type.name !== DOCUMENT_VIRTUAL_TABLE_NODE_NAME) {
    return node.isLeaf ? node : node.copy(mappedContent);
  }
  const attrs = normalizeDocumentVirtualTableAttrs(node.attrs);
  if (!attrs) return node.copy(mappedContent);
  const identity = createDocumentVirtualTableAttrs({
    rows: attrs.rows,
    columns: attrs.columns,
    tableLayoutPolicy: attrs.tableLayoutPolicy,
    tableFixedWidthTwips: attrs.tableFixedWidthTwips,
  });
  if (!identity) return node.copy(mappedContent);
  return node.type.create(
    { ...attrs, tableId: identity.tableId },
    mappedContent,
    node.marks,
  );
}

function rekeyPastedVirtualTableFragment(fragment: Fragment): Fragment {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((node) => nodes.push(rekeyPastedVirtualTableNode(node)));
  return Fragment.fromArray(nodes);
}

const virtualTablePlacementKey = new PluginKey<boolean>(
  "documentVirtualTablePlacement",
);

function isVirtualTableNode(node: ProseMirrorNode): boolean {
  return node.type.name === DOCUMENT_VIRTUAL_TABLE_NODE_NAME;
}

function isForbiddenVirtualTableContainer(node: ProseMirrorNode): boolean {
  return DOCUMENT_VIRTUAL_TABLE_FORBIDDEN_ANCESTORS.has(node.type.name);
}

/** Whether any replace step of `tr` inserts a node matching `test`. */
function stepsCarry(
  tr: Transaction,
  test: (node: ProseMirrorNode) => boolean,
): boolean {
  return tr.steps.some((step) => {
    const slice = (step as { slice?: unknown }).slice;
    if (!(slice instanceof Slice) || slice.size === 0) return false;
    let found = false;
    slice.content.descendants((node) => {
      if (found) return false;
      if (test(node)) found = true;
      return !found && !node.isTextblock;
    });
    return found;
  });
}

function documentHasVirtualTable(doc: ProseMirrorNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (isVirtualTableNode(node)) found = true;
    return !found && !node.isTextblock;
  });
  return found;
}

/** Whether a sparse table sits inside a container the schema refuses. */
function documentNestsVirtualTable(doc: ProseMirrorNode): boolean {
  let nested = false;
  doc.descendants((node, pos) => {
    if (nested) return false;
    if (!isVirtualTableNode(node)) return !node.isTextblock;
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if (isForbiddenVirtualTableContainer($pos.node(depth))) {
        nested = true;
        break;
      }
    }
    return false;
  });
  return nested;
}

function createVirtualTableNodeView(
  input: {
    readonly node: ProseMirrorNode;
    readonly view: EditorView;
    readonly getPos: () => number | undefined;
  },
  labels: DocumentVirtualTableLabels,
): NodeView {
  let currentNode = input.node;
  let activeRow = 0;
  let activeColumn = 0;
  let selected = false;
  let animationFrame: number | null = null;
  let editableObserver: MutationObserver | null = null;
  let editInput: HTMLTextAreaElement | null = null;
  let editError: HTMLElement | null = null;

  const dom = document.createElement("div");
  dom.className = "document-virtual-table";
  dom.setAttribute("role", "grid");
  dom.setAttribute("contenteditable", "false");

  const viewport = document.createElement("div");
  viewport.className = "document-virtual-table__viewport";
  Object.assign(viewport.style, {
    height: "320px",
    maxWidth: "100%",
    overflow: "auto",
    position: "relative",
    border: "1px solid var(--border, #d1d5db)",
    borderRadius: "6px",
    background: "var(--background, #fff)",
  });

  const spacer = document.createElement("div");
  spacer.className = "document-virtual-table__spacer";
  spacer.style.position = "relative";
  viewport.append(spacer);
  const simplifiedNote = document.createElement("div");
  simplifiedNote.className = "document-virtual-table__simplified";
  simplifiedNote.textContent = labels.simplified ?? "";
  simplifiedNote.hidden = true;
  Object.assign(simplifiedNote.style, {
    fontSize: "12px",
    color: "var(--muted-foreground, #6b7280)",
    padding: "0 0 4px",
  });
  dom.append(simplifiedNote, viewport);

  const attrs = (): DocumentVirtualTableAttrs | null =>
    normalizeDocumentVirtualTableAttrs(currentNode.attrs);
  // A rich Word table read as its text is shown, never edited: the server
  // keeps the package's own table (`formattingSimplified`).
  const cellsEditable = (): boolean =>
    input.view.editable && currentNode.attrs.formattingSimplified !== true;

  const commitCell = (row: number, column: number, text: string): boolean => {
    if (!cellsEditable()) return false;
    const current = attrs();
    const pos = input.getPos();
    if (!current || typeof pos !== "number") return false;
    const liveNode = input.view.state.doc.nodeAt(pos);
    if (
      liveNode?.type.name !== DOCUMENT_VIRTUAL_TABLE_NODE_NAME ||
      liveNode.attrs.tableId !== current.tableId
    ) {
      return false;
    }
    const next = updateDocumentVirtualTableCell(current, row, column, text);
    if (!next) return false;
    if (documentVirtualTableCellText(current, row, column) === text)
      return true;
    input.view.dispatch(
      closeHistory(
        input.view.state.tr
          .setNodeMarkup(pos, undefined, withNodeIdentity(liveNode, next))
          .scrollIntoView(),
      ),
    );
    return true;
  };

  const focusActiveCell = (): void => {
    viewport
      .querySelector<HTMLElement>(
        `[data-virtual-row="${activeRow}"][data-virtual-column="${activeColumn}"]`,
      )
      ?.focus({ preventScroll: true });
  };

  const moveActiveCell = (rowDelta: number, columnDelta: number): void => {
    const current = attrs();
    if (!current) return;
    activeRow = Math.min(Math.max(activeRow + rowDelta, 0), current.rows - 1);
    activeColumn = Math.min(
      Math.max(activeColumn + columnDelta, 0),
      current.columns - 1,
    );
    const rowAxis = createDocumentVirtualTableAxis(
      current.rows,
      DOCUMENT_VIRTUAL_TABLE_DEFAULT_ROW_HEIGHT_PX,
      current.rowOverrides,
    );
    const columnAxis = createDocumentVirtualTableAxis(
      current.columns,
      documentVirtualTableColumnWidthPx(current),
      current.columnOverrides,
    );
    const top = rowAxis.offsetAt(activeRow);
    const bottom = top + rowAxis.sizeAt(activeRow);
    const left = columnAxis.offsetAt(activeColumn);
    const right = left + columnAxis.sizeAt(activeColumn);
    if (top < viewport.scrollTop) viewport.scrollTop = top;
    else if (bottom > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = bottom - viewport.clientHeight;
    }
    if (left < viewport.scrollLeft) viewport.scrollLeft = left;
    else if (right > viewport.scrollLeft + viewport.clientWidth) {
      viewport.scrollLeft = right - viewport.clientWidth;
    }
    renderWindow();
    focusActiveCell();
  };

  const beginEdit = (cell: HTMLElement, row: number, column: number): void => {
    if (!cellsEditable()) return;
    // Only an editor that is still on the page owns the grid. One left behind
    // by a redraw can never commit, and must not lock every other cell out.
    if (editInput && spacer.contains(editInput)) return;
    editInput = null;
    editError = null;
    if (!spacer.contains(cell)) return;
    const current = attrs();
    if (!current) return;
    activeRow = row;
    activeColumn = column;
    const original = documentVirtualTableCellText(current, row, column);
    // A cell holds any text the sparse model accepts, line breaks included
    // (Excel's Alt+Enter). A single-line <input> silently dropped every line
    // break of the value it was given, so merely opening and leaving a
    // multi-line cell rewrote it.
    const editor = document.createElement("textarea");
    editor.maxLength = DOCUMENT_VIRTUAL_TABLE_MAX_CELL_TEXT_LENGTH;
    editor.value = original;
    editor.rows = 1;
    editor.wrap = "off";
    editor.spellcheck = false;
    // What the editor shows for the stored value. Unchanged means no edit:
    // leaving the cell writes nothing back, whatever the textarea did to the
    // line breaks when it was filled.
    const shown = editor.value;
    editor.className = "document-virtual-table__cell-editor";
    editor.setAttribute("aria-label", labels.cell(row + 1, column + 1));
    editor.setAttribute("aria-multiline", "true");
    // The words are typed where the cell draws them: the editor fills the
    // whole cell (its own 4px x 6px padding taken off while it is open) and
    // its 2px border plus 2px x 4px padding put the text back on the cell's
    // 4px x 6px inset. Inside the cell's padding the text moved 8px right
    // and 4px down the moment the cell was opened.
    cell.style.padding = "0";
    Object.assign(editor.style, {
      boxSizing: "border-box",
      width: "100%",
      height: "100%",
      border: "2px solid #7c3aed",
      padding: "2px 4px",
      font: "inherit",
      lineHeight: "inherit",
      background: "#fff",
      resize: "none",
      overflow: "hidden",
      whiteSpace: "pre",
      display: "block",
    });
    cell.replaceChildren(editor);
    editInput = editor;
    let compositionActive = false;
    let pendingCompositionBlur = false;
    const clearEditError = (): void => {
      editError?.remove();
      editError = null;
      editor.removeAttribute("aria-invalid");
      editor.removeAttribute("aria-errormessage");
    };
    const showEditError = (): void => {
      if (!editError) {
        const error = document.createElement("span");
        error.id = `document-virtual-table-cell-error-${current.tableId}-${row}-${column}`;
        error.className = "document-virtual-table__cell-error";
        error.setAttribute("role", "alert");
        error.textContent = labels.commitError;
        Object.assign(error.style, {
          position: "absolute",
          right: "2px",
          bottom: "2px",
          left: "2px",
          overflow: "hidden",
          padding: "1px 3px",
          borderRadius: "2px",
          background: "#b91c1c",
          color: "#fff",
          fontSize: "10px",
          lineHeight: "14px",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        });
        cell.append(error);
        editError = error;
      }
      editor.setAttribute("aria-invalid", "true");
      editor.setAttribute("aria-errormessage", editError.id);
      queueMicrotask(() => {
        if (editInput === editor && editor.parentElement) {
          editor.focus({ preventScroll: true });
        }
      });
    };
    const finish = (
      commit: boolean,
      move: { readonly row: number; readonly column: number } | null = null,
    ): void => {
      if (editInput !== editor) return;
      const hadFocus = document.activeElement === editor;
      if (
        commit &&
        editor.value !== shown &&
        !commitCell(row, column, restoreLineBreaks(original, editor.value))
      ) {
        showEditError();
        return;
      }
      clearEditError();
      editInput = null;
      renderWindow();
      // Back to the grid the keyboard came from, so the arrows and Enter go
      // on working (a blur has already given the focus somewhere else).
      if (move) moveActiveCell(move.row, move.column);
      else if (hadFocus) focusActiveCell();
    };
    editor.addEventListener("keydown", (event) => {
      // Every key typed into the cell editor is the editor's: the grid cell
      // around it navigates on the same keys. Letting Enter through re-opened
      // an editor in the cell the commit had just redrawn away (every later
      // double-click was then refused), and the arrows committed the draft
      // instead of moving the caret in it.
      event.stopPropagation();
      if (compositionActive || event.isComposing || event.keyCode === 229)
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      } else if (event.key === "Enter" && event.altKey) {
        // Excel's line break in a cell (Alt+Enter / Option+Return).
        event.preventDefault();
        editor.setRangeText(
          "\n",
          editor.selectionStart,
          editor.selectionEnd,
          "end",
        );
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (event.key === "Enter") {
        // Enter confirms the cell and moves down, Shift+Enter up (Excel).
        event.preventDefault();
        finish(true, { row: event.shiftKey ? -1 : 1, column: 0 });
      } else if (event.key === "Tab") {
        // Tab / Shift+Tab walk the cells in reading order, as in a Word
        // table: past a row's last cell to the next row's first, and from a
        
        event.preventDefault();
        const step = event.shiftKey ? -1 : 1;
        const columns = attrs()?.columns ?? 1;
        const rows = attrs()?.rows ?? 1;
        let delta = { row: 0, column: step };
        if (column + step < 0 && row > 0) {
          delta = { row: -1, column: columns - 1 - column };
        } else if (column + step >= columns && row < rows - 1) {
          delta = { row: 1, column: -column };
        }
        finish(true, delta);
      }
    });
    editor.addEventListener("compositionstart", () => {
      compositionActive = true;
    });
    editor.addEventListener("compositionend", () => {
      compositionActive = false;
      if (!pendingCompositionBlur) return;
      pendingCompositionBlur = false;
      setTimeout(() => {
        if (
          editInput === editor &&
          !compositionActive &&
          document.activeElement !== editor
        ) {
          finish(true);
        }
      }, 0);
    });
    editor.addEventListener("focus", () => {
      pendingCompositionBlur = false;
    });
    editor.addEventListener("input", clearEditError);
    editor.addEventListener("blur", () => {
      if (compositionActive) {
        pendingCompositionBlur = true;
        return;
      }
      finish(true);
    });
    editor.focus();
    editor.select();
  };

  function renderWindow(): void {
    const current = attrs();
    if (!current) {
      dom.setAttribute("aria-invalid", "true");
      if (!editInput?.parentElement) spacer.replaceChildren();
      return;
    }
    dom.removeAttribute("aria-invalid");
    dom.setAttribute("aria-readonly", cellsEditable() ? "false" : "true");
    simplifiedNote.hidden = current.formattingSimplified !== true;
    dom.setAttribute("aria-rowcount", String(current.rows));
    dom.setAttribute("aria-colcount", String(current.columns));
    dom.setAttribute("aria-label", labels.grid(current.rows, current.columns));
    dom.dataset.selected = selected ? "true" : "false";

    const rowAxis = createDocumentVirtualTableAxis(
      current.rows,
      DOCUMENT_VIRTUAL_TABLE_DEFAULT_ROW_HEIGHT_PX,
      current.rowOverrides,
    );
    const columnAxis = createDocumentVirtualTableAxis(
      current.columns,
      documentVirtualTableColumnWidthPx(current),
      current.columnOverrides,
    );
    const window = computeDocumentVirtualTableWindow({
      attrs: current,
      scrollTop: viewport.scrollTop,
      scrollLeft: viewport.scrollLeft,
      viewportHeight: viewport.clientHeight || 320,
      viewportWidth: viewport.clientWidth || 640,
    });
    spacer.style.height = `${window.totalHeightPx}px`;
    spacer.style.width = `${window.totalWidthPx}px`;
    // Scroll and NodeView updates must not destroy a focused cell editor. Its
    // draft is local UI state until an explicit commit succeeds or Escape
    // cancels it; a later render runs after the editor is settled.
    if (editInput?.parentElement) return;
    // A scroll can move the former active cell out of the mounted window.
    // Keep exactly one roving focus owner in the live DOM without persisting
    // viewport state into the document or history.
    if (activeRow < window.rowStart || activeRow >= window.rowEnd) {
      activeRow = window.rowStart;
    }
    if (activeColumn < window.columnStart || activeColumn >= window.columnEnd) {
      activeColumn = window.columnStart;
    }
    const fragment = document.createDocumentFragment();
    for (let row = window.rowStart; row < window.rowEnd; row += 1) {
      for (
        let column = window.columnStart;
        column < window.columnEnd;
        column += 1
      ) {
        const cell = document.createElement("div");
        cell.className = "document-virtual-table__cell";
        cell.dataset.virtualRow = String(row);
        cell.dataset.virtualColumn = String(column);
        cell.setAttribute("role", "gridcell");
        cell.setAttribute(
          "aria-readonly",
          cellsEditable() ? "false" : "true",
        );
        cell.setAttribute("aria-rowindex", String(row + 1));
        cell.setAttribute("aria-colindex", String(column + 1));
        cell.tabIndex = row === activeRow && column === activeColumn ? 0 : -1;
        cell.textContent = documentVirtualTableCellText(current, row, column);
        Object.assign(cell.style, {
          position: "absolute",
          boxSizing: "border-box",
          top: `${rowAxis.offsetAt(row)}px`,
          left: `${columnAxis.offsetAt(column)}px`,
          width: `${columnAxis.sizeAt(column)}px`,
          height: `${rowAxis.sizeAt(row)}px`,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          borderRight: "1px solid #e5e7eb",
          borderBottom: "1px solid #e5e7eb",
          padding: "4px 6px",
          outline: "none",
          background:
            row === activeRow && column === activeColumn ? "#f5f3ff" : "#fff",
        });
        cell.addEventListener("focus", () => {
          activeRow = row;
          activeColumn = column;
        });
        cell.addEventListener("dblclick", () => beginEdit(cell, row, column));
        // A finger: Word puts the caret in a table cell with one tap (a
        // double tap is unreliable on a touch screen), so a tap edits and
        
        cell.addEventListener("click", (event) => {
          if (!isCompatMouseFromTouch(event)) return;
          if (!cellsEditable()) return;
          beginEdit(cell, row, column);
        });
        cell.addEventListener("keydown", (event) => {
          if (event.target !== cell) return;
          if (event.key === "Enter" || event.key === "F2") {
            event.preventDefault();
            beginEdit(cell, row, column);
            return;
          }
          const pageRows = Math.max(
            1,
            Math.floor(
              (viewport.clientHeight || 320) /
                DOCUMENT_VIRTUAL_TABLE_DEFAULT_ROW_HEIGHT_PX,
            ),
          );
          const movement: Record<string, readonly [number, number]> = {
            ArrowUp: [-1, 0],
            ArrowDown: [1, 0],
            ArrowLeft: [0, -1],
            ArrowRight: [0, 1],
            PageUp: [-pageRows, 0],
            PageDown: [pageRows, 0],
          };
          const delta = movement[event.key];
          if (!delta) return;
          event.preventDefault();
          moveActiveCell(delta[0], delta[1]);
        });
        fragment.append(cell);
      }
    }
    // Redrawing replaces the focused cell. Keep the keyboard on the grid (an
    // Undo from a cell, or a commit from its editor, redraws it).
    const gridHadFocus =
      document.activeElement instanceof HTMLElement &&
      spacer.contains(document.activeElement);
    spacer.replaceChildren(fragment);
    if (gridHadFocus) focusActiveCell();
  }

  const scheduleRender = (): void => {
    if (animationFrame !== null) return;
    animationFrame = requestAnimationFrame(() => {
      animationFrame = null;
      renderWindow();
    });
  };
  viewport.addEventListener("scroll", scheduleRender, { passive: true });
  renderWindow();
  if (typeof MutationObserver !== "undefined") {
    editableObserver = new MutationObserver(() => {
      if (!cellsEditable() && editInput) {
        editInput = null;
        editError = null;
      }
      renderWindow();
    });
    editableObserver.observe(input.view.dom, {
      attributes: true,
      attributeFilter: ["contenteditable"],
    });
  }

  return {
    dom,
    update(node) {
      if (node.type.name !== DOCUMENT_VIRTUAL_TABLE_NODE_NAME) return false;
      currentNode = node;
      activeRow = Math.min(activeRow, Number(node.attrs.rows) - 1);
      activeColumn = Math.min(activeColumn, Number(node.attrs.columns) - 1);
      renderWindow();
      return true;
    },
    selectNode() {
      selected = true;
      renderWindow();
    },
    deselectNode() {
      selected = false;
      renderWindow();
    },
    stopEvent(event) {
      if (!dom.contains(event.target as globalThis.Node)) return false;
      // Undo / Redo pressed on a grid cell (not in its text editor) goes to
      // the document's own key handling: the history keymap, the read-only
      // gate and the ribbon's step routing all live there. Every other event
      // stays the grid's.
      if (
        event.type === "keydown" &&
        event.target !== editInput &&
        isHistoryChord(event as KeyboardEvent)
      ) {
        return false;
      }
      return true;
    },
    ignoreMutation() {
      return true;
    },
    destroy() {
      editInput = null;
      editError = null;
      viewport.removeEventListener("scroll", scheduleRender);
      editableObserver?.disconnect();
      editableObserver = null;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    },
  };
}

export const DocumentVirtualTable = Node.create<DocumentVirtualTableOptions>({
  name: DOCUMENT_VIRTUAL_TABLE_NODE_NAME,
  group: "block",
  atom: true,
  isolating: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { labels: DEFAULT_DOCUMENT_VIRTUAL_TABLE_LABELS };
  },

  addAttributes() {
    const parse =
      (key: keyof DocumentVirtualTableAttrs) => (element: HTMLElement) =>
        serializedField(element, key);
    return {
      schemaVersion: {
        default: DOCUMENT_VIRTUAL_TABLE_SCHEMA_VERSION,
        parseHTML: parse("schemaVersion"),
        renderHTML: () => ({}),
      },
      representation: {
        default: DOCUMENT_VIRTUAL_TABLE_REPRESENTATION,
        parseHTML: parse("representation"),
        renderHTML: () => ({}),
      },
      tableId: {
        default: null,
        parseHTML: parse("tableId"),
        renderHTML: () => ({}),
      },
      rows: {
        default: null,
        parseHTML: parse("rows"),
        renderHTML: () => ({}),
      },
      columns: {
        default: null,
        parseHTML: parse("columns"),
        renderHTML: () => ({}),
      },
      tableLayoutPolicy: {
        default: "initial_auto",
        parseHTML: parse("tableLayoutPolicy"),
        renderHTML: () => ({}),
      },
      tableFixedWidthTwips: {
        default: null,
        parseHTML: parse("tableFixedWidthTwips"),
        renderHTML: () => ({}),
      },
      cells: {
        default: [],
        parseHTML: parse("cells"),
        renderHTML: () => ({}),
      },
      rowOverrides: {
        default: [],
        parseHTML: parse("rowOverrides"),
        renderHTML: () => ({}),
      },
      columnOverrides: {
        default: [],
        parseHTML: parse("columnOverrides"),
        renderHTML: () => ({}),
      },
      formattingSimplified: {
        default: null,
        parseHTML: parse("formattingSimplified"),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[${SERIALIZED_ATTR}]`,
        getAttrs: (element) =>
          element instanceof HTMLElement && parseSerializedAttrs(element)
            ? {}
            : false,
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const normalized = normalizeDocumentVirtualTableAttrs(node.attrs);
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        [SERIALIZED_ATTR]: normalized ? JSON.stringify(normalized) : "invalid",
        "data-type": DOCUMENT_VIRTUAL_TABLE_NODE_NAME,
      }),
    ];
  },

  addNodeView() {
    return ({ node, view, getPos }) =>
      createVirtualTableNodeView(
        {
          node,
          view,
          getPos: () => {
            const position = getPos();
            return typeof position === "number" ? position : undefined;
          },
        },
        this.options.labels,
      );
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<boolean>({
        key: virtualTablePlacementKey,
        // Whether the document may hold a sparse table at all; once true it
        // stays true (a stale true only costs one extra scan).
        state: {
          init: (_config, state) => documentHasVirtualTable(state.doc),
          apply: (tr, hadTable) =>
            hadTable || (tr.docChanged && stepsCarry(tr, isVirtualTableNode)),
        },
        // The same placement rule as the insert command, for every other way
        // a sparse table could land in a quote, a list or a table: pasting or
        // dropping it there, or wrapping it in a quote or a list. Such a
        // document could no longer be saved, so the change is refused whole.
        // Remote collaboration steps are never second-guessed here.
        filterTransaction: (tr, state) => {
          if (!tr.docChanged || tr.getMeta(ySyncPluginKey) !== undefined) {
            return true;
          }
          const carriesTable = stepsCarry(tr, isVirtualTableNode);
          if (
            !carriesTable &&
            !(
              virtualTablePlacementKey.getState(state) === true &&
              stepsCarry(tr, isForbiddenVirtualTableContainer)
            )
          ) {
            return true;
          }
          return (
            !documentNestsVirtualTable(tr.doc) ||
            documentNestsVirtualTable(state.doc)
          );
        },
        props: {
          transformPasted: (slice) =>
            new Slice(
              rekeyPastedVirtualTableFragment(slice.content),
              slice.openStart,
              slice.openEnd,
            ),
        },
      }),
    ];
  },

  addCommands() {
    return {
      setDocumentVirtualTableCell:
        ({ tableId, row, column, text }) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const reject = (): false => {
            tr.setMeta("preventDispatch", true);
            return false;
          };
          let target: {
            readonly pos: number;
            readonly node: ProseMirrorNode;
          } | null = null;
          let duplicate = false;
          state.doc.descendants((node, pos) => {
            if (
              node.type.name === DOCUMENT_VIRTUAL_TABLE_NODE_NAME &&
              node.attrs.tableId === tableId
            ) {
              if (target) duplicate = true;
              else target = { pos, node };
              return false;
            }
            return true;
          });
          const match = target as {
            readonly pos: number;
            readonly node: ProseMirrorNode;
          } | null;
          if (!match || duplicate) return reject();
          // A table read as its text is never edited (`formattingSimplified`).
          if (match.node.attrs.formattingSimplified === true) return reject();
          const next = updateDocumentVirtualTableCell(
            match.node.attrs,
            row,
            column,
            text,
          );
          if (!next) return reject();
          if (dispatch) {
            closeHistory(
              tr.setNodeMarkup(
                match.pos,
                undefined,
                withNodeIdentity(match.node, next),
              ),
            );
          }
          return true;
        },
    };
  },
});

export default DocumentVirtualTable;
