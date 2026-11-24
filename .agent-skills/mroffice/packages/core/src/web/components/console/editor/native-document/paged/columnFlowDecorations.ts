/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Stable page-level selectors for newspaper-column layout.
 *
 * The rebalancer owns measured placement, but attributes on a pageBlock's
 * outer article must be ProseMirror node decorations. Foreign DOM writes are
 * reverted by ProseMirror's observer during an unrelated decoration redraw;
 * that used to drop unequal-column placement after the first settled frame.
 */

import { plainTextEdits } from "../textblockOnlyEdits";
import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { COLUMN_GAP_PX, resolveColumnSeparator, resolveColumns } from "../documentLayout";
import { normalizeWordDocumentSettings, resolveWordPageBox, type WordDocumentSettings } from "../wordDocumentSettings";
import {
  SECTION_NATIVE_PAGE_BORDER_ATTR,
  SECTION_UNEQUAL_COLUMN_SEPARATOR_ATTR,
  SECTION_UNEQUAL_COLUMN_TRACKS_ATTR,
  equalColumnTracksToken,
  normalizeSectionLayouts,
  sectionLayoutPageBorderCss,
  sectionLayoutColumnTracksToken,
  type SectionLayout,
} from "../sectionLayouts";
import {
  COLUMN_REGIONS_ATTR,
  UNEQUAL_COLUMN_FLOW_ATTR,
  UNEQUAL_COLUMN_SHEET_ID_ATTR,
} from "./unequalColumnProjection";
import { continuousBreaksStartingPage, isForcedBreakBlock, PAGE_BLOCK_NODE } from "./pageBlockExtension";
import { sourceHardBreakTailPositions } from "../sourceHardBreakTail";
import { COPILOT_PROJECTION_ORIGIN, projectionReceiptForRuntime } from "./paginationProjectionReceipt";
import { normalizeWordCompatibilityMode } from "../documentOverflowPunctuation";
import type { EditorState } from "@tiptap/pm/state";

export const STRUCTURAL_COLUMN_FLOW_ATTR = "data-page-column-flow";

interface ColumnFlowDecorationState {
  scopeId: number;
  firstLeading?: boolean;
  decorations: DecorationSet;
}

const columnFlowDecorationKey = new PluginKey<ColumnFlowDecorationState>(
  "columnFlowDecorations",
);
let nextColumnFlowScopeId = 1;

interface StructuralPage {
  pos: number;
  nodeSize: number;
  sectionBreaks: number;
  /** Section breaks followed by more of the page: each opens a stacked
   * region (a continuous section that starts mid-page). */
  innerBreaks: number;
  /** Every one of those breaks is continuous (the only kind that stacks
   * sections on one page). */
  innerBreaksContinuous: boolean;
  preserveLeadingSpace: boolean;
}

/** structuralPages per document and first-page policy: the plugin and two
 * readers in every ledger pass derived the same pages from the same document,
 * each walking all of it. */
const structuralPagesByDoc = new WeakMap<PmNode, Map<boolean, readonly StructuralPage[]>>();

function structuralPages(doc: PmNode, firstLeading = true): readonly StructuralPage[] {
  let byPolicy = structuralPagesByDoc.get(doc);
  if (!byPolicy) structuralPagesByDoc.set(doc, (byPolicy = new Map()));
  let pages = byPolicy.get(firstLeading);
  if (!pages) byPolicy.set(firstLeading, (pages = deriveStructuralPages(doc, firstLeading)));
  return pages;
}

function deriveStructuralPages(doc: PmNode, firstLeading: boolean): StructuralPage[] {
  const pages: StructuralPage[] = [];
  const paragraphEnds = new Set(sourceHardBreakTailPositions(doc));
  let preserveLeadingSpace = firstLeading;
  const preserved = projectionReceiptForRuntime(doc)?.geometry;
  // A continuous break onto other paper starts a page, as a next-page one.
  const pageStarters = continuousBreaksStartingPage(doc);
  // Word 2013 and later (compatibility mode 15) start every page with no
  // space before, a forced one too, except the first page of a section;
  // earlier modes also keep it after Page Break Before or a break opening
  // the paragraph (Word 16.86, measured: 48 pt before a "Target" paragraph
  // drops to 0 in mode 15 and stays, less the space after it overlapped, in
  // modes 12 and 14 and with none stated). The paragraph after one ending in
  // a page break drops it in every mode (g-l5top, modes 14 and 15; R279-D12:
  // the heading after a section break keeps its 12 pt, the one after a page
  // break does not).
  const keepsForcedLeadingSpace = (normalizeWordCompatibilityMode(doc.attrs?.wordCompatibilityMode) ?? 0) < 15;
  doc.forEach((node, pos) => {
    if (node.type.name !== PAGE_BLOCK_NODE) return;
    let sectionBreaks = 0;
    node.descendants((child) => {
      if (child.type.name === "sectionBreak") sectionBreaks += 1;
      return true;
    });
    let innerBreaks = 0;
    let innerBreaksContinuous = true;
    node.forEach((child, _offset, index) => {
      if (child.type.name !== "sectionBreak" || index >= node.childCount - 1) return;
      innerBreaks += 1;
      // A next-page (odd/even) break inside a page is a page the paginator
      // has still to cut there, not a region of this page.
      if (child.attrs.breakType !== "continuous" || pageStarters.has(child)) innerBreaksContinuous = false;
    });
    // A verified nonprinting tail closes the paragraph that contained the
    // break. The following paragraph starts a new flow on this page; Word
    // suppresses its before-spacing, even for a user-authored page break.
    // A break inside a continuing paragraph has no such empty-tail witness.
    const startsAfterParagraphEnd = paragraphEnds.has(pos + 1);
    // Page Break Before on a paragraph whose page a break already started:
    // its break stands at the top of this sheet.
    const opensWithOwnBreak = keepsForcedLeadingSpace && firstPrintingChild(node, pos, paragraphEnds, false)?.node.type.name === "pageBreak";
    pages.push({ pos, nodeSize: node.nodeSize, sectionBreaks, innerBreaks, innerBreaksContinuous,
      preserveLeadingSpace: preserved?.[pages.length]?.leading ??
        ((preserveLeadingSpace && !startsAfterParagraphEnd) || opensWithOwnBreak) });
    const last = node.lastChild;
    const opensSection = last ? pageStarters.has(last) || (last.type.name === "sectionBreak" && isForcedBreakBlock(last)) : false;
    preserveLeadingSpace = Boolean(last) && (keepsForcedLeadingSpace ? isForcedBreakBlock(last!) || opensSection : opensSection);
  });
  return pages;
}

/** The first child of a sheet that is not a hard-break segment's non-printing
 * tail, and past a page break standing at the top with `pastBreak`. */
function firstPrintingChild(
  sheet: PmNode,
  sheetPos: number,
  tails: ReadonlySet<number>,
  pastBreak: boolean,
): { node: PmNode; pos: number } | null {
  let pos = sheetPos + 1;
  for (let index = 0; index < sheet.childCount; index += 1) {
    const node = sheet.child(index);
    if (!tails.has(pos) && !(pastBreak && node.type.name === "pageBreak")) return { node, pos };
    pos += node.nodeSize;
  }
  return null;
}

function spacingPt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

const LIST_CONTAINERS = new Set(["bulletList", "orderedList", "taskList"]);

function isListContainer(node: PmNode): boolean {
  return LIST_CONTAINERS.has(node.type.name);
}

/** The last paragraph of a list, its nested lists included. */
function lastTextblockOf(node: PmNode): PmNode | null {
  for (let index = node.childCount - 1; index >= 0; index -= 1) {
    const child = node.child(index);
    if (child.isTextblock) return child;
    const inner = lastTextblockOf(child);
    if (inner) return inner;
  }
  return null;
}

/** The first paragraph of a page that keeps its space before, and that
 * space less the space after of the last paragraph of the page before;
 * null when nothing is taken off. */
export function leadingSpaceKeptPt(
  doc: PmNode,
  before: { pos: number },
  page: { pos: number },
  tails: ReadonlySet<number> = new Set(),
): { pos: number; nodeSize: number; pt: number } | null {
  const sheet = doc.nodeAt(page.pos);
  const previous = doc.nodeAt(before.pos);
  const opening = sheet ? firstPrintingChild(sheet, page.pos, tails, true) : null;
  const first = opening?.node;
  if (!sheet || !previous || !opening || !first?.isTextblock) return null;
  const own = spacingPt(first.attrs?.spaceBefore);
  if (own === null || own <= 0) return null;
  let after: number | null = null;
  for (let index = previous.childCount - 1; index >= 0; index -= 1) {
    const child = previous.child(index);
    if (child.isTextblock) {
      after = spacingPt(child.attrs?.spaceAfter);
      break;
    }
    // The last paragraph of a list is the paragraph before the break too, as
    // the page ledger reads it (its last flow atom): taken here only at the
    // top level, the page ledger planned the page start 10 pt shorter than it
    // was drawn after a list, and the page overflowed its paper (a chapter
    
    if (isListContainer(child)) {
      after = spacingPt(lastTextblockOf(child)?.attrs?.spaceAfter);
      break;
    }
  }
  if (after === null || after <= 0) return null;
  return { pos: opening.pos, nodeSize: first.nodeSize, pt: Math.max(0, own - after) };
}

/**
 * A column region's own side margins against the sheet's (the margins of the
 * section the page starts in), as `@<left>,<right>` twips more; "" when the
 * same. Word lays each section of a page out between its own left and right
 * margins, a continuous one too: R351-D09's two-column section (right margin
 * 758 twips) under a single-column one (560) on page 1 has columns of 4971
 * twips in Word's PDF; drawn in the sheet's margins they were 5070, and each
 * line held a word more. `window.__docsRegionMarginsOff = true`: the sheet's
 * margins for every region, as before.
 */
function regionMarginsSuffix(region: SectionLayout, sheet: SectionLayout, settings: WordDocumentSettings | null, pageIndex: number): string {
  if (typeof window !== "undefined" && (window as Window & { __docsRegionMarginsOff?: boolean }).__docsRegionMarginsOff === true) return "";
  if (region === sheet) return "";
  const own = resolveWordPageBox(region, settings, pageIndex);
  const base = resolveWordPageBox(sheet, settings, pageIndex);
  const left = Math.max(0, Math.round(own.leftTwips)) - Math.max(0, Math.round(base.leftTwips));
  const right = Math.max(0, Math.round(own.rightTwips)) - Math.max(0, Math.round(base.rightTwips));
  return left || right ? `@${left},${right}` : "";
}

/** Build only selectors whose presence is known from durable document attrs. */
export function buildColumnFlowDecorations(
  doc: PmNode,
  scopeId: number,
  firstLeading = true,
): DecorationSet {
  const pages = structuralPages(doc, firstLeading);
  if (pages.length === 0) return DecorationSet.empty;
  const paragraphEnds = new Set(sourceHardBreakTailPositions(doc));

  const rawSectionLayouts = doc.attrs.sectionLayouts;
  const layouts = normalizeSectionLayouts(rawSectionLayouts);
  const hasSectionLayoutPayload =
    rawSectionLayouts !== null && rawSectionLayouts !== undefined;
  if (hasSectionLayoutPayload) {
    const sectionCount = pages.reduce(
      (total, page) => total + page.sectionBreaks,
      1,
    );
    // A present but malformed/boundary-mismatched fidelity payload must not be
    // replaced with a plausible global-column projection.
    if (!layouts || layouts.length !== sectionCount) {
      return DecorationSet.empty;
    }
  }

  const safeScopeId =
    Number.isSafeInteger(scopeId) && scopeId >= 0 ? scopeId : 0;
  const globalColumnCount = hasSectionLayoutPayload
    ? 1
    : resolveColumns(doc.attrs.columns);
  let sectionIndex = 0;
  let pageIndexInSection = 0;
  const decorations: Decoration[] = [];
  const wordSettings = normalizeWordDocumentSettings((doc.attrs as Record<string, unknown>).wordSettings);

  pages.forEach((page, pageIndex) => {
    const layout = layouts?.[sectionIndex] ?? null;
    // A page holding a continuous section break starts a new section mid-
    // page: each section is a stacked region with its own columns (Word
    // balances a region's columns when the next section follows on the same
    // page). The projector places the regions; one layout for the page
    // otherwise.
    const regionLayouts =
      layouts && page.innerBreaks > 0 && page.innerBreaksContinuous
        ? layouts.slice(sectionIndex, sectionIndex + page.innerBreaks + 1)
        : null;
    const regionsToken =
      regionLayouts &&
      regionLayouts.length === page.innerBreaks + 1 &&
      regionLayouts.some((region) => region.columns.count > 1) &&
      new Set(regionLayouts.map((region) => sectionLayoutColumnTracksToken(region) ?? "1")).size > 1
        // (Which pages are region pages is decided by the columns alone, as before.)
        ? regionLayouts.map((region) => (sectionLayoutColumnTracksToken(region) ?? "1") +
          regionMarginsSuffix(region, regionLayouts[0]!, wordSettings, pageIndex)).join("|")
        : null;
    const columnCount = regionsToken ? 1 : (layout?.columns.count ?? globalColumnCount);
    const attrs: Record<string, string> = {};
    if (regionsToken) {
      attrs[UNEQUAL_COLUMN_FLOW_ATTR] = "true";
      attrs[UNEQUAL_COLUMN_SHEET_ID_ATTR] = `uc-${safeScopeId}-${pageIndex + 1}`;
      attrs[COLUMN_REGIONS_ATTR] = regionsToken;
    }
    // Like column selectors, this must survive PM's outer-node redraw.
    // Automatic wraps suppress leading space; only original authored starts
    // retain it. This decoration never becomes a document/storage attribute.
    if (page.preserveLeadingSpace) {
      attrs["data-page-preserve-leading-space"] = "true";
      // The space before kept at a forced page start is what is left of it
      // past the space after of the paragraph before the break, which the
      // two overlapped in (R27-D13: 10 pt before a Page Break Before heading,
      // 10 pt after the paragraph ending the page before it: none).
      const kept = pageIndex > 0 ? leadingSpaceKeptPt(doc, pages[pageIndex - 1], page, paragraphEnds) : null;
      if (kept) {
        // A variable the sheet-edge rule reads (note-editor.css): the ledger's
        // margin probe, which measures the paragraph's own spacing off the
        // sheet, keeps reading its own space before and takes the overlap off
        // itself (ledgerCut).
        decorations.push(Decoration.node(kept.pos, kept.pos + kept.nodeSize, {
          "data-page-leading-kept": "true",
          style: `--page-leading-kept: ${kept.pt}pt`,
        }));
      }
    }
    if (columnCount > 1) {
      // Every column layout is placed by the paginator's track projection:
      // the exact unequal sequence a Word section wrote, or equal tracks
      // (a section's, or the document-level `columns` attr with its fixed
      // gap) whose widths the projector derives from the sheet.
      const tracks = layout
        ? sectionLayoutColumnTracksToken(layout)
        : equalColumnTracksToken(columnCount, COLUMN_GAP_PX * 15);
      const separator = layout
        ? layout.columns.separator
        : resolveColumnSeparator(doc.attrs.columnSeparator);
      attrs[STRUCTURAL_COLUMN_FLOW_ATTR] = "true";
      if (tracks) {
        attrs[UNEQUAL_COLUMN_FLOW_ATTR] = "true";
        attrs[UNEQUAL_COLUMN_SHEET_ID_ATTR] =
          `uc-${safeScopeId}-${pageIndex + 1}`;
        attrs[SECTION_UNEQUAL_COLUMN_TRACKS_ATTR] = tracks;
        if (separator) attrs[SECTION_UNEQUAL_COLUMN_SEPARATOR_ATTR] = "true";
      }
    }
    const pageBorder = layout
      ? sectionLayoutPageBorderCss(layout, pageIndexInSection)
      : null;
    if (pageBorder) {
      attrs[SECTION_NATIVE_PAGE_BORDER_ATTR] = "true";
      attrs.style = Object.entries(pageBorder)
        .map(([property, value]) => `${property}:${value};`)
        .join("");
    }
    if (Object.keys(attrs).length > 0) {
      decorations.push(
        Decoration.node(page.pos, page.pos + page.nodeSize, attrs),
      );
    }
    if (page.sectionBreaks > 0) {
      sectionIndex += page.sectionBreaks;
      pageIndexInSection = 0;
    } else {
      pageIndexInSection += 1;
    }
  });

  return decorations.length > 0
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty;
}

export function copilotLeadingSpacePolicy(state: EditorState): readonly boolean[] {
  const first = columnFlowDecorationKey.getState(state)?.firstLeading ?? true;
  return structuralPages(state.doc,first).map(page => page.preserveLeadingSpace);
}

export const ColumnFlowDecorations = Extension.create({
  name: "columnFlowDecorations",

  addProseMirrorPlugins() {
    return [
      new Plugin<ColumnFlowDecorationState>({
        key: columnFlowDecorationKey,
        state: {
          init: (_config, state) => {
            const scopeId = nextColumnFlowScopeId++;
            return {
              scopeId,
              decorations: buildColumnFlowDecorations(state.doc, scopeId),
            };
          },
          apply(
            tr: Transaction,
            value: ColumnFlowDecorationState,
            _oldState,
            newState,
          ) {
            const origin = tr.getMeta(COPILOT_PROJECTION_ORIGIN);
            const firstLeading = typeof origin === "boolean" ? origin : value.firstLeading;
            // Typing (text in and out of a non-empty text block) moves no
            // page, section or source break: the decorations move with it
            // instead of every keystroke reading the whole document again.
            if (tr.docChanged && typeof origin !== "boolean" && plainTextEdits(tr)) {
              return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) };
            }
            return tr.docChanged || typeof origin === "boolean"
              ? {
                  scopeId: value.scopeId,
                  firstLeading,
                  decorations: buildColumnFlowDecorations(
                    newState.doc,
                    value.scopeId,
                    firstLeading,
                  ),
                }
              : value;
          },
        },
        props: {
          decorations(state) {
            return (
              columnFlowDecorationKey.getState(state)?.decorations ??
              DecorationSet.empty
            );
          },
        },
      }),
    ];
  },
});
