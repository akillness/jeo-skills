/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** WordprocessingML overflowPunct defaults to true only after style inheritance.
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.overflowpunctuation
 * This is display-only resolution: never materialize the default in source attrs.
 */
import { normalizeDocumentTableDesignAuthority, normalizeDocumentTableStyleVisualCatalog } from "../../../../lib/document-table-design-authority";

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const token = (value: unknown): string | null =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 128 &&
  value === value.trim() &&
  !/[\u0000-\u001f]/.test(value)
    ? value
    : null;

type ParagraphOnOffProperty = "overflowPunct" | "wordWrap";

interface StyleContext {
  styles: Map<string, Record<string, unknown>>;
  defaultStyleId: string | null;
  defaults: Record<string, unknown> | null;
}
const styleContexts = new WeakMap<object, StyleContext | null>();
function buildStyleContext(
  docAttrs: Record<string, unknown>,
): StyleContext | null {
  const definitions = record(docAttrs.styleDefinitions);
  if (
    definitions?.version !== 1 ||
    !Array.isArray(definitions.styles) ||
    definitions.styles.length > 512
  )
    return null;
  const styles = new Map<string, Record<string, unknown>>();
  for (const raw of definitions.styles) {
    const style = record(raw),
      id = token(style?.styleId);
    if (!style || !id || styles.has(id)) return null;
    styles.set(id, style);
  }
  const defaults = [...styles.values()].filter(
    (style) => style.type === "paragraph" && style.default === true,
  );
  if (defaults.length > 1) return null;
  const docDefaults = record(definitions.docDefaults);
  if (definitions.docDefaults != null && !docDefaults) return null;
  const pPrDefault = record(docDefaults?.pPr);
  if (docDefaults?.pPr != null && !pPrDefault) return null;
  return {
    styles,
    defaultStyleId: token(defaults[0]?.styleId),
    defaults: pPrDefault,
  };
}
function styleContext(docAttrs: Record<string, unknown>): StyleContext | null {
  if (styleContexts.has(docAttrs)) return styleContexts.get(docAttrs)!;
  const context = buildStyleContext(docAttrs);
  styleContexts.set(docAttrs, context);
  return context;
}

/** null means no proven inherited value; keep the existing renderer. */
function resolveUncachedParagraphOnOff(
  property: ParagraphOnOffProperty,
  docAttrs: Record<string, unknown>,
  blockAttrs: Record<string, unknown>,
  sourceAdapter: unknown,
  inTable = false,
): boolean | null {
  const direct = blockAttrs[property];
  if (direct != null) return typeof direct === "boolean" ? direct : null;
  if (sourceAdapter !== "docx") return null;
  // Table conditional pPr has its own precedence. Do not override an unresolved
  // table-style value with the document omission default.
  if (inTable) return null;
  const rawDefinitions = docAttrs.styleDefinitions;
  const styleId =
    blockAttrs.docxStyleId ??
    blockAttrs.customStyleId ??
    record(blockAttrs.source)?.styleId;
  if (blockAttrs.customStyleName && styleId == null) return null;
  if (rawDefinitions == null) return styleId == null ? true : null;
  const context = styleContext(docAttrs);
  if (!context) return null;
  const fallback=context.defaults?.[property];
  if(fallback!=null && typeof fallback!=="boolean")return null;
  const { styles } = context;
  let current = styleId == null ? context.defaultStyleId : token(styleId);
  if (styleId != null && !current) return null;
  const seen = new Set<string>();
  let inherited: boolean | null = null;
  while (current) {
    if (seen.has(current)) return null;
    seen.add(current);
    const style = styles.get(current);
    if (!style || style.type !== "paragraph") return null;
    const pPr = record(style.pPr);
    if (style.pPr != null && !pPr) return null;
    if (pPr?.[property] != null) {
      if (typeof pPr[property] !== "boolean") return null;
      inherited ??= pPr[property];
    }
    if (style.basedOn != null && !token(style.basedOn)) return null;
    current = token(style.basedOn);
  }
  return inherited ?? (typeof fallback==="boolean" ? fallback : true);
}

// ProseMirror document and node attrs are immutable. Cache both resolved values
// and unsupported contexts without rebuilding the style graph on every layout.
const resolved = new WeakMap<
  object,
  WeakMap<object, Map<string, boolean | null>>
>();
function resolveParagraphOnOff(
  property: ParagraphOnOffProperty,
  docAttrs: Record<string, unknown>,
  blockAttrs: Record<string, unknown>,
  sourceAdapter: unknown,
  inTable = false,
): boolean | null {
  let blocks = resolved.get(docAttrs);
  if (!blocks) {
    blocks = new WeakMap();
    resolved.set(docAttrs, blocks);
  }
  let contexts = blocks.get(blockAttrs);
  if (!contexts) {
    contexts = new Map();
    blocks.set(blockAttrs, contexts);
  }
  // A paragraph pasted, duplicated or typed into an imported Word document
  // carries no source of its own (block identity clears it), yet Word applies
  // the document's settings to every paragraph in it: one with no source in
  // a document holding Word's style definitions resolves as the document's.
  if (sourceAdapter == null && docAttrs.styleDefinitions != null) sourceAdapter = "docx";
  const key = `${property}:${sourceAdapter === "docx"}:${inTable}`;
  if (contexts.has(key)) return contexts.get(key)!;
  const value = resolveUncachedParagraphOnOff(
    property,
    docAttrs,
    blockAttrs,
    sourceAdapter,
    inTable,
  );
  contexts.set(key, value);
  return value;
}

export function resolveDocumentOverflowPunctuation(docAttrs:Record<string,unknown>,blockAttrs:Record<string,unknown>,sourceAdapter:unknown,inTable=false):boolean|null {
  return resolveParagraphOnOff("overflowPunct",docAttrs,blockAttrs,sourceAdapter,inTable);
}

/** Word defaults to word-level breaks in space-delimited languages. False
 * explicitly requests character-level wrapping and keeps its separate path.
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.wordwrap */
const tableWordWrapOmission = new WeakMap<object, WeakMap<object, boolean>>();
function hasTableWordWrapOmission(docAttrs: Record<string, unknown>, tableAttrs: Record<string, unknown>): boolean {
  let tables = tableWordWrapOmission.get(docAttrs);
  if (!tables) { tables = new WeakMap(); tableWordWrapOmission.set(docAttrs, tables); }
  const cached = tables.get(tableAttrs);
  if (cached !== undefined) return cached;
  const source = record(tableAttrs.source);
  const authority = normalizeDocumentTableDesignAuthority(source?.tableDesignAuthority);
  const styleId = authority?.current.styleId;
  let valid = source?.adapter === "docx" && source.cellParagraphFlow === 1 &&
    source.typographyFlow === 1 && source.fontScriptFlow === 1 &&
    /^word\/document\.xml#tbl\[\d+\]$/.test(String(source.sourceAnchor ?? "")) &&
    Boolean(styleId) && styleId === authority?.receipt.sourceState.styleId;
  const catalog = valid ? normalizeDocumentTableStyleVisualCatalog(docAttrs.tableStyleVisualCatalog) : null;
  const proof = catalog?.find(entry => entry.styleId === styleId)?.visual.wordWrapOmissionChainSha256;
  valid &&= Boolean(proof) && proof === authority?.receipt.sourceStyleChainSha256;
  // A later semantic table-style edit may not borrow the original raw receipt.
  // Conditional absence is authenticated by the catalog; the editable table
  // chain must still be complete and omit the toggle as well.
  const context = valid ? styleContext(docAttrs) : null;
  let current = styleId ?? null;
  const seen = new Set<string>();
  if (!context) valid = false;
  while (valid && current) {
    const style = context!.styles.get(current);
    const pPr = record(style?.pPr);
    if (seen.has(current) || !style || style.type !== "table" ||
        style.pPr != null && !pPr || pPr && Object.hasOwn(pPr, "wordWrap") ||
        style.basedOn != null && !token(style.basedOn)) { valid = false; break; }
    seen.add(current);
    current = token(style.basedOn);
  }
  tables.set(tableAttrs, valid);
  return valid;
}

export function resolveDocumentWordWrap(docAttrs:Record<string,unknown>,blockAttrs:Record<string,unknown>,sourceAdapter:unknown,inTable=false,tableAttrs?:Record<string,unknown>):boolean|null {
  const unresolvedTable = inTable && !(tableAttrs && hasTableWordWrapOmission(docAttrs,tableAttrs));
  return resolveParagraphOnOff("wordWrap",docAttrs,blockAttrs,sourceAdapter,unresolvedTable);
}






export function docsWordWrapInertOff(): boolean {
  return typeof window !== "undefined" && (window as Window & { __docsWordWrapInertOff?: boolean }).__docsWordWrapInertOff === true;
}

/**
 * Whether a Word document leaves w:wordWrap off without effect: Windows Word
 * cuts a word only in compatibility mode 14 and later. In mode 12, mode 11
 * and a document that states no mode, a paragraph with wordWrap off breaks
 * Latin and Hangul words as one with it on, in the body and in a table cell,
 * whatever the alignment, font or East Asian language
 * (docx-look/print9/probes ww3 and ww4: 30 x, a space and 50 y in Courier New
 * 12 pt take the y down whole in 11/12/none and cut them at the margin in
 * 14/15; corpus R461-D71, a pandoc document whose Source Code style turns it
 * off, wraps its R code at the spaces in Word's 160 pages).
 */
export function documentWordWrapOffInert(docAttrs: Record<string, unknown>, sourceAdapter: unknown): boolean {
  if (sourceAdapter == null && docAttrs.styleDefinitions != null) sourceAdapter = "docx";
  if (sourceAdapter !== "docx" || docsWordWrapInertOff()) return false;
  const mode = normalizeWordCompatibilityMode(docAttrs.wordCompatibilityMode);
  return mode === null || mode < 14;
}

/** The paragraph's word wrap as Word applies it: resolveDocumentWordWrap, with
 * an off that the document's compatibility mode leaves inert read as on. */
export function resolveEffectiveDocumentWordWrap(docAttrs:Record<string,unknown>,blockAttrs:Record<string,unknown>,sourceAdapter:unknown,inTable=false,tableAttrs?:Record<string,unknown>):boolean|null {
  const value = resolveDocumentWordWrap(docAttrs,blockAttrs,sourceAdapter,inTable,tableAttrs);
  return value === false && documentWordWrapOffInert(docAttrs, sourceAdapter) ? true : value;
}

/** A Word compatibility mode the document states (1..99), else null. */
export function normalizeWordCompatibilityMode(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 99 ? value : null;
}

/**
 * Word's "Allow punctuation to overflow the margin" hangs a stop or comma
 * past the right edge in any paragraph of a document in compatibility mode
 * 14 or earlier (or none), but from mode 15 only in a justified or
 * distributed paragraph; elsewhere the character before it moves down with
 * it (Word 16.86, measured: corpus R47-D14 and probes in every alignment).
 */
/**
 * Whether Word compresses East Asian punctuation (characterSpacingControl
 * compressPunctuation) in a paragraph of this alignment: always in a
 * document in compatibility mode 14 or earlier (or none), from mode 15 only
 * in a justified or distributed paragraph. A left, centred or right aligned
 * paragraph sets every mark at its full width and fits no extra character
 * by squeezing; a mark that cannot start a line takes the character before
 * it down with it (Word 16.86, measured: corpus R74-D15's EA6c paragraph and
 * probes in MS Mincho, Yu Mincho, MS Gothic, Yu Gothic and MS PMincho, every
 * alignment, compressPunctuation and doNotCompress alike; with only the mode
 * set to 14 the same paragraphs compress and a mark hangs).
 */
export function wordPunctuationCompresses(compatibilityMode: unknown, textAlign: unknown): boolean {
  const mode = normalizeWordCompatibilityMode(compatibilityMode);
  return mode === null || mode < 15 || textAlign === "justify" || textAlign === "distribute";
}

export function wordPunctuationMayHang(compatibilityMode: unknown, textAlign: unknown): boolean {
  const mode = normalizeWordCompatibilityMode(compatibilityMode);
  return mode === null || mode < 15 || textAlign === "justify" || textAlign === "distribute";
}
