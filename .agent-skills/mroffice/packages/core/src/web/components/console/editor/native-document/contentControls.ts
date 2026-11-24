"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { onlyofficeAllowsContentControlChange } from "../../../../lib/embed/onlyoffice-frame";

/**
 * Document CONTENT CONTROLS (Word "structured document tags" / `<w:sdt>`) — pure
 * preservation logic.
 *
 * Word forms are built from CONTENT CONTROLS: a bordered region carrying a TYPE
 * (a plain-text or rich-text input, a drop-down / combo list, a checkbox, a date
 * picker, a picture placeholder) plus identifying metadata (a friendly `alias`
 * title, a programmatic `tag`, a numeric `id`, an edit `lock`). On the OOXML wire
 * each one is a `<w:sdt>` wrapping a `<w:sdtPr>` (the metadata) and a
 * `<w:sdtContent>` (the live inner content the user fills in).
 *
 * SCOPE — this module preserves the control LOSSLESSLY across import → export so
 * an imported Word form survives a round-trip with its type + metadata + inner
 * content intact, and renders with a subtle control boundary in the editor. It is
 * NOT interactive form-filling (toggling a checkbox, choosing a list value,
 * picking a date in the editor); the inner content simply displays + stays
 * editable like ordinary prose, and the control config rides along on the
 * mark/node attrs untouched. See contentControlExtension.tsx for the TipTap
 * wiring.
 *
 * NODE MODEL — an INLINE `<w:sdt>` (runs inside a paragraph) becomes a `contentControl`
 * MARK applied to the inner runs (so inner bold/italic/links survive), and a BLOCK
 * `<w:sdt>` (whole paragraphs) becomes a `blockContentControl` block NODE wrapping
 * those paragraphs. The inline MARK additionally carries a unique-per-instance
 * `controlKey` (see {@link controlKeyFor}) so two ADJACENT but distinct controls
 * do not merge into one mark on the editor side, and so the exporter can group a
 * contiguous run of marked content into ONE `<w:sdt>` per distinct control — the
 * same way the comment mark keeps threads distinct via a `threadId`.
 *
 * Everything in THIS module is framework-free (plain JSON + sanitization
 * primitives) so the metadata rules can be unit-tested headlessly and SHARED by
 * the importer (officeCompiler.ts), the exporter (docx-export.ts), and the
 * editor extension.
 *
 * SECURITY: every metadata field is user/document-supplied and round-trips
 * through persisted JSON and OOXML attributes/text. Each is scrubbed (control
 * bytes stripped, length-clamped) and a list of items is count-capped here, so a
 * forged/imported control can never smuggle markup, an attribute-breaking
 * payload, or an unbounded blob past this edge. The numeric `id` is re-derived to
 * a bounded non-negative integer; the `controlKey` is restricted to a token
 * alphabet.
 */

/** The inline content-control MARK name (run-level `<w:sdt>` inside a paragraph). */
export const CONTENT_CONTROL_MARK_NAME = "contentControl";

/**
 * The block-level content-control NODE name (a `<w:sdt>` wrapping whole
 * paragraphs). Distinct from the inline mark because it holds BLOCK content
 * (paragraphs / lists) rather than inline runs, and TipTap requires the
 * mark/node split.
 */
export const BLOCK_CONTENT_CONTROL_NODE_NAME = "blockContentControl";

/**
 * The floating TEXT BOX node name (a Word `<w:txbxContent>` — the inner block
 * content of a drawing/`<wps:txbx>` text frame). Like {@link
 * BLOCK_CONTENT_CONTROL_NODE_NAME} it holds BLOCK content (paragraphs / lists /
 * tables) and is `defining`, but it is a DISTINCT block so an imported floating
 * text box survives a DOCX round-trip as its own bordered frame rather than
 * flattening into the body flow. Geometry / size / wrap / anchor / legacy VML are
 * intentionally out of scope — this preserves only the box + its inner content.
 */
export const TEXT_BOX_NODE_NAME = "textBox";

/** The content-control TYPE values we model (the `<w:sdtPr>` type marker). */
export type ContentControlType =
  | "text"
  | "richText"
  | "checkbox"
  | "dropDownList"
  | "comboBox"
  | "date"
  | "picture";

const CONTROL_TYPES: ReadonlySet<ContentControlType> = new Set([
  "text",
  "richText",
  "checkbox",
  "dropDownList",
  "comboBox",
  "date",
  "picture",
]);

/**
 * The default type when a `<w:sdtPr>` carries NO recognized type marker. Word
 * treats a property-less sdt as a generic rich-text container, so we mirror that.
 */
export const DEFAULT_CONTENT_CONTROL_TYPE: ContentControlType = "richText";

/** Max length of the `alias` (the control's friendly title) and the `tag`. */
export const MAX_CONTROL_LABEL_LENGTH = 200;
/** Max length of a single list item's display text / value, and the date config. */
export const MAX_CONTROL_ITEM_LENGTH = 200;
/** Max number of list items preserved on a drop-down / combo control. */
export const MAX_CONTROL_LIST_ITEMS = 100;
/** Largest `id` we keep (Word ids are 32-bit; clamp defensively). */
const MAX_CONTROL_ID = 0x7fffffff;
/** Max length of the editor-side unique `controlKey` token. */
export const MAX_CONTROL_KEY_LENGTH = 64;

const CONTROL_TEXT_CONTROL_CHARS_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;
/** A UTF-16 surrogate without its partner (half of an astral character). */
// `u`: a well-formed pair is one code point, so this matches only a lone half
// (no lookbehind, which Safari before 16.4 cannot compile).
const LONE_SURROGATE_RE = /[\uD800-\uDFFF]/gu;
/** Everything outside the safe token alphabet for a `controlKey`. */
const CONTROL_KEY_DISALLOWED_RE = /[^A-Za-z0-9_-]/g;

/**
 * Sanitize a content-control metadata text fragment (alias / tag / list item /
 * date format / lock token). Drops control bytes, collapses internal whitespace
 * to single spaces, trims, and clamps to `max`. Literal angle brackets / quotes
 * are PRESERVED (React/TipTap + the OOXML XML-escaper handle them); only control
 * bytes that could corrupt the DOM / XML stream are removed. Returns "" for any
 * non-string / empty input. PURE.
 */
export function sanitizeControlText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const clamped = value
    // Half a character arriving on its own is not text Word can store.
    .replace(LONE_SURROGATE_RE, "")
    .replace(CONTROL_TEXT_CONTROL_CHARS_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  // The limit counts UTF-16 units; one falling inside an emoji or an
  // extension-plane character keeps the whole character out rather than its
  
  const last = clamped.charCodeAt(clamped.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? clamped.slice(0, -1) : clamped;
}

/** Coerce an arbitrary value to the modeled control type, defaulting safely. */
export function normalizeControlType(value: unknown): ContentControlType {
  return typeof value === "string" && CONTROL_TYPES.has(value as ContentControlType)
    ? (value as ContentControlType)
    : DEFAULT_CONTENT_CONTROL_TYPE;
}

/**
 * Coerce an arbitrary value to a bounded non-negative integer `id`, or null when
 * the value carries no usable number. Word stamps a (sometimes negative or huge)
 * 32-bit id; we keep a clean non-negative integer so the round-trip is stable and
 * the attribute can never overflow / inject. PURE.
 */
export function normalizeControlId(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return null;
  const int = Math.trunc(Math.abs(n));
  return int > MAX_CONTROL_ID ? MAX_CONTROL_ID : int;
}

/**
 * Normalize an arbitrary `controlKey` candidate to a bounded, attribute-safe
 * token (the editor-side unique-per-instance id that keeps adjacent controls
 * distinct). Strips every character outside [A-Za-z0-9_-] and clamps the length.
 * Returns null when nothing usable remains, so a forged/blank key never reaches
 * the DOM. PURE.
 */
export function sanitizeControlKey(value: unknown): string | null {
  if (typeof value === "string") {
    const cleaned = value
      .replace(CONTROL_KEY_DISALLOWED_RE, "")
      .slice(0, MAX_CONTROL_KEY_LENGTH);
    if (cleaned) return cleaned;
  }
  return null;
}

let controlKeyCounter = 0;

/**
 * Generate a fresh, attribute-safe unique `controlKey`. When a usable `seed` is
 * supplied (already a safe token) it is reused; otherwise a new key is minted via
 * crypto.randomUUID when available (browser + modern Node), else a
 * timestamp+counter fallback so the value is still unique within a session. The
 * result is funneled through {@link sanitizeControlKey} so it is always within the
 * safe alphabet + length bound. Mirrors the comment mark's `threadIdFor`, so two
 * adjacent `<w:sdt>` controls each get a distinct key and never merge into one
 * mark.
 */
export function controlKeyFor(seed?: unknown): string {
  const fromSeed = sanitizeControlKey(seed);
  if (fromSeed) return fromSeed;
  let raw: string;
  const cryptoObj =
    typeof globalThis !== "undefined"
      ? (globalThis.crypto as { randomUUID?: () => string } | undefined)
      : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    raw = cryptoObj.randomUUID();
  } else {
    controlKeyCounter += 1;
    raw = `cc-${Date.now().toString(36)}-${controlKeyCounter.toString(36)}`;
  }
  const safe = sanitizeControlKey(raw);
  if (safe) return safe;
  controlKeyCounter += 1;
  return `cc${controlKeyCounter}`;
}

/**
 * A w14 checkbox STATE GLYPH — the symbol a checked/unchecked box renders as
 * (Word's `<w14:checkedState w14:font="MS Gothic" w14:val="2612"/>` /
 * `<w14:uncheckedState …/>`). `val` is the hex character code in the symbol
 * font (validated to 1–4 hex digits, uppercase-normalized); `font` is the
 * symbol font name ("" when Word omitted it). Preserving the pair keeps a
 * form's custom check glyphs (☒/☐ vs ✔/✘ etc.) across the round-trip.
 */
export interface ContentControlCheckboxGlyph {
  font: string;
  val: string;
}

const CHECKBOX_GLYPH_VAL_RE = /^[0-9A-F]{1,4}$/;

/**
 * Normalize an arbitrary value into a checkbox state glyph, or null. The hex
 * `val` is REQUIRED (a glyph without a character code is meaningless and would
 * emit an invalid `w14:val`); the font is scrubbed/clamped and may be "". PURE.
 */
export function normalizeCheckboxGlyph(
  value: unknown,
): ContentControlCheckboxGlyph | null {
  if (!value || typeof value !== "object") return null;
  const val = String((value as { val?: unknown }).val ?? "")
    .trim()
    .toUpperCase();
  if (!CHECKBOX_GLYPH_VAL_RE.test(val)) return null;
  const font = sanitizeControlText(
    (value as { font?: unknown }).font,
    MAX_CONTROL_ITEM_LENGTH,
  );
  return { font, val };
}

/** A drop-down / combo list entry: a display label and its stored value. */
export interface ContentControlListItem {
  /** What the user sees in the list. */
  displayText: string;
  /** The value stored when the entry is chosen (Word's `w:value`). */
  value: string;
}

/**
 * Normalize an arbitrary array into a bounded, sanitized list of `{ displayText,
 * value }` entries. Non-object / empty entries are dropped; an entry missing one
 * field falls back to the other (Word allows a value-only or display-only item),
 * and an entry that scrubs to fully empty is dropped. Count-capped to
 * {@link MAX_CONTROL_LIST_ITEMS}. Returns [] for non-arrays. PURE.
 */
export function normalizeControlListItems(value: unknown): ContentControlListItem[] {
  if (!Array.isArray(value)) return [];
  const out: ContentControlListItem[] = [];
  for (const raw of value) {
    if (out.length >= MAX_CONTROL_LIST_ITEMS) break;
    if (!raw || typeof raw !== "object") continue;
    const display = sanitizeControlText(
      (raw as { displayText?: unknown }).displayText,
      MAX_CONTROL_ITEM_LENGTH,
    );
    const val = sanitizeControlText(
      (raw as { value?: unknown }).value,
      MAX_CONTROL_ITEM_LENGTH,
    );
    // Word lets either field stand in for the other; only a fully-empty item is
    // meaningless and dropped.
    const displayText = display || val;
    const stored = val || display;
    if (!displayText && !stored) continue;
    out.push({ displayText, value: stored });
  }
  return out;
}

/** The OOXML `w:lock` values Word emits, kept verbatim so the lock round-trips. */
const LOCK_VALUES: ReadonlySet<string> = new Set([
  "sdtLocked",
  "contentLocked",
  "sdtContentLocked",
  "unlocked",
]);

/** Coerce a lock value to one Word recognizes, or null (no lock). PURE. */
export function normalizeControlLock(value: unknown): string | null {
  return typeof value === "string" && LOCK_VALUES.has(value) ? value : null;
}

/**
 * The lock values whose presence makes a control NON-interactive for form filling
 * (its inner content cannot be edited / re-filled): `contentLocked` (the contents
 * are locked) and `sdtContentLocked` (the whole sdt + its contents are locked).
 * `sdtLocked` only prevents DELETING the control — its contents stay fillable —
 * and `unlocked`/null impose no restriction, so neither blocks form filling. This
 * mirrors Word's behavior, where a "content locked" form field shows its current
 * value but ignores clicks. PURE.
 */
const CONTENT_FILL_LOCKED_VALUES: ReadonlySet<string> = new Set([
  "contentLocked",
  "sdtContentLocked",
]);

/**
 * Whether a content control's edit lock blocks INTERACTIVE form filling (toggling
 * a checkbox, choosing a list value, picking a date). True only for a lock that
 * locks the CONTENTS ({@link CONTENT_FILL_LOCKED_VALUES}); a delete-only
 * `sdtLocked` lock — and no lock — leave the control fillable. PURE.
 */
export function isContentControlFillLocked(lock: unknown): boolean {
  // An embedded editor whose integration locks every content control
  // (ONLYOFFICE's permissions.modifyContentControl false) fills none.
  if (!onlyofficeAllowsContentControlChange()) return true;
  return typeof lock === "string" && CONTENT_FILL_LOCKED_VALUES.has(lock);
}

/**
 * Whether the lock forbids DELETING the control itself (Word's SdtLocked and
 * SdtContentLocked): its contents may still be edited under `sdtLocked`, but
 * an edit that removes the whole control is refused (OFL-044). PURE.
 */
export function isContentControlDeleteLocked(lock: unknown): boolean {
  if (!onlyofficeAllowsContentControlChange()) return true;
  return lock === "sdtLocked" || lock === "sdtContentLocked";
}

/**
 * The fully-normalized content-control metadata carried on a mark/node's attrs.
 * Every field is already sanitized/bounded, so the renderer, the exporter and any
 * consumer can trust it without re-scrubbing (they do anyway, defensively). The
 * `controlKey` is NOT part of this metadata — it is the editor-side merge key and
 * is not serialized to OOXML (a fresh one is minted per `<w:sdt>` on import).
 */
export interface ContentControlMeta {
  controlType: ContentControlType;
  /** Friendly title (Word's `w:alias`); "" when absent. */
  alias: string;
  /** Programmatic tag (Word's `w:tag`); "" when absent. */
  tag: string;
  /** Bounded non-negative numeric id; null when absent. */
  controlId: number | null;
  /** Edit lock token; null when unlocked. */
  lock: string | null;
  /** Drop-down / combo entries (only meaningful for those types). */
  listItems: ContentControlListItem[];
  /** Checkbox checked state (only meaningful for the checkbox type). */
  checked: boolean;
  /** Date display format string (only meaningful for the date type); "" absent. */
  dateFormat: string;
  /** Date full-date ISO value (only meaningful for the date type); "" absent. */
  dateFullDate: string;
  /**
   * Plain-text control accepts line breaks (Word's `<w:text w:multiLine="1"/>`;
   * only meaningful for the text type). False when absent — Word's default.
   */
  multiline: boolean;
  /**
   * The control shows its placeholder text, not a value (Word's
   * `w:showingPlcHdr`): an emptied drop-down, combo, date or text control
   * keeps its identity, items and widget over Word's prompt for its type
   * instead of being deleted (OFL-026). False when absent.
   */
  placeholder: boolean;
  /**
   * The control holds a building block of a Word gallery (Word's
   * `w:docPartObj/w:docPartGallery`): "Table of Contents" for a manual table
   * of contents inserted from the References gallery. "" when absent.
   */
  docPartGallery: string;
  /** Word's `w:docPartUnique`: one block of that gallery per document. */
  docPartUnique: boolean;
  /**
   * Word's `w:temporary`: the control goes away once its placeholder is
   * replaced (a manual table's "Type chapter title" prompts). False absent.
   */
  temporary: boolean;
  /** Checked-box glyph (only meaningful for the checkbox type); null absent. */
  checkedState: ContentControlCheckboxGlyph | null;
  /** Unchecked-box glyph (only meaningful for the checkbox type); null absent. */
  uncheckedState: ContentControlCheckboxGlyph | null;
  /**
   * The field must be filled before the form is submitted (MRAI forms; Word's
   * controls have no such property, so it travels in the `mrai-form-fields`
   * document variable, `document_docx_form_fields.py`). False when absent.
   */
  required: boolean;
  /**
   * An option button: the check box is one option of this group, and one
   * box of a group is checked at a time (only meaningful for the checkbox
   * type; Word sees a check box drawn ◉/○). "" when it is a plain check box.
   */
  radioGroup: string;
  /**
   * The store node a data-bound control maps (Word's `w:dataBinding`), as
   * the import names it: a token, never the XPath. Every control of one
   * token shows the node's value, so an edit of one is an edit of all of
   * them (Word refreshes them from the node; see `boundControlSync.ts`).
   * A trailing "p": the control is its whole paragraph (a block-level
   * `w:sdt`). "" (or absent) when the control is not bound.
   */
  binding?: string;
}

/** A data-bound control's store node token (the API's
 * `data_binding.binding_token`), or "" when the value is not one. */
export function normalizeControlBinding(value: unknown): string {
  return typeof value === "string" && /^b[0-9a-f]{24}p?$/.test(value) ? value : "";
}

/** A group name's longest form (the Properties dialog's limit). */
export const MAX_RADIO_GROUP_LENGTH = 64;

/** An option button stands in a Word file as a checkbox with these symbols: ◉ checked, ○ not. */
export const RADIO_CHECKED_GLYPH: ContentControlCheckboxGlyph = { val: "25C9", font: "Segoe UI Symbol" };
export const RADIO_UNCHECKED_GLYPH: ContentControlCheckboxGlyph = { val: "25CB", font: "Segoe UI Symbol" };

/** A trimmed group name, or "" when it carries none (control bytes dropped). */
export function normalizeRadioGroup(value: unknown): string {
  return sanitizeControlText(value, MAX_RADIO_GROUP_LENGTH);
}

/**
 * Build a fully-normalized {@link ContentControlMeta} from an arbitrary attrs
 * bag (a persisted mark/node's attrs, or the raw values the importer read off the
 * `<w:sdtPr>`). Every field is funnelled through the sanitizers above. The
 * `controlKey` (if any) is ignored here — it is handled separately by the mark.
 * PURE.
 */
/** The Word building-block galleries a control may hold a block of. */
export const CONTENT_CONTROL_DOC_PART_GALLERIES = ["Table of Contents"] as const;

/** A known gallery name (Word's `w:docPartGallery` value), else "". */
export function normalizeDocPartGallery(value: unknown): string {
  return typeof value === "string" &&
    (CONTENT_CONTROL_DOC_PART_GALLERIES as readonly string[]).includes(value)
    ? value
    : "";
}

export function normalizeControlMeta(attrs: unknown): ContentControlMeta {
  const a = (attrs && typeof attrs === "object" ? attrs : {}) as Record<
    string,
    unknown
  >;
  return {
    controlType: normalizeControlType(a.controlType),
    alias: sanitizeControlText(a.alias, MAX_CONTROL_LABEL_LENGTH),
    tag: sanitizeControlText(a.tag, MAX_CONTROL_LABEL_LENGTH),
    controlId: normalizeControlId(a.controlId),
    lock: normalizeControlLock(a.lock),
    listItems: normalizeControlListItems(a.listItems),
    checked: a.checked === true,
    dateFormat: sanitizeControlText(a.dateFormat, MAX_CONTROL_ITEM_LENGTH),
    dateFullDate: sanitizeControlText(a.dateFullDate, MAX_CONTROL_ITEM_LENGTH),
    multiline: a.multiline === true,
    placeholder: a.placeholder === true,
    docPartGallery: normalizeDocPartGallery(a.docPartGallery),
    docPartUnique: a.docPartUnique === true,
    temporary: a.temporary === true,
    checkedState: normalizeCheckboxGlyph(a.checkedState),
    uncheckedState: normalizeCheckboxGlyph(a.uncheckedState),
    required: a.required === true,
    radioGroup: normalizeControlType(a.controlType) === "checkbox" ? normalizeRadioGroup(a.radioGroup) : "",
    binding: normalizeControlBinding(a.binding),
  };
}

/**
 * Reduce a {@link ContentControlMeta} to the MINIMAL attrs object to persist on a
 * mark/node — every field is included only when it carries a value (so a bare
 * rich-text control with no metadata stores just `controlType`, and a control's
 * JSON stays small + stable). The `controlType` is always present. The
 * `controlKey` is NOT added here (the mark merges it in separately). PURE.
 */
export function controlMetaToAttrs(meta: ContentControlMeta): Record<string, unknown> {
  const out: Record<string, unknown> = { controlType: meta.controlType };
  if (meta.alias) out.alias = meta.alias;
  if (meta.tag) out.tag = meta.tag;
  if (meta.controlId !== null) out.controlId = meta.controlId;
  if (meta.lock) out.lock = meta.lock;
  if (meta.listItems.length > 0) out.listItems = meta.listItems;
  // The checkbox state is only meaningful for a checkbox; persisting it only for
  // that type keeps an unrelated control's attrs free of a stray `checked:false`.
  if (meta.controlType === "checkbox") {
    out.checked = meta.checked;
    if (meta.checkedState) out.checkedState = meta.checkedState;
    if (meta.uncheckedState) out.uncheckedState = meta.uncheckedState;
    if (meta.radioGroup) out.radioGroup = meta.radioGroup;
  }
  if (meta.required) out.required = true;
  if (meta.dateFormat) out.dateFormat = meta.dateFormat;
  if (meta.dateFullDate) out.dateFullDate = meta.dateFullDate;
  // Multiline is only meaningful for a plain-text control, and only when ON
  // (Word's default is single-line — absent keeps a bare control's attrs small).
  if (meta.controlType === "text" && meta.multiline) out.multiline = true;
  if (meta.placeholder) out.placeholder = true;
  if (meta.docPartGallery) {
    out.docPartGallery = meta.docPartGallery;
    if (meta.docPartUnique) out.docPartUnique = true;
  }
  if (meta.temporary) out.temporary = true;
  if (meta.binding) out.binding = meta.binding;
  return out;
}

/**
 * The human-readable label an editor surfaces for a control's boundary: the
 * alias if present, else the tag, else "". The caller pairs this with a localized
 * type name when neither is set. PURE.
 */
export function controlBoundaryLabel(meta: ContentControlMeta): string {
  return meta.alias || meta.tag || "";
}

/**
 * Word's placeholder prompt for a control type (the text an empty control
 * shows under `w:showingPlcHdr`): what an emptied control keeps as its run.
 */
export function wordControlPlaceholderText(type: ContentControlType): string {
  switch (type) {
    case "dropDownList":
    case "comboBox":
      return "Choose an item.";
    case "date":
      return "Click or tap to enter a date.";
    case "picture":
      return "Click or tap here to enter a picture.";
    default:
      return "Click or tap here to enter text.";
  }
}
