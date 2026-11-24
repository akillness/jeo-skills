"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { cachedComputedStyle } from "../../../../lib/computed-style-cache";
import { markPasteRule, mergeAttributes } from "@tiptap/core";
import {
  Bold,
  starPasteRegex,
  underscorePasteRegex,
} from "@tiptap/extension-bold";
import type { Mark as PmMark } from "@tiptap/pm/model";
import { isTextBearingInlineAtom } from "./inlineAtomText";
import { documentEquationFormatOn, isDocumentEquationNode, settleSelectedEquations } from "./equationNodeFormat";
import { Plugin, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { patchTopLevelDecorations } from "./topLevelDecorationPatch";

/** Absence and explicit null inherit; a legacy bare bold mark remains on.
 * False is Word's direct w:b w:val="0", not removal of formatting. */
export function directBoldValue(marks: readonly PmMark[]): boolean | null {
  const mark = marks.find((item) => item.type.name === "bold");
  return mark && mark.attrs.value !== null ? mark.attrs.value !== false : null;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Word toggle properties resolve within each style chain, then character
 * formatting takes precedence over paragraph formatting. No CSS is persisted. */
export function inheritedBoldValue(
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
    if (
      !style ||
      typeof style.styleId !== "string" ||
      styles.has(style.styleId)
    )
      return null;
    styles.set(style.styleId, style);
  }
  const chain = (
    id: unknown,
    type: string,
  ): { known: boolean; value: boolean | null } => {
    if (typeof id !== "string" || !styles.has(id))
      return { known: false, value: null };
    const seen = new Set<string>(),
      inherited: Record<string, unknown>[] = [];
    let current: string | null = id;
    while (current) {
      if (seen.has(current) || seen.size >= 512)
        return { known: false, value: null };
      seen.add(current);
      const style = styles.get(current);
      if (!style || style.type !== type) return { known: false, value: null };
      inherited.unshift(style);
      current = typeof style.basedOn === "string" ? style.basedOn : null;
    }
    // The nearest style that states bold decides, on or off (Word 16.86: a
    // child stating w:b under a bold parent is bold, w:b w:val="0" is not;
    // a style hierarchy does not toggle). The reader resolves it the same way.
    let value: boolean | null = null;
    for (const style of inherited) {
      const bold = record(style.rPr)?.bold;
      if (bold === true || bold === false) value = bold;
      else if (bold != null) return { known: false, value: null };
    }
    return { known: true, value };
  };
  const character = marks.find((mark) => mark.type.name === "characterStyle");
  const char = chain(character?.attrs.styleId, "character");
  if (char.value !== null) return char.value;
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
          : block.attrs.customStyleName &&
            style.name === block.attrs.customStyleName),
    );
  if (typeof palette?.bold === "boolean") return palette.bold;
  // Table conditional formatting has its own inherited context. Let its
  // existing cell renderer supply that context when neither style overrides it.
  if (inTable) return null;
  const defaultBold = record(record(definitions?.docDefaults)?.rPr)?.bold;
  if (typeof defaultBold === "boolean") return defaultBold;
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
  const resolved = state.doc.resolve(
    Math.max(0, Math.min(position, state.doc.content.size)),
  );
  let block: ReturnType<typeof resolved.node> | null = null,
    inTable = false;
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (!block && node.isTextblock) block = node;
    if (node.type.name === "tableCell" || node.type.name === "tableHeader")
      inTable = true;
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
  const definitionKey =
    record(state.doc.attrs.styleDefinitions) ?? emptyStyleContext;
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
  const key = JSON.stringify([
    inTable,
    character?.attrs.styleId,
    character?.attrs.name,
  ]);
  if (values.has(key)) return values.get(key) ?? null;
  const value = inheritedBoldValue(state.doc.attrs, block, marks, inTable);
  values.set(key, value);
  return value;
}

export function effectiveBoldAt(
  state: Pick<EditorState, "doc">,
  position: number,
  marks: readonly PmMark[],
  view?: EditorView,
): boolean {
  const direct = directBoldValue(marks);
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
    let element =
      node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    while (element) {
      const weight = cachedComputedStyle(element, "font-weight");
      if (weight === "bold" || weight === "bolder") return true;
      if (Number.isFinite(Number.parseFloat(weight)))
        return Number.parseFloat(weight) >= 600;
      if (weight !== "inherit") break;
      element = element.parentElement;
    }
  }
  const resolved = state.doc.resolve(
    Math.max(0, Math.min(position, state.doc.content.size)),
  );
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.isTextblock) return node.type.name === "heading";
  }
  return false;
}

/**
 * Whether the run at `position` would be bold WITHOUT its direct bold: its
 * character style, its paragraph style or the document defaults. Unknown
 * counts as bold (a character style, a heading, a paragraph drawn bold), so
 * turning bold off there keeps the explicit off rather than guessing.
 */
function styleMakesBold(
  state: EditorState,
  position: number,
  marks: readonly PmMark[],
  view?: EditorView,
): boolean {
  const inherited = inheritedAt(state, position, marks);
  if (inherited !== null) return inherited;
  if (marks.some((mark) => mark.type.name === "characterStyle")) return true;
  const resolved = state.doc.resolve(
    Math.max(0, Math.min(position, state.doc.content.size)),
  );
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (!node.isTextblock) continue;
    if (node.type.name === "heading") return true;
    // The paragraph's own weight is its style's; the direct bold sits on the
    // runs inside it.
    if (view?.state.doc === state.doc && view.dom.isConnected) {
      const block = view.nodeDOM(resolved.before(depth));
      if (block instanceof HTMLElement) {
        const weight = Number.parseFloat(cachedComputedStyle(block, "font-weight"));
        if (Number.isFinite(weight) && weight >= 600) return true;
      }
    }
    return false;
  }
  return false;
}

export function isBoldSelection(
  state: EditorState,
  view?: EditorView,
): boolean {
  const selection = state.selection;
  if (selection.empty) {
    return effectiveBoldAt(
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
      // Office Math: an equation is bold while its letters and digits are
      // (or its own mark says so), however it was made bold.
      if (isDocumentEquationNode(node)) {
        seen = true;
        all &&= documentEquationFormatOn(node, "bold");
        return false;
      }
      if (!node.isText && !isTextBearingInlineAtom(node)) return;
      seen = true;
      all &&= effectiveBoldAt(state, position, node.marks, view);
    });
  }
  return seen && all;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentBoldValue: {
      /** null clears the direct override and restores style inheritance. */
      setBoldValue: (value: boolean | null) => ReturnType;
      





      setBoldOff: () => ReturnType;
    };
  }
}

export const DocumentBold = Bold.extend({
  priority: 90,
  addAttributes() {
    return { value: { default: undefined, rendered: false } };
  },
  parseHTML() {
    return [
      { tag: '[data-bold-value="inherit"]', getAttrs: () => ({ value: null }) },
      { tag: '[data-bold-value="false"]', getAttrs: () => ({ value: false }) },
      { tag: '[data-bold-value="true"]', getAttrs: () => ({ value: true }) },
      { tag: "strong", getAttrs: () => ({ value: true }) },
      {
        tag: "b",
        getAttrs: (element) =>
          element.style.fontWeight !== "normal" ? { value: true } : false,
      },
      {
        style: "font-weight",
        getAttrs: (value) => {
          if (value === "normal" || value === "400") return { value: false };
          return /^(bold(er)?|[5-9]\d{2,})$/.test(value)
            ? { value: true }
            : false;
        },
      },
    ];
  },
  renderHTML({ mark, HTMLAttributes }) {
    const value = mark.attrs.value;
    return [
      value === false || value === null ? "span" : "strong",
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        value === undefined
          ? {}
          : { "data-bold-value": value === null ? "inherit" : String(value) },
        value === false
          ? { style: "font-weight:400" }
          : value === null
            ? { style: "font-weight:inherit" }
            : { style: "font-weight:700" },
      ),
      0,
    ];
  },
  parseMarkdown(token, helpers) {
    return helpers.applyMark("bold", helpers.parseInline(token.tokens ?? []), {
      value: true,
    });
  },
  // Word's "*Bold* and _italic_ with real formatting" is AutoCorrect's own
  // rule (autoCorrectExtension.ts), on its AutoFormat As You Type box.
  addInputRules() {
    return [];
  },
  addPasteRules() {
    return [starPasteRegex, underscorePasteRegex].map((find) =>
      markPasteRule({
        find,
        type: this.type,
        getAttributes: () => ({ value: true }),
      }),
    );
  },
  renderMarkdown(node, helpers) {
    const text = helpers.renderChildren(node);
    return node.attrs?.value === false
      ? `<span data-bold-value="false" style="font-weight:400">${text}</span>`
      : node.attrs?.value === null
        ? `<span data-bold-value="inherit" style="font-weight:inherit">${text}</span>`
        : `**${text}**`;
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
                      class: "docs-inherited-bold",
                      style: `--docs-inherited-bold-weight:${inherited ? "700" : "400"}`,
                    }),
                  );
                }
                // Paragraph inheritance belongs on the paragraph. Only a
                // character-style exception needs an inline wrapper; thousands
                // of ordinary runs must not each redraw the same decoration.
                block.descendants((node, offset) => {
                  if (
                    !node.isText ||
                    directBoldValue(node.marks) !== null ||
                    !node.marks.some(
                      (mark) => mark.type.name === "characterStyle",
                    )
                  )
                    return;
                  const value = inheritedForBlock(state, block, inTable, node.marks);
                  if (value !== null && value !== inherited) {
                    decorations.push(
                      Decoration.inline(
                        pos + 1 + offset,
                        pos + 1 + offset + node.nodeSize,
                        {
                          class: "docs-inherited-bold",
                          style: `--docs-inherited-bold-weight:${value ? "700" : "400"}`,
                        },
                      ),
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
      setBold:
        () =>
        ({ commands }) =>
          commands.setMark(this.name, { value: true }),
      unsetBold:
        () =>
        ({ commands }) =>
          commands.setMark(this.name, { value: null }),
      setBoldValue:
        (value) =>
        ({ commands }) =>
          value === null
            ? commands.setMark(this.name, { value: null })
            : typeof value === "boolean" &&
              commands.setMark(this.name, { value }),
      setBoldOff:
        () =>
        ({ state, tr, dispatch, commands }) => {
          // Turning bold off. Word writes an explicit off (`w:b w:val="0"`)
          // only where the style would make the run bold; where it would not,
          // the run just loses its direct bold, so a bold style applied later
          // still shows (an explicit off there would silently defeat it).
          const type = this.type;
          const view = this.editor.view;
          const styleBold = (position: number, marks: readonly PmMark[]) =>
            styleMakesBold(state, position, marks, view);
          if (state.selection.empty) {
            const marks = state.storedMarks ?? state.selection.$from.marks();
            if (styleBold(state.selection.from, marks)) {
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
                if (styleBold(position, node.marks)) {
                  tr.addMark(start, end, type.create({ value: false }));
                }
              });
            }
          }
          return true;
        },
      toggleBold:
        () =>
        ({ state, tr, dispatch, commands }) => {
          const on = isBoldSelection(state, this.editor.view);
          const applied = on ? commands.setBoldOff() : commands.setMark(this.name, { value: true });
          // An equation in the selection takes Bold on its letters and
          // digits, where bold made inside it lives (`equationNodeFormat`).
          if (dispatch && !state.selection.empty) settleSelectedEquations(state, tr, "bold", !on, this.type);
          return applied;
        },
    };
  },
});
