/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's field-code side of a field (Microsoft Support, "Insert, edit, and
 * view fields in Word"; "List of field codes in Word"; "Keyboard shortcuts
 * for Microsoft Word on Mac", Work with fields):
 *
 * - A field is its code and its result. Option+F9 toggles every field of the
 *   document between the two; Shift+F9 toggles the selected ones; the code
 *   shows in braces, `{ DATE \@ "M/d/yyyy" }`. Showing codes is a view
 *   setting: it changes nothing in the document.
 * - F9 updates the selected fields: each computes its result again and keeps
 *   it as its stored result. A locked field is never updated.
 * - Command+F11 locks the selected fields, Command+Shift+F11 unlocks them;
 *   Command+Shift+F9 unlinks them: each becomes its current result as plain
 *   text, the field gone.
 * - The Field dialog's Field codes box takes any code. A code the editor
 *   models (DATE, PAGE, REF, ...) becomes that field; any other Word field
 *   (SECTIONPAGES, SYMBOL, = formula, DOCPROPERTY, FILLIN, ...) is carried as
 *   Word's own field (`NATIVE`, document_docx_preserved_fields.py) with the
 *   result the editor can compute and Word's dirty flag, so Word computes it
 *   again on open. The product never writes the fields it refuses (DDE,
 *   INCLUDETEXT, INCLUDEPICTURE, LINK, MACROBUTTON, INCLUDE, IMPORT,
 *   DATABASE), and a typed code holds no nested field: Word's nested fields
 *   are built with Command+F9 inside a code, which this editor's atom does not
 *   offer.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";

import { formatDocumentDateTime, isDocumentDateTimePicture } from "@mrnote/core/web/components/console/editor/native-document/documentDateTime.ts";
import {
  DOCUMENT_FIELD_NODE_NAME,
  createDocumentFieldAttrs,
  formatFieldDate,
  normalizeDocumentFieldAttrs,
  parseDocumentFieldInstruction,
  type DocumentFieldAttrs,
  type FieldContext,
} from "@mrnote/core/web/components/console/editor/native-document/documentFieldValues.ts";
import { customPropertyDisplayValue, normalizeCustomProperties } from "@mrnote/core/web/components/console/editor/native-document/documentCustomProperties.ts";

interface FieldCodesState {
  /** Option+F9: every field shows its code. */
  readonly all: boolean;
  /** Shift+F9: fields whose display is the other one of `all`'s. */
  readonly toggled: readonly number[];
}

type FieldCodesMeta = { readonly kind: "all" } | { readonly kind: "toggle"; readonly positions: readonly number[] };

export const documentFieldCodesKey = new PluginKey<FieldCodesState>("documentFieldCodes");

export function createDocumentFieldCodesPlugin(): Plugin<FieldCodesState> {
  return new Plugin<FieldCodesState>({
    key: documentFieldCodesKey,
    state: {
      init: () => ({ all: false, toggled: [] }),
      apply(tr, value) {
        const meta = tr.getMeta(documentFieldCodesKey) as FieldCodesMeta | undefined;
        let toggled = value.toggled;
        if (tr.docChanged && toggled.length > 0) {
          toggled = toggled.flatMap((pos) => {
            const mapped = tr.mapping.mapResult(pos, 1);
            return mapped.deleted ? [] : [mapped.pos];
          });
        }
        if (!meta) return toggled === value.toggled ? value : { ...value, toggled };
        if (meta.kind === "all") return { all: !value.all, toggled: [] };
        const set = new Set(toggled);
        for (const pos of meta.positions) {
          if (set.has(pos)) set.delete(pos);
          else set.add(pos);
        }
        return { all: value.all, toggled: [...set] };
      },
    },
  });
}

/** Whether the field at `pos` shows its code instead of its result. */
export function documentFieldCodeShown(state: EditorState, pos: number | null): boolean {
  const value = documentFieldCodesKey.getState(state);
  if (!value) return false;
  const toggled = pos !== null && value.toggled.includes(pos);
  return value.all !== toggled;
}

export function documentFieldCodesShownEverywhere(state: EditorState): boolean {
  return documentFieldCodesKey.getState(state)?.all === true;
}

/** The code as Word's field-code view draws it. */
export function documentFieldCodeText(attrs: Record<string, unknown>): string {
  const field = normalizeDocumentFieldAttrs(attrs);
  const instruction = field?.instruction ?? (typeof attrs.instruction === "string" ? attrs.instruction : "");
  return `{${instruction || " "}}`;
}

export interface SelectedDocumentField {
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

/** The fields Word's field commands act on: those the selection holds, or
 * the one the insertion point touches. */
export function selectedDocumentFields(state: EditorState): SelectedDocumentField[] {
  const { from, to, empty, $from } = state.selection;
  const out: SelectedDocumentField[] = [];
  if (!empty) {
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === DOCUMENT_FIELD_NODE_NAME) out.push({ pos, node });
      return true;
    });
    return out;
  }
  const after = $from.nodeAfter;
  if (after?.type.name === DOCUMENT_FIELD_NODE_NAME) return [{ pos: from, node: after }];
  const before = $from.nodeBefore;
  if (before?.type.name === DOCUMENT_FIELD_NODE_NAME) return [{ pos: from - before.nodeSize, node: before }];
  return out;
}

export function toggleDocumentFieldCodesMeta(tr: Transaction, positions: readonly number[] | "all"): Transaction {
  return tr
    .setMeta(documentFieldCodesKey, positions === "all" ? { kind: "all" } : { kind: "toggle", positions })
    .setMeta("addToHistory", false);
}

// ------------------------------------------------------------ typed codes

/** The fields the product never writes (the server refuses the same). */
const REFUSED_FIELD_RE = /\b(?:DDE|DDEAUTO|INCLUDETEXT|INCLUDEPICTURE|LINK|MACROBUTTON|INCLUDE|IMPORT|DATABASE)\b/i;
const KEYWORD_RE = /^\s*(=|[A-Za-z][A-Za-z0-9]*)/;
const MAX_CODE = 4_000;

export type DocumentFieldCodeError = "empty" | "keyword" | "unsafe" | "nested" | "link";

/** What the editor knows when it computes a typed field's first result. */
export interface DocumentFieldCodeContext extends FieldContext {
  readonly doc?: ProseMirrorNode;
}

function quotedOrBare(tokens: readonly string[], index: number): string {
  const token = tokens[index] ?? "";
  return token.startsWith('"') ? token.slice(1, token.endsWith('"') && token.length > 1 ? -1 : undefined) : token;
}

function switchArgument(code: string, letter: string): string | null {
  const match = new RegExp(`\\\\${letter}\\s+("([^"]*)"|\\S+)`, "i").exec(code);
  if (!match) return null;
  return match[2] ?? match[1] ?? null;
}

/** Word's formula field arithmetic: + - * / ^ %, parentheses, numbers. */
export function evaluateWordFormula(expression: string): number | null {
  const source = expression
    .replace(/\\#\s*("[^"]*"|\S+)/g, "")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .trim();
  if (!/^[\d.,+\-*/^%()\s]+$/.test(source) || !source) return null;
  let index = 0;
  const peek = () => {
    while (source[index] === " ") index += 1;
    return source[index];
  };
  const number = (): number | null => {
    const char = peek();
    if (char === "(") {
      index += 1;
      const value = sum();
      if (peek() !== ")") return null;
      index += 1;
      return value;
    }
    if (char === "-" || char === "+") {
      index += 1;
      const value = power();
      return value === null ? null : char === "-" ? -value : value;
    }
    const match = /^\d+(?:\.\d+)?/.exec(source.slice(index));
    if (!match) return null;
    index += match[0].length;
    let value = Number(match[0]);
    if (peek() === "%") {
      index += 1;
      value /= 100;
    }
    return value;
  };
  const power = (): number | null => {
    const base = number();
    if (base === null) return null;
    if (peek() === "^") {
      index += 1;
      const exponent = power();
      return exponent === null ? null : base ** exponent;
    }
    return base;
  };
  const product = (): number | null => {
    let value = power();
    while (value !== null && (peek() === "*" || peek() === "/")) {
      const op = source[index];
      index += 1;
      const right = power();
      if (right === null) return null;
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number | null => {
    let value = product();
    while (value !== null && (peek() === "+" || peek() === "-")) {
      const op = source[index];
      index += 1;
      const right = product();
      if (right === null) return null;
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const value = sum();
  if (value === null || peek() !== undefined || !Number.isFinite(value)) return null;
  return value;
}

function formatFormulaResult(value: number, code: string): string {
  const picture = switchArgument(code, "#");
  if (picture) {
    const decimals = /\.(0+)/.exec(picture)?.[1]?.length ?? 0;
    const grouped = /,/.test(picture);
    const text = value.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouped,
    });
    const prefix = /^[^#0,.]+/.exec(picture.replace(/^"|"$/g, ""))?.[0] ?? "";
    return `${prefix}${text}`;
  }
  return String(Math.round(value * 1e10) / 1e10);
}

function docWords(doc: ProseMirrorNode | undefined): { words: number; chars: number } {
  if (!doc) return { words: 0, chars: 0 };
  const text = doc.textBetween(0, doc.content.size, " ", " ");
  const cjk = text.match(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g)?.length ?? 0;
  const latin = text.replace(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g, " ").match(/\S+/g)?.length ?? 0;
  return { words: latin + cjk, chars: text.replace(/\s/g, "").length };
}

function dateResult(code: string, now: Date): string {
  const picture = switchArgument(code, "@");
  if (picture && isDocumentDateTimePicture(picture)) return formatDocumentDateTime(now, picture);
  return `${formatFieldDate(now, "M/d/yyyy")} ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** The result the editor can give a Word field it does not model; Word
 * recomputes it on open. `""` when only Word can compute it. */
export function computeNativeFieldResult(code: string, context: DocumentFieldCodeContext = {}): string {
  const tokens = code.trim().match(/"[^"]*"?|\S+/g) ?? [];
  const keyword = (KEYWORD_RE.exec(code)?.[1] ?? "").toUpperCase();
  const now = context.now ?? new Date();
  switch (keyword) {
    case "=": {
      const value = evaluateWordFormula(code.replace(/^\s*=/, ""));
      return value === null ? "!Syntax Error" : formatFormulaResult(value, code);
    }
    case "SYMBOL": {
      const raw = tokens[1] ?? "";
      const value = /^0x[0-9a-f]+$/i.test(raw) ? Number.parseInt(raw, 16) : Number(raw);
      return Number.isInteger(value) && value > 0x1f && value <= 0x10ffff ? String.fromCodePoint(value) : "";
    }
    case "QUOTE":
      return quotedOrBare(tokens, 1);
    case "SECTIONPAGES":
      return context.pageCount ? String(context.pageCount) : "1";
    case "SECTION":
      return "1";
    case "NUMWORDS":
      return String(docWords(context.doc).words);
    case "NUMCHARS":
      return String(docWords(context.doc).chars);
    case "USERNAME":
    case "LASTSAVEDBY":
      return context.author ?? "";
    case "USERINITIALS":
      return (context.author ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => [...part][0]?.toUpperCase() ?? "")
        .join("");
    case "CREATEDATE":
    case "SAVEDATE":
      return dateResult(code, now);
    case "EDITTIME":
      return "0";
    case "REVNUM":
      return "1";
    case "LISTNUM":
      return "1)";
    case "AUTONUM":
      return "1.";
    case "FILLIN":
      return switchArgument(code, "d") ?? "";
    case "DOCPROPERTY":
      return documentPropertyFieldResult(quotedOrBare(tokens, 1), context);
    case "HYPERLINK":
      return quotedOrBare(tokens, 1);
    default:
      return "";
  }
}

/** The File > Properties a DOCPROPERTY field names, by Word's property
 * name: the built-in ones the document's properties hold. */
const DOC_PROPERTY_METADATA_KEYS: Readonly<Record<string, string>> = {
  title: "title",
  subject: "subject",
  author: "author",
  keywords: "keywords",
  category: "category",
  company: "company",
};

/**
 * What a DOCPROPERTY field shows: a built-in property from the document's
 * properties, else a custom property (File > Properties > Custom) of that
 * name, matched without regard to case as Word does. Word 16 prints a Yes or
 * no property as Y or N and a date in the system's short date (2025/3/1 in a
 * Chinese system, 3/1/2025 in a US one); a number and text as they are.
 */
function documentPropertyFieldResult(name: string, context: DocumentFieldCodeContext): string {
  const key = name.toLowerCase();
  const attrs = (context.doc?.attrs ?? {}) as Record<string, unknown>;
  const metadata = attrs.documentMetadata as Record<string, unknown> | null | undefined;
  const metadataKey = DOC_PROPERTY_METADATA_KEYS[key];
  if (metadataKey) {
    const value = metadata?.[metadataKey];
    if (typeof value === "string" && value) return value;
    if (key === "title") return context.title ?? "";
    if (key === "author") return context.author ?? "";
    return "";
  }
  const entry = normalizeCustomProperties(attrs.customProperties)?.find(
    (property) => property.name.toLowerCase() === key,
  );
  return entry ? customPropertyDisplayValue(entry) : "";
}

/** Fields Word computes only when asked: an update would prompt the reader. */
const MANUAL_NATIVE_FIELDS = new Set(["FILLIN", "ASK"]);

/** A Word field the editor does not model, as the attrs that carry it. */
export function nativeDocumentFieldAttrs(
  code: string,
  result: string,
  updatePolicy: "on-open" | "manual" = "on-open",
): Record<string, unknown> {
  const shown = result.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
  return {
    fieldType: "NATIVE",
    instruction: code,
    options: {},
    format: "",
    updatePolicy,
    cachedValue: shown.trim().slice(0, 256).trim(),
    locked: false,
    preservedField: { code: [{ text: code }], result: shown ? [{ text: shown }] : [] },
  };
}

/** Why a typed code cannot be a field, or null. */
export function documentFieldCodeError(code: string): DocumentFieldCodeError | null {
  if (!code.trim()) return "empty";
  if (/[{}]/.test(code)) return "nested";
  if (!KEYWORD_RE.test(code) || /[\r\n]/.test(code) || code.length > MAX_CODE) return "keyword";
  if (REFUSED_FIELD_RE.test(code.replace(/"(?:[^"\\]|\\.)*"/g, " "))) return "unsafe";
  if ((KEYWORD_RE.exec(code)?.[1] ?? "").toUpperCase() === "HYPERLINK") {
    const target = quotedOrBare(code.trim().match(/"[^"]*"?|\S+/g) ?? [], 1);
    if (target && !target.startsWith("\\") && !/^(?:https?:|mailto:)/i.test(target)) return "link";
  }
  return null;
}

/** The field a typed code makes: the editor's own field when it models the
 * keyword, Word's field (carried whole) otherwise. */
export function documentFieldAttrsFromCode(
  rawCode: string,
  context: DocumentFieldCodeContext = {},
): { readonly attrs: Record<string, unknown> } | { readonly error: DocumentFieldCodeError } {
  const error = documentFieldCodeError(rawCode);
  if (error) return { error };
  // Word writes a code with a space on each side of it.
  const code = ` ${rawCode.trim()} `;
  const keyword = (KEYWORD_RE.exec(code)?.[1] ?? "").toUpperCase();
  const modeled: DocumentFieldAttrs | null = keyword === "=" ? null : parseDocumentFieldInstruction(code);
  if (modeled && modeled.fieldType !== "NATIVE") {
    const withContext = createDocumentFieldAttrs(modeled.fieldType, {
      instruction: modeled.instruction,
      options: modeled.options,
      format: modeled.format,
      updatePolicy: "on-open",
      context,
    });
    if (withContext) return { attrs: { ...withContext } };
  }
  return {
    attrs: nativeDocumentFieldAttrs(
      code,
      computeNativeFieldResult(code, context),
      MANUAL_NATIVE_FIELDS.has(keyword) ? "manual" : "on-open",
    ),
  };
}

/** A carried Word field whose code is one plain run: its code can be edited
 * and its result recomputed without losing what Word wrote. */
export function nativeFieldIsPlain(attrs: Record<string, unknown>): boolean {
  const value = attrs.preservedField as { code?: unknown; result?: unknown; inert?: unknown } | null | undefined;
  if (!value || typeof value !== "object" || value.inert) return false;
  const code = Array.isArray(value.code) ? value.code : [];
  return code.every((item) => item && typeof item === "object" && "text" in item && !("style" in item));
}

/** Word's own fields the Field dialog lists beside the ones the editor
 * models, each with the code it starts from. */
export const WORD_CODE_FIELDS = [
  { name: "=", category: "equationsFormulas", code: "= 2 * 3" },
  { name: "Advance", category: "equationsFormulas", code: "ADVANCE \\u 3" },
  { name: "Ask", category: "mailMerge", code: 'ASK Name "Your name?"' },
  { name: "AutoNum", category: "numbering", code: "AUTONUM" },
  { name: "Comments", category: "documentInfo", code: "COMMENTS" },
  { name: "CreateDate", category: "dateTime", code: 'CREATEDATE \\@ "M/d/yyyy h:mm am/pm"' },
  { name: "DocProperty", category: "documentInfo", code: "DOCPROPERTY Company" },
  { name: "EditTime", category: "dateTime", code: "EDITTIME" },
  { name: "Eq", category: "equationsFormulas", code: "EQ \\f(1,2)" },
  { name: "FileSize", category: "documentInfo", code: "FILESIZE \\k" },
  { name: "Fillin", category: "mailMerge", code: 'FILLIN "Your name?" \\d "Name"' },
  { name: "Hyperlink", category: "linksReferences", code: 'HYPERLINK "https://example.com"' },
  { name: "Keywords", category: "documentInfo", code: "KEYWORDS" },
  { name: "LastSavedBy", category: "documentInfo", code: "LASTSAVEDBY" },
  { name: "ListNum", category: "numbering", code: "LISTNUM NumberDefault \\l 1" },
  { name: "NumChars", category: "documentInfo", code: "NUMCHARS" },
  { name: "NumWords", category: "documentInfo", code: "NUMWORDS" },
  { name: "PrintDate", category: "dateTime", code: 'PRINTDATE \\@ "M/d/yyyy h:mm am/pm"' },
  { name: "Quote", category: "linksReferences", code: 'QUOTE "Text"' },
  { name: "RevNum", category: "numbering", code: "REVNUM" },
  { name: "SaveDate", category: "dateTime", code: 'SAVEDATE \\@ "M/d/yyyy h:mm am/pm"' },
  { name: "Section", category: "numbering", code: "SECTION" },
  { name: "SectionPages", category: "numbering", code: "SECTIONPAGES" },
  { name: "Set", category: "mailMerge", code: 'SET Name "Value"' },
  { name: "Subject", category: "documentInfo", code: "SUBJECT" },
  { name: "Symbol", category: "equationsFormulas", code: "SYMBOL 169" },
  { name: "Template", category: "documentInfo", code: "TEMPLATE" },
  { name: "UserInitials", category: "userInfo", code: "USERINITIALS" },
  { name: "UserName", category: "userInfo", code: "USERNAME" },
] as const;

export type WordCodeField = (typeof WORD_CODE_FIELDS)[number];
