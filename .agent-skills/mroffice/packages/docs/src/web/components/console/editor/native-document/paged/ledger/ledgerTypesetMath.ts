/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Typeset-math readiness for the ledger.
 *
 * Lazy KaTeX only typesets formulas near the viewport, so a block that owns
 * pending math has no trustworthy height until its formulas exist. The ledger
 * therefore refuses to measure such a block until a fully-typeset off-screen
 * clone (typesetCloneMeasurement) has supplied every pending formula's
 * placeholder geometry, which is then applied to the live previews so the
 * ordinary height oracles read typeset sizes.
 *
 * Geometry is cached per (block content, width, layout epoch); a font change
 * bumps the epoch and invalidates everything.
 */
import { HOLLOW_SHEET_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/pageSheetView.ts";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { INLINE_DISPLAY_MATH_ATTR, KNOWN_FORMULA_ATTR, applyLazyMathPlaceholderGeometry, type LazyMathPlaceholderGeometry } from "@mrnote/core/web/components/console/editor/extensions/lazyKatex.ts";
import katex from "katex";
import { currentWebBuildId } from "@mrnote/core/web/lib/web-build.ts";
import { SheetFact } from "@mrnote/core/web/lib/editor/sheet-facts.ts";
import {
  forgetFormulaBoxes,
  forgetMathGeometry,
  formulaBoxesCanBeKept,
  keepFormulaBoxes,
  keepMathGeometry,
  keptFormulaBox,
  keptMathGeometry,
  mathGeometryHash,
  mathGeometryKey,
  preloadFormulaBoxes,
  preloadMathGeometry,
  type FormulaBox,
} from "@mrnote/core/web/lib/docs-math-geometry-cache.ts";
import { FormulaKeys, formulaBoxOfMeasured, formulaKeysOf, formulaLeavesItsLine, typesetFormulaBreaks, typesetterOf } from "./ledgerFormulaBoxes";
import { measureTypesetCloneBlockHeights } from "../../typesetCloneMeasurement";
import { noteFacesAfterMeasure } from "@mrnote/core/web/components/console/editor/native-document/paged/ledger/ledgerFaceScan.ts";
import { textEngineEnabled } from "@mrnote/core/web/lib/text-engine/flags.ts";
import { SheetMeasureMemo, sheetsOf } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetMeasureMemo.ts";
import {
  INITIAL_PAGINATION_SETTLING_ATTR,
  applyTypesetMathPlaceholders,
  collectPages,
  flattenStructuralSheetBlocks,
  mathPreviews,
  measureStructuralBlockContentWidths,
  measureTypesetMathPlaceholderGeometriesForBlocks,
} from "@mrnote/core/web/components/console/editor/native-document/paged/pageRebalanceExtension.ts";

/**
 * KaTeX's faces (katex.css, font-display: block). Until a face has loaded,
 * a formula is laid out with fallback metrics: geometry measured then is
 * neither the final size nor the same from one opening to the next (a 296-page
 * book broke page 45 two ways). The clone measures only once every face
 * has loaded or failed.
 */
const KATEX_FACES = [
  "normal 400 KaTeX_AMS", "normal 700 KaTeX_Caligraphic", "normal 400 KaTeX_Caligraphic",
  "normal 700 KaTeX_Fraktur", "normal 400 KaTeX_Fraktur", "normal 700 KaTeX_Main",
  "italic 700 KaTeX_Main", "italic 400 KaTeX_Main", "normal 400 KaTeX_Main",
  "italic 700 KaTeX_Math", "italic 400 KaTeX_Math", "normal 700 KaTeX_SansSerif",
  "italic 400 KaTeX_SansSerif", "normal 400 KaTeX_SansSerif", "normal 400 KaTeX_Script",
  "normal 400 KaTeX_Size1", "normal 400 KaTeX_Size2", "normal 400 KaTeX_Size3",
  "normal 400 KaTeX_Size4", "normal 400 KaTeX_Typewriter",
] as const;

const KATEX_FONTS_WAIT_MS = 8000;

interface KatexFontsState {
  settled: boolean;
  /** The faces this load brought in: their own loadingdone is not news. */
  faces: WeakSet<object>;
  waiters: Array<() => void>;
}

const katexFontsByDocument = new WeakMap<Document, KatexFontsState>();

/** Whether KaTeX's faces have settled in `doc`; starts loading them, and
 * calls `onSettled` once they have, when not. */
export function katexFontsReady(doc: Document, onSettled: () => void): boolean {
  const fonts = doc.fonts;
  if (!fonts || typeof fonts.load !== "function") return true;
  let state = katexFontsByDocument.get(doc);
  if (!state) {
    const created: KatexFontsState = { settled: false, faces: new WeakSet(), waiters: [] };
    state = created;
    katexFontsByDocument.set(doc, created);
    const settle = () => {
      if (created.settled) return;
      created.settled = true;
      const waiters = created.waiters.splice(0);
      for (const waiter of waiters) waiter();
    };
    void Promise.all(
      KATEX_FACES.map((spec) =>
        fonts.load(spec.replace(/ (KaTeX_\w+)$/, " 16px $1"))
          .then((loaded) => { for (const face of loaded) created.faces.add(face); })
          .catch(() => undefined),
      ),
    ).then(settle);
    // A stalled font request must not hold the pages' math forever: a face
    // that arrives later is news (katexFaceNews "late") and re-measures.
    doc.defaultView?.setTimeout(settle, KATEX_FONTS_WAIT_MS);
  }
  if (state.settled) return true;
  if (!state.waiters.includes(onSettled)) state.waiters.push(onSettled);
  return false;
}

const HOLDS_FORMULA = new SheetFact((node) => node.type.name === "mathBlock" || node.type.name === "inlineMath");









export function askKatexFacesIfFormulas(view: EditorView): void {
  const doc = view.dom.ownerDocument;
  if (katexFontsByDocument.has(doc)) return;
  if ((doc.defaultView as (Window & { __docsKatexFacesEarly?: boolean }) | null)?.__docsKatexFacesEarly === false) return;
  if (!HOLDS_FORMULA.inDoc(view.state.doc)) return;
  katexFontsReady(doc, () => undefined);
}

/** Whether `face` is a KaTeX face, and whether it arrived after the faces
 * the clone waits for had settled (a face the preload did not bring). */
export function katexFaceNews(doc: Document, face: { family?: string }): "none" | "preloaded" | "late" {
  if (!/(^|["',\s])KaTeX_/.test(face.family ?? "")) return "none";
  const state = katexFontsByDocument.get(doc);
  if (state && state.faces.has(face as object)) return "preloaded";
  return state?.settled ? "late" : "preloaded";
}

/** Document attributes a save or a comment rewrites without touching how a
 * formula is laid out: left out of the key its boxes are kept under. */
const VOLATILE_DOCUMENT_ATTRS = new Set(["pageRegionLayoutReceipt", "commentThreads"]);

/** The formulas one clone typesets and reads at a time. */
const MAX_FORMULAS_PER_MEASURE = 240;
/** The same where nobody is reading the pages (`allAtOnce`): no frame to keep. */
const MAX_FORMULAS_PER_PRINT_MEASURE = 960;

/** A formula of a sheet waiting for its typeset box (lazyKatex marks a
 * placed one `data-math-layout-ready`). In columns a formula's box depends
 * on the column's width (a formula wider than its column breaks): those
 * are keyed by width every pass. */
const SHEET_UNPLACED_FORMULA_SELECTOR = [
  "[data-math-pending]:not([data-math-layout-ready])",
  ...['[style*="column-count"]', "[data-page-column-regions]", "[data-page-unequal-column-tracks]"]
    .map((columns) => `:scope${columns} [data-math-pending]`),
].join(", ");

function blockHasPendingMath(block: HTMLElement): boolean {
  return block.matches("[data-math-pending]") || block.querySelector("[data-math-pending]") !== null;
}

function pmBlockOwnsMath(block: PmNode): boolean {
  if (block.type.name === "mathBlock" || block.type.name === "inlineMath") return true;
  let owns = false;
  block.descendants((node) => {
    if (node.type.name === "mathBlock" || node.type.name === "inlineMath") {
      owns = true;
      return false;
    }
    return !owns;
  });
  return owns;
}

/** A formula's box and the families its block was drawn with when it was read. */
interface MeasuredFormula {
  readonly box: FormulaBox;
  readonly families: ReadonlySet<string>;
  /** The look at the faces right after it was read (noteFacesAfterMeasure). */
  readonly look?: number;
}

/** Harness switches: the formula boxes off (A/B), the kept block boxes unread (as
 * after a release, whose build they are kept under), and every formula measured
 * and compared with the box kept for its key. */
type FormulaBoxSwitches = Window & {
  __docsMathFormulaBoxesOff?: boolean;
  __docsMathBlockBoxesOff?: boolean;
  __docsMathFormulasAlone?: boolean;
  __docsMathFormulaVerify?: unknown[];
  __docsMathFormulaStats?: { hitBlocks: number; hitFormulas: number; clonedBlocks: number; typesetFormulas: number; knownInClone: number; typesetMs: number; readMs: number };
};

/** How long the kept formula boxes are waited for. */
const FORMULA_BOXES_WAIT_MS = 3000;
/** A box apart from another of its key by more than this is a wrong key (px). */
const FORMULA_VERIFY_TOLERANCE = 0.02;

/** The font of a formula's place that its paragraph copy is given
 * (measureFormulasAlone): what its key reads of the place (FormulaKeys), so a
 * copy computes the formula's own style as its place does. */
const ALONE_FONT_PROPERTIES = [
  "font-family", "font-size", "font-weight", "font-style", "font-stretch",
  "font-variant", "font-kerning", "font-feature-settings", "font-variation-settings",
  "font-size-adjust", "line-height", "letter-spacing", "word-spacing",
  "text-transform", "text-rendering", "--doc-grid-pitch",
] as const;
/** A formula measured alone is laid out on one line, whatever its width. */
const ALONE_BLOCK_WIDTH_PX = 20_000;
const ALONE_INLINE_TAGS = new Set(["SPAN", "MARK", "STRONG", "B", "EM", "I", "U", "S", "DEL", "INS", "A", "SUB", "SUP", "FONT", "SMALL"]);

/** Whether an unread formula may be measured alone: an in-line one, typeset
 * from its source with no Word line pieces (data-word-math-lines: one Word or
 * KaTeX may break), standing in its paragraph's own runs (no list, table,
 * code or field around it whose style its key does not hold). */
export function formulaStandsAlone(preview: HTMLElement, block: HTMLElement): boolean {
  if (!preview.classList.contains("inline-math-preview") || !preview.hasAttribute("data-math-pending")) return false;
  if (preview.hasAttribute(INLINE_DISPLAY_MATH_ATTR) || preview.hasAttribute("data-word-math-lines")) return false;
  if (!preview.hasAttribute("data-word-math-box")) return false;
  for (let up = preview.parentElement; up && up !== block; up = up.parentElement) {
    if (!(ALONE_INLINE_TAGS.has(up.tagName) || up.classList.contains("inline-math-wrapper"))) return false;
  }
  return preview.parentElement !== null;
}

function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export interface LedgerTypesetMath {
  /** True when every pending formula in the sheets carries typeset
   * geometry (applied as placeholders); false while a clone measures.
   * `maxSheet`: only the sheets up to it (a progressive pass measures no
   * further; the formulas of a later sheet are typeset when a pass reaches
   * it). */
  ensure(maxSheet?: number | null): boolean;
  /** Fonts/width changed: cached geometry is stale. */
  invalidate(): void;
  /** Faces of these families arrived: the geometry of the blocks drawn with
   * them (and only those) is stale. */
  /** `through`: formulas read at a look up to it were read without these
   * faces asked for (facesUnaskedThrough) and stand. */
  invalidateFamilies(families: readonly string[], through?: number): void;
  dispose(): void;
}

export function createLedgerTypesetMath(
  view: EditorView,
  onReady: () => void,
  /** No one is reading the pages (a print): every formula is measured in one
   * run, none of the frames kept for a reader. */
  allAtOnce = false,
): LedgerTypesetMath {
  const formulasPerMeasure = allAtOnce ? MAX_FORMULAS_PER_PRINT_MEASURE : MAX_FORMULAS_PER_MEASURE;
  const geometryByKey = new Map<string, readonly LazyMathPlaceholderGeometry[]>();
  const fingerprints = new WeakMap<PmNode, string>();
  /** The block's key across openings (docs-math-geometry-cache): its content
   * by a 53-bit hash and its length, its width and kind, and what typesets
   * it (this build's styles, this KaTeX). */
  const lasting = new WeakMap<PmNode, string>();
  const typesetter = `${currentWebBuildId()}|katex@${katex.version}`;
  /** Lasting keys this opening kept: forgotten if the typesetting they were
   * measured under turns out stale (a face that arrived late). */
  const keptHere = new Set<string>();
  void preloadMathGeometry();
  /** The font families each block's formulas were measured with (its
   * elements' computed families), by geometry key, and its node. */
  const familiesByKey = new Map<string, ReadonlySet<string>>();
  const lookByKey = new Map<string, number>();
  const nodeByKey = new Map<string, PmNode>();
  /** Boxes read back from an earlier opening: measured once every face
   * had loaded, so a face of theirs arriving now changes nothing. */
  const finalKeys = new Set<string>();
  /** Blocks whose boxes a face's arrival voided: measured again. */
  let staleNodes = new WeakSet<PmNode>();
  let staleCount = 0;
  /** Families that arrived, and when: a batch measured across one of
   * them keeps nothing it measured with them. */
  const arrivals: { at: number; families: ReadonlySet<string> }[] = [];
  /** Boxes measured this opening, kept for the next one once its pages have
   * settled and no face is loading: what was measured before a face of its
   * own arrived is gone from here by then (invalidateFamilies). */
  const toKeep = new Map<string, { boxes: readonly LazyMathPlaceholderGeometry[]; families: string[] }>();
  /** One formula's box, wherever it stands (ledgerFormulaBoxes): those measured
   * this opening, those to keep for the next once the pages settle, and those kept. */
  const switches = (view.dom.ownerDocument.defaultView ?? {}) as FormulaBoxSwitches;
  // `?textEngine=-docs-formula-boxes` measures every formula as before, for a tab.
  const formulaBoxesOn = !switches.__docsMathFormulaBoxesOff && textEngineEnabled("docs-formula-boxes");
  const verifying = Array.isArray(switches.__docsMathFormulaVerify) ? switches.__docsMathFormulaVerify : null;
  const formulasAloneOn = switches.__docsMathFormulasAlone === true;
  const blockBoxesOn = !switches.__docsMathBlockBoxesOff;
  const measuredFormulas = new Map<number, MeasuredFormula>();
  const formulasToKeep = new Map<number, MeasuredFormula>();
  const formulasKeptHere = new Set<number>();
  /** A block's formula keys, while it stays the same node at the same width. */
  const formulaHashesOfNode = new WeakMap<PmNode, { where: string; hashes: readonly (number | null)[] }>();
  let keptFormulasRead: "unasked" | "reading" | "read" = formulaBoxesOn && formulaBoxesCanBeKept() ? "unasked" : "read";
  const keptFormulasReady = (): boolean => {
    if (keptFormulasRead === "read") return true;
    if (keptFormulasRead === "reading") return false;
    keptFormulasRead = "reading";
    const finish = () => {
      if (keptFormulasRead === "read") return;
      keptFormulasRead = "read";
      if (!disposed && !view.isDestroyed) onReady();
    };
    void typesetterOf(view, () => disposed || view.isDestroyed)
      .then((typesetter) => (typesetter ? preloadFormulaBoxes(typesetter) : undefined))
      .catch(() => undefined)
      .then(finish);
    view.dom.ownerDocument.defaultView?.setTimeout(finish, FORMULA_BOXES_WAIT_MS);
    return false;
  };
  // The window's own timer (win.setTimeout): a number, not Node's Timeout.
  let keepTimer: number | null = null;
  const keepSettled = () => {
    if (toKeep.size === 0 && formulasToKeep.size === 0) return;
    const win = view.dom.ownerDocument.defaultView;
    if (view.dom.getAttribute(INITIAL_PAGINATION_SETTLING_ATTR) === "true" || view.dom.ownerDocument.fonts?.status === "loading") {
      // Asked again a little later: no pass may run once the pages settle.
      if (keepTimer === null && win && !disposed) {
        keepTimer = win.setTimeout(() => {
          keepTimer = null;
          if (!disposed && !view.isDestroyed) keepSettled();
        }, 5_000);
      }
      return;
    }
    for (const [lastingKey, value] of toKeep) {
      keepMathGeometry(lastingKey, value);
      keptHere.add(lastingKey);
    }
    toKeep.clear();
    // Offline a face may not have come for lack of a network: what was measured
    // without it is not what an opening with it draws.
    if (formulasToKeep.size > 0 && win?.navigator.onLine !== false) {
      const kept: [number, FormulaBox][] = [];
      for (const [formula, { box }] of formulasToKeep) {
        kept.push([formula, box]);
        formulasKeptHere.add(formula);
      }
      keepFormulaBoxes(kept);
    }
    formulasToKeep.clear();
  };
  const familiesOfBlock = (block: HTMLElement): Set<string> => {
    const win = block.ownerDocument.defaultView;
    const found = new Set<string>();
    if (!win) return found;
    const add = (element: Element) => {
      for (const name of win.getComputedStyle(element).fontFamily.split(",")) {
        const family = name.trim().replace(/^["']|["']$/g, "").toLowerCase();
        if (family) found.add(family);
      }
    };
    add(block);
    block.querySelectorAll("*").forEach(add);
    return found;
  };
  const meets = (families: ReadonlySet<string> | undefined, arrived: ReadonlySet<string>): boolean => {
    if (!families) return true;
    for (const family of arrived) if (families.has(family)) return true;
    return false;
  };
  let epoch = 0;
  let inFlight = false;
  /** A font or width change: every pending formula is measured again, its
   * placed box included. */
  let remeasureAll = false;
  let disposed = false;
  // Sheets found with no formula waiting, while they render the same page
  // node and nothing in them changed: a keystroke's pass looked through
  // every element of the book (hundreds of thousands) for formulas still
  // waiting, and found them on no sheet but the one typed on.
  const settledSheets = new SheetMeasureMemo<true>(view.dom as HTMLElement);
  const fontsSettled = () => {
    if (!disposed && !view.isDestroyed) onReady();
  };

  const keyFor = (node: PmNode, width: number): string => {
    let fingerprint = fingerprints.get(node);
    if (!fingerprint) {
      const json = JSON.stringify(node.toJSON());
      fingerprint = hash(json);
      fingerprints.set(node, fingerprint);
      lasting.set(node, `${mathGeometryHash(json)}.${json.length}`);
    }
    return `${epoch}:${Math.round(width * 100) / 100}:${node.type.name}:${fingerprint}`;
  };
  /** The document's own settings (its default face and size, line grid,
   * styles...), by a hash of its attributes: a block's boxes are kept under
   * the document they were laid out in. */
  let documentAttrs: unknown = null;
  let documentKey = "";
  const documentKeyNow = (): string => {
    const attrs = view.state.doc.attrs;
    if (attrs !== documentAttrs) {
      documentAttrs = attrs;
      try {
        // Not what a save or a comment rewrites without changing the layout.
        const json = JSON.stringify(attrs, (key, value) => (VOLATILE_DOCUMENT_ATTRS.has(key) ? undefined : value));
        documentKey = `${mathGeometryHash(json)}.${json.length}`;
      } catch {
        documentKey = "";
      }
    }
    return documentKey;
  };
  const lastingKeyFor = (node: PmNode, width: number): string | null => {
    const content = lasting.get(node);
    const doc = documentKeyNow();
    return content && doc ? mathGeometryKey(typesetter, `${doc}:${Math.round(width * 100) / 100}:${node.type.name}:${content}`) : null;
  };
  const keptGeometry = (kept: unknown): readonly LazyMathPlaceholderGeometry[] | null => {
    const value = kept && typeof kept === "object" && !Array.isArray(kept) ? (kept as { boxes?: unknown }).boxes : kept;
    if (!Array.isArray(value) || value.length === 0) return null;
    for (const item of value) {
      if (!item || typeof item !== "object") return null;
      const { width, height, baselineDepth, kind } = item as LazyMathPlaceholderGeometry;
      if (![width, height, baselineDepth].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)) return null;
      if (kind !== "inline" && kind !== "block") return null;
    }
    return value as readonly LazyMathPlaceholderGeometry[];
  };

  return {
    ensure(maxSheet = null) {
      keepSettled();
      const allSheets = sheetsOf(view.dom);
      const sheets = maxSheet === null ? allSheets : allSheets.slice(0, Math.max(0, maxSheet) + 1);
      // The blocks with a formula still waiting for its typeset box. Once a
      // formula carries one it is left alone: reading every block of every
      // sheet up to the horizon, each pass, cost more with every page the
      // background reached (the 296-page book: 17 s of a 120 s open in
      // Chromium, most of it laying sheets out to read block widths).
      // After a font or width change every pending formula is measured again.
      const needed = new Set<HTMLElement>();
      if (!remeasureAll) {
        const doc = view.state.doc;
        const pageNodes = doc.childCount === allSheets.length ? allSheets.map((_sheet, index) => doc.child(index)) : null;
        sheets.forEach((sheet, index) => {
          const node = pageNodes?.[index];
          if (node && settledSheets.get(sheet, node)) return;
          const previews = sheet.querySelectorAll<HTMLElement>(SHEET_UNPLACED_FORMULA_SELECTOR);
          if (previews.length === 0) {
            if (node) settledSheets.set(sheet, node, true);
            return;
          }
          for (const preview of Array.from(previews)) {
            let block: HTMLElement = preview;
            while (block.parentElement && block.parentElement !== sheet) block = block.parentElement;
            needed.add(block);
          }
        });
        if (needed.size === 0 && staleCount === 0) return true;
      }
      // A hollow sheet (docs-hollow) draws none of its blocks: it has no
      // formula to typeset, and it is drawn whole before anything on it is
      // measured. Counted, its blocks never matched the drawn ones and the
      // pass waited for good (a book opened with its later sheets hollow).
      const pages = collectPages(view.state.doc);
      const drawn: HTMLElement[] = [];
      const nodes: PmNode[] = [];
      sheets.forEach((sheet, index) => {
        if (sheet.hasAttribute(HOLLOW_SHEET_ATTR)) return;
        drawn.push(sheet);
        pages?.[index]?.node.forEach((block) => nodes.push(block));
      });
      const blocks = flattenStructuralSheetBlocks(drawn);
      if (blocks.length === 0) return true;
      // Nothing measures, so nothing would call `onReady`: answering "not yet"
      // here held the first pass for good, the pages hidden and the document
      // deaf to typing (corpus R320-D01: two decoration widgets among a
      // sheet's children, a face arriving before the first pass).
      if (nodes.length !== blocks.length) return true;
      let stalePending = false;
      const pending = blocks.map((block, index) => {
        if (remeasureAll) return blockHasPendingMath(block);
        if (needed.has(block)) return true;
        if (staleCount > 0 && staleNodes.has(nodes[index]) && blockHasPendingMath(block)) {
          stalePending = true;
          return true;
        }
        return false;
      });
      // The voided blocks the pages hold no more (edited away) are not
      // waited for.
      if (!stalePending && maxSheet === null) staleCount = 0;
      if (!pending.some(Boolean)) {
        remeasureAll = false;
        return true;
      }
      const reading = new Set(blocks.filter((_block, index) => pending[index]));
      const widths = measureStructuralBlockContentWidths(drawn, reading);
      if (widths.length !== blocks.length) return true;
      const keys = blocks.map((block, index) => (pending[index] && pmBlockOwnsMath(nodes[index]) ? keyFor(nodes[index], widths[index] ?? 0) : null));
      const geometries: (readonly LazyMathPlaceholderGeometry[] | null)[] = blocks.map(() => null);
      const missing: number[] = [];
      keys.forEach((key, index) => {
        if (!key) return;
        const cached = geometryByKey.get(key);
        if (cached) geometries[index] = cached;
        else missing.push(index);
      });
      // What an earlier opening measured once its pages had settled and its
      // faces had loaded, under the same build, document and width: the
      // boxes this one's faces will draw too, whatever has loaded yet.
      const facesSettled = missing.length > 0 && katexFontsReady(view.dom.ownerDocument, fontsSettled);
      if (facesSettled && blockBoxesOn) {
        for (let at = missing.length - 1; at >= 0; at -= 1) {
          const index = missing[at];
          const key = keys[index];
          const lastingKey = lastingKeyFor(nodes[index], widths[index] ?? 0);
          const kept = lastingKey ? keptGeometry(keptMathGeometry(lastingKey)) : null;
          if (!key || !kept) continue;
          geometryByKey.set(key, kept);
          finalKeys.add(key);
          nodeByKey.set(key, nodes[index]);
          geometries[index] = kept;
          missing.splice(at, 1);
        }
      }
      // A block whose every formula has been measured somewhere (in this opening
      // or an earlier one, in this document or another) wants no clone at all;
      // one with others among them is typeset for those only.
      const knownFormulas = new Map<number, readonly (FormulaBox | null)[]>();
      const formulaHashes = new Map<number, readonly (number | null)[]>();
      const formulaKeys = new FormulaKeys();
      /** Whether block `index` is placed from its formulas' boxes, and what is
       * known of them when it is not. */
      const placedFromFormulas = (index: number): boolean => {
        const node = nodes[index];
        const where = `${Math.round((widths[index] ?? 0) * 100) / 100}|${documentKeyNow()}`;
        let remembered = formulaHashesOfNode.get(node);
        if (remembered?.where !== where) {
          remembered = { where, hashes: formulaKeysOf(blocks[index], widths[index] ?? 0, formulaKeys) };
          formulaHashesOfNode.set(node, remembered);
        }
        const hashes = remembered.hashes;
        formulaHashes.set(index, hashes);
        let final = true;
        const families = new Set<string>();
        const found = hashes.map((formula) => {
          if (formula === null) return null;
          const measuredHere = measuredFormulas.get(formula);
          if (!measuredHere) return keptFormulaBox(formula) ?? null;
          final = false;
          measuredHere.families.forEach((family) => families.add(family));
          return measuredHere.box;
        });
        if (!verifying) knownFormulas.set(index, found);
        const key = keys[index];
        if (!key || found.length === 0 || !found.every(Boolean)) return false;
        const boxes = found as FormulaBox[];
        const place = () => {
          if (verifying) return false;
          geometryByKey.set(key, boxes);
          nodeByKey.set(key, node);
          if (final) finalKeys.add(key);
          else familiesByKey.set(key, families);
          if (staleNodes.has(node)) {
            staleNodes.delete(node);
            staleCount = Math.max(0, staleCount - 1);
          }
          geometries[index] = boxes;
          const stats = switches.__docsMathFormulaStats;
          if (stats) {
            stats.hitBlocks += 1;
            stats.hitFormulas += boxes.length;
          }
          return true;
        };
        // A formula KaTeX can break breaks or not by where its line gets to: its
        // block is measured (the others in it standing as their boxes). Told from
        // its placeholder in the page, it read the page's layout once a pass for
        // every such block (WebKit: the ledger's work 89 s to 170 s on the book),
        // and the text before a box that went down a line with it (Chinese before
        // an inline box) made a line of four read as three.
        if (boxes.some((box) => box.breaks)) return false;
        return place();
      };
      const placeFromFormulas = () => {
        for (let at = missing.length - 1; at >= 0; at -= 1) {
          if (placedFromFormulas(missing[at])) missing.splice(at, 1);
        }
      };
      if (facesSettled && formulaBoxesOn && missing.length > 0 && !inFlight) {
        if (!keptFormulasReady()) {
          applyTypesetMathPlaceholders(blocks, geometries, nodes);
          return false;
        }
        placeFromFormulas();
      }
      // What is known is placed now, whatever is still to measure.
      applyTypesetMathPlaceholders(blocks, geometries, nodes);
      if (missing.length === 0) {
        remeasureAll = false;
        return true;
      }
      if (inFlight) return false;
      if (!katexFontsReady(view.dom.ownerDocument, fontsSettled)) return false;
      inFlight = true;
      const startedEpoch = epoch;
      const cancelled = () => disposed || view.isDestroyed || epoch !== startedEpoch;
      /**
       * The in-line formulas of the blocks still to measure, each measured once
       * and alone: a copy of its preview in a paragraph of its place's font, in
       * the clone, read as a block's own formula is (isolateInlineFormula: its
       * line box and baseline; its width as it stands). A formula's box goes by
       * its key (ledgerFormulaBoxes: its source, attributes and the font of its
       * place), not by the words around it, so this is the box its block's
       * clone would read, without laying out the block's text, and once for
       * every block that repeats it (the book: 7,479 formulas, 4,573 kinds).
       * Only blocks every unread formula of which is in a plain paragraph,
       * in-line, and not one KaTeX or Word may break (data-word-math-lines):
       * a block with one that may break is laid out whole as before.
       * A trial until its boxes are compared with the blocks' own on a book
       * (`__docsMathFormulaVerify`): only with `window.__docsMathFormulasAlone = true`.
       * True when a batch went out.
       */
      const measureFormulasAlone = (): boolean => {
        const picks = new Map<number, { preview: HTMLElement; index: number }>();
        for (const index of missing) {
          if (picks.size >= formulasPerMeasure) break;
          const hashes = formulaHashes.get(index);
          const block = blocks[index];
          if (!hashes || hashes.length === 0 || block.tagName !== "P") continue;
          const previews = mathPreviews(block);
          if (previews.length !== hashes.length) continue;
          const unread: [number, HTMLElement][] = [];
          let eligible = true;
          hashes.forEach((formula, at) => {
            if (!eligible) return;
            if (formula !== null && (measuredFormulas.has(formula) || (!verifying && keptFormulaBox(formula)))) return;
            const preview = previews[at]!;
            if (formula === null || !formulaStandsAlone(preview, block)) {
              eligible = false;
              return;
            }
            unread.push([formula, preview]);
          });
          if (!eligible || unread.length === 0) continue;
          for (const [formula, preview] of unread) if (!picks.has(formula)) picks.set(formula, { preview, index });
        }
        if (picks.size === 0) return false;
        const chosen = [...picks.entries()];
        const doc = view.dom.ownerDocument;
        const win = doc.defaultView;
        if (!win) return false;
        const sources = chosen.map(([, { preview }]) => {
          const place = preview.parentElement ?? preview;
          const css = win.getComputedStyle(place);
          const paragraph = doc.createElement("p");
          const declarations = ALONE_FONT_PROPERTIES.map((name) => `${name}:${css.getPropertyValue(name)}`).join(";");
          paragraph.setAttribute("style", `${declarations};margin:0;padding:0;border:0;text-indent:0;white-space:nowrap`);
          const wrapper = place === preview ? null : (place.cloneNode(false) as HTMLElement);
          const copy = preview.cloneNode(true) as HTMLElement;
          if (wrapper) {
            wrapper.append(copy);
            paragraph.append(wrapper);
          } else paragraph.append(copy);
          return paragraph;
        });
        const families = chosen.map(([, { index }]) => familiesOfBlock(blocks[index]));
        const started = performance.now();
        let typesetAt = 0;
        let readLook: number | undefined;
        let readMs = 0;
        const read: ({ box: FormulaBox | null } | null)[] = chosen.map(() => null);
        const traceSink = (view.dom.ownerDocument.defaultView as (Window & { __pageLedgerTrace?: unknown[] }) | null)?.__pageLedgerTrace;
        void measureTypesetCloneBlockHeights(
          view.dom,
          cancelled,
          sources.map((_source, at) => at),
          undefined,
          "body",
          {
            parent: view.dom.parentElement ?? document.body,
            sourceBlocks: sources,
            sourceBlockWidths: sources.map(() => ALONE_BLOCK_WIDTH_PX),
            geometryOnly: true,
            onTypesetBatch: (clones) => {
              typesetAt = performance.now();
              const all = measureTypesetMathPlaceholderGeometriesForBlocks(clones);
              readMs = performance.now() - typesetAt;
              readLook = noteFacesAfterMeasure(view.dom.ownerDocument);
              clones.forEach((clone, at) => {
                const preview = mathPreviews(clone)[0];
                const geometry = all[at]?.[0];
                if (!preview || !geometry || all[at]!.length !== 1) return;
                read[at] = { box: formulaBoxOfMeasured(geometry, typesetFormulaBreaks(preview), formulaLeavesItsLine(preview)) };
              });
            },
          },
        )
          .then((heights) => {
            if (Array.isArray(traceSink)) {
              traceSink.push({ at: Date.now(), mathAlone: {
                formulas: chosen.length, read: read.filter((entry) => entry?.box).length,
                typesetMs: Math.round((typesetAt || performance.now()) - started), readMs: Math.round(readMs),
                cancelled: !heights || cancelled(),
              } });
            }
            if (!heights || cancelled()) return;
            const crossed = arrivals.filter((arrival) => arrival.at >= started);
            chosen.forEach(([formula], at) => {
              const box = read[at]?.box;
              if (!box || crossed.some((arrival) => meets(families[at], arrival.families))) return;
              const entry = { box, families: families[at]!, look: readLook };
              measuredFormulas.set(formula, entry);
              formulasToKeep.set(formula, entry);
            });
          })
          .catch(() => undefined)
          .finally(() => {
            inFlight = false;
            if (!disposed && !view.isDestroyed) onReady();
          });
        return true;
      };
      const measureNextBatch = () => {
      // A print's batches follow one another with no pass between: what the
      // last batch read may have told this one's formulas.
      if (allAtOnce && formulaBoxesOn) placeFromFormulas();
      if (missing.length === 0) {
        inFlight = false;
        if (!disposed && !view.isDestroyed) onReady();
        return;
      }
      // A block whose formulas still to read are all in-line ones that cannot
      // break has its formulas measured alone instead (measureFormulasAlone),
      // once each, and is placed from their boxes by the next pass.
      if (formulaBoxesOn && formulasAloneOn && measureFormulasAlone()) return;
      // Only the blocks to measure are copied into the measuring clone, a
      // bounded number of formulas at a time: their boxes are read in one
      // synchronous batch, and the book's first horizon read at once was a
      // 3 s task. The rest is measured by the passes that follow.
      const batch: number[] = [];
      let formulas = 0;
      for (const index of missing) {
        if (batch.length > 0 && formulas >= formulasPerMeasure) break;
        batch.push(index);
        const known = knownFormulas.get(index);
        const count = known
          ? known.filter((box) => !box || box.breaks).length
          : blocks[index].querySelectorAll(".math-block-preview,.inline-math-preview").length;
        formulas += Math.max(1, count);
      }
      const sourceBlocks = batch.map((index) => blocks[index]);
      const traceSink = (view.dom.ownerDocument.defaultView as (Window & { __pageLedgerTrace?: unknown[] }) | null)?.__pageLedgerTrace;
      const batchStarted = performance.now();
      const batchFamilies = batch.map((index) => familiesOfBlock(blocks[index]));
      let typesetAt = 0;
      let readLook: number | undefined;
      let readMs = 0;
      const keptBefore = missing.length;
      missing.splice(0, batch.length);
      const sourceWidths = batch.map((index) => widths[index]);
      const requestedIndexes = batch.map((_index, subsetIndex) => subsetIndex);
      const measured: (readonly LazyMathPlaceholderGeometry[] | null)[] = batch.map(() => null);
      /** Which of each block's formulas were typeset and read, and whether KaTeX
       * left places to break them. */
      const breaksMeasured: (readonly (boolean | null)[] | null)[] = batch.map(() => null);
      /** Which of them leave their line to the words (formulaLeavesItsLine). */
      const leavesMeasured: (readonly boolean[] | null)[] = batch.map(() => null);
      // Every block typeset in one clone and its formulas read in one batch
      // (geometryOnly): the ledger wants their boxes, not the blocks' heights.
      void measureTypesetCloneBlockHeights(
        view.dom,
        cancelled,
        requestedIndexes,
        undefined,
        "body",
        {
          parent: view.dom.parentElement ?? document.body,
          sourceBlocks,
          sourceBlockWidths: sourceWidths,
          geometryOnly: true,
          prepareClone: (clone, subsetIndex) => {
            const known = knownFormulas.get(batch[subsetIndex]);
            if (!known?.some((box) => box && !box.breaks)) return;
            mathPreviews(clone).forEach((preview, at) => {
              const box = known[at];
              if (!box || box.breaks) return;
              applyLazyMathPlaceholderGeometry(preview, box);
              preview.setAttribute(KNOWN_FORMULA_ATTR, "true");
            });
          },
          onTypesetBatch: (clones) => {
            typesetAt = performance.now();
            const all = measureTypesetMathPlaceholderGeometriesForBlocks(requestedIndexes.map((subsetIndex) => clones[subsetIndex]));
            readMs = performance.now() - typesetAt;
            readLook = noteFacesAfterMeasure(view.dom.ownerDocument);
            requestedIndexes.forEach((subsetIndex) => {
              const read = all[subsetIndex] ?? [];
              const known = knownFormulas.get(batch[subsetIndex]);
              let next = 0;
              const previews = mathPreviews(clones[subsetIndex]);
              const whole = previews.map((preview, at) =>
                preview.hasAttribute(KNOWN_FORMULA_ATTR) ? (known?.[at] as LazyMathPlaceholderGeometry) : read[next++]);
              measured[subsetIndex] = whole.every(Boolean) ? whole : null;
              breaksMeasured[subsetIndex] = previews.map((preview) =>
                preview.hasAttribute(KNOWN_FORMULA_ATTR) ? null : typesetFormulaBreaks(preview));
              leavesMeasured[subsetIndex] = previews.map((preview) =>
                !preview.hasAttribute(KNOWN_FORMULA_ATTR) && formulaLeavesItsLine(preview));
            });
          },
        },
      )
        .then((heights) => {
          if (Array.isArray(traceSink)) {
            traceSink.push({ at: Date.now(), mathBatch: {
              blocks: batch.length, formulas, missing: keptBefore,
              typesetMs: Math.round((typesetAt || performance.now()) - batchStarted),
              readMs: Math.round(readMs), cancelled: !heights || cancelled(),
            } });
          }
          if (!heights || cancelled()) return;
          const crossed = arrivals.filter((arrival) => arrival.at >= batchStarted);
          batch.forEach((index, subsetIndex) => {
            const key = keys[index];
            const geometry = measured[subsetIndex];
            const families = batchFamilies[subsetIndex];
            if (crossed.some((arrival) => meets(families, arrival.families))) return;
            if (key && geometry && geometry.length > 0) {
              geometryByKey.set(key, geometry);
              familiesByKey.set(key, families);
              if (readLook === undefined) lookByKey.delete(key);
              else lookByKey.set(key, readLook);
              nodeByKey.set(key, nodes[index]);
              if (staleNodes.has(nodes[index])) {
                staleNodes.delete(nodes[index]);
                staleCount = Math.max(0, staleCount - 1);
              }
              const lastingKey = lastingKeyFor(nodes[index], widths[index] ?? 0);
              if (lastingKey) toKeep.set(lastingKey, { boxes: geometry, families: [...families] });
              const hashes = formulaHashes.get(index);
              const breaks = breaksMeasured[subsetIndex];
              if (hashes && breaks && hashes.length === geometry.length) {
                hashes.forEach((formula, at) => {
                  const breaking = breaks[at];
                  if (formula === null || breaking === null) return;
                  const box = formulaBoxOfMeasured(geometry[at], breaking, leavesMeasured[subsetIndex]?.[at] === true);
                  if (!box) return;
                  if (verifying) {
                    const before = measuredFormulas.get(formula)?.box ?? keptFormulaBox(formula);
                    if (before && (
                      Math.abs(before.width - box.width) > FORMULA_VERIFY_TOLERANCE ||
                      Math.abs(before.height - box.height) > FORMULA_VERIFY_TOLERANCE ||
                      Math.abs(before.baselineDepth - box.baselineDepth) > FORMULA_VERIFY_TOLERANCE ||
                      before.breaks !== box.breaks
                    ) && verifying.length < 2000) {
                      const previews = mathPreviews(blocks[index]);
                      verifying.push({ latex: previews[at]?.getAttribute("data-math-render-latex"), before, box, block: blocks[index].tagName });
                    }
                  }
                  const entry = { box, families, look: readLook };
                  measuredFormulas.set(formula, entry);
                  formulasToKeep.set(formula, entry);
                });
              }
            }
          });
          const stats = switches.__docsMathFormulaStats;
          if (stats) {
            stats.clonedBlocks += batch.length;
            stats.typesetFormulas += formulas;
            stats.knownInClone += batch.reduce((sum, index) => sum + (knownFormulas.get(index)?.filter((box) => box && !box.breaks).length ?? 0), 0);
            stats.typesetMs += (typesetAt || performance.now()) - batchStarted;
            stats.readMs += readMs;
          }
        })
        .catch(() => undefined)
        .finally(() => {
          // Where nobody reads the pages each batch follows the last at once:
          // a pass in between costs more than the batch (a 300-page book
          // print: 47 batches, 30 of its 90 s).
          if (allAtOnce && missing.length > 0 && !cancelled()) {
            measureNextBatch();
            return;
          }
          inFlight = false;
          if (!disposed && !view.isDestroyed) onReady();
        });
      };
      measureNextBatch();
      return false;
    },
    invalidateFamilies(families, through = 0) {
      const arrived = new Set(families.map((family) => family.trim().replace(/^["']|["']$/g, "").toLowerCase()).filter(Boolean));
      if (arrived.size === 0) return;
      arrivals.push({ at: performance.now(), families: arrived });
      if (arrivals.length > 64) arrivals.splice(0, arrivals.length - 64);
      const formulasForgotten: number[] = [];
      for (const [formula, { families: drawnWith, look }] of measuredFormulas) {
        if (!meets(drawnWith, arrived)) continue;
        if (look !== undefined && look <= through) continue;
        measuredFormulas.delete(formula);
        formulasToKeep.delete(formula);
        if (formulasKeptHere.delete(formula)) formulasForgotten.push(formula);
      }
      if (formulasForgotten.length) forgetFormulaBoxes(formulasForgotten);
      const forgotten: string[] = [];
      for (const [key, node] of nodeByKey) {
        if (finalKeys.has(key) || !meets(familiesByKey.get(key), arrived)) continue;
        const look = lookByKey.get(key);
        if (look !== undefined && look <= through) continue;
        geometryByKey.delete(key);
        familiesByKey.delete(key);
        lookByKey.delete(key);
        nodeByKey.delete(key);
        if (!staleNodes.has(node)) {
          staleNodes.add(node);
          staleCount += 1;
        }
        const width = Number.parseFloat(key.split(":")[1] ?? "");
        const lastingKey = Number.isFinite(width) ? lastingKeyFor(node, width) : null;
        if (lastingKey) toKeep.delete(lastingKey);
        if (lastingKey && keptHere.delete(lastingKey)) forgotten.push(lastingKey);
      }
      if (forgotten.length) forgetMathGeometry(forgotten);
      if (staleCount > 0) settledSheets.clear();
    },
    invalidate() {
      epoch += 1;
      geometryByKey.clear();
      familiesByKey.clear();
      lookByKey.clear();
      nodeByKey.clear();
      finalKeys.clear();
      toKeep.clear();
      staleNodes = new WeakSet();
      staleCount = 0;
      // Measured under a typesetting now stale: not kept for the next opening
      // (what is measured again from here is).
      forgetMathGeometry(keptHere);
      keptHere.clear();
      measuredFormulas.clear();
      formulasToKeep.clear();
      forgetFormulaBoxes(formulasKeptHere);
      formulasKeptHere.clear();
      settledSheets.clear();
      remeasureAll = true;
    },
    dispose() {
      keepSettled();
      disposed = true;
      if (keepTimer !== null) clearTimeout(keepTimer);
      geometryByKey.clear();
      measuredFormulas.clear();
      settledSheets.disconnect();
    },
  };
}
