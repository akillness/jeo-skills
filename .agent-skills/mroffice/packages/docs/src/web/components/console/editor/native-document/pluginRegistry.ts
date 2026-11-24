"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// Side effect: no paragraph is ever wrapped in an in-line object to fit (WUA 077).
import { isPictureRecolorPreset } from "./pictureRecolorFilter";
import "./blockWrappingInline";
import { normalizeCellShadingPattern } from "@mrnote/core/web/components/console/editor/native-document/tableShading.ts";

/** The registry's translate function (next-intl's `t`). */
type Translator = (key: string, values?: Record<string, string | number | Date>) => string;
import DocumentObjectVisibility from "./documentObjectVisibility";
import {DocumentAutoLineSpacing} from "@mrnote/core/web/components/console/editor/native-document/documentAutoLineSpacing.ts";
import { FastRenderedAttributes } from "./fastRenderedAttributes";
import { StableNodeViews } from "./stableNodeViews";
import { DocumentScrollAnchor } from "./scrollAnchor";
import {DocumentExactLineBaseline} from "./documentExactLineBaseline";
import { JustifiedLineBreaks } from "./justifiedLineBreaks";
import { BalancedSpaces } from "./balancedSpaces";
import { DistributedLastLines } from "./distributedLastLines";
import { OverflowPunctuationHang } from "./overflowPunctuationHang";
import { DocumentInlineAtomCaret } from "./inlineAtomCaret";
import { PasteParagraphFormat } from "./pasteParagraphFormat";
import { JoinedParagraphStyleRuns } from "@mrnote/core/web/components/console/editor/native-document/joinedParagraphStyleRuns.ts";
import { linkMarkInclusive, linkRunsPastMarkPlugin } from "./linkRunsPastMark";
import { FloatAnchorsFollowParagraphs } from "./floatAnchorsFollowParagraphs";
import { JoinedParagraphFieldSpans } from "./joinedParagraphFieldSpans";
import { PasteSelectionEnd } from "./pasteSelectionEnd";
import { PasteIntoList } from "./pasteIntoList";
import { PlainTextBlankLines } from "./plainTextPaste";
import { JustifiedSpaceShrink } from "./justifiedSpaceShrink";
import { DocumentEngineLineBreaks } from "./documentEngineLineBreaks";
import { FloatingTableAnchor } from "@mrnote/core/web/components/console/editor/native-document/floatingTableAnchor.ts";
import { CellPictureHost } from "./cellPictureHost";
import { SectionLineGrid } from "@mrnote/core/web/components/console/editor/native-document/sectionLineGrid.ts";
import type { AnyExtension, NodeViewRendererProps } from "@tiptap/core";
import { followLinkHint, normalizePictureLinkHref, normalizePictureSourceLink } from "@mrnote/core/web/components/console/editor/native-document/pictureLink.ts";
import { isMacPlatform } from "@mrnote/core/web/lib/mac-platform.ts";
import { normalizeFloatAnchor } from "@mrnote/core/web/lib/office-float-anchor.ts";
import { isSavableDocumentUrl } from "@mrnote/core/web/lib/document-url-rules.ts";
import { documentShapeRelativeHeight } from "@mrnote/core/web/lib/document-shapes.ts";
import { Extension, InputRule, mergeAttributes } from "@tiptap/core";
import { createDocumentPictureObjectsExtension } from "@mrnote/core/web/lib/document-picture-objects-upload.ts";
import { installProseMirrorResilience, staleTransactionRebasePlugin } from "@mrnote/core/web/lib/editor/prosemirror-resilience.ts";
import { ReactCommitSelectionGuard } from "@mrnote/core/web/lib/editor/react-commit-selection-guard.ts";
import { PendingDomSelection } from "@mrnote/core/web/lib/editor/pending-dom-selection.ts";
import { InkSheetLayer } from "@mrnote/core/web/components/console/editor/native-document/paged/inkSheetLayer.ts";
import { InkLightLayer } from "@mrnote/core/web/components/console/editor/native-document/paged/inkLightLayer.ts";
import { SaveTextWarmup } from "./paged/saveTextWarmup";
import StarterKit from "@tiptap/starter-kit";
import { DocumentHardBreakRunFormat } from "@mrnote/core/web/components/console/editor/native-document/documentHardBreakRunFormat.ts";
import { AtomTrackedInsertionCarrier } from "./atomTrackedInsertionCarrier";
import { DocumentInlineAtomRunStyle } from "@mrnote/core/web/components/console/editor/native-document/inlineAtomRunStyle.ts";
import { DocumentDomReadParser } from "./documentDomReadParser";
import Image from "@tiptap/extension-image";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import {
  SPLIT_CONTINUATION_ATTR,
  SPLIT_PIECE_OF_ATTR,
  SPLIT_CONTINUES_ATTR,
} from "@mrnote/core/web/components/console/editor/native-document/paged/blockSplitting.ts";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { DOMSerializer } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import {
  CellSelection,
  columnResizing,
  columnResizingPluginKey,
  isInTable,
  selectedRect,
  selectionCell,
  TableMap,
} from "@tiptap/pm/tables";
import { logicalTableFragmentsAt } from "@mrnote/core/web/components/console/editor/native-document/paged/tableFragmentGroups.ts";
import { TABLE_REPEATED_HEADER_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";
import type { DecorationSet, NodeView, ViewMutationRecord } from "@tiptap/pm/view";
import type { createLowlight } from "lowlight";
import {
  MathBlock,
  InlineMath,
  InactiveSelectionHighlight,
  CalloutBlock,
  WhiteboardBlock,
  FileBlock,
  ChartBlock,
  InlineChart,
  SmartArtBlock,
  MermaidBlock,
  CodeChartBlock,
  ReferenceBlock,
  TaskBlock,
  FlashcardBlock,
  TableOfContents,
  DocumentCoverPage,
  WikiLink,
  Frontmatter,
  DocumentFormatting,
  DocumentPageSetup,
  PageBreak,
  ColumnBreak,
  SectionBreak,
  SourcePageBreak,
  TextStyling,
} from "../extensions";
import WikiLinkSuggestion, {
  createWikiLinkSuggestionConfig,
} from "@mrnote/core/web/components/console/editor/WikiLinkSuggestion.tsx";
import { getSharedWikiLinkPageListCache } from "@mrnote/core/web/components/console/editor/wikiLinkPageListCache.ts";
import { notebookSDK } from "@mrnote/core/web/lib/notebook-sdk.ts";
import {
  setDocumentTableDesignState,
  type DocumentTableDesignTarget,
  type DocumentTableDesignState,
} from "@mrnote/core/web/lib/document-table-design-authority.ts";
import { MrnoteBlockIdExtension } from "@mrnote/core/web/components/console/editor/native-document/blockIds.ts";
import { SourceHardBreakTail } from "@mrnote/core/web/components/console/editor/native-document/sourceHardBreakTail.ts";
import { WordHorizontalRule } from "@mrnote/core/web/components/console/editor/native-document/wordHorizontalRule.ts";
import {
  clampImageWidthPercentFree,
  imageElementRenderAttributes,
  normalizeImageAlign,
  normalizeImageBorderColor,
  normalizeImageBorderStyle,
  normalizeImageBorderWidth,
  normalizeImagePictureStyleAttr,
  normalizeImageCropPercent,
  normalizeImageFloat,
  normalizeImageFlip,
  normalizeImageRotation,
  sanitizeImageAltText,
} from "@mrnote/core/web/components/console/editor/native-document/imageControls.ts";
import {
  isNativeImageRecolorMode,
  normalizeImageAdjust,
  normalizeImageOpacity,
  normalizeImageSaturation,
} from "@mrnote/core/web/lib/presentation-image-effects.ts";
import {
  normalizeOfficePictureGeometry,
  normalizeOfficePictureGeometryAdjustments,
} from "@mrnote/core/web/lib/office-picture-geometry.ts";
import {
  createImageResizeNodeView,
  type ImageRuntimeStatusLabels,
} from "./ImageResizeNodeView";
import { createDocumentImageCropPlugin } from "./documentImageCrop";
import { createDocumentPictureStylePlugin } from "./DocumentPictureStyleGallery";
import { DocumentShapeBlock, InlineDocumentShape } from "@mrnote/core/web/components/console/editor/native-document/documentShapeExtension.ts";
import { normalizePictureLegacyLook } from "./pictureLegacyLook";
import {
  normalizePicture3d,
  normalizePictureGlow,
  normalizePictureReflection,
  normalizePictureSoftEdge,
} from "./pictureEffects";
import { normalizePictureDisplayLook } from "./pictureDisplayLook";
import ImageRow from "./imageRowExtension";
import { INLINE_PICTURE_NODE_NAME } from "@mrnote/core/web/components/console/editor/native-document/documentObjectNodes.ts";
import {
  cellFormulaAttributes,
  cellFormulaNumberFormatAttributes,
  mergeCellStyleAttributes,
  normalizeCellBorderStyle,
  normalizeCellFormula,
  normalizeCellFormulaNumberFormat,
  normalizeCellTextAlign,
  normalizeCellTextDirection,
  projectCellBackgroundForEditor,
  readCellBackgroundColorFromElement,
  readCellMarginsFromElement,
  readCellTextDirectionFromElement,
  readCellVerticalAlignFromElement,
} from "@mrnote/core/web/components/console/editor/native-document/tableCellStyle.ts";
import {
  createDocumentTableBorderPlugin,
  mergedRegionCellBorders,
  normalizeDocumentTableBorders,
  readCellBordersFromElement,
  readTableBordersFromElement,
  tableBordersAttributes,
} from "@mrnote/core/web/components/console/editor/native-document/tableBorders.ts";
import {
  createDocumentTableCellMarginsPlugin,
  readTableCellMarginsFromElement,
  TABLE_CELL_DECORATION_STYLE_PROPERTIES,
  tableCellMarginsAttributes,
} from "@mrnote/core/web/components/console/editor/native-document/tableCellMarginsPlugin.ts";
import { createNestedTableEndParagraphPlugin } from "./nestedTableEndParagraph";
import { createParagraphSpacingAddsUpPlugin } from "@mrnote/core/web/components/console/editor/native-document/paragraphSpacingAddsUp.ts";
import {
  DocumentTableFormulas,
  documentTableMergeFormulaPlan,
} from "./tableFormulaPlugin";
import { HeadingAnchorIdExtension } from "./headingAnchors";
import { TRACK_CHANGES_SKIP_META, TrackChanges } from "@mrnote/core/web/components/console/editor/native-document/trackChangesExtension.ts";
import { DocumentComments } from "@mrnote/core/web/components/console/editor/native-document/commentExtension.ts";
import {
  DocumentBookmarkPoints,
  DocumentBookmarks,
} from "@mrnote/core/web/components/console/editor/native-document/bookmarkExtension.ts";
import { RangePermission, RangePermissionLane } from "./rangePermissionExtension";
import { DocumentEmphasisDots } from "./emphasisDotsExtension";
import { DocumentTextPosition } from "./textPositionExtension";
import {
  DocumentCharBorder,
  DocumentCharShading,
} from "./charEffectsExtension";
import { TocEntryTitleMark, TocEntryPageMark } from "./tocEntryExtension";
import { TocNavigation } from "./tocNavigationExtension";
import { CitationLinkNavigation } from "./citationLinkNavigation";
import { ClipboardTextProjection } from "./clipboardTextProjection";
import { BandTabLayout } from "./paged/bandTabLayout";
import { DocumentUnderline } from "@mrnote/core/web/components/console/editor/native-document/underlineExtension.ts";
import { DocumentBold } from "@mrnote/core/web/components/console/editor/native-document/boldExtension.ts";
import { DocumentItalic } from "@mrnote/core/web/components/console/editor/native-document/italicExtension.ts";
import { DocumentIndexEntry } from "@mrnote/core/web/components/console/editor/native-document/indexEntryExtension.ts";
import { DocumentAuthorityEntry } from "@mrnote/core/web/components/console/editor/native-document/authorityEntryExtension.ts";
import { DocumentEnclosedChar, EnclosedCharLineBoundaryKeys } from "./enclosedCharExtension";
import { DocumentEastAsianLayout } from "./eastAsianLayoutExtension";
import { DocumentFootnotes } from "@mrnote/core/web/components/console/editor/native-document/footnoteExtension.tsx";
import { DocumentCitations } from "@mrnote/core/web/components/console/editor/native-document/citationExtension.tsx";
import { DocumentCrossReferences } from "@mrnote/core/web/components/console/editor/native-document/crossReferenceExtension.tsx";
import { DocumentFields } from "./documentFieldExtension";
import { DocumentMailMerge } from "./mergeFieldExtension";
import { DocumentRuby } from "./rubyAnnotationExtension";
import { DocumentCaptions } from "./captionExtension";
import { DocumentContentControls } from "./contentControlExtension";
import { DocumentFormFill } from "./documentFormFill";
import { FloatingTextBoxLayout } from "@mrnote/core/web/components/console/editor/native-document/floatingTextBoxLayout.ts";
import { DocumentAutoHyphenation } from "./documentAutoHyphenation";
import { DocumentHyphenationRules } from "./documentHyphenationRules";
import { BandFloatExclusion } from "@mrnote/core/web/components/console/editor/native-document/paged/bandFloatExclusion.ts";
import { TextBoxFrameChrome } from "@mrnote/core/web/components/console/editor/native-document/textBoxFrameChrome.ts";
import ListOfFigures from "./listOfFigures";
import { DocumentOrderedList } from "./orderedListExtension";
import { DocumentBulletList } from "./bulletListExtension";
import { DocumentListLevelKeys, DocumentListLevels } from "./listLevelCommands";
import HeadingNumbering from "./headingNumberingExtension";
import ListDefinitionMarkers from "@mrnote/core/web/components/console/editor/native-document/listDefinitionMarkers.ts";
import TableStructure from "@mrnote/core/web/components/console/editor/native-document/tableStructureExtension.ts";
import DocumentTableGridFiller from "./tableGridFillerExtension";
import DocumentTableHideMark from "./tableHideMark";
import DocumentTableNoWrap from "@mrnote/core/web/components/console/editor/native-document/tableNoWrap.ts";
import DocumentStyleSeparator from "./styleSeparator";
import DocumentSectionMarkParagraph from "./sectionMarkParagraph";
import DocumentTrailingBlankLineHeight from "./trailingBlankLineHeight";
import { FloatSelectionPaste } from "@mrnote/core/web/components/console/editor/native-document/floatInsertionPoint.ts";
import DocumentWordTextFrames from "./wordTextFrames";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import FormattingMarks, {
  formattingMarksPresentation,
} from "./formattingMarksExtension";
import { DocumentHiddenText } from "./hiddenTextExtension";
import { DocumentProofingLanguage } from "./proofingLanguageExtension";
import { DocumentMedia } from "./documentMediaExtension";
import { DocumentSignatureLine } from "./documentSignatureLineExtension";
import { DocumentAltChunkReadOnly } from "./documentAltChunkReadOnlyExtension";
import DocumentVirtualTable from "./documentVirtualTableExtension";
import { PageBlock } from "@mrnote/core/web/components/console/editor/native-document/paged/pageBlockExtension.ts";
import { PageEdgeMarks } from "./paged/pageEdgeMarks";
import { CaretPlaceholder } from "./caretPlaceholder";
import { InkLossWatch } from "./inkLossWatch";
import { CrossSheetEditing } from "@mrnote/core/web/components/console/editor/native-document/paged/crossSheetEditing.ts";
import { ColumnFlowDecorations } from "@mrnote/core/web/components/console/editor/native-document/paged/columnFlowDecorations.ts";
import { PageLedger } from "./paged/ledger/pageLedgerExtension";
import { PageSpanExtension } from "@mrnote/core/web/components/console/editor/native-document/paged/pageSpanExtension.ts";
import { AtomRowSlices } from "./paged/atomRowSliceExtension";
import { NoteSliceIntegrity } from "@mrnote/core/web/components/console/editor/native-document/paged/noteSliceIntegrity.ts";
import { editsStayInsideTextblocks } from "@mrnote/core/web/components/console/editor/native-document/textblockOnlyEdits.ts";
import { GeneratedListPageNumbers } from "./generatedListPageNumbers";
import { NewPictureFit } from "./newPictureFit";
import {
  TableFragmentNavigation,
  TablePaginationRuntimeAttrs,
} from "./paged/tablePaginationAttrsExtension";
import { TABLE_ROW_CONTINUES_ATTR } from "@mrnote/core/web/components/console/editor/native-document/paged/tablePagination.ts";
import { ContainerPageSplitAttrs } from "@mrnote/core/web/components/console/editor/native-document/paged/containerSplitting.ts";
import TableGridFit from "./tableGridFit";
import {
  DOCUMENT_TABLE_DENSE_REPRESENTATION,
  DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS,
  DOCUMENT_TABLE_MIN_FIXED_WIDTH_TWIPS,
  documentTableRepresentationFromNodeAttrs,
  isDocumentTableLayoutMode,
} from "@mrnote/core/web/components/console/editor/native-document/tableLayoutPolicy.ts";
import {
  tableStyleOptionsFromAttrs,
  tableStyleThemeFromAttrs,
} from "@mrnote/core/web/components/console/editor/native-document/tableStyleGallery.ts";
import EvidenceLocator from "./evidenceLocatorExtension";
import {
  normalizeTableRowHeight,
  normalizeTableRowHeightRule,
  normalizeTableRowHeightTwips,
  tableRowHeightAttributes,
} from "@mrnote/core/web/components/console/editor/native-document/tableRowStyle.ts";
import {
  materializedColumnWidths,
  materializedColumnWidthsTwips,
  readTableColumnWidthsTwipsFromElement,
  tableColumnWidthsTwipsAttributes,
} from "@mrnote/core/web/components/console/editor/native-document/tableStructure.ts";
import {
  DOCUMENT_TABLE_RESIZE_HIT_WIDTH_PX,
  StableTableColumnResizeView,
} from "@mrnote/core/web/components/console/editor/native-document/stableTableColumnResizeView.ts";
import { createDocumentTableBorderDragPlugin } from "@mrnote/core/web/components/console/editor/native-document/documentTableBorderDrag.ts";
import { normalizeDocumentTableAltText } from "./tableProperties";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentTableDesignAuthority: {
      setDocumentTableDesignAuthority: (
        target: DocumentTableDesignTarget,
        state: DocumentTableDesignState,
      ) => ReturnType;
    };
    documentTableCells: {
       
      setSelectedCellsAttribute: (name: string, value: unknown) => ReturnType;
       
      alignSelectedCellParagraphs: (align: string) => ReturnType;
    };
  }
}
import { ParagraphStyleAssignment } from "@mrnote/core/web/components/console/editor/native-document/paragraphStyles.ts";
import { AutoCorrect } from "./autoCorrectExtension";
import { SpecialCharacterShortcuts } from "./specialCharacterShortcuts";
import { DocumentParagraphNavigation } from "./paragraphNavigation";
import ReadOnlyTransactionAuthority from "@mrnote/core/web/components/console/editor/native-document/readOnlyTransactionAuthority.ts";
import ImeCompositionGuard from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import NativeHistoryInput from "./nativeHistoryInput";
import TypingRunTime from "./typingRunTime";
import ParagraphBorderGroups from "./paragraphBorderGroups";
import DocumentBoundaryInteraction from "@mrnote/core/web/components/console/editor/native-document/documentBoundaryInteraction.ts";
import NativeParagraphInput from "./nativeParagraphInput";
import NativeSelectionVisibility from "./nativeSelectionVisibility";
import WordEditorShortcuts from "./wordEditorShortcuts";
import DocumentGapDragSelection from "./documentGapDragSelection";
import DocumentLineBoundaryKeys from "./documentLineBoundaryKeys";
import DocumentOpenCaret from "./documentOpenCaret";
import DocumentPointerFocusCaret from "./documentPointerFocusCaret";
import DocumentWholeSelection from "./documentWholeSelection";
import ScrollportToolbarMargin from "./scrollportToolbarMargin";
import DocumentListAutoFormat from "./documentListAutoFormat";
import { ContextualParagraphSpacing } from "@mrnote/core/web/components/console/editor/native-document/contextualParagraphSpacingExtension.ts";
import { DocumentTaskItem, DocumentTaskList } from "@mrnote/core/web/components/console/editor/native-document/listParagraphSpacing.ts";
import { DocumentHeadingStyles } from "./headingStyleExtension";
import { normalizeLinkTitle } from "@mrnote/core/web/components/console/editor/native-document/linkPlaces.ts";
import {
  EQUATION_STRUCTURE_MEMBERS,
  EQUATION_STRUCTURES,
  EQUATION_SYMBOL_GROUPS,
  MATH_SYMBOLS,
  equationStructureMembersForFamily,
} from "@mrnote/core/web/components/console/editor/extensions/equationCatalog.ts";
import { equationRibbonCopy } from "@mrnote/core/web/components/console/editor/native-document/equationRibbonCopy.ts";
import { DocumentDisplayFonts } from "@mrnote/core/web/components/console/editor/native-document/documentDisplayFonts.ts";
import { DocumentSyntheticBoldWordAdvance } from "./documentSyntheticBoldWordAdvance";
import {
  normalizeFontFamily,
  normalizeFontSize,
} from "@mrnote/core/web/components/console/editor/extensions/TextStyling.ts";
import {
  normalizeLineHeight,
  normalizeLineHeightPt,
  normalizeLineHeightRule,
  normalizeShadingColor,
  normalizeSpacing,
} from "@mrnote/core/web/components/console/editor/extensions/DocumentFormatting.ts";
import { isDocumentOnlineVideoV1Enabled } from "@mrnote/core/web/lib/document-flags.ts";
import { officeWordTableStyleForAllocatedId } from "@mrnote/core/web/lib/office-table-style-word.ts";
import { officeEditPointsLabels } from "@mrnote/core/web/lib/office-drawing-overlays.ts";
import { documentPictureDisplaySrc } from "@mrnote/core/web/lib/document-picture-references.ts";
import { pictureObjectTokenSha } from "@mrnote/core/web/lib/page-picture-objects.ts";
import { normalizePictureEffectExtent, normalizePictureShadow } from "./pictureLayoutEffects";
import { normalizeOfficeShadowEffect } from "@mrnote/core/web/lib/office-shadow-effects.ts";
import { SectionChainHistoryRepair } from "./sectionChainHistoryRepair";

// A transaction made on an earlier document is rebased, not refused

installProseMirrorResilience();

type Lowlight = ReturnType<typeof createLowlight>;

type TableCellNodeViewInput = Pick<NodeViewRendererProps, "node" | "view" | "decorations">;

function hasNativeGridPadding(decorations: NodeViewRendererProps["decorations"]): boolean {
  return decorations.some(decoration => typeof decoration.spec.nativeGridPadding === "string");
}

/** Whether `name` (a longhand, or the shorthand a browser lists for it) is
 * one a cell decoration sets. */
function cellStyleOwnedByDecoration(owned: ReadonlySet<string>, name: string): boolean {
  if (owned.has(name)) return true;
  for (const property of owned) if (property.startsWith(`${name}-`)) return true;
  return false;
}

/** The CSS properties the cell's outer decorations say they set over the
 * cell's own (a row's larger top margin, tableCellMarginsPlugin). */
function decorationOwnedCellStyles(
  decorations: NodeViewRendererProps["decorations"],
): ReadonlySet<string> {
  const owned = new Set<string>();
  for (const decoration of decorations) {
    const names = (decoration.spec as Record<string, unknown>)[TABLE_CELL_DECORATION_STYLE_PROPERTIES];
    if (!Array.isArray(names)) continue;
    for (const name of names) if (typeof name === "string" && name) owned.add(name);
  }
  return owned;
}

interface TableCellSchemaShellSnapshot {
  readonly attributes: ReadonlyMap<string, string>;
  readonly classNames: ReadonlySet<string>;
  readonly styles: ReadonlyMap<
    string,
    { readonly value: string; readonly priority: string }
  >;
}

function isProseMirrorOwnedCellStyleProperty(name: string): boolean {
  return (
    name === "--document-table-style-bg" ||
    name === "--document-table-style-color" ||
    name === "background-image" ||
    name === "box-shadow" ||
    /^border-(?:top|right|bottom|left)(?:-|$)/.test(name)
  );
}

function tableCellSchemaShellSnapshot(
  element: HTMLElement,
  nativePadding = false,
): TableCellSchemaShellSnapshot {
  const attributes = new Map<string, string>();
  for (const attribute of Array.from(element.attributes)) {
    if (
      attribute.name === "style" ||
      attribute.name === "class" ||
      attribute.name.startsWith("data-table-style-")
    ) {
      continue;
    }
    attributes.set(attribute.name, attribute.value);
  }
  const styles = new Map<
    string,
    { readonly value: string; readonly priority: string }
  >();
  for (const name of Array.from(element.style)) {
    if (isProseMirrorOwnedCellStyleProperty(name)) continue;
    if (nativePadding && (name === "padding" || name === "padding-left" || name === "padding-right")) continue;
    styles.set(name, {
      value: element.style.getPropertyValue(name),
      priority: element.style.getPropertyPriority(name),
    });
  }
  return {
    attributes,
    classNames: new Set(element.classList),
    styles,
  };
}

function replaceTableCellSchemaShell(
  dom: HTMLElement,
  previous: TableCellSchemaShellSnapshot,
  next: TableCellSchemaShellSnapshot,
  decorationOwned: ReadonlySet<string> = new Set(),
): void {
  for (const name of new Set([
    ...previous.attributes.keys(),
    ...next.attributes.keys(),
  ])) {
    const value = next.attributes.get(name);
    if (value === undefined) dom.removeAttribute(name);
    else if (dom.getAttribute(name) !== value) dom.setAttribute(name, value);
  }
  for (const className of previous.classNames) {
    if (!next.classNames.has(className)) dom.classList.remove(className);
  }
  for (const className of next.classNames) dom.classList.add(className);
  for (const name of new Set([
    ...previous.styles.keys(),
    ...next.styles.keys(),
  ])) {
    // An outer decoration's value of the property is the one shown: ProseMirror
    // applied it over the schema's and will not again while it is unchanged.
    if (cellStyleOwnedByDecoration(decorationOwned, name)) continue;
    const declaration = next.styles.get(name);
    if (!declaration) dom.style.removeProperty(name);
    else if (
      dom.style.getPropertyValue(name) !== declaration.value ||
      dom.style.getPropertyPriority(name) !== declaration.priority
    ) {
      dom.style.setProperty(name, declaration.value, declaration.priority);
    }
  }
  if (dom.style.length === 0) dom.removeAttribute("style");
  if (dom.classList.length === 0) dom.removeAttribute("class");
}

function renderLiveTableCellShell({
  node,
  view,
}: Pick<TableCellNodeViewInput, "node" | "view">): HTMLElement {
  const toDOM = node.type.spec.toDOM;
  if (!toDOM) throw new Error(`${node.type.name} has no DOM serializer`);
  const rendered = DOMSerializer.renderSpec(
    view.dom.ownerDocument,
    toDOM(node),
  );
  const HTMLElementConstructor =
    view.dom.ownerDocument.defaultView?.HTMLElement;
  if (
    !HTMLElementConstructor ||
    !(rendered.dom instanceof HTMLElementConstructor)
  ) {
    throw new Error(`${node.type.name} must render an HTML element`);
  }
  projectCellBackgroundForEditor(rendered.dom);
  return rendered.dom;
}

/**
 * Own the td/th shell at the nearest ProseMirror NodeView boundary. Schema
 * attributes are synchronized without touching outer-decoration attributes;
 * text/child/selection mutations remain observable, while our own shell writes
 * cannot be reparsed as document content.
 */
function createStableDocumentTableCellView(
  input: TableCellNodeViewInput,
): NodeView {
  let currentNode = input.node;
  const nativePadding = hasNativeGridPadding(input.decorations);
  let ownedByDecorations = decorationOwnedCellStyles(input.decorations);
  const dom = renderLiveTableCellShell(input);
  let schemaShell = tableCellSchemaShellSnapshot(dom, Boolean(nativePadding));
  // Rotated text (`w:textDirection` btLr / tbRl) runs its lines along the
  // ROW's height, which the cell's other text sets: Word never grows a row
  // for its rotated text; it breaks the lines where the row ends, even inside
  // a word, and clips what does not fit across the cell (Word 16.86,
  
  // of text reads "Sh / or / e"; a row of rotated cells alone is one line
  // tall). The cell's words flow in a box laid over the cell
  // (`DOCUMENT_CELL_VERTICAL_FLOW_ATTR`), out of the row's height.
  const vertical = cellTextIsRotated(input.node);
  const contentDOM = vertical ? verticalCellFlow(dom) : dom;
  // The custom view owns only the schema-rendered shell. ProseMirror applies
  // outer decorations after creation and patches/removes them after a
  // successful update. Direct schema data and safe CSS declarations are
  // synchronized property-by-property, so a cell formatting command never
  // wipes an unchanged PM decoration with setAttribute("style"). Shells are
  // recreated only for schema declarations that overlap another plugin.

  return {
    dom,
    contentDOM,
    update(nextNode, decorations) {
      if (nextNode.type !== currentNode.type) return false;
      if (cellTextIsRotated(nextNode) !== vertical) return false;
      // Only the proven native grid delegates horizontal padding to PM. A
      // change/removal recreates the schema shell so its authored padding is
      // restored before new decorations apply; ordinary text updates keep it.
      if (hasNativeGridPadding(decorations) !== nativePadding) return false;
      // These legacy shorthand/margin declarations can share CSS longhands
      // with another outer-decoration plugin. Recreating the shell lets PM
      // apply the current aggregate once, without an ownership-order race.
      if (
        JSON.stringify(nextNode.attrs.borderStyle) !==
          JSON.stringify(currentNode.attrs.borderStyle) ||
        JSON.stringify(nextNode.attrs.cellMargin) !==
          JSON.stringify(currentNode.attrs.cellMargin)
      ) {
        return false;
      }
      // The shading pattern is a `background-image`, a property the diagonal
      // border decoration shares, so the property-by-property sync below
      // leaves it alone: a new or changed pattern stayed off the cell until
      // the page was reopened (live Word audit WUA 120). Recreate the shell
      // when the pattern, or the fill a percentage pattern is mixed with,
      // changes.
      if (
        JSON.stringify(nextNode.attrs.cellShading) !==
          JSON.stringify(currentNode.attrs.cellShading) ||
        (nextNode.attrs.cellShading &&
          nextNode.attrs.backgroundColor !== currentNode.attrs.backgroundColor)
      ) {
        return false;
      }
      const nextShell = renderLiveTableCellShell({
        node: nextNode,
        view: input.view,
      });
      const nextSchemaShell = tableCellSchemaShellSnapshot(nextShell, Boolean(nativePadding));
      // A row's larger top margin over the cell's own is a decoration's
      // padding-top; selecting the row (another decoration) used to write the
      // cell's own value back over it, and the text jumped up (WUA 257). The
      // sync leaves what a decoration sets to it. When a decoration lets go
      // of a property the schema also sets, ProseMirror removes it after this
      // update: the shell is recreated so the cell's own value comes back.
      const nextOwned = decorationOwnedCellStyles(decorations);
      for (const name of ownedByDecorations) {
        if (nextOwned.has(name)) continue;
        const shorthand = name.replace(/-(?:top|right|bottom|left)$/, "");
        if (nextSchemaShell.styles.has(name) || nextSchemaShell.styles.has(shorthand)) return false;
      }
      replaceTableCellSchemaShell(dom, schemaShell, nextSchemaShell, nextOwned);
      ownedByDecorations = nextOwned;
      schemaShell = nextSchemaShell;
      currentNode = nextNode;
      return true;
    },
    ignoreMutation(record: ViewMutationRecord) {
      return record.type === "attributes" && (record.target === dom || record.target === contentDOM);
    },
  };
}

/** On a table cell whose rotated words flow in their own box. */
export const DOCUMENT_CELL_VERTICAL_FLOW_ATTR = "data-cell-vertical-flow";

function cellTextIsRotated(node: TableCellNodeViewInput["node"]): boolean {
  const direction = normalizeCellTextDirection(node.attrs.textDirection);
  return direction === "btLr" || direction === "tbRl";
}

function verticalCellFlow(cell: HTMLElement): HTMLElement {
  cell.setAttribute(DOCUMENT_CELL_VERTICAL_FLOW_ATTR, "host");
  const flow = cell.ownerDocument.createElement("div");
  flow.setAttribute(DOCUMENT_CELL_VERTICAL_FLOW_ATTR, "flow");
  cell.appendChild(flow);
  return flow;
}

/**
 * One visible reason per burst: a refused command may dispatch (and be
 * refused) several times for a single user action.
 */
function createGridFillerRefusalNotice(
  translate: (key: string) => string,
): (reason: "content" | "structure") => void {
  let lastShownAt = 0;
  return (reason) => {
    const now = Date.now();
    if (now - lastShownAt < 1500) return;
    lastShownAt = now;
    toast({
      title: translate(
        reason === "structure"
          ? "document.tableGridFiller.structureUnwritable"
          : "document.tableGridFiller.notACell",
      ),
    });
  };
}

/**
 * The grid widths (live px and, where the table carries them, native twips)
 * of the columns a CellSelection is about to merge across, read before the
 * merge. Null when the selection is no cell rectangle or spans one column.
 */
function mergedRegionGridWidths(
  state: EditorState,
): { span: number; px: number[] | null; twips: number[] | null } | null {
  if (!(state.selection instanceof CellSelection)) return null;
  let rect: ReturnType<typeof selectedRect>;
  try {
    rect = selectedRect(state);
  } catch {
    return null;
  }
  const span = rect.right - rect.left;
  if (span < 2) return null;
  const table = rect.table.toJSON() as Parameters<typeof materializedColumnWidths>[0];
  const px = materializedColumnWidths(table)?.slice(rect.left, rect.right) ?? null;
  const twips = materializedColumnWidthsTwips(table)?.slice(rect.left, rect.right) ?? null;
  return px || twips ? { span, px, twips } : null;
}

function positiveNumericAttr(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export interface NativeDocumentPlugin {
  id: string;
  extensions: AnyExtension[];
}

export interface NativeDocumentPluginRegistry {
  plugins: NativeDocumentPlugin[];
  extensions: AnyExtension[];
}

interface NativeDocumentPluginRegistryOptions {
  lowlight: Lowlight;
  pageId: string;
  placeholder: string;
  translate: Translator;
  /**
   * Static fallback used when no live getter is supplied. Useful for
   * tests; production callers should pass `getNotebookId` instead so
   * the [[ wiki-link suggestion popup picks up the live notebook id
   * after autosave hydrates.
   */
  notebookId?: string | null;
  getNotebookId?: () => string | null;
  /**
   * When `true`, StarterKit's built-in undo/redo `history` is removed from the
   * extension list. ADDITIVE + collab-gated: NoteEditor passes this ONLY when the
   * `USE_COLLAB_EDITING` flag is on, because TipTap's `Collaboration` extension
   * replaces the default history with the Yjs undo manager and the two cannot
   * coexist. Defaults to `false` (history intact), so the normal single-user
   * editor is unchanged.
   */
  disableHistory?: boolean;
  /**
   * Guest mode (public marketing demo). When `true`, every block extension and
   * the slash-command menu skip their authed API calls / hide their authed
   * surfaces (file upload + convert + attachment fetch, task complete, flashcard
   * page-meta + add-to-deck, whiteboard summarize, reference search, slash-menu
   * AI brainstorm / study Q&A / image upload). Defaults to `false` → the
   * authenticated console keeps every feature byte-for-byte unchanged.
   */
  guestMode?: boolean;
  /**
   * Live getter for the AutoCorrect / smart-typography preference (curly quotes,
   * em-dash, ellipsis, ©/™/®, trivial fractions while typing). Read through a
   * getter — like `getNotebookId` — so toggling the preference takes effect
   * WITHOUT rebuilding the editor (the editor instance is created once; the
   * input-rule handlers consult this at fire time). Defaults to always-on,
   * matching Word and the tests that build the registry with no options.
   */
  getAutoCorrectEnabled?: () => boolean;
  /**
   * The print surface (DocumentPrintSurface): nobody reads the pages while
   * they are laid out, so the page ledger lays the far ones out at once
   * instead of in the app's idle time. Same pages, sooner. Defaults to
   * `false` (the editor's pace).
   */
  printSurface?: boolean;
}

function createCodeBlockExtension(lowlight: Lowlight): AnyExtension {
  return CodeBlockLowlight.extend({
    // The highlighting plugin found every code block of the old and the new
    // document on every transaction (a caret move too) before deciding to
    // keep its decorations. A transaction that changes no document, or edits
    // only inside one text block that is not a code block (with the
    // selection out of code blocks), cannot add, remove or re-highlight
    // one: its set is mapped as the plugin would map it.
    addProseMirrorPlugins() {
      const name = this.name;
      return (this.parent?.() ?? []).map((plugin) => {
        const state = plugin.spec.state;
        if (!state || !(plugin.spec.key as unknown as { key?: string } | undefined)?.key?.startsWith("lowlight$")) return plugin;
        const apply = state.apply;
        state.apply = function (tr, value, oldState, newState) {
          if (!tr.docChanged) return value;
          if (
            oldState.selection.$head.parent.type.name !== name &&
            newState.selection.$head.parent.type.name !== name &&
            editsStayInsideTextblocks([tr], (block) => block.type.name === name)
          ) {
            return (value as DecorationSet).map(tr.mapping, tr.doc);
          }
          return apply.call(this, tr, value, oldState, newState);
        };
        return plugin;
      });
    },
    // ⌘⌥C / Ctrl+Alt+C is Word's Copy Formatting (wordKeyboardShortcuts.ts),
    // not "make this paragraph a code block"; the block's own keys stay.
    addKeyboardShortcuts() {
      const shortcuts = { ...this.parent?.() };
      delete shortcuts["Mod-Alt-c"];
      return shortcuts;
    },
    addAttributes() {
      return {
        ...this.parent?.(),
        language: {
          default: null,
          parseHTML: (element) =>
            element.getAttribute("data-language") ||
            (() => {
              const codeEl = element.querySelector("code");
              if (!codeEl) return null;
              const cls = codeEl.className || "";
              const match = cls.match(/language-([\w+#-]+)/);
              return match ? match[1] : null;
            })(),
          renderHTML: (attrs) => {
            const language = (attrs as { language?: string | null }).language;
            return language ? { "data-language": language } : {};
          },
        },
        filename: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-filename") || null,
          renderHTML: (attrs) => {
            const filename = (attrs as { filename?: string | null }).filename;
            return filename ? { "data-filename": filename } : {};
          },
        },
        // Effective Word/WPS code-paragraph formatting. CodeBlockLowlight
        // disallows inline marks, so these bounded node attrs are the only way
        // to retain a named code style through editor JSON and back to DOCX.
        // They are absent on native MRNote code blocks, which keep the existing
        // visual defaults byte-for-byte.
        fontFamily: {
          default: null,
          parseHTML: (element) =>
            normalizeFontFamily(
              element.getAttribute("data-code-font-family") ||
                element.style.fontFamily,
            ),
          renderHTML: (attrs) => {
            const family = normalizeFontFamily(attrs.fontFamily);
            return family
              ? {
                  "data-code-font-family": family,
                  style: `font-family: ${family}`,
                }
              : {};
          },
        },
        fontCjkFamily: {
          default: null,
          parseHTML: (element) =>
            normalizeFontFamily(
              element.getAttribute("data-code-font-cjk-family"),
            ),
          renderHTML: (attrs) => {
            const family = normalizeFontFamily(attrs.fontCjkFamily);
            return family ? { "data-code-font-cjk-family": family } : {};
          },
        },
        fontSize: {
          default: null,
          parseHTML: (element) =>
            normalizeFontSize(
              element.getAttribute("data-code-font-size") ||
                element.style.fontSize,
            ),
          renderHTML: (attrs) => {
            const size = normalizeFontSize(attrs.fontSize);
            return size
              ? {
                  "data-code-font-size": size,
                  style: `font-size: ${size}`,
                }
              : {};
          },
        },
        lineHeight: {
          default: null,
          parseHTML: (element) =>
            normalizeLineHeight(element.getAttribute("data-code-line-height")),
          renderHTML: (attrs) => {
            const value = normalizeLineHeight(attrs.lineHeight);
            return value
              ? {
                  "data-code-line-height": value,
                  style: `line-height: ${value}`,
                }
              : {};
          },
        },
        lineHeightPt: {
          default: null,
          parseHTML: (element) =>
            normalizeLineHeightPt(
              element.getAttribute("data-code-line-height-pt"),
            ),
          renderHTML: (attrs) => {
            const value = normalizeLineHeightPt(attrs.lineHeightPt);
            return value !== null
              ? {
                  "data-code-line-height-pt": String(value),
                  style: `line-height: ${value}pt`,
                }
              : {};
          },
        },
        lineHeightRule: {
          default: null,
          parseHTML: (element) =>
            normalizeLineHeightRule(
              element.getAttribute("data-code-line-height-rule"),
            ),
          renderHTML: (attrs) => {
            const value = normalizeLineHeightRule(attrs.lineHeightRule);
            return value ? { "data-code-line-height-rule": value } : {};
          },
        },
        spaceBefore: {
          default: null,
          parseHTML: (element) =>
            normalizeSpacing(element.getAttribute("data-code-space-before")),
          renderHTML: (attrs) => {
            const value = normalizeSpacing(attrs.spaceBefore);
            return value !== null
              ? {
                  "data-code-space-before": String(value),
                  style: `margin-top: ${value}pt`,
                }
              : {};
          },
        },
        spaceAfter: {
          default: null,
          parseHTML: (element) =>
            normalizeSpacing(element.getAttribute("data-code-space-after")),
          renderHTML: (attrs) => {
            const value = normalizeSpacing(attrs.spaceAfter);
            return value !== null
              ? {
                  "data-code-space-after": String(value),
                  style: `margin-bottom: ${value}pt`,
                }
              : {};
          },
        },
        shadingColor: {
          default: null,
          parseHTML: (element) =>
            normalizeShadingColor(
              element.getAttribute("data-code-shading-color") ||
                element.style.backgroundColor,
            ),
          renderHTML: (attrs) => {
            const color = normalizeShadingColor(attrs.shadingColor);
            return color
              ? {
                  "data-code-shading-color": color,
                  style: `background-color: ${color}`,
                }
              : {};
          },
        },
        // V3.6 Word page-splitting (editor-runtime only, merged away at
        // every serialization boundary — see paged/blockSplitting.ts).
        // The data attrs drive the seam chrome (cut edges render open).
        [SPLIT_CONTINUES_ATTR]: {
          default: false,
          parseHTML: (element) =>
            element.getAttribute(`data-${SPLIT_ATTR_DASHED_CONTINUES}`) ===
            "true",
          renderHTML: (attrs) =>
            (attrs as Record<string, unknown>)[SPLIT_CONTINUES_ATTR] === true
              ? { [`data-${SPLIT_ATTR_DASHED_CONTINUES}`]: "true" }
              : {},
        },
        [SPLIT_CONTINUATION_ATTR]: {
          default: false,
          parseHTML: (element) =>
            element.getAttribute(`data-${SPLIT_ATTR_DASHED_CONTINUATION}`) ===
            "true",
          renderHTML: (attrs) =>
            (attrs as Record<string, unknown>)[SPLIT_CONTINUATION_ATTR] === true
              ? { [`data-${SPLIT_ATTR_DASHED_CONTINUATION}`]: "true" }
              : {},
        },
        [SPLIT_PIECE_OF_ATTR]: SPLIT_PIECE_OF_ATTR_SPEC,
      };
    },
  }).configure({ lowlight });
}

/** A fragment's piece identity (paged/paginationProjectionKeys): runtime
 * state the pagination keeps, never drawn, never pasted, never carried onto
 * the new paragraph Enter makes. */
const SPLIT_PIECE_OF_ATTR_SPEC = { default: null, keepOnSplit: false, rendered: false } as const;

const SPLIT_ATTR_DASHED_CONTINUES = "page-split-continues";
const SPLIT_ATTR_DASHED_CONTINUATION = "page-split-continuation";

/** V3.7 Word page-splitting for text-flow blocks (editor-runtime only,
 * merged away at every serialization boundary — see paged/blockSplitting).
 * The data attrs let CSS suppress continuation-only paragraph/heading chrome. */
const TextBlockPageSplitAttrs = Extension.create({
  name: "textBlockPageSplitAttrs",
  addGlobalAttributes() {
    const attrFor = (dashed: string, key: string) => ({
      default: false,
      parseHTML: (element: HTMLElement) =>
        element.getAttribute(`data-${dashed}`) === "true",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs[key] === true ? { [`data-${dashed}`]: "true" } : {},
    });
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          [SPLIT_CONTINUES_ATTR]: attrFor(
            SPLIT_ATTR_DASHED_CONTINUES,
            SPLIT_CONTINUES_ATTR,
          ),
          [SPLIT_CONTINUATION_ATTR]: attrFor(
            SPLIT_ATTR_DASHED_CONTINUATION,
            SPLIT_CONTINUATION_ATTR,
          ),
          [SPLIT_PIECE_OF_ATTR]: SPLIT_PIECE_OF_ATTR_SPEC,
        },
      },
    ];
  },
});

function boundedImageAttachmentText(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function imageAttachmentSize(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 100 * 1024 * 1024
    ? numeric
    : null;
}

function imageCropAttribute(edge: "top" | "right" | "bottom" | "left") {
  const attributeName = `data-picture-crop-${edge}`;
  const propertyName = {
    top: "pictureCropTop",
    right: "pictureCropRight",
    bottom: "pictureCropBottom",
    left: "pictureCropLeft",
  }[edge];
  return {
    default: 0,
    parseHTML: (element: HTMLElement) =>
      normalizeImageCropPercent(element.getAttribute(attributeName)),
    renderHTML: (attrs: Record<string, unknown>) => {
      const value = normalizeImageCropPercent(attrs[propertyName]);
      return value === 0 ? {} : { [attributeName]: String(value) };
    },
  };
}

function createDocumentImageExtension(
  labels: ImageRuntimeStatusLabels,
  placement: "block" | "inline" = "block",
): AnyExtension {
  const picture = Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        // A picture of an imported Word document is named by its digest,
        // `mrai-picture:<sha256>` (document-picture-references). Written as
        // `src`, that token is no address: an `<img>` built from this HTML
        // (a paste, a measuring copy) would ask the browser to load it and
        // fail. The HTML carries the picture's URL as `src` and the token
        // beside it, and reading the HTML back keeps the token.
        src: {
          default: null,
          parseHTML: (element) =>
            pictureObjectTokenSha(element.getAttribute("data-mrai-picture"))
              ? element.getAttribute("data-mrai-picture")
              : element.getAttribute("src"),
          renderHTML: (attrs) => {
            const src = (attrs as { src?: unknown }).src;
            if (!pictureObjectTokenSha(src)) return src == null ? {} : { src };
            return { src: documentPictureDisplaySrc(src), "data-mrai-picture": src };
          },
        },
        // Alt text. The inherited extension keeps the raw attribute verbatim, so
        // pasted/imported HTML could smuggle control bytes or attribute-breaking
        // payloads past the toolbar's sanitizer. Re-run sanitizeImageAltText on
        // both parse (incoming HTML) and render (outgoing HTML) so a forged
        // `alt` can never bypass the same scrub the UI applies.
        alt: {
          default: null,
          parseHTML: (element) =>
            sanitizeImageAltText(element.getAttribute("alt")),
          renderHTML: (attrs) => {
            const alt = sanitizeImageAltText((attrs as { alt?: unknown }).alt);
            return alt ? { alt } : {};
          },
        },
        // Authenticated notebook image custody. These attrs are additive for
        // imported/data-URL images and let the raw NodeView refresh an expiring
        // signed URL without replacing the durable page JSON source of truth.
        attachment_id: {
          default: null,
          parseHTML: (element) =>
            boundedImageAttachmentText(
              element.getAttribute("data-attachment-id"),
              128,
            ),
          renderHTML: (attrs) => {
            const value = boundedImageAttachmentText(
              (attrs as { attachment_id?: unknown }).attachment_id,
              128,
            );
            return value ? { "data-attachment-id": value } : {};
          },
        },
        filename: {
          default: null,
          parseHTML: (element) =>
            boundedImageAttachmentText(
              element.getAttribute("data-attachment-filename"),
              512,
            ),
          renderHTML: (attrs) => {
            const value = boundedImageAttachmentText(
              (attrs as { filename?: unknown }).filename,
              512,
            );
            return value ? { "data-attachment-filename": value } : {};
          },
        },
        mime_type: {
          default: null,
          parseHTML: (element) =>
            boundedImageAttachmentText(
              element.getAttribute("data-attachment-mime"),
              128,
            ),
          renderHTML: (attrs) => {
            const value = boundedImageAttachmentText(
              (attrs as { mime_type?: unknown }).mime_type,
              128,
            );
            return value ? { "data-attachment-mime": value } : {};
          },
        },
        size_bytes: {
          default: null,
          parseHTML: (element) =>
            imageAttachmentSize(
              element.getAttribute("data-attachment-size"),
            ),
          renderHTML: (attrs) => {
            const value = imageAttachmentSize(
              (attrs as { size_bytes?: unknown }).size_bytes,
            );
            return value === null
              ? {}
              : { "data-attachment-size": String(value) };
          },
        },
        width: {
          default: null,
          parseHTML: (element) =>
            positiveNumericAttr(element.getAttribute("width")),
          renderHTML: (attrs) => {
            const width = positiveNumericAttr(
              (attrs as { width?: unknown }).width,
            );
            return width ? { width: String(Math.round(width)) } : {};
          },
        },
        height: {
          default: null,
          parseHTML: (element) =>
            positiveNumericAttr(element.getAttribute("height")),
          renderHTML: (attrs) => {
            const height = positiveNumericAttr(
              (attrs as { height?: unknown }).height,
            );
            return height ? { height: String(Math.round(height)) } : {};
          },
        },
        widthEmu: {
          default: null,
          parseHTML: (element) =>
            positiveNumericAttr(element.getAttribute("data-width-emu")),
          renderHTML: (attrs) => {
            const widthEmu = positiveNumericAttr(
              (attrs as { widthEmu?: unknown }).widthEmu,
            );
            return widthEmu
              ? { "data-width-emu": String(Math.round(widthEmu)) }
              : {};
          },
        },
        heightEmu: {
          default: null,
          parseHTML: (element) =>
            positiveNumericAttr(element.getAttribute("data-height-emu")),
          renderHTML: (attrs) => {
            const heightEmu = positiveNumericAttr(
              (attrs as { heightEmu?: unknown }).heightEmu,
            );
            return heightEmu
              ? { "data-height-emu": String(Math.round(heightEmu)) }
              : {};
          },
        },
        // Word DrawingML `a:graphicFrameLocks/@noChangeAspect`. New/local
        // images keep the editor's historical locked resize default; an
        // imported source drawing supplies the explicit native boolean.
        pictureLockAspectRatio: {
          default: true,
          parseHTML: (element) =>
            element.getAttribute("data-picture-lock-aspect-ratio") !== "false",
          renderHTML: (attrs) =>
            (attrs as { pictureLockAspectRatio?: unknown })
              .pictureLockAspectRatio === false
              ? { "data-picture-lock-aspect-ratio": "false" }
              : {},
        },
        // VML/unsupported source containers remain visibly locked but cannot
        // authorize a native lock mutation. This receipt is editor-only and
        // never substitutes for the server's immutable package authentication.
        pictureLockAspectRatioEditable: {
          default: null,
          parseHTML: (element) => {
            const raw = element.getAttribute(
              "data-picture-lock-aspect-ratio-editable",
            );
            return raw === "true" ? true : raw === "false" ? false : null;
          },
          renderHTML: (attrs) => {
            const value = (
              attrs as { pictureLockAspectRatioEditable?: unknown }
            ).pictureLockAspectRatioEditable;
            return typeof value === "boolean"
              ? {
                  "data-picture-lock-aspect-ratio-editable": String(value),
                }
              : {};
          },
        },
        // Exact source receipt for the supported DrawingML crop/rotation/line
        // subset. Imported pictures without this receipt stay visible but the
        // corresponding Picture commands must fail closed.
        pictureVisualFormattingEditable: {
          default: null,
          parseHTML: (element) => {
            const raw = element.getAttribute(
              "data-picture-visual-formatting-editable",
            );
            return raw === "true" ? true : raw === "false" ? false : null;
          },
          renderHTML: (attrs) => {
            const value = (
              attrs as { pictureVisualFormattingEditable?: unknown }
            ).pictureVisualFormattingEditable;
            return typeof value === "boolean"
              ? {
                  "data-picture-visual-formatting-editable": String(value),
                }
              : {};
          },
        },
        sourcePageBreakBefore: {
          default: false,
          parseHTML: (element) =>
            element.getAttribute("data-source-page-break-before") === "true",
          renderHTML: (attrs) =>
            (attrs as { sourcePageBreakBefore?: unknown })
              .sourcePageBreakBefore === true
              ? { "data-source-page-break-before": "true" }
              : {},
        },
        officeImage: {
          default: false,
          parseHTML: (element) =>
            element.getAttribute("data-office-image") === "true",
          renderHTML: (attrs) =>
            (attrs as { officeImage?: unknown }).officeImage === true
              ? { "data-office-image": "true" }
              : {},
        },
        // The import found the page showing every member of the body's
        // floating stack (`patchback.docx_floating_stack`), so Bring Forward
        // / Send Backward may move this anchored picture among the shapes,
        // frames and other pictures; the save writes its anchor's height.
        zOrderStackComplete: {
          default: undefined,
          parseHTML: (element) =>
            element.getAttribute("data-z-order-stack-complete") === "true" ? true : undefined,
          renderHTML: (attrs) =>
            (attrs as { zOrderStackComplete?: unknown }).zOrderStackComplete === true
              ? { "data-z-order-stack-complete": "true" }
              : {},
        },
        // Source DrawingML host. `dataFloat=null` is not sufficient to prove
        // wp:inline: unsupported wp:anchor positions deliberately degrade
        // without a float value. Pagination uses this closed discriminator to
        // avoid resizing an anchored Office drawing as a normal inline image.
        officeDrawingKind: {
          default: null,
          parseHTML: (element) => {
            const value = element.getAttribute("data-office-drawing-kind");
            return value === "inline" || value === "anchor" ? value : null;
          },
          renderHTML: (attrs) => {
            const value = (attrs as { officeDrawingKind?: unknown })
              .officeDrawingKind;
            return value === "inline" || value === "anchor"
              ? { "data-office-drawing-kind": value }
              : {};
          },
        },
        // The Word picture-only paragraph's Keep with next (`w:keepNext`):
        // the paginator keeps the picture with the block after it, as Word
        // keeps that paragraph (corpus R27-D13: Figure 4-2 and its caption).
        keepNext: {
          default: null,
          parseHTML: (element) =>
            element.getAttribute("data-keep-next") === "true" ? true : null,
          renderHTML: (attrs) =>
            (attrs as { keepNext?: unknown }).keepNext === true
              ? { "data-keep-next": "true" }
              : {},
        },
        // User-facing width preset (percent of the natural width). Stored as a
        // whitelisted number and parsed back from either a `data-width-percent`
        // attribute or the inline `width: N%` style. Kept separate from the
        // numeric `width` (px) attribute the AI-instruction resize path manages
        // so the two never clobber each other.
        //
        // Rendering of width% + alignment is intentionally consolidated onto the
        // `dataAlign` attribute below (via imageElementRenderAttributes) so both
        // contribute to ONE merged inline `style`. Emitting `style` from this
        // attribute as well would mean two renderHTML fragments each carry their
        // own `style` key, and (depending on TipTap's merge behavior) one could
        // overwrite the other — dropping either the width or the alignment. So
        // this attribute parses only and renders nothing on its own.
        widthPercent: {
          default: null,
          parseHTML: (element) => {
            const fromStyle = element.style?.width ?? "";
            const fromAttr = element.getAttribute("data-width-percent");
            // Free clamp (5–100): drag-resized integers round-trip too, with
            // the same strict numeric parse the preset clamp uses.
            return (
              clampImageWidthPercentFree(fromAttr) ??
              clampImageWidthPercentFree(fromStyle)
            );
          },
          renderHTML: () => ({}),
        },
        // Block alignment (left/center/right). Parsed from `data-align` against a
        // whitelist. Owns the single combined renderHTML for BOTH width% and
        // alignment: imageElementRenderAttributes folds width-percent style and
        // alignment margin/display style into one inline `style` string (plus the
        // `data-align` attribute), so width% and alignment always render together
        // and survive a stylesheet-less HTML export.
        dataAlign: {
          default: null,
          parseHTML: (element) =>
            normalizeImageAlign(element.getAttribute("data-align")),
          renderHTML: (attrs) => {
            const typed = attrs as {
              widthPercent?: unknown;
              dataAlign?: unknown;
              dataFloat?: unknown;
            };
            return imageElementRenderAttributes(
              typed.widthPercent,
              typed.dataAlign,
              typed.dataFloat,
            );
          },
        },
        // Text-wrap float (imported Word anchored images with square wrap).
        // Parse-only — dataAlign owns the single combined style render above.
        dataFloat: {
          default: null,
          parseHTML: (element) =>
            normalizeImageFloat(
              element.getAttribute("data-float") || element.style?.float,
            ),
          renderHTML: () => ({}),
        },
        pictureRotation: {
          default: 0,
          parseHTML: (element) =>
            normalizeImageRotation(element.getAttribute("data-picture-rotation")),
          renderHTML: (attrs) => {
            const value = normalizeImageRotation(
              (attrs as { pictureRotation?: unknown }).pictureRotation,
            );
            return value === 0 ? {} : { "data-picture-rotation": String(value) };
          },
        },
        pictureFlipHorizontal: {
          default: false,
          parseHTML: (element) =>
            normalizeImageFlip(
              element.getAttribute("data-picture-flip-horizontal"),
            ),
          renderHTML: (attrs) =>
            normalizeImageFlip(
              (attrs as { pictureFlipHorizontal?: unknown })
                .pictureFlipHorizontal,
            )
              ? { "data-picture-flip-horizontal": "true" }
              : {},
        },
        pictureFlipVertical: {
          default: false,
          parseHTML: (element) =>
            normalizeImageFlip(
              element.getAttribute("data-picture-flip-vertical"),
            ),
          renderHTML: (attrs) =>
            normalizeImageFlip(
              (attrs as { pictureFlipVertical?: unknown }).pictureFlipVertical,
            )
              ? { "data-picture-flip-vertical": "true" }
              : {},
        },
        pictureCropTop: imageCropAttribute("top"),
        pictureCropRight: imageCropAttribute("right"),
        pictureCropBottom: imageCropAttribute("bottom"),
        pictureCropLeft: imageCropAttribute("left"),
        pictureBorderWidth: {
          default: 0,
          parseHTML: (element) =>
            normalizeImageBorderWidth(
              element.getAttribute("data-picture-border-width"),
            ),
          renderHTML: (attrs) => {
            const value = normalizeImageBorderWidth(
              (attrs as { pictureBorderWidth?: unknown }).pictureBorderWidth,
            );
            return value === 0
              ? {}
              : { "data-picture-border-width": String(value) };
          },
        },
        pictureBorderStyle: {
          default: "solid",
          parseHTML: (element) =>
            normalizeImageBorderStyle(
              element.getAttribute("data-picture-border-style"),
            ),
          renderHTML: (attrs) => {
            const value = normalizeImageBorderStyle(
              (attrs as { pictureBorderStyle?: unknown }).pictureBorderStyle,
            );
            return value === "solid"
              ? {}
              : { "data-picture-border-style": value };
          },
        },
        pictureBorderColor: {
          default: "#000000",
          parseHTML: (element) =>
            normalizeImageBorderColor(
              element.getAttribute("data-picture-border-color"),
            ),
          renderHTML: (attrs) => {
            const value = normalizeImageBorderColor(
              (attrs as { pictureBorderColor?: unknown }).pictureBorderColor,
            );
            return value === "#000000"
              ? {}
              : { "data-picture-border-color": value };
          },
        },
        // One of Office's 28 built-in Picture Styles (shared catalogue). The
        // DOCX writers emit its complete `pic:spPr` recipe; null keeps the
        // plain rectangle and the `pictureBorder*` outline above.
        pictureStyle: {
          default: null,
          parseHTML: (element) =>
            normalizeImagePictureStyleAttr(
              element.getAttribute("data-picture-style"),
            ),
          renderHTML: (attrs) => {
            const value = normalizeImagePictureStyleAttr(
              (attrs as { pictureStyle?: unknown }).pictureStyle,
            );
            return value === null ? {} : { "data-picture-style": value };
          },
        },
        // "No Outline" set over a picture style (Word keeps the style and
        // removes only its outline). Border attrs are the outline override.
        pictureStyleOutlineHidden: {
          default: false,
          parseHTML: (element) =>
            element.getAttribute("data-picture-style-outline-hidden") ===
            "true",
          renderHTML: (attrs) =>
            (attrs as { pictureStyleOutlineHidden?: unknown })
              .pictureStyleOutlineHidden === true
              ? { "data-picture-style-outline-hidden": "true" }
              : {},
        },
        // Picture Format > Crop > Crop to Shape: the picture's own
        // `a:prstGeom/@prst` ("rect" the plain picture), stretched to its
        // frame with the crop kept (lib/office-picture-geometry). Null states
        // nothing: the picture style's own geometry, or the rectangle, and
        // an imported picture's source geometry on save.
        pictureGeometry: {
          default: null,
          parseHTML: (element) =>
            normalizeOfficePictureGeometry(
              element.getAttribute("data-picture-geometry"),
            ),
          renderHTML: (attrs) => {
            const value = normalizeOfficePictureGeometry(
              (attrs as { pictureGeometry?: unknown }).pictureGeometry,
            );
            return value ? { "data-picture-geometry": value } : {};
          },
        },
        // That geometry's `a:avLst` handle values; null = the preset's own.
        pictureGeometryAdjustments: {
          default: null,
          parseHTML: (element) => {
            const raw = element.getAttribute(
              "data-picture-geometry-adjustments",
            );
            if (!raw) return null;
            try {
              return normalizeOfficePictureGeometryAdjustments(
                element.getAttribute("data-picture-geometry"),
                JSON.parse(raw),
              );
            } catch {
              return null;
            }
          },
          renderHTML: (attrs) => {
            const typed = attrs as {
              pictureGeometry?: unknown;
              pictureGeometryAdjustments?: unknown;
            };
            const value = normalizeOfficePictureGeometryAdjustments(
              typed.pictureGeometry,
              typed.pictureGeometryAdjustments,
            );
            return value
              ? { "data-picture-geometry-adjustments": JSON.stringify(value) }
              : {};
          },
        },
        // Format Picture > 3-D Format / 3-D Rotation (reading row 544): the
        // shared model's Bevel, 3-D Format and 3-D Rotation (pictureEffects
        // normalizePicture3d), null for none; `picture3dEditable` says the
        // import read the picture's 3-D whole (else it stays the file's).
        picture3d: {
          default: null,
          parseHTML: (element) => {
            try {
              return normalizePicture3d(JSON.parse(element.getAttribute("data-picture-3d") ?? "null"));
            } catch {
              return null;
            }
          },
          renderHTML: (attrs) => {
            const value = normalizePicture3d((attrs as { picture3d?: unknown }).picture3d);
            return value ? { "data-picture-3d": JSON.stringify(value) } : {};
          },
        },
        picture3dEditable: {
          default: false,
          parseHTML: (element) => element.getAttribute("data-picture-3d-editable") === "true",
          renderHTML: (attrs) =>
            (attrs as { picture3dEditable?: unknown }).picture3dEditable === true
              ? { "data-picture-3d-editable": "true" }
              : {},
        },
        // Reading row 545: the import read the picture's own glow, reflection
        // and soft edges whole, and a change of them is saved (else they stay
        // the file's: pictureLookEffectsBlocker).
        pictureEffectsEditable: {
          default: false,
          parseHTML: (element) => element.getAttribute("data-picture-effects-editable") === "true",
          renderHTML: (attrs) =>
            (attrs as { pictureEffectsEditable?: unknown }).pictureEffectsEditable === true
              ? { "data-picture-effects-editable": "true" }
              : {},
        },
        pictureOpacity: {
          default: 100,
          parseHTML: (element) => {
            const raw = element.getAttribute("data-picture-opacity");
            return raw === null ? 100 : normalizeImageOpacity(Number(raw));
          },
          renderHTML: (attrs) => {
            const value = normalizeImageOpacity(
              (attrs as { pictureOpacity?: unknown }).pictureOpacity,
            );
            return value === 100
              ? {}
              : { "data-picture-opacity": String(value) };
          },
        },
        // Picture Format > Artistic Effects (`lib/office-artistic-effects`);
        // `artisticEffectRendered` marks a bitmap that already IS the result.
        artisticEffect: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-artistic-effect"),
          renderHTML: (attrs) => {
            const raw = (attrs as { artisticEffect?: unknown }).artisticEffect;
            return typeof raw === "string" && raw && raw !== "none"
              ? { "data-artistic-effect": raw }
              : {};
          },
        },
        // Word's layout room (`wp:effectExtent`, with the rotation it was
        // written for) and the picture's `a:outerShdw` - display facts of an
        // imported picture (pictureLayoutEffects).
        pictureEffectExtent: {
          default: null,
          parseHTML: (element) => {
            try {
              return normalizePictureEffectExtent(
                JSON.parse(element.getAttribute("data-picture-effect-extent") ?? "null"),
              );
            } catch {
              return null;
            }
          },
          renderHTML: (attrs) => {
            const value = normalizePictureEffectExtent(
              (attrs as { pictureEffectExtent?: unknown }).pictureEffectExtent,
            );
            return value ? { "data-picture-effect-extent": JSON.stringify(value) } : {};
          },
        },
        pictureShadow: {
          default: null,
          parseHTML: (element) => {
            try {
              return normalizePictureShadow(
                JSON.parse(element.getAttribute("data-picture-shadow") ?? "null"),
              );
            } catch {
              return null;
            }
          },
          renderHTML: (attrs) => {
            const value = normalizePictureShadow(
              (attrs as { pictureShadow?: unknown }).pictureShadow,
            );
            return value ? { "data-picture-shadow": JSON.stringify(value) } : {};
          },
        },
        // Reading row 547: the picture's own shadow -- outer, inner or
        // perspective -- in the shared shadow model (lib/office-shadow-effects),
        // edited in Format Picture > Effects > Shadow and written back on its
        // effect list where `pictureShadowEditable` says the import read it
        // whole (else the file's: pictureShadowBlocker).
        pictureShadowEffect: {
          default: null,
          parseHTML: (element) => {
            try {
              return normalizeOfficeShadowEffect(JSON.parse(element.getAttribute("data-picture-shadow-effect") ?? "null"));
            } catch {
              return null;
            }
          },
          renderHTML: (attrs) => {
            const value = normalizeOfficeShadowEffect((attrs as { pictureShadowEffect?: unknown }).pictureShadowEffect);
            return value ? { "data-picture-shadow-effect": JSON.stringify(value) } : {};
          },
        },
        pictureShadowEditable: {
          default: false,
          parseHTML: (element) => element.getAttribute("data-picture-shadow-editable") === "true",
          renderHTML: (attrs) =>
            (attrs as { pictureShadowEditable?: unknown }).pictureShadowEditable === true
              ? { "data-picture-shadow-editable": "true" }
              : {},
        },
        // A picture's glow / reflection / soft edges (pictureEffects.ts):
        // display facts the DOCX writers state back as Word's own effects.
        pictureGlow: {
          default: null,
          parseHTML: (element) => {
            try {
              return normalizePictureGlow(JSON.parse(element.getAttribute("data-picture-glow") ?? "null"));
            } catch {
              return null;
            }
          },
          renderHTML: (attrs) => {
            const value = normalizePictureGlow((attrs as { pictureGlow?: unknown }).pictureGlow);
            return value ? { "data-picture-glow": JSON.stringify(value) } : {};
          },
        },
        pictureReflection: {
          default: null,
          parseHTML: (element) => {
            try {
              return normalizePictureReflection(JSON.parse(element.getAttribute("data-picture-reflection") ?? "null"));
            } catch {
              return null;
            }
          },
          renderHTML: (attrs) => {
            const value = normalizePictureReflection((attrs as { pictureReflection?: unknown }).pictureReflection);
            return value ? { "data-picture-reflection": JSON.stringify(value) } : {};
          },
        },
        // A preserve-only picture's colour look (pictureDisplayLook.ts):
        // Set Transparent Color, a duotone, the corrections. Drawn only.
        pictureDisplayLook: {
          default: null,
          parseHTML: (element) => {
            try {
              return normalizePictureDisplayLook(JSON.parse(element.getAttribute("data-picture-display-look") ?? "null"));
            } catch {
              return null;
            }
          },
          renderHTML: (attrs) => {
            const value = normalizePictureDisplayLook((attrs as { pictureDisplayLook?: unknown }).pictureDisplayLook);
            return value ? { "data-picture-display-look": JSON.stringify(value) } : {};
          },
        },
        pictureSoftEdge: {
          default: null,
          parseHTML: (element) => {
            try {
              return normalizePictureSoftEdge(JSON.parse(element.getAttribute("data-picture-soft-edge") ?? "null"));
            } catch {
              return null;
            }
          },
          renderHTML: (attrs) => {
            const value = normalizePictureSoftEdge((attrs as { pictureSoftEdge?: unknown }).pictureSoftEdge);
            return value ? { "data-picture-soft-edge": JSON.stringify(value) } : {};
          },
        },
        // A legacy VML picture's Word 97 borders and picture fill
        // (pictureLegacyLook.ts): display facts the full writer writes back.
        pictureLegacyLook: {
          default: null,
          parseHTML: (element) => {
            try {
              return normalizePictureLegacyLook(
                JSON.parse(element.getAttribute("data-picture-legacy-look") ?? "null"),
              );
            } catch {
              return null;
            }
          },
          renderHTML: (attrs) => {
            const value = normalizePictureLegacyLook(
              (attrs as { pictureLegacyLook?: unknown }).pictureLegacyLook,
            );
            return value ? { "data-picture-legacy-look": JSON.stringify(value) } : {};
          },
        },
        artisticEffectRendered: {
          default: null,
          parseHTML: (element) =>
            element.getAttribute("data-artistic-effect-rendered") === "true" ? true : null,
          renderHTML: (attrs) =>
            (attrs as { artisticEffectRendered?: unknown }).artisticEffectRendered === true
              ? { "data-artistic-effect-rendered": "true" }
              : {},
        },
        pictureRecolor: {
          default: "none",
          parseHTML: (element) => {
            const raw = element.getAttribute("data-picture-recolor");
            return isNativeImageRecolorMode(raw) || isPictureRecolorPreset(raw) ? raw : "none";
          },
          renderHTML: (attrs) => {
            const raw = (attrs as { pictureRecolor?: unknown }).pictureRecolor;
            const value = isNativeImageRecolorMode(raw) || isPictureRecolorPreset(raw) ? raw : "none";
            return value === "none" ? {} : { "data-picture-recolor": value };
          },
        },
        pictureSaturation: {
          default: 100,
          parseHTML: (element) => {
            const raw = element.getAttribute("data-picture-saturation");
            return raw === null ? 100 : normalizeImageSaturation(Number(raw));
          },
          renderHTML: (attrs) => {
            const value = normalizeImageSaturation(
              (attrs as { pictureSaturation?: unknown }).pictureSaturation,
            );
            return value === 100
              ? {}
              : { "data-picture-saturation": String(value) };
          },
        },
        pictureBrightness: {
          default: 100,
          parseHTML: (element) => {
            const raw = element.getAttribute("data-picture-brightness");
            return raw === null ? 100 : normalizeImageAdjust(Number(raw));
          },
          renderHTML: (attrs) => {
            const value = normalizeImageAdjust(
              (attrs as { pictureBrightness?: unknown }).pictureBrightness,
            );
            return value === 100
              ? {}
              : { "data-picture-brightness": String(value) };
          },
        },
        pictureContrast: {
          default: 100,
          parseHTML: (element) => {
            const raw = element.getAttribute("data-picture-contrast");
            return raw === null ? 100 : normalizeImageAdjust(Number(raw));
          },
          renderHTML: (attrs) => {
            const value = normalizeImageAdjust(
              (attrs as { pictureContrast?: unknown }).pictureContrast,
            );
            return value === 100
              ? {}
              : { "data-picture-contrast": String(value) };
          },
        },
        // Insert > Link on a picture (Word: Ctrl+Click follows it). The
        // address or in-document place, and the ScreenTip; DOCX writes them
        // as `wp:docPr/a:hlinkClick` or `w:hyperlink w:anchor` around the
        // run (document_docx_picture_link).
        linkHref: {
          default: null,
          parseHTML: (element) =>
            normalizePictureLinkHref(element.getAttribute("data-link-href")),
          renderHTML: (attrs) => {
            const href = normalizePictureLinkHref(
              (attrs as { linkHref?: unknown }).linkHref,
            );
            return href ? { "data-link-href": href } : {};
          },
        },
        linkTitle: {
          default: null,
          parseHTML: (element) =>
            normalizeLinkTitle(element.getAttribute("data-link-title")),
          renderHTML: (attrs) => {
            const title = normalizeLinkTitle(
              (attrs as { linkTitle?: unknown }).linkTitle,
            );
            return title ? { "data-link-title": title } : {};
          },
        },
        // A script-scheme target the document stated for the picture
        // (`javascript:window.print()` on a picture button Word saved from a
        // web page), carried INERT: never the picture's `linkHref`, never
        // rendered or followed, never parsed from pasted HTML. Only the API's
        // DOCX writers write it back (document_link_policy.py).
        inertLinkHref: {
          default: null,
          parseHTML: () => null,
          renderHTML: () => ({}),
        },
        // A picture Word keeps embedded AND linked to its original location
        // ("Link to File" + "Save with Document"; every web picture of an HTML
        // import): the address, carried exactly and never fetched, so the DOCX
        // writer states it as the blip's `r:link` again (document_docx_picture_link).
        pictureSourceLink: {
          default: null,
          parseHTML: (element) =>
            normalizePictureSourceLink(element.getAttribute("data-picture-source-link")),
          renderHTML: (attrs) => {
            const link = normalizePictureSourceLink(
              (attrs as { pictureSourceLink?: unknown }).pictureSourceLink,
            );
            return link ? { "data-picture-source-link": link } : {};
          },
        },
        // An imported picture's complete `wp:anchor` reading (the receipt a
        // floating text box and a shape carry too): origins, wrap, distances,
        // z-order. Package-owned, like a shape's; the page layout pass places
        // the picture with it. A picture floated in the editor has none and is
        // placed by the anchor the DOCX writer would give it (pictureFloat).
        floatAnchor: {
          default: null,
          parseHTML: (element) => {
            const raw = element.getAttribute("data-float-anchor");
            if (!raw) return null;
            try {
              return normalizeFloatAnchor(JSON.parse(raw));
            } catch {
              return null;
            }
          },
          renderHTML: (attrs) => {
            const anchor = normalizeFloatAnchor(
              (attrs as { floatAnchor?: unknown }).floatAnchor,
            );
            return anchor ? { "data-float-anchor": JSON.stringify(anchor) } : {};
          },
        },
        // The picture's place in the document's one floating stack
        // (`wp:anchor/@relativeHeight`, as a shape's `relativeHeight`), given
        // when the picture is floated in the editor so a shape drawn later
        // lands above it and the z-order commands can move it. An imported
        // picture keeps the reading in its `floatAnchor` instead; in line it
        // has no place and the value is null.
        relativeHeight: {
          default: null,
          parseHTML: (element) => {
            const raw = element.getAttribute("data-relative-height");
            return raw === null ? null : documentShapeRelativeHeight(Number(raw));
          },
          renderHTML: (attrs) => {
            const value = documentShapeRelativeHeight(
              (attrs as { relativeHeight?: unknown }).relativeHeight,
            );
            return value === null ? {} : { "data-relative-height": String(value) };
          },
        },
        // The embedded OLE object (Word Insert > Object: a worksheet, a deck,
        // a PDF) this picture is the preview of, as the import carries it:
        // `{progId, drawAspect, originalWidthTwips, originalHeightTwips,
        // data, fieldCodes}` with the embedding as a `data:` URI (in ordered
        // slices when one string cannot hold it). Model-only
        // custody, like `source`: the page keeps it untouched so a Word export
        // without the original file writes the object back, and the server
        // validates it (document_docx_ole_object). Never parsed from HTML.
        oleObject: {
          default: null,
          parseHTML: () => null,
          renderHTML: () => ({}),
        },
        // The inert, sealed field this picture is the whole cached result of
        // (Word's one-paragraph INCLUDEPICTURE "url"), as the import carries
        // it. Model-only custody like `oleObject`: a Word export puts the
        // picture back inside it where the source holds that field.
        fieldWrap: {
          default: null,
          parseHTML: () => null,
          renderHTML: () => ({}),
        },
      };
    },

    // Editor-only drag-resize handles (Word 拖角缩放). The raw-PM NodeView wraps
    // the image in a positioned span carrying the merged float/align/width
    // styles, with eight resize handles shown while the node is selected (corner
    // = aspect-locked, edge = single axis, shift = free). A committed drag writes
    // px width/height + their EMU twins and clears the percent preset — the same
    // numeric attrs the AI-resize path and the DOCX exporter already own, so
    // there is no second source of truth and renderHTML/export stay byte-stable
    // until a real drag commits. See ImageResizeNodeView.ts.
    addNodeView() {
      return (props) => createImageResizeNodeView(props, labels);
    },
  });
  // The editor's own copy of a picture is a `data:` image (its HTML has no
  // other address), so the paste must accept it or an ordinary copy/paste
  
  if (placement === "block")
    return picture.configure({ inline: false, allowBase64: true });
  // Word "In Line with Text" (`w:r/w:drawing/wp:inline`): the SAME picture
  // (identical attribute set, parse/render rules and resize NodeView) as an
  // inline atom that sits on the text baseline between characters. Only the
  // node identity differs; the placement extension converts between the two
  // and every Picture command resolves either through `isPictureNode`.
  return picture
    .extend({
      name: INLINE_PICTURE_NODE_NAME,
      atom: true,
      selectable: true,
      draggable: true,
      parseHTML() {
        // Outranks the block rule (`img[src]`, priority 50) only for markup
        // this node wrote itself; every other `<img>` keeps its block import.
        return [{ tag: "img[data-inline-picture]", priority: 60 }];
      },
      renderHTML({ HTMLAttributes }) {
        return [
          "img",
          mergeAttributes(HTMLAttributes, { "data-inline-picture": "true" }),
        ];
      },
      // `setImage` and the `![alt](src)` input rule belong to the block node;
      // registering them twice would let the later extension shadow them.
      addCommands() {
        return {};
      },
      addInputRules() {
        return [];
      },
    })
    .configure({ inline: true });
}

/**
 * Word has no "# " shortcut for a heading, so a document imported from Word keeps
 * what was typed: there the Markdown rule turned a "#" in a table's first cell into
 * a heading, took the run's font and size with it, and cost the save that cell
 * (corpus R328-D03). A document made here keeps the rule. The heading stays where
 * the kit puts it, so the schema's node order does not move.
 */
export const DocumentStarterKit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) => {
      if (extension.name === "heading") {
        return extension.extend({
          addInputRules() {
            return (this.parent?.() ?? []).map(
              (rule) =>
                new InputRule({
                  find: rule.find,
                  handler: (props) =>
                    props.state.doc.attrs.wordCompatibilityMode == null ? rule.handler(props) : null,
                }),
            );
          },
        });
      }
      // TipTap 3.30 gave ListKeymap a Tab that moves the block at the caret
      // into the last item of a list just before it. Word has no such key:
      // Tab outside a list indents or types a tab (DocumentFormatting,
      // DocumentListLevelKeys), and where those decline (a code block after
      // a list) the block stayed where it was. The keymap keeps its
      // Backspace / Delete handling.
      if (extension.name === "listKeymap") {
        return extension.extend({
          addKeyboardShortcuts() {
            const shortcuts = { ...(this.parent?.() ?? {}) };
            delete shortcuts.Tab;
            return shortcuts;
          },
        });
      }
      return extension;
    });
  },
});

// Additive cell-level formatting attributes (shading / borders / text +
// vertical alignment / direction) shared by TableCell and TableHeader. Each attribute parses
// independently from a sanitized DOM (whitelist keywords, color through the
// strict shared normalizer). To avoid TipTap's style-merge dropping one inline
// declaration when several attributes each emit their own `style`, ONLY the
// `backgroundColor` attribute owns the single combined renderHTML
// (mergeCellStyleAttributes folds every axis into one `style` + its data-*
// attributes); the remaining attributes parse only and render nothing alone.
function cellStyleAttributes() {
  return {
    // Exact Word `tblGrid/gridCol` widths for the columns covered by this cell.
    // ProseMirror still owns the live editable `colwidth` px projection; this
    // companion survives DOM serialization so export can reuse the native
    // twips only while they still match that live geometry.
    colwidthTwips: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        readTableColumnWidthsTwipsFromElement(element),
      renderHTML: (attrs: Record<string, unknown>) =>
        tableColumnWidthsTwipsAttributes(attrs.colwidthTwips),
    },
    backgroundColor: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        readCellBackgroundColorFromElement(element),
      renderHTML: (attrs: Record<string, unknown>) =>
        mergeCellStyleAttributes({
          backgroundColor: attrs.backgroundColor,
          borderStyle: attrs.borderStyle,
          cellBorders: attrs.cellBorders,
          textAlign: attrs.textAlign,
          verticalAlign: attrs.verticalAlign,
          textDirection: attrs.textDirection,
          cellMargin: attrs.cellMargin,
          cellShading: attrs.cellShading,
        }),
    },
    // Word's Borders and Shading > Shading pattern (`w:shd w:val/w:color`)
    // laid over the cell's fill. Parse-only; the merged style above draws it.
    cellShading: {
      default: null,
      parseHTML: (element: HTMLElement) => {
        const raw = element.getAttribute("data-cell-shading");
        if (!raw) return null;
        try {
          return normalizeCellShadingPattern(JSON.parse(raw));
        } catch {
          return null;
        }
      },
      renderHTML: () => ({}),
    },
    borderStyle: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        normalizeCellBorderStyle(element.getAttribute("data-cell-border")),
      renderHTML: () => ({}),
    },
    // Native Word table-cell borders. The complete per-edge source object is
    // additive and lives in one data attribute; backgroundColor's merged
    // renderer emits its safe CSS projection without competing style attrs.
    cellBorders: {
      default: null,
      parseHTML: (element: HTMLElement) => readCellBordersFromElement(element),
      renderHTML: () => ({}),
    },
    textAlign: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        normalizeCellTextAlign(element.getAttribute("data-cell-align")) ||
        normalizeCellTextAlign(element.style?.textAlign),
      renderHTML: () => ({}),
    },
    verticalAlign: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        readCellVerticalAlignFromElement(element),
      renderHTML: () => ({}),
    },
    // Native Word cell text flow (`w:tcPr/w:textDirection`). Parse-only here;
    // backgroundColor's merged renderer owns the single style/data payload.
    textDirection: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        readCellTextDirectionFromElement(element),
      renderHTML: () => ({}),
    },
    // Optional internal cell margin / padding (Word/WPS 单元格边距 / `<w:tcMar>`).
    // ADDITIVE: a cell without it carries no margin data attribute and
    // renders exactly as today. Parse-only — the merged style above (owned by
    // `backgroundColor`) renders the single combined `style` so the inline
    // `padding` never collides with the other cell-style declarations. Parse and
    // merged render both sanitize the native per-edge object; legacy uniform
    // numeric attrs remain accepted for existing documents.
    cellMargin: {
      default: null,
      parseHTML: (element: HTMLElement) => readCellMarginsFromElement(element),
      renderHTML: () => ({}),
    },
    // Optional Word-style cell formula (e.g. "=SUM(ABOVE)"). ADDITIVE: a cell
    // without it carries no `data-cell-formula` attribute and renders exactly as
    // today. The formula is the source of truth; the cell's text content holds
    // the COMPUTED value (kept in sync by the recompute plugin). It owns its own
    // renderHTML because it emits a data-* attribute (not an inline `style`
    // declaration), so it never collides with the merged style above. Both parse
    // and render route through the strict normalizer so a forged/pasted value is
    // rejected before it can smuggle markup.
    formula: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        normalizeCellFormula(element.getAttribute("data-cell-formula")),
      renderHTML: (attrs: Record<string, unknown>) =>
        cellFormulaAttributes(attrs.formula),
    },
    formulaNumberFormat: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        normalizeCellFormulaNumberFormat(
          element.getAttribute("data-cell-formula-number-format"),
        ),
      renderHTML: (attrs: Record<string, unknown>) =>
        cellFormulaNumberFormatAttributes(attrs.formulaNumberFormat),
    },
    // A cell the DOCX page builder INVENTED, not one the file holds. Word
    // tables are legal with rows that do not fill the shared table grid:
    // `w:trPr/w:gridBefore` (ISO/IEC 29500-1 17.4.14) skips grid columns
    // before a row's first cell and `w:gridAfter` (17.4.15) leaves them after
    // its last one, with only a preferred width and NO `w:tc` at all. The page
    // model is a dense rectangle, so the server pads such a row; this marks
    // each padded slot, and the saver declines text typed there by name
    // because there is no `w:tc` to write it into. Nothing to do with
    // `nativeGridPadding` above, which is CSS padding ownership.
    // ADDITIVE: a cell without it carries no `data-grid-filler` attribute and
    // renders exactly as today. Strict boolean on parse AND render, so a
    // forged/pasted value can only ever be true or absent.
    gridFiller: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        element.getAttribute("data-grid-filler") === "true" ? true : null,
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.gridFiller === true ? { "data-grid-filler": "true" } : {},
    },
  };
}








function setSelectedCellsAttribute(
  state: EditorState,
  tr: Transaction,
  name: string,
  value: unknown,
): boolean {
  if (!isInTable(state)) return false;
  let changed = false;
  const write = (node: ProseMirrorNode, pos: number) => {
    if (node.attrs[name] === value) return;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, [name]: value });
    changed = true;
  };
  if (state.selection instanceof CellSelection) {
    state.selection.forEachCell(write);
  } else {
    const $cell = selectionCell(state);
    if ($cell.nodeAfter) write($cell.nodeAfter, $cell.pos);
  }
  return changed;
}






function alignSelectedCellParagraphs(
  state: EditorState,
  tr: Transaction,
  align: string,
): boolean {
  if (!isInTable(state)) return false;
  const cells: Array<{ node: ProseMirrorNode; pos: number }> = [];
  if (state.selection instanceof CellSelection) {
    state.selection.forEachCell((node, pos) => cells.push({ node, pos }));
  } else {
    const $cell = selectionCell(state);
    if ($cell.nodeAfter) cells.push({ node: $cell.nodeAfter, pos: $cell.pos });
  }
  let changed = false;
  for (const cell of cells) {
    cell.node.descendants((node, offset) => {
      if (node.type.name === "table") return false;
      if (!node.isTextblock) return true;
      if (!(node.type.spec.attrs && "textAlign" in node.type.spec.attrs)) return false;
      if (node.attrs.textAlign === align) return false;
      tr.setNodeMarkup(cell.pos + 1 + offset, undefined, {
        ...node.attrs,
        textAlign: align,
      });
      changed = true;
      return false;
    });
  }
  return changed;
}

function createDocumentTableCellExtension(): AnyExtension {
  return TableCell.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        ...cellStyleAttributes(),
      };
    },
    addNodeView() {
      return (props) => createStableDocumentTableCellView(props);
    },
    addCommands() {
      return {
        ...(this.parent?.() ?? {}),
        setSelectedCellsAttribute:
          (name: string, value: unknown) =>
          ({ state, tr }: { state: EditorState; tr: Transaction }) =>
            setSelectedCellsAttribute(state, tr, name, value),
        alignSelectedCellParagraphs:
          (align: string) =>
          ({ state, tr }: { state: EditorState; tr: Transaction }) =>
            alignSelectedCellParagraphs(state, tr, align),
      } as Record<string, (...args: never[]) => unknown>;
    },
  });
}

// TableRow carrying an optional `rowHeight` (px) attribute (Word/WPS row height /
// "Distribute Rows Evenly"). ADDITIVE: a row without it carries no
// `data-row-height` attribute and renders byte-for-byte as today. Optional
// native twips + exact/atLeast rule are independently bounded and share the
// same merged renderer, so pasted data cannot inject a style payload.
// Also carries the Word row pagination flags (both ADDITIVE, default false,
// nothing rendered when unset):
//   - `headerRow` (Word `w:tblHeader` 标题行重复): the paged engine keeps the
//     leading header band whole and print repeats it on continuation pages;
//   - `cantSplit` (Word `w:cantSplit` 禁止跨页断行): the paged engine never
//     splits THIS row when it can fit a fresh page. It is not keep-with-next;
//     an unavoidable over-page row still receives a structured continuation.
// Values are strict booleans on parse AND render, so a forged data attribute
// can only ever yield true/false.
function createDocumentTableRowExtension(): AnyExtension {
  return TableRow.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        rowHeight: {
          default: null,
          parseHTML: (element: HTMLElement) =>
            normalizeTableRowHeight(element.getAttribute("data-row-height")) ??
            normalizeTableRowHeight(element.style?.minHeight) ??
            normalizeTableRowHeight(element.style?.height),
          renderHTML: (attrs: Record<string, unknown>) =>
            // The piece a split row ends with keeps the row's "At least"
            // height: Word 16.86 draws the continuation at least that tall
            // again (rows probes P1/P2: a 500pt floor over 806pt of lines
            // ends 500pt down the next page; a 750pt one fills it).
            tableRowHeightAttributes(
              attrs.rowHeight,
              attrs.rowHeightRule,
              attrs.rowHeightTwips,
              attrs[TABLE_ROW_CONTINUES_ATTR] === true,
            ),
        },
        // Exact native measurement retained alongside the rounded browser px
        // projection. Commands that materially resize rows clear this value.
        rowHeightTwips: {
          default: null,
          parseHTML: (element: HTMLElement) =>
            normalizeTableRowHeightTwips(
              element.getAttribute("data-row-height-twips"),
            ),
          renderHTML: () => ({}),
        },
        // Word `w:trHeight/@w:hRule`. Parse-only here: rowHeight's merged
        // renderer owns the single style/data payload so the two attrs cannot
        // produce competing `style` strings.
        rowHeightRule: {
          default: null,
          parseHTML: (element: HTMLElement) =>
            normalizeTableRowHeightRule(
              element.getAttribute("data-row-height-rule"),
            ),
          renderHTML: () => ({}),
        },
        headerRow: {
          default: false,
          parseHTML: (element: HTMLElement) =>
            element.getAttribute("data-header-row") === "true",
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.headerRow === true ? { "data-header-row": "true" } : {},
        },
        cantSplit: {
          default: false,
          parseHTML: (element: HTMLElement) =>
            element.getAttribute("data-cant-split") === "true",
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.cantSplit === true ? { "data-cant-split": "true" } : {},
        },
        // Word `w:pageBreakBefore` on the row's first cell's first paragraph
        // (a row past the first; the first row's is the page break before
        // the table): Word starts the row on a new page, and the paged
        // engine ends the page above it (ledger `forcedHead`). Read from the
        // source only; the DOCX writers put it back on that paragraph.
        pageBreakBefore: {
          default: false,
          parseHTML: (element: HTMLElement) =>
            element.getAttribute("data-page-break-before") === "true",
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.pageBreakBefore === true ? { "data-page-break-before": "true" } : {},
        },
      };
    },
  });
}

function createDocumentTableHeaderExtension(): AnyExtension {
  return TableHeader.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        ...cellStyleAttributes(),
      };
    },
    addNodeView() {
      return (props) => createStableDocumentTableCellView(props);
    },
  });
}

const DocumentTableDesignAuthorityCommands = Extension.create({
  name: "documentTableDesignAuthorityCommands",
  addCommands() {
    return {
      setDocumentTableDesignAuthority:
        (target: DocumentTableDesignTarget, state: DocumentTableDesignState) =>
        ({ editor }) =>
          setDocumentTableDesignState(editor, target, state),
    };
  },
});

export function createNativeDocumentPluginRegistry({
  lowlight,
  pageId,
  placeholder,
  translate,
  notebookId,
  getNotebookId,
  disableHistory = false,
  guestMode = false,
  getAutoCorrectEnabled,
  printSurface = false,
}: NativeDocumentPluginRegistryOptions): NativeDocumentPluginRegistry {
  const resolveNotebookId = (): string | null =>
    getNotebookId ? getNotebookId() : (notebookId ?? null);
  const equationCopy = equationRibbonCopy(translate);
  // One label set for both picture placements (block `image`, `inlineImage`).
  const imageRuntimeLabels: ImageRuntimeStatusLabels = {
    loading: translate("editor.imageLoading"),
    failed: translate("editor.imageLoadFailed"),
    resize: {
      nw: translate("editor.imageResize.nw"),
      n: translate("editor.imageResize.n"),
      ne: translate("editor.imageResize.ne"),
      e: translate("editor.imageResize.e"),
      se: translate("editor.imageResize.se"),
      s: translate("editor.imageResize.s"),
      sw: translate("editor.imageResize.sw"),
      w: translate("editor.imageResize.w"),
    },
    crop: {
      nw: translate("editor.imageCrop.nw"),
      n: translate("editor.imageCrop.n"),
      ne: translate("editor.imageCrop.ne"),
      e: translate("editor.imageCrop.e"),
      se: translate("editor.imageCrop.se"),
      s: translate("editor.imageCrop.s"),
      sw: translate("editor.imageCrop.sw"),
      w: translate("editor.imageCrop.w"),
    },
    rotate: translate("presentation.rotateHandle"),
    followLink: followLinkHint(translate("editor.imageLinkHint"), isMacPlatform()),
    drawing: translate("editor.imageDrawing"),
  };
  const documentShapeLabels = {
    shape: translate("document.shape.label"),
    textBox: translate("document.shape.textBoxLabel"),
    rotate: translate("document.shape.rotate"),
    resize: {
      n: translate("presentation.resizeHandle.n"),
      s: translate("presentation.resizeHandle.s"),
      e: translate("presentation.resizeHandle.e"),
      w: translate("presentation.resizeHandle.w"),
      nw: translate("document.shape.resize.nw"),
      ne: translate("document.shape.resize.ne"),
      se: translate("document.shape.resize.se"),
      sw: translate("document.shape.resize.sw"),
    },
    text: translate("document.shape.textLabel"),
    connectorLabel: translate("document.shape.connectorLabel"),
    picture: translate("document.shape.picture"),
    moveConnectedShape: translate("document.shape.moveConnectedShape"),
    moveNamedShape: (name: string) =>
      translate("document.shape.moveNamedShape", { name }),
    smartArtPlaceholderTextOnly: translate(
      "document.capability.smartArtPlaceholderTextOnly",
    ),
    smartArtTextNotEditable: translate(
      "document.capability.editableSmartArtUnavailable",
    ),
    smartArtNeedsConnection: translate("engineHost.needsConnection"),
    smartArtLayoutFailed: translate("engineHost.failed"),
    smartArtTextPrompt: translate("office.smartArtTextPane.placeholder"),
    editPoints: officeEditPointsLabels(translate),
    adjustShape: translate("document.shape.adjustShape"),
  };
  const equationEditorLabels = {
    label: translate("equation.editor.label"),
    inputFormat: equationCopy.inputFormat,
    unicodeMode: equationCopy.unicode,
    latexMode: translate("equation.editor.latexMode"),
    textMode: equationCopy.text,
    layout: equationCopy.layout,
    professionalMode: equationCopy.professional,
    linearMode: equationCopy.linear,
    structures: translate("equation.editor.structures"),
    symbols: translate("equation.editor.symbols"),
    done: translate("equation.editor.done"),
    cancel: translate("equation.editor.cancel"),
    loading: translate("equation.editor.loading"),
    loadFailed: translate("equation.editor.loadFailed"),
    hint: translate("equation.editor.hint"),
    sourceLabel: translate("equation.editor.sourceLabel"),
    conversionUnavailable: equationCopy.unsupportedUnicode,
    latexInvalid: equationCopy.invalidLatex,
    textUnavailable: equationCopy.unsupportedText,
    equationOptions: equationCopy.equationOptions,
    changeToInline: equationCopy.changeToInline,
    changeToDisplay: equationCopy.changeToDisplay,
    templateLabels: Object.fromEntries([
      ...EQUATION_STRUCTURES.map(
        (entry) => [entry.id, equationCopy.structureLabels[entry.id]] as const,
      ),
      ...EQUATION_STRUCTURE_MEMBERS.map((member) => {
        const familyMembers = equationStructureMembersForFamily(
          member.familyId,
        );
        const fallback = `${equationCopy.structureLabels[member.familyId]} ${
          familyMembers.indexOf(member) + 1
        }`;
        return [
          member.id,
          equationCopy.structureMemberLabels[member.id] ?? fallback,
        ] as const;
      }),
    ]),
    symbolLabels: Object.fromEntries(
      MATH_SYMBOLS.map((entry) => [entry.id, translate(entry.labelKey)]),
    ),
    inputAxisHint: translate("equation.ribbon.inputAxisHint"),
    layoutAxisHint: translate("equation.ribbon.layoutAxisHint"),
    symbolGroupLabels: Object.fromEntries(
      EQUATION_SYMBOL_GROUPS.map((group) => [
        group.id,
        translate(`equation.ribbon.symbolGroup.${group.id}`),
      ]),
    ),
  };
  const plugins: NativeDocumentPlugin[] = [
    {
      id: "block-ids",
      extensions: [
        // Every node and mark drawn with its HTML attributes built in one
        // pass (TipTap folded them with a copy per attribute).
        FastRenderedAttributes,
        // The React surface mounting does not build the document a second
        // time (only the React node views drawn before it are rebuilt).
        StableNodeViews,
        // Where the engine has no scroll anchoring (WebKit), the view is kept
        // still after layout instead of by a layout per transaction.
        DocumentScrollAnchor,
        MrnoteBlockIdExtension,
        SourceHardBreakTail,
        WordHorizontalRule,
        HeadingAnchorIdExtension,
        // Word-style gray highlight over the selected range while a toolbar
        // control (font select, size input, menus) holds focus.
        InactiveSelectionHighlight,
      ],
    },
    {
      id: "core-editing",
      extensions: [
        // Final write-authority boundary beneath every command and plugin.
        // Read-only documents accept only explicit synchronization,
        // hydration/restoration, or layout-normalization origins.
        ReadOnlyTransactionAuthority,
        // Safari/macOS CJK IME owns a temporary DOM island until
        // compositionend. Install the guard before keymaps and asynchronous
        // pagination so candidate keys and pre-edit text cannot be interpreted
        // as normal editor commands/content.
        ImeCompositionGuard,
        // A typing run is one Undo step on a long page too: an edit is
        // dated by its input event, not by when its dispatch got to it.
        TypingRunTime,
        // The browser's own Undo (Edit menu, Cmd+Z with focus in the ribbon)
        // is one editor undo, never WebKit's per-character burst.
        NativeHistoryInput,
        DocumentBoundaryInteraction,
        // A newline the browser would insert itself is the editor's Enter,
        // never a manual line break the person did not ask for.
        NativeParagraphInput,
        NativeSelectionVisibility,
        WordEditorShortcuts,
        // A drag from the paper between blocks (above a table or a picture)
        // selects text instead of dragging a caret.
        DocumentGapDragSelection,
        DocumentLineBoundaryKeys,
        DocumentOpenCaret,
        DocumentPointerFocusCaret,
        // Select All is never scrolled to (Word keeps the view), and deleting
        // it leaves the caret at the start of the empty document.
        DocumentWholeSelection,
        ScrollportToolbarMargin,
        DocumentHardBreakRunFormat,
        // A tracked insertion on an inline atom, carried through the room (WUA 045/228).
        AtomTrackedInsertionCarrier,
        // A field's, cross-reference's or phonetic guide's own formatting
        // rides on its `runStyle` attribute, which the room and Word keep.
        DocumentInlineAtomRunStyle,
        // The caret after a field or cross-reference is drawn.
        DocumentInlineAtomCaret,
        // Keep Source Formatting pastes a paragraph's formatting with its mark.
        PasteParagraphFormat,
        // Two paragraphs joined: the second's words take the first's style look.
        JoinedParagraphStyleRuns,
        // A floating object goes where its anchor paragraph goes (Word's anchor):
        // a whole paragraph deleted or cut takes it, a join or a part keeps it.
        FloatAnchorsFollowParagraphs,
        // Two paragraphs joined: the field end (and next begin) at the second's end stay on the merged one.
        JoinedParagraphFieldSpans,
        // A paste ends at what it put in, never on an object after it.
        PasteSelectionEnd,
        // A pasted document's headings and tables stay out of the list
        // paragraph it lands in, as Word's paste keeps them.
        PasteIntoList,
        PlainTextBlankLines,
        // Reading the editor's own DOM back keeps a soft line break stored as
        // "\n" text as text (see the extension).
        DocumentDomReadParser,
        InkSheetLayer,
        // Strokes at rest drawn in their sheets' layers from the note's data.
        InkLightLayer,
        // The save's layout-key text of each block, read while the editor is idle.
        SaveTextWarmup,
        DocumentDisplayFonts,
        // Bold in a face Office ships with no bold (SimSun, KaiTi, ...) is as
        // wide as Word emboldens it.
        DocumentSyntheticBoldWordAdvance,
        DocumentAutoLineSpacing.configure({ waitForSourceFontPlan: !guestMode }),
        // An exact line's text stands where Word puts it: 0.8 of the line down.
        DocumentExactLineBaseline,
        // A justified line a manual break ends is stretched, as in Word.
        JustifiedLineBreaks,
        // Spaces Word balances to half an East Asian cell
        // (w:balanceSingleByteDoubleByteWidth), as in Word.
        BalancedSpaces,
        // A distributed Latin last line is spread letter by letter, as in Word.
        DistributedLastLines,
        // A stop or comma hangs past the right edge where the paragraph
        // allows it (Chromium has no hanging-punctuation), as in Word.
        OverflowPunctuationHang,
        // A justified line keeps its next word by narrowing its spaces, up to
        // Word's measured limit, in a Word 2013+ document.
        JustifiedSpaceShrink,
        // With the text engine on (flag `docs`), lines break where the
        // engine fills them from the served font files, as Word does.
        DocumentEngineLineBreaks,
        // The empty paragraph a text-anchored floating table hangs from takes
        // no room below the table, as in Word.
        FloatingTableAnchor,
        CellPictureHost,
        // A section without a line grid of its own sets its lines unsnapped
        // while a later section's grid is the document's, as in Word.
        SectionLineGrid,
        DocumentStarterKit.configure({
          // Replaced by DocumentPageSetup, which carries the page-size/margins
          // attributes on the top-level doc node.
          document: false,
          bold: false,
          // Replaced by DocumentItalic: Word's on / explicit off / inherit.
          italic: false,
          codeBlock: false,
          horizontalRule: false,
          link: false,
          // Replaced by DocumentOrderedList, which adds the multilevel
          // `listStyleType` attr (1 / 1.1 / 1.1.1 + 1./a./i. schemes).
          orderedList: false,
          // Replaced by DocumentBulletList, which adds the Word/WPS bullet GLYPH
          // style attr (disc / circle / square / triangle / dash). A plain disc
          // list carries no attribute and renders byte-for-byte the native bullet.
          bulletList: false,
          // Replaced by DocumentUnderline, which extends the stock single-boolean
          // underline with whitelisted line styles (double/dotted/wavy) + an
          // underline color, round-tripping through Word `<w:u w:val w:color>`. A
          // plain underline run renders byte-for-byte the stock `<u>`.
          underline: false,
          // Replaced by TextStyling's single/double strike pair so `<w:strike>`
          // and `<w:dstrike>` remain distinct and mutually exclusive.
          strike: false,
          // The doc's content expression is `pageBlock+` (editor-core
          
          // schema-illegal (replace fitting would wrap it into a phantom
          // empty PAGE after the last sheet). The click-below-the-last-
          // sheet affordance it used to provide lives in PageBlock's
          // selection-only boundary adapter instead. Actual typing/Enter
          // materializes a paragraph inside the page, never on deselection.
          trailingNode: false,
          // Collab-gated: TipTap's Collaboration extension owns undo/redo via the
          // Yjs undo manager, so the built-in history MUST be dropped when collab
          // is on (they conflict). Off by default → history intact, unchanged.
          ...(disableHistory ? { undoRedo: false } : {}),
        }),
        DocumentPageSetup.configure({ waitForSourceFontPlan: !guestMode }),
        SectionChainHistoryRepair,
        DocumentTableDesignAuthorityCommands,
        // Structural pages: the doc is `pageBlock+`, so every document is
        // sheeted — hydration wraps flat storage (wrapBlocksIntoPages) and
        // serialization boundaries flatten back.
        PageBlock,
        // The first and last block of each sheet, for the page-edge spacing
        // rules (a positional selector restyled every sibling per insert).
        PageEdgeMarks,
        // Reports a change that takes many strokes of ink out, or one that
        
        InkLossWatch.configure({ getPageId: () => (guestMode ? undefined : pageId) }),
        // Word selects text, not pages: a range command over a selection
        // that crosses sheets runs on the joined text and the sheets are
        // re-cut after it (one undo step); copies carry no page wrapper.
        CrossSheetEditing,
        // Runtime-only list/blockquote continuation attrs. Long semantic
        // containers flow across physical sheets and are rejoined before every
        // save/export/AI boundary.
        ContainerPageSplitAttrs,
        // Schema bridge only: lets the table paginator materialise temporary
        // row/table continuation metadata across physical pageBlocks. Every
        // persistence/export boundary removes it via
        // mergeTableContinuationsJson, so semantic storage remains one table.
        TablePaginationRuntimeAttrs,
        TableFragmentNavigation,
        // Schema bridge and integrity rules for generated lists (a table of
        // contents, a table of figures) the ledger cuts between two rows:
        // each page's copy draws its own rows, and the copies stay one
        // object for every command. mergeSplitContinuationsJson stores one.
        AtomRowSlices,
        // The endnote area's slices stay one chain of one list: a remote read
        // placed back in the page or an edit to a note's words that leaves them
        // out of line folds them into one list for the ledger to cut again.
        NoteSliceIntegrity,
        // A table of contents or of figures a command just generated reads
        // its page numbers again once the ledger has laid it out, as Word
        // shows them right at once.
        GeneratedListPageNumbers,
        // A picture put into the document is stored fitted to the text area
        // once its image has loaded, as Word's Insert Picture stores it.
        NewPictureFit,
        // Multi-column selectors must be PM decorations: direct writes onto a
        // pageBlock article are reverted by ProseMirror during any unrelated
        // decoration redraw. Exact unequal-track placement then remains stable
        // while PageRebalance refreshes only the measured stylesheet rules.
        ColumnFlowDecorations,
        // The page ledger: deterministic single-pass pagination over
        // page-independent atom costs (paged/ledger).
        PageLedger.configure({ waitForSourceFontPlan: !guestMode, eagerBackground: printSurface }),
        // Span decorations: sheets stretched by one page-tall block advance the
        // page counter by their real printed-page count (data-page-span).
        PageSpanExtension,
        // Ordered list with the Word/WPS multilevel numbering style attr; the
        // matching StarterKit orderedList is disabled above.
        DocumentOrderedList,
        // Word's AutoFormat As You Type on Enter: "1.text" becomes item 1 of
        // a numbered list, as its own Undo step.
        DocumentListAutoFormat,
        // Bullet list with the Word/WPS bullet glyph style attr; the matching
        // StarterKit bulletList is disabled above. ADDITIVE: a disc list carries
        // no attribute and renders byte-for-byte the native bullet.
        DocumentBulletList,
        // Tab / Increase List Level: a demoted item stays in its numbering
        // (Word's w:ilvl on the same w:numId) instead of opening a plain list.
        DocumentListLevels,
        // Word's Tab in a list: level at the item's start, a tab character in
        // its text, and never the browser's focus move.
        DocumentListLevelKeys,
        // Multilevel heading auto-numbering (Word/WPS "1 / 1.1 / 1.1.1"). ADDITIVE
        // + opt-in: adds ONE boolean `headingNumbering` doc attr (rides the open
        // doc-attrs passthrough) + a decoration plugin that paints the live number
        // before each heading WHEN on. OFF (default) → empty decoration set, so a
        // document without it renders and exports byte-for-byte unchanged.
        HeadingNumbering,
        // Word list definitions (nine-level number formats), bullets/numbering
        // on headings and "Continue from previous list": heading list attrs +
        // a marker decoration walk that is empty for documents without them.
        ListDefinitionMarkers,
        // Stock link mark, extended with an optional `title` attribute — the
        // Word/WPS "ScreenTip" (Insert-Hyperlink → ScreenTip…). ADDITIVE: the
        // attr defaults to null, so a link without a ScreenTip renders the exact
        // same `<a>` as before and carries no `title`. When set, it renders the
        // HTML `title=` attribute (the native hover tooltip) and round-trips to
        // DOCX as `<w:hyperlink w:tooltip>`. The value is funneled through
        // normalizeLinkTitle on parse so a forged document cannot store an
        // unbounded string. The mark rides the document schema's open `marks`
        // passthrough, so no schema bump is needed.
        Link.extend({
          // The stock autolink linked any address-shaped text in every change
          // the view took, the document's own arrival included: opening an
          // imported report turned its title 「KAIBER.AI 网站调研报告」 into a
          // link to http://KAIBER.AI, the page then differed from its file,
          
          // As in Word, only what the person types is linked: a change that
          // arrives (the room, the pages filling in) or that the editor makes
          // for itself outside Undo is left as it is.
          // As in Word, words typed at a link's end are not the link's; only a
          // HYPERLINK field whose result runs past its paragraph's mark takes
          // what is typed at that paragraph's end (linkRunsPastMark.ts).
          inclusive() {
            return linkMarkInclusive();
          },
          addProseMirrorPlugins() {
            return [...(this.parent?.() ?? []).map((plugin) => {
              const append = plugin.spec.appendTransaction;
              if (!append || !String((plugin.spec.key as { key?: string } | undefined)?.key ?? "").startsWith("autolink")) {
                return plugin;
              }
              return new Plugin({
                ...plugin.spec,
                appendTransaction: (transactions, oldState, newState) =>
                  transactions.some(
                    (transaction) =>
                      transaction.getMeta("addToHistory") === false ||
                      (transaction.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin === true,
                  )
                    ? null
                    : append.call(plugin, transactions, oldState, newState),
              });
            }), linkRunsPastMarkPlugin(this.name)];
          },
          // The stock exit (`exitable`) TYPED a space after a link that ends
          // its paragraph so Right could step out of it: one arrow press
          // changed the document and saved it (WUA 156). Right there now only
          // leaves the link for what is typed next and moves the caret as
          // Word's does, writing nothing.
          exitable: false,
          addKeyboardShortcuts() {
            return {
              ...this.parent?.(),
              ArrowRight: () => {
                const { state, view } = this.editor;
                const { selection } = state;
                const $from = selection.$from;
                if (!selection.empty || $from.pos !== $from.end()) return false;
                const link = (state.storedMarks ?? $from.marks()).find(
                  (mark) => mark.type.name === this.name,
                );
                if (link) view.dispatch(state.tr.removeStoredMark(link));
                return false;
              },
            };
          },
          addAttributes() {
            return {
              ...this.parent?.(),
              // A script-scheme target the document stated (`javascript:` in a
              // Word file saved from a web page), carried INERT: it is never
              // the mark's `href`, never rendered (no anchor attribute, so
              // nothing can navigate to it), never parsed from pasted HTML.
              // Only the API's DOCX writers write it back
              // (document_link_policy.py).
              inertHref: {
                default: null as string | null,
                parseHTML: () => null,
                renderHTML: () => ({}),
              },
              // A HYPERLINK field's result that runs past its paragraph's
              // mark (the import's reading 416): typing at the paragraph's
              // end types into the link. Never rendered, never pasted in.
              runsPastMark: {
                default: null as boolean | null,
                parseHTML: () => null,
                renderHTML: () => ({}),
              },
              title: {
                default: null as string | null,
                parseHTML: (element) =>
                  normalizeLinkTitle(element.getAttribute("title")),
                renderHTML: (attributes) => {
                  const title = normalizeLinkTitle(
                    (attributes as { title?: unknown }).title,
                  );
                  return title ? { title } : {};
                },
              },
            };
          },
        }).configure({
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
          // Every way a link reaches the page (setLink, pasted HTML, a typed
          // or pasted address) takes only an address the page's save accepts:
          // one link to `https://` made the whole document unsavable
          // (WUA 024). An absent href stays allowed: an inert link
          // (`inertHref`) renders as an anchor with no href at all.
          isAllowedUri: (url, ctx) =>
            !url || (ctx.defaultValidate(url) && isSavableDocumentUrl(url)),
          // What Word's AutoFormat links as it is typed: an address with its
          // scheme, or one starting www. A bare name with a dot ("KAIBER.AI",
          // "readme.md", "v1.2") is a word, not a link.
          shouldAutoLink: (url) => /^(?:https?:\/\/|mailto:|www\.)/i.test(url),
        }),
        DocumentFormatting,
        // Word draws paragraph borders per group: one box around consecutive
        // bordered paragraphs, `between` rules inside, numbers inside.
        ParagraphBorderGroups,
        // Word's contextualSpacing is durable paragraph data; this separate
        // view plugin derives only the live same-style margin suppression as
        // node decorations. No DOM mutation or serialized helper attrs.
        ContextualParagraphSpacing,
        DocumentHeadingStyles,
        TextStyling,
        // Word/WPS hidden text (`<w:vanish>`). The semantic mark is always in
        // the schema so imported hidden runs cannot become visible or be lost;
        // authoring/reveal controls remain behind docsOfficeParityV2.
        DocumentHiddenText,
        // Direct Word proofing language / no-proof authority. This metadata-only
        // mark does not alter the visible font or text; it owns only direct
        // `<w:lang>` / `<w:noProof>` run properties for native round-trips.
        DocumentProofingLanguage,
        // Underline with Word/WPS line styles (double/dotted/wavy) + color.
        // ADDITIVE: extends the stock underline mark (StarterKit's is disabled
        // above) with two whitelisted attrs that round-trip through DOCX
        // `<w:u w:val w:color>` and the document schema's open `marks`
        // passthrough; a plain single underline stays byte-for-byte unchanged.
        DocumentUnderline,
        DocumentBold,
        DocumentItalic,
        // Named paragraph styles (Word/WPS "Styles" pane). ADDITIVE: adds a
        // `customStyleName` global attribute to paragraph/heading nodes (the
        // per-block assignment of a user-defined named style) plus the
        // set/clearCustomParagraphStyle commands the Styles pane drives. The attr
        // round-trips through the document schema's open `attrs` passthrough (see
        // lib/native-page-schemas.ts), so a document that never applies a custom
        // style carries no attribute and is byte-for-byte unchanged.
        ParagraphStyleAssignment,
        // Track Changes (Word/WPS "suggesting mode"). ADDITIVE + FLAG-GATED:
        // suggesting mode is OFF by default, so when off the plugin is a strict
        // no-op and normal editing is unchanged. Registers the insertion/deletion
        // marks plus the accept/reject commands. The marks round-trip through the
        // document schema, whose persisted `marks` array is an open passthrough
        // (see lib/native-page-schemas.ts), so no schema bump is needed.
        TrackChanges.configure({ changeBarsOnlyWhenAsked: printSurface }),
        // Comment Threads (Word/WPS "comments"). ADDITIVE: registers ONE inline
        // "comment" mark (anchors a selection to a thread) + ONE optional
        // top-level doc attribute holding the thread store. Both round-trip
        // through the document schema's open `marks`/`attrs` passthrough (see
        // lib/native-page-schemas.ts → documentDocAttrsSchema), so existing
        // documents — which carry neither — still validate unchanged. No flag:
        // the feature is purely opt-in per user action, so a doc with no comments
        // behaves exactly as before.
        DocumentComments,
        // Bookmarks (Word/WPS "Insert → Bookmark" + "Go To"). ADDITIVE: registers
        // ONE inline "bookmark" mark carrying a sanitized name. It round-trips
        // through the document schema's open `marks` passthrough (see
        // lib/native-page-schemas.ts), so existing documents — which carry none —
        // still validate unchanged. No flag: opt-in per user action; a document
        // with no bookmarks behaves exactly as before.
        DocumentBookmarks,
        DocumentBookmarkPoints,
        // Word's editing exceptions under Restrict Editing (w:permStart /
        
        // document inside its regions only (rangePermissions.ts).
        RangePermission,
        RangePermissionLane,
        // Document Index (Word/WPS "Mark Index Entry" XE + "Insert Index"). ADDITIVE:
        // registers ONE inline "indexEntry" mark carrying a sanitized term. It
        // round-trips through the document schema's open `marks` passthrough (see
        // lib/native-page-schemas.ts), so existing documents — which carry none —
        // still validate unchanged. No flag: opt-in per user action; the inserted
        // index is ordinary heading/paragraph content that exports as normal text.
        DocumentIndexEntry,
        // Table of Authorities (Word `TA` marker + `TOA` generated field).
        // The inline mark is hidden-field authority attached to the selected
        // citation; the generated table remains the canonical documentField atom.
        DocumentAuthorityEntry,
        // Chinese emphasis dots / 着重号 (Word `<w:em>`, WPS Writer "着重号").
        // ADDITIVE: registers ONE inline "emphasisDots" mark carrying an optional
        // whitelisted glyph style (rendered via CSS `text-emphasis` so the dots
        // paint in-editor). It round-trips through the document schema's open
        // `marks` passthrough (see lib/native-page-schemas.ts), so existing
        // documents — which carry none — still validate unchanged. No flag: opt-in
        // per user action; a document with no emphasis dots behaves and exports
        // byte-for-byte as before.
        DocumentEmphasisDots,
        // Character shading / 字符底纹 + character border / 字符边框 (Word/WPS
        // Home-tab font toggles). ADDITIVE: registers TWO attribute-less inline
        // marks ("charShading" — fixed light-gray fill; "charBorder" — thin
        // currentColor hairline box). Both render a fixed data-attribute +
        // developer-authored CSS (no user value reaches the style surface) and
        // round-trip through the document schema's open `marks` passthrough
        // (see lib/native-page-schemas.ts) and through DOCX (run `<w:shd
        // w:fill="E7E6E6">` / `<w:bdr w:val="single">`, see docx-export.ts).
        // No flag: opt-in per user action; a document with neither mark
        // behaves and exports byte-for-byte as before.
        DocumentCharShading,
        DocumentCharBorder,
        // Font > Advanced > Position (Word `w:position`): raised / lowered
        // text, rendered with CSS vertical-align so the line grows as Word's.
        DocumentTextPosition,
        // Enclosed / circled characters / 带圈字符 (Word "Enclose Characters",
        // WPS Writer "带圈字符"). ADDITIVE: registers ONE inline "enclosedChar"
        // mark carrying a whitelisted enclosure shape (circle/square/triangle/
        // diamond, rendered via CSS so the enclosure paints around the glyph
        // in-editor). It round-trips through the document schema's open `marks`
        // passthrough (see lib/native-page-schemas.ts), so existing documents —
        // which carry none — still validate unchanged. No flag: opt-in per user
        // action; a document with no enclosed chars behaves and exports byte-for-
        // byte as before (DOCX enclosure round-trip is deferred — see
        // docx-export.ts).
        DocumentEnclosedChar,
        
        EnclosedCharLineBoundaryKeys,
        // Chinese Typography / 中文版式 (縦中横 / 合并字符 / 双行合一). ADDITIVE:
        // registers ONE inline "eastAsianLayout" mark carrying two whitelisted
        // attrs (`feature` ∈ {tateChuYoko,combineChars,twoLinesInOne} and
        // `brackets` ∈ {none,round,square,angle,curly}). Rendered via CSS in-
        // editor; round-trips through DOCX via `<w:eastAsianLayout>` attributes
        // on the run's rPr (w:vert for 縦中横, w:combine/w:combineBrackets for
        // 合并字符 / 双行合一). It round-trips through the document schema's open
        // `marks` passthrough (see lib/native-page-schemas.ts), so existing
        // documents — which carry none — still validate unchanged. No flag:
        // opt-in per user action; a document with no eastAsianLayout marks
        // behaves and exports byte-for-byte as before.
        DocumentEastAsianLayout,
        // AutoCorrect / smart typography while typing (Word/WPS "AutoFormat As
        // You Type", the local stand-in for the un-installed
        // `@tiptap/extension-typography`). ADDITIVE + INPUT-RULE ONLY: it adds no
        // node/mark/attribute/command — it only rewrites freshly typed text
        // (straight quotes → curly “ ” ‘ ’, `--` → —, `...` → …, (c)/(tm)/(r) →
        // © ™ ®, 1/2·1/4·3/4 → ½ ¼ ¾). On by default (like Word); the toggle is
        // read through `getAutoCorrectEnabled` at fire time so the user can turn
        // it off without rebuilding the editor. Because it touches only typed
        // text and carries no schema, an imported document that is never typed
        // into exports byte-for-byte unchanged, and the glyphs it produces are
        // ordinary text that round-trips through HTML/DOCX export. TipTap's
        // input-rule runner already refuses to fire inside code blocks / inline
        // code, so smart quotes never corrupt code.
        AutoCorrect.configure(
          getAutoCorrectEnabled ? { isEnabled: getAutoCorrectEnabled } : {},
        ),
        // Word's keyboard shortcuts for the Symbol dialog's Special Characters
        // (em dash, non-breaking hyphen, optional hyphen, non-breaking space).
        // KEYMAP ONLY: no node, mark, attribute or command, and every binding is
        // derived from the same catalogue the dialog's shortcut column reads, so
        // the two can never disagree.
        SpecialCharacterShortcuts,
        // Word's paragraph keys: Cmd/Ctrl+Up/Down move by paragraph and with
        // Shift select to its start or end (a page-cut part is not a paragraph).
        DocumentParagraphNavigation,
        CaretPlaceholder.configure({ placeholder }),
        DocumentTaskList,
        DocumentTaskItem.configure({
          nested: true,
          // The box is named in the interface's language (WUA 132), with the
          // item's words for which task it is.
          a11y: {
            checkboxLabel: (node) =>
              node.textContent
                ? translate("editor.taskItemCheckbox", { text: node.textContent.slice(0, 120) })
                : translate("editor.taskItemCheckboxEmpty"),
          },
        }),
        // A source Word paragraph may own several inline pictures.  Keep that
        // paragraph as one block layout box so its images align and paginate as
        // a row; the child images remain the standard resizable image nodes.
        ImageRow,
        createDocumentImageExtension(imageRuntimeLabels),
        createDocumentImageExtension(imageRuntimeLabels, "inline"),
        Extension.create({
          name: "documentImageCropSession",
          addProseMirrorPlugins() {
            return [createDocumentImageCropPlugin()];
          },
        }),
        Extension.create({
          name: "documentPictureStylePreview",
          addProseMirrorPlugins() {
            return [createDocumentPictureStylePlugin()];
          },
        }),
        // Online Video / Media is a real atom in the schema even while the
        // dark-launch flag is off, so saved documents never lose the node on
        // reopen. The flag gates only insertion/editing and third-party
        // playback; the disabled node view remains a safe outbound link.
        DocumentMedia.configure({
          enabled: isDocumentOnlineVideoV1Enabled(),
        }),
        // Office signature line: the server import projects this atom into
        // page JSON and the server exporter re-emits the native part. The
        // schema must know the node or TipTap drops it on load and the next
        // save destroys it. The Insert ribbon authors the same closed unsigned
        // shape; signing/certificate operations remain deliberately absent.
        DocumentSignatureLine,
        DocumentAltChunkReadOnly.configure({
          labels: {
            label: translate("document.altChunkReadOnly.label"),
            description: translate("document.altChunkReadOnly.description"),
            simplified: translate("document.altChunkReadOnly.simplified"),
            invalid: translate("document.altChunkReadOnly.invalid"),
          },
        }),
        // Word-sized empty tables cannot be represented as millions of dense
        // ProseMirror cell nodes. The sparse atom keeps exact logical dimensions
        // and edited cells while its NodeView mounts only the visible window.
        DocumentVirtualTable.configure({
          labels: {
            grid: (rows, columns) =>
              translate("document.virtualTable.label", { rows, columns }),
            cell: (row, column) =>
              translate("document.virtualTable.cellLabel", { row, column }),
            commitError: translate("document.virtualTable.commitError"),
            simplified: translate("document.virtualTable.simplified"),
          },
        }),
        HorizontalRule,
        PageBreak,
        TextBlockPageSplitAttrs,
        ColumnBreak,
        SectionBreak,
        SourcePageBreak,
        createCodeBlockExtension(lowlight),
        // TableView skips the table renderHTML output. One decoration plugin
        // mirrors table attrs and resolves effective table/cell borders onto
        // the live cells, including explicit nil overrides and view gridlines.
        Extension.create({
          name: "tableAttributeMirror",
          addProseMirrorPlugins() {
            return [
              createDocumentTableCellMarginsPlugin(),
              createNestedTableEndParagraphPlugin(),
              // Word's "Don't use HTML paragraph auto spacing": spacings add up.
              createParagraphSpacingAddsUpPlugin(),
              // Source/inherited margins establish the base first. The proven
              // native collapsed-border projection then adjusts that geometry.
              createDocumentTableBorderPlugin(),
            ];
          },
        }),
        // `borderless` (ADDITIVE, default false): OOXML tables with NO
        // effective borders anywhere in tblPr or the style chain - Word
        // paints nothing (gov letterhead layout tables). Rendered as a data
        // attribute so CSS can suppress the editor's default grid; strict
        // boolean on parse AND render.
        Table.extend({
          addCommands() {
            const parent = this.parent?.() ?? {};
            return {
              ...parent,
              // Table Design > Header Row: the first row's cells become
              // header cells or ordinary ones, all of them unless the FIRST
              // COLUMN is a header column too. prosemirror-tables judges that
              // on the one page fragment the caret is in: a table cut across
              // two pages holds only its first row on the first page, whose
              // first-column cell is a header, so turning the row off kept
              // that cell a header (WUA 182). The column is judged on the
              // whole logical table, below its first row and the repeated
              // headers.
              toggleHeaderRow:
                () =>
                ({ state, dispatch }: { state: EditorState; dispatch?: (tr: Transaction) => void }) => {
                  if (!isInTable(state)) return false;
                  const rect = selectedRect(state);
                  const header = state.schema.nodes.tableHeader;
                  const cell = state.schema.nodes.tableCell;
                  if (!header || !cell) return false;
                  const firstRow = rect.map.cellsInRect({ left: 0, top: 0, right: rect.map.width, bottom: 1 });
                  const rowOn = firstRow.every((at) => rect.table.nodeAt(at)?.type === header);
                  let columnCells = 0;
                  let columnOn = true;
                  for (const [fragmentIndex, fragment] of logicalTableFragmentsAt(state.doc, rect.tableStart - 1).entries()) {
                    const map = TableMap.get(fragment.node);
                    fragment.node.forEach((row, _offset, rowIndex) => {
                      if (row.attrs?.[TABLE_REPEATED_HEADER_ATTR] === true) return;
                      if (fragmentIndex === 0 && rowIndex === 0) return;
                      if (rowIndex >= map.height) return;
                      const at = map.map[rowIndex * map.width];
                      columnCells += 1;
                      if (fragment.node.nodeAt(at)?.type !== header) columnOn = false;
                    });
                  }
                  const keepFirst = columnOn && columnCells > 0;
                  if (dispatch) {
                    const tr = state.tr;
                    const nextType = rowOn ? cell : header;
                    for (const at of keepFirst ? firstRow.slice(1) : firstRow) {
                      const node = rect.table.nodeAt(at);
                      if (node && node.type !== nextType) tr.setNodeMarkup(rect.tableStart + at, nextType, node.attrs);
                    }
                    dispatch(tr);
                  }
                  return true;
                },
              // Merge keeps the region's outer frame: prosemirror-tables
              // leaves the merged cell with the top-left cell's attrs,
              
              mergeCells:
                () =>
                (props: { state: EditorState; tr: Transaction; dispatch?: unknown }) => {
                  // A formula cell merged with other text would have that
                  
                  const formulaPlan = documentTableMergeFormulaPlan(props.state);
                  if (formulaPlan.kind === "refuse") return false;
                  const carry = formulaPlan.kind === "carry" ? formulaPlan : null;
                  const outer = mergedRegionCellBorders(props.state);
                  const grid = mergedRegionGridWidths(props.state);
                  // Word applies Merge Cells untracked ("This action will not
                  // be marked as a change"): no row or property revision, and
                  // the merged words are not struck and inserted again.
                  props.tr.setMeta(TRACK_CHANGES_SKIP_META, true);
                  const merge = (parent as { mergeCells?: () => (p: typeof props) => boolean }).mergeCells;
                  const merged = merge ? merge()(props) : false;
                  if (!merged || (!outer && !carry && !grid) || !props.dispatch) return merged;
                  const selection = props.tr.selection;
                  if (!(selection instanceof CellSelection)) return merged;
                  const pos = selection.$anchorCell.pos;
                  const node = props.tr.doc.nodeAt(pos);
                  if (!node) return merged;
                  const attrs: Record<string, unknown> = { ...node.attrs };
                  // Word keeps the table grid: the merged cell spans the grid
                  // columns it covers, each as wide as before. The table
                  // plugin pads the live widths with zeros and leaves the
                  // native twips of the top-left cell alone, a grid no save
                  // could state (DQ-0023, corpus R455-D86 E17).
                  if (grid && (Number(node.attrs.colspan) || 1) === grid.span) {
                    if (grid.px) attrs.colwidth = grid.px;
                    if (grid.twips) attrs.colwidthTwips = grid.twips;
                    else if (node.attrs.colwidthTwips != null) attrs.colwidthTwips = null;
                  }
                  if (outer) {
                    const current = normalizeDocumentTableBorders(node.attrs.cellBorders, "cell") ?? {};
                    const next: Record<string, unknown> = { ...current };
                    for (const edge of ["top", "bottom", "left", "right"] as const) {
                      if (outer[edge]) next[edge] = outer[edge];
                      else delete next[edge];
                    }
                    attrs.cellBorders = normalizeDocumentTableBorders(next, "cell");
                  }
                  // The one formula of the region stays the merged cell's.
                  if (carry) {
                    attrs.formula = carry.formula;
                    attrs.formulaNumberFormat = carry.formulaNumberFormat;
                  }
                  props.tr.setNodeMarkup(pos, undefined, attrs);
                  props.tr.setSelection(new CellSelection(props.tr.doc.resolve(pos)));
                  return true;
                },
            } as typeof parent;
          },
          addProseMirrorPlugins() {
            const plugins = this.parent?.() ?? [];
            if (!this.options.resizable) return plugins;
            // TipTap installs the resizer itself only for an editor created
            // editable. Hydration starts read-only while source/ACL authority
            // resolves, so install the same resizer once for that lifecycle:
            // its event handlers check current view.editable before accepting
            // input.
            const resizing = plugins.find(plugin => plugin.spec.key === columnResizingPluginKey) ??
              columnResizing({
                handleWidth: this.options.handleWidth,
                cellMinWidth: this.options.cellMinWidth,
                defaultCellMinWidth: this.options.cellMinWidth,
                View: this.options.View,
                lastColumnResizable: this.options.lastColumnResizable,
              });
            // The stock resizer keeps the table NodeView and its handle state.
            // Hover and every drag start belong to the border-drag plugin,
            // which also reaches the left edge, row borders and outer edges
            // approached from outside the table.
            const stockEvents = resizing.props.handleDOMEvents;
            if (stockEvents) {
              delete stockEvents.mousemove;
              delete stockEvents.mouseleave;
              delete stockEvents.mousedown;
            }
            return [
              createDocumentTableBorderDragPlugin(),
              resizing,
              ...plugins.filter(plugin => plugin !== resizing),
            ];
          },
          addNodeView() {
            // The always-present resizing plugin owns the table NodeView;
            // don't also register a hydration-time read-only fallback.
            return this.options.resizable ? null : this.parent?.() ?? null;
          },
          addAttributes() {
            return {
              ...this.parent?.(),
              borderless: {
                default: false,
                parseHTML: (element: HTMLElement) =>
                  element.getAttribute("data-borderless") === "true",
                renderHTML: (attrs: Record<string, unknown>) =>
                  attrs.borderless === true
                    ? { "data-borderless": "true" }
                    : {},
              },
              tableBorders: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                  readTableBordersFromElement(element),
                renderHTML: (attrs: Record<string, unknown>) =>
                  tableBordersAttributes(attrs.tableBorders),
              },
              // Word table defaults (`w:tblPr/w:tblCellMar`). Individual
              // `cellMargin` sides remain cell-level overrides. TableView
              // skips table renderHTML, so tableAttributeMirror projects this
              // attr and the effective inherited padding into the live DOM.
              tableCellMargin: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                  readTableCellMarginsFromElement(element),
                renderHTML: (attrs: Record<string, unknown>) =>
                  tableCellMarginsAttributes(attrs.tableCellMargin),
              },
              tableCaption: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                  normalizeDocumentTableAltText(
                    element.getAttribute("data-table-caption"),
                  ) || null,
                renderHTML: (attrs: Record<string, unknown>) => {
                  const value = normalizeDocumentTableAltText(
                    attrs.tableCaption,
                  );
                  // The title is the table's accessible name, as Word's Alt
                  
                  return value
                    ? { "data-table-caption": value, "aria-label": value }
                    : {};
                },
              },
              tableDescription: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                  normalizeDocumentTableAltText(
                    element.getAttribute("data-table-description"),
                  ) || null,
                renderHTML: (attrs: Record<string, unknown>) => {
                  const value = normalizeDocumentTableAltText(
                    attrs.tableDescription,
                  );
                  return value
                    ? { "data-table-description": value, "aria-description": value }
                    : {};
                },
              },
              tableLayoutPolicy: {
                default: null,
                parseHTML: (element: HTMLElement) => {
                  const value = element.getAttribute(
                    "data-table-layout-policy",
                  );
                  return isDocumentTableLayoutMode(value) ? value : null;
                },
                renderHTML: (attrs: Record<string, unknown>) =>
                  isDocumentTableLayoutMode(attrs.tableLayoutPolicy)
                    ? {
                        "data-table-layout-policy": attrs.tableLayoutPolicy,
                      }
                    : {},
              },
              tableStyleTheme: {
                default: null,
                // A legacy recipe id, or the Word style id of an Office
                // gallery table style (`documentOfficeTableStyles.ts`).
                parseHTML: (element: HTMLElement) => {
                  const value = element.getAttribute("data-table-style-theme");
                  return (
                    tableStyleThemeFromAttrs({ tableStyleTheme: value })?.id ??
                    (officeWordTableStyleForAllocatedId(value) ? value : null)
                  );
                },
                renderHTML: (attrs: Record<string, unknown>) => {
                  const theme = tableStyleThemeFromAttrs(attrs);
                  if (theme) return { "data-table-style-theme": theme.id };
                  return officeWordTableStyleForAllocatedId(attrs.tableStyleTheme)
                    ? {
                        "data-table-style-theme": String(attrs.tableStyleTheme),
                      }
                    : {};
                },
              },
              tableStyleTotalRow: {
                default: false,
                parseHTML: (element: HTMLElement) =>
                  element.getAttribute("data-table-style-total-row") === "true",
                renderHTML: (attrs: Record<string, unknown>) =>
                  tableStyleOptionsFromAttrs(attrs).totalRow
                    ? { "data-table-style-total-row": "true" }
                    : {},
              },
              tableStyleFirstColumn: {
                default: false,
                parseHTML: (element: HTMLElement) =>
                  element.getAttribute("data-table-style-first-column") ===
                  "true",
                renderHTML: (attrs: Record<string, unknown>) =>
                  tableStyleOptionsFromAttrs(attrs).firstColumn
                    ? { "data-table-style-first-column": "true" }
                    : {},
              },
              tableStyleLastColumn: {
                default: false,
                parseHTML: (element: HTMLElement) =>
                  element.getAttribute("data-table-style-last-column") ===
                  "true",
                renderHTML: (attrs: Record<string, unknown>) =>
                  tableStyleOptionsFromAttrs(attrs).lastColumn
                    ? { "data-table-style-last-column": "true" }
                    : {},
              },
              tableStyleBandedRows: {
                default: false,
                parseHTML: (element: HTMLElement) =>
                  element.getAttribute("data-table-style-banded-rows") ===
                  "true",
                renderHTML: (attrs: Record<string, unknown>) =>
                  tableStyleOptionsFromAttrs(attrs).bandedRows
                    ? { "data-table-style-banded-rows": "true" }
                    : {},
              },
              tableStyleBandedColumns: {
                default: false,
                parseHTML: (element: HTMLElement) =>
                  element.getAttribute("data-table-style-banded-columns") ===
                  "true",
                renderHTML: (attrs: Record<string, unknown>) =>
                  tableStyleOptionsFromAttrs(attrs).bandedColumns
                    ? { "data-table-style-banded-columns": "true" }
                    : {},
              },
              tableRepresentation: {
                default: DOCUMENT_TABLE_DENSE_REPRESENTATION,
                parseHTML: (element: HTMLElement) =>
                  documentTableRepresentationFromNodeAttrs({
                    tableRepresentation: element.getAttribute(
                      "data-table-representation",
                    ),
                  }),
                renderHTML: (attrs: Record<string, unknown>) => {
                  const representation =
                    documentTableRepresentationFromNodeAttrs(attrs);
                  return representation
                    ? { "data-table-representation": representation }
                    : {};
                },
              },
              tableFixedWidthTwips: {
                default: null,
                parseHTML: (element: HTMLElement) => {
                  const value = Number(
                    element.getAttribute("data-table-fixed-width-twips"),
                  );
                  return Number.isInteger(value) &&
                    value >= DOCUMENT_TABLE_MIN_FIXED_WIDTH_TWIPS &&
                    value <= DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS
                    ? value
                    : null;
                },
                renderHTML: (attrs: Record<string, unknown>) => {
                  const value = attrs.tableFixedWidthTwips;
                  return attrs.tableLayoutPolicy === "initial_fixed" &&
                    typeof value === "number" &&
                    Number.isInteger(value) &&
                    value >= DOCUMENT_TABLE_MIN_FIXED_WIDTH_TWIPS &&
                    value <= DOCUMENT_TABLE_MAX_TOTAL_WIDTH_TWIPS
                    ? { "data-table-fixed-width-twips": String(value) }
                    : {};
                },
              },
            };
          },
        }).configure({
          // Render clamp AND drag floor. Word grid-fits a 15-column table
          // into the printable width with ~37px columns; a 56px floor blew
          // every dense imported grid past the sheet edge into a scroll
          // container (col css = max(colwidth, cellMinWidth) in TipTap's
          // updateColumns, while table style.width kept the raw sum).
          cellMinWidth: 12,
          handleWidth: DOCUMENT_TABLE_RESIZE_HIT_WIDTH_PX,
          resizable: true,
          View: StableTableColumnResizeView,
          HTMLAttributes: { class: "mrnote-table" },
        }),
        createDocumentTableRowExtension(),
        createDocumentTableHeaderExtension(),
        createDocumentTableCellExtension(),
        // Word grid-fit for the OPEN document: legacy pages imported before
        // BE grid-fit store over-wide column grids that CSS cannot compress
        // (fixed col sums beat max-width) — heal them once per mount so no
        // table ever renders as a sideways-scrolling block. ADDITIVE: docs
        // whose tables already fit dispatch nothing.
        TableGridFit,
        // Recompute glue for Word-style cell formulas (=SUM/AVERAGE/COUNT/
        // PRODUCT(ABOVE|LEFT) + A1 refs). ADDITIVE: a strict no-op for any
        // document whose cells carry no `formula` attribute, so tables without
        // formulas are untouched (render byte-for-byte as today).
        DocumentTableFormulas,
        // Word/WPS table-structure commands: Split Table, Distribute Rows /
        // Columns evenly, AutoFit Contents / Window. ADDITIVE: pure no-op outside
        // a table; the commands rewrite the enclosing table node via the tested
        // pure transforms.
        TableStructure,
        // Word `w:gridBefore` / `w:gridAfter`: a grid slot the page builder
        // padded (`gridFiller`) holds no cell in Word. Inert at the root:
        // the caret never rests there, user-authored transactions cannot
        // write into it or restructure its table (the DOCX saver writes only
        // cell content into such a grid), and table-wide commands leave it
        // byte-identical. ADDITIVE: a document with no filler dispatches and
        // decorates nothing.
        DocumentTableGridFiller.configure({
          onRefused: createGridFillerRefusalNotice(translate),
        }),
        // Word `w:hideMark`: an empty cell's end mark takes no row height
        // (view-only decoration from the import's receipt).
        DocumentTableHideMark,
        // Word `w:noWrap`: a cell's words do not wrap (view-only decoration
        // from the import's receipt).
        DocumentTableNoWrap,
        // Word's style separator (w:specVanish paragraph mark): the next
        // paragraph runs on the separator's line (view-only decoration).
        DocumentStyleSeparator,
        DocumentSectionMarkParagraph,
        DocumentTrailingBlankLineHeight,
        FloatSelectionPaste,
        // Word text frames (w:framePr): drawn at their stated size and place
        // with the text going round them (view-only, from the receipt).
        DocumentWordTextFrames,
        // Word/WPS "Show/Hide ¶" formatting-mark overlay. ADDITIVE + VIEW-ONLY:
        // OFF by default → empty decoration set, so the document renders and
        // exports byte-for-byte unchanged. Toggling on paints invisibles (¶, tab
        // arrows, space dots, line breaks) as decorations only — never inserting
        // any character into the text. Glyphs (Western `¶`/`↵` vs East
        // Asian `↵`/`↓`) and Word's break labels follow the UI locale.
        FormattingMarks.configure({
          presentation: formattingMarksPresentation((key) => translate(key)),
        }),
        // Paged EDITING seams (view-only sheet boundaries BETWEEN top-level
        // blocks, driven by the layout snapshot). ADDITIVE: without the host
        // dispatching seams the plugin renders nothing and the document is
        // byte-for-byte unchanged.
        // Word TOC-entry caption + page-number marks (imported table of
        // contents). ADDITIVE + purely visual: a document with no TOC entries
        // carries neither mark. The `.toc-entry__*` CSS renders the dot leader.
        TocEntryTitleMark,
        TocEntryPageMark,
        // Click a TOC entry → scroll to its heading (id or caption-text match).
        TocNavigation,
        // An AI answer's citation link (pasted or applied) opens the cited
        // place in its window and flashes it, as the answer's chip does.
        CitationLinkNavigation,
        // Copy as plain text what the reader sees: no hidden deleted text,
        
        ClipboardTextProjection,
        // Word's tab stops in the body: every stop of a paragraph places its
        // text (measured, display-only decorations), not just the first
        
        BandTabLayout,
        // Memory-evidence "view source" locator: jumps to + temporarily flashes
        // the quoted passage when the memory evidence panel opens this page.
        // ADDITIVE + VIEW-ONLY: the flash is a decoration (never a mark), the
        // transactions skip the undo history, and a document that never
        // receives a locate request renders byte-for-byte unchanged.
        EvidenceLocator,
      ],
    },
    {
      id: "mrnote-blocks",
      extensions: [
        // The math node views are vanilla ProseMirror (no React, no
        // translation hook) so their UI copy comes in via options.
        MathBlock.configure({
          placeholder: translate("block.math.placeholder"),
          editHint: translate("block.math.doubleClickEdit"),
          editorLabels: equationEditorLabels,
        }),
        InlineMath.configure({
          placeholder: translate("math.placeholder"),
          editHint: translate("block.math.doubleClickEdit"),
          editorLabels: equationEditorLabels,
        }),
        CalloutBlock,
        // getPageId lets the whiteboard's "summarize to memory" button POST
        // { page_id, elements } to the whiteboard-summarize route (P3 Stage 1).
        // guestMode hides that authed affordance on the public marketing demo.
        WhiteboardBlock.configure({ getPageId: () => pageId, guestMode }),
        // Native Word DrawingML shape block. The document-specific node owns
        // flow placement/source identity, while its SVG geometry reuses the
        // existing presentation shape renderer through document-shapes.ts.
        // getPageId lets a preserved Office diagram draw its slot pictures
        // from the page's own source package (none in guest mode).
        DocumentShapeBlock.configure({
          labels: documentShapeLabels,
          getPageId: () => (guestMode ? undefined : pageId),
          fitTextWhenReadOnly: printSurface,
        }),
        // Word shape / SmartArt In Line with Text sharing its line with text:
        // the same shape as a run-level atom.
        InlineDocumentShape.configure({
          labels: documentShapeLabels,
          getPageId: () => (guestMode ? undefined : pageId),
          fitTextWhenReadOnly: printSurface,
        }),
        // An inserted, pasted or dropped picture is stored beside the page
        // and named by digest (lib/document-picture-objects-upload), so a
        // page of photos never outgrows the page budget and stops saving.
        ...(guestMode ? [] : [createDocumentPictureObjectsExtension({ getPageId: () => pageId })]),
        // The editor's last document versions, so a transaction made on one
        // of them is rebased rather than refused (lib/editor/prosemirror-resilience).
        Extension.create({ name: "staleTransactionRebase", addProseMirrorPlugins: () => [staleTransactionRebasePlugin()] }),
        // guestMode short-circuits each block's authed calls (upload/convert/
        // attachment fetch, task complete, deck add) on the public demo; default
        // false leaves the console path byte-for-byte unchanged.
        FileBlock.configure({ guestMode }),
        
        // (no authed network calls), so no guestMode option is needed: the
        // recharts canvas / SVG geometry render identically on the demo.
        ChartBlock,
        // Word "In Line with Text" chart: the same chart as a run-level atom.
        InlineChart,
        SmartArtBlock,
        
        // diagrams rendered client-side with securityLevel "strict". Fully
        // self-contained (no authed network calls) → no guestMode option,
        // matching chart/smartArt above.
        MermaidBlock,
        
        // Python source executed in the EXISTING sandboxed Pyodide worker;
        // the captured matplotlib PNG persists in outputPng and rides the
        // existing image export pipeline. Rendering the stored PNG needs no
        // authed network call → no guestMode option, matching chart/mermaid.
        CodeChartBlock,
        ReferenceBlock.configure({ guestMode }),
        TaskBlock.configure({ guestMode }),
        FlashcardBlock.configure({ guestMode }),
        // A table of contents asked for in a table cell goes after the table
        // (referencesButtons.insertTableOfContentsCommand): said, never silent.
        TableOfContents.configure({
          onPlacedAfterTable: () => toast({ title: translate("document.toc.placedAfterTable") }),
        }),
        DocumentCoverPage,
        WikiLink,
        Frontmatter,
        // Footnotes / endnotes (Word/WPS parity). ADDITIVE: registers the inline
        // footnoteRef atom node + the footnoteList block node + an optional
        // top-level doc attribute store (note bodies + placement mode). All ride
        // through the document schema's open content/attrs passthrough (see
        // lib/native-page-schemas.ts), so existing documents — which carry none —
        // still validate unchanged. No flag: opt-in per user action.
        DocumentFootnotes,
        // Citations / bibliography (Word/WPS parity). ADDITIVE: registers the
        // inline citation atom node + the bibliography block node + an optional
        // top-level doc attribute store (CSL-JSON-like sources + active style).
        // Same additive passthrough story as footnotes above; no flag.
        DocumentCitations.configure({ missingSourceLabel: translate("citations.missing") }),
        // Cross-references to headings (Word/WPS parity). ADDITIVE: registers the
        // inline crossRef atom node carrying a sanitized target heading anchor id
        // + a snapshot label. Same additive passthrough story as footnotes; no
        // flag — opt-in per Insert cross-reference action.
        DocumentCrossReferences,
        // Word/WPS document fields. Each insertion remains a structured inline
        // atom (`documentField`) carrying its instruction type, closed format,
        // refresh policy and cached result; PAGE/NUMPAGES derive from structural
        // page sheets in the editor and export as live OOXML fields.
        DocumentFields,
        // Mail merge (Word/WPS "邮件合并" parity). ADDITIVE: registers the inline
        // mergeField atom node (a «FieldName» placeholder bound to a data column)
        // + an optional top-level doc attribute store holding the recipient data
        // source ({ columns, rows }). Both ride the document schema's open
        // content/attrs passthrough (see lib/native-page-schemas.ts), so existing
        // documents — which carry none — still validate unchanged. No flag — opt-in
        // per Insert merge field / Recipients action; a document with no merge
        // fields renders and exports byte-for-byte as before.
        DocumentMailMerge,
        // Ruby text / phonetic guide (Word "拼音指南" / WPS phonetic guide /
        // furigana). ADDITIVE: registers the inline ruby atom node carrying a
        // sanitized base run + its annotation (rendered above via <rt>). Same
        // additive passthrough story as the cross-reference above; no flag —
        // opt-in per Insert ruby action. A document with no ruby nodes renders
        // and exports byte-for-byte as before.
        DocumentRuby,
        // Captions (Word/WPS "Figure N" / "Table N" parity). ADDITIVE: registers
        // the `caption` block node + an anchor-id back-fill plugin. The number is
        // derived live (like the TOC), figure/table counters are independent, and
        // a caption can be a cross-reference target. Spread because the bundle is
        // an array (node + plugin). Same additive passthrough story; no flag.
        ...DocumentCaptions,
        // List of Figures / List of Tables (Word/WPS "Insert Table of Figures").
        // ADDITIVE: registers ONE block node ("listOfFigures") carrying a
        // whitelisted `kind` attr; it lists the captions of that kind LIVE
        // (mirroring the TOC), each entry click-to-jump. Rides the same open
        // schema passthrough; a document with no listOfFigures node behaves and
        // exports exactly as before. No flag — opt-in per Insert action.
        ListOfFigures,
        // Content controls (Word/WPS "structured document tags" / `<w:sdt>` — text
        // inputs, dropdowns, checkboxes, date pickers). ADDITIVE: registers ONE
        // inline "contentControl" mark (carrying the control's metadata + a unique
        // merge key) + ONE "blockContentControl" block node. Both ride the document
        // schema's open marks/content/attrs passthrough (see lib/native-page-
        // schemas.ts), so existing documents — which carry neither — still validate
        // unchanged. No flag: pure PRESERVATION (an imported Word form's controls
        // survive a DOCX round-trip with type + metadata + inner content intact); a
        // document with no controls renders and exports byte-for-byte as before. The
        // `translate` option localizes a control's boundary tooltip when it carries
        // no alias/tag.
        DocumentContentControls.configure({ translate }),
        // Filling in a form: Tab between a protected form's fields, Next /
        // Previous Field, Clear Fields, and the required fields' check.
        DocumentFormFill,
        // An ANCHORED text box (`wp:anchor` + `wps:txbx`) is a `textBox` node
        // carrying its own `wp:anchor` reading. This resolves that reading
        // against the page the frame is painted on, and hands a linked chain's
        // overflow to the next frame. A document with no anchored box does no
        // work here at all.
        FloatingTextBoxLayout,
        // React's pre-commit selection save counted every character of the
        // whole document on each commit of any root (lib/editor).
        ReactCommitSelectionGuard,
        // A click the browser placed and ProseMirror had not read yet is kept
        // when the page's own layout work redraws the view first (lib/editor).
        PendingDomSelection,
        DocumentAutoHyphenation,
        DocumentHyphenationRules,
        // A header or footer object Word wraps the body around (R22-D30).
        BandFloatExclusion,
        // A text box's border, grips and keys (Esc selects the box, typing
        // on a selected box goes into its words).
        TextBoxFrameChrome,
        // Selection Pane Show/Hide: a document-local `selectionPaneHidden`
        // flag on every listed object, painted hidden by a node decoration.
        DocumentObjectVisibility,
      ],
    },
    {
      id: "wikilink-suggestion",
      extensions: [
        WikiLinkSuggestion.configure({
          suggestion: createWikiLinkSuggestionConfig({
            getPageId: () => pageId,
            getNotebookId: resolveNotebookId,
            // Route through a 30-second TTL cache so repeated `[[`
            // popups in the same session don't re-fetch the entire
            // page list (heavy on a notebook with thousands of pages).
            // The cache is invalidated automatically when any page is
            // saved (mrnote:notebook-pages-changed event).
            fetchPages: async (nbId) => {
              try {
                const cache = getSharedWikiLinkPageListCache(async (id) => {
                  const list = await notebookSDK.listPages(id);
                  return list.items.map((p) => ({
                    id: p.id,
                    title: p.title || "",
                  }));
                });
                const all = await cache.get(nbId);
                return all.filter((p) => p.id !== pageId);
              } catch (err) {
                // The popup degrades gracefully to "Create new page"
                // when the network is offline or the API is down. We
                // log so an operator can spot real outages, but never
                // re-throw — an unhandled rejection here would surface
                // in the browser console (and noise vitest jsdom runs
                // that have no API server).
                if (typeof console !== "undefined") {
                  console.warn(
                    "wikilink-suggestion: listPages failed; popup will show only the create-new row",
                    err,
                  );
                }
                return [];
              }
            },
            translate: (key) => translate(key as never),
          }),
        }),
      ],
    },
  ];

  return {
    plugins,
    extensions: plugins.flatMap((plugin) => plugin.extensions),
  };
}
