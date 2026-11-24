"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The More menu of a ribbon gallery, the one every editor draws (Office's
 * Design > Themes / Style Sets sheet): it opens under its gallery, is as wide
 * as its grid and never wider than the window, groups its tiles under section
 * headings, sizes each tile by the gallery's own thumbnail, and keeps its
 * commands below a rule. Built from Word's Style Sets menu in Docs.
 *
 * The parts are thin: a host keeps its own items (a plain item, a radio item)
 * and gives them `officeGalleryMenuStyles.tile` (with `OfficeGalleryMenuTileBody`
 * inside), so selection, preview and test ids stay the host's.
 */

import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties, type ElementRef, type ReactNode } from "react";

import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator } from "../ui/dropdown-menu";

import styles from "./OfficeGalleryMenu.module.css";

export const officeGalleryMenuStyles = styles;

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

/**
 * The menu itself: under its trigger, sized to its content. The surface is
 * the editors' plain menu (Word's Style Sets menu in Docs, which this is).
 */
export const OfficeGalleryMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuContent>,
  ComponentPropsWithoutRef<typeof DropdownMenuContent>
>(({ className, align = "start", collisionPadding = 12, ...props }, ref) => (
  <DropdownMenuContent
    ref={ref}
    align={align}
    collisionPadding={collisionPadding}
    className={classes("note-editor-toolbar-menu", styles.menu, className)}
    data-office-gallery-menu="true"
    {...props}
  />
));
OfficeGalleryMenuContent.displayName = "OfficeGalleryMenuContent";

/** A section heading ("This Document", "Built-In", "Office"). */
export function OfficeGalleryMenuSection({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <DropdownMenuLabel className={classes(styles.section, className)} data-testid={testId}>
      {children}
    </DropdownMenuLabel>
  );
}

/** The CSS custom properties a grid's columns, tile width and gap come from. */
export function officeGalleryMenuGridStyle(
  columns: number,
  tileWidth: number,
  gap?: number,
): CSSProperties {
  return {
    ["--office-gallery-menu-columns" as string]: String(Math.max(1, Math.round(columns))),
    ["--office-gallery-menu-tile-width" as string]: `${Math.max(1, Math.round(tileWidth))}px`,
    ...(gap !== undefined ? { ["--office-gallery-menu-gap" as string]: `${gap}px` } : {}),
  } as CSSProperties;
}

/**
 * A grid of tiles: `columns` columns `tileWidth` px wide (the gallery's own
 * thumbnail plus the tile's padding), never stretched to the menu.
 */
export function OfficeGalleryMenuGrid({
  columns,
  tileWidth,
  gap,
  className,
  style,
  children,
  testId,
  role,
}: {
  columns: number;
  tileWidth: number;
  gap?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  testId?: string;
  role?: string;
}) {
  return (
    <div
      className={classes(styles.grid, className)}
      style={{ ...officeGalleryMenuGridStyle(columns, tileWidth, gap), ...style }}
      data-testid={testId}
      role={role}
    >
      {children}
    </div>
  );
}

/** A tile's body: its thumbnail over its name (omit `name` for a nameless tile). */
export function OfficeGalleryMenuTileBody({
  thumbnail,
  name,
}: {
  thumbnail: ReactNode;
  name?: ReactNode;
}) {
  return (
    <>
      <span className={styles.thumbnail} aria-hidden="true">
        {thumbnail}
      </span>
      {name !== undefined && name !== null ? <span className={styles.name}>{name}</span> : null}
    </>
  );
}

/** The commands below the grid, after a rule. */
export function OfficeGalleryMenuFooter({ children }: { children: ReactNode }) {
  return (
    <>
      <DropdownMenuSeparator />
      {children}
    </>
  );
}
