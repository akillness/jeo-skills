/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Reveal Formatting pane (Shift+F1 on Windows; Microsoft Support,
 * "Show or hide formatting marks and reveal formatting", "Find and fix
 * formatting inconsistencies"): the formatting of the selected text in
 * three groups -- Font, Paragraph, Section -- each line a property and its
 * value as the text is formatted (the style's values included, which is what
 * the reader sees), and "Compare to another selection", which lists what
 * differs between the first selection and the next.
 */
import { pxToPt, pxToPtRounded } from "../../../../lib/office-units";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import type { SectionBreakType } from "../extensions/SectionBreak";
import type { SectionLayout } from "./sectionLayouts";

export type RevealGroup = "font" | "paragraph" | "section";

/** Asks the document's host to open the pane (the Styles pane's button). */
export const DOCUMENT_REVEAL_FORMATTING_EVENT = "mrnote:document-reveal-formatting";

export interface RevealLine {
  readonly group: RevealGroup;
  /** i18n suffix of the property's label (`revealFormatting.prop_<key>`). */
  readonly key: string;
  /** The value as shown; an i18n key when `valueKey` is set. */
  readonly value: string;
  readonly valueKey?: boolean;
}

export interface RevealSnapshot {
  readonly sample: string;
  readonly lines: readonly RevealLine[];
}

const pt = (px: number): string => `${pxToPtRounded(px, 1)} pt`;

function hexColor(css: string): string | null {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(css);
  if (!match) return null;
  if (match[4] !== undefined && Number(match[4]) === 0) return null;
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function firstFamily(css: string): string {
  return (css.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}

/** The element drawing the document text at `pos`: the text before the
 * insertion point first, as the next typed character takes its formatting;
 * never a widget the editor draws (a formatting mark, a caret). */
function elementAt(view: EditorView, pos: number): HTMLElement | null {
  const isWidget = (element: Element | null) =>
    !element || element.closest('[contenteditable="false"], .mrnote-formatting-mark, .ProseMirror-widget') !== null;
  for (const side of [-1, 1] as const) {
    try {
      const { node, offset } = view.domAtPos(pos, side);
      if (node.nodeType === Node.TEXT_NODE) {
        if (!isWidget(node.parentElement)) return node.parentElement;
        continue;
      }
      const element = node as HTMLElement;
      const child = side < 0 ? element.childNodes[offset - 1] : element.childNodes[offset];
      const host = child?.nodeType === Node.TEXT_NODE ? child.parentElement : child instanceof HTMLElement ? child : null;
      if (host && !isWidget(host)) return host;
    } catch {
      // try the other side
    }
  }
  try {
    const { node } = view.domAtPos(pos);
    return node instanceof HTMLElement ? node : node.parentElement;
  } catch {
    return null;
  }
}

function lineSpacing(value: unknown): { value: string; valueKey?: boolean } {
  if (typeof value === "string" && value.trim()) {
    const raw = value.trim();
    const exact = /^(\d+(?:\.\d+)?)pt$/i.exec(raw);
    if (exact) return { value: `${exact[1]} pt` };
    const multiple = Number(raw);
    if (Number.isFinite(multiple)) {
      if (multiple === 1) return { value: "single", valueKey: true };
      if (multiple === 1.5) return { value: "oneAndHalf", valueKey: true };
      if (multiple === 2) return { value: "double", valueKey: true };
      return { value: `${Math.round(multiple * 100) / 100} li` };
    }
    return { value: raw };
  }
  return { value: "single", valueKey: true };
}

const ALIGNMENT: Record<string, string> = {
  left: "left",
  start: "left",
  center: "center",
  right: "right",
  end: "right",
  justify: "justify",
};

/** The formatting of the text at the selection's start, as drawn. */
export function readRevealFormatting(
  state: EditorState,
  view: EditorView,
  options: {
    readonly paragraphStyleName?: string | null;
    readonly section?: { readonly layout: SectionLayout | null; readonly start: SectionBreakType | null };
    readonly formatLength?: (twips: number) => string;
  } = {},
): RevealSnapshot {
  const { from, to, empty } = state.selection;
  const $from = state.doc.resolve(from);
  const block: ProseMirrorNode | null = $from.parent.isTextblock ? $from.parent : null;
  const sampleText = empty
    ? (block?.textContent ?? "").slice(Math.max(0, $from.parentOffset - 20), $from.parentOffset + 20)
    : state.doc.textBetween(from, Math.min(to, from + 120), " ", " ");
  const lines: RevealLine[] = [];
  const add = (group: RevealGroup, key: string, value: string, valueKey = false) =>
    lines.push({ group, key, value, ...(valueKey ? { valueKey: true } : {}) });

  // ---- Font: as the first character of the selection is drawn.
  const textElement = elementAt(view, empty ? from : Math.min(from + 1, to));
  const style = textElement ? getComputedStyle(textElement) : null;
  if (style) {
    add("font", "font", firstFamily(style.fontFamily));
    add("font", "size", pt(Number.parseFloat(style.fontSize) || 0));
    const weight = Number(style.fontWeight) || (style.fontWeight === "bold" ? 700 : 400);
    const italic = style.fontStyle === "italic" || style.fontStyle === "oblique";
    if (weight >= 600 || italic) add("font", "fontStyle", weight >= 600 && italic ? "boldItalic" : weight >= 600 ? "bold" : "italic", true);
    const decoration = style.textDecorationLine || style.textDecoration;
    if (/underline/.test(decoration)) add("font", "underline", style.textDecorationStyle === "double" ? "underlineDouble" : "underlineSingle", true);
    if (/line-through/.test(decoration)) add("font", "strikethrough", "yes", true);
    const color = hexColor(style.color);
    if (color && color !== "#000000") add("font", "color", color);
    let highlight: string | null = null;
    for (let element: HTMLElement | null = textElement; element && !highlight; element = element.parentElement) {
      if (element.matches(".ProseMirror, p, li, td, th, h1, h2, h3, h4, h5, h6")) break;
      highlight = hexColor(getComputedStyle(element).backgroundColor);
    }
    if (highlight) add("font", "highlight", highlight);
    const spacing = Number.parseFloat(style.letterSpacing);
    if (Number.isFinite(spacing) && Math.abs(spacing) > 0.05) {
      add("font", "spacing", `${spacing > 0 ? "+" : ""}${pt(spacing)}`);
    }
    if (style.fontVariantCaps === "small-caps" || style.fontVariant.includes("small-caps")) add("font", "caps", "smallCaps", true);
    else if (style.textTransform === "uppercase") add("font", "caps", "allCaps", true);
    if (style.verticalAlign === "super") add("font", "position", "superscript", true);
    else if (style.verticalAlign === "sub") add("font", "position", "subscript", true);
    // The text's own language (w:lang), not the page's.
    const tagged = textElement?.closest("[lang]");
    const language = tagged && view.dom.contains(tagged) ? tagged.getAttribute("lang") : null;
    if (language) add("font", "language", language);
  }

  // ---- Paragraph: its style, then what it draws with.
  if (block) {
    if (options.paragraphStyleName) add("paragraph", "style", options.paragraphStyleName);
    let blockElement: HTMLElement | null = null;
    try {
      const dom = view.nodeDOM($from.before());
      blockElement = dom instanceof HTMLElement ? dom : null;
    } catch {
      blockElement = null;
    }
    const blockStyle = blockElement ? getComputedStyle(blockElement) : null;
    const align = String(block.attrs.textAlign ?? blockStyle?.textAlign ?? "left");
    add("paragraph", "alignment", ALIGNMENT[align] ?? "left", true);
    const attrPt = (name: string): number | null =>
      typeof block.attrs[name] === "number" && Number.isFinite(block.attrs[name]) ? (block.attrs[name] as number) : null;
    const px = (value: string | undefined) => Number.parseFloat(value ?? "") || 0;
    const left = attrPt("indentLeftPt") ?? pxToPt(px(blockStyle?.marginLeft));
    const right = attrPt("indentRightPt") ?? pxToPt(px(blockStyle?.marginRight));
    const first = attrPt("firstLineIndentPt") ?? pxToPt(px(blockStyle?.textIndent));
    const ptText = (value: number) => `${Math.round(value * 10) / 10} pt`;
    add("paragraph", "indentLeft", ptText(left));
    add("paragraph", "indentRight", ptText(right));
    if (first > 0) add("paragraph", "indentFirstLine", ptText(first));
    else if (first < 0) add("paragraph", "indentHanging", ptText(-first));
    add("paragraph", "spaceBefore", ptText(attrPt("spaceBeforePt") ?? pxToPt(px(blockStyle?.marginTop))));
    add("paragraph", "spaceAfter", ptText(attrPt("spaceAfterPt") ?? pxToPt(px(blockStyle?.marginBottom))));
    const spacing = lineSpacing(block.attrs.lineHeight);
    add("paragraph", "lineSpacing", spacing.value, spacing.valueKey === true);
  }

  // ---- Section.
  const layout = options.section?.layout;
  if (layout) {
    const length = options.formatLength ?? ((twips: number) => `${Math.round((twips / 20) * 10) / 10} pt`);
    const margins = layout.pageMargins;
    add(
      "section",
      "margins",
      `${length(margins.topTwips)} / ${length(margins.bottomTwips)} / ${length(margins.leftTwips)} / ${length(margins.rightTwips)}`,
    );
    add("section", "paper", `${length(layout.pageSize.widthTwips)} × ${length(layout.pageSize.heightTwips)}`);
    add("section", "orientation", layout.pageSize.orientation, true);
    if (options.section?.start) add("section", "sectionStart", options.section.start, true);
    add("section", "verticalAlignment", layout.verticalAlignment ?? "top", true);
    if (layout.columns.count > 1) add("section", "columns", String(layout.columns.count));
  }
  return { sample: sampleText.trim(), lines };
}

/** Compare to another selection: each property whose value differs. */
export function compareRevealSnapshots(
  first: RevealSnapshot,
  second: RevealSnapshot,
): { group: RevealGroup; key: string; from: RevealLine | null; to: RevealLine | null }[] {
  const keyOf = (line: RevealLine) => `${line.group}:${line.key}`;
  const firstLines = new Map(first.lines.map((line) => [keyOf(line), line]));
  const secondLines = new Map(second.lines.map((line) => [keyOf(line), line]));
  const out: { group: RevealGroup; key: string; from: RevealLine | null; to: RevealLine | null }[] = [];
  for (const key of new Set([...firstLines.keys(), ...secondLines.keys()])) {
    const a = firstLines.get(key) ?? null;
    const b = secondLines.get(key) ?? null;
    if (a?.value === b?.value) continue;
    const [group, property] = key.split(":") as [RevealGroup, string];
    out.push({ group, key: property, from: a, to: b });
  }
  return out;
}
