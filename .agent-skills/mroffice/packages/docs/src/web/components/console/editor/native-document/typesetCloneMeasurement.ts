/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PaginationBreakKind } from "../../../../lib/document-export/page-paginate";

import {
  KNOWN_FORMULA_ATTR,
  mathLatexForRender,
  ensureKatexFonts,
  previewTypesetsAsDisplay,
  renderKatexCached,
} from "@mrnote/core/web/components/console/editor/extensions/lazyKatex.ts";
import { clearPageEdgeMarks } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { editorFontFamilies } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerFontRanges.ts";
import { msSinceInput } from "@mrnote/core/web/lib/background-work.ts";

interface MeasuredFlowLayout {
  heights: number[];
  flowSpacingBefore: number[];
}

/** Classify editor-only pagination controls; null means ordinary content. */
export function paginationControlKind(
  block: HTMLElement,
): PaginationBreakKind | "continuous" | null {
  const type = block.getAttribute("data-type");
  if (type === "page-break") return "nextPage";
  if (type !== "section-break") return null;
  const sectionKind = block.getAttribute("data-break-type");
  if (sectionKind === "continuous") return "continuous";
  if (sectionKind === "evenPage" || sectionKind === "oddPage") {
    return sectionKind;
  }
  return "nextPage";
}

/** Remove live-editor selection and resize chrome from a measurement clone. */
export function stripEditorChrome(clone: HTMLElement): void {
  const livePaginationClasses = [
    "note-editor-page-boundary-before",
    "note-editor-page-boundary-after",
  ];
  clone.removeAttribute("contenteditable");
  clearPageEdgeMarks(clone);
  clone.classList.remove(
    "is-selected",
    "ProseMirror-selectednode",
    ...livePaginationClasses,
  );
  clone
    .querySelectorAll<HTMLElement>(".note-editor-image-handle,[data-document-selection-chrome]")
    .forEach((handle) => handle.remove());
  clone
    .querySelectorAll<HTMLElement>(
      ".note-editor-editable-page-gap,.ProseMirror-gapcursor",
    )
    .forEach((decoration) => decoration.remove());
  clone
    .querySelectorAll<HTMLElement>(
      ".is-selected,.ProseMirror-selectednode,.note-editor-page-boundary-before,.note-editor-page-boundary-after",
    )
    .forEach((selected) =>
      selected.classList.remove(
        "is-selected",
        "ProseMirror-selectednode",
        ...livePaginationClasses,
      ),
    );
  clone
    .querySelectorAll<HTMLElement>("[contenteditable]")
    .forEach((editable) => editable.removeAttribute("contenteditable"));
}

/**
 * Real-layout measurement with collapsed flow spacing owned by the following
 * printable block. PagePreview uses the full flow result; structural pages
 * cache body heights and combine them with live sheet-local spacing.
 */
export function measureFlowWithLayout(
  blocks: HTMLElement[],
): MeasuredFlowLayout {
  const heights = blocks.map(() => 0);
  const flowSpacingBefore = blocks.map(() => 0);
  const printableBlocks = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => paginationControlKind(block) === null);
  const rects = printableBlocks.map(({ block }) =>
    block.getBoundingClientRect(),
  );
  printableBlocks.forEach(({ block, index }, printableIndex) => {
    const rect = rects[printableIndex];
    const style = getComputedStyle(block);
    const previous = rects[printableIndex - 1];
    const flowSpacing = previous
      ? Math.max(0, rect.top - (previous.top + previous.height))
      : Number.parseFloat(style.marginTop) || 0;
    const trailingMargin =
      printableIndex === printableBlocks.length - 1
        ? Number.parseFloat(style.marginBottom) || 0
        : 0;
    flowSpacingBefore[index] = flowSpacing;
    heights[index] = flowSpacing + Math.max(0, rect.height) + trailingMargin;
  });
  return { heights, flowSpacingBefore };
}

/** Real-layout height-only adapter retained for PagePreview's injectable prop. */
export function measureWithLayout(blocks: HTMLElement[]): number[] {
  return measureFlowWithLayout(blocks).heights;
}

function measureBodyHeights(blocks: HTMLElement[]): number[] {
  return blocks.map((block) => {
    if (paginationControlKind(block) !== null) return 0;
    return Math.max(
      0,
      block.offsetHeight || block.getBoundingClientRect().height,
    );
  });
}

export type TypesetCloneMeasurement = "flow" | "body";

export interface TypesetCloneLayoutTarget {
  /** Visible laid-out parent for the temporary measurement host. */
  parent: HTMLElement;
  /** Explicit printable content width, when the live source is display:none. */
  width?: number;
  /**
   * Optional semantic block order. Structural editing nests blocks in
   * pageBlock sheets, while pagination must measure the flattened reading
   * order. Omit for PagePreview's historical direct-child behavior.
   */
  sourceBlocks?: readonly HTMLElement[];
  /** Optional rendered content width for every source block. Structural
   * pagination uses this when pages/sections have different printable or
   * newspaper-column widths. */
  sourceBlockWidths?: readonly number[];
  /** One-shot hook while a large fully-typeset clone is still mounted. */
  onTypesetBatch?: (blocks: readonly HTMLElement[]) => void;
  /** Each block's clone before anything in it is typeset: what marks a formula
   * {@link KNOWN_FORMULA_ATTR} leaves it to stand as a placeholder. */
  prepareClone?: (block: HTMLElement, sourceIndex: number) => void;
  /** Only `onTypesetBatch` is wanted (the formulas' typeset boxes), not the
   * blocks' heights: every block is typeset in one clone, whatever their
   * number, and no height is read. Laid out and read one block at a time,
   * the page ledger's formulas cost a layout per block: 11 s of the
   * 296-page book's open in Chromium. */
  geometryOnly?: boolean;
}

function typesetOnePendingMath(el: HTMLElement): void {
  const latex = el.textContent ?? "";
  el.removeAttribute("data-math-pending");
  if (!latex.trim()) return;
  const displayMode = previewTypesetsAsDisplay(el);
  renderKatexCached(
    el,
    mathLatexForRender(latex, el.getAttribute("data-math-style")),
    displayMode,
  );
}

/** Typeset every pending formula synchronously (small docs / previews). */
export function typesetPendingMath(clone: HTMLElement): void {
  clone
    .querySelectorAll<HTMLElement>("[data-math-pending]")
    .forEach(typesetOnePendingMath);
}

async function typesetPendingMathChunked(
  clone: HTMLElement,
  isCancelled: () => boolean,
  now = false,
): Promise<boolean> {
  const pending = [
    ...(clone.matches("[data-math-pending]") ? [clone] : []),
    ...Array.from(clone.querySelectorAll<HTMLElement>(`[data-math-pending]:not([${KNOWN_FORMULA_ATTR}])`)),
  ];
  let sliceStartedAt = performance.now();
  for (let index = 0; index < pending.length; index += 1) {
    if (isCancelled()) return false;
    typesetOnePendingMath(pending[index]);
    if (now && inputPending()) now = false;
    if (!now && performance.now() - sliceStartedAt >= 10) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      sliceStartedAt = performance.now();
    }
  }
  return !isCancelled();
}

/** How long the reader must have done nothing for a ledger's batch to be
 * typeset in one task (__docsMathBatchNow). */
const MATH_BATCH_NOW_QUIET_MS = 1000;

function inputPending(): boolean {
  try {
    return (navigator as Navigator & { scheduling?: { isInputPending?: () => boolean } }).scheduling?.isInputPending?.() === true;
  } catch {
    return false;
  }
}

/** How long a geometry batch waits for its text's faces (projectionFontNews). */
const CLONE_FACES_WAIT_MS = 3000;

/** The faces the clone's text draws with, each family asked for the clone's
 * own characters, waited for a while at most. */
async function facesTheCloneUses(clone: HTMLElement): Promise<void> {
  const fonts = clone.ownerDocument.fonts;
  if (!fonts?.load) return;
  const text = (clone.textContent ?? "").slice(0, 2000);
  if (!text.trim()) return;
  const families = [...editorFontFamilies(clone)].filter((family) => !/^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/.test(family));
  if (!families.length) return;
  await Promise.race([
    Promise.allSettled(families.map((family) => fonts.load(`16px "${family}"`, text))),
    new Promise((resolve) => setTimeout(resolve, CLONE_FACES_WAIT_MS)),
  ]);
}

/**
 * Measure a fully-typeset clone while leaving the live editor's lazy KaTeX DOM
 * untouched. `sourceBlocks` lets structural pageBlock editing flatten blocks
 * across sheets without making the clone depend on current page boundaries.
 */
export async function measureTypesetCloneBlockHeights(
  sourceDom: HTMLElement,
  isCancelled: () => boolean,
  blockIndices?: readonly number[],
  onMeasuredBlock?: (
    index: number,
    block: HTMLElement,
    flowSpacingBefore: number,
  ) => void,
  measurement: TypesetCloneMeasurement = "flow",
  layoutTarget?: TypesetCloneLayoutTarget,
): Promise<number[] | null> {
  const parent =
    layoutTarget?.parent ?? sourceDom.parentElement ?? document.body;

  const host = document.createElement("div");
  host.className = "note-editor-page-preview__measure";
  host.setAttribute("aria-hidden", "true");
  const explicitWidth = layoutTarget?.width;
  const sourceWidth =
    typeof explicitWidth === "number" &&
    Number.isFinite(explicitWidth) &&
    explicitWidth > 0
      ? explicitWidth
      : sourceDom.offsetWidth || sourceDom.clientWidth;
  if (sourceWidth > 0) host.style.width = `${sourceWidth}px`;

  const cloneShell = sourceDom.cloneNode(false) as HTMLElement;
  stripEditorChrome(cloneShell);
  const sourceBlocks = layoutTarget?.sourceBlocks
    ? Array.from(layoutTarget.sourceBlocks)
    : Array.from(sourceDom.children).filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement &&
          !child.classList.contains("note-editor-editable-page-gap") &&
          !child.classList.contains("ProseMirror-gapcursor"),
      );
  const sourceBlockWidths = layoutTarget?.sourceBlockWidths;
  const blockWidth = (index: number): number | null => {
    if (sourceBlockWidths?.length !== sourceBlocks.length) return null;
    const value = sourceBlockWidths[index];
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : null;
  };
  const requested = blockIndices
    ? new Set(blockIndices)
    : new Set(sourceBlocks.map((_, index) => index));
  const controlKinds = sourceBlocks.map(paginationControlKind);
  const previousPrintableIndex = new Array<number | null>(
    sourceBlocks.length,
  ).fill(null);
  const nextPrintableIndex = new Array<number | null>(sourceBlocks.length).fill(
    null,
  );
  let previousPrintable: number | null = null;
  for (let index = 0; index < sourceBlocks.length; index += 1) {
    previousPrintableIndex[index] = previousPrintable;
    if (controlKinds[index] === null) previousPrintable = index;
  }
  let nextPrintable: number | null = null;
  for (let index = sourceBlocks.length - 1; index >= 0; index -= 1) {
    nextPrintableIndex[index] = nextPrintable;
    if (controlKinds[index] === null) nextPrintable = index;
  }

  parent.append(host);
  host.append(cloneShell);
  // (Trace: `window.__pageLedgerTrace`) where a geometry batch's time goes:
  // the KaTeX faces, the typesetting, the wait for every face of the page.
  const traceSink = layoutTarget?.geometryOnly
    ? (host.ownerDocument.defaultView as (Window & { __pageLedgerTrace?: unknown[] }) | null)?.__pageLedgerTrace
    : undefined;
  const steps: Record<string, number> = {};
  let stepAt = performance.now();
  const step = (name: string) => {
    const now = performance.now();
    steps[name] = Math.round(now - stepAt);
    stepAt = now;
  };
  // A batch the page ledger waits for is typeset in one task while the reader
  // does nothing; input arriving meanwhile has it yield again. Yielding every
  
  // the line projections): R286-D01's 15 formulas took 2-7 s a batch, the
  // ledger held all that time, and a face arriving meanwhile cancelled it
  
  const batchNow = Boolean(layoutTarget?.geometryOnly) && msSinceInput() >= MATH_BATCH_NOW_QUIET_MS &&
    (host.ownerDocument.defaultView as (Window & { __docsMathBatchNow?: boolean }) | null)?.__docsMathBatchNow !== false;
  try {
    if (!batchNow) await new Promise((resolve) => setTimeout(resolve, 0));
    step("yield");
    // (projectionFontNews) A geometry batch waits for the faces its formulas
    // and their text use, not for every face the page is loading.
    const facesOnly = Boolean(layoutTarget?.geometryOnly) &&
      (host.ownerDocument.defaultView as (Window & { __docsProjectionFontNews?: boolean }) | null)?.__docsProjectionFontNews === true;
    await ensureKatexFonts(!facesOnly);
    step("katexFonts");
    if (isCancelled()) return null;

    if (requested.size > 500 || layoutTarget?.geometryOnly) {
      cloneShell.replaceChildren();
      const clonedBlocks = sourceBlocks.map((sourceBlock, index) => {
        const block = sourceBlock.cloneNode(true) as HTMLElement;
        stripEditorChrome(block);
        const width = blockWidth(index);
        if (width !== null) block.style.width = `${width}px`;
        block
          .querySelectorAll<HTMLElement>(
            ".note-editor-editable-page-gap,.ProseMirror-gapcursor",
          )
          .forEach((decoration) => decoration.remove());
        layoutTarget?.prepareClone?.(block, index);
        if (paginationControlKind(block) !== null) {
          block.replaceChildren();
          block.setAttribute("aria-hidden", "true");
          block.style.setProperty("display", "none", "important");
          block.style.setProperty("margin", "0", "important");
        }
        cloneShell.append(block);
        return block;
      });
      step("clone");
      const done = await typesetPendingMathChunked(cloneShell, isCancelled, batchNow);
      step("typeset");
      if (!done || isCancelled()) return null;
      const loading = document.fonts?.status === "loading";
      if (facesOnly) {
        await facesTheCloneUses(cloneShell);
        step(loading ? "facesLoading" : "faces");
      } else {
        if (document.fonts?.ready) await document.fonts.ready;
        step(loading ? "fontsReadyLoading" : "fontsReady");
      }
      if (isCancelled()) return null;
      layoutTarget?.onTypesetBatch?.(clonedBlocks);
      if (layoutTarget?.geometryOnly) return new Array<number>(sourceBlocks.length).fill(Number.NaN);
      const flowLayout = measureFlowWithLayout(clonedBlocks);
      const measured =
        measurement === "body"
          ? measureBodyHeights(clonedBlocks)
          : flowLayout.heights;
      const heights = new Array<number>(sourceBlocks.length).fill(Number.NaN);
      requested.forEach((index) => {
        const block = clonedBlocks[index];
        if (!block) return;
        onMeasuredBlock?.(
          index,
          block,
          flowLayout.flowSpacingBefore[index] ?? 0,
        );
        heights[index] = measured[index] ?? Number.NaN;
      });
      return heights;
    }

    const heights = new Array<number>(sourceBlocks.length).fill(Number.NaN);
    let sliceStartedAt = performance.now();

    for (let index = 0; index < sourceBlocks.length; index += 1) {
      if (!requested.has(index)) continue;
      if (isCancelled()) return null;
      if (controlKinds[index] !== null) {
        heights[index] = 0;
        continue;
      }
      cloneShell.replaceChildren();
      const width = blockWidth(index);
      cloneShell.style.width = width !== null ? `${width}px` : "";

      const previousIndex = previousPrintableIndex[index];
      const previousContext =
        previousIndex !== null
          ? (sourceBlocks[previousIndex].cloneNode(false) as HTMLElement)
          : null;
      if (previousContext) stripEditorChrome(previousContext);
      if (previousContext) cloneShell.append(previousContext);
      const block = sourceBlocks[index].cloneNode(true) as HTMLElement;
      stripEditorChrome(block);
      block
        .querySelectorAll<HTMLElement>(
          ".note-editor-editable-page-gap,.ProseMirror-gapcursor",
        )
        .forEach((decoration) => decoration.remove());
      cloneShell.append(block);
      const followingIndex = nextPrintableIndex[index];
      if (followingIndex !== null) {
        const followingContext = sourceBlocks[followingIndex].cloneNode(
          false,
        ) as HTMLElement;
        stripEditorChrome(followingContext);
        cloneShell.append(followingContext);
      }

      const done = await typesetPendingMathChunked(block, isCancelled);
      if (!done || isCancelled()) return null;
      if (document.fonts?.ready) await document.fonts.ready;
      if (isCancelled()) return null;
      const style = getComputedStyle(block);
      const marginTop = Number.parseFloat(style.marginTop) || 0;
      const marginBottom = Number.parseFloat(style.marginBottom) || 0;
      const previousMarginBottom = previousContext
        ? Number.parseFloat(getComputedStyle(previousContext).marginBottom) || 0
        : 0;
      const bodyHeight =
        block.offsetHeight || block.getBoundingClientRect().height;
      const flowSpacing =
        previousIndex === null
          ? marginTop
          : Math.max(previousMarginBottom, marginTop);
      onMeasuredBlock?.(index, block, flowSpacing);
      heights[index] =
        measurement === "body"
          ? Math.max(0, bodyHeight)
          : Math.max(0, bodyHeight) +
            flowSpacing +
            (followingIndex === null ? marginBottom : 0);

      if (performance.now() - sliceStartedAt >= 10) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        sliceStartedAt = performance.now();
      }
    }
    return heights;
  } finally {
    host.remove();
    if (Array.isArray(traceSink)) traceSink.push({ at: Date.now(), mathClone: { ...steps, cancelled: isCancelled() } });
  }
}
