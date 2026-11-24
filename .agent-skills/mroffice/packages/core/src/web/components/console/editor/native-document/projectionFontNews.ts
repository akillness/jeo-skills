/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { EditorView } from "@tiptap/pm/view";
import { newFontFacesOf } from "../../../../lib/font-face-news";
import { editorFontFamilies, facesUsedBy, fontFamilyNames, loadedFaceRanges, textDrawsCodePointIn } from "./paged/ledger/ledgerFontRanges";
import { sheetsOf } from "./paged/sheetMeasureMemo";
import { coldFirstLayout } from "./paged/coldFirstLayout";

type FaceLike = { family?: string; unicodeRange?: string };

export function projectionFontNewsOn(view: EditorView): boolean {
  const win = view.dom.ownerDocument.defaultView as (Window & { __docsProjectionFontNews?: boolean }) | null;
  if (win?.__docsProjectionFontNews === true) return true;
  // The cold first layout reads a late face only where it draws (coldFirstLayout).
  return win?.__docsProjectionFontNews !== false && coldFirstLayout(win)?.fontNews === true;
}

/** "all": the whole document; "none": nothing; else the sheets and the
 * families (lower case) the faces belong to. */
export type FontNewsReach = "all" | "none" | { readonly sheets: readonly HTMLElement[]; readonly families: readonly string[] };

/** One event's reach, read once for all the projections answering it. */
const reachOfEvent = new WeakMap<Event, { root: HTMLElement; reach: FontNewsReach }>();

export function fontNewsReach(root: HTMLElement, event: Event | null | undefined): FontNewsReach {
  if (!event) return readFontNewsReach(root, event);
  const kept = reachOfEvent.get(event);
  if (kept?.root === root) return kept.reach;
  const reach = readFontNewsReach(root, event);
  reachOfEvent.set(event, { root, reach });
  return reach;
}

function readFontNewsReach(root: HTMLElement, event: Event | null | undefined): FontNewsReach {
  const faces: readonly FaceLike[] | null | undefined = newFontFacesOf(event) ??
    (event as (Event & { fontfaces?: readonly FaceLike[] }) | null | undefined)?.fontfaces;
  if (!faces || faces.length === 0) return "all";
  const used = facesUsedBy(faces, editorFontFamilies(root));
  if (used.length === 0) return "none";
  const ranges = loadedFaceRanges(used);
  if (!ranges) return "all";
  const families = [...new Set(used.flatMap((face) => fontFamilyNames(face.family ?? "")))];
  const sheets = sheetsOf(root).filter((sheet) => textDrawsCodePointIn(sheet.textContent ?? "", ranges));
  return sheets.length ? { sheets, families } : "none";
}

/** The document ranges of `sheets` (top-level pages), in order. */
export function sheetRangesOf(view: EditorView, sheets: readonly Element[]): Array<[number, number]> {
  const wanted = new Set(sheets);
  const articles = sheetsOf(view.dom);
  const inOrder = articles.length === view.state.doc.childCount;
  const ranges: Array<[number, number]> = [];
  view.state.doc.forEach((node, offset, index) => {
    const dom = inOrder ? articles[index] : view.nodeDOM(offset);
    if (dom && wanted.has(dom as Element)) ranges.push([offset, offset + node.nodeSize]);
  });
  return ranges;
}

/** The text blocks in `ranges`, for a projection forgetting their readings. */
export function textblocksIn(view: EditorView, ranges: readonly [number, number][], each: (node: import("@tiptap/pm/model").Node) => void): void {
  const doc = view.state.doc;
  for (const [from, to] of ranges) {
    doc.nodesBetween(Math.max(0, from), Math.min(doc.content.size, to), (node) => {
      if (node.isTextblock) {
        each(node);
        return false;
      }
      return true;
    });
  }
}

export function traceProjectionFonts(view: EditorView, name: string, reach: FontNewsReach): void {
  const sink = (view.dom.ownerDocument.defaultView as (Window & { __pageLedgerTrace?: unknown[] }) | null)?.__pageLedgerTrace;
  if (!Array.isArray(sink)) return;
  sink.push({ at: Date.now(), projectionFonts: { name, reach: typeof reach === "string" ? reach : reach.sheets.length } });
}

/** The reach a projection acts on: the trial's; off, nothing for news no
 * page text draws with, else the whole document. */
export function projectionFontReach(view: EditorView, name: string, event: Event | null | undefined): FontNewsReach {
  const read = fontNewsReach(view.dom, event);
  const reach = read === "none" || projectionFontNewsOn(view) ? read : "all";
  traceProjectionFonts(view, name, reach);
  return reach;
}
