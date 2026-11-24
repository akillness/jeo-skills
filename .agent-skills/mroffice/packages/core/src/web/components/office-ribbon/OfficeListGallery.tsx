"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { Fragment, useRef, type ReactNode } from "react";

import { RibbonDropdownMenuContent } from "./CupertinoRibbonMenu";

export type OfficeListGalleryVariant = "bullets" | "numbering";

/** Shared numbered-list miniature used by Docs and Presentation galleries. */
export function OfficeListGalleryPreview({
  markers,
}: {
  markers: readonly string[];
}) {
  return (
    <svg viewBox="0 0 92 48" role="presentation" aria-hidden>
      {markers.slice(0, 3).map((marker, index) => {
        const y = 10 + index * 14;
        return (
          <Fragment key={`${marker}-${index}`}>
            <text
              x="2"
              y={y + 3}
              fill="currentColor"
              fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
              fontSize="8"
            >
              {marker}
            </text>
            <line
              x1="24"
              y1={y}
              x2={index === 1 ? "76" : "88"}
              y2={y}
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              opacity="0.66"
            />
          </Fragment>
        );
      })}
    </svg>
  );
}

/** Fixed-cell radio tile with the gallery's shared two-dimensional keyboard. */
export function OfficeListGalleryTile({
  active,
  columns,
  label,
  onSelect,
  preview,
  testId,
}: {
  active?: boolean;
  columns: number;
  label: string;
  onSelect: () => void;
  preview: ReactNode;
  testId: string;
}) {
  const pointerHandledRef = useRef(false);

  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={Boolean(active)}
      aria-label={label}
      className={`docs-home-gallery-menu__tile${active ? " is-active" : ""}`}
      data-testid={testId}
      onMouseDown={(event) => {
        event.preventDefault();
        if (event.button !== 0) return;
        pointerHandledRef.current = true;
        onSelect();
      }}
      onClick={() => {
        if (pointerHandledRef.current) {
          pointerHandledRef.current = false;
          return;
        }
        onSelect();
      }}
      onKeyDown={(event) => {
        const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
        if (
          !keys.includes(event.key) &&
          event.key !== "Home" &&
          event.key !== "End"
        ) {
          return;
        }
        const grid = event.currentTarget.closest(
          ".docs-home-gallery-menu__grid",
        );
        const items = grid
          ? Array.from(
              grid.querySelectorAll<HTMLButtonElement>(
                ".docs-home-gallery-menu__tile:not(:disabled)",
              ),
            )
          : [];
        const index = items.indexOf(event.currentTarget);
        if (index < 0 || items.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const delta =
          event.key === "ArrowLeft"
            ? -1
            : event.key === "ArrowRight"
              ? 1
              : event.key === "ArrowUp"
                ? -columns
                : event.key === "ArrowDown"
                  ? columns
                  : 0;
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : Math.max(0, Math.min(items.length - 1, index + delta));
        items[nextIndex]?.focus();
      }}
    >
      <span className="docs-home-gallery-menu__preview">{preview}</span>
      <span className="docs-home-gallery-menu__label">{label}</span>
    </button>
  );
}

/**
 * Shared Cupertino popup chassis. Editors own only their truthful catalog and
 * command callbacks; geometry, roles, keyboard tiles, headings, and footer
 * placement remain one Office surface.
 */
export function OfficeListGalleryMenuContent({
  afterGallery,
  children,
  footer,
  heading,
  variant,
}: {
  afterGallery?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  heading: ReactNode;
  variant: OfficeListGalleryVariant;
}) {
  return (
    <RibbonDropdownMenuContent
      align="start"
      className={`docs-home-gallery-menu docs-home-gallery-menu--${variant}`}
    >
      <div className="docs-home-gallery-menu__section">
        <div className="docs-home-gallery-menu__heading">{heading}</div>
        <div className="docs-home-gallery-menu__grid">{children}</div>
      </div>
      {afterGallery}
      {footer ? (
        <div className="docs-home-gallery-menu__footer">{footer}</div>
      ) : null}
    </RibbonDropdownMenuContent>
  );
}
