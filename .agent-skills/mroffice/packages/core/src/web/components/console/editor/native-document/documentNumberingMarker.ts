/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";
import { officeFontFaceFamily } from "../../../office-ribbon/officeFontFace";
import { measureOfficeGlyphBaselineOffset, type OfficeGlyphBaselineOptions } from "../../../office-ribbon/officeFontLineBox";
import type { DocumentDisplayFontPlan } from "./documentDisplayFonts";
import {
  readDocumentNumberingLayout,
  documentNumberingTabGeometry,
} from "./documentNumberingLayout";
import { listContinuationTypography } from "./listContinuationTypography";
import { wordNumberingLabelAdvancePx } from "./wordFontMetrics";
import {
  paginationTransformScale,
  clientRectInPaginationLayout,
} from "./paged/paginationGeometry";
import { measurementRange } from "./paged/measurementRange";
import { fragmentCarries } from "./paged/fragmentRoles";
import { pageTextWidth } from "../../../../lib/text-engine/page-adapter";

interface NodePaint {
  from: number;
  to: number;
  attrs: Readonly<Record<string, string>>;
}
export interface DocumentNumberingMarkerResult {
  complete: boolean;
  paragraph?: NodePaint;
  listItem?: NodePaint;
  measurement?: {
    label: string;
    family: string;
    fontSizePx: number;
    advancePx: number;
    baselinePx: number;
    topPx: number;
    firstLineIndentPx: number;
    markerLeftPx: number;
  };
  signature: string;
}
const skip = (): DocumentNumberingMarkerResult => ({
  complete: true,
  signature: "none",
});

/** A loaded CSS font face is usable only for characters in its declared range. */
export function numberingFontRangeCovers(range: string, text: string): boolean {
  const ranges: [number, number][] = [];
  for (const part of range.split(",")) {
    const match = /^\s*U\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?\s*$/i.exec(
      part,
    );
    if (!match || (match[2] && match[1].includes("?"))) return false;
    const first = match[1],
      wild = first.indexOf("?");
    if (wild >= 0 && !/^\?+$/.test(first.slice(wild))) return false;
    const low = parseInt(first.replace(/\?/g, "0"), 16),
      high = parseInt(match[2] ?? first.replace(/\?/g, "F"), 16);
    if (low > high || high > 0x10ffff) return false;
    ranges.push([low, high]);
  }
  return Array.from(text).every((char) =>
    ranges.some(
      ([low, high]) =>
        char.codePointAt(0)! >= low && char.codePointAt(0)! <= high,
    ),
  );
}

/** No document.fonts.check fallback: inspect exact named loaded face coverage. */
export function loadedNumberingFontFamily(
  doc: Document,
  family: string,
  label: string,
  variant: { readonly weight: "400" | "700"; readonly style: "normal" | "italic" } = { weight: "400", style: "normal" },
): boolean {
  if (!doc.fonts) return false;
  const familyFaces = [...doc.fonts].filter(
    (face) => face.family.replace(/^["']|["']$/g, "") === family,
  );
  // A registered companion of another weight cannot be selected by this
  // marker's own weight. Variable weight ranges overlapping it remain
  // ambiguous.
  const weights = variant.weight === "700" ? ["bold", "700"] : ["normal", "400"];
  if (familyFaces.some(face => face.style === variant.style &&
      !["normal", "bold"].includes(face.weight) && !/^\d{1,4}$/.test(face.weight))) return false;
  const matches = familyFaces.filter(face => face.style === variant.style &&
    weights.includes(face.weight) && ["normal", "100%"].includes(face.stretch));
  if (!matches.length) return false;
  // A competing variant or invalid range makes this font choice ambiguous.
  if (
    matches.some(
      (face) =>
        face.status !== "loaded" ||
        !weights.includes(face.weight) ||
        face.style !== variant.style ||
        !["normal", "100%"].includes(face.stretch) ||
        !numberingFontRangeCovers(face.unicodeRange, ""),
    )
  )
    return false;
  return Array.from(label).every((char) =>
    matches.some((face) => numberingFontRangeCovers(face.unicodeRange, char)),
  );
}

/** Source metadata is validated against current attrs and actual list ordinal.
 * Returned attributes are runtime node decorations only; no widget or source
 * mutation, and no scheduler outside the existing CJK measurement owner. */
export function documentNumberingMarker(input: {
  view: EditorView;
  element: HTMLElement;
  block: PmNode;
  displayAttrs?: PmNode["attrs"];
  fontPlan?: Pick<DocumentDisplayFontPlan, "byNameRole">;
  measurementCache?: Map<
    string,
    ReturnType<typeof measureOfficeGlyphBaselineOffset>
  >;
  /** Collect missing exact keys for this projection's synchronous batch. */
  deferredMeasurements?: Map<string,OfficeGlyphBaselineOptions>;
}): DocumentNumberingMarkerResult {
  const { view, element, block } = input,
    doc = element.ownerDocument,
    win = doc.defaultView;
  if (!win || element.tagName !== "P" || block.type.name !== "paragraph")
    return skip();
  const inherited = listContinuationTypography(view.state.doc).get(block);
  const attrs = inherited ?? block.attrs;
  if (input.displayAttrs && input.displayAttrs !== attrs) return skip();
  const layout = readDocumentNumberingLayout(attrs);
  if (!layout || layout.suffix !== "tab") return skip();
  let contentFrom: number;
  try {
    contentFrom = view.posAtDOM(element, 0);
  } catch {
    return skip();
  }
  const resolved = view.state.doc.resolve(contentFrom);
  if (resolved.parent !== block || resolved.depth < 3) return skip();
  const item = resolved.node(resolved.depth - 1),
    list = resolved.node(resolved.depth - 2);
  if (
    item.type.name !== "listItem" ||
    item.firstChild !== block ||
    list.type.name !== "orderedList" ||
    (list.attrs.listStyleType != null && list.attrs.listStyleType !== "decimal") ||
    // A defined or continued list numbers itself (listDefinitionMarkers.ts).
    list.attrs.listDefinition != null ||
    list.attrs.listContinue === true
  )
    return skip();
  for (let depth = 0; depth < resolved.depth - 2; depth++)
    if (
      [
        "orderedList",
        "bulletList",
        "taskList",
        "tableCell",
        "tableHeader",
      ].includes(resolved.node(depth).type.name)
    )
      return skip();
  const ordinal =
    Number(list.attrs.start ?? 1) + resolved.index(resolved.depth - 2);
  if (
    !Number.isInteger(ordinal) ||
    ordinal < -2147483648 ||
    ordinal > 2147483647
  )
    return skip();
  const itemFrom = resolved.before(resolved.depth - 1),
    paragraphFrom = contentFrom - 1;
  const tail =
    item.attrs.pageSplitItemContinuation === true ||
    !fragmentCarries("listLabel", block.attrs);
  if (tail) {
    if (!inherited) return skip();
    const paragraph = {
      from: paragraphFrom,
      to: paragraphFrom + block.nodeSize,
      attrs: {
        "data-docs-numbering-continuation": "true",
        style: "text-indent:0px !important",
      },
    };
    return {
      complete: true,
      paragraph,
      listItem: {
        from: itemFrom,
        to: itemFrom + item.nodeSize,
        attrs: { "data-docs-numbering-marker-host": "true" },
      },
      signature: `numbering-tail:${paragraphFrom}`,
    };
  }
  if (
    element.textContent !== block.textContent ||
    element.querySelector(
      "br,img,svg,canvas,math,input,[contenteditable=false],.ProseMirror-widget",
    )
  )
    return skip();
  let plain = true;
  block.forEach((child) => {
    if (!child.isText) plain = false;
  });
  if (!plain) return skip();
  const css = win.getComputedStyle(element);
  if (
    css.direction !== "ltr" ||
    (css.writingMode && css.writingMode !== "horizontal-tb") ||
    !["left", "start"].includes(css.textAlign)
  )
    return skip();
  const name = layout.markerRun.fonts.ascii,
    label = `${ordinal}.`,
    size = (layout.markerRun.fontSizeHalfPoints * 2) / 3;
  // Word sets the marker bold or italic when the level, the paragraph mark
  // or the style chain says so (the import resolves the toggles): its face
  // is that style's (Word 16.86: a bold Calibri 11 mark draws "1." in
  // Calibri Bold).
  const { bold, italic } = layout.markerRun;
  const role = bold && italic ? "boldItalic" : bold ? "bold" : italic ? "italic" : "regular";
  const variant = { weight: bold ? "700" : "400", style: italic ? "italic" : "normal" } as const;
  const planned = input.fontPlan?.byNameRole.get(
    `${name.toLowerCase()}\u0000${role}`,
  );
  if (
    planned &&
    (Object.keys(planned.axes).length ||
      planned.family.toLowerCase() !== name.toLowerCase())
  )
    return skip();
  const family = planned ? officeFontFaceFamily(planned) : name;
  // A loaded face is measured. Without one, Word's label width comes from the
  // recorded advances of the font Word uses; the label then paints in the
  // paragraph's own face after the named one.
  let advance: number;
  let recorded = false;
  if (loadedNumberingFontFamily(doc, family, label, variant)) {
    const canvas = doc.createElement("canvas").getContext("2d");
    if (!canvas) return { ...skip(), complete: false };
    canvas.font = `${variant.style} ${variant.weight} ${size}px ${JSON.stringify(family)}`;
    // The served face's own advances (lib/text-engine) where the engine knows it.
    advance = pageTextWidth("docs", label, canvas.font) ?? canvas.measureText(label).width;
  } else {
    const loading =
      doc.fonts &&
      [...doc.fonts].some(
        (face) =>
          face.family.replace(/^["']|["']$/g, "") === family &&
          face.status === "loading",
      );
    // The recorded advances are the regular face's.
    const known = planned || role !== "regular" ? null : wordNumberingLabelAdvancePx(name, label, size);
    if (loading || known === null) return { ...skip(), complete: !loading };
    advance = known;
    recorded = true;
  }
  const geometry = documentNumberingTabGeometry(layout, advance);
  if (!geometry) return skip();
  const scale = paginationTransformScale(element);
  if (!scale) return { ...skip(), complete: false };
  const paragraphRects = Array.from(element.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  if (paragraphRects.length !== 1)
    return { ...skip(), complete: paragraphRects.length > 1 };
  const paragraphBox = clientRectInPaginationLayout(paragraphRects[0], scale);
  const walker = doc.createTreeWalker(element, 4);
  let text: Text | null = null,
    offset = 0;
  while (walker.nextNode()) {
    const candidate = walker.currentNode as Text;
    const index = candidate.data.search(/\S/u);
    if (index >= 0) {
      text = candidate;
      offset = index;
      break;
    }
  }
  if (!text?.parentElement) return skip();
  const character = String.fromCodePoint(text.data.codePointAt(offset)!);
  const range = measurementRange(doc, "numberingMarker");
  range.setStart(text, offset);
  range.setEnd(text, offset + character.length);
  const actual = Array.from(range.getClientRects()).find(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  if (!actual) return { ...skip(), complete: false };
  try {
    const from = view.posAtDOM(text, offset);
    if (
      view.state.doc.textBetween(from, from + character.length, "", "") !==
      character
    )
      return skip();
  } catch {
    return skip();
  }
  const leaf = win.getComputedStyle(text.parentElement);
  const bodyFont = `${leaf.fontStyle} ${leaf.fontWeight} ${leaf.fontSize} ${leaf.fontFamily}`;
  const markerFamily = recorded
    ? `${JSON.stringify(family)}, ${leaf.fontFamily}`
    : JSON.stringify(family);
  const markerFont = `${variant.style} ${variant.weight} ${size}px ${markerFamily}`;
  const metric = (font: string, glyph: string, lineHeight = "normal") => {
    const key = JSON.stringify([font, glyph, lineHeight]);
    const cached = input.measurementCache?.get(key);
    if (cached) return cached;
    if(input.deferredMeasurements){
      input.deferredMeasurements.set(key,{font,character:glyph,lineHeight});
      return undefined;
    }
    const measured = measureOfficeGlyphBaselineOffset(doc, {
      font,
      character: glyph,
      lineHeight,
    });
    if (measured) input.measurementCache?.set(key, measured);
    return measured;
  };
  const bodyMetric = metric(bodyFont, character);
  const markerMetric = metric(markerFont, label[0], "0px");
  if (!bodyMetric || !markerMetric) return { ...skip(), complete: false };
  const baseline =
    actual.top / scale.y - paragraphBox.top + bodyMetric.glyphBaselineOffsetPx;
  const top = baseline - markerMetric.baselinePx;
  if (![advance, baseline, top].every(Number.isFinite))
    return { ...skip(), complete: false };
  const paint = {
    "data-docs-numbering-marker": "true",
    "data-docs-numbering-label": label,
    style: `position:relative;text-indent:${geometry.firstLineIndentPx}px !important;--docs-numbering-marker-left:${geometry.markerLeftPx}px;--docs-numbering-marker-top:${top}px;--docs-numbering-marker-font:${markerFamily};--docs-numbering-marker-size:${size}px${role === "regular" ? "" : `;--docs-numbering-marker-weight:${variant.weight};--docs-numbering-marker-style:${variant.style}`}`,
  };
  return {
    complete: true,
    paragraph: {
      from: paragraphFrom,
      to: paragraphFrom + block.nodeSize,
      attrs: paint,
    },
    listItem: {
      from: itemFrom,
      to: itemFrom + item.nodeSize,
      attrs: { "data-docs-numbering-marker-host": "true" },
    },
    measurement: {
      label,
      family,
      fontSizePx: size,
      advancePx: advance,
      baselinePx: baseline,
      topPx: top,
      ...geometry,
    },
    signature: `numbering:${paragraphFrom}:${itemFrom}:${label}:${paint.style}`,
  };
}
