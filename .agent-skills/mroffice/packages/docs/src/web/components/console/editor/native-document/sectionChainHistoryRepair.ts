/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";

import { PAGED_HISTORY_APPLIED_META } from "@mrnote/core/web/lib/collab/paged-history-meta.ts";
import { COLLABORATIVE_DOCUMENT_SECTION_MUTATION_META } from "@mrnote/core/web/components/console/editor/native-document/collaborationDocumentAttrs.ts";
import { planSectionLayoutRepair, sectionLayoutStructureIssue } from "@mrnote/core/web/components/console/editor/native-document/sectionLayoutRepair.ts";

/** Marks the appended repair: the document-attribute publisher writes its
 * section chain to the room even where the room's value would otherwise win. */
export const SECTION_CHAIN_HISTORY_REPAIR_META = "mrnoteSectionChainHistoryRepair";

/**
 * The repair an Undo/Redo of this view calls for, or null.
 *
 * WUA 168: A inserts a section break, B deletes it and undoes the delete, A
 * undoes the insert. A's Undo reverts A's page-setup entry, but the break
 * standing there is B's restored one, which A's history cannot remove: two
 * sections, one entry, and every page-setup command (and deleting the break)
 * then asked for a manual repair. Word has no such state. When an Undo/Redo
 * of this view leaves exactly one section without an entry (or one entry no
 * section owns), the repair the dialog offers is applied at once, once the
 * whole operation has landed: a section without an entry
 * takes a copy of the one before it, as a new Word section does (the same
 * repair every page-setup command already applies inline).
 *
 * Only the view whose own operation broke the chain repairs it; its peers
 * receive the repaired chain, so two views never both add an entry.
 */
export function sectionChainRepairAfterHistory(
  transactions: readonly Transaction[],
  before: EditorState,
  after: EditorState,
): Transaction | null {
  if (!transactions.some((tr) => tr.getMeta(PAGED_HISTORY_APPLIED_META) !== undefined)) return null;
  void before;
  if (after.doc.attrs.pageBorder != null || !sectionLayoutStructureIssue(after.doc)) return null;
  const plan = planSectionLayoutRepair(after.doc);
  // One splice only, and never the first entry (it also mirrors the legacy
  // document-wide page setup, which this repair does not rewrite).
  if (!plan?.mutation || plan.mutation.index === 0) return null;
  return after.tr
    .setDocAttribute("sectionLayouts", plan.layouts)
    .setMeta(COLLABORATIVE_DOCUMENT_SECTION_MUTATION_META, plan.mutation)
    .setMeta(SECTION_CHAIN_HISTORY_REPAIR_META, true)
    .setMeta("addToHistory", false);
}

export const SectionChainHistoryRepair = Extension.create({
  name: "sectionChainHistoryRepair",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("sectionChainHistoryRepair"),
        appendTransaction: (transactions, before, after) =>
          sectionChainRepairAfterHistory(transactions, before, after),
      }),
    ];
  },
});
