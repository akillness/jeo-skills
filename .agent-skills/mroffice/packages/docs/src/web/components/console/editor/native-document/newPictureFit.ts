/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A picture put into the document is stored at a size that fits the text
 * area, the way Word's Insert Picture stores it.
 *
 * Measured in Word 16.86 (Letter, 1 in margins, text area 432 x 648 pt):
 * `make new inline picture` of a picture larger than the text area stores it
 * scaled proportionally to fit in BOTH directions (600 x 1800 becomes
 * 216 x 648, 1800 x 600 becomes 432 x 144); one that already fits keeps its
 * size. A picture whose STORED size is over the page (opened from a file) is
 * not touched: Word draws it at that size and the paper's edge ends it.
 *
 * Every way a picture enters (Insert Picture, a pasted or dropped image, a
 * screenshot, a picture by its address, the assistant's insert) writes the
 * node without a size, because the picture's own size is only known once it
 * has loaded. This plugin remembers such a picture from the transaction that
 * put it in; when its image has loaded, the image node view asks for the
 * transaction that stores the fitted size. That write is an edit like the
 * insertion itself: only an authored change reaches the shared document and
 * the save (a change kept out of history stays in this view alone until the
 * next gesture), and following the insertion at once it joins its Undo step.
 *
 * A picture is "put in" by any local edit that inserts a size-less picture
 * node. The paginator's moves, a collaborator's change and the replacement
 * of the whole document (opening, re-hydration) are not edits of that kind:
 * a document is never re-sized by being opened.
 */
import { EMU_PER_PX } from "@mrnote/core/web/lib/office-units.ts";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";

import { fitDrawingWithinPageBox, type DrawingSize } from "@mrnote/core/web/lib/paged-layout/drawingPageFit.ts";

import { isPictureNode } from "@mrnote/core/web/components/console/editor/native-document/documentObjectNodes.ts";

/** The paginator's own transactions (pageRebalanceExtension REBALANCE_META). */
const STRUCTURAL_REBALANCE_META = "structuralRebalance";
/** y-prosemirror's sync plugin key, as a transaction meta name. */
const Y_SYNC_META = "y-sync$";

interface NewPictureState {
  /** Positions of pictures waiting for their image to load. */
  pending: readonly number[];
}

export const newPictureFitKey = new PluginKey<NewPictureState>("mrnote-new-picture-fit");

const NONE: NewPictureState = { pending: [] };

function positive(value: unknown): boolean {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

/** A picture node that states no size of its own. */
export function isSizelessPicture(node: ProseMirrorNode | null | undefined): boolean {
  // A picture in line with text is one too: Word fits it the same way (a
  // 180 x 90 pt inline picture put into a 72 pt table column is stored
  // 71 x 35.5), and it was left without a size, its Height and Width empty.
  if (!node || !isPictureNode(node)) return false;
  const attrs = node.attrs;
  return (
    !positive(attrs.width) &&
    !positive(attrs.height) &&
    !positive(attrs.widthEmu) &&
    !positive(attrs.heightEmu) &&
    !positive(attrs.widthPercent)
  );
}

function sliceHoldsSizelessPicture(slice: Slice | undefined): boolean {
  if (!slice || slice.content.size === 0) return false;
  let found = false;
  slice.content.descendants((node) => {
    if (found) return false;
    if (isSizelessPicture(node)) found = true;
    // Into paragraphs too: a picture in line with text stands among words.
    return !found;
  });
  return found;
}

/** A local edit: not the paginator, not a collaborator, not the whole
 * document being put in place. */
function isLocalEdit(transaction: Transaction): boolean {
  if (!transaction.docChanged) return false;
  if (transaction.getMeta(STRUCTURAL_REBALANCE_META) === true) return false;
  const sync = transaction.getMeta(Y_SYNC_META) as { isChangeOrigin?: unknown; isUndoRedoOperation?: unknown } | undefined;
  if (sync?.isChangeOrigin === true && sync.isUndoRedoOperation !== true) return false;
  // What a paste or a drop brings is put in, however much it replaces.
  const uiEvent = transaction.getMeta("uiEvent");
  if (transaction.getMeta("paste") === true || uiEvent === "paste" || uiEvent === "drop") return true;
  // The whole document put in place (opening, re-hydration): the step
  // replaces everything, down to the first sheet's own content when the
  // sheet itself is kept.
  return !transaction.steps.some(
    (step, index) =>
      step instanceof ReplaceStep && step.from <= 1 && step.to >= transaction.docs[index].content.size - 1,
  );
}

/** What makes two picture nodes the same picture. */
function pictureKey(node: ProseMirrorNode): string {
  return `${String(node.attrs.attachment_id ?? "")}|${String(node.attrs.src ?? "")}`;
}

/** The size-less pictures `transaction` put in, by position in its final
 * document. A step that rewrites a picture where it stands (a block identity
 * given, an attribute set) puts nothing in. */
function newPicturesOf(transaction: Transaction): number[] {
  const found: number[] = [];
  transaction.steps.forEach((step, index) => {
    const range = step as unknown as { slice?: Slice; from?: number; to?: number };
    if (!sliceHoldsSizelessPicture(range.slice)) return;
    const replaced = new Set<string>();
    const before = transaction.docs[index];
    if (typeof range.from === "number" && typeof range.to === "number" && range.to > range.from) {
      before.nodesBetween(range.from, Math.min(range.to, before.content.size), (node) => {
        if (isPictureNode(node)) replaced.add(pictureKey(node));
        return true;
      });
    }
    const rest = transaction.mapping.slice(index + 1);
    step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const from = rest.map(newStart, -1);
      const to = rest.map(newEnd, 1);
      transaction.doc.nodesBetween(from, to, (node, pos) => {
        if (isSizelessPicture(node) && !replaced.has(pictureKey(node)) && !found.includes(pos)) found.push(pos);
        return true;
      });
    });
  });
  return found;
}

/** Whether the picture at `pos` was just put in and still waits for its size. */
export function isNewPictureAt(state: EditorState, pos: number): boolean {
  return newPictureFitKey.getState(state)?.pending.includes(pos) === true;
}

/**
 * The size Word's Insert Picture stores for a picture of `natural` size in a
 * text area of `textArea`: fitted in both directions, aspect kept; null for a
 * picture that already fits.
 */
export function newPictureStoredSize(natural: DrawingSize, textArea: DrawingSize): DrawingSize | null {
  const fitted = fitDrawingWithinPageBox(natural, textArea);
  if (!fitted || !fitted.fitted) return null;
  return { width: Math.max(1, Math.round(fitted.width)), height: Math.max(1, Math.round(fitted.height)) };
}

/**
 * The transaction that settles the new picture at `pos` now that its image
 * has loaded: its fitted size when it is larger than the text area, its own
 * size otherwise, and in every case the end of its wait. Null when no new
 * picture waits there.
 */
export function buildNewPictureFit(
  state: EditorState,
  pos: number,
  natural: DrawingSize,
  textArea: DrawingSize,
): Transaction | null {
  if (!isNewPictureAt(state, pos)) return null;
  // The settle completes the insertion that put the picture here; it is not
  // an edit of its own, so one Undo takes the whole insertion back. As a
  // history step it made the first Undo look like nothing happened and a
  // replaced picture needed two (WUA 152).
  const tr = state.tr
    .setMeta(newPictureFitKey, { settled: pos })
    .setMeta("addToHistory", false);
  const node = state.doc.nodeAt(pos);
  // A picture that fits keeps its own size, stated as Word states every
  // picture's extent: left size-less, its Height and Width boxes read
  // nothing and Crop stayed unavailable until a size was typed (WUA 026).
  const size = isSizelessPicture(node)
    ? (newPictureStoredSize(natural, textArea) ??
      (natural.width > 0 && natural.height > 0
        ? { width: Math.max(1, Math.round(natural.width)), height: Math.max(1, Math.round(natural.height)) }
        : null))
    : null;
  if (node && size) {
    tr.setNodeMarkup(
      pos,
      undefined,
      {
        ...node.attrs,
        width: size.width,
        height: size.height,
        widthEmu: Math.round(size.width * EMU_PER_PX),
        heightEmu: Math.round(size.height * EMU_PER_PX),
      },
      node.marks,
    );
  }
  return tr;
}

export const NewPictureFit = Extension.create({
  name: "newPictureFit",

  addProseMirrorPlugins() {
    return [
      new Plugin<NewPictureState>({
        key: newPictureFitKey,
        state: {
          init: () => NONE,
          apply(transaction, value, _oldState, newState) {
            const settled = (transaction.getMeta(newPictureFitKey) as { settled?: number } | undefined)?.settled;
            let pending = value.pending;
            if (settled !== undefined) pending = pending.filter((pos) => pos !== settled);
            if (transaction.docChanged) {
              if (pending.length > 0) {
                pending = pending
                  .map((pos) => transaction.mapping.map(pos, 1))
                  .filter((pos, index, all) => all.indexOf(pos) === index && isSizelessPicture(newState.doc.nodeAt(pos)));
              }
              if (isLocalEdit(transaction)) {
                const fresh = newPicturesOf(transaction).filter((pos) => !pending.includes(pos));
                if (fresh.length > 0) pending = [...pending, ...fresh];
              }
            }
            const same = pending.length === value.pending.length && pending.every((pos, index) => pos === value.pending[index]);
            return same ? value : { pending };
          },
        },
      }),
    ];
  },
});

export default NewPictureFit;
