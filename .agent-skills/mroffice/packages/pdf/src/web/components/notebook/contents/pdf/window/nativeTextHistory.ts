/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  pdfNativeTextPropertyDraftFromState,
  pdfNativeTextPropertyDraftWithoutMove,
} from "../../../../../lib/pdf/native-author-content";
import { jsonEquals, type JsonValue } from "@mrnote/core/web/lib/collab/json-crdt.ts";
import { pdfNativeRecordSpellsReaderText } from "../../../../../lib/pdf/native-text-reader-spelling";
import type { PdfEngineSourceIdentity } from "../../../../../lib/pdf/engine/contracts";
import {
  MRAI_NATIVE_LIST_TEXT_ACTION,
} from "../../../../../lib/pdf/engine/native/vocabulary";
import type {
  PdfNativeTextDecorationGeometry,
} from "../../../../../lib/pdf/native-text-decoration";
import { pdfNativeOpenBoxTextRules, type PdfNativeTextRuleRange } from "../../../../../lib/pdf/native-text-rule-range";
import type {
  PdfSharedStateRecord,
} from "../../../../../lib/pdf/engine/shared-state-bridge";
import type {
  PdfNativeIndirectObjectRef,
  PdfNativeListTextFidelityEvidence,
  PdfNativeListTextSelectionProof,
  PdfNativeListTextSelectionEvidence,
  PdfNativeSourceTextAppearanceRun,
  PdfNativeTextPropertyDraft,
  PdfNativeTextPropertyState,
  PdfNativeDeviceColor,
} from "../../../../../lib/pdf/engine/native/list-text-fidelity";
import {
  pdfNativeListTextSourceRunSpan,
  readMraiNativeListTextFidelityEvidence,
} from "../../../../../lib/pdf/engine/native/list-text-model";
import type {
  PdfNativeListTextControlId,
} from "../../../../../lib/pdf/engine/native/list-text-command-lifecycle";
import {
  MRAI_NATIVE_TEXT_PROPERTIES_SCHEMA_VERSION,
  MRAI_NATIVE_ADAPTIVE_MULTI_RUN_LINE_PLAN_SCHEMA_VERSION,
  MRAI_NATIVE_PROJECTED_MULTI_RUN_LINE_PLAN_SCHEMA_VERSION,
  MRAI_NATIVE_PARAGRAPH_PROPERTIES_ACTION,
  MRAI_NATIVE_PARAGRAPH_PROPERTIES_SCHEMA,
} from "../../../../../lib/pdf/engine/native/vocabulary";
import {
  singleItemEditOfSelection,
} from "../../../../../lib/pdf/engine/native/list-text-model";
import type {
  PdfNativeParagraphPropertyChanges,
} from "../../../../../lib/pdf/engine/native/paragraph-properties-transaction";
import {
  readMraiNativeParagraphPropertyChanges,
} from "../../../../../lib/pdf/engine/native/paragraph-properties-model";

export interface PdfNativeListTextHistorySeed {
  readonly target: PdfNativeIndirectObjectRef;
  readonly fidelity: PdfNativeListTextFidelityEvidence;
  readonly controlId: PdfNativeListTextControlId;
  readonly transactionId: string;
  readonly paragraphColors?: Readonly<{
    before: readonly PdfNativeDeviceColor[];
    after: readonly PdfNativeDeviceColor[];
  }>;
  readonly paragraphOriginRecord?: PdfSharedStateRecord;
  readonly textWindowOriginRecord?: PdfSharedStateRecord;
  /** Set when the box's edit was saved as the edit of the one item it
   * changes: the box's own replacement text, which the item's fidelity does
   * not carry (singleItemEditOfSelection). */
  readonly boxReplacementDisplayText?: string;
}

/**
 * One straight rule can follow the runs: they are painted in one page
 * transform and sit on one baseline. A paragraph that wraps over several
 * lines (S5), or whose lines are placed by their own `cm`, is neither, and
 * the rule writer refuses it; its underline/strikethrough are not offered
 * rather than closing on "saved" with nothing written.
 */
export function pdfNativeTextDecorationRunsShareOneLine(
  runs: readonly Pick<
    PdfNativeSourceTextAppearanceRun,
    "textMatrix" | "graphicsMatrix" | "fontSize" | "text"
  >[],
): boolean {
  const painted = runs.filter((run) => run.text.trim().length > 0);
  if (painted.length < 2) return true;
  const first = painted[0];
  const same = (left: readonly number[], right: readonly number[]) =>
    left.length === right.length &&
    left.every((value, index) => Math.abs(value - right[index]) <= 1e-6);
  if (painted.some((run) => !same(run.graphicsMatrix, first.graphicsMatrix))) {
    return false;
  }
  // Distance of each run's origin from the first run's baseline, against
  // half the first run's glyph height, both in the space its text matrix
  // maps into (the shared page transform is already the same).
  const [a, b, c, d] = first.textMatrix;
  const along = Math.hypot(a, b);
  const height = Math.abs(first.fontSize) * Math.hypot(c, d);
  if (!(along > 1e-9) || !(height > 1e-9)) return false;
  return painted.every((run) => {
    const dx = run.textMatrix[4] - first.textMatrix[4];
    const dy = run.textMatrix[5] - first.textMatrix[5];
    const off = Math.abs(-b * dx + a * dy) / along;
    return Number.isFinite(off) && off <= height * 0.5;
  });
}

/**
 * The run's own matrix, size, advance and colour, taken from the selection
 * proof the dialog already holds. A run whose paint MRAI cannot read exactly
 * gets no rule rather than a guessed one.
 */
export function pdfNativeTextDecorationGeometryFromProof(
  proof: PdfNativeListTextSelectionProof | null,
): PdfNativeTextDecorationGeometry | null {
  const appearance = proof?.sourceAppearance?.[0];
  const span = pdfNativeListTextSourceRunSpan(proof);
  const advance = proof?.evidence.originalAdvance;
  if (
    !appearance ||
    !span ||
    typeof advance !== "number" ||
    !Number.isFinite(advance) ||
    advance <= 0 ||
    !appearance.color
  ) {
    return null;
  }
  const matrix = appearance.textMatrix;
  if (matrix.length !== 6) return null;
  if (!pdfNativeTextDecorationRunsShareOneLine(proof?.sourceAppearance ?? [])) {
    return null;
  }
  // A paragraph the reader joined (walk c-s7: the "Abstract" heading grown
  // to 14 pt read as one item with the text under it) carries the advance
  // of all its lines: one rule drawn from it ran 8 000 pt off the page.
  if (proof?.evidence.wrapping === "paragraph-reflow") return null;
  // A box the reader groups from several items, opened on the proof of its
  // first item alone (itemsProvedAloneProof): the rule would run under that
  // item only (walk t-s6-zp: 124 pt of a 509 pt line of a 15-item paragraph).
  // Only a proof of the whole selection, on one baseline, takes a rule.
  const selected = proof?.evidence.selection;
  const selectedItems = selected?.items ?? [];
  if (selectedItems.length > 1) {
    const flat = (value: string) => value.replace(/\s+/g, "");
    if (flat(proof?.evidence.originalText ?? "") !== flat(selected?.item.str ?? "")) return null;
    const [a, b] = selectedItems[0].transform;
    const along = Math.hypot(a, b);
    if (!(along > 0)) return null;
    const half = Math.max(selectedItems[0].height, 1) * 0.5;
    if (selectedItems.some((item) =>
      Math.abs(-b * (item.transform[4] - selectedItems[0].transform[4]) + a * (item.transform[5] - selectedItems[0].transform[5])) / along > half)) {
      return null;
    }
  }
  const planned = proof?.evidence.linePlan?.lines ?? [];
  if (
    planned.length > 1 &&
    planned.some(
      (line) => Math.abs(line.baseline - planned[0].baseline) > Math.max(appearance.fontSize, 1) * 0.5,
    )
  ) {
    return null;
  }
  // A raised run (a superscript, `Ts`): its rule runs under the raised
  // glyphs, as Word draws it, not along the baseline the run was lifted
  
  // title's baseline).
  const rise = proof?.properties?.original.textRise ?? 0;
  const lift = Number.isFinite(rise) && rise !== 0 ? rise : 0;
  return Object.freeze({
    textMatrix: [
      matrix[0],
      matrix[1],
      matrix[2],
      matrix[3],
      matrix[4] + matrix[2] * lift,
      matrix[5] + matrix[3] * lift,
    ] as const,
    fontSize: appearance.fontSize,
    advance,
    color: Object.freeze({
      kind: appearance.color.kind,
      components: Object.freeze([...appearance.color.components]),
    }),
    runSpan: Object.freeze({ start: span.start, end: span.end }),
  });
}

/** A property draft of a run its property proof covers that also moves it:
 * the move is that mutation's own offset, so the draft is not "unchanged". */
export function pdfNativePropertyDraftMoves(draft: PdfNativeTextPropertyDraft | null): boolean {
  return Boolean(draft && ((draft.moveX ?? 0) !== 0 || (draft.moveY ?? 0) !== 0));
}

/** Whether a property draft changes the run its proof states: a value set
 * otherwise, or a move by the mutation's own offset (a move alone is still
 * the run's property edit). No draft changes nothing. The preview and the
 * Leaves read it here; they read it four ways, one of which took no draft
 * on a run its proof states for a change (text-edit-unified-model P1). */
export function pdfNativePropertyDraftChanges(
  draft: PdfNativeTextPropertyDraft | null,
  state: PdfNativeTextPropertyState | null,
): boolean {
  return draft !== null && (!samePdfNativeTextPropertyDraft(draft, state) ||
    (state !== null && pdfNativePropertyDraftMoves(draft)));
}

export function samePdfNativeTextPropertyDraft(
  draft: PdfNativeTextPropertyDraft | null,
  state: PdfNativeTextPropertyState | null,
): boolean {
  if (draft === null || state === null) return draft === null && state === null;
  // A synthetic bold asked for reaches the state as its rendering mode (2
  // Tr), not as a field of its own.
  const { syntheticBold, ...rest } = pdfNativeTextPropertyDraftWithoutMove(draft);
  if (syntheticBold !== undefined && syntheticBold !== ((state.renderingMode ?? 0) === 2)) return false;
  // A requested move never reaches the saved state: it is recorded as the
  // mutation's own offset, and the output sha already pins those bytes.
  return JSON.stringify(rest) === JSON.stringify(pdfNativeTextPropertyDraftFromState(state));
}

/**
 * The draft as its record writes it: the rules it takes away or draws ride
 * the record's text rules, and the formats of its parts the mutation's
 * segments (both held by the output's bytes, which the record pins); the
 * rest is the run's own state. A part-format write named its draft's
 * segments and was refused as "not exact", so the save that had just
 * succeeded showed as failed and could not be undone.
 */
export function samePdfNativeTextPropertyDraftAsWritten(
  draft: PdfNativeTextPropertyDraft,
  mutation: Readonly<{ replacement: PdfNativeTextPropertyState; segments?: readonly unknown[] }>,
): boolean {
  if (Boolean(draft.segments?.length) !== Boolean(mutation.segments?.length)) return false;
  const run = Object.fromEntries(Object.entries(draft).filter(([key]) =>
    key !== "segments" && key !== "dropTextRules" && key !== "addTextRules" &&
    key !== "textRuleParts" && key !== "textRuleRanges")) as unknown as PdfNativeTextPropertyDraft;
  return samePdfNativeTextPropertyDraft(run, mutation.replacement);
}

export function samePdfNativeListTextTarget(
  left: PdfNativeListTextSelectionEvidence | null,
  right: PdfNativeListTextSelectionEvidence | null,
): boolean {
  if (!left || !right) return left === right;
  const leftIndexes = left.items?.map((item) => item.itemIndex) ?? [
    left.item.itemIndex,
  ];
  const rightIndexes = right.items?.map((item) => item.itemIndex) ?? [
    right.item.itemIndex,
  ];
  return (
    left.sourceSha256 === right.sourceSha256 &&
    left.pageNumber === right.pageNumber &&
    left.startOffset === right.startOffset &&
    left.endOffset === right.endOffset &&
    leftIndexes.length === rightIndexes.length &&
    leftIndexes.every((itemIndex, index) => itemIndex === rightIndexes[index])
  );
}

export function pdfNativeListTextTargetKey(
  selection: PdfNativeListTextSelectionEvidence,
): string {
  const itemIndexes = selection.items?.map((item) => item.itemIndex) ?? [
    selection.item.itemIndex,
  ];
  return `${selection.pageNumber}:${itemIndexes.join(",")}`;
}

/** The words of the line a selection names, as the file has them: what a
 * draft kept for the line is held to on other bytes
 * (lib/pdf/native-text-draft-retention `lineText`). */
export function pdfNativeListTextTargetText(
  selection: PdfNativeListTextSelectionEvidence,
): string {
  return (selection.items?.map((item) => item.str) ?? [selection.item.str]).join("\n");
}

/** Visual rows of a planned replacement, in the dialog's display convention
 * (no trailing spaces; the summary owns the separators). Fixed-frame plans
 * describe rows through their line plan; positioned paragraphs through
 * their proven lines. A single show has no rows. */
export function readPdfNativePlanDisplayRows(
  evidence: PdfNativeListTextFidelityEvidence,
): readonly string[] | null {
  if (evidence.linePlan) {
    const rows = new Map<number, string>();
    // An entry that names no row is on the row of the entry before it when
    // it stands on that entry's baseline: a list marker and its text are two
    // shows of one row, and each its own row put the marker on a row of its
    // own in the editor, the text typed on below the frame's last row
    
    let row = -1;
    let baseline: number | null = null;
    for (const line of evidence.linePlan.lines) {
      if (line.lineIndex !== undefined) row = line.lineIndex;
      else if (baseline === null || Math.abs(line.baseline - baseline) > 0.5) row += 1;
      baseline = line.baseline;
      rows.set(row, (rows.get(row) ?? "") + line.replacementText);
    }
    return [...rows.values()];
  }
  if (evidence.positionedLines) {
    // Lines on one baseline are one row: a list marker set by a show of its
    // own is not a row above its text.
    const rows: string[] = [];
    let baseline: number | null = null;
    for (const line of evidence.positionedLines.lines) {
      const text = line.evidence.replacementDisplayText;
      if (baseline !== null && rows.length && Math.abs(line.evidence.baseline - baseline) <= 0.5) rows[rows.length - 1] += text;
      else rows.push(text);
      baseline = line.evidence.baseline;
    }
    return rows.map((row) => row.trimEnd());
  }
  // A rewritten paragraph names the characters each of its new lines sets.
  const rewritten = evidence.paragraphRewrite?.block;
  if (rewritten && !evidence.paragraphRewrite?.history) {
    const characters = Array.from(evidence.replacementDisplayText);
    return rewritten.lines.map((line) => characters.slice(line.start, line.end).join("").trimEnd());
  }
  return null;
}

/** Whether a committed record's display text is the text the box was given.
 * A reader item often ends in the space pdf.js reads after it ("131 "); the
 * writer keeps that trailing space of the source, while the box holds only
 * what the reader typed. */
export function nativeHistoryDisplayTextMatches(
  recorded: string,
  typed: string,
  originalDisplayText: string,
): boolean {
  if (recorded === typed) return true;
  const trailing = /\s+$/u.exec(originalDisplayText)?.[0];
  return Boolean(trailing) && !/\s$/u.test(typed) && recorded === typed + trailing;
}

/** Whether the record a save wrote holds the text the box saved: as
 * nativeHistoryDisplayTextMatches, or the box's text in the reader's spelling
 * of a line the source spells without its word spaces (the planner records
 * the source's spelling of what it wrote; native-text-reader-spelling.ts).
 * Only for binding a write's own record: an "unchanged" rule must not read
 * a space typed away as no change. */
export function nativeHistoryRecordHoldsTypedText(
  recorded: string,
  typed: string,
  originalDisplayText: string,
): boolean {
  return nativeHistoryDisplayTextMatches(recorded, typed, originalDisplayText) ||
    pdfNativeRecordSpellsReaderText(recorded, typed);
}

/** The history of a locally staged record the server now holds unchanged:
 * the journal's last entry is that very record (same id, fidelity, target,
 * control and source), bound to the export the receipt names. */
export function exactWorkingRecordHistorySeed(
  collection: JsonValue | undefined,
  sent: PdfSharedStateRecord,
  baseSource: PdfEngineSourceIdentity,
  outputSha256: string,
  boxReplacementDisplayText: string,
): PdfNativeListTextHistorySeed | null {
  if (!Array.isArray(collection) || collection.length === 0) return null;
  const last = collection.at(-1);
  if (!last || typeof last !== "object" || Array.isArray(last)) return null;
  const stored = last as Record<string, unknown>;
  const mine = sent as unknown as Record<string, unknown>;
  const source = stored.source as Record<string, unknown> | undefined;
  const derived = stored.derivedCandidate as Record<string, unknown> | undefined;
  const target = stored.target as Record<string, unknown> | undefined;
  const fidelity = readMraiNativeListTextFidelityEvidence(stored.textFidelity);
  const controlId = stored.controlId;
  if (
    stored.id !== mine.id || stored.transactionId !== mine.transactionId ||
    stored.action !== MRAI_NATIVE_LIST_TEXT_ACTION || stored.kind !== "text-replacement" ||
    !fidelity || !target ||
    !jsonEquals(stored.textFidelity as JsonValue, mine.textFidelity as JsonValue) ||
    !jsonEquals(stored.target as JsonValue, mine.target as JsonValue) ||
    controlId !== mine.controlId ||
    (controlId !== "PDFCTL.RIBBON.EDIT.EDIT_CONTENT" && controlId !== "PDFCTL.RIBBON.HOME.EDIT_CONTENT") ||
    source?.resourceId !== baseSource.resourceId ||
    source?.resourceVersionId !== baseSource.resourceVersionId ||
    source?.sha256 !== baseSource.sourceSha256 ||
    derived?.sha256 !== outputSha256 ||
    !Number.isSafeInteger(target.objectNumber) || !Number.isSafeInteger(target.generation)
  ) return null;
  return Object.freeze({
    target: Object.freeze({ objectNumber: Number(target.objectNumber), generation: Number(target.generation) }),
    fidelity,
    controlId,
    transactionId: String(stored.transactionId),
    boxReplacementDisplayText,
  });
}

export function lastPdfNativeListTextHistorySeed(
  collection: JsonValue | undefined,
  expected: Readonly<{
    transactionId: string;
    source: PdfEngineSourceIdentity;
    outputSha256: string;
    controlId: PdfNativeListTextControlId;
    proof: PdfNativeListTextSelectionProof;
    replacementDisplayText: string;
    propertyDraft: PdfNativeTextPropertyDraft | null;
    paragraphChanges?: PdfNativeParagraphPropertyChanges;
  }>,
): PdfNativeListTextHistorySeed | null {
  if (!Array.isArray(collection) || collection.length === 0) return null;
  const value = collection.at(-1);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (expected.paragraphChanges) {
    const source = record.source as Record<string, unknown> | undefined;
    const derived = record.derivedCandidate as
      Record<string, unknown> | undefined;
    const paragraph = record.paragraphProperties as
      Record<string, unknown> | undefined;
    const original = readMraiNativeListTextFidelityEvidence(
      paragraph?.sourceFidelity,
    );
    const expectedOriginal = readMraiNativeListTextFidelityEvidence(
      expected.proof.evidence,
    );
    const actual = paragraph?.textReplacement
      ? readMraiNativeListTextFidelityEvidence(paragraph.textReplacement)
      : original;
    const before = expected.proof.propertyRuns?.map((run) => run.color);
    if (
      record.id !== expected.transactionId ||
      record.transactionId !== expected.transactionId ||
      record.action !== MRAI_NATIVE_PARAGRAPH_PROPERTIES_ACTION ||
      record.schemaVersion !== MRAI_NATIVE_PARAGRAPH_PROPERTIES_SCHEMA ||
      record.featureId !== "PDF-EDT-TEXT-01" ||
      record.controlId !== "PDFCTL.RIBBON.EDIT.EDIT_CONTENT" ||
      (record.target as Record<string, unknown> | undefined)?.objectNumber !==
        expected.proof.target.objectNumber ||
      (record.target as Record<string, unknown> | undefined)?.generation !==
        expected.proof.target.generation ||
      record.kind !== "paragraph-properties" ||
      !original ||
      !expectedOriginal ||
      !actual ||
      !before ||
      source?.resourceId !== expected.source.resourceId ||
      source?.resourceVersionId !== expected.source.resourceVersionId ||
      source?.sha256 !== expected.source.sourceSha256 ||
      derived?.sha256 !== expected.outputSha256 ||
      !jsonEquals(
        JSON.parse(JSON.stringify(original)),
        JSON.parse(JSON.stringify(expectedOriginal)),
      ) ||
      !nativeHistoryDisplayTextMatches(
        actual.replacementDisplayText,
        expected.replacementDisplayText,
        expectedOriginal.originalDisplayText,
      )
    )
      return null;
    let changes: PdfNativeParagraphPropertyChanges;
    try {
      changes = readMraiNativeParagraphPropertyChanges(paragraph?.changes);
    } catch {
      return null;
    }
    if (JSON.stringify(changes) !== JSON.stringify(expected.paragraphChanges))
      return null;
    return {
      target: expected.proof.target,
      fidelity: actual,
      controlId: "PDFCTL.RIBBON.EDIT.EDIT_CONTENT",
      transactionId: expected.transactionId,
      paragraphColors: {
        before,
        after: changes.color
          ? before.map(() => changes.color!)
          : changes.runColors!,
      },
      paragraphOriginRecord: structuredClone(value) as PdfSharedStateRecord,
    };
  }

  const target = record.target;
  const fidelity = readMraiNativeListTextFidelityEvidence(record.textFidelity);
  const controlId = record.controlId;
  const source = record.source;
  const derivedCandidate = record.derivedCandidate;
  if (
    record.id !== expected.transactionId ||
    record.transactionId !== expected.transactionId ||
    record.action !== MRAI_NATIVE_LIST_TEXT_ACTION ||
    record.featureId !== "PDF-EDT-TEXT-01" ||
    record.kind !== "text-replacement" ||
    !target ||
    typeof target !== "object" ||
    Array.isArray(target) ||
    !fidelity ||
    !source ||
    typeof source !== "object" ||
    Array.isArray(source) ||
    !derivedCandidate ||
    typeof derivedCandidate !== "object" ||
    Array.isArray(derivedCandidate) ||
    controlId !== expected.controlId ||
    (controlId !== "PDFCTL.RIBBON.EDIT.EDIT_CONTENT" &&
      controlId !== "PDFCTL.RIBBON.HOME.EDIT_CONTENT")
  ) {
    return null;
  }
  const objectNumber = (target as Record<string, unknown>).objectNumber;
  const generation = (target as Record<string, unknown>).generation;
  const sourceRecord = source as Record<string, unknown>;
  const derivedRecord = derivedCandidate as Record<string, unknown>;
  // A paragraph rewrite (the edit's second tier) commits the paragraph's
  // whole span as new content: it is bound to the activation by its source,
  // the stream it rewrites, the selection, and a span that holds the one the
  // activation proved. A box that opened on the rewrite's own proof may still
  // save a surgical edit, whose span then lies inside the paragraph's. The
  // paragraph is described by its first item, so the activation's single-run
  // fields say nothing about the other side.
  const activation = expected.proof.evidence;
  // A box's edit that changes one of its items is saved as that item's edit
  // (the planner's single-item fallback): the record names the item alone,
  // which is the one the box's own text says the edit changes.
  const activationSelection = activation.selection;
  if (
    activationSelection?.items && activationSelection.items.length > 1 &&
    fidelity.selection && !fidelity.selection.items && !fidelity.propertyMutation && expected.propertyDraft === null
  ) {
    const single = singleItemEditOfSelection(activationSelection, expected.replacementDisplayText);
    if (
      !single ||
      JSON.stringify(single.selection.item) !== JSON.stringify(fidelity.selection.item) ||
      !Number.isSafeInteger(objectNumber) ||
      !Number.isSafeInteger(generation) ||
      Number(objectNumber) !== expected.proof.target.objectNumber ||
      Number(generation) !== expected.proof.target.generation ||
      sourceRecord.resourceId !== expected.source.resourceId ||
      sourceRecord.resourceVersionId !== expected.source.resourceVersionId ||
      sourceRecord.sha256 !== expected.source.sourceSha256 ||
      derivedRecord.sha256 !== expected.outputSha256
    ) {
      return null;
    }
    return Object.freeze({
      target: Object.freeze({ objectNumber: Number(objectNumber), generation: Number(generation) }),
      fidelity,
      controlId,
      transactionId: expected.transactionId,
      boxReplacementDisplayText: expected.replacementDisplayText,
    });
  }
  if (fidelity.paragraphRewrite || activation.paragraphRewrite) {
    const [outer, inner] = fidelity.paragraphRewrite
      ? [fidelity.textOperatorSpan, activation.textOperatorSpan]
      : [activation.textOperatorSpan, fidelity.textOperatorSpan];
    if (
      !Number.isSafeInteger(objectNumber) ||
      !Number.isSafeInteger(generation) ||
      Number(objectNumber) !== expected.proof.target.objectNumber ||
      Number(generation) !== expected.proof.target.generation ||
      sourceRecord.resourceId !== expected.source.resourceId ||
      sourceRecord.resourceVersionId !== expected.source.resourceVersionId ||
      sourceRecord.sha256 !== expected.source.sourceSha256 ||
      derivedRecord.sha256 !== expected.outputSha256 ||
      expected.propertyDraft !== null ||
      fidelity.propertyMutation ||
      !nativeHistoryRecordHoldsTypedText(fidelity.replacementDisplayText,
        expected.replacementDisplayText, activation.originalDisplayText) ||
      JSON.stringify(fidelity.selection) !== JSON.stringify(activation.selection) ||
      inner.start < outer.start ||
      inner.end > outer.end
    ) {
      return null;
    }
    return Object.freeze({
      target: Object.freeze({ objectNumber: Number(objectNumber), generation: Number(generation) }),
      fidelity,
      controlId,
      transactionId: expected.transactionId,
      ...((fidelity.linePlan?.schemaVersion === MRAI_NATIVE_ADAPTIVE_MULTI_RUN_LINE_PLAN_SCHEMA_VERSION || fidelity.linePlan?.schemaVersion === MRAI_NATIVE_PROJECTED_MULTI_RUN_LINE_PLAN_SCHEMA_VERSION)
        ? {textWindowOriginRecord: structuredClone(value) as PdfSharedStateRecord} : {}),
    });
  }
  const propertyMutation = fidelity?.propertyMutation ?? null;
  const expectedPropertyProof = expected.proof.properties;
  const consolidated =
    fidelity.consolidatedRuns !== undefined ||
    (fidelity.positionedLines?.lines.some(
      (line) => line.evidence.consolidatedRuns !== undefined,
    ) ??
      false);
  // Each clause the record must satisfy to be this activation's own, named
  // so a refusal can say which one failed (the window otherwise reports only
  // "did not publish exact history evidence").
  const clauses: readonly (readonly [string, boolean])[] = [
    ["target", !Number.isSafeInteger(objectNumber) || Number(objectNumber) < 1 ||
      !Number.isSafeInteger(generation) || Number(generation) < 0 || Number(generation) > 65_535 ||
      Number(objectNumber) !== expected.proof.target.objectNumber ||
      Number(generation) !== expected.proof.target.generation],
    ["source", sourceRecord.resourceId !== expected.source.resourceId ||
      sourceRecord.resourceVersionId !== expected.source.resourceVersionId ||
      sourceRecord.sha256 !== expected.source.sourceSha256],
    ["output", derivedRecord.sha256 !== expected.outputSha256],
    ["displayText", !nativeHistoryRecordHoldsTypedText(fidelity.replacementDisplayText,
      expected.replacementDisplayText, expected.proof.evidence.originalDisplayText)],
    ["originalText", fidelity.originalText !== expected.proof.evidence.originalText ||
      (consolidated
        ? fidelity.originalDisplayText.trimEnd() !== expected.proof.evidence.originalDisplayText.trimEnd()
        : fidelity.originalDisplayText !== expected.proof.evidence.originalDisplayText)],
    ["codeBytes", JSON.stringify(fidelity.originalCodeBytes) !== JSON.stringify(expected.proof.evidence.originalCodeBytes)],
    ["layoutKind", fidelity.layoutKind !== expected.proof.evidence.layoutKind],
    ["resourceName", fidelity.resourceName !== expected.proof.evidence.resourceName],
    ["fontEncoding", JSON.stringify(fidelity.fontEncoding) !== JSON.stringify(expected.proof.evidence.fontEncoding)],
    ["fontSize", fidelity.fontSize !== expected.proof.evidence.fontSize],
    ["origin", fidelity.textX !== expected.proof.evidence.textX || fidelity.baseline !== expected.proof.evidence.baseline],
    ["advance", fidelity.originalAdvance !== expected.proof.evidence.originalAdvance],
    ["selection", JSON.stringify(fidelity.selection) !== JSON.stringify(expected.proof.evidence.selection)],
    // A consolidated commit spans to the end of the last rewritten text
    // object, past the show operator the read proof ended on.
    ["span", consolidated
      ? fidelity.textOperatorSpan.start !== expected.proof.evidence.textOperatorSpan.start ||
        fidelity.textOperatorSpan.end < expected.proof.evidence.textOperatorSpan.end
      : JSON.stringify(fidelity.textOperatorSpan) !== JSON.stringify(expected.proof.evidence.textOperatorSpan)],
    ["resources", JSON.stringify(fidelity.resources) !== JSON.stringify(expected.proof.evidence.resources)],
    ["propertySchema", (fidelity.schemaVersion === MRAI_NATIVE_TEXT_PROPERTIES_SCHEMA_VERSION) !== (expected.propertyDraft !== null)],
    ["propertyMutation", expected.propertyDraft !== null && (!propertyMutation || !expectedPropertyProof)],
    ["propertyOriginal", expected.propertyDraft !== null && propertyMutation !== null && expectedPropertyProof !== null &&
      JSON.stringify(propertyMutation.original) !== JSON.stringify(expectedPropertyProof.original)],
    ["propertyFrame", expected.propertyDraft !== null && propertyMutation !== null && expectedPropertyProof !== null &&
      JSON.stringify(propertyMutation.frame) !== JSON.stringify(expectedPropertyProof.frame)],
    ["propertySelection", expected.propertyDraft !== null && propertyMutation !== null &&
      JSON.stringify(propertyMutation.originalSelection) !== JSON.stringify(expected.proof.evidence.selection)],
    ["propertyDraft", expected.propertyDraft !== null && propertyMutation !== null &&
      !samePdfNativeTextPropertyDraftAsWritten(expected.propertyDraft, propertyMutation)],
    ["noMutation", expected.propertyDraft === null && propertyMutation !== null],
  ];
  const failed = clauses.filter(([, failedClause]) => failedClause).map(([name]) => name);
  if (failed.length) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[pdf-text-history] seed refused", { failed });
    }
    return null;
  }
  return Object.freeze({
    target: Object.freeze({
      objectNumber: Number(objectNumber),
      generation: Number(generation),
    }),
    fidelity,
    controlId,
    transactionId: expected.transactionId,
    ...((fidelity.linePlan?.schemaVersion === MRAI_NATIVE_ADAPTIVE_MULTI_RUN_LINE_PLAN_SCHEMA_VERSION || fidelity.linePlan?.schemaVersion === MRAI_NATIVE_PROJECTED_MULTI_RUN_LINE_PLAN_SCHEMA_VERSION)
      ? {textWindowOriginRecord: structuredClone(value) as PdfSharedStateRecord} : {}),
  });
}

/**
 * The rules standing on the box a proof opened, as the window reads them for
 * its editor: the rule beside the run where the proof gives a run's geometry
 * (`readBeside`: the engine's readMraiNativeTextRuleBesideRun on the bytes
 * the box was opened on; null where those bytes are not at hand), put
 * together with what the proof itself states (pdfNativeOpenBoxTextRules).
 * Null where the proof gives neither: nothing is read, and the editor keeps
 * what it showed.
 */
export async function readPdfNativeOpenBoxTextRules(
  proof: PdfNativeListTextSelectionProof | null,
  readBeside: ((style: "underline" | "strikethrough", geometry: PdfNativeTextDecorationGeometry,
    contentStream: PdfNativeIndirectObjectRef | null) => Promise<Readonly<{ range: PdfNativeTextRuleRange }> | null>) | null,
): Promise<Readonly<{ underline: PdfNativeTextRuleRange | null; strikethrough: PdfNativeTextRuleRange | null }> | null> {
  const geometry = pdfNativeTextDecorationGeometryFromProof(proof);
  const stated = pdfNativeOpenBoxTextRules(proof, { underline: null, strikethrough: null });
  if (!geometry && !stated.underline && !stated.strikethrough) return null;
  const contentStream = proof?.sourceRun?.contentStream ?? proof?.target ?? null;
  const beside = async (style: "underline" | "strikethrough") =>
    geometry && readBeside ? (await readBeside(style, geometry, contentStream))?.range ?? null : null;
  const [underline, strikethrough] = await Promise.all([beside("underline"), beside("strikethrough")]);
  return pdfNativeOpenBoxTextRules(proof, { underline, strikethrough });
}
