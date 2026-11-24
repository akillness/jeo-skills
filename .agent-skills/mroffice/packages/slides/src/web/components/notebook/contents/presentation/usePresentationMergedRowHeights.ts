"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

import { officeRowsUnderMerges, type OfficeMergedRows } from "@mrnote/core/web/lib/office-table-merged-rows.ts";























const PROBE_ATTRIBUTE = "data-merged-rows-probe";
const EPS_PX = 0.25;

let probeSheet: HTMLStyleElement | null = null;

function ensureProbeSheet(doc: Document): void {
  if (probeSheet?.isConnected && probeSheet.ownerDocument === doc) return;
  const merged = (tag: string) => `table[${PROBE_ATTRIBUTE}] > tbody > tr > ${tag}[rowspan]:not([rowspan="1"])`;
  probeSheet = doc.createElement("style");
  probeSheet.setAttribute("data-presentation-merged-rows", "");
  probeSheet.textContent =
    `${merged("td")}, ${merged("th")} { padding-block: 0 !important; }\n` +
    `${merged("td")} > *, ${merged("th")} > * { height: 0 !important; min-height: 0 !important; max-height: 0 !important; ` +
    `overflow: hidden !important; margin-block: 0 !important; padding-block: 0 !important; border-block-width: 0 !important; }\n`;
  doc.head.appendChild(probeSheet);
}

function mergesOf(rows: readonly HTMLTableRowElement[]): OfficeMergedRows[] | null {
  const spans: { start: number; end: number }[] = [];
  rows.forEach((row, index) => {
    for (const cell of Array.from(row.cells)) {
      if (cell.rowSpan > 1) spans.push({ start: index, end: Math.min(rows.length - 1, index + cell.rowSpan - 1) });
    }
  });
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const groups: { start: number; end: number }[] = [];
  for (const span of spans) {
    const last = groups[groups.length - 1];
    if (last && last.start === span.start && last.end === span.end) continue;
    if (last && span.start <= last.end) return null;
    if (span.end > span.start) groups.push(span);
  }
  return groups.map((group) => ({ ...group, need: 0 }));
}

function heightsOf(rows: readonly HTMLTableRowElement[], scale: number): number[] {
  return rows.map((row) => row.getBoundingClientRect().height / scale);
}

function statedPx(style: CSSProperties | undefined): number | null | undefined {
  const height = style?.height;
  if (height === undefined) return undefined;
  return typeof height === "number" && Number.isFinite(height) ? height : null;
}

/** The heights to state on rows (by index), or an empty map. */
export function measurePresentationMergedRows(
  table: HTMLTableElement,
  rowStyles: readonly (CSSProperties | undefined)[],
): Map<number, number> {
  const body = table.tBodies[0];
  const rows = body ? (Array.from(body.rows) as HTMLTableRowElement[]) : [];
  const planned = new Map<number, number>();
  if (!rows.length || rows.length !== rowStyles.length || table.offsetWidth === 0) return planned;
  if (rowStyles.some((style) => statedPx(style) === null)) return planned;
  const merges = mergesOf(rows);
  if (!merges?.length) return planned;
  const scale = table.getBoundingClientRect().width / table.offsetWidth || 1;
  // The rows as React drew them (a stated last row included) are put back.
  const held = rows.map((row) => row.style.height);
  const base = rowStyles.map((style) => {
    const px = statedPx(style);
    return typeof px === "number" ? `${px}px` : "";
  });
  ensureProbeSheet(table.ownerDocument);
  try {
    rows.forEach((row, index) => (row.style.height = base[index]!));
    // Read 1: every row at its own height.
    table.setAttribute(PROBE_ATTRIBUTE, "");
    const own = heightsOf(rows, scale);
    table.removeAttribute(PROBE_ATTRIBUTE);
    // Read 2: the browser's, with the merged content back.
    const drawn = heightsOf(rows, scale);
    const needs = merges.map((merge) => {
      let sum = 0;
      for (let row = merge.start; row <= merge.end; row += 1) sum += drawn[row]!;
      return { ...merge, need: sum };
    });
    const wanted = officeRowsUnderMerges(own, needs);
    for (const merge of needs) {
      const extra = wanted[merge.end]! - own[merge.end]!;
      // The merge fits its rows, or the browser already gave the last row all of it.
      if (extra <= EPS_PX || drawn[merge.end]! - own[merge.end]! >= extra - EPS_PX) continue;
      planned.set(merge.end, wanted[merge.end]!);
    }
    if (!planned.size) return planned;
    // Read 3: a row's stated height and its drawn one can differ by its
    // borders; the difference is taken off once.
    for (const [row, px] of planned) rows[row]!.style.height = `${px}px`;
    const now = heightsOf(rows, scale);
    for (const [row, px] of planned) {
      const off = px - now[row]!;
      if (Math.abs(off) > EPS_PX) planned.set(row, px + off);
    }
    for (const [row, px] of planned) planned.set(row, Math.round(px * 1000) / 1000);
    return planned;
  } finally {
    table.removeAttribute(PROBE_ATTRIBUTE);
    rows.forEach((row, index) => (row.style.height = held[index]!));
  }
}

function sameMap(a: ReadonlyMap<number, number>, b: ReadonlyMap<number, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (Math.abs((b.get(key) ?? Number.NaN) - value) > EPS_PX) return false;
  return true;
}

const EMPTY = new Map<number, number>();

/**
 * `rowStyles` with the last row of each merge stated at PowerPoint's height.
 * `measureKey` changes whenever what the rows hold may have (the block).
 */
export function usePresentationMergedRowHeights(
  tableRef: RefObject<HTMLTableElement | null>,
  rowStyles: readonly (CSSProperties | undefined)[],
  measureKey: unknown,
  enabled = true,
): readonly (CSSProperties | undefined)[] {
  const [stated, setStated] = useState<ReadonlyMap<number, number>>(EMPTY);
  const [fontEpoch, setFontEpoch] = useState(0);
  const heightsKey = rowStyles.map((style) => String(style?.height ?? "")).join("|");
  useEffect(() => {
    if (!enabled || typeof document === "undefined" || !document.fonts) return;
    const bump = () => setFontEpoch((epoch) => epoch + 1);
    document.fonts.addEventListener("loadingdone", bump);
    return () => document.fonts.removeEventListener("loadingdone", bump);
  }, [enabled]);
  useLayoutEffect(() => {
    const table = tableRef.current;
    const next = enabled && table ? measurePresentationMergedRows(table, rowStyles) : EMPTY;
    setStated((before) => (sameMap(before, next) ? before : next));
    // rowStyles is read through heightsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableRef, measureKey, heightsKey, fontEpoch, enabled]);
  if (!stated.size) return rowStyles;
  return rowStyles.map((style, index) => (stated.has(index) ? { ...style, height: stated.get(index) } : style));
}
