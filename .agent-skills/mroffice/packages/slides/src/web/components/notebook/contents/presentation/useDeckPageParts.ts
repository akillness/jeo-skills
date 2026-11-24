"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Loading and saving a deck held as parts in the Presentation editor
 * (lib/deck-page-parts): which later parts it reads, when, and how a changed
 * one is saved.
 *
 * Nearest first, as Docs loads the next part as the reader nears it: the
 * current slide's part and its neighbours' (Page Down, a jump to slide N, a
 * link -- the slide shows its stub for the moment its part takes), then the
 * parts of the stubs the thumbnail rail shows or is about to scroll to, then
 * in the background the rest of a short deck (every slide editable soon
 * after the first), or the parts around the current one of a long deck.
 *
 * A part the import is still writing (`pending`) is read when the page's
 * room says it was written (`deckPartReady`), and, as a fallback, on every
 * page-saved notice and every 5 s while one is pending (every 2 s while the
 * connection is down). A failed part is read again when Retry asks the
 * server to (`POST .../retry`).
 *
 * A loaded part whose slides changed is saved on its own (`PUT`, on the
 * revision it was read at): another save of the part first is merged slide
 * by slide (a slide both changed is kept twice); a part whose slides the
 * server's order does not name yet waits for the body's save; a refused one
 * is kept, unsaved, until it changes. Nothing here runs for an ordinary deck.
 */

import { createBackgroundLane, requestInputQuietCallback } from "@mrnote/core/web/lib/background-work.ts";
import { useCallback, useEffect, useRef, useSyncExternalStore, useState } from "react";

import type { ExternalHistoryStep } from "@mrnote/core/web/lib/collab/multi-room-history.ts";

import { apiPost, apiPut, isApiRequestError } from "@mrnote/core/web/lib/api.ts";
import {
  DECK_PART_PENDING_POLL_MS,
  DECK_PART_POLL_MS,
  DECK_PART_POLL_OFFLINE_MS,
  DECK_PART_RETRY_MS,
  DECK_PART_SAVE_DEBOUNCE_MS,
  deckPartsToLoad,
  type DeckPartArrival,
  type DeckPartMerge,
  type DeckPartsSession,
  type DeckPartsSnapshot,
  type DeckSlideLike,
} from "@mrnote/core/web/lib/deck-page-parts.ts";
import { DocumentPartRoom } from "@mrnote/core/web/lib/collab/document-part-room.ts";
import type { CollaborativeTextChange } from "@mrnote/core/web/lib/collab/json-crdt.ts";
import { readDocumentPart } from "@mrnote/core/web/lib/document-page-parts.ts";
import { DECK_PART_READY_EVENT, DECK_SLIDES_CHANGED_EVENT, PAGE_REMOTE_SAVED_EVENT } from "@mrnote/core/web/lib/notebook-events.ts";

/** Parts read at once while the reader waits on them. */
const URGENT_CONCURRENCY = 2;
/** The gap a background read leaves the editor between two parts. */
const BACKGROUND_GAP_MS = 120;


const BACKGROUND_READY_CONCURRENCY = 3;
/** Parts answered within this of each other are put in the deck together: each
 * alone rendered the whole window again (1.1-1.4 s of a 61-slide reopen, dev). */
const ARRIVAL_BATCH_MS = 16;
/** How far beyond the rail's edge a stub's part is read ahead. */
const RAIL_LOOK_AHEAD = "900px 0px";
const STUB_TAB_SELECTOR = '[data-testid="presentation-slide-tab"][data-deck-stub="true"]';

interface DeckPartSaveReceipt {
  readonly partIndex?: number;
  readonly revision?: number;
}

/** `POST .../deck-parts/insert-slides` and `.../delete-slides`. */
interface DeckSlidesReceipt {
  readonly contentVersion?: number;
  readonly partCount?: number;
  readonly partRevisions?: Record<string, number>;
  /** Each new slide's words as the server stored them (insert, copy), for its
   * Undo to say which it means to take away. */
  readonly slideWords?: Record<string, string>;
  /** The write as the room's own update, for this member's history. */
  readonly roomUpdate?: { readonly updateBase64?: unknown } | null;
}

/** A slide write that meets another member's unsaved input in the part's
 * room tries again this often, for this long (untilRoomSaved). */
export const DECK_ROOM_WAIT_MS = 2_000;
export const DECK_ROOM_WAIT_LIMIT_MS = 30_000;

/** What refuses an Undo because the step's slides moved on since: anything else
 * (a save refused for its content, the server away) is not someone's change. */
export const DECK_UNDO_CHANGED_ELSEWHERE_CODES: ReadonlySet<string> = new Set([
  "changed_elsewhere",
  "deck_slide_changed_elsewhere",
  "deck_parts_conflict",
  "document_part_conflict",
  "deck_slide_id_taken",
  "deck_slide_not_found",
  "deck_slide_restore_mismatch",
]);

/** 409 room_conflict: a slide the write changes is being typed in, in its
 * part's room, and that input is not saved yet. */
export function isDeckRoomConflict(error: unknown): boolean {
  return isApiRequestError(error) && error.status === 409 && error.code === "document_part_conflict" &&
    error.details?.reason === "room_conflict";
}

/** 503 database_busy: the write waited its turn behind another save and gave
 * up, nothing written. It is the server's way of saying go again. */
function isDeckWriteBusy(error: unknown): boolean {
  return isApiRequestError(error) && error.status === 503 && error.code === "database_busy";
}












/** A refused or failed SmartArt command's answer (`smartArtStructure`). */
function deckSmartArtFailure(error: unknown): Extract<DeckSmartArtStructureResult, { ok: false }> {
  if (isDeckRoomConflict(error)) return { ok: false, code: "room_busy", message: "" };
  return {
    ok: false,
    code: (isApiRequestError(error) && error.code) || "unavailable",
    message: error instanceof Error ? error.message : "",
    details: isApiRequestError(error) ? error.details : undefined,
  };
}

/** What a refused Undo or Redo of a SmartArt node command says (a message
 * key under `presentation.`): only a deck that moved on, or a snapshot no
 * longer held, says the step cannot be undone -- a step kept to try again
 * (the deck still saving) never does. */
export function smartArtStructureUndoRefusalKey(code: string): string {
  if (code === "deck_structure_undo_stale" || DECK_UNDO_CHANGED_ELSEWHERE_CODES.has(code)) return "smartartContext.structureUndoStale";
  if (code === "deck_structure_undo_unavailable") return "smartartContext.structureUndoUnavailable";
  if (code === "database_busy" || code === "unsaved" || code === "room_busy") return "smartartContext.structureSaving";
  return "editSaveFailed";
}

export async function untilRoomSaved<T>(send: () => Promise<T>, current: () => boolean): Promise<T> {
  for (let waited = 0; ; waited += DECK_ROOM_WAIT_MS) {
    try {
      return await send();
    } catch (error) {
      if ((!isDeckRoomConflict(error) && !isDeckWriteBusy(error)) ||
          waited + DECK_ROOM_WAIT_MS > DECK_ROOM_WAIT_LIMIT_MS || !current()) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, DECK_ROOM_WAIT_MS));
      if (!current()) throw error;
    }
  }
}

/** One server write of an insert or delete, as its inverse is made. */
type DeckInverseOp =
  | { readonly kind: "delete"; readonly ids: readonly string[];
      /** The inverse of this member's insert or copy: refused when another
       * member's words have reached one of these slides, so an Undo takes
       * nobody's words off the deck. */
      readonly guarded?: boolean;
      /** Each slide's words as the server stored them: it refuses the delete
       * when they are no longer those (deck_slide_changed_elsewhere). */
      readonly expectedWords?: Readonly<Record<string, string>> }
  | { readonly kind: "insert"; readonly after: string | null; readonly ids: readonly string[];
      /** What is sent for each id (a later part's slide by id; a body
       * slide whole, as it was before its delete). */
      readonly slides?: ReadonlyArray<Record<string, unknown>> };

/** The deleted slides grouped by the slide before them the delete leaves:
 * where Undo puts each run back (in order). */
export function deletedRestores(
  order: ReadonlyArray<{ readonly id: string }>,
  deletes: readonly string[],
): Array<{ after: string | null; ids: string[] }> {
  const gone = new Set(deletes);
  const out: Array<{ after: string | null; ids: string[] }> = [];
  let after: string | null = null;
  let run: { after: string | null; ids: string[] } | null = null;
  for (const entry of order) {
    if (!gone.has(entry.id)) {
      after = entry.id;
      run = null;
      continue;
    }
    if (!run) {
      run = { after, ids: [] };
      out.push(run);
    }
    run.ids.push(entry.id);
  }
  return out;
}

/** The structural codes after which the change is worked out again from the
 * server's order (it moved on, or the change landed already). */
const STRUCTURAL_REREAD_CODES: ReadonlySet<string> = new Set([
  "deck_parts_conflict",
  "document_part_conflict",
  "deck_slide_id_taken",
  "deck_slide_not_found",
]);

export interface UseDeckPagePartsOptions<S extends DeckSlideLike> {
  readonly session: DeckPartsSession<S>;
  readonly pageId: string;
  /** False for a guest, an embedded or a preview deck: nothing is read. */
  readonly enabled: boolean;
  /** The parts are saved from this view (the page is writable here). */
  readonly writable: boolean;
  /** The deck the editor shows (stubs included), and its current slide. */
  readonly slides: readonly S[];
  readonly activeIndex: number;
  /** The thumbnail rail's scroll box, once it is mounted. */
  readonly railViewport: HTMLElement | null;
  /** The deck the editor holds now (not the rendered one). */
  readonly liveSlides: () => readonly S[];
  /** A part arrived: what to put in place of its stubs. */
  readonly onArrived: (arrival: DeckPartArrival<S>, partIndex: number, content: unknown) => void;
  /** Another save of a part came first: the merge to put in the editor. */
  readonly onMerged: (merge: DeckPartMerge<S>, partIndex: number) => void;
  /** Read the page body again (its order moved on, the server said). */
  readonly refreshBody: () => Promise<void>;
  /** Queue the editor's deck for saving again (a part's change is made
   * afresh from it). */
  readonly resave: () => void;
  /** The server's insert or delete (or another editor's) landed: the page
   * is read again as a collaborator's save is, merged with what the editor
   * has not saved yet. */
  readonly onStructureChanged: () => void;
  /** An insert or delete the server refused for its content (400/422): told
   * once; the editor keeps the slides, unsaved. */
  readonly onStructureRefused: (message: string) => void;
  /** Another member holds the page's checkout (409 page_locked): this
   * member's insert, delete or copy is kept and goes again when it is free.
   * Told once a wait, with the holder's name when the server gave it. */
  readonly onStructureWaiting?: (holder: string | null) => void;
  /** The room document's state vector (base64), or null without a room:
   * sent with an insert, delete or copy so the answer carries the room's
   * update for it. */
  readonly roomStateVector?: () => string | null;
  /** Apply that update as this member's own step of the shared history
   * (Undo takes the insert, delete or copy back); false when it cannot. */
  readonly applyRoomUpdate?: (updateBase64: string) => boolean;
  /** The body's save base an insert, delete or copy is made on (its
   * `expected.content_version`); null while a save owns it (the write
   * waits); undefined (or without it) the write goes on no expected
   * version, as for a body kept in a causal room. */
  readonly ownServerWriteBase?: () => number | null | undefined;
  /** The write landed on that base, leaving the body at `to`: the body's
   * next save is based on `to` (it carries the write already). */
  readonly adoptOwnServerWrite?: (from: number, to: number) => boolean;
  /** Writes landed on a body kept in a causal room: its checkpoint is
   * adopted before the body is saved again. */
  readonly settleOwnServerWrite?: () => Promise<void>;
  /** Hold the body's saves for this member's insert, delete or copy (the
   * save in flight finished first); null when they cannot be held now. */
  readonly beginOwnServerWrite?: () => Promise<(() => void) | null>;
  /** An insert, delete or copy whose answer carried no room update (its
   * room was not connected): its Undo and Redo, as one step of this
   * member's history (MultiRoomHistory.external). */
  readonly ownExternalStep?: (step: ExternalHistoryStep) => void;
  /** Such an Undo or Redo was refused (someone changed that place since). */
  readonly onUndoRefused?: (code: string) => void;
  /** A refused step's place in the history (MultiRoomHistory.settleExternal). */
  readonly settleExternalStep?: (step: ExternalHistoryStep, outcome: "forget" | "putBack") => void;
  /** Saves the body now: what is stored of it is what an Undo is measured by. */
  readonly saveBodyNow?: () => Promise<unknown>;
  /** An Undo or Redo the server has to make has started; what is returned is
   * called when it is over. */
  readonly onUndoRunning?: () => () => void;
  /** A SmartArt node command's Undo or Redo the server refused (its code:
   * `deck_structure_undo_stale` once the deck was written since). */
  readonly onStructureUndoRefused?: (code: string) => void;
  /** Open a live room for each loaded later part (the page's own room is
   * live): its slides are edited there, as the body is in the page's room. */
  readonly partRooms?: boolean;
  /** A part's room changed its slides (another member's input, the room read
   * afresh): the editor puts them in place. */
  readonly onRoomSlides?: (
    slides: ReadonlyMap<string, S>,
    partIndex: number,
    textChanges?: readonly CollaborativeTextChange[],
  ) => void;
  /** The part rooms (or their histories) changed: Undo / Redo may have. */
  readonly onRoomsChanged?: () => void;
  /** A step of this member's own made by the server for them (the room's
   * update of an insert, delete or copy): `apply` runs as one history step. */
  readonly ownRoomStep?: (apply: () => void) => void;
  /** A part room refused an input or a save of this member's. */
  readonly onRoomRefused?: (code: string) => void;
  /** A part's room could not merge a text of this member's without a guess
   * (TRIAGE 47): the deck goes into conflict. */
  readonly onTextMergeRefused?: () => void;
}

export type DeckPartRetryResult = "retrying" | "not-failed" | "unavailable";

/** What re-importing a part (the member's edits replaced) came to. */
/** Between one part room's opening and the next, the import done. */
const ROOM_OPEN_GAP_MS = 300;
/** ... once the person has given no input for this long. */
const ROOM_OPEN_INPUT_QUIET_MS = 800;
/** ... and how long after the last part arrived: the import is ending its reading. */
const ROOMS_AFTER_IMPORT_MS = 3000;

export type DeckPartReimportResult = "reimporting" | "not-needed" | "changed" | "pending" | "unavailable";

/** What Duplicate Slide on a deck held as parts came to. */
export type DeckDuplicateResult =
  | { readonly ok: true; readonly insertedSlideIds: readonly string[]; readonly rebuiltFromPage?: boolean }
  | {
      readonly ok: false;
      /** `unsaved`: an edit of the deck could not be saved first, so the
       * copy would not have it; otherwise the server's code. */
      readonly code: string;
      readonly message: string;
      readonly details?: Record<string, unknown>;
    };

/** A node or level command on a file's SmartArt, written by the server
 * (`POST .../deck-parts/smartart-structure`, TRIAGE S11o). */
export type DeckSmartArtStructureResult =
  | { readonly ok: true; readonly selectedBlockId: string; readonly focusPointId: string; readonly undoable: boolean }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly details?: Record<string, unknown> };

export interface DeckPageParts {
  readonly snapshot: DeckPartsSnapshot;
  /** Read the part holding slide `id` now (a command about to need it). */
  readonly loadSlide: (id: string) => void;
  /** Ask the server to read a failed part again (`POST .../retry`). */
  readonly retryPart: (index: number) => Promise<DeckPartRetryResult>;
  /**
   * Duplicate slides the server's way (`POST .../deck-parts/duplicate-slides`:
   * the package's own copy of each slide, its chart workbooks, diagrams,
   * media and receipts with it, after the slide in its part), once every
   * edit of the parts has been saved (the server copies what it holds).
   */
  readonly duplicateSlides: (ids: readonly string[]) => Promise<DeckDuplicateResult>;
  /**
   * A node or level command on a file's SmartArt on slide `slideId`, the
   * server's way: planned on the whole deck and written in one step, each
   * slide back to its part (a plan committed as the deck was saved as a body
   * and parts apart). Its Undo is the server's too
   * (`.../smartart-structure-restore`), refused once the deck was written
   * since (`onStructureUndoRefused`); its Redo the command again.
   */
  readonly smartArtStructure: (slideId: string, request: unknown) => Promise<DeckSmartArtStructureResult>;
  /** Read part `index` again from the file over the member's edits (they
   * agreed): `POST .../retry {replace_edited: true, expected_revision}`. */
  readonly reimportPart: (index: number) => Promise<DeckPartReimportResult>;
  /** The live room of each loaded later part, by part index. */
  readonly rooms: () => ReadonlyMap<number, DocumentPartRoom>;
  /** This member's insert, delete or copy on its way to the server, as a
   * promise of its landing (Undo waits for it); null when none is. */
  readonly whenStructureSettled: () => Promise<void> | null;
  /** An insert or delete the window shows that the server does not hold yet. */
  readonly structureUnsaved: () => boolean;
  /** The server refused it: it stays unsaved until the member changes it. */
  readonly structureRefused: () => boolean;
}

/** Every slide `handed` is, by its content, the slide the window holds now. */
function windowHolds<S extends { id: string }>(handed: ReadonlyMap<string, S>, live: readonly S[]): boolean {
  if (handed.size === 0) return true;
  const byId = new Map(live.map((slide) => [slide.id, slide]));
  for (const [id, slide] of handed) {
    const now = byId.get(id);
    if (!now) return false;
    if (now !== slide && JSON.stringify(now) !== JSON.stringify(slide)) return false;
  }
  return true;
}

/** The longest a structural change waits between tries while another member holds the page. */
const DECK_PART_LOCK_BACKOFF_MAX_MS = 30_000;
/** How long a Duplicate waits for another member's checkout before it is said to have failed. */
const DECK_PART_LOCK_WAIT_MAX_MS = 5 * 60_000;

export function useDeckPageParts<S extends DeckSlideLike>(options: UseDeckPagePartsOptions<S>): DeckPageParts {
  const { session, pageId, enabled } = options;
  const snapshot = useSyncExternalStore(
    useCallback((listener: () => void) => session.subscribe(listener), [session]),
    () => session.snapshot(),
    () => session.snapshot(),
  );
  const active = enabled && snapshot.active && session.page === pageId;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const inflight = useRef(new Set<number>());
  /** A part whose read failed is not asked again before this time. */
  const notBefore = useRef(new Map<number, number>());
  const visibleStubs = useRef(new Set<string>());
  const offline = useRef(false);
  const scheduleRef = useRef<() => void>(() => undefined);
  const backgroundTimer = useRef<number | null>(null);

  const arrivals = useRef<Array<{ arrival: DeckPartArrival<S>; index: number; content: unknown; askedFor: string }>>([]);
  const arrivalTimer = useRef<number | null>(null);
  const flushArrivals = useCallback(() => {
    if (arrivalTimer.current !== null) window.clearTimeout(arrivalTimer.current);
    arrivalTimer.current = null;
    const batch = arrivals.current;
    arrivals.current = [];
    for (const { arrival, index, content, askedFor } of batch) {
      if (session.page === askedFor) optionsRef.current.onArrived(arrival, index, content);
    }
    session.flushNotices();
  }, [session]);
  useEffect(() => flushArrivals, [flushArrivals]);

  // The parts the import is still writing, asked after (`pollPending`, below).
  const pollPendingRef = useRef<() => void>(() => undefined);
  const read = useCallback(async (index: number): Promise<void> => {
    if (inflight.current.has(index) || session.isHeld(index)) return;
    inflight.current.add(index);
    const askedFor = pageId;
    const wasPending = session.status(index) === "pending";
    try {
      const answer = await readDocumentPart(askedFor, index, { cache: "no-store" });
      offline.current = false;
      notBefore.current.delete(index);
      if (session.page !== askedFor || !optionsRef.current.enabled) return;
      // Reading a part (its schema check, most of a long deck's opening CPU:
      // ~0.4 s for 287 slides) is background work unless the reader is waiting
      // for it -- the current slide's part, or one of a stub in view: the rest
      
      // seconds after the deck opens is not held behind them (each still comes
      
      const { slides: shownSlides, activeIndex: shownIndex } = optionsRef.current;
      const awaited = session.partOf(shownSlides[shownIndex]?.id ?? "") === index ||
        [...visibleStubs.current].some((id) => session.partOf(id) === index);
      if (!awaited) {
        const lane = createBackgroundLane({ label: "deck-part-install" });
        try {
          await lane.turn();
        } finally {
          lane.dispose();
        }
        if (session.page !== askedFor || !optionsRef.current.enabled || session.isHeld(index)) return;
      }
      const arrival = session.installPart(index, answer, optionsRef.current.liveSlides(), true);
      if (arrival && arrival.slides.size > 0) arrivals.current.push({ arrival, index, content: answer.content, askedFor });
      if (arrivalTimer.current === null) arrivalTimer.current = window.setTimeout(flushArrivals, ARRIVAL_BATCH_MS);
      // A part the room never announced, found written: the import writes
      // them in order, so the next is likely written too. Asked at once, not
      // at the next poll: with the room's notices missed (its socket not yet
      
      // they were written.
      if (wasPending && arrival) pollPendingRef.current();
    } catch (error) {
      if (isApiRequestError(error) && error.status === 404) {
        // The page no longer names this part (made whole, or cut again):
        // the next read of the page body says what it holds now.
        session.setStatus(index, "unknown");
        notBefore.current.set(index, Date.now() + DECK_PART_POLL_MS);
      } else {
        offline.current = !isApiRequestError(error);
        notBefore.current.set(index, Date.now() + DECK_PART_RETRY_MS);
      }
    } finally {
      inflight.current.delete(index);
      scheduleRef.current();
    }
  }, [flushArrivals, pageId, session]);

  const schedule = useCallback(() => {
    if (!active) return;
    const { slides, activeIndex } = optionsRef.current;
    const marker = session.currentMarker;
    if (!marker) return;
    for (const index of session.takeIncompleteParts()) void read(index);
    const now = Date.now();
    const plan = deckPartsToLoad({
      count: marker.count,
      slideIds: slides.map((slide) => slide.id),
      activeIndex,
      visibleIds: visibleStubs.current,
      partOf: (id) => session.partOf(id),
      // A part the import has not read yet is the room's (or the poll's)
      // to announce.
      loadable: (part) =>
        !session.isHeld(part) &&
        session.status(part) !== "pending" &&
        session.status(part) !== "failed" &&
        (notBefore.current.get(part) ?? 0) <= now,
    });
    for (const part of plan.urgent) {
      if (inflight.current.size >= URGENT_CONCURRENCY) break;
      void read(part);
    }
    if (plan.urgent.some((part) => !inflight.current.has(part))) return;
    let importing = false;
    for (let index = 1; index < marker.count; index += 1) {
      if (session.status(index) === "pending") importing = true;
    }
    if (!importing) {
      for (const part of plan.background) {
        if (inflight.current.size >= BACKGROUND_READY_CONCURRENCY) break;
        void read(part);
      }
      return;
    }
    if (inflight.current.size > 0 || plan.background.length === 0 || backgroundTimer.current !== null) return;
    backgroundTimer.current = window.setTimeout(() => {
      backgroundTimer.current = null;
      const next = plan.background.find((part) => !session.isHeld(part));
      if (next !== undefined && inflight.current.size === 0) void read(next);
    }, BACKGROUND_GAP_MS);
  }, [active, read, session]);
  scheduleRef.current = schedule;

  // A new page starts with nothing asked. Before the first reads below, and
  // only when the page changes: on mount this came after them and forgot them,
  // so each part still being read was read a second time.
  const askedForPage = useRef(pageId);
  useEffect(() => {
    if (askedForPage.current === pageId) return;
    askedForPage.current = pageId;
    inflight.current.clear();
    notBefore.current.clear();
    visibleStubs.current.clear();
  }, [pageId]);

  // The current slide moved, the deck changed, a part arrived: read what is
  // nearest next.
  const slideCount = options.slides.length;
  useEffect(() => {
    schedule();
  }, [schedule, options.activeIndex, slideCount, snapshot.version]);

  useEffect(() => () => {
    if (backgroundTimer.current !== null) window.clearTimeout(backgroundTimer.current);
    backgroundTimer.current = null;
  }, []);


  // The rail's stubs within reach of its viewport: their parts are read
  // before they scroll into view.
  const railViewport = options.railViewport;
  const slides = options.slides;
  // One observer for the rail, told of the stubs that came and went at each
  // change of the deck: made again at every change (a keystroke, a part's
  // arrival), it observed every stub of a long deck anew each time.
  const stubObserver = useRef<{ observer: IntersectionObserver; observed: Map<HTMLElement, string> } | null>(null);
  useEffect(() => {
    if (!active || !railViewport || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.slideId;
        if (!id) continue;
        if (entry.isIntersecting) {
          if (!visibleStubs.current.has(id)) {
            visibleStubs.current.add(id);
            changed = true;
          }
        } else if (visibleStubs.current.delete(id)) {
          changed = true;
        }
      }
      if (changed) scheduleRef.current();
    }, { root: railViewport, rootMargin: RAIL_LOOK_AHEAD });
    const visible = visibleStubs.current;
    visible.clear();
    stubObserver.current = { observer, observed: new Map() };
    return () => {
      observer.disconnect();
      stubObserver.current = null;
      visible.clear();
    };
  }, [active, railViewport]);
  useEffect(() => {
    const held = stubObserver.current;
    if (!held || !railViewport) return;
    const stubs = new Map<HTMLElement, string>();
    for (const tab of railViewport.querySelectorAll<HTMLElement>(STUB_TAB_SELECTOR)) {
      stubs.set(tab, tab.dataset.slideId ?? "");
    }
    let changed = false;
    for (const [tab, id] of held.observed) {
      if (stubs.get(tab) === id) continue;
      // No longer a stub (its part came), gone, or another slide's now.
      held.observer.unobserve(tab);
      held.observed.delete(tab);
      if (id && visibleStubs.current.delete(id)) changed = true;
    }
    for (const [tab, id] of stubs) {
      if (held.observed.has(tab)) continue;
      held.observed.set(tab, id);
      held.observer.observe(tab);
    }
    if (changed) scheduleRef.current();
  }, [active, railViewport, slides]);

  // The room says a part was written: read it (a part this editor holds is
  // read again when its content is no longer the one it holds and nobody
  // here changed it).
  useEffect(() => {
    if (!active) return;
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent<{ room?: unknown; partIndex?: unknown; contentSha256?: unknown }>).detail;
      const room = typeof detail?.room === "string" ? detail.room : "";
      if (room !== pageId && !room.endsWith(`:${pageId}`)) return;
      const index = detail?.partIndex;
      const sha = detail?.contentSha256;
      if (typeof index !== "number" || typeof sha !== "string") return;
      // Letters the window still holds are in the room or a draft first: what
      // says whether the part may be let go has to know of them.
      optionsRef.current.liveSlides();
      if (session.isHeld(index) && !session.forgetStalePart(index, sha)) return;
      notBefore.current.delete(index);
      session.setStatus(index, "unknown");
      void read(index);
    };
    window.addEventListener(DECK_PART_READY_EVENT, onReady);
    return () => window.removeEventListener(DECK_PART_READY_EVENT, onReady);
  }, [active, pageId, read, session]);

  // Another editor's insert or delete (or this one's, echoed): the body is
  // read again (the rail follows its order; the stage and the selection
  // stay), and each held part whose revision moved is read again.
  useEffect(() => {
    if (!active) return;
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ room?: unknown; partRevisions?: unknown }>).detail;
      const room = typeof detail?.room === "string" ? detail.room : "";
      if (room !== pageId && !room.endsWith(`:${pageId}`)) return;
      const revisions = detail?.partRevisions && typeof detail.partRevisions === "object"
        ? (detail.partRevisions as Record<string, unknown>)
        : {};
      void optionsRef.current.refreshBody().catch(() => undefined).finally(() => {
        // Letters the window still holds are in the room or a draft first.
        optionsRef.current.liveSlides();
        for (const index of session.applyPartRevisions(revisions)) void read(index);
        optionsRef.current.onStructureChanged();
      });
    };
    window.addEventListener(DECK_SLIDES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(DECK_SLIDES_CHANGED_EVENT, onChanged);
  }, [active, pageId, read, session]);

  // Fallback for the room's notice: the parts the import is still writing
  // are asked after on every page-saved notice and on a timer.
  const pollPending = useCallback(() => {
    if (!active) return;
    const marker = session.currentMarker;
    if (!marker) return;
    const { slides: current, activeIndex } = optionsRef.current;
    const pending: number[] = [];
    for (let index = 1; index < marker.count; index += 1) {
      if (!session.isHeld(index) && session.status(index) === "pending") pending.push(index);
    }
    if (pending.length === 0) return;
    // The import writes its parts in order (the one a reader last stood in
    // first): the earliest pending part, and the current slide's.
    const asked = new Set<number>([pending[0]]);
    const activePart = session.partOf(current[activeIndex]?.id ?? "");
    if (activePart !== undefined && pending.includes(activePart)) asked.add(activePart);
    for (const index of asked) {
      notBefore.current.delete(index);
      void read(index);
    }
  }, [active, read, session]);
  pollPendingRef.current = pollPending;

  const pendingParts = snapshot.statuses.some((status, index) => index > 0 && status === "pending" && !snapshot.held[index]);
  useEffect(() => {
    if (!active || !pendingParts) return;
    let timer: number | null = null;
    const tick = () => {
      pollPending();
      timer = window.setTimeout(tick, offline.current ? DECK_PART_POLL_OFFLINE_MS : DECK_PART_PENDING_POLL_MS);
    };
    timer = window.setTimeout(tick, offline.current ? DECK_PART_POLL_OFFLINE_MS : DECK_PART_PENDING_POLL_MS);
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ pageId?: string; allPages?: boolean }>).detail;
      if (detail?.allPages || detail?.pageId === pageId) pollPending();
    };
    const onOnline = () => {
      offline.current = false;
      pollPending();
    };
    const onOffline = () => {
      offline.current = true;
    };
    window.addEventListener(PAGE_REMOTE_SAVED_EVENT, onSaved);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener(PAGE_REMOTE_SAVED_EVENT, onSaved);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [active, pageId, pendingParts, pollPending]);

  // ---- Saves of the later parts.
  const flushing = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const scheduleFlush = useCallback((delay: number) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void flushRef.current();
    }, delay);
  }, []);

  /** Send the editor's inserts and deletes; true when nothing of them is
   * left to send (sent, or found already done). */
  const refusedStructure = useRef<string | null>(null);
  /** How long the next try of a change waits while another member holds the page (0: not waiting). */
  const lockBackoff = useRef(0);
  /** The body of an insert, delete or copy: with the room's state vector
   * when there is a room, so its answer is the room's own update. */
  const withRoomState = useCallback((body: Record<string, unknown>): Record<string, unknown> => {
    const vector = optionsRef.current.roomStateVector?.() ?? null;
    return vector ? { ...body, state_vector_base64: vector } : body;
  }, []);
  /** The body's save base for an insert, delete or copy of this member's:
   * undefined when the editor names none (sent on no expected version), null
   * while a save owns it. */
  const ownWriteBase = useCallback((): number | null | undefined => {
    const read = optionsRef.current.ownServerWriteBase;
    return read ? read() : undefined;
  }, []);
  /** The write made on `base` landed: the body's save base moves to the
   * version it left (the body already holds the write), else the base the
   * next write is made on is read afresh. */
  const adoptOwnWrite = useCallback((base: number | undefined, receipt: DeckSlidesReceipt | null): number | undefined => {
    if (base === undefined || typeof receipt?.contentVersion !== "number") return undefined;
    return optionsRef.current.adoptOwnServerWrite?.(base, receipt.contentVersion) ? receipt.contentVersion : undefined;
  }, []);
  /** The room's update an answer carries: this member's history step. */
  const takeRoomUpdate = useCallback((receipt: DeckSlidesReceipt | null): boolean => {
    const update = receipt?.roomUpdate?.updateBase64;
    if (typeof update !== "string" || !update) return false;
    let applied = false;
    const apply = () => {
      applied = optionsRef.current.applyRoomUpdate?.(update) === true;
    };
    // One step of this member's, in order with their other changes.
    if (optionsRef.current.ownRoomStep) optionsRef.current.ownRoomStep(apply);
    else apply();
    return applied;
  }, []);
  /**
   * The server's inverse writes of a step no room holds (its answer carried
   * no room update: the room was not connected), run for Undo / Redo: a
   * slide inserted goes by deleting the same ids, one deleted comes back by
   * inserting the same ids after the slide it followed (the server restores
   * the slide its part kept). The body's saves wait for them; a refusal
   * (409: someone changed that place since) is said, not swallowed.
   */
  const runInverseNow = useCallback(async (
    savingFor: string,
    ops: readonly DeckInverseOp[],
    step?: () => ExternalHistoryStep,
  ): Promise<void> => {
    if (session.page !== savingFor) return;
    const refused = (code: string) => {
      optionsRef.current.onUndoRefused?.(code);
      if (step) optionsRef.current.settleExternalStep?.(step(), DECK_UNDO_CHANGED_ELSEWHERE_CODES.has(code) ? "forget" : "putBack");
    };
    // Someone typed in a slide this would take away: said, nothing written.
    if (ops.some((op) => op.kind === "delete" && op.guarded && op.ids.some((id) => session.hasRemoteWords(id)))) {
      refused("changed_elsewhere");
      return;
    }
    // The server compares a slide's words with a later part's room, and with
    // what is stored of the body: this member's own Undo of what they typed
    // there has to have reached it.
    if (ops.some((op) => op.kind === "delete" && op.expectedWords)) {
      await Promise.all([...roomsRef.current.values()].map(({ room }) => room.delivered(DECK_ROOM_WAIT_MS)));
      if (ops.some((op) => op.kind === "delete" && op.expectedWords && op.ids.some((id) => session.partOf(id) === 0))) {
        await optionsRef.current.saveBodyNow?.().catch(() => undefined);
      }
    }
    const begin = optionsRef.current.beginOwnServerWrite;
    const release = begin ? await begin() : undefined;
    const stillFor = () => session.page === savingFor;
    try {
      for (const op of ops) {
        await untilRoomSaved(() => apiPost<DeckSlidesReceipt>(
          `/api/v1/pages/${encodeURIComponent(savingFor)}/deck-parts/${op.kind === "delete" ? "delete-slides" : "insert-slides"}`,
          op.kind === "delete"
            ? { slide_ids: [...op.ids], ...(op.expectedWords ? { expected_slide_words: op.expectedWords } : {}) }
            : { after_slide_id: op.after, slides: op.slides ? [...op.slides] : op.ids.map((id) => ({ id })) },
        ), stillFor);
      }
    } catch (error) {
      const code = isApiRequestError(error) ? error.code ?? "" : "";
      refused(code || "unavailable");
    } finally {
      release?.();
    }
    if (session.page !== savingFor) return;
    await optionsRef.current.settleOwnServerWrite?.().catch(() => undefined);
    await optionsRef.current.refreshBody().catch(() => undefined);
    optionsRef.current.onStructureChanged();
    optionsRef.current.resave();
  }, [session]);
  // A press while it is on its way waits for it (whenStructureSettled), and the
  // member is told it is running: on a slow save this took a minute unseen.
  const structureWrite = useRef<Promise<unknown> | null>(null);
  const whileStructureWrites = useCallback(<T,>(run: Promise<T>): Promise<T> => {
    structureWrite.current = run;
    void run.finally(() => { if (structureWrite.current === run) structureWrite.current = null; }).catch(() => undefined);
    return run;
  }, []);
  const runInverse = useCallback((
    savingFor: string,
    ops: readonly DeckInverseOp[],
    step?: () => ExternalHistoryStep,
  ): Promise<void> => {
    const stopSaying = optionsRef.current.onUndoRunning?.();
    return whileStructureWrites(runInverseNow(savingFor, ops, step).finally(() => stopSaying?.()));
  }, [runInverseNow, whileStructureWrites]);
  const sendStructureNow = useCallback(async (
    savingFor: string,
    structure: NonNullable<ReturnType<DeckPartsSession<S>["structuralChange"]>>,
  ): Promise<boolean> => {
    const key = JSON.stringify(structure);
    if (refusedStructure.current === key) return false;
    // Writes whose answer carried no room update: their Undo is the server's
    // inverse write (runInverse), one step of this member's history.
    const unheld: Array<{ forward: DeckInverseOp; inverse: DeckInverseOp }> = [];
    const landed = (receipt: DeckSlidesReceipt | null): boolean => {
      const held = takeRoomUpdate(receipt);
      if (receipt?.partRevisions) {
        for (const index of session.applyPartRevisions(receipt.partRevisions)) void read(index);
      }
      return held;
    };
    // Each write is made on the body's save base and, landed, moves it on
    // (a non-causal body is saved on its version: the body save right after
    // an insert went on the version before it and was refused as a conflict,
    // and the member's Undo of the insert was never saved). A save in flight
    // owns the base: the writes wait for it.
    let base = ownWriteBase();
    if (base === null) {
      scheduleFlush(DECK_PART_RETRY_MS);
      return false;
    }
    const causalBody = base === undefined && Boolean(optionsRef.current.ownServerWriteBase);
    // A slide these change being typed in, in its part's room: each goes
    // again once that room has saved (untilRoomSaved); still busy after
    // that, the change waits for the next flush.
    const stillFor = () => session.page === savingFor;
    // On a causal body the write is not asked for the room's update: its
    // Undo is the server's inverse write, and the room takes the write from
    // its checkpoint (settleOwnServerWrite). The update as this member's
    // step lost a race -- the page-saved notice merged the same operations
    // first (a delete 7.6 s on its way), the update then added nothing, no
    
    const onBase = (body: Record<string, unknown>) => causalBody ? body
      : withRoomState(base === undefined || base === null ? body : { ...body, expected: { content_version: base } });
    const landedOnBase = (receipt: DeckSlidesReceipt | null): boolean => {
      const made = base ?? undefined;
      const held = landed(receipt);
      // Not adopted (the base moved meanwhile): the next write is made on no
      // expected version, as before, and the body's save checks its own.
      base = adoptOwnWrite(made, receipt) ?? (base === undefined ? undefined : null);
      return held;
    };
    try {
      if (structure.deletes.length > 0) {
        // A deleted slide whose part is not here is read first: Undo puts it
        // back whole, and only its part holds what it was.
        for (const part of session.partsToLoadFor(structure.deletes)) await read(part);
        // Where each deleted slide stood: the slide before it the delete
        // leaves (its Undo puts it back there).
        const restores = deletedRestores(session.currentMarker?.order ?? [], structure.deletes)
          .map((run) => ({ ...run, slides: session.restorableSlides(run.ids) }));
        const receipt = await untilRoomSaved(() => apiPost<DeckSlidesReceipt>(
          `/api/v1/pages/${encodeURIComponent(savingFor)}/deck-parts/delete-slides`,
          onBase({ slide_ids: structure.deletes }),
        ), stillFor);
        if (!landedOnBase(receipt)) {
          for (const restore of restores) {
            unheld.push({ forward: { kind: "delete", ids: restore.ids },
              inverse: { kind: "insert", after: restore.after, ids: restore.ids, slides: restore.slides } });
          }
        }
      }
      for (const insert of structure.inserts) {
        const answer = await untilRoomSaved(() => apiPost<DeckSlidesReceipt>(
          `/api/v1/pages/${encodeURIComponent(savingFor)}/deck-parts/insert-slides`,
          onBase({ after_slide_id: insert.after, slides: insert.slides }),
        ), stillFor);
        const held = landedOnBase(answer);
        if (!held) {
          unheld.push({ forward: { kind: "insert", after: insert.after, ids: insert.ids, slides: insert.slides },
            inverse: { kind: "delete", ids: insert.ids, guarded: true, expectedWords: answer?.slideWords } });
        }
      }
      // Only on a body kept in a causal room: elsewhere the editor's own
      // change is the room's step already, and Undo takes it back there.
      if (unheld.length > 0 && causalBody && optionsRef.current.ownExternalStep) {
        // Undo takes the writes back last first; Redo makes them again.
        const inverse = [...unheld].reverse().map(({ inverse }) => inverse);
        const forward = unheld.map(({ forward }) => forward);
        const step: ExternalHistoryStep = {
          undo: () => { void runInverse(savingFor, inverse, () => step); },
          redo: () => { void runInverse(savingFor, forward, () => step); },
        };
        optionsRef.current.ownExternalStep(step);
      }
    } catch (error) {
      const code = isApiRequestError(error) ? error.code : undefined;
      const status = isApiRequestError(error) ? error.status : 0;
      if (isDeckRoomConflict(error)) {
        // Still being typed in after untilRoomSaved's wait: the change is
        // kept and goes again with the next flush.
        scheduleFlush(DECK_PART_POLL_MS);
        return false;
      }
      if (status === 409 && code && STRUCTURAL_REREAD_CODES.has(code)) {
        // The server's order is not the one the change was made against:
        // read it, and work the change out again from it.
        await optionsRef.current.refreshBody().catch(() => undefined);
        session.structuralDiscarded();
        optionsRef.current.onStructureChanged();
        optionsRef.current.resave();
        return false;
      }
      if (status === 409 && code === "deck_parts_pending") {
        // A part is still being read: the change waits for the import.
        scheduleFlush(DECK_PART_POLL_MS);
        return false;
      }
      if (status === 409 && code === "page_locked") {
        // Another member holds the page's checkout: the change stays here,
        // kept as it was made, and goes again when the checkout is free --
        // later and later (1 s, 2, 4 ... 30 s), never the fixed 3 s that
        // sent one insert 33 times in a minute and a half (S6 acceptance,
        // two people in one deck). The member is told once a wait.
        const waited = lockBackoff.current;
        lockBackoff.current = Math.min(DECK_PART_LOCK_BACKOFF_MAX_MS, waited === 0 ? 1_000 : waited * 2);
        if (waited === 0) {
          const holder = isApiRequestError(error) ? (error.details?.holder as { name?: unknown } | undefined)?.name : undefined;
          optionsRef.current.onStructureWaiting?.(typeof holder === "string" && holder ? holder : null);
        }
        scheduleFlush(lockBackoff.current);
        return false;
      }
      if (status === 400 || status === 422 || (status === 409 && code === "deck_first_part_empty")) {
        console.warn("[deck-parts] insert or delete refused", { status, code,
          path: isApiRequestError(error) ? error.details?.path : undefined });
        refusedStructure.current = key;
        optionsRef.current.onStructureRefused(error instanceof Error ? error.message : String(code ?? status));
        return false;
      }
      offline.current = !isApiRequestError(error);
      scheduleFlush(DECK_PART_RETRY_MS);
      return false;
    }
    refusedStructure.current = null;
    lockBackoff.current = 0;
    if (ownWriteBase() === undefined) await optionsRef.current.settleOwnServerWrite?.().catch(() => undefined);
    await optionsRef.current.refreshBody().catch(() => undefined);
    session.structuralLanded();
    optionsRef.current.onStructureChanged();
    optionsRef.current.resave();
    return true;
  }, [adoptOwnWrite, ownWriteBase, read, runInverse, scheduleFlush, session, takeRoomUpdate, withRoomState]);
  /** sendStructureNow with the body's saves held: the save in flight is
   * finished first, and none is sent until these writes have landed and been
   * taken in (the body's save and the server's write sent together, the save
   * lacked the write and was refused). */
  



  const whenStructureSettled = useCallback((): Promise<void> | null => {
    const run = structureWrite.current;
    return run ? run.then(() => undefined, () => undefined) : null;
  }, []);
  const sendStructureHeld = useCallback(async (
    savingFor: string,
    structure: NonNullable<ReturnType<DeckPartsSession<S>["structuralChange"]>>,
  ): Promise<boolean> => {
    if (refusedStructure.current === JSON.stringify(structure)) return false;
    const begin = optionsRef.current.beginOwnServerWrite;
    const release = begin ? await begin() : undefined;
    if (begin && !release) {
      scheduleFlush(DECK_PART_RETRY_MS);
      return false;
    }
    try {
      return await sendStructureNow(savingFor, structure);
    } finally {
      release?.();
    }
  }, [scheduleFlush, sendStructureNow]);
  const sendStructure = useCallback((
    savingFor: string,
    structure: NonNullable<ReturnType<DeckPartsSession<S>["structuralChange"]>>,
  ): Promise<boolean> => whileStructureWrites(sendStructureHeld(savingFor, structure)), [sendStructureHeld, whileStructureWrites]);

  const flush = useCallback(async () => {
    if (flushing.current || !active || !optionsRef.current.writable) return;
    flushing.current = true;
    const savingFor = pageId;
    try {
      // Slides added or deleted first: a part's own save names exactly the
      // slides the order gives it, which these change.
      const structure = session.structuralChange();
      if (structure) {
        const done = await sendStructure(savingFor, structure);
        if (!done || session.page !== savingFor) return;
      }
      for (;;) {
        if (session.page !== savingFor) return;
        const draft = session.nextDraft();
        if (!draft) return;
        if (session.roomIsReading(draft.index)) {
          scheduleFlush(DECK_PART_POLL_MS);
          return;
        }
        session.sending(draft);
        try {
          const receipt = await apiPut<DeckPartSaveReceipt>(
            `/api/v1/pages/${encodeURIComponent(savingFor)}/document-parts/${draft.index}`,
            { content_json: draft.content, expected_revision: draft.revision },
          );
          offline.current = false;
          if (session.page !== savingFor) return;
          session.landed(draft, typeof receipt?.revision === "number" ? receipt.revision : draft.revision + 1);
        } catch (error) {
          if (session.page !== savingFor) return;
          const code = isApiRequestError(error) ? error.code : undefined;
          const status = isApiRequestError(error) ? error.status : 0;
          if (status === 409 && code === "document_part_conflict" &&
              isApiRequestError(error) && error.details?.reason === "room_conflict") {
            // Someone is typing in the same slide in the part's room: their
            // input is kept there, and this change waits, kept, to be sent
            // again once the room has saved it.
            scheduleFlush(DECK_PART_POLL_MS);
            return;
          }
          if (status === 409 && code === "document_part_conflict") {
            // Saved elsewhere first: both sides kept, merged slide by slide,
            // and saved again on the new revision.
            let fresh;
            try {
              fresh = await readDocumentPart(savingFor, draft.index, { cache: "no-store" });
            } catch {
              scheduleFlush(DECK_PART_RETRY_MS);
              return;
            }
            const merge = session.mergeConflict(draft.index, fresh, optionsRef.current.liveSlides());
            if (!merge) {
              scheduleFlush(DECK_PART_RETRY_MS);
              return;
            }
            optionsRef.current.onMerged(merge, draft.index);
            optionsRef.current.resave();
            return;
          }
          if (status === 409 && code === "deck_part_slide_not_in_part") {
            // The server's order of the part is not the one this change was
            // made for: the body is read again, and the change goes once the
            // order agrees (the body's own save lands it).
            await optionsRef.current.refreshBody().catch(() => undefined);
            optionsRef.current.resave();
            scheduleFlush(DECK_PART_RETRY_MS);
            return;
          }
          if (status === 409 && code === "deck_part_pending") {
            // The part is being read again on the server: the change waits
            // for it and is sent once it is ready.
            scheduleFlush(DECK_PART_POLL_MS);
            return;
          }
          if (status === 400 || status === 422) {
            // Refused for its content (a slide's comment authority not the
            // body's, a part the server does not take): kept, not sent again
            // until it changes, and the reason logged.
            console.warn("[deck-parts] part save refused", { partIndex: draft.index, status, code,
              path: isApiRequestError(error) ? error.details?.path : undefined });
            session.refuse(draft, error instanceof Error ? error.message : String(code ?? status));
            continue;
          }
          if (status === 404) {
            await optionsRef.current.refreshBody().catch(() => undefined);
            scheduleFlush(DECK_PART_RETRY_MS);
            return;
          }
          offline.current = !isApiRequestError(error);
          scheduleFlush(DECK_PART_RETRY_MS);
          return;
        }
      }
    } finally {
      flushing.current = false;
    }
  }, [active, pageId, scheduleFlush, sendStructure, session]);
  flushRef.current = flush;

  const unsaved = snapshot.unsavedParts.join(",");
  const structural = snapshot.version >= 0 && session.structuralChange() !== null;
  useEffect(() => {
    if (!active || (!unsaved && !structural)) return;
    scheduleFlush(DECK_PART_SAVE_DEBOUNCE_MS);
  }, [active, scheduleFlush, structural, unsaved, snapshot.version]);

  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
  }, []);

  // Leaving with a part not yet saved asks first, as any unsaved page does.
  useEffect(() => {
    if (!active || (!unsaved && !structural)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active, structural, unsaved]);

  const loadSlide = useCallback((id: string) => {
    if (!active) return;
    for (const part of session.partsToLoadFor([id])) {
      notBefore.current.delete(part);
      const status = session.status(part);
      if (status !== "failed" && status !== "pending") void read(part);
    }
  }, [active, read, session]);

  const retryPart = useCallback(async (index: number): Promise<DeckPartRetryResult> => {
    if (!active) return "unavailable";
    try {
      await apiPost(`/api/v1/pages/${encodeURIComponent(pageId)}/document-parts/${index}/retry`, {});
    } catch (error) {
      if (isApiRequestError(error) && error.status === 409 && error.code === "deck_part_not_failed") {
        // Not failed (any more): what it is now is read.
        session.setStatus(index, "unknown");
        notBefore.current.delete(index);
        void read(index);
        return "not-failed";
      }
      return "unavailable";
    }
    // Read again on the server: shown as pending until the room (or the
    // poll) says it is written.
    session.setStatus(index, "pending");
    return "retrying";
  }, [active, pageId, read, session]);

  const duplicateNow = useCallback(async (ids: readonly string[], askedFor: string): Promise<DeckDuplicateResult> => {
    // Made on the body's save base, which it moves on when it lands (see
    // sendStructure); a save in flight is waited for.
    let base = ownWriteBase();
    for (let waited = 0; base === null && waited < 50; waited += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      base = ownWriteBase();
    }
    if (base === null) return { ok: false, code: "unsaved", message: "" };
    try {
      const causalBody = base === undefined && Boolean(optionsRef.current.ownServerWriteBase);
      const anchors = session.currentMarker?.order ?? [];
      const send = () => apiPost<DeckSlidesReceipt & { insertedSlideIds?: unknown; rebuiltFromPage?: unknown }>(
        `/api/v1/pages/${encodeURIComponent(askedFor)}/deck-parts/duplicate-slides`,
        causalBody ? { slide_ids: [...ids] }
          : withRoomState({ slide_ids: [...ids], ...(base === undefined ? {} : { expected: { content_version: base } }) }),
      );
      // A slide it copies being typed in, in its part's room: the copy goes
      // again once that room has saved (untilRoomSaved). Another member
      // holding the page's checkout (409 page_locked): the copy waits for it,
      // asked again later and later (1 s, 2, 4 ... 30 s) for up to five
      // minutes, the member told once -- refused at once, the press was lost.
      let receipt: Awaited<ReturnType<typeof send>> | null = null;
      for (let wait = 0, waited = 0; ; ) {
        try {
          receipt = await untilRoomSaved(send, () => session.page === askedFor);
          break;
        } catch (lockError) {
          const locked = isApiRequestError(lockError) && lockError.status === 409 && lockError.code === "page_locked";
          if (!locked || waited >= DECK_PART_LOCK_WAIT_MAX_MS || session.page !== askedFor) throw lockError;
          if (wait === 0) {
            const holder = (lockError.details?.holder as { name?: unknown } | undefined)?.name;
            optionsRef.current.onStructureWaiting?.(typeof holder === "string" && holder ? holder : null);
          }
          wait = Math.min(DECK_PART_LOCK_BACKOFF_MAX_MS, wait === 0 ? 1_000 : wait * 2);
          await new Promise((resolve) => window.setTimeout(resolve, wait));
          waited += wait;
        }
      }
      if (session.page !== askedFor) return { ok: false, code: "unavailable", message: "" };
      adoptOwnWrite(base, receipt);
      takeRoomUpdate(receipt);
      if (base === undefined) await optionsRef.current.settleOwnServerWrite?.().catch(() => undefined);
      const copies = Array.isArray(receipt?.insertedSlideIds)
        ? receipt.insertedSlideIds.filter((id): id is string => typeof id === "string") : [];
      if (receipt?.partRevisions) {
        for (const index of session.applyPartRevisions(receipt.partRevisions)) void read(index);
      }
      await optionsRef.current.refreshBody().catch(() => undefined);
      optionsRef.current.onStructureChanged();
      if (causalBody && copies.length > 0 && optionsRef.current.ownExternalStep) {
        // Undo deletes the copies; Redo restores them where they stood.
        const order = session.currentMarker?.order ?? anchors;
        const restores = deletedRestores(order, copies)
          .map((run) => ({ kind: "insert" as const, after: run.after, ids: run.ids, slides: session.restorableSlides(run.ids) }));
        const step: ExternalHistoryStep = {
          undo: () => {
            void runInverse(askedFor, [{ kind: "delete", ids: copies, guarded: true, expectedWords: receipt?.slideWords }], () => step);
          },
          redo: () => { void runInverse(askedFor, restores, () => step); },
        };
        optionsRef.current.ownExternalStep(step);
      }
      return { ok: true, insertedSlideIds: copies, ...(receipt?.rebuiltFromPage === true ? { rebuiltFromPage: true } : {}) };
    } catch (error) {
      // Still being typed in after the wait: said so, not refused as content.
      if (isDeckRoomConflict(error)) return { ok: false, code: "room_busy", message: "" };
      return {
        ok: false,
        code: (isApiRequestError(error) && error.code) || "unavailable",
        message: error instanceof Error ? error.message : "",
        details: isApiRequestError(error) ? error.details : undefined,
      };
    }
  }, [adoptOwnWrite, ownWriteBase, read, runInverse, session, takeRoomUpdate, withRoomState]);

  /** A server write of a SmartArt command landed: the body's base moved on,
   * its room operations applied (not as a step of the member's room history:
   * its Undo is the server's, `smartArtStructureNow`), the parts it wrote read
   * again, the body read again. */
  const smartArtLanded = useCallback(async (base: number | undefined, receipt: DeckSlidesReceipt | null): Promise<void> => {
    adoptOwnWrite(base, receipt);
    const update = receipt?.roomUpdate?.updateBase64;
    if (typeof update === "string" && update) optionsRef.current.applyRoomUpdate?.(update);
    if (base === undefined) await optionsRef.current.settleOwnServerWrite?.().catch(() => undefined);
    if (receipt?.partRevisions) {
      for (const index of session.applyPartRevisions(receipt.partRevisions)) void read(index);
    }
    await optionsRef.current.refreshBody().catch(() => undefined);
    optionsRef.current.onStructureChanged();
  }, [adoptOwnWrite, read, session]);
  const smartArtWriteBase = useCallback(async (): Promise<number | null | undefined> => {
    let base = ownWriteBase();
    for (let waited = 0; base === null && waited < 50; waited += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      base = ownWriteBase();
    }
    return base;
  }, [ownWriteBase]);
  const smartArtStructureNow = useCallback(async (
    slideId: string, request: unknown, askedFor: string,
  ): Promise<DeckSmartArtStructureResult & { planId?: string }> => {
    const base = await smartArtWriteBase();
    if (base === null) return { ok: false, code: "unsaved", message: "" };
    try {
      const causalBody = base === undefined && Boolean(optionsRef.current.ownServerWriteBase);
      const body = { model_slide_id: slideId, request };
      const send = () => apiPost<DeckSlidesReceipt & { planId?: unknown; selectedBlockId?: unknown; focusPointId?: unknown; undoable?: unknown }>(
        `/api/v1/pages/${encodeURIComponent(askedFor)}/deck-parts/smartart-structure`,
        causalBody ? body : withRoomState(base === undefined ? body : { ...body, expected: { content_version: base } }),
      );
      const receipt = await untilRoomSaved(send, () => session.page === askedFor);
      if (session.page !== askedFor) return { ok: false, code: "unavailable", message: "" };
      await smartArtLanded(base, receipt);
      if (typeof receipt?.selectedBlockId !== "string" || typeof receipt?.focusPointId !== "string") {
        return { ok: false, code: "unavailable", message: "" };
      }
      return {
        ok: true, selectedBlockId: receipt.selectedBlockId, focusPointId: receipt.focusPointId,
        undoable: receipt.undoable === true, ...(typeof receipt.planId === "string" ? { planId: receipt.planId } : {}),
      };
    } catch (error) {
      return deckSmartArtFailure(error);
    }
  }, [session, smartArtLanded, smartArtWriteBase, withRoomState]);
  /** A SmartArt step's Undo or Redo refused: said, and the step forgotten
   * when the deck moved on (it cannot come back), else kept to try again. */
  const smartArtStepRefused = useCallback((code: string, step?: () => ExternalHistoryStep) => {
    optionsRef.current.onStructureUndoRefused?.(code);
    const gone = code === "deck_structure_undo_stale" || code === "deck_structure_undo_unavailable" ||
      DECK_UNDO_CHANGED_ELSEWHERE_CODES.has(code);
    if (step) optionsRef.current.settleExternalStep?.(step(), gone ? "forget" : "putBack");
  }, []);
  const smartArtRestoreNow = useCallback(async (planId: string, askedFor: string, step?: () => ExternalHistoryStep): Promise<boolean> => {
    const base = await smartArtWriteBase();
    if (base === null) {
      smartArtStepRefused("unsaved", step);
      return false;
    }
    try {
      const causalBody = base === undefined && Boolean(optionsRef.current.ownServerWriteBase);
      const body = { plan_id: planId };
      const receipt = await untilRoomSaved(() => apiPost<DeckSlidesReceipt>(
        `/api/v1/pages/${encodeURIComponent(askedFor)}/deck-parts/smartart-structure-restore`,
        causalBody ? body : withRoomState(body),
      ), () => session.page === askedFor);
      if (session.page !== askedFor) return false;
      await smartArtLanded(base, receipt);
      return true;
    } catch (error) {
      smartArtStepRefused(deckSmartArtFailure(error).code, step);
      return false;
    }
  }, [session, smartArtLanded, smartArtStepRefused, smartArtWriteBase, withRoomState]);
  const smartArtStructure = useCallback(async (slideId: string, request: unknown): Promise<DeckSmartArtStructureResult> => {
    if (!active) return { ok: false, code: "unavailable", message: "" };
    const askedFor = pageId;
    // Every change of the parts first: the command is planned on what the server holds.
    for (let waited = 0; waited < 100; waited += 1) {
      if (!flushing.current) {
        await flushRef.current();
        if (!session.hasDrafts() && !session.structuralChange()) break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (session.hasDrafts() || session.structuralChange()) return { ok: false, code: "unsaved", message: "" };
    const begin = optionsRef.current.beginOwnServerWrite;
    const release = begin ? await begin() : undefined;
    if (begin && !release) return { ok: false, code: "unsaved", message: "" };
    try {
      const result = await whileStructureWrites(smartArtStructureNow(slideId, request, askedFor));
      if (result.ok && result.planId && optionsRef.current.ownExternalStep) {
        // Undo: the server writes the deck back as the command found it;
        // Redo: the command again (a new plan, whose Undo is its own).
        let planId = result.planId;
        const step: ExternalHistoryStep = {
          // Said while it runs (`onUndoRunning`): the server may wait for an
          // earlier save's package first, up to a minute on a large deck.
          undo: () => {
            const stopSaying = optionsRef.current.onUndoRunning?.();
            void whileStructureWrites(smartArtRestoreNow(planId, askedFor, () => step).finally(() => stopSaying?.()));
          },
          redo: () => {
            const stopSaying = optionsRef.current.onUndoRunning?.();
            void whileStructureWrites(smartArtStructureNow(slideId, request, askedFor).then((again) => {
              if (again.ok && again.planId) planId = again.planId;
              else smartArtStepRefused(again.ok ? "unavailable" : again.code, () => step);
            }).finally(() => stopSaying?.()));
          },
        };
        optionsRef.current.ownExternalStep(step);
      }
      if (!result.ok) return result;
      return { ok: true, selectedBlockId: result.selectedBlockId, focusPointId: result.focusPointId, undoable: result.undoable };
    } finally {
      release?.();
    }
  }, [active, pageId, session, smartArtRestoreNow, smartArtStepRefused, smartArtStructureNow, whileStructureWrites]);

  const duplicateSlides = useCallback(async (ids: readonly string[]): Promise<DeckDuplicateResult> => {
    if (!active) return { ok: false, code: "unavailable", message: "" };
    const askedFor = pageId;
    // Every change of the parts first: the copy is of what the server holds.
    for (let waited = 0; waited < 100; waited += 1) {
      if (!flushing.current) {
        await flushRef.current();
        if (!session.hasDrafts() && !session.structuralChange()) break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (session.hasDrafts() || session.structuralChange()) return { ok: false, code: "unsaved", message: "" };
    // The body's saves held for the copy (see sendStructure).
    const begin = optionsRef.current.beginOwnServerWrite;
    const release = begin ? await begin() : undefined;
    if (begin && !release) return { ok: false, code: "unsaved", message: "" };
    try {
      return await whileStructureWrites(duplicateNow(ids, askedFor));
    } finally {
      release?.();
    }
  }, [active, duplicateNow, pageId, session, whileStructureWrites]);


  const reimportPart = useCallback(async (index: number): Promise<DeckPartReimportResult> => {
    if (!active) return "unavailable";
    const revision = session.heldRevision(index);
    try {
      await apiPost(
        `/api/v1/pages/${encodeURIComponent(pageId)}/document-parts/${index}/retry`,
        { replace_edited: true, ...(revision !== null ? { expected_revision: revision } : {}) },
      );
    } catch (error) {
      const code = isApiRequestError(error) ? error.code : undefined;
      if (code === "deck_part_not_reimport_needed" || code === "document_part_conflict") {
        // The part moved on (re-imported already, or edited since the member
        // was asked): read as it is now, and asked again if it still needs it.
        await optionsRef.current.refreshBody().catch(() => undefined);
        return code === "deck_part_not_reimport_needed" ? "not-needed" : "changed";
      }
      if (code === "deck_parts_pending") return "pending";
      return "unavailable";
    }
    session.beginReimport(index, optionsRef.current.liveSlides());
    return "reimporting";
  }, [active, pageId, session]);

  // ---- A live room for each loaded later part (the page's own room live).
  const roomsRef = useRef(new Map<number, { partId: string; room: DocumentPartRoom }>());
  const roomsOn = active && options.partRooms === true && options.writable;
  // Each room's ticket seeds it on the server (about 0.3 s of CPU a part, 3 s for
  
  // import is still writing parts only the current slide's part has its room,
  // and a little after it the rest come one at a time; a slide gone to asks for
  // its own at once.
  const roomActivePart = session.partOf(options.slides[options.activeIndex]?.id ?? "");
  const [roomTick, setRoomTick] = useState(0);
  const roomsWerePending = useRef(false);
  const roomsFrom = useRef(0);
  useEffect(() => {
    const rooms = roomsRef.current;
    const close = (index: number) => {
      const held = rooms.get(index);
      if (!held) return;
      session.attachRoom(index, null);
      held.room.destroy();
      rooms.delete(index);
    };
    if (!roomsOn) {
      for (const index of [...rooms.keys()]) close(index);
      session.dropInstalledReads();
      optionsRef.current.onRoomsChanged?.();
      return;
    }
    const wanted = new Map(session.heldParts().filter((part) => part.editable).map((part) => [part.index, part.partId]));
    let changed = false;
    for (const [index, held] of [...rooms]) {
      if (wanted.get(index) !== held.partId) {
        close(index);
        changed = true;
      }
    }
    if (pendingParts) {
      roomsWerePending.current = true;
    } else if (roomsWerePending.current) {
      roomsWerePending.current = false;
      roomsFrom.current = Date.now() + ROOMS_AFTER_IMPORT_MS;
    }
    const wait = roomsFrom.current - Date.now();
    const missing = [...wanted.keys()].filter((index) => !rooms.has(index));
    const opening = missing.filter((index) => index === roomActivePart);
    if (!pendingParts && wait <= 0) {
      const next = missing.find((index) => index !== roomActivePart);
      if (next !== undefined) opening.push(next);
    }
    // The next room opens after the gap, and then only once the person has
    // paused (no key, press, drag or wheel for a moment) and the page is idle:
    // a room's first reading lands as one long task, and opened every 300 ms
    // regardless, they kept a long deck's typing and scrolling stuttering for
    
    // edited, or gone to, still gets its own room at once (above).
    let cancelQuiet: (() => void) | null = null;
    const later = missing.length > opening.length && !pendingParts
      ? window.setTimeout(() => {
        cancelQuiet = requestInputQuietCallback(() => setRoomTick((tick) => tick + 1), ROOM_OPEN_INPUT_QUIET_MS);
      }, Math.max(wait, ROOM_OPEN_GAP_MS))
      : null;
    for (const index of opening) {
      const partId = wanted.get(index) as string;
      const room = new DocumentPartRoom({
        pageId,
        partKey: partId,
        onContent: (content, cause, textChanges) => {
          const current = rooms.get(index);
          if (current?.room !== room) return;
          // Asked first: letters the window still holds go into the room (or the
          // part's draft) now, and what is applied is the room with them.
          const shown = optionsRef.current.liveSlides();
          const held = cause === "reset" || room.accepting ? room.content() : content;
          const liveById = new Map(shown.map((slide) => [slide.id, slide]));
          const slides = session.applyRoomContent(index, held, cause === "reset" ? shown : undefined, (id) => liveById.get(id));
          if (slides && slides.size > 0) optionsRef.current.onRoomSlides?.(slides, index, textChanges);
          // Said to the room only when the window holds what it was handed:
          
          // handed and not taken in was written away by the next publication
          // without a key, measured from the room's content with it).
          if (slides && windowHolds(slides, optionsRef.current.liveSlides())) room.contentApplied();
        },
        confirmsContent: true,
        onHistory: () => optionsRef.current.onRoomsChanged?.(),
        onStatus: () => optionsRef.current.onRoomsChanged?.(),
        onAcknowledged: () => optionsRef.current.onRoomsChanged?.(),
        onRefused: (code) => optionsRef.current.onRoomRefused?.(code),
        onTextMergeRefused: () => optionsRef.current.onTextMergeRefused?.(),
      });
      rooms.set(index, { partId, room });
      session.attachRoom(index, room);
      room.start();
      changed = true;
    }
    if (changed) optionsRef.current.onRoomsChanged?.();
    return () => {
      if (later !== null) window.clearTimeout(later);
      cancelQuiet?.();
    };
  }, [pageId, pendingParts, roomActivePart, roomTick, roomsOn, session, snapshot.version]);
  useEffect(() => () => {
    for (const [index, held] of roomsRef.current) {
      session.attachRoom(index, null);
      held.room.destroy();
    }
    roomsRef.current.clear();
  }, [pageId, session]);
  const rooms = useCallback(() => {
    const out = new Map<number, DocumentPartRoom>();
    for (const [index, held] of roomsRef.current) out.set(index, held.room);
    return out;
  }, []);
  // Leaving with a part room's input not saved yet asks first.
  useEffect(() => {
    if (!roomsOn) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (![...roomsRef.current.values()].some((held) => held.room.unsaved)) return;
      for (const held of roomsRef.current.values()) void held.room.saveNow();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [roomsOn]);

  const structureUnsaved = useCallback(
    () => structureWrite.current !== null || session.structuralChange() !== null, [session]);
  const structureRefused = useCallback(() => refusedStructure.current !== null, []);

  return { snapshot, loadSlide, retryPart, duplicateSlides, smartArtStructure, reimportPart, rooms, whenStructureSettled,
    structureUnsaved, structureRefused };
}
