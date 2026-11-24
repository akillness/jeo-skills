/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A long document's pages kept beside it, and opened from there instead of
 * being laid out again (OO-speed plan, item 4; `docs-layout-snapshot`).
 *
 * What is kept, one row per part of the document (a page not held as parts has
 * part 0): each sheet's blocks and cuts as a recipe (paginationProjectionReceipt)
 * and each block's measurement (ledgerAtoms), which is all a far page's plan
 * needs: its sheet can stand hollow with nothing of it laid out.
 *
 * A row is used only when all of this holds; otherwise the page is laid out as
 * it always was, and what it reaches replaces the row:
 *  - the layout code is this build's (the read asks for it by version);
 *  - the browser engine is this one's;
 *  - the part's content and the document's settings are the row's
 *    (layoutContentHash), and the restored pages flatten back to exactly that
 *    content (restorePaginationProjection): a collaborator's change, an edit
 *    made elsewhere, another paper size all name other content;
 *  - the fonts read the same metrics here (fontsKey, checked before the pages
 *    show);
 *  - the reader's pages, laid out, change nothing (the page ledger, with
 *    restoredLayoutMark), and a sample of far pages, drawn on an idle moment,
 *    stand at the heights kept.
 */
import type { JSONContent } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { textEngineEnabled } from "../../../../../lib/text-engine/flags";
import {
  documentPartOwnersOf,
  LAYOUT_CODE_VERSION,
  printPartsOf,
  printRowsOf,
  layoutRowExtraAccepted,
  layoutEngineName,
  layoutSnapshotRows,
  storeLayoutSnapshots,
  type LayoutSnapshotPartOut,
  type LayoutSnapshotRow,
  traceLayoutSnapshot,
} from "../../../../../lib/docs-layout-snapshot-store";
import { canonicalProjectionDocument, capturePaginationProjectionRecipe, layoutContentHash, markKeptLayoutReceipt, NO_PAGE_GEOMETRY, projectionCanonicalHash, type PaginationProjectionReceipt, type ProjectionNodeRecipe } from "./paginationProjectionReceipt";
import { provisionalPageSizesForJson } from "./provisionalPages";
import { PAGINATION_RUNTIME_ATTRIBUTES, splitPieceRoot } from "./paginationProjectionKeys";
import { blockVerified, encodedBlockMeasure, forgetBlockMeasure, seedBlockMeasure } from "./ledger/ledgerAtoms";
import {
  autoLinesKeptOn, encodedBlockAutoLines, encodedBlockLines, engineLinesKeptOn, forgetSeededBlockLines, seedBlockAutoLines, seedBlockLines,
  type KeptAutoLineItem,
} from "../engineLinesKept";
import { withProjectionJsonMemo } from "./projectionJsonMemo";
import { mergePagedRuntimeContinuationsJson } from "./serialization";
import { markProbeStartedFaces, unloadedFacesOf } from "./ledger/ledgerFontRanges";

export function layoutSnapshotsEnabled(): boolean {
  return Boolean(LAYOUT_CODE_VERSION) && textEngineEnabled("docs-layout-snapshot") && textEngineEnabled("docs-layout");
}

/** The document a part lays out as: the document's settings over its blocks,
 * nothing a stored body adds around them. */
function partDocument(attrs: unknown, content: readonly unknown[]): JSONContent {
  return { type: "doc", ...(attrs ? { attrs: attrs as Record<string, unknown> } : {}), content: content as JSONContent[] };
}

/** The row kept for this content, as a receipt for that content: its pages
 * then restore only if they flatten back to it exactly. */
export function snapshotReceiptFor(pageId: string, part: number, root: JSONContent, via = ""): { receipt: PaginationProjectionReceipt; row: LayoutSnapshotRow; hash: string } | null {
  if (via === "bridge" && pageId) rememberRoomForm(pageId, part, root);
  if (!layoutSnapshotsEnabled() || !pageId) return null;
  if (auditing()) traceLayoutSnapshot(`asked part ${part} via ${via}: ${describeForAudit(root)}`);
  const candidates = refutedPages.has(pageId) ? [] : layoutSnapshotRows(pageId, part);
  const content = partDocument(root.attrs, root.content ?? []);
  // Named when it is first asked for (the hash of a part of 500 blocks is
  // most of a part's load): a part with no row asks it at its capture.
  let named: string | null = null;
  const nameOf = () => (named ??= withProjectionJsonMemo(() => layoutContentHash(content)));
  rememberOpenedPart(pageId, part, nameOf, root.content?.length ?? 0, content);
  if (!candidates.length) {
    traceLayoutSnapshot(`part ${part}: no row`);
    return null;
  }
  const row = withProjectionJsonMemo(() =>
    wholePartRows(candidates).find((candidate) => rowNamesContent(candidate, root.attrs, root.content ?? [], nameOf)));
  if (!row) {
    traceLayoutSnapshot(`part ${part}: no row of ${candidates.length} names it`);
    for (const whole of wholePartRows(candidates)) {
      if (!whole.segmentHashes) continue;
      const blocks = root.content ?? [];
      const bad = whole.segmentHashes.findIndex(([first, count, hash]) => withProjectionJsonMemo(() => layoutContentHash(partDocument(root.attrs, blocks.slice(first, first + count)))) !== hash);
      traceLayoutSnapshot(`part ${part}: kept whole of ${whole.segmentHashes.length} segments, ${whole.blockCount} / ${blocks.length} blocks, first unnamed segment ${bad}`);
      if (bad >= 0 && auditing()) {
        const [first, count] = whole.segmentHashes[bad]!;
        traceLayoutSnapshot(`part ${part} segment ${bad} blocks here: ${blockHashesForAudit(blocks.slice(first, first + count))}`);
      }
    }
    return null;
  }
  const hash = row.segmentHashes ? row.contentHash : nameOf();
  return {
    row,
    hash,
    receipt: markKeptLayoutReceipt({
      version: 1 as const,
      canonicalHash: withProjectionJsonMemo(() => projectionCanonicalHash(root)),
      pages: row.pages,
      geometry: row.pages.map(() => NO_PAGE_GEOMETRY),
    }),
  };
}

/** A row found for a later part, its fonts checked, as appended. */
export interface KeptPartLayout {
  readonly row: LayoutSnapshotRow;
  readonly receipt: PaginationProjectionReceipt;
}

/** Long enough to be worth asking the server for its pages. */
export function documentIsLongForLayoutSnapshot(content: unknown, partCount: number): boolean {
  const record = content as { content?: unknown } | null;
  return partCount > 1 || (Array.isArray(record?.content) && record!.content.length >= 120);
}










export function openingAsksForRows(pageId: string, partCount: number): boolean {
  if ((globalThis as { __docsSnapshotShortKeep?: boolean }).__docsSnapshotShortKeep === true) return true;
  const first = openedParts.get(pageId)?.get(0);
  if (!first) return true;
  return documentIsLongForLayoutSnapshot(first.content, partCount);
}

/* ---- A print: the whole document at once --------------------------------- */

/**
 * The layout a print reached, as rows: its parts told apart by the blocks its
 * payload named, each named by its content as stored. Only what differs from the
 * rows it was handed. Null when it was handed no parts to name.
 */
export async function printLayoutToKeep(pageId: string, doc: PmNode): Promise<Array<LayoutSnapshotPartOut & { layout: string; engine: string; fontsKey: string }> | null> {
  const parts = printPartsOf(pageId);
  if (!parts || !LAYOUT_CODE_VERSION) return null;
  parts.blocks.forEach((blocks, part) => {
    const content = partDocument(parts.attrs, blocks);
    rememberOpenedPart(pageId, part, withProjectionJsonMemo(() => layoutContentHash(content)), blocks.length, content);
  });
  const owner = ownersByOrder(doc, parts.blocks.map((blocks) => blocks.length));
  if (!owner) return null;
  const out: Array<LayoutSnapshotPartOut & { layout: string; engine: string; fontsKey: string }> = [];
  const skip = new Set<number>();
  const handed = printRowsOf(pageId) ?? [];
  for (;;) {
    const { part, left, passed } = captureChangedPart(pageId, doc, owner, skip, 0, true);
    if (passed !== undefined) skip.add(passed);
    if (part) {
      if (part.done !== false) skip.add(part.part);
      // Kept again unless a row handed already says the same for these fonts
      // (the print's faces may read otherwise than the browser that kept it).
      const fontsKey = await fontsKeyFor(part.families);
      const same = handed.find((row) => row.part === part.part && (row.segment ?? 0) === (part.segment ?? 0) &&
        row.captureId === part.captureId && row.contentHash === part.contentHash &&
        row.layout === LAYOUT_CODE_VERSION && row.fontsKey === fontsKey);
      // A row kept before its lines were (engineLinesKept) is kept again with them.
      if (!same || JSON.stringify(same.pages) !== JSON.stringify(part.pages) || (part.lines && !same.lines) || (part.autoLines && !same.autoLines)) {
        if (fontsKey) {
          out.push({
            ...rowOut(part),
            layout: LAYOUT_CODE_VERSION, engine: layoutEngineName(), fontsKey,
          });
        }
      }
    }
    if (!left) break;
  }
  return out;
}

/** The ordinal a sheet's child is tagged with for {@link ownersByOrder}. */
const ORDINAL_ATTR = "__layoutSnapshotOrdinal";












export function ownersByOrder(doc: PmNode, sizes: readonly number[]): Map<string, number> | null {
  const children: PmNode[] = [];
  doc.forEach((page) => page.forEach((child) => { children.push(child); }));
  const json = doc.toJSON() as JSONContent;
  let tagged = 0;
  for (const page of json.content ?? []) {
    for (const child of page.content ?? []) child.attrs = { ...(child.attrs ?? {}), [ORDINAL_ATTR]: tagged++ };
  }
  const merged = withProjectionJsonMemo(() => mergePagedRuntimeContinuationsJson(json));
  const heads: number[] = [];
  for (const page of merged.content ?? []) {
    for (const block of page.content ?? []) {
      const ordinal = (block.attrs as Record<string, unknown> | undefined)?.[ORDINAL_ATTR];
      heads.push(typeof ordinal === "number" ? ordinal : -1);
    }
  }
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (heads.length !== total || heads.some((ordinal, index) => ordinal < 0 || (index > 0 && ordinal <= heads[index - 1]!))) {
    traceLayoutSnapshot(`print: ${heads.length} merged blocks for parts of ${total}: not kept`);
    return null;
  }
  const partOfBlock: number[] = [];
  sizes.forEach((size, part) => { for (let n = 0; n < size; n += 1) partOfBlock.push(part); });
  const owner = new Map<string, number>();
  let block = -1;
  children.forEach((child, ordinal) => {
    // A child that heads no merged block (a piece after its head, a note
    // list's slice) stands with the block before it.
    while (block + 1 < heads.length && heads[block + 1]! <= ordinal) block += 1;
    const root = splitPieceRoot(child.attrs as Record<string, unknown>);
    if (root !== null && block >= 0 && !owner.has(root)) owner.set(root, partOfBlock[block]!);
  });
  return owner;
}

function shiftedRecipe(recipe: ProjectionNodeRecipe, by: number): ProjectionNodeRecipe {
  return {
    ...recipe,
    path: [recipe.path[0]! + by, ...recipe.path.slice(1)],
    ...(recipe.children ? { children: recipe.children.map((child) => shiftedRecipe(child, by)) } : {}),
  };
}

export interface PrintLayoutReceipt {
  readonly receipt: PaginationProjectionReceipt;
  /** Whether every part of the document came from a row. */
  readonly complete: boolean;
  /** Each part's row and content, whose fonts the print checks. */
  readonly parts: readonly { readonly row: LayoutSnapshotRow; readonly content: JSONContent }[];
}

/**
 * The pages of a whole document printed at once (its parts one after another),
 * from the rows that name its content. A part no row names stands as provisional
 * sheets, for the ledger to lay out: an edit's print lays out what it reaches.
 * Null with no row for any part. Restoring holds the result to the content.
 */
export function printLayoutReceiptFor(pageId: string, root: JSONContent): PrintLayoutReceipt | null {
  const rows = printRowsOf(pageId);
  if (!rows?.length || !LAYOUT_CODE_VERSION) return null;
  const usable = wholePartRows(rows.filter((row) => row.layout === LAYOUT_CODE_VERSION));
  const counts = new Map<number, number>();
  for (const row of usable) if (!counts.has(row.part)) counts.set(row.part, row.blockCount);
  const blocks = root.content ?? [];
  const pages: ProjectionNodeRecipe[][] = [];
  const parts: { row: LayoutSnapshotRow; content: JSONContent }[] = [];
  let offset = 0;
  let complete = true;
  const stood = (from: number, to: number) => {
    const slice = blocks.slice(from, to);
    const sizes = provisionalPageSizesForJson(slice, root.attrs as Record<string, unknown> | null | undefined) ?? [slice.length];
    let at = from;
    for (const size of sizes) {
      const page: ProjectionNodeRecipe[] = [];
      for (let index = at; index < at + size; index += 1) page.push({ path: [index] });
      if (page.length) pages.push(page);
      at += size;
    }
  };
  return withProjectionJsonMemo(() => {
    for (let part = 0; counts.has(part) && offset < blocks.length; part += 1) {
      const count = counts.get(part)!;
      const slice = blocks.slice(offset, offset + count);
      const content = partDocument(root.attrs, slice);
      let hash: string | null = null;
      const row = usable.find((candidate) => candidate.part === part && rowNamesContent(candidate, root.attrs, slice, () => (hash ??= layoutContentHash(content))));
      if (!row) {
        traceLayoutSnapshot(`print part ${part}: no row names it`);
        complete = false;
        stood(offset, offset + count);
      } else {
        parts.push({ row, content });
        row.pages.forEach((page, index) => {
          const shifted = page.map((recipe) => shiftedRecipe(recipe, offset));
          if (index === 0 && row.continues && pages.length) pages[pages.length - 1]!.push(...shifted);
          else pages.push(shifted);
        });
      }
      offset += count;
    }
    if (offset !== blocks.length) {
      traceLayoutSnapshot(`print: rows reach ${offset} of ${blocks.length} blocks`);
      complete = false;
      if (offset < blocks.length) stood(offset, blocks.length);
      else return null;
    }
    if (!parts.length) return null;
    return {
      complete,
      parts,
      receipt: markKeptLayoutReceipt({
        version: 1 as const,
        canonicalHash: projectionCanonicalHash(root),
        pages,
        geometry: pages.map(() => NO_PAGE_GEOMETRY),
      }),
    };
  });
}

/* ---- The fonts ---------------------------------------------------------- */

// No two punctuation marks together: their trimming (text-spacing-trim) comes
// and goes with what the browser has read of a system font, and the digest with it.
const SAMPLES = ["Hamburgefonstiv 0123456789", "\u6c38\u548c\u4e5d\uff0c\u5e74\u5c81\u5728\u3002\u7678\u4e11"];
const FONT_KEY = /"([A-Za-z]*(?:font|Font|ascii|eastAsia|hAnsi)[A-Za-z]*)":"([^"\\]{1,200})"/g;
const NOT_A_FAMILY = /size|weight|style|color|stretch|kerning|variant|scale|hint|theme|effect|fill|outline|language|charset/i;

/** The families this content names anywhere (marks, nodes, its settings). */
export function fontFamiliesOf(document: JSONContent): string[] {
  const found = new Set<string>();
  const text = JSON.stringify(document);
  for (const match of text.matchAll(FONT_KEY)) {
    if (NOT_A_FAMILY.test(match[1]!)) continue;
    found.add(match[2]!);
    if (found.size >= 60) break;
  }
  return [...found].sort();
}

const FONT_LOAD_WAIT_MS = 4000;
let measuring: CanvasRenderingContext2D | null | undefined;

function familyList(family: string): string {
  return family.split(",").map((name) => {
    const clean = name.trim().replace(/^['"]|['"]$/g, "");
    return /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/.test(clean) ? clean : `"${clean}"`;
  }).join(", ");
}












function fontsKeySettles(): boolean {
  return (globalThis as { __docsFontsKeySettled?: boolean }).__docsFontsKeySettled === true;
}

const SETTLE_READS = 5;

/** The next frame, or 100 ms where frames do not come (a hidden page). */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 100);
    if (typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    }));
  });
}

/** `read` once the page's font loads are over (for a while) and two readings a
 * frame apart agree; at most SETTLE_READS frames. */
export async function settledReading(read: () => string[]): Promise<string[]> {
  const ready = typeof document !== "undefined" ? document.fonts?.ready : undefined;
  if (ready) await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, FONT_LOAD_WAIT_MS))]);
  let last = read();
  for (let attempt = 0; attempt < SETTLE_READS; attempt += 1) {
    await nextFrame();
    const now = read();
    if (now.every((part, index) => part === last[index])) return now;
    last = now;
  }
  return last;
}

/**
 * What these families measure here, as a digest: another version of a font,
 * a substitute, one missing (the browser's fallback measures otherwise) all
 * read differently, which is what a kept layout depends on. Faces are asked
 * for first and waited for, for a while. Null where it cannot be read.
 */
export async function fontsKeyFor(families: readonly string[]): Promise<string | null> {
  if (typeof document === "undefined" || !document.fonts) return null;
  if (measuring === undefined) {
    const canvas = document.createElement("canvas");
    measuring = canvas.getContext("2d");
  }
  const context = measuring;
  if (!context) return null;
  const faces = families.flatMap((family) => ["", "bold "].flatMap((weight) => SAMPLES.map((sample) => [`${weight}100px ${familyList(family)}`, sample] as const)));
  // The faces this reading brings in are its own: the page ledger lets them
  // arrive without measuring a hollow page again (facesStartedByProbe).
  const unloaded = unloadedFacesOf(document.fonts, families);
  const loads = Promise.allSettled(faces.map(([font, sample]) => document.fonts.load(font, sample)));
  markProbeStartedFaces(unloaded);
  await Promise.race([loads, new Promise((resolve) => setTimeout(resolve, FONT_LOAD_WAIT_MS))]);
  const read = () => faces.map(([font, sample]) => {
    context.font = font;
    const metrics = context.measureText(sample);
    return `${metrics.width.toFixed(2)}/${(metrics.fontBoundingBoxAscent ?? 0).toFixed(1)}/${(metrics.fontBoundingBoxDescent ?? 0).toFixed(1)}`;
  });
  const parts = fontsKeySettles() ? await settledReading(read) : read();
  const still = unloaded.filter((face) => face.status === "unloaded");
  // A face the wait gave up on is asked for by the measuring itself.
  markProbeStartedFaces(still);
  traceLayoutSnapshot(`fonts ${faces.map(([font], index) => `${font.slice(0, 40)}=${parts[index]}`).join(" ; ").slice(0, 1600)}`);
  let a = 0x811c9dc5, b = 0x9e3779b9;
  const text = `${families.join("|")}#${parts.join(",")}`;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** How long a differing reading waits for faces yet to be declared (the page's
 * own fonts come after it opens) before it stands. */
const FONT_DECLARATION_WAIT_MS = 3000;

/** Whether a row's fonts read here as they read when it was laid out. */
export async function rowFontsHold(row: LayoutSnapshotRow, content: JSONContent): Promise<boolean> {
  const families = fontFamiliesOf(content);
  const started = performance.now();
  for (;;) {
    const faces = typeof document !== "undefined" ? document.fonts?.size ?? 0 : 0;
    const key = await fontsKeyFor(families);
    if (key !== null && key === row.fontsKey) return true;
    if (performance.now() - started >= FONT_DECLARATION_WAIT_MS) {
      traceLayoutSnapshot(`part ${row.part}: fonts ${key} != ${row.fontsKey}`);
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Only a new face can answer otherwise.
    for (let waited = 0; waited < 15 && (document.fonts?.size ?? 0) === faces && performance.now() - started < FONT_DECLARATION_WAIT_MS; waited += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

/* ---- A kept layout the page refuted ---------------------------------------- */

const refutedPages = new Set<string>();

/** This page's kept layout was read otherwise here: no more of it is used on
 * this opening, and what this reader settles on replaces it. */
export function refuteKeptLayout(pageId: string, doc: PmNode): void {
  refutedPages.add(pageId);
  capturedParts.delete(pageId);
  segmentedCaptures.delete(pageId);
  forgetSeededMeasures(doc);
  traceLayoutSnapshot("kept layout refuted by the page");
}

/* ---- Restored parts: their measurements ---------------------------------- */

/** Give a part's restored pages (in order, a page's own blocks only) the
 * row's measurements. Whether they matched the row's shape. */
export function seedPartMeasures(pages: readonly (readonly PmNode[])[], row: LayoutSnapshotRow): boolean {
  const off = pages.length === row.measures.length ? pages.findIndex((page, index) => page.length !== row.measures[index]!.length) : 0;
  if (off >= 0) {
    traceLayoutSnapshot(`part ${row.part}: ${pages.length} sheets for a row of ${row.measures.length}, sheet ${off}: ${pages[off]?.length} blocks for ${row.measures[off]?.length}`);
    return false;
  }
  pages.forEach((page, index) => page.forEach((node, inner) => seedBlockMeasure(node, row.measures[index]![inner])));
  seedPartLines(pages, row);
  return true;
}

/** The engine's line corrections the row's pages drew (engineLinesKept), for
 * the line pass to take back: all of them or none. */
function seedPartLines(pages: readonly (readonly PmNode[])[], row: LayoutSnapshotRow): void {
  seedPartAutoLines(pages, row);
  const lines = row.lines;
  if (!lines || !engineLinesKeptOn()) return;
  if (lines.length !== pages.length || pages.some((page, index) => page.length !== lines[index]!.length)) {
    traceLayoutSnapshot(`part ${row.part}: its lines do not fit its sheets`);
    return;
  }
  const fitted = pages.every((page, index) => page.every((node, inner) => seedBlockLines(node, lines[index]![inner])));
  if (!fitted) {
    pages.forEach((page) => page.forEach((node) => forgetSeededBlockLines(node)));
    traceLayoutSnapshot(`part ${row.part}: its lines do not fit its blocks`);
  }
}

/** Auto line spacing's boxes the row's pages drew (engineLinesKept). */
function seedPartAutoLines(pages: readonly (readonly PmNode[])[], row: LayoutSnapshotRow): void {
  const lines = row.autoLines;
  if (!lines || !autoLinesKeptOn()) return;
  if (lines.length !== pages.length || pages.some((page, index) => page.length !== lines[index]!.length)) {
    traceLayoutSnapshot(`part ${row.part}: its line boxes do not fit its sheets`);
    return;
  }
  const fitted = pages.every((page, index) => page.every((node, inner) => seedBlockAutoLines(node, lines[index]![inner])));
  if (!fitted) {
    pages.forEach((page) => page.forEach((node) => forgetSeededBlockLines(node)));
    traceLayoutSnapshot(`part ${row.part}: its line boxes do not fit its blocks`);
  }
}

/** Each block's line boxes as a row keeps them. */
function capturedAutoLines(pages: readonly (readonly PmNode[])[]): AutoLinesOut | undefined {
  if (!autoLinesKeptOn()) return undefined;
  const lines = pages.map((page) => page.map((node) => encodedBlockAutoLines(node)));
  return lines.some((page) => page.some((block) => block !== null)) ? lines : undefined;
}

type AutoLinesOut = (Array<Array<[string, KeptAutoLineItem[]] | null> | null>)[];

/** Each block's lines as a row keeps them (null: no block noted, no lines). */
function capturedLines(pages: readonly (readonly PmNode[])[]): ((number[] | null)[])[] | undefined {
  if (!engineLinesKeptOn()) return undefined;
  const lines = pages.map((page) => page.map((node) => encodedBlockLines(node)));
  return lines.some((page) => page.some((block) => block !== null)) ? lines : undefined;
}

/** The nodes of the doc's sheets from `fromSheet` on, by sheet. */
export function sheetNodes(doc: PmNode, fromSheet = 0): PmNode[][] {
  const out: PmNode[][] = [];
  doc.forEach((page, _offset, index) => {
    if (index < fromSheet) return;
    const nodes: PmNode[] = [];
    page.forEach((child) => nodes.push(child));
    out.push(nodes);
  });
  return out;
}

export function forgetSeededMeasures(doc: PmNode): void {
  doc.forEach((page) => page.forEach((child) => {
    forgetBlockMeasure(child);
    forgetSeededBlockLines(child);
  }));
}

/* ---- What the room or the store opened (a row names that form) ----------- */

const openedParts = new Map<string, Map<number, { readonly hash: string; blocks: number; runtime?: string; content: JSONContent; audit?: string }>>();

function auditing(): boolean {
  return typeof window !== "undefined" && Boolean((window as Window & { __docsLayoutSnapshotAudit?: boolean }).__docsLayoutSnapshotAudit);
}

/** (Audit) a block's JSON as its content hash reads it, for a diff. */
function auditNorm(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(auditNorm);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (key === "block_id" || key === "anchor_id" || entry === null || entry === undefined || entry === false || entry === "" || (Array.isArray(entry) && entry.length === 0)) continue;
    out[key] = auditNorm(entry);
  }
  return out;
}

/** (Audit) the first place two JSON values differ. */
function auditFirstDiff(a: unknown, b: unknown, path = ""): string | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return `${path}: ${JSON.stringify(a)?.slice(0, 120)} -> ${JSON.stringify(b)?.slice(0, 120)}`;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const found = auditFirstDiff((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
    if (found) return found;
  }
  return `${path}: ?`;
}

/** (Audit) where a captured segment's blocks read otherwise than the room handed them over. */
function auditSegmentAgainstRoom(part: number, index: number, firstBlock: number, room: readonly JSONContent[] | undefined, here: readonly JSONContent[]): void {
  if (!room) return;
  const hash = (block: unknown) => withProjectionJsonMemo(() => layoutContentHash({ type: "doc", content: [block] as never }));
  const differ = here.flatMap((block, at) => (room[at] && hash(block) === hash(room[at]) ? [] : [at]));
  if (differ.length) traceLayoutSnapshot(`part ${part} segment ${index}: ${differ.length} of ${here.length} blocks read otherwise than the room's${differ.slice(0, 3).map((at) => ` | #${firstBlock + at} ${auditFirstDiff(auditNorm(room[at]), auditNorm(here[at]))}`).join("")}`);
}

/** (Audit) each block's content hash in short. */
function blockHashesForAudit(blocks: readonly unknown[]): string {
  return blocks.map((block) => withProjectionJsonMemo(() => layoutContentHash({ type: "doc", content: [block] as never })).slice(4, 10)).join(",");
}

/** (Audit) a part's form in short: its settings key by key, and its first blocks. */
function describeForAudit(root: JSONContent): string {
  const short = (value: unknown) => layoutContentHash({ type: "doc", content: [{ type: "paragraph", attrs: { v: JSON.stringify(value) ?? "u" } }] as never }).slice(4, 12);
  const attrs = (root.attrs ?? {}) as Record<string, unknown>;
  const keys = Object.keys(attrs).sort().map((key) => `${key}=${short(attrs[key])}`).join(",");
  const blocks = root.content ?? [];
  const head = withProjectionJsonMemo(() => layoutContentHash({ type: "doc", content: blocks.slice(0, 8) as never }));
  return `${blocks.length} blocks, head ${head}, attrs ${keys}`;
}

/** (Harness: `window.__docsLayoutSnapshotAudit = true`) the first place an
 * opened part's content no longer reads as it opened. */
function auditOpenedPart(pageId: string, part: number): void {
  const opened = openedParts.get(pageId)?.get(part);
  if (!opened?.audit) return;
  const then = JSON.parse(opened.audit) as JSONContent;
  const now = opened.content;
  const first = (a: unknown, b: unknown, path: string): string | null => {
    if (a === b) return null;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return `${path}: ${JSON.stringify(a)?.slice(0, 80)} -> ${JSON.stringify(b)?.slice(0, 80)}`;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const found = first((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
      if (found) return found;
    }
    return null;
  };
  traceLayoutSnapshot(`audit part ${part}: ${first(then, now, "") ?? "as opened"}`);
}

function rememberOpenedPart(pageId: string, part: number, hash: string | (() => string), blocks: number, content: JSONContent): void {
  let parts = openedParts.get(pageId);
  if (!parts) openedParts.set(pageId, (parts = new Map()));
  const audit = typeof window !== "undefined" && (window as Window & { __docsLayoutSnapshotAudit?: boolean }).__docsLayoutSnapshotAudit
    ? JSON.stringify(content) : undefined;
  parts.set(part, {
    audit,
    get hash() {
      return typeof hash === "string" ? hash : hash();
    },
    blocks,
    content,
  });
}

/**
 * The form a page's room handed each part in as the page opened (the room's
 * binding asks first, before the stored form's hydration): the form the next
 * opening through the room asks in. Kept apart from the opened parts, which
 * the hydration starts over.
 */
const roomForms = new Map<string, Map<number, JSONContent>>();

/**
 * The room's form of the blocks a capture laid out (`flat`, from `firstBlock`
 * of the part on), while nothing was edited since the room handed the part
 * over and its blocks stand one for one; else null (the caller names its own).
 * A whole part (`segment` false) is named so only when the room handed exactly
 * these blocks. `window.__docsSnapshotWholeAsOpened = true` names a whole part
 * as it was last opened, by the room or the stored form (old, A/B).
 */
function roomFormNaming(pageId: string, part: number, editSeq: number, firstBlock: number, flat: JSONContent, segment = false): JSONContent | null {
  if (editSeq !== 0) return null;
  if (!segment && (globalThis as { __docsSnapshotWholeAsOpened?: boolean }).__docsSnapshotWholeAsOpened === true) return null;
  const room = roomForms.get(pageId)?.get(part);
  const blocks = flat.content ?? [];
  if (!room?.content || (!segment && room.content.length !== blocks.length)) return null;
  const slice = room.content.slice(firstBlock, firstBlock + blocks.length);
  if (slice.length !== blocks.length || !slice.every((block, at) => block.type === blocks[at]!.type)) return null;
  return partDocument(room.attrs, slice);
}

function rememberRoomForm(pageId: string, part: number, root: JSONContent): void {
  let parts = roomForms.get(pageId);
  if (!parts) roomForms.set(pageId, (parts = new Map()));
  parts.set(part, root);
}

/** A new opening of the page starts over. */
export function forgetOpenedParts(pageId: string): void {
  openedParts.delete(pageId);
  capturedParts.delete(pageId);
  refutedPages.delete(pageId);
  segmentedCaptures.delete(pageId);
}

/* ---- Capture ------------------------------------------------------------- */

/** One part's sheets, each with its own blocks only. */
interface PartLayoutPages {
  readonly part: number;
  readonly pages: PmNode[][];
  /** Its first blocks stand on the sheet of the part before. */
  readonly continues: boolean;
}

/**
 * The document's sheets by part (lib/document-page-parts' split, here over a
 * block's pieces): a block starts the part that owns it, once that is a later
 * part than the current one; everything else stands where it sits.
 */
export function pagesByPart(doc: PmNode, owner: ReadonlyMap<string, number> | null): PartLayoutPages[] {
  const parts = new Map<number, { pages: PmNode[][]; continues: boolean }>();
  let current = 0;
  doc.forEach((page) => {
    const onThisSheet = new Map<number, PmNode[]>();
    let first = true;
    page.forEach((child) => {
      const root = splitPieceRoot(child.attrs as Record<string, unknown>);
      const known = owner && root ? owner.get(root) : undefined;
      if (known !== undefined && known > current) {
        // A part that starts here, after a block of the part before, on this sheet.
        if (!first) {
          const entry = parts.get(known) ?? { pages: [], continues: false };
          entry.continues = true;
          parts.set(known, entry);
        }
        current = known;
      }
      first = false;
      const list = onThisSheet.get(current);
      if (list) list.push(child);
      else onThisSheet.set(current, [child]);
    });
    for (const [part, nodes] of onThisSheet) {
      const entry = parts.get(part) ?? { pages: [], continues: false };
      entry.pages.push(nodes);
      parts.set(part, entry);
    }
  });
  return [...parts.entries()].sort((a, b) => a[0] - b[0]).map(([part, entry]) => ({ part, pages: entry.pages, continues: entry.continues }));
}

/** By page, by part: the blocks last captured or restored, node by node: a
 * part none of whose nodes moved is what the row already says. */
const capturedParts = new Map<string, Map<number, readonly (readonly PmNode[])[]>>();

function samePages(a: readonly (readonly PmNode[])[], b: readonly (readonly PmNode[])[]): boolean {
  return a.length === b.length && a.every((page, index) => page.length === b[index]!.length && page.every((node, inner) => node === b[index]![inner]));
}

/** This part's pages are what its row says (just restored from it). */
export function noteRestoredPart(pageId: string, part: number, pages: readonly (readonly PmNode[])[]): void {
  let parts = capturedParts.get(pageId);
  if (!parts) capturedParts.set(pageId, (parts = new Map()));
  parts.set(part, pages);
}

export interface CapturedPart extends LayoutSnapshotPartOut {
  readonly families: readonly string[];
  /** The last (or only) row of its part: the part is kept. */
  readonly done?: boolean;
}

/**
 * The parts whose layout changed since last kept, each as a row, one part per
 * call (`budget`: a capture is a long task on a long part). A part with a block
 * nothing exact was read of (planned from a guess) is not a layout to keep.
 */
export function captureChangedPart(
  pageId: string,
  doc: PmNode,
  owner: ReadonlyMap<string, number> | null,
  skip: ReadonlySet<number>,
  /** Edits made (by anyone) since the page opened. */
  editSeq = 0,
  /** A print: every page was drawn; a block without a kept reading (read
   * once, by a pass that had no reason to read it again) stands all the same. */
  drawn = false,
): { part: CapturedPart | null; left: boolean; passed?: number } {
  const parts = pagesByPart(doc, owner);
  const known = capturedParts.get(pageId) ?? new Map<number, readonly (readonly PmNode[])[]>();
  capturedParts.set(pageId, known);
  const attrs = doc.attrs as Record<string, unknown>;
  const waiting = parts.filter((entry) => !skip.has(entry.part) && !samePages(known.get(entry.part) ?? [], entry.pages));
  const next = waiting[0];
  if (!next) return { part: null, left: false };
  const left = waiting.length > 1;
  const measures = next.pages.map((page) => page.map((node) => encodedBlockMeasure(node)));
  // Only for a server that keeps them (an older one refuses the whole part).
  const lines = layoutRowExtraAccepted(pageId, "lines") ? capturedLines(next.pages) : undefined;
  const autoLines = layoutRowExtraAccepted(pageId, "autoLines") ? capturedAutoLines(next.pages) : undefined;
  const inexact = drawn ? 0 : next.pages.reduce((sum, page) => sum + page.filter((node, index) => measures[next.pages.indexOf(page)]![index] === null || !blockVerified(node)).length, 0);
  if (inexact) {
    traceLayoutSnapshot(`part ${next.part}: ${inexact} blocks not read exactly`);
    return { part: null, left, passed: next.part };
  }
  const json: JSONContent = {
    type: "doc",
    attrs,
    content: next.pages.map((page) => ({ type: "pageBlock", content: page.map((node) => node.toJSON() as JSONContent) })),
  };
  // A recipe past what a receipt may hold is refused only once it is built, and
  // building one is a long task (R286-D01: 4.4 MB, 5-8 s, then refused): a part
  // that cannot fit is let go before it is built.
  const estimated = estimatedRecipeBytes(json);
  if (estimated > recipeBudget) {
    return captureSegment(pageId, next, json, measures, known, left, editSeq, lines, autoLines);
  }
  return withProjectionJsonMemo(() => {
    const recipe = capturePaginationProjectionRecipe(json, next.pages.map(() => NO_PAGE_GEOMETRY), (reason) => traceLayoutSnapshot(`part ${next.part}: capture refused ${reason}`));
    known.set(next.part, next.pages);
    if (!recipe) return { part: null, left, passed: next.part };
    const flat = canonicalProjectionDocument(json);
    const hash = layoutContentHash(flat);
    const opened = openedParts.get(pageId)?.get(next.part);
    const blockCount = flat.content?.length ?? 0;
    // Named by the form it opened in (the next opening meets that form) while
    // it is what it opened as: before any edit, or reading as it read then.
    // An edit names its own content: a save stores the editor's form.
    if (opened && editSeq === 0) opened.runtime = hash;
    const asOpened = Boolean(opened && opened.blocks === blockCount && opened.runtime === hash);
    // A page opened through its room is named in the room's form, as a part
    // kept in segments is (captureSegment): the room's binding is what lays
    // the next opening out, and the stored form's hydration asks too, in
    // either order, so "as opened" was whichever asked last. R283-D03 (one
    // part of 44 sheets): a capture after hydration asked last named the
    // stored form, and the next opening's room found no row of its own
    // ("no row of 1 names it"); the one after a room that asked last restored.
    const roomNamed = roomFormNaming(pageId, next.part, editSeq, 0, flat);
    const named = roomNamed ?? (asOpened ? opened!.content : null);
    const contentHash = roomNamed ? layoutContentHash(roomNamed) : asOpened ? opened!.hash : hash;
    return {
      left,
      // The families read from the form the next opening reads them from: an
      // editor fills in defaults that name others.
      part: { part: next.part, contentHash, blockCount, continues: next.continues, pages: recipe.pages, measures, ...(lines ? { lines } : {}), ...(autoLines ? { autoLines } : {}), families: fontFamiliesOf(named ?? flat) },
    };
  });
}

/** What a captured part is sent to the server as. */
function rowOut(part: CapturedPart): LayoutSnapshotPartOut {
  return {
    part: part.part, contentHash: part.contentHash, blockCount: part.blockCount, continues: part.continues, pages: part.pages, measures: part.measures,
    ...(part.lines ? { lines: part.lines } : {}),
    ...(part.autoLines ? { autoLines: part.autoLines } : {}),
    ...(part.segments && part.segments > 1
      ? { segment: part.segment, segments: part.segments, firstBlock: part.firstBlock, captureId: part.captureId }
      : {}),
  };
}

/** A part being kept in segments, one segment a call (each is a long task). */
interface SegmentedCapture {
  readonly pages: readonly (readonly PmNode[])[];
  /** Each segment's sheets, [from, to). */
  readonly ranges: readonly (readonly [number, number])[];
  readonly captureId: string;
  readonly families: readonly string[];
  next: number;
  firstBlock: number;
}
const segmentedCaptures = new Map<string, Map<number, SegmentedCapture>>();
let captureSerial = 0;

/** Whether a sheet opens with a block of its own (no piece of one cut before it). */
function sheetOpensBlock(page: JSONContent): boolean {
  const first = page.content?.[0];
  if (!first) return false;
  const attrs = (first.attrs ?? {}) as Record<string, unknown>;
  for (const key in attrs) {
    if (PAGINATION_RUNTIME_ATTRIBUTES.has(key) && attrs[key] !== null && attrs[key] !== false && attrs[key] !== undefined) return false;
  }
  return true;
}

/**
 * The sheets of a part too large for one recipe, as segments each under the
 * budget, cut only at sheets that open a block (each segment is then a run of
 * the part's blocks, and puts back onto them alone). Null when a run between
 * two such sheets is too large by itself: the part is not kept.
 */
export function recipeSegments(document: JSONContent): Array<[number, number]> | null {
  const pages = document.content ?? [];
  const sizes = pages.map((page) => estimatedRecipeBytes({ type: "doc", content: [page] }));
  const segmentBudget = Math.min(recipeBudget, SEGMENT_BYTES_BUDGET);
  const ranges: Array<[number, number]> = [];
  let from = 0;
  let used = 0;
  let lastOpening = 0;
  for (let index = 0; index < pages.length; index += 1) {
    if (index > from && sheetOpensBlock(pages[index]!)) lastOpening = index;
    // A segment is cut near the segment budget (each is one long task); a run
    // of sheets with no block opening between them stays whole up to what one
    // recipe may hold.
    if (used + sizes[index]! > segmentBudget && index > from && lastOpening > from) {
      ranges.push([from, lastOpening]);
      used = 0;
      for (let back = lastOpening; back < index; back += 1) used += sizes[back]!;
      from = lastOpening;
    }
    used += sizes[index]!;
    if (used > recipeBudget) return null;
  }
  ranges.push([from, pages.length]);
  return ranges.length <= MAX_SEGMENTS ? ranges : null;
}

/**
 * A segmented capture whose fonts read otherwise than at its first segment
 * (a face arrived between two idle moments): its rows would never make a
 * whole part, so it starts over from the first segment under the new fonts.
 */
export function restartSegmentedCapture(pageId: string, part: number): void {
  segmentedCaptures.get(pageId)?.delete(part);
  capturedParts.get(pageId)?.delete(part);
}

function captureSegment(
  pageId: string,
  next: PartLayoutPages,
  json: JSONContent,
  measures: (readonly number[] | null)[][],
  known: Map<number, readonly (readonly PmNode[])[]>,
  left: boolean,
  editSeq: number,
  lines?: ((number[] | null)[])[],
  autoLines?: AutoLinesOut,
): { part: CapturedPart | null; left: boolean; passed?: number } {
  let byPart = segmentedCaptures.get(pageId);
  if (!byPart) segmentedCaptures.set(pageId, (byPart = new Map()));
  let state = byPart.get(next.part);
  const giveUp = (why: string) => {
    byPart!.delete(next.part);
    known.set(next.part, next.pages);
    traceLayoutSnapshot(`part ${next.part}: ${why}, not kept`);
    return { part: null, left, passed: next.part };
  };
  if (!state || !samePages(state.pages, next.pages)) {
    const ranges = recipeSegments(json);
    if (!ranges) return giveUp("a run of sheets too large for a recipe");
    if (auditing()) {
      auditOpenedPart(pageId, next.part);
      traceLayoutSnapshot(`naming part ${next.part} in the editor's form: ${describeForAudit(withProjectionJsonMemo(() => canonicalProjectionDocument(json)))}`);
    }
    state = {
      pages: next.pages,
      ranges,
      captureId: `${Date.now().toString(36)}-${(captureSerial += 1).toString(36)}`,
      families: fontFamiliesOf(json),
      next: 0,
      firstBlock: 0,
    };
    byPart.set(next.part, state);
    traceLayoutSnapshot(`part ${next.part}: kept in ${ranges.length} segments`);
  }
  const index = state.next;
  const [from, to] = state.ranges[index]!;
  const segmentJson: JSONContent = { type: "doc", attrs: json.attrs, content: (json.content ?? []).slice(from, to) };
  return withProjectionJsonMemo(() => {
    const recipe = capturePaginationProjectionRecipe(segmentJson, segmentJson.content!.map(() => NO_PAGE_GEOMETRY), (reason) => traceLayoutSnapshot(`part ${next.part} segment ${index}: capture refused ${reason}`));
    if (!recipe) return giveUp(`segment ${index} refused`);
    const flat = canonicalProjectionDocument(segmentJson);
    const blockCount = flat.content?.length ?? 0;
    const firstBlock = state!.firstBlock;
    // A segment is named in the form the next opening asks in: the room's,
    // as it handed the part over, while nothing was edited since (a stored
    // form names other defaults and mark orders, and the editor adds marks
    // once it opens: R286-D01's list run took a font size, a table cell bold,
    // and the next opening's room named neither). An edit names the editor's
    // own form, which a save hands the room. Restoring still holds the pages
    // to the content they are restored onto.
    const named = roomFormNaming(pageId, next.part, editSeq, firstBlock, flat, true) ?? flat;
    if (auditing()) {
      const room = editSeq === 0 ? roomForms.get(pageId)?.get(next.part) : undefined;
      auditSegmentAgainstRoom(next.part, index, firstBlock, room?.content?.slice(firstBlock, firstBlock + blockCount), flat.content ?? []);
      if (named === flat) traceLayoutSnapshot(`part ${next.part} segment ${index} named in the editor's form`);
    }
    const segments = state!.ranges.length;
    const done = index === segments - 1;
    state!.next += 1;
    state!.firstBlock += blockCount;
    if (done) {
      byPart!.delete(next.part);
      known.set(next.part, next.pages);
    }
    return {
      left: left || !done,
      part: {
        part: next.part, segment: index, segments, firstBlock, captureId: state!.captureId, done,
        contentHash: layoutContentHash(named), blockCount, continues: index === 0 ? next.continues : false,
        pages: recipe.pages, measures: measures.slice(from, to), ...(lines ? { lines: lines.slice(from, to) } : {}),
        ...(autoLines ? { autoLines: autoLines.slice(from, to) } : {}), families: state!.families,
      },
    };
  });
}

/**
 * A part's rows as whole parts: a part kept whole as it is, a part kept in
 * segments only with every segment of one capture, its sheets one after
 * another (each segment's paths shifted to the part's blocks). Each segment's
 * content is still checked by whoever restores it (segmentHashes), and the
 * restored part is held to the part's content whole.
 */
export function wholePartRows(rows: readonly LayoutSnapshotRow[]): LayoutSnapshotRow[] {
  const out: LayoutSnapshotRow[] = [];
  const groups = new Map<string, LayoutSnapshotRow[]>();
  for (const row of rows) {
    if (!row.segments || row.segments <= 1) {
      out.push(row);
      continue;
    }
    const key = `${row.part}|${row.layout}|${row.engine}|${row.fontsKey}|${row.captureId ?? ""}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  for (const group of groups.values()) {
    const count = group[0]!.segments!;
    const ordered: LayoutSnapshotRow[] = [];
    for (let index = 0; index < count; index += 1) {
      const found = group.find((row) => row.segment === index && row.segments === count);
      if (!found) break;
      ordered.push(found);
    }
    if (ordered.length !== count) continue;
    let at = 0;
    let contiguous = true;
    for (const row of ordered) {
      if ((row.firstBlock ?? -1) !== at) contiguous = false;
      at += row.blockCount;
    }
    if (!contiguous) continue;
    out.push({
      ...ordered[0]!,
      segment: undefined,
      segments: undefined,
      firstBlock: undefined,
      blockCount: at,
      continues: ordered[0]!.continues,
      pages: ordered.flatMap((row) => row.pages.map((page) => page.map((recipe) => shiftedRecipe(recipe, row.firstBlock ?? 0)))),
      measures: ordered.flatMap((row) => row.measures),
      // Lines only from a capture whose every segment kept them.
      lines: ordered.every((row) => row.lines && row.lines.length === row.measures.length) ? ordered.flatMap((row) => row.lines!) : undefined,
      autoLines: ordered.every((row) => row.autoLines && row.autoLines.length === row.measures.length) ? ordered.flatMap((row) => row.autoLines!) : undefined,
      segmentHashes: ordered.map((row) => [row.firstBlock ?? 0, row.blockCount, row.contentHash] as const),
    });
  }
  return out;
}

/** Whether a row (whole, or put together from segments) names these blocks. */
function rowNamesContent(row: LayoutSnapshotRow, attrs: unknown, blocks: readonly unknown[], wholeHash: () => string): boolean {
  if (!row.segmentHashes) return row.contentHash === wholeHash();
  if (row.blockCount !== blocks.length) return false;
  return row.segmentHashes.every(([first, count, hash]) =>
    layoutContentHash(partDocument(attrs, blocks.slice(first, first + count))) === hash);
}

/** What a recipe may come to before it is not built: the receipt holds 2 MiB
 * (paginationProjectionReceipt), and the estimate reads low (R286-D01: 2.6 MB
 * estimated for 4.4 MB built). */
const RECIPE_BYTES_BUDGET = 1.1 * 1024 * 1024;
/** What one segment comes to, estimated: building a recipe takes about 0.7 ms
 * a KB built (R286-D01: 1.9 MB in 1.3-1.6 s), and the estimate reads about 1.7
 * times low, so a segment is a task of about 80 ms. */
const SEGMENT_BYTES_BUDGET = 64 * 1024;
/** Segments sent in one write (each up to about 0.5 MB). */
const SEGMENTS_PER_WRITE = 4;
/** As many segments as the server keeps of one part. */
const MAX_SEGMENTS = 64;
let recipeBudget = RECIPE_BYTES_BUDGET;
/** Tests only: a smaller budget, so a small document is kept in segments. */
/** Tests: a part as an opening asked for it (its blocks, as snapshotReceiptFor remembers them). */
export function rememberOpenedPartForTests(pageId: string, part: number, blocks: readonly unknown[]): void {
  rememberOpenedPart(pageId, part, "test", blocks.length, partDocument(undefined, blocks));
}

export function setRecipeBudgetForTests(bytes: number | null): void {
  recipeBudget = bytes ?? RECIPE_BYTES_BUDGET;
}
/** About what one node of a recipe takes (R286-D01: 4.44 MB for 24,296). */
const RECIPE_NODE_BYTES = 185;

/**
 * About how large a recipe of these sheets would be: a block that stands whole
 * on its sheet is one reference; a piece of one (a cut paragraph, a table's
 * fragment, a list's continuation: a runtime attribute set) is written node by
 * node below it, at most all of them.
 */
export function estimatedRecipeBytes(document: JSONContent): number {
  let nodes = 0;
  const all = (node: JSONContent): number => 1 + (node.content ?? []).reduce((sum, child) => sum + all(child), 0);
  for (const page of document.content ?? []) {
    for (const block of page.content ?? []) {
      const attrs = (block.attrs ?? {}) as Record<string, unknown>;
      let piece = false;
      for (const key in attrs) {
        if (PAGINATION_RUNTIME_ATTRIBUTES.has(key) && attrs[key] !== null && attrs[key] !== false && attrs[key] !== undefined) {
          piece = true;
          break;
        }
      }
      nodes += piece ? all(block) : 1;
    }
  }
  return nodes * RECIPE_NODE_BYTES;
}

/**
 * Keep the layout the reader's pages have settled on, part by part, each on an
 * idle moment. Stops at once when the document moves on or starts settling:
 * the next settling keeps what it reaches.
 */
export async function keepLayoutSnapshots(view: EditorView, pageId: string, busy: () => boolean, editSeq: () => number): Promise<void> {
  const started = view.state.doc;
  if (layoutLooksFarTooLong(started, busy)) return;
  const owner = documentPartOwnersOf(pageId);
  const total = documentPartsCountOfOwners(owner);
  if (!openingAsksForRows(pageId, total)) {
    traceLayoutSnapshot("too short to be asked for: nothing kept");
    return;
  }
  const skip = new Set<number>();
  /** Each segmented part's capture and the fonts its first segment read. */
  const segmentFonts = new Map<number, { captureId: string; key: string }>();
  const segmentRestarts = new Map<number, number>();
  /** Each segmented part's rows so far, written when its last is captured. */
  const segmentRows = new Map<number, LayoutSnapshotPartOut[]>();
  const idle = () => new Promise<void>((resolve) => {
    const win = view.dom.ownerDocument.defaultView;
    if (win && typeof win.requestIdleCallback === "function") win.requestIdleCallback(() => resolve(), { timeout: 2000 });
    else setTimeout(resolve, 200);
  });
  for (;;) {
    if (view.isDestroyed || view.state.doc !== started || busy()) return;
    const t0 = performance.now();
    const { part, left, passed } = captureChangedPart(pageId, started, owner, skip, editSeq());
    if (passed !== undefined) skip.add(passed);
    traceLayoutSnapshot(`capture ${part ? `part ${part.part} ${part.pages.length} pages ${part.contentHash}` : "nothing"} ${Math.round(performance.now() - t0)} ms left=${left}`);
    if (part) {
      if (part.done !== false) skip.add(part.part);
      const key = await fontsKeyFor(part.families);
      if (key && part.segments && part.segments > 1) {
        const held = segmentFonts.get(part.part);
        if (part.segment === 0) segmentFonts.set(part.part, { captureId: part.captureId!, key });
        else if (!held || held.captureId !== part.captureId || held.key !== key) {
          traceLayoutSnapshot(`part ${part.part} segment ${part.segment}: fonts ${key} != ${held?.key ?? "none"}, kept again`);
          segmentFonts.delete(part.part);
          restartSegmentedCapture(pageId, part.part);
          // Twice at most: fonts still turning over are not a layout to keep.
          const restarts = (segmentRestarts.get(part.part) ?? 0) + 1;
          segmentRestarts.set(part.part, restarts);
          if (restarts > 2) return;
          skip.delete(part.part);
          if (!view.isDestroyed && view.state.doc === started && !busy()) {
            await idle();
            continue;
          }
          return;
        }
      }
      if (key && !view.isDestroyed && view.state.doc === started) {
        if (part.segments && part.segments > 1) {
          // A part's segments go to the server once all are captured: a
          // capture cut short (the document moved on) leaves the rows kept
          // before it whole, not overwritten in part.
          const rows = segmentRows.get(part.part) ?? [];
          if (part.segment === 0) rows.length = 0;
          rows.push(rowOut(part));
          segmentRows.set(part.part, rows);
          if (part.done) {
            segmentRows.delete(part.part);
            let stored = true;
            for (let from = 0; from < rows.length && stored; from += SEGMENTS_PER_WRITE) {
              stored = await storeLayoutSnapshots(pageId, key, rows.slice(from, from + SEGMENTS_PER_WRITE), total);
            }
            traceLayoutSnapshot(`stored part ${part.part} in ${rows.length} segments ${stored} fonts=${key}`);
          }
        } else {
          const stored = await storeLayoutSnapshots(pageId, key, [rowOut(part)], total);
          traceLayoutSnapshot(`stored part ${part.part} ${stored} fonts=${key}`);
        }
      }
    }
    if (!left) return;
    await idle();
  }
}

/**
 * Far more sheets than the content can fill reads as a layout made under other
 * conditions (the book once settled on 583 sheets for 316, every block lines too
 * tall): not one to hand to the next reader. Asked of the document as a whole: a
 * part with a long table of contents runs well past the estimate by itself.
 */
function layoutLooksFarTooLong(doc: PmNode, busy: () => boolean): boolean {
  if (busy() || doc.childCount < 40) return false;
  const blocks: unknown[] = [];
  doc.forEach((page) => page.forEach((child) => blocks.push(child.toJSON())));
  const estimated = provisionalPageSizesForJson(blocks, doc.attrs as Record<string, unknown>)?.length;
  if (!estimated || doc.childCount <= estimated * 1.5) return false;
  traceLayoutSnapshot(`${doc.childCount} sheets for about ${estimated}: not kept`);
  return true;
}

function documentPartsCountOfOwners(owner: ReadonlyMap<string, number> | null): number {
  if (!owner) return 1;
  let most = 0;
  for (const part of owner.values()) most = Math.max(most, part);
  return most + 1;
}
