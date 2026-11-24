/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The group that ends a ribbon band, marked `data-ribbon-last-shown`.
 *
 * Every editor draws Word's thin full-height divider after each group of the
 * command strip and none after the last one (note-editor.css). Which group is
 * the last one cannot be told from the markup: Docs and PDF keep every tab's
 * groups mounted and hide the other tabs', and a skin may reorder groups with
 * `order`, so the last child is rarely the last group in sight. The skins
 * used to name the tabs whose final group drops its divider, and a tab missing
 * from those lists (SmartArt, Header & Footer, Design, Picture Format, Shape
 * Format, Chart Design...) lost the divider between every one of its groups.
 * The band is measured instead: the group in sight furthest along the line
 * carries the mark, for any tab, with no names to keep up to date.
 */

export const RIBBON_LAST_SHOWN_ATTRIBUTE = "data-ribbon-last-shown";

const GROUP_SELECTOR = ".note-editor-office-toolbar__group";

/**
 * The track's groups, wherever an editor nests them: in a box-less wrapper,
 * in a contextual deck's own surface (Word's Table Layout), in the track a
 * contextual ribbon renders of its own (the deck's Chart Format). A group's
 * inner groups belong to it and are not counted.
 */
function trackGroups(track: HTMLElement): HTMLElement[] {
  const groups: HTMLElement[] = [];
  for (const group of Array.from(track.querySelectorAll<HTMLElement>(GROUP_SELECTOR))) {
    const outer = group.parentElement?.closest(GROUP_SELECTOR);
    if (outer && track.contains(outer)) continue;
    groups.push(group);
  }
  return groups;
}

function holdsGroup(node: Node): boolean {
  return node instanceof Element && (node.matches(GROUP_SELECTOR) || node.querySelector(GROUP_SELECTOR) !== null);
}

/** Moves the mark to the last group in sight; read from layout. */
export function markRibbonLastShownGroup(
  track: HTMLElement,
  groups: readonly HTMLElement[] = trackGroups(track),
): void {
  // A folded or hidden strip shows no group at all: the mark stays where it
  // was until the band is shown again.
  if (track.getClientRects().length === 0) return;
  const rtl = getComputedStyle(track).direction === "rtl";
  let last: HTMLElement | null = null;
  let lastEdge = rtl ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  for (const group of groups) {
    const rects = group.getClientRects();
    if (rects.length === 0) continue;
    const box = rects[0];
    if (box.width === 0 && box.height === 0) continue;
    // Ties go to the later group, the one the band's flow puts last.
    if (rtl ? box.left <= lastEdge : box.right >= lastEdge) {
      last = group;
      lastEdge = rtl ? box.left : box.right;
    }
  }
  for (const group of groups) {
    if (group !== last && group.hasAttribute(RIBBON_LAST_SHOWN_ATTRIBUTE)) {
      group.removeAttribute(RIBBON_LAST_SHOWN_ATTRIBUTE);
    }
  }
  if (last && !last.hasAttribute(RIBBON_LAST_SHOWN_ATTRIBUTE)) {
    last.setAttribute(RIBBON_LAST_SHOWN_ATTRIBUTE, "");
  }
}

/**
 * Keeps the mark on the track's last group in sight while groups come and go
 * (a contextual tab's groups mounted, a command group shown for a selection)
 * and while they are shown, hidden or resized (the tab gating, a narrower
 * window). Observers deliver before the frame is painted, so the divider is
 * never seen in the wrong place. Returns the unsubscribe.
 */
export function attachRibbonLastShownGroup(track: HTMLElement): () => void {
  if (typeof ResizeObserver === "undefined" || typeof MutationObserver === "undefined") {
    markRibbonLastShownGroup(track);
    return () => {};
  }
  // The first mark comes from the ResizeObserver's first delivery for the
  // groups (after layout, before paint), not from a forced read here.
  let groups: HTMLElement[] = [];
  const mark = () => markRibbonLastShownGroup(track, groups);
  // A group hidden by the tab gating measures 0x0 and one shown again takes
  // its size back: either is a resize of that group.
  const sizes = new ResizeObserver(mark);
  const observed = new Set<HTMLElement>();
  const follow = () => {
    groups = trackGroups(track);
    const current = new Set(groups);
    for (const group of observed) {
      if (!current.has(group)) {
        sizes.unobserve(group);
        observed.delete(group);
      }
    }
    for (const group of groups) {
      if (!observed.has(group)) {
        sizes.observe(group);
        observed.add(group);
      }
    }
  };
  // Groups mounted or unmounted anywhere in the band; other changes inside
  // the ribbon (a menu, a label) are none of its business.
  const children = new MutationObserver((records) => {
    const moved = records.some(
      (record) =>
        Array.from(record.addedNodes).some(holdsGroup) ||
        Array.from(record.removedNodes).some(holdsGroup),
    );
    if (!moved) return;
    follow();
    mark();
  });
  children.observe(track, { childList: true, subtree: true });
  follow();
  return () => {
    sizes.disconnect();
    children.disconnect();
  };
}
