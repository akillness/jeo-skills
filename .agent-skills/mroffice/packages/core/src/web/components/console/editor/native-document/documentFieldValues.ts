/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Document field values (Word "Insert → Field" parity).
 *
 * Pure, unit-testable helpers that produce the display value for each
 * supported field type. These are intentionally free of editor/TipTap
 * dependencies so they can be tested in isolation.
 *
 * Field types supported:
 *   DATE      — current date (locale-aware format)
 *   TIME      — current time (HH:MM)
 *   PAGE      — page number placeholder (exported by the docx exporter)
 *   NUMPAGES  — total-pages placeholder (exported by the docx exporter)
 *   AUTHOR    — document author hint (passed in; falls back to empty string)
 *   FILENAME  — document filename hint (passed in; falls back to empty string)
 */

import { legacyDropdownText } from "./legacyFormFields";
import {
  indexFieldInstruction,
  normalizeIndexSettings,
  parseIndexFieldInstructionSettings,
} from "./documentIndexSettings";
import {
  authorityTableFieldInstruction,
  normalizeAuthorityTableSettings,
  parseAuthorityTableFieldInstructionSettings,
} from "./documentAuthoritySettings";
import { evaluateDocumentIfLiteralExpression } from "./documentIfField";
import {
  DOCUMENT_DATE_TIME_PICTURES,
  documentDateTimeLocaleForPicture,
  formatDocumentDateTime,
  hasFullWidthCharacters,
  isDocumentDateTimePicture,
  normalizeDocumentDateTimeLocale,
} from "./documentDateTime";
import {
  normalizeTocSettings,
  tocFieldInstruction,
} from "./referenceSettings";

export type DocumentFieldType =
  | "DATE"
  | "TIME"
  | "PAGE"
  | "NUMPAGES"
  | "AUTHOR"
  | "FILENAME"
  | "TITLE"
  | "REF"
  | "PAGEREF"
  | "NOTEREF"
  | "STYLEREF"
  | "SEQ"
  | "TOC"
  | "CITATION"
  | "INDEX"
  | "TOA"
  | "MERGEFIELD"
  | "IF"
  // Any other Word field, kept whole: the editor shows its cached result and
  // carries its code, flags and result runs (`preservedField`) unchanged.
  | "NATIVE";

export const DOCUMENT_FIELD_NODE_NAME = "documentField" as const;

/** Word-compatible refresh behavior persisted with each field atom. */
export type DocumentFieldUpdatePolicy = "on-open" | "manual";

export type DocumentFieldOptionValue = string | number | boolean;
export type DocumentFieldOptions = Record<string, DocumentFieldOptionValue>;

/**
 * The durable payload stored on the inline `documentField` atom.  A field is
 * never represented by a magic text token: `cachedValue` is only the fallback
 * Word displays until it evaluates the instruction again.
 */
export interface DocumentFieldAttrs {
  fieldType: DocumentFieldType;
  /** Closed/sanitized native instruction, retained for exact field semantics. */
  instruction: string;
  /** Structured instruction operands (target/name/levels/expression/etc.). */
  options: DocumentFieldOptions;
  format: string;
  updatePolicy: DocumentFieldUpdatePolicy;
  cachedValue: string;
  /**
   * Word's `w:fldLock`: the field is never recalculated, its cached result is
   * what it shows (Ctrl+F11). Read from the file and written back; the editor
   * dropped it on load, so a locked DATE showed today and exported unlocked
   * (OFL-034).
   */
  locked: boolean;
}

export interface DocumentFieldInput {
  fieldType: unknown;
  instruction?: unknown;
  options?: unknown;
  format?: unknown;
  updatePolicy?: unknown;
  cachedValue?: unknown;
  locked?: unknown;
}

/** All field types in a stable order for UI listing. */
export const DOCUMENT_FIELD_TYPES: DocumentFieldType[] = [
  "DATE",
  "TIME",
  "PAGE",
  "NUMPAGES",
  "AUTHOR",
  "FILENAME",
  "TITLE",
  "REF",
  "SEQ",
  "TOC",
  "CITATION",
  "INDEX",
  "TOA",
  "MERGEFIELD",
  "IF",
];

/**
 * Every field type the editor holds: the insertable ones above plus the
 * fields Word's own commands write -- a cross-reference's PAGEREF / NOTEREF
 * and a chapter-numbered caption's STYLEREF -- which arrive with a document
 * and keep their field, but are not offered in the Field dialog.
 */
const RECOGNIZED_DOCUMENT_FIELD_TYPES: readonly DocumentFieldType[] = [
  ...DOCUMENT_FIELD_TYPES,
  "PAGEREF",
  "NOTEREF",
  "STYLEREF",
  "NATIVE",
];

/** STYLEREF switches in the order an instruction states them. */
const STYLEREF_SWITCH_ORDER = "nrwslpt";

/** Context for contextual fields (AUTHOR, FILENAME). */
export interface FieldContext {
  /** The document author name, if known. */
  author?: string | null;
  /** The document filename / title, if known. */
  filename?: string | null;
  /** Document title/package property, when known. */
  title?: string | null;
  /** Override the "now" used for DATE/TIME (for unit testing). */
  now?: Date;
  /** One-based structural editor page number, when pagination is available. */
  pageNumber?: number | null;
  /** The page number as the page itself shows it (its section's number
   * format and start): a header or footer open on a sheet shows the number
   * that sheet's band paints there. Wins over `pageNumber` for PAGE. */
  pageLabel?: string | null;
  /** Total structural editor page count, when pagination is available. */
  pageCount?: number | null;
  /** The page's number as a value in its section's numbering (9 where the
   * section shows ix): what a PAGE field's own format switch formats. */
  pageOrdinal?: number | null;
}

const DOCUMENT_FIELD_FORMATS = {
  DATE: [
    "M/d/yyyy",
    "yyyy-MM-dd",
    "MMMM d, yyyy",
    ...DOCUMENT_DATE_TIME_PICTURES,
  ],
  TIME: ["HH:mm", "h:mm AM/PM", ...DOCUMENT_DATE_TIME_PICTURES],
  PAGE: ["Arabic", "Roman", "roman", "Alphabetic", "alphabetic"],
  NUMPAGES: ["Arabic", "Roman", "roman", "Alphabetic", "alphabetic"],
  AUTHOR: [""],
  FILENAME: [""],
  TITLE: [""],
  REF: [""],
  PAGEREF: [""],
  NOTEREF: [""],
  STYLEREF: [""],
  SEQ: ["Arabic", "Roman", "roman", "Alphabetic", "alphabetic"],
  TOC: [""],
  CITATION: [""],
  INDEX: [""],
  TOA: [""],
  MERGEFIELD: [""],
  IF: [""],
  NATIVE: [""],
} as const satisfies Record<DocumentFieldType, readonly string[]>;

export const DEFAULT_DOCUMENT_FIELD_FORMAT = {
  DATE: "M/d/yyyy",
  TIME: "HH:mm",
  PAGE: "Arabic",
  NUMPAGES: "Arabic",
  AUTHOR: "",
  FILENAME: "",
  TITLE: "",
  REF: "",
  PAGEREF: "",
  NOTEREF: "",
  STYLEREF: "",
  SEQ: "Arabic",
  TOC: "",
  CITATION: "",
  INDEX: "",
  TOA: "",
  MERGEFIELD: "",
  IF: "",
  NATIVE: "",
} as const satisfies Record<DocumentFieldType, string>;

/** The closed formats a field type takes, in the order a picker lists them. */
export function documentFieldFormats(type: DocumentFieldType): readonly string[] {
  return DOCUMENT_FIELD_FORMATS[type];
}

export function normalizeDocumentFieldType(
  value: unknown,
): DocumentFieldType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return (RECOGNIZED_DOCUMENT_FIELD_TYPES as readonly string[]).includes(normalized)
    ? (normalized as DocumentFieldType)
    : null;
}

export function normalizeDocumentFieldUpdatePolicy(
  value: unknown,
): DocumentFieldUpdatePolicy {
  return value === "manual" ? "manual" : "on-open";
}

/**
 * Keep field formats closed.  Besides making rendering deterministic this
 * prevents a forged format from escaping into a Word instruction string.
 */
export function normalizeDocumentFieldFormat(
  type: DocumentFieldType,
  value: unknown,
): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  const formats = DOCUMENT_FIELD_FORMATS[type] as readonly string[];
  return formats.includes(candidate)
    ? candidate
    : DEFAULT_DOCUMENT_FIELD_FORMAT[type];
}

export function normalizeDocumentFieldOptions(
  value: unknown,
): DocumentFieldOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: DocumentFieldOptions = {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key))
    .slice(0, 16);
  for (const [key, raw] of entries) {
    if (typeof raw === "boolean") normalized[key] = raw;
    else if (typeof raw === "number" && Number.isFinite(raw)) {
      normalized[key] = Math.max(-1_000_000, Math.min(1_000_000, raw));
    } else if (typeof raw === "string") {
      normalized[key] = sanitizeFieldContextString(raw);
    }
  }
  return normalized;
}

function normalizeDocumentFieldOptionsForType(
  type: DocumentFieldType,
  value: unknown,
): DocumentFieldOptions {
  // INDEX separators intentionally preserve leading/trailing spaces; routing
  // them through the generic context-string sanitizer would trim native field
  // semantics such as the default comma+space separator.
  if (type === "INDEX") return { ...normalizeIndexSettings(value) };
  if (type === "TOA") return { ...normalizeAuthorityTableSettings(value) };
  // A kept Word field states everything in its code (`preservedField`).
  if (type === "NATIVE") return {};
  const options = normalizeDocumentFieldOptions(value);
  if (type === "DATE" || type === "TIME") {
    const normalized: DocumentFieldOptions = {};
    if (options.locale === "zh-CN" || options.locale === "en-US") {
      normalized.locale = options.locale;
    }
    if (options.fullWidth === true) normalized.fullWidth = true;
    return normalized;
  }
  return options;
}

function optionString(options: DocumentFieldOptions, key: string): string {
  return typeof options[key] === "string" ? String(options[key]) : "";
}

function instructionIdentifier(value: unknown): string {
  return sanitizeFieldContextString(value)
    // Letters of every script: a Chinese Word writes `SEQ 表格` and
    // `MERGEFIELD 姓名`. Never a space, quote or backslash.
    .replace(/[^\p{L}\p{N}_.:-]/gu, "")
    .slice(0, 64);
}

function safeIfExpression(value: unknown): string {
  // Letters and digits of every script: a Chinese Word compares "是" with
  
  const expression = sanitizeFieldContextString(value)
    .replace(/[^\p{L}\p{N} _.'"<>=!?:,+\-()/]/gu, "")
    .slice(0, 256);
  return /\b(?:DDE|DDEAUTO|INCLUDETEXT|INCLUDEPICTURE|LINK|MACROBUTTON)\b/i.test(
    expression,
  )
    ? ""
    : expression;
}

function canonicalDocumentFieldInstruction(
  type: DocumentFieldType,
  format: string,
  options: DocumentFieldOptions,
): string | null {
  switch (type) {
    case "DATE":
    case "TIME":
      return ` ${type} \\@ "${format}" `;
    case "PAGE":
    case "NUMPAGES":
      return ` ${type} \\* ${format} `;
    case "AUTHOR":
    case "FILENAME":
    case "TITLE":
      return ` ${type} `;
    case "REF":
    case "PAGEREF":
    case "NOTEREF": {
      // Word's cross-reference fields: the paragraph-number form (\\r \\n
      // \\w), the note's own formatting (\\f), above/below (\\p), the link.
      const target = instructionIdentifier(options.target);
      if (!target) return null;
      const parts: string[] = [type, target];
      const mode = options.numberMode;
      if (type === "REF" && (mode === "r" || mode === "n" || mode === "w")) {
        parts.push(`\\${mode}`);
      }
      if (type === "NOTEREF" && options.formatted === true) parts.push("\\f");
      if (options.position === true) parts.push("\\p");
      if (options.hyperlink !== false) parts.push("\\h");
      return ` ${parts.join(" ")} `;
    }
    case "STYLEREF": {
      const level = options.level;
      const styleName =
        typeof options.styleName === "string" &&
        /^[\p{L}\p{N}_][\p{L}\p{N}_ ]{0,63}$/u.test(options.styleName)
          ? options.styleName
          : null;
      const operand =
        typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 9
          ? String(level)
          : styleName
            ? `"${styleName}"`
            : null;
      if (!operand) return null;
      const switches = typeof options.switches === "string" ? options.switches : "";
      const ordered = [...STYLEREF_SWITCH_ORDER].filter((letter) =>
        switches.includes(letter),
      );
      return ` ${["STYLEREF", operand, ...ordered.map((letter) => `\\${letter}`)].join(" ")} `;
    }
    case "SEQ": {
      const identifier = instructionIdentifier(options.identifier);
      if (!identifier) return null;
      const parts = [`SEQ ${identifier} \\* ${format}`];
      const restart = options.restartLevel;
      if (typeof restart === "number" && Number.isInteger(restart) && restart >= 1 && restart <= 9) {
        parts.push(`\\s ${restart}`);
      }
      const reset = options.resetTo;
      if (typeof reset === "number" && Number.isInteger(reset) && reset >= 0 && reset <= 32767) {
        parts.push(`\\r ${reset}`);
      }
      if (options.repeat === true) parts.push("\\c");
      if (options.hidden === true) parts.push("\\h");
      return ` ${parts.join(" ")} `;
    }
    case "TOC": {
      return tocFieldInstruction(normalizeTocSettings(options));
    }
    case "CITATION": {
      const tag = instructionIdentifier(options.tag);
      return tag ? ` CITATION ${tag} ` : null;
    }
    case "INDEX":
      return indexFieldInstruction(normalizeIndexSettings(options));
    case "TOA":
      return authorityTableFieldInstruction(
        normalizeAuthorityTableSettings(options),
      );
    case "MERGEFIELD": {
      const name = instructionIdentifier(options.name);
      return name ? ` MERGEFIELD ${name} ` : null;
    }
    case "NATIVE":
      return null;
    case "IF": {
      const expression = safeIfExpression(options.expression);
      return expression ? ` IF ${expression} ` : null;
    }
  }
}

export function normalizeDocumentFieldInstruction(
  type: DocumentFieldType,
  value: unknown,
  format: string,
  options: DocumentFieldOptions,
): string {
  const candidate =
    typeof value === "string"
      ? value
          .replace(/[\x00-\x1f\x7f]/g, " ")
          .trim()
          .slice(0, 512)
      : "";
  const keyword = candidate.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
  const dangerous =
    /[{}]|\b(?:DDE|DDEAUTO|INCLUDETEXT|INCLUDEPICTURE|LINK|MACROBUTTON)\b/i.test(
      candidate,
    );
  if (type === "INDEX" || type === "TOA") {
    return canonicalDocumentFieldInstruction(type, format, options) ?? "";
  }
  // A kept Word field's instruction is its code exactly as read, spaces
  // included; the server checks it against the code it carries (its bound,
  // MAX_PRESERVED_FIELD_CODE_TEXT: a Mendeley citation's whole record).
  if (type === "NATIVE") return typeof value === "string" ? value.slice(0, 262_144) : "";
  if (candidate && keyword === type && !dangerous) return ` ${candidate} `;
  return canonicalDocumentFieldInstruction(type, format, options) ?? "";
}

export function sanitizeDocumentFieldCachedValue(raw: unknown): string {
  // The cached result is document text: a locked field shows it as it is,
  
  // same length cap as the context strings applies.
  if (typeof raw !== "string") return "";
  return raw.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 256);
}

export function normalizeDocumentFieldAttrs(
  value: unknown,
): DocumentFieldAttrs | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const fieldType = normalizeDocumentFieldType(candidate.fieldType);
  if (!fieldType) return null;
  const format = normalizeDocumentFieldFormat(fieldType, candidate.format);
  const options = normalizeDocumentFieldOptionsForType(
    fieldType,
    candidate.options,
  );
  return {
    fieldType,
    instruction: normalizeDocumentFieldInstruction(
      fieldType,
      candidate.instruction,
      format,
      options,
    ),
    options,
    format,
    updatePolicy: normalizeDocumentFieldUpdatePolicy(candidate.updatePolicy),
    cachedValue: sanitizeDocumentFieldCachedValue(candidate.cachedValue),
    locked: candidate.locked === true,
  };
}

/**
 * Sanitize a context string (author / filename) so it never carries control
 * characters or exceeds a safe length.
 */
export function sanitizeFieldContextString(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, 256);
}

/**
 * Format a date as a locale-aware short date string, e.g. "6/15/2026".
 * Uses `en-US` as a stable fallback when `Intl` is unavailable.
 */
export function formatFieldDate(date: Date, format = "M/d/yyyy"): string {
  if (isDocumentDateTimePicture(format)) {
    return formatDocumentDateTime(date, format);
  }
  if (format === "yyyy-MM-dd") {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  try {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: format === "MMMM d, yyyy" ? "long" : "numeric",
      day: "numeric",
    });
  } catch {
    // Fallback: ISO date slice.
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Format a time as HH:MM (24-hour), e.g. "14:05".
 */
export function formatFieldTime(date: Date, format = "HH:mm"): string {
  if (isDocumentDateTimePicture(format)) {
    return formatDocumentDateTime(date, format);
  }
  if (format === "h:mm AM/PM") {
    const hour = date.getHours();
    const displayHour = hour % 12 || 12;
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${displayHour}:${minute} ${hour < 12 ? "AM" : "PM"}`;
  }
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * The placeholder text inserted for PAGE / NUMPAGES fields. These are
 * symbolic markers the docx exporter replaces with the real W:fldChar
 * page-number fields. They match the exporter's expected marker strings
 * (see docx-export.ts) or stand alone as a visible hint in the editor.
 */
export const FIELD_PAGE_PLACEHOLDER = "[PAGE]";
export const FIELD_NUMPAGES_PLACEHOLDER = "[NUMPAGES]";

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 1_000_000
    ? value
    : null;
}

/**
 * Resolve the display/insert value for a given field type.
 *
 * @param type  One of the supported DocumentFieldType values.
 * @param ctx   Optional context for AUTHOR / FILENAME / now override.
 * @returns     The string to insert into the document at the cursor.
 */
export function resolveFieldValue(
  type: DocumentFieldType,
  ctx?: FieldContext,
): string {
  const now = ctx?.now ?? new Date();
  switch (type) {
    case "DATE":
      return formatFieldDate(now);
    case "TIME":
      return formatFieldTime(now);
    case "PAGE":
      return String(positiveInteger(ctx?.pageNumber) ?? FIELD_PAGE_PLACEHOLDER);
    case "NUMPAGES":
      return String(
        positiveInteger(ctx?.pageCount) ?? FIELD_NUMPAGES_PLACEHOLDER,
      );
    case "AUTHOR":
      return sanitizeFieldContextString(ctx?.author) || "";
    case "FILENAME":
      return sanitizeFieldContextString(ctx?.filename) || "";
    case "TITLE":
      return sanitizeFieldContextString(ctx?.title) || "";
    case "REF":
    case "PAGEREF":
    case "NOTEREF":
    case "STYLEREF":
    case "SEQ":
    case "TOC":
    case "CITATION":
    case "INDEX":
    case "TOA":
    case "MERGEFIELD":
    case "IF":
      return `[${type}]`;
    case "NATIVE":
      // A kept Word field is never resolved here: its result is the cached
      // value Word wrote, which the field atom carries as it is.
      return "";
    default: {
      // Exhaustiveness guard; TypeScript narrows to `never` here.
      const _exhaustive: never = type;
      void _exhaustive;
      return "";
    }
  }
}

/**
 * A page number shown in its field's number format (the `\\* Roman` /
 * `\\* alphabetic` switch Word applies to the field's own result, whatever
 * the page's number format is). A label that is not a plain number (a
 * section numbered i, ii, iii) is shown as it is.
 */
function withNumberFormat(value: string, format: string): string {
  if (!/^[0-9]{1,6}$/.test(value)) return value;
  const number = Number(value);
  if (number < 1) return value;
  if ((format === "Roman" || format === "roman") && number < 4000) {
    let rest = number;
    let out = "";
    for (const [step, digits] of [
      [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
      [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
    ] as const) {
      while (rest >= step) {
        out += digits;
        rest -= step;
      }
    }
    return format === "roman" ? out.toLowerCase() : out;
  }
  if (format === "Alphabetic" || format === "alphabetic") {
    const letters = String.fromCharCode(65 + ((number - 1) % 26)).repeat(Math.floor((number - 1) / 26) + 1);
    return format === "alphabetic" ? letters.toLowerCase() : letters;
  }
  return value;
}

/** A header/footer page number in Word's ArabicDash format ("- 1 -"): the
 * field node's own formats have no such switch, so the band story carries
 * it in `options.bandFormat` and the field draws it as the band does. */
export function withBandDashFormat(attrs: unknown, shown: string): string {
  const options = attrs && typeof attrs === "object"
    ? (attrs as { options?: { bandFormat?: unknown } | null }).options
    : null;
  return options?.bandFormat === "ArabicDash" && /^[0-9]{1,6}$/.test(shown) ? `- ${shown} -` : shown;
}

/** Whether a kept FORMCHECKBOX field states no form data at all (the
 * server keeps the field whole, with no `form`): Word draws such a field as
 * nothing. `window.__docsFormlessCheckBoxOff = true` draws its empty box as
 * before. */
function formlessCheckBoxDrawsNothing(preserved: unknown): boolean {
  if (
    typeof window !== "undefined" &&
    (window as Window & { __docsFormlessCheckBoxOff?: boolean }).__docsFormlessCheckBoxOff === true
  ) {
    return false;
  }
  return (
    !!preserved &&
    typeof preserved === "object" &&
    !Array.isArray(preserved) &&
    !Array.isArray((preserved as { form?: unknown }).form)
  );
}

/** Whether a kept FORMCHECKBOX field's form data (`preservedField.form`,
 * the w:ffData items the server carries) says the box is checked: its
 * `checked` element, else its `default`. */
function formCheckBoxChecked(preserved: unknown): boolean {
  const form = (preserved as { form?: unknown } | null)?.form;
  if (!Array.isArray(form)) return false;
  const box = form.find((item) => (item as { n?: unknown })?.n === "checkBox") as
    | { c?: { n?: unknown; a?: { val?: unknown } }[] }
    | undefined;
  const items = Array.isArray(box?.c) ? box.c : [];
  const on = (name: string) => {
    const item = items.find((entry) => entry?.n === name);
    if (!item) return null;
    const val = item.a?.val;
    return val === undefined || val === "1" || val === "true" || val === "on";
  };
  return on("checked") ?? on("default") ?? false;
}

/** Resolve a structured field without ever mutating its cached snapshot. */
export function resolveDocumentFieldDisplay(
  value: unknown,
  ctx?: FieldContext,
): string {
  const attrs = normalizeDocumentFieldAttrs(value);
  if (!attrs) return "";
  // A locked field is its cached result, whatever it would compute now --
  
  if (attrs.locked) return attrs.cachedValue;
  // A field that states a cache states a result, even an empty one; only a
  
  const cacheStated =
    typeof (value as { cachedValue?: unknown }).cachedValue === "string";
  const now = ctx?.now ?? new Date();
  switch (attrs.fieldType) {
    case "DATE":
      return isDocumentDateTimePicture(attrs.format)
        ? formatDocumentDateTime(now, attrs.format, {
            locale: normalizeDocumentDateTimeLocale(attrs.options.locale),
            fullWidth: attrs.options.fullWidth === true,
          })
        : formatFieldDate(now, attrs.format);
    case "TIME":
      return isDocumentDateTimePicture(attrs.format)
        ? formatDocumentDateTime(now, attrs.format, {
            locale: normalizeDocumentDateTimeLocale(attrs.options.locale),
            fullWidth: attrs.options.fullWidth === true,
          })
        : formatFieldTime(now, attrs.format);
    case "PAGE": {
      // A field's own format switch formats the page's number, whatever the
      // section's format made of its label (OFL-013: \* Arabic on a page
      // its section numbers ix showed ix, \* Roman stayed lower-case).
      // Plain PAGE normalizes to "Arabic" too: only a non-default format or a
      // written \* Arabic is the field's own switch.
      const ordinal = positiveInteger(ctx?.pageOrdinal);
      const explicitFormat =
        attrs.format !== "Arabic" || /\\\*\s*Arabic\b/i.test(attrs.instruction ?? "");
      if (ordinal !== null && explicitFormat) return withNumberFormat(String(ordinal), attrs.format);
      const label = sanitizeFieldContextString(ctx?.pageLabel);
      if (label) return withNumberFormat(label, attrs.format);
      const page = positiveInteger(ctx?.pageNumber);
      return page === null
        ? attrs.cachedValue || FIELD_PAGE_PLACEHOLDER
        : withNumberFormat(String(page), attrs.format);
    }
    case "NUMPAGES": {
      const count = positiveInteger(ctx?.pageCount);
      return count === null
        ? attrs.cachedValue || FIELD_NUMPAGES_PLACEHOLDER
        : withNumberFormat(String(count), attrs.format);
    }
    case "NATIVE":
      // Word computes it; the editor shows what Word stored. A legacy check
      // box form field stores no result: Word draws its box from the form
      // data (checked, else its default).
      if (!attrs.cachedValue && /^\s*FORMCHECKBOX\b/i.test(attrs.instruction)) {
        const kept = (value as { preservedField?: unknown }).preservedField;
        // One Word wrote without its form data (no w:ffData) is drawn as
        // nothing: Word has no box to draw (corpus R493-D10, its PDF: one
        // box a row, from the field with form data beside it).
        if (formlessCheckBoxDrawsNothing(kept)) return "";
        return formCheckBoxChecked(kept) ? "\u2612" : "\u2610";
      }
      // A legacy drop-down shows the entry its form data names (w:ddList
      // w:result, else the first), which Word writes no result runs for
      // (corpus R251-D21's "MARINE GUIDANCE NOTE" drew empty).
      if (/^\s*FORMDROPDOWN\b/i.test(attrs.instruction)) {
        return legacyDropdownText(value) || attrs.cachedValue;
      }
      return attrs.cachedValue;
    case "AUTHOR":
      return sanitizeFieldContextString(ctx?.author) || attrs.cachedValue;
    case "FILENAME":
      return sanitizeFieldContextString(ctx?.filename) || attrs.cachedValue;
    case "TITLE":
      return sanitizeFieldContextString(ctx?.title) || attrs.cachedValue;
    case "MERGEFIELD": {
      const name = optionString(attrs.options, "name");
      return attrs.cachedValue || (name ? `«${name}»` : "[MERGEFIELD]");
    }
    case "IF": {
      const evaluated = evaluateDocumentIfLiteralExpression(
        optionString(attrs.options, "expression"),
      );
      if (evaluated !== null) return evaluated;
      return cacheStated ? attrs.cachedValue : "[IF]";
    }
    case "REF":
    case "PAGEREF":
    case "NOTEREF":
    case "STYLEREF":
    case "SEQ":
    case "TOC":
    case "CITATION":
    case "INDEX":
    case "TOA":
      return attrs.cachedValue || `[${attrs.fieldType}]`;
  }
}

/** Build a closed atom payload and capture a display fallback for Word. */
export function createDocumentFieldAttrs(
  fieldType: unknown,
  options: Omit<DocumentFieldInput, "fieldType"> & {
    context?: FieldContext;
  } = {},
): DocumentFieldAttrs | null {
  const type = normalizeDocumentFieldType(fieldType);
  if (!type) return null;
  const format = normalizeDocumentFieldFormat(type, options.format);
  const normalizedOptions = normalizeDocumentFieldOptionsForType(
    type,
    options.options,
  );
  const instruction = normalizeDocumentFieldInstruction(
    type,
    options.instruction,
    format,
    normalizedOptions,
  );
  if (!instruction) return null;
  const explicit = sanitizeDocumentFieldCachedValue(options.cachedValue);
  const cachedValue =
    explicit ||
    resolveDocumentFieldDisplay(
      {
        fieldType: type,
        instruction,
        options: normalizedOptions,
        format,
        updatePolicy: options.updatePolicy,
        cachedValue: "",
        locked: options.locked === true,
      },
      options.context,
    );
  return {
    fieldType: type,
    instruction,
    options: normalizedOptions,
    format,
    updatePolicy: normalizeDocumentFieldUpdatePolicy(options.updatePolicy),
    cachedValue,
    locked: options.locked === true,
  };
}

/**
 * Convert the structured atom into a closed Word field instruction.  Every
 * interpolated format has already passed a per-field allowlist.
 */
export function documentFieldInstruction(value: unknown): string | null {
  const attrs = normalizeDocumentFieldAttrs(value);
  if (!attrs) return null;
  return attrs.instruction || null;
}

/** Parse the native instruction subset we deliberately round-trip. */
export function parseDocumentFieldInstruction(
  instruction: unknown,
  cachedValue: unknown = "",
  updatePolicy: unknown = "on-open",
): DocumentFieldAttrs | null {
  if (typeof instruction !== "string") return null;
  const keyword = instruction.trim().match(/^([A-Za-z]+)/)?.[1];
  const fieldType = normalizeDocumentFieldType(keyword);
  if (!fieldType) return null;

  let format: string | undefined;
  const options: DocumentFieldOptions = {};
  const trimmed = instruction.trim();
  const tokens = trimmed.match(/"[^"]*"|\S+/g) ?? [];
  const firstOperand = tokens.slice(1).find((token) => !token.startsWith("\\"));
  const operand = firstOperand?.replace(/^"|"$/g, "") ?? "";
  if (fieldType === "DATE" || fieldType === "TIME") {
    format = instruction.match(/\\@\s+"([^"]+)"/i)?.[1];
    const locale = format
      ? documentDateTimeLocaleForPicture(format)
      : undefined;
    if (locale) options.locale = locale;
    if (hasFullWidthCharacters(sanitizeDocumentFieldCachedValue(cachedValue))) {
      options.fullWidth = true;
    }
  } else if (fieldType === "PAGE" || fieldType === "NUMPAGES") {
    format = instruction.match(/\\\*\s+([^\s]+)/i)?.[1];
  } else if (fieldType === "REF" || fieldType === "PAGEREF" || fieldType === "NOTEREF") {
    options.target = operand;
    options.hyperlink = /\\h\b/i.test(instruction);
    const mode = fieldType === "REF" ? instruction.match(/\\([rnw])\b/i)?.[1] : undefined;
    if (mode) options.numberMode = mode.toLowerCase();
    if (fieldType === "NOTEREF" && /\\f\b/i.test(instruction)) options.formatted = true;
    if (/\\p\b/i.test(instruction)) options.position = true;
  } else if (fieldType === "STYLEREF") {
    if (/^\d$/.test(firstOperand ?? "")) options.level = Number(firstOperand);
    else if (operand) options.styleName = operand;
    options.switches = [...STYLEREF_SWITCH_ORDER]
      .filter((letter) => new RegExp(`\\\\${letter}\\b`, "i").test(instruction))
      .join("");
  } else if (fieldType === "SEQ") {
    options.identifier = operand;
    format = instruction.match(/\\\*\s+([^\s]+)/i)?.[1];
    const restart = instruction.match(/\\s\s+(\d)\b/i)?.[1];
    if (restart) options.restartLevel = Number(restart);
    const reset = instruction.match(/\\r\s+(\d+)\b/i)?.[1];
    if (reset) options.resetTo = Number(reset);
    if (/\\c\b/i.test(instruction)) options.repeat = true;
    if (/\\h\b/i.test(instruction)) options.hidden = true;
  } else if (fieldType === "TOC") {
    options.levels = instruction.match(/\\o\s+"(\d-\d)"/i)?.[1] ?? "1-3";
    options.hyperlinks = /\\h\b/i.test(instruction);
    // `\n "2-2"` drops only those levels' numbers.
    options.showPageNumbers = !/\\n(?!\s+")(?:\s|$)/i.test(instruction);
    options.rightAlignPageNumbers = !/\\p\s+"[^"]*"/i.test(instruction);
    options.tabLeader = "dot";
  } else if (fieldType === "CITATION") {
    options.tag = operand;
  } else if (fieldType === "INDEX") {
    Object.assign(options, parseIndexFieldInstructionSettings(instruction));
  } else if (fieldType === "TOA") {
    const settings = parseAuthorityTableFieldInstructionSettings(instruction);
    if (!settings) return null;
    Object.assign(options, settings);
  } else if (fieldType === "MERGEFIELD") {
    options.name = operand;
  } else if (fieldType === "IF") {
    options.expression = trimmed.replace(/^IF\b/i, "").trim();
  }
  return createDocumentFieldAttrs(fieldType, {
    instruction,
    options,
    format,
    updatePolicy,
    cachedValue,
  });
}

/**
 * i18n key suffix for each field type — used by the toolbar to call
 * `t(`toolbar.field_{type}`)`.
 */
export function fieldLabelKey(type: DocumentFieldType): string {
  return `toolbar.field_${type}` as const;
}
