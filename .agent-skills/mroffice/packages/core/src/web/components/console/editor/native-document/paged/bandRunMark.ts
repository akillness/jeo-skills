/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension, Mark, flattenExtensions, mergeAttributes, type Extensions } from "@tiptap/core";
import { Fragment, Slice, type Mark as PmMark, type Node as PmNode, type Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform";

import { normalizeBandRunFont, isNativeBandTextId } from "../headerFooter";
import {
  IME_COMPOSITION_SETTLED_META,
  imeSafeAppendTransaction,
} from "../imeCompositionGuard";

export const BAND_RUN_MARK_NAME = "bandRun";

/**
 * What a header/footer run carries that the document editor has no mark
 * for: the identity of Word's own text slot the run came from
 * (`nativeTextId`, so a save can type back into that slot) and the font
 * slots beyond ascii/east-asian (complex script, hint, language, charset).
 * Invisible; it exists so the band story keeps them through an edit.
 */
export const BandRunMark = Mark.create({
  name: BAND_RUN_MARK_NAME,
  inclusive: false,
  addAttributes() {
    return {
      nativeTextId: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute("data-band-run-id");
          return isNativeBandTextId(value) ? value : null;
        },
        renderHTML: (attrs) =>
          isNativeBandTextId(attrs.nativeTextId) ? { "data-band-run-id": attrs.nativeTextId } : {},
      },
      // Word's content that is not a text slot (see `BandRichRun.nativeAtom`):
      // `{ id, marks, anchor? }`, its id, the formatting the part gives it and
      // the run of Word's line typing after it is written after
      // (`BandRichRun.nativeAnchor`). Never
      // rendered, so a copy pasted anywhere arrives as plain text, not as a
      // second atom.
      nativeAtom: { default: null, rendered: false },
      // The text box that draws this run (`BandRichRun.frame`), so a story
      // with a header text box keeps its words in their box through an edit.
      frame: { default: null, rendered: false },
      // Facts of Word's run a slot stands in (`BandRichRun.nativeRunGroup`,
      // `nativeWrapped`) and, for text MRAI wrote into Word's part, the slot
      // whose run properties it keeps (`nativeFrom`).
      nativeRunGroup: { default: null, rendered: false },
      nativeWrapped: { default: null, rendered: false },
      nativeFrom: { default: null, rendered: false },
      // Word's absolute position tab (`BandRichRun.ptab`) this run's tab
      // character is, which the story's tab layout places at its own point.
      ptab: { default: null, rendered: false },
      // The run's character style (`BandRichRun.charStyleId`), written back.
      charStyleId: { default: null, rendered: false },
      font: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-band-run-font");
          if (!raw) return null;
          try {
            return normalizeBandRunFont(JSON.parse(raw));
          } catch {
            return null;
          }
        },
        renderHTML: (attrs) => {
          const font = normalizeBandRunFont(attrs.font);
          return font ? { "data-band-run-font": JSON.stringify(font) } : {};
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-band-run-id], span[data-band-run-font]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

/**
 * The paragraph-level extras a band story keeps through an edit (pictures,
 * anchored frames, WordArt, shapes on a paragraph; the widths and alignment
 * of a band table). Opaque to the editor; `bandStoryDoc.ts` puts them on and
 * takes them off.
 */
export const BandStoryExtras = Extension.create({
  name: "bandStoryExtras",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          // A picture or a text box belongs to its line: Enter makes a new
          // line without a copy of it (Word keeps one logo, not two).
          bandPassthrough: { default: null, rendered: false, keepOnSplit: false },
          // Which paragraph of Word's own part this line is: the first part
          // of a split line keeps it, the new line is new.
          nativeParagraphId: { default: null, rendered: false, keepOnSplit: false },
          nativeRemovable: { default: null, rendered: false, keepOnSplit: false },
          // A line of Word's page-number building block: Remove Page Numbers
          // takes it away.
          pageNumberBlock: { default: null, rendered: false, keepOnSplit: false },
          // The line's text frame (`w:framePr`): the frame is the line's own,
          // a new line from Enter is not framed.
          bandTextFrame: { default: null, rendered: false, keepOnSplit: false },
          // The line's paragraph mark (`BandRichParagraph.markRun`); Enter's new
          // line keeps it, as Word's new paragraph keeps its mark.
          bandMarkRun: { default: null, rendered: false },
          // A line MRAI added: the line whose paragraph properties it was
          // made from. A line split from it is made from the same one.
          nativeParagraphFrom: { default: null, rendered: false },
          // Word's line inputs the body has no attribute for: the size and
          // face its single line is measured from (`BandRichLine`). Kept so
          // the story sets the line as the painted band does and saves it
          // back; a new line from Enter keeps its paragraph's, as in Word.
          lineSizePt: { default: null, rendered: false },
          lineFont: { default: null, rendered: false },
        },
      },
      {
        types: ["table"],
        attributes: {
          bandTable: { default: null, rendered: false },
        },
      },
    ];
  },
});

/**
 * The nodes a header/footer story holds. The band model has lines (a heading
 * is read as a line), bulleted and numbered list items (Word's `w:numPr` in a
 * header, `BandRichList`) and tables; a task list, a quote, a code block, a
 * rule or an inline object has no place in it (`pmDocToBandRich`).
 */
export const BAND_STORY_NODE_TYPES: ReadonlySet<string> = new Set([
  "doc",
  "pageBlock",
  "paragraph",
  "heading",
  "text",
  "hardBreak",
  "documentField",
  "bulletList",
  "orderedList",
  "listItem",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
]);

/**
 * List settings a header/footer line cannot keep (`listOfNode` in
 * bandStoryDoc.ts), at the value that clears each: a pasted list keeps its
 * items, levels, kind and gallery marker and takes the header's own numbering,
 * as Word's Merge Formatting paste does.
 */
const BAND_UNHELD_LIST_ATTRS: Readonly<Record<string, unknown>> = {
  listDefinition: null,
  listStyleId: null,
  listContinue: false,
  listChain: null,
  bulletPicture: null,
  bulletAlign: null,
};

function withBandListAttrs(node: PmNode, content: Fragment): { node: PmNode; changed: boolean } {
  if (node.type.name !== "bulletList" && node.type.name !== "orderedList") return { node, changed: false };
  const attrs: Record<string, unknown> = { ...node.attrs };
  let changed = false;
  for (const [key, cleared] of Object.entries(BAND_UNHELD_LIST_ATTRS)) {
    if (!(key in attrs) || attrs[key] === cleared || attrs[key] === undefined) continue;
    attrs[key] = cleared;
    changed = true;
  }
  return changed ? { node: node.type.create(attrs, content, node.marks), changed } : { node, changed };
}

function foreignNodes(doc: PmNode): number {
  let count = 0;
  doc.descendants((node) => {
    if (!BAND_STORY_NODE_TYPES.has(node.type.name)) count += 1;
    return true;
  });
  return count;
}

/** The node types whose typing shortcuts a header/footer story keeps. Word's
 * AutoFormat As You Type makes "1. " and "* " a list in a header as in the
 * body; a shortcut that turns a line into a heading, a quote, a code block or
 * a rule ("# ", "> ", "```", "---") makes nothing the band holds. */
const BAND_STORY_RULE_NODES = new Set([
  "doc",
  "pageBlock",
  "paragraph",
  "text",
  "hardBreak",
  "documentField",
  "bulletList",
  "orderedList",
  "listItem",
]);

export function bandStoryRuleExtensions(extensions: Extensions): string[] {
  return flattenExtensions(extensions)
    .filter((extension) => extension.type !== "node" || BAND_STORY_RULE_NODES.has(extension.name))
    .map((extension) => extension.name);
}

const bandStoryBlocksKey = new PluginKey("bandStoryBlocks");

/**
 * What the band holds of pasted content: a bulleted or numbered list keeps
 * its items and levels (Word pastes a list into a header as a list), with the
 * settings a header line cannot keep cleared to the gallery marker; a task
 * list, a quote or a code block gives up its words as plain lines (a code
 * block one line per line); a table keeps its grid with its cells' content
 * made the same way. A rule or a picture has no words to keep and stays as it
 * is, so the paste is refused.
 */
function bandLines(fragment: Fragment, schema: Schema): { nodes: PmNode[]; changed: boolean } {
  const nodes: PmNode[] = [];
  let changed = false;
  const paragraph = (content: Fragment | PmNode | null) => {
    try {
      return schema.nodes.paragraph.createChecked(null, content);
    } catch {
      return null;
    }
  };
  fragment.forEach((node) => {
    if (BAND_STORY_NODE_TYPES.has(node.type.name)) {
      if (node.isTextblock || node.isInline || node.isLeaf) {
        nodes.push(node);
        return;
      }
      const inner = bandLines(node.content, schema);
      const content = inner.changed ? Fragment.from(inner.nodes) : node.content;
      const valid = !inner.changed || node.type.validContent(content);
      const listed = withBandListAttrs(node, valid ? content : node.content);
      if (!inner.changed && !listed.changed) {
        nodes.push(node);
        return;
      }
      changed = true;
      nodes.push(listed.changed ? listed.node : valid ? node.copy(content) : node);
      return;
    }
    if (node.isTextblock) {
      const lines = node.type.spec.code
        ? node.textContent.split("\n").map((line) => paragraph(line ? schema.text(line) : null))
        : [paragraph(node.content)];
      if (lines.every((line): line is PmNode => line !== null)) {
        changed = true;
        nodes.push(...lines);
        return;
      }
      nodes.push(node);
      return;
    }
    if (!node.isLeaf && !node.isInline) {
      changed = true;
      nodes.push(...bandLines(node.content, schema).nodes);
      return;
    }
    nodes.push(node);
  });
  return { nodes, changed };
}

export interface BandStoryBlocksOptions {
  /** Told when content the band cannot hold was not applied (a rule or a
   * picture pasted, a command that would make a list). */
  onRefused: (() => void) | null;
}

/**
 * A header/footer story never takes a node its band cannot hold, instead of
 * the line being dropped when the story is saved: pasted lists, quotes and
 * code blocks arrive as plain lines, and a command, an input rule or a paste
 * that would still make such a node (a rule, a picture) is not applied, and
 * the island says so.
 */
export const BandStoryBlocks = Extension.create<BandStoryBlocksOptions>({
  name: "bandStoryBlocks",
  addOptions() {
    return { onRefused: null };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: bandStoryBlocksKey,
        props: {
          transformPasted: (slice, view) => {
            const { nodes, changed } = bandLines(slice.content, view.state.schema);
            if (!changed) return slice;
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            return new Slice(
              Fragment.from(nodes),
              slice.openStart > 0 && first?.isTextblock ? 1 : 0,
              slice.openEnd > 0 && last?.isTextblock ? 1 : 0,
            );
          },
        },
        filterTransaction: (tr: Transaction) => {
          if (!tr.docChanged || foreignNodes(tr.doc) <= foreignNodes(tr.before)) return true;
          const refused = options.onRefused;
          if (refused) queueMicrotask(refused);
          return false;
        },
      }),
    ];
  },
});

type MarkJson = { type: string; attrs?: Record<string, unknown> };

const TRACKED_CHANGE_MARKS = new Set(["trackInsertion", "trackDeletion"]);

interface AtomSpec {
  id: string;
  marks: MarkJson[];
  /** The removable field of Word's line this content is (`BandRichRun.nativeField`). */
  field?: string;
}

function atomOf(marks: readonly PmMark[]): AtomSpec | null {
  const mark = marks.find((candidate) => candidate.type.name === BAND_RUN_MARK_NAME);
  const atom = mark?.attrs.nativeAtom as { id?: unknown; marks?: unknown; field?: unknown } | null | undefined;
  return atom && typeof atom.id === "string" && Array.isArray(atom.marks)
    ? { id: atom.id, marks: atom.marks as MarkJson[], ...(typeof atom.field === "string" ? { field: atom.field } : {}) }
    : null;
}

/** The inline pieces of one of Word's fields: a range of one atom id. */
interface FieldRange {
  id: string;
  from: number;
  to: number;
}

/** Every removable field of `doc` as the range its content spans. */
function fieldRanges(doc: PmNode): FieldRange[] {
  const ranges: FieldRange[] = [];
  doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    const atom = atomOf(node.marks);
    if (!atom?.field) return false;
    const last = ranges[ranges.length - 1];
    if (last && last.id === atom.id && last.to === pos) last.to = pos + node.nodeSize;
    else ranges.push({ id: atom.id, from: pos, to: pos + node.nodeSize });
    return false;
  });
  return ranges;
}

/**
 * Whether `[from, to)` of `doc` touches Word's content it may not change: a
 * piece of an atom, or `from` (an insertion) strictly inside one. A field the
 * part lets the story remove (`field`) is Word's content too, but a range
 * that covers the whole field removes it, as Word's Delete on a selected
 * field does (the save writes `deletedFields`).
 */
function touchesAtom(doc: PmNode, from: number, to: number): boolean {
  let touched = false;
  if (to > from) {
    const fields = fieldRanges(doc);
    doc.nodesBetween(from, to, (node, pos) => {
      if (touched) return false;
      if (!node.isInline) return true;
      const atom = atomOf(node.marks);
      if (atom && pos + node.nodeSize > from && pos < to) {
        const field = atom.field ? fields.find((range) => range.id === atom.id) : undefined;
        if (!field || field.from < from || field.to > to) touched = true;
      }
      return !touched;
    });
    return touched;
  }
  const $pos = doc.resolve(Math.max(0, Math.min(from, doc.content.size)));
  return $pos.textOffset > 0 && Boolean($pos.parent.maybeChild($pos.index()) && atomOf($pos.parent.child($pos.index()).marks));
}

/** The field range the caret stands right after (Backspace) or before
 * (Delete), or null. */
function fieldBeside(doc: PmNode, pos: number, before: boolean): FieldRange | null {
  return fieldRanges(doc).find((range) => (before ? range.to === pos : range.from === pos)) ?? null;
}

const bandNativeAtomsKey = new PluginKey("bandNativeAtoms");

/**
 * Word's own content in a header/footer the story editor opened in place
 * (a field result, a tab, a symbol): the caret moves past it and the ribbon
 * formats what is around it, but nothing types into it, deletes it or
 * restyles it -- the save could not write that into Word's part. A
 * transaction that would is not applied; formatting that reached it anyway
 * (a selection that spans it) is taken back off in the same step.
 */
export const BandNativeAtoms = Extension.create({
  name: "bandNativeAtoms",
  // Before the editor's own Backspace / Delete handling, so a field beside
  // the caret is selected whole before anything else acts on it.
  priority: 1000,
  addKeyboardShortcuts() {
    // Word's Backspace or Delete beside a field selects the whole field
    // first; the next press removes it (code and result together). A field
    // the part does not let the story remove is not selected, so the key
    // does nothing there, as before.
    const select = (before: boolean) => () => {
      const { state, view } = this.editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const field = fieldBeside(state.doc, selection.from, before);
      if (!field) return false;
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, field.from, field.to)));
      return true;
    };
    return { Backspace: select(true), Delete: select(false) };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: bandNativeAtomsKey,
        filterTransaction: (tr: Transaction) => {
          if (!tr.docChanged) return true;
          for (let index = 0; index < tr.steps.length; index += 1) {
            const step = tr.steps[index];
            const doc = tr.docs[index];
            if (step instanceof ReplaceAroundStep) {
              // A node's attributes or wrapper change around content it
              // keeps (the gap): only what is outside the gap is replaced.
              const { from, to, gapFrom, gapTo } = step as unknown as Record<string, number>;
              if (touchesAtom(doc, from, gapFrom) || touchesAtom(doc, gapTo, to)) return false;
              continue;
            }
            if (!(step instanceof ReplaceStep)) continue;
            const { from, to } = step as unknown as { from: number; to: number };
            if (touchesAtom(doc, from, to)) return false;
          }
          return true;
        },
        // Restoring Word's marks rewrites inline runs; doing that while an
        // IME owns the DOM commits the raw pinyin. It re-derives from the
        // settled document, so the guard's settle wake-up re-runs it.
        appendTransaction: imeSafeAppendTransaction((transactions, _old, state) => {
          if (
            !transactions.some(
              (tr) => tr.docChanged || tr.getMeta(IME_COMPOSITION_SETTLED_META) === true,
            )
          ) {
            return null;
          }
          const markType = state.schema.marks[BAND_RUN_MARK_NAME];
          if (!markType) return null;
          let tr: Transaction | null = null;
          state.doc.descendants((node, pos) => {
            if (!node.isInline) return true;
            const atom = atomOf(node.marks);
            if (!atom) return false;
            const wanted = atom.marks
              .filter((spec) => state.schema.marks[spec.type])
              .map((spec) => state.schema.marks[spec.type].create(spec.attrs ?? {}));
            const bandRun = node.marks.find((mark) => mark.type === markType);
            // A tracked change of Word's content (its own, or a Delete made
            // with Track Changes on) is not formatting the editor put on it:
            // it stays, and is written back as Word's w:ins / w:del.
            const tracked = node.marks.filter((mark) => TRACKED_CHANGE_MARKS.has(mark.type.name));
            const formatting = wanted.filter((mark) => mark.type !== markType && !TRACKED_CHANGE_MARKS.has(mark.type.name));
            const target = [...formatting, ...(bandRun ? [bandRun] : []), ...tracked];
            const same =
              target.length === node.marks.length && target.every((mark) => mark.isInSet(node.marks));
            if (same) return false;
            tr = tr ?? state.tr;
            for (const mark of node.marks) tr.removeMark(pos, pos + node.nodeSize, mark);
            for (const mark of target) tr.addMark(pos, pos + node.nodeSize, mark);
            return false;
          });
          if (tr) (tr as Transaction).setMeta("addToHistory", false);
          return tr;
        }),
      }),
    ];
  },
});
