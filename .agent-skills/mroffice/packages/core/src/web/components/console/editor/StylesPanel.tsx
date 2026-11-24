"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { DocumentDialogIcon } from "./native-document/DocumentDialogIcon";
import type { DocumentTextAlign } from "./extensions/DocumentFormatting";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useLocale, useTranslations } from "../../../../host/next-intl";
import type { Editor } from "@tiptap/react";
import type { Transaction } from "@tiptap/pm/state";
import type { DocumentParagraphBorders } from "../../../lib/document-borders";
import {
  Check,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "../../office-ribbon/icons/houseIcons";

import { OfficeTaskPane } from "../../office-ribbon/OfficeTaskPane";
import { OfficeDialogShell } from "../../office-ribbon/OfficeDialogShell";

import styles from "./StylesPanel.module.css";

import { setSelectedTextBlockTypePreservingAttrs } from "./native-document/blockIds";
import {
  ensureStableNamedStyleIds,
  isImportedNamedStyleDefinition,
  NAMED_STYLE_FORMAT_FIELDS,
  applyNamedStyleToParagraphRuns,
  namedStyleApplyOps,
  resolveNamedStyle,
  restyleNamedStyleParagraphs,
  normalizeDocxStyleId,
  removeNamedStyleWithDependents,
  upsertNamedStyle,
  type NamedStyleDefinition,
} from "./native-document/paragraphStyles";
import {
  DOCUMENT_BUILTIN_STYLE_GALLERY,
  applyDocumentBuiltinStyle,
  clearDocumentStyleFormatting,
  type DocumentBuiltinStyleId,
} from "./documentStyleGallery";
import { normalizeCharacterStyle } from "./extensions/TextStyling";
import { normalizeStyleDefinitions } from "./extensions/DocumentPageSetup";
import { DOCUMENT_REVEAL_FORMATTING_EVENT } from "./native-document/revealFormatting";
import { editorViewDom } from "./native-document/editorViewDom";
import {
  DocumentStyleDialog,
  STYLE_DIALOG_NEXT_SELF,
  type StyleDialogValue,
} from "./native-document/DocumentStyleDialog";
import { fontPixelsToPoints, fontPointsToPixels } from "./documentHomeRibbonCatalog";
import {
  importedParagraphStyleById,
  importedStyleFontGroup,
  modifyImportedParagraphStyle,
  type ImportedStyleFontChange,
} from "./native-document/importedStyleModify";

/**
 * Home > Styles > "Create a Style" (Word's Create New Style from Formatting):
 * the formatting of the selection seeds a new style's form. A new `nonce`
 * opens the form again for the same seed.
 */
export interface StylesPanelCreateRequest {
  readonly seed: Omit<NamedStyleDefinition, "name">;
  readonly nonce: number;
}

interface StylesPanelProps {
  editor: Editor;
  onClose: () => void;
  createRequest?: StylesPanelCreateRequest | null;
}

type RuntimeEditor = Editor & {
  on?: (event: string, cb: () => void) => void;
  off?: (event: string, cb: () => void) => void;
};

function canMutateStyles(editor: Editor): boolean {
  return !editor.isDestroyed && editor.isEditable;
}

/**
 * The chain surface the panel drives. Every command already exists on the
 * document editor (see DocumentToolbar / documentCommands); we type the subset
 * the Styles pane uses so the apply paths stay honest without pulling the whole
 * toolbar chain type in.
 */
interface StyleChain {
  command: (apply: (props: { tr: Transaction }) => boolean) => StyleChain;
  focus: () => StyleChain;
  setFontSize: (size: string) => StyleChain;
  unsetFontSize: () => StyleChain;
  setFontFamily: (family: string) => StyleChain;
  setTextColor: (color: string) => StyleChain;
  unsetTextColor: () => StyleChain;
  setMark: (name: string, attrs?: Record<string, unknown>) => StyleChain;
  unsetMark: (name: string) => StyleChain;
  setCharacterStyle: (name: string) => StyleChain;
  unsetCharacterStyle: () => StyleChain;
  unsetFontFamily: () => StyleChain;
  setTextAlign: (align: DocumentTextAlign) => StyleChain;
  unsetTextAlign: () => StyleChain;
  setLineHeight: (value: string | number | null) => StyleChain;
  unsetLineHeight: () => StyleChain;
  setSpaceBefore: (value: string | number | null) => StyleChain;
  setSpaceAfter: (value: string | number | null) => StyleChain;
  setParagraphIndents: (value: {
    indentLeftPt?: string | number | null;
    indentRightPt?: string | number | null;
    firstLineIndentPt?: string | number | null;
  }) => StyleChain;
  setParagraphBorder: (value: "box" | "bottom" | "left" | null) => StyleChain;
  setParagraphBorders: (value: DocumentParagraphBorders | null) => StyleChain;
  setParagraphShading: (value: string | null) => StyleChain;
  unsetCharSpacing: () => StyleChain;
  setKeepNext: (value: boolean | null) => StyleChain;
  setKeepLines: (value: boolean | null) => StyleChain;
  setContextualSpacing: (value: boolean | null) => StyleChain;
  setBlockquote: () => StyleChain;
  unsetBlockquote: () => StyleChain;
  clearTextStyles: () => StyleChain;
  /** applyDocumentBuiltinStyle may lift a listed paragraph before it
   * becomes a heading. */
  liftListItem: (typeOrName: string) => StyleChain;
  setCustomParagraphStyle: (name: string, styleId?: string) => StyleChain;
  setDocxParagraphStyle: (styleId: string) => StyleChain;
  clearCustomParagraphStyle: () => StyleChain;
  renameCustomParagraphStyleReferences: (
    styleId: string,
    previousName: string,
    nextName: string,
  ) => StyleChain;
  clearCustomParagraphStyleReferences: (
    styleId: string,
    name: string,
  ) => StyleChain;
  setNamedStyles: (styles: unknown) => StyleChain;
  run: () => boolean;
}

const styleChain = (editor: Editor): StyleChain =>
  (editor.chain() as unknown as StyleChain).focus();

/** The pane's words, resolved from `console-notebooks` keys. */
function stylesPanelLabels(t: (key: string) => string) {
  const k = (leaf: string) => t(`stylesPane.${leaf}`);
  return {
    title: k("title"),
    close: k("close"),
    search: k("search"),
    recommended: k("recommended"),
    inDocument: k("inDocument"),
    all: k("all"),
    builtIn: k("builtIn"),
    imported: k("imported"),
    custom: k("custom"),
    current: k("current"),
    readOnly: k("readOnly"),
    sourcePreserved: k("sourcePreserved"),
    noResults: k("noResults"),
    newStyle: k("newStyle"),
    noCustom: k("noCustom"),
    apply: k("apply"),
    modify: k("modify"),
    rename: k("rename"),
    delete: k("delete"),
    usedDeleteUnavailable: k("usedDeleteUnavailable"),
  };
}

/** Read the document's named-style palette from the live editor doc attrs. */
function readPalette(editor: Editor): NamedStyleDefinition[] {
  const attrs =
    (editor.state?.doc?.attrs as { namedStyles?: unknown } | undefined) ?? {};
  return ensureStableNamedStyleIds(attrs.namedStyles);
}

function readAssignedStyleId(editor: Editor): string | null {
  const runtime = editor as Editor & {
    getAttributes?: (name: string) => Record<string, unknown>;
    isActive?: (name: string) => boolean;
  };
  const type = runtime.isActive?.("heading") ? "heading" : "paragraph";
  const attrs = runtime.getAttributes?.(type) ?? {};
  return (
    normalizeDocxStyleId(attrs.docxStyleId) ??
    normalizeDocxStyleId(attrs.customStyleId)
  );
}

function readAssignedDocxStyleId(editor: Editor): string | null {
  const runtime = editor as Editor & {
    getAttributes?: (name: string) => Record<string, unknown>;
    isActive?: (name: string) => boolean;
  };
  const type = runtime.isActive?.("heading") ? "heading" : "paragraph";
  return normalizeDocxStyleId(runtime.getAttributes?.(type)?.docxStyleId);
}

interface ImportedParagraphStyleIdentity {
  styleId: string;
  name: string;
}

/**
 * Resolve the selected paragraph's exact imported style identity without
 * promoting an Office built-in into MRNote's editable named-style palette.
 * The native style graph stays read-only/source-owned; malformed graphs or
 * non-paragraph styles fail closed.
 */
function readActiveImportedParagraphStyle(
  editor: Editor,
  editablePalette: readonly NamedStyleDefinition[],
): ImportedParagraphStyleIdentity | null {
  const styleId = readAssignedDocxStyleId(editor);
  if (!styleId || editablePalette.some((style) => style.styleId === styleId)) {
    return null;
  }
  const styleDefinitions = normalizeStyleDefinitions(
    (editor.state.doc.attrs as { styleDefinitions?: unknown }).styleDefinitions,
  );
  const styles = styleDefinitions?.styles;
  if (!Array.isArray(styles)) return null;
  const source = styles.find(
    (raw) =>
      raw !== null &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      (raw as Record<string, unknown>).styleId === styleId,
  ) as Record<string, unknown> | undefined;
  if (!source || source.type !== "paragraph") return null;
  const name = typeof source.name === "string" ? source.name.trim() : "";
  if (!name || name.length > 256 || /[\u0000-\u001f]/.test(name)) return null;
  return { styleId, name };
}

function importedStyleIdentitySignature(
  identity: ImportedParagraphStyleIdentity | null,
): string {
  return identity ? `${identity.styleId}\u0000${identity.name}` : "";
}

type StylesPanelView = "recommended" | "document" | "all";

/**
 * Word's Style Pane Options (Styles pane > Options...; Microsoft Support,
 * "Customize or create new styles"): which styles to show and how the list
 * is sorted. MRAI's three views are Word's Recommended, In current document
 * and All styles ("In use" is the same list here: every style a paragraph of
 * the document carries). Sorting: As Recommended (gallery order),
 * Alphabetical, and By type (paragraph styles, then character styles). The
 * "Select formatting to show as styles" checkboxes and the built-in name
 * options are not offered: MRAI's pane lists styles only, never direct
 * formatting.
 */
export type StylesPanelSort = "recommended" | "alphabetical" | "type";

/** Word's pane footer checkboxes, remembered per browser like Word per user. */
const STYLES_PANE_PREFS_KEY = "mrai.docs.stylesPane.v1";

interface StylesPanePrefs {
  showPreview: boolean;
  disableLinkedStyles: boolean;
  view: StylesPanelView;
  sort: StylesPanelSort;
}

const DEFAULT_PREFS: StylesPanePrefs = {
  // Word ships with Show Preview and Disable Linked Styles off.
  showPreview: false,
  disableLinkedStyles: false,
  view: "recommended",
  sort: "recommended",
};

function readStylesPanePrefs(): StylesPanePrefs {
  try {
    const raw = window.localStorage.getItem(STYLES_PANE_PREFS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<StylesPanePrefs>) : {};
    return {
      showPreview: parsed.showPreview === true,
      disableLinkedStyles: parsed.disableLinkedStyles === true,
      view:
        parsed.view === "document" || parsed.view === "all"
          ? parsed.view
          : "recommended",
      sort:
        parsed.sort === "alphabetical" || parsed.sort === "type"
          ? parsed.sort
          : "recommended",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writeStylesPanePrefs(prefs: StylesPanePrefs): void {
  try {
    window.localStorage.setItem(STYLES_PANE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage may be unavailable (private mode); the choice holds for the session.
  }
}

function sortByName<T>(items: T[], name: (item: T) => string, locale: string): T[] {
  return [...items].sort((left, right) =>
    name(left).localeCompare(name(right), locale, { sensitivity: "base" }),
  );
}

interface ImportedStyleSummary {
  styleId: string;
  name: string;
  type: string;
  basedOn: string | null;
  next: string | null;
  link: string | null;
}

interface ImportedStyleGraphMetadata {
  sourceModelSha256: string | null;
  latentStylesPreserved: boolean;
  sourcePartPreserved: boolean;
}

function safeImportedStyleText(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f]/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function readImportedStyleSummaries(editor: Editor): ImportedStyleSummary[] {
  const definitions = normalizeStyleDefinitions(
    (editor.state.doc.attrs as { styleDefinitions?: unknown }).styleDefinitions,
  );
  const rawStyles = definitions?.styles;
  if (!Array.isArray(rawStyles)) return [];
  const summaries: ImportedStyleSummary[] = [];
  for (const rawStyle of rawStyles) {
    if (!rawStyle || typeof rawStyle !== "object" || Array.isArray(rawStyle)) {
      continue;
    }
    const source = rawStyle as Record<string, unknown>;
    const styleId = safeImportedStyleText(source.styleId, 128);
    const name = safeImportedStyleText(source.name, 256);
    const type = safeImportedStyleText(source.type, 32);
    if (!styleId || !name || !type) continue;
    summaries.push({
      styleId,
      name,
      type,
      basedOn: safeImportedStyleText(source.basedOn, 128),
      next: safeImportedStyleText(source.next, 128),
      link: safeImportedStyleText(source.link, 128),
    });
  }
  return summaries;
}

function readImportedStyleGraphMetadata(
  editor: Editor,
): ImportedStyleGraphMetadata {
  const definitions = normalizeStyleDefinitions(
    (editor.state.doc.attrs as { styleDefinitions?: unknown }).styleDefinitions,
  );
  return {
    sourceModelSha256: safeImportedStyleText(
      definitions?.sourceModelSha256,
      64,
    ),
    latentStylesPreserved:
      Boolean(definitions?.latentStyles) &&
      typeof definitions?.latentStyles === "object",
    sourcePartPreserved:
      Boolean(definitions?.rawParts) &&
      typeof definitions?.rawParts === "object",
  };
}

function importedStyleSummarySignature(style: ImportedStyleSummary): string {
  return JSON.stringify([
    style.styleId,
    style.name,
    style.type,
    style.basedOn,
    style.next,
    style.link,
  ]);
}

function authenticateImportedStyleSummary(
  editor: Editor,
  rendered: ImportedStyleSummary,
): ImportedStyleSummary | null {
  let live = readImportedStyleSummaries(editor).find(
    (style) => style.styleId === rendered.styleId,
  );
  if (!live) {
    const paletteDefinition = readPalette(editor).find(
      (style) =>
        isImportedNamedStyleDefinition(style) &&
        style.styleId === rendered.styleId,
    );
    if (paletteDefinition?.styleId) {
      live = {
        styleId: paletteDefinition.styleId,
        name: paletteDefinition.name,
        type: "paragraph",
        basedOn: null,
        next: null,
        link: paletteDefinition.linkedCharacterStyleId ?? null,
      };
    }
  }
  return live &&
    importedStyleSummarySignature(live) ===
      importedStyleSummarySignature(rendered)
    ? live
    : null;
}

interface DocumentStyleUsage {
  builtinIds: Set<DocumentBuiltinStyleId>;
  styleIds: Set<string>;
  legacyNames: Set<string>;
}

function readDocumentStyleUsage(editor: Editor): DocumentStyleUsage {
  const builtinIds = new Set<DocumentBuiltinStyleId>();
  const styleIds = new Set<string>();
  const legacyNames = new Set<string>();
  editor.state.doc.descendants((node) => {
    if (node.isText) {
      // A character style applied to text is in use exactly like a paragraph
      
      for (const mark of node.marks) {
        if (mark.type.name !== "characterStyle") continue;
        const styleId = normalizeDocxStyleId(mark.attrs.styleId);
        if (styleId) styleIds.add(styleId);
      }
      return false;
    }
    if (!node.isTextblock) return true;
    const docxStyleId = normalizeDocxStyleId(node.attrs.docxStyleId);
    const customStyleId = normalizeDocxStyleId(node.attrs.customStyleId);
    const customStyleName =
      typeof node.attrs.customStyleName === "string"
        ? node.attrs.customStyleName.trim()
        : "";
    if (docxStyleId) styleIds.add(docxStyleId);
    if (customStyleId) styleIds.add(customStyleId);
    if (customStyleName) legacyNames.add(customStyleName);
    if (node.type.name === "heading") {
      const level = Number(node.attrs.level);
      if (level === 1) builtinIds.add("heading1");
      else if (level === 2) builtinIds.add("heading2");
      return true;
    }
    if (node.type.name === "blockquote") {
      builtinIds.add("quote");
      return true;
    }
    if (!docxStyleId && !customStyleId && !customStyleName) {
      builtinIds.add("normal");
    }
    return true;
  });
  return { builtinIds, styleIds, legacyNames };
}

function readActiveBuiltinStyleId(
  editor: Editor,
): DocumentBuiltinStyleId | null {
  if (readAssignedStyleId(editor)) return null;
  const runtime = editor as Editor & {
    isActive?: (name: string, attrs?: Record<string, unknown>) => boolean;
  };
  if (runtime.isActive?.("heading", { level: 1 })) return "heading1";
  if (runtime.isActive?.("heading", { level: 2 })) return "heading2";
  if (runtime.isActive?.("blockquote")) return "quote";
  if (runtime.isActive?.("paragraph")) return "normal";
  return null;
}

/** Exact ordered fingerprint of every named-style field this editor supports. */
function styleDefinitionSignature(style: NamedStyleDefinition): string {
  return JSON.stringify([
    style.name,
    style.styleId,
    style.fontFamily,
    style.fontSize,
    style.textColor,
    style.bold,
    style.italic,
    style.underline,
    style.linkedCharacterStyleId,
    style.textAlign,
    style.spaceBeforePt,
    style.spaceAfterPt,
    style.lineHeight,
    style.indentLeftPt,
    style.indentRightPt,
    style.firstLineIndentPt,
    style.styleType,
    style.basedOn,
    style.nextStyleId,
    style.quickStyle,
    style.autoUpdate,
  ]);
}

/** Order-sensitive palette signature so every supported field refreshes the UI. */
function paletteSignature(palette: NamedStyleDefinition[]): string {
  return JSON.stringify(palette.map(styleDefinitionSignature));
}

interface SelectionStyleFormatting {
  fontFamily: string;
  fontSize: string;
  textColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export function directFormattingFromMarks(
  marks: readonly { type: { name: string }; attrs: Record<string, unknown> }[],
): SelectionStyleFormatting {
  const attr = (name: string, key: string): unknown =>
    marks.find((mark) => mark.type.name === name)?.attrs[key];
  const rawFontSize = attr("fontSize", "size");
  const fontSize =
    typeof rawFontSize === "string" && /^\d+(?:\.\d+)?px$/i.test(rawFontSize)
      ? rawFontSize.replace(/px$/i, "")
      : "";
  const rawTextColor = attr("textColor", "color");
  const textColor =
    typeof rawTextColor === "string" && /^#[0-9a-f]{6}$/i.test(rawTextColor)
      ? rawTextColor
      : "";
  // Bold and italic carry Word's three states: an explicit off is a mark
  
  const on = (name: string): boolean =>
    marks.some((mark) => mark.type.name === name && mark.attrs.value !== false && mark.attrs.value !== null);
  const rawFontFamily = attr("fontFamily", "family");
  return {
    fontFamily: typeof rawFontFamily === "string" ? rawFontFamily : "",
    fontSize,
    textColor,
    bold: on("bold"),
    italic: on("italic"),
    underline: marks.some((mark) => mark.type.name === "underline"),
  };
}

/**
 * Read one consistent set of direct run formatting from the live selection.
 * Mixed selections fail closed instead of guessing which run should define the
 * style. At a caret, ProseMirror's stored/current marks are authoritative.
 */
function readSelectionStyleFormatting(
  editor: Editor,
): SelectionStyleFormatting | null {
  const { selection } = editor.state;
  if (selection.empty) {
    const marks = editor.state.storedMarks ?? selection.$from.marks();
    return directFormattingFromMarks(marks);
  }
  let formatting: SelectionStyleFormatting | null = null;
  let mixed = false;
  editor.state.doc.nodesBetween(selection.from, selection.to, (node) => {
    if (!node.isText || mixed) return;
    const next = directFormattingFromMarks(node.marks);
    if (formatting === null) formatting = next;
    else if (JSON.stringify(formatting) !== JSON.stringify(next)) mixed = true;
  });
  return mixed ? null : formatting;
}

/**
 * Re-resolve a rendered row against the live ProseMirror document. The stable
 * id identifies the target; the complete fingerprint prevents an old React
 * closure from acting after that definition changed in-place.
 */
function authenticateLiveDefinition(
  editor: Editor,
  rendered: NamedStyleDefinition,
): {
  palette: NamedStyleDefinition[];
  definition: NamedStyleDefinition;
} | null {
  if (!rendered.styleId) return null;
  const livePalette = readPalette(editor);
  const liveDefinition = livePalette.find(
    (style) => style.styleId === rendered.styleId,
  );
  if (
    !liveDefinition ||
    styleDefinitionSignature(liveDefinition) !==
      styleDefinitionSignature(rendered)
  ) {
    return null;
  }
  return { palette: livePalette, definition: liveDefinition };
}

export interface StyleDraft {
  readonly mode: "create" | "modify";
  /** Immutable rendered definition used to re-authenticate an existing style. */
  sourceDefinition: NamedStyleDefinition | null;
  /** Stable identity retained when the human name changes. */
  styleId: string | null;
  /** The Create New Style / Modify Style dialog's fields. */
  value: StyleDialogValue;
}

const EMPTY_STYLE_VALUE: StyleDialogValue = {
  name: "",
  styleType: "paragraph",
  basedOn: "Normal",
  nextStyleId: STYLE_DIALOG_NEXT_SELF,
  fontFamily: "",
  sizePt: "",
  textColor: "",
  bold: false,
  italic: false,
  underline: false,
  textAlign: "",
  lineHeight: "",
  spaceBeforePt: "",
  spaceAfterPt: "",
  indentLeftPt: "",
  indentRightPt: "",
  firstLineIndentPt: "",
  quickStyle: true,
  autoUpdate: false,
};

function numberText(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/** The dialog shows a style's EFFECTIVE formatting (Word's Modify Style). */
export function styleValueFromDefinition(
  palette: readonly NamedStyleDefinition[],
  definition: Partial<NamedStyleDefinition> & { name?: string },
): StyleDialogValue {
  const effective = definition.styleId
    ? resolveNamedStyle(palette, definition as NamedStyleDefinition)
    : resolveNamedStyle(palette, { name: "", ...definition });
  return {
    name: definition.name ?? "",
    styleType: definition.styleType ?? "paragraph",
    basedOn: definition.basedOn ?? "Normal",
    nextStyleId: definition.nextStyleId ?? STYLE_DIALOG_NEXT_SELF,
    fontFamily: effective.fontFamily ?? "",
    sizePt: effective.fontSize ? fontPixelsToPoints(effective.fontSize) : "",
    textColor: effective.textColor ?? "",
    bold: effective.bold === true,
    italic: effective.italic === true,
    underline: effective.underline === true,
    textAlign: effective.textAlign ?? "",
    lineHeight: effective.lineHeight ?? "",
    spaceBeforePt: numberText(effective.spaceBeforePt),
    spaceAfterPt: numberText(effective.spaceAfterPt),
    indentLeftPt: numberText(effective.indentLeftPt),
    indentRightPt: numberText(effective.indentRightPt),
    firstLineIndentPt: numberText(effective.firstLineIndentPt),
    quickStyle: definition.quickStyle !== false,
    autoUpdate: definition.autoUpdate === true,
  };
}

function draftFromDefinition(
  palette: readonly NamedStyleDefinition[],
  def: NamedStyleDefinition,
): StyleDraft {
  return {
    mode: "modify",
    sourceDefinition: { ...def },
    styleId: def.styleId ?? null,
    value: styleValueFromDefinition(palette, def),
  };
}

function finiteNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Build a clean definition from the dialog. A based-on style's effective
 * formatting is inherited, so only what differs from it is stored (Word keeps
 * a style's own formatting as its difference from its base); the result is
 * re-validated by `sanitizeNamedStyles` when it is persisted.
 */
export function definitionFromStyleValue(
  palette: readonly NamedStyleDefinition[],
  value: StyleDialogValue,
  styleId: string | null,
  source: NamedStyleDefinition | null,
): NamedStyleDefinition {
  const def: NamedStyleDefinition = { name: value.name.trim().slice(0, 64) };
  if (styleId) def.styleId = styleId;
  if (value.styleType !== "paragraph") def.styleType = value.styleType;
  if (value.basedOn !== "Normal") def.basedOn = value.basedOn;
  if (value.styleType !== "character" && value.nextStyleId !== STYLE_DIALOG_NEXT_SELF) {
    def.nextStyleId = value.nextStyleId;
  }
  if (!value.quickStyle) def.quickStyle = false;
  if (value.autoUpdate && value.styleType !== "character") def.autoUpdate = true;
  const own: Partial<NamedStyleDefinition> = {};
  if (value.fontFamily) own.fontFamily = value.fontFamily;
  const sourceEffective = source ? resolveNamedStyle(palette, source) : null;
  // A size box left as the dialog showed it keeps the style's own size: the
  // box rounds to Word's half-point grid, so a 13px (9.75pt) style renamed
  // or given a new colour was saved at 10pt. Only a size the writer typed or
  // picked goes through the grid.
  const sourceSize = sourceEffective?.fontSize;
  const px =
    sourceSize && value.sizePt === fontPixelsToPoints(sourceSize)
      ? sourceSize
      : fontPointsToPixels(value.sizePt);
  if (px) own.fontSize = px;
  if (/^#[0-9a-fA-F]{6}$/.test(value.textColor.trim())) {
    own.textColor = value.textColor.trim();
  }
  own.bold = value.bold;
  own.italic = value.italic;
  own.underline = value.underline;
  if (value.styleType !== "character") {
    if (value.textAlign) own.textAlign = value.textAlign;
    if (value.lineHeight) own.lineHeight = value.lineHeight;
    own.spaceBeforePt = finiteNumber(value.spaceBeforePt);
    own.spaceAfterPt = finiteNumber(value.spaceAfterPt);
    own.indentLeftPt = finiteNumber(value.indentLeftPt);
    own.indentRightPt = finiteNumber(value.indentRightPt);
    own.firstLineIndentPt = finiteNumber(value.firstLineIndentPt);
  }
  const parent =
    def.basedOn !== undefined
      ? palette.find((style) => style.styleId === def.basedOn)
      : undefined;
  const inherited = parent ? resolveNamedStyle(palette, parent) : null;
  for (const field of NAMED_STYLE_FORMAT_FIELDS) {
    const mine = own[field as keyof typeof own];
    if (mine === undefined) continue;
    if (inherited && inherited[field] === mine) continue;
    // A toggle left off stays unstated, unless the writer turned it off on a
    // style that had it on through its base: only then does the style need to
    // say "off" (Word's w:b w:val="0"; live Word audit WUA 183). A box the
    // dialog merely shows unticked (a base picked after it was drawn) is not
    // a decision.
    if (mine === false && !(inherited?.[field] === true && sourceEffective?.[field] === true)) continue;
    (def as unknown as Record<string, unknown>)[field] = mine;
  }
  // Linked character style (Word `<w:link>`) — kept from the source; the
  // dialog does not author it.
  const linked = normalizeCharacterStyle(source?.linkedCharacterStyleId);
  if (linked) def.linkedCharacterStyleId = linked;
  return def;
}

/**
 * OK of the Styles pane's New Style / Modify Style dialog: the palette takes
 * the dialog's style (a modify re-authenticates the style it edits; Modify
 * restyles every paragraph in that style). The pane and the AI's style
 * commands both save through this. Returns false when refused.
 */
export function saveNamedStyleDraft(
  editor: Editor,
  draft: Pick<StyleDraft, "mode" | "sourceDefinition" | "styleId">,
  value: StyleDialogValue,
): boolean {
  if (!canMutateStyles(editor)) return false;
  let livePalette: NamedStyleDefinition[];
  let authenticatedDefinition: NamedStyleDefinition | null = null;
  // A modify re-authenticates the style it edits. A new style's source
  // (Create a Style seeds one from the selection) only carries the
  // formatting to write, never an identity to overwrite.
  if (draft.mode === "modify") {
    const editedSource = draft.sourceDefinition;
    if (
      !editedSource ||
      !draft.styleId ||
      draft.styleId !== editedSource.styleId
    ) {
      return false;
    }
    const authenticated = authenticateLiveDefinition(editor, editedSource);
    if (!authenticated) return false;
    if (isImportedNamedStyleDefinition(authenticated.definition)) return false;
    livePalette = authenticated.palette;
    authenticatedDefinition = authenticated.definition;
  } else {
    // A new style has no pre-existing authority to overwrite.
    if (draft.styleId) return false;
    livePalette = readPalette(editor);
  }
  const definition = definitionFromStyleValue(
    livePalette,
    value,
    draft.styleId,
    draft.sourceDefinition,
  );
  if (!definition.name) return false; // a name that trims to empty is rejected
  if (
    livePalette.some(
      (style) =>
        style.name === definition.name &&
        style.styleId !== definition.styleId,
    )
  ) {
    return false;
  }
  const previousName = authenticatedDefinition?.name ?? null;
  // "Style based on" must not close a cycle through this style: Word
  // refuses the choice; the palette repair used to break the cycle at
  
  if (definition.basedOn && definition.styleId) {
    const byId = new Map(livePalette.map((style) => [style.styleId, style]));
    const seen = new Set<string>();
    let cursor: string | undefined = definition.basedOn;
    while (cursor && !seen.has(cursor)) {
      if (cursor === definition.styleId) return false;
      seen.add(cursor);
      cursor = byId.get(cursor)?.basedOn;
    }
  }
  const next = upsertNamedStyle(livePalette, definition);
  // The palette holds at most MAX_NAMED_STYLES definitions; a new style
  // past the cap is dropped by the sanitizer, so the save must not report
  
  if (!next.some((style) => style.name === definition.name)) return false;
  const styleId =
    definition.styleId ??
    next.find((style) => style.name === definition.name)?.styleId ??
    null;
  const renamed =
    previousName && previousName !== definition.name && styleId
      ? { styleId, previousName }
      : null;
  let pending = styleChain(editor);
  if (renamed) {
    pending = pending.renameCustomParagraphStyleReferences(
      renamed.styleId,
      renamed.previousName,
      definition.name,
    );
  }
  // Word's Modify Style: every paragraph in the modified style (or a
  // style based on it) takes the new formatting; formatting a paragraph
  // carries on top of its style stays.
  if (draft.mode === "modify") {
    pending = pending.command(({ tr }) => {
      restyleNamedStyleParagraphs(tr, livePalette, next);
      return true;
    });
  }
  return pending.setNamedStyles(next).run();
}

/** The Modify Style dialog's starting point for a style of the palette, by
 *  name; null for an unknown or imported (Word-owned) style. */
export function namedStyleModifyDraft(
  editor: Editor,
  name: string,
): StyleDraft | null {
  const palette = readPalette(editor);
  const definition = palette.find((style) => style.name === name);
  if (!definition || isImportedNamedStyleDefinition(definition)) return null;
  return draftFromDefinition(palette, definition);
}

/** The New Style dialog seeded with formatting (Create a Style). */
export function namedStyleCreateDraft(
  editor: Editor,
  seed: Omit<NamedStyleDefinition, "name">,
): StyleDraft {
  return {
    mode: "create",
    sourceDefinition: { name: "", ...seed },
    styleId: null,
    value: {
      ...styleValueFromDefinition(readPalette(editor), { name: "", ...seed }),
      name: "",
    },
  };
}

/**
 * Styles pane (Word/WPS "Styles" / 样式 parity). Lists the 16 recommended
 * paragraph and character styles from the Home gallery plus the document's
 * user-defined named styles. Every built-in entry executes the same production
 * command path as the Ribbon; custom styles can be created, modified and deleted
 * through the inline editor below the gallery.
 *
 * Apply paths reuse the SAME primitives as the toolbar:
 *  - a built-in style runs {@link applyDocumentBuiltinStyle}, preserving heading
 *    structure for navigation/TOC while applying character styles only to runs;
 *  - a custom style normalizes the block to a plain paragraph, applies the
 *    style's marks ({@link namedStyleApplyOps}), and tags the paragraph with the
 *    stable style id + editable name via `setCustomParagraphStyle` so the
 *    assignment round-trips in the doc JSON and remains attached after a
 *    gallery reorder or rename.
 *
 * The palette is the single source of truth (carried on the doc node's
 * `namedStyles` attr); the panel re-reads it on every editor `update` and never
 * keeps a denormalized copy. All persistence goes through `setNamedStyles`, whose
 * extension re-sanitizes the whole list, so a forged/oversized name can never
 * reach the stored palette. Style names render as TEXT (React children), never
 * HTML.
 */
export default function StylesPanel({
  editor,
  onClose,
  createRequest = null,
}: StylesPanelProps) {
  const locale = useLocale();

  const [palette, setPalette] = useState<NamedStyleDefinition[]>(() =>
    readPalette(editor),
  );
  const [activeStyleId, setActiveStyleId] = useState<string | null>(() =>
    readAssignedStyleId(editor),
  );
  const [activeImportedStyle, setActiveImportedStyle] =
    useState<ImportedParagraphStyleIdentity | null>(() =>
      readActiveImportedParagraphStyle(editor, readPalette(editor)),
    );
  const [draft, setDraft] = useState<StyleDraft | null>(null);
  // The control that opened the name/modify form (New, Rename, Modify): an
  // Escape there cancels the form, not the pane, and hands the keyboard back
  // to it, as Escape in a Word dialog returns to what opened it.
  const draftOpen = draft !== null;
  const draftOpenerRef = useRef<HTMLElement | null>(null);
  // Modify Style on a paragraph style the Word file brought: its Font group.
  const [importedDraft, setImportedDraft] = useState<{ styleId: string; value: StyleDialogValue } | null>(null);
  const importedOpenerRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!draftOpen) return;
    const active = document.activeElement;
    draftOpenerRef.current =
      active instanceof HTMLElement &&
      !active.closest('[data-testid="styles-dialog"]')
        ? active
        : null;
  }, [draftOpen]);
  // "Create a Style" from the Home gallery: open the New style form seeded
  // with the selection's formatting (hidden aspects such as alignment and
  // spacing ride on the draft's source and are written with the style).
  const createNonce = createRequest?.nonce ?? null;
  useEffect(() => {
    if (createNonce === null || !createRequest) return;
    setDraft(namedStyleCreateDraft(editor, createRequest.seed));
    // The request object is keyed by its nonce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createNonce]);
  const t = useTranslations("console-notebooks");
  const L = useMemo(() => stylesPanelLabels(t), [t]);
  const [prefs, setPrefs] = useState<StylesPanePrefs>(() =>
    typeof window === "undefined" ? DEFAULT_PREFS : readStylesPanePrefs(),
  );
  const updatePrefs = useCallback((patch: Partial<StylesPanePrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      writeStylesPanePrefs(next);
      return next;
    });
  }, []);
  const view = prefs.view;
  const setView = useCallback(
    (next: StylesPanelView) => updatePrefs({ view: next }),
    [updatePrefs],
  );
  const [optionsDraft, setOptionsDraft] = useState<{
    view: StylesPanelView;
    sort: StylesPanelSort;
  } | null>(null);
  const optionsOpenerRef = useRef<HTMLButtonElement | null>(null);
  const [search, setSearch] = useState("");
  const [documentVersion, setDocumentVersion] = useState(0);
  const [canEdit, setCanEdit] = useState(() => canMutateStyles(editor));

  // Live-update from the document: re-derive the palette on every editor change
  // and UNSUBSCRIBE on unmount (this product has a documented history of
  // listener leaks / setState-after-unmount — the off() in cleanup prevents it).
  useEffect(() => {
    const runtime = editor as RuntimeEditor;
    const refresh = () => {
      const next = readPalette(editor);
      setPalette((prev) =>
        paletteSignature(prev) === paletteSignature(next) ? prev : next,
      );
      setActiveStyleId(readAssignedStyleId(editor));
      setCanEdit(canMutateStyles(editor));
      const imported = readActiveImportedParagraphStyle(editor, next);
      setActiveImportedStyle((previous) =>
        importedStyleIdentitySignature(previous) ===
        importedStyleIdentitySignature(imported)
          ? previous
          : imported,
      );
      setDocumentVersion((version) => version + 1);
    };
    refresh();
    if (typeof runtime.on !== "function" || typeof runtime.off !== "function") {
      return;
    }
    runtime.on("update", refresh);
    runtime.on("selectionUpdate", refresh);
    runtime.on("destroy", refresh);
    return () => {
      runtime.off?.("update", refresh);
      runtime.off?.("selectionUpdate", refresh);
      runtime.off?.("destroy", refresh);
    };
  }, [editor]);

  const presetEntries = useMemo(
    () =>
      DOCUMENT_BUILTIN_STYLE_GALLERY.map((style) => ({
        style,
        label: t(style.labelKey as "toolbar.heading3"),
      })),
    [t],
  );

  const usage = useMemo(() => {
    void documentVersion;
    return readDocumentStyleUsage(editor);
  }, [documentVersion, editor]);
  const activeBuiltinStyleId = useMemo(() => {
    void documentVersion;
    return readActiveBuiltinStyleId(editor);
  }, [documentVersion, editor]);
  const importedDefinitions = useMemo(() => {
    void documentVersion;
    const summaries = readImportedStyleSummaries(editor);
    const byId = new Map(summaries.map((style) => [style.styleId, style]));
    for (const definition of palette) {
      if (!isImportedNamedStyleDefinition(definition)) continue;
      if (byId.has(definition.styleId)) continue;
      byId.set(definition.styleId, {
        styleId: definition.styleId,
        name: definition.name,
        type: "paragraph",
        basedOn: null,
        next: null,
        link: definition.linkedCharacterStyleId ?? null,
      });
    }
    return [...byId.values()];
  }, [documentVersion, editor, palette]);
  const importedGraphMetadata = useMemo(() => {
    void documentVersion;
    return readImportedStyleGraphMetadata(editor);
  }, [documentVersion, editor]);
  const selectionStyleFormatting = useMemo(() => {
    void documentVersion;
    return readSelectionStyleFormatting(editor);
  }, [documentVersion, editor]);
  const localPalette = useMemo(
    () => palette.filter((style) => !isImportedNamedStyleDefinition(style)),
    [palette],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const matchesSearch = useCallback(
    (...values: Array<string | null | undefined>) =>
      !normalizedSearch ||
      values.some((value) =>
        value?.toLocaleLowerCase().includes(normalizedSearch),
      ),
    [normalizedSearch],
  );
  const sort = prefs.sort;
  const filteredPresets = presetEntries.filter(({ style, label }) => {
    if (view === "document" && !usage.builtinIds.has(style.id)) return false;
    return matchesSearch(label, style.id);
  });
  const visiblePresets =
    sort === "alphabetical"
      ? sortByName(filteredPresets, (entry) => entry.label, locale)
      : sort === "type"
        ? [
            ...filteredPresets.filter((entry) => entry.style.kind === "paragraph"),
            ...filteredPresets.filter((entry) => entry.style.kind !== "paragraph"),
          ]
        : filteredPresets;
  const filteredImported = importedDefinitions.filter((style) => {
    if (view === "recommended") return false;
    if (view === "document" && !usage.styleIds.has(style.styleId)) {
      return false;
    }
    return matchesSearch(
      style.name,
      style.styleId,
      style.basedOn,
      style.next,
      style.link,
    );
  });
  const visibleImported =
    sort === "alphabetical"
      ? sortByName(filteredImported, (style) => style.name, locale)
      : sort === "type"
        ? [...filteredImported].sort((left, right) =>
            left.type === right.type
              ? 0
              : left.type === "paragraph"
                ? -1
                : right.type === "paragraph"
                  ? 1
                  : left.type.localeCompare(right.type),
          )
        : filteredImported;
  const filteredLocal = localPalette.filter((style) => {
    if (
      view === "document" &&
      !usage.styleIds.has(style.styleId ?? "") &&
      !usage.legacyNames.has(style.name)
    ) {
      return false;
    }
    return matchesSearch(style.name, style.styleId);
  });
  const visibleLocal =
    sort === "alphabetical"
      ? sortByName(filteredLocal, (style) => style.name, locale)
      : filteredLocal;
  const noVisibleStyles =
    visiblePresets.length === 0 &&
    visibleImported.length === 0 &&
    visibleLocal.length === 0;
  const currentStyleName =
    localPalette.find((style) => style.styleId === activeStyleId)?.name ??
    importedDefinitions.find((style) => style.styleId === activeStyleId)
      ?.name ??
    activeImportedStyle?.name ??
    presetEntries.find((entry) => entry.style.id === activeBuiltinStyleId)
      ?.label ??
    null;

  const applyPreset = useCallback(
    (id: DocumentBuiltinStyleId) => {
      if (!canMutateStyles(editor)) return;
      applyDocumentBuiltinStyle(
        { editor, chain: () => styleChain(editor) },
        id,
      );
    },
    [editor],
  );

  const applyImported = useCallback(
    (rendered: ImportedStyleSummary) => {
      if (!canMutateStyles(editor)) return;
      const authenticated = authenticateImportedStyleSummary(editor, rendered);
      if (!authenticated || authenticated.type !== "paragraph") return;
      styleChain(editor).setDocxParagraphStyle(authenticated.styleId).run();
    },
    [editor],
  );

  const showPreview = prefs.showPreview;
  const disableLinkedStyles = prefs.disableLinkedStyles;
  const applyCustom = useCallback(
    (renderedDefinition: NamedStyleDefinition) => {
      if (!canMutateStyles(editor)) return;
      const authenticated = authenticateLiveDefinition(
        editor,
        renderedDefinition,
      );
      if (!authenticated) return;
      const { definition: stored, palette: livePalette } = authenticated;
      // Imported/native pStyle formatting is inherited. Assign only the exact
      // identity so direct run and paragraph overrides remain user-owned.
      if (isImportedNamedStyleDefinition(stored)) {
        styleChain(editor).setDocxParagraphStyle(stored.styleId).run();
        return;
      }
      // Word's "Style based on": the style paints its effective formatting.
      const definition = resolveNamedStyle(livePalette, stored);
      // A character style formats only the selected runs; so does a linked
      // style applied to part of one paragraph (Word).
      const { selection } = editor.state;
      // Word's "Disable Linked Styles": a linked style applies its paragraph
      // half to the whole paragraph even from a partial selection (the
      // switch was only consulted on the paragraph path, so the common
      
      const partialRun =
        stored.styleType === "linked" &&
        !disableLinkedStyles &&
        !selection.empty &&
        selection.$from.sameParent(selection.$to) &&
        !(
          selection.$from.parentOffset === 0 &&
          selection.$to.parentOffset === selection.$from.parent.content.size
        );
      if (stored.styleType === "character" || partialRun) {
        const chain = styleChain(editor);
        const ops = namedStyleApplyOps(definition);
        for (const op of ops) {
          if (op.kind === "fontFamily") chain.setFontFamily(op.family);
          else if (op.kind === "fontSize") chain.setFontSize(op.size);
          else if (op.kind === "textColor") chain.setTextColor(op.color);
          else if (op.kind === "mark") chain.setMark(op.mark);
          else if (op.kind === "characterStyle") chain.setCharacterStyle(op.name);
        }
        // The runs also keep WHICH style they wear (Word's w:rStyle), so
        // Modify Style can update them later; a gallery character style the
        // definition links to already names itself.
        if (
          definition.styleId &&
          !ops.some((op) => op.kind === "characterStyle")
        ) {
          chain.setMark("characterStyle", {
            name: null,
            styleId: definition.styleId,
          });
        }
        chain.run();
        return;
      }
      // A named style is a plain paragraph carrying the style's marks. Normalize
      // the block first, then apply each defined mark, then TAG the paragraph
      // with the style name so the assignment round-trips and exports as a real
      // `<w:pStyle>`.
      setSelectedTextBlockTypePreservingAttrs(editor, "paragraph");
      // A paragraph style formats the WHOLE paragraphs it is applied to
      // (Word): with only a caret, or part of a line, selected, every run of
      // the paragraph that wears the paragraph's previous style's formatting
      // takes this style's font, size, colour and emphasis, while a run's own
      // different formatting stays. The selection itself is then formatted
      // (and a caret's typing marks set) as before.
      const selected = editor.state.selection;
      const chain = styleChain(editor).command(({ tr }) => {
        applyNamedStyleToParagraphRuns(
          tr,
          selected.from,
          selected.to,
          livePalette,
          definition,
        );
        return true;
      });
      // A caret in a paragraph with text: the runs are done above, and the
      // mark commands below would reach the word around the caret (their
      // empty-selection range) and wipe its own formatting. An empty
      // paragraph still takes the style as the marks for what is typed.
      const runMarks = !(
        selected.empty && selected.$from.parent.content.size > 0
      );
      chain.unsetBlockquote();
      if (runMarks) {
        chain
          .unsetCharacterStyle()
          .unsetFontFamily()
          .unsetFontSize()
          .unsetTextColor();
      }
      chain
        .unsetTextAlign()
        .unsetLineHeight()
        .setSpaceBefore(null)
        .setSpaceAfter(null)
        .setParagraphIndents({
          indentLeftPt: null,
          indentRightPt: null,
          firstLineIndentPt: null,
        });
      for (const op of runMarks ? namedStyleApplyOps(definition) : []) {
        switch (op.kind) {
          case "fontFamily":
            chain.setFontFamily(op.family);
            break;
          case "fontSize":
            chain.setFontSize(op.size);
            break;
          case "textColor":
            chain.setTextColor(op.color);
            break;
          case "mark":
            chain.setMark(op.mark);
            break;
          case "characterStyle":
            // A linked character style (Word <w:link>) paints its companion run
            // formatting alongside the paragraph style. Word's "Disable Linked
            // Styles" applies the paragraph half only.
            if (!disableLinkedStyles) chain.setCharacterStyle(op.name);
            break;
        }
      }
      if (definition.textAlign) chain.setTextAlign(definition.textAlign);
      if (definition.spaceBeforePt !== undefined) {
        chain.setSpaceBefore(definition.spaceBeforePt);
      }
      if (definition.spaceAfterPt !== undefined) {
        chain.setSpaceAfter(definition.spaceAfterPt);
      }
      if (definition.lineHeight) chain.setLineHeight(definition.lineHeight);
      const assigned = chain.setParagraphIndents({
        indentLeftPt: definition.indentLeftPt ?? null,
        indentRightPt: definition.indentRightPt ?? null,
        firstLineIndentPt: definition.firstLineIndentPt ?? null,
      });
      assigned
        .setCustomParagraphStyle(definition.name, definition.styleId)
        .run();
    },
    [disableLinkedStyles, editor],
  );

  // Word's "Clear All" (top of the pane's list): the selection returns to
  // Normal with its direct formatting cleared, as the gallery's Clear
  // Formatting does.
  const clearAll = useCallback(() => {
    if (!canMutateStyles(editor)) return;
    clearDocumentStyleFormatting({ editor, chain: () => styleChain(editor) });
  }, [editor]);

  const persistPalette = useCallback(
    (
      next: NamedStyleDefinition[],
      updateReferences?: (chain: StyleChain) => StyleChain,
    ) => {
      if (!canMutateStyles(editor)) return false;
      const pending = updateReferences
        ? updateReferences(styleChain(editor))
        : styleChain(editor);
      if (!pending.setNamedStyles(next).run()) return false;
      // Reflect immediately; the update listener will reconcile too.
      setPalette(readPalette(editor));
      return true;
    },
    [editor],
  );

  const handleSaveDraft = useCallback(
    (value: StyleDialogValue): boolean => {
      if (!draft) return false;
      if (!saveNamedStyleDraft(editor, draft, value)) return false;
      // Reflect immediately; the update listener will reconcile too.
      setPalette(readPalette(editor));
      setDraft(null);
      return true;
    },
    [draft, editor],
  );

  // Word's Modify Style (the Rename and Modify actions both open it).
  const handleModify = useCallback(
    (renderedDefinition: NamedStyleDefinition) => {
      if (!canMutateStyles(editor)) return;
      const authenticated = authenticateLiveDefinition(
        editor,
        renderedDefinition,
      );
      if (!authenticated) return;
      if (isImportedNamedStyleDefinition(authenticated.definition)) return;
      setDraft(draftFromDefinition(authenticated.palette, authenticated.definition));
    },
    [editor],
  );
  const openStyleDraft = handleModify;

  const handleDelete = useCallback(
    (renderedDefinition: NamedStyleDefinition) => {
      if (!canMutateStyles(editor)) return;
      const authenticated = authenticateLiveDefinition(
        editor,
        renderedDefinition,
      );
      if (!authenticated) return;
      const { definition, palette: livePalette } = authenticated;
      if (isImportedNamedStyleDefinition(definition)) return;
      const liveUsage = readDocumentStyleUsage(editor);
      if (
        liveUsage.styleIds.has(definition.styleId ?? "") ||
        liveUsage.legacyNames.has(definition.name)
      ) {
        return;
      }
      const deletedStyleId = definition.styleId;
      
      // removeNamedStyleWithDependents folds its fields into them).
      persistPalette(
        removeNamedStyleWithDependents(livePalette, definition.name),
        deletedStyleId
          ? (chain) =>
              chain.clearCustomParagraphStyleReferences(
                deletedStyleId,
                definition.name,
              )
          : undefined,
      );
      setDraft((current) =>
        current?.styleId === deletedStyleId ? null : current,
      );
    },
    [editor, persistPalette],
  );

  // Word's Styles pane (Home > Styles launcher, "Customize or create new
  // styles", Microsoft Support) in the shared Office task pane frame.
  return (
    <OfficeTaskPane
      title={L.title}
      closeLabel={L.close}
      onClose={onClose}
      testIdPrefix="styles"
      testId="styles-panel"
      dockRight={false}
      className={`${styles.panel} ai-panel styles-panel`}
    >

      <div className={styles.controls}>
        <label className={styles.searchField}>
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={search}
            placeholder={L.search}
            aria-label={L.search}
            data-testid="styles-search"
            autoFocus
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className={styles.tabs} role="tablist" aria-label={L.title}>
          {(
            [
              ["recommended", L.recommended],
              ["document", L.inDocument],
              ["all", L.all],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={`${styles.tab}${view === id ? ` ${styles.tabActive}` : ""}`}
              data-testid={`styles-view-${id}`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {currentStyleName ? (
        <div className={styles.currentStyle} data-testid="styles-current">
          <Check size={14} aria-hidden="true" />
          <span>{L.current}</span>
          <strong>{currentStyleName}</strong>
        </div>
      ) : null}

      <div className="styles-panel-body" data-testid="styles-panel-body">
        <button
          type="button"
          className="styles-panel-apply styles-panel-clear-all"
          data-testid="styles-clear-all"
          disabled={!canEdit}
          onClick={clearAll}
          title={t("stylesPane.clearAllHint")}
        >
          <DocumentDialogIcon icon="format.clear" />
          {t("stylesPane.clearAll")}
        </button>
        {noVisibleStyles ? (
          <p className="styles-panel-empty" data-testid="styles-no-results">
            {L.noResults}
          </p>
        ) : null}

        {visiblePresets.length > 0 ? (
          <section className="styles-panel-section">
            <h4 className="styles-panel-section-title">{L.builtIn}</h4>
            <ul
              className="styles-panel-list"
              data-testid="styles-panel-presets"
            >
              {visiblePresets.map(({ style, label }) => {
                const current = style.id === activeBuiltinStyleId;
                return (
                  <li key={style.id} className="styles-panel-item">
                    <button
                      type="button"
                      className={`styles-panel-apply styles-panel-apply--${style.id}${
                        current ? " is-active" : ""
                      }`}
                      data-testid={`styles-preset-${style.id}`}
                      data-preset={style.id}
                      data-style-kind={style.kind}
                      aria-current={current ? "true" : undefined}
                      disabled={!canEdit}
                      onClick={() => applyPreset(style.id)}
                      title={L.apply}
                    >
                      {showPreview ? (
                        // Show Preview: the style's own name drawn in the
                        // style's formatting, as Word's pane does.
                        <span
                          className="styles-panel-apply__sample"
                          data-testid={`styles-preview-${style.id}`}
                        >
                          {label}
                        </span>
                      ) : (
                        <span>{label}</span>
                      )}
                      {current ? (
                        <span className={styles.currentMarker}>
                          {L.current}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {activeImportedStyle ? (
          <div
            className={styles.importedCurrent}
            data-testid="styles-imported-current"
            data-style-id={activeImportedStyle.styleId}
            role="status"
            aria-label={`${L.imported}: ${activeImportedStyle.name}`}
          >
            <Check size={14} aria-hidden="true" />
            <span>{L.current}</span>
            <strong>{activeImportedStyle.name}</strong>
          </div>
        ) : null}

        {visibleImported.length > 0 ? (
          <section className="styles-panel-section">
            <h4 className="styles-panel-section-title">{L.imported}</h4>
            <div
              className={styles.sourceNotice}
              data-testid="styles-imported-source-metadata"
              data-source-model-sha256={
                importedGraphMetadata.sourceModelSha256 ?? undefined
              }
              data-latent-styles-preserved={
                importedGraphMetadata.latentStylesPreserved || undefined
              }
              data-source-part-preserved={
                importedGraphMetadata.sourcePartPreserved || undefined
              }
            >
              <LockKeyhole size={13} aria-hidden="true" />
              <span>{L.sourcePreserved}</span>
              {importedGraphMetadata.latentStylesPreserved ? (
                <code>latentStyles</code>
              ) : null}
            </div>
            <ul
              className="styles-panel-list"
              data-testid="styles-panel-imported"
            >
              {visibleImported.map((definition) => {
                const current = definition.styleId === activeStyleId;
                const paragraph = definition.type === "paragraph";
                return (
                  <li key={definition.styleId} className={styles.importedItem}>
                    <button
                      type="button"
                      className={`${styles.importedApply}${
                        current ? " is-active" : ""
                      }`}
                      data-testid="styles-imported-apply"
                      data-style-id={definition.styleId}
                      aria-current={current ? "true" : undefined}
                      disabled={!canEdit || !paragraph}
                      title={paragraph ? L.apply : L.readOnly}
                      onClick={() => applyImported(definition)}
                    >
                      <span>{definition.name}</span>
                      <small>{definition.styleId}</small>
                    </button>
                    {paragraph ? (
                      <button
                        type="button"
                        className="styles-panel-icon"
                        data-testid="styles-imported-modify"
                        data-style-id={definition.styleId}
                        disabled={!canEdit}
                        title={L.modify}
                        aria-label={`${L.modify}: ${definition.name}`}
                        onClick={(event) => {
                          const style = importedParagraphStyleById(editor, definition.styleId);
                          if (!style || !canMutateStyles(editor)) return;
                          importedOpenerRef.current = event.currentTarget;
                          setImportedDraft({
                            styleId: definition.styleId,
                            value: { ...EMPTY_STYLE_VALUE, name: definition.name, ...importedStyleFontGroup(style) },
                          });
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                    ) : (
                      <span className={styles.readOnlyBadge}>{L.readOnly}</span>
                    )}
                    <dl className={styles.importedMetadata}>
                      {definition.basedOn ? (
                        <div>
                          <dt>basedOn</dt>
                          <dd>{definition.basedOn}</dd>
                        </div>
                      ) : null}
                      {definition.next ? (
                        <div>
                          <dt>next</dt>
                          <dd>{definition.next}</dd>
                        </div>
                      ) : null}
                      {definition.link ? (
                        <div>
                          <dt>link</dt>
                          <dd>{definition.link}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="styles-panel-section">
          <div className="styles-panel-section-head">
            <h4 className="styles-panel-section-title">{L.custom}</h4>
            <button
              type="button"
              className="styles-panel-new"
              data-testid="styles-new"
              disabled={!canEdit}
              onClick={() => {
                if (!canMutateStyles(editor)) return;
                setDraft({
                  mode: "create",
                  sourceDefinition: null,
                  styleId: null,
                  value: { ...EMPTY_STYLE_VALUE },
                });
              }}
              title={L.newStyle}
              aria-label={L.newStyle}
            >
              <Plus size={14} />
            </button>
          </div>

          {localPalette.length === 0 ? (
            <p className="styles-panel-empty" data-testid="styles-empty">
              {L.noCustom}
            </p>
          ) : visibleLocal.length === 0 ? null : (
            <ul className="styles-panel-list" data-testid="styles-panel-custom">
              {visibleLocal.map((definition) => {
                const used =
                  usage.styleIds.has(definition.styleId ?? "") ||
                  usage.legacyNames.has(definition.name);
                const current = definition.styleId === activeStyleId;
                // The preview wears what applying the style gives (its
                // Based-on chain resolved), as the Modify dialog and the
                
                const preview = resolveNamedStyle(palette, definition);
                return (
                  <li
                    key={definition.styleId ?? definition.name}
                    className="styles-panel-item styles-panel-item--custom"
                  >
                    <button
                      type="button"
                      className={`styles-panel-apply${current ? " is-active" : ""}`}
                      data-testid="styles-custom-apply"
                      data-style-name={definition.name}
                      aria-pressed={current}
                      disabled={!canEdit}
                      onClick={() => applyCustom(definition)}
                      title={L.apply}
                      data-preview={showPreview ? "true" : undefined}
                      style={
                        showPreview
                          ? {
                              fontFamily: preview.fontFamily || undefined,
                              fontSize: preview.fontSize || undefined,
                              fontWeight: preview.bold ? 700 : undefined,
                              fontStyle: preview.italic
                                ? "italic"
                                : undefined,
                              textDecoration: preview.underline
                                ? "underline"
                                : undefined,
                              color: preview.textColor || undefined,
                            }
                          : undefined
                      }
                    >
                      {definition.name}
                      {current ? (
                        <span className={styles.currentMarker}>
                          {L.current}
                        </span>
                      ) : null}
                    </button>
                    <span className="styles-panel-item-actions">
                      <button
                        type="button"
                        className="styles-panel-icon"
                        data-testid="styles-custom-rename"
                        disabled={!canEdit}
                        onClick={() => openStyleDraft(definition)}
                        title={L.rename}
                        aria-label={L.rename}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="styles-panel-icon"
                        data-testid="styles-custom-modify"
                        disabled={!canEdit}
                        onClick={() => handleModify(definition)}
                        title={L.modify}
                        aria-label={L.modify}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="styles-panel-icon"
                        data-testid="styles-custom-delete"
                        disabled={!canEdit || used}
                        onClick={() => handleDelete(definition)}
                        title={used ? L.usedDeleteUnavailable : L.delete}
                        aria-label={`${L.delete}${
                          used ? `: ${L.usedDeleteUnavailable}` : ""
                        }`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {importedDraft ? (
          <DocumentStyleDialog
            mode="modify"
            initial={importedDraft.value}
            options={[]}
            selfStyleId={importedDraft.styleId}
            builtIn
            fontGroupOnly
            canEdit={canEdit}
            returnFocusTarget={() => importedOpenerRef.current}
            onSave={(value) => {
              if (!canMutateStyles(editor)) return false;
              const initial = importedDraft.value;
              const size = Number.parseFloat(value.sizePt);
              const change: ImportedStyleFontChange = {
                ...(value.fontFamily !== initial.fontFamily ? { fontFamily: value.fontFamily || null } : {}),
                ...(value.sizePt !== initial.sizePt ? { sizePt: Number.isFinite(size) && size > 0 ? size : null } : {}),
                ...(value.textColor !== initial.textColor ? { color: value.textColor || null } : {}),
                ...(value.bold !== initial.bold ? { bold: value.bold } : {}),
                ...(value.italic !== initial.italic ? { italic: value.italic } : {}),
                ...(value.underline !== initial.underline ? { underline: value.underline } : {}),
              };
              if (Object.keys(change).length) modifyImportedParagraphStyle(editor, importedDraft.styleId, change);
              const opener = importedOpenerRef.current;
              flushSync(() => setImportedDraft(null));
              if (opener?.isConnected) opener.focus();
              return true;
            }}
            onCancel={() => {
              const opener = importedOpenerRef.current;
              flushSync(() => setImportedDraft(null));
              if (opener?.isConnected) opener.focus();
            }}
          />
        ) : null}

        {draft ? (
          <DocumentStyleDialog
            mode={draft.mode}
            initial={draft.value}
            options={palette
              .filter((style) => !isImportedNamedStyleDefinition(style))
              .map((style) => ({
                styleId: style.styleId ?? style.name,
                name: style.name,
                styleType: style.styleType ?? "paragraph",
                ...(style.basedOn ? { basedOn: style.basedOn } : {}),
              }))}
            selfStyleId={draft.styleId}
            canEdit={canEdit}
            selectionAvailable={selectionStyleFormatting !== null}
            returnFocusTarget={() => draftOpenerRef.current}
            onReadSelection={() => {
              if (!canMutateStyles(editor)) return null;
              const formatting = readSelectionStyleFormatting(editor);
              if (!formatting) return null;
              return {
                fontFamily: formatting.fontFamily,
                sizePt: formatting.fontSize
                  ? fontPixelsToPoints(`${formatting.fontSize}px`)
                  : "",
                textColor: formatting.textColor,
                bold: formatting.bold,
                italic: formatting.italic,
                underline: formatting.underline,
              };
            }}
            onSave={handleSaveDraft}
            onCancel={() => {
              const opener = draftOpenerRef.current;
              // Close first: the open dialog traps focus, so the keyboard
              // can only go back to its opener once it is gone.
              flushSync(() => setDraft(null));
              if (opener?.isConnected) opener.focus();
            }}
          />
        ) : null}
      </div>

      <footer className="styles-panel-footer" data-testid="styles-panel-footer">
        <label className="styles-panel-footer-check">
          <input
            type="checkbox"
            data-testid="styles-show-preview"
            checked={showPreview}
            onChange={(event) =>
              updatePrefs({ showPreview: event.target.checked })
            }
          />
          <span>{t("stylesPane.showPreview")}</span>
        </label>
        <label className="styles-panel-footer-check">
          <input
            type="checkbox"
            data-testid="styles-disable-linked"
            checked={disableLinkedStyles}
            onChange={(event) =>
              updatePrefs({ disableLinkedStyles: event.target.checked })
            }
          />
          <span>{t("stylesPane.disableLinkedStyles")}</span>
        </label>
        <button
          ref={optionsOpenerRef}
          type="button"
          className="styles-panel-options-open"
          data-testid="styles-options-open"
          onClick={() => setOptionsDraft({ view, sort })}
        >
          {t("stylesPane.options")}
        </button>
        <button
          type="button"
          className="styles-panel-options-open"
          data-testid="styles-reveal-formatting"
          onClick={() =>
            editorViewDom(editor)?.dispatchEvent(new CustomEvent(DOCUMENT_REVEAL_FORMATTING_EVENT, { bubbles: false }))
          }
        >
          {t("revealFormatting.title")}
        </button>
      </footer>

      {optionsDraft ? (
        <OfficeDialogShell
          open
          testIdPrefix="styles-options"
          title={t("stylesPane.optionsTitle")}
          description=""
          defaultActionLabel={t("toolbar.dialogOk")}
          defaultActionTestId="styles-options-ok"
          cancelActionLabel={t("toolbar.pageSetupCancel")}
          cancelActionTestId="styles-options-cancel"
          returnFocusRef={optionsOpenerRef}
          onDefaultAction={() => {
            updatePrefs({ view: optionsDraft.view, sort: optionsDraft.sort });
            setOptionsDraft(null);
          }}
          onCancel={() => setOptionsDraft(null)}
          className="sm:max-w-[420px]"
        >
          <label className="office-dialog__field">
            <span>{t("stylesPane.optionsShow")}</span>
            <select
              data-testid="styles-options-show"
              value={optionsDraft.view}
              onChange={(event) =>
                setOptionsDraft((draft) =>
                  draft
                    ? { ...draft, view: event.target.value as StylesPanelView }
                    : draft,
                )
              }
            >
              <option value="recommended">{t("stylesPane.showRecommended")}</option>
              <option value="document">{t("stylesPane.showInDocument")}</option>
              <option value="all">{t("stylesPane.showAll")}</option>
            </select>
          </label>
          <label className="office-dialog__field">
            <span>{t("stylesPane.optionsSort")}</span>
            <select
              data-testid="styles-options-sort"
              value={optionsDraft.sort}
              onChange={(event) =>
                setOptionsDraft((draft) =>
                  draft
                    ? { ...draft, sort: event.target.value as StylesPanelSort }
                    : draft,
                )
              }
            >
              <option value="recommended">{t("stylesPane.sortRecommended")}</option>
              <option value="alphabetical">{t("stylesPane.sortAlphabetical")}</option>
              <option value="type">{t("stylesPane.sortByType")}</option>
            </select>
          </label>
        </OfficeDialogShell>
      ) : null}
    </OfficeTaskPane>
  );
}
