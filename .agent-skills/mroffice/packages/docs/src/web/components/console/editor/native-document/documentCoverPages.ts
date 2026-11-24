/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import {
  COVER_FIELD_METADATA_KEY,
  DOCUMENT_COVER_PAGE_NODE,
  isDocumentCoverPageId,
  normalizeCoverDateInput,
  type CoverFieldKey,
} from "@mrnote/core/web/lib/document-cover-pages/coverPages.ts";

import {
  BLOCK_CONTENT_CONTROL_NODE_NAME,
  CONTENT_CONTROL_MARK_NAME,
  normalizeControlMeta,
} from "@mrnote/core/web/components/console/editor/native-document/contentControls.ts";
import {
  documentMetadataValue,
  documentMetadataWith,
  normalizeDocumentMetadata,
} from "@mrnote/core/web/components/console/editor/native-document/documentMetadata.ts";
import { normalizeSectionBands } from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import { PAGE_BLOCK_NODE } from "@mrnote/core/web/components/console/editor/native-document/paged/pageBlockExtension.ts";
import {
  normalizeSectionStoryGraph,
  setSectionStoryTitlePage,
} from "@mrnote/core/web/components/console/editor/native-document/sectionStoryGraph.ts";

/**
 * Word-aligned cover pages in the editor.
 *
 * A cover is one `documentCoverPage` atom at the very start of the first page
 * followed by the page break it owns (Word: a Cover Pages gallery content
 * control whose last paragraph breaks the page). Inserting a cover replaces
 * the current one; "Remove Current Cover Page" deletes it with its break. The
 * cover's words are the document's properties (`documentMetadata`), so typing
 * into one field changes the property and every other field bound to it.
 *
 * Documents written before the Word gallery carry an MRNote cover as a block
 * content control tagged `MRAI_COVER_PAGE_V1:<controlId>:<preset>`. It is
 * still recognized (so it can be replaced or removed) and still exports as it
 * always did; only new covers are atoms.
 */

export { DOCUMENT_COVER_PAGE_NODE };

/** The legacy (V1) presets an older document may still carry. */
export const DOCUMENT_COVER_PAGE_PRESETS = [
  "minimal",
  "line",
  "centered",
] as const;

export type DocumentCoverPagePreset =
  (typeof DOCUMENT_COVER_PAGE_PRESETS)[number];

export const DOCUMENT_COVER_PAGE_TAG_PREFIX = "MRAI_COVER_PAGE_V1:";

const DOCUMENT_COVER_PAGE_TAG_RE =
  /^MRAI_COVER_PAGE_V1:([1-9]\d{0,9}):(minimal|line|centered)$/;
const MAX_CONTROL_ID = 0x7fffffff;
const PAGE_BREAK_NODE = "pageBreak";

export type DocumentCoverPageAuthority =
  | { kind: "none" }
  | { kind: "ambiguous" }
  | {
      kind: "current";
      format: "atom";
      /** The catalog design, or null for a cover imported from Word. */
      coverId: string | null;
      controlId: number;
      node: ProseMirrorNode;
      pos: number;
      /** The owned page break right after the cover, when it is still there. */
      pageBreak: ProseMirrorNode | null;
      pageBreakPos: number | null;
    }
  | {
      kind: "current";
      format: "legacy";
      controlId: number;
      pageBreak: ProseMirrorNode;
      pageBreakPos: number;
      preset: DocumentCoverPagePreset;
      wrapper: ProseMirrorNode;
      wrapperPos: number;
    };

interface ParsedCoverPageIdentity {
  controlId: number;
  preset: DocumentCoverPagePreset;
}

interface LocatedCoverPageIdentity extends ParsedCoverPageIdentity {
  node: ProseMirrorNode;
  pos: number;
}

interface LocatedContentControlIdentity {
  controlId: number;
  kind: "block" | "inline";
  node: ProseMirrorNode;
  pos: number;
}

function isDocumentCoverPagePreset(
  value: unknown,
): value is DocumentCoverPagePreset {
  return (
    typeof value === "string" &&
    (DOCUMENT_COVER_PAGE_PRESETS as readonly string[]).includes(value)
  );
}

function hasCanonicalEmptyConfiguration(node: ProseMirrorNode): boolean {
  const attrs = node.attrs as Record<string, unknown>;
  const meta = normalizeControlMeta(attrs);
  return (
    attrs.controlType === "richText" &&
    typeof attrs.alias === "string" &&
    meta.alias === attrs.alias &&
    attrs.lock === null &&
    Array.isArray(attrs.listItems) &&
    attrs.listItems.length === 0 &&
    attrs.checked === false &&
    attrs.dateFormat === "" &&
    attrs.dateFullDate === "" &&
    attrs.multiline === false &&
    attrs.checkedState === null &&
    attrs.uncheckedState === null &&
    meta.controlType === "richText" &&
    meta.lock === null &&
    meta.listItems.length === 0 &&
    meta.checked === false &&
    meta.dateFormat === "" &&
    meta.dateFullDate === "" &&
    meta.multiline === false &&
    meta.checkedState === null &&
    meta.uncheckedState === null
  );
}

function parseCoverPageIdentity(
  node: ProseMirrorNode,
): ParsedCoverPageIdentity | null {
  if (node.type.name !== BLOCK_CONTENT_CONTROL_NODE_NAME) return null;
  const attrs = node.attrs as Record<string, unknown>;
  const tag = attrs.tag;
  if (typeof tag !== "string") return null;
  const match = DOCUMENT_COVER_PAGE_TAG_RE.exec(tag);
  if (!match) return null;
  const controlId = Number(match[1]);
  const preset = match[2];
  if (
    !Number.isInteger(controlId) ||
    controlId < 1 ||
    controlId > MAX_CONTROL_ID ||
    !isDocumentCoverPagePreset(preset) ||
    typeof attrs.controlId !== "number" ||
    attrs.controlId !== controlId ||
    normalizeControlMeta(attrs).tag !== tag ||
    !hasCanonicalEmptyConfiguration(node) ||
    node.childCount === 0
  ) {
    return null;
  }
  return { controlId, preset };
}

function hasCoverPageTagPrefix(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.startsWith(DOCUMENT_COVER_PAGE_TAG_PREFIX)
  );
}

function coverAtomControlId(node: ProseMirrorNode): number {
  const value = node.attrs.controlId;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_CONTROL_ID
    ? value
    : 0;
}

/**
 * The one current cover, located the way Word locates it: by what it IS (the
 * cover atom, or the authenticated legacy wrapper) at the document start,
 * never by its text or look. Two covers, a cover away from the start, or a
 * legacy tag that does not authenticate make the answer "ambiguous", and no
 * command touches an ambiguous document.
 */
export function readDocumentCoverPageAuthority(
  doc: ProseMirrorNode,
): DocumentCoverPageAuthority {
  const candidates: LocatedCoverPageIdentity[] = [];
  const atoms: Array<{ node: ProseMirrorNode; pos: number }> = [];
  const controlIdentities: LocatedContentControlIdentity[] = [];
  let malformed = false;

  doc.descendants((node, pos) => {
    if (node.type.name === DOCUMENT_COVER_PAGE_NODE) {
      atoms.push({ node, pos });
      return false;
    }
    if (node.type.name === BLOCK_CONTENT_CONTROL_NODE_NAME) {
      const controlId = normalizeControlMeta(node.attrs).controlId;
      if (controlId !== null) {
        controlIdentities.push({ controlId, kind: "block", node, pos });
      }
      const tag = node.attrs.tag;
      if (hasCoverPageTagPrefix(tag)) {
        const parsed = parseCoverPageIdentity(node);
        if (parsed) candidates.push({ ...parsed, node, pos });
        else malformed = true;
      }
    }
    for (const mark of node.marks) {
      if (mark.type.name === CONTENT_CONTROL_MARK_NAME) {
        const controlId = normalizeControlMeta(mark.attrs).controlId;
        if (controlId !== null) {
          controlIdentities.push({ controlId, kind: "inline", node, pos });
        }
        if (hasCoverPageTagPrefix(mark.attrs.tag)) malformed = true;
      }
    }
    return true;
  });

  if (malformed || candidates.length + atoms.length > 1) {
    return { kind: "ambiguous" };
  }
  const firstPage = doc.firstChild;
  if (!firstPage || firstPage.type.name !== PAGE_BLOCK_NODE) {
    return { kind: "ambiguous" };
  }
  if (candidates.length === 0 && atoms.length === 0) return { kind: "none" };

  if (atoms.length === 1) {
    const atom = atoms[0];
    if (atom.pos !== 1 || firstPage.firstChild !== atom.node) {
      return { kind: "ambiguous" };
    }
    const next = firstPage.childCount > 1 ? firstPage.child(1) : null;
    const owned = next && next.type.name === PAGE_BREAK_NODE ? next : null;
    return {
      kind: "current",
      format: "atom",
      coverId: isDocumentCoverPageId(atom.node.attrs.coverId)
        ? atom.node.attrs.coverId
        : null,
      controlId: coverAtomControlId(atom.node),
      node: atom.node,
      pos: atom.pos,
      pageBreak: owned,
      pageBreakPos: owned ? atom.pos + atom.node.nodeSize : null,
    };
  }

  if (firstPage.childCount < 2) return { kind: "ambiguous" };
  const candidate = candidates[0];
  const matchingControlIdentities = controlIdentities.filter(
    ({ controlId }) => controlId === candidate.controlId,
  );
  const wrapper = firstPage.child(0);
  const pageBreak = firstPage.child(1);
  const wrapperPos = 1;
  const pageBreakPos = wrapperPos + wrapper.nodeSize;
  if (
    matchingControlIdentities.length !== 1 ||
    matchingControlIdentities[0]?.kind !== "block" ||
    matchingControlIdentities[0]?.node !== candidate.node ||
    matchingControlIdentities[0]?.pos !== candidate.pos ||
    candidate.pos !== wrapperPos ||
    candidate.node !== wrapper ||
    pageBreak.type.name !== PAGE_BREAK_NODE
  ) {
    return { kind: "ambiguous" };
  }
  return {
    kind: "current",
    format: "legacy",
    controlId: candidate.controlId,
    pageBreak,
    pageBreakPos,
    preset: candidate.preset,
    wrapper,
    wrapperPos,
  };
}

/** The gallery item the current cover is, for its checked state. */
export function currentDocumentCoverId(
  authority: DocumentCoverPageAuthority,
): string | null {
  return authority.kind === "current" && authority.format === "atom"
    ? authority.coverId
    : null;
}

function editorSurfaceIsLive(editor: Editor): boolean {
  return (
    !editor.isDestroyed && editor.isEditable && editor.view.dom.isConnected
  );
}

export function canMutateDocumentCoverPage(editor: Editor): boolean {
  if (!editorSurfaceIsLive(editor)) return false;
  const schema = editor.state.schema;
  if (
    !schema.nodes[PAGE_BLOCK_NODE] ||
    !schema.nodes[DOCUMENT_COVER_PAGE_NODE] ||
    !schema.nodes[PAGE_BREAK_NODE]
  ) {
    return false;
  }
  return readDocumentCoverPageAuthority(editor.state.doc).kind !== "ambiguous";
}

function occupiedControlIds(doc: ProseMirrorNode): Set<number> {
  const controlIds = new Set<number>();
  doc.descendants((node) => {
    if (node.type.name === DOCUMENT_COVER_PAGE_NODE) {
      const id = coverAtomControlId(node);
      if (id) controlIds.add(id);
      return false;
    }
    if (node.type.name === BLOCK_CONTENT_CONTROL_NODE_NAME) {
      const controlId = normalizeControlMeta(node.attrs).controlId;
      if (controlId !== null) controlIds.add(controlId);
    }
    for (const mark of node.marks) {
      if (mark.type.name === CONTENT_CONTROL_MARK_NAME) {
        const controlId = normalizeControlMeta(mark.attrs).controlId;
        if (controlId !== null) controlIds.add(controlId);
      }
    }
    return true;
  });
  return controlIds;
}

function freshControlId(doc: ProseMirrorNode, coverId: string): number {
  const occupied = occupiedControlIds(doc);
  const seed = `${coverId}:${Date.now()}:${Math.random()}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  let controlId = (hash >>> 1) % MAX_CONTROL_ID || 1;
  while (occupied.has(controlId)) {
    controlId = controlId >= MAX_CONTROL_ID ? 1 : controlId + 1;
  }
  return controlId;
}

/**
 * The first section's "Different First Page" turned on the way Word turns it
 * on when it inserts a cover: in the model the document already uses (the
 * native section story graph and its bands, section bands, or the single
 * document-level switch), adding no first-page story of its own. Empty when
 * it is already on.
 */
export function coverTitlePageAttrs(
  doc: ProseMirrorNode,
): Record<string, unknown> {
  const attrs = doc.attrs as Record<string, unknown>;
  let sectionCount = 1;
  doc.descendants((node) => {
    if (node.type.name === "sectionBreak") sectionCount += 1;
    return true;
  });
  const updates: Record<string, unknown> = {};
  const graph =
    attrs.sectionStoryGraph !== null && attrs.sectionStoryGraph !== undefined
      ? normalizeSectionStoryGraph(attrs.sectionStoryGraph, sectionCount)
      : null;
  if (graph && !graph.sections[0]?.titlePage) {
    const next = setSectionStoryTitlePage(graph, 0, true);
    if (next) updates.sectionStoryGraph = next;
  }
  const bands = normalizeSectionBands(attrs.sectionBands);
  if (bands && bands.length === sectionCount && bands[0]?.differentFirstPage !== true) {
    updates.sectionBands = bands.map((entry, index) =>
      index === 0 ? { ...entry, differentFirstPage: true } : entry,
    );
  }
  if (!graph && !bands && attrs.differentFirstPage !== true) {
    updates.differentFirstPage = true;
  }
  return updates;
}

export interface DocumentCoverInsertOptions {
  /** The author's language: placeholders, aliases and date pictures. */
  locale: string;
}

/**
 * The edit that inserts a Word-aligned cover, or replaces the current one
 * (Word: "if you insert another cover page, the new cover page will replace
 * the first"), on any editor state: the cover always lands at the document
 * start, whatever the selection. Null when the cover cannot go in (an
 * ambiguous document, no first page) or is already that cover. It needs no
 * measured pages: the cover is the first page's first block and owns the page
 * break after it.
 */
export function documentCoverPageTransaction(
  state: EditorState,
  coverId: string,
  options: DocumentCoverInsertOptions,
): Transaction | null {
  if (!isDocumentCoverPageId(coverId)) return null;
  const coverType = state.schema.nodes[DOCUMENT_COVER_PAGE_NODE];
  const pageBreakType = state.schema.nodes[PAGE_BREAK_NODE];
  if (!coverType || !pageBreakType) return null;
  const authority = readDocumentCoverPageAuthority(state.doc);
  if (authority.kind === "ambiguous") return null;
  if (
    authority.kind === "current" &&
    authority.format === "atom" &&
    authority.coverId === coverId
  ) {
    return null;
  }
  const firstPage = state.doc.firstChild;
  if (!firstPage || firstPage.type.name !== PAGE_BLOCK_NODE) return null;

  const controlId =
    authority.kind === "current" && authority.controlId
      ? authority.controlId
      : freshControlId(state.doc, coverId);
  const cover = coverType.create({
    coverId,
    locale: options.locale,
    controlId,
    scene: null,
  });
  const nodes = Fragment.fromArray([cover, pageBreakType.create()]);

  let transaction = state.tr;
  // Word's cover is page 1 of a section that uses a different first-page
  // header and footer (w:titlePg) with none of its own, so the cover shows
  // no header, footer or page number while the pages after it keep theirs.
  for (const [key, value] of Object.entries(coverTitlePageAttrs(state.doc))) {
    transaction = transaction.setDocAttribute(key, value);
  }
  if (authority.kind === "current" && authority.format === "atom") {
    const end = authority.pageBreak
      ? (authority.pageBreakPos as number) + authority.pageBreak.nodeSize
      : authority.pos + authority.node.nodeSize;
    transaction = transaction.replaceWith(authority.pos, end, nodes);
  } else if (authority.kind === "current") {
    transaction = transaction.replaceWith(
      authority.wrapperPos,
      authority.pageBreakPos + authority.pageBreak.nodeSize,
      nodes,
    );
  } else {
    transaction = transaction.insert(1, nodes);
  }
  return closeHistory(transaction);
}

/**
 * Insert a Word-aligned cover from the gallery into the live editor (see
 * {@link documentCoverPageTransaction}).
 */
export function applyDocumentCoverPage(
  editor: Editor,
  coverId: string,
  options: DocumentCoverInsertOptions,
): boolean {
  if (!editorSurfaceIsLive(editor)) return false;
  const snapshot = editor.state;
  const transaction = documentCoverPageTransaction(snapshot, coverId, options);
  if (!transaction) return false;
  const live = editor.state;
  if (
    !editorSurfaceIsLive(editor) ||
    live.doc !== snapshot.doc ||
    !live.selection.eq(snapshot.selection)
  ) {
    return false;
  }
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

/**
 * The edit that removes only the current cover and the page break it owns,
 * on any editor state; null when there is no single current cover.
 */
export function removeDocumentCoverPageTransaction(
  state: EditorState,
): Transaction | null {
  const authority = readDocumentCoverPageAuthority(state.doc);
  if (authority.kind !== "current") return null;
  const firstPage = state.doc.firstChild;
  if (!firstPage || firstPage.type.name !== PAGE_BLOCK_NODE) return null;

  const from =
    authority.format === "atom" ? authority.pos : authority.wrapperPos;
  const to =
    authority.format === "atom"
      ? authority.pageBreak
        ? (authority.pageBreakPos as number) + authority.pageBreak.nodeSize
        : authority.pos + authority.node.nodeSize
      : authority.pageBreakPos + authority.pageBreak.nodeSize;
  const ownsWholePage = from === 1 && to === firstPage.nodeSize - 1;

  let transaction = state.tr;
  if (ownsWholePage) {
    if (state.doc.childCount < 2) {
      // The cover was the whole document: leave Word's one empty paragraph.
      const paragraph = state.schema.nodes.paragraph;
      if (!paragraph) return null;
      transaction = transaction.replaceWith(from, to, paragraph.create());
    } else {
      transaction = transaction.delete(0, firstPage.nodeSize);
    }
  } else {
    transaction = transaction.delete(from, to);
  }
  return closeHistory(transaction);
}

/** Remove only the current cover and the page break it owns. */
export function removeDocumentCoverPage(editor: Editor): boolean {
  if (!editorSurfaceIsLive(editor)) return false;
  const snapshot = editor.state;
  const transaction = removeDocumentCoverPageTransaction(snapshot);
  if (!transaction) return false;
  const live = editor.state;
  if (
    !editorSurfaceIsLive(editor) ||
    live.doc !== snapshot.doc ||
    !live.selection.eq(snapshot.selection)
  ) {
    return false;
  }
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

/**
 * Fill cover fields as the cover's own controls do: each field is a document
 * property, so every control bound to it shows the new words. A date is
 * stored as an ISO day when it reads as one. True when a property changed.
 */
export function setDocumentCoverFieldsOnTransaction(
  transaction: Transaction,
  fields: Partial<Record<CoverFieldKey, string>>,
): boolean {
  let metadata: unknown = transaction.doc.attrs.documentMetadata;
  let changed = false;
  for (const [field, text] of Object.entries(fields) as [CoverFieldKey, string | undefined][]) {
    if (text === undefined) continue;
    const key = COVER_FIELD_METADATA_KEY[field];
    const value = field === "publishDate" ? normalizeCoverDateInput(text) : text;
    const before = documentMetadataValue(normalizeDocumentMetadata(metadata), key);
    const next = documentMetadataWith(metadata, key, value);
    if ((next ? documentMetadataValue(next, key) : "") === before) continue;
    metadata = next;
    changed = true;
  }
  if (changed) transaction.setDocAttribute("documentMetadata", metadata);
  return changed;
}

export {
  documentCoverPageContext,
  documentCoverPageScene,
  type DocumentCoverPageContext,
} from "@mrnote/core/web/lib/document-cover-pages/coverPageContext.ts";

/**
 * Type into one bound field: the property changes, so every control bound to
 * it follows. A date is stored as an ISO day once the text reads as one.
 */
export function setDocumentCoverField(
  editor: Editor,
  field: CoverFieldKey,
  text: string,
  { commit = false }: { commit?: boolean } = {},
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const key = COVER_FIELD_METADATA_KEY[field];
  const value =
    commit && field === "publishDate" ? normalizeCoverDateInput(text) : text;
  const current = editor.state.doc.attrs.documentMetadata;
  const currentValue = documentMetadataValue(
    normalizeDocumentMetadata(current),
    key,
  );
  const next = documentMetadataWith(current, key, value);
  const nextValue = next ? documentMetadataValue(next, key) : "";
  if (nextValue === currentValue && (commit || value.trim() === currentValue)) {
    return false;
  }
  editor.view.dispatch(editor.state.tr.setDocAttribute("documentMetadata", next));
  return true;
}
