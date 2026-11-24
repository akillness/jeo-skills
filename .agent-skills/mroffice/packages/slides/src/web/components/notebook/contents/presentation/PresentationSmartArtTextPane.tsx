"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The SmartArt Text pane that edits the selected SmartArt graphic as an
 * outline.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { OfficeSmartArtTextPane, type OfficeSmartArtTextPaneLabels } from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtTextPane.tsx";
import { nearestMatch } from "@mrnote/core/web/lib/office-smartart/text-pane-placement.ts";
import {
  MAX_SMARTART_OUTLINE_TEXT_LENGTH,
  type SmartArtBlockMarker,
  type SmartArtOutlineInsertPosition,
  type SmartArtOutlineItem,
} from "@mrnote/core/web/lib/presentation-smartart.ts";
import { smartArtHeldPictureItemIds } from "@mrnote/core/web/lib/office-smartart/held-pictures.ts";
import { smartArtOutlineAfterDemote, smartArtOutlineAfterMove, smartArtOutlineAfterPromote } from "@mrnote/core/web/lib/office-smartart/design-model.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { embeddedPresentationAutosave } from "../../../../lib/presentation-embedded-session";
import type { PresentationBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { NativeSmartArtProfile } from "../../../../lib/presentation-native-smartart-structure-api";
import type { NativeSmartArtStructureOperation, NativeSmartArtStructureReceipt } from "../../../../lib/presentation-native-smartart-structure";
import type { NativeSmartArtGroup } from "@mrnote/core/web/lib/presentation-native-smartart.ts";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationSmartArtTextPaneCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  /** The items the layout does not draw (Office's unused text). */
  contextualSmartArtUnusedItemIds: ReadonlySet<string>;
  smartArtTextPaneLabels: OfficeSmartArtTextPaneLabels;
  autosave: ReturnType<typeof embeddedPresentationAutosave>;
  nativeSmartArtStructurePending: boolean;
  contextualNativeSmartArt: { pageId: string; generation: number; groupId: string; members: readonly PresentationBlock[]; receipt: { [x: string]: unknown; }; outline: readonly SmartArtOutlineItem[]; selectedPointId: string | null; } | null;
  nativeSmartArtStructureBusy: boolean;
  nativeSmartArtProfile: { scope: string; result: NativeSmartArtProfile; } | null;
  nativeSmartArtProfileScope: string | null;
  nativeSmartArtStructure: { supported: true; profile: NativeSmartArtStructureReceipt; group: NativeSmartArtGroup; } | null;
  nativeSmartArtCanOperate: (operation: NativeSmartArtStructureOperation, pointId: string | null) => boolean;
  nativeSmartArtCanDelete: boolean;
  contextualSmartArtMarker: SmartArtBlockMarker | null;
  contextualSmartArtOutline: readonly SmartArtOutlineItem[];
  contextualSmartArtTextIsWritable: boolean;
  contextualSmartArtSelectionIsWritable: boolean;
  selectSmartArtOutlineItem: (itemId: string | null) => void;
  contextualSmartArtSelectedItemId: string | null;
  contextualSmartArtCanAddOutlineItem: boolean;
  contextualAuthoredSmartArtHierarchy: boolean;
  addContextualSmartArtOutlineItem: (pendingText?: { itemId: string; text: string; }, newItemText?: string) => boolean;
  insertContextualSmartArtShape: (position: SmartArtOutlineInsertPosition, pendingText?: { itemId: string; text: string; }) => boolean;
  moveContextualSmartArtOutlineItem: (direction: "up" | "down", pendingText?: { itemId: string; text: string; }) => boolean;
  removeContextualSmartArtOutlineItem: (itemId: string) => boolean;
  mergeContextualSmartArtOutlineItems: (keepId: string, text: string, goneId: string, caret: number) => boolean;
  pasteContextualSmartArtOutlineLines: (itemId: string, text: string, lines: string[], caret: number) => boolean;
  promoteContextualSmartArtOutlineItem: (pendingText?: { itemId: string; text: string; }) => boolean;
  demoteContextualSmartArtOutlineItem: (pendingText?: { itemId: string; text: string; }) => boolean;
  updateContextualSmartArtOutlineText: (itemId: string, text: string) => boolean;
  changeNativeSmartArtStructure: (operation: NativeSmartArtStructureOperation, pointId: string, pendingText?: { itemId: string; text: string; }, newPointText?: string) => Promise<void>;
  closeSmartArtTextPane: (restoreFocus?: boolean) => void;
  /** A file's SmartArt with another window in the page's room: the pane is read-only (TRIAGE S11g guard). */
  smartArtPaneLockedByPeers?: boolean;
}

/** The selected diagram's frame, in the pane's own deck window. */
const presentationSmartArtFrame = (pane: HTMLElement) =>
  nearestMatch(pane, '[data-testid="presentation-smartart-group-frame"]');
/**
 * The deck's editing area below the ribbon, which the pane stays inside: it
 * may stand over the slide rail, as PowerPoint's floats over the thumbnails.
 */
const presentationCanvasViewport = (pane: HTMLElement) =>
  pane.closest(".presentation-window__body") ??
  nearestMatch(pane, '[data-testid="presentation-canvas-viewport"]');

export function PresentationSmartArtTextPane({ ctl }: { ctl: PresentationSmartArtTextPaneCtl }) {
  const {
    t,
    contextualSmartArtUnusedItemIds,
    smartArtTextPaneLabels,
    autosave,
    nativeSmartArtStructurePending,
    contextualNativeSmartArt,
    nativeSmartArtStructureBusy,
    nativeSmartArtProfile,
    nativeSmartArtProfileScope,
    nativeSmartArtStructure,
    nativeSmartArtCanOperate,
    nativeSmartArtCanDelete,
    contextualSmartArtMarker,
    contextualSmartArtOutline,
    contextualSmartArtTextIsWritable,
    contextualSmartArtSelectionIsWritable,
    selectSmartArtOutlineItem,
    contextualSmartArtSelectedItemId,
    contextualSmartArtCanAddOutlineItem,
    contextualAuthoredSmartArtHierarchy,
    addContextualSmartArtOutlineItem,
    insertContextualSmartArtShape,
    moveContextualSmartArtOutlineItem,
    removeContextualSmartArtOutlineItem,
    mergeContextualSmartArtOutlineItems,
    pasteContextualSmartArtOutlineLines,
    promoteContextualSmartArtOutlineItem,
    demoteContextualSmartArtOutlineItem,
    updateContextualSmartArtOutlineText,
    changeNativeSmartArtStructure,
    closeSmartArtTextPane,
    smartArtPaneLockedByPeers = false,
  } = ctl;
  // Another window is editing this deck: a file's SmartArt is edited on the
  // canvas, not here (TRIAGE S11g: two windows writing one pane row lost one
  // window's words). Read-only, its structure commands off, and said so.
  const locked = smartArtPaneLockedByPeers;
  return (
            <OfficeSmartArtTextPane
              testIdPrefix="presentation"
              anchor={presentationSmartArtFrame}
              bounds={presentationCanvasViewport}
              layoutId={contextualSmartArtMarker?.kind ?? null}
              labels={smartArtTextPaneLabels}
              outline={contextualSmartArtOutline}
              unusedItemIds={contextualSmartArtUnusedItemIds}
              // A picture a layout without picture shapes keeps (red X).
              hiddenPictureItemIds={smartArtHeldPictureItemIds(contextualSmartArtMarker?.groupId)}
              selectedItemId={contextualSmartArtSelectedItemId}
              maxTextLength={MAX_SMARTART_OUTLINE_TEXT_LENGTH}
              canAddItem={!locked && Boolean(contextualSmartArtCanAddOutlineItem)}
              itemKeyPrefix={
                contextualNativeSmartArt
                  ? `${contextualNativeSmartArt.pageId}:${contextualNativeSmartArt.generation}:`
                  : ""
              }
              busy={
                nativeSmartArtStructureBusy ||
                (nativeSmartArtStructurePending && autosave.isSaving)
              }
              structureState={
                contextualNativeSmartArt
                  ? nativeSmartArtStructureBusy ||
                    (nativeSmartArtStructurePending && autosave.isSaving)
                    ? "busy"
                    : nativeSmartArtStructurePending
                      ? "unavailable"
                      : nativeSmartArtStructure
                        ? "ready"
                        : nativeSmartArtProfile?.scope ===
                            nativeSmartArtProfileScope
                          ? "unavailable"
                          : "loading"
                  : undefined
              }
              notice={
                locked
                  ? t("presentation.smartartContext.paneLockedCoediting")
                  : contextualNativeSmartArt &&
                contextualSmartArtTextIsWritable &&
                nativeSmartArtProfile?.scope === nativeSmartArtProfileScope &&
                !nativeSmartArtProfile.result.supported
                  ? t("presentation.smartartContext.nativeTextOnly")
                  : undefined
              }
              itemState={(item) => locked ? {
                canPromote: false, canDemote: false, canDelete: false, canBackspaceDelete: false,
                canMoveUp: false, canMoveDown: false, readOnly: true,
              } : ({
                canPromote: contextualNativeSmartArt
                  ? nativeSmartArtCanOperate("promote", item.id)
                  : Boolean(
                      contextualSmartArtSelectionIsWritable &&
                        contextualAuthoredSmartArtHierarchy &&
                        contextualSmartArtMarker &&
                        smartArtOutlineAfterPromote(
                          contextualSmartArtOutline,
                          item.id,
                          contextualSmartArtMarker.kind,
                        ),
                    ),
                canDemote: contextualNativeSmartArt
                  ? nativeSmartArtCanOperate("demote", item.id)
                  : Boolean(
                      contextualSmartArtSelectionIsWritable &&
                        contextualAuthoredSmartArtHierarchy &&
                        contextualSmartArtMarker &&
                        smartArtOutlineAfterDemote(
                          contextualSmartArtOutline,
                          item.id,
                          contextualSmartArtMarker.kind,
                        ),
                    ),
                canDelete: contextualNativeSmartArt
                  ? nativeSmartArtCanDelete
                  : contextualSmartArtSelectionIsWritable &&
                    contextualSmartArtOutline.length > 1,
                canBackspaceDelete: Boolean(
                  contextualNativeSmartArt && nativeSmartArtCanDelete,
                ),
                // The native engine has no reorder; an authored diagram
                // moves through the shared transform.
                canMoveUp: Boolean(
                  !contextualNativeSmartArt &&
                    contextualSmartArtSelectionIsWritable &&
                    contextualSmartArtMarker &&
                    smartArtOutlineAfterMove(
                      contextualSmartArtOutline,
                      item.id,
                      "up",
                      contextualSmartArtMarker.kind,
                    ),
                ),
                canMoveDown: Boolean(
                  !contextualNativeSmartArt &&
                    contextualSmartArtSelectionIsWritable &&
                    contextualSmartArtMarker &&
                    smartArtOutlineAfterMove(
                      contextualSmartArtOutline,
                      item.id,
                      "down",
                      contextualSmartArtMarker.kind,
                    ),
                ),
                readOnly:
                  nativeSmartArtStructureBusy ||
                  nativeSmartArtStructurePending ||
                  (!contextualSmartArtSelectionIsWritable &&
                    !contextualSmartArtTextIsWritable),
              })}
              preventDeleteFocus={Boolean(contextualNativeSmartArt)}
              onClose={() => closeSmartArtTextPane()}
              onSelect={selectSmartArtOutlineItem}
              onCommitText={(itemId, text) =>
                updateContextualSmartArtOutlineText(itemId, text)
              }
              onAddAfter={(itemId, text, nextText) => {
                // Enter splits the row at the caret (PPT-B032): the text
                // after it moves to the new item, in the same undo step.
                if (contextualNativeSmartArt) {
                  void changeNativeSmartArtStructure(
                    "insert-after",
                    itemId,
                    { itemId, text },
                    nextText ?? "",
                  );
                } else {
                  addContextualSmartArtOutlineItem({ itemId, text }, nextText);
                }
              }}
              onAddShape={(itemId, text) => {
                if (contextualNativeSmartArt) {
                  void changeNativeSmartArtStructure(
                    "insert-after",
                    itemId,
                    { itemId, text },
                    "",
                  );
                } else {
                  insertContextualSmartArtShape("after", { itemId, text });
                }
              }}
              onMoveUp={(itemId, text) => {
                moveContextualSmartArtOutlineItem("up", { itemId, text });
              }}
              onMoveDown={(itemId, text) => {
                moveContextualSmartArtOutlineItem("down", { itemId, text });
              }}
              onBackspaceEmpty={(itemId) => {
                void changeNativeSmartArtStructure("delete", itemId, {
                  itemId,
                  text: "",
                });
              }}
              onPromote={(itemId, text) => {
                if (contextualNativeSmartArt) {
                  void changeNativeSmartArtStructure("promote", itemId, {
                    itemId,
                    text,
                  });
                } else {
                  promoteContextualSmartArtOutlineItem({ itemId, text });
                }
              }}
              onDemote={(itemId, text) => {
                if (contextualNativeSmartArt) {
                  void changeNativeSmartArtStructure("demote", itemId, {
                    itemId,
                    text,
                  });
                } else {
                  demoteContextualSmartArtOutlineItem({ itemId, text });
                }
              }}
              // The native engine has no merge; an authored diagram joins
              // the two rows through the shared transform.
              onMerge={
                contextualNativeSmartArt
                  ? undefined
                  : (keepId, text, goneId, caret) => {
                      mergeContextualSmartArtOutlineItems(keepId, text, goneId, caret);
                    }
              }
              onPasteLines={
                contextualNativeSmartArt
                  ? undefined
                  : (itemId, text, lines, caret) => {
                      pasteContextualSmartArtOutlineLines(itemId, text, lines, caret);
                    }
              }
              onDelete={(itemId) => {
                if (contextualNativeSmartArt) {
                  void changeNativeSmartArtStructure("delete", itemId);
                } else {
                  removeContextualSmartArtOutlineItem(itemId);
                }
              }}
            />
  );
}
