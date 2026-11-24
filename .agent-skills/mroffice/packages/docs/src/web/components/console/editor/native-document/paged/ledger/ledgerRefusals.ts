/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as PmNode } from "@tiptap/pm/model";
import { collectPages } from "@mrnote/core/web/components/console/editor/native-document/paged/pageRebalanceExtension.ts";
import type { LedgerBuild } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerAtoms.ts";

/** Enough for every refusal a document can hold at once; the oldest go first. */
const MAX_REFUSALS = 64;
/** Capacity reads of one unchanged page agree to well under a pixel. */
const CAPACITY_TOLERANCE_PX = 0.5;

/** Enough of a block's start to tell it from its neighbours. */
const OPENER_TEXT_CHARS = 48;

/**
 * The block opening a page, as the plan will keep seeing it. Not the node
 * itself: the head fragment the verifier moved is merged with its tail by the
 * very next reconcile (a new node), and that must not end the refusal.
 */
interface OpenerSignature {
  type: string;
  id: string | null;
  text: string;
}

function openerSignature(node: PmNode): OpenerSignature {
  return {
    type: node.type.name,
    id: typeof node.attrs?.block_id === "string" ? node.attrs.block_id : null,
    text: node.textContent.slice(0, OPENER_TEXT_CHARS),
  };
}

/** The same block, whole or as its head fragment (a head can be shorter). */
function sameOpener(a: OpenerSignature, b: OpenerSignature): boolean {
  return a.type === b.type && a.id === b.id && (a.text.startsWith(b.text) || b.text.startsWith(a.text));
}

interface Refusal {
  /** The page the physical verifier pushed content off, as it stood after. */
  pageNode: PmNode;
  /** The block that now opens the next page. */
  opener: OpenerSignature;
  /** The refused page's content capacity when the verifier measured it. */
  capacityPx: number;
}

/**
 * A page whose painted body ran past its foot while its plan, which cut a
 * block at its end, measured it within: the plan measured that page short by
 * `shortfallPx`. The next plans lay the page out that much shorter, so the
 * block is cut earlier on it instead of leaving the page whole (R465-D87's
 * print: a 25-item list's head pushed whole off a page it had 730 px of,
 * one page more than Word). Kept until the next authored edit, for the page
 * opened by the same fragment at the same capacity.
 */
interface Shortfall {
  opener: OpenerSignature;
  capacityPx: number;
  shortfallPx: number;
  tries: number;
  editSeq: number;
}

/**
 * Page boundaries the physical verifier refused, which the plan keeps.
 *
 * The plan fills a page from measured atoms; the verifier then checks the
 * painted sheet and pushes a suffix that still overflows onto the next page.
 * When the plan's own measure of that suffix is wrong (a text cut inside a
 * right-to-left paragraph whose head paints two lines taller than planned,
 * D010 pages 106 and 125), the next plan put the same head back, the
 * verifier pushed it off again, and the two layouts alternated every pass
 * until the 24-pass limit -- 4-6 s each on a 158-page document, restarted by
 * every keystroke.
 *
 * Word settles a page once and keeps it. So does the ledger now: after a
 * repair, the block that opens the next page opens it in every later plan
 * (a page break before it), for as long as that page is the same node, the
 * same block follows it, and the page keeps its capacity. An edit of the page
 * (ProseMirror replaces an edited node, untouched ones are shared), of the
 * block's start, or of the page's geometry drops the refusal and the plan is
 * free again.
 */
export class LedgerPhysicalRefusals {
  private entries: Refusal[] = [];

  private shortfallEntries: Shortfall[] = [];

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
    this.shortfallEntries = [];
  }

  /**
   * After a repair that pushed a cuttable block's piece off a page whose
   * plan measured it short (see Shortfall): the px the next plans take off
   * that page. `page` is the page node as it stood when the verifier read it
   * (its opening is the same after the push). Returns how many times the
   * page has now been short, this one included.
   */
  recordShortfall(page: PmNode, capacityPx: number, shortfallPx: number, editSeq: number): number {
    const first = page.firstChild;
    if (!first || !(shortfallPx > 0)) return 0;
    const opener = openerSignature(first);
    const previous = this.shortfallEntries.find((entry) =>
      entry.editSeq === editSeq && sameOpener(entry.opener, opener) &&
      Math.abs(entry.capacityPx - capacityPx) <= CAPACITY_TOLERANCE_PX);
    if (previous) {
      previous.shortfallPx += shortfallPx;
      previous.tries += 1;
      return previous.tries;
    }
    this.shortfallEntries.push({ opener, capacityPx, shortfallPx, tries: 1, editSeq });
    if (this.shortfallEntries.length > MAX_REFUSALS) this.shortfallEntries.splice(0, this.shortfallEntries.length - MAX_REFUSALS);
    return 1;
  }

  /** How many times the page `page` (at that capacity) was recorded short. */
  shortfallTries(page: PmNode, capacityPx: number, editSeq: number): number {
    const first = page.firstChild;
    if (!first) return 0;
    const opener = openerSignature(first);
    return this.shortfallEntries.find((entry) =>
      entry.editSeq === editSeq && sameOpener(entry.opener, opener) &&
      Math.abs(entry.capacityPx - capacityPx) <= CAPACITY_TOLERANCE_PX)?.tries ?? 0;
  }

  /**
   * The px each short page (by index) gives up in this plan. An entry from
   * before the last authored edit, or whose opening no page has at its
   * capacity any more, is dropped.
   */
  shortfalls(build: LedgerBuild, editSeq: number): ReadonlyMap<number, number> {
    const result = new Map<number, number>();
    if (this.shortfallEntries.length === 0) return result;
    // The fragment that opens each sheet, whole block or continuation.
    const openers = new Map<number, PmNode>();
    for (const block of build.logical) {
      for (const part of block.parts) {
        if (part.childIndex === 0 && !openers.has(part.sheet)) openers.set(part.sheet, part.node);
      }
    }
    this.shortfallEntries = this.shortfallEntries.filter((entry) => {
      if (entry.editSeq !== editSeq) return false;
      for (const [sheet, node] of openers) {
        if (result.has(sheet)) continue;
        if (!sameOpener(openerSignature(node), entry.opener)) continue;
        if (!(Math.abs(entry.capacityPx - (build.capacities[sheet] ?? Number.NaN)) <= CAPACITY_TOLERANCE_PX)) continue;
        result.set(sheet, entry.shortfallPx);
        return true;
      }
      return false;
    });
    return result;
  }

  /** After a repair dispatched: the pages it pushed content off, with the
   * content capacity it measured them at. */
  record(doc: PmNode, repaired: ReadonlyArray<{ sheet: number; capacityPx: number }>): void {
    const pages = collectPages(doc);
    if (!pages) return;
    for (const { sheet, capacityPx } of repaired) {
      const pageNode = pages[sheet]?.node;
      const blockNode = pages[sheet + 1]?.node.firstChild;
      if (!pageNode || !blockNode) continue;
      this.entries = this.entries.filter((entry) => entry.pageNode !== pageNode);
      this.entries.push({ pageNode, opener: openerSignature(blockNode), capacityPx });
    }
    if (this.entries.length > MAX_REFUSALS) this.entries.splice(0, this.entries.length - MAX_REFUSALS);
  }

  /**
   * The atoms (positions in `build.atoms`) each refused boundary keeps at the
   * top of a page. A refusal whose page or block changed is dropped.
   */
  breakBefore(doc: PmNode, build: LedgerBuild): ReadonlySet<number> {
    const result = new Set<number>();
    if (this.entries.length === 0) return result;
    const pages = collectPages(doc);
    if (!pages) {
      this.clear();
      return result;
    }
    const pageIndex = new Map<PmNode, number>(pages.map((page, index) => [page.node, index]));
    const atomPosition = new Map<number, number>(build.atoms.map((atom, position) => [atom.index, position]));
    // The logical block that opens each sheet, by the sheet it opens.
    const openers = new Map<number, { atom: number; node: PmNode }>();
    for (const block of build.logical) {
      const first = block.parts[0];
      const atom = atomPosition.get(block.index);
      if (first?.childIndex === 0 && atom !== undefined) openers.set(first.sheet, { atom, node: first.node });
    }
    this.entries = this.entries.filter((entry) => {
      const page = pageIndex.get(entry.pageNode);
      const opener = page === undefined ? undefined : openers.get(page + 1);
      if (page === undefined || !opener || !sameOpener(openerSignature(opener.node), entry.opener)) return false;
      if (!(Math.abs(entry.capacityPx - build.capacities[page]) <= CAPACITY_TOLERANCE_PX)) return false;
      result.add(opener.atom);
      return true;
    });
    return result;
  }
}
