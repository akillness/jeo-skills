/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word's half of "opening a file writes nothing" (lib/office-smartart/prepared-conversion).
 *
 * A document is shared the moment it changes, so a preserved diagram's conversion
 * cannot be placed in it to be worked on, as a deck's is on its slide. It is kept
 * beside the node as a node of its own, in no document. The document's shape and
 * SmartArt targets read that node for a selected diagram, and every command then
 * writes `{ ...its attrs, ...the change }` onto the file's diagram in ONE
 * transaction: the first real edit converts, and one Undo takes both back. Until
 * then the document, its history and its file do not change.
 *
 * What is the file's own keeps working on the file's own drawing: moving a shape
 * inside the graphic, moving the graphic through the text, deleting it, and typing
 * on a diagram whose words have a receipt write no conversion at all.
 */

import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

import {
  documentShapeGroupMemberTextPatch,
  documentShapeGroupTextIsEditable,
  documentShapeIsPreservedNativeSmartArt,
  normalizeDocumentShapeAttrs,
  type DocumentShapeGroupMember,
} from "../../../../lib/document-shapes";
import { SMARTART_OFFICE_DEFINITION_KIND, type SmartArtKind } from "../../../../lib/office-smartart/model";
import { smartArtConvertRefusal } from "../../../../lib/office-smartart/native-convert-model";
import type { SmartArtStyleId } from "../../../../lib/office-smartart/styles-model";
import {
  documentNativeSmartArtView,
  documentSmartArtCatalogLayoutId,
} from "../../../../lib/office-smartart/document-native-model";
import { nativeLayoutConvertsOnOpen } from "../../../../lib/office-smartart/native-layouts";
import { cachedNativeSmartArtOutline, readNativeSmartArtOutline } from "../../../../lib/office-smartart/native-outline-remote";
import {
  createSmartArtPreparations,
  type SmartArtPreparation,
  type SmartArtPreparationAnswer,
} from "../../../../lib/office-smartart/prepared-conversion";
import {
  documentSmartArtMemberTextPatch,
  readDocumentSmartArtDiagram,
} from "../../../../lib/office-smartart/document-design-model";
import {
  convertedDocumentSmartArtAttrs,
  documentSmartArtOwnDefinitionRef,
  documentConversionLooksLikeDrawing,
  documentGroupIdsInUse,
  documentPreservedSmartArtMedia,
} from "./documentSmartArtOpenConversion";

const preparations = createSmartArtPreparations<ProseMirrorNode, ProseMirrorNode>();

/** The author reached for a diagram that cannot convert: the host says why. */
export const DOCUMENT_SMARTART_REFUSED_EVENT = "document-smartart-refused";

/** A diagram of a layout MRAI owns: the kind its first real edit converts. */
export function documentSmartArtConvertsOnEdit(attrs: Readonly<Record<string, unknown>>): boolean {
  if (!documentShapeIsPreservedNativeSmartArt(attrs)) return false;
  const view = documentNativeSmartArtView(attrs);
  return Boolean(
    view &&
      ((documentSmartArtCatalogLayoutId(view.layoutIdentity) && nativeLayoutConvertsOnOpen(view.layoutIdentity)) ||
        // …or one laid out from the definition its own file holds (§8.6).
        documentSmartArtOwnDefinitionRef(view, null)),
  );
}

/**
 * A file's diagram that holds no cached drawing (Word 2007 as released,
 * LibreOffice and python-docx write none): Word lays it out from its data and
 * layout parts as it opens the file, and the page holds only its frame
 * (`project_drawingless_diagram`). There is no drawing of Word's to show, so
 * its conversion -- the one its first real edit writes -- is what is drawn,
 * for display only, until then (the deck's absent-cache scene, as Docs has it).
 */
export function documentSmartArtDrawingAbsent(attrs: Readonly<Record<string, unknown>>): boolean {
  if (!documentShapeIsPreservedNativeSmartArt(attrs)) return false;
  const source = attrs.source as { nativeSmartArtView?: { drawingCache?: unknown } } | null | undefined;
  return source?.nativeSmartArtView?.drawingCache === "absent";
}

/** What the tab can say of a diagram whose conversion is on its way, from its own view. */
export function documentSmartArtPreparingState(attrs: Readonly<Record<string, unknown>>): {
  readonly kind: SmartArtKind;
  readonly styleId: SmartArtStyleId | null;
  readonly members: readonly [];
  readonly hasOutline: true;
  readonly textPaneOpen: false;
  readonly canPromote: false;
  readonly canDemote: false;
} {
  const view = documentNativeSmartArtView(attrs);
  return {
    kind: (documentSmartArtCatalogLayoutId(view?.layoutIdentity ?? null) ??
      SMARTART_OFFICE_DEFINITION_KIND) as SmartArtKind,
    styleId: typeof view?.smartArtStyle === "string" ? (view.smartArtStyle as SmartArtStyleId) : null,
    members: [],
    hasOutline: true,
    textPaneOpen: false,
    canPromote: false,
    canDemote: false,
  };
}

/** This diagram's preparation so far, if any. */
export function documentSmartArtPreparation(
  node: ProseMirrorNode,
): SmartArtPreparation<ProseMirrorNode> | undefined {
  return preparations.read(node);
}

/** The conversion a selected diagram's commands write on, once it is ready. */
export function documentSmartArtPreparedNode(node: ProseMirrorNode): ProseMirrorNode | null {
  const entry = preparations.read(node);
  return entry?.state === "ready" ? entry.value : null;
}

interface PreservedDrawnMember {
  readonly memberId?: unknown;
  readonly modelId?: unknown;
  readonly role?: unknown;
  readonly text?: unknown;
  readonly dataPointIds?: unknown;
}

function drawnMembers(attrs: Readonly<Record<string, unknown>>): readonly PreservedDrawnMember[] {
  const source = normalizeDocumentShapeAttrs(attrs).source as { nativeSmartArtView?: { members?: unknown } } | null;
  const members = source?.nativeSmartArtView?.members;
  return Array.isArray(members) ? (members as PreservedDrawnMember[]) : [];
}

/**
 * Where a data point stands in the diagram's outline. The conversion's items have
 * ids of their own, in the outline's order (`smartArtItemIndex`).
 */
function outlineIndexOfPoint(attrs: Readonly<Record<string, unknown>>, pointId: string): number {
  const view = documentNativeSmartArtView(attrs);
  const outline = view ? cachedNativeSmartArtOutline(view.dataXml) : null;
  return outline ? outline.findIndex((item) => item.id === pointId) : -1;
}

/** The data point an item of the conversion stands for. */
function pointOfConvertedItem(
  attrs: Readonly<Record<string, unknown>>,
  prepared: ProseMirrorNode,
  itemId: string,
): string | null {
  const members = (prepared.attrs.groupMembers ?? []) as readonly DocumentShapeGroupMember[];
  const index = members.find((member) => member.smartArtItemId === itemId)?.smartArtItemIndex;
  const view = documentNativeSmartArtView(attrs);
  const outline = view ? cachedNativeSmartArtOutline(view.dataXml) : null;
  return (typeof index === "number" && outline?.[index]?.id) || null;
}

/** The outline item a member of the file's drawing shows, by the member's own shape. */
function drawnMemberItemId(attrs: Readonly<Record<string, unknown>>, memberId: string): string | null {
  const drawn = drawnMembers(attrs);
  const owner = drawn.find((member) => member.memberId === memberId);
  if (!owner) return null;
  const pointOf = (member: PreservedDrawnMember): string | null =>
    Array.isArray(member.dataPointIds) && typeof member.dataPointIds[0] === "string" ? member.dataPointIds[0] : null;
  const own = pointOf(owner);
  if (own) return own;
  // A shape and its words are one `dsp:sp`, split in two members.
  if (typeof owner.modelId !== "string" || !owner.modelId) return null;
  for (const member of drawn) {
    if (member.modelId === owner.modelId && pointOf(member)) return pointOf(member);
  }
  // A shape with no words yet (Office's `[Text]`): the data part says which
  // point its presentation point shows.
  return presentedPoints(attrs).get(owner.modelId) ?? null;
}

const PRESENTED_POINTS = new WeakMap<object, ReadonlyMap<string, string>>();

/** Each presentation point of the diagram's data part, and the data point it shows. */
function presentedPoints(attrs: Readonly<Record<string, unknown>>): ReadonlyMap<string, string> {
  const cached = PRESENTED_POINTS.get(attrs);
  if (cached) return cached;
  const shown = new Map<string, string>();
  const dataXml = documentNativeSmartArtView(attrs)?.dataXml;
  if (dataXml && typeof DOMParser !== "undefined") {
    const connections = new DOMParser().parseFromString(dataXml, "application/xml").getElementsByTagNameNS("*", "cxn");
    for (const connection of Array.from(connections)) {
      if (connection.getAttribute("type") !== "presOf") continue;
      const point = connection.getAttribute("srcId");
      const presentation = connection.getAttribute("destId");
      if (point && presentation) shown.set(presentation, point);
    }
  }
  PRESENTED_POINTS.set(attrs, shown);
  return shown;
}

/**
 * The member of the conversion that a press on the file's drawing means: the
 * item's own shape, or null where the press was on something the conversion has
 * no item for (a connecting arrow), which is then the whole graphic's.
 */
export function documentSmartArtPreparedMemberId(
  preserved: ProseMirrorNode,
  prepared: ProseMirrorNode,
  memberId: string,
): string | null {
  const members = (prepared.attrs.groupMembers ?? []) as readonly DocumentShapeGroupMember[];
  // A diagram with no drawing of Word's is drawn as its conversion: a press
  // is on the conversion's own shape already.
  const shown = documentSmartArtDrawingAbsent(preserved.attrs)
    ? members.find((member) => member.memberId === memberId)?.smartArtItemIndex
    : undefined;
  const pointId = shown === undefined ? drawnMemberItemId(preserved.attrs, memberId) : null;
  const index = typeof shown === "number" ? shown : pointId ? outlineIndexOfPoint(preserved.attrs, pointId) : -1;
  if (index < 0) return null;
  const ofItem = members.filter((member) => member.smartArtItemIndex === index);
  return (
    ofItem.find((member) => member.smartArtRole === "node") ??
    ofItem.find((member) => member.smartArtRole === "label") ??
    null
  )?.memberId ?? null;
}

/**
 * Words for one item of the selected diagram, on the file's own drawing, when its
 * words have a text receipt: nothing converts. False when they have none, or the
 * selected diagram is already MRAI's own.
 */
export function commitDocumentSmartArtWordsOnDrawing(editor: Editor, itemId: string, text: string): boolean {
  const { selection, doc } = editor.state;
  if (!(selection instanceof NodeSelection) || !editor.isEditable) return false;
  const file = selection.node;
  if (doc.nodeAt(selection.from) !== file || !documentShapeGroupTextIsEditable(file.attrs)) return false;
  if (!documentShapeIsPreservedNativeSmartArt(file.attrs)) return false;
  const conversionNow = documentSmartArtPreparedNode(file);
  const pointId = conversionNow ? pointOfConvertedItem(file.attrs, conversionNow, itemId) : null;
  const memberId = drawnMembers(file.attrs).find(
    (member) =>
      member.role === "text" &&
      typeof member.memberId === "string" &&
      Array.isArray(member.dataPointIds) &&
      member.dataPointIds[0] === pointId,
  )?.memberId as string | undefined;
  const next = memberId ? documentShapeGroupMemberTextPatch(file.attrs, memberId, text) : null;
  if (!next) return false;
  // The conversion stays ready for the node these words make, with them on it:
  // the pane open on it does not close while it is asked for again.
  const conversion = documentSmartArtPreparedNode(file);
  const transaction = closeHistory(editor.state.tr.setNodeMarkup(selection.from, undefined, {
    ...file.attrs,
    groupMembers: next.groupMembers,
  }));
  editor.view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, selection.from)));
  const written = editor.state.doc.nodeAt(selection.from);
  if (conversion && written) {
    preparations.seed(
      written,
      conversion.type.create(withWordsTypedOnDrawing(written.attrs, conversion.attrs), null, conversion.marks),
    );
  }
  return true;
}

/**
 * Words the author has typed on the file's own drawing since it was read: the
 * conversion is read from the file's data part, which holds the words before
 * them, and must not take them back.
 */
function withWordsTypedOnDrawing(
  preserved: Readonly<Record<string, unknown>>,
  converted: Record<string, unknown>,
): Record<string, unknown> {
  const live = new Map(
    (normalizeDocumentShapeAttrs(preserved).groupMembers ?? []).map((member) => [member.memberId, member]),
  );
  let attrs = converted;
  for (const member of drawnMembers(preserved)) {
    if (member.role !== "text" || typeof member.memberId !== "string" || typeof member.text !== "string") continue;
    const now = live.get(member.memberId);
    if (!now || typeof now.text !== "string" || now.text === member.text) continue;
    const pointId = drawnMemberItemId(preserved, member.memberId);
    const index = pointId ? outlineIndexOfPoint(preserved, pointId) : -1;
    if (index < 0) continue;
    const diagram = readDocumentSmartArtDiagram(attrs);
    const host = diagram?.members.find(
      (candidate) => candidate.smartArtItemIndex === index && candidate.smartArtRole === "node",
    );
    const patch = diagram && host ? documentSmartArtMemberTextPatch(diagram, host.memberId, now.text, now.textRuns) : null;
    if (patch) attrs = { ...attrs, ...patch };
  }
  return attrs;
}

async function askForConversion(
  editor: Editor,
  node: ProseMirrorNode,
  pageId: string | undefined,
): Promise<SmartArtPreparationAnswer<ProseMirrorNode>> {
  const view = documentNativeSmartArtView(node.attrs);
  const layoutId = view ? documentSmartArtCatalogLayoutId(view.layoutIdentity) : null;
  // A layout MRAI stocks no definition of converts from the one the
  // document's own package holds (SMARTART-GAP.md §8.6).
  const ownDefinition = !layoutId && documentSmartArtOwnDefinitionRef(view, null) !== null;
  if (!view || (!layoutId && !ownDefinition)) return { refusal: smartArtConvertRefusal() };
  // A diagram whose points carry pictures brings them from the page's own
  // package; one whose pictures cannot be brought stays as Word drew it.
  const outline = await readNativeSmartArtOutline(view.dataXml).catch(() => null);
  let images: Readonly<Record<string, string>> | undefined;
  // (One laid out from its own definition with pictures stays as Word drew it.)
  if (ownDefinition && outline?.some((item) => item.imageRelId)) return { refusal: smartArtConvertRefusal() };
  if (layoutId && outline?.some((item) => item.imageRelId)) {
    const media = await documentPreservedSmartArtMedia(node.attrs, layoutId, pageId);
    if (!media.ok) return { refusal: media.reason };
    images = media.images;
  }
  // The group id a diagram reopens under is MRAI's own record, and one data part
  // copied twice inside Word carries the record twice. Two groups under one id
  // are ONE group to the shape model, so the second keeps its generated id.
  const taken = documentGroupIdsInUse(editor.state.doc);
  const converted = await convertedDocumentSmartArtAttrs(
    node.attrs,
    null,
    [...taken],
    images,
    undefined,
    editor.state.doc.attrs.documentThemeColors,
    editor.state.doc.attrs.documentDesign,
    editor.state.doc.attrs.defaultFontFamily,
  );
  // A conversion that no longer looks like the drawing Word saved (the author's
  // hand changes the engine does not reproduce) keeps the diagram as Word drew it.
  // One with no drawing at all is laid out as Word lays it out on open, from
  // its data: there is nothing for the conversion to look like.
  if (
    !converted ||
    (!documentSmartArtDrawingAbsent(node.attrs) && !documentConversionLooksLikeDrawing(node.attrs, converted))
  ) {
    return { refusal: smartArtConvertRefusal() };
  }
  return {
    value: node.type.create(withWordsTypedOnDrawing(node.attrs, converted), null, node.marks),
  };
}

/**
 * Ask for the selected diagram's conversion. Reads only: the answer is kept
 * beside the node, so nothing in the document, its history or its file changes.
 * A diagram that is not one of MRAI's layouts asks for nothing.
 */
export function prepareDocumentSmartArt(
  editor: Editor,
  node: ProseMirrorNode,
  pageId: string | undefined,
): SmartArtPreparation<ProseMirrorNode> | null {
  if (!documentSmartArtConvertsOnEdit(node.attrs)) return null;
  return preparations.prepare(node, () => askForConversion(editor, node, pageId));
}

/**
 * The conversion a diagram with no cached drawing is drawn as, asked for as
 * soon as it is on screen (selected or not): reads only, like
 * {@link prepareDocumentSmartArt}, and the very answer its first real edit
 * then writes. `null` for every other diagram, and until it is ready.
 */
export function documentSmartArtAbsentDrawingScene(
  editor: Editor,
  node: ProseMirrorNode,
  pageId: string | undefined,
): ProseMirrorNode | null {
  if (!documentSmartArtDrawingAbsent(node.attrs)) return null;
  const entry = prepareDocumentSmartArt(editor, node, pageId);
  return entry?.state === "ready" ? entry.value : null;
}

/** Ask again now: the author pressed something that needs the answer. */
export function retryDocumentSmartArtPreparation(
  editor: Editor,
  node: ProseMirrorNode,
  pageId: string | undefined,
): SmartArtPreparation<ProseMirrorNode> | null {
  if (!documentSmartArtConvertsOnEdit(node.attrs)) return null;
  return preparations.retry(node, () => askForConversion(editor, node, pageId));
}
