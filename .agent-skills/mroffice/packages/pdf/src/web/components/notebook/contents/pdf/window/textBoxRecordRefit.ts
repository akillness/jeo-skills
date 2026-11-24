/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { FlattenPageSize } from "@mrnote/core/web/lib/pdf/flatten.ts";
import {
  buildManagedNativeTextBoxRecord,
  isManagedNativeTextBoxEquivalent,
  managedNativeTextBoxRowPlanFitsPage,
  pdfTextBoxGrownFrame,
  type ManagedNativeTextBoxRecord,
} from "../../../../../lib/pdf/native-text-box-roundtrip";
import type { PdfPortableTextLayout } from "../../../../../lib/pdf/portable-text-layout";
import type { TextBoxEditLike } from "../../../../../lib/pdf/text-box-flatten";

/** A box drawn again: its picture, with its row plan when it is written on
 * one, and the height its frame grew to when its rows needed more. */
export type RefitTextBoxDrawing =
  | string
  | Readonly<{ image: string; portableLayout?: PdfPortableTextLayout; height?: number }>
  | null;

export interface RefitTextBoxRecordsResult<Edit> {
  records: ManagedNativeTextBoxRecord[];
  edits: Edit[];
  /** A record was drawn again. */
  changed: boolean;
  /** A frame grew to hold its rows: `edits` holds the box at that height. */
  grew: boolean;
  /** Boxes written on a row plan that fits the page no longer and could not
   * be drawn again: a write that carried them would be refused. */
  unfit: string[];
}

const quarterTurned = (size: FlattenPageSize) => ((Number(size.rotation ?? 0) % 180) + 180) % 180 === 90;

export async function refitManagedNativeTextBoxRecords<Edit extends TextBoxEditLike>(input: {
  records: readonly ManagedNativeTextBoxRecord[];
  edits: readonly Edit[];
  /** The page (one-based) as it is written: its size, and its turn. */
  pageSize: (page: number) => FlattenPageSize | null;
  /** The page as the records were last written (before the turn). */
  pageSizeBefore?: (page: number) => FlattenPageSize | null;
  draw: (edit: Edit, pageSize: FlattenPageSize) => Promise<RefitTextBoxDrawing>;
}): Promise<RefitTextBoxRecordsResult<Edit>> {
  const records: ManagedNativeTextBoxRecord[] = [];
  let edits: Edit[] | null = null;
  const unfit: string[] = [];
  let changed = false;
  for (const record of input.records) {
    if (record.deleted) { records.push(record); continue; }
    const size = input.pageSize(record.page);
    if (!size) { records.push(record); continue; }
    const planned = Boolean(record.portableLayout);
    const before = planned ? null : input.pageSizeBefore?.(record.page) ?? null;
    const stale = planned
      ? !managedNativeTextBoxRowPlanFitsPage(record, size)
      : before !== null && quarterTurned(before) !== quarterTurned(size) && Math.abs(size.width - size.height) > 0.5;
    if (!stale) { records.push(record); continue; }
    const boxes: readonly Edit[] = edits ?? input.edits;
    const edit: Edit | undefined = boxes.find((candidate) =>
      candidate.id === record.id && Number(candidate.page) + 1 === record.page && !candidate.deleted);
    // (A box that reads otherwise than its record is drawn by its own save.)
    const drawing = edit && isManagedNativeTextBoxEquivalent(record, edit)
      ? await input.draw(edit, size).catch(() => null) : null;
    const image = typeof drawing === "string" ? drawing : drawing?.image;
    const plan = drawing && typeof drawing !== "string" ? drawing.portableLayout : undefined;
    const grown = drawing && typeof drawing !== "string" ? drawing.height : undefined;
    const drawnEdit: Edit | undefined = edit && grown !== undefined
      ? ({ ...edit, ...pdfTextBoxGrownFrame(edit, grown) } as Edit) : edit;
    const drawn = drawnEdit && image && (!planned || plan)
      ? buildManagedNativeTextBoxRecord(drawnEdit, image, plan) : null;
    if (!drawn || !managedNativeTextBoxRowPlanFitsPage(drawn, size)) {
      // A picture alone is written as it is (stretched, as before); a row
      // plan that does not fit is refused by the writer.
      if (planned) unfit.push(record.id);
      records.push(record);
      continue;
    }
    records.push(record.restoreSource && record.sourceText
      ? { ...drawn, sourceText: record.sourceText, restoreSource: true } : drawn);
    changed = true;
    if (drawnEdit && drawnEdit !== edit) {
      const grownBox: Edit = drawnEdit;
      edits = boxes.map((candidate): Edit => (candidate === edit ? grownBox : candidate));
    }
  }
  return { records, edits: edits ?? [...input.edits], changed, grew: edits !== null, unfit };
}
