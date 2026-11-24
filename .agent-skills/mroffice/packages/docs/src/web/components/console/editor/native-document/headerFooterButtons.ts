/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Header & Footer tab and Insert ▸ Page Number button logic shared by the
 * document toolbar and the editor-command catalog. Section settings belong
 * to the document's sections, so every function takes the body editor and
 * an explicit zero-based section index.
 */

import type { Editor } from "@tiptap/core";
import type { HeaderFooterEditingContext } from "./paged/SheetBandEditLayer";
import { normalizeSectionBands } from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import {
  pageNumberFormatPatch,
  planPageNumberInsertion,
  planPageNumberRemoval,
  runPageNumberInsertionPlan,
  type PageNumberDialogContext,
  type PageNumberDialogValue,
  type PageNumberFormatDialogValue,
  type PageNumberStoryWrite,
} from "./pageNumberDialogModel";
import { normalizeSectionLayouts, updateSectionLayout } from "@mrnote/core/web/components/console/editor/native-document/sectionLayouts.ts";
import {
  normalizeSectionStoryGraph,
  resolveEffectiveSectionStoryRef,
  sectionStorySlot,
  type SectionStoryVariant,
} from "@mrnote/core/web/components/console/editor/native-document/sectionStoryGraph.ts";

const NATIVE_BAND_LINK_KEYS = {
  header: {
    default: "headerLinkedToPrevious",
    first: "firstPageHeaderLinkedToPrevious",
    even: "evenPageHeaderLinkedToPrevious",
  },
  footer: {
    default: "footerLinkedToPrevious",
    first: "firstPageFooterLinkedToPrevious",
    even: "evenPageFooterLinkedToPrevious",
  },
} as const;

export interface HeaderFooterNativeContextState {
  differentFirstPage: boolean;
  differentOddEven: boolean;
  headerDistanceTwips: number | null;
  footerDistanceTwips: number | null;
  linkedToPrevious: boolean | null;
  linkEditable: boolean;
  firstPageEditable: boolean;
  oddEvenEditable: boolean;
  distanceEditable: boolean;
}

export function readHeaderFooterNativeContextState(
  editor: Editor,
  context: HeaderFooterEditingContext | null,
): HeaderFooterNativeContextState {
  const unavailable: HeaderFooterNativeContextState = {
    differentFirstPage: false,
    differentOddEven: false,
    headerDistanceTwips: null,
    footerDistanceTwips: null,
    linkedToPrevious: null,
    linkEditable: false,
    firstPageEditable: false,
    oddEvenEditable: false,
    distanceEditable: false,
  };
  if (!context) return unavailable;
  const attrs = editor.state.doc.attrs as Record<string, unknown>;
  const layouts = normalizeSectionLayouts(attrs.sectionLayouts);
  const graphPresent =
    attrs.sectionStoryGraph !== null && attrs.sectionStoryGraph !== undefined;
  const graph = graphPresent
    ? normalizeSectionStoryGraph(attrs.sectionStoryGraph, layouts?.length)
    : null;
  if (graphPresent && !graph) return unavailable;
  const section = graph?.sections[context.sectionIndex];
  const bands = normalizeSectionBands(attrs.sectionBands);
  const band = bands?.[context.sectionIndex];
  // Word's Header from Top is always there to set: a document that never had
  // Page Setup applied shows (and on a change, gains) the section layout its
  // pages are drawn with.
  const layout =
    layouts?.[context.sectionIndex] ??
    (layouts
      ? undefined
      : (updateSectionLayout(editor.state, context.sectionIndex, {})?.layouts[context.sectionIndex] ?? undefined));
  const storyVariant: SectionStoryVariant =
    context.variant === "normal" ? "default" : context.variant;
  const localRef = section?.[sectionStorySlot(context.kind, storyVariant)];
  const nativeLinkKey = NATIVE_BAND_LINK_KEYS[context.kind][storyVariant];
  let sectionCount = 1;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "sectionBreak") sectionCount += 1;
    return true;
  });
  // Without imported header/footer parts the painted band carries the link
  // (Word: offered only when the document has more than one section).
  const nativeLinkable =
    !graphPresent && context.sectionIndex > 0 && sectionCount > 1;
  // Word: a new section starts linked to the previous one ("Link to
  // previous", Microsoft Support). Without per-section bands every section
  // shows the document's one header, which is that linked state.
  const linkedToPrevious = nativeLinkable
    ? bands === null ||
      (band as Record<string, unknown> | undefined)?.[nativeLinkKey] === true
    : context.sectionIndex > 0 && section
      ? localRef === null
      : null;
  const inherited =
    graph && context.sectionIndex > 0
      ? resolveEffectiveSectionStoryRef(
          graph,
          context.sectionIndex - 1,
          context.kind,
          storyVariant,
        )
      : null;
  return {
    differentFirstPage:
      section?.titlePage ??
      (band
        ? band.differentFirstPage === true
        : attrs.differentFirstPage === true),
    differentOddEven:
      graph?.evenAndOddHeaders ?? attrs.differentOddEven === true,
    headerDistanceTwips: layout?.pageMargins.headerTwips ?? null,
    footerDistanceTwips: layout?.pageMargins.footerTwips ?? null,
    linkedToPrevious,
    linkEditable:
      editor.isEditable &&
      (nativeLinkable ||
        (context.sectionIndex > 0 &&
          Boolean(graph) &&
          (localRef !== null || inherited !== null))),
    firstPageEditable:
      editor.isEditable &&
      (!graphPresent || Boolean(graph)),
    oddEvenEditable: editor.isEditable && (!graphPresent || Boolean(graph)),
    distanceEditable: editor.isEditable && Boolean(layout),
  };
}

/**
 * What the Page Numbers dialog and Remove Page Numbers act on: the section's
 * Different First Page and the document's Different Odd & Even, read the way
 * the Header & Footer tab reads them.
 */
export function pageNumberDialogContext(
  editor: Editor,
  sectionIndex: number,
  kind: "header" | "footer" = "footer",
  sheetIndex = 0,
  /** The story open in the header/footer pane, whose page the cursor is on. */
  openVariant?: "default" | "first" | "even",
): PageNumberDialogContext {
  const state = readHeaderFooterNativeContextState(editor, {
    sheetIndex,
    sectionIndex,
    kind,
    variant: "normal",
    availableVariants: [],
    canPrevious: false,
    canNext: false,
  });
  const currentVariant =
    openVariant ??
    pageStoryVariantAtSelection(editor, sectionIndex, {
      differentOddEven: state.differentOddEven,
      titlePage: state.differentFirstPage,
    });
  return {
    differentOddEven: state.differentOddEven,
    titlePage: state.differentFirstPage,
    ...(currentVariant ? { currentVariant } : {}),
  };
}

/**
 * The header/footer story the page holding the selection shows: the
 * first-page story on a section's first page when it has a different first
 * page, the even-page story on an even-numbered page when the document has
 * different odd and even pages, else the section's own. Pages are the paged
 * editor's sheets (`pageBlock`); a page's number restarts where its section's
 * page numbering does. Null when the selection is outside `sectionIndex` or
 * the document is not laid out in pages.
 */
export function pageStoryVariantAtSelection(
  editor: Editor,
  sectionIndex: number,
  context: { readonly differentOddEven: boolean; readonly titlePage: boolean },
): "default" | "first" | "even" | null {
  const { doc, selection } = editor.state;
  // The sheets, and where each section's first block sits (a section begins
  // after its section break; the first section at the start).
  const sheets: Array<{ from: number; to: number }> = [];
  let paged = true;
  let offset = 0;
  doc.forEach((child) => {
    if (child.type.name !== "pageBlock") paged = false;
    sheets.push({ from: offset, to: offset + child.nodeSize });
    offset += child.nodeSize;
  });
  if (!paged || sheets.length === 0) return null;
  const sectionStarts: number[] = [0];
  let selectionSection = 0;
  let pendingStart = false;
  doc.descendants((node, pos) => {
    if (node.type.name === "pageBlock") return true;
    if (node.type.name === "sectionBreak") {
      if (pos < selection.from) selectionSection += 1;
      pendingStart = true;
      return false;
    }
    if (pendingStart && node.isBlock) {
      sectionStarts.push(pos);
      pendingStart = false;
    }
    return false;
  });
  if (selectionSection !== sectionIndex || sectionIndex >= sectionStarts.length) return null;
  const sheetAt = (pos: number) => sheets.findIndex((sheet) => pos >= sheet.from && pos < sheet.to);
  const index = sheetAt(selection.from);
  if (index < 0) return null;
  const firstSheets = sectionStarts.map(sheetAt);
  // The page's number: one more than the page before, or its section's
  // Start at on the section's first page.
  const layouts = normalizeSectionLayouts(doc.attrs.sectionLayouts);
  let number = 0;
  for (let at = 0; at <= index; at += 1) {
    const section = firstSheets.lastIndexOf(at);
    const restart = section >= 0 ? layouts?.[section]?.pageNumber?.start : undefined;
    number = typeof restart === "number" ? restart : number + 1;
  }
  if (context.titlePage && firstSheets[sectionIndex] === index) return "first";
  if (context.differentOddEven && number % 2 === 0) return "even";
  return "default";
}

/** One planned `setSectionPageNumberStory` write, or whether it could run. */
export function runPageNumberStoryWrite(
  editor: Editor,
  sectionIndex: number,
  write: PageNumberStoryWrite,
  dryRun: boolean,
): boolean {
  try {
    const surface = dryRun ? editor.can() : editor.commands;
    return surface.setSectionPageNumberStory(
      sectionIndex,
      write.kind,
      write.variant,
      write.alignment,
      write.includePageCount,
    );
  } catch {
    return false;
  }
}

/**
 * OK in Page Numbers: the PAGE field into every story of the section that
 * prints, in the order planPageNumberInsertion gives (primary, even, first
 * page), with Different Odd & Even turned on first for Inside / Outside and
 * Different First Page turned on before the first-page write when the
 * number must skip page 1.
 */
export function runPageNumbersDialog(
  editor: Editor,
  sectionIndex: number,
  context: PageNumberDialogContext,
  value: PageNumberDialogValue,
): boolean {
  const plan = planPageNumberInsertion(value, context);
  if (!plan) return false;
  const { commands } = editor;
  return runPageNumberInsertionPlan(plan, {
    write: (write, dryRun) => runPageNumberStoryWrite(editor, sectionIndex, write, dryRun),
    enableDifferentOddEven: () => commands.setDifferentOddEven(true),
    enableTitlePage: () => commands.setSectionDifferentFirstPage(sectionIndex, true),
  });
}

/**
 * Word's "Remove Page Numbers": the page number goes from every story of the
 * section — header and footer, and the first-page and even-page stories
 * when they print.
 */
export function runRemovePageNumbers(
  editor: Editor,
  sectionIndex: number,
  context: PageNumberDialogContext,
): boolean {
  let removed = false;
  for (const write of planPageNumberRemoval(context)) {
    if (runPageNumberStoryWrite(editor, sectionIndex, write, true)) {
      removed = runPageNumberStoryWrite(editor, sectionIndex, write, false) || removed;
    }
  }
  return removed;
}

/** The section's stored w:pgNumType, as the Format Page Numbers dialog reads it. */
export function sectionPageNumberSettings(editor: Editor, sectionIndex: number) {
  return normalizeSectionLayouts(editor.state.doc.attrs.sectionLayouts)?.[sectionIndex]?.pageNumber ?? null;
}

/** OK in Format Page Numbers, on a section of the section model. */
export function runPageNumberFormatDialog(
  editor: Editor,
  sectionIndex: number,
  value: PageNumberFormatDialogValue,
  current: Parameters<typeof pageNumberFormatPatch>[1],
): boolean {
  const patch = pageNumberFormatPatch(value, current);
  if (!patch) return false;
  if (Object.keys(patch).length === 0) return true;
  return editor.commands.updateSectionLayout(sectionIndex, {
    pageNumber: patch,
  });
}
