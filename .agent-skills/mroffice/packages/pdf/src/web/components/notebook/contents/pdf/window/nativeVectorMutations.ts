/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfNativeChainStep } from "../../../../../lib/pdf/native-revision-chain";
import type {
  PdfNativeVectorSelectionDuplicatePlan,
  PdfNativeVectorSelectionReorderPlan,
  PdfNativeVectorHistoryEndpoint,
  PdfNativeVectorSelectionEditPayload,
  PdfNativeVectorSelectionDeletePlan,
  PdfNativeVectorSelectionEditPlan,
} from "../../../../../lib/pdf/native-vector-selection-edit";
import {
  createPdfNativeVectorRotationOrigin,
} from "../../../../../lib/pdf/native-vector-commands";
import type {
  PdfNativeVectorStyleSelectionEditPlan,
} from "../../../../../lib/pdf/native-vector-style-selection-edit";
import type {
  PdfNativeVectorObjectStyle,
  PdfNativeVectorObjectStyleChanges,
} from "../../../../../lib/pdf/engine/native/vector-style-transaction";
import type {
  PdfNativeReceiptSourceAction,
  PdfNativeReceiptJournalFamily,
  PdfNativeReceiptMutationLease,
  PdfNativeSourceConsolidationSurvival,
} from "../../../../../lib/pdf/native-receipt-journal";

export interface PdfNativeVectorGeometryHistorySeed {
  /** The forward record: Undo writes its bytes back (byte-restore history). */
  readonly originTransactionId?: string;
  readonly pageGeometry: PdfNativeVectorSelectionEditPayload["pageGeometry"];
  readonly forward: PdfNativeVectorSelectionEditPayload["affine"];
  readonly inverse: PdfNativeVectorSelectionEditPayload["affine"];
  readonly before: PdfNativeVectorHistoryEndpoint;
  readonly after: PdfNativeVectorHistoryEndpoint;
  readonly rotationOrigin?: ReturnType<typeof createPdfNativeVectorRotationOrigin>;
  /** A vertex edit replays as the same anchor moved back and forth. */
  readonly vertexEdit?: PdfNativeVectorSelectionEditPayload["vertexEdit"];
}

export interface PdfNativeVectorStyleHistorySeed {
  /** The forward record: Undo writes its bytes back (byte-restore history). */
  readonly originTransactionId?: string;
  readonly pageGeometry: PdfNativeVectorStyleSelectionEditPlan["payload"]["pageGeometry"];
  readonly before: PdfNativeVectorHistoryEndpoint;
  readonly after: PdfNativeVectorHistoryEndpoint;
  readonly beforeStyle: PdfNativeVectorObjectStyle;
  readonly afterStyle: PdfNativeVectorObjectStyle;
  readonly forward: PdfNativeVectorObjectStyleChanges;
  readonly inverse: PdfNativeVectorObjectStyleChanges;
  /**
   * Undo/Redo writes the forward record's bytes back first (byte-restore
   * history) and re-proves the inverse plan only when the journal cannot
   * restore it. See `pdfNativeVectorStyleUndoesByByteRestore`.
   */
  readonly byteRestore?: boolean;
}













export function pdfNativeVectorStyleUndoesByByteRestore(
  changes: PdfNativeVectorObjectStyleChanges,
): boolean {
  return (
    changes.paintMode !== undefined &&
    changes.opacity === undefined &&
    changes.blendMode === undefined
  );
}

/** A group's members planned one on another and written as one revision
 * (planPdfNativeRevisionChain): each member's own plan, on the bytes it was
 * planned on. The step's candidate is the outer plan's. */
export interface PdfNativeVectorGeometryGroup {
  readonly steps: readonly PdfNativeChainStep<PdfNativeVectorSelectionEditPlan>[];
}

export type PdfNativeVectorMutationPlan =
  | Readonly<{ kind: "geometry"; plan: PdfNativeVectorSelectionEditPlan; group?: PdfNativeVectorGeometryGroup }>
  | Readonly<{ kind: "delete"; plan: PdfNativeVectorSelectionDeletePlan;
      group?: Readonly<{ steps: readonly PdfNativeChainStep<PdfNativeVectorSelectionDeletePlan>[] }> }>
  | Readonly<{ kind: "style"; plan: PdfNativeVectorStyleSelectionEditPlan }>
  | Readonly<{ kind: "duplicate"; plan: PdfNativeVectorSelectionDuplicatePlan;
      group?: Readonly<{ steps: readonly PdfNativeChainStep<PdfNativeVectorSelectionDuplicatePlan>[] }> }>
  | Readonly<{ kind: "reorder"; plan: PdfNativeVectorSelectionReorderPlan;
      /** Several layer moves written as one revision (a multiple selection's
       * Arrange command, a Selection pane drop): planNativeVectorReorderChain. */
      group?: Readonly<{ steps: readonly PdfNativeChainStep<PdfNativeVectorSelectionReorderPlan>[] }> }>;

/** `transactionId`: the committed record, which Undo writes back. */
export type PdfNativeVectorCommittedMutation = Readonly<{ transactionId?: string }> & (
  | (Extract<
      PdfNativeVectorMutationPlan,
      { kind: "geometry" | "style" | "reorder" }
    > &
      Readonly<{
        acceptedSelection: PdfNativeVectorSelectionEditPlan["afterSelection"];
      }>)
  | (Extract<PdfNativeVectorMutationPlan, { kind: "duplicate" }> &
      Readonly<{
        acceptedSelection?: PdfNativeVectorSelectionEditPlan["afterSelection"];
      }>)
  | Extract<PdfNativeVectorMutationPlan, { kind: "delete" }>);

export interface PdfNativeVectorDuplicateHistorySeed {
  /** The forward record: Undo writes its bytes back (byte-restore history). */
  readonly originTransactionId?: string;
  readonly pageGeometry: PdfNativeVectorSelectionDuplicatePlan["payload"]["pageGeometry"];
  readonly sourceEndpoint: PdfNativeVectorHistoryEndpoint;
  readonly copyEndpoint: PdfNativeVectorHistoryEndpoint;
  readonly offset: Readonly<{ dx: number; dy: number }>;
  readonly insertedBytes: readonly number[];
}

export interface PdfNativeVectorReorderHistorySeed {
  /** The forward record: Undo writes its bytes back (byte-restore history). */
  readonly originTransactionId?: string;
  readonly pageGeometry: PdfNativeVectorSelectionReorderPlan["payload"]["pageGeometry"];
  /** A step, or a move to the front or back in one write; Redo makes the
   * same move again. */
  readonly direction: "forward" | "backward" | "front" | "back";
  readonly beforeEndpoint: PdfNativeVectorHistoryEndpoint;
  readonly afterEndpoint: PdfNativeVectorHistoryEndpoint;
  readonly afterNeighbourEndpoint: PdfNativeVectorHistoryEndpoint | null;
  readonly originalBytes: readonly number[];
  readonly reorderedBytes: readonly number[];
}

/**
 * The history of one vector delete -- of one object, or of several selected
 * together, which writes one record per object, the last object in the stream
 * first. Each record replaced the object's operators with the path end `n`,
 * so its history is the byte restore every one-span write has
 * (docs/pdf/edit-gates.md, "Undo is a byte restore"): Undo writes the
 * object's own bytes back where the `n` stands, the newest record first, and
 * Redo writes the `n` again, in the order the delete was made.
 */
export type PdfNativeVectorDeleteHistoryOutcome =
  /** Every record of the action was written back (or again). */
  | "applied"
  /** Nothing was written: the first record cannot be restored. */
  | "refused"
  /** Some records were written and the next one could not be: the page is
   * between the two states and the action's history no longer describes it. */
  | "partial";

export async function replayPdfNativeVectorDeleteHistory(input: {
  /** The action's delete records, in the order they were written. */
  readonly originTransactionIds: readonly string[];
  readonly direction: "undo" | "redo";
  /** One byte restore; "unavailable" when the record's bytes no longer stand
   * where it wrote them (nothing was sent). */
  readonly restore: (
    originTransactionId: string,
    direction: "undo" | "redo",
  ) => Promise<boolean | "unavailable">;
  /** Finishes the previous restore's save before the next one is written. */
  readonly settle: () => Promise<boolean>;
}): Promise<PdfNativeVectorDeleteHistoryOutcome> {
  const ids = input.direction === "undo"
    ? [...input.originTransactionIds].reverse()
    : [...input.originTransactionIds];
  if (ids.length === 0 || new Set(ids).size !== ids.length) return "refused";
  // A step that throws wrote nothing it can vouch for: it fails like a refusal.
  const attempt = async <T,>(run: () => Promise<T>): Promise<T | false> => {
    try {
      return await run();
    } catch {
      return false;
    }
  };
  for (let index = 0; index < ids.length; index += 1) {
    if (index > 0 && (await attempt(input.settle)) !== true) return "partial";
    const restored = await attempt(() => input.restore(ids[index], input.direction));
    if (restored !== true) return index === 0 ? "refused" : "partial";
  }
  return "applied";
}

export interface PdfNativeReceiptJournalPublisher {
  readonly id?: string;
  readonly family: PdfNativeReceiptJournalFamily;
  readonly sourceAction?: PdfNativeReceiptSourceAction;
  /** Whether the step goes on across a source consolidation
   * (PdfNativeReceiptJournalEntry.survivesSourceConsolidation). */
  readonly survivesSourceConsolidation?: PdfNativeSourceConsolidationSurvival;
  /** PdfNativeReceiptJournalEntry.restoreOrigin. */
  readonly restoreOrigin?: string;
  /** PdfNativeReceiptJournalEntry.rowsSubStep: a press written in the
   * revision of the step pushed just before it. */
  readonly rowsSubStep?: boolean;
  




  readonly run?: Readonly<{ key: string; end: unknown; endAt: (end: unknown) => void }>;
  readonly undo: (
    lease: PdfNativeReceiptMutationLease,
  ) => Promise<boolean | void>;
  readonly redo: (
    lease: PdfNativeReceiptMutationLease,
  ) => Promise<boolean | void>;
}
