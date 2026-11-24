/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * When the paged document surface is ready to be looked at: laid out, its
 * faces in and its pictures loaded, with the page count. One effect for the
 * editor (NoteEditor) and the print surface; moved unchanged out of
 * NoteEditor.tsx.
 */
"use client";

import { renderLazyMathNow } from "@mrnote/core/web/components/console/editor/extensions/lazyKatex.ts";
import { useEffect, useLayoutEffect, useRef } from "react";
import { type Transaction } from "@tiptap/pm/state";
import { documentLifecycleLayoutSettled } from "../documentLifecycleObservation";
import { DOCUMENT_ENGINE_FACES_WAITING } from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";
import { createBackgroundLane } from "@mrnote/core/web/lib/background-work.ts";
import { createDocumentLayoutKeep, OUTLINE_INCOMPLETE, readDocumentLayoutOutline, readDocumentLayoutSnapshot } from "@mrnote/core/web/__cut__/m2c7d818b46.ts";
import { mutationInsideOverlayBlock, overlayOnlyDocChange } from "@mrnote/core/web/components/console/editor/native-document/paged/overlayOnlyChange.ts";
import { pagePhysicallyOverflows } from "@mrnote/core/web/components/console/editor/native-document/paged/pageRebalance.ts";
import { PRINT_SHEETS_OVERRUN_REASON } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { editorDom, isUsableEditor, type MaybeNoteEditor } from "./editorRuntime";

// The surface-readiness sampler (the effect that publishes
// DocumentSurfaceReadiness): a change within this long of the person's own
// input in the editor is their editing, and is looked at once the input has
// paused this long. A look is at least three whole-document layout snapshots
// (90 ms a pause in WebKit on a 16-sheet document); at 300 ms a person
// typing a key every 0.7 s paid it for every key.
const SURFACE_READINESS_INPUT_WINDOW_MS = 400;
const SURFACE_READINESS_INPUT_PAUSE_MS = 1_000;
const SURFACE_READINESS_INPUT_EVENTS = [
  "keydown", "beforeinput", "compositionupdate", "pointerdown",
] as const;

/** The boxes (blocks and text lines) the readiness read takes before it
 * calls the layout unmeasured. It carries no boxes anywhere, it only asks
 * whether the whole document is laid out: a 600-page book is 51,400 of them
 * (R442-D01: 7,283 blocks, 44,119 lines). Under the 25,000 of a save's proof
 * (LAYOUT_SNAPSHOT_MAX_RECTANGLES) it was never ready, and its PDF never
 * printed. */
export const SURFACE_READINESS_MAX_RECTANGLES = 1_000_000;

export interface DocumentSurfaceReadiness {
  readonly ready: boolean;
  readonly pageCount: number | null;
}

export interface UseDocumentSurfaceReadinessInputs {
  editor: MaybeNoteEditor;
  editorHydrated: boolean;
  /** The page is still loading (a guest or preview surface never is). */
  autosaveLoading: boolean;
  guestMode: boolean;
  previewMode: boolean;
  /** A print: someone waits on the cue and nothing else runs, so it looks again
   * within half a second, not up to 8 s after the layout has settled; and a
   * formula held as a placeholder of its typeset box is settled (the print copy
   * typesets it). */
  forPrint?: boolean;
  pageId: string;
  guestContentRevision: string | undefined;
  initialContent: Record<string, unknown> | undefined;
  /** Browser layout observation only; never a save/export/delivery receipt. */
  onSurfaceReadinessChange: ((value: DocumentSurfaceReadiness) => void) | undefined;
}









export const SURFACE_READINESS_SLICE_MS = 50;

export function readinessSlicesOn(win: Window | null | undefined): boolean {
  return (win as (Window & { __docsReadinessWhole?: boolean }) | null | undefined)?.__docsReadinessWhole !== true;
}

/** How many times a print reads its sheets past their foot again. */
const PRINT_OVERRUN_READS = 2;

/** How long a print waits for the face files the text engine still waits
 * for (DOCUMENT_ENGINE_FACES_WAITING), from the first look that saw it: one
 * that never comes is printed on the browser's lines after this. */
const PRINT_ENGINE_FACES_WAIT_MS = 15_000;

/** `window.__docsPrintEngineFacesWaitOff = true`: a print takes the pages
 * while the engine still waits for faces, as before (A/B of one build). */
function printEngineFacesWaitOff(win: Window): boolean {
  return (win as Window & { __docsPrintEngineFacesWaitOff?: boolean }).__docsPrintEngineFacesWaitOff === true;
}

export function useDocumentSurfaceReadiness({
  editor,
  editorHydrated,
  autosaveLoading,
  guestMode,
  previewMode,
  forPrint = false,
  pageId,
  guestContentRevision,
  initialContent,
  onSurfaceReadinessChange,
}: UseDocumentSurfaceReadinessInputs): void {
  const surfaceReadinessRef = useRef(onSurfaceReadinessChange);
  useLayoutEffect(() => {
    surfaceReadinessRef.current = onSurfaceReadinessChange;
  }, [onSurfaceReadinessChange]);
  // This is the production body's measured presentation state, deliberately
  // separate from authenticated save ACKs and backend delivery verification.
  useEffect(() => {
    const notify = surfaceReadinessRef.current;
    if (!notify) return;
    let last: DocumentSurfaceReadiness = { ready: false, pageCount: null };
    notify(last);
    if (!isUsableEditor(editor) || !editorHydrated || (!guestMode && autosaveLoading) ||
        (previewMode && initialContent?.type !== "doc")) return;
    const dom = editorDom(editor);
    const ownerWindow = dom?.ownerDocument.defaultView;
    if (!dom || !ownerWindow) return;
    const ownerDocument = dom.ownerDocument;
    let active = true, frame: number | null = null, stable = 0, fingerprint = "";
    let started = ownerWindow.performance.now();
    // Two inputs settle with the passage of time alone, with no mutation,
    // font or load event to restart sampling: a face that never arrives is
    // given up on after SURFACE_FONT_WAIT_MS (6 s, past the 5 s sampling
    // window), and a layout still moving when the window closed. Without a
    // later look such a surface stayed "not ready" for good, and a document
    
    // backed-off re-check (1 s, doubling to 8 s) looks again until it is.
    const longestRecheck = forPrint ? 500 : 8_000;
    let printOverrunReads = 0;
    let printFacesWaitSince: number | null = null;
    let recheck: number | null = null, recheckDelay = forPrint ? 250 : 1_000;
    const recheckLater = () => {
      if (!active || recheck !== null) return;
      recheck = ownerWindow.setTimeout(() => {
        recheck = null;
        if (!active || last.ready || frame !== null || inputPause !== null) return;
        frame = ownerWindow.requestAnimationFrame(sample);
      }, recheckDelay);
      recheckDelay = Math.min(recheckDelay * 2, longestRecheck);
    };
    const publish = (ready: boolean, pageCount: number | null) => {
      if (last.ready === ready && last.pageCount === pageCount) return;
      last = { ready, pageCount };
      surfaceReadinessRef.current?.(last);
    };
    // The looks read the whole document's layout (hundreds of milliseconds
    // on a long one) and restart whenever any window loads a face: they are
    // background work (lib/background-work), held while the person works in
    // another window, run first while they work in this one.
    const readinessLane = createBackgroundLane({
      label: "docs-surface-readiness",
      owner: () => dom.closest(".wm-window") ?? dom,
    });
    // Each look read every block box of every page (and, held still, every
    // line): on the 296-page book seconds a look in WebKit, which lays the
    // whole book out for it. A page nothing changed in since the last look
    // (its sheet, page node and the document-wide layout inputs, as the page
    // ledger measures) gives what it gave then; what that cannot see is
    // forgotten here: a face arriving, the width, the page surface, a picture
    // loading in a page.
    const layoutKeep = createDocumentLayoutKeep(dom);
    const forgetLayout = () => layoutKeep.clear();
    const forgetLoadedSheet = (event: Event) => {
      const target = event.target;
      const sheet = target instanceof Element ? target.closest("article[data-page-sheet]") : null;
      if (sheet && sheet.parentElement === dom) layoutKeep.forget(sheet);
      else layoutKeep.clear();
    };
    const pageSurface = dom.closest<HTMLElement>('[data-testid="note-editor-page-surface"]');
    const surfaceWatch = pageSurface && typeof MutationObserver !== "undefined"
      ? new MutationObserver(forgetLayout)
      : null;
    surfaceWatch?.observe(pageSurface!, { attributes: true, attributeFilter: ["style", "class", "data-doc-grid"] });
    let turnAsked = false;
    const sample = () => {
      frame = null;
      if (!active) return;
      if (readinessLane.tryTurn()) {
        sampleNow();
        return;
      }
      if (turnAsked) return;
      turnAsked = true;
      void readinessLane.turn().then(() => {
        turnAsked = false;
        if (active && frame === null) sampleNow();
      });
    };
    
    let goOnAsked = false;
    const goOn = () => {
      if (goOnAsked) return;
      goOnAsked = true;
      void readinessLane.turn().then(() => {
        goOnAsked = false;
        if (active && frame === null && inputPause === null) sampleNow();
      });
    };
    const sampleNow = () => {
      frame = null;
      if (!active || !isUsableEditor(editor)) return;
      const sliced = readinessSlicesOn(ownerWindow);
      const sliceStart = ownerWindow.performance.now();
      const stop = sliced ? () => ownerWindow.performance.now() - sliceStart >= SURFACE_READINESS_SLICE_MS : undefined;
      // Pending projections already disprove readiness. Let their existing
      // mutation/font/load observers restart sampling instead of forcing a
      // full document layout on every frame while they are still working.
      // A print: the ledger has finished and a formula it never got a box for
      // (drawn anew by its last pass) would hold the cue for good. It is typeset
      // where it stands, as the print copy would.
      if (forPrint && !dom.matches(
        "[data-pagination-initial-settling], [data-pagination-background], [data-pagination-ledger-deferred]",
      )) {
        for (const formula of Array.from(dom.querySelectorAll("[data-math-pending]:not([data-math-layout-ready])"))) {
          renderLazyMathNow(formula);
        }
      }
      if (!dom.isConnected || !documentLifecycleLayoutSettled(dom, { formulaBoxesStand: forPrint }) || dom.matches(
        '[data-docs-word-cjk-spacing-pending="true"], [data-docs-display-fonts-pending="true"], [data-docs-display-fonts-settling="true"]',
      )) {
        stable = 0;
        fingerprint = "";
        publish(false, null);
        recheckLater();
        return;
      }
      // A print waits for the paragraphs the text engine read before a face
      // file it needs came (past the ledger's hold they stand on the browser's
      // lines): R454-D91's server PDF came out three ways in three prints of
      // one build, its paragraphs on the engine's lines or the browser's,
      // whichever it was when the copy was taken.
      if (forPrint && !printEngineFacesWaitOff(ownerWindow) && dom.hasAttribute(DOCUMENT_ENGINE_FACES_WAITING)) {
        printFacesWaitSince ??= ownerWindow.performance.now();
        if (ownerWindow.performance.now() - printFacesWaitSince < PRINT_ENGINE_FACES_WAIT_MS) {
          stable = 0;
          fingerprint = "";
          publish(false, null);
          recheckLater();
          return;
        }
      }
      let ready = false, count: number | null = null;
      try {
        // Holding still is proven on the pages' and blocks' boxes, frame by
        // frame; every line of every page is read once, when they have held
        // still. Reading all of them on each of those frames was four
        // whole-document reads (130 ms each on a 120-page document) after
        // every pause in typing.
        const outline = readDocumentLayoutOutline(editor.view, layoutKeep, stop);
        if (outline === OUTLINE_INCOMPLETE) {
          goOn();
          return;
        }
        stable = outline !== null && outline === fingerprint ? stable + 1 : 0;
        fingerprint = outline ?? "";
        if (stable >= 3) {
          // Kept only while every page is measurable: a layout that is not
          // proves "not ready" either way (readableOnly gives up at once).
          const layout = readDocumentLayoutSnapshot(editor.view, {
            readableOnly: true, keep: layoutKeep, maxRectangles: SURFACE_READINESS_MAX_RECTANGLES, ...(stop ? { stop } : {}),
          });
          if (layout.incomplete) {
            goOn();
            return;
          }
          const measurable = dom.isConnected && layout.measured && layout.physicalPageCount > 0 &&
            documentLifecycleLayoutSettled(dom, { formulaBoxesStand: forPrint }) && !layout.settling && !layout.stalled &&
            layout.fontsReady && layout.imagesReady &&
            // A print takes the pages the ledger finished with. A floating
            // picture past the paper's foot (R286-D01: 13 sheets, 4-16 px) held
            // the cue for good, and the print ran out its 270 s every time.
            (forPrint || layout.overflow.every(value => !pagePhysicallyOverflows(value)));
          // A page past its foot, though: a line a late formula or face made
          // taller since it was read, by a few px, opens a blank page in the
          // print (a 269-page book came out 269, 270 or 271 pages). Its sheets
          // are read again before the print takes them; what still stands past
          // the foot then (a floating picture, a table's head piece) stands so.
          const overrun = forPrint && measurable ? layout.overflow.flatMap((value, index) => pagePhysicallyOverflows(value) ? [index] : []) : [];
          if (overrun.length > 0 && printOverrunReads < PRINT_OVERRUN_READS) {
            printOverrunReads += 1;
            stable = 0;
            ownerWindow.dispatchEvent(new CustomEvent("mrn-page-rebalance", { detail: { reason: PRINT_SHEETS_OVERRUN_REASON, sheets: overrun } }));
          } else if (measurable) {
            ready = true;
            count = layout.physicalPageCount;
          } else {
            stable = 0;
          }
        }
      } catch {
        // A detached/replaced editor is never a layout-ready observation.
        stable = 0;
      }
      publish(ready, count);
      if (ready) return;
      if (ownerWindow.performance.now() - started < 5000) {
        frame = ownerWindow.requestAnimationFrame(sample);
      } else {
        recheckLater();
      }
    };
    // While the person is typing, clicking or moving the caret, every key
    // changes the document and its DOM, and each change used to start the
    // looks over: four whole-document layout reads per keystroke (every
    // block and every line of every page), and as many per arrow key. Nobody
    // asks whether the surface is ready between two keystrokes. A change that
    // follows the person's own input waits until the input pauses; anything
    // else (a page opening, a face arriving, a picture loading, a window
    // growing) is looked at in the next frame, as before.
    let lastInputAt = Number.NEGATIVE_INFINITY;
    let inputPause: number | null = null;
    const noteInput = () => { lastInputAt = ownerWindow.performance.now(); };
    const restart = () => {
      if (!active) return;
      stable = 0;
      recheckDelay = 1_000;
      started = ownerWindow.performance.now();
      publish(false, null);
      if (started - lastInputAt < SURFACE_READINESS_INPUT_WINDOW_MS) {
        if (frame !== null) {
          ownerWindow.cancelAnimationFrame(frame);
          frame = null;
        }
        if (inputPause !== null) ownerWindow.clearTimeout(inputPause);
        inputPause = ownerWindow.setTimeout(() => {
          inputPause = null;
          if (!active) return;
          started = ownerWindow.performance.now();
          if (frame === null) frame = ownerWindow.requestAnimationFrame(sample);
        }, SURFACE_READINESS_INPUT_PAUSE_MS);
        return;
      }
      // The look that follows the input's pause covers this change too.
      if (inputPause !== null) return;
      if (frame === null) frame = ownerWindow.requestAnimationFrame(sample);
    };
    // An object drawn over the text inside a page (a pen stroke, a shape in
    // front of the text) moves no line: the surface is as ready as it was,
    // and sampling would read every block and every line of the document a
    // few times over for each stroke.
    const restartAfterEdit = ({ transaction }: { transaction: Transaction }) => {
      if (overlayOnlyDocChange(transaction.before, editor.state.doc)) return;
      restart();
    };
    const restartAfterMutation = (records: MutationRecord[]) => {
      if (records.every(mutationInsideOverlayBlock)) return;
      // The page's font assets (on the document element) change text the
      // kept pages cannot see.
      if (records.some((record) => record.target === ownerDocument.documentElement)) forgetLayout();
      restart();
    };
    const mutations = new MutationObserver(restartAfterMutation);
    mutations.observe(dom, { childList: true, characterData: true, subtree: true, attributes: true,
      attributeFilter: ["style", "data-pagination-initial-settling", "data-pagination-stalled",
        "data-docs-page-bands-pending", "data-docs-word-cjk-spacing-pending", "data-docs-auto-line-spacing-pending",
        "data-docs-display-fonts-pending", "data-docs-display-fonts-settling", "data-math-pending",
        DOCUMENT_ENGINE_FACES_WAITING] });
    mutations.observe(ownerDocument.documentElement, { attributes: true,
      attributeFilter: ["data-font-assets-loading", "data-font-assets-error"] });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { forgetLayout(); restart(); });
    resize?.observe(dom);
    // Registered ahead of `restart`: the look a font event starts reads anew.
    ownerDocument.fonts?.addEventListener("loading", forgetLayout);
    ownerDocument.fonts?.addEventListener("loadingdone", forgetLayout);
    ownerDocument.fonts?.addEventListener("loadingerror", forgetLayout);
    ownerDocument.addEventListener("visibilitychange", forgetLayout);
    dom.addEventListener("load", forgetLoadedSheet, true);
    dom.addEventListener("error", forgetLoadedSheet, true);
    ownerDocument.fonts?.addEventListener("loading", restart);
    ownerDocument.fonts?.addEventListener("loadingdone", restart);
    ownerDocument.fonts?.addEventListener("loadingerror", restart);
    ownerDocument.addEventListener("visibilitychange", restart);
    dom.addEventListener("load", restart, true);
    dom.addEventListener("error", restart, true);
    for (const type of SURFACE_READINESS_INPUT_EVENTS) dom.addEventListener(type, noteInput, true);
    editor.on("update", restartAfterEdit);
    frame = ownerWindow.requestAnimationFrame(sample);
    return () => {
      active = false;
      if (frame !== null) ownerWindow.cancelAnimationFrame(frame);
      if (recheck !== null) ownerWindow.clearTimeout(recheck);
      if (inputPause !== null) ownerWindow.clearTimeout(inputPause);
      for (const type of SURFACE_READINESS_INPUT_EVENTS) dom.removeEventListener(type, noteInput, true);
      mutations.disconnect(); resize?.disconnect();
      surfaceWatch?.disconnect();
      layoutKeep.disconnect();
      ownerDocument.fonts?.removeEventListener("loading", forgetLayout);
      ownerDocument.fonts?.removeEventListener("loadingdone", forgetLayout);
      ownerDocument.fonts?.removeEventListener("loadingerror", forgetLayout);
      ownerDocument.removeEventListener("visibilitychange", forgetLayout);
      dom.removeEventListener("load", forgetLoadedSheet, true);
      dom.removeEventListener("error", forgetLoadedSheet, true);
      ownerDocument.fonts?.removeEventListener("loading", restart);
      ownerDocument.fonts?.removeEventListener("loadingdone", restart);
      ownerDocument.fonts?.removeEventListener("loadingerror", restart);
      ownerDocument.removeEventListener("visibilitychange", restart);
      dom.removeEventListener("load", restart, true);
      dom.removeEventListener("error", restart, true);
      editor.off("update", restartAfterEdit);
      readinessLane.dispose();
      surfaceReadinessRef.current?.({ ready: false, pageCount: null });
    };
  }, [editor, editorHydrated, autosaveLoading, guestMode, previewMode, forPrint, pageId,
    guestContentRevision, initialContent, onSurfaceReadinessChange]);
}
