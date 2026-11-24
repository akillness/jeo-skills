"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo, useLayoutEffect, type CSSProperties } from "react";

import { sameJsonValue } from "@mrnote/core/web/lib/same-json-value.ts";
import { resolveBandFieldTokens, type BandRichBlock } from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import type { BandTokenContext } from "@mrnote/core/web/components/console/editor/native-document/paged/bandRichDom.ts";
import BandRichView from "./BandRichView";
import { announceBandLayerDrawn } from "@mrnote/core/web/components/console/editor/native-document/paged/bandObjectHoles.ts";

export interface SheetBandBoxViewProps {
  index: number;
  className: string;
  style: CSSProperties;
  headerRich: BandRichBlock[] | null;
  footerRich: BandRichBlock[] | null;
  headerBandText: string | null;
  footerBandText: string | null;
  context: BandTokenContext;
  footerContext: BandTokenContext;
}

/**
 * One sheet's painted header and footer. The overlay builds every sheet's on
 * each change it sees (a long document: every Enter, 94 sheets); a sheet
 * whose band, place and page numbers are what they were is not drawn again
 * (its inputs are compared by value, JSON once per object).
 */
function SheetBandBoxViewImpl({
  index,
  className,
  style,
  headerRich,
  footerRich,
  headerBandText,
  footerBandText,
  context,
  footerContext,
}: SheetBandBoxViewProps) {
  // Drawn anew, the band is cut again around the body objects over it.
  useLayoutEffect(() => {
    announceBandLayerDrawn();
  });
  return (
    <div data-band-sheet-index={index} className={className} style={style}>
      {headerRich ? (
        <BandRichView blocks={headerRich} context={context} className="sheet-band-box__header" />
      ) : headerBandText ? (
        <div className="sheet-band-box__header">
          <div className="sheet-band-rich sheet-band-rich--text">
            {resolveBandFieldTokens(headerBandText, context)}
          </div>
        </div>
      ) : null}
      {footerRich ? (
        <BandRichView blocks={footerRich} context={footerContext} className="sheet-band-box__footer" />
      ) : footerBandText ? (
        <div className="sheet-band-box__footer">
          <div className="sheet-band-rich sheet-band-rich--text">
            {resolveBandFieldTokens(footerBandText, footerContext)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The page fields a band draws ("PAGE", "NUMPAGES"), read once per object. */
const richFields = new WeakMap<object, { page: boolean; total: boolean }>();
function bandFields(rich: BandRichBlock[] | null, text: string | null): { page: boolean; total: boolean } {
  if (rich) {
    const known = richFields.get(rich);
    if (known) return known;
    const json = JSON.stringify(rich);
    const fields = { page: json.includes('"token":"PAGE"'), total: json.includes('"token":"NUMPAGES"') };
    richFields.set(rich, fields);
    return fields;
  }
  return { page: Boolean(text?.includes("{PAGE}")), total: Boolean(text?.includes("{NUMPAGES}")) };
}

/**
 * Contexts alike for what the band draws. While a long document is laid out
 * its page count changes on every pass, and a context compared whole drew
 * every sheet's header and footer again each time, though only a band with a
 * NUMPAGES field shows the count (a PAGE field, its own number).
 */
function sameBandContext(previous: BandTokenContext, next: BandTokenContext, fields: { page: boolean; total: boolean }): boolean {
  if (previous === next) return true;
  if (fields.total && previous.totalPages !== next.totalPages) return false;
  if (fields.page && (previous.pageLabel !== next.pageLabel || previous.pageNumberValue !== next.pageNumberValue)) return false;
  // Key by key: each value (the document's styles, the cached fields) is a
  // shared object whose JSON is computed once; a copy of the whole context
  // was serialized again on every comparison (about 1 s per 40 s of the
  // 298-page book's background layout).
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    if (key === "totalPages" || key === "pageLabel" || key === "pageNumberValue") continue;
    if (!sameJsonValue(previous[key as keyof BandTokenContext], next[key as keyof BandTokenContext])) return false;
  }
  return true;
}

function sameProps(previous: SheetBandBoxViewProps, next: SheetBandBoxViewProps): boolean {
  return (
    previous.index === next.index &&
    previous.className === next.className &&
    previous.headerBandText === next.headerBandText &&
    previous.footerBandText === next.footerBandText &&
    sameJsonValue(previous.style, next.style) &&
    sameJsonValue(previous.headerRich, next.headerRich) &&
    sameJsonValue(previous.footerRich, next.footerRich) &&
    sameBandContext(previous.context, next.context, bandFields(next.headerRich, next.headerBandText)) &&
    sameBandContext(previous.footerContext, next.footerContext, bandFields(next.footerRich, next.footerBandText))
  );
}

const SheetBandBoxView = memo(SheetBandBoxViewImpl, sameProps);
export default SheetBandBoxView;
