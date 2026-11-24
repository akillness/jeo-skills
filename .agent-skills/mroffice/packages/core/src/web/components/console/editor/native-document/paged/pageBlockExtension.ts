/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Structural pages (architecture v3, docs/paged-editing-surface-plan.md).
 *
 * A pageBlock is a REAL top-level container node rendered as one paper
 * sheet (`<article data-page-sheet>`): the gap between pages is the space
 * between sibling boxes, so it is structurally incapable of vanishing or
 * drifting while content reflows — the user's "绝对定律" requirement.
 * Pagination stops being a painted projection of an async measurement and
 * becomes document structure.
 *
 * Purity contract: pageBlocks exist ONLY inside the live editor. Storage,
 * export, AI edit contexts and every other consumer of content_json stay
 * FLAT — hydration wraps (wrapBlocksIntoPages), every serialization
 * boundary unwraps (flattenPageBlocks). Round-trip is loss-free by
 * construction: a pageBlock carries no attrs, only grouping.
 */

import type { JSONContent } from "@tiptap/core";
import { noteRestoredHydration } from "./restoredLayoutMark";
import { isChartNode } from "../documentObjectNodes";
import { mergeAttributes, Node } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { liftTarget } from "@tiptap/pm/transform";

import { isAnyImeCompositionActive } from "../imeCompositionGuard";
import { restorePaginationProjection } from "./paginationProjectionReceipt";
import { keptLayoutInput } from "./projectionJsonMemo";
import { planPageEndDelete, planPageStartBackspace } from "./pageBoundaryBackspace";
import { trailingBreakOf } from "./containerSplitting";
import { provisionalPageSizesForJson } from "./provisionalPages";
import type { Decoration } from "@tiptap/pm/view";
import { createPageSheetView } from "./pageSheetView";
import { hollowSheetsEnabled, pageHollowSheetsPlugin } from "./pageHollowSheets";
import {
  PAGE_BLOCK_NODE,
  PAGE_REGION_RECEIPT,
} from "./paginationProjectionKeys";

export { PAGE_BLOCK_NODE } from "./paginationProjectionKeys";
export { trailingBreakOf } from "./containerSplitting";

/** Authored Word boundaries preserve the next sheet's paragraph spacing.
 * Continuous sections stay in the current flow; odd/even parity fillers are
 * handled by the physical page-span projection, never editable blank pages. */
export function isForcedBreakBlock(node: PmNode): boolean {
  if (node.type.name === "sectionBreak") return node.attrs.breakType !== "continuous";
  return trailingBreakOf(node) === "pageBreak";
}

/**
 * Word starts a continuous section on a new page all the same when the
 * section's paper differs from the one before it (another size or
 * orientation): the page cannot change shape mid-way (b-sect.docx, S6
 * continuous but portrait after a landscape S5: Word 7 pages, MRAI 6).
 * The k-th section break of the document ends section k; the layouts are
 * the document's `sectionLayouts`, one per section.
 */
export function continuousBreaksStartingPage(doc: PmNode): Set<PmNode> {
  const out = new Set<PmNode>();
  const layouts = doc.attrs.sectionLayouts;
  if (!Array.isArray(layouts)) return out;
  const paper = (index: number): string | null => {
    const layout = layouts[index] as { pageSize?: Record<string, unknown> } | null | undefined;
    const size = layout?.pageSize;
    if (!size || typeof size !== "object") return null;
    return `${String(size.widthTwips)}x${String(size.heightTwips)}:${String(size.orientation)}`;
  };
  let ordinal = 0;
  doc.descendants((node) => {
    if (node.type.name !== "sectionBreak") return true;
    if (node.attrs.breakType === "continuous") {
      const before = paper(ordinal), after = paper(ordinal + 1);
      if (before !== null && after !== null && before !== after) out.add(node);
    }
    ordinal += 1;
    return false;
  });
  return out;
}

/** `isForcedBreakBlock`, with a continuous break onto other paper counted. */
export function isForcedBreakBlockIn(doc: PmNode, node: PmNode, pageStarters = continuousBreaksStartingPage(doc)): boolean {
  return isForcedBreakBlock(node) || pageStarters.has(node);
}

type JsonNode = Record<string, unknown> & {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
};

const MAX_STORED_PAGE_BLOCKS = 5_000;
const PAGE_BLOCK_LAYOUT_KEY_VERSION = "pbl2";
// pbl14l additionally records grapheme-safe independent font-slot routing.
// pbl13l records deterministic Word CJK cell/spacing geometry plus
// cross-engine quantization of every text row to the authored line pitch.
// pbl12l distributions predated the WebKit multi-line height correction.
const LIVE_LINE_GRID_LAYOUT_KEY_VERSION = "pbl14l";
const PAGE_BLOCK_LAYOUT_METADATA_KEYS = new Set([
  PAGE_REGION_RECEIPT,
  "pageBlockSizes",
  "pageBlockLayoutKey",
  "block_id",
]);

class InvalidPageBlockLayoutInput extends Error {}

const UTF8 = new TextEncoder();

function utf8Bytes(value: string): Uint8Array {
  return UTF8.encode(value);
}

// The layout key runs on every save serialization, sorting every object's
// keys: encoding both strings on every comparison (a new encoder each time)
// was most of its cost. The results are unchanged.
const NON_ASCII = /[^\u0000-\u007f]/;

/** UTF-8 byte length without encoding. */
function utf8Length(value: string): number {
  if (!NON_ASCII.test(value)) return value.length;
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) length += 1;
    else if (code < 0x800) length += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length &&
      (value.charCodeAt(index + 1) & 0xfc00) === 0xdc00) {
      length += 4;
      index += 1;
    } else length += 3;
  }
  return length;
}

/** UTF-8 byte order; for ASCII that is the UTF-16 code unit order. */
function compareUtf8(left: string, right: string): number {
  if (!NON_ASCII.test(left) && !NON_ASCII.test(right)) {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  const a = utf8Bytes(left);
  const b = utf8Bytes(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function canonicalLayoutInput(
  value: unknown,
  ancestors: WeakSet<object>,
  chartState?: { present: boolean },
  contentNode = false,
): string {
  if (value === null || value === undefined) return "n;";
  if (typeof value === "boolean") return value ? "b1;" : "b0;";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new InvalidPageBlockLayoutInput();
    if (Number.isInteger(value)) {
      if (!Number.isSafeInteger(value)) {
        throw new InvalidPageBlockLayoutInput();
      }
      return `d${Object.is(value, -0) ? 0 : value};`;
    }
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, false);
    return `f${Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")};`;
  }
  if (typeof value === "string") {
    return `s${utf8Length(value)}:${value};`;
  }
  if (typeof value !== "object") throw new InvalidPageBlockLayoutInput();
  // An attribute record the editor holds unchanged keeps its text from one
  // save to the next (projectionJsonMemo); a failed read keeps nothing.
  return keptLayoutInput(value, contentNode, (state) =>
    layoutInputOfObject(value, ancestors, state, contentNode), chartState,
  );
}

function layoutInputOfObject(
  value: object,
  ancestors: WeakSet<object>,
  chartState: { present: boolean } | undefined,
  contentNode: boolean,
): string {
  if (ancestors.has(value)) throw new InvalidPageBlockLayoutInput();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `a${value.length}[${value
        .map((item) => canonicalLayoutInput(item, ancestors, chartState, contentNode && !Array.isArray(item)))
        .join("")}]`;
    }
    const record = value as Record<string, unknown>;
    if (contentNode && isChartNode(record.type as string | undefined) && chartState) chartState.present = true;
    const keys = Object.keys(record)
      // JSON transport omits undefined object fields (e.g. optional font
      // face/charset attrs). Hash the same object the server and reopen see.
      // Explicit nulls remain significant, and undefined array slots stay null.
      .filter((key) => record[key] !== undefined && !PAGE_BLOCK_LAYOUT_METADATA_KEYS.has(key) && !(
        contentNode && key === "attrs" && record[key] !== null &&
        typeof record[key] === "object" && !Array.isArray(record[key]) &&
        Object.keys(record[key] as Record<string, unknown>).every(attr =>
          (record[key] as Record<string, unknown>)[attr] === undefined || PAGE_BLOCK_LAYOUT_METADATA_KEYS.has(attr),
        )
      ))
      .sort(compareUtf8);
    return `o${keys.length}{${keys
      .map(
        (key) =>
          canonicalLayoutInput(key, ancestors) +
          canonicalLayoutInput(record[key], ancestors, chartState, contentNode && key === "content" && Array.isArray(record[key])),
      )
      .join("")}}`;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Compute and keep the layout-key text of one block as pageBlockLayoutKey
 * reads it (a content node of the flat document), ahead of the save that
 * needs it (saveTextWarmup). The text kept is the one the key computes
 * itself; the key is unchanged. Only inside withProjectionJsonMemo is
 * anything kept; a block the key cannot read keeps nothing.
 */
export function warmPageBlockLayoutInput(block: unknown): void {
  try {
    canonicalLayoutInput(block, new WeakSet<object>(), { present: false }, true);
  } catch {
    // The save reads it the long way, and fails it the same way.
  }
}

/**
 * Bind a saved physical-page distribution to the exact flat document that
 * produced it. The fingerprint deliberately includes normalized page attrs,
 * block semantics and typography, while excluding only pagination metadata.
 * It is request-local and deterministic across the browser and API.
 */
export function pageBlockLayoutKey(doc: unknown): string | null {
  const root = doc as JsonNode | null;
  const linePitch = Number(root?.attrs?.docGridLinePitch);
  const version =
    root?.attrs?.manuscriptGrid === "lines" &&
    Number.isFinite(linePitch) &&
    linePitch > 0
      ? LIVE_LINE_GRID_LAYOUT_KEY_VERSION
      : PAGE_BLOCK_LAYOUT_KEY_VERSION;
  let canonical: string;
  const chartState = {present:false};
  try {
    canonical = canonicalLayoutInput(doc, new WeakSet<object>(),chartState,root?.type==="doc");
    if (chartState.present) canonical += "docs-chart-host:1;";
  } catch {
    return null;
  }
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  const bytes = utf8Bytes(canonical);
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    first = Math.imul(first ^ byte, 0x01000193) >>> 0;
    second = Math.imul(second ^ byte, 0x85ebca6b) >>> 0;
    second = (second ^ (second >>> 13)) >>> 0;
  }
  return `${version}:${first
    .toString(16)
    .padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

export const PageBlock = Node.create({
  name: PAGE_BLOCK_NODE,

  // Deliberately NO group: the node is referenced by NAME in the doc's
  // content expression ("pageBlock+"), and having no group keeps
  // it out of every "block+" slot - a page can never nest inside a page,
  // a table cell, or a list item.
  content: "block+",
  defining: true,
  // NOT isolating: selection, Backspace at page start and cross-page
  // drags must flow between sheets exactly like Word.
  isolating: false,
  selectable: false,
  draggable: false,

  // L3 stage 2 (docs-hollow with docs-layout): the sheet drawn whole or, far
  // from the reader on a page the ledger trusts, as its paper alone.
  addNodeView() {
    if (!hollowSheetsEnabled()) return null;
    return ({ node, decorations }) => createPageSheetView(node, decorations as readonly Decoration[]);
  },

  addProseMirrorPlugins() {
    return hollowSheetsEnabled() ? [pageHollowSheetsPlugin()] : [];
  },

  addKeyboardShortcuts() {
    return {
      // The base Enter chain runs liftEmptyBlock BEFORE splitBlock, and
      // pageBlock is deliberately not isolating — so Enter in an empty
      // paragraph that sits directly on the page lifted it OUT of the
      // sheet to the doc top level (caret visually jumped below the last
      // sheet, or onto the next one once the rebalancer adopted the
      // stray). Word semantics: Enter at the page tail is a new line ON
      // the sheet. Only the exact escape case is intercepted — nested
      // structures (lists, quotes) keep their own lift behavior, which
      // stops at the page boundary.
      Enter: ({ editor }) => {
        // Safari can route its synthetic candidate-commit Enter through the
        // keymap on an otherwise empty page. The transaction guard rejects
        // splitBlock later, but the command has already reported "handled";
        // prosemirror-keymap then preventDefaults the native IME event and
        // WebKit commits the raw pinyin before the selected Hanzi. Refuse the
        // command before it can consume the event.
        if (isAnyImeCompositionActive()) return false;
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;
        const block = $from.parent;
        if (!block.isTextblock || block.content.size !== 0) return false;
        if ($from.depth < 2) return false;
        if ($from.node($from.depth - 1).type.name !== PAGE_BLOCK_NODE) {
          return false;
        }
        return editor.commands.splitBlock();
      },
      // joinBackward's doc-start fallback LIFTS the caret block out of its
      // wrapper when no cut point exists before it (prosemirror-commands:
      // `if (!$cut) { ...tr.lift(range, target) }`). pageBlock is
      // deliberately not isolating, so Backspace on the FIRST line of the
      // FIRST sheet ejected the paragraph to the doc top level — and a
      // single-paragraph page lost its wrapper entirely, degrading the
      // whole surface to the continuous fallback (the reported "第一页最前
      // 一行点击删除" destruction). Word semantics: Backspace at the very
      // start of the document is a no-op. Only the page-ESCAPING lift is
      // swallowed — Backspace at a LATER page's start still joins sheets
      // (there is a cut point), and a lift that resolves INSIDE the sheet
      // (outdenting the document's first list item) keeps its default.
      Backspace: ({ editor }) => {
        // The candidate editor may synthesize Backspace while replacing its
        // marked text. Like Enter, it must remain native until composition is
        // settled instead of being claimed by the page-boundary keymap.
        if (isAnyImeCompositionActive()) return false;
        // Backspace at the top of a LATER page deletes what precedes the
        // caret in the text, as in Word (see pageBoundaryBackspace.ts):
        // joinBackward alone only joined the two page wrappers, which the
        // paginator split again on the next frame, so the key did nothing.
        if (editor.isEditable) {
          const plan = planPageStartBackspace(editor.state);
          if (plan.kind === "handled") {
            editor.view.dispatch(plan.tr);
            return true;
          }
          if (plan.kind === "merged") {
            // The boundary is gone; the ordinary Backspace chain (lists,
            // object boundaries, joinBackward) now runs on this state.
            editor.view.dispatch(plan.tr);
            return false;
          }
        }
        const { selection } = editor.state;
        if (!(selection instanceof TextSelection) || !selection.empty) {
          return false;
        }
        const $from = selection.$from;
        if ($from.parentOffset > 0 || !$from.parent.isTextblock) return false;
        // Any ancestor index > 0 means joinBackward finds a cut point and
        // JOINS (page-merge flow) instead of lifting — default handles it.
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.index(depth - 1) > 0) return false;
        }
        let pageDepth = 0;
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.node(depth).type.name === PAGE_BLOCK_NODE) {
            pageDepth = depth;
            break;
          }
        }
        // Caret not inside a sheet (legacy stray block): default behavior.
        if (pageDepth === 0) return false;
        const range = $from.blockRange();
        const target = range ? liftTarget(range) : null;
        // A lift that lands AT or BELOW the pageBlock stays inside the
        // sheet (e.g. the first list item outdenting) — keep the default.
        if (range && target != null && target >= pageDepth) return false;
        // The default would lift the block OUT of the sheet: consume.
        return true;
      },
      // The mirror at the END of a page: Delete removes what follows the
      // caret in the text (the next page's first paragraph joins this one,
      // or the next page's first character when the paragraph runs on).
      Delete: ({ editor }) => {
        if (isAnyImeCompositionActive() || !editor.isEditable) return false;
        const plan = planPageEndDelete(editor.state);
        if (plan.kind === "handled") {
          editor.view.dispatch(plan.tr);
          return true;
        }
        if (plan.kind === "merged") {
          editor.view.dispatch(plan.tr);
          return false;
        }
        return false;
      },
    };
  },


  parseHTML() {
    return [{ tag: "article[data-page-sheet]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "article",
      mergeAttributes(HTMLAttributes, {
        "data-page-sheet": "",
        class: "page-sheet",
      }),
      0,
    ];
  },
});

/** True when the document's top level carries structural pages. */
export function docHasPageBlocks(doc: unknown): boolean {
  const content = (doc as JsonNode | null)?.content;
  return (
    Array.isArray(content) &&
    content.some((child) => child?.type === PAGE_BLOCK_NODE)
  );
}

/**
 * Wrap a FLAT block list into pageBlocks. `blocksPerPage` distributes
 * counts per page in order (from a cached layout); the tail — and the
 * whole list when no distribution is known — lands on one final page for
 * the rebalancer to split after first paint. Empty input yields one empty
 * page with nothing inside — callers must guarantee at least one block
 * (the editor schema requires block+ inside a page).
 */
export function wrapBlocksIntoPages(
  blocks: JsonNode[],
  blocksPerPage?: number[],
): JsonNode[] {
  if (blocks.length === 0) {
    // A BLANK document is one empty page (Word semantics) - returning []
    // left fresh pages flat forever, so the on-page band strips, sheet
    // chrome and pagination never appeared until content was imported.
    return [{ type: PAGE_BLOCK_NODE, content: [{ type: "paragraph" }] }];
  }
  const pages: JsonNode[] = [];
  let cursor = 0;
  if (Array.isArray(blocksPerPage)) {
    for (const rawCount of blocksPerPage) {
      if (cursor >= blocks.length) break;
      const count = Math.max(1, Math.floor(rawCount));
      const slice = blocks.slice(cursor, cursor + count);
      if (slice.length === 0) break;
      pages.push({ type: PAGE_BLOCK_NODE, content: slice });
      cursor += slice.length;
    }
  }
  if (cursor < blocks.length) {
    pages.push({ type: PAGE_BLOCK_NODE, content: blocks.slice(cursor) });
  }
  return pages;
}

/**
 * Read the persisted whole-block page distribution written by NoteEditor's
 * save boundary. This is untrusted document metadata: accept it only when its
 * layout key still matches the exact page geometry and semantic/layout input,
 * every page owns at least one block, and the sum matches the flat document.
 * A stale hint must fall back to measured flow pagination instead of pinning
 * content to the wrong sheet after a size, font or text change.
 */
export function storedPageBlockDistribution(doc: unknown): number[] | null {
  const root = doc as JsonNode | null;
  if (!root || !Array.isArray(root.content) || root.content.length === 0) {
    return null;
  }
  const storedKey = root.attrs?.pageBlockLayoutKey;
  if (typeof storedKey !== "string" || storedKey !== pageBlockLayoutKey(root)) {
    return null;
  }
  const raw = root.attrs?.pageBlockSizes;
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    raw.length > MAX_STORED_PAGE_BLOCKS
  ) {
    return null;
  }
  const sizes: number[] = [];
  let total = 0;
  for (const value of raw) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      return null;
    }
    total += value;
    if (total > root.content.length) return null;
    sizes.push(value);
  }
  return total === root.content.length ? sizes : null;
}

/**
 * Hydrate one FLAT storage document into structural editor sheets, reusing a
 * valid saved whole-block distribution as the initial layout.  Oversized
 * code/list/note/table blocks still re-split from semantic content after
 * paint, but unrelated page openers no longer collapse onto page one during
 * every save/reopen cycle.
 */
export function hydrateStoredPageBlocks<T>(doc: T, fallbackReceipt?: unknown | ((root: JSONContent) => unknown), fallbackSizes?: readonly number[] | null): T {
  const stored = doc as JsonNode | null;
  if (!stored || !Array.isArray(stored.content)) return doc;
  // This helper is a storage boundary, not a generic page re-wrapper.
  if (containsPageBlock(stored.content)) return doc;
  const blocks = withoutBareSourcePageBreaks(stored.content);
  const root: JsonNode = blocks === stored.content ? stored : { ...stored, content: blocks };
  // The saved receipt, else the one this browser last reached for the same
  // content (lib/docs-layout-receipt-cache); either restores only that content.
  const preserved = restorePaginationProjection(root,root.attrs?.[PAGE_REGION_RECEIPT]) ?? (() => {
    const receipt = typeof fallbackReceipt === "function" ? fallbackReceipt(root as JSONContent) : fallbackReceipt;
    return receipt ? restorePaginationProjection(root, receipt) : null;
  })();
  if (preserved) {
    noteRestoredHydration(preserved);
    return preserved as T;
  }
  // Without a saved layout a long document opens as provisional sheets of
  // about a page each, not one sheet holding everything: the ledger lays the
  // reader's first pages out first and the rest in the background
  // (provisionalPages).
  const distribution = storedPageBlockDistribution(root) ??
    wholeBlockDistribution(fallbackSizes, blocks.length) ??
    provisionalPageSizesForJson(blocks, root.attrs as Record<string, unknown> | null | undefined);
  return {
    ...root,
    content: wrapBlocksIntoPages(blocks, distribution ?? undefined),
  } as T;
}

/**
 * The per-page top-level block distribution of a sheeted document: one entry
 * per pageBlock carrying how many flat blocks that page holds. Returns null
 * unless EVERY top-level node is a clean pageBlock (no stray blocks, no
 * nested pages) — a mixed/corrupt tree cannot be mapped 1:1 onto the
 * flattened block list, and consumers must fall back to flow pagination.
 *
 * Serialization boundaries stamp the result into `doc.attrs.pageBlockSizes`
 * BEFORE flattenPageBlocks strips the wrappers, so server-side exporters
 * (PDF pagination 1:1) can rebuild the editor's page boundaries from the
 * flat stored content.
 */
export function pageBlockDistribution(doc: unknown): number[] | null {
  const root = doc as JsonNode | null;
  if (!root || !Array.isArray(root.content) || root.content.length === 0) {
    return null;
  }
  const sizes: number[] = [];
  for (const node of root.content) {
    if (node?.type !== PAGE_BLOCK_NODE) return null;
    const children = Array.isArray(node.content) ? node.content : [];
    // A nested pageBlock (corrupt/hostile JSON) breaks the 1:1 mapping.
    if (containsPageBlock(children)) return null;
    sizes.push(children.length);
  }
  return sizes;
}

/**
 * Word's cached page boundary (`sourcePageBreak`) is an INLINE marker a
 * paragraph carries. Stored at the top level -- the importer once wrote one
 * before a chart that opens a page in Word's cached layout (a
 * `w:lastRenderedPageBreak` in the chart's own run; R08-D12, R09-D13,
 * R12-D16) -- it is no block a sheet may hold, and the whole document failed
 * the schema and opened EMPTY. A bare marker before a paragraph becomes that
 * paragraph's own cached break; anywhere else it is dropped (it is cached
 * pagination, never an authored break).
 */
function withoutBareSourcePageBreaks(blocks: JsonNode[]): JsonNode[] {
  if (!blocks.some((block) => block?.type === "sourcePageBreak")) return blocks;
  const out: JsonNode[] = [];
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (block?.type !== "sourcePageBreak") {
      out.push(block);
      continue;
    }
    const next = blocks[index + 1];
    if (next && (next.type === "paragraph" || next.type === "heading")) {
      out.push({ ...next, attrs: { ...(next.attrs ?? {}), sourcePageBreakBefore: true } });
      index += 1;
    }
  }
  return out.length ? out : [{ type: "paragraph" }];
}

function containsPageBlock(nodes: JsonNode[] | undefined): boolean {
  if (!Array.isArray(nodes)) return false;
  return nodes.some(
    (node) =>
      node?.type === PAGE_BLOCK_NODE || containsPageBlock(node?.content),
  );
}

function flattenInto(nodes: JsonNode[]): JsonNode[] {
  const out: JsonNode[] = [];
  for (const node of nodes) {
    if (node?.type === PAGE_BLOCK_NODE) {
      // Splice the page's children into the parent flow. Pages only ever
      // belong at the top level; one found deeper (corrupt/hostile JSON -
      // Node.fromJSON does NOT validate content expressions) unwraps too.
      if (Array.isArray(node.content)) out.push(...flattenInto(node.content));
      continue;
    }
    if (Array.isArray(node?.content) && containsPageBlock(node.content)) {
      out.push({ ...node, content: flattenInto(node.content) });
    } else {
      out.push(node);
    }
  }
  return out;
}

/**
 * Remove every pageBlock wrapper AT ANY DEPTH, restoring the flat block
 * flow (Node.fromJSON performs no content-expression validation, so a
 * corrupt payload could nest a page inside a cell - flatten sanitizes it).
 * Returns the SAME object when nothing needed flattening — cheap identity
 * check for hot save paths.
 */
export function flattenPageBlocks<T>(doc: T): T {
  const root = doc as JsonNode | null;
  if (!root || !Array.isArray(root.content)) return doc;
  if (!containsPageBlock(root.content)) {
    
    // serializes as one empty paragraph, never `content: []` — the same
    // shape wrapBlocksIntoPages rehydrates as one blank page, so an empty
    // document round-trips as 空白页 instead of a pageless void.
    if (root.content.length === 0) {
      return { ...root, content: [{ type: "paragraph" }] } as T;
    }
    return doc;
  }
  const flattened = flattenInto(root.content);
  return {
    ...root,
    content: flattened.length > 0 ? flattened : [{ type: "paragraph" }],
  } as T;
}













export function docUsesBestEffortSheetLayout(doc: unknown): boolean {
  const root = doc as (JsonNode & { attrs?: Record<string, unknown> }) | null;
  const attrs = root?.attrs ?? {};
  const writingMode = String(attrs.writingMode ?? "horizontal-tb");
  if (writingMode.startsWith("vertical")) return true;
  const grid = String(attrs.manuscriptGrid ?? "off");
  return grid === "grid";
}

/** `sizes` when it is a distribution of exactly `blocks` top-level blocks
 * (each page at least one), else null. */
export function wholeBlockDistribution(sizes: readonly number[] | null | undefined, blocks: number): number[] | null {
  if (!Array.isArray(sizes) || sizes.length === 0 || sizes.length > MAX_STORED_PAGE_BLOCKS) return null;
  let total = 0;
  for (const size of sizes) {
    if (!Number.isInteger(size) || size < 1) return null;
    total += size;
  }
  return total === blocks ? [...sizes] : null;
}
