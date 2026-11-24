"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Home tab of the presentation Ribbon (Undo, Clipboard, Slides, Font,
 * Paragraph, Drawing, Editing), drawn from the window bindings it
 * reads.
 *
 * Extracted verbatim from the render of
 * `components/notebook/contents/PresentationWindow.tsx`: the JSX is unchanged;
 * the window passes the bindings it used to close over as `ctl`, and the tab
 * condition and key stay at the call site. No hooks run here, so the window's
 * hook order is unchanged.
 */

import {
  OfficeHomeUndoRail,
  OfficeHomeRibbonGroup,
  OfficeHomeClipboardComposite,
  OfficeHomeCommand,
  OfficeHomeMenuTrigger,
  OfficeHomeCommandRow,
  OfficeHomeSplitLayout,
  OfficeHomeCommandStack,
  OfficeHomeGallery,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import {
  Undo2,
  Redo2,
  Image as ImageIcon,
  RotateCcw,
  CaseSensitive,
  Ban,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  ImageDown,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { DocsHomeIcon } from "@mrnote/core/web/components/console/editor/DocumentHomeRibbonIcons.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { RibbonDropdownMenuContent as DropdownMenuContent, RibbonDropdownMenuSubContent as DropdownMenuSubContent, RibbonDropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import {
  IconPasteTextOnly,
  IconNewSlide,
  LayoutThumbnail,
  IconDuplicateSlide,
  IconOutlineImport,
  IconReuseSlides,
  IconSlideLayout,
  IconChangeCase,
  IconTextShadow,
  IconBulletStyle,
  IconNumberStyle,
  IconParagraphIndent,
  IconLineSpacing,
  IconTextColumns,
  IconParagraphAlign,
  IconDistributeText,
  IconTextVertical,
  IconAlignTextMenu,
  IconInsertPicture,
  IconInsertTextBox,
  IconInsertHorizontalTextBox,
  IconInsertVerticalTextBox,
  IconArrangeMenu,
  IconQuickStyles,
  IconShapeFill,
  IconShapeOutline,
} from "../PresentationRibbonIcons";
import presentationChrome from "@mrnote/core/web/lib/presentation/presentation-window-shell.module.css";
import { DUPLICATE_SLIDE_COMMAND_ID } from "@mrnote/core/web/lib/presentation-command-adapters.ts";
import officeInsertGallery from "@mrnote/core/web/components/office-ribbon/OfficeInsertGallery.module.css";
import {
  Fragment,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { PresentationSectionRibbonMenu } from "./PresentationSectionRibbonMenu";
import type {
  PresentationSectionCommand,
  PresentationSectionMenuState,
} from "./PresentationSectionMenuItems";
import { type SectionGroup, type SlideSection } from "@mrnote/core/web/lib/presentation-sections.ts";
import {
  PresentationHomeAwareGroup,
  PresentationHomeAwareCommandRow,
  PresentationHomeAwareFontCommand,
  PresentationHomeAwareSplitLayout,
} from "./PresentationHomeAwareRibbon";
import { RibbonFontFamilyPicker } from "@mrnote/core/web/components/office-ribbon/RibbonFontFamilyPicker.tsx";
import {
  FONT_FAMILY_VALUES,
  CJK_FONT_FAMILY_VALUES,
  TEXT_COLOR_VALUES,
  HIGHLIGHT_COLOR_VALUES,
} from "@mrnote/core/web/components/console/editor/extensions/TextStyling.ts";
import { RibbonValueCombobox } from "@mrnote/core/web/components/office-ribbon/RibbonValueCombobox.tsx";
import { PRESENTATION_FONT_SIZE_OPTIONS, PRESENTATION_SHAPE_CATALOG_ALIGN_OFFSET, PRESENTATION_SHAPE_CATALOG_VIEWPORT_PADDING } from "../../../../lib/presentation/window-constants";
import { parseOfficeFontSizeInput } from "@mrnote/core/web/components/office-ribbon/officeFontSizeCatalog.ts";
import { PRESENTATION_CHARACTER_SPACING_PRESETS } from "../../../../lib/presentation-font-dialog";
import {
  restorePresentationHomeMenuFocus,
  PresentationHomeShapeGallery,
  PresentationFillPreview,
  PresentationOutlinePreview,
} from "@mrnote/core/web/components/notebook/contents/ribbon/PresentationHomeShapeGallery.tsx";
import { PresentationSwatchGrid, PresentationCustomColorItem, ColorMenuClearItem } from "@mrnote/core/web/components/notebook/contents/ribbon/ColorMenu.tsx";
import { OfficeColorPalettePopover } from "@mrnote/core/web/components/office-ribbon/OfficeColorPalettePopover.tsx";
import { OfficeListGalleryMenuContent, OfficeListGalleryTile, OfficeListGalleryPreview } from "@mrnote/core/web/components/office-ribbon/OfficeListGallery.tsx";
import { POWERPOINT_BULLET_LIBRARY, type PresentationListLibraryItem } from "@mrnote/core/web/lib/presentation-bullet-library.ts";
import { PRESENTATION_LINE_SPACING_MENU } from "@mrnote/core/web/lib/presentation-paragraph-dialog.ts";
import { clampLineSpacing } from "@mrnote/core/web/lib/presentation-line-spacing.ts";
import { normalizeColumnCount, effectiveColumnSpacingEmu } from "@mrnote/core/web/lib/presentation-text-columns.ts";
import { persistedVerticalAnchor } from "@mrnote/core/web/lib/presentation-vertical-anchor.ts";
import { PresentationConvertToSmartArtMenu } from "./PresentationConvertToSmartArtMenu";
import { convertToSmartArtKind } from "../../../../lib/presentation-convert-to-smartart";
import { MAX_PRESENTATION_BLOCKS_PER_SLIDE, type SlideModel } from "@mrnote/core/web/lib/presentation/deck-model.ts";
import { officeShapeCatalogStyles } from "@mrnote/core/web/components/office-ribbon/OfficeShapeCatalogPanel.tsx";
import { PresentationHomeArrangeMenuItems } from "./PresentationHomeArrangeMenuItems";
import { OfficeShapeStyleGallery } from "@mrnote/core/web/components/office-ribbon/OfficeShapeStyleGallery.tsx";
import {
  normalizeShapeColor,
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_STROKE,
  MAX_STROKE_WIDTH,
} from "@mrnote/core/web/lib/presentation-shapes.ts";
import { OFFICE_MENU_DASHES, officeMenuDashFields } from "@mrnote/core/web/lib/office-stroke-dash.ts";
import { OfficePictureMenuIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficePictureMenuIcon.tsx";
import { presentationShapeObjectShapePatch } from "@mrnote/core/web/lib/presentation-shape-style-adapter.ts";
import { OfficeColorPalettePanel } from "@mrnote/core/web/components/office-ribbon/OfficeColorPalettePanel.tsx";
import { pushRecentColor } from "@mrnote/core/web/lib/office-color-palette.ts";
import { SLIDE_BG_PATTERNS } from "@mrnote/core/web/lib/presentation-slide-bg.ts";
import { OFFICE_LINE_WEIGHT_PT, officeLineWeightPtToPx, formatOfficeLineWeightPt } from "@mrnote/core/web/lib/office-line-weight.ts";
import { PresentationHomeEditingSelectMenu } from "./PresentationHomeEditingSelectMenu";
import { formatOfficeShortcut } from "@mrnote/core/web/lib/office-context-menu.ts";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import type { OfficeSmartArtPlaceholders } from "@mrnote/core/web/lib/office-smartart/catalog.ts";
import type { PresentationFormatPainterState } from "@mrnote/core/web/lib/presentation-format-painter.ts";
import type { PresentationFontDialogTab } from "../../../../lib/presentation/PresentationFontDialog";
import type { embeddedPresentationAutosave } from "../../../../lib/presentation-embedded-session";
import type { OfficeShapeStyleRecipe } from "@mrnote/core/web/lib/office-shape-style-catalog.ts";
import type { TableCellFontFamily } from "@mrnote/core/web/lib/presentation-table-style.ts";
import type {
  PresentationBlock,
  PresentationShapeBlock,
  PresentationTextBlock,
  PresentationTextStyle,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import type { RunStyle, ToggleableRunStyleKey } from "@mrnote/core/web/lib/presentation-runs.ts";
import type { ChangeCaseMode } from "@mrnote/core/web/lib/presentation-text-case.ts";
import type { SmartArtKind } from "@mrnote/core/web/lib/presentation-smartart.ts";
import type { LayoutDefinition } from "@mrnote/core/web/lib/presentation-layouts.ts";
import type { ResolvedPresentationFeatureCommand } from "@mrnote/core/web/components/notebook/contents/ribbon/commandRegistry.ts";
import type { PresentationShapeCatalogSelection } from "@mrnote/core/web/lib/presentation-shape-catalog.ts";
import type { PresentationHomeObjectTargets } from "@mrnote/core/web/lib/presentation-home-object-text.ts";
import type { OfficeHomeObjectTextState } from "@mrnote/core/web/lib/office-home-object-target.ts";
import type { PresentationParagraphFormatState } from "@mrnote/core/web/lib/presentation-text-buttons.ts";
import type { ParagraphBullet } from "@mrnote/core/web/lib/presentation-paragraphs.ts";
import type { JSX } from "react/jsx-runtime";
import type { OfficeAlignMenuSectionLabels, OfficeObjectAlignAction } from "@mrnote/core/web/components/office-ribbon/OfficeObjectArrangeMenuItems.tsx";

/** The window bindings this tab reads, passed through unchanged. */
export interface PresentationHomeRibbonTabCtl {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  smartArtPlaceholders: OfficeSmartArtPlaceholders;
  homePicturesMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  homeSelectMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  homeShapesMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  homeArrangeMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  imageInsertBusy: boolean;
  selectionPaneReturnFocusRef: RefObject<HTMLElement | null>;
  sections: SlideSection[];
  setCollapsedSections: Dispatch<SetStateAction<Set<string>>>;
  setReplaceFontsOpen: Dispatch<SetStateAction<boolean>>;
  replaceFontsTriggerRef: RefObject<HTMLButtonElement | null>;
  homeFontSizeDraft: string | null;
  setHomeFontSizeDraft: Dispatch<SetStateAction<string | null>>;
  openFindReplacePanel: (intent: "find" | "replace") => void;
  textColorFace: string;
  textColorFaceRef: RefObject<string>;
  rememberTextColorFace: (color: string) => void;
  textHighlightFace: string;
  textHighlightFaceRef: RefObject<string>;
  rememberTextHighlightFace: (color: string) => void;
  homeTextColorMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  homeTextHighlightMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  homeTextColorPaletteOpen: boolean;
  setHomeTextColorPaletteOpen: Dispatch<SetStateAction<boolean>>;
  homeTextHighlightPaletteOpen: boolean;
  setHomeTextHighlightPaletteOpen: Dispatch<SetStateAction<boolean>>;
  homeBulletGalleryOpen: boolean;
  setHomeBulletGalleryOpen: Dispatch<SetStateAction<boolean>>;
  homeNumberGalleryOpen: boolean;
  setHomeNumberGalleryOpen: Dispatch<SetStateAction<boolean>>;
  homeTextColorRecents: string[];
  setHomeTextColorRecents: Dispatch<SetStateAction<string[]>>;
  homeShapeColorMenu: "fill" | "stroke" | null;
  setHomeShapeColorMenu: Dispatch<SetStateAction<"fill" | "stroke" | null>>;
  homeShapeFillMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  homeShapeOutlineMenuTriggerRef: RefObject<HTMLButtonElement | null>;
  shapeFormatRecentColors: string[];
  setShapeFormatRecentColors: Dispatch<SetStateAction<string[]>>;
  formatPainter: PresentationFormatPainterState | null;
  fontDialogTab: PresentationFontDialogTab | null;
  paragraphDialogOpen: boolean;
  setBulletsDialogOpen: Dispatch<SetStateAction<boolean>>;
  rememberTextSelectionForRibbon: () => void;
  openPresentationFontDialog: (tab?: PresentationFontDialogTab) => void;
  openPresentationParagraphDialog: () => void;
  clipboardHasContent: boolean;
  clipboardCanPastePicture: boolean;
  clipboardCanPasteTextOnly: boolean;
  activeIndexRef: RefObject<number>;
  autosave: ReturnType<typeof embeddedPresentationAutosave>;
  canUndo: boolean;
  canRedo: boolean;
  activeSlide: SlideModel;
  reuseSlidesWritable: boolean;
  newSlideFromLayoutIsWritable: (layoutValue: unknown) => boolean;
  defaultNewSlideWritable: boolean;
  anyNewSlideLayoutWritable: boolean;
  activeLayoutChoiceIsWritable: (layoutValue: string) => boolean;
  /** A built-in layout id, or an imported deck's own layout (`native-layout:<part>`). */
  activeLayoutGalleryId: string;
  sectionGroups: SectionGroup<SlideModel>[];
  activeSlideBounds: { width: number; height: number; };
  shapeStyleRecipes: readonly OfficeShapeStyleRecipe[];
  contextualShapeStyleSelectionIsEligible: boolean;
  contextualShapeObjectMatchesStyle: (recipe: OfficeShapeStyleRecipe) => boolean;
  contextualTableCellFormatState: { fill: Readonly<{ mixed: boolean; value: string | null; }> | null; bevel: Readonly<{ mixed: boolean; value: "none" | "circle" | "relaxedInset" | "slope" | "cross" | "angle" | "softRound" | "convex" | "coolSlant" | "divot" | "riblet" | "hardEdge" | "artDeco"; }> | null; color: Readonly<{ mixed: boolean; value: string | null; }> | null; highlight: Readonly<{ mixed: boolean; value: string | null; }> | null; fontFamily: Readonly<{ mixed: boolean; value: TableCellFontFamily | null; }> | null; fontSize: Readonly<{ mixed: boolean; value: number | null; }> | null; bold: Readonly<{ mixed: boolean; value: boolean; }> | null; italic: Readonly<{ mixed: boolean; value: boolean; }> | null; underline: Readonly<{ mixed: boolean; value: boolean; }> | null; strike: Readonly<{ mixed: boolean; value: boolean; }> | null; superscript: Readonly<{ mixed: boolean; value: boolean; }> | null; subscript: Readonly<{ mixed: boolean; value: boolean; }> | null; align: Readonly<{ mixed: boolean; value: "left" | "right" | "center" | "justify" | "distributed" | "thaiDistributed" | "justifyLow"; }> | null; verticalAlign: Readonly<{ mixed: boolean; value: "top" | "middle" | "bottom"; }> | null; textDirection: Readonly<{ mixed: boolean; value: "horizontal" | "rotate-90" | "rotate-270" | "stacked" | "eastAsianVertical" | "mongolianVertical" | "stackedRightToLeft"; }> | null; marginLeft: Readonly<{ mixed: boolean; value: number | null; }> | null; marginRight: Readonly<{ mixed: boolean; value: number | null; }> | null; marginTop: Readonly<{ mixed: boolean; value: number | null; }> | null; marginBottom: Readonly<{ mixed: boolean; value: number | null; }> | null; };
  contextualTableCellFontSections: { id: string; options: ({ id: "Aptos" | "Calibri" | "Arial" | "Cambria" | "Times New Roman" | "Georgia" | "Courier New" | "Consolas" | "DengXian" | "Microsoft YaHei" | "SimSun" | "PingFang SC" | "Microsoft JhengHei" | "Yu Gothic" | "Malgun Gothic"; label: "Aptos" | "Calibri" | "Arial" | "Cambria" | "Times New Roman" | "Georgia" | "Courier New" | "Consolas" | "DengXian (等线)" | "Microsoft YaHei (微软雅黑)" | "SimSun (宋体)" | "PingFang SC (苹方)" | "Microsoft JhengHei (微軟正黑體)" | "Yu Gothic (游ゴシック)" | "Malgun Gothic (맑은 고딕)"; value: "Aptos" | "Calibri" | "Arial" | "Cambria" | "Times New Roman" | "Georgia" | "Courier New" | "Consolas" | "DengXian" | "Microsoft YaHei" | "SimSun" | "PingFang SC" | "Microsoft JhengHei" | "Yu Gothic" | "Malgun Gothic"; previewFamily: "Aptos, Calibri, 'Segoe UI', sans-serif" | "Calibri, 'Segoe UI', Candara, sans-serif" | "Arial, 'Helvetica Neue', Helvetica, sans-serif" | "Cambria, Georgia, 'Times New Roman', serif" | "'Times New Roman', Times, serif" | "Georgia, Cambria, 'Times New Roman', serif" | "'Courier New', Courier, monospace" | "Consolas, 'SFMono-Regular', Menlo, monospace" | "DengXian, 'Microsoft YaHei', 'PingFang SC', sans-serif" | "'Microsoft YaHei', 'PingFang SC', sans-serif" | "SimSun, 'Songti SC', serif" | "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif" | "'Microsoft JhengHei', 'PingFang TC', sans-serif" | "'Yu Gothic', 'Hiragino Kaku Gothic ProN', sans-serif" | "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"; selected: boolean; testId: string; } | { id: string; label: string; value: null; selected: boolean; testId: string; })[]; }[];
  applyDeckSections: (nextSections: readonly SlideSection[]) => void;
  createSectionAtSlide: (slideIndex: number) => void;
  removeDeckSection: (sectionId: string) => void;
  sectionMenuState: (sectionId: string | null) => PresentationSectionMenuState;
  runSectionCommand: (command: PresentationSectionCommand, sectionId: string | null) => void;
  undo: () => void;
  redo: () => void;
  openOnlinePictureDialog: () => void;
  addSlideFromLayout: (layoutValue?: string, afterSlideId?: string) => void;
  formatPaneShowing: boolean;
  toggleFormatPane: () => void;
  formatPaneInFront: boolean;
  openFormatPaneAtText: () => void;
  resolveLiveTextBlock: (blockId?: string | null, includeShapes?: boolean) => { liveSlides: SlideModel[]; liveIndex: number; liveSlide: SlideModel; blockIndex: number; block: PresentationTextBlock; } | null;
  updateTextBlockStyle: (blockId: string, patch: Partial<PresentationTextStyle>) => boolean;
  clearLiveRibbonList: () => boolean;
  applyLiveListLibraryItem: (item: PresentationListLibraryItem) => boolean;
  shiftLiveRibbonParagraphIndent: (delta: -1 | 1) => boolean;
  updateLiveRibbonParagraphStyle: (patch: Partial<PresentationTextStyle>) => boolean;
  updateLiveRibbonColumnCount: (count: number) => boolean;
  setColumnsDialogTarget: Dispatch<SetStateAction<{ blockId: string; count: number; spacingEmu: number; } | null>>;
  applyLiveRibbonRunFormat: (patch: Partial<RunStyle>) => boolean;
  stepLiveRibbonFontSize: (direction: 1 | -1) => boolean;
  toggleLiveRibbonRunStyle: (key: ToggleableRunStyleKey) => boolean;
  transformLiveRibbonTextCase: (mode: ChangeCaseMode) => boolean;
  clearLiveRibbonTextFormatting: () => boolean;
  inkInteractionMode: ("draw" | "eraser" | "lasso") | null;
  selectedShapeBlocks: readonly PresentationShapeBlock[];
  drawingShapeBlock: PresentationShapeBlock | null;
  drawingShapeOutlineSelectionIsEligible: boolean;
  drawingShapeSelectionSupportsFill: boolean;
  insertTextBox: (writingMode?: "vertical-rl") => void;
  updateLiveSelectedShape: (patch: Partial<PresentationShapeBlock>) => void;
  applyShapeStyleRecipe: (recipe: OfficeShapeStyleRecipe) => boolean;
  beginShapeFillImageUpload: (blockId: string) => void;
  armFormatPainterSticky: () => void;
  convertTextBlockToSmartArt: (blockId: string, kind: SmartArtKind) => void;
  convertToSmartArtTarget: PresentationBlock | null;
  convertToSmartArtLabels: { command: string; tooltip: string; more: string; unavailable: string; layoutName: (office: string) => string; categoryLabel: (category: string) => string; catalogLayoutName: (layoutId: string) => string; catalogLayoutDescription: (layoutId: string) => string; };
  ribbonTableHomeWritable: boolean;
  presentationLayoutDisplayName: (layout: { id: string; nameKey: string; }) => string;
  deckLayoutGroups: { masterKey: string; layouts: LayoutDefinition[]; }[];
  layoutGalleryGroupHeading: (masterKey: string) => string;
  ribbonTextBlock: PresentationTextBlock | null;
  /** A text box's or a shape's words: what the paragraph commands format. */
  ribbonParagraphBlock: PresentationBlock | null;
  /** A SmartArt graphic's shape selected whole: Decrease / Increase List
   * Level are greyed, as PowerPoint greys them (`listLevelGreyedForSmartArtShape`). */
  ribbonListLevelGreyed?: boolean;
  /** A table's cells take Bullets / Numbering (FIXQUEUE R28): the list controls stand for them too. */
  ribbonTableListsWritable?: boolean;
  featureDecision: (featureId: string) => ResolvedPresentationFeatureCommand;
  executePresentationFeature: (featureId: string) => undefined;
  executeHomeLayout: (layoutId: string) => void;
  executeHomeShapeInsert: (selection: PresentationShapeCatalogSelection) => void;
  executeImageFileFromTrigger: (trigger: HTMLElement | null) => void;
  ribbonHomeObjectTargets: PresentationHomeObjectTargets | null;
  ribbonHomeObjectState: OfficeHomeObjectTextState | null;
  ribbonCharacterWritable: boolean;
  ribbonCharacterStyle: { fontFamily?: string; themeFontRole?: "heading" | "body"; fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean; underlineStyle?: RunStyle["underlineStyle"]; strike?: boolean; caps?: "all" | "small"; color?: string; superscript?: boolean; subscript?: boolean; highlight?: string; textOutline?: string; href?: string; proofingLanguage?: string; noProof?: boolean; linkTooltip?: string; } | null | undefined;
  ribbonCharacterActive: (key: ToggleableRunStyleKey) => boolean | "mixed";
  ribbonParagraphFormatState: PresentationParagraphFormatState | null;
  ribbonListKind: "mixed" | ParagraphBullet | null;
  presentationNumberLibrary: readonly PresentationListLibraryItem[];
  ribbonListItemId: string | null;
  ribbonBlockFontFamily: string | undefined;
  ribbonInheritedFontFamily: string;
  ribbonThemeHeadingFontFamily: string;
  ribbonThemeBodyFontFamily: string;
  ribbonTextBlockIsTitle: boolean;
  ribbonTextFontMixed: boolean;
  ribbonHasFontTarget: boolean;
  ribbonTextFontFamily: string | undefined;
  presentationFontFamilyLabel: (family: string) => string;
  /** The interface language's names of the Office families (黑体 for SimHei), for All Fonts. */
  presentationFontDisplayNames: Readonly<Record<string, string>>;
  ribbonTextFontSize: number | undefined;
  ribbonFontSizeFromPoints: (next: string) => number | undefined;
  ribbonCharacterSpacingPreset: "veryTight" | "tight" | "normal" | "loose" | "veryLoose" | null;
  /** Character Spacing (points) on the characters Home acts on. */
  applyLiveCharacterSpacing: (points: number) => boolean;
  insertCapacityReached: boolean;
  activeRibbonTab: "home";
  shapeArrowsEnabled: boolean;
  shapeArrowsPicker: JSX.Element;
  presentationArrangeMenuProps: { labels: { reorderObjects: string; reorderOverlapping: string; orderObjects: string; bringToFront: string; sendToBack: string; bringForward: string; sendBackward: string; groupObjects: string; group: string; ungroup: string; regroup: string; positionObjects: string; align: string; rotate: string; selectionPane: string; alignSections: OfficeAlignMenuSectionLabels; alignAction: (action: OfficeObjectAlignAction) => string; rotateAction: (action: "rotateRight90" | "rotateLeft90" | "flipVertical" | "flipHorizontal") => string; moreRotationOptions: string; }; icons: { bringToFront: JSX.Element; sendToBack: JSX.Element; bringForward: JSX.Element; sendBackward: JSX.Element; group: JSX.Element; ungroup: JSX.Element; align: JSX.Element; rotate: JSX.Element; selectionPane: JSX.Element; }; reorder: { disabled: boolean; disabledReason: string; onSelect: () => void; }; reorderOverlapping: { disabled: boolean; disabledReason: string; onSelect: () => void; }; order: { isDisabled: (action: "bringToFront" | "sendToBack" | "bringForward" | "sendBackward") => boolean; onAction: (action: "bringToFront" | "sendToBack" | "bringForward" | "sendBackward") => void; }; group: { disabled: boolean; disabledReason: string; onSelect: () => void; }; ungroup: { disabled: boolean; disabledReason: string; onSelect: () => void; }; regroup: { disabled: boolean; disabledReason: string; onSelect: () => void; }; align: { disabled: boolean; isDisabled: (action: OfficeObjectAlignAction) => boolean; onAction: (action: OfficeObjectAlignAction) => void; target: { toTarget: boolean; targetLabel: string; selectedLabel: string; selectedDisabled: boolean; onChange: (next: boolean) => void; targetTestId: string | undefined; selectedTestId: string | undefined; }; }; rotate: { disabled: boolean; onAction: (action: "rotateRight90" | "rotateLeft90" | "flipVertical" | "flipHorizontal") => void; more: { disabled: boolean; onSelect: () => void; }; }; selectionPane: { disabled: boolean; controlId: string; onSelect: () => undefined; }; };
}

export function PresentationHomeRibbonTab({ ctl }: { ctl: PresentationHomeRibbonTabCtl }) {
  const {
    t,
    smartArtPlaceholders,
    homePicturesMenuTriggerRef,
    homeSelectMenuTriggerRef,
    homeShapesMenuTriggerRef,
    homeArrangeMenuTriggerRef,
    imageInsertBusy,
    selectionPaneReturnFocusRef,
    setReplaceFontsOpen,
    replaceFontsTriggerRef,
    homeFontSizeDraft,
    setHomeFontSizeDraft,
    openFindReplacePanel,
    textColorFace,
    textColorFaceRef,
    rememberTextColorFace,
    textHighlightFace,
    textHighlightFaceRef,
    rememberTextHighlightFace,
    homeTextColorMenuTriggerRef,
    homeTextHighlightMenuTriggerRef,
    homeTextColorPaletteOpen,
    setHomeTextColorPaletteOpen,
    homeTextHighlightPaletteOpen,
    setHomeTextHighlightPaletteOpen,
    homeBulletGalleryOpen,
    setHomeBulletGalleryOpen,
    homeNumberGalleryOpen,
    setHomeNumberGalleryOpen,
    homeTextColorRecents,
    setHomeTextColorRecents,
    homeShapeColorMenu,
    setHomeShapeColorMenu,
    homeShapeFillMenuTriggerRef,
    homeShapeOutlineMenuTriggerRef,
    shapeFormatRecentColors,
    setShapeFormatRecentColors,
    formatPainter,
    fontDialogTab,
    paragraphDialogOpen,
    setBulletsDialogOpen,
    rememberTextSelectionForRibbon,
    openPresentationFontDialog,
    openPresentationParagraphDialog,
    clipboardHasContent,
    clipboardCanPastePicture,
    clipboardCanPasteTextOnly,
    autosave,
    canUndo,
    canRedo,
    activeSlide,
    reuseSlidesWritable,
    newSlideFromLayoutIsWritable,
    defaultNewSlideWritable,
    anyNewSlideLayoutWritable,
    activeLayoutChoiceIsWritable,
    activeLayoutGalleryId,
    sectionGroups,
    activeSlideBounds,
    shapeStyleRecipes,
    contextualShapeStyleSelectionIsEligible,
    contextualShapeObjectMatchesStyle,
    contextualTableCellFormatState,
    contextualTableCellFontSections,
    sectionMenuState,
    runSectionCommand,
    undo,
    redo,
    openOnlinePictureDialog,
    addSlideFromLayout,
    formatPaneShowing,
    toggleFormatPane,
    formatPaneInFront,
    openFormatPaneAtText,
    resolveLiveTextBlock,
    clearLiveRibbonList,
    applyLiveListLibraryItem,
    shiftLiveRibbonParagraphIndent,
    updateLiveRibbonParagraphStyle,
    updateLiveRibbonColumnCount,
    setColumnsDialogTarget,
    applyLiveRibbonRunFormat,
    stepLiveRibbonFontSize,
    toggleLiveRibbonRunStyle,
    transformLiveRibbonTextCase,
    clearLiveRibbonTextFormatting,
    inkInteractionMode,
    selectedShapeBlocks,
    drawingShapeBlock,
    drawingShapeOutlineSelectionIsEligible,
    drawingShapeSelectionSupportsFill,
    insertTextBox,
    updateLiveSelectedShape,
    applyShapeStyleRecipe,
    beginShapeFillImageUpload,
    armFormatPainterSticky,
    convertTextBlockToSmartArt,
    convertToSmartArtTarget,
    convertToSmartArtLabels,
    ribbonTableHomeWritable,
    presentationLayoutDisplayName,
    deckLayoutGroups,
    layoutGalleryGroupHeading,
    ribbonTextBlock,
    ribbonParagraphBlock,
    ribbonListLevelGreyed,
    ribbonTableListsWritable = false,
    featureDecision,
    executePresentationFeature,
    executeHomeLayout,
    executeHomeShapeInsert,
    executeImageFileFromTrigger,
    ribbonHomeObjectTargets,
    ribbonHomeObjectState,
    ribbonCharacterWritable,
    ribbonCharacterStyle,
    ribbonCharacterActive,
    ribbonParagraphFormatState,
    ribbonListKind,
    presentationNumberLibrary,
    ribbonListItemId,
    ribbonBlockFontFamily,
    ribbonInheritedFontFamily,
    ribbonThemeHeadingFontFamily,
    ribbonThemeBodyFontFamily,
    ribbonTextBlockIsTitle,
    ribbonTextFontMixed,
    ribbonHasFontTarget,
    ribbonTextFontFamily,
    presentationFontFamilyLabel,
    presentationFontDisplayNames,
    ribbonTextFontSize,
    ribbonFontSizeFromPoints,
    ribbonCharacterSpacingPreset,
    applyLiveCharacterSpacing,
    insertCapacityReached,
    activeRibbonTab,
    shapeArrowsEnabled,
    shapeArrowsPicker,
    presentationArrangeMenuProps,
  } = ctl;
  // The section the ribbon's Section commands act on: the active slide's.
  const activeSlideSectionId =
    sectionGroups.find((group) =>
      group.slides.some((slide) => slide.id === activeSlide.id),
    )?.section?.id ?? null;
  return (
                  <>
                    {/* UNDO group — the leading Home group of PowerPoint for
                        the web, which has no Quick Access Toolbar to hold them
                        ("select Undo in the ribbon", Microsoft Support, "Undo,
                        redo, or repeat an action", web tab). The same shared
                        rail the Docs and Spreadsheet Home tabs lead with; it
                        runs the same history commands as the action rail's
                        Undo/Redo, which `d16fc44054` had made the only pair. */}
                    <OfficeHomeUndoRail
                      label={t("presentation.undo")}
                      testId="presentation-home-undo-rail"
                      undo={{
                        icon: <Undo2 size={18} />,
                        label: t("presentation.undo"),
                        disabled: !canUndo,
                        onClick: undo,
                        testId: "presentation-home-undo",
                      }}
                      redo={{
                        icon: <Redo2 size={18} />,
                        label: t("presentation.redo"),
                        disabled: !canRedo,
                        onClick: redo,
                        testId: "presentation-home-redo",
                      }}
                    />
                    {activeRibbonTab === "home" ? (
                      /* CLIPBOARD group — first after Undo, as in PowerPoint.
                         Paste / Cut / Copy reuse the block-clipboard commands
                         the keyboard and context menu already run; the format
                         painter moved here from its own group, matching where
                         PPT keeps it. */
                      <OfficeHomeRibbonGroup
                        label={t("toolbar.ribbonClipboard")}
                        size="standard"
                        testId="presentation-home-clipboard-group"
                      >
                        <DropdownMenu>
                          <OfficeHomeClipboardComposite
                            primary={
                              <OfficeHomeCommand
                                controlId="PPTCTL.RIBBON.HOME.CLIPBOARD.PASTE.PRIMARY"
                                variant="large"
                                icon={
                                  <DocsHomeIcon
                                    name="paste"
                                    size={24}
                                    data-presentation-ribbon-icon="paste"
                                  />
                                }
                                label={t("toolbar.paste")}
                                onClick={() =>
                                  executePresentationFeature("clipboard.paste")
                                }
                                disabled={
                                  !featureDecision("clipboard.paste").enabled
                                }
                                testId="presentation-ribbon-paste"
                              />
                            }
                            trigger={
                              <DropdownMenuTrigger asChild>
                                <OfficeHomeMenuTrigger
                                  data-control-id="PPTCTL.RIBBON.HOME.CLIPBOARD.PASTE.MENU"
                                  className="note-editor-office-toolbar__split-chevron presentation-home-clipboard-trigger"
                                  variant="icon"
                                  icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                                  label={t("toolbar.pasteOptions")}
                                  disabled={
                                    !featureDecision("clipboard.paste").enabled
                                  }
                                  testId="presentation-ribbon-paste-options"
                                />
                              </DropdownMenuTrigger>
                            }
                            actions={
                              <>
                                <OfficeHomeCommand
                                  controlId="PPTCTL.RIBBON.HOME.CLIPBOARD.CUT"
                                  variant="compact"
                                  icon={
                                    <DocsHomeIcon
                                      name="cut"
                                      size={16}
                                      data-presentation-ribbon-icon="cut"
                                    />
                                  }
                                  label={t("toolbar.cut")}
                                  disabled={
                                    !featureDecision("clipboard.cut").enabled
                                  }
                                  onClick={() =>
                                    executePresentationFeature("clipboard.cut")
                                  }
                                  testId="presentation-ribbon-cut"
                                />
                                <OfficeHomeCommand
                                  controlId="PPTCTL.RIBBON.HOME.CLIPBOARD.COPY"
                                  variant="compact"
                                  icon={
                                    <DocsHomeIcon
                                      name="copy"
                                      size={16}
                                      data-presentation-ribbon-icon="copy"
                                    />
                                  }
                                  label={t("toolbar.copy")}
                                  disabled={
                                    !featureDecision("clipboard.copy").enabled
                                  }
                                  onClick={() =>
                                    executePresentationFeature("clipboard.copy")
                                  }
                                  testId="presentation-ribbon-copy"
                                />
                                <OfficeHomeCommand
                                  controlId="PPTCTL.RIBBON.HOME.CLIPBOARD.FORMAT_PAINTER"
                                  variant="compact"
                                  icon={
                                    <DocsHomeIcon
                                      name="formatPainter"
                                      size={16}
                                      data-presentation-ribbon-icon="format-painter"
                                    />
                                  }
                                  label={t("presentation.formatPainter")}
                                  displayLabel={t("toolbar.formatPainter")}
                                  active={Boolean(formatPainter)}
                                  onClick={() =>
                                    executePresentationFeature(
                                      "clipboard.formatPainter",
                                    )
                                  }
                                  onDoubleClick={armFormatPainterSticky}
                                  disabled={
                                    !featureDecision("clipboard.formatPainter")
                                      .enabled
                                  }
                                  armedState={formatPainter?.mode}
                                  testId="presentation-ribbon-format-painter"
                                />
                              </>
                            }
                            testId="presentation-home-clipboard-split-slot"
                            splitTestId="presentation-home-paste-split"
                            actionsTestId="presentation-home-clipboard-stack"
                          />
                          <DropdownMenuContent
                            align="start"
                          >
                            <DropdownMenuItem
                              disabled={
                                !clipboardHasContent ||
                                !featureDecision(
                                  "clipboard.pasteUseDestinationTheme",
                                ).enabled
                              }
                              onSelect={() =>
                                executePresentationFeature(
                                  "clipboard.pasteUseDestinationTheme",
                                )
                              }
                              data-testid="presentation-ribbon-paste-theme"
                            >
                              <DocsHomeIcon
                                name="paste"
                                size={14}
                                data-presentation-ribbon-icon="paste"
                              />
                              {t("presentation.home.useDestinationTheme")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                !clipboardHasContent ||
                                !featureDecision("clipboard.pasteKeepSource")
                                  .enabled
                              }
                              onSelect={() =>
                                executePresentationFeature(
                                  "clipboard.pasteKeepSource",
                                )
                              }
                              data-testid="presentation-ribbon-paste-keep"
                            >
                              <DocsHomeIcon
                                name="paste"
                                size={14}
                                data-presentation-ribbon-icon="paste"
                              />
                              {t("toolbar.pasteKeepSource")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                !clipboardCanPastePicture ||
                                !featureDecision("clipboard.pastePicture")
                                  .enabled
                              }
                              onSelect={() =>
                                executePresentationFeature(
                                  "clipboard.pastePicture",
                                )
                              }
                              data-testid="presentation-ribbon-paste-picture"
                            >
                              <ImageIcon size={14} aria-hidden="true" />
                              {t("toolbar.pasteSpecialPicture")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                !clipboardCanPasteTextOnly ||
                                !featureDecision("clipboard.pasteTextOnly")
                                  .enabled
                              }
                              onSelect={() =>
                                executePresentationFeature(
                                  "clipboard.pasteTextOnly",
                                )
                              }
                              data-testid="presentation-ribbon-paste-text-only"
                            >
                              <IconPasteTextOnly size={14} />
                              {t("presentation.pasteTextOnly")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </OfficeHomeRibbonGroup>
                    ) : null}
                    {/* Desktop PowerPoint's Home tab has no Delete group
                        (PPT-A015): Delete is the key, the context menu and
                        the slide rail's own command. */}
                    {activeRibbonTab === "home" ? (
                      <OfficeHomeRibbonGroup
                        label={t("presentation.home.slidesGroup")}
                        size="standard"
                        className={presentationChrome.homeSlidesGroup}
                        testId="presentation-home-slides-group"
                      >
                        <OfficeHomeCommandRow>
                          <div
                            className="presentation-home-intrinsic-slot"
                            data-testid="presentation-home-slides-new-slot"
                          >
                          <DropdownMenu>
                            <OfficeHomeSplitLayout
                              testId="presentation-home-new-slide-split"
                              primary={
                                <OfficeHomeCommand
                                  controlId="PPTCTL.RIBBON.HOME.SLIDES.NEW.PRIMARY"
                                  variant="large"
                                  icon={<IconNewSlide home size={24} />}
                                  label={t("presentation.addSlide")}
                                  displayLabel={t("presentation.addSlide")}
                                  disabled={!defaultNewSlideWritable}
                                  onClick={() =>
                                    executePresentationFeature("slides.new")
                                  }
                                  testId="presentation-ribbon-new-slide"
                                />
                              }
                              trigger={
                                <DropdownMenuTrigger asChild>
                                  <OfficeHomeMenuTrigger
                                    data-control-id="PPTCTL.RIBBON.HOME.SLIDES.NEW.MENU"
                                    variant="icon"
                                    icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                                    label={t("presentation.newSlideFromLayout")}
                                    // The menu also holds Duplicate Selected
                                    // Slides and Reuse Slides (PPT-A016), so
                                    // it opens whenever any of its commands can
                                    // run, not only a layout.
                                    disabled={
                                      !anyNewSlideLayoutWritable &&
                                      !featureDecision(DUPLICATE_SLIDE_COMMAND_ID)
                                        .enabled &&
                                      !featureDecision("slides.reuse").enabled
                                    }
                                    testId="presentation-ribbon-new-slide-layout"
                                  />
                                </DropdownMenuTrigger>
                              }
                            />
                            <DropdownMenuContent
                              align="start"
                              className={officeInsertGallery.flyout}
                              data-smartart-gallery-application="presentation"
                            >
                              {/* PPT's new-slide gallery: a headed grid of
                                  LIVE layout thumbnails (drawn from each
                                  layout's own placeholder geometry) on the
                                  shared insert-gallery cards, then the
                                  gallery footer. */}
                              {deckLayoutGroups.map((group, groupIndex) => (
                              <Fragment key={group.masterKey}>
                              <DropdownMenuLabel
                                className={officeInsertGallery.sectionHeading}
                                data-testid={
                                  groupIndex === 0
                                    ? "presentation-new-slide-gallery-heading"
                                    : `presentation-new-slide-gallery-heading-${group.masterKey}`
                                }
                              >
                                {layoutGalleryGroupHeading(group.masterKey)}
                              </DropdownMenuLabel>
                              <div
                                className={officeInsertGallery.grid}
                                data-testid={
                                  groupIndex === 0
                                    ? "presentation-new-slide-gallery"
                                    : `presentation-new-slide-gallery-${group.masterKey}`
                                }
                              >
                                {group.layouts.map((layout) => (
                                  <DropdownMenuItem
                                    key={layout.id}
                                    className={officeInsertGallery.card}
                                    disabled={
                                      !newSlideFromLayoutIsWritable(layout.id)
                                    }
                                    onSelect={() =>
                                      addSlideFromLayout(layout.id)
                                    }
                                    data-testid={`presentation-ribbon-new-slide-${layout.id}`}
                                  >
                                    <span className={officeInsertGallery.preview}>
                                      <LayoutThumbnail layout={layout} />
                                    </span>
                                    <span className={presentationChrome.newSlideLayoutName}>
                                      {presentationLayoutDisplayName(layout)}
                                    </span>
                                  </DropdownMenuItem>
                                ))}
                              </div>
                              </Fragment>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={
                                  !featureDecision(DUPLICATE_SLIDE_COMMAND_ID)
                                    .enabled
                                }
                                onSelect={() =>
                                  executePresentationFeature(
                                    "slides.duplicate",
                                  )
                                }
                                data-testid="presentation-ribbon-new-slide-duplicate"
                              >
                                <IconDuplicateSlide home size={14} />
                                {t("presentation.duplicateSlide")}
                              </DropdownMenuItem>
                              {/* PPT's remaining slide-ingest commands. */}
                              <DropdownMenuItem
                                onSelect={() =>
                                  executePresentationFeature(
                                    "slides.fromOutline",
                                  )
                                }
                                data-testid="presentation-ribbon-new-from-outline"
                              >
                                <IconOutlineImport size={14} />
                                {/* PowerPoint's New Slide ▾ says "Outline..." (PPT-A032). */}
                                {t("presentation.newSlide.outline")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={
                                  !featureDecision("slides.reuse").enabled
                                }
                                title={
                                  reuseSlidesWritable
                                    ? undefined
                                    : t("presentation.editTargetNotFound")
                                }
                                onSelect={() =>
                                  executePresentationFeature("slides.reuse")
                                }
                                data-control-id="PPTCTL.RIBBON.HOME.SLIDES.REUSE"
                                data-testid="presentation-ribbon-reuse-slides"
                              >
                                <IconReuseSlides size={14} />
                                {t("presentation.home.reuseSlides")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          </div>
                          <div
                            className="presentation-home-intrinsic-stack"
                            data-testid="presentation-home-slides-stack"
                          >
                          <OfficeHomeCommandRow>
                            <OfficeHomeCommandStack>
                              {/* 版式▾ is the SAME gallery applied to the
                                  current slide, current layout highlighted —
                                  PPT's Layout dropdown. */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <OfficeHomeMenuTrigger
                                    data-control-id="PPTCTL.RIBBON.HOME.SLIDES.LAYOUT"
                                    variant="compact"
                                    hasMenuIndicator
                                    icon={<IconSlideLayout home size={16} />}
                                    displayLabel={t("presentation.layoutLabel")}
                                    label={t("presentation.applyLayout")}
                                    disabled={
                                      !featureDecision("slides.layout").enabled
                                    }
                                    testId="presentation-ribbon-layout"
                                  />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="start"
                                  style={{ width: "min(680px, calc(100vw - 48px))", maxWidth: "none" }}
                                >
                                  {deckLayoutGroups.map((group, groupIndex) => (
                                  <Fragment key={group.masterKey}>
                                  <DropdownMenuLabel
                                    data-testid={
                                      groupIndex === 0
                                        ? "presentation-layout-gallery-heading"
                                        : `presentation-layout-gallery-heading-${group.masterKey}`
                                    }
                                  >
                                    {layoutGalleryGroupHeading(group.masterKey)}
                                  </DropdownMenuLabel>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "repeat(4, minmax(150px, 1fr))",
                                      gap: 4,
                                      padding: "4px 6px 8px",
                                    }}
                                    data-testid={
                                      groupIndex === 0
                                        ? "presentation-layout-gallery"
                                        : `presentation-layout-gallery-${group.masterKey}`
                                    }
                                  >
                                    {group.layouts.map((layout) => {
                                      const current =
                                        activeLayoutGalleryId === layout.id;
                                      return (
                                        <DropdownMenuItem
                                          key={layout.id}
                                          onSelect={() =>
                                            executeHomeLayout(layout.id)
                                          }
                                          disabled={
                                            !featureDecision("slides.layout")
                                              .enabled ||
                                            !activeLayoutChoiceIsWritable(
                                              layout.id,
                                            )
                                          }
                                          title={
                                            activeLayoutChoiceIsWritable(
                                              layout.id,
                                            )
                                              ? undefined
                                              : t(
                                                  "presentation.editTargetNotFound",
                                                )
                                          }
                                          data-testid={`presentation-ribbon-layout-${layout.id}`}
                                          aria-current={
                                            current ? "true" : undefined
                                          }
                                          style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: 3,
                                            padding: 5,
                                            outline: current
                                              ? "2px solid var(--ppt-accent, #c43e1c)"
                                              : undefined,
                                            outlineOffset: -2,
                                            borderRadius: 6,
                                          }}
                                        >
                                          <LayoutThumbnail layout={layout} />
                                          <span
                                            style={{
                                              fontSize: 11,
                                              lineHeight: 1.2,
                                              textAlign: "center",
                                              whiteSpace: "nowrap",
                                            }}
                                          >
                                            {presentationLayoutDisplayName(layout)}
                                          </span>
                                        </DropdownMenuItem>
                                      );
                                    })}
                                  </div>
                                  </Fragment>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              {/* PPT-A016: desktop PowerPoint stacks
                                  Layout, Reset and Section under New Slide;
                                  Duplicate Selected Slides lives in the New
                                  Slide menu (above), not on the ribbon. */}
                              <OfficeHomeCommand
                                variant="compact"
                                controlId="PPTCTL.RIBBON.HOME.SLIDES.RESET"
                                icon={<RotateCcw size={16} aria-hidden="true" />}
                                label={t("presentation.resetSlide")}
                                disabled={!featureDecision("slides.reset").enabled}
                                onClick={() =>
                                  executePresentationFeature("slides.reset")
                                }
                                testId="presentation-ribbon-reset-slide"
                              />
                              <PresentationSectionRibbonMenu
                                label={t("presentation.home.section")}
                                labels={{
                                  add: t("presentation.desktopMenu.addSection"),
                                  rename: t("presentation.home.renameSection"),
                                  remove: t("presentation.home.removeSection"),
                                  removeWithSlides: t("presentation.home.removeSectionAndSlides"),
                                  removeAll: t("presentation.home.removeAllSections"),
                                  moveUp: t("presentation.home.moveSectionUp"),
                                  moveDown: t("presentation.home.moveSectionDown"),
                                  collapseAll: t("presentation.home.collapseAllSections"),
                                  expandAll: t("presentation.home.expandAllSections"),
                                }}
                                enabled={sectionMenuState(activeSlideSectionId)}
                                onCommand={(command) =>
                                  runSectionCommand(command, activeSlideSectionId)
                                }
                              />
                            </OfficeHomeCommandStack>
                          </OfficeHomeCommandRow>
                          </div>
                        </OfficeHomeCommandRow>
                      </OfficeHomeRibbonGroup>
                    ) : null}
                    <PresentationHomeAwareGroup
                      home={activeRibbonTab === "home"}
                      label={t("toolbar.ribbonTypeface")}
                      legacyClassName={presentationChrome.homeFontGroup}
                      launcher={{
                        label: t("toolbar.fontDialogTitle"),
                        onClick: () => openPresentationFontDialog("font"),
                        disabled: !ribbonCharacterWritable,
                        active: fontDialogTab !== null,
                        testId: "presentation-home-font-launcher",
                      }}
                    >
                      <PresentationHomeAwareCommandRow
                        home={activeRibbonTab === "home"}
                      >
                        <fieldset
                          disabled={!ribbonCharacterWritable}
                          className="presentation-home-font-fields"
                          style={{
                            border: 0,
                            display: "flex",
                            margin: 0,
                            padding: 0,
                          }}
                          data-testid="presentation-home-font-fields"
                        >
                          <span
                            data-control-id="PPTCTL.RIBBON.HOME.FONT.FAMILY"
                            style={{ display: "contents" }}
                          >
                          <RibbonFontFamilyPicker
                            label={t("toolbar.fontFamily")}
                            activeLabel={
                              ribbonTextFontMixed ||
                              !ribbonTextFontFamily ||
                              !ribbonHasFontTarget
                                ? ""
                                : presentationFontFamilyLabel(
                                    ribbonTextFontFamily,
                                  )
                            }
                            activeFontFamily={
                              ribbonHasFontTarget ? ribbonTextFontFamily : undefined
                            }
                            testId="presentation-ribbon-text-font-family"
                            familyLabels={presentationFontDisplayNames}
                            eastAsianFirst={Object.keys(presentationFontDisplayNames).length > 0}
                            disabled={!ribbonCharacterWritable}
                            mixed={ribbonTextFontMixed}
                            preferenceScope="presentation"
                            retainObjectSelection={ribbonTableHomeWritable}
                            priorityFamilies={[
                              ribbonTextFontFamily ?? ribbonInheritedFontFamily,
                              ribbonInheritedFontFamily,
                            ]}
                            labels={{
                              browse: t("toolbar.fontPickerBrowse"),
                              search: t("toolbar.fontPickerSearch"),
                              searchPlaceholder: t(
                                "toolbar.fontPickerSearchPlaceholder",
                              ),
                              recent: t("toolbar.recentFonts"),
                              pinned: t("toolbar.fontPickerPinned"),
                              officeFonts: t("toolbar.fontPickerOfficeFonts"),
                              allFonts: t("toolbar.fontPickerAllFonts"),
                              pin: t("toolbar.fontPickerPin"),
                              unpin: t("toolbar.fontPickerUnpin"),
                              available: t("toolbar.fontPickerAvailable"),
                              missing: t("toolbar.fontPickerMissing"),
                              unverified: t("toolbar.fontPickerUnverified"),
                              browseUnsupported: t(
                                "toolbar.fontPickerBrowseUnsupported",
                              ),
                              browseDenied: t(
                                "toolbar.fontPickerBrowseDenied",
                              ),
                              browseFailed: t(
                                "toolbar.fontPickerBrowseFailed",
                              ),
                              noResults: t("toolbar.fontPickerNoResults"),
                              variants: t("toolbar.fontPickerVariants"),
                              mixed: t("toolbar.fontPickerMixed"),
                            }}
                            // PowerPoint's list opens with Theme Fonts: the
                            // deck theme's heading and body faces. Picking the
                            // face the block already inherits hands the run
                            // back to the theme; the other face is written.
                            themeFonts={
                              ribbonTableHomeWritable
                                ? undefined
                                : {
                                    label: t("toolbar.fontPickerThemeFonts"),
                                    options: (
                                      [
                                        ["heading", ribbonThemeHeadingFontFamily],
                                        ["body", ribbonThemeBodyFontFamily],
                                      ] as const
                                    ).map(([role, family]) => ({
                                      id: `theme-${role}`,
                                      role,
                                      label: t(
                                        role === "heading"
                                          ? "toolbar.fontPickerThemeHeading"
                                          : "toolbar.fontPickerThemeBody",
                                        { font: presentationFontFamilyLabel(family) },
                                      ),
                                      value: family,
                                      previewFamily: family,
                                      selected:
                                        !ribbonTextFontMixed &&
                                        (ribbonCharacterStyle?.themeFontRole
                                          ? ribbonCharacterStyle.themeFontRole === role
                                          : !ribbonCharacterStyle?.fontFamily &&
                                            !ribbonBlockFontFamily &&
                                            (role === "heading") === ribbonTextBlockIsTitle),
                                      testId: `presentation-ribbon-text-font-family-theme-${role}`,
                                    })),
                                    onSelect: (role) => {
                                      // A deck opened from a file states each run's face: the
                                      // pick hands it to the theme's font by its role (the
                                      // file's `+mj-lt` / `+mn-lt`), so it follows the next
                                      // theme as PowerPoint's Theme Fonts entries do.
                                      // A shape (its words or the whole object) asks the same
                                      // of the shape; a selection of several objects leaves it to
                                      // each object (`PRESENTATION_SMARTART_LABEL_TEXT_ADAPTER`).
                                      const one = ribbonTextBlock ?? ribbonParagraphBlock;
                                      const imported = one
                                        ? typeof (one as { source?: { shapeId?: unknown } }).source?.shapeId === "string"
                                        : ribbonHomeObjectState !== null && !ribbonTableHomeWritable;
                                      const family = role === "heading" ? ribbonThemeHeadingFontFamily : ribbonThemeBodyFontFamily;
                                      applyLiveRibbonRunFormat(
                                        imported && family
                                          ? { fontFamily: family, themeFontRole: role }
                                          : {
                                              fontFamily:
                                                (role === "heading") === ribbonTextBlockIsTitle ? undefined : family,
                                            },
                                      );
                                    },
                                  }
                            }
                            onRememberSelection={
                              rememberTextSelectionForRibbon
                            }
                            onSelect={(family) => {
                              applyLiveRibbonRunFormat({
                                fontFamily: family ?? undefined,
                              });
                            }}
                            onSelectVariant={(variant) =>
                              applyLiveRibbonRunFormat({
                                fontFamily: variant.family,
                                bold: variant.bold || undefined,
                                italic: variant.italic || undefined,
                              })
                            }
                            sections={ribbonTableHomeWritable ? contextualTableCellFontSections.map((section) => ({
                              ...section,
                              options: section.options.map((option) => ({
                                ...option,
                                testId: option.testId.replace("presentation-ribbon-table-cell-font-family", "presentation-ribbon-text-font-family"),
                              })),
                            })) : [
                              {
                                id: "latin",
                                label: t("toolbar.fontFamilyLatinGroup"),
                                options: FONT_FAMILY_VALUES.filter(
                                  (family) =>
                                    !(
                                      CJK_FONT_FAMILY_VALUES as readonly string[]
                                    ).includes(family),
                                ).map((family, index) => ({
                                  id: `latin-${index}`,
                                  label: presentationFontFamilyLabel(family),
                                  value: family,
                                  previewFamily: family,
                                  selected: ribbonTextFontFamily === family,
                                  testId: `presentation-ribbon-text-font-family-latin-${index}`,
                                })),
                              },
                              {
                                id: "cjk",
                                label: t("toolbar.fontCjkFamily"),
                                options: CJK_FONT_FAMILY_VALUES.map(
                                  (family, index) => ({
                                    id: `cjk-${index}`,
                                  label: presentationFontFamilyLabel(family),
                                    value: family,
                                    previewFamily: family,
                                    selected: ribbonTextFontFamily === family,
                                    testId: `presentation-ribbon-text-font-family-cjk-${index}`,
                                  }),
                                ),
                              },
                            ]}
                          />
                          </span>
                          <span
                            data-control-id="PPTCTL.RIBBON.HOME.FONT.SIZE"
                            style={{ display: "contents" }}
                          >
                          <RibbonValueCombobox
                            testId="presentation-ribbon-text-font-size"
                            label={t("presentation.runFontSize")}
                            placeholder={
                              ribbonHasFontTarget ? t("toolbar.fontSize") : ""
                            }
                            inputMode="decimal"
                            className="note-editor-ribbon-value-combobox--font-size"
                            selectOnFocus
                            value={
                              homeFontSizeDraft ??
                              (ribbonHasFontTarget
                                ? String(ribbonTextFontSize ?? "")
                                : "")
                            }
                            options={PRESENTATION_FONT_SIZE_OPTIONS}
                            formatPreview={(value) => {
                              const fontSizePt = parseOfficeFontSizeInput(value, "powerpoint");
                              return fontSizePt === undefined ? null : { fontSizePt };
                            }}
                            onDraftChange={setHomeFontSizeDraft}
                            onFocusChange={(focused) => {
                              if (!focused) setHomeFontSizeDraft(null);
                            }}
                            onRememberSelection={
                              rememberTextSelectionForRibbon
                            }
                            onCommit={(next) => {
                              // Typed in points: a table cell stores points,
                              // the object path takes pixels (and writes
                              // points), and a text box its own unit.
                              // PowerPoint's box: 1 to 3600 in tenths
                              // (shared Office rule), then the run's range.
                              const fontSize = ribbonFontSizeFromPoints(next);
                              if (fontSize === undefined) return false;
                              setHomeFontSizeDraft(null);
                              return applyLiveRibbonRunFormat({ fontSize });
                            }}
                          />
                          </span>
                        </fieldset>
                        <PresentationHomeAwareFontCommand
                          home={activeRibbonTab === "home"}
                          controlId="PPTCTL.RIBBON.HOME.FONT.SHRINK"
                          disabled={!ribbonCharacterWritable}
                          icon={<DocsHomeIcon name="shrinkFont" size={16} />}
                          label={t("presentation.runFontSizeDecrease")}
                          onClick={() => stepLiveRibbonFontSize(-1)}
                          testId="presentation-ribbon-text-font-size-dec"
                          textFormatControl
                        />
                        <PresentationHomeAwareFontCommand
                          home={activeRibbonTab === "home"}
                          controlId="PPTCTL.RIBBON.HOME.FONT.GROW"
                          disabled={!ribbonCharacterWritable}
                          icon={<DocsHomeIcon name="growFont" size={16} />}
                          label={t("presentation.runFontSizeIncrease")}
                          onClick={() => stepLiveRibbonFontSize(1)}
                          testId="presentation-ribbon-text-font-size-inc"
                          textFormatControl
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <OfficeHomeMenuTrigger
                              data-control-id="PPTCTL.RIBBON.HOME.FONT.CASE"
                              variant="icon"
                              hasMenuIndicator
                              icon={
                                activeRibbonTab === "home" ? (
                                  <IconChangeCase home size={16} />
                                ) : (
                                  <CaseSensitive size={16} />
                                )
                              }
                              disabled={!ribbonParagraphBlock}
                              label={t("toolbar.changeCase")}
                              testId="presentation-ribbon-change-case"
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                          >
                            {(
                              [
                                ["sentence", t("toolbar.changeCaseSentence")],
                                ["lower", t("presentation.changeCaseLower")],
                                ["upper", t("presentation.changeCaseUpper")],
                                ["title", t("presentation.changeCaseTitle")],
                                ["toggle", t("presentation.changeCaseToggle")],
                              ] as const
                            ).map(([mode, label]) => (
                              <DropdownMenuItem
                                key={mode}
                                onSelect={() =>
                                  transformLiveRibbonTextCase(mode)
                                }
                                data-testid={`presentation-ribbon-change-case-${mode}`}
                              >
                                {label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {/* CLEAR FORMATTING (PPT font-group eraser): character
                            keys only, over the exact live run selection. */}
                        <PresentationHomeAwareFontCommand
                          home={activeRibbonTab === "home"}
                          controlId="PPTCTL.RIBBON.HOME.FONT.CLEAR"
                          disabled={
                            !ribbonTableHomeWritable && !featureDecision("font.clearFormatting").enabled
                          }
                          icon={
                            <DocsHomeIcon name="clearFormatting" size={16} />
                          }
                          label={t("toolbar.clearFormatting")}
                          onClick={() =>
                            ribbonTableHomeWritable ? clearLiveRibbonTextFormatting() : executePresentationFeature("font.clearFormatting")
                          }
                          testId="presentation-ribbon-clear-format"
                        />
                      </PresentationHomeAwareCommandRow>
                      <PresentationHomeAwareCommandRow
                        home={activeRibbonTab === "home"}
                      >
                        {(
                          [
                            [
                              "bold",
                              "bold",
                              t("toolbar.bold"),
                              "PPTCTL.RIBBON.HOME.FONT.BOLD",
                            ],
                            [
                              "italic",
                              "italic",
                              t("toolbar.italic"),
                              "PPTCTL.RIBBON.HOME.FONT.ITALIC",
                            ],
                            [
                              "underline",
                              "underline",
                              t("toolbar.underline"),
                              "PPTCTL.RIBBON.HOME.FONT.UNDERLINE",
                            ],
                          ] as const
                        ).map(([key, iconName, label, controlId]) => (
                          <PresentationHomeAwareFontCommand
                            key={key}
                            home={activeRibbonTab === "home"}
                            active={ribbonCharacterActive(key)}
                            controlId={controlId}
                            disabled={!ribbonCharacterWritable}
                            icon={
                              <DocsHomeIcon name={iconName} size={16} />
                            }
                            label={label}
                            onClick={() => toggleLiveRibbonRunStyle(key)}
                            testId={`presentation-ribbon-text-${key}`}
                            formatPreview={{ [key]: ribbonCharacterActive(key) !== true, ...(key === "underline" ? { strike: ribbonCharacterActive("strike") === true } : {}) }}
                          />
                        ))}
                        <PresentationHomeAwareFontCommand
                          home={activeRibbonTab === "home"}
                          active={
                            (
                              ribbonTextBlock?.style as
                                | { textShadow?: unknown }
                                | undefined
                            )?.textShadow === true
                          }
                          disabled={
                            !featureDecision("font.textShadow").enabled
                          }
                          icon={<IconTextShadow size={16} />}
                          label={t("presentation.home.textShadow")}
                          onClick={() =>
                            executePresentationFeature("font.textShadow")
                          }
                          testId="presentation-ribbon-text-shadow"
                        />
                        <PresentationHomeAwareFontCommand
                          home={activeRibbonTab === "home"}
                          controlId="PPTCTL.RIBBON.HOME.FONT.STRIKE"
                          active={ribbonCharacterActive("strike")}
                          disabled={!ribbonCharacterWritable}
                          icon={
                            <DocsHomeIcon name="strikethrough" size={16} />
                          }
                          label={t("presentation.runStrike")}
                          onClick={() => toggleLiveRibbonRunStyle("strike")}
                          testId="presentation-ribbon-text-strike"
                          formatPreview={{ strike: ribbonCharacterActive("strike") !== true, underline: ribbonCharacterActive("underline") === true }}
                        />
                        <PresentationHomeAwareFontCommand
                          home={activeRibbonTab === "home"}
                          controlId="PPTCTL.RIBBON.HOME.FONT.SUPERSCRIPT"
                          active={ribbonCharacterActive("superscript")}
                          disabled={!ribbonCharacterWritable}
                          icon={<DocsHomeIcon name="superscript" size={16} />}
                          label={t("presentation.runSuperscript")}
                          onClick={() =>
                            toggleLiveRibbonRunStyle("superscript")
                          }
                          testId="presentation-ribbon-text-superscript"
                          textFormatControl
                        />
                        <PresentationHomeAwareFontCommand
                          home={activeRibbonTab === "home"}
                          controlId="PPTCTL.RIBBON.HOME.FONT.SUBSCRIPT"
                          active={ribbonCharacterActive("subscript")}
                          disabled={!ribbonCharacterWritable}
                          icon={<DocsHomeIcon name="subscript" size={16} />}
                          label={t("presentation.runSubscript")}
                          onClick={() =>
                            toggleLiveRibbonRunStyle("subscript")
                          }
                          testId="presentation-ribbon-text-subscript"
                          textFormatControl
                        />
                        {/* CHARACTER SPACING (PPT-A017): PowerPoint's five
                            presets and More Spacing..., which opens the Font
                            dialog on its Character Spacing page. The box's
                            characters' `letterSpacing` (a:rPr@spc): the
                            selected ones while typed in, else the box. */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <OfficeHomeMenuTrigger
                              data-control-id="PPTCTL.RIBBON.HOME.FONT.CHARACTER_SPACING"
                              variant="icon"
                              hasMenuIndicator
                              icon={<OfficeSemanticIcon semanticId="text.spacing.character" size={16} />}
                              disabled={!ribbonParagraphBlock}
                              label={t("presentation.letterSpacingLabel")}
                              testId="presentation-ribbon-character-spacing"
                              onPointerDown={rememberTextSelectionForRibbon}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {PRESENTATION_CHARACTER_SPACING_PRESETS.map((preset) => (
                              <DropdownMenuItem
                                key={preset.id}
                                role="menuitemcheckbox"
                                aria-checked={ribbonCharacterSpacingPreset === preset.id}
                                onSelect={() => {
                                  if (!ribbonParagraphBlock) return;
                                  // The selected characters while typed in, else the box.
                                  applyLiveCharacterSpacing(preset.points);
                                }}
                                data-testid={`presentation-ribbon-character-spacing-${preset.id}`}
                              >
                                <span aria-hidden="true" className="inline-flex w-4 justify-center">
                                  {ribbonCharacterSpacingPreset === preset.id ? (
                                    <OfficeSemanticIcon semanticId="selection.check" size={14} />
                                  ) : null}
                                </span>
                                {t(`presentation.home.characterSpacing.${preset.id}`)}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => openPresentationFontDialog("spacing")}
                              data-testid="presentation-ribbon-character-spacing-more"
                            >
                              {t("presentation.home.characterSpacing.more")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <PresentationHomeAwareSplitLayout
                          home={activeRibbonTab === "home"}
                          className="presentation-home-intrinsic-split"
                          testId="presentation-home-font-color-split"
                          primary={
                            <PresentationHomeAwareFontCommand
                            home={activeRibbonTab === "home"}
                            controlId="PPTCTL.RIBBON.HOME.FONT.COLOR.PRIMARY"
                            disabled={!ribbonCharacterWritable}
                            icon={
                              <span
                                className="note-editor-office-toolbar__color-glyph"
                                aria-hidden="true"
                              >
                                <DocsHomeIcon name="fontColor" size={17} />
                                <span
                                  className="note-editor-office-toolbar__color-underline"
                                  style={{ backgroundColor: textColorFace }}
                                />
                              </span>
                            }
                            label={t("toolbar.textColor")}
                            onClick={() =>
                              applyLiveRibbonRunFormat({
                                color: textColorFaceRef.current,
                              })
                            }
                            testId="presentation-ribbon-text-color"
                            textFormatControl
                            />
                          }
                          trigger={
                            activeRibbonTab === "home" ? (
                              <OfficeHomeMenuTrigger
                                ref={homeTextColorMenuTriggerRef}
                                data-control-id="PPTCTL.RIBBON.HOME.FONT.COLOR.MENU"
                                variant="icon"
                                disabled={!ribbonCharacterWritable}
                                icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                                label={t("toolbar.textColorMenu")}
                                aria-expanded={homeTextColorPaletteOpen}
                                onClick={() => {
                                  setHomeTextHighlightPaletteOpen(false);
                                  setHomeTextColorPaletteOpen((open) => !open);
                                }}
                                testId="presentation-ribbon-text-color-menu"
                                data-office-text-format-control="true"
                              />
                            ) : (
                              <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <OfficeHomeMenuTrigger
                                ref={homeTextColorMenuTriggerRef}
                                variant="icon"
                                className="note-editor-office-toolbar__split-chevron"
                                disabled={!ribbonCharacterWritable}
                                icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                                label={t("toolbar.textColorMenu")}
                                testId="presentation-ribbon-text-color-menu"
                                data-office-text-format-control="true"
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="start"
                              className="note-editor-color-menu"
                              onCloseAutoFocus={(event) =>
                                restorePresentationHomeMenuFocus(
                                  event,
                                  homeTextColorMenuTriggerRef.current,
                                )
                              }
                            >
                              <PresentationSwatchGrid
                                colors={TEXT_COLOR_VALUES}
                                current={ribbonCharacterStyle?.color}
                                label={t("toolbar.textColor")}
                                onPick={(color) => {
                                  // The face shows a colour the words took.
                                  if (applyLiveRibbonRunFormat({ color })) rememberTextColorFace(color);
                                }}
                                testPrefix="presentation-ribbon-text-color"
                                variant="text"
                              />
                              <DropdownMenuSeparator />
                              <PresentationCustomColorItem
                                label={t("toolbar.textColorCustom")}
                                value={textColorFace}
                                onPick={(color) => {
                                  // The face shows a colour the words took.
                                  if (applyLiveRibbonRunFormat({ color })) rememberTextColorFace(color);
                                }}
                                testId="presentation-ribbon-text-color-custom"
                              />
                              <ColorMenuClearItem
                                label={t("toolbar.textColorClear")}
                                onClear={() =>
                                  applyLiveRibbonRunFormat({
                                    color: undefined,
                                  })
                                }
                                testId="presentation-ribbon-text-color-clear"
                              />
                            </DropdownMenuContent>
                              </DropdownMenu>
                            )
                          }
                        />
                        {activeRibbonTab === "home" &&
                        homeTextColorPaletteOpen ? (
                          <OfficeColorPalettePopover
                            anchorRef={homeTextColorMenuTriggerRef}
                            value={ribbonCharacterStyle?.color}
                            recents={homeTextColorRecents}
                            automaticSelected={
                              ribbonCharacterStyle?.color === undefined
                            }
                            labels={{
                              automatic: t("toolbar.textColorAutomatic"),
                              themeColors: t("spreadsheet.themeColors"),
                              standardColors: t("spreadsheet.standardColors"),
                              recentColors: t("spreadsheet.recentColors"),
                              moreColors: t("toolbar.textColorCustom"),
                            }}
                            onPick={(color) => {
                              if (!color) return;
                              // The face shows a colour the words took.
                              if (applyLiveRibbonRunFormat({ color })) rememberTextColorFace(color);
                              setHomeTextColorRecents((current) =>
                                [
                                  color,
                                  ...current.filter(
                                    (candidate) => candidate !== color,
                                  ),
                                ].slice(0, 8),
                              );
                              setHomeTextColorPaletteOpen(false);
                            }}
                            onAutomatic={() => {
                              applyLiveRibbonRunFormat({ color: undefined });
                              setHomeTextColorPaletteOpen(false);
                            }}
                            onDismiss={() =>
                              setHomeTextColorPaletteOpen(false)
                            }
                            testIdPrefix="presentation-ribbon-text-color"
                            formatPreview="color"
                          />
                        ) : null}
                        <PresentationHomeAwareSplitLayout
                          home={activeRibbonTab === "home"}
                          className="presentation-home-intrinsic-split"
                          testId="presentation-home-font-highlight-split"
                          primary={
                            <PresentationHomeAwareFontCommand
                            home={activeRibbonTab === "home"}
                            controlId="PPTCTL.RIBBON.HOME.FONT.HIGHLIGHT.PRIMARY"
                            disabled={!ribbonCharacterWritable}
                            icon={
                              <span
                                className="note-editor-office-toolbar__color-glyph"
                                aria-hidden="true"
                              >
                                <DocsHomeIcon name="highlight" size={15} />
                                <span
                                  className="note-editor-office-toolbar__color-underline"
                                  style={{
                                    backgroundColor: textHighlightFace,
                                  }}
                                />
                              </span>
                            }
                            label={t("presentation.runHighlight")}
                            onClick={() =>
                              applyLiveRibbonRunFormat({
                                highlight: textHighlightFaceRef.current,
                              })
                            }
                            testId="presentation-ribbon-text-highlight"
                            textFormatControl
                            />
                          }
                          trigger={
                            activeRibbonTab === "home" ? (
                              <OfficeHomeMenuTrigger
                                ref={homeTextHighlightMenuTriggerRef}
                                data-control-id="PPTCTL.RIBBON.HOME.FONT.HIGHLIGHT.MENU"
                                variant="icon"
                                disabled={!ribbonCharacterWritable}
                                icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                                label={t("toolbar.highlightMenu")}
                                aria-expanded={homeTextHighlightPaletteOpen}
                                onClick={() => {
                                  setHomeTextColorPaletteOpen(false);
                                  setHomeTextHighlightPaletteOpen(
                                    (open) => !open,
                                  );
                                }}
                                testId="presentation-ribbon-text-highlight-menu"
                                data-office-text-format-control="true"
                              />
                            ) : (
                              <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <OfficeHomeMenuTrigger
                                ref={homeTextHighlightMenuTriggerRef}
                                variant="icon"
                                className="note-editor-office-toolbar__split-chevron"
                                disabled={!ribbonCharacterWritable}
                                icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                                label={t("toolbar.highlightMenu")}
                                testId="presentation-ribbon-text-highlight-menu"
                                data-office-text-format-control="true"
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="start"
                              className="note-editor-color-menu"
                              onCloseAutoFocus={(event) =>
                                restorePresentationHomeMenuFocus(
                                  event,
                                  homeTextHighlightMenuTriggerRef.current,
                                )
                              }
                            >
                              <PresentationSwatchGrid
                                colors={HIGHLIGHT_COLOR_VALUES}
                                current={ribbonCharacterStyle?.highlight}
                                label={t("presentation.runHighlight")}
                                onPick={(color) => {
                                  // The face shows a highlight the words took.
                                  if (applyLiveRibbonRunFormat({ highlight: color })) rememberTextHighlightFace(color);
                                }}
                                testPrefix="presentation-ribbon-text-highlight"
                                variant="highlight"
                              />
                              <DropdownMenuSeparator />
                              <PresentationCustomColorItem
                                label={t("toolbar.highlightCustom")}
                                value={textHighlightFace}
                                variant="highlight"
                                onPick={(color) => {
                                  // The face shows a highlight the words took.
                                  if (applyLiveRibbonRunFormat({ highlight: color })) rememberTextHighlightFace(color);
                                }}
                                testId="presentation-ribbon-text-highlight-custom"
                              />
                              <ColorMenuClearItem
                                label={t("toolbar.highlightClear")}
                                onClear={() =>
                                  applyLiveRibbonRunFormat({
                                    highlight: undefined,
                                  })
                                }
                                testId="presentation-ribbon-text-highlight-clear"
                              />
                            </DropdownMenuContent>
                              </DropdownMenu>
                            )
                          }
                        />
                        {activeRibbonTab === "home" &&
                        homeTextHighlightPaletteOpen ? (
                          <OfficeColorPalettePopover
                            anchorRef={homeTextHighlightMenuTriggerRef}
                            // Text Highlight Color is Office's highlighter:
                            // No Color and fifteen fixed colours (PPT-A038).
                            swatchSet="highlighter"
                            value={ribbonCharacterStyle?.highlight}
                            allowNoFill
                            noFillSelected={
                              ribbonCharacterStyle?.highlight === undefined
                            }
                            labels={{
                              themeColors: t("presentation.runHighlight"),
                              standardColors: t("spreadsheet.standardColors"),
                              moreColors: t("toolbar.highlightCustom"),
                              noFill: t("office.highlightColor.none"),
                            }}
                            onPick={(color) => {
                              // The face shows a highlight the words took.
                              const applied = applyLiveRibbonRunFormat({
                                highlight: color ?? undefined,
                              });
                              if (color && applied) rememberTextHighlightFace(color);
                              setHomeTextHighlightPaletteOpen(false);
                            }}
                            onDismiss={() =>
                              setHomeTextHighlightPaletteOpen(false)
                            }
                            testIdPrefix="presentation-ribbon-text-highlight"
                            formatPreview="highlight"
                          />
                        ) : null}
                        

                      </PresentationHomeAwareCommandRow>
                    </PresentationHomeAwareGroup>
                    <PresentationHomeAwareGroup
                      home={activeRibbonTab === "home"}
                      label={t("toolbar.ribbonParagraph")}
                      legacyClassName={presentationChrome.homeParagraphGroup}
                      launcher={{
                        label: t("toolbar.paragraphDialogTitle"),
                        onClick: openPresentationParagraphDialog,
                        disabled: !ribbonTextBlock,
                        active: paragraphDialogOpen,
                        testId: "presentation-home-paragraph-launcher",
                      }}
                    >
                      {/* docs 的组内解剖:两条 28px 行住进 col,转换为
                          SmartArt 作为 hstack 兄弟跨两行 — 行高不再被高卡
                          撑爆(84px 轨基准)。 */}
                      <div className="note-editor-ribbon-hstack">
                        <div className="note-editor-ribbon-col">
                      {/* PPT's paragraph rows exactly: lists with their
                          galleries, the indent pair, line spacing and columns
                          on row one; alignment, text direction, align-text and
                          Convert-to-SmartArt on row two. Every command
                          pre-existed — this is PPT's arrangement of them. */}
                      <div className="note-editor-ribbon-row">
                        <PresentationHomeAwareSplitLayout
                          home={activeRibbonTab === "home"}
                          controlId="PPTCTL.RIBBON.HOME.PARAGRAPH.BULLETS"
                          primary={
                            <PresentationHomeAwareFontCommand
                              home={activeRibbonTab === "home"}
                              active={
                                ribbonListKind === "mixed"
                                  ? "mixed"
                                  : ribbonListKind === "bullet"
                              }
                              disabled={!ribbonParagraphBlock && !ribbonTableListsWritable}
                              icon={
                                <IconBulletStyle
                                  home={activeRibbonTab === "home"}
                                  size={16}
                                />
                              }
                              label={t("presentation.home.bullets")}
                              onClick={() =>
                                executePresentationFeature("paragraph.bullets")
                              }
                              testId="presentation-ribbon-text-bullets"
                            />
                          }
                          trigger={
                            <DropdownMenu
                              modal={false}
                              open={homeBulletGalleryOpen}
                              onOpenChange={setHomeBulletGalleryOpen}
                            >
                              <DropdownMenuTrigger asChild>
                                <OfficeHomeMenuTrigger
                                  variant="icon"
                                  className="note-editor-office-toolbar__split-chevron"
                                  disabled={!ribbonParagraphBlock && !ribbonTableListsWritable}
                                  icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                                  label={t("toolbar.bulletListStyleMenu")}
                                  onPointerDown={rememberTextSelectionForRibbon}
                                  testId="presentation-ribbon-bullet-style"
                                />
                              </DropdownMenuTrigger>
                              <OfficeListGalleryMenuContent
                                variant="bullets"
                                heading={t("toolbar.bulletLibrary")}
                                footer={
                                  <DropdownMenuItem
                                    className="docs-cupertino-menu__primary-item"
                                    data-testid="presentation-ribbon-bullets-and-numbering"
                                    onSelect={() => {
                                      setHomeBulletGalleryOpen(false);
                                      setBulletsDialogOpen(true);
                                    }}
                                  >
                                    {t("presentation.bulletsDialog.open")}
                                  </DropdownMenuItem>
                                }
                              >
                                <OfficeListGalleryTile
                                  active={
                                    ribbonListKind === null ||
                                    ribbonListKind === "none"
                                  }
                                  columns={6}
                                  label={t("toolbar.listNone")}
                                  onSelect={() => {
                                    clearLiveRibbonList();
                                    setHomeBulletGalleryOpen(false);
                                  }}
                                  preview={<Ban size={19} aria-hidden />}
                                  testId="presentation-ribbon-bullet-none"
                                />
                                {POWERPOINT_BULLET_LIBRARY.map((item) => (
                                  <OfficeListGalleryTile
                                    key={item.id}
                                    active={ribbonListKind === "bullet" && ribbonListItemId === item.id}
                                    columns={6}
                                    label={t(`presentation.bulletsLibrary.${item.id}` as "presentation.bulletsLibrary.arrow")}
                                    onSelect={() => {
                                      applyLiveListLibraryItem(item);
                                      setHomeBulletGalleryOpen(false);
                                    }}
                                    preview={
                                      <span
                                        aria-hidden
                                        className="note-editor-bullet-glyph-sample"
                                        style={{ fontSize: 23 }}
                                      >
                                        {item.preview}
                                      </span>
                                    }
                                    testId={`presentation-ribbon-bullet-${item.id}`}
                                  />
                                ))}
                              </OfficeListGalleryMenuContent>
                            </DropdownMenu>
                          }
                        />
                        <PresentationHomeAwareSplitLayout
                          home={activeRibbonTab === "home"}
                          controlId="PPTCTL.RIBBON.HOME.PARAGRAPH.NUMBERING"
                          primary={
                            <PresentationHomeAwareFontCommand
                              home={activeRibbonTab === "home"}
                              active={
                                ribbonListKind === "mixed"
                                  ? "mixed"
                                  : ribbonListKind === "number"
                              }
                              disabled={!ribbonParagraphBlock && !ribbonTableListsWritable}
                              icon={
                                <IconNumberStyle
                                  home={activeRibbonTab === "home"}
                                  size={16}
                                />
                              }
                              label={t("presentation.home.numbering")}
                              onClick={() =>
                                executePresentationFeature("paragraph.numbering")
                              }
                              testId="presentation-ribbon-text-numbering"
                            />
                          }
                          trigger={
                            <DropdownMenu
                              modal={false}
                              open={homeNumberGalleryOpen}
                              onOpenChange={setHomeNumberGalleryOpen}
                            >
                              <DropdownMenuTrigger asChild>
                                <OfficeHomeMenuTrigger
                                  variant="icon"
                                  className="note-editor-office-toolbar__split-chevron"
                                  disabled={!ribbonParagraphBlock && !ribbonTableListsWritable}
                                  icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                                  label={t("toolbar.numberedListStyleMenu")}
                                  onPointerDown={rememberTextSelectionForRibbon}
                                  testId="presentation-ribbon-number-style"
                                />
                              </DropdownMenuTrigger>
                              <OfficeListGalleryMenuContent
                                variant="numbering"
                                heading={t("toolbar.numberingLibrary")}
                                footer={
                                  <DropdownMenuItem
                                    className="docs-cupertino-menu__primary-item"
                                    data-testid="presentation-ribbon-numbering-bullets-and-numbering"
                                    onSelect={() => {
                                      setHomeNumberGalleryOpen(false);
                                      setBulletsDialogOpen(true);
                                    }}
                                  >
                                    {t("presentation.bulletsDialog.open")}
                                  </DropdownMenuItem>
                                }
                              >
                                <OfficeListGalleryTile
                                  active={
                                    ribbonListKind === null ||
                                    ribbonListKind === "none"
                                  }
                                  columns={3}
                                  label={t("toolbar.listNone")}
                                  onSelect={() => {
                                    clearLiveRibbonList();
                                    setHomeNumberGalleryOpen(false);
                                  }}
                                  preview={<Ban size={20} aria-hidden />}
                                  testId="presentation-ribbon-number-none"
                                />
                                {presentationNumberLibrary.map((item) => (
                                  <OfficeListGalleryTile
                                    key={item.id}
                                    active={ribbonListKind === "number" && ribbonListItemId === item.id}
                                    columns={3}
                                    label={t(`presentation.bulletsLibrary.${item.id}` as "presentation.bulletsLibrary.arrow")}
                                    onSelect={() => {
                                      applyLiveListLibraryItem(item);
                                      setHomeNumberGalleryOpen(false);
                                    }}
                                    preview={<OfficeListGalleryPreview markers={item.preview.split(" ")} />}
                                    testId={`presentation-ribbon-number-${item.id}`}
                                  />
                                ))}
                              </OfficeListGalleryMenuContent>
                            </DropdownMenu>
                          }
                        />
                        <PresentationHomeAwareFontCommand
                          home={activeRibbonTab === "home"}
                          controlId="PPTCTL.RIBBON.HOME.PARAGRAPH.PROMOTE"
                          disabled={!ribbonParagraphBlock || Boolean(ribbonListLevelGreyed)}
                          icon={
                            <IconParagraphIndent
                              home={activeRibbonTab === "home"}
                              direction="decrease"
                              size={16}
                            />
                          }
                          label={t("toolbar.indentDecrease")}
                          onClick={() => shiftLiveRibbonParagraphIndent(-1)}
                          testId="presentation-ribbon-indent-decrease"
                        />
                        <PresentationHomeAwareFontCommand
                          home={activeRibbonTab === "home"}
                          controlId="PPTCTL.RIBBON.HOME.PARAGRAPH.DEMOTE"
                          disabled={!ribbonParagraphBlock || Boolean(ribbonListLevelGreyed)}
                          icon={
                            <IconParagraphIndent
                              home={activeRibbonTab === "home"}
                              direction="increase"
                              size={16}
                            />
                          }
                          label={t("toolbar.indentIncrease")}
                          onClick={() => shiftLiveRibbonParagraphIndent(1)}
                          testId="presentation-ribbon-indent-increase"
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <OfficeHomeMenuTrigger
                              data-control-id="PPTCTL.RIBBON.HOME.PARAGRAPH.LINE_SPACING"
                              variant="icon"
                              hasMenuIndicator
                              icon={
                                <IconLineSpacing
                                  home={activeRibbonTab === "home"}
                                  size={15}
                                />
                              }
                              disabled={!ribbonParagraphBlock}
                              label={t("presentation.lineSpacingLabel")}
                              testId="presentation-ribbon-line-spacing"
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                          >
                            {/* PowerPoint's Line Spacing menu (PPT-A041):
                                1.0 to 3.0 and Line Spacing Options..., which
                                opens the Paragraph dialog. */}
                            {PRESENTATION_LINE_SPACING_MENU.map((preset) => (
                              <DropdownMenuItem
                                key={preset}
                                role="menuitemcheckbox"
                                aria-checked={
                                  ribbonParagraphFormatState?.lineSpacing === preset
                                }
                                onSelect={() =>
                                  updateLiveRibbonParagraphStyle({
                                    lineSpacing: clampLineSpacing(preset),
                                  })
                                }
                                data-testid={`presentation-ribbon-line-spacing-${preset}`}
                              >
                                <span aria-hidden="true" className="inline-flex w-4 justify-center">
                                  {ribbonParagraphFormatState?.lineSpacing === preset ? (
                                    <OfficeSemanticIcon semanticId="selection.check" size={14} />
                                  ) : null}
                                </span>
                                {preset.toFixed(1)}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={openPresentationParagraphDialog}
                              data-testid="presentation-ribbon-line-spacing-options"
                            >
                              {t("toolbar.lineSpacingOptions")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <OfficeHomeMenuTrigger
                              data-control-id="PPTCTL.RIBBON.HOME.PARAGRAPH.COLUMNS"
                              variant="icon"
                              hasMenuIndicator
                              icon={
                                <IconTextColumns
                                  home={activeRibbonTab === "home"}
                                  size={14}
                                />
                              }
                              disabled={!ribbonParagraphBlock}
                              label={t("presentation.textColumnsLabel")}
                              testId="presentation-ribbon-text-columns"
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                          >
                            {([1, 2, 3] as const).map((count) => (
                              <DropdownMenuItem
                                key={count}
                                onSelect={() =>
                                  updateLiveRibbonColumnCount(count)
                                }
                                data-testid={`presentation-ribbon-columns-${count}`}
                              >
                                {t(`presentation.home.columns.${count}` as "presentation.home.columns.1")}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            {/* PowerPoint's More Columns...: the Columns
                                dialog, count 1-16 and the spacing between
                                columns (PPT-A042). */}
                            <DropdownMenuItem
                              disabled={!ribbonParagraphBlock}
                              onSelect={() => {
                                const target = resolveLiveTextBlock(undefined, true);
                                if (!target) return;
                                setColumnsDialogTarget({
                                  blockId: target.block.id,
                                  count: normalizeColumnCount(target.block.columnCount),
                                  spacingEmu: effectiveColumnSpacingEmu(target.block),
                                });
                              }}
                              data-testid="presentation-ribbon-text-columns-more"
                            >
                              {t("presentation.columnsDialog.more")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="note-editor-ribbon-row">
                        {(
                          [
                            [
                              "left",
                              "PPTCTL.RIBBON.HOME.PARAGRAPH.ALIGN.LEFT",
                            ],
                            [
                              "center",
                              "PPTCTL.RIBBON.HOME.PARAGRAPH.ALIGN.CENTER",
                            ],
                            [
                              "right",
                              "PPTCTL.RIBBON.HOME.PARAGRAPH.ALIGN.RIGHT",
                            ],
                            [
                              "justify",
                              "PPTCTL.RIBBON.HOME.PARAGRAPH.ALIGN.JUSTIFY",
                            ],
                          ] as const
                        ).map(([alignment, controlId]) => (
                          <PresentationHomeAwareFontCommand
                            key={alignment}
                            home={activeRibbonTab === "home"}
                            controlId={controlId}
                            active={
                              ribbonTableHomeWritable
                                ? contextualTableCellFormatState.align?.mixed ? "mixed" : contextualTableCellFormatState.align?.value === alignment
                                : ribbonParagraphFormatState?.align === "mixed"
                                ? "mixed"
                                : ribbonHomeObjectTargets
                                  ? ribbonHomeObjectState?.align === "mixed"
                                    ? "mixed"
                                    : ribbonHomeObjectState?.align === alignment
                                  : ribbonParagraphFormatState?.align === alignment
                            }
                            disabled={!ribbonTextBlock && !ribbonHomeObjectTargets && !ribbonTableHomeWritable}
                            onClick={() =>
                              updateLiveRibbonParagraphStyle({
                                align: alignment,
                              })
                            }
                            icon={
                              <IconParagraphAlign
                                home={activeRibbonTab === "home"}
                                alignment={alignment}
                                size={16}
                              />
                            }
                            label={t(
                              `presentation.align.${alignment}` as "presentation.align.left",
                            )}
                            testId={`presentation-ribbon-text-align-${alignment}`}
                          />
                        ))}
                        {/* 分散对齐 — real now: the model carries `distribute`
                            (the docs engine's value), rendered as justify +
                            text-align-last and exported as algn="dist". */}
                        <PresentationHomeAwareFontCommand
                          home={activeRibbonTab === "home"}
                          controlId="PPTCTL.RIBBON.HOME.PARAGRAPH.ALIGN.DISTRIBUTE"
                          active={
                            ribbonParagraphFormatState?.align === "mixed"
                              ? "mixed"
                              : ribbonParagraphFormatState?.align ===
                                "distribute"
                          }
                          disabled={
                            !featureDecision("paragraph.distribute").enabled
                          }
                          onClick={() =>
                            executePresentationFeature("paragraph.distribute")
                          }
                          icon={
                            <IconDistributeText
                              home={activeRibbonTab === "home"}
                              size={16}
                            />
                          }
                          label={t("presentation.align.distribute")}
                          testId="presentation-ribbon-text-align-distributed"
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <OfficeHomeMenuTrigger
                              data-control-id="PPTCTL.RIBBON.HOME.PARAGRAPH.TEXT_DIRECTION"
                              variant="icon"
                              hasMenuIndicator
                              icon={
                                <IconTextVertical
                                  home={activeRibbonTab === "home"}
                                  size={14}
                                />
                              }
                              disabled={!ribbonParagraphBlock}
                              label={t("presentation.writingModeLabel")}
                              testId="presentation-ribbon-writing-mode"
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                          >
                            <DropdownMenuItem
                              onSelect={() =>
                                updateLiveRibbonParagraphStyle({
                                  writingMode: undefined,
                                })
                              }
                              data-testid="presentation-ribbon-writing-horizontal"
                            >
                              {t("presentation.writingMode.horizontal")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                updateLiveRibbonParagraphStyle({
                                  writingMode: "vertical-rl",
                                })
                              }
                              data-testid="presentation-ribbon-writing-vertical"
                            >
                              {t("presentation.writingMode.vertical")}
                            </DropdownMenuItem>
                            {/* PPT 文字方向的另三项:旋转90°/270°、堆积 —
                                模型 writingMode 五值,导出 vert/vert270/
                                wordArtVert,导入逆映射同批落地。 */}
                            {(
                              [
                                [
                                  "rot90",
                                  t("presentation.home.textDirectionRotate90"),
                                ],
                                [
                                  "rot270",
                                  t(
                                    "presentation.home.textDirectionRotate270",
                                  ),
                                ],
                                [
                                  "stacked",
                                  t("presentation.home.textDirectionStacked"),
                                ],
                              ] as const
                            ).map(([mode, label]) => (
                              <DropdownMenuItem
                                key={mode}
                                onSelect={() =>
                                  updateLiveRibbonParagraphStyle({
                                    writingMode: mode,
                                  })
                                }
                                data-testid={`presentation-ribbon-writing-${mode}`}
                              >
                                {label}
                              </DropdownMenuItem>
                            ))}
                            {/* PowerPoint: More Options... opens Format Shape
                                (Text Options > Text Box). PPT-A043. */}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={openFormatPaneAtText}
                              data-testid="presentation-ribbon-writing-more-options"
                            >
                              {t("presentation.home.textDirectionMoreOptions")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <OfficeHomeMenuTrigger
                              data-control-id="PPTCTL.RIBBON.HOME.PARAGRAPH.VERTICAL_ALIGN"
                              variant="icon"
                              hasMenuIndicator
                              icon={
                                <IconAlignTextMenu
                                  home={activeRibbonTab === "home"}
                                  size={14}
                                />
                              }
                              disabled={!ribbonCharacterWritable}
                              label={t("presentation.home.alignText")}
                              testId="presentation-ribbon-align-text"
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                          >
                            {(
                              [
                                ["top", AlignVerticalJustifyStart],
                                ["middle", AlignVerticalJustifyCenter],
                                ["bottom", AlignVerticalJustifyEnd],
                              ] as const
                            ).map(([anchor, Icon]) => (
                              <DropdownMenuItem
                                key={anchor}
                                onSelect={() =>
                                  updateLiveRibbonParagraphStyle({
                                    verticalAlign:
                                      persistedVerticalAnchor(anchor),
                                  })
                                }
                                data-testid={`presentation-ribbon-text-valign-${anchor}`}
                              >
                                <Icon size={14} />
                                {t(
                                  `presentation.valign.${anchor}` as "presentation.valign.top",
                                )}
                              </DropdownMenuItem>
                            ))}
                            {/* PowerPoint: Align Text Options... opens Format
                                Shape (Text Options > Text Box). PPT-A044. */}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={openFormatPaneAtText}
                              data-testid="presentation-ribbon-text-valign-options"
                            >
                              {t("presentation.home.alignTextOptions")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {/* Convert to SmartArt ▾ ends the Paragraph group, as
                            in PowerPoint's Home tab (PPT-A019). */}
                        <PresentationConvertToSmartArtMenu
                          labels={convertToSmartArtLabels}
                          disabled={!convertToSmartArtTarget}
                          disabledReason={
                            convertToSmartArtTarget
                              ? undefined
                              : t("presentation.home.convertToSmartArtNeedsText")
                          }
                          placeholders={smartArtPlaceholders}
                          previewBounds={activeSlideBounds}
                          onConvert={(layoutId) => {
                            const kind = convertToSmartArtKind(layoutId);
                            if (convertToSmartArtTarget && kind) {
                              convertTextBlockToSmartArt(convertToSmartArtTarget.id, kind);
                            }
                          }}
                        />
                      </div>
                                            </div>
                      </div>
                    </PresentationHomeAwareGroup>
                    {activeRibbonTab === "home" ? (
                      /* INSERT: Picture / Shapes / Text Box, the group desktop
                         PowerPoint puts before Drawing on Home (PPT-A020); each
                         runs the Insert tab's own command. */
                      <OfficeHomeRibbonGroup
                        label={t("toolbar.insert")}
                        size="content"
                        testId="presentation-home-insert-group"
                      >
                        <OfficeHomeCommandRow>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <OfficeHomeMenuTrigger
                                ref={homePicturesMenuTriggerRef}
                                controlId="PPTCTL.RIBBON.HOME.INSERT.PICTURES.MENU"
                                className="presentation-home-large-command"
                                variant="large"
                                hasMenuIndicator
                                icon={<IconInsertPicture home size={24} />}
                                label={t("presentation.bgFill.picture")}
                                disabled={
                                  insertCapacityReached ||
                                  imageInsertBusy ||
                                  !featureDecision("drawing.image").enabled
                                }
                                testId="presentation-ribbon-home-picture"
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onSelect={() =>
                                  executeImageFileFromTrigger(
                                    homePicturesMenuTriggerRef.current,
                                  )
                                }
                                disabled={imageInsertBusy}
                                data-testid="presentation-ribbon-home-picture-from-file"
                              >
                                <IconInsertPicture home size={18} />
                                {t("toolbar.pictureFromDevice")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => void import("@mrnote/core/host/desktop-app.ts").then((module) => module.noteDesktopFeature("Online Pictures"))}
                                disabled={imageInsertBusy}
                                data-testid="presentation-ribbon-home-picture-online"
                              >
                                <ImageDown size={18} aria-hidden="true" />
                                {t("toolbar.pictureFromUrl")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <OfficeHomeMenuTrigger
                              ref={homeShapesMenuTriggerRef}
                              data-control-id="PPTCTL.RIBBON.HOME.DRAWING.SHAPES"
                              className="presentation-home-large-command"
                              variant="large"
                              hasMenuIndicator
                              icon={
                                <OfficeSemanticIcon
                                  semanticId="shape.insert"
                                  size={24}
                                />
                              }
                              displayLabel={t("toolbar.shape")}
                              label={t("toolbar.shape")}
                              disabled={
                                !featureDecision("drawing.shape").enabled ||
                                activeSlide.blocks.length >=
                                  MAX_PRESENTATION_BLOCKS_PER_SLIDE
                              }
                              testId="presentation-ribbon-home-shape"
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
                              data-testid="presentation-home-shape-gallery-menu"
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
                                  !featureDecision("drawing.shape").enabled
                                }
                                labelFor={(kind) =>
                                  t(
                                    `presentation.shape.${kind}` as "presentation.shape.rectangle",
                                  )
                                }
                                onSelect={executeHomeShapeInsert}
                              />
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <OfficeHomeMenuTrigger
                                controlId="PPTCTL.RIBBON.HOME.INSERT.TEXTBOX.MENU"
                                className="presentation-home-large-command"
                                variant="large"
                                hasMenuIndicator
                                icon={<IconInsertTextBox home size={24} />}
                                label={t("presentation.addTextBox")}
                                disabled={
                                  insertCapacityReached ||
                                  !featureDecision("drawing.textBox").enabled
                                }
                                testId="presentation-ribbon-home-textbox"
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onSelect={() => insertTextBox()}
                                data-testid="presentation-ribbon-home-textbox-horizontal"
                              >
                                <IconInsertHorizontalTextBox home size={18} />
                                {t("presentation.insert.drawHorizontalTextBox")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => insertTextBox("vertical-rl")}
                                data-testid="presentation-ribbon-home-textbox-vertical"
                              >
                                <IconInsertVerticalTextBox home size={18} />
                                {t("toolbar.textBox.vertical")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </OfficeHomeCommandRow>
                      </OfficeHomeRibbonGroup>
                    ) : null}
                    {activeRibbonTab === "home" ? (
                      <OfficeHomeRibbonGroup
                        label={t("toolbar.ribbonDraw")}
                        size="content"
                        className={presentationChrome.homeDrawingGroup}
                        testId="presentation-home-drawing-group"
                        // PowerPoint's Drawing group launcher: Format Shape
                        launcher={{
                          label: t("office.shapeContextMenu.formatShape"),
                          onClick: toggleFormatPane,
                          active: formatPaneShowing && formatPaneInFront,
                          testId: "presentation-home-drawing-launcher",
                        }}
                      >
                        <OfficeHomeCommandRow>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <OfficeHomeMenuTrigger
                                ref={homeArrangeMenuTriggerRef}
                                data-control-id="PPTCTL.RIBBON.HOME.ARRANGE.MENU"
                                className="presentation-home-large-command"
                                variant="large"
                                hasMenuIndicator
                                icon={<IconArrangeMenu home size={24} />}
                                displayLabel={t("presentation.home.arrange")}
                                label={t("presentation.home.arrange")}
                                testId="presentation-ribbon-home-arrange"
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <PresentationHomeArrangeMenuItems
                                {...presentationArrangeMenuProps}
                                selectionPane={{
                                  ...presentationArrangeMenuProps.selectionPane,
                                  onSelect: () => {
                                    selectionPaneReturnFocusRef.current =
                                      homeArrangeMenuTriggerRef.current;
                                    executePresentationFeature(
                                      "editing.selectionPane",
                                    );
                                  },
                                }}
                              />
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <div
                            className="presentation-home-intrinsic-slot"
                            data-testid="presentation-home-drawing-quick-styles-slot"
                          >
                          <OfficeHomeGallery
                            label={t("presentation.home.quickStyles")}
                          >
                          {/* Quick Styles is Shape Format's Shape Styles
                              library behind one button: the deck theme's
                              6 x 7 styles, applied by the same command
                              (PPT-A046). */}
                          <OfficeShapeStyleGallery
                            application="presentation"
                            recipes={shapeStyleRecipes}
                            label={t("presentation.home.shapeStyles")}
                            moreLabel={t("presentation.home.shapeStyles")}
                            value={
                              shapeStyleRecipes.find(
                                contextualShapeObjectMatchesStyle,
                              )?.id ?? null
                            }
                            disabled={!contextualShapeStyleSelectionIsEligible}
                            onCommit={applyShapeStyleRecipe}
                            testIdPrefix="presentation-home-quick-style-gallery"
                            menuTrigger={
                              <OfficeHomeMenuTrigger
                                data-control-id="PPTCTL.RIBBON.HOME.STYLE.QUICK"
                                variant="large"
                                hasMenuIndicator
                                icon={<IconQuickStyles home size={24} />}
                                displayLabel={t(
                                  "presentation.home.quickStyles",
                                )}
                                label={t("presentation.home.quickStyles")}
                                disabled={!contextualShapeStyleSelectionIsEligible}
                                testId="presentation-ribbon-quick-styles"
                              />
                            }
                          />
                          </OfficeHomeGallery>
                          </div>
                          {/* PPT's stacked fill / outline pair. */}
                          <div
                            className="presentation-home-intrinsic-stack"
                            data-testid="presentation-home-drawing-stack"
                          >
                            <OfficeHomeCommandStack>
                            {(
                              [
                                [
                                  "fill",
                                  t("presentation.home.shapeFill"),
                                  t("presentation.home.noFill"),
                                  t("presentation.home.shapeFillMenu"),
                                  IconShapeFill,
                                  "PPTCTL.RIBBON.HOME.STYLE.FILL.PRIMARY",
                                  "PPTCTL.RIBBON.HOME.STYLE.FILL.MENU",
                                ],
                                [
                                  "stroke",
                                  t("presentation.home.shapeOutline"),
                                  t("presentation.home.noOutline"),
                                  t("presentation.home.shapeOutlineMenu"),
                                  IconShapeOutline,
                                  "PPTCTL.RIBBON.HOME.STYLE.OUTLINE.PRIMARY",
                                  "PPTCTL.RIBBON.HOME.STYLE.OUTLINE.MENU",
                                ],
                              ] as const
                            ).map(
                              ([
                                field,
                                label,
                                noneLabel,
                                menuLabel,
                                Icon,
                                primaryControlId,
                                menuControlId,
                              ]) => {
                              const isFill = field === "fill";
                              const controlDisabled = isFill
                                ? !drawingShapeSelectionSupportsFill
                                : !drawingShapeOutlineSelectionIsEligible;
                              const triggerRef = isFill
                                ? homeShapeFillMenuTriggerRef
                                : homeShapeOutlineMenuTriggerRef;
                              const current = drawingShapeBlock
                                ? normalizeShapeColor(
                                    drawingShapeBlock[field],
                                    isFill
                                      ? DEFAULT_SHAPE_FILL
                                      : DEFAULT_SHAPE_STROKE,
                                  )
                                : isFill
                                  ? DEFAULT_SHAPE_FILL
                                  : DEFAULT_SHAPE_STROKE;
                              const pickerValue =
                                current === "none"
                                  ? isFill
                                    ? DEFAULT_SHAPE_FILL
                                    : DEFAULT_SHAPE_STROKE
                                  : current;
                              // Shape Format's own paint rule: a colour
                              // replaces the whole fill, and an outline
                              // colour on a shape with no weight shows the
                              // line at Office's 0.75 pt.
                              const applyColor = (value: string) => {
                                updateLiveSelectedShape(
                                  presentationShapeObjectShapePatch(
                                    isFill
                                      ? { fill: value }
                                      : { outlineColor: value },
                                    drawingShapeBlock ?? undefined,
                                  ),
                                );
                              };
                              const applyNone = () => {
                                updateLiveSelectedShape(
                                  isFill
                                    ? {
                                        fill: "none",
                                        fillTo: undefined,
                                        gradientAngle: undefined,
                                        fillGradient: undefined,
                                        fillImage: undefined,
                                        fillPattern: undefined,
                                      }
                                    : {
                                        stroke: "none",
                                        strokeTo: undefined,
                                        strokeGradientAngle: undefined,
                                      },
                                );
                              };
                              const restoreDefault = () => {
                                updateLiveSelectedShape(
                                  isFill
                                    ? {
                                        fill: undefined,
                                        fillTo: undefined,
                                        gradientAngle: undefined,
                                        fillGradient: undefined,
                                        fillImage: undefined,
                                        fillPattern: undefined,
                                      }
                                    : {
                                        stroke: undefined,
                                        strokeTo: undefined,
                                        strokeGradientAngle: undefined,
                                        strokeWidth: undefined,
                                        strokeStyle: undefined,
                                      },
                                );
                              };
                              return (
                                <div
                                  key={field}
                                  className="note-editor-ribbon-row presentation-home-intrinsic-row"
                                >
                                  <OfficeHomeSplitLayout
                                    className="presentation-home-intrinsic-split"
                                    primary={
                                      <OfficeHomeCommand
                                      controlId={primaryControlId}
                                      variant="compact"
                                      disabled={controlDisabled}
                                      onClick={() => applyColor(pickerValue)}
                                      label={label}
                                      displayLabel={label}
                                      testId={`presentation-ribbon-home-shape-${field}`}
                                      icon={
                                        <span className="note-editor-office-toolbar__color-glyph">
                                          <Icon home size={16} aria-hidden="true" />
                                          <span
                                            className="note-editor-office-toolbar__color-underline"
                                            style={{
                                              backgroundColor:
                                                current === "none"
                                                  ? "transparent"
                                                  : current,
                                              outline:
                                                current === "none"
                                                  ? "1px dashed rgba(0,0,0,0.35)"
                                                  : undefined,
                                            }}
                                          />
                                        </span>
                                      }
                                      />
                                    }
                                    trigger={
                                      <DropdownMenu
                                        open={homeShapeColorMenu === field}
                                        onOpenChange={(open) =>
                                          setHomeShapeColorMenu(open ? field : null)
                                        }
                                      >
                                      <DropdownMenuTrigger asChild>
                                        <OfficeHomeMenuTrigger
                                          ref={triggerRef}
                                          data-control-id={menuControlId}
                                          variant="icon"
                                          icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                                          disabled={controlDisabled}
                                          label={menuLabel}
                                          testId={`presentation-ribbon-home-shape-${field}-menu`}
                                        />
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="start"
                                        className="note-editor-color-menu"
                                        onCloseAutoFocus={(event) =>
                                          restorePresentationHomeMenuFocus(
                                            event,
                                            triggerRef.current,
                                          )
                                        }
                                      >
                                        {/* The same picker as Shape Format's
                                            Shape Fill / Shape Outline: the
                                            deck theme's colours, Standard
                                            Colors, Recent Colors and More
                                            Colors (PPT-A047/A048/A049). */}
                                        <OfficeColorPalettePanel
                                          value={
                                            current === "none"
                                              ? undefined
                                              : current
                                          }
                                          recents={shapeFormatRecentColors}
                                          disabled={controlDisabled}
                                          labels={{
                                            themeColors: t("spreadsheet.themeColors"),
                                            standardColors: t("spreadsheet.standardColors"),
                                            recentColors: t("spreadsheet.recentColors"),
                                            moreColors: t("spreadsheet.moreColors"),
                                          }}
                                          onPick={(color) => {
                                            if (!color) return;
                                            setShapeFormatRecentColors((recents) =>
                                              pushRecentColor(recents, color),
                                            );
                                            applyColor(color);
                                            setHomeShapeColorMenu(null);
                                          }}
                                          testIdPrefix={`presentation-ribbon-home-shape-${field}`}
                                        />
                                        <DropdownMenuSeparator />
                                        {isFill ? (
                                          <>
                                            <DropdownMenuItem
                                              data-testid="presentation-ribbon-home-shape-fill-solid"
                                              onSelect={() =>
                                                applyColor(pickerValue)
                                              }
                                            >
                                              <PresentationFillPreview mode="solid" />
                                              {t("presentation.home.solidFill")}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              data-testid="presentation-ribbon-home-shape-fill-gradient"
                                              onSelect={() =>
                                                updateLiveSelectedShape({
                                                  fill: pickerValue,
                                                  fillTo: "#ffffff",
                                                  gradientAngle: 90,
                                                  fillImage: undefined,
                                                  fillPattern: undefined,
                                                })
                                              }
                                            >
                                              <PresentationFillPreview mode="gradient" />
                                              {t(
                                                "presentation.home.gradientFill",
                                              )}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              disabled={
                                                selectedShapeBlocks.length !==
                                                  1 || !drawingShapeBlock
                                              }
                                              data-testid="presentation-ribbon-home-shape-fill-picture"
                                              onSelect={() => {
                                                if (drawingShapeBlock) {
                                                  beginShapeFillImageUpload(
                                                    drawingShapeBlock.id,
                                                  );
                                                }
                                              }}
                                            >
                                              <PresentationFillPreview mode="picture" />
                                              {t("presentation.shapeFillPicture")}
                                            </DropdownMenuItem>
                                            <DropdownMenuSub>
                                              <DropdownMenuSubTrigger
                                                data-testid="presentation-ribbon-home-shape-fill-pattern"
                                              >
                                                <PresentationFillPreview mode="pattern" />
                                                {t(
                                                  "presentation.home.patternFill",
                                                )}
                                              </DropdownMenuSubTrigger>
                                              <DropdownMenuSubContent>
                                                {SLIDE_BG_PATTERNS.map(
                                                  (pattern) => (
                                                    <DropdownMenuItem
                                                      key={pattern}
                                                      data-testid={`presentation-ribbon-home-shape-fill-pattern-${pattern}`}
                                                      onSelect={() =>
                                                        updateLiveSelectedShape({
                                                          fill: pickerValue,
                                                          fillTo: undefined,
                                                          gradientAngle: undefined,
                                                          fillImage: undefined,
                                                          fillPattern: {
                                                            pattern,
                                                            color: pickerValue,
                                                            background: "#ffffff",
                                                          },
                                                        })
                                                      }
                                                    >
                                                      {t(
                                                        `presentation.home.pattern.${pattern}` as "presentation.home.pattern.dots",
                                                      )}
                                                    </DropdownMenuItem>
                                                  ),
                                                )}
                                              </DropdownMenuSubContent>
                                            </DropdownMenuSub>
                                          </>
                                        ) : (
                                          <>
                                            <DropdownMenuLabel>
                                              {t("presentation.home.lineWeight")}
                                            </DropdownMenuLabel>
                                            {/* Shape Outline > Weight, in POINTS.
                                                This menu is labelled `{value} pt`
                                                and used to be handed PIXELS, so
                                                "6 pt" wrote 6 px = 4.5 pt -- it
                                                named a weight it did not write.
                                                The ladder is now PowerPoint's own
                                                (quarter-point) from the ONE shared
                                                table, and the block keeps storing
                                                pixels: the conversion belongs at
                                                the control, which is the only place
                                                a user reads a number (audit 64). */}
                                            {OFFICE_LINE_WEIGHT_PT.filter(
                                              (pt) =>
                                                officeLineWeightPtToPx(pt) <=
                                                MAX_STROKE_WIDTH,
                                            ).map((pt) => (
                                              <DropdownMenuItem
                                                key={pt}
                                                disabled={
                                                  !drawingShapeOutlineSelectionIsEligible
                                                }
                                                onSelect={() =>
                                                  updateLiveSelectedShape({
                                                    stroke:
                                                      current === "none"
                                                        ? DEFAULT_SHAPE_STROKE
                                                        : current,
                                                    strokeWidth:
                                                      officeLineWeightPtToPx(pt),
                                                  })
                                                }
                                                data-testid={`presentation-ribbon-home-shape-outline-width-${pt}`}
                                              >
                                                <PresentationOutlinePreview
                                                  width={officeLineWeightPtToPx(pt)}
                                                />
                                                {t(
                                                  "presentation.home.pointsValue",
                                                  {
                                                    value:
                                                      formatOfficeLineWeightPt(pt),
                                                  },
                                                )}
                                              </DropdownMenuItem>
                                            ))}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuLabel>
                                              {t("presentation.home.dashes")}
                                            </DropdownMenuLabel>
                                            {/* Office's eight dashes, written as Shape
                                                Format > Shape Outline writes them. */}
                                            {OFFICE_MENU_DASHES.map((dash) => {
                                              const fields = officeMenuDashFields(dash);
                                              return (
                                                <DropdownMenuItem
                                                  key={dash}
                                                  disabled={
                                                    !drawingShapeOutlineSelectionIsEligible
                                                  }
                                                  onSelect={() =>
                                                    updateLiveSelectedShape({
                                                      stroke:
                                                        current === "none"
                                                          ? DEFAULT_SHAPE_STROKE
                                                          : current,
                                                      strokeStyle: fields.style,
                                                      outlineDash: fields.dash,
                                                      outlineCap: fields.cap,
                                                    })
                                                  }
                                                  data-testid={`presentation-ribbon-home-shape-outline-style-${dash}`}
                                                >
                                                  <OfficePictureMenuIcon icon={{ kind: "line-dash", dash }} />
                                                  {t(
                                                    `presentation.officeGraphic.dash.${dash}` as "presentation.officeGraphic.dash.solid",
                                                  )}
                                                </DropdownMenuItem>
                                              );
                                            })}
                                            <DropdownMenuSub>
                                              <DropdownMenuSubTrigger
                                                disabled={!shapeArrowsEnabled}
                                                data-testid="presentation-ribbon-home-shape-outline-arrows"
                                              >
                                                <PresentationOutlinePreview />
                                                {t("officeArrows.arrows")}
                                              </DropdownMenuSubTrigger>
                                              <DropdownMenuSubContent data-testid="presentation-ribbon-home-shape-outline-arrows-menu">
                                                {shapeArrowsPicker}
                                              </DropdownMenuSubContent>
                                            </DropdownMenuSub>
                                            <DropdownMenuItem
                                              disabled={
                                                !drawingShapeOutlineSelectionIsEligible
                                              }
                                              data-testid="presentation-ribbon-home-shape-outline-gradient"
                                              onSelect={() =>
                                                updateLiveSelectedShape({
                                                  stroke:
                                                    current === "none"
                                                      ? DEFAULT_SHAPE_STROKE
                                                      : current,
                                                  strokeTo: "#ffffff",
                                                  strokeGradientAngle: 90,
                                                })
                                              }
                                            >
                                              <PresentationFillPreview mode="gradient" />
                                              {t(
                                                "presentation.home.gradientLine",
                                              )}
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                          </>
                                        )}
                                        <DropdownMenuItem
                                          disabled={
                                            !isFill &&
                                            !drawingShapeOutlineSelectionIsEligible
                                          }
                                          data-testid={`presentation-ribbon-home-shape-${field}-none`}
                                          onSelect={applyNone}
                                        >
                                          {isFill ? (
                                            <PresentationFillPreview mode="none" />
                                          ) : (
                                            <PresentationOutlinePreview width={0} />
                                          )}
                                          {noneLabel}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          disabled={
                                            !isFill &&
                                            !drawingShapeOutlineSelectionIsEligible
                                          }
                                          onSelect={restoreDefault}
                                          data-testid={`presentation-ribbon-home-shape-${field}-clear`}
                                        >
                                          {isFill ? (
                                            <PresentationFillPreview mode="solid" />
                                          ) : (
                                            <PresentationOutlinePreview />
                                          )}
                                          {t(
                                            "presentation.home.restoreDefault",
                                          )}
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                      </DropdownMenu>
                                    }
                                  />
                                </div>
                              );
                            })}
                            {/* PPT-A022: no second Copy here -- the
                                desktop Drawing group is Shapes, Arrange,
                                Quick Styles, Shape Fill and Shape Outline;
                                Copy is the Clipboard group's. */}
                            </OfficeHomeCommandStack>
                          </div>
                        </OfficeHomeCommandRow>
                      </OfficeHomeRibbonGroup>
                    ) : null}
                    {activeRibbonTab === "home" ? (
                      <OfficeHomeRibbonGroup
                        label={t("toolbar.ribbonEdit")}
                        size="compact"
                        className={presentationChrome.homeEditingGroup}
                        testId="presentation-home-editing-group"
                      >
                        <OfficeHomeCommandRow>
                        <OfficeHomeCommandStack>
                          <OfficeHomeCommand
                            variant="compact"
                            controlId="PPTCTL.RIBBON.HOME.EDITING.FIND"
                            icon={
                              <DocsHomeIcon
                                name="find"
                                size={16}
                                data-presentation-ribbon-icon="editing-find"
                              />
                            }
                            label={t("presentation.home.find")}
                            onClick={() => openFindReplacePanel("find")}
                            testId="presentation-find-replace-open"
                          />
                          {








}
                          <OfficeHomeSplitLayout
                            testId="presentation-home-replace-split"
                            primary={
                              <OfficeHomeCommand
                                variant="compact"
                                controlId="PPTCTL.RIBBON.HOME.EDITING.REPLACE"
                                icon={
                                  <DocsHomeIcon
                                    name="replace"
                                    size={16}
                                    data-presentation-ribbon-icon="editing-replace"
                                  />
                                }
                                label={t("presentation.home.replace")}
                                onClick={() => openFindReplacePanel("replace")}
                                testId="presentation-replace-open"
                              />
                            }
                            trigger={
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <OfficeHomeMenuTrigger
                                    ref={replaceFontsTriggerRef}
                                    variant="icon"
                                    className="note-editor-office-toolbar__split-chevron"
                                    icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                                    label={t("presentation.home.replace")}
                                    testId="presentation-replace-menu"
                                  />
                                </DropdownMenuTrigger>
                                <RibbonDropdownMenuContent
                                  align="start"
                                  data-testid="presentation-replace-menu-content"
                                >
                                  <DropdownMenuItem
                                    onSelect={() => openFindReplacePanel("replace")}
                                    data-testid="presentation-replace-menu-replace"
                                  >
                                    <DocsHomeIcon name="replace" size={16} />
                                    {t("presentation.home.replace")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={autosave.readOnly}
                                    // Opened once the menu has closed: inside the
                                    // menu's own selection the menu's dismissable
                                    // layer and the dialog overlapped, and the
                                    // page's pointer events could stay off after
                                    
                                    onSelect={() => window.setTimeout(() => setReplaceFontsOpen(true), 0)}
                                    data-control-id="PPTCTL.RIBBON.HOME.EDITING.REPLACE_FONTS"
                                    data-testid="presentation-replace-fonts-open"
                                  >
                                    <DocsHomeIcon name="replace" size={16} />
                                    {t("presentation.replaceFonts.label")}
                                  </DropdownMenuItem>
                                </RibbonDropdownMenuContent>
                              </DropdownMenu>
                            }
                          />
                          {/* Select ▾: Select All / Select Objects / Selection
                              Pane... (PPT-A023). */}
                          <PresentationHomeEditingSelectMenu
                            ref={homeSelectMenuTriggerRef}
                            labels={{
                              select: t("toolbar.select"),
                              selectAll: t("toolbar.selectAll"),
                              selectObjects: t("toolbar.selectObjects"),
                              selectionPane: t("presentation.arrange.selectionPane"),
                            }}
                            selectAllShortcut={formatOfficeShortcut("Mod+A")}
                            selectAllDisabled={
                              activeSlide.blocks.length === 0 ||
                              !featureDecision("editing.selectAll").enabled
                            }
                            selectionPaneDisabled={
                              !featureDecision("editing.selectionPane").enabled
                            }
                            selectObjectsActive={inkInteractionMode === null}
                            onSelectAll={() =>
                              executePresentationFeature("editing.selectAll")
                            }
                            onSelectObjects={() =>
                              executePresentationFeature("editing.selectObjects")
                            }
                            onSelectionPane={() => {
                              selectionPaneReturnFocusRef.current =
                                homeSelectMenuTriggerRef.current;
                              executePresentationFeature("editing.selectionPane");
                            }}
                          />
                        </OfficeHomeCommandStack>
                        </OfficeHomeCommandRow>
                      </OfficeHomeRibbonGroup>
                    ) : null}
                  </>
  );
}
