/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Picture Format and Layout ▸ Arrange logic for pictures, shared by the
 * document toolbar and the editor-command catalog: the selected picture,
 * its placement (wrap, align), size, formatting (border, crop, color,
 * corrections, rotation), alt text and resets. Each function acts on the
 * picture the editor selection holds as a node.
 */

import {
  withOfficePictureEffect,
  type OfficePictureEffectKind,
  type OfficePictureEffectValues,
} from "@mrnote/core/web/lib/office-picture-effects.ts";
import {
  PICTURE_THREE_D_KINDS,
  normalizePicture3d,
  picture3dBlocker,
  PICTURE_LOOK_EFFECT_KINDS,
  pictureLookEffectAttrs,
  pictureLookEffects,
  pictureLookEffectsBlocker,
  pictureShadowBlocker,
  pictureShadowEffect,
  pictureShadowEffectAttrs,
  type PictureLookEffectKind,
} from "./pictureEffects";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection } from "@tiptap/pm/state";
import { liftListItem } from "@tiptap/pm/schema-list";
import { normalizeOfficeArtisticEffect } from "@mrnote/core/web/lib/office-artistic-effects.ts";
import { convertInlinePictureToFloating } from "@mrnote/core/web/components/console/editor/extensions/objectPlacement.ts";
import { MRNOTE_SOURCE_ATTR } from "@mrnote/core/web/components/console/editor/native-document/blockIds.ts";
import { isPictureNode } from "@mrnote/core/web/components/console/editor/native-document/documentObjectNodes.ts";
import {
  documentPictureGeometry,
  imagePictureStyleHasOutline,
  normalizeImageAlign,
  normalizeImageBorderColor,
  normalizeImageBorderStyle,
  normalizeImageBorderWidth,
  normalizeImageFloat,
  normalizeImageFlip,
  normalizeImagePictureStyle,
  normalizeImageRotation,
  sanitizeImageAltText,
  type ImageAlign,
  type ImageFloat,
} from "@mrnote/core/web/components/console/editor/native-document/imageControls.ts";
import {
  imageCorrectionStoredFromDelta,
  imageOpacityFromTransparency,
  isNativeImageRecolorMode,
  normalizeImageAdjust,
  normalizeImageOpacity,
  normalizeImageSaturation,
  type NativeImageRecolorMode,
} from "@mrnote/core/web/lib/presentation-image-effects.ts";
import {
  NO_DOCUMENT_IMAGE_CROP,
  documentImageCropFrameSize,
  documentImageCropInsets,
  documentImageCropped,
  documentImageFillCropInsets,
  type DocumentImageCropInsets,
  type DocumentImageCropResult,
} from "./documentImageCrop";
import { normalizePageOrientation, pageGeometryTwips } from "@mrnote/core/web/components/console/editor/native-document/pageSetup.ts";
import { resolveSectionAtSelection } from "@mrnote/core/web/components/console/editor/native-document/sectionLayouts.ts";
import { normalizeWordDocumentSettings, resolveWordPageBox } from "@mrnote/core/web/components/console/editor/native-document/wordDocumentSettings.ts";
import type { OfficePixelSize } from "@mrnote/core/web/lib/office-picture-fit.ts";
import {
  OFFICE_PICTURE_RECTANGLE_GEOMETRY,
  normalizeOfficePictureGeometry,
} from "@mrnote/core/web/lib/office-picture-geometry.ts";
import { EMU_PER_PX, MIN_IMAGE_PX } from "./ImageResizeNodeView";
import {
  documentShapeRelativeHeight,
  nextDocumentFloatingHeight,
} from "@mrnote/core/web/lib/document-shapes.ts";

export type ImageDrawingKind = "inline" | "anchor" | null;

export interface LiveImagePlacementTarget {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly dataAlign: ImageAlign | null;
  readonly dataFloat: ImageFloat | null;
  readonly drawingKind: ImageDrawingKind;
}

export interface LiveImageAltTarget {
  readonly doc: ProseMirrorNode;
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly from: number;
  readonly to: number;
  readonly alt: string;
}


// Word's Reset Picture discards the picture's formatting but keeps its crop
// and size; Reset Picture & Size removes those too.
export function imageHasResettablePictureFormatting(
  attrs: Readonly<Record<string, unknown>>,
): boolean {
  return (
    normalizeImageRotation(attrs.pictureRotation) !== 0 ||
    normalizeImageFlip(attrs.pictureFlipHorizontal) ||
    normalizeImageFlip(attrs.pictureFlipVertical) ||
    normalizeImageBorderWidth(attrs.pictureBorderWidth) !== 0 ||
    normalizeImagePictureStyle(attrs.pictureStyle) !== null ||
    documentPictureGeometry(attrs).preset !== OFFICE_PICTURE_RECTANGLE_GEOMETRY ||
    normalizeImageOpacity(attrs.pictureOpacity) !== 100 ||
    (isNativeImageRecolorMode(attrs.pictureRecolor)
      ? attrs.pictureRecolor
      : "none") !== "none" ||
    normalizeImageSaturation(attrs.pictureSaturation) !== 100 ||
    normalizeImageAdjust(attrs.pictureBrightness) !== 100 ||
    normalizeImageAdjust(attrs.pictureContrast) !== 100 ||
    resettableArtisticEffect(attrs)
  );
}

/**
 * An Artistic Effect the picture can drop: one this editor applies to the
 * original. An effect that came from the Word file is baked into its bitmap
 * (the original is not here), so Reset cannot take it off.
 */
export function resettableArtisticEffect(
  attrs: Readonly<Record<string, unknown>>,
): boolean {
  return (
    attrs.artisticEffectRendered !== true &&
    normalizeOfficeArtisticEffect(attrs.artisticEffect) !== null
  );
}


export type LiveImageAltCommitResult = "changed" | "unchanged" | "rejected";

export function liveImageAltTarget(editor: Editor): LiveImageAltTarget | null {
  if (editor.isDestroyed) return null;
  const { doc, selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return null;
  const node = selection.node;
  if (!isPictureNode(node) || doc.nodeAt(selection.from) !== node) {
    return null;
  }
  return {
    doc,
    pos: selection.from,
    node,
    attrs: node.attrs,
    from: selection.from,
    to: selection.to,
    alt: typeof node.attrs.alt === "string" ? node.attrs.alt : "",
  };
}


export function sameLiveImageAltTarget(
  current: LiveImageAltTarget | null,
  expected: LiveImageAltTarget,
): current is LiveImageAltTarget {
  return (
    current !== null &&
    current.doc === expected.doc &&
    current.pos === expected.pos &&
    current.node === expected.node &&
    current.attrs === expected.attrs &&
    current.from === expected.from &&
    current.to === expected.to
  );
}

/** Commit one authenticated Alt Text edit without rewriting placement custody. */
export function commitLiveImageAltText(
  editor: Editor,
  target: LiveImageAltTarget,
  draft: unknown,
  options: {
    /** Keep the picture selected (the Alt Text pane follows it). */
    readonly keepSelection?: boolean;
    /** False lets the edit join the previous Undo step (typing). */
    readonly newHistoryStep?: boolean;
  } = {},
): LiveImageAltCommitResult {
  if (editor.isDestroyed || !editor.isEditable) return "rejected";
  const current = liveImageAltTarget(editor);
  if (!sameLiveImageAltTarget(current, target)) return "rejected";

  const alt = sanitizeImageAltText(draft) ?? "";
  if (current.alt === alt) return "unchanged";

  let transaction = editor.state.tr.setNodeMarkup(
    current.pos,
    undefined,
    { ...current.attrs, alt },
    current.node.marks,
  );
  if (options.newHistoryStep !== false) {
    transaction = closeHistory(transaction);
  }
  if (options.keepSelection) {
    transaction = transaction.setSelection(
      NodeSelection.create(transaction.doc, current.pos),
    );
  }
  if (!transaction.docChanged) return "unchanged";
  editor.view.dispatch(transaction);
  return "changed";
}

/**
 * Names the picture the Alt Text pane shows, so the pane's box is reseeded
 * when the selection moves to another picture but not when an edit rewrites
 * this one's attributes or a collaborator's edit moves it: its block id, or
 * for a picture without one its place and its bytes.
 */
export function documentPictureAltPaneKey(target: LiveImageAltTarget): string {
  const blockId = target.attrs.block_id;
  if (typeof blockId === "string" && blockId) return `block:${blockId}`;
  const src = typeof target.attrs.src === "string" ? target.attrs.src : "";
  const source =
    typeof target.attrs.source === "string" ? target.attrs.source : "";
  return `${target.pos}:${src.length}:${src.slice(0, 48)}:${src.slice(-48)}:${source}`;
}

/** Replace only the selected picture bytes in one authenticated Undo step. */
export function commitLiveImagePictureSource(
  editor: Editor,
  target: LiveImageAltTarget,
  src: string,
): boolean {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    !src.startsWith("data:image/")
  ) {
    return false;
  }
  const current = liveImageAltTarget(editor);
  if (!sameLiveImageAltTarget(current, target) || current.attrs.src === src) {
    return false;
  }
  let transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      current.pos,
      undefined,
      { ...current.attrs, src },
      current.node.marks,
    ),
  );
  if (!transaction.docChanged) return false;
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, current.pos),
  );
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

/** Reset turn, border, style and colour together; crop and size stay (Word). */
export function resetLiveImagePictureFormatting(editor: Editor): boolean {
  const target = liveImageAltTarget(editor);
  if (!target || !imageHasResettablePictureFormatting(target.attrs)) {
    return false;
  }
  return updateLiveImageFormatting(editor, {
    pictureRotation: 0,
    pictureFlipHorizontal: false,
    pictureFlipVertical: false,
    pictureBorderWidth: 0,
    pictureBorderStyle: "solid",
    pictureBorderColor: "#000000",
    pictureStyle: "none",
    pictureStyleOutlineHidden: false,
    // The shape Crop to Shape gave it goes too: the plain rectangle.
    pictureGeometry: OFFICE_PICTURE_RECTANGLE_GEOMETRY,
    pictureGeometryAdjustments: null,
    pictureOpacity: 100,
    pictureRecolor: "none",
    pictureSaturation: 100,
    pictureBrightness: 100,
    pictureContrast: 100,
    ...(resettableArtisticEffect(target.attrs) ? { artisticEffect: null } : {}),
  });
}

/** Reset verified browser-owned picture formatting and natural size together. */
export function resetLiveImagePictureAndSize(editor: Editor): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const target = liveImageAltTarget(editor);
  if (!target || target.attrs.officeImage === true) return false;
  const visualFormattingEditable =
    target.attrs.pictureVisualFormattingEditable === true ||
    target.attrs.pictureVisualFormattingEditable == null;
  if (!visualFormattingEditable) return false;

  let transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      target.pos,
      undefined,
      {
        ...target.attrs,
        width: null,
        height: null,
        widthEmu: null,
        heightEmu: null,
        widthPercent: null,
        pictureRotation: 0,
        pictureFlipHorizontal: false,
        pictureFlipVertical: false,
        pictureCropTop: 0,
        pictureCropRight: 0,
        pictureCropBottom: 0,
        pictureCropLeft: 0,
        pictureBorderWidth: 0,
        pictureBorderStyle: "solid",
        pictureBorderColor: "#000000",
        pictureStyle: "none",
        pictureStyleOutlineHidden: false,
        pictureGeometry: OFFICE_PICTURE_RECTANGLE_GEOMETRY,
        pictureGeometryAdjustments: null,
        pictureOpacity: 100,
        pictureRecolor: "none",
        pictureSaturation: 100,
        pictureBrightness: 100,
        pictureContrast: 100,
        ...(resettableArtisticEffect(target.attrs) ? { artisticEffect: null } : {}),
      },
      target.node.marks,
    ),
  );
  if (!transaction.docChanged) return false;
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, target.pos),
  );
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

/**
 * Resolve the exact live image NodeSelection that may own a placement action.
 *
 * Imported Office anchors do not carry a complete editable placement receipt:
 * even a canonical `dataFloat` is only a lossy projection of the original
 * DrawingML position/wrap/layer contract. They must never be silently rewritten
 * by a toolbar action. Raw attrs are otherwise accepted only when they are
 * already canonical and mutually consistent.
 */
/**
 * `allowImportedAnchor` admits an imported Office anchor for one move only:
 * back In Line with Text, which Word offers for every floating picture. Its
 * other placements stay closed, since the float is a lossy projection of the
 * anchor's position.
 */
export function liveImagePlacementTarget(
  editor: Editor,
  allowImportedAnchor = false,
): LiveImagePlacementTarget | null {
  const { doc, selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return null;
  const node = selection.node;
  if (
    !isPictureNode(node) ||
    selection.$from.parent.type.name === "imageRow" ||
    doc.nodeAt(selection.from) !== node
  ) {
    return null;
  }

  const rawAlign = node.attrs.dataAlign as unknown;
  const rawFloat = node.attrs.dataFloat as unknown;
  const rawDrawingKind = node.attrs.officeDrawingKind as unknown;
  const importedOfficeImage = node.attrs.officeImage === true;
  const dataAlign = rawAlign === null ? null : normalizeImageAlign(rawAlign);
  const dataFloat = rawFloat === null ? null : normalizeImageFloat(rawFloat);
  if (
    (rawAlign !== null && rawAlign !== dataAlign) ||
    (rawFloat !== null && rawFloat !== dataFloat)
  ) {
    return null;
  }
  if (
    rawDrawingKind !== null &&
    rawDrawingKind !== "inline" &&
    rawDrawingKind !== "anchor"
  ) {
    return null;
  }
  const drawingKind = rawDrawingKind as ImageDrawingKind;
  if (
    (dataAlign !== null && dataFloat !== null) ||
    (drawingKind === "anchor" && dataFloat === null) ||
    (drawingKind === "inline" && dataFloat !== null) ||
    (importedOfficeImage && drawingKind === "anchor" && !allowImportedAnchor)
  ) {
    return null;
  }
  return {
    pos: selection.from,
    node,
    dataAlign,
    dataFloat,
    drawingKind,
  };
}

export function commitLiveImagePlacement(
  editor: Editor,
  target: LiveImagePlacementTarget,
  dataFloat: ImageFloat | null,
  dataAlign: ImageAlign | null,
  allowImportedAnchor = false,
): boolean {
  const drawingKind: ImageDrawingKind =
    dataFloat !== null
      ? "anchor"
      : target.dataFloat !== null || target.drawingKind === "anchor"
        ? "inline"
        : target.drawingKind;
  if (
    !target.node.isInline &&
    target.dataFloat === dataFloat &&
    target.dataAlign === dataAlign &&
    target.drawingKind === drawingKind
  ) {
    return false;
  }

  // Re-authenticate immediately before the transaction so a re-entrant editor
  // update cannot redirect the action to a different node at the same position.
  const current = liveImagePlacementTarget(editor, allowImportedAnchor);
  if (
    !current ||
    current.pos !== target.pos ||
    current.node !== target.node ||
    current.dataFloat !== target.dataFloat ||
    current.dataAlign !== target.dataAlign ||
    current.drawingKind !== target.drawingKind
  ) {
    return false;
  }

  // Protection/read-only state can change after React rendered an enabled
  // menu item. Re-check it at the transaction seam rather than trusting the
  // render-time command context; a stale action must not dispatch or focus.
  if (editor.isDestroyed || !editor.isEditable) return false;

  if (target.node.isInline) {
    // Word: any wrap other than "In Line with Text" makes the inline picture a
    // floating picture anchored to its paragraph (the block `image` + wrap).
    if (dataFloat !== null) {
      const converted = convertInlinePictureToFloating(
        editor.view,
        target.pos,
        dataFloat,
      );
      if (converted) editor.view.focus();
      return converted;
    }
    // Align on an inline picture aligns its paragraph.
    const $pos = editor.state.doc.resolve(target.pos);
    const host = $pos.parent;
    if (!host.isTextblock || $pos.depth === 0 || !("textAlign" in host.attrs)) {
      return false;
    }
    const nextAlign = dataAlign === "left" ? null : dataAlign;
    if ((host.attrs.textAlign ?? null) === nextAlign) return false;
    const hostTransaction = closeHistory(
      editor.state.tr.setNodeMarkup($pos.before(), undefined, {
        ...host.attrs,
        textAlign: nextAlign,
      }),
    );
    hostTransaction.setSelection(
      NodeSelection.create(hostTransaction.doc, target.pos),
    );
    editor.view.dispatch(hostTransaction);
    editor.view.focus();
    return true;
  }

  const transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      target.pos,
      undefined,
      {
        ...target.node.attrs,
        dataFloat,
        dataAlign,
        // The coarse float is the whole placement here: a `floatAnchor` the
        // Layout Options gave the picture (`chartPlacement`) gives way to it.
        floatAnchor: null,
        officeDrawingKind: drawingKind,
        // Floated, the picture takes the top of the document's floating stack
        // (Word gives a drawing its place when it is made; a shape drawn after
        // it lands above it). A wrap change keeps the place it already holds,
        // as Word's wrap changes never reorder.
        relativeHeight:
          dataFloat !== null
            ? (documentShapeRelativeHeight(target.node.attrs.relativeHeight) ??
              nextDocumentFloatingHeight(editor.state.doc))
            : (target.node.attrs.relativeHeight ?? null),
      },
      target.node.marks,
    ),
  );
  if (!transaction.docChanged) return false;
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

export function setLiveImageFloat(editor: Editor, value: unknown): boolean {
  const dataFloat = value === null ? null : normalizeImageFloat(value);
  if (value !== null && value !== dataFloat) return false;
  const toInline = dataFloat === null;
  const target = liveImagePlacementTarget(editor, toInline);
  if (!target) return false;
  return commitLiveImagePlacement(
    editor,
    target,
    dataFloat,
    toInline ? target.dataAlign : null,
    toInline,
  );
}

/** A selected imported Office picture anchored in the page (see above). */
export function liveImportedImageAnchor(editor: Editor): boolean {
  return (
    liveImagePlacementTarget(editor) === null &&
    liveImagePlacementTarget(editor, true)?.drawingKind === "anchor"
  );
}

export function setLiveImageAlign(editor: Editor, value: unknown): boolean {
  const dataAlign = value === null ? null : normalizeImageAlign(value);
  if (value !== null && value !== dataAlign) return false;
  const target = liveImagePlacementTarget(editor);
  if (!target) return false;
  return commitLiveImagePlacement(editor, target, null, dataAlign);
}

export function updateLiveImageFormatting(
  editor: Editor,
  patch: Readonly<Record<string, unknown>>,
  focusEditor = true,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const target = liveImageAltTarget(editor);
  if (!target) return false;
  const visualFormattingEditable =
    target.attrs.pictureVisualFormattingEditable === true ||
    (target.attrs.pictureVisualFormattingEditable == null &&
      target.attrs.officeImage !== true);
  if (!visualFormattingEditable) return false;
  let transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      target.pos,
      undefined,
      { ...target.attrs, ...patch },
      target.node.marks,
    ),
  );
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, target.pos),
  );
  if (!transaction.docChanged) return false;
  editor.view.dispatch(transaction);
  if (focusEditor) editor.view.focus();
  return true;
}

export type PictureHostListName = "bulletList" | "orderedList";

export interface PictureHostListContext {
  readonly depth: number;
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

export function pictureHostListContext(
  editor: Editor,
): PictureHostListContext | null {
  const target = liveImageAltTarget(editor);
  if (!target) return null;
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "bulletList" && node.type.name !== "orderedList") {
      continue;
    }
    return { depth, pos: $from.before(depth), node };
  }
  return null;
}

/**
 * Toggle a list around the currently selected block image without replacing
 * the image node or losing its NodeSelection.  The stock list-item schema is
 * reused as-is (`paragraph block*`): its required empty paragraph owns the
 * marker and the image remains the following editable block.
 */
export function toggleLiveImageHostList(
  editor: Editor,
  listName: PictureHostListName,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const target = liveImageAltTarget(editor);
  if (!target || editor.state.selection.$from.parent.type.name === "imageRow") {
    return false;
  }
  const { schema } = editor.state;
  const listType = schema.nodes[listName];
  const listItemType = schema.nodes.listItem;
  const paragraphType = schema.nodes.paragraph;
  if (!listType || !listItemType || !paragraphType) return false;

  const existing = pictureHostListContext(editor);
  let transaction = editor.state.tr;
  let selectedImagePos = target.pos;

  if (existing) {
    if (existing.node.type.name !== listName) {
      transaction = transaction.setNodeMarkup(
        existing.pos,
        listType,
        listType.create().attrs,
      );
    } else {
      const item = existing.node.childCount === 1 ? existing.node.firstChild : null;
      const marker = item?.childCount === 2 ? item.firstChild : null;
      const wrappedImage = item?.childCount === 2 ? item.child(1) : null;
      if (
        !item ||
        marker?.type.name !== "paragraph" ||
        marker.content.size !== 0 ||
        wrappedImage !== target.node
      ) {
        // The picture's item holds more than its empty marker paragraph
        // (a caption typed beside the number, other items in the list):
        // turn the numbering off for that item as the text's caret would,
        
        return liftPictureListItem(editor, target.pos, target.node);
      }
      transaction = transaction.replaceWith(
        existing.pos,
        existing.pos + existing.node.nodeSize,
        target.node,
      );
      selectedImagePos = existing.pos;
    }
  } else {
    const marker = paragraphType.createAndFill();
    if (!marker) return false;
    const listItem = listItemType.create(null, [marker, target.node]);
    const list = listType.create(null, listItem);
    transaction = transaction.replaceWith(target.from, target.to, list);
    selectedImagePos = target.pos + 2 + marker.nodeSize;
  }

  if (!transaction.docChanged) return false;
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, selectedImagePos),
  );
  editor.view.dispatch(closeHistory(transaction));
  editor.view.focus();
  return true;
}

function liftPictureListItem(
  editor: Editor,
  imagePos: number,
  image: ProseMirrorNode,
): boolean {
  const listItemType = editor.state.schema.nodes.listItem;
  if (!listItemType) return false;
  let lifted = false;
  liftListItem(listItemType)(editor.state, (transaction) => {
    const mapped = transaction.mapping.map(imagePos);
    if (transaction.doc.nodeAt(mapped)?.type === image.type) {
      transaction.setSelection(NodeSelection.create(transaction.doc, mapped));
    }
    editor.view.dispatch(closeHistory(transaction));
    lifted = true;
  });
  if (lifted) editor.view.focus();
  return lifted;
}

function statedPicturePx(px: unknown, emu: unknown): number | null {
  const value = Number(px);
  if (Number.isFinite(value) && value > 0) return value;
  const emuValue = Number(emu);
  return Number.isFinite(emuValue) && emuValue > 0 ? emuValue / EMU_PER_PX : null;
}

/**
 * The size a picture is drawn at, in CSS px: its stated width and height,
 * and for a side it does not state, what the page draws. A picture inserted
 * at its own size states neither (its Height and Width boxes read empty), and
 * a side it leaves unstated follows the picture's own proportions -- so Lock
 * Aspect Ratio must read them from the picture, not from absent attributes
 * (setting the height of a 240 x 120 picture after its width stretched it to
 * 4:3). Null when the page has not drawn it yet.
 */
export function livePictureDrawnSize(
  editor: Editor,
  pos: number,
  attrs: Record<string, unknown>,
): { width: number; height: number } | null {
  const width = statedPicturePx(attrs.width, attrs.widthEmu);
  const height = statedPicturePx(attrs.height, attrs.heightEmu);
  if (width !== null && height !== null) return { width, height };
  let picture: HTMLImageElement | null = null;
  try {
    const dom = editor.view.nodeDOM(pos);
    picture =
      dom instanceof HTMLImageElement
        ? dom
        : dom instanceof HTMLElement
          ? dom.querySelector("img")
          : null;
  } catch {
    picture = null;
  }
  if (!picture) return null;
  const ratio =
    picture.naturalWidth > 0 && picture.naturalHeight > 0
      ? picture.naturalHeight / picture.naturalWidth
      : picture.offsetWidth > 0 && picture.offsetHeight > 0
        ? picture.offsetHeight / picture.offsetWidth
        : null;
  if (width !== null && ratio !== null) return { width, height: width * ratio };
  if (height !== null && ratio !== null) return { width: height / ratio, height };
  if (picture.offsetWidth > 0 && picture.offsetHeight > 0)
    return { width: picture.offsetWidth, height: picture.offsetHeight };
  if (picture.naturalWidth > 0 && picture.naturalHeight > 0)
    return { width: picture.naturalWidth, height: picture.naturalHeight };
  return null;
}

export function setLiveImageDimension(
  editor: Editor,
  axis: "width" | "height",
  value: unknown,
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const target = liveImageAltTarget(editor);
  const numeric = Number(value);
  if (
    !target ||
    !Number.isFinite(numeric) ||
    numeric < MIN_IMAGE_PX ||
    numeric > 8192
  ) {
    return false;
  }
  const nextValue = Math.round(numeric);
  const drawn = livePictureDrawnSize(editor, target.pos, target.attrs);
  const width = drawn?.width ?? Number.NaN;
  const height = drawn?.height ?? Number.NaN;
  const hasRatio =
    Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
  const preserveRatio = target.attrs.pictureLockAspectRatio !== false;
  // Unlocked, the other side keeps the size it is drawn at: stated now, so a
  // side the picture never stated does not follow the new one.
  const keep = (side: number, stated: unknown) =>
    stated == null && Number.isFinite(side) && side > 0 ? Math.round(side) : null;
  const nextWidth =
    axis === "width"
      ? nextValue
      : preserveRatio && hasRatio
        ? Math.max(MIN_IMAGE_PX, Math.round((nextValue * width) / height))
        : keep(width, target.attrs.width);
  const nextHeight =
    axis === "height"
      ? nextValue
      : preserveRatio && hasRatio
        ? Math.max(MIN_IMAGE_PX, Math.round((nextValue * height) / width))
        : keep(height, target.attrs.height);
  const nextAttrs = {
    ...target.attrs,
    ...(nextWidth === null
      ? {}
      : { width: nextWidth, widthEmu: nextWidth * EMU_PER_PX }),
    ...(nextHeight === null
      ? {}
      : { height: nextHeight, heightEmu: nextHeight * EMU_PER_PX }),
    widthPercent: null,
  };
  const transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      target.pos,
      undefined,
      nextAttrs,
      target.node.marks,
    ),
  );
  if (!transaction.docChanged) return false;
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

/** Commit the exact selected image's native numeric-resize lock in one Undo. */
export function setLiveImageAspectRatioLock(editor: Editor, locked: boolean): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const target = liveImageAltTarget(editor);
  if (
    !target ||
    !(
      target.attrs.pictureLockAspectRatioEditable === true ||
      (target.attrs.pictureLockAspectRatioEditable == null &&
        target.attrs.officeImage !== true)
    ) ||
    (target.attrs.pictureLockAspectRatio !== false) === locked
  ) {
    return false;
  }
  let transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      target.pos,
      undefined,
      { ...target.attrs, pictureLockAspectRatio: locked },
      target.node.marks,
    ),
  );
  if (!transaction.docChanged) return false;
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, target.pos),
  );
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

export function resetLiveImageSize(editor: Editor): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const target = liveImageAltTarget(editor);
  // Imported Office drawings retain authored EMU geometry until a full
  // original-size receipt exists; silently clearing it would be lossy.
  if (!target || target.attrs.officeImage === true) return false;
  const transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      target.pos,
      undefined,
      {
        ...target.attrs,
        width: null,
        height: null,
        widthEmu: null,
        heightEmu: null,
        widthPercent: null,
      },
      target.node.marks,
    ),
  );
  if (!transaction.docChanged) return false;
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

// ---- Picture Format buttons (border, crop, color, corrections, rotation) ----

function pictureDimensionPx(pxValue: unknown, emuValue: unknown): number | null {
  const px = Number(pxValue);
  if (Number.isFinite(px) && px > 0) return Math.round(px);
  const emu = Number(emuValue);
  return Number.isFinite(emu) && emu > 0 ? Math.round(emu / EMU_PER_PX) : null;
}

/**
 * Picture Border. A border set over a picture style keeps the style and
 * replaces only its outline, as in Word; "No Border" on a styled picture is
 * the style's "No Outline". Undo restores the outline.
 */
export function setPictureBorder(editor: Editor, width: number, color: unknown, style: unknown): boolean {
  const styled = normalizeImagePictureStyle(liveImageAltTarget(editor)?.attrs.pictureStyle);
  const nextWidth = normalizeImageBorderWidth(width);
  return updateLiveImageFormatting(editor, {
    pictureBorderWidth: nextWidth,
    pictureBorderColor: normalizeImageBorderColor(color),
    pictureBorderStyle: normalizeImageBorderStyle(style),
    pictureStyleOutlineHidden: nextWidth === 0 && imagePictureStyleHasOutline(styled),
  });
}

/**
 * Crop > Crop to Shape: the picture is drawn in one preset shape (its
 * `a:prstGeom`), stretched to its frame. Word changes nothing else: the frame,
 * the crop, a picture style's paint and the border stay, and the shape's
 * handles start at the preset's defaults. Rectangle gives the plain picture
 * back. One undo step.
 */
export function cropPictureToShape(editor: Editor, preset: string): boolean {
  const geometry = normalizeOfficePictureGeometry(preset);
  const target = liveImageAltTarget(editor);
  if (!geometry || !target) return false;
  if (
    normalizeOfficePictureGeometry(target.attrs.pictureGeometry) === geometry &&
    target.attrs.pictureGeometryAdjustments == null
  ) {
    return false;
  }
  return updateLiveImageFormatting(editor, {
    pictureGeometry: geometry,
    pictureGeometryAdjustments: null,
  });
}

/**
 * Crop > Reset: the whole source again at the scale it is drawn at, so the
 * frame grows by what the crop kept away (documentImageCrop.ts).
 */
export function resetPictureCrop(editor: Editor): boolean {
  const target = liveImageAltTarget(editor);
  if (!target || !documentImageCropped(documentImageCropInsets(target.attrs))) return false;
  return setPictureCropInsets(editor, NO_DOCUMENT_IMAGE_CROP);
}

/**
 * Crop to explicit insets (percent of the source per edge, as Word's Crop
 * position fields keep it): the picture keeps the scale it is drawn at, so
 * its frame shrinks or grows by what the crop takes away or gives back.
 */
export function setPictureCropInsets(editor: Editor, next: DocumentImageCropInsets): boolean {
  const target = liveImageAltTarget(editor);
  if (!target) return false;
  const current = documentImageCropInsets(target.attrs);
  const width = pictureDimensionPx(target.attrs.width, target.attrs.widthEmu);
  const height = pictureDimensionPx(target.attrs.height, target.attrs.heightEmu);
  const frame =
    width !== null && height !== null && target.attrs.widthPercent == null
      ? documentImageCropFrameSize(
          { width, height, widthEmu: target.attrs.widthEmu, heightEmu: target.attrs.heightEmu },
          current,
          next,
        )
      : null;
  return updateLiveImageFormatting(editor, {
    ...(frame
      ? { width: frame.width, height: frame.height, widthEmu: frame.widthEmu, heightEmu: frame.heightEmu }
      : {}),
    pictureCropTop: next.top,
    pictureCropRight: next.right,
    pictureCropBottom: next.bottom,
    pictureCropLeft: next.left,
  });
}

/**
 * Crop > Fill: the frame keeps its size, the source is cropped to the frame's
 * aspect about its centre (documentImageFillCropInsets). The toolbar measures
 * `natural` by decoding the picture; the command reads it from the header.
 */
export function applyPictureCropFill(
  editor: Editor,
  natural: OfficePixelSize,
  frame: { readonly width: number; readonly height: number },
): boolean {
  const insets = documentImageFillCropInsets(natural, frame);
  if (!insets) return false;
  return updateLiveImageFormatting(editor, {
    pictureCropTop: insets.top,
    pictureCropRight: insets.right,
    pictureCropBottom: insets.bottom,
    pictureCropLeft: insets.left,
  });
}

/**
 * Write a Crop > Aspect Ratio / Fit result (documentImageCrop.ts): the new
 * explicit frame and the four source insets together, as one step.
 */
export function applyPictureCropResult(
  editor: Editor,
  result: DocumentImageCropResult,
  focusEditor = true,
): boolean {
  return updateLiveImageFormatting(
    editor,
    {
      width: result.width,
      height: result.height,
      widthEmu: result.width * EMU_PER_PX,
      heightEmu: result.height * EMU_PER_PX,
      widthPercent: null,
      pictureCropTop: result.insets.top,
      pictureCropRight: result.insets.right,
      pictureCropBottom: result.insets.bottom,
      pictureCropLeft: result.insets.left,
    },
    focusEditor,
  );
}

/** Whether the selected picture already has this frame and these insets. */
export function pictureCropResultIsCurrent(
  attrs: Readonly<Record<string, unknown>>,
  result: DocumentImageCropResult,
): boolean {
  const current = documentImageCropInsets(attrs);
  return (
    Number(attrs.width) === result.width &&
    Number(attrs.height) === result.height &&
    attrs.widthPercent == null &&
    current.top === result.insets.top &&
    current.right === result.insets.right &&
    current.bottom === result.insets.bottom &&
    current.left === result.insets.left
  );
}

/**
 * The page content box (CSS px) of the section holding the selection, as the
 * paged layout sizes a `widthPercent` picture against it: the section's own
 * page size less its margins (gutter folded in, Word's multiple-pages
 * setting applied) once the document carries section layouts, else the
 * document-wide page setup the exporter reads. Null when neither is known.
 */
export function selectionPageContentBoxPx(
  editor: Editor,
): { width: number; height: number } | null {
  const twipsToPx = (twips: number) => twips / 15;
  const section = resolveSectionAtSelection(editor.state);
  const attrs = editor.state.doc.attrs as Record<string, unknown>;
  let box: { width: number; height: number };
  if (section.layout) {
    const page = resolveWordPageBox(
      section.layout,
      normalizeWordDocumentSettings(attrs.wordSettings),
      0,
    );
    box = {
      width: twipsToPx(page.widthTwips - page.leftTwips - page.rightTwips),
      height: twipsToPx(page.heightTwips - page.topTwips - page.bottomTwips),
    };
  } else {
    const page = pageGeometryTwips(
      attrs.pageSize,
      attrs.pageMargins,
      attrs.customPageSize,
      attrs.customPageMargins,
      normalizePageOrientation(attrs.pageOrientation),
    );
    box = {
      width: twipsToPx(page.width - page.left - page.right),
      height: twipsToPx(page.height - page.top - page.bottom),
    };
  }
  return box.width > 0 && box.height > 0 ? box : null;
}

/** Transparency, 0-100 %. */
export function setPictureTransparency(editor: Editor, transparency: number): boolean {
  return updateLiveImageFormatting(editor, { pictureOpacity: imageOpacityFromTransparency(transparency) });
}

/** Color ▸ Recolor. */
export function setPictureRecolor(editor: Editor, recolor: NativeImageRecolorMode): boolean {
  return updateLiveImageFormatting(editor, { pictureRecolor: recolor });
}

/** Color ▸ Saturation, in percent. */
export function setPictureSaturation(editor: Editor, saturation: number): boolean {
  return updateLiveImageFormatting(editor, { pictureSaturation: normalizeImageSaturation(saturation) });
}

/** Corrections: brightness and contrast as Word's -100..100 deltas. */
export function setPictureCorrections(editor: Editor, brightnessDelta: number, contrastDelta: number): boolean {
  return updateLiveImageFormatting(editor, {
    pictureBrightness: imageCorrectionStoredFromDelta(brightnessDelta),
    pictureContrast: imageCorrectionStoredFromDelta(contrastDelta),
  });
}

/** Rotate Right / Left 90°, from the picture's current rotation. */
export function rotatePicture(editor: Editor, delta: -90 | 90, currentRotation?: number): boolean {
  const current = currentRotation ?? normalizeImageRotation(liveImageAltTarget(editor)?.attrs.pictureRotation);
  return updateLiveImageFormatting(editor, { pictureRotation: normalizeImageRotation(current + delta) });
}

/** Flip Horizontal / Vertical: the opposite of the picture's current flip. */
export function flipPicture(editor: Editor, axis: "horizontal" | "vertical", currentlyFlipped?: boolean): boolean {
  const attrs = liveImageAltTarget(editor)?.attrs;
  const key = axis === "horizontal" ? "pictureFlipHorizontal" : "pictureFlipVertical";
  const flipped = currentlyFlipped ?? normalizeImageFlip(attrs?.[key]);
  return updateLiveImageFormatting(editor, { [key]: !flipped });
}

// ---------------------------------------------------------------------------
// Change Picture: which pictures may take a new picture in place, and in
// which format (shared by the toolbar's Change Picture and the command).
// ---------------------------------------------------------------------------

export type DocumentPictureMime =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/bmp";

export interface DocumentPictureChangeAuthority {
  readonly mimeType: DocumentPictureMime;
  readonly accept: string;
}

const DOCUMENT_PICTURE_SOURCE_ANCHOR_RE =
  /^word\/document\.xml#p\[[0-9]+\]\/image\[[0-9]+\]$/;

export function canonicalDocumentPictureMime(
  value: unknown,
): DocumentPictureMime | null {
  if (typeof value !== "string") return null;
  switch (value.trim().toLowerCase()) {
    case "image/png":
      return "image/png";
    case "image/jpeg":
    case "image/jpg":
      return "image/jpeg";
    case "image/gif":
      return "image/gif";
    case "image/webp":
      return "image/webp";
    case "image/bmp":
      return "image/bmp";
    default:
      return null;
  }
}

export function documentPictureMimeFromPartName(
  value: unknown,
): DocumentPictureMime | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    !/^word\/media\/[^/]{1,200}\.(?:png|jpe?g|gif|webp|bmp)$/.test(
      normalized,
    )
  ) {
    return null;
  }
  // capability:label-only — reads the CONTENT TYPE of a part inside a package
  // that is already open. There is no workspace file here to ask the resolver
  // about, and nothing is gated on the answer.
  if (normalized.endsWith(".png")) return "image/png"; // capability:label-only
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".webp")) return "image/webp";
  return normalized.endsWith(".bmp") ? "image/bmp" : null;
}

export function documentPictureMimeFromDataUrl(
  value: unknown,
): DocumentPictureMime | null {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(value.trim());
  return canonicalDocumentPictureMime(match?.[1]);
}

/**
 * Resolve the exact writer behind Change Picture. Imported DOCX pictures need
 * their immutable source anchor + media part; attachment-backed note images do
 * not have an in-place attachment replacement writer and therefore fail closed.
 */
export function documentPictureChangeAuthority(
  attrs: Readonly<Record<string, unknown>>,
): DocumentPictureChangeAuthority | null {
  // An embedded object's preview (`oleObject`) is the object's own picture,
  // not a picture: Word offers no Change Picture (or drawing on it) there.
  if (attrs.oleObject != null) return null;
  if (attrs.officeImage === true) {
    const source = attrs[MRNOTE_SOURCE_ATTR];
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return null;
    }
    const record = source as Record<string, unknown>;
    const sourceAnchor =
      typeof record.sourceAnchor === "string" ? record.sourceAnchor.trim() : "";
    const mimeType = documentPictureMimeFromPartName(record.partName);
    if (
      record.adapter !== "docx" ||
      record.nodeType !== "image" ||
      !DOCUMENT_PICTURE_SOURCE_ANCHOR_RE.test(sourceAnchor) ||
      mimeType === null ||
      documentPictureMimeFromDataUrl(attrs.src) !== mimeType
    ) {
      return null;
    }
    return { mimeType, accept: mimeType };
  }

  // A durable attachment id can only be replaced through the host upload
  // service. This toolbar deliberately does not turn it into an unowned data
  // URL or retain stale attachment metadata.
  if (typeof attrs.attachment_id === "string" && attrs.attachment_id.trim()) {
    return null;
  }
  const mimeType =
    documentPictureMimeFromDataUrl(attrs.src) ??
    canonicalDocumentPictureMime(attrs.mime_type);
  return mimeType ? { mimeType, accept: mimeType } : null;
}

/**
 * Change Picture on a picture stored beside the page (one inserted from This
 * Device, pasted or dropped: a page attachment named by `attachment_id`).
 * Word changes any picture to any picture file; here the new file is
 * uploaded as another page attachment (lib/page-attachment-upload) and the
 * picture names it, keeping its size, place and formatting. Null for an
 * imported Word picture (its own inline authority above) and an object's
 * preview.
 */
export function documentAttachmentPictureChangeAuthority(
  attrs: Readonly<Record<string, unknown>>,
): { readonly accept: string } | null {
  if (attrs.oleObject != null) return null;
  if (attrs.officeImage === true) {
    return importedPictureHeldBesideThePage(attrs)
      ? { accept: DOCUMENT_ATTACHMENT_PICTURE_ACCEPT }
      : null;
  }
  return typeof attrs.attachment_id === "string" && attrs.attachment_id.trim()
    ? { accept: DOCUMENT_ATTACHMENT_PICTURE_ACCEPT }
    : null;
}

const DOCUMENT_ATTACHMENT_PICTURE_ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,image/bmp";

/**
 * An imported Word picture the page does not carry as data: one named by the
 * digest of its bytes in the stored file (`mrai-picture:<sha256>`,
 * lib/document-picture-references), or one already changed to a page
 * attachment. Word's Change Picture puts the new file in the same drawing,
 * keeping its size and formatting; here the file is uploaded as a page
 * attachment and the save writes it into the drawing's own media part. Only
 * a picture whose part is a raster the save can write (not a metafile the
 * page shows a rendering of) and whose drawing the source anchor names.
 */
function importedPictureHeldBesideThePage(
  attrs: Readonly<Record<string, unknown>>,
): boolean {
  const source = attrs[MRNOTE_SOURCE_ATTR];
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  const record = source as Record<string, unknown>;
  const sourceAnchor =
    typeof record.sourceAnchor === "string" ? record.sourceAnchor.trim() : "";
  if (
    record.adapter !== "docx" ||
    record.nodeType !== "image" ||
    !DOCUMENT_PICTURE_SOURCE_ANCHOR_RE.test(sourceAnchor) ||
    documentPictureMimeFromPartName(record.partName) === null
  ) {
    return false;
  }
  const src = typeof attrs.src === "string" ? attrs.src.trim() : "";
  return (
    /^mrai-picture:[0-9a-f]{64}$/.test(src) ||
    (typeof attrs.attachment_id === "string" && attrs.attachment_id.trim() !== "")
  );
}

/** The picture now names `attachment`, uploaded for it (one undo step). */
export function commitLiveImageAttachment(
  editor: Editor,
  target: LiveImageAltTarget,
  attachment: {
    readonly attachment_id: string;
    readonly filename: string;
    readonly mime_type: string;
    readonly size_bytes: number;
  },
): boolean {
  const attachmentId = attachment.attachment_id.trim();
  if (editor.isDestroyed || !editor.isEditable || !attachmentId || typeof window === "undefined") {
    return false;
  }
  const current = liveImageAltTarget(editor);
  if (!sameLiveImageAltTarget(current, target)) return false;
  let transaction = closeHistory(
    editor.state.tr.setNodeMarkup(
      current.pos,
      undefined,
      {
        ...current.attrs,
        // The durable same-origin source the inserted picture has; the view
        // trades it for a short-lived signed link as it draws it.
        src: new URL(
          `/api/v1/attachments/${encodeURIComponent(attachmentId)}/download`,
          window.location.origin,
        ).toString(),
        attachment_id: attachmentId,
        filename: attachment.filename,
        mime_type: attachment.mime_type,
        size_bytes: attachment.size_bytes,
      },
      current.node.marks,
    ),
  );
  if (!transaction.docChanged) return false;
  transaction = transaction.setSelection(
    NodeSelection.create(transaction.doc, current.pos),
  );
  editor.view.dispatch(transaction);
  editor.view.focus();
  return true;
}

// ---------------------------------------------------------------------------
// Compress Pictures: which pictures may be re-encoded in place (shared by the
// toolbar's dialog and the API's document.object.compress_picture, which
// mirrors this rule).
// ---------------------------------------------------------------------------

export interface DocumentPictureCompressionAuthority {
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp";
}

/** Browser-local compression never mutates imported/shared/attachment media. */
export function documentPictureCompressionAuthority(
  attrs: Readonly<Record<string, unknown>>,
): DocumentPictureCompressionAuthority | null {
  if (
    attrs.officeImage === true ||
    (typeof attrs.attachment_id === "string" && attrs.attachment_id.trim())
  ) {
    return null;
  }
  const mimeType = documentPictureMimeFromDataUrl(attrs.src);
  return mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/webp"
    ? { mimeType }
    : null;
}

/**
 * Format Picture > 3-D Format / 3-D Rotation (and Picture Effects > Bevel /
 * 3-D Rotation): one pick on the picture's `picture3d` (null is "No
 * <effect>"), one undo step; the save writes it on the picture's
 * `a:scene3d` / `a:sp3d`. A styled picture's 3-D is its style's.
 */
export function setPicture3dEffect<K extends OfficePictureEffectKind>(
  editor: Editor,
  kind: K,
  value: OfficePictureEffectValues[K] | null,
): boolean {
  if (!(PICTURE_THREE_D_KINDS as readonly string[]).includes(kind)) return false;
  const target = liveImageAltTarget(editor);
  if (!target || picture3dBlocker(target.attrs as Record<string, unknown>)) return false;
  const current = normalizePicture3d(target.attrs.picture3d);
  const next = normalizePicture3d(withOfficePictureEffect(current ?? undefined, kind, value, false));
  if (JSON.stringify(next) === JSON.stringify(current)) return false;
  return updateLiveImageFormatting(editor, { picture3d: next, picture3dEditable: true });
}

/**
 * Picture Format > Picture Effects > Glow / Reflection / Soft Edges on the
 * selected picture (reading row 545): its `pictureGlow` / `pictureReflection`
 * / `pictureSoftEdge` in Word's forms, `null` / "none" taking one off.
 */
export function setPictureLookEffect<K extends OfficePictureEffectKind>(
  editor: Editor,
  kind: K,
  value: OfficePictureEffectValues[K] | "none" | null,
): boolean {
  if (!(PICTURE_LOOK_EFFECT_KINDS as readonly string[]).includes(kind)) return false;
  const target = liveImageAltTarget(editor);
  if (!target) return false;
  const attrs = target.attrs as Record<string, unknown>;
  if (pictureLookEffectsBlocker(attrs)) return false;
  const patch = pictureLookEffectAttrs(attrs, kind as PictureLookEffectKind, value);
  const before = pictureLookEffects(attrs)[kind as PictureLookEffectKind];
  const after = pictureLookEffects({ ...attrs, ...patch })[kind as PictureLookEffectKind];
  if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) return false;
  return updateLiveImageFormatting(editor, { ...patch, pictureEffectsEditable: true });
}


/**
 * Picture Format > Picture Effects > Shadow on the selected picture (reading
 * row 547): its `pictureShadowEffect` in the shared shadow model, `null` /
 * "none" taking it off.
 */
export function setPictureShadowEffect(editor: Editor, value: unknown): boolean {
  const target = liveImageAltTarget(editor);
  if (!target) return false;
  const attrs = target.attrs as Record<string, unknown>;
  if (pictureShadowBlocker(attrs)) return false;
  const patch = pictureShadowEffectAttrs(value);
  if (JSON.stringify(pictureShadowEffect(attrs)) === JSON.stringify(pictureShadowEffect({ ...attrs, ...patch }))) {
    return false;
  }
  return updateLiveImageFormatting(editor, { ...patch, pictureShadowEditable: true });
}
