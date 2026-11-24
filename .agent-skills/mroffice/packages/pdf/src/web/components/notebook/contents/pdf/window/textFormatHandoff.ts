/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  ApplyDocumentEditCommandDetail,
} from "@mrnote/docs/web/components/console/editor/native-document/documentEditEvents.ts";
import type {
  ManagedNativeStampRecord,
} from "../../../../../lib/pdf/native-stamp-roundtrip";
import {
  isNativePdfFreeTextRecord,
} from "../../../../../lib/pdf/native-free-text-annotations";
import {
  PDF_NATIVE_DECORATION_ID_PREFIX,
} from "../../../../../lib/pdf/native-decoration-roundtrip";
import type {
  PdfTextEditingContextRibbonAction,
  PdfTextEditingControl,
} from "../PdfTextEditingContextRibbon";
import type {
  PdfWindowFormatChanges,
  PdfWindowFormatJob,
  PdfWindowFormatOutcome,
} from "@mrnote/core/web/__cut__/mcbcc7d15ae.ts";
import type { PdfTextBoxEdit } from "../PdfTextBoxOverlay";
import { TEXTBOX_FONT_FAMILY_OPTIONS } from "../../../../../lib/pdf/text-box-font-options";
import type { PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";
import {
  getManagedNativeTextBoxRecords,
  getTextBoxEdits,
} from "../../../../../lib/pdf/page-content-model";
import { isManagedNativeTextBoxEquivalent } from "../../../../../lib/pdf/native-text-box-roundtrip";
import { readPdfPatchbackReceiptSnapshot } from "./patchbackReceipts";
import type { PdfTypedKeyBuffer } from "../../../../../lib/pdf/carried-text-edit";

export function managedDecorationRecordFingerprint(
  records: readonly ManagedNativeStampRecord[],
): string {
  return JSON.stringify(
    records
      .filter((record) => record.id.startsWith(PDF_NATIVE_DECORATION_ID_PREFIX))
      .map((record) => JSON.parse(JSON.stringify(record)) as unknown)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
  );
}






/** A format set from the Insert tab on the page's own text, to run on that
 * line in the Edit tab: the values the box asks for (bold, italic, colour,
 * size as a page-height fraction), applied there where they differ. */
export type PdfPageTextFormatHandoff = Readonly<{
  page: number;
  rect: Readonly<{ x: number; y: number; width: number; height: number }>;
  text: string;
  bold: boolean;
  italic: boolean;
  color: string | null;
  fontSize: number | null;
  /** Text typed into the Insert tab's box of the line: the line's text
   * there before and after. The opened line takes the same change, typed
   * where it was made, and stays open for the next key. */
  typed?: Readonly<{ original: string; text: string }>;
  /** The formats the words typed there were given at a bare caret in the
   * Insert tab's box (PDF 0063): the opened line presses them on those
   * words. `fontSize` is a fraction of the page height, as a box's. */
  typedFormat?: Readonly<{ fontSize?: number; family?: string; bold?: boolean; italic?: boolean }>;
  /** The keys typed after it while the line is handed over. */
  keys?: PdfTypedKeyBuffer;
  /** The AI's buttons (option C), pressed as asked on the opened line. */
  request?: PdfWindowFormatChanges;
  /** The Insert tab's ribbon commands on the page's own text, pressed as
   * they were on the opened line (bug 0063: the box's estimated colour and
   * size were applied instead, the text turned white and kept its size). */
  actions?: readonly PdfTextEditingContextRibbonAction[];
  /** Its report: once the save carrying the line landed, or why not. */
  settle?: (outcome: PdfWindowFormatOutcome) => void;
}>;



export function pdfWindowFormatHandoff(
  job: PdfWindowFormatJob,
  settle: (outcome: PdfWindowFormatOutcome) => void,
): PdfPageTextFormatHandoff {
  return Object.freeze({
    page: job.page,
    rect: job.rect,
    text: job.text,
    bold: false,
    italic: false,
    color: null,
    fontSize: null,
    request: job.changes,
    settle,
  });
}



export function pageTextFormatActionControl(action: PdfTextEditingContextRibbonAction): PdfTextEditingControl | null {
  if (action.type === "fontSize") return "fontSize";
  if (action.type === "fontSizeStep") return action.delta > 0 ? "fontSizeIncrease" : "fontSizeDecrease";
  if (action.type === "fontColor") return "fontColor";
  if (action.type === "toggle" && (action.control === "bold" || action.control === "italic")) return action.control;
  return null;
}

const lineWords = (value: string) => value.replace(/\s+/gu, "");



function lineCover(
  rect: PdfPageTextFormatHandoff["rect"],
  frame: Readonly<{ x: number; y: number; width: number; height: number }>,
): number {
  const width = Math.min(rect.x + rect.width, frame.x + frame.width) - Math.max(rect.x, frame.x);
  const height = Math.min(rect.y + rect.height, frame.y + frame.height) - Math.max(rect.y, frame.y);
  if (!(width > 0 && height > 0)) return 0;
  const area = width * height;
  return Math.max(area / Math.max(1e-9, rect.width * rect.height), area / Math.max(1e-9, frame.width * frame.height));
}





export function nativeRecordEditsLine(
  record: unknown,
  handoff: Pick<PdfPageTextFormatHandoff, "page" | "text">,
): boolean {
  const texts: string[] = [];
  const pages: number[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 6 || value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      // Byte and number arrays (replacements, spans) say nothing of the line.
      if (value.length > 0 && typeof value[0] !== "object") return;
      for (const entry of value.slice(0, 64)) walk(entry, depth + 1);
      return;
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if ((key === "originalDisplayText" || key === "originalText") && typeof entry === "string") texts.push(entry);
      else if (key === "pageNumber" && typeof entry === "number") pages.push(entry);
      else walk(entry, depth + 1);
    }
  };
  walk(record, 0);
  const wanted = lineWords(handoff.text);
  return texts.some((text) => lineWords(text) === wanted) &&
    (pages.length === 0 || pages.includes(handoff.page + 1));
}











export function pageTextFormatLanded(
  saved: Pick<PageItem, "content_version" | "content_json"> | null | undefined,
  before: Pick<PageItem, "content_version" | "content_json"> | null | undefined,
  handoff: Pick<PdfPageTextFormatHandoff, "page" | "text" | "rect">,
): boolean {
  if (!saved || Number(saved.content_version ?? 0) <= Number(before?.content_version ?? 0)) return false;
  const receipt = readPdfPatchbackReceiptSnapshot(saved as PageItem);
  if (receipt && receipt.status !== "succeeded") return false;
  const content = saved.content_json as Record<string, unknown> | undefined;
  const previous = before?.content_json as Record<string, unknown> | undefined;
  const journal = (value: Record<string, unknown> | undefined): unknown[] =>
    Array.isArray(value?.pdfNativeTransactions) ? value.pdfNativeTransactions : [];
  if (journal(content).slice(journal(previous).length).some((record) => nativeRecordEditsLine(record, handoff))) {
    return true;
  }
  const records = new Map(getManagedNativeTextBoxRecords(content).map((record) => [record.id, record] as const));
  const earlier = new Map(getManagedNativeTextBoxRecords(previous).map((record) => [record.id, record] as const));
  const wanted = lineWords(handoff.text);
  let line: PdfTextBoxEdit | null = null;
  let best = 1 / 3;
  for (const edit of getTextBoxEdits(content)) {
    if (!edit.sourceText || edit.deleted || edit.page !== handoff.page) continue;
    const cover = lineCover(handoff.rect, edit);
    if (cover >= best) { line = edit; best = cover; }
  }
  return Boolean(line && lineWords(line.text) === wanted &&
    isManagedNativeTextBoxEquivalent(records.get(line.id), line) &&
    !isManagedNativeTextBoxEquivalent(earlier.get(line.id), line));
}




export function pageTextFormatHandoff(
  entry: Readonly<{ page: number; changes: readonly Readonly<{ id: string; page?: number; after?: PdfTextBoxEdit | null }>[] }>,
  before: readonly PdfTextBoxEdit[],
  original?: string | null,
): PdfPageTextFormatHandoff | null {
  if (entry.changes.length !== 1) return null;
  const change = entry.changes[0];
  const next = change.after;
  if (!next) return null;
  const page = change.page ?? entry.page;
  const previous = before.find((record) => record.page === page && record.id === change.id);
  // Typed into the line: its first key handed the line over as a format
  
  // into 副标题 opened the line without it).
  const earlier = previous?.text ?? original ?? null;
  if (earlier !== null && earlier !== next.text) {
    const typedFormat = typedRunFormat(earlier, next);
    return Object.freeze({
      ...(typedFormat ? { typedFormat } : {}),
      page,
      rect: Object.freeze({ x: next.x, y: next.y, width: next.width, height: next.height }),
      text: earlier,
      bold: Boolean(next.bold),
      italic: Boolean(next.italic),
      color: null,
      fontSize: null,
      typed: Object.freeze({ original: earlier, text: next.text }),
    });
  }
  return Object.freeze({
    page,
    rect: Object.freeze({ x: next.x, y: next.y, width: next.width, height: next.height }),
    text: next.text,
    bold: Boolean(next.bold),
    italic: Boolean(next.italic),
    color: typeof next.color === "string" && /^#[0-9a-f]{6}$/iu.test(next.color) ? next.color.toLowerCase() : null,
    fontSize: Number(next.fontSize) > 0 ? Number(next.fontSize) : null,
  });
}

/** The formats of the run the box gave the words typed into it, where
 * they differ from the box's own; null when they take the box's. */
function typedRunFormat(
  earlier: string,
  next: PdfTextBoxEdit,
): PdfPageTextFormatHandoff["typedFormat"] | null {
  if (!next.runs?.length || next.text.length <= earlier.length) return null;
  let start = 0;
  while (start < earlier.length && earlier[start] === next.text[start]) start += 1;
  let offset = 0;
  const run = next.runs.find((candidate) => {
    const begins = offset;
    offset += candidate.text.length;
    return begins <= start && start < offset;
  });
  if (!run) return null;
  const format: { fontSize?: number; family?: string; bold?: boolean; italic?: boolean } = {};
  if (Number(run.fontSize) > 0 && Math.abs(Number(run.fontSize) / Number(next.fontSize) - 1) > 1e-3) {
    format.fontSize = Number(run.fontSize);
  }
  const family = run.officeFamily ||
    TEXTBOX_FONT_FAMILY_OPTIONS.find((option) =>
      option.stack === run.fontFamily && option.sourceFontName === run.sourceFontName)?.id;
  if (family && (run.sourceFontName !== next.sourceFontName || run.officeFamily !== next.officeFamily)) {
    format.family = family;
  }
  if (run.bold !== undefined && Boolean(run.bold) !== Boolean(next.bold)) format.bold = Boolean(run.bold);
  if (run.italic !== undefined && Boolean(run.italic) !== Boolean(next.italic)) format.italic = Boolean(run.italic);
  return Object.keys(format).length ? Object.freeze(format) : null;
}

/** The ribbon commands that press a typed run's formats on the words the
 * opened line took (selected there), in the ribbon's points. */
export function typedFormatActions(
  typedFormat: NonNullable<PdfPageTextFormatHandoff["typedFormat"]>,
  current: Readonly<{ bold: boolean; italic: boolean; fontSize: number | null; boxFontSize: number | null;
    pageHeightPoints?: number | null }>,
): PdfTextEditingContextRibbonAction[] {
  const actions: PdfTextEditingContextRibbonAction[] = [];
  if (typedFormat.family) actions.push({ type: "fontFamily", value: typedFormat.family });
  if (typedFormat.fontSize) {
    const points = current.fontSize && current.boxFontSize
      ? current.fontSize * (typedFormat.fontSize / current.boxFontSize)
      : current.pageHeightPoints ? typedFormat.fontSize * current.pageHeightPoints : null;
    if (points) actions.push({ type: "fontSize", value: Math.round(points * 100) / 100 });
  }
  if (typedFormat.bold !== undefined && typedFormat.bold !== current.bold) {
    actions.push({ type: "toggle", control: "bold" });
  }
  if (typedFormat.italic !== undefined && typedFormat.italic !== current.italic) {
    actions.push({ type: "toggle", control: "italic" });
  }
  return actions;
}

 
export function pageTextFormatActions(
  handoff: PdfPageTextFormatHandoff,
  current: Readonly<{ bold: boolean; italic: boolean; color: string | null; fontSize: number | null;
    boxFontSize: number | null; pageHeightPoints?: number | null }>,
): PdfTextEditingContextRibbonAction[] {
  if (handoff.actions) return [...handoff.actions];
  const actions: PdfTextEditingContextRibbonAction[] = [];
  if (handoff.request) {
    // The AI's buttons: Bold where the line's weight differs, the size it
    // names (or Grow / Shrink Font), as a reader presses them.
    const request = handoff.request;
    if (request.bold !== undefined && request.bold !== current.bold) {
      actions.push({ type: "toggle", control: "bold" });
    }
    if (request.fontSize !== undefined &&
      (current.fontSize === null || Math.abs(request.fontSize - current.fontSize) > 0.01)) {
      actions.push({ type: "fontSize", value: request.fontSize });
    }
    if (request.fontSizeStep !== undefined) actions.push({ type: "fontSizeStep", delta: request.fontSizeStep });
    return actions;
  }
  if (handoff.bold !== current.bold) actions.push({ type: "toggle", control: "bold" });
  if (handoff.italic !== current.italic) actions.push({ type: "toggle", control: "italic" });
  // A colour read back from the page differs from the run's by rounding;
  // only a visibly different colour is a change the reader asked for.
  const channels = (hex: string | null) => hex && /^#[0-9a-f]{6}$/iu.test(hex)
    ? [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) : null;
  const wanted = channels(handoff.color), shown = channels(current.color);
  if (wanted && (!shown || wanted.some((value, index) => Math.abs(value - shown[index]) > 8))) {
    actions.push({ type: "fontColor", value: handoff.color! });
  }
  // The size the box asks for, in the ribbon's points: from the line's own
  // size when its ribbon shows one, else from the page height (a line
  // opened before its properties arrive shows none yet).
  if (handoff.fontSize && current.boxFontSize && Math.abs(handoff.fontSize / current.boxFontSize - 1) > 1e-3) {
    const points = current.fontSize
      ? current.fontSize * (handoff.fontSize / current.boxFontSize)
      : current.pageHeightPoints ? handoff.fontSize * current.pageHeightPoints : null;
    if (points) actions.push({ type: "fontSize", value: Math.round(points * 2) / 2 });
  }
  return actions;
}



export function pageTextFormatSpan(root: HTMLElement | null, handoff: PdfPageTextFormatHandoff): HTMLElement | null {
  const page = root?.querySelector<HTMLElement>(`.pdf-viewer__page[data-page-number="${handoff.page + 1}"]`);
  if (!page) return null;
  const frame = page.getBoundingClientRect();
  if (!(frame.width > 0 && frame.height > 0)) return null;
  const left = frame.left + handoff.rect.x * frame.width, top = frame.top + handoff.rect.y * frame.height;
  const right = left + handoff.rect.width * frame.width, bottom = top + handoff.rect.height * frame.height;
  // The line is the span the Insert-tab box covers most: its own words
  // (the reader and the Insert tab may space or join them differently, so
  // the text only breaks a tie), and at least a third of either box.
  const boxArea = Math.max(1, (right - left) * (bottom - top));
  const words = (value: string) => value.replace(/\s+/gu, "");
  const wanted = words(handoff.text);
  let best: HTMLElement | null = null, bestScore = 0;
  for (const span of page.querySelectorAll<HTMLElement>('span[data-pdf-native-text-edit-box="true"]')) {
    const box = span.getBoundingClientRect();
    const area = Math.max(0, Math.min(right, box.right) - Math.max(left, box.left)) *
      Math.max(0, Math.min(bottom, box.bottom) - Math.max(top, box.top));
    const spanArea = Math.max(1, box.width * box.height);
    const cover = Math.max(area / boxArea, area / spanArea);
    if (cover < 1 / 3) continue;
    const text = words(span.textContent ?? "");
    const score = cover + (text && (wanted.includes(text.slice(0, 6)) || text.includes(wanted.slice(0, 6))) ? 1 : 0);
    if (score > bestScore) { best = span; bestScore = score; }
  }
  return best;
}

export function unsavedCreatedPdfTextBoxEdits(
  local: readonly PdfTextBoxEdit[],
  persisted: readonly PdfTextBoxEdit[],
): PdfTextBoxEdit[] {
  const persistedByKey = new Map(
    persisted.map((edit) => [`${edit.page}:${edit.id}`, edit] as const),
  );
  return local.filter((edit) => {
    if (!edit.created || edit.deleted || edit.sourceText) return false;
    if (isNativePdfFreeTextRecord(edit)) return false;
    const visible =
      edit.text.trim().length > 0 ||
      (edit.kind === "formula" && Boolean(edit.latex?.trim()));
    if (!visible) return false;
    const saved = persistedByKey.get(`${edit.page}:${edit.id}`);
    return (
      !saved ||
      saved.deleted === true ||
      saved.text !== edit.text ||
      (saved.latex ?? "") !== (edit.latex ?? "")
    );
  });
}

/**
 * The created boxes only this window holds, kept over a page read in under
 * them (another window's save, the reload after a refused write): a box
 * being typed or waiting for Save, one whose write is on its way, one a
 * refused write left for Retry. The page read in does not hold them, and the
 * window's boxes replaced by the page's dropped them -- off the page, their
 * write finding no box, the window reading saved. `windowOnly` names them
 * (the window's own bookkeeping); a box the page holds is the page's.
 */
export function windowOnlyCreatedPdfTextBoxEdits(
  local: readonly PdfTextBoxEdit[],
  loaded: readonly PdfTextBoxEdit[],
  windowOnly: (edit: PdfTextBoxEdit) => boolean,
): PdfTextBoxEdit[] {
  const candidates = local.filter((edit) => edit.created === true && !edit.deleted);
  if (candidates.length === 0) return candidates;
  const held = new Set(loaded.map((edit) => `${edit.page}:${edit.id}`));
  return candidates.filter((edit) => !held.has(`${edit.page}:${edit.id}`) && windowOnly(edit));
}

/**
 * The formula sources typed and not applied (by box, `page:id`), over a
 * page read in under them: those whose box the window still shows stay --
 * the only copy of a source that is not valid LaTeX yet (or of one read off
 * the page for review), and what keeps the window reading unsaved. One whose
 * box is gone goes with it.
 *
 * `fileBoxesBefore` is given when the file's own text boxes stand as they
 * were (pdfFileTextBoxesStand): the window's boxes before the load. A draft
 * on a formula of the file itself has no box among the page's -- it stays,
 * unless it was typed on a box this window had made, which is gone.
 */
export function keptPdfFormulaDrafts(
  drafts: Record<string, string>,
  shown: readonly PdfTextBoxEdit[],
  fileBoxesBefore?: readonly PdfTextBoxEdit[] | null,
): Record<string, string> {
  const keys = Object.keys(drafts);
  if (keys.length === 0) return drafts;
  const boxes = new Set(shown.filter((edit) => !edit.deleted).map((edit) => `${edit.page}:${edit.id}`));
  const named = fileBoxesBefore ? new Set(shown.map((edit) => `${edit.page}:${edit.id}`)) : null;
  const made = new Set((fileBoxesBefore ?? []).filter((edit) => edit.created === true)
    .map((edit) => `${edit.page}:${edit.id}`));
  const kept = keys.filter((key) => boxes.has(key) || (named !== null && !named.has(key) && !made.has(key)));
  return kept.length === keys.length ? drafts : Object.fromEntries(kept.map((key) => [key, drafts[key]]));
}

const PDF_FILE_TEXT_BOX_KEYS = ["dataItemId", "source", "pdfNativeTransactions", "pageTransforms",
  "deletedPages", "insertedPages", "pageMoves", "cropBoxes"] as const;

/**
 * Whether the text boxes of the file itself are the ones they were between
 * two bodies of a page: the same source, no native write since, the same
 * pages in the same places. (Their ids are positions in the file's text; a
 * body that differs in any of these may number them differently, and a
 * draft kept by id would land on another box.)
 */
export function pdfFileTextBoxesStand(
  before: Readonly<Record<string, unknown>> | null | undefined,
  after: Readonly<Record<string, unknown>> | null | undefined,
): boolean {
  if (!before || !after) return false;
  const told = (value: unknown) => JSON.stringify(Array.isArray(value) && value.length === 0 ? null : value ?? null);
  return PDF_FILE_TEXT_BOX_KEYS.every((key) => told(before[key]) === told(after[key]));
}

export function commandWithCurrentPdfPage(
  command: ApplyDocumentEditCommandDetail["command"],
  pageNumber: number,
): ApplyDocumentEditCommandDetail["command"] {
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return command;
  }
  let changed = false;
  const operations = command.operations.map((operation) => {
    if (
      operation.op !== "add_pdf_annotation" &&
      operation.op !== "rotate_pdf_page" &&
      operation.op !== "delete_pdf_page" &&
      operation.op !== "insert_pdf_page" &&
      operation.op !== "move_pdf_page" &&
      operation.op !== "set_pdf_text_box"
    ) {
      return operation;
    }
    if (
      (operation.op === "insert_pdf_page" &&
        typeof operation.after_page === "number") ||
      (operation.op === "move_pdf_page" &&
        typeof operation.page === "number") ||
      (operation.op === "set_pdf_text_box" &&
        typeof operation.page === "number") ||
      (operation.op !== "insert_pdf_page" && typeof operation.page === "number")
    ) {
      return operation;
    }
    changed = true;
    return operation.op === "insert_pdf_page"
      ? {
          ...operation,
          after_page: Math.floor(pageNumber),
        }
      : operation.op === "move_pdf_page"
        ? {
            ...operation,
            page: Math.floor(pageNumber),
          }
        : operation.op === "set_pdf_text_box"
          ? {
              ...operation,
              page: Math.max(0, Math.floor(pageNumber) - 1),
            }
          : {
              ...operation,
              page: Math.floor(pageNumber),
            };
  });
  return changed ? { ...command, operations } : command;
}
