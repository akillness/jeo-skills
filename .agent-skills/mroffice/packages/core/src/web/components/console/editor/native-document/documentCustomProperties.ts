/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's custom document properties (File > Properties > Custom; Microsoft
 * Support, "View or change the properties for an Office file"): each has a
 * name, one of four types (Text, Date, Number, Yes or no) and a value, and a
 * DOCPROPERTY field prints it.
 *
 * The document holds them as `attrs.customProperties`, the server's shape
 * (document_docx_custom_properties.py): `{ name, type, value }` in the
 * file's order. A property the dialog cannot edit (one linked to a
 * bookmark, a vector) is `{ name, type: "preserved", raw }`: shown, kept,
 * written back as it was. `null` (or no list) leaves the file's own part
 * as it is; a list (even an empty one) is what the file takes.
 */

export type CustomPropertyType = "text" | "number" | "date" | "yesno";

export type CustomProperty =
  | { readonly name: string; readonly type: CustomPropertyType; readonly value: string }
  | { readonly name: string; readonly type: "preserved"; readonly raw: string };

export const CUSTOM_PROPERTY_TYPES: readonly CustomPropertyType[] = ["text", "date", "number", "yesno"];
/** Word's limits: a name and a text value of up to 255 characters. */
export const MAX_CUSTOM_PROPERTY_NAME = 255;
export const MAX_CUSTOM_PROPERTY_VALUE = 255;
const MAX_CUSTOM_PROPERTIES = 512;

/** The names Word's Custom page offers in its Name box (Word 16). */
export const WORD_CUSTOM_PROPERTY_NAMES = [
  "Checked by", "Client", "Date completed", "Department", "Destination", "Disposition",
  "Division", "Document number", "Editor", "Forward to", "Group", "Language", "Mailstop",
  "Matter", "Office", "Owner", "Project", "Publisher", "Purpose", "Received from",
  "Recorded by", "Recorded date", "Reference", "Source", "Status", "Telephone number", "Typist",
] as const;

const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const NUMBER_RE = /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,15})?$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})Z)?$/;

function clean(value: string, limit: number): string {
  return value.replace(CONTROL_RE, "").slice(0, limit);
}

/** One entry in canonical form, or null (server twin
 * `normalize_custom_property`). */
export function normalizeCustomProperty(value: unknown): CustomProperty | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const name = raw.name;
  if (typeof name !== "string" || !name.trim() || name !== clean(name, MAX_CUSTOM_PROPERTY_NAME)) return null;
  const keys = Object.keys(raw).sort().join(",");
  if (raw.type === "preserved") {
    if (keys !== "name,raw,type" || typeof raw.raw !== "string" || raw.raw.length > 65_536) return null;
    return { name, type: "preserved", raw: raw.raw };
  }
  if (keys !== "name,type,value" || typeof raw.value !== "string") return null;
  const text = raw.value;
  switch (raw.type) {
    case "text":
      return text === clean(text, MAX_CUSTOM_PROPERTY_VALUE) ? { name, type: "text", value: text } : null;
    case "number":
      return NUMBER_RE.test(text) ? { name, type: "number", value: text } : null;
    case "yesno":
      return text === "true" || text === "false" ? { name, type: "yesno", value: text } : null;
    case "date": {
      const match = DATE_RE.exec(text);
      if (!match) return null;
      if (match[4] !== undefined && `${match[4]}${match[5]}${match[6]}` === "000000") return null;
      return { name, type: "date", value: text };
    }
    default:
      return null;
  }
}

/** The canonical list, or null when it is not one (a duplicate name, a
 * malformed entry, too many). */
export function normalizeCustomProperties(value: unknown): CustomProperty[] | null {
  if (!Array.isArray(value) || value.length > MAX_CUSTOM_PROPERTIES) return null;
  const seen = new Set<string>();
  const out: CustomProperty[] = [];
  for (const item of value) {
    const entry = normalizeCustomProperty(item);
    if (!entry || seen.has(entry.name.toLowerCase())) return null;
    seen.add(entry.name.toLowerCase());
    out.push(entry);
  }
  return out;
}

/** A typed value as the list stores it, or null when Word would refuse it
 * ("The value entered does not match the specified type"). */
export function customPropertyValueFromInput(type: CustomPropertyType, input: string): string | null {
  const text = input.trim();
  if (type === "text") return clean(input, MAX_CUSTOM_PROPERTY_VALUE);
  if (type === "yesno") return text === "true" || text === "false" ? text : null;
  if (type === "number") {
    const normal = text.replace(/^\+/, "");
    if (!/^-?\d+(?:\.\d+)?$/.test(normal)) return null;
    const value = Number(normal);
    if (!Number.isFinite(value)) return null;
    const written = normal.includes(".") ? normal.replace(/0+$/, "").replace(/\.$/, "") : String(Number(normal));
    return NUMBER_RE.test(written) ? written : null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3])
    ? text
    : null;
}

/** A date property's value as the reader's short date (Word prints the
 * system's: 2025/3/1 in a Chinese system, 3/1/2025 in a US one). */
function shortDate(value: string, locale?: string): string {
  const match = DATE_RE.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  try {
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" }).format(date);
  } catch {
    return `${Number(match[2])}/${Number(match[3])}/${match[1]}`;
  }
}

/** What a DOCPROPERTY field prints for the property, as Word 16 does
 * without a format switch: Y or N for Yes or no, the short date, a number
 * and text as they are. A preserved property prints nothing it can read. */
export function customPropertyDisplayValue(entry: CustomProperty, locale?: string): string {
  if (entry.type === "preserved") return "";
  if (entry.type === "yesno") return entry.value === "true" ? "Y" : "N";
  if (entry.type === "date") return shortDate(entry.value, locale);
  return entry.value;
}
