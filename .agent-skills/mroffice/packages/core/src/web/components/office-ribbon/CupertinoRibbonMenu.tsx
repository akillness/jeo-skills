"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from "react";

import {
  OfficeFileTypeGlyph,
  type OfficeFileTypeGlyphKind,
} from "./OfficeFileTypeGlyph";

import {
  DropdownMenuContent,
  DropdownMenuSubContent,
} from "../ui/dropdown-menu";
import {
  ExportSceneTrail,
  type ExportSceneKind,
} from "../ui/OptionScenes";

/**
 * Office-ribbon menus are portalled outside their toolbar DOM. Scoping the
 * Cupertino class only on the toolbar therefore never reaches them. These
 * wrappers make the surface part of the component contract, so docs and sheets
 * cannot silently drift by remembering (or forgetting) a CSS class at a call
 * site.
 */
export const RibbonDropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuContent>,
  ComponentPropsWithoutRef<typeof DropdownMenuContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuContent
    ref={ref}
    className={`docs-cupertino-menu${className ? ` ${className}` : ""}`}
    {...props}
  />
));
RibbonDropdownMenuContent.displayName = "RibbonDropdownMenuContent";

export const RibbonDropdownMenuSubContent = forwardRef<
  ElementRef<typeof DropdownMenuSubContent>,
  ComponentPropsWithoutRef<typeof DropdownMenuSubContent>
>(
  (
    {
      className,
      sideOffset = 4,
      alignOffset = -4,
      collisionPadding = 8,
      onFocusOutside,
      ...props
    },
    ref,
  ) => (
    <DropdownMenuSubContent
      ref={ref}
      sideOffset={sideOffset}
      alignOffset={alignOffset}
      collisionPadding={collisionPadding}
      onFocusOutside={(event) => {
        onFocusOutside?.(event);
        // The parent menu takes the focus back from its trigger when it
        // judges the pointer is not heading for the submenu, a judgement made
        // from the last horizontal move inside the parent. A submenu flipped
        // to the left by the window's edge, entered in one move from a
        // trigger approached left to right, was judged "not heading there"
        // and closed under the pointer: its choice never applied (live audit
        // S-155, Change Chart Type). Focus on the parent menu itself is not a
        // choice elsewhere; pointing at another of its items still closes
        // the submenu, by moving the focus to that item.
        const target = event.target;
        if (target instanceof HTMLElement && target.getAttribute("role") === "menu") event.preventDefault();
      }}
      className={`docs-cupertino-menu docs-cupertino-menu--submenu${
        className ? ` ${className}` : ""
      }`}
      {...props}
    />
  ),
);
RibbonDropdownMenuSubContent.displayName = "RibbonDropdownMenuSubContent";


/**
 * A described row inside a Cupertino menu: a tinted glyph tile, the entry's
 * plain name with one line of detail under it (what the file holds, or why
 * the entry cannot run right now), and a trailing badge such as the file
 * extension. The sheet's Export menu draws its formats with it; the grammar
 * lives in note-editor.css as `docs-cupertino-menu__rich-*`, so any editor's
 * menu can use the same rows.
 */
export type RibbonMenuRichRowTone =
  | "workbook"
  | "table"
  | "document"
  | "web"
  | "image"
  | "slides"
  | "word"
  | "markdown"
  | "text"
  | "cad"
  | "code";

/** The tone a file-type glyph's tile takes when the caller names none. */
const FILE_TYPE_TONE: Record<OfficeFileTypeGlyphKind, RibbonMenuRichRowTone> = {
  workbook: "workbook",
  csv: "table",
  pdf: "document",
  html: "web",
  image: "image",
  slides: "slides",
  word: "word",
  markdown: "markdown",
  text: "text",
  cad: "cad",
  code: "code",
};

/** The hover scene an export row plays for its file type (OptionScenes);
 * a source file, a run receipt or a drawing has none. */
const FILE_TYPE_SCENE: Record<OfficeFileTypeGlyphKind, ExportSceneKind | null> = {
  workbook: "xlsx",
  csv: "csv",
  pdf: "pdf",
  html: "html",
  image: "image",
  slides: "pptx",
  word: "docx",
  markdown: "markdown",
  text: "text",
  cad: null,
  code: null,
};

export type RibbonMenuRichRowProps = {
  tone?: RibbonMenuRichRowTone;
  /** A file-type page glyph (OfficeFileTypeGlyph); sets the tone too. */
  fileType?: OfficeFileTypeGlyphKind;
  /** Any other glyph, when the row is not a file. */
  icon?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  /** The detail explains why the entry is unavailable; it is tinted to say so. */
  blocked?: boolean;
  /** A test id for the detail line, for callers whose tests read it. */
  detailTestId?: string;
  badge?: ReactNode;
  /**
   * An export row: while it is hovered or focused, a small scene of the
   * page becoming the file takes the badge's place. `true` picks the scene
   * from `fileType`; a kind names it outright.
   */
  hoverScene?: boolean | ExportSceneKind;
};

export function RibbonMenuRichRow({
  tone,
  fileType,
  icon,
  title,
  detail,
  blocked = false,
  detailTestId,
  badge,
  hoverScene,
}: RibbonMenuRichRowProps) {
  const resolvedTone = tone ?? (fileType ? FILE_TYPE_TONE[fileType] : undefined);
  const sceneKind =
    hoverScene === true
      ? fileType
        ? FILE_TYPE_SCENE[fileType]
        : null
      : hoverScene || null;
  const badgeNode = badge ? (
    <span className="docs-cupertino-menu__rich-badge">{badge}</span>
  ) : null;
  return (
    <>
      <span
        className="docs-cupertino-menu__rich-glyph"
        data-tone={resolvedTone}
        aria-hidden="true"
      >
        {fileType ? <OfficeFileTypeGlyph kind={fileType} /> : icon}
      </span>
      <span className="docs-cupertino-menu__rich-text">
        <span className="docs-cupertino-menu__rich-title">{title}</span>
        {detail ? (
          <span
            className="docs-cupertino-menu__rich-detail"
            data-blocked={blocked ? "true" : undefined}
            data-testid={detailTestId}
          >
            {detail}
          </span>
        ) : null}
      </span>
      {sceneKind ? (
        <ExportSceneTrail kind={sceneKind}>{badgeNode}</ExportSceneTrail>
      ) : (
        badgeNode
      )}
    </>
  );
}
