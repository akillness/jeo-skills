"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * React wrapper for the shared rich-band DOM builder: the on-screen sheet
 * overlay and the print pipelines render the SAME `buildBandRichDom` output,
 * so a letterhead band cannot differ between screen and paper.
 */

import { useEffect, useLayoutEffect, useRef } from "react";

import type { BandRichBlock } from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import { afterFontsReady } from "@mrnote/core/web/lib/font-face-news.ts";

import { bandMayPassHalfPage, buildBandRichDom, clipBandsToHalfPage, keepBandObjectsOnPaper, layoutBandTabs, paintBandTextWarps, wrapBandTextAroundObjects, type BandTokenContext } from "@mrnote/core/web/components/console/editor/native-document/paged/bandRichDom.ts";









const signatures = new WeakMap<object, string>();
let unsignable = 0;

function signatureOf(value: unknown): string {
  if (value === null || value === undefined || typeof value !== "object") return `${typeof value}:${String(value)}`;
  const known = signatures.get(value);
  if (known !== undefined) return known;
  let signature: string;
  try {
    signature = JSON.stringify(value) ?? "";
  } catch {
    // Not serializable: unique, so it is built as before.
    signature = `\u0000unsignable:${(unsignable += 1)}`;
  }
  signatures.set(value, signature);
  return signature;
}

export default function BandRichView({
  blocks,
  context,
  className,
}: {
  blocks: BandRichBlock[];
  context: BandTokenContext;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // What the band was last built as, before its tabs were laid out.
  const drawnRef = useRef<string | null>(null);
  // The latest inputs, read by the build the keys below decide on.
  const inputsRef = useRef({ blocks, context });
  useLayoutEffect(() => {
    inputsRef.current = { blocks, context };
  });
  const blocksKey = signatureOf(blocks);
  const contextKey = [
    context.pageLabel,
    context.totalPages,
    context.pageNumberValue ?? "",
    signatureOf(context.fields),
    signatureOf(context.styleDefinitions),
    signatureOf(context.wordCompatibilityMode),
  ].join("\u0001");
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Builds the band; true when what it draws differs from what is there.
    const draw = () => {
      const { blocks, context } = inputsRef.current;
      const built = buildBandRichDom(host.ownerDocument, blocks, context);
      // The same band drawn again (a new page count that this band does not
      // show, a style definition it does not use): the one on the page, laid
      // out, stays. Half the rebuilds of a long document's bands on an Enter
      
      const holder = host.ownerDocument.createElement("div");
      holder.appendChild(built.cloneNode(true));
      const drawn = holder.innerHTML;
      if (drawnRef.current === drawn && host.firstChild !== null) return false;
      drawnRef.current = drawn;
      host.replaceChildren(built);
      return true;
    };
    const unchanged = !draw();
    // Tab widths depend on the drawn text, so they follow the fonts and the
    // band's own width; only a band that holds a tab, or an object Word keeps
    // on the paper, is watched.
    const watched = () => ({
      tabs: Boolean(host.querySelector(".sheet-band-rich__p[data-band-tabs], .sheet-band-rich__marker[data-band-marker-tab], [data-band-char-scale]")),
      kept: Boolean(host.querySelector("[data-band-keep-on-paper] [data-band-keep]")),
      // An object the band's own lines go round (`wrapBandTextAroundObjects`).
      wraps: Boolean(host.querySelector("[data-band-wrap]")),
      // A WordArt box whose words are painted bent once laid out
      // (`paintBandTextWarps`).
      warps: Boolean(host.querySelector("[data-band-text-warp]")),
      // A Word 2010 layout band, cut at half its page once laid out
      // (`clipBandsToHalfPage`).
      halves: bandMayPassHalfPage(host),
    });
    const layout = () => {
      const { tabs, kept, wraps, warps, halves } = watched();
      if (tabs) layoutBandTabs(host);
      if (kept) keepBandObjectsOnPaper(host);
      if (wraps || host.querySelector("[data-band-wrap-push]")) wrapBandTextAroundObjects(host);
      if (warps) paintBandTextWarps(host);
      if (halves) clipBandsToHalfPage(host);
    };
    let cancelled = false;
    const fonts = host.ownerDocument.fonts;
    // A line set in a face Word recorded no metrics for takes its height from
    // the face as the browser draws it, read when the band is built: built
    // before the face arrived, the line had the fallback face's height
    // (corpus R21-D04's Noto Sans footer: 19 px lines for Word's 18.24, a
    // page more, depending on how fast the font came). A face arriving
    // builds the band again; a band that draws the same stays as it is.
    const redraw = () => {
      if (!cancelled && draw()) layout();
    };
    // One read of `fonts.ready` for all the bands of a commit, not one each
    // (each read lays the whole document out first: afterFontsReady).
    const stopRedraw = afterFontsReady(host.ownerDocument, redraw);
    fonts?.addEventListener?.("loadingdone", redraw);
    const { tabs, kept, wraps, warps, halves } = watched();
    if (!tabs && !kept && !wraps && !warps && !halves) {
      return () => {
        cancelled = true;
        stopRedraw();
        fonts?.removeEventListener?.("loadingdone", redraw);
      };
    }
    // A band left as it was keeps the layout it has; the watchers below
    // still follow its fonts and size.
    if (!unchanged) layout();
    const relayout = () => {
      if (!cancelled) layout();
    };
    const stopRelayout = afterFontsReady(host.ownerDocument, relayout);
    // A face that arrives later (an Office font asset loaded for this band)
    // changes the text's width without resizing the band.
    fonts?.addEventListener?.("loadingdone", relayout);
    const View = host.ownerDocument.defaultView;
    const observer =
      View && "ResizeObserver" in View ? new View.ResizeObserver(relayout) : null;
    observer?.observe(host);
    // The page a kept object is measured against is placed and sized after
    // the band is built (the band box takes the sheet's place and size, the
    // header band its distance): its changes move the band too.
    const paper = kept ? host.closest<HTMLElement>(".sheet-band-box") : null;
    if (paper) observer?.observe(paper);
    const paperStyle =
      paper && View && "MutationObserver" in View ? new View.MutationObserver(relayout) : null;
    if (paper) paperStyle?.observe(paper, { attributes: true, attributeFilter: ["style"] });
    const frame = kept ? View?.requestAnimationFrame(relayout) : undefined;
    return () => {
      cancelled = true;
      stopRedraw();
      stopRelayout();
      if (frame !== undefined) View?.cancelAnimationFrame(frame);
      paperStyle?.disconnect();
      observer?.disconnect();
      fonts?.removeEventListener?.("loadingdone", redraw);
      fonts?.removeEventListener?.("loadingdone", relayout);
    };
  }, [blocksKey, contextKey]);
  return <div ref={hostRef} className={className} aria-hidden />;
}
