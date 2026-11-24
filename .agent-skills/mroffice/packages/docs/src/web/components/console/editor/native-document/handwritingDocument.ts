/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A handwriting document's page rules (lib/handwriting-paper): its pages, and
 * the page as ink only.
 *
 * Pages. A page is the run of blocks up to and including the page break that
 * ends it (the last page has none): Add Page appends Word's blank page (a
 * break and a paragraph, trailingBlankPage), Delete Page removes one page's
 * blocks -- and the ink and objects anchored in them -- with the break that
 * parted it from its neighbour, in one Undo step. Add Page puts the new page
 * after the one in view (insertHandwritingPageAfter), as Delete Page takes it. The cover (the first page of
 * a document that has one) is never deleted, and a document always keeps one
 * page of paper.
 *
 * Ink only. The page takes no text at all: the editor stays editable for the
 * pen (ink lands through ProseMirror transactions, which need
 * `view.editable`), while its DOM is held non-editable (lib/ink-scribble-guard
 * `holdScribbleOff`, the hold the Draw tab already uses for Scribble, which
 * keeps every editable inside the page non-editable as ProseMirror rewrites
 * it), so no caret, no keyboard, no IME and no paste reach it; a plugin
 * refuses whatever text input still arrives (a drop, a stray beforeinput).
 */

import type { Editor } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { closeHistory } from "@tiptap/pm/history";

import { holdScribbleOff } from "@mrnote/core/web/lib/ink-scribble-guard.ts";
import { normalizeHandwritingDocument } from "@mrnote/core/web/lib/handwriting-paper.ts";
import { documentShapeDefaultAttrs, normalizeDocumentShapeAttrs } from "@mrnote/core/web/lib/document-shapes.ts";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { appendBlankPageAtDocumentEnd, blankPageBodyBlocks, blankPageCopyAttrs } from "@mrnote/core/web/components/console/editor/native-document/trailingBlankPage.ts";
import { insertDocumentFloatingObjects } from "@mrnote/core/web/components/console/editor/native-document/documentInk.ts";
import { clipToVisibleEditor } from "@mrnote/core/web/components/console/editor/native-document/visibleEditorClip.ts";
import { documentShapeMultiSelection, documentShapeMultiSelectionKey } from "@mrnote/core/web/components/console/editor/native-document/documentShapeExtension.ts";

export interface HandwritingPage {
  /** The page's first block. */
  readonly from: number;
  /** After its last block (its page break, when it has one). */
  readonly to: number;
  /** Where its ending page break stands, or null for the last page. */
  readonly breakPos: number | null;
}

/** The document's pages as its page breaks part them. */
export function handwritingPages(doc: ProseMirrorNode): HandwritingPage[] {
  const pages: HandwritingPage[] = [];
  let from: number | null = null;
  let to = 0;
  for (const { pos, node } of blankPageBodyBlocks(doc)) {
    if (from === null) from = pos;
    to = pos + node.nodeSize;
    if (node.type.name === "pageBreak") {
      pages.push({ from, to, breakPos: pos });
      from = null;
    }
  }
  if (from !== null) pages.push({ from, to, breakPos: null });
  return pages;
}

export function handwritingHasCover(doc: ProseMirrorNode): boolean {
  return normalizeHandwritingDocument(doc.attrs.handwritingDocument)?.cover != null;
}

/** Why page `index` cannot be deleted, or null when it can. */
export function handwritingPageDeleteRefusal(
  doc: ProseMirrorNode,
  index: number,
): "cover" | "last" | "none" | null {
  const pages = handwritingPages(doc);
  if (index < 0 || index >= pages.length) return "none";
  const cover = handwritingHasCover(doc);
  if (cover && index === 0) return "cover";
  if (pages.length - (cover ? 1 : 0) <= 1) return "last";
  return null;
}

/** Add Page: a page of the same paper after the last, in one Undo step. */
export function appendHandwritingPage(editor: Editor): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const { state, view } = editor;
  const transaction = state.tr;
  if (!appendBlankPageAtDocumentEnd(transaction)) return false;
  view.dispatch(closeHistory(transaction));
  return true;
}

/**
 * Add Page where the reader is: a page of the same paper right after page
 * `index` (the one in view, as Delete Page takes it), in one Undo step. After
 * the last page, or with no page known, it is Add Page at the end. Returns
 * the new page's index, or null when nothing was added.
 */
export function insertHandwritingPageAfter(editor: Editor, index: number | null): number | null {
  if (editor.isDestroyed || !editor.isEditable) return null;
  const { state, view } = editor;
  const pages = handwritingPages(state.doc);
  if (index === null || index < 0 || index >= pages.length - 1) {
    return appendHandwritingPage(editor) ? handwritingPages(editor.state.doc).length - 1 : null;
  }
  const schema = state.schema;
  const pageBreakType = schema.nodes.pageBreak;
  const paragraphType = schema.nodes.paragraph;
  if (!pageBreakType || !paragraphType) return null;
  // The new page is an empty paragraph and its own break, set before the
  // next page's first block; the paragraph is formatted like the page's own.
  let source: ProseMirrorNode | null = null;
  state.doc.nodesBetween(pages[index]!.from, pages[index]!.to, (node) => {
    if (!source && node.type === paragraphType) source = node;
    return !source;
  });
  const pieces = Fragment.from([
    paragraphType.create(source ? blankPageCopyAttrs(source) : null),
    pageBreakType.create(),
  ]);
  const at = pages[index + 1]!.from;
  const $at = state.doc.resolve(at);
  if (!$at.parent.canReplace($at.index(), $at.index(), pieces)) return null;
  view.dispatch(closeHistory(state.tr.insert(at, pieces)));
  return index + 1;
}

/** Delete Page: page `index` and everything on it, in one Undo step. */
export function deleteHandwritingPage(editor: Editor, index: number): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const { state, view } = editor;
  if (handwritingPageDeleteRefusal(state.doc, index) !== null) return false;
  const pages = handwritingPages(state.doc);
  const page = pages[index]!;
  // The last page goes with the break before it; any other with its own.
  const from = page.breakPos === null ? pages[index - 1]!.breakPos! : page.from;
  const to = page.to;
  const transaction = state.tr.deleteRange(from, to);
  if (!transaction.docChanged) return false;
  view.dispatch(closeHistory(transaction));
  return true;
}








function visibleFrame(view: EditorView): { top: number; bottom: number } | null {
  const visible = clipToVisibleEditor(view.dom, { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
  return visible ? { top: visible.top, bottom: visible.top + visible.height } : null;
}

/** The page shown in the middle of the window: its index among the document's pages. */
export function handwritingPageInView(view: EditorView): number | null {
  const sheets = Array.from(view.dom.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.matches("article[data-page-sheet]"),
  );
  if (sheets.length === 0) return null;
  const frame = visibleFrame(view);
  if (!frame) return null;
  const middle = (frame.top + frame.bottom) / 2;
  let best: HTMLElement | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const sheet of sheets) {
    const rect = sheet.getBoundingClientRect();
    if (rect.height <= 0) continue;
    const away = middle < rect.top ? rect.top - middle : middle > rect.bottom ? middle - rect.bottom : 0;
    if (away < distance) {
      distance = away;
      best = sheet;
    }
  }
  if (!best) return null;
  let pos: number;
  try {
    pos = view.posAtDOM(best, 0);
  } catch {
    return null;
  }
  const pages = handwritingPages(view.state.doc);
  const found = pages.findIndex((page) => pos < page.to);
  return found >= 0 ? found : pages.length - 1;
}

/**
 * The page (its sheet's place, 0 the first) under a client point, or null
 * between or beside the pages. A handwriting document's sheets are its
 * pages one for one.
 */
export function handwritingSheetIndexAt(view: EditorView, at: { x: number; y: number }): number | null {
  const sheets = Array.from(view.dom.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.matches("article[data-page-sheet]"),
  );
  const index = sheets.findIndex((sheet) => {
    const rect = sheet.getBoundingClientRect();
    return at.x >= rect.left && at.x <= rect.right && at.y >= rect.top && at.y <= rect.bottom;
  });
  return index >= 0 ? index : null;
}

/** The sheet in the middle of the window (where a picture is put). */
function sheetInView(view: EditorView): HTMLElement | null {
  const sheets = Array.from(view.dom.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.matches("article[data-page-sheet]"),
  );
  const frame = visibleFrame(view);
  if (!frame) return sheets[0] ?? null;
  const middle = (frame.top + frame.bottom) / 2;
  return (
    sheets.find((sheet) => {
      const rect = sheet.getBoundingClientRect();
      return rect.top <= middle && rect.bottom >= middle;
    }) ??
    sheets[0] ??
    null
  );
}

/* --------------------------------------------------------------- ink only */

const HANDWRITING_TEXT_LOCK = new PluginKey("handwritingTextLock");

/** A key that would write, delete or break text (Undo, Redo and the rest pass). */
function writesText(event: KeyboardEvent): boolean {
  if (event.isComposing) return true;
  if (event.metaKey || event.ctrlKey) return ["v", "x"].includes(event.key.toLowerCase());
  if (event.key === "Enter" || event.key === "Tab") return true;
  return event.key.length === 1;
}

/** The floating object (a picture, converted text's box) a text selection's end lies in, as its position. */
function objectAround(state: EditorState, pos: number): number | null {
  return objectAroundIn(state.doc, pos);
}

function objectAroundIn(doc: ProseMirrorNode, pos: number): number | null {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "documentShape") return $pos.before(depth);
  }
  return null;
}








function keepWordsUnselected(transactions: readonly Transaction[], _old: EditorState, state: EditorState): Transaction | null {
  if (!transactions.some((transaction) => transaction.selectionSet || transaction.docChanged)) return null;
  const selection = state.selection;
  if (!(selection instanceof TextSelection)) return null;
  const object = objectAround(state, selection.from) ?? objectAround(state, selection.to);
  if (object === null) return null;
  return state.tr.setSelection(NodeSelection.create(state.doc, object)).setMeta("addToHistory", false);
}

/** A caret on the paper near `pos`, outside every object (a caret in an object's words would select the object again). */
function caretOffObjects(doc: ProseMirrorNode, pos: number): TextSelection | null {
  for (const dir of [-1, 1] as const) {
    let at = Math.max(0, Math.min(doc.content.size, pos));
    for (let step = 0; step < 64; step += 1) {
      const found = TextSelection.findFrom(doc.resolve(at), dir, true);
      if (!(found instanceof TextSelection)) break;
      const object = objectAroundIn(doc, found.from);
      if (object === null) return found;
      at = dir < 0 ? object : object + (doc.nodeAt(object)?.nodeSize ?? 1);
    }
  }
  return null;
}

/** The selected object (or objects): a NodeSelection's object, or Ctrl / touch multi-selection's. */
function objectsPicked(state: EditorState): boolean {
  if (documentShapeMultiSelection(state).length > 0) return true;
  return state.selection instanceof NodeSelection && state.selection.node.type.name === "documentShape";
}

const PAGE_SURFACE = '[data-testid="note-editor-page-surface"]';
/** What a press on is the selection's own, or another object's: those act on the press themselves. */
const OBJECT_OWN =
  'figure[data-document-shape], [data-document-selection-chrome], [data-testid="document-ink-lasso-selection"], [data-ink-lasso-commands="true"]';
/** A tap, not the start of a scroll or a stroke: it lifts within this far and this soon. */
const TAP_SLOP_PX = 10;
const TAP_MS = 700;












function dropObjectSelectionOnTap(editor: Editor): () => void {
  let press: { id: number; x: number; y: number; at: number } | null = null;
  const hostOf = (): HTMLElement => {
    const dom = editor.view.dom as HTMLElement;
    return dom.closest<HTMLElement>(PAGE_SURFACE) ?? dom;
  };
  const onDown = (event: PointerEvent) => {
    press = null;
    if (editor.isDestroyed || !event.isPrimary || event.button > 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !hostOf().contains(target) || target.closest(OBJECT_OWN)) return;
    // A stroke drawn in its sheet's ink layer is pressed in the layer's
    // shadow root (paged/inkSheetLayer hands the press to the stroke).
    const own = event.composedPath()[0];
    if (own instanceof Element && own !== target && own.closest(`${OBJECT_OWN}, [data-ink-stroke]`)) return;
    if (!objectsPicked(editor.state)) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp };
  };
  const onUp = (event: PointerEvent) => {
    const down = press;
    press = null;
    if (!down || down.id !== event.pointerId || editor.isDestroyed) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > TAP_SLOP_PX || event.timeStamp - down.at > TAP_MS) return;
    const { state, view } = editor;
    if (!objectsPicked(state)) return;
    let at = state.selection.from;
    try {
      at = view.posAtCoords({ left: down.x, top: down.y })?.pos ?? at;
    } catch {
      // no layout to read (a hidden window): beside the selection
    }
    const caret = caretOffObjects(state.doc, at);
    let transaction = state.tr.setMeta(documentShapeMultiSelectionKey, { positions: [], lasso: null });
    if (caret) transaction = transaction.setSelection(caret);
    view.dispatch(transaction);
  };
  const onCancel = (event: PointerEvent) => {
    if (press?.id === event.pointerId) press = null;
  };
  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onCancel, true);
  return () => {
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
  };
}

/**
 * Hold `editor`'s page as ink only (see the module note). Returns the way back.
 * Selected objects (a stroke, a picture) can still be deleted with Delete or
 * Backspace; nothing types.
 */
export function holdHandwritingInkOnly(editor: Editor): () => void {
  if (editor.isDestroyed) return () => {};
  const dom = editor.view.dom as HTMLElement;
  const releaseDom = holdScribbleOff([dom]);
  const block = (_view: EditorView, event: Event) => {
    event.preventDefault();
    return true;
  };
  const plugin = new Plugin({
    key: HANDWRITING_TEXT_LOCK,
    appendTransaction: keepWordsUnselected,
    props: {
      handleTextInput: () => true,
      handlePaste: (_view, event) => {
        event.preventDefault();
        return true;
      },
      handleDrop: (_view, event) => {
        event.preventDefault();
        return true;
      },
      handleKeyDown: (_view, event) => writesText(event),
      handleDOMEvents: {
        beforeinput: block,
        compositionstart: block,
        compositionupdate: block,
        compositionend: block,
        // a double click selected the word under it; there are none to pick
        dblclick: block,
      },
    },
  });
  editor.registerPlugin(plugin);
  const releaseTaps = dropObjectSelectionOnTap(editor);
  return () => {
    releaseTaps();
    releaseDom();
    if (!editor.isDestroyed) editor.unregisterPlugin(HANDWRITING_TEXT_LOCK);
  };
}

/* ---------------------------------------------------------------- pictures */

/** The longest side and the data URL a picture's fill keeps (the API's bound). */
const PICTURE_MAX_SIDE_PX = 1800;
const PICTURE_MAX_DATA_URL = 1_900_000;

async function pictureDataUrl(file: File): Promise<{ src: string; width: number; height: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    // An SVG with no size of its own states none: drawn at a page-friendly
    // 300px square rather than a 1px (then 24px) speck.
    const width = image.naturalWidth || 300;
    const height = image.naturalHeight || (image.naturalWidth ? 1 : 300);
    const keepAlpha = /png|gif|webp|svg/i.test(file.type);
    for (let side = PICTURE_MAX_SIDE_PX; side >= 200; side = Math.round(side * 0.7)) {
      const ratio = Math.min(1, side / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      const context = canvas.getContext("2d");
      if (!context) return null;
      if (!keepAlpha) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const src = keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.88);
      if (src.length <= PICTURE_MAX_DATA_URL) return { src, width, height };
      if (keepAlpha) {
        // A JPEG has no transparency: what was see-through is white, as a
        // picture pasted on paper (it was black, the canvas's empty pixels).
        context.globalCompositeOperation = "destination-over";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = "source-over";
        const jpeg = canvas.toDataURL("image/jpeg", 0.85);
        if (jpeg.length <= PICTURE_MAX_DATA_URL) return { src: jpeg, width, height };
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Insert > Pictures on a handwriting document: each picture a floating object
 * over the paper of the page in view (a shape with the picture as its fill,
 * In Front Of Text), at its own size up to most of the page's width, centred
 * on what shows of the page; several step down and across. One Undo step.
 */
export async function insertHandwritingPictures(editor: Editor, files: readonly File[]): Promise<boolean> {
  return insertPicturesOverPageInView(editor, files);
}

/**
 * Pictures as floating objects over the page in view, as a handwriting
 * document's Insert > Pictures puts them (any paged document takes them so).
 * Draw ▸ Stickers puts each sticker so, `widthPx` wide on the page.
 */
export async function insertPicturesOverPageInView(
  editor: Editor,
  files: readonly File[],
  options: { readonly widthPx?: number; readonly altText?: string } = {},
): Promise<boolean> {
  if (editor.isDestroyed || !editor.isEditable || files.length === 0) return false;
  const pictures = (await Promise.all(files.map(pictureDataUrl))).filter(
    (picture): picture is NonNullable<typeof picture> => picture !== null,
  );
  if (editor.isDestroyed || pictures.length === 0) return false;
  const view = editor.view;
  const sheet = sheetInView(view);
  if (!sheet) return false;
  const rect = sheet.getBoundingClientRect();
  const scale = sheet.offsetWidth > 0 ? rect.width / sheet.offsetWidth : 1;
  const frame = visibleFrame(view) ?? rect;
  const visibleTop = Math.max(rect.top, frame.top);
  const visibleBottom = Math.min(rect.bottom, frame.bottom);
  const centreY = (visibleTop + visibleBottom) / 2;
  const objects = pictures.map((picture, index) => {
    const maxWidth = rect.width * 0.6;
    const maxHeight = Math.max(80, (visibleBottom - visibleTop) * 0.7);
    const natural = options.widthPx
      ? { width: options.widthPx * scale, height: (options.widthPx * scale * picture.height) / Math.max(1, picture.width) }
      : { width: picture.width * scale, height: picture.height * scale };
    const fit = Math.min(1, maxWidth / natural.width, maxHeight / natural.height);
    const width = Math.max(24, natural.width * fit);
    const height = Math.max(24, natural.height * fit);
    const step = index * 24 * scale;
    return {
      box: {
        left: rect.left + (rect.width - width) / 2 + step,
        top: Math.max(rect.top, centreY - height / 2) + step,
        width,
        height,
      },
      attrs: normalizeDocumentShapeAttrs({
        ...documentShapeDefaultAttrs("rect"),
        fill: "#ffffff",
        fillPicture: { src: picture.src, stretch: true },
        outline: "none",
        lockAspectRatio: true,
        ...(options.altText ? { altText: options.altText } : {}),
      }),
    };
  });
  return insertDocumentFloatingObjects(view, objects);
}
