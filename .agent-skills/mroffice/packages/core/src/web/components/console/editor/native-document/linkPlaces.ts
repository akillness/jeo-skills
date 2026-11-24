"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure helpers for the Insert-Hyperlink dialog's "Link to a place in this
 * document" picker (Word/WPS parity).
 *
 * Word's Insert-Hyperlink dialog lets a user point a link at a HEADING or a
 * BOOKMARK inside the same document instead of an external URL. In this editor
 * both kinds already expose a stable, sanitized anchor id:
 *   - headings carry an `anchor_id` (the Table-of-Contents target, rendered as
 *     `data-anchor-id`), collected by {@link collectHeadings};
 *   - bookmarks carry a sanitized `name`, collected by {@link collectBookmarks}.
 *
 * This module turns the live document into the flat option list the dialog shows
 * and resolves a picked option to the `#<id>` fragment href the link mark stores
 * — the same fragment representation Word writes for an in-document hyperlink, so
 * it round-trips and stays consistent with the heading/anchor model already in
 * use. It is framework-free (operates on the persisted JSON) so the option
 * building + href resolution can be unit-tested headlessly.
 *
 * SECURITY: the ids/labels surfaced here come from {@link collectHeadings} /
 * {@link collectBookmarks}, both of which sanitize their id/name to a strict
 * slug/token alphabet, so the `#<id>` href is always a safe URL fragment (no
 * scheme, no markup, no injection vector).
 */

import {
  bookmarkLinkHref,
  bookmarkNameFromLinkHref,
  collectBookmarks,
} from "./bookmarks";
import {
  collectHeadings,
  normalizeOutlineHeadingLevel,
  type TocHeading,
} from "./tableOfContents";

/**
 * Max length of a hyperlink ScreenTip / tooltip (`w:hyperlink w:tooltip`). Word's
 * own ScreenTip field accepts a short label; cap defensively so a forged page or
 * import can't store an unbounded string in the link mark / OOXML attribute.
 */
export const MAX_LINK_TITLE_CHARS = 260;

/**
 * Normalize an optional hyperlink ScreenTip (the hover tooltip shown on a link,
 * stored as the link mark's `title` attr and exported as `w:hyperlink w:tooltip`).
 * Collapses internal whitespace, trims, and clamps to {@link MAX_LINK_TITLE_CHARS}.
 * Returns `null` for a non-string / empty / whitespace-only value so a link with
 * no ScreenTip carries no `title` attribute (byte-for-byte unchanged). PURE — no
 * markup escaping here (that is the render/export edge's job); this only bounds
 * and tidies the raw text. */
export function normalizeLinkTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, MAX_LINK_TITLE_CHARS);
  return cleaned.length > 0 ? cleaned : null;
}

/** Whether an in-document target is a heading or a user bookmark. */
export type LinkPlaceKind = "heading" | "bookmark";

/** One selectable in-document anchor target for the hyperlink dialog. */
export interface LinkPlaceOption {
  kind: LinkPlaceKind;
  /** Sanitized anchor id (heading anchor_id) or bookmark name. */
  id: string;
  /** Human label shown in the picker (heading text or bookmark name). */
  label: string;
  /** Heading depth (1–6) for indentation; 0 for bookmarks. */
  level: number;
  /** The fragment href the link mark stores when this place is chosen. */
  href: string;
}

/**
 * Build the in-document anchor href for an id: a `#`-prefixed fragment. The id is
 * already sanitized by its collector; this only prefixes it. Returns "" for an
 * empty id so the caller can reject it. PURE.
 */
export function anchorHref(id: string): string {
  return id ? `#${id}` : "";
}

















export function collectLinkPlaces(doc: unknown): LinkPlaceOption[] {
  const out: LinkPlaceOption[] = [];
  const seen = new Set<string>();

  const push = (option: LinkPlaceOption): void => {
    if (!option.id || !option.href) return;
    const key = `${option.kind}:${option.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(option);
  };

  // Headings across the full outline range (1–6), so a link can target any
  // heading the navigation pane shows — not just the TOC's 1–3.
  const headings: TocHeading[] = collectHeadings(doc, normalizeOutlineHeadingLevel);
  for (const heading of headings) {
    push({
      kind: "heading",
      id: heading.id,
      // Fall back to the id when a heading has no readable text (e.g. a heading
      // that is only an image) so the option is never blank.
      label: heading.text || heading.id,
      level: heading.level,
      href: anchorHref(heading.id),
    });
  }

  for (const bookmark of collectBookmarks(doc)) {
    push({
      kind: "bookmark",
      id: bookmark.name,
      label: bookmark.name,
      level: 0,
      href: bookmarkLinkHref(bookmark.name),
    });
  }

  return out;
}

/**
 * Resolve a picked place id (the `<select>` value) to its option from a prebuilt
 * list. The value is the option's `href` (unique per option), so the dialog can
 * store one string and recover the full option. Returns null when no option
 * matches (e.g. the picked place was deleted between open and submit). PURE.
 */
export function findLinkPlaceByHref(
  options: LinkPlaceOption[],
  href: string,
): LinkPlaceOption | null {
  if (!href) return null;
  const exact = options.find((option) => option.href === href);
  if (exact) return exact;
  // A link written before bookmark hrefs carried their kind (`#<name>`): it
  // means the heading of that id when there is one (matched above), else the
  // bookmark of that name — the same order navigation resolves it in.
  if (bookmarkNameFromLinkHref(href) || !href.startsWith("#")) return null;
  const legacyName = href.slice(1);
  return (
    options.find(
      (option) => option.kind === "bookmark" && option.id === legacyName,
    ) ?? null
  );
}
