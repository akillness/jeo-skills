"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  HIDDEN_TEXT_DECORATION_PROPERTY,
  HIDDEN_TEXT_DISPLAY_PROPERTY,
} from "./hiddenTextExtension";
import { trustReadOnlyDocumentMutation } from "@mrnote/core/web/components/console/editor/native-document/readOnlyTransactionAuthority.ts";
import { SPLIT_CONTINUES_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { patchTopLevelDecorations } from "@mrnote/core/web/components/console/editor/native-document/topLevelDecorationPatch.ts";







































































/** Transaction-meta key used to update the view-only preference state. */
const FORMATTING_MARKS_META = "setFormattingMarks";

export const FORMATTING_MARKS_STORAGE_KEY = "mrnote.docs.formatting-marks.v1";

export const FORMATTING_MARK_PREFERENCE_KEYS = [
  "tabs",
  "spaces",
  "paragraphs",
  "optionalHyphens",
  "objectAnchors",
  "optionalBreaks",
  "hiddenText",
] as const;

export type FormattingMarkPreferenceKey =
  (typeof FORMATTING_MARK_PREFERENCE_KEYS)[number];

export type FormattingMarksPreferences = Readonly<
  Record<FormattingMarkPreferenceKey, boolean>
>;

const DEFAULT_FORMATTING_MARK_PREFERENCES: FormattingMarksPreferences =
  Object.freeze({
    tabs: false,
    spaces: false,
    paragraphs: false,
    optionalHyphens: false,
    objectAnchors: false,
    optionalBreaks: false,
    hiddenText: false,
  });

export const formattingMarksPluginKey = new PluginKey<FormattingMarksState>(
  "formattingMarks",
);




const OUT_OF_BOX_FORMATTING_MARK_PREFERENCES: FormattingMarksPreferences =
  Object.freeze({ ...DEFAULT_FORMATTING_MARK_PREFERENCES, paragraphs: true });

export interface FormattingMarksState {
  /** Home > Paragraph > Show/Hide ¶. When true, every supported mark is shown. */
  showAll: boolean;
  /** File > Options > Display equivalents that remain visible when showAll is off. */
  preferences: FormattingMarksPreferences;
  /**
   * The options the user set explicitly. Every other option follows the UI
   * language's default (see `formattingMarksPresentation`).
   */
  chosen: readonly FormattingMarkPreferenceKey[];
}

const formattingMarkPreferenceSet = new Set<string>(
  FORMATTING_MARK_PREFERENCE_KEYS,
);

/**
 * Resolve a stored or in-memory state against the locale defaults: a chosen
 * option keeps its value, any other option takes `defaults`. A state saved
 * before choices were recorded (no `chosen` list) can only hold `true` for an
 * option the user checked, since every option then started unchecked; its
 * `false` values carry no choice and fall back to the default.
 */
function normalizeFormattingMarksState(
  value: unknown,
  defaults: FormattingMarksPreferences = DEFAULT_FORMATTING_MARK_PREFERENCES,
): FormattingMarksState {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const stored =
    record.preferences && typeof record.preferences === "object"
      ? (record.preferences as Record<string, unknown>)
      : {};
  const chosen = Array.isArray(record.chosen)
    ? FORMATTING_MARK_PREFERENCE_KEYS.filter((key) =>
        (record.chosen as unknown[]).includes(key),
      )
    : FORMATTING_MARK_PREFERENCE_KEYS.filter((key) => stored[key] === true);
  return Object.freeze({
    showAll: record.showAll === true,
    preferences: Object.freeze(
      Object.fromEntries(
        FORMATTING_MARK_PREFERENCE_KEYS.map((key) => [
          key,
          chosen.includes(key) ? stored[key] === true : defaults[key] === true,
        ]),
      ) as Record<FormattingMarkPreferenceKey, boolean>,
    ),
    chosen: Object.freeze(chosen),
  });
}

function formattingMarksStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readFormattingMarksState(
  storage: Pick<Storage, "getItem"> | null = formattingMarksStorage(),
  defaults: FormattingMarksPreferences = DEFAULT_FORMATTING_MARK_PREFERENCES,
): FormattingMarksState {
  if (!storage) return normalizeFormattingMarksState(null, defaults);
  try {
    const raw = storage.getItem(FORMATTING_MARKS_STORAGE_KEY);
    return normalizeFormattingMarksState(raw ? JSON.parse(raw) : null, defaults);
  } catch {
    return normalizeFormattingMarksState(null, defaults);
  }
}

function persistFormattingMarksState(state: FormattingMarksState): void {
  const storage = formattingMarksStorage();
  if (!storage) return;
  try {
    storage.setItem(FORMATTING_MARKS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private/sandboxed browsing may reject storage; the live view still works.
  }
}

export type FormattingMarkKind =
  | "pilcrow"
  | "cellEnd"
  | "tab"
  | "space"
  | "break"
  | "optionalHyphen"
  | "objectAnchor"
  | "optionalBreak"
  | "pageBreak"
  | "columnBreak"
  | "sectionBreak";

export type FormattingMarkBreakKind =
  | "pageBreak"
  | "columnBreak"
  | "sectionBreakNextPage"
  | "sectionBreakContinuous"
  | "sectionBreakEvenPage"
  | "sectionBreakOddPage"
  | "sectionBreakNextColumn";

/** A single invisible-mark descriptor (pure, no DOM) the plugin renders. */
export interface FormattingMarkDescriptor {
  /** Document position the decoration attaches to (a break: the node's start). */
  pos: number;
  /** Which invisible this represents. */
  kind: FormattingMarkKind;
  /** Whether it replaces a 1-char text range (tab/space) or is a zero-width widget. */
  inline: boolean;
  /** Break kinds only: the node's size (its node decoration spans it). */
  nodeSize?: number;
  /** Break kinds only: which Word label the break shows. */
  breakKind?: FormattingMarkBreakKind;
  /**
   * Page/section breaks only: where print layout paints the label, since it
   * hides the break node itself — the end of the textblock before the break,
   * or (no such block) the start of the textblock after it.
   */
  labelAnchor?: { pos: number; placement: "end" | "start" };
}

/** Glyphs Word paints for the marks whose shape depends on the UI language. */
export interface FormattingMarkGlyphs {
  paragraph: string;
  lineBreak: string;
  cellEnd: string;
}










export const WESTERN_FORMATTING_MARK_GLYPHS: FormattingMarkGlyphs =
  Object.freeze({ paragraph: "¶", lineBreak: "↵", cellEnd: "¤" });
export const EAST_ASIAN_FORMATTING_MARK_GLYPHS: FormattingMarkGlyphs =
  Object.freeze({ paragraph: "↵", lineBreak: "↓", cellEnd: "↵" });

export interface FormattingMarksPresentation {
  glyphs: FormattingMarkGlyphs;
  breakLabels: Readonly<Record<FormattingMarkBreakKind, string>>;
  /** The "always show" options a user who never set them sees. */
  defaultPreferences: FormattingMarksPreferences;
  /**
   * Word Options > Advanced > Show document content > "Show crop marks": a
   * right angle at each corner of the page whose lines mark the edges of the
   * text area. Microsoft: on by default in East Asian languages, off in all
   * others (View.ShowCropMarks).
   */
  showCropMarks: boolean;
}

const DEFAULT_BREAK_LABELS: Readonly<Record<FormattingMarkBreakKind, string>> =
  Object.freeze({
    pageBreak: "Page Break",
    columnBreak: "Column Break",
    sectionBreakNextPage: "Section Break (Next Page)",
    sectionBreakContinuous: "Section Break (Continuous)",
    sectionBreakEvenPage: "Section Break (Even Page)",
    sectionBreakOddPage: "Section Break (Odd Page)",
    sectionBreakNextColumn: "Section Break (New Column)",
  });

export const DEFAULT_FORMATTING_MARKS_PRESENTATION: FormattingMarksPresentation =
  Object.freeze({
    glyphs: WESTERN_FORMATTING_MARK_GLYPHS,
    breakLabels: DEFAULT_BREAK_LABELS,
    defaultPreferences: OUT_OF_BOX_FORMATTING_MARK_PREFERENCES,
    showCropMarks: false,
  });

const BREAK_LABEL_KEYS = Object.keys(
  DEFAULT_BREAK_LABELS,
) as FormattingMarkBreakKind[];

/**
 * The locale's presentation, read through the editor's translator like every
 * other piece of extension UI copy. `document.formattingMarks.glyphStyle` is
 * `eastAsian` in the zh / zh-TW / ja / ko catalogues and `western` elsewhere
 * (partial catalogues fall back to en). A translator that echoes the key (no
 * catalogue) yields the Western glyphs and Word's English labels. The East
 * Every UI starts with paragraph marks always shown (Word's East Asian
 * default, chosen for all languages).
 */
export function formattingMarksPresentation(
  translate?: (key: string) => string,
): FormattingMarksPresentation {
  if (!translate) return DEFAULT_FORMATTING_MARKS_PRESENTATION;
  const read = (key: string): string | null => {
    try {
      const value = translate(key);
      return typeof value === "string" && value.trim() && !value.endsWith(key)
        ? value
        : null;
    } catch {
      return null;
    }
  };
  const eastAsian = read("document.formattingMarks.glyphStyle") === "eastAsian";
  const glyphs = eastAsian
    ? EAST_ASIAN_FORMATTING_MARK_GLYPHS
    : WESTERN_FORMATTING_MARK_GLYPHS;
  const breakLabels = Object.freeze(
    Object.fromEntries(
      BREAK_LABEL_KEYS.map((kind) => [
        kind,
        read(`document.formattingMarks.${kind}`) ?? DEFAULT_BREAK_LABELS[kind],
      ]),
    ) as Record<FormattingMarkBreakKind, string>,
  );
  return Object.freeze({
    glyphs,
    breakLabels,
    defaultPreferences: OUT_OF_BOX_FORMATTING_MARK_PREFERENCES,
    showCropMarks: eastAsian,
  });
}

/** The glyph each widget/inline kind paints (break kinds paint a label). */
function markGlyph(
  kind: FormattingMarkKind,
  glyphs: FormattingMarkGlyphs,
): string {
  switch (kind) {
    case "pilcrow":
      return glyphs.paragraph;
    case "break":
      return glyphs.lineBreak;
    case "cellEnd":
      return glyphs.cellEnd;
    case "tab":
      return "→";
    case "space":
      return "·";
    case "optionalHyphen":
      return "¬";
    case "objectAnchor":
      return "⚓";
    case "optionalBreak":
      return "¦";
    default:
      return "";
  }
}

/**
 * Layout-critical widget geometry, inline so it holds even where the editor
 * stylesheet is absent: a zero-width, zero-line-height inline box. The glyph
 * is a pseudo-element that overflows it, so the line box, the wrap point and
 * the block height are exactly what they are with marks off.
 */
const ZERO_LAYOUT_WIDGET_STYLE =
  "display:inline-block;width:0;height:0;line-height:0;overflow:visible;white-space:nowrap;vertical-align:baseline;position:relative;";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    formattingMarks: {
      /** Show or hide the invisible formatting-mark overlay (Word/WPS ¶ toggle). */
      setFormattingMarks: (on: boolean) => ReturnType;
      /** Flip the formatting-mark overlay. */
      toggleFormattingMarks: () => ReturnType;
      /** Set one Word Options > Display "always show" preference. */
      setFormattingMarkPreference: (
        key: FormattingMarkPreferenceKey,
        on: boolean,
      ) => ReturnType;
    };
  }
}

/**
 * Whether the formatting-mark overlay is currently ON for an editor state. Reads
 * the plugin's own state (defaults to off when the plugin is absent). The toolbar
 * snapshot uses this to show the ¶ button as active.
 */
export function isFormattingMarksOn(state: EditorState): boolean {
  return formattingMarksPluginKey.getState(state)?.showAll === true;
}

/** Current application-level per-mark preferences for the toolbar checklist. */
export function getFormattingMarksPreferences(
  state: EditorState,
): FormattingMarksPreferences {
  return (
    formattingMarksPluginKey.getState(state)?.preferences ??
    DEFAULT_FORMATTING_MARK_PREFERENCES
  );
}

/** Whether Word hidden runs should be revealed in this editor view. */
export function isHiddenTextVisible(state: EditorState): boolean {
  const formattingState =
    formattingMarksPluginKey.getState(state) ?? readFormattingMarksState(null);
  return (
    formattingState.showAll || formattingState.preferences.hiddenText === true
  );
}

function syncHiddenTextVisibility(
  dom: HTMLElement,
  state: EditorState,
): boolean {
  const visible = isHiddenTextVisible(state);
  dom.style.setProperty(
    HIDDEN_TEXT_DISPLAY_PROPERTY,
    visible ? "inline" : "none",
  );
  dom.style.setProperty(
    HIDDEN_TEXT_DECORATION_PROPERTY,
    visible ? "underline dotted" : "none",
  );
  dom.toggleAttribute("data-show-hidden-text", visible);
  return visible;
}

/**
 * Walk a document and produce the ordered list of invisible-mark descriptors that
 * the overlay renders (PURE — positions only, no DOM, no plugin state). Splitting
 * this out makes the position math (block ends, per-character tab/space scans,
 * hard breaks) unit-testable headlessly.
 *
 * Positions:
 *   - pilcrow / cellEnd: at `pos + node.nodeSize - 1` — just inside the
 *     block's closing boundary, i.e. after its last inline content (so it
 *     reads as "end of paragraph"); emitted for every textblock except the
 *     head of a page/column split, and `cellEnd` for the last textblock of a
 *     table cell.
 *   - pageBreak / columnBreak / sectionBreak: at the break node, with its
 *     size, Word label kind and (page/section) the label's paragraph anchor.
 *   - tab/space: at the exact document position of the Tab/space character inside
 *     a text node; each replaces that single character with a glyph via an inline
 *     decoration so the underlying text is untouched.
 *   - break: at the position of a `hardBreak` node.
 */
export function formattingMarkDescriptors(
  doc: ProseMirrorNode,
  from = 0,
  to = doc.content.size,
): FormattingMarkDescriptor[] {
  const out: FormattingMarkDescriptor[] = [];

  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "image") {
      const attrs = node.attrs as Record<string, unknown>;
      const anchored =
        attrs.officeDrawingKind === "anchor" ||
        (typeof attrs.dataFloat === "string" && attrs.dataFloat.length > 0);
      if (anchored) {
        out.push({ pos, kind: "objectAnchor", inline: false });
      }
      return true;
    }
    const breakKind = breakKindOf(node);
    if (breakKind) {
      const descriptor: FormattingMarkDescriptor = {
        pos,
        kind:
          node.type.name === "sectionBreak"
            ? "sectionBreak"
            : (node.type.name as "pageBreak" | "columnBreak"),
        inline: false,
        nodeSize: node.nodeSize,
        breakKind,
      };
      // A column break keeps its own divider in every layout; a page or
      // section break is hidden by print layout, so its label also needs a
      // home inside a neighbouring paragraph (never a new page child).
      if (node.type.name !== "columnBreak") {
        const labelAnchor = breakLabelAnchor(doc, pos, node);
        if (labelAnchor) descriptor.labelAnchor = labelAnchor;
      }
      out.push(descriptor);
      return false;
    }
    if (node.isTextblock) {
      // The paragraph mark at the end of every paragraph/heading-like block,
      // empty ones included. nodeSize-1 is the position just before the
      // block's closing token (after its inline content). The head of a
      // page/column split does not end the paragraph: only its tail does.
      if ((node.attrs as Record<string, unknown>)[SPLIT_CONTINUES_ATTR] !== true) {
        const $pos = doc.resolve(pos);
        const parent = $pos.parent;
        const role = parent.type.spec.tableRole;
        const endsCell =
          (role === "cell" || role === "header_cell") &&
          $pos.index() === parent.childCount - 1;
        // Before the spaces a paragraph ends in, which hang past the margin in
        // Word's lines: nothing fits after them, so the mark (and what the view
        // adds after a widget) opened a line of its own, a line more in the
        // paragraph (corpus R283-D05: 100 spaces before a page break, a page
        // more than Word, in an interface where paragraph marks are on).
        const last = node.lastChild;
        const trailingSpaces = last?.isText ? (/ +$/.exec(last.text ?? "")?.[0].length ?? 0) : 0;
        out.push({
          pos: pos + node.nodeSize - 1 - trailingSpaces,
          kind: endsCell ? "cellEnd" : "pilcrow",
          inline: false,
        });
      }
      // Continue descending so we still see this block's text children.
      return true;
    }
    if (node.type.name === "hardBreak") {
      out.push({ pos, kind: "break", inline: false });
      return true;
    }
    if (node.isText && typeof node.text === "string") {
      const text = node.text;
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === "\t") {
          out.push({ pos: pos + i, kind: "tab", inline: true });
        } else if (ch === " ") {
          out.push({ pos: pos + i, kind: "space", inline: true });
        } else if (ch === "\u00ad") {
          out.push({ pos: pos + i, kind: "optionalHyphen", inline: false });
        } else if (ch === "\u200b") {
          out.push({ pos: pos + i, kind: "optionalBreak", inline: false });
        }
      }
      return true;
    }
    return true;
  });

  return out;
}

function breakKindOf(node: ProseMirrorNode): FormattingMarkBreakKind | null {
  switch (node.type.name) {
    case "pageBreak":
      return "pageBreak";
    case "columnBreak":
      return "columnBreak";
    case "sectionBreak": {
      const type = (node.attrs as Record<string, unknown>).breakType;
      if (type === "continuous") return "sectionBreakContinuous";
      if (type === "evenPage") return "sectionBreakEvenPage";
      if (type === "oddPage") return "sectionBreakOddPage";
      if (type === "nextColumn") return "sectionBreakNextColumn";
      return "sectionBreakNextPage";
    }
    default:
      return null;
  }
}

/** Deepest last (or first) textblock of a block, lists/quotes included; a
 * table is not descended (a break label never lands inside a cell). */
function edgeTextblock(
  node: ProseMirrorNode,
  nodePos: number,
  edge: "last" | "first",
): { node: ProseMirrorNode; pos: number } | null {
  if (node.isTextblock) return { node, pos: nodePos };
  if (node.isLeaf || node.type.spec.tableRole === "table") return null;
  if (node.childCount === 0) return null;
  if (edge === "last") {
    const child = node.lastChild!;
    return edgeTextblock(child, nodePos + node.nodeSize - 1 - child.nodeSize, edge);
  }
  return edgeTextblock(node.firstChild!, nodePos + 1, edge);
}

function breakLabelAnchor(
  doc: ProseMirrorNode,
  pos: number,
  node: ProseMirrorNode,
): FormattingMarkDescriptor["labelAnchor"] | null {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  const index = $pos.index();
  if (index > 0) {
    const before = parent.child(index - 1);
    const found = edgeTextblock(before, pos - before.nodeSize, "last");
    if (found) {
      return { pos: found.pos + found.node.nodeSize - 1, placement: "end" };
    }
  }
  if (index + 1 < parent.childCount) {
    const after = parent.child(index + 1);
    const found = edgeTextblock(after, pos + node.nodeSize, "first");
    if (found) return { pos: found.pos + 1, placement: "start" };
  }
  return null;
}

function formattingMarkIsVisible(
  kind: FormattingMarkDescriptor["kind"],
  state: FormattingMarksState,
): boolean {
  if (state.showAll) return true;
  switch (kind) {
    case "tab":
      return state.preferences.tabs;
    case "space":
      return state.preferences.spaces;
    case "pilcrow":
    case "cellEnd":
      // Word draws end-of-cell marks with the paragraph marks.
      return state.preferences.paragraphs;
    case "optionalHyphen":
      return state.preferences.optionalHyphens;
    case "objectAnchor":
      return state.preferences.objectAnchors;
    case "optionalBreak":
      return state.preferences.optionalBreaks;
    case "break":
    case "pageBreak":
    case "columnBreak":
    case "sectionBreak":
      // Word has no separate checkbox for manual line breaks or page /
      // column / section breaks: they appear only under Show all.
      return false;
  }
}

function hiddenTextIsVisible(state: FormattingMarksState): boolean {
  return state.showAll || state.preferences.hiddenText;
}

/** A fully hidden paragraph must not reserve an empty print-layout line. */
function textblockIsEntirelyHidden(node: ProseMirrorNode): boolean {
  if (!node.isTextblock || node.content.size === 0) return false;
  let hasText = false;
  let entirelyHidden = true;
  node.descendants((child) => {
    if (child.isText) {
      hasText = true;
      if (!child.marks.some((mark) => mark.type.name === "hiddenText")) {
        entirelyHidden = false;
      }
      return false;
    }
    if (child.isLeaf) entirelyHidden = false;
    return entirelyHidden;
  });
  return hasText && entirelyHidden;
}

/**
 * Build the DecorationSet for the formatting-mark overlay. Returns the empty
 * set when no mark is enabled. Pilcrow/break/anchor are zero-width widgets;
 * tab/space are inline decorations over the single character that add a class
 * via CSS (the real character stays in the text, so selection/copy are
 * unaffected). The widget DOM is built defensively with textContent only.
 */
export function buildFormattingMarkDecorations(
  doc: ProseMirrorNode,
  stateOrShowAll:
    | boolean
    | Pick<FormattingMarksState, "showAll" | "preferences">,
  presentation: FormattingMarksPresentation = DEFAULT_FORMATTING_MARKS_PRESENTATION,
): DecorationSet {
  const decorations = formattingMarkDecorationList(doc, stateOrShowAll, presentation);
  if (decorations.length === 0) return DecorationSet.empty;
  return DecorationSet.create(doc, decorations);
}

/** The overlay's decorations of the top-level children within [from, to). */
function formattingMarkDecorationList(
  doc: ProseMirrorNode,
  stateOrShowAll:
    | boolean
    | Pick<FormattingMarksState, "showAll" | "preferences">,
  presentation: FormattingMarksPresentation,
  from = 0,
  to = doc.content.size,
): Decoration[] {
  // A state object is already resolved against the locale defaults, so its
  // preferences are taken as they are.
  const state =
    typeof stateOrShowAll === "boolean"
      ? normalizeFormattingMarksState({ showAll: stateOrShowAll })
      : normalizeFormattingMarksState({
          ...stateOrShowAll,
          chosen: FORMATTING_MARK_PREFERENCE_KEYS,
        });
  const descriptors = formattingMarkDescriptors(doc, from, to).filter((descriptor) =>
    formattingMarkIsVisible(descriptor.kind, state),
  );
  const decorations: Decoration[] = [];
  if (!hiddenTextIsVisible(state)) {
    doc.nodesBetween(from, to, (node, pos) => {
      if (textblockIsEntirelyHidden(node)) {
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            "data-hidden-text-only": "true",
            style: "display: none",
          }),
        );
        return false;
      }
      return true;
    });
  }
  descriptors.forEach((descriptor) => {
    if (descriptor.breakKind && descriptor.nodeSize) {
      const label = presentation.breakLabels[descriptor.breakKind];
      // The break's own divider (where it is displayed) shows Word's label.
      decorations.push(
        Decoration.node(descriptor.pos, descriptor.pos + descriptor.nodeSize, {
          "data-formatting-mark-break": descriptor.breakKind,
          "data-formatting-mark-label": label,
        }),
      );
      const anchor = descriptor.labelAnchor;
      if (anchor) {
        decorations.push(
          Decoration.widget(
            anchor.pos,
            () => {
              const span = document.createElement("span");
              span.className = `mrnote-formatting-mark mrnote-formatting-mark--break-label mrnote-formatting-mark--${descriptor.kind}`;
              span.setAttribute("contenteditable", "false");
              span.setAttribute("aria-hidden", "true");
              span.setAttribute("data-testid", "document-formatting-mark");
              span.setAttribute("data-mark-label", label);
              span.setAttribute("data-mark-placement", anchor.placement);
              span.style.cssText = ZERO_LAYOUT_WIDGET_STYLE;
              return span;
            },
            {
              // After the paragraph mark at a block end; before the text at
              // a block start.
              side: anchor.placement === "end" ? 2 : -2,
              ignoreSelection: true,
              zeroLayoutFormattingMark: true,
              key: `formatting-mark-${descriptor.breakKind}-label-${label}-${anchor.placement}`,
            },
          ),
        );
      }
      return;
    }
    const glyph = markGlyph(descriptor.kind, presentation.glyphs);
    if (descriptor.inline) {
      // Replace the single tab/space character's rendering with the glyph via a
      // class (CSS paints the glyph + dims it); the underlying text is untouched.
      decorations.push(
        Decoration.inline(descriptor.pos, descriptor.pos + 1, {
          class: `mrnote-formatting-mark mrnote-formatting-mark--${descriptor.kind}`,
        }),
      );
    } else {
      // The mark of an EMPTY paragraph (or cell) is the only thing on its
      // line. As an ordinary widget it is contenteditable=false, and
      // ProseMirror follows such a trailing widget with a separator <img>,
      // so the line holds three caret positions (before the mark, between
      // mark and image, before the <br>). Chrome's mouse-down lands on
      // whichever is nearest the pointer, ProseMirror reads the same document
      // position and writes back its own DOM position for it, and that script
      // write in the middle of the press ends Chrome's drag selection: a drag
      // started on a blank line (or below the last one) only moved the caret
      // with the mouse. Without contenteditable=false the empty zero-size span
      // is transparent to ProseMirror's position comparison and gets no
      // separator image, so the press keeps the browser's own position and
      // the drag selects. It stays user-select:none / pointer-events:none
      // (the formatting-mark CSS), and ProseMirror still ignores it as a
      // widget; the class it would add is added here.
      const emptyBlock =
        (descriptor.kind === "pilcrow" || descriptor.kind === "cellEnd") &&
        doc.resolve(descriptor.pos).parent.content.size === 0;
      decorations.push(
        Decoration.widget(
          descriptor.pos,
          () => {
            const span = document.createElement("span");
            span.className = `mrnote-formatting-mark mrnote-formatting-mark--${descriptor.kind}`;
            if (emptyBlock) span.classList.add("ProseMirror-widget");
            else span.setAttribute("contenteditable", "false");
            span.setAttribute("aria-hidden", "true");
            span.setAttribute("data-testid", "document-formatting-mark");
            // The glyph is painted from this attribute by CSS, never a text
            // node: word count, copy and the pagination text walkers only
            // ever see the document's own characters.
            span.setAttribute("data-mark-glyph", glyph);
            // An anchor may precede a block-level picture, where even a
            // zero-size inline box would open an anonymous line: take it out
            // of flow so it paints at its static position and costs nothing.
            span.style.cssText =
              descriptor.kind === "objectAnchor"
                ? `${ZERO_LAYOUT_WIDGET_STYLE}position:absolute;`
                : ZERO_LAYOUT_WIDGET_STYLE;
            return span;
          },
          {
            side:
              descriptor.kind === "break" || descriptor.kind === "objectAnchor"
                ? -1
                : 1,
            ignoreSelection: true,
            zeroLayoutFormattingMark: true,
            ...(emptyBlock ? { raw: true } : {}),
            // Widgets with the same kind and glyph are interchangeable, so
            // the key carries no position: typing or adding a paragraph
            // reuses every other mark's DOM instead of redrawing all marks
            // after it (paragraph marks are on by default in the East Asian
            // UI). The glyph is part of the key so a locale change re-renders.
            // An empty block's (editable, raw) mark is a different widget.
            key: `formatting-mark-${descriptor.kind}${emptyBlock ? "-empty" : ""}-${glyph}`,
          },
        ),
      );
    }
  });

  return decorations;
}

/**
 * Remove the overlay from a detached copy of the editor DOM (the print
 * window, which is also the PDF path). Word never prints formatting marks,
 * and with paragraph marks on by default in the East Asian UI a clone of the
 * live view almost always carries them: drop the widgets, the tab/space
 * classes and the break labels so neither the popup nor the paper shows one.
 */
export function stripFormattingMarks(root: HTMLElement): void {
  root
    .querySelectorAll('[data-testid="document-formatting-mark"]')
    .forEach((mark) => mark.remove());
  root.querySelectorAll(".mrnote-formatting-mark").forEach((element) => {
    const classes = [...element.classList].filter((name) =>
      name.startsWith("mrnote-formatting-mark"),
    );
    element.classList.remove(...classes);
    if (element.classList.length === 0) element.removeAttribute("class");
  });
  root.querySelectorAll("[data-formatting-mark-label]").forEach((element) => {
    element.removeAttribute("data-formatting-mark-label");
    element.removeAttribute("data-formatting-mark-break");
  });
}

export interface FormattingMarksOptions {
  /** Locale glyphs and break labels (see `formattingMarksPresentation`). */
  presentation: FormattingMarksPresentation;
}

const FormattingMarks = Extension.create<FormattingMarksOptions>({
  name: "formattingMarks",

  addOptions() {
    return { presentation: DEFAULT_FORMATTING_MARKS_PRESENTATION };
  },

  addCommands() {
    const defaults = () =>
      (this.options.presentation ?? DEFAULT_FORMATTING_MARKS_PRESENTATION)
        .defaultPreferences ?? DEFAULT_FORMATTING_MARK_PREFERENCES;
    const currentState = (state: EditorState) =>
      formattingMarksPluginKey.getState(state) ??
      readFormattingMarksState(null, defaults());
    return {
      setFormattingMarks:
        (on: boolean) =>
        ({ state, tr, dispatch }) => {
          if (dispatch) {
            const current = currentState(state);
            const next = normalizeFormattingMarksState(
              { ...current, showAll: on === true },
              defaults(),
            );
            // Carry the whole immutable view state on a meta. The change is
            // view-only, so it must not enter the document undo history.
            tr.setMeta(FORMATTING_MARKS_META, next);
            trustReadOnlyDocumentMutation(tr, "session-view");
            dispatch(tr);
            persistFormattingMarksState(next);
          }
          return true;
        },
      toggleFormattingMarks:
        () =>
        ({ state, tr, dispatch }) => {
          if (dispatch) {
            const current = currentState(state);
            const next = normalizeFormattingMarksState(
              { ...current, showAll: !current.showAll },
              defaults(),
            );
            tr.setMeta(FORMATTING_MARKS_META, next);
            trustReadOnlyDocumentMutation(tr, "session-view");
            dispatch(tr);
            persistFormattingMarksState(next);
          }
          return true;
        },
      setFormattingMarkPreference:
        (key: FormattingMarkPreferenceKey, on: boolean) =>
        ({ state, tr, dispatch }) => {
          if (!formattingMarkPreferenceSet.has(key)) return false;
          if (dispatch) {
            const current = currentState(state);
            // An explicit choice, on or off, is remembered and from now on
            // wins over the UI language's default for this option.
            const next = normalizeFormattingMarksState(
              {
                ...current,
                preferences: { ...current.preferences, [key]: on === true },
                chosen: [...current.chosen, key],
              },
              defaults(),
            );
            tr.setMeta(FORMATTING_MARKS_META, next);
            trustReadOnlyDocumentMutation(tr, "session-view");
            dispatch(tr);
            persistFormattingMarksState(next);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const presentation =
      this.options.presentation ?? DEFAULT_FORMATTING_MARKS_PRESENTATION;
    const defaults =
      presentation.defaultPreferences ?? DEFAULT_FORMATTING_MARK_PREFERENCES;
    // The decoration prop runs on every view update, selection moves
    // included; with paragraph marks on by default (East Asian UI) the set is
    // rebuilt only when the document or the preferences change.
    let cached: {
      doc: ProseMirrorNode;
      marks: FormattingMarksState;
      set: DecorationSet;
    } | null = null;
    return [
      new Plugin<FormattingMarksState>({
        key: formattingMarksPluginKey,
        state: {
          init: () => readFormattingMarksState(undefined, defaults),
          apply: (tr: Transaction, value: FormattingMarksState) => {
            const meta = tr.getMeta(FORMATTING_MARKS_META);
            // Accept the former boolean meta during Fast Refresh so an editor
            // created by the previous extension shape does not lose the toggle.
            if (typeof meta === "boolean") {
              return normalizeFormattingMarksState(
                { ...value, showAll: meta },
                defaults,
              );
            }
            if (meta && typeof meta === "object") {
              return normalizeFormattingMarksState(meta, defaults);
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const marks =
              formattingMarksPluginKey.getState(state) ??
              readFormattingMarksState(null, defaults);
            if (cached?.doc === state.doc && cached.marks === marks) {
              return cached.set;
            }
            // Only the top-level blocks an edit replaced are walked again:
            // the marks are each block's own (a break's label lands in the
            // block beside it, which is walked with it).
            const set = cached && cached.marks === marks
              ? patchTopLevelDecorations(cached.doc, cached.set, state.doc,
                (from, to) => formattingMarkDecorationList(state.doc, marks, presentation, from, to),
                { reachesNeighbour: (child) => breakKindOf(child) !== null })
              : buildFormattingMarkDecorations(
                state.doc,
                marks,
                presentation,
              );
            cached = { doc: state.doc, marks, set };
            return set;
          },
        },
        view(editorView) {
          let hiddenTextVisible = syncHiddenTextVisibility(
            editorView.dom,
            editorView.state,
          );
          return {
            update(view) {
              const nextVisible = isHiddenTextVisible(view.state);
              if (nextVisible === hiddenTextVisible) return;
              hiddenTextVisible = syncHiddenTextVisibility(
                view.dom,
                view.state,
              );
            },
            destroy() {
              editorView.dom.style.removeProperty(
                HIDDEN_TEXT_DISPLAY_PROPERTY,
              );
              editorView.dom.style.removeProperty(
                HIDDEN_TEXT_DECORATION_PROPERTY,
              );
              editorView.dom.removeAttribute("data-show-hidden-text");
            },
          };
        },
      }),
    ];
  },
});

export default FormattingMarks;
