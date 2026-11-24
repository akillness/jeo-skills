"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Office Live Preview, shared by every editor.
 *
 * "Enable Live Preview" (Office Options > General) lets a pointer resting on
 * a font, a size, a colour or a format toggle show the selection as it would
 * look, and leaving the control puts it back. Nothing is written: no model
 * change, no undo step, no save. Clicking commits as before.
 *
 * The shared controls (font family picker, value combobox, colour palette,
 * Home commands) only ever say `preview(patch)` and `clearPreview()`. The
 * editor that hosts them provides one adapter that turns a patch into a
 * transient look on what is selected and returns how to undo that look:
 *
 * - Docs: a ProseMirror decoration over the selection (never DOM surgery
 *   inside the view, which ProseMirror would re-read as an edit);
 * - Spreadsheet and Presentation: `officePreviewElements` on the selected
 *   cells / shapes, or `officePreviewTextRange` on the selected characters of
 *   an open text editor.
 *
 * A preview never outlives the gesture: it is cleared on pointer leave and
 * blur (by the control), on any press or Enter / Escape anywhere (before the
 * control's own handler runs, so a commit never sees preview state), when
 * the window loses focus, and when the provider or the control unmounts.
 */

import { PX_PER_PT } from "../../lib/office-units";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { withOfficeFontSubstitutes } from "../../lib/office-fonts/substitutes";
import { isCompatMouseFromTouch, isTouchLikePointer } from "../../lib/pointer-capability";
import { OFFICE_INACTIVE_SELECTION_ATTRIBUTE, OFFICE_TEXT_FORMAT_CONTROL_ATTRIBUTE } from "../../lib/office-inactive-selection";
import { installOfficePaintedCaret } from "../../lib/office-painted-caret";
import { boxWithin } from "../../lib/glide-geometry";

/** Where a press is a choice that commits on its click (lists and menus). */
const PREVIEW_CHOICE_SELECTOR = [
  '[role="menu"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
].join(", ");

/** Keys that move through a list or a palette without leaving it. */
const PREVIEW_NAVIGATION_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Tab",
  "Shift",
]);

/** What a hovered control would apply. Sizes are points. */
export type OfficeFormatPreviewPatch = Readonly<{
  fontFamily?: string;
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  highlight?: string;
  /** A whole cell format hovered, as the press writes it (a spreadsheet's). */
  cellStyle?: Readonly<Record<string, unknown>>;
}>;

/** Undo the look a preview applied. */
export type OfficeFormatPreviewRestore = () => void;

/**
 * The host editor's side: show `patch` on what is selected now and return
 * how to take it away, or nothing when there is nothing to preview.
 */
export type OfficeFormatPreviewAdapter = (
  patch: OfficeFormatPreviewPatch,
) => OfficeFormatPreviewRestore | null | undefined | void;

export type OfficeFormatPreviewCssOptions = Readonly<{
  /** CSS pixels per point at the editor's current zoom (default 96 / 72). */
  pxPerPt?: number;
  /** Maps an Office family name to a CSS font-family list. */
  fontFamilyCss?: (family: string) => string;
}>;

const DEFAULT_PX_PER_PT = PX_PER_PT;

function quoteFamily(family: string): string {
  const trimmed = family.trim();
  if (/^["']/.test(trimmed) || trimmed.includes(",")) return trimmed;
  return `"${trimmed.replace(/["\\]/g, "\\$&")}"`;
}

/** The CSS declarations that show `patch` (kebab-case property names). */
export function officeFormatPreviewCss(
  patch: OfficeFormatPreviewPatch,
  options: OfficeFormatPreviewCssOptions = {},
): Record<string, string> {
  const css: Record<string, string> = {};
  if (patch.fontFamily) {
    css["font-family"] = options.fontFamilyCss
      ? options.fontFamilyCss(patch.fontFamily)
      : withOfficeFontSubstitutes(quoteFamily(patch.fontFamily));
  }
  if (
    typeof patch.fontSizePt === "number" &&
    Number.isFinite(patch.fontSizePt) &&
    patch.fontSizePt > 0
  ) {
    const px = patch.fontSizePt * (options.pxPerPt ?? DEFAULT_PX_PER_PT);
    css["font-size"] = `${Math.round(px * 100) / 100}px`;
  }
  if (patch.bold !== undefined) css["font-weight"] = patch.bold ? "700" : "400";
  if (patch.italic !== undefined) {
    css["font-style"] = patch.italic ? "italic" : "normal";
  }
  if (patch.underline !== undefined || patch.strike !== undefined) {
    const lines = [
      patch.underline ? "underline" : "",
      patch.strike ? "line-through" : "",
    ].filter(Boolean);
    css["text-decoration-line"] = lines.length ? lines.join(" ") : "none";
  }
  if (patch.color) {
    css.color = patch.color;
    css["-webkit-text-fill-color"] = patch.color;
  }
  if (patch.highlight) css["background-color"] = patch.highlight;
  return css;
}

function declarations(css: Record<string, string>, important: boolean): string {
  return Object.entries(css)
    .map(([name, value]) => `${name}: ${value}${important ? " !important" : ""};`)
    .join(" ");
}

/** An equation renderer's own nodes, which a preview reaches only by inheritance. */
const OFFICE_PREVIEW_EQUATION_INSIDE = ".katex *";
const CLASS_PREFIX = "office-format-preview";
const CLASS_SHEET_ID = "office-format-preview-classes";
const CLASS_PROPERTIES = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-decoration-line",
  "color",
  "-webkit-text-fill-color",
  "background-color",
] as const;

/**
 * For a host that can only put attributes on a wrapper it does not own the
 * inside of (a ProseMirror inline decoration around marked text): the look
 * as one class per property plus custom properties, and a static sheet that
 * applies each one, with !important, to the wrapper AND its descendants,
 * so a font mark's own inline family nested inside still shows the preview.
 * Only the properties the patch sets are touched.
 */
export function officeFormatPreviewClassStyle(
  css: Record<string, string>,
  doc: Document | undefined = typeof document === "undefined" ? undefined : document,
): { className: string; style: string } {
  if (doc && !doc.getElementById(CLASS_SHEET_ID)) {
    const sheet = doc.createElement("style");
    sheet.id = CLASS_SHEET_ID;
    sheet.textContent = CLASS_PROPERTIES.map((property) => {
      const name = `${CLASS_PREFIX}-${property.replace(/^-/, "")}`;
      // An equation inside the preview takes the look by inheritance; its
      // renderer's own sized parts keep their proportions (see
      // OFFICE_PREVIEW_EQUATION_INSIDE).
      return `.${name}, .${name} *:not(${OFFICE_PREVIEW_EQUATION_INSIDE}) { ${property}: var(--${name}) !important; }`;
    }).join("\n");
    (doc.head ?? doc.documentElement).appendChild(sheet);
  }
  const classes: string[] = [CLASS_PREFIX];
  const variables: string[] = [];
  for (const [property, value] of Object.entries(css)) {
    if (!(CLASS_PROPERTIES as readonly string[]).includes(property)) continue;
    const name = `${CLASS_PREFIX}-${property.replace(/^-/, "")}`;
    classes.push(name);
    variables.push(`--${name}: ${value};`);
  }
  return { className: classes.join(" "), style: variables.join(" ") };
}

export const OFFICE_FORMAT_PREVIEW_ATTRIBUTE = "data-office-format-preview";

/**
 * Shows `css` on equation containers -- a worksheet equation box's drawing or
 * its open draft, a slide equation -- on the container alone: the equation
 * renderer (KaTeX, MathLive) sizes its own parts in em of the container, so
 * the size and colour reach them by inheritance.
 */
export function officePreviewEquationElements(
  elements: Iterable<Element>,
  css: Record<string, string>,
): OfficeFormatPreviewRestore | null {
  const kept: Record<string, string> = {};
  // Only what an equation shows: its size and its colour.
  for (const [property, value] of Object.entries(css)) {
    if (property === "font-size" || property === "color") kept[property] = value;
  }
  return officePreviewElements(elements, kept, { descendants: false });
}
let previewSerial = 0;

/**
 * Shows `css` on whole elements (selected cells, selected shapes) and on
 * everything inside them, so per-run inline styles inside follow too. The
 * elements only gain a data attribute and the document a style sheet; the
 * owner's own attributes and inline styles are never touched, so a render
 * during the preview cannot fight it and the restore cannot clobber one.
 */
export function officePreviewElements(
  elements: Iterable<Element>,
  css: Record<string, string>,
  options: { readonly descendants?: boolean } = {},
): OfficeFormatPreviewRestore | null {
  const targets = [...elements].filter((element) => element.isConnected);
  if (targets.length === 0 || Object.keys(css).length === 0) return null;
  const doc = targets[0]!.ownerDocument;
  const token = `p${++previewSerial}`;
  const selector = `[${OFFICE_FORMAT_PREVIEW_ATTRIBUTE}~="${token}"]`;
  const sheet = doc.createElement("style");
  sheet.setAttribute(`${OFFICE_FORMAT_PREVIEW_ATTRIBUTE}-sheet`, token);
  // An equation's renderer sizes its scripts, limits and fraction parts in
  // em of the equation (KaTeX's nested sizing spans): a size forced onto each
  // of them would draw a superscript as large as its base. The equation itself
  // takes the preview and its inside follows by inheritance.
  sheet.textContent =
    options.descendants === false
      ? `${selector} { ${declarations(css, true)} }`
      : `${selector}, ${selector} *:not(${OFFICE_PREVIEW_EQUATION_INSIDE}) { ${declarations(css, true)} }`;
  (doc.head ?? doc.documentElement).appendChild(sheet);
  for (const element of targets) {
    const current = element.getAttribute(OFFICE_FORMAT_PREVIEW_ATTRIBUTE);
    element.setAttribute(
      OFFICE_FORMAT_PREVIEW_ATTRIBUTE,
      current ? `${current} ${token}` : token,
    );
  }
  return () => {
    sheet.remove();
    for (const element of targets) {
      const rest = (element.getAttribute(OFFICE_FORMAT_PREVIEW_ATTRIBUTE) ?? "")
        .split(/\s+/)
        .filter((entry) => entry && entry !== token);
      if (rest.length) {
        element.setAttribute(OFFICE_FORMAT_PREVIEW_ATTRIBUTE, rest.join(" "));
      } else {
        element.removeAttribute(OFFICE_FORMAT_PREVIEW_ATTRIBUTE);
      }
    }
  };
}

/**
 * The DOM range covering characters [start, end) of `root`'s text, counted
 * over its text nodes in document order (the offsets text editors keep).
 */
export function officeTextOffsetsRange(
  root: Node,
  start: number,
  end: number,
): Range | null {
  const doc = root.ownerDocument ?? (root as Document);
  const from = Math.max(0, Math.min(start, end));
  const to = Math.max(start, end);
  if (to <= from) return null;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let offset = 0;
  let started = false;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const length = node.data.length;
    if (!started && from <= offset + length && from - offset < length) {
      range.setStart(node, from - offset);
      started = true;
    }
    if (started && to <= offset + length) {
      range.setEnd(node, to - offset);
      return range;
    }
    offset += length;
  }
  return null;
}

type SelectionSnapshot = Readonly<{
  anchorNode: Node;
  anchorOffset: number;
  focusNode: Node;
  focusOffset: number;
}>;

function snapshotSelection(doc: Document): SelectionSnapshot | null {
  const selection = doc.getSelection?.();
  if (!selection || !selection.anchorNode || !selection.focusNode) return null;
  return {
    anchorNode: selection.anchorNode,
    anchorOffset: selection.anchorOffset,
    focusNode: selection.focusNode,
    focusOffset: selection.focusOffset,
  };
}

function sameSnapshot(a: SelectionSnapshot | null, b: SelectionSnapshot | null) {
  if (!a || !b) return a === b;
  return (
    a.anchorNode === b.anchorNode &&
    a.anchorOffset === b.anchorOffset &&
    a.focusNode === b.focusNode &&
    a.focusOffset === b.focusOffset
  );
}

/**
 * Shows `css` on the characters of `range` only (a partial selection inside
 * an open text editor). The owner's text nodes are never moved or removed:
 * each one the range touches is emptied in place and a styled copy of its
 * text is shown just before it; the restore puts the text back and removes
 * the copies. A framework holding those text nodes therefore still finds
 * them where it left them, and the text offsets an editor computes over the
 * root are unchanged while the preview shows. The browser selection is put
 * back as it was unless something else moved it meanwhile.
 */
export function officePreviewTextRange(
  range: Range,
  css: Record<string, string>,
): OfficeFormatPreviewRestore | null {
  if (range.collapsed || Object.keys(css).length === 0) return null;
  const doc = range.startContainer.ownerDocument;
  if (!doc) return null;
  const common = range.commonAncestorContainer;
  const texts: Text[] = [];
  if (common.nodeType === Node.TEXT_NODE) {
    texts.push(common as Text);
  } else {
    const walker = doc.createTreeWalker(common, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (range.intersectsNode(node)) texts.push(node as Text);
    }
  }
  const style = declarations(css, true);
  const before = snapshotSelection(doc);
  const records: Array<{ text: Text; data: string; copies: Node[] }> = [];
  for (const text of texts) {
    const parent = text.parentNode;
    if (!parent) continue;
    const data = text.data;
    const start = text === range.startContainer ? range.startOffset : 0;
    const end = text === range.endContainer ? range.endOffset : data.length;
    if (end <= start) continue;
    const copies: Node[] = [];
    if (start > 0) copies.push(doc.createTextNode(data.slice(0, start)));
    const marked = doc.createElement("span");
    marked.setAttribute(OFFICE_FORMAT_PREVIEW_ATTRIBUTE, "range");
    marked.setAttribute("style", style);
    marked.textContent = data.slice(start, end);
    copies.push(marked);
    if (end < data.length) copies.push(doc.createTextNode(data.slice(end)));
    for (const copy of copies) parent.insertBefore(copy, text);
    text.data = "";
    records.push({ text, data, copies });
  }
  if (records.length === 0) return null;
  const during = snapshotSelection(doc);
  return () => {
    for (const { text, data, copies } of records) {
      for (const copy of copies) copy.parentNode?.removeChild(copy);
      // A render that rewrote the node meanwhile owns its text now.
      if (text.data === "") text.data = data;
    }
    const after = snapshotSelection(doc);
    // Putting a selection back inside an editable region focuses that region
    // (Chrome): a field whose words are previewed from a menu or a dialog
    // keeps the keyboard there; the field's own record of its range (held
    // for the chrome) is what the pick formats, not the browser's selection.
    const editable = before?.anchorNode.parentElement?.closest<HTMLElement>(
      '[contenteditable="true"], [contenteditable=""]',
    );
    const editableFocused =
      !editable || (!!doc.activeElement && editable.contains(doc.activeElement));
    if (before && editableFocused && sameSnapshot(after, during)) {
      try {
        if (before.anchorNode.isConnected && before.focusNode.isConnected) {
          doc
            .getSelection()
            ?.setBaseAndExtent(
              before.anchorNode,
              before.anchorOffset,
              before.focusNode,
              before.focusOffset,
            );
        }
      } catch {
        // An offset past a node rewritten meanwhile: leave the selection.
      }
    }
  };
}

/** A plain `<input>` / `<textarea>` entry (no runs of its own). */
export type OfficeFormatPreviewField = HTMLInputElement | HTMLTextAreaElement;

const FIELD_MIRROR_PROPERTIES = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "font-stretch",
  "letter-spacing",
  "word-spacing",
  "text-transform",
  "text-indent",
  "text-align",
  "direction",
  "line-height",
  "color",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "box-sizing",
] as const;

/**
 * Previews `css` on the characters `start..end` of a plain input or text
 * area, which cannot style part of its own text: a mirror of the field's
 * text is laid over it (same font, padding, alignment and scroll), the
 * selected characters wearing the preview, and the field's own glyphs are
 * made transparent meanwhile (its caret and selection highlight stay). The
 * restore removes the mirror and gives the field its glyphs back.
 */
export function officePreviewFieldRange(
  field: OfficeFormatPreviewField,
  start: number,
  end: number,
  css: Record<string, string>,
): OfficeFormatPreviewRestore | null {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(field.value.length, Math.max(start, end));
  if (to <= from || Object.keys(css).length === 0 || !field.isConnected) return null;
  const doc = field.ownerDocument;
  const view = doc.defaultView;
  if (!view) return null;
  const computed = view.getComputedStyle(field);
  const parent = field.parentElement;
  const inParent = parent !== null && field.offsetParent === parent;
  const host = inParent ? parent : doc.body;
  if (!host) return null;

  const mirror = doc.createElement("div");
  mirror.setAttribute(OFFICE_FORMAT_PREVIEW_ATTRIBUTE, "field");
  mirror.setAttribute("aria-hidden", "true");
  const frame: Record<string, string> = {
    position: inParent ? "absolute" : "fixed",
    "pointer-events": "none",
    overflow: "hidden",
    margin: "0",
    "z-index": inParent ? "1" : "2147483646",
    background: "transparent",
    display: "flex",
    "flex-direction": "column",
    "justify-content": field instanceof HTMLTextAreaElement ? "flex-start" : "center",
    "white-space": field instanceof HTMLTextAreaElement ? "pre-wrap" : "pre",
    "overflow-wrap": field instanceof HTMLTextAreaElement ? "break-word" : "normal",
  };
  if (inParent) {
    // as drawn, in the parent's own CSS pixels: under stacked zooms (the
    // ribbon in Touch mode, the page zoomed) WebKit answers offsets already
    // zoomed (lib/glide-geometry)
    const box = boxWithin(field, parent as HTMLElement);
    frame.left = `${box.x}px`;
    frame.top = `${box.y}px`;
    frame.width = `${box.width}px`;
    frame.height = `${box.height}px`;
  } else {
    const rect = field.getBoundingClientRect();
    frame.left = `${rect.left}px`;
    frame.top = `${rect.top}px`;
    frame.width = `${rect.width}px`;
    frame.height = `${rect.height}px`;
  }
  for (const property of FIELD_MIRROR_PROPERTIES) {
    const value = computed.getPropertyValue(property);
    if (value) frame[property] = value;
  }
  // The field's border only reserves space here; the mirror draws none.
  frame["border-style"] = "solid";
  frame["border-color"] = "transparent";
  mirror.setAttribute(
    "style",
    Object.entries(frame)
      .map(([name, value]) => `${name}: ${value};`)
      .join(" "),
  );

  const line = doc.createElement("div");
  line.setAttribute(
    "style",
    `transform: translate(${-field.scrollLeft}px, ${-field.scrollTop}px); min-width: 0; width: 100%;`,
  );
  const text = field.value;
  if (from > 0) line.appendChild(doc.createTextNode(text.slice(0, from)));
  const marked = doc.createElement("span");
  marked.setAttribute(OFFICE_FORMAT_PREVIEW_ATTRIBUTE, "range");
  marked.setAttribute("style", declarations(css, true));
  marked.textContent = text.slice(from, to);
  line.appendChild(marked);
  if (to < text.length) line.appendChild(doc.createTextNode(text.slice(to)));
  mirror.appendChild(line);

  const fillBefore = field.style.getPropertyValue("-webkit-text-fill-color");
  const fillPriority = field.style.getPropertyPriority("-webkit-text-fill-color");
  field.style.setProperty("-webkit-text-fill-color", "transparent", "important");
  host.appendChild(mirror);
  return () => {
    mirror.remove();
    if (fillBefore) {
      field.style.setProperty("-webkit-text-fill-color", fillBefore, fillPriority);
    } else {
      field.style.removeProperty("-webkit-text-fill-color");
    }
  };
}

/** Whether `element` is a plain input or text area entry. */
export function officeIsPreviewField(element: unknown): element is OfficeFormatPreviewField {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

/**
 * The shared shape text field being typed in (OfficeShapeTextField: a deck,
 * Docs or worksheet shape, a SmartArt member): its highlighted characters
 * preview, its own selection kept over the wrapped words and put back after;
 * a caret previews nothing. Null when there is nothing to preview.
 */
export function officePreviewShapeTextField(
  field: HTMLElement & {
    selectionStart?: number;
    selectionEnd?: number;
    setSelectionRange?: (start: number, end: number) => void;
  },
  css: Parameters<typeof officePreviewTextRange>[1],
): OfficeFormatPreviewRestore | null {
  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? start;
  if (end <= start) return null;
  const range = officeTextOffsetsRange(field, start, end);
  const restorePreview = range ? officePreviewTextRange(range, css) : null;
  if (!restorePreview) return null;
  // Wrapping the previewed characters rewrites the field's text nodes and
  // the browser collapses the selection as it does; the field's own
  // selection is put back over the wrapped words, and again once unwrapped.
  field.setSelectionRange?.(start, end);
  return () => {
    restorePreview();
    field.setSelectionRange?.(start, end);
  };
}

/** Composes several restores (e.g. a text range plus the editor chrome). */
export function officeComposePreviewRestores(
  restores: ReadonlyArray<OfficeFormatPreviewRestore | null | undefined | void>,
): OfficeFormatPreviewRestore | null {
  const live = restores.filter(
    (restore): restore is OfficeFormatPreviewRestore => typeof restore === "function",
  );
  if (live.length === 0) return null;
  return () => {
    for (const restore of [...live].reverse()) restore();
  };
}

/**
 * While a preview shows, the held selection a text box paints over itself comes
 * off: it is a mirror of the words at their own size, and it stood at that size
 * around words the preview had made larger or smaller.
 */
function officeMarkPreviewing(on: boolean): void {
  if (typeof document === "undefined") return;
  if (on && !document.getElementById("office-format-previewing-sheet")) {
    const sheet = document.createElement("style");
    sheet.id = "office-format-previewing-sheet";
    sheet.textContent = `html[data-office-format-previewing] [${OFFICE_INACTIVE_SELECTION_ATTRIBUTE}] { visibility: hidden !important; }`;
    document.head.appendChild(sheet);
  }
  document.documentElement.toggleAttribute("data-office-format-previewing", on);
}

type OfficeFormatPreviewController = Readonly<{
  preview: (owner: symbol, patch: OfficeFormatPreviewPatch) => void;
  clear: (owner?: symbol) => void;
}>;

const OfficeFormatPreviewContext =
  createContext<OfficeFormatPreviewController | null>(null);

function officeFormatPreviewPatchesEqual(a: OfficeFormatPreviewPatch, b: OfficeFormatPreviewPatch): boolean {
  const keys = Object.keys(a) as Array<keyof OfficeFormatPreviewPatch>;
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 * Hosts Live Preview for one editor. `adapter` may change every render; the
 * latest one is used. Without a provider the shared controls do nothing on
 * hover, as before.
 */
export function OfficeFormatPreviewProvider({
  adapter,
  children,
}: {
  adapter: OfficeFormatPreviewAdapter | null | undefined;
  children: ReactNode;
}) {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const activeRef = useRef<{
    owner: symbol;
    patch: OfficeFormatPreviewPatch;
    restore: OfficeFormatPreviewRestore;
  } | null>(null);

  const controller = useMemo<OfficeFormatPreviewController>(() => {
    const clear = (owner?: symbol) => {
      const active = activeRef.current;
      if (!active || (owner && active.owner !== owner)) return;
      activeRef.current = null;
      officeMarkPreviewing(false);
      try {
        active.restore();
      } catch {
        // A restore must never take the editor down with it.
      }
    };
    return {
      clear,
      preview: (owner, patch) => {
        // A menu row is entered and focused by one move of the pointer: the
        // same look shown twice cost the grid a second render of the window.
        const shown = activeRef.current;
        if (shown?.owner === owner && officeFormatPreviewPatchesEqual(shown.patch, patch)) return;
        clear();
        const apply = adapterRef.current;
        if (!apply) return;
        let restore: OfficeFormatPreviewRestore | null | undefined | void;
        try {
          restore = apply(patch);
        } catch {
          restore = null;
        }
        if (typeof restore === "function") {
          activeRef.current = { owner, patch, restore };
          officeMarkPreviewing(true);
        }
      },
    };
  }, []);

  // The caret over WordArt (every editor hosts this provider): one colour,
  // never filtered (`office-painted-caret.ts`).
  useEffect(() => (typeof document === "undefined" ? undefined : installOfficePaintedCaret(document)), []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    // A press or a committing key anywhere ends the preview before the
    // control (or the editor) handles it.
    const end = () => controller.clear();
    // A choice in a list or a menu (a size, a font, a gallery style) commits
    // on its click: the preview stays until that click and ends in its
    // capture phase, just before the choice's own handler runs. The restore
    // and the commit then land in one event, so the words never show their
    
    // flashed back to the old size for a frame). A ribbon button commits on
    // its mouse-down, in the same task as this press, so it ends at once as
    // before; and a press that ends without a click ends it then.
    let pendingPress: (() => void) | null = null;
    const onPointerDown = (event: Event) => {
      pendingPress?.();
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(PREVIEW_CHOICE_SELECTOR)) {
        end();
        return;
      }
      let done = false;
      let timer = 0;
      const finish = () => {
        if (done) return;
        done = true;
        pendingPress = null;
        window.clearTimeout(timer);
        document.removeEventListener("click", finish, true);
        document.removeEventListener("pointerup", afterUp, true);
        document.removeEventListener("pointercancel", finish, true);
        end();
      };
      // The click follows its pointerup in the same task; a timer after the
      // pointerup only fires when no click came.
      const afterUp = () => {
        timer = window.setTimeout(finish, 0);
      };
      pendingPress = finish;
      document.addEventListener("click", finish, true);
      document.addEventListener("pointerup", afterUp, true);
      document.addEventListener("pointercancel", finish, true);
    };
    // Moving through a list keeps previewing; any other key (typing,
    // Enter, Escape, a shortcut) ends the preview first.
    const onKey = (event: KeyboardEvent) => {
      if (!PREVIEW_NAVIGATION_KEYS.has(event.key)) end();
    };
    // Focus reaching anything that is not a formatting control (the text
    // being edited, the canvas) ends it too: a preview never outlives the
    // control that showed it, even when that control unmounts late.
    const onFocusIn = (event: Event) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        !target.closest(`[${OFFICE_TEXT_FORMAT_CONTROL_ATTRIBUTE}]`)
      ) {
        end();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("blur", end);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      pendingPress?.();
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("blur", end);
      controller.clear();
    };
  }, [controller]);

  return (
    <OfficeFormatPreviewContext.Provider value={controller}>
      {children}
    </OfficeFormatPreviewContext.Provider>
  );
}

export type OfficeFormatPreviewApi = Readonly<{
  /** True when an editor hosts Live Preview around this control. */
  available: boolean;
  preview: (patch: OfficeFormatPreviewPatch | null | undefined) => void;
  clearPreview: () => void;
}>;

/**
 * A shared control's handle on Live Preview. Clears what it started when it
 * unmounts (a menu closing, a palette dismissed).
 */
export function useOfficeFormatPreview(): OfficeFormatPreviewApi {
  const controller = useContext(OfficeFormatPreviewContext);
  const ownerRef = useRef<symbol>(Symbol("office-format-preview"));
  const preview = useCallback(
    (patch: OfficeFormatPreviewPatch | null | undefined) => {
      if (!controller) return;
      if (!patch) {
        controller.clear(ownerRef.current);
        return;
      }
      controller.preview(ownerRef.current, patch);
    },
    [controller],
  );
  const clearPreview = useCallback(() => {
    controller?.clear(ownerRef.current);
  }, [controller]);
  useEffect(() => {
    const owner = ownerRef.current;
    return () => controller?.clear(owner);
  }, [controller]);
  return useMemo(
    () => ({ available: controller !== null, preview, clearPreview }),
    [controller, preview, clearPreview],
  );
}

/** Where the pointer last went down, until it next moves. */
let restingPointerPress: Readonly<{ x: number; y: number }> | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (event) => {
    if (event.isTrusted) restingPointerPress = { x: event.clientX, y: event.clientY };
  }, true);
  window.addEventListener("pointermove", (event) => {
    if (restingPointerPress && event.isTrusted &&
      (event.clientX !== restingPointerPress.x || event.clientY !== restingPointerPress.y)) restingPointerPress = null;
  }, true);
}








function enteredUnderRestingPointer(event: Event): boolean {
  // (React reads an enter from the native over or out under the pointer.)
  if (!restingPointerPress || !event.isTrusted || !/^(pointer|mouse)(enter|over|out|move)$/.test(event.type)) return false;
  const point = event as Event & { clientX?: number; clientY?: number };
  return point.clientX === restingPointerPress.x && point.clientY === restingPointerPress.y;
}

/**
 * True when a pointer "entering" a preview control is a finger (or a pen on
 * a device that cannot hover), not a hover: a finger's pointerenter is a
 * press or a scroll passing over the row, and a tap's compatibility
 * mouseenter comes just before its click. Live Preview follows a hovering
 * pointer only ("rest the pointer on a choice"), so every hover-preview
 * surface (this module's handlers, the colour palette, the picture,
 * artistic-effect, chart-colour and style galleries) asks this one gate,
 * and a finger scrolling a menu never leaves a preview behind. Takes a React
 * pointer or mouse event (or a DOM one).
 */
export function officePreviewIgnoresPointer(
  event: { pointerType?: string; nativeEvent?: Event } | Event,
): boolean {
  const entered = "nativeEvent" in event && event.nativeEvent ? event.nativeEvent : event;
  if (typeof Event !== "undefined" && entered instanceof Event && enteredUnderRestingPointer(entered)) return true;
  const pointerType = "pointerType" in event ? event.pointerType : undefined;
  if (typeof pointerType === "string" && pointerType !== "") {
    return isTouchLikePointer({ pointerType });
  }
  const native = "nativeEvent" in event && event.nativeEvent ? event.nativeEvent : event;
  return typeof Event !== "undefined" && native instanceof Event && isCompatMouseFromTouch(native);
}

/**
 * Event props that preview `patch` while a control is hovered or focused
 * (keyboard travel through a list previews too) and clear on leave / blur.
 */
export function officeFormatPreviewHandlers(
  api: OfficeFormatPreviewApi,
  patch: OfficeFormatPreviewPatch | null | undefined,
  /** False once the control's menu has closed (its rows may still be
   * animating out under the pointer): no preview then. */
  isLive: () => boolean = () => true,
): {
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
} {
  if (!api.available || !patch) return {};
  return {
    onPointerEnter: (event) => {
      if (officePreviewIgnoresPointer(event) || !isLive()) return;
      api.preview(patch);
    },
    onPointerLeave: () => api.clearPreview(),
    onFocus: (event) => {
      // A menu row is focused by the pointer and the arrow keys alike; a
      // button only previews when the keyboard brought focus to it.
      const target = event.currentTarget;
      let keyboard = false;
      try {
        keyboard = target.matches(":focus-visible");
      } catch {
        keyboard = false;
      }
      if (!isLive()) return;
      if (keyboard || target.closest('[role="menu"],[role="listbox"]')) {
        api.preview(patch);
      }
    },
    onBlur: (event) => {
      // Focus moving on down the same list: the row it reaches shows its own
      // preview, and the pointer may already have shown it.
      const list = event.currentTarget.closest('[role="menu"],[role="listbox"]');
      const next = event.relatedTarget;
      if (list && next instanceof Element && list.contains(next)) return;
      api.clearPreview();
    },
  };
}
