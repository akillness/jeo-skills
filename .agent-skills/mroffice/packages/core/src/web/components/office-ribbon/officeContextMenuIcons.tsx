"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { ReactNode } from "react";
import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import {
  ALargeSmall,
  ArrowDownAZ,
  ArrowUpAZ,
  BringToFront,
  ClipboardPaste,
  ClipboardType,
  Columns3,
  Copy,
  CopyPlus,
  Crop,
  Eraser,
  Eye,
  EyeOff,
  FilePlus,
  Filter,
  FolderPlus,
  Group,
  History,
  Image as ImageIcon,
  ImagePlus,
  Languages,
  LayoutTemplate,
  Link,
  List,
  ListOrdered,
  Lock,
  Merge,
  MessageSquarePlus,
  MoveHorizontal,
  MoveVertical,
  PaintBucket,
  PaintRoller,
  Palette,
  RefreshCw,
  Pencil,
  Pilcrow,
  Plus,
  Rows3,
  Ruler,
  Scissors,
  Search,
  SendToBack,
  Settings2,
  Sheet,
  Sparkles,
  Split,
  StickyNote,
  Table,
  TableProperties,
  TextSelect,
  Trash2,
  Type,
  Ungroup,
} from "./icons/houseIcons";

/**
 * The icon vocabulary of the shared right-click menus: one monochrome glyph per
 * Office command, drawn at 16px in the menu's icon column so the three editors
 * (and the surfaces inside each) read alike. Office on the web draws these in
 * colour; the product's menus are monochrome, as its ribbons are.
 */
export type OfficeContextMenuIconName =
  | "editPoints"
  | "rerouteConnectors"
  | "cut"
  | "copy"
  | "paste"
  | "pasteSpecial"
  | "insert"
  | "delete"
  | "clear"
  | "filter"
  | "sortAscending"
  | "sortDescending"
  | "sort"
  | "formatCells"
  | "link"
  | "newComment"
  | "newNote"
  | "getData"
  | "copyLink"
  | "showChanges"
  | "rowHeight"
  | "columnWidth"
  | "hide"
  | "unhide"
  | "rename"
  | "duplicate"
  | "tabColor"
  | "protect"
  | "font"
  | "paragraph"
  | "search"
  | "translate"
  | "synonyms"
  | "table"
  | "tableProperties"
  | "insertRows"
  | "insertColumns"
  | "mergeCells"
  | "splitCells"
  | "wrapText"
  | "bringForward"
  | "sendBackward"
  | "group"
  | "ungroup"
  | "crop"
  | "altText"
  | "formatObject"
  | "newSlide"
  | "layout"
  | "addSection"
  | "formatBackground"
  | "picture"
  | "changePicture"
  | "changeShape"
  | "animation"
  | "bullets"
  | "numbering"
  | "ruler"
  | "background"
  | "updateField";

const SIZE = 16;
const STROKE = 1.75;

const ICONS: Record<OfficeContextMenuIconName, () => ReactNode> = {
  cut: () => <Scissors size={SIZE} strokeWidth={STROKE} />,
  copy: () => <Copy size={SIZE} strokeWidth={STROKE} />,
  paste: () => <ClipboardPaste size={SIZE} strokeWidth={STROKE} />,
  pasteSpecial: () => <ClipboardType size={SIZE} strokeWidth={STROKE} />,
  insert: () => <Plus size={SIZE} strokeWidth={STROKE} />,
  delete: () => <Trash2 size={SIZE} strokeWidth={STROKE} />,
  clear: () => <Eraser size={SIZE} strokeWidth={STROKE} />,
  filter: () => <Filter size={SIZE} strokeWidth={STROKE} />,
  sortAscending: () => <ArrowDownAZ size={SIZE} strokeWidth={STROKE} />,
  sortDescending: () => <ArrowUpAZ size={SIZE} strokeWidth={STROKE} />,
  sort: () => <ArrowDownAZ size={SIZE} strokeWidth={STROKE} />,
  formatCells: () => <PaintBucket size={SIZE} strokeWidth={STROKE} />,
  link: () => <Link size={SIZE} strokeWidth={STROKE} />,
  newComment: () => <MessageSquarePlus size={SIZE} strokeWidth={STROKE} />,
  newNote: () => <StickyNote size={SIZE} strokeWidth={STROKE} />,
  getData: () => <TableProperties size={SIZE} strokeWidth={STROKE} />,
  copyLink: () => <Link size={SIZE} strokeWidth={STROKE} />,
  showChanges: () => <History size={SIZE} strokeWidth={STROKE} />,
  rowHeight: () => <MoveVertical size={SIZE} strokeWidth={STROKE} />,
  columnWidth: () => <MoveHorizontal size={SIZE} strokeWidth={STROKE} />,
  hide: () => <EyeOff size={SIZE} strokeWidth={STROKE} />,
  unhide: () => <Eye size={SIZE} strokeWidth={STROKE} />,
  rename: () => <Pencil size={SIZE} strokeWidth={STROKE} />,
  duplicate: () => <CopyPlus size={SIZE} strokeWidth={STROKE} />,
  tabColor: () => <Palette size={SIZE} strokeWidth={STROKE} />,
  protect: () => <Lock size={SIZE} strokeWidth={STROKE} />,
  font: () => <ALargeSmall size={SIZE} strokeWidth={STROKE} />,
  paragraph: () => <Pilcrow size={SIZE} strokeWidth={STROKE} />,
  search: () => <Search size={SIZE} strokeWidth={STROKE} />,
  translate: () => <Languages size={SIZE} strokeWidth={STROKE} />,
  synonyms: () => <TextSelect size={SIZE} strokeWidth={STROKE} />,
  table: () => <Table size={SIZE} strokeWidth={STROKE} />,
  tableProperties: () => <TableProperties size={SIZE} strokeWidth={STROKE} />,
  insertRows: () => <Rows3 size={SIZE} strokeWidth={STROKE} />,
  insertColumns: () => <Columns3 size={SIZE} strokeWidth={STROKE} />,
  mergeCells: () => <Merge size={SIZE} strokeWidth={STROKE} />,
  splitCells: () => <Split size={SIZE} strokeWidth={STROKE} />,
  wrapText: () => <OfficeSemanticIcon semanticId="object.textWrap" size={SIZE} />,
  bringForward: () => <BringToFront size={SIZE} strokeWidth={STROKE} />,
  sendBackward: () => <SendToBack size={SIZE} strokeWidth={STROKE} />,
  group: () => <Group size={SIZE} strokeWidth={STROKE} />,
  ungroup: () => <Ungroup size={SIZE} strokeWidth={STROKE} />,
  crop: () => <Crop size={SIZE} strokeWidth={STROKE} />,
  altText: () => <Type size={SIZE} strokeWidth={STROKE} />,
  formatObject: () => <Settings2 size={SIZE} strokeWidth={STROKE} />,
  newSlide: () => <FilePlus size={SIZE} strokeWidth={STROKE} />,
  layout: () => <LayoutTemplate size={SIZE} strokeWidth={STROKE} />,
  addSection: () => <FolderPlus size={SIZE} strokeWidth={STROKE} />,
  formatBackground: () => <Ruler size={SIZE} strokeWidth={STROKE} />,
  picture: () => <ImageIcon size={SIZE} strokeWidth={STROKE} />,
  changePicture: () => <ImagePlus size={SIZE} strokeWidth={STROKE} />,
  changeShape: () => <OfficeSemanticIcon semanticId="shape.change" size={SIZE} />,
  editPoints: () => <OfficeSemanticIcon semanticId="shape.editPoints" size={SIZE} />,
  rerouteConnectors: () => <OfficeSemanticIcon semanticId="connector.reroute" size={SIZE} />,
  animation: () => <Sparkles size={SIZE} strokeWidth={STROKE} />,
  bullets: () => <List size={SIZE} strokeWidth={STROKE} />,
  numbering: () => <ListOrdered size={SIZE} strokeWidth={STROKE} />,
  ruler: () => <OfficeSemanticIcon semanticId="view.ruler" size={SIZE} />,
  background: () => <PaintRoller size={SIZE} strokeWidth={STROKE} />,
  updateField: () => <RefreshCw size={SIZE} strokeWidth={STROKE} />,
};

/** The glyph for an Office context-menu command, sized for the icon column. */
export function officeContextMenuIcon(name: OfficeContextMenuIconName): ReactNode {
  return ICONS[name]();
}

export { Sheet as OfficeContextMenuSheetIcon };
