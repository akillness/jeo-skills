/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { SPLIT_CONTINUATION_ATTR, SPLIT_CONTINUES_ATTR } from "./paginationProjectionKeys";

/** Where a property shows: on the first fragment only, the last only, or all. */
export type FragmentRole = "first" | "last" | "all";

/** Which fragment a block is: a whole (uncut) block is both first and last. */
export type FragmentPosition = "whole" | "first" | "middle" | "last";

/**
 * Paragraph and heading attributes whose presentation is not on every
 * fragment. An attribute not listed shows on every fragment ("all"); the
 * paragraph border's edges are declared one by one in
 * `PARAGRAPH_BORDER_EDGE_ROLES`.
 */
export const PARAGRAPH_FRAGMENT_ROLES: Readonly<Record<string, FragmentRole>> = Object.freeze({
  spaceBefore: "first",
  textIndent: "first",
  firstLineIndentPt: "first",
  dropCap: "first",
  pageBreakBefore: "first",
  spaceAfter: "last",
});

export const PARAGRAPH_BORDER_EDGE_ROLES: Readonly<Record<"top" | "bottom" | "left" | "right" | "between" | "bar", FragmentRole>> =
  Object.freeze({ top: "first", bottom: "last", left: "all", right: "all", between: "all", bar: "all" });

/** Edges an earlier fragment keeps the room of without drawing them. */
const PARAGRAPH_BORDER_EDGES_RESERVED = new Set<string>(["bottom"]);

export function fragmentPosition(attrs: Readonly<Record<string, unknown>> | null | undefined): FragmentPosition {
  const continues = attrs?.[SPLIT_CONTINUES_ATTR] === true;
  const continuation = attrs?.[SPLIT_CONTINUATION_ATTR] === true;
  if (continues && continuation) return "middle";
  if (continues) return "first";
  if (continuation) return "last";
  return "whole";
}

export function roleShowsOn(role: FragmentRole, position: FragmentPosition): boolean {
  if (role === "all" || position === "whole") return true;
  return role === "first" ? position === "first" : position === "last";
}

/** Whether the paragraph attribute `name` draws on the fragment `attrs` belong to. */
export function paragraphAttributeShows(
  name: string,
  attrs: Readonly<Record<string, unknown>> | null | undefined,
): boolean {
  return roleShowsOn(PARAGRAPH_FRAGMENT_ROLES[name] ?? "all", fragmentPosition(attrs));
}

/** How the paragraph border's `edge` appears on the fragment `attrs` belong
 * to: drawn, its room kept undrawn, or absent. */
export function paragraphBorderEdgeOnFragment(
  edge: keyof typeof PARAGRAPH_BORDER_EDGE_ROLES,
  attrs: Readonly<Record<string, unknown>> | null | undefined,
): "draw" | "reserve" | "omit" {
  const position = fragmentPosition(attrs);
  if (roleShowsOn(PARAGRAPH_BORDER_EDGE_ROLES[edge], position)) return "draw";
  const role = PARAGRAPH_BORDER_EDGE_ROLES[edge];
  // The room is kept before the seam (an earlier fragment), never after it.
  return role === "last" && PARAGRAPH_BORDER_EDGES_RESERVED.has(edge) ? "reserve" : "omit";
}

/**
 * What a paragraph has once, on its first fragment alone, whatever page cut
 * it: the paragraph's own entry or mark, never repeated on a continuation.
 * Each reader of a fragment names the feature it asks about, so what a cut
 * paragraph carries where is declared here rather than in each reader.
 */
export const FIRST_FRAGMENT_FEATURES = Object.freeze({
  /** Its list or heading number, the marker and the tab after it. */
  listLabel: "the list or heading number and its marker",
  /** The heading as a heading: its TOC row, outline entry, anchor, Go To
   * target, chapter for page numbers. */
  headingEntry: "the heading's entry in the TOC, outline, anchors and navigation",
  /** Word's horizontal-rule paragraph border drawn as a rule. */
  horizontalRule: "the horizontal rule a paragraph draws",
  /** The paragraph's Word auto line-spacing fact (its first line's box). */
  autoLineSpacingFact: "the paragraph's auto line-spacing fact",
  /** Where the paragraph begins: a caret at its start, a line break before
   * it when its text is joined, the page an equation closes. */
  paragraphStart: "the start of the paragraph",
});

export type FirstFragmentFeature = keyof typeof FIRST_FRAGMENT_FEATURES;

/** Whether the fragment `attrs` belong to carries `feature`: only the first
 * fragment of a cut paragraph (or an uncut one) does. */
export function fragmentCarries(
  _feature: FirstFragmentFeature,
  attrs: Readonly<Record<string, unknown>> | null | undefined,
): boolean {
  return attrs?.[SPLIT_CONTINUATION_ATTR] !== true;
}
