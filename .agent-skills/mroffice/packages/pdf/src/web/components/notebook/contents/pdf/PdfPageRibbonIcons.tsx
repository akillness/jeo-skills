/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { CSSProperties } from "react";

import styles from "./PdfPageRibbonTab.module.css";

export type PdfPageRibbonIconSize = 16 | 20 | 24;
export type PdfPageRibbonIconState = "default" | "disabled" | "loading";

interface PdfPageInsertBlankIconProps {
  className?: string;
  size?: PdfPageRibbonIconSize;
  state?: PdfPageRibbonIconState;
}

/**
 * Original MRNote geometry for the PDF Page ribbon. Two offset page sheets
 * communicate page-tree insertion while the compact plus badge keeps the
 * command legible at the supported 16/20/24 px ribbon sizes.
 */
export function PdfPageInsertBlankIcon({
  className,
  size = 24,
  state = "default",
}: PdfPageInsertBlankIconProps) {
  const rootClassName = [styles.icon, className].filter(Boolean).join(" ");

  return (
    <svg
      aria-hidden="true"
      className={rootClassName}
      data-pdf-page-ribbon-icon="insert-blank"
      data-pdf-page-ribbon-icon-size={size}
      data-pdf-page-ribbon-icon-state={state}
      fill="none"
      focusable="false"
      height={size}
      style={{ "--pdf-page-ribbon-icon-size": `${size}px` } as CSSProperties}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className={styles.iconBackPage}
        d="M3.25 5.25h8.5L15 8.5v11.25H3.25z"
      />
      <path className={styles.iconPaper} d="M6.5 2.5h8.25l4 4v14.75H6.5z" />
      <path className={styles.iconFold} d="M14.75 2.5v4h4" />
      <path className={styles.iconGuide} d="M9.25 10.25h6.5M9.25 13h4.25" />
      <circle className={styles.iconBadge} cx="17.75" cy="17.75" r="4" />
      <path className={styles.iconPlus} d="M17.75 15.75v4M15.75 17.75h4" />
    </svg>
  );
}
