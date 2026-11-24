/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Take over the font records a save rewrote on the server.
 *
 * A document generated with an embedded subset carries only the characters it
 * was written with, exactly as Word's "Embed only the characters used in the
 * document" does. Saving a character the subset lacks makes the server re-subset
 * the packaged face, publish the replacement as a new page-owned asset, and
 * return content whose records name it. Keeping the editor's own copy of the old
 * records after that leaves the open document painting the narrow subset until
 * it is reopened, and makes every later save re-send an asset the page has since
 * recycled.
 *
 * Only the records change. The proof accepted here is that replacing them in
 * the draft this save acknowledged reproduces the saved content byte for byte:
 * nothing else about the document may differ, so adoption can never import a
 * server edit the user did not make.
 */
import type { EditorState, Transaction } from "@tiptap/pm/state";

import { pageDocumentJsonEquals } from "@mrnote/core/web/lib/page-save-acknowledgement.ts";
import {
  normalizeOfficeFontAsset,
  type OfficeFontAsset,
  type OfficeFontAssetFile,
} from "@mrnote/core/web/components/office-ribbon/officeFontFace.ts";

/** Save receipts whose content carries font records the editor must take over. */
const ADOPTED_FONT_RECEIPTS = new Set([
  "widened",
  "rebound_and_widened",
  "stale_font_reference_rebound",
]);

const FONT_MARK_TYPES = new Set(["fontFamily", "fontCjkFamily", "fontComplexFamily"]);
const ATTACHMENT_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u;

export interface DocumentFontRecordAdoption {
  /** Replacement record by the file key the draft still names. */
  readonly replacements: ReadonlyMap<string, OfficeFontAssetFile>;
  /** The assets to lease before the records start naming them. */
  readonly assets: readonly OfficeFontAsset[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fileKey(file: OfficeFontAssetFile): string {
  return file.attachmentId ?? `embedded:${file.sha256}`;
}

/** Every page-owned font file a document names, keyed the way the server keys it. */
function documentFontAssets(content: unknown): OfficeFontAsset[] {
  const assets: OfficeFontAsset[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!isRecord(node)) return;
    if (typeof node.type === "string" && FONT_MARK_TYPES.has(node.type)) {
      const attrs = isRecord(node.attrs) ? node.attrs : null;
      const face = attrs && isRecord(attrs.face) ? attrs.face : null;
      const asset = face ? normalizeOfficeFontAsset(face.asset) : null;
      if (asset) assets.push(asset);
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(content);
  return assets;
}

function documentFontFiles(content: unknown): Map<string, OfficeFontAssetFile> {
  const files = new Map<string, OfficeFontAssetFile>();
  for (const asset of documentFontAssets(content)) {
    for (const file of asset.files) files.set(fileKey(file), file);
  }
  return files;
}

/** Rewrite every record the map names, in a copy. Mirrors the server's own pass. */
function withReplacedFontFiles(
  content: unknown,
  replacements: ReadonlyMap<string, OfficeFontAssetFile>,
): unknown {
  if (Array.isArray(content)) {
    return content.map((child) => withReplacedFontFiles(child, replacements));
  }
  if (!isRecord(content)) return content;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) {
    next[key] = withReplacedFontFiles(value, replacements);
  }
  if (typeof next.type === "string" && FONT_MARK_TYPES.has(next.type)) {
    const attrs = isRecord(next.attrs) ? next.attrs : null;
    const face = attrs && isRecord(attrs.face) ? attrs.face : null;
    const asset = face && isRecord(face.asset) ? face.asset : null;
    if (asset && Array.isArray(asset.files)) {
      asset.files = asset.files.map((file) => {
        const normalized = normalizeOfficeFontAsset({
          family: typeof asset.family === "string" ? asset.family : "",
          files: [file],
        });
        const replacement = normalized
          ? replacements.get(fileKey(normalized.files[0]))
          : undefined;
        return replacement ? { ...replacement } : file;
      });
    }
  }
  return next;
}

function isSameFace(
  previous: OfficeFontAssetFile,
  next: OfficeFontAssetFile,
): boolean {
  return (
    previous.role === next.role &&
    previous.subsetted === true &&
    next.subsetted === true &&
    typeof next.attachmentId === "string" &&
    ATTACHMENT_ID.test(next.attachmentId) &&
    next.attachmentId !== previous.attachmentId
  );
}

/**
 * The font records this save replaced, or null when it replaced none.
 *
 * `draft` is the content the editor sent and `saved` the content the server
 * returned for it. Both the pairing (same family, same role) and the whole-
 * document reproduction must hold; a document that differs anywhere else is not
 * adopted, because then the difference is not a font record.
 */
export function readAdoptedDocumentFontRecords(options: {
  receipt: unknown;
  draft: unknown;
  saved: unknown;
}): DocumentFontRecordAdoption | null {
  const receipt = isRecord(options.receipt) ? options.receipt : null;
  if (
    !receipt ||
    receipt.status !== "succeeded" ||
    receipt.adapter !== "docx" ||
    receipt.loss_entry_count !== 0 ||
    typeof receipt.font_subset_widening !== "string" ||
    !ADOPTED_FONT_RECEIPTS.has(receipt.font_subset_widening) ||
    !isRecord(options.draft) ||
    !isRecord(options.saved)
  ) {
    return null;
  }
  const before = documentFontFiles(options.draft);
  const after = documentFontFiles(options.saved);
  if (!before.size || before.size !== after.size) return null;
  const replacements = new Map<string, OfficeFontAssetFile>();
  for (const [key, file] of before) {
    if (after.has(key)) continue;
    const candidates = [...after].filter(
      ([peer, value]) => !before.has(peer) && isSameFace(file, value),
    );
    if (candidates.length !== 1) return null;
    replacements.set(key, candidates[0][1]);
  }
  if (!replacements.size) return null;
  // The only accepted evidence: the acknowledged draft with these records
  // swapped IS the content the server saved. Anything else is a different edit.
  if (!pageDocumentJsonEquals(withReplacedFontFiles(options.draft, replacements), options.saved)) {
    return null;
  }
  const assets = new Map<string, OfficeFontAsset>();
  for (const asset of documentFontAssets(options.saved)) {
    if (asset.files.some((file) => !before.has(fileKey(file)))) {
      assets.set(asset.files.map(fileKey).join(" "), asset);
    }
  }
  return { replacements, assets: [...assets.values()] };
}

/**
 * One transaction that points every mark and node attribute at the new records.
 *
 * Positions never move: a font record is only ever an attribute, so the mark
 * ranges collected from the current document stay valid while they are applied.
 * Returns null when a replaced record would survive the pass, which keeps the
 * document and its page-owned assets from ever disagreeing by half a rewrite.
 */
export function documentFontRecordAdoptionTransaction(
  state: EditorState,
  adoption: DocumentFontRecordAdoption,
): Transaction | null {
  const transaction = state.tr;
  let changed = false;
  state.doc.descendants((node, position) => {
    const attrs = withReplacedFontFiles(node.attrs, adoption.replacements) as Record<
      string,
      unknown
    >;
    if (!pageDocumentJsonEquals(attrs, node.attrs)) {
      transaction.setNodeMarkup(position, undefined, attrs, node.marks);
      changed = true;
    }
    for (const mark of node.marks) {
      if (!FONT_MARK_TYPES.has(mark.type.name)) continue;
      // A mark's own attrs are not the `{type, attrs}` carrier the replacement
      // pass looks for; the document's serialized form is. Present it as one.
      const next = (withReplacedFontFiles(
        { type: mark.type.name, attrs: mark.attrs }, adoption.replacements,
      ) as { attrs: Record<string, unknown> }).attrs;
      if (pageDocumentJsonEquals(next, mark.attrs)) continue;
      transaction.removeMark(position, position + node.nodeSize, mark);
      transaction.addMark(
        position,
        position + node.nodeSize,
        mark.type.create(next as Record<string, unknown>),
      );
      changed = true;
    }
    return true;
  });
  if (!changed) return null;
  const remaining = documentFontFiles(transaction.doc.toJSON());
  for (const key of adoption.replacements.keys()) {
    if (remaining.has(key)) return null;
  }
  return transaction;
}
