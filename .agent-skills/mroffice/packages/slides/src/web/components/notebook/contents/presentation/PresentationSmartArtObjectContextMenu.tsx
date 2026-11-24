"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The right-click menu of a SmartArt graphic on the canvas.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the render
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { OfficeSmartArtContextMenu, openOfficeSmartArtLayoutGallery, type OfficeSmartArtContextMenuLabels } from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtContextMenu.tsx";
import { readSmartArtBlockMarker } from "@mrnote/core/web/lib/presentation-smartart.ts";
import type { OfficeSmartArtDesignTabDiagram, OfficeSmartArtDesignTabLabels, OfficeSmartArtDesignTabPreserved } from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtDesignTab.tsx";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { PresentationChartContextElement } from "@/lib/presentation-chart-context-element";
import type { embeddedPresentationAutosave } from "../../../../lib/presentation-embedded-session";
import type { PresentationBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { PresentationWebRibbonTab } from "../../../../lib/presentation/ribbon-tabs";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationSmartArtObjectContextMenuCtl {
  smartArtDesignLabels: OfficeSmartArtDesignTabLabels;
  smartArtContextMenuLabels: OfficeSmartArtContextMenuLabels;
  smartArtTextPaneOpen: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  blockContextMenu: { x: number; y: number; blockId: string | null; tableCell?: { row: number; col: number; }; smartArtTarget?: "graphic" | "shape"; textEditing?: { hasSelection: boolean; }; chartElement?: PresentationChartContextElement; };
  setBlockContextMenu: Dispatch<SetStateAction<{ x: number; y: number; blockId: string | null; tableCell?: { row: number; col: number; }; smartArtTarget?: "graphic" | "shape"; textEditing?: { hasSelection: boolean; }; chartElement?: PresentationChartContextElement; } | null>>;
  clipboardHasContent: boolean;
  autosave: ReturnType<typeof embeddedPresentationAutosave>;
  contextualSmartArtBlocks: readonly PresentationBlock[];
  contextualSmartArtSelectionIsWritable: boolean;
  contextualSmartArtSelectedItemId: string | null;
  openFormatPane: () => void;
  /** Format pane at Size & Properties (Size and Position...). */
  openFormatPaneAtSize: () => void;
  bringBlockToFront: (explicitId?: string, explicitOnly?: boolean) => void;
  sendBlockToBack: (explicitId?: string, explicitOnly?: boolean) => void;
  copyBlocks: (explicitId?: string) => void;
  pasteBlocks: () => boolean;
  cutBlocks: (explicitId?: string) => void;
  resetContextualSmartArtShape: (itemId: string) => boolean;
  toggleSmartArtTextPane: () => boolean;
  beginReplaceImage: (blockId: string, trigger?: HTMLElement | null) => void;
  selectPresentationRibbonTab: (key: PresentationWebRibbonTab, options?: { preserveFocus?: boolean; }) => void;
  presentationSmartArtPreserved: OfficeSmartArtDesignTabPreserved | null;
  presentationSmartArtDiagram: OfficeSmartArtDesignTabDiagram | null;
}

export function PresentationSmartArtObjectContextMenu({ ctl }: { ctl: PresentationSmartArtObjectContextMenuCtl }) {
  const {
    smartArtDesignLabels,
    smartArtContextMenuLabels,
    smartArtTextPaneOpen,
    rootRef,
    blockContextMenu,
    setBlockContextMenu,
    clipboardHasContent,
    autosave,
    contextualSmartArtBlocks,
    contextualSmartArtSelectionIsWritable,
    contextualSmartArtSelectedItemId,
    openFormatPane,
    openFormatPaneAtSize,
    bringBlockToFront,
    sendBlockToBack,
    copyBlocks,
    pasteBlocks,
    cutBlocks,
    resetContextualSmartArtShape,
    toggleSmartArtTextPane,
    beginReplaceImage,
    selectPresentationRibbonTab,
    presentationSmartArtPreserved,
    presentationSmartArtDiagram,
  } = ctl;
  return (
            <OfficeSmartArtContextMenu
              x={blockContextMenu.x}
              y={blockContextMenu.y}
              onClose={() => setBlockContextMenu(null)}
              testIdPrefix="presentation"
              labels={smartArtContextMenuLabels}
              designLabels={smartArtDesignLabels}
              diagram={presentationSmartArtDiagram}
              preserved={presentationSmartArtPreserved}
              target={blockContextMenu.smartArtTarget ?? "shape"}
              host={{
                // Reset Shape on the pressed shape's item.
                onResetShape: (() => {
                  const pressed = contextualSmartArtBlocks.find(
                    (block) => block.id === blockContextMenu.blockId,
                  );
                  const itemId = pressed
                    ? readSmartArtBlockMarker(pressed)?.itemId
                    : null;
                  return blockContextMenu.smartArtTarget !== "graphic" && itemId
                    ? () => {
                        resetContextualSmartArtShape(itemId);
                      }
                    : undefined;
                })(),
                // A picture shape's Change Picture is the deck's own Replace
                // Picture on that image block.
                onChangePicture:
                  blockContextMenu.smartArtTarget !== "graphic" &&
                  contextualSmartArtBlocks.some(
                    (block) =>
                      block.id === blockContextMenu.blockId &&
                      block.type === "image",
                  )
                    ? () => {
                        if (blockContextMenu.blockId) {
                          beginReplaceImage(blockContextMenu.blockId, null);
                        }
                      }
                    : undefined,
                // Package-owned or locked members refuse every write the
                // tab refuses, clipboard and z-order included.
                writable:
                  !autosave.readOnly &&
                  (presentationSmartArtDiagram
                    ? contextualSmartArtSelectionIsWritable
                    : Boolean(presentationSmartArtPreserved?.writable)),
                onCut: () => {
                  cutBlocks();
                },
                onCopy: () => {
                  copyBlocks();
                },
                onPaste: () => {
                  pasteBlocks();
                },
                canPaste: clipboardHasContent,
                onEditText: () => {
                  // Office puts the caret in the shape the author pointed at;
                  // the deck's label is its own text block, so focus it, and
                  // fall back to the Text Pane where it has no editable face.
                  const label = contextualSmartArtBlocks.find((block) => {
                    const marker = readSmartArtBlockMarker(block);
                    return (
                      marker?.role === "label" &&
                      marker.itemId === contextualSmartArtSelectedItemId
                    );
                  });
                  const editable = label
                    ? rootRef.current?.querySelector<HTMLElement>(
                        `[data-block-id="${CSS.escape(label.id)}"] [contenteditable="true"]`,
                      )
                    : null;
                  if (editable) editable.focus();
                  else if (!smartArtTextPaneOpen) toggleSmartArtTextPane();
                },
                editTextBlockedReason: presentationSmartArtPreserved
                  ? presentationSmartArtPreserved.textBlockedReason
                  : null,
                onChangeLayout: () => {
                  selectPresentationRibbonTab("smartart-design", {
                    preserveFocus: true,
                  });
                  openOfficeSmartArtLayoutGallery("presentation");
                },
                onBringToFront: () => {
                  bringBlockToFront();
                },
                onSendToBack: () => {
                  sendBlockToBack();
                },
                onSizeAndPosition: openFormatPaneAtSize,
                onFormatObject: openFormatPane,
              }}
            />
  );
}
