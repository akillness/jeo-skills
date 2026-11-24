/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";

import type { PageSaveStatus } from "@mrnote/core/web/hooks/useAutosavedPageDocument.ts";
import { mergePageDocumentDelta, type PageContentDocument } from "@mrnote/core/web/hooks/usePageContentSync.ts";
import { duplicatePresentationSlideAt, type DuplicablePresentationSlide } from "@mrnote/core/web/lib/presentation-conveniences.ts";
import {
  AUTH_SESSION_HELD_EVENT,
  AUTH_SESSION_RESTORED_EVENT,
  isAuthSessionHeld,
  registerUnsavedWorkHold,
} from "@mrnote/core/web/lib/unsaved-work-hold.ts";
import {
  autoRecoverPrincipal,
  clearCurrentAutoRecover,
  deleteAutoRecoverCopy,
  flushAutoRecoverWrites,
  listAutoRecoverCopies,
  noteAutoRecoverChange,
  setAsideAutoRecoverCopy,
  type AutoRecoverCopy,
} from "@mrnote/core/web/lib/autorecover-store.ts";
import { openReauthWindow, reauthLoginUrl, watchSessionRestore } from "@mrnote/core/web/lib/session-reauth.ts";

/**
 * A deck's edits that the server does not have yet survive what a window can
 * survive, as a document's and a workbook's do: a lost session holds the tab
 * (lib/api) and the member signs in beside it, and a copy of the slides they
 * changed stays on this device (lib/autorecover-store) for the next open.
 *
 * The copy holds the changed slides with what each was before: a deck is too
 * large to write whole at every change, and only what this member changed may
 * come back over what others have saved since.
 */

type DeckSlide = { readonly id: string; readonly importPending?: boolean };

export interface DeckRecoveredSlide {
  readonly id: string;
  /** The slide before it in the deck when this was kept. */
  readonly after: string | null;
  readonly slide: Record<string, unknown>;
  /** The slide as it stood before this member's edit; null when they made it. */
  readonly base: Record<string, unknown> | null;
}

const RECOVERY_TYPE = "mrnote.presentation.recovery.v1";

/** What a member can see of a slide: its objects' words and places, not what
 * the server's reading of them adds (`source`, receipts). */
export function deckSlideSignature(slide: unknown): string {
  const record = (slide ?? {}) as { hidden?: unknown; blocks?: ReadonlyArray<Record<string, unknown>> };
  return JSON.stringify([record.hidden === true, (record.blocks ?? []).map((block) => [
    block?.id, block?.type, block?.text ?? null, block?.data ?? null, block?.x ?? null, block?.y ?? null,
    block?.width ?? null, block?.height ?? null, block?.src ?? null,
  ])]);
}

/** The slides that differ from what the server was last known to hold. */
export function deckSlidesToKeep(
  live: readonly DeckSlide[],
  base: ReadonlyMap<string, DeckSlide>,
): DeckRecoveredSlide[] {
  const kept: DeckRecoveredSlide[] = [];
  live.forEach((slide, at) => {
    if (slide.importPending === true) return;
    const before = base.get(slide.id);
    if (before === slide) return;
    if (before && before.importPending !== true && deckSlideSignature(before) === deckSlideSignature(slide)) return;
    if (before?.importPending === true) return;
    kept.push({
      id: slide.id,
      after: at > 0 ? live[at - 1].id : null,
      slide: slide as unknown as Record<string, unknown>,
      base: before ? before as unknown as Record<string, unknown> : null,
    });
  });
  return kept;
}

/**
 * The operations a copy's window had made in the deck's room when the copy
 * was written: its author id in the room document and how many operations
 * of its own it held (the state vector's clock for it). `null`: the window
 * had no room (its edits are saved as the page's body). A copy written
 * before copies named them has none (`undefined`).
 */
export interface DeckRecoveredOperations {
  readonly clientId: number;
  readonly clock: number;
}

/** The room document as a window holds it (useAutosavedPageDocument
 * `collaborationOperations`). */
export type DeckRoomOperations = { readonly clientId: number; readonly stateVector: string };

function stateVectorClocks(stateVector: string): Map<number, number> | null {
  try {
    const text = atob(stateVector);
    const bytes = new Uint8Array(text.length);
    for (let at = 0; at < text.length; at += 1) bytes[at] = text.charCodeAt(at);
    return Y.decodeStateVector(bytes);
  } catch {
    return null;
  }
}

/** This window's own operations in its room now; null without a room. */
export function deckOwnOperations(room: DeckRoomOperations | null): DeckRecoveredOperations | null {
  if (!room) return null;
  const clocks = stateVectorClocks(room.stateVector);
  return clocks ? { clientId: room.clientId, clock: clocks.get(room.clientId) ?? 0 } : null;
}

export function recoveredOperationsOf(copy: AutoRecoverCopy): DeckRecoveredOperations | null | undefined {
  const content = copy.payload.content as { type?: unknown; operations?: unknown };
  if (content.type !== RECOVERY_TYPE || !("operations" in content)) return undefined;
  const operations = content.operations as Partial<DeckRecoveredOperations> | null;
  if (operations === null) return null;
  return typeof operations?.clientId === "number" && typeof operations.clock === "number"
    ? { clientId: operations.clientId, clock: operations.clock } : undefined;
}














export function deckCopyIsBack(
  copy: AutoRecoverCopy,
  shownMatches: boolean,
  room: DeckRoomOperations | null,
): boolean | null {
  if (!shownMatches) return false;
  const operations = recoveredOperationsOf(copy);
  if (operations === undefined) return false;
  if (operations === null) return true;
  if (operations.clock <= 0) return false;
  const clocks = room ? stateVectorClocks(room.stateVector) : null;
  if (!clocks) return null;
  return (clocks.get(operations.clientId) ?? 0) >= operations.clock ? true : null;
}

export function recoveredSlidesOf(copy: AutoRecoverCopy): DeckRecoveredSlide[] {
  const content = copy.payload.content as { type?: unknown; slides?: unknown };
  return content.type === RECOVERY_TYPE && Array.isArray(content.slides) ? content.slides as DeckRecoveredSlide[] : [];
}

/** What is the deck's and not a slide's: theme, masters, sections, header and footer,
 * show settings, custom shows, embedded fonts. */
export type DeckLevelFields = Readonly<Record<string, unknown>>;

/** One deck-level field this member changed, with what it was before. */
export interface DeckRecoveredField {
  readonly key: string;
  readonly value: unknown;
  readonly base: unknown;
}

const sameValue = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

/** The deck-level fields that differ from what the server was last known to hold. */
export function deckFieldsToKeep(live: DeckLevelFields, base: DeckLevelFields): DeckRecoveredField[] {
  return Object.keys(live).flatMap((key) => (sameValue(live[key], base[key]) ? [] : [{ key, value: live[key], base: base[key] }]));
}

export function recoveredFieldsOf(copy: AutoRecoverCopy): DeckRecoveredField[] {
  const content = copy.payload.content as { type?: unknown; fields?: unknown };
  return content.type === RECOVERY_TYPE && Array.isArray(content.fields) ? content.fields as DeckRecoveredField[] : [];
}

/**
 * The fields to take from a kept copy. One changed since cannot be kept twice as a
 * slide can, so it stays as it is and is named in `changedSince`, for the member to
 * be told; nobody's change is written over.
 */
export function deckFieldsToRestore(
  live: DeckLevelFields,
  kept: readonly DeckRecoveredField[],
): { readonly take: Record<string, unknown>; readonly changedSince: string[] } {
  const take: Record<string, unknown> = {};
  const changedSince: string[] = [];
  for (const field of kept) {
    if (sameValue(live[field.key], field.value)) continue;
    if (sameValue(live[field.key], field.base)) take[field.key] = field.value;
    else changedSince.push(field.key);
  }
  return { take, changedSince };
}

/**
 * The deck with a kept copy put back. A slide nobody has changed since takes
 * the copy's content; one changed since is kept too, with the copy after it,
 * so neither member's work is written over; one that has gone comes back.
 */
const jsonOf = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The member's changes to a slide (`base` to `restored`) made on the slide as it
 * is now, the way the room merges them: words typed by both are both kept. Null
 * when both changed one thing to different values, or the member changed an
 * object someone has removed: then neither can stand for the other.
 */
function mergeRecoveredSlide(now: DeckSlide, restored: DeckSlide, base: DeckSlide): DeckSlide | null {
  const crossed = (mine: Record<string, unknown>, theirs: Record<string, unknown>, before: Record<string, unknown>, merged: ReadonlySet<string>) =>
    [...new Set([...Object.keys(mine), ...Object.keys(before)])].some((key) => {
      if (merged.has(key)) return false;
      const was = JSON.stringify(before[key] ?? null);
      const want = JSON.stringify(mine[key] ?? null);
      const has = JSON.stringify(theirs[key] ?? null);
      return want !== was && has !== was && has !== want;
    });
  const record = (slide: DeckSlide) => slide as unknown as Record<string, unknown>;
  if (crossed(record(restored), record(now), record(base), new Set(["blocks"]))) return null;
  const blocks = (slide: DeckSlide) => (record(slide).blocks ?? []) as ReadonlyArray<Record<string, unknown>>;
  const before = new Map(blocks(base).map((block) => [block.id, block]));
  const current = new Map(blocks(now).map((block) => [block.id, block]));
  for (const block of blocks(restored)) {
    const was = before.get(block.id);
    if (!was) continue;
    const has = current.get(block.id);
    if (!has) {
      if (JSON.stringify(block) !== JSON.stringify(was)) return null;
      continue;
    }
    if (crossed(block, has, was, new Set(["text", "paragraphs", "runs"]))) return null;
  }
  const merged = mergePageDocumentDelta(
    { slides: [jsonOf(now)] } as unknown as PageContentDocument,
    { slides: [jsonOf(restored)] } as unknown as PageContentDocument,
    { slides: [jsonOf(base)] } as unknown as PageContentDocument,
  ) as unknown as { slides?: DeckSlide[] };
  const slide = merged.slides?.[0];
  return slide && slide.id === now.id ? slide : null;
}

/**
 * The deck with a kept copy's slides back. Each goes where it was; a slide
 * changed since gets the member's changes on top of it. Where those cross
 * someone's, both are kept: the member's as a real copy of the slide beside it.
 * Null when a slide can only be kept as a copy and cannot be copied: nothing is
 * restored and the copy stays.
 */
export function deckWithRecoveredSlides<S extends DeckSlide>(
  live: readonly S[],
  kept: readonly DeckRecoveredSlide[],
  newId: () => string,
): S[] | null {
  const next = [...live];
  for (const entry of kept) {
    const at = next.findIndex((slide) => slide.id === entry.id);
    const restored = entry.slide as unknown as S;
    if (at >= 0) {
      const now = deckSlideSignature(next[at]);
      if (now === deckSlideSignature(restored)) continue;
      if (entry.base && now === deckSlideSignature(entry.base)) {
        next[at] = restored;
        continue;
      }
      const merged = entry.base ? mergeRecoveredSlide(next[at], restored, entry.base as unknown as DeckSlide) : null;
      if (merged) {
        next[at] = merged as S;
        continue;
      }
      // A slide read from a file holds its package's parts: only the deck's own
      // duplicate may copy it, or the save is refused.
      const asCopy = [...next];
      asCopy[at] = restored;
      const copied = duplicatePresentationSlideAt(asCopy as unknown as DuplicablePresentationSlide[], at, newId);
      if (!copied) return null;
      next.splice(at + 1, 0, copied.clone as unknown as S);
      continue;
    }
    const after = entry.after === null ? -1 : next.findIndex((slide) => slide.id === entry.after);
    next.splice(after + 1, 0, restored);
  }
  return next;
}

export interface DeckSaveResilienceOptions<S extends DeckSlide> {
  readonly pageId: string;
  readonly enabled: boolean;
  readonly title: string;
  readonly autosave: {
    readonly saveStatus: PageSaveStatus;
    readonly isDirty?: boolean;
    readonly readOnly?: boolean;
    readonly hasConflict?: boolean;
    readonly loading: boolean;
    readonly page: { readonly id?: string; readonly content_version?: number | null } | null;
    readonly retrySave: () => Promise<unknown>;
    readonly saveNow: () => Promise<unknown>;
    readonly discardLocalAndReload?: () => Promise<unknown>;
  };
  readonly liveSlides: () => readonly S[];
  







  readonly heldSlides?: () => readonly S[];
  readonly liveDeckFields: () => DeckLevelFields;
  /** A later part's room still has this member's typing to deliver. */
  readonly roomsAwaitingServer: () => boolean;
  /** The deck's room as this window holds it (its author id and state
   * vector); null without a room. */
  readonly roomOperations?: () => DeckRoomOperations | null;
}

export function useDeckSaveResilience<S extends DeckSlide>(options: DeckSaveResilienceOptions<S>) {
  const { pageId, enabled, autosave } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [sessionHeld, setSessionHeld] = useState(false);
  const [accountChanged, setAccountChanged] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [offered, setOffered] = useState<AutoRecoverCopy[]>([]);
  const heldPrincipalRef = useRef<string | null>(null);
  const baseRef = useRef<Map<string, S> | null>(null);
  const baseFieldsRef = useRef<DeckLevelFields>({});

  const holdsUnsaved = useCallback(() => {
    const { autosave: view, roomsAwaitingServer } = optionsRef.current;
    return view.saveStatus !== "saved" || view.isDirty === true || view.hasConflict === true || roomsAwaitingServer();
  }, []);

  // ── signed out: hold the tab, sign in beside it ─────────────────────────
  useEffect(() => {
    if (!enabled || !pageId) return undefined;
    return registerUnsavedWorkHold(`presentation:${pageId}`, holdsUnsaved);
  }, [enabled, holdsUnsaved, pageId]);
  useEffect(() => {
    if (!enabled) return undefined;
    const onHeld = () => {
      if (!holdsUnsaved()) return;
      heldPrincipalRef.current = autoRecoverPrincipal();
      setSessionHeld(true);
      void flushAutoRecoverWrites();
    };
    const onRestored = () => setSessionHeld(false);
    window.addEventListener(AUTH_SESSION_HELD_EVENT, onHeld);
    window.addEventListener(AUTH_SESSION_RESTORED_EVENT, onRestored);
    if (isAuthSessionHeld()) onHeld();
    return () => {
      window.removeEventListener(AUTH_SESSION_HELD_EVENT, onHeld);
      window.removeEventListener(AUTH_SESSION_RESTORED_EVENT, onRestored);
    };
  }, [enabled, holdsUnsaved]);
  useEffect(() => {
    if (!sessionHeld) return undefined;
    return watchSessionRestore(() => {
      setSessionHeld(false);
      const before = heldPrincipalRef.current;
      const now = autoRecoverPrincipal();
      if (before && now && before !== now) {
        setAccountChanged(true);
        return;
      }
      const view = optionsRef.current.autosave;
      void view.retrySave().then(() => optionsRef.current.autosave.saveNow()).catch(() => null);
    });
  }, [sessionHeld]);
  const signIn = useCallback(() => setPopupBlocked(!openReauthWindow()), []);

  // ── the copy on this device ─────────────────────────────────────────────
  const buildEntry = useCallback(() => {
    const base = baseRef.current;
    if (!base) return null;
    const { heldSlides, liveSlides } = optionsRef.current;
    const live = (heldSlides ?? liveSlides)();
    const slides = deckSlidesToKeep(live, base);
    const fields = deckFieldsToKeep(optionsRef.current.liveDeckFields(), baseFieldsRef.current);
    if (slides.length === 0 && fields.length === 0) return null;
    const room = optionsRef.current.roomOperations?.() ?? null;
    return {
      payload: {
        content: { type: RECOVERY_TYPE, slides, fields, operations: deckOwnOperations(room) },
        title: optionsRef.current.title,
      },
      baseContentVersion: optionsRef.current.autosave.page?.content_version ?? 0,
      reason: "unsaved" as const,
    };
  }, []);
  /** Call with every edit the window queues to be saved. */
  const noteEdit = useCallback(() => {
    if (!enabled || !pageId) return;
    noteAutoRecoverChange(pageId, buildEntry);
  }, [buildEntry, enabled, pageId]);

  // Open: the copies an earlier session left, once this deck's slides are here.
  const ready = enabled && !autosave.loading && Boolean(autosave.page);
  const readRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || readRef.current === pageId) return undefined;
    readRef.current = pageId;
    let cancelled = false;
    baseRef.current = new Map(optionsRef.current.liveSlides().map((slide) => [slide.id, slide]));
    baseFieldsRef.current = optionsRef.current.liveDeckFields();
    void (async () => {
      const copies = await listAutoRecoverCopies(pageId).catch(() => [] as AutoRecoverCopy[]);
      if (cancelled || copies.length === 0) return;
      // Each copy's slides have to be read to be compared.
      const named = new Set(copies.flatMap((copy) => recoveredSlidesOf(copy).map((entry) => entry.id)));
      for (let waited = 0; waited < 20_000; waited += 500) {
        if (!optionsRef.current.liveSlides().some((slide) => slide.importPending === true && named.has(slide.id))) break;
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        if (cancelled) return;
      }
      const verdicts = (): Array<boolean | null> => {
        const shown = new Map(optionsRef.current.liveSlides().map((slide) => [slide.id, deckSlideSignature(slide)]));
        const fieldsNow = optionsRef.current.liveDeckFields();
        const room = optionsRef.current.roomOperations?.() ?? null;
        return copies.map((copy) => deckCopyIsBack(
          copy,
          recoveredSlidesOf(copy).every((entry) => shown.get(entry.id) === deckSlideSignature(entry.slide)) &&
            recoveredFieldsOf(copy).every((field) => sameValue(fieldsNow[field.key], field.value)),
          room,
        ));
      };
      // A copy whose words are shown waits for the room to tell whether its
      // operations are the server's (the room replays after the page is read).
      let back = verdicts();
      for (let waited = 0; back.includes(null) && waited < 20_000; waited += 500) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        if (cancelled) return;
        back = verdicts();
      }
      const left = copies.filter((copy, at) => {
        if (back[at] === true) void deleteAutoRecoverCopy(pageId, copy.slot);
        return back[at] !== true;
      });
      if (!cancelled && left.length > 0) setOffered(left);
    })();
    return () => { cancelled = true; };
  }, [pageId, ready]);

  // Everything is on the server: what is shown is the new base, and the copy goes.
  const restoredSlotsRef = useRef<string[]>([]);
  // Read-only says "saved" of edits it could only retire: their copy stays.
  const settled = ready && autosave.saveStatus === "saved" && autosave.isDirty !== true && autosave.hasConflict !== true &&
    autosave.readOnly !== true;
  const roomsHolding = enabled && options.roomsAwaitingServer();
  useEffect(() => {
    if (!settled || roomsHolding || !enabled) return;
    const { heldSlides, liveSlides } = optionsRef.current;
    baseRef.current = new Map((heldSlides ?? liveSlides)().map((slide) => [slide.id, slide]));
    baseFieldsRef.current = optionsRef.current.liveDeckFields();
    clearCurrentAutoRecover(pageId);
    // A copy restored is on the server now: until here it was all there was of it
    // (an insert the server refuses leaves it for the next opening).
    for (const slot of restoredSlotsRef.current) void deleteAutoRecoverCopy(pageId, slot);
    restoredSlotsRef.current = [];
  }, [enabled, pageId, roomsHolding, settled]);

  // ── closing ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!holdsUnsaved()) return;
      void flushAutoRecoverWrites();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [enabled, holdsUnsaved]);

  const copyRestored = useCallback((copy: AutoRecoverCopy) => {
    restoredSlotsRef.current = [...restoredSlotsRef.current, copy.slot];
    setOffered((list) => list.filter((entry) => entry.slot !== copy.slot));
  }, []);

  const forgetCopy = useCallback((copy: AutoRecoverCopy) => {
    void deleteAutoRecoverCopy(pageId, copy.slot);
    setOffered((list) => list.filter((entry) => entry.slot !== copy.slot));
  }, [pageId]);

  // ── the conflict notice's Reload ────────────────────────────────────────
  // The slides this member changed are set aside first (offered at the next
  // open, as a workbook's are), then the saved version replaces the window's.
  
  
  // with it.
  const discardForRemote = useCallback(async () => {
    const entry = enabled && pageId ? buildEntry() : null;
    if (entry) {
      await setAsideAutoRecoverCopy(pageId, { ...entry, reason: "discarded-for-remote" }).catch(() => null);
      clearCurrentAutoRecover(pageId);
    }
    await optionsRef.current.autosave.discardLocalAndReload?.();
  }, [buildEntry, enabled, pageId]);

  return { noteEdit, sessionHeld, accountChanged, popupBlocked, signIn, offered, forgetCopy, copyRestored, discardForRemote };
}

export type DeckSaveResilience = ReturnType<typeof useDeckSaveResilience>;

export { reauthLoginUrl };
