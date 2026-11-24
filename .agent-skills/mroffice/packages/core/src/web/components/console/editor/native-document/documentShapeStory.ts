/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A shape's words as a STORY: the same block content the body holds.
 *
 * Word keeps a shape's words in a text box story (`wps:txbx/w:txbxContent`),
 * which is ordinary block content -- paragraphs with their styles and lists,
 * tables, pictures, fields and equations -- edited exactly as the body is
 * (MS-OI29500 §14.9.1.1). A `documentShape` therefore holds its words as its
 * own `block*` content, typed by the body's editor, so every command the body
 * takes (Insert ▸ Equation, lists, styles, Find, spelling...) acts in a shape
 * too. Word refuses only a few things in a text box story: another text box
 * or shape, a footnote or endnote, and page, column or section breaks.
 *
 * A shape saved before this held its words in `text` / `textRuns` (one label,
 * formatted run by run). Those stay drawn as they are until the words are
 * opened; the first open turns them into the story (`documentShapeStoryFromLegacy`).
 * The shape's own text format (`textFill`, `textFontSizePt`, ...) stays the
 * story's default character format: what a run states overrides it, as
 * Word's run properties override the shape's text style.
 */

import { canonicalDocumentFontSizePx, documentFontSizePx } from "./documentFontSize";
import { IME_COMPOSITION_SETTLED_META } from "./imeCompositionGuard";
import { SAVED_WITHOUT_HISTORY_META } from "./readOnlyTransactionAuthority";
import type { Mark, Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

import type { RunStyle, TextRun } from "../../../../lib/presentation-runs";

/** The node types whose words are a story (a floating shape, and one In Line with Text). */
const SHAPE_STORY_HOSTS: ReadonlySet<string> = new Set(["documentShape", "inlineDocumentShape"]);
const holdsShapeStory = (name: string): boolean => SHAPE_STORY_HOSTS.has(name);

/** On the element that holds a shape's story (the node view's contentDOM). */
export const DOCUMENT_SHAPE_STORY_ATTRIBUTE = "data-document-shape-story";

/** The node types Word does not take into a text box story. */
export const DOCUMENT_SHAPE_STORY_REFUSED_NODES: ReadonlySet<string> = new Set([
  "documentShape",
  "inlineDocumentShape",
  "textBox",
  "footnoteReference",
  "endnoteReference",
  "pageBreak",
  "columnBreak",
  "sectionBreak",
  "documentCoverPage",
]);

/** Whether this shape's node holds its words as a story. */
export function documentShapeHoldsStory(node: ProseMirrorNode | null | undefined): boolean {
  return Boolean(node && holdsShapeStory(node.type.name) && node.childCount > 0);
}

/**
 * Whether a shape's words can become a story: a single shape (not a group,
 * SmartArt or ink stroke), not a line, and not a later box of a linked chain
 * (it shows its owner's overflow). An imported shape's story is written back
 * into its own text box by the patch-back.
 */
export function documentShapeTakesStory(attrs: Readonly<Record<string, unknown>>): boolean {
  if (Array.isArray(attrs.groupMembers) && attrs.groupMembers.length > 0) return false;
  if (attrs.inkTool) return false;
  if (typeof attrs.linkedTextBoxStoryId === "number") return false;
  const preset = typeof attrs.preset === "string" ? attrs.preset : "";
  if (/^(line|straightConnector|bentConnector|curvedConnector|connector)/i.test(preset)) return false;
  // Per-run WordArt has no body mark yet: such words keep their label.
  if (
    Array.isArray(attrs.textRuns) &&
    (attrs.textRuns as TextRun[]).some((run) => Boolean((run?.style as { textPaint?: unknown } | undefined)?.textPaint))
  ) {
    return false;
  }
  return true;
}

/** A run's character format as the body's marks. */
export function marksForRunStyle(schema: Schema, style: RunStyle | undefined): Mark[] {
  if (!style) return [];
  const marks: Mark[] = [];
  const add = (name: string, attrs?: Record<string, unknown>) => {
    const type = schema.marks[name];
    if (type) marks.push(type.create(attrs ?? null));
  };
  if (style.bold) add("bold");
  if (style.italic) add("italic");
  if (style.underline) add("underline");
  if (style.strike) add("strike");
  if (style.superscript) add("superscript");
  else if (style.subscript) add("subscript");
  if (style.caps === "all") add("allCaps");
  else if (style.caps === "small") add("smallCaps");
  if (style.color) add("textColor", { color: style.color });
  if (style.highlight) add("highlight", { color: style.highlight });
  if (typeof style.fontSize === "number" && Number.isFinite(style.fontSize)) {
    add("fontSize", { size: canonicalDocumentFontSizePx(style.fontSize) });
  }
  if (style.fontFamily) add("fontFamily", { family: style.fontFamily });
  // Hidden words (Word's `w:vanish`, an imported shape's runs) stay hidden
  // as the body's own hidden text when the label becomes a story.
  if ((style as { hidden?: unknown }).hidden === true) add("hiddenText");
  return marks;
}

/**
 * The paragraphs a label shape's words become: one per line of `text`, each
 * run's slice carrying that run's format. `seed` (a key typed on the selected
 * shape) replaces the words, as the label editor's seed did.
 */
export function documentShapeStoryFromLegacy(
  schema: Schema,
  attrs: Readonly<Record<string, unknown>>,
  seed?: string,
): ProseMirrorNode[] {
  const paragraph = schema.nodes.paragraph;
  if (!paragraph) return [];
  const text = seed ?? (typeof attrs.text === "string" ? attrs.text : "");
  const runs: readonly TextRun[] =
    seed === undefined && Array.isArray(attrs.textRuns) &&
    (attrs.textRuns as TextRun[]).map((run) => run.text).join("") === text
      ? (attrs.textRuns as TextRun[])
      : [{ text }];
  // An imported shape's paragraphs (its `w:txbxContent` reading) keep their
  // alignment, size and face, as the label drew them.
  const body = attrs.textBody as
    | { paragraphs?: readonly { text: string; align?: string; fontSizePt?: number; fontFamily?: string }[] }
    | null
    | undefined;
  const bodyParagraphs =
    seed === undefined && body?.paragraphs?.length &&
    body.paragraphs.map((item) => item.text).join("\n") === text
      ? body.paragraphs
      : null;
  const lines: ProseMirrorNode[][] = [[]];
  for (const run of runs) {
    const marks = marksForRunStyle(schema, run.style);
    const parts = run.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push(schema.text(part, marks));
    });
  }
  return lines.map((nodes, index) => {
    const reading = bodyParagraphs?.[index];
    if (!reading) return paragraph.create(null, nodes);
    const extra: Mark[] = [];
    if (typeof reading.fontSizePt === "number" && schema.marks.fontSize) {
      extra.push(schema.marks.fontSize.create({ size: documentFontSizePx(reading.fontSizePt) }));
    }
    if (reading.fontFamily && schema.marks.fontFamily) {
      extra.push(schema.marks.fontFamily.create({ family: reading.fontFamily }));
    }
    const styled = extra.length
      ? nodes.map((node) =>
          node.isText ? node.mark(extra.reduce((set, mark) => (mark.isInSet(set) || set.some((m) => m.type === mark.type) ? set : mark.addToSet(set)), node.marks)) : node,
        )
      : nodes;
    const align = reading.align === "left" || reading.align === "center" || reading.align === "right" || reading.align === "justify" ? reading.align : null;
    return paragraph.create(align ? { textAlign: align } : null, styled);
  });
}

/** The story's words as plain text, one line per paragraph (what `text` mirrors). */
export function documentShapeStoryPlainText(node: ProseMirrorNode): string {
  const lines: string[] = [];
  node.descendants((child) => {
    if (child.isBlock && child.isAtom && typeof child.attrs.latex === "string") {
      lines.push(child.attrs.latex);
      return false;
    }
    if (child.isTextblock) {
      // An equation reads as its linear form, as Word's plain text does.
      let line = "";
      child.forEach((inline) => {
        if (inline.isText) line += inline.text ?? "";
        else if (typeof inline.attrs.latex === "string") line += inline.attrs.latex;
        else if (inline.type.name === "hardBreak") line += "\n";
        else line += inline.textContent;
      });
      lines.push(line);
      return false;
    }
    return true;
  });
  return lines.join("\n");
}

/** The shape whose story holds the selection: its position and node, or null. */
export function documentShapeStoryAt(
  state: EditorState,
): { readonly pos: number; readonly node: ProseMirrorNode } | null {
  const { $from, $to } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const candidate = $from.node(depth);
    if (!holdsShapeStory(candidate.type.name)) continue;
    const pos = $from.before(depth);
    // A selection that leaves the story is the body's, not the shape's.
    if ($to.pos > pos + candidate.nodeSize - 1) return null;
    return { pos, node: candidate };
  }
  return null;
}

/** Whether a transaction puts a node Word refuses into some shape's story. */
function transactionPutsRefusedNodeInStory(tr: Transaction): boolean {
  if (!tr.docChanged) return false;
  let refused = false;
  tr.mapping.maps.forEach((map, index) => {
    if (refused) return;
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      if (refused) return;
      // Into the FINAL document: later steps of the same transaction move it.
      const from = tr.mapping.slice(index + 1).map(newStart, -1);
      const to = tr.mapping.slice(index + 1).map(newEnd, 1);
      tr.doc.nodesBetween(Math.max(0, from), Math.min(tr.doc.content.size, to), (node, pos) => {
        if (refused) return false;
        if (!DOCUMENT_SHAPE_STORY_REFUSED_NODES.has(node.type.name)) return true;
        const $pos = tr.doc.resolve(pos);
        for (let depth = $pos.depth; depth > 0; depth -= 1) {
          if (holdsShapeStory($pos.node(depth).type.name)) {
            refused = true;
            return false;
          }
        }
        return true;
      });
    });
  });
  return refused;
}

export const documentShapeStoryKey = new PluginKey("documentShapeStory");

/** How long typing stays idle before the stories it touched mirror `text`. */
export const DOCUMENT_SHAPE_TEXT_MIRROR_IDLE_MS = 300;
/** The longest a pending mirror waits while edits keep coming. */
export const DOCUMENT_SHAPE_TEXT_MIRROR_MAX_WAIT_MS = 2_000;
const STORY_MIRROR_META = "documentShapeStoryMirror";

interface DocumentShapeStoryPluginState {
  /** The stories typed in since `text` last mirrored them (shape positions). */
  readonly dirty: readonly number[];
  readonly maxTextLength: number;
}

/** The shapes whose stories a local transaction touched, by position in its doc. */
function storiesTouchedBy(tr: Transaction, doc: ProseMirrorNode): number[] {
  const touched = new Set<number>();
  tr.mapping.maps.forEach((map, index) => {
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const rest = tr.mapping.slice(index + 1);
      let from = rest.map(newStart, -1);
      let to = rest.map(newEnd, 1);
      from = Math.max(0, Math.min(from, doc.content.size));
      to = Math.max(from, Math.min(to, doc.content.size));
      const $from = doc.resolve(from);
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        if (holdsShapeStory($from.node(depth).type.name)) touched.add($from.before(depth));
      }
      doc.nodesBetween(from, to, (node, pos) => {
        // No story, nothing to mirror (every stroke of ink): the mirror's
        // empty transaction was one more view update per pen landing.
        if (holdsShapeStory(node.type.name) && node.childCount > 0) touched.add(pos);
        return true;
      });
    });
  });
  return [...touched];
}

/** A shape's words as every reader takes them: its story's when it holds one,
 * else its `text` (a shape saved before stories, or a label). */
export function documentShapeVisibleText(node: ProseMirrorNode): string {
  if (holdsShapeStory(node.type.name) && node.childCount > 0) return documentShapeStoryPlainText(node);
  return typeof node.attrs.text === "string" ? node.attrs.text : "";
}

/**
 * The transaction that mirrors the stories typed in since the last mirror
 * into their shapes' `text` (and drops a legacy `textRuns`), or null when
 * none is pending. It is not an undo step: the typing it follows is.
 */
export function documentShapeStoryMirrorTransaction(state: EditorState): Transaction | null {
  const plugin = documentShapeStoryKey.getState(state) as DocumentShapeStoryPluginState | undefined;
  if (!plugin || plugin.dirty.length === 0) return null;
  const tr = state.tr;
  for (const pos of plugin.dirty) {
    const node = state.doc.nodeAt(pos);
    if (!node || !holdsShapeStory(node.type.name) || node.childCount === 0) continue;
    const words = documentShapeStoryPlainText(node).slice(0, plugin.maxTextLength);
    if (words === node.attrs.text && node.attrs.textRuns == null) continue;
    // An imported shape's body reading stays: its insets and anchor lay
    // the story out (its paragraphs are the story's now).
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, text: words, textRuns: null }, node.marks);
  }
  tr.setMeta(STORY_MIRROR_META, true);
  tr.setMeta("addToHistory", false);
  // Out of Undo, yet the document's: a collaborative page publishes it to its
  // room (paged-document-bridge). Left view-only, the room -- and every save
  // made from the room's body -- kept the words from before the last typing
  // burst, while the page read 已保存 (WUA 220).
  tr.setMeta(SAVED_WITHOUT_HISTORY_META, true);
  return tr;
}

/** Mirror the pending stories now (the idle mirror's work, done at once). */
export function flushDocumentShapeStoryText(view: EditorView): boolean {
  if (view.isDestroyed || view.composing) return false;
  const tr = documentShapeStoryMirrorTransaction(view.state);
  if (!tr) return false;
  view.dispatch(tr);
  return true;
}

/**
 * The document as it reads with every pending story mirrored, without
 * changing the editor: what a serializer (save, export, a copy for the AI)
 * hands on, so no reader of `text` sees words a typing burst left behind.
 */
export function documentWithShapeStoriesMirrored(state: EditorState): ProseMirrorNode {
  return documentShapeStoryMirrorTransaction(state)?.doc ?? state.doc;
}

/**
 * The story's place in the editor:
 * - the shape holding the caret is drawn in text editing (a node decoration
 *   its node view reads, as Word's dashed frame);
 * - the arrows stop at the story's edges, Select All selects the story and
 *   Esc selects the shape, as Word keeps the keyboard in a text box;
 * - `text` mirrors the story's words (every reader of a shape's words -- the
 *   PDF, search, the AI's page reading -- keeps reading them). The mirror is
 *   written when typing goes idle, when the editor loses focus, and is seen
 *   by every serializer at once (`documentWithShapeStoriesMirrored`): one
 *   attribute write per burst, where it was the whole text on every key
 *   (30 KB a keystroke in a long text box);
 * - what Word refuses in a text box (a shape, a footnote, a break) is refused.
 */
export function documentShapeStoryPlugin(maxTextLength: number): Plugin {
  return new Plugin<DocumentShapeStoryPluginState>({
    key: documentShapeStoryKey,
    filterTransaction: (tr) =>
      tr.getMeta("y-sync$") !== undefined || !transactionPutsRefusedNodeInStory(tr),
    state: {
      init: () => ({ dirty: [], maxTextLength }),
      apply: (tr, value, _oldState, newState) => {
        if (tr.getMeta(STORY_MIRROR_META)) return { dirty: [], maxTextLength };
        let dirty = value.dirty;
        if (tr.docChanged && dirty.length > 0) {
          dirty = dirty.flatMap((pos) => {
            const mapped = tr.mapping.mapResult(pos, 1);
            return mapped.deleted ? [] : [mapped.pos];
          });
        }
        // A composition's edits are held from every other writer while the
        // input method types (`imeCompositionGuard`); its settled wake-up
        // carries no change of its own, so every story is read again then
        // (pinyin typed in a shape left `text` behind).
        const settled = Boolean(tr.getMeta(IME_COMPOSITION_SETTLED_META));
        // This writer's Undo / Redo comes back through the shared document
        // (the y-sync meta) yet is this writer's edit: its stories mirror
        // again. Undoing a Return in a text box left the split in `text`,
        // and a reopened box rebuilt two paragraphs from it (WUA 206).
        const sync = tr.getMeta("y-sync$") as { isChangeOrigin?: boolean; isUndoRedoOperation?: boolean } | undefined;
        const local =
          tr.docChanged && (sync === undefined || (sync.isChangeOrigin === true && sync.isUndoRedoOperation === true));
        if (!settled && !local) return dirty === value.dirty ? value : { dirty, maxTextLength };
        const added = local ? storiesTouchedBy(tr, newState.doc) : [];
        if (settled) {
          newState.doc.descendants((node, pos) => {
            if (holdsShapeStory(node.type.name)) added.push(pos);
            return true;
          });
        }
        if (added.length === 0) return dirty === value.dirty ? value : { dirty, maxTextLength };
        return { dirty: [...new Set([...dirty, ...added])], maxTextLength };
      },
    },
    view: (editorView) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let pendingSince: number | null = null;
      const flush = () => {
        timer = null;
        pendingSince = null;
        if (editorView.isDestroyed) return;
        // Never under a composition: the input method's text is not yet the
        // story's. Its settled wake-up schedules the mirror again.
        if (editorView.composing) {
          timer = setTimeout(flush, DOCUMENT_SHAPE_TEXT_MIRROR_IDLE_MS);
          return;
        }
        flushDocumentShapeStoryText(editorView);
      };
      const onFocusOut = () => {
        if (timer === null) return;
        clearTimeout(timer);
        flush();
      };
      editorView.dom.addEventListener("focusout", onFocusOut);
      return {
        update: (view, previous) => {
          const pending = documentShapeStoryKey.getState(view.state) as DocumentShapeStoryPluginState | undefined;
          if (!pending || pending.dirty.length === 0) return;
          // Typing restarts the wait; anything else (a selection, a remote
          // edit, a decoration) leaves the pending mirror where it was.
          if (timer !== null && view.state.doc === previous.doc) return;
          const now = Date.now();
          pendingSince ??= now;
          // Edits that never stop (a collaborator typing) do not hold the
          // mirror back for longer than the cap.
          if (timer !== null && now - pendingSince >= DOCUMENT_SHAPE_TEXT_MIRROR_MAX_WAIT_MS) return;
          if (timer !== null) clearTimeout(timer);
          timer = setTimeout(flush, DOCUMENT_SHAPE_TEXT_MIRROR_IDLE_MS);
        },
        destroy: () => {
          if (timer !== null) clearTimeout(timer);
          editorView.dom.removeEventListener("focusout", onFocusOut);
        },
      };
    },
    props: {
      decorations: (state) => {
        const story = documentShapeStoryAt(state);
        if (!story) return null;
        return DecorationSet.create(state.doc, [
          Decoration.node(story.pos, story.pos + story.node.nodeSize, {}, { documentShapeStoryActive: true }),
        ]);
      },
      handleKeyDown: (view, event) => {
        const story = documentShapeStoryAt(view.state);
        if (!story || event.isComposing) return false;
        const { state } = view;
        const mod = event.metaKey || event.ctrlKey;
        const start = Selection.findFrom(state.doc.resolve(story.pos + 1), 1, true);
        const end = Selection.findFrom(state.doc.resolve(story.pos + story.node.nodeSize - 1), -1, true);
        if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "a") {
          if (!start || !end) return false;
          event.preventDefault();
          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, start.from, end.to)));
          return true;
        }
        if (event.key === "Escape" && !mod && !event.altKey && !event.shiftKey) {
          event.preventDefault();
          view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, story.pos)));
          return true;
        }
        if (mod || event.altKey) return false;
        const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
        const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
        if (!backward && !forward) return false;
        const { $head } = state.selection;
        const edge = backward ? start : end;
        if (!edge) return false;
        const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
        const inEdgeBlock = $head.start() === edge.$from.start();
        const atEdge = vertical
          ? inEdgeBlock && view.endOfTextblock(backward ? "up" : "down")
          : backward ? $head.pos <= edge.from : $head.pos >= edge.to;
        if (!atEdge) return false;
        // Word keeps the caret in the text box: a Shift+arrow stops there
        // too, and a plain arrow collapses a selection onto that edge.
        event.preventDefault();
        if (!event.shiftKey && !state.selection.empty) {
          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, backward ? state.selection.from : state.selection.to)));
        }
        return true;
      },
    },
  });
}

/** The body marks a Home command on a whole shape restates (it overrides them, as Word's does). */
const SHAPE_COMMAND_MARKS: Readonly<Record<string, readonly string[]>> = {
  family: ["fontFamily"],
  variant: ["fontFamily", "bold", "italic"],
  size: ["fontSize"],
  step: ["fontSize"],
  bold: ["bold"],
  italic: ["italic"],
  strike: ["strike"],
  underline: ["underline"],
  color: ["textColor"],
};

/**
 * Word formats every character of a shape selected whole: the shape's own
 * text format takes the command, and the story's runs drop the formatting it
 * restates, so none of them keeps a different face, size, weight or colour.
 * An alignment clears the paragraphs' own, so every paragraph takes the
 * shape's. Null when the story has nothing to drop.
 */
export function documentShapeStoryCommandCleanup(
  state: EditorState,
  pos: number,
  command: { readonly kind: string; readonly field?: string },
): Transaction | null {
  const node = state.doc.nodeAt(pos);
  if (!node || !holdsShapeStory(node.type.name) || node.childCount === 0) return null;
  const from = pos + 1;
  const to = pos + node.nodeSize - 1;
  const tr = state.tr;
  if (command.kind === "align") {
    node.descendants((child, offset) => {
      if (child.isTextblock && child.attrs.textAlign != null) {
        tr.setNodeMarkup(from + offset, undefined, { ...child.attrs, textAlign: null }, child.marks);
      }
      return !child.isTextblock;
    });
  } else {
    const key = command.kind === "toggle" ? (command.field ?? "") : command.kind;
    for (const name of SHAPE_COMMAND_MARKS[key] ?? []) {
      const type = state.schema.marks[name];
      if (type) tr.removeMark(from, to, type);
    }
  }
  return tr.docChanged ? tr : null;
}
