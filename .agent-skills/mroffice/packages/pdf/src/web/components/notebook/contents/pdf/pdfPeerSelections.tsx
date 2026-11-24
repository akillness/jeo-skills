"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Who has what selected on a PDF page: each member's selection -- a placed
 * object's frame, a text box, the line of the page's text being edited --
 * shown to the others as a frame in that member's colour with their name,
 * as ONLYOFFICE and Office show a co-author's selection. It travels on the
 * page room's presence (y-protocols awareness, never stored), beside the
 * live transforms and live ink (pdfLiveTransform, ink-live-presence).
 *
 * Wire (top-level awareness field `psel`):
 *
 *     psel: { v: 1, s: "pdf:<pageId>:<page number>", k: key, b: [x, y, w, h],
 *             e?: { t: text, f: font size, c: "#RRGGBB", w?: 1, i?: 1 } } | null
 *
 * the box in page per-mille, measured from what this desk draws as selected
 * (the frame's element), so every kind of selection is told the same way.
 * While the member types (a page line in its editor, a text box being
 * written), `e` carries the words as they stand and their look (the font
 * size in per-mille of the page's height): the others see them typed, live,
 * where they will land, as ONLYOFFICE shows a co-author's typing. Nothing of
 * it is stored; the words reach the document by the member's own save.
 */
import { useEffect, useReducer, type RefObject } from "react";
import type { Awareness } from "y-protocols/awareness";

import { sanitizeCollabUser } from "@mrnote/core/web/lib/collab/collab-state.ts";

export const PDF_SELECTION_PRESENCE_FIELD = "psel";
const PER_MILLE = 1000;
/** How often a selection's frame is measured again (it may be dragged). */
const MEASURE_MS = 400;

/** The most words of a member's typing carried live. */
const MAX_TYPED = 2000;

interface PdfTypedPresence {
  readonly t: string;
  readonly f: number;
  readonly c: string;
  readonly w?: 1;
  readonly i?: 1;
}

interface PdfSelectionPresence {
  readonly v: 1;
  readonly s: string;
  readonly k: string;
  readonly b: readonly [number, number, number, number];
  readonly e?: PdfTypedPresence;
}

function decodeTyped(value: unknown): PdfTypedPresence | undefined {
  if (!value || typeof value !== "object") return undefined;
  const typed = value as Record<string, unknown>;
  if (typeof typed.t !== "string" || typed.t.length > MAX_TYPED ||
    typeof typed.f !== "number" || !Number.isFinite(typed.f) || typed.f <= 0 || typed.f > 400 ||
    typeof typed.c !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(typed.c) ||
    (typed.w !== undefined && typed.w !== 1) || (typed.i !== undefined && typed.i !== 1)) return undefined;
  return { t: typed.t, f: typed.f, c: typed.c, ...(typed.w ? { w: 1 as const } : {}), ...(typed.i ? { i: 1 as const } : {}) };
}

function decode(value: unknown): PdfSelectionPresence | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.v !== 1 || typeof record.s !== "string" || record.s.length > 160 ||
    typeof record.k !== "string" || record.k.length > 120 || !Array.isArray(record.b) || record.b.length !== 4 ||
    !record.b.every((n) => typeof n === "number" && Number.isFinite(n) && n >= -PER_MILLE && n <= 2 * PER_MILLE)) {
    return null;
  }
  const typed = decodeTyped(record.e);
  return { v: 1, s: record.s, k: record.k, b: record.b as unknown as PdfSelectionPresence["b"], ...(typed ? { e: typed } : {}) };
}

function hexOf(color: string): string | null {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (!match) return /^#[0-9A-Fa-f]{6}$/.test(color) ? color.toUpperCase() : null;
  return `#${match.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** What the member is typing in `element` (a page line's draft, a text box
 * being written): its words and their look, or nothing when it is only
 * selected. */
function typedIn(element: HTMLElement, key: string, pageHeight: number): PdfTypedPresence | undefined {
  const source = key === "text-line" ? element
    : element.querySelector<HTMLElement>('[contenteditable="true"]');
  if (!source || (key !== "text-line" && !source.contains(document.activeElement))) return undefined;
  const words = (source.innerText ?? source.textContent ?? "").replace(/\u00a0/g, " ");
  // The first run's look stands for the words (a part formatted otherwise is
  // shown in it until the member saves).
  const styled = source.querySelector<HTMLElement>("span") ?? source;
  const style = window.getComputedStyle(styled);
  const size = Number.parseFloat(style.fontSize);
  const color = hexOf(style.color) ?? "#000000";
  if (!(size > 0) || !(pageHeight > 0)) return undefined;
  return {
    t: words.slice(0, MAX_TYPED),
    f: Math.round((size / pageHeight) * PER_MILLE * 100) / 100,
    c: color,
    ...(Number.parseInt(style.fontWeight, 10) >= 600 ? { w: 1 as const } : {}),
    ...(style.fontStyle === "italic" || style.fontStyle === "oblique" ? { i: 1 as const } : {}),
  };
}

export function pdfSelectionSurface(pageId: string, pageNumber: number): string {
  return `pdf:${pageId}:${pageNumber}`;
}

/** What this desk draws as selected under `root`, and its key. */
function selectedElement(root: HTMLElement): { element: HTMLElement; key: string } | null {
  const frame = root.querySelector<HTMLElement>("[data-pdf-annotation-frame]");
  if (frame) return { element: frame, key: `object:${frame.getAttribute("data-testid") ?? "frame"}` };
  const box = root.querySelector<HTMLElement>("[data-box-id][data-selected='true']");
  if (box) return { element: box, key: `textbox:${box.getAttribute("data-box-id")}` };
  const line = root.querySelector<HTMLElement>("[data-pdf-native-text-visual-draft='true']");
  if (line) return { element: line, key: "text-line" };
  return null;
}

/**
 * Publishes this member's selection under `rootRef` (the pages) on `room`'s
 * presence while it lasts; cleared when nothing is selected or the viewer
 * goes.
 */
export function usePdfSelectionPresence(
  room: Readonly<{ pageId: string; awareness: Awareness | null; sends: boolean }> | null | undefined,
  rootRef: RefObject<HTMLElement | null>,
): void {
  const awareness = room?.sends ? room.awareness : null;
  const pageId = room?.pageId ?? null;
  useEffect(() => {
    if (!awareness || !pageId) return;
    let last = "";
    const publish = (value: PdfSelectionPresence | null) => {
      const encoded = JSON.stringify(value);
      if (encoded === last) return;
      last = encoded;
      try {
        awareness.setLocalStateField(PDF_SELECTION_PRESENCE_FIELD, value);
      } catch {
        // A closed room takes nothing; the next one starts clean.
      }
    };
    const measure = () => {
      const root = rootRef.current;
      const found = root ? selectedElement(root) : null;
      const page = found?.element.closest<HTMLElement>(".pdf-viewer__page[data-page-number]") ?? null;
      const pageNumber = Number(page?.getAttribute("data-page-number"));
      if (!found || !page || !Number.isInteger(pageNumber) || pageNumber < 1) {
        publish(null);
        return;
      }
      const pageRect = page.getBoundingClientRect();
      const rect = found.element.getBoundingClientRect();
      if (!(pageRect.width > 0 && pageRect.height > 0)) return;
      const round = (value: number) => Math.round(value * PER_MILLE);
      const typed = typedIn(found.element, found.key.startsWith("textbox:") ? "textbox" : found.key, pageRect.height);
      publish({
        v: 1,
        s: pdfSelectionSurface(pageId, pageNumber),
        k: found.key,
        b: [
          round((rect.left - pageRect.left) / pageRect.width),
          round((rect.top - pageRect.top) / pageRect.height),
          round(rect.width / pageRect.width),
          round(rect.height / pageRect.height),
        ],
        ...(typed ? { e: typed } : {}),
      });
    };
    measure();
    const timer = window.setInterval(measure, MEASURE_MS);
    // A key typed is told at once (within a frame), not at the next measure.
    let typedFrame = 0;
    const onInput = () => {
      if (typedFrame) return;
      typedFrame = window.requestAnimationFrame(() => { typedFrame = 0; measure(); });
    };
    const root = rootRef.current;
    root?.addEventListener("input", onInput, true);
    root?.addEventListener("keyup", onInput, true);
    return () => {
      window.clearInterval(timer);
      if (typedFrame) window.cancelAnimationFrame(typedFrame);
      root?.removeEventListener("input", onInput, true);
      root?.removeEventListener("keyup", onInput, true);
      publish(null);
    };
  }, [awareness, pageId, rootRef]);
}

/** The other members' selections on one page, drawn over it. */
export function PdfPeerSelections({
  awareness,
  pageId,
  pageNumber,
}: {
  readonly awareness: Awareness | null | undefined;
  readonly pageId: string | null | undefined;
  readonly pageNumber: number;
}) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    if (!awareness) return;
    // Another member's state only: this member's own selection and typing
    // (published on every key) re-rendered every page's layer each key.
    const onChange = (event: { added: number[]; updated: number[]; removed: number[] }) => {
      const own = awareness.clientID;
      if ([...event.added, ...event.updated, ...event.removed].some((clientId) => clientId !== own)) refresh();
    };
    awareness.on("change", onChange);
    return () => awareness.off("change", onChange);
  }, [awareness]);
  if (!awareness || !pageId) return null;
  const surface = pdfSelectionSurface(pageId, pageNumber);
  const peers: { clientId: number; box: readonly number[]; name: string; color: string; typed?: PdfTypedPresence }[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return;
    const record = state as Record<string, unknown> | undefined;
    const selection = decode(record?.[PDF_SELECTION_PRESENCE_FIELD]);
    if (!selection || selection.s !== surface) return;
    const user = sanitizeCollabUser((record?.user ?? {}) as { id?: unknown; name?: unknown; color?: unknown });
    peers.push({ clientId, box: selection.b, name: user.name, color: user.color, typed: selection.e });
  });
  if (peers.length === 0) return null;
  return (
    <div className="pdf-viewer__peer-selections" aria-hidden="true" data-testid="pdf-peer-selections">
      {peers.map((peer) => (
        <div
          key={peer.clientId}
          className="pdf-viewer__peer-selection"
          data-testid="pdf-peer-selection"
          style={{
            left: `${peer.box[0] / 10}%`,
            top: `${peer.box[1] / 10}%`,
            width: `${peer.box[2] / 10}%`,
            height: `${peer.box[3] / 10}%`,
            borderColor: peer.color,
          }}
        >
          {peer.typed ? (
            // What they are typing, live, over what the page shows there.
            <div
              className="pdf-viewer__peer-typing"
              data-testid="pdf-peer-typing"
              data-font-permille={peer.typed.f}
              style={{
                // Per-mille of the page's height: the layer is the page's size.
                fontSize: `${peer.typed.f / 10}cqh`,
                color: peer.typed.c,
                fontWeight: peer.typed.w ? 700 : undefined,
                fontStyle: peer.typed.i ? "italic" : undefined,
              }}
            >
              {peer.typed.t}
            </div>
          ) : null}
          <span className="pdf-viewer__peer-selection-name" style={{ background: peer.color }}>{peer.name}</span>
        </div>
      ))}
    </div>
  );
}
