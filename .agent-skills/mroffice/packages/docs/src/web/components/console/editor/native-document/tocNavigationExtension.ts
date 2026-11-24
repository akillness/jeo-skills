"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { Plugin, TextSelection, type Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";
import { fillHollowPagesWhere } from "@mrnote/core/web/components/console/editor/native-document/paged/pageHollowSheets.ts";
import { bookmarkNameFromLinkHref, parseExportedBookmarkName } from "@mrnote/core/web/components/console/editor/native-document/bookmarks.ts";
import { bookmarkSelection } from "@mrnote/core/web/components/console/editor/native-document/bookmarkExtension.ts";
import { sanitizeTocAnchorId } from "@mrnote/core/web/components/console/editor/native-document/tableOfContents.ts";

/**
 * Table-of-contents navigation — clicking a TOC entry scrolls to its heading.
 *
 * Word TOC entries link to bookmarks (`#_Toc123…`), but our headings carry a
 * text-derived `data-anchor-id`, so the href rarely matches an element id.
 * And the Link mark is configured `openOnClick:false` (+ target=_blank), so a
 * plain click does nothing. This plugin intercepts clicks on a TOC-entry link
 * and resolves the target two ways: first the exact preserved Word TOC alias
 * (`data-toc-anchor-id`), then normal id/name/anchor-id targets. For documents
 * imported before aliases were persisted, the compatibility fallback matches
 * duplicate captions by OCCURRENCE in document order, never by the first text
 * match. The matched heading scrolls into view and flashes briefly. Scoped to
 * `p[data-toc-level] a` so ordinary links keep their normal edit-mode behavior.
 */

const HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6";
const TOC_ENTRY_SELECTOR = "p[data-toc-level]";
let tocScrollGeneration = 0;

function decodedFragment(anchor: HTMLAnchorElement): string {
  const href = anchor.getAttribute("href") || "";
  if (!href.startsWith("#")) return "";
  const raw = href.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function normalizedCaption(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function entryCaption(entry: HTMLElement, anchor?: HTMLAnchorElement): string {
  return normalizedCaption(
    entry.querySelector<HTMLElement>(".toc-entry__title")?.textContent ||
      anchor?.textContent ||
      entry.textContent,
  );
}

function exactTarget(dom: HTMLElement, id: string): HTMLElement | null {
  if (!id) return null;
  const tocAlias = sanitizeTocAnchorId(id);
  for (const candidate of Array.from(
    dom.querySelectorAll<HTMLElement>(
      "[data-toc-anchor-id],[data-anchor-id],[id],[name]",
    ),
  )) {
    // A table of contents (or figures) row names the heading it leads to with
    // the same id: it is a link to the target, never the target. Read first,
    // it took a heading link to the contents row (WUA 073).
    if (candidate.closest(".note-editor-toc__link")) continue;
    // Word's `_Toc…` alias is intentionally checked first and separately from
    // the editable slug.  Case-insensitive comparison tolerates old producers
    // that rewrote only the fragment's `_Toc` casing while preserving identity.
    const candidateAlias = sanitizeTocAnchorId(
      candidate.getAttribute("data-toc-anchor-id"),
    );
    if (
      tocAlias &&
      candidateAlias &&
      candidateAlias.toLowerCase() === tocAlias.toLowerCase()
    ) {
      return candidate;
    }
    if (
      candidate.getAttribute("id") === id ||
      candidate.getAttribute("name") === id ||
      candidate.getAttribute("data-anchor-id") === id
    ) {
      return candidate;
    }
  }
  return null;
}

/**
 * Resolve a TOC entry to its exact heading. Exported for focused DOM-contract
 * tests; production calls it only after {@link tocEntryAnchor} scopes the click.
 */
export function resolveTocHeading(
  dom: HTMLElement,
  anchor: HTMLAnchorElement,
): HTMLElement | null {
  const id = decodedFragment(anchor);
  const exact = exactTarget(dom, id);
  if (exact) return exact;

  const clickedEntry = anchor.closest<HTMLElement>(TOC_ENTRY_SELECTOR);
  if (!clickedEntry) return null;
  const caption = entryCaption(clickedEntry, anchor);
  if (!caption) return null;

  // A legacy row still carries its TOC depth. Prefer the corresponding HTML
  // heading level so an unlisted h4 with the same caption cannot shift a TOC2
  // row onto the wrong target. Word levels 7..9 have no HTML tag, so those rows
  // continue through the document-order compatibility fallback below.
  const rawLevel = Number(clickedEntry.getAttribute("data-toc-level"));
  if (Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 6) {
    const sameLevelEntries = Array.from(
      dom.querySelectorAll<HTMLElement>(TOC_ENTRY_SELECTOR),
    ).filter(
      (entry) =>
        Number(entry.getAttribute("data-toc-level")) === rawLevel &&
        entryCaption(entry) === caption,
    );
    const levelOccurrence = sameLevelEntries.indexOf(clickedEntry);
    const sameLevelHeadings = Array.from(
      dom.querySelectorAll<HTMLElement>(`h${rawLevel}`),
    ).filter((heading) => normalizedCaption(heading.textContent) === caption);
    if (levelOccurrence >= 0 && sameLevelHeadings[levelOccurrence]) {
      return sameLevelHeadings[levelOccurrence];
    }
  }

  // Old persisted documents have no `_Toc` aliases. Pair the Nth TOC row with
  // the Nth equal-caption heading. Counting PARAGRAPHS (not anchors) matters:
  // the title and cached page number can render as two <a> elements in one row.
  const sameCaptionEntries = Array.from(
    dom.querySelectorAll<HTMLElement>(TOC_ENTRY_SELECTOR),
  ).filter((entry) => entryCaption(entry) === caption);
  const occurrence = sameCaptionEntries.indexOf(clickedEntry);
  if (occurrence < 0) return null;
  const headings = Array.from(
    dom.querySelectorAll<HTMLElement>(HEADING_SELECTOR),
  ).filter((heading) => normalizedCaption(heading.textContent) === caption);
  return headings[occurrence] ?? null;
}

/** Return a clicked TOC anchor, or null for every ordinary document link. */
export function tocEntryAnchor(
  target: EventTarget | null,
): HTMLAnchorElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest("p[data-toc-level] a") as HTMLAnchorElement | null;
}

/** Respect the OS reduced-motion preference for programmatic TOC jumps. */
export function tocScrollBehavior(
  matchMedia: ((query: string) => { matches: boolean }) | undefined =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia.bind(window)
      : undefined,
): ScrollBehavior {
  try {
    return matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
  } catch {
    return "smooth";
  }
}

/**
 * Scroll a resolved heading below the document's sticky toolbar. Native
 * `scrollIntoView()` does not consistently honor scroll-padding/margin for the
 * nested editor scrollport (and is especially wrong near the document end), so
 * compute the destination from the scrollport's real geometry.
 */
export function scrollTocHeadingIntoView(
  heading: HTMLElement,
  behavior: ScrollBehavior = tocScrollBehavior(),
): void {
  const generation = ++tocScrollGeneration;
  const scrollport = heading.closest<HTMLElement>(".note-window-scroll");
  if (!scrollport || typeof scrollport.scrollTo !== "function") {
    heading.scrollIntoView({ behavior, block: "start" });
    return;
  }
  const identityAnchor = heading.getAttribute("data-anchor-id");
  const identityAlias = heading.getAttribute("data-toc-anchor-id");
  const identityTag = heading.tagName;
  const identityText = normalizedCaption(heading.textContent);
  const initialPeers = Array.from(
    scrollport.querySelectorAll<HTMLElement>(HEADING_SELECTOR),
  ).filter(
    (candidate) =>
      candidate.tagName === identityTag &&
      normalizedCaption(candidate.textContent) === identityText,
  );
  const identityOccurrence = initialPeers.indexOf(heading);
  const currentHeading = (): HTMLElement | null => {
    if (heading.isConnected) return heading;
    const candidates = Array.from(
      scrollport.querySelectorAll<HTMLElement>(HEADING_SELECTOR),
    );
    const exact = candidates.find(
      (candidate) =>
        (identityAlias &&
          candidate.getAttribute("data-toc-anchor-id") === identityAlias) ||
        (identityAnchor &&
          candidate.getAttribute("data-anchor-id") === identityAnchor),
    );
    if (exact) return exact;
    return (
      candidates.filter(
        (candidate) =>
          candidate.tagName === identityTag &&
          normalizedCaption(candidate.textContent) === identityText,
      )[identityOccurrence] ?? null
    );
  };
  const align = (mode: ScrollBehavior) => {
    const liveHeading = currentHeading();
    if (!liveHeading) return false;
    const headingRect = liveHeading.getBoundingClientRect();
    const scrollportRect = scrollport.getBoundingClientRect();
    const paddingTop = Number.parseFloat(
      window.getComputedStyle(scrollport).scrollPaddingTop,
    );
    const safePadding = Number.isFinite(paddingTop) ? paddingTop : 0;
    const top = Math.max(
      0,
      scrollport.scrollTop +
        headingRect.top -
        scrollportRect.top -
        safePadding,
    );
    if (mode === "auto") {
      // Assignment is intentionally immediate. `scrollTo({behavior:"auto"})`
      // can still inherit `scroll-behavior:smooth` from CSS, allowing the old
      // long animation to overrun our post-layout correction.
      scrollport.scrollTop = top;
    } else {
      scrollport.scrollTo({ top, behavior: mode });
    }
    return true;
  };

  align(behavior);
  if (behavior === "smooth") {
    // Long imported documents lazily typeset formulas while the scroll moves;
    // that reflow can invalidate the first absolute destination for several
    // seconds. After a short native smooth lead-in, pin to current geometry at
    // a modest cadence until the lazy viewport has settled. The reader's own
    // scrolling ends the pinning at once: a wheel turn, a touch or a
    // scrolling key after the jump used to be pulled back to the heading for
    
    let settleInterval = 0;
    let settleTimeout = 0;
    let leadIn = 0;
    const stopSettling = () => {
      window.clearTimeout(leadIn);
      window.clearTimeout(settleTimeout);
      window.clearInterval(settleInterval);
      for (const type of USER_SCROLL_EVENTS) {
        scrollport.removeEventListener(type, stopSettling, true);
      }
    };
    for (const type of USER_SCROLL_EVENTS) {
      scrollport.addEventListener(type, stopSettling, { capture: true, passive: true });
    }
    leadIn = window.setTimeout(() => {
      if (generation !== tocScrollGeneration || !align("auto")) {
        stopSettling();
        return;
      }
      settleInterval = window.setInterval(() => {
        if (generation !== tocScrollGeneration || !align("auto")) stopSettling();
      }, 250);
      settleTimeout = window.setTimeout(() => {
        const live = generation === tocScrollGeneration;
        stopSettling();
        if (live) align("auto");
      }, 3_550);
    }, 450);
  }
}

/** Input that means the reader is scrolling on their own. */
const USER_SCROLL_EVENTS = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

/** A link to a place in this document (`#bookmark`, `#heading`) outside a
 * TOC row, or null. */
export function internalLinkAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest<HTMLAnchorElement>("a[href^='#']");
  return anchor && !anchor.closest(TOC_ENTRY_SELECTOR) ? anchor : null;
}

/** The bookmark (range or point) of that name, if the document has one. */
function bookmarkTarget(dom: HTMLElement, name: string): HTMLElement | null {
  for (const candidate of Array.from(
    dom.querySelectorAll<HTMLElement>("[data-bookmark-name],[data-bookmark-point]"),
  )) {
    if (
      candidate.getAttribute("data-bookmark-name") === name ||
      candidate.getAttribute("data-bookmark-point") === name
    ) {
      return candidate;
    }
  }
  return null;
}




export function resolveInternalLinkTarget(
  dom: HTMLElement,
  anchor: HTMLAnchorElement,
): HTMLElement | null {
  const bookmarkName = bookmarkNameFromLinkHref(anchor.getAttribute("href") || "");
  if (bookmarkName) return bookmarkTarget(dom, bookmarkName);
  const id = decodedFragment(anchor);
  if (!id) return null;
  const exact = exactTarget(dom, id);
  if (exact) return exact;
  // A link imported before bookmark hrefs carried their kind still names the
  // exported (`Mrbk_`-namespaced) bookmark; it goes to that bookmark.
  return bookmarkTarget(dom, parseExportedBookmarkName(id) || id);
}

/**
 * Following a link selects where it leads, as Word does (Word 16.86): a
 * bookmark's text, the insertion point at a point bookmark, a heading's
 * text for a link to the heading. Scrolling there alone left the selection
 * wherever the click had put it.
 */
function selectInternalLinkTarget(view: EditorView, target: HTMLElement): void {
  const { doc } = view.state;
  const name = target.getAttribute("data-bookmark-name") ?? target.getAttribute("data-bookmark-point");
  let selection: Selection | null = name ? bookmarkSelection(doc, name) : null;
  if (!selection) {
    let pos: number;
    try {
      pos = view.posAtDOM(target, 0);
    } catch {
      return;
    }
    if (pos < 0 || pos > doc.content.size) return;
    const $pos = doc.resolve(pos);
    selection = $pos.parent.isTextblock
      ? TextSelection.create(doc, $pos.start(), $pos.end())
      : TextSelection.near($pos);
  }
  if (!view.state.selection.eq(selection)) view.dispatch(view.state.tr.setSelection(selection));
}

/**
 * A link to a place in this document goes there, as in Word: Cmd/Ctrl+click
 * while editing, a plain (or middle) click when the document is read-only. The
 * link carries target=_blank for web addresses, so the browser would otherwise
 * open this page's own URL + #name in a new tab; that never happens for an
 * in-document link.
 */
/** A node a link or a table of contents row can lead to: a heading, or a
 * node carrying an anchor, an id or a bookmark. */
function mayBeLinkTarget(node: PmNode): boolean {
  if (node.type.name === "heading" || node.type.name === "bookmarkPoint") return true;
  if (node.marks.some((mark) => mark.type.name === "bookmark")) return true;
  const attrs = node.attrs as Record<string, unknown>;
  return Boolean(attrs.anchor_id || attrs.anchorId || attrs.tocAnchorId || attrs.id);
}

/** Pages drawn hollow (docs-hollow) hold no headings or bookmarks in the
 * DOM the targets are found in: those that may hold one are drawn first. */
function drawLinkTargets(view: EditorView): void {
  fillHollowPagesWhere(view, mayBeLinkTarget);
}

function followInternalLink(view: EditorView, event: MouseEvent): boolean {
  const anchor = internalLinkAnchor(event.target);
  if (!anchor || !view.dom.contains(anchor)) return false;
  event.preventDefault();
  const follow = event.metaKey || event.ctrlKey || event.button === 1 || !view.editable;
  if (!follow) return false;
  drawLinkTargets(view);
  const target = resolveInternalLinkTarget(view.dom as HTMLElement, anchor);
  if (!target) return true;
  scrollTocHeadingIntoView(target);
  selectInternalLinkTarget(view, target);
  const flash = target.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th") ?? target;
  flash.classList.add("toc-jump-flash");
  window.setTimeout(() => flash.classList.remove("toc-jump-flash"), 1200);
  return true;
}

export const TocNavigation = Extension.create({
  name: "tocNavigation",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click: (view, event) => followInternalLink(view, event),
            auxclick: (view, event) => followInternalLink(view, event),
          },
          handleClick(view: EditorView, _pos: number, event: MouseEvent) {
            const anchor = tocEntryAnchor(event.target);
            if (!anchor) return false;
            // A row of the table is text while the document is edited: a
            // click places the caret, Ctrl/Cmd+Click follows (Word).
            if (view.editable && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              return false;
            }
            drawLinkTargets(view);
            const heading = resolveTocHeading(view.dom as HTMLElement, anchor);
            if (!heading) return false;
            event.preventDefault();
            scrollTocHeadingIntoView(heading);
            heading.classList.add("toc-jump-flash");
            window.setTimeout(
              () => heading.classList.remove("toc-jump-flash"),
              1200,
            );
            return true;
          },
        },
      }),
    ];
  },
});

export default TocNavigation;
