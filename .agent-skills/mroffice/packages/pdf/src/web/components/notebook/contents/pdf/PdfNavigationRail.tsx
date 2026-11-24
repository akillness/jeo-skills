"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useRef, type KeyboardEvent } from "react";
import {
  List,
  PanelLeft,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export type PdfNavigationPanel =
  "thumbnails" | "outline" | "search" | "annotations";

export interface PdfNavigationRailProps {
  activePanel: PdfNavigationPanel | null;
  disabled?: boolean;
  /** Outline can load from the document proxy while longer post-load work runs. */
  outlineAvailable?: boolean;
  onSelect: (panel: PdfNavigationPanel) => void;
}

/**
 * WPS/Acrobat-style navigation rail for the reader's mutually-exclusive
 * left-side panels. Arrow keys move focus without changing panels; Enter/Space
 * activates the focused button through the native button interaction.
 */
export default function PdfNavigationRail({
  activePanel,
  disabled,
  outlineAvailable = false,
  onSelect,
}: PdfNavigationRailProps) {
  const t = useTranslations("console-notebooks");
  
  
  const items = [
    {
      panel: "thumbnails" as const,
      label: t("pdfViewer.thumbnailsPanel"),
      icon: PanelLeft,
    },
    {
      panel: "outline" as const,
      label: t("pdfViewer.outlinePanel"),
      icon: List,
    },
  ];
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = (index + 1) % items.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = (index - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    }
    if (nextIndex == null) return;
    event.preventDefault();
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <nav
      className="pdf-viewer__navigation-rail"
      aria-label={t("outline.title")}
      data-testid="pdf-navigation-rail"
    >
      {items.map(({ panel, label, icon: Icon }, index) => (
        <button
          key={panel}
          ref={(element) => {
            buttonRefs.current[index] = element;
          }}
          type="button"
          className={`pdf-viewer__navigation-rail-button${
            activePanel === panel ? " is-active" : ""
          }`}
          disabled={Boolean(
            disabled && !(panel === "outline" && outlineAvailable),
          )}
          aria-label={label}
          aria-pressed={activePanel === panel}
          title={label}
          onClick={() => onSelect(panel)}
          onKeyDown={(event) => moveFocus(event, index)}
          data-testid={`pdf-navigation-${panel}`}
        >
          <Icon size={16} aria-hidden />
        </button>
      ))}
    </nav>
  );
}
