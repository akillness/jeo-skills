"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Insert tab of the presentation Ribbon (Slides, Tables, Images, Camera,
 * Illustrations, Links, Comments, Text, Symbols, Media), drawn from the window
 * bindings it reads.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the tab
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import { OfficeHomeSplitLayout, OfficeHomeCommand, OfficeHomeMenuTrigger } from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import {
  IconNewSlide,
  LayoutThumbnail,
  IconInsertPicture,
  IconInsertCameo,
  IconShapeGallery,
  IconInsertAiImage,
  IconInsertTextBox,
  IconInsertHorizontalTextBox,
  IconInsertVerticalTextBox,
  IconInsertFooter,
  IconInsertVideo,
  IconInsertMediaSource,
  IconInsertAudio,
} from "../PresentationRibbonIcons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { useState } from "react";
import { OfficeAllChartsDialog } from "@mrnote/core/web/components/office-ribbon/OfficeAllChartsDialog.tsx";
import {
  CHART_INSERT_ENHANCEMENT_FAMILIES,
  CHART_INSERT_OFFICE_FAMILIES,
} from "@mrnote/core/web/components/office-ribbon/OfficeChartInsertGallery.tsx";
import { DocumentChartStylePreview } from "@mrnote/docs/web/components/console/editor/native-document/DocumentChartStyleGallery.tsx";
import { applyChartTemplate, type OfficeChartTemplate } from "@mrnote/core/web/lib/office-charts/chart-templates.ts";
import { officeUserChartTemplateCommands, useOfficeChartTemplates } from "@mrnote/core/web/lib/office-charts/chart-template-store.ts";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { RibbonDropdownMenuContent as DropdownMenuContent, RibbonDropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import officeInsertGallery from "@mrnote/core/web/components/office-ribbon/OfficeInsertGallery.module.css";
import {
  Fragment,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import PresentationTableInsertPicker from "../../../../lib/presentation/TableInsertPicker";
import {
  ImageDown,
  ScreenShare,
  Crop,
  Timer,
  ListOrdered,
  Package,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { isPresentationCameoBlock } from "@mrnote/core/web/lib/presentation-object-buttons.ts";
import { PRESENTATION_SHAPE_CATALOG_ALIGN_OFFSET, PRESENTATION_SHAPE_CATALOG_VIEWPORT_PADDING } from "../../../../lib/presentation/window-constants";
import { officeShapeCatalogStyles } from "@mrnote/core/web/components/office-ribbon/OfficeShapeCatalogPanel.tsx";
import { PresentationHomeShapeGallery } from "@mrnote/core/web/components/notebook/contents/ribbon/PresentationHomeShapeGallery.tsx";
import { OfficeSmartArtGalleryPrefetch, OfficeSmartArtInsertGallery } from "@mrnote/core/web/components/office-ribbon/OfficeSmartArtInsertGallery.tsx";
import { OFFICE_SMARTART_GALLERY_GROUPS, type OfficeSmartArtPlaceholders } from "@mrnote/core/web/lib/office-smartart/catalog.ts";
import { OfficeChartInsertGallery } from "@mrnote/core/web/components/office-ribbon/OfficeChartInsertGallery.tsx";
import {
  OFFICE_CHART_DEFAULT_LEAF,
  OFFICE_MAC_CHART_MENU_GROUPS,
  type ChartBlockAttrsV2,
  type ChartFamily,
  type ChartSubtype,
} from "@mrnote/core/web/lib/office-charts/catalog.ts";
import { presentationChartFamilyLabel } from "../../../../lib/presentation-chart-menu";
import { createPresentationChartV2Leaf } from "@mrnote/core/web/lib/presentation-chart-v2.ts";
import { OfficeChartComboDialog } from "@mrnote/core/web/components/office-ribbon/OfficeChartComboDialog.tsx";
import { officeChartCombinationRows, officeChartWithCombination } from "@mrnote/core/web/lib/office-charts/chart-type.ts";
import { DocsInsertIcon } from "@mrnote/core/web/components/console/editor/DocumentInsertRibbonIcons.tsx";
import { OfficeWordArtInsertGallery } from "@mrnote/core/web/components/office-ribbon/OfficeWordArtStyleGallery.tsx";
import { PresentationEquationInsertButton } from "./PresentationEquationInsertButton";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { embeddedPresentationAutosave } from "../../../../lib/presentation-embedded-session";
import type { SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import type { OfficeWordArtRecipe } from "@mrnote/core/web/lib/office-wordart-style-catalog.ts";
import type { PresentationEquationSpan } from "../../../../lib/presentation-equation-buttons";
import type { EquationEditorCommand, PresentationActiveEquation } from "./usePresentationEquations";
import type { EquationLayoutMode } from "@mrnote/core/web/components/console/editor/extensions/equationCatalog.ts";
import type { JSX } from "react/jsx-runtime";
import type { PresentationDateTimeChoice } from "./PresentationDateTimeDialog";
import type { PresentationShapeCatalogSelection } from "@mrnote/core/web/lib/presentation-shape-catalog.ts";
import type { TableCellBorder } from "@mrnote/core/web/lib/presentation-table-style.ts";
import type { TableBorderPenMode } from "../../../../lib/presentation-table-border-pen";
import type { LayoutDefinition } from "@mrnote/core/web/lib/presentation-layouts.ts";
import type { PresentationTextBlock } from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { ResolvedPresentationFeatureCommand } from "@mrnote/core/web/components/notebook/contents/ribbon/commandRegistry.ts";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationInsertRibbonTabCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  smartArtPlaceholders: OfficeSmartArtPlaceholders;
  locale: string;
  insertVideoMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  insertAudioMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  insertPicturesMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  insertIconsMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  insertShapesMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  actionSettingsReturnFocusRef: RefObject<HTMLElement | null>;
  imageInsertBusy: boolean;
  audioInsertBusy: boolean;
  videoInsertBusy: boolean;
  smartArtMenuOpen: boolean;
  setSmartArtMenuOpen: Dispatch<SetStateAction<boolean>>;
  symbolRibbonTriggerRef: RefObject<HTMLButtonElement | null>;
  headerFooterRibbonTriggerRef: RefObject<HTMLButtonElement | null>;
  dateTimeRibbonTriggerRef: RefObject<HTMLButtonElement | null>;
  slideNumberRibbonTriggerRef: RefObject<HTMLButtonElement | null>;
  insertActionRibbonTriggerRef: RefObject<HTMLButtonElement | null>;
  openObjectLinkDialog: (blockId: string, kind: "link" | "action") => boolean;
  autosave: ReturnType<typeof embeddedPresentationAutosave>;
  activeSlide: SlideModel;
  newSlideFromLayoutIsWritable: (layoutValue: unknown) => boolean;
  defaultNewSlideWritable: boolean;
  anyNewSlideLayoutWritable: boolean;
  activeSlideBounds: { width: number; height: number; };
  deckWordArtRecipes: readonly OfficeWordArtRecipe[];
  wordArtStyleLabel: (id: string) => string;
  insertActionTargetId: string | null;
  presentationEquations: { insertEquation: (latex: string) => void; insertNewEquation: () => void; editEquation: (blockId: string, span: PresentationEquationSpan) => void; activeEquation: PresentationActiveEquation | null; selectedEquationLatex: string | null; editorOpen: boolean; layoutMode: EquationLayoutMode; setEditorLayoutMode: (mode: EquationLayoutMode) => void; normalText: boolean; toggleNormalText: () => void; runInEditor: (command: EquationEditorCommand) => void; dialog: JSX.Element | null; };
  openHeaderFooterDialog: (trigger: HTMLElement | null, entry?: "footer" | "date" | "number") => void;
  commentsPanelOpen: boolean;
  openReviewCommentComposer: () => void;
  screenCaptureSupported: boolean;
  capturePresentationScreenshot: (mode?: "window" | "clipping") => Promise<void>;
  /** Opens Insert > Icons (the shared gallery the window renders). */
  openIconGallery: () => void;
  openOnlinePictureDialog: () => void;
  openAiImageDialog: () => void;
  insertAiImageTriggerRef: RefObject<HTMLButtonElement | null>;
  videoFileCommandIsEnabled: boolean;
  audioFileCommandIsEnabled: boolean;
  executeAudioFileFromTrigger: (trigger: HTMLElement | null) => void;
  addSlideFromLayout: (layoutValue?: string, afterSlideId?: string) => void;
  openSymbolDialog: (blockId: string | null, trigger: HTMLElement | null) => void;
  setDateTimeDialogTarget: Dispatch<SetStateAction<{ blockId: string; start: number; end: number; } | null>>;
  insertFieldCaret: () => { blockId: string; start: number; end: number; } | null;
  insertTextFieldAtCaret: (caret: { blockId: string; start: number; end: number; }, dateTime: PresentationDateTimeChoice | null) => boolean;
  insertTextBox: (writingMode?: "vertical-rl") => void;
  insertWordArt: (styleId: string) => boolean;
  insertCameo: () => boolean;
  insertShapeCatalogSelection: (selection: PresentationShapeCatalogSelection) => boolean;
  insertSmartArt: (layoutId: string) => void;
  insertChartCombo: ChartBlockAttrsV2 | null;
  setInsertChartCombo: Dispatch<SetStateAction<ChartBlockAttrsV2 | null>>;
  insertChartBlock: (family?: ChartFamily, subtype?: ChartSubtype, prepared?: ChartBlockAttrsV2) => void;
  /** The deck theme's accents a new chart's colours resolve against. */
  chartThemeAccents: readonly string[];
  insertNativeTable: (requestedRows: unknown, requestedColumns: unknown, drawn?: { left: number; top: number; width: number; height: number; pen: TableCellBorder; }) => boolean;
  /** Insert > Video > Online Video: the dialog that asks for the address. */
  openOnlineVideoDialog: () => void;
  openSelectedTextLink: () => void;
  toggleTableBorderPen: (mode: TableBorderPenMode) => void;
  deckLayoutGroups: { masterKey: string; layouts: LayoutDefinition[]; }[];
  layoutGalleryGroupHeading: (masterKey: string) => string;
  ribbonTextBlock: PresentationTextBlock | null;
  featureDecision: (featureId: string) => ResolvedPresentationFeatureCommand;
  executePresentationFeature: (featureId: string) => undefined;
  executeImageFileFromTrigger: (trigger: HTMLElement | null) => void;
  executeVideoFileFromTrigger: (trigger: HTMLElement | null) => void;
  ribbonRunLinkSelection: boolean;
  ribbonObjectLinkBlockId: string | null;
  insertCapacityReached: boolean;
  narrationRecorderSupported: boolean;
  narrationRecorderBusy: boolean;
  openRecordAudioDialog: () => void;
}

export function PresentationInsertRibbonTab({ ctl }: { ctl: PresentationInsertRibbonTabCtl }) {
  // PowerPoint's Insert Chart dialog (All Charts, the user's Templates
  // folder first): the shared dialog the worksheet and Docs open.
  const [allChartsOpen, setAllChartsOpen] = useState(false);
  const chartTemplateFolder = useOfficeChartTemplates(allChartsOpen);
  const {
    t,
    smartArtPlaceholders,
    locale,
    insertVideoMenuTriggerRef,
    insertAudioMenuTriggerRef,
    insertPicturesMenuTriggerRef,
    insertIconsMenuTriggerRef,
    insertShapesMenuTriggerRef,
    actionSettingsReturnFocusRef,
    imageInsertBusy,
    audioInsertBusy,
    videoInsertBusy,
    smartArtMenuOpen,
    setSmartArtMenuOpen,
    symbolRibbonTriggerRef,
    headerFooterRibbonTriggerRef,
    dateTimeRibbonTriggerRef,
    slideNumberRibbonTriggerRef,
    insertActionRibbonTriggerRef,
    openObjectLinkDialog,
    autosave,
    activeSlide,
    newSlideFromLayoutIsWritable,
    defaultNewSlideWritable,
    anyNewSlideLayoutWritable,
    activeSlideBounds,
    deckWordArtRecipes,
    wordArtStyleLabel,
    insertActionTargetId,
    presentationEquations,
    openHeaderFooterDialog,
    commentsPanelOpen,
    openReviewCommentComposer,
    screenCaptureSupported,
    capturePresentationScreenshot,
    openIconGallery,
    openOnlinePictureDialog,
    openAiImageDialog,
    insertAiImageTriggerRef,
    videoFileCommandIsEnabled,
    audioFileCommandIsEnabled,
    executeAudioFileFromTrigger,
    addSlideFromLayout,
    openSymbolDialog,
    setDateTimeDialogTarget,
    insertFieldCaret,
    insertTextFieldAtCaret,
    insertTextBox,
    insertWordArt,
    insertCameo,
    insertShapeCatalogSelection,
    insertSmartArt,
    insertChartCombo,
    setInsertChartCombo,
    insertChartBlock,
    insertNativeTable,
    openOnlineVideoDialog,
    openSelectedTextLink,
    toggleTableBorderPen,
    deckLayoutGroups,
    layoutGalleryGroupHeading,
    ribbonTextBlock,
    featureDecision,
    executePresentationFeature,
    executeImageFileFromTrigger,
    executeVideoFileFromTrigger,
    ribbonRunLinkSelection,
    ribbonObjectLinkBlockId,
    insertCapacityReached,
    narrationRecorderSupported,
    narrationRecorderBusy,
    openRecordAudioDialog,
  } = ctl;
  return (
                  <>
                    {/* Desktop PowerPoint's Insert tab, in its order
                        (PPT-A051..A053; the 16.86 accessibility tree):
                        Slides | Tables | Images | Cameo | Illustrations |
                        Links | Comments | Text | Symbols | Media. Zoom,
                        3D Models, Object and Equation are not offered: none
                        has a read/write path yet (see the PN5 report). */}
                    <div
                      className="note-editor-office-toolbar__group"
                      data-ribbon="insert"
                      data-ribbon-label={t("presentation.home.slidesGroup")}
                      role="group"
                      aria-label={t("presentation.home.slidesGroup")}
                      data-testid="presentation-ribbon-insert-slides-group"
                    >
                      <div className="note-editor-ribbon-hstack">
                        <OfficeHomeSplitLayout
                          className={presentationChrome.insertLargeSplit}
                          testId="presentation-ribbon-insert-new-slide-split"
                          primary={
                            <OfficeHomeCommand
                              controlId="PPTCTL.RIBBON.INSERT.SLIDES.NEW.PRIMARY"
                              variant="large"
                              icon={<IconNewSlide home size={24} />}
                              label={t("presentation.addSlide")}
                              disabled={!defaultNewSlideWritable}
                              onClick={() =>
                                executePresentationFeature("slides.new")
                              }
                              testId="presentation-ribbon-insert-new-slide"
                            />
                          }
                          trigger={
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <OfficeHomeMenuTrigger
                                  controlId="PPTCTL.RIBBON.INSERT.SLIDES.NEW.MENU"
                                  variant="icon"
                                  icon={
                                    <OfficeSemanticIcon
                                      semanticId="menu.chevron.down"
                                      size={12}
                                    />
                                  }
                                  label={t(
                                    "presentation.newSlideFromLayout",
                                  )}
                                  disabled={!anyNewSlideLayoutWritable}
                                  testId="presentation-ribbon-insert-new-slide-layout"
                                />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="start"
                                className={officeInsertGallery.flyout}
                                data-smartart-gallery-application="presentation"
                              >
                                {deckLayoutGroups.map((group, groupIndex) => (
                                <Fragment key={group.masterKey}>
                                <DropdownMenuLabel
                                  className={officeInsertGallery.sectionHeading}
                                >
                                  {layoutGalleryGroupHeading(group.masterKey)}
                                </DropdownMenuLabel>
                                <div
                                  className={officeInsertGallery.grid}
                                  data-testid={
                                    groupIndex === 0
                                      ? "presentation-insert-new-slide-gallery"
                                      : `presentation-insert-new-slide-gallery-${group.masterKey}`
                                  }
                                >
                                  {group.layouts.map((layout) => (
                                    <DropdownMenuItem
                                      key={layout.id}
                                      disabled={
                                        !newSlideFromLayoutIsWritable(layout.id)
                                      }
                                      onSelect={() =>
                                        addSlideFromLayout(layout.id)
                                      }
                                      data-testid={
                                        "presentation-ribbon-insert-new-slide-" +
                                        layout.id
                                      }
                                      className={officeInsertGallery.card}
                                    >
                                      <span className={officeInsertGallery.preview}>
                                        <LayoutThumbnail layout={layout} />
                                      </span>
                                      <span
                                        className={
                                          presentationChrome.newSlideLayoutName
                                        }
                                      >
                                        {t(
                                          ("presentation.layout." +
                                            layout.nameKey) as "presentation.layout.blank",
                                        )}
                                      </span>
                                    </DropdownMenuItem>
                                  ))}
                                </div>
                                </Fragment>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          }
                        />
                      </div>
                    </div>

                    <div
                      className="note-editor-office-toolbar__group"
                      data-ribbon="insert"
                      data-ribbon-label={t("toolbar.ribbonInsertTable")}
                      role="group"
                      aria-label={t("toolbar.ribbonInsertTable")}
                      data-testid="presentation-ribbon-insert-tables-group"
                    >
                      <div className="note-editor-ribbon-hstack">
                        <PresentationTableInsertPicker
                          label={t("toolbar.table")}
                          disabled={autosave.readOnly || insertCapacityReached}
                          onInsert={insertNativeTable}
                          onDrawTable={() => toggleTableBorderPen("draw")}
                        />
                      </div>
                    </div>

                    <div
                      className="note-editor-office-toolbar__group"
                      data-ribbon="insert"
                      data-ribbon-label={t("presentation.insert.imagesGroup")}
                      role="group"
                      aria-label={t("presentation.insert.imagesGroup")}
                      data-testid="presentation-ribbon-insert-images-group"
                    >
                      <div className="note-editor-ribbon-hstack">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <OfficeHomeMenuTrigger
                              ref={insertPicturesMenuTriggerRef}
                              controlId="PPTCTL.RIBBON.INSERT.PICTURES.MENU"
                              variant="large"
                              hasMenuIndicator
                              icon={<IconInsertPicture home size={24} />}
                              label={t("presentation.bgFill.picture")}
                              disabled={
                                insertCapacityReached ||
                                imageInsertBusy ||
                                !featureDecision("drawing.image").enabled
                              }
                              aria-busy={imageInsertBusy}
                              testId="presentation-ribbon-add-image"
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            className="w-max min-w-[11.5rem] max-w-[16rem]"
                            aria-label={t("presentation.addImageBlock")}
                          >
                            <DropdownMenuLabel>
                              {t("presentation.insert.pictureSourcesGroup")}
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                              data-control-id="PPTCTL.RIBBON.INSERT.PICTURES.FILE"
                              onSelect={() =>
                                executeImageFileFromTrigger(
                                  insertPicturesMenuTriggerRef.current,
                                )
                              }
                              disabled={imageInsertBusy}
                              className="min-h-11 gap-3"
                              data-testid="presentation-ribbon-image-from-file"
                            >
                              <IconInsertPicture home size={18} />
                              {t("presentation.insert.pictureFromFile")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              data-control-id="PPTCTL.RIBBON.INSERT.PICTURES.ONLINE"
                              onSelect={() => void import("@mrnote/core/host/desktop-app.ts").then((module) => module.noteDesktopFeature("Online Pictures"))}
                              disabled={imageInsertBusy}
                              className="min-h-11 gap-3"
                              data-testid="presentation-ribbon-image-from-url"
                            >
                              <ImageDown size={18} aria-hidden="true" />
                              {t("toolbar.pictureFromUrl")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {/* Images ▸ Screenshot ▾: Available Windows /
                            Screen Clipping, a button of its own beside
                            Pictures as on the desktop (PPT-A051). */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <OfficeHomeMenuTrigger
                              controlId="PPTCTL.RIBBON.INSERT.SCREENSHOT.MENU"
                              variant="large"
                              hasMenuIndicator
                              icon={<ScreenShare size={24} aria-hidden="true" />}
                              label={t("toolbar.screenshot")}
                              disabled={
                                autosave.readOnly ||
                                insertCapacityReached ||
                                imageInsertBusy ||
                                !screenCaptureSupported
                              }
                              disabledReason={
                                screenCaptureSupported
                                  ? undefined
                                  : t(
                                      "presentation.insert.screenCaptureUnavailable",
                                    )
                              }
                              testId="presentation-ribbon-insert-screenshot"
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            aria-label={t("toolbar.screenshot")}
                          >
                            <DropdownMenuItem
                              data-control-id="PPTCTL.RIBBON.INSERT.SCREENSHOT.WINDOW_LIST"
                              disabled={
                                autosave.readOnly ||
                                insertCapacityReached ||
                                imageInsertBusy ||
                                !screenCaptureSupported
                              }
                              title={
                                screenCaptureSupported
                                  ? undefined
                                  : t(
                                      "presentation.insert.screenCaptureUnavailable",
                                    )
                              }
                              onSelect={() =>
                                void capturePresentationScreenshot()
                              }
                              className="min-h-11 gap-3"
                              data-testid="presentation-ribbon-screen-capture"
                            >
                              <ScreenShare size={18} aria-hidden="true" />
                              {t("toolbar.screenCapture")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              data-control-id="PPTCTL.RIBBON.INSERT.SCREENSHOT.CLIPPING"
                              disabled={
                                autosave.readOnly ||
                                insertCapacityReached ||
                                imageInsertBusy ||
                                !screenCaptureSupported
                              }
                              title={
                                screenCaptureSupported
                                  ? undefined
                                  : t(
                                      "presentation.insert.screenCaptureUnavailable",
                                    )
                              }
                              onSelect={() =>
                                void capturePresentationScreenshot("clipping")
                              }
                              className="min-h-11 gap-3"
                              data-testid="presentation-ribbon-screen-clipping"
                            >
                              <Crop size={18} aria-hidden="true" />
                              {t("presentation.insert.screenClipping")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <div
                      className="note-editor-office-toolbar__group"
                      data-ribbon="insert"
                      data-ribbon-label={t("presentation.insert.cameo")}
                      role="group"
                      aria-label={t("presentation.insert.cameo")}
                      data-testid="presentation-ribbon-insert-cameo-group"
                    >
                      <div className="note-editor-ribbon-hstack">
                        <OfficeHomeCommand
                          controlId="PPTCTL.RIBBON.INSERT.CAMEO"
                          variant="large"
                          icon={<IconInsertCameo home size={24} />}
                          label={t("presentation.insert.cameo")}
                          disabled={
                            autosave.readOnly ||
                            insertCapacityReached ||
                            activeSlide.blocks.some(isPresentationCameoBlock)
                          }
                          onClick={() => insertCameo()}
                          testId="presentation-ribbon-insert-cameo"
                        />
                      </div>
                    </div>

                    <div
                      className="note-editor-office-toolbar__group"
                      data-ribbon="insert"
                      data-ribbon-label={t(
                        "toolbar.ribbonInsertIllustrations",
                      )}
                      role="group"
                      aria-label={t("toolbar.ribbonInsertIllustrations")}
                      data-testid="presentation-ribbon-insert-illustrations-group"
                    >
                      <div className="note-editor-ribbon-hstack">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <OfficeHomeMenuTrigger
                              ref={insertShapesMenuTriggerRef}
                              controlId="PPTCTL.RIBBON.INSERT.SHAPES.GALLERY"
                              variant="large"
                              hasMenuIndicator
                              icon={<IconShapeGallery home size={24} />}
                              label={t("toolbar.shape")}
                              disabled={
                                insertCapacityReached ||
                                !featureDecision("drawing.shape").enabled
                              }
                              testId="presentation-ribbon-more-shapes"
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            alignOffset={
                              PRESENTATION_SHAPE_CATALOG_ALIGN_OFFSET
                            }
                            collisionPadding={
                              PRESENTATION_SHAPE_CATALOG_VIEWPORT_PADDING
                            }
                            sticky="always"
                            className={officeShapeCatalogStyles.menu}
                            aria-label={t("presentation.moreShapes")}
                            data-testid="presentation-ribbon-insert-shape-gallery-menu"
                            data-shape-catalog-align-offset={
                              PRESENTATION_SHAPE_CATALOG_ALIGN_OFFSET
                            }
                            data-shape-catalog-viewport-padding={
                              PRESENTATION_SHAPE_CATALOG_VIEWPORT_PADDING
                            }
                            data-shape-catalog-viewport-strategy="sticky"
                          >
                            <PresentationHomeShapeGallery
                              disabled={
                                insertCapacityReached ||
                                !featureDecision("drawing.shape").enabled
                              }
                              labelFor={(kind) =>
                                t(
                                  `presentation.shape.${kind}` as "presentation.shape.rectangle",
                                )
                              }
                              onSelect={insertShapeCatalogSelection}
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {null}
                        <OfficeHomeCommand
                          controlId="PPTCTL.RIBBON.INSERT.ICONS"
                          variant="large"
                          icon={<OfficeSemanticIcon semanticId="icon.insert" size={24} />}
                          label={t("toolbar.icon")}
                          disabled={
                            autosave.readOnly ||
                            insertCapacityReached ||
                            imageInsertBusy
                          }
                          buttonRef={insertIconsMenuTriggerRef}
                          onClick={openIconGallery}
                          testId="presentation-ribbon-insert-icons"
                        />
                        {/* The category cards, asked for while the button shows. */}
                        <OfficeSmartArtGalleryPrefetch
                          placeholders={smartArtPlaceholders}
                          previewBounds={activeSlideBounds}
                        />
                        <DropdownMenu open={smartArtMenuOpen} onOpenChange={setSmartArtMenuOpen}>
                          <OfficeHomeSplitLayout
                            testId="presentation-ribbon-add-smartart-split"
                            primary={
                              <OfficeHomeCommand
                                activation="click"
                                active={smartArtMenuOpen}
                                controlId="PPTCTL.RIBBON.INSERT.SMARTART.GALLERY"
                                variant="large"
                                icon={<OfficeSemanticIcon semanticId="diagram.smartArt.insert" size={24} />}
                                label={t("toolbar.smartArt")}
                                disabled={autosave.readOnly || insertCapacityReached}
                                onClick={() => setSmartArtMenuOpen((open) => !open)}
                                testId="presentation-ribbon-add-smartart"
                              />
                            }
                            trigger={
                              <DropdownMenuTrigger asChild>
                                <OfficeHomeMenuTrigger
                                  data-control-id="PPTCTL.RIBBON.INSERT.SMARTART.MENU"
                                  disabled={autosave.readOnly || insertCapacityReached}
                                  icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                                  label={t("toolbar.smartArt")}
                                  title={t("toolbar.smartArt")}
                                  testId="presentation-ribbon-smartart-menu"
                                  variant="icon"
                                />
                              </DropdownMenuTrigger>
                            }
                          />
                          <RibbonDropdownMenuContent
                            align="start"
                            data-testid="presentation-ribbon-smartart-menu-content"
                          >
                            <OfficeSmartArtInsertGallery
                              application="presentation"
                              disabled={autosave.readOnly || insertCapacityReached}
                              groups={OFFICE_SMARTART_GALLERY_GROUPS}
                              categoryLabel={(category) => t(`toolbar.smartArtCategory_${category}` as "toolbar.smartArtCategory_list")}
                              layoutLabel={(layoutId) => t(`toolbar.smartArtLayoutName_${layoutId}` as "toolbar.smartArtLayoutName_basic-list")}
                              layoutDescription={(layoutId) => t(`toolbar.smartArtLayoutDesc_${layoutId}` as "toolbar.smartArtLayoutDesc_basic-list")}
                              placeholders={smartArtPlaceholders}
                              previewBounds={activeSlideBounds}
                              onSelect={insertSmartArt}
                              testIdPrefix="presentation-smartart-gallery"
                            />
                          </RibbonDropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                          <OfficeHomeSplitLayout
                            testId="presentation-ribbon-add-chart-split"
                            primary={
                              <OfficeHomeCommand
                                activation="click"
                                variant="large"
                                controlId="PPTCTL.RIBBON.INSERT.CHART.GALLERY"
                                icon={<OfficeSemanticIcon semanticId="chart.insert" size={24} />}
                                label={t("presentation.insert.chart")}
                                disabled={autosave.readOnly || insertCapacityReached}
                                // PowerPoint's Insert ▸ Chart opens Insert Chart
                                // (All Charts); the chevron keeps the gallery.
                                onClick={() => setAllChartsOpen(true)}
                                testId="presentation-ribbon-add-chart"
                              />
                            }
                            trigger={
                              <DropdownMenuTrigger asChild>
                                <OfficeHomeMenuTrigger
                                  data-control-id="PPTCTL.RIBBON.INSERT.CHART.MENU"
                                  disabled={autosave.readOnly || insertCapacityReached}
                                  icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                                  label={t("presentation.insert.chart")}
                                  title={t("presentation.insert.chart")}
                                  testId="presentation-ribbon-chart-menu"
                                  variant="icon"
                                />
                              </DropdownMenuTrigger>
                            }
                          />
                          <RibbonDropdownMenuContent
                            align="start"
                            data-testid="presentation-ribbon-chart-menu-content"
                          >
                            <OfficeChartInsertGallery
                              application="presentation"
                              disabled={autosave.readOnly || insertCapacityReached}
                              selectedFamily={OFFICE_CHART_DEFAULT_LEAF.family}
                              selectedSubtype={OFFICE_CHART_DEFAULT_LEAF.subtype}
                              // PowerPoint for Mac's nine entries (PPT-A062).
                              familyGroups={OFFICE_MAC_CHART_MENU_GROUPS}
                              familyLabel={(family) => presentationChartFamilyLabel(t, family)}
                              subtypeLabel={(family, subtype) => t(`toolbar.chartV2.subtype.${family}.${subtype}` as "toolbar.chartV2.subtype.column.clustered")}
                              onSelect={(family, subtype) =>
                                // Insert Chart > Combo > Custom Combination:
                                // PowerPoint asks for each series' chart
                                // type and axis before the chart goes in.
                                family === "combo" && subtype === "custom"
                                  ? setInsertChartCombo(
                                      createPresentationChartV2Leaf(
                                        family,
                                        subtype,
                                        t("toolbar.chartSampleTitle"),
                                        locale,
                                      ),
                                    )
                                  : insertChartBlock(family, subtype)
                              }
                              testIdPrefix="presentation-chart-gallery"
                            />
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              data-testid="presentation-chart-all-charts"
                              disabled={autosave.readOnly || insertCapacityReached}
                              onSelect={() => setAllChartsOpen(true)}
                            >
                              {t("office.allCharts.open")}
                            </DropdownMenuItem>
                          </RibbonDropdownMenuContent>
                        </DropdownMenu>
                        {allChartsOpen ? (() => {
                          const sample = (family: ChartFamily, subtype: ChartSubtype) =>
                            createPresentationChartV2Leaf(family, subtype, t("toolbar.chartSampleTitle"), locale);
                          const fromTemplate = (template: OfficeChartTemplate) =>
                            applyChartTemplate(sample(template.chartType, template.chartSubtype), template);
                          const refused = autosave.readOnly || insertCapacityReached;
                          return (
                            <OfficeAllChartsDialog
                              mode="insert"
                              initialFamily={OFFICE_CHART_DEFAULT_LEAF.family}
                              initialSubtype={OFFICE_CHART_DEFAULT_LEAF.subtype}
                              families={[...CHART_INSERT_OFFICE_FAMILIES, ...CHART_INSERT_ENHANCEMENT_FAMILIES]}
                              leafState={() => (refused ? { enabled: false } : { enabled: true })}
                              preview={(family, subtype) => (
                                <DocumentChartStylePreview attrs={sample(family, subtype)} themeAccents={ctl.chartThemeAccents} />
                              )}
                              templates={{
                                items: chartTemplateFolder.templates,
                                status: chartTemplateFolder.status === "idle" ? "loading" : chartTemplateFolder.status,
                                emptyLabel: t("office.allCharts.templatesEmpty"),
                                loadingLabel: t("office.allCharts.templatesLoading"),
                                failedLabel: t("office.allCharts.templatesFailed"),
                                state: (template) =>
                                  !refused && fromTemplate(template)
                                    ? { enabled: true }
                                    : { enabled: false, reason: refused ? undefined : t("spreadsheet.chartTemplate.notApplicable") },
                                preview: (template) => {
                                  const attrs = fromTemplate(template);
                                  return attrs ? <DocumentChartStylePreview attrs={attrs} /> : null;
                                },
                                // Manage Templates: the user's folder, as in every editor.
                                ...officeUserChartTemplateCommands,
                              }}
                              onConfirm={(choice) => {
                                setAllChartsOpen(false);
                                if (choice.kind === "template") {
                                  const attrs = fromTemplate(choice.template);
                                  if (attrs) insertChartBlock(attrs.chartType, attrs.chartSubtype, attrs);
                                  return;
                                }
                                if (choice.family === "combo" && choice.subtype === "custom") {
                                  setInsertChartCombo(sample(choice.family, choice.subtype));
                                  return;
                                }
                                insertChartBlock(choice.family, choice.subtype);
                              }}
                              onCancel={() => setAllChartsOpen(false)}
                              testIdPrefix="presentation-insert-all-charts"
                            />
                          );
                        })() : null}
                        {insertChartCombo ? (
                          <OfficeChartComboDialog
                            open
                            locale={locale}
                            rows={officeChartCombinationRows(insertChartCombo) ?? []}
                            disabledReason={autosave.readOnly ? t("ai.readOnlyLock") : null}
                            onSubmit={(rows) => {
                              const next = officeChartWithCombination(insertChartCombo, rows);
                              setInsertChartCombo(null);
                              if (next) insertChartBlock(next.chartType, next.chartSubtype, next);
                            }}
                            onClose={() => setInsertChartCombo(null)}
                            testIdPrefix="presentation-chart-insert-combo"
                          />
                        ) : null}
                      </div>
                    </div>

                    <div
                      className="note-editor-office-toolbar__group"
                      data-ribbon="insert"
                      data-ribbon-label={t("toolbar.ribbonInsertLinks")}
                      role="group"
                      aria-label={t("toolbar.ribbonInsertLinks")}
                      data-testid="presentation-ribbon-insert-link-group"
                    >
                      <div className="note-editor-ribbon-hstack">
                        <OfficeHomeCommand
                          activation="click"
                          controlId="PPTCTL.RIBBON.INSERT.LINK"
                          variant="large"
                          icon={<OfficeSemanticIcon semanticId="link.insert" size={24} />}
                          label={t("presentation.link")}
                          disabled={!ribbonRunLinkSelection && !ribbonObjectLinkBlockId}
                          disabledReason={!ribbonRunLinkSelection && !ribbonObjectLinkBlockId ? t(ribbonTextBlock?.source?.nativeRunLinkPreserveOnly === true ? "presentation.linkDialog.nativeUnavailable" : "presentation.linkDialog.selectText") : undefined}
                          onClick={() => {
                            if (ribbonRunLinkSelection) openSelectedTextLink();
                            else if (ribbonObjectLinkBlockId) openObjectLinkDialog(ribbonObjectLinkBlockId, "link");
                          }}
                          testId="presentation-ribbon-insert-link"
                        />
                        {/* Links ▸ Action: the same Action Settings dialog the
                            object's context menu opens, for the one selected
                            object (PowerPoint disables it with nothing
                            selected). */}
                        <OfficeHomeCommand
                          controlId="PPTCTL.RIBBON.INSERT.ACTION"
                          variant="large"
                          icon={<OfficeSemanticIcon semanticId="link.insert" size={24} />}
                          label={t("presentation.insert.action")}
                          activation="click"
                          buttonRef={insertActionRibbonTriggerRef}
                          disabled={!insertActionTargetId}
                          disabledReason={
                            insertActionTargetId
                              ? undefined
                              : t("toolbar.noSelectionReason")
                          }
                          onClick={() => {
                            if (!insertActionTargetId) return;
                            actionSettingsReturnFocusRef.current =
                              insertActionRibbonTriggerRef.current;
                            openObjectLinkDialog(insertActionTargetId, "action");
                          }}
                          testId="presentation-ribbon-insert-action"
                        />
                      </div>
                    </div>

                    <div
                      className="note-editor-office-toolbar__group"
                      data-ribbon="insert"
                      data-ribbon-label={t("toolbar.ribbonInsertComment")}
                      role="group"
                      aria-label={t("toolbar.ribbonInsertComment")}
                      data-testid="presentation-ribbon-insert-comment-group"
                    >
                      <div className="note-editor-ribbon-hstack">
                        <OfficeHomeCommand
                          controlId="PPTCTL.RIBBON.INSERT.COMMENT"
                          variant="large"
                          icon={
                            <OfficeSemanticIcon
                              semanticId="comment.add"
                              size={24}
                            />
                          }
                          label={t("presentation.insert.comment")}
                          active={commentsPanelOpen}
                          onClick={openReviewCommentComposer}
                          testId="presentation-ribbon-insert-comment"
                        />
                      </div>
                    </div>

                    <div
                      className="note-editor-office-toolbar__group"
                      data-ribbon="insert"
                      data-ribbon-label={t("toolbar.ribbonInsertText")}
                      role="group"
                      aria-label={t("toolbar.ribbonInsertText")}
                      data-testid="presentation-ribbon-insert-text-group"
                    >
                      <div className="note-editor-ribbon-hstack">
                        <OfficeHomeSplitLayout
                          className={presentationChrome.insertLargeSplit}
                          testId="presentation-ribbon-insert-textbox-split"
                          primary={
                            <OfficeHomeCommand
                              controlId="PPTCTL.RIBBON.INSERT.TEXTBOX.PRIMARY"
                              variant="large"
                              icon={<IconInsertTextBox home size={24} />}
                              label={t("presentation.addTextBox")}
                              disabled={
                                insertCapacityReached ||
                                !featureDecision("drawing.textBox").enabled
                              }
                              onClick={() => insertTextBox()}
                              testId="presentation-ribbon-add-textbox"
                            />
                          }
                          trigger={
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <OfficeHomeMenuTrigger
                                  controlId="PPTCTL.RIBBON.INSERT.TEXTBOX.MENU"
                                  variant="icon"
                                  icon={
                                    <OfficeSemanticIcon
                                      semanticId="menu.chevron.down"
                                      size={12}
                                    />
                                  }
                                  label={t("presentation.addTextBox")}
                                  disabled={
                                    insertCapacityReached ||
                                    !featureDecision("drawing.textBox").enabled
                                  }
                                  testId="presentation-ribbon-add-textbox-menu"
                                />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="start"
                                aria-label={t("presentation.addTextBox")}
                              >
                                <DropdownMenuItem
                                  onSelect={() => insertTextBox()}
                                  data-testid="presentation-ribbon-add-textbox-horizontal"
                                >
                                  <IconInsertHorizontalTextBox home size={18} />
                                  {t("presentation.insert.drawHorizontalTextBox")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    insertTextBox("vertical-rl")
                                  }
                                  data-testid="presentation-ribbon-add-textbox-vertical"
                                >
                                  <IconInsertVerticalTextBox home size={18} />
                                  {t("toolbar.textBox.vertical")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          }
                        />
                        <OfficeHomeCommand
                          controlId="PPTCTL.RIBBON.INSERT.HEADER_FOOTER"
                          variant="large"
                          icon={<IconInsertFooter home size={24} />}
                          label={t("presentation.headerFooter.label")}
                          activation="click"
                          buttonRef={headerFooterRibbonTriggerRef}
                          onClick={() =>
                            openHeaderFooterDialog(
                              headerFooterRibbonTriggerRef.current,
                              "footer",
                            )
                          }
                          testId="presentation-ribbon-insert-header-footer"
                        />
                        {/* Insert > WordArt: PowerPoint's twenty styles under the
                            deck's theme (PPT-A059), four rows of five; a pick
                            inserts a text box the Shape Format tab's WordArt
                            Styles then edit. */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <OfficeHomeMenuTrigger
                              controlId="PPTCTL.RIBBON.INSERT.WORDART.MENU"
                              variant="large"
                              hasMenuIndicator
                              icon={<DocsInsertIcon name="wordArt" size={24} />}
                              label={t("toolbar.wordArt")}
                              disabled={
                                insertCapacityReached ||
                                !featureDecision("drawing.textBox").enabled
                              }
                              testId="presentation-ribbon-insert-wordart"
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            aria-label={t("toolbar.wordArt")}
                          >
                            <OfficeWordArtInsertGallery
                              recipes={deckWordArtRecipes}
                              labelFor={(recipe) => wordArtStyleLabel(recipe.id)}
                              onSelect={(recipe) => insertWordArt(recipe.id)}
                              testIdPrefix="presentation-ribbon-insert-wordart"
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {/* Date & Time and Slide Number open the same Header
                            and Footer dialog, focused on their own row, as
                            PowerPoint's do ("Insert or change the slide
                            numbers, date, or footer", Microsoft Support). */}
                        <OfficeHomeCommand
                          controlId="PPTCTL.RIBBON.INSERT.DATE_TIME"
                          variant="large"
                          icon={<Timer size={24} aria-hidden="true" />}
                          label={t("presentation.headerFooter.dateTime")}
                          activation="click"
                          buttonRef={dateTimeRibbonTriggerRef}
                          onClick={() => {
                            // With the cursor in text, PowerPoint's Date
                            // and Time dialog puts a date there (PPT-A052).
                            const caret = insertFieldCaret();
                            if (caret) {
                              setDateTimeDialogTarget(caret);
                              return;
                            }
                            openHeaderFooterDialog(
                              dateTimeRibbonTriggerRef.current,
                              "date",
                            );
                          }}
                          testId="presentation-ribbon-insert-date-time"
                        />
                        <OfficeHomeCommand
                          controlId="PPTCTL.RIBBON.INSERT.SLIDE_NUMBER"
                          variant="large"
                          icon={<ListOrdered size={24} aria-hidden="true" />}
                          label={t("presentation.headerFooter.slideNumber")}
                          activation="click"
                          buttonRef={slideNumberRibbonTriggerRef}
                          onClick={() => {
                            // With the cursor in text, the slide number
                            // goes there as a field (PPT-A052).
                            const caret = insertFieldCaret();
                            if (caret && insertTextFieldAtCaret(caret, null)) return;
                            openHeaderFooterDialog(
                              slideNumberRibbonTriggerRef.current,
                              "number",
                            );
                          }}
                          testId="presentation-ribbon-insert-slide-number"
                        />
                        {/* Insert > Object: an OLE object (another program's
                            document) needs that program; a browser has none
                            (PPT-A052). The button is there, with the reason. */}
                        <OfficeHomeCommand
                          controlId="PPTCTL.RIBBON.INSERT.OBJECT"
                          variant="large"
                          icon={<Package size={24} aria-hidden="true" />}
                          label={t("presentation.insert.object")}
                          activation="click"
                          disabled
                          disabledReason={t("presentation.insert.objectUnavailable")}
                          onClick={() => undefined}
                          testId="presentation-ribbon-insert-object"
                        />
                      </div>
                    </div>

                    <div
                      className="note-editor-office-toolbar__group"
                      data-ribbon="insert"
                      data-ribbon-label={t("toolbar.ribbonInsertSymbols")}
                      role="group"
                      aria-label={t("toolbar.ribbonInsertSymbols")}
                      data-testid="presentation-ribbon-insert-symbols-group"
                    >
                      <div className="note-editor-ribbon-hstack">
                        <PresentationEquationInsertButton
                          t={t as (key: string) => string}
                          locale={locale}
                          disabled={autosave.readOnly}
                          selectedEquationLatex={presentationEquations.selectedEquationLatex}
                          onInsertEquation={presentationEquations.insertEquation}
                          onInsertNewEquation={presentationEquations.insertNewEquation}
                        />
                        <OfficeHomeCommand
                          controlId="PPTCTL.RIBBON.INSERT.SYMBOL"
                          buttonRef={symbolRibbonTriggerRef}
                          variant="large"
                          icon={
                            <OfficeSemanticIcon
                              semanticId="symbol.insert"
                              size={24}
                            />
                          }
                          label={t("toolbar.symbol")}
                          disabled={autosave.readOnly}
                          onClick={() => {
                            openSymbolDialog(
                              ribbonTextBlock?.id ?? null,
                              symbolRibbonTriggerRef.current,
                            );
                          }}
                          testId="presentation-ribbon-insert-symbol"
                        />
                      </div>
                    </div>

                    <div
                      className="note-editor-office-toolbar__group"
                      data-ribbon="insert"
                      data-ribbon-label={t("presentation.insert.mediaGroup")}
                      role="group"
                      aria-label={t("presentation.insert.mediaGroup")}
                      data-testid="presentation-ribbon-insert-media-group"
                    >
                      <div className="note-editor-ribbon-hstack">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <OfficeHomeMenuTrigger
                              ref={insertVideoMenuTriggerRef}
                              controlId="PPTCTL.RIBBON.INSERT.VIDEO.MENU"
                              variant="large"
                              hasMenuIndicator
                              icon={<IconInsertVideo home size={24} />}
                              label={t("presentation.embed.kind.video")}
                              disabled={autosave.readOnly}
                              aria-busy={videoInsertBusy}
                              testId="presentation-ribbon-insert-video"
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            aria-label={t("presentation.embed.kind.video")}
                          >
                            <DropdownMenuItem
                              data-control-id="PPTCTL.RIBBON.INSERT.VIDEO.FILE"
                              onSelect={() => void import("@mrnote/core/host/desktop-app.ts").then((module) => module.noteDesktopFeature("Video from File"))}
                              disabled={autosave.readOnly}
                              data-testid="presentation-ribbon-video-from-file"
                              className="min-h-11 gap-3"
                            >
                              <IconInsertMediaSource kind="video-file" />
                              {t("presentation.insert.videoFromFile")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              data-control-id="PPTCTL.RIBBON.INSERT.VIDEO.ONLINE"
                              disabled={
                                autosave.readOnly || insertCapacityReached
                              }
                              onSelect={openOnlineVideoDialog}
                              data-testid="presentation-ribbon-video-online"
                              className="min-h-11 gap-3"
                            >
                              <IconInsertMediaSource kind="video-online" />
                              {t("presentation.insert.onlineVideo")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <OfficeHomeMenuTrigger
                              ref={insertAudioMenuTriggerRef}
                              controlId="PPTCTL.RIBBON.INSERT.AUDIO.MENU"
                              variant="large"
                              hasMenuIndicator
                              icon={<IconInsertAudio home size={24} />}
                              displayLabel={t(
                                "presentation.embed.kind.audio",
                              )}
                              label={t("presentation.embed.kind.audio")}
                              disabled={!audioFileCommandIsEnabled}
                              aria-busy={audioInsertBusy}
                              testId="presentation-ribbon-insert-audio"
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            aria-label={t("presentation.embed.kind.audio")}
                          >
                            <DropdownMenuItem
                              data-control-id="PPTCTL.RIBBON.INSERT.AUDIO.FILE"
                              disabled={!audioFileCommandIsEnabled}
                              onSelect={() =>
                                executeAudioFileFromTrigger(
                                  insertAudioMenuTriggerRef.current,
                                )
                              }
                              data-testid="presentation-ribbon-audio-from-file"
                              className="min-h-11 gap-3"
                            >
                              <IconInsertMediaSource kind="audio-file" />
                              {t("presentation.insert.audioFromFile")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              data-control-id="PPTCTL.RIBBON.INSERT.AUDIO.RECORD"
                              disabled={
                                !audioFileCommandIsEnabled ||
                                narrationRecorderBusy ||
                                !narrationRecorderSupported
                              }
                              title={
                                narrationRecorderSupported
                                  ? undefined
                                  : t(
                                      "presentation.record.compatibleFormatUnavailable",
                                    )
                              }
                              onSelect={openRecordAudioDialog}
                              data-testid="presentation-ribbon-record-audio"
                              className="min-h-11 gap-3"
                            >
                              <IconInsertMediaSource kind="audio-record" />
                              {t("presentation.insert.recordAudio")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </>
  );
}
