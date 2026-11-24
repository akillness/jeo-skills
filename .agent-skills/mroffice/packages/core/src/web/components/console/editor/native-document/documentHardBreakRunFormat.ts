/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension, type JSONContent } from "@tiptap/core";
import { type Mark } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { AddMarkStep, Mapping, RemoveMarkStep } from "@tiptap/pm/transform";
import {
  normalizeFontFamily, normalizeFontSize, normalizeTextColor, AUTOMATIC_TEXT_COLOR,
  normalizeHighlightColor, normalizeCharSpacing, normalizeCharScale,
  fontFamilyWithCjkRenderFallback,
} from "../extensions/TextStyling";

import { normalizeWordFontHint, normalizeWordFontHintLanguage, normalizeWordFontHintCharset } from "../../../office-ribbon/officeFontScriptSlots";

import { normalizeOfficeFontFace, officeFontFaceStyle, registerOfficeFontFace } from "../../../office-ribbon/officeFontFace";

import { imeSafeAppendTransaction } from "./imeCompositionGuard";
import { UNDERLINE_STYLE_VALUES } from "./underlineStyles";

export const DOCX_BREAK_RUN_MARKS = "docxRunMarks";
/** Word's Text Wrapping break (`w:br w:clear`, ECMA-376 17.3.3.1): the
 * next line starts below the floating objects on the left, the right or
 * both sides -- CSS `clear` on the line break, which Chromium and WebKit
 * honour on `<br>`. */
export const DOCX_BREAK_CLEAR = "docxBreakClear";
const BREAK_CLEAR_CSS: Record<string, string> = { left: "left", right: "right", all: "both" };
const scalar = new Set(["bold", "italic", "strike", "subscript", "superscript", "hiddenText"]);
const fields: Record<string, readonly string[]> = {
  bold: ["value"],
  // Italic carries the same explicit value as bold ({value:false} switches off
  // a style's italic). Without it the carrier was refused and the whole
  
  // <w:i w:val="0"/> kept the preview on 正在准备文档… for good).
  italic: ["value"],
  fontFamily: ["family", "hint", "hintLanguage", "hintCharset", "face"],
  fontCjkFamily: ["family", "face"], fontComplexFamily: ["family", "face"], fontSize: ["size"],
  textColor: ["color"], highlight: ["color", "shading"], charSpacing: ["spacing"], charScale: ["scale"],
  underline: ["underlineStyle", "underlineColor"],
  proofingLanguage: ["val", "eastAsia", "bidi", "noProof"],
};

/** Formatting only: no links, review identities, XML, or source authority. */
export function normalizeDocxBreakRunMarks(value: unknown): JSONContent[] | null {
  if (value === null || value === undefined) return null;
  const fail = (): never => { throw new RangeError("Unsupported DOCX line-break run formatting"); };
  if (!Array.isArray(value) || value.length > 20) return fail();
  const seen = new Set<string>();
  const result = value.map(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail();
    if (Object.keys(raw).some(k => k !== "type" && k !== "attrs")) return fail();
    const type = raw.type;
    if (typeof type !== "string" || (!scalar.has(type) && !fields[type]) || seen.has(type)) return fail();
    seen.add(type);
    const rawAttrs = raw.attrs ?? {};
    if (typeof rawAttrs !== "object" || Array.isArray(rawAttrs)) return fail();
    const attrs = { ...rawAttrs };
    // A mark's schema default of `undefined` (fontFamily's hint, hintLanguage,
    // hintCharset: TextStyling) is no value: kept, it reached the shared
    // document, which the API reads as null, and every later save of the
    
    for (const key of Object.keys(attrs)) if (attrs[key] === undefined) delete attrs[key];
    // Use the same bounded identity as text runs. Asset references still go
    // through page-owned font authorization; the carrier grants no authority.
    if (type === "fontFamily" || type === "fontCjkFamily" || type === "fontComplexFamily") {
      if (attrs.face == null) delete attrs.face;
      else {
        const face = normalizeOfficeFontFace(attrs.face);
        if (!face) return fail();
        attrs.face = face;
      }
    }
    // A break's run keeps a theme colour's literal value only: the reference
    // (TextStyling's themeColor) recolours text runs on a theme change, and
    // the carrier stays the formatting-only contract the API accepts.
    if (type === "textColor") delete attrs.themeColor;
    const allowed = fields[type] ?? [];
    if ((type === "bold" || type === "italic") && attrs.value != null && typeof attrs.value !== "boolean") return fail();
    if (Object.keys(attrs).some(k => !allowed.includes(k))) return fail();
    if ((type === "fontFamily" || type === "fontCjkFamily" || type === "fontComplexFamily")
        && !normalizeFontFamily(attrs.family)) return fail();
    if (type === "fontFamily" && attrs.hint != null && !normalizeWordFontHint(attrs.hint)) return fail();
    if (type === "fontFamily" && attrs.hintLanguage != null && (!normalizeWordFontHint(attrs.hint) || !normalizeWordFontHintLanguage(attrs.hintLanguage))) return fail();
    if (type === "fontFamily" && attrs.hintCharset != null && (!normalizeWordFontHint(attrs.hint) || !normalizeWordFontHintCharset(attrs.hintCharset))) return fail();
    if (type === "fontSize") {
      // Stored as the px the editor draws (a Word "22pt" included), Word's
      // whole range 1pt-1638pt: the API takes exactly that form.
      const size = normalizeFontSize(attrs.size);
      if (!size) return fail();
      attrs.size = size;
    }
    // Word's Automatic colour is a run colour too (AUTOMATIC_TEXT_COLOR).
    if (type === "textColor" && attrs.color !== AUTOMATIC_TEXT_COLOR && !normalizeTextColor(attrs.color)) return fail();
    if (type === "highlight" && !normalizeHighlightColor(attrs.color)) return fail();
    if (type === "highlight" && attrs.shading != null && attrs.shading !== true) return fail();
    if (type === "charSpacing" && normalizeCharSpacing(attrs.spacing) === null) return fail();
    if (type === "charScale" && normalizeCharScale(attrs.scale) === null) return fail();
    if (type === "underline") {
      // Any line style a run's underline takes (Word's Font dialog list, "none" included: corpus R492-D20, a break in a
      // run of <w:u w:val="none"/> made the page fail to draw), as the API's carrier check reads it.
      if (attrs.underlineStyle != null && !(UNDERLINE_STYLE_VALUES as readonly unknown[]).includes(attrs.underlineStyle)) return fail();
      if (attrs.underlineColor != null && !normalizeTextColor(attrs.underlineColor)) return fail();
    }
    if (type === "proofingLanguage") {
      for (const key of ["val", "eastAsia", "bidi"]) {
        if (attrs[key] != null && (typeof attrs[key] !== "string" || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8}){0,5}$/.test(attrs[key]))) return fail();
      }
      if (attrs.noProof != null && typeof attrs.noProof !== "boolean") return fail();
    }
    return Object.keys(attrs).length ? { type, attrs: { ...attrs } } : { type };
  });
  if (seen.has("subscript") && seen.has("superscript")) return fail();
  return result;
}

// These are visual properties of the native break carrier. Inline font/color
// CSS would be consumed again by the DOM parser as new marks on the atom after
// Yjs has correctly retained only docxRunMarks. Keep the projection in custom
// properties, like the existing cell-background projection.
function renderRunMarks(marks: JSONContent[]): Record<string, string> {
  const output: Record<string, string> = {};
  const styles: string[] = [];
  for (const json of marks) {
    const attrs = json.attrs ?? {};
    if (json.type === "bold") styles.push(`--docs-break-font-weight:${attrs.value === false ? "400" : attrs.value === null ? "inherit" : "bold"}`);
    if (json.type === "italic") styles.push(`--docs-break-font-style:${attrs.value === false ? "normal" : attrs.value === null ? "inherit" : "italic"}`);
    if (json.type === "fontSize") styles.push(`--docs-break-font-size:${normalizeFontSize(attrs.size)}`);
    if (json.type === "fontFamily") {
      const face = normalizeOfficeFontFace(attrs.face);
      styles.push(face
        ? officeFontFaceStyle(face).replace(/^font-family:/, "--docs-break-font-family:")
        : `--docs-break-font-family:${fontFamilyWithCjkRenderFallback(normalizeFontFamily(attrs.family))}`);
      if (face) output["data-office-font-face"] = JSON.stringify(face);
    }
    if (json.type === "fontFamily" && attrs.hint) output["data-office-font-hint"] = normalizeWordFontHint(attrs.hint)!;
    if (json.type === "fontFamily" && attrs.hintLanguage) output["data-office-font-hint-language"] = normalizeWordFontHintLanguage(attrs.hintLanguage)!;
    if (json.type === "fontFamily" && attrs.hintCharset) output["data-office-font-hint-charset"] = normalizeWordFontHintCharset(attrs.hintCharset)!;
    if (json.type === "fontCjkFamily") {
      output["data-cjk-font-family"] = normalizeFontFamily(attrs.family)!;
      const face = normalizeOfficeFontFace(attrs.face);
      if (face) {
        registerOfficeFontFace(face);
        output["data-office-cjk-font-face"] = JSON.stringify(face);
      }
    }
    if (json.type === "fontComplexFamily") {
      output["data-cs-font-family"] = normalizeFontFamily(attrs.family)!;
      const face = normalizeOfficeFontFace(attrs.face);
      if (face) {
        registerOfficeFontFace(face);
        output["data-office-cs-font-face"] = JSON.stringify(face);
      }
    }
    if (json.type === "textColor" && attrs.color !== AUTOMATIC_TEXT_COLOR) styles.push(`--docs-break-color:${normalizeTextColor(attrs.color)}`);
    if (json.type === "highlight") styles.push(`--docs-break-background-color:${normalizeHighlightColor(attrs.color)}`);
    if (json.type === "hiddenText") output["data-hidden-text"] = "true";
    if (json.type === "proofingLanguage" && attrs.val) output.lang = attrs.val;
  }
  if (styles.length) output.style = styles.join(";");
  return output;
}

/** Yjs preserves element attributes, but not marks attached to inline atoms. */
export const DocumentHardBreakRunFormat = Extension.create({
  name: "documentHardBreakRunFormat",
  addGlobalAttributes() {
    return [{ types: ["hardBreak"], attributes: {
      [DOCX_BREAK_RUN_MARKS]: {
        default: null,
        parseHTML: element => {
          const encoded = element.getAttribute("data-docx-break-run-marks");
          if (encoded === null) return null;
          if (encoded.length > 8192) throw new RangeError("DOCX break format exceeds limit");
          return normalizeDocxBreakRunMarks(JSON.parse(encoded));
        },
        renderHTML: attrs => {
          const marks = normalizeDocxBreakRunMarks(attrs[DOCX_BREAK_RUN_MARKS]);
          return marks === null ? {} : {
            ...renderRunMarks(marks),
            "data-docx-break-run-marks": JSON.stringify(marks),
          };
        },
      },
      [DOCX_BREAK_CLEAR]: {
        default: null,
        parseHTML: element => {
          const value = element.getAttribute("data-docx-break-clear");
          return value && BREAK_CLEAR_CSS[value] ? value : null;
        },
        renderHTML: attrs => {
          const value = attrs[DOCX_BREAK_CLEAR];
          return typeof value === "string" && BREAK_CLEAR_CSS[value]
            ? { "data-docx-break-clear": value, style: `clear:${BREAK_CLEAR_CSS[value]}` }
            : {};
        },
      },
    } }];
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      // Follows mark steps onto styled breaks. A composition read carries no
      // mark step and the IME guard refuses every other local write while one
      // is live, so skipping loses nothing and cannot redraw the composing
      // line; remote edits arrive with the break attribute already set.
      appendTransaction: imeSafeAppendTransaction((transactions, _old, state) => {
        const steps = transactions.flatMap(tr => tr.steps);
        const maps = transactions.flatMap(tr => tr.mapping.maps);
        const updates = new Map<number, readonly Mark[]>();
        steps.forEach((step, index) => {
          if (!(step instanceof AddMarkStep) && !(step instanceof RemoveMarkStep)) return;
          if (!scalar.has(step.mark.type.name) && !fields[step.mark.type.name]) return;
          const mapping = new Mapping(maps.slice(index + 1));
          state.doc.nodesBetween(mapping.map(step.from), mapping.map(step.to), (node, pos) => {
            if (node.type.name !== "hardBreak" || node.attrs[DOCX_BREAK_RUN_MARKS] == null) return;
            const original = normalizeDocxBreakRunMarks(node.attrs[DOCX_BREAK_RUN_MARKS])!;
            const current = updates.get(pos) ?? original.map(mark => state.schema.markFromJSON(mark));
            updates.set(pos, step instanceof AddMarkStep ? step.mark.addToSet(current) : step.mark.removeFromSet(current));
          });
        });
        if (!updates.size) return null;
        const tr = state.tr;
        for (const [pos, marks] of updates) {
          const node = tr.doc.nodeAt(pos)!;
          const value = normalizeDocxBreakRunMarks(marks.map(mark => mark.toJSON()));
          if (JSON.stringify(value) !== JSON.stringify(node.attrs[DOCX_BREAK_RUN_MARKS])) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, [DOCX_BREAK_RUN_MARKS]: value }, node.marks);
          }
        }
        return tr.docChanged ? tr : null;
      }),
    })];
  },
});
