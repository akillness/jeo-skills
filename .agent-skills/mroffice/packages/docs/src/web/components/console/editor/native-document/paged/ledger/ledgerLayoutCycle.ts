/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A layout that alternates over many passes.
 *
 * The ledger reads a plan that puts back what the last pass replaced as a
 * cycle, and holds it. A background laid out a window at a time goes through
 * dozens of passes between one layout of a page and the other, so no pass ever
 * puts the last one's back: a 272-page book moved a heading and its paragraph
 * on and back at page 220, every page after it each time, 268 pages then 269,
 * until the pass limit ended it minutes later. The pages as a whole are the
 * only place that shows it: a plan that changed the pages to a layout they have
 * had twice already, on the same inputs. (Once could be a correction on its way
 * to a third layout; a window's plan shows it as well as a plan to the end, the
 * pages it did not reach standing as they do. The same book held page 106 and
 * still went between two layouts from there every 1.3 s.)
 */
import type { Node as PmNode } from "@tiptap/pm/model";

/** Each page's own part of the signature, kept by its node: a pass replaces
 * the pages it changes, so only those are read again. */
const pageSignatures = new WeakMap<PmNode, string>();

function pageSignature(page: PmNode): string {
  let signature = pageSignatures.get(page);
  if (signature === undefined) {
    // Its text, block by block: where a cut falls inside a row, a cell or a
    // paragraph. A table of 2-10 px columns went between two cuts of one
    // row on every pass, the same blocks and the same size on each page
    // either way, and the ledger laid it out for as long as it was open
    // (ec0ad3e4, 934 passes in 87 s).
    const text = page.textBetween(0, page.content.size, "\u00b6", "\u2020");
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0;
    signature = `${page.childCount}:${page.content.size}:${(hash >>> 0).toString(36)}`;
    pageSignatures.set(page, signature);
  }
  return signature;
}

/** What tells two layouts of one document apart: what each page holds. */
export function pageLayoutSignature(doc: PmNode): string {
  const pages: string[] = [];
  doc.forEach((page) => pages.push(pageSignature(page)));
  return pages.join("/");
}

/** Fewer pages first, then the page opening that comes earlier. */
function compareLayouts(a: string, b: string): number {
  const pa = a.split("/"), pb = b.split("/");
  if (pa.length !== pb.length) return pa.length - pb.length;
  for (let index = 0; index < pa.length; index += 1) {
    if (pa[index] === pb[index]) continue;
    // The page holding fewer blocks is the one whose boundary comes earlier.
    const ca = Number.parseInt(pa[index], 10), cb = Number.parseInt(pb[index], 10);
    if (ca !== cb) return ca - cb;
    return pa[index] < pb[index] ? -1 : 1;
  }
  return 0;
}

export interface LayoutCycleWatch {
  /** The pages after a plan was applied: whether they keep coming back to a
   * layout they had, through another. */
  cameBack(doc: PmNode, editSeq: number): boolean;
  /** The inputs changed (fonts, width, page geometry): nothing seen holds. */
  forget(): void;
}

export function createLayoutCycleWatch(): LayoutCycleWatch {
  const seen = new Map<string, number>();
  let last: string | null = null;
  let seq: number | null = null;
  return {
    cameBack(doc, editSeq) {
      if (seq !== editSeq) {
        seen.clear();
        last = null;
        seq = editSeq;
      }
      const layout = pageLayoutSignature(doc);
      if (layout === last) return false;
      last = layout;
      const times = (seen.get(layout) ?? 0) + 1;
      seen.set(layout, times);
      if (times < 3) return false;
      // Going round: the pages stop on one layout of the round chosen by a fixed
      // rule, not on whichever the round happened to be at. The fewest pages,
      // then the earliest page that differs (signatures compared page by page).
      // Stopped wherever, a document going round three layouts (R345-D08: 27,
      // 28 and 27 sheets) settled on any of them. A round that never comes to
      // the chosen one stops anyway at its sixth time round.
      let canonical: string | null = null;
      for (const [signature, count] of seen) {
        if (count < 2) continue;
        if (canonical === null || compareLayouts(signature, canonical) < 0) canonical = signature;
      }
      return layout === canonical || times >= 6;
    },
    forget() {
      seen.clear();
      last = null;
    },
  };
}
