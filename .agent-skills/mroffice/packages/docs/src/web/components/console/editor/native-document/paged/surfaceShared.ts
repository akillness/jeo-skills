/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Constants and rules of the paged document surface shared by the editor
 * (NoteEditor) and the print surface. Moved unchanged out of NoteEditor.tsx.
 */
import { resolveManuscriptGrid } from "@mrnote/core/web/components/console/editor/native-document/documentLayout.ts";
import { normalizeDocGridLinePitch } from "@mrnote/core/web/components/console/editor/extensions/DocumentPageSetup.ts";
import { sectionOnlyLineGridPitch } from "@mrnote/core/web/components/console/editor/native-document/sectionLineGrid.ts";

export const MULTIPLE_PAGE_SPREAD_GAP_PX = 28;

/**
 * Only Word's character-cell manuscript grid remains preview-only. A line
 * grid already has a real live paginator (`data-doc-grid` + linePitch) and
 * must stay on that surface or the detached preview drops its fixed-line
 * pagination and fits too much text on every page.
 */
export function manuscriptGridNeedsDetachedPreview(value: unknown): boolean {
  return resolveManuscriptGrid(value) === "grid";
}

/** Render the enabled grid only; retain absent-mode legacy pitch semantics. */
export function documentRenderGridPitchPx(
  attrs: Record<string, unknown> | null | undefined,
): number | null {
  // Native sections retain dormant pitch values even with the grid disabled.
  // An autosave receipt must not activate that dormant value on the surface.
  // A grid only the document's earlier sections carry is drawn as well
  // (sectionLineGrid marks the sections without it off the grid).
  const sectionPitch = sectionOnlyLineGridPitch(attrs);
  if (sectionPitch !== null) return sectionPitch / 15;
  if (attrs?.manuscriptGrid === "off") return null;
  const pitch = normalizeDocGridLinePitch(attrs?.docGridLinePitch);
  return pitch === null ? null : pitch / 15;
}

/** The reasons an edit of Word's own header/footer part is refused
 * (`NativeStoryRefusal`), each with its own message. */
export const NATIVE_STORY_REFUSAL_KEYS: ReadonlySet<string> = new Set([
  "native_story_edit_fields_moved",
  "native_story_edit_field_deleted",
  "native_story_edit_table_structure",
  "native_story_edit_paragraph_reordered",
  "native_story_edit_unanchored_text",
  "native_story_edit_unanchored_paragraph",
  "native_story_edit_objects_changed",
  "native_story_edit_unsupported_paragraph_property",
  "native_story_edit_paragraph_not_removable",
  "native_story_edit_split_run",
  "native_story_edit_wrapped_text",
  "native_story_edit_unsupported_run_property",
  "native_story_edit_unsupported_block",
  "native_story_edit_unsupported_mark",
  "native_story_edit_list_changed",
  "native_story_edit_new_field_unsupported",
  "native_story_edit_revision",
  "band_story_block_refused",
  "native_story_edit_invalid",
]);

/** The node types whose selection chrome reaches outside their box. */
export const DRAWING_NODE_TYPES = new Set(["documentShape", "inlineDocumentShape", "image", "chartBlock", "smartArt"]);
