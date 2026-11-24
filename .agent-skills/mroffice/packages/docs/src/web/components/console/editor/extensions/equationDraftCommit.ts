/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * An equation open in its editor holds a draft the document does not have
 * yet: it is written when the edit ends (Enter, Esc, a click outside). A
 * ribbon command run meanwhile rewrote the equation from the document's own
 * copy -- Clear Formatting took its size and colour off and closed the
 * editor, and what had just been typed in it was gone (live Word audit
 * WUA 048). Word keeps what was typed in an equation through a formatting
 * command.
 *
 * Each equation node view registers how to end its edit keeping the draft;
 * the ribbon ends every open one before a document command writes.
 */

const commits = new WeakMap<Element, () => void>();

/** Register `commit` for the equation drawn in `wrapper`; returns the
 * unregistration. */
export function registerEquationDraftCommit(wrapper: Element, commit: () => void): () => void {
  commits.set(wrapper, commit);
  return () => {
    if (commits.get(wrapper) === commit) commits.delete(wrapper);
  };
}

/**
 * End the edit of every equation open in its editor under `root`, writing
 * its draft into the document (the selection is left as it is). True when
 * one was open.
 */
export function commitOpenEquationDrafts(root: ParentNode | null | undefined): boolean {
  if (!root) return false;
  let committed = false;
  for (const wrapper of Array.from(
    root.querySelectorAll(
      '.inline-math-wrapper[data-editing="true"], .math-block-wrapper[data-editing="true"]',
    ),
  )) {
    const commit = commits.get(wrapper);
    if (!commit) continue;
    commit();
    committed = true;
  }
  return committed;
}
