/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The measurement horizon of a progressively laid-out document.
 *
 * While the page ledger lays a long document out progressively (its initial
 * settle, a font that changed every page) each pass measures the sheets up
 * to its horizon only; the sheets past it are not laid out at all
 * (content-visibility on the sheets). The metric projections the ledger reads
 * line boxes through (the Word CJK spacing, the auto line spacing) project the same
 * sheets: reading the geometry of a sheet past the horizon would lay out the
 * sheets the progressive pass leaves alone, every pass.
 *
 * The ledger publishes its horizon here before it asks the projections for
 * their measurements; a projection records how far it projected, and a
 * horizon it has not covered yet makes the ledger ask again.
 */
import { sheetsOf } from "./sheetMeasureMemo";

/** Per editor root: the sheets the ledger measures now (null: all). */
const horizons = new WeakMap<HTMLElement, ReadonlySet<Element> | null>();
/** Per editor root and projection: the sheets it last measured (null: all). */
const projected = new WeakMap<HTMLElement, Map<string, ReadonlySet<Element> | null>>();

/** Dispatched on the editor root when sheets may have come within the
 * horizon (a wider horizon, a sheet read again): a projection that skipped
 * sheets looks at them now. */
export const MEASURE_HORIZON_EVENT = "mrn-measure-horizon";

function horizonWidened(root: HTMLElement): void {
  const win = root.ownerDocument.defaultView;
  if (win) root.dispatchEvent(new win.CustomEvent(MEASURE_HORIZON_EVENT));
}

export function setMeasureHorizon(root: HTMLElement, sheets: ReadonlySet<Element> | null): void {
  const before = horizons.get(root);
  horizons.set(root, sheets);
  if (before !== undefined && before !== null && (sheets === null || sheets.size > 0)) horizonWidened(root);
}

/** Per editor root: sheets the ledger leaves unread as they stand (a
 * restored receipt's or the docs-layout engine's far pages) until the
 * reader nears them. */
const unread = new WeakMap<HTMLElement, Set<Element>>();

/** The ledger trusts `sheet` as it stands (`true`) or reads it again. */
export function setSheetUnread(root: HTMLElement, sheet: Element, isUnread: boolean): void {
  let sheets = unread.get(root);
  if (isUnread) {
    if (!sheets) unread.set(root, (sheets = new Set()));
    sheets.add(sheet);
  } else if (sheets?.delete(sheet)) {
    horizonWidened(root);
  }
}

/** Let go of sheets no longer in the document: a page drawn hollow drops its
 * sheet, and no pass may read these lists for a long time. */
export function forgetDetachedHorizonSheets(root: HTMLElement): void {
  const prune = (sheets: ReadonlySet<Element> | null | undefined) => {
    if (!sheets) return;
    for (const sheet of sheets) if (!sheet.isConnected) (sheets as Set<Element>).delete(sheet);
  };
  prune(horizons.get(root));
  prune(unread.get(root));
  for (const sheets of projected.get(root)?.values() ?? []) prune(sheets);
}

/** The sheets a projection measures now, or null for every sheet. A sheet
 * outside keeps what was projected for it before (laid out by an earlier
 * pass with nothing changed in it since, or not laid out yet). A sheet the
 * ledger leaves unread is outside: reading its geometry laid out the far
 * pages a trusted layout is there to leave alone. */
export function sheetsWithinMeasureHorizon(root: HTMLElement): ReadonlySet<Element> | null {
  const horizon = horizons.get(root) ?? null;
  const left = unread.get(root);
  if (!left || left.size === 0) return horizon;
  for (const sheet of left) if (!sheet.isConnected) left.delete(sheet);
  if (left.size === 0) return horizon;
  const within = new Set<Element>();
  for (const sheet of horizon ?? sheetsOf(root)) {
    if (!left.has(sheet)) within.add(sheet);
  }
  return within;
}

/** A projection (`key`: which one, the Word CJK spacing by default)
 * measured the sheets of the current horizon. */
export function recordProjectedHorizon(root: HTMLElement, key = "cjk-spacing"): void {
  let records = projected.get(root);
  if (!records) projected.set(root, (records = new Map()));
  // What it measured: a sheet left unread then is projected once it is read.
  records.set(key, sheetsWithinMeasureHorizon(root));
}

/** Whether the last run of every projection measured every sheet of
 * `sheets` (or one of them: `key`). */
export function projectionCoversHorizon(root: HTMLElement, sheets: ReadonlySet<Element> | null, key?: string): boolean {
  const records = projected.get(root);
  if (!records) return true;
  for (const [name, covered] of records) {
    if (key !== undefined && name !== key) continue;
    if (covered === null) continue;
    if (sheets === null) return false;
    for (const sheet of sheets) if (!covered.has(sheet)) return false;
  }
  return true;
}
