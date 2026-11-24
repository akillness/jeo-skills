/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pictures, shapes and text boxes of a header/footer story, in the story
 * editor.
 *
 * A band picture belongs to its line (`BandRichParagraph.images`, carried on
 * the story's paragraph as `bandPassthrough.images`): the painted band draws
 * it after the line's runs, and an imported header writes a new one at the
 * end of that line (Word's inline picture run; `nativeStoryEdits.ts`). The
 * line's shapes (`shapes`) and the text boxes whose words are its runs
 * (`frames`) ride on the same passthrough. The story editor draws each
 * line's objects where the band draws its inline ones and lets the user do
 * what Word's header pane does with them:
 *
 * - click an object to select it (Word's selection frame);
 * - drag a handle to size it: a picture's corner keeps its proportions
 *   (Word's Lock aspect ratio is on for a picture: Format Picture > Size); a
 *   shape or text box sizes freely by its right, bottom or corner handle
 *   (Word's lock is off for them), unless the shape states the lock;
 * - Delete or Backspace removes the selected object -- a text box with its
 *   words, as Word's Delete on a selected text box does;
 * - Insert > Pictures (the Header & Footer tab's Pictures) puts a picture at
 *   the end of the caret's line, at its own size (96 dpi) and no wider than
 *   the text column, as Word sizes an inserted picture.
 *
 * Only Word's own objects the save can write (`nativeObject`) and pictures
 * are offered a handle; any other drawing is drawn and left alone.
 */

import { EMU_PER_PX } from "@mrnote/core/web/lib/office-units.ts";
import { beginObjectDragGesture } from "@mrnote/core/web/lib/object-drag-gesture.ts";
import { drawDocumentPicture } from "@mrnote/core/web/lib/document-picture-references.ts";
import {
  isCompatMouseFromTouch,
  isTouchLikePointer,
} from "@mrnote/core/web/lib/pointer-capability.ts";
import { Extension, type Editor } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import type { BandRichFrame, BandRichImage, BandRichShape } from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import { bandMemberTextMirrored, buildBandShape } from "@mrnote/core/web/components/console/editor/native-document/paged/bandRichDom.ts";
import { mountDocumentShapeRichTextField, type DocumentShapeRichTextField } from "@mrnote/core/web/components/console/editor/native-document/documentShapeRichTextField.tsx";
import { handleOfficeShapeTextKey } from "@mrnote/core/web/components/office-ribbon/OfficeShapeTextField.tsx";
import { BAND_RUN_MARK_NAME } from "@mrnote/core/web/components/console/editor/native-document/paged/bandRunMark.ts";
import {
  OFFICE_PICTURE_SRC_MAX_LENGTH,
  officePictureFileByteCeiling,
  readFittedPicture,
} from "@mrnote/core/web/lib/office-picture-envelope.ts";

/** Word's 96 dpi: EMU per CSS pixel (the band painter's own ratio). */
export const BAND_PICTURE_EMU_PER_PX = EMU_PER_PX;
/** The widest a picture is inserted at when the column is unknown: Letter's
 * 6.5in text width. */
const DEFAULT_COLUMN_EMU = 5_943_600;
/**
 * A band picture is held inline in the page, so its data: URL must fit the
 * page envelope's single-string bound (lib/office-picture-envelope). It was
 * allowed 2,000,000 characters here while the save refuses any string past
 * 1 MiB, so a 0.8-1.5 MB picture went in and then every save of the
 * document failed. A PNG or JPEG past the bound is now fitted to it as an
 * Excel or slide inline picture is; a GIF must fit as it is.
 */
const MAX_PICTURE_DATA_URL = OFFICE_PICTURE_SRC_MAX_LENGTH;
const PICTURE_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);
const MIN_PICTURE_PX = 8;

/** What a line's object list is on its paragraph's passthrough. */
export type BandStoryObjectKind = "images" | "shapes" | "frames";

interface Selected {
  /** Position of the paragraph holding the object. */
  pos: number;
  kind: BandStoryObjectKind;
  index: number;
}

const bandStoryPicturesKey = new PluginKey<Selected | null>("bandStoryPictures");

type Passthrough = { images?: BandRichImage[]; shapes?: BandRichShape[]; frames?: BandRichFrame[] };

function passthroughOf(node: PmNode): Passthrough {
  return (node.attrs.bandPassthrough as Passthrough | null | undefined) ?? {};
}

function imagesOf(node: PmNode): BandRichImage[] {
  const images = passthroughOf(node).images;
  return Array.isArray(images) ? images : [];
}

function listOf<K extends BandStoryObjectKind>(node: PmNode, kind: K): NonNullable<Passthrough[K]> {
  const list = passthroughOf(node)[kind];
  return (Array.isArray(list) ? list : []) as NonNullable<Passthrough[K]>;
}

/** The transaction that gives the paragraph at `pos` this object list. */
function withList(state: EditorState, pos: number, kind: BandStoryObjectKind, list: readonly unknown[]): Transaction | null {
  const node = state.doc.nodeAt(pos);
  if (!node || !("bandPassthrough" in node.attrs)) return null;
  const passthrough = { ...((node.attrs.bandPassthrough as Record<string, unknown> | null) ?? {}) };
  if (list.length) passthrough[kind] = list;
  else delete passthrough[kind];
  return state.tr.setNodeAttribute(pos, "bandPassthrough", Object.keys(passthrough).length ? passthrough : null);
}

function withImages(state: EditorState, pos: number, images: BandRichImage[]): Transaction | null {
  return withList(state, pos, "images", images);
}

function pixels(emu: number | undefined, fallback: number): number {
  return emu ? Math.max(1, Math.round(emu / BAND_PICTURE_EMU_PER_PX)) : fallback;
}

/** Whether the story may size and remove this object: a picture always (a
 * new one is written as Word's; one of Word's own by its id), a shape or a
 * text box only when it is one of Word's the save can write. */
function offered(kind: BandStoryObjectKind, item: { nativeObject?: string }): boolean {
  return kind === "images" || item.nativeObject !== undefined;
}

/** The words a text box draws: the line's runs tagged with it. */
function boxWords(node: PmNode, index: number): string {
  let text = "";
  node.forEach((child) => {
    const frame = child.marks.find((mark) => mark.type.name === BAND_RUN_MARK_NAME)?.attrs.frame;
    if (frame === index) text += child.text ?? "";
  });
  return text;
}

type Handle = "corner" | "right" | "bottom";

function objectFrame(
  view: EditorView,
  pos: number,
  kind: BandStoryObjectKind,
  index: number,
  content: HTMLElement,
  selected: boolean,
  item: { nativeObject?: string },
  keepRatio: boolean,
): HTMLElement {
  const frame = document.createElement("span");
  frame.className = `sheet-band-story-picture sheet-band-story-object--${kind}`;
  frame.dataset.testid = kind === "images" ? "sheet-band-story-picture" : `sheet-band-story-${kind === "shapes" ? "shape" : "textbox"}`;
  if (item.nativeObject) frame.dataset.nativeObject = item.nativeObject;
  if (selected) frame.dataset.selected = "true";
  frame.appendChild(content);
  if (!offered(kind, item)) return frame;
  frame.addEventListener("mousedown", (event) => {
    event.preventDefault();
    view.focus();
    view.dispatch(view.state.tr.setMeta(bandStoryPicturesKey, { pos, kind, index }));
  });
  if (selected && view.editable) {
    // A picture sizes by its corner with its proportions kept; a shape or a
    // text box (Word's lock off) by its right, bottom or corner handle.
    const handles: Handle[] = kind === "images" ? ["corner"] : ["right", "bottom", "corner"];
    for (const which of handles) {
      const handle = document.createElement("span");
      handle.className = `sheet-band-story-picture__handle sheet-band-story-picture__handle--${which}`;
      handle.dataset.testid = which === "corner" ? "sheet-band-story-picture-handle" : `sheet-band-story-object-handle-${which}`;
      handle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        // a tap's compatibility mousedown: the pointerdown below had it
        if (isCompatMouseFromTouch(event)) return;
        startResize(view, pos, kind, index, content, which, keepRatio, event);
      });
      
      // pointer events through the shared object drag gesture.
      handle.addEventListener("pointerdown", (event) => {
        if (!isTouchLikePointer(event)) return;
        event.preventDefault();
        event.stopPropagation();
        startResize(view, pos, kind, index, content, which, keepRatio, event);
      });
      frame.appendChild(handle);
    }
  }
  return frame;
}

function objectsWidget(view: EditorView, pos: number, node: PmNode, selected: Selected | null): HTMLElement {
  const host = document.createElement("span");
  host.className = "sheet-band-story-pictures";
  host.contentEditable = "false";
  const chosen = (kind: BandStoryObjectKind, index: number) =>
    selected !== null && selected.pos === pos && selected.kind === kind && selected.index === index;
  // The band's order: a line's shapes, then its pictures, after its words.
  listOf(node, "shapes").forEach((shape, index) => {
    const painted = buildBandShape(document, shape, index);
    painted.style.width = `${pixels(shape.widthEmu, 24)}px`;
    painted.style.height = `${pixels(shape.heightEmu, 24)}px`;
    if (shape.nativeGroup !== undefined && view.editable) offerMemberWords(view, pos, index, shape, painted);
    host.appendChild(objectFrame(view, pos, "shapes", index, painted, chosen("shapes", index), shape, shape.lockAspectRatio === true));
  });
  imagesOf(node).forEach((image, index) => {
    // An anchored picture is drawn where its anchor puts it by the painted
    // band, and is no object of the line the story sizes.
    if (image.floatAnchor) return;
    const img = document.createElement("img");
    drawDocumentPicture(img, image.src);
    img.alt = "";
    img.draggable = false;
    img.style.width = `${pixels(image.widthEmu, 48)}px`;
    img.style.height = image.heightEmu ? `${pixels(image.heightEmu, 24)}px` : "auto";
    host.appendChild(objectFrame(view, pos, "images", index, img, chosen("images", index), image, true));
  });
  // A text box is drawn as its box, at its size, showing the words it draws
  // (they are typed in the line, where the story holds them).
  listOf(node, "frames").forEach((box, index) => {
    if (box.blocks?.length) return;
    const outline = document.createElement("span");
    outline.className = "sheet-band-story-textbox";
    outline.style.width = `${pixels(box.widthEmu, 24)}px`;
    // A box Word sizes to its words (an in-line frame stating `autoHeight`)
    // states only a floor for its height.
    if (box.autoHeight) outline.style.minHeight = `${pixels(box.heightEmu, 24)}px`;
    else outline.style.height = `${pixels(box.heightEmu, 24)}px`;
    outline.textContent = boxWords(node, box.index);
    host.appendChild(objectFrame(view, pos, "frames", index, outline, chosen("frames", index), box, false));
  });
  return host;
}

type BandGroupMember = NonNullable<BandRichShape["groupMembers"]>[number];

/**
 * A group member with ``words`` typed into it as the save writes them (server
 * `_member_words_replacements`): line by line into the paragraphs that held
 * them, each line in the formatting of its paragraph's first run, a line the
 * member had no paragraph for laid like its last one. Nothing but the words
 * changes, which is what `memberWords` may say.
 */
export function retypedBandGroupMember(member: BandGroupMember, words: string): BandGroupMember {
  const lines = words.split("\n");
  let textRuns = member.textRuns;
  let textBody = member.textBody;
  if (member.textRuns?.length) {
    // Each shown line's first run, in order.
    const firsts: (typeof member.textRuns)[number][] = [];
    let atLineStart = true;
    for (const run of member.textRuns) {
      for (const [piece, words] of (run.text ?? "").split("\n").entries()) {
        if (piece > 0) atLineStart = true;
        if (atLineStart && words) {
          firsts.push(run);
          atLineStart = false;
        }
      }
    }
    if (!firsts.length) firsts.push(member.textRuns[0]);
    textRuns = lines.map((line, at) => ({
      ...firsts[Math.min(at, firsts.length - 1)],
      text: at < lines.length - 1 ? `${line}\n` : line,
    }));
  }
  const paragraphs = member.textBody?.paragraphs;
  if (member.textBody && paragraphs?.length) {
    textBody = {
      ...member.textBody,
      paragraphs: lines.map((line, at) => ({ ...paragraphs[Math.min(at, paragraphs.length - 1)], text: line })),
    };
  }
  return {
    ...member,
    text: words,
    ...(textRuns !== undefined ? { textRuns } : {}),
    ...(textBody !== undefined ? { textBody } : {}),
  };
}

/**
 * Word's own group of a header/footer line (`nativeGroup`): a double click on
 * a member that holds words opens them in the shared shape text box, over
 * the member, as Word's header pane does; Enter or a click away keeps them
 * (`memberWords` in the story's native edits), and so does Escape, as the
 * body's member text box does.
 */
function offerMemberWords(view: EditorView, pos: number, index: number, shape: BandRichShape, painted: HTMLElement): void {
  const members = shape.groupMembers ?? [];
  for (const cell of painted.querySelectorAll<HTMLElement>("[data-band-shape-member]")) {
    const memberIndex = members.findIndex((member) => member.memberId === cell.dataset.bandShapeMember);
    const member = members[memberIndex];
    if (!member || typeof member.text !== "string" || !member.text) continue;
    cell.style.pointerEvents = "auto";
    cell.dataset.bandShapeMemberWords = "true";
    cell.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (cell.querySelector("[data-band-member-words-editor]")) return;
      const box = document.createElement("span");
      box.dataset.bandMemberWordsEditor = "true";
      Object.assign(box.style, { position: "absolute", inset: "0", zIndex: "3", background: "var(--console-surface, #fff)" });
      // Typed unmirrored in a flipped member, like its label.
      if (bandMemberTextMirrored(shape, member)) box.style.transform = "scaleX(-1)";
      box.addEventListener("mousedown", (inner) => inner.stopPropagation());
      cell.appendChild(box);
      let field: DocumentShapeRichTextField | null = mountDocumentShapeRichTextField(box, {
        ariaLabel: member.text ?? "",
        testId: "sheet-band-story-member-words",
        maxLength: 2_000,
      });
      field.setContent({ text: member.text ?? "", runs: undefined, inherited: {}, style: {} });
      const element = field.element() as unknown as HTMLElement | null;
      element?.focus({ preventScroll: true });
      const close = (keep: boolean) => {
        if (!field) return;
        const words = field.content().text;
        field.destroy();
        field = null;
        box.remove();
        if (!keep || words === member.text) return;
        const current = view.state.doc.nodeAt(pos);
        if (!current) return;
        const shapes = listOf(current, "shapes");
        const now = shapes[index];
        if (!now || now.nativeGroup !== shape.nativeGroup) return;
        const nowMembers = [...(now.groupMembers ?? [])];
        const live = nowMembers[memberIndex];
        if (!live || live.memberId !== member.memberId) return;
        nowMembers[memberIndex] = retypedBandGroupMember(live, words);
        const next = shapes.map((item, at) => (at === index ? { ...item, groupMembers: nowMembers } : item));
        const transaction = withList(view.state, pos, "shapes", next);
        if (transaction) view.dispatch(transaction);
      };
      box.addEventListener("focusout", (inner) => {
        const related = (inner as FocusEvent).relatedTarget;
        if (related instanceof globalThis.Node && box.contains(related)) return;
        close(true);
      });
      box.addEventListener("keydown", (inner) => {
        inner.stopPropagation();
        const target = field?.element();
        if (!target) return;
        handleOfficeShapeTextKey(inner, target as unknown as HTMLTextAreaElement, {
          commit: () => close(true),
          leave: () => close(true),
        });
      });
    });
  }
}

/** Drag a handle: a corner keeps the object's proportions when it is locked
 * (a picture always), an edge sizes one dimension. */
function startResize(
  view: EditorView,
  pos: number,
  kind: BandStoryObjectKind,
  index: number,
  content: HTMLElement,
  which: Handle,
  keepRatio: boolean,
  start: MouseEvent,
): void {
  const rect = content.getBoundingClientRect();
  const width0 = rect.width || content.offsetWidth || 1;
  const height0 = rect.height || content.offsetHeight || 1;
  const styleWidth = parseFloat(content.style.width) || width0;
  const styleHeight = parseFloat(content.style.height) || height0;
  const scale = styleWidth / width0; // screen pixels to the story's own
  const ratio = styleHeight / styleWidth;
  let width = styleWidth;
  let height = styleHeight;
  const move = (event: MouseEvent) => {
    const dx = (event.clientX - start.clientX) * scale;
    const dy = (event.clientY - start.clientY) * scale;
    if (which !== "bottom") width = Math.max(MIN_PICTURE_PX, styleWidth + dx);
    if (which !== "right") height = Math.max(MIN_PICTURE_PX, styleHeight + dy);
    if (keepRatio) {
      if (which === "bottom") width = height / ratio;
      else height = width * ratio;
    }
    content.style.width = `${width}px`;
    content.style.height = `${height}px`;
  };
  const commit = () => {
    const tr = resizedObject(view.state, pos, kind, index, width, height);
    if (tr) view.dispatch(tr.setMeta(bandStoryPicturesKey, { pos, kind, index }));
  };
  if (start.type === "pointerdown" && isTouchLikePointer(start as PointerEvent)) {
    const styleWidthText = content.style.width;
    const styleHeightText = content.style.height;
    beginObjectDragGesture(
      start as PointerEvent,
      {
        onMove: (event) => move(event),
        onEnd: () => commit(),
        // the browser took the touch: the object keeps its size
        onCancel: () => {
          content.style.width = styleWidthText;
          content.style.height = styleHeightText;
        },
      },
      {
        element: start.currentTarget instanceof Element ? start.currentTarget : null,
        immediate: true,
        clickSlopPx: 1,
      },
    );
    return;
  }
  const up = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    commit();
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}

/** The transaction that gives an object of the line at `pos` this size in
 * the story's pixels (96 dpi), or null when nothing changes. */
export function resizedObject(
  state: EditorState,
  pos: number,
  kind: BandStoryObjectKind,
  index: number,
  widthPx: number,
  heightPx: number,
): Transaction | null {
  const node = state.doc.nodeAt(pos);
  if (!node) return null;
  const list = listOf(node, kind).slice() as Array<BandRichImage | BandRichShape | BandRichFrame>;
  const item = list[index];
  if (!item) return null;
  const widthEmu = Math.max(1, Math.round(widthPx * BAND_PICTURE_EMU_PER_PX));
  const heightEmu = Math.max(1, Math.round(heightPx * BAND_PICTURE_EMU_PER_PX));
  if (widthEmu === item.widthEmu && heightEmu === item.heightEmu) return null;
  list[index] = { ...item, widthEmu, heightEmu } as typeof item;
  return withList(state, pos, kind, list);
}

/**
 * The transaction that removes an object of the line at `pos`: a text box
 * goes with the words it draws (the line's runs tagged with it), as Word's
 * Delete on a selected text box removes the box and its text.
 */
export function removedObject(state: EditorState, pos: number, kind: BandStoryObjectKind, index: number): Transaction | null {
  const node = state.doc.nodeAt(pos);
  if (!node) return null;
  const list = listOf(node, kind) as Array<BandRichImage | BandRichShape | BandRichFrame>;
  const item = list[index];
  if (!item || !offered(kind, item)) return null;
  const tr = withList(state, pos, kind, list.filter((_item, at) => at !== index));
  if (!tr || kind !== "frames") return tr;
  const box = (item as BandRichFrame).index;
  const ranges: [number, number][] = [];
  node.forEach((child, offset) => {
    const frame = child.marks.find((mark) => mark.type.name === BAND_RUN_MARK_NAME)?.attrs.frame;
    if (frame === box) ranges.push([pos + 1 + offset, pos + 1 + offset + child.nodeSize]);
  });
  for (const [from, to] of ranges.reverse()) tr.delete(from, to);
  return tr;
}

export const BandStoryPictures = Extension.create({
  name: "bandStoryPictures",
  addProseMirrorPlugins() {
    return [
      new Plugin<Selected | null>({
        key: bandStoryPicturesKey,
        state: {
          init: () => null,
          apply: (tr, value) => {
            const meta = tr.getMeta(bandStoryPicturesKey) as Selected | null | undefined;
            if (meta !== undefined) return meta;
            if (!value) return null;
            // A selected object stays selected through its own changes; a
            // caret moved by the user, or an edit elsewhere, deselects it.
            if (tr.docChanged || tr.selectionSet) return null;
            return value;
          },
        },
        props: {
          decorations: (state) => {
            const selected = bandStoryPicturesKey.getState(state) ?? null;
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isTextblock) return true;
              const images = imagesOf(node);
              const shapes = listOf(node, "shapes");
              const frames = listOf(node, "frames").filter((box) => !box.blocks?.length);
              if (!images.length && !shapes.length && !frames.length) return false;
              const chosen = selected && selected.pos === pos ? `${selected.kind}${selected.index}` : "-";
              decorations.push(
                Decoration.widget(pos + node.nodeSize - 1, (view) => objectsWidget(view, pos, node, selected), {
                  side: 1,
                  ignoreSelection: true,
                  key: `band-pictures:${pos}:${chosen}:${images
                    .map((image) => `${image.src.length}:${image.src.slice(-24)}:${image.widthEmu}x${image.heightEmu}`)
                    .join("|")}:${shapes.map((shape) => `${shape.preset}:${shape.widthEmu}x${shape.heightEmu}`).join("|")}:${frames
                    .map((box) => `${box.index}:${box.widthEmu}x${box.heightEmu}:${boxWords(node, box.index)}`)
                    .join("|")}`,
                }),
              );
              return false;
            });
            return DecorationSet.create(state.doc, decorations);
          },
          handleKeyDown: (view, event) => {
            const selected = bandStoryPicturesKey.getState(view.state);
            if (!selected) return false;
            if (event.key === "Escape") {
              view.dispatch(view.state.tr.setMeta(bandStoryPicturesKey, null));
              return false;
            }
            if (event.key !== "Delete" && event.key !== "Backspace") return false;
            const tr = removedObject(view.state, selected.pos, selected.kind, selected.index);
            if (!tr) return false;
            event.preventDefault();
            view.dispatch(tr.setMeta(bandStoryPicturesKey, null));
            return true;
          },
        },
      }),
    ];
  },
});

/** The size Word inserts a picture at: its own pixels at 96 dpi, scaled
 * down to the column width with its proportions kept. */
export function insertedPictureSize(
  naturalWidth: number,
  naturalHeight: number,
  columnEmu: number = DEFAULT_COLUMN_EMU,
): { widthEmu: number; heightEmu: number } {
  const width = Math.max(1, Math.round(naturalWidth)) * BAND_PICTURE_EMU_PER_PX;
  const height = Math.max(1, Math.round(naturalHeight)) * BAND_PICTURE_EMU_PER_PX;
  const scale = width > columnEmu ? columnEmu / width : 1;
  return { widthEmu: Math.max(1, Math.round(width * scale)), heightEmu: Math.max(1, Math.round(height * scale)) };
}

function naturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("decode"));
    image.src = src;
  });
}

/** Whether a picture the story may hold (PNG, JPEG or GIF the band keeps). */
export function bandPictureFileOk(file: File): boolean {
  return PICTURE_TYPES.has(file.type) && file.size > 0 && file.size <= officePictureFileByteCeiling(file.type);
}

/**
 * Insert `file` at the end of the line the story's caret is in. False when
 * the file is not a picture the band can hold or the story has no line.
 */
export async function insertBandStoryPicture(
  editor: Editor,
  file: File,
  columnEmu?: number,
): Promise<boolean> {
  if (!bandPictureFileOk(file) || editor.isDestroyed || !editor.isEditable) return false;
  // Fitted to the page's bound without first holding the whole file as a
  // data: URL (a GIF only when it fits as it is).
  const fitted = await readFittedPicture(file).catch(() => null);
  if (!fitted) return false;
  const src = fitted.replace(/^data:image\/jpg;/, "data:image/jpeg;");
  if (!/^data:image\/(png|jpeg|gif);base64,/.test(src) || src.length > MAX_PICTURE_DATA_URL) return false;
  const { width, height } = await naturalSize(src);
  if (editor.isDestroyed) return false;
  const state = editor.state;
  const { $from } = state.selection;
  let depth = $from.depth;
  while (depth > 0 && !$from.node(depth).isTextblock) depth -= 1;
  if (depth < 1 || !("bandPassthrough" in $from.node(depth).attrs)) return false;
  const pos = $from.before(depth);
  const node = state.doc.nodeAt(pos);
  if (!node) return false;
  const image: BandRichImage = { src, ...insertedPictureSize(width, height, columnEmu) };
  const images = [...imagesOf(node), image];
  const tr = withImages(state, pos, images);
  if (!tr) return false;
  editor.view.dispatch(tr.setMeta(bandStoryPicturesKey, { pos, kind: "images", index: images.length - 1 }));
  return true;
}
