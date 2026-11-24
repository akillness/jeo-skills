"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode, RefObject } from "react";
import { type OfficeSmartArtCategoryId, type OfficeSmartArtLayout, type OfficeSmartArtPlaceholders } from "../../lib/office-smartart/catalog";
import { type SmartArtColorGroup, type SmartArtColorGroupId, type SmartArtColorTheme, type SmartArtColorVariant } from "../../lib/office-smartart/colors";
import { smartArtLayoutHasAssistant, type OfficeSmartArtStyleSectionId, type SmartArtOutlineCommandState, type SmartArtOutlineInsertPosition } from "../../lib/office-smartart/design-model";
import { type OfficeSmartArtBlockLike, type OfficeSmartArtShapeNode, type SmartArtHierBranch, type SmartArtKind, type SmartArtNodePaint, type SmartArtStyle } from "../../lib/office-smartart/model";
import { type SmartArtPictureSlot } from "../../lib/office-smartart/picture-command";
import { type SmartArtStyleId } from "../../lib/office-smartart/styles-model";

/**
 * The tab's style slots. A host that already owns this geometry passes its own
 * class per slot (Presentation does — its copy is pinned by
 * `tests/unit/presentation-ribbon-more-css.test.ts`); anything it omits falls
 * back to {@link ./OfficeSmartArtDesignTab.module.css}, so a new host needs no
 * CSS at all.
 */
export interface OfficeSmartArtDesignTabClasses {
  createGroup: string;
  createRow: string;
  createHierarchyLane: string;
  layoutsGroup: string;
  layoutGallery: string;
  stylesGroup: string;
  styleGallery: string;
  resetGroup: string;
  propertiesGroup: string;
}

/** Every visible string, already translated by the host. */
export interface OfficeSmartArtDesignTabLabels {
  /** Group label over the structural commands ("Create Graphic"). */
  createGraphicGroup: string;
  /** The preserved diagram's one command, and its gallery's "more" label. */
  convertToEditable: string;
  /** Group label over the layouts gallery ("Layouts"). */
  layoutsGroupLabel: string;
  /** Accessible name of the layouts gallery itself. */
  layoutsGroup: string;
  /** Takes the catalog entry, not its kind: two layouts may share a kind. */
  layoutName: (layout: OfficeSmartArtLayout) => string;
  /**
   * An aligned Office ALIAS's own name (`hProcess9` -> "Continuous Block
   * Process"), listed beside the catalog layout it stands for. Absent, the
   * gallery lists the catalog layouts only.
   */
  aliasLayoutName?: (suffix: string) => string;
  /** Section caption of the Layouts sheet ("List", "Process", ...). Absent,
   * the sheet is one ungrouped grid. */
  layoutCategoryName?: (category: OfficeSmartArtCategoryId) => string;
  /** Why a Picture layout refuses to become a non-picture one. */
  pictureLayoutPreserveReason: string;
  /**
   * Why the diagram's CURRENT layout is shown in the gallery but cannot be
   * picked: it is a convert-only layout (SMARTART-IMPORT.md §5.34, §5.39) —
   * Office's own definition, kept from the file, which MRAI can draw and keep
   * but cannot create from nothing.
   *
   * Optional, so a host that has not translated it yet still gets the marker;
   * without it the tile carries its layout name and no explanation.
   */
  currentLayoutUnavailable?: string;
  /** A gallery's overflow-menu label. */
  quickOverflow: string;
  /**
   * The picture-slot command, shown only for a diagram that HAS slots. Absent
   * in a host that does not offer it (the presentation's SmartArt member is an
   * image block of its own and has "Replace picture" already).
   */
  insertPicture?: string;
  /** One slot in that command's menu — its 1-based ordinal and whether it is filled. */
  pictureSlotName?: (slot: SmartArtPictureSlot) => string;
  /** Why a slot Office's own layout draws no picture for cannot be filled. */
  pictureSlotUnexportable?: string;
  textPane: string;
  addShape: string;
  promote: string;
  demote: string;
  rightToLeft: string;
  stylesGroup: string;
  changeColors: string;
  /** One Change Colors variation's name (Office's tooltip for it). */
  colorName: (variant: SmartArtColorVariant) => string;
  /** A Change Colors heading: Primary Theme Colors, Colorful, Accent N. */
  colorGroupName: (group: {
    readonly id: SmartArtColorGroupId;
    readonly accent?: number;
  }) => string;
  styleName: (styleId: SmartArtStyleId) => string;
  styleSection: (sectionId: OfficeSmartArtStyleSectionId) => string;
  /** Group label over Reset Graphic ("Reset"). */
  resetGroupLabel: string;
  resetGraphic: string;
  propertiesGroup: string;
  altText: string;
  /**
   * Add Shape's positions (Microsoft `MsoSmartArtNodePosition`), Move Up / Move
   * Down, and Reset > Convert. Optional so an older caller keeps compiling; the
   * shared `useOfficeSmartArtDesignLabels` supplies every one.
   */
  addShapeAfter?: string;
  addShapeBefore?: string;
  addShapeAbove?: string;
  addShapeBelow?: string;
  addAssistant?: string;
  /**
   * Create Graphic > Add Bullet: a Level 2 line under the selected shape. In
   * the data model it is the same child point Add Shape Below makes, so it
   * runs that position and is offered exactly when the layout nests.
   */
  addBullet?: string;
  /** Why Add Assistant is refused on an organization chart layout. */
  addAssistantUnavailable?: string;
  /** Why Add Assistant is refused on any other layout. */
  addAssistantNotOrgChart?: string;
  /** Layout on an org chart box, and its four entries (Office's words). */
  orgChartLayout?: string;
  orgChartLayoutStandard?: string;
  orgChartLayoutBoth?: string;
  orgChartLayoutLeftHanging?: string;
  orgChartLayoutRightHanging?: string;
  /** Why Layout is refused on a layout that is no organization chart. */
  orgChartLayoutNotOrgChart?: string;
  moveUp?: string;
  moveDown?: string;
  convert?: string;
  convertToShapes?: string;
  convertToText?: string;
  /**
   * Why a greyed command is greyed. Office greys a command it cannot run and
   * MRAI says why (`data-disabled-reason`), so every disabled command here
   * carries one of these. Optional so an older caller keeps compiling; the
   * shared `useOfficeSmartArtDesignLabels` supplies every one.
   */
  readOnlyReason?: string;
  /** No shape of the diagram is selected, so an outline verb has no target. */
  noShapeSelectedReason?: string;
  /** The selected shape does not take this verb in this layout. */
  commandUnavailableReason?: string;
  /** A preserved (native) diagram: its structure belongs to the package. */
  nativeStructureUnavailable?: string;
  /** SmartArt Format > Shapes: the group caption and its two commands. */
  shapesGroup?: string;
  larger?: string;
  smaller?: string;
}

/** The selected AUTHORED diagram: what the tab shows, and where each command goes. */
export interface OfficeSmartArtDesignTabDiagram {
  /** Its catalog layout, checked in the layouts gallery. */
  kind: SmartArtKind;
  /** Its quick style, checked in the style gallery; null when members disagree. */
  styleId: SmartArtStyleId | null;
  /**
   * Whether the diagram runs Right to Left. Right to Left is a toggle (click
   * it again to go back), so the command shows as pressed while it is on.
   * Omitted by a host that cannot say, which then draws it unpressed.
   */
  rightToLeft?: boolean;
  /** Its members, read only to block a Picture → non-Picture layout change. */
  members: readonly OfficeSmartArtBlockLike[];
  /**
   * The Office alias it is drawn as, when the host keeps that on the diagram
   * rather than on every member (the Docs group); else read off the members.
   */
  layoutUrn?: string | null;
  /** False disables every command that would write (read-only page, lock, …). */
  writable: boolean;
  /** Whether the diagram has an outline at all (gates the Text Pane toggle). */
  hasOutline: boolean;
  textPaneOpen: boolean;
  canPromote: boolean;
  canDemote: boolean;
  /**
   * The diagram's picture slots ({@link smartArtPictureSlots}), in member
   * order. Empty or omitted and no picture command is drawn at all, which is
   * every non-picture layout and every host that does not offer one.
   */
  pictureSlots?: readonly SmartArtPictureSlot[];
  /**
   * Fill or replace ONE slot. The host opens its own file picker — this tab
   * owns no state and no transaction — reads the file through
   * {@link readSmartArtPictureFile}, and writes the `src` onto that member in
   * one undo step.
   */
  onPickPicture?: (slot: SmartArtPictureSlot) => void;
  onToggleTextPane: () => void;
  onPromote: () => void;
  onDemote: () => void;
  onRightToLeft: () => void;
  /**
   * Change Layout: `layoutUrn` is the aligned Office alias picked (its own
   * gallery entry), `null` a catalog layout -- which gives that real layout.
   */
  onChangeLayout: (kind: SmartArtKind, layoutUrn?: string | null) => void;
  /**
   * Change Colors: the diagram's colour set, and each item's own fill and line
   * when the variation paints the shapes in turn (Colorful, Gradient Range).
   */
  onChangeColors: (
    colors: SmartArtStyle,
    nodePaint?: readonly SmartArtNodePaint[],
    /** The variation picked, by Office's id, for a host that records it. */
    variantId?: string,
  ) => void;
  /**
   * The colour variation the diagram wears (Office's id), checked in the
   * Change Colors gallery. Omitted by a host that does not record one.
   */
  colorsId?: string | null;
  /**
   * The colour set the diagram wears, resolved on the host's theme: the
   * Styles gallery's tiles are drawn in it, as PowerPoint's are (a tile
   * without it is drawn in the default blue; acceptance finding 8).
   */
  colors?: SmartArtStyle;
  onChangeStyle: (styleId: SmartArtStyleId) => void;
  onReset: () => void;
  /** `trigger` is the element focus returns to when the dialog closes. */
  onAltText: (trigger: HTMLElement | null) => void;
  /**
   * What the selected item accepts ({@link smartArtOutlineCommandState}); the
   * right-click menu reads the same object, so the two never disagree.
   */
  commands?: SmartArtOutlineCommandState;
  /** Add Shape After / Before / Above / Below; absent, no Add Shape is drawn. */
  onAddShape?: (position: SmartArtOutlineInsertPosition) => void;
  /**
   * Layout on an organization chart (Standard / Both / Left Hanging / Right
   * Hanging) for the selected box; absent, no Layout menu is drawn.
   */
  onOrgChartLayout?: (branch: SmartArtHierBranch) => void;
  /** The selected box's own Layout, checked in the menu; absent: Standard. */
  selectedHierBranch?: SmartArtHierBranch | null;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /**
   * Reset > Convert. PowerPoint has both entries, Excel has Convert to Shapes
   * only and Word has neither (Microsoft Support, "Convert your SmartArt
   * graphic into shapes"), so a host passes exactly the ones its Office app
   * has and the menu is not drawn when it passes none.
   */
  onConvertToShapes?: () => void;
  onConvertToText?: () => void;
  /**
   * SmartArt Format > Shapes > Larger / Smaller on the selected item: its scale,
   * the graphic laid out again around it (`smartArtMembersWithItemScale`).
   * PowerPoint for the web has one SmartArt tab, so
   * the Shapes group sits in it here rather than on a second tab.
   */
  onResizeShape?: (direction: "larger" | "smaller") => void;
  canResizeShape?: boolean;
  /**
   * The selected item is an organization chart's assistant, which is what
   * makes Add Assistant say "select its manager" rather than a generic reason.
   */
  selectedIsAssistant?: boolean;
  /**
   * Whether one shape (outline item) of the diagram is the target of the
   * outline verbs. `false` makes a greyed verb say "select a shape"; omitted,
   * a greyed verb says it does not apply to the selected shape.
   */
  hasSelectedItem?: boolean;
}

/** What a diagram's tab says of it, without the commands that leave it. */
export type OfficeSmartArtDesignTabDiagramState = Omit<
  OfficeSmartArtDesignTabDiagram,
  | "onToggleTextPane"
  | "onPromote"
  | "onDemote"
  | "onRightToLeft"
  | "onChangeLayout"
  | "onChangeColors"
  | "onChangeStyle"
  | "onReset"
  | "onAltText"
>;

/** The selected NATIVE (preserved) diagram — the pre-conversion surface. */
export interface OfficeSmartArtDesignTabPreserved {
  /** Offer "convert to editable" (the author picks the catalog layout). */
  convertible: boolean;
  /** The diagram MRAI edits in place through its native text receipt. */
  nativeEditing: boolean;
  /**
   * Why this diagram's text cannot be edited, already translated. Present
   * only when `nativeEditing` is false AND the reason is known — an Office
   * diagram still holding its `[Text]` prompts has no text in the file to
   * change. Edit Text is then SHOWN and disabled carrying this reason, so an
   * author reads why instead of finding nothing to type into.
   */
  textBlockedReason?: string | null;
  /** False disables the convert gallery (read-only page). */
  writable: boolean;
  /**
   * Why converting this diagram into a PICTURE layout cannot work from here,
   * already translated — the diagram carries pictures and there is no saved
   * page to read them out of (the guest preview), so the request the command
   * would make could only fail.
   *
   * Present, the picture layouts of the 转换为可编辑 gallery are SHOWN and
   * disabled carrying this reason, the same move `textBlockedReason` makes for
   * Edit Text and Change Layout makes for a Picture layout a pictured diagram
   * may not become. Office greys a command out; it does not offer one that
   * must do nothing. Every non-picture layout stays offered, because it
   * converts with no request at all.
   */
  pictureConversionBlockedReason?: string | null;
  textPaneOpen: boolean;
  canAdd: boolean;
  canPromote: boolean;
  canDemote: boolean;
  /**
   * Move Up / Move Down, where the host can rewrite the package's point
   * order (a flat flow it lays out itself). Omitted: the pair is not drawn.
   */
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onConvert: (kind: SmartArtKind) => void;
  onToggleTextPane: () => void;
  onAddShape: () => void;
  onPromote: () => void;
  onDemote: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export interface OfficeSmartArtDesignTabProps {
  /** `"presentation"` → `presentation-ribbon-smartart-…`, and so on. */
  testIdPrefix: string;
  /**
   * The ribbon token every group of this tab carries (`data-ribbon`). A host
   * whose strip collects its contextual groups by that token (Docs' strip
   * keeps only the children whose `ribbon` names the active tab) mounts this
   * element DIRECTLY in its track with `ribbon="smartArt"` — never through a
   * `display: contents` wrapper, which takes the groups out of the track's
   * `.note-editor-ribbon-track > .note-editor-office-toolbar__group` anatomy
   * (column flex, caption under the commands) and leaves them as row flex
   * boxes whose caption lands beside or over the commands. Defaults to the
   * shared group's own `"home"`.
   */
  ribbon?: string;
  /** Which editor's gallery chrome to wear. */
  application: "docs" | "spreadsheet" | "presentation";
  labels: OfficeSmartArtDesignTabLabels;
  diagram: OfficeSmartArtDesignTabDiagram | null;
  preserved: OfficeSmartArtDesignTabPreserved | null;
  classes?: Partial<OfficeSmartArtDesignTabClasses>;
  /** The host's control-id vocabulary, where it has one. */
  controlIds?: { colors?: string };
  /** Focus returns here when the text pane closes. */
  textPaneTriggerRef?: RefObject<HTMLButtonElement | null>;
  /** The words the host's insert seeds (`useOfficeSmartArtPlaceholders`). */
  placeholders?: OfficeSmartArtPlaceholders;
  /** The frame the host's insert lays a diagram out in (a deck's slide). */
  previewBounds?: { width: number; height: number };
  /** Draw one style-tile shape the host's way; omitted, the shared preset. */
  renderStyleShape?: (node: OfficeSmartArtShapeNode) => ReactNode;
  /**
   * The document's theme colours, which Change Colors resolves its variations
   * against (a deck's or a workbook's accents); omitted, Office's own theme.
   */
  colorTheme?: Partial<SmartArtColorTheme> | null;
  /**
   * The Change Colors gallery's groups. Omitted, the list the Docs and
   * worksheet hosts ship (`OFFICE_SMARTART_COLOR_GROUPS`); the deck passes
   * PowerPoint's whole gallery (`OFFICE_SMARTART_POWERPOINT_COLOR_GROUPS`).
   */
  colorGroups?: readonly SmartArtColorGroup[];
}

/**
 * Add Shape's four positions in Office's menu order, each with its label and
 * whether the selected item accepts it. The Design tab's split button and the
 * right-click Add Shape submenu both render this list.
 */
export function officeSmartArtAddShapeEntries(
  labels: Pick<
    OfficeSmartArtDesignTabLabels,
    "addShapeAfter" | "addShapeBefore" | "addShapeAbove" | "addShapeBelow"
  >,
  commands: SmartArtOutlineCommandState,
): { position: SmartArtOutlineInsertPosition; label: string; enabled: boolean }[] {
  return [
    { position: "after", label: labels.addShapeAfter ?? "", enabled: commands.addAfter },
    { position: "before", label: labels.addShapeBefore ?? "", enabled: commands.addBefore },
    { position: "above", label: labels.addShapeAbove ?? "", enabled: commands.addAbove },
    { position: "below", label: labels.addShapeBelow ?? "", enabled: commands.addBelow },
  ];
}

/**
 * Why Add Assistant is greyed, or `undefined` when it is offered. Office has
 * it on organization charts only; on one, it is refused where the selected
 * shape is itself an assistant (an assistant has no assistant of its own) and
 * otherwise for the host's own reason (`fallback`: read-only, nothing
 * selected, the layout's capacity).
 */
export function officeSmartArtAssistantReason(
  labels: Pick<
    OfficeSmartArtDesignTabLabels,
    "addAssistantUnavailable" | "addAssistantNotOrgChart"
  >,
  kind: SmartArtKind,
  enabled = false,
  selectedIsAssistant = false,
  fallback?: string,
): string | undefined {
  if (!smartArtLayoutHasAssistant(kind)) return labels.addAssistantNotOrgChart;
  if (enabled) return undefined;
  return selectedIsAssistant ? labels.addAssistantUnavailable : fallback;
}
