/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Which page sheets the browser is skipping right now (`content-visibility:
 * auto` far from the viewport), from its own `contentvisibilityautostatechange`
 * events, and a way to run something once a skipped sheet is drawn again.
 *
 * Reading the layout of anything inside a skipped sheet lays that sheet out
 * on the spot, one sheet per read: in the 296-page book every picture
 * answering a page nudge (each key typed publishes one or two) read its own
 * sheet, ~44 forced layouts a key. A sheet nothing has said is skipped counts
 * as drawn (the reader reads it, as before): the event is the only evidence.
 */

const skipped = new WeakSet<Element>();
const waiting = new WeakMap<Element, Set<() => void>>();
const watchedDocuments = new WeakSet<Document>();

function watch(doc: Document): void {
  if (watchedDocuments.has(doc)) return;
  watchedDocuments.add(doc);
  doc.addEventListener("contentvisibilityautostatechange", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if ((event as Event & { skipped?: boolean }).skipped === true) {
      skipped.add(target);
      return;
    }
    skipped.delete(target);
    const callbacks = waiting.get(target);
    if (!callbacks) return;
    waiting.delete(target);
    for (const callback of callbacks) callback();
  }, true);
}

// Listening from the start: the first verdicts arrive with the first layout.
if (typeof document !== "undefined") watch(document);

/** The browser said it skips this element's contents. */
export function contentSkipped(element: Element | null | undefined): boolean {
  if (!element) return false;
  watch(element.ownerDocument);
  return skipped.has(element);
}

/** Run `callback` once the browser draws `element`'s contents again (now, if
 * it is not skipped). Returns the cancel. */
export function whenContentShown(element: Element, callback: () => void): () => void {
  watch(element.ownerDocument);
  if (!skipped.has(element)) {
    callback();
    return () => {};
  }
  let callbacks = waiting.get(element);
  if (!callbacks) waiting.set(element, (callbacks = new Set()));
  callbacks.add(callback);
  return () => {
    callbacks.delete(callback);
  };
}
