/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The adapter the shared Shape Format tab drives for the selected presentation
 * shape (commands, values and their availability).
 *
 * Moved verbatim from the body of
 * `components/notebook/contents/PresentationWindow.tsx`: the window passes the
 * bindings it used to close over as `ctl` and calls this where the closure was.
 * No hooks run here.
 */

import { normalizeOfficeTextWarp } from "@mrnote/core/web/lib/office-text-warp.ts";
import { officeShapeDefinition } from "@mrnote/core/web/lib/office-shape-catalog.ts";
import { presentationShapeCatalogEntry, type PresentationShapeCatalogSelection } from "@mrnote/core/web/lib/presentation-shape-catalog.ts";
import { PresentationHomeShapeGallery } from "@mrnote/core/web/components/notebook/contents/ribbon/PresentationHomeShapeGallery.tsx";
import { presentationShapeKindMessageKey, type PresentationWebRibbonTab } from "../../../../lib/presentation/ribbon-tabs";
import { type ShapeKind, normalizeStrokeStyle } from "@mrnote/core/web/lib/presentation-shapes.ts";
import {
  presentationCanChangeToShape,
  presentationTextFrameCanChangeShape,
  presentationTextFrameLabelTooLong,
  presentationCanChangeShape,
  presentationShapeConversionPatch,
  presentationShapeObjectOutlineMenuDash,
  type PresentationShapeObjectPaint,
} from "@mrnote/core/web/lib/presentation-shape-style-adapter.ts";
import { blocksWithShapesChanged, presentationTextFrameHasShapeAuthority, type MergeShapesOp } from "@mrnote/core/web/lib/presentation-shape-buttons.ts";
import { canEditBlockContent, canManipulateBlock, canReorderBlock, isLockedFor } from "@mrnote/core/web/lib/presentation-text-case.ts";
import { isAnchoredConnector, rerouteConnectors } from "@mrnote/core/web/lib/presentation-connectors.ts";
import type { PresentationShapeBlock, PresentationBlock, PresentationTextBlock, PresentationTextBoxBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { officeLineWeightPxAsPointText } from "@mrnote/core/web/lib/office-line-weight.ts";
import {
  officeShapeEffectMenuValue,
  OFFICE_SHAPE_EFFECT_PRESETS,
  normalizeOfficeShapeEffectPreset,
  type OfficeShapeEffectPreset,
} from "@mrnote/core/web/lib/office-shape-effects.ts";
import { presentationWordArtStyleOf, type PresentationWordArtStyle } from "@mrnote/core/web/lib/presentation-wordart-gallery.ts";
import { patchOfficeTextPaint, type OfficeTextPaint } from "@mrnote/core/web/lib/office-text-paint.ts";
import { officeTextPaintEffect } from "@mrnote/core/web/lib/document-wordart-style-adapter.ts";
import { Spline } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { MAX_TABLE_FRAME_CM } from "@mrnote/core/web/lib/presentation-table-size.ts";
import { presentationMeasurementCmDraft, type PresentationMeasurementUnit } from "@mrnote/core/web/lib/presentation-measurement.ts";
import type { OfficeShapeFormatAdapter, OfficeShapeFormatLabels } from "@/components/office-ribbon/OfficeShapeFormatTab";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { OfficeShapeStyleRecipe } from "@mrnote/core/web/lib/office-shape-style-catalog.ts";
import type { OfficeWordArtRecipe } from "@mrnote/core/web/lib/office-wordart-style-catalog.ts";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { PresentationFrameAxis } from "../../../../lib/presentation/window-helpers";
import type { OfficeEditPath } from "@mrnote/core/web/lib/office-custom-path-edit.ts";
import type { ResolvedPresentationFeatureCommand } from "@mrnote/core/web/components/notebook/contents/ribbon/commandRegistry.ts";
import type { OfficeLineEndsState } from "@mrnote/core/web/lib/office-line-ends.ts";
import type { OfficeAlignMenuSectionLabels, OfficeObjectAlignAction } from "@mrnote/core/web/components/office-ribbon/OfficeObjectArrangeMenuItems.tsx";
import type { RegroupRecord } from "../../../../lib/presentation-regroup";
import type { JSX } from "react/jsx-runtime";

/** The window bindings this reads, passed through unchanged. */
export interface BuildPresentationShapeFormatAdapterCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  /** Office's whole Shape Effects menu over the selected shapes (their combinable `shapeEffects`). */
  renderShapeEffectsMenu: (trigger: { label: string; displayLabel?: string; testId: string; controlId?: string }) => ReactNode;
  renderTextEffectsMenu: (trigger: { label: string; displayLabel?: string; testId: string; controlId?: string; extra?: ReactNode }) => ReactNode;
  sizeUnit: PresentationMeasurementUnit;
  sizeStep: number;
  sizeBound: (centimetres: number) => number;
  setShapeFrameAspectLock: Dispatch<SetStateAction<{ blockIds: readonly string[]; locked: boolean; } | null>>;
  selectionPaneReturnFocusRef: RefObject<HTMLElement | null>;
  openAltTextPane: () => void;
  setShapeArrowsDialogOpen: Dispatch<SetStateAction<boolean>>;
  shapeFormatRecentColors: string[];
  setEditPointsBlockId: Dispatch<SetStateAction<string | null>>;
  selectedBlockIdsRef: RefObject<ReadonlySet<string>>;
  getSingleLiveSelectedBlock: () => PresentationBlock | null;
  shapeStyleRecipes: readonly OfficeShapeStyleRecipe[];
  deckWordArtStyles: readonly PresentationWordArtStyle[];
  deckWordArtRecipes: readonly OfficeWordArtRecipe[];
  wordArtStyleLabel: (id: string) => string;
  contextualShapeObjectBlocks: readonly PresentationBlock[];
  contextualTextBoxBlock: PresentationTextBoxBlock | null;
  contextualShapeSelectionIsWritable: boolean;
  contextualShapeObjectBlock: PresentationTextBoxBlock | PresentationShapeBlock | null;
  contextualShapeObjectSelectionIsWritable: boolean;
  contextualShapeObjectOutlineSelectionIsWritable: boolean;
  contextualShapeObjectSupportsFill: boolean;
  contextualShapeStyleSelectionIsEligible: boolean;
  contextualShapeObjectMatchesStyle: (recipe: OfficeShapeStyleRecipe) => boolean;
  contextualShapeSelectionHasInheritedPlaceholder: boolean;
  contextualShapeFrameSizeEditable: boolean;
  contextualShapeFrameSizeWidthDisplay: string | null;
  contextualShapeFrameSizeHeightDisplay: string | null;
  shapeFrameAspectLocked: boolean;
  toggleFormatPane: () => void;
  openFormatPaneAtSize: () => void;
  /** Format Shape at its Fill & Line page (Shape Fill > More Gradients…). */
  openFormatPaneAtShape: () => void;
  /** Shape Fill > Picture…: the picture-fill file picker for one shape. */
  beginShapeFillImageUpload: (blockId: string) => void;
  selectedGeometryBlocks: PresentationBlock[];
  commitLiveActiveBlocks: (transform: (blocks: PresentationBlock[], slide: SlideModel) => PresentationBlock[] | null, coalesceKey?: string) => boolean;
  commitContextualShapeFrameSize: (axis: PresentationFrameAxis, rawValue: string) => boolean;
  canFlipSelection: boolean;
  groupSelectedBlocks: () => void;
  ungroupSelectedBlocks: () => void;
  regroupSelectedBlocks: () => void;
  openReorderObjects: (overlappingOnly: boolean) => void;
  canGroupSelectedShapes: boolean;
  canUngroupSelectedShapes: boolean;
  contextualShapeLayerCapability: Readonly<{ canMoveBackward: boolean; canMoveForward: boolean; }>;
  contextualShapeLayerDisabledReason: { forward: string | undefined; backward: string | undefined; };
  mergeShapesSelectionUnmergeable: boolean;
  canMergeShapes: boolean;
  mergeSelectedShapes: (op: MergeShapesOp) => void;
  bringBlockToFront: (explicitId?: string, explicitOnly?: boolean) => void;
  sendBlockToBack: (explicitId?: string, explicitOnly?: boolean) => void;
  bringBlockForward: (explicitId?: string, explicitOnly?: boolean, sourceFreeOnly?: boolean, explicitIds?: readonly string[]) => void;
  sendBlockBackward: (explicitId?: string, explicitOnly?: boolean, sourceFreeOnly?: boolean, explicitIds?: readonly string[]) => void;
  insertTextBox: (writingMode?: "vertical-rl") => void;
  updateShapeBlock: (blockId: string, patch: Partial<PresentationShapeBlock>) => boolean;
  presentationShapeEditPath: (block: PresentationShapeBlock) => OfficeEditPath | null;
  convertTextFrameToShape: (blockId: string, kind: ShapeKind) => boolean;
  applyShapeStyleRecipe: (recipe: OfficeShapeStyleRecipe) => boolean;
  updateLiveSelectedShapeObjects: (paint: PresentationShapeObjectPaint) => boolean;
  commitContextualShapeOutlineWidth: (rawPointValue: string) => boolean;
  connectableShapePair: [PresentationShapeBlock, PresentationShapeBlock] | null;
  connectSelectedShapes: () => void;
  featureDecision: (featureId: string) => ResolvedPresentationFeatureCommand;
  executePresentationFeature: (featureId: string) => undefined;
  executeHomeShapeInsert: (selection: PresentationShapeCatalogSelection) => void;
  ribbonShapeKind: "sort" | "cube" | "diamond" | "plus" | "rectangle" | "ellipse" | "line" | "arrow" | "double-arrow" | "elbow-connector" | "elbow-arrow-connector" | "elbow-double-arrow-connector" | "curved-connector" | "curved-arrow-connector" | "curved-double-arrow-connector" | "elbow-connector-2" | "elbow-connector-4" | "elbow-connector-5" | "curved-connector-2" | "curved-connector-4" | "curved-connector-5" | "straight-connector" | "line-inverse" | "rounded-rectangle" | "single-round-corner" | "same-side-corners-rounded" | "diagonal-corners-rounded" | "single-corner-snipped" | "same-side-corners-snipped" | "diagonal-corners-snipped" | "single-corner-rounded-snipped" | "math-plus" | "math-minus" | "math-multiply" | "math-divide" | "math-equal" | "math-not-equal" | "triangle" | "pentagon" | "hexagon" | "star" | "star4" | "star6" | "star7" | "star8" | "star10" | "star12" | "star16" | "star24" | "star32" | "explosion-1" | "explosion-2" | "up-ribbon" | "down-ribbon" | "curved-up-ribbon" | "curved-down-ribbon" | "left-right-ribbon" | "vertical-scroll" | "horizontal-scroll" | "wave" | "double-wave" | "chevron" | "callout" | "parallelogram" | "trapezoid" | "right-triangle" | "octagon" | "cloud" | "heart" | "can" | "moon" | "heptagon" | "decagon" | "dodecagon" | "corner" | "chord" | "teardrop" | "sun" | "pie" | "lightning-bolt" | "non-isosceles-trapezoid" | "pie-wedge" | "half-frame" | "diagonal-stripe" | "plaque" | "bevel" | "no-symbol" | "block-arc" | "folded-corner" | "arc" | "double-bracket" | "double-brace" | "left-bracket" | "right-bracket" | "left-brace" | "right-brace" | "frame" | "donut" | "gear-6" | "gear-9" | "funnel" | "chart-plus" | "chart-star" | "chart-x" | "corner-tabs" | "square-tabs" | "plaque-tabs" | "smiley" | "right-arrow" | "left-arrow" | "up-arrow" | "down-arrow" | "left-right-arrow" | "up-down-arrow" | "bent-arrow" | "u-turn-arrow" | "quad-arrow" | "left-right-up-arrow" | "left-up-arrow" | "bent-up-arrow" | "curved-right-arrow" | "curved-left-arrow" | "curved-up-arrow" | "curved-down-arrow" | "striped-right-arrow" | "notched-right-arrow" | "home-plate" | "right-arrow-callout" | "down-arrow-callout" | "left-arrow-callout" | "up-arrow-callout" | "left-right-arrow-callout" | "quad-arrow-callout" | "circular-arrow" | "left-circular-arrow" | "left-right-circular-arrow" | "swoosh-arrow" | "up-down-arrow-callout" | "terminator" | "document" | "alternate-process" | "card" | "collate" | "flowchart-connector" | "data" | "decision" | "delay" | "direct-access-storage" | "display" | "extract" | "internal-storage" | "magnetic-disk" | "manual-input" | "manual-operation" | "merge" | "multiple-documents" | "offline-storage" | "off-page-connector" | "flowchart-or" | "flowchart-summing-junction" | "predefined-process" | "preparation" | "process" | "punched-tape" | "sequential-access-storage" | "stored-data" | "rectangle-callout" | "oval-callout" | "cloud-callout" | "border-callout-1" | "border-callout-2" | "border-callout-3" | "accent-callout-1" | "accent-callout-2" | "accent-callout-3" | "callout-1" | "callout-2" | "callout-3" | "accent-border-callout-1" | "accent-border-callout-2" | "accent-border-callout-3" | "action-button-back-previous" | "action-button-forward-next" | "action-button-beginning" | "action-button-end" | "action-button-home" | "action-button-information" | "action-button-return" | "action-button-movie" | "action-button-document" | "action-button-sound" | "action-button-help" | "action-button-custom" | "custom-geometry" | "ink" | null;
  contextualChangeShapeEnabled: boolean;
  contextualChangeShapeDisabledReason: string | undefined;
  contextualShapeObjectFill: string | null;
  contextualShapeObjectOutline: string | null;
  contextualShapeObjectOutlineWidthValue: number | null;
  contextualShapeObjectOutlineStyleValue: "solid" | "dashed" | "dotted" | null;
  contextualShapeObjectShadow: boolean | null;
  contextualShapeObjectEffect: OfficeShapeEffectPreset | null;
  insertCapacityReached: boolean;
  activeRibbonTab: PresentationWebRibbonTab;
  shapeArrowValue: OfficeLineEndsState | null;
  shapeArrowsEnabled: boolean;
  shapeArrowsDisabledReason: string | undefined;
  applyShapeLineEnds: (ends: OfficeLineEndsState) => void;
  shapeGroupDisabledReason: string | undefined;
  arrangeAlignSections: OfficeAlignMenuSectionLabels;
  arrangeAlignIsDisabled: (action: OfficeObjectAlignAction) => boolean;
  runArrangeAlign: (action: OfficeObjectAlignAction) => void;
  arrangeAlignTarget: (testIds: { target?: string; selected?: string; }) => { toTarget: boolean; targetLabel: string; selectedLabel: string; selectedDisabled: boolean; onChange: (next: boolean) => void; targetTestId: string | undefined; selectedTestId: string | undefined; };
  arrangeRegroupRecord: RegroupRecord | null;
  arrangeReorderAvailable: boolean;
  arrangeReorderOverlappingAvailable: boolean;
  presentationArrangeMenuProps: { labels: { reorderObjects: string; reorderOverlapping: string; orderObjects: string; bringToFront: string; sendToBack: string; bringForward: string; sendBackward: string; groupObjects: string; group: string; ungroup: string; regroup: string; positionObjects: string; align: string; rotate: string; selectionPane: string; alignSections: OfficeAlignMenuSectionLabels; alignAction: (action: OfficeObjectAlignAction) => string; rotateAction: (action: "rotateRight90" | "rotateLeft90" | "flipVertical" | "flipHorizontal") => string; moreRotationOptions: string; }; icons: { bringToFront: JSX.Element; sendToBack: JSX.Element; bringForward: JSX.Element; sendBackward: JSX.Element; group: JSX.Element; ungroup: JSX.Element; align: JSX.Element; rotate: JSX.Element; selectionPane: JSX.Element; }; reorder: { disabled: boolean; disabledReason: string; onSelect: () => void; }; reorderOverlapping: { disabled: boolean; disabledReason: string; onSelect: () => void; }; order: { isDisabled: (action: "bringToFront" | "sendToBack" | "bringForward" | "sendBackward") => boolean; onAction: (action: "bringToFront" | "sendToBack" | "bringForward" | "sendBackward") => void; }; group: { disabled: boolean; disabledReason: string; onSelect: () => void; }; ungroup: { disabled: boolean; disabledReason: string; onSelect: () => void; }; regroup: { disabled: boolean; disabledReason: string; onSelect: () => void; }; align: { disabled: boolean; isDisabled: (action: OfficeObjectAlignAction) => boolean; onAction: (action: OfficeObjectAlignAction) => void; target: { toTarget: boolean; targetLabel: string; selectedLabel: string; selectedDisabled: boolean; onChange: (next: boolean) => void; targetTestId: string | undefined; selectedTestId: string | undefined; }; }; rotate: { disabled: boolean; onAction: (action: "rotateRight90" | "rotateLeft90" | "flipVertical" | "flipHorizontal") => void; more: { disabled: boolean; onSelect: () => void; }; }; selectionPane: { disabled: boolean; controlId: string; onSelect: () => undefined; }; };
  shapeOutlineWeightField: JSX.Element | null;
  applyShapeFormatColor: (field: "fill" | "stroke", color: string | null) => void;
  shapeFormatThemeColumns: readonly (readonly string[])[];
  shapeFormatReadOnlyReason: string | undefined;
  shapeTabTextPaint: OfficeTextPaint | null;
  shapeTabWordArtReason: string | undefined;
  /** Text Fill / Outline / Effects on the characters the group acts on:
   * each run's own paint edited (the selected ones while typed in). */
  editShapeTabTextPaint: (edit: (paint: OfficeTextPaint) => OfficeTextPaint | null) => void;
  /** A WordArt gallery style on the characters the group acts on. */
  writeShapeTabWordArtStyle: (style: PresentationWordArtStyle) => void;
  presentationShapeFormatLabels: () => OfficeShapeFormatLabels;
}

export function buildPresentationShapeFormatAdapter(ctl: BuildPresentationShapeFormatAdapterCtl): OfficeShapeFormatAdapter | null {
  const {
    t,
    renderShapeEffectsMenu,
    renderTextEffectsMenu,
    sizeUnit,
    sizeStep,
    sizeBound,
    setShapeFrameAspectLock,
    selectionPaneReturnFocusRef,
    openAltTextPane,
    setShapeArrowsDialogOpen,
    shapeFormatRecentColors,
    setEditPointsBlockId,
    selectedBlockIdsRef,
    getSingleLiveSelectedBlock,
    shapeStyleRecipes,
    deckWordArtStyles,
    deckWordArtRecipes,
    wordArtStyleLabel,
    contextualShapeObjectBlocks,
    contextualTextBoxBlock,
    contextualShapeSelectionIsWritable,
    contextualShapeObjectBlock,
    contextualShapeObjectSelectionIsWritable,
    contextualShapeObjectOutlineSelectionIsWritable,
    contextualShapeObjectSupportsFill,
    contextualShapeStyleSelectionIsEligible,
    contextualShapeObjectMatchesStyle,
    contextualShapeSelectionHasInheritedPlaceholder,
    contextualShapeFrameSizeEditable,
    contextualShapeFrameSizeWidthDisplay,
    contextualShapeFrameSizeHeightDisplay,
    shapeFrameAspectLocked,
    toggleFormatPane,
    openFormatPaneAtSize,
    openFormatPaneAtShape,
    beginShapeFillImageUpload,
    selectedGeometryBlocks,
    commitLiveActiveBlocks,
    commitContextualShapeFrameSize,
    canFlipSelection,
    groupSelectedBlocks,
    ungroupSelectedBlocks,
    regroupSelectedBlocks,
    openReorderObjects,
    canGroupSelectedShapes,
    canUngroupSelectedShapes,
    contextualShapeLayerCapability,
    contextualShapeLayerDisabledReason,
    mergeShapesSelectionUnmergeable,
    canMergeShapes,
    mergeSelectedShapes,
    bringBlockToFront,
    sendBlockToBack,
    bringBlockForward,
    sendBlockBackward,
    insertTextBox,
    updateShapeBlock,
    presentationShapeEditPath,
    convertTextFrameToShape,
    applyShapeStyleRecipe,
    updateLiveSelectedShapeObjects,
    commitContextualShapeOutlineWidth,
    connectableShapePair,
    connectSelectedShapes,
    featureDecision,
    executePresentationFeature,
    executeHomeShapeInsert,
    ribbonShapeKind,
    contextualChangeShapeEnabled,
    contextualChangeShapeDisabledReason,
    contextualShapeObjectFill,
    contextualShapeObjectOutline,
    contextualShapeObjectOutlineWidthValue,
    contextualShapeObjectOutlineStyleValue,
    contextualShapeObjectShadow,
    contextualShapeObjectEffect,
    insertCapacityReached,
    activeRibbonTab,
    shapeArrowValue,
    shapeArrowsEnabled,
    shapeArrowsDisabledReason,
    applyShapeLineEnds,
    shapeGroupDisabledReason,
    arrangeAlignSections,
    arrangeAlignIsDisabled,
    runArrangeAlign,
    arrangeAlignTarget,
    arrangeRegroupRecord,
    arrangeReorderAvailable,
    arrangeReorderOverlappingAvailable,
    presentationArrangeMenuProps,
    shapeOutlineWeightField,
    applyShapeFormatColor,
    shapeFormatThemeColumns,
    shapeFormatReadOnlyReason,
    shapeTabTextPaint,
    shapeTabWordArtReason,
    editShapeTabTextPaint,
    writeShapeTabWordArtStyle,
    presentationShapeFormatLabels,
  } = ctl;
  return activeRibbonTab === "shape-format" && contextualShapeObjectBlock
      ? {
          application: "presentation",
          labels: presentationShapeFormatLabels(),
          insert: {
            disabled: !featureDecision("drawing.shape").enabled,
            recentStorageKey: "mrai.presentation.shapeFormat.recent",
            onInsert: (preset) => {
              const kind = officeShapeDefinition(preset).previewKind;
              if (!presentationShapeCatalogEntry(kind)) return false;
              executeHomeShapeInsert(kind);
              return true;
            },
            renderCatalog: () => (
              <PresentationHomeShapeGallery
                disabled={!featureDecision("drawing.shape").enabled}
                labelFor={(kind) =>
                  t(`presentation.shape.${kind}` as "presentation.shape.rectangle")
                }
                onSelect={(selection) => {
                  executeHomeShapeInsert(selection);
                }}
              />
            ),
          },
          changeShape: {
            disabled: !contextualChangeShapeEnabled,
            disabledReason: contextualChangeShapeDisabledReason,
            mixed: contextualTextBoxBlock === null && ribbonShapeKind === null,
            recentStorageKey: "mrai.presentation.shapeFormat.change",
            onChange: () => false,
            renderCatalog: () => (
              <PresentationHomeShapeGallery
                mode="change"
                // A text frame draws the rectangle its layout gives it, so
                // the catalog shows Rectangle as its current preset -- the
                // same reading the sheet uses for a text box.
                selectedKind={contextualTextBoxBlock ? "rectangle" : ribbonShapeKind}
                labelFor={(selection) =>
                  t(presentationShapeKindMessageKey(selection as ShapeKind))
                }
                onSelect={(selection) => {
                  if (!presentationCanChangeToShape(selection as ShapeKind)) {
                    return false;
                  }
                  if (selectedBlockIdsRef.current.size > 1) {
                    return commitLiveActiveBlocks((blocks) =>
                      blocksWithShapesChanged(
                        blocks,
                        selectedBlockIdsRef.current,
                        selection as ShapeKind,
                      ),
                    );
                  }
                  const live = getSingleLiveSelectedBlock();
                  if (!live || isLockedFor(live, "changeShape")) {
                    return false;
                  }
                  if (live.type === "text") {
                    return presentationTextFrameHasShapeAuthority(live) &&
                      presentationTextFrameCanChangeShape(live) &&
                      !presentationTextFrameLabelTooLong(live)
                      ? convertTextFrameToShape(live.id, selection as ShapeKind)
                      : false;
                  }
                  if (
                    live.type !== "shape" ||
                    !presentationCanChangeShape(live) ||
                    live.shape === selection
                  ) {
                    return false;
                  }
                  return updateShapeBlock(
                    live.id,
                    presentationShapeConversionPatch(selection as ShapeKind, live as PresentationShapeBlock),
                  );
                }}
              />
            ),
          },
          // PowerPoint's Edit Shape: Change Shape ▸, Edit Points, Reroute
          // Connectors (PPT-A124).
          changeShapeSubmenu: true,
          rerouteConnectors: (() => {
            const connectorIds = new Set(
              contextualShapeObjectBlocks.filter((block) => isAnchoredConnector(block)).map((block) => block.id),
            );
            return connectorIds.size > 0 &&
              contextualShapeObjectSelectionIsWritable &&
              contextualShapeObjectBlocks.every((block) => !connectorIds.has(block.id) || canManipulateBlock(block))
              ? {
                  onSelect: () => {
                    commitLiveActiveBlocks((blocks) => rerouteConnectors(blocks, connectorIds));
                  },
                }
              : {
                  onSelect: () => undefined,
                  disabled: true,
                  disabledReason:
                    shapeFormatReadOnlyReason ?? t("presentation.ui.shapeFormat.rerouteConnectorsUnavailable"),
                };
          })(),
          editPoints:
            contextualShapeObjectBlocks.length === 1 &&
            contextualShapeObjectBlocks[0].type === "shape" &&
            contextualShapeObjectSelectionIsWritable &&
            !isLockedFor(contextualShapeObjectBlocks[0], "editPoints") &&
            presentationShapeEditPath(contextualShapeObjectBlocks[0] as PresentationShapeBlock)
              ? {
                  onSelect: () => setEditPointsBlockId(contextualShapeObjectBlocks[0].id),
                }
              : {
                  onSelect: () => undefined,
                  disabled: true,
                  disabledReason: shapeFormatReadOnlyReason ?? t("presentation.ui.shapeFormat.noSingleOutline"),
                },
          // PowerPoint for Mac's Text Box ▾: Draw Horizontal Text Box /
          // Vertical Text Box (an East Asian vertical frame, `vert="eaVert"`).
          textBox: {
            directions: ["horizontal", "rotate90"],
            disabled:
              insertCapacityReached || !featureDecision("drawing.textBox").enabled,
            onInsert: (direction) =>
              insertTextBox(direction === "rotate90" ? "vertical-rl" : undefined),
          },
          // Insert Shapes ▸ Merge Shapes ▾ (PPT-A113): the same engine and
          // the same two-shape rule as the context menu's Merge Shapes, in
          // PowerPoint's order -- Union, Fragment, Intersect, Subtract.
          // PowerPoint's five, in its order: Union, Combine, Fragment,
          // Intersect, Subtract (Microsoft Support, "Combine shapes").
          mergeShapes: {
            label: t("presentation.contextMenu.mergeShapes"),
            disabled: !canMergeShapes,
            disabledReason: canMergeShapes
              ? undefined
              : mergeShapesSelectionUnmergeable
                ? t("presentation.ui.contextMenu.shapesCannotMerge")
                : t("presentation.ui.contextMenu.selectTwoShapes"),
            items: (["union", "combine", "fragment", "intersect", "subtract"] as const).map(
              (mode) => ({
                key: mode,
                label: t(
                  `presentation.mergeShapes.${mode}` as "presentation.mergeShapes.union",
                ),
                onSelect: () => mergeSelectedShapes(mode),
              }),
            ),
          },
          styles: {
            quickCount: 7,
            // PowerPoint's strip opens on the Subtle Effect row (PPT-A115).
            quickRow: "light-gradient",
            recipes: shapeStyleRecipes,
            value: shapeStyleRecipes.find(contextualShapeObjectMatchesStyle)?.id ?? null,
            disabled: !contextualShapeStyleSelectionIsEligible,
            // A greyed gallery says why (import audit P5): read-only, an
            // outline the original keeps as it is, or nothing to paint.
            disabledReason: contextualShapeStyleSelectionIsEligible
              ? undefined
              : (shapeFormatReadOnlyReason ??
                (contextualShapeObjectOutlineSelectionIsWritable
                  ? t("presentation.shapeFillUnavailable")
                  : t("presentation.shapeOutlinePreserved"))),
            onCommit: applyShapeStyleRecipe,
          },
          fill: {
            value:
              contextualShapeObjectFill === null ? undefined : contextualShapeObjectFill,
            mixed: contextualShapeObjectFill === null,
            mixedReason: t("toolbar.fontPickerMixed"),
            themeColumns: shapeFormatThemeColumns,
            recents: shapeFormatRecentColors,
            disabled:
              !contextualShapeObjectSelectionIsWritable ||
              !contextualShapeObjectSupportsFill,
            disabledReason:
              shapeFormatReadOnlyReason ??
              (contextualShapeObjectSupportsFill
                ? undefined
                : t("presentation.shapeFillUnavailable")),
            onPick: (color) => applyShapeFormatColor("fill", color),
            // Office's rows under the colours: Picture… and More Gradients…
            extras: [
              {
                id: "picture",
                label: t("office.shapeFill.picture"),
                disabled:
                  !contextualShapeObjectSelectionIsWritable ||
                  contextualShapeObjectBlocks.length !== 1 ||
                  contextualShapeObjectBlocks[0]?.type !== "shape",
                disabledReason: shapeFormatReadOnlyReason ?? t("presentation.shapeFillUnavailable"),
                onSelect: () => {
                  const block = contextualShapeObjectBlocks[0];
                  if (block?.type === "shape") beginShapeFillImageUpload(block.id);
                },
              },
              {
                id: "more-gradients",
                label: t("office.shapeFill.moreGradients"),
                onSelect: openFormatPaneAtShape,
              },
            ],
          },
          outline: {
            value:
              contextualShapeObjectOutline === null
                ? undefined
                : contextualShapeObjectOutline,
            mixed: contextualShapeObjectOutline === null,
            mixedReason: t("toolbar.fontPickerMixed"),
            themeColumns: shapeFormatThemeColumns,
            recents: shapeFormatRecentColors,
            disabled:
              !contextualShapeObjectSelectionIsWritable ||
              !contextualShapeObjectOutlineSelectionIsWritable,
            disabledReason:
              shapeFormatReadOnlyReason ??
              (contextualShapeObjectOutlineSelectionIsWritable
                ? undefined
                : t("presentation.shapeOutlinePreserved")),
            onPick: (color) => applyShapeFormatColor("stroke", color),
            weightPt:
              contextualShapeObjectOutlineWidthValue === null
                ? null
                : Number(
                    officeLineWeightPxAsPointText(contextualShapeObjectOutlineWidthValue),
                  ),
            onWeight: (pt) => {
              commitContextualShapeOutlineWidth(String(pt));
            },
            weight: {
              disabled: !contextualShapeObjectOutlineSelectionIsWritable,
              disabledReason: contextualShapeObjectOutlineSelectionIsWritable
                ? shapeFormatReadOnlyReason
                : (shapeFormatReadOnlyReason ?? t("presentation.shapeOutlinePreserved")),
            },
            weightField: shapeOutlineWeightField,
            // Office's eight Dashes, on autoshapes and text frames alike (a
            // frame keeps the family, the menu shows what it draws).
            dashes: {
              value: (() => {
                const dashes = contextualShapeObjectBlocks
                  .filter(
                    (block): block is PresentationShapeBlock | PresentationTextBlock =>
                      block.type === "shape" || block.type === "text",
                  )
                  .map(presentationShapeObjectOutlineMenuDash);
                return dashes.length && dashes.every((dash) => dash === dashes[0]) ? dashes[0]! : null;
              })(),
              onPick: (dash) => updateLiveSelectedShapeObjects({ outlineDash: dash }),
              optionLabel: (dash) =>
                t(`presentation.officeGraphic.dash.${dash}` as "presentation.officeGraphic.dash.solid"),
            },
            // Shape Outline > Sketched, on a deck shape's line.
            sketched: {
              label: t("office.outline.sketched"),
              value: (() => {
                const sketches = contextualShapeObjectBlocks.map((block) =>
                  block.type === "shape" ? ((block as PresentationShapeBlock).outlineSketch ?? "none") : "none",
                );
                return sketches.length && sketches.every((sketch) => sketch === sketches[0]) ? sketches[0]! : "none";
              })(),
              disabled:
                !contextualShapeObjectOutlineSelectionIsWritable ||
                !contextualShapeObjectBlocks.every((block) => block.type === "shape"),
              disabledReason: shapeFormatReadOnlyReason ?? t("presentation.shapeEffectsUnavailable"),
              onPick: (sketch) => updateLiveSelectedShapeObjects({ outlineSketch: sketch }),
              optionLabel: (sketch) => t(`office.outline.sketch.${sketch}` as "office.outline.sketch.none"),
            },
            lineStyle: contextualShapeObjectOutlineStyleValue ?? null,
            onLineStyle: (style) => {
              const next = normalizeStrokeStyle(style);
              if (next === contextualShapeObjectOutlineStyleValue) return;
              updateLiveSelectedShapeObjects({ outlineStyle: next });
            },
            lineStyleCapability: {
              disabled: !contextualShapeObjectOutlineSelectionIsWritable,
              disabledReason: contextualShapeObjectOutlineSelectionIsWritable
                ? shapeFormatReadOnlyReason
                : (shapeFormatReadOnlyReason ?? t("presentation.shapeOutlinePreserved")),
            },
            lineEnds: shapeArrowValue,
            onLineEnds: applyShapeLineEnds,
            lineEndsCapability: {
              disabled: !shapeArrowsEnabled,
              disabledReason: shapeArrowsDisabledReason,
            },
            onMoreArrows: () => setShapeArrowsDialogOpen(true),
          },
          // Shape Effects: Shadow on the host's own flag, the five other
          // presets on the block's `effect` (autoshapes only; a text frame's
          // effect list is its shadow).
          effects: {
            value: officeShapeEffectMenuValue(
              contextualShapeObjectEffect,
              contextualShapeObjectShadow === true,
            ),
            available: contextualShapeObjectBlocks.every((block) => block.type === "shape")
              ? ["none", "shadow", ...OFFICE_SHAPE_EFFECT_PRESETS]
              : ["none", "shadow"],
            unavailableReason: t("presentation.shapeEffectsUnavailable"),
            disabled: !contextualShapeObjectSelectionIsWritable,
            disabledReason: shapeFormatReadOnlyReason,
            // PowerPoint's Shape Effects cascade (PPT-A116).
            cascade: {
              presets: t("office.shapeEffects.presets"),
              category: (effect) =>
                effect === "threeD"
                  ? t("office.shapeEffects.threeDRotation")
                  : t(
                      `toolbar.shapeFormatOption.effect.${effect}` as "toolbar.shapeFormatOption.effect.none",
                    ),
              none: (effect) =>
                t(`office.shapeEffects.none.${effect}` as "office.shapeEffects.none.shadow"),
            },
            onPick: (effect) =>
              updateLiveSelectedShapeObjects({
                shadow: effect === "shadow",
                effect: normalizeOfficeShapeEffectPreset(effect),
              }),
            // Shapes keep Office's combinable effects: the whole cascade, every
            // variation. A text frame's effect list is its shadow (the list above).
            ...(contextualShapeObjectBlocks.length > 0 &&
            contextualShapeObjectBlocks.every((block) => block.type === "shape")
              ? { render: renderShapeEffectsMenu }
              : {}),
          },
          // WordArt Styles: PowerPoint's twenty under the deck's theme
          // (PPT-A059), on the selected text box's or shape's words.
          wordArt: {
            recipes: deckWordArtRecipes,
            labelFor: (recipe) => wordArtStyleLabel(recipe.id),
            sample: "Aa",
            value: (() => {
              const item = presentationWordArtStyleOf(shapeTabTextPaint);
              return item ? `ppt-wordart-${item}` : null;
            })(),
            disabled: Boolean(shapeTabWordArtReason),
            disabledReason: shapeTabWordArtReason,
            onCommit: (recipe) => {
              const style = deckWordArtStyles.find((candidate) => candidate.id === recipe.id);
              if (style) writeShapeTabWordArtStyle(style);
            },
          },
          textFill: {
            value: shapeTabTextPaint?.fill,
            disabled: Boolean(shapeTabWordArtReason),
            disabledReason: shapeTabWordArtReason,
            onPick: (color) =>
              editShapeTabTextPaint((paint) => patchOfficeTextPaint(paint, { fill: color ?? "none" })),
          },
          textOutline: {
            value: shapeTabTextPaint?.outline === "none" ? undefined : shapeTabTextPaint?.outline,
            disabled: Boolean(shapeTabWordArtReason),
            disabledReason: shapeTabWordArtReason,
            onPick: (color) =>
              editShapeTabTextPaint((paint) =>
                patchOfficeTextPaint(paint, {
                  outline: color ?? "none",
                  outlineWidthPt: color ? 1 : 0,
                }),
              ),
          },
          textEffects: {
            value: officeTextPaintEffect(shapeTabTextPaint),
            available: ["none", "shadow", "reflection", "glow", "bevel"],
            unavailableReason: t("presentation.ui.shapeFormat.effectNoWriter"),
            disabled: Boolean(shapeTabWordArtReason),
            disabledReason: shapeTabWordArtReason,
            onPick: (effect) =>
              editShapeTabTextPaint((paint) => patchOfficeTextPaint(paint, { effect })),
            render: renderTextEffectsMenu,
          },
          // Text Effects > Transform: the words' preset warp on each selected
          // shape or text box, as PowerPoint applies it.
          textTransform: {
            value: (() => {
              const warps = contextualShapeObjectBlocks.map(
                (block) => normalizeOfficeTextWarp((block as { textWarp?: unknown }).textWarp)?.preset ?? null,
              );
              return warps.length && warps.every((warp) => warp === warps[0]) ? warps[0]! : null;
            })(),
            disabled: !contextualShapeObjectSelectionIsWritable,
            disabledReason: shapeFormatReadOnlyReason,
            labels: {
              transform: t("office.textTransform.transform"),
              noTransform: t("office.textTransform.none"),
              followPath: t("office.textTransform.followPath"),
              warp: t("office.textTransform.warp"),
              name: (token) => t(`office.textTransform.name.${token}` as "office.textTransform.name.textPlain"),
            },
            onPick: (token) => {
              const ids = new Set(contextualShapeObjectBlocks.map((block) => block.id));
              commitLiveActiveBlocks((blocks) => {
                let changed = false;
                const next = blocks.map((block) => {
                  if (!ids.has(block.id) || (block.type !== "shape" && block.type !== "text")) return block;
                  const current = normalizeOfficeTextWarp((block as { textWarp?: unknown }).textWarp)?.preset ?? null;
                  if (current === token) return block;
                  changed = true;
                  const copy = { ...block } as Record<string, unknown>;
                  delete copy.textWarp;
                  if (token) copy.textWarp = { preset: token };
                  return copy as unknown as PresentationBlock;
                });
                return changed ? next : null;
              });
            },
          },
          altText: {
            active: false,
            disabled:
              contextualShapeObjectBlocks.length !== 1 ||
              !contextualShapeObjectSelectionIsWritable,
            // Alt Text describes ONE object, so PowerPoint keeps it
            // single-object too. Say which of the two reasons it is.
            disabledReason:
              contextualShapeObjectBlocks.length > 1
                ? t("presentation.altTextSingleOnly")
                : shapeFormatReadOnlyReason,
            onOpen: openAltTextPane,
          },
          zOrder: {
            // Lock fixes an object's place, not its depth (PowerPoint); an
            
            disabled:
              !contextualShapeObjectSelectionIsWritable ||
              !contextualShapeObjectBlocks.every((block) => canReorderBlock(block)),
            disabledReason: shapeFormatReadOnlyReason,
            atBoundary: (action) =>
              action === "bringForward" || action === "bringToFront"
                ? !contextualShapeLayerCapability.canMoveForward
                : !contextualShapeLayerCapability.canMoveBackward,
            disabledReasonFor: (action) =>
              shapeFormatReadOnlyReason ??
              (action === "bringForward" || action === "bringToFront"
                ? contextualShapeLayerDisabledReason.forward
                : contextualShapeLayerDisabledReason.backward),
            onAction: (action) => {
              if (action === "bringForward") bringBlockForward();
              else if (action === "bringToFront") bringBlockToFront();
              else if (action === "sendBackward") sendBlockBackward();
              else sendBlockToBack();
            },
          },
          selectionPane: {
            disabled: !featureDecision("editing.selectionPane").enabled,
            onSelect: () => {
              selectionPaneReturnFocusRef.current =
                document.activeElement instanceof HTMLButtonElement
                  ? document.activeElement
                  : null;
              executePresentationFeature("editing.selectionPane");
            },
          },
          selectionCount: {
            count: selectedGeometryBlocks.length,
            label: t("presentation.align.selectionCount", {
              count: selectedGeometryBlocks.length,
            }),
          },
          reorder: {
            label: t("presentation.arrange.reorderObjects"),
            overlappingLabel: t("presentation.arrange.reorderOverlapping"),
            disabled: !arrangeReorderAvailable,
            disabledReason: t("presentation.arrange.reorderNeedsTwo"),
            overlappingDisabled: !arrangeReorderOverlappingAvailable,
            onReorder: () => openReorderObjects(false),
            onReorderOverlapping: () => openReorderObjects(true),
          },
          alignObjects: {
            disabled: !canFlipSelection,
            // PowerPoint's sectioned Align menu (PPT-A120), the same body as
            // Home > Arrange > Align.
            sections: arrangeAlignSections,
            target: arrangeAlignTarget({
              target: "presentation-align-to-slide",
              selected: "presentation-align-selected",
            }),
            isActionDisabled: arrangeAlignIsDisabled,
            onAction: runArrangeAlign,
          },
          group: {
            grouped: canUngroupSelectedShapes,
            canGroup: canGroupSelectedShapes,
            canUngroup: canUngroupSelectedShapes,
            disabled:
              !canGroupSelectedShapes &&
              !canUngroupSelectedShapes &&
              connectableShapePair === null,
            disabledReason: shapeGroupDisabledReason,
            onGroup: groupSelectedBlocks,
            onUngroup: ungroupSelectedBlocks,
            regroup: {
              label: t("office.shapeContextMenu.regroup"),
              disabled: arrangeRegroupRecord === null,
              disabledReason: t("presentation.arrange.regroupUnavailable"),
              onSelect: regroupSelectedBlocks,
            },
            extra: [
              {
                key: "connect",
                testId: "presentation-connect-shapes",
                label: t("presentation.connect.connect"),
                icon: <Spline size={16} aria-hidden="true" />,
                disabled:
                  !contextualShapeSelectionIsWritable || connectableShapePair === null,
                onSelect: connectSelectedShapes,
              },
            ],
          },
          rotate: {
            disabled: !canFlipSelection,
            onAction: presentationArrangeMenuProps.rotate.onAction,
            // More Rotation Options...: Format Shape at Size & Properties (PPT-A121).
            exact: { onSelect: openFormatPaneAtSize },
          },
          size: {
            width: contextualShapeFrameSizeWidthDisplay ?? "",
            height: contextualShapeFrameSizeHeightDisplay ?? "",
            mixed: {
              width: contextualShapeFrameSizeWidthDisplay === null,
              height: contextualShapeFrameSizeHeightDisplay === null,
            },
            max: sizeBound(MAX_TABLE_FRAME_CM),
            step: sizeStep,
            // PowerPoint's Size group lists Height above Width.
            heightFirst: true,
            disabled: !contextualShapeFrameSizeEditable,
            disabledReason: contextualShapeFrameSizeEditable
              ? undefined
              : contextualShapeSelectionHasInheritedPlaceholder
                ? t("presentation.sizeInheritedPlaceholder")
                : t("presentation.sizeFrameUnavailable"),
            onCommit: (axis, value) => {
              commitContextualShapeFrameSize(
                axis,
                presentationMeasurementCmDraft(String(value), sizeUnit),
              );
              return true;
            },
            lockAspect: {
              value: shapeFrameAspectLocked,
              disabled: !contextualShapeFrameSizeEditable,
              onToggle: () => {
                const locked = !shapeFrameAspectLocked;
                setShapeFrameAspectLock(() => ({
                  blockIds: contextualShapeObjectBlocks.map((block) => block.id),
                  locked,
                }));
                // Every selected shape takes the flag in one commit (the
                // single-shape updater refuses a multi-selection).
                const targetIds = new Set(
                  contextualShapeObjectBlocks
                    .filter((block) => block.type === "shape" && canEditBlockContent(block))
                    .map((block) => block.id),
                );
                if (targetIds.size > 0) {
                  commitLiveActiveBlocks((blocks) => {
                    let changed = false;
                    const nextBlocks = blocks.map((block) => {
                      if (!targetIds.has(block.id)) return block;
                      const current = (block as { lockAspectRatio?: boolean }).lockAspectRatio === true;
                      if (current === locked) return block;
                      changed = true;
                      const next = { ...block } as PresentationBlock & { lockAspectRatio?: boolean };
                      if (locked) next.lockAspectRatio = true;
                      else delete next.lockAspectRatio;
                      return next;
                    });
                    return changed ? nextBlocks : null;
                  });
                }
              },
            },
          },
          // Format Pane, the tab's last command (PPT-A123). Several shapes,
          
          // selection with a picture, chart or table in it says so instead of
          // taking the click and opening nothing.
          formatPane: {
            onSelect: toggleFormatPane,
            ...(selectedGeometryBlocks.length > 1 &&
            !selectedGeometryBlocks.every(
              (block) =>
                canEditBlockContent(block) &&
                (block.type === "shape" || presentationTextFrameHasShapeAuthority(block)),
            )
              ? { disabled: true, disabledReason: t("presentation.ui.shapeFormat.formatPaneOneObject") }
              : {}),
          },
        }
      : null;
}
