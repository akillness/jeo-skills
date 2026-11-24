/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** Source numbering facts are display inputs, never source authority or CSS.
 * Word's left-aligned numbering suffix advances to the next usable tab after
 * the measured label. Explicit stops suppress preceding default tab stops.
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.levelsuffix
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.defaulttabstop
 */
export interface DocumentNumberingLayout {
  version: 1;
  numId: number;
  level: 0;
  format: "decimal";
  levelText: "%1.";
  justification: "left";
  suffix: "tab" | "space" | "nothing";
  levelLeftTwips: number;
  levelHangingTwips: number;
  effectiveLeftTwips: number;
  effectiveHangingTwips: number;
  tabs: { positionTwips: number; kind: "left" | "num" }[];
  defaultTabStopTwips: number;
  markerRun: {
    fonts: { ascii: string; eastAsia?: string | null; cs?: string | null };
    fontSizeHalfPoints: number;
    

    bold: boolean;
    italic: boolean;
  };
}
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => key in value);
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const fontName = (value: unknown): value is string =>
  typeof value === "string" && value.trim() === value && value.length > 0 &&
  value.length <= 128 && !/[\u0000-\u001f\u007f;{}<>\\]/u.test(value);

/** Reject unknown fields, unsupported layouts, and stale direct indentation.
 * The caller separately proves an imported paragraph or paired continuation. */
export function readDocumentNumberingLayout(
  attrs: Record<string, unknown>,
): DocumentNumberingLayout | null {
  const source = object(attrs.source), raw = object(source?.numberingLayout);
  if (source?.adapter !== "docx" || source.nodeType !== "paragraph" || !raw ||
      attrs.dir === "rtl" || (attrs.textAlign != null && attrs.textAlign !== "left" && attrs.textAlign !== "start") ||
      !exact(raw, ["version", "numId", "level", "format", "levelText", "justification", "suffix",
        "levelLeftTwips", "levelHangingTwips", "effectiveLeftTwips", "effectiveHangingTwips",
        "tabs", "defaultTabStopTwips", "markerRun"]) ||
      raw.version !== 1 || raw.level !== 0 || raw.format !== "decimal" || raw.levelText !== "%1." ||
      raw.justification !== "left" || !["tab", "space", "nothing"].includes(String(raw.suffix)) ||
      !integer(raw.numId, 1, 2147483647) || !integer(raw.defaultTabStopTwips, 1, 31680)) return null;
  for (const key of ["levelLeftTwips", "levelHangingTwips", "effectiveLeftTwips", "effectiveHangingTwips"])
    if (!integer(raw[key], 0, 31680)) return null;
  if (typeof attrs.indentLeftPt !== "number" || typeof attrs.firstLineIndentPt !== "number" ||
      Math.abs(attrs.indentLeftPt * 20 - Number(raw.effectiveLeftTwips)) > 0.01 ||
      Math.abs(attrs.firstLineIndentPt * 20 + Number(raw.effectiveHangingTwips)) > 0.01) return null;
  if (!Array.isArray(raw.tabs) || raw.tabs.length > 50) return null;
  let previous = -1;
  for (const entry of raw.tabs) {
    const tab = object(entry);
    if (!tab || !exact(tab, ["positionTwips", "kind"]) ||
        !integer(tab.positionTwips, 0, 31680) || tab.positionTwips <= previous ||
        (tab.kind !== "left" && tab.kind !== "num")) return null;
    previous = tab.positionTwips;
  }
  if (!markerRun(raw.markerRun)) return null;
  return raw as unknown as DocumentNumberingLayout;
}

function markerRun(value: unknown): value is DocumentNumberingLayout["markerRun"] {
  const run = object(value), fonts = object(run?.fonts);
  return Boolean(run && exact(run, ["fonts", "fontSizeHalfPoints", "bold", "italic"]) &&
    typeof run.bold === "boolean" && typeof run.italic === "boolean" && integer(run.fontSizeHalfPoints, 2, 800) &&
    fonts && !Object.keys(fonts).some(key => !["ascii", "eastAsia", "cs"].includes(key)) &&
    fontName(fonts.ascii) && ![fonts.eastAsia, fonts.cs].some(name => name != null && !fontName(name)));
}

/** The run Word paints a list paragraph's marker with, at any level. Only
 * markers whose characters Word sets in the ascii face are described: Basic
 * Latin, and a symbol font's code points under a hint that keeps them there. */
export interface DocumentNumberingMarkerFact {
  version: 1;
  numId: number;
  level: number;
  format: "bullet" | "decimal" | "lowerLetter" | "upperLetter" | "lowerRoman" | "upperRoman";
  text: string;
  markerRun: DocumentNumberingLayout["markerRun"];
}

/** Number formats whose numbers are Basic Latin letters, described like
 * decimal ones since reading generation 329 (corpus R470-D37). */
const LETTER_MARKER_FORMATS = new Set(["lowerLetter", "upperLetter", "lowerRoman", "upperRoman"]);

export function readDocumentNumberingMarkerFact(
  attrs: Record<string, unknown>,
): DocumentNumberingMarkerFact | null {
  const source = object(attrs.source), raw = object(source?.numberingMarker);
  if (source?.adapter !== "docx" || source.nodeType !== "paragraph" || !raw ||
      !exact(raw, ["version", "numId", "level", "format", "text", "markerRun"]) ||
      raw.version !== 1 || !integer(raw.numId, 1, 2147483647) || !integer(raw.level, 0, 8) ||
      typeof raw.text !== "string" || Array.from(raw.text).length > 16 || !markerRun(raw.markerRun)) return null;
  const text = raw.text;
  if (raw.format === "decimal" || LETTER_MARKER_FORMATS.has(String(raw.format))) {
    if (!/^(?:%[1-9]|[\x20-\x24\x26-\x7e])+$/.test(text)) return null;
  } else if (raw.format !== "bullet" || !/^(?:[\x20-\x24\x26-\x7e]+|[\uf020-\uf0ff]+)$/u.test(text)) return null;
  return raw as unknown as DocumentNumberingMarkerFact;
}

/**
 * Where Word's tab after a left-aligned list number lands (twips from the
 * margin): the first stop after the number's end among the paragraph's
 * text indent (the hanging indent is a stop) and its own tab stops, else the
 * next default stop -- explicit stops suppress the default stops before
 * them. A number wider than the hanging indent so moves its text to the next
 * stop ("2nd.<tab>" at 0.25 in with a 0.25 in hanging goes to 1 in).
 * Verified against Word 16 for Mac's PDF of wp-lists/fmt.docx and geom.docx.
 */
export function numberingSuffixTabStopTwips(
  markerEndTwips: number,
  bodyTwips: number,
  tabStopsTwips: readonly number[],
  defaultTabStopTwips: number,
): number {
  const stops = [...new Set([bodyTwips, ...tabStopsTwips])].sort((a, b) => a - b);
  // A number that ends exactly on a stop keeps it, with a zero-width tab
  // (Word 16 for Mac: "1.1." of 18 pt under an 18 pt hanging indent puts
  // "Beta" at the indent). Half a twip absorbs measuring noise.
  const explicit = stops.find(stop => stop + 0.5 >= markerEndTwips);
  if (explicit !== undefined) return explicit;
  // A stated zero-length default tab stop advances by the least step.
  const interval = defaultTabStopTwips > 0 ? defaultTabStopTwips : defaultTabStopTwips === 0 ? 1 : 720;
  const last = Math.max(markerEndTwips, stops.at(-1) ?? 0);
  return (Math.floor(last / interval) + 1) * interval;
}

export function documentNumberingTabGeometry(
  layout: DocumentNumberingLayout,
  markerAdvancePx: number,
): { markerLeftPx: number; firstLineIndentPx: number } | null {
  // Space/nothing suffixes remain preserved source facts until independently
  // verified. This renderer implements only the proven tab suffix.
  if (layout.suffix !== "tab" || !Number.isFinite(markerAdvancePx) || markerAdvancePx <= 0) return null;
  const body = layout.effectiveLeftTwips;
  const markerLeft = body - layout.effectiveHangingTwips;
  const end = markerLeft + markerAdvancePx * 15;
  const next = numberingSuffixTabStopTwips(
    end,
    body,
    layout.tabs.map(tab => tab.positionTwips),
    layout.defaultTabStopTwips,
  );
  if (next > 31680 || next < body) return null;
  return { markerLeftPx: -layout.effectiveHangingTwips / 15, firstLineIndentPx: (next - body) / 15 };
}
