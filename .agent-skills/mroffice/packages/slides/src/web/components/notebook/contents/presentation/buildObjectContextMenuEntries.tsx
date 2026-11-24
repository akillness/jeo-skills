/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The entries of an object's right-click menu on the slide canvas.
 *
 * Moved verbatim from the body of
 * `components/notebook/contents/PresentationWindow.tsx`: the window passes the
 * bindings it used to close over as `ctl` and calls this where the closure was.
 * No hooks run here.
 */

import type { MergeShapesOp } from "@mrnote/core/web/lib/presentation-shape-buttons.ts";
import type { PointerContextMenuEntry, PointerContextMenuAction } from "@mrnote/core/web/components/ui/PointerContextMenu.tsx";
import { isBlockShownLocked, isLockedFor } from "@mrnote/core/web/lib/presentation-text-case.ts";
import { blockClaimsNativeGroup } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { isPresentationOfficeGraphic } from "../../../../lib/presentation/window-helpers";
import type { PresentationImageBlock, PresentationEmbedBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { normalizeEmbedKind } from "@mrnote/core/web/lib/presentation-embed.ts";
import { officeContextMenuIcon } from "@mrnote/core/web/components/office-ribbon/officeContextMenuIcons.tsx";
import { officeShortcut } from "@mrnote/core/web/lib/office-context-menu.ts";
import { presentationVideoContextMenuEntries } from "./presentationVideoContextMenu";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { RefObject } from "react";
import type { embeddedPresentationAutosave } from "../../../../lib/presentation-embedded-session";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { PresentationVideoContextMenuRows } from "./presentationVideoContextMenu";

/** The window bindings this reads, passed through unchanged. */
export interface BuildObjectContextMenuEntriesCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  pictureReplaceBusy: boolean;
  openAltTextPane: () => void;
  clipboardHasContent: boolean;
  selectedBlockIds: ReadonlySet<string>;
  selectedBlockIdsRef: RefObject<ReadonlySet<string>>;
  autosave: ReturnType<typeof embeddedPresentationAutosave>;
  activeSlide: SlideModel;
  setPictureCropMode: (blockId: string, behavior: "toggle" | "enter") => void;
  openFormatPane: () => void;
  /** Format pane at Size & Properties (Size and Position...). */
  openFormatPaneAtSize: () => void;
  deleteBlock: (blockId: string) => void;
  deleteLiveHomeSelection: () => void;
  toggleBlockLock: (blockId: string) => void;
  canMergeShapes: boolean;
  mergeSelectedShapes: (op: MergeShapesOp) => void;
  armAnimationPainter: (sourceBlockId: string) => void;
  toggleBlockHidden: (explicitId?: string, explicitOnly?: boolean, sourceFreeOnly?: boolean, explicitIds?: readonly string[]) => void;
  slideHasHiddenBlock: boolean;
  showAllHiddenBlocks: () => void;
  copyBlocks: (explicitId?: string) => void;
  pasteBlocks: () => boolean;
  cutBlocks: (explicitId?: string) => void;
  beginReplaceImage: (blockId: string, trigger?: HTMLElement | null) => void;
  contextMenuSeparator: (id: string) => PointerContextMenuEntry;
  contextMenuNewCommentEntry: () => PointerContextMenuAction;
  desktopMenuLabel: (key: string) => string;
  objectLinkEntries: (blockId: string, writable: boolean, writeReason: string | undefined) => { link: PointerContextMenuAction; action: PointerContextMenuAction; };
  contextMenuDesktopOrderEntries: (blockId: string, disabled: boolean) => PointerContextMenuAction[];
  contextMenuGroupSubmenu: (readOnly: boolean) => PointerContextMenuAction;
  videoContextMenuRows: (block: PresentationEmbedBlock, writable: boolean, writeReason: string) => PresentationVideoContextMenuRows;
}

export function buildObjectContextMenuEntries(ctl: BuildObjectContextMenuEntriesCtl) {
  const {
    t,
    pictureReplaceBusy,
    openAltTextPane,
    clipboardHasContent,
    selectedBlockIds,
    selectedBlockIdsRef,
    autosave,
    activeSlide,
    setPictureCropMode,
    openFormatPane,
    openFormatPaneAtSize,
    deleteBlock,
    deleteLiveHomeSelection,
    toggleBlockLock,
    canMergeShapes,
    mergeSelectedShapes,
    armAnimationPainter,
    toggleBlockHidden,
    slideHasHiddenBlock,
    showAllHiddenBlocks,
    copyBlocks,
    pasteBlocks,
    cutBlocks,
    beginReplaceImage,
    contextMenuSeparator,
    contextMenuNewCommentEntry,
    desktopMenuLabel,
    objectLinkEntries,
    contextMenuDesktopOrderEntries,
    contextMenuGroupSubmenu,
    videoContextMenuRows,
  } = ctl;
  const objectContextMenuEntries = (blockId: string): PointerContextMenuEntry[] => {
    const target = activeSlide.blocks.find((block) => block.id === blockId);
    const locked = isBlockShownLocked(target);
    const preserveOnly = Boolean(target && blockClaimsNativeGroup(target));
    const readOnly = autosave.readOnly;
    // Lock fixes the object's place (PowerPoint's Lock): Cut, Change Picture,
    // links and Delete stay open on it; Crop, which sizes its frame, does not.
    const writable = !readOnly && Boolean(target);
    const croppable = writable && !isLockedFor(target, "crop");
    // An SVG graphic is a picture to the model, but PowerPoint gives it the
    // Graphics menu: Change Graphic, Convert to Shape, Format Graphic, and no
    // Crop (PPT-C013).
    const isGraphic = target?.type === "image" && isPresentationOfficeGraphic(target as PresentationImageBlock);
    const isPicture = target?.type === "image";
    const isVideo =
      target?.type === "embed" && normalizeEmbedKind(target.kind) === "video";
    const writeReason = readOnly ? t("ai.readOnlyLock") : t("presentation.altTextPane.preserved");
    const cropReason = readOnly ? t("ai.readOnlyLock") : !writable ? writeReason : t("presentation.cropLockedUnavailable");
    const links = objectLinkEntries(blockId, writable, writeReason);
    const entries: PointerContextMenuEntry[] = [
      {
        id: "cut",
        label: t("toolbar.cut"),
        icon: officeContextMenuIcon("cut"),
        shortcut: officeShortcut("cut"),
        disabled: !writable,
        disabledReason: writeReason,
        testId: "presentation-context-cut",
        onSelect: () => {
          cutBlocks(blockId);
        },
      },
      {
        id: "copy",
        label: t("presentation.contextMenu.copy"),
        icon: officeContextMenuIcon("copy"),
        shortcut: officeShortcut("copy"),
        testId: "presentation-context-copy",
        onSelect: () => {
          copyBlocks(blockId);
        },
      },
      {
        id: "paste",
        label: t("presentation.contextMenu.paste"),
        icon: officeContextMenuIcon("paste"),
        shortcut: officeShortcut("paste"),
        disabled: !clipboardHasContent,
        disabledReason: t("presentation.contextMenu.clipboardEmpty"),
        testId: "presentation-context-paste",
        onSelect: () => {
          pasteBlocks();
        },
      },
      ...(isPicture
        ? ([
            contextMenuSeparator("change-picture"),
            {
              id: "change-picture",
              label: isGraphic ? desktopMenuLabel("changeGraphic") : t("presentation.contextMenu.changePicture"),
              icon: officeContextMenuIcon("changePicture"),
              disabled: !writable || pictureReplaceBusy,
              disabledReason: writeReason,
              testId: "presentation-context-change-picture",
              onSelect: () => beginReplaceImage(blockId, null),
            },
            ...(isGraphic
              ? ([
                  {
                    id: "convert-to-shape",
                    label: desktopMenuLabel("convertToShape"),
                    icon: officeContextMenuIcon("changePicture"),
                    disabled: true,
                    disabledReason: t("presentation.officeGraphic.convertToShapeUnavailable"),
                    testId: "presentation-context-convert-to-shape",
                    onSelect: () => undefined,
                  },
                ] satisfies PointerContextMenuEntry[])
              : []),
          ] satisfies PointerContextMenuEntry[])
        : []),
      contextMenuSeparator("arrange"),
      contextMenuGroupSubmenu(readOnly),
      ...contextMenuDesktopOrderEntries(blockId, readOnly),
      {
        id: "lock",
        label: locked ? t("presentation.contextMenu.unlock") : t("presentation.contextMenu.lock"),
        icon: officeContextMenuIcon("protect"),
        disabled: readOnly || preserveOnly,
        disabledReason: preserveOnly
          ? t("document.capability.editableSmartArtUnavailable")
          : undefined,
        testId: "presentation-context-lock",
        onSelect: () => {
          toggleBlockLock(blockId);
        },
      },
      contextMenuSeparator("link"),
      ...(isVideo ? [] : [links.link]),
      contextMenuSeparator("format"),
      {
        id: "alt-text",
        label: desktopMenuLabel("viewAltText"),
        icon: officeContextMenuIcon("altText"),
        disabled: selectedBlockIds.size > 1,
        disabledReason: t("presentation.altTextSingleOnly"),
        testId: "presentation-context-alt-text",
        onSelect: openAltTextPane,
      },
      ...(isPicture && !isGraphic
        ? ([
            {
              id: "crop",
              label: desktopMenuLabel("crop"),
              icon: officeContextMenuIcon("crop"),
              disabled: !croppable,
              disabledReason: cropReason,
              testId: "presentation-context-crop",
              onSelect: () => setPictureCropMode(blockId, "toggle"),
            },
          ] satisfies PointerContextMenuAction[])
        : []),
      {
        id: "size-and-position",
        label: t("presentation.smartartContext.menu.sizeAndPosition"),
        icon: officeContextMenuIcon("formatObject"),
        testId: "presentation-context-size-and-position",
        
        // it kept the page last shown, a picture's Picture page).
        onSelect: openFormatPaneAtSize,
      },
      {
        id: "format-object",
        label: desktopMenuLabel(
          isGraphic ? "formatGraphic" : isPicture ? "formatPicture" : isVideo ? "formatVideo" : "formatShape",
        ),
        icon: officeContextMenuIcon("formatObject"),
        testId: "presentation-context-format-object",
        onSelect: openFormatPane,
      },
      contextMenuSeparator("action"),
      links.action,
      contextMenuSeparator("comment"),
      contextMenuNewCommentEntry(),
      // The product's own rows, after Office's.
      contextMenuSeparator("hide"),
      {
        id: "hide-block",
        label: t("presentation.contextMenu.hideBlock"),
        icon: officeContextMenuIcon("hide"),
        disabled: readOnly,
        testId: "presentation-context-hide-block",
        onSelect: () => {
          toggleBlockHidden(blockId, true);
        },
      },
      ...(slideHasHiddenBlock
        ? ([
            {
              id: "show-all-hidden",
              label: t("presentation.contextMenu.showAllHidden"),
              icon: officeContextMenuIcon("unhide"),
              disabled: readOnly,
              testId: "presentation-context-show-all-hidden",
              onSelect: () => {
                showAllHiddenBlocks();
              },
            },
          ] satisfies PointerContextMenuAction[])
        : []),
      contextMenuSeparator("merge"),
      {
        id: "merge-menu",
        label: t("presentation.contextMenu.mergeShapes"),
        icon: officeContextMenuIcon("mergeCells"),
        disabled: readOnly || !canMergeShapes,
        testId: "presentation-context-merge-menu",
        onSelect: () => undefined,
        submenu: (["union", "combine", "fragment", "intersect", "subtract"] as const).map(
          (mode): PointerContextMenuAction => ({
            id: `merge-${mode}`,
            label: t(`presentation.mergeShapes.${mode}` as "presentation.mergeShapes.union"),
            icon: officeContextMenuIcon("mergeCells"),
            disabled: readOnly || !canMergeShapes,
            testId: `presentation-context-merge-${mode}`,
            onSelect: () => {
              mergeSelectedShapes(mode);
            },
          }),
        ),
      },
      contextMenuSeparator("animation-painter"),
      {
        id: "animation-painter",
        label: t("presentation.animationPainter.copy"),
        icon: officeContextMenuIcon("animation"),
        disabled: readOnly,
        testId: "presentation-context-animation-painter",
        onSelect: () => {
          armAnimationPainter(blockId);
        },
      },
      contextMenuSeparator("delete"),
      {
        id: "delete",
        label: t("presentation.contextMenu.delete"),
        icon: officeContextMenuIcon("delete"),
        disabled: readOnly,
        testId: "presentation-context-delete",
        onSelect: () => {
          // The same selection rule as the Delete key.
          if (selectedBlockIdsRef.current.has(blockId)) {
            deleteLiveHomeSelection();
          } else {
            deleteBlock(blockId);
          }
        },
      },
    ];
    return isVideo && target?.type === "embed"
      ? presentationVideoContextMenuEntries(
          entries,
          videoContextMenuRows(target as PresentationEmbedBlock, writable, writeReason),
        )
      : entries;
  };
  return objectContextMenuEntries;
}
