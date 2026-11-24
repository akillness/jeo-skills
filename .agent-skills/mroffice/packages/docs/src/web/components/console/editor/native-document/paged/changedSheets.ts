/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Which page sheets changed since a projection last read them. A pass over the
 * whole document costs the same whether one page moved or all of them: on
 * R286-D01 two projections took 73 s of a 373 s open walking every block after
 * every step of the page ledger, the last twenty of which moved a page each.
 */
import { SHEET_STAMPS } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetMeasureMemo.ts";

/** On unless `window.__docsExactLineStamps = true` (development A/B): the
 * stamps on a sheet element mark no sheet changed. */
function stampsAreNoChange(): boolean {
  return typeof window === "undefined" || (window as Window & { __docsExactLineStamps?: boolean }).__docsExactLineStamps !== true;
}

export class ChangedSheets {
  private observer: MutationObserver | null = null;
  private root: Element | null = null;
  private readonly sheets = new Set<Element>();
  /** Something changed that no sheet holds, or nothing was read yet. */
  private everything = true;

  observe(root: Element): void {
    if (typeof MutationObserver === "undefined") return;
    this.root = root;
    this.observer = new MutationObserver((records) => this.note(records));
    this.observer.observe(root, { subtree: true, attributes: true, childList: true, characterData: true });
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.invalidate();
  }

  /** This sheet is read again next time (a face its text draws with arrived). */
  mark(sheet: Element): void {
    this.sheets.add(sheet);
  }

  /** The next read answers "all of them". */
  invalidate(): void {
    this.everything = true;
    this.sheets.clear();
  }

  private sheetOf(node: Node): Element | null {
    const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
    return element?.closest("article[data-page-sheet]") ?? null;
  }

  private note(records: readonly MutationRecord[]): void {
    for (const record of records) {
      if (record.target === this.root) {
        // The root's own attributes are what its owner keys its context by.
        if (record.type !== "childList") continue;
        for (const node of record.addedNodes) {
          const sheet = this.sheetOf(node);
          if (sheet) this.sheets.add(sheet);
          else this.everything = true;
        }
        continue;
      }
      // A sheet going dormant or waking changes none of its lines.
      if (record.type === "attributes" && record.attributeName === "data-page-dormant") continue;
      // Nor do the stamps a page pass writes on the sheet element itself (its
      // page numbers, parity, span): a function of the layout, never an input
      // to a line. A pass that renumbered the pages marked every sheet, and
      // every block of every sheet was read again (a dormant sheet woken for
      // it in WebKit).
      if (record.type === "attributes" && stampsAreNoChange() && (record.target as Element).parentElement === this.root &&
          SHEET_STAMPS.has(record.attributeName ?? "")) continue;
      const sheet = this.sheetOf(record.target);
      if (sheet) this.sheets.add(sheet);
      else if (record.target.isConnected) this.everything = true;
    }
  }

  /** The sheets changed since the last read; null: read them all. */
  take(): ReadonlySet<Element> | null {
    if (!this.observer) return null;
    this.note(this.observer.takeRecords());
    const out = this.everything ? null : new Set([...this.sheets].filter((sheet) => sheet.isConnected));
    this.sheets.clear();
    this.everything = false;
    return out;
  }
}
