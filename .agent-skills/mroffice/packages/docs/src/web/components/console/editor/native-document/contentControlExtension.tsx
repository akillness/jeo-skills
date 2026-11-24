"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { querySheetsAll } from "@mrnote/core/web/components/console/editor/native-document/paged/sheetMeasureMemo.ts";
import { SheetFact } from "@mrnote/core/web/lib/editor/sheet-facts.ts";
import { Mark, Node, Extension, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { DELETION_MARK_NAME } from "@mrnote/core/web/components/console/editor/native-document/trackChanges.ts";
import { findWrapping } from "@tiptap/pm/transform";
import { effectiveDocumentProtection, isDocumentFormsProtected, unprotectedFormSections } from "@mrnote/core/web/components/console/editor/native-document/documentProtection.ts";
import { legacyFormFieldEnabled, legacyFormFieldFillOnly } from "@mrnote/core/web/components/console/editor/native-document/legacyFormFields.ts";
import {
  AddMarkStep,
  RemoveMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
} from "@tiptap/pm/transform";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { imeSafeAppendTransaction } from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import { syncBoundControls } from "./boundControlSync";
import { isTrustedReadOnlyDocumentMutation } from "@mrnote/core/web/components/console/editor/native-document/readOnlyTransactionAuthority.ts";
import { wordDateControlText } from "./wordDatePicture";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type {
  Node as ProseMirrorNode,
  Mark as ProseMirrorMark,
  MarkType,
  Slice,
} from "@tiptap/pm/model";
import {
  documentTextBoxFillHtmlAttributes,
  documentTextBoxOutlineHtmlAttributes,
  normalizeDocumentTextBoxFill,
  normalizeDocumentTextBoxOutline,
  parseDocumentTextBoxFillAttribute,
  parseDocumentTextBoxOutlineAttribute,
} from "@mrnote/core/web/lib/document-borders.ts";
import {
  documentTextBoxFrameExtentHtmlAttributes,
  normalizeDocumentTextBoxFrameExtent,
  parseDocumentTextBoxFrameExtentAttribute,
} from "@mrnote/core/web/lib/office-float-anchor.ts";
import {
  floatFlowMode,
  normalizeFloatAnchor,
  normalizeFloatFrameBody,
  normalizeFloatFrameChain,
} from "@mrnote/core/web/lib/office-float-anchor.ts";
import { documentTextBoxShadow, documentTextBoxShadowHtmlAttributes } from "@mrnote/core/web/lib/document-text-box-frame.ts";
import { floatingTextBoxNodeView } from "@mrnote/core/web/components/console/editor/native-document/floatingTextBoxLayout.ts";
import {
  BLOCK_CONTENT_CONTROL_NODE_NAME,
  CONTENT_CONTROL_MARK_NAME,
  TEXT_BOX_NODE_NAME,
  controlBoundaryLabel,
  controlKeyFor,
  controlMetaToAttrs,
  isContentControlDeleteLocked,
  isContentControlFillLocked,
  wordControlPlaceholderText,
  normalizeControlMeta,
  sanitizeControlKey,
  sanitizeControlText,
  type ContentControlListItem,
  type ContentControlMeta,
  type ContentControlType,
  MAX_CONTROL_ITEM_LENGTH,
  MAX_CONTROL_LABEL_LENGTH,
  RADIO_CHECKED_GLYPH,
  RADIO_UNCHECKED_GLYPH,
  normalizeRadioGroup,
} from "@mrnote/core/web/components/console/editor/native-document/contentControls.ts";
import { patchTopLevelDecorations } from "@mrnote/core/web/components/console/editor/native-document/topLevelDecorationPatch.ts";

/**
 * Document CONTENT CONTROLS (Word "structured document tags" / `<w:sdt>`) —
 * TipTap wiring.
 *
 * ADDITIVE: registering these extensions adds ONE inline MARK ("contentControl")
 * carrying the control's metadata + a unique-per-instance `controlKey`, and ONE
 * block NODE ("blockContentControl") wrapping whole paragraphs. Both round-trip
 * through the document schema's open `marks`/`content`/`attrs` passthrough (see
 * lib/native-page-schemas.ts → documentNodeSchema), so EXISTING documents — which
 * carry neither — still validate and load byte-for-byte unchanged. There is no
 * flag: the feature is purely PRESERVATION (an imported Word form's controls
 * survive a DOCX round-trip with type + metadata + inner content intact); a
 * document with no controls behaves exactly as before.
 *
 * MARK vs NODE — an inline `<w:sdt>` wraps RUNS inside a paragraph, so it maps to
 * a MARK on those runs (like the comment / bookmark marks): the mark preserves the
 * inner runs' own formatting (bold / italic / links) because it merely decorates
 * them. A block `<w:sdt>` wraps whole PARAGRAPHS, so it maps to a `block+` block
 * NODE that contains them. TipTap requires this split (a mark cannot hold block
 * content; a block node cannot decorate a run mid-paragraph).
 *
 * ADJACENT-CONTROL DISTINCTNESS — the inline mark carries a unique `controlKey`
 * (minted per `<w:sdt>` on import via controlKeyFor). ProseMirror only merges two
 * adjacent marks when ALL their attrs are equal, so two back-to-back controls with
 * different keys stay TWO distinct marks and the exporter groups each contiguous
 * same-key run into its OWN `<w:sdt>` — never collapsing two distinct controls into
 * one. This mirrors how the comment mark keeps threads distinct via a `threadId`.
 *
 * NOT interactive form-filling — toggling a checkbox, picking a dropdown value, or
 * choosing a date in the editor is intentionally out of scope. The inner content
 * displays + stays editable like ordinary prose; the control config rides along on
 * the mark/node attrs and is reconstructed verbatim on export.
 *
 * SECURITY: every attribute funnels through the ./contentControls sanitizers on
 * parse / render, so a forged or imported value can never break out of the DOM
 * attribute surface or inject markup. renderHTML emits ONLY whitelisted
 * `data-content-control*` attributes + a sanitized `title`; the list-items /
 * checkbox / date config is carried as a JSON-stringified attribute (parsed back
 * through the same normalizer).
 */

/** Window CustomEvent (reserved for a future Insert content-control affordance). */
export const INSERT_CONTENT_CONTROL_EVENT = "mrnote:insert-content-control";

/**
 * The (optional) translator the extensions use to build a localized generic
 * boundary label when a control carries no alias / tag. Defaults to identity so
 * the extensions work headlessly (tests, bare schema) without an i18n runtime.
 */
export type ContentControlTranslator = (key: string) => string;

interface ContentControlOptions {
  translate: ContentControlTranslator;
}

/** i18n keys for a control's localized type name (used in the boundary tooltip). */
const TYPE_LABEL_KEY: Record<ContentControlType, string> = {
  text: "contentControl.type.text",
  richText: "contentControl.type.richText",
  checkbox: "contentControl.type.checkbox",
  dropDownList: "contentControl.type.dropDownList",
  comboBox: "contentControl.type.comboBox",
  date: "contentControl.type.date",
  picture: "contentControl.type.picture",
};

/**
 * The boundary TOOLTIP/title text for a control: the alias/tag when present, else
 * a localized "Content control · <Type>". Falls back to the bare English label if
 * the translator returns the key unchanged (no message bundle loaded). PURE given
 * `translate`.
 */
export function contentControlTitle(
  meta: ContentControlMeta,
  translate: ContentControlTranslator,
): string {
  const label = controlBoundaryLabel(meta);
  if (label) return label;
  const generic = translate("contentControl.boundaryLabel");
  const typeKey = TYPE_LABEL_KEY[meta.controlType];
  const typeName = translate(typeKey);
  const genericText =
    generic && generic !== "contentControl.boundaryLabel"
      ? generic
      : "Content control";
  const typeText = typeName && typeName !== typeKey ? typeName : meta.controlType;
  return `${genericText} · ${typeText}`;
}

/**
 * Serialize a control's list-items / checkbox / date config to a compact JSON
 * string for the `data-content-control-config` attribute, or "" when there is
 * nothing beyond the identifying alias/tag/lock/type (kept minimal so a bare
 * control's DOM stays small). Re-parsed through {@link normalizeControlMeta} on
 * the way back in. PURE.
 */
function configToAttr(meta: ContentControlMeta): string {
  const config: Record<string, unknown> = {};
  if (meta.listItems.length > 0) config.listItems = meta.listItems;
  if (meta.controlType === "checkbox") {
    config.checked = meta.checked;
    if (meta.checkedState) config.checkedState = meta.checkedState;
    if (meta.uncheckedState) config.uncheckedState = meta.uncheckedState;
  }
  if (meta.dateFormat) config.dateFormat = meta.dateFormat;
  if (meta.dateFullDate) config.dateFullDate = meta.dateFullDate;
  if (meta.controlType === "text" && meta.multiline) config.multiline = true;
  if (meta.placeholder) config.placeholder = true;
  if (meta.docPartGallery) {
    config.docPartGallery = meta.docPartGallery;
    if (meta.docPartUnique) config.docPartUnique = true;
  }
  if (meta.temporary) config.temporary = true;
  if (meta.required) config.required = true;
  if (meta.radioGroup) config.radioGroup = meta.radioGroup;
  if (meta.binding) config.binding = meta.binding;
  return Object.keys(config).length > 0 ? JSON.stringify(config) : "";
}

/** Parse the `data-content-control-config` attribute back to a partial attrs bag. */
function configFromAttr(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Read every content-control attribute off a DOM element (a parsed `<span
 * data-content-control>` or `<div data-content-control-block>`) into a raw attrs
 * bag, then funnel it through {@link normalizeControlMeta} → {@link
 * controlMetaToAttrs} so the persisted attrs are sanitized + minimal. The
 * `controlKey` is read separately by the caller (it is mark-only). PURE.
 */
function readControlMetaAttrs(element: HTMLElement): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    controlType: element.getAttribute("data-content-control-type"),
    alias: element.getAttribute("data-content-control-alias"),
    tag: element.getAttribute("data-content-control-tag"),
    controlId: element.getAttribute("data-content-control-id"),
    lock: element.getAttribute("data-content-control-lock"),
    ...configFromAttr(element.getAttribute("data-content-control-config")),
  };
  return controlMetaToAttrs(normalizeControlMeta(raw));
}

/**
 * Build the whitelisted `data-content-control*` attribute object for renderHTML
 * from a normalized meta — every attribute is emitted ONLY when it carries a
 * value (so a bare rich-text control renders just the type marker), and `title`
 * is the localized boundary tooltip. PURE.
 */
function controlDataAttrs(
  meta: ContentControlMeta,
  translate: ContentControlTranslator,
): Record<string, string> {
  const out: Record<string, string> = {
    "data-content-control-type": meta.controlType,
    title: contentControlTitle(meta, translate),
  };
  if (meta.alias) out["data-content-control-alias"] = meta.alias;
  if (meta.tag) out["data-content-control-tag"] = meta.tag;
  if (meta.controlId !== null)
    out["data-content-control-id"] = String(meta.controlId);
  if (meta.lock) out["data-content-control-lock"] = meta.lock;
  // Reflect the interactive state on the DOM so the control's boundary styling
  // can show it (and so a parsed-back span re-reads it via the config attr). The
  // checkbox `checked` state rides the config; surface a stable boolean attribute
  // too so CSS / a11y can target it without parsing the config JSON.
  if (meta.controlType === "checkbox")
    out["data-content-control-checked"] = meta.checked ? "true" : "false";
  if (isContentControlFillLocked(meta.lock))
    out["data-content-control-fill-locked"] = "true";
  if (meta.placeholder) out["data-content-control-placeholder"] = "true";
  if (meta.docPartGallery) out["data-content-control-doc-part-gallery"] = meta.docPartGallery;
  // A field the form needs filled before it is submitted (styled with its
  // marker), and an option button of a group.
  if (meta.required) out["data-content-control-required"] = "true";
  if (meta.radioGroup) out["data-content-control-radio-group"] = meta.radioGroup;
  const config = configToAttr(meta);
  if (config) out["data-content-control-config"] = config;
  return out;
}

// ---------------------------------------------------------------------------
// INTERACTIVE FORM FILLING (single-user, local).
//
// Content controls import + export + round-trip as preserved metadata; this
// section makes the CHECKBOX / DROP-DOWN / DATE kinds interactive in the editor
// — a real focusable widget (a ☐/☑ toggle, a <select>, a date <input>) is
// painted at the START of each control via ProseMirror WIDGET DECORATIONS, and a
// click/change dispatches an UNDOABLE transaction that updates the control's mark
// attrs (and, for date/drop-down, the inner displayed text). The decoration
// approach is required because an inline MARK's renderHTML cannot host a sibling
// widget around its content hole; the widget is contentEditable=false + selection-
// ignored so it never interferes with the caret. A control whose lock locks its
// CONTENTS ({@link isContentControlFillLocked}) renders the widget DISABLED and
// ignores interaction (Word parity). The state lives on the SAME mark attrs the
// exporter already serializes, so a toggle round-trips to OOXML with no exporter
// change.
// ---------------------------------------------------------------------------

/** The inline kinds we make interactive (text/richText/picture stay plain prose). */
const INTERACTIVE_CONTROL_TYPES: ReadonlySet<ContentControlType> = new Set([
  "checkbox",
  "dropDownList",
  "comboBox",
  "date",
]);

/** The "select…" placeholder shown as the empty option of a drop-down widget. */
function dropdownPlaceholder(translate: ContentControlTranslator): string {
  const text = translate("contentControl.selectPlaceholder");
  return text && text !== "contentControl.selectPlaceholder" ? text : "Select…";
}

/**
 * One contiguous run of a single content-control instance: its full document
 * range, the resolved metadata, and the live mark instance (so a command can
 * re-apply the SAME mark type with updated attrs over exactly this range). PURE
 * given the doc — mirrors `commentRangesFor` in commentExtension.ts.
 */
export interface ContentControlRange {
  from: number;
  to: number;
  meta: ContentControlMeta;
  mark: ProseMirrorMark;
}

/**
 * Collect every distinct content-control instance in the doc (each maximal
 * contiguous run of text carrying the `contentControl` mark with the SAME
 * `controlKey`). A run with a blank/absent key is keyed by "" and only merges
 * with an adjacent blank-key run — matching how the exporter partitions controls.
 * PURE.
 */
/** Each document's controls (the whole document's walk, which most callers
 * ask for, several times a transaction). */
const documentControlRanges = new WeakMap<ProseMirrorNode, readonly ContentControlRange[]>();
const HOLDS_CONTROL = new SheetFact((node) => node.isText && node.marks.some((mark) => mark.type.name === CONTENT_CONTROL_MARK_NAME));

export function collectContentControlRanges(
  doc: ProseMirrorNode,
  from = 0,
  to = doc.content.size,
): ContentControlRange[] {
  if (from !== 0 || to !== doc.content.size) return scanContentControlRanges(doc, from, to);
  let ranges = documentControlRanges.get(doc);
  if (!ranges) {
    // A control does not run across a block, so nor across a sheet: each sheet
    // that holds one on its own gives the ranges of the whole.
    const found: ContentControlRange[] = [];
    doc.forEach((sheet, offset) => {
      if (HOLDS_CONTROL.sheet(sheet)) found.push(...scanContentControlRanges(doc, offset, offset + sheet.nodeSize));
    });
    documentControlRanges.set(doc, (ranges = found));
  }
  return ranges.map((range) => ({ ...range }));
}

function scanContentControlRanges(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): ContentControlRange[] {
  const ranges: ContentControlRange[] = [];
  let current: ContentControlRange | null = null;
  let currentKey: string | null = null;
  let currentFromDeleted = false;
  const flush = () => {
    if (current) ranges.push(current);
    current = null;
    currentKey = null;
  };
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) {
      flush();
      return true;
    }
    const mark = node.marks.find(
      (m) => m.type.name === CONTENT_CONTROL_MARK_NAME,
    );
    if (!mark) {
      flush();
      return true;
    }
    const key = sanitizeControlKey(mark.attrs.controlKey) ?? "";
    const start = pos;
    const end = pos + node.nodeSize;
    const deleted = isTrackDeletedText(node);
    if (current && currentKey === key && current.to === start) {
      current.to = end;
      // A tracked deletion keeps the state the control had before the edit
      // (a toggled box's old "☒"): the control's state is its live text's.
      if (currentFromDeleted && !deleted) {
        current.meta = normalizeControlMeta(mark.attrs);
        current.mark = mark;
        currentFromDeleted = false;
      }
    } else {
      flush();
      current = {
        from: start,
        to: end,
        meta: normalizeControlMeta(mark.attrs),
        mark,
      };
      currentKey = key;
      currentFromDeleted = deleted;
    }
    return true;
  });
  flush();
  return ranges;
}

const TRACK_DELETION_MARK_NAME = "trackDeletion";

function isTrackDeletedText(node: ProseMirrorNode): boolean {
  return node.marks.some((m) => m.type.name === TRACK_DELETION_MARK_NAME);
}

/**
 * Where a control's live text starts and what it reads: its text without
 * the tracked deletions an edit under Track Changes left in it. Toggling a
 * box there keeps the old symbol as a deletion before the new one; the box
 * is the first live character, as Word shows the control's current state.
 */
function controlLiveText(
  doc: ProseMirrorNode,
  range: ContentControlRange,
): { start: number; text: string } {
  let start = -1;
  let text = "";
  doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (!node.isText || isTrackDeletedText(node)) return true;
    const from = Math.max(pos, range.from);
    const to = Math.min(pos + node.nodeSize, range.to);
    if (start < 0) start = from;
    text += node.text!.slice(from - pos, to - pos);
    return true;
  });
  return { start: start < 0 ? range.from : start, text };
}

/**
 * Find the single content-control instance whose run STARTS at `from` (the anchor
 * a widget decoration is mounted at), or null. The widget carries its own start
 * position so a command targets exactly the run under it even when several
 * controls share a key shape. PURE.
 */
export function controlRangeAt(
  doc: ProseMirrorNode,
  from: number,
): ContentControlRange | null {
  return (
    collectContentControlRanges(doc).find((range) => range.from === from) ??
    null
  );
}

/**
 * The shared metadata attribute definitions for the mark + block node. Each field
 * parses from its `data-content-control-*` attribute through the ./contentControls
 * sanitizers and renders nothing on its own — renderHTML emits the full
 * whitelisted attribute set in one place (controlDataAttrs) so a partial attribute
 * can never leak unsanitized. The mark adds its own `controlKey` attribute on top.
 */
function metaAttributes() {
  return {
    controlType: {
      default: "richText" as ContentControlType,
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta({
          controlType: element.getAttribute("data-content-control-type"),
        }).controlType,
      renderHTML: () => ({}),
    },
    alias: {
      default: "",
      parseHTML: (element: HTMLElement) =>
        sanitizeControlText(
          element.getAttribute("data-content-control-alias"),
          MAX_CONTROL_LABEL_LENGTH,
        ),
      renderHTML: () => ({}),
    },
    tag: {
      default: "",
      parseHTML: (element: HTMLElement) =>
        sanitizeControlText(
          element.getAttribute("data-content-control-tag"),
          MAX_CONTROL_LABEL_LENGTH,
        ),
      renderHTML: () => ({}),
    },
    controlId: {
      default: null as number | null,
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta({
          controlId: element.getAttribute("data-content-control-id"),
        }).controlId,
      renderHTML: () => ({}),
    },
    lock: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta({
          lock: element.getAttribute("data-content-control-lock"),
        }).lock,
      renderHTML: () => ({}),
    },
    listItems: {
      default: [] as unknown[],
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).listItems,
      renderHTML: () => ({}),
    },
    checked: {
      default: false,
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).checked,
      renderHTML: () => ({}),
    },
    dateFormat: {
      default: "",
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).dateFormat,
      renderHTML: () => ({}),
    },
    dateFullDate: {
      default: "",
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).dateFullDate,
      renderHTML: () => ({}),
    },
    multiline: {
      default: false,
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).multiline,
      renderHTML: () => ({}),
    },
    placeholder: {
      default: false,
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).placeholder,
      renderHTML: () => ({}),
    },
    docPartGallery: {
      default: "",
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).docPartGallery,
      renderHTML: () => ({}),
    },
    docPartUnique: {
      default: false,
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).docPartUnique,
      renderHTML: () => ({}),
    },
    temporary: {
      default: false,
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).temporary,
      renderHTML: () => ({}),
    },
    checkedState: {
      default: null as unknown,
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).checkedState,
      renderHTML: () => ({}),
    },
    uncheckedState: {
      default: null as unknown,
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).uncheckedState,
      renderHTML: () => ({}),
    },
    required: {
      default: false,
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).required,
      renderHTML: () => ({}),
    },
    radioGroup: {
      default: "",
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).radioGroup,
      renderHTML: () => ({}),
    },
    binding: {
      default: "",
      parseHTML: (element: HTMLElement) =>
        normalizeControlMeta(readControlMetaAttrs(element)).binding ?? "",
      renderHTML: () => ({}),
    },
  };
}

/**
 * The `contentControl` mark attrs for a range with `patch` applied: funnelled
 * through {@link controlMetaToAttrs}∘{@link normalizeControlMeta} so a patched
 * value is sanitized, and the unique `controlKey` is preserved (it is
 * mark-only, not in the meta).
 */
function controlAttrsWithKey(
  range: ContentControlRange,
  patch: Partial<ContentControlMeta>,
): Record<string, unknown> {
  const attrs = controlMetaToAttrs(normalizeControlMeta({ ...range.meta, ...patch }));
  const key = sanitizeControlKey(range.mark.attrs.controlKey);
  if (key) attrs.controlKey = key;
  return attrs;
}

/**
 * Replace the DISPLAYED inner text of a control's run with `text` while keeping
 * the control's mark (with `patch` applied) over the new text — so a drop-down
 * selection / date pick updates what the reader sees AND the control's metadata
 * in ONE undoable step. The replacement text inherits the run's sibling marks
 * (bold / link / …) with the patched content-control mark swapped in, then the
 * mark is re-applied over the new span. Passing "" clears the inner text (the
 * control then renders as just its widget).
 */
export function replaceControlText(
  tr: Transaction,
  markType: MarkType,
  range: ContentControlRange,
  text: string,
  patch: Partial<ContentControlMeta>,
): void {
  // An emptied control is not a deleted one: it keeps its identity, items
  // and widget over Word's placeholder prompt for its type, marked as
  // showing the placeholder (OFL-026 deleted the control with its value).
  const placeholder = !text;
  const shown = placeholder ? wordControlPlaceholderText(range.meta.controlType) : text;
  const controlMark = markType.create(
    controlAttrsWithKey(range, { ...patch, placeholder }),
  );
  const startNode = tr.doc.nodeAt(range.from);
  const baseMarks = startNode
    ? startNode.marks.filter((m) => m.type.name !== CONTENT_CONTROL_MARK_NAME)
    : [];
  const node = tr.doc.type.schema.text(shown, controlMark.addToSet(baseMarks));
  tr.replaceWith(range.from, range.to, node);
}

/** Whether `from..to` of `doc`, and what replaces it, stay inside one
 *  section Word's "Select sections" left free under Filling in forms: no
 *  section break is touched or added, so which section is which stays. */
function insideFreeSection(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  slice: Slice | undefined,
  free: ReadonlySet<number>,
): boolean {
  if (free.size === 0) return false;
  let section = 0;
  let crossed = false;
  doc.descendants((node, pos) => {
    if (crossed) return false;
    if (node.type.name !== "sectionBreak") return true;
    if (pos + node.nodeSize <= from) section += 1;
    else if (pos < to) crossed = true;
    return false;
  });
  if (crossed || !free.has(section)) return false;
  let added = false;
  slice?.content.descendants((node) => {
    if (node.type.name === "sectionBreak") added = true;
    return !added;
  });
  return !added;
}

/** Whether every step of `tr` stays inside one content control that may be
 *  filled (an inline control's run, or a block control's contents), or
 *  inside a section the restriction leaves free. */









function sliceStaysInControl(slice: Slice | undefined, control: ContentControlRange): boolean {
  if (!slice || slice.size === 0) return true;
  const key = sanitizeControlKey(control.mark.attrs.controlKey);
  let inside = true;
  slice.content.descendants((node) => {
    if (!inside) return false;
    if (!node.isInline) return true;
    inside = node.marks.some(
      (mark) => mark.type.name === CONTENT_CONTROL_MARK_NAME && (!key || sanitizeControlKey(mark.attrs.controlKey) === key),
    );
    return false;
  });
  return inside;
}

/**
 * The marks the next typed character takes when the caret was left at the
 * END of a plain or rich text control by typing into it (or by typing over
 * its placeholder): the control's own, so the words go on inside it, as in
 * Word, where the insertion point stays in the field it is filling. The
 * control's mark is not inclusive -- typing at the edge of a control the
 * caret was put beside does not grow it -- so without these every character
 * after the first went after the control (a form's field took "G" of
 * "Grace", the paragraph "race"). A tracked deletion is not carried. Null
 * when the caret is not so placed.
 */
function controlEdgeTypingMarks(
  transactions: readonly Transaction[],
  state: EditorState,
): readonly ProseMirrorMark[] | null {
  const { selection } = state;
  if (!selection.empty || state.storedMarks) return null;
  let last: Transaction | null = null;
  for (let index = transactions.length - 1; index >= 0; index -= 1) {
    if (transactions[index].docChanged) {
      last = transactions[index];
      break;
    }
  }
  if (!last || last.doc !== state.doc) return null;
  const step = last.steps[last.steps.length - 1];
  if (!(step instanceof ReplaceStep) || step.slice.size === 0) return null;
  const end = step.from + step.slice.size;
  if (selection.from !== end || end > state.doc.content.size) return null;
  const $end = state.doc.resolve(end);
  const before = $end.nodeBefore;
  const control = before?.isText
    ? before.marks.find((mark) => mark.type.name === CONTENT_CONTROL_MARK_NAME)
    : undefined;
  if (!before || !control) return null;
  const key = sanitizeControlKey(control.attrs.controlKey);
  const continues = $end.nodeAfter?.marks.some(
    (mark) => mark.type.name === CONTENT_CONTROL_MARK_NAME && sanitizeControlKey(mark.attrs.controlKey) === key,
  );
  if (continues) return null;
  const meta = normalizeControlMeta(control.attrs);
  if ((meta.controlType !== "text" && meta.controlType !== "richText") || isContentControlFillLocked(meta.lock)) {
    return null;
  }
  return before.marks.filter((mark) => mark.type.name !== DELETION_MARK_NAME);
}

/**
 * Filling in forms: text typed with the caret at the edge of a text field
 * (a plain or rich text control) is the field's -- nothing outside a field
 * takes words -- so it goes in with the field's marks. Elsewhere typing at a
 * control's edge stays outside it (its mark is not inclusive).
 */
function typedAtFormFieldEdge(view: EditorView, at: number, text: string): boolean {
  const { state } = view;
  if (!isDocumentFormsProtected(effectiveDocumentProtection(state.doc.attrs?.documentProtection))) return false;
  const field = collectContentControlRanges(state.doc).find(
    (range) =>
      (range.from === at || range.to === at) &&
      (range.meta.controlType === "text" || range.meta.controlType === "richText") &&
      !isContentControlFillLocked(range.meta.lock),
  );
  const first = field ? state.doc.nodeAt(field.from) : null;
  if (!field || !first) return false;
  const marks = first.marks.filter((mark) => mark.type.name !== DELETION_MARK_NAME);
  const tr = state.tr.insert(at, state.schema.text(text, marks));
  tr.setSelection(TextSelection.create(tr.doc, at + text.length));
  tr.setStoredMarks(marks);
  view.dispatch(tr.scrollIntoView());
  return true;
}

function editsOnlyInsideControls(tr: Transaction): boolean {
  const free = unprotectedFormSections(tr.docs[0]?.attrs?.documentProtection ?? tr.doc.attrs?.documentProtection);
  return tr.steps.every((step, index) => {
    const doc = tr.docs[index] ?? tr.doc;
    // Stop Protection (Restrict Editing) is the restriction's own change.
    const json = step.toJSON() as { stepType?: unknown; attr?: unknown };
    if (json.stepType === "docAttr" && json.attr === "documentProtection") return true;
    const range = step as unknown as { from?: number; to?: number; slice?: { content?: { childCount?: number; firstChild?: { type?: { name?: string }; attrs?: unknown } | null } } };
    if (typeof range.from !== "number" || typeof range.to !== "number") return false;
    const { from, to } = range;
    const slice = step instanceof ReplaceStep || step instanceof ReplaceAroundStep ? step.slice : undefined;
    if (insideFreeSection(doc, from, to, slice, free)) return true;
    // A legacy form field filled in (a text field typed, a check box
    // toggled, a drop-down's entry picked): the one field replaced by itself
    // with nothing changed but its fill (legacyFormFields.ts).
    const replaced = doc.nodeAt(from);
    const replacement = range.slice?.content;
    if (
      replaced?.type.name === "documentField" &&
      to === from + replaced.nodeSize &&
      replacement?.childCount === 1 &&
      replacement.firstChild?.type?.name === "documentField" &&
      legacyFormFieldEnabled(replaced.attrs) &&
      legacyFormFieldFillOnly(replaced.attrs, replacement.firstChild.attrs)
    ) {
      return true;
    }
    const inline = collectContentControlRanges(doc).some(
      (control) =>
        control.from <= from &&
        to <= control.to &&
        !isContentControlFillLocked(control.meta.lock) &&
        sliceStaysInControl(slice, control),
    );
    if (inline) return true;
    const $from = doc.resolve(Math.min(from, doc.content.size));
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name !== BLOCK_CONTENT_CONTROL_NODE_NAME) continue;
      const start = $from.start(depth);
      const end = $from.end(depth);
      return start <= from && to <= end && !isContentControlFillLocked(node.attrs.lock);
    }
    return false;
  });
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentContentControls: {
      /**
       * Toggle / set the CHECKED state of a checkbox content control identified by
       * its run-start position. No-op on a non-checkbox / locked control. Undoable.
       */
      setContentControlChecked: (
        from: number,
        checked: boolean,
      ) => ReturnType;
      /**
       * Set the chosen VALUE of a drop-down / combo content control identified by
       * its run-start position — replaces the control's displayed inner text with
       * the chosen item's display text. Passing "" clears the selection. No-op on a
       * non-list / locked control. Undoable.
       */
      setContentControlValue: (from: number, value: string) => ReturnType;
      /**
       * Set the picked DATE of a date content control identified by its run-start
       * position — stores the ISO full-date on the mark (so it exports to
       * `w:fullDate`) and shows the given display text inline. No-op on a non-date /
       * locked control. Undoable.
       */
      setContentControlDate: (
        from: number,
        isoDate: string,
        displayText: string,
      ) => ReturnType;
      /**
       * Word's Developer > Controls: a new control at the selection. An empty
       * selection takes the type's placeholder prompt (a check box its box);
       * selected text in one paragraph becomes the control's content; a rich
       * text control over several paragraphs wraps them as a block control.
       */
      insertContentControl: (options: {
        type: ContentControlType;
        placeholderText: string;
        /** A new drop-down or combo box's first entry (Word's "Choose an item."). */
        firstItemText?: string;
        dateFormat?: string;
        /** A check box made an option button of this group (drawn ◉/○). */
        radioGroup?: string;
      }) => ReturnType;
      /** Word's Content Control Properties on the control at `from`. */
      setContentControlProperties: (
        from: number,
        patch: Partial<ContentControlMeta>,
      ) => ReturnType;
      /** Word's Remove Content Control: the content stays, the control goes. */
      removeContentControl: (from: number) => ReturnType;
    };
  }
}

/**
 * The INLINE content-control mark. Carries the sanitized metadata + a unique
 * `controlKey` so two adjacent distinct controls never merge (ProseMirror merges
 * adjacent marks only when every attr is equal). renderHTML emits a `<span
 * data-content-control>` with the whitelisted attribute set + a subtle-outline
 * class; parseHTML reads it back. The mark wraps the inner runs, so their own
 * bold / italic / link marks are preserved alongside it.
 */
const ContentControlMark = Mark.create<ContentControlOptions>({
  name: CONTENT_CONTROL_MARK_NAME,
  // Non-inclusive: typing at the very edge of a control should NOT extend it (a
  // Word content control is a fixed region; the user re-applies it to grow it).
  inclusive: false,
  // A content control can coexist with comments / bookmarks / formatting /
  // track-changes; do not exclude anything.

  addOptions() {
    return { translate: (key: string) => key };
  },

  addAttributes() {
    return {
      ...metaAttributes(),
      // The unique-per-instance editor merge key (NOT serialized to OOXML; a fresh
      // one is minted per <w:sdt> on import). Parsed from the DOM attribute when
      // present, else minted so a hand-authored / pasted span still stays distinct.
      controlKey: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          sanitizeControlKey(
            element.getAttribute("data-content-control-key"),
          ) || controlKeyFor(),
        renderHTML: (attrs: Record<string, unknown>) => {
          const key = sanitizeControlKey(attrs.controlKey);
          return key ? { "data-content-control-key": key } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-content-control]" }];
  },

  renderHTML({ mark, HTMLAttributes }) {
    // The metadata lives on the mark's own attrs: each attribute's renderHTML
    // emits nothing, so HTMLAttributes carried none of it and every copied
    // or serialized control came back as a bare rich-text control (OFL-031).
    const meta = normalizeControlMeta({ ...mark.attrs, ...HTMLAttributes });
    const key = sanitizeControlKey(mark.attrs.controlKey);
    return [
      "span",
      mergeAttributes(
        {},
        { "data-content-control": "" },
        controlDataAttrs(meta, this.options.translate),
        key ? { "data-content-control-key": key } : {},
        { class: "mrnote-content-control" },
      ),
      0,
    ];
  },
});

/**
 * The BLOCK content-control node. Holds whole paragraphs (`content: "block+"`,
 * `defining: true` so it is not unwrapped by paste/normalize) and carries the
 * control's metadata. renderHTML wraps its children in a `<div
 * data-content-control-block>` with a subtle boundary; parseHTML reads it back.
 */
const BlockContentControlNode = Node.create<ContentControlOptions>({
  name: BLOCK_CONTENT_CONTROL_NODE_NAME,
  group: "block",
  content: "block+",
  defining: true,

  addOptions() {
    return { translate: (key: string) => key };
  },

  addAttributes() {
    return metaAttributes();
  },

  parseHTML() {
    return [{ tag: "div[data-content-control-block]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const meta = normalizeControlMeta({ ...node.attrs, ...HTMLAttributes });
    return [
      "div",
      mergeAttributes(
        {},
        { "data-content-control-block": "" },
        controlDataAttrs(meta, this.options.translate),
        { class: "mrnote-block-content-control" },
      ),
      0,
    ];
  },
});

/** One JSON attribute off a parsed element, or null when it is not JSON. */
function readJsonAttribute(element: HTMLElement | string, name: string): unknown {
  if (typeof element === "string") return null;
  const raw = element.getAttribute(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * The TEXT BOX node — a Word `<w:txbxContent>` drawing text frame.
 *
 * Holds whole blocks (`defining: true` so paste/normalize never unwraps it).
 * `content: "block*"` rather than `block+`: a LINKED text box chain's
 * continuation frame legitimately starts empty, because its words are the
 * previous frame's overflow and only a layout pass knows how many there are.
 *
 * An ANCHORED box also carries `floatAnchor` — the whole `wp:anchor` reading,
 * shared with every other floating Office object through
 * `@/lib/office-float-anchor` — plus `wps:bodyPr` as `frameBody` and the
 * linked-chain identity as `frameChain`. The frame renders as TWO elements: an
 * in-flow wrapper that decides how the body treats the box (out of flow for
 * `wrapNone`, a CSS float for square/tight/through, a full-width band for
 * topAndBottom) and the frame itself inside it. `floatingTextBoxLayout` sets
 * the geometry from the live page; nothing is positioned from here, because
 * page size, margins and columns are only known where the page is laid out.
 */
const TextBoxNode = Node.create({
  name: TEXT_BOX_NODE_NAME,
  group: "block",
  content: "block*",
  defining: true,

  addAttributes() {
    return {
      textBoxOutline: {
        default: null,
        parseHTML: (element) =>
          parseDocumentTextBoxOutlineAttribute(
            element.getAttribute("data-text-box-outline"),
          ),
        renderHTML: (attrs) =>
          documentTextBoxOutlineHtmlAttributes(
            normalizeDocumentTextBoxOutline(attrs.textBoxOutline),
          ),
      },
      // The frame's FILL — the other half of the shape a text box is. Word
      // gives a box a fill and a line; this page had an attribute for only
      // the line, in BOTH markup families, so every imported box drew
      // transparent (SHAPE-IMPORT-AUDIT.md §37.2).
      textBoxFill: {
        default: null,
        parseHTML: (element) =>
          parseDocumentTextBoxFillAttribute(
            element.getAttribute("data-text-box-fill"),
          ),
        renderHTML: (attrs) =>
          documentTextBoxFillHtmlAttributes(
            normalizeDocumentTextBoxFill(attrs.textBoxFill),
          ),
      },
      // The frame's outer shadow (a VML box's `v:shadow`), in the shared
      // shape shadow model: drawn as the box's own shadow, offset along its
      // direction (corpus R21-D04: an orange banner shadow 80 pt left of and
      // 36 pt above its box, across the page's top-left corner).
      textBoxShadow: {
        default: null,
        parseHTML: (element) => documentTextBoxShadow(element.getAttribute("data-text-box-shadow")),
        renderHTML: (attrs) => documentTextBoxShadowHtmlAttributes(attrs.textBoxShadow),
      },
      // `wp:inline`'s own `wp:extent`. Only an IN-LINE frame carries it; an
      // anchored one states its size inside `floatAnchor`, and the layout
      // pass owns that geometry.
      frameExtent: {
        default: null,
        parseHTML: (element) =>
          parseDocumentTextBoxFrameExtentAttribute(
            element.getAttribute("data-frame-extent"),
          ),
        renderHTML: (attrs) =>
          attrs.floatAnchor
            ? {}
            : documentTextBoxFrameExtentHtmlAttributes(
                normalizeDocumentTextBoxFrameExtent(attrs.frameExtent),
              ),
      },
      // The import found the page showing every member of the body's
      // floating stack: Bring Forward / Send Backward may move this frame
      // among the shapes and pictures, the save writes its anchor's height.
      zOrderStackComplete: {
        default: undefined,
        parseHTML: (element) =>
          element.getAttribute("data-z-order-stack-complete") === "true" ? true : undefined,
        renderHTML: (attrs) =>
          attrs.zOrderStackComplete === true ? { "data-z-order-stack-complete": "true" } : {},
      },
      floatAnchor: {
        default: null,
        parseHTML: (element) =>
          normalizeFloatAnchor(readJsonAttribute(element, "data-float-anchor")),
        renderHTML: (attrs) => {
          const anchor = normalizeFloatAnchor(attrs.floatAnchor);
          if (!anchor) return {};
          return {
            "data-float-anchor": JSON.stringify(anchor),
            "data-float-mode": floatFlowMode(anchor),
          };
        },
      },
      frameBody: {
        default: null,
        parseHTML: (element) => readJsonAttribute(element, "data-frame-body"),
        renderHTML: (attrs) => {
          if (!attrs.frameBody) return {};
          const body = normalizeFloatFrameBody(attrs.frameBody);
          const html: Record<string, string> = { "data-frame-body": JSON.stringify(body) };
          // An inline box (`wp:inline`, its extent stated) is a shape standing on
          // its line, not the editor's card: the package's insets, no margin, no
          // rounded corners. It takes its stated height on the page unless it
          // resizes to its text; words past it spill, never clipped
          // (R283-D06: 276 px on the page for a 199 px box, six of them).
          if (!attrs.floatAnchor && normalizeDocumentTextBoxFrameExtent(attrs.frameExtent)) {
            const px = (emu: number) => `${Math.round((emu / 9525) * 1000) / 1000}px`;
            const fixed = body.autofit === "shape" ? "" : ` height: ${px(normalizeDocumentTextBoxFrameExtent(attrs.frameExtent)!.heightEmu)};`;
            html.style = `margin: 0; border-radius: 0; padding: ${px(body.insetTEmu)} ${px(body.insetREmu)} ${px(body.insetBEmu)} ${px(body.insetLEmu)};${fixed}`;
          }
          return html;
        },
      },
      frameChain: {
        default: null,
        parseHTML: (element) => normalizeFloatFrameChain(readJsonAttribute(element, "data-frame-chain")),
        renderHTML: (attrs) => {
          const chain = normalizeFloatFrameChain(attrs.frameChain);
          return chain ? { "data-frame-chain": JSON.stringify(chain) } : {};
        },
      },
      frameName: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-frame-name") || null,
        renderHTML: (attrs) =>
          typeof attrs.frameName === "string" && attrs.frameName
            ? { "data-frame-name": attrs.frameName.slice(0, 255) }
            : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-text-box]",
        // The frame's blocks live in the inner element; without this the
        // wrapper's own attributes would be parsed as content.
        contentElement: (element) =>
          (element as HTMLElement).querySelector<HTMLElement>(":scope > [data-text-box-frame]") ??
          (element as HTMLElement),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        { "data-text-box": "" },
        { class: "mrnote-text-box" },
      ),
      ["div", { "data-text-box-frame": "", class: "mrnote-text-box__frame" }, 0],
    ];
  },

  // The frame's element is MRAI's, not one ProseMirror rebuilds: the geometry
  // the layout pass writes onto it has to survive the next doc transaction,
  // and pagination is a stream of them. `renderHTML` above stays exactly as it
  // is — it is still what copy/paste and HTML serialization use.
  addNodeView() {
    return floatingTextBoxNodeView;
  },
});

// ---------------------------------------------------------------------------
// Interactive widgets (the ProseMirror decoration DOM) + the driving plugin.
// ---------------------------------------------------------------------------

/** Stop a widget event from reaching ProseMirror's own handlers / the caret. */
function swallow(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

type ContentControlWidget =
  | HTMLButtonElement
  | HTMLInputElement
  | HTMLSelectElement;

function setContentControlWidgetAuthority(
  widget: ContentControlWidget,
  editable: boolean,
  fillLocked: boolean,
): void {
  const disabled = fillLocked || !editable;
  widget.disabled = disabled;
  widget.dataset.contentControlFillLocked = fillLocked ? "true" : "false";
  if (disabled) widget.setAttribute("aria-disabled", "true");
  else widget.removeAttribute("aria-disabled");
}

function syncContentControlWidgetAuthority(view: EditorView): void {
  // After every update: sheet by sheet, each unchanged sheet's matches kept.
  (querySheetsAll(
    view.dom as HTMLElement,
    ".mrnote-content-control-widget[data-content-control-fill-locked]",
  ) as ContentControlWidget[]).forEach((widget) =>
    setContentControlWidgetAuthority(
      widget,
      view.editable,
      widget.dataset.contentControlFillLocked === "true",
    ),
  );
}

/**
 * Build the focusable CHECKBOX toggle widget for a checkbox control. Renders ☑
 * when checked / ☐ when not; click and Enter/Space dispatch a toggle (unless the
 * control's contents are locked, in which case it is disabled + inert). The glyph
 * is a FIXED developer-authored character; no user text is interpolated.
 */
/**
 * The character a checkbox control shows for a state: its own glyph
 * (`w14:checkedState` / `w14:uncheckedState`, a hex code), else Word's ☒ /
 * ☐ (2612 / 2610 in MS Gothic). The widget and the control's text both show
 * it, so the native `w14:checked` and the sdtContent never disagree
 * (OFL-030: toggling changed the state and left the old character).
 */
export function checkboxControlGlyph(meta: ContentControlMeta, checked: boolean): string {
  const glyph = checked ? meta.checkedState : meta.uncheckedState;
  const code = Number.parseInt(glyph?.val ?? "", 16);
  if (Number.isInteger(code) && code >= 0x20 && code <= 0x10ffff) {
    try {
      return String.fromCodePoint(code);
    } catch {
      // Not a character: Word's default below.
    }
  }
  return checked ? "\u2612" : "\u2610";
}

/**
 * The symbol font of a checkbox control's state (`w14:checkedState` /
 * `w14:uncheckedState` `w14:font`), or null when the state names none.
 */
export function checkboxControlFont(meta: ContentControlMeta, checked: boolean): string | null {
  const glyph = checked ? meta.checkedState : meta.uncheckedState;
  return glyph?.font ? glyph.font : null;
}








/**
 * The length of the state symbol a checkbox control's text starts with, when
 * more text follows it (a control Word wrote around a whole line, "☒ Item"):
 * that one character is the box. 0 when the text does not start with one of
 * the control's two symbols (or Word's ☒ ☐ ☑), or is nothing but the symbol.
 */
export function checkboxLeadingSymbolLength(meta: ContentControlMeta, text: string): number {
  const first = String.fromCodePoint(text.codePointAt(0) ?? 0);
  if (!text || first.length === text.length) return 0;
  const symbols = new Set([
    checkboxControlGlyph(meta, true),
    checkboxControlGlyph(meta, false),
    "\u2612",
    "\u2610",
    "\u2611",
  ]);
  return symbols.has(first) ? first.length : 0;
}

/**
 * Word puts the insertion point in the control a widget just filled. The
 * caret goes there before the change, outside the undo history, so an Undo
 * restores it at the control: from wherever the caret was, the Undo scrolled
 * the page back to it (a widget press does not move the caret).
 */
function placeCaretInControl(view: EditorView, range: ContentControlRange): void {
  const live = controlLiveText(view.state.doc, range);
  const caret = range.meta.controlType === "checkbox"
    ? (() => {
        const leading = checkboxLeadingSymbolLength(range.meta, live.text);
        return leading > 0 ? live.start + leading : range.to;
      })()
    : range.to;
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, caret)).setMeta("addToHistory", false),
  );
}

/** The editor takes the focus back from a widget that filled its control,
 * so Ctrl+Z and typing reach the document. */
function returnFocusToEditor(view: EditorView): void {
  if (!view.hasFocus()) view.dom.focus({ preventScroll: true });
}

function setCheckboxControlState(
  tr: Transaction,
  markType: MarkType,
  range: ContentControlRange,
  checked: boolean,
): void {
  const glyph = checkboxControlGlyph(range.meta, checked);
  const live = controlLiveText(tr.doc, range);
  const leading = checkboxLeadingSymbolLength(range.meta, live.text);
  if (leading > 0) {
    // A control around a whole line: only its box changes. Replacing the
    // line with the symbol deleted the words after it (with Track Changes
    // on, the whole line came back struck through beside a new box).
    const controlMark = markType.create(controlAttrsWithKey(range, { checked, placeholder: false }));
    const startNode = tr.doc.nodeAt(live.start);
    const baseMarks = startNode
      ? startNode.marks.filter((m) => m.type.name !== CONTENT_CONTROL_MARK_NAME)
      : [];
    tr.replaceWith(live.start, live.start + leading, tr.doc.type.schema.text(glyph, controlMark.addToSet(baseMarks)));
    // Map through the replacement: under Track Changes the old symbol stays
    // (as a deletion) and the new one lands after it.
    const glyphTo = tr.mapping.map(live.start + leading);
    const glyphFrom = glyphTo - glyph.length;
    const end = tr.mapping.map(range.to);
    tr.removeMark(range.from, end, markType);
    tr.addMark(range.from, end, controlMark);
    const font = checkboxControlFont(range.meta, checked);
    const fontType = tr.doc.type.schema.marks.fontFamily;
    if (font && fontType) tr.addMark(glyphFrom, glyphTo, fontType.create({ family: font }));
    return;
  }
  replaceControlText(tr, markType, range, glyph, { checked });
  const font = checkboxControlFont(range.meta, checked);
  const fontType = tr.doc.type.schema.marks.fontFamily;
  if (font && fontType) {
    const glyphTo = tr.mapping.map(range.to);
    tr.addMark(glyphTo - glyph.length, glyphTo, fontType.create({ family: font }));
  }
}

/**
 * {@link setCheckboxControlState}, with an option button's group kept to one
 * checked box: checking one clears the others of its group.
 */
export function setCheckboxOrOptionState(
  tr: Transaction,
  markType: MarkType,
  range: ContentControlRange,
  checked: boolean,
): void {
  const key = sanitizeControlKey(range.mark.attrs.controlKey) ?? "";
  setCheckboxControlState(tr, markType, range, checked);
  const group = range.meta.radioGroup;
  if (!checked || !group) return;
  // One at a time, each found again in the document the last change left.
  for (let guard = 0; guard < 500; guard += 1) {
    const other = collectContentControlRanges(tr.doc).find(
      (candidate) =>
        candidate.meta.controlType === "checkbox" &&
        candidate.meta.radioGroup === group &&
        candidate.meta.checked &&
        (sanitizeControlKey(candidate.mark.attrs.controlKey) ?? "") !== key &&
        !isContentControlFillLocked(candidate.meta.lock),
    );
    if (!other) return;
    setCheckboxControlState(tr, markType, other, false);
  }
}

/** True for a press that opens the context menu rather than activating. */
function isSecondaryPress(event: Event): boolean {
  if (!(event instanceof MouseEvent)) return false;
  if (event.button !== 0) return true;
  // Control-click is the Mac's right click.
  return event.ctrlKey && /Mac/i.test(globalThis.navigator?.platform ?? "");
}

function buildCheckboxWidget(
  view: EditorView,
  positionOf: () => number | null,
  meta: ContentControlMeta,
): HTMLElement {
  const locked = isContentControlFillLocked(meta.lock);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mrnote-content-control-widget mrnote-content-control-checkbox";
  btn.setAttribute("contenteditable", "false");
  btn.setAttribute("role", meta.radioGroup ? "radio" : "checkbox");
  btn.setAttribute("aria-checked", meta.checked ? "true" : "false");
  btn.setAttribute("data-testid", "content-control-checkbox");
  btn.setAttribute("data-control-from", String(positionOf() ?? ""));
  // The control's title names the box for assistive tools, as the drop-down
  
  if (meta.alias) btn.setAttribute("aria-label", meta.alias);
  btn.textContent = checkboxControlGlyph(meta, meta.checked);
  btn.tabIndex = 0;
  setContentControlWidgetAuthority(btn, view.editable, locked);
  // Re-derive the range and authority at dispatch time so a moved control or
  // live permission change can never reuse the widget's render-time snapshot.
  const onActivate = (event: Event) => {
    swallow(event);
    if (!view.editable) return;
    // Where the widget is NOW: ProseMirror reuses a widget's DOM when its key
    // is unchanged, so a position captured when it was built can name another
    
    const from = positionOf();
    if (from === null) return;
    const range = controlRangeAt(view.state.doc, from);
    if (!range || range.meta.controlType !== "checkbox") return;
    if (isContentControlFillLocked(range.meta.lock)) return;
    const markType = view.state.schema.marks[CONTENT_CONTROL_MARK_NAME];
    if (!markType) return;
    const fromKeyboard = event instanceof KeyboardEvent;
    const buttonFocused = document.activeElement === btn || document.activeElement === document.body;
    // Word puts the insertion point in the box it toggles. The caret goes
    // there first (outside the undo history), so an Undo restores it at the
    // control: from wherever the caret was before, the Undo scrolled the page
    // back to it (a press does not move the caret) and the page jumped.
    // An option button stays chosen when pressed again (a radio button).
    if (range.meta.radioGroup && range.meta.checked) {
      placeCaretInControl(view, range);
      return;
    }
    placeCaretInControl(view, range);
    const tr = view.state.tr;
    setCheckboxOrOptionState(tr, markType, range, !range.meta.checked);
    view.dispatch(tr);
    // The widget is rebuilt for its new state (its key names the state), so
    // the focus the pressed button had goes to the new one: a second Space
    
    // leaves the caret in the text, where Ctrl+Z and typing reach the editor
    // (the press kept focus on whatever had it, often outside the page).
    if (fromKeyboard && buttonFocused) {
      const rebuilt = view.dom.querySelector<HTMLElement>(
        `button.mrnote-content-control-checkbox[data-control-from="${range.from}"]`,
      );
      if (rebuilt && rebuilt !== btn) rebuilt.focus({ preventScroll: true });
    } else {
      returnFocusToEditor(view);
    }
  };
  // Only the primary button toggles: a right (or middle) press opens the
  
  btn.addEventListener("mousedown", (event) => {
    if (isSecondaryPress(event)) {
      event.stopPropagation();
      return;
    }
    onActivate(event);
  });
  btn.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") onActivate(event);
  });
  return btn;
}

/**
 * Build the DROP-DOWN / combo `<select>` widget. Its options are the control's
 * `listItems` (display text shown, value carried), preceded by a localized
 * "Select…" placeholder. Choosing an option replaces the control's displayed
 * inner text with that option's display text (Word reflects the selection as the
 * sdtContent). Disabled + inert when the contents are locked. Option text is set
 * via `textContent` only (never innerHTML).
 */
function buildDropdownWidget(
  view: EditorView,
  positionOf: () => number | null,
  meta: ContentControlMeta,
  translate: ContentControlTranslator,
  innerText: string,
): HTMLElement {
  const locked = isContentControlFillLocked(meta.lock);
  const select = document.createElement("select");
  select.className = "mrnote-content-control-widget mrnote-content-control-select";
  select.setAttribute("contenteditable", "false");
  select.setAttribute("data-testid", "content-control-select");
  if (meta.alias) select.setAttribute("aria-label", meta.alias);

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = dropdownPlaceholder(translate);
  select.appendChild(placeholder);

  let matched = false;
  meta.listItems.forEach((item: ContentControlListItem, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = item.displayText;
    if (!matched && item.displayText === innerText) {
      option.selected = true;
      matched = true;
    }
    select.appendChild(option);
  });
  if (!matched) placeholder.selected = true;

  setContentControlWidgetAuthority(select, view.editable, locked);
  select.addEventListener("mousedown", (event) => event.stopPropagation());
  select.addEventListener("change", (event) => {
    event.stopPropagation();
    if (!view.editable) return;
    // Where the widget is NOW: ProseMirror reuses a widget's DOM when its key
    // is unchanged, so a position captured when it was built can name another
    
    const from = positionOf();
    if (from === null) return;
    const range = controlRangeAt(view.state.doc, from);
    if (
      !range ||
      (range.meta.controlType !== "dropDownList" &&
        range.meta.controlType !== "comboBox")
    )
      return;
    if (isContentControlFillLocked(range.meta.lock)) return;
    const markType = view.state.schema.marks[CONTENT_CONTROL_MARK_NAME];
    if (!markType) return;
    const idx = Number(select.value);
    const item =
      Number.isInteger(idx) && select.value !== ""
        ? range.meta.listItems[idx]
        : undefined;
    // The empty "Select…" placeholder makes no change (it never destroys the
    // control's run); only a real item replaces the displayed value.
    const text = item
      ? sanitizeControlText(item.displayText, MAX_CONTROL_ITEM_LENGTH)
      : "";
    if (!text) {
      // The placeholder cannot clear the value: the widget goes back to the
      
      const shown = controlLiveText(view.state.doc, range).text;
      const current = range.meta.listItems.findIndex(
        (entry: ContentControlListItem) => entry.displayText === shown,
      );
      select.value = current >= 0 ? String(current) : "";
      return;
    }
    placeCaretInControl(view, range);
    const placed = controlRangeAt(view.state.doc, range.from) ?? range;
    const tr = view.state.tr;
    replaceControlText(tr, markType, placed, text, {});
    view.dispatch(tr);
    returnFocusToEditor(view);
  });
  return select;
}

/**
 * Build the DATE picker `<input type="date">` widget. Its value is the control's
 * `dateFullDate` (ISO `YYYY-MM-DD` portion); choosing a date stores the ISO value
 * on the mark (→ `w:fullDate` on export) and shows the picked date inline using
 * the control's `dateFormat` when present (else the ISO string). Disabled + inert
 * when the contents are locked.
 */
function buildDateWidget(
  view: EditorView,
  positionOf: () => number | null,
  meta: ContentControlMeta,
): HTMLElement {
  const locked = isContentControlFillLocked(meta.lock);
  const input = document.createElement("input");
  input.type = "date";
  input.className = "mrnote-content-control-widget mrnote-content-control-date";
  input.setAttribute("contenteditable", "false");
  input.setAttribute("data-testid", "content-control-date");
  if (meta.alias) input.setAttribute("aria-label", meta.alias);
  // The native date input wants a YYYY-MM-DD value; take the date portion of the
  // stored ISO full-date if it has one.
  const isoDay = /^\d{4}-\d{2}-\d{2}/.exec(meta.dateFullDate)?.[0] ?? "";
  if (isoDay) input.value = isoDay;
  if (meta.dateFormat) input.title = meta.dateFormat;

  setContentControlWidgetAuthority(input, view.editable, locked);
  input.addEventListener("mousedown", (event) => event.stopPropagation());
  // The input is drawn as a small calendar button (its own text is not
  // shown): a press opens the date picker, as Word's date control button does.
  input.addEventListener("click", () => {
    if (input.disabled) return;
    try {
      (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      // The picker opens only on a user gesture; a script click does not.
    }
  });
  input.addEventListener("change", (event) => {
    event.stopPropagation();
    if (!view.editable) return;
    // Where the widget is NOW: ProseMirror reuses a widget's DOM when its key
    // is unchanged, so a position captured when it was built can name another
    
    const from = positionOf();
    if (from === null) return;
    const range = controlRangeAt(view.state.doc, from);
    if (!range || range.meta.controlType !== "date") return;
    if (isContentControlFillLocked(range.meta.lock)) return;
    const markType = view.state.schema.marks[CONTENT_CONTROL_MARK_NAME];
    if (!markType) return;
    const value = input.value; // "" when cleared, else YYYY-MM-DD
    const iso = value ? `${value}T00:00:00Z` : "";
    // The picked day in the control's own date picture (dd/MM/yyyy ->
    // 16/03/2026), as Word shows it; the ISO day only when it states none
    // (OFL-027). A cleared picker empties the text too (OFL-028): the control
    // stays, on its placeholder.
    const display = value ? wordDateControlText(iso, range.meta.dateFormat) : "";
    placeCaretInControl(view, range);
    const placed = controlRangeAt(view.state.doc, range.from) ?? range;
    const tr = view.state.tr;
    replaceControlText(tr, markType, placed, display, { dateFullDate: iso });
    view.dispatch(tr);
    returnFocusToEditor(view);
  });
  return input;
}

export const contentControlPluginKey = new PluginKey("documentContentControls");

/**
 * The text a drop-down list control may show: one of its items' display text,
 * or (emptied) its placeholder prompt. Word's drop-down list
 * (`w:dropDownList`) is filled only by choosing an item -- its "contents
 * shall not be editable ... regardless of the locking settings" -- unlike a
 * combo box (`w:comboBox`), whose text is free (ISO/IEC 29500-1, the
 * dropDownList and comboBox elements).
 */
function dropDownListAllows(meta: ContentControlMeta, text: string): boolean {
  if (meta.listItems.some((item) => item.displayText === text)) return true;
  return text === "" || text === wordControlPlaceholderText(meta.controlType);
}

/** Each keyed drop-down list control's text, keyed by its `controlKey`. */
function dropDownListTexts(doc: ProseMirrorNode): Map<string, string[]> {
  const texts = new Map<string, string[]>();
  for (const range of collectContentControlRanges(doc)) {
    if (range.meta.controlType !== "dropDownList") continue;
    const key = sanitizeControlKey(range.mark.attrs.controlKey);
    if (!key) continue;
    const list = texts.get(key) ?? [];
    // What the control shows: a choice made with Track Changes on keeps the
    // old item as a deletion beside the new one.
    list.push(controlLiveText(doc, range).text);
    texts.set(key, list);
  }
  return texts;
}









function editsDropDownListText(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
): boolean {
  const old = dropDownListTexts(before);
  if (old.size === 0) return false;
  for (const range of collectContentControlRanges(after)) {
    if (range.meta.controlType !== "dropDownList") continue;
    const key = sanitizeControlKey(range.mark.attrs.controlKey);
    const previous = key ? old.get(key) : undefined;
    if (!previous) continue;
    const text = controlLiveText(after, range).text;
    if (previous.includes(text)) continue;
    if (!dropDownListAllows(range.meta, text)) return true;
  }
  return false;
}









/** Controls whose whole contents typed text replaces as their value (Word). */
const TYPED_OVER_CONTROL_TYPES: ReadonlySet<string> = new Set(["text", "richText", "comboBox", "date"]);

/**
 * A check box, an option button, a drop-down list and a picture hold no
 * typed words: Word ignores keys typed over them (their box, item or prompt
 * selected, as an insert leaves it), and the control stays. Typed as a plain
 * replacement, the words took the place of the box and the control was gone
 * (docx rounds R280-D22, "body" group: the check box, option button, list
 * and picture each lost to the label typed after it).
 */
function typingIgnoredOver(doc: ProseMirrorNode, from: number, to: number): boolean {
  return collectContentControlRanges(doc).some(
    (candidate) =>
      !TYPED_OVER_CONTROL_TYPES.has(candidate.meta.controlType) &&
      from >= candidate.from &&
      to <= candidate.to,
  );
}

/**
 * An Enter (a break and nothing typed) that takes a whole control away: the
 * control's contents were selected, as an insert leaves its prompt, and the
 * break replaced them; the control, a mark on them, was gone (docx rounds
 * R280-D22, "body" group: each control inserted then lost to the Enter after
 * it). Word keeps the control there and ignores the Enter.
 */
function breakRemovesControl(doc: ProseMirrorNode, tr: Transaction): boolean {
  let breaks = false;
  for (const step of tr.steps) {
    if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep)) return false;
    const content = step.slice.content;
    if (content.textBetween(0, content.size, "", "") !== "") return false;
    content.descendants((node) => {
      if (node.type.name === "hardBreak" || node.isBlock) breaks = true;
      return !breaks;
    });
  }
  if (!breaks) return false;
  const before = collectContentControlRanges(doc);
  if (!before.length) return false;
  const after = new Set(collectContentControlRanges(tr.doc).map((range) => sanitizeControlKey(range.mark.attrs.controlKey)));
  return before.some((range) => {
    const key = sanitizeControlKey(range.mark.attrs.controlKey);
    return Boolean(key) && !after.has(key);
  });
}

function breaksSingleLineTextControl(doc: ProseMirrorNode, tr: Transaction): boolean {
  let current = doc;
  for (const step of tr.steps) {
    if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
      let breaks = false;
      step.slice.content.descendants((node) => {
        if (node.type.name === "hardBreak" || node.isBlock) breaks = true;
        return !breaks;
      });
      if (breaks) {
        for (const range of collectContentControlRanges(current)) {
          if (range.meta.controlType !== "text" || range.meta.multiline) continue;
          if (step.from > range.from && step.from < range.to) return true;
        }
      }
    }
    const applied = step.apply(current);
    if (!applied.doc) return false;
    current = applied.doc;
  }
  return false;
}





















function replaceTypedPlaceholders(
  markType: MarkType,
  oldDoc: ProseMirrorNode,
  tr: Transaction,
): boolean {
  const editable = (range: ContentControlRange) =>
    range.meta.placeholder &&
    (range.meta.controlType === "text" || range.meta.controlType === "richText") &&
    Boolean(sanitizeControlKey(range.mark.attrs.controlKey));
  const before = new Map(
    collectContentControlRanges(oldDoc)
      .filter(editable)
      .map((range) => [sanitizeControlKey(range.mark.attrs.controlKey), range] as const),
  );
  if (before.size === 0) return false;
  const text = (doc: ProseMirrorNode, range: ContentControlRange) =>
    doc.textBetween(range.from, range.to, "", "");
  const typed: { range: ContentControlRange; inserted: string }[] = [];
  for (const range of collectContentControlRanges(tr.doc)) {
    if (!editable(range)) continue;
    const previous = before.get(sanitizeControlKey(range.mark.attrs.controlKey));
    if (!previous) continue;
    const was = text(oldDoc, previous);
    const now = text(tr.doc, range);
    if (was === now) continue;
    let head = 0;
    while (head < was.length && head < now.length && was[head] === now[head]) head += 1;
    let tail = 0;
    while (
      tail < was.length - head &&
      tail < now.length - head &&
      was[was.length - 1 - tail] === now[now.length - 1 - tail]
    ) {
      tail += 1;
    }
    const inserted = now.slice(head, now.length - tail);
    if (inserted) typed.push({ range, inserted });
  }
  if (typed.length === 0) return false;
  let caret: number | null = null;
  for (const { range, inserted } of typed.sort((a, b) => b.range.from - a.range.from)) {
    replaceControlText(tr, markType, range, inserted, {});
    if (caret === null) caret = range.from + inserted.length;
    else caret = Math.min(caret, range.from + inserted.length);
  }
  if (typed.length === 1 && caret !== null) {
    tr.setSelection(TextSelection.create(tr.doc, caret));
  }
  return true;
}









function plainTextCellControlRanges(
  doc: ProseMirrorNode,
): { key: string; from: number; to: number }[] {
  const found: { key: string; from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") return true;
    const control = normalizeRowContentControl(node.attrs.cellContentControl);
    if (control && control.controlType === "text") {
      const key = sanitizeControlKey(control.controlKey) || `cell@${pos}`;
      found.push({ key, from: pos + 1, to: pos + node.nodeSize - 1 });
    }
    return true;
  });
  return found;
}

/**
 * Marks that are not a run's character formatting, which Word's rule for a
 * plain-text control (one format over all of it) does not reach: the
 * revisions Track Changes records (trackChanges' insertion, deletion and
 * format-change marks), a comment's and a bookmark's ranges. Widened, a word
 * typed with Track Changes on marked the control's whole text inserted, its
 * first word inserted and deleted at once, and the save refused the
 * document as an ambiguous revision (FIXQUEUE 238, corpus R438-D11 E55: the
 * "Project Title" control).
 */
const NOT_CHARACTER_FORMATTING: ReadonlySet<string> = new Set([
  "trackInsertion",
  "trackDeletion",
  "trackFormatting",
  "comment",
  "bookmark",
]);

function widenPlainTextControlFormatting(
  transactions: readonly Transaction[],
  oldDoc: ProseMirrorNode,
  newDoc: ProseMirrorNode,
  tr: Transaction,
): boolean {
  const markTypes = new Set<MarkType>();
  for (const transaction of transactions) {
    for (const step of transaction.steps) {
      if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
        markTypes.add(step.mark.type);
      }
    }
  }
  markTypes.forEach((type) => {
    if (type.name === CONTENT_CONTROL_MARK_NAME || NOT_CHARACTER_FORMATTING.has(type.name)) markTypes.delete(type);
  });
  if (markTypes.size === 0) return false;
  const plain = (doc: ProseMirrorNode) => [
    ...collectContentControlRanges(doc)
      .filter(
        (range) =>
          range.meta.controlType === "text" &&
          Boolean(sanitizeControlKey(range.mark.attrs.controlKey)),
      )
      .map((range) => ({
        key: sanitizeControlKey(range.mark.attrs.controlKey),
        from: range.from,
        to: range.to,
      })),
    ...plainTextCellControlRanges(doc),
  ];
  const ranges = plain(newDoc);
  if (ranges.length === 0) return false;
  const oldByKey = new Map(plain(oldDoc).map((range) => [range.key, range] as const));
  const marksOf = (doc: ProseMirrorNode, from: number, to: number, type: MarkType) => {
    const found: (ProseMirrorMark | null)[] = [];
    doc.nodesBetween(from, to, (node) => {
      if (node.isText) found.push(type.isInSet(node.marks) ?? null);
      return true;
    });
    return found;
  };
  const same = (a: ProseMirrorMark | null, b: ProseMirrorMark | null) =>
    a === b || (a !== null && b !== null && a.eq(b));
  let changed = false;
  for (const range of ranges) {
    const previous = oldByKey.get(range.key);
    if (!previous) continue;
    for (const type of markTypes) {
      const now = marksOf(newDoc, range.from, range.to, type);
      if (now.every((mark) => same(mark, now[0] ?? null))) continue;
      const before = marksOf(oldDoc, previous.from, previous.to, type);
      if (!before.every((mark) => same(mark, before[0] ?? null))) continue;
      const old = before[0] ?? null;
      const requested = now.find((mark) => !same(mark, old));
      if (requested === undefined) continue;
      const from = tr.mapping.map(range.from);
      const to = tr.mapping.map(range.to);
      if (requested) tr.addMark(from, to, requested);
      else tr.removeMark(from, to, type);
      changed = true;
    }
  }
  return changed;
}

/**
 * Build the WIDGET decoration set from a document: one focusable interactive
 * widget mounted at the START of every checkbox / drop-down / combo / date
 * control. Plain text/richText/picture controls get no widget (they stay editable
 * prose). Each widget's DOM is built lazily by ProseMirror, which passes the live
 * EditorView to the factory — the widget closes over the run's start position +
 * its meta snapshot, re-derives the range at interaction time, and dispatches an
 * undoable transaction. The widget is contentEditable=false + selection-ignored
 * so it never disturbs the caret. Empty set when the doc carries no interactive
 * control (zero overhead, zero visual change for an ordinary document). PURE given
 * the doc + the translate fn.
 */
/**
 * A drop-down's or date's button in a zero-size inline anchor: the button is
 * drawn over the line where it stood, but the line is laid out as if it were
 * not there (Word draws the control's text only; its button is chrome). As an
 * inline box one text line high it raised the lines of a small-type form
 * above Word's (R01-D02).
 */
function zeroLayoutAnchor(control: HTMLElement): HTMLElement {
  const anchor = document.createElement("span");
  anchor.className = "mrnote-content-control-anchor";
  anchor.contentEditable = "false";
  anchor.appendChild(control);
  return anchor;
}

function buildContentControlDecorations(
  doc: ProseMirrorNode,
  translate: ContentControlTranslator,
): DecorationSet {
  const decorations = contentControlDecorationList(doc, translate);
  return decorations.length === 0 ? DecorationSet.empty : DecorationSet.create(doc, decorations);
}

/** The widgets of the controls within the top-level children in [from, to).
 * A control never runs past its text block. `index` in a widget's key
 * counts the controls of that range. */
function contentControlDecorationList(
  doc: ProseMirrorNode,
  translate: ContentControlTranslator,
  from = 0,
  to = doc.content.size,
): Decoration[] {
  const ranges = collectContentControlRanges(doc, from, to).filter((range) =>
    INTERACTIVE_CONTROL_TYPES.has(range.meta.controlType),
  );
  const decorations: Decoration[] = [];
  if (ranges.length === 0) return decorations;
  ranges.forEach((range, index) => {
    // What the control shows now (a tracked deletion of its old value aside).
    const innerText = controlLiveText(doc, range).text;
    // A checkbox is ONE symbol: the widget is drawn in the marks of the
    // control's character (its font, size, colour) and the cached character
    // under it is kept in the document -- copy, save and export read it --
    
    // A control whose text is not its state's symbol keeps its text visible.
    const checkbox = range.meta.controlType === "checkbox";
    // A box toggled under Track Changes keeps its old symbol as a deletion
    // before the new one: the widget is the live symbol, in its marks.
    const live = checkbox ? controlLiveText(doc, range) : null;
    const startNode = live ? doc.nodeAt(live.start) : null;
    const widgetMarks = startNode?.isText ? startNode.marks : undefined;
    const fontKey = widgetMarks
      ?.filter((mark) => mark.type.name !== CONTENT_CONTROL_MARK_NAME)
      .map((mark) => `${mark.type.name}:${JSON.stringify(mark.attrs)}`)
      .join("|") ?? "";
    decorations.push(
      Decoration.widget(
        range.from,
        (view: EditorView, getPos: () => number | undefined) => {
          const positionOf = () => {
            const position = getPos();
            return typeof position === "number" ? position : null;
          };
          switch (range.meta.controlType) {
            case "checkbox":
              return buildCheckboxWidget(view, positionOf, range.meta);
            case "dropDownList":
            case "comboBox":
              return zeroLayoutAnchor(
                buildDropdownWidget(
                  view,
                  positionOf,
                  range.meta,
                  translate,
                  innerText,
                ),
              );
            case "date":
            default:
              return zeroLayoutAnchor(
                buildDateWidget(view, positionOf, range.meta),
              );
          }
        },
        {
          side: -1,
          ignoreSelection: true,
          // A drop-down's or date's button stands in a zero-size anchor and
          // owns no line box, so its line is measured as Word lays it out
          // (documentAutoLineSafety). A checkbox is the control's one glyph.
          ...(checkbox ? {} : { zeroLayoutContentControl: true }),
          ...(widgetMarks ? { marks: [...widgetMarks] } : {}),
          // The key names the state the widget was built for: a change of it
          // (a toggle, an Undo, a command) rebuilds the widget instead of
          // reusing a DOM that still shows the old state (OFL-029).
          key: `content-control-widget-${range.meta.controlType}-${range.meta.lock ?? "unlocked"}-${index}-${range.meta.checked ? 1 : 0}-${range.meta.dateFullDate}-${innerText}-${fontKey}`,
        },
      ),
    );
    // The box a control Word wrote around a whole line starts its text: that
    // character, not the line, is the one the widget stands for.
    const leading = live ? checkboxLeadingSymbolLength(range.meta, live.text) : 0;
    if (live && live.text === checkboxControlGlyph(range.meta, range.meta.checked)) {
      decorations.push(
        Decoration.inline(live.start, range.to, {
          class: "mrnote-content-control-checkbox-glyph",
          "aria-hidden": "true",
        }),
      );
    } else if (live && leading > 0) {
      decorations.push(
        Decoration.inline(live.start, live.start + leading, {
          class: "mrnote-content-control-checkbox-glyph",
          "aria-hidden": "true",
        }),
      );
    }
  });
  return decorations;
}

/**
 * The user-facing bundle: the inline mark + the block node + the floating text
 * box node. Exported as an array (spread into the plugin registry like
 * DocumentCaptions) so all register in one entry. The mark/block node accept a
 * `translate` option for the localized boundary tooltip; the text box carries no
 * metadata so it needs none.
 *
 * INTERACTIVE FORM FILLING — this wrapper additionally owns the ProseMirror plugin
 * that paints the checkbox/drop-down/date widgets (decorations) and the
 * editor commands a widget (or any caller) uses to mutate a control's state
 * undoably. The widget DOM dispatches through these commands' underlying
 * transaction so the change enters the undo history and re-sanitizes.
 */
/**
 * A Word content control around whole table rows (`w:tbl/w:sdt/w:sdtContent/w:tr`,
 * corpus R85-D03), kept on each row it wraps: the control's attributes as the
 * `contentControl` mark keeps them, plus the `controlKey` the rows of one
 * control share. The export wraps those rows in one `w:sdt` again.
 */
export function normalizeRowContentControl(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const attrs = controlMetaToAttrs(normalizeControlMeta(value));
  const key = sanitizeControlKey((value as Record<string, unknown>).controlKey);
  return key ? { ...attrs, controlKey: key } : attrs;
}

export const DocumentContentControls = Extension.create<ContentControlOptions>({
  name: "documentContentControls",

  addOptions() {
    return { translate: (key: string) => key };
  },

  addGlobalAttributes() {
    return [
      {
        // A Word content control around one table cell
        // (`w:tr/w:sdt/w:sdtContent/w:tc`, corpus R125-D12): the export wraps
        // the cell in it again; a plain-text one formats its whole text.
        types: ["tableCell", "tableHeader"],
        attributes: {
          cellContentControl: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element: HTMLElement) => {
              const raw = element.getAttribute("data-cell-content-control");
              if (raw === null) return null;
              try {
                return normalizeRowContentControl(JSON.parse(raw));
              } catch {
                return null;
              }
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              const control = normalizeRowContentControl(attributes.cellContentControl);
              return control ? { "data-cell-content-control": JSON.stringify(control) } : {};
            },
          },
        },
      },
      {
        types: ["tableRow"],
        attributes: {
          rowContentControl: {
            default: null,
            // A row added inside the control is not in it until Word puts it there.
            keepOnSplit: false,
            parseHTML: (element: HTMLElement) => {
              const raw = element.getAttribute("data-row-content-control");
              if (raw === null) return null;
              try {
                return normalizeRowContentControl(JSON.parse(raw));
              } catch {
                return null;
              }
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              const control = normalizeRowContentControl(attributes.rowContentControl);
              return control ? { "data-row-content-control": JSON.stringify(control) } : {};
            },
          },
        },
      },
    ];
  },

  addExtensions() {
    return [
      ContentControlMark.configure({ translate: this.options.translate }),
      BlockContentControlNode.configure({ translate: this.options.translate }),
      TextBoxNode,
    ];
  },

  addCommands() {
    return {
      insertContentControl:
        (options) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const markType = state.schema.marks[CONTENT_CONTROL_MARK_NAME];
          if (!markType) return false;
          const { type } = options;
          const { from, to, $from, $to, empty } = state.selection;
          const meta = normalizeControlMeta({
            controlType: type,
            controlId: Math.floor(Math.random() * 0x7ffffffe) + 1,
            ...(type === "dropDownList" || type === "comboBox"
              ? { listItems: [{ displayText: options.firstItemText ?? options.placeholderText, value: "" }] }
              : {}),
            ...(type === "date" && options.dateFormat ? { dateFormat: options.dateFormat } : {}),
            ...(type === "checkbox" ? { checked: false } : {}),
            ...(type === "checkbox" && normalizeRadioGroup(options.radioGroup)
              ? {
                  radioGroup: normalizeRadioGroup(options.radioGroup),
                  checkedState: RADIO_CHECKED_GLYPH,
                  uncheckedState: RADIO_UNCHECKED_GLYPH,
                }
              : {}),
          });
          const attrsFor = (placeholder: boolean) => ({
            ...controlMetaToAttrs({ ...meta, placeholder }),
            controlKey: controlKeyFor(),
          });
          const blockType = state.schema.nodes[BLOCK_CONTENT_CONTROL_NODE_NAME];
          if (!empty && !$from.sameParent($to)) {
            // Several paragraphs: Word's rich text control holds them.
            if (type !== "richText" || !blockType) return false;
            const range = $from.blockRange($to);
            const wrapping = range && findWrapping(range, blockType, controlMetaToAttrs(meta));
            if (!range || !wrapping) return false;
            if (dispatch) dispatch(tr.wrap(range, wrapping).scrollIntoView());
            return true;
          }
          if (!$from.parent.inlineContent) return false;
          const baseMarks = (empty ? state.storedMarks ?? $from.marks() : $from.marksAcross($to) ?? [])
            .filter((mark) => mark.type !== markType);
          if (dispatch) {
            if (type === "checkbox" || empty) {
              const text =
                type === "checkbox"
                  ? String.fromCodePoint(Number.parseInt(meta.uncheckedState?.val ?? "2610", 16))
                  : options.placeholderText;
              const mark = markType.create(attrsFor(type !== "checkbox"));
              tr.replaceWith(from, to, state.schema.text(text, mark.addToSet(baseMarks)));
              tr.setSelection(TextSelection.create(tr.doc, from, from + text.length));
            } else {
              tr.addMark(from, to, markType.create(attrsFor(false)));
            }
            dispatch(tr.scrollIntoView());
          }
          return true;
        },
      setContentControlProperties:
        (from, patch) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const markType = state.schema.marks[CONTENT_CONTROL_MARK_NAME];
          const range = controlRangeAt(state.doc, from);
          if (range && markType) {
            if (dispatch) {
              const attrs = controlAttrsWithKey(range, patch);
              const next = normalizeControlMeta(attrs);
              const glyphChanged =
                next.controlType === "checkbox" &&
                (patch.checkedState !== undefined || patch.uncheckedState !== undefined);
              if (glyphChanged) {
                // The box shows its state's symbol: Word redraws it at once.
                const glyph = (next.checked ? next.checkedState : next.uncheckedState)?.val ??
                  (next.checked ? "2612" : "2610");
                const startNode = tr.doc.nodeAt(range.from);
                const base = startNode ? startNode.marks.filter((mark) => mark.type !== markType) : [];
                tr.replaceWith(
                  range.from,
                  range.to,
                  state.schema.text(String.fromCodePoint(Number.parseInt(glyph, 16)), markType.create(attrs).addToSet(base)),
                );
              } else {
                tr.removeMark(range.from, range.to, markType);
                tr.addMark(range.from, range.to, markType.create(attrs));
              }
              dispatch(tr);
            }
            return true;
          }
          const node = state.doc.nodeAt(from);
          if (node?.type.name !== BLOCK_CONTENT_CONTROL_NODE_NAME) return false;
          if (dispatch) {
            const next = controlMetaToAttrs(normalizeControlMeta({ ...normalizeControlMeta(node.attrs), ...patch }));
            dispatch(tr.setNodeMarkup(from, undefined, next, node.marks));
          }
          return true;
        },
      removeContentControl:
        (from) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const markType = state.schema.marks[CONTENT_CONTROL_MARK_NAME];
          const range = controlRangeAt(state.doc, from);
          if (range && markType) {
            if (isContentControlDeleteLocked(range.meta.lock)) return false;
            if (dispatch) dispatch(tr.removeMark(range.from, range.to, markType));
            return true;
          }
          const node = state.doc.nodeAt(from);
          if (node?.type.name !== BLOCK_CONTENT_CONTROL_NODE_NAME) return false;
          if (dispatch) {
            dispatch(tr.replaceWith(from, from + node.nodeSize, node.content));
          }
          return true;
        },
      setContentControlChecked:
        (from: number, checked: boolean) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const range = controlRangeAt(state.doc, from);
          if (!range || range.meta.controlType !== "checkbox") return false;
          if (isContentControlFillLocked(range.meta.lock)) return false;
          const markType = state.schema.marks[CONTENT_CONTROL_MARK_NAME];
          if (!markType) return false;
          if (dispatch) {
            setCheckboxOrOptionState(tr, markType, range, checked === true);
            dispatch(tr);
          }
          return true;
        },
      setContentControlValue:
        (from: number, value: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const range = controlRangeAt(state.doc, from);
          if (
            !range ||
            (range.meta.controlType !== "dropDownList" &&
              range.meta.controlType !== "comboBox")
          )
            return false;
          if (isContentControlFillLocked(range.meta.lock)) return false;
          const markType = state.schema.marks[CONTENT_CONTROL_MARK_NAME];
          if (!markType) return false;
          if (dispatch) {
            replaceControlText(
              tr,
              markType,
              range,
              sanitizeControlText(value, MAX_CONTROL_ITEM_LENGTH),
              {},
            );
            dispatch(tr);
          }
          return true;
        },
      setContentControlDate:
        (from: number, isoDate: string, displayText: string) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const range = controlRangeAt(state.doc, from);
          if (!range || range.meta.controlType !== "date") return false;
          if (isContentControlFillLocked(range.meta.lock)) return false;
          const markType = state.schema.marks[CONTENT_CONTROL_MARK_NAME];
          if (!markType) return false;
          const iso = sanitizeControlText(isoDate, MAX_CONTROL_ITEM_LENGTH);
          // No display text given: the date in the control's own picture; no
          // date at all: the control empties onto its placeholder (OFL-028).
          const display =
            sanitizeControlText(displayText, MAX_CONTROL_ITEM_LENGTH) ||
            (iso ? wordDateControlText(iso, range.meta.dateFormat) : "");
          if (dispatch) {
            replaceControlText(tr, markType, range, display, { dateFullDate: iso });
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const translate = this.options.translate;
    let drawn: { doc: ProseMirrorNode; set: DecorationSet } | null = null;
    return [
      new Plugin({
        key: contentControlPluginKey,
        // Word's "Contents cannot be edited" (w:lock contentLocked /
        // sdtContentLocked) binds every edit, not only the form widgets: a
        // Find & Replace, a paste or typing inside such a control is refused
        // here (OFL-025 rewrote a locked control's text and exported it with
        // its lock). Deleting the whole control stays possible under
        // contentLocked, which protects the contents and not the control.
        filterTransaction: (tr, state) => {
          if (!tr.docChanged) return true;
          // Word's "Filling in forms" (w:documentProtection w:edit="forms"):
          // only a content control's contents change; every edit outside one
          // is refused, as Word keeps the insertion point in the fields.
          if (
            isDocumentFormsProtected(effectiveDocumentProtection(state.doc.attrs?.documentProtection)) &&
            !isTrustedReadOnlyDocumentMutation(tr) &&
            tr.getMeta("history$") === undefined &&
            !editsOnlyInsideControls(tr)
          ) {
            return false;
          }
          if (
            !isTrustedReadOnlyDocumentMutation(tr) &&
            tr.getMeta("history$") === undefined &&
            (editsDropDownListText(state.doc, tr.doc) ||
              breaksSingleLineTextControl(state.doc, tr) ||
              breakRemovesControl(state.doc, tr))
          ) {
            return false;
          }
          const guarded = (range: { meta: { lock: unknown } }) =>
            isContentControlFillLocked(range.meta.lock) || isContentControlDeleteLocked(range.meta.lock);
          if (!collectContentControlRanges(state.doc).some(guarded)) return true;
          let doc = state.doc;
          for (const step of tr.steps) {
            if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
              const { from, to } = step;
              const current = collectContentControlRanges(doc).filter(guarded);
              for (const range of current) {
                const overlaps = from < range.to && to > range.from;
                const inside = from > range.from || to < range.to;
                if (!overlaps) continue;
                if (isContentControlFillLocked(range.meta.lock)) {
                  // A step covering the whole control removes it: allowed when
                  // only its contents are locked (Word's ContentLocked keeps
                  // the control deletable).
                  if (!inside && range.meta.lock === "contentLocked") continue;
                  return false;
                }
                // Word's SdtLocked: the contents stay editable, the control
                // itself cannot be removed (OFL-044) -- a step that deletes
                // the whole range is refused; one inside it, or one that
                // replaces the words (typing over them, Find & Replace), is
                // not: the replacement keeps the control's mark.
                if (!inside && step.slice.size === 0) return false;
              }
            }
            const applied = step.apply(doc);
            if (!applied.doc) return false;
            doc = applied.doc;
          }
          return true;
        },
        appendTransaction: imeSafeAppendTransaction((transactions, oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          if (
            transactions.some(
              (transaction) =>
                isTrustedReadOnlyDocumentMutation(transaction) ||
                transaction.getMeta("history$") !== undefined,
            )
          ) {
            return null;
          }
          if (transactions.some((transaction) => transaction.getMeta(ySyncPluginKey) !== undefined)) {
            return null;
          }
          const tr = newState.tr;
          const widened = widenPlainTextControlFormatting(transactions, oldState.doc, newState.doc, tr);
          const controlMarkType = newState.schema.marks[CONTENT_CONTROL_MARK_NAME];
          const typed = controlMarkType
            ? replaceTypedPlaceholders(controlMarkType, oldState.doc, tr)
            : false;
          // Word: every control mapped to the node an edited control maps
          // shows its new words (boundControlSync.ts), in this same step.
          const bound = controlMarkType
            ? syncBoundControls(controlMarkType, oldState.doc, tr)
            : false;
          if (widened || typed || bound) return tr;
          // Typing at the end of a text control goes on inside it.
          const edge = controlEdgeTypingMarks(transactions, newState);
          return edge ? tr.setStoredMarks(edge) : null;
        }),
        props: {
          // Word: text typed over a control's whole contents (its prompt,
          // selected as an insert leaves it) becomes the control's value --
          // the control stays. Typed as a plain replacement, the new text
          // took none of the control's mark and the control was gone (docx
          // rounds R280-D22, "body" group: every control lost to the label
          // typed after it, the caret thrown into another cell).
          // The same keys at the keyboard, before any input rule reads them:
          // AutoCorrect's word end ("cell." and a space) put the space "over
          // any selection" and took the selected picture prompt with it.
          handleKeyPress(view, event) {
            if (!view.editable || event.ctrlKey || event.metaKey || event.key.length !== 1) return false;
            const { from, to } = view.state.selection;
            return from !== to && typingIgnoredOver(view.state.doc, from, to);
          },
          handleTextInput(view, from, to, text) {
            if (from === to && text && view.editable && typedAtFormFieldEdge(view, from, text)) return true;
            if (from === to || !text || !view.editable) return false;
            const markType = view.state.schema.marks[CONTENT_CONTROL_MARK_NAME];
            if (!markType) return false;
            if (typingIgnoredOver(view.state.doc, from, to)) return true;
            const range = collectContentControlRanges(view.state.doc).find((candidate) => candidate.from === from && candidate.to === to);
            if (!range || !TYPED_OVER_CONTROL_TYPES.has(range.meta.controlType)) return false;
            const tr = view.state.tr;
            replaceControlText(tr, markType, range, text, {});
            tr.setSelection(TextSelection.create(tr.doc, from + text.length));
            // The caret is at the control's end: what is typed next goes on
            // inside it (controlEdgeTypingMarks).
            const typedNode = tr.doc.nodeAt(from);
            if (typedNode) tr.setStoredMarks(typedNode.marks.filter((mark) => mark.type.name !== DELETION_MARK_NAME));
            view.dispatch(tr.scrollIntoView());
            return true;
          },
          // Paint the interactive widgets. ProseMirror passes the live EditorView
          // to each widget's DOM factory (see buildContentControlDecorations), so
          // the widget can dispatch an undoable transaction on interaction.
          // Every view update asks (a caret move too): the set is kept per
          // document, and an edit rebuilds the top-level blocks it replaced.
          decorations(state) {
            if (drawn?.doc === state.doc) return drawn.set;
            const set = drawn
              ? patchTopLevelDecorations(drawn.doc, drawn.set, state.doc,
                (from, to) => contentControlDecorationList(state.doc, translate, from, to))
              : buildContentControlDecorations(state.doc, translate);
            drawn = { doc: state.doc, set };
            return set;
          },
        },
        view(view) {
          syncContentControlWidgetAuthority(view);
          // Only a new document or a change of who may write moves a widget: the
          // other updates of a key (decorations, the room's Undo stack) move none.
          let syncedDoc = view.state.doc;
          let syncedEditable = view.editable;
          return {
            update(nextView) {
              if (nextView.state.doc === syncedDoc && nextView.editable === syncedEditable) return;
              syncedDoc = nextView.state.doc;
              syncedEditable = nextView.editable;
              syncContentControlWidgetAuthority(nextView);
            },
          };
        },
      }),
    ];
  },
});

export default DocumentContentControls;
