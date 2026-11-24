/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

import {
  resolveSectionAtSelection,
  type SectionLayoutPatch,
} from "./sectionLayouts";
import type { WordMultiplePages } from "./wordDocumentSettings";

/**
 * Word's "Apply to" list on the Page Setup and Columns dialogs.
 *
 * - Whole document: every section takes the new values.
 * - This section: only the section holding the insertion point. Word offers
 *   it only once the document has more than one section.
 * - This point forward: Word inserts a section break at the insertion point
 *   and the new values apply from there to the end of the document. Page
 *   Setup inserts a Next Page break (a new page geometry cannot start
 *   mid-page); Columns inserts a Continuous one (newspaper columns can).
 *
 * The default choice is This section when there are several sections and
 * Whole document otherwise ("Change margins", "Create newsletter columns",
 * Microsoft Support).
 */
export const SECTION_APPLY_TO = [
  "thisSection",
  "thisPointForward",
  "wholeDocument",
] as const;
export type SectionApplyTo = (typeof SECTION_APPLY_TO)[number];

export function sectionApplyToOptions(sectionCount: number): SectionApplyTo[] {
  return sectionCount > 1
    ? ["thisSection", "thisPointForward", "wholeDocument"]
    : ["wholeDocument", "thisPointForward"];
}

export function defaultSectionApplyTo(sectionCount: number): SectionApplyTo {
  return sectionCount > 1 ? "thisSection" : "wholeDocument";
}

/** A section break can only be inserted at a collapsed text caret. */
export function sectionApplyToPointForwardAvailable(editor: Editor): boolean {
  const { selection } = editor.state;
  return selection instanceof TextSelection && selection.empty;
}

type SectionChain = {
  setSectionBreak: (breakType: "nextPage" | "continuous" | "nextColumn") => SectionChain;
  updateSectionLayout: (
    sectionIndex: number,
    patch: SectionLayoutPatch,
  ) => SectionChain;
  setWordSettings: (patch: {
    multiplePages?: WordMultiplePages | null;
    gutterAtTop?: boolean | null;
    defaultTabStopTwips?: number | null;
  }) => SectionChain;
  command: (
    fn: (props: {
      tr: import("@tiptap/pm/state").Transaction;
      commands: { updateSectionLayout: (index: number, patch: SectionLayoutPatch) => boolean };
    }) => boolean,
  ) => SectionChain;
  run: () => boolean;
};

/**
 * Apply one section-layout patch the way Word's Apply to list does, in ONE
 * transaction (one undo step). `settings`, when given, also patches the
 * document-wide settings.xml values in that same transaction (Page Setup's
 * Multiple pages and Gutter position are document settings in Word).
 */
export function applySectionLayoutPatchTo(
  editor: Editor,
  patch: SectionLayoutPatch,
  applyTo: SectionApplyTo,
  breakType: "nextPage" | "continuous" | "nextColumn",
  settings?: {
    multiplePages?: WordMultiplePages | null;
    gutterAtTop?: boolean | null;
  },
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const resolved = resolveSectionAtSelection(editor.state);
  let chain = editor.chain() as unknown as SectionChain;
  if (applyTo === "thisPointForward") {
    if (!sectionApplyToPointForwardAvailable(editor)) return false;
    chain = chain.setSectionBreak(breakType).command(({ tr, commands }) => {
      // The caret now sits in the new section; it and every later section
      // take the values, as Word's "This point forward" does.
      const after = resolveSectionAtSelection({
        doc: tr.doc,
        selection: tr.selection,
      });
      for (let index = after.sectionIndex; index < after.sectionCount; index += 1) {
        if (!commands.updateSectionLayout(index, patch)) return false;
      }
      return true;
    });
  } else if (applyTo === "wholeDocument") {
    for (let index = 0; index < resolved.sectionCount; index += 1) {
      chain = chain.updateSectionLayout(index, patch);
    }
  } else {
    chain = chain.updateSectionLayout(resolved.sectionIndex, patch);
  }
  if (settings) chain = chain.setWordSettings(settings);
  return chain.run();
}
