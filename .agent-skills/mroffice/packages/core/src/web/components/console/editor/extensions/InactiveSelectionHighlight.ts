/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { officeBlurWentIntoChrome } from "../../../../lib/office-inactive-selection";

const pluginKey = new PluginKey<DecorationSet>("inactiveSelectionHighlight");

/**
 * Office Live Preview over the text (components/office-ribbon/
 * officeFormatPreview.tsx): a view-only decoration that wears a hovered
 * font, size, colour or toggle on the selected ranges. It is set and cleared
 * by a meta-only transaction (no document change, no history, so nothing is
 * saved or undone), and dropped by any change to the document.
 */
const formatPreviewKey = new PluginKey<DecorationSet>("officeFormatPreview");

type FormatPreviewMeta =
  | {
      ranges: ReadonlyArray<{ from: number; to: number }>;
      className: string;
      style: string;
      /** The lines the look takes off the characters that have them. */
      linesOff?: ReadonlyArray<"underline" | "strike">;
    }
  | null;

/**
 * Wears a look (`officeFormatPreviewClassStyle`) on `ranges` of `view`'s
 * text; returns how to take it off.
 */
export function showDocumentFormatPreview(
  view: EditorView,
  ranges: ReadonlyArray<{ from: number; to: number }>,
  look: { className: string; style: string },
  linesOff?: ReadonlyArray<"underline" | "strike">,
): (() => void) | null {
  if (view.isDestroyed || !formatPreviewKey.getState(view.state)) return null;
  const live = ranges.filter((range) => range.to > range.from);
  if (live.length === 0 || !look.style) return null;
  view.dispatch(
    view.state.tr
      .setMeta(formatPreviewKey, { ranges: live, ...look, ...(linesOff?.length ? { linesOff } : {}) } satisfies FormatPreviewMeta)
      .setMeta("addToHistory", false),
  );
  return () => {
    if (view.isDestroyed) return;
    if (formatPreviewKey.getState(view.state) === DecorationSet.empty) return;
    view.dispatch(
      view.state.tr
        .setMeta(formatPreviewKey, null satisfies FormatPreviewMeta)
        .setMeta("addToHistory", false),
    );
  };
}

/** The text a Live Preview wears a look on now (none when it shows nothing). */
export function documentFormatPreviewRanges(state: EditorState): ReadonlyArray<{ from: number; to: number }> {
  return (formatPreviewKey.getState(state)?.find() ?? []).map(({ from, to }) => ({ from, to }));
}

/**
 * A line is drawn by its mark's element, over everything inside it, and no
 * style on a child takes it away: a toggle hovered off showed no change, and the
 * press took it off. The element gives the line up while the preview shows
 * (`u:has(...)`, note-editor.css), and the rest of its run, outside the
 * previewed characters, draws the line itself.
 */
function linesKeptBesidePreview(
  doc: ProseMirrorNode,
  ranges: ReadonlyArray<{ from: number; to: number }>,
  line: "underline" | "strike",
): Decoration[] {
  const kept: Decoration[] = [];
  const mark = doc.type.schema.marks[line];
  if (!mark) return kept;
  const previewed = (from: number, to: number) => ranges.some((range) => range.from < to && range.to > from);
  const seen = new Set<number>();
  for (const range of ranges) {
    doc.nodesBetween(range.from, range.to, (node, position) => {
      if (!node.isTextblock) return true;
      if (seen.has(position)) return false;
      seen.add(position);
      let run: { from: number; to: number } | null = null;
      const close = () => {
        if (!run || !previewed(run.from, run.to)) return;
        let at = run.from;
        for (const cut of [...ranges].sort((left, right) => left.from - right.from)) {
          if (cut.to <= at || cut.from >= run.to) continue;
          if (cut.from > at) kept.push(Decoration.inline(at, cut.from, { class: `office-preview-${line}-keep` }));
          at = Math.max(at, cut.to);
        }
        if (at < run.to) kept.push(Decoration.inline(at, run.to, { class: `office-preview-${line}-keep` }));
      };
      node.forEach((child, offset) => {
        const from = position + 1 + offset, to = from + child.nodeSize;
        if (mark.isInSet(child.marks)) run = run ? { from: run.from, to } : { from, to };
        else {
          close();
          run = null;
        }
      });
      close();
      return false;
    });
  }
  return kept;
}

const formatPreviewPlugin = () =>
  new Plugin<DecorationSet>({
    key: formatPreviewKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, value, _oldState, newState) {
        const meta = tr.getMeta(formatPreviewKey) as FormatPreviewMeta | undefined;
        if (meta === null) return DecorationSet.empty;
        if (meta) {
          const size = newState.doc.content.size;
          const off = meta.linesOff ?? [];
          const offClasses = off.map((line) => `office-preview-${line}-off`).join(" ");
          return DecorationSet.create(newState.doc, [
            ...meta.ranges.map(({ from, to }) =>
              Decoration.inline(Math.max(0, from), Math.min(size, to), {
                class: offClasses ? `${meta.className} ${offClasses}` : meta.className,
                style: meta.style,
              }),
            ),
            ...off.flatMap((line) => linesKeptBesidePreview(newState.doc, meta.ranges, line)),
          ]);
        }
        // A preview never survives an edit. The pages setting themselves
        // again around it are no edit: a size hovered near the foot of a page
        // moved lines on, which took the preview away, which moved them back.
        if (!tr.docChanged) return value;
        return tr.getMeta("structuralRebalance") ? value.map(tr.mapping, tr.doc) : DecorationSet.empty;
      },
    },
    props: {
      decorations(state) {
        return formatPreviewKey.getState(state);
      },
    },
  });

/** Editor chrome that legitimately steals focus while acting ON the current
 * selection (toolbar controls, font dropdowns, the selection-AI menu, panel
 * inputs, portal-rendered menus, command dialogs). Blur INTO these keeps the Word-style gray
 * highlight; blur anywhere else means the user left the selection behind. */
const CHROME_SELECTOR = [
  ".note-editor-wrapper",
  ".note-editor-toolbar-stack",
  ".floating-toolbar",
  ".ai-selection-menu",
  ".ai-panel",
  ".chart-data-window",
  "[data-radix-popper-content-wrapper]",
  "[data-radix-portal]",
  // A right-click menu takes the keyboard for its first item. Collapsing the
  // selection then took away the shape the menu is about, and with it the menu
  // (a SmartArt's closed as it opened).
  "[role='menu']",
  // A modal command dialog (Font, Paragraph, Language…) acts on the
  // selection it was opened over; Word keeps that range selected while the
  // dialog holds focus. Non-modal windows are not listed.
  ".office-dialog",
  "[role='dialog'][aria-modal='true']",
  "[role='alertdialog']",
].join(", ");
















function keepSelectionThroughFocus(view: EditorView, pressedAt: number): void {
  // A press places the caret itself, after the focus.
  if (performance.now() - pressedAt < FOCUS_PRESS_MS) return;
  // A node or cell selection is drawn by ProseMirror itself, never a DOM range.
  if (!(view.state.selection instanceof TextSelection)) return;
  const domSelection = view.dom.ownerDocument.getSelection();
  if (!domSelection) return;
  const anchor = domSelection.anchorNode;
  if (anchor && view.dom.contains(anchor)) return;
  const { anchor: from, head } = view.state.selection;
  try {
    const anchorAt = view.domAtPos(from);
    const headAt = view.domAtPos(head);
    domSelection.setBaseAndExtent(anchorAt.node, anchorAt.offset, headAt.node, headAt.offset);
  } catch {
    // A position with no DOM yet: ProseMirror's own focus handling stands.
  }
}

/** A focus this long after a press in the editor is the press's own. */
const FOCUS_PRESS_MS = 600;





















const InactiveSelectionHighlight = Extension.create({
  name: "inactiveSelectionHighlight",

  addProseMirrorPlugins() {
    let pressedAt = -Infinity;
    return [
      formatPreviewPlugin(),
      new Plugin<DecorationSet>({
        key: pluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(pluginKey) as "blur" | "focus" | undefined;
            if (meta === "blur") {
              const { from, to, empty } = newState.selection;
              if (empty) return DecorationSet.empty;
              return DecorationSet.create(newState.doc, [
                Decoration.inline(from, to, {
                  class: "pm-inactive-selection",
                }),
              ]);
            }
            if (meta === "focus") {
              return DecorationSet.empty;
            }
            if (tr.docChanged) {
              return value.map(tr.mapping, tr.doc);
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state);
          },
          handleDOMEvents: {
            blur(view, event) {
              const related = (event as FocusEvent)
                .relatedTarget as HTMLElement | null;
              // The chrome is what the pointer PRESSED as much as what took
              // the focus: Safari gives a clicked ribbon button no focus, so
              // the blur has no related target and used to collapse a
              // selection the ribbon was about to act on.
              if (officeBlurWentIntoChrome(related, CHROME_SELECTOR)) {
                // Toolbar/menu focus steal: keep the range visible in gray.
                view.dispatch(view.state.tr.setMeta(pluginKey, "blur"));
                return false;
              }
              // No related target: either an in-app click on unfocusable
              // ground (canvas, window chrome) or an app/window switch.
              // Defer one tick — during the blur event the document still
              // reports focus, afterwards hasFocus() distinguishes the two.
              window.setTimeout(() => {
                if (view.isDestroyed) return;
                if (!document.hasFocus()) {
                  // App switch: Word keeps the selection highlighted.
                  view.dispatch(view.state.tr.setMeta(pluginKey, "blur"));
                  return;
                }
                if (view.hasFocus()) return;
                const activeElement = document.activeElement;
                if (
                  activeElement instanceof HTMLElement &&
                  activeElement.closest(CHROME_SELECTOR)
                ) {
                  // The initial blur may not expose a related target. Recheck
                  // after focus settles so portal and toolbar controls keep
                  // the native selection rather than collapsing it late.
                  view.dispatch(view.state.tr.setMeta(pluginKey, "blur"));
                  return;
                }
                // The user left the selection behind: collapse it so it
                // cannot haunt later toolbar actions, and paint nothing.
                const tr = view.state.tr;
                if (!view.state.selection.empty) {
                  tr.setSelection(
                    TextSelection.between(
                      view.state.selection.$head,
                      view.state.selection.$head,
                    ),
                  );
                }
                tr.setMeta(pluginKey, "focus");
                view.dispatch(tr);
              }, 0);
              return false;
            },
            mousedown() {
              pressedAt = performance.now();
              return false;
            },
            touchstart() {
              pressedAt = performance.now();
              return false;
            },
            focus(view) {
              keepSelectionThroughFocus(view, pressedAt);
              view.dispatch(view.state.tr.setMeta(pluginKey, "focus"));
              return false;
            },
          },
        },
      }),
    ];
  },
});

export default InactiveSelectionHighlight;
