"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { cachedComputedStyle } from "../../../../lib/computed-style-cache";
import { mergeAttributes } from "@tiptap/core";
import { Italic } from "@tiptap/extension-italic";
import type { Mark as PmMark } from "@tiptap/pm/model";
import { isTextBearingInlineAtom } from "./inlineAtomText";
import {
  equationLatexWithLetterFormat,
  equationLettersFormatState,
} from "../../../../lib/office-equation-letter-format";

/** An equation (inline or display), whose letters Italic toggles. */
const EQUATION_NODE_NAMES: ReadonlySet<string> = new Set(["inlineMath", "mathBlock"]);

function isEquationNode(node: { type: { name: string }; attrs: Record<string, unknown> }): boolean {
  return EQUATION_NODE_NAMES.has(node.type.name) && typeof node.attrs.latex === "string";
}
import { Plugin, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { patchTopLevelDecorations } from "./topLevelDecorationPatch";









/** Absence and explicit null inherit; a legacy bare italic mark remains on.
 * False is Word's direct w:i w:val="0", not removal of formatting. */
export function directItalicValue(marks: readonly PmMark[]): boolean | null {
  const mark = marks.find((item) => item.type.name === "italic");
  return mark && mark.attrs.value !== null ? mark.attrs.value !== false : null;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** The built-in character styles that slant their text. */
const ITALIC_BUILTIN_CHARACTER_STYLES = new Set([
  "emphasis",
  "intenseEmphasis",
  "subtleEmphasis",
  "bookTitle",
]);

/** Word toggle properties resolve within each style chain, then character
 * formatting takes precedence over paragraph formatting. No CSS is persisted. */
export function inheritedItalicValue(
  docAttrs: Record<string, unknown>,
  block: { type: { name: string }; attrs: Record<string, unknown> },
  marks: readonly PmMark[],
  inTable = false,
): boolean | null {
  const definitions = record(docAttrs.styleDefinitions);
  const rows =
    definitions?.version === 1 &&
    Array.isArray(definitions.styles) &&
    definitions.styles.length <= 512
      ? definitions.styles
      : [];
  const styles = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const style = record(row);
    if (!style || typeof style.styleId !== "string" || styles.has(style.styleId)) return null;
    styles.set(style.styleId, style);
  }
  const chain = (id: unknown, type: string): { known: boolean; value: boolean | null } => {
    if (typeof id !== "string" || !styles.has(id)) return { known: false, value: null };
    const seen = new Set<string>();
    const inherited: Record<string, unknown>[] = [];
    let current: string | null = id;
    while (current) {
      if (seen.has(current) || seen.size >= 512) return { known: false, value: null };
      seen.add(current);
      const style = styles.get(current);
      if (!style || style.type !== type) return { known: false, value: null };
      inherited.unshift(style);
      current = typeof style.basedOn === "string" ? style.basedOn : null;
    }
    let value = false;
    let specified = false;
    for (const style of inherited) {
      const italic = record(style.rPr)?.italic;
      if (italic === true) {
        value = !value;
        specified = true;
      } else if (italic != null && italic !== false) return { known: false, value: null };
    }
    return { known: true, value: specified ? value : null };
  };
  const character = marks.find((mark) => mark.type.name === "characterStyle");
  const char = chain(character?.attrs.styleId, "character");
  if (char.value !== null) return char.value;
  // The editor's own gallery styles (Emphasis, Intense Emphasis, Subtle
  // Emphasis, Book Title) slant their text through their CSS.
  const galleryName = character?.attrs.name;
  if (
    character &&
    !(typeof character.attrs.styleId === "string" && styles.has(character.attrs.styleId)) &&
    typeof galleryName === "string" &&
    ITALIC_BUILTIN_CHARACTER_STYLES.has(galleryName)
  ) {
    return true;
  }
  const styleId =
    block.attrs.docxStyleId ??
    block.attrs.customStyleId ??
    (block.type.name === "heading" ? `Heading${block.attrs.level ?? 1}` : null);
  const paragraph = chain(styleId, "paragraph");
  if (paragraph.value !== null) return paragraph.value;
  const named = Array.isArray(docAttrs.namedStyles) ? docAttrs.namedStyles : [];
  const palette = named
    .map(record)
    .find(
      (style) =>
        style &&
        (styleId
          ? style.styleId === styleId
          : block.attrs.customStyleName && style.name === block.attrs.customStyleName),
    );
  if (typeof palette?.italic === "boolean") return palette.italic;
  if (inTable) return null;
  const defaultItalic = record(record(definitions?.docDefaults)?.rPr)?.italic;
  if (typeof defaultItalic === "boolean") return defaultItalic;
  return paragraph.known ? false : null;
}

const emptyStyleContext = {};
const inheritedCache = new WeakMap<
  object,
  WeakMap<object, WeakMap<object, Map<string, boolean | null>>>
>();

function inheritedAt(
  state: Pick<EditorState, "doc">,
  position: number,
  marks: readonly PmMark[],
): boolean | null {
  const resolved = state.doc.resolve(Math.max(0, Math.min(position, state.doc.content.size)));
  let block: ReturnType<typeof resolved.node> | null = null;
  let inTable = false;
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (!block && node.isTextblock) block = node;
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") inTable = true;
  }
  if (!block) return null;
  return inheritedForBlock(state, block, inTable, marks);
}

/** The same for a text block already in hand (a walk of the document): no
 * position resolved (each resolve walks the book's pages from the root, and
 * a page's decorations, rebuilt on every keystroke, asked one per block). */
function inheritedForBlock(
  state: Pick<EditorState, "doc">,
  block: ProseMirrorNode,
  inTable: boolean,
  marks: readonly PmMark[],
): boolean | null {
  const definitionKey = record(state.doc.attrs.styleDefinitions) ?? emptyStyleContext;
  const paletteKey = Array.isArray(state.doc.attrs.namedStyles)
    ? state.doc.attrs.namedStyles
    : emptyStyleContext;
  let palettes = inheritedCache.get(definitionKey);
  if (!palettes) {
    palettes = new WeakMap();
    inheritedCache.set(definitionKey, palettes);
  }
  let blocks = palettes.get(paletteKey);
  if (!blocks) {
    blocks = new WeakMap();
    palettes.set(paletteKey, blocks);
  }
  let values = blocks.get(block);
  if (!values) {
    values = new Map();
    blocks.set(block, values);
  }
  const character = marks.find((mark) => mark.type.name === "characterStyle");
  const key = JSON.stringify([inTable, character?.attrs.styleId, character?.attrs.name]);
  if (values.has(key)) return values.get(key) ?? null;
  const value = inheritedItalicValue(state.doc.attrs, block, marks, inTable);
  values.set(key, value);
  return value;
}

export function effectiveItalicAt(
  state: Pick<EditorState, "doc">,
  position: number,
  marks: readonly PmMark[],
  view?: EditorView,
): boolean {
  const direct = directItalicValue(marks);
  if (direct !== null) return direct;
  const inherited = inheritedAt(state, position, marks);
  if (inherited !== null) return inherited;
  if (
    view?.state.doc === state.doc &&
    view.dom.isConnected &&
    !view.dom.hasAttribute("data-pagination-initial-settling")
  ) {
    const point = view.domAtPos(position);
    let node: Node = point.node;
    if (node.nodeType === 1) node = node.childNodes[point.offset] ?? node;
    while (node.nodeType === 1 && node.firstChild) node = node.firstChild;
    const element = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    if (element) {
      const slant = cachedComputedStyle(element, "font-style");
      return slant === "italic" || slant === "oblique";
    }
  }
  return false;
}

/**
 * Whether the run at `position` would be italic WITHOUT its direct italic:
 * its character style, its paragraph style or the document defaults. A
 * character style counts as italic when unknown, so turning italic off there
 * keeps the explicit off rather than guessing.
 */
function styleMakesItalic(
  state: EditorState,
  position: number,
  marks: readonly PmMark[],
  view?: EditorView,
): boolean {
  const inherited = inheritedAt(state, position, marks);
  if (inherited !== null) return inherited;
  if (marks.some((mark) => mark.type.name === "characterStyle")) return true;
  const resolved = state.doc.resolve(Math.max(0, Math.min(position, state.doc.content.size)));
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (!node.isTextblock) continue;
    if (view?.state.doc === state.doc && view.dom.isConnected) {
      const block = view.nodeDOM(resolved.before(depth));
      if (block instanceof HTMLElement) {
        const slant = cachedComputedStyle(block, "font-style");
        if (slant === "italic" || slant === "oblique") return true;
      }
    }
    return false;
  }
  return false;
}

export function isItalicSelection(state: EditorState, view?: EditorView): boolean {
  const selection = state.selection;
  if (selection.empty) {
    return effectiveItalicAt(
      state,
      selection.from,
      state.storedMarks ?? selection.$from.marks(),
      view,
    );
  }
  // Every range (a table selection's from/to are only its active cell:
  
  
  let seen = false;
  let all = true;
  for (const range of selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, position) => {
      // Office Math: an equation reads italic while every letter in it is
      // math italic (an equation without letters never holds Italic off).
      if (isEquationNode(node)) {
        seen = true;
        all &&= equationLettersFormatState(node.attrs.latex as string, "italic") ?? true;
        return false;
      }
      if (!node.isText && !isTextBearingInlineAtom(node)) return;
      seen = true;
      all &&= effectiveItalicAt(state, position, node.marks, view);
    });
  }
  return seen && all;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentItalicValue: {
      /** null clears the direct override and restores style inheritance. */
      setItalicValue: (value: boolean | null) => ReturnType;
      





      setItalicOff: () => ReturnType;
    };
  }
}

export const DocumentItalic = Italic.extend({
  priority: 90,
  // Word's "*Bold* and _italic_ with real formatting" is AutoCorrect's own
  // rule (autoCorrectExtension.ts), on its AutoFormat As You Type box:
  // *text* is bold there, never Markdown's italic.
  addInputRules() {
    return [];
  },
  addAttributes() {
    return { value: { default: undefined, rendered: false } };
  },
  parseHTML() {
    return [
      { tag: '[data-italic-value="inherit"]', getAttrs: () => ({ value: null }) },
      { tag: '[data-italic-value="false"]', getAttrs: () => ({ value: false }) },
      { tag: '[data-italic-value="true"]', getAttrs: () => ({ value: true }) },
      { tag: "em", getAttrs: () => ({ value: true }) },
      {
        tag: "i",
        getAttrs: (element) => (element.style.fontStyle !== "normal" ? { value: true } : false),
      },
      {
        style: "font-style",
        getAttrs: (value) => {
          if (value === "normal") return { value: false };
          return value === "italic" || value === "oblique" ? { value: true } : false;
        },
      },
    ];
  },
  renderHTML({ mark, HTMLAttributes }) {
    const value = mark.attrs.value;
    return [
      value === false || value === null ? "span" : "em",
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        value === undefined
          ? {}
          : { "data-italic-value": value === null ? "inherit" : String(value) },
        value === false
          ? { style: "font-style:normal" }
          : value === null
            ? { style: "font-style:inherit" }
            : {},
      ),
      0,
    ];
  },
  addProseMirrorPlugins() {
    const cache = new WeakMap<object, DecorationSet>();
    let last: { doc: ProseMirrorNode; set: DecorationSet } | null = null;
    return [
      new Plugin({
        props: {
          decorations(state) {
            const existing = cache.get(state.doc);
            if (existing) return existing;
            const build = (from: number, to: number) => {
              const decorations: Decoration[] = [];
              // The cells the walk is inside, by their end: whether a block is
              // in a table, without resolving its position.
              const cellEnds: number[] = [];
              state.doc.nodesBetween(from, to, (block, pos) => {
                while (cellEnds.length && cellEnds[cellEnds.length - 1]! <= pos) cellEnds.pop();
                if (block.type.name === "tableCell" || block.type.name === "tableHeader") cellEnds.push(pos + block.nodeSize);
                if (!block.isTextblock) return true;
                const inTable = cellEnds.length > 0;
                const inherited = inheritedForBlock(state, block, inTable, []);
                if (inherited !== null) {
                  decorations.push(
                    Decoration.node(pos, pos + block.nodeSize, {
                      class: "docs-inherited-italic",
                      style: `--docs-inherited-italic-style:${inherited ? "italic" : "normal"}`,
                    }),
                  );
                }
                block.descendants((node, offset) => {
                  if (
                    !node.isText ||
                    directItalicValue(node.marks) !== null ||
                    !node.marks.some((mark) => mark.type.name === "characterStyle")
                  )
                    return;
                  const value = inheritedForBlock(state, block, inTable, node.marks);
                  if (value !== null && value !== inherited) {
                    decorations.push(
                      Decoration.inline(pos + 1 + offset, pos + 1 + offset + node.nodeSize, {
                        class: "docs-inherited-italic",
                        style: `--docs-inherited-italic-style:${value ? "italic" : "normal"}`,
                      }),
                    );
                  }
                });
                return false;
              });
              return decorations;
            };
            // A text block's inherited look is its own and its styles':
            // an edit rebuilds the top-level blocks it replaced.
            const result = last
              ? patchTopLevelDecorations(last.doc, last.set, state.doc, build, { readsDocAttrs: true })
              : DecorationSet.create(state.doc, [...build(0, state.doc.content.size)]);
            last = { doc: state.doc, set: result };
            cache.set(state.doc, result);
            return result;
          },
        },
      }),
    ];
  },
  addCommands() {
    return {
      setItalic:
        () =>
        ({ commands }) =>
          commands.setMark(this.name, { value: true }),
      unsetItalic:
        () =>
        ({ commands }) =>
          commands.setMark(this.name, { value: null }),
      setItalicValue:
        (value) =>
        ({ commands }) =>
          value === null
            ? commands.setMark(this.name, { value: null })
            : typeof value === "boolean" && commands.setMark(this.name, { value }),
      setItalicOff:
        () =>
        ({ state, tr, dispatch, commands }) => {
          // Turning italic off: an explicit off (`w:i w:val="0"`) only where
          // the style would slant the run; elsewhere the run just loses its
          // direct italic, so a slanted style applied later still shows.
          const type = this.type;
          const view = this.editor.view;
          const styleItalic = (position: number, marks: readonly PmMark[]) =>
            styleMakesItalic(state, position, marks, view);
          if (state.selection.empty) {
            const marks = state.storedMarks ?? state.selection.$from.marks();
            if (styleItalic(state.selection.from, marks)) {
              return commands.setMark(this.name, { value: false });
            }
            if (dispatch) tr.setStoredMarks(type.removeFromSet(marks));
            return true;
          }
          if (dispatch) {
            for (const range of state.selection.ranges) {
              const from = range.$from.pos;
              const to = range.$to.pos;
              state.doc.nodesBetween(from, to, (node, position) => {
                if (!node.isText && !isTextBearingInlineAtom(node)) return;
                const start = Math.max(position, from);
                const end = Math.min(position + node.nodeSize, to);
                tr.removeMark(start, end, type);
                if (styleItalic(position, node.marks)) {
                  tr.addMark(start, end, type.create({ value: false }));
                }
              });
            }
          }
          return true;
        },
      toggleItalic:
        () =>
        ({ state, tr, dispatch, commands }) => {
          const on = isItalicSelection(state, this.editor.view);
          const applied = on ? commands.setItalicOff() : commands.setMark(this.name, { value: true });
          // An equation in the selection takes Italic on its letters (math
          // italic / upright), as Office Math does, never as a slanting mark:
          
          // equation but not by selecting the equation in the text.
          if (dispatch && !state.selection.empty) {
            for (const range of state.selection.ranges) {
              state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, position) => {
                if (!isEquationNode(node)) return;
                const latex = node.attrs.latex as string;
                const next = equationLatexWithLetterFormat(latex, "italic", !on);
                if (next !== latex) tr.setNodeAttribute(position, "latex", next);
                if (node.isInline) tr.removeMark(position, position + node.nodeSize, this.type);
                return false;
              });
            }
          }
          return applied;
        },
    };
  },
});
