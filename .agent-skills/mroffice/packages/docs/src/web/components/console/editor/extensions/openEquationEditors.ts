/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** An equation's node view with its visual editor open. */
export const OPEN_EQUATION_EDITOR_SELECTOR =
  '.inline-math-wrapper[data-editing="true"], .math-block-wrapper[data-editing="true"]';

interface OpenEquationTracker {
  observer: MutationObserver;
  /** Elements under the root whose `data-editing` was seen set. */
  marked: Set<Element>;
}

const trackers = new WeakMap<Element, OpenEquationTracker>();
/** Wrappers whose node view says its editor is open (it says so on open and
 * on close or destroy): one opened before it is placed in the document is
 * found too, which an attribute watch alone would not see. */
const registered = new Set<Element>();

/** A math node view's editor opened (`open`) or closed / the view destroyed. */
export function noteEquationEditorOpen(wrapper: Element, open: boolean): void {
  if (open) registered.add(wrapper);
  else registered.delete(wrapper);
}

function take(tracker: OpenEquationTracker, records: readonly MutationRecord[]): void {
  for (const record of records) {
    const target = record.target;
    if (!(target instanceof Element)) continue;
    if (target.getAttribute("data-editing") === "true") tracker.marked.add(target);
    else tracker.marked.delete(target);
  }
}

/**
 * The equations open in their editor under `root`, in document order: what
 * `root.querySelectorAll(OPEN_EQUATION_EDITOR_SELECTOR)` returns. The
 * ribbon asks on every transaction; in a document of ten thousand formulas
 * that query walked half a million elements each time (40 ms a keystroke).
 * The `data-editing` attribute stays what says an editor is open: it is
 * watched under `root` and the answer read from what changed.
 */
export function openEquationEditors(root: Element): Element[] {
  if (typeof MutationObserver === "undefined") {
    return Array.from(root.querySelectorAll(OPEN_EQUATION_EDITOR_SELECTOR));
  }
  let tracker = trackers.get(root);
  if (!tracker) {
    const marked = new Set<Element>(root.querySelectorAll(OPEN_EQUATION_EDITOR_SELECTOR));
    const created: OpenEquationTracker = {
      marked,
      observer: new MutationObserver((records) => take(created, records)),
    };
    created.observer.observe(root, { subtree: true, attributes: true, attributeFilter: ["data-editing"] });
    trackers.set(root, created);
    tracker = created;
  } else {
    take(tracker, tracker.observer.takeRecords());
  }
  const open: Element[] = [];
  for (const element of new Set([...tracker.marked, ...registered])) {
    // A node view taken out of the editor (one taken out while its editor
    // was open is not told), or an element that is not an equation's wrapper.
    if (root.contains(element) && element.matches(OPEN_EQUATION_EDITOR_SELECTOR)) {
      open.push(element);
    }
  }
  if (open.length > 1) {
    open.sort((left, right) =>
      left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
  }
  return open;
}
