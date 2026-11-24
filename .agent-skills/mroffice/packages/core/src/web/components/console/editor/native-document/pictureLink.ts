/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A hyperlink on a picture (Insert > Link with a picture selected), as Word
 * has it: the picture keeps its place and look, Ctrl+Click follows the link,
 * the ScreenTip is its tooltip. The address rules are the text link's.
 */

import { NodeSelection, type EditorState } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { isPictureNode } from "./documentObjectNodes";
import { normalizeDocumentUrl } from "./documentUrl";
import { normalizeLinkTitle } from "./linkPlaces";

export const MAX_PICTURE_LINK_HREF_CHARS = 2_000;

/** A picture link's href as the node stores it, or null when refused. */
export function normalizePictureLinkHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PICTURE_LINK_HREF_CHARS) return null;
  if (trimmed.startsWith("#")) {
    return /^#[^\s<>"']{1,255}$/.test(trimmed) ? trimmed : null;
  }
  return normalizeDocumentUrl(trimmed, "link");
}

/**
 * The original location of a picture Word keeps embedded AND linked
 * (`pictureSourceLink`): a closed absolute http(s) address, never fetched by
 * the page. The server twin is `document_docx_picture_link.picture_source_link`.
 */
export function normalizePictureSourceLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // An http(s) address, or a `file:` URI Word keeps for a picture linked to
  // a local or shared path (backslashes included). Carried, never fetched.
  return /^(?:https?:\/\/[^\s"'<>\\]{1,1990}|file:[^\s"'<>]{1,1990})$/i.test(trimmed)
    ? trimmed
    : null;
}

/** The selected picture (a NodeSelection on one), with its position. */
export function selectedPicture(
  state: EditorState,
): { readonly pos: number; readonly node: ProseMirrorNode } | null {
  const { selection } = state;
  if (!(selection instanceof NodeSelection) || !isPictureNode(selection.node)) return null;
  return { pos: selection.from, node: selection.node };
}

/** The link a picture carries, in the Insert > Link dialog's terms. */
export function pictureLink(
  node: ProseMirrorNode,
): { readonly href: string; readonly title: string | null } | null {
  const href = normalizePictureLinkHref(node.attrs.linkHref);
  return href ? { href, title: normalizeLinkTitle(node.attrs.linkTitle) } : null;
}

/** The attrs that give a picture `href` (or take its link away with null). */
export function pictureLinkAttrs(
  href: string | null,
  title: string | null,
): { linkHref: string | null; linkTitle: string | null } {
  const safeHref = href ? normalizePictureLinkHref(href) : null;
  return {
    linkHref: safeHref,
    linkTitle: safeHref ? normalizeLinkTitle(title) : null,
  };
}

/** The "Ctrl+Click to follow link" hint in this platform's words: Word for
 * Mac names the Command key. */
export function followLinkHint(hint: string, mac: boolean): string {
  return mac ? hint.replace(/Ctrl|Strg/g, "\u2318") : hint;
}
