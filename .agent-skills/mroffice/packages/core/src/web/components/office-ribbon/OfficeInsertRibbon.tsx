/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Shared Insert-ribbon band for every native editor.
 *
 * Command authority stays in each editor adapter. This component owns the
 * physical contract that must not drift between Docs, Spreadsheet,
 * Presentation and PDF: the same full-width band as Home, intrinsic groups,
 * one caption rail, stable large/compact command boxes and real overflow.
 */

import { type CSSProperties, type RefObject, useLayoutEffect, useRef } from "react";

import {
  OfficeRibbonStrip,
  type OfficeRibbonStripProps,
} from "./OfficeRibbonChassis";

import styles from "./OfficeInsertRibbon.module.css";

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/** On a group of an Insert band with no control in it, which the band hides. */
export const OFFICE_RIBBON_GROUP_EMPTY_ATTRIBUTE = "data-office-group-empty";
const RIBBON_CONTROL_SELECTOR = 'button, input, select, [role="button"]';
const BAND_GROUP_SELECTOR =
  ".note-editor-ribbon-body .note-editor-ribbon-track > .note-editor-office-toolbar__group";









export function useEmptyRibbonGroupMarks(surfaceRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const sync = () => {
      for (const group of surface.querySelectorAll(BAND_GROUP_SELECTOR)) {
        group.toggleAttribute(
          OFFICE_RIBBON_GROUP_EMPTY_ATTRIBUTE,
          group.querySelector(RIBBON_CONTROL_SELECTOR) === null,
        );
      }
    };
    sync();
    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(sync);
    observer.observe(surface, { subtree: true, childList: true, attributes: true, attributeFilter: ["role"] });
    return () => observer.disconnect();
  }, [surfaceRef]);
}

export function OfficeInsertRibbonStrip({
  bandHeight = 100,
  className,
  ...props
}: OfficeRibbonStripProps & {
  /** Match the owning editor's Home band exactly. */
  bandHeight?: number;
  className?: string;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  useEmptyRibbonGroupMarks(surfaceRef);
  return (
    <div
      ref={surfaceRef}
      className={classes(styles.surface, className)}
      data-office-insert-surface="true"
      data-testid={
        props.testIdPrefix ? `${props.testIdPrefix}-insert-surface` : undefined
      }
      style={
        {
          "--office-insert-band-height": `${bandHeight}px`,
        } as CSSProperties
      }
    >
      <OfficeRibbonStrip {...props} />
    </div>
  );
}
