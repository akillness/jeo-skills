/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Modify Style on a paragraph style the file brought (Home > Styles >
 * right-click > Modify, the Styles pane's Modify): the style's own Font group
 * -- font, size, colour, bold, italic, underline -- changes in the document's
 * style graph (`doc.attrs.styleDefinitions`, which the save writes into
 * styles.xml), and every paragraph in that style follows: each run whose
 * formatting was the style's takes the new value, a run formatted directly
 * keeps its own (Word: direct formatting wins over the style). The page
 * states a run's look on the run, so following is that change on each run.
 *
 * One implementation for the Styles pane's dialog and the AI's
 * `document.style.modify` (H98 B10).
 */

import type { Editor } from "@tiptap/core";

/** Word's "Heading" in the languages its built-in style names are shown in. */
export const HEADING_WORDS = new Set([
  "heading", "标题", "標題", "見出し", "제목", "titre", "überschrift", "título", "titolo", "заголовок",
  "kop", "rubrik", "nagłówek", "başlık", "tiêuđề", "judul", "หัวเรื่อง", "عنوان", "nadpis", "otsikko",
]);

export const compactStyleName = (value: string) => value.normalize("NFC").toLowerCase().replace(/\s+/g, "");

export type ImportedParagraphStyle = Record<string, unknown> & {
  styleId: string;
  name?: string;
  type?: string;
  rPr?: Record<string, unknown>;
};

/** The Font group fields a Modify Style changes; undefined = unchanged, null = removed. */
export interface ImportedStyleFontChange {
  fontFamily?: string | null;
  sizePt?: number | null;
  color?: string | null;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function importedParagraphStyles(editor: Editor): ImportedParagraphStyle[] {
  const definitions = (editor.state.doc.attrs as { styleDefinitions?: { styles?: unknown } }).styleDefinitions;
  const styles = (Array.isArray(definitions?.styles) ? definitions.styles : []) as ImportedParagraphStyle[];
  return styles.filter((style) => style && style.type === "paragraph" && typeof style.styleId === "string");
}

/** The imported Word paragraph style `name` names: by its name or id, or a
 *  heading level's name in Word's languages ("标题 1" is `heading 1`). */
export function importedParagraphStyleNamed(editor: Editor, name: string): ImportedParagraphStyle | null {
  const paragraphs = importedParagraphStyles(editor);
  const wanted = compactStyleName(name);
  const byName = paragraphs.find(
    (style) =>
      compactStyleName(style.styleId) === wanted ||
      (typeof style.name === "string" && compactStyleName(style.name) === wanted),
  );
  if (byName) return byName;
  const match = /^(.+?)(\d)$/.exec(wanted);
  if (!match || !HEADING_WORDS.has(match[1])) return null;
  const level = `heading${match[2]}`;
  return (
    paragraphs.find(
      (style) =>
        compactStyleName(style.styleId) === level ||
        (typeof style.name === "string" && compactStyleName(style.name) === level),
    ) ?? null
  );
}

export function importedParagraphStyleById(editor: Editor, styleId: string): ImportedParagraphStyle | null {
  return importedParagraphStyles(editor).find((style) => style.styleId === styleId) ?? null;
}

const px = (points: number) => `${Math.round(((points * 4) / 3) * 10000) / 10000}px`;
const pointsOf = (size: unknown): number | null => {
  const value = typeof size === "string" ? Number.parseFloat(size) : Number.NaN;
  if (!Number.isFinite(value)) return null;
  return typeof size === "string" && size.trim().endsWith("pt") ? value : (value * 3) / 4;
};
const bareFamily = (value: unknown) =>
  typeof value === "string" ? value.split(",")[0].trim().replace(/^['"]|['"]$/g, "").toLowerCase() : "";

/** The style's own Font group, as the Modify Style dialog shows it. */
export function importedStyleFontGroup(style: ImportedParagraphStyle): {
  fontFamily: string;
  sizePt: string;
  textColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
} {
  const rPr = (style.rPr ?? {}) as Record<string, unknown>;
  const fonts = (rPr.fonts ?? {}) as Record<string, unknown>;
  const color = (rPr.color as { val?: unknown } | undefined)?.val;
  return {
    fontFamily: typeof fonts.ascii === "string" ? fonts.ascii : typeof fonts.hAnsi === "string" ? fonts.hAnsi : "",
    sizePt: typeof rPr.fontSizeHalfPoints === "number" ? String(rPr.fontSizeHalfPoints / 2) : "",
    textColor: typeof color === "string" && /^[0-9a-f]{6}$/i.test(color) ? `#${color.toLowerCase()}` : "",
    bold: rPr.bold === true,
    italic: rPr.italic === true,
    underline: typeof rPr.underline === "string" && rPr.underline !== "none",
  };
}

/** Applies `change` to the imported paragraph style `styleId` and every
 *  paragraph in it, in one transaction; false when nothing would change or
 *  the style is not there. */
export function modifyImportedParagraphStyle(
  editor: Editor,
  styleId: string,
  change: ImportedStyleFontChange,
): boolean {
  const style = importedParagraphStyleById(editor, styleId);
  if (!style) return false;
  const doc = editor.state.doc;
  const definitions = (doc.attrs as { styleDefinitions?: Record<string, unknown> }).styleDefinitions;
  if (!definitions || !Array.isArray(definitions.styles)) return false;
  const before = (style.rPr ?? {}) as Record<string, unknown>;
  const rPr: Record<string, unknown> = { ...before };
  const oldColor =
    typeof (before.color as { val?: unknown } | undefined)?.val === "string"
      ? `#${String((before.color as { val: string }).val).toLowerCase()}`
      : null;
  const oldPoints = typeof before.fontSizeHalfPoints === "number" ? before.fontSizeHalfPoints / 2 : null;
  const oldFamily = bareFamily(((before.fonts ?? {}) as Record<string, unknown>).ascii);
  if (change.color !== undefined) {
    if (change.color === null) delete rPr.color;
    else rPr.color = { val: change.color.replace(/^#/, "").toUpperCase() };
  }
  if (change.sizePt !== undefined) {
    if (change.sizePt === null) {
      delete rPr.fontSizeHalfPoints;
      delete rPr.fontSizeCsHalfPoints;
    } else {
      const half = Math.round(change.sizePt * 2);
      rPr.fontSizeHalfPoints = half;
      rPr.fontSizeCsHalfPoints = half;
    }
  }
  if (change.fontFamily !== undefined) {
    // Word's Modify Style font box is the Latin text font (w:ascii / w:hAnsi);
    // the East Asian and complex-script faces stay the style's own.
    const fonts = { ...((before.fonts ?? {}) as Record<string, unknown>) };
    if (change.fontFamily === null) {
      delete fonts.ascii;
      delete fonts.hAnsi;
    } else {
      fonts.ascii = change.fontFamily;
      fonts.hAnsi = change.fontFamily;
      // A theme font named beside it wins over the face (ECMA-376 17.3.2.26:
      // w:ascii is ignored when w:asciiTheme is present), so the new face
      // takes the theme's place, as Word's Modify Style writes it (a Heading
      // 1 on +Headings kept drawing the theme font after the change).
      delete fonts.asciiTheme;
      delete fonts.hAnsiTheme;
    }
    if (Object.keys(fonts).length) rPr.fonts = fonts;
    else delete rPr.fonts;
  }
  if (change.bold !== undefined) rPr.bold = change.bold;
  if (change.italic !== undefined) rPr.italic = change.italic;
  if (change.underline !== undefined) {
    if (change.underline) rPr.underline = "single";
    else delete rPr.underline;
  }
  if (JSON.stringify(rPr) === JSON.stringify(before)) return false;
  const styles = (definitions.styles as ImportedParagraphStyle[]).map((item) =>
    item.styleId === style.styleId ? { ...item, rPr } : item,
  );
  const schema = editor.schema;
  const tr = editor.state.tr.setDocAttribute("styleDefinitions", { ...definitions, styles });
  doc.descendants((node, position) => {
    if (!node.isTextblock || (node.attrs as { docxStyleId?: unknown }).docxStyleId !== style.styleId) return true;
    node.forEach((child, offset) => {
      if (!child.isText) return;
      const from = position + 1 + offset;
      const to = from + child.nodeSize;
      const mark = (name: string) => child.marks.find((item) => item.type.name === name);
      if (change.color !== undefined && schema.marks.textColor) {
        const current = mark("textColor");
        const own = current && String(current.attrs.color ?? "").toLowerCase() !== (oldColor ?? "");
        if (!own) {
          tr.removeMark(from, to, schema.marks.textColor);
          if (change.color !== null) tr.addMark(from, to, schema.marks.textColor.create({ color: change.color.toLowerCase() }));
        }
      }
      if (change.sizePt !== undefined && schema.marks.fontSize) {
        const current = mark("fontSize");
        const points = current ? pointsOf(current.attrs.size) : null;
        const own = current && (oldPoints === null || points === null || Math.abs(points - oldPoints) > 0.05);
        if (!own) {
          tr.removeMark(from, to, schema.marks.fontSize);
          if (change.sizePt !== null) tr.addMark(from, to, schema.marks.fontSize.create({ size: px(change.sizePt) }));
        }
      }
      if (change.fontFamily !== undefined && schema.marks.fontFamily) {
        const current = mark("fontFamily");
        const own = current && bareFamily(current.attrs.family) !== oldFamily;
        if (!own) {
          tr.removeMark(from, to, schema.marks.fontFamily);
          if (change.fontFamily !== null) {
            tr.addMark(from, to, schema.marks.fontFamily.create({ family: `"${change.fontFamily}"` }));
          }
        }
      }
      for (const [field, markName] of [["bold", "bold"], ["italic", "italic"], ["underline", "underline"]] as const) {
        const wanted = change[field];
        const type = schema.marks[markName];
        if (wanted === undefined || !type) continue;
        const current = mark(markName);
        // A direct choice (bold's value true/false) is the run's own.
        if (current && typeof current.attrs.value === "boolean") continue;
        if (wanted && !current) tr.addMark(from, to, type.create());
        if (!wanted && current) tr.removeMark(from, to, type);
      }
    });
    return false;
  });
  editor.view.dispatch(tr);
  return true;
}
