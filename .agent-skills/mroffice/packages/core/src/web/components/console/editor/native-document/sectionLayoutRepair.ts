/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { CollaborativeDocumentSectionMutation } from "./collaborationDocumentAttrs";
import {
  MAX_SECTION_LAYOUTS,
  normalizeSectionLayouts,
  sectionBreakBoundaries,
  type SectionLayout,
} from "./sectionLayouts";

/**
 * A document whose ordered `sectionLayouts` no longer has exactly one entry
 * per live Word section (section breaks + 1). Every section-layout command
 * fails closed on such a document rather than guess which section an entry
 * belongs to, so the author has to be told, and offered an explicit repair.
 *
 * `layoutCount` is null when the stored array is present but not a valid
 * layout chain at all (nothing can be aligned automatically).
 */
export interface SectionLayoutStructureIssue {
  readonly sectionCount: number;
  readonly layoutCount: number | null;
}

/** Null for a consistent document or one still on the legacy global model. */
export function sectionLayoutStructureIssue(
  doc: ProseMirrorNode,
): SectionLayoutStructureIssue | null {
  const raw = doc.attrs.sectionLayouts;
  if (raw === null || raw === undefined) return null;
  const sectionCount = sectionBreakBoundaries(doc).length + 1;
  const layouts = normalizeSectionLayouts(raw);
  if (layouts && layouts.length === sectionCount) return null;
  return { sectionCount, layoutCount: layouts ? layouts.length : null };
}

export type SectionLayoutRepairOrigin =
  /** The section keeps the stored entry it already lines up with. */
  | { readonly kind: "kept"; readonly entryIndex: number }
  /** The section had no entry; it takes a copy of the section before it. */
  | { readonly kind: "copied"; readonly fromSectionIndex: number };

export interface SectionLayoutRepairRow {
  readonly sectionIndex: number;
  readonly origin: SectionLayoutRepairOrigin;
  readonly layout: SectionLayout;
}

export interface SectionLayoutRepairPlan extends SectionLayoutStructureIssue {
  readonly layoutCount: number;
  readonly rows: readonly SectionLayoutRepairRow[];
  /** Stored entries no section is left to own (only when entries > sections). */
  readonly dropped: readonly { entryIndex: number; layout: SectionLayout }[];
  /** The complete chain the repair writes, one fresh entry per section. */
  readonly layouts: SectionLayout[];
  /** Identity hint for the collaborative section list, when it is one splice. */
  readonly mutation: CollaborativeDocumentSectionMutation | null;
}

/**
 * The one repair offered for a mismatched chain. It never invents settings:
 *
 * - fewer entries than sections: the sections that have an entry keep it, in
 *   order, and each later section takes a copy of the section before it (a
 *   new Word section starts with the settings of the section it came from);
 * - more entries than sections: every section but the last keeps its entry in
 *   order, the last section keeps the final entry (Word's body-level section
 *   properties always belong to the last section), and the entries in between
 *   that no section owns are dropped.
 *
 * Section breaks, text, headers/footers (`sectionBands`/`sectionStoryGraph`)
 * and the settings of every kept entry are left exactly as they are.
 */
export function planSectionLayoutRepair(
  doc: ProseMirrorNode,
): SectionLayoutRepairPlan | null {
  const issue = sectionLayoutStructureIssue(doc);
  if (!issue || issue.layoutCount === null) return null;
  const { sectionCount, layoutCount } = issue;
  if (sectionCount > MAX_SECTION_LAYOUTS) return null;
  const stored = normalizeSectionLayouts(doc.attrs.sectionLayouts);
  if (!stored) return null;

  const rows: SectionLayoutRepairRow[] = [];
  const dropped: { entryIndex: number; layout: SectionLayout }[] = [];
  if (layoutCount < sectionCount) {
    for (let index = 0; index < sectionCount; index += 1) {
      rows.push(
        index < layoutCount
          ? { sectionIndex: index, origin: { kind: "kept", entryIndex: index }, layout: stored[index] }
          : {
              sectionIndex: index,
              origin: { kind: "copied", fromSectionIndex: index - 1 },
              layout: rows[index - 1].layout,
            },
      );
    }
  } else {
    for (let index = 0; index < sectionCount - 1; index += 1) {
      rows.push({ sectionIndex: index, origin: { kind: "kept", entryIndex: index }, layout: stored[index] });
    }
    rows.push({
      sectionIndex: sectionCount - 1,
      origin: { kind: "kept", entryIndex: layoutCount - 1 },
      layout: stored[layoutCount - 1],
    });
    for (let index = sectionCount - 1; index < layoutCount - 1; index += 1) {
      dropped.push({ entryIndex: index, layout: stored[index] });
    }
  }
  // Fresh normalized copies: a copied section must never share one object
  // with the section it was copied from.
  const layouts = normalizeSectionLayouts(rows.map((row) => row.layout));
  if (!layouts || layouts.length !== sectionCount) return null;
  const mutation: CollaborativeDocumentSectionMutation | null =
    layoutCount + 1 === sectionCount
      ? { type: "insert", index: layoutCount }
      : layoutCount - 1 === sectionCount
        ? { type: "delete", index: sectionCount - 1 }
        : null;
  return { sectionCount, layoutCount, rows, dropped, layouts, mutation };
}

type StructureFailureListener = (issue: SectionLayoutStructureIssue) => void;
const failureListeners = new WeakMap<object, Set<StructureFailureListener>>();

/**
 * A section-layout command (page size, orientation, margins, columns, section
 * break insert/delete, header/footer distance...) refused to run because the
 * chain is mismatched. Commands report it so the refusal is never silent;
 * dry runs (`editor.can()`) must not call this.
 */
export function reportSectionLayoutStructureFailure(
  editor: object,
  doc: ProseMirrorNode,
): void {
  const issue = sectionLayoutStructureIssue(doc);
  if (!issue) return;
  for (const listener of failureListeners.get(editor) ?? []) {
    try {
      listener(issue);
    } catch {
      // A listener's failure must not turn a refused command into a throw.
    }
  }
}

export function subscribeSectionLayoutStructureFailure(
  editor: object,
  listener: StructureFailureListener,
): () => void {
  let listeners = failureListeners.get(editor);
  if (!listeners) {
    listeners = new Set();
    failureListeners.set(editor, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
  };
}
