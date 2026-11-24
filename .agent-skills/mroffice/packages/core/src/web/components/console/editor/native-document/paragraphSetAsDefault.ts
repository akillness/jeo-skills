/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's Paragraph dialog > Set As Default > "This document only".
 *
 * Word writes the dialog's formatting into the document's Normal style (the
 * default paragraph style every unstyled paragraph uses and every built-in
 * style is based on). Paragraphs that take a property from Normal reflow;
 * a paragraph's direct formatting and a property a style between it and
 * Normal states itself are left as they are (ECMA-376 §17.7.2: docDefaults,
 * then the basedOn chain, then direct formatting).
 *
 * MRAI keeps that formatting in two places:
 *
 *  - An IMPORTED Word document carries its style graph (`styleDefinitions`)
 *    and the RESOLVED formatting of each paragraph on the paragraph itself.
 *    The default paragraph style's `pPr` is changed (save-back writes it into
 *    `word/styles.xml`), the doc-level mirrors the importer reads back from
 *    Normal are restated, and each paragraph whose value came from Normal is
 *    given the new resolved value.
 *  - A document written in MRAI has no style graph: its paragraphs inherit
 *    the doc-level defaults (`defaultTextAlign`, `defaultParagraphSpace*`,
 *    `defaultLineHeight`, `defaultIndent*`), which the exporter writes into
 *    the Normal style. Properties MRAI documents keep only per paragraph
 *    (line-and-page-break and Asian typography options, an exact line height)
 *    are reported back as not carried.
 *
 * One transaction, so one undo step.
 */

import type { Node as PmNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import {
  normalizeLineHeight,
  normalizeLineHeightPt,
  normalizeLineHeightRule,
  normalizeSpacing,
} from "../extensions/DocumentFormatting";
import {
  normalizeDocumentDefaultTextAlign,
  normalizeStyleDefinitions,
} from "../extensions/DocumentPageSetup";
import {
  MAX_INDENT_PT,
  normalizeFirstLineIndentPt,
  normalizeIndentPt,
} from "./preciseIndent";

export type ParagraphDefaultAlign = "left" | "center" | "right" | "justify" | "distribute";

export type ParagraphDefaultLineSpacing =
  | { rule: "multiple"; multiple: number }
  | { rule: "exact" | "atLeast"; points: number };

/** The on/off options of the dialog Normal can carry (Word's `pPr` toggles). */
export const PARAGRAPH_DEFAULT_TOGGLES = [
  "keepNext",
  "keepLines",
  "pageBreakBefore",
  "widowControl",
  "contextualSpacing",
  "mirrorIndents",
  "suppressLineNumbers",
  "suppressAutoHyphens",
  "snapToGrid",
  "wordWrap",
  "kinsoku",
  "overflowPunct",
  "topLinePunct",
] as const;

export type ParagraphDefaultToggle = (typeof PARAGRAPH_DEFAULT_TOGGLES)[number];

/**
 * The dialog's state as Set As Default writes it. A field left undefined is
 * one the dialog shows blank (a selection whose paragraphs differ): Word
 * leaves that property of Normal as it is.
 */
export interface ParagraphDefaultFormat {
  align?: ParagraphDefaultAlign;
  indentLeftPt?: number;
  indentRightPt?: number;
  /** Positive: first line; negative: hanging; 0: none. */
  firstLineIndentPt?: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  lineSpacing?: ParagraphDefaultLineSpacing;
  toggles?: Partial<Record<ParagraphDefaultToggle, boolean>>;
}

export type ParagraphDefaultField =
  | "align"
  | "indentLeftPt"
  | "indentRightPt"
  | "firstLineIndentPt"
  | "spaceBeforePt"
  | "spaceAfterPt"
  | "lineSpacing"
  | ParagraphDefaultToggle;

export interface ParagraphDefaultResult {
  /** Whether anything was written to the transaction. */
  changed: boolean;
  /** Fields that differ from the document's default but it cannot keep. */
  notCarried: ParagraphDefaultField[];
}

/** Word's own value of a toggle no style states (the editor's null). */
const TOGGLE_WORD_DEFAULT: Record<ParagraphDefaultToggle, boolean> = {
  keepNext: false,
  keepLines: false,
  pageBreakBefore: false,
  // The editor reads an unstated widow control as Word's default ON.
  widowControl: true,
  contextualSpacing: false,
  mirrorIndents: false,
  suppressLineNumbers: false,
  suppressAutoHyphens: false,
  snapToGrid: true,
  wordWrap: true,
  kinsoku: true,
  overflowPunct: true,
  topLinePunct: false,
};

const LIST_CONTAINERS = new Set(["listItem", "taskItem"]);
const TEXT_BLOCKS = new Set(["paragraph", "heading"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function twips(points: number): number {
  return Math.round(points * 20);
}

function sameNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  return Math.abs((a ?? 0) - (b ?? 0)) < 0.05;
}

function sameLine(
  a: ParagraphDefaultLineSpacing | null,
  b: ParagraphDefaultLineSpacing | null,
): boolean {
  if (!a || !b) return a === b;
  if (a.rule === "multiple" || b.rule === "multiple") {
    return a.rule === b.rule && Math.abs(
      (a as { multiple: number }).multiple - (b as { multiple: number }).multiple,
    ) < 0.005;
  }
  return a.rule === b.rule && sameNumber(a.points, b.points);
}

/* ------------------------------------------------------------------------ */
/* Word's style cascade over the imported style graph                        */
/* ------------------------------------------------------------------------ */

type PprReader = (ppr: Record<string, unknown>) => unknown;

/** Each property Normal can carry, read out of one `pPr` model (undefined: not stated). */
const PPR_READERS: Record<Exclude<ParagraphDefaultField, "align"> | "align", PprReader> = {
  align: (ppr) => alignFromJc(ppr.alignment),
  spaceBeforePt: (ppr) => twipsPoints(record(ppr.spacing)?.beforeTwips),
  spaceAfterPt: (ppr) => twipsPoints(record(ppr.spacing)?.afterTwips),
  lineSpacing: (ppr) => {
    const spacing = record(ppr.spacing);
    const line = spacing?.lineTwips;
    if (typeof line !== "number") return undefined;
    const rule = spacing?.lineRule;
    if (rule === "exact" || rule === "atLeast") return { rule, points: line / 20 };
    return { rule: "multiple", multiple: line / 240 };
  },
  indentLeftPt: (ppr) => {
    const indent = record(ppr.indent);
    return twipsPoints(indent?.leftTwips ?? indent?.startTwips);
  },
  indentRightPt: (ppr) => {
    const indent = record(ppr.indent);
    return twipsPoints(indent?.rightTwips ?? indent?.endTwips);
  },
  firstLineIndentPt: (ppr) => {
    const indent = record(ppr.indent);
    // `w:hanging` wins over `w:firstLine` when both are stated (§17.3.1.12).
    const hanging = twipsPoints(indent?.hangingTwips);
    if (hanging !== undefined) return -hanging;
    return twipsPoints(indent?.firstLineTwips);
  },
  ...Object.fromEntries(
    PARAGRAPH_DEFAULT_TOGGLES.map((key) => [
      key,
      (ppr: Record<string, unknown>) => (typeof ppr[key] === "boolean" ? ppr[key] : undefined),
    ]),
  ),
} as Record<ParagraphDefaultField, PprReader>;

function twipsPoints(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value / 20 : undefined;
}

function alignFromJc(value: unknown): ParagraphDefaultAlign | undefined {
  switch (String(value ?? "").toLowerCase()) {
    case "left":
    case "start":
      return "left";
    case "center":
      return "center";
    case "right":
    case "end":
      return "right";
    case "both":
      return "justify";
    case "distribute":
      return "distribute";
    default:
      return undefined;
  }
}

const JC_FOR_ALIGN: Record<ParagraphDefaultAlign, string> = {
  left: "left",
  center: "center",
  right: "right",
  justify: "both",
  distribute: "distribute",
};

interface StyleGraph {
  byId: Map<string, Record<string, unknown>>;
  normalId: string;
  docDefaultsPpr: Record<string, unknown> | null;
}

function styleGraph(definitions: Record<string, unknown>): StyleGraph | null {
  const styles = Array.isArray(definitions.styles) ? definitions.styles : [];
  const byId = new Map<string, Record<string, unknown>>();
  let normalId: string | null = null;
  for (const raw of styles) {
    const style = record(raw);
    if (!style || typeof style.styleId !== "string") continue;
    byId.set(style.styleId, style);
    if (style.type === "paragraph" && style.default === true && normalId === null) {
      normalId = style.styleId;
    }
  }
  if (normalId === null && byId.get("Normal")?.type === "paragraph") normalId = "Normal";
  if (normalId === null) return null;
  return {
    byId,
    normalId,
    docDefaultsPpr: record(record(definitions.docDefaults)?.pPr),
  };
}

/** Normal's value of `field`, else the document defaults', else Word's. */
function normalValue(graph: StyleGraph, field: ParagraphDefaultField): unknown {
  const normal = record(graph.byId.get(graph.normalId)?.pPr);
  const read = PPR_READERS[field];
  const own = normal ? read(normal) : undefined;
  if (own !== undefined) return own;
  const base = graph.docDefaultsPpr ? read(graph.docDefaultsPpr) : undefined;
  if (base !== undefined) return base;
  return wordDefault(field);
}

function wordDefault(field: ParagraphDefaultField): unknown {
  if (field === "align") return "left";
  if (field === "lineSpacing") return { rule: "multiple", multiple: 1 };
  if ((PARAGRAPH_DEFAULT_TOGGLES as readonly string[]).includes(field)) {
    return TOGGLE_WORD_DEFAULT[field as ParagraphDefaultToggle];
  }
  return 0;
}

/**
 * Where a paragraph of style `styleId` takes `field` from: `"normal"` when
 * the basedOn chain reaches the default paragraph style without any style on
 * the way stating it, otherwise the value the first style stating it gives
 * (`{ value }`), or `{ value: undefined }` for a chain not based on Normal
 * (it resolves through docDefaults alone).
 */
function chainSource(
  graph: StyleGraph,
  styleId: string,
  field: ParagraphDefaultField,
): "normal" | { value: unknown } {
  const read = PPR_READERS[field];
  const seen = new Set<string>();
  let current: string | undefined = styleId;
  while (current && !seen.has(current) && seen.size < 32) {
    if (current === graph.normalId) return "normal";
    seen.add(current);
    const style = graph.byId.get(current);
    if (!style) break;
    const ppr = record(style.pPr);
    const value = ppr ? read(ppr) : undefined;
    if (value !== undefined) return { value };
    current = typeof style.basedOn === "string" ? style.basedOn : undefined;
  }
  const base = graph.docDefaultsPpr ? PPR_READERS[field](graph.docDefaultsPpr) : undefined;
  return { value: base ?? wordDefault(field) };
}

function paragraphStyleId(node: PmNode, graph: StyleGraph): string {
  const attrs = node.attrs as Record<string, unknown>;
  const own = attrs.docxStyleId;
  if (typeof own === "string" && graph.byId.has(own)) return own;
  const sourceStyle = record(attrs.source)?.styleId;
  if (typeof sourceStyle === "string" && graph.byId.has(sourceStyle)) return sourceStyle;
  return graph.normalId;
}

/* ------------------------------------------------------------------------ */
/* Reading and writing one paragraph's resolved value                        */
/* ------------------------------------------------------------------------ */

type PageAttrs = Record<string, unknown>;

/** The paragraph's own value of `field` as the page stores it (null: unstated). */
function pageValue(attrs: PageAttrs, field: ParagraphDefaultField): unknown {
  switch (field) {
    case "spaceBeforePt":
      return normalizeSpacing(attrs.spaceBefore);
    case "spaceAfterPt":
      return normalizeSpacing(attrs.spaceAfter);
    case "lineSpacing": {
      const points = normalizeLineHeightPt(attrs.lineHeightPt);
      const rule = normalizeLineHeightRule(attrs.lineHeightRule);
      if (points !== null && (rule === "exact" || rule === "atLeast")) {
        return { rule, points };
      }
      const multiple = normalizeLineHeight(attrs.lineHeight);
      return multiple === null ? null : { rule: "multiple", multiple: Number(multiple) };
    }
    case "indentLeftPt":
      return normalizeIndentPt(attrs.indentLeftPt) ?? 0;
    case "indentRightPt":
      return normalizeIndentPt(attrs.indentRightPt) ?? 0;
    case "firstLineIndentPt":
      return normalizeFirstLineIndentPt(attrs.firstLineIndentPt) ?? 0;
    case "align":
      return attrs.textAlign ?? null;
    default: {
      const value = attrs[field];
      return typeof value === "boolean" ? value : TOGGLE_WORD_DEFAULT[field];
    }
  }
}

function sameValue(field: ParagraphDefaultField, a: unknown, b: unknown): boolean {
  if (field === "lineSpacing") {
    return sameLine(
      (a as ParagraphDefaultLineSpacing | null) ?? null,
      (b as ParagraphDefaultLineSpacing | null) ?? null,
    );
  }
  if (typeof a === "number" || typeof b === "number") {
    return sameNumber(a as number | null, b as number | null);
  }
  return a === b;
}

/** The attrs that state `value` of `field` on a paragraph. */
function pageAttrsFor(field: ParagraphDefaultField, value: unknown): PageAttrs {
  switch (field) {
    case "spaceBeforePt":
      return { spaceBefore: normalizeSpacing(value) };
    case "spaceAfterPt":
      return { spaceAfter: normalizeSpacing(value) };
    case "lineSpacing": {
      const line = value as ParagraphDefaultLineSpacing;
      if (line.rule === "multiple") {
        return {
          lineHeight: normalizeLineHeight(roundRatio(line.multiple)),
          lineHeightPt: null,
          lineHeightRule: null,
        };
      }
      return {
        lineHeight: null,
        lineHeightPt: normalizeLineHeightPt(line.points),
        lineHeightRule: line.rule,
      };
    }
    case "indentLeftPt":
      return { indentLeftPt: normalizeIndentPt(value) };
    case "indentRightPt":
      return { indentRightPt: normalizeIndentPt(value) };
    case "firstLineIndentPt":
      return { firstLineIndentPt: normalizeFirstLineIndentPt(value) };
    default:
      return { [field]: value };
  }
}

function roundRatio(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/* ------------------------------------------------------------------------ */
/* Normal's pPr model                                                        */
/* ------------------------------------------------------------------------ */

function writeNormalPpr(
  ppr: Record<string, unknown>,
  field: ParagraphDefaultField,
  value: unknown,
): void {
  switch (field) {
    case "align":
      ppr.alignment = JC_FOR_ALIGN[value as ParagraphDefaultAlign];
      return;
    case "spaceBeforePt":
    case "spaceAfterPt": {
      const spacing = { ...(record(ppr.spacing) ?? {}) };
      spacing[field === "spaceBeforePt" ? "beforeTwips" : "afterTwips"] = twips(value as number);
      ppr.spacing = spacing;
      return;
    }
    case "lineSpacing": {
      const line = value as ParagraphDefaultLineSpacing;
      const spacing = { ...(record(ppr.spacing) ?? {}) };
      if (line.rule === "multiple") {
        spacing.lineTwips = Math.round(line.multiple * 240);
        spacing.lineRule = "auto";
      } else {
        spacing.lineTwips = twips(line.points);
        spacing.lineRule = line.rule;
      }
      ppr.spacing = spacing;
      return;
    }
    case "indentLeftPt":
    case "indentRightPt": {
      const indent = { ...(record(ppr.indent) ?? {}) };
      // The transitional `left`/`right` names; a strict `start`/`end` the
      // source used gives way so the value is stated once.
      if (field === "indentLeftPt") {
        delete indent.startTwips;
        indent.leftTwips = twips(value as number);
      } else {
        delete indent.endTwips;
        indent.rightTwips = twips(value as number);
      }
      ppr.indent = indent;
      return;
    }
    case "firstLineIndentPt": {
      const indent = { ...(record(ppr.indent) ?? {}) };
      const points = value as number;
      delete indent.hangingTwips;
      delete indent.firstLineTwips;
      if (points < 0) indent.hangingTwips = twips(-points);
      else indent.firstLineTwips = twips(points);
      ppr.indent = indent;
      return;
    }
    default:
      ppr[field] = value as boolean;
  }
}

/* ------------------------------------------------------------------------ */
/* The command                                                               */
/* ------------------------------------------------------------------------ */

function requestedFields(format: ParagraphDefaultFormat): Array<[ParagraphDefaultField, unknown]> {
  const fields: Array<[ParagraphDefaultField, unknown]> = [];
  if (format.align) fields.push(["align", format.align]);
  const clampIndent = (value: number) => Math.min(Math.max(value, 0), MAX_INDENT_PT);
  if (format.indentLeftPt !== undefined && Number.isFinite(format.indentLeftPt)) {
    fields.push(["indentLeftPt", clampIndent(format.indentLeftPt)]);
  }
  if (format.indentRightPt !== undefined && Number.isFinite(format.indentRightPt)) {
    fields.push(["indentRightPt", clampIndent(format.indentRightPt)]);
  }
  if (format.firstLineIndentPt !== undefined && Number.isFinite(format.firstLineIndentPt)) {
    fields.push([
      "firstLineIndentPt",
      Math.min(Math.max(format.firstLineIndentPt, -MAX_INDENT_PT), MAX_INDENT_PT),
    ]);
  }
  for (const key of ["spaceBeforePt", "spaceAfterPt"] as const) {
    const points = normalizeSpacing(format[key]);
    if (format[key] !== undefined && points !== null) fields.push([key, points]);
  }
  const line = format.lineSpacing;
  if (line?.rule === "multiple" && normalizeLineHeight(roundRatio(line.multiple)) !== null) {
    fields.push(["lineSpacing", { rule: "multiple", multiple: Number(roundRatio(line.multiple)) }]);
  } else if (line && line.rule !== "multiple" && normalizeLineHeightPt(line.points) !== null) {
    fields.push(["lineSpacing", { rule: line.rule, points: normalizeLineHeightPt(line.points) }]);
  }
  for (const key of PARAGRAPH_DEFAULT_TOGGLES) {
    const value = format.toggles?.[key];
    if (typeof value === "boolean") fields.push([key, value]);
  }
  return fields;
}

/** The line height a native document's body paragraphs are drawn with
 * when it declares none (note-editor.css `--doc-default-line-height`). */
export const NATIVE_DOCUMENT_LINE_MULTIPLE = 1.75;

/**
 * The document's default line spacing as a multiple, as its paragraphs that
 * state none are drawn: Normal's in an imported document (null when Normal
 * states an absolute height or nothing), else the declared
 * `defaultLineHeight` or the editor's own default. The Paragraph dialog's
 * "Default" shows it, and Set As Default writes it, so the document's
 * Normal states the spacing the dialog showed (A9: it showed a 1.15
 * placeholder and the export wrote the at-least height the page used).
 */
export function documentDefaultLineMultiple(doc: PmNode): number | null {
  const attrs = doc.attrs as Record<string, unknown>;
  const definitions = normalizeStyleDefinitions(attrs.styleDefinitions);
  const graph = definitions ? styleGraph(definitions) : null;
  if (definitions && graph) {
    const line = normalValue(graph, "lineSpacing") as ParagraphDefaultLineSpacing | null | undefined;
    return line?.rule === "multiple" ? Number(roundRatio(line.multiple)) : null;
  }
  const raw = attrs.defaultLineHeight;
  const declared = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isFinite(declared) && declared > 0 ? declared : NATIVE_DOCUMENT_LINE_MULTIPLE;
}

/**
 * Write `format` as the document's default paragraph formatting ("This
 * document only"). Returns what was written and what the document cannot
 * keep as a default.
 */
export function setParagraphFormatAsDocumentDefault(
  tr: Transaction,
  format: ParagraphDefaultFormat,
): ParagraphDefaultResult {
  const definitions = normalizeStyleDefinitions(
    (tr.doc.attrs as Record<string, unknown>).styleDefinitions,
  );
  const graph = definitions ? styleGraph(definitions) : null;
  return definitions && graph
    ? setImportedDocumentDefault(tr, format, definitions, graph)
    : setNativeDocumentDefault(tr, format);
}

/** A document written in MRAI: the doc-level defaults its paragraphs inherit. */
function setNativeDocumentDefault(
  tr: Transaction,
  format: ParagraphDefaultFormat,
): ParagraphDefaultResult {
  const attrs = tr.doc.attrs as Record<string, unknown>;
  const notCarried: ParagraphDefaultField[] = [];
  let changed = false;
  const set = (name: string, value: unknown) => {
    if (attrs[name] === value) return;
    tr.setDocAttribute(name, value);
    changed = true;
  };
  for (const [field, value] of requestedFields(format)) {
    switch (field) {
      case "align": {
        const align = normalizeDocumentDefaultTextAlign(value);
        if (align) set("defaultTextAlign", align);
        else notCarried.push(field);
        break;
      }
      case "spaceBeforePt":
        set("defaultParagraphSpaceBefore", value);
        break;
      case "spaceAfterPt":
        set("defaultParagraphSpaceAfter", value);
        break;
      case "lineSpacing": {
        const line = value as ParagraphDefaultLineSpacing;
        if (line.rule === "multiple") set("defaultLineHeight", roundRatio(line.multiple));
        else notCarried.push(field);
        break;
      }
      case "indentLeftPt":
        set("defaultIndentLeftPt", normalizeIndentPt(value));
        break;
      case "indentRightPt":
        set("defaultIndentRightPt", normalizeIndentPt(value));
        break;
      case "firstLineIndentPt":
        set("defaultFirstLineIndentPt", normalizeFirstLineIndentPt(value));
        break;
      default:
        if (value !== TOGGLE_WORD_DEFAULT[field]) notCarried.push(field);
    }
  }
  return { changed, notCarried };
}

/** An imported Word document: its Normal style, its mirrors, its paragraphs. */
function setImportedDocumentDefault(
  tr: Transaction,
  format: ParagraphDefaultFormat,
  definitions: Record<string, unknown>,
  graph: StyleGraph,
): ParagraphDefaultResult {
  // Only what differs from Normal's present value is written: an unchanged
  // box restating it would replace a source spelling the model does not
  // carry (a first-line indent in characters) with points.
  const changes = new Map<ParagraphDefaultField, { before: unknown; after: unknown }>();
  for (const [field, value] of requestedFields(format)) {
    const before = normalValue(graph, field);
    if (!sameValue(field, before, value)) changes.set(field, { before, after: value });
  }
  if (changes.size === 0) return { changed: false, notCarried: [] };

  const nextDefinitions = JSON.parse(JSON.stringify(definitions)) as Record<string, unknown>;
  const styles = nextDefinitions.styles as Array<Record<string, unknown>>;
  const normal = styles.find((style) => style.styleId === graph.normalId);
  if (!normal) return { changed: false, notCarried: [] };
  const ppr = { ...(record(normal.pPr) ?? {}) };
  for (const [field, { after }] of changes) writeNormalPpr(ppr, field, after);
  normal.pPr = ppr;
  tr.setDocAttribute("styleDefinitions", nextDefinitions);

  // The doc-level mirrors the importer reads from Normal + docDefaults:
  // the defaults unstated paragraphs (and new ones) are drawn with.
  const attrs = tr.doc.attrs as Record<string, unknown>;
  const align = changes.get("align");
  if (align) {
    const value = normalizeDocumentDefaultTextAlign(align.after);
    if (value && attrs.defaultTextAlign !== value) tr.setDocAttribute("defaultTextAlign", value);
  }
  const before = changes.get("spaceBeforePt");
  if (before) tr.setDocAttribute("defaultParagraphSpaceBefore", before.after);
  const after = changes.get("spaceAfterPt");
  if (after) tr.setDocAttribute("defaultParagraphSpaceAfter", after.after);
  const line = changes.get("lineSpacing");
  if (line) {
    const next = line.after as ParagraphDefaultLineSpacing;
    // The importer states no document line height for an exact or at-least
    // Normal; the paragraphs carry it themselves.
    tr.setDocAttribute(
      "defaultLineHeight",
      next.rule === "multiple" ? roundRatio(next.multiple) : null,
    );
  }
  // Normal's indents, mirrored as the importer reads them: the indent a
  // paragraph that states none (one made after a table, pasted, inserted)
  // draws. A page imported before the mirror existed has none on a side;
  // its unstated paragraphs drew no indent there (`freshMirrors`).
  const freshMirrors = new Set<ParagraphDefaultField>();
  for (const [field, name] of INDENT_MIRRORS) {
    const change = changes.get(field);
    if (!change) continue;
    const value =
      field === "firstLineIndentPt"
        ? normalizeFirstLineIndentPt(change.after)
        : normalizeIndentPt(change.after);
    const current = attrs[name] ?? null;
    if (current === value) continue;
    if (current === null) freshMirrors.add(field);
    tr.setDocAttribute(name, value);
  }

  reflowImportedParagraphs(tr, graph, changes, freshMirrors);
  return { changed: true, notCarried: [] };
}

/** Indent fields and the doc-level attrs that mirror Normal's value. */
const INDENT_MIRRORS: ReadonlyArray<readonly [ParagraphDefaultField, string]> = [
  ["indentLeftPt", "defaultIndentLeftPt"],
  ["indentRightPt", "defaultIndentRightPt"],
  ["firstLineIndentPt", "defaultFirstLineIndentPt"],
];

/** Fields an unstated paragraph value inherits through a doc-level default. */
const DOC_DEFAULT_FIELDS = new Set<ParagraphDefaultField>([
  "spaceBeforePt",
  "spaceAfterPt",
  "lineSpacing",
]);

function reflowImportedParagraphs(
  tr: Transaction,
  graph: StyleGraph,
  changes: Map<ParagraphDefaultField, { before: unknown; after: unknown }>,
  freshMirrors: ReadonlySet<ParagraphDefaultField>,
): void {
  const updates: Array<{ pos: number; attrs: PageAttrs }> = [];
  tr.doc.descendants((node, pos, parent) => {
    if (!TEXT_BLOCKS.has(node.type.name)) return true;
    const inList = parent ? LIST_CONTAINERS.has(parent.type.name) : false;
    const attrs = node.attrs as PageAttrs;
    const styleId = paragraphStyleId(node, graph);
    const next: PageAttrs = {};
    for (const [field, { before, after }] of changes) {
      // Alignment reaches unstated paragraphs through defaultTextAlign; a
      // stated one is the paragraph's own.
      if (field === "align") continue;
      // A list paragraph's indents come from its numbering level.
      if (inList && (field === "indentLeftPt" || field === "indentRightPt" || field === "firstLineIndentPt")) {
        continue;
      }
      // A first line stated in characters (`w:firstLineChars`) is the
      // paragraph's own, whatever Normal says in points.
      if (field === "firstLineIndentPt" && Number(attrs.textIndent) > 0) continue;
      const own = pageValue(attrs, field);
      const source = chainSource(graph, styleId, field);
      if (freshMirrors.has(field) && (attrs[field] === null || attrs[field] === undefined)) {
        // The mirror is new: this unstated paragraph drew no indent. It
        // takes the new Normal value when it inherited Normal's (none), and
        // otherwise keeps none, now stated against the mirror.
        const inherits = source === "normal" && sameValue(field, own, before);
        Object.assign(next, inherits ? pageAttrsFor(field, after) : { [field]: 0 });
        continue;
      }
      if (source === "normal") {
        // Unstated spacing/line already follows the restated doc default,
        // except an absolute line, which no doc default carries.
        if (own === null) {
          const line = after as ParagraphDefaultLineSpacing;
          if (field === "lineSpacing" && line.rule !== "multiple") {
            Object.assign(next, pageAttrsFor(field, after));
          }
          continue;
        }
        if (sameValue(field, own, before)) Object.assign(next, pageAttrsFor(field, after));
        continue;
      }
      // A style on the way states the value itself: it does not move. An
      // unstated spacing drawn with the doc default would, so it is stated.
      if (own === null && DOC_DEFAULT_FIELDS.has(field) && source.value !== undefined) {
        if (!sameValue(field, source.value, after)) {
          Object.assign(next, pageAttrsFor(field, source.value));
        }
      }
    }
    if (Object.keys(next).length > 0) {
      updates.push({ pos, attrs: { ...attrs, ...next } });
    }
    // A paragraph holds no further paragraphs.
    return false;
  });
  for (const { pos, attrs } of updates) {
    tr.setNodeMarkup(tr.mapping.map(pos), undefined, attrs);
  }
}

/* ------------------------------------------------------------------------ */
/* Drawing a native document's default indents                              */
/* ------------------------------------------------------------------------ */

export interface DocumentDefaultIndents {
  left: number | null;
  right: number | null;
  firstLine: number | null;
}

/** The shared "no default indent" value, so a surface can test identity. */
export const EMPTY_DOCUMENT_DEFAULT_INDENTS: DocumentDefaultIndents = Object.freeze({
  left: null,
  right: null,
  firstLine: null,
}) as DocumentDefaultIndents;

/**
 * The surface variables note-editor.css reads on paragraphs that state no
 * indent of their own (`[data-doc-default-indent]`). Values are normalized
 * point numbers only, so no other CSS can ride along.
 */
export function documentDefaultIndentCss(indents: DocumentDefaultIndents): Record<string, string> {
  const css: Record<string, string> = {};
  const left = normalizeIndentPt(indents.left);
  const right = normalizeIndentPt(indents.right);
  const firstLine = normalizeFirstLineIndentPt(indents.firstLine);
  if (left !== null) css["--doc-default-indent-left"] = `${left}pt`;
  if (right !== null) css["--doc-default-indent-right"] = `${right}pt`;
  if (firstLine !== null) css["--doc-default-first-line-indent"] = `${firstLine}pt`;
  return css;
}
