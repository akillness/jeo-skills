/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

import { loadedFontsKey } from "@mrnote/core/web/components/console/editor/native-document/loadedFontsKey.ts";




























export const WORD_ROWSPAN_ID_ATTR = "data-word-rowspan-id";
const STYLE_ATTR = "data-word-rowspan-heights";
/** Below this (px) a shared difference is the browser's rounding. */
const EPS_PX = 0.25;

interface Kept {
  node: ProseMirrorNode | null;
  signature: string;
  rules: string[];
}

interface RowspanState {
  style: HTMLStyleElement | null;
  kept: Map<HTMLTableElement, Kept>;
  dirty: WeakSet<HTMLTableElement>;
  observer: MutationObserver | null;
  text: string;
}

interface Group {
  start: number;
  end: number;
}

interface Target {
  table: HTMLTableElement;
  id: string;
  rows: HTMLTableRowElement[];
  groups: Group[];
  node: ProseMirrorNode | null;
  signature: string;
}

export interface WordRowspanStats {
  passes: number;
  measured: number;
  kept: number;
  applied: number;
  skipped: Record<string, number>;
}

const states = new WeakMap<EditorView, RowspanState>();
let nextId = 1;

function stats(win: Window): WordRowspanStats {
  const holder = win as Window & { __docsWordRowspanStats?: WordRowspanStats };
  return (holder.__docsWordRowspanStats ??= { passes: 0, measured: 0, kept: 0, applied: 0, skipped: {} });
}

function skip(win: Window, reason: string): null {
  const s = stats(win);
  s.skipped[reason] = (s.skipped[reason] ?? 0) + 1;
  return null;
}

function stateOf(view: EditorView): RowspanState {
  let state = states.get(view);
  if (!state) {
    const created: RowspanState = { style: null, kept: new Map(), dirty: new WeakSet(), observer: null, text: "" };
    const Observer = view.dom.ownerDocument.defaultView?.MutationObserver;
    if (Observer) {
      created.observer = new Observer((records) => markDirty(created, records));
    }
    states.set(view, created);
    state = created;
  }
  return state;
}

function markDirty(state: RowspanState, records: MutationRecord[]): void {
  for (const record of records) {
    // A table's own width and its columns are in its signature; other
    // projections restate them every pass.
    if (record.type === "attributes" && record.target instanceof Element && (record.target.localName === "table" || record.target.localName === "col")) continue;
    let at: Node | null = record.target;
    while (at) {
      if (at instanceof Element && at.localName === "table" && state.kept.has(at as HTMLTableElement)) {
        state.dirty.add(at as HTMLTableElement);
      }
      at = at.parentNode;
    }
  }
}

function writeSheet(view: EditorView, state: RowspanState, text: string): void {
  if (text === state.text && (state.style?.isConnected || !text)) return;
  state.text = text;
  if (!text) {
    state.style?.remove();
    state.style = null;
    return;
  }
  const document = view.dom.ownerDocument;
  if (!state.style || !state.style.isConnected) {
    state.style = document.createElement("style");
    state.style.setAttribute(STYLE_ATTR, "");
    document.head.appendChild(state.style);
  }
  state.style.textContent = text;
}

function tableNode(view: EditorView, table: HTMLTableElement): ProseMirrorNode | null {
  try {
    const $pos = view.state.doc.resolve(view.posAtDOM(table, 0));
    for (let depth = $pos.depth; depth >= 0; depth -= 1) {
      const node = $pos.node(depth);
      if (node.type.name === "table") return node;
    }
  } catch {
    /* not in the document's DOM */
  }
  return null;
}

function signatureOf(table: HTMLTableElement, fonts: string | null): string {
  const columns = Array.from(table.querySelectorAll<HTMLElement>(":scope > colgroup > col"))
    .map((col) => col.style.width)
    .join(",");
  return `${fonts ?? "loading"}|${table.offsetWidth}|${columns}`;
}

/** The merges of a table Word would size, or null (with the reason counted). */
function groupsOf(win: Window, table: HTMLTableElement): { rows: HTMLTableRowElement[]; groups: Group[] } | null {
  if (table.tHead || table.tFoot || table.tBodies.length !== 1) return skip(win, "sections");
  const body = table.tBodies[0]!;
  const rows = Array.from(body.children);
  if (rows.some((row) => row.localName !== "tr")) return skip(win, "rows");
  const trs = rows as HTMLTableRowElement[];
  const spans: Group[] = [];
  trs.forEach((row, index) => {
    for (const cell of Array.from(row.cells)) {
      if (cell.rowSpan > 1) spans.push({ start: index, end: Math.min(trs.length - 1, index + cell.rowSpan - 1) });
    }
  });
  if (!spans.length) return skip(win, "none");
  // Merges over the same rows are one; merges that overlap otherwise are left
  // to the browser (one difference per merge is all one read tells apart).
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const groups: Group[] = [];
  for (const span of spans) {
    const last = groups[groups.length - 1];
    if (last && last.start === span.start && last.end === span.end) continue;
    if (last && span.start <= last.end) return skip(win, "overlap");
    if (span.end > span.start) groups.push(span);
  }
  // An exact row height is never grown (Word clips the merged content).
  for (const group of groups) {
    for (let row = group.start; row <= group.end; row += 1) {
      if (trs[row]!.getAttribute("data-row-height-rule") === "exact") return skip(win, "exact");
    }
  }
  return groups.length ? { rows: trs, groups } : skip(win, "none");
}

function idOf(table: HTMLTableElement): string {
  let id = table.getAttribute(WORD_ROWSPAN_ID_ATTR);
  if (!id) {
    id = String(nextId);
    nextId += 1;
    table.setAttribute(WORD_ROWSPAN_ID_ATTR, id);
  }
  return id;
}

function selectorOf(id: string): string {
  return `table[${WORD_ROWSPAN_ID_ATTR}="${id}"]`;
}

/** Collapses the merged cells' content for one read: rows at their own heights. */
function probeRules(targets: readonly Target[]): string {
  if (!targets.length) return "";
  const cells = targets
    .flatMap(({ id }) => [`${selectorOf(id)} > tbody > tr > td[rowspan]:not([rowspan="1"]) > *`, `${selectorOf(id)} > tbody > tr > th[rowspan]:not([rowspan="1"]) > *`])
    .join(",\n");
  return `${cells} { max-height: 0 !important; overflow: hidden !important; margin-block: 0 !important; padding-block: 0 !important; border-block-width: 0 !important; }\n`;
}

function rowRule(id: string, row: number, px: number): string {
  return `${selectorOf(id)} > tbody > tr:nth-child(${row + 1}) { height: ${Number(px.toFixed(3))}px !important; }`;
}

function heights(rows: readonly HTMLTableRowElement[]): number[] {
  return rows.map((row) => row.getBoundingClientRect().height);
}

function layoutScale(table: HTMLTableElement): number {
  const width = table.offsetWidth;
  const drawn = table.getBoundingClientRect().width;
  return width > 0 && drawn > 0 ? drawn / width : 1;
}

function keptText(state: RowspanState, except: ReadonlySet<HTMLTableElement>): string {
  let text = "";
  for (const [table, kept] of state.kept) {
    if (except.has(table) || !kept.rules.length) continue;
    text += `${kept.rules.join("\n")}\n`;
  }
  return text;
}

/**
 * States Word's row heights under every vertically merged cell of the
 * editor's tables. Returns the tables whose rows it restated (their sheets
 * must be measured again: the rules change no DOM a measurement cache sees).
 * Runs where the page ledger projects Word's table widths, before rows are
 * measured.
 */
export function projectWordRowspanHeights(
  view: EditorView,
  /** The last sheet the page ledger measures this pass (the cold first
   * layout's progressive passes): a table with no fragment up to it keeps
   * what it was given and is measured by the pass that reaches it, as its
   * widths are (projectWordAutofitTables). Null: every table. */
  measureThroughSheet: number | null = null,
): HTMLTableElement[] {
  const win = view.dom.ownerDocument.defaultView;
  if (!win || view.isDestroyed) return [];
  const state = stateOf(view);
  const restated = new Set<HTMLTableElement>();
  if ((win as Window & { __docsWordRowspanHeights?: boolean }).__docsWordRowspanHeights === false) {
    for (const [table, kept] of state.kept) if (kept.rules.length && table.isConnected) restated.add(table);
    state.kept.clear();
    state.observer?.disconnect();
    writeSheet(view, state, "");
    return Array.from(restated);
  }
  if (state.observer) markDirty(state, state.observer.takeRecords());
  const s = stats(win);
  s.passes += 1;
  const fonts = loadedFontsKey(view.dom.ownerDocument);
  const live = new Set<HTMLTableElement>();
  const waiting = new Set<HTMLTableElement>();
  const targets: Target[] = [];
  for (const cell of Array.from(view.dom.querySelectorAll<HTMLTableCellElement>("td[rowspan], th[rowspan]"))) {
    if (cell.rowSpan <= 1) continue;
    const table = cell.closest("table");
    if (!table || live.has(table)) continue;
    live.add(table);
  }
  // A table holding another merged table is measured with that one's content
  // collapsed: left to the browser.
  const outer = new Set<HTMLTableElement>();
  for (const table of live) {
    let parent = table.parentElement?.closest("table") ?? null;
    while (parent) {
      if (live.has(parent)) outer.add(parent);
      parent = parent.parentElement?.closest("table") ?? null;
    }
  }
  // (Under a horizon a table none of whose fragments the pass measures
  // waits: its merged rows are stated when a pass reaches its page.)
  if (measureThroughSheet !== null && Number.isFinite(measureThroughSheet)) {
    const sheetIndex = new Map<Element, number>();
    let at = 0;
    for (const child of Array.from(view.dom.children)) {
      if (child.matches("article[data-page-sheet]")) sheetIndex.set(child, at++);
    }
    const reached = (table: HTMLTableElement) => {
      const index = sheetIndex.get(table.closest("article[data-page-sheet]") as Element);
      return index === undefined || index <= measureThroughSheet;
    };
    for (const table of Array.from(live)) {
      if (reached(table)) continue;
      live.delete(table);
      // What it was given stands meanwhile.
      if (state.kept.has(table)) waiting.add(table);
    }
  }
  let changed = false;
  for (const [table, kept] of Array.from(state.kept)) {
    if (waiting.has(table)) continue;
    if (!live.has(table) || outer.has(table) || !table.isConnected) {
      state.kept.delete(table);
      if (kept.rules.length && table.isConnected) restated.add(table);
      changed = true;
    }
  }
  for (const table of live) {
    if (outer.has(table)) {
      skip(win, "nested");
      continue;
    }
    if (table.offsetWidth === 0) {
      skip(win, "hidden");
      continue;
    }
    const node = tableNode(view, table);
    const signature = signatureOf(table, fonts);
    const kept = state.kept.get(table);
    if (kept && fonts !== null && kept.node === node && kept.signature === signature && !state.dirty.has(table)) {
      s.kept += 1;
      continue;
    }
    const shape = groupsOf(win, table);
    if (!shape) {
      if (kept) {
        state.kept.delete(table);
        if (kept.rules.length) restated.add(table);
        changed = true;
      }
      continue;
    }
    targets.push({ table, id: idOf(table), rows: shape.rows, groups: shape.groups, node, signature });
  }
  if (!targets.length) {
    if (changed) writeSheet(view, state, keptText(state, new Set()));
    return Array.from(restated);
  }
  const measuring = new Set(targets.map((target) => target.table));
  const others = keptText(state, measuring);
  // Read 1: every row at its own height.
  writeSheet(view, state, others + probeRules(targets));
  const own = targets.map((target) => heights(target.rows));
  // Read 2: the browser's heights with the merged content back.
  writeSheet(view, state, others);
  const drawn = targets.map((target) => heights(target.rows));
  const planned: Array<{ target: Target; rows: Map<number, number>; scale: number }> = [];
  targets.forEach((target, index) => {
    const n = own[index]!;
    const h = drawn[index]!;
    const rows = new Map<number, number>();
    for (const group of target.groups) {
      let sumOwn = 0;
      let sumDrawn = 0;
      for (let row = group.start; row <= group.end; row += 1) {
        sumOwn += n[row]!;
        sumDrawn += h[row]!;
      }
      const extra = sumDrawn - sumOwn;
      // The merge fits its rows, or the browser already gave the last row
      // all of it: nothing to restate.
      if (extra <= EPS_PX || h[group.end]! - n[group.end]! >= extra - EPS_PX) continue;
      rows.set(group.end, n[group.end]! + extra);
    }
    planned.push({ target, rows, scale: layoutScale(target.table) });
  });
  const ruleFor = (entry: (typeof planned)[number], correction: Map<number, number> | null) =>
    Array.from(entry.rows, ([row, px]) => rowRule(entry.target.id, row, (px + (correction?.get(row) ?? 0)) / entry.scale));
  let text = others + planned.map((entry) => ruleFor(entry, null).join("\n")).filter(Boolean).join("\n");
  writeSheet(view, state, text);
  // Read 3: a row's stated height and its drawn one can differ by its
  // borders; the difference is taken off once.
  const corrections = planned.map((entry) => {
    if (!entry.rows.size) return null;
    const now = heights(entry.target.rows);
    const correction = new Map<number, number>();
    for (const [row, px] of entry.rows) {
      const off = px - now[row]!;
      if (Math.abs(off) > EPS_PX) correction.set(row, off);
    }
    return correction.size ? correction : null;
  });
  if (corrections.some(Boolean)) {
    text = others + planned.map((entry, index) => ruleFor(entry, corrections[index]!).join("\n")).filter(Boolean).join("\n");
    writeSheet(view, state, text);
  }
  planned.forEach((entry, index) => {
    const rules = ruleFor(entry, corrections[index]!);
    const before = state.kept.get(entry.target.table)?.rules.join("\n") ?? "";
    if (before !== rules.join("\n")) restated.add(entry.target.table);
    state.kept.set(entry.target.table, { node: entry.target.node, signature: entry.target.signature, rules });
    state.dirty.delete(entry.target.table);
    state.observer?.observe(entry.target.table, { subtree: true, childList: true, characterData: true, attributes: true });
    s.measured += 1;
    if (rules.length) s.applied += rules.length;
  });
  // Our own reads mutated nothing inside the tables; the id attributes did.
  if (state.observer) state.observer.takeRecords();
  return Array.from(restated);
}

/** The editor is gone: its rules and observer with it. */
export function disposeWordRowspanHeights(view: EditorView): void {
  const state = states.get(view);
  if (!state) return;
  state.observer?.disconnect();
  state.style?.remove();
  state.kept.clear();
  states.delete(view);
}
