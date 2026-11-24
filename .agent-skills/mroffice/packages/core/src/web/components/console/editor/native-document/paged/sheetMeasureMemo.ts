/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A sheet's measurement kept until something in the sheet changes.
 *
 * The page-span pass reads every sheet's body extent after every change of
 * the document: on a 296-page book that is ~7,400 block boxes per keystroke
 * and per page-ledger pass, and an off-screen sheet (content-visibility) is
 * laid out again only to be read. A sheet whose DOM did not change since it
 * was measured, under the same page node and with no document-wide layout
 * input changed (a root class or attribute, a font, the width), measures what
 * it measured.
 *
 * The rules follow the page ledger's measurement cache: any mutation inside a
 * sheet marks it; the stamps the page passes write on the sheet element
 * itself, and the transient layout-status flags on the root, do not.
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import { isDocumentLayoutStatusAttribute } from "../documentLayoutStatus";
import { inkLayerMutation } from "./inkSheetLayer";

/** What the page-span decorations and the ledger write on a sheet element:
 * a function of the measurement, never an input to it. */
export const SHEET_STAMPS = new Set([
  "data-page-span",
  "data-page-physical-parity",
  "data-page-parity-before",
  "data-page-number-first-label",
  "data-page-number-last-label",
  "data-page-number-visible",
  "data-page-oversize",
  "data-note-continuation-pages",
  // A dormant sheet (sheetDormancy): out of the render tree until read.
  "data-page-dormant",
]);

/**
 * The changes to one editor's sheets, read by one observer however many memos
 * ask: a dozen observers of the whole subtree each took every record of every
 * pass that moved a long table.
 */
class SheetChangeLog {
  private readonly changes = new WeakMap<Element, number>();
  private clock = 0;
  /** The last change to a layout input of every sheet. */
  everything = 0;
  private observer: MutationObserver | null = null;
  private readers = 0;

  constructor(private readonly root: HTMLElement) {}

  addReader(): void {
    this.readers += 1;
    if (this.observer) return;
    const Observer = this.root.ownerDocument.defaultView?.MutationObserver;
    if (!Observer) return;
    this.observer = new Observer((records) => this.record(records));
    this.observer.observe(this.root, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true });
  }

  removeReader(): void {
    this.readers -= 1;
    if (this.readers > 0) return;
    this.observer?.disconnect();
    this.observer = null;
  }

  flush(): void {
    const records = this.observer?.takeRecords();
    if (records?.length) this.record(records);
  }

  /** A stamp that moves when `sheet` or everything changes. */
  stamp(sheet: Element): string {
    return `${this.everything}:${this.changes.get(sheet) ?? 0}`;
  }

  private record(records: readonly MutationRecord[]): void {
    const clock = ++this.clock;
    let last: Node | null = null;
    for (const record of records) {
      if (inkLayerMutation(record)) continue;
      const target = record.target as Element;
      if (record.type === "attributes") {
        const name = record.attributeName ?? "";
        if (target instanceof Element && target.getAttribute(name) === record.oldValue) continue;
        if (target === this.root) {
          if (isDocumentLayoutStatusAttribute(name) && name !== "data-document-display-fonts") continue;
          if (name === "contenteditable" || name === "tabindex") continue;
          if (name === "class" && sameLayoutClasses(record.oldValue, target.getAttribute("class"))) continue;
          this.everything = clock;
          continue;
        }
        if (target.parentElement === this.root && SHEET_STAMPS.has(name)) continue;
      }
      if (record.target === last) continue;
      last = record.target;
      this.mark(record.target, clock);
    }
  }

  private mark(node: Node, clock: number): void {
    let element: Element | null = node instanceof Element ? node : node.parentElement;
    let sheet: Element | null = null;
    while (element && element !== this.root) {
      sheet = element;
      element = element.parentElement;
    }
    if (element === this.root && sheet) this.changes.set(sheet, clock);
  }
}

const changeLogs = new WeakMap<HTMLElement, SheetChangeLog>();

/**
 * `root.querySelectorAll(":scope > article[data-page-sheet]")`: a selector walks
 * every element under the root to find its children (hundreds of thousands in a
 * long book, several times a key); this reads the children.
 */
export function sheetsOf(root: ParentNode): HTMLElement[] {
  const sheets: HTMLElement[] = [];
  for (let child = root.firstElementChild; child; child = child.nextElementSibling) {
    if (child.localName === "article" && child.hasAttribute("data-page-sheet")) sheets.push(child as HTMLElement);
  }
  return sheets;
}

export class SheetMeasureMemo<T> {
  private entries = new WeakMap<HTMLElement, { node: PmNode | null; value: T; stamp: string }>();
  private log: SheetChangeLog | null;

  constructor(root: HTMLElement) {
    let log = changeLogs.get(root);
    if (!log) changeLogs.set(root, (log = new SheetChangeLog(root)));
    log.addReader();
    this.log = log;
  }

  /** The kept measurement of `sheet`, when it still renders `node` and
   * nothing in it changed since. */
  get(sheet: HTMLElement, node: PmNode | null): T | undefined {
    this.log?.flush();
    return this.peek(sheet, node);
  }

  /** `get` for a walk of the sheets that writes nothing: `flush` before it, once
   * (each one asks the observer for its records: a call per sheet per walk). */
  peek(sheet: HTMLElement, node: PmNode | null): T | undefined {
    const entry = this.entries.get(sheet);
    if (!entry || entry.node !== node) return undefined;
    return !this.log || this.log.stamp(sheet) === entry.stamp ? entry.value : undefined;
  }

  set(sheet: HTMLElement, node: PmNode | null, value: T): void {
    this.log?.flush();
    this.entries.set(sheet, { node, value, stamp: this.log?.stamp(sheet) ?? "" });
  }

  /** Take the records the observer holds (before a walk of `peek`s). */
  flush(): void {
    this.log?.flush();
  }

  /** Forget one sheet's measurement (a font its text draws with arrived). */
  forget(sheet: HTMLElement): void {
    this.entries.delete(sheet);
  }

  /** Forget every measurement (a font, the width, the zoom changed). */
  clear(): void {
    this.entries = new WeakMap();
  }

  disconnect(): void {
    this.log?.removeReader();
    this.log = null;
  }
}

export function sameLayoutClasses(before: string | null, after: string | null): boolean {
  const layout = (value: string | null) =>
    (value ?? "").split(/\s+/).filter((name) => name !== "" && !name.startsWith("ProseMirror-")).sort().join(" ");
  return layout(before) === layout(after);
}

const sheetQueries = new WeakMap<HTMLElement, Map<string, SheetMeasureMemo<readonly HTMLElement[]>>>();
// The sheet each element querySheetsAll found stands on (its closest
// article[data-page-sheet]), read when its sheet was walked: a sheet whose
// matches are kept has not changed, so neither has any match's ancestry.
const queriedSheets = new WeakMap<Element, Element | null>();

/** `element.closest("article[data-page-sheet]")` for an element that
 * querySheetsAll returned, without walking its ancestors again. */
export function sheetOfQueried(element: HTMLElement): Element | null {
  const known = queriedSheets.get(element);
  return known !== undefined ? known : element.closest("article[data-page-sheet]");
}

/**
 * `root.querySelectorAll(selector)` (in document order) for an editor root
 * whose children are page sheets, each sheet's matches kept while nothing in
 * it changed. A pass that runs after every keystroke and matched a selector
 * against every element of a long book (hundreds of thousands) walks only
 * the sheets something changed in. Children that are not sheets are walked
 * every time. The selector must not depend on anything outside the sheet
 * but the sheet's ancestors (whose changes clear every sheet's matches).
 */
export function querySheetsAll(root: HTMLElement, selector: string): HTMLElement[] {
  let bySelector = sheetQueries.get(root);
  if (!bySelector) sheetQueries.set(root, (bySelector = new Map()));
  let memo = bySelector.get(selector);
  if (!memo) bySelector.set(selector, (memo = new SheetMeasureMemo<readonly HTMLElement[]>(root)));
  const found: HTMLElement[] = [];
  memo.flush();
  for (let next = root.firstElementChild; next; next = next.nextElementSibling) {
    if (!(next instanceof HTMLElement)) continue;
    const child = next;
    const sheet = child.localName === "article" && child.hasAttribute("data-page-sheet");
    const kept = sheet ? memo.peek(child, null) : undefined;
    if (kept) {
      for (const element of kept) found.push(element);
      continue;
    }
    const own: HTMLElement[] = child.matches(selector) ? [child] : [];
    for (const element of child.querySelectorAll<HTMLElement>(selector)) own.push(element);
    for (const element of own) queriedSheets.set(element, element.closest("article[data-page-sheet]"));
    if (sheet) memo.set(child, null, own);
    for (const element of own) found.push(element);
  }
  return found;
}
