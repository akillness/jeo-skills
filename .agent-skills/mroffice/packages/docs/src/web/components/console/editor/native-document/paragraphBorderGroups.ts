"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { querySheetsAll } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetMeasureMemo.ts";
import { plainTextEdits } from "@mrnote/core/web/components/console/editor/native-document/textblockOnlyEdits.ts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { measureOutsideEditorObservation } from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";

import {
  documentBorderLineCss,
  documentBorderLineIsVisible,
  normalizeDocumentParagraphBorders,
  stableDocumentParagraphBordersJson,
  type DocumentParagraphBorders,
} from "@mrnote/core/web/lib/document-borders.ts";

/**
 * Word draws paragraph borders per GROUP, not per paragraph (ECMA-376
 * 17.3.1.24 pBdr; what Word itself shows for a bordered list): consecutive
 * paragraphs with the same border settings share one box, so the box's top
 * edge is drawn only above the first of them, its bottom edge only below the
 * last, `between` is the rule drawn between two of them, and the left and
 * right edges run unbroken through the spacing between the paragraphs. A
 * numbered or bulleted paragraph's left edge stands left of its number
 * (the number position is the left indent less the hanging indent), so the
 * number is inside the box.
 *
 * Each paragraph renders its own CSS borders (DocumentFormatting), which
 * drew a separate box per paragraph, a side edge broken at every paragraph
 * gap, no `between` rule at all, and the number outside the box. This
 * plugin decorates the members of a group:
 *
 * - identical settings: the inner top/bottom edges are dropped and the
 *   `between` rule takes the inner top edge;
 * - the same left/right edges (documents written before the Borders menu set
 *   identical settings): the side edges are joined and `between` still
 *   draws the inner rules;
 * - a joined paragraph continues its side edges through the gap below it
 *   with a paint-only `::after` whose height is the measured gap, written to
 *   the plugin's own stylesheet (layout is never changed by it, and the
 *   editor's DOM is never written);
 * - a paragraph in a list item reaches left over its number by the list's
 *   hanging distance (`--doc-border-list-reach`, set per list flavour in
 *   note-editor.css).
 */

export const paragraphBorderGroupsKey = new PluginKey<DecorationSet>(
  "paragraphBorderGroups",
);

const CELL_TYPES = new Set(["tableCell", "tableHeader"]);
const LIST_ITEM_TYPES = new Set(["listItem", "taskItem"]);
const LIST_TYPES = new Set(["orderedList", "bulletList", "taskList"]);
const PAGE_TYPE = "pageBlock";

interface BorderedEntry {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  /** Visible paragraph borders, or null for a paragraph with shading only. */
  readonly borders: DocumentParagraphBorders | null;
  /** The paragraph's shading fill, or null. */
  readonly shading: string | null;
  readonly full: string;
  /**
   * The four outside edges alone. Word boxes two paragraphs together when
   * these match, whatever each one's `between` says, and draws the upper
   * one's `between` between them (corpus R83-D20, word-stops-text: a first
   * paragraph with a `between` rule over one with none is one box with the
   * rule; one with none over one with a rule is one box with no rule).
   */
  readonly box: string;
  readonly sides: string | null;
  readonly container: string;
  readonly inList: boolean;
  readonly externalLeft: boolean;
  /**
   * The paragraph's left and right edges: its own left/right indents and,
   * in a list, the nesting it sits at. Word boxes adjacent bordered
   * paragraphs together only when these are the same (a first-line or
   * hanging indent does not count); a level-2 item under a level-1 item is
   * a box of its own.
   */
  readonly edges: string;
}

function visible(borders: DocumentParagraphBorders, edge: keyof DocumentParagraphBorders): boolean {
  return documentBorderLineIsVisible(borders[edge]);
}

function boxKey(borders: DocumentParagraphBorders): string {
  return JSON.stringify(
    (["top", "left", "bottom", "right"] as const).map((edge) => (visible(borders, edge) ? borders[edge] : null)),
  );
}

function sidesKey(borders: DocumentParagraphBorders): string | null {
  if (!visible(borders, "left") && !visible(borders, "right")) return null;
  return JSON.stringify([
    visible(borders, "left") ? borders.left : null,
    visible(borders, "right") ? borders.right : null,
  ]);
}

/** A paragraph's shading fill as DocumentFormatting stores it (#rrggbb). */
function normalizeShadingFill(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

function pointValue(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function borderWidthCss(borders: DocumentParagraphBorders, edge: "left" | "right"): string {
  if (!visible(borders, edge)) return "0px";
  const css = documentBorderLineCss(borders[edge]);
  return css?.split(" ")[0] ?? "0px";
}

/** Mirrors DocumentFormatting's single-left-edge path (drawn outside by ::after). */
function drawsExternalLeft(node: ProseMirrorNode, borders: DocumentParagraphBorders): boolean {
  if (borders.left?.style !== "single" || !visible(borders, "left")) return false;
  if (["top", "right", "bottom", "between"].some((edge) => visible(borders, edge as keyof DocumentParagraphBorders))) {
    return false;
  }
  return (
    !pointValue(node.attrs.firstLineIndentPt) &&
    !node.attrs.textIndent &&
    node.attrs.contextualSpacing !== true
  );
}

/** Whether a textblock is drawn with borders or shading at all (entryFor's
 * own test, before where it stands is read). */
function textblockFramed(node: ProseMirrorNode): boolean {
  if (!("paragraphBorders" in node.attrs) && !("shadingColor" in node.attrs)) return false;
  const rawBorders = normalizeDocumentParagraphBorders(node.attrs.paragraphBorders);
  const bordered = Boolean(
    rawBorders &&
      stableDocumentParagraphBordersJson(rawBorders) &&
      Object.keys(rawBorders).some((edge) => visible(rawBorders, edge as keyof DocumentParagraphBorders)),
  );
  return bordered || Boolean(normalizeShadingFill(node.attrs.shadingColor));
}

/** Documents with no bordered or shaded textblock: no group, no decoration. */
const unframedDocuments = new WeakSet<ProseMirrorNode>();

/**
 * Whether `tr` may bring a bordered or shaded textblock into a document that
 * had none: one it inserts, or a step this cannot read (an attribute step).
 * A handwritten note's strokes landing brought none, and every landing read
 * the whole document's paragraphs again.
 */
function mayFrameTextblocks(tr: Transaction): boolean {
  for (const step of tr.steps) {
    if (!(step instanceof ReplaceStep) && !(step instanceof ReplaceAroundStep)) return true;
    let framed = false;
    (step as unknown as { slice: Slice }).slice.content.descendants((node) => {
      if (framed) return false;
      if (node.isTextblock && textblockFramed(node)) framed = true;
      return !framed;
    });
    if (framed) return true;
  }
  return false;
}

function entryFor(doc: ProseMirrorNode, node: ProseMirrorNode, pos: number): BorderedEntry | null {
  if (!("paragraphBorders" in node.attrs) && !("shadingColor" in node.attrs)) return null;
  const rawBorders = normalizeDocumentParagraphBorders(node.attrs.paragraphBorders);
  const rawFull = stableDocumentParagraphBordersJson(rawBorders);
  const bordered = Boolean(
    rawBorders &&
      rawFull &&
      Object.keys(rawBorders).some((edge) =>
        visible(rawBorders, edge as keyof DocumentParagraphBorders),
      ),
  );
  const borders = bordered ? rawBorders : null;
  const full = bordered ? rawFull! : "";
  const shading = normalizeShadingFill(node.attrs.shadingColor);
  if (!borders && !shading) return null;
  const $pos = doc.resolve(pos);
  let container = "flow";
  let inList = false;
  const lists: string[] = [];
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const ancestor = $pos.node(depth);
    if (LIST_ITEM_TYPES.has(ancestor.type.name)) inList = true;
    // Each list level the paragraph is nested in moves its text edge.
    if (LIST_TYPES.has(ancestor.type.name)) lists.push(ancestor.type.name);
    if (CELL_TYPES.has(ancestor.type.name)) {
      container = `cell:${$pos.before(depth)}`;
      break;
    }
  }
  return {
    pos,
    node,
    borders,
    shading,
    full,
    box: borders ? boxKey(borders) : "",
    sides: borders ? sidesKey(borders) : null,
    container,
    inList,
    externalLeft: borders ? drawsExternalLeft(node, borders) : false,
    edges: JSON.stringify([
      pointValue(node.attrs.indentLeftPt),
      pointValue(node.attrs.indentRightPt),
      lists,
    ]),
  };
}

/**
 * Textblocks in document order, with `null` wherever a group must break: a
 * page boundary, a paragraph without borders, or a block object between two
 * paragraphs (a table, a picture, a rule).
 */
function collectEntries(doc: ProseMirrorNode): Array<BorderedEntry | null> {
  const out: Array<BorderedEntry | null> = [];
  const visit = (node: ProseMirrorNode, pos: number): boolean => {
    if (node.isTextblock) {
      out.push(entryFor(doc, node, pos));
      return false;
    }
    if (node.isBlock && (node.isLeaf || node.isAtom)) {
      out.push(null);
      return false;
    }
    return true;
  };
  if (doc.firstChild?.type.name === PAGE_TYPE) {
    doc.forEach((page, offset) => {
      out.push(null);
      page.descendants((node, relative) => visit(node, offset + 1 + relative));
    });
  } else {
    doc.descendants(visit);
  }
  return out;
}

/** Same container, list state and left/right edges: one frame in Word. */
function sameFrame(upper: BorderedEntry, lower: BorderedEntry): boolean {
  return (
    upper.container === lower.container &&
    upper.inList === lower.inList &&
    upper.edges === lower.edges
  );
}

function linked(upper: BorderedEntry, lower: BorderedEntry): "same" | "sides" | null {
  if (!upper.borders || !lower.borders) return null;
  // Different left or right edges are separate boxes in Word, each with its
  // own top and bottom, even with identical border settings.
  if (!sameFrame(upper, lower)) return null;
  if (upper.full === lower.full || upper.box === lower.box) return "same";
  if (upper.sides !== null && upper.sides === lower.sides) return "sides";
  return null;
}

/*
 * The overrides are marks and custom properties only; note-editor.css draws
 * them (`data-border-group-top/bottom`, `data-border-list`). A decoration's
 * own border, padding or margin was taken off the paragraph again with the
 * decoration, and with it the paragraph's own inline border, padding and
 * indent: a member left alone when its group broke up lost its top edge and
 * its border spacing until it was drawn afresh (the WUA 030 pattern).
 */
export function paragraphBorderGroupDecorations(doc: ProseMirrorNode): DecorationSet {
  const entries = collectEntries(doc);
  if (entries.every((entry) => entry === null)) unframedDocuments.add(doc);
  const styles = new Map<BorderedEntry, string[]>();
  const attrs = new Map<BorderedEntry, Record<string, string>>();
  const style = (entry: BorderedEntry) => {
    let list = styles.get(entry);
    if (!list) styles.set(entry, (list = []));
    return list;
  };
  const attr = (entry: BorderedEntry) => {
    let record = attrs.get(entry);
    if (!record) attrs.set(entry, (record = {}));
    return record;
  };
  let link = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    attr(entry)["data-border-member"] = "true";
    const next = entries[index + 1] ?? null;
    const relation = next ? linked(entry, next) : null;
    const borders = entry.borders;
    let continues = false;
    if (next && relation && borders && next.borders) {
      if (relation === "same") {
        // One group: the box closes below its last member only.
        attr(entry)["data-border-group-bottom"] = "open";
      }
      const between = relation === "same"
        ? borders.between
        : visible(borders, "between") && visible(next.borders, "between")
          ? borders.between
          : undefined;
      if (between && documentBorderLineIsVisible(between)) {
        attr(next)["data-border-group-top"] = "between";
        style(next).push(
          `--doc-group-top-border:${documentBorderLineCss(between)}`,
          `--doc-group-top-padding:${pointValue(between.spacePt)}pt`,
        );
      } else if (relation === "same") {
        attr(next)["data-border-group-top"] = "open";
      }
      continues = entry.sides !== null && !entry.externalLeft;
    }
    // Word paints the space between two shaded paragraphs of one frame with
    // the upper one's shading (its fill runs on through the spacing); after
    // an unshaded paragraph, before one, or into a different indent, the
    // space stays blank.
    const fillsGap = Boolean(
      next && entry.shading && next.shading && sameFrame(entry, next) && !entry.externalLeft,
    );
    if (fillsGap) {
      continues = true;
      style(entry).push(`--doc-gap-fill:${entry.shading}`);
    }
    if (continues) {
      link += 1;
      attr(entry)["data-border-continue"] = String(link);
      style(entry).push(
        `--doc-border-left-w:${borders ? borderWidthCss(borders, "left") : "0px"}`,
        `--doc-border-right-w:${borders ? borderWidthCss(borders, "right") : "0px"}`,
      );
    }
    if (borders && entry.inList && entry.node.attrs.dir !== "rtl" && pointValue(entry.node.attrs.firstLineIndentPt) >= 0) {
      // Reach over the number: the box's left edge stands at the number
      // position (text position less the list's hanging distance), and as
      // for any paragraph, outside it by the edge's distance and width.
      const indent = pointValue(entry.node.attrs.indentLeftPt);
      const leftDrawn = !entry.externalLeft && visible(borders, "left");
      const space = leftDrawn ? pointValue(borders.left?.spacePt) : 0;
      const width = leftDrawn ? borderWidthCss(borders, "left") : "0px";
      attr(entry)["data-border-list"] = "true";
      style(entry).push(
        `--doc-group-list-margin-left:calc(${indent}pt - var(--doc-border-list-reach, 0px) - ${space}pt - ${width})`,
        `--doc-group-list-padding-left:calc(var(--doc-border-list-reach, 0px) + ${space}pt)`,
      );
    }
  }

  const decorations: Decoration[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    const entryStyles = styles.get(entry);
    const entryAttrs = attrs.get(entry);
    if (!entryStyles && !entryAttrs) continue;
    decorations.push(
      Decoration.node(entry.pos, entry.pos + entry.node.nodeSize, {
        ...(entryAttrs ?? {}),
        ...(entryStyles ? { style: entryStyles.join(";") } : {}),
      }),
    );
  }
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

/** The gap from a joined member to the next one, on the member itself. */
const GAP_PROPERTY = "--doc-border-gap-below";

/**
 * Measure each joined paragraph's gap to the next member (layout px) and
 * write it on that paragraph as an inline custom property, which the fixed
 * rule in note-editor.css reads.
 *
 * The gaps were a style sheet of their own, one per plugin view: appended
 * to the document when the view was built, rewritten when a gap changed and
 * removed when the view went. ProseMirror builds every plugin view again
 * whenever a plugin is registered (the floating toolbar, Find), and each
 * sheet added or removed restyles the whole page; in WebKit that is the
 * whole document, 300 ms and more on a long one. A property on one paragraph
 * restyles that paragraph, and nothing is written when no gap changed. A
 * paragraph drawn anew (its attributes changed) takes its gap at the next
 * measurement, in the frame its view update schedules, as before.
 */
class BorderGapView {
  private frame: number | null = null;
  private resize: ResizeObserver | null = null;

  constructor(private readonly view: EditorView) {
    if (typeof ResizeObserver !== "undefined") {
      this.resize = new ResizeObserver(() => this.schedule());
      this.resize.observe(view.dom);
    }
    this.schedule();
  }

  update() {
    this.schedule();
  }

  private schedule() {
    if (this.frame !== null) return;
    const window = this.view.dom.ownerDocument.defaultView;
    if (!window) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = null;
      this.measure();
    });
  }

  private measure() {
    if (!this.view.dom.isConnected || this.view.isDestroyed) return;
    const members = querySheetsAll(this.view.dom as HTMLElement, "[data-border-member]");
    const writes: Array<[HTMLElement, string | null]> = [];
    members.forEach((element, index) => {
      const current = element.style.getPropertyValue(GAP_PROPERTY);
      const below = members[index + 1];
      if (!element.hasAttribute("data-border-continue") || !below) {
        if (current !== "") writes.push([element, null]);
        return;
      }
      const upper = element.getBoundingClientRect();
      const lower = below.getBoundingClientRect();
      const scale = element.offsetHeight > 0 ? upper.height / element.offsetHeight : 1;
      const gap = `${Math.max(0, (lower.top - upper.bottom) / (scale || 1)).toFixed(2)}px`;
      if (current !== gap) writes.push([element, gap]);
    });
    if (!writes.length) return;
    // The paragraphs are ProseMirror's: a style write it saw would read as
    // an edit of their content.
    measureOutsideEditorObservation(this.view, () => {
      for (const [element, gap] of writes) {
        if (gap === null) element.style.removeProperty(GAP_PROPERTY);
        else element.style.setProperty(GAP_PROPERTY, gap);
      }
    });
  }

  destroy() {
    const window = this.view.dom.ownerDocument.defaultView;
    if (this.frame !== null) window?.cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
  }
}

export const ParagraphBorderGroups = Extension.create({
  name: "paragraphBorderGroups",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: paragraphBorderGroupsKey,
        state: {
          init: (_, state) => paragraphBorderGroupDecorations(state.doc),
          // Typing moves no paragraph's borders: the groups move with it.
          apply: (tr, value) => {
            if (!tr.docChanged) return value;
            if (plainTextEdits(tr)) return value.map(tr.mapping, tr.doc);
            // Still none to draw: nothing framed before, nothing framed brought.
            if (unframedDocuments.has(tr.before) && !mayFrameTextblocks(tr)) {
              unframedDocuments.add(tr.doc);
              return DecorationSet.empty;
            }
            return paragraphBorderGroupDecorations(tr.doc);
          },
        },
        props: {
          decorations: (state) => paragraphBorderGroupsKey.getState(state),
        },
        view: (view) => new BorderGapView(view),
      }),
    ];
  },
});

export default ParagraphBorderGroups;
