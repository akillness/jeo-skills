/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { plainTextEdits } from "@mrnote/core/web/components/console/editor/native-document/textblockOnlyEdits.ts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  OFFICE_WORD_DEFAULT_THEME_COLORS,
  officeWordThemeColorHex,
  type OfficeWordThemeColorName,
} from "@mrnote/core/web/lib/office-table-style-word.ts";

/**
 * A field result takes its paragraph style's character formatting.
 *
 * Word draws a field's result in the formatting of its result runs; an
 * unformatted result run is formatted by the paragraph style, like any run
 * (Word 16: the SEQ number of a Caption paragraph is italic 9pt in the
 * caption colour, the same as "Figure"). Imported text runs carry that
 * formatting as marks, but a field atom carries none, so it was drawn in the
 * document default (upright 11pt black) in the middle of the caption.
 *
 * This view-only decoration gives an unmarked field atom the run formatting
 * of its paragraph's imported style chain (`doc.attrs.styleDefinitions`):
 * italic / bold toggles, size and colour (a theme colour through
 * `documentThemeColors`). Nothing is persisted.
 */

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const FIELD_NODE_NAMES = new Set(["documentField"]);

function hexColor(value: unknown): string | null {
  return typeof value === "string" && /^#?[0-9a-fA-F]{6}$/.test(value.trim())
    ? `#${value.trim().replace(/^#/, "").toLowerCase()}`
    : null;
}

/** CSS for a paragraph style's run formatting, or null when it has none. */
export function paragraphStyleRunCss(
  docAttrs: Record<string, unknown>,
  styleId: unknown,
): string | null {
  if (typeof styleId !== "string" || !styleId) return null;
  const definitions = record(docAttrs.styleDefinitions);
  const rows = definitions?.version === 1 && Array.isArray(definitions.styles)
    ? definitions.styles.slice(0, 512)
    : [];
  const styles = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const style = record(row);
    if (style && typeof style.styleId === "string" && !styles.has(style.styleId)) {
      styles.set(style.styleId, style);
    }
  }
  const chain: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let current: string | null = styleId;
  while (current) {
    if (seen.has(current)) return null;
    seen.add(current);
    const style = styles.get(current);
    if (!style || style.type !== "paragraph") break;
    chain.unshift(style);
    current = typeof style.basedOn === "string" ? style.basedOn : null;
  }
  if (chain.length === 0) return null;
  let italic = false;
  let bold = false;
  let halfPoints: number | null = null;
  let color: Record<string, unknown> | null = null;
  for (const style of chain) {
    const rPr = record(style.rPr);
    if (!rPr) continue;
    // Word's toggle properties flip along a style chain.
    if (rPr.italic === true) italic = !italic;
    if (rPr.bold === true) bold = !bold;
    if (typeof rPr.fontSizeHalfPoints === "number" && rPr.fontSizeHalfPoints > 0) {
      halfPoints = rPr.fontSizeHalfPoints;
    }
    if (record(rPr.color)) color = record(rPr.color);
  }
  const css: string[] = [];
  if (italic) css.push("font-style:italic");
  if (bold) css.push("font-weight:700");
  if (halfPoints !== null && halfPoints <= 3276) css.push(`font-size:${halfPoints / 2}pt`);
  if (color) {
    // The theme colour with its tint / shade, as Word paints it and as the
    // ordinary text of the paragraph is imported; the literal `w:val` is the
    // fallback for a theme the document does not carry (a tint or shade on
    // a known theme colour used to drop to the literal, OFL-042).
    const themeColors = record(docAttrs.documentThemeColors);
    const base = typeof color.themeColor === "string" ? hexColor(themeColors?.[color.themeColor]) : null;
    const byte = (value: unknown) => (typeof value === "string" && /^[0-9A-Fa-f]{2}$/.test(value) ? value : undefined);
    const themed = base
      ? officeWordThemeColorHex(
          { theme: color.themeColor as OfficeWordThemeColorName, tint: byte(color.themeTint), shade: byte(color.themeShade) },
          { ...OFFICE_WORD_DEFAULT_THEME_COLORS, [color.themeColor as string]: base },
        )
      : null;
    const value = themed ?? hexColor(color.val);
    if (value) css.push(`color:${value}`);
  }
  return css.length > 0 ? css.join(";") : null;
}

/** Marks that place or annotate a run without formatting its text. */
const NON_FORMATTING_MARKS: ReadonlySet<string> = new Set([
  "bookmark",
  "link",
  "comment",
  "trackInsertion",
  "trackDeletion",
  "trackFormatting",
  "contentControl",
]);

/**
 * Whether a field wearing `marks` still takes its paragraph style's run
 * formatting: a mark that formats text (a colour, a size, bold) overrides
 * the style; a bookmark, a link, a comment, a revision or a content control
 * says nothing about its look (OFL-043). PURE.
 */
export function fieldKeepsStyleUnder(marks: readonly { type: { name: string } }[]): boolean {
  return marks.every((mark) => NON_FORMATTING_MARKS.has(mark.type.name));
}

function fieldDecorations(doc: ProseMirrorNode): DecorationSet {
  const docAttrs = doc.attrs as Record<string, unknown>;
  if (!record(docAttrs.styleDefinitions)) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  const cssByStyle = new Map<string, string | null>();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const styleId = node.attrs.docxStyleId;
    if (typeof styleId !== "string" || !styleId) return false;
    node.forEach((child, offset) => {
      // A mark that formats the field's own text (a colour, a size, bold)
      // overrides the style; a bookmark, a link, a comment or a revision
      // mark says nothing about its look and leaves the style in force
      // (adding a bookmark to the field used to drop its colour, OFL-043).
      if (!FIELD_NODE_NAMES.has(child.type.name) || !fieldKeepsStyleUnder(child.marks)) return;
      if (!cssByStyle.has(styleId)) cssByStyle.set(styleId, paragraphStyleRunCss(docAttrs, styleId));
      const css = cssByStyle.get(styleId);
      if (!css) return;
      const from = pos + 1 + offset;
      decorations.push(Decoration.node(from, from + child.nodeSize, { style: css }));
    });
    return false;
  });
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

const documentFieldStyleRunKey = new PluginKey<DecorationSet>("documentFieldStyleRun");

export function createDocumentFieldStyleRunPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: documentFieldStyleRunKey,
    state: {
      init: (_config, state) => fieldDecorations(state.doc),
      apply: (tr, previous, _old, state) => {
        if (!tr.docChanged) return previous;
        // Text typed beside a field changes no field (the edit takes none in or out).
        return plainTextEdits(tr) ? previous.map(tr.mapping, tr.doc) : fieldDecorations(state.doc);
      },
    },
    props: {
      decorations(state) {
        return documentFieldStyleRunKey.getState(state) ?? DecorationSet.empty;
      },
    },
  });
}
